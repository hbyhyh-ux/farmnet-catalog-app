// 공용 저장소(Google Apps Script + 구글 시트) 동기화.
// config.js의 FAMNET_API가 비어 있으면 이 파일은 아무 일도 하지 않고, 앱은 브라우저 저장(localStorage)으로 동작한다.
(() => {
  const API = (window.FAMNET_API || "").trim();
  const Sync = { enabled: Boolean(API) };
  window.FamnetSync = Sync;
  if (!API) return;

  const FIELDS = ["status", "name", "project", "category", "origin", "storage", "shelfLife", "description", "weight", "boxPack", "price", "shippingFee", "saleLink", "images", "salePrice", "mdPick", "mdComment"];
  const REQUIRED_SCHEMA = 2; // 서버(Code.gs)가 MD PICK·특가 필드를 저장할 수 있는 버전
  const POLL_MS = 10000, SAVE_DELAY_MS = 400, RETRY_MS = 5000;
  let state, hooks, version = 0, synced = null, saveTimer, retryTimer, flushing = false, again = false, failed = false;
  const uploaded = new Map();

  const codeKey = "famnet-edit-code";
  const editCode = () => { try { return localStorage.getItem(codeKey) || ""; } catch { return ""; } };

  // 구글 Apps Script는 가끔(특히 한동안 쓰지 않다가 처음) 오류 페이지를 돌려주거나 수십 초 걸린다.
  // 그래서 요청마다 제한시간을 두고, 조회는 응답이 JSON이 아니거나 늦으면 몇 번 다시 시도한다.
  const TIMEOUT_MS = { GET: 12000, POST: 45000 };
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const retryable = (message) => Object.assign(new Error(message), { retryable: true });
  async function once(method, payload) {
    const options = { cache: "no-store" };
    let url = API;
    if (method === "GET") url += `${API.includes("?") ? "&" : "?"}${new URLSearchParams(payload)}`;
    else Object.assign(options, { method: "POST", body: JSON.stringify({ ...payload, code: editCode() }) }); // Content-Type을 지정하지 않아 CORS 사전요청이 생기지 않는다.
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), TIMEOUT_MS[method]);
    let text;
    try { text = await (await fetch(url, { ...options, signal: controller.signal })).text(); }
    catch { throw retryable("구글 서버에 연결하지 못했습니다. 네트워크 상태를 확인해주세요."); }
    finally { clearTimeout(timer); }
    let data;
    try { data = JSON.parse(text); } catch { throw retryable("구글 서버가 일시적으로 응답하지 않습니다. 잠시 후 다시 시도해주세요."); }
    if (!data.ok) throw Object.assign(new Error(data.error || "요청에 실패했습니다."), { code: data.error, retryable: method === "GET" && data.error !== "unauthorized" });
    return data;
  }
  async function api(method, payload, attempts = method === "GET" ? 4 : 1) {
    for (let attempt = 1; ; attempt++) {
      try { return await once(method, payload); }
      catch (error) { if (!error.retryable || attempt >= attempts) throw error; Sync.onRetry?.(attempt); await sleep(800 * attempt); }
    }
  }

  const fieldsOf = (product) => { const fields = {}; FIELDS.forEach((key) => { fields[key] = key === "images" ? [...(product.images || [])] : product[key] ?? ""; }); return fields; };
  const slimIssue = (issue) => ({ id: issue.id, year: issue.year, month: issue.month, publishedAt: issue.publishedAt, products: issue.products.map((p) => ({ uid: p.uid, ...fieldsOf(p) })) });
  const takeSnapshot = () => ({
    products: new Map(state.products.map((p) => [p.uid, JSON.stringify(fieldsOf(p))])),
    order: state.products.map((p) => p.uid).join("\n"),
    issues: new Map(state.issues.map((issue) => [issue.id, JSON.stringify(slimIssue(issue))])),
    columns: JSON.stringify(state.columns), widths: JSON.stringify(state.widths)
  });

  // 마지막으로 서버와 맞춘 상태와 지금 화면 상태를 비교해 바뀐 부분만 보낸다. (항목 단위라 서로 다른 곳을 동시에 고쳐도 덮어쓰지 않는다)
  function diff() {
    const next = takeSnapshot(), ops = [];
    state.products.forEach((product) => {
      const now = next.products.get(product.uid), before = synced.products.get(product.uid);
      if (!before) return ops.push({ type: "add", uid: product.uid, fields: fieldsOf(product) });
      if (now === before) return;
      const a = JSON.parse(now), b = JSON.parse(before), fields = {};
      FIELDS.forEach((key) => { if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) fields[key] = a[key]; });
      ops.push({ type: "patch", uid: product.uid, fields });
    });
    if (next.order !== synced.order) ops.push({ type: "order", uids: state.products.map((p) => p.uid) });
    state.issues.forEach((issue) => { if (next.issues.get(issue.id) !== synced.issues.get(issue.id)) ops.push({ type: "publish", issue: slimIssue(issue) }); });
    if (next.columns !== synced.columns) ops.push({ type: "setting", key: "columns", value: state.columns });
    if (next.widths !== synced.widths) ops.push({ type: "setting", key: "widths", value: state.widths });
    return { ops, next };
  }
  const dirty = () => Boolean(saveTimer) || flushing || failed || diff().ops.length > 0;

  async function upload(uid, dataUrl) {
    if (!uploaded.has(dataUrl)) uploaded.set(dataUrl, (await api("POST", { action: "image", uid, dataUrl })).url);
    return uploaded.get(dataUrl);
  }
  // 새로 올린 사진(data:)은 드라이브에 저장하고 주소로 바꿔서 시트에는 주소만 남긴다.
  async function uploadPendingImages() {
    for (const product of [...state.products, ...state.issues.flatMap((issue) => issue.products)]) {
      const image = product.images?.[0];
      if (typeof image === "string" && image.startsWith("data:")) { const url = await upload(product.uid, image); if (product.images?.[0] === image) product.images = [url]; }
    }
  }

  function setStatus(kind) {
    const el = document.querySelector("#syncStatus"); if (!el) return;
    // 서버가 오래된 버전이면 MD PICK·특가가 저장되지 않으므로, 다른 상태보다 우선해서 계속 알린다.
    if (Sync.outdated && kind !== "error") kind = "outdated";
    el.dataset.state = kind; el.textContent = { saving: "저장 중…", saved: "✓ 공유됨", error: "⚠ 저장 실패 · 재시도 중", outdated: "⚠ 서버 업데이트 필요 (MD PICK·특가 저장 불가)", "": "" }[kind];
  }

  function scheduleSave() { setStatus("saving"); clearTimeout(saveTimer); saveTimer = setTimeout(() => { saveTimer = null; flush(); }, SAVE_DELAY_MS); }
  async function flush() {
    if (flushing) { again = true; return; }
    flushing = true; clearTimeout(retryTimer);
    let retryNow = false;
    try {
      do {
        again = false;
        await uploadPendingImages();
        const { ops, next } = diff(); if (!ops.length) break;
        const result = await api("POST", { ops });
        synced = next; failed = false;
        if (result.prevVersion === version) version = result.version; // 그 사이 다른 사람이 저장했다면 버전을 그대로 둬서 곧 새로 불러온다
      } while (again);
      failed = false; setStatus("saved"); setTimeout(poll, 300);
    } catch (error) {
      failed = true; setStatus("error");
      if (error.code === "unauthorized") { const code = prompt("편집 코드를 입력해주세요."); if (code) { localStorage.setItem(codeKey, code); retryNow = true; } }
      if (!retryNow) retryTimer = setTimeout(flush, RETRY_MS);
    } finally { flushing = false; }
    if (retryNow) flush();
  }

  function apply(data) {
    state.products = hooks.sort(data.products.map((p) => hooks.normalize(p)));
    state.issues = data.issues.map((issue) => ({ ...issue, products: issue.products.map((p) => hooks.normalize(p)) }));
    state.columns = hooks.mergeColumns(data.settings.columns || []);
    state.widths = data.settings.widths || {};
    const known = new Set(state.products.map((p) => p.uid)); [...state.selected].forEach((uid) => { if (!known.has(uid)) state.selected.delete(uid); });
    version = data.version; synced = takeSnapshot();
    Sync.outdated = (data.schema || 1) < REQUIRED_SCHEMA; if (Sync.outdated) setStatus("saved");
  }

  async function poll() {
    if (document.hidden || dirty()) return;
    try {
      if ((await api("GET", { action: "version" }, 1)).version === version || !hooks.canRefresh()) return;
      const data = await api("GET", { action: "load" }, 1);
      if (dirty() || !hooks.canRefresh()) return;
      apply(data); hooks.render();
    } catch { /* 일시적인 네트워크 오류는 다음 주기에 다시 시도한다 */ }
  }

  Sync.attach = (appState, appHooks) => { state = appState; hooks = appHooks; };
  Sync.save = scheduleSave;
  Sync.load = async () => {
    let data = await api("GET", { action: "load" });
    if (!data.products.length) {
      const seed = hooks.seed(); // 시트가 비어 있으면 기본 상품 목록으로 채운다 (서버가 이미 채워졌으면 무시한다)
      if (seed.length) { await api("POST", { ops: [{ type: "seed", products: seed.map((p) => ({ uid: p.uid, fields: fieldsOf(p) })) }] }); data = await api("GET", { action: "load" }); }
    }
    apply(data);
    setInterval(poll, POLL_MS); document.addEventListener("visibilitychange", () => { if (!document.hidden) poll(); });
    window.addEventListener("beforeunload", (event) => { if (dirty()) { event.preventDefault(); event.returnValue = ""; } });
    setStatus("saved");
  };
  Sync.loadIssue = async (id) => {
    let data = null;
    try { data = await Promise.race([window.__catalogPromise, sleep(12000).then(() => null)]); } catch { /* 미리 시작한 요청이 실패하거나 늦으면 아래에서 다시 시도한다 */ }
    if (!data?.ok) data = await api("GET", { action: "issue", id });
    return data.issue ? { ...data.issue, products: data.issue.products.map((p) => hooks.normalize(p)) } : null;
  };
})();
