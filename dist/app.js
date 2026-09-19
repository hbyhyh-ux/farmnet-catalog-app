const STORAGE = { products: "farmnet-products-v3", issues: "farmnet-issues-v3", columns: "farmnet-columns-v1", widths: "farmnet-column-widths-v1" };
const STATUS = ["운영중", "임시품절", "단종"];
const COLUMN_DEFS = {
  image: { label: "상품사진", width: 108, type: "image" },
  name: { label: "상품명", width: 210, required: true },
  category: { label: "상품 유형", width: 160 },
  status: { label: "운영 상태", width: 120, type: "status" },
  project: { label: "사업명", width: 230 },
  origin: { label: "원산지", width: 120 },
  storage: { label: "보관방법", width: 110 },
  shelfLife: { label: "소비기한", width: 150, type: "date" },
  description: { label: "상품소개", width: 300, type: "textarea" },
  weight: { label: "중량·용량", width: 150 },
  boxPack: { label: "박스 입수", width: 130 },
  price: { label: "소비자가", width: 140, type: "money" },
  shippingFee: { label: "배송비", width: 130, type: "money" },
  saleLink: { label: "판매링크", width: 260, type: "url" }
};
const DEFAULT_COLUMNS = Object.keys(COLUMN_DEFS);
const Sync = window.FarmnetSync || { enabled: false };
// 운영중 → 임시품절 → 단종 순으로 항상 묶어서 보여준다. (같은 상태 안에서는 직접 정한 순서를 유지)
const statusRank = (status) => Math.max(0, STATUS.indexOf(status));
const sortProducts = (list) => list.sort((a, b) => statusRank(a.status) - statusRank(b.status));
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
const confirmDialog = document.querySelector("#confirmDialog");
let searchTimer;
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
// 모달 팝업 위에서도 보이도록 popover(최상위 레이어)로 띄운다.
function showToast(message) {
  toast.textContent = message; clearTimeout(showToast.timer); clearTimeout(showToast.hideTimer);
  try { if (!toast.matches(":popover-open")) toast.showPopover(); } catch {}
  void toast.offsetWidth; toast.classList.add("is-visible");
  showToast.timer = setTimeout(() => { toast.classList.remove("is-visible"); showToast.hideTimer = setTimeout(() => { try { toast.hidePopover(); } catch {} }, 260); }, 2400);
}
function imageMarkup(product, className = "thumb") { return product.images?.[0] ? `<span class="${className}"><img src="${escapeHtml(product.images[0])}" alt="${escapeHtml(product.name)}" loading="lazy" decoding="async"></span>` : `<span class="${className}"><span class="image-placeholder">${escapeHtml(product.name?.slice(0, 1) || "F")}</span></span>`; }
// 바뀐 항목만 저장한다 (기본: 상품). 발행본·열 설정까지 매번 통째로 직렬화하지 않는다.
function persist(...keys) {
  if (Sync.enabled) { Sync.save(); return updateBadges(); }
  const targets = keys.length ? keys : ["products"];
  try { targets.forEach((key) => localStorage.setItem(STORAGE[key], JSON.stringify(state[key]))); }
  catch { showToast("브라우저 저장공간이 부족합니다. 오래된 발행본을 정리해주세요."); }
  updateBadges();
}
function updateBadges() { document.querySelector("#productCountBadge").textContent = state.products.length; document.querySelector("#issueCountBadge").textContent = state.issues.length; }
function pageHead(title, description, actions = "") { return `<div class="page-head"><div><h1>${title}</h1>${description ? `<p>${description}</p>` : ""}</div><div class="page-actions">${actions}</div></div>`; }
function visibleProducts() { const query = state.search.trim().toLowerCase(); return state.products.filter((p) => (state.status === "전체" || p.status === state.status) && (!query || state.columns.some((key) => String(p[key] || "").toLowerCase().includes(query)))); }
function render() { document.querySelectorAll(".nav-item").forEach((el) => el.classList.toggle("is-active", el.dataset.section === state.section)); if (state.section === "products") renderProducts(); else renderIssues(); }

// 기본 데이터(data/products.js)는 이미 정리돼 있고, 예전 버전으로 저장된 브라우저 데이터만 보정한다.
function normalizeProduct(source) {
  const product = { ...source };
  product.uid = product.uid || uid();
  product.status = product.status || "운영중";
  product.saleLink = product.saleLink || product.url || "";
  ["price", "shippingFee"].forEach((key) => { product[key] = numberValue(product[key]); });
  ["id", "legacyNo", "url", "saleStatus", "wholesalePrice", "organization", "manager", "barcode", "setPack", "shippingMethod", "note", "channel", "included", "featured", "change"].forEach((key) => delete product[key]);
  return product;
}

