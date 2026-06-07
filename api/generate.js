// api/generate.js — Vercel 서버리스 함수
// 익스텐션이 보낸 (자막 + 영상 메타 + 포맷) → LLM → 생성된 텍스트 반환.
// ★ OPENAI_API_KEY는 서버 환경변수에만 존재한다 — 클라이언트(익스텐션)에 절대 노출 X.
//   프롬프트는 scratch/generate.mjs(P1.1b 품질 검증 완료)에서 그대로 가져왔다.
//   모델 교체: OPENAI_MODEL 환경변수로 한 줄에 변경 (gpt-4o-mini → gpt-5-mini 등).

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const MAX_TRANSCRIPT = 40000; // 자막 글자수 상한 (비용/남용 방지). 초과분은 잘라서 처리.

// ── 클리셰 금지 + 통찰 중심 재구성 룰 (P1.1b 튜닝) ─────────────────────
// 출력 언어 지시 (익스텐션 드롭다운 lang 값 → 프롬프트 지시문)
const LANGS = {
  auto: "출력은 영상 자막과 동일한 언어로 작성하라.",
  ko: "출력은 반드시 한국어로 작성하라.",
  en: "Write the output in English.",
  ja: "出力は必ず日本語で書きなさい。",
  es: "Escribe el resultado en español.",
  zh: "请务必用中文撰写输出内容。",
};

function buildRules(lang) {
  const langLine = LANGS[lang] || LANGS.auto;
  return `규칙:
- 공허한 자기계발 클리셰 금지 ("깊은 울림", "용기를 준다", "마음을 사로잡다", "다시 일어설 힘" 류).
- 자막을 그대로 요약·나열하지 말고, 독자가 가져갈 핵심 통찰 중심으로 재구성.
- 자막에 등장하는 구체적 사실·숫자·고유명사·인용을 우선 활용.
- 자막이 자동생성(구어체·문장부호 없음)이어도 매끄러운 글로 다듬어라.
- ${langLine}
- 군더더기 없이.`;
}

// ── 영상 제목/채널을 화자·주제 파악 맥락으로 주입 (P1.1b 개선 1) ───────
function buildCtx(title, channel) {
  return `이 글의 원본은 유튜브 영상이다.
- 채널: ${channel || "(불명)"}
- 제목: ${title || "(불명)"}
제목과 채널을 화자·주제 파악의 맥락으로 활용하라. 단, 자막에 없는 사실을 지어내지 말 것.`;
}

// ── 포맷 4종 (P1.1b 검증: 뉴스레터·블로그 강 / 트윗·설명란 viable) ─────
const FORMATS = {
  newsletter: (ctx, rules) => `${ctx}

당신은 노련한 뉴스레터 작가다. 아래 자막으로 뉴스레터 1편을 써라.
구성: ① 제목 한 줄(호기심 유발, 낚시성 금지) ② 도입 훅 2문장 ③ 핵심 인사이트 3개(각 소제목 + 2~3문장, 구체적으로) ④ 짧은 마무리 한 줄.
${rules}`,

  blog: (ctx, rules) => `${ctx}

당신은 블로그 작가다. 아래 자막으로 블로그 글 1편을 써라.
구성: ① 제목 ② 도입부 ③ 본문(H2 소제목 3~4개, 각 단락) ④ 결론. 마크다운 사용.
${rules}`,

  tweets: (ctx, rules) => `${ctx}

당신은 X(트위터) 카피라이터다. 아래 자막으로 트윗 스레드를 써라.
구성: 5~7개 트윗. 1번은 스크롤을 멈추게 하는 강력한 훅. 각 트윗 280자 이내, "1/" 식 번호, 각각 독립적으로 읽혀야.
${rules}`,

  description: (ctx, rules) => `${ctx}

당신은 유튜브 채널 운영자다. 아래 자막으로 영상 설명란을 써라.
구성: ① 2~3문장 요약 ② 핵심 포인트 불릿 3~5개 ③ 관련 해시태그 5개.
${rules}`,
};

