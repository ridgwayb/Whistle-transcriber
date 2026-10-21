import { PASSAGES, LANG_NAMES } from "./passages.js";
import { SR, Resampler, concat, encodeWav } from "./compare-utils.js";

// ---- Configure after deploying apps-script/Code.gs (see README). Leave url empty to
// ---- disable direct upload; the Share / Download buttons still work.
const UPLOAD = {
  url: "",
  secret: "",
};

const MIN_SECONDS = 2;
const MAX_SECONDS = 45;

const I18N = {
  en: {
    title: "Voice test",
    intro: "Thanks for helping! Please read each text out loud and record it. It takes about 5 minutes.",
    consent: "Your recordings are only used to test speech-to-text models for a personal project. They are stored in a private Google Drive, not shared, and I'll delete them whenever you ask.",
    how: "Hold your phone the way you normally do when sending a voice message. Read at a normal pace with a short pause between sentences. If you stumble, carry on instead of starting again.",
    nameLabel: "Your first name",
    readLabel: "I'll read in",
    quiet: "Quiet place", quietHow: "Indoors, door closed.",
    street: "Busy street", streetHow: "Outside on a busy pavement, with traffic or people around.",
    mixed: "Optional: mixed languages", mixedHow: "Only if you speak English too. Read this line with the language switches as written.",
    passage: "Text {x}", record: "Record", stop: "Stop", redo: "Record again", recorded: "Recorded ({s} s)",
    recording: "Recording…", tooShort: "Too short, please try again.",
    send: "Send my recordings", sending: "Sending {n} of {m}…", sentAll: "All sent. Thank you!",
    sentSome: "{n} of {m} sent. Tap Send again to retry, or use Share below.",
    backup: "Can't send? Share or download your recordings instead:", share: "Share…", download: "Download",
    nothing: "Record at least one text first.", allDone: "Everything is already sent.",
    micBlocked: "Microphone blocked. Allow access in your browser's site settings.",
    micNone: "No microphone found.", micErr: "Microphone error: {msg}",
    switchLang: "Changing the reading language will remove your recordings. Continue?",
  },
  nl: {
    title: "Stemtest",
    intro: "Bedankt voor je hulp! Lees elke tekst hardop voor en neem hem op. Het duurt ongeveer 5 minuten.",
    consent: "Je opnames worden alleen gebruikt om spraak-naar-tekstmodellen te testen voor een persoonlijk project. Ze worden bewaard in een privé Google Drive, niet gedeeld, en ik verwijder ze zodra je erom vraagt.",
    how: "Houd je telefoon zoals je dat normaal doet bij een spraakbericht. Lees in een normaal tempo met een korte pauze tussen de zinnen. Als je je verspreekt, ga gewoon door in plaats van opnieuw te beginnen.",
    nameLabel: "Je voornaam",
    readLabel: "Ik lees voor in het",
    quiet: "Rustige plek", quietHow: "Binnen, met de deur dicht.",
    street: "Drukke straat", streetHow: "Buiten op een drukke stoep, met verkeer of mensen in de buurt.",
    mixed: "Optioneel: gemengde talen", mixedHow: "Alleen als je ook Engels spreekt. Lees deze zin met de taalwisselingen zoals geschreven.",
    passage: "Tekst {x}", record: "Opnemen", stop: "Stop", redo: "Opnieuw opnemen", recorded: "Opgenomen ({s} s)",
    recording: "Opname loopt…", tooShort: "Te kort, probeer het opnieuw.",
    send: "Mijn opnames versturen", sending: "Versturen {n} van {m}…", sentAll: "Alles verstuurd. Bedankt!",
    sentSome: "{n} van {m} verstuurd. Tik opnieuw op Versturen om het nog eens te proberen, of gebruik Delen hieronder.",
    backup: "Lukt versturen niet? Deel of download je opnames dan:", share: "Delen…", download: "Downloaden",
    nothing: "Neem eerst minstens één tekst op.", allDone: "Alles is al verstuurd.",
    micBlocked: "Microfoon geblokkeerd. Geef toegang in de site-instellingen van je browser.",
    micNone: "Geen microfoon gevonden.", micErr: "Microfoonfout: {msg}",
    switchLang: "Als je de voorleestaal wijzigt, worden je opnames verwijderd. Doorgaan?",
  },
  fr: {
    title: "Test vocal",
    intro: "Merci de ton aide ! Lis chaque texte à voix haute et enregistre-le. Ça prend environ 5 minutes.",
    consent: "Tes enregistrements servent uniquement à tester des modèles de reconnaissance vocale pour un projet personnel. Ils sont stockés dans un Google Drive privé, ne sont pas partagés, et je les supprimerai dès que tu me le demandes.",
    how: "Tiens ton téléphone comme d'habitude quand tu envoies un message vocal. Lis à un rythme normal, avec une courte pause entre les phrases. Si tu te trompes, continue sans recommencer.",
    nameLabel: "Ton prénom",
    readLabel: "Je lis en",
    quiet: "Endroit calme", quietHow: "À l'intérieur, porte fermée.",
    street: "Rue animée", streetHow: "Dehors, sur un trottoir fréquenté, avec de la circulation ou du monde autour.",
    mixed: "Facultatif : langues mélangées", mixedHow: "Seulement si tu parles aussi anglais. Lis cette phrase avec les changements de langue tels qu'écrits.",
    passage: "Texte {x}", record: "Enregistrer", stop: "Arrêter", redo: "Réenregistrer", recorded: "Enregistré ({s} s)",
    recording: "Enregistrement…", tooShort: "Trop court, réessaie.",
    send: "Envoyer mes enregistrements", sending: "Envoi {n} sur {m}…", sentAll: "Tout est envoyé. Merci !",
    sentSome: "{n} sur {m} envoyés. Appuie de nouveau sur Envoyer pour réessayer, ou utilise Partager ci-dessous.",
    backup: "L'envoi ne marche pas ? Partage ou télécharge tes enregistrements :", share: "Partager…", download: "Télécharger",
    nothing: "Enregistre d'abord au moins un texte.", allDone: "Tout est déjà envoyé.",
    micBlocked: "Micro bloqué. Autorise l'accès dans les réglages du site de ton navigateur.",
    micNone: "Aucun micro trouvé.", micErr: "Erreur du micro : {msg}",
    switchLang: "Changer la langue de lecture supprimera tes enregistrements. Continuer ?",
  },
  pl: {
    title: "Test głosu",
    intro: "Dzięki za pomoc! Przeczytaj każdy tekst na głos i nagraj go. Zajmie to około 5 minut.",
    consent: "Twoje nagrania posłużą wyłącznie do testowania modeli zamiany mowy na tekst w prywatnym projekcie. Są przechowywane na prywatnym Dysku Google, nie są udostępniane i usunę je na Twoją prośbę.",
    how: "Trzymaj telefon tak, jak zwykle przy wysyłaniu wiadomości głosowej. Czytaj w normalnym tempie, z krótką przerwą między zdaniami. Jeśli się pomylisz, czytaj dalej, nie zaczynaj od nowa.",
    nameLabel: "Twoje imię",
    readLabel: "Czytam w języku",
    quiet: "Ciche miejsce", quietHow: "W pomieszczeniu, przy zamkniętych drzwiach.",
    street: "Ruchliwa ulica", streetHow: "Na zewnątrz, na ruchliwym chodniku, z ruchem ulicznym lub ludźmi wokół.",
    mixed: "Opcjonalnie: mieszane języki", mixedHow: "Tylko jeśli mówisz też po angielsku. Przeczytaj to zdanie ze zmianami języka tak, jak jest napisane.",
    passage: "Tekst {x}", record: "Nagraj", stop: "Stop", redo: "Nagraj ponownie", recorded: "Nagrano ({s} s)",
    recording: "Nagrywanie…", tooShort: "Za krótko, spróbuj ponownie.",
    send: "Wyślij moje nagrania", sending: "Wysyłanie {n} z {m}…", sentAll: "Wszystko wysłane. Dziękuję!",
    sentSome: "Wysłano {n} z {m}. Stuknij Wyślij ponownie, aby spróbować jeszcze raz, albo użyj Udostępnij poniżej.",
    backup: "Nie udaje się wysłać? Udostępnij lub pobierz nagrania:", share: "Udostępnij…", download: "Pobierz",
    nothing: "Najpierw nagraj przynajmniej jeden tekst.", allDone: "Wszystko zostało już wysłane.",
    micBlocked: "Mikrofon zablokowany. Zezwól na dostęp w ustawieniach witryny w przeglądarce.",
    micNone: "Nie znaleziono mikrofonu.", micErr: "Błąd mikrofonu: {msg}",
    switchLang: "Zmiana języka czytania usunie Twoje nagrania. Kontynuować?",
  },
  es: {
    title: "Prueba de voz",
    intro: "¡Gracias por ayudar! Lee cada texto en voz alta y grábalo. Lleva unos 5 minutos.",
    consent: "Tus grabaciones solo se usan para probar modelos de voz a texto en un proyecto personal. Se guardan en un Google Drive privado, no se comparten y las borraré cuando me lo pidas.",
    how: "Sujeta el móvil como lo haces normalmente al mandar un audio. Lee a ritmo normal, con una pausa corta entre frases. Si te equivocas, sigue en vez de empezar de nuevo.",
    nameLabel: "Tu nombre",
    readLabel: "Voy a leer en",
    quiet: "Sitio tranquilo", quietHow: "En interior, con la puerta cerrada.",
    street: "Calle concurrida", streetHow: "Fuera, en una acera con gente, con tráfico o personas alrededor.",
    mixed: "Opcional: idiomas mezclados", mixedHow: "Solo si también hablas inglés. Lee esta frase con los cambios de idioma tal como están escritos.",
    passage: "Texto {x}", record: "Grabar", stop: "Parar", redo: "Grabar de nuevo", recorded: "Grabado ({s} s)",
    recording: "Grabando…", tooShort: "Demasiado corto, inténtalo de nuevo.",
    send: "Enviar mis grabaciones", sending: "Enviando {n} de {m}…", sentAll: "Todo enviado. ¡Gracias!",
    sentSome: "{n} de {m} enviadas. Pulsa Enviar otra vez para reintentar, o usa Compartir abajo.",
    backup: "¿No se envía? Comparte o descarga tus grabaciones:", share: "Compartir…", download: "Descargar",
    nothing: "Graba al menos un texto primero.", allDone: "Todo está ya enviado.",
    micBlocked: "Micrófono bloqueado. Permite el acceso en los ajustes del sitio de tu navegador.",
    micNone: "No se encontró ningún micrófono.", micErr: "Error del micrófono: {msg}",
    switchLang: "Cambiar el idioma de lectura borrará tus grabaciones. ¿Continuar?",
  },
};

