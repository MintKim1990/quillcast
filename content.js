// content.js — ISOLATED world
// 화면에 버튼 + 패널 UI를 띄우고, inject.js(MAIN world)에 timedtext 요청을 보낸다.
// timedtext가 막히면(빈 응답) DOM 자막 패널을 직접 열어 스크랩하는 fallback을 수행한다.

(function () {
  if (window.__ytrLoaded) return;
  window.__ytrLoaded = true;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
    show("자막 가져오는 중... (1/2 timedtext)", "자막");
    window.postMessage({ type: "YTR_GET_TRANSCRIPT" }, "*");
  }

  // ── timedtext 결과 수신 ───────────────────────────────────────────────
  window.addEventListener("message", async (e) => {
    if (e.source !== window) return;
    if (e.data?.type !== "YTR_TRANSCRIPT") return;
    const d = e.data;

    if (d.ok) {
      const t = d.text || "";
      show(
        `[방식: timedtext / 언어: ${d.lang} / 세그먼트: ${d.count} / 글자수: ${t.length}]\n\n${t}`,
        "자막 ✓"
      );
      return;
    }

    // timedtext 실패 → DOM 패널 스크랩 fallback
    show(
      `timedtext 실패 (${d.reason || "?"}).\nDOM 자막 패널 스크랩 시도 중... (2/2)`,
      "fallback 중"
    );
    const r = await scrapeFromDOM();
    if (r.ok) {
      const t = r.text || "";
      show(
        `[방식: DOM 스크랩 / 세그먼트: ${r.count} / 글자수: ${t.length}]\n\n${t}`,
        "자막 ✓ (DOM)"
      );
    } else {
      show(
        `둘 다 실패했어요.\n- timedtext: ${d.reason || "?"}\n- DOM 스크랩: ${r.reason || "?"}\n\n(이 메시지를 그대로 개발자에게 알려주세요)`,
        "실패"
      );
    }
  });

  // ── DOM 자막 패널 스크랩 fallback ─────────────────────────────────────
  // 유튜브 설명란의 "스크립트 표시" 버튼을 눌러 transcript 패널을 연 뒤,
  // 렌더된 세그먼트(ytd-transcript-segment-renderer)의 텍스트를 긁는다.
  async function scrapeFromDOM() {
    try {
      const SEG_SEL =
        "transcript-segment-view-model, ytd-transcript-segment-renderer";

      // 이미 자막 패널이 열려 있으면 버튼을 누르지 않는다.
      // (열려 있는데 또 누르면 토글되어 닫혀버림 → NO_SEGMENTS)
      if (document.querySelectorAll(SEG_SEL).length === 0) {
        // 1) 설명란 펼치기 (transcript 버튼이 설명란 하단에 있음)
        const expand = document.querySelector(
          "ytd-text-inline-expander #expand, tp-yt-paper-button#expand, #description #expand"
        );
        if (expand) {
          expand.click();
          await sleep(400);
        }

        // 2) "스크립트 표시" 버튼 찾기 (구조 → 텍스트 순으로 시도, 약간 재시도)
        let btn = findTranscriptButton();
        if (!btn) {
          await sleep(700);
          btn = findTranscriptButton();
        }
        if (!btn) return { ok: false, reason: "NO_TRANSCRIPT_BUTTON" };
        btn.click();
      }

      // 3) transcript 세그먼트 렌더 대기 (최대 ~9초)
      //    유튜브 신(transcript-segment-view-model)/구(ytd-transcript-segment-renderer) 컴포넌트 모두 지원
      let segs = [];
      for (let i = 0; i < 30; i++) {
        segs = document.querySelectorAll(SEG_SEL);
        if (segs.length) break;
        await sleep(300);
      }
      if (!segs.length) return { ok: false, reason: "NO_SEGMENTS" };

      // 4) 텍스트 스크랩
      //    구버전: .segment-text 클래스 / 신버전: 전용 클래스 없음 → innerText에서 앞 타임스탬프 제거
      const lines = [...segs]
        .map((s) => {
          const el = s.querySelector(".segment-text");
          let txt = el ? el.textContent : s.innerText || "";
          // 세그먼트마다 붙는 타임스탬프 제거 (UI 언어 따라 "1:20" 또는 "1분 4초"/"8초")
          txt = txt
            .replace(/\d+\s*분(?:\s*\d+\s*초)?/g, " ") // "1분 4초" / "3분"
            .replace(/\d+\s*초/g, " ") // "8초"
            .replace(/\d{1,2}:\d{2}(?::\d{2})?/g, " ") // "1:20" / "1:04:30"
            .replace(/\s+/g, " ")
            .trim();
          return txt;
        })
        .filter(Boolean);

      if (!lines.length) return { ok: false, reason: "EMPTY_SEGMENTS" };
      const text = lines.join(" ").replace(/\s+/g, " ").trim();
      return { ok: true, text, count: lines.length };
    } catch (err) {
      return {
        ok: false,
        reason: "SCRAPE_EXCEPTION: " + (err && err.message ? err.message : err),
      };
    }
  }

  function findTranscriptButton() {
    // 구조적: 설명란 transcript 섹션의 버튼
    const sec = document.querySelector(
      "ytd-video-description-transcript-section-renderer button, " +
        "ytd-video-description-transcript-section-renderer ytd-button-renderer button"
    );
    if (sec) return sec;

    // 텍스트/aria-label 기반 (다국어)
    const cands = document.querySelectorAll(
      "button, a#button, ytd-button-renderer button, yt-button-shape button"
    );
    for (const b of cands) {
      const s = (
        (b.getAttribute("aria-label") || "") +
        " " +
        (b.textContent || "")
      ).toLowerCase();
      if (
        s.includes("transcript") ||
        s.includes("스크립트") ||
        s.includes("대본")
      ) {
        return b;
      }
    }
    return null;
  }

  // YouTube는 SPA라 페이지 전환 시 버튼이 사라질 수 있어 계속 보장
  ensureButton();
  const obs = new MutationObserver(() => ensureButton());
  obs.observe(document.body, { childList: true, subtree: true });
})();