function renderProducts() {
  const prevScroll = document.querySelector(".table-scroll"), scrollTop = prevScroll?.scrollTop || 0, scrollLeft = prevScroll?.scrollLeft || 0;
  const products = visibleProducts();
  const counts = Object.fromEntries(STATUS.map((status) => [status, state.products.filter((p) => p.status === status).length]));
  const cols = state.columns.filter((key) => COLUMN_DEFS[key]);
  const tableWidth = 64 + cols.reduce((sum, key) => sum + (state.widths[key] || COLUMN_DEFS[key].width), 0);
  appView.innerHTML = `${pageHead("상품관리 및 발행", "", `<button class="button secondary" id="newProduct">${icons.plus}상품 등록</button><button class="button primary" id="openPublish" ${state.selected.size ? "" : "disabled"}>${icons.send}선택 ${state.selected.size}개 발행</button>`)}
    <section class="panel"><div class="panel-head"><div class="status-filters">${["전체", ...STATUS].map((status) => `<button class="filter-chip ${state.status === status ? "is-active" : ""}" data-status="${status}">${status}<span>${status === "전체" ? state.products.length : counts[status]}</span></button>`).join("")}</div><div class="toolbar"><label class="search-wrap">${icons.search}<input id="productSearch" value="${escapeHtml(state.search)}" placeholder="전체 상품정보 검색"></label><div class="mode-switch"><button class="${state.mode === "view" ? "is-active" : ""}" data-mode="view">${icons.eye}보기모드</button><button class="${state.mode === "edit" ? "is-active" : ""}" data-mode="edit">${icons.edit}수정모드</button></div></div></div>
      <div class="table-scroll"><table class="catalog-table ${state.mode === "edit" ? "edit-table" : ""}" style="width:${tableWidth}px"><colgroup><col class="utility-col">${cols.map((key) => `<col data-col-width="${key}" style="width:${state.widths[key] || COLUMN_DEFS[key].width}px">`).join("")}</colgroup><thead><tr><th class="utility-head"><input id="selectAll" type="checkbox" aria-label="현재 목록 전체 선택" ${products.length && products.every((p) => state.selected.has(p.uid)) ? "checked" : ""}></th>${cols.map(columnHeader).join("")}</tr></thead><tbody>${bodyRows(products, cols)}</tbody></table></div>
      <div class="table-footer"><span>총 ${products.length}개 표시 · ${cols.length}개 정보 열</span><span>열 머리글 드래그: 순서 · 열 경계 드래그: 너비 · ⋮⋮ 드래그: 행 순서</span><span>${state.mode === "edit" ? "입력값을 바꾸면 즉시 저장됩니다." : "상품 행을 누르면 상세 팝업이 열립니다."}</span></div></section>
      <div class="viewport-scrollbar" aria-label="상품표 좌우 스크롤"><div style="width:${tableWidth}px"></div></div>`;
  setupTableScrolling();
  const nextScroll = document.querySelector(".table-scroll"); if (nextScroll && (scrollTop || scrollLeft)) { nextScroll.scrollTop = scrollTop; nextScroll.scrollLeft = scrollLeft; document.querySelector(".viewport-scrollbar").scrollLeft = scrollLeft; }
}
function bodyRows(products, cols) {
  const span = cols.length + 1, searching = Boolean(state.search.trim());
  const html = STATUS.filter((status) => state.status === "전체" || state.status === status).map((status) => {
    const rows = products.filter((p) => p.status === status);
    if (!rows.length && searching) return "";
    const head = `<tr class="group-row ${statusClass(status)}" data-group="${status}"><td colspan="${span}"><div class="group-label"><i class="status-dot ${statusClass(status)}"></i><strong>${status}</strong><span>${rows.length}개</span></div></td></tr>`;
    return head + (rows.map(productRow).join("") || `<tr class="group-empty" data-group="${status}"><td colspan="${span}"><em>상품을 여기로 끌어다 놓으면 ${status} 상태로 바뀝니다.</em></td></tr>`);
  }).join("");
  return html || `<tr><td colspan="${span}" class="empty-cell">조건에 맞는 상품이 없습니다.</td></tr>`;
}
function refreshRows() {
  const products = visibleProducts(), cols = state.columns.filter((key) => COLUMN_DEFS[key]);
  const tbody = document.querySelector(".catalog-table tbody"); if (!tbody) return renderProducts();
  tbody.innerHTML = bodyRows(products, cols);
  const footer = document.querySelector(".table-footer span"); if (footer) footer.textContent = `총 ${products.length}개 표시 · ${cols.length}개 정보 열`;
  syncSelection(products);
}
function syncSelection(products = visibleProducts()) {
  const all = document.querySelector("#selectAll"); if (all) all.checked = Boolean(products.length) && products.every((p) => state.selected.has(p.uid));
  const publish = document.querySelector("#openPublish"); if (publish) { publish.disabled = !state.selected.size; publish.lastChild.textContent = `선택 ${state.selected.size}개 발행`; }
}
function setupTableScrolling() {
  const tableScroll = document.querySelector(".table-scroll"), viewportScroll = document.querySelector(".viewport-scrollbar");
  if (!tableScroll || !viewportScroll) return;
  let syncing = false;
  const sync = (source, target) => { if (syncing) return; syncing = true; target.scrollLeft = source.scrollLeft; requestAnimationFrame(() => { syncing = false; }); };
  tableScroll.addEventListener("scroll", () => sync(tableScroll, viewportScroll));
  viewportScroll.addEventListener("scroll", () => sync(viewportScroll, tableScroll));
}
function columnHeader(key) { const def = COLUMN_DEFS[key]; return `<th data-column="${key}" title="드래그: 열 순서 변경"><span class="column-drag">⋮⋮</span>${def.label}<span class="resize-handle" data-resize-column="${key}" aria-hidden="true"></span></th>`; }
function productRow(product) { return `<tr class="row-${statusClass(product.status)}" data-row-id="${product.uid}" data-product="${product.uid}"><td class="utility-cell"><span class="row-drag" title="상품 순서 이동">⋮⋮</span><input type="checkbox" data-select="${product.uid}" aria-label="${escapeHtml(product.name)} 발행 선택" ${state.selected.has(product.uid) ? "checked" : ""}></td>${state.columns.filter((key) => COLUMN_DEFS[key]).map((key) => `<td data-cell="${key}">${state.mode === "edit" ? editCell(product, key) : viewCell(product, key)}</td>`).join("")}</tr>`; }
function viewCell(product, key) {
  const def = COLUMN_DEFS[key], value = product[key];
  if (def.type === "image") return imageMarkup(product);
  if (def.type === "status") return `<select class="status-select ${statusClass(value)}" data-edit-id="${product.uid}" data-field="status" aria-label="운영 상태 변경">${STATUS.map((s) => `<option ${s === (value || "운영중") ? "selected" : ""}>${s}</option>`).join("")}</select>`;
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
    ? `<div class="detail-layout"><div class="detail-image">${image}</div><div class="detail-info"><p class="detail-project">${escapeHtml(product.project || "사업명 미입력")}</p><p class="detail-category">${escapeHtml(product.category || "상품 유형 미입력")}</p><h2>${escapeHtml(product.name)}</h2><p class="detail-description">${escapeHtml(product.description || "상품 설명이 아직 입력되지 않았습니다.").replaceAll("\n", "<br>")}</p><strong class="detail-price">${formatPrice(product.price)}</strong>${detailFacts(product)}${product.saleLink ? `<a class="button primary sales-button" href="${escapeHtml(product.saleLink)}" target="_blank" rel="noopener">판매처에서 보기 ↗</a>` : ""}</div></div>`
    : `<form id="detailEditForm" data-detail-id="${product.uid}"><div class="detail-edit-layout"><div class="detail-edit-aside"><div id="detailImagePreview" class="detail-image">${image}</div><label class="button secondary image-change-button"><input id="detailImageInput" type="file" accept="image/*">사진 변경</label><p>업로드한 사진은 1:1 비율로 자동 저장됩니다.</p></div><div class="detail-edit-main"><p class="eyebrow">PRODUCT EDIT</p><h2>${escapeHtml(product.name)}</h2><div class="form-grid detail-form-grid">${state.columns.filter((key) => key !== "image" && COLUMN_DEFS[key]).map((key) => fieldMarkup(key, product[key] ?? "", "detail-")).join("")}</div><div class="dialog-actions"><button class="button secondary" type="button" data-close-dialog>닫기</button><button class="button primary" type="submit">변경사항 저장</button></div></div></div></form>`;
  productDialog.showModal();
}
function detailFacts(product) { return `<dl>${state.columns.filter((key) => !["image", "project", "category", "name", "description", "price", "saleLink"].includes(key)).map((key) => `<div><dt>${COLUMN_DEFS[key].label}</dt><dd>${escapeHtml(product[key] || "-")}</dd></div>`).join("")}</dl>`; }

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
function publishedCard(product, issueId, publicMode = false) {
  const summary = publicMode
    ? `<strong>${escapeHtml(product.name)}</strong><small class="public-weight">${escapeHtml(product.weight || "중량 미입력")}</small><p class="public-description">${escapeHtml(product.description || "상품 소개가 아직 입력되지 않았습니다.")}</p><em>${formatPrice(product.price)}</em>`
    : `<span class="status-pill ${statusClass(product.status)}">${product.status}</span><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.category || "상품 유형 미입력")}</small><em>${formatPrice(product.price)}</em>`;
  return `<article class="published-product"><button class="published-detail" data-snapshot="${issueId}" data-snapshot-product="${product.uid}">${imageMarkup(product, "published-thumb")}${summary}</button>${product.saleLink ? `<a class="sales-link" href="${escapeHtml(product.saleLink)}" target="_blank" rel="noopener">판매처에서 보기 ↗</a>` : `<span class="sales-link disabled">판매링크 미등록</span>`}</article>`;
}
function renderPublicCatalog(issueId, failed = false) {
  document.body.classList.add("public-catalog-mode"); document.documentElement.classList.remove("is-catalog"); document.querySelector("#catalogSplash")?.remove();
  const issue = state.issues.find((item) => item.id === issueId);
  if (!issue) { appView.innerHTML = `<div class="public-empty"><img class="public-empty-icon" src="assets/icon.png" alt=""><h1>${failed ? "카탈로그를 불러오지 못했습니다." : "이 카탈로그를 찾을 수 없습니다."}</h1><p>${failed ? "네트워크 상태를 확인하고 다시 시도해주세요." : "아직 발행되지 않았거나 주소가 올바르지 않습니다."}</p>${failed ? '<button class="button primary" onclick="location.reload()">다시 시도</button>' : ""}</div>`; return; }
  appView.innerHTML = `<div class="public-catalog"><header><div class="public-brand"><img class="brand-mark" src="assets/icon.png" alt=""><strong>FAMNET CAFETERIA</strong></div><p>${issue.year} MONTHLY COLLECTION</p><h1>${issue.month}월의 팜넷 상품</h1><span>${issue.products.length}개 상품</span></header><main><div class="public-products">${issue.products.map((p) => publishedCard(p, issue.id, true)).join("")}</div></main></div>`;
}

