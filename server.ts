import 'dotenv/config';
import express from 'express';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import { BusinessCard, ContactGroup, CallRecord, Project, ProjectFollowUp, MyProfile, Vehicle, DrivingLog, VehicleExpense, VehicleMaintenance, MaintenanceInterval, DailyWorkLog, WeeklyWorkLog, RegisteredUser } from './src/types.js';
import {
  ensureUsersSeeded,
  ensureScopeInitialized,
  getUsers,
  addUser,
  getScopedCollection,
  getScopedDoc,
  setScopedDoc,
  setScopedDocs,
  setScopedProfile,
  updateScopedDoc,
  deleteScopedDoc,
  replaceScopedCollection
} from './src/db/supabaseStore.js';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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
} } = {};

// Supabase로부터 특정 스코프 로드 (스코프당 1회만 로드하여 메모리에 캐시)
async function loadScopeFromSupabase(scopeId: string) {
  if (db[scopeId]) return db[scopeId];

  await ensureScopeInitialized(scopeId, {
    contacts: JSON.parse(JSON.stringify(initialContacts)),
    projects: JSON.parse(JSON.stringify(initialProjects)),
    groups: JSON.parse(JSON.stringify(initialGroups)),
    myProfile: JSON.parse(JSON.stringify(initialMyProfile)),
    vehicles: JSON.parse(JSON.stringify(initialVehicles)),
    drivingLogs: JSON.parse(JSON.stringify(initialDrivingLogs)),
    expenses: JSON.parse(JSON.stringify(initialExpenses)),
    maintenances: JSON.parse(JSON.stringify(initialMaintenances)),
    maintenanceIntervals: [],
    dailyLogs: JSON.parse(JSON.stringify(initialDailyLogs)),
    weeklyLogs: JSON.parse(JSON.stringify(initialWeeklyLogs))
  });

  const [
    contacts,
    projects,
    groups,
    vehicles,
    drivingLogs,
    expenses,
    maintenances,
    maintenanceIntervals,
    dailyLogs,
    weeklyLogs,
    profileList
  ] = await Promise.all([
    getScopedCollection<BusinessCard>(scopeId, 'contacts'),
    getScopedCollection<Project>(scopeId, 'projects'),
    getScopedCollection<ContactGroup>(scopeId, 'groups'),
    getScopedCollection<Vehicle>(scopeId, 'vehicles'),
    getScopedCollection<DrivingLog>(scopeId, 'drivingLogs'),
    getScopedCollection<VehicleExpense>(scopeId, 'expenses'),
    getScopedCollection<VehicleMaintenance>(scopeId, 'maintenances'),
    getScopedCollection<MaintenanceInterval>(scopeId, 'maintenanceIntervals'),
    getScopedCollection<DailyWorkLog>(scopeId, 'dailyLogs'),
    getScopedCollection<WeeklyWorkLog>(scopeId, 'weeklyLogs'),
    getScopedCollection<MyProfile>(scopeId, 'myProfile')
  ]);

  const myProfile = profileList.find(p => p.email === 'parkyl5454@gmail.com') || profileList[0] || initialMyProfile;

  db[scopeId] = {
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
    weeklyLogs
  };

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
      if (user.type === 'company') {
        const cName = (user.companyName || '').trim();
        const bNum = (user.businessNumber || '').trim();
        scopeId = `company:${cName}_${bNum}`;
      } else {
        scopeId = `individual:${user.id}`;
      }
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
    weeklyLogs: []
  };
}

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


// 간단 좌표 계산 유틸 (주소 키워드나 기본 한강 인접 좌표 부여)
function assignCoords(address: string): { lat: number; lng: number } {
  if (address.includes('강남') || address.includes('테헤란')) return { lat: 37.4981 + (Math.random() - 0.5)*0.02, lng: 127.0276 + (Math.random() - 0.5)*0.02 };
  if (address.includes('서초')) return { lat: 37.4912 + (Math.random() - 0.5)*0.02, lng: 127.0076 + (Math.random() - 0.5)*0.02 };
  if (address.includes('판교') || address.includes('분당') || address.includes('성남')) return { lat: 37.3948 + (Math.random() - 0.5)*0.02, lng: 127.1112 + (Math.random() - 0.5)*0.02 };
  if (address.includes('마곡') || address.includes('강서')) return { lat: 37.5612 + (Math.random() - 0.5)*0.02, lng: 126.8354 + (Math.random() - 0.5)*0.02 };
  if (address.includes('여의도') || address.includes('영등포')) return { lat: 37.5219 + (Math.random() - 0.5)*0.02, lng: 126.9242 + (Math.random() - 0.5)*0.02 };
  if (address.includes('을지로') || address.includes('중구') || address.includes('종로')) return { lat: 37.5665 + (Math.random() - 0.5)*0.02, lng: 126.9780 + (Math.random() - 0.5)*0.02 };
  // 기본 서울 광화문 주변 랜덤
  return { lat: 37.5665 + (Math.random() - 0.5)*0.08, lng: 126.9780 + (Math.random() - 0.5)*0.08 };
}

