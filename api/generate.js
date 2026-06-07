// api/generate.js — Vercel 서버리스 함수
// 익스텐션이 보낸 (자막 + 영상 메타 + 포맷) → LLM → 생성된 텍스트 반환.
// ★ OPENAI_API_KEY는 서버 환경변수에만 존재한다 — 클라이언트(익스텐션)에 절대 노출 X.
//   프롬프트는 scratch/generate.mjs(P1.1b 품질 검증 완료)에서 그대로 가져왔다.
//   모델 교체: OPENAI_MODEL 환경변수로 한 줄에 변경 (gpt-4o-mini → gpt-5-mini 등).

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const MAX_TRANSCRIPT = 40000; // 자막 글자수 상한 (비용/남용 방지). 초과분은 잘라서 처리.
const FREE_MONTHLY_LIMIT = parseInt(process.env.FREE_MONTHLY_LIMIT || "5", 10); // 무료 월 생성 횟수 (Vercel env로 조정)
const RATE_PER_MIN = parseInt(process.env.RATE_PER_MIN || "12", 10); // IP당 분당 요청 상한 (어뷰징 백스톱)
const PAID_MONTHLY_LIMIT = parseInt(process.env.PAID_MONTHLY_LIMIT || "500", 10); // 유료(라이선스) 월 상한 — 키 공유 남용 봉인용 안전캡

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

// ── Upstash Redis (REST) — 사용량 미터링/한도 저장소 ─────────────────────
// env(UPSTASH_REDIS_REST_URL/TOKEN) 미설정이거나 오류면 null 반환 → 게이트는 fail-open
// (저장소 장애가 제품 전체를 막지 않게. OpenAI 호출당 비용이 작아 감수 가능한 트레이드오프.)
// Vercel 마켓플레이스 Upstash 연동은 KV_REST_API_*로, 독립 Upstash는 UPSTASH_REDIS_REST_*로
// 주입한다 — 둘 다 동일한 Upstash REST 프로토콜이므로 어느 이름이든 받는다.
const REDIS_URL =
  process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN =
  process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

