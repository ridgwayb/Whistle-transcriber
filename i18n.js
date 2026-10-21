// UI translations. The interface language follows the browser/OS language list
// (navigator.languages), falls back to English, and can be overridden with the
// selector in the header (remembered in localStorage).

const I18N = {
  en: {
    title: "Whistle transcriber",
    subtitle: "Speech to text that runs entirely in this tab. The 16.9 MB model downloads once, then your audio never leaves your device.",
    uiLang: "Interface language",
    tabLive: "Live",
    tabRecord: "Record a clip",
    tabFile: "Audio file",
    liveHelp: "Words appear a second or two after you say them, once two passes agree. No time limit.",
    liveStart: "Start listening",
    liveStop: "Stop",
    recHelp: "Record, then transcribe the whole clip in one go. Supports word timestamps.",
    recStart: "Record",
    recStop: "Stop and transcribe",
    fileChoose: "Choose an audio file",
    fileDrop: "or drop one here (mp3, wav, m4a, ogg, and whatever your browser can decode)",
    language: "Language",
    langAuto: "Detect automatically",
    langNote: "Whistle transcribes {list}.",
    wordTimes: "Word timestamps",
    keywordsLabel: "Names and terms to favour (comma-separated)",
    empty: "Your transcript will appear here.",
    copy: "Copy",
    copied: "Copied",
    save: "Save .txt",
    clear: "Clear",
    footer: 'Model: <a href="https://cactuscompute.com/blog/whistle">Whistle</a> by Cactus Compute (Apache-2.0), run through the <a href="https://github.com/cactus-compute/needle">Needle</a> WebAssembly engine. Music and background sounds can still come out as text, so use it for speech.',
    starting: "Starting…",
    dlEngine: "Downloading engine…",
    dlModel: "Downloading Whistle model (16.9 MB, cached after the first visit)…",
    dlModelMb: "Downloading Whistle model… {mb} MB",
    startEngine: "Starting engine…",
    speechMissing: "Engine loaded, but the speech model is missing.",
    ready: "Ready. Everything runs on this device.",
    startFail: "Could not start: {msg}. Check your connection and reload.",
    recording: "Recording…",
    tooShort: "That clip was too short. Try again.",
    transcribing: "Transcribing…",
    noSpeech: "No speech detected. Silence and steady noise return nothing.",
    done: "Done.",
    transcribeFail: "Transcription failed: {msg}",
    decoding: "Decoding {name}…",
    fileFail: "Could not read that file: {msg}",
    listening: "Listening. Words appear as they are confirmed.",
    stopped: "Stopped.",
    liveFail: "Live transcription failed: {msg}",
    micBlocked: "Microphone blocked. Allow access in your browser's site settings.",
    micNone: "No microphone found.",
    micHttps: "The microphone needs HTTPS (or localhost).",
    micErr: "Microphone error: {msg}",
    statAudio: "{a} s of audio in {b} s",
    statFirst: "first token {ms} ms",
    statTps: "{n} tokens/s",
    statHeard: "{s} s heard",
    statPass: "pass {ms} ms",
  },

  es: {
    title: "Transcriptor Whistle",
    subtitle: "Voz a texto que se ejecuta íntegramente en esta pestaña. El modelo de 16,9 MB se descarga una vez y tu audio nunca sale de tu dispositivo.",
    uiLang: "Idioma de la interfaz",
    tabLive: "En directo",
    tabRecord: "Grabar un clip",
    tabFile: "Archivo de audio",
    liveHelp: "Las palabras aparecen uno o dos segundos después de decirlas, cuando dos pasadas coinciden. Sin límite de tiempo.",
    liveStart: "Empezar a escuchar",
    liveStop: "Detener",
    recHelp: "Graba y transcribe el clip completo de una vez. Admite marcas de tiempo por palabra.",
    recStart: "Grabar",
    recStop: "Detener y transcribir",
    fileChoose: "Elige un archivo de audio",
    fileDrop: "o suéltalo aquí (mp3, wav, m4a, ogg y lo que tu navegador pueda decodificar)",
    language: "Idioma",
    langAuto: "Detectar automáticamente",
    langNote: "Whistle transcribe {list}.",
    wordTimes: "Marcas de tiempo por palabra",
    keywordsLabel: "Nombres y términos a priorizar (separados por comas)",
    empty: "Tu transcripción aparecerá aquí.",
    copy: "Copiar",
    copied: "Copiado",
    save: "Guardar .txt",
    clear: "Borrar",
    footer: 'Modelo: <a href="https://cactuscompute.com/blog/whistle">Whistle</a> de Cactus Compute (Apache-2.0), ejecutado con el motor WebAssembly <a href="https://github.com/cactus-compute/needle">Needle</a>. La música y los sonidos de fondo aún pueden salir como texto, así que úsalo para voz.',
    starting: "Iniciando…",
    dlEngine: "Descargando el motor…",
    dlModel: "Descargando el modelo Whistle (16,9 MB, en caché tras la primera visita)…",
    dlModelMb: "Descargando el modelo Whistle… {mb} MB",
    startEngine: "Iniciando el motor…",
    speechMissing: "El motor se cargó, pero falta el modelo de voz.",
    ready: "Listo. Todo se ejecuta en este dispositivo.",
    startFail: "No se pudo iniciar: {msg}. Revisa tu conexión y recarga la página.",
    recording: "Grabando…",
    tooShort: "El clip era demasiado corto. Inténtalo de nuevo.",
    transcribing: "Transcribiendo…",
    noSpeech: "No se detectó voz. El silencio y el ruido constante no devuelven nada.",
    done: "Hecho.",
    transcribeFail: "Falló la transcripción: {msg}",
    decoding: "Decodificando {name}…",
    fileFail: "No se pudo leer ese archivo: {msg}",
    listening: "Escuchando. Las palabras aparecen cuando se confirman.",
    stopped: "Detenido.",
    liveFail: "Falló la transcripción en directo: {msg}",
    micBlocked: "Micrófono bloqueado. Permite el acceso en los ajustes del sitio de tu navegador.",
    micNone: "No se encontró ningún micrófono.",
    micHttps: "El micrófono requiere HTTPS (o localhost).",
    micErr: "Error del micrófono: {msg}",
    statAudio: "{a} s de audio en {b} s",
    statFirst: "primer token {ms} ms",
    statTps: "{n} tokens/s",
    statHeard: "{s} s escuchados",
    statPass: "pasada {ms} ms",
  },

  fr: {
    title: "Transcripteur Whistle",
    subtitle: "Reconnaissance vocale qui s’exécute entièrement dans cet onglet. Le modèle de 16,9 Mo se télécharge une seule fois, puis votre audio ne quitte jamais votre appareil.",
    uiLang: "Langue de l’interface",
    tabLive: "En direct",
    tabRecord: "Enregistrer un extrait",
    tabFile: "Fichier audio",
    liveHelp: "Les mots apparaissent une à deux secondes après que vous les avez prononcés, une fois que deux passes concordent. Sans limite de durée.",
    liveStart: "Démarrer l’écoute",
    liveStop: "Arrêter",
    recHelp: "Enregistrez, puis transcrivez tout l’extrait d’un coup. Prend en charge l’horodatage des mots.",
    recStart: "Enregistrer",
    recStop: "Arrêter et transcrire",
    fileChoose: "Choisir un fichier audio",
    fileDrop: "ou déposez-le ici (mp3, wav, m4a, ogg et tout ce que votre navigateur sait décoder)",
    language: "Langue",
    langAuto: "Détecter automatiquement",
    langNote: "Whistle transcrit {list}.",
    wordTimes: "Horodatage des mots",
    keywordsLabel: "Noms et termes à privilégier (séparés par des virgules)",
    empty: "Votre transcription apparaîtra ici.",
    copy: "Copier",
    copied: "Copié",
    save: "Enregistrer en .txt",
    clear: "Effacer",
    footer: 'Modèle : <a href="https://cactuscompute.com/blog/whistle">Whistle</a> de Cactus Compute (Apache-2.0), exécuté via le moteur WebAssembly <a href="https://github.com/cactus-compute/needle">Needle</a>. La musique et les bruits de fond peuvent encore produire du texte ; réservez-le à la parole.',
    starting: "Démarrage…",
    dlEngine: "Téléchargement du moteur…",
    dlModel: "Téléchargement du modèle Whistle (16,9 Mo, mis en cache après la première visite)…",
    dlModelMb: "Téléchargement du modèle Whistle… {mb} Mo",
    startEngine: "Démarrage du moteur…",
    speechMissing: "Le moteur est chargé, mais le modèle vocal est manquant.",
    ready: "Prêt. Tout s’exécute sur cet appareil.",
    startFail: "Démarrage impossible : {msg}. Vérifiez votre connexion et rechargez la page.",
    recording: "Enregistrement…",
    tooShort: "L’extrait était trop court. Réessayez.",
    transcribing: "Transcription en cours…",
    noSpeech: "Aucune parole détectée. Le silence et le bruit constant ne produisent rien.",
    done: "Terminé.",
    transcribeFail: "Échec de la transcription : {msg}",
    decoding: "Décodage de {name}…",
    fileFail: "Impossible de lire ce fichier : {msg}",
    listening: "À l’écoute. Les mots apparaissent à mesure qu’ils sont confirmés.",
    stopped: "Arrêté.",
    liveFail: "Échec de la transcription en direct : {msg}",
    micBlocked: "Microphone bloqué. Autorisez l’accès dans les paramètres du site de votre navigateur.",
    micNone: "Aucun microphone trouvé.",
    micHttps: "Le microphone nécessite HTTPS (ou localhost).",
    micErr: "Erreur du microphone : {msg}",
    statAudio: "{a} s d’audio en {b} s",
    statFirst: "premier jeton {ms} ms",
    statTps: "{n} jetons/s",
    statHeard: "{s} s entendues",
    statPass: "passe {ms} ms",
  },

  ca: {
    title: "Transcriptor Whistle",
    subtitle: "Veu a text que s’executa completament en aquesta pestanya. El model de 16,9 MB es descarrega una sola vegada i el teu àudio mai surt del dispositiu.",
    uiLang: "Idioma de la interfície",
    tabLive: "En directe",
    tabRecord: "Grava un clip",
    tabFile: "Fitxer d’àudio",
    liveHelp: "Les paraules apareixen un o dos segons després de dir-les, quan dues passades coincideixen. Sense límit de temps.",
    liveStart: "Comença a escoltar",
    liveStop: "Atura",
    recHelp: "Grava i transcriu el clip sencer d’un cop. Admet marques de temps per paraula.",
    recStart: "Grava",
    recStop: "Atura i transcriu",
    fileChoose: "Tria un fitxer d’àudio",
    fileDrop: "o deixa’l anar aquí (mp3, wav, m4a, ogg i tot allò que el teu navegador pugui descodificar)",
    language: "Idioma",
    langAuto: "Detecta automàticament",
    langNote: "Whistle transcriu {list}.",
    wordTimes: "Marques de temps per paraula",
    keywordsLabel: "Noms i termes a afavorir (separats per comes)",
    empty: "La teva transcripció apareixerà aquí.",
    copy: "Copia",
    copied: "Copiat",
    save: "Desa .txt",
    clear: "Esborra",
    footer: 'Model: <a href="https://cactuscompute.com/blog/whistle">Whistle</a> de Cactus Compute (Apache-2.0), executat amb el motor WebAssembly <a href="https://github.com/cactus-compute/needle">Needle</a>. La música i els sorolls de fons encara poden sortir com a text, així que fes-lo servir per a la veu.',
    starting: "Iniciant…",
    dlEngine: "Descarregant el motor…",
    dlModel: "Descarregant el model Whistle (16,9 MB, a la memòria cau després de la primera visita)…",
    dlModelMb: "Descarregant el model Whistle… {mb} MB",
    startEngine: "Iniciant el motor…",
    speechMissing: "El motor s’ha carregat, però falta el model de veu.",
    ready: "A punt. Tot s’executa en aquest dispositiu.",
    startFail: "No s’ha pogut iniciar: {msg}. Comprova la connexió i torna a carregar la pàgina.",
    recording: "Gravant…",
    tooShort: "El clip era massa curt. Torna-ho a provar.",
    transcribing: "Transcrivint…",
    noSpeech: "No s’ha detectat veu. El silenci i el soroll constant no retornen res.",
    done: "Fet.",
    transcribeFail: "Ha fallat la transcripció: {msg}",
    decoding: "Descodificant {name}…",
    fileFail: "No s’ha pogut llegir aquest fitxer: {msg}",
    listening: "Escoltant. Les paraules apareixen a mesura que es confirmen.",
    stopped: "Aturat.",
    liveFail: "Ha fallat la transcripció en directe: {msg}",
    micBlocked: "Micròfon bloquejat. Permet l’accés a la configuració del lloc del navegador.",
    micNone: "No s’ha trobat cap micròfon.",
    micHttps: "El micròfon requereix HTTPS (o localhost).",
    micErr: "Error del micròfon: {msg}",
    statAudio: "{a} s d’àudio en {b} s",
    statFirst: "primer token {ms} ms",
    statTps: "{n} tokens/s",
    statHeard: "{s} s escoltats",
    statPass: "passada {ms} ms",
  },

  zh: {
    title: "Whistle 语音转写",
    subtitle: "完全在此标签页内运行的语音转文字。16.9 MB 的模型只需下载一次，之后你的音频不会离开设备。",
    uiLang: "界面语言",
    tabLive: "实时",
    tabRecord: "录制片段",
    tabFile: "音频文件",
    liveHelp: "说出后一两秒内显示文字（两轮识别结果一致时确认）。无时间限制。",
    liveStart: "开始聆听",
    liveStop: "停止",
    recHelp: "录音后一次性转写整段内容，支持逐词时间戳。",
    recStart: "录制",
    recStop: "停止并转写",
    fileChoose: "选择音频文件",
    fileDrop: "或拖放到此处（mp3、wav、m4a、ogg 以及浏览器能解码的其他格式）",
    language: "识别语言",
    langAuto: "自动检测",
    langNote: "Whistle 支持转写：{list}。",
    wordTimes: "逐词时间戳",
    keywordsLabel: "优先识别的人名和术语（用逗号分隔）",
    empty: "转写内容将显示在这里。",
    copy: "复制",
    copied: "已复制",
    save: "保存 .txt",
    clear: "清除",
    footer: '模型：Cactus Compute 的 <a href="https://cactuscompute.com/blog/whistle">Whistle</a>（Apache-2.0），通过 <a href="https://github.com/cactus-compute/needle">Needle</a> WebAssembly 引擎运行。音乐和背景声音仍可能被转写成文字，请仅用于语音。',
    starting: "正在启动…",
    dlEngine: "正在下载引擎…",
    dlModel: "正在下载 Whistle 模型（16.9 MB，首次访问后会缓存）…",
    dlModelMb: "正在下载 Whistle 模型… {mb} MB",
    startEngine: "正在启动引擎…",
    speechMissing: "引擎已加载，但缺少语音模型。",
    ready: "已就绪。所有处理都在本设备上完成。",
    startFail: "无法启动：{msg}。请检查网络连接后刷新页面。",
    recording: "正在录音…",
    tooShort: "录音太短，请重试。",
    transcribing: "正在转写…",
    noSpeech: "未检测到语音。静音和持续噪声不会产生结果。",
    done: "完成。",
    transcribeFail: "转写失败：{msg}",
    decoding: "正在解码 {name}…",
    fileFail: "无法读取该文件：{msg}",
    listening: "正在聆听。文字确认后会陆续显示。",
    stopped: "已停止。",
    liveFail: "实时转写失败：{msg}",
    micBlocked: "麦克风已被阻止。请在浏览器的网站设置中允许访问。",
    micNone: "未找到麦克风。",
    micHttps: "麦克风需要 HTTPS（或 localhost）。",
    micErr: "麦克风错误：{msg}",
    statAudio: "{a} 秒音频，用时 {b} 秒",
    statFirst: "首个词元 {ms} 毫秒",
    statTps: "{n} 词元/秒",
    statHeard: "已听到 {s} 秒",
    statPass: "单轮 {ms} 毫秒",
  },
};

