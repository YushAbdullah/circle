import express, { type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config, demoMode, transcriptOnly } from "./config.js";
import { deleteMeeting, getMeeting, listMeetings, loadMeetings, saveMeeting, updateMeeting } from "./db.js";
import { store, uploadTmpDir } from "./storage.js";
import { compressAudio } from "./media.js";
import { processMeeting } from "./pipeline.js";
import { attachLive } from "./live.js";
import { chat, speak, transcribeQuestion, translate } from "./assistant.js";
import type { Meeting } from "./types.js";

const app = express();
app.use(express.json());

// Allow the web build of the app (used for testing) to call the API.
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, demoMode: demoMode(), transcriptOnly: transcriptOnly(), storage: store.kind, storageError });
});

// Every other route needs the shared app token (when one is configured).
app.use((req: Request, res: Response, next: NextFunction) => {
  if (!config.appToken) return next();
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : String(req.query.token ?? "");
  const a = Buffer.from(token);
  const b = Buffer.from(config.appToken);
  if (a.length === b.length && crypto.timingSafeEqual(a, b)) return next();
  res.status(401).json({ error: "Unauthorized" });
});

const upload = multer({ dest: uploadTmpDir, limits: { fileSize: 1024 * 1024 * 1024 } });

const MIME_BY_EXT: Record<string, string> = {
  ".m4a": "audio/mp4",
  ".mp4": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".webm": "audio/webm",
  ".caf": "audio/x-caf",
};

function guessMime(reported: string | undefined, ext: string): string {
  if (reported && reported !== "application/octet-stream") return reported;
  return MIME_BY_EXT[ext.toLowerCase()] ?? "audio/mp4";
}

/** Summary view for the list screen (no transcript body). */
function listItem(m: Meeting) {
  return {
    id: m.id,
    title: m.title,
    createdAt: m.createdAt,
    durationSec: m.durationSec,
    status: m.status,
    error: m.error,
    summary: m.report?.summary ?? null,
    languages: m.report?.languages ?? [],
    actionCount: m.report?.actionItems.length ?? 0,
    audioDeleted: !!m.audioDeleted,
  };
}

app.get("/meetings", (_req, res) => {
  res.json(listMeetings().map(listItem));
});

app.post("/meetings", upload.single("audio"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "Attach the recording as the 'audio' field." });
    return;
  }
  const id = crypto.randomUUID();
  let ext = path.extname(req.file.originalname || "") || ".m4a";
  let mime = guessMime(req.file.mimetype, ext);
  let audioPath = req.file.path;
  try {
    // Shrink large recordings (e.g. WAV from live mode) before storing.
    const compressed = await compressAudio(req.file.path);
    if (compressed) ({ path: audioPath, mime, ext } = compressed);
    const audioFile = `${id}${ext}`;
    await store.put(`audio/${audioFile}`, await fs.promises.readFile(audioPath), mime);
    res.locals.audioFile = audioFile;
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Could not save the recording." });
    return;
  } finally {
    await fs.promises.unlink(req.file.path).catch(() => {});
    if (audioPath !== req.file.path) await fs.promises.unlink(audioPath).catch(() => {});
  }
  const audioFile = res.locals.audioFile as string;

  const createdAt = new Date().toISOString();
  const title = String(req.body.title || "").trim() || `Meeting ${createdAt.slice(0, 16).replace("T", " ")}`;
  const durationSec = req.body.durationSec ? Number(req.body.durationSec) : null;
  const meeting: Meeting = {
    id,
    title,
    createdAt,
    durationSec,
    status: "uploaded",
    error: null,
    audioFile,
    audioMime: mime,
    transcript: null,
    report: null,
    liveText: typeof req.body.liveText === "string" && req.body.liveText.trim() ? req.body.liveText.trim() : null,
    speakerNames: {},
  };
  await saveMeeting(meeting);

  const numSpeakers = req.body.numSpeakers ? Number(req.body.numSpeakers) : undefined;
  const vocabulary = String(req.body.vocabulary ?? "")
    .split(",")
    .map((s: string) => s.trim())
    .filter(Boolean);
  void processMeeting(id, { numSpeakers, vocabulary });

  res.status(201).json(listItem(meeting));
});

app.get("/meetings/:id", (req, res) => {
  const m = getMeeting(req.params.id);
  if (!m) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(m);
});

app.get("/meetings/:id/audio", async (req, res) => {
  const m = getMeeting(req.params.id);
  if (!m) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (m.audioDeleted) {
    res.status(404).json({ error: "The recording was deleted." });
    return;
  }
  await store.stream(`audio/${m.audioFile}`, m.audioMime, req, res);
});