function openPublish() {
  const now = new Date(), year = now.getFullYear(), month = now.getMonth() + 1; document.querySelector("#publishProductCount").textContent = `${state.selected.size}개`;
  document.querySelector("#publishYear").innerHTML = Array.from({ length: 7 }, (_, i) => year - 2 + i).map((y) => `<option ${y === year ? "selected" : ""}>${y}</option>`).join("");
  document.querySelector("#publishMonth").innerHTML = Array.from({ length: 12 }, (_, i) => i + 1).map((m) => `<option ${m === month ? "selected" : ""}>${m}</option>`).join(""); publishDialog.showModal();
}
function askConfirm({ title, message, ok }) {
  return new Promise((resolve) => {
    const okButton = document.querySelector("#confirmOk"), cancelButton = document.querySelector("#confirmCancel");
    document.querySelector("#confirmTitle").textContent = title; document.querySelector("#confirmMessage").innerHTML = message; okButton.textContent = ok;
    const finish = (value) => { okButton.onclick = cancelButton.onclick = confirmDialog.onclose = null; if (confirmDialog.open) confirmDialog.close(); resolve(value); };
    okButton.onclick = () => finish(true); cancelButton.onclick = () => finish(false); confirmDialog.onclose = () => finish(false);
    confirmDialog.showModal();
  });
}
async function requestPublish() {
  const year = Number(document.querySelector("#publishYear").value), month = Number(document.querySelector("#publishMonth").value), id = `${year}-${String(month).padStart(2, "0")}`;
  const existing = state.issues.find((item) => item.id === id), count = state.selected.size;
  const confirmed = await askConfirm(existing
    ? { title: `${year}년 ${month}월호를 덮어쓸까요?`, message: `이미 발행된 ${year}년 ${month}월호가 있습니다.<br>덮어쓰면 기존 <strong>${existing.products.length}개</strong> 상품이 이번에 선택한 <strong>${count}개</strong> 상품으로 교체됩니다.`, ok: "덮어쓰기" }
    : { title: `${year}년 ${month}월호를 신규 발행할까요?`, message: `아직 발행된 ${year}년 ${month}월호가 없습니다.<br>선택한 <strong>${count}개</strong> 상품으로 새 월호를 발행합니다.`, ok: "신규 발행" });
  if (confirmed) publishIssue();
}
function publishIssue() {
  const year = Number(document.querySelector("#publishYear").value), month = Number(document.querySelector("#publishMonth").value), id = `${year}-${String(month).padStart(2, "0")}`;
  const issue = { id, year, month, publishedAt: new Intl.DateTimeFormat("ko-KR", { dateStyle: "long" }).format(new Date()), products: state.products.filter((p) => state.selected.has(p.uid)).map(clone) };
  const index = state.issues.findIndex((item) => item.id === id); if (index >= 0) state.issues[index] = issue; else state.issues.push(issue);
  state.selected.clear(); state.section = "issues"; state.openIssue = id; persist("issues"); publishDialog.close(); render(); showToast(`${year}년 ${month}월호가 발행되었습니다.`);
}

