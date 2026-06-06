# Chrome 웹스토어 등록 문구 (P3 ②)

> 웹스토어 개발자 대시보드에 붙여넣을 초안. 영문(글로벌 기본) + 한글.
> 출시 직전 다듬기. 스크린샷·아이콘은 별도(아래 체크리스트).

---

## 이름 (Name)
```
Quillcast — YouTube to Newsletter & Blog
```

## 요약 (Summary, 최대 132자)
```
Turn any YouTube video into a newsletter, blog post, tweet thread, or description — in one click. Powered by AI.
```

## 상세 설명 (Description) — 영문
```
Quillcast turns a YouTube video's transcript into ready-to-use text.

Watching a video you want to repurpose? Click Quillcast and get:
• 📰 Newsletter — a clean, structured issue
• ✍️ Blog post — with headings, in Markdown
• 🐦 Tweet thread — 5–7 hooked tweets
• 📄 Video description — summary + bullets + hashtags

Features
• Works on any video with captions (manual or auto-generated)
• Output language: auto (matches the video) or pick Korean / English / Japanese / Spanish / Chinese — great for translating + repurposing
• One-click copy
• Caches results so switching formats is instant

Perfect for creators, newsletter writers, and marketers who want to repurpose
video content into text without retyping.

Quillcast does not store your data. See our privacy policy for details.
```

## 상세 설명 — 한글
```
유튜브 영상의 자막을 바로 쓸 수 있는 글로 바꿔줍니다.

재활용하고 싶은 영상에서 Quillcast를 누르면:
• 📰 뉴스레터 — 깔끔한 구성
• ✍️ 블로그 글 — 소제목 포함, 마크다운
• 🐦 트윗 스레드 — 훅 있는 5~7개
• 📄 영상 설명란 — 요약 + 불릿 + 해시태그

특징
• 자막(수동·자동) 있는 모든 영상에서 작동
• 출력 언어: 자동(영상 언어) 또는 한국어/English/日本語/Español/中文 선택 — 번역+재활용 동시에
• 원클릭 복사 / 결과 캐싱으로 포맷 전환 즉시

크리에이터·뉴스레터 작가·마케터가 영상을 글로 재활용할 때.
데이터는 저장하지 않습니다. (개인정보 처리방침 참조)
```

## 카테고리
```
Productivity
```

## 개인정보 처리방침 URL
```
https://github.com/MintKim1990/quillcast/blob/main/PRIVACY.md
(또는 배포 후 https://<vercel주소>/PRIVACY 로 서빙)
```

---

## 출시 전 체크리스트 (본인 작업)

- [ ] 크롬 웹스토어 개발자 등록 ($5 일회성) — https://chrome.google.com/webstore/devconsole
- [ ] **아이콘** 16 / 48 / 128 px PNG (이미지 — 제가 못 만듦. Canva/피그마/AI생성 등)
- [ ] **스크린샷** 1280×800 (또는 640×400) 최소 1장 — 패널이 영상 위에 떠서 뉴스레터 보여주는 화면 캡처
- [ ] PRIVACY.md 연락용 이메일 채우기
- [ ] (영문 우선이면) UI 버튼 라벨 영어화 여부 결정
- [ ] manifest 출시용 정리: 이름 "(dev)" 제거 + icons 추가 (Claude가 처리)
- [ ] 패키징 zip 업로드 (`package.ps1` 실행 — Claude가 만들어 둠)
```
```
