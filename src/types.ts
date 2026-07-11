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

export interface ProjectFollowUp {
  id: string;
  projectId: string;
  content: string;
  date: string;
  status: 'planned' | 'in_progress' | 'done';
  meetingDegree?: number;   // 1차 미팅, 2차 미팅 등 차수
  attendee?: string;       // 미팅 참여 담당자 (미팅자)
  hasVoice?: boolean;      // 음성 메모 녹음 여부
  voiceUrl?: string;       // 음성 재생용 (시뮬레이션 혹은 실제 녹음 데이터)
  voiceDuration?: string;  // 음성 녹음 분초 (예: "0:15")
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
  tasksToday: string;    // 금일 실시 사항
  tasksTomorrow: string; // 명일 예정 사항
  issues?: string;       // 특이 사항/미결 사항
  contactIds?: string[];  // 연관 거래처/인맥 ID 목록 (명함 ID)
  projectIds?: string[];  // 연관 프로젝트 ID 목록
  expenses?: WorkLogExpense[]; // 비용 추가 항목 리스트
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
  achievementsByDay?: {
    mon?: string;
    tue?: string;
    wed?: string;
    thu?: string;
    fri?: string;
    sat?: string;
    sun?: string;
  };
  plansNextWeek: string;        // 차주 예정 사항
  feedbacks?: string;           // 애로 및 건의 사항/피드백
  contactIds?: string[];  // 연관 거래처/인맥 ID 목록 (명함 ID)
  projectIds?: string[];  // 연관 프로젝트 ID 목록
  expenses?: WorkLogExpense[]; // 비용 추가 항목 리스트
  createdAt: string;
}


