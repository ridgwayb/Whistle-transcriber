import { pipeline, env } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.1";
import { SR, segmentOnPauses, wer, encodeWav, Resampler, concat } from "./compare-utils.js";
import { referenceFromName } from "./passages.js";

env.allowLocalModels = false;

const CFG = {
  engineBase:
    "https://huggingface.co/Cactus-Compute/needle3/resolve/d6c7d6a2e9655505e0f8e23339356dd1705900eb/wasm/",
  whistleUrl: "https://huggingface.co/Cactus-Compute/whistle/resolve/main/whistle.cact",
  cacheName: "whistle-assets-v1", // shared with the main app
  outCap: 4 << 20,
};

const MODELS = [
  { id: "whistle", label: "Whistle", box: "mWhistle", kind: "whistle" },
  { id: "whisper-tiny", label: "Whisper tiny", box: "mTiny", kind: "whisper", repo: "onnx-community/whisper-tiny" },
  { id: "whisper-base", label: "Whisper base", box: "mBase", kind: "whisper", repo: "onnx-community/whisper-base" },
  { id: "whisper-small", label: "Whisper small", box: "mSmall", kind: "whisper", repo: "onnx-community/whisper-small" },
];
const WHISPER_LANG = { en: "english", es: "spanish" };

const $ = (id) => document.getElementById(id);
const enc = new TextEncoder();
const dec = new TextDecoder();

const clips = []; // {name, pcm, dur, ref, url}
const results = {}; // results[clipIndex][modelId] = {...}
const modelInfo = {}; // modelInfo[modelId] = {loadMs, device, error}
let mod = null;
let busy = false;

function setStatus(msg, kind = "") {
  $("status").textContent = msg;
  $("status").dataset.kind = kind;
}

// ---------- Whistle engine (same approach as the main app) ----------
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

async function loadWhistle() {
  if (mod) return;
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
  const cact = await fetchBuffer(CFG.whistleUrl, (f) => f != null && setStatus(`Whistle model ${Math.round(f * 100)}%…`));
  mod = await window.createNeedle({ wasmBinary: wasm });
  const p = mod._malloc(cact.byteLength);
  mod.HEAPU8.set(new Uint8Array(cact), p);
  const rc = mod._needle_load(p, BigInt(cact.byteLength));
  mod._free(p);
  if (rc < 0) throw new Error("needle_load failed");
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
function whistleTranscribe(pcm, language) {
  const allocs = [];
  const t = (p) => (p && allocs.push(p), p);
  try {
    const pP = t(mod._malloc(pcm.byteLength));
    mod.HEAPU8.set(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength), pP);
    const lP = t(cstr(language));
    const oP = t(mod._malloc(CFG.outCap));
    const rc = mod._needle_transcribe(pP, pcm.length, lP, 0, 0, oP, CFG.outCap);
    if (rc < 0) throw new Error(`needle_transcribe failed (${rc})`);
    return JSON.parse(readC(oP, CFG.outCap)).text || "";
  } finally {
    allocs.forEach((p) => mod._free(p));
  }
}

// ---------- Whisper via Transformers.js ----------
async function loadWhisper(repo, deviceChoice) {
  const files = {};
  const progress_callback = (e) => {
    if (e.status === "progress" && e.file) {
      files[e.file] = { loaded: e.loaded, total: e.total };
      const l = Object.values(files).reduce((a, f) => a + f.loaded, 0);
      const tt = Object.values(files).reduce((a, f) => a + f.total, 0);
      setStatus(`Downloading ${repo.split("/")[1]}… ${(l / 1e6).toFixed(0)} / ${(tt / 1e6).toFixed(0)} MB`);
    }
  };
  const make = (device) =>
    pipeline("automatic-speech-recognition", repo, {
      device,
      dtype: device === "webgpu" ? { encoder_model: "fp32", decoder_model_merged: "q4" } : "q8",
      progress_callback,
    });
  let device = deviceChoice === "auto" ? (navigator.gpu ? "webgpu" : "wasm") : deviceChoice;
  try {
    return { asr: await make(device), device };
  } catch (err) {
    if (device !== "webgpu") throw err;
    console.warn("WebGPU failed, falling back to WASM", err);
    return { asr: await make("wasm"), device: "wasm (webgpu failed)" };
  }
}

async function whisperTranscribe(asr, pcm, language) {
  const opts = { task: "transcribe", chunk_length_s: 30, stride_length_s: 5 };
  if (language) opts.language = WHISPER_LANG[language];
  const out = await asr(pcm, opts);
  return (out.text || "").trim();
}

// ---------- audio capture / decoding ----------
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