// ---------- state ----------
const $ = (id) => document.getElementById(id);
let UI = detectUiLang();
let readLang = PASSAGES[UI] ? UI : "en";
const store = {}; // key -> {pcm, blob, filename, sent, seconds}
let active = null; // {key, stop()}
let autoStop = null;

const SLOTS = [
  { key: "quiet-A", env: "quiet", id: "A" },
  { key: "quiet-B", env: "quiet", id: "B" },
  { key: "street-A", env: "street", id: "A" },
  { key: "street-B", env: "street", id: "B" },
  { key: "any-M", env: "any", id: "M" },
];

function detectUiLang() {
  const prefs = navigator.languages?.length ? navigator.languages : [navigator.language || "en"];
  for (const p of prefs) {
    const b = String(p).toLowerCase().split("-")[0];
    if (I18N[b]) return b;
  }
  return "en";
}
const t = (k, v = {}) => Object.entries(v).reduce((s, [a, b]) => s.replaceAll(`{${a}}`, b), I18N[UI][k] ?? I18N.en[k] ?? k);

function setStatus(msg, kind = "") {
  $("status").textContent = msg;
  $("status").dataset.kind = kind;
}
const visibleSlots = () => SLOTS.filter((s) => s.id !== "M" || PASSAGES[readLang].M);

