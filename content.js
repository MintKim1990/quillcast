// content.js — ISOLATED world
// 화면에 버튼(자막 / 뉴스레터 / 블로그)을 띄우고:
//  1) 자막 추출: inject.js(MAIN world)의 timedtext → 막히면 DOM 패널 스크랩 fallback
//  2) 변환: 추출한 자막 + 영상 제목/채널 + 포맷을 background.js로 보내 서버(Gemini) 결과를 받아 표시
// background로 위임하는 이유: content.js는 youtube.com 컨텍스트라 외부 서버 호출이 CORS에 막힘.

(function () {
  if (window.__ytrLoaded) return;
  window.__ytrLoaded = true;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ── UI: 버튼 툴바 ─────────────────────────────────────────────────────
  function ensureToolbar() {
    if (document.getElementById("ytr-bar-fixed")) return;
    const wrap = document.createElement("div");
    wrap.id = "ytr-bar-fixed";

    const mk = (id, label, fn) => {
      const b = document.createElement("button");
      b.id = id;
      b.className = "ytr-fab";
      b.textContent = label;
      b.addEventListener("click", fn);
      return b;
    };

    wrap.appendChild(mk("ytr-btn-raw", "📝 자막", onRawClick));
    wrap.appendChild(
      mk("ytr-btn-news", "📰 뉴스레터", () => onGenerate("newsletter", "뉴스레터"))
    );
    wrap.appendChild(
      mk("ytr-btn-blog", "✍️ 블로그", () => onGenerate("blog", "블로그"))
    );
    document.body.appendChild(wrap);
  }

  // ── UI: 결과 패널 ─────────────────────────────────────────────────────
  function ensurePanel() {
    let panel = document.getElementById("ytr-panel");
    if (panel) return panel;

    panel = document.createElement("div");
    panel.id = "ytr-panel";

    const bar = document.createElement("div");
    bar.id = "ytr-bar";

    const title = document.createElement("span");
    title.id = "ytr-title";
    title.textContent = "Quillcast";

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

  // ── 영상 제목 / 채널 추출 (Gemini 맥락 주입용) ────────────────────────
  function getVideoMeta() {
    const title =
      document.querySelector("h1.ytd-watch-metadata")?.innerText?.trim() ||
      document.querySelector("#title h1")?.innerText?.trim() ||
      document.title.replace(/ - YouTube$/, "").trim() ||
      "";
    const channel =
      document.querySelector("ytd-channel-name #text a")?.textContent?.trim() ||
      document.querySelector("#owner #channel-name a")?.textContent?.trim() ||
      document.querySelector("ytd-channel-name a")?.textContent?.trim() ||
      "";
    return { title, channel };
  }

  // ── 자막 추출 (Promise) ───────────────────────────────────────────────
  // inject.js에 timedtext 요청 → 응답이 ok면 그 텍스트, 실패/무응답이면 DOM 스크랩 fallback.
  function getTranscript() {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (val) => {
        if (settled) return;
        settled = true;
        window.removeEventListener("message", onMsg);
        clearTimeout(timer);
        resolve(val);
      };

      const onMsg = async (e) => {
        if (e.source !== window || e.data?.type !== "YTR_TRANSCRIPT") return;
        const d = e.data;
        if (d.ok && d.text) {
          finish({
            ok: true,
            text: d.text,
            via: `timedtext/${d.lang}`,
            count: d.count,
          });
          return;
        }
        // timedtext 실패 → DOM 스크랩
        const r = await scrapeFromDOM();
        finish(
          r.ok
            ? { ok: true, text: r.text, via: "DOM", count: r.count }
            : { ok: false, reason: `timedtext:${d.reason} / DOM:${r.reason}` }
        );
      };
      window.addEventListener("message", onMsg);

      // inject.js가 끝내 무응답이면 6초 후 DOM 스크랩으로 직접 시도
      const timer = setTimeout(async () => {
        const r = await scrapeFromDOM();
        finish(
          r.ok
            ? { ok: true, text: r.text, via: "DOM(timeout)", count: r.count }
            : { ok: false, reason: `timedtext 무응답 / DOM:${r.reason}` }
        );
      }, 6000);

      window.postMessage({ type: "YTR_GET_TRANSCRIPT" }, "*");
    });
  }

  // ── 동작: 자막만 보기 (디버그/원문 확인용) ────────────────────────────
  async function onRawClick() {
    show("자막 가져오는 중…", "자막");
    const r = await getTranscript();
    if (r.ok)
      show(
        `[${r.via} / ${r.count}세그먼트 / ${r.text.length}자]\n\n${r.text}`,
        "자막 ✓"
      );
    else show(`자막 추출 실패:\n${r.reason}`, "실패");
  }

  // ── 동작: 자막 → 서버(Gemini) → 변환 결과 표시 ───────────────────────
  async function onGenerate(format, label) {
    show(`자막 가져오는 중… (다음: ${label} 생성)`, label);
    const r = await getTranscript();
    if (!r.ok) {
      show(`자막 추출 실패:\n${r.reason}`, "실패");
      return;
    }
    show(
      `자막 ${r.text.length}자 확보 (${r.via}).\n${label} 생성 중… (서버 → Gemini)`,
      `${label} 생성 중`
    );

    const meta = getVideoMeta();
    chrome.runtime.sendMessage(
      {
        type: "YTR_GENERATE",
        format,
        transcript: r.text,
        title: meta.title,
        channel: meta.channel,
      },
      (resp) => {
        if (chrome.runtime.lastError) {
          show(
            `확장 통신 오류:\n${chrome.runtime.lastError.message}`,
            "실패"
          );
          return;
        }
        if (!resp?.ok) {
          show(`${label} 생성 실패:\n${resp?.error || "알 수 없는 오류"}`, "실패");
          return;
        }
        show(resp.text, `${label} ✓`);
      }
    );
  }

  // ── DOM 자막 패널 스크랩 fallback ─────────────────────────────────────
  // 유튜브 설명란의 "스크립트 표시" 버튼을 눌러 transcript 패널을 연 뒤,
  // 렌더된 세그먼트(transcript-segment-view-model 신/구)의 텍스트를 긁는다.
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
      let segs = [];
      for (let i = 0; i < 30; i++) {
        segs = document.querySelectorAll(SEG_SEL);
        if (segs.length) break;
        await sleep(300);
      }
      if (!segs.length) return { ok: false, reason: "NO_SEGMENTS" };

      // 4) 텍스트 스크랩 (앞에 붙는 타임스탬프 제거)
      const lines = [...segs]
        .map((s) => {
          const el = s.querySelector(".segment-text");
          let txt = el ? el.textContent : s.innerText || "";
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
  ensureToolbar();
  const obs = new MutationObserver(() => ensureToolbar());
  obs.observe(document.body, { childList: true, subtree: true });
})();
