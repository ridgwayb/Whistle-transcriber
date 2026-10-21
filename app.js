// Whistle in the browser: Cactus Compute's 16.9 MB speech-to-text model,
// run locally through the Needle WebAssembly engine. Audio never leaves the tab.

const CFG = {
  // Engine (needle.js + needle.wasm), pinned to a commit of Cactus-Compute/needle3 so the
  // glue code and binary always match. Change the hash to upgrade.
  engineBase:
    "https://huggingface.co/Cactus-Compute/needle3/resolve/d6c7d6a2e9655505e0f8e23339356dd1705900eb/wasm/",
  // Whistle weights.
  modelUrl: "https://huggingface.co/Cactus-Compute/whistle/resolve/main/whistle.cact",
  cacheName: "whistle-assets-v1",
  sampleRate: 16000,
  outCap: 4 << 20, // 4 MB JSON output buffer
};

const $ = (id) => document.getElementById(id);
const ui = {
  status: $("status"),
  bar: $("bar"),
  barFill: $("barFill"),
  tabs: [...document.querySelectorAll("[data-mode]")],
  panels: [...document.querySelectorAll("[data-panel]")],
  language: $("language"),
  keywords: $("keywords"),
  words: $("words"),
  micBtn: $("micBtn"),
  micLabel: $("micLabel"),
  liveBtn: $("liveBtn"),
  liveLabel: $("liveLabel"),
  level: $("level"),
  levelLive: $("levelLive"),
  fileInput: $("fileInput"),
  drop: $("drop"),
  transcript: $("transcript"),
  committed: $("committed"),
  pending: $("pending"),
  stats: $("stats"),
  wordList: $("wordList"),
  copy: $("copy"),
  save: $("save"),
  clear: $("clear"),
};

let mod = null; // Emscripten module
let busy = false;
const enc = new TextEncoder();
const dec = new TextDecoder();

// ---------- status / progress ----------
function setStatus(msg, kind = "") {
  ui.status.textContent = msg;
  ui.status.dataset.kind = kind;
}
function setProgress(frac) {
  if (frac == null) {
    ui.bar.hidden = true;
    return;
  }
  ui.bar.hidden = false;
  ui.barFill.style.width = `${Math.round(Math.min(1, frac) * 100)}%`;
}
function setReady(on) {
  [ui.micBtn, ui.liveBtn, ui.fileInput].forEach((el) => (el.disabled = !on));
  ui.drop.classList.toggle("disabled", !on);
}

