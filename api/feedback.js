// api/feedback.js — 제거(uninstall) 피드백 수집 (goodbye.html 전용)
// 익명·선택 입력. Upstash 리스트에 쌓고 최근 500개만 유지. 저장 실패해도 200(수집은 best-effort).
// 조회: 읽기전용 토큰으로 LRANGE fb:uninstall 0 -1

const MAX_NOTE = 1000;
const MAX_PER_HOUR = 5; // IP당 시간당 제출 상한 (스팸 백스톱)

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
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  // goodbye.html과 같은 도메인에서만 쓰므로 CORS 헤더 불필요 (교차출처는 브라우저가 차단)
  if (req.method !== "POST")
    return res.status(405).json({ ok: false });

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  const reason = String(body?.reason || "").slice(0, 40);
  const note = String(body?.note || "").slice(0, MAX_NOTE);
  if (!reason && !note) return res.status(200).json({ ok: true }); // 빈 제출은 조용히 무시

  const ip =
    String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    "unknown";
  const rl = await redisPipe([
    ["INCR", `fbrl:${ip}`],
    ["EXPIRE", `fbrl:${ip}`, 3600],
  ]);
  if (rl && (rl[0]?.result ?? 0) > MAX_PER_HOUR)
    return res.status(200).json({ ok: true }); // 초과분은 버리되 티 안 냄

  const entry = JSON.stringify({
    t: new Date().toISOString(),
    reason,
    note,
  });
  await redisPipe([
    ["LPUSH", "fb:uninstall", entry],
    ["LTRIM", "fb:uninstall", 0, 499],
  ]);
  return res.status(200).json({ ok: true });
}
