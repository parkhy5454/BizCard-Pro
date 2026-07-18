export interface CallRecord {
  id: string;
  contactId: string;
  type: 'incoming' | 'outgoing' | 'missed';
  timestamp: string; // ISO string
  duration?: string; // 예: "3분 45초"
  note?: string; // 통화 내용 요약/메모
}

export interface BusinessCard {
  id: string;
  name: string;
  company: string;
  department: string;
  title: string;
  phoneMobile: string; // 핸드폰
  phoneOffice: string; // 사무실
  phoneOffice2?: string; // 보조 유선전화/직통번호 등 (사무실2)
  phoneFax: string;    // 팩스
  email: string;
  address: string;
  address2?: string;   // 보조 주소 (공장/지사 등 주소가 2개인 경우)
  lat?: number;
  lng?: number;
  groupId: string;
  frontImage?: string; // base64 data url or sample image
  backImage?: string;
  memo?: string;
  companyInfo?: string; // 회사 간략 요약 정보
  createdAt: string;
  callHistory: CallRecord[];
}

export interface ContactGroup {
  id: string;
  name: string;
  color: string;
  count?: number;
}

export interface ScanCardResult {
  name: string;
  company: string;
  department: string;
  title: string;
  phoneMobile: string;
  phoneOffice: string;
  phoneOffice2?: string;
  phoneFax: string;
  email: string;
  address: string;
  address2?: string;
  memo?: string;
  companyInfo?: string; // 회사 요약 정보
}

export interface ProjectFollowUpAttachment {
  id: string;
  name: string;      // 파일명
  dataUrl: string;   // base64 데이터 (제안서, 견적서 등 첨부파일)
  size?: number;      // 바이트 단위 파일 크기 (표시용)
}

export interface MeetingExpenseItem {
  id: string;
  category: 'meal' | 'drinks' | 'purchase' | 'service_fee' | 'custom'; // 식대 / 음료(커피) / 물품 구입 / 식사 서비스 비용 / 직접 입력
  categoryCustom?: string; // 직접 입력 시 카테고리명
  amount: number;
  payMethod: 'company_card' | 'personal_card' | 'cash'; // 법인(회사)카드 / 개인카드 / 현금
  memo?: string; // 지출 상세 사유/메모
  receiptImage?: string; // 스캔하거나 첨부한 영수증 사진 (base64)
}

export interface ProjectFollowUp {
  id: string;
  projectId: string;
  content: string;
  date: string;
  status: 'planned' | 'in_progress' | 'done';
  meetingDegree?: number;   // 1차 미팅, 2차 미팅 등 차수 (제한 없음, 비워두면 '업무 기록'으로 표시)
  meetingType?: 'meeting' | 'followup'; // 같은 차수 안에서 "미팅"인지 "팔로우업"인지 구분
  attendee?: string;       // 미팅 참여 담당자 (미팅자, 거래처/고객 측)
  internalStaffName?: string; // 우리 회사 담당 직원 (같은 회사로 가입한 계정 중 선택)
  hasVoice?: boolean;      // 음성 메모 녹음 여부
  voiceUrl?: string;       // 음성 재생용 (시뮬레이션 혹은 실제 녹음 데이터)
  voiceDuration?: string;  // 음성 녹음 분초 (예: "0:15")
  attachments?: ProjectFollowUpAttachment[]; // 제안서/견적서/발송자료 등 첨부파일
  expenses?: MeetingExpenseItem[]; // 미팅/팔로우업 관련 지출 비용 (영수증 스캔 포함)
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  developer?: string;          // 시행사(발주처)
  contractor?: string;         // 시공사
  architect?: string;          // 건축설계사
  electricalDesigner?: string; // 전기설계사
  mechanicalDesigner?: string; // 기계설계사
  supervisor?: string;         // 감리사
  operator?: string;           // 운영사
  status: 'opportunity' | 'progress' | 'completed' | 'failed';
  priority: 'high' | 'medium' | 'low';
  dueDate: string;
  contactIds: string[]; // 연관된 거래처 명함 ID 목록
  budget?: string;
  followUps: ProjectFollowUp[];
  createdAt: string;
}

