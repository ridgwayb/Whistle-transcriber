import { SR, segmentOnPauses, Resampler, concat } from "./compare-utils.js";
import * as E from "./engine.js";
import {
  parseGlossary,
  applyPairs,
  isHallucination,
  buildMessages,
  chatGptPrompt,
  cleanOutput,
  acceptClean,
  pickLang,
} from "./dictate-utils.js";

const $ = (id) => document.getElementById(id);

// ---------- settings (saved on this device) ----------
const DEFAULTS = {
  model: "small",
  lang: "mix",
  cleanup: false,
  llm: "0.5b",
  device: "auto",
  filter: false,
  lowMem: false,
  assume: "en",
  glossary: "",
  noisy: false,
};
let S = { ...DEFAULTS };
try {
  S = { ...DEFAULTS, ...JSON.parse(localStorage.getItem("dictate-settings") || "{}") };
} catch {}
const save = () => {
  try {
    localStorage.setItem("dictate-settings", JSON.stringify(S));
  } catch {}
};
const FIELDS = ["model", "lang", "cleanup", "llm", "device", "filter", "lowMem", "assume", "glossary", "noisy"];
for (const k of FIELDS) {
  const el = $(k);
  if (el.type === "checkbox") el.checked = !!S[k];
  else el.value = S[k];
  el.addEventListener("change", () => {
    S[k] = el.type === "checkbox" ? el.checked : el.value;
    save();
    if (["model", "lang", "device"].includes(k)) warm();
  });
}

// ---------- status ----------
function setStatus(msg, kind = "") {
  $("status").textContent = msg;
  $("status").dataset.kind = kind;
}
const paint = () => new Promise((r) => setTimeout(r, 20));
const devices = { speech: "", cleanup: "" };
function showDevices() {
  $("devInfo").textContent =
    [`WebGPU ${navigator.gpu ? "available" : "not available"}`, devices.speech && `speech: ${devices.speech}`, devices.cleanup && `cleanup: ${devices.cleanup}`]
      .filter(Boolean)
      .join(" · ");
}

// ---------- model management ----------
let asrP = null;
let asrKey = "";
function ensureAsr() {
  const key = `${S.model}|${S.device}`;
  if (asrP && asrKey === key) return asrP;
  const old = asrP;
  asrKey = key;
  const p = (async () => {
    if (old) E.dispose((await old.catch(() => null))?.asr);
    const r = await E.loadWhisper(S.model, S.device, setStatus);
    devices.speech = `Whisper ${S.model} on ${r.device}`;
    showDevices();
    return r;
  })();
  asrP = p;
  p.catch(() => {
    if (asrP === p) asrP = null;
  });
  return p;
}
async function freeAsr() {
  const p = asrP;
  asrP = null;
  asrKey = "";
  if (p) await E.dispose((await p.catch(() => null))?.asr);
}

let llmP = null;
let llmKey = "";
function ensureLlm() {
  const key = `${S.llm}|${S.device}`;
  if (llmP && llmKey === key) return llmP;
  const old = llmP;
  llmKey = key;
  const p = (async () => {
    if (old) E.dispose((await old.catch(() => null))?.gen);
    const r = await E.loadLLM(S.llm, S.device, setStatus);
    devices.cleanup = `Qwen2.5 ${S.llm} on ${r.device}`;
    showDevices();
    return r;
  })();
  llmP = p;
  p.catch(() => {
    if (llmP === p) llmP = null;
  });
  return p;
}
async function freeLlm() {
  const p = llmP;
  llmP = null;
  llmKey = "";
  if (p) await E.dispose((await p.catch(() => null))?.gen);
}

let warming = 0;
async function warm() {
  const id = ++warming;
  try {
    setStatus("Loading speech model…");
    if (S.model === "whistle" || S.lang === "mix") await E.loadWhistle(setStatus);
    if (S.model !== "whistle") await ensureAsr();
    if (id === warming && !busy) setStatus("Ready. Tap Record.", "ok");
  } catch (err) {
    console.error(err);
    if (id === warming) setStatus(`Could not load the speech model: ${err.message}`, "error");
  }
}

