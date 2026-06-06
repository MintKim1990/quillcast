// scratch/test-api.mjs
// 배포 전 로컬 스모크 테스트: api/generate.js 핸들러를 mock req/res로 직접 호출.
// 검증 항목: ESM 파싱 / 프롬프트 빌드 / 실제 Gemini 호출 / 응답 형태.
// 실행: node scratch/test-api.mjs [newsletter|blog]

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
process.env.GEMINI_API_KEY = readFileSync(
  join(here, "key.local.txt"),
  "utf8"
).trim();

const { default: handler } = await import("../api/generate.js");

const transcript = readFileSync(
  join(here, "sample-transcript.txt"),
  "utf8"
).trim();
const format = process.argv[2] || "newsletter";

// mock req/res
const req = {
  method: "POST",
  body: { transcript, title: "테스트 영상", channel: "테스트 채널", format },
};
let statusCode = 200;
const res = {
  setHeader() {},
  status(c) {
    statusCode = c;
    return this;
  },
  json(obj) {
    console.log(`\n[HTTP ${statusCode}]`);
    if (obj.ok) {
      console.log(`✅ ok (model: ${obj.model}) — ${obj.text.length}자\n`);
      console.log(obj.text);
    } else {
      console.log("❌ " + obj.error);
    }
    return this;
  },
  end() {
    console.log(`[HTTP ${statusCode}] (no body)`);
    return this;
  },
};

console.log(`포맷: ${format} | 자막 ${transcript.length}자 → 서버 함수 호출…`);
await handler(req, res);
