import express, { type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config, demoMode } from "./config.js";
import { deleteMeeting, getMeeting, listMeetings, saveMeeting, updateMeeting } from "./db.js";
import { audioPath, removeAudio, storeAudio, uploadTmpDir } from "./storage.js";
import { processMeeting } from "./pipeline.js";
import { attachLive } from "./live.js";
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
  res.json({ ok: true, demoMode: demoMode() });
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
  const ext = path.extname(req.file.originalname || "") || ".m4a";
  const audioFile = `${id}${ext}`;
  await storeAudio(req.file.path, audioFile);

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
    audioMime: guessMime(req.file.mimetype, ext),
    transcript: null,
    report: null,
    liveText: typeof req.body.liveText === "string" && req.body.liveText.trim() ? req.body.liveText.trim() : null,
    speakerNames: {},
  };
  saveMeeting(meeting);

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

app.get("/meetings/:id/audio", (req, res) => {
  const m = getMeeting(req.params.id);
  if (!m || !fs.existsSync(audioPath(m.audioFile))) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.type(m.audioMime).sendFile(audioPath(m.audioFile));
});

// Rename the meeting or its speakers, e.g. { speakerNames: { speaker_0: "Yusri" } }
app.patch("/meetings/:id", (req, res) => {
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
  res.json(updateMeeting(m.id, patch));
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
    await removeAudio(m.audioFile);
    deleteMeeting(m.id);
  }
  res.status(204).end();
});

const server = app.listen(config.port, "0.0.0.0", () => {
  console.log(`CIRCLE server on http://localhost:${config.port}${demoMode() ? " (demo mode: no API keys set)" : ""}`);
});
attachLive(server);
