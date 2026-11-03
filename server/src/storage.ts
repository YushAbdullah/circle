import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

// Recordings live on local disk for the MVP. Swap these three functions for
// S3 / Cloudflare R2 / Supabase Storage when deploying.
const audioDir = path.join(config.dataDir, "audio");
fs.mkdirSync(audioDir, { recursive: true });

export function audioPath(fileName: string): string {
  return path.join(audioDir, path.basename(fileName));
}

export async function storeAudio(tmpPath: string, fileName: string): Promise<void> {
  await fs.promises.rename(tmpPath, audioPath(fileName)).catch(async () => {
    await fs.promises.copyFile(tmpPath, audioPath(fileName));
    await fs.promises.unlink(tmpPath);
  });
}

export async function removeAudio(fileName: string): Promise<void> {
  await fs.promises.unlink(audioPath(fileName)).catch(() => {});
}

export const uploadTmpDir = path.join(config.dataDir, "tmp");
fs.mkdirSync(uploadTmpDir, { recursive: true });