let recSession = null;
async function startRecording() {
  // Raw capture on purpose: no browser noise suppression or echo cancellation, so every model hears the same thing.
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  await ctx.resume();
  const u = URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" }));
  await ctx.audioWorklet.addModule(u);
  URL.revokeObjectURL(u);
  const src = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, "tap");
  const rs = new Resampler(ctx.sampleRate);
  const chunks = [];
  node.port.onmessage = (e) => {
    const raw = e.data;
    let sum = 0;
    for (let i = 0; i < raw.length; i += 8) sum += raw[i] * raw[i];
    $("meter").style.setProperty("--lvl", Math.min(1, Math.sqrt(sum / (raw.length / 8)) * 6).toFixed(3));
    chunks.push(rs.push(raw));
  };
  src.connect(node);
  recSession = {
    stop() {
      node.port.onmessage = null;
      src.disconnect();
      node.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      ctx.close();
      $("meter").style.setProperty("--lvl", "0");
      return concat(chunks);
    },
  };
}

async function decodeFile(file) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const audio = await ctx.decodeAudioData(await file.arrayBuffer());
  ctx.close();
  const off = new OfflineAudioContext(1, Math.ceil(audio.duration * SR), SR);
  const s = off.createBufferSource();
  s.buffer = audio;
  s.connect(off.destination);
  s.start();
  return (await off.startRendering()).getChannelData(0);
}

// ---------- clips UI ----------
function addClip(name, pcm) {
  const label = name || `clip-${clips.length + 1}`;
  // clips recorded with collect.html carry their language and passage in the filename
  const ref = referenceFromName(label);
  clips.push({ name: label, pcm, dur: pcm.length / SR, ref, url: URL.createObjectURL(encodeWav(pcm)) });
  renderClips();
  $("clipName").value = "";
  $("runBtn").disabled = busy;
}

function renderClips() {
  const box = $("clips");
  if (!clips.length) {
    box.innerHTML = "<p>No clips yet.</p>";
    return;
  }
  box.replaceChildren(
    ...clips.map((c, i) => {
      const d = document.createElement("div");
      d.className = "clip";
      const head = document.createElement("div");
      head.className = "row";
      const title = document.createElement("strong");
      title.textContent = c.name;
      const meta = document.createElement("span");
      meta.className = "meta";
      meta.textContent = `${c.dur.toFixed(1)} s`;
      const del = document.createElement("button");
      del.className = "btn quiet";
      del.textContent = "Remove";
      del.onclick = () => {
        URL.revokeObjectURL(c.url);
        clips.splice(i, 1);
        delete results[i];
        renderClips();
        renderResults();
        $("runBtn").disabled = busy || !clips.length;
      };
      head.append(title, meta, del);
      const audio = document.createElement("audio");
      audio.controls = true;
      audio.src = c.url;
      const det = document.createElement("details");
      const sum = document.createElement("summary");
      sum.textContent = "What was actually said (optional, for word error rate)";
      const ta = document.createElement("textarea");
      ta.value = c.ref;
      ta.oninput = () => {
        c.ref = ta.value;
        renderResults();
      };
      det.append(sum, ta);
      d.append(head, audio, det);
      return d;
    })
  );
}

// ---------- run ----------
function selectedModels() {
  return MODELS.filter((m) => $(m.box).checked);
}

async function run() {
  if (busy || !clips.length) return;
  const chosen = selectedModels();
  if (!chosen.length) return setStatus("Pick at least one model.", "error");
  busy = true;
  $("runBtn").disabled = true;
  $("copyBtn").disabled = true;
  for (const k of Object.keys(results)) delete results[k];
  clips.forEach((_, i) => (results[i] = {}));
  const language = $("lang").value || null;
  const perSeg = $("perSeg").checked;
  const deviceChoice = $("device").value;
  const segs = clips.map((c) => (perSeg ? segmentOnPauses(c.pcm) : null));
  renderResults();

  for (const m of chosen) {
    let engine = null;
    try {
      setStatus(`Loading ${m.label}…`);
      const t0 = performance.now();
      if (m.kind === "whistle") {
        await loadWhistle();
        modelInfo[m.id] = { loadMs: performance.now() - t0, device: "wasm (Needle)" };
      } else {
        engine = await loadWhisper(m.repo, deviceChoice);
        modelInfo[m.id] = { loadMs: performance.now() - t0, device: engine.device };
      }
    } catch (err) {
      console.error(err);
      modelInfo[m.id] = { error: err.message };
      clips.forEach((_, i) => (results[i][m.id] = { error: `could not load: ${err.message}` }));
      renderResults();
      continue;
    }

    for (let i = 0; i < clips.length; i++) {
      const c = clips[i];
      setStatus(`${m.label}: ${c.name} (${i + 1}/${clips.length})…`);
      await new Promise((r) => setTimeout(r, 30)); // let the UI paint
      try {
        const pieces = segs[i] ? segs[i].map((s) => c.pcm.subarray(Math.floor(s.start * SR), Math.floor(s.end * SR))) : [c.pcm];
        const t1 = performance.now();
        const texts = [];
        for (const p of pieces) {
          if (p.length < SR * 0.3) continue;
          texts.push(m.kind === "whistle" ? whistleTranscribe(p, language) : await whisperTranscribe(engine.asr, p, language));
        }
        const ms = performance.now() - t1;
        results[i][m.id] = { text: texts.filter(Boolean).join(" "), ms, pieces: pieces.length };
      } catch (err) {
        console.error(err);
        results[i][m.id] = { error: err.message };
      }
      renderResults();
    }
    if (engine) {
      try {
        await engine.asr.dispose(); // free memory before loading the next model
      } catch {}
    }
  }
  busy = false;
  $("runBtn").disabled = false;
  $("copyBtn").disabled = false;
  setStatus("Done.", "ok");
}

