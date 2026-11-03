import path from "node:path";

export const config = {
  port: Number(process.env.PORT ?? 4000),
  // Shared secret the phone app sends as "Authorization: Bearer <token>".
  appToken: process.env.APP_TOKEN ?? "",
  dataDir: path.resolve(process.env.DATA_DIR ?? "./data"),
  elevenLabsKey: process.env.ELEVENLABS_API_KEY ?? "",
  sttModel: process.env.STT_MODEL ?? "scribe_v2",
  // Live captions: main language plus extra languages expected in the same meeting.
  liveLanguage: process.env.LIVE_LANGUAGE ?? "ms",
  liveSecondaryLanguages: (process.env.LIVE_SECONDARY_LANGUAGES ?? "en")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean),
  // Optional cloud storage (free tier works). Without these, files go in DATA_DIR.
  supabaseUrl: normalizeSupabaseUrl(process.env.SUPABASE_URL ?? ""),
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY ?? "",
  supabaseBucket: process.env.SUPABASE_BUCKET ?? "circle",
  anthropicKey: process.env.ANTHROPIC_API_KEY ?? "",
  claudeModel: process.env.CLAUDE_MODEL ?? "claude-opus-5-5",
  // Free alternative for the report: Google Gemini (key from aistudio.google.com/apikey).
  geminiKey: process.env.GEMINI_API_KEY ?? "",
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-flash-latest",
  // Fastest free option for the report: Groq (key from console.groq.com/keys).
  groqKey: process.env.GROQ_API_KEY ?? "",
  groqModel: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
  // Voice replies from the "Ask CIRCLE" assistant (ElevenLabs text-to-speech, same key as transcription).
  ttsVoiceId: process.env.TTS_VOICE_ID ?? "JBFqnCBsd6RMkjVDRZzb",
  ttsModel: process.env.TTS_MODEL ?? "eleven_flash_v2_5",
  // Comma-separated words the STT engine should listen for (names, slang, company terms).
  keyterms: (process.env.KEYTERMS ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean),
};

/** Demo mode runs the whole flow without paid APIs, using a sample Manglish meeting. */
/** Demo mode: no transcription key, so the sample Manglish meeting is used throughout. */
export const demoMode = () => !config.elevenLabsKey;
/** Real transcripts but no AI key (Claude, Groq or Gemini): transcript only, no AI report. */
export const transcriptOnly = () =>
  !!config.elevenLabsKey && !config.anthropicKey && !config.groqKey && !config.geminiKey;

/**
 * Accept the Supabase address in the forms people tend to paste: the project URL,
 * an API URL with a path (…/rest/v1/), or the dashboard link (…/dashboard/project/<ref>).
 */
export function normalizeSupabaseUrl(raw: string): string {
  const v = raw.trim();
  if (!v) return "";
  const ref = v.match(/supabase\.com\/dashboard\/project\/([a-z0-9]+)/i)?.[1];
  if (ref) return `https://${ref}.supabase.co`;
  if (/^[a-z0-9]{15,}$/i.test(v)) return `https://${v}.supabase.co`;
  try {
    return new URL(v.includes("://") ? v : `https://${v}`).origin;
  } catch {
    return v;
  }
}
