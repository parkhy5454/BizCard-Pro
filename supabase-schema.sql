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

-- anon/authenticated 역할에는 기본적으로 아무 정책도 부여하지 않습니다.
-- (= Service Role Key가 아니면 접근 불가). 프론트에서 Supabase에 직접
-- 붙는 구조로 바꾸고 싶다면, 이때 scope_id 기준 정책을 별도로 설계해야 합니다.
