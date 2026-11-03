import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { File as FsFile, UploadType } from "expo-file-system";
import { router } from "expo-router";

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
  recommendations?: string[];
  cleanedUtterances: Utterance[];
}

export interface Translation {
  language: string;
  summary: string;
  keyPoints: string[];
  decisions: string[];
  recommendations: string[];
  actionItems: string[];
  utterances: string[];
}

export type ChatMessage = { role: "user" | "assistant"; content: string };

export interface MeetingListItem {
  id: string;
  title: string;
  createdAt: string;
  durationSec: number | null;
  status: MeetingStatus;
  error: string | null;
  summary: string | null;
  languages?: string[];
  actionCount?: number;
  audioDeleted?: boolean;
}

export interface Meeting extends Omit<MeetingListItem, "summary" | "languages" | "actionCount"> {
  translations?: Record<string, Translation>;
  transcript: { languageCode: string | null; utterances: Utterance[] } | null;
  report: Report | null;
  liveText: string | null;
  speakerNames: Record<string, string>;
}

export interface Account {
  id: string;
  email: string;
  name: string;
}

export interface Settings {
  serverUrl: string;
  /** Log-in token from the server, or the shared APP_TOKEN (owner). */
  token: string;
  vocabulary: string;
  /** Who is logged in (empty when using the shared APP_TOKEN). */
  account?: Account | null;
}

const KEY = "circle.settings";
// The publish workflow can bake in the server address (EXPO_PUBLIC_SERVER_URL).
// Render may hand over just the host name (circle-server-xxxx.onrender.com), so add https:// when missing.
const BUILT_IN_SERVER = (process.env.EXPO_PUBLIC_SERVER_URL ?? "").trim().replace(/\/+$/, "");
const DEFAULTS: Settings = {
  serverUrl: BUILT_IN_SERVER && !/^https?:\/\//i.test(BUILT_IN_SERVER) ? `https://${BUILT_IN_SERVER}` : BUILT_IN_SERVER,
  token: "",
  vocabulary: "",
};

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

const UNAUTHORIZED = "Please log in again.";

/** Forget the log-in and go to the log-in screen. */
export async function logOut(): Promise<void> {
  const s = await loadSettings();
  await saveSettings({ ...s, token: "", account: null });
  router.replace("/login");
}

async function onUnauthorized(): Promise<never> {
  await logOut().catch(() => {});
  throw new Error(UNAUTHORIZED);
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
  if (res.status === 401 && !path.startsWith("/auth/")) return onUnauthorized();
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

async function authCall(path: string, body: Record<string, string>): Promise<Account> {
  const r = await request<{ token: string; user: Account }>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const s = await loadSettings();
  await saveSettings({ ...s, token: r.token, account: r.user });
  return r.user;
}

export const api = {
  health: () =>
    request<{
      ok: boolean;
      demoMode: boolean;
      transcriptOnly?: boolean;
      storage?: "local" | "supabase";
      inviteRequired?: boolean;
    }>("/health"),
  signUp: (input: { email: string; password: string; name: string; inviteCode?: string }) =>
    authCall("/auth/signup", { ...input, inviteCode: input.inviteCode ?? "" }),
  logIn: (input: { email: string; password: string }) => authCall("/auth/login", input),
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
  deleteAudio: (id: string) => request<Meeting>(`/meetings/${id}/audio`, { method: "DELETE" }),
  chat: (id: string, messages: ChatMessage[]) =>
    request<{ reply: string }>(`/meetings/${id}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    }),
  translate: (id: string, language: string, refresh = false) =>
    request<Translation>(`/meetings/${id}/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language, refresh }),
    }),

  /** Send a short spoken question; returns what was said. */
  async transcribeQuestion(uri: string) {
    const s = await loadSettings();
    if (!s.serverUrl) throw new NotConfiguredError();
    if (Platform.OS === "web") {
      const blob = await (await fetch(uri)).blob();
      const form = new FormData();
      form.append("audio", blob, `question${blob.type.includes("webm") ? ".webm" : ".m4a"}`);
      return (await request<{ text?: string }>("/transcribe", { method: "POST", body: form })).text ?? "";
    }
    const res = await new FsFile(uri).upload(`${s.serverUrl}/transcribe`, {
      uploadType: UploadType.MULTIPART,
      fieldName: "audio",
      mimeType: "audio/mp4",
      headers: s.token ? { Authorization: `Bearer ${s.token}` } : {},
    });
    let body: { text?: string; error?: string } = {};
    try {
      body = JSON.parse(res.body);
    } catch {}
    if (res.status === 401) return onUnauthorized();
    if (res.status < 200 || res.status >= 300) throw new Error(body.error ?? `Server error ${res.status}`);
    return body.text ?? "";
  },

  /** Audio source that reads `text` aloud. */
  async speechSource(text: string) {
    const s = await loadSettings();
    const uri = `${s.serverUrl}/tts?text=${encodeURIComponent(text.slice(0, 2500))}`;
    if (Platform.OS === "web") return { uri: s.token ? `${uri}&token=${encodeURIComponent(s.token)}` : uri };
    return {
      uri,
      headers: s.token ? { Authorization: `Bearer ${s.token}` } : undefined,
    };
  },

  /**
   * Upload a recording. On the phone the native uploader streams from disk, so
   * long meetings don't need to fit in memory; in a browser it's a normal form post.
   */
  async upload(file: { uri: string; name: string; mimeType: string; blob?: Blob }, meta: { title?: string; durationSec?: number; liveText?: string }) {
    const s = await loadSettings();
    if (!s.serverUrl) throw new NotConfiguredError();
    const parameters: Record<string, string> = {};
    if (meta.title) parameters.title = meta.title;
    if (meta.durationSec) parameters.durationSec = String(Math.round(meta.durationSec));
    if (s.vocabulary.trim()) parameters.vocabulary = s.vocabulary;
    if (meta.liveText) parameters.liveText = meta.liveText;

    if (Platform.OS === "web") {
      const form = new FormData();
      for (const [k, v] of Object.entries(parameters)) form.append(k, v);
      form.append("audio", file.blob ?? (await (await fetch(file.uri)).blob()), file.name);
      return request<MeetingListItem>("/meetings", { method: "POST", body: form });
    }

    const res = await new FsFile(file.uri).upload(`${s.serverUrl}/meetings`, {
      uploadType: UploadType.MULTIPART,
      fieldName: "audio",
      mimeType: file.mimeType,
      parameters,
      headers: s.token ? { Authorization: `Bearer ${s.token}` } : {},
    });
    let body: { error?: string } & Partial<MeetingListItem> = {};
    try {
      body = JSON.parse(res.body);
    } catch {}
    if (res.status === 401) return onUnauthorized();
    if (res.status < 200 || res.status >= 300) throw new Error(body.error ?? `Server error ${res.status}`);
    return body as MeetingListItem;
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
    // A browser's audio player can't send headers, so the web version puts the token in the address.
    if (Platform.OS === "web") {
      return { uri: `${s.serverUrl}/meetings/${id}/audio${s.token ? `?token=${encodeURIComponent(s.token)}` : ""}` };
    }
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
