// background.js — 서비스 워커 (MV3)
// content.js가 보낸 (자막 + 메타 + 포맷)을 받아 quillcast 서버 함수를 호출하고 결과를 돌려준다.
// 네트워크 호출을 여기(확장 컨텍스트)에서 하면 manifest host_permissions 덕에 CORS 없이 호출된다.
// (content.js는 youtube.com 페이지 컨텍스트라 외부 도메인 호출이 CORS에 막힘 → 그래서 여기로 위임)

// ★ 배포 후 아래 API_BASE를 실제 Vercel URL로 교체.
//   - 로컬 개발: "http://localhost:3000" (npx vercel dev)
//   - 배포 후 : "https://<your-project>.vercel.app"
const API_BASE = "http://localhost:3000";

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "YTR_GENERATE") return; // 다른 메시지는 무시

  (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: msg.transcript,
          title: msg.title,
          channel: msg.channel,
          format: msg.format,
          lang: msg.lang,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        sendResponse({
          ok: false,
          error: data.error || `서버 HTTP ${res.status}`,
        });
        return;
      }
      sendResponse({ ok: true, text: data.text });
    } catch (e) {
      sendResponse({
        ok: false,
        error: `서버 연결 실패 (${API_BASE}): ${e?.message || e}`,
      });
    }
  })();

  return true; // 비동기 sendResponse를 쓰므로 채널 열어둠
});
