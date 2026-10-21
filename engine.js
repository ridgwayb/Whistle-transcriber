// Model loading and inference for dictate.html. Everything runs in the browser.
// Transformers.js is imported lazily, so if its CDN is blocked the rest of the page (and Whistle) still works.
let tf = null;
async function getTF() {
  if (!tf) {
    try {
      tf = await import("https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.1");
    } catch (err) {
      throw new Error("Could not load the Transformers.js library (cdn.jsdelivr.net may be blocked). Try Whistle in Settings.");
    }
    tf.env.allowLocalModels = false;
  }
  return tf;
}

export const CFG = {
  // Whistle: engine pinned to a commit so the glue code and binary match.
  engineBase:
    "https://huggingface.co/Cactus-Compute/needle3/resolve/d6c7d6a2e9655505e0f8e23339356dd1705900eb/wasm/",
  whistleUrl: "https://huggingface.co/Cactus-Compute/whistle/resolve/main/whistle.cact",
  cacheName: "whistle-assets-v1",
  outCap: 4 << 20,
};

// Edit these ids to try other models.
export const WHISPER = {
  small: "onnx-community/whisper-small",
  base: "onnx-community/whisper-base",
};
export const LLMS = {
  "0.5b": "onnx-community/Qwen2.5-0.5B-Instruct",
  "1.5b": "onnx-community/Qwen2.5-1.5B-Instruct",
};
const WHISPER_LANG = { en: "english", es: "spanish" };

const enc = new TextEncoder();
const dec = new TextDecoder();

// ---------- progress ----------
function progressFor(label, onStatus) {
  const files = {};
  return (e) => {
    if (e.status === "progress" && e.file) {
      files[e.file] = { loaded: e.loaded, total: e.total };
      const v = Object.values(files);
      const l = v.reduce((a, f) => a + f.loaded, 0);
      const t = v.reduce((a, f) => a + f.total, 0);
      onStatus(`Downloading ${label}… ${(l / 1e6).toFixed(0)} of ${(t / 1e6).toFixed(0)} MB`);
    }
  };
}

// ---------- Whistle ----------
let mod = null;

async function fetchBuffer(url, onFrac) {
  const cache = "caches" in self ? await caches.open(CFG.cacheName).catch(() => null) : null;
  const hit = cache && (await cache.match(url).catch(() => null));
  if (hit) return hit.arrayBuffer();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const total = Number(res.headers.get("content-length")) || 0;
  const reader = res.body.getReader();
  const parts = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    got += value.length;
    onFrac?.(total ? got / total : null);
  }
  const buf = new Uint8Array(got);
  let o = 0;
  for (const p of parts) (buf.set(p, o), (o += p.length));
  if (cache) cache.put(url, new Response(buf.buffer.slice(0))).catch(() => {});
  return buf.buffer;
}

export const whistleLoaded = () => !!mod;

export async function loadWhistle(onStatus) {
  if (mod) return;
  onStatus("Loading Whistle…");
  const [js, wasm] = await Promise.all([
    fetchBuffer(CFG.engineBase + "needle.js"),
    fetchBuffer(CFG.engineBase + "needle.wasm"),
  ]);
  const url = URL.createObjectURL(new Blob([js], { type: "text/javascript" }));
  await new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = url;
    s.onload = res;
    s.onerror = () => rej(new Error("Could not load needle.js"));
    document.head.appendChild(s);
  });
  const cact = await fetchBuffer(CFG.whistleUrl, (f) => f != null && onStatus(`Downloading Whistle… ${Math.round(f * 100)}%`));
  const m = await window.createNeedle({ wasmBinary: wasm });
  const p = m._malloc(cact.byteLength);
  m.HEAPU8.set(new Uint8Array(cact), p);
  const rc = m._needle_load(p, BigInt(cact.byteLength)); // 64-bit length needs a BigInt
  m._free(p);
  if (rc < 0) throw new Error("needle_load failed");
  mod = m;
}

function cstr(s) {
  if (!s) return 0;
  const b = enc.encode(s + "\0");
  const p = mod._malloc(b.length);
  mod.HEAPU8.set(b, p);
  return p;
}
function readC(ptr, cap) {
  const h = mod.HEAPU8;
  let e = ptr;
  while (e < ptr + cap && h[e] !== 0) e++;
  return dec.decode(h.subarray(ptr, e));
}

// Returns {text, language}. language is null for auto-detect; keywords is a newline-separated string or null.
export function whistleRun(pcm, language, keywords) {
  const allocs = [];
  const t = (p) => (p && allocs.push(p), p);
  try {
    const pP = t(mod._malloc(pcm.byteLength));
    mod.HEAPU8.set(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength), pP);
    const lP = t(cstr(language));
    const kP = t(cstr(keywords));
    const oP = t(mod._malloc(CFG.outCap));
    const rc = mod._needle_transcribe(pP, pcm.length, lP, kP, 0, oP, CFG.outCap);
    if (rc < 0) throw new Error(`needle_transcribe failed (${rc})`);
    const j = JSON.parse(readC(oP, CFG.outCap));
    return { text: (j.text || "").trim(), language: j.language || null };
  } finally {
    allocs.forEach((p) => mod._free(p));
  }
}

// ---------- Whisper ----------
export async function loadWhisper(key, deviceChoice, onStatus) {
  const repo = WHISPER[key];
  const progress_callback = progressFor(`Whisper ${key}`, onStatus);
  const { pipeline } = await getTF();
  const make = (device) =>
    pipeline("automatic-speech-recognition", repo, {
      device,
      dtype: device === "webgpu" ? { encoder_model: "fp32", decoder_model_merged: "q4" } : "q8",
      progress_callback,
    });
  const first = deviceChoice === "auto" ? (navigator.gpu ? "webgpu" : "wasm") : deviceChoice;
  try {
    return { asr: await make(first), device: first };
  } catch (err) {
    if (first !== "webgpu") throw err;
    console.warn("Whisper on WebGPU failed, using WASM", err);
    onStatus("WebGPU failed, switching to CPU…");
    return { asr: await make("wasm"), device: "wasm (webgpu failed)" };
  }
}

export async function whisperRun(asr, pcm, language) {
  const opts = { task: "transcribe", chunk_length_s: 30, stride_length_s: 5 };
  if (language) opts.language = WHISPER_LANG[language];
  const out = await asr(pcm, opts);
  return (out.text || "").trim();
}

// ---------- on-device LLM ----------
export async function loadLLM(key, deviceChoice, onStatus) {
  const repo = LLMS[key];
  const progress_callback = progressFor(`cleanup model (${key})`, onStatus);
  const gpu = deviceChoice === "wasm" ? false : deviceChoice === "webgpu" || !!navigator.gpu;
  const attempts = gpu ? [["webgpu", "q4f16"], ["webgpu", "q4"], ["wasm", "q4"]] : [["wasm", "q4"]];
  const { pipeline } = await getTF();
  let last;
  for (const [device, dtype] of attempts) {
    try {
      const gen = await pipeline("text-generation", repo, { device, dtype, progress_callback });
      return { gen, device: `${device} ${dtype}` };
    } catch (err) {
      last = err;
      console.warn(`LLM ${device}/${dtype} failed`, err);
    }
  }
  throw last;
}

export async function llmRun(gen, messages, maxNewTokens) {
  const out = await gen(messages, { max_new_tokens: maxNewTokens, do_sample: false, return_full_text: false });
  const g = out[0].generated_text;
  return Array.isArray(g) ? g.at(-1).content : g;
}

export async function dispose(obj) {
  try {
    await obj?.dispose?.();
  } catch {}
}
