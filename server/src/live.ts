import type { IncomingMessage, Server } from "node:http";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import { config, demoMode } from "./config.js";
import { OWNER_ID, tokenFrom, userIdFromToken } from "./auth.js";
import { maxSeconds } from "./usage.js";
import { demoTranscript } from "./demo.js";

/**
 * Live captions while recording.
 *
 * The phone opens ws(s)://<server>/live?token=<log-in token> and sends raw PCM
 * (16 kHz, mono, signed 16-bit little-endian) as binary messages. The server
 * relays it to ElevenLabs realtime speech-to-text (the API key never leaves
 * the server) and sends captions back as JSON:
 *
 *   { "type": "ready" }
 *   { "type": "partial", "text": "..." }   text still changing
 *   { "type": "final",   "text": "..." }   finished sentence/segment
 *   { "type": "error",   "message": "..." }
 *
 * The full recording is still uploaded at the end for the speaker-labelled
 * transcript and report; live captions are for following along.
 */

export type LiveMessage =
  | { type: "ready" }
  | { type: "partial"; text: string }
  | { type: "final"; text: string }
  | { type: "error"; message: string };

const REALTIME_URL = "wss://api.elevenlabs.io/v1/speech-to-text/realtime";

/** The signed-in account, or null when the log-in is missing or wrong. */
function accountFor(req: IncomingMessage): string | null {
  if (!config.appToken && !config.authSecret) return OWNER_ID;
  return userIdFromToken(tokenFrom(req));
}

export function attachLive(server: Server): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const path = new URL(req.url ?? "/", "http://x").pathname;
    if (path !== "/live") return socket.destroy();
    const uid = accountFor(req);
    if (!uid) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      return socket.destroy();
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      // Stop live captions a minute after the account's time limit.
      const max = maxSeconds(uid);
      if (max) {
        const timer = setTimeout(() => ws.close(), (max + 60) * 1000);
        ws.on("close", () => clearTimeout(timer));
      }
      if (demoMode()) runDemo(ws);
      else relay(ws);
    });
  });
}

function send(ws: WebSocket, msg: LiveMessage) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function relay(phone: WebSocket) {
  const params = new URLSearchParams({
    model_id: "scribe_v2_realtime",
    audio_format: "pcm_16000",
    commit_strategy: "vad",
    vad_silence_threshold_secs: "1.2",
    // Malay + English so code-switching is expected rather than "corrected" away.
    language_code: config.liveLanguage,
    keepalive_interval_ms: "5000",
  });
  for (const lang of config.liveSecondaryLanguages) params.append("secondary_languages", lang);
  for (const term of config.keyterms.slice(0, 50)) params.append("keyterms", term);

  const upstream = new WebSocket(`${REALTIME_URL}?${params}`, { headers: { "xi-api-key": config.elevenLabsKey } });
  const pending: string[] = [];

  upstream.on("open", () => {
    for (const m of pending.splice(0)) upstream.send(m);
  });

  upstream.on("message", (raw: RawData) => {
    let msg: { message_type?: string; text?: string; error?: string };
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    switch (msg.message_type) {
      case "session_started":
        send(phone, { type: "ready" });
        break;
      case "partial_transcript":
        send(phone, { type: "partial", text: msg.text ?? "" });
        break;
      case "committed_transcript":
        if (msg.text?.trim()) send(phone, { type: "final", text: msg.text.trim() });
        break;
      case "warning":
        break;
      default:
        if (msg.message_type && (msg.error || /error|rate_limited/i.test(msg.message_type))) {
          send(phone, { type: "error", message: msg.error ?? msg.message_type });
        }
    }
  });

  upstream.on("error", (err) => send(phone, { type: "error", message: `Live captions unavailable: ${err.message}` }));
  upstream.on("close", () => phone.close());

  phone.on("message", (data: RawData, isBinary: boolean) => {
    let out: string;
    if (isBinary) {
      const buf = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer);
      out = JSON.stringify({ message_type: "input_audio_chunk", audio_base_64: buf.toString("base64") });
    } else if (data.toString().includes('"stop"')) {
      // Flush whatever is still buffered as a final segment.
      out = JSON.stringify({ message_type: "input_audio_chunk", audio_base_64: "", commit: true });
    } else {
      return;
    }
    if (upstream.readyState === WebSocket.OPEN) upstream.send(out);
    else if (upstream.readyState === WebSocket.CONNECTING) pending.push(out);
  });

  phone.on("close", () => {
    if (upstream.readyState === WebSocket.OPEN) {
      upstream.send(JSON.stringify({ message_type: "input_audio_chunk", audio_base_64: "", commit: true }));
      setTimeout(() => upstream.close(), 1500);
    } else {
      upstream.terminate();
    }
  });
}

/** Without API keys, replay the sample meeting as fake live captions. */
function runDemo(phone: WebSocket) {
  send(phone, { type: "ready" });
  const lines = demoTranscript.utterances.map((u) => u.text);
  let i = 0;
  let word = 0;
  const timer = setInterval(() => {
    if (i >= lines.length) i = 0;
    const words = lines[i].split(" ");
    word++;
    if (word < words.length) {
      send(phone, { type: "partial", text: words.slice(0, word).join(" ") });
    } else {
      send(phone, { type: "final", text: lines[i] });
      i++;
      word = 0;
    }
  }, 250);
  phone.on("message", () => {});
  phone.on("close", () => clearInterval(timer));
}
