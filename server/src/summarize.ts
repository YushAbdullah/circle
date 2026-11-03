import { z } from "zod";
import { config, demoMode, transcriptOnly } from "./config.js";
import { demoReport } from "./demo.js";
import { aiJson, fillDefaults } from "./llm.js";
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
  recommendations: z
    .array(z.string())
    .describe("2-5 practical recommendations for the team: next steps, risks to watch, open questions to settle"),
  corrections: z
    .array(z.object({ index: z.number().int(), text: z.string() }))
    .describe("Only the utterances whose text you corrected, by index, with the full corrected text"),
});

const SYSTEM = `You turn raw meeting transcripts into clean records and reports for a Malaysian team.

The transcript comes from automatic speech recognition with speaker labels. Speakers code-switch between Malay, English and Manglish, and may use state dialects (e.g. Kelantan, Terengganu, Sabah, Sarawak, Negeri Sembilan), Chinese or Tamil loanwords, and slang ("lah", "kan", "jom", "alamak", "can or not", "tapau", "boleh tahan").

1. Corrections: fix words the recogniser clearly misheard, using context and your knowledge of Malaysian speech. Keep the speaker's original language mix and particles; do not translate or formalise what they said. Only return utterances you changed, at most 150, the most important first.
2. Report: write the summary, key points, decisions and action items in clear English, so readers who missed the meeting understand it. Assign an owner and due date to an action item only when the transcript supports it; otherwise use "Unassigned" or "Not set".
3. Glossary: list slang, dialect words and abbreviations a non-local reader might not know.
4. Recommendations: as a sharp advisor, suggest concrete next steps, risks and open questions the team should follow up on, grounded in what was said.

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

  const parsed = await aiJson(ReportSchema, SYSTEM, userText, repairReport);

  const cleaned = transcript.utterances.map((u) => ({ ...u }));
  for (const c of parsed.corrections) {
    if (cleaned[c.index]) cleaned[c.index].text = c.text;
  }
  const { corrections: _unused, ...rest } = parsed;
  return { ...rest, cleanedUtterances: cleaned };
}

const repairReport = fillDefaults(
  ["languages", "keyPoints", "decisions", "actionItems", "speakerNames", "glossary", "corrections", "recommendations"],
  ["title", "summary"],
);

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
    recommendations: [],
    cleanedUtterances: transcript.utterances,
  };
}
