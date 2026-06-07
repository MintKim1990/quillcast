// background.js — 서비스 워커 (MV3)
// content.js가 보낸 (자막 + 메타 + 포맷)을 받아 quillcast 서버 함수를 호출하고 결과를 돌려준다.
// 네트워크 호출을 여기(확장 컨텍스트)에서 하면 manifest host_permissions 덕에 CORS 없이 호출된다.
// (content.js는 youtube.com 페이지 컨텍스트라 외부 도메인 호출이 CORS에 막힘 → 그래서 여기로 위임)

// ★ 배포 후 아래 API_BASE를 실제 Vercel URL로 교체.
//   - 로컬 개발: "http://localhost:3000" (npx vercel dev)
//   - 배포 후 : "https://<your-project>.vercel.app"
const API_BASE = "https://quillcast-three.vercel.app";

// 설치별 익명 식별자(clientId) — 서버의 무료 월 한도 미터링 단위.
// chrome.storage.local에 1회 생성해 영구 보관 (개인정보 아님, 랜덤 UUID).
async function getClientId() {
  const { quillcastClientId } = await chrome.storage.local.get("quillcastClientId");
  if (quillcastClientId) return quillcastClientId;
  const id = crypto.randomUUID();
  await chrome.storage.local.set({ quillcastClientId: id });
  return id;
}

// 유료 구독 라이선스 키 (content.js의 Pro 입력으로 저장됨). 없으면 빈 문자열.
async function getLicense() {
  const { quillcastLicense } = await chrome.storage.local.get("quillcastLicense");
  return quillcastLicense || "";
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "YTR_GENERATE") return; // 다른 메시지는 무시

  (async () => {
    try {
      const clientId = await getClientId();
      const license = await getLicense();
      const headers = {
        "Content-Type": "application/json",
        "x-quillcast-client": clientId, // 무료 한도 미터링 단위
      };
      if (license) headers["x-quillcast-license"] = license; // 유료 구독 라이선스 키
      const res = await fetch(`${API_BASE}/api/generate`, {
        method: "POST",
        headers,
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
        // 서버가 준 code/플랜정보 그대로 전달 → content.js가 현지화 + 상태바 갱신.
        sendResponse({
          ok: false,
          code: data.code || "upstream",
          plan: data.plan,
          used: data.used,
          limit: data.limit,
        });
        return;
      }
      sendResponse({
        ok: true,
        text: data.text,
        plan: data.plan,
        used: data.used,
        limit: data.limit,
      });
    } catch (e) {
      console.warn("[quillcast] server fetch failed:", e?.message || e);
      sendResponse({ ok: false, code: "no_response" });
    }
  })();

  return true; // 비동기 sendResponse를 쓰므로 채널 열어둠
});
