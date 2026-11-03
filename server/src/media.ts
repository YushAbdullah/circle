import { execFile } from "node:child_process";
import fs from "node:fs";
import ffmpegPath from "ffmpeg-static";

/**
 * Compress a recording to mono AAC (~14 MB per hour) so long meetings stay
 * under free storage limits and upload quickly to the transcriber.
 * Returns null if ffmpeg is unavailable or the file cannot be converted.
 */
export async function compressAudio(inputPath: string): Promise<{ path: string; mime: string; ext: string } | null> {
  if (!ffmpegPath) return null;
  const out = `${inputPath}.m4a`;
  return new Promise((resolve) => {
    execFile(
      ffmpegPath as unknown as string,
      ["-y", "-loglevel", "error", "-i", inputPath, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "aac", "-b:a", "32k", out],
      { timeout: 10 * 60 * 1000 },
      (err) => {
        if (err || !fs.existsSync(out)) {
          console.warn("Audio compression skipped:", err?.message);
          resolve(null);
        } else {
          resolve({ path: out, mime: "audio/mp4", ext: ".m4a" });
        }
      },
    );
  });
}
