/**
 * 팜넷 카탈로그 공용 저장소 (Google Apps Script 웹앱)
 *
 * 구글 스프레드시트를 데이터베이스처럼 쓴다. 웹앱은 이 API로만 시트를 읽고 쓴다.
 *  - products        : 상품 (한 줄 = 상품 1개, 줄 순서 = 화면 순서)
 *  - issues          : 발행된 월호 목록
 *  - issue_products  : 월호별 발행 당시 상품 스냅샷
 *  - settings        : 열 순서/너비 같은 공통 설정
 * 상품 사진은 구글 드라이브 폴더에 저장하고 시트에는 주소만 적는다.
 *
 * 설치 방법은 apps-script/README.md 참고.
 */

// 비워두면 링크를 아는 누구나 수정할 수 있다. 코드를 넣으면 그 코드를 입력한 사람만 수정할 수 있다. (열람은 항상 자유)
const EDIT_CODE = "";
const IMAGE_FOLDER = "팜넷 카탈로그 상품사진";

const FIELDS = ["status", "name", "project", "category", "origin", "storage", "shelfLife", "description", "weight", "boxPack", "price", "shippingFee", "saleLink", "images"];
const NUMERIC_FIELDS = ["price", "shippingFee"];
const SHEETS = {
  products: { name: "products", headers: ["uid", "order"].concat(FIELDS), numeric: ["order", "price", "shippingFee"] },
  issues: { name: "issues", headers: ["id", "year", "month", "publishedAt"], numeric: ["year", "month"] },
  issueProducts: { name: "issue_products", headers: ["issueId", "index", "json"], numeric: ["index"] },
  settings: { name: "settings", headers: ["key", "value"], numeric: [] }
};

function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || "load";
    if (action === "version") return json_({ ok: true, version: version_() });
    if (action === "issue") return issueResponse_(e.parameter.id);
    ensureSheets_();
    return json_(Object.assign({ ok: true, version: version_() }, readAll_()));
  } catch (error) { return json_({ ok: false, error: String(error && error.message || error) }); }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const body = JSON.parse(e.postData.contents);
    if (EDIT_CODE && body.code !== EDIT_CODE) return json_({ ok: false, error: "unauthorized" });
    lock.waitLock(25000);
    ensureSheets_();
    if (body.action === "image") return json_({ ok: true, url: saveImage_(body.uid, body.dataUrl) });
    const before = version_();
    applyOps_(body.ops || []);
    return json_({ ok: true, prevVersion: before, version: bump_() });
  } catch (error) { return json_({ ok: false, error: String(error && error.message || error) }); }
  finally { try { lock.releaseLock(); } catch (ignore) {} }
}

/** 처음 한 번 편집기에서 실행해 시트 생성과 드라이브 권한 승인을 마친다. */
function authorize() { ensureSheets_(); folder_(); }

// ---------- 읽기 ----------
// 외부에 공유되는 월호 조회는 자주, 여러 명이 열기 때문에 결과를 잠시 캐시해 시트 읽기를 건너뛴다. (발행하면 즉시 지운다)
function issueResponse_(id) {
  const cache = CacheService.getScriptCache(), key = "issue:" + id, hit = cache.get(key);
  if (hit) return ContentService.createTextOutput(hit).setMimeType(ContentService.MimeType.JSON);
  ensureSheets_();
  const issue = readIssue_(id), text = JSON.stringify({ ok: true, issue: issue });
  if (issue && text.length < 90000) { try { cache.put(key, text, 1800); } catch (ignore) {} }
  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.JSON);
}

