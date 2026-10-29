// 내 카드 찾기 프로토타입 (바닐라 JS, 라우팅은 history API). 입력값은 서버에 저장하지 않고 이 탭 메모리에만 둔다.
let CARDS = [];
let CATEGORIES = [];
const $app = document.getElementById("app");
const won = (n) => `${Math.round(n).toLocaleString("ko-KR")}원`;
const signed = (n) => `${n >= 0 ? "+" : "−"}${won(Math.abs(n))}`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const cardById = (id) => CARDS.find((c) => c.id === id);

const form = { status: "", age: "", type: "상관없음", feeCap: "", spend: {}, sentence: "", currentId: "" };
let compareIds = [];

// F4 계산: 예상 월 혜택과 분야별 내역
function evaluate(card, spend) {
  const total = Object.values(spend).reduce((s, v) => s + v, 0);
  if (total < card.minSpend) return { monthly: 0, yearly: -card.annualFee, parts: [], short: true };
  const parts = card.benefits
    .map((b) => ({ category: b.category, amount: Math.min(Math.floor((spend[b.category] || 0) * b.rate / 100), b.cap) }))
    .filter((p) => p.amount > 0);
  const monthly = parts.reduce((s, p) => s + p.amount, 0);
  return { monthly, yearly: monthly * 12 - card.annualFee, parts, short: false };
}
function recommend() {
  const age = parseInt(form.age, 10);
  const feeCap = form.feeCap === "" ? Infinity : parseInt(form.feeCap, 10);
  const wantType = { "신용카드": "신용", "체크카드": "체크" }[form.type];
  return CARDS
    .filter((c) => (c.target === "전체" || c.target === form.status) && age >= c.minAge && (!wantType || c.type === wantType) && c.annualFee <= feeCap)
    .map((c) => ({ card: c, ...evaluate(c, form.spend) }))
    .sort((a, b) => b.yearly - a.yearly || a.card.annualFee - b.card.annualFee)
    .slice(0, 3);
}

function go(path) { history.pushState({}, "", path); render(); }
document.addEventListener("click", (e) => {
  const a = e.target.closest("a[data-link]");
  if (a) { e.preventDefault(); go(a.getAttribute("href")); }
});
window.addEventListener("popstate", render);

function viewHome() {
  return `<h1>내 카드 찾기</h1>
    <p>신분과 한 달 지출을 넣으면, 카드마다 <b>내가 실제로 받을 혜택 금액</b>을 계산해 맞는 카드를 추천해요.</p>
    <p>지금 쓰는 카드를 넣으면 <b>바꾸면 1년에 얼마 더 받는지</b>도 알려 드려요.</p>
    <div class="box"><button onclick="go('/find')">내 카드 찾기</button></div>
    <div class="box"><button class="sub" onclick="go('/cards')">전체 카드 보기</button></div>
    <div class="todo">프로토타입: 카드 데이터는 실제 상품이 아닌 샘플 10장이에요(출처 미수집).</div>`;
}

