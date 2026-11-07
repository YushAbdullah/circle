import crypto from "node:crypto";
import { config } from "./config.js";
import { store } from "./storage.js";

/**
 * "Contact us" form. Each request is saved (requests/<time>.json) and, when
 * CONTACT_EMAIL is set on the server, emailed to the owner through FormSubmit
 * (formsubmit.co: no account or API key; the first message sends a one-time
 * "Activate" email that the owner must click). The address is never shown to users.
 */
export const TOPICS = ["Question or feedback", "Privacy / PDPA request", "Delete my account", "Business plan", "Report a problem"];

export class ContactError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

const recent = new Map<string, number[]>();

export async function submitContact(
  input: { name?: unknown; email?: unknown; topic?: unknown; message?: unknown },
  ip: string,
  accountId?: string | null,
): Promise<void> {
  const now = Date.now();
  const times = (recent.get(ip) ?? []).filter((t) => now - t < 60 * 60_000);
  if (times.length >= 5) throw new ContactError("Too many messages. Please try again in an hour.", 429);

  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const name = str(input.name, 100);
  const email = str(input.email, 200);
  const topic = TOPICS.includes(str(input.topic, 100)) ? str(input.topic, 100) : TOPICS[0];
  const message = str(input.message, 5000);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ContactError("Enter a valid email so we can reply.");
  if (message.length < 5) throw new ContactError("Please write your message.");
  times.push(now);
  recent.set(ip, times);

  const request = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), name, email, topic, message, accountId: accountId ?? null };
  await store.put(`requests/${request.createdAt.replace(/[:.]/g, "-")}-${request.id.slice(0, 8)}.json`, Buffer.from(JSON.stringify(request)), "application/json");

  if (!config.contactEmail) {
    console.warn("Contact request saved, but CONTACT_EMAIL is not set so it was not emailed.");
    return;
  }
  const res = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(config.contactEmail)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", Referer: "https://circle.app" },
    body: JSON.stringify({
      _subject: `CIXCLE: ${topic}`,
      _replyto: email,
      _template: "table",
      _captcha: "false",
      name: name || "(no name)",
      email,
      topic,
      message,
      account: accountId ?? "not logged in",
    }),
  }).catch((e: unknown) => {
    console.warn("Emailing contact request failed:", e);
    return null;
  });
  if (res && !res.ok) console.warn(`Emailing contact request failed: ${res.status} ${await res.text().catch(() => "")}`);
}