// ---------- download with cache ----------
async function fetchBuffer(url, label, onFrac) {
  const cache = "caches" in self ? await caches.open(CFG.cacheName).catch(() => null) : null;
  const hit = cache && (await cache.match(url).catch(() => null));
  if (hit) {
    onFrac?.(1);
    return hit.arrayBuffer();
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status}`);
  const total = Number(res.headers.get("content-length")) || 0;
  const reader = res.body.getReader();
  const parts = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    got += value.length;
    onFrac?.(total ? got / total : null, got);
  }
  const buf = new Uint8Array(got);
  let o = 0;
  for (const p of parts) {
    buf.set(p, o);
    o += p.length;
  }
  if (cache) cache.put(url, new Response(buf.buffer.slice(0))).catch(() => {});
  return buf.buffer;
}

// ---------- engine helpers ----------
function cstr(s) {
  if (s == null || s === "") return 0;
  const b = enc.encode(s + "\0");
  const p = mod._malloc(b.length);
  mod.HEAPU8.set(b, p);
  return p;
}
function readC(ptr, cap) {
  const heap = mod.HEAPU8;
  let end = ptr;
  const lim = ptr + cap;
  while (end < lim && heap[end] !== 0) end++;
  return dec.decode(heap.subarray(ptr, end));
}
function putPCM(f32) {
  const p = mod._malloc(f32.byteLength);
  mod.HEAPU8.set(new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength), p);
  return p;
}
function lastError() {
  try {
    if (mod._needle_last_error) return readC(mod._needle_last_error(), 4096);
  } catch {}
  return "";
}
function keywordsArg() {
  const k = ui.keywords.value
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join("\n");
  return k || null;
}
function languageArg() {
  return ui.language.value || null; // null = auto-detect
}

// Run a native call with temporary heap allocations and always free them.
function withHeap(fn) {
  const allocs = [];
  const track = (p) => (p && allocs.push(p), p);
  try {
    return fn(track);
  } finally {
    allocs.forEach((p) => mod._free(p));
  }
}

function transcribe(pcm, { language, keywords, wordTimes }) {
  return withHeap((t) => {
    const pP = t(putPCM(pcm));
    const lP = t(cstr(language));
    const kP = t(cstr(keywords));
    const oP = t(mod._malloc(CFG.outCap));
    const rc = mod._needle_transcribe(pP, pcm.length, lP, kP, wordTimes ? 1 : 0, oP, CFG.outCap);
    if (rc < 0) throw new Error(lastError() || `transcribe failed (${rc})`);
    return JSON.parse(readC(oP, CFG.outCap));
  });
}

function streamProcess(pcm, { language, keywords }) {
  return withHeap((t) => {
    const pP = t(putPCM(pcm));
    const lP = t(cstr(language));
    const kP = t(cstr(keywords));
    const oP = t(mod._malloc(1 << 20));
    const rc = mod._needle_stream_transcribe_process(pP, pcm.length, lP, kP, oP, 1 << 20);
    if (rc < 0) throw new Error(lastError() || `stream failed (${rc})`);
    return JSON.parse(readC(oP, 1 << 20));
  });
}

function streamStop() {
  return withHeap((t) => {
    const oP = t(mod._malloc(1 << 20));
    const rc = mod._needle_stream_transcribe_stop(oP, 1 << 20);
    if (rc < 0) throw new Error(lastError() || `stream stop failed (${rc})`);
    return JSON.parse(readC(oP, 1 << 20));
  });
}

// ---------- load engine + model ----------
async function loadEngine() {
  setReady(false);
  try {
    setStatus("Downloading engine…");
    const [jsBuf, wasm] = await Promise.all([
      fetchBuffer(CFG.engineBase + "needle.js", "needle.js"),
      fetchBuffer(CFG.engineBase + "needle.wasm", "needle.wasm"),
    ]);

    // Load the Emscripten glue from a blob so a wrong MIME type on the CDN can't block it.
    const blobUrl = URL.createObjectURL(new Blob([jsBuf], { type: "text/javascript" }));
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = blobUrl;
      s.onload = resolve;
      s.onerror = () => reject(new Error("Could not load needle.js"));
      document.head.appendChild(s);
    });
    if (typeof createNeedle !== "function") throw new Error("needle.js did not define createNeedle");

    setStatus("Downloading Whistle model (16.9 MB, cached after the first visit)…");
    const cact = await fetchBuffer(CFG.modelUrl, "whistle.cact", (f, bytes) => {
      setProgress(f);
      if (f == null) setStatus(`Downloading Whistle model… ${(bytes / 1e6).toFixed(1)} MB`);
    });
    setProgress(null);

    setStatus("Starting engine…");
    mod = await createNeedle({ wasmBinary: wasm });

    const p = mod._malloc(cact.byteLength);
    mod.HEAPU8.set(new Uint8Array(cact), p);
    // The length is a 64-bit integer in the WASM build, so it must be a BigInt.
    const rc = mod._needle_load(p, BigInt(cact.byteLength));
    mod._free(p);
    if (rc < 0) throw new Error(lastError() || "needle_load failed");
    if (mod._needle_models) {
      const kinds = mod._needle_models();
      if (!(kinds & 2)) throw new Error("Engine loaded, but the speech model is missing.");
    }

    setStatus("Ready. Everything runs on this device.", "ok");
    setReady(true);
  } catch (err) {
    console.error(err);
    setProgress(null);
    setStatus(`Could not start: ${err.message}. Check your connection and reload.`, "error");
  }
}

// ---------- audio utilities ----------
class Resampler {
  constructor(inRate, outRate = CFG.sampleRate) {
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

function concat(chunks) {
  const n = chunks.reduce((a, c) => a + c.length, 0);
  const out = new Float32Array(n);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

async function decodeFile(file) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const audio = await ctx.decodeAudioData(await file.arrayBuffer());
  ctx.close();
  const frames = Math.ceil(audio.duration * CFG.sampleRate);
  const off = new OfflineAudioContext(1, frames, CFG.sampleRate); // mixes down to mono
  const src = off.createBufferSource();
  src.buffer = audio;
  src.connect(off.destination);
  src.start();
  const rendered = await off.startRendering();
  return rendered.getChannelData(0);
}

const WORKLET = `
class Tap extends AudioWorkletProcessor {
  constructor(){ super(); this.buf = new Float32Array(2048); this.n = 0; }
  process(inputs){
    const ch = inputs[0][0];
    if (ch) for (let i = 0; i < ch.length; i++) {
      this.buf[this.n++] = ch[i];
      if (this.n === this.buf.length) { this.port.postMessage(this.buf.slice(0)); this.n = 0; }
    }
    return true;
  }
}
registerProcessor('tap', Tap);`;

// Opens the mic and calls onChunk(Float32Array at 16 kHz) as audio arrives.
async function openMic(onChunk, meterEl) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  await ctx.resume();
  const url = URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" }));
  await ctx.audioWorklet.addModule(url);
  URL.revokeObjectURL(url);
  const source = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, "tap");
  const rs = new Resampler(ctx.sampleRate);
  node.port.onmessage = (e) => {
    const raw = e.data;
    let sum = 0;
    for (let i = 0; i < raw.length; i += 8) sum += raw[i] * raw[i];
    meterEl.style.setProperty("--lvl", Math.min(1, Math.sqrt(sum / (raw.length / 8)) * 6).toFixed(3));
    const out = rs.push(raw);
    if (out.length) onChunk(out);
  };
  source.connect(node); // not connected to destination, so no echo
  return {
    stop() {
      node.port.onmessage = null;
      source.disconnect();
      node.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      ctx.close();
      meterEl.style.setProperty("--lvl", "0");
    },
  };
}

// ---------- output ----------
const state = { text: "", words: [] };

function render() {
  ui.committed.textContent = state.text;
  ui.transcript.classList.toggle("empty", !state.text && !ui.pending.textContent);
  ui.wordList.hidden = state.words.length === 0;
  ui.wordList.replaceChildren(
    ...state.words.map((w) => {
      const li = document.createElement("li");
      const t = document.createElement("time");
      t.textContent = `${w.start.toFixed(2)}–${w.end.toFixed(2)}s`;
      const s = document.createElement("span");
      s.textContent = w.word;
      const pr = document.createElement("small");
      pr.textContent = `${Math.round((w.probability ?? 0) * 100)}%`;
      li.append(t, s, pr);
      return li;
    })
  );
  const has = !!state.text;
  ui.copy.disabled = ui.save.disabled = ui.clear.disabled = !has;
}
function addText(t) {
  t = (t || "").trim();
  if (t) state.text = state.text ? `${state.text} ${t}` : t;
}
function showStats(parts) {
  ui.stats.textContent = parts.filter(Boolean).join("  ·  ");
}
const LANGS = { en: "English", de: "German", fr: "French", es: "Spanish", it: "Italian", nl: "Dutch", pl: "Polish" };
const langName = (c) => LANGS[c] || c;

// ---------- modes ----------
let mode = "live";
function setMode(m) {
  if (busy) return;
  mode = m;
  ui.tabs.forEach((t) => t.setAttribute("aria-selected", String(t.dataset.mode === m)));
  ui.panels.forEach((p) => (p.hidden = p.dataset.panel !== m));
  ui.words.disabled = m === "live";
  $("wordsRow").classList.toggle("muted", m === "live");
}
ui.tabs.forEach((t) => t.addEventListener("click", () => setMode(t.dataset.mode)));

// Record, then transcribe the whole clip.
let rec = null;
ui.micBtn.addEventListener("click", async () => {
  if (rec) {
    const { mic, chunks } = rec;
    rec = null;
    mic.stop();
    ui.micBtn.dataset.on = "false";
    ui.micLabel.textContent = "Record";
    const pcm = concat(chunks);
    await runWhole(pcm);
    busy = false;
    return;
  }
  if (busy) return;
  try {
    busy = true;
    const chunks = [];
    const mic = await openMic((c) => chunks.push(c), ui.level);
    rec = { mic, chunks };
    ui.micBtn.dataset.on = "true";
    ui.micLabel.textContent = "Stop and transcribe";
    setStatus("Recording…");
  } catch (err) {
    busy = false;
    setStatus(micError(err), "error");
  }
});

async function runWhole(pcm) {
  if (pcm.length < CFG.sampleRate * 0.3) {
    setStatus("That clip was too short. Try again.", "error");
    return;
  }
  setStatus("Transcribing…");
  await new Promise((r) => setTimeout(r, 30)); // let the UI paint
  try {
    const t0 = performance.now();
    const res = transcribe(pcm, {
      language: languageArg(),
      keywords: keywordsArg(),
      wordTimes: ui.words.checked,
    });
    const ms = performance.now() - t0;
    if (!res.text) {
      setStatus("No speech detected. Silence and steady noise return nothing.", "error");
      return;
    }
    addText(res.text);
    if (res.words) state.words.push(...res.words);
    render();
    showStats([
      res.language && langName(res.language),
      `${(pcm.length / CFG.sampleRate).toFixed(1)} s of audio in ${(ms / 1000).toFixed(2)} s`,
      res.ttft_ms != null && `first token ${res.ttft_ms.toFixed(0)} ms`,
      res.decode_tps != null && `${Math.round(res.decode_tps)} tokens/s`,
    ]);
    setStatus("Done.", "ok");
  } catch (err) {
    console.error(err);
    setStatus(`Transcription failed: ${err.message}`, "error");
  }
}

// Upload / drop a file.
async function handleFile(file) {
  if (!file || busy || !mod) return;
  busy = true;
  try {
    setStatus(`Decoding ${file.name}…`);
    const pcm = await decodeFile(file);
    await runWhole(pcm);
  } catch (err) {
    console.error(err);
    setStatus(`Could not read that file: ${err.message}`, "error");
  } finally {
    busy = false;
    ui.fileInput.value = "";
  }
}
ui.fileInput.addEventListener("change", () => handleFile(ui.fileInput.files[0]));
["dragenter", "dragover"].forEach((ev) =>
  ui.drop.addEventListener(ev, (e) => {
    e.preventDefault();
    ui.drop.classList.add("over");
  })
);
["dragleave", "drop"].forEach((ev) =>
  ui.drop.addEventListener(ev, (e) => {
    e.preventDefault();
    ui.drop.classList.remove("over");
  })
);
ui.drop.addEventListener("drop", (e) => handleFile(e.dataTransfer.files[0]));

// Live: stream words as they are committed.
let live = null;
ui.liveBtn.addEventListener("click", async () => {
  if (live) return stopLive();
  if (busy) return;
  try {
    busy = true;
    const opts = { language: languageArg(), keywords: keywordsArg() };
    const buf = { data: new Float32Array(0) };
    const pump = (final = false) => {
      while (buf.data.length >= CFG.sampleRate || (final && buf.data.length >= 1600)) {
        const take = buf.data.subarray(0, Math.min(buf.data.length, CFG.sampleRate));
        buf.data = buf.data.slice(take.length);
        try {
          const r = streamProcess(take, opts);
          addText(r.text);
          if (r.words?.length) state.words.push(...r.words);
          ui.pending.textContent = r.pending ? ` ${r.pending}` : "";
          if (r.language) showStats([langName(r.language), `${r.received?.toFixed(1)} s heard`, `pass ${Math.round(r.pass_ms)} ms`]);
          render();
        } catch (err) {
          console.error(err);
          setStatus(`Live transcription failed: ${err.message}`, "error");
          return stopLive();
        }
      }
    };
    const mic = await openMic((c) => {
      const m = new Float32Array(buf.data.length + c.length);
      m.set(buf.data);
      m.set(c, buf.data.length);
      buf.data = m;
      pump();
    }, ui.levelLive);
    live = { mic, buf, pump };
    ui.liveBtn.dataset.on = "true";
    ui.liveLabel.textContent = "Stop";
    setStatus("Listening. Words appear as they are confirmed.");
  } catch (err) {
    busy = false;
    setStatus(micError(err), "error");
  }
});

function stopLive() {
  if (!live) return;
  const { mic, buf, pump } = live;
  live = null;
  mic.stop();
  try {
    pump(true);
    const tail = streamStop();
    addText(tail.text);
    if (tail.words?.length) state.words.push(...tail.words);
  } catch (err) {
    console.error(err);
  }
  ui.pending.textContent = "";
  ui.liveBtn.dataset.on = "false";
  ui.liveLabel.textContent = "Start listening";
  busy = false;
  render();
  setStatus("Stopped.", "ok");
}

function micError(err) {
  if (err?.name === "NotAllowedError") return "Microphone blocked. Allow access in your browser's site settings.";
  if (err?.name === "NotFoundError") return "No microphone found.";
  if (!window.isSecureContext) return "The microphone needs HTTPS (or localhost).";
  return `Microphone error: ${err?.message || err}`;
}

// ---------- output actions ----------
ui.copy.addEventListener("click", async () => {
  await navigator.clipboard.writeText(state.text);
  const old = ui.copy.textContent;
  ui.copy.textContent = "Copied";
  setTimeout(() => (ui.copy.textContent = old), 1200);
});
ui.save.addEventListener("click", () => {
  const blob = new Blob([state.text + "\n"], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `transcript-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.txt`;
  a.click();
  URL.revokeObjectURL(a.href);
});
ui.clear.addEventListener("click", () => {
  state.text = "";
  state.words = [];
  ui.pending.textContent = "";
  showStats([]);
  render();
});

// ---------- go ----------
setMode("live");
render();
loadEngine();
