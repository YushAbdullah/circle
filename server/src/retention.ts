import { config } from "./config.js";
import { deleteMeeting, listMeetings } from "./db.js";
import { store } from "./storage.js";

/**
 * PDPA: meetings are permanently deleted RETENTION_DAYS after they were
 * created (recording, transcript, report and translations together).
 */
export async function deleteExpiredMeetings(): Promise<number> {
  if (!(config.retentionDays > 0)) return 0;
  const cutoff = Date.now() - config.retentionDays * 864e5;
  let removed = 0;
  for (const m of listMeetings()) {
    if (new Date(m.createdAt).getTime() >= cutoff) continue;
    await store.remove(`audio/${m.audioFile}`).catch(() => {});
    await deleteMeeting(m.id).catch(() => {});
    removed++;
  }
  if (removed) console.log(`Deleted ${removed} meeting(s) older than ${config.retentionDays} days.`);
  return removed;
}

/** Check now, then every hour (the free server sleeps, so it also runs at each wake-up). */
export function startRetention(): void {
  const run = () => void deleteExpiredMeetings().catch((e) => console.warn("Retention sweep failed:", e));
  run();
  setInterval(run, 60 * 60 * 1000).unref();
}
