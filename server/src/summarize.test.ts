import { test } from "node:test";
import assert from "node:assert/strict";

test("Gemini report is requested with a JSON schema and corrections are applied", async () => {
  process.env.ELEVENLABS_API_KEY = "x";
  process.env.ANTHROPIC_API_KEY = "";
  process.env.GEMINI_API_KEY = "g";
  const { summarize } = await import("./summarize.js");
  let body: any;
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    body = JSON.parse(String(init.body));
    const report = {
      title: "Test", languages: ["Manglish"], summary: "Ok lah.", keyPoints: [], decisions: [],
      actionItems: [], speakerNames: [], glossary: [{ term: "tapau", meaning: "takeaway" }],
      corrections: [{ index: 0, text: "Jom tapau." }],
    };
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(report) }] }, finishReason: "STOP" }] }));
  }) as typeof fetch;
  const r = await summarize({ languageCode: "ms", utterances: [{ speaker: "speaker_0", start: 0, end: 1, text: "Jom tap out." }] } as any);
  assert.equal(body.generationConfig.responseMimeType, "application/json");
  assert.equal(body.generationConfig.responseJsonSchema.type, "object");
  assert.equal(body.generationConfig.responseJsonSchema.$schema, undefined);
  assert.equal(r.cleanedUtterances[0].text, "Jom tapau.");
  assert.equal(r.glossary[0].term, "tapau");
});

test("Groq is preferred over Gemini and its JSON reply is parsed", async () => {
  process.env.GROQ_API_KEY = "q";
  const { config } = await import("./config.js");
  config.groqKey = "q";
  const { summarize } = await import("./summarize.js");
  let url = "";
  globalThis.fetch = (async (u: string) => {
    url = u;
    const report = { title: "T", summary: "S", corrections: [{ index: 0, text: "Boleh lah." }] };
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(report) }, finish_reason: "stop" }] }));
  }) as typeof fetch;
  const r = await summarize({ languageCode: "ms", utterances: [{ speaker: "speaker_0", start: 0, end: 1, text: "Bole la." }] } as any);
  assert.match(url, /api\.groq\.com/);
  assert.equal(r.cleanedUtterances[0].text, "Boleh lah.");
  assert.deepEqual(r.decisions, []);
  config.groqKey = "";
});