// API Routes

// 🔐 Auth APIs
app.post('/api/auth/signup', async (req, res) => {
  const { email, password, name, type, companyName, businessNumber } = req.body;
  if (!email || !password || !name || !type) {
    return res.status(400).json({ error: '필수 가입 정보가 누락되었습니다.' });
  }

  const existing = users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (existing) {
    return res.status(400).json({ error: '이미 존재하는 이메일입니다.' });
  }

  const newUser: RegisteredUser = {
    id: `user-${Date.now()}`,
    email: email.toLowerCase(),
    password, // 간단한 데모용 일반 텍스트 저장
    name,
    type,
    companyName,
    businessNumber
  };

  users.push(newUser);
  await addUser(newUser); // Supabase에 계정 영구 저장

  // 가입 즉시 해당 스코프의 데이터 생성/초기화 유도
  const dummyReq = { headers: { 'x-user-id': newUser.id } } as any;
  await loadScopeFromSupabase(resolveScopeId(dummyReq));

  res.status(201).json({ 
    success: true, 
    user: { 
      id: newUser.id, 
      email: newUser.email, 
      name: newUser.name, 
      type: newUser.type, 
      companyName: newUser.companyName, 
      businessNumber: newUser.businessNumber 
    } 
  });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: '이메일과 비밀번호를 모두 입력해주세요.' });
  }

  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
  if (!user) {
    return res.status(401).json({ error: '이메일 혹은 비밀번호가 일치하지 않습니다.' });
  }

  res.json({
    success: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      type: user.type,
      companyName: user.companyName,
      businessNumber: user.businessNumber
    }
  });
});

// 👥 Registered Users Directory API
app.get('/api/auth/users', (req, res) => {
  res.json(users.map(u => ({
    id: u.id,
    email: u.email,
    name: u.name,
    type: u.type,
    companyName: u.companyName,
    businessNumber: u.businessNumber
  })));
});

// 📁 Scoped CRUD APIs
app.get('/api/contacts', (req, res) => {
  const dbData = getScopedData(req);
  res.json(dbData.contacts);
});

app.post('/api/contacts', async (req, res) => {
  const dbData = getScopedData(req);
  const newCard: BusinessCard = req.body;
  if (!newCard.id) newCard.id = `c-${Date.now()}`;
  if (!newCard.createdAt) newCard.createdAt = new Date().toISOString();
  if (!newCard.callHistory) newCard.callHistory = [];
  
  // 좌표가 없으면 주소 기반 부여
  if (!newCard.lat || !newCard.lng) {
    const coords = assignCoords(newCard.address || '');
    newCard.lat = coords.lat;
    newCard.lng = coords.lng;
  }
  
  dbData.contacts.unshift(newCard);
  await setScopedDoc((req as any).scopeId, 'contacts', newCard);
  res.status(201).json(newCard);
});

