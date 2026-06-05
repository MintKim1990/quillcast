// scratch/test-gemini.mjs
// P1.1 품질 검증 스파이크: 자막 → Gemini Flash → 뉴스레터 초안
//
// 목적: serverless 인프라를 깔기 전에 "Gemini Flash가 자막을 쓸만한 글로 바꾸나?"부터 확인.
// 키는 scratch/key.local.txt 에서 읽음 (gitignore됨 → 깃/채팅에 안 올라감).
// 실행: node scratch/test-gemini.mjs
// 모델 바꾸기: GEMINI_MODEL=gemini-2.5-flash node scratch/test-gemini.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const readLocal = (name) => readFileSync(join(here, name), "utf8").trim();

const KEY = readLocal("key.local.txt");
if (!KEY || KEY.includes("PASTE_YOUR_KEY")) {
  console.error("❌ scratch/key.local.txt 에 Gemini API 키를 먼저 넣어주세요.");
  process.exit(1);
}

const transcript = readLocal("sample-transcript.txt");
// gemini-2.0-flash 는 무료 티어 quota 0 → 2.5-flash 사용 (무료 quota 있음, 2026-06-05 실측)
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

const prompt = `당신은 노련한 뉴스레터 작가입니다. 아래는 유튜브 영상의 자막입니다.
이 내용을 바탕으로 구독자에게 보낼 한국어 뉴스레터 초안을 작성하세요.

형식:
- 제목 (열어보고 싶게 만드는 한 줄)
- 짧은 도입 훅 (2~3문장)
- 핵심 내용 3~5개 (각각 소제목 + 2~4문장 설명)
- 마무리 한마디

원문 화자의 메시지와 톤은 살리되, 자막 특유의 끊김을 매끄러운 글로 재구성하세요.

[영상 자막]
${transcript}`;

const base = "https://generativelanguage.googleapis.com/v1beta";

async function listFlashModels() {
  try {
    const r = await fetch(`${base}/models?key=${KEY}`);
    const j = await r.json();
    return (j.models || [])
      .map((m) => m.name)
      .filter((n) => /flash/i.test(n));
  } catch {
    return [];
  }
}

try {
  const res = await fetch(`${base}/models/${MODEL}:generateContent?key=${KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  const data = await res.json();

  if (!res.ok) {
    const msg = data?.error?.message || JSON.stringify(data);
    console.error(`❌ Gemini API 오류 (HTTP ${res.status}, 모델 ${MODEL}): ${msg}`);
    if (res.status === 404 || /not found|not supported/i.test(msg)) {
      const names = await listFlashModels();
      console.error("\n→ 이 키로 쓸 수 있는 flash 모델:");
      console.error(names.length ? names.join("\n") : "(목록 못 가져옴)");
      console.error("\n맞는 모델로 다시 실행:\n  GEMINI_MODEL=<모델명> node scratch/test-gemini.mjs");
    }
    process.exit(1);
  }

  const text =
    data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ||
    "(응답이 비어 있음 — safety 차단이나 다른 이슈일 수 있음)";

  console.log(`===== 입력 자막 ${transcript.length}자 / 모델 ${MODEL} =====\n`);
  console.log("===== 생성된 뉴스레터 초안 =====\n");
  console.log(text);
} catch (e) {
  console.error("❌ 실행 오류:", e.message);
  process.exit(1);
}
