import { config } from "./config.js";
import { store } from "./storage.js";
import { OWNER_ID } from "./auth.js";

/**
 * Monthly limits for everyone except the owner, so free users can't run up the
 * transcription bill: MEETINGS_PER_MONTH meetings (0 = no limit), each cut to
 * MAX_MEETING_MINUTES. Counts are kept in usage/<account>.json and survive
 * deleting a meeting.
 */
export interface Usage {
  limited: boolean;
  used: number;
  max: number;
  maxMinutes: number;
}

interface Stored {
  month: string;
  count: number;
}

const cache = new Map<string, Stored>();
const thisMonth = () => new Date().toISOString().slice(0, 7);
const keyFor = (uid: string) => `usage/${uid.replace(/[^a-zA-Z0-9-]/g, "")}.json`;

export const isLimited = (uid: string | undefined) => !!uid && uid !== OWNER_ID;

async function load(uid: string): Promise<Stored> {
  let s = cache.get(uid);
  if (!s) {
    const buf = await store.get(keyFor(uid)).catch(() => null);
    try {
      s = buf ? (JSON.parse(buf.toString("utf8")) as Stored) : undefined;
    } catch {}
    s ??= { month: thisMonth(), count: 0 };
    cache.set(uid, s);
  }
  if (s.month !== thisMonth()) {
    s.month = thisMonth();
    s.count = 0;
  }
  return s;
}

export async function getUsage(uid: string | undefined): Promise<Usage> {
  if (!isLimited(uid)) return { limited: false, used: 0, max: 0, maxMinutes: 0 };
  const s = await load(uid!);
  return { limited: true, used: s.count, max: config.meetingsPerMonth, maxMinutes: config.maxMeetingMinutes };
}

/** Seconds a new recording may last for this account, or null for no limit. */
export function maxSeconds(uid: string | undefined): number | null {
  return isLimited(uid) && config.maxMeetingMinutes > 0 ? config.maxMeetingMinutes * 60 : null;
}

/** Error message when this account has used up its meetings, else null. */
export async function overLimit(uid: string | undefined): Promise<string | null> {
  const u = await getUsage(uid);
  if (!u.limited || !u.max || u.used < u.max) return null;
  return `You've used all ${u.max} meetings for this month. You can record again next month.`;
}

export async function countMeeting(uid: string | undefined): Promise<void> {
  if (!isLimited(uid)) return;
  const s = await load(uid!);
  s.count++;
  await store.put(keyFor(uid!), Buffer.from(JSON.stringify(s)), "application/json").catch((e) => {
    console.warn("Could not save usage:", e);
  });
}
