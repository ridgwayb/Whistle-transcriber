// dictate.js
//
// This file implements the main transcription UI for the browser-based speech recognition app.
// It manages:
//   - saved user settings
//   - microphone and file input capture
//   - model loading and memory cleanup
//   - transcription of audio into text
//   - optional cleanup with an LLM
//   - UI state for displaying, copying, sharing, and clearing transcriptions
//
// The app is built around a few main ideas:
//   1. Audio is captured as PCM samples.
//   2. The audio is split into pieces using pause detection.
//   3. Each piece is transcribed with a speech model.
//   4. A glossary can correct words or phrases before final output.
//   5. Optional cleanup with an LLM can refine the final transcript.
//   6. The user can switch between raw and cleaned output.

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

// A very small helper used throughout the file to access DOM nodes by id.
// This reduces repeated calls to document.getElementById(...).
const $ = (id) => document.getElementById(id);

// -----------------------------------------------------------------------------
// Settings and persistence
// -----------------------------------------------------------------------------
//
// These settings are stored on this device using localStorage, so the app can
// remember the user's preferences on the next visit without a backend.
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

// S holds the current settings object.
// We first use DEFAULTS and then merge any saved values from localStorage.
let S = { ...DEFAULTS };
try {
  S = { ...DEFAULTS, ...JSON.parse(localStorage.getItem("dictate-settings") || "{}") };
} catch {}

// save stores the current settings to localStorage.
// If localStorage is unavailable or fails, the try/catch prevents the app from crashing.
const save = () => {
  try {
    localStorage.setItem("dictate-settings", JSON.stringify(S));
  } catch {}
};

// These are the relevant form controls that can change application behavior.
// We keep the DOM UI and the JS settings state synchronized.
const FIELDS = ["model", "lang", "cleanup", "llm", "device", "filter", "lowMem", "assume", "glossary", "noisy"];

for (const k of FIELDS) {
  const el = $(k);

  // For checkboxes, the value in localStorage is boolean-like.
  // For input/select elements, the value is always a string.
  if (el.type === "checkbox") el.checked = !!S[k];
  else el.value = S[k];

  // When the user changes any field, update the settings object and save it.
  el.addEventListener("change", () => {
    S[k] = el.type === "checkbox" ? el.checked : el.value;
    save();

    // Some settings affect model loading.
    // For example, switching model/language/device usually requires re-warming the model.
    if (["model", "lang", "device"].includes(k)) warm();
  });
}

// -----------------------------------------------------------------------------
// Status UI
// -----------------------------------------------------------------------------
//
// This is a general helper for setting the app's status banner.
// The "kind" value is used by CSS to color and style the banner depending on state.
// For example: "ok" for success, "error" for failures.
function setStatus(msg, kind = "") {
  $("status").textContent = msg;
  $("status").dataset.kind = kind;
}

// A tiny pause used between UI updates so the browser can repaint progress messages
// and keep the interface responsive during longer async operations.
const paint = () => new Promise((r) => setTimeout(r, 20));

// This object stores which model is currently loaded and on what device.
// We use it to show concise hardware information in the interface.
const devices = { speech: "", cleanup: "" };

// Displays a summary of available WebGPU and model information.
function showDevices() {
  $("devInfo").textContent =
    [
      `WebGPU ${navigator.gpu ? "available" : "not available"}`,
      devices.speech && `speech: ${devices.speech}`,
      devices.cleanup && `cleanup: ${devices.cleanup}`,
    ]
      .filter(Boolean)
      .join(" · ");
}

// -----------------------------------------------------------------------------
// Model management
// -----------------------------------------------------------------------------
//
// The app loads speech recognition and cleanup models lazily.
// This avoids slowing down the initial page load.
// It also keeps a cache so we do not load the same model repeatedly for the same
// configuration while the app is active.

let asrP = null;
let asrKey = "";

function ensureAsr() {
  const key = `${S.model}|${S.device}`;

  // If this exact model/device combination is already loaded, reuse it.
  if (asrP && asrKey === key) return asrP;

  const old = asrP;
  asrKey = key;

  // This promise loads the Whisper ASR model and stores it in the cache.
  const p = (async () => {
    // Dispose the old ASR instance before replacing it with a new one.
    if (old) E.dispose((await old.catch(() => null))?.asr);

    const r = await E.loadWhisper(S.model, S.device, setStatus);
    devices.speech = `Whisper ${S.model} on ${r.device}`;
    showDevices();
    return r;
  })();

  asrP = p;

  // If the load fails, clear the in-flight cache entry so a later call can retry cleanly.
  p.catch(() => {
    if (asrP === p) asrP = null;
  });

  return p;
}

