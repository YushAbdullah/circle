import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { config } from "./config.js";

/**
 * One interface over the AI providers CIRCLE supports. Order of preference:
 * Claude (paid, best with Manglish), Groq (free, fastest), Gemini (free).
 */
export type ChatMessage = { role: "user" | "assistant"; content: string };
export type Provider = "claude" | "groq" | "gemini";

/**
 * Groq's free tier only accepts about 12k tokens a minute, so long meetings
 * (roughly over 25 minutes of talk) go to Gemini, which takes far more, when its key is set.
 */
const GROQ_MAX_CHARS = 30_000;

export function provider(inputChars = 0): Provider | null {
  if (config.anthropicKey) return "claude";
  if (config.groqKey && (inputChars <= GROQ_MAX_CHARS || !config.geminiKey)) return "groq";
  if (config.geminiKey) return "gemini";
  return null;
}

function tooLongForGroq(e: unknown): Error {
  const msg = e instanceof Error ? e.message : String(e);
  if (/\((413|429)\)|rate_limit|too large|tokens per minute/i.test(msg))
    return new Error(
      "This meeting is too long for Groq's free limit. Add a free GEMINI_API_KEY on Render (it handles long meetings), then tap Try again.",
    );
  return e instanceof Error ? e : new Error(msg);
}

let client: Anthropic | null = null;
const claude = () => (client ??= new Anthropic({ apiKey: config.anthropicKey }));

/** Structured reply matching `schema`. `repair` can patch small gaps before validation. */
export async function aiJson<S extends z.ZodObject>(
  schema: S,
  system: string,
  user: string,
  repair: (v: unknown) => unknown = (v) => v,
): Promise<z.infer<S>> {
  const p = provider(system.length + user.length);
  if (!p) throw new Error("No AI key on the server. Add GROQ_API_KEY (free) on Render.");
  if (p === "claude") return claudeJson(schema, system, user);
  const { $schema: _s, ...jsonSchema } = z.toJSONSchema(schema) as Record<string, unknown>;
  const text =
    p === "groq"
      ? await groqChat(
          `${system}\n\nReply with one JSON object only, matching this JSON schema:\n${JSON.stringify(jsonSchema)}`,
          [{ role: "user", content: user }],
          true,
        ).catch((e) => {
          throw tooLongForGroq(e);
        })
      : await geminiChat(system, [{ role: "user", content: user }], jsonSchema);
  const result = schema.safeParse(repair(safeJson(text)));
  if (!result.success) throw new Error("The AI returned an answer in an unexpected format. Tap Try again.");
  return result.data;
}

/** Plain-text chat reply. */
export async function aiText(system: string, messages: ChatMessage[]): Promise<string> {
  const p = provider(system.length + messages.reduce((t, m) => t + m.content.length, 0));
  if (!p) throw new Error("No AI key on the server. Add GROQ_API_KEY (free) on Render.");
  if (p === "claude") {
    const msg = await claude().messages.create({ model: config.claudeModel, max_tokens: 4000, system, messages });
    if (msg.stop_reason === "refusal") throw new Error("The AI declined to answer that.");
    return msg.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
  }
  if (p === "groq") return (await groqChat(system, messages, false).catch((e) => { throw tooLongForGroq(e); })).trim();
  return (await geminiChat(system, messages)).trim();
}

async function claudeJson<S extends z.ZodObject>(schema: S, system: string, user: string): Promise<z.infer<S>> {
  // Streaming because long meetings produce long outputs. Server-side fallbacks
  // re-run the request on another model if the primary model declines it.
  const stream = claude().beta.messages.stream({
    model: config.claudeModel,
    max_tokens: 64000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: betaZodOutputFormat(schema) },
    system,
    messages: [{ role: "user", content: user }],
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") throw new Error("The AI declined to process this recording.");
  if (msg.stop_reason === "max_tokens") throw new Error("The meeting is too long to process in one pass.");
  if (!msg.parsed_output) throw new Error("The AI returned an answer in an unexpected format.");
  return msg.parsed_output as z.infer<S>;
}

async function timed(name: string, url: string, init: RequestInit, ms: number): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(ms) });
  } catch (e) {
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError"))
      throw new Error(`${name} took too long to answer. Tap Try again in a minute.`);
    throw e;
  }
}

async function groqChat(system: string, messages: ChatMessage[], json: boolean): Promise<string> {
  const res = await timed(
    "Groq",
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.groqKey}` },
      body: JSON.stringify({
        model: config.groqModel,
        temperature: json ? 0.2 : 0.5,
        ...(json ? { response_format: { type: "json_object" } } : {}),
        messages: [{ role: "system", content: system }, ...messages],
      }),
    },
    90_000,
  );
  if (!res.ok) throw new Error(`Groq failed (${res.status}): ${(await res.text()).slice(0, 500)}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string }; finish_reason?: string }[] };
  const choice = data.choices?.[0];
  if (choice?.finish_reason === "length") throw new Error("The meeting is too long to process in one pass.");
  return choice?.message?.content ?? "";
}

async function geminiChat(system: string, messages: ChatMessage[], jsonSchema?: Record<string, unknown>): Promise<string> {
  // If the main model is busy or slow (common on the free tier), try the lighter one.
  const models = [...new Set([config.geminiModel, "gemini-flash-lite-latest"])];
  let lastError: unknown;
  for (const model of models) {
    try {
      return await geminiOnce(model, system, messages, jsonSchema);
    } catch (e) {
      lastError = e;
      console.error(`Gemini ${model}: ${e instanceof Error ? e.message : e}`);
    }
  }
  throw lastError;
}

async function geminiOnce(
  model: string,
  system: string,
  messages: ChatMessage[],
  jsonSchema?: Record<string, unknown>,
): Promise<string> {
  const res = await timed(
    "Gemini",
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": config.geminiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
        ...(jsonSchema ? { generationConfig: { responseMimeType: "application/json", responseJsonSchema: jsonSchema } } : {}),
      }),
    },
    120_000,
  );
  if (!res.ok) throw new Error(`Gemini failed (${res.status}): ${(await res.text()).slice(0, 500)}`);
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
  };
  if (data.promptFeedback?.blockReason) throw new Error(`Gemini declined this (${data.promptFeedback.blockReason}).`);
  const cand = data.candidates?.[0];
  if (cand?.finishReason === "MAX_TOKENS") throw new Error("The meeting is too long to process in one pass.");
  return cand?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // Some models wrap JSON in a code fence.
    const m = text.match(/\{[\s\S]*\}/);
    try {
      return m ? JSON.parse(m[0]) : null;
    } catch {
      return null;
    }
  }
}

/** Fill in missing list and string fields, so a nearly-right reply still parses. */
export function fillDefaults(lists: string[], strings: string[] = []) {
  return (v: unknown): unknown => {
    if (!v || typeof v !== "object") return v;
    const o = v as Record<string, unknown>;
    for (const k of lists) if (!Array.isArray(o[k])) o[k] = [];
    for (const k of strings) if (typeof o[k] !== "string") o[k] = "";
    return o;
  };
}
