# Quillcast 배포 가이드 (P3 ①)

> 목표: 로컬 서버(`localhost:3000`) 대신 **Vercel에 올려서** 누구나·항상 쓸 수 있게 (OpenAI 키는 서버 env에만, 사용한 만큼만 과금).
> 대부분 **한 번만** 하는 계정 세팅이다.

---

## 0. 준비 (OpenAI 키 — 배포용은 Vercel env에만)

OpenAI 키는 이미 발급 + 결제(크레딧) 완료 상태. **배포 키는 Vercel env에만** 넣는다 (코드/깃/채팅엔 절대 X). 채팅 등에 노출된 이력이 있는 키는 새 키로 교체한다.

1. https://platform.openai.com/api-keys 접속
2. 노출 이력 있는 키는 **Revoke**
3. **Create new secret key** → `sk-...` 복사 (이 키를 3번에서 Vercel에만 넣는다)

> OpenAI는 무료 일일 한도 없음(종량제). 생성 1회 ≈ 1센트 미만. 기본 모델 `gpt-4o-mini` (서버 env `OPENAI_MODEL`로 교체 가능).

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
npx vercel env add OPENAI_API_KEY
```

- `Value?` → 0번에서 만든 **새 키** 붙여넣기
- 적용 환경 → **Production** 선택 (Space로 체크 → Enter)
- 그 후 한 번 더 배포해서 키 반영:

```
npx vercel --prod
```

> 확인: `https://<주소>/api/generate` 에 POST가 오면 됨. (Claude가 익스텐션 연결 후 같이 테스트)

---

## 4. OpenAI 결제 (이미 완료)

OpenAI는 종량제 — **idle 0 / 사용한 만큼만 과금** (생성 1회 ≈ 1센트 미만). 카드 등록 + 크레딧 충전은 이미 완료됨.

- 잔액 떨어져 끊기는 게 걱정되면 https://platform.openai.com/settings/organization/billing 에서 **Auto recharge** + **월 한도(Monthly limit)** 설정 권장 (한도 = 폭주/남용 시 비용 상한).
- 사용량/잔액 확인: https://platform.openai.com/usage

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
