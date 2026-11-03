import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { config, demoMode, transcriptOnly } from "./config.js";
import { demoReport } from "./demo.js";
import type { Report, Transcript } from "./types.js";

const ReportSchema = z.object({
  title: z.string().describe("Short meeting title, in English"),
  languages: z.array(z.string()).describe("Languages/dialects heard, e.g. Malay, English, Manglish, Kelantanese"),
  summary: z.string().describe("3-6 sentence summary in plain English"),
  keyPoints: z.array(z.string()),
  decisions: z.array(z.string()),
  actionItems: z.array(z.object({ owner: z.string(), task: z.string(), due: z.string() })),
  speakerNames: z
    .array(z.object({ speaker: z.string(), name: z.string() }))
    .describe("Best guess of each speaker id's name or role from context; use 'Speaker N' if unknown"),
  glossary: z
    .array(z.object({ term: z.string(), meaning: z.string() }))
    .describe("Slang, dialect words and abbreviations used, with English meaning"),
  corrections: z
    .array(z.object({ index: z.number().int(), text: z.string() }))
    .describe("Only the utterances whose text you corrected, by index, with the full corrected text"),
});

const SYSTEM = `You turn raw meeting transcripts into clean records and reports for a Malaysian team.

The transcript comes from automatic speech recognition with speaker labels. Speakers code-switch between Malay, English and Manglish, and may use state dialects (e.g. Kelantan, Terengganu, Sabah, Sarawak, Negeri Sembilan), Chinese or Tamil loanwords, and slang ("lah", "kan", "jom", "alamak", "can or not", "tapau", "boleh tahan").

1. Corrections: fix words the recogniser clearly misheard, using context and your knowledge of Malaysian speech. Keep the speaker's original language mix and particles; do not translate or formalise what they said. Only return utterances you changed.
2. Report: write the summary, key points, decisions and action items in clear English, so readers who missed the meeting understand it. Assign an owner and due date to an action item only when the transcript supports it; otherwise use "Unassigned" or "Not set".
3. Glossary: list slang, dialect words and abbreviations a non-local reader might not know.

The user may also list their own vocabulary (names, company terms). Prefer those spellings.`;

export function formatTranscript(t: Transcript, names: Record<string, string> = {}): string {
  return t.utterances
    .map((u, i) => `[${i}] ${names[u.speaker] ?? u.speaker} (${fmtTime(u.start)}): ${u.text}`)
    .join("\n");
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

let client: Anthropic | null = null;

export async function summarize(
  transcript: Transcript,
  opts: { vocabulary?: string[]; speakerNames?: Record<string, string> } = {},
): Promise<Report> {
  if (demoMode()) return demoReport;
  if (transcriptOnly()) return transcriptOnlyReport(transcript);
  const vocab = [...config.keyterms, ...(opts.vocabulary ?? [])];
  const userText =
    (vocab.length ? `Vocabulary: ${vocab.join(", ")}\n\n` : "") +
    `Transcript (detected language: ${transcript.languageCode ?? "unknown"}):\n\n${formatTranscript(transcript, opts.speakerNames)}`;

  const parsed = config.anthropicKey
    ? await withClaude(userText)
    : config.groqKey
      ? await withGroq(userText)
      : await withGemini(userText);

  const cleaned = transcript.utterances.map((u) => ({ ...u }));
  for (const c of parsed.corrections) {
    if (cleaned[c.index]) cleaned[c.index].text = c.text;
  }
  const { corrections: _unused, ...rest } = parsed;
  return { ...rest, cleanedUtterances: cleaned };
}

async function withClaude(userText: string): Promise<z.infer<typeof ReportSchema>> {
  client ??= new Anthropic({ apiKey: config.anthropicKey });
  // Streaming because long meetings produce long outputs. Server-side fallbacks
  // re-run the request on another model if the primary model declines it.
  const stream = client.beta.messages.stream({
    model: config.claudeModel,
    max_tokens: 64000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: betaZodOutputFormat(ReportSchema) },
    system: SYSTEM,
    messages: [{ role: "user", content: userText }],
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") throw new Error("The AI declined to summarise this recording.");
  if (msg.stop_reason === "max_tokens") throw new Error("The meeting is too long to summarise in one pass.");
  if (!msg.parsed_output) throw new Error("The AI returned a report in an unexpected format.");
  return msg.parsed_output;
}

/** Groq's free tier (OpenAI-compatible API, very fast). The schema goes in the prompt; JSON mode keeps the reply parseable. */
async function withGroq(userText: string): Promise<z.infer<typeof ReportSchema>> {
  const { $schema: _s, ...schema } = z.toJSONSchema(ReportSchema) as Record<string, unknown>;
  let res: Response;
  try {
    res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.groqKey}` },
      body: JSON.stringify({
        model: config.groqModel,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `${SYSTEM}\n\nReply with one JSON object only, matching this JSON schema:\n${JSON.stringify(schema)}`,
          },
          { role: "user", content: userText },
        ],
      }),
      signal: AbortSignal.timeout(90_000),
    });
  } catch (e) {
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError"))
      throw new Error("Groq took too long to answer. Tap Try again in a minute.");
    throw e;
  }
  if (!res.ok) throw new Error(`Groq failed (${res.status}): ${(await res.text()).slice(0, 500)}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string }; finish_reason?: string }[] };
  const choice = data.choices?.[0];
  if (choice?.finish_reason === "length") throw new Error("The meeting is too long to summarise in one pass.");
  const result = ReportSchema.safeParse(withDefaults(safeJson(choice?.message?.content ?? "")));
  if (!result.success) throw new Error("The AI returned a report in an unexpected format. Tap Try again.");
  return result.data;
}

