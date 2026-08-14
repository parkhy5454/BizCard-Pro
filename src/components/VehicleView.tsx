import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Car, Calendar, MapPin, Receipt, Wrench, FileText, BarChart3, 
  Plus, Trash2, Search, ArrowRight, TrendingUp, CheckCircle2, 
  AlertTriangle, DollarSign, Printer, Download, Clock, Landmark, Info, Pencil, Eye, FileSpreadsheet,
  Upload, X, Paperclip, RefreshCw, Camera, Sparkles, Navigation
} from 'lucide-react';
import { Vehicle, DrivingLog, VehicleExpense, VehicleMaintenance, User, MaintenanceInterval, Project } from '../types.js';
import { ContactSearchSelect } from './ContactPicker.js';
import { CropAdjustModal, warpDataUrlWithNormalizedCorners, isValidNormalizedCorners } from './CropAdjustModal.js';
import { LiveCameraCapture } from './LiveCameraCapture.js';
import { formatCurrencyInput, parseCurrencyInput } from '../currencyFormat.js';

const MAINTENANCE_OPTIONS = [
  '엔진오일 교환',
  '엔지오일 교환',
  '타이어 교체',
  '브레이크 패드 교환',
  '에어컨 가스 충전',
  '에어필터 교환',
  '냉각수 교환',
  '미션오일 교환',
  '배터리 교체',
  '베터리 교체',
  '정기 점검'
];

const DISPLAY_MAINTENANCE_OPTIONS = [
  '엔지오일 교환',
  '타이어 교체',
  '브레이크 패드 교환',
  '에어컨 가스 충전',
  '에어필터 교환',
  '냉각수 교환',
  '미션오일 교환',
  '베터리 교체',
  '정기 점검'
];

interface Props {
  currentUser: User;
  contacts: import('../types.js').BusinessCard[];
  setContacts: React.Dispatch<React.SetStateAction<import('../types.js').BusinessCard[]>>;
}