// Releases the active ASR model from memory, if present.
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

  // Reuse the same cleanup model when the settings haven't changed.
  if (llmP && llmKey === key) return llmP;

  const old = llmP;
  llmKey = key;

  // This promise loads the LLM used for transcript cleanup.
  const p = (async () => {
    // Dispose the old LLM instance before swapping in the new configuration.
    if (old) E.dispose((await old.catch(() => null))?.gen);

    const r = await E.loadLLM(S.llm, S.device, setStatus);
    devices.cleanup = `Qwen2.5 ${S.llm} on ${r.device}`;
    showDevices();
    return r;
  })();

  llmP = p;

  // Clear stale promise cache entries on failure.
  p.catch(() => {
    if (llmP === p) llmP = null;
  });

  return p;
}

// Releases the active cleanup model from memory.
async function freeLlm() {
  const p = llmP;
  llmP = null;
  llmKey = "";

  if (p) await E.dispose((await p.catch(() => null))?.gen);
}

let warming = 0;

// warm() makes sure the correct speech model is available before use.
// This prevents the first transcription from feeling unexpectedly slow.
async function warm() {
  const id = ++warming;

  try {
    setStatus("Loading speech model…");

    // If the user is using the Whistle model or mixed-language mode,
    // load the Whistle language detector immediately.
    if (S.model === "whistle" || S.lang === "mix") await E.loadWhistle(setStatus);

    // If not using Whistle as the main model, we need Whisper as the main ASR engine.
    if (S.model !== "whistle") await ensureAsr();

    // Only show "Ready" if this is still the most recent warm-up request.
    if (id === warming && !busy) setStatus("Ready. Tap Record.", "ok");
  } catch (err) {
    console.error(err);
    if (id === warming) {
      setStatus(`Could not load the speech model: ${err.message}`, "error");
    }
  }
}

// -----------------------------------------------------------------------------
// Audio capture
// -----------------------------------------------------------------------------
//
// This app records from the browser microphone with a small AudioWorklet.
// A worklet runs on a separate thread and can harvest audio samples in real time
// without blocking the main JS thread.

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

// Starts microphone capture and returns a recorder object that can stop and return audio.
async function startRecording() {
  // If the user enables filter/noisy, we lower mic echo/noise aggressively.
  const filter = S.filter || S.noisy;

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: filter,
      noiseSuppression: filter,
      autoGainControl: filter,
    },
  });

  // Create a new AudioContext and resume it so it can actually play audio worklet tasks.
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  await ctx.resume();

  // Load the worklet script from a Blob URL and then create a source node from the microphone stream.
  const u = URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" }));
  await ctx.audioWorklet.addModule(u);
  URL.revokeObjectURL(u);

  const src = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, "tap");

  // Resample the audio to a consistent rate for downstream processing.
  const rs = new Resampler(ctx.sampleRate);

  // Collect the audio chunks in memory while recording.
  const chunks = [];

  // On every worklet message, compute a simple volume meter and store the audio data.
  node.port.onmessage = (e) => {
    const raw = e.data;
    let sum = 0;

    // Compute RMS-like amplitude from the sample buffer.
    for (let i = 0; i < raw.length; i += 8) sum += raw[i] * raw[i];

    $("meter").style.setProperty("--lvl", Math.min(1, Math.sqrt(sum / (raw.length / 8)) * 6).toFixed(3));
    chunks.push(rs.push(raw));
  };

  src.connect(node);

  // The recorder object stores a stop() method that ends the capture and returns the PCM buffer.
  rec = {
    stop() {
      node.port.onmessage = null;
      src.disconnect();
      node.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      ctx.close();
      $("meter").style.setProperty("--lvl", "0");

      // Concatenate all the chunks into a single PCM float array.
      return concat(chunks);
    },
  };
}

