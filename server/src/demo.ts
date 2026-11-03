import type { Report, Transcript } from "./types.js";

// A short Manglish meeting used when API keys are not set, so the app can be tried end to end.
export const demoTranscript: Transcript = {
  languageCode: "msa",
  utterances: [
    { speaker: "speaker_0", start: 0, end: 6.2, text: "Ok guys, jom start. Today kita nak finalise launch date untuk app baru tu." },
    { speaker: "speaker_1", start: 6.4, end: 13.1, text: "Boss, honestly the backend belum siap lagi lah. Payment gateway still got issue, cannot go live this week." },
    { speaker: "speaker_0", start: 13.3, end: 18.0, text: "Alamak. So bila boleh settle? Client dah tanya banyak kali dah." },
    { speaker: "speaker_2", start: 18.2, end: 26.5, text: "Kalau Aiman fix payment by Friday, we can do UAT next Monday, then launch on the 17th. Can or not?" },
    { speaker: "speaker_1", start: 26.7, end: 30.4, text: "Can, can. Friday I settle. But I need the sandbox key from finance first." },
    { speaker: "speaker_0", start: 30.6, end: 37.0, text: "Ok, Siti you follow up with finance for the key today. Launch 17hb, confirm. Jangan lambat lagi ya." },
    { speaker: "speaker_2", start: 37.2, end: 39.0, text: "Baik boss, nanti I WhatsApp them." },
  ],
};

export const demoReport: Report = {
  title: "App launch date planning",
  languages: ["Malay", "English", "Manglish"],
  summary:
    "The team agreed to launch the new app on the 17th. The backend is not ready because the payment gateway still has issues. Aiman will fix payments by Friday, UAT runs next Monday, and Siti will get the sandbox key from finance today.",
  keyPoints: [
    "Backend is not finished; the payment gateway is blocking go-live this week.",
    "The client has been asking repeatedly for a launch date.",
    "Plan: payment fix by Friday, UAT next Monday, launch on the 17th.",
  ],
  decisions: ["Launch date confirmed for the 17th."],
  actionItems: [
    { owner: "Aiman", task: "Fix the payment gateway issue", due: "Friday" },
    { owner: "Siti", task: "Get the payment sandbox key from finance", due: "Today" },
    { owner: "Team", task: "Run UAT", due: "Next Monday" },
  ],
  speakerNames: [
    { speaker: "speaker_0", name: "Boss" },
    { speaker: "speaker_1", name: "Aiman" },
    { speaker: "speaker_2", name: "Siti" },
  ],
  glossary: [
    { term: "jom", meaning: "let's (go/start)" },
    { term: "belum siap lagi lah", meaning: "not ready yet" },
    { term: "Alamak", meaning: "exclamation of dismay, like 'oh no'" },
    { term: "Can or not?", meaning: "Is that possible? (Manglish)" },
    { term: "17hb", meaning: "the 17th (hb = haribulan, day of the month)" },
  ],
  cleanedUtterances: demoTranscript.utterances,
};
