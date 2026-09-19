const STORAGE = { products: "farmnet-products-v3", issues: "farmnet-issues-v3" };
const STATUS = ["운영중", "임시품절", "단종"];
const state = { products: [], issues: [], section: "products", mode: "view", search: "", status: "전체", selected: new Set(), openIssue: null };
const icons = {
  box: '<svg viewBox="0 0 24 24"><path d="m21 8-9 5-9-5 9-5 9 5Z"/><path d="M3 8v8l9 5 9-5V8M12 13v8"/></svg>',
  calendar: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  send: '<svg viewBox="0 0 24 24"><path d="m22 2-7 20-4-9-9-4 20-7Z"/><path d="M22 2 11 13"/></svg>',
  eye: '<svg viewBox="0 0 24 24"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>'
};
const appView = document.querySelector("#appView");
const productDialog = document.querySelector("#productDialog");
const formDialog = document.querySelector("#formDialog");
const publishDialog = document.querySelector("#publishDialog");
const toast = document.querySelector("#toast");
document.querySelectorAll("[data-icon]").forEach((el) => { el.innerHTML = icons[el.dataset.icon] || ""; });

function escapeHtml(value = "") { return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
function formatPrice(value) { const number = Number(value); return Number.isFinite(number) && number ? `${number.toLocaleString("ko-KR")}원` : "가격 미입력"; }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function persist() { localStorage.setItem(STORAGE.products, JSON.stringify(state.products)); localStorage.setItem(STORAGE.issues, JSON.stringify(state.issues)); updateBadges(); }
function updateBadges() { document.querySelector("#productCountBadge").textContent = state.products.length; document.querySelector("#issueCountBadge").textContent = state.issues.length; }
function showToast(message) { toast.textContent = message; toast.classList.add("is-visible"); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove("is-visible"), 2400); }
function imageMarkup(product, className = "thumb") { return product.images?.[0] ? `<span class="${className}"><img src="${escapeHtml(product.images[0])}" alt="${escapeHtml(product.name)}"></span>` : `<span class="${className}"><span class="image-placeholder">${escapeHtml(product.name?.slice(0, 1) || "F")}</span></span>`; }
function statusClass(status) { return status === "임시품절" ? "paused" : status === "단종" ? "ended" : "active"; }
function pageHead(title, description, actions = "") { return `<div class="page-head"><div><p class="eyebrow">FAMNET CATALOG</p><h1>${title}</h1><p>${description}</p></div><div class="page-actions">${actions}</div></div>`; }
function visibleProducts() { const query = state.search.trim().toLowerCase(); return state.products.filter((p) => (state.status === "전체" || p.status === state.status) && (!query || `${p.name} ${p.category} ${p.origin}`.toLowerCase().includes(query))); }
function render() { document.querySelectorAll(".nav-item").forEach((el) => el.classList.toggle("is-active", el.dataset.section === state.section)); if (state.section === "products") renderProducts(); else renderIssues(); }

