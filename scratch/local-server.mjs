// scratch/local-server.mjs
// 로컬 테스트용 미니 서버 — Vercel 로그인/배포 없이 api/generate.js 핸들러를
// localhost:3000 에서 그대로 돌린다. 익스텐션 e2e 테스트용.
// (진짜 인터넷 배포는 나중에 vercel로 — 핸들러 코드는 동일해서 그대로 옮겨감)
// 실행: node scratch/local-server.mjs   (끄려면 Ctrl+C)

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

// 키 로드: .env 우선, 없으면 scratch/key.local.txt
function loadKey() {
  try {
    const env = readFileSync(join(here, "..", ".env"), "utf8");
    const m = env.match(/OPENAI_API_KEY\s*=\s*(.+)/);
    if (m) return m[1].trim();
  } catch {}
  return readFileSync(join(here, "key.local.txt"), "utf8").trim();
}
process.env.OPENAI_API_KEY = loadKey();

const { default: handler } = await import("../api/generate.js");
const PORT = 3000;

createServer((req, res) => {
  if (!req.url.startsWith("/api/generate")) {
    res.statusCode = 404;
    res.end("not found");
    return;
  }
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", async () => {
    req.body = raw ? safeParse(raw) : {};
    shimRes(res); // Vercel 호환 res.status()/res.json() 추가
    try {
      await handler(req, res);
    } catch (e) {
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end(JSON.stringify({ ok: false, error: String(e?.message || e) }));
      }
    }
  });
}).listen(PORT, () => {
  console.log(`✅ 로컬 서버 켜짐: http://localhost:${PORT}/api/generate`);
  console.log(`   키 ${process.env.OPENAI_API_KEY.length}자 로드 / 모델 ${process.env.OPENAI_MODEL || "gpt-4o-mini"}`);
  console.log(`   크롬에서 테스트하세요. 끄려면 Ctrl+C.`);
});

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
function shimRes(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (obj) => {
    if (!res.getHeader("Content-Type"))
      res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(obj));
    return res;
  };
}
