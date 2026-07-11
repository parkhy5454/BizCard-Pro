<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# BizCard Pro AI

명함 스캔/CRM + 통합 차량 관리 + 업무일지를 하나로 묶은 앱입니다. 원래 Google AI Studio에서 생성되어 Firebase(Firestore)를 사용하도록 스캐폴딩되어 있었으나, **이번 작업으로 데이터 저장소를 Supabase(Postgres)로 교체**했습니다.

## ⚠️ 이번 변경에서 함께 고친 부분

마이그레이션 과정에서 확인해보니, 원본 코드는 스코프(회사/개인별 데이터 구획)를 해석하는 미들웨어가 실제로 라우트에 연결되어 있지 않아서 **모든 API 요청이 매번 빈 데이터로 초기화**되고 있었습니다. 즉 Firebase를 쓰던 시점에도 실제로는 어떤 데이터도 저장되지 않는 상태였습니다. 이번에 Supabase로 옮기면서 이 부분도 같이 고쳐서, 이제는 실제로 데이터가 영구 저장됩니다.

- `app.use(async (req, res, next) => {...})` 미들웨어를 추가해 요청마다 스코프를 올바르게 해석하고 데이터를 로드합니다.
- 명함/그룹/프로젝트/차량/업무일지 등 모든 CRUD 라우트에 실제 Supabase 저장 호출을 추가했습니다.
- 회원가입 시 계정도 이제 Supabase에 영구 저장됩니다 (기존에는 메모리에만 저장되어 서버 재시작 시 사라졌습니다).

## 1. Supabase 프로젝트 준비

1. [supabase.com](https://supabase.com)에서 프로젝트를 새로 만듭니다.
2. 프로젝트 대시보드 → **SQL Editor** → New query에서 이 저장소의 [`supabase-schema.sql`](./supabase-schema.sql) 파일 내용을 전체 붙여넣고 실행합니다. (테이블 3개: `scopes`, `scoped_items`, `app_users`가 생성됩니다.)
3. 프로젝트 대시보드 → **Project Settings → API**에서 아래 두 값을 확인합니다.
   - `Project URL` → `SUPABASE_URL`
   - `service_role` 키 (⚠️ `anon` 키가 아닙니다) → `SUPABASE_SERVICE_ROLE_KEY`

`service_role` 키는 Row Level Security를 우회하는 강력한 키이므로, 반드시 서버(백엔드)에서만 사용하고 절대 프론트엔드 코드나 공개 저장소에 커밋하지 마세요. 이 프로젝트는 `server.ts`(Express 서버)에서만 이 키를 사용하며, 브라우저로는 전달되지 않습니다.

## 2. 로컬 실행

**사전 준비:** Node.js 18+

1. 의존성 설치:
   ```
   npm install
   ```
2. `.env.example`을 `.env`로 복사하고 값을 채웁니다:
   ```
   cp .env.example .env
   ```
   - `GEMINI_API_KEY`: 명함 OCR / 영수증 스캔 / 업무일지 AI 정제 기능에 사용 (없어도 앱은 동작하며, 이 경우 모의 데이터로 대체됩니다)
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`: 위 1단계에서 확인한 값
3. 서버 실행:
   ```
   npm run dev
   ```
4. 브라우저에서 `http://localhost:3000` 접속

## 3. Replit에서 실행

1. 이 저장소(또는 zip)를 Replit에 Import 합니다.
2. Replit의 **Secrets** 탭에서 `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`를 등록합니다. (`.env` 파일 대신 Secrets를 쓰면 됩니다.)
3. Run 버튼을 누르면 `npm install && npm run dev`가 실행됩니다.

## 4. GitHub에 업로드하기

Claude는 여러분의 GitHub 계정에 직접 접근할 수 있는 권한이 없어서 (연결된 GitHub 커넥터가 없다면) 저를 통해 바로 push할 수는 없습니다. 아래 두 방법 중 하나를 사용하세요.

**방법 A — 터미널에서 직접 (가장 간단)**
```bash
cd bizcard-pro-ai   # 압축 해제한 폴더로 이동
git init
git add .
git commit -m "Initial commit: migrate to Supabase"
git branch -M main
git remote add origin https://github.com/[내계정]/[저장소이름].git
git push -u origin main
```
GitHub에서 새 저장소를 먼저 만든 뒤 (Add file 없이 빈 저장소로), 위 명령의 `[내계정]/[저장소이름]` 부분을 실제 값으로 바꿔서 실행하면 됩니다.

**방법 B — GitHub Desktop**
GitHub Desktop 앱에서 "Add local repository"로 이 폴더를 선택 → Publish repository 버튼을 누르면 됩니다.

> `.gitignore`에 `.env`, `node_modules`, `dist`가 이미 포함되어 있어 실수로 API 키나 의존성 파일이 커밋되지 않습니다.

## 아키텍처 메모

- **데이터 모델**: 기존 Firestore의 `scopes/{scopeId}/{collection}/{docId}` 구조를 Postgres의 `scoped_items(scope_id, collection, doc_id, data jsonb)` 테이블 하나로 그대로 옮겼습니다. 회사 단위/개인 단위로 데이터가 분리되는 멀티테넌시 구조는 그대로 유지됩니다.
- **`src/db/supabaseStore.ts`**: 기존 `firebaseStore.ts`와 동일한 함수 시그니처(`getScopedCollection`, `setScopedDoc`, `updateScopedDoc`, `deleteScopedDoc` 등)를 제공하는 드롭인 교체 모듈입니다.
- **`legacy-firebase/`**: 참고용으로 남겨둔 기존 Firebase 코드입니다. 빌드에는 포함되지 않으며 (`tsconfig.json`에서 제외), 필요 없으면 폴더째 삭제해도 됩니다.
- 더 정교한 정규화(엔티티별 전용 테이블/컬럼, 외래키 제약 등)가 필요하다면 `supabase-schema.sql`을 확장하고 `supabaseStore.ts`의 해당 함수를 교체하면 됩니다. 현재는 마이그레이션 범위를 실용적으로 유지하기 위해 범용 JSONB 문서 저장 방식을 사용했습니다.

## Run and deploy your AI Studio app

View your app in AI Studio: https://ai.studio/apps/8d3273f7-7823-40aa-864e-672582fc9ed0
