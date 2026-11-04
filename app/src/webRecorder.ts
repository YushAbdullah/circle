import { toPcm16kMono } from "./pcm";

/**
 * Recording in a web browser (Safari on iPhone, Chrome, ...). Saves the
 * recording with MediaRecorder and, at the same time, hands raw 16 kHz PCM to
 * onPcm for live captions.
 */
export interface WebRecording {
  blob: Blob;
  mimeType: string;
  ext: string;
  duration: number;
}

export interface WebRecorder {
  stop(): Promise<WebRecording>;
  cancel(): void;
}

const CANDIDATES: [string, string][] = [
  ["audio/mp4", ".m4a"],
  ["audio/webm;codecs=opus", ".webm"],
  ["audio/webm", ".webm"],
  ["audio/ogg;codecs=opus", ".ogg"],
];

export function webRecordingSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
}

export async function startWebRecording(onPcm: (pcm: ArrayBuffer) => void): Promise<WebRecorder> {
  // Safari only lets audio start straight from a tap, so create and resume the
  // audio context before waiting for the microphone.
  const Ctx = globalThis.AudioContext ?? (globalThis as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  const resumed = ctx.resume().catch(() => {});
  let media: MediaStream;
  try {
    media = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: true },
    });
  } catch (e) {
    ctx.close().catch(() => {});
    throw e;
  }
  const [mimeType, ext] = CANDIDATES.find(([t]) => MediaRecorder.isTypeSupported(t)) ?? ["", ".webm"];
  const recorder = new MediaRecorder(media, mimeType ? { mimeType } : undefined);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.start(1000);
  const startedAt = Date.now();

  // Browsers stop recording when the screen locks, so keep it on (Safari 16.4+).
  type WakeLock = { release(): Promise<void> };
  const nav = navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<WakeLock> } };
  let wake: WakeLock | null = null;
  nav.wakeLock?.request("screen").then((w) => (wake = w), () => {});

  // Live captions: tap the microphone and convert to 16 kHz mono int16.
  await resumed;
  const source = ctx.createMediaStreamSource(media);
  const tap = ctx.createScriptProcessor(4096, 1, 1);
  tap.onaudioprocess = (e) => {
    const f = e.inputBuffer.getChannelData(0);
    const i16 = new Int16Array(f.length);
    for (let i = 0; i < f.length; i++) i16[i] = Math.max(-32768, Math.min(32767, Math.round(f[i] * 32767)));
    onPcm(toPcm16kMono(i16.buffer, ctx.sampleRate, 1));
  };
  source.connect(tap);
  tap.connect(ctx.destination);

  const release = () => {
    tap.disconnect();
    source.disconnect();
    ctx.close().catch(() => {});
    media.getTracks().forEach((t) => t.stop());
    wake?.release().catch(() => {});
  };

  return {
    stop: () =>
      new Promise<WebRecording>((resolve) => {
        recorder.onstop = () => {
          release();
          const type = recorder.mimeType || mimeType || "audio/webm";
          resolve({ blob: new Blob(chunks, { type }), mimeType: type.split(";")[0], ext, duration: (Date.now() - startedAt) / 1000 });
        };
        recorder.stop();
      }),
    cancel: () => {
      if (recorder.state !== "inactive") recorder.stop();
      release();
    },
  };
}
