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
  cleanedUtterances: Utterance[];
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
  /** User overrides: speaker id -> display name. */
  speakerNames: Record<string, string>;
}
