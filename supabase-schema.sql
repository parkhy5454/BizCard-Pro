-- BizCard Pro AI — Supabase 스키마
-- Supabase 대시보드의 SQL Editor에 이 파일 전체를 붙여넣고 실행하세요.
-- (Database → SQL Editor → New query → 붙여넣기 → Run)

-- 1) 스코프(회사/개인별 데이터 구획) 메타 테이블
create table if not exists scopes (
  scope_id text primary key,
  initialized boolean not null default true,
  created_at timestamptz not null default now()
);

-- 2) 범용 문서 저장 테이블
--    기존 Firestore의 scopes/{scopeId}/{collection}/{docId} 구조를 그대로 옮긴 형태입니다.
--    contacts, projects, groups, myProfile, vehicles, drivingLogs, expenses,
--    maintenances, maintenanceIntervals, dailyLogs, weeklyLogs 등 모든 컬렉션이
--    이 하나의 테이블에 collection 컬럼으로 구분되어 저장됩니다.
create table if not exists scoped_items (
  scope_id text not null,
  collection text not null,
  doc_id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (scope_id, collection, doc_id)
);

create index if not exists idx_scoped_items_scope_collection
  on scoped_items (scope_id, collection);

-- 3) 로그인 계정 테이블
create table if not exists app_users (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_app_users_email
  on app_users ((data->>'email'));

-- 4) 로그인 세션 테이블
-- [추가] 로그인 세션을 서버 메모리에만 두면, 배포 플랫폼(예: Render 무료/기본 요금제)이
-- 일정 시간 뒤 서버를 재웠다가 다음 요청에 다시 깨울 때(cold start) 메모리가 초기화되면서
-- 로그인 세션이 전부 끊긴다. 접속이 뜸한 모바일에서 특히 자주 겪게 되는 문제라, 세션을
-- 여기 DB에 영구 저장해서 서버가 재시작되어도 로그인이 유지되게 한다.
create table if not exists app_sessions (
  token text primary key,
  user_id text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_app_sessions_user_id
  on app_sessions (user_id);

-- 5) 관리자 작업 감사 로그
-- [추가] "누가 언제 누구를 관리자로 바꿨는지, 누구를 승인/거절했는지" 같은 민감한 관리자
-- 작업을 기록해서 나중에 문제가 생겼을 때 추적할 수 있게 한다.
create table if not exists audit_logs (
  id bigserial primary key,
  scope_id text not null,
  actor_user_id text not null,
  actor_email text,
  action text not null,
  target_user_id text,
  target_email text,
  detail jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_scope
  on audit_logs (scope_id, created_at desc);

-- ------------------------------------------------------------------
-- Row Level Security
-- 이 앱은 서버(server.ts)가 Service Role Key로만 접근하는 구조이므로
-- (프론트엔드에서 Supabase에 직접 접근하지 않음) RLS를 켜고 별도 정책은
-- 추가하지 않아도 됩니다 — Service Role Key는 RLS를 우회합니다.
-- 다만 실수로 anon/public 키가 노출되었을 때를 대비해 RLS는 켜 둡니다.
-- ------------------------------------------------------------------
alter table scopes enable row level security;
alter table scoped_items enable row level security;
alter table app_users enable row level security;
alter table app_sessions enable row level security;
alter table audit_logs enable row level security;

-- anon/authenticated 역할에는 기본적으로 아무 정책도 부여하지 않습니다.
-- (= Service Role Key가 아니면 접근 불가). 프론트에서 Supabase에 직접
-- 붙는 구조로 바꾸고 싶다면, 이때 scope_id 기준 정책을 별도로 설계해야 합니다.