// Delete only the recording; keep the transcript and report.
app.delete("/meetings/:id/audio", async (req, res) => {
  const m = getMeeting(req.params.id);
  if (!m) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  await store.remove(`audio/${m.audioFile}`);
  res.json(await updateMeeting(m.id, { audioDeleted: true }));
});

/** Run a handler and turn failures into a JSON error the app can show. */
const safe =
  (fn: (req: Request, res: Response) => Promise<void>) =>
  async (req: Request, res: Response) => {
    try {
      await fn(req, res);
    } catch (e) {
      console.error(`${req.method} ${req.path} failed`, e);
      if (!res.headersSent) res.status(502).json({ error: e instanceof Error ? e.message : String(e) });
    }
  };

// Ask CIRCLE: chat about a meeting. Body: { messages: [{ role: "user" | "assistant", content }] }
app.post(
  "/meetings/:id/chat",
  safe(async (req, res) => {
    const m = getMeeting(String(req.params.id));
    if (!m) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const clean = messages
      .filter((x: { role?: string; content?: unknown }) => (x.role === "user" || x.role === "assistant") && typeof x.content === "string")
      .map((x: { role: "user" | "assistant"; content: string }) => ({ role: x.role, content: x.content }));
    if (!clean.length || clean[clean.length - 1].role !== "user") {
      res.status(400).json({ error: "Send at least one user message." });
      return;
    }
    res.json({ reply: await chat(m, clean) });
  }),
);

// Spoken question -> text, so the app can send it to /chat.
const questionUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
app.post(
  "/transcribe",
  questionUpload.single("audio"),
  safe(async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "Attach the question as the 'audio' field." });
      return;
    }
    const ext = path.extname(req.file.originalname || "") || ".m4a";
    res.json({ text: await transcribeQuestion(req.file.buffer, guessMime(req.file.mimetype, ext)) });
  }),
);

// Read a reply aloud: GET /tts?text=... returns MP3.
app.get(
  "/tts",
  safe(async (req, res) => {
    const text = String(req.query.text ?? "").trim();
    if (!text) {
      res.status(400).json({ error: "Missing text." });
      return;
    }
    const mp3 = await speak(text);
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", String(mp3.length));
    res.end(mp3);
  }),
);

// Translate the report and conversation. Body: { language: "English" }. Cached per language.
app.post(
  "/meetings/:id/translate",
  safe(async (req, res) => {
    const m = getMeeting(String(req.params.id));
    if (!m) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const language = String(req.body?.language ?? "").trim().slice(0, 40);
    if (!language) {
      res.status(400).json({ error: "Choose a language." });
      return;
    }
    const cached = m.translations?.[language];
    if (cached && !req.body?.refresh) {
      res.json(cached);
      return;
    }
    const t = await translate(m, language);
    await updateMeeting(m.id, { translations: { ...(m.translations ?? {}), [language]: t } });
    res.json(t);
  }),
);

// Rename the meeting or its speakers, e.g. { speakerNames: { speaker_0: "Yusri" } }
app.patch("/meetings/:id", async (req, res) => {
  const m = getMeeting(req.params.id);
  if (!m) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const patch: Partial<Meeting> = {};
  if (typeof req.body.title === "string" && req.body.title.trim()) patch.title = req.body.title.trim();
  if (req.body.speakerNames && typeof req.body.speakerNames === "object") {
    patch.speakerNames = { ...m.speakerNames, ...req.body.speakerNames };
  }
  res.json(await updateMeeting(m.id, patch));
});

// Re-run the AI report (e.g. after renaming speakers). Keeps the existing transcript.
app.post("/meetings/:id/reprocess", (req, res) => {
  const m = getMeeting(req.params.id);
  if (!m) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  void processMeeting(m.id);
  res.json({ ok: true });
});

app.delete("/meetings/:id", async (req, res) => {
  const m = getMeeting(req.params.id);
  if (m) {
    await store.remove(`audio/${m.audioFile}`);
    await deleteMeeting(m.id);
  }
  res.status(204).end();
});

// Open the port first so the host sees the server, even if storage is misconfigured.
let storageError: string | null = null;
loadMeetings().catch((e: unknown) => {
  storageError = e instanceof Error ? e.message : String(e);
  console.error(`Storage problem: ${storageError}`);
});
const server = app.listen(config.port, "0.0.0.0", () => {
  const mode = demoMode() ? " (demo mode: no ElevenLabs key)" : transcriptOnly() ? " (transcripts only: no AI key)" : "";
  console.log(`CIRCLE server on http://localhost:${config.port}${mode}, storage: ${store.kind}`);
});
attachLive(server);