// Vercel 함수 최대 실행시간 (재시도 포함 여유). 로컬 서버에선 무시됨.
export const config = { maxDuration: 30 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// OpenAI Chat Completions 호출 — 일시 오류(429/500/502/503)는 자동 재시도.
// 과부하/혼잡 스파이크가 길어도 견디게 지수 백오프 + jitter.
// 대기: ~0.8s → ~1.6s → ~3.2s → ~5s (cap), 총 5회 시도 = 약 10s 내 (maxDuration 30s 여유).
// ★ 실패 상세(공급자/HTTP코드)는 서버 로그에만 남기고, 클라이언트엔 내부사정 없는 code만 반환.
async function callOpenAI(prompt, key) {
  const url = "https://api.openai.com/v1/chat/completions";
  const RETRYABLE = new Set([429, 500, 502, 503]);
  const MAX_ATTEMPTS = 5;
  let lastDetail = "unknown"; // 서버 로그용 (사용자 미노출)
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      const backoff = Math.min(5000, 800 * 2 ** (attempt - 1)); // 0.8s,1.6s,3.2s,5s cap
      await sleep(backoff + Math.floor(Math.random() * 400)); // jitter (동시 재시도 분산)
    }
    let r;
    try {
      r = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [{ role: "user", content: prompt }],
        }),
      });
    } catch (e) {
      lastDetail = "network: " + (e?.message || e);
      continue;
    }
    const data = await r.json().catch(() => ({}));
    if (r.ok) {
      const text = data?.choices?.[0]?.message?.content || "";
      if (text) return { ok: true, text };
      console.error("[generate] empty response (content filter 가능)");
      return { ok: false, code: "empty" };
    }
    lastDetail = `HTTP ${r.status}: ${data?.error?.message || ""}`;
    // 크레딧 소진(insufficient_quota)은 재시도해도 안 풀리는 결제 문제 — 즉시 중단 + 운영자용 로그
    if ((data?.error?.code || data?.error?.type) === "insufficient_quota") {
      console.error("[generate] BILLING: insufficient_quota — OpenAI 크레딧 충전 필요");
      return { ok: false, code: "upstream" };
    }
    if (RETRYABLE.has(r.status)) continue; // 재시도
    console.error("[generate] upstream error:", lastDetail);
    return { ok: false, code: "upstream" };
  }
  console.error("[generate] retries exhausted:", lastDetail);
  return { ok: false, code: "busy" };
}

export default async function handler(req, res) {
  // CORS — 익스텐션/브라우저에서 호출 가능하게. (P3에서 출시 도메인으로 좁힐 예정)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST")
    return res.status(405).json({ ok: false, code: "bad_request" });

  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    console.error("[generate] OPENAI_API_KEY 미설정");
    return res.status(500).json({ ok: false, code: "config" });
  }

  // 본문 파싱 (Vercel은 JSON이면 req.body 자동 파싱하지만 문자열로 올 때도 방어)
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  let { transcript, title, channel, format, lang } = body || {};

  if (!transcript || typeof transcript !== "string")
    return res.status(400).json({ ok: false, code: "bad_request" });
  if (!FORMATS[format])
    return res.status(400).json({ ok: false, code: "bad_request" });
  if (transcript.length > MAX_TRANSCRIPT)
    transcript = transcript.slice(0, MAX_TRANSCRIPT);

  const prompt = `${FORMATS[format](buildCtx(title, channel), buildRules(lang))}

[영상 자막]
${transcript}`;

  const result = await callOpenAI(prompt, key);
  if (!result.ok) {
    // 사용자 문구는 클라이언트가 code로 KR/EN 현지화. 진짜 원인은 callOpenAI가 서버 로그에 남김.
    return res.status(502).json({ ok: false, code: result.code || "upstream" });
  }
  return res.status(200).json({ ok: true, text: result.text });
}
