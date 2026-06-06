# Quillcast 배포 가이드 (P3 ①)

> 목표: 로컬 서버(`localhost:3000`) 대신 **Vercel에 올려서** 누구나·항상 쓸 수 있게 + Gemini 무료 20회/일 한도 풀기.
> 대부분 **한 번만** 하는 계정 세팅이다.

---

## 0. 준비 (Gemini 키 새로 발급 — 권장)

기존 키(`AQ.Ab8...`)는 예전에 채팅에 노출됐다. 출시 전 **새 키로 교체**한다.

1. https://aistudio.google.com/apikey 접속
2. 노출된 기존 키 **삭제(Revoke)**
3. **Create API key** → 새 키 복사 (이 키를 Vercel에만 넣는다. 코드/깃엔 절대 X)

> ⚠️ 무료 등급은 `gemini-2.5-flash` 하루 20회. 실사용하려면 **결제(billing) 활성화** 필요 → 아래 4번.

---

## 1. Vercel 로그인 (터미널, 한 번만)

`C:\git\quillcast` 에서:

```
npx vercel login
```

- 이메일/깃허브 등 로그인 방법 고르면 브라우저로 인증창이 뜬다. 인증 완료하면 끝.

---

## 2. 배포

```
npx vercel --prod
```

- 처음이면 몇 가지 물어본다 → 전부 기본값(Enter):
  - `Set up and deploy?` → **Y**
  - `Which scope?` → 본인 계정
  - `Link to existing project?` → **N**
  - `Project name?` → **quillcast** (Enter)
  - `In which directory is your code?` → **./** (Enter)
- 끝나면 배포 주소가 나온다. 예: `https://quillcast-xxxx.vercel.app`
  → **이 주소를 메모.** (Claude에게 알려주면 익스텐션 코드에 박아준다)

---

## 3. Vercel에 API 키 넣기 (env)

```
npx vercel env add GEMINI_API_KEY
```

- `Value?` → 0번에서 만든 **새 키** 붙여넣기
- 적용 환경 → **Production** 선택 (Space로 체크 → Enter)
- 그 후 한 번 더 배포해서 키 반영:

```
npx vercel --prod
```

> 확인: `https://<주소>/api/generate` 에 POST가 오면 됨. (Claude가 익스텐션 연결 후 같이 테스트)

---

## 4. Gemini 결제 활성화 (무료 20회/일 풀기)

실사용 전 필수. **idle 0 / 사용한 만큼만 과금** (생성 1회 ≈ 1센트 미만).

1. https://aistudio.google.com/apikey → 해당 키의 프로젝트
2. **Set up Billing** (또는 Google Cloud Console → Billing) → 카드 등록
3. 결제 계정 연결되면 무료 한도 제한이 유료 한도로 바뀜 (RPM/RPD 대폭 ↑)

> 결제 안 켜도 배포는 됨 — 단 하루 20회 넘으면 429. 출시 직전에 켜면 됨.

---

## 5. 익스텐션을 배포 주소로 전환 (Claude가 처리)

배포 주소(2번)를 알려주면 Claude가:
- `background.js`의 `API_BASE`를 `http://localhost:3000` → `https://<주소>` 로 변경
- `manifest.json` `host_permissions`를 `https://*.vercel.app/*` → 정확한 `https://<주소>/*` 로 좁힘
- 익스텐션 리로드 후 실서버로 e2e 테스트

---

## 로컬 개발로 되돌리고 싶을 때

`background.js`의 `API_BASE`를 `http://localhost:3000` 으로 두고
`node scratch/local-server.mjs` 실행하면 로컬 서버로 동작 (배포와 무관하게 개발용).