// ---------- static text ----------
function applyText() {
  document.documentElement.lang = UI;
  document.title = t("title");
  $("title").textContent = t("title");
  $("intro").textContent = t("intro");
  $("consent").textContent = t("consent");
  $("how").textContent = t("how");
  $("nameLabel").textContent = t("nameLabel");
  $("readLabel").textContent = t("readLabel");
  $("sendBtn").textContent = t("send");
  $("backupText").textContent = t("backup");
  $("shareBtn").textContent = t("share");
  $("dlBtn").textContent = t("download");
  $("uiLang").value = UI;
  $("readLang").replaceChildren(
    ...Object.keys(PASSAGES).map((c) => Object.assign(document.createElement("option"), { value: c, textContent: LANG_NAMES[c], selected: c === readLang }))
  );
  const direct = !!UPLOAD.url;
  $("sendBtn").hidden = !direct;
  $("shareBtn").hidden = !(navigator.canShare && navigator.share);
  renderSlots();
}

// ---------- slots ----------
function renderSlots() {
  const groups = [
    { title: t("quiet"), how: t("quietHow"), ids: ["quiet-A", "quiet-B"] },
    { title: t("street"), how: t("streetHow"), ids: ["street-A", "street-B"] },
  ];
  if (PASSAGES[readLang].M) groups.push({ title: t("mixed"), how: t("mixedHow"), ids: ["any-M"] });

  $("slots").replaceChildren(
    ...groups.map((g) => {
      const sec = document.createElement("section");
      const h = document.createElement("h2");
      h.textContent = g.title;
      const p = document.createElement("p");
      p.textContent = g.how;
      sec.append(h, p);
      for (const key of g.ids) sec.append(card(SLOTS.find((s) => s.key === key)));
      return sec;
    })
  );
}