export interface MyProfile {
  name: string;
  company: string;
  department: string;
  title: string;
  phoneMobile: string;
  phoneOffice: string;
  phoneFax: string;
  email: string;
  address: string;
  snsUrl?: string;
  website?: string;
  memo?: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  type: 'individual' | 'company';
  companyName?: string;
  businessNumber?: string;
}

export interface RegisteredUser extends User {
  password?: string;
}

// === 통합 차량 관리 (Vehicle Management) ===

export interface Vehicle {
  id: string;
  modelName: string;     // 차량명 (예: 벤츠 E300 4Matic)
  plateNumber: string;   // 차량 번호 (예: 12가 3456)
  owner: string;         // 담당자 / 운전자
  purchaseDate: string;  // 구입/대여 일자
  initialMileage: number; // 최초 주행거리 (km)
  currentMileage: number; // 현재 주행거리 (km)
  fuelType: 'gasoline' | 'diesel' | 'hybrid' | 'electric' | 'lpg'; // 유종
  status: 'active' | 'maintenance' | 'retired'; // 운행가능, 정비중, 운행중단
  createdAt: string;
  // --- 추가된 필드들 ---
  modelYear?: string;     // 년식 (예: 2024년식)
  color?: string;         // 색상
  rentalType?: 'own' | 'long_rent' | 'lease' | 'short_rent' | 'short_lease'; // 임차구분
  rentalFee?: number;     // 임차료 (월, 원)
  insuranceCompany?: string; // 보험사
  insuranceStartDate?: string; // 보험 가입일자
  insuranceEndDate?: string;   // 보험 만기일자
  insuranceAgent?: string;     // 보험 담당자
  insuranceContact?: string;   // 보험 연락처
  beaconId?: string;           // 비콘 ID
  registrationDocumentUrl?: string; // 자동차 등록증 이미지/파일 URL (base64)
}

export interface DrivingLog {
  id: string;
  vehicleId: string;
  driverName: string;    // 운전자명
  date: string;          // 운행 일자
  purpose: string;       // 운행 목적 (업무용, 출퇴근, 출장 등)
  startMileage: number;  // 출발 시 주행거리 (km)
  endMileage: number;    // 도착 시 주행거리 (km)
  distance: number;      // 주행거리 (km)
  startPlace?: string;   // 출발지
  endPlace?: string;     // 목적지
  department?: string;   // 부서
  projectName?: string;  // 프로젝트명
  startAddress?: string; // 출발지 주소
  endAddress?: string;   // 목적지 주소
  memo?: string;         // 메모
  createdAt: string;
  contactId?: string;    // 연관 거래처 담당자 ID
}

export interface VehicleExpense {
  id: string;
  vehicleId: string;
  date: string;          // 지출 일자
  category: 'fuel' | 'toll' | 'parking' | 'maintenance' | 'tax_insurance' | 'other' | 'agency_drive' | 'beverage' | 'meal' | 'supplies' | 'custom'; // 주유비, 통행료, 주차비, 정비비, 세금/보험, 기타, 대리운전비, 음료, 식대, 물품 구입, 직접 입력
  categoryCustom?: string; // 직접 입력 카테고리명
  amount: number;        // 지출 금액 (원)
  memo?: string;         // 메모
  payMethod?: 'company_card' | 'personal_card' | 'cash'; // 결제 수단
  merchantName?: string;  // 상호명
  fuelVolume?: number;    // 주유량 (L)
  projectName?: string;   // 프로젝트명
  createdAt: string;
  contactId?: string;    // 연관 거래처 담당자 ID
  receiptImage?: string; // 영수증 이미지 (base64)
}