async function squareImage(file, size = 640) {
  const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
  const image = await new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = dataUrl; });
  const side = Math.min(image.naturalWidth, image.naturalHeight), sx = (image.naturalWidth - side) / 2, sy = (image.naturalHeight - side) / 2;
  const canvas = document.createElement("canvas"); canvas.width = size; canvas.height = size; canvas.getContext("2d").drawImage(image, sx, sy, side, side, 0, 0, size, size);
  return canvas.toDataURL("image/webp", .8);
}
async function replaceImage(product, file, previewSelector) {
  if (!file) return;
  try { product.images = [await squareImage(file)]; } catch { return showToast("사진을 불러오지 못했습니다. 다른 이미지로 다시 시도해주세요."); }
  persist();
  const preview = previewSelector ? document.querySelector(previewSelector) : null;
  if (preview) preview.innerHTML = `<img src="${product.images[0]}" alt="${escapeHtml(product.name)}">`;
  renderProducts();
  showToast(`${(product.name || "상품").replace(/\s+/g, " ")} 사진이 변경되었습니다.`);
}

document.addEventListener("click", (event) => {
  const nav = event.target.closest(".nav-item"); if (nav) { state.section = nav.dataset.section; state.openIssue = null; state.search = ""; return render(); }
  if (event.target.closest("[data-go-products]")) { state.section = "products"; return render(); }
  const mode = event.target.closest("[data-mode]"); if (mode) { state.mode = mode.dataset.mode; return renderProducts(); }
  const filter = event.target.closest("[data-status]"); if (filter) { state.status = filter.dataset.status; return renderProducts(); }
  if (event.target.closest("#newProduct")) { document.querySelector("#productForm").reset(); delete document.querySelector("#newProductImage").dataset.processed; document.querySelector("#registrationFields").innerHTML = registrationFields(); document.querySelector("#newProductPreview").innerHTML = "＋"; return formDialog.showModal(); }
  if (event.target.closest("#openPublish")) return openPublish(); if (event.target.closest("#confirmPublish")) return requestPublish();
  if (event.target.closest("#backToIssues")) { state.openIssue = null; return renderIssues(); }
  const issue = event.target.closest("[data-issue]"); if (issue) { state.openIssue = issue.dataset.issue; return renderIssues(); }
  const snapshot = event.target.closest("[data-snapshot-product]"); if (snapshot) { const source = state.issues.find((i) => i.id === snapshot.dataset.snapshot); return openProduct(source?.products.find((p) => p.uid === snapshot.dataset.snapshotProduct), { readOnly: true }); }
  const product = event.target.closest("[data-product]"); if (product && !event.target.closest("input,select,textarea,a,label,.row-drag") && !state.justDragged) return openProduct(state.products.find((p) => p.uid === product.dataset.product));
  const close = event.target.closest("[data-close-dialog]"); if (close) return close.closest("dialog").close();
});