function renderProducts() {
  const products = visibleProducts();
  const counts = Object.fromEntries(STATUS.map((status) => [status, state.products.filter((p) => p.status === status).length]));
  appView.innerHTML = `${pageHead("상품관리 및 발행", "상품을 등록·수정하고, 필요한 상품만 골라 월호로 발행합니다.", `<button class="button secondary" id="newProduct">${icons.plus}상품 등록</button><button class="button primary" id="openPublish" ${state.selected.size ? "" : "disabled"}>${icons.send}선택 ${state.selected.size}개 발행</button>`)}
    <section class="summary-strip"><div><span>전체 상품</span><strong>${state.products.length}</strong></div>${STATUS.map((status) => `<div><span><i class="status-dot ${statusClass(status)}"></i>${status}</span><strong>${counts[status]}</strong></div>`).join("")}</section>
    <section class="panel"><div class="panel-head"><div class="status-filters">${["전체", ...STATUS].map((status) => `<button class="filter-chip ${state.status === status ? "is-active" : ""}" data-status="${status}">${status}<span>${status === "전체" ? state.products.length : counts[status]}</span></button>`).join("")}</div><div class="toolbar"><label class="search-wrap">${icons.search}<input id="productSearch" value="${escapeHtml(state.search)}" placeholder="상품명, 유형, 원산지 검색"></label><div class="mode-switch"><button class="${state.mode === "view" ? "is-active" : ""}" data-mode="view">${icons.eye}보기모드</button><button class="${state.mode === "edit" ? "is-active" : ""}" data-mode="edit">${icons.edit}수정모드</button></div></div></div>
      <div class="table-scroll"><table class="catalog-table ${state.mode === "edit" ? "edit-table" : ""}"><thead><tr><th class="check-col"><input id="selectAll" type="checkbox" aria-label="현재 목록 전체 선택" ${products.length && products.every((p) => state.selected.has(p.id)) ? "checked" : ""}></th><th class="product-col">상품</th><th>상품 유형</th><th>운영 상태</th><th>원산지</th><th>보관</th><th>중량·용량</th><th>소비기한</th><th class="price-col">소비자가</th></tr></thead><tbody>${products.map(state.mode === "edit" ? editRow : viewRow).join("") || `<tr><td colspan="9" class="empty-cell">조건에 맞는 상품이 없습니다.</td></tr>`}</tbody></table></div>
      <div class="table-footer"><span>총 ${products.length}개 표시</span><span>${state.mode === "edit" ? "입력값을 바꾸면 즉시 저장됩니다." : "상품 행을 누르면 상세정보를 크게 볼 수 있습니다."}</span></div></section>`;
}
function checkCell(product) { return `<td class="check-col"><input type="checkbox" data-select="${product.id}" aria-label="${escapeHtml(product.name)} 발행 선택" ${state.selected.has(product.id) ? "checked" : ""}></td>`; }
function viewRow(product) { return `<tr class="clickable-row" data-product="${product.id}">${checkCell(product)}<td><div class="product-cell">${imageMarkup(product)}<span><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.id)}</small></span></div></td><td>${escapeHtml(product.category || "-")}</td><td><span class="status-pill ${statusClass(product.status)}">${product.status}</span></td><td>${escapeHtml(product.origin || "-")}</td><td>${escapeHtml(product.storage || "-")}</td><td>${escapeHtml(product.weight || "-")}</td><td>${escapeHtml(product.shelfLife || "-")}</td><td class="price-col"><strong>${formatPrice(product.price)}</strong></td></tr>`; }
function field(product, key, type = "text") { return `<input class="cell-input" type="${type}" data-edit-id="${product.id}" data-field="${key}" value="${escapeHtml(product[key] || "")}" ${type === "number" ? 'min="0" step="100"' : ""}>`; }
function editRow(product) { return `<tr>${checkCell(product)}<td><div class="product-cell compact">${imageMarkup(product)}<span>${field(product, "name")}<small>${product.id}</small></span></div></td><td>${field(product, "category")}</td><td><select class="cell-input" data-edit-id="${product.id}" data-field="status">${STATUS.map((s) => `<option ${s === product.status ? "selected" : ""}>${s}</option>`).join("")}</select></td><td>${field(product, "origin")}</td><td>${field(product, "storage")}</td><td>${field(product, "weight")}</td><td>${field(product, "shelfLife")}</td><td>${field(product, "price", "number")}</td></tr>`; }