// ---------- capture ----------
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

let rec = null;
let busy = false;

async function startRecording() {
  const filter = S.filter || S.noisy;
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: filter, noiseSuppression: filter, autoGainControl: filter },
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
  rec = {
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

function setRecUi(on) {
  $("recBtn").dataset.on = String(on);
  $("recLabel").textContent = on ? "Stop" : "Record";
}
function setBusy(on) {
  busy = on;
  $("recBtn").disabled = on;
  $("fileInput").disabled = on;
}

$("recBtn").addEventListener("click", async () => {
  if (busy) return;
  if (rec) {
    const pcm = rec.stop();
    rec = null;
    setRecUi(false);
    return run(pcm);
  }
  try {
    await startRecording();
    setRecUi(true);
    setStatus(S.noisy ? "Recording with the noise filter on…" : "Recording…");
  } catch (err) {
    setStatus(
      err?.name === "NotAllowedError"
        ? "Microphone blocked. Allow access in your browser's site settings."
        : err?.name === "NotFoundError"
          ? "No microphone found."
          : `Microphone error: ${err?.message || err}`,
      "error"
    );
  }
});

$("fileInput").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f || busy) return;
  try {
    setBusy(true);
    setStatus(`Decoding ${f.name}…`);
    const pcm = await decodeFile(f);
    setBusy(false);
    await run(pcm);
  } catch (err) {
    setBusy(false);
    setStatus(`Could not read that file: ${err.message}`, "error");
  }
});

// ---------- pipeline ----------
const result = { raw: "", clean: null, tab: "clean", terms: [] };

async function run(pcm) {
  setBusy(true);
  try {
    const pieces = segmentOnPauses(pcm, { pad: S.noisy ? 0.35 : 0.2 })
      .map((s) => pcm.subarray(Math.floor(s.start * SR), Math.floor(s.end * SR)))
      .filter((p) => p.length >= SR * 0.3);
    if (!pieces.length) return setStatus("No speech found.", "error");

    const { terms, pairs } = parseGlossary(S.glossary);
    const keywords = terms.length ? terms.join("\n") : null;
    const texts = [];
    const langs = [];
    const t0 = performance.now();

    if (S.model === "whistle") {
      await E.loadWhistle(setStatus);
      const forced = S.lang === "en" || S.lang === "es" ? S.lang : null;
      for (let i = 0; i < pieces.length; i++) {
        setStatus(`Transcribing ${i + 1} of ${pieces.length}…`);
        await paint();
        const r = E.whistleRun(pieces[i], forced, keywords);
        texts.push(r.text);
        langs.push(r.language || forced || "?");
      }
    } else {
      const { asr } = await ensureAsr();
      const mix = S.lang === "mix";
      if (mix) await E.loadWhistle(setStatus); // fast language ID for each piece
      let prev = null;
      for (let i = 0; i < pieces.length; i++) {
        setStatus(`Transcribing ${i + 1} of ${pieces.length}…`);
        await paint();
        let lang = null;
        if (mix) {
          lang = pickLang(E.whistleRun(pieces[i], null, null).language, prev, S.assume);
          prev = lang;
        } else if (S.lang === "en" || S.lang === "es") lang = S.lang;
        texts.push(await E.whisperRun(asr, pieces[i], lang));
        langs.push(lang || "auto");
      }
      if (S.lowMem) await freeAsr();
    }

    const raw = applyPairs(texts.filter((t) => !isHallucination(t)).join(" "), pairs).replace(/\s+/g, " ").trim();
    const asrSec = (performance.now() - t0) / 1000;
    if (!raw) return setStatus("No speech detected. Silence and steady noise return nothing.", "error");

    // optional cleanup
    let clean = null;
    let note = "";
    let cleanSec = 0;
    if (S.cleanup || S.noisy) {
      try {
        setStatus("Loading cleanup model…");
        const { gen } = await ensureLlm();
        setStatus("Cleaning up…");
        await paint();
        const t1 = performance.now();
        const out = await E.llmRun(gen, buildMessages(raw, terms), Math.min(400, Math.ceil(raw.length / 2.5) + 48));
        cleanSec = (performance.now() - t1) / 1000;
        clean = acceptClean(raw, cleanOutput(out));
        if (!clean) note = "Cleanup skipped: the model's output looked unreliable.";
        else if (clean === raw) note = "Cleanup found nothing to change.";
        if (S.lowMem) await freeLlm();
      } catch (err) {
        console.error(err);
        note = `Cleanup failed: ${err.message}`;
      }
    }

    result.raw = raw;
    result.clean = clean && clean !== raw ? clean : null;
    result.terms = terms;
    result.tab = result.clean ? "clean" : "raw";
    show();
    const dur = pcm.length / SR;
    $("stats").textContent = [
      `${dur.toFixed(1)} s of audio`,
      `${pieces.length} piece${pieces.length > 1 ? "s" : ""}: ${langs.map((l) => String(l).toUpperCase()).join(" ")}`,
      `speech ${asrSec.toFixed(1)} s`,
      cleanSec && `cleanup ${cleanSec.toFixed(1)} s`,
      note,
    ]
      .filter(Boolean)
      .join("  ·  ");
    setStatus("Done.", "ok");
  } catch (err) {
    console.error(err);
    setStatus(`Something went wrong: ${err.message}`, "error");
  } finally {
    setBusy(false);
  }
}