async function redisPipe(commands) {
  if (!REDIS_URL || !REDIS_TOKEN) return null;
  try {
    const r = await fetch(`${REDIS_URL}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(commands),
    });
    if (!r.ok) {
      console.error("[redis] HTTP", r.status);
      return null;
    }
    return await r.json(); // [{ result: ... }, ...]
  } catch (e) {
    console.error("[redis] error:", e?.message || e);
    return null;
  }
}
const redisCmd = async (...args) => {
  const out = await redisPipe([args]);
  return out ? out[0]?.result : null;
};

// IP 분당 요청 상한 초과 여부. 저장소 미동작 시 false(fail-open).
async function isRateLimited(ip) {
  const key = `rl:${ip}:${Math.floor(Date.now() / 60000)}`;
  const out = await redisPipe([
    ["INCR", key],
    ["EXPIRE", key, 70],
  ]);
  if (!out) return false;
  return (out[0]?.result ?? 0) > RATE_PER_MIN;
}

// 월 한도 체크 + 1 차감. id별 카운터가 limit 초과면 allowed:false.
// 통과 시 카운트가 1 늘며, 생성 실패하면 refund()로 되돌린다.
async function checkQuota(id, limit) {
  const month = new Date().toISOString().slice(0, 7); // 예: "2026-06"
  const key = `q:${id}:${month}`;
  const out = await redisPipe([
    ["INCR", key],
    ["EXPIRE", key, 60 * 60 * 24 * 40], // 약 40일 — 지난 달 키는 자동 소멸
  ]);
  if (!out) return { allowed: true, refund: async () => {} }; // fail-open
  const count = out[0]?.result ?? 0;
  if (count > limit) {
    await redisCmd("DECR", key); // 한도 초과분은 되돌려 카운터를 한도에서 안정
    return { allowed: false, refund: async () => {} };
  }
  return {
    allowed: true,
    refund: async () => {
      await redisCmd("DECR", key);
    },
  };
}

// 라이선스 키(LemonSqueezy) 유효성 = 유료 구독 활성 여부. Upstash에 결과 캐시(검증 API 과호출 방지).
// LS License API validate는 인증 불필요 — 라이선스 키만 보내면 됨. 구독 취소/만료 시 status가 바뀐다.
const LS_VALIDATE_URL = "https://api.lemonsqueezy.com/v1/licenses/validate";
async function validateLicense(key) {
  if (!key) return false;
  const cacheKey = `lic:${key}`;
  const cached = await redisCmd("GET", cacheKey);
  if (cached === "1") return true;
  if (cached === "0") return false;
  let valid = false;
  try {
    const r = await fetch(LS_VALIDATE_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ license_key: key }).toString(),
    });
    const data = await r.json().catch(() => ({}));
    // valid=true면 키가 실재·미만료. status는 inactive(미활성)도 정상 — 우린 activate를 안 쓰므로
    // 기기 활성화 여부와 무관하게 구독만 살아있으면 통과. expired/disabled만 제외.
    const st = data?.license_key?.status;
    valid = data?.valid === true && st !== "expired" && st !== "disabled";
  } catch (e) {
    console.error("[license] validate error:", e?.message || e);
    return false; // 검증 불가 시 보수적으로 무료로 강등
  }
  // 유효=6h 캐시 / 무효=10분(결제 직후 빨리 반영). 저장소 없으면 캐시 생략(매번 검증).
  await redisPipe([
    ["SET", cacheKey, valid ? "1" : "0"],
    ["EXPIRE", cacheKey, valid ? 60 * 60 * 6 : 600],
  ]);
  return valid;
}

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
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, x-quillcast-client, x-quillcast-license"
  );
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST")
    return res.status(405).json({ ok: false, code: "bad_request" });

  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    console.error("[generate] OPENAI_API_KEY 미설정");
    return res.status(500).json({ ok: false, code: "config" });
  }

  // ── 식별 + 남용 방지 게이트 (P3①: 비용 보호) ─────────────────────────
  // 익스텐션은 설치별 clientId를 헤더로 보낸다. 없으면 차단(무단 호출 1차 방어).
  const clientId = String(req.headers["x-quillcast-client"] || "").trim();
  if (clientId.length < 8) {
    return res.status(400).json({ ok: false, code: "bad_request" });
  }
  const ip =
    String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    "unknown";
  // IP 분당 요청 상한 — clientId를 바꿔가며 때리는 스크립트성 남용 백스톱.
  if (await isRateLimited(ip)) {
    return res.status(429).json({ ok: false, code: "busy" });
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

  // 유료(라이선스) 여부 판정 → 한도 분기.
  //   유료: 라이선스키 기준 높은 상한(PAID_MONTHLY_LIMIT). 무료: clientId 기준 무료 한도.
  const license = String(req.headers["x-quillcast-license"] || "").trim();
  const isPaid = license ? await validateLicense(license) : false;
  const quota = isPaid
    ? await checkQuota(`lic:${license}`, PAID_MONTHLY_LIMIT)
    : await checkQuota(clientId, FREE_MONTHLY_LIMIT);
  if (!quota.allowed) {
    // 무료 소진=limit(구독 유도), 유료 안전캡 도달=busy(공유 남용 의심).
    return res.status(429).json({ ok: false, code: isPaid ? "busy" : "limit" });
  }

  const prompt = `${FORMATS[format](buildCtx(title, channel), buildRules(lang))}

[영상 자막]
${transcript}`;

  const result = await callOpenAI(prompt, key);
  if (!result.ok) {
    await quota.refund(); // 생성 실패 → 소비한 무료 횟수 되돌림(사용자 보호)
    // 사용자 문구는 클라이언트가 code로 KR/EN 현지화. 진짜 원인은 callOpenAI가 서버 로그에 남김.
    return res.status(502).json({ ok: false, code: result.code || "upstream" });
  }
  return res.status(200).json({ ok: true, text: result.text });
}