function renderIssues() {
  if (state.openIssue) return renderIssueDetail(state.openIssue);
  const issues = [...state.issues].sort((a, b) => b.id.localeCompare(a.id));
  appView.innerHTML = `${pageHead("월간 발행", "발행이 완료된 월호를 모아보고, 당시 상품 정보를 그대로 조회합니다.")}<section class="issue-list">${issues.map((issue) => `<button class="issue-card" data-issue="${issue.id}"><span class="issue-month"><strong>${String(issue.month).padStart(2, "0")}</strong><small>${issue.year}</small></span><span class="issue-info"><em>발행 완료</em><strong>${issue.year}년 ${issue.month}월호</strong><small>${issue.products.length}개 상품 · ${escapeHtml(issue.publishedAt)}</small></span><span class="issue-arrow">→</span></button>`).join("") || `<div class="empty-state"><span>月</span><h2>아직 발행된 월호가 없습니다.</h2><p>상품관리 및 발행 탭에서 상품을 선택해 첫 월호를 만들어보세요.</p><button class="button primary" data-go-products>상품 선택하러 가기</button></div>`}</section>`;
}
function renderIssueDetail(issueId) {
  const issue = state.issues.find((item) => item.id === issueId); if (!issue) { state.openIssue = null; return renderIssues(); }
  const counts = Object.fromEntries(STATUS.map((s) => [s, issue.products.filter((p) => p.status === s).length]));
  appView.innerHTML = `<button class="back-button" id="backToIssues">← 월간 발행 목록</button>${pageHead(`${issue.year}년 ${issue.month}월호`, `${issue.publishedAt} 발행 · 발행 당시의 상품 정보입니다.`)}<section class="issue-hero"><div class="issue-cover"><strong>${String(issue.month).padStart(2, "0")}</strong><span>${issue.year}</span></div><div><span class="status-pill active">발행 완료</span><h2>팜넷 카페테리아 상품 리스트</h2><p>총 ${issue.products.length}개 상품 · 운영중 ${counts["운영중"]} · 임시품절 ${counts["임시품절"]} · 단종 ${counts["단종"]}</p></div></section><section class="panel"><div class="panel-head"><div><h2>발행 상품</h2><p>상품을 누르면 발행 당시 상세정보를 확인할 수 있습니다.</p></div></div><div class="published-grid">${issue.products.map((p) => `<button class="published-product" data-snapshot="${issue.id}" data-snapshot-product="${p.id}">${imageMarkup(p, "published-thumb")}<span class="status-pill ${statusClass(p.status)}">${p.status}</span><strong>${escapeHtml(p.name)}</strong><small>${escapeHtml(p.category || "상품 유형 미입력")}</small><em>${formatPrice(p.price)}</em></button>`).join("")}</div></section>`;
}

function openProduct(product) {
  if (!product) return;
  document.querySelector("#productDialogContent").innerHTML = `<div class="detail-layout"><div class="detail-image">${product.images?.[0] ? `<img src="${escapeHtml(product.images[0])}" alt="${escapeHtml(product.name)}">` : `<span>${escapeHtml(product.name.slice(0, 1))}</span>`}</div><div class="detail-info"><span class="status-pill ${statusClass(product.status)}">${product.status}</span><p class="detail-category">${escapeHtml(product.category || "상품 유형 미입력")}</p><h2>${escapeHtml(product.name)}</h2><p class="detail-description">${escapeHtml(product.description || "상품 설명이 아직 입력되지 않았습니다.").replaceAll("\n", "<br>")}</p><strong class="detail-price">${formatPrice(product.price)}</strong><dl><div><dt>원산지</dt><dd>${escapeHtml(product.origin || "-")}</dd></div><div><dt>보관방법</dt><dd>${escapeHtml(product.storage || "-")}</dd></div><div><dt>중량·용량</dt><dd>${escapeHtml(product.weight || "-")}</dd></div><div><dt>소비기한</dt><dd>${escapeHtml(product.shelfLife || "-")}</dd></div><div><dt>박스 입수</dt><dd>${escapeHtml(product.boxPack || "-")}</dd></div><div><dt>상품번호</dt><dd>${escapeHtml(product.id)}</dd></div></dl></div></div>`;
  productDialog.showModal();
}
function openPublish() {
  const now = new Date(), year = now.getFullYear(), month = now.getMonth() + 1; document.querySelector("#publishProductCount").textContent = `${state.selected.size}개`;
  document.querySelector("#publishYear").innerHTML = Array.from({ length: 7 }, (_, i) => year - 2 + i).map((y) => `<option ${y === year ? "selected" : ""}>${y}</option>`).join("");
  document.querySelector("#publishMonth").innerHTML = Array.from({ length: 12 }, (_, i) => i + 1).map((m) => `<option ${m === month ? "selected" : ""}>${m}</option>`).join(""); publishDialog.showModal();
}
function publishIssue() {
  const year = Number(document.querySelector("#publishYear").value), month = Number(document.querySelector("#publishMonth").value), id = `${year}-${String(month).padStart(2, "0")}`;
  const issue = { id, year, month, publishedAt: new Intl.DateTimeFormat("ko-KR", { dateStyle: "long" }).format(new Date()), products: state.products.filter((p) => state.selected.has(p.id)).map(clone) };
  const index = state.issues.findIndex((item) => item.id === id); if (index >= 0) state.issues[index] = issue; else state.issues.push(issue);
  state.selected.clear(); state.section = "issues"; state.openIssue = id; persist(); publishDialog.close(); render(); showToast(`${year}년 ${month}월호가 발행되었습니다.`);
}

