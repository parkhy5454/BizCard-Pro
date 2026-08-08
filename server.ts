// [수정] Sentry 초기화를 별도 파일(instrument.ts)로 분리해서, 반드시 이 파일의 맨 첫
// import로 둔다. 아래에서 express 등을 import하기 "전에" Sentry.init()이 실제로 다
// 끝나도록 하기 위함 (같은 파일 안에서 순서만 바꾸는 건 esbuild의 import 호이스팅 때문에
// 소용없었다 — 자세한 이유는 instrument.ts 상단 주석 참고).
import { Sentry, SENTRY_DSN } from './instrument.js';
import express from 'express';
import helmet from 'helmet';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';
import * as XLSX from 'xlsx';
import archiver from 'archiver';

// ------------------------------------------------------------------
// 🚨 자동 에러 모니터링(Sentry) — 초기화 자체는 instrument.ts에서 이미 끝났고,
// 여기서는 기존 console.error 호출을 Sentry로도 함께 보고되게 감싸는 부분만 남는다.
// ------------------------------------------------------------------

// [수정] 코드 곳곳(수백 곳)에 이미 있는 console.error(...) 호출을 하나하나 다 안 고쳐도,
// console.error 자체를 감싸서 "화면(로그)에 찍히는 동시에 Sentry에도 자동으로 보고"되게 만든다.
// 이렇게 하면 오늘까지 쌓인 기존 에러 처리 코드가 전부 자동으로 모니터링 대상이 된다.
const __originalConsoleError = console.error.bind(console);
console.error = (...args: any[]) => {
  __originalConsoleError(...args);
  if (!SENTRY_DSN) return;
  try {
    const errorArg = args.find((a) => a instanceof Error);
    if (errorArg) {
      Sentry.captureException(errorArg, { extra: { logArgs: args.filter((a) => a !== errorArg).map(String) } });
    } else {
      Sentry.captureMessage(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '), 'error');
    }
  } catch {
    // Sentry 보고 자체가 실패해도 서버 동작에는 절대 영향을 주면 안 된다
  }
};

// 어디서도 안 잡힌 예외/프로미스 거부까지 마지막 안전망으로 잡아서 보고
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException] 처리되지 않은 예외:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection] 처리되지 않은 프로미스 거부:', reason);
});

// [수정] Gemini API가 "This model is currently experiencing high demand"(503/UNAVAILABLE) 같은
// 일시적인 과부하 에러를 낼 때가 있다. 이런 경우 사용자에게 바로 에러를 보여주지 않고,
// 짧게 대기했다가 자동으로 한두 번 더 시도해서 대부분의 일시적 실패를 자동으로 넘어가게 한다.
async function generateContentWithRetry(
  ai: any,
  params: any,
  maxRetries: number = 2
): Promise<any> {
  let lastErr: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await ai.models.generateContent(params);
    } catch (err: any) {
      lastErr = err;
      const message = String(err?.message || err || '');
      const isTransient = err?.status === 503 || err?.code === 503 ||
        /UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|overloaded/i.test(message);
      if (!isTransient || attempt === maxRetries) throw err;
      const delayMs = 800 * (attempt + 1); // 800ms, 1600ms ... 점점 늘려가며 재시도
      console.warn(`[Gemini] 일시적 오류로 ${delayMs}ms 후 재시도 (${attempt + 1}/${maxRetries}):`, message.slice(0, 200));
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastErr;
}

import { createServer as createViteServer } from 'vite';
import { scopeIdForUser, decideSignupRoleAndApproval, isEmailVerified } from './src/authLogic.js';
import { RateLimiter } from './src/rateLimiter.js';
import { issueBillingKey, chargeBilling, generateCustomerKey, generateOrderId, addOneMonth } from './src/billing.js';
import { BusinessCard, ContactGroup, CallRecord, Project, ProjectFollowUp, MyProfile, Vehicle, DrivingLog, VehicleExpense, VehicleMaintenance, MaintenanceInterval, DailyWorkLog, WeeklyWorkLog, RegisteredUser, AdvancePaymentSettlement, LeaveRequest, ApprovalStep, FeedbackItem, InviteRecord } from './src/types.js';
import {
  ensureUsersSeeded,
  ensureScopeInitialized,
  getUsers,
  addUser,
  deleteUser,
  deleteScopeCompletely,
  saveSession,
  loadSession,
  deleteSession,
  deleteAllSessionsForUser,
  logAudit,
  getAuditLogs,
  isSupabaseConfigured,
  getScopedCollection,
  getScopedDoc,
  setScopedDoc,
  setScopedDocs,
  setScopedProfile,
  updateScopedDoc,
  deleteScopedDoc,
  replaceScopedCollection,
  findProfileByShareSlug,
  uploadDataUrlImage,
  uploadDataUrlFile,
  getPlatformStats
} from './src/db/supabaseStore.js';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// [추가] 기본적인 보안 헤더(클릭재킹 방지, MIME 스니핑 방지, HSTS 등)를 적용한다.
// - contentSecurityPolicy는 일부러 끈다: 지도(Kakao/Google), Supabase Storage, Gemini
//   같은 외부 리소스 출처를 하나하나 다 정리하지 않은 상태에서 기본 CSP를 켜면 그런
//   리소스들이 조용히 막혀서 화면이 깨질 수 있다. 외부 리소스 출처가 정리되면 그때 켜는 게 안전하다.
// - crossOriginEmbedderPolicy도 끈다: 외부 이미지/지도 리소스에 CORP 헤더가 없으면
//   이것도 로딩을 막을 수 있어서다.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// [추가] 배포 플랫폼(Render 등)이나 외부 모니터링/핑 서비스가 "서버가 살아있는지"만 빠르게
// 확인할 수 있는 엔드포인트. 로그인/DB 조회 없이 즉시 응답한다. 5~10분 간격으로 이 주소에
// 외부에서 핑을 보내면, 무료 요금제의 "일정 시간 뒤 서버가 잠드는" 문제도 줄일 수 있다.
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// ------------------------------------------------------------------
// 🔐 세션 인증 (보안 수정)
// [수정] 예전에는 클라이언트가 보내는 x-user-id 헤더를 그대로 신뢰했습니다.
// 이 헤더는 브라우저 개발자도구/curl로 누구나 원하는 값으로 바꿔 보낼 수 있고,
// 가입 시 생성되는 아이디(user-${Date.now()})도 예측이 쉬워서, 다른 사람(심지어
// 관리자 계정)의 아이디만 알면 그 사람으로 완전히 위장해 데이터를 읽고 쓸 수
// 있는 심각한 취약점이었습니다.
// 이제는 로그인/회원가입 성공 시에만 서버가 임의의(예측 불가능한) 세션 토큰을
// 발급해서 httpOnly 쿠키로 내려주고, 이후 모든 요청은 그 쿠키를 검증해서만
// 사용자를 식별합니다. 라우트 코드 자체는 그대로 req.headers['x-user-id']를
// 읽지만, 이 값은 이제 "검증된 세션"에서만 채워지고, 세션이 없거나 유효하지
// 않으면 클라이언트가 뭘 보내든 무시(삭제)됩니다.
// ------------------------------------------------------------------
const SESSION_COOKIE_NAME = 'bizcard_session';
const SESSION_TTL_LONG_MS = 30 * 24 * 60 * 60 * 1000; // 30일 ("로그인 상태 유지" 체크 시)
const SESSION_TTL_SHORT_MS = 24 * 60 * 60 * 1000; // 1일 (체크 안 하면 — 공용 PC 등에서 오래 남는 것 방지)

// [수정] 세션을 메모리에만 두면, Render 같은 배포 플랫폼이 일정 시간 뒤 서버를 재웠다가
// 다음 요청에 다시 깨울 때(cold start) 메모리가 초기화되면서 로그인이 전부 끊긴다.
// 접속이 뜸한 모바일에서 특히 자주 겪는 문제였다. 이제 진짜 저장소는 Supabase의
// app_sessions 테이블이고, 이 Map은 매 요청마다 DB를 조회하지 않도록 돕는 "캐시"일 뿐이다.
// Supabase가 설정 안 된 환경(로컬 개발 등)에서는 예전처럼 메모리로만 동작한다.
const sessions = new Map<string, { userId: string; expiresAt: number }>();

// [수정] "로그인 상태 유지"를 체크했으면 30일, 안 했으면 1일짜리 세션을 발급한다.
// 기본값은 true(기존 동작과 동일하게 30일)로 둬서, 이 옵션을 안 보내는 예전 클라이언트도
// 그대로 잘 동작한다.
async function createSession(userId: string, rememberMe: boolean = true): Promise<{ token: string; ttlMs: number }> {
  const token = crypto.randomBytes(32).toString('hex'); // 256비트 무작위 값 → 추측 불가능
  const ttlMs = rememberMe ? SESSION_TTL_LONG_MS : SESSION_TTL_SHORT_MS;
  const expiresAt = Date.now() + ttlMs;
  sessions.set(token, { userId, expiresAt });
  await saveSession(token, userId, expiresAt); // Supabase에 영구 저장 (미설정 시 조용히 무시됨)
  return { token, ttlMs };
}

// [수정] 비밀번호를 재설정할 때 호출: 그 사용자 명의로 발급된 기존 세션을 전부 끊는다.
// 계정이 탈취당해 공격자가 이미 로그인 세션을 갖고 있는 경우, 비밀번호만 바꾸고
// 세션은 그대로 두면 공격자는 계속 접근할 수 있다 — 그래서 재설정 성공 시점에
// "이 사용자의 세션은 전부 무효"로 만들어야 실제로 안전해진다.
async function invalidateAllSessionsForUser(userId: string): Promise<void> {
  for (const [token, session] of sessions.entries()) {
    if (session.userId === userId) sessions.delete(token);
  }
  await deleteAllSessionsForUser(userId);
}

function parseCookies(header?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  });
  return out;
}

