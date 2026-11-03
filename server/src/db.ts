import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import type { Meeting } from "./types.js";

fs.mkdirSync(config.dataDir, { recursive: true });
const db = new DatabaseSync(path.join(config.dataDir, "circle.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS meetings (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    data TEXT NOT NULL
  )
`);

export function saveMeeting(m: Meeting): void {
  db.prepare(
    "INSERT INTO meetings (id, created_at, data) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data",
  ).run(m.id, m.createdAt, JSON.stringify(m));
}

export function getMeeting(id: string): Meeting | null {
  const row = db.prepare("SELECT data FROM meetings WHERE id = ?").get(id) as { data: string } | undefined;
  return row ? (JSON.parse(row.data) as Meeting) : null;
}

export function listMeetings(): Meeting[] {
  const rows = db.prepare("SELECT data FROM meetings ORDER BY created_at DESC").all() as { data: string }[];
  return rows.map((r) => JSON.parse(r.data) as Meeting);
}

export function updateMeeting(id: string, patch: Partial<Meeting>): Meeting | null {
  const m = getMeeting(id);
  if (!m) return null;
  const next = { ...m, ...patch };
  saveMeeting(next);
  return next;
}

export function deleteMeeting(id: string): void {
  db.prepare("DELETE FROM meetings WHERE id = ?").run(id);
}