app.put('/api/contacts/:id', async (req, res) => {
  const dbData = getScopedData(req);
  const idx = dbData.contacts.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Contact not found' });
  
  const updated = { ...dbData.contacts[idx], ...req.body };
  if (req.body.address && req.body.address !== dbData.contacts[idx].address) {
    const coords = assignCoords(req.body.address);
    updated.lat = coords.lat;
    updated.lng = coords.lng;
  }
  dbData.contacts[idx] = updated;
  await setScopedDoc((req as any).scopeId, 'contacts', updated);
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
    
    // 이미지 파트 생성
    const contents: any[] = [
      "이 명함 이미지(앞면 및 뒷면)를 분석하여 다음 정보들을 추출해줘. 한국어 또는 영어 명함을 인식하여 정확한 문자열로 정리해줘.\n" +
      "명함에 본사/지사, 서울사무소/공장, 헤드오피스/연구소 등 '주소가 2개 표기되어 있는 경우' 각각을 철저하게 분리하여 address와 address2에 나눠 담아주고, 주소가 1개만 있다면 address2는 빈 문자열로 처리해줘.\n" +
      "또한 유선전화/사무실 전화번호가 2개 이상 존재하는 경우(예: 대표전화 및 직통번호, 혹은 서울사무소 번호 및 공장 번호), 첫 번째 번호는 phoneOffice에, 두 번째 번호는 phoneOffice2에 분리하여 담아주고, 1개만 있다면 phoneOffice2는 빈 문자열로 처리해줘.\n" +
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
      '  "companyInfo": "이 회사가 어떤 업종이고 무엇을 하는 곳인지 AI 지식 및 구글 실시간 인터넷 검색(googleSearch)을 기반으로 핵심 비즈니스를 1줄 요약하고, 전년도 매출액 규모(인터넷 검색을 통해 최근 전년도 매출 규모를 찾아 기재하며, 예: \'매출액 약 5,000억원\', 구체적 파악이 어려울 경우 \'매출 정보 확인 어려움\' 등으로 명시)를 반드시 포함하여 완성도 높은 한 문장으로 작성해줘 (예: \'인공지능 기반 B2B DX 및 스마트 비즈니스 솔루션 기업 (전년도 매출액 약 320억원)\')"\n' +
      "}"
    ];

    if (frontImage) {
      const base64Data = frontImage.replace(/^data:image\/\w+;base64,/, '');
      contents.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: base64Data
        }
      });
    }

    if (backImage) {
      const base64DataBack = backImage.replace(/^data:image\/\w+;base64,/, '');
      contents.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: base64DataBack
        }
      });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: contents,
      config: {
        tools: [{ googleSearch: {} }]
      }
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

// Gemini Vision 영수증 OCR API
app.post('/api/scan-receipt', async (req, res) => {
  try {
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
      "응답은 반드시 아래 JSON 규격에 맞게 순수 JSON 데이터만 리턴해줘. 마크다운 백틱(```json) 없이 리턴하거나 있어도 JSON 파싱 가능해야 함.\n" +
      "{\n" +
      '  "amount": 12000, // 숫자형 지출 금액 (원화 단위를 파싱하여 숫자만 기재, 콤마 제외)\n' +
      '  "date": "2026-03-12", // 지출 일자 (YYYY-MM-DD 포맷, 연도가 없으면 가장 최근 연도나 올해 연도로 가정)\n' +
      '  "merchantName": "상호명 또는 가맹점명 (예: 스타벅스 강남점)",\n' +
      '  "memo": "구매 품목 요약 또는 메모 (예: 아메리카노 외 2건)",\n' +
      '  "category": "선택한 카테고리 코드 (예: beverage)",\n' +
      '  "payMethod": "선택한 결제수단 코드 (예: company_card)"\n' +
      "}"
    ];

    contents.push({
      inlineData: {
        mimeType: 'image/jpeg',
        data: base64Data
      }
    });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
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
        companyInfo: `${company}은(는) 혁신 비즈니스를 영위하고 있는 기업입니다. (전년도 매출액 규모: 약 1,250억원 수준 / 실시간 AI 검색 결과를 보시려면 GEMINI_API_KEY를 등록하세요)`
      });
    }

    const ai = new GoogleGenAI({ apiKey });
    const prompt = `회사명 "${company}"의 업종, 주요 비즈니스 요약, 그리고 실시간 구글 검색(googleSearch)을 통해 파악한 전년도 매출액 규모(가장 최근의 연 매출 규모 정보, 예: '매출액 약 5,000억원', 구체적 검색이 어려울 경우 '매출 정보 확인 어려움' 등으로 명시)를 포함하여 1~2줄의 완성도 높은 한 문장으로 비즈니스 요약을 작성해줘.\n` +
      `예시 포맷: "인공지능 기반 B2B DX 및 스마트 비즈니스 솔루션 기업 (전년도 매출액 약 320억원)"\n` +
      `마크다운 백틱 이나 불필요한 서술 없이 최종 요약 문장 하나만 바로 반환해줘.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
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
  const { importedContacts } = req.body;
  if (!Array.isArray(importedContacts)) return res.status(400).json({ error: 'Invalid data' });
  
  importedContacts.forEach((c: any) => {
    if (!c.id) c.id = `c-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    if (!c.createdAt) c.createdAt = new Date().toISOString();
    if (!c.callHistory) c.callHistory = [];
    if (!c.groupId || !dbData.groups.some(g => g.id === c.groupId)) {
      c.groupId = dbData.groups[0]?.id || 'g-client';
    }
    if (!c.lat || !c.lng) {
      const coords = assignCoords(c.address || '');
      c.lat = coords.lat;
      c.lng = coords.lng;
    }
    dbData.contacts.unshift(c);
  });
  
  await setScopedDocs((req as any).scopeId, 'contacts', importedContacts);
  res.json({ count: importedContacts.length, contacts: dbData.contacts });
});

