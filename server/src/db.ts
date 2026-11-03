import { store } from "./storage.js";
import type { Meeting } from "./types.js";

/**
 * Meetings are kept as JSON files next to the recordings (meetings/<id>.json)
 * and cached in memory, so the server needs no separate database.
 */
const cache = new Map<string, Meeting>();
const writes = new Map<string, Promise<void>>();

const keyFor = (id: string) => `meetings/${id}.json`;

export async function loadMeetings(): Promise<void> {
  const keys = (await store.list("meetings")).filter((k) => k.endsWith(".json"));
  const loaded = await Promise.all(
    keys.map(async (k) => {
      const buf = await store.get(k);
      try {
        return buf ? (JSON.parse(buf.toString("utf8")) as Meeting) : null;
      } catch {
        return null;
      }
    }),
  );
  for (const m of loaded) {
    if (!m) continue;
    // A restart interrupts processing; mark those so the user can retry.
    if (m.status === "uploaded" || m.status === "transcribing" || m.status === "summarizing") {
      m.status = "failed";
      m.error = "The server restarted while processing. Tap Try again.";
    }
    cache.set(m.id, { ...m, liveText: m.liveText ?? null });
  }
}

/** Persist writes for one meeting in order. */
function persist(m: Meeting): Promise<void> {
  const prev = writes.get(m.id) ?? Promise.resolve();
  const next = prev
    .catch(() => {})
    .then(() => store.put(keyFor(m.id), Buffer.from(JSON.stringify(m)), "application/json"));
  writes.set(m.id, next);
  return next;
}

export async function saveMeeting(m: Meeting): Promise<void> {
  cache.set(m.id, m);
  await persist(m);
}

export function getMeeting(id: string): Meeting | null {
  return cache.get(id) ?? null;
}

export function listMeetings(): Meeting[] {
  return [...cache.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function updateMeeting(id: string, patch: Partial<Meeting>): Promise<Meeting | null> {
  const m = cache.get(id);
  if (!m) return null;
  const next = { ...m, ...patch };
  await saveMeeting(next);
  return next;
}

export async function deleteMeeting(id: string): Promise<void> {
  cache.delete(id);
  await (writes.get(id) ?? Promise.resolve()).catch(() => {});
  writes.delete(id);
  await store.remove(keyFor(id));
}
