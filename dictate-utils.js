// Pure text helpers for dictate.html (no DOM, no network), so they can be tested in Node.
import { normWords } from "./compare-utils.js";

// Glossary format, one entry per line:
//   Eixample              -> a preferred spelling (given to the cleanup model)
//   eksample => Eixample  -> always replace the heard form with the right one
export function parseGlossary(text) {
  const terms = [];
  const pairs = [];
  for (const raw of String(text || "").split("\n")) {
    const l = raw.trim();
    if (!l) continue;
    if (l.includes("=>")) {
      const [a, b] = l.split("=>").map((s) => s.trim());
      if (a && b) pairs.push([a, b]);
    } else terms.push(l);
  }
  pairs.forEach(([, b]) => terms.push(b));
  return { terms: [...new Set(terms)], pairs };
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function applyPairs(text, pairs) {
  for (const [a, b] of pairs) {
    try {
      const re = new RegExp(`(?<![\\p{L}\\p{N}])${esc(a)}(?![\\p{L}\\p{N}])`, "giu");
      text = text.replace(re, b);
    } catch {
      text = text.split(a).join(b); // very old browsers without lookbehind
    }
  }
  return text;
}

// Whisper tends to invent these on silence or noise.
const HALLUCINATIONS = [
  /^(thank you|thanks|thanks for watching|thank you for watching|you|bye)$/i,
  /^(gracias|gracias por ver( el v[ií]deo)?|suscr[ií]bete)$/i,
  /amara\.org/i,
  /^(\.+|\W*)$/,
];
export function isHallucination(t) {
  const s = String(t || "").trim().replace(/[.!¡¿?\s]+$/g, "");
  return !s || HALLUCINATIONS.some((r) => r.test(s));
}

// ---------- cleanup (on-device LLM or ChatGPT) ----------
const RULES =
  "You correct speech-to-text transcripts. The speaker mixes English and Spanish, sometimes inside one sentence. " +
  "Rules: keep every phrase in the language it was spoken and never translate; fix words that were clearly misheard, " +
  "spelling, accents, punctuation and capitalisation; use the exact spellings from the glossary when a word sounds like one; " +
  "do not add, remove or reorder information; do not explain. Output only the corrected text.";

export function buildMessages(raw, terms) {
  const gloss = terms.length ? `Glossary: ${terms.join(", ")}\n` : "";
  return [
    { role: "system", content: RULES },
    { role: "user", content: `Text:\nhola ben are you coming to the restaurant esta noche a las nueve y media ill bring the wine` },
    { role: "assistant", content: "Hola Ben, are you coming to the restaurant esta noche, a las nueve y media? I'll bring the wine." },
    { role: "user", content: `Text:\nok so ill meet you at the estacion de sants at half passed six` },
    { role: "assistant", content: "OK, so I'll meet you at the estación de Sants at half past six." },
    { role: "user", content: `${gloss}Text:\n${raw}` },
  ];
}

export function chatGptPrompt(raw, terms) {
  const gloss = terms.length ? `\nGlossary (use these spellings): ${terms.join(", ")}\n` : "";
  return `${RULES}\n${gloss}\nText:\n${raw}`;
}

export function cleanOutput(s) {
  let t = String(s || "").trim();
  t = t.replace(/^(corrected text|text|corrected)\s*:\s*/i, "");
  t = t.replace(/^["“«]\s*([\s\S]*?)\s*["”»]$/, "$1");
  return t.trim();
}

// A small model sometimes rewrites or rambles. Accept its output only if it looks like a light edit.
export function acceptClean(raw, cleaned) {
  if (!cleaned) return null;
  const ratio = cleaned.length / Math.max(1, raw.length);
  if (ratio < 0.6 || ratio > 1.5) return null;
  const a = normWords(raw);
  const pool = new Map();
  a.forEach((w) => pool.set(w, (pool.get(w) || 0) + 1));
  const b = normWords(cleaned);
  if (!b.length) return null;
  let hit = 0;
  for (const w of b) if ((pool.get(w) || 0) > 0) (hit++, pool.set(w, pool.get(w) - 1));
  return hit / b.length >= 0.6 ? cleaned : null;
}

// Language chosen for one pause-delimited piece when mixing English and Spanish.
export function pickLang(detected, previous, assume) {
  if (detected === "en" || detected === "es") return detected;
  return previous || assume;
}