export interface VehicleMaintenance {
  id: string;
  vehicleId: string;
  date: string;          // 정비 예정/완료 일자
  title: string;         // 정비 내용 (예: 엔진오일 교환)
  cost: number;          // 정비 비용 (원)
  mileage: number;       // 정비 시점 주행거리 (km)
  shopName?: string;     // 정비소명
  shopContact?: string;  // 정비소 연락처
  status: 'scheduled' | 'completed'; // 예정됨, 정비완료
  memo?: string;         // 메모
  payMethod?: 'company_card' | 'personal_card' | 'cash'; // 결제 수단
  receiptImage?: string; // 정비 영수증/청구서 이미지 (base64)
  createdAt: string;
}

export interface MaintenanceInterval {
  id: string;
  vehicleId: string;
  itemType: string;         // 점검 항목 (엔진오일 교환 등)
  intervalKm?: number;      // km 주기
  intervalDays?: number;    // 일 주기
  lastServiceMileage?: number; // 마지막 점검 주행 거리 (km)
  lastServiceDate?: string; // 마지막 점검일
  alertKmBefore?: number;   // km 전 알림
  alertDaysBefore?: number; // 일 전 알림
  createdAt: string;
}

export interface WorkLogExpense {
  id: string;
  category: 'breakfast' | 'lunch' | 'dinner' | 'drinks' | 'fuel' | 'parking' | 'proxy' | 'purchase' | 'custom';
  categoryCustom?: string; // 직접 입력시 카테고리명
  amount: number;        // 지출 금액 (원)
  payMethod: 'company_card' | 'personal_card' | 'cash_personal' | 'cash_company'; // 결제 수단
  memo?: string;         // 메모
  vehicleId?: string;    // 연동된 차량 ID (선택)
  linkedVehicleExpenseId?: string; // 연동된 차량비용 ID (상호 연동용)
  receiptImage?: string; // 영수증 이미지 (base64)
}

export interface DailyWorkLog {
  id: string;
  date: string;          // 일일 일자 (YYYY-MM-DD)
  title: string;         // 제목
  author?: string;       // 작성자
  department?: string;   // 부서
  tasksToday: string;    // 금일 실시 사항 (taskEntriesToday를 합쳐서 만든 텍스트, 인쇄/엑셀/AI정제용)
  taskEntriesToday?: WorkLogDayEntry[]; // 금일 실시 사항 항목 목록 (하루에 여러 건, 각각 시작~종료 시간 지정 가능)
  tasksTomorrow: string; // 명일 예정 사항
  issues?: string;       // 특이 사항/미결 사항
  contactIds?: string[];  // 연관 거래처/인맥 ID 목록 (명함 ID)
  projectIds?: string[];  // 연관 프로젝트 ID 목록
  expenses?: WorkLogExpense[]; // 비용 추가 항목 리스트
  createdAt: string;
}

export interface WorkLogDayEntry {
  id: string;
  startTime?: string;   // 시작 시간 (예: "09:00")
  endTime?: string;     // 종료 시간 (예: "10:30")
  content: string;      // 해당 시간대 업무 내용
}

// === 전자결재 (Electronic Approval) ===

export type ApprovalStatus = 'draft' | 'pending' | 'approved' | 'rejected';

// 결재선 한 단계 (예: 기안자 / 경영지원실장 / 기술이사 / 대표이사)
export interface ApprovalStep {
  role: string;   // 직책/직위 라벨
  name?: string;   // 결재자 이름
  date?: string;   // 결재(승인) 일자 YYYY-MM-DD, 비어있으면 미결
}

export type LeaveCategory =
  | 'monthly'   // 월차
  | 'annual'    // 연차
  | 'official'  // 공가
  | 'sick'      // 병가
  | 'special'   // 특별휴가 (세부 종류는 specialType 필드로 구분: 출산/하기/경조/재해/직접입력)
  | 'health'    // 보건
  | 'other';    // 기타

export type LeaveSpecialType = 'birth' | 'summer' | 'family' | 'disaster' | 'custom';

