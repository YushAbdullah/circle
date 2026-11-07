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
import { chat, speakStream, transcribeQuestion, translate } from "./assistant.js";
import { Readable } from "node:stream";
import type { Meeting } from "./types.js";
import { AuthError, deleteAccount, logIn, OWNER_ID, requireUser, signUp, tokenFrom, userIdFromToken } from "./auth.js";
import { ContactError, submitContact } from "./contact.js";
import { startRetention } from "./retention.js";
import { aiOverLimit, countAiQuestion, countMeeting, forgetUsage, getUsage, maxSeconds, overLimit } from "./usage.js";

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
  res.json({
    ok: true,
    demoMode: demoMode(),
    transcriptOnly: transcriptOnly(),
    storage: store.kind,
    storageError,
    inviteRequired: !!config.inviteCode,
  });
});

// Accounts: sign up and log in are open; everything after needs a signed-in user.
const authRoute =
  (fn: typeof signUp) =>
  async (req: Request, res: Response) => {
    try {
      res.json(await fn(req.body ?? {}, req.ip ?? "unknown"));
    } catch (e) {
      const status = e instanceof AuthError ? e.status : 500;
      res.status(status).json({ error: e instanceof Error ? e.message : "Something went wrong." });
    }
  };
app.post("/auth/signup", authRoute(signUp));
app.post("/auth/login", authRoute(logIn));

// "Contact us" works without logging in (e.g. someone who can't log in or wants their data deleted).
app.post("/contact", async (req: Request, res: Response) => {
  try {
    await submitContact(req.body ?? {}, req.ip ?? "unknown", userIdFromToken(tokenFrom(req)));
    res.json({ ok: true });
  } catch (e) {
    res.status(e instanceof ContactError ? e.status : 500).json({ error: e instanceof Error ? e.message : "Could not send." });
  }
});

app.use(requireUser);

const ownerOf = (m: Meeting) => m.ownerId ?? OWNER_ID;

// Any /meetings/:id route only sees the signed-in person's own meetings.
app.param("id", (req: Request, res: Response, next: NextFunction, id: string) => {
  const m = getMeeting(id);
  if (m && ownerOf(m) !== req.userId) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  next();
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

// Self-service: permanently delete this person's account and all their meetings.
app.post("/auth/delete-account", async (req: Request, res: Response) => {
  try {
    const account = await deleteAccount(req.body ?? {}, req.ip ?? "unknown", req.userId);
    for (const m of listMeetings().filter((x) => ownerOf(x) === account.id)) {
      await store.remove(`audio/${m.audioFile}`).catch(() => {});
      await deleteMeeting(m.id);
    }
    await forgetUsage(account.id);
    await account.remove();
    console.log("An account was deleted at the user's request.");
    res.json({ ok: true });
  } catch (e) {
    res.status(e instanceof AuthError ? e.status : 500).json({ error: e instanceof Error ? e.message : "Could not delete." });
  }
});

// How many meetings this person has left this month.
app.get("/usage", async (req, res) => {
  res.json(await getUsage(req.userId));
});

app.get("/meetings", (req, res) => {
  res.json(
    listMeetings()
      .filter((m) => ownerOf(m) === req.userId)
      .map(listItem),
  );
});

app.post("/meetings", upload.single("audio"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "Attach the recording as the 'audio' field." });
    return;
  }
  const limitError = await overLimit(req.userId);
  if (limitError) {
    await fs.promises.unlink(req.file.path).catch(() => {});
    res.status(403).json({ error: limitError });
    return;
  }
  const maxSec = maxSeconds(req.userId);
  const id = crypto.randomUUID();
  const file = req.file;
  const ext = path.extname(file.originalname || "") || ".m4a";
  const mime = guessMime(file.mimetype, ext);

  const createdAt = new Date().toISOString();
  const title = String(req.body.title || "").trim() || `Meeting ${createdAt.slice(0, 16).replace("T", " ")}`;
  let durationSec = req.body.durationSec ? Number(req.body.durationSec) : null;
  if (maxSec && durationSec) durationSec = Math.min(durationSec, maxSec);
  const meeting: Meeting = {
    id,
    ownerId: req.userId,
    title,
    createdAt,
    durationSec,
    status: "uploaded",
    error: null,
    audioFile: `${id}${ext}`,
    audioMime: mime,
    transcript: null,
    report: null,
    liveText: typeof req.body.liveText === "string" && req.body.liveText.trim() ? req.body.liveText.trim() : null,
    speakerNames: {},
  };
  await saveMeeting(meeting);
  await countMeeting(req.userId);

  const numSpeakers = req.body.numSpeakers ? Number(req.body.numSpeakers) : undefined;
  const vocabulary = String(req.body.vocabulary ?? "")
    .split(",")
    .map((s: string) => s.trim())
    .filter(Boolean);

  // Answer the phone straight away; shrinking and storing the file happens in the
  // background (it can take minutes for long recordings on the free server).
  void (async () => {
    let audioPath = file.path;
    try {
      const compressed = await compressAudio(file.path, maxSec);
      let finalExt = ext;
      let finalMime = mime;
      if (compressed) ({ path: audioPath, mime: finalMime, ext: finalExt } = compressed);
      const audioFile = `${id}${finalExt}`;
      await store.put(`audio/${audioFile}`, await fs.promises.readFile(audioPath), finalMime);
      await updateMeeting(id, { audioFile, audioMime: finalMime });
    } catch (err) {
      await updateMeeting(id, {
        status: "failed",
        error: err instanceof Error ? `Could not save the recording: ${err.message}` : "Could not save the recording.",
      });
      return;
    } finally {
      await fs.promises.unlink(file.path).catch(() => {});
      if (audioPath !== file.path) await fs.promises.unlink(audioPath).catch(() => {});
    }
    await processMeeting(id, { numSpeakers, vocabulary });
  })();

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

/** Remember the Ask AI conversation on the meeting, so it is there next time and the AI keeps the context. */
function rememberChat(id: string, turns: { role: "user" | "assistant"; content: string }[]) {
  const m = getMeeting(id);
  if (!m) return;
  updateMeeting(id, { chat: [...(m.chat ?? []), ...turns].slice(-60) }).catch((e) => console.error("Saving chat failed", e));
}

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
    const limitError = await aiOverLimit(req.userId);
    if (limitError) {
      res.status(403).json({ error: limitError, limitReached: true });
      return;
    }
    const reply = await chat(m, clean);
    await countAiQuestion(req.userId);
    res.json({ reply, usage: await getUsage(req.userId) });
    rememberChat(m.id, [clean[clean.length - 1], { role: "assistant", content: reply }]);
  }),
);