export const VehicleView: React.FC<Props> = ({ currentUser, contacts, setContacts }) => {
  // 메인 상태
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivingLogs, setDrivingLogs] = useState<DrivingLog[]>([]);
  const [expenses, setExpenses] = useState<VehicleExpense[]>([]);
  const [maintenances, setMaintenances] = useState<VehicleMaintenance[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [maintenanceIntervals, setMaintenanceIntervals] = useState<MaintenanceInterval[]>([]);
  const [loading, setLoading] = useState(false);
  
  // 서브 탭 상태
  const [activeSubTab, setActiveSubTab] = useState<'dashboard' | 'vehicles' | 'driving' | 'expenses' | 'maintenance' | 'reports' | 'analysis'>('driving');
  const [maintSubMode, setMaintSubMode] = useState<'history' | 'intervals'>('history');

  // 등록 모달/폼 활성화 여부
  const [showVehicleForm, setShowVehicleForm] = useState(false);
  const [showDrivingForm, setShowDrivingForm] = useState(false);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [showMaintForm, setShowMaintForm] = useState(false);
  const [showIntervalForm, setShowIntervalForm] = useState(false);

  // 현재 수정 중인 차량 상태
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  // 자동차 등록증 상세 보기용 모달 상태
  const [viewDocUrl, setViewDocUrl] = useState<string | null>(null);
  // [수정] 영수증 썸네일을 눌렀을 때 크게 볼 수 있는 팝업(라이트박스)용 상태
  const [enlargedReceiptUrl, setEnlargedReceiptUrl] = useState<string | null>(null);
  // 상세 통계 보기용 모달 상태
  const [selectedStatsVehicle, setSelectedStatsVehicle] = useState<Vehicle | null>(null);

  // 수정 오버레이용 상태들
  const [editingDriving, setEditingDriving] = useState<DrivingLog | null>(null);
  const [editingExpense, setEditingExpense] = useState<VehicleExpense | null>(null);
  const [editingMaint, setEditingMaint] = useState<VehicleMaintenance | null>(null);
  const [editingInterval, setEditingInterval] = useState<MaintenanceInterval | null>(null);

  // 기간 필터 상태들 (운행, 비용, 정비)
  const [drivingPeriod, setDrivingPeriod] = useState<string>('all');
  const [drivingCustomStart, setDrivingCustomStart] = useState<string>('');
  const [drivingCustomEnd, setDrivingCustomEnd] = useState<string>('');

  const [expensePeriod, setExpensePeriod] = useState<string>('all');
  const [expenseCustomStart, setExpenseCustomStart] = useState<string>('');
  const [expenseCustomEnd, setExpenseCustomEnd] = useState<string>('');

  const [maintPeriod, setMaintPeriod] = useState<string>('all');
  const [visibleMaintCount, setVisibleMaintCount] = useState<number>(50);
  useEffect(() => {
    setVisibleMaintCount(50);
  }, [maintPeriod]);
  const [maintCustomStart, setMaintCustomStart] = useState<string>('');
  const [maintCustomEnd, setMaintCustomEnd] = useState<string>('');

  // 검색/필터 상태
  const [vehicleSearch, setVehicleSearch] = useState('');
  const [selectedVehicleFilter, setSelectedVehicleFilter] = useState<string>('all');
  // [수정] 운행기록이 몇백~몇천 건으로 늘어나도 느려지지 않도록, 처음엔 50건만 화면에 그리고
  // "더 보기"를 누르면 50건씩 더 그린다. 필터가 바뀌면 다시 50건부터 시작한다.
  const [visibleDrivingCount, setVisibleDrivingCount] = useState<number>(50);
  useEffect(() => {
    setVisibleDrivingCount(50);
  }, [selectedVehicleFilter, drivingPeriod]);
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState<string>('all');
  const [visibleExpenseCount, setVisibleExpenseCount] = useState<number>(50);
  useEffect(() => {
    setVisibleExpenseCount(50);
  }, [selectedVehicleFilter, expenseCategoryFilter, expensePeriod]);

  // [수정] 예전엔 "이 브라우저로 로그인한 사용자 이름 == 운행기록의 운전자명"이 일치하는
  // 지난 기록을 찾아서 부서를 불러왔다. 그런데 관리자가 여러 운전자를 대신 입력하는
  // 경우처럼, 로그인한 사람과 실제 운전자명이 다를 때는 매칭이 안 돼서 부서가 전혀
  // 자동으로 안 채워지는 문제가 있었다. 이제는 "이 브라우저(=지금 입력하는 사람)가
  // 마지막으로 직접 입력한 부서명"을 브라우저에 저장해뒀다가 그대로 불러온다 — 누가
  // 운전했는지와 무관하게, 입력하는 사람 기준으로 항상 정확하게 작동한다.
  const DRIVING_DEPARTMENT_STORAGE_KEY = 'bizcard_last_driving_department';
  // [수정] 운전자명 칸이 처음부터 로그인한 내 이름(currentUser.name)으로 미리 채워져
  // 있다 보니, 사용자가 그 칸을 직접 클릭했다 나가지(포커스 아웃) 않으면 아래
  // fillDrivingDepartmentForDriver가 한 번도 불리지 않는 문제가 있었다 — "이미 작성된
  // 기록에서 부서를 가져오기"가 실제로는 운전자명 칸을 직접 건드렸을 때만 동작했다.
  // 이제 드라이빙 로그가 로드된 뒤, 지금 채워져 있는 운전자명(기본값 포함) 기준으로
  // 먼저 최근 기록의 부서를 찾아보고, 없으면 브라우저에 저장해둔 마지막 값으로
  // 대신 채운다. drivingLogs가 비동기로 나중에 도착하므로 의존성 배열에 넣어 로드
  // 완료 후에도 다시 시도되게 한다.
  useEffect(() => {
    if (newDriving.department) return; // 이미 값이 있으면(직접 입력했거나 이미 채워졌으면) 안 건드림
    const trimmed = newDriving.driverName.trim();
    if (trimmed) {
      const matches = drivingLogs
        .filter((log) => log.driverName === trimmed && log.department)
        .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      if (matches[0]?.department) {
        setNewDriving((prev) => (prev.department ? prev : { ...prev, department: matches[0].department }));
        return;
      }
    }
    const lastUsed = localStorage.getItem(DRIVING_DEPARTMENT_STORAGE_KEY);
    if (lastUsed) {
      setNewDriving((prev) => (prev.department ? prev : { ...prev, department: lastUsed }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drivingLogs]);

  // [추가] 위의 "브라우저 마지막 입력값" 기본값과는 별개로, 운전자명 칸에 이름을 입력하고
  // 다른 칸으로 넘어가면(포커스 아웃) 그 사람이 예전에 운행일지에 직접 적었던 부서를 찾아서
  // 자동으로 채운다. 예: 관리자가 여러 사람의 운행일지를 대신 입력할 때도, 운전자명만
  // 정확히 입력하면 그 사람 기준 부서가 맞게 들어온다. 일치하는 기록이 없으면 건드리지 않음.
  const fillDrivingDepartmentForDriver = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const matches = drivingLogs
      .filter((log) => log.driverName === trimmed && log.department)
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    const dept = matches[0]?.department;
    if (dept) setNewDriving((prev) => ({ ...prev, department: dept }));
  };


  // 신규 등록용 폼 상태들
  // 1. 차량등록 폼
  const [newVehicle, setNewVehicle] = useState({
    modelName: '',
    plateNumber: '',
    owner: currentUser.name,
    purchaseDate: new Date().toISOString().split('T')[0],
    initialMileage: 0,
    fuelType: 'gasoline' as Vehicle['fuelType'],
    status: 'active' as Vehicle['status'],
    modelYear: '',
    color: '',
    rentalType: 'own' as Vehicle['rentalType'],
    rentalFee: 0,
    insuranceCompany: '',
    insuranceStartDate: '',
    insuranceEndDate: '',
    insuranceAgent: '',
    insuranceContact: '',
    beaconId: '',
    registrationDocumentUrl: ''
  });

  // 2. 운행일지 폼
  const [newDriving, setNewDriving] = useState({
    vehicleId: '',
    driverName: currentUser.name,
    date: new Date().toISOString().split('T')[0],
    purpose: '일반 업무용',
    startMileage: 0,
    endMileage: 0,
    startPlace: '본사',
    endPlace: '',
    // [수정] 예전엔 여기 "영업기획팀"이 하드코딩된 기본값으로 들어있었다. 그러면 위의
    // "운전자명 기준으로 최근 부서 자동 조회" 로직이 "이미 부서가 채워져 있다"고 판단해서
    // 아예 실행되지 않는 문제가 있었다(자동입력이 항상 막혀 있었던 셈). 이제 빈 값으로
    // 시작해서, 마운트 시 운전자명 기준 자동 조회(또는 브라우저 마지막 값)가 정상적으로
    // 작동하도록 한다.
    department: '',
    projectName: '',
    startAddress: '서울특별시 서초구 서초대로 396',
    endAddress: '',
    memo: '',
    contactId: ''
  });
  // 운행기록 작성 중 스캔한 영수증(통행료/주차비/식대 등) - 저장 시 비용관리에 각각 별도
  // 지출 항목으로 연동 등록됨. 한 번의 운행에 영수증이 여러 개(주차료+식비 등) 나올 수
  // 있어서 배열로 관리한다. tempId는 아직 서버에 저장 전인 화면용 임시 식별자.
  interface DrivingReceiptDraft {
    tempId: string;
    receiptImage: string;
    category: VehicleExpense['category'];
    categoryCustom: string;
    amount: number;
    merchantName: string;
    memo: string;
    payMethod: NonNullable<VehicleExpense['payMethod']>;
  }
  const [drivingReceipts, setDrivingReceipts] = useState<DrivingReceiptDraft[]>([]);
  // 지금 막 스캔해서 OCR 인식 중인 영수증이 어떤 항목인지 추적 (여러 개 중 어느 걸 갱신할지)
  const [activeDrivingReceiptTempId, setActiveDrivingReceiptTempId] = useState<string | null>(null);
  const [isScanningDrivingReceipt, setIsScanningDrivingReceipt] = useState<boolean>(false);
  // [추가] "운행 기록 수정" 모달에서 영수증을 추가로 스캔할 때 쓰는 로딩 상태.
  // 수정 화면은 이미 저장된 운행기록에 딸린 영수증이라, 스캔 즉시 바로 저장한다(신규
  // 작성 화면처럼 "저장" 버튼을 눌러야 반영되는 임시 상태가 아님).
  const [isScanningEditReceipt, setIsScanningEditReceipt] = useState<boolean>(false);

  // [추가] 목적지가 명함에 없을 때(처음 방문하는 곳 등) 카카오 장소 검색으로 찾아 쓰는 기능.
  interface PlaceSearchResult { name: string; address: string; lat: number; lng: number; }
  const [placeSearchResults, setPlaceSearchResults] = useState<PlaceSearchResult[]>([]);
  const [isSearchingPlace, setIsSearchingPlace] = useState<boolean>(false);
  const [isEstimatingDistance, setIsEstimatingDistance] = useState<boolean>(false);

  const handleSearchPlace = async (query: string) => {
    if (!query.trim()) return;
    setIsSearchingPlace(true);
    setPlaceSearchResults([]);
    try {
      const res = await fetch(`/api/places/search?query=${encodeURIComponent(query.trim())}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '장소 검색에 실패했습니다.');
      setPlaceSearchResults(data.places || []);
      if ((data.places || []).length === 0) {
        alert('검색 결과가 없습니다. 주소를 직접 입력해주세요.');
      }
    } catch (err: any) {
      alert(`장소 검색에 실패했습니다.\n${err.message || '다시 시도해주세요.'}`);
    } finally {
      setIsSearchingPlace(false);
    }
  };

  // [추가] 출발지·목적지 주소로 예상 주행거리를 계산해서, 도착 거리(km)에 "출발거리 + 예상
  // 거리"를 자동으로 채워준다. 실제 도로 거리가 아니라 직선거리 기반 근사치라 "예상"이라고
  // 표시하고, 계기판 실측값과 다르면 언제든 직접 수정할 수 있다(값을 잠그지 않는다).
  const handleEstimateDistance = async () => {
    if (!newDriving.startAddress || !newDriving.endAddress) {
      alert('출발지 주소와 목적지 주소를 먼저 입력해주세요.');
      return;
    }
    setIsEstimatingDistance(true);
    try {
      const res = await fetch('/api/vehicles/estimate-distance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startAddress: newDriving.startAddress, endAddress: newDriving.endAddress })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '거리 계산에 실패했습니다.');
      const start = Number(newDriving.startMileage) || 0;
      setNewDriving((prev) => ({ ...prev, endMileage: Math.round(start + data.estimatedKm) }));
    } catch (err: any) {
      alert(`예상 거리 계산에 실패했습니다.\n${err.message || '도착 거리를 직접 입력해주세요.'}`);
    } finally {
      setIsEstimatingDistance(false);
    }
  };

  // 3. 지출비용 폼
  const [newExpense, setNewExpense] = useState({
    vehicleId: '',
    date: new Date().toISOString().split('T')[0],
    category: 'fuel' as VehicleExpense['category'],
    categoryCustom: '',
    amount: 0,
    memo: '',
    payMethod: 'company_card' as VehicleExpense['payMethod'],
    merchantName: '',
    fuelVolume: 0,
    projectName: '',
    contactId: '',
    receiptImage: ''
  });
  const [isScanningExpenseReceipt, setIsScanningExpenseReceipt] = useState<boolean>(false);

  // 거래처 직접 입력 상태
  const [useDirectContact, setUseDirectContact] = useState<boolean>(false);
  const [directContactName, setDirectContactName] = useState<string>('');
  const [directContactCompany, setDirectContactCompany] = useState<string>('');
  const [directContactDept, setDirectContactDept] = useState<string>('');
  const [directContactTitle, setDirectContactTitle] = useState<string>('');
  const [directContactPhoneOffice, setDirectContactPhoneOffice] = useState<string>('');
  const [directContactPhoneMobile, setDirectContactPhoneMobile] = useState<string>('');
  const [directContactEmail, setDirectContactEmail] = useState<string>('');

  // 4. 정비기록 폼
  const [newMaint, setNewMaint] = useState({
    vehicleId: '',
    date: new Date().toISOString().split('T')[0],
    title: '엔진오일 교환',
    cost: 0,
    mileage: 0,
    shopName: '',
    shopContact: '',
    status: 'completed' as VehicleMaintenance['status'],
    memo: '',
    payMethod: 'company_card' as VehicleMaintenance['payMethod'],
    receiptImage: ''
  });
  const [isScanningMaintReceipt, setIsScanningMaintReceipt] = useState<boolean>(false);
  // [추가] 운행기록부 인쇄(PDF 저장) 시, #print-root 포털에 넣어서 화면의 다른 요소 없이
  // 이 표만 단독으로 인쇄되게 하기 위한 상태. null이면 인쇄할 내용이 없다는 뜻.
  const [printingReportHtml, setPrintingReportHtml] = useState<string | null>(null);

  // 5. 점검 주기 폼
  const [newInterval, setNewInterval] = useState({
    vehicleId: '',
    itemType: '엔진오일 교환',
    intervalKm: 5000,
    intervalDays: 180,
    lastServiceMileage: 0,
    lastServiceDate: new Date().toISOString().split('T')[0],
    alertKmBefore: 500,
    alertDaysBefore: 7
  });

  // 국세청 리포트용 차량 및 기간 선택
  const [reportVehicleId, setReportVehicleId] = useState<string>('');
  const [reportYearMonth, setReportYearMonth] = useState<string>(new Date().toISOString().slice(0, 7)); // YYYY-MM

  // 헤더 설정
  const getHeaders = () => ({
    'Content-Type': 'application/json',
    'x-user-id': currentUser.id
  });

  // 초기 API 데이터 페칭
  const fetchData = async () => {
    setLoading(true);
    try {
      const headers = { 'x-user-id': currentUser.id };
      const [vRes, dRes, eRes, mRes, iRes, pRes] = await Promise.all([
        fetch('/api/vehicles', { headers }).then(r => r.json()),
        fetch('/api/vehicles/driving', { headers }).then(r => r.json()),
        fetch('/api/vehicles/expenses', { headers }).then(r => r.json()),
        fetch('/api/vehicles/maintenances', { headers }).then(r => r.json()),
        fetch('/api/vehicles/intervals', { headers }).then(r => r.json()),
        fetch('/api/projects', { headers }).then(r => r.json())
      ]);

      if (Array.isArray(vRes)) setVehicles(vRes);
      if (Array.isArray(dRes)) setDrivingLogs(dRes);
      if (Array.isArray(eRes)) setExpenses(eRes);
      if (Array.isArray(mRes)) setMaintenances(mRes);
      if (Array.isArray(iRes)) setMaintenanceIntervals(iRes);
      if (Array.isArray(pRes)) setProjects(pRes);

      // 리포트용 차량 기본값
      if (Array.isArray(vRes) && vRes.length > 0) {
        setReportVehicleId(vRes[0].id);
      }
    } catch (err) {
      console.error('차량 관련 데이터 페칭 오류:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentUser]);

  // 차량 추가 액션
  const handleAddVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVehicle.modelName || !newVehicle.plateNumber) {
      alert('차량명과 차량 번호를 입력해주세요.');
      return;
    }
    try {
      const res = await fetch('/api/vehicles', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          ...newVehicle,
          currentMileage: Number(newVehicle.initialMileage),
          initialMileage: Number(newVehicle.initialMileage)
        })
      });
      if (res.ok) {
        const added = await res.json();
        setVehicles([added, ...vehicles]);
        setShowVehicleForm(false);
        setNewVehicle({
          modelName: '',
          plateNumber: '',
          owner: currentUser.name,
          purchaseDate: new Date().toISOString().split('T')[0],
          initialMileage: 0,
          fuelType: 'gasoline',
          status: 'active',
          modelYear: '',
          color: '',
          rentalType: 'own',
          rentalFee: 0,
          insuranceCompany: '',
          insuranceStartDate: '',
          insuranceEndDate: '',
          insuranceAgent: '',
          insuranceContact: '',
          beaconId: '',
          registrationDocumentUrl: ''
        });
        if (!reportVehicleId) setReportVehicleId(added.id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // 차량 정보 수정 저장 액션
  const handleUpdateVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingVehicle) return;
    if (!editingVehicle.modelName || !editingVehicle.plateNumber) {
      alert('차량명과 차량 번호를 입력해주세요.');
      return;
    }
    try {
      const res = await fetch(`/api/vehicles/${editingVehicle.id}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(editingVehicle)
      });
      if (res.ok) {
        const updated = await res.json();
        setVehicles(vehicles.map(v => v.id === updated.id ? updated : v));
        setEditingVehicle(null);
      }
    } catch (err) {
      console.error('차량 정보 수정 오류:', err);
    }
  };

  const startEditVehicle = (v: Vehicle) => {
    setEditingVehicle({
      ...v,
      modelYear: v.modelYear || '',
      color: v.color || '',
      rentalType: v.rentalType || 'own',
      rentalFee: v.rentalFee || 0,
      insuranceCompany: v.insuranceCompany || '',
      insuranceStartDate: v.insuranceStartDate || '',
      insuranceEndDate: v.insuranceEndDate || '',
      insuranceAgent: v.insuranceAgent || '',
      insuranceContact: v.insuranceContact || '',
      beaconId: v.beaconId || '',
      registrationDocumentUrl: v.registrationDocumentUrl || ''
    });
  };

  // 차량 삭제 액션
  const handleDeleteVehicle = async (id: string) => {
    if (!confirm('이 차량을 삭제하시겠습니까? 관련 운행, 지출 및 정비 일지도 모두 함께 삭제됩니다.')) return;
    try {
      const res = await fetch(`/api/vehicles/${id}`, {
        method: 'DELETE',
        headers: getHeaders()
      });
      if (res.ok) {
        setVehicles(vehicles.filter(v => v.id !== id));
        setDrivingLogs(drivingLogs.filter(log => log.vehicleId !== id));
        setExpenses(expenses.filter(exp => exp.vehicleId !== id));
        setMaintenances(maintenances.filter(m => m.vehicleId !== id));
      }
    } catch (err) {
      console.error(err);
    }
  };

  // 운행일지 추가 액션
  // 운행 중 발생한 영수증(통행료/주차비 등) 스캔 - 운행기록 저장 시 비용관리에 연동 등록됨
  // 영수증 크롭 조정 모달 대상: 어느 화면(운행/비용/정비)에서 스캔 중인지 + 원본 이미지
  const [receiptCropTarget, setReceiptCropTarget] = useState<{ context: 'driving' | 'driving-edit' | 'expense' | 'maint'; rawImage: string } | null>(null);
  const [receiptCameraTarget, setReceiptCameraTarget] = useState<'driving' | 'driving-edit' | 'expense' | 'maint' | null>(null);
  const receiptFallbackFileInputRef = React.useRef<HTMLInputElement>(null);

  // 새 초안 하나를 만들어 목록 맨 뒤에 추가하고, 그 항목을 "지금 스캔 중인 대상"으로 표시한다.
  const handleScanDrivingReceipt = (file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const rawDataUrl = ev.target?.result as string;
      const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setDrivingReceipts((prev) => [...prev, {
        tempId,
        receiptImage: rawDataUrl,
        category: 'toll',
        categoryCustom: '',
        amount: 0,
        merchantName: '',
        memo: '',
        payMethod: 'company_card'
      }]);
      setActiveDrivingReceiptTempId(tempId);
      setReceiptCropTarget({ context: 'driving', rawImage: rawDataUrl });
    };
    reader.readAsDataURL(file);
  };

  // "운행 기록 수정" 모달에서 영수증을 추가로 스캔할 때: 크롭까지 끝난 이미지를 바로 서버에
  // 저장한다(이 운행기록에 연결해서). 신규 작성 때처럼 "임시 목록"에 모아뒀다가 나중에 한꺼번에
  // 저장하지 않고, 그 자리에서 바로 등록/화면 반영까지 끝낸다.
  const handleAddReceiptToEditingDriving = async (dataUrl: string) => {
    if (!editingDriving) return;
    setIsScanningEditReceipt(true);
    try {
      const ocrRes = await fetch('/api/scan-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl })
      });
      const ocrData = await ocrRes.json();

      let finalReceiptImage = dataUrl;
      if (ocrRes.ok && isValidNormalizedCorners(ocrData.corners)) {
        try {
          finalReceiptImage = await warpDataUrlWithNormalizedCorners(dataUrl, ocrData.corners);
        } catch (err) {
          console.error('AI 좌표 기반 영수증 재크롭 실패, 기존 사진 유지:', err);
        }
      }

      const expRes = await fetch('/api/vehicles/expenses', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          vehicleId: editingDriving.vehicleId,
          date: editingDriving.date,
          category: (ocrRes.ok && ocrData.category) || 'toll',
          categoryCustom: '',
          amount: (ocrRes.ok && ocrData.amount) || 0,
          merchantName: (ocrRes.ok && ocrData.merchantName) || '',
          memo: (ocrRes.ok && ocrData.memo) || '',
          payMethod: (ocrRes.ok && ocrData.payMethod) || 'company_card',
          receiptImage: finalReceiptImage,
          projectName: editingDriving.projectName,
          contactId: editingDriving.contactId,
          drivingLogId: editingDriving.id
        })
      });
      if (!expRes.ok) throw new Error(`영수증 저장에 실패했습니다 (상태: ${expRes.status}).`);
      const addedExpense = await expRes.json();
      setExpenses((prev) => [addedExpense, ...prev]);
    } catch (err: any) {
      alert(`영수증 추가에 실패했습니다.\n${err.message || '다시 시도해주세요.'}`);
    } finally {
      setIsScanningEditReceipt(false);
    }
  };

  // 운행기록 수정 화면에서 이미 연결된 영수증을 삭제
  const handleDeleteEditingReceipt = async (expenseId: string) => {
    if (!confirm('이 영수증(지출 항목)을 삭제하시겠습니까?')) return;
    try {
      const res = await fetch(`/api/vehicles/expenses/${expenseId}`, { method: 'DELETE', headers: getHeaders() });
      if (!res.ok) throw new Error(`삭제에 실패했습니다 (상태: ${res.status}).`);
      setExpenses((prev) => prev.filter((e) => e.id !== expenseId));
    } catch (err: any) {
      alert(`삭제에 실패했습니다.\n${err.message || '다시 시도해주세요.'}`);
    }
  };

  // 크롭이 확정된 영수증 이미지를 AI로 인식해서 해당 화면(운행/운행수정/비용/정비)에 반영
  const runReceiptOcr = async (context: 'driving' | 'driving-edit' | 'expense' | 'maint', dataUrl: string) => {
    // [추가] "운행 기록 수정" 화면은 신규 작성과 달리 임시 초안 없이 스캔 즉시 바로
    // 저장하는 별도 흐름이라, 여기서 처리를 넘겨주고 끝낸다.
    if (context === 'driving-edit') {
      await handleAddReceiptToEditingDriving(dataUrl);
      return;
    }

    if (context === 'driving') {
      // 방금 handleScanDrivingReceipt가 목록에 추가해둔 항목(activeDrivingReceiptTempId)의
      // 사진만 우선 갱신한다. 나머지 항목들은 건드리지 않는다.
      setDrivingReceipts((prev) => prev.map((r) => (r.tempId === activeDrivingReceiptTempId ? { ...r, receiptImage: dataUrl } : r)));
    } else if (context === 'expense') {
      setNewExpense((prev) => ({ ...prev, receiptImage: dataUrl }));
    } else {
      setNewMaint((prev) => ({ ...prev, receiptImage: dataUrl }));
    }

    if (context === 'driving') setIsScanningDrivingReceipt(true);
    else if (context === 'expense') setIsScanningExpenseReceipt(true);
    else setIsScanningMaintReceipt(true);

    try {
      const res = await fetch('/api/scan-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl })
      });
      const data = await res.json();
      if (res.ok) {
        // [수정] AI가 함께 알려준 "영수증 실물의 네 꼭짓점 좌표"로 사진을 다시 한번 정밀하게 잘라낸다.
        let finalReceiptImage = dataUrl;
        if (isValidNormalizedCorners(data.corners)) {
          try {
            finalReceiptImage = await warpDataUrlWithNormalizedCorners(dataUrl, data.corners);
          } catch (err) {
            console.error('AI 좌표 기반 영수증 재크롭 실패, 기존 사진 유지:', err);
          }
        }

        if (context === 'driving') {
          setDrivingReceipts((prev) => prev.map((r) => {
            if (r.tempId !== activeDrivingReceiptTempId) return r;
            return {
              ...r,
              receiptImage: finalReceiptImage,
              category: (data.category as VehicleExpense['category']) || r.category,
              amount: data.amount || r.amount,
              merchantName: data.merchantName || r.merchantName,
              memo: data.memo || r.memo,
              payMethod: (data.payMethod as NonNullable<VehicleExpense['payMethod']>) || r.payMethod
            };
          }));
        } else if (context === 'expense') {
          setNewExpense((prev) => ({
            ...prev,
            category: (data.category as VehicleExpense['category']) || prev.category,
            amount: data.amount || prev.amount,
            date: data.date || prev.date,
            merchantName: data.merchantName || prev.merchantName,
            memo: data.memo || prev.memo,
            payMethod: (data.payMethod as VehicleExpense['payMethod']) || prev.payMethod,
            receiptImage: finalReceiptImage
          }));
        } else {
          setNewMaint((prev) => ({
            ...prev,
            cost: data.amount || prev.cost,
            date: data.date || prev.date,
            shopName: data.merchantName || prev.shopName,
            memo: data.memo || prev.memo,
            payMethod: (data.payMethod as VehicleMaintenance['payMethod']) || prev.payMethod,
            receiptImage: finalReceiptImage
          }));
        }
      }
    } catch (err) {
      console.error('영수증 스캔 실패:', err);
    } finally {
      if (context === 'driving') setIsScanningDrivingReceipt(false);
      else if (context === 'expense') setIsScanningExpenseReceipt(false);
      else setIsScanningMaintReceipt(false);
    }
  };



  const handleAddDriving = async (e: React.FormEvent) => {
    e.preventDefault();
    const startNum = Number(newDriving.startMileage);
    const endNum = Number(newDriving.endMileage);
    
    if (!newDriving.vehicleId) {
      alert('대상 차량을 선택해주세요.');
      return;
    }
    if (endNum <= startNum) {
      alert('도착 시 주행거리는 출발 시 주행거리보다 커야 합니다.');
      return;
    }

    const dist = endNum - startNum;

    // 지금 입력한 부서명을 브라우저에 기억해뒀다가, 다음에 새 운행기록 작성할 때 자동으로 불러온다.
    if (newDriving.department?.trim()) {
      localStorage.setItem(DRIVING_DEPARTMENT_STORAGE_KEY, newDriving.department.trim());
    }

    let finalContactId = newDriving.contactId;

    if (useDirectContact && directContactName.trim()) {
      const newCardData = {
        name: directContactName.trim(),
        company: directContactCompany.trim() || newDriving.projectName || '직접 입력',
        department: directContactDept.trim(),
        title: directContactTitle.trim(),
        phoneOffice: directContactPhoneOffice.trim(),
        phoneMobile: directContactPhoneMobile.trim(),
        email: directContactEmail.trim(),
        address: '',
        groupId: 'all'
      };

      try {
        const contactRes = await fetch('/api/contacts', {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify(newCardData)
        });
        if (contactRes.ok) {
          const savedContact = await contactRes.json();
          setContacts(prev => [savedContact, ...prev]);
          finalContactId = savedContact.id;
        } else {
          throw new Error(`직접 입력한 연락처 저장에 실패했습니다 (상태: ${contactRes.status}).`);
        }
      } catch (err: any) {
        // [수정] 예전엔 실패해도 화면에만 존재하는 가짜 연락처를 만들어서 계속 진행했다 —
        // 새로고침하면 그 연락처 연결이 사라지는 "가짜 데이터" 문제였다. 이제는 저장 자체를
        // 중단해서 사용자가 무슨 일이 있었는지 알고 다시 시도할 수 있게 한다.
        console.error('Failed to save direct contact:', err);
        alert(`직접 입력한 연락처 저장에 실패했습니다.\n${err.message || '다시 시도해주세요.'}`);
        return;
      }
    }

    try {
      const res = await fetch('/api/vehicles/driving', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          ...newDriving,
          contactId: finalContactId,
          startMileage: startNum,
          endMileage: endNum,
          distance: dist
        })
      });
      if (res.ok) {
        const added = await res.json();
        setDrivingLogs([added, ...drivingLogs]);
        
        // 차량의 주행거리 업데이트 로컬 반영
        setVehicles(vehicles.map(v => {
          if (v.id === newDriving.vehicleId) {
            return { ...v, currentMileage: Math.max(v.currentMileage, endNum) };
          }
          return v;
        }));

        // 운행 중 스캔한 영수증들이 있으면 각각 비용관리에 연동된 지출로 등록
        // (예: 주차료 1건 + 식대 1건처럼 여러 개가 있을 수 있어서 하나씩 순서대로 등록한다)
        if (drivingReceipts.length > 0) {
          let failedCount = 0;
          for (const receipt of drivingReceipts) {
            try {
              const expRes = await fetch('/api/vehicles/expenses', {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({
                  vehicleId: newDriving.vehicleId,
                  date: newDriving.date,
                  category: receipt.category,
                  categoryCustom: receipt.categoryCustom,
                  amount: Number(receipt.amount) || 0,
                  memo: receipt.memo,
                  payMethod: receipt.payMethod,
                  merchantName: receipt.merchantName,
                  receiptImage: receipt.receiptImage,
                  projectName: newDriving.projectName,
                  contactId: finalContactId,
                  drivingLogId: added.id
                })
              });
              if (expRes.ok) {
                const addedExpense = await expRes.json();
                setExpenses((prev) => [addedExpense, ...prev]);
              } else {
                failedCount++;
              }
            } catch (err) {
              console.error('운행 연동 지출 등록 실패:', err);
              failedCount++;
            }
          }
          if (failedCount > 0) {
            alert(`운행기록은 저장됐지만, 영수증 ${failedCount}건은 등록에 실패했습니다. "운행 기록 수정"에서 다시 추가해주세요.`);
          }
          setDrivingReceipts([]);
          setActiveDrivingReceiptTempId(null);
        }

        setShowDrivingForm(false);
        setNewDriving({
          vehicleId: '',
          driverName: currentUser.name,
          date: new Date().toISOString().split('T')[0],
          purpose: '일반 업무용',
          startMileage: 0,
          endMileage: 0,
          startPlace: '본사',
          endPlace: '',
          // [수정] 방금 사용한 부서명을 다음 새 운행기록에도 그대로 이어서 채워준다
          // (매번 새로 입력하는 번거로움을 줄이기 위함).
          department: newDriving.department,
          projectName: '',
          startAddress: '서울특별시 서초구 서초대로 396',
          endAddress: '',
          memo: '',
          contactId: ''
        });

        // Reset direct contact fields
        setUseDirectContact(false);
        setDirectContactName('');
        setDirectContactCompany('');
        setDirectContactDept('');
        setDirectContactTitle('');
        setDirectContactPhoneOffice('');
        setDirectContactPhoneMobile('');
        setDirectContactEmail('');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // 운행일지 삭제 액션
  const handleDeleteDriving = async (id: string) => {
    if (!confirm('선택한 운행 기록을 삭제하시겠습니까?')) return;
    try {
      const res = await fetch(`/api/vehicles/driving/${id}`, {
        method: 'DELETE',
        headers: getHeaders()
      });
      if (res.ok) {
        setDrivingLogs(drivingLogs.filter(log => log.id !== id));
      }
    } catch (err) {
      console.error(err);
    }
  };

  // 영수증 스캔: /api/scan-receipt 결과를 지출 폼에 자동으로 채움 (카테고리 체계가 동일해서 그대로 매핑)
  const handleScanExpenseReceipt = (file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const rawDataUrl = ev.target?.result as string;
      setNewExpense((prev) => ({ ...prev, receiptImage: rawDataUrl }));
      setReceiptCropTarget({ context: 'expense', rawImage: rawDataUrl });
    };
    reader.readAsDataURL(file);
  };

  // 지출비용 추가 액션
  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExpense.vehicleId) {
      alert('차량을 선택해주세요.');
      return;
    }
    if (Number(newExpense.amount) <= 0) {
      alert('올바른 지출금액을 입력해주세요.');
      return;
    }

    let finalContactId = newExpense.contactId;

    if (useDirectContact && directContactName.trim()) {
      const newCardData = {
        name: directContactName.trim(),
        company: directContactCompany.trim() || newExpense.projectName || '직접 입력',
        department: directContactDept.trim(),
        title: directContactTitle.trim(),
        phoneOffice: directContactPhoneOffice.trim(),
        phoneMobile: directContactPhoneMobile.trim(),
        email: directContactEmail.trim(),
        address: '',
        groupId: 'all'
      };

      try {
        const contactRes = await fetch('/api/contacts', {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify(newCardData)
        });
        if (contactRes.ok) {
          const savedContact = await contactRes.json();
          setContacts(prev => [savedContact, ...prev]);
          finalContactId = savedContact.id;
        } else {
          throw new Error(`직접 입력한 연락처 저장에 실패했습니다 (상태: ${contactRes.status}).`);
        }
      } catch (err: any) {
        // [수정] 예전엔 실패해도 화면에만 존재하는 가짜 연락처를 만들어서 계속 진행했다 —
        // 새로고침하면 그 연락처 연결이 사라지는 "가짜 데이터" 문제였다. 이제는 저장 자체를
        // 중단해서 사용자가 무슨 일이 있었는지 알고 다시 시도할 수 있게 한다.
        console.error('Failed to save direct contact:', err);
        alert(`직접 입력한 연락처 저장에 실패했습니다.\n${err.message || '다시 시도해주세요.'}`);
        return;
      }
    }

    try {
      const res = await fetch('/api/vehicles/expenses', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          ...newExpense,
          contactId: finalContactId,
          amount: Number(newExpense.amount)
        })
      });
      if (res.ok) {
        const added = await res.json();
        setExpenses([added, ...expenses]);
        setShowExpenseForm(false);
        setNewExpense({
          vehicleId: '',
          date: new Date().toISOString().split('T')[0],
          category: 'fuel',
          categoryCustom: '',
          amount: 0,
          memo: '',
          payMethod: 'company_card',
          merchantName: '',
          fuelVolume: 0,
          projectName: '',
          contactId: '',
          receiptImage: ''
        });

        // Reset direct contact fields
        setUseDirectContact(false);
        setDirectContactName('');
        setDirectContactCompany('');
        setDirectContactDept('');
        setDirectContactTitle('');
        setDirectContactPhoneOffice('');
        setDirectContactPhoneMobile('');
        setDirectContactEmail('');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // 지출비용 삭제 액션
  const handleDeleteExpense = async (id: string) => {
    if (!confirm('선택한 비용 지출 명세를 삭제하시겠습니까?')) return;
    try {
      const res = await fetch(`/api/vehicles/expenses/${id}`, {
        method: 'DELETE',
        headers: getHeaders()
      });
      if (res.ok) {
        setExpenses(expenses.filter(e => e.id !== id));
      }
    } catch (err) {
      console.error(err);
    }
  };

  // 정비 영수증/청구서 스캔: 금액/상호명(정비소명)/결제수단/메모를 자동으로 채움
  const handleScanMaintReceipt = (file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const rawDataUrl = ev.target?.result as string;
      setNewMaint((prev) => ({ ...prev, receiptImage: rawDataUrl }));
      setReceiptCropTarget({ context: 'maint', rawImage: rawDataUrl });
    };
    reader.readAsDataURL(file);
  };

  // 정비기록 추가 액션
  const handleAddMaint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMaint.vehicleId) {
      alert('차량을 선택해주세요.');
      return;
    }
    if (!newMaint.title) {
      alert('정비 항목 내용을 입력해주세요.');
      return;
    }

    try {
      const res = await fetch('/api/vehicles/maintenances', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          ...newMaint,
          cost: Number(newMaint.cost),
          mileage: Number(newMaint.mileage)
        })
      });
      if (res.ok) {
        const added = await res.json();
        setMaintenances([added, ...maintenances]);
        setShowMaintForm(false);
        setNewMaint({
          vehicleId: '',
          date: new Date().toISOString().split('T')[0],
          title: '',
          cost: 0,
          mileage: 0,
          shopName: '',
          shopContact: '',
          status: 'completed',
          memo: '',
          payMethod: 'company_card',
          receiptImage: ''
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  // 정비완료 전환 액션
  const handleCompleteMaint = async (id: string) => {
    try {
      const res = await fetch(`/api/vehicles/maintenances/${id}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ status: 'completed' })
      });
      if (res.ok) {
        const updated = await res.json();
        setMaintenances(maintenances.map(m => m.id === id ? updated : m));
      }
    } catch (err) {
      console.error(err);
    }
  };

  // 정비 삭제 액션
  const handleDeleteMaint = async (id: string) => {
    if (!confirm('선택한 정비 기록을 삭제하시겠습니까?')) return;
    try {
      const res = await fetch(`/api/vehicles/maintenances/${id}`, {
        method: 'DELETE',
        headers: getHeaders()
      });
      if (res.ok) {
        setMaintenances(maintenances.filter(m => m.id !== id));
      }
    } catch (err) {
      console.error(err);
    }
  };

  // 운행기록 수정 액션
  const handleUpdateDriving = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDriving) return;
    const startNum = Number(editingDriving.startMileage);
    const endNum = Number(editingDriving.endMileage);
    if (endNum <= startNum) {
      alert('도착 시 주행거리는 출발 시 주행거리보다 커야 합니다.');
      return;
    }
    const dist = endNum - startNum;
    try {
      const res = await fetch(`/api/vehicles/driving/${editingDriving.id}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({
          ...editingDriving,
          startMileage: startNum,
          endMileage: endNum,
          distance: dist
        })
      });
      if (res.ok) {
        const updated = await res.json();
        // [추가] 서버가 "다음 기록의 출발 계기판도 같이 맞췄다"는 결과(cascadedLog)를
        // 함께 내려주면, 화면 상태에도 그 두 번째 기록까지 같이 반영한다.
        setDrivingLogs(drivingLogs.map(log => {
          if (log.id === updated.id) return updated;
          if (updated.cascadedLog && log.id === updated.cascadedLog.id) return updated.cascadedLog;
          return log;
        }));
        // 차량의 주행거리 업데이트 로컬 반영
        setVehicles(vehicles.map(v => {
          if (v.id === editingDriving.vehicleId) {
            return { ...v, currentMileage: Math.max(v.currentMileage, endNum) };
          }
          return v;
        }));
        if (updated.cascadedLog) {
          alert(`도착 계기판이 수정되어, 이어지는 다음 기록의 출발 계기판(${updated.cascadedLog.startMileage.toLocaleString()}km)도 함께 자동으로 맞췄습니다.`);
        }
        setEditingDriving(null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // 지출비용 수정 액션
  const handleUpdateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExpense) return;
    if (Number(editingExpense.amount) <= 0) {
      alert('올바른 지출금액을 입력해주세요.');
      return;
    }
    try {
      const res = await fetch(`/api/vehicles/expenses/${editingExpense.id}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({
          ...editingExpense,
          amount: Number(editingExpense.amount)
        })
      });
      if (res.ok) {
        const updated = await res.json();
        setExpenses(expenses.map(exp => exp.id === updated.id ? updated : exp));
        setEditingExpense(null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // 정비기록 수정 액션
  const handleUpdateMaint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMaint) return;
    if (!editingMaint.title) {
      alert('정비 항목 내용을 입력해주세요.');
      return;
    }
    try {
      const res = await fetch(`/api/vehicles/maintenances/${editingMaint.id}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({
          ...editingMaint,
          cost: Number(editingMaint.cost),
          mileage: Number(editingMaint.mileage)
        })
      });
      if (res.ok) {
        const updated = await res.json();
        setMaintenances(maintenances.map(m => m.id === updated.id ? updated : m));
        setEditingMaint(null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // 점검 주기 추가 액션
  const handleAddInterval = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInterval.vehicleId) {
      alert('대상 차량을 선택해주세요.');
      return;
    }
    if (!newInterval.itemType) {
      alert('점검 항목을 입력해주세요.');
      return;
    }
    try {
      const res = await fetch('/api/vehicles/intervals', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          ...newInterval,
          intervalKm: Number(newInterval.intervalKm),
          intervalDays: Number(newInterval.intervalDays),
          lastServiceMileage: Number(newInterval.lastServiceMileage),
          alertKmBefore: Number(newInterval.alertKmBefore),
          alertDaysBefore: Number(newInterval.alertDaysBefore)
        })
      });
      if (res.ok) {
        const added = await res.json();
        setMaintenanceIntervals([added, ...maintenanceIntervals]);
        setShowIntervalForm(false);
        setNewInterval({
          vehicleId: '',
          itemType: '엔진오일 교환',
          intervalKm: 5000,
          intervalDays: 180,
          lastServiceMileage: 0,
          lastServiceDate: new Date().toISOString().split('T')[0],
          alertKmBefore: 500,
          alertDaysBefore: 7
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  // 점검 주기 수정 액션
  const handleUpdateInterval = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingInterval) return;
    try {
      const res = await fetch(`/api/vehicles/intervals/${editingInterval.id}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({
          ...editingInterval,
          intervalKm: Number(editingInterval.intervalKm),
          intervalDays: Number(editingInterval.intervalDays),
          lastServiceMileage: Number(editingInterval.lastServiceMileage),
          alertKmBefore: Number(editingInterval.alertKmBefore),
          alertDaysBefore: Number(editingInterval.alertDaysBefore)
        })
      });
      if (res.ok) {
        const updated = await res.json();
        setMaintenanceIntervals(maintenanceIntervals.map(item => item.id === updated.id ? updated : item));
        setEditingInterval(null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // 점검 주기 삭제 액션
  const handleDeleteInterval = async (id: string) => {
    if (!confirm('선택한 점검 주기를 삭제하시겠습니까?')) return;
    try {
      const res = await fetch(`/api/vehicles/intervals/${id}`, {
        method: 'DELETE',
        headers: getHeaders()
      });
      if (res.ok) {
        setMaintenanceIntervals(maintenanceIntervals.filter(item => item.id !== id));
      }
    } catch (err) {
      console.error(err);
    }
  };

  // 한글 유종 이름 변환
  const getFuelTypeKo = (type: Vehicle['fuelType']) => {
    switch (type) {
      case 'gasoline': return '가솔린 (휘발유)';
      case 'diesel': return '디젤 (경유)';
      case 'hybrid': return '하이브리드';
      case 'electric': return '전기차';
      case 'lpg': return 'LPG';
      default: return '기타';
    }
  };

  // 한글 임차 구분 이름 변환
  const getRentalTypeKo = (type?: string) => {
    switch (type) {
      case 'own': return '자가 (소유 자산)';
      case 'long_rent': return '장기렌트';
      case 'lease': return '운용/금융리스';
      case 'short_rent': return '단기렌트';
      case 'short_lease': return '단기리스';
      default: return '자가 (소유 자산)';
    }
  };

  // 한글 지출 범주 이름 변환
  const getCategoryKo = (cat: VehicleExpense['category'], customName?: string) => {
    switch (cat) {
      case 'fuel': return '⛽ 주유비';
      case 'toll': return '🛣️ 통행료';
      case 'parking': return '🅿️ 주차비';
      case 'maintenance': return '🔧 정비/수리비';
      case 'tax_insurance': return '📄 세금/보험';
      case 'other': return '🪙 기타 비용';
      case 'agency_drive': return '🚗 대리운전비';
      case 'beverage': return '☕ 음료';
      case 'meal': return '🍱 식대';
      case 'supplies': return '📦 물품 구입';
      case 'custom': return customName ? `🏷️ ${customName}` : '🏷️ 직접 입력';
      default: return '기타';
    }
  };

  // 차량ID -> 차량모델명 매핑
  const getVehicleModel = (id: string) => {
    const v = vehicles.find(x => x.id === id);
    return v ? `${v.modelName} (${v.plateNumber})` : '삭제된 차량';
  };

  // 숫자 천단위 포맷팅
  const formatWon = (val: number) => {
    return new Intl.NumberFormat('ko-KR').format(val);
  };

  // 기간 필터링용 유틸리티 함수
  const isDateInPeriod = (dateStr: string, period: string, customStart?: string, customEnd?: string) => {
    if (!dateStr) return false;
    if (period === 'all') return true;
    const targetDate = new Date(dateStr);
    targetDate.setHours(0,0,0,0);
    const now = new Date();
    now.setHours(0,0,0,0);

    if (period === 'today') {
      return dateStr === now.toISOString().split('T')[0];
    }
    if (period === 'week') {
      const startOfWeek = new Date(now);
      const day = startOfWeek.getDay();
      const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1); // Monday
      startOfWeek.setDate(diff);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6); // Sunday
      return targetDate >= startOfWeek && targetDate <= endOfWeek;
    }
    if (period === 'month') {
      return targetDate.getFullYear() === now.getFullYear() && targetDate.getMonth() === now.getMonth();
    }
    if (period === 'year') {
      return targetDate.getFullYear() === now.getFullYear();
    }
    if (period === 'custom') {
      if (customStart && customEnd) {
        const start = new Date(customStart);
        start.setHours(0,0,0,0);
        const end = new Date(customEnd);
        end.setHours(23,59,59,999);
        return targetDate >= start && targetDate <= end;
      }
      if (customStart) {
        const start = new Date(customStart);
        start.setHours(0,0,0,0);
        return targetDate >= start;
      }
      if (customEnd) {
        const end = new Date(customEnd);
        end.setHours(23,59,59,999);
        return targetDate <= end;
      }
    }
    return true;
  };

  // 카드 내 자동차 등록증 삭제 처리
  const handleRemoveDocument = (vehicleId: string) => {
    if (confirm('자동차 등록증 서류 사본을 삭제하시겠습니까?')) {
      const updatedVehicles = vehicles.map(v => 
        v.id === vehicleId ? { ...v, registrationDocumentUrl: '' } : v
      );
      setVehicles(updatedVehicles);
      localStorage.setItem('corporate_vehicles', JSON.stringify(updatedVehicles));
    }
  };

  // 카드 내 자동차 등록증 파일 업로드 처리
  const handleUploadDocChange = (vId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const updatedVehicles = vehicles.map(vehicle => 
          vehicle.id === vId ? { ...vehicle, registrationDocumentUrl: reader.result as string } : vehicle
        );
        setVehicles(updatedVehicles);
        localStorage.setItem('corporate_vehicles', JSON.stringify(updatedVehicles));
      };
      reader.readAsDataURL(file);
    }
  };

  // === 대시보드 산출 지표 계산 ===
  const totalVehiclesCount = vehicles.length;
  const totalDrivingLogsCount = drivingLogs.length;
  const totalDistance = drivingLogs.reduce((sum, log) => sum + log.distance, 0);
  const totalExpenseSum = expenses.reduce((sum, exp) => sum + exp.amount, 0);

  // 최근 운행기록 (5개)
  const recentLogs = [...drivingLogs]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);

  return (
    <div className="flex flex-col gap-3 animate-fade-in" id="vehicle-management-view">
      
      {/* 서브 탭 탐색 내비게이션 바 */}
      <div className="flex border-b border-slate-200 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="flex space-x-1 py-1 shrink-0">
          {[
            { id: 'driving', label: '운행기록', icon: MapPin },
            { id: 'expenses', label: '비용관리', icon: Receipt },
            { id: 'maintenance', label: '정비일지', icon: Wrench },
            { id: 'reports', label: '리포트 출력', icon: FileText },
            { id: 'analysis', label: '지출·운행 분석', icon: TrendingUp },
            { id: 'vehicles', label: '차량등록', icon: Car },
            { id: 'dashboard', label: '대시보드', icon: BarChart3 }
          ].map(tab => {
            const Icon = tab.icon;
            const active = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all shrink-0 ${
                  active 
                    ? 'bg-slate-100 border-b-2 border-indigo-500 text-indigo-600 shadow-sm' 
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${active ? 'text-indigo-400' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ========================================== */}
      {/* 폼 등록 패널 레이아웃 영역 (필요 시 상단 드롭다운) */}
      {/* ========================================== */}
      
      {/* 차량 신규 등록 폼 제거됨 (vehicles 탭 내부로 이동) */}

      {/* 운행일지 신규 작성 폼 제거됨 (driving 탭 내부로 이동) */}


      {/* ========================================== */}
      {/* 서브 탭 본문 렌더링 영역 */}
      {/* ========================================== */}

      {/* 1. 대시보드 (Dashboard) */}
      {activeSubTab === 'dashboard' && (
        <div className="space-y-6">

          {(() => {
            const expiringVehicles = vehicles.filter(v => {
              if (!v.insuranceEndDate) return false;
              try {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const cleanDateStr = v.insuranceEndDate.replace(/\./g, '-');
                const endDate = new Date(cleanDateStr);
                endDate.setHours(0, 0, 0, 0);
                if (isNaN(endDate.getTime())) return false;
                const diffDays = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                return diffDays <= 30; // 30 days is 1 month
              } catch (_) {
                return false;
              }
            });

            if (expiringVehicles.length === 0) return null;

            return (
              <div className="bg-amber-950/15 border border-amber-800/30 rounded-2xl p-4 space-y-3">
                <div className="flex items-center gap-2 text-amber-400">
                  <AlertTriangle className="w-5 h-5 shrink-0" />
                  <h3 className="text-sm font-bold">자동차 보험 갱신 알림 (만기 1달 이내)</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {expiringVehicles.map(v => {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const cleanDateStr = v.insuranceEndDate!.replace(/\./g, '-');
                    const endDate = new Date(cleanDateStr);
                    endDate.setHours(0, 0, 0, 0);
                    const daysLeft = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                    const isExpired = daysLeft < 0;

                    return (
                      <div key={v.id} className="bg-slate-50 border border-slate-200 p-3 rounded-xl flex items-center justify-between text-xs">
                        <div className="space-y-1">
                          <p className="font-bold text-slate-700">{v.modelName} ({v.carNumber})</p>
                          <p className="text-[11px] text-slate-500">
                            보험사: {v.insuranceCompany || '미지정'} · 만기일: {v.insuranceEndDate}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          {isExpired ? (
                            <span className="px-2 py-1 bg-rose-50 text-rose-700 border border-rose-500/30 rounded text-[11px] font-bold">
                              만기 {Math.abs(daysLeft)}일 경과
                            </span>
                          ) : (
                            <span className="px-2 py-1 bg-amber-50 text-amber-700 border border-amber-500/30 rounded text-[11px] font-bold">
                              D-{daysLeft}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* ⚠️ 정비/소모품 점검 임박 알림 배너 */}
          {(() => {
            const dueSoonItems = maintenanceIntervals.map((item) => {
              const vehicle = vehicles.find(v => v.id === item.vehicleId);
              const currentMileage = vehicle ? vehicle.currentMileage : 0;
              const drivenKm = Math.max(0, currentMileage - item.lastServiceMileage);
              const kmLeft = item.intervalKm - drivenKm;

              let daysElapsed = 0;
              try {
                const lastDate = new Date(item.lastServiceDate);
                daysElapsed = Math.max(0, Math.floor((new Date().getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)));
              } catch (_) {}
              const daysLeft = item.intervalDays - daysElapsed;

              const isKmExceeded = drivenKm >= item.intervalKm;
              const isDaysExceeded = daysElapsed >= item.intervalDays;
              const isAlertKm = kmLeft <= item.alertKmBefore;
              const isAlertDays = daysLeft <= item.alertDaysBefore;

              return { item, vehicle, kmLeft, daysLeft, isOverdue: isKmExceeded || isDaysExceeded, hasWarning: isKmExceeded || isDaysExceeded || isAlertKm || isAlertDays };
            }).filter((r) => r.hasWarning);

            if (dueSoonItems.length === 0) return null;

            return (
              <div className="bg-amber-950/15 border border-amber-800/30 rounded-2xl p-4 space-y-3">
                <div className="flex items-center gap-2 text-amber-400">
                  <Wrench className="w-5 h-5 shrink-0" />
                  <h3 className="text-sm font-bold">정비/소모품 점검 임박 알림</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {dueSoonItems.map(({ item, vehicle, kmLeft, daysLeft, isOverdue }) => (
                    <div key={item.id} className="bg-slate-50 border border-slate-200 p-3 rounded-xl flex items-center justify-between text-xs">
                      <div className="space-y-1">
                        <p className="font-bold text-slate-700">{vehicle ? `${vehicle.modelName} (${vehicle.plateNumber})` : '차량 미지정'}</p>
                        <p className="text-[11px] text-slate-500">
                          {item.itemType} · 남은 거리: {Math.max(0, kmLeft).toLocaleString()}km · 남은 일수: {Math.max(0, daysLeft)}일
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        {isOverdue ? (
                          <span className="px-2 py-1 bg-rose-50 text-rose-700 border border-rose-500/30 rounded text-[11px] font-bold">
                            교체 주기 초과
                          </span>
                        ) : (
                          <span className="px-2 py-1 bg-amber-50 text-amber-700 border border-amber-500/30 rounded text-[11px] font-bold">
                            점검 임박
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* 4개의 핵심 계량 카드 - 참고 이미지처럼 진한 단색 배경 + 흰 글씨로 한눈에 구분되게 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* 등록된 차량 */}
            <div className="bg-blue-600 p-5 rounded-2xl flex items-center justify-between shadow-md">
              <div className="space-y-2">
                <span className="text-xs font-semibold text-white/80">등록된 차량</span>
                <p className="text-2xl font-bold text-white">{totalVehiclesCount}대</p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center text-white">
                <Car className="w-5.5 h-5.5" />
              </div>
            </div>

            {/* 총 운행기록 */}
            <div className="bg-emerald-500 p-5 rounded-2xl flex items-center justify-between shadow-md">
              <div className="space-y-2">
                <span className="text-xs font-semibold text-white/80">총 운행기록</span>
                <p className="text-2xl font-bold text-white">{totalDrivingLogsCount}건</p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center text-white">
                <MapPin className="w-5.5 h-5.5" />
              </div>
            </div>

            {/* 총 누적거리 */}
            <div className="bg-amber-500 p-5 rounded-2xl flex items-center justify-between shadow-md">
              <div className="space-y-2">
                <span className="text-xs font-semibold text-white/80">총 누적거리</span>
                <p className="text-2xl font-bold text-white">{formatWon(totalDistance)} km</p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center text-white">
                <Info className="w-5.5 h-5.5" />
              </div>
            </div>

            {/* 총 지출비용 */}
            <div className="bg-purple-500 p-5 rounded-2xl flex items-center justify-between shadow-md">
              <div className="space-y-2">
                <span className="text-xs font-semibold text-white/80">총 지출비용</span>
                <p className="text-2xl font-bold text-white">{formatWon(totalExpenseSum)} 원</p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center text-white">
                <Receipt className="w-5.5 h-5.5" />
              </div>
            </div>

          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* 최근 운행 기록 목록 */}
            <div className="lg:col-span-2 bg-slate-100 border border-slate-200 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200/50 pb-3">
                <h3 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-indigo-400" />
                  <span>최근 운행 기록</span>
                </h3>
                <button 
                  onClick={() => setActiveSubTab('driving')}
                  className="text-[10px] text-indigo-400 hover:underline font-semibold"
                >
                  기록 전체보기 →
                </button>
              </div>

              {recentLogs.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  최근 기록된 운행 일지가 없습니다.
                </div>
              ) : (
                <div className="divide-y divide-slate-200/50">
                  {recentLogs.map((log) => {
                    const matchedCar = vehicles.find(v => v.id === log.vehicleId);
                    return (
                      <div key={log.id} className="py-3 flex items-center justify-between text-xs gap-4 first:pt-0 last:pb-0">
                        <div className="space-y-1">
                          <p className="font-semibold text-slate-800">{matchedCar ? matchedCar.modelName : '차량'}</p>
                          <div className="flex items-center gap-2 text-[11px] text-slate-400">
                            <span>{log.date}</span>
                            <span>•</span>
                            <span>{log.driverName} ({log.purpose})</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="font-bold text-slate-700 text-sm">{log.distance} km</span>
                          {log.startPlace && log.endPlace && (
                            <p className="text-[10px] text-slate-400">
                              {log.startPlace} → {log.endPlace}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 다가오는 정비 일정 & 주유비 비중 간략 분석 */}
            <div className="bg-slate-100 border border-slate-200 rounded-2xl p-5 space-y-4 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200/50 pb-3">
                  <h3 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Wrench className="w-4 h-4 text-indigo-400" />
                    <span>정비 수리 일정</span>
                  </h3>
                  <button 
                    onClick={() => setActiveSubTab('maintenance')}
                    className="text-[10px] text-indigo-400 hover:underline font-semibold"
                  >
                    일지 쓰기 →
                  </button>
                </div>

                {maintenances.filter(m => m.status === 'scheduled').length === 0 ? (
                  <div className="py-6 text-center text-slate-400 text-[11px] flex flex-col items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                    <p>잡혀있는 예정된 정비가 없습니다.<br />소모품 교환 주기를 추가해 보세요.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {maintenances
                      .filter(m => m.status === 'scheduled')
                      .slice(0, 3)
                      .map(m => (
                        <div key={m.id} className="p-3 bg-slate-100 border border-slate-200 rounded-xl flex items-start gap-2.5 text-xs">
                          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                          <div className="space-y-0.5 flex-1">
                            <p className="font-bold text-slate-700">{m.title}</p>
                            <p className="text-[10px] text-slate-400">{getVehicleModel(m.vehicleId)} | {m.date}</p>
                            {m.cost > 0 && <p className="text-[10px] text-amber-600">예상비용: {formatWon(m.cost)}원</p>}
                          </div>
                          <button 
                            onClick={() => handleCompleteMaint(m.id)}
                            className="px-2 py-1 rounded bg-indigo-50 text-indigo-700 hover:bg-indigo-500/20 text-[10px] font-semibold"
                          >
                            완료 처리
                          </button>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              {/* 퀵 팁 */}
              <div className="pt-4 border-t border-slate-200/50 text-[11px] text-slate-500 leading-relaxed flex items-start gap-1.5 bg-indigo-950/10 p-3 rounded-xl border border-indigo-900/20">
                <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                <p>
                  <span className="font-bold text-indigo-600">스마트 데이터팁:</span> 모든 사원들이 동일 회사 소속으로 가입하면 본 차량 대시보드 및 지출 운행기록 전산이 전사 동기화됩니다.
                </p>
              </div>

            </div>

          </div>

        </div>
      )}

      {/* 2. 차량등록 (Vehicles Tab) */}
      {activeSubTab === 'vehicles' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowVehicleForm(!showVehicleForm)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs text-white transition-all font-semibold shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>차량 추가</span>
            </button>
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input 
                type="text" 
                placeholder="차량명, 번호 검색..." 
                value={vehicleSearch}
                onChange={e => setVehicleSearch(e.target.value)}
                className="w-full bg-white text-xs text-slate-700 pl-9 pr-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 placeholder-slate-500"
              />
            </div>
          </div>

          {/* 1. 차량 신규 등록 폼 */}
          {showVehicleForm && (
            <div className="p-6 bg-white border border-slate-200 rounded-2xl space-y-6">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                  <Car className="w-4 h-4 text-indigo-400" />
                  <span>신규 차량 등록 대장 기입</span>
                </h3>
                <button onClick={() => setShowVehicleForm(false)} className="text-xs text-slate-400 hover:text-slate-600">닫기</button>
              </div>
              
              <form onSubmit={handleAddVehicle} className="space-y-6">
                {/* 세션 1: 차량 기본 정보 */}
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-indigo-400 flex items-center gap-1">
                    <span>•</span> 차량 기본 정보
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-500">차량 모델명 *</label>
                      <input 
                        type="text" 
                        placeholder="예: 벤츠 E300 4Matic" 
                        value={newVehicle.modelName}
                        onChange={e => setNewVehicle({ ...newVehicle, modelName: e.target.value })}
                        className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-500">차량 등록 번호 *</label>
                      <input 
                        type="text" 
                        placeholder="예: 12가 3456" 
                        value={newVehicle.plateNumber}
                        onChange={e => setNewVehicle({ ...newVehicle, plateNumber: e.target.value })}
                        className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-500">기본 유종 *</label>
                      <select 
                        value={newVehicle.fuelType}
                        onChange={e => setNewVehicle({ ...newVehicle, fuelType: e.target.value as any })}
                        className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none text-slate-600"
                      >
                        <option value="gasoline">가솔린 (휘발유)</option>
                        <option value="diesel">디젤 (경유)</option>
                        <option value="hybrid">하이브리드</option>
                        <option value="electric">전기</option>
                        <option value="lpg">LPG</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-500">최초 주행거리 (km) *</label>
                      <input 
                        type="number" 
                        value={newVehicle.initialMileage === 0 ? '' : newVehicle.initialMileage}
                        onChange={e => setNewVehicle({ ...newVehicle, initialMileage: Number(e.target.value) })}
                        className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-500">년식 (제조년도)</label>
                      <input 
                        type="text" 
                        placeholder="예: 2024년식" 
                        value={newVehicle.modelYear}
                        onChange={e => setNewVehicle({ ...newVehicle, modelYear: e.target.value })}
                        className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-500">색상</label>
                      <input 
                        type="text" 
                        placeholder="예: 블랙 / 화이트" 
                        value={newVehicle.color}
                        onChange={e => setNewVehicle({ ...newVehicle, color: e.target.value })}
                        className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-500">담당/전담 운전자</label>
                      <input 
                        type="text" 
                        value={newVehicle.owner}
                        onChange={e => setNewVehicle({ ...newVehicle, owner: e.target.value })}
                        className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-500">구입/렌트 계약일</label>
                      <input 
                        type="date" 
                        value={newVehicle.purchaseDate}
                        onChange={e => setNewVehicle({ ...newVehicle, purchaseDate: e.target.value })}
                        className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none text-slate-600"
                      />
                    </div>
                  </div>
                </div>

                {/* 세션 2: 임차 정보 */}
                <div className="space-y-3 pt-2 border-t border-slate-200">
                  <h4 className="text-xs font-semibold text-indigo-400 flex items-center gap-1">
                    <span>•</span> 임차 정보 및 금융 성격
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-500">임차 구분</label>
                      <select 
                        value={newVehicle.rentalType}
                        onChange={e => setNewVehicle({ ...newVehicle, rentalType: e.target.value as any })}
                        className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none text-slate-600"
                      >
                        <option value="own">자가 (소유 자산)</option>
                        <option value="long_rent">장기렌트</option>
                        <option value="lease">운용리스 / 금융리스</option>
                        <option value="short_rent">단기렌트</option>
                        <option value="short_lease">단기리스</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-500">월 임차료 (원화 금액)</label>
                      <input 
                        type="text" 
                        inputMode="numeric"
                        placeholder="예: 850,000" 
                        value={newVehicle.rentalFee === 0 ? '' : formatCurrencyInput(newVehicle.rentalFee)}
                        onChange={e => setNewVehicle({ ...newVehicle, rentalFee: parseCurrencyInput(e.target.value) })}
                        className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* 세션 3: 보험 계약 및 만기 정보 */}
                <div className="space-y-3 pt-2 border-t border-slate-200">
                  <h4 className="text-xs font-semibold text-indigo-400 flex items-center gap-1">
                    <span>•</span> 가입 법인 보험 정보
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-500">보험사명</label>
                      <input 
                        type="text" 
                        placeholder="예: 삼성화재, 현대해상 등" 
                        value={newVehicle.insuranceCompany}
                        onChange={e => setNewVehicle({ ...newVehicle, insuranceCompany: e.target.value })}
                        className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-500">보험 가입일자</label>
                      <input 
                        type="date" 
                        value={newVehicle.insuranceStartDate}
                        onChange={e => setNewVehicle({ ...newVehicle, insuranceStartDate: e.target.value })}
                        className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none text-slate-600"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-500">보험 만기일자</label>
                      <input 
                        type="date" 
                        value={newVehicle.insuranceEndDate}
                        onChange={e => setNewVehicle({ ...newVehicle, insuranceEndDate: e.target.value })}
                        className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none text-slate-600"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-500">보험 담당자명</label>
                      <input 
                        type="text" 
                        placeholder="예: 홍길동 대리" 
                        value={newVehicle.insuranceAgent}
                        onChange={e => setNewVehicle({ ...newVehicle, insuranceAgent: e.target.value })}
                        className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <label className="text-xs text-slate-500">보험 담당자 연락처</label>
                      <input 
                        type="text" 
                        placeholder="예: 010-1234-5678" 
                        value={newVehicle.insuranceContact}
                        onChange={e => setNewVehicle({ ...newVehicle, insuranceContact: e.target.value })}
                        className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-500">운행 허용 상태</label>
                      <select 
                        value={newVehicle.status}
                        onChange={e => setNewVehicle({ ...newVehicle, status: e.target.value as any })}
                        className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none text-slate-600"
                      >
                        <option value="active">운행 가능</option>
                        <option value="maintenance">정비 수리중</option>
                        <option value="retired">운행 중단</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* 비콘 ID 정보 */}
                <div className="space-y-3 pt-2 border-t border-slate-200">
                  <h4 className="text-xs font-semibold text-indigo-400 flex items-center gap-1">
                    <span>•</span> 비콘 ID 단말기 정보
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="space-y-1.5 sm:col-span-2">
                      <label className="text-xs text-slate-500">비콘 ID (자동 추적 센서 고유번호)</label>
                      <input 
                        type="text" 
                        placeholder="예: BCON-9876-XYZ" 
                        value={newVehicle.beaconId}
                        onChange={e => setNewVehicle({ ...newVehicle, beaconId: e.target.value })}
                        className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* 자동차 등록증 첨부 */}
                <div className="space-y-3 pt-2 border-t border-slate-200">
                  <h4 className="text-xs font-semibold text-indigo-400 flex items-center gap-1">
                    <span>•</span> 자동차 등록증 첨부
                  </h4>
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="text-left">
                      <p className="text-xs font-bold text-slate-700">자동차 등록증 업로드 (이미지 및 PDF 지원)</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">이미지 및 PDF 파일 모두 업로드 및 전산 증빙 뷰어로 원본 보기가 가능합니다.</p>
                    </div>
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                      <input 
                        type="file" 
                        accept="image/*,application/pdf"
                        id="reg-doc-upload-tab"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                              setNewVehicle(prev => ({ ...prev, registrationDocumentUrl: reader.result as string }));
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                      <label 
                        htmlFor="reg-doc-upload-tab"
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200 hover:border-slate-600 rounded-lg text-xs font-semibold cursor-pointer transition-all whitespace-nowrap"
                      >
                        파일 찾아보기
                      </label>
                      {newVehicle.registrationDocumentUrl ? (
                        <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> 등록 완료!
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400">선택된 파일 없음</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 버튼 대기열 */}
                <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-200">
                  <button 
                    type="button"
                    onClick={() => setShowVehicleForm(false)}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold text-xs py-2 px-4 rounded-lg transition-all"
                  >
                    취소
                  </button>
                  <button 
                    type="submit"
                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs py-2 px-5 rounded-lg transition-all"
                  >
                    신규 차량 자산 등록 완료
                  </button>
                </div>
              </form>
            </div>
          )}

          {vehicles.length === 0 ? (
            <div className="bg-slate-100 border border-slate-200 rounded-2xl py-12 text-center text-slate-500 text-xs">
              등록된 차량이 없습니다. 상단 '차량 추가'를 통해 법인 차량을 먼저 기재해 주세요.
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-[11px] text-indigo-400 font-medium pb-1">
                <span className="animate-pulse">◀ Swipe / Scroll 좌우 스크롤 ▶</span>
                <span className="text-slate-400">등록된 차량 카드를 좌우로 밀어서 편하게 넘겨볼 수 있습니다 (총 {vehicles.length}대)</span>
              </div>
              <div className="flex overflow-x-auto gap-4 pb-4 snap-x snap-mandatory scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
                {vehicles
                  .filter(v => {
                    const query = vehicleSearch.toLowerCase();
                    return v.modelName.toLowerCase().includes(query) || v.plateNumber.includes(query) || v.owner.includes(query);
                  })
                  .map(v => {
                    const carLogs = drivingLogs.filter(log => log.vehicleId === v.id);
                    const totalCarDistance = carLogs.reduce((sum, log) => sum + log.distance, 0);
                    const totalCarExpense = expenses.filter(e => e.vehicleId === v.id).reduce((sum, e) => sum + e.amount, 0);

                    return (
                      <div key={v.id} className="w-[320px] sm:w-[360px] shrink-0 snap-start bg-white border border-slate-200 rounded-2xl p-5 hover:border-slate-200 transition-all flex flex-col justify-between">
                        <div className="space-y-4">
                          {/* Top Header Row with Title, Plate Number and action icons */}
                          <div className="flex justify-between items-start">
                            <div>
                              <h3 className="text-base font-bold text-slate-800">{v.modelName}</h3>
                              <p className="text-xs text-slate-500 font-mono mt-0.5">{v.plateNumber}</p>
                            </div>
                            <div className="flex items-center gap-1">
                              <button 
                                onClick={() => startEditVehicle(v)}
                                className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-slate-100 rounded-lg transition-all"
                                title="차량 정보 수정 (임차/보험 정보 포함)"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button 
                                onClick={() => handleDeleteVehicle(v.id)}
                                className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-100 rounded-lg transition-all"
                                title="차량 대장 삭제"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Line-based detail list mimicking the first image */}
                          <div className="space-y-1 text-xs text-slate-500 pt-1">
                            <p className="flex items-center gap-1.5">
                              <span className="text-slate-400">·</span>
                              <span>{v.modelName} ({v.modelYear || '연식 미지정'}) · {v.color || '색상 미지정'}</span>
                            </p>
                            <p className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-slate-400">·</span>
                              <span>
                                보험: <strong className="text-slate-600 font-medium">{v.insuranceCompany || '미가입'}</strong>
                                {v.insuranceEndDate && (() => {
                                  try {
                                    const today = new Date();
                                    today.setHours(0, 0, 0, 0);
                                    const cleanDateStr = v.insuranceEndDate.replace(/\./g, '-');
                                    const endDate = new Date(cleanDateStr);
                                    endDate.setHours(0, 0, 0, 0);
                                    if (isNaN(endDate.getTime())) return <span className="text-slate-400"> · 만기 {v.insuranceEndDate}</span>;
                                    const daysLeft = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                                    if (daysLeft < 0) {
                                      return (
                                        <span className="ml-1.5 px-1.5 py-0.5 text-[10px] bg-rose-50 text-rose-700 border border-rose-500/30 rounded font-semibold inline-block">
                                          만기 도과 (경과: {Math.abs(daysLeft)}일)
                                        </span>
                                      );
                                    } else if (daysLeft <= 30) {
                                      return (
                                        <span className="ml-1.5 px-1.5 py-0.5 text-[10px] bg-amber-50 text-amber-700 border border-amber-500/30 rounded font-semibold inline-block">
                                          만기 임박 ({daysLeft}일 남음)
                                        </span>
                                      );
                                    } else {
                                      return <span className="text-slate-400"> · 만기 {v.insuranceEndDate} ({daysLeft}일 남음)</span>;
                                    }
                                  } catch (_) {
                                    return <span className="text-slate-400"> · 만기 {v.insuranceEndDate}</span>;
                                  }
                                })()}
                              </span>
                            </p>
                            <p className="flex items-center gap-1.5">
                              <span className="text-slate-400">·</span>
                              <span>비콘 ID: <strong className="text-slate-600 font-medium">{v.beaconId || '미등록'}</strong></span>
                            </p>
                            <p className="flex items-center gap-1.5">
                              <span className="text-slate-400">·</span>
                              <span>담당자: <strong className="text-slate-600 font-medium">{v.owner}</strong> {v.insuranceContact ? `· ${v.insuranceContact}` : ''}</span>
                            </p>
                            <p className="flex items-center gap-1.5">
                              <span className="text-slate-400">·</span>
                              <span>임차: <strong className="text-slate-600 font-medium">{getRentalTypeKo(v.rentalType)}</strong> {v.rentalFee && v.rentalFee > 0 ? `· ${formatWon(v.rentalFee)}원/월` : ''}</span>
                            </p>
                          </div>

                          {/* Divider line before Registration Document */}
                          <div className="border-t border-slate-200 pt-3.5 space-y-1.5">
                            <span className="text-[11px] font-semibold text-slate-400 block">자동차 등록증</span>
                            <div className="flex items-center justify-between bg-slate-50 border border-slate-200 p-2.5 rounded-xl">
                              <div className="flex items-center gap-2">
                                <FileText className="w-4 h-4 text-indigo-400" />
                                <span className="text-xs text-slate-600 font-medium">
                                  {v.registrationDocumentUrl ? '등록증 업로드됨' : '등록증 미등록'}
                                </span>
                              </div>
                              <div className="flex items-center gap-1">
                                {v.registrationDocumentUrl && (
                                  <button 
                                    onClick={() => setViewDocUrl(v.registrationDocumentUrl || null)}
                                    className="p-1.5 text-slate-500 hover:text-indigo-400 hover:bg-slate-100 rounded-lg transition-all"
                                    title="등록증 사본 보기"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                <button 
                                  onClick={() => document.getElementById(`file-upload-card-${v.id}`)?.click()}
                                  className="p-1.5 text-slate-500 hover:text-indigo-400 hover:bg-slate-100 rounded-lg transition-all"
                                  title={v.registrationDocumentUrl ? '등록증 재업로드' : '등록증 업로드'}
                                >
                                  <Upload className="w-3.5 h-3.5" />
                                </button>
                                {v.registrationDocumentUrl && (
                                  <button 
                                    onClick={() => handleRemoveDocument(v.id)}
                                    className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-slate-100 rounded-lg transition-all"
                                    title="등록증 삭제"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                {/* Hidden Input file */}
                                <input 
                                  id={`file-upload-card-${v.id}`}
                                  type="file"
                                  accept="image/*,application/pdf"
                                  className="hidden"
                                  onChange={(e) => handleUploadDocChange(v.id, e)}
                                />
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* 상세 통계 보기 > button aligned at bottom */}
                        <div className="mt-4 pt-3 border-t border-slate-200/50">
                          <button 
                            onClick={() => setSelectedStatsVehicle(v)}
                            className="w-full text-left text-xs font-bold text-slate-500 hover:text-indigo-400 transition-all flex items-center justify-between group"
                          >
                            <span>상세 통계 보기</span>
                            <span className="group-hover:translate-x-1 transition-transform">&gt;</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. 운행기록 (Driving Logs Tab) */}
      {activeSubTab === 'driving' && (
        <div className="space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => {
                  if (vehicles.length === 0) {
                    alert('차량을 먼저 등록하세요.');
                    return;
                  }
                  setShowDrivingForm(!showDrivingForm);
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs text-white transition-all font-semibold shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>운행 일지 작성</span>
              </button>

              {/* 기간 필터 버튼 */}
              <div className="flex flex-wrap items-center gap-1 bg-white p-1 rounded-xl border border-slate-200">
                {(['all', 'today', 'week', 'month', 'year', 'custom'] as const).map(p => {
                  const label = p === 'all' ? '전체' : p === 'today' ? '오늘' : p === 'week' ? '이번주' : p === 'month' ? '이번달' : p === 'year' ? '올해' : '직접 선택';
                  return (
                    <button
                      key={p}
                      onClick={() => setDrivingPeriod(p)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        drivingPeriod === p 
                          ? 'bg-indigo-600 text-white shadow-sm' 
                          : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {drivingPeriod === 'custom' && (
                <div className="flex items-center gap-2 bg-white p-1.5 border border-slate-200 rounded-xl">
                  <input 
                    type="date" 
                    value={drivingCustomStart}
                    onChange={e => setDrivingCustomStart(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-lg p-1 text-xs text-slate-600 focus:outline-none focus:border-indigo-500"
                  />
                  <span className="text-slate-400 text-xs">~</span>
                  <input 
                    type="date" 
                    value={drivingCustomEnd}
                    onChange={e => setDrivingCustomEnd(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-lg p-1 text-xs text-slate-600 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              )}

              <select 
                value={selectedVehicleFilter}
                onChange={e => setSelectedVehicleFilter(e.target.value)}
                className="bg-white text-xs text-slate-600 rounded-xl border border-slate-200 p-2 focus:outline-none focus:border-indigo-500"
              >
                <option value="all">모든 차량 운행</option>
                {vehicles.map(v => (
                  <option key={v.id} value={v.id}>{v.modelName} [{v.plateNumber}]</option>
                ))}
              </select>
            </div>
          </div>

          {/* 2. 운행일지 신규 작성 폼 */}
          {showDrivingForm && (() => {
            // 이전에 등록된 출발지 및 목적지 고유 목록 추출 (주소 정보 매칭 목적)
            const uniqueStarts = Array.from(new Map<string, DrivingLog>(drivingLogs.filter((l): l is DrivingLog & { startPlace: string } => !!l.startPlace).map(l => [l.startPlace, l])).values());
            const uniqueEnds = Array.from(new Map<string, DrivingLog>(drivingLogs.filter((l): l is DrivingLog & { endPlace: string } => !!l.endPlace).map(l => [l.endPlace, l])).values());

            return (
              <div className="p-5 bg-white border border-slate-200 rounded-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-indigo-400" />
                    <span>운행기록 신규 작성</span>
                  </h3>
                  <button onClick={() => setShowDrivingForm(false)} className="text-xs text-slate-400 hover:text-slate-600">닫기</button>
                </div>
                <form onSubmit={handleAddDriving} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="col-span-1 sm:col-span-2 lg:col-span-4 space-y-2">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setReceiptCameraTarget('driving')}
                        disabled={isScanningDrivingReceipt}
                        className="flex-1 flex items-center justify-center gap-1.5 border border-dashed border-slate-200 rounded-xl py-2.5 hover:border-emerald-500 text-slate-400 hover:text-emerald-400 text-xs font-semibold transition-colors disabled:opacity-50"
                      >
                        <Camera className="w-4 h-4" />
                        <span>
                          {isScanningDrivingReceipt
                            ? '영수증 스캔 중...'
                            : drivingReceipts.length > 0
                              ? `영수증 추가로 촬영 (지금 ${drivingReceipts.length}건 담김)`
                              : '통행료/주차비/식대 등 영수증 촬영 (비용관리에 자동 연동 등록, 여러 장 가능)'}
                        </span>
                      </button>
                    </div>

                    {/* [수정] 영수증이 여러 개(주차료+식대 등)일 수 있어서, 하나씩 카드 형태로 나열한다.
                    항목마다 사진/분류/상호명/금액/결제수단을 따로 수정하고 개별 삭제도 할 수 있다. */}
                    {drivingReceipts.length > 0 && (
                      <div className="space-y-2">
                        {drivingReceipts.map((receipt, idx) => (
                          <div key={receipt.tempId} className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center gap-2">
                            <span className="text-[10px] font-bold text-slate-400 shrink-0 w-4">{idx + 1}</span>
                            <img
                              src={receipt.receiptImage}
                              alt="영수증"
                              onClick={() => setEnlargedReceiptUrl(receipt.receiptImage)}
                              className="w-12 h-12 rounded-lg object-cover border border-slate-200 shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                            />
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 flex-1 min-w-0">
                              <select
                                value={receipt.category}
                                onChange={(e) => setDrivingReceipts((prev) => prev.map((r) => r.tempId === receipt.tempId ? { ...r, category: e.target.value as VehicleExpense['category'] } : r))}
                                className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700"
                              >
                                <option value="toll">통행료</option>
                                <option value="parking">주차비</option>
                                <option value="fuel">주유비</option>
                                <option value="meal">식대</option>
                                <option value="beverage">음료</option>
                                <option value="custom">직접 입력</option>
                              </select>
                              <input
                                type="text"
                                value={receipt.merchantName}
                                onChange={(e) => setDrivingReceipts((prev) => prev.map((r) => r.tempId === receipt.tempId ? { ...r, merchantName: e.target.value } : r))}
                                placeholder="상호명"
                                className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 placeholder:text-slate-400"
                              />
                              <input
                                type="text"
                                inputMode="numeric"
                                value={receipt.amount ? formatCurrencyInput(receipt.amount) : ''}
                                onChange={(e) => setDrivingReceipts((prev) => prev.map((r) => r.tempId === receipt.tempId ? { ...r, amount: parseCurrencyInput(e.target.value) } : r))}
                                placeholder="금액 (원)"
                                className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 font-mono"
                              />
                              <select
                                value={receipt.payMethod}
                                onChange={(e) => setDrivingReceipts((prev) => prev.map((r) => r.tempId === receipt.tempId ? { ...r, payMethod: e.target.value as NonNullable<VehicleExpense['payMethod']> } : r))}
                                className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700"
                              >
                                <option value="company_card">법인카드</option>
                                <option value="personal_card">개인카드</option>
                                <option value="cash">현금</option>
                              </select>
                            </div>
                            <button
                              type="button"
                              onClick={() => setDrivingReceipts((prev) => prev.filter((r) => r.tempId !== receipt.tempId))}
                              title="이 영수증 제거"
                              className="text-rose-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 shrink-0"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                        <p className="text-[10px] text-slate-400 px-1">
                          영수증 {drivingReceipts.length}건 · 총 {formatCurrencyInput(drivingReceipts.reduce((s, r) => s + (Number(r.amount) || 0), 0))}원 · 운행기록 저장 시 비용관리에 각각 등록됩니다.
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-500">대상 차량 *</label>
                    <select 
                      value={newDriving.vehicleId}
                      onChange={e => {
                        const vehId = e.target.value;
                        const targetVh = vehicles.find(v => v.id === vehId);
                        
                        // 기등록 주행 기록 중 가장 최신의 도착 계기판(endMileage) 불러오기
                        // [수정] 예전엔 정렬 없이 그냥 배열의 첫 번째 항목을 썼는데, 이건
                        // "등록한 순서"일 뿐이라 "실제로 가장 많이 주행한(=가장 최근) 기록"과
                        // 다를 수 있었다(예: 지난주 운행을 오늘 뒤늦게 입력한 경우). 도착
                        // 거리가 가장 큰 것을 실제 최신 기록으로 보고 정렬해서 찾는다.
                        const vehLogs = drivingLogs
                          .filter(log => log.vehicleId === vehId)
                          .sort((a, b) => (b.endMileage || 0) - (a.endMileage || 0));
                        let recommendedStart = targetVh ? targetVh.currentMileage : 0;
                        // [추가] 계기판뿐 아니라, 직전 운행의 "도착지/도착지 주소"도 이번
                        // 운행의 "출발지/출발지 주소"로 그대로 가져온다 — 방금 도착한 곳에서
                        // 다음 운행이 시작되는 게 자연스러운 흐름이라, 매번 같은 곳을 다시
                        // 입력하지 않아도 되게 한다(물론 실제와 다르면 그대로 고쳐 쓰면 된다).
                        let recommendedStartPlace = '';
                        let recommendedStartAddress = '';
                        if (vehLogs.length > 0) {
                          recommendedStart = vehLogs[0].endMileage;
                          recommendedStartPlace = vehLogs[0].endPlace || '';
                          recommendedStartAddress = vehLogs[0].endAddress || '';
                        }

                        setNewDriving({ 
                          ...newDriving, 
                          vehicleId: vehId,
                          startMileage: recommendedStart,
                          endMileage: recommendedStart,
                          startPlace: recommendedStartPlace,
                          startAddress: recommendedStartAddress
                        });
                      }}
                      className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none text-slate-600"
                    >
                      <option value="">선택하세요...</option>
                      {vehicles.map(v => (
                        <option key={v.id} value={v.id}>{v.modelName} [{v.plateNumber}]</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-500">운전자명 *</label>
                    <input 
                      type="text" 
                      value={newDriving.driverName}
                      onChange={e => setNewDriving({ ...newDriving, driverName: e.target.value })}
                      onBlur={e => fillDrivingDepartmentForDriver(e.target.value)}
                      className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-500">부서명 <span className="text-[10px] text-indigo-500 font-normal">(마지막에 쓴 값 자동 입력됨)</span></label>
                    <input 
                      type="text" 
                      placeholder="예: 영업본부, 개발팀"
                      value={newDriving.department || ''}
                      onChange={e => setNewDriving({ ...newDriving, department: e.target.value })}
                      className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-500">연동 프로젝트</label>
                    <select 
                      value={newDriving.projectName || ''}
                      onChange={e => setNewDriving({ ...newDriving, projectName: e.target.value })}
                      className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none text-slate-600"
                    >
                      <option value="">프로젝트 연동 안함 (없음)</option>
                      {projects.map(p => (
                        <option key={p.id} value={p.name}>{p.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-500">운행 일자</label>
                    <input 
                      type="date" 
                      value={newDriving.date}
                      onChange={e => setNewDriving({ ...newDriving, date: e.target.value })}
                      className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none text-slate-600"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-500">운행 목적 대분류</label>
                    <select
                      value={['출퇴근', '고객사 미팅', '일반 업무', '개인 용도'].includes(newDriving.purpose) ? newDriving.purpose : '직접 입력'}
                      onChange={e => {
                        const val = e.target.value;
                        if (val === '직접 입력') {
                          setNewDriving({ ...newDriving, purpose: '' });
                        } else {
                          setNewDriving({ ...newDriving, purpose: val });
                        }
                      }}
                      className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none text-slate-600"
                    >
                      <option value="출퇴근">출퇴근</option>
                      <option value="고객사 미팅">고객사 미팅</option>
                      <option value="일반 업무">일반 업무</option>
                      <option value="개인 용도">개인 용도</option>
                      <option value="직접 입력">직접 입력 (상세 입력)</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-500 font-semibold text-indigo-400">운행 목적 상세 기술 *</label>
                    <input 
                      type="text" 
                      placeholder="예: 출퇴근, 강남구 프로젝트 대면 미팅 등" 
                      value={newDriving.purpose}
                      onChange={e => setNewDriving({ ...newDriving, purpose: e.target.value })}
                      className="w-full bg-slate-50 text-xs border border-indigo-900/40 rounded-lg p-2 focus:border-indigo-500 focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-500">출발 전 계기판 (km) *</label>
                    <input 
                      type="number" 
                      value={newDriving.startMileage === 0 ? '' : newDriving.startMileage}
                      onChange={e => setNewDriving({ ...newDriving, startMileage: Number(e.target.value) })}
                      className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-500">도착 후 계기판 (km) *</label>
                    <input 
                      type="number" 
                      value={newDriving.endMileage === 0 ? '' : newDriving.endMileage}
                      onChange={e => setNewDriving({ ...newDriving, endMileage: Number(e.target.value) })}
                      className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none font-mono"
                    />
                  </div>

                  {/* 출발지 상호명 및 주소 추가 */}
                  <div className="space-y-1.5 relative">
                    <label className="text-xs text-slate-500">출발지 상호명</label>
                    <input 
                      type="text" 
                      placeholder="예: 본사, 판교테크노밸리"
                      value={newDriving.startPlace}
                      onChange={e => setNewDriving({ ...newDriving, startPlace: e.target.value })}
                      className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none"
                    />
                    {uniqueStarts.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1 max-h-[48px] overflow-y-auto">
                        {uniqueStarts.slice(0, 3).map(u => (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => {
                              setNewDriving({
                                ...newDriving,
                                startPlace: u.startPlace || '',
                                startAddress: u.startAddress || ''
                              });
                            }}
                            className="bg-slate-50 text-[10px] text-slate-500 px-1.5 py-0.5 rounded border border-slate-200 hover:text-slate-700"
                          >
                            +{u.startPlace}
                          </button>
                        ))}
                      </div>
                    )}
                    {/* 명함(주소록)에서 회사명 일치하는 곳 찾아 자동 채우기 */}
                    {newDriving.startPlace.trim().length > 0 && (() => {
                      const matches = contacts.filter(c => c.company && c.address && c.company.toLowerCase().includes(newDriving.startPlace.trim().toLowerCase())).slice(0, 3);
                      // [수정] 명함에 주소가 2개(본사/지사 등) 등록된 경우, 하나만 보이던 걸 둘 다 선택할 수 있게 함
                      const options = matches.flatMap(c => [
                        { key: `${c.id}-1`, label: c.address2 ? `${c.company} (주소1)` : c.company, address: c.address! },
                        ...(c.address2 ? [{ key: `${c.id}-2`, label: `${c.company} (주소2)`, address: c.address2 }] : [])
                      ]);
                      return options.length > 0 ? (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {options.map(opt => (
                            <button
                              key={opt.key}
                              type="button"
                              onClick={() => setNewDriving({ ...newDriving, startPlace: opt.label.replace(/\s*\(주소[12]\)$/, ''), startAddress: opt.address })}
                              className="bg-indigo-50 text-[10px] text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-200 hover:bg-indigo-600 hover:text-white hover:border-indigo-500"
                              title={opt.address}
                            >
                              🏢 {opt.label} 주소로 채우기
                            </button>
                          ))}
                        </div>
                      ) : null;
                    })()}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-500">출발지 주소 추가</label>
                    <input 
                      type="text" 
                      placeholder="예: 서울시 강남구 테헤란로 152"
                      value={newDriving.startAddress || ''}
                      onChange={e => setNewDriving({ ...newDriving, startAddress: e.target.value })}
                      className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none"
                    />
                  </div>

                  {/* 목적지 상호명 및 주소 추가 */}
                  <div className="space-y-1.5 relative">
                    <label className="text-xs text-slate-500 font-semibold text-indigo-400 flex items-center justify-between">
                      <span>목적지 상호명 *</span>
                      {/* [수정] 예전엔 "도착 후 계기판" 옆에 있었는데, 이 버튼이 실제로 참고하는
                      값(출발지/목적지 주소)과 더 가까운 "목적지 상호명" 옆으로 옮겼다. 직선거리
                      기반 근사치라 실제 계기판과 다를 수 있으니, 계산 후에도 그 칸을 바로 직접
                      수정할 수 있다(값이 잠기지 않음). */}
                      <button
                        type="button"
                        onClick={handleEstimateDistance}
                        disabled={isEstimatingDistance}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-semibold disabled:opacity-50"
                      >
                        {isEstimatingDistance ? '계산 중...' : '📍 예상 거리 자동계산'}
                      </button>
                    </label>
                    <input 
                      type="text" 
                      placeholder="예: 강남파이낸스센터"
                      value={newDriving.endPlace}
                      onChange={e => setNewDriving({ ...newDriving, endPlace: e.target.value })}
                      className="w-full bg-slate-50 text-xs border border-indigo-900/40 rounded-lg p-2 focus:border-indigo-500 focus:outline-none"
                    />
                    <p className="text-[10px] text-slate-400">자동계산은 직선거리 기반 예상치입니다. 계산 후 "도착 후 계기판" 값을 실제와 다르면 직접 고쳐주세요.</p>
                    {uniqueEnds.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1 max-h-[48px] overflow-y-auto">
                        {uniqueEnds.slice(0, 3).map(u => (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => {
                              setNewDriving({
                                ...newDriving,
                                endPlace: u.endPlace || '',
                                endAddress: u.endAddress || ''
                              });
                            }}
                            className="bg-slate-50 text-[10px] text-slate-500 px-1.5 py-0.5 rounded border border-slate-200 hover:text-slate-700"
                          >
                            +{u.endPlace}
                          </button>
                        ))}
                      </div>
                    )}
                    {/* 명함(주소록)에서 회사명 일치하는 곳 찾아 자동 채우기 */}
                    {newDriving.endPlace.trim().length > 0 && (() => {
                      const matches = contacts.filter(c => c.company && c.address && c.company.toLowerCase().includes(newDriving.endPlace.trim().toLowerCase())).slice(0, 3);
                      const options = matches.flatMap(c => [
                        { key: `${c.id}-1`, label: c.address2 ? `${c.company} (주소1)` : c.company, address: c.address! },
                        ...(c.address2 ? [{ key: `${c.id}-2`, label: `${c.company} (주소2)`, address: c.address2 }] : [])
                      ]);
                      return options.length > 0 ? (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {options.map(opt => (
                            <button
                              key={opt.key}
                              type="button"
                              onClick={() => setNewDriving({ ...newDriving, endPlace: opt.label.replace(/\s*\(주소[12]\)$/, ''), endAddress: opt.address })}
                              className="bg-indigo-50 text-[10px] text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-200 hover:bg-indigo-600 hover:text-white hover:border-indigo-500"
                              title={opt.address}
                            >
                              🏢 {opt.label} 주소로 채우기
                            </button>
                          ))}
                        </div>
                      ) : null;
                    })()}
                    {/* [추가] 명함에 없는 곳(처음 방문하는 거래처 등)은 카카오 실시간 장소
                    검색으로 찾아서 쓸 수 있게 한다. */}
                    {newDriving.endPlace.trim().length > 0 && (
                      <button
                        type="button"
                        onClick={() => handleSearchPlace(newDriving.endPlace)}
                        disabled={isSearchingPlace}
                        className="mt-1 text-[10px] px-2 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 font-semibold disabled:opacity-50"
                      >
                        {isSearchingPlace ? '검색 중...' : `🔍 "${newDriving.endPlace}" 카카오에서 실시간 검색`}
                      </button>
                    )}
                    {placeSearchResults.length > 0 && (
                      <div className="mt-1.5 bg-white border border-amber-200 rounded-xl overflow-hidden shadow-lg">
                        {placeSearchResults.map((p, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              setNewDriving({ ...newDriving, endPlace: p.name, endAddress: p.address });
                              setPlaceSearchResults([]);
                            }}
                            className="w-full text-left px-3 py-2 text-xs hover:bg-amber-50 border-b border-slate-100 last:border-0"
                          >
                            <span className="font-semibold text-slate-700">{p.name}</span>
                            <span className="block text-[10px] text-slate-400 mt-0.5">{p.address}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-500">목적지 주소 추가</label>
                    <input 
                      type="text" 
                      placeholder="예: 경기도 성남시 분당구 삼평동 624"
                      value={newDriving.endAddress || ''}
                      onChange={e => setNewDriving({ ...newDriving, endAddress: e.target.value })}
                      className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none"
                    />
                  </div>

                  {/* 메모란 */}
                  <div className="sm:col-span-2 lg:col-span-4 space-y-1.5">
                    <label className="text-xs text-slate-500">운행 관련 상세 특이사항 및 메모</label>
                    <textarea 
                      rows={2}
                      placeholder="통행 제한 우회, 주차권 분실 등 운행 중 특이사항 기록"
                      value={newDriving.memo || ''}
                      onChange={e => setNewDriving({ ...newDriving, memo: e.target.value })}
                      className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none text-slate-600 resize-none"
                    />
                  </div>

                  {/* 연관 거래처 담당자 연동 */}
                  <div className="sm:col-span-2 lg:col-span-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-500 block font-semibold text-indigo-400">연관 거래처 담당자 선택</label>
                      <ContactSearchSelect
                        contacts={contacts}
                        value={newDriving.contactId || ''}
                        onChange={(id) => setNewDriving({ ...newDriving, contactId: id })}
                      />
                    </div>

                    <div className="flex items-end pb-2.5">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={useDirectContact}
                          onChange={(e) => setUseDirectContact(e.target.checked)}
                          className="rounded border-slate-200 bg-white text-indigo-500 focus:ring-0 focus:ring-offset-0"
                        />
                        <span className="text-xs text-slate-600 font-semibold">새로운 담당자 직접 입력하여 연결</span>
                      </label>
                    </div>
                  </div>

                  {useDirectContact && (
                    <div className="sm:col-span-2 lg:col-span-4 border border-slate-200 bg-slate-50 rounded-xl p-3.5 space-y-3 animate-fadeIn">
                      <div className="text-xs font-semibold text-indigo-400 border-b border-slate-200 pb-1.5">새 담당자 상세 정보 입력</div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div>
                          <label className="block text-slate-500 text-[10px] font-semibold mb-1">담당자 성함 *</label>
                          <input
                            type="text"
                            value={directContactName}
                            onChange={(e) => setDirectContactName(e.target.value)}
                            placeholder="예: 홍길동"
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-700 outline-none focus:border-indigo-500 text-xs"
                            required={useDirectContact}
                          />
                        </div>
                        <div>
                          <label className="block text-slate-500 text-[10px] font-semibold mb-1">회사/기관명</label>
                          <input
                            type="text"
                            value={directContactCompany}
                            onChange={(e) => setDirectContactCompany(e.target.value)}
                            placeholder="예: 현대건설"
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-700 outline-none focus:border-indigo-500 text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-500 text-[10px] font-semibold mb-1">부서</label>
                          <input
                            type="text"
                            value={directContactDept}
                            onChange={(e) => setDirectContactDept(e.target.value)}
                            placeholder="예: 구매팀"
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-700 outline-none focus:border-indigo-500 text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-500 text-[10px] font-semibold mb-1">직책</label>
                          <input
                            type="text"
                            value={directContactTitle}
                            onChange={(e) => setDirectContactTitle(e.target.value)}
                            placeholder="예: 과장"
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-700 outline-none focus:border-indigo-500 text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-500 text-[10px] font-semibold mb-1">연락처(직장)</label>
                          <input
                            type="text"
                            value={directContactPhoneOffice}
                            onChange={(e) => setDirectContactPhoneOffice(e.target.value)}
                            placeholder="예: 02-1234-5678"
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-700 outline-none focus:border-indigo-500 text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-500 text-[10px] font-semibold mb-1">연락처(핸드폰)</label>
                          <input
                            type="text"
                            value={directContactPhoneMobile}
                            onChange={(e) => setDirectContactPhoneMobile(e.target.value)}
                            placeholder="예: 010-1234-5678"
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-700 outline-none focus:border-indigo-500 text-xs"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-slate-500 text-[10px] font-semibold mb-1">이메일 주소</label>
                          <input
                            type="email"
                            value={directContactEmail}
                            onChange={(e) => setDirectContactEmail(e.target.value)}
                            placeholder="예: buyer@company.com"
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-700 outline-none focus:border-indigo-500 text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="lg:col-span-4 flex justify-end gap-2 border-t border-slate-200/50 pt-3">
                    <div className="text-xs text-slate-400 self-center mr-auto font-mono">
                      {newDriving.endMileage > newDriving.startMileage ? (
                        <span className="text-indigo-400 font-semibold">예상 계산 거리: {newDriving.endMileage - newDriving.startMileage} km</span>
                      ) : '도착 계기판은 출발 계기판보다 커야 저장이 가능합니다.'}
                    </div>
                    <button 
                      type="button"
                      onClick={() => setShowDrivingForm(false)}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold text-xs py-2 px-4 rounded-lg transition-all"
                    >
                      취소
                    </button>
                    <button 
                      type="submit"
                      className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs py-2 px-5 rounded-lg transition-all"
                    >
                      운행기록 추가 완료
                    </button>
                  </div>
                </form>
              </div>
            );
          })()}

          {(() => {
            const filteredLogs = drivingLogs.filter(log => {
              const matchVeh = selectedVehicleFilter === 'all' || log.vehicleId === selectedVehicleFilter;
              const matchPer = isDateInPeriod(log.date, drivingPeriod, drivingCustomStart, drivingCustomEnd);
              return matchVeh && matchPer;
            })
              // [수정] 예전엔 서버가 등록해준 순서 그대로 보여줬는데, 그러면 "등록한 순서"와
              // "실제 운행한 순서"가 다를 때(예: 며칠 지나서 지난 운행을 입력) 헷갈렸다.
              // 이제는 "도착 거리(누적 km)"가 큰 것부터 보여준다 — 누적 계기판 거리가 클수록
              // 실제로 더 나중에 운행한 기록이라, 이게 곧 진짜 최신순이다.
              .sort((a, b) => (b.endMileage || 0) - (a.endMileage || 0));

            if (filteredLogs.length === 0) {
              return (
                <div className="bg-slate-100 border border-slate-200 rounded-2xl py-12 text-center text-slate-500 text-xs">
                  선택한 필터 조건에 부합하는 주행 일지가 없습니다. 새 운행 기록을 남겨보세요.
                </div>
              );
            }

            return (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
                  <span>총 {filteredLogs.length}건의 운행 기록</span>
                  <span className="flex items-center gap-1 text-indigo-400 font-medium">
                    <span>옆으로 밀어서 보기</span>
                    <span className="animate-pulse">↔</span>
                  </span>
                </div>
                <div className="flex overflow-x-auto gap-4 pb-4 scroll-smooth snap-x snap-mandatory scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
                  {filteredLogs.slice(0, visibleDrivingCount).map(log => (
                    <div 
                      key={log.id}
                      className="flex-none w-[290px] sm:w-[350px] snap-start border border-slate-200 bg-white p-4 rounded-2xl space-y-3 flex flex-col justify-between shadow-sm"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono text-slate-500">{log.date}</span>
                          <span className="text-xs font-semibold text-slate-700">{log.driverName}</span>
                        </div>

                        <div className="space-y-1">
                          <div className="font-semibold text-slate-800">{getVehicleModel(log.vehicleId)}</div>
                          <div className="flex flex-wrap gap-1">
                            {log.department && (
                              <span className="bg-slate-50 text-slate-500 border border-slate-200 text-[9px] px-1.5 py-0.5 rounded font-medium">
                                {log.department}
                              </span>
                            )}
                            {log.projectName && (
                              <span className="bg-indigo-950 text-indigo-600 border border-indigo-900/40 text-[9px] px-1.5 py-0.5 rounded font-medium">
                                {log.projectName}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="border-t border-slate-200 my-2 pt-2 space-y-1.5 text-xs">
                          <div className="space-y-0.5">
                            <span className="text-slate-400 text-[10px]">운행 경로</span>
                            <div className="flex items-center gap-1.5 text-slate-600 font-semibold">
                              <span>{log.startPlace || '출발지'}</span>
                              <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                              <span>{log.endPlace}</span>
                            </div>
                            {(log.startAddress || log.endAddress) && (
                              <p className="text-[10px] text-slate-400 font-mono leading-tight pt-0.5">
                                {log.startAddress || '-'} → {log.endAddress || '-'}
                              </p>
                            )}
                            {/* [수정] 명함 상세보기와 동일하게, 목적지 주소가 있으면 바로 내비게이션 앱으로 연결하는 길찾기 버튼 추가 */}
                            {log.endAddress && (
                              <div className="flex flex-wrap items-center gap-1 pt-1">
                                <span className="text-[9px] text-slate-400 flex items-center gap-0.5 mr-0.5">
                                  <Navigation className="w-2.5 h-2.5 text-blue-400" />
                                  길찾기:
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const enc = encodeURIComponent(log.endAddress!);
                                    window.open(`tmap://search?name=${enc}`, '_blank');
                                    setTimeout(() => {
                                      window.open(`https://search.naver.com/search.naver?query=${enc}+길찾기`, '_blank');
                                    }, 500);
                                  }}
                                  className="text-[9px] px-1.5 py-0.5 bg-amber-50 hover:bg-amber-500/20 text-amber-700 rounded border border-amber-500/20 font-bold"
                                >
                                  티맵
                                </button>
                                <button
                                  type="button"
                                  onClick={() => window.open(`https://map.kakao.com/link/search/${encodeURIComponent(log.endAddress!)}`, '_blank')}
                                  className="text-[9px] px-1.5 py-0.5 bg-yellow-400/10 hover:bg-yellow-400/20 text-yellow-500 rounded border border-yellow-400/20 font-bold"
                                >
                                  카카오
                                </button>
                                <button
                                  type="button"
                                  onClick={() => window.open(`https://map.naver.com/v5/search/${encodeURIComponent(log.endAddress!)}`, '_blank')}
                                  className="text-[9px] px-1.5 py-0.5 bg-emerald-50 hover:bg-emerald-500/20 text-emerald-700 rounded border border-emerald-500/20 font-bold"
                                >
                                  네이버
                                </button>
                                <button
                                  type="button"
                                  onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(log.endAddress!)}`, '_blank')}
                                  className="text-[9px] px-1.5 py-0.5 bg-blue-50 hover:bg-blue-500/20 text-blue-700 rounded border border-blue-500/20 font-bold"
                                >
                                  구글맵
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="flex justify-between text-[11px] border-t border-slate-200/60 pt-1.5 font-mono">
                            <span className="text-slate-400 font-sans">계기판 기록</span>
                            <span className="text-slate-500">
                              {formatWon(log.startMileage)} → {formatWon(log.endMileage)} km
                            </span>
                          </div>

                          <div className="border-t border-slate-200/60 pt-1.5">
                            <span className="text-slate-400 text-[10px] block mb-0.5">운행 목적 및 메모</span>
                            <span className="text-slate-600 block font-medium text-[11px] line-clamp-1">{log.purpose}</span>
                            {log.memo && (
                              <p className="text-[10px] text-slate-400 italic truncate mt-0.5" title={log.memo}>
                                {log.memo}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-200 mt-2">
                        <div className="font-bold text-indigo-400 font-mono text-sm">
                          {log.distance} km 주행
                        </div>
                        <div className="flex items-center gap-1">
                          <button 
                            onClick={() => setEditingDriving(log)}
                            className="p-1.5 text-slate-500 hover:text-indigo-400 hover:bg-slate-100 rounded-lg transition-all"
                            title="운행 기록 수정"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            onClick={() => handleDeleteDriving(log.id)}
                            className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-slate-100 rounded-lg transition-all"
                            title="운행 기록 삭제"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* [수정] 필터 조건에 더 남은 운행기록이 있으면 "더 보기" 버튼으로 이어서 로딩 */}
                  {visibleDrivingCount < filteredLogs.length && (
                    <button
                      type="button"
                      onClick={() => setVisibleDrivingCount((prev) => Math.min(prev + 50, filteredLogs.length))}
                      className="flex-none w-[150px] snap-start border border-dashed border-slate-200 hover:border-indigo-500/50 bg-slate-100 hover:bg-white rounded-2xl flex flex-col items-center justify-center gap-2 text-slate-500 hover:text-indigo-600 transition-all"
                    >
                      <span className="text-2xl">＋</span>
                      <span className="text-xs font-bold">{filteredLogs.length - visibleDrivingCount}건 더 보기</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* 4. 비용관리 (Expenses Tab) */}
      {activeSubTab === 'expenses' && (
        <div className="space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => {
                  if (vehicles.length === 0) {
                    alert('비용을 기입하려면 차량을 먼저 대장에 등록해야 합니다.');
                    return;
                  }
                  setShowExpenseForm(!showExpenseForm);
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs text-white transition-all font-semibold shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>비용 지출 등록</span>
              </button>

              {/* 기간 필터 버튼 */}
              <div className="flex flex-wrap items-center gap-1 bg-white p-1 rounded-xl border border-slate-200">
                {(['all', 'today', 'week', 'month', 'year', 'custom'] as const).map(p => {
                  const label = p === 'all' ? '전체' : p === 'today' ? '오늘' : p === 'week' ? '이번주' : p === 'month' ? '이번달' : p === 'year' ? '올해' : '직접 선택';
                  return (
                    <button
                      key={p}
                      onClick={() => setExpensePeriod(p)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        expensePeriod === p 
                          ? 'bg-indigo-600 text-white shadow-sm' 
                          : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {expensePeriod === 'custom' && (
                <div className="flex items-center gap-2 bg-white p-1.5 border border-slate-200 rounded-xl">
                  <input 
                    type="date" 
                    value={expenseCustomStart}
                    onChange={e => setExpenseCustomStart(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-lg p-1 text-xs text-slate-600 focus:outline-none focus:border-indigo-500"
                  />
                  <span className="text-slate-400 text-xs">~</span>
                  <input 
                    type="date" 
                    value={expenseCustomEnd}
                    onChange={e => setExpenseCustomEnd(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-lg p-1 text-xs text-slate-600 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              )}

              <select 
                value={selectedVehicleFilter}
                onChange={e => setSelectedVehicleFilter(e.target.value)}
                className="bg-white text-xs text-slate-600 rounded-xl border border-slate-200 p-2 focus:outline-none focus:border-indigo-500"
              >
                <option value="all">모든 차량 비용</option>
                {vehicles.map(v => (
                  <option key={v.id} value={v.id}>{v.modelName} [{v.plateNumber}]</option>
                ))}
              </select>

              <select 
                value={expenseCategoryFilter}
                onChange={e => setExpenseCategoryFilter(e.target.value)}
                className="bg-white text-xs text-slate-600 rounded-xl border border-slate-200 p-2 focus:outline-none focus:border-indigo-500"
              >
                <option value="all">모든 비용 분류</option>
                <option value="fuel">주유비</option>
                <option value="toll">통행료</option>
                <option value="parking">주차비</option>
                <option value="maintenance">정비/수리비</option>
                <option value="tax_insurance">세금/보험</option>
                <option value="agency_drive">대리운전비</option>
                <option value="beverage">음료</option>
                <option value="meal">식대</option>
                <option value="supplies">물품 구입</option>
                <option value="custom">직접 입력 분류</option>
                <option value="other">기타</option>
              </select>
            </div>
          </div>

          {showExpenseForm && (
            <div className="p-5 bg-white border border-slate-200 rounded-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                  <Plus className="w-4 h-4 text-indigo-400" />
                  <span>차량 지출 비용 등록</span>
                </h3>
                <button onClick={() => setShowExpenseForm(false)} className="text-xs text-slate-400 hover:text-slate-600">닫기</button>
              </div>
              <form onSubmit={handleAddExpense} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="col-span-1 sm:col-span-2 lg:col-span-4 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setReceiptCameraTarget('expense')}
                    className="flex-1 flex items-center justify-center gap-1.5 border border-dashed border-slate-200 rounded-xl py-2.5 hover:border-emerald-500 text-slate-400 hover:text-emerald-400 text-xs font-semibold transition-colors"
                  >
                    <Camera className="w-4 h-4" />
                    <span>{isScanningExpenseReceipt ? '영수증 스캔 중...' : '영수증 촬영 (자동으로 아래 항목 채움)'}</span>
                  </button>
                  {newExpense.receiptImage && (
                    <img
                      src={newExpense.receiptImage}
                      alt="영수증"
                      onClick={() => setEnlargedReceiptUrl(newExpense.receiptImage)}
                      className="w-12 h-12 rounded-lg object-cover border border-slate-200 shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                    />
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500">대상 차량 *</label>
                  <select 
                    value={newExpense.vehicleId}
                    onChange={e => setNewExpense({ ...newExpense, vehicleId: e.target.value })}
                    className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none text-slate-600"
                    required
                  >
                    <option value="">선택하세요...</option>
                    {vehicles.map(v => (
                      <option key={v.id} value={v.id}>{v.modelName} [{v.plateNumber}]</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500">지출 일자</label>
                  <input 
                    type="date" 
                    value={newExpense.date}
                    onChange={e => setNewExpense({ ...newExpense, date: e.target.value })}
                    className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none text-slate-600"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500">비용 분류 *</label>
                  <select 
                    value={newExpense.category}
                    onChange={e => setNewExpense({ ...newExpense, category: e.target.value as any })}
                    className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none text-slate-600"
                  >
                    <option value="fuel">주유비 (유류대)</option>
                    <option value="toll">통행료 (하이패스)</option>
                    <option value="parking">주차비</option>
                    <option value="maintenance">수리 및 정비비</option>
                    <option value="tax_insurance">세금 및 자동차 보험</option>
                    <option value="designated_drive">대리운전비</option>
                    <option value="beverage">음료</option>
                    <option value="meal">식대</option>
                    <option value="supplies">물품 구입</option>
                    <option value="custom">직접 입력 (커스텀)</option>
                    <option value="other">기타 실비</option>
                  </select>
                </div>

                {newExpense.category === 'custom' && (
                  <div className="space-y-1.5">
                    <label className="text-xs text-indigo-400 font-semibold">비용 분류 직접 입력 *</label>
                    <input 
                      type="text" 
                      placeholder="예: 과태료, 세차비"
                      value={newExpense.categoryCustom || ''}
                      onChange={e => setNewExpense({ ...newExpense, categoryCustom: e.target.value })}
                      className="w-full bg-slate-50 text-xs border border-indigo-900/40 rounded-lg p-2 focus:border-indigo-500 focus:outline-none"
                      required
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500">결제 수단 *</label>
                  <select 
                    value={newExpense.payMethod}
                    onChange={e => setNewExpense({ ...newExpense, payMethod: e.target.value as any })}
                    className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none text-slate-600"
                  >
                    <option value="company_card">법인(회사)카드</option>
                    <option value="personal_card">개인카드</option>
                    <option value="cash">현금</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500">상호명</label>
                  <input 
                    type="text" 
                    placeholder="예: SK네트웍스 만남주유소"
                    value={newExpense.merchantName || ''}
                    onChange={e => setNewExpense({ ...newExpense, merchantName: e.target.value })}
                    className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                {newExpense.category === 'fuel' && (
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-500">주유량 (L)</label>
                    <input 
                      type="number" 
                      placeholder="예: 45"
                      value={newExpense.fuelVolume === 0 ? '' : newExpense.fuelVolume}
                      onChange={e => setNewExpense({ ...newExpense, fuelVolume: Number(e.target.value) })}
                      className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none font-mono"
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500">지출금액 (원) *</label>
                  <input 
                    type="text" 
                    inputMode="numeric"
                    placeholder="지출 원화 금액 입력"
                    value={newExpense.amount === 0 ? '' : formatCurrencyInput(newExpense.amount)}
                    onChange={e => setNewExpense({ ...newExpense, amount: parseCurrencyInput(e.target.value) })}
                    className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none font-mono font-semibold"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500">연동 프로젝트</label>
                  <select 
                    value={newExpense.projectName || ''}
                    onChange={e => setNewExpense({ ...newExpense, projectName: e.target.value })}
                    className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none text-slate-600"
                  >
                    <option value="">프로젝트 연동 안함 (없음)</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.name}>{p.name}</option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2 lg:col-span-4 space-y-1.5">
                  <label className="text-xs text-slate-500">메모 및 상세 지출 내역 기술</label>
                  <input 
                    type="text" 
                    placeholder="지출 사유, 동승자, 특이사항 등 자유 기입"
                    value={newExpense.memo || ''}
                    onChange={e => setNewExpense({ ...newExpense, memo: e.target.value })}
                    className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                {/* 연관 거래처 담당자 연동 */}
                <div className="sm:col-span-2 lg:col-span-4 grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-slate-200 pt-3">
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-500 block font-semibold text-indigo-400">연관 거래처 담당자 선택</label>
                    <ContactSearchSelect
                      contacts={contacts}
                      value={newExpense.contactId || ''}
                      onChange={(id) => setNewExpense({ ...newExpense, contactId: id })}
                    />
                  </div>

                  <div className="flex items-end pb-2.5">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={useDirectContact}
                        onChange={(e) => setUseDirectContact(e.target.checked)}
                        className="rounded border-slate-200 bg-white text-indigo-500 focus:ring-0 focus:ring-offset-0"
                      />
                      <span className="text-xs text-slate-600 font-semibold">새로운 담당자 직접 입력하여 연결</span>
                    </label>
                  </div>
                </div>

                {useDirectContact && (
                  <div className="sm:col-span-2 lg:col-span-4 border border-slate-200 bg-slate-50 rounded-xl p-3.5 space-y-3 animate-fadeIn">
                    <div className="text-xs font-semibold text-indigo-400 border-b border-slate-200 pb-1.5">새 담당자 상세 정보 입력</div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-slate-500 text-[10px] font-semibold mb-1">담당자 성함 *</label>
                        <input
                          type="text"
                          value={directContactName}
                          onChange={(e) => setDirectContactName(e.target.value)}
                          placeholder="예: 홍길동"
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-700 outline-none focus:border-indigo-500 text-xs"
                          required={useDirectContact}
                        />
                      </div>
                      <div>
                        <label className="block text-slate-500 text-[10px] font-semibold mb-1">회사/기관명</label>
                        <input
                          type="text"
                          value={directContactCompany}
                          onChange={(e) => setDirectContactCompany(e.target.value)}
                          placeholder="예: 현대건설"
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-700 outline-none focus:border-indigo-500 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-500 text-[10px] font-semibold mb-1">부서</label>
                        <input
                          type="text"
                          value={directContactDept}
                          onChange={(e) => setDirectContactDept(e.target.value)}
                          placeholder="예: 구매팀"
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-700 outline-none focus:border-indigo-500 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-500 text-[10px] font-semibold mb-1">직책</label>
                        <input
                          type="text"
                          value={directContactTitle}
                          onChange={(e) => setDirectContactTitle(e.target.value)}
                          placeholder="예: 과장"
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-700 outline-none focus:border-indigo-500 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-500 text-[10px] font-semibold mb-1">연락처(직장)</label>
                        <input
                          type="text"
                          value={directContactPhoneOffice}
                          onChange={(e) => setDirectContactPhoneOffice(e.target.value)}
                          placeholder="예: 02-1234-5678"
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-700 outline-none focus:border-indigo-500 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-500 text-[10px] font-semibold mb-1">연락처(핸드폰)</label>
                        <input
                          type="text"
                          value={directContactPhoneMobile}
                          onChange={(e) => setDirectContactPhoneMobile(e.target.value)}
                          placeholder="예: 010-1234-5678"
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-700 outline-none focus:border-indigo-500 text-xs"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-slate-500 text-[10px] font-semibold mb-1">이메일 주소</label>
                        <input
                          type="email"
                          value={directContactEmail}
                          onChange={(e) => setDirectContactEmail(e.target.value)}
                          placeholder="예: buyer@company.com"
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-700 outline-none focus:border-indigo-500 text-xs"
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className="lg:col-span-4 flex justify-end gap-2 border-t border-slate-200/50 pt-3">
                  <button 
                    type="button"
                    onClick={() => setShowExpenseForm(false)}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold text-xs py-2 px-4 rounded-lg transition-all"
                  >
                    취소
                  </button>
                  <button 
                    type="submit"
                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs py-2 px-5 rounded-lg transition-all"
                  >
                    비용 지출 등록 완료
                  </button>
                </div>
              </form>
            </div>
          )}

          {(() => {
            // [수정] 예전엔 서버가 등록해준 순서(=입력한 순서) 그대로 보여줬다. 그래서
            // 8/8 지출을 8/10 지출보다 나중에 입력하면, 실제 지출 날짜는 8/8이 더 과거인데도
            // 화면 맨 앞(가장 눈에 띄는 자리)에 8/8이 뜨는 문제가 있었다. 이제 지출 "날짜"
            // 기준으로 최신 날짜가 먼저 오도록 정렬해서, 언제 입력했는지와 상관없이 항상
            // 8/10 → 8/9 → 8/8 → 8/7 순으로 보이게 한다.
            const filteredExpenses = expenses.filter(e => {
              const passVh = selectedVehicleFilter === 'all' || e.vehicleId === selectedVehicleFilter;
              const passCat = expenseCategoryFilter === 'all' || e.category === expenseCategoryFilter;
              const passPer = isDateInPeriod(e.date, expensePeriod, expenseCustomStart, expenseCustomEnd);
              return passVh && passCat && passPer;
            }).sort((a, b) => {
              const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
              if (dateDiff !== 0) return dateDiff;
              // 같은 날짜끼리는 나중에 입력한 것을 위로
              return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
            });

            if (filteredExpenses.length === 0) {
              return (
                <div className="bg-slate-100 border border-slate-200 rounded-2xl py-12 text-center text-slate-500 text-xs">
                  선택한 조건에 해당하는 차량 비용 지출 내역이 존재하지 않습니다.
                </div>
              );
            }

            return (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
                  <span>총 {filteredExpenses.length}건의 지출 내역</span>
                  <span className="flex items-center gap-1 text-indigo-400 font-medium">
                    <span>옆으로 밀어서 보기</span>
                    <span className="animate-pulse">↔</span>
                  </span>
                </div>
                <div className="flex overflow-x-auto gap-4 pb-4 scroll-smooth snap-x snap-mandatory scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
                  {filteredExpenses.slice(0, visibleExpenseCount).map(e => {
                    let payMethodKo = '법인(회사)카드';
                    if (e.payMethod === 'personal_card') payMethodKo = '개인카드';
                    if (e.payMethod === 'cash') payMethodKo = '현금';

                    const isLinkedToWorkLog = e.id.startsWith('ve-wl-');

                    return (
                      <div 
                        key={e.id}
                        className="flex-none w-[290px] sm:w-[350px] snap-start border border-slate-200 bg-white p-4 rounded-2xl space-y-3 flex flex-col justify-between shadow-sm"
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono text-slate-500 flex items-center gap-1.5">
                              <span>{e.date}</span>
                              {isLinkedToWorkLog && (
                                <span className="px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-500/20 text-[8px] font-extrabold text-emerald-700">
                                  업무일지 연동
                                </span>
                              )}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px] font-bold text-slate-600">
                              {getCategoryKo(e.category, e.categoryCustom)}
                            </span>
                          </div>

                          <div className="space-y-0.5">
                            <div className="font-semibold text-slate-800">{getVehicleModel(e.vehicleId)}</div>
                            {e.projectName && (
                              <span className="text-[10px] text-indigo-400 block font-medium">📂 {e.projectName}</span>
                            )}
                          </div>

                          <div className="border-t border-slate-200 my-2 pt-2 space-y-1 text-xs">
                            <div className="flex justify-between">
                              <span className="text-slate-400">결제 수단</span>
                              <span className="text-slate-600 font-medium">{payMethodKo}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">상호명</span>
                              <span className="text-slate-600 font-semibold">{e.merchantName || '-'}</span>
                            </div>
                            {e.category === 'fuel' && e.fuelVolume && e.fuelVolume > 0 ? (
                              <div className="flex justify-between">
                                <span className="text-slate-400">주유량</span>
                                <span className="text-indigo-400 font-medium font-mono">{e.fuelVolume} L</span>
                              </div>
                            ) : null}
                            {e.memo && (
                              <div className="border-t border-slate-200/60 mt-1.5 pt-1.5 text-slate-500 text-[11px] line-clamp-2" title={e.memo}>
                                {e.memo}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-slate-200 mt-2">
                          <div className="text-right font-bold text-amber-400 font-mono text-base">
                            {formatWon(e.amount)} 원
                          </div>
                          <div className="flex items-center gap-1">
                            {isLinkedToWorkLog ? (
                              <span className="text-[10px] text-emerald-400 font-medium font-sans bg-emerald-500/5 px-2 py-1 rounded-lg border border-emerald-500/10" title="업무일지에서 연동되어 직접 수정할 수 없습니다.">
                                업무일지 연동됨
                              </span>
                            ) : (
                              <>
                                <button 
                                  onClick={() => setEditingExpense(e)}
                                  className="p-1.5 text-slate-500 hover:text-indigo-400 hover:bg-slate-100 rounded-lg transition-all"
                                  title="비용 수정"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button 
                                  onClick={() => handleDeleteExpense(e.id)}
                                  className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-slate-100 rounded-lg transition-all"
                                  title="비용 삭제"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {visibleExpenseCount < filteredExpenses.length && (
                    <button
                      type="button"
                      onClick={() => setVisibleExpenseCount((prev) => Math.min(prev + 50, filteredExpenses.length))}
                      className="flex-none w-[150px] snap-start border border-dashed border-slate-200 hover:border-indigo-500/50 bg-slate-100 hover:bg-white rounded-2xl flex flex-col items-center justify-center gap-2 text-slate-500 hover:text-indigo-600 transition-all"
                    >
                      <span className="text-2xl">＋</span>
                      <span className="text-xs font-bold">{filteredExpenses.length - visibleExpenseCount}건 더 보기</span>
                    </button>
                  )}
                </div>

                {/* 합계 바 */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between text-xs mt-2">
                  <span className="text-slate-500 font-medium">필터링 대상 비용 지출 합계 :</span>
                  <span className="font-mono text-indigo-400 text-base font-bold">
                    {formatWon(filteredExpenses.reduce((sum, e) => sum + e.amount, 0))} 원
                  </span>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* 5. 정비일지 (Maintenance Tab) */}
      {activeSubTab === 'maintenance' && (
        <div className="space-y-4">
          <div className="flex items-center justify-start gap-3 border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (vehicles.length === 0) {
                    alert('차량을 먼저 대장에 기입해 주세요.');
                    return;
                  }
                  if (maintSubMode === 'intervals') {
                    setShowIntervalForm(!showIntervalForm);
                  } else {
                    setShowMaintForm(!showMaintForm);
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs text-white transition-all font-semibold"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{maintSubMode === 'intervals' ? '점검 주기 등록' : '정비 스케줄 등록'}</span>
              </button>
            </div>
          </div>

          {/* 정비기록 신규 등록 폼 */}
          {maintSubMode === 'history' && showMaintForm && (
            <div className="p-5 bg-white border border-slate-200 rounded-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                  <Wrench className="w-4 h-4 text-indigo-400" />
                  <span>차량 정비 일지 기록</span>
                </h3>
                <button onClick={() => setShowMaintForm(false)} className="text-xs text-slate-400 hover:text-slate-600">닫기</button>
              </div>
              <form onSubmit={handleAddMaint} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="col-span-1 sm:col-span-2 lg:col-span-4 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setReceiptCameraTarget('maint')}
                    className="flex-1 flex items-center justify-center gap-1.5 border border-dashed border-slate-200 rounded-xl py-2.5 hover:border-emerald-500 text-slate-400 hover:text-emerald-400 text-xs font-semibold transition-colors"
                  >
                    <Camera className="w-4 h-4" />
                    <span>{isScanningMaintReceipt ? '영수증 스캔 중...' : '정비 영수증/청구서 촬영 (자동으로 아래 항목 채움)'}</span>
                  </button>
                  {newMaint.receiptImage && (
                    <img
                      src={newMaint.receiptImage}
                      alt="영수증"
                      onClick={() => setEnlargedReceiptUrl(newMaint.receiptImage)}
                      className="w-12 h-12 rounded-lg object-cover border border-slate-200 shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                    />
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500">대상 차량 *</label>
                  <select 
                    value={newMaint.vehicleId}
                    onChange={e => setNewMaint({ ...newMaint, vehicleId: e.target.value })}
                    className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none text-slate-600"
                  >
                    <option value="">선택하세요...</option>
                    {vehicles.map(v => (
                      <option key={v.id} value={v.id}>{v.modelName} [{v.plateNumber}]</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500">정비 일자</label>
                  <input 
                    type="date" 
                    value={newMaint.date}
                    onChange={e => setNewMaint({ ...newMaint, date: e.target.value })}
                    className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none text-slate-600"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500 font-semibold text-indigo-400">정비 항목 *</label>
                  <select 
                    value={MAINTENANCE_OPTIONS.includes(newMaint.title) ? newMaint.title : (newMaint.title ? 'custom' : '')}
                    onChange={e => {
                      const val = e.target.value;
                      if (val === 'custom') {
                        setNewMaint({ ...newMaint, title: '직접 입력' });
                      } else {
                        setNewMaint({ ...newMaint, title: val });
                      }
                    }}
                    className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none text-slate-600"
                  >
                    <option value="">선택하세요...</option>
                    {MAINTENANCE_OPTIONS.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                    <option value="custom">직접 입력 (커스텀)</option>
                  </select>
                </div>

                {(newMaint.title === '직접 입력' || (newMaint.title && !MAINTENANCE_OPTIONS.includes(newMaint.title))) ? (
                  <div className="space-y-1.5 animate-fade-in">
                    <label className="text-xs text-indigo-400 font-semibold">정비 항목 직접 입력 *</label>
                    <input 
                      type="text" 
                      placeholder="예: 미션 벨트 교환"
                      value={newMaint.title === '직접 입력' ? '' : newMaint.title}
                      onChange={e => setNewMaint({ ...newMaint, title: e.target.value })}
                      className="w-full bg-slate-50 text-xs border border-indigo-900/40 rounded-lg p-2 focus:border-indigo-500 focus:outline-none text-slate-600"
                      required
                    />
                  </div>
                ) : null}
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500">정비 비용 (원)</label>
                  <input 
                    type="text" 
                    inputMode="numeric"
                    placeholder="정비 부품 및 공임 합산 금액"
                    value={formatCurrencyInput(newMaint.cost)}
                    onChange={e => setNewMaint({ ...newMaint, cost: parseCurrencyInput(e.target.value) })}
                    className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500">정비 당시 주행거리 (km)</label>
                  <input 
                    type="number" 
                    value={newMaint.mileage === 0 ? '' : newMaint.mileage}
                    onChange={e => setNewMaint({ ...newMaint, mileage: Number(e.target.value) })}
                    className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500">정비소/업체명</label>
                  <input 
                    type="text" 
                    placeholder="예: 블루핸즈 역삼점"
                    value={newMaint.shopName}
                    onChange={e => setNewMaint({ ...newMaint, shopName: e.target.value })}
                    className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500">정비소 연락처</label>
                  <input 
                    type="text" 
                    placeholder="예: 02-123-4567"
                    value={newMaint.shopContact || ''}
                    onChange={e => setNewMaint({ ...newMaint, shopContact: e.target.value })}
                    className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500">정비 상태</label>
                  <select 
                    value={newMaint.status}
                    onChange={e => setNewMaint({ ...newMaint, status: e.target.value as any })}
                    className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none text-slate-600"
                  >
                    <option value="completed">정비 완료</option>
                    <option value="scheduled">예정 (스케줄러)</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500">결제 수단</label>
                  <select 
                    value={newMaint.payMethod || 'company_card'}
                    onChange={e => setNewMaint({ ...newMaint, payMethod: e.target.value as any })}
                    className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none text-slate-600"
                  >
                    <option value="company_card">법인(회사)카드</option>
                    <option value="personal_card">개인카드</option>
                    <option value="cash">현금</option>
                    {/* [추가] 워런티(보증) 수리 등 비용이 0원인 경우를 위한 선택지 */}
                    <option value="none">해당없음 (무료/보증수리)</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <button 
                    type="submit"
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs py-2 px-4 rounded-lg transition-all"
                  >
                    정비기록 추가
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* 소모품 점검 주기 신규 등록 폼 */}
          {maintSubMode === 'intervals' && showIntervalForm && (
            <div className="p-5 bg-white border border-slate-200 rounded-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                  <RefreshCw className="w-4 h-4 text-indigo-400" />
                  <span>소모품 정기 점검 주기 등록</span>
                </h3>
                <button onClick={() => setShowIntervalForm(false)} className="text-xs text-slate-400 hover:text-slate-600">닫기</button>
              </div>
              <form onSubmit={handleAddInterval} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500 font-semibold text-indigo-400">차량 선택 *</label>
                  <select 
                    value={newInterval.vehicleId}
                    onChange={e => setNewInterval({ ...newInterval, vehicleId: e.target.value })}
                    className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none text-slate-600"
                    required
                  >
                    <option value="">차량 선택...</option>
                    {vehicles.map(v => (
                      <option key={v.id} value={v.id}>{v.modelName} [{v.plateNumber}]</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500 font-semibold text-indigo-400">점검 항목 *</label>
                  <select
                    value={MAINTENANCE_OPTIONS.includes(newInterval.itemType) ? newInterval.itemType : (newInterval.itemType ? 'custom' : '')}
                    onChange={e => {
                      const val = e.target.value;
                      if (val === 'custom') {
                        setNewInterval({ ...newInterval, itemType: '직접 입력' });
                      } else {
                        setNewInterval({ ...newInterval, itemType: val });
                      }
                    }}
                    className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none text-slate-600"
                    required
                  >
                    <option value="">선택하세요...</option>
                    {DISPLAY_MAINTENANCE_OPTIONS.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                    <option value="custom">직접 입력</option>
                  </select>
                </div>

                {(newInterval.itemType === '직접 입력' || (newInterval.itemType && !MAINTENANCE_OPTIONS.includes(newInterval.itemType))) ? (
                  <div className="space-y-1.5 animate-fade-in">
                    <label className="text-xs text-indigo-400 font-semibold">점검 항목 직접 입력 *</label>
                    <input 
                      type="text" 
                      placeholder="예: 미션 벨트 교환"
                      value={newInterval.itemType === '직접 입력' ? '' : newInterval.itemType}
                      onChange={e => setNewInterval({ ...newInterval, itemType: e.target.value })}
                      className="w-full bg-slate-50 text-xs border border-indigo-900/40 rounded-lg p-2 focus:border-indigo-500 focus:outline-none text-slate-600"
                      required
                    />
                  </div>
                ) : null}

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500">km 주기 입력 (예 : 5,000 등 ) *</label>
                  <input 
                    type="number" 
                    placeholder="5,000"
                    value={newInterval.intervalKm || ''}
                    onChange={e => setNewInterval({ ...newInterval, intervalKm: Number(e.target.value) })}
                    className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none text-slate-600 font-mono"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500">일 주기 입력(예 :180일 등) *</label>
                  <input 
                    type="number" 
                    placeholder="180"
                    value={newInterval.intervalDays || ''}
                    onChange={e => setNewInterval({ ...newInterval, intervalDays: Number(e.target.value) })}
                    className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none text-slate-600 font-mono"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500">마지막 점검 주행 거리(km)</label>
                  <input 
                    type="number" 
                    placeholder="0"
                    value={newInterval.lastServiceMileage || ''}
                    onChange={e => setNewInterval({ ...newInterval, lastServiceMileage: Number(e.target.value) })}
                    className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none text-slate-600 font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500">마지막 점검일 (mm/dd/yy 달력 선택)</label>
                  <input 
                    type="date" 
                    value={newInterval.lastServiceDate || ''}
                    onChange={e => setNewInterval({ ...newInterval, lastServiceDate: e.target.value })}
                    className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none text-slate-600"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500">알림 기준 (km 전 알림(km 입력))</label>
                  <input 
                    type="number" 
                    placeholder="500"
                    value={newInterval.alertKmBefore || ''}
                    onChange={e => setNewInterval({ ...newInterval, alertKmBefore: Number(e.target.value) })}
                    className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none text-slate-600 font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500">알림 기준 (일 전 알림(일 입력))</label>
                  <input 
                    type="number" 
                    placeholder="7"
                    value={newInterval.alertDaysBefore || ''}
                    onChange={e => setNewInterval({ ...newInterval, alertDaysBefore: Number(e.target.value) })}
                    className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none text-slate-600 font-mono"
                  />
                </div>

                <div className="lg:col-span-4 flex justify-end gap-2 border-t border-slate-200/50 pt-3">
                  <button 
                    type="button"
                    onClick={() => setShowIntervalForm(false)}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold text-xs py-2 px-4 rounded-lg transition-all"
                  >
                    취소
                  </button>
                  <button 
                    type="submit"
                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs py-2 px-5 rounded-lg transition-all"
                  >
                    점검 주기 등록
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* 서브 토글 탭 */}
          <div className="flex border-b border-slate-200 pb-px gap-1">
            <button
              onClick={() => setMaintSubMode('history')}
              className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-all ${
                maintSubMode === 'history'
                  ? 'border-indigo-500 text-indigo-400 font-bold bg-indigo-950/10'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100'
              } rounded-t-xl`}
            >
              🛠️ 정비 내역 대장
            </button>
            <button
              onClick={() => setMaintSubMode('intervals')}
              className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-all ${
                maintSubMode === 'intervals'
                  ? 'border-indigo-500 text-indigo-400 font-bold bg-indigo-950/10'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100'
              } rounded-t-xl`}
            >
              🔄 소모품 점검 주기
            </button>
          </div>

          {/* 1) 정비 내역 대장 모드 */}
          {maintSubMode === 'history' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/20 p-3 rounded-2xl border border-slate-200">
                {/* 기간 필터 버튼 */}
                <div className="flex flex-wrap items-center gap-1 bg-white p-1 rounded-xl border border-slate-200">
                  {(['all', 'today', 'week', 'month', 'year', 'custom'] as const).map(p => {
                    const label = p === 'all' ? '전체' : p === 'today' ? '오늘' : p === 'week' ? '이번주' : p === 'month' ? '이번달' : p === 'year' ? '올해' : '직접 선택';
                    return (
                      <button
                        key={p}
                        onClick={() => setMaintPeriod(p)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          maintPeriod === p 
                            ? 'bg-indigo-600 text-white shadow-sm' 
                            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>

                {maintPeriod === 'custom' && (
                  <div className="flex items-center gap-2 bg-white p-1.5 border border-slate-200 rounded-xl">
                    <input 
                      type="date" 
                      value={maintCustomStart}
                      onChange={e => setMaintCustomStart(e.target.value)}
                      className="bg-slate-50 border border-slate-200 rounded-lg p-1 text-xs text-slate-600 focus:outline-none focus:border-indigo-500"
                    />
                    <span className="text-slate-400 text-xs">~</span>
                    <input 
                      type="date" 
                      value={maintCustomEnd}
                      onChange={e => setMaintCustomEnd(e.target.value)}
                      className="bg-slate-50 border border-slate-200 rounded-lg p-1 text-xs text-slate-600 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                )}
              </div>

              {(() => {
                const filteredMaint = maintenances.filter(m => isDateInPeriod(m.date, maintPeriod, maintCustomStart, maintCustomEnd));
                if (filteredMaint.length === 0) {
                  return (
                    <div className="bg-slate-100 border border-slate-200 rounded-2xl py-12 text-center text-slate-500 text-xs">
                      기록된 예방 정비 대장이 없거나 필터 조건에 부합하는 내역이 없습니다.
                    </div>
                  );
                }
                return (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
                    <span>총 {filteredMaint.length}건의 정비 대장</span>
                    <span className="flex items-center gap-1 text-indigo-400 font-medium">
                      <span>옆으로 밀어서 보기</span>
                      <span className="animate-pulse">↔</span>
                    </span>
                  </div>
                  <div className="flex overflow-x-auto gap-4 pb-4 scroll-smooth snap-x snap-mandatory scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
                    {filteredMaint
                      .slice(0, visibleMaintCount)
                      .map(m => {
                        let payMethodKo = '법인(회사)카드';
                        if (m.payMethod === 'personal_card') payMethodKo = '개인카드';
                        if (m.payMethod === 'cash') payMethodKo = '현금';
                        if (m.payMethod === 'none') payMethodKo = '해당없음';

                        return (
                          <div 
                            key={m.id}
                            className={`flex-none w-[290px] sm:w-[350px] snap-start border p-4 rounded-2xl space-y-3 flex flex-col justify-between ${
                              m.status === 'scheduled' 
                                ? 'bg-amber-50 border-amber-200 shadow-sm' 
                                : 'bg-white border-slate-200 shadow-sm'
                            }`}
                          >
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                m.status === 'scheduled' 
                                  ? 'bg-amber-50 text-amber-700 border border-amber-500/20' 
                                  : 'bg-indigo-50 text-indigo-700 border border-indigo-500/20'
                              }`}>
                                {m.status === 'scheduled' ? '정비 예정 (대기중)' : '🔧 정비 완료'}
                              </span>
                              <span className="text-xs text-slate-400 font-mono">{m.date}</span>
                            </div>

                            <h3 className="font-bold text-sm text-slate-800">{m.title}</h3>
                            
                            <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-500 pt-1">
                              <div>
                                <p className="text-[10px] text-slate-400">대상 차량</p>
                                <p className="text-slate-600 font-semibold">{getVehicleModel(m.vehicleId)}</p>
                              </div>
                              {m.mileage > 0 && (
                                <div>
                                  <p className="text-[10px] text-slate-400">정비 시점 주행거리</p>
                                  <p className="text-slate-600 font-mono">{formatWon(m.mileage)} km</p>
                                </div>
                              )}
                              {m.shopName && (
                                <div>
                                  <p className="text-[10px] text-slate-400">정비소/업체</p>
                                  <p className="text-slate-600">
                                    {m.shopName}
                                    {m.shopContact && (
                                      <span className="text-indigo-400 block text-[10px] mt-0.5">📞 {m.shopContact}</span>
                                    )}
                                  </p>
                                </div>
                              )}
                              <div>
                                <p className="text-[10px] text-slate-400">결제 수단</p>
                                <p className="text-slate-600 font-medium">{payMethodKo}</p>
                              </div>
                              <div className="col-span-2 mt-1">
                                <p className="text-[10px] text-slate-400">비용 공임</p>
                                <p className="text-indigo-400 font-semibold font-mono">{m.cost > 0 ? `${formatWon(m.cost)} 원` : '기록없음/무료'}</p>
                              </div>
                            </div>

                            {m.memo && (
                              <p className="text-[11px] text-slate-400 bg-slate-50 p-2 rounded-lg border border-slate-200">
                                메모: {m.memo}
                              </p>
                            )}
                          </div>

                          <div className="pt-2.5 border-t border-slate-200 flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              {m.status === 'scheduled' && (
                                <button 
                                  onClick={() => handleCompleteMaint(m.id)}
                                  className="px-2.5 py-1 text-[10px] bg-amber-50 hover:bg-amber-500/30 text-amber-700 rounded font-semibold transition-all"
                                >
                                  정비 완료로 변경
                                </button>
                              )}
                              <button 
                                onClick={() => setEditingMaint(m)}
                                className="p-1 text-slate-400 hover:text-indigo-400 hover:bg-slate-100 rounded transition-all"
                                title="정비 기록 수정"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <button 
                              onClick={() => handleDeleteMaint(m.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-100 rounded-lg transition-all"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {visibleMaintCount < filteredMaint.length && (
                      <button
                        type="button"
                        onClick={() => setVisibleMaintCount((prev) => Math.min(prev + 50, filteredMaint.length))}
                        className="flex-none w-[150px] snap-start border border-dashed border-slate-200 hover:border-indigo-500/50 bg-slate-100 hover:bg-white rounded-2xl flex flex-col items-center justify-center gap-2 text-slate-500 hover:text-indigo-600 transition-all"
                      >
                        <span className="text-2xl">＋</span>
                        <span className="text-xs font-bold">{filteredMaint.length - visibleMaintCount}건 더 보기</span>
                      </button>
                    )}
                  </div>
                </div>
                );
              })()}
            </div>
          )}

          {/* 2) 소모품 점검 주기 모드 */}
          {maintSubMode === 'intervals' && (
            <div className="space-y-4">
              {maintenanceIntervals.length === 0 ? (
                <div className="bg-slate-100 border border-slate-200 rounded-2xl py-12 text-center text-slate-500 text-xs">
                  등록된 예방 점검 주기가 없습니다. 소모품(엔진오일, 타이어 등)의 수명 한도를 기입하여 교환 시기를 관리하세요.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {maintenanceIntervals.map(item => {
                    const vehicle = vehicles.find(v => v.id === item.vehicleId);
                    const currentMileage = vehicle ? vehicle.currentMileage : 0;
                    
                    // 주행한 거리 계산
                    const drivenKm = Math.max(0, currentMileage - item.lastServiceMileage);
                    const isKmExceeded = drivenKm >= item.intervalKm;
                    const kmProgress = Math.min(100, (drivenKm / item.intervalKm) * 100);
                    
                    // 경과한 일수 계산
                    let daysElapsed = 0;
                    try {
                      const lastDate = new Date(item.lastServiceDate);
                      daysElapsed = Math.max(0, Math.floor((new Date().getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)));
                    } catch (_) {}
                    const isDaysExceeded = daysElapsed >= item.intervalDays;
                    const daysProgress = Math.min(100, (daysElapsed / item.intervalDays) * 100);

                    // 임박 알림 판정
                    const kmLeft = item.intervalKm - drivenKm;
                    const daysLeft = item.intervalDays - daysElapsed;
                    const isAlertKm = kmLeft <= item.alertKmBefore;
                    const isAlertDays = daysLeft <= item.alertDaysBefore;

                    const hasWarning = isKmExceeded || isDaysExceeded || isAlertKm || isAlertDays;

                    return (
                      <div 
                        key={item.id}
                        className={`border p-4 rounded-2xl space-y-4 bg-white border-slate-200 flex flex-col justify-between relative overflow-hidden`}
                      >
                        {hasWarning && (
                          <div className="absolute right-0 top-0 bg-amber-50 text-amber-700 text-[10px] font-bold px-2.5 py-1 rounded-bl border-l border-b border-amber-500/20 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 text-amber-400" />
                            <span>점검 임박</span>
                          </div>
                        )}

                        <div className="space-y-3">
                          <div>
                            <span className="text-[10px] text-slate-400 block font-semibold">{getVehicleModel(item.vehicleId)}</span>
                            <h3 className="font-bold text-base text-slate-800">{item.itemType}</h3>
                          </div>

                          {/* Progress indicators */}
                          <div className="space-y-2.5 text-xs text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-200">
                            {/* KM Progress */}
                            <div className="space-y-1">
                              <div className="flex justify-between text-[11px]">
                                <span>주행거리 기준 교환 주기 ({formatWon(item.intervalKm)}km)</span>
                                <span className={`font-mono font-bold ${isKmExceeded ? 'text-rose-400' : isAlertKm ? 'text-amber-400' : 'text-emerald-400'}`}>
                                  {formatWon(drivenKm)}km 주행 ({kmProgress.toFixed(0)}%)
                                </span>
                              </div>
                              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div 
                                  className={`h-full rounded-full transition-all ${
                                    isKmExceeded ? 'bg-rose-500' : isAlertKm ? 'bg-amber-500' : 'bg-emerald-500'
                                  }`}
                                  style={{ width: `${kmProgress}%` }}
                                ></div>
                              </div>
                              <p className="text-[10px] text-slate-400">
                                {kmLeft > 0 ? `교환까지 ${formatWon(kmLeft)}km 남음` : '교환 한계 도과! 즉시 정비 권장'}
                              </p>
                            </div>

                            {/* Days Progress */}
                            <div className="space-y-1 pt-1 border-t border-slate-200">
                              <div className="flex justify-between text-[11px]">
                                <span>경과 일수 기준 교환 주기 ({item.intervalDays}일)</span>
                                <span className={`font-mono font-bold ${isDaysExceeded ? 'text-rose-400' : isAlertDays ? 'text-amber-400' : 'text-emerald-400'}`}>
                                  {daysElapsed}일 경과 ({daysProgress.toFixed(0)}%)
                                </span>
                              </div>
                              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div 
                                  className={`h-full rounded-full transition-all ${
                                    isDaysExceeded ? 'bg-rose-500' : isAlertDays ? 'bg-amber-500' : 'bg-emerald-500'
                                  }`}
                                  style={{ width: `${daysProgress}%` }}
                                ></div>
                              </div>
                              <p className="text-[10px] text-slate-400">
                                {daysLeft > 0 ? `교환까지 ${daysLeft}일 남음` : '권장 교환 시점 초과! 즉시 정비 권장'}
                              </p>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-400 pt-1">
                            <div>
                              <span>이전 교환 시점 주행거리</span>
                              <p className="text-slate-600 font-semibold">{formatWon(item.lastServiceMileage)} km</p>
                            </div>
                            <div>
                              <span>이전 교환 일자</span>
                              <p className="text-slate-600 font-semibold">{item.lastServiceDate}</p>
                            </div>
                          </div>
                        </div>

                        <div className="pt-2.5 border-t border-slate-200 flex items-center justify-between">
                          <button
                            onClick={() => setEditingInterval(item)}
                            className="px-2.5 py-1 text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-600 rounded font-semibold transition-all flex items-center gap-1"
                          >
                            <Pencil className="w-3 h-3" />
                            <span>수정</span>
                          </button>
                          <button 
                            onClick={() => handleDeleteInterval(item.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-100 rounded-lg transition-all"
                            title="점검 주기 삭제"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 6. 리포트 출력 (Reports Tab - 국세청 업무용승용차 운행기록부 서식 자동출력) */}
      {activeSubTab === 'reports' && (() => {
        // 일별 비용 구하는 헬퍼 함수
        const getDayExpenses = (vehicleId: string, date: string, category: 'fuel' | 'toll') => {
          return expenses
            .filter(e => e.vehicleId === vehicleId && e.date === date && e.category === category)
            .reduce((sum, e) => sum + e.amount, 0);
        };

        // 월별 비용 총합 구하는 헬퍼 함수
        const getMonthExpensesTotal = (vehicleId: string, monthPrefix: string, category: 'fuel' | 'toll') => {
          return expenses
            .filter(e => e.vehicleId === vehicleId && e.date.startsWith(monthPrefix) && e.category === category)
            .reduce((sum, e) => sum + e.amount, 0);
        };

        // [수정] 엑셀 다운로드와 인쇄(PDF)가 똑같은 표 내용을 써야 해서, 표 HTML을 만드는
        // 부분을 별도 함수로 뽑아냈다. 엑셀 다운로드는 여기에 xls 파일 포장을 씌우고,
        // 인쇄는 #print-root 포털에 그대로 꽂아 넣어서 화면의 다른 요소 없이 이 표만
        // 단독으로 인쇄/PDF 저장되게 한다.
        const buildReportTableHtml = (v: Vehicle): string => {
          const carLogs = drivingLogs.filter(log => log.vehicleId === v.id && log.date.startsWith(reportYearMonth));
          const year = reportYearMonth.split('-')[0];
          const companyName = currentUser.companyName || '초이스커피';
          const bizNumber = currentUser.businessNumber || '207-16-23565';
          
          const totalCommuteDistance = carLogs.filter(log => log.purpose.includes('출퇴근')).reduce((sum, x) => sum + x.distance, 0);
          const totalWorkDistance = carLogs.filter(log => !log.purpose.includes('출퇴근')).reduce((sum, x) => sum + x.distance, 0);
          const totalTollAmount = getMonthExpensesTotal(v.id, reportYearMonth, 'toll');
          const totalFuelAmount = getMonthExpensesTotal(v.id, reportYearMonth, 'fuel');

          const insuranceInfo = v.insuranceCompany 
            ? `${v.insuranceCompany}${v.insuranceAgent ? '/' + v.insuranceAgent : ''}${v.insuranceContact ? ' (' + v.insuranceContact + ')' : ''}` 
            : '삼성화재/고상진 (010-3456-5432)';

          const rentalTypeKo = getRentalTypeKo(v.rentalType);
          const rentalFeeStr = v.rentalFee ? formatWon(v.rentalFee) : '1,300,000';

          let rowsHtml = '';
          
          if (carLogs.length === 0) {
            rowsHtml = `
              <tr>
                <td colspan="13" style="text-align: center; padding: 40px; color: #64748b; font-size: 10pt; border: 0.5pt solid #000000; height: 80px; vertical-align: middle;">
                  해당 월에 기록된 주행 로그가 존재하지 않습니다.
                </td>
              </tr>
            `;
          } else {
            // [수정] 예전엔 같은 날짜에 운행기록이 여러 건이면, 그날 하루 비용 합계를
            // 모든 줄에 똑같이 반복해서 보여줬다. 그러면 실제로는 한 번만 든 비용인데도
            // 화면(엑셀)에서는 그 금액이 여러 줄에 찍혀서 "중복으로 입력된 것처럼" 보이는
            // 문제가 있었다. 이제 같은 날짜의 첫 번째 줄에만 그날 하루 합계를 표시하고,
            // 같은 날짜의 나머지 줄은 통행료/연료비 칸을 비워둔다. 맨 아래 "합계" 행은
            // 원래도 날짜별이 아니라 월 전체를 따로 계산하므로 이 변경과 무관하게 정확하다.
            const shownExpenseDates = new Set<string>();
            carLogs.forEach(log => {
              const isCommute = log.purpose.includes('출퇴근');
              const commuteDist = isCommute ? `${log.distance}.0` : '';
              const workDist = !isCommute ? `${log.distance}.0` : '';
              const isFirstRowForThisDate = !shownExpenseDates.has(log.date);
              shownExpenseDates.add(log.date);
              const tollVal = isFirstRowForThisDate ? getDayExpenses(v.id, log.date, 'toll') : 0;
              const fuelVal = isFirstRowForThisDate ? getDayExpenses(v.id, log.date, 'fuel') : 0;

              rowsHtml += `
                <tr style="height: 25px;">
                  <td style="text-align: center; border: 0.5pt solid #000000; font-family: 'Malgun Gothic', Arial; font-size: 9pt;">${log.date}</td>
                  <td style="text-align: center; border: 0.5pt solid #000000; font-family: 'Malgun Gothic', Arial; font-size: 9pt;">${log.department || ''}</td>
                  <td style="text-align: center; border: 0.5pt solid #000000; font-family: 'Malgun Gothic', Arial; font-size: 9pt;">${log.driverName}</td>
                  <td style="text-align: center; border: 0.5pt solid #000000; font-family: 'Malgun Gothic', Arial; font-size: 9pt;">${log.purpose}</td>
                  <td style="text-align: center; border: 0.5pt solid #000000; font-family: 'Malgun Gothic', Arial; font-size: 9pt;">${log.startPlace || ''}</td>
                  <td style="text-align: left; padding-left: 5px; border: 0.5pt solid #000000; font-family: 'Malgun Gothic', Arial; font-size: 9pt;">${log.startAddress || ''}</td>
                  <td style="text-align: center; border: 0.5pt solid #000000; font-family: 'Malgun Gothic', Arial; font-size: 9pt;">${log.endPlace || ''}</td>
                  <td style="text-align: left; padding-left: 5px; border: 0.5pt solid #000000; font-family: 'Malgun Gothic', Arial; font-size: 9pt;">${log.endAddress || ''}</td>
                  <td style="text-align: right; padding-right: 5px; border: 0.5pt solid #000000; font-family: 'Malgun Gothic', Arial; font-size: 9pt;">${commuteDist}</td>
                  <td style="text-align: right; padding-right: 5px; border: 0.5pt solid #000000; font-family: 'Malgun Gothic', Arial; font-size: 9pt;">${workDist}</td>
                  <td style="text-align: right; padding-right: 5px; border: 0.5pt solid #000000; font-family: 'Malgun Gothic', Arial; font-size: 9pt;">${tollVal > 0 ? formatWon(tollVal) : ''}</td>
                  <td style="text-align: right; padding-right: 5px; border: 0.5pt solid #000000; font-family: 'Malgun Gothic', Arial; font-size: 9pt;">${fuelVal > 0 ? formatWon(fuelVal) : ''}</td>
                  <td style="text-align: left; padding-left: 5px; border: 0.5pt solid #000000; font-family: 'Malgun Gothic', Arial; font-size: 9pt;">${log.projectName || ''}</td>
                </tr>
              `;
            });
          }

          const tableHtml = `
            <table style="border-collapse: collapse; width: 100%; border: 1.5pt solid #000000; font-family: 'Malgun Gothic', Arial; font-size: 10pt;">
              <!-- Header Row 1 & 2 -->
              <tr style="height: 35px;">
                <th rowspan="2" colspan="1" style="background-color: #f1f5f9; text-align: center; border: 0.5pt solid #000000; font-weight: bold; font-size: 10pt;">사업연도</th>
                <td rowspan="2" colspan="3" style="text-align: center; border: 0.5pt solid #000000; font-size: 10pt; font-weight: bold;">${year}.01.01 ~ ${year}.12.31</td>
                <th rowspan="2" colspan="5" style="text-align: center; font-size: 16pt; font-weight: bold; border: 0.5pt solid #000000; letter-spacing: 2px;">업무용승용차 운행기록부</th>
                <th rowspan="1" colspan="1" style="background-color: #f1f5f9; text-align: center; border: 0.5pt solid #000000; font-weight: bold; font-size: 10pt;">상호명</th>
                <td rowspan="1" colspan="3" style="text-align: center; border: 0.5pt solid #000000; font-weight: bold; font-size: 10pt;">${companyName}</td>
              </tr>
              <tr style="height: 35px;">
                <th rowspan="1" colspan="1" style="background-color: #f1f5f9; text-align: center; border: 0.5pt solid #000000; font-weight: bold; font-size: 10pt;">사업자등록번호</th>
                <td rowspan="1" colspan="3" style="text-align: center; border: 0.5pt solid #000000; font-size: 10pt;">${bizNumber}</td>
              </tr>

              <!-- Spacer/Section Row -->
              <tr style="height: 25px;">
                <td colspan="13" style="background-color: #eff6ff; text-align: left; font-weight: bold; padding-left: 10px; border: 0.5pt solid #000000; font-size: 11pt; color: #1e3a8a;">1. 기본정보</td>
              </tr>

              <!-- Section 1 Headers -->
              <tr style="height: 30px; background-color: #f8fafc; text-align: center; font-weight: bold;">
                <td colspan="2" style="border: 0.5pt solid #000000;">차종</td>
                <td colspan="2" style="border: 0.5pt solid #000000;">자동차등록번호</td>
                <td colspan="4" style="border: 0.5pt solid #000000;">자동차보험가입여부</td>
                <td colspan="2" style="border: 0.5pt solid #000000;">임차여부</td>
                <td colspan="2" style="border: 0.5pt solid #000000;">임차료</td>
                <td colspan="1" style="border: 0.5pt solid #000000;">비고</td>
              </tr>

              <!-- Section 1 Values -->
              <tr style="height: 30px; text-align: center;">
                <td colspan="2" style="border: 0.5pt solid #000000;">${v.modelName}</td>
                <td colspan="2" style="border: 0.5pt solid #000000; font-weight: bold;">${v.plateNumber}</td>
                <td colspan="4" style="border: 0.5pt solid #000000; text-align: left; padding-left: 10px;">${insuranceInfo}</td>
                <td colspan="2" style="border: 0.5pt solid #000000;">${rentalTypeKo}</td>
                <td colspan="2" style="border: 0.5pt solid #000000; text-align: right; padding-right: 10px;">${rentalFeeStr}</td>
                <td colspan="1" style="border: 0.5pt solid #000000;">${v.color || ''}</td>
              </tr>

              <!-- Spacer/Section Row 2 -->
              <tr style="height: 25px;">
                <td colspan="13" style="background-color: #eff6ff; text-align: left; font-weight: bold; padding-left: 10px; border: 0.5pt solid #000000; font-size: 11pt; color: #1e3a8a;">2. 차량운행기록 내역</td>
              </tr>

              <!-- Table headers 2 -->
              <tr style="background-color: #f1f5f9; text-align: center; font-weight: bold; height: 25px;">
                <th rowspan="2" colspan="1" style="border: 0.5pt solid #000000; vertical-align: middle;">사용일자</th>
                <th rowspan="1" colspan="2" style="border: 0.5pt solid #000000;">사용자</th>
                <th rowspan="2" colspan="1" style="border: 0.5pt solid #000000; vertical-align: middle;">사용목적</th>
                <th rowspan="2" colspan="1" style="border: 0.5pt solid #000000; vertical-align: middle;">출발지</th>
                <th rowspan="2" colspan="1" style="border: 0.5pt solid #000000; vertical-align: middle;">출발지 주소</th>
                <th rowspan="2" colspan="1" style="border: 0.5pt solid #000000; vertical-align: middle;">도착지</th>
                <th rowspan="2" colspan="1" style="border: 0.5pt solid #000000; vertical-align: middle;">도착지 주소</th>
                <th rowspan="1" colspan="2" style="border: 0.5pt solid #000000;">사용거리(km)</th>
                <th rowspan="2" colspan="1" style="border: 0.5pt solid #000000; vertical-align: middle;">통행료</th>
                <th rowspan="2" colspan="1" style="border: 0.5pt solid #000000; vertical-align: middle;">연료비</th>
                <th rowspan="2" colspan="1" style="border: 0.5pt solid #000000; vertical-align: middle;">프로젝트명</th>
              </tr>
              <tr style="background-color: #f1f5f9; text-align: center; font-weight: bold; height: 25px;">
                <th style="border: 0.5pt solid #000000;">부서</th>
                <th style="border: 0.5pt solid #000000;">성명</th>
                <th style="border: 0.5pt solid #000000;">출·퇴근용</th>
                <th style="border: 0.5pt solid #000000;">일반업무용</th>
              </tr>

              <!-- Data Rows -->
              ${rowsHtml}

              <!-- Total Row -->
              <tr style="background-color: #fef08a; font-weight: bold; height: 30px; text-align: center;">
                <td colspan="8" style="text-align: center; border: 0.5pt solid #000000; font-size: 10pt;">합계</td>
                <td style="text-align: right; padding-right: 5px; border: 0.5pt solid #000000;">${totalCommuteDistance > 0 ? `${totalCommuteDistance}.0` : '0.0'}</td>
                <td style="text-align: right; padding-right: 5px; border: 0.5pt solid #000000;">${totalWorkDistance > 0 ? `${totalWorkDistance}.0` : '0.0'}</td>
                <td style="text-align: right; padding-right: 5px; border: 0.5pt solid #000000;">${totalTollAmount > 0 ? formatWon(totalTollAmount) : '0'}</td>
                <td style="text-align: right; padding-right: 5px; border: 0.5pt solid #000000;">${totalFuelAmount > 0 ? formatWon(totalFuelAmount) : '0'}</td>
                <td style="border: 0.5pt solid #000000;"></td>
              </tr>
            </table>
          `;

          return tableHtml;
        };

        // 엑셀 내보내기 함수
        const handleExportExcel = (v: Vehicle) => {
          const tableHtml = buildReportTableHtml(v);
          const excelContent = `
            <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
            <head>
            <meta charset="utf-8">
            <!--[if gte mso 9]>
            <xml>
            <x:ExcelWorkbook>
            <x:ExcelWorksheets>
            <x:ExcelWorksheet>
            <x:Name>NTS_운행기록부</x:Name>
            <x:WorksheetOptions>
            <x:DisplayGridlines/>
            </x:WorksheetOptions>
            </x:ExcelWorksheet>
            </x:ExcelWorksheets>
            </x:ExcelWorkbook>
            </xml>
            <![endif]-->
            </head>
            <body>
            ${tableHtml}
            </body>
            </html>
          `;

          const blob = new Blob([excelContent], { type: 'application/vnd.ms-excel;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.setAttribute('download', `업무용승용차_운행기록부_${v.plateNumber}_${reportYearMonth}.xls`);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        };

        // [추가] 인쇄(PDF 저장) 함수. 예전엔 window.print()만 호출해서 화면에 보이는 다른
        // 요소(상단 메뉴, 탭, 다른 카드 등)까지 같이 인쇄됐다. 이제 표 내용을 #print-root
        // 포털에 넣고, 인쇄할 때만 화면의 나머지 부분(#root)을 감춰서 이 표만 단독으로
        // 인쇄/PDF 저장되게 한다. 표가 가로로 넓어서 A4 세로가 아니라 가로로 인쇄되도록
        // print-landscape 클래스도 같이 붙인다.
        const handlePrintReport = (v: Vehicle) => {
          const tableHtml = buildReportTableHtml(v);
          setPrintingReportHtml(tableHtml);
          setTimeout(() => {
            document.body.classList.add('print-portal-mode');
            window.addEventListener('afterprint', () => document.body.classList.remove('print-portal-mode'), { once: true });
            window.print();
          }, 50);
        };

        return (
          <div className="space-y-4">
            <div className="p-5 bg-white border border-slate-200 rounded-2xl space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-indigo-400" />
                    <span>국세청(NTS) 제출용 업무용승용차 운행기록부 서식</span>
                  </h2>
                </div>
                
                {/* 전체 다운로드 제어 기능 */}
                {vehicles.length > 0 && (
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => {
                        const activeCar = vehicles.find(v => v.id === reportVehicleId);
                        if (activeCar) handleExportExcel(activeCar);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[11px] font-semibold transition-all cursor-pointer"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      <span>현재 차량 엑셀 다운로드</span>
                    </button>
                    <button
                      onClick={() => {
                        const activeCar = vehicles.find(v => v.id === reportVehicleId);
                        if (activeCar) handlePrintReport(activeCar);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[11px] font-semibold transition-all cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>선택 차량 인쇄 (PDF 저장)</span>
                    </button>
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-row items-end gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="space-y-1.5 flex-1 w-full">
                  <label className="text-xs text-slate-500">인쇄 대상 차량 선택</label>
                  <select 
                    value={reportVehicleId}
                    onChange={e => {
                      const val = e.target.value;
                      setReportVehicleId(val);
                      if (val) {
                        const el = document.getElementById(`nts-report-${val}`);
                        if (el) {
                          el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                        }
                      }
                    }}
                    className="w-full bg-white text-xs text-slate-600 rounded-lg border border-slate-200 p-2 focus:outline-none"
                  >
                    <option value="">차량 선택...</option>
                    {vehicles.map(v => (
                      <option key={v.id} value={v.id}>{v.modelName} [{v.plateNumber}]</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5 flex-1 w-full">
                  <label className="text-xs text-slate-500">조회 월 선택 (연월)</label>
                  <input 
                    type="month" 
                    value={reportYearMonth}
                    onChange={e => setReportYearMonth(e.target.value)}
                    className="w-full bg-white text-xs text-slate-600 rounded-lg border border-slate-200 p-2 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* 국세청 출력 테이블 폼 시뮬레이션 */}
            {vehicles.length === 0 ? (
              <div className="p-12 text-center bg-slate-50 border border-slate-200 text-slate-500 rounded-2xl text-xs">
                등록된 차량이 없습니다. 차량을 먼저 등록해 주세요.
              </div>
            ) : (
              <div className="space-y-4">
                {/* 안내 메시지 및 좌우 이동 컨트롤 */}
                <div className="flex items-center justify-between text-[11px] text-slate-400 px-1 print:hidden">
                  <span>총 {vehicles.length}대 차량의 NTS 운행기록부</span>
                  <div className="flex items-center gap-3">
                    <button 
                      type="button"
                      onClick={() => {
                        const idx = vehicles.findIndex(v => v.id === reportVehicleId);
                        if (idx > 0) {
                          const prevId = vehicles[idx - 1].id;
                          setReportVehicleId(prevId);
                          const el = document.getElementById(`nts-report-${prevId}`);
                          el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                        }
                      }}
                      disabled={vehicles.findIndex(v => v.id === reportVehicleId) <= 0}
                      className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent text-slate-500 transition-all cursor-pointer"
                    >
                      ◀
                    </button>
                    <span className="flex items-center gap-1.5 text-indigo-400 font-medium">
                      <span>차량별 옆으로 쓸어서 넘기기</span>
                      <span className="animate-pulse">↔</span>
                    </span>
                    <button 
                      type="button"
                      onClick={() => {
                        const idx = vehicles.findIndex(v => v.id === reportVehicleId);
                        if (idx !== -1 && idx < vehicles.length - 1) {
                          const nextId = vehicles[idx + 1].id;
                          setReportVehicleId(nextId);
                          const el = document.getElementById(`nts-report-${nextId}`);
                          el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                        }
                      }}
                      disabled={vehicles.findIndex(v => v.id === reportVehicleId) === vehicles.length - 1}
                      className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent text-slate-500 transition-all cursor-pointer"
                    >
                      ▶
                    </button>
                  </div>
                </div>

                {/* 가로 스와이프 리포트 카드 컨테이너 */}
                <div 
                  id="nts-reports-scroll-container"
                  onScroll={e => {
                    const container = e.currentTarget;
                    const children = container.querySelectorAll('[id^="nts-report-"]');
                    let minDiff = Infinity;
                    let activeId = reportVehicleId;
                    children.forEach((child) => {
                      const htmlChild = child as HTMLElement;
                      const diff = Math.abs(htmlChild.offsetLeft - container.scrollLeft);
                      if (diff < minDiff) {
                        minDiff = diff;
                        activeId = htmlChild.id.replace('nts-report-', '');
                      }
                    });
                    if (activeId && activeId !== reportVehicleId) {
                      setReportVehicleId(activeId);
                    }
                  }}
                  className="relative flex overflow-x-auto gap-6 pb-6 scroll-smooth snap-x snap-mandatory scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent print:block print:overflow-visible print:pb-0"
                >
                  {vehicles.map(v => {
                    const isActive = v.id === reportVehicleId;
                    const carLogs = drivingLogs.filter(log => log.vehicleId === v.id && log.date.startsWith(reportYearMonth));
                    const totalCarDistance = carLogs.reduce((sum, x) => sum + x.distance, 0);
                    const totalCommuteDistance = carLogs.filter(log => log.purpose.includes('출퇴근')).reduce((sum, x) => sum + x.distance, 0);
                    const totalWorkDistance = carLogs.filter(log => !log.purpose.includes('출퇴근')).reduce((sum, x) => sum + x.distance, 0);
                    const totalTollAmount = getMonthExpensesTotal(v.id, reportYearMonth, 'toll');
                    const totalFuelAmount = getMonthExpensesTotal(v.id, reportYearMonth, 'fuel');

                    const insuranceInfo = v.insuranceCompany 
                      ? `${v.insuranceCompany}${v.insuranceAgent ? '/' + v.insuranceAgent : ''}${v.insuranceContact ? ' (' + v.insuranceContact + ')' : ''}` 
                      : '삼성화재/고상진 (010-3456-5432)';

                    return (
                      <div 
                        key={v.id}
                        id={`nts-report-${v.id}`}
                        className={`flex-none w-full max-w-5xl snap-center bg-white text-slate-900 p-5 sm:p-6 md:p-8 rounded-2xl shadow-xl border transition-all ${
                          isActive ? 'ring-2 ring-indigo-500 border-indigo-500/30' : 'opacity-70 border-slate-300 hover:opacity-100'
                        } print:border-none print:shadow-none print:p-0 print:block print:w-full print:max-w-none print:opacity-100 ${
                          isActive ? 'print:block' : 'print:hidden'
                        }`}
                      >
                        {/* 최상단 컨트롤바 (출력 및 엑셀) */}
                        <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-200 print:hidden">
                          <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-full border border-indigo-100">
                            {v.modelName} [{v.plateNumber}]
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleExportExcel(v)}
                              className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 hover:text-white border border-emerald-200 hover:bg-emerald-600 rounded-lg px-3 py-1.5 bg-emerald-50 transition-all shadow-sm cursor-pointer"
                            >
                              <FileSpreadsheet className="w-3.5 h-3.5" />
                              <span>엑셀 다운로드</span>
                            </button>
                            <button
                              onClick={() => {
                                setReportVehicleId(v.id);
                                handlePrintReport(v);
                              }}
                              className="flex items-center gap-1.5 text-[11px] font-semibold text-indigo-700 hover:text-white border border-indigo-200 hover:bg-indigo-600 rounded-lg px-3 py-1.5 bg-indigo-50 transition-all shadow-sm cursor-pointer"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              <span>PDF 다운로드 / 인쇄</span>
                            </button>
                          </div>
                        </div>

                        {/* 법정 양식 타이틀 및 사업자 정보 헤더 통합 테이블 */}
                        <div className="overflow-x-auto print:overflow-visible">
                          <table className="w-full border-collapse border border-slate-300 text-xs">
                            <tbody>
                              <tr>
                                <td className="w-[10%] bg-slate-50 border border-slate-300 p-2 font-bold text-center align-middle text-slate-700" rowSpan={2}>
                                  사업연도
                                </td>
                                <td className="w-[20%] border border-slate-300 p-2 text-center align-middle font-mono font-semibold text-slate-800" rowSpan={2}>
                                  {reportYearMonth.split('-')[0]}.01.01 ~ {reportYearMonth.split('-')[0]}.12.31
                                </td>
                                <td className="w-[40%] border border-slate-300 p-2 text-center align-middle text-lg font-bold tracking-widest text-slate-900" rowSpan={2}>
                                  업무용승용차 운행기록부
                                </td>
                                <td className="w-[12%] bg-slate-50 border border-slate-300 p-2 font-bold text-center text-slate-700">
                                  상호명
                                </td>
                                <td className="w-[18%] border border-slate-300 p-2 text-center font-semibold text-slate-800">
                                  {currentUser.companyName || '초이스커피'}
                                </td>
                              </tr>
                              <tr>
                                <td className="bg-slate-50 border border-slate-300 p-2 font-bold text-center text-slate-700">
                                  사업자등록번호
                                </td>
                                <td className="border border-slate-300 p-2 text-center font-mono text-slate-800">
                                  {currentUser.businessNumber || '207-16-23565'}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>

                        {/* 1. 기본정보 */}
                        <div className="text-left font-bold text-[13px] text-slate-800 bg-indigo-50/50 px-3 py-1.5 border-l-4 border-indigo-600 rounded-r mt-4">
                          1. 기본정보
                        </div>
                        <div className="overflow-x-auto print:overflow-visible mt-2">
                          <table className="w-full border-collapse border border-slate-300 text-xs text-center">
                            <thead>
                              <tr className="bg-slate-50 text-slate-700 font-bold">
                                <td className="border border-slate-300 p-2 w-[15%]">차종</td>
                                <td className="border border-slate-300 p-2 w-[15%]">자동차등록번호</td>
                                <td className="border border-slate-300 p-2 w-[35%]">자동차보험가입여부</td>
                                <td className="border border-slate-300 p-2 w-[10%]">임차여부</td>
                                <td className="border border-slate-300 p-2 w-[15%]">임차료</td>
                                <td className="border border-slate-300 p-2 w-[10%]">비고</td>
                              </tr>
                            </thead>
                            <tbody>
                              <tr className="text-slate-800">
                                <td className="border border-slate-300 p-2 font-medium">{v.modelName}</td>
                                <td className="border border-slate-300 p-2 font-bold font-mono">{v.plateNumber}</td>
                                <td className="border border-slate-300 p-2 text-left px-3">{insuranceInfo}</td>
                                <td className="border border-slate-300 p-2">{getRentalTypeKo(v.rentalType)}</td>
                                <td className="border border-slate-300 p-2 font-mono text-right pr-4 font-semibold">{v.rentalFee ? formatWon(v.rentalFee) : '0'}</td>
                                <td className="border border-slate-300 p-2 text-slate-400">{v.color || '-'}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>

                        {/* 2. 차량운행기록 내역 */}
                        <div className="text-left font-bold text-[13px] text-slate-800 bg-indigo-50/50 px-3 py-1.5 border-l-4 border-indigo-600 rounded-r mt-6">
                          2. 차량운행기록 내역
                        </div>
                        <div className="overflow-x-auto print:overflow-visible mt-2">
                          <table className="w-full text-left text-[11px] border-collapse border border-slate-300">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-300 text-center font-bold text-slate-700">
                                <th className="p-2 border border-slate-300 align-middle" rowSpan={2}>사용일자</th>
                                <th className="p-2 border border-slate-300" colSpan={2}>사용자</th>
                                <th className="p-2 border border-slate-300 align-middle" rowSpan={2}>사용목적</th>
                                <th className="p-2 border border-slate-300 align-middle" rowSpan={2}>출발지</th>
                                <th className="p-2 border-slate-300 align-middle" rowSpan={2}>출발지 주소</th>
                                <th className="p-2 border-slate-300 align-middle" rowSpan={2}>도착지</th>
                                <th className="p-2 border-slate-300 align-middle" rowSpan={2}>도착지 주소</th>
                                <th className="p-2 border-slate-300" colSpan={2}>사용거리(km)</th>
                                <th className="p-2 border-slate-300 align-middle" rowSpan={2}>통행료</th>
                                <th className="p-2 border-slate-300 align-middle" rowSpan={2}>연료비</th>
                                <th className="p-2 border-slate-300 align-middle" rowSpan={2}>프로젝트명</th>
                              </tr>
                              <tr className="bg-slate-50 border-b border-slate-300 text-center font-bold text-slate-700">
                                <th className="p-2 border border-slate-300">부서</th>
                                <th className="p-2 border border-slate-300">성명</th>
                                <th className="p-2 border border-slate-300">출·퇴근용</th>
                                <th className="p-2 border border-slate-300">일반업무용</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-300 text-center font-mono text-slate-800">
                              {(() => {
                                // [수정] 아래 엑셀 내보내기와 동일한 이유로, 같은 날짜의 두 번째
                                // 줄부터는 통행료/연료비를 비워서 하루 합계가 중복으로 반복
                                // 표시되지 않게 한다 (엑셀 내보내기 함수의 shownExpenseDates와
                                // 같은 방식).
                                const shownExpenseDates = new Set<string>();
                                return carLogs.map((log) => {
                                const isCommute = log.purpose.includes('출퇴근');
                                const distance = log.distance;
                                const isFirstRowForThisDate = !shownExpenseDates.has(log.date);
                                shownExpenseDates.add(log.date);
                                const tollVal = isFirstRowForThisDate ? getDayExpenses(v.id, log.date, 'toll') : 0;
                                const fuelVal = isFirstRowForThisDate ? getDayExpenses(v.id, log.date, 'fuel') : 0;

                                return (
                                  <tr key={log.id} className="hover:bg-slate-50 text-slate-800 text-center">
                                    <td className="p-2 border border-slate-300 font-semibold font-mono">{log.date}</td>
                                    <td className="p-2 border border-slate-300">{log.department || '-'}</td>
                                    <td className="p-2 border border-slate-300 font-sans">{log.driverName}</td>
                                    <td className="p-2 border border-slate-300 text-left px-2">{log.purpose}</td>
                                    <td className="p-2 border border-slate-300 text-left px-2">{log.startPlace || '-'}</td>
                                    <td className="p-2 border border-slate-300 text-left px-2 font-sans truncate max-w-[150px]" title={log.startAddress}>{log.startAddress || '-'}</td>
                                    <td className="p-2 border border-slate-300 text-left px-2">{log.endPlace || '-'}</td>
                                    <td className="p-2 border border-slate-300 text-left px-2 font-sans truncate max-w-[150px]" title={log.endAddress}>{log.endAddress || '-'}</td>
                                    <td className="p-2 border border-slate-300 text-right font-mono font-semibold pr-2 text-indigo-700 bg-indigo-50/10">
                                      {isCommute ? `${distance}.0` : '-'}
                                    </td>
                                    <td className="p-2 border border-slate-300 text-right font-mono font-semibold pr-2 text-emerald-700 bg-emerald-50/10">
                                      {!isCommute ? `${distance}.0` : '-'}
                                    </td>
                                    <td className="p-2 border border-slate-300 text-right font-mono pr-2 text-slate-700">
                                      {tollVal > 0 ? formatWon(tollVal) : '-'}
                                    </td>
                                    <td className="p-2 border border-slate-300 text-right font-mono pr-2 text-slate-700">
                                      {fuelVal > 0 ? formatWon(fuelVal) : '-'}
                                    </td>
                                    <td className="p-2 border border-slate-300 text-left px-2 truncate max-w-[100px] text-slate-400" title={log.projectName}>{log.projectName || '-'}</td>
                                  </tr>
                                );
                                });
                              })()}

                              {/* 데이터가 비었을 때 빈 칸 채우기 */}
                              {carLogs.length === 0 && (
                                <tr>
                                  <td colSpan={13} className="p-10 text-center text-slate-500 font-sans">
                                    해당 월에 기록된 주행 로그가 존재하지 않습니다.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                            
                            {/* 누적 합계 행 */}
                            <tfoot>
                              <tr className="bg-yellow-100/50 font-bold border-t border-slate-300 text-center text-slate-800">
                                <td colSpan={8} className="p-3 border border-slate-300 text-center text-[12px]">합계</td>
                                <td className="p-3 border border-slate-300 text-right text-indigo-700 font-mono pr-2">
                                  {totalCommuteDistance > 0 ? `${totalCommuteDistance}.0` : '0.0'}
                                </td>
                                <td className="p-3 border border-slate-300 text-right text-emerald-700 font-mono pr-2">
                                  {totalWorkDistance > 0 ? `${totalWorkDistance}.0` : '0.0'}
                                </td>
                                <td className="p-3 border border-slate-300 text-right font-mono pr-2 text-slate-900">
                                  {totalTollAmount > 0 ? formatWon(totalTollAmount) : '0'}
                                </td>
                                <td className="p-3 border border-slate-300 text-right font-mono pr-2 text-slate-900">
                                  {totalFuelAmount > 0 ? formatWon(totalFuelAmount) : '0'}
                                </td>
                                <td className="p-3 border border-slate-300"></td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>

                        {/* 법적 동의 및 서명부 */}
                        <div className="mt-8 flex flex-col sm:flex-row justify-between sm:items-center gap-2 text-[11px] text-slate-400 font-sans border-t border-slate-200 pt-4">
                          <p>※ 소득세법 시행령 제78조의3에 따른 업무용승용차 운행기록부 / 출·퇴근용 + 일반업무용 = 업무사용거리</p>
                          <div className="flex gap-4 self-end sm:self-auto">
                            <span>작성인/대표자: <span className="underline font-bold text-slate-800">{currentUser.name}</span> (인/서명)</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* 7. 지출·운행 분석 (Analysis Tab - SVG 기반 dynamic dashboard) */}
      {activeSubTab === 'analysis' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* 1. 차량별 지출 비중 (가로형 막대그래프) */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
              <h3 className="text-xs font-bold text-slate-700">🚗 차량별 누적 지출 전산 비중 (KRW)</h3>
              
              {vehicles.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">데이터가 부족합니다.</div>
              ) : (
                <div className="space-y-4 pt-2">
                  {vehicles.map(v => {
                    const carExpense = expenses.filter(e => e.vehicleId === v.id).reduce((sum, e) => sum + e.amount, 0);
                    const totalAllExpense = totalExpenseSum || 1;
                    const percentage = Math.round((carExpense / totalAllExpense) * 100);

                    return (
                      <div key={v.id} className="space-y-1 text-xs">
                        <div className="flex justify-between text-[11px]">
                          <span className="font-semibold text-slate-600">{v.modelName} ({v.plateNumber})</span>
                          <span className="font-bold font-mono text-indigo-400">{formatWon(carExpense)} 원 ({percentage}%)</span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-slate-50 overflow-hidden border border-slate-200">
                          <div 
                            className="bg-gradient-to-r from-indigo-500 to-indigo-400 h-full rounded-full"
                            style={{ width: `${Math.max(percentage, 2)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 2. 지출 카테고리별 비중 (도넛형 간이 수치 리포트) */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
              <h3 className="text-xs font-bold text-slate-700">💳 경비 지출 분류 항목 비율</h3>

              {expenses.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">비용 정산 내역이 없습니다.</div>
              ) : (
                <div className="space-y-3 pt-2">
                  {(['fuel', 'toll', 'parking', 'maintenance', 'tax_insurance', 'other'] as const).map(cat => {
                    const catAmount = expenses.filter(e => e.category === cat).reduce((sum, e) => sum + e.amount, 0);
                    const percentage = Math.round((catAmount / (totalExpenseSum || 1)) * 100);

                    if (catAmount === 0) return null;

                    return (
                      <div key={cat} className="flex items-center justify-between text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                        <span className="font-medium text-slate-600">{getCategoryKo(cat)}</span>
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-slate-500">{percentage}%</span>
                          <span className="font-bold text-slate-800 font-mono">{formatWon(catAmount)} 원</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 3. 차량별 주행 효율 (누적거리당 비용 등 종합 리포트) */}
            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
              <h3 className="text-xs font-bold text-slate-700">📈 보유 차량 전산 자산 효율 비교</h3>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-600 border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                      <th className="p-3">차량</th>
                      <th className="p-3 text-center">총 운행 횟수</th>
                      <th className="p-3 text-right">총 주행거리 (km)</th>
                      <th className="p-3 text-right">정비 횟수</th>
                      <th className="p-3 text-right">총 유지 지출 (원)</th>
                      <th className="p-3 text-right">km당 평균 유지비</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-mono">
                    {vehicles.map(v => {
                      const carLogs = drivingLogs.filter(log => log.vehicleId === v.id);
                      const totalCarDistance = carLogs.reduce((sum, log) => sum + log.distance, 0);
                      const totalCarExpense = expenses.filter(e => e.vehicleId === v.id).reduce((sum, e) => sum + e.amount, 0);
                      const maintCount = maintenances.filter(m => m.vehicleId === v.id && m.status === 'completed').length;
                      const costPerKm = totalCarDistance > 0 ? Math.round(totalCarExpense / totalCarDistance) : 0;

                      return (
                        <tr key={v.id} className="hover:bg-slate-100">
                          <td className="p-3 font-semibold text-slate-800 font-sans">{v.modelName} ({v.plateNumber})</td>
                          <td className="p-3 text-center">{carLogs.length}회</td>
                          <td className="p-3 text-right font-bold text-indigo-400">{totalCarDistance} km</td>
                          <td className="p-3 text-right">{maintCount}건</td>
                          <td className="p-3 text-right text-amber-400">{formatWon(totalCarExpense)} 원</td>
                          <td className="p-3 text-right font-semibold text-slate-600">
                            {costPerKm > 0 ? `${formatWon(costPerKm)} 원/km` : '0 원 (주행거리 없음)'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* 8. 기 등록 차량 정보 수정 오버레이 모달 (임차/보험/비콘 완벽 제어) */}
      {/* ========================================== */}
      {editingVehicle && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 w-full max-w-4xl rounded-2xl p-6 shadow-2xl space-y-6 my-8 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <Car className="w-4 h-4 text-indigo-400" />
                <span>차량 기 등록 정보 수정 및 보완</span>
              </h3>
              <button 
                type="button" 
                onClick={() => setEditingVehicle(null)} 
                className="text-xs text-slate-400 hover:text-slate-600"
              >
                닫기
              </button>
            </div>

            <form onSubmit={handleUpdateVehicle} className="space-y-6">
              {/* 세션 1: 기본 제원 정보 */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-indigo-400 flex items-center gap-1">
                  <span>•</span> 기본 제원 및 연식 정보
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-500">차량 모델명 *</label>
                    <input 
                      type="text" 
                      value={editingVehicle.modelName}
                      onChange={e => setEditingVehicle({ ...editingVehicle, modelName: e.target.value })}
                      className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-500">차량 등록 번호 *</label>
                    <input 
                      type="text" 
                      value={editingVehicle.plateNumber}
                      onChange={e => setEditingVehicle({ ...editingVehicle, plateNumber: e.target.value })}
                      className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-500">기본 유종 *</label>
                    <select 
                      value={editingVehicle.fuelType}
                      onChange={e => setEditingVehicle({ ...editingVehicle, fuelType: e.target.value as any })}
                      className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none text-slate-600"
                    >
                      <option value="gasoline">가솔린 (휘발유)</option>
                      <option value="diesel">디젤 (경유)</option>
                      <option value="hybrid">하이브리드</option>
                      <option value="electric">전기</option>
                      <option value="lpg">LPG</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-500">제조 년식</label>
                    <input 
                      type="text" 
                      value={editingVehicle.modelYear || ''}
                      placeholder="예: 2024년식"
                      onChange={e => setEditingVehicle({ ...editingVehicle, modelYear: e.target.value })}
                      className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-500">색상</label>
                    <input 
                      type="text" 
                      value={editingVehicle.color || ''}
                      placeholder="예: 미드나잇 블루"
                      onChange={e => setEditingVehicle({ ...editingVehicle, color: e.target.value })}
                      className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-500">전담 관리 사원</label>
                    <input 
                      type="text" 
                      value={editingVehicle.owner}
                      onChange={e => setEditingVehicle({ ...editingVehicle, owner: e.target.value })}
                      className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-500">구입 계약 일자</label>
                    <input 
                      type="date" 
                      value={editingVehicle.purchaseDate}
                      onChange={e => setEditingVehicle({ ...editingVehicle, purchaseDate: e.target.value })}
                      className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none text-slate-600"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-500">운행 허용 상태</label>
                    <select 
                      value={editingVehicle.status}
                      onChange={e => setEditingVehicle({ ...editingVehicle, status: e.target.value as any })}
                      className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none text-slate-600"
                    >
                      <option value="active">운행 가능</option>
                      <option value="maintenance">정비 수리중</option>
                      <option value="retired">운행 중단</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* 세션 2: 임차 정보 */}
              <div className="space-y-3 pt-2 border-t border-slate-200">
                <h4 className="text-xs font-semibold text-indigo-400 flex items-center gap-1">
                  <span>•</span> 자산 임차 형태 및 금융비용
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-500">임차 구분</label>
                    <select 
                      value={editingVehicle.rentalType || 'own'}
                      onChange={e => setEditingVehicle({ ...editingVehicle, rentalType: e.target.value as any })}
                      className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none text-slate-600"
                    >
                      <option value="own">자가 (소유 자산)</option>
                      <option value="long_rent">장기렌트</option>
                      <option value="lease">운용리스 / 금융리스</option>
                      <option value="short_rent">단기렌트</option>
                      <option value="short_lease">단기리스</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-500">월 임차 비용 (원화 금액)</label>
                    <input 
                      type="text" 
                      inputMode="numeric"
                      value={editingVehicle.rentalFee ? formatCurrencyInput(editingVehicle.rentalFee) : ''}
                      placeholder="예: 750,000"
                      onChange={e => setEditingVehicle({ ...editingVehicle, rentalFee: parseCurrencyInput(e.target.value) })}
                      className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* 세션 3: 법인 보험 계약 정보 */}
              <div className="space-y-3 pt-2 border-t border-slate-200">
                <h4 className="text-xs font-semibold text-indigo-400 flex items-center gap-1">
                  <span>•</span> 가입 법인 보험 계약 세부사항
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-500">법인 자동차 보험사</label>
                    <input 
                      type="text" 
                      value={editingVehicle.insuranceCompany || ''}
                      placeholder="예: 현대해상 다이렉트"
                      onChange={e => setEditingVehicle({ ...editingVehicle, insuranceCompany: e.target.value })}
                      className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-500">보험 가입일자</label>
                    <input 
                      type="date" 
                      value={editingVehicle.insuranceStartDate || ''}
                      onChange={e => setEditingVehicle({ ...editingVehicle, insuranceStartDate: e.target.value })}
                      className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none text-slate-600"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-500">보험 만기일자</label>
                    <input 
                      type="date" 
                      value={editingVehicle.insuranceEndDate || ''}
                      onChange={e => setEditingVehicle({ ...editingVehicle, insuranceEndDate: e.target.value })}
                      className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none text-slate-600"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-500">보험 계약 담당자</label>
                    <input 
                      type="text" 
                      value={editingVehicle.insuranceAgent || ''}
                      placeholder="예: 홍길동 과장"
                      onChange={e => setEditingVehicle({ ...editingVehicle, insuranceAgent: e.target.value })}
                      className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-4">
                    <label className="text-xs text-slate-500">보험 지점 연락처</label>
                    <input 
                      type="text" 
                      value={editingVehicle.insuranceContact || ''}
                      placeholder="예: 02-1234-5678"
                      onChange={e => setEditingVehicle({ ...editingVehicle, insuranceContact: e.target.value })}
                      className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* 세션 4: 비콘 ID 정보 */}
              <div className="space-y-3 pt-2 border-t border-slate-200">
                <h4 className="text-xs font-semibold text-indigo-400 flex items-center gap-1">
                  <span>•</span> 비콘 ID 단말기 정보
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="text-xs text-slate-500">비콘 ID (자동 운행 기록 센서)</label>
                    <input 
                      type="text" 
                      value={editingVehicle.beaconId || ''}
                      placeholder="예: BCON-ABC-123"
                      onChange={e => setEditingVehicle({ ...editingVehicle, beaconId: e.target.value })}
                      className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* 세션 5: 등록증 사본 업데이트 */}
              <div className="space-y-3 pt-2 border-t border-slate-200">
                <h4 className="text-xs font-semibold text-indigo-400 flex items-center gap-1">
                  <span>•</span> 자동차 등록증 첨부 서류 변경
                </h4>
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="text-left">
                    <p className="text-xs font-bold text-slate-700">기존 첨부문서 대체 / 신규 업로드</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">새 이미지나 PDF를 첨부하면 기 보관 중이던 등록증 원본 사본이 실시간 갱신됩니다.</p>
                  </div>
                  <div className="flex items-center gap-3 w-full sm:w-auto">
                    <input 
                      type="file" 
                      accept="image/*,application/pdf"
                      id="edit-reg-doc-upload"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            setEditingVehicle(prev => prev ? { ...prev, registrationDocumentUrl: reader.result as string } : null);
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                    <label 
                      htmlFor="edit-reg-doc-upload"
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200 hover:border-slate-600 rounded-lg text-xs font-semibold cursor-pointer transition-all whitespace-nowrap"
                    >
                      새 파일 교체하기
                    </label>
                    {editingVehicle.registrationDocumentUrl ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> 서류 등록됨
                        </span>
                        <button 
                          type="button"
                          onClick={() => setEditingVehicle({ ...editingVehicle, registrationDocumentUrl: '' })}
                          className="text-[10px] text-rose-400 hover:underline"
                        >
                          삭제
                        </button>
                      </div>
                    ) : (
                      <span className="text-[10px] text-slate-400">등록된 서류 없음</span>
                    )}
                  </div>
                </div>
              </div>

              {/* 하단 제어 대기열 */}
              <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-200">
                <button 
                  type="button"
                  onClick={() => setEditingVehicle(null)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold text-xs py-2 px-4 rounded-lg transition-all"
                >
                  수정 취소
                </button>
                <button 
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs py-2 px-5 rounded-lg transition-all"
                >
                  기 등록 정보 보완 저장
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* [수정] 영수증 썸네일 확대보기 라이트박스 */}
      {enlargedReceiptUrl && (
        <div
          className="fixed inset-0 bg-slate-900/85 backdrop-blur-md z-[110] flex items-center justify-center p-4"
          onClick={() => setEnlargedReceiptUrl(null)}
        >
          <button
            onClick={() => setEnlargedReceiptUrl(null)}
            className="absolute top-4 right-4 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold border border-slate-200 transition-all"
          >
            닫기
          </button>
          <img
            src={enlargedReceiptUrl}
            alt="영수증 확대보기"
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl border border-slate-200"
          />
        </div>
      )}

      {/* ========================================== */}
      {/* 9. 자동차 등록증 원본 뷰어 라이트박스 오버레이 모달 */}
      {/* ========================================== */}
      {viewDocUrl && (
        <div className="fixed inset-0 bg-slate-900/85 backdrop-blur-md z-[100] flex flex-col items-center justify-center p-4">
          <div className="absolute top-4 right-4 flex items-center gap-3">
            <a 
              href={viewDocUrl}
              download={viewDocUrl.startsWith('data:application/pdf') ? 'car_registration.pdf' : 'car_registration.png'}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 shadow"
            >
              <Download className="w-3.5 h-3.5" /> 원본 다운로드
            </a>
            <button 
              onClick={() => {
                const printWin = window.open('');
                if (printWin) {
                  if (viewDocUrl.startsWith('data:application/pdf')) {
                    printWin.document.write(`<embed src="${viewDocUrl}" type="application/pdf" style="width:100%;height:100%" />`);
                  } else {
                    printWin.document.write(`<img src="${viewDocUrl}" style="max-width:100%" />`);
                  }
                  printWin.document.close();
                  printWin.print();
                }
              }}
              className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 hover:border-slate-300 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 shadow"
            >
              <Printer className="w-3.5 h-3.5" /> 인쇄하기
            </button>
            <button 
              onClick={() => setViewDocUrl(null)}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold border border-slate-200 transition-all"
            >
              닫기
            </button>
          </div>
          
          <div className="w-full max-w-4xl h-[78vh] flex flex-col items-center justify-center space-y-3">
            {viewDocUrl.startsWith('data:application/pdf') ? (
              <iframe 
                src={viewDocUrl} 
                title="자동차 등록증 원본 PDF"
                className="w-full h-full rounded-xl bg-white shadow-2xl border border-slate-200"
              />
            ) : (
              <img 
                src={viewDocUrl} 
                alt="자동차 등록증 기 저장 원본 이미지" 
                className="max-w-full max-h-full object-contain rounded-xl shadow-2xl border border-slate-200"
                referrerPolicy="no-referrer"
              />
            )}
            <p className="text-[11px] text-slate-500 font-medium text-center">로컬 브라우저 세션 스토리지에 세무 전산 증빙용으로 격리 보관 중인 {viewDocUrl.startsWith('data:application/pdf') ? 'PDF 서류' : '이미지'} 원본입니다.</p>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* 10. 차량 상세 통계 및 타임라인 히스토리 모달 */}
      {/* ========================================== */}
      {selectedStatsVehicle && (() => {
        const v = selectedStatsVehicle;
        const carLogs = drivingLogs.filter(log => log.vehicleId === v.id);
        const totalCarDistance = carLogs.reduce((sum, log) => sum + log.distance, 0);
        
        const carExpenses = expenses.filter(e => e.vehicleId === v.id);
        const totalCarExpense = carExpenses
          .filter(e => e.category !== 'maintenance')
          .reduce((sum, e) => sum + e.amount, 0);

        const totalMaintExpense = carExpenses
          .filter(e => e.category === 'maintenance')
          .reduce((sum, e) => sum + e.amount, 0) + 
          maintenances
            .filter(m => m.vehicleId === v.id)
            .reduce((sum, m) => sum + m.cost, 0);

        // 타임라인 이벤트 통합
        const drivingEvents = carLogs.map(log => ({
          id: log.id,
          type: 'driving' as const,
          date: log.date,
          title: `운행 - ${log.purpose} (${log.distance.toFixed(1)}km)`,
          sub: log.startPlace && log.endPlace ? `${log.startPlace} → ${log.endPlace}` : '',
          amount: null,
          createdAt: log.createdAt || log.date
        }));

        const expenseEvents = carExpenses.map(exp => ({
          id: exp.id,
          type: 'expense' as const,
          date: exp.date,
          title: `${getCategoryKo(exp.category)} - ${formatWon(exp.amount)}원`,
          sub: exp.memo || '',
          amount: exp.amount,
          createdAt: exp.createdAt || exp.date
        }));

        const maintenanceEvents = maintenances
          .filter(m => m.vehicleId === v.id)
          .map(m => ({
            id: m.id,
            type: 'maintenance' as const,
            date: m.date,
            title: `정비 - ${m.title} (${formatWon(m.cost)}원)`,
            sub: [m.shopName, m.memo].filter(Boolean).join(' | '),
            amount: m.cost,
            createdAt: m.createdAt || m.date
          }));

        const allEvents = [...drivingEvents, ...expenseEvents, ...maintenanceEvents].sort((a, b) => {
          const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
          if (dateDiff !== 0) return dateDiff;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });

        return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-scale-in">
              {/* Modal Header */}
              <div className="p-5 border-b border-slate-200 flex justify-between items-start">
                <div>
                  <h2 className="text-xl font-bold text-slate-800">{v.modelName}</h2>
                  <p className="text-xs text-indigo-400 font-mono mt-0.5">{v.plateNumber}</p>
                </div>
                <button 
                  onClick={() => setSelectedStatsVehicle(null)}
                  className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Content - Scrollable */}
              <div className="p-6 overflow-y-auto space-y-6 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
                {/* 2x2 Grid of Stat Cards */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-blue-600 p-4 rounded-xl space-y-2">
                    <span className="text-[11px] text-white/80 font-semibold block">총 운행기록</span>
                    <p className="text-lg font-bold text-white">{carLogs.length}건</p>
                  </div>
                  <div className="bg-emerald-500 p-4 rounded-xl space-y-2">
                    <span className="text-[11px] text-white/80 font-semibold block">총 누적거리</span>
                    <p className="text-lg font-bold text-white">{formatWon(v.currentMileage || 0)} km</p>
                  </div>
                  <div className="bg-amber-500 p-4 rounded-xl space-y-2">
                    <span className="text-[11px] text-white/80 font-semibold block">총 지출비용</span>
                    <p className="text-lg font-bold text-white">{formatWon(totalCarExpense)}원</p>
                  </div>
                  <div className="bg-purple-500 p-4 rounded-xl space-y-2">
                    <span className="text-[11px] text-white/80 font-semibold block">총 정비비용</span>
                    <p className="text-lg font-bold text-white">{formatWon(totalMaintExpense)}원</p>
                  </div>
                </div>

                {/* Timeline History Section */}
                <div className="space-y-4 pt-2">
                  <h3 className="text-sm font-bold text-slate-800">타임라인 히스토리</h3>
                  
                  {allEvents.length === 0 ? (
                    <div className="bg-slate-50/20 border border-dashed border-slate-200 py-10 rounded-xl text-center text-slate-400 text-xs">
                      이 차량의 최근 운행, 지출 또는 정비 기록이 존재하지 않습니다.
                    </div>
                  ) : (
                    <div className="relative border-l-2 border-slate-200 ml-3 pl-6 space-y-6">
                      {allEvents.map((event) => {
                        let badgeColor = '';
                        let badgeText = '';
                        if (event.type === 'driving') {
                          badgeColor = 'bg-indigo-950/40 text-indigo-400 border border-indigo-900/40';
                          badgeText = '운행';
                        } else if (event.type === 'expense') {
                          badgeColor = 'bg-amber-950/40 text-amber-400 border border-amber-900/40';
                          badgeText = '비용';
                        } else {
                          badgeColor = 'bg-rose-950/40 text-rose-400 border border-rose-900/40';
                          badgeText = '정비';
                        }

                        // formatting date to 'YYYY. M. D.'
                        let formattedDate = event.date;
                        try {
                          const parsed = new Date(event.date);
                          if (!isNaN(parsed.getTime())) {
                            formattedDate = parsed.toLocaleDateString('ko-KR');
                          }
                        } catch (_) {}

                        return (
                          <div key={event.id} className="relative group">
                            {/* Timeline Dot */}
                            <div className="absolute -left-[32px] top-1.5 w-3 h-3 rounded-full border border-slate-200 bg-indigo-500 group-hover:scale-110 transition-transform"></div>

                            <div className="bg-slate-50/30 border border-slate-200 hover:border-slate-200 p-4 rounded-xl flex flex-col md:flex-row md:items-center md:justify-between gap-3 shadow-sm transition-all">
                              <div className="space-y-1 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${badgeColor}`}>
                                    {badgeText}
                                  </span>
                                  <span className="text-xs text-slate-500 font-mono">{formattedDate}</span>
                                </div>
                                <p className="text-xs font-semibold text-slate-700">{event.title}</p>
                                {event.sub && (
                                  <p className="text-[11px] text-slate-400 font-normal leading-relaxed">{event.sub}</p>
                                )}
                              </div>

                              {event.amount && event.amount > 0 && (
                                <div className="text-right flex md:flex-col justify-between md:justify-center items-center md:items-end border-t md:border-t-0 border-slate-200/60 pt-2 md:pt-0">
                                  <span className="text-[10px] text-slate-400 md:hidden">금액</span>
                                  <span className="text-xs font-bold text-rose-400 font-mono">
                                    {formatWon(event.amount)}원
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-4 border-t border-slate-200 bg-white flex justify-end">
                <button 
                  onClick={() => setSelectedStatsVehicle(null)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold text-xs py-2 px-5 rounded-lg transition-all"
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ========================================== */}
      {/* 11. 운행일지 수정 모달 오버레이 */}
      {/* ========================================== */}
      {editingDriving && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-scale-in">
            <div className="p-5 border-b border-slate-200 flex justify-between items-start">
              <div>
                <h2 className="text-base font-bold text-slate-800">운행 기록 수정 보완</h2>
                <p className="text-xs text-slate-500 mt-0.5">운행 기록의 누락된 상세 정보나 주소를 갱신하세요.</p>
              </div>
              <button 
                onClick={() => setEditingDriving(null)}
                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <form onSubmit={handleUpdateDriving} className="p-5 overflow-y-auto space-y-4 flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500">운전자명 *</label>
                  <input 
                    type="text" 
                    value={editingDriving.driverName}
                    onChange={e => setEditingDriving({ ...editingDriving, driverName: e.target.value })}
                    onBlur={e => {
                      const trimmed = e.target.value.trim();
                      if (!trimmed) return;
                      const matches = drivingLogs
                        .filter((log) => log.driverName === trimmed && log.department && log.id !== editingDriving.id)
                        .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
                      const dept = matches[0]?.department;
                      if (dept) setEditingDriving((prev) => prev ? { ...prev, department: dept } : prev);
                    }}
                    className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500">부서명</label>
                  <input 
                    type="text" 
                    value={editingDriving.department || ''}
                    onChange={e => setEditingDriving({ ...editingDriving, department: e.target.value })}
                    className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500">연동 프로젝트</label>
                  <select 
                    value={editingDriving.projectName || ''}
                    onChange={e => setEditingDriving({ ...editingDriving, projectName: e.target.value })}
                    className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none text-slate-600"
                  >
                    <option value="">연동 안함</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.name}>{p.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500">운행 일자</label>
                  <input 
                    type="date" 
                    value={editingDriving.date}
                    onChange={e => setEditingDriving({ ...editingDriving, date: e.target.value })}
                    className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none text-slate-600"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500">출발 전 계기판 (km) *</label>
                  <input 
                    type="number" 
                    value={editingDriving.startMileage === 0 ? '' : editingDriving.startMileage}
                    onChange={e => setEditingDriving({ ...editingDriving, startMileage: Number(e.target.value) })}
                    className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none font-mono"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500">도착 후 계기판 (km) *</label>
                  <input 
                    type="number" 
                    value={editingDriving.endMileage === 0 ? '' : editingDriving.endMileage}
                    onChange={e => setEditingDriving({ ...editingDriving, endMileage: Number(e.target.value) })}
                    className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none font-mono"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500">출발지 상호명</label>
                  <input 
                    type="text" 
                    value={editingDriving.startPlace}
                    onChange={e => setEditingDriving({ ...editingDriving, startPlace: e.target.value })}
                    className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none"
                  />
                  {editingDriving.startPlace.trim().length > 0 && (() => {
                    const matches = contacts.filter(c => c.company && c.address && c.company.toLowerCase().includes(editingDriving.startPlace.trim().toLowerCase())).slice(0, 3);
                    const options = matches.flatMap(c => [
                      { key: `${c.id}-1`, label: c.address2 ? `${c.company} (주소1)` : c.company, address: c.address! },
                      ...(c.address2 ? [{ key: `${c.id}-2`, label: `${c.company} (주소2)`, address: c.address2 }] : [])
                    ]);
                    return options.length > 0 ? (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {options.map(opt => (
                          <button
                            key={opt.key}
                            type="button"
                            onClick={() => setEditingDriving({ ...editingDriving, startPlace: opt.label.replace(/\s*\(주소[12]\)$/, ''), startAddress: opt.address })}
                            className="bg-indigo-50 text-[10px] text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-200 hover:bg-indigo-600 hover:text-white hover:border-indigo-500"
                            title={opt.address}
                          >
                            🏢 {opt.label} 주소로 채우기
                          </button>
                        ))}
                      </div>
                    ) : null;
                  })()}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500">출발지 주소</label>
                  <input 
                    type="text" 
                    value={editingDriving.startAddress || ''}
                    onChange={e => setEditingDriving({ ...editingDriving, startAddress: e.target.value })}
                    className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500">목적지 상호명 *</label>
                  <input 
                    type="text" 
                    value={editingDriving.endPlace}
                    onChange={e => setEditingDriving({ ...editingDriving, endPlace: e.target.value })}
                    className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none"
                    required
                  />
                  {editingDriving.endPlace.trim().length > 0 && (() => {
                    const matches = contacts.filter(c => c.company && c.address && c.company.toLowerCase().includes(editingDriving.endPlace.trim().toLowerCase())).slice(0, 3);
                    const options = matches.flatMap(c => [
                      { key: `${c.id}-1`, label: c.address2 ? `${c.company} (주소1)` : c.company, address: c.address! },
                      ...(c.address2 ? [{ key: `${c.id}-2`, label: `${c.company} (주소2)`, address: c.address2 }] : [])
                    ]);
                    return options.length > 0 ? (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {options.map(opt => (
                          <button
                            key={opt.key}
                            type="button"
                            onClick={() => setEditingDriving({ ...editingDriving, endPlace: opt.label.replace(/\s*\(주소[12]\)$/, ''), endAddress: opt.address })}
                            className="bg-indigo-50 text-[10px] text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-200 hover:bg-indigo-600 hover:text-white hover:border-indigo-500"
                            title={opt.address}
                          >
                            🏢 {opt.label} 주소로 채우기
                          </button>
                        ))}
                      </div>
                    ) : null;
                  })()}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500">목적지 주소</label>
                  <input 
                    type="text" 
                    value={editingDriving.endAddress || ''}
                    onChange={e => setEditingDriving({ ...editingDriving, endAddress: e.target.value })}
                    className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-2 space-y-1.5">
                  <label className="text-xs text-slate-500">운행 목적 *</label>
                  <input 
                    type="text" 
                    value={editingDriving.purpose}
                    onChange={e => setEditingDriving({ ...editingDriving, purpose: e.target.value })}
                    className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none"
                    required
                  />
                </div>

                <div className="sm:col-span-2 space-y-1.5">
                  <label className="text-xs text-slate-500">메모란</label>
                  <textarea 
                    rows={2}
                    value={editingDriving.memo || ''}
                    onChange={e => setEditingDriving({ ...editingDriving, memo: e.target.value })}
                    className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none text-slate-600 resize-none"
                  />
                </div>

                <div className="sm:col-span-2 space-y-1.5">
                  <label className="text-xs text-slate-500 block font-semibold text-indigo-400">연관 거래처 담당자</label>
                  <ContactSearchSelect
                    contacts={contacts}
                    value={editingDriving.contactId || ''}
                    onChange={(id) => setEditingDriving({ ...editingDriving, contactId: id })}
                  />
                </div>

                {/* [추가] 이 운행기록에 연결된 영수증(통행료/주차비/식대 등)을 여기서도 볼 수 있고,
                새로 촬영해서 추가할 수 있다. 신규 작성 화면에서 못 찍었거나 나중에 생긴 영수증을
                등록/수정 뒤에도 놓치지 않도록 하기 위함이다. */}
                <div className="sm:col-span-2 space-y-2 pt-2 border-t border-slate-200">
                  <label className="text-xs text-slate-500 block font-semibold text-emerald-500">이 운행에 연결된 영수증</label>
                  <button
                    type="button"
                    onClick={() => setReceiptCameraTarget('driving-edit')}
                    disabled={isScanningEditReceipt}
                    className="w-full flex items-center justify-center gap-1.5 border border-dashed border-slate-200 rounded-xl py-2.5 hover:border-emerald-500 text-slate-400 hover:text-emerald-400 text-xs font-semibold transition-colors disabled:opacity-50"
                  >
                    <Camera className="w-4 h-4" />
                    <span>{isScanningEditReceipt ? '영수증 스캔 및 저장 중...' : '영수증 추가로 촬영 (촬영 즉시 저장됨)'}</span>
                  </button>

                  {(() => {
                    const linkedReceipts = expenses.filter((e) => e.drivingLogId === editingDriving.id);
                    if (linkedReceipts.length === 0) {
                      return <p className="text-[11px] text-slate-400 text-center py-2">아직 연결된 영수증이 없습니다.</p>;
                    }
                    return (
                      <div className="space-y-1.5">
                        {linkedReceipts.map((exp) => (
                          <div key={exp.id} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                            {exp.receiptImage && (
                              <img
                                src={exp.receiptImage}
                                alt="영수증"
                                onClick={() => setEnlargedReceiptUrl(exp.receiptImage!)}
                                className="w-10 h-10 rounded-lg object-cover border border-slate-200 shrink-0 cursor-pointer hover:opacity-80"
                              />
                            )}
                            <div className="min-w-0 flex-1 text-xs">
                              <p className="font-semibold text-slate-700 truncate">{exp.merchantName || '상호명 미상'} · {formatCurrencyInput(exp.amount)}원</p>
                              <p className="text-[10px] text-slate-400">{exp.category === 'toll' ? '통행료' : exp.category === 'parking' ? '주차비' : exp.category === 'meal' ? '식대' : exp.category === 'beverage' ? '음료' : exp.category === 'fuel' ? '주유비' : '기타'}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDeleteEditingReceipt(exp.id)}
                              title="이 영수증 삭제"
                              className="text-rose-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 shrink-0"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-200">
                <button 
                  type="button"
                  onClick={() => setEditingDriving(null)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold text-xs py-2 px-4 rounded-lg transition-all"
                >
                  수정 취소
                </button>
                <button 
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs py-2 px-5 rounded-lg transition-all"
                >
                  운행기록 보완 저장
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* 12. 비용 지출 수정 모달 오버레이 */}
      {/* ========================================== */}
      {editingExpense && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-scale-in">
            <div className="p-5 border-b border-slate-200 flex justify-between items-start">
              <div>
                <h2 className="text-base font-bold text-slate-800">지출 비용 내역 수정</h2>
                <p className="text-xs text-slate-500 mt-0.5">상호명, 유량, 수단 등의 결제 상세 정보를 수정합니다.</p>
              </div>
              <button 
                onClick={() => setEditingExpense(null)}
                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <form onSubmit={handleUpdateExpense} className="p-5 space-y-4 overflow-y-auto flex-1">
              <div className="space-y-4">
                {/* [수정] 등록할 때 스캔한 영수증 사진이 수정 화면에는 안 보이던 문제 - 여기에 썸네일로 표시 */}
                {editingExpense.receiptImage && (
                  <div className="flex items-center gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                    <img
                      src={editingExpense.receiptImage}
                      alt="영수증"
                      onClick={() => setEnlargedReceiptUrl(editingExpense.receiptImage!)}
                      className="w-12 h-12 rounded-lg object-cover border border-slate-200 shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                    />
                    <span className="text-[11px] text-slate-500">등록된 영수증 (눌러서 크게 보기)</span>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500">지출 일자</label>
                  <input 
                    type="date" 
                    value={editingExpense.date}
                    onChange={e => setEditingExpense({ ...editingExpense, date: e.target.value })}
                    className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none text-slate-600"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500">결제 수단 *</label>
                  <select 
                    value={editingExpense.payMethod || 'company_card'}
                    onChange={e => setEditingExpense({ ...editingExpense, payMethod: e.target.value as any })}
                    className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none text-slate-600"
                  >
                    <option value="company_card">법인(회사)카드</option>
                    <option value="personal_card">개인카드</option>
                    <option value="cash">현금</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500">비용 카테고리 *</label>
                  <select 
                    value={editingExpense.category}
                    onChange={e => setEditingExpense({ ...editingExpense, category: e.target.value as any })}
                    className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none text-slate-600"
                  >
                    <option value="fuel">주유비 (유류대)</option>
                    <option value="toll">통행료 (하이패스)</option>
                    <option value="parking">주차비</option>
                    <option value="maintenance">수리 및 정비비</option>
                    <option value="tax_insurance">세금 및 자동차 보험</option>
                    <option value="designated_drive">대리운전비</option>
                    <option value="beverage">음료</option>
                    <option value="meal">식대</option>
                    <option value="supplies">물품 구입</option>
                    <option value="custom">직접 입력 (커스텀)</option>
                    <option value="other">기타 실비</option>
                  </select>
                </div>

                {editingExpense.category === 'custom' && (
                  <div className="space-y-1.5">
                    <label className="text-xs text-indigo-400 font-semibold">비용 카테고리 직접 입력 *</label>
                    <input 
                      type="text" 
                      value={editingExpense.categoryCustom || ''}
                      onChange={e => setEditingExpense({ ...editingExpense, categoryCustom: e.target.value })}
                      className="w-full bg-slate-50 text-xs border border-indigo-900/40 rounded-lg p-2 focus:border-indigo-500 focus:outline-none"
                      required
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500">상호명</label>
                  <input 
                    type="text" 
                    value={editingExpense.merchantName || ''}
                    onChange={e => setEditingExpense({ ...editingExpense, merchantName: e.target.value })}
                    className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                {editingExpense.category === 'fuel' && (
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-500">주유량 (L)</label>
                    <input 
                      type="number" 
                      value={editingExpense.fuelVolume === 0 ? '' : editingExpense.fuelVolume}
                      onChange={e => setEditingExpense({ ...editingExpense, fuelVolume: Number(e.target.value) })}
                      className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none font-mono"
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500">지출금액 (원) *</label>
                  <input 
                    type="text" 
                    inputMode="numeric"
                    value={editingExpense.amount === 0 ? '' : formatCurrencyInput(editingExpense.amount)}
                    onChange={e => setEditingExpense({ ...editingExpense, amount: parseCurrencyInput(e.target.value) })}
                    className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none font-mono font-semibold"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500 font-semibold text-indigo-400">연동 프로젝트</label>
                  <select 
                    value={projects.some(p => p.name === editingExpense.projectName) ? editingExpense.projectName : (editingExpense.projectName ? 'custom' : '')}
                    onChange={e => {
                      const val = e.target.value;
                      if (val === 'custom') {
                        setEditingExpense({ ...editingExpense, projectName: '직접 입력' });
                      } else {
                        setEditingExpense({ ...editingExpense, projectName: val });
                      }
                    }}
                    className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none text-slate-600"
                  >
                    <option value="">프로젝트 연동 안함 (없음)</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.name}>{p.name}</option>
                    ))}
                    <option value="custom">직접 입력 (커스텀)</option>
                  </select>
                </div>

                {(editingExpense.projectName === '직접 입력' || (editingExpense.projectName && !projects.some(p => p.name === editingExpense.projectName))) ? (
                  <div className="space-y-1.5 animate-fade-in">
                    <label className="text-xs text-indigo-400 font-semibold">프로젝트명 직접 입력 *</label>
                    <input 
                      type="text" 
                      placeholder="예: 강남구 스마트시티 구축 프로젝트"
                      value={editingExpense.projectName === '직접 입력' ? '' : editingExpense.projectName}
                      onChange={e => setEditingExpense({ ...editingExpense, projectName: e.target.value })}
                      className="w-full bg-slate-50 text-xs border border-indigo-900/40 rounded-lg p-2 focus:border-indigo-500 focus:outline-none text-slate-600"
                      required
                    />
                  </div>
                ) : null}

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500">메모 및 상세 사유</label>
                  <input 
                    type="text" 
                    value={editingExpense.memo || ''}
                    onChange={e => setEditingExpense({ ...editingExpense, memo: e.target.value })}
                    className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500 block font-semibold text-indigo-400">연관 거래처 담당자</label>
                  <ContactSearchSelect
                    contacts={contacts}
                    value={editingExpense.contactId || ''}
                    onChange={(id) => setEditingExpense({ ...editingExpense, contactId: id })}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-200">
                <button 
                  type="button"
                  onClick={() => setEditingExpense(null)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold text-xs py-2 px-4 rounded-lg transition-all"
                >
                  수정 취소
                </button>
                <button 
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs py-2 px-5 rounded-lg transition-all"
                >
                  비용 수정사항 반영
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* 13. 정비 기록 수정 모달 오버레이 */}
      {/* ========================================== */}
      {editingMaint && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-scale-in">
            <div className="p-5 border-b border-slate-200 flex justify-between items-start">
              <div>
                <h2 className="text-base font-bold text-slate-800">정비 일지 내역 보완</h2>
                <p className="text-xs text-slate-500 mt-0.5">실제 교환된 비용, 주행거리, 정비소 정보를 갱신합니다.</p>
              </div>
              <button 
                onClick={() => setEditingMaint(null)}
                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <form onSubmit={handleUpdateMaint} className="p-5 space-y-4 overflow-y-auto flex-1">
              <div className="space-y-4">
                {editingMaint.receiptImage && (
                  <div className="flex items-center gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                    <img
                      src={editingMaint.receiptImage}
                      alt="영수증"
                      onClick={() => setEnlargedReceiptUrl(editingMaint.receiptImage!)}
                      className="w-12 h-12 rounded-lg object-cover border border-slate-200 shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                    />
                    <span className="text-[11px] text-slate-500">등록된 영수증 (눌러서 크게 보기)</span>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500">정비 일자</label>
                  <input 
                    type="date" 
                    value={editingMaint.date}
                    onChange={e => setEditingMaint({ ...editingMaint, date: e.target.value })}
                    className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none text-slate-600"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500 font-semibold text-indigo-400">정비 항목 *</label>
                  <select 
                    value={MAINTENANCE_OPTIONS.includes(editingMaint.title) ? editingMaint.title : (editingMaint.title ? 'custom' : '')}
                    onChange={e => {
                      const val = e.target.value;
                      if (val === 'custom') {
                        setEditingMaint({ ...editingMaint, title: '직접 입력' });
                      } else {
                        setEditingMaint({ ...editingMaint, title: val });
                      }
                    }}
                    className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none text-slate-600"
                  >
                    <option value="">선택하세요...</option>
                    {MAINTENANCE_OPTIONS.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                    <option value="custom">직접 입력 (커스텀)</option>
                  </select>
                </div>

                {(editingMaint.title === '직접 입력' || (editingMaint.title && !MAINTENANCE_OPTIONS.includes(editingMaint.title))) ? (
                  <div className="space-y-1.5 animate-fade-in">
                    <label className="text-xs text-indigo-400 font-semibold">정비 항목 직접 입력 *</label>
                    <input 
                      type="text" 
                      placeholder="예: 미션 벨트 교환"
                      value={editingMaint.title === '직접 입력' ? '' : editingMaint.title}
                      onChange={e => setEditingMaint({ ...editingMaint, title: e.target.value })}
                      className="w-full bg-slate-50 text-xs border border-indigo-900/40 rounded-lg p-2 focus:border-indigo-500 focus:outline-none text-slate-600"
                      required
                    />
                  </div>
                ) : null}

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500">정비 비용 (원) *</label>
                  <input 
                    type="text" 
                    inputMode="numeric"
                    value={formatCurrencyInput(editingMaint.cost)}
                    onChange={e => setEditingMaint({ ...editingMaint, cost: parseCurrencyInput(e.target.value) })}
                    className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none font-mono font-semibold"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500">정비 당시 주행거리 (km) *</label>
                  <input 
                    type="number" 
                    value={editingMaint.mileage === 0 ? '' : editingMaint.mileage}
                    onChange={e => setEditingMaint({ ...editingMaint, mileage: Number(e.target.value) })}
                    className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none font-mono"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500">정비소/업체명</label>
                  <input 
                    type="text" 
                    value={editingMaint.shopName || ''}
                    onChange={e => setEditingMaint({ ...editingMaint, shopName: e.target.value })}
                    className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500">정비소 연락처</label>
                  <input 
                    type="text" 
                    value={editingMaint.shopContact || ''}
                    onChange={e => setEditingMaint({ ...editingMaint, shopContact: e.target.value })}
                    className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500">정비 상태</label>
                  <select 
                    value={editingMaint.status}
                    onChange={e => setEditingMaint({ ...editingMaint, status: e.target.value as any })}
                    className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none text-slate-600"
                  >
                    <option value="completed">정비 완료</option>
                    <option value="scheduled">예정 (스케줄러)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500">결제 수단</label>
                  <select 
                    value={editingMaint.payMethod || 'company_card'}
                    onChange={e => setEditingMaint({ ...editingMaint, payMethod: e.target.value as any })}
                    className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none text-slate-600"
                  >
                    <option value="company_card">법인(회사)카드</option>
                    <option value="personal_card">개인카드</option>
                    <option value="cash">현금</option>
                    <option value="none">해당없음 (무료/보증수리)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500">메모</label>
                  <input 
                    type="text" 
                    value={editingMaint.memo || ''}
                    onChange={e => setEditingMaint({ ...editingMaint, memo: e.target.value })}
                    className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-200">
                <button 
                  type="button"
                  onClick={() => setEditingMaint(null)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold text-xs py-2 px-4 rounded-lg transition-all"
                >
                  수정 취소
                </button>
                <button 
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs py-2 px-5 rounded-lg transition-all"
                >
                  정비 수정 완료
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* 14. 소모품 점검 주기 수정 모달 오버레이 */}
      {/* ========================================== */}
      {editingInterval && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-scale-in">
            <div className="p-5 border-b border-slate-200 flex justify-between items-start">
              <div>
                <h2 className="text-base font-bold text-slate-800">소모품 교환 주기 및 알림 기준 수정</h2>
                <p className="text-xs text-slate-500 mt-0.5">점검 대상 항목의 수명 주기 및 조기 예보 기준을 세팅합니다.</p>
              </div>
              <button 
                onClick={() => setEditingInterval(null)}
                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <form onSubmit={handleUpdateInterval} className="p-5 space-y-4 overflow-y-auto flex-1">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500 font-semibold text-indigo-400">차량 선택 *</label>
                  <select 
                    value={editingInterval.vehicleId}
                    onChange={e => setEditingInterval({ ...editingInterval, vehicleId: e.target.value })}
                    className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none text-slate-600"
                    required
                  >
                    <option value="">차량 선택...</option>
                    {vehicles.map(v => (
                      <option key={v.id} value={v.id}>{v.modelName} [{v.plateNumber}]</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500 font-semibold text-indigo-400">점검 항목 *</label>
                  <select
                    value={MAINTENANCE_OPTIONS.includes(editingInterval.itemType) ? editingInterval.itemType : (editingInterval.itemType ? 'custom' : '')}
                    onChange={e => {
                      const val = e.target.value;
                      if (val === 'custom') {
                        setEditingInterval({ ...editingInterval, itemType: '직접 입력' });
                      } else {
                        setEditingInterval({ ...editingInterval, itemType: val });
                      }
                    }}
                    className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none text-slate-600"
                    required
                  >
                    <option value="">선택하세요...</option>
                    {DISPLAY_MAINTENANCE_OPTIONS.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                    <option value="custom">직접 입력</option>
                  </select>
                </div>

                {(editingInterval.itemType === '직접 입력' || (editingInterval.itemType && !MAINTENANCE_OPTIONS.includes(editingInterval.itemType))) ? (
                  <div className="space-y-1.5 animate-fade-in">
                    <label className="text-xs text-indigo-400 font-semibold">점검 항목 직접 입력 *</label>
                    <input 
                      type="text" 
                      placeholder="예: 미션 벨트 교환"
                      value={editingInterval.itemType === '직접 입력' ? '' : editingInterval.itemType}
                      onChange={e => setEditingInterval({ ...editingInterval, itemType: e.target.value })}
                      className="w-full bg-slate-50 text-xs border border-indigo-900/40 rounded-lg p-2 focus:border-indigo-500 focus:outline-none text-slate-600"
                      required
                    />
                  </div>
                ) : null}

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500">km 주기 입력 (예 : 5,000 등 ) *</label>
                  <input 
                    type="number" 
                    placeholder="5,000"
                    value={editingInterval.intervalKm || ''}
                    onChange={e => setEditingInterval({ ...editingInterval, intervalKm: Number(e.target.value) })}
                    className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none text-slate-600 font-mono"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500">일 주기 입력(예 :180일 등) *</label>
                  <input 
                    type="number" 
                    placeholder="180"
                    value={editingInterval.intervalDays || ''}
                    onChange={e => setEditingInterval({ ...editingInterval, intervalDays: Number(e.target.value) })}
                    className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none text-slate-600 font-mono"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500">마지막 점검 주행 거리(km)</label>
                  <input 
                    type="number" 
                    placeholder="0"
                    value={editingInterval.lastServiceMileage || ''}
                    onChange={e => setEditingInterval({ ...editingInterval, lastServiceMileage: Number(e.target.value) })}
                    className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none text-slate-600 font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500">마지막 점검일 (mm/dd/yy 달력 선택)</label>
                  <input 
                    type="date" 
                    value={editingInterval.lastServiceDate || ''}
                    onChange={e => setEditingInterval({ ...editingInterval, lastServiceDate: e.target.value })}
                    className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none text-slate-600"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500">알림 기준 (km 전 알림(km 입력))</label>
                  <input 
                    type="number" 
                    placeholder="500"
                    value={editingInterval.alertKmBefore || ''}
                    onChange={e => setEditingInterval({ ...editingInterval, alertKmBefore: Number(e.target.value) })}
                    className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none text-slate-600 font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500">알림 기준 (일 전 알림(일 입력))</label>
                  <input 
                    type="number" 
                    placeholder="7"
                    value={editingInterval.alertDaysBefore || ''}
                    onChange={e => setEditingInterval({ ...editingInterval, alertDaysBefore: Number(e.target.value) })}
                    className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none text-slate-600 font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-200">
                <button 
                  type="button"
                  onClick={() => setEditingInterval(null)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold text-xs py-2 px-4 rounded-lg transition-all"
                >
                  수정 취소
                </button>
                <button 
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs py-2 px-5 rounded-lg transition-all"
                >
                  점검 주기 수정 반영
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {receiptCropTarget && (
        <CropAdjustModal
          imageDataUrl={receiptCropTarget.rawImage}
          title="영수증 테두리 확인"
          onConfirm={(cropped) => {
            runReceiptOcr(receiptCropTarget.context, cropped);
            setReceiptCropTarget(null);
          }}
          onCancel={() => setReceiptCropTarget(null)}
        />
      )}

      {receiptCameraTarget && (
        <LiveCameraCapture
          title="영수증 촬영"
          docLabel="영수증"
          guideAspectRatio={0.62}
          onCapture={(dataUrl) => {
            runReceiptOcr(receiptCameraTarget, dataUrl);
            setReceiptCameraTarget(null);
          }}
          onCancel={() => setReceiptCameraTarget(null)}
          onFallbackToFile={() => receiptFallbackFileInputRef.current?.click()}
        />
      )}
      <input
        ref={receiptFallbackFileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          const context = receiptCameraTarget;
          if (file && context) {
            const reader = new FileReader();
            reader.onload = (ev) => {
              setReceiptCropTarget({ context, rawImage: ev.target?.result as string });
            };
            reader.readAsDataURL(file);
          }
          e.target.value = '';
          setReceiptCameraTarget(null);
        }}
      />

      {/* [추가] 운행기록부 인쇄(PDF 저장) 전용: #print-root 포털에 표 내용만 넣어서, 화면의
      다른 요소(상단 메뉴, 탭, 다른 카드 등) 없이 이 표만 단독으로 인쇄/PDF 저장되게 한다.
      표가 가로로 넓어서 A4 가로 방향으로 인쇄되도록 print-landscape 클래스를 붙인다. */}
      {printingReportHtml && typeof document !== 'undefined' && document.getElementById('print-root') &&
        createPortal(
          <div className="print-landscape" style={{ padding: '10mm' }} dangerouslySetInnerHTML={{ __html: printingReportHtml }} />,
          document.getElementById('print-root')!
        )}
    </div>
  );
};