// decodeFile reads an uploaded audio file and converts it into PCM samples.
// Then it can be processed like recording data.
async function decodeFile(file) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const audio = await ctx.decodeAudioData(await file.arrayBuffer());
  ctx.close();

  // Offline rendering lets us decode the audio and convert it to a plain PCM buffer.
  const off = new OfflineAudioContext(1, Math.ceil(audio.duration * SR), SR);
  const s = off.createBufferSource();
  s.buffer = audio;
  s.connect(off.destination);
  s.start();

  return (await off.startRendering()).getChannelData(0);
}

// Toggles UI between record and stop states.
function setRecUi(on) {
  $("recBtn").dataset.on = String(on);
  $("recLabel").textContent = on ? "Stop" : "Record";
}

// Controls the app's busy state.
// While busy is true, the record button and file input are disabled to avoid overlapping jobs.
function setBusy(on) {
  busy = on;
  $("recBtn").disabled = on;
  $("fileInput").disabled = on;
}

// When the user clicks the Record/Stop button:
// - If already recording: stop and run transcription.
// - If not recording: begin capturing audio.
$("recBtn").addEventListener("click", async () => {
  if (busy) return;

  if (rec) {
    const pcm = rec.stop();
    rec = null;
    setRecUi(false);

    // Run the transcription pipeline on the final captured audio.
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

// When the user selects a local file, decode it and process it through the same pipeline.
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

// -----------------------------------------------------------------------------
// Main processing pipeline
// -----------------------------------------------------------------------------
//
// result tracks the working transcript and the optional cleaned version.
const result = { raw: "", clean: null, tab: "clean", terms: [] };

// run() is the heart of the app.
// It:
//   - breaks the audio into chunks by pause detection
//   - transcribes each chunk
//   - filters hallucinations
//   - applies glossary substitutions
//   - optionally cleans with LLM
//   - updates the UI and stats
async function run(pcm) {
  setBusy(true);

  try {
    // Use pause detection to split the audio into candidate speech segments.
    // The padding is slightly higher in noisy mode to reduce accidental clipping at segment boundaries.
    const pieces = segmentOnPauses(pcm, { pad: S.noisy ? 0.35 : 0.2 })
      .map((s) => pcm.subarray(Math.floor(s.start * SR), Math.floor(s.end * SR)))
      .filter((p) => p.length >= SR * 0.3);

    if (!pieces.length) {
      return setStatus("No speech found.", "error");
    }

    const { terms, pairs } = parseGlossary(S.glossary);
    const keywords = terms.length ? terms.join("\n") : null;

    const texts = [];
    const langs = [];
    const t0 = performance.now();

    // -------------------------------------------------------------------------
    // ASR path selection
    // -------------------------------------------------------------------------
    //
    // There are two core transcription modes:
    // 1) "whistle" mode: use the Whistle model directly for each speech piece.
    // 2) standard mode: use Whisper, optionally using Whistle for language ID.
    if (S.model === "whistle") {
      await E.loadWhistle(setStatus);

      // If the user chose a single language (English or Spanish), force that language.
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

      // In mixed-language mode, use Whistle as a quick way to decide which language
      // Whisper should decode for each segment.
      if (mix) await E.loadWhistle(setStatus);

      let prev = null;

      for (let i = 0; i < pieces.length; i++) {
        setStatus(`Transcribing ${i + 1} of ${pieces.length}…`);
        await paint();

        let lang = null;

        if (mix) {
          // Use the previous language as a weak continuity signal.
          lang = pickLang(E.whistleRun(pieces[i], null, null).language, prev, S.assume);
          prev = lang;
        } else if (S.lang === "en" || S.lang === "es") {
          lang = S.lang;
        }

        texts.push(await E.whisperRun(asr, pieces[i], lang));
        langs.push(lang || "auto");
      }

      if (S.lowMem) await freeAsr();
    }

    // Apply glossary substitutions and remove obvious hallucinations before display.
    // This helps correct common misrecognitions and user-defined terminology.
    const raw = applyPairs(
      texts.filter((t) => !isHallucination(t)).join(" "),
      pairs
    )
      .replace(/\s+/g, " ")
      .trim();

    const asrSec = (performance.now() - t0) / 1000;

    if (!raw) {
      return setStatus("No speech detected. Silence and steady noise return nothing.", "error");
    }

    // -------------------------------------------------------------------------
    // Optional cleanup with LLM
    // -------------------------------------------------------------------------
    //
    // Cleanup is optional and is triggered when:
    // - S.cleanup is true
    // - or S.noisy is true (which often benefits from cleanup)
    //
    // The LLM reads the transcript and tries to improve punctuation, grammar,
    // and obvious transcription mistakes while staying conservative.
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
        const out = await E.llmRun(
          gen,
          buildMessages(raw, terms),
          Math.min(400, Math.ceil(raw.length / 2.5) + 48)
        );

        cleanSec = (performance.now() - t1) / 1000;

        // Validate the LLM response before accepting it as the cleaned transcript.
        clean = acceptClean(raw, cleanOutput(out));

        if (!clean) {
          note = "Cleanup skipped: the model's output looked unreliable.";
        } else if (clean === raw) {
          note = "Cleanup found nothing to change.";
        }

        if (S.lowMem) await freeLlm();
      } catch (err) {
        console.error(err);
        note = `Cleanup failed: ${err.message}`;
      }
    }

    // Save the final results to the shared state object.
    result.raw = raw;
    result.clean = clean && clean !== raw ? clean : null;
    result.terms = terms;
    result.tab = result.clean ? "clean" : "raw";

    show();

    // Build the stats line displayed under the output.
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

// -----------------------------------------------------------------------------
// Output rendering and controls
// -----------------------------------------------------------------------------
//
// The UI can show either:
 // - cleaned transcript
 // - raw transcript
//
// The current() helper chooses whichever tab is active, unless the cleaned version is unavailable.

const current = () => (result.tab === "clean" && result.clean ? result.clean : result.raw);

function show() {
  const has = !!result.raw;

  $("out").textContent = current();
  $("out").classList.toggle("empty", !has);

  $("tabs").hidden = !result.clean;
  $("tabClean").setAttribute("aria-selected", String(result.tab === "clean"));
  $("tabRaw").setAttribute("aria-selected", String(result.tab === "raw"));

  ["copyBtn", "shareBtn", "chatBtn", "clearBtn"].forEach((id) => {
    $(id).disabled = !has;
  });
}

// Switching tabs changes which transcript is currently displayed.
$("tabClean").addEventListener("click", () => ((result.tab = "clean"), show()));
$("tabRaw").addEventListener("click", () => ((result.tab = "raw"), show()));

// flash() temporarily replaces button text so the user gets immediate feedback
// that an action like "copy" or "share" succeeded.
async function flash(btn, text) {
  const old = btn.textContent;
  btn.textContent = text;
  setTimeout(() => (btn.textContent = old), 1300);
}

// Copy the currently displayed transcript to the clipboard.
$("copyBtn").addEventListener("click", async () => {
  await navigator.clipboard.writeText(current());
  flash($("copyBtn"), "Copied");
});

// Copy a prompt that can be used in ChatGPT-like workflows to summarize or continue editing the raw transcript.
$("chatBtn").addEventListener("click", async () => {
  await navigator.clipboard.writeText(chatGptPrompt(result.raw, result.terms));
  flash($("chatBtn"), "Copied");
});

// If the browser supports the Web Share API, show the share button.
// This allows sharing the transcript to other apps or contacts.
if (navigator.share) {
  $("shareBtn").hidden = false;
  $("shareBtn").addEventListener("click", () =>
    navigator.share({ text: current() }).catch(() => {})
  );
}

// Clear the transcript and stats without reloading the page.
$("clearBtn").addEventListener("click", () => {
  Object.assign(result, { raw: "", clean: null, tab: "clean" });
  $("stats").textContent = "";
  show();
});

// freeBtn manually unloads cached models to free memory.
// This is useful on low-memory devices or when the user wants to reclaim RAM.
$("freeBtn").addEventListener("click", async () => {
  await freeAsr();
  await freeLlm();

  devices.speech = devices.cleanup = "";
  showDevices();
  setStatus("Models unloaded. They reload from the cache on next use.");
});

// -----------------------------------------------------------------------------
// Bootstrapping
// -----------------------------------------------------------------------------
//
// This code runs when the page finishes loading and initializes the entire app.
window.addEventListener("error", (e) => setStatus(`Error: ${e.message}`, "error"));
window.addEventListener("unhandledrejection", (e) =>
  setStatus(`Error: ${e.reason?.message || e.reason}`, "error")
);

showDevices();
show();
$("recBtn").disabled = false;

// Kick off the initial warm-up process for the speech model.
warm();
