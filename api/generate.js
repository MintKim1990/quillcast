// api/generate.js — Vercel 서버리스 함수
// 익스텐션이 보낸 (자막 + 영상 메타 + 포맷) → Gemini → 생성된 텍스트 반환.
// ★ GEMINI_API_KEY는 서버 환경변수에만 존재한다 — 클라이언트(익스텐션)에 절대 노출 X.
//   프롬프트는 scratch/generate.mjs(P1.1b 품질 검증 완료)에서 그대로 가져왔다.

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const MAX_TRANSCRIPT = 40000; // 자막 글자수 상한 (비용/남용 방지). 초과분은 잘라서 처리.

// ── 클리셰 금지 + 통찰 중심 재구성 룰 (P1.1b 튜닝) ─────────────────────
const RULES = `규칙:
- 공허한 자기계발 클리셰 금지 ("깊은 울림", "용기를 준다", "마음을 사로잡다", "다시 일어설 힘" 류).
- 자막을 그대로 요약·나열하지 말고, 독자가 가져갈 핵심 통찰 중심으로 재구성.
- 자막에 등장하는 구체적 사실·숫자·고유명사·인용을 우선 활용.
- 자막이 자동생성(구어체·문장부호 없음)이어도 매끄러운 글로 다듬어라.
- 한국어로, 군더더기 없이.`;

// ── 영상 제목/채널을 화자·주제 파악 맥락으로 주입 (P1.1b 개선 1) ───────
function buildCtx(title, channel) {
  return `이 글의 원본은 유튜브 영상이다.
- 채널: ${channel || "(불명)"}
- 제목: ${title || "(불명)"}
제목과 채널을 화자·주제 파악의 맥락으로 활용하라. 단, 자막에 없는 사실을 지어내지 말 것.`;
}

// ── 포맷 4종 (P1.1b 검증: 뉴스레터·블로그 강 / 트윗·설명란 viable) ─────
const FORMATS = {
  newsletter: (ctx) => `${ctx}

당신은 노련한 뉴스레터 작가다. 아래 자막으로 뉴스레터 1편을 써라.
구성: ① 제목 한 줄(호기심 유발, 낚시성 금지) ② 도입 훅 2문장 ③ 핵심 인사이트 3개(각 소제목 + 2~3문장, 구체적으로) ④ 짧은 마무리 한 줄.
${RULES}`,

  blog: (ctx) => `${ctx}

당신은 블로그 작가다. 아래 자막으로 블로그 글 1편을 써라.
구성: ① 제목 ② 도입부 ③ 본문(H2 소제목 3~4개, 각 단락) ④ 결론. 마크다운 사용.
${RULES}`,

  tweets: (ctx) => `${ctx}

당신은 X(트위터) 카피라이터다. 아래 자막으로 트윗 스레드를 써라.
구성: 5~7개 트윗. 1번은 스크롤을 멈추게 하는 강력한 훅. 각 트윗 280자 이내, "1/" 식 번호, 각각 독립적으로 읽혀야.
${RULES}`,

  description: (ctx) => `${ctx}

당신은 유튜브 채널 운영자다. 아래 자막으로 영상 설명란을 써라.
구성: ① 2~3문장 요약 ② 핵심 포인트 불릿 3~5개 ③ 관련 해시태그 5개.
${RULES}`,
};

export default async function handler(req, res) {
  // CORS — 익스텐션/브라우저에서 호출 가능하게. (P3에서 출시 도메인으로 좁힐 예정)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST")
    return res.status(405).json({ ok: false, error: "POST만 허용" });

  const key = process.env.GEMINI_API_KEY;
  if (!key)
    return res
      .status(500)
      .json({ ok: false, error: "서버에 GEMINI_API_KEY 미설정" });

  // 본문 파싱 (Vercel은 JSON이면 req.body 자동 파싱하지만 문자열로 올 때도 방어)
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  let { transcript, title, channel, format } = body || {};

  if (!transcript || typeof transcript !== "string")
    return res.status(400).json({ ok: false, error: "transcript 필요" });
  if (!FORMATS[format])
    return res
      .status(400)
      .json({ ok: false, error: "알 수 없는 format: " + format });
  if (transcript.length > MAX_TRANSCRIPT)
    transcript = transcript.slice(0, MAX_TRANSCRIPT);

  const prompt = `${FORMATS[format](buildCtx(title, channel))}

[영상 자막]
${transcript}`;

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    );
    const data = await r.json();
    if (!r.ok)
      return res.status(502).json({
        ok: false,
        error: `Gemini HTTP ${r.status}: ${data?.error?.message || ""}`,
      });
    const text =
      data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
    if (!text)
      return res
        .status(502)
        .json({ ok: false, error: "빈 응답 (safety 차단 가능)" });
    return res.status(200).json({ ok: true, text, model: MODEL });
  } catch (e) {
    return res
      .status(502)
      .json({ ok: false, error: "Gemini 호출 실패: " + (e?.message || e) });
  }
}