function setSessionCookie(res: express.Response, token: string, ttlMs: number = SESSION_TTL_LONG_MS) {
  const secureFlag = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(ttlMs / 1000)}${secureFlag}`
  );
}

function clearSessionCookie(res: express.Response) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

// 모든 요청보다 먼저 실행: 쿠키의 세션을 검증하고, 그 결과로만 x-user-id를 채운다.
app.use(async (req, res, next) => {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[SESSION_COOKIE_NAME];
  let session = token ? sessions.get(token) : undefined;

  // [수정] 메모리 캐시에 없으면(=서버가 방금 재시작돼서 캐시가 비어있는 경우 포함)
  // Supabase에서 한 번 더 확인한다. 여기서 찾으면 캐시에도 채워둬서 다음 요청부터는
  // 다시 DB를 안 타도 되게 한다. 이 한 단계 덕분에 서버 재시작 후 첫 요청에서도
  // 로그인이 안 끊긴다.
  if (!session && token && isSupabaseConfigured) {
    const stored = await loadSession(token);
    if (stored) {
      session = { userId: stored.userId, expiresAt: stored.expiresAt };
      sessions.set(token, session);
    }
  }

  if (session && session.expiresAt > Date.now()) {
    // 세션이 유효하면, 클라이언트가 헤더에 뭘 보냈든 무시하고 서버가 확인한 사용자로 덮어쓴다.
    req.headers['x-user-id'] = session.userId;
  } else {
    if (token) {
      sessions.delete(token); // 만료된 세션 정리
      deleteSession(token).catch(() => {}); // Supabase 쪽도 정리 (실패해도 요청 흐름은 막지 않음)
    }
    // 유효한 세션이 없으면 클라이언트가 임의로 넣은 x-user-id는 절대 신뢰하지 않는다.
    delete req.headers['x-user-id'];
  }
  next();
});

// === 통합 차량 관리 초기 데이터 정의 ===
const initialVehicles: Vehicle[] = [
  {
    id: 'vh-1',
    modelName: '벤츠 E300 4Matic',
    plateNumber: '12가 3456',
    owner: '박영록',
    purchaseDate: '2025-03-10',
    initialMileage: 12400,
    currentMileage: 12500,
    fuelType: 'gasoline',
    status: 'active',
    createdAt: new Date('2025-03-10').toISOString()
  },
  {
    id: 'vh-2',
    modelName: '현대 그랜저 하이브리드',
    plateNumber: '34너 5678',
    owner: '이지민',
    purchaseDate: '2026-01-15',
    initialMileage: 8385,
    currentMileage: 8400,
    fuelType: 'hybrid',
    status: 'active',
    createdAt: new Date('2026-01-15').toISOString()
  },
  {
    id: 'vh-3',
    modelName: '기아 카니발',
    plateNumber: '56더 7890',
    owner: '박영록',
    purchaseDate: '2024-06-20',
    initialMileage: 25300,
    currentMileage: 25300,
    fuelType: 'diesel',
    status: 'active',
    createdAt: new Date('2024-06-20').toISOString()
  },
  {
    id: 'vh-4',
    modelName: '테슬라 모델 Y',
    plateNumber: '78러 9012',
    owner: '박영록',
    purchaseDate: '2025-08-05',
    initialMileage: 11190,
    currentMileage: 11200,
    fuelType: 'electric',
    status: 'active',
    createdAt: new Date('2025-08-05').toISOString()
  },
  {
    id: 'vh-5',
    modelName: '제네시스 G80',
    plateNumber: '90머 1234',
    owner: '한상우',
    purchaseDate: '2025-11-20',
    initialMileage: 15400,
    currentMileage: 15400,
    fuelType: 'gasoline',
    status: 'active',
    createdAt: new Date('2025-11-20').toISOString()
  },
  {
    id: 'vh-6',
    modelName: '현대 아반떼',
    plateNumber: '45서 6789',
    owner: '한상우',
    purchaseDate: '2026-02-18',
    initialMileage: 4190,
    currentMileage: 4200,
    fuelType: 'gasoline',
    status: 'active',
    createdAt: new Date('2026-02-18').toISOString()
  }
];

const initialDrivingLogs: DrivingLog[] = [
  {
    id: 'log-1',
    vehicleId: 'vh-1',
    driverName: '박영록',
    date: '2026-06-30',
    purpose: '거래처 미팅 (삼성전자)',
    startMileage: 12475,
    endMileage: 12500,
    distance: 25,
    startPlace: '회사 본사',
    endPlace: '삼성전자 서초사옥',
    createdAt: new Date('2026-06-30T10:00:00').toISOString()
  },
  {
    id: 'log-2',
    vehicleId: 'vh-2',
    driverName: '이지민',
    date: '2026-06-29',
    purpose: '외근 (네이버 클라우드)',
    startMileage: 8385,
    endMileage: 8400,
    distance: 15,
    startPlace: '회사 본사',
    endPlace: '네이버 분당사옥',
    createdAt: new Date('2026-06-29T14:30:00').toISOString()
  },
  {
    id: 'log-3',
    vehicleId: 'vh-1',
    driverName: '박영록',
    date: '2026-06-28',
    purpose: '현장 실사 및 비즈니스 미팅',
    startMileage: 12455,
    endMileage: 12475,
    distance: 20,
    startPlace: '회사 본사',
    endPlace: '카카오 판교사옥',
    createdAt: new Date('2026-06-28T09:00:00').toISOString()
  },
  {
    id: 'log-4',
    vehicleId: 'vh-6',
    driverName: '한상우',
    date: '2026-06-27',
    purpose: '업무 관련 물품 및 소모품 구입',
    startMileage: 4190,
    endMileage: 4200,
    distance: 10,
    startPlace: '회사 본사',
    endPlace: '이마트 자양점',
    createdAt: new Date('2026-06-27T16:00:00').toISOString()
  },
  {
    id: 'log-5',
    vehicleId: 'vh-4',
    driverName: '박영록',
    date: '2026-06-26',
    purpose: '정기 주주총회 참석 의전 및 이동',
    startMileage: 11190,
    endMileage: 11200,
    distance: 10,
    startPlace: '회사 본사',
    endPlace: '포스코센터',
    createdAt: new Date('2026-06-26T11:00:00').toISOString()
  }
];

const initialExpenses: VehicleExpense[] = [
  {
    id: 'exp-1',
    vehicleId: 'vh-1',
    date: '2026-06-29',
    category: 'fuel',
    amount: 75000,
    memo: '벤츠 고급유 주유 (SK에너지)',
    createdAt: new Date('2026-06-29T18:30:00').toISOString()
  },
  {
    id: 'exp-2',
    vehicleId: 'vh-1',
    date: '2026-06-30',
    category: 'toll',
    amount: 4800,
    memo: '경부고속도로 통행료 회계 정산',
    createdAt: new Date('2026-06-30T11:15:00').toISOString()
  },
  {
    id: 'exp-3',
    vehicleId: 'vh-2',
    date: '2026-06-28',
    category: 'parking',
    amount: 12000,
    memo: '강남구청 공영주차장 주차비',
    createdAt: new Date('2026-06-28T15:00:00').toISOString()
  },
  {
    id: 'exp-4',
    vehicleId: 'vh-6',
    date: '2026-06-27',
    category: 'toll',
    amount: 3200,
    memo: '외곽순환도로 톨게이트',
    createdAt: new Date('2026-06-27T17:00:00').toISOString()
  },
  {
    id: 'exp-5',
    vehicleId: 'vh-3',
    date: '2026-06-25',
    category: 'other',
    amount: 26749,
    memo: '카니발 프리미엄 세차 및 소모성 클리너 구입',
    createdAt: new Date('2026-06-25T14:00:00').toISOString()
  }
];

const initialMaintenances: VehicleMaintenance[] = [
  {
    id: 'maint-1',
    vehicleId: 'vh-1',
    date: '2026-06-15',
    title: '정기 점검 (엔진오일 및 필터 교체)',
    cost: 180000,
    mileage: 12000,
    shopName: '메르세데스벤츠 공식 강남서비스센터',
    status: 'completed',
    memo: '다음 오일 교환 예정일: 22,000km 시점',
    createdAt: new Date('2026-06-15').toISOString()
  },
  {
    id: 'maint-2',
    vehicleId: 'vh-4',
    date: '2026-07-15',
    title: '하절기 에어컨 항균 필터 및 타이어 위치 교환',
    cost: 35000,
    mileage: 12000,
    shopName: '테슬라 공식 성수서비스센터',
    status: 'scheduled',
    memo: '사전 예약 완료 (14:00)',
    createdAt: new Date('2026-06-20').toISOString()
  }
];

// 내 명함 프로필 초기 데이터
const initialMyProfile: MyProfile = {
  name: '박영록',
  company: 'BizCard Pro AI',
  department: '글로벌 사업총괄본부',
  title: '대표이사 / CEO',
  phoneMobile: '010-5454-0000',
  phoneOffice: '02-545-0000',
  phoneFax: '02-545-0001',
  email: 'parkyl5454@gmail.com',
  address: '서울특별시 강남구 테헤란로 152 강남파이낸스센터 18층',
  snsUrl: 'https://linkedin.com/in/bizcard-pro',
  website: 'https://bizcard-pro.ai',
  memo: '스마트 명함 관리 & AI OCR 솔루션 전문가'
};

// 초기 프로젝트 샘플 데이터
const initialProjects: Project[] = [
  {
    id: 'p-1',
    name: '삼성전자 온디바이스 B2B 공급 제안',
    developer: '삼성전자 (MX사업부)',
    contractor: '시공테크',
    architect: '건원건축',
    electricalDesigner: '한일전기설계',
    mechanicalDesigner: '삼신설계',
    supervisor: '한미글로벌',
    operator: 'BizCard Pro AI',
    status: 'progress',
    priority: 'high',
    dueDate: new Date(Date.now() + 86400000 * 14).toISOString().split('T')[0],
    contactIds: ['c-2'],
    budget: '1억 5천만원',
    createdAt: new Date(Date.now() - 86400000 * 10).toISOString(),
    followUps: [
      {
        id: 'f-1',
        projectId: 'p-1',
        content: '제안 피치덱 수정안 송부 완료 (보안팀 서류 첨부)',
        date: new Date(Date.now() - 86400000 * 2).toISOString().split('T')[0],
        status: 'done'
      },
      {
        id: 'f-2',
        projectId: 'p-1',
        content: '담당 임원 대면 프리젠테이션 미팅',
        date: new Date(Date.now() + 86400000 * 5).toISOString().split('T')[0],
        status: 'planned'
      }
    ]
  },
  {
    id: 'p-2',
    name: '네이버 클라우드 API 연동 파트너십 계약',
    developer: '네이버클라우드 (주)',
    contractor: '우미건설',
    architect: '희림건축',
    electricalDesigner: '세명전기엔지니어링',
    mechanicalDesigner: '우원엠앤이',
    supervisor: '건원엔지니어링',
    operator: '네이버클라우드 운영본부',
    status: 'progress',
    priority: 'high',
    dueDate: new Date(Date.now() + 86400000 * 7).toISOString().split('T')[0],
    contactIds: ['c-1'],
    budget: '8,000만원',
    createdAt: new Date(Date.now() - 86400000 * 15).toISOString(),
    followUps: [
      {
        id: 'f-3',
        projectId: 'p-2',
        content: '기술 미팅 아젠다 확정 및 요금표 최종 협의',
        date: new Date(Date.now() - 86400000 * 1).toISOString().split('T')[0],
        status: 'done'
      }
    ]
  },
  {
    id: 'p-3',
    name: 'LG CNS 스마트 물류 시범 구축 사업',
    developer: 'LG CNS',
    contractor: 'GS건설',
    architect: '창조건축',
    electricalDesigner: '동일전기설계',
    mechanicalDesigner: '삼우엠앤이',
    supervisor: '토펙엔지니어링',
    operator: 'LG CNS 물류사업본부',
    status: 'opportunity',
    priority: 'medium',
    dueDate: new Date(Date.now() + 86400000 * 30).toISOString().split('T')[0],
    contactIds: ['c-5'],
    budget: '5,000만원',
    createdAt: new Date(Date.now() - 86400000 * 4).toISOString(),
    followUps: []
  }
];

// 초기 그룹 샘플 데이터
const initialGroups: ContactGroup[] = [
  { id: 'g-vip', name: '⭐ VIP 거래처', color: 'bg-amber-500 text-amber-950 border-amber-400' },
  { id: 'g-client', name: '💼 비즈니스 파트너', color: 'bg-blue-500 text-white border-blue-400' },
  { id: 'g-tech', name: '💻 테크 / 개발', color: 'bg-emerald-500 text-white border-emerald-400' },
  { id: 'g-friend', name: '🤝 지인 / 네트워킹', color: 'bg-purple-500 text-white border-purple-400' },
];

// 초기 연락처 명함 샘플 데이터 (내 위치 기준 대략적인 서울/경기 좌표 포함)
const initialContacts: BusinessCard[] = [
  {
    id: 'c-1',
    name: '김도현',
    company: '네이버 클라우드',
    department: 'AI 플랫폼 개발팀',
    title: '수석 연구원',
    phoneMobile: '010-3456-7890',
    phoneOffice: '031-784-1114',
    phoneFax: '031-784-1115',
    email: 'dohyun.kim@navercorp.com',
    address: '경기도 성남시 분당구 분당내곡로 131 테크원 타워',
    lat: 37.3948,
    lng: 127.1112,
    groupId: 'g-tech',
    frontImage: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=600&q=80',
    backImage: 'https://images.unsplash.com/photo-1557683316-973673baf926?auto=format&fit=crop&w=600&q=80',
    memo: '하이퍼클로바X B2B API 연동 논의. 다음 달 미팅 예정.',
    companyInfo: '국내 최대 규모의 초대규모 AI(하이퍼클로바X) 및 클라우드 인프라 플랫폼 기업 (전년도 매출액 약 1조 1,400억원)',
    createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    callHistory: [
      {
        id: 'call-1',
        contactId: 'c-1',
        type: 'incoming',
        timestamp: new Date(Date.now() - 3600000 * 4).toISOString(),
        duration: '6분 42초',
        note: 'API 스펙 문서 메일로 송부 요청받음'
      },
      {
        id: 'call-2',
        contactId: 'c-1',
        type: 'outgoing',
        timestamp: new Date(Date.now() - 86400000 * 2).toISOString(),
        duration: '12분 10초',
        note: '기술 미팅 아젠다 조율'
      }
    ]
  },
  {
    id: 'c-2',
    name: '이서연',
    company: '삼성전자',
    department: 'DX부문 모바일경험(MX)사업부',
    title: '책임 프로덕트 매니저',
    phoneMobile: '010-9876-5432',
    phoneOffice: '02-2255-0114',
    phoneFax: '02-2255-0115',
    email: 'seoyeon.lee@samsung.com',
    address: '서울특별시 서초구 서초대로74길 11 삼성전자 서초사옥',
    lat: 37.4967,
    lng: 127.0276,
    groupId: 'g-client',
    frontImage: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=600&q=80',
    memo: '갤럭시 온디바이스 명함 스캔 솔루션 도입 협의 중.',
    companyInfo: '삼성그룹 계열의 글로벌 전자제품 및 반도체 제조 부동의 1위 대기업 (전년도 매출액 약 258조원)',
    createdAt: new Date(Date.now() - 86400000 * 4).toISOString(),
    callHistory: []
  },
  {
    id: 'c-3',
    name: '정민우',
    company: '카카오',
    department: '로컬서비스 기획팀',
    title: '파트장',
    phoneMobile: '010-1234-5678',
    phoneOffice: '02-1577-3754',
    phoneFax: '02-1577-3755',
    email: 'minwoo.jung@kakaocorp.com',
    address: '제주특별자치도 제주시 첨단로 242',
    lat: 33.4724,
    lng: 126.5794,
    groupId: 'g-tech',
    frontImage: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=600&q=80',
    memo: '카카오 맵 API 고도화 및 비즈니스 명함 동기화 연동 제안 예정.',
    companyInfo: '대한민국의 대표 모바일 플랫폼 및 메신저 기반 생활 밀착형 서비스 IT 대기업 (전년도 매출액 약 8조원)',
    createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    callHistory: []
  },
  {
    id: 'c-4',
    name: '최유리',
    company: '토스(비바리퍼블리카)',
    department: '브랜드 디자인 그룹',
    title: '브랜드 매니저',
    phoneMobile: '010-8765-4321',
    phoneOffice: '02-1599-1111',
    phoneFax: '02-1599-2222',
    email: 'yuri.choi@toss.im',
    address: '서울특별시 강남구 테헤란로 142 아크플레이스 12층',
    lat: 37.4994,
    lng: 127.0358,
    groupId: 'g-friend',
    frontImage: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=600&q=80',
    memo: 'Toss B2B 마케팅 협업 관련 연락망 구축.',
    companyInfo: '대한민국의 대표 종합 금융 핀테크 플랫폼 비바리퍼블리카 운영 기업 (전년도 매출액 약 1조 3,000억원)',
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    callHistory: []
  },
  {
    id: 'c-5',
    name: '강태오',
    company: 'LG CNS',
    department: '스마트 팩토리 사업부',
    title: '파트장',
    phoneMobile: '010-5555-5555',
    phoneOffice: '02-2099-0114',
    phoneFax: '02-2099-0115',
    email: 'teoh.kang@lgcns.com',
    address: '서울특별시 강서구 마곡중앙8로 71 LG사이언스파크',
    lat: 37.5615,
    lng: 126.8335,
    groupId: 'g-tech',
    frontImage: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=600&q=80',
    memo: '스마트 물류 시범 구축 사업 관련 명함 확보.',
    companyInfo: 'LG그룹의 IT 서비스 및 시스템 통합(SI), 디지털 트랜스포메이션 전문 대기업 (전년도 매출액 약 5조 2,000억원)',
    createdAt: new Date(Date.now() - 86400000 * 1).toISOString(),
    callHistory: []
  }
];

const initialDailyLogs: DailyWorkLog[] = [
  {
    id: 'dl-1',
    date: new Date().toISOString().split('T')[0],
    title: '삼성전자 MX사업부 솔루션 제안 미팅 및 추가 요구 검토',
    author: '한상우',
    department: '비즈니스전략팀',
    tasksToday: '1. 삼성전자 서초사옥 방문 미팅 진행 및 온디바이스 데모 시연 완료\n2. 고객 보안 가이드 및 규정 준수를 위한 추가 요건 메일 조율 완료',
    tasksTomorrow: '1. 내부 개발 본부와 삼성전자 측 보안 가이드 기술 타당성 검토 회의 진행\n2. 2차 미팅용 수정 제안서 초안 작성 및 피치덱 업데이트',
    issues: '기존 클라우드 전송 방식 외에 완전한 온디바이스 파싱 옵션을 요청함. 추가적인 라이브러리 가벼움 및 디바이스 연산 부하 테스트가 관건임.',
    contactIds: ['c-2'],
    projectIds: ['p-1'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'dl-2',
    date: new Date(Date.now() - 86400000).toISOString().split('T')[0],
    title: '네이버 클라우드 API 연동 요금제 조율 및 설계 회의',
    author: '한상우',
    department: '비즈니스전략팀',
    tasksToday: '1. 네이버 클라우드 김도현 수석 연구원과 유선 통화로 연동 스펙 아젠다 조율\n2. B2B 주소록 자동 동기화 기능에 관한 API 트래픽 한도 및 요금 정책 최종 타협안 도출\n3. 내부 보고용 기안서 작성',
    tasksTomorrow: '1. 파트너십 최종 계약서 초안 법무 검토 요청\n2. 신규 API 연동을 위한 인프라 리소스 배치 계획 수립',
    issues: '트래픽 급증 시의 레이턴시 보장을 위한 전용 회선 옵션 추가 논의가 일부 남아있음.',
    contactIds: ['c-1'],
    projectIds: ['p-2'],
    createdAt: new Date(Date.now() - 86400000).toISOString()
  }
];

const initialWeeklyLogs: WeeklyWorkLog[] = [
  {
    id: 'wl-1',
    startDate: new Date(Date.now() - 86400000 * 6).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    title: '6월 4주차 주간 업무 보고 (영업 총괄 및 솔루션 파트너십)',
    author: '한상우',
    department: '비즈니스전략팀',
    achievementsThisWeek: '1. 삼성전자 MX사업부 B2B 솔루션 온디바이스 데모 미팅 수행 (성공적 피드백)\n2. 네이버 클라우드 연동 요금 정책 협상 타결 (B2B 주소록 동기화 핵심 아젠다 해결)\n3. 신규 VIP 명함 5건 등록 및 고객 CRM 매핑 완료',
    achievementsByDay: {
      mon: '1. 주간 영업 실적 보고 회의 참석\n2. 주요 VIP 고객 메일 피드백 정리 및 금주 타겟 명단 선정',
      tue: '1. 네이버 클라우드 김도현 수석 연구원과 유선 요금 및 API 연동 아젠다 사전 조율\n2. 신규 파트너용 기획 설명서 보정 작업 완료',
      wed: '1. 네이버 클라우드 B2B 주소록 자동 동기화 기능 한도 및 API 요금 최종 타결안 도출\n2. 내부 보고용 상신 기안서 기안 완료',
      thu: '1. 삼성전자 서초사옥 이서연 책임 PM 방문 대면 제안 미팅 및 온디바이스 데모 시연 진행\n2. 고객 보안 가이드 추가 요구사항 수신',
      fri: '1. 삼성전자 2차 미팅 대안(보안 연산 부하 가이드 및 라이브러리 경량화) 기술 분석 의뢰\n2. 신규 인맥 5건 시스템 등록 및 CRM 정보 기재 완료',
      sat: '',
      sun: ''
    },
    plansNextWeek: '1. 삼성전자 보안 요구 기술 미팅 진행 및 완전 온디바이스 옵션 아키텍처 제안서 작성\n2. 네이버 클라우드 파트너십 최종 계약 서명 조율\n3. 대리점 및 유통 파트너 추가 확보를 위한 컨택 가동',
    feedbacks: '현재 개발팀 리소스가 한정되어 있어, 삼성전자의 완전 온디바이스 요구사항 수용을 위해서는 백엔드 최적화 업무의 우선순위 재조정이 필요함.',
    contactIds: ['c-1', 'c-2'],
    projectIds: ['p-1', 'p-2'],
    createdAt: new Date().toISOString()
  }
];

// 회원 목록 & 협업 스코프 데이터베이스 초기 데이터
const initialUsers: RegisteredUser[] = [
  {
    id: 'user-demo',
    email: 'demo@bizcard.com',
    password: 'demo',
    name: '박영록',
    type: 'individual'
  },
  {
    id: 'user-naver1',
    email: 'partner1@company.com',
    password: 'demo',
    name: '이지민',
    type: 'company',
    companyName: '네이버',
    businessNumber: '123-45-67890'
  },
  {
    id: 'user-naver2',
    email: 'partner2@company.com',
    password: 'demo',
    name: '한상우',
    type: 'company',
    companyName: '네이버',
    businessNumber: '123-45-67890'
  }
];

// 로컬 사용자 캐시 및 데이터베이스
let users: RegisteredUser[] = [];

const db: { [scopeId: string]: {
  contacts: BusinessCard[];
  projects: Project[];
  groups: ContactGroup[];
  myProfile: MyProfile;
  vehicles: Vehicle[];
  drivingLogs: DrivingLog[];
  expenses: VehicleExpense[];
  maintenances: VehicleMaintenance[];
  maintenanceIntervals: MaintenanceInterval[];
  dailyLogs: DailyWorkLog[];
  weeklyLogs: WeeklyWorkLog[];
  advancePayments: AdvancePaymentSettlement[];
  leaveRequests: LeaveRequest[];
} } = {};

// 동시에 여러 요청이 같은 스코프를 불러오려고 하면(예: 페이지 로딩 시 여러 화면이 동시에 호출),
// 각자 따로 전체 재조회를 시작하지 않고 "이미 진행 중인 로딩"에 함께 올라타도록 합니다.
// (안 그러면 응답이 늦어질수록 중복 재시도가 계속 쌓여 Supabase 연결 부담이 눈덩이처럼 커집니다.)
const inFlightScopeLoads: { [scopeId: string]: Promise<typeof db[string]> } = {};

// Supabase로부터 특정 스코프 로드 (스코프당 1회만 로드하여 메모리에 캐시)
async function loadScopeFromSupabase(scopeId: string) {
  if (db[scopeId]) return db[scopeId];
  if (inFlightScopeLoads[scopeId]) return inFlightScopeLoads[scopeId];

  const loadPromise = loadScopeFromSupabaseInner(scopeId).finally(() => {
    delete inFlightScopeLoads[scopeId];
  });
  inFlightScopeLoads[scopeId] = loadPromise;
  return loadPromise;
}

async function loadScopeFromSupabaseInner(scopeId: string) {
  if (db[scopeId]) return db[scopeId];

  // 컬렉션 하나가 느려지거나(DB 타임아웃 등) 응답이 없어도, 다른 화면(예: 내 명함 공유)이
  // 같이 멈추지 않도록 각 컬렉션 조회에 개별 타임아웃을 둡니다. 타임아웃난 컬렉션이 있으면
  // 이번 요청은 빈 목록으로 우선 응답하되, 전체 결과는 캐싱하지 않아 다음 요청에서 다시 시도합니다.
  // [수정] 명함 등 데이터가 1,000건을 넘으면 Supabase 조회 자체가 페이지 단위(1,000건씩)로
  // 여러 번 왕복하게 되면서, 예전 15초 타임아웃으로는 부족해지는 경우가 생겼다(예: 2,100건
  // 짜리 명함 목록은 3번 왕복 필요). 그 결과 "로그인하면 0개로 보이다가, 로그아웃 후 다시
  // 로그인하면 정상적으로 다 보이는"(재시도 때는 운 좋게 시간 안에 끝남) 혼란스러운 증상이
  // 있었다. 데이터가 많을수록 왕복이 늘어나는 걸 감안해 타임아웃을 넉넉하게 늘린다.
  let hadTimeout = false;
  const withTimeout = <T>(promise: Promise<T[]>, label: string, ms = 40000): Promise<T[]> => {
    let timer: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<T[]>((resolve) => {
      timer = setTimeout(() => {
        hadTimeout = true;
        console.error(`getScopedCollection(${scopeId}, ${label}) 타임아웃 - 이번 요청은 빈 목록으로 처리합니다.`);
        resolve([]);
      }, ms);
    });
    // 실제 쿼리가 먼저 끝나도 setTimeout 타이머 자체는 계속 살아있다가 나중에(ms 뒤) 뒤늦게 발동해서,
    // 이미 성공적으로 끝난 요청에 대해서까지 "타임아웃" 에러 로그를 잘못 찍는 버그가 있었다.
    // 어느 쪽이 이기든 결과가 나오는 즉시 타이머를 확실히 정리한다.
    return Promise.race([promise, timeoutPromise]).then((result) => {
      clearTimeout(timer);
      return result;
    });
  };

  // [수정] 예전엔 새로 가입하는 회사/개인 계정마다 개발 중에 쓰던 가짜 샘플 데이터
  // (명함, 프로젝트, 내 프로필 등)가 그대로 복사되어 들어갔다. 실제 서비스 이용자에게는
  // 절대 있으면 안 되는 문제라서, 이제는 전부 빈 상태로 시작하도록 고쳤다.
  // (initialContacts 등 원본 상수는 다른 곳에서 참조하지 않는 한 그대로 남아있어도 무방하다)
  await ensureScopeInitialized(scopeId, {
    contacts: [],
    projects: [],
    groups: JSON.parse(JSON.stringify(initialGroups)),
    myProfile: {
      name: '', company: '', department: '', title: '',
      phoneMobile: '', phoneOffice: '', phoneFax: '', email: '',
      address: '', snsUrl: '', website: '', memo: ''
    },
    vehicles: [],
    drivingLogs: [],
    expenses: [],
    maintenances: [],
    maintenanceIntervals: [],
    dailyLogs: [],
    weeklyLogs: []
  });

  // 11개 컬렉션을 한꺼번에(Promise.all) 동시 요청하면 Supabase(PostgREST)의 커넥션 풀을
  // 순간적으로 다 소모해서, 정작 쿼리 자체는 1ms도 안 걸리는데도 "연결을 못 잡아" 타임아웃이
  // 나는 현상이 있었습니다. 순차적으로 하나씩 조회해 커넥션 풀 부담을 줄입니다.
  const contacts = await withTimeout(getScopedCollection<BusinessCard>(scopeId, 'contacts'), 'contacts');
  const projects = await withTimeout(getScopedCollection<Project>(scopeId, 'projects'), 'projects');
  const groups = await withTimeout(getScopedCollection<ContactGroup>(scopeId, 'groups'), 'groups');
  const vehicles = await withTimeout(getScopedCollection<Vehicle>(scopeId, 'vehicles'), 'vehicles');
  const drivingLogs = await withTimeout(getScopedCollection<DrivingLog>(scopeId, 'drivingLogs'), 'drivingLogs');
  const expenses = await withTimeout(getScopedCollection<VehicleExpense>(scopeId, 'expenses'), 'expenses');
  const maintenances = await withTimeout(getScopedCollection<VehicleMaintenance>(scopeId, 'maintenances'), 'maintenances');
  const maintenanceIntervals = await withTimeout(getScopedCollection<MaintenanceInterval>(scopeId, 'maintenanceIntervals'), 'maintenanceIntervals');
  const dailyLogs = await withTimeout(getScopedCollection<DailyWorkLog>(scopeId, 'dailyLogs'), 'dailyLogs');
  const weeklyLogs = await withTimeout(getScopedCollection<WeeklyWorkLog>(scopeId, 'weeklyLogs'), 'weeklyLogs');
  const advancePayments = await withTimeout(getScopedCollection<AdvancePaymentSettlement>(scopeId, 'advancePayments'), 'advancePayments');
  const leaveRequests = await withTimeout(getScopedCollection<LeaveRequest>(scopeId, 'leaveRequests'), 'leaveRequests');
  const profileList = await withTimeout(getScopedCollection<MyProfile>(scopeId, 'myProfile'), 'myProfile');

  const myProfile = profileList.find(p => p.email === 'parkyl5454@gmail.com') || profileList[0] || initialMyProfile;

  const loadedData = {
    contacts,
    projects,
    groups,
    myProfile,
    vehicles,
    drivingLogs,
    expenses,
    maintenances,
    maintenanceIntervals,
    dailyLogs,
    weeklyLogs,
    advancePayments,
    leaveRequests
  };

  if (hadTimeout) {
    // 캐싱하지 않음: 다음 요청에서 다시 정상적으로 조회를 시도하도록 함
    return loadedData;
  }

  db[scopeId] = loadedData;
  return db[scopeId];
}

// 서버 시작 시 1회: 로그인 계정 시딩 및 로컬 캐시 적재
async function bootstrapUsers() {
  users = await getUsers();
  if (users.length === 0) {
    await ensureUsersSeeded(initialUsers);
    users = await getUsers();
  }
}

// HTTP 헤더(x-user-id)를 기반으로 스코프 ID를 동기적으로 계산 (DB 호출 없음, users는 메모리 캐시 사용)
function resolveScopeId(req: express.Request): string {
  const userId = req.headers['x-user-id'] as string;
  let scopeId = 'default';

  if (userId) {
    const user = users.find(u => u.id === userId);
    if (user) {
      scopeId = scopeIdForUser(user);
    }
  }
  return scopeId;
}

// Express 전용 스코프 데이터 동기 반환
// (스코프 데이터는 아래 app.use 미들웨어에서 요청 처리 전에 이미 로드가 보장됩니다)
function getScopedData(req: express.Request): any {
  const scopeId = (req as any).scopeId || 'default';
  return db[scopeId] || {
    contacts: [],
    projects: [],
    groups: [],
    myProfile: initialMyProfile,
    vehicles: [],
    drivingLogs: [],
    expenses: [],
    maintenances: [],
    maintenanceIntervals: [],
    dailyLogs: [],
    weeklyLogs: [],
    advancePayments: [],
    leaveRequests: []
  };
}

// ------------------------------------------------------------------
// 🚧 승인 대기 회원 접근 차단
// [추가] 같은 회사(사업자번호)로 두 번째 이후 가입한 사람은 approvalStatus가 'pending'
// 상태로 시작한다. 관리자가 승인하기 전까지는, 로그인은 할 수 있지만(그래야 "승인
// 대기중입니다" 화면을 보여줄 수 있으니) 그 외의 모든 API(명함 조회 포함)는 막는다.
// 정적 파일(SPA 프런트엔드 자체)과 최소한의 인증 관련 API는 허용 목록에 둔다.
// ------------------------------------------------------------------
const PENDING_APPROVAL_ALLOWED_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/signup',
  '/api/auth/logout',
  '/api/auth/me',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/verify-email',
  '/api/auth/resend-verification',
  '/api/auth/withdraw',
  '/api/auth/lookup-company' // 회원가입 화면에서 로그인 전에도 써야 하는 유일한 공개 API
]);

app.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) return next(); // 프런트엔드 정적 파일/라우팅은 항상 통과
  if (PENDING_APPROVAL_ALLOWED_PATHS.has(req.path)) return next();

  const userId = req.headers['x-user-id'] as string;
  const requester = userId ? users.find(u => u.id === userId) : undefined;

  // [수정] 심각한 구조적 문제를 막는다: 예전에는 로그인 세션이 없거나 만료돼도 이
  // 아래 라우트들이 그냥 통과됐고, resolveScopeId()가 조용히 "default"라는 익명
  // 공유 스코프로 처리해버렸다. 그 상태로 명함을 등록하면 "내 화면(같은 세션)"에는
  // 보이지만, 실제 내 계정 스코프에는 저장이 안 돼서 다른 기기/새로고침에서는 안
  // 보이는 문제가 있었다 — 겉으로는 "저장 성공"처럼 보여서 원인 파악이 특히 어려웠다.
  // 이제는 로그인 확인 API(/api/auth/*) 외의 모든 API는 유효한 로그인 세션이 없으면
  // 여기서 바로 401로 막는다 — "default" 스코프로 조용히 새어나가는 경로를 원천 차단.
  if (!requester) {
    return res.status(401).json({ error: '로그인이 필요합니다. 다시 로그인해주세요.', sessionExpired: true });
  }

  if (requester.type === 'company' && requester.approvalStatus === 'pending') {
    return res.status(403).json({
      error: '아직 회사 관리자의 승인을 받지 못했습니다. 승인 후 이용할 수 있습니다.',
      pendingApproval: true
    });
  }
  // [추가] 이메일 인증도 승인 대기와 같은 방식으로 막는다: 로그인은 되지만(그래야
  // "인증 메일을 확인해주세요" 화면을 보여줄 수 있음) 그 외 API는 다 막는다.
  if (!isEmailVerified(requester.emailVerified)) {
    return res.status(403).json({
      error: '이메일 인증이 필요합니다. 받으신 인증 메일의 링크를 눌러주세요.',
      emailVerificationRequired: true
    });
  }
  next();
});

// 🔗 스코프 해석 + Supabase 데이터 로드 미들웨어
// 이 미들웨어가 실제로 연결되어 있지 않으면 모든 요청이 빈 데이터를 보게 되므로
// (기존 AI Studio 스캐폴드에 있던 버그) 반드시 라우트 등록보다 먼저 위치해야 합니다.
app.use(async (req, res, next) => {
  try {
    const scopeId = resolveScopeId(req);
    (req as any).scopeId = scopeId;
    await loadScopeFromSupabase(scopeId);
    next();
  } catch (error) {
    console.error('Scope resolution error:', error);
    next(error);
  }
});


// [수정] 예전엔 "강남", "판교" 같은 몇 개 동네 이름이 주소에 포함되는지만 보고 좌표를
// 대충 찍었다(그마저 안 걸리면 광화문 주변 랜덤 좌표). 그러다 보니 실제 위치와 무관한
// 좌표가 찍혀서, "주변 레이더 지도"에서 진짜 가까운 사람도 안 보이는 문제가 있었다.
// 이제는 카카오 로컬 API(주소 검색)로 실제 주소를 진짜 좌표로 변환한다. 정확한 주소로
// 못 찾으면, 조금 더 너그러운 "키워드 검색"으로 한 번 더 시도한다. 그래도 못 찾으면
// 억지로 아무 좌표나 채우지 않고 undefined로 둔다 — 틀린 좌표를 보여주는 것보다,
// "이 명함은 아직 위치 정보가 없다"고 정직하게 비워두는 게 낫다.
const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY;

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const result = await geocodeAddressWithDiagnostics(address);
  return result.coords;
}

// [추가] 재계산 버튼을 눌렀는데 전부 실패하는 경우, 서버 로그를 따로 안 봐도 화면에서
// 바로 원인을 알 수 있도록 실패 사유를 같이 돌려준다 (예: 키 미설정, 401 인증 오류 등).
async function geocodeAddressWithDiagnostics(address: string): Promise<{ coords: { lat: number; lng: number } | null; error?: string }> {
  // [수정] 카카오 로컬 API는 검색어(query)를 100자까지만 받는다({"code":-2,"msg":"Max
  // (query) length 100"}). 이보다 긴 주소(상세 동/호수, 건물명까지 다 붙어서 100자를
  // 넘는 경우)를 그대로 보내면 무조건 400 에러가 났다. 한국 주소는 보통 "시/도 → 구 →
  // 동 → 번지" 순으로, 위치를 특정하는 데 중요한 정보가 앞쪽에 있으므로, 100자를
  // 넘으면 앞부분만 잘라서 보낸다(뒤쪽 상세 동/호수 정보는 위치 계산엔 크게 중요하지
  // 않다).
  let cleaned = (address || '').trim();
  // [수정] 우편번호나 "대한민국" 같은 국가명이 주소 맨 끝뿐 아니라 문장 중간에도 끼어있는
  // 경우가 실제로 있었다(예: "...4층), 05630 서울시   대한민국" — 우편번호 뒤에 시/도명과
  // 국가명이 또 붙는 뒤죽박죽 형태). 명함 OCR이나 다른 시스템에서 복사해올 때 생기는 흔한
  // 오염 패턴이라, 위치에 상관없이 이런 조각들을 다 제거하고 검색한다.
  cleaned = cleaned
    .replace(/대한민국|South\s*Korea|Republic\s*of\s*Korea/gi, ' ') // 국가명 (카카오는 국내 검색만 되므로 불필요)
    .replace(/,?\s*\b\d{5}\b/g, ' ') // 신규 우편번호(5자리 숫자)
    .replace(/,?\s*\b\d{3}-\d{3}\b/g, ' ') // 구 우편번호(123-456 형식)
    .replace(/\s{2,}/g, ' ') // 여러 조각을 지우고 남은 중복 공백 정리
    .replace(/,\s*,/g, ',') // 쉼표가 연달아 남은 경우 정리
    .replace(/,\s*$/, '') // 맨 끝에 쉼표만 남은 경우 제거
    .trim();
  const trimmed = cleaned.slice(0, 100);
  if (!trimmed) return { coords: null, error: '주소가 비어있음' };
  if (!KAKAO_REST_API_KEY) {
    return { coords: null, error: 'KAKAO_REST_API_KEY 환경변수가 설정되지 않음' };
  }

  const headers = { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` };
  try {
    const addrRes = await fetch(`https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(trimmed)}`, { headers });
    if (addrRes.ok) {
      const addrData: any = await addrRes.json();
      const doc = addrData?.documents?.[0];
      if (doc) return { coords: { lat: parseFloat(doc.y), lng: parseFloat(doc.x) } };
    } else {
      const bodyText = await addrRes.text().catch(() => '');
      console.error(`카카오 주소 검색 API 오류 (상태 ${addrRes.status}, 주소: "${trimmed}"):`, bodyText.slice(0, 300));
      // 401/403이면 키 자체가 잘못됐거나 활성화가 안 된 것 -> 두 번째(키워드) 시도도
      // 똑같이 실패할 게 뻔하니, 바로 원인을 리턴해서 헛수고를 줄인다.
      if (addrRes.status === 401 || addrRes.status === 403) {
        return { coords: null, error: `카카오 API 인증 실패 (상태 ${addrRes.status}) - REST API 키가 잘못됐거나, 로컬 API 사용 설정이 안 돼있을 수 있습니다.` };
      }
      // [수정] 상태 코드만으로는 원인을 알 수 없어서(예: 400은 "잘못된 요청"이라는 뜻일
      // 뿐, 정확히 뭐가 문제인지는 카카오가 돌려주는 본문 메시지를 봐야 안다), 실제 에러
      // 본문을 화면까지 그대로 노출한다.
      if (addrRes.status === 400) {
        return { coords: null, error: `카카오 API 400 오류 (주소: "${trimmed.slice(0, 40)}") - ${bodyText.slice(0, 200)}` };
      }
    }

    const keywordRes = await fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(trimmed)}`, { headers });
    if (keywordRes.ok) {
      const keywordData: any = await keywordRes.json();
      const doc = keywordData?.documents?.[0];
      if (doc) return { coords: { lat: parseFloat(doc.y), lng: parseFloat(doc.x) } };
      return { coords: null, error: '주소/키워드 검색 결과 없음' };
    } else {
      const bodyText = await keywordRes.text().catch(() => '');
      console.error(`카카오 키워드 검색 API 오류 (상태 ${keywordRes.status}, 주소: "${trimmed}"):`, bodyText.slice(0, 300));
      return { coords: null, error: `카카오 API 오류 (상태 ${keywordRes.status}) - ${bodyText.slice(0, 200)}` };
    }
  } catch (err: any) {
    console.error('주소 지오코딩 중 오류:', err);
    // 실제 예외 메시지(err.message)는 케이스마다 제각각이라 문자열로 정확히 판별하기
    // 어려우니, 재시도 판별에 안정적으로 쓸 수 있게 항상 같은 문구로 통일해서 돌려준다.
    // 원본 메시지는 서버 로그에 이미 남겨뒀다.
    return { coords: null, error: `네트워크 오류: ${err.message || '알 수 없음'}` };
  }
}


// API Routes

// [수정] frontImage/backImage 같은 사진 필드가 base64 데이터(용량이 큼)로 들어오면
// Supabase Storage에 실제 파일로 올리고, DB에는 그 파일 주소(URL)만 저장한다.
// 이미 URL이거나(재사용) 값이 없으면 그대로 둔다. 업로드가 실패해도 예전처럼
// base64를 그대로 저장해서(안전장치) 최소한 사진 자체는 안 깨지게 한다.
async function persistImageField(
  scopeId: string,
  value: string | undefined,
  keyHint: string,
  category: 'cards' | 'receipts' = 'cards'
): Promise<string | undefined> {
  if (!value || !value.startsWith('data:image/')) return value;
  try {
    const url = await uploadDataUrlImage(scopeId, value, keyHint, category);
    return url || value;
  } catch (err) {
    console.error(`persistImageField(${keyHint}) 실패, base64를 그대로 저장합니다:`, err);
    return value;
  }
}

// [수정] 미팅 지출/업무일지 지출처럼 "배열 안에 여러 영수증 사진"이 들어있는 경우,
// 항목 하나하나(receiptImage)를 각각 Storage의 receipts 폴더에 업로드하고 URL로 교체한다.
async function persistReceiptImagesInArray<T extends { id: string; receiptImage?: string }>(
  scopeId: string,
  items: T[] | undefined,
  keyPrefix: string
): Promise<T[] | undefined> {
  if (!items || !items.length) return items;
  return Promise.all(items.map(async (item) => ({
    ...item,
    receiptImage: await persistImageField(scopeId, item.receiptImage, `${keyPrefix}-${item.id}`, 'receipts')
  })));
}

// [추가] 미팅 첨부파일(제안서/견적서/발송자료 등, PDF·PPT·엑셀·한글 다 포함)을 그대로 base64로
// DB에 쌓아두면, 문서 몇 개만 있어도 프로젝트 하나의 JSON이 수십MB로 불어나서 저장/전송이
// 느려지거나 실패하기 쉽다(특히 모바일 네트워크에서). 영수증 사진처럼 Storage에 실제 파일로
// 올리고 URL만 남긴다. 업로드가 실패해도(설정 안 됐거나 오류) base64를 그대로 저장해서
// 최소한 첨부파일 자체는 안 깨지게 한다.
async function persistAttachmentsInArray(
  scopeId: string,
  attachments: { id: string; name: string; dataUrl: string; size?: number }[] | undefined,
  keyPrefix: string
): Promise<typeof attachments> {
  if (!attachments || !attachments.length) return attachments;
  return Promise.all(attachments.map(async (att) => {
    if (!att.dataUrl || !att.dataUrl.startsWith('data:')) return att; // 이미 URL이면(재수정 시) 그대로 둠
    try {
      const url = await uploadDataUrlFile(scopeId, att.dataUrl, `${keyPrefix}-${att.id}`, 'attachments', att.name);
      return url ? { ...att, dataUrl: url } : att;
    } catch (err) {
      console.error(`persistAttachmentsInArray(${keyPrefix}-${att.id}) 실패, base64를 그대로 저장합니다:`, err);
      return att;
    }
  }));
}

// 비밀번호 검증: bcrypt 해시면 정식 비교, 옛날 평문으로 저장된 계정이면 평문 비교 후
// 성공 시 자동으로 안전한 해시로 업그레이드합니다 (기존 가입자 로그인이 끊기지 않도록).
function verifyPassword(inputPassword: string, storedPassword?: string): boolean {
  if (!storedPassword) return false;
  if (storedPassword.startsWith('$2a$') || storedPassword.startsWith('$2b$') || storedPassword.startsWith('$2y$')) {
    return bcrypt.compareSync(inputPassword, storedPassword);
  }
  return inputPassword === storedPassword; // 레거시 평문 비밀번호 호환
}

// ------------------------------------------------------------------
// 🛡️ 로그인 무차별 대입(brute-force) 방어 + 회원가입 스팸 방지
// [수정] 레이트리밋 구현 자체는 src/rateLimiter.ts로 옮겨서 단위 테스트를 붙였다.
// "이메일+IP" 조합으로 짧은 시간에 로그인 실패가 반복되면 잠시 잠근다 (계정 자체가 아니라
// 조합 단위로 제한해서, 한 사람이 다른 사람 계정에 무제한 시도하는 것도 같이 막는다).
// ------------------------------------------------------------------
const loginRateLimiter = new RateLimiter({ maxAttempts: 5, windowMs: 10 * 60 * 1000, lockoutMs: 10 * 60 * 1000 });

// [추가] 회원가입 API도 무제한으로 열려있으면 스팸 계정을 자동으로 대량 생성할 수 있다.
// IP 기준으로 1시간에 5회까지만 허용한다 (같은 사무실에서 여러 직원이 잇달아 가입하는
// 정상적인 경우도 있어서, 로그인 제한보다는 넉넉하게 잡았다).
const signupRateLimiter = new RateLimiter({ maxAttempts: 5, windowMs: 60 * 60 * 1000 });

// [추가] 회원가입 화면에서 사업자등록번호를 입력하면, 이미 그 번호로 등록된 회사가 있는지
// 미리 알려주는 API. 있으면 그 회사가 쓰던 정확한 회사명을 돌려줘서 자동으로 채워준다 —
// "주식회사 OO"과 "(주)OO"처럼 표기가 갈려서 같은 회사인데 다른 회사로 인식되던 문제를
// 가입 시점에 원천적으로 막기 위함이다. 로그인 전에도 써야 하니 인증 없이 열어두되,
// 사업자번호를 마구 훑어보는(enumeration) 걸 막기 위해 IP당 시간당 30회로 제한한다.
const companyLookupRateLimiter = new RateLimiter({ maxAttempts: 30, windowMs: 60 * 60 * 1000 });

// [추가] 명함/영수증 스캔은 Gemini API를 호출하는데, 이건 호출할 때마다 실제 비용이
// 든다. 버그로 인한 무한 반복 호출이나 남용을 막기 위해, 로그인 계정당 10분에 100회
// (전시회/네트워킹 행사에서 명함을 수십 장 연속 촬영하는 정상적인 사용은 충분히
// 허용하면서, 비정상적인 폭주만 막는 수준)로 제한한다.
const aiScanRateLimiter = new RateLimiter({ maxAttempts: 100, windowMs: 10 * 60 * 1000 });

app.get('/api/auth/lookup-company', (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const limit = companyLookupRateLimiter.check(ip);
  companyLookupRateLimiter.registerAttempt(ip);
  if (!limit.allowed) {
    return res.status(429).json({ error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' });
  }

  const businessNumber = String(req.query.businessNumber || '').trim();
  if (!businessNumber) return res.json({ found: false });

  const existing = users.find(u => u.type === 'company' && (u.businessNumber || '').trim() === businessNumber);
  if (!existing) return res.json({ found: false });

  // 이메일/이름 등 개인정보는 노출하지 않고, 회사명만 알려준다.
  res.json({ found: true, companyName: existing.companyName || '' });
});

// 🔐 Auth APIs
app.post('/api/auth/signup', async (req, res) => {
  const signupIp = req.ip || req.socket.remoteAddress || 'unknown';
  const signupLimit = signupRateLimiter.check(signupIp);
  signupRateLimiter.registerAttempt(signupIp);
  if (!signupLimit.allowed) {
    return res.status(429).json({ error: `가입 시도가 너무 많습니다. ${signupLimit.retryAfterSec}초 후 다시 시도해주세요.` });
  }

  const { email, password, name, phone, type, companyName, businessNumber, position } = req.body;
  if (!email || !password || !name || !type) {
    return res.status(400).json({ error: '필수 가입 정보가 누락되었습니다.' });
  }
  // [수정] 최소한의 비밀번호 길이 검증 (기존에는 검증이 전혀 없어 1자리 비밀번호도 통과됐음)
  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: '비밀번호는 8자 이상이어야 합니다.' });
  }
  const normalizedEmail = email.trim().toLowerCase();

  // 메모리 캐시(users)로 1차 확인 + Supabase에서 직접 한 번 더 재확인(캐시가 오래됐을 가능성에 대비한 안전장치).
  // 이 두 단계 확인으로, 같은 이메일로 두 계정(예: 개인+사업자)이 동시에 만들어지는 문제를 막는다.
  let existing = users.find(u => u.email.toLowerCase() === normalizedEmail);
  if (!existing && isSupabaseConfigured) {
    const freshUsers = await getUsers();
    existing = freshUsers.find(u => u.email.toLowerCase() === normalizedEmail);
    if (existing) users = freshUsers; // 캐시가 오래되어 있었다면 이 기회에 최신 상태로 갱신
  }
  if (existing) {
    return res.status(400).json({ error: '이미 가입에 사용된 이메일입니다. 개인/사업자 계정 모두 같은 이메일로는 중복 가입할 수 없으니, 다른 이메일로 가입해주세요.' });
  }

  // [수정] role은 이제 클라이언트가 보낸 값(requestedRole)을 절대 신뢰하지 않고 서버가
  // 전적으로 계산한다. 예전에는 요청 본문에 role: 'admin'을 그냥 넣어 보내면 그대로
  // admin으로 가입시켜버려서, 회사의 사업자등록번호만 알면 누구나 curl로 그 회사의
  // 관리자 권한을 즉시 획득할 수 있는 심각한 취약점이 있었다.
  //
  // [추가] 같은 회사(회사명+사업자번호)에 이미 사람이 있으면, 이번 가입자는 "승인 대기"
  // 상태로 시작한다. 그 회사 관리자가 승인해야 실제로 명함/프로젝트 등 회사 데이터에
  // 접근할 수 있다 — 이것도 사업자번호를 아는 사람이면 누구나 즉시 회사 데이터를 볼 수
  // 있었던 문제를 막기 위함이다. 그 회사의 최초 가입자는 관리자로서 바로 승인된 상태로 시작한다.
  // [수정] 예전엔 "회사명 + 사업자번호"가 둘 다 똑같아야 "같은 회사"로 인식했는데, 실제
  // 데이터 공유 범위(scopeIdForUser)는 사업자번호"만"으로 정해진다. 그래서 같은 회사인데
  // "주식회사 OO" vs "(주)OO"처럼 표기만 달라도 서로 다른 회사로 인식돼서, 각자 "최초
  // 가입자(관리자)"가 되어버리는 문제가 있었다 — 실제로는 같은 스코프를 쓰는데도 회원
  // 디렉토리에는 따로따로 표시되는 버그로 이어졌다. 이제는 사업자번호만으로 판단하고,
  // 이미 등록된 회사가 있으면 그 회사가 쓰던 회사명으로 강제 통일한다(표기 통일).
  const cName = (companyName || '').trim();
  const bNum = (businessNumber || '').trim();
  const existingCompanyUser = users.find(u => u.type === 'company' && (u.businessNumber || '').trim() === bNum);
  const hasExistingCompanyUser = Boolean(existingCompanyUser);
  const finalCompanyName = existingCompanyUser?.companyName || cName;
  // [수정] role/승인상태 결정 로직 자체는 src/authLogic.ts로 옮겨서 단위 테스트를 붙였다.
  const { role, approvalStatus } = decideSignupRoleAndApproval(type, hasExistingCompanyUser);

  // [추가] 이메일 인증: 메일 발송이 설정 안 된 환경(로컬 개발 등)에서는 애초에 인증
  //메일을 보낼 수가 없으므로, 가입 즉시 인증된 것으로 처리해서 개발/테스트 흐름을
  //막지 않는다. 실제 운영 환경(메일 설정 완료)에서만 진짜로 인증을 요구한다.
  const emailVerificationToken = isMailerConfigured ? crypto.randomBytes(32).toString('hex') : undefined;
  const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24시간

  const newUser: RegisteredUser = {
    id: `user-${Date.now()}`,
    email: email.toLowerCase(),
    password: bcrypt.hashSync(password, 10), // 안전하게 암호화하여 저장
    name,
    phone: phone || undefined,
    type,
    companyName: type === 'company' ? finalCompanyName : companyName,
    businessNumber,
    position: position || undefined,
    role,
    approvalStatus,
    emailVerified: !isMailerConfigured,
    emailVerificationToken,
    emailVerificationTokenExpiresAt: emailVerificationToken ? Date.now() + EMAIL_VERIFICATION_TTL_MS : undefined,
    createdAt: new Date().toISOString()
  };

  users.push(newUser);
  await addUser(newUser); // Supabase에 계정 영구 저장

  // 가입 즉시 해당 스코프의 데이터 생성/초기화 유도
  const dummyReq = { headers: { 'x-user-id': newUser.id } } as any;
  await loadScopeFromSupabase(resolveScopeId(dummyReq));

  // [추가] 인증 메일 발송 (실패해도 가입 자체는 막지 않는다 — 재전송 버튼으로 다시 받을 수 있음)
  if (emailVerificationToken) {
    try {
      const verifyUrl = `${APP_BASE_URL}/?verifyToken=${emailVerificationToken}`;
      await sendEmail({
        to: newUser.email,
        subject: '[BizCard Pro] 이메일 주소를 인증해주세요',
        html: `
          <p>안녕하세요, ${escapeHtml(newUser.name)}님.</p>
          <p>아래 버튼을 눌러 이메일 인증을 완료해주세요 (24시간 이내 유효).</p>
          <p><a href="${verifyUrl}" style="display:inline-block;padding:10px 20px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:8px;">이메일 인증하기</a></p>
          <p>버튼이 안 눌리면 이 링크를 브라우저에 붙여넣어주세요: ${verifyUrl}</p>
        `
      });
    } catch (err) {
      console.error('회원가입 인증 메일 발송 실패:', err);
    }
  }

  // [수정] 가입 즉시 로그인 상태가 되도록 세션 쿠키 발급
  // [수정] 가입 즉시 로그인 상태가 되도록 세션 쿠키 발급 (가입 직후는 기본 30일 유지)
  const signupSession = await createSession(newUser.id, true);
  setSessionCookie(res, signupSession.token, signupSession.ttlMs);

  res.status(201).json({ 
    success: true, 
    user: { 
      id: newUser.id, 
      email: newUser.email, 
      name: newUser.name, 
      type: newUser.type, 
      companyName: newUser.companyName, 
      businessNumber: newUser.businessNumber,
      position: newUser.position,
      role: newUser.role,
      approvalStatus: newUser.approvalStatus,
      emailVerified: newUser.emailVerified
    } 
  });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password, rememberMe } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: '이메일과 비밀번호를 모두 입력해주세요.' });
  }

  // [수정] 무차별 대입(brute-force) 방어: 같은 이메일 + 같은 IP 조합으로 짧은 시간에
  // 로그인 실패가 반복되면 잠시 잠근다. 로그인 성공 시에는 카운터를 즉시 초기화한다.
  const normalizedEmailForLimit = String(email).trim().toLowerCase();
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  const limitKey = `${normalizedEmailForLimit}::${clientIp}`;
  const limitCheck = loginRateLimiter.check(limitKey);
  if (!limitCheck.allowed) {
    return res.status(429).json({
      error: `로그인 시도가 너무 많습니다. ${limitCheck.retryAfterSec}초 후 다시 시도해주세요.`
    });
  }

  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user || !verifyPassword(password, user.password)) {
    loginRateLimiter.registerAttempt(limitKey);
    return res.status(401).json({ error: '이메일 혹은 비밀번호가 일치하지 않습니다.' });
  }
  loginRateLimiter.reset(limitKey);

  // 예전 평문 비밀번호 계정이면 이번 로그인 성공을 계기로 안전한 해시로 업그레이드
  if (!user.password?.startsWith('$2')) {
    user.password = bcrypt.hashSync(password, 10);
    await addUser(user);
  }

  // [수정] 로그인 성공 시 세션 쿠키 발급 (이후 요청은 이 쿠키로만 사용자를 식별)
  // "로그인 상태 유지"를 명시적으로 껐을 때만(false) 짧은 세션을 발급하고,
  // 값이 없으면(예전 클라이언트) 기존처럼 30일 유지한다.
  const loginSession = await createSession(user.id, rememberMe !== false);
  setSessionCookie(res, loginSession.token, loginSession.ttlMs);

  res.json({
    success: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      type: user.type,
      companyName: user.companyName,
      businessNumber: user.businessNumber,
      position: user.position,
      role: user.role,
      approvalStatus: user.approvalStatus,
      emailVerified: isEmailVerified(user.emailVerified)
    }
  });
});

// [추가] 이메일 인증 링크(메일의 ?verifyToken=... 링크)를 클릭했을 때 클라이언트가 호출.
app.post('/api/auth/verify-email', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: '인증 토큰이 없습니다.' });

  const user = users.find(u => u.emailVerificationToken === token);
  if (!user) return res.status(400).json({ error: '인증 링크가 유효하지 않습니다. 이미 사용됐거나 잘못된 링크일 수 있습니다.' });
  if (!user.emailVerificationTokenExpiresAt || user.emailVerificationTokenExpiresAt < Date.now()) {
    return res.status(400).json({ error: '인증 링크가 만료되었습니다. 인증 메일을 다시 받아주세요.' });
  }

  user.emailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationTokenExpiresAt = undefined;
  await addUser(user);

  res.json({ success: true, message: '이메일 인증이 완료되었습니다.' });
});

// [추가] 인증 메일을 못 받았거나 링크가 만료된 경우 재전송. 무제한으로 보낼 수 있으면
// 메일 폭탄에 악용될 수 있어 이메일+IP 기준으로 15분에 3회까지만 허용한다.
const resendVerificationRateLimiter = new RateLimiter({ maxAttempts: 3, windowMs: 15 * 60 * 1000 });

app.post('/api/auth/resend-verification', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: '이메일을 입력해주세요.' });

  const normalizedEmail = String(email).trim().toLowerCase();
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  const resendKey = `${normalizedEmail}::${clientIp}`;
  const limitCheck = resendVerificationRateLimiter.check(resendKey);
  resendVerificationRateLimiter.registerAttempt(resendKey);
  if (!limitCheck.allowed) {
    return res.status(429).json({ error: `요청이 너무 많습니다. ${limitCheck.retryAfterSec}초 후 다시 시도해주세요.` });
  }

  const user = users.find(u => u.email.toLowerCase() === normalizedEmail);
  // 보안상 가입 여부를 알려주지 않고, 항상 같은 응답을 준다.
  if (user && !isEmailVerified(user.emailVerified) && isMailerConfigured) {
    user.emailVerificationToken = crypto.randomBytes(32).toString('hex');
    user.emailVerificationTokenExpiresAt = Date.now() + 24 * 60 * 60 * 1000;
    await addUser(user);
    try {
      const verifyUrl = `${APP_BASE_URL}/?verifyToken=${user.emailVerificationToken}`;
      await sendEmail({
        to: user.email,
        subject: '[BizCard Pro] 이메일 주소를 인증해주세요',
        html: `
          <p>안녕하세요, ${escapeHtml(user.name)}님.</p>
          <p>아래 버튼을 눌러 이메일 인증을 완료해주세요 (24시간 이내 유효).</p>
          <p><a href="${verifyUrl}" style="display:inline-block;padding:10px 20px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:8px;">이메일 인증하기</a></p>
          <p>버튼이 안 눌리면 이 링크를 브라우저에 붙여넣어주세요: ${verifyUrl}</p>
        `
      });
    } catch (err) {
      console.error('인증 메일 재전송 실패:', err);
    }
  }

  res.json({ success: true, message: '입력하신 이메일로 가입된 미인증 계정이 있다면, 인증 메일을 다시 보내드렸습니다.' });
});

// [수정] 로그아웃: 서버 세션을 즉시 무효화하고 쿠키를 지운다.
app.post('/api/auth/logout', async (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[SESSION_COOKIE_NAME];
  if (token) {
    sessions.delete(token);
    await deleteSession(token);
  }
  clearSessionCookie(res);
  res.json({ success: true });
});

// [수정] 새로고침/재방문 시 프런트가 로컬에 저장해둔 로그인 정보가 아직 유효한지
// 서버 세션 기준으로 재확인하기 위한 엔드포인트.
app.get('/api/auth/me', (req, res) => {
  const userId = req.headers['x-user-id'] as string; // 세션 미들웨어가 검증한 경우에만 존재
  const user = userId ? users.find(u => u.id === userId) : undefined;
  if (!user) return res.status(401).json({ error: '로그인이 필요합니다.' });
  res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      type: user.type,
      companyName: user.companyName,
      businessNumber: user.businessNumber,
      position: user.position,
      role: user.role,
      approvalStatus: user.approvalStatus,
      emailVerified: isEmailVerified(user.emailVerified)
    }
  });
});

// ------------------------------------------------------------------
// 🔑 비밀번호 찾기 (이메일로 재설정 링크 발송)
// 토큰은 메모리에만 저장 (서버 재시작 시 만료된 요청은 그냥 다시 받으면 됨). 유효시간 30분.
// ------------------------------------------------------------------
const passwordResetTokens = new Map<string, { userId: string; expiresAt: number }>();
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000; // 30분

// [수정] 로그인과 같은 방식의 레이트리밋을 비밀번호 찾기에도 적용한다. 이게 없으면
// 봇이 특정 이메일로 재설정 요청을 반복 호출해 "메일 폭탄"을 보내거나, 메일 발송
// API(Brevo) 사용량을 소진시킬 수 있다. 로그인보다는 더 관대하게(15분에 3회) 둔다 —
// 정상 사용자도 메일이 안 왔다고 몇 번 다시 누를 수 있기 때문이다.
const forgotPasswordRateLimiter = new RateLimiter({ maxAttempts: 3, windowMs: 15 * 60 * 1000 });

app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: '이메일을 입력해주세요.' });

  const normalizedEmail = String(email).trim().toLowerCase();
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  const forgotKey = `${normalizedEmail}::${clientIp}`;
  const limitCheck = forgotPasswordRateLimiter.check(forgotKey);
  forgotPasswordRateLimiter.registerAttempt(forgotKey);
  if (!limitCheck.allowed) {
    // 보안상 "가입 여부"는 여전히 숨기되, 너무 잦은 요청 자체는 막는다.
    return res.status(429).json({ error: `요청이 너무 많습니다. ${limitCheck.retryAfterSec}초 후 다시 시도해주세요.` });
  }

  const user = users.find(u => u.email.toLowerCase() === normalizedEmail);

  // 보안상 "가입된 이메일인지" 여부를 응답으로 알려주지 않는다 (등록 여부와 상관없이 동일한 안내).
  if (user && isMailerConfigured) {
    // [수정] 새 토큰을 발급하기 전에 이 사용자의 기존 재설정 토큰을 먼저 무효화한다.
    // 안 그러면 예전에 받은 메일 링크가 새 링크와 함께 계속 유효한 상태로 남는다.
    for (const [existingToken, entry] of passwordResetTokens.entries()) {
      if (entry.userId === user.id) passwordResetTokens.delete(existingToken);
    }

    const token = crypto.randomBytes(32).toString('hex');
    passwordResetTokens.set(token, { userId: user.id, expiresAt: Date.now() + RESET_TOKEN_TTL_MS });

    const resetUrl = `${APP_BASE_URL}/?resetToken=${token}`;
    try {
      await sendEmail({
        to: user.email,
        toName: user.name,
        subject: '[BizCard Pro] 비밀번호 재설정 안내',
        html: `
          <div style="font-family: 'Malgun Gothic', sans-serif; padding: 24px; color:#111;">
            <h2 style="margin-bottom:4px;">비밀번호 재설정</h2>
            <p style="color:#555;">${user.name}님, 비밀번호 재설정을 요청하셨습니다. 아래 버튼을 눌러 새 비밀번호를 설정해주세요.</p>
            <p style="color:#999; font-size:12px;">이 링크는 30분 동안만 유효합니다. 본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다.</p>
            <a href="${resetUrl}" style="display:inline-block; margin-top:12px; padding:10px 22px; background:#4f46e5; color:#fff; text-decoration:none; border-radius:8px; font-weight:bold;">새 비밀번호 설정하기</a>
          </div>
        `
      });
      console.log(`[mailer] ${user.email}에게 비밀번호 재설정 메일 발송 완료`);
    } catch (err) {
      console.error(`[mailer] ${user.email}에게 비밀번호 재설정 메일 발송 실패:`, err);
    }
  } else if (user && !isMailerConfigured) {
    console.warn('[mailer] 메일 미설정으로 비밀번호 재설정 메일을 보내지 못했습니다.');
  }

  res.json({ success: true, message: '입력하신 이메일로 가입된 계정이 있다면, 비밀번호 재설정 안내 메일을 보내드렸습니다.' });
});

app.post('/api/auth/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) return res.status(400).json({ error: '재설정 토큰과 새 비밀번호를 모두 입력해주세요.' });
  // [수정] 회원가입 시 요구하는 최소 길이(8자)와 통일 (그동안 재설정은 4자만 요구해서 우회 가능했음)
  if (String(newPassword).length < 8) return res.status(400).json({ error: '비밀번호는 8자 이상이어야 합니다.' });

  const entry = passwordResetTokens.get(token);
  if (!entry || entry.expiresAt < Date.now()) {
    passwordResetTokens.delete(token);
    return res.status(400).json({ error: '재설정 링크가 만료되었거나 유효하지 않습니다. 비밀번호 찾기를 다시 요청해주세요.' });
  }

  const user = users.find(u => u.id === entry.userId);
  if (!user) {
    passwordResetTokens.delete(token);
    return res.status(404).json({ error: '계정을 찾을 수 없습니다.' });
  }

  user.password = bcrypt.hashSync(newPassword, 10);
  await addUser(user);
  passwordResetTokens.delete(token);

  // [수정] 비밀번호가 바뀌었으니, 그동안 이 계정으로 로그인돼 있던 세션(공격자 것일 수도 있는)을
  // 전부 끊는다. 지금 이 요청으로 새로 로그인시키지는 않으므로, 사용자는 새 비밀번호로 다시
  // 로그인해야 한다 — 이건 의도된 동작이다.
  await invalidateAllSessionsForUser(user.id);

  res.json({ success: true, message: '비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요.' });
});

// 👥 Registered Users Directory API
app.get('/api/auth/users', (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  const requester = users.find(u => u.id === userId);
  if (!requester) {
    return res.status(401).json({ error: '로그인이 필요합니다.' });
  }

  const toPublicShape = (u: RegisteredUser) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    phone: u.phone,
    type: u.type,
    companyName: u.companyName,
    businessNumber: u.businessNumber,
    position: u.position,
    role: u.role,
    approvalStatus: u.approvalStatus,
    createdAt: u.createdAt
  });

  // [수정] 개발자(운영자) 계정은 전체 가입 회원(모든 회사 포함)을 다 볼 수 있다.
  // 그 외 일반 회원(회사 관리자 포함)은 "같은 회사(사업자번호 기준)" 사람만 볼 수 있다.
  // 개인 회원은 다른 회사/개인 정보를 볼 필요가 없으므로 본인 정보만 반환한다.
  let visible: RegisteredUser[];
  if (requester.email === ADMIN_EMAIL) {
    visible = users;
  } else if (requester.type === 'company') {
    const bNum = (requester.businessNumber || '').trim().toLowerCase();
    visible = users.filter(u =>
      u.type === 'company' && (u.businessNumber || '').trim().toLowerCase() === bNum
    );
  } else {
    visible = [requester];
  }

  res.json(visible.map(toPublicShape));
});

// 진단용: 같은 이메일로 여러 계정이 만들어진 경우(예: 개인+사업자 중복 가입)를 찾아서 보여준다.
// 삭제는 안전을 위해 여기서 하지 않고, 확인 후 Supabase 테이블 편집기에서 직접 지우는 걸 권장한다.
app.get('/api/auth/duplicate-emails', async (req, res) => {
  const all = isSupabaseConfigured ? await getUsers() : users;
  const byEmail = new Map<string, RegisteredUser[]>();
  for (const u of all) {
    const key = u.email.toLowerCase();
    if (!byEmail.has(key)) byEmail.set(key, []);
    byEmail.get(key)!.push(u);
  }
  const duplicates = Array.from(byEmail.entries())
    .filter(([, list]) => list.length > 1)
    .map(([email, list]) => ({
      email,
      accounts: list.map(u => ({ id: u.id, type: u.type, companyName: u.companyName, businessNumber: u.businessNumber, position: u.position, role: u.role }))
    }));
  res.json({ duplicateCount: duplicates.length, duplicates });
});

// 회사 스코프 판별에 쓰이는 것과 동일한 규칙 (resolveScopeId와 반드시 일치시켜야 함)
// [수정] 예전엔 "회사명 + 사업자번호"로 스코프를 구분했는데, 같은 회사라도 가입할 때
// "(주)OO"와 "주식회사OO"처럼 회사명 표기가 조금만 달라도 완전히 다른 회사로 취급되어
// 데이터가 쪼개지는 문제가 있었다(카이저솔루션에서 실제로 발생). 사업자등록번호는
// 법적으로 회사마다 유일하고 표기가 갈릴 일이 없으므로, 이제는 사업자번호 하나만으로
// 회사를 구분한다.
// [수정] 이 함수는 이제 src/authLogic.ts로 옮겨서 단위 테스트를 붙였다 (아래 import 참고).
// 로직 자체는 그대로: 회사 계정은 사업자등록번호로, 개인 계정은 본인 id로 스코프를 나눈다.

// 관리자 전용: 같은 회사 소속 사용자의 직책/권한 수정 (결재라인 매칭 및 직원 관리용)
app.put('/api/auth/users/:targetId', async (req, res) => {
  const requesterId = req.headers['x-user-id'] as string;
  const requester = users.find(u => u.id === requesterId);
  if (!requester) return res.status(401).json({ error: '로그인이 필요합니다.' });
  if (requester.role !== 'admin') return res.status(403).json({ error: '관리자만 직원 정보를 수정할 수 있습니다.' });

  const target = users.find(u => u.id === req.params.targetId);
  if (!target) return res.status(404).json({ error: '대상 사용자를 찾을 수 없습니다.' });
  if (scopeIdForUser(requester) !== scopeIdForUser(target)) {
    return res.status(403).json({ error: '같은 회사 소속 사용자만 수정할 수 있습니다.' });
  }

  const { position, role } = req.body;
  const prevRole = target.role;
  if (typeof position === 'string') target.position = position;
  if (role === 'admin' || role === 'member') target.role = role;
  await addUser(target);

  // [추가] 관리자가 동료 역할을 바꾼 기록을 남긴다.
  if (role && role !== prevRole) {
    await logAudit({
      scopeId: scopeIdForUser(requester),
      actorUserId: requester.id,
      actorEmail: requester.email,
      action: 'role_change',
      targetUserId: target.id,
      targetEmail: target.email,
      detail: { from: prevRole || null, to: target.role }
    });
  }

  res.json({ success: true, user: { id: target.id, email: target.email, name: target.name, position: target.position, role: target.role } });
});

// 관리자 전용: 최근 관리자 작업 감사 로그 조회 (역할 변경, 승인/거절 등)
// [추가] 운영자 전용: 사업자번호는 같은데 회사명 표기가 갈려서(예: "(주)OO" vs "주식회사 OO")
// 화면에 별도 회사로 나뉘어 보이는 사례를 전체 훑어서 찾아준다. 실제 데이터(명함 등)는
// 사업자번호 기준으로 이미 공유되고 있으니, 여기서는 "표시용 회사명"만 통일하면 된다.
app.get('/api/admin/company-name-mismatches', (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  const requester = users.find(u => u.id === userId);
  if (!requester || requester.email !== ADMIN_EMAIL) {
    return res.status(403).json({ error: '접근 권한이 없습니다.' });
  }

  const byBusinessNumber = new Map<string, { companyName: string; count: number }[]>();
  for (const u of users) {
    if (u.type !== 'company' || !u.businessNumber) continue;
    const bNum = u.businessNumber.trim();
    const cName = (u.companyName || '').trim();
    if (!bNum || !cName) continue;
    const arr = byBusinessNumber.get(bNum) || [];
    const found = arr.find(x => x.companyName === cName);
    if (found) found.count++; else arr.push({ companyName: cName, count: 1 });
    byBusinessNumber.set(bNum, arr);
  }

  const mismatches = Array.from(byBusinessNumber.entries())
    .filter(([, names]) => names.length > 1)
    .map(([businessNumber, names]) => ({ businessNumber, variants: names }));

  res.json(mismatches);
});

// [추가] 운영자 전용: 특정 사업자번호에 속한 모든 사용자의 회사명 표기를 하나로 통일한다.
app.post('/api/admin/normalize-company-name', async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  const requester = users.find(u => u.id === userId);
  if (!requester || requester.email !== ADMIN_EMAIL) {
    return res.status(403).json({ error: '접근 권한이 없습니다.' });
  }

  const { businessNumber, canonicalName } = req.body;
  if (!businessNumber || !canonicalName) {
    return res.status(400).json({ error: 'businessNumber와 canonicalName이 모두 필요합니다.' });
  }

  const bNum = String(businessNumber).trim();
  const targets = users.filter(u => u.type === 'company' && (u.businessNumber || '').trim() === bNum);
  if (targets.length === 0) {
    return res.status(404).json({ error: '해당 사업자번호로 가입된 사용자가 없습니다.' });
  }

  let updatedCount = 0;
  for (const u of targets) {
    if (u.companyName !== canonicalName) {
      u.companyName = canonicalName;
      await addUser(u);
      updatedCount++;
    }
  }

  await logAudit({
    scopeId: `company:${bNum}`,
    actorUserId: requester.id,
    actorEmail: requester.email,
    action: 'company_name_normalized',
    detail: { businessNumber: bNum, canonicalName, updatedCount }
  });

  res.json({ success: true, updatedCount });
});

app.get('/api/auth/audit-logs', async (req, res) => {
  const requesterId = req.headers['x-user-id'] as string;
  const requester = users.find(u => u.id === requesterId);
  if (!requester) return res.status(401).json({ error: '로그인이 필요합니다.' });
  if (requester.role !== 'admin') return res.status(403).json({ error: '관리자만 조회할 수 있습니다.' });

  const logs = await getAuditLogs(scopeIdForUser(requester));
  res.json(logs);
});

// [추가] 관리자 전용: 우리 회사(또는 내 개인 계정) 데이터 전체를 JSON 하나로 내려받는다.
// 명함/프로젝트/차량/업무일지 등 이 스코프의 모든 데이터를 백업 목적으로 한 번에 export.
// 개인(individual) 계정은 본인 데이터니까 role 제한 없이 내려받을 수 있고, 회사 계정은
// admin만 가능하다(직원이 회사 전체 데이터를 통째로 빼갈 수 없도록).
// [추가] 로그인/관리자 권한이 필요하긴 하지만, 반복 호출로 DB에 부하를 줄 수 있어
// 계정 기준으로 5분에 3회까지만 허용한다.
const backupExportRateLimiter = new RateLimiter({ maxAttempts: 3, windowMs: 5 * 60 * 1000 });

app.get('/api/backup/export', async (req, res) => {
  const requesterId = req.headers['x-user-id'] as string;
  const requester = users.find(u => u.id === requesterId);
  if (!requester) return res.status(401).json({ error: '로그인이 필요합니다.' });
  if (requester.type === 'company' && requester.role !== 'admin') {
    return res.status(403).json({ error: '회사 계정은 관리자만 전체 백업을 내려받을 수 있습니다.' });
  }
  const backupLimit = backupExportRateLimiter.check(requester.id);
  backupExportRateLimiter.registerAttempt(requester.id);
  if (!backupLimit.allowed) {
    return res.status(429).json({ error: `요청이 너무 많습니다. ${backupLimit.retryAfterSec}초 후 다시 시도해주세요.` });
  }

  const dbData = getScopedData(req);
  const backup = {
    exportedAt: new Date().toISOString(),
    exportedBy: { id: requester.id, email: requester.email, name: requester.name },
    scope: requester.type === 'company'
      ? { type: 'company', companyName: requester.companyName, businessNumber: requester.businessNumber }
      : { type: 'individual' },
    data: {
      contacts: dbData.contacts,
      projects: dbData.projects,
      groups: dbData.groups,
      myProfile: dbData.myProfile,
      vehicles: dbData.vehicles,
      drivingLogs: dbData.drivingLogs,
      expenses: dbData.expenses,
      maintenances: dbData.maintenances,
      maintenanceIntervals: dbData.maintenanceIntervals,
      dailyLogs: dbData.dailyLogs,
      weeklyLogs: dbData.weeklyLogs,
      advancePayments: dbData.advancePayments,
      leaveRequests: dbData.leaveRequests
    }
  };

  await logAudit({
    scopeId: scopeIdForUser(requester),
    actorUserId: requester.id,
    actorEmail: requester.email,
    action: 'data_backup_export'
  });

  const dateStr = new Date().toISOString().split('T')[0];
  res.setHeader('Content-Disposition', `attachment; filename="bizcard-backup-${dateStr}.json"`);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.send(JSON.stringify(backup, null, 2));
});

// ------------------------------------------------------------------
// 🗑️ 회원 탈퇴
// [추가] 개인정보처리방침에 "회원 탈퇴를 요청한 경우 지체 없이 파기한다"고 명시돼 있는데,
// 정작 탈퇴 기능이 없었다. 세션 탈취 등으로 악용되지 않도록 비밀번호 재확인을 받는다.
//
// - 개인(individual) 계정: 그 스코프가 곧 본인 데이터 전부이므로, 명함/프로젝트/차량기록
//   등을 전부 지우고 계정도 삭제한다.
// - 회사(company) 계정: 동료들과 데이터를 공유하는 구조라, 회사 데이터까지 지우면 다른
//   사람들 업무가 멈춘다. 그래서 "이 사람 계정"만 지우고 회사 데이터는 그대로 둔다.
//   단, 그 회사의 유일한 관리자인데 다른 동료가 남아있으면, 관리자가 없어져 아무도
//   승인/관리를 못 하게 되므로 먼저 다른 사람에게 관리자 권한을 넘기도록 안내하고 막는다.
// ------------------------------------------------------------------
app.post('/api/auth/withdraw', async (req, res) => {
  const requesterId = req.headers['x-user-id'] as string;
  const requester = users.find(u => u.id === requesterId);
  if (!requester) return res.status(401).json({ error: '로그인이 필요합니다.' });

  const { password } = req.body;
  if (!password || !verifyPassword(password, requester.password)) {
    return res.status(401).json({ error: '비밀번호가 일치하지 않습니다.' });
  }

  if (requester.type === 'company' && requester.role === 'admin') {
    const scopeId = scopeIdForUser(requester);
    const otherMembersExist = users.some(u => u.id !== requester.id && scopeIdForUser(u) === scopeId);
    const anotherAdminExists = users.some(u => u.id !== requester.id && scopeIdForUser(u) === scopeId && u.role === 'admin');
    if (otherMembersExist && !anotherAdminExists) {
      return res.status(400).json({
        error: '아직 소속된 동료가 있는데 관리자가 본인 한 명뿐입니다. 다른 동료를 관리자로 먼저 지정한 뒤 탈퇴해주세요.'
      });
    }
  }

  await logAudit({
    scopeId: scopeIdForUser(requester),
    actorUserId: requester.id,
    actorEmail: requester.email,
    action: 'account_withdraw',
    detail: { type: requester.type }
  });

  // 개인 계정만 데이터까지 완전히 파기 (회사 계정은 동료 공유 데이터라 계정만 삭제)
  if (requester.type === 'individual') {
    const scopeId = scopeIdForUser(requester);
    delete db[scopeId];
    await deleteScopeCompletely(scopeId);
  }

  users = users.filter(u => u.id !== requester.id);
  await deleteUser(requester.id);
  await invalidateAllSessionsForUser(requester.id);
  clearSessionCookie(res);

  res.json({ success: true, message: '탈퇴 처리가 완료되었습니다.' });
});

// ------------------------------------------------------------------
// 💳 구독/결제 (토스페이먼츠 자동결제)
// [추가] 인원(좌석)당 요금 × 승인된 회사 구성원 수로 매달 자동결제한다.
// 결제 관리는 그 회사의 관리자(admin) 계정 기준으로 이뤄진다 — 회사 전체가 admin 한 명의
// 카드로 결제되는 구조다. 개인(individual) 계정도 동일한 방식으로 구독할 수 있다(좌석 1개 고정).
//
// ⚠️ 실제 운영(라이브 키)에서 자동결제를 쓰려면 토스페이먼츠 고객센터(1544-7772,
// support@tosspayments.com)로 별도 계약을 먼저 신청해야 한다. 테스트 키로는 지금 바로
// 테스트할 수 있다.
// ------------------------------------------------------------------
const TOSS_SECRET_KEY = process.env.TOSS_SECRET_KEY || '';
const SUBSCRIPTION_PRICE_PER_SEAT_KRW = Number(process.env.SUBSCRIPTION_PRICE_PER_SEAT_KRW) || 5000;

function seatCountForScope(scopeId: string): number {
  // 승인된(=실제로 서비스를 쓸 수 있는) 구성원 수만 과금 대상으로 센다. 개인 계정은 항상 1석.
  return Math.max(1, users.filter(u => scopeIdForUser(u) === scopeId && u.approvalStatus !== 'pending').length);
}

function billingOwnerForRequester(requester: RegisteredUser): RegisteredUser | null {
  // 회사 계정이면 결제를 관리하는 사람은 "그 회사의 관리자"다 (일반 사용자는 결제를 만들 수 없다).
  // 개인 계정이면 본인이 곧 결제 주체다.
  if (requester.type === 'individual') return requester;
  if (requester.role === 'admin') return requester;
  return null;
}

// 구독 시작 전, 토스 카드 등록창(requestBillingAuth)에 넘길 고객키를 발급/조회한다.
app.get('/api/billing/customer-key', (req, res) => {
  const requesterId = req.headers['x-user-id'] as string;
  const requester = users.find(u => u.id === requesterId);
  if (!requester) return res.status(401).json({ error: '로그인이 필요합니다.' });
  const owner = billingOwnerForRequester(requester);
  if (!owner) return res.status(403).json({ error: '회사 계정은 관리자만 구독을 관리할 수 있습니다.' });

  if (!owner.tossCustomerKey) {
    owner.tossCustomerKey = generateCustomerKey();
    addUser(owner).catch((err) => console.error('customerKey 저장 실패:', err));
  }
  res.json({ customerKey: owner.tossCustomerKey });
});

// 카드 등록 완료(카드 등록창에서 authKey를 받은 뒤) → 빌링키 발급 및 저장
app.post('/api/billing/register-card', async (req, res) => {
  const requesterId = req.headers['x-user-id'] as string;
  const requester = users.find(u => u.id === requesterId);
  if (!requester) return res.status(401).json({ error: '로그인이 필요합니다.' });
  const owner = billingOwnerForRequester(requester);
  if (!owner) return res.status(403).json({ error: '회사 계정은 관리자만 구독을 관리할 수 있습니다.' });
  if (!TOSS_SECRET_KEY) return res.status(500).json({ error: '결제 기능이 아직 설정되지 않았습니다 (TOSS_SECRET_KEY 없음).' });

  const { authKey } = req.body;
  if (!authKey || !owner.tossCustomerKey) {
    return res.status(400).json({ error: '카드 등록 정보가 올바르지 않습니다. 처음부터 다시 시도해주세요.' });
  }

  try {
    const result = await issueBillingKey(TOSS_SECRET_KEY, authKey, owner.tossCustomerKey);
    owner.tossBillingKey = result.billingKey;
    await addUser(owner);
    await logAudit({
      scopeId: scopeIdForUser(owner),
      actorUserId: owner.id,
      actorEmail: owner.email,
      action: 'billing_card_registered'
    });
    res.json({ success: true, card: result.card });
  } catch (err: any) {
    console.error('카드 등록 실패:', err);
    res.status(400).json({ error: err.message || '카드 등록에 실패했습니다.' });
  }
});

// 구독 시작: 등록된 빌링키로 이번 달분을 즉시 결제하고, 다음 결제일을 잡는다.
app.post('/api/billing/subscribe', async (req, res) => {
  const requesterId = req.headers['x-user-id'] as string;
  const requester = users.find(u => u.id === requesterId);
  if (!requester) return res.status(401).json({ error: '로그인이 필요합니다.' });
  const owner = billingOwnerForRequester(requester);
  if (!owner) return res.status(403).json({ error: '회사 계정은 관리자만 구독을 관리할 수 있습니다.' });
  if (!TOSS_SECRET_KEY) return res.status(500).json({ error: '결제 기능이 아직 설정되지 않았습니다 (TOSS_SECRET_KEY 없음).' });
  if (!owner.tossBillingKey || !owner.tossCustomerKey) {
    return res.status(400).json({ error: '먼저 카드를 등록해주세요.' });
  }

  const scopeId = scopeIdForUser(owner);
  const seats = seatCountForScope(scopeId);
  const amount = seats * SUBSCRIPTION_PRICE_PER_SEAT_KRW;

  try {
    await chargeBilling(TOSS_SECRET_KEY, owner.tossBillingKey, {
      customerKey: owner.tossCustomerKey,
      amount,
      orderId: generateOrderId(),
      orderName: `BizCard Pro 구독 (좌석 ${seats}개)`,
      customerEmail: owner.email,
      customerName: owner.name
    });

    owner.plan = 'pro';
    owner.subscriptionStatus = 'active';
    owner.nextBillingAt = addOneMonth(new Date()).toISOString();
    await addUser(owner);
    await logAudit({
      scopeId,
      actorUserId: owner.id,
      actorEmail: owner.email,
      action: 'subscription_started',
      detail: { seats, amount }
    });

    res.json({ success: true, plan: owner.plan, nextBillingAt: owner.nextBillingAt, amount });
  } catch (err: any) {
    console.error('구독 결제 실패:', err);
    res.status(400).json({ error: err.message || '결제에 실패했습니다.' });
  }
});

// 구독 해지: 지금 당장 기능을 끊지 않고, 이미 결제한 이번 결제 주기가 끝날 때까지는 pro를 유지한다
// (일반적인 구독 서비스 관례 — 이미 낸 돈만큼은 계속 쓸 수 있게).
app.post('/api/billing/cancel', async (req, res) => {
  const requesterId = req.headers['x-user-id'] as string;
  const requester = users.find(u => u.id === requesterId);
  if (!requester) return res.status(401).json({ error: '로그인이 필요합니다.' });
  const owner = billingOwnerForRequester(requester);
  if (!owner) return res.status(403).json({ error: '회사 계정은 관리자만 구독을 관리할 수 있습니다.' });
  if (owner.subscriptionStatus !== 'active') {
    return res.status(400).json({ error: '진행 중인 구독이 없습니다.' });
  }

  owner.subscriptionStatus = 'canceled';
  await addUser(owner);
  await logAudit({
    scopeId: scopeIdForUser(owner),
    actorUserId: owner.id,
    actorEmail: owner.email,
    action: 'subscription_canceled'
  });

  res.json({ success: true, message: `구독이 해지되었습니다. ${owner.nextBillingAt ? new Date(owner.nextBillingAt).toLocaleDateString('ko-KR') + '까지는 계속 이용하실 수 있어요.' : ''}` });
});

// 현재 구독 상태 조회 — 회사 계정이면 일반 사용자도 "우리 회사가 pro인지"는 볼 수 있어야 하므로
// role 제한 없이 조회 가능하게 하되, 결제 자체(등록/구독/해지)는 admin만 가능하다.
app.get('/api/billing/status', (req, res) => {
  const requesterId = req.headers['x-user-id'] as string;
  const requester = users.find(u => u.id === requesterId);
  if (!requester) return res.status(401).json({ error: '로그인이 필요합니다.' });

  const scopeId = scopeIdForUser(requester);
  const owner = requester.type === 'individual'
    ? requester
    : users.find(u => scopeIdForUser(u) === scopeId && u.role === 'admin');

  const seats = seatCountForScope(scopeId);
  res.json({
    plan: owner?.plan || 'free',
    subscriptionStatus: owner?.subscriptionStatus || 'none',
    nextBillingAt: owner?.nextBillingAt || null,
    hasCardRegistered: Boolean(owner?.tossBillingKey),
    seats,
    pricePerSeat: SUBSCRIPTION_PRICE_PER_SEAT_KRW,
    estimatedMonthlyAmount: seats * SUBSCRIPTION_PRICE_PER_SEAT_KRW,
    // 결제 관리(카드 등록/구독/해지)를 이 사람이 할 수 있는지
    canManageBilling: Boolean(billingOwnerForRequester(requester))
  });
});

// [추가] 실제 매달 자동결제를 처리하는 함수. active 구독 중 결제일이 된 사람은 청구하고,
// canceled 상태에서 결제 주기가 끝난 사람은 free로 내린다.
// 이 서버 프로세스가 계속 켜져 있다는 전제로 아래에 주기적 인터벌도 걸어두지만, Render 무료
// 요금제처럼 서버가 잠들 수 있는 환경에서는 그 시간 동안 청구가 밀릴 수 있다. 더 안정적으로
// 하려면 외부 크론(예: cron-job.org, GitHub Actions 스케줄)이 아래 /api/billing/run-scheduled
// 엔드포인트를 매일 한 번씩 호출하도록 설정하는 걸 권장한다 (해당 라우트 주석 참고).
async function runScheduledBilling(): Promise<{ charged: number; failed: number; downgraded: number }> {
  const now = new Date();
  let charged = 0, failed = 0, downgraded = 0;

  for (const owner of [...users]) {
    if (owner.type === 'company' && owner.role !== 'admin') continue; // 관리자 계정만 결제 주체
    if (!owner.nextBillingAt) continue;
    if (new Date(owner.nextBillingAt) > now) continue;

    const scopeId = scopeIdForUser(owner);

    if (owner.subscriptionStatus === 'active') {
      if (!owner.tossBillingKey || !owner.tossCustomerKey || !TOSS_SECRET_KEY) continue;
      const seats = seatCountForScope(scopeId);
      const amount = seats * SUBSCRIPTION_PRICE_PER_SEAT_KRW;
      try {
        await chargeBilling(TOSS_SECRET_KEY, owner.tossBillingKey, {
          customerKey: owner.tossCustomerKey,
          amount,
          orderId: generateOrderId(),
          orderName: `BizCard Pro 구독 갱신 (좌석 ${seats}개)`,
          customerEmail: owner.email,
          customerName: owner.name
        });
        owner.nextBillingAt = addOneMonth(now).toISOString();
        await addUser(owner);
        await logAudit({ scopeId, actorUserId: owner.id, actorEmail: owner.email, action: 'subscription_renewed', detail: { seats, amount } });
        charged++;
      } catch (err) {
        console.error(`정기결제 실패 (${owner.email}):`, err);
        owner.subscriptionStatus = 'past_due';
        await addUser(owner);
        await logAudit({ scopeId, actorUserId: owner.id, actorEmail: owner.email, action: 'subscription_payment_failed' });
        failed++;
      }
    } else if (owner.subscriptionStatus === 'canceled') {
      owner.plan = 'free';
      owner.nextBillingAt = undefined;
      await addUser(owner);
      await logAudit({ scopeId, actorUserId: owner.id, actorEmail: owner.email, action: 'subscription_downgraded_to_free' });
      downgraded++;
    }
  }

  return { charged, failed, downgraded };
}

// 서버가 켜져 있는 동안, 1시간마다 결제일이 된 구독을 확인한다 (최소한의 자체 스케줄러).
setInterval(() => {
  runScheduledBilling().catch((err) => console.error('runScheduledBilling 실패:', err));
}, 60 * 60 * 1000);

// [추가] 외부 크론 서비스가 매일 호출할 수 있는 엔드포인트. 서버가 잠들었다 깨어나는 배포
// 환경에서도, 외부에서 이 주소를 정기적으로 때려주면 결제가 안정적으로 돌아간다.
// CRON_SECRET 환경변수를 설정해두면, 그 값을 아는 요청만 실행할 수 있다(아무나 못 누르게).
app.post('/api/billing/run-scheduled', async (req, res) => {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers['x-cron-secret'] !== cronSecret) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  try {
    const result = await runScheduledBilling();
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message || '스케줄 처리 중 오류가 발생했습니다.' });
  }
});

// ------------------------------------------------------------------
// 🚧 회사 가입 승인 관리 (관리자 전용)
// [추가] 같은 회사(사업자번호)로 새로 가입한 사람은 관리자가 승인해야 실제로
// 회사 데이터(명함/프로젝트 등)에 접근할 수 있다. 아래 3개 API로 그 승인 절차를 관리한다.
// ------------------------------------------------------------------

// 우리 회사의 승인 대기 중인 가입 신청자 목록
app.get('/api/auth/pending-members', (req, res) => {
  const requesterId = req.headers['x-user-id'] as string;
  const requester = users.find(u => u.id === requesterId);
  if (!requester) return res.status(401).json({ error: '로그인이 필요합니다.' });
  if (requester.role !== 'admin') return res.status(403).json({ error: '관리자만 조회할 수 있습니다.' });

  const pending = users.filter(u =>
    u.type === 'company' &&
    u.approvalStatus === 'pending' &&
    scopeIdForUser(u) === scopeIdForUser(requester)
  );
  res.json(pending.map(u => ({
    id: u.id,
    email: u.email,
    name: u.name,
    phone: u.phone,
    position: u.position,
    createdAt: u.createdAt
  })));
});

// 가입 승인: 이때부터 그 사람이 우리 회사 데이터에 접근할 수 있게 된다
app.post('/api/auth/pending-members/:targetId/approve', async (req, res) => {
  const requesterId = req.headers['x-user-id'] as string;
  const requester = users.find(u => u.id === requesterId);
  if (!requester) return res.status(401).json({ error: '로그인이 필요합니다.' });
  if (requester.role !== 'admin') return res.status(403).json({ error: '관리자만 승인할 수 있습니다.' });

  const target = users.find(u => u.id === req.params.targetId);
  if (!target) return res.status(404).json({ error: '대상 사용자를 찾을 수 없습니다.' });
  if (scopeIdForUser(requester) !== scopeIdForUser(target)) {
    return res.status(403).json({ error: '같은 회사 소속 신청자만 승인할 수 있습니다.' });
  }

  target.approvalStatus = 'approved';
  await addUser(target);
  await logAudit({
    scopeId: scopeIdForUser(requester),
    actorUserId: requester.id,
    actorEmail: requester.email,
    action: 'member_approve',
    targetUserId: target.id,
    targetEmail: target.email
  });
  res.json({ success: true });
});

// 가입 거절: 그 신청 자체를 계정과 함께 삭제한다 (거절된 사람은 같은 이메일로 재가입 가능)
app.post('/api/auth/pending-members/:targetId/reject', async (req, res) => {
  const requesterId = req.headers['x-user-id'] as string;
  const requester = users.find(u => u.id === requesterId);
  if (!requester) return res.status(401).json({ error: '로그인이 필요합니다.' });
  if (requester.role !== 'admin') return res.status(403).json({ error: '관리자만 거절할 수 있습니다.' });

  const target = users.find(u => u.id === req.params.targetId);
  if (!target) return res.status(404).json({ error: '대상 사용자를 찾을 수 없습니다.' });
  if (scopeIdForUser(requester) !== scopeIdForUser(target)) {
    return res.status(403).json({ error: '같은 회사 소속 신청자만 거절할 수 있습니다.' });
  }
  if (target.approvalStatus !== 'pending') {
    return res.status(400).json({ error: '이미 처리된 신청입니다.' });
  }

  // [수정] 계정을 지우기 전에 감사 로그부터 남긴다 (지운 뒤에는 대상 이메일 등 정보가 사라짐).
  await logAudit({
    scopeId: scopeIdForUser(requester),
    actorUserId: requester.id,
    actorEmail: requester.email,
    action: 'member_reject',
    targetUserId: target.id,
    targetEmail: target.email
  });

  users = users.filter(u => u.id !== target.id);
  await deleteUser(target.id);
  await invalidateAllSessionsForUser(target.id); // 혹시 로그인돼 있었다면 세션도 끊는다
  res.json({ success: true });
});

// 📁 Scoped CRUD APIs
// [추가] 예전 가짜 좌표 배정 방식으로 이미 저장된 기존 명함들을 실제 좌표로 다시 계산한다.
// 주소가 있는 명함만 대상으로, 몇 개씩 동시에 처리해서 너무 느려지지 않게 한다.
// [추가] 운행기록의 "목적지"를 입력할 때, 명함에 없는 곳(처음 방문하는 거래처 등)은
// 카카오 키워드 검색으로 실제 장소를 찾아서 골라 쓸 수 있게 한다. 상위 5개까지만
// 후보로 보여준다.
app.get('/api/places/search', async (req, res) => {
  const query = String(req.query.query || '').trim().slice(0, 100);
  if (!query) return res.json({ places: [] });
  if (!KAKAO_REST_API_KEY) {
    return res.status(500).json({ error: 'KAKAO_REST_API_KEY 환경변수가 설정되지 않았습니다.', places: [] });
  }

  try {
    const kakaoRes = await fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}&size=5`, {
      headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` }
    });
    if (!kakaoRes.ok) {
      const bodyText = await kakaoRes.text().catch(() => '');
      return res.status(kakaoRes.status).json({ error: `카카오 장소 검색 오류: ${bodyText.slice(0, 200)}`, places: [] });
    }
    const data: any = await kakaoRes.json();
    const places = (data.documents || []).map((d: any) => ({
      name: d.place_name,
      address: d.road_address_name || d.address_name,
      lat: parseFloat(d.y),
      lng: parseFloat(d.x)
    }));
    res.json({ places });
  } catch (err: any) {
    console.error('장소 검색 중 오류:', err);
    res.status(500).json({ error: err.message || '장소 검색 중 오류가 발생했습니다.', places: [] });
  }
});

// [추가] 출발지/도착지 주소 두 개를 받아서 "직선거리 기준 예상 주행거리"를 계산해준다.
// 실제 도로 경로 거리(카카오 모빌리티 길찾기 API)를 쓰면 더 정확하겠지만, 그건 별도
// 상품 계약이 필요한 경우가 많아서, 대신 직선거리에 "왕복/우회를 감안한 보정 계수"를
// 곱해 근사치를 낸다. 어디까지나 "제안값"이라, 화면에서 사용자가 실제 계기판 값으로
// 언제든 직접 고칠 수 있다.
const ROAD_DISTANCE_CORRECTION_FACTOR = 1.3;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

app.post('/api/vehicles/estimate-distance', async (req, res) => {
  const { startAddress, endAddress, startLat, startLng, endLat, endLng } = req.body;

  try {
    // 좌표가 이미 넘어왔으면(예: 명함에 저장된 좌표) 그걸 쓰고, 없으면 주소로 새로 지오코딩한다.
    let sLat = startLat, sLng = startLng, eLat = endLat, eLng = endLng;

    // [수정] 예전엔 geocodeAddress()의 결과(성공/실패)만 보고 "좌표를 찾지 못했습니다"라는
    // 뭉뚱그린 메시지만 보여줬다. 실제로는 API 키 문제, 100자 초과, 검색 결과 없음 등
    // 원인이 다양한데 구분이 안 돼서, 화면만 봐서는 뭘 고쳐야 할지 알 수 없었다. 이제는
    // 실제 실패 사유(geocodeAddressWithDiagnostics가 주는 상세 메시지)를 그대로 보여준다.
    if (!sLat || !sLng) {
      const { coords, error } = await geocodeAddressWithDiagnostics(startAddress || '');
      if (!coords) return res.status(422).json({ error: `출발지 주소의 좌표를 찾지 못했습니다. (${error || '알 수 없는 이유'})` });
      sLat = coords.lat;
      sLng = coords.lng;
    }
    if (!eLat || !eLng) {
      const { coords, error } = await geocodeAddressWithDiagnostics(endAddress || '');
      if (!coords) return res.status(422).json({ error: `목적지 주소의 좌표를 찾지 못했습니다. (${error || '알 수 없는 이유'})` });
      eLat = coords.lat;
      eLng = coords.lng;
    }

    const straightLineKm = haversineKm(sLat, sLng, eLat, eLng);
    const estimatedRoadKm = Math.round(straightLineKm * ROAD_DISTANCE_CORRECTION_FACTOR * 10) / 10;

    res.json({ success: true, estimatedKm: estimatedRoadKm, straightLineKm: Math.round(straightLineKm * 10) / 10 });
  } catch (err: any) {
    console.error('예상 거리 계산 중 오류:', err);
    res.status(500).json({ error: err.message || '거리 계산 중 오류가 발생했습니다.' });
  }
});

app.post('/api/contacts/regeocode', async (req, res) => {
  const dbData = getScopedData(req);
  const scopeId = (req as any).scopeId;

  // [수정] 예전엔 "아직 처리 안 된 것"을 매번 다시 필터링해서 판단했는데, retryFailed
  // 모드(주소 있는 것 전부 대상)에서는 이 필터가 "이미 처리했는지"를 구분 못 해서, 몇
  // 번을 호출해도 "남은 개수"가 전혀 줄지 않아 클라이언트가 끝없이 반복 호출하는
  // 심각한 버그가 있었다(실제로 명함 1,326개인데 5,700건 넘게 처리된 것으로 잘못
  // 집계된 사례가 있었다). 이제는 "몇 번째까지 처리했는지"(offset)를 클라이언트가
  // 명시적으로 넘겨주고, 서버는 그 위치부터 딱 LIMIT_PER_CALL개만 처리한 뒤 다음
  // 시작 위치를 알려주는 방식으로 바꿨다 — 전체 개수 대비 진행 위치로만 판단하니
  // 무한반복이 구조적으로 불가능하다.
  const retryFailed = req.body?.retryFailed === true;
  const offset = Number(req.body?.offset) || 0;

  const hasAddress = (c: BusinessCard) => Boolean((c.address || '').trim());
  const candidates = retryFailed
    ? dbData.contacts.filter(hasAddress)
    : dbData.contacts.filter((c) => hasAddress(c) && !c.isRealGeocoded);

  const LIMIT_PER_CALL = 150;
  const targets = candidates.slice(offset, offset + LIMIT_PER_CALL);

  let updated = 0;
  let failed = 0;
  let firstError: string | undefined;
  let authError = false;
  const CONCURRENCY = 6;

  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    // [추가] API 키 자체가 잘못됐다면(401/403) 이 명함 저 명함 할 것 없이 전부 똑같이
    // 실패한다. 이 경우 더 처리해봐야 의미가 없으니, 감지되면 이번 호출은 즉시 멈추고
    // 클라이언트에게 "이건 설정 문제니 재시도해도 소용없다"고 알린다.
    if (authError) break;

    const batch = targets.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (c) => {
      const { coords, error } = await geocodeAddressWithDiagnostics(c.address || '');
      if (coords) {
        c.lat = coords.lat;
        c.lng = coords.lng;
        c.isRealGeocoded = true;
        await setScopedDoc(scopeId, 'contacts', c);
        updated++;
      } else {
        // [수정] 실패로 확정되면 예전 가짜 좌표가 남아있지 않도록 확실히 비운다.
        // "좌표 없음 = 진짜 지오코딩 실패"라는 걸 항상 믿을 수 있게 하기 위함이다.
        c.lat = undefined;
        c.lng = undefined;
        c.isRealGeocoded = true;
        await setScopedDoc(scopeId, 'contacts', c);
        failed++;
        if (!firstError && error) firstError = error;
        if (error && error.includes('인증 실패')) authError = true;
      }
    }));
  }

  // [수정] "이번 호출로 이 위치까지는 다 봤다"는 사실 하나만으로 다음 시작 위치와
  // 종료 여부를 정한다 — 목록 상태가 어떻게 바뀌든(성공/실패 관계없이) offset은
  // 항상 앞으로만 나아가므로 무한반복이 원천적으로 불가능하다.
  const nextOffset = offset + targets.length;
  const done = authError || nextOffset >= candidates.length;
  res.json({
    success: true,
    processedThisCall: targets.length,
    updated,
    failed,
    done,
    nextOffset,
    totalCandidates: candidates.length,
    firstError,
    authError
  });
});

app.get('/api/contacts', (req, res) => {
  const dbData = getScopedData(req);
  const requesterId = req.headers['x-user-id'] as string;
  // [수정] "나만 보기(비공개)"로 설정된 명함은 등록한 본인 것만 내려주고, 다른 사람에게는 숨긴다.
  // addedByUserId가 아예 없는(기존 데이터) 명함은 예전처럼 회사 전체에 그대로 보인다.
  const visible = dbData.contacts.filter(c => !c.isPrivate || !c.addedByUserId || c.addedByUserId === requesterId);
  res.json(visible);
});

app.post('/api/contacts', async (req, res) => {
  const dbData = getScopedData(req);
  const scopeId = (req as any).scopeId;
  const newCard: BusinessCard = req.body;
  if (!newCard.id) newCard.id = `c-${Date.now()}`;
  if (!newCard.createdAt) newCard.createdAt = new Date().toISOString();
  if (!newCard.callHistory) newCard.callHistory = [];

  // [수정] 팀/부서별 공유(비공개) 기능을 위해 등록자 정보를 자동으로 남긴다.
  const requesterId = req.headers['x-user-id'] as string;
  const requester = users.find(u => u.id === requesterId);
  newCard.addedByUserId = requesterId || newCard.addedByUserId;
  newCard.addedByUserName = requester?.name || newCard.addedByUserName;
  
  // 좌표가 없으면 실제 주소로 지오코딩해서 부여 (실패하면 좌표 없이 그대로 둠)
  if (!newCard.lat || !newCard.lng) {
    const coords = await geocodeAddress(newCard.address || '');
    if (coords) {
      newCard.lat = coords.lat;
      newCard.lng = coords.lng;
      newCard.isRealGeocoded = true;
    }
  }

  // [수정] 명함 사진을 DB에 base64로 통째로 넣지 않고 Storage에 업로드 후 URL만 저장
  newCard.frontImage = await persistImageField(scopeId, newCard.frontImage, `contact-${newCard.id}-front`);
  newCard.backImage = await persistImageField(scopeId, newCard.backImage, `contact-${newCard.id}-back`);
  
  dbData.contacts.unshift(newCard);
  await setScopedDoc(scopeId, 'contacts', newCard);
  res.status(201).json(newCard);
});

app.put('/api/contacts/:id', async (req, res) => {
  const dbData = getScopedData(req);
  const scopeId = (req as any).scopeId;
  const idx = dbData.contacts.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Contact not found' });
  
  const updated = { ...dbData.contacts[idx], ...req.body };
  if (req.body.address && req.body.address !== dbData.contacts[idx].address) {
    const coords = await geocodeAddress(req.body.address);
    if (coords) {
      updated.lat = coords.lat;
      updated.lng = coords.lng;
      updated.isRealGeocoded = true;
    }
  }

  // [수정] 재스캔 등으로 사진이 새로 바뀐 경우에만 업로드 (이미 URL이면 그대로 재사용, 불필요한 재업로드 방지)
  updated.frontImage = await persistImageField(scopeId, updated.frontImage, `contact-${updated.id}-front`);
  updated.backImage = await persistImageField(scopeId, updated.backImage, `contact-${updated.id}-back`);

  dbData.contacts[idx] = updated;
  await setScopedDoc(scopeId, 'contacts', updated);
  res.json(updated);
});

app.delete('/api/contacts/:id', async (req, res) => {
  const dbData = getScopedData(req);
  dbData.contacts = dbData.contacts.filter(c => c.id !== req.params.id);
  await deleteScopedDoc((req as any).scopeId, 'contacts', req.params.id);
  res.json({ success: true });
});

// 그룹 CRUD
app.get('/api/groups', (req, res) => {
  const dbData = getScopedData(req);
  res.json(dbData.groups);
});

app.post('/api/groups', async (req, res) => {
  const dbData = getScopedData(req);
  const g: ContactGroup = req.body;
  if (!g.id) g.id = `g-${Date.now()}`;
  if (!g.color) g.color = 'bg-slate-700 text-white border-slate-600';
  dbData.groups.push(g);
  await setScopedDoc((req as any).scopeId, 'groups', g);
  res.status(201).json(g);
});

app.put('/api/groups/:id', async (req, res) => {
  const dbData = getScopedData(req);
  const idx = dbData.groups.findIndex(g => g.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Group not found' });
  dbData.groups[idx] = { ...dbData.groups[idx], ...req.body };
  await setScopedDoc((req as any).scopeId, 'groups', dbData.groups[idx]);
  res.json(dbData.groups[idx]);
});

app.delete('/api/groups/:id', async (req, res) => {
  const dbData = getScopedData(req);
  const scopeId = (req as any).scopeId;
  const gid = req.params.id;
  dbData.groups = dbData.groups.filter(g => g.id !== gid);
  // 삭제된 그룹에 속해있던 연락처는 첫 번째 그룹으로 이동
  const defaultGid = dbData.groups[0]?.id || '';
  const movedContacts: BusinessCard[] = [];
  dbData.contacts = dbData.contacts.map(c => {
    if (c.groupId !== gid) return c;
    const moved = { ...c, groupId: defaultGid };
    movedContacts.push(moved);
    return moved;
  });
  await deleteScopedDoc(scopeId, 'groups', gid);
  if (movedContacts.length) await setScopedDocs(scopeId, 'contacts', movedContacts);
  res.json({ success: true });
});

// 통화 히스토리 추가
app.post('/api/contacts/:id/history', async (req, res) => {
  const dbData = getScopedData(req);
  const idx = dbData.contacts.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Contact not found' });
  
  const record: CallRecord = {
    id: `call-${Date.now()}`,
    contactId: req.params.id,
    type: req.body.type || 'incoming',
    timestamp: req.body.timestamp || new Date().toISOString(),
    duration: req.body.duration || undefined,
    note: req.body.note || undefined
  };
  
  dbData.contacts[idx].callHistory.unshift(record);
  await setScopedDoc((req as any).scopeId, 'contacts', dbData.contacts[idx]);
  res.json(dbData.contacts[idx]);
});

// Gemini Vision 명함 OCR API
app.post('/api/scan-card', async (req, res) => {
  try {
    const scanUserId = (req.headers['x-user-id'] as string) || req.ip || 'unknown';
    const scanLimit = aiScanRateLimiter.check(scanUserId);
    if (!scanLimit.allowed) {
      return res.status(429).json({ error: '명함 스캔 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' });
    }
    aiScanRateLimiter.registerAttempt(scanUserId);

    const { frontImage, backImage } = req.body;
    if (!frontImage && !backImage) {
      return res.status(400).json({ error: '명함 이미지가 전송되지 않았습니다.' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      // API Key가 미설정인 경우 프리뷰/테스트를 위해 스마트 정규식 또는 모의 파싱 결과 제공
      return res.json({
        name: '홍길동',
        company: '(주)스마트테크',
        department: '디지털 전환팀',
        title: '부장',
        phoneMobile: '010-1234-5678',
        phoneOffice: '02-123-4567 (대표)',
        phoneOffice2: '070-7654-3210 (직통)',
        phoneFax: '02-123-4568',
        email: 'gildong.hong@smarttech.co.kr',
        address: '서울특별시 강남구 테헤란로 123 스마트빌딩 8층 (본사)',
        address2: '경기도 성남시 분당구 판교역로 231 판교테크노밸리 R&D센터 3층 (판교연구소)',
        memo: '자동 스캔 샘플 데이터 (GEMINI_API_KEY 설정 시 실시간 이미지 OCR 가동)',
        companyInfo: '인공지능 기반 디지털 전환(DX) 및 스마트 기업 솔루션 전문 제공사 (전년도 매출액 약 120억원)'
      });
    }

    const ai = new GoogleGenAI({ apiKey });
    
    // [수정] 예전엔 이 호출 안에서 googleSearch(실시간 구글 검색) 도구까지 같이 써서
    // 회사 매출/비즈니스 요약(companyInfo)을 한 번에 만들었는데, 이 검색 도구가 일반 OCR보다
    // 훨씬 엄격한 별도 할당량(quota)이 걸려있어서 자주 "RESOURCE_EXHAUSTED" 에러로 명함 등록
    // 자체가 막히는 문제가 있었다. 영수증 스캔처럼 이름/직책/연락처만 뽑는 가볍고 빠른 호출로
    // 분리하고, 회사 요약은 명함 상세보기의 "AI 매출액/비즈니스 실시간 검색" 버튼(별도 API:
    // /api/company/search-summary)에서 필요할 때만 따로 조회하도록 한다.
    const contents: any[] = [
      "이 명함 이미지(앞면 및 뒷면)를 분석하여 다음 정보들을 추출해줘. 한국어 또는 영어 명함을 인식하여 정확한 문자열로 정리해줘.\n" +
      "명함에 본사/지사, 서울사무소/공장, 헤드오피스/연구소 등 '주소가 2개 표기되어 있는 경우' 각각을 철저하게 분리하여 address와 address2에 나눠 담아주고, 주소가 1개만 있다면 address2는 빈 문자열로 처리해줘.\n" +
      "또한 유선전화/사무실 전화번호가 2개 이상 존재하는 경우(예: 대표전화 및 직통번호, 혹은 서울사무소 번호 및 공장 번호), 첫 번째 번호는 phoneOffice에, 두 번째 번호는 phoneOffice2에 분리하여 담아주고, 1개만 있다면 phoneOffice2는 빈 문자열로 처리해줘.\n" +
      // [수정] 텍스트 정보뿐 아니라, 사진 속에서 "명함 실물의 네 꼭짓점이 어디인지"도 같이 알려달라고 요청한다.
      // 이렇게 받은 좌표로 나중에 반듯하게 자르면, 화면의 명암 차이만으로 테두리를 찾는 기존 방식보다
      // 훨씬 안정적이다(배경과 명함 색이 비슷해도 AI는 "명함처럼 생긴 패턴" 자체로 인식하기 때문).
      "추가로, 사진에 찍힌 명함 실물(종이 카드 자체)의 네 모서리 좌표를 각 이미지 기준으로 알려줘. " +
      "좌표는 이미지의 가로/세로 크기에 대한 0~1 사이의 비율로 표현해줘 (예: 이미지 맨 왼쪽 위 모서리는 x:0, y:0). " +
      "카메라 각도 때문에 명함이 기울어져 찍혔어도, 실제 카드의 네 꼭짓점 위치를 최대한 정확하게 찾아줘 " +
      "(카드 주변 배경, 손가락, 그림자는 절대 포함하지 말고 카드 실물 가장자리에 딱 맞춰줘).\n" +
      "응답은 반드시 아래 JSON 규격에 맞게 순수 JSON 데이터만 리턴해줘. 마크다운 백틱(```json) 없이 리턴하거나 있어도 JSON 파싱 가능해야 함.\n" +
      "{\n" +
      '  "name": "성명",\n' +
      '  "company": "회사명",\n' +
      '  "department": "부서명",\n' +
      '  "title": "직책/직급",\n' +
      '  "phoneMobile": "핸드폰 번호 (예: 010-XXXX-XXXX)",\n' +
      '  "phoneOffice": "사무실 유선전화 1 (예: 02-XXXX-XXXX)",\n' +
      '  "phoneOffice2": "사무실 유선전화 2 또는 직통번호/보조번호 (유선번호가 2개 존재하는 경우에만 기재, 1개일 경우 빈 문자열 \"\")",\n' +
      '  "phoneFax": "팩스 번호",\n' +
      '  "email": "이메일 주소",\n' +
      '  "address": "회사 첫 번째/기본/본사 주소",\n' +
      '  "address2": "회사 두 번째/지사/공장/보조 주소 (명함 내 주소가 2개 존재하는 경우에만 작성, 1개일 경우 빈 문자열 \"\")",\n' +
      '  "memo": "명함에 적힌 슬로건이나 주요 비즈니스 요약",\n' +
      '  "frontCorners": {"topLeft": {"x":0,"y":0}, "topRight": {"x":0,"y":0}, "bottomRight": {"x":0,"y":0}, "bottomLeft": {"x":0,"y":0}},\n' +
      '  "backCorners": {"topLeft": {"x":0,"y":0}, "topRight": {"x":0,"y":0}, "bottomRight": {"x":0,"y":0}, "bottomLeft": {"x":0,"y":0}}\n' +
      "}\n" +
      "(frontCorners는 첫 번째로 첨부된 이미지, backCorners는 두 번째로 첨부된 이미지 기준이야. 해당 이미지가 없으면 그 필드는 생략해도 돼.)"
    ];

    if (frontImage) {
      const base64Data = frontImage.replace(/^data:image\/\w+;base64,/, '');
      contents.push("다음은 명함 앞면 이미지야 (frontCorners는 이 이미지 기준):");
      contents.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: base64Data
        }
      });
    }

    if (backImage) {
      const base64DataBack = backImage.replace(/^data:image\/\w+;base64,/, '');
      contents.push("다음은 명함 뒷면 이미지야 (backCorners는 이 이미지 기준):");
      contents.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: base64DataBack
        }
      });
    }

    const response = await generateContentWithRetry(ai, {
      model: 'gemini-3.5-flash',
      contents: contents
    });

    const text = response.text || '';
    let parsedJson: any = {};
    try {
      const jsonStr = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
      parsedJson = JSON.parse(jsonStr);
    } catch (e) {
      console.error('JSON 파싱 실패, 텍스트 그대로 분석 시도:', text);
      parsedJson = {
        name: '인식 완료',
        company: '확인 필요',
        department: '',
        title: '',
        phoneMobile: '',
        phoneOffice: '',
        phoneOffice2: '',
        phoneFax: '',
        email: '',
        address: '',
        address2: '',
        memo: text.slice(0, 100),
        companyInfo: '매출 정보 확인 어려움'
      };
    }

    res.json(parsedJson);
  } catch (error: any) {
    console.error('Gemini OCR Error:', error);
    res.status(500).json({ error: error.message || '명함 스캔 중 오류가 발생했습니다.' });
  }
});