function card(slot) {
  const d = document.createElement("div");
  d.className = "card";
  d.dataset.key = slot.key;
  if (slot.id !== "M") {
    const h = document.createElement("h3");
    h.textContent = t("passage", { x: slot.id });
    d.append(h);
  }
  const text = document.createElement("p");
  text.className = "passage";
  text.lang = readLang;
  text.textContent = PASSAGES[readLang][slot.id];
  const row = document.createElement("div");
  row.className = "row";
  const btn = document.createElement("button");
  btn.className = "btn";
  const meter = document.createElement("div");
  meter.className = "meter";
  const state = document.createElement("span");
  state.className = "state";
  row.append(btn, meter, state);
  const audio = document.createElement("audio");
  audio.controls = true;
  audio.hidden = true;
  d.append(text, row, audio);
  d._ui = { btn, meter, state, audio };
  btn.onclick = () => (active?.key === slot.key ? stopRecording() : startRecording(slot, d));
  refreshCard(d, slot);
  return d;
}

function refreshCard(d, slot) {
  const { btn, state, audio } = d._ui;
  const c = store[slot.key];
  const rec = active?.key === slot.key;
  btn.dataset.on = String(rec);
  btn.textContent = rec ? t("stop") : c ? t("redo") : t("record");
  btn.disabled = !!active && !rec;
  state.textContent = rec ? t("recording") : c ? t("recorded", { s: c.seconds.toFixed(0) }) + (c.sent ? " ✓" : "") : "";
  state.className = "state" + (c?.sent ? " ok" : "");
  audio.hidden = !c || rec;
  if (c && !rec) audio.src = c.url;
}
function refreshAll() {
  document.querySelectorAll(".card").forEach((d) => refreshCard(d, SLOTS.find((s) => s.key === d.dataset.key)));
}

// ---------- recording (raw audio, no browser processing) ----------
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

async function startRecording(slot, d) {
  if (active) return;
  try {
    // Every model should hear the same raw audio, so browser noise suppression is off on purpose.
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
      d._ui.meter.style.setProperty("--lvl", Math.min(1, Math.sqrt(sum / (raw.length / 8)) * 6).toFixed(3));
      chunks.push(rs.push(raw));
    };
    src.connect(node);
    active = {
      key: slot.key,
      slot,
      d,
      stop() {
        node.port.onmessage = null;
        src.disconnect();
        node.disconnect();
        stream.getTracks().forEach((tr) => tr.stop());
        ctx.close();
        d._ui.meter.style.setProperty("--lvl", "0");
        return concat(chunks);
      },
    };
    autoStop = setTimeout(stopRecording, MAX_SECONDS * 1000);
    setStatus("");
    refreshAll();
  } catch (err) {
    active = null;
    setStatus(err?.name === "NotAllowedError" ? t("micBlocked") : err?.name === "NotFoundError" ? t("micNone") : t("micErr", { msg: err?.message || err }), "error");
    refreshAll();
  }
}

