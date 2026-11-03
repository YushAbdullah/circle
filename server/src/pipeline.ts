import { getMeeting, updateMeeting } from "./db.js";
import { audioPath } from "./storage.js";
import { transcribe } from "./transcribe.js";
import { summarize } from "./summarize.js";

/** Runs transcription then summarisation, recording progress on the meeting. */
export async function processMeeting(id: string, opts: { numSpeakers?: number; vocabulary?: string[] } = {}) {
  const meeting = getMeeting(id);
  if (!meeting) return;
  try {
    let transcript = meeting.transcript;
    if (!transcript) {
      updateMeeting(id, { status: "transcribing", error: null });
      transcript = await transcribe(audioPath(meeting.audioFile), meeting.audioMime, {
        numSpeakers: opts.numSpeakers,
        extraKeyterms: opts.vocabulary,
      });
      const last = transcript.utterances[transcript.utterances.length - 1];
      updateMeeting(id, { transcript, durationSec: meeting.durationSec ?? last?.end ?? null });
    }

    updateMeeting(id, { status: "summarizing" });
    const report = await summarize(transcript, { vocabulary: opts.vocabulary, speakerNames: meeting.speakerNames });

    // Seed speaker names from the AI's guesses, keeping any the user already set.
    const speakerNames = { ...Object.fromEntries(report.speakerNames.map((s) => [s.speaker, s.name])), ...meeting.speakerNames };
    const title = meeting.title.startsWith("Meeting ") ? report.title : meeting.title;
    updateMeeting(id, { report, speakerNames, title, status: "ready" });
  } catch (err) {
    console.error(`Processing ${id} failed`, err);
    updateMeeting(id, { status: "failed", error: err instanceof Error ? err.message : String(err) });
  }
}
