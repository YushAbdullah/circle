import { z } from "zod";
import { config, demoMode } from "./config.js";
import { aiJson, aiText, fillDefaults, provider, type ChatMessage } from "./llm.js";
import { formatTranscript } from "./summarize.js";
import type { Meeting, Translation } from "./types.js";

/** Keep the context within what free-tier models accept (roughly 25k tokens of transcript). */
const MAX_TRANSCRIPT_CHARS = 100_000;

function meetingContext(m: Meeting): string {
  const r = m.report;
  const utterances = r?.cleanedUtterances ?? m.transcript?.utterances ?? [];
  let transcript = formatTranscript({ languageCode: null, utterances }, m.speakerNames);
  if (transcript.length > MAX_TRANSCRIPT_CHARS) transcript = transcript.slice(0, MAX_TRANSCRIPT_CHARS) + "\n[…transcript cut for length]";
  const parts = [
    `Meeting: ${m.title} (${new Date(m.createdAt).toDateString()})`,
    r?.summary ? `Summary: ${r.summary}` : "",
    r?.keyPoints.length ? `Key points:\n${r.keyPoints.map((p) => `- ${p}`).join("\n")}` : "",
    r?.decisions.length ? `Decisions:\n${r.decisions.map((p) => `- ${p}`).join("\n")}` : "",
    r?.actionItems.length ? `Action items:\n${r.actionItems.map((a) => `- ${a.task} (${a.owner}, ${a.due})`).join("\n")}` : "",
    `Transcript:\n${transcript}`,
  ];
  return parts.filter(Boolean).join("\n\n");
}

const CHAT_SYSTEM = `You are CIXCLE, a friendly, sharp meeting assistant for a Malaysian team. The user just had the meeting below and is talking to you about it, often by voice.

- Answer from the meeting content. If something was not discussed, say so, then give your best advice anyway.
- When asked for recommendations, give concrete, prioritised next steps, risks and questions to settle.
- Reply in the language the user writes in (English, Malay or Manglish are all fine).
- Keep replies short and conversational (under about 120 words) because they may be read aloud. No markdown tables or headings; simple sentences or a short list.`;

export async function chat(m: Meeting, messages: ChatMessage[]): Promise<string> {
  if (!provider()) {
    if (demoMode()) return "This is demo mode. Add an AI key on the server (GROQ_API_KEY is free) and I can discuss your meetings.";
    throw new Error("No AI key on the server. Add GROQ_API_KEY (free) on Render.");
  }
  const history = messages.slice(-12).map((x) => ({ role: x.role, content: String(x.content).slice(0, 4000) }));
  return aiText(`${CHAT_SYSTEM}\n\n=== MEETING ===\n${meetingContext(m)}`, history);
}

const TranslationSchema = z.object({
  summary: z.string(),
  keyPoints: z.array(z.string()),
  decisions: z.array(z.string()),
  recommendations: z.array(z.string()),
  actionItems: z.array(z.string()).describe("Each action item's task, translated, same order"),
  utterances: z.array(z.object({ index: z.number().int(), text: z.string() })).describe("Every utterance, by index, translated"),
});

const longMeeting = (u: { text: string }[]) => u.reduce((t, x) => t + x.text.length, 0) > 40_000;

export async function translate(m: Meeting, language: string): Promise<Translation> {
  const r = m.report;
  const utterances = r?.cleanedUtterances ?? m.transcript?.utterances ?? [];
  const source = {
    summary: r?.summary ?? "",
    keyPoints: r?.keyPoints ?? [],
    decisions: r?.decisions ?? [],
    recommendations: r?.recommendations ?? [],
    actionItems: (r?.actionItems ?? []).map((a) => a.task),
    // Very long meetings: translate the report only; the reply would be too long otherwise.
    utterances: longMeeting(utterances) ? [] : utterances.map((u, index) => ({ index, text: u.text })),
  };
  const system = `Translate a Malaysian meeting record into natural, clear ${language}. The source mixes Malay, English, Manglish, dialect and slang; translate the meaning so someone who does not speak those understands it. Keep names, numbers and company terms as they are. Keep list lengths and order exactly the same, and return every utterance by its index.`;
  const out = await aiJson(
    TranslationSchema,
    system,
    JSON.stringify(source),
    fillDefaults(["keyPoints", "decisions", "recommendations", "actionItems", "utterances"], ["summary"]),
  );
  const byIndex = new Map(out.utterances.map((u) => [u.index, u.text]));
  return {
    language,
    summary: out.summary,
    keyPoints: out.keyPoints,
    decisions: out.decisions,
    recommendations: out.recommendations,
    actionItems: out.actionItems,
    utterances: utterances.map((u, i) => byIndex.get(i) ?? u.text),
  };
}

/** Speak a reply with ElevenLabs text-to-speech. Returns MP3 bytes. */
export async function speak(text: string): Promise<Buffer> {
  if (demoMode()) throw new Error("Voice replies need ELEVENLABS_API_KEY on the server.");
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(config.ttsVoiceId)}?output_format=mp3_44100_64`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "xi-api-key": config.elevenLabsKey, Accept: "audio/mpeg" },
      body: JSON.stringify({ text: text.slice(0, 2500), model_id: config.ttsModel }),
      signal: AbortSignal.timeout(60_000),
    },
  );
  if (!res.ok) throw new Error(`Voice reply failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Transcribe a short spoken question (no speaker labels needed). */
export async function transcribeQuestion(bytes: Buffer, mime: string): Promise<string> {
  if (demoMode()) return "What should I do next?";
  const form = new FormData();
  form.append("model_id", config.sttModel);
  form.append("file", new Blob([new Uint8Array(bytes)], { type: mime }), "question");
  const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": config.elevenLabsKey },
    body: form,
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Could not hear the question (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { text?: string };
  return (data.text ?? "").trim();
}
