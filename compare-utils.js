// Pure helpers for compare.html (no DOM, no network), so they can be tested in Node.

export const SR = 16000;

// Split a 16 kHz clip into speech segments using simple energy-based pause detection.
// This is deliberately crude (the real app would use a proper voice-activity model);
// loud street noise can fool it, in which case it falls back to fixed-length pieces.
export function segmentOnPauses(pcm, { minSilence = 0.45, maxSeg = 25, minSeg = 0.5, pad = 0.2 } = {}) {
  const hop = Math.floor(SR * 0.03);
  const n = Math.floor(pcm.length / hop);
  const total = pcm.length / SR;
  if (n < 10) return [{ start: 0, end: total }];

  const rms = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = i * hop; j < (i + 1) * hop; j++) s += pcm[j] * pcm[j];
    rms[i] = Math.sqrt(s / hop);
  }
  const sorted = Float32Array.from(rms).sort();
  const floor = sorted[Math.floor(n * 0.2)];
  const peak = sorted[Math.floor(n * 0.95)];
  if (peak < 0.004) return [{ start: 0, end: total }]; // basically silence: leave it to the model
  const thr = floor + (peak - floor) * 0.15;

  // voiced runs, merging gaps shorter than minSilence
  const gapFrames = Math.ceil(minSilence / 0.03);
  const regions = [];
  let start = -1;
  let lastVoiced = -1;
  for (let i = 0; i < n; i++) {
    if (rms[i] > thr) {
      if (start < 0) start = i;
      lastVoiced = i;
    } else if (start >= 0 && i - lastVoiced > gapFrames) {
      regions.push([start, lastVoiced + 1]);
      start = -1;
    }
  }
  if (start >= 0) regions.push([start, lastVoiced + 1]);

  let segs = regions
    .map(([a, b]) => ({ start: Math.max(0, a * 0.03 - pad), end: Math.min(total, b * 0.03 + pad) }))
    .filter((s) => s.end - s.start >= minSeg);

  // split anything longer than maxSeg into equal pieces
  const out = [];
  for (const s of segs) {
    const len = s.end - s.start;
    const k = Math.ceil(len / maxSeg);
    for (let i = 0; i < k; i++) out.push({ start: s.start + (len * i) / k, end: s.start + (len * (i + 1)) / k });
  }
  segs = out;

  if (!segs.length) {
    // fall back to fixed pieces
    const k = Math.max(1, Math.ceil(total / 15));
    return Array.from({ length: k }, (_, i) => ({ start: (total * i) / k, end: (total * (i + 1)) / k }));
  }
  return segs;
}

// Word error rate after normalising case, accents and punctuation.
export function normWords(s) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function wer(reference, hypothesis) {
  const r = normWords(reference);
  const h = normWords(hypothesis);
  if (!r.length) return null;
  let prev = Array.from({ length: h.length + 1 }, (_, j) => j);
  for (let i = 1; i <= r.length; i++) {
    const cur = [i];
    for (let j = 1; j <= h.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[h.length] / r.length;
}

// 16-bit mono WAV, for replaying a clip in an <audio> element.
export function encodeWav(pcm, sampleRate = SR) {
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const v = new DataView(buf);
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF");
  v.setUint32(4, 36 + pcm.length * 2, true);
  w(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, "data");
  v.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: "audio/wav" });
}

// Streaming box-filter downsampler used for microphone capture.
export class Resampler {
  constructor(inRate, outRate = SR) {
    this.r = inRate / outRate;
    this.pos = 0;
    this.tail = new Float32Array(0);
    this.same = inRate === outRate;
  }
  push(x) {
    if (this.same) return x;
    const buf = new Float32Array(this.tail.length + x.length);
    buf.set(this.tail);
    buf.set(x, this.tail.length);
    const half = this.r / 2;
    const out = [];
    let p = this.pos;
    while (p + half < buf.length) {
      const a = Math.max(0, Math.floor(p - half));
      const b = Math.min(buf.length, Math.ceil(p + half));
      let s = 0;
      for (let i = a; i < b; i++) s += buf[i];
      out.push(s / (b - a));
      p += this.r;
    }
    const keep = Math.max(0, Math.floor(p - half));
    this.tail = buf.slice(keep);
    this.pos = p - keep;
    return Float32Array.from(out);
  }
}

export function concat(chunks) {
  const out = new Float32Array(chunks.reduce((a, c) => a + c.length, 0));
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}