document.addEventListener("input", (event) => {
  if (event.target.id === "productSearch") { state.search = event.target.value; clearTimeout(searchTimer); searchTimer = setTimeout(refreshRows, 120); }
  if (event.target.matches(".money-input")) event.target.value = formatNumber(event.target.value);
});
document.addEventListener("change", async (event) => {
  if (event.target.matches("[data-select]")) { event.target.checked ? state.selected.add(event.target.dataset.select) : state.selected.delete(event.target.dataset.select); return syncSelection(); }
  if (event.target.id === "selectAll") { visibleProducts().forEach((p) => event.target.checked ? state.selected.add(p.uid) : state.selected.delete(p.uid)); document.querySelectorAll("[data-select]").forEach((box) => { box.checked = event.target.checked; }); return syncSelection(); }
  if (event.target.matches("[data-edit-id]")) { const product = state.products.find((p) => p.uid === event.target.dataset.editId); if (!product) return; const field = event.target.dataset.field; product[field] = COLUMN_DEFS[field].type === "money" ? numberValue(event.target.value) : event.target.value; if (field === "status") sortProducts(state.products); persist(); showToast(field === "status" ? `${(product.name || "상품").replace(/\s+/g, " ")}: ${product.status}(으)로 이동했습니다.` : `${product.name || "상품"} 정보가 저장되었습니다.`); if (field === "status") renderProducts(); }
  if (event.target.matches("[data-image-id]")) { const product = state.products.find((p) => p.uid === event.target.dataset.imageId); if (product) { await replaceImage(product, event.target.files?.[0], ""); renderProducts(); } }
  if (event.target.id === "newProductImage" && event.target.files?.[0]) { const value = await squareImage(event.target.files[0]); event.target.dataset.processed = value; document.querySelector("#newProductPreview").innerHTML = `<img src="${value}" alt="미리보기">`; }
  if (event.target.id === "detailImageInput") { const product = state.products.find((p) => p.uid === document.querySelector("#detailEditForm")?.dataset.detailId); if (product) await replaceImage(product, event.target.files?.[0], "#detailImagePreview"); event.target.value = ""; }
});

