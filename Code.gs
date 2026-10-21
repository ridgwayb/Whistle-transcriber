// Google Apps Script: receives WAV recordings from collect.html and saves them
// to a Drive folder in your own account.
//
// Setup: see README.md ("Collecting friends' recordings").

const SECRET = 'change-this-to-a-random-string';   // must match UPLOAD.secret in collect.js
const FOLDER_NAME = 'Whistle test clips';           // created in My Drive on first upload
const MAX_BASE64_CHARS = 6000000;                   // about 4.5 MB of audio per file

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    if (d.secret !== SECRET) return reply({ ok: false, error: 'forbidden' });
    if (!/^[A-Za-z0-9-]{1,24}_(en|nl|fr|pl|es)_(quiet|street|any)_[ABM]_[0-9T]{8,14}\.wav$/.test(d.filename || '')) {
      return reply({ ok: false, error: 'bad filename' });
    }
    if (!d.data || d.data.length > MAX_BASE64_CHARS) return reply({ ok: false, error: 'bad or too large' });

    const folder = getFolder();
    // Idempotent: a retry of a file that already arrived is not saved twice.
    if (folder.getFilesByName(d.filename).hasNext()) return reply({ ok: true, duplicate: true });

    const blob = Utilities.newBlob(Utilities.base64Decode(d.data), 'audio/wav', d.filename);
    folder.createFile(blob);
    return reply({ ok: true });
  } catch (err) {
    return reply({ ok: false, error: String(err) });
  }
}

function getFolder() {
  const it = DriveApp.getFoldersByName(FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
