const state = {
  products: [],
  section: "issues",
  view: "admin",
  search: "",
  filter: "all",
  publicSearch: "",
  publicCategory: "전체",
  releaseStatus: "작성 중",
};

const icons = {
  grid: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
  box: '<svg viewBox="0 0 24 24"><path d="m21 8-9 5-9-5 9-5 9 5Z"/><path d="M3 8v8l9 5 9-5V8M12 13v8"/></svg>',
  calendar: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>',
  users: '<svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  settings: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08A1.7 1.7 0 0 0 9 19.37a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.63 15a1.7 1.7 0 0 0-1.55-1.03H3v-4h.08A1.7 1.7 0 0 0 4.63 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.63a1.7 1.7 0 0 0 1.03-1.55V3h4v.08A1.7 1.7 0 0 0 15 4.63a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.37 9a1.7 1.7 0 0 0 1.55 1.03H21v4h-.08A1.7 1.7 0 0 0 19.4 15Z"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
  eye: '<svg viewBox="0 0 24 24"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
};

const adminView = document.querySelector("#adminView");
const publicView = document.querySelector("#publicView");
const sidebar = document.querySelector("#sidebar");
const toast = document.querySelector("#toast");
const productDialog = document.querySelector("#productDialog");
const publishDialog = document.querySelector("#publishDialog");