document.addEventListener("dragstart", (event) => {
  if (!(event.target instanceof Element)) return;
  event.dataTransfer.setData("text/plain", "");
  const th = event.target.closest("th[data-column]"); if (th) { state.draggedColumn = th.dataset.column; event.dataTransfer.effectAllowed = "move"; th.classList.add("is-dragging"); return; }
  const row = event.target.closest("tr[data-row-id]"); if (row) { state.draggedRow = row.dataset.rowId; state.justDragged = true; event.dataTransfer.effectAllowed = "move"; row.classList.add("is-dragging"); }
});
document.addEventListener("dragover", (event) => {
  if (!(event.target instanceof Element)) return;
  const th = event.target.closest("th[data-column]");
  if (th && state.draggedColumn) {
    event.preventDefault(); event.dataTransfer.dropEffect = "move";
    const dragged = document.querySelector(`th[data-column="${state.draggedColumn}"]`);
    if (!dragged || dragged === th) return;
    const placeAfter = event.clientX > th.getBoundingClientRect().left + th.offsetWidth / 2;
    const reference = placeAfter ? th.nextElementSibling : th;
    if (reference === dragged) return;
    th.parentElement.insertBefore(dragged, reference);
    const draggedCol = document.querySelector(`col[data-col-width="${state.draggedColumn}"]`), targetCol = document.querySelector(`col[data-col-width="${th.dataset.column}"]`);
    if (draggedCol && targetCol) targetCol.parentElement.insertBefore(draggedCol, placeAfter ? targetCol.nextElementSibling : targetCol);
    document.querySelectorAll("tr[data-row-id]").forEach((row) => {
      const draggedCell = row.querySelector(`[data-cell="${state.draggedColumn}"]`), targetCell = row.querySelector(`[data-cell="${th.dataset.column}"]`);
      if (draggedCell && targetCell) row.insertBefore(draggedCell, placeAfter ? targetCell.nextElementSibling : targetCell);
    });
    state.columns = [...document.querySelectorAll("th[data-column]")].map((header) => header.dataset.column);
    return;
  }
  const row = event.target.closest("tr[data-row-id],tr[data-group]");
  if (row && state.draggedRow) {
    event.preventDefault(); event.dataTransfer.dropEffect = "move";
    document.querySelectorAll(".drop-target").forEach((el) => el.classList.remove("drop-target"));
    if (row.dataset.rowId !== state.draggedRow) row.classList.add("drop-target");
  }
});
document.addEventListener("drop", (event) => {
  if (!(event.target instanceof Element)) return;
  if (state.draggedColumn) { event.preventDefault(); return; }
  const target = event.target.closest("tr[data-row-id],tr[data-group]");
  if (target && state.draggedRow) { event.preventDefault(); moveProduct(state.draggedRow, target); }
});
// 행을 놓은 위치의 운영 상태로 바뀐다. 상태 머리글에 놓으면 그 그룹의 맨 위로 들어간다.
function moveProduct(uid, target) {
  const from = state.products.findIndex((p) => p.uid === uid); if (from < 0) return;
  const moved = state.products[from], previous = moved.status;
  if (target.dataset.rowId) {
    if (target.dataset.rowId === uid) return;
    const to = state.products.findIndex((p) => p.uid === target.dataset.rowId); if (to < 0) return;
    const targetStatus = state.products[to].status;
    state.products.splice(from, 1); moved.status = targetStatus;
    const at = state.products.findIndex((p) => p.uid === target.dataset.rowId);
    state.products.splice(from < to ? at + 1 : at, 0, moved);
  } else {
    state.products.splice(from, 1); moved.status = target.dataset.group;
    const first = state.products.findIndex((p) => statusRank(p.status) >= statusRank(moved.status));
    state.products.splice(first < 0 ? state.products.length : first, 0, moved);
  }
  sortProducts(state.products); persist(); renderProducts();
  if (moved.status !== previous) showToast(`${(moved.name || "상품").replace(/\s+/g, " ")}: ${previous} → ${moved.status}`);
}
document.addEventListener("dragend", () => {
  if (state.draggedColumn) persist("columns");
  state.draggedColumn = null; state.draggedRow = null; setTimeout(() => { state.justDragged = false; }, 50);
  document.querySelectorAll(".is-dragging,.drop-target").forEach((el) => el.classList.remove("is-dragging", "drop-target"));
  disarmDrag();
});

