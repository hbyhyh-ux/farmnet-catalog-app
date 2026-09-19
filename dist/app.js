const STORAGE = { products: "farmnet-products-v3", issues: "farmnet-issues-v3", columns: "farmnet-columns-v1", widths: "farmnet-column-widths-v1" };
const STATUS = ["운영중", "임시품절", "단종"];
const COLUMN_DEFS = {
  image: { label: "상품사진", width: 108, type: "image" },
  name: { label: "상품명", width: 210, required: true },
  category: { label: "상품 유형", width: 160 },
  status: { label: "운영 상태", width: 120, type: "status" },
  project: { label: "사업명", width: 230 },
  organization: { label: "운영기관", width: 150 },
  manager: { label: "담당자", width: 120 },
  origin: { label: "원산지", width: 120 },
  storage: { label: "보관방법", width: 110 },
  shelfLife: { label: "소비기한", width: 150, type: "date" },
  barcode: { label: "바코드", width: 150 },
  description: { label: "상품소개", width: 300, type: "textarea" },
  weight: { label: "중량·용량", width: 150 },
  setPack: { label: "세트 구성", width: 150 },
  boxPack: { label: "박스 입수", width: 130 },
  wholesalePrice: { label: "공급가", width: 130, type: "money" },
  price: { label: "소비자가", width: 140, type: "money" },
  shippingMethod: { label: "배송방법", width: 130 },
  shippingFee: { label: "배송비", width: 130, type: "money" },
  channel: { label: "판매채널", width: 130 },
  saleLink: { label: "판매링크", width: 260, type: "url" },
  note: { label: "비고", width: 220, type: "textarea" }
};
const DEFAULT_COLUMNS = Object.keys(COLUMN_DEFS);
const state = {
  products: [], issues: [], section: "products", mode: "view", search: "", status: "전체", selected: new Set(), openIssue: null,
  columns: JSON.parse(localStorage.getItem(STORAGE.columns) || "null") || [...DEFAULT_COLUMNS],
  widths: JSON.parse(localStorage.getItem(STORAGE.widths) || "{}"), draggedColumn: null, draggedRow: null, justDragged: false
};
const icons = {
  box: '<svg viewBox="0 0 24 24"><path d="m21 8-9 5-9-5 9-5 9 5Z"/><path d="M3 8v8l9 5 9-5V8M12 13v8"/></svg>',
  calendar: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  send: '<svg viewBox="0 0 24 24"><path d="m22 2-7 20-4-9-9-4 20-7Z"/><path d="M22 2 11 13"/></svg>',
  eye: '<svg viewBox="0 0 24 24"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>',
  external: '<svg viewBox="0 0 24 24"><path d="M14 3h7v7M10 14 21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></svg>'
};

const appView = document.querySelector("#appView");
const productDialog = document.querySelector("#productDialog");
const formDialog = document.querySelector("#formDialog");
const publishDialog = document.querySelector("#publishDialog");
const toast = document.querySelector("#toast");
document.querySelectorAll("[data-icon]").forEach((el) => { el.innerHTML = icons[el.dataset.icon] || ""; });

