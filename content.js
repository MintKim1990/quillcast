// content.js — ISOLATED world
// 플로팅 런처 버튼 1개 → 패널 열기. 패널 안에서 포맷(뉴스레터/블로그/트윗/설명란/원본)을 골라 생성.
// 흐름: 자막 추출(timedtext → 실패 시 DOM 스크랩) → background.js → 서버(LLM) → 패널 표시.
// 자막은 영상당 1회만 추출해 캐시 → 포맷 전환 시 재추출 없이 변환만 다시 한다.

(function () {
  if (window.__ytrLoaded) return;
  window.__ytrLoaded = true;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // LemonSqueezy 구독 체크아웃 URL — 라이브 상품 "Quillcast Pro" Buy link.
  const CHECKOUT_URL =
    "https://quillcast.lemonsqueezy.com/checkout/buy/36ab2884-c5d5-4b89-bc28-803765497091";
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
      transcriptNone:
        "이 영상은 자막이 없어 변환할 수 없어요. (라이브 방송이거나 자막 미제공 영상이에요)",
      transcriptError:
        "자막을 가져오지 못했어요. 페이지를 새로고침한 뒤 다시 시도해주세요.",
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
      collapse: "패널 접기",
      expandPanel: "펼치기",
      maximize: "크게 보기",
      unmaximize: "원래 크기로",
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
      transcriptNone:
        "This video has no captions to convert. (It may be a live stream or a video without subtitles.)",
      transcriptError:
        "Couldn't fetch the captions. Try refreshing the page and trying again.",
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
      collapse: "Collapse panel",
      expandPanel: "Expand panel",
      maximize: "Maximize",
      unmaximize: "Restore size",
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
  let currentKey = null; // 지금 textarea에 떠 있는 출력의 캐시 키 — 사용자가 편집하면 캐시에 반영 (raw/에러는 null)

  const getVideoId = () => {
    try {
      return new URLSearchParams(location.search).get("v") || "";
    } catch {
      return "";
    }
  };

  // ── 플로팅 런처 ───────────────────────────────────────────────────────
  // 발견 전엔 풀 버튼(존재감), 발견(첫 패널 오픈) 후엔 미니 칩(시청 방해 최소화).
  let discovered = false; // quillcastDiscovered 캐시 — storage가 비동기라 한 번 읽어 보관
  let idleTimer = null;
  chrome.storage.local.get("quillcastDiscovered", (o) => {
    discovered = !!(o && o.quillcastDiscovered);
    if (discovered) scheduleCollapse();
  });

  // 4초 뒤 미니 칩("✍️")으로 접는다 (호버 시 CSS가 펼침). 이미 칩이면 그대로 둔다.
  function scheduleCollapse() {
    const b = document.getElementById("ytr-launch");
    if (!b || b.classList.contains("ytr-idle")) return;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      document.getElementById("ytr-launch")?.classList.add("ytr-idle");
    }, 4000);
  }

  function ensureLauncher() {
    if (document.getElementById("ytr-launch")) return;
    const b = document.createElement("button");
    b.id = "ytr-launch";
    b.textContent = STR.launcher;
    b.addEventListener("click", () => {
      // 드래그로 옮긴 직후에 따라오는 click은 패널 열기로 치지 않는다
      if (b.dataset.dragged === "1") return;
      openPanel();
    });
    initLauncherDrag(b);
    document.body.appendChild(b);
    restoreLauncherPos(b);
    if (discovered) scheduleCollapse();
  }

  // 런처도 드래그로 이동 가능 — 6px 이상 움직여야 드래그로 판정(그 미만은 클릭).
  // 유튜브 하단 UI를 가릴 때 치울 수 있게. 위치는 storage에 기억.
  function initLauncherDrag(b) {
    let down = false, moved = false, px = 0, py = 0, ox = 0, oy = 0;
    b.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      b.dataset.dragged = ""; // 이전 드래그 잔상 해제 (pointercancel로 click이 안 왔던 경우)
      down = true; moved = false;
      px = e.clientX; py = e.clientY;
      const r = b.getBoundingClientRect();
      ox = r.left; oy = r.top;
    });
    b.addEventListener("pointermove", (e) => {
      if (!down || !(e.buttons & 1)) return;
      if (!moved) {
        if (Math.abs(e.clientX - px) + Math.abs(e.clientY - py) < 6) return;
        moved = true;
        b.dataset.dragged = "1";
        b.style.right = "auto";
        b.style.bottom = "auto";
        b.setPointerCapture(e.pointerId);
      }
      b.style.left = Math.min(Math.max(ox + e.clientX - px, 4), innerWidth - 48) + "px";
      b.style.top = Math.min(Math.max(oy + e.clientY - py, 4), innerHeight - 44) + "px";
    });
    const end = (e) => {
      if (!down) return;
      down = false;
      try { b.releasePointerCapture(e.pointerId); } catch {}
      if (moved)
        chrome.storage.local.set({
          quillcastLauncher: { x: b.offsetLeft, y: b.offsetTop },
        });
    };
    b.addEventListener("pointerup", end);
    b.addEventListener("pointercancel", end);
  }

  function restoreLauncherPos(b) {
    chrome.storage.local.get("quillcastLauncher", (o) => {
      const s = o && o.quillcastLauncher;
      if (!s) return;
      b.style.left = Math.min(Math.max(s.x, 4), innerWidth - 48) + "px";
      b.style.top = Math.min(Math.max(s.y, 4), innerHeight - 44) + "px";
      b.style.right = "auto";
      b.style.bottom = "auto";
    });
  }

  // ── 패널 위치/크기 기억 ───────────────────────────────────────────────
  // moved/sized 플래그가 없으면 기본 앵커(우하단 fixed)를 유지해 창 크기가
  // 바뀌어도 구석에 붙어 있게 하고, 사용자가 옮기거나 늘린 뒤에만 좌표를 고정한다.
  function savePanelState(panel) {
    chrome.storage.local.set({
      quillcastPanel: {
        x: panel.offsetLeft,
        y: panel.offsetTop,
        w: panel.offsetWidth,
        h: panel.offsetHeight,
        moved: panel.dataset.moved === "1",
        sized: panel.dataset.sized === "1",
      },
    });
  }

  function restorePanelState(panel) {
    chrome.storage.local.get("quillcastPanel", (o) => {
      const s = o && o.quillcastPanel;
      if (!s) return;
      if (s.sized) {
        panel.dataset.sized = "1";
        if (s.w) panel.style.width = Math.min(s.w, innerWidth * 0.95) + "px";
        if (s.h) panel.style.height = Math.min(s.h, innerHeight * 0.9) + "px";
      }
      if (s.moved) {
        panel.dataset.moved = "1";
        // 모니터/창 크기가 달라졌어도 헤더는 항상 잡을 수 있게 클램프
        panel.style.left =
          Math.min(Math.max(s.x, 80 - panel.offsetWidth), innerWidth - 80) + "px";
        panel.style.top = Math.min(Math.max(s.y, 0), innerHeight - 48) + "px";
        panel.style.right = "auto";
        panel.style.bottom = "auto";
      }
    });
  }

  const PANEL_MIN_W = 320, PANEL_MIN_H = 200; // panel.css의 min-width/min-height와 동일

  function initPanelInteractions(panel, bar) {
    // 드래그 이동 — 헤더가 핸들. 버튼/셀렉트 클릭은 드래그로 취급하지 않는다.
    let dragging = false, sx = 0, sy = 0, sl = 0, st = 0;
    bar.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button, select, input")) return;
      if (panel.classList.contains("ytr-max")) return; // 확대 모드는 중앙 고정
      // 텍스트 선택·네이티브 드래그 차단 — 이게 끼어들면 pointerup 대신
      // pointercancel이 와서 드래그 상태가 안 풀린다(유령 드래그).
      e.preventDefault();
      const r = panel.getBoundingClientRect();
      // 우하단 앵커 → 좌상단 좌표로 전환해야 드래그 중 크기 흔들림이 없다
      panel.style.left = r.left + "px";
      panel.style.top = r.top + "px";
      panel.style.right = "auto";
      panel.style.bottom = "auto";
      sx = e.clientX; sy = e.clientY; sl = r.left; st = r.top;
      dragging = true;
      bar.setPointerCapture(e.pointerId);
    });
    bar.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      if (!(e.buttons & 1)) { dragging = false; return; } // 버튼 안 눌린 move = 유령 드래그 차단
      const w = panel.offsetWidth;
      panel.style.left =
        Math.min(Math.max(sl + e.clientX - sx, 80 - w), innerWidth - 80) + "px";
      panel.style.top =
        Math.min(Math.max(st + e.clientY - sy, 0), innerHeight - 48) + "px";
    });
    const endDrag = (e) => {
      if (!dragging) return;
      dragging = false;
      try { bar.releasePointerCapture(e.pointerId); } catch {}
      panel.dataset.moved = "1";
      savePanelState(panel);
    };
    bar.addEventListener("pointerup", endDrag);
    bar.addEventListener("pointercancel", endDrag);

    // 크기 조절 — 4변 + 4모서리 핸들. 잡은 변의 반대쪽을 고정하고 늘인다.
    for (const dir of ["n", "s", "e", "w", "ne", "nw", "se", "sw"]) {
      const grip = document.createElement("div");
      grip.className = "ytr-rs ytr-rs-" + dir;
      grip.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const r = panel.getBoundingClientRect();
        panel.style.left = r.left + "px";
        panel.style.top = r.top + "px";
        panel.style.right = "auto";
        panel.style.bottom = "auto";
        const gx = e.clientX, gy = e.clientY;
        const g = { l: r.left, t: r.top, w: r.width, h: r.height };
        const move = (ev) => {
          if (!(ev.buttons & 1)) return end(ev);
          let w2 = g.w, h2 = g.h;
          // 늘어나는 쪽이 화면 밖으로 8px 이상 못 나가게 방향별로 클램프
          if (dir.includes("e")) w2 = Math.min(g.w + ev.clientX - gx, innerWidth - g.l - 8);
          if (dir.includes("w")) w2 = Math.min(g.w - (ev.clientX - gx), g.l + g.w - 8);
          if (dir.includes("s")) h2 = Math.min(g.h + ev.clientY - gy, innerHeight - g.t - 8);
          if (dir.includes("n")) h2 = Math.min(g.h - (ev.clientY - gy), g.t + g.h - 8);
          w2 = Math.max(w2, PANEL_MIN_W);
          h2 = Math.max(h2, PANEL_MIN_H);
          if (dir.includes("w")) panel.style.left = g.l + g.w - w2 + "px";
          if (dir.includes("n")) panel.style.top = g.t + g.h - h2 + "px";
          panel.style.width = w2 + "px";
          panel.style.height = h2 + "px";
        };
        const end = (ev) => {
          grip.removeEventListener("pointermove", move);
          grip.removeEventListener("pointerup", end);
          grip.removeEventListener("pointercancel", end);
          try { grip.releasePointerCapture(ev.pointerId); } catch {}
          panel.dataset.sized = "1";
          panel.dataset.moved = "1"; // 좌상단 앵커로 전환됐으니 위치도 함께 기억
          savePanelState(panel);
        };
        grip.addEventListener("pointermove", move);
        grip.addEventListener("pointerup", end);
        grip.addEventListener("pointercancel", end);
        grip.setPointerCapture(e.pointerId);
      });
      panel.appendChild(grip);
    }
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
    const minBtn = document.createElement("button");
    minBtn.id = "ytr-min";
    minBtn.textContent = "–";
    minBtn.title = STR.collapse;
    minBtn.onclick = () => {
      panel.classList.remove("ytr-max");
      maxBtn.title = STR.maximize;
      const collapsed = panel.classList.toggle("ytr-collapsed");
      minBtn.textContent = collapsed ? "▣" : "–";
      minBtn.title = collapsed ? STR.expandPanel : STR.collapse;
    };
    const maxBtn = document.createElement("button");
    maxBtn.id = "ytr-max";
    maxBtn.textContent = "⛶";
    maxBtn.title = STR.maximize;
    maxBtn.onclick = () => {
      panel.classList.remove("ytr-collapsed");
      minBtn.textContent = "–";
      minBtn.title = STR.collapse;
      const maxed = panel.classList.toggle("ytr-max");
      maxBtn.title = maxed ? STR.unmaximize : STR.maximize;
    };
    const close = document.createElement("button");
    close.id = "ytr-close";
    close.textContent = "✕";
    close.onclick = () => panel.remove();
    bar.append(title, regen, copy, minBtn, maxBtn, close);

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

    // 결과 — 편집 가능. 고친 내용은 캐시에도 반영돼 포맷을 오가도 유지된다.
    const ta = document.createElement("textarea");
    ta.id = "ytr-text";
    ta.placeholder = STR.placeholder;
    ta.addEventListener("input", () => {
      if (currentKey) outputCache[currentKey] = ta.value;
    });

    panel.append(bar, fmts, status, ta, buildProPanel(), buildPlanBar());
    document.body.appendChild(panel);
    initPanelInteractions(panel, bar);
    restorePanelState(panel);
    return panel;
  }

  function openPanel() {
    // 버튼을 발견해 열어봤다는 표시 — 지금부터 런처가 미니 칩으로 접힌다.
    discovered = true;
    chrome.storage.local.set({ quillcastDiscovered: true });
    scheduleCollapse();
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
    const bar = document.getElementById("ytr-plan");
    const label = document.getElementById("ytr-plan-label");
    const btn = document.getElementById("ytr-plan-btn");
    if (!bar || !label || !btn) return;
    let exhausted = false;
    if (info?.plan === "pro") {
      label.textContent = STR.planPro;
      btn.textContent = STR.manageKey;
    } else if (info && typeof info.used === "number") {
      label.textContent = STR.planFreeUsed(info.used, info.limit);
      btn.textContent = STR.subscribeShort;
      exhausted = info.used >= info.limit; // 무료 소진 → 구독 버튼 강조
    } else {
      label.textContent = STR.planFree;
      btn.textContent = STR.subscribeShort;
    }
    bar.classList.toggle("ytr-exhausted", exhausted);
    btn.classList.toggle("ytr-cta", exhausted);
  }

  function buildPlanBar() {
    const bar = document.createElement("div");
    bar.id = "ytr-plan";
    // padding 오른쪽 20px = 패널 우하단 리사이즈 그립과 버튼이 겹치지 않게
    bar.style.cssText =
      "display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 20px 6px 10px;border-top:1px solid rgba(0,0,0,.12);font-size:12px;";
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
    currentKey = null; // 성공적으로 출력이 뜰 때만 다시 세팅 (편집 동기화 대상 지정)
    setBusy(true);
    const ta = document.getElementById("ytr-text");
    try {
      const t = await ensureTranscript();
      if (!t.ok) {
        console.debug("[Quillcast] transcript fail:", t.reason);
        // 자막 트랙/패널/세그먼트가 아예 없으면 "자막 미제공" 안내,
        // 그 밖의 통신·파싱·타임아웃 오류는 "재시도" 안내.
        const noSub =
          /NO_TRANSCRIPT_BUTTON|NO_SEGMENTS|EMPTY_SEGMENTS|NO_TRACKS|EMPTY_BODY|EMPTY_PARSED/.test(
            String(t.reason || "")
          );
        setStatus(noSub ? STR.transcriptNone : STR.transcriptError, false);
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
        currentKey = cacheKey;
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
      currentKey = cacheKey;
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

  // YouTube는 SPA — 홈/검색에서 영상을 클릭해도 문서가 새로 로드되지 않는다.
  // 그래서 유튜브 전체에 주입해두고(manifest matches), watch 페이지 여부에 따라
  // 런처를 넣고 뺀다. (v1.0.2 수정: 이전엔 /watch 직접 진입·새로고침시에만 버튼이 떴음)
  const isWatchPage = () => location.pathname === "/watch" && !!getVideoId();

  let lastVid = null; // 영상 전환 감지용 (MutationObserver가 syncUI를 상시 호출하므로 전환시에만 반응)
  function syncUI() {
    if (isWatchPage()) {
      ensureLauncher();
      const vid = getVideoId();
      if (vid !== lastVid) {
        lastVid = vid;
        // 영상→영상 SPA 전환은 런처가 재생성되지 않아 ensureLauncher의 접기가 안 걸림 → 여기서 보장
        if (discovered) scheduleCollapse();
      }
    } else {
      lastVid = null;
      document.getElementById("ytr-launch")?.remove();
      const p = document.getElementById("ytr-panel");
      if (p) p.style.display = "none"; // 영상을 벗어나면 패널도 접는다 (다시 열면 flex 복원)
    }
  }

  syncUI();
  // yt-navigate-finish = 유튜브가 SPA 네비게이션 완료 시 쏘는 이벤트 (즉각 반응용)
  document.addEventListener("yt-navigate-finish", syncUI);
  // MutationObserver = 이벤트를 못 받는 경우의 안전망 (유튜브 DOM은 상시 변해 자주 불린다)
  const obs = new MutationObserver(syncUI);
  obs.observe(document.body, { childList: true, subtree: true });
})();
