// inject.js — MAIN world (페이지 컨텍스트에서 실행)
// 유튜브가 페이지에 이미 로딩해둔 자막 데이터를 timedtext로 읽어서 content.js로 넘긴다.
// content.js(ISOLATED world)는 window.ytInitialPlayerResponse 같은 페이지 변수에 접근 못 하므로
// 이 스크립트가 MAIN world에서 대신 읽고 window.postMessage로 전달한다.
// timedtext가 막히면(빈 응답) content.js가 DOM 패널 스크랩 fallback으로 넘어간다.

(function () {
  // 자막 트랙 baseUrl 찾기
  function findCaptionTracks() {
    // 1순위: 페이지가 보유한 플레이어 응답
    let pr = window.ytInitialPlayerResponse;

    // 2순위: SPA 네비게이션 후엔 ytInitialPlayerResponse가 낡았을 수 있음 → 내부 플레이어에서 시도
    if (!pr?.captions) {
      try {
        const movie = document.getElementById("movie_player");
        if (movie && typeof movie.getPlayerResponse === "function") {
          pr = movie.getPlayerResponse();
        }
      } catch (e) {}
    }

    const tracks =
      pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    return Array.isArray(tracks) ? tracks : null;
  }

  function pickTrack(tracks) {
    // 영어 우선, 없으면 첫 트랙. (나중에 언어 선택 UI로 확장)
    return (
      tracks.find((t) => (t.languageCode || "").toLowerCase().startsWith("en")) ||
      tracks[0]
    );
  }

  async function fetchTimedText(baseUrl) {
    // fmt=json3 → 타임스탬프 포함 구조화 JSON
    const url = baseUrl + (baseUrl.includes("fmt=") ? "" : "&fmt=json3");
    let res;
    try {
      res = await fetch(url, { credentials: "include" });
    } catch (e) {
      return { ok: false, reason: "FETCH_FAIL: " + (e?.message || e) };
    }
    const body = await res.text();
    if (!res.ok) return { ok: false, reason: "HTTP " + res.status };
    if (!body || body.trim().length === 0) return { ok: false, reason: "EMPTY_BODY" };

    let data;
    try {
      data = JSON.parse(body);
    } catch (e) {
      return { ok: false, reason: "PARSE_FAIL", sample: body.slice(0, 120) };
    }

    const events = data.events || [];
    const segs = events
      .filter((ev) => Array.isArray(ev.segs))
      .map((ev) =>
        ev.segs
          .map((s) => s.utf8 || "")
          .join("")
          .replace(/\n/g, " ")
      )
      .filter((t) => t.trim().length > 0);

    const plain = segs.join(" ").replace(/\s+/g, " ").trim();
    if (!plain) return { ok: false, reason: "EMPTY_PARSED" };
    return { ok: true, text: plain, count: segs.length };
  }

  window.addEventListener("message", async (e) => {
    if (e.source !== window) return;
    if (e.data?.type !== "YTR_GET_TRANSCRIPT") return;

    try {
      const tracks = findCaptionTracks();
      if (!tracks || !tracks.length) {
        window.postMessage(
          { type: "YTR_TRANSCRIPT", ok: false, reason: "NO_TRACKS" },
          "*"
        );
        return;
      }
      const track = pickTrack(tracks);
      const r = await fetchTimedText(track.baseUrl);
      window.postMessage(
        { type: "YTR_TRANSCRIPT", lang: track.languageCode || "?", ...r },
        "*"
      );
    } catch (err) {
      window.postMessage(
        {
          type: "YTR_TRANSCRIPT",
          ok: false,
          reason: "EXCEPTION: " + (err && err.message ? err.message : err),
        },
        "*"
      );
    }
  });
})();