// 열 머리글/행 손잡이를 누르고 있는 동안에만 draggable로 만든다. (열 너비 조절과 겹치지 않도록)
function disarmDrag() { document.querySelectorAll('th[draggable="true"],tr[draggable="true"]').forEach((el) => el.removeAttribute("draggable")); }
document.addEventListener("mousedown", (event) => {
  if (event.button !== 0 || !(event.target instanceof Element)) return;
  const handle = event.target.closest("[data-resize-column]");
  if (handle) {
    event.preventDefault(); disarmDrag();
    const key = handle.dataset.resizeColumn, col = document.querySelector(`col[data-col-width="${key}"]`); if (!col) return;
    const table = col.closest("table"), startX = event.clientX, startWidth = parseInt(col.style.width, 10) || COLUMN_DEFS[key].width, startTableWidth = parseInt(table.style.width, 10);
    document.body.classList.add("is-resizing");
    const move = (moveEvent) => {
      if (!moveEvent.buttons) return up();
      const width = Math.max(80, startWidth + moveEvent.clientX - startX); col.style.width = `${width}px`; table.style.width = `${startTableWidth + width - startWidth}px`; state.widths[key] = width;
    };
    const up = () => { document.body.classList.remove("is-resizing"); document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); window.removeEventListener("blur", up); persist("widths"); };
    document.addEventListener("mousemove", move); document.addEventListener("mouseup", up); window.addEventListener("blur", up);
    return;
  }
  if (event.target.closest("input,select,textarea")) return;
  const th = event.target.closest("th[data-column]"); if (th) return th.setAttribute("draggable", "true");
  const grip = event.target.closest(".row-drag"); if (grip) grip.closest("tr")?.setAttribute("draggable", "true");
});
document.addEventListener("mouseup", disarmDrag);

document.querySelector("#productForm").addEventListener("submit", async (event) => {
  event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget)); const product = normalizeProduct({ uid: uid(), images: event.currentTarget.image.dataset.processed ? [event.currentTarget.image.dataset.processed] : [] });
  state.columns.forEach((key) => { if (key === "image") return; const value = data[key] ?? ""; product[key] = COLUMN_DEFS[key].type === "money" ? numberValue(value) : value; });
  state.products.unshift(product); sortProducts(state.products); persist(); formDialog.close(); renderProducts(); showToast("새 상품이 등록되었습니다.");
});
document.addEventListener("submit", (event) => {
  if (event.target.id !== "detailEditForm") return; event.preventDefault(); const product = state.products.find((p) => p.uid === event.target.dataset.detailId); if (!product) return;
  const data = Object.fromEntries(new FormData(event.target)); state.columns.forEach((key) => { if (key === "image") return; const value = data[`detail-${key}`] ?? ""; product[key] = COLUMN_DEFS[key].type === "money" ? numberValue(value) : value; });
  sortProducts(state.products); persist(); productDialog.close(); renderProducts(); showToast("상품 상세정보를 저장했습니다.");
});
[productDialog, formDialog, publishDialog, confirmDialog].forEach((dialog) => dialog.addEventListener("click", (event) => { if (event.target !== dialog) return; const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); }));

