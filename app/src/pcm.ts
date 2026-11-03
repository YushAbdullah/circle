/**
 * Convert a captured int16 PCM buffer to 16 kHz mono int16, which is what the
 * live caption service expects. Phones often deliver 44.1/48 kHz even when
 * 16 kHz is requested.
 */
export function toPcm16kMono(data: ArrayBuffer, sampleRate: number, channels: number): ArrayBuffer {
  const input = new Int16Array(data);
  if (sampleRate === 16000 && channels === 1) return data;

  const frames = Math.floor(input.length / channels);
  const ratio = sampleRate / 16000;
  const outLen = Math.floor(frames / ratio);
  const out = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    // Average the source frames that fall into this output sample (simple low-pass + mixdown).
    const start = Math.floor(i * ratio);
    const end = Math.max(start + 1, Math.min(frames, Math.floor((i + 1) * ratio)));
    let sum = 0;
    for (let f = start; f < end; f++) {
      for (let c = 0; c < channels; c++) sum += input[f * channels + c];
    }
    out[i] = Math.round(sum / ((end - start) * channels));
  }
  return out.buffer;
}
