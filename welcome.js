// welcome.js — 온보딩 페이지 문구 주입 (MV3 CSP상 인라인 스크립트 불가라 분리).
// 언어 규칙은 content.js와 동일: 브라우저 locale이 ko면 한국어, 그 외 영어.
(function () {
  const UI = (navigator.language || "").toLowerCase().startsWith("ko")
    ? "ko"
    : "en";
  const STR = {
    ko: {
      title: "설치 완료! 시작은 3단계면 돼요",
      sub: "유튜브 영상을 뉴스레터·블로그·트윗으로 — 클릭 한 번에.",
      s1: "아무 유튜브 영상이나 여세요",
      s1d: "자막이 있는 영상이면 뭐든 좋아요. (라이브 방송은 자막이 없어 안 돼요)",
      s2: "화면 오른쪽 아래 ✍️ Quillcast 버튼을 누르세요",
      s2d: "영상 페이지에서만 나타나요.",
      s3: "포맷을 고르면 글이 완성돼요",
      s3d: "📰 뉴스레터 · ✍️ 블로그 · 🐦 트윗 · 📄 설명란 중에 골라보세요.",
      cta: "▶ 유튜브에서 바로 해보기",
      plan: "무료로 매달 5회 · Pro($8/월)는 무제한",
    },
    en: {
      title: "You're all set — 3 steps to start",
      sub: "Turn any YouTube video into a newsletter, blog, or tweets — in one click.",
      s1: "Open any YouTube video",
      s1d: "Any video with captions works. (Live streams have no captions.)",
      s2: "Click the ✍️ Quillcast button at the bottom right",
      s2d: "It only appears on video pages.",
      s3: "Pick a format and get your draft",
      s3d: "Choose 📰 Newsletter · ✍️ Blog · 🐦 Tweets · 📄 Description.",
      cta: "▶ Try it on YouTube now",
      plan: "Free 5 times a month · Pro ($8/mo) is unlimited",
    },
  }[UI];

  document.documentElement.lang = UI;
  for (const el of document.querySelectorAll("[data-i18n]")) {
    el.textContent = STR[el.dataset.i18n];
  }
})();
