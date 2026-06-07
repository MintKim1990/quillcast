// content.js — ISOLATED world
// 플로팅 런처 버튼 1개 → 패널 열기. 패널 안에서 포맷(뉴스레터/블로그/트윗/설명란/원본)을 골라 생성.
// 흐름: 자막 추출(timedtext → 실패 시 DOM 스크랩) → background.js → 서버(LLM) → 패널 표시.
// 자막은 영상당 1회만 추출해 캐시 → 포맷 전환 시 재추출 없이 변환만 다시 한다.

(function () {
  if (window.__ytrLoaded) return;
  window.__ytrLoaded = true;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ★ LemonSqueezy 구독 체크아웃 URL — 배포 전 실제 URL로 교체.
  //   (LS 대시보드 > 상품 > Share/Buy link, 예: https://quillcast.lemonsqueezy.com/buy/xxxxxxxx)
  const CHECKOUT_URL =
    "https://quillcast.lemonsqueezy.com/checkout/buy/cf099b5c-9bb5-4204-85e5-ce73891d0c13";
  const PRICE = "8"; // 표시용 가격($/월)

  // ── UI 언어 (브라우저 locale 자동: 한국어면 한국어, 그 외엔 영어) ───────
  const UI = (navigator.language || "").toLowerCase().startsWith("ko")
    ? "ko"
    : "en";
  const STR = {
    ko: {
      launcher: "✍️ Quillcast",
      copy: "복사",
      copied: "복사됨!",
      redo: "↻ 다시",
      redoTitle: "현재 포맷을 새로 생성",
      langTitle: "출력 언어",
      placeholder: "위에서 포맷을 골라 생성하세요.",
      fetching: "자막 가져오는 중…",
      langAuto: "🌐 자동(영상 언어)",
      fmt: {
        newsletter: "📰 뉴스레터",
        blog: "✍️ 블로그",
        tweets: "🐦 트윗",
        description: "📄 설명란",
        raw: "📝 원본자막",
      },
      errors: {
        busy: "지금 요청이 몰려 생성에 실패했어요. 잠시 후 다시 시도해주세요.",
        empty: "이 영상은 글로 변환하지 못했어요. 다른 영상으로 시도해보세요.",
        upstream: "생성 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.",
        config: "일시적인 오류가 발생했어요. 잠시 후 다시 시도해주세요.",
        bad_request: "요청을 처리할 수 없어요. 페이지를 새로고침해보세요.",
        comms: "확장과 통신에 실패했어요. 페이지를 새로고침해보세요.",
        no_response: "서버 응답이 없어요. 잠시 후 다시 시도해주세요.",
        limit: "이번 달 무료 사용 한도를 다 썼어요. 다음 달에 다시 충전돼요.",
      },
      transcriptFail: (r) => `자막 추출 실패: ${r}`,
      rawMeta: (via, count, len) => `원본 자막 · ${via} / ${count}세그먼트 / ${len}자`,
      cached: (label) => `${label} · 저장된 결과 (새로 만들려면 ↻ 다시)`,
      generating: (label) => `${label} 생성 중…`,
      done: (label, inLen, outLen) => `${label} 완료 ✓ · 자막 ${inLen}자 → ${outLen}자`,
      pro: "✨ Pro",
      proTitle: "Quillcast Pro — 무제한 생성",
      proDesc: (price) => `구독하면 월 한도 없이 사용 ($${price}/월).`,
      subscribe: "구독하기",
      licensePlaceholder: "라이선스 키 붙여넣기",
      saveLicense: "저장",
      licenseSaved: "✨ Pro 활성 — 재생성하면 적용돼요.",
      licenseCleared: "라이선스 키를 지웠어요.",
      planFree: "무료 플랜",
      planFreeUsed: (u, l) => `무료 · 이번 달 ${u}/${l}`,
      planPro: "✨ Pro 이용 중",
      subscribeShort: "✨ 무제한 구독",
      manageKey: "키 관리",
    },
    en: {
      launcher: "✍️ Quillcast",
      copy: "Copy",
      copied: "Copied!",
      redo: "↻ Redo",
      redoTitle: "Regenerate current format",
      langTitle: "Output language",
      placeholder: "Pick a format above to generate.",
      fetching: "Fetching transcript…",
      langAuto: "🌐 Auto (video language)",
      fmt: {
        newsletter: "📰 Newsletter",
        blog: "✍️ Blog",
        tweets: "🐦 Tweets",
        description: "📄 Description",
        raw: "📝 Transcript",
      },
      errors: {
        busy: "Too many requests right now. Please try again in a moment.",
        empty: "Couldn't turn this video into text. Try another video.",
        upstream: "Something went wrong while generating. Please try again.",
        config: "A temporary error occurred. Please try again.",
        bad_request: "Couldn't process the request. Try refreshing the page.",
        comms: "Failed to reach the extension. Try refreshing the page.",
        no_response: "No response from the server. Please try again.",
        limit: "You've used up this month's free generations. They reset next month.",
      },
      transcriptFail: (r) => `Transcript failed: ${r}`,
      rawMeta: (via, count, len) => `Transcript · ${via} / ${count} segments / ${len} chars`,
      cached: (label) => `${label} · cached (↻ Redo to regenerate)`,
      generating: (label) => `Generating ${label}…`,
      done: (label, inLen, outLen) => `${label} done ✓ · ${inLen} → ${outLen} chars`,
      pro: "✨ Pro",
      proTitle: "Quillcast Pro — unlimited",
      proDesc: (price) => `Subscribe for unlimited generations ($${price}/mo).`,
      subscribe: "Subscribe",
      licensePlaceholder: "Paste license key",
      saveLicense: "Save",
      licenseSaved: "✨ Pro active — regenerate to apply.",
      licenseCleared: "License key cleared.",
      planFree: "Free plan",
      planFreeUsed: (u, l) => `Free · ${u}/${l} this month`,
      planPro: "✨ Pro active",
      subscribeShort: "✨ Go unlimited",
      manageKey: "Manage key",
    },
  }[UI];

  const FORMATS = [
    { fmt: "newsletter", label: STR.fmt.newsletter },
    { fmt: "blog", label: STR.fmt.blog },
    { fmt: "tweets", label: STR.fmt.tweets },
    { fmt: "description", label: STR.fmt.description },
    { fmt: "raw", label: STR.fmt.raw },
  ];

  const LANGS = [
    { v: "auto", label: STR.langAuto },
    { v: "ko", label: "한국어" },
    { v: "en", label: "English" },
    { v: "ja", label: "日本語" },
    { v: "es", label: "Español" },
    { v: "zh", label: "中文" },
  ];

  let busy = false;
  let lang = "auto"; // 출력 언어 기본값 = 영상 언어(auto). 드롭다운에서 언제든 변경.
  let transcriptCache = null; // { videoId, text, via, count, ok }
  const outputCache = {}; // `${videoId}:${format}:${lang}` → 생성된 텍스트 (재방문 시 LLM 재호출 안 함)
  let current = null; // { fmt, label } — ↻ 다시생성 / 언어변경용

  const getVideoId = () => {
    try {
      return new URLSearchParams(location.search).get("v") || "";
    } catch {
      return "";
    }
  };

  // ── 플로팅 런처 ───────────────────────────────────────────────────────
  function ensureLauncher() {
    if (document.getElementById("ytr-launch")) return;
    const b = document.createElement("button");
    b.id = "ytr-launch";
    b.textContent = STR.launcher;
    b.addEventListener("click", openPanel);
    document.body.appendChild(b);
  }

  // ── 패널 (헤더 + 포맷바 + 상태줄 + 결과) ──────────────────────────────
  function ensurePanel() {
    let panel = document.getElementById("ytr-panel");
    if (panel) return panel;

    panel = document.createElement("div");
    panel.id = "ytr-panel";

    // 헤더
    const bar = document.createElement("div");
    bar.id = "ytr-bar";
    const title = document.createElement("span");
    title.id = "ytr-title";
    title.textContent = "Quillcast";
    const copy = document.createElement("button");
    copy.id = "ytr-copy";
    copy.textContent = STR.copy;
    copy.onclick = () => {
      const ta = document.getElementById("ytr-text");
      if (!ta.value) return;
      ta.select();
      document.execCommand("copy");
      copy.textContent = STR.copied;
      setTimeout(() => (copy.textContent = STR.copy), 1200);
    };
    const regen = document.createElement("button");
    regen.id = "ytr-regen";
    regen.textContent = STR.redo;
    regen.title = STR.redoTitle;
    regen.onclick = () => {
      if (current && current.fmt !== "raw")
        runFormat(current.fmt, current.label, true);
    };
    const close = document.createElement("button");
    close.id = "ytr-close";
    close.textContent = "✕";
    close.onclick = () => panel.remove();
    bar.append(title, regen, copy, close);

    // 포맷 선택 바
    const fmts = document.createElement("div");
    fmts.id = "ytr-formats";
    for (const f of FORMATS) {
      const b = document.createElement("button");
      b.className = "ytr-fmt";
      b.dataset.fmt = f.fmt;
      b.textContent = f.label;
      b.addEventListener("click", () => runFormat(f.fmt, f.label));
      fmts.appendChild(b);
    }

    // 출력 언어 드롭다운 (기본: 영상 언어 자동)
    const langSel = document.createElement("select");
    langSel.id = "ytr-lang";
    langSel.title = STR.langTitle;
    for (const L of LANGS) {
      const o = document.createElement("option");
      o.value = L.v;
      o.textContent = L.label;
      langSel.appendChild(o);
    }
    langSel.value = lang;
    langSel.addEventListener("change", () => {
      lang = langSel.value;
      // 이미 생성한 포맷이 떠 있으면 새 언어로 자동 재생성 (raw 제외)
      if (!busy && current && current.fmt !== "raw")
        runFormat(current.fmt, current.label);
    });
    fmts.appendChild(langSel);

    // 상태/로딩 줄
    const status = document.createElement("div");
    status.id = "ytr-status";
    status.style.display = "none";

    // 결과
    const ta = document.createElement("textarea");
    ta.id = "ytr-text";
    ta.readOnly = true;
    ta.placeholder = STR.placeholder;

    panel.append(bar, fmts, status, ta, buildProPanel(), buildPlanBar());
    document.body.appendChild(panel);
    return panel;
  }

  function openPanel() {
    ensurePanel().style.display = "flex";
  }

  function setStatus(text, spinning) {
    const s = document.getElementById("ytr-status");
    if (!s) return;
    if (!text) {
      s.style.display = "none";
      s.innerHTML = "";
      return;
    }
    s.style.display = "flex";
    s.innerHTML =
      (spinning ? '<span class="ytr-spinner"></span>' : "") +
      `<span>${text}</span>`;
  }

  function setActive(fmt) {
    document
      .querySelectorAll(".ytr-fmt")
      .forEach((b) => b.classList.toggle("active", b.dataset.fmt === fmt));
  }

  function setBusy(b) {
    busy = b;
    document.querySelectorAll(".ytr-fmt").forEach((btn) => (btn.disabled = b));
    const rg = document.getElementById("ytr-regen");
    if (rg) rg.disabled = b;
    const ls = document.getElementById("ytr-lang");
    if (ls) ls.disabled = b;
  }

  // ── 라이선스(유료) 키 저장/조회 — background.js가 읽어 서버에 전송 ──────
  async function getLicense() {
    const { quillcastLicense } = await chrome.storage.local.get("quillcastLicense");
    return quillcastLicense || "";
  }
  async function setLicense(key) {
    if (key) await chrome.storage.local.set({ quillcastLicense: key });
    else await chrome.storage.local.remove("quillcastLicense");
  }

  // ── Pro(구독) 패널: 구독 버튼 + 라이선스 키 입력. 검증은 서버가 함. ────
  function buildProPanel() {
    const wrap = document.createElement("div");
    wrap.id = "ytr-propanel";
    wrap.style.cssText =
      "display:none;flex-direction:column;gap:6px;padding:8px;border-top:1px solid rgba(0,0,0,.1);font-size:12px;";

    const desc = document.createElement("div");
    desc.textContent = STR.proDesc(PRICE);

    const sub = document.createElement("button");
    sub.className = "ytr-fmt";
    sub.textContent = STR.subscribe;
    sub.onclick = () => window.open(CHECKOUT_URL, "_blank");

    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:4px;";
    const input = document.createElement("input");
    input.id = "ytr-license";
    input.type = "text";
    input.placeholder = STR.licensePlaceholder;
    input.style.cssText = "flex:1;min-width:0;";
    const save = document.createElement("button");
    save.className = "ytr-fmt";
    save.textContent = STR.saveLicense;
    const msg = document.createElement("div");
    msg.style.cssText = "opacity:.8;";
    save.onclick = async () => {
      const v = input.value.trim();
      await setLicense(v);
      msg.textContent = v ? STR.licenseSaved : STR.licenseCleared;
      setPlan(v ? { plan: "pro" } : null); // 상태바 즉시 갱신
    };
    row.append(input, save);

    wrap.append(desc, sub, row, msg);
    getLicense().then((k) => {
      if (k) {
        input.value = k;
        msg.textContent = STR.licenseSaved;
      }
    });
    return wrap;
  }

  function toggleProPanel(forceOpen) {
    const p = document.getElementById("ytr-propanel");
    if (!p) return;
    p.style.display =
      forceOpen || p.style.display === "none" ? "flex" : "none";
  }

  // ── 하단 플랜 상태바: 현재 플랜·잔여 + 업그레이드 버튼 (항상 보임) ──────
  function setPlan(info) {
    const label = document.getElementById("ytr-plan-label");
    const btn = document.getElementById("ytr-plan-btn");
    if (!label || !btn) return;
    if (info?.plan === "pro") {
      label.textContent = STR.planPro;
      btn.textContent = STR.manageKey;
    } else if (info && typeof info.used === "number") {
      label.textContent = STR.planFreeUsed(info.used, info.limit);
      btn.textContent = STR.subscribeShort;
    } else {
      label.textContent = STR.planFree;
      btn.textContent = STR.subscribeShort;
    }
  }

  function buildPlanBar() {
    const bar = document.createElement("div");
    bar.id = "ytr-plan";
    bar.style.cssText =
      "display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 10px;border-top:1px solid rgba(0,0,0,.12);font-size:12px;";
    const label = document.createElement("span");
    label.id = "ytr-plan-label";
    const btn = document.createElement("button");
    btn.id = "ytr-plan-btn";
    btn.className = "ytr-fmt";
    btn.onclick = () => toggleProPanel();
    bar.append(label, btn);
    // 초기: 저장된 키 있으면 Pro로, 없으면 무료로 표시 (첫 생성 후 서버 응답으로 정정)
    getLicense().then((k) => setPlan(k ? { plan: "pro" } : null));
    return bar;
  }

  // ── 자막 확보 (영상당 1회 추출 후 캐시) ───────────────────────────────
  async function ensureTranscript() {
    const vid = getVideoId();
    if (transcriptCache?.ok && transcriptCache.videoId === vid)
      return transcriptCache;
    setStatus(STR.fetching, true);
    const r = await getTranscript();
    if (!r.ok) return { ok: false, reason: r.reason };
    transcriptCache = {
      ok: true,
      videoId: vid,
      text: r.text,
      via: r.via,
      count: r.count,
    };
    return transcriptCache;
  }

  // ── 포맷 실행 (포맷 클릭 핸들러) ──────────────────────────────────────
  async function runFormat(fmt, label, force = false) {
    if (busy) return;
    openPanel();
    setActive(fmt);
    current = { fmt, label };
    setBusy(true);
    const ta = document.getElementById("ytr-text");
    try {
      const t = await ensureTranscript();
      if (!t.ok) {
        setStatus(STR.transcriptFail(t.reason), false);
        return;
      }

      if (fmt === "raw") {
        ta.value = t.text;
        setStatus(STR.rawMeta(t.via, t.count, t.text.length), false);
        return;
      }

      // 같은 영상·포맷·언어를 이미 생성했으면 저장된 결과 즉시 표시 (force일 때만 재생성)
      const cacheKey = `${t.videoId}:${fmt}:${lang}`;
      if (!force && outputCache[cacheKey]) {
        ta.value = outputCache[cacheKey];
        setStatus(STR.cached(label), false);
        return;
      }

      setStatus(STR.generating(label), true);
      ta.value = "";
      const meta = getVideoMeta();
      const resp = await sendGenerate(fmt, t.text, meta);
      if (resp.plan) setPlan(resp); // 응답의 플랜·잔여 정보로 상태바 갱신
      if (!resp.ok) {
        setStatus(STR.errors[resp.code] || STR.errors.upstream, false);
        if (resp.code === "limit") toggleProPanel(true); // 무료 소진 → 구독 패널 열기
        return;
      }
      outputCache[cacheKey] = resp.text;
      ta.value = resp.text;
      setStatus(STR.done(label, t.text.length, resp.text.length), false);
    } finally {
      setBusy(false);
    }
  }

  function sendGenerate(format, transcript, meta) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          type: "YTR_GENERATE",
          format,
          lang,
          transcript,
          title: meta.title,
          channel: meta.channel,
        },
        (resp) => {
          if (chrome.runtime.lastError) {
            console.warn("[quillcast] comms error:", chrome.runtime.lastError.message);
            resolve({ ok: false, code: "comms" });
            return;
          }
          resolve(resp || { ok: false, code: "no_response" });
        }
      );
    });
  }

  // ── 영상 제목 / 채널 추출 (LLM 맥락 주입용) ────────────────────────
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

  // ── 자막 추출 (Promise): timedtext → 실패/무응답 시 DOM 스크랩 ─────────
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
          finish({ ok: true, text: d.text, via: `timedtext/${d.lang}`, count: d.count });
          return;
        }
        const r = await scrapeFromDOM();
        finish(
          r.ok
            ? { ok: true, text: r.text, via: "DOM", count: r.count }
            : { ok: false, reason: `timedtext:${d.reason} / DOM:${r.reason}` }
        );
      };
      window.addEventListener("message", onMsg);

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

  // ── DOM 자막 패널 스크랩 fallback ─────────────────────────────────────
  async function scrapeFromDOM() {
    try {
      const SEG_SEL =
        "transcript-segment-view-model, ytd-transcript-segment-renderer";

      if (document.querySelectorAll(SEG_SEL).length === 0) {
        const expand = document.querySelector(
          "ytd-text-inline-expander #expand, tp-yt-paper-button#expand, #description #expand"
        );
        if (expand) {
          expand.click();
          await sleep(400);
        }
        let btn = findTranscriptButton();
        if (!btn) {
          await sleep(700);
          btn = findTranscriptButton();
        }
        if (!btn) return { ok: false, reason: "NO_TRANSCRIPT_BUTTON" };
        btn.click();
      }

      let segs = [];
      for (let i = 0; i < 30; i++) {
        segs = document.querySelectorAll(SEG_SEL);
        if (segs.length) break;
        await sleep(300);
      }
      if (!segs.length) return { ok: false, reason: "NO_SEGMENTS" };

      const lines = [...segs]
        .map((s) => {
          const el = s.querySelector(".segment-text");
          let txt = el ? el.textContent : s.innerText || "";
          txt = txt
            .replace(/\d+\s*분(?:\s*\d+\s*초)?/g, " ")
            .replace(/\d+\s*초/g, " ")
            .replace(/\d{1,2}:\d{2}(?::\d{2})?/g, " ")
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
    const sec = document.querySelector(
      "ytd-video-description-transcript-section-renderer button, " +
        "ytd-video-description-transcript-section-renderer ytd-button-renderer button"
    );
    if (sec) return sec;

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
  ensureLauncher();
  const obs = new MutationObserver(() => ensureLauncher());
  obs.observe(document.body, { childList: true, subtree: true });
})();