function viewFind() {
  const opt = (list, v) => list.map((x) => `<option ${v === x ? "selected" : ""}>${x}</option>`).join("");
  const cur = form.currentId ? cardById(form.currentId) : null;
  return `<h1>내 정보와 지출</h1>
    <div class="box">
      <label>신분</label><select id="status"><option value="">선택</option>${opt(["대학생", "군인", "직장인", "기타"], form.status)}</select>
      <label>나이</label><input id="age" type="number" min="1" value="${esc(form.age)}">
      <label>카드 종류</label><select id="type">${opt(["상관없음", "신용카드", "체크카드"], form.type)}</select>
      <label>연회비 상한(원, 비우면 제한 없음)</label><input id="feeCap" type="number" min="0" value="${esc(form.feeCap)}">
    </div>
    <div class="box">
      <label>문장으로 입력</label><input id="sentence" placeholder="예: 배달음식에 한 달 20만 원, 지하철 6만 원" value="${esc(form.sentence)}">
      <div style="margin-top:8px"><button class="sub" id="ai">AI로 채우기</button></div>
      <div id="aiMsg"></div>
      <div class="todo">AI 미연결: 지금은 키워드와 금액 패턴으로 임시 추출해요.</div>
      ${CATEGORIES.map((c) => `<label>${c}</label><input type="number" min="0" data-spend="${c}" value="${form.spend[c] || ""}">`).join("")}
    </div>
    <div class="box">
      <label>지금 쓰는 카드 (선택)</label>
      ${cur ? `<div class="row"><b>${esc(cur.name)}</b><button class="sub" style="flex:0" id="clearCur">빼기</button></div>`
            : `<input id="curQ" placeholder="카드 이름 일부"><div id="curList"></div>`}
    </div>
    <div id="err"></div>
    <button id="go">추천 받기</button>`;
}
function bindFind() {
  const bind = (id, key) => { const el = document.getElementById(id); el.oninput = el.onchange = () => (form[key] = el.value); };
  bind("status", "status"); bind("age", "age"); bind("type", "type"); bind("feeCap", "feeCap"); bind("sentence", "sentence");
  document.querySelectorAll("[data-spend]").forEach((el) => (el.oninput = () => (form.spend[el.dataset.spend] = Math.max(0, parseInt(el.value, 10) || 0))));
  document.getElementById("ai").onclick = async () => {
    const msg = document.getElementById("aiMsg");
    if (!form.sentence.trim()) { msg.innerHTML = `<p class="err">소비 내용을 적어 주세요</p>`; return; }
    msg.innerHTML = `<p class="muted">분석 중…</p>`;
    try {
      const r = await fetch("/api/parse-spending", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: form.sentence }), signal: AbortSignal.timeout(20000) });
      const data = await r.json();
      if (!r.ok) throw new Error();
      for (const [c, v] of Object.entries(data.spending)) if (v > 0) form.spend[c] = v;
      render();
    } catch { msg.innerHTML = `<p class="err">자동 채우기에 실패했어요. 직접 입력해 주세요</p>`; }
  };
  const curQ = document.getElementById("curQ");
  if (curQ) curQ.oninput = () => {
    const t = curQ.value.trim();
    const found = t ? CARDS.filter((c) => c.name.includes(t)) : [];
    document.getElementById("curList").innerHTML = !t ? "" : found.length
      ? found.map((c) => `<div class="box" style="cursor:pointer" data-cur="${c.id}">${esc(c.name)} <span class="muted">${esc(c.issuer)}</span></div>`).join("")
      : `<p class="muted">찾는 카드가 없어요</p>`;
    document.querySelectorAll("[data-cur]").forEach((el) => (el.onclick = () => { form.currentId = el.dataset.cur; render(); }));
  };
  const clr = document.getElementById("clearCur");
  if (clr) clr.onclick = () => { form.currentId = ""; render(); };
  document.getElementById("go").onclick = () => {
    const err = document.getElementById("err");
    if (!form.status) { err.innerHTML = `<p class="err">신분을 골라 주세요</p>`; return; }
    if (!(parseInt(form.age, 10) > 0)) { err.innerHTML = `<p class="err">나이를 입력해 주세요</p>`; return; }
    if (!Object.values(form.spend).some((v) => v > 0)) { err.innerHTML = `<p class="err">지출 금액을 하나 이상 입력해 주세요</p>`; return; }
    compareIds = [];
    go("/result");
  };
}

function viewResult() {
  if (!Object.values(form.spend).some((v) => v > 0)) return `<p>먼저 정보를 입력해 주세요.</p><button onclick="go('/find')">다시 입력하기</button>`;
  const rows = recommend();
  const cur = form.currentId ? { card: cardById(form.currentId), ...evaluate(cardById(form.currentId), form.spend) } : null;
  let head = "";
  if (cur && rows.length) {
    const gain = rows[0].yearly - cur.yearly;
    head = `<div class="box win">
      <div class="muted">지금 카드: ${esc(cur.card.name)} · 연간 순혜택 ${won(cur.yearly)}${cur.short ? " (실적 미달)" : ""}</div>
      <div class="big">${gain > 0 ? `1위 카드로 바꾸면 연 ${won(gain)} 더` : "지금 카드가 가장 잘 맞아요. 바꾸지 않아도 돼요"}</div></div>`;
  }
  const list = rows.map((r, i) => {
    const isCur = cur && r.card.id === cur.card.id;
    return `<div class="box ${i === 0 ? "win" : ""}">
      <div><b>${i + 1}위</b> <a href="/cards/${r.card.id}" data-link><b>${esc(r.card.name)}</b></a> <span class="muted">${esc(r.card.issuer)} · ${r.card.type}</span>
        ${isCur ? '<span class="tag">지금 쓰는 카드</span>' : ""}</div>
      <div>예상 월 혜택 <b>${won(r.monthly)}</b> · 연간 순혜택 <b>${won(r.yearly)}</b> · 연회비 ${won(r.card.annualFee)}</div>
      ${r.short ? '<span class="tag off">실적 미달</span>' : `<div class="muted">${r.parts.map((p) => `${p.category}에서 월 ${won(p.amount)}`).join(" · ")}</div>`}
      ${cur ? `<div>지금보다 연 <b>${isCur ? won(0) : signed(r.yearly - cur.yearly)}</b></div>` : ""}
      <div style="margin-top:8px"><button class="sub" data-cmp="${r.card.id}">${compareIds.includes(r.card.id) ? "담김" : "비교 담기"}</button></div>
    </div>`;
  }).join("");
  return `<h1>추천 결과</h1>${head}
    ${rows.length ? list : `<p class="err">조건에 맞는 카드가 없어요. 연회비 상한이나 카드 종류를 바꿔 보세요</p>`}
    <div id="cmpMsg"></div>
    <div class="row"><button class="sub" onclick="go('/find')">다시 입력하기</button><button id="doCmp" ${compareIds.length < 2 ? "disabled" : ""}>비교하기 (${compareIds.length})</button></div>`;
}
function bindResult() {
  document.querySelectorAll("[data-cmp]").forEach((b) => (b.onclick = () => {
    const id = b.dataset.cmp;
    if (compareIds.includes(id)) return;
    if (compareIds.length >= 3) { document.getElementById("cmpMsg").innerHTML = `<p class="err">최대 3장까지 비교할 수 있어요</p>`; return; }
    compareIds.push(id); render();
  }));
  const d = document.getElementById("doCmp");
  if (d) d.onclick = () => go("/compare");
}

