import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

// SecureStore is native-only; the web build (handy for testing) falls back to localStorage.
const store = {
  get: (k: string) =>
    Platform.OS === "web" ? Promise.resolve(globalThis.localStorage?.getItem(k) ?? null) : SecureStore.getItemAsync(k),
  set: (k: string, v: string) =>
    Platform.OS === "web" ? Promise.resolve(globalThis.localStorage?.setItem(k, v)) : SecureStore.setItemAsync(k, v),
};

export type MeetingStatus = "uploaded" | "transcribing" | "summarizing" | "ready" | "failed";

export interface Utterance {
  speaker: string;
  start: number;
  end: number;
  text: string;
}

export interface Report {
  title: string;
  languages: string[];
  summary: string;
  keyPoints: string[];
  decisions: string[];
  actionItems: { owner: string; task: string; due: string }[];
  glossary: { term: string; meaning: string }[];
  cleanedUtterances: Utterance[];
}

export interface MeetingListItem {
  id: string;
  title: string;
  createdAt: string;
  durationSec: number | null;
  status: MeetingStatus;
  error: string | null;
  summary: string | null;
}

export interface Meeting extends Omit<MeetingListItem, "summary"> {
  transcript: { languageCode: string | null; utterances: Utterance[] } | null;
  report: Report | null;
  liveText: string | null;
  speakerNames: Record<string, string>;
}

export interface Settings {
  serverUrl: string;
  token: string;
  vocabulary: string;
}

const KEY = "circle.settings";
// The publish workflow can bake in the server address (EXPO_PUBLIC_SERVER_URL).
const DEFAULTS: Settings = { serverUrl: process.env.EXPO_PUBLIC_SERVER_URL ?? "", token: "", vocabulary: "" };

export async function loadSettings(): Promise<Settings> {
  try {
    const raw = await store.get(KEY);
    const saved = raw ? (JSON.parse(raw) as Partial<Settings>) : {};
    return { ...DEFAULTS, ...saved, serverUrl: saved.serverUrl || DEFAULTS.serverUrl };
  } catch {
    return DEFAULTS;
  }
}

export async function saveSettings(s: Settings): Promise<void> {
  await store.set(KEY, JSON.stringify({ ...s, serverUrl: s.serverUrl.trim().replace(/\/+$/, "") }));
}

export class NotConfiguredError extends Error {
  constructor() {
    super("Set your server address in Settings first.");
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const s = await loadSettings();
  if (!s.serverUrl) throw new NotConfiguredError();
  const headers = new Headers(init.headers);
  if (s.token) headers.set("Authorization", `Bearer ${s.token}`);
  const res = await fetch(`${s.serverUrl}${path}`, { ...init, headers });
  if (!res.ok) {
    let msg = `Server error ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) msg = body.error;
    } catch {}
    throw new Error(msg);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const api = {
  health: () => request<{ ok: boolean; demoMode: boolean }>("/health"),
  list: () => request<MeetingListItem[]>("/meetings"),
  get: (id: string) => request<Meeting>(`/meetings/${id}`),
  rename: (id: string, patch: { title?: string; speakerNames?: Record<string, string> }) =>
    request<Meeting>(`/meetings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }),
  reprocess: (id: string) => request<{ ok: boolean }>(`/meetings/${id}/reprocess`, { method: "POST" }),
  remove: (id: string) => request<void>(`/meetings/${id}`, { method: "DELETE" }),

  async upload(file: { uri: string; name: string; mimeType: string }, meta: { title?: string; durationSec?: number; liveText?: string }) {
    const s = await loadSettings();
    const form = new FormData();
    // React Native's FormData accepts a { uri, name, type } file descriptor.
    form.append("audio", { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
    if (meta.title) form.append("title", meta.title);
    if (meta.durationSec) form.append("durationSec", String(Math.round(meta.durationSec)));
    if (s.vocabulary.trim()) form.append("vocabulary", s.vocabulary);
    if (meta.liveText) form.append("liveText", meta.liveText);
    return request<MeetingListItem>("/meetings", { method: "POST", body: form });
  },

  /** WebSocket URL for live captions while recording. */
  async liveUrl() {
    const s = await loadSettings();
    if (!s.serverUrl) throw new NotConfiguredError();
    const base = s.serverUrl.replace(/^http/i, "ws");
    return `${base}/live${s.token ? `?token=${encodeURIComponent(s.token)}` : ""}`;
  },

  async audioSource(id: string) {
    const s = await loadSettings();
    return {
      uri: `${s.serverUrl}/meetings/${id}/audio`,
      headers: s.token ? { Authorization: `Bearer ${s.token}` } : undefined,
    };
  },
};

export function formatDuration(sec: number | null | undefined): string {
  if (sec == null || !isFinite(sec)) return "";
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}

export const statusLabel: Record<MeetingStatus, string> = {
  uploaded: "Uploading",
  transcribing: "Transcribing",
  summarizing: "Writing report",
  ready: "Ready",
  failed: "Failed",
};