document.querySelectorAll("[data-icon]").forEach((el) => { el.innerHTML = icons[el.dataset.icon] || ""; });

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatPrice(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toLocaleString("ko-KR")}원` : (value || "가격 문의");
}

function short(value, limit = 70) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  return normalized.length > limit ? `${normalized.slice(0, limit)}…` : normalized;
}

function imageMarkup(product, className = "thumb") {
  if (product.images?.length) {
    return `<span class="${className}"><img src="${escapeHtml(product.images[0])}" alt="${escapeHtml(product.name)}" loading="lazy"></span>`;
  }
  return `<span class="${className}"><span class="image-placeholder">${escapeHtml(product.name.slice(0, 1))}</span></span>`;
}

function isReady(product) {
  return Boolean(product.name && product.category && product.description && product.price && product.url && product.images?.length);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("is-visible"), 2600);
}

function setView(view) {
  state.view = view;
  document.querySelector("#app").classList.toggle("public-mode", view === "public");
  document.querySelectorAll(".view-btn").forEach((button) => button.classList.toggle("is-active", button.dataset.view === view));
  const admin = view === "admin";
  sidebar.classList.toggle("is-hidden", !admin);
  adminView.classList.toggle("is-hidden", !admin);
  publicView.classList.toggle("is-hidden", admin);
  if (admin) renderAdmin(); else renderPublic();
  document.querySelector("#mainContent").focus({ preventScroll: true });
}

function renderAdmin() {
  document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("is-active", button.dataset.section === state.section));
  if (state.section === "dashboard") renderDashboard();
  else if (state.section === "products") renderProducts();
  else if (state.section === "issues") renderIssues();
  else renderPlaceholder(state.section);
}

function pageHead({ eyebrow, title, description, actions = "" }) {
  return `<div class="page-head"><div><p class="eyebrow">${eyebrow}</p><h1>${title}</h1><p>${description}</p></div><div class="page-actions">${actions}</div></div>`;
}

function metricCard(label, value, note, accent, warning = false) {
  return `<article class="metric-card ${warning ? "warning" : ""}"><span>${label}</span><div class="metric-top"><strong>${value}</strong><span class="metric-accent">${accent}</span></div><small>${note}</small></article>`;
}

function renderDashboard() {
  const included = state.products.filter((p) => p.included);
  const ready = state.products.filter(isReady).length;
  adminView.innerHTML = `
    ${pageHead({ eyebrow: "운영 현황", title: "대시보드", description: "이번 달 상품 준비 상태와 최근 변경사항입니다.", actions: `<button class="button primary" data-go-section="issues">${icons.calendar}9월호 편집</button>` })}
    <div class="metrics">
      ${metricCard("전체 상품", `${state.products.length}개`, "상품 마스터 기준", "P")}
      ${metricCard("9월호 포함", `${included.length}개`, "전월 대비 신규 3개", "9")}
      ${metricCard("공개 준비 완료", `${ready}개`, `${state.products.length - ready}개 확인 필요`, "✓", ready !== state.products.length)}
      ${metricCard("발행 예정", "9월 23일", "링크 전용 공개", "D")}
    </div>
    <div class="dashboard-grid">
      <section class="panel"><div class="panel-head"><div><h2>최근 활동</h2><p>상품과 발행본의 주요 변경사항</p></div></div>
        <ul class="activity-list">
          <li><span class="activity-mark">+</span><div><strong>신규 상품 3개가 9월호에 추가되었습니다.</strong><p>남원추어 해장국 외 2개 · 오늘 10:24</p></div></li>
          <li><span class="activity-mark">₩</span><div><strong>2개 상품의 소비자가가 변경되었습니다.</strong><p>변경 내용은 9월호에만 적용됩니다. · 어제 16:40</p></div></li>
          <li><span class="activity-mark">✓</span><div><strong>8월호가 보관 상태로 전환되었습니다.</strong><p>기존 공개 링크는 계속 열람할 수 있습니다. · 9월 1일</p></div></li>
        </ul>
      </section>
      <section class="panel"><div class="panel-head"><div><h2>상품정보 완성도</h2><p>외부 공개 필수항목 기준</p></div></div>
        <div class="quality-list">
          <div class="quality-item"><div class="quality-label"><span>기본정보</span><strong>100%</strong></div><div class="progress"><span style="width:100%"></span></div></div>
          <div class="quality-item"><div class="quality-label"><span>상품 이미지</span><strong>96%</strong></div><div class="progress"><span style="width:96%"></span></div></div>
          <div class="quality-item"><div class="quality-label"><span>가격·구매처</span><strong>100%</strong></div><div class="progress"><span style="width:100%"></span></div></div>
          <div class="quality-item"><div class="quality-label"><span>규격 표준화</span><strong>78%</strong></div><div class="progress"><span style="width:78%;background:#d88925"></span></div></div>
        </div>
      </section>
    </div>`;
}

function renderIssues() {
  const query = state.search.toLowerCase();
  const filtered = state.products.filter((product) => {
    const matchesSearch = !query || `${product.name} ${product.category} ${product.project}`.toLowerCase().includes(query);
    const matchesFilter = state.filter === "all" || (state.filter === "included" ? product.included : !product.included);
    return matchesSearch && matchesFilter;
  });
  const included = state.products.filter((p) => p.included);
  const readyCount = included.filter(isReady).length;
  const statusClass = state.releaseStatus === "발행" ? "published" : "";
  adminView.innerHTML = `
    ${pageHead({ eyebrow: "월간 발행", title: "2026년 9월호", description: "지난달 상품을 바탕으로 이번 달 공개 목록을 정리합니다.", actions: `<button class="button secondary" id="cloneIssue">${icons.copy}지난달에서 복제</button><button class="button secondary" data-preview>${icons.eye}외부 화면 미리보기</button><button class="button primary" id="publishIssue" ${state.releaseStatus === "발행" ? "disabled" : ""}>${state.releaseStatus === "발행" ? "발행 완료" : "검수 후 발행"}</button>` })}
    <section class="release-banner">
      <div class="release-title"><div class="release-date">09<small>2026</small></div><div><h2>팜넷 카페테리아 상품 리스트</h2><p>최근 저장 오늘 11:08 · 작성자 김담당</p></div></div>
      <div class="release-meta"><div><span>상태</span><strong class="status-pill ${statusClass}">${state.releaseStatus}</strong></div><div><span>공개 방식</span><strong>링크 전용</strong></div><div><span>발행 예정</span><strong>9월 23일</strong></div></div>
    </section>
    <div class="metrics">
      ${metricCard("포함 상품", `${included.length}개`, `전체 ${state.products.length}개 중`, "P")}
      ${metricCard("신규 상품", "3개", "이번 달 첫 노출", "+")}
      ${metricCard("정보 변경", "2개", "가격 또는 구매처", "↻")}
      ${metricCard("공개 준비", `${readyCount}/${included.length}`, readyCount === included.length ? "모두 준비 완료" : `${included.length - readyCount}개 확인 필요`, "✓", readyCount !== included.length)}
    </div>
    <section class="panel">
      <div class="panel-head"><div><h2>발행 상품</h2><p>체크를 해제하면 이번 달 외부 화면에서 제외됩니다.</p></div>
        <div class="toolbar"><label class="search-wrap" aria-label="상품 검색">${icons.search}<input class="search" id="issueSearch" type="search" placeholder="상품명 또는 사업명 검색" value="${escapeHtml(state.search)}"></label><select class="select" id="issueFilter" aria-label="포함 여부"><option value="all" ${state.filter === "all" ? "selected" : ""}>전체 상품</option><option value="included" ${state.filter === "included" ? "selected" : ""}>포함 상품</option><option value="excluded" ${state.filter === "excluded" ? "selected" : ""}>제외 상품</option></select></div>
      </div>
      <table class="catalog-table"><thead><tr><th class="check-col"><span class="sr-only">포함</span></th><th class="product-col">상품</th><th>공개 정보</th><th class="price-col">소비자가</th><th class="channel-col">구매처</th><th class="state-col">준비 상태</th><th class="action-col"></th></tr></thead>
        <tbody>${filtered.map(issueRow).join("")}</tbody>
      </table>
      <div class="table-footer"><span>${filtered.length}개 상품 표시 중</span><span>변경사항은 자동으로 임시 저장됩니다.</span></div>
    </section>`;
}

function issueRow(product) {
  const ready = isReady(product);
  return `<tr>
    <td class="check-col"><input type="checkbox" data-toggle-product="${product.id}" aria-label="${escapeHtml(product.name)} 포함" ${product.included ? "checked" : ""}></td>
    <td class="product-col"><button class="product-cell reset-button" data-product="${product.id}">${imageMarkup(product)}<span><strong>${escapeHtml(product.name)}${product.change ? `<em class="change-badge">${escapeHtml(product.change)}</em>` : ""}</strong><small>${escapeHtml(product.id)} · ${escapeHtml(product.category)}</small></span></button></td>
    <td><strong>${escapeHtml(product.weight || "규격 미입력")}</strong><br><small class="muted-text">${escapeHtml(product.storage)} · ${escapeHtml(product.origin)}</small></td>
    <td class="price-col"><span class="price">${formatPrice(product.price)}</span></td>
    <td class="channel-col"><span class="channel">${escapeHtml(product.channel || "미입력")}</span></td>
    <td class="state-col"><span class="row-status ${product.included ? (ready ? "" : "warning") : "muted"}">${product.included ? (ready ? "준비 완료" : "확인 필요") : "제외"}</span></td>
    <td class="action-col"><button class="more-button" data-product="${product.id}" aria-label="${escapeHtml(product.name)} 상세 보기">⋯</button></td>
  </tr>`;
}

function renderProducts() {
  const query = state.search.toLowerCase();
  const products = state.products.filter((product) => !query || `${product.name} ${product.category} ${product.project}`.toLowerCase().includes(query));
  adminView.innerHTML = `
    ${pageHead({ eyebrow: "상품 마스터", title: "상품 관리", description: "한 번 등록한 상품정보를 월간 발행본에서 다시 사용합니다.", actions: `<button class="button secondary">엑셀 내보내기</button><button class="button primary" id="newProduct">${icons.plus}상품 등록</button>` })}
    <section class="panel">
      <div class="panel-head"><div><h2>전체 상품</h2><p>판매 상태와 공개 정보를 관리합니다.</p></div><div class="toolbar"><label class="search-wrap">${icons.search}<input class="search" id="productSearch" type="search" placeholder="상품명, 유형, 사업명 검색" value="${escapeHtml(state.search)}"></label><select class="select"><option>판매 중</option><option>작성 중</option><option>판매 종료</option></select></div></div>
      <table class="catalog-table"><thead><tr><th class="product-col">상품</th><th>사업</th><th class="price-col">소비자가</th><th class="channel-col">구매처</th><th class="state-col">상태</th><th class="action-col"></th></tr></thead><tbody>
        ${products.map((product) => `<tr><td class="product-col"><button class="product-cell reset-button" data-product="${product.id}">${imageMarkup(product)}<span><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.id)} · ${escapeHtml(product.category)}</small></span></button></td><td>${escapeHtml(short(product.project, 34))}</td><td class="price-col"><span class="price">${formatPrice(product.price)}</span></td><td class="channel-col"><span class="channel">${escapeHtml(product.channel)}</span></td><td class="state-col"><span class="row-status">판매 중</span></td><td class="action-col"><button class="more-button" data-product="${product.id}">⋯</button></td></tr>`).join("")}
      </tbody></table><div class="table-footer"><span>총 ${products.length}개 상품</span><span>마지막 동기화 오늘 11:08</span></div>
    </section>`;
}

function renderPlaceholder(section) {
  const info = section === "partners"
    ? ["관계사", "회사별 카탈로그 접근 권한과 담당자를 관리하는 영역입니다.", "관계사"]
    : ["설정", "공개 방식, 필수항목, 알림과 사용자 권한을 관리하는 영역입니다.", "설정"];
  adminView.innerHTML = `<div class="placeholder-page"><div><span class="placeholder-icon">${info[2].slice(0,1)}</span><h1>${info[0]}</h1><p>${info[1]}<br>이번 초안에서는 핵심 발행 흐름을 먼저 구현했습니다.</p><button class="button primary" data-go-section="issues">월간 발행으로 돌아가기</button></div></div>`;
}

function renderPublic() {
  const included = state.products.filter((p) => p.included);
  const categories = ["전체", ...new Set(included.map((p) => p.category).filter(Boolean))].slice(0, 6);
  const query = state.publicSearch.toLowerCase();
  const filtered = included.filter((product) => {
    const matchesQuery = !query || `${product.name} ${product.category} ${product.description}`.toLowerCase().includes(query);
    const matchesCategory = state.publicCategory === "전체" || product.category === state.publicCategory;
    return matchesQuery && matchesCategory;
  });
  publicView.innerHTML = `<div class="public-shell">
    <header class="public-hero">
      <div class="public-hero-top"><div class="public-brand"><span class="brand-mark">F</span><span>FAMNET CAFETERIA</span></div><span class="public-help">상품 문의 · 063-000-0000</span></div>
      <div class="public-hero-content"><div><p class="eyebrow">2026 SEPTEMBER COLLECTION</p><h1>지역의 좋은 먹거리,<br><span>이번 달 팜넷에서</span> 만나보세요.</h1><p>팜넷이 발굴하고 함께 만든 지역 특화 상품을 한곳에 모았습니다. 마음에 드는 상품은 연결된 공식 판매처에서 구매할 수 있습니다.</p></div><div class="issue-selector"><button class="month-tab">7월</button><button class="month-tab">8월</button><button class="month-tab is-active">9월</button><button class="month-tab">지난 발행본</button></div></div>
    </header>
    <div class="public-body">
      <div class="public-tools"><label class="search-wrap">${icons.search}<input class="search" id="publicSearch" type="search" placeholder="찾으시는 상품을 검색해보세요" value="${escapeHtml(state.publicSearch)}"></label><div class="filter-chips">${categories.map((category) => `<button class="filter-chip ${state.publicCategory === category ? "is-active" : ""}" data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>`).join("")}</div></div>
      <div class="result-meta"><h2>9월의 상품</h2><p>${filtered.length}개 상품 · 2026년 9월 23일 발행</p></div>
      <div class="product-grid">${filtered.map(productCard).join("")}</div>
    </div>
  </div>`;
}

function productCard(product) {
  const image = product.images?.length
    ? `<img src="${escapeHtml(product.images[0])}" alt="${escapeHtml(product.name)}" loading="lazy">`
    : `<span class="image-placeholder">${escapeHtml(product.name.slice(0, 1))}</span>`;
  return `<article class="product-card" data-product="${product.id}" tabindex="0" role="button" aria-label="${escapeHtml(product.name)} 자세히 보기">
    <div class="card-image">${product.featured ? '<span class="card-tag">팜넷 추천</span>' : ""}${image}</div>
    <div class="card-body"><span class="card-category">${escapeHtml(product.category)}</span><h3>${escapeHtml(product.name)}</h3><p class="card-description">${escapeHtml(product.description)}</p><div class="card-facts"><span>${escapeHtml(product.origin)}</span><span>${escapeHtml(product.storage)}</span><span>${escapeHtml(product.weight)}</span></div><div class="card-bottom"><strong>${formatPrice(product.price)}</strong><button>자세히 보기 →</button></div></div>
  </article>`;
}

function openProduct(productId) {
  const product = state.products.find((item) => item.id === productId);
  if (!product) return;
  const image = product.images?.length
    ? `<img src="${escapeHtml(product.images[0])}" alt="${escapeHtml(product.name)}">`
    : `<span class="image-placeholder">${escapeHtml(product.name.slice(0, 1))}</span>`;
  document.querySelector("#productDialogContent").innerHTML = `<div class="product-detail"><div class="detail-gallery">${image}</div><div class="detail-info"><span class="card-category">${escapeHtml(product.category)}</span><h2>${escapeHtml(product.name)}</h2><p>${escapeHtml(product.description).replaceAll("\n", "<br>")}</p><strong class="detail-price">${formatPrice(product.price)}</strong><div class="detail-facts"><div><span>원산지</span><strong>${escapeHtml(product.origin || "-")}</strong></div><div><span>보관방법</span><strong>${escapeHtml(product.storage || "-")}</strong></div><div><span>중량·용량</span><strong>${escapeHtml(product.weight || "-")}</strong></div><div><span>소비기한</span><strong>${escapeHtml(product.shelfLife || "-")}</strong></div><div><span>박스 입수</span><strong>${escapeHtml(product.boxPack || "-")}</strong></div><div><span>상품번호</span><strong>${escapeHtml(product.id)}</strong></div></div>${product.url ? `<a class="button primary detail-link" href="${escapeHtml(product.url)}" target="_blank" rel="noopener">${escapeHtml(product.channel || "판매처")}에서 구매하기</a>` : '<button class="button secondary detail-link" disabled>구매처 준비 중</button>'}</div></div>`;
  productDialog.showModal();
}

document.addEventListener("click", (event) => {
  const viewButton = event.target.closest(".view-btn");
  if (viewButton) return setView(viewButton.dataset.view);

  const navButton = event.target.closest(".nav-item");
  if (navButton) { state.section = navButton.dataset.section; state.search = ""; return renderAdmin(); }

  const sectionButton = event.target.closest("[data-go-section]");
  if (sectionButton) { state.section = sectionButton.dataset.goSection; return renderAdmin(); }

  const productTarget = event.target.closest("[data-product]");
  if (productTarget) return openProduct(productTarget.dataset.product);

  const closeButton = event.target.closest("[data-close-dialog]");
  if (closeButton) return closeButton.closest("dialog").close();

  if (event.target.closest("[data-preview]")) return setView("public");
  if (event.target.closest("#cloneIssue")) return showToast("8월호를 기준으로 새 9월호 초안을 만들었습니다.");
  if (event.target.closest("#publishIssue")) {
    document.querySelector("#publishProductCount").textContent = `${state.products.filter((p) => p.included).length}개`;
    return publishDialog.showModal();
  }
  if (event.target.closest("#confirmPublish")) {
    state.releaseStatus = "발행";
    publishDialog.close();
    renderAdmin();
    return showToast("2026년 9월호가 링크 전용으로 발행되었습니다.");
  }
  if (event.target.closest("#newProduct")) return showToast("상품 등록 화면은 다음 단계에서 연결할 수 있습니다.");
  if (event.target.closest("#notificationButton")) return showToast("검수 대기 알림이 1건 있습니다.");

  const category = event.target.closest("[data-category]");
  if (category) { state.publicCategory = category.dataset.category; return renderPublic(); }

  const month = event.target.closest(".month-tab");
  if (month && !month.classList.contains("is-active")) return showToast("이전 발행본 탐색은 다음 단계에서 연결할 수 있습니다.");
});

document.addEventListener("change", (event) => {
  const toggle = event.target.closest("[data-toggle-product]");
  if (toggle) {
    const product = state.products.find((item) => item.id === toggle.dataset.toggleProduct);
    if (product) product.included = toggle.checked;
    renderIssues();
    showToast(`${product.name}을(를) 9월호에서 ${product.included ? "포함" : "제외"}했습니다.`);
  }
  if (event.target.id === "issueFilter") { state.filter = event.target.value; renderIssues(); }
});

document.addEventListener("input", (event) => {
  if (event.target.id === "issueSearch") { state.search = event.target.value; renderIssues(); document.querySelector("#issueSearch")?.focus(); }
  if (event.target.id === "productSearch") { state.search = event.target.value; renderProducts(); document.querySelector("#productSearch")?.focus(); }
  if (event.target.id === "publicSearch") { state.publicSearch = event.target.value; renderPublic(); document.querySelector("#publicSearch")?.focus(); }
});

document.addEventListener("keydown", (event) => {
  if ((event.key === "Enter" || event.key === " ") && event.target.matches(".product-card")) {
    event.preventDefault();
    openProduct(event.target.dataset.product);
  }
});

[productDialog, publishDialog].forEach((dialog) => {
  dialog.addEventListener("click", (event) => {
    const rect = dialog.getBoundingClientRect();
    const outside = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
    if (outside) dialog.close();
  });
});

async function init() {
  try {
    const response = await fetch("data/products.json");
    if (!response.ok) throw new Error("상품 데이터를 불러오지 못했습니다.");
    state.products = await response.json();
    document.querySelector("#productCountBadge").textContent = state.products.length;
    renderAdmin();
  } catch (error) {
    adminView.innerHTML = `<div class="placeholder-page"><div><span class="placeholder-icon">!</span><h1>상품 데이터를 불러오지 못했습니다.</h1><p>${escapeHtml(error.message)}</p></div></div>`;
  }
}

init();
