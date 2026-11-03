import { Agent, FormData as UFormData, fetch as ufetch } from "undici";
import { config, demoMode } from "./config.js";
import type { Transcript, Utterance } from "./types.js";
import { demoTranscript } from "./demo.js";

/** Word as returned by ElevenLabs Scribe (POST /v1/speech-to-text). */
interface ScribeWord {
  text: string;
  start?: number;
  end?: number;
  type: "word" | "spacing" | "audio_event";
  speaker_id?: string;
}

interface ScribeResponse {
  language_code?: string;
  text: string;
  words?: ScribeWord[];
}

/**
 * Speech-to-text with speaker diarization. Language is auto-detected per file,
 * which copes with Malay/English code-switching better than forcing one language.
 */
export async function transcribe(
  bytes: Buffer,
  mime: string,
  opts: { numSpeakers?: number; extraKeyterms?: string[] } = {},
): Promise<Transcript> {
  if (demoMode()) return demoTranscript;

  const form = new UFormData();
  form.append("model_id", config.sttModel);
  form.append("diarize", "true");
  form.append("timestamps_granularity", "word");
  form.append("tag_audio_events", "true");
  if (opts.numSpeakers) form.append("num_speakers", String(opts.numSpeakers));
  const keyterms = [...config.keyterms, ...(opts.extraKeyterms ?? [])].slice(0, 1000);
  for (const term of keyterms) form.append("keyterms", term);

  form.append("file", new Blob([new Uint8Array(bytes)], { type: mime }), "audio");

  // Long meetings (2h+) can take several minutes; Node's default fetch gives up after 5.
  const res = await ufetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": config.elevenLabsKey },
    body: form,
    dispatcher: longRequests,
  });
  if (!res.ok) {
    throw new Error(`Speech-to-text failed (${res.status}): ${(await res.text()).slice(0, 500)}`);
  }
  const data = (await res.json()) as ScribeResponse;
  return { languageCode: data.language_code ?? null, utterances: groupWords(data.words ?? [], data.text) };
}

const longRequests = new Agent({ headersTimeout: 30 * 60_000, bodyTimeout: 30 * 60_000, connectTimeout: 60_000 });

/** Merge word-level output into speaker turns. */
export function groupWords(words: ScribeWord[], fallbackText = ""): Utterance[] {
  const out: Utterance[] = [];
  for (const w of words) {
    if (w.type === "audio_event") continue;
    const speaker = w.speaker_id ?? "speaker_0";
    const last = out[out.length - 1];
    if (last && last.speaker === speaker) {
      last.text += w.text;
      if (w.end != null) last.end = w.end;
    } else if (w.type === "word") {
      out.push({ speaker, start: w.start ?? 0, end: w.end ?? w.start ?? 0, text: w.text });
    }
  }
  for (const u of out) u.text = u.text.replace(/\s+/g, " ").trim();
  const result = out.filter((u) => u.text.length > 0);
  if (result.length === 0 && fallbackText.trim()) {
    return [{ speaker: "speaker_0", start: 0, end: 0, text: fallbackText.trim() }];
  }
  return result;
}
