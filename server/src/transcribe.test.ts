import { test } from "node:test";
import assert from "node:assert/strict";
import { groupWords } from "./transcribe.js";

test("groups words into speaker turns", () => {
  const out = groupWords([
    { text: "Jom", start: 0, end: 0.3, type: "word", speaker_id: "speaker_0" },
    { text: " ", start: 0.3, end: 0.4, type: "spacing", speaker_id: "speaker_0" },
    { text: "start", start: 0.4, end: 0.8, type: "word", speaker_id: "speaker_0" },
    { text: "(laughs)", start: 0.8, end: 1, type: "audio_event", speaker_id: "speaker_0" },
    { text: " ", start: 1, end: 1.1, type: "spacing", speaker_id: "speaker_1" },
    { text: "Can", start: 1.1, end: 1.3, type: "word", speaker_id: "speaker_1" },
    { text: " ", start: 1.3, end: 1.4, type: "spacing", speaker_id: "speaker_1" },
    { text: "lah", start: 1.4, end: 1.6, type: "word", speaker_id: "speaker_1" },
  ]);
  assert.deepEqual(out, [
    { speaker: "speaker_0", start: 0, end: 0.8, text: "Jom start" },
    { speaker: "speaker_1", start: 1.1, end: 1.6, text: "Can lah" },
  ]);
});

test("falls back to full text when there are no words", () => {
  assert.deepEqual(groupWords([], "hello"), [{ speaker: "speaker_0", start: 0, end: 0, text: "hello" }]);
});