const mergeColumns = (columns) => [...new Set([...columns.filter((key) => COLUMN_DEFS[key]), ...DEFAULT_COLUMNS])];
function canRefresh() {
  const active = document.activeElement;
  const typing = active && (active.tagName === "TEXTAREA" || (active.tagName === "INPUT" && active.id !== "productSearch" && !["checkbox", "file", "button"].includes(active.type)));
  return !document.querySelector("dialog[open]") && !typing && !state.draggedColumn && !state.draggedRow && !document.body.classList.contains("is-resizing");
}
function renderKeepingSearch() {
  const searching = document.activeElement?.id === "productSearch";
  render(); updateBadges();
  if (searching) { const input = document.querySelector("#productSearch"); input?.focus(); input?.setSelectionRange(input.value.length, input.value.length); }
}

// 외부 카탈로그: 전에 본 적 있으면 저장해 둔 화면을 바로 보여주고, 최신 내용은 뒤에서 받아 달라졌을 때만 갱신한다.
async function loadPublicCatalog(id) {
  const cacheKey = `farmnet-catalog-${id}`;
  let cached = null; try { cached = JSON.parse(localStorage.getItem(cacheKey) || "null"); } catch {}
  if (cached) { state.issues = [cached]; renderPublicCatalog(id); }
  try {
    const fresh = await Sync.loadIssue(id);
    if (!fresh) { if (cached) try { localStorage.removeItem(cacheKey); } catch {} state.issues = []; return renderPublicCatalog(id); }
    try { localStorage.setItem(cacheKey, JSON.stringify(fresh)); } catch {}
    if (!cached || JSON.stringify(cached) !== JSON.stringify(fresh)) { state.issues = [fresh]; renderPublicCatalog(id); }
  } catch { if (!cached) { state.issues = []; renderPublicCatalog(id, true); } }
}

async function init() {
  try {
    const publicIssue = new URLSearchParams(location.search).get("catalog");
    if (Sync.enabled) {
      // 모두가 함께 쓰는 공용 데이터: 구글 시트(Apps Script)에서 불러온다.
      document.querySelector(".sidebar-note strong").textContent = "공용 데이터";
      document.querySelector(".sidebar-note p").textContent = "모든 담당자가 같은 데이터를 함께 수정합니다. 변경은 몇 초 안에 다른 사람 화면에도 반영됩니다.";
      appView.innerHTML = '<div class="empty-state"><span>…</span><h2>공용 데이터를 불러오는 중입니다.</h2></div>';
      Sync.attach(state, { normalize: normalizeProduct, sort: sortProducts, mergeColumns, canRefresh, render: renderKeepingSearch, seed: () => sortProducts((window.__PRODUCTS__ || []).map(normalizeProduct)) });
      if (publicIssue) return loadPublicCatalog(publicIssue);
      await Sync.load(); updateBadges(); return render();
    }
    const savedProducts = JSON.parse(localStorage.getItem(STORAGE.products) || "null"), savedIssues = JSON.parse(localStorage.getItem(STORAGE.issues) || "null"), raw = savedProducts || window.__PRODUCTS__;
    if (!raw) throw new Error("상품 데이터를 불러오지 못했습니다.");
    const mapped = raw.map(normalizeProduct); state.products = sortProducts([...mapped]); const reordered = state.products.some((p, i) => p !== mapped[i]); state.issues = (savedIssues || []).map((issue) => ({ ...issue, products: issue.products.map(normalizeProduct) }));
    state.columns = [...new Set([...state.columns.filter((key) => COLUMN_DEFS[key]), ...DEFAULT_COLUMNS.filter((key) => !state.columns.includes(key))])];
    if (!savedProducts || reordered) persist(); else updateBadges();
    if (publicIssue) renderPublicCatalog(publicIssue); else render();
  } catch (error) { appView.innerHTML = `<div class="empty-state"><span>!</span><h2>상품 데이터를 불러오지 못했습니다.</h2><p>${escapeHtml(error.message)}</p><button class="button primary" onclick="location.reload()">다시 시도</button></div>`; }
}
init();