// ------------------------------------------------------------------
// 🎙️ AI 회의록 자동화 — 미팅 중 음성 인식으로 받아적은 두서없는 텍스트를,
// AI가 깔끔한 회의록 형태로 정리해주고, 액션 아이템과 언급된 금액(지출 후보)까지 뽑아준다.
// ------------------------------------------------------------------
app.post('/api/summarize-meeting', async (req, res) => {
  try {
    const { rawText } = req.body;
    if (!rawText || !String(rawText).trim()) {
      return res.status(400).json({ error: '정리할 회의 내용이 없습니다.' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY가 설정되지 않았습니다.' });
    const ai = new GoogleGenAI({ apiKey });

    const prompt =
      "다음은 미팅/거래처 방문 중에 음성 인식으로 받아적어서, 문장이 두서없고 정리가 안 되어 있는 회의 메모야. " +
      "이걸 실제 업무 팔로우업 기록으로 쓸 수 있게 정리해줘.\n\n" +
      `[원본 메모]\n${rawText}\n\n` +
      "다음 JSON 규격에 맞게 순수 JSON만 리턴해줘. 마크다운 백틱 없이. " +
      "원본에 없는 내용을 지어내지 말고, 실제 언급된 내용만 정리해줘.\n" +
      "{\n" +
      '  "summary": "핵심 내용을 자연스러운 문장 2~4개로 정리한 회의록 (두서없던 말투를 업무 기록체로 다듬어줘)",\n' +
      '  "actionItems": ["다음에 하기로 한 일 1", "다음에 하기로 한 일 2"], // 언급이 없으면 빈 배열\n' +
      '  "mentionedAmounts": [{"amount": 500000, "context": "식대로 언급된 금액"}], // 원 단위 숫자로 변환, 언급 없으면 빈 배열\n' +
      "}";

    const response = await generateContentWithRetry(ai, {
      model: 'gemini-3.5-flash',
      contents: prompt
    });

    const text = response.text || '';
    let parsed: any = {};
    try {
      const cleaned = text.replace(/```json\s*|```/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = { summary: text.trim(), actionItems: [], mentionedAmounts: [] };
    }

    res.json({
      summary: parsed.summary || '',
      actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
      mentionedAmounts: Array.isArray(parsed.mentionedAmounts) ? parsed.mentionedAmounts : []
    });
  } catch (error: any) {
    console.error('회의록 AI 요약 오류:', error);
    res.status(500).json({ error: error.message || '회의록 요약 중 오류가 발생했습니다.' });
  }
});

// ------------------------------------------------------------------
// 🎤 음성 명함 등록 — 전시회처럼 손이 바쁠 때 "방금 만난 사람 이름 불러줘"로
// 빠르게 기록할 수 있도록, 말한 문장에서 이름/회사/직책을 AI가 뽑아준다.
// 사진 없이 일단 저장해두고, 나중에 실제 명함을 스캔하면 기존 중복 감지 로직이
// 자동으로 "기존 정보 업데이트"를 제안해서 완성되는 구조다.
// ------------------------------------------------------------------
app.post('/api/parse-voice-contact', async (req, res) => {
  try {
    const { rawText } = req.body;
    if (!rawText || !String(rawText).trim()) {
      return res.status(400).json({ error: '인식된 음성 내용이 없습니다.' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY가 설정되지 않았습니다.' });
    const ai = new GoogleGenAI({ apiKey });

    const prompt =
      "다음은 전시회나 미팅 자리에서 방금 만난 사람에 대해 손이 바빠서 음성으로 급하게 말한 내용이야. " +
      "이름과 (언급됐다면) 회사명/직책/부서/메모를 뽑아줘.\n\n" +
      `[음성 인식 텍스트]\n${rawText}\n\n` +
      "다음 JSON 규격에 맞게 순수 JSON만 리턴해줘. 마크다운 백틱 없이. " +
      "언급 안 된 항목은 빈 문자열로 둬. 이름은 최대한 추정해서라도 채워줘(사람 이름으로 들리는 단어).\n" +
      "{\n" +
      '  "name": "성명",\n' +
      '  "company": "회사명",\n' +
      '  "department": "부서명",\n' +
      '  "title": "직책/직급",\n' +
      '  "memo": "그 외 언급된 내용(예: 어디서 만났는지, 관심사 등)"\n' +
      "}";

    const response = await generateContentWithRetry(ai, {
      model: 'gemini-3.5-flash',
      contents: prompt
    });

    const text = response.text || '';
    let parsed: any = {};
    try {
      const cleaned = text.replace(/```json\s*|```/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = { name: rawText.trim().split(/[\s,]+/)[0] || '', company: '', department: '', title: '', memo: rawText };
    }

    res.json({
      name: parsed.name || '',
      company: parsed.company || '',
      department: parsed.department || '',
      title: parsed.title || '',
      memo: parsed.memo || ''
    });
  } catch (error: any) {
    console.error('음성 명함 파싱 오류:', error);
    res.status(500).json({ error: error.message || '음성 인식 처리 중 오류가 발생했습니다.' });
  }
});

// Gemini Vision 영수증 OCR API
app.post('/api/scan-receipt', async (req, res) => {
  try {
    const scanUserId = (req.headers['x-user-id'] as string) || req.ip || 'unknown';
    const scanLimit = aiScanRateLimiter.check(scanUserId);
    if (!scanLimit.allowed) {
      return res.status(429).json({ error: '영수증 스캔 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' });
    }
    aiScanRateLimiter.registerAttempt(scanUserId);

    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ error: '영수증 이미지가 전송되지 않았습니다.' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      // API Key가 미설정인 경우 프리뷰/테스트를 위한 모의 파싱 결과 제공
      return res.json({
        amount: 35000,
        date: new Date().toISOString().split('T')[0],
        merchantName: '성북구 낙산 갈비마을',
        memo: '식대 결제 건 (영수증 자동 스캔 완료 - 샘플 데이터)',
        category: 'meal',
        payMethod: 'company_card'
      });
    }

    const ai = new GoogleGenAI({ apiKey });
    
    // 이미지 파트 생성
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    const contents: any[] = [
      "이 영수증 이미지(또는 비용 영수증 사진)를 분석하여 지출 정보를 추출하고 적합한 카테고리를 분류해줘.\n" +
      "분류할 카테고리는 다음 중에서 가장 알맞은 하나를 선택해줘:\n" +
      "- 'fuel' (주유비, 충전비)\n" +
      "- 'parking' (주차비)\n" +
      "- 'toll' (통행료, 고속도로 통행료)\n" +
      "- 'meal' (식대, 식사비, 한식, 양식, 중식, 일식 등)\n" +
      "- 'beverage' (음료, 커피, 디저트, 카페 건)\n" +
      "- 'supplies' (비품 구입, 사무용품, 문구, 물품 구매)\n" +
      "- 'maintenance' (차량 정비, 수리, 엔진오일 교환 등)\n" +
      "- 'agency_drive' (대리운전)\n" +
      "- 'other' (기타 지출)\n\n" +
      "결제수단은 다음 중 가장 알맞은 하나를 선택해줘:\n" +
      "- 'company_card' (법인카드, 신용카드 영수증에 법인카드 표시가 있거나 회사 비용인 경우)\n" +
      "- 'personal_card' (개인카드)\n" +
      "- 'cash' (현금 영수증, 간이 영수증, 현금 결제)\n\n" +
      // [수정] 지출 정보뿐 아니라, 사진 속에서 "영수증 실물의 네 꼭짓점이 어디인지"도 같이 알려달라고
      // 요청한다. 화면의 명암 차이만으로 테두리를 찾는 기존 방식은 영수증처럼 휘거나 구겨진 얇은
      // 종이, 또는 배경과 색이 비슷한 경우 실패하기 쉬운데, AI는 "영수증처럼 생긴 패턴" 자체로
      // 인식하기 때문에 훨씬 안정적이다.
      "추가로, 사진에 찍힌 영수증 실물(종이 자체)의 네 모서리 좌표를 알려줘. " +
      "좌표는 이미지의 가로/세로 크기에 대한 0~1 사이의 비율로 표현해줘 (예: 이미지 맨 왼쪽 위 모서리는 x:0, y:0). " +
      "영수증이 살짝 휘거나 구겨져 있어도, 실제 종이의 네 꼭짓점 위치를 최대한 정확하게 찾아줘 " +
      "(주변 배경, 손가락, 그림자는 절대 포함하지 말고 영수증 실물 가장자리에 딱 맞춰줘).\n" +
      "응답은 반드시 아래 JSON 규격에 맞게 순수 JSON 데이터만 리턴해줘. 마크다운 백틱(```json) 없이 리턴하거나 있어도 JSON 파싱 가능해야 함.\n" +
      "{\n" +
      '  "amount": 12000, // 숫자형 지출 금액 (원화 단위를 파싱하여 숫자만 기재, 콤마 제외)\n' +
      '  "date": "2026-03-12", // 지출 일자 (YYYY-MM-DD 포맷, 연도가 없으면 가장 최근 연도나 올해 연도로 가정)\n' +
      '  "merchantName": "상호명 또는 가맹점명 (예: 스타벅스 강남점)",\n' +
      '  "memo": "구매 품목 요약 또는 메모 (예: 아메리카노 외 2건)",\n' +
      '  "category": "선택한 카테고리 코드 (예: beverage)",\n' +
      '  "payMethod": "선택한 결제수단 코드 (예: company_card)",\n' +
      '  "corners": {"topLeft": {"x":0,"y":0}, "topRight": {"x":0,"y":0}, "bottomRight": {"x":0,"y":0}, "bottomLeft": {"x":0,"y":0}}\n' +
      "}"
    ];

    contents.push({
      inlineData: {
        mimeType: 'image/jpeg',
        data: base64Data
      }
    });

    const response = await generateContentWithRetry(ai, {
      model: 'gemini-3.5-flash',
      contents: contents
    });

    const text = response.text || '';
    let parsedJson: any = {};
    try {
      const jsonStr = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
      parsedJson = JSON.parse(jsonStr);
    } catch (e) {
      console.error('JSON 파싱 실패, 텍스트 그대로 분석 시도:', text);
      parsedJson = {
        amount: 0,
        date: new Date().toISOString().split('T')[0],
        merchantName: '영수증 인식 완료',
        memo: text.slice(0, 100),
        category: 'other',
        payMethod: 'company_card'
      };
    }

    res.json(parsedJson);
  } catch (error: any) {
    console.error('Receipt OCR Error:', error);
    res.status(500).json({ error: error.message || '영수증 스캔 중 오류가 발생했습니다.' });
  }
});

// 회사 비즈니스 및 전년도 매출 규모 실시간 AI 검색 API
app.post('/api/company/search-summary', async (req, res) => {
  try {
    const { company } = req.body;
    if (!company) {
      return res.status(400).json({ error: '회사명이 필요합니다.' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      // API Key가 없는 경우 테스트를 위해 그럴듯한 모의 데이터 생성해서 전달
      return res.json({
        companyInfo: `${company}은(는) 혁신 비즈니스를 영위하고 있는 기업입니다. (전년도 매출액 규모: 약 1,250억원, 직원수: 약 210명 수준 / 실시간 AI 검색 결과를 보시려면 GEMINI_API_KEY를 등록하세요)`
      });
    }

    const ai = new GoogleGenAI({ apiKey });
    const prompt = `회사명 "${company}"의 업종, 주요 비즈니스 요약, 실시간 구글 검색(googleSearch)을 통해 파악한 전년도 매출액 규모(가장 최근의 연 매출 규모 정보, 예: '매출액 약 5,000억원', 구체적 검색이 어려울 경우 '매출 정보 확인 어려움' 등으로 명시), 그리고 직원수(파악 가능한 가장 최근 규모, 예: '직원수 약 150명', 확인이 어려우면 '직원수 확인 어려움')를 포함하여 1~2줄의 완성도 높은 한 문장으로 비즈니스 요약을 작성해줘.\n` +
      `예시 포맷: "인공지능 기반 B2B DX 및 스마트 비즈니스 솔루션 기업 (전년도 매출액 약 320억원, 직원수 약 85명)"\n` +
      `마크다운 백틱 이나 불필요한 서술 없이 최종 요약 문장 하나만 바로 반환해줘.`;

    const response = await generateContentWithRetry(ai, {
      model: 'gemini-3.5-flash',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }]
      }
    });

    const companyInfo = (response.text || '').trim().replace(/^"/, '').replace(/"$/, '');
    res.json({ companyInfo });
  } catch (error: any) {
    console.error('Company search summary error:', error);
    res.status(500).json({ error: error.message || '회사 비즈니스 요약 검색 중 오류가 발생했습니다.' });
  }
});

// 데이터 전체 입출력을 위한 벌크 업데이트 API
app.post('/api/contacts/import', async (req, res) => {
  const dbData = getScopedData(req);
  const scopeId = (req as any).scopeId;
  const { importedContacts } = req.body;
  if (!Array.isArray(importedContacts)) return res.status(400).json({ error: 'Invalid data' });

  // [추가] 같은 사람을 여러 번 가져오면 중복 명함이 쌓이는 문제가 있었다. 전화번호(숫자만
  // 비교) 또는 이메일이 이미 있는 명함과 같으면 건너뛴다. 이번 요청 안에서 중복되는
  // 항목끼리도 서로 걸러지도록, 처리하면서 계속 채워나간다.
  const normalizePhone = (p?: string) => (p || '').replace(/\D/g, '');
  const existingKeys = new Set<string>();
  for (const c of dbData.contacts) {
    if (c.phoneMobile) existingKeys.add(`phone:${normalizePhone(c.phoneMobile)}`);
    if (c.email) existingKeys.add(`email:${c.email.trim().toLowerCase()}`);
  }

  const toInsert: any[] = [];
  let skippedDuplicates = 0;

  for (const c of importedContacts as any[]) {
    const phoneKey = c.phoneMobile && normalizePhone(c.phoneMobile) ? `phone:${normalizePhone(c.phoneMobile)}` : null;
    const emailKey = c.email && c.email.trim() ? `email:${c.email.trim().toLowerCase()}` : null;
    const isDuplicate = Boolean((phoneKey && existingKeys.has(phoneKey)) || (emailKey && existingKeys.has(emailKey)));
    if (isDuplicate) {
      skippedDuplicates += 1;
      continue;
    }

    if (!c.id) c.id = `c-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    if (!c.createdAt) c.createdAt = new Date().toISOString();
    if (!c.callHistory) c.callHistory = [];
    // [수정] 예전엔 그룹 정보가 없으면 그룹 목록의 "첫 번째 그룹"(보통 VIP 거래처)에 강제로
    // 넣었는데, 관리자가 그룹 순서를 바꾸면 기본값도 같이 바뀌는 데다가, 가져온 명함이
    // 의도치 않게 특정 그룹으로 분류되는 게 헷갈린다는 의견이 있었다. 이제는 그룹 정보가
    // 없거나(파일에 없음) 우리 쪽에 존재하지 않는 그룹이면, 그냥 그룹을 비워둔다 — "전체보기"
    // 에서는 보이지만 특정 그룹 필터에는 안 걸리는 상태. 필요하면 나중에 직접 그룹을 지정하면 된다.
    if (c.groupId && !dbData.groups.some(g => g.id === c.groupId)) {
      c.groupId = undefined;
    }
    // [수정] 가져오기는 한 번에 수백~수천 건이 될 수 있어서, 건마다 실시간으로 지오코딩
    // API를 부르면 너무 느려지고(가져오기 자체가 타임아웃 날 위험) 카카오 API 사용량
    // 제한에도 쉽게 걸린다. 그래서 가져온 명함은 좌표를 비워둔 채로 저장하고(주변 레이더
    // 지도엔 안 보임), 나중에 그 명함을 한 번 수정해서 저장하면 그때 실제 좌표가 채워진다.
    // 틀린 좌표를 억지로 채우는 것보다, 정직하게 비워두는 쪽을 택했다.
    // [수정] 가져온 연락처에 자동 생성된 명함 이미지(base64)가 붙어있는 경우, 다른 명함 등록
    // 경로와 동일하게 Storage에 업로드하고 URL만 저장한다 (DB에 원본 base64를 그대로
    // 넣으면 용량이 커지고, 다른 경로로 등록된 명함들과 저장 방식이 달라져버린다).
    c.frontImage = await persistImageField(scopeId, c.frontImage, `contact-${c.id}-front`);
    c.backImage = await persistImageField(scopeId, c.backImage, `contact-${c.id}-back`);
    dbData.contacts.unshift(c);
    toInsert.push(c);

    if (phoneKey) existingKeys.add(phoneKey);
    if (emailKey) existingKeys.add(emailKey);
  }

  await setScopedDocs(scopeId, 'contacts', toInsert);
  res.json({ count: toInsert.length, skippedDuplicates, contacts: dbData.contacts });
});

// 내 명함 프로필 API
app.get('/api/my-profile', async (req, res) => {
  const dbData = getScopedData(req);
  // [수정] 공유 랜딩 페이지(/s/:slug)용 공개 식별자가 없으면 최초 조회 시 자동 생성해서 저장한다.
  if (!dbData.myProfile.shareSlug) {
    dbData.myProfile.shareSlug = crypto.randomBytes(6).toString('hex');
    await setScopedProfile((req as any).scopeId, dbData.myProfile);
  }
  res.json(dbData.myProfile);
});

app.put('/api/my-profile', async (req, res) => {
  const dbData = getScopedData(req);
  const scopeId = (req as any).scopeId;
  dbData.myProfile = { ...dbData.myProfile, ...req.body };
  // [수정] 내 명함 사진도 마찬가지로 Storage에 업로드 후 URL만 저장
  dbData.myProfile.frontImage = await persistImageField(scopeId, dbData.myProfile.frontImage, `myprofile-${scopeId}-front`);
  dbData.myProfile.backImage = await persistImageField(scopeId, dbData.myProfile.backImage, `myprofile-${scopeId}-back`);
  await setScopedProfile(scopeId, dbData.myProfile);
  res.json(dbData.myProfile);
});

// ------------------------------------------------------------------
// 🧩 회사별 결재선 기본 템플릿 (전자결재)
// 회사마다 결재 단계/직책명이 다를 수 있어, 새 문서 작성 시 자동으로 채워질
// "우리 회사 기본 결재선"을 회사(스코프) 단위로 저장/조회한다.
// 저장된 템플릿이 없으면 null을 내려주고, 프론트에서 내장 기본값을 사용한다.
// ------------------------------------------------------------------
app.get('/api/approval-line-templates', async (req, res) => {
  const scopeId = (req as any).scopeId;
  const existing = await getScopedDoc<{ id: string; advance?: ApprovalStep[]; leave?: ApprovalStep[] }>(scopeId, 'approvalLineTemplates', 'default');
  res.json(existing || { id: 'default', advance: null, leave: null });
});

app.put('/api/approval-line-templates', async (req, res) => {
  const scopeId = (req as any).scopeId;
  const template = { id: 'default', advance: req.body.advance || null, leave: req.body.leave || null };
  await setScopedDoc(scopeId, 'approvalLineTemplates', template);
  res.json(template);
});

// ------------------------------------------------------------------
// 🔗 공유 랜딩 페이지 (누구나 로그인 없이 접근 가능한 공개 페이지)
// 카카오톡/트위터/링크드인 등에 이 링크를 공유하면, 아래 og:title/description/image
// 메타태그를 각 플랫폼이 자동으로 긁어가 예쁜 미리보기 카드를 만들어준다.
// ------------------------------------------------------------------
function escapeHtml(str: string): string {
  return String(str || '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c
  ));
}

app.get('/s/:slug', async (req, res) => {
  try {
    const result = await findProfileByShareSlug(req.params.slug);
    if (!result) {
      return res.status(404).send('<h1 style="font-family:sans-serif;text-align:center;margin-top:80px;">명함을 찾을 수 없습니다.</h1>');
    }
    const { profile } = result;
    const title = `${profile.name} · ${profile.company}`;
    const description = `${profile.title}${profile.department ? ' | ' + profile.department : ''} · 📞 ${profile.phoneMobile}`;
    const hasPhoto = !!profile.frontImage;
    const imageUrl = hasPhoto
      ? `${APP_BASE_URL}/s/${req.params.slug}/photo`
      : `${APP_BASE_URL}/kakao-share-thumb.png`;
    const pageUrl = `${APP_BASE_URL}/s/${req.params.slug}`;

    res.send(`<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta property="og:type" content="profile" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:image" content="${imageUrl}" />
<meta property="og:url" content="${pageUrl}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(title)}" />
<meta name="twitter:description" content="${escapeHtml(description)}" />
<meta name="twitter:image" content="${imageUrl}" />
<style>
  body { font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; background:#0f172a; color:#e2e8f0; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; padding:24px; box-sizing:border-box; }
  .card { background:#1e293b; border-radius:24px; padding:32px; max-width:420px; width:100%; box-shadow:0 20px 60px rgba(0,0,0,0.4); box-sizing:border-box; }
  .card img { width:100%; border-radius:16px; margin-bottom:20px; display:block; }
  h1 { font-size:22px; margin:0 0 4px; }
  .title { color:#60a5fa; font-size:13px; margin-bottom:16px; }
  .row { font-size:14px; margin:8px 0; color:#cbd5e1; }
  a { color:#93c5fd; text-decoration:none; }
  .badge { display:inline-block; margin-top:20px; font-size:11px; color:#64748b; }
</style>
</head>
<body>
  <div class="card">
    ${hasPhoto ? `<img src="${imageUrl}" alt="명함" />` : ''}
    <h1>${escapeHtml(profile.name)}</h1>
    <div class="title">${escapeHtml(profile.title)}${profile.company ? ' · ' + escapeHtml(profile.company) : ''}</div>
    ${profile.phoneMobile ? `<div class="row">📱 <a href="tel:${escapeHtml(profile.phoneMobile)}">${escapeHtml(profile.phoneMobile)}</a></div>` : ''}
    ${profile.email ? `<div class="row">✉️ <a href="mailto:${escapeHtml(profile.email)}">${escapeHtml(profile.email)}</a></div>` : ''}
    ${profile.address ? `<div class="row">🏢 ${escapeHtml(profile.address)}</div>` : ''}
    ${profile.website ? `<div class="row">🌐 <a href="${escapeHtml(profile.website)}" target="_blank" rel="noreferrer">${escapeHtml(profile.website)}</a></div>` : ''}
    <div class="badge">BizCard Pro 디지털 명함</div>
  </div>
</body>
</html>`);
  } catch (error: any) {
    console.error('공유 페이지 오류:', error);
    res.status(500).send('오류가 발생했습니다.');
  }
});

// 공유 페이지용 명함 사진: base64로 저장된 사진을 실제 이미지 응답으로 변환해서 내려준다.
// (카카오톡/트위터 등은 og:image에 실제 접근 가능한 이미지 URL을 요구하며 data: URI는 인식하지 못한다)
app.get('/s/:slug/photo', async (req, res) => {
  try {
    const result = await findProfileByShareSlug(req.params.slug);
    if (!result || !result.profile.frontImage) return res.status(404).end();

    // [수정] 이제 frontImage는 base64가 아니라 Supabase Storage의 실제 URL인 경우가 대부분이다.
    // URL이면 그 주소로 바로 리다이렉트해서 보여주고, 예전 방식(base64)으로 저장된 옛 데이터도
    // 계속 문제없이 보이도록 두 경우 모두 지원한다.
    if (/^https?:\/\//.test(result.profile.frontImage)) {
      return res.redirect(302, result.profile.frontImage);
    }

    const match = result.profile.frontImage.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!match) return res.status(404).end();
    const [, mime, base64Data] = match;
    const buffer = Buffer.from(base64Data, 'base64');
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(buffer);
  } catch (error) {
    console.error('공유 사진 오류:', error);
    res.status(500).end();
  }
});

// 프로젝트 CRUD API
app.get('/api/projects', (req, res) => {
  const dbData = getScopedData(req);
  res.json(dbData.projects);
});

app.post('/api/projects', async (req, res) => {
  const dbData = getScopedData(req);
  const p: Project = req.body;
  if (!p.id) p.id = `p-${Date.now()}`;
  if (!p.createdAt) p.createdAt = new Date().toISOString();
  if (!p.followUps) p.followUps = [];
  if (!p.contactIds) p.contactIds = [];
  dbData.projects.unshift(p);
  await setScopedDoc((req as any).scopeId, 'projects', p);
  res.status(201).json(p);
});

app.put('/api/projects/:id', async (req, res) => {
  const dbData = getScopedData(req);
  const idx = dbData.projects.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Project not found' });
  dbData.projects[idx] = { ...dbData.projects[idx], ...req.body };
  await setScopedDoc((req as any).scopeId, 'projects', dbData.projects[idx]);
  res.json(dbData.projects[idx]);
});

app.delete('/api/projects/:id', async (req, res) => {
  const dbData = getScopedData(req);
  dbData.projects = dbData.projects.filter(p => p.id !== req.params.id);
  await deleteScopedDoc((req as any).scopeId, 'projects', req.params.id);
  res.json({ success: true });
});

// 프로젝트 팔로우업 노트 관리
app.post('/api/projects/:id/followups', async (req, res) => {
  const dbData = getScopedData(req);
  const scopeId = (req as any).scopeId;
  const idx = dbData.projects.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Project not found' });
  
  const f: ProjectFollowUp = {
    id: `f-${Date.now()}`,
    projectId: req.params.id,
    content: req.body.content || '',
    date: req.body.date || new Date().toISOString().split('T')[0],
    status: req.body.status || 'planned',
    meetingDegree: req.body.meetingDegree,
    meetingType: req.body.meetingType,
    attendee: req.body.attendee,
    internalStaffName: req.body.internalStaffName,
    hasVoice: req.body.hasVoice,
    voiceUrl: req.body.voiceUrl,
    voiceDuration: req.body.voiceDuration,
    attachments: req.body.attachments || [],
    expenses: req.body.expenses || []
  };
  // [수정] 미팅 지출 영수증 사진들을 Storage에 업로드 후 URL로 교체
  f.expenses = await persistReceiptImagesInArray(scopeId, f.expenses, `followup-${f.id}`);
  // [추가] 첨부파일(제안서/견적서 등, PDF·PPT·엑셀·한글 포함)도 Storage에 업로드 후 URL로 교체
  f.attachments = await persistAttachmentsInArray(scopeId, f.attachments, `followup-${f.id}`);
  dbData.projects[idx].followUps.unshift(f);
  await setScopedDoc(scopeId, 'projects', dbData.projects[idx]);
  res.status(201).json(dbData.projects[idx]);
});

app.put('/api/projects/:id/followups/:fid', async (req, res) => {
  const dbData = getScopedData(req);
  const scopeId = (req as any).scopeId;
  const idx = dbData.projects.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Project not found' });
  
  const fIdx = dbData.projects[idx].followUps.findIndex(f => f.id === req.params.fid);
  if (fIdx !== -1) {
    const updatedFollowUp = { ...dbData.projects[idx].followUps[fIdx], ...req.body };
    if (req.body.expenses) {
      updatedFollowUp.expenses = await persistReceiptImagesInArray(scopeId, updatedFollowUp.expenses, `followup-${req.params.fid}`);
    }
    if (req.body.attachments) {
      updatedFollowUp.attachments = await persistAttachmentsInArray(scopeId, updatedFollowUp.attachments, `followup-${req.params.fid}`);
    }
    dbData.projects[idx].followUps[fIdx] = updatedFollowUp;
    await setScopedDoc(scopeId, 'projects', dbData.projects[idx]);
  }
  res.json(dbData.projects[idx]);
});

app.delete('/api/projects/:id/followups/:fid', async (req, res) => {
  const dbData = getScopedData(req);
  const idx = dbData.projects.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Project not found' });
  
  dbData.projects[idx].followUps = dbData.projects[idx].followUps.filter(f => f.id !== req.params.fid);
  await setScopedDoc((req as any).scopeId, 'projects', dbData.projects[idx]);
  res.json(dbData.projects[idx]);
});

// ==========================================
// 🚗 통합 차량 관리 CRUD API (Vehicle Management)
// ==========================================

app.get('/api/vehicles', (req, res) => {
  const dbData = getScopedData(req);
  res.json(dbData.vehicles || []);
});

app.post('/api/vehicles', async (req, res) => {
  const dbData = getScopedData(req);
  const v: Vehicle = req.body;
  if (!v.id) v.id = `vh-${Date.now()}`;
  if (!v.createdAt) v.createdAt = new Date().toISOString();
  if (v.currentMileage === undefined) v.currentMileage = v.initialMileage || 0;
  
  dbData.vehicles.unshift(v);
  await setScopedDoc((req as any).scopeId, 'vehicles', v);
  res.status(201).json(v);
});

app.put('/api/vehicles/:id', async (req, res) => {
  const dbData = getScopedData(req);
  const idx = dbData.vehicles.findIndex(v => v.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Vehicle not found' });
  
  dbData.vehicles[idx] = { ...dbData.vehicles[idx], ...req.body };
  await setScopedDoc((req as any).scopeId, 'vehicles', dbData.vehicles[idx]);
  res.json(dbData.vehicles[idx]);
});

app.delete('/api/vehicles/:id', async (req, res) => {
  const dbData = getScopedData(req);
  const scopeId = (req as any).scopeId;
  dbData.vehicles = dbData.vehicles.filter(v => v.id !== req.params.id);
  dbData.drivingLogs = dbData.drivingLogs.filter(log => log.vehicleId !== req.params.id);
  dbData.expenses = dbData.expenses.filter(e => e.vehicleId !== req.params.id);
  dbData.maintenances = dbData.maintenances.filter(m => m.vehicleId !== req.params.id);
  await Promise.all([
    deleteScopedDoc(scopeId, 'vehicles', req.params.id),
    replaceScopedCollection(scopeId, 'drivingLogs', dbData.drivingLogs),
    replaceScopedCollection(scopeId, 'expenses', dbData.expenses),
    replaceScopedCollection(scopeId, 'maintenances', dbData.maintenances)
  ]);
  res.json({ success: true });
});

// === 운행기록 API ===
app.get('/api/vehicles/driving', (req, res) => {
  const dbData = getScopedData(req);
  res.json(dbData.drivingLogs || []);
});

app.post('/api/vehicles/driving', async (req, res) => {
  const dbData = getScopedData(req);
  const scopeId = (req as any).scopeId;
  const log: DrivingLog = req.body;
  if (!log.id) log.id = `log-${Date.now()}`;
  if (!log.createdAt) log.createdAt = new Date().toISOString();
  
  dbData.drivingLogs.unshift(log);

  // 주행 로그 등록 시 해당 차량의 현재 주행거리 갱신
  const vIdx = dbData.vehicles.findIndex(v => v.id === log.vehicleId);
  let updatedVehicle: Vehicle | null = null;
  if (vIdx !== -1) {
    const v = dbData.vehicles[vIdx];
    if (log.endMileage > v.currentMileage) {
      dbData.vehicles[vIdx].currentMileage = log.endMileage;
      updatedVehicle = dbData.vehicles[vIdx];
    }
  }

  await setScopedDoc(scopeId, 'drivingLogs', log);
  if (updatedVehicle) await setScopedDoc(scopeId, 'vehicles', updatedVehicle);
  res.status(201).json(log);
});

app.delete('/api/vehicles/driving/:id', async (req, res) => {
  const dbData = getScopedData(req);
  dbData.drivingLogs = dbData.drivingLogs.filter(log => log.id !== req.params.id);
  await deleteScopedDoc((req as any).scopeId, 'drivingLogs', req.params.id);
  res.json({ success: true });
});

// === 지출비용 API ===
app.get('/api/vehicles/expenses', (req, res) => {
  const dbData = getScopedData(req);
  res.json(dbData.expenses || []);
});

app.post('/api/vehicles/expenses', async (req, res) => {
  const dbData = getScopedData(req);
  const scopeId = (req as any).scopeId;
  const exp: VehicleExpense = req.body;
  if (!exp.id) exp.id = `exp-${Date.now()}`;
  if (!exp.createdAt) exp.createdAt = new Date().toISOString();
  exp.receiptImage = await persistImageField(scopeId, exp.receiptImage, `vehicle-expense-${exp.id}`, 'receipts');
  
  dbData.expenses.unshift(exp);
  await setScopedDoc(scopeId, 'expenses', exp);
  res.status(201).json(exp);
});

app.delete('/api/vehicles/expenses/:id', async (req, res) => {
  const dbData = getScopedData(req);
  dbData.expenses = dbData.expenses.filter(e => e.id !== req.params.id);
  await deleteScopedDoc((req as any).scopeId, 'expenses', req.params.id);
  res.json({ success: true });
});

// === 정비기록 API ===
app.get('/api/vehicles/maintenances', (req, res) => {
  const dbData = getScopedData(req);
  res.json(dbData.maintenances || []);
});

app.post('/api/vehicles/maintenances', async (req, res) => {
  const dbData = getScopedData(req);
  const scopeId = (req as any).scopeId;
  const maint: VehicleMaintenance = req.body;
  if (!maint.id) maint.id = `maint-${Date.now()}`;
  if (!maint.createdAt) maint.createdAt = new Date().toISOString();
  maint.receiptImage = await persistImageField(scopeId, maint.receiptImage, `vehicle-maint-${maint.id}`, 'receipts');
  
  dbData.maintenances.unshift(maint);
  await setScopedDoc(scopeId, 'maintenances', maint);
  res.status(201).json(maint);
});

app.put('/api/vehicles/maintenances/:id', async (req, res) => {
  const dbData = getScopedData(req);
  const scopeId = (req as any).scopeId;
  const idx = dbData.maintenances.findIndex(m => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Maintenance not found' });
  
  const updated = { ...dbData.maintenances[idx], ...req.body };
  updated.receiptImage = await persistImageField(scopeId, updated.receiptImage, `vehicle-maint-${updated.id}`, 'receipts');
  dbData.maintenances[idx] = updated;
  await setScopedDoc(scopeId, 'maintenances', dbData.maintenances[idx]);
  res.json(dbData.maintenances[idx]);
});

app.delete('/api/vehicles/maintenances/:id', async (req, res) => {
  const dbData = getScopedData(req);
  dbData.maintenances = dbData.maintenances.filter(m => m.id !== req.params.id);
  await deleteScopedDoc((req as any).scopeId, 'maintenances', req.params.id);
  res.json({ success: true });
});

// === 운행기록 수정 API ===
app.put('/api/vehicles/driving/:id', async (req, res) => {
  const dbData = getScopedData(req);
  const scopeId = (req as any).scopeId;
  const idx = dbData.drivingLogs.findIndex(log => log.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Driving log not found' });
  dbData.drivingLogs[idx] = { ...dbData.drivingLogs[idx], ...req.body };
  
  const log = dbData.drivingLogs[idx];
  const vIdx = dbData.vehicles.findIndex(v => v.id === log.vehicleId);
  let updatedVehicle: Vehicle | null = null;
  if (vIdx !== -1) {
    const v = dbData.vehicles[vIdx];
    if (log.endMileage > v.currentMileage) {
      dbData.vehicles[vIdx].currentMileage = log.endMileage;
      updatedVehicle = dbData.vehicles[vIdx];
    }
  }
  await setScopedDoc(scopeId, 'drivingLogs', log);
  if (updatedVehicle) await setScopedDoc(scopeId, 'vehicles', updatedVehicle);
  res.json(dbData.drivingLogs[idx]);
});

// === 지출비용 수정 API ===
app.put('/api/vehicles/expenses/:id', async (req, res) => {
  const dbData = getScopedData(req);
  const scopeId = (req as any).scopeId;
  const idx = dbData.expenses.findIndex(e => e.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Expense not found' });
  const updated = { ...dbData.expenses[idx], ...req.body };
  updated.receiptImage = await persistImageField(scopeId, updated.receiptImage, `vehicle-expense-${updated.id}`, 'receipts');
  dbData.expenses[idx] = updated;
  await setScopedDoc(scopeId, 'expenses', dbData.expenses[idx]);
  res.json(dbData.expenses[idx]);
});

// === 점검 주기 설정 API ===
app.get('/api/vehicles/intervals', (req, res) => {
  const dbData = getScopedData(req);
  res.json(dbData.maintenanceIntervals || []);
});

app.post('/api/vehicles/intervals', async (req, res) => {
  const dbData = getScopedData(req);
  const interval: MaintenanceInterval = req.body;
  if (!interval.id) interval.id = `int-${Date.now()}`;
  if (!interval.createdAt) interval.createdAt = new Date().toISOString();
  dbData.maintenanceIntervals = dbData.maintenanceIntervals || [];
  dbData.maintenanceIntervals.unshift(interval);
  await setScopedDoc((req as any).scopeId, 'maintenanceIntervals', interval);
  res.status(201).json(interval);
});

app.put('/api/vehicles/intervals/:id', async (req, res) => {
  const dbData = getScopedData(req);
  dbData.maintenanceIntervals = dbData.maintenanceIntervals || [];
  const idx = dbData.maintenanceIntervals.findIndex(item => item.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Interval not found' });
  dbData.maintenanceIntervals[idx] = { ...dbData.maintenanceIntervals[idx], ...req.body };
  await setScopedDoc((req as any).scopeId, 'maintenanceIntervals', dbData.maintenanceIntervals[idx]);
  res.json(dbData.maintenanceIntervals[idx]);
});

app.delete('/api/vehicles/intervals/:id', async (req, res) => {
  const dbData = getScopedData(req);
  dbData.maintenanceIntervals = dbData.maintenanceIntervals || [];
  dbData.maintenanceIntervals = dbData.maintenanceIntervals.filter(item => item.id !== req.params.id);
  await deleteScopedDoc((req as any).scopeId, 'maintenanceIntervals', req.params.id);
  res.json({ success: true });
});

// === 업무일지 (Work Logs) API ===

// 업무일지 비용과 차량 비용 관리 동기화 헬퍼 함수
function syncWorkLogExpenses(dbData: any, logId: string, logDate: string, logTitle: string, expenses: any[] | undefined) {
  dbData.expenses = dbData.expenses || [];
  // 해당 업무일지로부터 등록되었던 기존 연동 차량 비용 내역 제거
  dbData.expenses = dbData.expenses.filter((e: any) => !e.id.startsWith(`ve-wl-${logId}-`));

  if (!expenses || !Array.isArray(expenses)) return;

  expenses.forEach((expense: any) => {
    if (!expense.vehicleId) return; // 차량 연동 선택이 안 된 지출은 건너뜀

    // 카테고리 매핑
    let category: string = 'other';
    let memoPrefix = '';

    switch (expense.category) {
      case 'breakfast':
        category = 'meal';
        memoPrefix = '[아침식사] ';
        break;
      case 'lunch':
        category = 'meal';
        memoPrefix = '[점심식사] ';
        break;
      case 'dinner':
        category = 'meal';
        memoPrefix = '[저녁식사] ';
        break;
      case 'drinks':
        category = 'beverage';
        memoPrefix = '[음료&커피] ';
        break;
      case 'fuel':
        category = 'fuel';
        break;
      case 'parking':
        category = 'parking';
        break;
      case 'proxy':
        category = 'agency_drive';
        break;
      case 'purchase':
        category = 'supplies';
        memoPrefix = '[물품구입] ';
        break;
      case 'custom':
        category = 'custom';
        break;
    }

    // 결제 수단 매핑
    let payMethod: string = 'cash';
    if (expense.payMethod === 'company_card') {
      payMethod = 'company_card';
    } else if (expense.payMethod === 'personal_card') {
      payMethod = 'personal_card';
    } else if (expense.payMethod === 'cash_personal') {
      payMethod = 'cash';
      memoPrefix += '[개인현금] ';
    } else if (expense.payMethod === 'cash_company') {
      payMethod = 'cash';
      memoPrefix += '[법인현금] ';
    }

    const memoContent = `${memoPrefix}${expense.memo || ''} (업무일지 연동: ${logTitle})`;

    dbData.expenses.unshift({
      id: `ve-wl-${logId}-${expense.id}`,
      vehicleId: expense.vehicleId,
      date: logDate,
      category: category,
      categoryCustom: expense.categoryCustom,
      amount: Number(expense.amount) || 0,
      memo: memoContent.trim(),
      payMethod: payMethod,
      // [수정] 업무일지 지출 쪽에서 이미 Storage에 업로드된 영수증 URL을 그대로 같이 넘겨서,
      // 연동된 차량 비용 화면에서도 같은 영수증 사진을 볼 수 있게 한다.
      receiptImage: expense.receiptImage,
      createdAt: new Date().toISOString()
    });
  });
}

// 일일 업무일지 CRUD
app.get('/api/worklogs/daily', (req, res) => {
  const dbData = getScopedData(req);
  res.json(dbData.dailyLogs || []);
});

app.post('/api/worklogs/daily', async (req, res) => {
  const dbData = getScopedData(req);
  const scopeId = (req as any).scopeId;
  const log: DailyWorkLog = req.body;
  if (!log.id) log.id = `dl-${Date.now()}`;
  if (!log.createdAt) log.createdAt = new Date().toISOString();
  if (!log.projectIds) log.projectIds = [];
  if (!log.contactIds) log.contactIds = [];

  // [수정] 지출 영수증 사진들을 Storage에 업로드 후 URL로 교체 (차량비용 연동 동기화보다 먼저 해야
  // 동기화되는 차량 지출 항목에도 URL이 반영된다)
  log.expenses = await persistReceiptImagesInArray(scopeId, log.expenses, `worklog-daily-${log.id}`);
  
  // 비용 항목 연동 동기화
  syncWorkLogExpenses(dbData, log.id, log.date, log.title, log.expenses);

  dbData.dailyLogs = dbData.dailyLogs || [];
  dbData.dailyLogs.unshift(log);
  await Promise.all([
    setScopedDoc(scopeId, 'dailyLogs', log),
    replaceScopedCollection(scopeId, 'expenses', dbData.expenses)
  ]);
  res.status(201).json(log);
});

app.put('/api/worklogs/daily/:id', async (req, res) => {
  const dbData = getScopedData(req);
  const scopeId = (req as any).scopeId;
  dbData.dailyLogs = dbData.dailyLogs || [];
  const idx = dbData.dailyLogs.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Daily log not found' });
  
  const original = dbData.dailyLogs[idx];
  const updated = { ...original, ...req.body };
  updated.expenses = await persistReceiptImagesInArray(scopeId, updated.expenses, `worklog-daily-${req.params.id}`);
  dbData.dailyLogs[idx] = updated;

  // 비용 항목 연동 동기화
  syncWorkLogExpenses(dbData, req.params.id, updated.date, updated.title, updated.expenses);

  await Promise.all([
    setScopedDoc(scopeId, 'dailyLogs', updated),
    replaceScopedCollection(scopeId, 'expenses', dbData.expenses)
  ]);
  res.json(dbData.dailyLogs[idx]);
});

app.delete('/api/worklogs/daily/:id', async (req, res) => {
  const dbData = getScopedData(req);
  const scopeId = (req as any).scopeId;
  dbData.dailyLogs = dbData.dailyLogs || [];
  dbData.dailyLogs = dbData.dailyLogs.filter(l => l.id !== req.params.id);
  
  // 해당 업무일지에 매핑되어 있던 비용 내역도 제거
  dbData.expenses = dbData.expenses || [];
  dbData.expenses = dbData.expenses.filter((e: any) => !e.id.startsWith(`ve-wl-${req.params.id}-`));

  await Promise.all([
    deleteScopedDoc(scopeId, 'dailyLogs', req.params.id),
    replaceScopedCollection(scopeId, 'expenses', dbData.expenses)
  ]);
  res.json({ success: true });
});

// 주간 업무일지 CRUD
app.get('/api/worklogs/weekly', (req, res) => {
  const dbData = getScopedData(req);
  res.json(dbData.weeklyLogs || []);
});

app.post('/api/worklogs/weekly', async (req, res) => {
  const dbData = getScopedData(req);
  const scopeId = (req as any).scopeId;
  const log: WeeklyWorkLog = req.body;
  if (!log.id) log.id = `wl-${Date.now()}`;
  if (!log.createdAt) log.createdAt = new Date().toISOString();
  if (!log.projectIds) log.projectIds = [];
  if (!log.contactIds) log.contactIds = [];

  // [수정] 지출 영수증 사진들을 Storage에 업로드 후 URL로 교체
  log.expenses = await persistReceiptImagesInArray(scopeId, log.expenses, `worklog-weekly-${log.id}`);

  // 비용 항목 연동 동기화 (주간은 시작일을 지출일자로 연동)
  syncWorkLogExpenses(dbData, log.id, log.startDate, log.title, log.expenses);

  dbData.weeklyLogs = dbData.weeklyLogs || [];
  dbData.weeklyLogs.unshift(log);
  await Promise.all([
    setScopedDoc(scopeId, 'weeklyLogs', log),
    replaceScopedCollection(scopeId, 'expenses', dbData.expenses)
  ]);
  res.status(201).json(log);
});

app.put('/api/worklogs/weekly/:id', async (req, res) => {
  const dbData = getScopedData(req);
  const scopeId = (req as any).scopeId;
  dbData.weeklyLogs = dbData.weeklyLogs || [];
  const idx = dbData.weeklyLogs.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Weekly log not found' });
  
  const original = dbData.weeklyLogs[idx];
  const updated = { ...original, ...req.body };
  updated.expenses = await persistReceiptImagesInArray(scopeId, updated.expenses, `worklog-weekly-${req.params.id}`);
  dbData.weeklyLogs[idx] = updated;

  // 비용 항목 연동 동기화 (주간은 시작일을 지출일자로 연동)
  syncWorkLogExpenses(dbData, req.params.id, updated.startDate, updated.title, updated.expenses);

  await Promise.all([
    setScopedDoc(scopeId, 'weeklyLogs', updated),
    replaceScopedCollection(scopeId, 'expenses', dbData.expenses)
  ]);
  res.json(dbData.weeklyLogs[idx]);
});

app.delete('/api/worklogs/weekly/:id', async (req, res) => {
  const dbData = getScopedData(req);
  const scopeId = (req as any).scopeId;
  dbData.weeklyLogs = dbData.weeklyLogs || [];
  dbData.weeklyLogs = dbData.weeklyLogs.filter(l => l.id !== req.params.id);
  
  // 해당 업무일지에 매핑되어 있던 비용 내역도 제거
  dbData.expenses = dbData.expenses || [];
  dbData.expenses = dbData.expenses.filter((e: any) => !e.id.startsWith(`ve-wl-${req.params.id}-`));

  await Promise.all([
    deleteScopedDoc(scopeId, 'weeklyLogs', req.params.id),
    replaceScopedCollection(scopeId, 'expenses', dbData.expenses)
  ]);
  res.json({ success: true });
});

// ------------------------------------------------------------------
// 📧 이메일 발송 (Brevo HTTPS API 방식)
// [수정] Render 무료 요금제는 아웃바운드 SMTP 포트(25/465/587) 자체를 차단한다. 그래서
// Daum이든 Gmail이든 "SMTP 프로토콜"로 보내는 방식은 서버가 유료로 전환되지 않는 한 절대
// 작동할 수 없다. 대신 일반 웹 요청과 똑같은 HTTPS(포트 443, 절대 안 막힘)로 메일을
// 보내주는 Brevo의 API를 사용한다. 여기서는 nodemailer/SMTP를 아예 쓰지 않는다.
// 환경변수: BREVO_API_KEY, SMTP_FROM_EMAIL(Brevo에서 인증 완료한 발신 이메일), SMTP_FROM_NAME, APP_BASE_URL
// ------------------------------------------------------------------
const BREVO_API_KEY = process.env.BREVO_API_KEY;
const SMTP_FROM_EMAIL = process.env.SMTP_FROM_EMAIL || '';
const SMTP_FROM_NAME = process.env.SMTP_FROM_NAME || 'BizCard Pro 전자결재';
const APP_BASE_URL = process.env.APP_BASE_URL || 'https://bizcard-pro.onrender.com';

const isMailerConfigured = Boolean(BREVO_API_KEY && SMTP_FROM_EMAIL);
if (!isMailerConfigured) {
  console.warn('[mailer] BREVO_API_KEY 또는 SMTP_FROM_EMAIL 환경변수가 설정되지 않아 이메일 발송이 비활성화됩니다.');
}

// 모든 이메일 발송이 공통으로 거쳐가는 단일 함수. 첨부파일(영수증 압축파일 등)도 지원한다.
async function sendEmail(opts: {
  to: string; toName?: string; subject: string; html: string;
  attachments?: { filename: string; content: Buffer }[];
}): Promise<void> {
  if (!isMailerConfigured) {
    console.warn(`[mailer] 미설정 상태라 ${opts.to}에게 메일을 보내지 못했습니다.`);
    return;
  }
  const payload: any = {
    sender: { name: SMTP_FROM_NAME, email: SMTP_FROM_EMAIL },
    to: [{ email: opts.to, name: opts.toName || opts.to }],
    subject: opts.subject,
    htmlContent: opts.html
  };
  if (opts.attachments && opts.attachments.length > 0) {
    payload.attachment = opts.attachments.map((a) => ({
      name: a.filename,
      content: a.content.toString('base64')
    }));
  }
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': BREVO_API_KEY as string,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Brevo 메일 발송 실패 (${res.status}): ${errText}`);
  }
}

async function sendApprovalRequestEmail(opts: {
  toEmail: string; toName: string; approverRole: string;
  docTypeLabel: string; draftNumber: string; authorName: string;
}) {
  if (!isMailerConfigured) {
    console.warn(`[mailer] 미설정 상태라 ${opts.toEmail}에게 결재 요청 이메일을 보내지 못했습니다.`);
    return;
  }
  try {
    await sendEmail({
      to: opts.toEmail,
      toName: opts.toName,
      subject: `[결재 요청] ${opts.docTypeLabel} - ${opts.authorName}님이 상신한 문서 (기안번호: ${opts.draftNumber})`,
      html: `
        <div style="font-family: 'Malgun Gothic', sans-serif; padding: 24px; color:#111;">
          <h2 style="margin-bottom:4px;">${opts.docTypeLabel} 결재 요청</h2>
          <p style="color:#555;">${opts.toName}님(${opts.approverRole}), 결재해 주실 문서가 도착했습니다.</p>
          <table style="border-collapse:collapse; margin:16px 0; font-size:14px;">
            <tr><td style="padding:4px 16px 4px 0; color:#888;">기안번호</td><td>${opts.draftNumber}</td></tr>
            <tr><td style="padding:4px 16px 4px 0; color:#888;">기안자</td><td>${opts.authorName}</td></tr>
          </table>
          <a href="${APP_BASE_URL}" style="display:inline-block; padding:10px 22px; background:#4f46e5; color:#fff; text-decoration:none; border-radius:8px; font-weight:bold;">사이트에서 확인하기</a>
        </div>
      `
    });
    console.log(`[mailer] ${opts.toEmail}에게 결재 요청 이메일 발송 완료`);
  } catch (err) {
    console.error(`[mailer] ${opts.toEmail}에게 이메일 발송 실패:`, err);
  }
}

// ------------------------------------------------------------------
// 💬 전체 문의하기 (Feedback) — 명함뿐 아니라 앱 전체 어디서나 접수 가능
// 회사별로 나뉘지 않고 개발자(운영자)에게 전부 모이도록, 고정된 전역 스코프에 저장한다.
// ------------------------------------------------------------------
const GLOBAL_FEEDBACK_SCOPE = '__global_feedback__';

app.post('/api/feedback', async (req, res) => {
  try {
    const { category, content, pageContext } = req.body;
    if (!content || !String(content).trim()) {
      return res.status(400).json({ error: '문의 내용을 입력해주세요.' });
    }

    const userId = req.headers['x-user-id'] as string;
    const user = users.find(u => u.id === userId);

    const item: FeedbackItem = {
      id: `fb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      category: (['bug', 'feature', 'other'].includes(category) ? category : 'other'),
      content: String(content).trim(),
      authorName: user?.name,
      authorEmail: user?.email,
      authorPhone: user?.phone,
      companyName: user?.companyName,
      pageContext: pageContext || undefined,
      status: 'new',
      createdAt: new Date().toISOString()
    };

    await setScopedDoc(GLOBAL_FEEDBACK_SCOPE, 'feedback', item);
    res.status(201).json({ success: true });

    // 이메일 알림은 실패해도 사용자 응답에는 영향 없도록 응답을 먼저 보낸 뒤 처리(fire-and-forget)
    if (isMailerConfigured) {
      const categoryLabel = item.category === 'bug' ? '🐞 버그 신고' : item.category === 'feature' ? '💡 기능 제안' : '✉️ 기타 문의';
      sendEmail({
        to: ADMIN_EMAIL,
        subject: `[BizCard Pro 문의] ${categoryLabel} - ${item.authorName || '익명'}`,
        html: `
          <div style="font-family: 'Malgun Gothic', sans-serif; padding: 24px; color:#111;">
            <h2 style="margin-bottom:4px;">${categoryLabel}</h2>
            <p style="color:#555;">작성자: ${item.authorName || '알 수 없음'} (${item.authorEmail || '-'})</p>
            <p style="color:#555;">연락처: ${item.authorPhone || '등록된 번호 없음'}</p>
            <p style="color:#555;">소속: ${item.companyName || '개인 계정'}</p>
            <p style="color:#555;">접수 화면: ${item.pageContext || '-'}</p>
            <div style="margin-top:16px; padding:16px; background:#f8fafc; border-radius:8px; white-space:pre-wrap; font-size:14px;">${String(item.content).replace(/</g, '&lt;')}</div>
          </div>
        `
      }).then(() => {
        console.log('[mailer] 문의 접수 알림 메일 발송 완료');
      }).catch((err: any) => {
        console.error('[mailer] 문의 접수 알림 메일 발송 실패:', err);
      });
    }
  } catch (err: any) {
    console.error('Feedback submit error:', err);
    if (!res.headersSent) res.status(500).json({ error: '문의 접수 중 오류가 발생했습니다.' });
  }
});

// ------------------------------------------------------------------
// 📊 운영자 대시보드 — 회사별 가입/사용 현황을 한눈에 보기 위한 통계 API.
// 다른 회사의 데이터 규모(명함/차량/프로젝트 개수 등)까지 노출되는 민감한 정보라,
// 개발자(운영자) 계정에서만 접근 가능하도록 제한한다.
// ------------------------------------------------------------------
// [수정] 운영 관리자 이메일이 코드에 하드코딩돼 있으면, 나중에 담당자가 바뀔 때마다
// 코드를 고치고 재배포해야 한다. 환경변수로 빼되, 설정 안 했을 때는 지금까지 쓰던
// 값으로 그대로 동작하게 폴백을 둔다(기존 배포가 갑자기 깨지지 않도록).
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'parkhy5454@gmail.com';

app.get('/api/admin/platform-stats', async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  const requester = users.find(u => u.id === userId);
  if (!requester || requester.email !== ADMIN_EMAIL) {
    return res.status(403).json({ error: '접근 권한이 없습니다.' });
  }

  try {
    const scopeStats = await getPlatformStats();

    // 회사별 가입 직원 수/명단은 users 목록에서 같은 스코프(회사)로 묶어서 계산한다.
    const usersByScope = new Map<string, { count: number; companyName?: string; businessNumber?: string; members: { name: string; email: string; phone?: string; position?: string; createdAt?: string }[] }>();
    for (const u of users) {
      const scopeId = scopeIdForUser(u);
      if (!usersByScope.has(scopeId)) {
        usersByScope.set(scopeId, { count: 0, companyName: u.companyName, businessNumber: u.businessNumber, members: [] });
      }
      const entry = usersByScope.get(scopeId)!;
      entry.count += 1;
      entry.members.push({ name: u.name, email: u.email, phone: u.phone, position: u.position, createdAt: u.createdAt });
    }

    const companies = scopeStats
      .filter(s => s.scopeId.startsWith('company:'))
      .map(s => {
        const userInfo = usersByScope.get(s.scopeId);
        return {
          scopeId: s.scopeId,
          companyName: userInfo?.companyName || s.scopeId.replace('company:', ''),
          businessNumber: userInfo?.businessNumber || '',
          userCount: userInfo?.count || 0,
          members: userInfo?.members || [],
          itemCounts: s.itemCounts,
          totalItems: s.totalItems,
          lastActivity: s.lastActivity
        };
      })
      .sort((a, b) => (b.lastActivity || '').localeCompare(a.lastActivity || ''));

    // 아직 아무 데이터도 등록하지 않은(가입만 한) 회사도 목록에 나오도록, users에는 있지만
    // scoped_items에는 아직 없는 회사 스코프도 0건짜리 항목으로 추가해준다.
    const seenScopeIds = new Set(companies.map(c => c.scopeId));
    for (const [scopeId, info] of usersByScope) {
      if (scopeId.startsWith('company:') && !seenScopeIds.has(scopeId)) {
        companies.push({
          scopeId,
          companyName: info.companyName || scopeId.replace('company:', ''),
          businessNumber: info.businessNumber || '',
          userCount: info.count,
          members: info.members,
          itemCounts: {},
          totalItems: 0,
          lastActivity: null
        });
      }
    }

    // [수정] 개인 가입자는 그동안 숫자로만 집계됐는데, 실제로는 이름/이메일/가입일 정보가 있으므로
    // 목록으로 그대로 보여준다 (가입일 기록 이전에 가입한 계정은 createdAt이 없을 수 있음).
    const individuals = users
      .filter(u => u.type === 'individual')
      .map(u => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, createdAt: u.createdAt }))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    const individualScopeCount = scopeStats.filter(s => s.scopeId.startsWith('individual:')).length;

    // 기능별 전체 사용 빈도 (모든 회사 합산) - 어느 기능이 제일 많이 쓰이는지 파악용
    // [추가] 회사도 개인 가입자와 마찬가지로, 그 회사에서 가장 최근에 가입한 사람 기준으로
    // 최신순(최근 가입자가 있는 회사가 위) 정렬해서 응답한다.
    const latestMemberJoin = (c: typeof companies[number]) =>
      Math.max(0, ...c.members.map((m) => (m.createdAt ? new Date(m.createdAt).getTime() : 0)));
    companies.sort((a, b) => latestMemberJoin(b) - latestMemberJoin(a));

    const featureTotals: Record<string, number> = {};
    for (const s of scopeStats) {
      for (const [collection, count] of Object.entries(s.itemCounts)) {
        featureTotals[collection] = (featureTotals[collection] || 0) + count;
      }
    }

    res.json({
      totalUsers: users.length,
      totalCompanies: companies.length,
      individualAccountCount: individualScopeCount,
      companies,
      individuals,
      featureTotals
    });
  } catch (err: any) {
    console.error('platform-stats 조회 오류:', err);
    res.status(500).json({ error: '통계 조회 중 오류가 발생했습니다.' });
  }
});

// ------------------------------------------------------------------
// 🔧 운영자 전용: 스코프(회사) 데이터 병합 도구.
// 예전에 사업자번호 필드가 잘못 저장되어(예: "회사명_사업자번호" 형태) 데이터가
// 엉뚱한 스코프에 쌓여있는 경우, 그 데이터를 올바른 스코프로 옮기기 위한 일회성 도구.
// "가져올 스코프"의 모든 컬렉션(명함/프로젝트/차량 등)을 "옮길 대상 스코프"로 이동시키고,
// 예전 스코프는 비운다. 되돌릴 수 없으니 반드시 fromScopeId/toScopeId를 신중히 확인할 것.
// ------------------------------------------------------------------
// [수정] myProfile은 다른 컬렉션(contacts, projects 등)과 저장 방식이 다르다 — "항목 여러 개
// (각자 id 있음)"가 아니라 "스코프당 문서 딱 하나"(doc_id가 항상 'profile' 고정)라서, 아래
// 목록형 병합 로직(item.id를 doc_id로 써서 저장)에 넣으면 doc_id가 비어서 저장이 실패한다.
// 그래서 목록에서 빼고 별도로 처리한다.
const MIGRATABLE_COLLECTIONS = [
  'contacts', 'projects', 'groups', 'vehicles', 'drivingLogs', 'expenses',
  'maintenances', 'maintenanceIntervals', 'dailyLogs', 'weeklyLogs',
  'advancePayments', 'leaveRequests'
] as const;

app.post('/api/admin/migrate-scope', async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  const requester = users.find(u => u.id === userId);
  if (!requester || requester.email !== ADMIN_EMAIL) {
    return res.status(403).json({ error: '접근 권한이 없습니다.' });
  }

  const { fromScopeId, toScopeId } = req.body as { fromScopeId?: string; toScopeId?: string };
  if (!fromScopeId || !toScopeId || fromScopeId === toScopeId) {
    return res.status(400).json({ error: 'fromScopeId와 toScopeId를 서로 다르게 정확히 입력해주세요.' });
  }

  try {
    const summary: Record<string, number> = {};

    for (const name of MIGRATABLE_COLLECTIONS) {
      const oldItems = await getScopedCollection(fromScopeId, name as any);
      if (!oldItems || oldItems.length === 0) continue;

      const newItems = await getScopedCollection(toScopeId, name as any);
      const merged = [...(newItems || []), ...oldItems];

      await replaceScopedCollection(toScopeId, name as any, merged as any);
      await replaceScopedCollection(fromScopeId, name as any, [] as any);

      summary[name] = oldItems.length;
    }

    // [추가] myProfile은 "옮길 대상(to) 스코프의 프로필이 비어있을 때만" 예전(from) 스코프의
    // 프로필로 채워준다 (to 쪽에 이미 실제 프로필이 있으면 그걸 함부로 덮어쓰지 않는다).
    const oldProfileList = await getScopedCollection<MyProfile>(fromScopeId, 'myProfile');
    const oldProfile = oldProfileList[0];
    if (oldProfile) {
      const newProfileList = await getScopedCollection<MyProfile>(toScopeId, 'myProfile');
      const newProfile = newProfileList[0];
      const toIsEmpty = !newProfile || (!newProfile.name && !newProfile.company && !newProfile.phoneMobile);
      if (toIsEmpty) {
        await setScopedProfile(toScopeId, oldProfile);
        summary['myProfile'] = 1;
      }
    }

    // 메모리 캐시를 지워서, 다음 접근 시 Supabase에서 최신 상태로 다시 불러오게 한다.
    delete db[fromScopeId];
    delete db[toScopeId];

    res.json({ success: true, fromScopeId, toScopeId, migratedCounts: summary });
  } catch (err: any) {
    console.error('scope migrate 오류:', err);
    res.status(500).json({ error: '데이터 병합 중 오류가 발생했습니다.' });
  }
});

// 접수된 문의 목록 조회 (관리자용 문의함 화면에서 사용)
app.get('/api/feedback', async (req, res) => {
  const list = await getScopedCollection<FeedbackItem>(GLOBAL_FEEDBACK_SCOPE, 'feedback');
  res.json(list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')));
});

// 문의 처리 상태 변경 (신규 → 처리중 → 완료)
app.put('/api/feedback/:id', async (req, res) => {
  try {
    const existing = await getScopedDoc<FeedbackItem>(GLOBAL_FEEDBACK_SCOPE, 'feedback', req.params.id);
    if (!existing) return res.status(404).json({ error: '해당 문의를 찾을 수 없습니다.' });
    const status = ['new', 'in_progress', 'resolved'].includes(req.body.status) ? req.body.status : existing.status;
    const updated: FeedbackItem = { ...existing, status };
    await setScopedDoc(GLOBAL_FEEDBACK_SCOPE, 'feedback', updated);
    res.json(updated);
  } catch (err: any) {
    console.error('Feedback status update error:', err);
    res.status(500).json({ error: '상태 변경 중 오류가 발생했습니다.' });
  }
});

// ------------------------------------------------------------------
// 📇 명함 초대(바이럴 루프) — 명함 상세보기에서 "이 분에게 앱 추천하기"를 보낸 이력을
// 회사(스코프) 단위로 기록한다. 실제 가입 전환 여부까지는 추적하지 않고, 발송 이력만 남긴다.
// ------------------------------------------------------------------
app.post('/api/invites', async (req, res) => {
  try {
    const scopeId = (req as any).scopeId;
    const userId = req.headers['x-user-id'] as string;
    const user = users.find(u => u.id === userId);
    const record: InviteRecord = {
      id: `inv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      contactId: req.body.contactId,
      contactName: req.body.contactName,
      channel: (['sms', 'email', 'kakao', 'share', 'other'].includes(req.body.channel) ? req.body.channel : 'other'),
      sentByUserId: userId,
      sentByUserName: user?.name,
      sentAt: new Date().toISOString()
    };
    await setScopedDoc(scopeId, 'invites', record);
    res.status(201).json(record);
  } catch (err) {
    console.error('Invite log error:', err);
    res.status(500).json({ error: '초대 기록 저장에 실패했습니다.' });
  }
});

app.get('/api/invites', async (req, res) => {
  const scopeId = (req as any).scopeId;
  const list = await getScopedCollection<InviteRecord>(scopeId, 'invites');
  res.json(list.sort((a, b) => (b.sentAt || '').localeCompare(a.sentAt || '')));
});

// 결재라인에서 아직 서명(date)되지 않은 첫 번째 단계 = 다음 결재 대기자
function getNextPendingApprover(approvalLine: ApprovalStep[] = []): ApprovalStep | undefined {
  return approvalLine.find(s => !s.date);
}

// 결재라인이 진전되어 "다음 결재 대기자"가 바뀌었을 때만(중복 발송 방지) 그 사람에게 이메일을 보낸다.
// - 신규 기안(beforeLine 없음): 첫 번째 결재자에게 발송
// - 결재 진행(beforeLine 있음): 다음 결재자가 바뀐 경우에만 발송
async function notifyNextApproverIfChanged(
  scopeId: string,
  docTypeLabel: string,
  draftNumber: string,
  authorName: string,
  afterLine: ApprovalStep[] | undefined,
  afterStatus: string | undefined,
  beforeLine?: ApprovalStep[]
) {
  if (!isMailerConfigured) return;
  if (afterStatus !== 'pending') return; // 승인 완료/반려된 문서는 알림 대상 아님
  if (!scopeId.startsWith('company:')) return; // 회사 계정이 아니면 결재라인-직원 매칭 불가

  const nextBefore = beforeLine ? getNextPendingApprover(beforeLine) : undefined;
  const nextAfter = getNextPendingApprover(afterLine || []);
  if (!nextAfter) return;
  if (beforeLine && nextBefore?.role === nextAfter.role && nextBefore?.date === nextAfter.date) return; // 변화 없음

  const normalize = (s: string) => s.trim().replace(/\s+/g, '').toLowerCase();
  const target = users.find(u => scopeIdForUser(u) === scopeId && normalize(u.position || '') === normalize(nextAfter.role));
  if (!target) {
    console.warn(`[mailer] "${nextAfter.role}" 직책을 가진 가입자를 찾지 못해 결재 요청 이메일을 보내지 못했습니다. (직원 관리에서 직책을 지정해주세요)`);
    return;
  }
  await sendApprovalRequestEmail({
    toEmail: target.email,
    toName: target.name,
    approverRole: nextAfter.role,
    docTypeLabel,
    draftNumber,
    authorName
  });
}

// 전자결재: 가지급금 정산서 CRUD
app.get('/api/approvals/advance', (req, res) => {
  const dbData = getScopedData(req);
  res.json(dbData.advancePayments || []);
});

app.post('/api/approvals/advance', async (req, res) => {
  const dbData = getScopedData(req);
  const scopeId = (req as any).scopeId;
  const doc: AdvancePaymentSettlement = req.body;
  if (!doc.id) doc.id = `ap-${Date.now()}`;
  if (!doc.createdAt) doc.createdAt = new Date().toISOString();
  if (!doc.items) doc.items = [];
  if (!doc.status) doc.status = 'pending';

  dbData.advancePayments = dbData.advancePayments || [];
  dbData.advancePayments.unshift(doc);
  await setScopedDoc(scopeId, 'advancePayments', doc);
  res.status(201).json(doc);

  notifyNextApproverIfChanged(scopeId, '가지급금 정산서', `${doc.periodStart} ~ ${doc.periodEnd}`, doc.author, doc.approvalLine, doc.status)
    .catch(err => console.error('[mailer] 가지급금 정산서 결재 알림 처리 실패:', err));
});

app.put('/api/approvals/advance/:id', async (req, res) => {
  const dbData = getScopedData(req);
  const scopeId = (req as any).scopeId;
  dbData.advancePayments = dbData.advancePayments || [];
  const idx = dbData.advancePayments.findIndex((d: AdvancePaymentSettlement) => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Advance payment settlement not found' });

  const before = dbData.advancePayments[idx];
  const updated = { ...before, ...req.body };
  dbData.advancePayments[idx] = updated;
  await setScopedDoc(scopeId, 'advancePayments', updated);
  res.json(updated);

  notifyNextApproverIfChanged(scopeId, '가지급금 정산서', `${updated.periodStart} ~ ${updated.periodEnd}`, updated.author, updated.approvalLine, updated.status, before.approvalLine)
    .catch(err => console.error('[mailer] 가지급금 정산서 결재 알림 처리 실패:', err));
});

app.delete('/api/approvals/advance/:id', async (req, res) => {
  const dbData = getScopedData(req);
  const scopeId = (req as any).scopeId;
  dbData.advancePayments = dbData.advancePayments || [];
  dbData.advancePayments = dbData.advancePayments.filter((d: AdvancePaymentSettlement) => d.id !== req.params.id);
  await deleteScopedDoc(scopeId, 'advancePayments', req.params.id);
  res.json({ success: true });
});

// 전자결재: 휴가 신청서 CRUD
app.get('/api/approvals/leave', (req, res) => {
  const dbData = getScopedData(req);
  res.json(dbData.leaveRequests || []);
});

app.post('/api/approvals/leave', async (req, res) => {
  const dbData = getScopedData(req);
  const scopeId = (req as any).scopeId;
  const doc: LeaveRequest = req.body;
  if (!doc.id) doc.id = `lv-${Date.now()}`;
  if (!doc.createdAt) doc.createdAt = new Date().toISOString();
  if (!doc.status) doc.status = 'pending';

  dbData.leaveRequests = dbData.leaveRequests || [];
  dbData.leaveRequests.unshift(doc);
  await setScopedDoc(scopeId, 'leaveRequests', doc);
  res.status(201).json(doc);

  notifyNextApproverIfChanged(scopeId, '휴가 신청서', doc.draftNumber, doc.author, doc.approvalLine, doc.status)
    .catch(err => console.error('[mailer] 휴가 신청서 결재 알림 처리 실패:', err));
});

app.put('/api/approvals/leave/:id', async (req, res) => {
  const dbData = getScopedData(req);
  const scopeId = (req as any).scopeId;
  dbData.leaveRequests = dbData.leaveRequests || [];
  const idx = dbData.leaveRequests.findIndex((d: LeaveRequest) => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Leave request not found' });

  const before = dbData.leaveRequests[idx];
  const updated = { ...before, ...req.body };
  dbData.leaveRequests[idx] = updated;
  await setScopedDoc(scopeId, 'leaveRequests', updated);
  res.json(updated);

  notifyNextApproverIfChanged(scopeId, '휴가 신청서', updated.draftNumber, updated.author, updated.approvalLine, updated.status, before.approvalLine)
    .catch(err => console.error('[mailer] 휴가 신청서 결재 알림 처리 실패:', err));
});

app.delete('/api/approvals/leave/:id', async (req, res) => {
  const dbData = getScopedData(req);
  const scopeId = (req as any).scopeId;
  dbData.leaveRequests = dbData.leaveRequests || [];
  dbData.leaveRequests = dbData.leaveRequests.filter((d: LeaveRequest) => d.id !== req.params.id);
  await deleteScopedDoc(scopeId, 'leaveRequests', req.params.id);
  res.json({ success: true });
});

// AI 업무일지 정제 (AI Polish) API
app.post('/api/worklogs/ai-polish', async (req, res) => {
  try {
    const { text, type, field } = req.body;
    if (!text) {
      return res.status(400).json({ error: '정제할 텍스트가 없습니다.' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      // API Key가 설정되지 않은 경우 스마트 정규식/프로그래밍 폴백 작동
      const lines = text.split('\n').map((l: string) => l.trim()).filter(Boolean);
      const polishedText = lines.map((line: string, i: number) => {
        let cleaned = line.replace(/^[-*•\d.\s]+/, '').trim();
        // 간단한 비즈니스 톤 접미사 보정
        if (!cleaned.endsWith('.') && !cleaned.endsWith('함') && !cleaned.endsWith('음') && !cleaned.endsWith('완료') && !cleaned.endsWith('수립')) {
          cleaned += ' 완료';
        }
        return `${i + 1}. ${cleaned}`;
      }).join('\n');
      
      return res.json({ polishedText });
    }

    const ai = new GoogleGenAI({ apiKey });
    const prompt = `
당신은 최고의 비즈니스 수석 비서 및 정밀한 업무 보고서 정리 전문가입니다.
사용자가 작성한 가공되지 않은 러프한(또는 어투가 캐주얼한) 업무 요약 내용을 읽고, 가공하여 격식 있고 깔끔하게 정돈된 기업형 업무 보고(개조식) 톤앤매너로 교정해주세요.

작성 대상 일지 타입: ${type === 'daily' ? '일일 업무일지' : '주간 업무일지'}
작성 대상 항목: ${field === 'tasksToday' || field === 'achievementsThisWeek' ? '실시 성과 및 달성 사항' : '향후 계획 및 예정 사항'}

[입력 데이터]:
"""
${text}
"""

[교정 원칙]:
1. 어휘를 격식 있고 전문적인 비즈니스 명사형/종결형 톤으로 변경해주세요 (예: '~함', '~했음', '~조율 완료', '~계획 수립', '~대응안 마련').
2. 내용을 구조화하여 가독성 높은 개조식 번호(1., 2., 3...)와 불렛 기호(-) 조합으로 일목요연하게 작성해주세요.
3. 원본 내용이 가지고 있는 핵심 의미, 구체적인 수치, 기관명, 담당자명 등을 왜곡하거나 임의로 빠뜨리지 마세요.
4. 불필요한 사족이나 미사여구, 인사말, 마크다운 백틱(\`\`\`json 또는 \`\`\` 등)은 모두 제거하고, 오직 "교정 정제된 완성 문장들"만 반환해야 합니다.
`;

    const response = await generateContentWithRetry(ai, {
      model: 'gemini-3.5-flash',
      contents: prompt,
    });

    const polishedText = (response.text || '').trim();
    res.json({ polishedText });
  } catch (error: any) {
    console.error('AI Polish Error:', error);
    res.status(500).json({ error: error.message || 'AI 정제 중 오류가 발생했습니다.' });
  }
});

// ------------------------------------------------------------------
// 📊 월별 세무 자료 자동 발송 — 더존 같은 회계 프로그램에 실시간으로 직접 연동하려면
// 별도의 기업 계약(EDI)이 필요해서 현실적으로 어렵다. 대신 "매달 세무사에게 서류를 직접
// 갖다주는 수고"라는 실제 문제를 해결하기 위해, 그 달의 모든 지출(차량비용/정비/미팅지출/
// 업무일지 지출)과 영수증 사진을 한데 모아 엑셀+영수증 압축파일로 만들어 이메일로 바로
// 발송한다. 세무사가 어떤 프로그램을 쓰든, 받은 엑셀/사진을 그대로 입력하면 된다.
// ------------------------------------------------------------------
app.post('/api/send-tax-package', async (req, res) => {
  try {
    const { year, month, accountantEmail } = req.body;
    if (!year || !month || !accountantEmail) {
      return res.status(400).json({ error: '연도, 월, 세무사 이메일을 모두 입력해주세요.' });
    }
    if (!isMailerConfigured) {
      return res.status(500).json({ error: '메일 발송 설정(BREVO_API_KEY)이 되어있지 않아 발송할 수 없습니다.' });
    }

    const dbData = getScopedData(req);
    const monthStr = String(month).padStart(2, '0');
    const prefix = `${year}-${monthStr}`; // 예: "2026-07"

    interface TaxRow {
      date: string; category: string; merchant: string; amount: number;
      payMethod: string; memo: string; receiptImage?: string;
    }
    const rows: TaxRow[] = [];

    const payMethodKo = (p?: string) => {
      if (p === 'personal_card') return '개인카드';
      if (p === 'cash' || p === 'cash_personal') return '현금';
      if (p === 'cash_company') return '현금(회사)';
      return '법인카드';
    };

    // 1) 차량 비용
    (dbData.expenses || []).forEach((e: any) => {
      if ((e.date || '').startsWith(prefix)) {
        rows.push({
          date: e.date, category: '차량비용', merchant: e.merchantName || e.categoryCustom || e.category || '',
          amount: e.amount || 0, payMethod: payMethodKo(e.payMethod), memo: e.memo || '', receiptImage: e.receiptImage
        });
      }
    });

    // 2) 차량 정비
    (dbData.maintenances || []).forEach((m: any) => {
      if ((m.date || '').startsWith(prefix)) {
        rows.push({
          date: m.date, category: '차량정비', merchant: m.shopName || m.title || '',
          amount: m.cost || 0, payMethod: payMethodKo(m.payMethod), memo: m.memo || '', receiptImage: m.receiptImage
        });
      }
    });

    // 3) 프로젝트 미팅 지출
    (dbData.projects || []).forEach((p: any) => {
      (p.followUps || []).forEach((fu: any) => {
        if ((fu.date || '').startsWith(prefix)) {
          (fu.expenses || []).forEach((exp: any) => {
            rows.push({
              date: fu.date, category: '미팅지출', merchant: exp.categoryCustom || exp.category || '',
              amount: exp.amount || 0, payMethod: payMethodKo(exp.payMethod),
              memo: [p.name, exp.memo].filter(Boolean).join(' · '), receiptImage: exp.receiptImage
            });
          });
        }
      });
    });

    // 4) 업무일지 지출 (일일)
    (dbData.dailyLogs || []).forEach((log: any) => {
      if ((log.date || '').startsWith(prefix)) {
        (log.expenses || []).forEach((exp: any) => {
          rows.push({
            date: log.date, category: '업무일지 지출', merchant: exp.categoryCustom || exp.category || '',
            amount: exp.amount || 0, payMethod: payMethodKo(exp.payMethod), memo: exp.memo || '', receiptImage: exp.receiptImage
          });
        });
      }
    });

    // 5) 업무일지 지출 (주간 - 시작일 기준)
    (dbData.weeklyLogs || []).forEach((log: any) => {
      if ((log.startDate || '').startsWith(prefix)) {
        (log.expenses || []).forEach((exp: any) => {
          rows.push({
            date: log.startDate, category: '업무일지 지출(주간)', merchant: exp.categoryCustom || exp.category || '',
            amount: exp.amount || 0, payMethod: payMethodKo(exp.payMethod), memo: exp.memo || '', receiptImage: exp.receiptImage
          });
        });
      }
    });

    rows.sort((a, b) => a.date.localeCompare(b.date));

    if (rows.length === 0) {
      return res.status(400).json({ error: `${year}년 ${monthStr}월에 해당하는 지출 내역이 없습니다.` });
    }

    // 엑셀(.xlsx) 생성
    const wsData = [
      ['날짜', '구분', '상호/항목', '금액', '결제수단', '메모'],
      ...rows.map((r) => [r.date, r.category, r.merchant, r.amount, r.payMethod, r.memo])
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{ wch: 12 }, { wch: 16 }, { wch: 22 }, { wch: 12 }, { wch: 10 }, { wch: 30 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${year}년${monthStr}월`);
    const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    // 압축(.zip) 생성: 엑셀 + 영수증 사진 전부
    const archive = archiver('zip', { zlib: { level: 9 } });
    const chunks: Buffer[] = [];
    archive.on('data', (chunk: Buffer) => chunks.push(chunk));
    const archiveFinished = new Promise<Buffer>((resolve, reject) => {
      archive.on('end', () => resolve(Buffer.concat(chunks)));
      archive.on('error', reject);
    });

    archive.append(excelBuffer, { name: `${year}년_${monthStr}월_지출내역.xlsx` });

    let receiptIndex = 1;
    for (const r of rows) {
      if (!r.receiptImage) continue;
      try {
        let imgBuffer: Buffer | null = null;
        let ext = 'jpg';
        if (r.receiptImage.startsWith('data:image/')) {
          const match = r.receiptImage.match(/^data:image\/(\w+);base64,(.+)$/);
          if (match) {
            ext = match[1] === 'jpeg' ? 'jpg' : match[1];
            imgBuffer = Buffer.from(match[2], 'base64');
          }
        } else if (r.receiptImage.startsWith('http')) {
          const resp = await fetch(r.receiptImage);
          if (resp.ok) {
            imgBuffer = Buffer.from(await resp.arrayBuffer());
            const urlExt = r.receiptImage.split('?')[0].split('.').pop();
            if (urlExt && urlExt.length <= 4) ext = urlExt;
          }
        }
        if (imgBuffer) {
          const safeMerchant = (r.merchant || '').replace(/[^\w가-힣]/g, '').slice(0, 15);
          archive.append(imgBuffer, { name: `영수증/${receiptIndex}_${r.date}_${safeMerchant}.${ext}` });
          receiptIndex++;
        }
      } catch (err) {
        console.error('영수증 다운로드 실패(건너뜀):', err);
      }
    }

    archive.finalize();
    const zipBuffer = await archiveFinished;

    const totalAmount = rows.reduce((s, r) => s + r.amount, 0);
    const companyName = dbData.myProfile?.company || '';

    await sendEmail({
      to: accountantEmail,
      subject: `[${year}년 ${monthStr}월] 지출 및 영수증 자료${companyName ? ' - ' + companyName : ''}`,
      html: `
        <div style="font-family: 'Malgun Gothic', sans-serif; padding: 24px; color:#111;">
          <h2 style="margin-bottom:8px;">${year}년 ${monthStr}월 지출 자료</h2>
          <p style="color:#555;">${companyName ? companyName + ' · ' : ''}총 ${rows.length}건, 합계 ${totalAmount.toLocaleString()}원</p>
          <p style="color:#555; margin-top:12px;">첨부된 압축파일 안에 <b>엑셀 정리표</b>와 <b>영수증 사진</b>이 모두 들어있습니다.</p>
        </div>
      `,
      attachments: [
        { filename: `${year}년_${monthStr}월_세무자료.zip`, content: zipBuffer }
      ]
    });

    res.json({ success: true, count: rows.length, totalAmount });
  } catch (err: any) {
    console.error('세무 자료 발송 오류:', err);
    res.status(500).json({ error: err.message || '세무 자료 발송 중 오류가 발생했습니다.' });
  }
});

async function startServer() {
  await bootstrapUsers();

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
  }

  // [수정] 라우트 안에서 처리 안 하고 그냥 던져진(throw) 에러까지 Sentry가 잡아서 보고하도록.
  // 반드시 "모든 라우트 등록 이후, app.listen 이전"에 붙여야 한다.
  if (SENTRY_DSN) {
    Sentry.setupExpressErrorHandler(app);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 명함 관리 서버가 포트 ${PORT}번에서 성공적으로 가동되었습니다.`);
  });
}

startServer();