// ---------- results ----------
const pct = (x) => (x == null ? "–" : `${(x * 100).toFixed(0)}%`);

function renderResults() {
  const box = $("results");
  if (!clips.length || !Object.keys(results).length) {
    box.innerHTML = "<p>Nothing yet.</p>";
    return;
  }
  const rows = [];
  clips.forEach((c, i) => {
    const sec = document.createElement("div");
    sec.className = "clip";
    const h = document.createElement("strong");
    h.textContent = `${c.name} (${c.dur.toFixed(1)} s)`;
    sec.append(h);
    const tbl = document.createElement("table");
    tbl.innerHTML = "<thead><tr><th>Model</th><th>WER</th><th>Time</th><th>× real time</th></tr></thead>";
    const body = document.createElement("tbody");
    for (const m of selectedModels()) {
      const r = results[i]?.[m.id];
      if (!r) continue;
      const tr = document.createElement("tr");
      const w = r.text != null ? wer(c.ref, r.text) : null;
      const cells = [
        m.label,
        pct(w),
        r.ms != null ? `${(r.ms / 1000).toFixed(1)} s` : "–",
        r.ms != null ? (r.ms / 1000 / c.dur).toFixed(2) : "–",
      ];
      cells.forEach((v, k) => {
        const td = document.createElement("td");
        if (k > 0) td.className = "num";
        td.textContent = v;
        tr.append(td);
      });
      body.append(tr);
      const t = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 4;
      td.className = r.error ? "text err" : "text";
      td.textContent = r.error || r.text || "(empty)";
      t.append(td);
      body.append(t);
    }
    tbl.append(body);
    sec.append(tbl);
    rows.push(sec);
  });
  const info = document.createElement("p");
  info.className = "meta";
  info.textContent =
    "Model load times: " +
    (Object.entries(modelInfo)
      .map(([k, v]) => `${k} ${v.error ? "failed" : (v.loadMs / 1000).toFixed(1) + " s on " + v.device}`)
      .join("; ") || "–") +
    ". × real time below 1.0 means faster than the audio.";
  box.replaceChildren(...rows, info);
}

function exportJson() {
  const out = {
    device: {
      userAgent: navigator.userAgent,
      cores: navigator.hardwareConcurrency,
      deviceMemoryGB: navigator.deviceMemory ?? null,
      webgpu: !!navigator.gpu,
      crossOriginIsolated: self.crossOriginIsolated,
    },
    settings: { language: $("lang").value || "auto", splitOnPauses: $("perSeg").checked, whisperDevice: $("device").value },
    modelInfo,
    clips: clips.map((c, i) => ({
      name: c.name,
      seconds: +c.dur.toFixed(1),
      reference: c.ref || null,
      results: Object.fromEntries(
        Object.entries(results[i] || {}).map(([k, r]) => [
          k,
          r.error ? { error: r.error } : { text: r.text, wer: c.ref ? +wer(c.ref, r.text).toFixed(3) : null, seconds: +(r.ms / 1000).toFixed(2), pieces: r.pieces },
        ])
      ),
    })),
  };
  return JSON.stringify(out, null, 2);
}

// ---------- wiring ----------
$("recBtn").addEventListener("click", async () => {
  if (recSession) {
    const pcm = recSession.stop();
    recSession = null;
    $("recBtn").dataset.on = "false";
    $("recBtn").textContent = "Record";
    if (pcm.length < SR * 0.5) return setStatus("That recording was too short.", "error");
    addClip($("clipName").value.trim(), pcm);
    setStatus("Clip added.", "ok");
    return;
  }
  try {
    await startRecording();
    $("recBtn").dataset.on = "true";
    $("recBtn").textContent = "Stop";
    setStatus("Recording (raw audio, no noise suppression)…");
  } catch (err) {
    setStatus(`Microphone error: ${err.message}`, "error");
  }
});

$("fileInput").addEventListener("change", async (e) => {
  for (const f of e.target.files) {
    try {
      setStatus(`Decoding ${f.name}…`);
      addClip(f.name.replace(/\.[^.]+$/, ""), await decodeFile(f));
      setStatus("Clip added.", "ok");
    } catch (err) {
      setStatus(`Could not decode ${f.name}: ${err.message}`, "error");
    }
  }
  e.target.value = "";
});

$("runBtn").addEventListener("click", run);
$("copyBtn").addEventListener("click", async () => {
  await navigator.clipboard.writeText(exportJson());
  $("copyBtn").textContent = "Copied";
  setTimeout(() => ($("copyBtn").textContent = "Copy results (JSON)"), 1500);
});

$("recBtn").disabled = false;
setStatus("Add a clip to start.");