// 연차 사용 단위: 년차(하루 종일, 1일) / 반차(4시간, 0.5일) / 반반차(2시간, 0.25일)
export type LeaveAnnualType = 'full' | 'half' | 'quarter';

// 휴가 신청서
export interface LeaveRequest {
  id: string;
  draftNumber: string;         // 기안번호 (예: 20260708-01)
  department: string;           // 소속
  author: string;                // 휴가자
  leaveCategory: LeaveCategory;  // 휴가 구분
  leaveCategoryCustom?: string;  // 기타 선택시 직접 입력
  specialType?: LeaveSpecialType;   // 특별휴가 선택시 세부 종류
  specialTypeCustom?: string;       // 특별휴가 세부 종류가 직접입력일 때의 텍스트
  annualType?: LeaveAnnualType;     // 연차 선택시 사용 단위 (년차/반차/반반차)
  reason: string;                // 사유
  startDate: string;             // 시작일 YYYY-MM-DD
  endDate: string;               // 종료일 YYYY-MM-DD
  startTime?: string;            // 시작 시간 (반차 등)
  endTime?: string;              // 종료 시간
  days: number;                   // 산정된 휴가 일수
  annualLeaveNote?: string;      // 연차 사용/잔여 표기 (예: "5일/20일")
  homeContact?: string;          // 자택 연락처
  mobileContact?: string;        // 휴대폰
  actingPerson?: string;         // 직무 대행자
  submittedDate: string;         // 신청일 (문서 하단 날짜)
  approvalLine: ApprovalStep[];  // 결재선
  status: ApprovalStatus;
  approverMemo?: string;
  createdAt: string;
}

export interface AdvancePaymentItem {
  id: string;
  date: string;          // 날짜
  project?: string;       // 프로젝트명
  description: string;    // 내용
  amount: number;          // 금액(원)
  account?: string;        // 계정과목
  companyName?: string;    // 상호
  remark?: string;         // 비고
}

// 가지급금 정산서
export interface AdvancePaymentSettlement {
  id: string;
  companyName: string;     // 회사명
  periodStart: string;      // 기간 시작
  periodEnd: string;        // 기간 종료
  department: string;       // 부서
  author: string;            // 작성자
  draftDate: string;        // 기안일
  items: AdvancePaymentItem[]; // 정산 내역
  approvalLine: ApprovalStep[]; // 결재선
  status: ApprovalStatus;
  approverMemo?: string;
  createdAt: string;
}

export interface WeeklyWorkLog {
  id: string;
  startDate: string;     // 주간 시작일 (YYYY-MM-DD)
  endDate: string;       // 주간 종료일 (YYYY-MM-DD)
  title: string;         // 제목
  author?: string;       // 작성자
  department?: string;   // 부서
  achievementsThisWeek: string; // 금주 실시 사항
  achievementsByDay?: {   // 요일별 실시 사항 (achievementEntriesByDay를 합쳐서 만든 텍스트, 인쇄/엑셀/AI정제용)
    mon?: string;
    tue?: string;
    wed?: string;
    thu?: string;
    fri?: string;
    sat?: string;
    sun?: string;
  };
  achievementEntriesByDay?: {   // 요일별 업무 항목 목록 (하루에 여러 건, 각각 시작~종료 시간 지정 가능)
    mon?: WorkLogDayEntry[];
    tue?: WorkLogDayEntry[];
    wed?: WorkLogDayEntry[];
    thu?: WorkLogDayEntry[];
    fri?: WorkLogDayEntry[];
    sat?: WorkLogDayEntry[];
    sun?: WorkLogDayEntry[];
  };
  plansNextWeek: string;        // 차주 예정 사항
  feedbacks?: string;           // 애로 및 건의 사항/피드백
  contactIds?: string[];  // 연관 거래처/인맥 ID 목록 (명함 ID)
  projectIds?: string[];  // 연관 프로젝트 ID 목록
  expenses?: WorkLogExpense[]; // 비용 추가 항목 리스트
  createdAt: string;
}


