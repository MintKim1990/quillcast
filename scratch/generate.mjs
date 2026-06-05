// scratch/generate.mjs
// 품질 랩: 샘플(자막 + 제목 + 채널) × 포맷 → Gemini → 출력 비교
//
// 실행: node scratch/generate.mjs <sample> <format>
//   sample: scratch/samples/<sample>.json 의 파일명 (기본 elon-snowball)
//   format: newsletter | blog | tweets | description | all (기본 all)
// 예: node scratch/generate.mjs elon-snowball all
//     node scratch/generate.mjs messy-vlog newsletter

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const readLocal = (p) => readFileSync(join(here, p), "utf8");

const KEY = readLocal("key.local.txt").trim();
if (!KEY || KEY.includes("PASTE_YOUR_KEY")) {
  console.error("❌ scratch/key.local.txt 에 키를 넣어주세요.");
  process.exit(1);
}

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const sampleName = process.argv[2] || "elon-snowball";
const format = process.argv[3] || "all";

const sample = JSON.parse(readLocal(`samples/${sampleName}.json`));
const transcript = readLocal(`samples/${sample.transcriptFile}`).trim();

// ── 개선 1: 영상 제목/채널을 맥락으로 주입 ────────────────────────────
const CTX = `이 글의 원본은 유튜브 영상이다.
- 채널: ${sample.channel || "(불명)"}
- 제목: ${sample.title || "(불명)"}
제목과 채널을 화자·주제 파악의 맥락으로 활용하라. 단, 자막에 없는 사실을 지어내지 말 것.`;

// ── 개선 3: 공허한 클리셰 금지 + 통찰 중심 재구성 룰 ─────────────────
const RULES = `규칙:
- 공허한 자기계발 클리셰 금지 ("깊은 울림", "용기를 준다", "마음을 사로잡다", "다시 일어설 힘" 류).
- 자막을 그대로 요약·나열하지 말고, 독자가 가져갈 핵심 통찰 중심으로 재구성.
- 자막에 등장하는 구체적 사실·숫자·고유명사·인용을 우선 활용.
- 자막이 자동생성(구어체·문장부호 없음)이어도 매끄러운 글로 다듬어라.
- 한국어로, 군더더기 없이.`;

// ── 개선 4: 포맷 4종 ─────────────────────────────────────────────────
const FORMATS = {
  newsletter: `${CTX}

당신은 노련한 뉴스레터 작가다. 아래 자막으로 뉴스레터 1편을 써라.
구성: ① 제목 한 줄(호기심 유발, 낚시성 금지) ② 도입 훅 2문장 ③ 핵심 인사이트 3개(각 소제목 + 2~3문장, 구체적으로) ④ 짧은 마무리 한 줄.
${RULES}`,

  blog: `${CTX}

당신은 블로그 작가다. 아래 자막으로 블로그 글 1편을 써라.
구성: ① 제목 ② 도입부 ③ 본문(H2 소제목 3~4개, 각 단락) ④ 결론. 마크다운 사용.
${RULES}`,

  tweets: `${CTX}

당신은 X(트위터) 카피라이터다. 아래 자막으로 트윗 스레드를 써라.
구성: 5~7개 트윗. 1번은 스크롤을 멈추게 하는 강력한 훅. 각 트윗 280자 이내, "1/" 식 번호, 각각 독립적으로 읽혀야.
${RULES}`,

  description: `${CTX}

당신은 유튜브 채널 운영자다. 아래 자막으로 영상 설명란을 써라.
구성: ① 2~3문장 요약 ② 핵심 포인트 불릿 3~5개 ③ 관련 해시태그 5개.
${RULES}`,
};

async function gen(fmt) {
  const prompt = `${FORMATS[fmt]}\n\n[영상 자막]\n${transcript}`;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    }
  );
  const data = await res.json();
  if (!res.ok)
    return `❌ ${fmt} 오류 (HTTP ${res.status}): ${data?.error?.message || ""}`;
  return (
    data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ||
    "(빈 응답 — safety 차단 가능)"
  );
}

const fmts =
  format === "all"
    ? ["newsletter", "blog", "tweets", "description"]
    : [format];

console.log(
  `샘플: ${sampleName} | 제목: ${sample.title} | 자막 ${transcript.length}자 | 모델 ${MODEL}`
);
for (const f of fmts) {
  console.log(`\n${"=".repeat(22)} ${f.toUpperCase()} ${"=".repeat(22)}\n`);
  console.log(await gen(f));
}