function escapeHtml(value = "") { return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
function uid() { return crypto.randomUUID ? crypto.randomUUID() : `p-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function digits(value) { return String(value ?? "").replace(/[^0-9]/g, ""); }
function numberValue(value) { const match = String(value ?? "").match(/[0-9][0-9,]*/); return match ? Number(match[0].replaceAll(",", "")) || 0 : 0; }
function formatNumber(value) { const number = numberValue(value); return number ? number.toLocaleString("ko-KR") : ""; }
function formatPrice(value) { const formatted = formatNumber(value); return formatted ? `${formatted}원` : "가격 미입력"; }
function isoDate(value) { const match = String(value || "").trim().match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})$/); return match ? `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}` : ""; }
function statusClass(status) { return status === "임시품절" ? "paused" : status === "단종" ? "ended" : "active"; }
function showToast(message) { toast.textContent = message; toast.classList.add("is-visible"); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove("is-visible"), 2400); }
function imageMarkup(product, className = "thumb") { return product.images?.[0] ? `<span class="${className}"><img src="${escapeHtml(product.images[0])}" alt="${escapeHtml(product.name)}"></span>` : `<span class="${className}"><span class="image-placeholder">${escapeHtml(product.name?.slice(0, 1) || "F")}</span></span>`; }
function persist() {
  try { localStorage.setItem(STORAGE.products, JSON.stringify(state.products)); localStorage.setItem(STORAGE.issues, JSON.stringify(state.issues)); localStorage.setItem(STORAGE.columns, JSON.stringify(state.columns)); localStorage.setItem(STORAGE.widths, JSON.stringify(state.widths)); }
  catch { showToast("브라우저 저장공간이 부족합니다. 오래된 발행본을 정리해주세요."); }
  updateBadges();
}
function updateBadges() { document.querySelector("#productCountBadge").textContent = state.products.length; document.querySelector("#issueCountBadge").textContent = state.issues.length; }
function pageHead(title, description, actions = "") { return `<div class="page-head"><div><p class="eyebrow">FAMNET CATALOG</p><h1>${title}</h1><p>${description}</p></div><div class="page-actions">${actions}</div></div>`; }
function visibleProducts() { const query = state.search.trim().toLowerCase(); return state.products.filter((p) => (state.status === "전체" || p.status === state.status) && (!query || state.columns.some((key) => String(p[key] || "").toLowerCase().includes(query)))); }
function render() { document.querySelectorAll(".nav-item").forEach((el) => el.classList.toggle("is-active", el.dataset.section === state.section)); if (state.section === "products") renderProducts(); else renderIssues(); }

function normalizeProduct(source, index = 0, total = 0) {
  const product = { ...source };
  product.uid = product.uid || uid();
  product.status = product.status || (index >= total - 3 ? "단종" : (!product.included || index === 8 || index === 17 ? "임시품절" : "운영중"));
  product.saleLink = product.saleLink || product.url || "";
  ["wholesalePrice", "price", "shippingFee"].forEach((key) => { product[key] = numberValue(product[key]); });
  delete product.id; delete product.legacyNo; delete product.url; delete product.saleStatus;
  return product;
}

function renderProducts() {
  const products = visibleProducts();
  const counts = Object.fromEntries(STATUS.map((status) => [status, state.products.filter((p) => p.status === status).length]));
  const cols = state.columns.filter((key) => COLUMN_DEFS[key]);
  const tableWidth = 64 + cols.reduce((sum, key) => sum + (state.widths[key] || COLUMN_DEFS[key].width), 0);
  appView.innerHTML = `${pageHead("상품관리 및 발행", "열 머리글과 행의 ⋮⋮ 손잡이를 드래그해 원하는 순서로 정리할 수 있습니다.", `<button class="button secondary" id="newProduct">${icons.plus}상품 등록</button><button class="button primary" id="openPublish" ${state.selected.size ? "" : "disabled"}>${icons.send}선택 ${state.selected.size}개 발행</button>`)}
    <section class="summary-strip"><div><span>전체 상품</span><strong>${state.products.length}</strong></div>${STATUS.map((status) => `<div><span><i class="status-dot ${statusClass(status)}"></i>${status}</span><strong>${counts[status]}</strong></div>`).join("")}</section>
    <section class="panel"><div class="panel-head"><div class="status-filters">${["전체", ...STATUS].map((status) => `<button class="filter-chip ${state.status === status ? "is-active" : ""}" data-status="${status}">${status}<span>${status === "전체" ? state.products.length : counts[status]}</span></button>`).join("")}</div><div class="toolbar"><label class="search-wrap">${icons.search}<input id="productSearch" value="${escapeHtml(state.search)}" placeholder="전체 상품정보 검색"></label><div class="mode-switch"><button class="${state.mode === "view" ? "is-active" : ""}" data-mode="view">${icons.eye}보기모드</button><button class="${state.mode === "edit" ? "is-active" : ""}" data-mode="edit">${icons.edit}수정모드</button></div></div></div>
      <div class="table-guide"><span>↔ 열 머리글 드래그: 순서 변경</span><span>열 경계 드래그: 너비 변경</span><span>⋮⋮ 행 손잡이 드래그: 상품 순서 변경</span></div>
      <div class="table-scroll"><table class="catalog-table ${state.mode === "edit" ? "edit-table" : ""}" style="width:${tableWidth}px"><colgroup><col class="utility-col">${cols.map((key) => `<col data-col-width="${key}" style="width:${state.widths[key] || COLUMN_DEFS[key].width}px">`).join("")}</colgroup><thead><tr><th class="utility-head"><input id="selectAll" type="checkbox" aria-label="현재 목록 전체 선택" ${products.length && products.every((p) => state.selected.has(p.uid)) ? "checked" : ""}></th>${cols.map(columnHeader).join("")}</tr></thead><tbody>${products.map(productRow).join("") || `<tr><td colspan="${cols.length + 1}" class="empty-cell">조건에 맞는 상품이 없습니다.</td></tr>`}</tbody></table></div>
      <div class="table-footer"><span>총 ${products.length}개 표시 · ${cols.length}개 정보 열</span><span>${state.mode === "edit" ? "입력값을 바꾸면 즉시 저장됩니다." : "상품 행을 누르면 상세 팝업에서 바로 수정할 수 있습니다."}</span></div></section>`;
}
function columnHeader(key) { const def = COLUMN_DEFS[key]; return `<th draggable="true" data-column="${key}"><span class="column-drag">⋮⋮</span>${def.label}<span class="resize-handle" data-resize-column="${key}" aria-hidden="true"></span></th>`; }
function productRow(product) { return `<tr draggable="true" data-row-id="${product.uid}" data-product="${product.uid}"><td class="utility-cell"><span class="row-drag" title="상품 순서 이동">⋮⋮</span><input type="checkbox" data-select="${product.uid}" aria-label="${escapeHtml(product.name)} 발행 선택" ${state.selected.has(product.uid) ? "checked" : ""}></td>${state.columns.filter((key) => COLUMN_DEFS[key]).map((key) => `<td data-cell="${key}">${state.mode === "edit" ? editCell(product, key) : viewCell(product, key)}</td>`).join("")}</tr>`; }
function viewCell(product, key) {
  const def = COLUMN_DEFS[key], value = product[key];
  if (def.type === "image") return imageMarkup(product);
  if (def.type === "status") return `<span class="status-pill ${statusClass(value)}">${escapeHtml(value || "운영중")}</span>`;
  if (def.type === "money") return `<strong>${formatPrice(value)}</strong>`;
  if (def.type === "url") return value ? `<a class="table-link" href="${escapeHtml(value)}" target="_blank" rel="noopener" title="${escapeHtml(value)}">판매처 열기 ↗</a>` : '<span class="muted">-</span>';
  if (def.type === "textarea") return `<span class="cell-clamp" title="${escapeHtml(value || "")}">${escapeHtml(value || "-")}</span>`;
  return escapeHtml(value || "-");
}
function editCell(product, key) {
  const def = COLUMN_DEFS[key], value = product[key] ?? "";
  if (def.type === "image") return `<label class="table-image-edit">${imageMarkup(product)}<input type="file" accept="image/*" data-image-id="${product.uid}"><span>사진 변경</span></label>`;
  if (def.type === "status") return `<select class="cell-input" data-edit-id="${product.uid}" data-field="${key}">${STATUS.map((s) => `<option ${s === value ? "selected" : ""}>${s}</option>`).join("")}</select>`;
  if (def.type === "textarea") return `<textarea class="cell-input cell-textarea" rows="2" data-edit-id="${product.uid}" data-field="${key}">${escapeHtml(value)}</textarea>`;
  if (def.type === "date") return `<input class="cell-input" type="date" data-edit-id="${product.uid}" data-field="${key}" value="${isoDate(value)}">`;
  if (def.type === "money") return `<input class="cell-input money-input" inputmode="numeric" data-edit-id="${product.uid}" data-field="${key}" value="${formatNumber(value)}" placeholder="0">`;
  return `<input class="cell-input" type="${def.type === "url" ? "url" : "text"}" data-edit-id="${product.uid}" data-field="${key}" value="${escapeHtml(value)}">`;
}

function fieldMarkup(key, value = "", prefix = "") {
  const def = COLUMN_DEFS[key], name = `${prefix}${key}`, wide = ["name", "project", "description", "saleLink", "note"].includes(key) ? "wide" : "";
  if (def.type === "image") return "";
  if (def.type === "status") return `<label class="${wide}"><span>${def.label}</span><select name="${name}">${STATUS.map((s) => `<option ${s === value ? "selected" : ""}>${s}</option>`).join("")}</select></label>`;
  if (def.type === "textarea") return `<label class="${wide}"><span>${def.label}</span><textarea name="${name}" rows="3">${escapeHtml(value)}</textarea></label>`;
  const type = def.type === "date" ? "date" : def.type === "url" ? "url" : "text";
  const money = def.type === "money" ? ' money-input" inputmode="numeric' : "";
  return `<label class="${wide}"><span>${def.label}${def.required ? " *" : ""}</span><input class="${money}" type="${type}" name="${name}" value="${escapeHtml(def.type === "money" ? formatNumber(value) : def.type === "date" ? isoDate(value) : value)}" ${def.required ? "required" : ""}></label>`;
}
function registrationFields() { return state.columns.filter((key) => key !== "image" && COLUMN_DEFS[key]).map((key) => fieldMarkup(key)).join(""); }

function openProduct(product, options = {}) {
  if (!product) return;
  const readOnly = Boolean(options.readOnly);
  const image = product.images?.[0] ? `<img src="${escapeHtml(product.images[0])}" alt="${escapeHtml(product.name)}">` : `<span>${escapeHtml(product.name?.slice(0, 1) || "F")}</span>`;
  document.querySelector("#productDialogContent").innerHTML = readOnly
    ? `<div class="detail-layout"><div class="detail-image">${image}</div><div class="detail-info"><span class="status-pill ${statusClass(product.status)}">${product.status}</span><p class="detail-category">${escapeHtml(product.category || "상품 유형 미입력")}</p><h2>${escapeHtml(product.name)}</h2><p class="detail-description">${escapeHtml(product.description || "상품 설명이 아직 입력되지 않았습니다.").replaceAll("\n", "<br>")}</p><strong class="detail-price">${formatPrice(product.price)}</strong>${detailFacts(product)}${product.saleLink ? `<a class="button primary sales-button" href="${escapeHtml(product.saleLink)}" target="_blank" rel="noopener">판매처에서 보기 ↗</a>` : ""}</div></div>`
    : `<form id="detailEditForm" data-detail-id="${product.uid}"><div class="detail-edit-layout"><div class="detail-edit-aside"><div id="detailImagePreview" class="detail-image">${image}</div><label class="button secondary image-change-button"><input id="detailImageInput" type="file" accept="image/*">사진 변경</label><p>업로드한 사진은 1:1 비율로 자동 저장됩니다.</p></div><div class="detail-edit-main"><p class="eyebrow">PRODUCT EDIT</p><h2>${escapeHtml(product.name)}</h2><div class="form-grid detail-form-grid">${state.columns.filter((key) => key !== "image" && COLUMN_DEFS[key]).map((key) => fieldMarkup(key, product[key] ?? "", "detail-")).join("")}</div><div class="dialog-actions"><button class="button secondary" type="button" data-close-dialog>닫기</button><button class="button primary" type="submit">변경사항 저장</button></div></div></div></form>`;
  productDialog.showModal();
}
function detailFacts(product) { return `<dl>${state.columns.filter((key) => !["image", "name", "description", "price", "saleLink", "status"].includes(key)).map((key) => `<div><dt>${COLUMN_DEFS[key].label}</dt><dd>${escapeHtml(product[key] || "-")}</dd></div>`).join("")}</dl>`; }

function renderIssues() {
  if (state.openIssue) return renderIssueDetail(state.openIssue);
  const issues = [...state.issues].sort((a, b) => b.id.localeCompare(a.id));
  appView.innerHTML = `${pageHead("월간 발행", "관리자용 발행 기록입니다. 외부 카탈로그 미리보기는 각 월호에서 별도로 엽니다.")}<section class="issue-list">${issues.map((issue) => `<article class="issue-card"><button data-issue="${issue.id}"><span class="issue-month"><strong>${String(issue.month).padStart(2, "0")}</strong><small>${issue.year}</small></span><span class="issue-info"><em>발행 완료</em><strong>${issue.year}년 ${issue.month}월호</strong><small>${issue.products.length}개 상품 · ${escapeHtml(issue.publishedAt)}</small></span><span class="issue-arrow">→</span></button><a class="issue-public-link" href="?catalog=${issue.id}" target="_blank">${icons.external} 외부 카탈로그</a></article>`).join("") || `<div class="empty-state"><span>月</span><h2>아직 발행된 월호가 없습니다.</h2><p>상품관리 및 발행 탭에서 상품을 선택해 첫 월호를 만들어보세요.</p><button class="button primary" data-go-products>상품 선택하러 가기</button></div>`}</section>`;
}
function renderIssueDetail(issueId) {
  const issue = state.issues.find((item) => item.id === issueId); if (!issue) { state.openIssue = null; return renderIssues(); }
  const counts = Object.fromEntries(STATUS.map((s) => [s, issue.products.filter((p) => p.status === s).length]));
  appView.innerHTML = `<button class="back-button" id="backToIssues">← 월간 발행 목록</button>${pageHead(`${issue.year}년 ${issue.month}월호`, `${issue.publishedAt} 발행 · 발행 당시의 상품 정보입니다.`, `<a class="button primary" href="?catalog=${issue.id}" target="_blank">${icons.external}외부 카탈로그 보기</a>`)}<section class="issue-hero"><div class="issue-cover"><strong>${String(issue.month).padStart(2, "0")}</strong><span>${issue.year}</span></div><div><span class="status-pill active">발행 완료</span><h2>팜넷 카페테리아 상품 리스트</h2><p>총 ${issue.products.length}개 상품 · 운영중 ${counts["운영중"]} · 임시품절 ${counts["임시품절"]} · 단종 ${counts["단종"]}</p></div></section><section class="panel"><div class="panel-head"><div><h2>발행 상품</h2><p>상품을 누르면 발행 당시 정보를 확인할 수 있습니다.</p></div></div><div class="published-grid">${issue.products.map((p) => publishedCard(p, issue.id)).join("")}</div></section>`;
}
function publishedCard(product, issueId, publicMode = false) { return `<article class="published-product"><button class="published-detail" data-snapshot="${issueId}" data-snapshot-product="${product.uid}">${imageMarkup(product, "published-thumb")}<span class="status-pill ${statusClass(product.status)}">${product.status}</span><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.category || "상품 유형 미입력")}</small><em>${formatPrice(product.price)}</em></button>${product.saleLink ? `<a class="sales-link" href="${escapeHtml(product.saleLink)}" target="_blank" rel="noopener">판매처에서 보기 ↗</a>` : `<span class="sales-link disabled">판매링크 미등록</span>`}</article>`; }
function renderPublicCatalog(issueId) {
  document.body.classList.add("public-catalog-mode");
  const issue = state.issues.find((item) => item.id === issueId);
  if (!issue) { appView.innerHTML = `<div class="public-empty"><span>F</span><h1>이 카탈로그를 불러올 수 없습니다.</h1><p>현재 HTML 초안은 발행한 브라우저에만 데이터가 저장됩니다.<br>외부 공유 운영을 위해서는 공용 데이터베이스 연결이 필요합니다.</p></div>`; return; }
  appView.innerHTML = `<div class="public-catalog"><header><div class="public-brand"><span class="brand-mark">F</span><strong>FAMNET CAFETERIA</strong></div><p>${issue.year} MONTHLY COLLECTION</p><h1>${issue.month}월의 팜넷 상품</h1><span>${issue.publishedAt} 발행 · ${issue.products.length}개 상품</span></header><main><div class="public-products">${issue.products.map((p) => publishedCard(p, issue.id, true)).join("")}</div></main></div>`;
}

function openPublish() {
  const now = new Date(), year = now.getFullYear(), month = now.getMonth() + 1; document.querySelector("#publishProductCount").textContent = `${state.selected.size}개`;
  document.querySelector("#publishYear").innerHTML = Array.from({ length: 7 }, (_, i) => year - 2 + i).map((y) => `<option ${y === year ? "selected" : ""}>${y}</option>`).join("");
  document.querySelector("#publishMonth").innerHTML = Array.from({ length: 12 }, (_, i) => i + 1).map((m) => `<option ${m === month ? "selected" : ""}>${m}</option>`).join(""); publishDialog.showModal();
}
function publishIssue() {
  const year = Number(document.querySelector("#publishYear").value), month = Number(document.querySelector("#publishMonth").value), id = `${year}-${String(month).padStart(2, "0")}`;
  const issue = { id, year, month, publishedAt: new Intl.DateTimeFormat("ko-KR", { dateStyle: "long" }).format(new Date()), products: state.products.filter((p) => state.selected.has(p.uid)).map(clone) };
  const index = state.issues.findIndex((item) => item.id === id); if (index >= 0) state.issues[index] = issue; else state.issues.push(issue);
  state.selected.clear(); state.section = "issues"; state.openIssue = id; persist(); publishDialog.close(); render(); showToast(`${year}년 ${month}월호가 발행되었습니다.`);
}

async function squareImage(file, size = 720) {
  const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
  const image = await new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = dataUrl; });
  const side = Math.min(image.naturalWidth, image.naturalHeight), sx = (image.naturalWidth - side) / 2, sy = (image.naturalHeight - side) / 2;
  const canvas = document.createElement("canvas"); canvas.width = size; canvas.height = size; canvas.getContext("2d").drawImage(image, sx, sy, side, side, 0, 0, size, size);
  return canvas.toDataURL("image/webp", .86);
}
async function replaceImage(product, file, previewSelector) { if (!file) return; const value = await squareImage(file); product.images = [value]; persist(); const preview = document.querySelector(previewSelector); if (preview) preview.innerHTML = `<img src="${value}" alt="${escapeHtml(product.name)}">`; showToast("상품사진을 1:1 비율로 저장했습니다."); }

document.addEventListener("click", (event) => {
  const nav = event.target.closest(".nav-item"); if (nav) { state.section = nav.dataset.section; state.openIssue = null; state.search = ""; return render(); }
  if (event.target.closest("[data-go-products]")) { state.section = "products"; return render(); }
  const mode = event.target.closest("[data-mode]"); if (mode) { state.mode = mode.dataset.mode; return renderProducts(); }
  const filter = event.target.closest("[data-status]"); if (filter) { state.status = filter.dataset.status; return renderProducts(); }
  if (event.target.closest("#newProduct")) { document.querySelector("#productForm").reset(); delete document.querySelector("#newProductImage").dataset.processed; document.querySelector("#registrationFields").innerHTML = registrationFields(); document.querySelector("#newProductPreview").innerHTML = "＋"; return formDialog.showModal(); }
  if (event.target.closest("#openPublish")) return openPublish(); if (event.target.closest("#confirmPublish")) return publishIssue();
  if (event.target.closest("#backToIssues")) { state.openIssue = null; return renderIssues(); }
  const issue = event.target.closest("[data-issue]"); if (issue) { state.openIssue = issue.dataset.issue; return renderIssues(); }
  const snapshot = event.target.closest("[data-snapshot-product]"); if (snapshot) { const source = state.issues.find((i) => i.id === snapshot.dataset.snapshot); return openProduct(source?.products.find((p) => p.uid === snapshot.dataset.snapshotProduct), { readOnly: true }); }
  const product = event.target.closest("[data-product]"); if (product && !event.target.closest("input,select,textarea,a,label,.row-drag") && !state.justDragged) return openProduct(state.products.find((p) => p.uid === product.dataset.product));
  const close = event.target.closest("[data-close-dialog]"); if (close) return close.closest("dialog").close();
});

document.addEventListener("input", (event) => {
  if (event.target.id === "productSearch") { state.search = event.target.value; renderProducts(); document.querySelector("#productSearch")?.focus(); }
  if (event.target.matches(".money-input")) event.target.value = formatNumber(event.target.value);
});
document.addEventListener("change", async (event) => {
  if (event.target.matches("[data-select]")) { event.target.checked ? state.selected.add(event.target.dataset.select) : state.selected.delete(event.target.dataset.select); return renderProducts(); }
  if (event.target.id === "selectAll") { visibleProducts().forEach((p) => event.target.checked ? state.selected.add(p.uid) : state.selected.delete(p.uid)); return renderProducts(); }
  if (event.target.matches("[data-edit-id]")) { const product = state.products.find((p) => p.uid === event.target.dataset.editId); if (!product) return; const field = event.target.dataset.field; product[field] = COLUMN_DEFS[field].type === "money" ? numberValue(event.target.value) : event.target.value; persist(); showToast(`${product.name || "상품"} 정보가 저장되었습니다.`); }
  if (event.target.matches("[data-image-id]")) { const product = state.products.find((p) => p.uid === event.target.dataset.imageId); if (product) { await replaceImage(product, event.target.files?.[0], ""); renderProducts(); } }
  if (event.target.id === "newProductImage" && event.target.files?.[0]) { const value = await squareImage(event.target.files[0]); event.target.dataset.processed = value; document.querySelector("#newProductPreview").innerHTML = `<img src="${value}" alt="미리보기">`; }
  if (event.target.id === "detailImageInput") { const product = state.products.find((p) => p.uid === document.querySelector("#detailEditForm")?.dataset.detailId); if (product) await replaceImage(product, event.target.files?.[0], "#detailImagePreview"); }
});

document.addEventListener("dragstart", (event) => {
  const th = event.target.closest("th[data-column]"); if (th && !event.target.closest(".resize-handle")) { state.draggedColumn = th.dataset.column; event.dataTransfer.effectAllowed = "move"; th.classList.add("is-dragging"); return; }
  const row = event.target.closest("tr[data-row-id]"); if (row && event.target.closest(".row-drag")) { state.draggedRow = row.dataset.rowId; state.justDragged = true; event.dataTransfer.effectAllowed = "move"; row.classList.add("is-dragging"); } else if (row) event.preventDefault();
});
document.addEventListener("dragover", (event) => { if (event.target.closest("th[data-column],tr[data-row-id]")) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } });
document.addEventListener("drop", (event) => {
  const th = event.target.closest("th[data-column]"); if (th && state.draggedColumn) { event.preventDefault(); const target = th.dataset.column, from = state.columns.indexOf(state.draggedColumn), to = state.columns.indexOf(target); if (from !== to) { const [moved] = state.columns.splice(from, 1); state.columns.splice(to, 0, moved); persist(); renderProducts(); } }
  const row = event.target.closest("tr[data-row-id]"); if (row && state.draggedRow) { event.preventDefault(); const from = state.products.findIndex((p) => p.uid === state.draggedRow), to = state.products.findIndex((p) => p.uid === row.dataset.rowId); if (from >= 0 && to >= 0 && from !== to) { const [moved] = state.products.splice(from, 1); state.products.splice(to, 0, moved); persist(); renderProducts(); } }
});
document.addEventListener("dragend", () => { state.draggedColumn = null; state.draggedRow = null; setTimeout(() => { state.justDragged = false; }, 50); document.querySelectorAll(".is-dragging").forEach((el) => el.classList.remove("is-dragging")); });

document.addEventListener("mousedown", (event) => {
  const handle = event.target.closest("[data-resize-column]"); if (!handle) return;
  event.preventDefault(); event.stopPropagation(); const key = handle.dataset.resizeColumn, col = document.querySelector(`col[data-col-width="${key}"]`); if (!col) return;
  const table = col.closest("table"), startX = event.clientX, startWidth = parseInt(col.style.width, 10) || COLUMN_DEFS[key].width, startTableWidth = parseInt(table.style.width, 10);
  const move = (moveEvent) => { const width = Math.max(80, startWidth + moveEvent.clientX - startX); col.style.width = `${width}px`; table.style.width = `${startTableWidth + width - startWidth}px`; state.widths[key] = width; };
  const up = () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); persist(); };
  document.addEventListener("mousemove", move); document.addEventListener("mouseup", up);
});

document.querySelector("#productForm").addEventListener("submit", async (event) => {
  event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget)); const product = normalizeProduct({ uid: uid(), images: event.currentTarget.image.dataset.processed ? [event.currentTarget.image.dataset.processed] : [] });
  state.columns.forEach((key) => { if (key === "image") return; const value = data[key] ?? ""; product[key] = COLUMN_DEFS[key].type === "money" ? numberValue(value) : value; });
  state.products.unshift(product); persist(); formDialog.close(); renderProducts(); showToast("새 상품이 등록되었습니다.");
});
document.addEventListener("submit", (event) => {
  if (event.target.id !== "detailEditForm") return; event.preventDefault(); const product = state.products.find((p) => p.uid === event.target.dataset.detailId); if (!product) return;
  const data = Object.fromEntries(new FormData(event.target)); state.columns.forEach((key) => { if (key === "image") return; const value = data[`detail-${key}`] ?? ""; product[key] = COLUMN_DEFS[key].type === "money" ? numberValue(value) : value; });
  persist(); productDialog.close(); renderProducts(); showToast("상품 상세정보를 저장했습니다.");
});
[productDialog, formDialog, publishDialog].forEach((dialog) => dialog.addEventListener("click", (event) => { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); }));

async function init() {
  try {
    const response = await fetch("data/products.json"); if (!response.ok) throw new Error("상품 데이터를 불러오지 못했습니다."); const source = await response.json();
    const savedProducts = JSON.parse(localStorage.getItem(STORAGE.products) || "null"), savedIssues = JSON.parse(localStorage.getItem(STORAGE.issues) || "null"), raw = savedProducts || source;
    state.products = raw.map((p, index) => normalizeProduct(p, index, raw.length)); state.issues = (savedIssues || []).map((issue) => ({ ...issue, products: issue.products.map((p) => normalizeProduct(p)) }));
    state.columns = [...new Set([...state.columns.filter((key) => COLUMN_DEFS[key]), ...DEFAULT_COLUMNS.filter((key) => !state.columns.includes(key))])]; persist();
    const publicIssue = new URLSearchParams(location.search).get("catalog"); if (publicIssue) renderPublicCatalog(publicIssue); else render();
  } catch (error) { appView.innerHTML = `<div class="empty-state"><span>!</span><h2>상품 데이터를 불러오지 못했습니다.</h2><p>${escapeHtml(error.message)}</p></div>`; }
}
init();