function stopRecording() {
  if (!active) return;
  clearTimeout(autoStop);
  const { slot, d } = active;
  const pcm = active.stop();
  active = null;
  const seconds = pcm.length / SR;
  if (seconds < MIN_SECONDS) {
    setStatus(t("tooShort"), "error");
  } else {
    if (store[slot.key]) URL.revokeObjectURL(store[slot.key].url);
    const blob = encodeWav(pcm);
    store[slot.key] = { blob, seconds, sent: false, url: URL.createObjectURL(blob), stamp: new Date().toISOString().slice(0, 16).replace(/[-:]/g, ""), slot };
    setStatus("");
  }
  refreshAll();
}

function filenameOf(c) {
  const who = ($("who").value || "anon").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9-]/g, "").slice(0, 24) || "anon";
  return `${who}_${readLang}_${c.slot.env}_${c.slot.id}_${c.stamp}.wav`;
}

// ---------- send / share / download ----------
const recorded = () => visibleSlots().filter((s) => store[s.key]);

const toBase64 = (blob) =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1]);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });

async function sendAll() {
  if (active) return;
  const all = recorded();
  if (!all.length) return setStatus(t("nothing"), "error");
  const todo = all.filter((s) => !store[s.key].sent);
  if (!todo.length) return setStatus(t("allDone"), "ok");
  $("sendBtn").disabled = true;
  let done = 0;
  for (const s of todo) {
    setStatus(t("sending", { n: done + 1, m: todo.length }));
    try {
      const c = store[s.key];
      const res = await fetch(UPLOAD.url, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" }, // a "simple" request, so no CORS preflight
        body: JSON.stringify({ secret: UPLOAD.secret, filename: filenameOf(c), data: await toBase64(c.blob) }),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || "upload failed");
      c.sent = true;
      done++;
    } catch (err) {
      console.error(err);
    }
    refreshAll();
  }
  $("sendBtn").disabled = false;
  if (done === todo.length) setStatus(t("sentAll"), "ok");
  else setStatus(t("sentSome", { n: all.filter((s) => store[s.key].sent).length, m: all.length }), "error");
}

async function shareAll() {
  const files = recorded().map((s) => new File([store[s.key].blob], filenameOf(store[s.key]), { type: "audio/wav" }));
  if (!files.length) return setStatus(t("nothing"), "error");
  try {
    if (navigator.canShare?.({ files })) await navigator.share({ files, title: t("title") });
  } catch (err) {
    if (err?.name !== "AbortError") console.error(err);
  }
}

async function downloadAll() {
  const items = recorded();
  if (!items.length) return setStatus(t("nothing"), "error");
  for (const s of items) {
    const a = document.createElement("a");
    a.href = store[s.key].url;
    a.download = filenameOf(store[s.key]);
    a.click();
    await new Promise((r) => setTimeout(r, 400));
  }
}

// ---------- wiring ----------
$("uiLang").addEventListener("change", (e) => {
  UI = e.target.value;
  applyText();
});
$("readLang").addEventListener("change", (e) => {
  const next = e.target.value;
  const has = Object.keys(store).length > 0;
  if (has && !confirm(t("switchLang"))) {
    e.target.value = readLang;
    return;
  }
  for (const k of Object.keys(store)) {
    URL.revokeObjectURL(store[k].url);
    delete store[k];
  }
  readLang = next;
  setStatus("");
  renderSlots();
});
$("sendBtn").addEventListener("click", sendAll);
$("shareBtn").addEventListener("click", shareAll);
$("dlBtn").addEventListener("click", downloadAll);

applyText();