// Start a fresh Ask AI conversation for this meeting.
app.delete(
  "/meetings/:id/chat",
  safe(async (req, res) => {
    const m = getMeeting(String(req.params.id));
    if (!m) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(await updateMeeting(m.id, { chat: [] }));
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

// Live voice call: one trip does it all. Multipart "audio" (what the user just said) and
// "history" (JSON list of earlier turns). Returns { question, reply, usage }; question is "" if nothing was heard.
app.post(
  "/meetings/:id/talk",
  questionUpload.single("audio"),
  safe(async (req, res) => {
    const m = getMeeting(String(req.params.id));
    if (!m) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "Attach what you said as the 'audio' field." });
      return;
    }
    const limitError = await aiOverLimit(req.userId);
    if (limitError) {
      res.status(403).json({ error: limitError, limitReached: true });
      return;
    }
    const ext = path.extname(req.file.originalname || "") || ".m4a";
    const question = await transcribeQuestion(req.file.buffer, guessMime(req.file.mimetype, ext));
    if (!question) {
      res.json({ question: "", reply: "" });
      return;
    }
    let history: { role?: string; content?: unknown }[] = [];
    try {
      const parsed = JSON.parse(String(req.body?.history ?? "[]"));
      if (Array.isArray(parsed)) history = parsed;
    } catch {}
    const clean = history
      .filter((x) => (x.role === "user" || x.role === "assistant") && typeof x.content === "string" && !String(x.content).startsWith("⚠️"))
      .map((x) => ({ role: x.role as "user" | "assistant", content: String(x.content) }));
    const reply = await chat(m, [...clean, { role: "user", content: question }], { live: true });
    await countAiQuestion(req.userId);
    res.json({ question, reply, usage: await getUsage(req.userId) });
    rememberChat(m.id, [
      { role: "user", content: question },
      { role: "assistant", content: reply },
    ]);
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
    // Stream the voice so the phone starts playing within a moment instead of waiting for the whole clip.
    const voice = await speakStream(text);
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    const stream = Readable.fromWeb(voice.body as import("node:stream/web").ReadableStream);
    stream.on("error", (e) => {
      console.error("Voice stream failed", e);
      res.destroy();
    });
    stream.pipe(res);
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
loadMeetings().then(startRetention, (e: unknown) => {
  storageError = e instanceof Error ? e.message : String(e);
  console.error(`Storage problem: ${storageError}`);
});
const server = app.listen(config.port, "0.0.0.0", () => {
  const mode = demoMode() ? " (demo mode: no ElevenLabs key)" : transcriptOnly() ? " (transcripts only: no AI key)" : "";
  console.log(`CIRCLE server on http://localhost:${config.port}${mode}, storage: ${store.kind}`);
});
attachLive(server);
