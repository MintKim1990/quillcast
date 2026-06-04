// content.js — ISOLATED world
// 화면에 버튼 + 패널 UI를 띄우고, inject.js(MAIN world)에 자막 요청을 보내고 결과를 표시한다.

(function () {
  if (window.__ytrLoaded) return;
  window.__ytrLoaded = true;

  function ensureButton() {
    if (document.getElementById("ytr-btn")) return;
    const btn = document.createElement("button");
    btn.id = "ytr-btn";
    btn.textContent = "📝 자막 가져오기";
    btn.addEventListener("click", onClick);
    document.body.appendChild(btn);
  }

  function ensurePanel() {
    let panel = document.getElementById("ytr-panel");
    if (panel) return panel;

    panel = document.createElement("div");
    panel.id = "ytr-panel";

    const bar = document.createElement("div");
    bar.id = "ytr-bar";

    const title = document.createElement("span");
    title.id = "ytr-title";
    title.textContent = "자막";

    const copy = document.createElement("button");
    copy.id = "ytr-copy";
    copy.textContent = "복사";
    copy.onclick = () => {
      const ta = document.getElementById("ytr-text");
      ta.select();
      document.execCommand("copy");
      copy.textContent = "복사됨!";
      setTimeout(() => (copy.textContent = "복사"), 1200);
    };

    const close = document.createElement("button");
    close.id = "ytr-close";
    close.textContent = "✕";
    close.onclick = () => panel.remove();

    bar.appendChild(title);
    bar.appendChild(copy);
    bar.appendChild(close);

    const ta = document.createElement("textarea");
    ta.id = "ytr-text";
    ta.readOnly = true;

    panel.appendChild(bar);
    panel.appendChild(ta);
    document.body.appendChild(panel);
    return panel;
  }

  function show(content, titleText) {
    const panel = ensurePanel();
    if (titleText) panel.querySelector("#ytr-title").textContent = titleText;
    panel.querySelector("#ytr-text").value = content;
  }

  function onClick() {
    show("자막 가져오는 중...", "자막");
    window.postMessage({ type: "YTR_GET_TRANSCRIPT" }, "*");
  }

  window.addEventListener("message", (e) => {
    if (e.source !== window) return;
    if (e.data?.type !== "YTR_TRANSCRIPT") return;

    if (e.data.error === "NO_CAPTIONS") {
      show("이 영상엔 자막 트랙이 없거나 못 찾았어요.", "자막 없음");
    } else if (e.data.error === "EMPTY") {
      show(
        "자막 트랙은 찾았는데 내용이 비어서 왔어요.\n→ YouTube가 timedtext를 막은 경우일 수 있어요. (DOM 패널 스크랩 fallback 필요)",
        "비어 있음"
      );
    } else if (e.data.error) {
      show("에러: " + e.data.error, "에러");
    } else {
      const t = e.data.text || "";
      show(
        `[언어: ${e.data.lang} / 세그먼트: ${e.data.count} / 글자수: ${t.length}]\n\n${t}`,
        "자막 ✓"
      );
    }
  });

  // YouTube는 SPA라 페이지 전환 시 버튼이 사라질 수 있어 계속 보장
  ensureButton();
  const obs = new MutationObserver(() => ensureButton());
  obs.observe(document.body, { childList: true, subtree: true });
})();