function viewCompare() {
  const rows = compareIds.map((id) => ({ card: cardById(id), ...evaluate(cardById(id), form.spend) }));
  if (rows.length < 2) return `<p>비교할 카드를 2장 이상 담아 주세요.</p><button onclick="go('/result')">추천 결과로</button>`;
  const line = (label, f) => `<tr><th>${label}</th>${rows.map((r) => `<td>${f(r)}</td>`).join("")}</tr>`;
  return `<h1>카드 비교</h1><div class="box" style="overflow-x:auto"><table>
    ${line("카드", (r) => esc(r.card.name))}
    ${line("연회비", (r) => won(r.card.annualFee))}
    ${line("전월실적", (r) => won(r.card.minSpend))}
    ${line("예상 월 혜택", (r) => won(r.monthly))}
    ${line("연간 순혜택", (r) => won(r.yearly))}
    ${CATEGORIES.map((c) => line(c, (r) => won((r.parts.find((p) => p.category === c) || { amount: 0 }).amount))).join("")}
    </table></div><button class="sub" onclick="go('/result')">추천 결과로</button>`;
}

let listFilter = { type: "", target: "" };
function viewCards() {
  const sel = (id, list, v) => `<select id="${id}"><option value="">전체</option>${list.map((x) => `<option ${v === x ? "selected" : ""}>${x}</option>`).join("")}</select>`;
  const shown = CARDS.filter((c) => (!listFilter.type || c.type === listFilter.type) && (!listFilter.target || c.target === listFilter.target));
  return `<p><a href="/" data-link>← 처음으로</a></p><h1>전체 카드</h1>
    <div class="row"><div><label>카드 종류</label>${sel("fType", ["신용", "체크"], listFilter.type)}</div>
      <div><label>가입 대상</label>${sel("fTarget", ["대학생", "군인"], listFilter.target)}</div></div>
    ${shown.map((c) => `<div class="box"><a href="/cards/${c.id}" data-link><b>${esc(c.name)}</b></a> <span class="muted">${esc(c.issuer)} · ${c.type}</span>
      <div class="muted">연회비 ${won(c.annualFee)} · 가입 대상 ${c.target === "전체" ? "전체" : c.target + " 전용"}</div></div>`).join("")}`;
}
function bindCards() {
  document.getElementById("fType").onchange = (e) => { listFilter.type = e.target.value; render(); };
  document.getElementById("fTarget").onchange = (e) => { listFilter.target = e.target.value; render(); };
}

function viewCard(id) {
  const c = cardById(id);
  return `<p><a href="#" onclick="history.back();return false">← 뒤로</a></p><h1>${esc(c.name)}</h1>
    <div class="box"><table><tr><th>분야</th><th>할인율</th><th>월 한도</th></tr>
      ${c.benefits.map((b) => `<tr><td>${b.category}</td><td>${b.rate}%</td><td>${won(b.cap)}</td></tr>`).join("")}</table>
      <p>전월실적 ${won(c.minSpend)} · 연회비 ${won(c.annualFee)} · 가입 대상 ${c.target === "전체" ? "전체" : c.target + " 전용"} · ${c.minAge}세 이상</p>
      ${c.sourceUrl ? `<p><a href="${esc(c.sourceUrl)}" target="_blank" rel="noopener">출처</a> · ${c.checkedAt} 기준</p>` : `<div class="todo">샘플 카드: 출처·확인일 미수집</div>`}</div>`;
}

function render() {
  const p = location.pathname;
  window.scrollTo(0, 0);
  if (p === "/") $app.innerHTML = viewHome();
  else if (p === "/find") { $app.innerHTML = viewFind(); bindFind(); }
  else if (p === "/result") { $app.innerHTML = viewResult(); bindResult(); }
  else if (p === "/compare") $app.innerHTML = viewCompare();
  else if (p === "/cards") { $app.innerHTML = viewCards(); bindCards(); }
  else if (p.startsWith("/cards/")) $app.innerHTML = viewCard(p.split("/")[2]);
}

(async () => {
  [CARDS, CATEGORIES] = await Promise.all([fetch("/api/cards").then((r) => r.json()), fetch("/api/categories").then((r) => r.json())]);
  render();
})();
