// Code.gs — paste this into the Apps Script editor of your Google Sheet.

// 1) Change SECRET below to any private phrase (paste the same one into the
//    extension popup).
// 2) Deploy > New deployment > type "Web app" > Execute as: Me >
//    Who has access: Anyone. Copy the /exec URL into the extension.
// 3) IMPORTANT: after ANY edit here, redeploy: Deploy > Manage deployments >
//    pencil > Version: New version > Deploy.

const SECRET = "change-to-something-personal";
const SHEET_NAME = "Meetings";

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000); // avoid two writes clobbering each other
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.secret !== SECRET) return json({ ok: false, error: "unauthorized" });

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(["Meeting Name", "Date", "Start Time", "End Time", "Duration (min)"]);
    }
    const realDate = (data.y && data.m && data.d) ? new Date(data.y, data.m - 1, data.d) : "";
    sheet.appendRow([data.name, realDate, data.start, data.end, data.duration]);
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}