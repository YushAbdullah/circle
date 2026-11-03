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
  supabaseUrl: process.env.SUPABASE_URL ?? "",
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY ?? "",
  supabaseBucket: process.env.SUPABASE_BUCKET ?? "circle",
  anthropicKey: process.env.ANTHROPIC_API_KEY ?? "",
  claudeModel: process.env.CLAUDE_MODEL ?? "claude-opus-5-5",
  // Comma-separated words the STT engine should listen for (names, slang, company terms).
  keyterms: (process.env.KEYTERMS ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean),
};

/** Demo mode runs the whole flow without paid APIs, using a sample Manglish meeting. */
/** Demo mode: no transcription key, so the sample Manglish meeting is used throughout. */
export const demoMode = () => !config.elevenLabsKey;
/** Real transcripts but no Claude key: transcript only, no AI report. */
export const transcriptOnly = () => !!config.elevenLabsKey && !config.anthropicKey;
