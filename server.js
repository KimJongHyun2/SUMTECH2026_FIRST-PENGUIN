// 프로토타입 서버: 의존성 없는 Node http 서버.
// TODO(미구현): DB 시드(F1) — 지금은 data/cards.json을 메모리에 읽어 씀.
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const cards = JSON.parse(fs.readFileSync(path.join(__dirname, "data/cards.json"), "utf8"));
const CATEGORIES = ["식비·카페", "대중교통", "편의점", "온라인쇼핑", "통신비", "구독서비스", "기타"];

// TODO(미구현): AI Gateway 연결(F3). 지금은 "분야 키워드 + 금액" 패턴으로 임시 추출.
const KEYWORDS = {
  "식비·카페": ["배달", "음식", "식비", "카페", "커피", "밥", "외식"],
  "대중교통": ["지하철", "버스", "교통"],
  "편의점": ["편의점", "gs25", "cu"],
  "온라인쇼핑": ["쇼핑", "쿠팡", "무신사"],
  "통신비": ["통신", "핸드폰", "휴대폰"],
  "구독서비스": ["넷플릭스", "유튜브", "멜론", "구독", "티빙"],
};
function parseSpending(text) {
  const result = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
  for (const part of text.split(/[,，\n]/)) {
    const m = part.match(/(\d+(?:\.\d+)?)\s*(만)?\s*원?/);
    const cat = Object.keys(KEYWORDS).find((c) => KEYWORDS[c].some((w) => part.toLowerCase().includes(w)));
    if (cat && m) result[cat] += Math.round(parseFloat(m[1]) * (m[2] ? 10000 : 1));
  }
  return result;
}

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

http.createServer((req, res) => {
  const p = new URL(req.url, "http://x").pathname;
  if (p === "/__health") return send(res, 200, { ok: true, releaseId: process.env.RELEASE_ID || "dev" });
  if (p === "/api/cards") return send(res, 200, cards);
  if (p === "/api/categories") return send(res, 200, CATEGORIES);
  if (p === "/api/parse-spending" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const text = (JSON.parse(body || "{}").text || "").trim();
      if (!text) return send(res, 400, { error: "소비 내용을 적어 주세요" });
      const spending = parseSpending(text);
      if (Object.values(spending).every((v) => v === 0)) return send(res, 422, { error: "자동 채우기에 실패했어요. 직접 입력해 주세요" });
      send(res, 200, { spending, mode: "keyword-temporary" });
    });
    return;
  }
  if (p === "/app.js") return send(res, 200, fs.readFileSync(path.join(__dirname, "public/app.js")), "text/javascript; charset=utf-8");
  const cardMatch = p.match(/^\/cards\/([\w-]+)$/);
  if (["/", "/find", "/result", "/compare", "/cards"].includes(p) || (cardMatch && cards.some((c) => c.id === cardMatch[1])))
    return send(res, 200, fs.readFileSync(path.join(__dirname, "public/index.html")), "text/html; charset=utf-8");
  send(res, 404, "<h1>404</h1><p>없는 페이지예요. <a href='/'>처음으로</a></p>", "text/html; charset=utf-8");
}).listen(PORT, () => console.log(`http://localhost:${PORT}`));