// ---------- output ----------
const current = () => (result.tab === "clean" && result.clean ? result.clean : result.raw);

function show() {
  const has = !!result.raw;
  $("out").textContent = current();
  $("out").classList.toggle("empty", !has);
  $("tabs").hidden = !result.clean;
  $("tabClean").setAttribute("aria-selected", String(result.tab === "clean"));
  $("tabRaw").setAttribute("aria-selected", String(result.tab === "raw"));
  ["copyBtn", "shareBtn", "chatBtn", "clearBtn"].forEach((id) => ($(id).disabled = !has));
}

$("tabClean").addEventListener("click", () => ((result.tab = "clean"), show()));
$("tabRaw").addEventListener("click", () => ((result.tab = "raw"), show()));

async function flash(btn, text) {
  const old = btn.textContent;
  btn.textContent = text;
  setTimeout(() => (btn.textContent = old), 1300);
}
$("copyBtn").addEventListener("click", async () => {
  await navigator.clipboard.writeText(current());
  flash($("copyBtn"), "Copied");
});
$("chatBtn").addEventListener("click", async () => {
  await navigator.clipboard.writeText(chatGptPrompt(result.raw, result.terms));
  flash($("chatBtn"), "Copied");
});
if (navigator.share) {
  $("shareBtn").hidden = false;
  $("shareBtn").addEventListener("click", () => navigator.share({ text: current() }).catch(() => {}));
}
$("clearBtn").addEventListener("click", () => {
  Object.assign(result, { raw: "", clean: null, tab: "clean" });
  $("stats").textContent = "";
  show();
});
$("freeBtn").addEventListener("click", async () => {
  await freeAsr();
  await freeLlm();
  devices.speech = devices.cleanup = "";
  showDevices();
  setStatus("Models unloaded. They reload from the cache on next use.");
});

// ---------- go ----------
window.addEventListener("error", (e) => setStatus(`Error: ${e.message}`, "error"));
window.addEventListener("unhandledrejection", (e) => setStatus(`Error: ${e.reason?.message || e.reason}`, "error"));
showDevices();
show();
$("recBtn").disabled = false;
warm();