// 내 명함 프로필 API
app.get('/api/my-profile', (req, res) => {
  const dbData = getScopedData(req);
  res.json(dbData.myProfile);
});

app.put('/api/my-profile', async (req, res) => {
  const dbData = getScopedData(req);
  dbData.myProfile = { ...dbData.myProfile, ...req.body };
  await setScopedProfile((req as any).scopeId, dbData.myProfile);
  res.json(dbData.myProfile);
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
  const idx = dbData.projects.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Project not found' });
  
  const f: ProjectFollowUp = {
    id: `f-${Date.now()}`,
    projectId: req.params.id,
    content: req.body.content || '',
    date: req.body.date || new Date().toISOString().split('T')[0],
    status: req.body.status || 'planned',
    meetingDegree: req.body.meetingDegree,
    attendee: req.body.attendee,
    hasVoice: req.body.hasVoice,
    voiceUrl: req.body.voiceUrl,
    voiceDuration: req.body.voiceDuration
  };
  dbData.projects[idx].followUps.unshift(f);
  await setScopedDoc((req as any).scopeId, 'projects', dbData.projects[idx]);
  res.status(201).json(dbData.projects[idx]);
});

app.put('/api/projects/:id/followups/:fid', async (req, res) => {
  const dbData = getScopedData(req);
  const idx = dbData.projects.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Project not found' });
  
  const fIdx = dbData.projects[idx].followUps.findIndex(f => f.id === req.params.fid);
  if (fIdx !== -1) {
    dbData.projects[idx].followUps[fIdx] = { ...dbData.projects[idx].followUps[fIdx], ...req.body };
    await setScopedDoc((req as any).scopeId, 'projects', dbData.projects[idx]);
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
  const exp: VehicleExpense = req.body;
  if (!exp.id) exp.id = `exp-${Date.now()}`;
  if (!exp.createdAt) exp.createdAt = new Date().toISOString();
  
  dbData.expenses.unshift(exp);
  await setScopedDoc((req as any).scopeId, 'expenses', exp);
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
  const maint: VehicleMaintenance = req.body;
  if (!maint.id) maint.id = `maint-${Date.now()}`;
  if (!maint.createdAt) maint.createdAt = new Date().toISOString();
  
  dbData.maintenances.unshift(maint);
  await setScopedDoc((req as any).scopeId, 'maintenances', maint);
  res.status(201).json(maint);
});

app.put('/api/vehicles/maintenances/:id', async (req, res) => {
  const dbData = getScopedData(req);
  const idx = dbData.maintenances.findIndex(m => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Maintenance not found' });
  
  dbData.maintenances[idx] = { ...dbData.maintenances[idx], ...req.body };
  await setScopedDoc((req as any).scopeId, 'maintenances', dbData.maintenances[idx]);
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
  const idx = dbData.expenses.findIndex(e => e.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Expense not found' });
  dbData.expenses[idx] = { ...dbData.expenses[idx], ...req.body };
  await setScopedDoc((req as any).scopeId, 'expenses', dbData.expenses[idx]);
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

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    const polishedText = (response.text || '').trim();
    res.json({ polishedText });
  } catch (error: any) {
    console.error('AI Polish Error:', error);
    res.status(500).json({ error: error.message || 'AI 정제 중 오류가 발생했습니다.' });
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 명함 관리 서버가 포트 ${PORT}번에서 성공적으로 가동되었습니다.`);
  });
}

startServer();
