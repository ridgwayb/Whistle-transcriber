# Whistle transcriber

Browser speech-to-text using [Cactus Whistle](https://cactuscompute.com/blog/whistle) (16.9 MB, 7 languages), run on-device through the Needle WebAssembly engine. Static site, no backend.

- **Live**: streams words as they are confirmed, no time limit
- **Record a clip**: transcribe the whole recording, optional word timestamps
- **Audio file**: drop in mp3/wav/m4a/etc.
- Language picker (or auto-detect), keyword biasing for names and jargon, copy / save as .txt
- Interface in English, Spanish, French, Catalan and Chinese (Simplified), chosen from the browser/OS language, with a selector in the header to override it. Translations live in `i18n.js`.

## Deploy to GitHub Pages

```sh
cd whistle-web
git init -b main
git add .
git commit -m "Whistle transcriber"
gh repo create whistle-web --public --source . --push
gh api -X POST repos/:owner/whistle-web/pages -f "source[branch]=main" -f "source[path]=/"
```

Your site goes live at `https://<your-username>.github.io/whistle-web/` after a minute or so.
(Or in the repo: Settings, Pages, Deploy from branch, `main` / root.)

The microphone needs HTTPS, which Pages provides. To try locally: `python3 -m http.server` and open `http://localhost:8000`.

## How it works

On first load the page downloads three files from Hugging Face (CORS-enabled) and caches them with the browser Cache API, so later visits start instantly and offline-capable after the first load of each file:

| File | Source |
| --- | --- |
| `needle.js`, `needle.wasm` (engine, under 1 MB) | `Cactus-Compute/needle3`, `wasm/`, pinned to a commit in `CFG.engineBase` |
| `whistle.cact` (16.9 MB model) | `Cactus-Compute/whistle` |

It calls the engine's C API directly: `needle_load`, `needle_transcribe`, `needle_stream_transcribe_process`, `needle_stream_transcribe_stop`.

To fully self-host (no Hugging Face request at all), download those three files into the repo and point `CFG.engineBase` and `CFG.modelUrl` in `app.js` at the local paths. Note GitHub limits single files to 100 MB, so the 16.9 MB model is fine.

## Notes

- Inference runs on the main thread. It is fast (tens of milliseconds per pass), but a very long file will freeze the tab briefly while it transcribes.
- Whistle transcribes English, German, French, Spanish, Italian, Dutch and Polish. The Catalan and Chinese interfaces work, but speech in those two languages is not supported by the model.
- Silence and steady noise return an empty transcript; music and other sounds can still come out as text.
- Whistle is Apache-2.0. If you use it in published work, see the citation on the [model card](https://huggingface.co/Cactus-Compute/whistle).

## Collecting friends' recordings (collect.html)

`collect.html` is a page to send to friends. It shows the test texts (English, Dutch, French, Polish, Spanish), records each one in the browser as raw 16 kHz WAV (browser noise suppression is deliberately off, so every model hears the same audio), and sends them to a folder in your Google Drive. The interface is in English, Dutch, French, Polish and Spanish, picked from the phone's language.

GitHub Pages is static, so it can't write files by itself, and a GitHub token in the page would be public. The safe route is a small Google Apps Script that runs as you and saves into your own Drive:

1. Go to https://script.google.com, press New project, and paste in `apps-script/Code.gs`.
2. Change `SECRET` to a random string.
3. Deploy, New deployment, type Web app. Execute as: Me. Who has access: Anyone. Authorise when asked (Google warns the app is unverified; that is your own script).
4. Copy the Web app URL. In `collect.js`, set `UPLOAD.url` to it and `UPLOAD.secret` to your secret, then commit.
5. Send friends `https://<you>.github.io/<repo>/collect.html`. Files land in a Drive folder called "Whistle test clips".

Until `UPLOAD.url` is set, the Send button is hidden and friends use Share (opens the iPhone/Android share sheet, so they can WhatsApp the files to you) or Download.

Notes:
- The secret is visible in the page source, so it only deters random bots. Anyone with the page could upload clips to your folder (size and filename checks limit the damage). Delete the deployment when you've finished testing.
- These are people's voices. The page tells friends how the recordings are used; delete them if asked.
- Filenames look like `Sam_nl_quiet_A_20261021T1330.wav`. When you upload these files to `compare.html`, it fills in the reference text from the name, so you get word error rates automatically.

## Personal dictation page (dictate.html)

For English and Spanish mixed speech, with an optional on-device cleanup step. Add it to your iPhone Home Screen (Share, Add to Home Screen) so Safari is less likely to evict the cached models.

Files: `dictate.html`, `dictate.js`, `engine.js`, `dictate-utils.js`, plus the shared `compare-utils.js`.

How it works:
1. Record (or choose a file). The clip is split at pauses.
2. In "English + Spanish, mixed" mode, Whistle (17 MB, fast) identifies the language of each piece and Whisper transcribes it with that language forced. Anything that isn't English or Spanish falls back to the previous piece's language, or the "assume" setting. Other modes: let Whisper decide, or force one language.
3. Hallucination filter (drops "Thanks for watching" style output on silence) and your glossary replacements.
4. Optional cleanup with a small on-device model (Qwen2.5 0.5B or 1.5B). Its output is checked: if it rewrites too much, it is discarded and you get the original. The Original tab always shows the raw transcript.
5. Copy, Share, or "Copy for ChatGPT" (copies a ready-made correction prompt including your glossary).

"Noisy or unclear audio" turns on the browser noise filter and the cleanup step for that recording, and pads the pause splitting.

Model ids are constants at the top of `engine.js` (`WHISPER`, `LLMS`) if you want to try others. Settings are saved on the device.