document.addEventListener("click", (event) => {
  const nav = event.target.closest(".nav-item"); if (nav) { state.section = nav.dataset.section; state.openIssue = null; state.search = ""; return render(); }
  if (event.target.closest("[data-go-products]")) { state.section = "products"; return render(); }
  const mode = event.target.closest("[data-mode]"); if (mode) { state.mode = mode.dataset.mode; return renderProducts(); }
  const filter = event.target.closest("[data-status]"); if (filter) { state.status = filter.dataset.status; return renderProducts(); }
  if (event.target.closest("#newProduct")) { document.querySelector("#productForm").reset(); return formDialog.showModal(); }
  if (event.target.closest("#openPublish")) return openPublish(); if (event.target.closest("#confirmPublish")) return publishIssue();
  if (event.target.closest("#backToIssues")) { state.openIssue = null; return renderIssues(); }
  const issue = event.target.closest("[data-issue]"); if (issue) { state.openIssue = issue.dataset.issue; return renderIssues(); }
  const snapshot = event.target.closest("[data-snapshot-product]"); if (snapshot) { const source = state.issues.find((i) => i.id === snapshot.dataset.snapshot); return openProduct(source?.products.find((p) => p.id === snapshot.dataset.snapshotProduct)); }
  const product = event.target.closest("[data-product]"); if (product && !event.target.closest("input")) return openProduct(state.products.find((p) => p.id === product.dataset.product));
  const close = event.target.closest("[data-close-dialog]"); if (close) return close.closest("dialog").close();
});
document.addEventListener("change", (event) => {
  if (event.target.matches("[data-select]")) { event.target.checked ? state.selected.add(event.target.dataset.select) : state.selected.delete(event.target.dataset.select); return renderProducts(); }
  if (event.target.id === "selectAll") { visibleProducts().forEach((p) => event.target.checked ? state.selected.add(p.id) : state.selected.delete(p.id)); return renderProducts(); }
  if (event.target.matches("[data-edit-id]")) { const product = state.products.find((p) => p.id === event.target.dataset.editId); if (!product) return; product[event.target.dataset.field] = event.target.type === "number" ? Number(event.target.value) : event.target.value; persist(); showToast(`${product.name || "상품"} 정보가 저장되었습니다.`); }
});
document.addEventListener("input", (event) => { if (event.target.id === "productSearch") { state.search = event.target.value; renderProducts(); document.querySelector("#productSearch")?.focus(); } });
document.querySelector("#productForm").addEventListener("submit", (event) => {
  event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget)); const next = Math.max(0, ...state.products.map((p) => Number(String(p.id).replace(/\D/g, "")) || 0)) + 1;
  state.products.unshift({ id: `FM-${String(next).padStart(3, "0")}`, name: data.name.trim(), category: data.category.trim(), status: data.status, origin: data.origin.trim(), storage: data.storage.trim(), weight: data.weight.trim(), shelfLife: data.shelfLife.trim(), price: Number(data.price) || 0, boxPack: data.boxPack.trim(), description: data.description.trim(), images: [] });
  persist(); formDialog.close(); renderProducts(); showToast("새 상품이 등록되었습니다.");
});
[productDialog, formDialog, publishDialog].forEach((dialog) => dialog.addEventListener("click", (event) => { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); }));

async function init() {
  try {
    const response = await fetch("data/products.json"); if (!response.ok) throw new Error("상품 데이터를 불러오지 못했습니다."); const source = await response.json();
    const savedProducts = JSON.parse(localStorage.getItem(STORAGE.products) || "null"), savedIssues = JSON.parse(localStorage.getItem(STORAGE.issues) || "null");
    state.products = savedProducts || source.map((p, index) => ({ ...p, status: index >= source.length - 3 ? "단종" : (!p.included || index === 8 || index === 17 ? "임시품절" : "운영중") })); state.issues = savedIssues || [];
    persist(); render();
  } catch (error) { appView.innerHTML = `<div class="empty-state"><span>!</span><h2>상품 데이터를 불러오지 못했습니다.</h2><p>${escapeHtml(error.message)}</p></div>`; }
}
init();
