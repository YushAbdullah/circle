export type MeetingStatus = "uploaded" | "transcribing" | "summarizing" | "ready" | "failed";

/** One continuous turn by one speaker. Times are in seconds. */
export interface Utterance {
  speaker: string;
  start: number;
  end: number;
  text: string;
}

export interface Transcript {
  languageCode: string | null;
  utterances: Utterance[];
}

export interface ActionItem {
  owner: string;
  task: string;
  due: string;
}

export interface Report {
  title: string;
  languages: string[];
  summary: string;
  keyPoints: string[];
  decisions: string[];
  actionItems: ActionItem[];
  speakerNames: { speaker: string; name: string }[];
  glossary: { term: string; meaning: string }[];
  /** Added later; older meetings may not have it. */
  recommendations?: string[];
  cleanedUtterances: Utterance[];
}

/** A report and conversation translated into another language. */
export interface Translation {
  language: string;
  summary: string;
  keyPoints: string[];
  decisions: string[];
  recommendations: string[];
  actionItems: string[];
  /** Translated text for each utterance, same order as the cleaned transcript. */
  utterances: string[];
}

export interface Meeting {
  id: string;
  title: string;
  createdAt: string;
  durationSec: number | null;
  status: MeetingStatus;
  error: string | null;
  audioFile: string;
  audioMime: string;
  transcript: Transcript | null;
  report: Report | null;
  /** Captions shown on the phone while recording (no speaker labels). */
  liveText: string | null;
  /** User overrides: speaker id -> display name. */
  speakerNames: Record<string, string>;
  /** True after the user deleted the audio but kept the transcript and report. */
  audioDeleted?: boolean;
  /** Cached translations, keyed by language name. Cleared when the report is rewritten. */
  translations?: Record<string, Translation>;
}
