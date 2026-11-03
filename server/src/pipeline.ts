import { getMeeting, updateMeeting } from "./db.js";
import { store } from "./storage.js";
import { transcribe } from "./transcribe.js";
import { summarize } from "./summarize.js";

/** Runs transcription then summarisation, recording progress on the meeting. */
export async function processMeeting(id: string, opts: { numSpeakers?: number; vocabulary?: string[] } = {}) {
  const meeting = getMeeting(id);
  if (!meeting) return;
  try {
    let transcript = meeting.transcript;
    if (!transcript) {
      await updateMeeting(id, { status: "transcribing", error: null });
      const audio = await store.get(`audio/${meeting.audioFile}`);
      if (!audio) throw new Error("The recording file is missing.");
      transcript = await transcribe(audio, meeting.audioMime, {
        numSpeakers: opts.numSpeakers,
        extraKeyterms: opts.vocabulary,
      });
      const last = transcript.utterances[transcript.utterances.length - 1];
      await updateMeeting(id, { transcript, durationSec: meeting.durationSec ?? last?.end ?? null });
    }

    await updateMeeting(id, { status: "summarizing" });
    const report = await summarize(transcript, { vocabulary: opts.vocabulary, speakerNames: meeting.speakerNames });

    // Seed speaker names from the AI's guesses, keeping any the user already set.
    const speakerNames = { ...Object.fromEntries(report.speakerNames.map((s) => [s.speaker, s.name])), ...meeting.speakerNames };
    const title = meeting.title.startsWith("Meeting ") ? report.title : meeting.title;
    await updateMeeting(id, { report, speakerNames, title, status: "ready" });
  } catch (err) {
    console.error(`Processing ${id} failed`, err);
    await updateMeeting(id, { status: "failed", error: err instanceof Error ? err.message : String(err) });
  }
}