const LOCALES = { en: "en", es: "es", fr: "fr", ca: "ca", zh: "zh-Hans" };
const SPEECH_LANGS = ["en", "de", "fr", "es", "it", "nl", "pl"]; // what Whistle can transcribe

function detectLang() {
  try {
    const saved = localStorage.getItem("ui-lang");
    if (saved && I18N[saved]) return saved;
  } catch {}
  const prefs = navigator.languages?.length ? navigator.languages : [navigator.language || "en"];
  for (const p of prefs) {
    const base = String(p).toLowerCase().split("-")[0];
    if (I18N[base]) return base;
  }
  return "en";
}

let LANG = detectLang();

function t(key, vars) {
  let s = I18N[LANG][key] ?? I18N.en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  return s;
}

function setUiLang(code) {
  if (!I18N[code]) return;
  LANG = code;
  try {
    localStorage.setItem("ui-lang", code);
  } catch {}
}

// Language names in the current UI language, e.g. "Spanish" / "espagnol" / "西班牙语".
function langName(code) {
  try {
    const n = new Intl.DisplayNames([LOCALES[LANG]], { type: "language" }).of(code);
    return n.charAt(0).toLocaleUpperCase(LOCALES[LANG]) + n.slice(1);
  } catch {
    return code;
  }
}

function speechLangList() {
  const names = SPEECH_LANGS.map(langName);
  try {
    return new Intl.ListFormat(LOCALES[LANG], { style: "long", type: "conjunction" }).format(names);
  } catch {
    return names.join(", ");
  }
}

// Fill every static element marked with data-i18n* attributes.
function applyI18n() {
  document.documentElement.lang = LOCALES[LANG];
  document.title = t("title");
  document.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n)));
  document.querySelectorAll("[data-i18n-html]").forEach((el) => (el.innerHTML = t(el.dataset.i18nHtml)));
  document.querySelectorAll("[data-i18n-aria]").forEach((el) => el.setAttribute("aria-label", t(el.dataset.i18nAria)));
  document.querySelectorAll("[data-i18n-empty]").forEach((el) => el.setAttribute("data-empty", t(el.dataset.i18nEmpty)));
  document.querySelectorAll("#language option[value]:not([value=''])").forEach((o) => (o.textContent = langName(o.value)));
  const note = document.getElementById("langNote");
  if (note) note.textContent = t("langNote", { list: speechLangList() });
  const sel = document.getElementById("uiLang");
  if (sel) sel.value = LANG;
}