/** Fill in empty lists a model left out, so a nearly-right reply still parses. */
function withDefaults(v: unknown): unknown {
  if (!v || typeof v !== "object") return v;
  const o = v as Record<string, unknown>;
  for (const k of ["languages", "keyPoints", "decisions", "actionItems", "speakerNames", "glossary", "corrections"])
    if (!Array.isArray(o[k])) o[k] = [];
  for (const k of ["title", "summary"]) if (typeof o[k] !== "string") o[k] = "";
  return o;
}

/** Google Gemini's free tier, via its REST API with a JSON schema for the reply. */
async function withGemini(userText: string): Promise<z.infer<typeof ReportSchema>> {
  // If the main model is busy or slow (common on the free tier), try the lighter one.
  const models = [...new Set([config.geminiModel, "gemini-flash-lite-latest"])];
  let lastError: unknown;
  for (const model of models) {
    try {
      return await callGemini(model, userText);
    } catch (e) {
      lastError = e;
      console.error(`Gemini ${model}: ${e instanceof Error ? e.message : e}`);
    }
  }
  throw lastError;
}

async function callGemini(model: string, userText: string): Promise<z.infer<typeof ReportSchema>> {
  const { $schema: _s, ...schema } = z.toJSONSchema(ReportSchema) as Record<string, unknown>;
  let res: Response;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": config.geminiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents: [{ role: "user", parts: [{ text: userText }] }],
          generationConfig: { responseMimeType: "application/json", responseJsonSchema: schema },
        }),
        signal: AbortSignal.timeout(120_000),
      },
    );
  } catch (e) {
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError"))
      throw new Error("Gemini took too long to answer. Tap Try again in a minute.");
    throw e;
  }
  if (!res.ok) throw new Error(`Gemini failed (${res.status}): ${(await res.text()).slice(0, 500)}`);
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
  };
  if (data.promptFeedback?.blockReason) throw new Error(`Gemini declined this recording (${data.promptFeedback.blockReason}).`);
  const cand = data.candidates?.[0];
  if (cand?.finishReason === "MAX_TOKENS") throw new Error("The meeting is too long to summarise in one pass.");
  const text = cand?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  const result = ReportSchema.safeParse(safeJson(text));
  if (!result.success) throw new Error("The AI returned a report in an unexpected format.");
  return result.data;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Used when no AI key is set: keeps the real transcript, explains the missing report. */
function transcriptOnlyReport(transcript: Transcript): Report {
  return {
    title: "",
    languages: [],
    summary: "The transcript is ready. Add a free GROQ_API_KEY or GEMINI_API_KEY (or an ANTHROPIC_API_KEY) on the server to get the AI summary, decisions and action items.",
    keyPoints: [],
    decisions: [],
    actionItems: [],
    speakerNames: [],
    glossary: [],
    cleanedUtterances: transcript.utterances,
  };
}