function readAll_() {
  const issues = readTable_(SHEETS.issues).map(function (row) { return { id: String(row.id), year: Number(row.year), month: Number(row.month), publishedAt: String(row.publishedAt), products: [] }; });
  const byId = {}; issues.forEach(function (issue) { byId[issue.id] = issue; });
  readTable_(SHEETS.issueProducts).sort(function (a, b) { return a.index - b.index; }).forEach(function (row) { if (byId[row.issueId]) byId[row.issueId].products.push(JSON.parse(row.json)); });
  const settings = {};
  readTable_(SHEETS.settings).forEach(function (row) { try { settings[row.key] = JSON.parse(row.value); } catch (ignore) {} });
  return { products: readProducts_(), issues: issues, settings: settings };
}

function readIssue_(id) {
  const meta = readTable_(SHEETS.issues).filter(function (row) { return String(row.id) === String(id); })[0];
  if (!meta) return null;
  const products = readTable_(SHEETS.issueProducts).filter(function (row) { return String(row.issueId) === String(id); }).sort(function (a, b) { return a.index - b.index; }).map(function (row) { return JSON.parse(row.json); });
  return { id: String(meta.id), year: Number(meta.year), month: Number(meta.month), publishedAt: String(meta.publishedAt), products: products };
}

function readProducts_() {
  return readTable_(SHEETS.products).sort(function (a, b) { return a.order - b.order; }).map(function (row) {
    const product = { uid: String(row.uid) };
    FIELDS.forEach(function (field) {
      const value = row[field];
      if (field === "images") { try { product.images = value ? JSON.parse(value) : []; } catch (ignore) { product.images = []; } }
      else if (NUMERIC_FIELDS.indexOf(field) >= 0) product[field] = Number(value) || 0;
      else product[field] = value === null || value === undefined ? "" : String(value);
    });
    return product;
  });
}

function readTable_(spec) {
  const sheet = ss_().getSheetByName(spec.name), last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, spec.headers.length).getValues().filter(function (row) { return row[0] !== "" && row[0] !== null; }).map(function (row) {
    const object = {}; spec.headers.forEach(function (header, i) { object[header] = row[i]; }); return object;
  });
}

// ---------- 쓰기 ----------
function applyOps_(ops) {
  const db = { products: null, issues: null, issueProducts: null, settings: null, dirty: {} };
  const products = function () { return db.products || (db.products = readProducts_()); };
  ops.forEach(function (op) {
    if (op.type === "seed") {
      if (!products().length) { op.products.forEach(function (p) { products().push(makeProduct_(p.uid, p.fields)); }); db.dirty.products = true; }
    } else if (op.type === "add") {
      if (!products().some(function (p) { return p.uid === op.uid; })) { products().unshift(makeProduct_(op.uid, op.fields)); db.dirty.products = true; }
    } else if (op.type === "patch") {
      const target = products().filter(function (p) { return p.uid === op.uid; })[0];
      if (target) { Object.keys(op.fields).forEach(function (field) { if (FIELDS.indexOf(field) >= 0) target[field] = coerce_(field, op.fields[field]); }); db.dirty.products = true; }
    } else if (op.type === "order") {
      const position = {}; op.uids.forEach(function (uid, i) { position[uid] = i; });
      const fresh = products().filter(function (p) { return !(p.uid in position); });
      const known = products().filter(function (p) { return p.uid in position; }).sort(function (a, b) { return position[a.uid] - position[b.uid]; });
      db.products = fresh.concat(known); db.dirty.products = true;
    } else if (op.type === "publish") {
      db.issues = db.issues || readTable_(SHEETS.issues); db.issueProducts = db.issueProducts || readTable_(SHEETS.issueProducts);
      const issue = op.issue;
      db.issues = db.issues.filter(function (row) { return String(row.id) !== issue.id; }); db.issues.push({ id: issue.id, year: issue.year, month: issue.month, publishedAt: issue.publishedAt });
      db.issueProducts = db.issueProducts.filter(function (row) { return String(row.issueId) !== issue.id; });
      issue.products.forEach(function (p, i) { db.issueProducts.push({ issueId: issue.id, index: i, json: JSON.stringify(p) }); });
      db.dirty.issues = true;
    } else if (op.type === "setting") {
      db.settings = db.settings || readTable_(SHEETS.settings);
      db.settings = db.settings.filter(function (row) { return row.key !== op.key; }); db.settings.push({ key: op.key, value: JSON.stringify(op.value) });
      db.dirty.settings = true;
    }
  });
  if (db.dirty.products) writeTable_(SHEETS.products, db.products.map(function (p, i) { return Object.assign({ order: i }, p); }));
  if (db.dirty.issues) {
    writeTable_(SHEETS.issues, db.issues); writeTable_(SHEETS.issueProducts, db.issueProducts);
    CacheService.getScriptCache().removeAll(db.issues.map(function (row) { return "issue:" + row.id; }));
  }
  if (db.dirty.settings) writeTable_(SHEETS.settings, db.settings);
}

