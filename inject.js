// inject.js — MAIN world (페이지 컨텍스트에서 실행)
// 유튜브가 페이지에 이미 로딩해둔 자막 데이터를 읽어서 content.js로 넘긴다.
// content.js(ISOLATED world)는 window.ytInitialPlayerResponse 같은 페이지 변수에 접근 못 하므로
// 이 스크립트가 MAIN world에서 대신 읽고 window.postMessage로 전달한다.

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

  async function fetchTranscript(baseUrl) {
    // fmt=json3 → 타임스탬프 포함 구조화 JSON
    const url = baseUrl + (baseUrl.includes("fmt=") ? "" : "&fmt=json3");
    const res = await fetch(url);
    if (!res.ok) throw new Error("timedtext HTTP " + res.status);
    const data = await res.json();
    const events = data.events || [];
    const segments = events
      .filter((ev) => Array.isArray(ev.segs))
      .map((ev) => ({
        t: Math.round((ev.tStartMs || 0) / 1000),
        text: ev.segs
          .map((s) => s.utf8 || "")
          .join("")
          .replace(/\n/g, " "),
      }))
      .filter((s) => s.text.trim().length > 0);

    const plain = segments
      .map((s) => s.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    return { plain, segments };
  }

  window.addEventListener("message", async (e) => {
    if (e.source !== window) return;
    if (e.data?.type !== "YTR_GET_TRANSCRIPT") return;

    try {
      const tracks = findCaptionTracks();
      if (!tracks || !tracks.length) {
        window.postMessage({ type: "YTR_TRANSCRIPT", error: "NO_CAPTIONS" }, "*");
        return;
      }
      const track = pickTrack(tracks);
      const { plain, segments } = await fetchTranscript(track.baseUrl);
      if (!plain) {
        window.postMessage({ type: "YTR_TRANSCRIPT", error: "EMPTY" }, "*");
        return;
      }
      window.postMessage(
        {
          type: "YTR_TRANSCRIPT",
          text: plain,
          lang: track.languageCode || "?",
          count: segments.length,
        },
        "*"
      );
    } catch (err) {
      window.postMessage(
        { type: "YTR_TRANSCRIPT", error: String(err && err.message ? err.message : err) },
        "*"
      );
    }
  });
})();