function makeProduct_(uid, fields) {
  const product = { uid: uid };
  FIELDS.forEach(function (field) { product[field] = coerce_(field, fields[field]); });
  return product;
}

function coerce_(field, value) {
  if (field === "images") return Array.isArray(value) ? value : [];
  if (NUMERIC_FIELDS.indexOf(field) >= 0) return Number(value) || 0;
  return value === null || value === undefined ? "" : String(value);
}

function writeTable_(spec, objects) {
  const sheet = ss_().getSheetByName(spec.name), width = spec.headers.length, last = sheet.getLastRow();
  if (last > 1) sheet.getRange(2, 1, last - 1, width).clearContent();
  if (!objects.length) return;
  const rows = objects.map(function (object) {
    return spec.headers.map(function (header) {
      const value = object[header];
      if (header === "images") return JSON.stringify(value || []);
      return value === undefined || value === null ? "" : value;
    });
  });
  const needed = rows.length + 1;
  if (sheet.getMaxRows() < needed) sheet.insertRowsAfter(sheet.getMaxRows(), needed - sheet.getMaxRows() + 50);
  sheet.getRange(2, 1, rows.length, width).setValues(rows);
}

// ---------- 시트/버전/사진 ----------
function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function ensureSheets_() {
  Object.keys(SHEETS).forEach(function (key) {
    const spec = SHEETS[key];
    if (ss_().getSheetByName(spec.name)) return;
    const sheet = ss_().insertSheet(spec.name);
    sheet.getRange(1, 1, 1, spec.headers.length).setValues([spec.headers]);
    sheet.setFrozenRows(1);
    // 숫자로 보이는 글자(예: 500, 2027.02.11)가 숫자·날짜로 바뀌거나 =로 시작하는 글이 수식이 되지 않도록 글자 형식으로 고정한다.
    spec.headers.forEach(function (header, i) { if (spec.numeric.indexOf(header) < 0) sheet.getRange(1, i + 1, sheet.getMaxRows(), 1).setNumberFormat("@"); });
  });
}

function version_() { return Number(PropertiesService.getScriptProperties().getProperty("version") || 0); }
function bump_() { const next = version_() + 1; PropertiesService.getScriptProperties().setProperty("version", String(next)); return next; }

function folder_() {
  const found = DriveApp.getFoldersByName(IMAGE_FOLDER);
  return found.hasNext() ? found.next() : DriveApp.createFolder(IMAGE_FOLDER);
}

function saveImage_(uid, dataUrl) {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(String(dataUrl || ""));
  if (!match) throw new Error("이미지 형식이 올바르지 않습니다.");
  if (match[2].length > 3 * 1024 * 1024) throw new Error("이미지가 너무 큽니다.");
  const extension = match[1].split("/")[1].replace("+xml", "");
  const blob = Utilities.newBlob(Utilities.base64Decode(match[2]), match[1], String(uid) + "-" + Date.now() + "." + extension);
  const file = folder_().createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return "https://lh3.googleusercontent.com/d/" + file.getId();
}

function json_(object) { return ContentService.createTextOutput(JSON.stringify(object)).setMimeType(ContentService.MimeType.JSON); }
