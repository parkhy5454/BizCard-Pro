import React, { useState, useEffect } from 'react';
import { Calendar, Plus, Search, FileText, ChevronDown, ChevronUp, Trash2, Edit2, Link2, Sparkles, User, Briefcase, FileCheck, CheckCircle, ArrowRightLeft, AlertCircle, X, Check, FileSpreadsheet, Receipt, Trash, Printer, Eye } from 'lucide-react';
import { DailyWorkLog, WeeklyWorkLog, Project, BusinessCard, Vehicle, WorkLogExpense, WorkLogDayEntry } from '../types.js';
import { formatCurrencyInput, parseCurrencyInput } from '../currencyFormat.js';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import { ReceiptScanModal } from './ReceiptScanModal.js';

interface Props {
  contacts: BusinessCard[];
  setContacts: React.Dispatch<React.SetStateAction<BusinessCard[]>>;
  projects: Project[];
  currentUser: import('../types.js').User | null;
}

export const WorkLogsView: React.FC<Props> = ({ contacts, setContacts, projects, currentUser }) => {
  const [activeSubTab, setActiveSubTab] = useState<'daily' | 'weekly' | 'monthly' | 'report'>('daily');
  const [dailyLogs, setDailyLogs] = useState<DailyWorkLog[]>([]);
  const [weeklyLogs, setWeeklyLogs] = useState<WeeklyWorkLog[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  // 월간 달력 (같은 회사 직원 전체 업무 한눈에 보기) 상태
  const [monthCursor, setMonthCursor] = useState<Date>(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState<boolean>(true);
  
  // 검색 및 필터 상태
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedProjectFilter, setSelectedProjectFilter] = useState<string>('all');
  const [selectedContactFilter, setSelectedContactFilter] = useState<string>('all');
  
  // 모달 제어 상태
  const [isWriteModalOpen, setIsWriteModalOpen] = useState<boolean>(false);
  const [editingLogId, setEditingLogId] = useState<string | null>(null); // null 이면 새 일지 작성
  
  // 카드 확장 상태 (아코디언)
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // 일지 폼 상태
  const [formDate, setFormDate] = useState<string>('');
  const [formStartDate, setFormStartDate] = useState<string>('');
  const [formEndDate, setFormEndDate] = useState<string>('');
  const [formTitle, setFormTitle] = useState<string>('');
  const [formAuthor, setFormAuthor] = useState<string>('');
  const [formDepartment, setFormDepartment] = useState<string>('');
  
  const [myProfile, setMyProfile] = useState<any>(null);
  const [formTasksTomorrow, setFormTasksTomorrow] = useState<string>('');
  const [formIssues, setFormIssues] = useState<string>('');
  const [formAchievementsThisWeek, setFormAchievementsThisWeek] = useState<string>('');
  
  // 비용 지출 추가 상태
  const [formExpenses, setFormExpenses] = useState<WorkLogExpense[]>([]);
  
  // 일별 업무 항목 상태 (하루에 여러 건, 각각 시작~종료 시간 지정 가능)
  type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
  const emptyDayEntries: Record<DayKey, WorkLogDayEntry[]> = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };
  const [dayEntries, setDayEntries] = useState<Record<DayKey, WorkLogDayEntry[]>>(emptyDayEntries);

  // 하루(day)의 항목들을 "[시작~종료] 내용" 형식의 텍스트로 합쳐서 반환 (인쇄/엑셀/AI정제/일일가져오기 등 기존 기능과 호환용)
  const getDayComposedText = (day: DayKey, source?: Record<DayKey, WorkLogDayEntry[]>): string => {
    const list = (source || dayEntries)[day] || [];
    return list
      .map((e) => {
        const timeLabel = e.startTime && e.endTime ? `[${e.startTime}~${e.endTime}] ` : e.startTime ? `[${e.startTime}~] ` : '';
        return `${timeLabel}${e.content}`.trim();
      })
      .filter(Boolean)
      .join('\n');
  };
  const dayHasContent = (day: DayKey) => (dayEntries[day] || []).some((e) => e.content.trim().length > 0);

  const addDayEntry = (day: DayKey) => {
    setDayEntries((prev) => ({
      ...prev,
      [day]: [...(prev[day] || []), { id: `de-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, startTime: '', endTime: '', content: '' }]
    }));
  };
  const updateDayEntry = (day: DayKey, entryId: string, patch: Partial<WorkLogDayEntry>) => {
    setDayEntries((prev) => ({
      ...prev,
      [day]: (prev[day] || []).map((e) => (e.id === entryId ? { ...e, ...patch } : e))
    }));
  };
  const removeDayEntry = (day: DayKey, entryId: string) => {
    setDayEntries((prev) => ({
      ...prev,
      [day]: (prev[day] || []).filter((e) => e.id !== entryId)
    }));
  };
  // 기존(레거시) 텍스트 하나만 있는 요일 데이터를 항목 1건으로 변환 (구버전 데이터 호환)
  const legacyTextToEntries = (text?: string): WorkLogDayEntry[] => {
    if (!text || !text.trim()) return [];
    return [{ id: `legacy-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, content: text }];
  };

  // 일일 업무일지 "금일 실시 사항" 항목 상태 (하루에 여러 건, 각각 시작~종료 시간 지정 가능)
  const [todayEntries, setTodayEntries] = useState<WorkLogDayEntry[]>([]);
  const getTodayComposedText = (source?: WorkLogDayEntry[]): string => {
    return (source || todayEntries)
      .map((e) => {
        const timeLabel = e.startTime && e.endTime ? `[${e.startTime}~${e.endTime}] ` : e.startTime ? `[${e.startTime}~] ` : '';
        return `${timeLabel}${e.content}`.trim();
      })
      .filter(Boolean)
      .join('\n');
  };
  const addTodayEntry = () => {
    setTodayEntries((prev) => [...prev, { id: `de-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, startTime: '', endTime: '', content: '' }]);
  };
  const updateTodayEntry = (entryId: string, patch: Partial<WorkLogDayEntry>) => {
    setTodayEntries((prev) => prev.map((e) => (e.id === entryId ? { ...e, ...patch } : e)));
  };
  const removeTodayEntry = (entryId: string) => {
    setTodayEntries((prev) => prev.filter((e) => e.id !== entryId));
  };

  // 주간 일지 모달 내 요일 탭 상태
  const [activeDayTab, setActiveDayTab] = useState<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'>('mon');

  const [formPlansNextWeek, setFormPlansNextWeek] = useState<string>('');
  const [formFeedbacks, setFormFeedbacks] = useState<string>('');
  const [formProjectIds, setFormProjectIds] = useState<string[]>([]);
  const [formContactIds, setFormContactIds] = useState<string[]>([]);

  // 거래처 직접 입력 상태
  const [useDirectContact, setUseDirectContact] = useState<boolean>(false);
  const [directContactName, setDirectContactName] = useState<string>('');
  const [directContactCompany, setDirectContactCompany] = useState<string>('');
  const [directContactDept, setDirectContactDept] = useState<string>('');
  const [directContactTitle, setDirectContactTitle] = useState<string>('');
  const [directContactPhoneOffice, setDirectContactPhoneOffice] = useState<string>('');
  const [directContactPhoneMobile, setDirectContactPhoneMobile] = useState<string>('');
  const [directContactEmail, setDirectContactEmail] = useState<string>('');

  // AI 정제 로딩 상태
  const [aiPolishingField, setAiPolishingField] = useState<string | null>(null);

  // 주간보고서 출력/인쇄 모달 상태
  const [isReportModalOpen, setIsReportModalOpen] = useState<boolean>(false);
  const [selectedReportLog, setSelectedReportLog] = useState<WeeklyWorkLog | null>(null);
  const [reportTitle, setReportTitle] = useState<string>('');
  const [reportStartDate, setReportStartDate] = useState<string>('');
  const [reportEndDate, setReportEndDate] = useState<string>('');
  const [reportAuthor, setReportAuthor] = useState<string>('');
  const [reportDepartment, setReportDepartment] = useState<string>('');
  const [reportExpenseDaily, setReportExpenseDaily] = useState<number>(0);
  const [reportExpenseWeekly, setReportExpenseWeekly] = useState<number>(0);
  const [reportExpenseMonthly, setReportExpenseMonthly] = useState<number>(0);
  
  // 영수증 스캔 관련 상태
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState<boolean>(false);
  const [scanningExpenseRowId, setScanningExpenseRowId] = useState<string | null>(null);
  const [viewingReceiptImage, setViewingReceiptImage] = useState<string | null>(null);
  
  // 주간보고서 테이블 데이터
  const [reportTable1, setReportTable1] = useState<any[]>([]);
  const [reportTable2, setReportTable2] = useState<any[]>([]);
  const [reportTable3, setReportTable3] = useState<any[]>([]);
  const [reportTable4, setReportTable4] = useState<any[]>([]);
  const [reportOption, setReportOption] = useState<'A' | 'B'>('A');

  // 일간/주간 탭 전환을 위한 모바일 좌우 스와이프 상태 및 핸들러
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchEndX, setTouchEndX] = useState<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchEndX(null);
    setTouchStartX(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEndX(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (touchStartX === null || touchEndX === null) return;
    const distance = touchStartX - touchEndX;
    const minSwipeDistance = 70; // 최소 70px 스와이프 시 탭 변경

    if (distance > minSwipeDistance) {
      // 왼쪽으로 쓸기 (Swipe Left) -> 주간(weekly) 탭으로 이동
      if (activeSubTab === 'daily') {
        setActiveSubTab('weekly');
        setSearchQuery('');
        setSelectedProjectFilter('all');
        setSelectedContactFilter('all');
      }
    } else if (distance < -minSwipeDistance) {
      // 오른쪽으로 쓸기 (Swipe Right) -> 일일(daily) 탭으로 이동
      if (activeSubTab === 'weekly') {
        setActiveSubTab('daily');
        setSearchQuery('');
        setSelectedProjectFilter('all');
        setSelectedContactFilter('all');
      }
    }
  };

  useEffect(() => {
    fetchWorkLogs();
    fetchMyProfile();
    fetchVehicles();
  }, [currentUser]);

  const fetchVehicles = async () => {
    if (!currentUser) return;
    try {
      const res = await fetch('/api/vehicles');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setVehicles(data);
      }
    } catch (err) {
      console.error('Vehicles fetch error:', err);
    }
  };

  const fetchMyProfile = async () => {
    try {
      const res = await fetch('/api/my-profile');
      if (res.ok) {
        const data = await res.json();
        setMyProfile(data);
      }
    } catch (err) {
      console.error('My profile fetch error:', err);
    }
  };

  const fetchWorkLogs = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const headers = { 'x-user-id': currentUser.id };
      const [dailyRes, weeklyRes] = await Promise.all([
        fetch('/api/worklogs/daily', { headers }).then(r => r.json()),
        fetch('/api/worklogs/weekly', { headers }).then(r => r.json())
      ]);
      if (Array.isArray(dailyRes)) setDailyLogs(dailyRes);
      if (Array.isArray(weeklyRes)) setWeeklyLogs(weeklyRes);
    } catch (err) {
      console.error('Work logs fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  // 모달 열기 핸들러 (새 일지 작성)
  const handleOpenNewLog = () => {
    setEditingLogId(null);
    const todayStr = new Date().toISOString().split('T')[0];
    
    // 주간 기본 범위 (이번주 월~금)
    const today = new Date();
    const currentDay = today.getDay(); // 0: 일, 1: 월 ... 6: 토
    const distanceToMonday = currentDay === 0 ? -6 : 1 - currentDay;
    const monday = new Date(today.setDate(today.getDate() + distanceToMonday));
    const friday = new Date(monday);
    friday.setDate(friday.getDate() + 4);
    
    setFormDate(todayStr);
    setFormStartDate(monday.toISOString().split('T')[0]);
    setFormEndDate(friday.toISOString().split('T')[0]);
    
    if (activeSubTab === 'daily') {
      setFormTitle(`${todayStr} 일일 업무일지`);
    } else {
      setFormTitle(`${monday.toISOString().split('T')[0]} ~ ${friday.toISOString().split('T')[0]} 주간 업무일지`);
    }
    
    // 프로필 정보가 있으면 기본값으로 주입
    setFormAuthor(myProfile?.name || currentUser?.name || '');
    setFormDepartment(myProfile?.department || '');
    
    setTodayEntries([]);
    setFormTasksTomorrow('');
    setFormIssues('');
    setFormAchievementsThisWeek('');
    
    // 일별 업무 항목 초기화
    setDayEntries(emptyDayEntries);

    setFormPlansNextWeek('');
    setFormFeedbacks('');
    setFormProjectIds([]);
    setFormContactIds([]);
    setFormExpenses([]);

    setUseDirectContact(false);
    setDirectContactName('');
    setDirectContactCompany('');
    setDirectContactDept('');
    setDirectContactTitle('');
    setDirectContactPhoneOffice('');
    setDirectContactPhoneMobile('');
    setDirectContactEmail('');
    
    setIsWriteModalOpen(true);
  };

  // 모달 열기 핸들러 (수정)
  const handleOpenEditLog = (log: any, type: 'daily' | 'weekly') => {
    setEditingLogId(log.id);
    setFormTitle(log.title);
    setFormAuthor(log.author || '');
    setFormDepartment(log.department || '');
    setFormProjectIds(log.projectIds || []);
    setFormContactIds(log.contactIds || []);
    setFormExpenses(log.expenses || []);

    setUseDirectContact(false);
    setDirectContactName('');
    setDirectContactCompany('');
    setDirectContactDept('');
    setDirectContactTitle('');
    setDirectContactPhoneOffice('');
    setDirectContactPhoneMobile('');
    setDirectContactEmail('');
    
    if (type === 'daily') {
      const dLog = log as DailyWorkLog;
      setFormDate(dLog.date);
      setTodayEntries(dLog.taskEntriesToday?.length ? dLog.taskEntriesToday : legacyTextToEntries(dLog.tasksToday));
      setFormTasksTomorrow(dLog.tasksTomorrow);
      setFormIssues(dLog.issues || '');
    } else {
      const wLog = log as WeeklyWorkLog;
      setFormStartDate(wLog.startDate);
      setFormEndDate(wLog.endDate);
      setFormAchievementsThisWeek(wLog.achievementsThisWeek);
      
      // 일별 업무 항목 로드 (신버전: achievementEntriesByDay / 구버전: achievementsByDay 텍스트를 항목 1건으로 변환)
      setDayEntries({
        mon: wLog.achievementEntriesByDay?.mon?.length ? wLog.achievementEntriesByDay.mon : legacyTextToEntries(wLog.achievementsByDay?.mon),
        tue: wLog.achievementEntriesByDay?.tue?.length ? wLog.achievementEntriesByDay.tue : legacyTextToEntries(wLog.achievementsByDay?.tue),
        wed: wLog.achievementEntriesByDay?.wed?.length ? wLog.achievementEntriesByDay.wed : legacyTextToEntries(wLog.achievementsByDay?.wed),
        thu: wLog.achievementEntriesByDay?.thu?.length ? wLog.achievementEntriesByDay.thu : legacyTextToEntries(wLog.achievementsByDay?.thu),
        fri: wLog.achievementEntriesByDay?.fri?.length ? wLog.achievementEntriesByDay.fri : legacyTextToEntries(wLog.achievementsByDay?.fri),
        sat: wLog.achievementEntriesByDay?.sat?.length ? wLog.achievementEntriesByDay.sat : legacyTextToEntries(wLog.achievementsByDay?.sat),
        sun: wLog.achievementEntriesByDay?.sun?.length ? wLog.achievementEntriesByDay.sun : legacyTextToEntries(wLog.achievementsByDay?.sun)
      });

      setFormPlansNextWeek(wLog.plansNextWeek);
      setFormFeedbacks(wLog.feedbacks || '');
    }
    
    setIsWriteModalOpen(true);
  };

  // 주간보고서 도우미 및 상태 매핑 함수
  const getOffsetDateString = (baseDateStr: string, offsetDays: number): string => {
    try {
      const date = new Date(baseDateStr);
      if (isNaN(date.getTime())) return baseDateStr;
      date.setDate(date.getDate() + offsetDays);
      return date.toISOString().split('T')[0];
    } catch {
      return baseDateStr;
    }
  };

  const formatDateLabel = (dateStr: string): string => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const mm = d.getMonth() + 1;
      const dd = d.getDate();
      const days = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
      return `${mm}/${dd < 10 ? '0' + dd : dd}일 ${days[d.getDay()]}`;
    } catch {
      return dateStr;
    }
  };

  const formatMockupDateLabel = (dateStr: string): string => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const mm = d.getMonth() + 1;
      const dd = d.getDate();
      const days = ['일', '월', '화', '수', '목', '금', '토'];
      return `${mm}/${dd < 10 ? '0' + dd : dd}일(${days[d.getDay()]})`;
    } catch {
      return dateStr;
    }
  };

  const getWeekDetails = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return { month: 1, monthlyWeek: 1, annualWeek: 1 };
      
      // 주간의 중간값(수요일)을 사용하여 월 결정
      const mid = new Date(d);
      mid.setDate(mid.getDate() + 2);
      const mm = mid.getMonth() + 1;
      
      // 연간 주차 계산
      const tempDate = new Date(d.getTime());
      tempDate.setHours(0, 0, 0, 0);
      tempDate.setDate(tempDate.getDate() + 3 - (tempDate.getDay() + 6) % 7);
      const week1 = new Date(tempDate.getFullYear(), 0, 4);
      const annualWeek = 1 + Math.round(((tempDate.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
      
      // 월간 주차 계산
      const firstDayOfMonth = new Date(mid.getFullYear(), mid.getMonth(), 1);
      const firstDayOfWeek = firstDayOfMonth.getDay(); // 0: 일, 1: 월...
      const dateNum = mid.getDate();
      const monthlyWeek = Math.ceil((dateNum + (firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1)) / 7);
      
      return { month: mm, monthlyWeek, annualWeek };
    } catch {
      return { month: 1, monthlyWeek: 1, annualWeek: 1 };
    }
  };

  const getCategoryKo = (cat: string, custom?: string) => {
    const categoryLabels: Record<string, string> = {
      breakfast: '아침식사',
      lunch: '점심식사',
      dinner: '저녁식사',
      drinks: '음료&커피',
      fuel: '주유비',
      parking: '주차비',
      proxy: '대리운전비',
      purchase: '물건 구입',
      custom: custom || '직접 입력'
    };
    return categoryLabels[cat] || cat;
  };

  // 특정 날짜(YYYY-MM-DD)에 해당하는 모든 업무 내용(일일 일지 + 주간 일지의 요일별 항목들)을
  // 같은 회사 직원 전체 기준으로 모아서 반환 (월간 달력에서 사용). 하루에 여러 건이면 각각 별도 항목으로 표시됩니다.
  type CalendarEntry = { id: string; author: string; time?: string; title: string; content: string; source: 'daily' | 'weekly' };
  const getEntriesForDate = (dateStr: string): CalendarEntry[] => {
    const entries: CalendarEntry[] = [];

    dailyLogs
      .filter((l) => l.date === dateStr)
      .forEach((l) => {
        if (l.taskEntriesToday && l.taskEntriesToday.length > 0) {
          l.taskEntriesToday.forEach((task) => {
            if (!task.content || !task.content.trim()) return;
            entries.push({
              id: `d-${l.id}-${task.id}`,
              author: l.author || '작성자 미지정',
              time: task.startTime && task.endTime ? `${task.startTime}~${task.endTime}` : task.startTime,
              title: l.title,
              content: task.content,
              source: 'daily'
            });
          });
        } else if (l.tasksToday && l.tasksToday.trim()) {
          entries.push({
            id: `d-${l.id}`,
            author: l.author || '작성자 미지정',
            title: l.title,
            content: l.tasksToday,
            source: 'daily'
          });
        }
      });

    const dayKeys: ('mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun')[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    weeklyLogs.forEach((wl) => {
      if (!wl.startDate) return;
      const start = new Date(wl.startDate);
      dayKeys.forEach((key, offset) => {
        const d = new Date(start);
        d.setDate(d.getDate() + offset);
        const dStr = d.toISOString().split('T')[0];
        if (dStr !== dateStr) return;

        const structuredEntries = wl.achievementEntriesByDay?.[key];
        if (structuredEntries && structuredEntries.length > 0) {
          // 신버전: 하루에 여러 업무 항목, 각각 시작~종료 시간 표시
          structuredEntries.forEach((task) => {
            if (!task.content || !task.content.trim()) return;
            entries.push({
              id: `w-${wl.id}-${key}-${task.id}`,
              author: wl.author || '작성자 미지정',
              time: task.startTime && task.endTime ? `${task.startTime}~${task.endTime}` : task.startTime,
              title: wl.title,
              content: task.content,
              source: 'weekly'
            });
          });
        } else {
          // 구버전 호환: 요일별 텍스트 하나만 있는 경우
          const legacyContent = wl.achievementsByDay?.[key];
          if (legacyContent && legacyContent.trim()) {
            entries.push({
              id: `w-${wl.id}-${key}`,
              author: wl.author || '작성자 미지정',
              title: wl.title,
              content: legacyContent,
              source: 'weekly'
            });
          }
        }
      });
    });

    // 시간이 있는 항목을 먼저, 그 안에서는 시간순으로 정렬
    return entries.sort((a, b) => {
      if (a.time && b.time) return a.time.localeCompare(b.time);
      if (a.time) return -1;
      if (b.time) return 1;
      return 0;
    });
  };

  const handleOpenReportModal = (log: WeeklyWorkLog) => {
    setSelectedReportLog(log);
    setReportOption('A');
    
    const { month, monthlyWeek, annualWeek } = getWeekDetails(log.startDate);
    setReportTitle(`${month}월 ${monthlyWeek}주차 주간 업무 보고`);
    setReportStartDate(log.startDate);
    setReportEndDate(log.endDate);
    setReportAuthor(log.author || currentUser?.name || '김태균');
    setReportDepartment(log.department || '비즈니스전략팀');
    
    // 비용 계산 (일간, 주간, 월간)
    const reportingDailyLogs = dailyLogs.filter(dl => dl.date >= log.startDate && dl.date <= log.endDate);
    const dailyExpensesSum = reportingDailyLogs.reduce((sum, dl) => {
      return sum + (dl.expenses || []).reduce((s, e) => s + (e.amount || 0), 0);
    }, 0);
    setReportExpenseDaily(dailyExpensesSum || 70500);
    
    const t2StartDate = getOffsetDateString(log.startDate, 7);
    const t2EndDate = getOffsetDateString(log.startDate, 11);
    const currentWeekDailyLogs = dailyLogs.filter(dl => dl.date >= t2StartDate && dl.date <= t2EndDate);
    const currentWeekExpensesSum = currentWeekDailyLogs.reduce((sum, dl) => {
      return sum + (dl.expenses || []).reduce((s, e) => s + (e.amount || 0), 0);
    }, 0);
    const weeklyOwnExpensesSum = (log.expenses || []).reduce((sum, e) => sum + (e.amount || 0), 0);
    setReportExpenseWeekly(currentWeekExpensesSum || weeklyOwnExpensesSum || 86000);
    
    const logMonth = new Date(log.startDate).getMonth();
    const logYear = new Date(log.startDate).getFullYear();
    const monthlyDailyLogs = dailyLogs.filter(dl => {
      const d = new Date(dl.date);
      return d.getMonth() === logMonth && d.getFullYear() === logYear;
    });
    const monthlyDailySum = monthlyDailyLogs.reduce((sum, dl) => {
      return sum + (dl.expenses || []).reduce((s, e) => s + (e.amount || 0), 0);
    }, 0);
    setReportExpenseMonthly(monthlyDailySum || 139500);
    
    // 테이블 1 (지난주 요일별 상세 실시 사항): 해당 주간의 실제 일일 업무일지와 연동! (0 ~ 4일 오프셋)
    const t1Rows = [];
    for (let i = 0; i < 5; i++) {
      const dateStr = getOffsetDateString(log.startDate, i);
      const matchedLogs = dailyLogs.filter(dl => dl.date === dateStr);
      
      const description = matchedLogs.flatMap(ml => [ml.tasksToday]).filter(Boolean).join('\n') || '';

      // 연관 프로젝트명 (매칭된 일일 일지의 projectIds를 프로젝트명으로 변환)
      const projectNames = Array.from(new Set(
        matchedLogs.flatMap(ml => (ml.projectIds || []).map(pid => projects.find(p => p.id === pid)?.name).filter(Boolean) as string[])
      ));

      // 매칭된 일일 일지의 지출 비용 항목 (Description/Won 세부 표용)
      const expenseItems = matchedLogs.flatMap(ml => (ml.expenses || []).map(exp => ({
        id: exp.id,
        description: getCategoryKo(exp.category, exp.categoryCustom),
        amount: exp.amount
      })));
      
      const defaultDesc = i === 0 
        ? "1. 주간 영업 실적 보고 회의 참석\n2. 주요 VIP 고객 메일 피드백 정리 및 금주 타겟 명단 선정"
        : i === 1
        ? "1. 네이버 클라우드 김도현 수석 연구원과 유선 요금 및 API 연동 아젠다 사전 조율\n2. 신규 파트너용 기획 설명서 보정 작업 완료"
        : i === 2
        ? "1. 네이버 클라우드 B2B 주소록 자동 동기화 기능 한도 및 API 요금 최종 타결안 도출\n2. 내부 보고용 상신 기안서 기안 완료"
        : i === 3
        ? "1. 삼성전자 서초사옥 이서연 책임 PM 방문 대면 제안 미팅 및 온디바이스 데모 시연 진행\n2. 고객 보안 가이드 추가 요구사항 수신"
        : "1. 삼성전자 2차 미팅 대안(보안 연산 부하 가이드 및 라이브러리 경량화) 기술 분석 의뢰\n2. 신규 인맥 5건 시스템 등록 및 CRM 정보 기재 완료";

      t1Rows.push({
        id: `t1-${i}`,
        date: dateStr,
        dateLabel: formatMockupDateLabel(dateStr),
        weekLabel: `${annualWeek}주차`,
        project: projectNames.join(', '),
        description: description || defaultDesc,
        progress: matchedLogs.length > 0 ? '100' : '',
        remark: '',
        expenseItems
      });
    }
    setReportTable1(t1Rows);
    
    // 테이블 2 (금주 요일별 상세 실시 사항): 오프셋 7 ~ 11일 (다음주 월~금)
    const t2Rows = [];
    for (let i = 0; i < 5; i++) {
      const dateStr = getOffsetDateString(t2StartDate, i);
      const matchedLogs = dailyLogs.filter(dl => dl.date === dateStr);
      
      const description = matchedLogs.flatMap(ml => [ml.tasksToday]).filter(Boolean).join('\n') || '';

      const projectNames = Array.from(new Set(
        matchedLogs.flatMap(ml => (ml.projectIds || []).map(pid => projects.find(p => p.id === pid)?.name).filter(Boolean) as string[])
      ));

      const expenseItems = matchedLogs.flatMap(ml => (ml.expenses || []).map(exp => ({
        id: exp.id,
        description: getCategoryKo(exp.category, exp.categoryCustom),
        amount: exp.amount
      })));
      
      const defaultDesc = i === 0 
        ? "1. 주간 영업 실적 보고 회의 참석\n2. 주요 VIP 고객 메일 피드백 정리 및 금주 타겟 명단 선정"
        : i === 1
        ? "1. 네이버 클라우드 김도현 수석 연구원과 유선 요금 및 API 연동 아젠다 사전 조율\n2. 신규 파트너용 기획 설명서 보정 작업 완료"
        : i === 2
        ? "1. 네이버 클라우드 B2B 주소록 자동 동기화 기능 한도 및 API 요금 최종 타결안 도출\n2. 내부 보고용 상신 기안서 기안 완료"
        : i === 3
        ? "1. 삼성전자 서초사옥 이서연 책임 PM 방문 대면 제안 미팅 및 온디바이스 데모 시연 진행\n2. 고객 보안 가이드 추가 요구사항 수신"
        : "1. 삼성전자 2차 미팅 대안(보안 연산 부하 가이드 및 라이브러리 경량화) 기술 분석 의뢰\n2. 신규 인맥 5건 시스템 등록 및 CRM 정보 기재 완료";

      t2Rows.push({
        id: `t2-${i}`,
        date: dateStr,
        dateLabel: formatMockupDateLabel(dateStr),
        weekLabel: `${annualWeek + 1}주차`,
        project: projectNames.join(', '),
        description: description || defaultDesc,
        estimatedTime: '',
        remark: '',
        expenseItems
      });
    }
    setReportTable2(t2Rows);
    
    // 테이블 3 (차주 예정 사항): 오프셋 14 ~ 18일
    const t3Rows = [];
    const t3StartDate = getOffsetDateString(log.startDate, 14);
    for (let i = 0; i < 5; i++) {
      const dateStr = getOffsetDateString(t3StartDate, i);
      const matchedLogs = dailyLogs.filter(dl => dl.date === dateStr);
      
      const description = matchedLogs.flatMap(ml => [ml.tasksToday]).filter(Boolean).join('\n') || '';

      const projectNames = Array.from(new Set(
        matchedLogs.flatMap(ml => (ml.projectIds || []).map(pid => projects.find(p => p.id === pid)?.name).filter(Boolean) as string[])
      ));
      
      const defaultDesc = i === 0 
        ? "1. 삼성전자 보안 요구 기술 미팅 진행 및 완전 온디바이스 옵션 아키텍처 제안서 작성\n2. 네이버 클라우드 파트너십 최종 계약 서명 조율"
        : i === 1
        ? "1. 대리점 및 유통 파트너 추가 확보를 위한 컨택 가동\n2. 신규 파트너용 기획 설명서 보정 작업 완료"
        : i === 2
        ? "1. 네이버 클라우드 B2B 주소록 자동 동기화 기능 한도 및 API 요금 최종 타결안 도출\n2. 내부 보고용 상신 기안서 기안 완료"
        : i === 3
        ? "1. 삼성전자 서초사옥 이서연 책임 PM 방문 대면 제안 미팅 및 온디바이스 데모 시연 진행\n2. 고객 보안 가이드 추가 요구사항 수신"
        : "1. 삼성전자 2차 미팅 대안(보안 연산 부하 가이드 및 라이브러리 경량화) 기술 분석 의뢰\n2. 신규 인맥 5건 시스템 등록 및 CRM 정보 기재 완료";

      t3Rows.push({
        id: `t3-${i}`,
        date: dateStr,
        dateLabel: formatMockupDateLabel(dateStr),
        weekLabel: `${annualWeek + 2}주차`,
        project: projectNames.join(', '),
        description: description || defaultDesc,
        estimatedTime: '',
        remark: ''
      });
    }
    setReportTable3(t3Rows);
    
    // 테이블 4 (애로 및 건의사항)
    setReportTable4([
      { id: 't4-1', description: log.feedbacks || '현재 개발팀 리소스가 한정되어 있어, 삼성전자의 완전 온디바이스 요구사항 수용을 위해서는 백엔드 최적화 업무의 우선순위 재조정이 필요함.', remark: '' },
      { id: 't4-2', description: '공정을 제 기한에 끝내기 위해 인원 3명 추가 필요', remark: '' }
    ]);
    
    setIsReportModalOpen(true);
  };

  const handleTable1Change = (rowId: string, field: string, val: any) => {
    setReportTable1(prev => prev.map(row => row.id === rowId ? { ...row, [field]: val } : row));
  };
  const handleTable2Change = (rowId: string, field: string, val: any) => {
    setReportTable2(prev => prev.map(row => row.id === rowId ? { ...row, [field]: val } : row));
  };
  const handleTable3Change = (rowId: string, field: string, val: any) => {
    setReportTable3(prev => prev.map(row => row.id === rowId ? { ...row, [field]: val } : row));
  };
  const handleTable4Change = (rowId: string, field: string, val: any) => {
    setReportTable4(prev => prev.map(row => row.id === rowId ? { ...row, [field]: val } : row));
  };
  const handleTable1ExpenseChange = (rowId: string, expIdx: number, field: 'description' | 'amount', val: any) => {
    setReportTable1(prev => prev.map(row => {
      if (row.id === rowId) {
        const nextExp = [...(row.expenses || [])];
        if (!nextExp[expIdx]) return row;
        if (field === 'amount') {
          nextExp[expIdx] = { ...nextExp[expIdx], amount: Number(val) || 0 };
        } else {
          nextExp[expIdx] = { ...nextExp[expIdx], description: val };
        }
        return { ...row, expenses: nextExp };
      }
      return row;
    }));
  };
  const handleTable2ExpenseChange = (rowId: string, expIdx: number, field: 'description' | 'amount', val: any) => {
    setReportTable2(prev => prev.map(row => {
      if (row.id === rowId) {
        const nextExp = [...(row.expenses || [])];
        if (!nextExp[expIdx]) return row;
        if (field === 'amount') {
          nextExp[expIdx] = { ...nextExp[expIdx], amount: Number(val) || 0 };
        } else {
          nextExp[expIdx] = { ...nextExp[expIdx], description: val };
        }
        return { ...row, expenses: nextExp };
      }
      return row;
    }));
  };
  const handleTable3ExpenseChange = (rowId: string, expIdx: number, field: 'description' | 'amount', val: any) => {
    setReportTable3(prev => prev.map(row => {
      if (row.id === rowId) {
        const nextExp = [...(row.expenses || [])];
        if (!nextExp[expIdx]) return row;
        if (field === 'amount') {
          nextExp[expIdx] = { ...nextExp[expIdx], amount: Number(val) || 0 };
        } else {
          nextExp[expIdx] = { ...nextExp[expIdx], description: val };
        }
        return { ...row, expenses: nextExp };
      }
      return row;
    }));
  };
  const handleAddTableExpense = (tableNum: 1 | 2 | 3, rowId: string) => {
    const setter = tableNum === 1 ? setReportTable1 : tableNum === 2 ? setReportTable2 : setReportTable3;
    setter(prev => prev.map(row => {
      if (row.id === rowId) {
        return {
          ...row,
          expenses: [...(row.expenses || []), { description: '직접 입력', amount: 0 }]
        };
      }
      return row;
    }));
  };
  const handleRemoveTableExpense = (tableNum: 1 | 2 | 3, rowId: string, expIdx: number) => {
    const setter = tableNum === 1 ? setReportTable1 : tableNum === 2 ? setReportTable2 : setReportTable3;
    setter(prev => prev.map(row => {
      if (row.id === rowId) {
        return {
          ...row,
          expenses: (row.expenses || []).filter((_: any, i: number) => i !== expIdx)
        };
      }
      return row;
    }));
  };
  const handlePrintReport = () => {
    window.print();
  };

  // 주간 업무 보고서를 화면에 보이는 것과 똑같은 양식(4개 표)으로 엑셀 다운로드
  const downloadReportToExcel = () => {
    const esc = (str: any): string => (str === null || str === undefined ? '' : String(str))
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br/>');

    const cellBorder = 'border: 0.5pt solid #000000;';
    const yellowBg = 'background-color: #FFFF00;';
    const baseFont = "font-family: 'Malgun Gothic', Arial; font-size: 10pt;";

    // 표 1/2 용: Week(rowspan)/Date/Project/Description/진행율또는예상시간/Expenses(Description,Won)
    const buildMainTableHtml = (heading: string, rows: any[], thirdColLabel: string, thirdColField: 'progress' | 'estimatedTime') => {
      let total = 0;
      const bodyRows = rows.map((row, idx) => {
        const items = row.expenseItems || [];
        total += items.reduce((s: number, e: any) => s + e.amount, 0);
        const expDesc = items.map((e: any) => esc(e.description)).join('<br/>') || '-';
        const expWon = items.map((e: any) => e.amount.toLocaleString()).join('<br/>') || '-';
        return `
          <tr>
            ${idx === 0 ? `<td rowspan="${rows.length}" style="${cellBorder} text-align:center; vertical-align:middle; font-weight:bold; ${baseFont}">${esc(row.weekLabel)}</td>` : ''}
            <td style="${cellBorder} text-align:center; ${baseFont}">${esc(row.dateLabel)}</td>
            <td style="${cellBorder} text-align:center; ${baseFont}">${esc(row.project) || '-'}</td>
            <td style="${cellBorder} text-align:left; padding-left:5px; ${baseFont}">${esc(row.description)}</td>
            <td style="${cellBorder} text-align:center; font-weight:bold; ${baseFont}">${esc(row[thirdColField]) || ''}</td>
            <td style="${cellBorder} text-align:left; padding-left:5px; ${baseFont}">${expDesc}</td>
            <td style="${cellBorder} text-align:right; padding-right:5px; ${baseFont}">${expWon}</td>
          </tr>`;
      }).join('');

      return `
        <p style="font-weight:bold; font-size:12pt; margin: 14px 0 4px 0;">${esc(heading)}</p>
        <table style="border-collapse: collapse; width: 100%; border: 1.5pt solid #000000; ${baseFont}">
          <tr style="${yellowBg}">
            <th style="${cellBorder} ${yellowBg} width:8%;">Week</th>
            <th style="${cellBorder} ${yellowBg} width:9%;">Date</th>
            <th style="${cellBorder} ${yellowBg} width:13%;">Project</th>
            <th style="${cellBorder} ${yellowBg} width:35%;">Description</th>
            <th style="${cellBorder} ${yellowBg} width:8%;">${esc(thirdColLabel)}</th>
            <th colspan="2" style="${cellBorder} ${yellowBg} width:15%;">Expenses (비용)</th>
          </tr>
          <tr style="${yellowBg}">
            <th colspan="5" style="${cellBorder} ${yellowBg}"></th>
            <th style="${cellBorder} ${yellowBg}">Description</th>
            <th style="${cellBorder} ${yellowBg}">Won</th>
          </tr>
          ${bodyRows}
          <tr style="background-color:#FEF9C3; font-weight:bold;">
            <td colspan="5" style="${cellBorder} text-align:right; padding-right:8px;">계</td>
            <td colspan="2" style="${cellBorder} text-align:right; padding-right:5px;">${total.toLocaleString()}</td>
          </tr>
        </table>`;
    };

    // 표 3: Week(rowspan)/Date/Project/Description/Estimated Time/Remark (비용 없음)
    const buildPlanTableHtml = () => {
      const rows = reportTable3 as any[];
      const bodyRows = rows.map((row, idx) => `
        <tr>
          ${idx === 0 ? `<td rowspan="${rows.length}" style="${cellBorder} text-align:center; vertical-align:middle; font-weight:bold; ${baseFont}">${esc(row.weekLabel)}</td>` : ''}
          <td style="${cellBorder} text-align:center; ${baseFont}">${esc(row.dateLabel)}</td>
          <td style="${cellBorder} text-align:center; ${baseFont}">${esc(row.project) || '-'}</td>
          <td style="${cellBorder} text-align:left; padding-left:5px; ${baseFont}">${esc(row.description)}</td>
          <td style="${cellBorder} text-align:center; font-weight:bold; ${baseFont}">${esc(row.estimatedTime) || ''}</td>
          <td style="${cellBorder} text-align:left; padding-left:5px; ${baseFont}">${esc(row.remark) || ''}</td>
        </tr>`).join('');

      return `
        <p style="font-weight:bold; font-size:12pt; margin: 14px 0 4px 0;">3. 차주 예정 사항</p>
        <table style="border-collapse: collapse; width: 100%; border: 1.5pt solid #000000; ${baseFont}">
          <tr style="${yellowBg}">
            <th style="${cellBorder} ${yellowBg} width:10%;">Week</th>
            <th style="${cellBorder} ${yellowBg} width:11%;">Date</th>
            <th style="${cellBorder} ${yellowBg} width:15%;">Project</th>
            <th style="${cellBorder} ${yellowBg} width:44%;">Description</th>
            <th style="${cellBorder} ${yellowBg} width:10%;">Estimated Time</th>
            <th style="${cellBorder} ${yellowBg} width:10%;">Remark</th>
          </tr>
          ${bodyRows}
        </table>`;
    };

    // 표 4: No./Description/Remark
    const buildFeedbackTableHtml = () => {
      const bodyRows = reportTable4.map((row, idx) => `
        <tr>
          <td style="${cellBorder} text-align:center; ${baseFont}">${idx + 1}</td>
          <td style="${cellBorder} text-align:left; padding-left:5px; ${baseFont}">${esc(row.description)}</td>
          <td style="${cellBorder} text-align:left; padding-left:5px; ${baseFont}">${esc(row.remark) || ''}</td>
        </tr>`).join('');

      return `
        <p style="font-weight:bold; font-size:12pt; margin: 14px 0 4px 0;">4. 애로 및 요청 사항 / 피드백</p>
        <table style="border-collapse: collapse; width: 100%; border: 1.5pt solid #000000; ${baseFont}">
          <tr style="${yellowBg}">
            <th style="${cellBorder} ${yellowBg} width:8%;">No.</th>
            <th style="${cellBorder} ${yellowBg} width:72%;">Description</th>
            <th style="${cellBorder} ${yellowBg} width:20%;">Remark</th>
          </tr>
          ${bodyRows}
        </table>`;
    };

    // 상단 헤더 정보 표 (보고 기간 / 부서 / 작성자 / 비용)
    const headerInfoRows = `
      <tr>
        <td style="${cellBorder} ${yellowBg} font-weight:bold; text-align:center; width:14%;">보고 기간</td>
        <td colspan="5" style="${cellBorder} text-align:center; font-weight:bold;">${esc(reportStartDate)} ~ ${esc(reportEndDate)}</td>
      </tr>
      <tr>
        <td style="${cellBorder} ${yellowBg} font-weight:bold; text-align:center;">소속 부서</td>
        <td colspan="2" style="${cellBorder} text-align:center;">${esc(reportDepartment)}</td>
        <td style="${cellBorder} ${yellowBg} font-weight:bold; text-align:center;">작성자</td>
        <td colspan="2" style="${cellBorder} text-align:center;">${esc(reportAuthor)}</td>
      </tr>
      ${reportOption === 'B' ? `
      <tr>
        <td style="${cellBorder} ${yellowBg} font-weight:bold; text-align:center;">일간 비용</td>
        <td colspan="2" style="${cellBorder} text-align:right; padding-right:8px;">${reportExpenseDaily.toLocaleString()}원</td>
        <td style="${cellBorder} ${yellowBg} font-weight:bold; text-align:center;">주간 비용</td>
        <td colspan="2" style="${cellBorder} text-align:right; padding-right:8px;">${reportExpenseWeekly.toLocaleString()}원</td>
      </tr>
      <tr>
        <td style="${cellBorder} ${yellowBg} font-weight:bold; text-align:center;">월간 누적 비용</td>
        <td colspan="2" style="${cellBorder} text-align:right; padding-right:8px;">${reportExpenseMonthly.toLocaleString()}원</td>
        <td style="${cellBorder} ${yellowBg} font-weight:bold; text-align:center;">정산 총계</td>
        <td colspan="2" style="${cellBorder} text-align:right; padding-right:8px;">${(reportExpenseWeekly + reportExpenseMonthly).toLocaleString()}원</td>
      </tr>` : ''}
    `;

    const fullHtml = `
      <div style="text-align:center; margin-bottom:16px;">
        <span style="font-size:18pt; font-weight:bold; border-bottom: 3px double #000000; padding-bottom:4px;">${esc(reportTitle)}</span>
      </div>
      <table style="border-collapse: collapse; width:100%; border: 1.5pt solid #000000; ${baseFont} margin-bottom: 10px;">
        ${headerInfoRows}
      </table>
      ${buildMainTableHtml('1. 지난주 요일별 상세 실시 사항', reportTable1, 'Progress (%)', 'progress')}
      ${buildMainTableHtml('2. 금주 요일별 상세 실시 사항', reportTable2, 'Estimated Time', 'estimatedTime')}
      ${buildPlanTableHtml()}
      ${buildFeedbackTableHtml()}
    `;

    const excelContent = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
      <meta charset="utf-8">
      <!--[if gte mso 9]>
      <xml>
      <x:ExcelWorkbook>
      <x:ExcelWorksheets>
      <x:ExcelWorksheet>
      <x:Name>주간업무보고</x:Name>
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
      ${fullHtml}
      </body>
      </html>
    `;

    const blob = new Blob([excelContent], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const sanitizedTitle = (reportTitle || '주간업무보고').replace(/[\/\\?%*:|"<>]/g, '_');
    link.setAttribute('download', `${sanitizedTitle}.xls`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 비용 항목 추가/수정/삭제 헬퍼 함수
  const handleAddExpenseRow = () => {
    const newItem: WorkLogExpense = {
      id: `wle-${Date.now()}-${Math.random()}`,
      category: 'lunch',
      amount: 0,
      payMethod: 'company_card',
      memo: ''
    };
    setFormExpenses(prev => [...prev, newItem]);
  };

  const handleUpdateExpenseRow = (id: string, updates: Partial<WorkLogExpense>) => {
    setFormExpenses(prev => prev.map(exp => exp.id === id ? { ...exp, ...updates } : exp));
  };

  const handleRemoveExpenseRow = (id: string) => {
    setFormExpenses(prev => prev.filter(exp => exp.id !== id));
  };

  const handleReceiptScanComplete = (scanned: {
    amount: number;
    date: string;
    merchantName: string;
    memo: string;
    category: string;
    payMethod: string;
    receiptImage: string;
  }) => {
    if (scanningExpenseRowId) {
      handleUpdateExpenseRow(scanningExpenseRowId, {
        amount: scanned.amount,
        category: scanned.category as any,
        payMethod: scanned.payMethod as any,
        memo: scanned.merchantName ? `${scanned.merchantName} | ${scanned.memo || ''}`.replace(/ \| $/, '') : scanned.memo,
        receiptImage: scanned.receiptImage
      });
    } else {
      const newExpense: WorkLogExpense = {
        id: `wle-${Date.now()}-${Math.random()}`,
        category: scanned.category as any,
        amount: scanned.amount,
        payMethod: scanned.payMethod as any,
        memo: scanned.merchantName ? `${scanned.merchantName} | ${scanned.memo || ''}`.replace(/ \| $/, '') : scanned.memo,
        receiptImage: scanned.receiptImage
      };
      setFormExpenses(prev => [...prev, newExpense]);
    }
  };

  const getDayOfWeekKey = (dateStr: string): 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun' | null => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return null;
      const day = d.getDay(); // 0: 일, 1: 월, ... 6: 토
      const keys: ('sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat')[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
      return keys[day];
    } catch {
      return null;
    }
  };

  const findMatchingWeeklyLog = (dateStr: string): WeeklyWorkLog | null => {
    if (!dateStr) return null;
    return weeklyLogs.find(w => dateStr >= w.startDate && dateStr <= w.endDate) || null;
  };

  const handlePullDailyLogsForWeekly = () => {
    if (!formStartDate || !formEndDate) {
      alert('시작일과 종료일을 먼저 선택해주세요.');
      return;
    }
    
    const matchedDaily = dailyLogs.filter(dl => dl.date >= formStartDate && dl.date <= formEndDate);
    if (matchedDaily.length === 0) {
      alert('해당 기간에 작성된 일일 업무일지가 없습니다.');
      return;
    }
    
    let pullCount = 0;
    matchedDaily.forEach(dl => {
      const dayKey = getDayOfWeekKey(dl.date) as DayKey;
      if (dayKey) {
        setDayEntries((prev) => ({
          ...prev,
          [dayKey]: [{ id: `pull-${dl.id}`, content: dl.tasksToday, startTime: '', endTime: '' }]
        }));
        pullCount++;
      }
    });
    
    alert(`총 ${pullCount}일분의 일일 업무일지 내용을 요일별 실적으로 가져왔습니다.`);
  };

  // AI 정제 (AI Polish) 기능 가동
  const handleAiPolish = async (fieldName: string, currentText: string, setter: (val: string) => void) => {
    if (!currentText.trim()) {
      alert('정제할 내용을 먼저 입력해주세요.');
      return;
    }
    setAiPolishingField(fieldName);
    try {
      const res = await fetch('/api/worklogs/ai-polish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: currentText, type: activeSubTab, field: fieldName })
      });
      const data = await res.json();
      if (data.polishedText) {
        setter(data.polishedText);
      } else {
        alert(data.error || 'AI 정제에 실패했습니다. 다시 시도해보세요.');
      }
    } catch (err) {
      console.error(err);
      alert('정제 요청 중 연결 실패했습니다.');
    } finally {
      setAiPolishingField(null);
    }
  };

  // 저장 핸들러
  const handleSaveLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      alert('일지 제목을 입력해주세요.');
      return;
    }

    const headers = {
      'Content-Type': 'application/json',
      ...(currentUser ? { 'x-user-id': currentUser.id } : {})
    };

    let finalContactIds = [...formContactIds];

    if (useDirectContact && directContactName.trim()) {
      const newCardData = {
        name: directContactName.trim(),
        company: directContactCompany.trim() || formTitle || '직접 입력',
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
          headers,
          body: JSON.stringify(newCardData)
        });
        if (contactRes.ok) {
          const savedContact = await contactRes.json();
          setContacts(prev => [savedContact, ...prev]);
          finalContactIds.push(savedContact.id);
        }
      } catch (err) {
        console.error('Failed to save direct contact:', err);
        const fakeContactId = `c-${Date.now()}`;
        const fakeContact = { id: fakeContactId, ...newCardData, createdAt: new Date().toISOString(), callHistory: [] };
        setContacts(prev => [fakeContact as any, ...prev]);
        finalContactIds.push(fakeContactId);
      }
    }

    try {
      if (activeSubTab === 'daily') {
        const payload = {
          title: formTitle,
          author: formAuthor,
          department: formDepartment,
          date: formDate,
          tasksToday: getTodayComposedText(),
          taskEntriesToday: todayEntries,
          tasksTomorrow: formTasksTomorrow,
          issues: formIssues,
          projectIds: formProjectIds,
          contactIds: finalContactIds,
          expenses: formExpenses
        };

        if (editingLogId) {
          const res = await fetch(`/api/worklogs/daily/${editingLogId}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify(payload)
          }).then(r => r.json());
          setDailyLogs(prev => prev.map(l => l.id === editingLogId ? res : l));
        } else {
          const res = await fetch('/api/worklogs/daily', {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
          }).then(r => r.json());
          setDailyLogs(prev => [res, ...prev]);
        }

        // 주간 업무 보고 지난주 요일별 상세 실시 사항 연동
        const matchedWeekly = weeklyLogs.find(w => formDate >= w.startDate && formDate <= w.endDate);
        if (matchedWeekly) {
          const dayKey = getDayOfWeekKey(formDate);
          if (dayKey) {
            const nextAchievementsByDay = {
              ...(matchedWeekly.achievementsByDay || {}),
              [dayKey]: getTodayComposedText()
            };
            const nextAchievementEntriesByDay = {
              ...(matchedWeekly.achievementEntriesByDay || {}),
              [dayKey]: todayEntries
            };

            const dailyAchievementsList = [];
            if (nextAchievementsByDay.mon?.trim()) dailyAchievementsList.push(`[월요일]\n${nextAchievementsByDay.mon.trim()}`);
            if (nextAchievementsByDay.tue?.trim()) dailyAchievementsList.push(`[화요일]\n${nextAchievementsByDay.tue.trim()}`);
            if (nextAchievementsByDay.wed?.trim()) dailyAchievementsList.push(`[수요일]\n${nextAchievementsByDay.wed.trim()}`);
            if (nextAchievementsByDay.thu?.trim()) dailyAchievementsList.push(`[목요일]\n${nextAchievementsByDay.thu.trim()}`);
            if (nextAchievementsByDay.fri?.trim()) dailyAchievementsList.push(`[금요일]\n${nextAchievementsByDay.fri.trim()}`);
            if (nextAchievementsByDay.sat?.trim()) dailyAchievementsList.push(`[토요일]\n${nextAchievementsByDay.sat.trim()}`);
            if (nextAchievementsByDay.sun?.trim()) dailyAchievementsList.push(`[일요일]\n${nextAchievementsByDay.sun.trim()}`);

            const combinedAchievements = dailyAchievementsList.length > 0 
              ? dailyAchievementsList.join('\n\n')
              : matchedWeekly.achievementsThisWeek;

            const weeklyPayload = {
              ...matchedWeekly,
              achievementsThisWeek: combinedAchievements,
              achievementsByDay: nextAchievementsByDay,
              achievementEntriesByDay: nextAchievementEntriesByDay
            };

            try {
              const weeklyRes = await fetch(`/api/worklogs/weekly/${matchedWeekly.id}`, {
                method: 'PUT',
                headers,
                body: JSON.stringify(weeklyPayload)
              }).then(r => r.json());
              setWeeklyLogs(prev => prev.map(w => w.id === matchedWeekly.id ? weeklyRes : w));
            } catch (err) {
              console.error('Failed to sync with weekly log:', err);
            }
          }
        }
      } else {
        const dayLabels: Record<DayKey, string> = { mon: '월요일', tue: '화요일', wed: '수요일', thu: '목요일', fri: '금요일', sat: '토요일', sun: '일요일' };
        const dayKeysOrdered: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
        const dailyAchievementsList: string[] = [];
        dayKeysOrdered.forEach((day) => {
          const text = getDayComposedText(day);
          if (text.trim()) dailyAchievementsList.push(`[${dayLabels[day]}]\n${text.trim()}`);
        });

        const combinedAchievements = dailyAchievementsList.length > 0 
          ? dailyAchievementsList.join('\n\n')
          : formAchievementsThisWeek;

        const payload = {
          title: formTitle,
          author: formAuthor,
          department: formDepartment,
          startDate: formStartDate,
          endDate: formEndDate,
          achievementsThisWeek: combinedAchievements,
          achievementsByDay: {
            mon: getDayComposedText('mon'),
            tue: getDayComposedText('tue'),
            wed: getDayComposedText('wed'),
            thu: getDayComposedText('thu'),
            fri: getDayComposedText('fri'),
            sat: getDayComposedText('sat'),
            sun: getDayComposedText('sun')
          },
          achievementEntriesByDay: dayEntries,
          plansNextWeek: formPlansNextWeek,
          feedbacks: formFeedbacks,
          projectIds: formProjectIds,
          contactIds: finalContactIds,
          expenses: formExpenses
        };

        if (editingLogId) {
          const res = await fetch(`/api/worklogs/weekly/${editingLogId}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify(payload)
          }).then(r => r.json());
          setWeeklyLogs(prev => prev.map(l => l.id === editingLogId ? res : l));
        } else {
          const res = await fetch('/api/worklogs/weekly', {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
          }).then(r => r.json());
          setWeeklyLogs(prev => [res, ...prev]);
        }
      }
      setIsWriteModalOpen(false);
    } catch (err) {
      console.error('Save error:', err);
      alert('업무일지 저장 도중 오류가 발생했습니다.');
    }
  };

  // 삭제 핸들러
  const handleDeleteLog = async (id: string, type: 'daily' | 'weekly', e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('이 업무일지를 정말로 삭제하시겠습니까? 데이터는 즉시 제거됩니다.')) return;
    
    try {
      await fetch(`/api/worklogs/${type}/${id}`, {
        method: 'DELETE',
        headers: currentUser ? { 'x-user-id': currentUser.id } : undefined
      });
      if (type === 'daily') {
        setDailyLogs(prev => prev.filter(l => l.id !== id));
      } else {
        setWeeklyLogs(prev => prev.filter(l => l.id !== id));
      }
      if (expandedLogId === id) setExpandedLogId(null);
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  // 필터링 적용된 목록
  const filteredDailyLogs = dailyLogs.filter(log => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch = !q || (
      log.title.toLowerCase().includes(q) ||
      log.tasksToday.toLowerCase().includes(q) ||
      log.tasksTomorrow.toLowerCase().includes(q) ||
      (log.issues || '').toLowerCase().includes(q)
    );
    const matchesProject = selectedProjectFilter === 'all' || (log.projectIds || []).includes(selectedProjectFilter);
    const matchesContact = selectedContactFilter === 'all' || (log.contactIds || []).includes(selectedContactFilter);
    return matchesSearch && matchesProject && matchesContact;
  });

  const filteredWeeklyLogs = weeklyLogs.filter(log => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch = !q || (
      log.title.toLowerCase().includes(q) ||
      log.achievementsThisWeek.toLowerCase().includes(q) ||
      log.plansNextWeek.toLowerCase().includes(q) ||
      (log.feedbacks || '').toLowerCase().includes(q)
    );
    const matchesProject = selectedProjectFilter === 'all' || (log.projectIds || []).includes(selectedProjectFilter);
    const matchesContact = selectedContactFilter === 'all' || (log.contactIds || []).includes(selectedContactFilter);
    return matchesSearch && matchesProject && matchesContact;
  });

  // 엑셀 다운로드 (목록 전체)
  const downloadAllToExcel = () => {
    const isDaily = activeSubTab === 'daily';
    const dataToExport = isDaily ? filteredDailyLogs : filteredWeeklyLogs;
    
    if (dataToExport.length === 0) {
      alert('다운로드할 업무일지 데이터가 없습니다.');
      return;
    }

    const wsData: any[] = [];
    
    if (isDaily) {
      // Header for Daily Logs
      wsData.push([
        '일자',
        '작성자',
        '소속 부서',
        '제목',
        '금일 실시 사항',
        '명일 예정 사항',
        '특이 사항/미결 사항',
        '연관 프로젝트',
        '연관 거래처 인맥'
      ]);
      
      dataToExport.forEach((log: any) => {
        const projNames = projects
          .filter(p => (log.projectIds || []).includes(p.id))
          .map(p => p.name)
          .join(', ');
          
        const contactNames = contacts
          .filter(c => (log.contactIds || []).includes(c.id))
          .map(c => `${c.name} (${c.company})`)
          .join(', ');

        wsData.push([
          log.date || '',
          log.author || '',
          log.department || '',
          log.title || '',
          log.tasksToday || '',
          log.tasksTomorrow || '',
          log.issues || '',
          projNames || '',
          contactNames || ''
        ]);
      });
    } else {
      // Header for Weekly Logs
      wsData.push([
        '기간 (시작일)',
        '기간 (종료일)',
        '작성자',
        '소속 부서',
        '제목',
        '금주 실시 사항',
        '월요일 상세',
        '화요일 상세',
        '수요일 상세',
        '목요일 상세',
        '금요일 상세',
        '토요일 상세',
        '일요일 상세',
        '차주 예정 사항',
        '애로 및 건의 사항/피드백',
        '연관 프로젝트',
        '연관 거래처 인맥'
      ]);
      
      dataToExport.forEach((log: any) => {
        const projNames = projects
          .filter(p => (log.projectIds || []).includes(p.id))
          .map(p => p.name)
          .join(', ');
          
        const contactNames = contacts
          .filter(c => (log.contactIds || []).includes(c.id))
          .map(c => `${c.name} (${c.company})`)
          .join(', ');

        wsData.push([
          log.startDate || '',
          log.endDate || '',
          log.author || '',
          log.department || '',
          log.title || '',
          log.achievementsThisWeek || '',
          log.achievementsByDay?.mon || '',
          log.achievementsByDay?.tue || '',
          log.achievementsByDay?.wed || '',
          log.achievementsByDay?.thu || '',
          log.achievementsByDay?.fri || '',
          log.achievementsByDay?.sat || '',
          log.achievementsByDay?.sun || '',
          log.plansNextWeek || '',
          log.feedbacks || '',
          projNames || '',
          contactNames || ''
        ]);
      });
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // 컬럼 너비 자동 설정
    const colWidths = wsData[0].map((_: any, colIdx: number) => {
      let maxLen = 10;
      wsData.forEach(row => {
        const val = row[colIdx];
        if (val) {
          const strLen = val.toString().length;
          if (strLen > maxLen) {
            maxLen = Math.min(strLen, 40); // 최대 40자로 제한
          }
        }
      });
      return { wch: maxLen + 3 };
    });
    ws['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, isDaily ? '일일 업무일지' : '주간 업무일지');
    
    const fileName = isDaily 
      ? `일일업무일지_${new Date().toISOString().split('T')[0]}.xlsx`
      : `주간업무일지_${new Date().toISOString().split('T')[0]}.xlsx`;
      
    XLSX.writeFile(wb, fileName);
  };

  // 엑셀 다운로드 (개별 보고서 형태)
  const downloadSingleToExcel = (log: any, type: 'daily' | 'weekly') => {
    const isDaily = type === 'daily';
    const wsData: any[] = [];
    
    // 이쁘게 양식화된 보고서형 시트 구성
    wsData.push([log.title || (isDaily ? '일일 업무 보고서' : '주간 업무 보고서'), '', '', '']); // 제목행
    wsData.push(['']); // 여백
    
    if (isDaily) {
      wsData.push(['작성일자', log.date || '', '작성자', log.author || '-']);
      wsData.push(['소속 부서', log.department || '-', '연관 프로젝트', projects.filter(p => (log.projectIds || []).includes(p.id)).map(p => p.name).join(', ') || '-']);
      wsData.push(['연관 거래처 인맥', contacts.filter(c => (log.contactIds || []).includes(c.id)).map(c => `${c.name} (${c.company})`).join(', ') || '-', '', '']);
      wsData.push(['']); // 여백
      
      wsData.push(['[금일 실시 사항]']);
      wsData.push([log.tasksToday || '']);
      wsData.push(['']);
      
      wsData.push(['[명일 예정 사항]']);
      wsData.push([log.tasksTomorrow || '']);
      wsData.push(['']);
      
      if (log.issues) {
        wsData.push(['[특이 사항 / 미결 사항]']);
        wsData.push([log.issues]);
      }
    } else {
      wsData.push(['보고 기간', `${log.startDate} ~ ${log.endDate}`, '작성자', log.author || '-']);
      wsData.push(['소속 부서', log.department || '-', '연관 프로젝트', projects.filter(p => (log.projectIds || []).includes(p.id)).map(p => p.name).join(', ') || '-']);
      wsData.push(['연관 거래처 인맥', contacts.filter(c => (log.contactIds || []).includes(c.id)).map(c => `${c.name} (${c.company})`).join(', ') || '-', '', '']);
      wsData.push(['']); // 여백
      
      if (log.achievementsByDay && Object.values(log.achievementsByDay).some(v => typeof v === 'string' && (v as string).trim().length > 0)) {
        wsData.push(['[금주 요일별 상세 실시 사항]']);
        const days = [
          { k: 'mon', label: '월요일' },
          { k: 'tue', label: '화요일' },
          { k: 'wed', label: '수요일' },
          { k: 'thu', label: '목요일' },
          { k: 'fri', label: '금요일' },
          { k: 'sat', label: '토요일' },
          { k: 'sun', label: '일요일' }
        ];
        days.forEach(d => {
          const txt = log.achievementsByDay[d.k];
          if (txt && txt.trim()) {
            wsData.push([`• ${d.label}`]);
            wsData.push([txt]);
          }
        });
      } else {
        wsData.push(['[금주 실시 사항]']);
        wsData.push([log.achievementsThisWeek || '']);
      }
      wsData.push(['']);
      
      wsData.push(['[차주 예정 사항]']);
      wsData.push([log.plansNextWeek || '']);
      wsData.push(['']);
      
      if (log.feedbacks) {
        wsData.push(['[애로 및 건의 사항/피드백]']);
        wsData.push([log.feedbacks]);
      }
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // 제목 등 병합 설정
    const merges = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } } // A1:D1 병합
    ];
    
    // 내용이 긴 셀들 병합
    wsData.forEach((row, idx) => {
      if (row.length === 1 && row[0] && (row[0].startsWith('[') || row[0].startsWith('•') || idx > 4)) {
        merges.push({ s: { r: idx, c: 0 }, e: { r: idx, c: 3 } });
      }
    });
    
    ws['!merges'] = merges;
    
    // 열 너비 설정
    ws['!cols'] = [
      { wch: 15 },
      { wch: 35 },
      { wch: 15 },
      { wch: 35 }
    ];

    XLSX.utils.book_append_sheet(wb, ws, '업무 보고서');
    
    const sanitizedTitle = (log.title || '업무보고서').replace(/[\/\\?%*:|"<>]/g, '_');
    const fileName = `${sanitizedTitle}_${log.date || log.endDate || '보고서'}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  return (
    <div className="space-y-3">
      
      {/* 1. 상단 바: 탭 전환 및 신규 작성 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60 p-4 border border-slate-800 rounded-3xl backdrop-blur-md">
        <div className="flex items-center gap-2 bg-slate-950 p-1 rounded-2xl border border-slate-800">
          <button
            onClick={() => {
              setActiveSubTab('daily');
              setSearchQuery('');
              setSelectedProjectFilter('all');
              setSelectedContactFilter('all');
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              activeSubTab === 'daily'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>일일 업무일지</span>
            <span className="px-1.5 py-0.2 text-xs rounded-full bg-slate-800 text-slate-300 font-mono">
              {dailyLogs.length}
            </span>
          </button>
          
          <button
            onClick={() => {
              setActiveSubTab('weekly');
              setSearchQuery('');
              setSelectedProjectFilter('all');
              setSelectedContactFilter('all');
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              activeSubTab === 'weekly'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileCheck className="w-4 h-4" />
            <span>주간 업무일지</span>
            <span className="px-1.5 py-0.2 text-xs rounded-full bg-slate-800 text-slate-300 font-mono">
              {weeklyLogs.length}
            </span>
          </button>

          <button
            onClick={() => setActiveSubTab('monthly')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              activeSubTab === 'monthly'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>월간</span>
          </button>

          <button
            onClick={() => setActiveSubTab('report')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              activeSubTab === 'report'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Printer className="w-4 h-4" />
            <span>리포트 출력</span>
          </button>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleOpenNewLog}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl font-bold text-sm text-white shadow-lg transition-all active:scale-95 ${
              activeSubTab === 'daily'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-blue-500/20'
                : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 shadow-indigo-500/20'
            }`}
          >
            <Plus className="w-4 h-4" />
            <span>{activeSubTab === 'daily' ? '일일 일지 작성' : '주간 일지 작성'}</span>
          </button>
        </div>
      </div>

      {/* 2. 필터 영역 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* 검색 인풋 */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="업무 제목, 업무 내용 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-900 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-200 text-sm placeholder:text-slate-500 transition-all"
          />
        </div>

        {/* 프로젝트 필터 */}
        <div className="relative">
          <Briefcase className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <select
            value={selectedProjectFilter}
            onChange={(e) => setSelectedProjectFilter(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-900 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-200 text-sm appearance-none cursor-pointer placeholder:text-slate-500 transition-all"
          >
            <option value="all">연관 프로젝트: 전체</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
        </div>

        {/* 거래처 명함 필터 */}
        <div className="relative">
          <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <select
            value={selectedContactFilter}
            onChange={(e) => setSelectedContactFilter(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-900 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-200 text-sm appearance-none cursor-pointer placeholder:text-slate-500 transition-all"
          >
            <option value="all">연관 거래처 인맥: 전체</option>
            {contacts.map(c => (
              <option key={c.id} value={c.id}>{c.name} ({c.company})</option>
            ))}
          </select>
          <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
        </div>
      </div>

      {activeSubTab === 'monthly' ? (
        <div className="space-y-4">
          {/* 월 이동 헤더 */}
          <div className="flex items-center justify-between bg-slate-900/40 border border-slate-800/60 rounded-2xl p-4">
            <button
              type="button"
              onClick={() => setMonthCursor((prev) => { const d = new Date(prev); d.setMonth(d.getMonth() - 1); return d; })}
              className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 hover:text-white text-sm font-bold"
            >
              ‹ 이전달
            </button>
            <div className="flex items-center gap-2 text-slate-100 font-bold text-base">
              <Calendar className="w-4 h-4 text-emerald-400" />
              {monthCursor.getFullYear()}년 {monthCursor.getMonth() + 1}월
              <span className="text-[10px] text-slate-500 font-normal ml-2">같은 회사 직원 전체 업무 (일일+주간)</span>
            </div>
            <button
              type="button"
              onClick={() => setMonthCursor((prev) => { const d = new Date(prev); d.setMonth(d.getMonth() + 1); return d; })}
              className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 hover:text-white text-sm font-bold"
            >
              다음달 ›
            </button>
          </div>

          {/* 달력 그리드 */}
          {(() => {
            const year = monthCursor.getFullYear();
            const month = monthCursor.getMonth();
            const firstDay = new Date(year, month, 1);
            const startOffset = firstDay.getDay(); // 0=일
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const cells: (string | null)[] = [];
            for (let i = 0; i < startOffset; i++) cells.push(null);
            for (let d = 1; d <= daysInMonth; d++) {
              cells.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
            }
            const todayStr = new Date().toISOString().split('T')[0];
            const weekdayLabels = ['일', '월', '화', '수', '목', '금', '토'];

            return (
              <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-3">
                <div className="grid grid-cols-7 gap-1 mb-1">
                  {weekdayLabels.map((w, i) => (
                    <div key={w} className={`text-center text-[11px] font-bold py-1 ${i === 0 ? 'text-rose-400' : i === 6 ? 'text-blue-400' : 'text-slate-400'}`}>{w}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {cells.map((dateStr, idx) => {
                    if (!dateStr) return <div key={`empty-${idx}`} />;
                    const entries = getEntriesForDate(dateStr);
                    const dayNum = Number(dateStr.split('-')[2]);
                    const isToday = dateStr === todayStr;
                    const isSelected = dateStr === selectedCalendarDate;
                    return (
                      <button
                        type="button"
                        key={dateStr}
                        onClick={() => setSelectedCalendarDate(dateStr)}
                        className={`text-left p-1.5 rounded-lg border min-h-[64px] transition-all ${
                          isSelected ? 'bg-emerald-600/20 border-emerald-500/50' : isToday ? 'bg-indigo-950/40 border-indigo-500/40' : 'bg-slate-950/60 border-slate-800/60 hover:border-slate-700'
                        }`}
                      >
                        <div className={`text-[11px] font-bold mb-0.5 ${isToday ? 'text-indigo-300' : 'text-slate-400'}`}>{dayNum}</div>
                        <div className="space-y-0.5">
                          {entries.slice(0, 2).map((en) => (
                            <div key={en.id} className="text-[9px] leading-tight truncate text-emerald-300 bg-emerald-950/30 rounded px-1 py-0.5">
                              {en.time ? `${en.time} ` : ''}{en.author}
                            </div>
                          ))}
                          {entries.length > 2 && (
                            <div className="text-[9px] text-slate-500">+{entries.length - 2}건 더</div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* 선택한 날짜 상세 목록 */}
          <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-4 space-y-2">
            <div className="text-sm font-bold text-slate-200 flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-emerald-400" />
              {selectedCalendarDate} 업무 상세
            </div>
            {getEntriesForDate(selectedCalendarDate).length === 0 ? (
              <div className="text-xs text-slate-500 py-4 text-center">이 날짜에 작성된 업무 기록이 없습니다.</div>
            ) : (
              <div className="space-y-2">
                {getEntriesForDate(selectedCalendarDate).map((en) => (
                  <div key={en.id} className="bg-slate-950/60 border border-slate-800/60 rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <User className="w-3.5 h-3.5 text-indigo-400" />
                      <span className="text-xs font-bold text-slate-200">{en.author}</span>
                      {en.time && <span className="text-[10px] text-emerald-400 font-mono bg-emerald-950/30 px-1.5 py-0.5 rounded">{en.time}</span>}
                      <span className="text-[10px] text-slate-500 ml-auto">{en.source === 'daily' ? '일일 업무일지' : '주간 업무일지'}</span>
                    </div>
                    <div className="text-[11px] text-slate-400 mb-1">{en.title}</div>
                    <div className="text-xs text-slate-300 whitespace-pre-line leading-relaxed">{en.content}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : activeSubTab === 'report' ? (
        <div className="space-y-4">
          {/* 리포트 대상 주간 업무 선택 (차량관리의 '인쇄 대상 차량 선택'과 동일한 패턴) */}
          <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-4">
            <label className="text-xs text-slate-400 font-semibold block mb-1.5">리포트 대상 주간 업무 선택</label>
            <select
              value={selectedReportLog?.id || ''}
              onChange={(e) => {
                const log = weeklyLogs.find((l) => l.id === e.target.value);
                if (log) handleOpenReportModal(log);
              }}
              className="w-full sm:w-96 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-indigo-500"
            >
              <option value="">주간 업무 보고를 선택하세요...</option>
              {weeklyLogs.map((log) => (
                <option key={log.id} value={log.id}>
                  {log.title || `${log.startDate} ~ ${log.endDate}`}
                </option>
              ))}
            </select>
          </div>

          {!selectedReportLog && (
            <div className="bg-slate-900/40 border border-dashed border-slate-800 rounded-2xl py-16 text-center text-slate-500 text-sm">
              위에서 주간 업무 보고를 선택하면 리포트가 아래에 표시됩니다.
            </div>
          )}
        </div>
      ) : (
      <>
      {/* 3. 본문 목록 */}
      <div 
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="touch-pan-y space-y-4"
      >
        {/* 가로 슬라이딩 가이드 팁 */}
        <div className="flex items-center justify-center gap-2 text-xs text-slate-400 bg-slate-900/40 border border-slate-800/60 py-2.5 px-4 rounded-2xl max-w-sm mx-auto animate-pulse select-none">
          <Sparkles className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
          <span>💡 화면을 좌우로 쓸어넘겨 일일/주간 탭을 전환하세요</span>
        </div>

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center space-y-3">
          <div className="w-10 h-10 border-4 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
          <p className="text-slate-400 text-xs">업무일지 기록을 조회하는 중입니다...</p>
        </div>
      ) : (
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeSubTab}
            initial={{ opacity: 0, x: activeSubTab === 'daily' ? -15 : 15 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: activeSubTab === 'daily' ? 15 : -15 }}
            transition={{ duration: 0.2 }}
            className="w-full"
          >
            {(activeSubTab === 'daily' ? filteredDailyLogs : filteredWeeklyLogs).length === 0 ? (
              <div className="py-16 text-center bg-slate-900/40 border border-slate-800 rounded-3xl">
                <FileText className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-300 font-bold mb-1">작성된 업무일지가 없습니다</p>
                <p className="text-slate-500 text-xs">상단의 작성 단추를 눌러 첫 업무 기록을 남겨보세요.</p>
              </div>
            ) : (
        <div className="space-y-4">
          <AnimatePresence initial={false}>
            {(activeSubTab === 'daily' ? filteredDailyLogs : filteredWeeklyLogs).map((log: any) => {
              const isExpanded = expandedLogId === log.id;
              const relatedProjects = projects.filter(p => (log.projectIds || []).includes(p.id));
              const relatedContacts = contacts.filter(c => (log.contactIds || []).includes(c.id));
              
              return (
                <motion.div
                  key={log.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className={`bg-slate-900 border rounded-3xl overflow-hidden transition-all duration-300 shadow-lg ${
                    isExpanded 
                      ? activeSubTab === 'daily' ? 'border-blue-500/40 shadow-blue-500/5 bg-slate-900' : 'border-indigo-500/40 shadow-indigo-500/5 bg-slate-900'
                      : 'border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {/* 카드 헤더 클릭 시 아코디언 */}
                  <div
                    onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                    className="p-5 sm:p-6 flex items-center justify-between gap-4 cursor-pointer hover:bg-slate-850/30 select-none"
                  >
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className={`px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1 font-mono ${
                          activeSubTab === 'daily'
                            ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                            : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                        }`}>
                          <Calendar className="w-3 h-3" />
                          {activeSubTab === 'daily' ? log.date : `${log.startDate} ~ ${log.endDate}`}
                        </span>

                        {relatedProjects.map(rp => (
                          <span key={rp.id} className="px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1">
                            <Briefcase className="w-3 h-3 text-indigo-400" />
                            {rp.name}
                          </span>
                        ))}

                        {(log.author || log.department) && (
                          <span className="px-2.5 py-0.5 rounded-full bg-slate-800/80 text-slate-300 border border-slate-700/80 flex items-center gap-1.5">
                            <User className="w-3 h-3 text-emerald-400" />
                            {log.author && <span className="font-bold">{log.author}</span>}
                            {log.department && <span className="text-slate-400 text-[11px]">({log.department})</span>}
                          </span>
                        )}
                      </div>

                      <h3 className="text-base sm:text-lg font-bold text-slate-100 tracking-tight truncate">
                        {log.title}
                      </h3>
                    </div>

                    <div className="flex items-center gap-3">
                      {activeSubTab === 'weekly' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenReportModal(log);
                            setActiveSubTab('report');
                          }}
                          className="p-2 rounded-xl bg-slate-800 hover:bg-indigo-950 text-slate-400 hover:text-indigo-400 border border-slate-700 hover:border-indigo-900 transition-all cursor-pointer"
                          title="주간업무보고서 출력/인쇄"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          downloadSingleToExcel(log, activeSubTab);
                        }}
                        className="p-2 rounded-xl bg-slate-800 hover:bg-emerald-950 text-slate-400 hover:text-emerald-400 border border-slate-700 hover:border-emerald-900 transition-all cursor-pointer"
                        title="엑셀 다운로드"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenEditLog(log, activeSubTab);
                        }}
                        className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 transition-all"
                        title="수정하기"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      
                      <button
                        onClick={(e) => handleDeleteLog(log.id, activeSubTab, e)}
                        className="p-2 rounded-xl bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-400 border border-slate-700 hover:border-rose-900 transition-all"
                        title="삭제하기"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>

                      <div className={`p-1.5 rounded-xl bg-slate-800 border border-slate-700 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      </div>
                    </div>
                  </div>

                  {/* 확장 콘텐츠 */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: 'auto' }}
                        exit={{ height: 0 }}
                        className="overflow-hidden border-t border-slate-800/80"
                      >
                        <div className="p-5 sm:p-6 bg-slate-950/40 space-y-5 text-sm sm:text-base">
                          {activeSubTab === 'daily' ? (
                            <>
                              {/* 금일 실시 사항 */}
                              <div className="space-y-1.5">
                                <h4 className="font-bold text-slate-200 flex items-center gap-1.5">
                                  <CheckCircle className="w-4 h-4 text-blue-400" />
                                  <span>금일 실시 사항</span>
                                </h4>
                                <div className="bg-slate-900/60 border border-slate-850 p-4 rounded-2xl whitespace-pre-line text-slate-300 text-sm leading-relaxed">
                                  {log.tasksToday || '기재된 내용이 없습니다.'}
                                </div>
                              </div>

                              {/* 명일 예정 사항 */}
                              <div className="space-y-1.5">
                                <h4 className="font-bold text-slate-200 flex items-center gap-1.5">
                                  <Sparkles className="w-4 h-4 text-emerald-400" />
                                  <span>명일 예정 사항</span>
                                </h4>
                                <div className="bg-slate-900/60 border border-slate-850 p-4 rounded-2xl whitespace-pre-line text-slate-300 text-sm leading-relaxed">
                                  {log.tasksTomorrow || '기재된 내용이 없습니다.'}
                                </div>
                              </div>

                              {/* 특이 사항 */}
                              {log.issues && (
                                <div className="space-y-1.5">
                                  <h4 className="font-bold text-rose-400 flex items-center gap-1.5">
                                    <AlertCircle className="w-4 h-4" />
                                    <span>미결 및 특이 사항</span>
                                  </h4>
                                  <div className="bg-rose-500/5 border border-rose-500/10 p-4 rounded-2xl whitespace-pre-line text-rose-300 text-sm leading-relaxed">
                                    {log.issues}
                                  </div>
                                </div>
                              )}
                            </>
                          ) : (
                            <>
                              {/* 금주 실시 사항 */}
                              <div className="space-y-2">
                                <h4 className="font-bold text-slate-200 flex items-center gap-1.5">
                                  <CheckCircle className="w-4 h-4 text-indigo-400" />
                                  <span>금주 실시 사항 (일별 상세)</span>
                                </h4>
                                
                                {log.achievementsByDay && Object.values(log.achievementsByDay).some(v => typeof v === 'string' && (v as string).trim().length > 0) ? (
                                  <div className="grid grid-cols-1 gap-3">
                                    {[
                                      { key: 'mon', label: '월요일' },
                                      { key: 'tue', label: '화요일' },
                                      { key: 'wed', label: '수요일' },
                                      { key: 'thu', label: '목요일' },
                                      { key: 'fri', label: '금요일' },
                                      { key: 'sat', label: '토요일' },
                                      { key: 'sun', label: '일요일' },
                                    ].map(day => {
                                      const text = log.achievementsByDay[day.key];
                                      if (!text || !text.trim()) return null;
                                      return (
                                        <div key={day.key} className="border-l-4 border-indigo-500/50 p-3 rounded-r-2xl bg-slate-900/40 text-sm">
                                          <div className="font-bold text-xs text-slate-400 mb-1 flex items-center gap-1">
                                            <span className={`w-1.5 h-1.5 rounded-full ${
                                              day.key === 'mon' ? 'bg-indigo-400' : 
                                              day.key === 'tue' ? 'bg-blue-400' : 
                                              day.key === 'wed' ? 'bg-teal-400' : 
                                              day.key === 'thu' ? 'bg-amber-400' : 
                                              day.key === 'fri' ? 'bg-purple-400' : 
                                              day.key === 'sat' ? 'bg-rose-400' : 
                                              'bg-emerald-400'
                                            }`} />
                                            {day.label}
                                          </div>
                                          <div className="whitespace-pre-line text-slate-300 leading-relaxed pl-2.5">
                                            {text}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <div className="bg-slate-900/60 border border-slate-850 p-4 rounded-2xl whitespace-pre-line text-slate-300 text-sm leading-relaxed">
                                    {log.achievementsThisWeek || '기재된 내용이 없습니다.'}
                                  </div>
                                )}
                              </div>

                              {/* 차주 예정 사항 */}
                              <div className="space-y-1.5">
                                <h4 className="font-bold text-slate-200 flex items-center gap-1.5">
                                  <Sparkles className="w-4 h-4 text-purple-400" />
                                  <span>차주 예정 사항</span>
                                </h4>
                                <div className="bg-slate-900/60 border border-slate-850 p-4 rounded-2xl whitespace-pre-line text-slate-300 text-sm leading-relaxed">
                                  {log.plansNextWeek || '기재된 내용이 없습니다.'}
                                </div>
                              </div>

                              {/* 피드백 */}
                              {log.feedbacks && (
                                <div className="space-y-1.5">
                                  <h4 className="font-bold text-amber-400 flex items-center gap-1.5">
                                    <AlertCircle className="w-4 h-4" />
                                    <span>애로 및 건의 사항 / 피드백</span>
                                  </h4>
                                  <div className="bg-amber-500/5 border border-amber-500/10 p-4 rounded-2xl whitespace-pre-line text-amber-300 text-sm leading-relaxed">
                                    {log.feedbacks}
                                  </div>
                                </div>
                              )}
                            </>
                          )}

                          {/* 등록된 지출 비용 표시 */}
                          {log.expenses && log.expenses.length > 0 && (
                            <div className="pt-3 border-t border-slate-800/60 space-y-2">
                              <h4 className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
                                <Receipt className="w-3.5 h-3.5 text-emerald-400" />
                                <span>첨부된 지출 비용 내역</span>
                                <span className="text-[10px] text-slate-500 font-mono">({log.expenses.length}건, 총 {log.expenses.reduce((sum: number, e: any) => sum + (e.amount || 0), 0).toLocaleString()}원)</span>
                              </h4>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {log.expenses.map((expense: any) => {
                                  // Find if matched vehicle
                                  const v = vehicles.find(veh => veh.id === expense.vehicleId);
                                  
                                  // Mapped Labels
                                  const categoryLabels: Record<string, string> = {
                                    breakfast: '아침식사',
                                    lunch: '점심식사',
                                    dinner: '저녁식사',
                                    drinks: '음료&커피',
                                    fuel: '주유비',
                                    parking: '주차비',
                                    proxy: '대리운전비',
                                    purchase: '물건 구입',
                                    custom: expense.categoryCustom || '직접 입력'
                                  };
                                  
                                  const payMethodLabels: Record<string, string> = {
                                    company_card: '법인카드',
                                    personal_card: '개인카드',
                                    cash_personal: '현금(개인)',
                                    cash_company: '현금(법인)'
                                  };

                                  return (
                                    <div key={expense.id} className="p-3 rounded-2xl bg-slate-900 border border-slate-850 flex flex-col justify-between space-y-1.5 shadow-sm">
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-xs font-bold text-slate-300">
                                            {categoryLabels[expense.category] || expense.category}
                                          </span>
                                          {expense.receiptImage && (
                                            <button
                                              type="button"
                                              onClick={() => setViewingReceiptImage(expense.receiptImage)}
                                              className="inline-flex items-center gap-0.5 text-[10px] text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 px-1.5 py-0.5 rounded border border-indigo-500/20 cursor-pointer"
                                              title="스캔된 영수증 이미지 보기"
                                            >
                                              <Eye className="w-3 h-3" />
                                              <span>영수증</span>
                                            </button>
                                          )}
                                        </div>
                                        <span className="text-xs font-mono font-bold text-emerald-400">
                                          {Number(expense.amount || 0).toLocaleString()}원
                                        </span>
                                      </div>
                                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                                        <span className="bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800 text-[10px]">
                                          {payMethodLabels[expense.payMethod] || expense.payMethod}
                                        </span>
                                        {expense.memo && (
                                          <span className="truncate max-w-[150px]" title={expense.memo}>
                                            | {expense.memo}
                                          </span>
                                        )}
                                        {v && (
                                          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/5 border border-emerald-500/10 px-1.5 py-0.5 rounded-md font-medium ml-auto">
                                            <span className="w-1 h-1 rounded-full bg-emerald-400" />
                                            차량연동: {v.modelName}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* 연관 명함 거래처 인맥 */}
                          {relatedContacts.length > 0 && (
                            <div className="pt-2 border-t border-slate-800/60 space-y-1.5">
                              <h4 className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
                                <User className="w-3.5 h-3.5 text-blue-400" />
                                <span>연관 거래처 인맥</span>
                              </h4>
                              <div className="flex flex-wrap gap-2">
                                {relatedContacts.map(rc => (
                                  <span key={rc.id} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-900 border border-slate-850 text-xs text-slate-300 shadow-sm font-medium">
                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                    {rc.name} <span className="text-slate-500">({rc.company})</span>
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
          </motion.div>
        </AnimatePresence>
      )}
      </div>
      </>
      )}

      {/* 4. 일지 작성 및 수정 Overlay 모달 */}
      <AnimatePresence>
        {isWriteModalOpen && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            {/* 배경 블러 */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsWriteModalOpen(false)}
              className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm"
            />

            {/* 모달 윈도우 */}
            <div className="flex min-h-screen items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 z-10"
              >
                {/* 닫기 단추 */}
                <button
                  onClick={() => setIsWriteModalOpen(false)}
                  className="absolute top-5 right-5 p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>

                {/* 제목 */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className={`p-2 rounded-xl text-white ${
                      activeSubTab === 'daily' ? 'bg-blue-600 shadow-lg shadow-blue-500/20' : 'bg-indigo-600 shadow-lg shadow-indigo-500/20'
                    }`}>
                      {activeSubTab === 'daily' ? <FileText className="w-5 h-5" /> : <FileCheck className="w-5 h-5" />}
                    </div>
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-100">
                      {editingLogId ? '업무일지 수정' : activeSubTab === 'daily' ? '일일 업무일지 작성' : '주간 업무일지 작성'}
                    </h2>
                  </div>
                  <p className="text-xs text-slate-400">명확하고 논리적인 업무 성과 정리를 지원합니다.</p>
                </div>

                <form onSubmit={handleSaveLog} className="space-y-5">
                  {/* 날짜 선택 및 일지 제목 */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {activeSubTab === 'daily' ? (
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-300">작성 일자</label>
                        <input
                          type="date"
                          value={formDate}
                          onChange={(e) => {
                            setFormDate(e.target.value);
                            if (!editingLogId) setFormTitle(`${e.target.value} 일일 업무일지`);
                          }}
                          className="w-full px-4 py-2.5 rounded-2xl bg-slate-950 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-200 text-sm font-mono"
                        />
                      </div>
                    ) : (
                      <>
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-300">시작일</label>
                          <input
                            type="date"
                            value={formStartDate}
                            onChange={(e) => {
                              setFormStartDate(e.target.value);
                              if (!editingLogId) setFormTitle(`${e.target.value} ~ ${formEndDate} 주간 업무일지`);
                            }}
                            className="w-full px-4 py-2.5 rounded-2xl bg-slate-950 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-200 text-sm font-mono"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-300">종료일</label>
                          <input
                            type="date"
                            value={formEndDate}
                            onChange={(e) => {
                              setFormEndDate(e.target.value);
                              if (!editingLogId) setFormTitle(`${formStartDate} ~ ${e.target.value} 주간 업무일지`);
                            }}
                            className="w-full px-4 py-2.5 rounded-2xl bg-slate-950 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-200 text-sm font-mono"
                          />
                        </div>
                      </>
                    )}

                    <div className={`${activeSubTab === 'daily' ? 'sm:col-span-2' : 'sm:col-span-1'} space-y-1.5`}>
                      <label className="text-xs font-bold text-slate-300">일지 제목</label>
                      <input
                        type="text"
                        placeholder="예: 삼성전자 제안 회의 및 후속 협의 건"
                        value={formTitle}
                        onChange={(e) => setFormTitle(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-2xl bg-slate-950 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-200 text-sm"
                        required
                      />
                    </div>
                  </div>

                  {/* 작성자 및 부서 정보 */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-300">작성자</label>
                      <input
                        type="text"
                        placeholder="작성자 이름"
                        value={formAuthor}
                        onChange={(e) => setFormAuthor(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-2xl bg-slate-950 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-200 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-300">소속 부서</label>
                      <input
                        type="text"
                        placeholder="예: 영업부, 마케팅팀"
                        value={formDepartment}
                        onChange={(e) => setFormDepartment(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-2xl bg-slate-950 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-200 text-sm"
                      />
                    </div>
                  </div>

                  {/* 일지 내용 - 동적 전환 */}
                  {activeSubTab === 'daily' ? (
                    <div className="space-y-4">
                      {/* 주간 보고 연동 안내 */}
                      {(() => {
                        const matchedWeekly = findMatchingWeeklyLog(formDate);
                        const dayKey = getDayOfWeekKey(formDate);
                        if (matchedWeekly && dayKey) {
                          const dayLabel = dayKey === 'mon' ? '월요일' : dayKey === 'tue' ? '화요일' : dayKey === 'wed' ? '수요일' : dayKey === 'thu' ? '목요일' : dayKey === 'fri' ? '금요일' : dayKey === 'sat' ? '토요일' : '일요일';
                          const weeklyText = matchedWeekly.achievementsByDay?.[dayKey] || '';
                          const weeklyStructured = matchedWeekly.achievementEntriesByDay?.[dayKey];
                          
                          return (
                            <div className="bg-indigo-950/40 border border-indigo-900/30 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                              <div className="space-y-1">
                                <p className="text-slate-200 font-bold flex items-center gap-1.5">
                                  <Link2 className="w-3.5 h-3.5 text-indigo-400" />
                                  <span>주간 업무 보고와 연동 가능 ({matchedWeekly.startDate} ~ {matchedWeekly.endDate})</span>
                                </p>
                                <p className="text-slate-400 text-[11px] leading-normal">
                                  {weeklyText 
                                    ? `해당 주간 보고의 [${dayLabel}] 실적이 존재합니다: "${weeklyText.length > 50 ? weeklyText.slice(0, 50) + '...' : weeklyText}"` 
                                    : `해당 주간 보고의 [${dayLabel}] 실적이 비어 있습니다. 일지 저장 시 주간 보고에도 자동 반영됩니다.`}
                                </p>
                              </div>
                              {weeklyText && getTodayComposedText() !== weeklyText && (
                                <button
                                  type="button"
                                  onClick={() => setTodayEntries(weeklyStructured?.length ? weeklyStructured : legacyTextToEntries(weeklyText))}
                                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-550 active:scale-95 text-white font-bold rounded-xl transition-all shrink-0 shadow-md shadow-indigo-600/10"
                                >
                                  주간 실적 가져오기
                                </button>
                              )}
                            </div>
                          );
                        }
                        return null;
                      })()}

                      {/* 금일 실시 사항 (하루에 여러 건, 각각 시작~종료 시간 지정 가능) */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                          <CheckCircle className="w-3.5 h-3.5 text-blue-400" />
                          <span>금일 실시 사항</span>
                        </label>
                        <div className="space-y-2">
                          {todayEntries.length === 0 && (
                            <div className="text-xs text-slate-500 text-center py-4 bg-slate-950/40 rounded-xl border border-dashed border-slate-800">
                              아직 등록된 업무가 없습니다. 아래 "+ 업무 항목 추가"를 눌러 시작해보세요.
                            </div>
                          )}
                          {todayEntries.map((entry) => (
                            <div key={entry.id} className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <label className="text-[10px] text-slate-500 font-semibold shrink-0">시작</label>
                                <input
                                  type="time"
                                  value={entry.startTime || ''}
                                  onChange={(e) => updateTodayEntry(entry.id, { startTime: e.target.value })}
                                  className="px-2 py-1 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 w-[6.5rem] focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                                <label className="text-[10px] text-slate-500 font-semibold shrink-0">종료</label>
                                <input
                                  type="time"
                                  value={entry.endTime || ''}
                                  onChange={(e) => updateTodayEntry(entry.id, { endTime: e.target.value })}
                                  className="px-2 py-1 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 w-[6.5rem] focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleAiPolish(`tasksToday_${entry.id}`, entry.content, (val) => updateTodayEntry(entry.id, { content: val }))}
                                  disabled={aiPolishingField !== null}
                                  className="ml-auto flex items-center gap-1 text-[10px] font-bold text-blue-400 hover:text-blue-300 bg-blue-500/10 border border-blue-500/20 px-2 py-1 rounded-lg transition-all"
                                >
                                  <Sparkles className="w-3 h-3" />
                                  <span>{aiPolishingField === `tasksToday_${entry.id}` ? '정제 중...' : 'AI 정제'}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeTodayEntry(entry.id)}
                                  className="text-rose-400 hover:text-rose-300 text-xs font-bold px-1.5"
                                  title="이 항목 삭제"
                                >
                                  ✕
                                </button>
                              </div>
                              <textarea
                                rows={2}
                                placeholder="이 시간대에 한 업무 내용을 입력하세요..."
                                value={entry.content}
                                onChange={(e) => updateTodayEntry(entry.id, { content: e.target.value })}
                                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-200 text-xs placeholder:text-slate-600 leading-relaxed"
                              />
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={addTodayEntry}
                            className="w-full py-2.5 rounded-xl border border-dashed border-slate-700 text-slate-400 hover:text-white hover:border-blue-500 text-xs font-bold transition-all"
                          >
                            + 업무 항목 추가 (시간대별로 여러 건 가능)
                          </button>
                        </div>
                      </div>

                      {/* 명일 예정 사항 */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                            <span>명일 예정 사항</span>
                          </label>
                          <button
                            type="button"
                            onClick={() => handleAiPolish('tasksTomorrow', formTasksTomorrow, setFormTasksTomorrow)}
                            disabled={aiPolishingField !== null}
                            className="flex items-center gap-1 text-[11px] font-bold text-blue-400 hover:text-blue-300 bg-blue-500/10 border border-blue-500/20 px-2 py-1 rounded-lg transition-all"
                          >
                            <Sparkles className="w-3 h-3" />
                            <span>{aiPolishingField === 'tasksTomorrow' ? '정제 중...' : 'AI 업무정제'}</span>
                          </button>
                        </div>
                        <textarea
                          rows={3}
                          placeholder="다음 영업일 진행 예정인 계획을 적어주세요."
                          value={formTasksTomorrow}
                          onChange={(e) => setFormTasksTomorrow(e.target.value)}
                          className="w-full px-4 py-3 rounded-2xl bg-slate-950 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-200 text-sm placeholder:text-slate-600 leading-relaxed"
                          required
                        />
                      </div>

                      {/* 특이 사항 */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                          <span>미결 및 특이 사항 (선택)</span>
                        </label>
                        <textarea
                          rows={2}
                          placeholder="특이 사항이나 부서 간 미결 조율 안건이 있다면 작성해주세요."
                          value={formIssues}
                          onChange={(e) => setFormIssues(e.target.value)}
                          className="w-full px-4 py-3 rounded-2xl bg-slate-950 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-200 text-sm placeholder:text-slate-600 leading-relaxed"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* 금주 실시 사항 */}
                      <div className="space-y-3 bg-slate-950/40 p-4 border border-slate-800/80 rounded-2xl">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                            <CheckCircle className="w-3.5 h-3.5 text-indigo-400" />
                            <span>금주 실시 사항 (일별 작성)</span>
                          </label>
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={handlePullDailyLogsForWeekly}
                              className="flex items-center gap-1 text-[11px] font-bold text-blue-400 hover:text-blue-300 bg-blue-500/10 border border-blue-500/20 px-2.5 py-1.5 rounded-xl transition-all"
                            >
                              <Link2 className="w-3.5 h-3.5" />
                              <span>일일 일지 가져오기</span>
                            </button>
                          </div>
                        </div>

                        {/* 요일 탭 선택기 */}
                        <div className="grid grid-cols-7 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-850">
                          {([
                            { id: 'mon', label: '월' },
                            { id: 'tue', label: '화' },
                            { id: 'wed', label: '수' },
                            { id: 'thu', label: '목' },
                            { id: 'fri', label: '금' },
                            { id: 'sat', label: '토' },
                            { id: 'sun', label: '일' },
                          ] as { id: DayKey; label: string }[]).map(day => {
                            const isSelected = activeDayTab === day.id;
                            const hasContent = dayHasContent(day.id);
                            return (
                              <button
                                key={day.id}
                                type="button"
                                onClick={() => setActiveDayTab(day.id as any)}
                                className={`relative py-2 text-xs font-bold rounded-lg transition-all ${
                                  isSelected 
                                    ? 'bg-indigo-600 text-white shadow-md' 
                                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                                }`}
                              >
                                <span>{day.label}</span>
                                {hasContent && !isSelected && (
                                  <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                )}
                              </button>
                            );
                          })}
                        </div>

                        {/* 선택된 요일의 업무 항목들 (하루에 여러 건, 각각 시작~종료 시간 지정 가능) */}
                        <div className="space-y-2">
                          {(dayEntries[activeDayTab] || []).length === 0 && (
                            <div className="text-xs text-slate-500 text-center py-4 bg-slate-950/40 rounded-xl border border-dashed border-slate-800">
                              아직 등록된 업무가 없습니다. 아래 "+ 업무 항목 추가"를 눌러 시작해보세요.
                            </div>
                          )}
                          {(dayEntries[activeDayTab] || []).map((entry) => (
                            <div key={entry.id} className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <label className="text-[10px] text-slate-500 font-semibold shrink-0">시작</label>
                                <input
                                  type="time"
                                  value={entry.startTime || ''}
                                  onChange={(e) => updateDayEntry(activeDayTab, entry.id, { startTime: e.target.value })}
                                  className="px-2 py-1 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 w-[6.5rem] focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                />
                                <label className="text-[10px] text-slate-500 font-semibold shrink-0">종료</label>
                                <input
                                  type="time"
                                  value={entry.endTime || ''}
                                  onChange={(e) => updateDayEntry(activeDayTab, entry.id, { endTime: e.target.value })}
                                  className="px-2 py-1 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 w-[6.5rem] focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleAiPolish(`achievements_${activeDayTab}_${entry.id}`, entry.content, (val) => updateDayEntry(activeDayTab, entry.id, { content: val }))}
                                  disabled={aiPolishingField !== null}
                                  className="ml-auto flex items-center gap-1 text-[10px] font-bold text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-2 py-1 rounded-lg transition-all"
                                >
                                  <Sparkles className="w-3 h-3" />
                                  <span>{aiPolishingField === `achievements_${activeDayTab}_${entry.id}` ? '정제 중...' : 'AI 정제'}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeDayEntry(activeDayTab, entry.id)}
                                  className="text-rose-400 hover:text-rose-300 text-xs font-bold px-1.5"
                                  title="이 항목 삭제"
                                >
                                  ✕
                                </button>
                              </div>
                              <textarea
                                rows={2}
                                placeholder="이 시간대에 한 업무 내용을 입력하세요..."
                                value={entry.content}
                                onChange={(e) => updateDayEntry(activeDayTab, entry.id, { content: e.target.value })}
                                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-200 text-xs placeholder:text-slate-600 leading-relaxed"
                              />
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() => addDayEntry(activeDayTab)}
                            className="w-full py-2.5 rounded-xl border border-dashed border-slate-700 text-slate-400 hover:text-white hover:border-indigo-500 text-xs font-bold transition-all"
                          >
                            + 업무 항목 추가 (시간대별로 여러 건 가능)
                          </button>
                        </div>
                      </div>

                      {/* 차주 예정 사항 */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                            <span>차주 예정 사항</span>
                          </label>
                          <button
                            type="button"
                            onClick={() => handleAiPolish('plansNextWeek', formPlansNextWeek, setFormPlansNextWeek)}
                            disabled={aiPolishingField !== null}
                            className="flex items-center gap-1 text-[11px] font-bold text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-2 py-1 rounded-lg transition-all"
                          >
                            <Sparkles className="w-3 h-3" />
                            <span>{aiPolishingField === 'plansNextWeek' ? '정제 중...' : 'AI 업무정제'}</span>
                          </button>
                        </div>
                        <textarea
                          rows={3}
                          placeholder="다음 주 진행 계획을 세분화하여 입력하세요."
                          value={formPlansNextWeek}
                          onChange={(e) => setFormPlansNextWeek(e.target.value)}
                          className="w-full px-4 py-3 rounded-2xl bg-slate-950 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-200 text-sm placeholder:text-slate-600 leading-relaxed"
                          required
                        />
                      </div>

                      {/* 애로 및 건의 사항 / 피드백 */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                          <span>애로 및 건의 사항 / 피드백 (선택)</span>
                        </label>
                        <textarea
                          rows={2}
                          placeholder="비즈니스 지원이 필요하거나 애로 사항이 있는 부분을 적어주세요."
                          value={formFeedbacks}
                          onChange={(e) => setFormFeedbacks(e.target.value)}
                          className="w-full px-4 py-3 rounded-2xl bg-slate-950 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-200 text-sm placeholder:text-slate-600 leading-relaxed"
                        />
                      </div>
                    </div>
                  )}

                  {/* 비용 지출 추가 영역 */}
                  <div className="pt-4 border-t border-slate-800/60 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Receipt className="w-4 h-4 text-emerald-400" />
                        <span className="text-sm font-bold text-slate-200 font-sans">비용 지출 추가 (선택)</span>
                        <span className="text-[10px] text-slate-500 hidden sm:inline">차량 연결 시 비용 관리로 자동 연동</span>
                      </div>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setScanningExpenseRowId(null);
                            setIsReceiptModalOpen(true);
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 text-indigo-400 hover:text-indigo-300 font-bold text-xs transition-all active:scale-95 cursor-pointer"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                          <span>AI 영수증 인식 추가</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleAddExpenseRow}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 hover:text-emerald-300 font-bold text-xs transition-all active:scale-95"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>비용 항목 추가</span>
                        </button>
                      </div>
                    </div>

                    {formExpenses.length === 0 ? (
                      <div className="text-center py-4 border border-dashed border-slate-800/80 rounded-2xl bg-slate-950/40">
                        <p className="text-xs text-slate-500">추가된 비용 지출 내역이 없습니다. (위의 '+ 비용 항목 추가' 버튼을 눌러 추가하세요)</p>
                      </div>
                    ) : (
                      <div className="space-y-3 max-h-[280px] overflow-y-auto pr-1">
                        {formExpenses.map((expense) => (
                          <div
                            key={expense.id}
                            className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/85 hover:border-slate-700/80 transition-all space-y-3 relative group"
                          >
                            <div className="absolute top-4 right-4 flex gap-1.5 z-10">
                              {expense.receiptImage && (
                                <button
                                  type="button"
                                  onClick={() => setViewingReceiptImage(expense.receiptImage)}
                                  className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 text-emerald-400 hover:text-emerald-300 transition-all text-xs flex items-center gap-1 cursor-pointer"
                                  title="영수증 원본 보기"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span className="text-[10px] hidden md:inline">영수증 보기</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setScanningExpenseRowId(expense.id);
                                  setIsReceiptModalOpen(true);
                                }}
                                className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-indigo-500/30 text-indigo-400 hover:text-indigo-300 transition-all text-xs flex items-center gap-1 cursor-pointer"
                                title="이 항목에 영수증 스캔/연동"
                              >
                                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                                <span className="text-[10px] hidden md:inline">AI 영수증 스캔</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveExpenseRow(expense.id)}
                                className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-rose-500/30 text-slate-500 hover:text-rose-400 transition-all cursor-pointer"
                                title="삭제"
                              >
                                <Trash className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              {/* 1. 카테고리 선택 */}
                              <div className="space-y-1">
                                <label className="text-[11px] font-semibold text-slate-400">지출 분류</label>
                                <select
                                  value={expense.category}
                                  onChange={(e) => handleUpdateExpenseRow(expense.id, { category: e.target.value as any })}
                                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                >
                                  <option value="breakfast">아침식사</option>
                                  <option value="lunch">점심식사</option>
                                  <option value="dinner">저녁식사</option>
                                  <option value="drinks">음료&커피</option>
                                  <option value="fuel">주유비</option>
                                  <option value="parking">주차비</option>
                                  <option value="proxy">대리운전비</option>
                                  <option value="purchase">물건 구입</option>
                                  <option value="custom">직접 입력</option>
                                </select>
                              </div>

                              {/* 2. 결제 수단 선택 */}
                              <div className="space-y-1">
                                <label className="text-[11px] font-semibold text-slate-400">결제 수단</label>
                                <select
                                  value={expense.payMethod}
                                  onChange={(e) => handleUpdateExpenseRow(expense.id, { payMethod: e.target.value as any })}
                                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                >
                                  <option value="company_card">법인(회사)카드</option>
                                  <option value="personal_card">개인카드</option>
                                  <option value="cash_personal">현금(개인)</option>
                                  <option value="cash_company">현금(법인(회사))</option>
                                </select>
                              </div>

                              {/* 3. 금액 */}
                              <div className="space-y-1">
                                <label className="text-[11px] font-semibold text-slate-400">금액 (원)</label>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  placeholder="금액 입력"
                                  value={expense.amount ? formatCurrencyInput(expense.amount) : ''}
                                  onChange={(e) => handleUpdateExpenseRow(expense.id, { amount: parseCurrencyInput(e.target.value) })}
                                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                                />
                              </div>
                            </div>

                            {/* 상세 내용 및 연동 */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {/* 직접 입력일 때 분류 이름 */}
                              {expense.category === 'custom' && (
                                <div className="space-y-1">
                                  <label className="text-[11px] font-semibold text-slate-400">지출 분류명 직접 입력</label>
                                  <input
                                    type="text"
                                    placeholder="예: 퀵서비스 비용"
                                    value={expense.categoryCustom || ''}
                                    onChange={(e) => handleUpdateExpenseRow(expense.id, { categoryCustom: e.target.value })}
                                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                  />
                                </div>
                              )}

                              {/* 차량 연동 선택 */}
                              <div className="space-y-1">
                                <label className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
                                  <span>통합 차량 관리 연동</span>
                                  <span className="text-[9px] text-emerald-400 bg-emerald-500/10 px-1 rounded">비용관리 연계</span>
                                </label>
                                <select
                                  value={expense.vehicleId || ''}
                                  onChange={(e) => handleUpdateExpenseRow(expense.id, { vehicleId: e.target.value || undefined })}
                                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                >
                                  <option value="">차량 미선택 (연동 안 함)</option>
                                  {vehicles.map(v => (
                                    <option key={v.id} value={v.id}>
                                      {v.modelName} ({v.plateNumber})
                                    </option>
                                  ))}
                                </select>
                              </div>

                              {/* 메모 */}
                              <div className={`space-y-1 ${expense.category === 'custom' ? '' : 'sm:col-span-2'}`}>
                                <label className="text-[11px] font-semibold text-slate-400">지출 상세 내용 / 적요</label>
                                <input
                                  type="text"
                                  placeholder="예: 점심 식대 결제, 소모품 구입 등"
                                  value={expense.memo || ''}
                                  onChange={(e) => handleUpdateExpenseRow(expense.id, { memo: e.target.value })}
                                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 연관 프로젝트 및 거래처 매핑 (CRM 연동) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-slate-800/60">
                    {/* 연관 프로젝트 멀티플 선택 */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                        <Briefcase className="w-3.5 h-3.5 text-indigo-400" />
                        <span>연관 프로젝트 연결</span>
                      </label>
                      <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3 max-h-[120px] overflow-y-auto space-y-2">
                        {projects.length === 0 ? (
                          <p className="text-xs text-slate-600 text-center py-2">등록된 프로젝트가 없습니다.</p>
                        ) : (
                          projects.map(p => {
                            const isSelected = formProjectIds.includes(p.id);
                            return (
                              <button
                                type="button"
                                key={p.id}
                                onClick={() => {
                                  if (isSelected) {
                                    setFormProjectIds(prev => prev.filter(id => id !== p.id));
                                  } else {
                                    setFormProjectIds(prev => [...prev, p.id]);
                                  }
                                }}
                                className={`w-full flex items-center justify-between text-left px-3 py-1.5 rounded-xl text-xs transition-all ${
                                  isSelected 
                                    ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30' 
                                    : 'bg-slate-900/60 text-slate-400 hover:bg-slate-800'
                                }`}
                              >
                                <span className="truncate pr-2 font-medium">{p.name}</span>
                                {isSelected ? <Check className="w-3.5 h-3.5 flex-shrink-0" /> : null}
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>

                    {/* 연관 거래처 매핑 멀티플 선택 */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-blue-400" />
                        <span>연관 거래처 인맥 연결</span>
                      </label>
                      <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3 max-h-[120px] overflow-y-auto space-y-2">
                        {contacts.length === 0 ? (
                          <p className="text-xs text-slate-600 text-center py-2">등록된 거래처 인맥이 없습니다.</p>
                        ) : (
                          contacts.map(c => {
                            const isSelected = formContactIds.includes(c.id);
                            return (
                              <button
                                type="button"
                                key={c.id}
                                onClick={() => {
                                  if (isSelected) {
                                    setFormContactIds(prev => prev.filter(id => id !== c.id));
                                  } else {
                                    setFormContactIds(prev => [...prev, c.id]);
                                  }
                                }}
                                className={`w-full flex items-center justify-between text-left px-3 py-1.5 rounded-xl text-xs transition-all ${
                                  isSelected 
                                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' 
                                    : 'bg-slate-900/60 text-slate-400 hover:bg-slate-800'
                                }`}
                              >
                                <span className="truncate pr-2 font-medium">{c.name} <span className="text-[10px] text-slate-500">({c.company})</span></span>
                                {isSelected ? <Check className="w-3.5 h-3.5 flex-shrink-0" /> : null}
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 거래처 인맥 직접 추가 */}
                  <div className="border border-slate-800/80 bg-slate-950/40 rounded-xl p-3.5 space-y-3 mt-4 text-xs">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={useDirectContact}
                        onChange={(e) => setUseDirectContact(e.target.checked)}
                        className="rounded border-slate-700 bg-slate-900 text-indigo-500 focus:ring-0 focus:ring-offset-0"
                      />
                      <span className="text-slate-300 font-semibold">새로운 담당자 직접 입력하여 연결 (등록된 거래처가 없을 경우)</span>
                    </label>

                    {useDirectContact && (
                      <div className="grid grid-cols-2 gap-3.5 pt-2 animate-fadeIn">
                        <div>
                          <label className="block text-slate-400 text-[10px] font-semibold mb-1">담당자 성함 *</label>
                          <input
                            type="text"
                            value={directContactName}
                            onChange={(e) => setDirectContactName(e.target.value)}
                            placeholder="예: 홍길동"
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white outline-none focus:border-indigo-500 text-xs"
                            required={useDirectContact}
                          />
                        </div>
                        <div>
                          <label className="block text-slate-400 text-[10px] font-semibold mb-1">회사/기관명</label>
                          <input
                            type="text"
                            value={directContactCompany}
                            onChange={(e) => setDirectContactCompany(e.target.value)}
                            placeholder="예: 현대건설"
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white outline-none focus:border-indigo-500 text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-400 text-[10px] font-semibold mb-1">부서</label>
                          <input
                            type="text"
                            value={directContactDept}
                            onChange={(e) => setDirectContactDept(e.target.value)}
                            placeholder="예: 구매팀"
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white outline-none focus:border-indigo-500 text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-400 text-[10px] font-semibold mb-1">직책</label>
                          <input
                            type="text"
                            value={directContactTitle}
                            onChange={(e) => setDirectContactTitle(e.target.value)}
                            placeholder="예: 과장"
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white outline-none focus:border-indigo-500 text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-400 text-[10px] font-semibold mb-1">연락처(직장)</label>
                          <input
                            type="text"
                            value={directContactPhoneOffice}
                            onChange={(e) => setDirectContactPhoneOffice(e.target.value)}
                            placeholder="예: 02-1234-5678"
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white outline-none focus:border-indigo-500 text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-400 text-[10px] font-semibold mb-1">연락처(핸드폰)</label>
                          <input
                            type="text"
                            value={directContactPhoneMobile}
                            onChange={(e) => setDirectContactPhoneMobile(e.target.value)}
                            placeholder="예: 010-1234-5678"
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white outline-none focus:border-indigo-500 text-xs"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-slate-400 text-[10px] font-semibold mb-1">이메일 주소</label>
                          <input
                            type="email"
                            value={directContactEmail}
                            onChange={(e) => setDirectContactEmail(e.target.value)}
                            placeholder="예: buyer@company.com"
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white outline-none focus:border-indigo-500 text-xs"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 하단 액션 단추 */}
                  <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800/60">
                    <button
                      type="button"
                      onClick={() => setIsWriteModalOpen(false)}
                      className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-sm border border-slate-700 transition-colors"
                    >
                      취소
                    </button>
                    <button
                      type="submit"
                      className={`px-6 py-2.5 rounded-xl font-bold text-sm text-white shadow-lg transition-all active:scale-95 flex items-center gap-1.5 ${
                        activeSubTab === 'daily'
                          ? 'bg-blue-600 hover:bg-blue-500 shadow-blue-500/10'
                          : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-500/10'
                      }`}
                    >
                      <Check className="w-4 h-4" />
                      <span>{editingLogId ? '수정 반영' : '일지 저장'}</span>
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* 4. 주간 업무보고서 출력 (리포트 출력 탭 안에 임베드되어 표시됨, 차량관리 리포트 출력과 동일한 방식) */}
      <AnimatePresence>
        {activeSubTab === 'report' && selectedReportLog && (
          <div className="w-full select-none">
            {/* 인쇄 스타일 인젝션 */}
            <style>{`
              @media print {
                /* 전체 페이지 여백 제거 및 배경 흰색 강제 */
                body {
                  background: white !important;
                  color: black !important;
                  margin: 0 !important;
                  padding: 0 !important;
                }
                /* 화면의 나머지 UI는 안 보이게 하되(visibility), display:none은 쓰지 않음 
                   → display:none으로 숨기면 그 안의 자식 요소는 아무리 다시 보이게 해도 렌더링이 안 되기 때문에,
                   중첩된 위치에 있는 인쇄 대상(#printable-report-wrapper)이 나오지 않는 문제가 생김 */
                body * {
                  visibility: hidden !important;
                  transform: none !important;
                }
                #printable-report-wrapper,
                #printable-report-wrapper * {
                  visibility: visible !important;
                }
                #printable-report-wrapper {
                  display: block !important;
                  position: fixed !important;
                  left: 0 !important;
                  top: 0 !important;
                  width: 210mm !important;
                  height: auto !important;
                  max-height: none !important;
                  overflow: visible !important;
                  margin: 0 !important;
                  padding: 12mm !important;
                  background: white !important;
                  box-shadow: none !important;
                  border: none !important;
                  -webkit-print-color-adjust: exact !important;
                  print-color-adjust: exact !important;
                }
                #printable-report-wrapper * {
                  color: black !important;
                  border-color: black !important;
                }
                #printable-report-wrapper .yellow-header {
                  background-color: #FFFF00 !important;
                  -webkit-print-color-adjust: exact !important;
                  print-color-adjust: exact !important;
                }
                /* 스크롤바나 불필요한 UI 숨김 */
                .no-print {
                  display: none !important;
                }
                /* 인쇄시 입력창 테두리 완전 제거 및 투명화 */
                input, textarea, select {
                  border: none !important;
                  box-shadow: none !important;
                  outline: none !important;
                  background: transparent !important;
                  appearance: none !important;
                  resize: none !important;
                }
                @page {
                  size: A4 portrait;
                  margin: 0;
                }
              }
            `}</style>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 30 }}
              className="relative w-full max-w-[215mm] mx-auto bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl flex flex-col my-0 sm:my-4 overflow-hidden"
            >
              {/* 비인쇄 상단 바 (no-print) */}
              <div className="no-print p-4 sm:p-5 border-b border-slate-800 bg-slate-900/90 flex flex-col sm:flex-row sm:items-center justify-between gap-4 sticky top-0 z-10">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                    <Printer className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-slate-100 tracking-tight">
                      주간 업무 보고서 리포트 생성기
                    </h2>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={downloadReportToExcel}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-500/15 active:scale-95 transition-all cursor-pointer"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>엑셀 다운로드</span>
                  </button>
                  <button
                    onClick={handlePrintReport}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-500/15 active:scale-95 transition-all cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>인쇄 / PDF 저장</span>
                  </button>
                  <button
                    onClick={() => setSelectedReportLog(null)}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700 transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* 편집 컨트롤 바 (no-print) */}
              <div className="no-print p-4 sm:px-6 bg-slate-950/40 border-b border-slate-800 grid grid-cols-2 sm:grid-cols-6 gap-3 text-xs text-slate-300">
                <div className="space-y-1">
                  <label className="font-bold text-slate-400">보고서 양식</label>
                  <div className="flex bg-slate-900 p-0.5 rounded-xl border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setReportOption('A')}
                      className={`flex-1 py-1.5 px-2 rounded-lg text-center font-bold text-[11px] transition-all cursor-pointer ${
                        reportOption === 'A'
                          ? 'bg-indigo-600 text-white shadow'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      옵션 A
                    </button>
                    <button
                      type="button"
                      onClick={() => setReportOption('B')}
                      className={`flex-1 py-1.5 px-2 rounded-lg text-center font-bold text-[11px] transition-all cursor-pointer ${
                        reportOption === 'B'
                          ? 'bg-indigo-600 text-white shadow'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      옵션 B
                    </button>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-400">부서명</label>
                  <input
                    type="text"
                    value={reportDepartment}
                    onChange={(e) => setReportDepartment(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-400">작성자</label>
                  <input
                    type="text"
                    value={reportAuthor}
                    onChange={(e) => setReportAuthor(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-400">일간 비용 (원)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={reportExpenseDaily ? formatCurrencyInput(reportExpenseDaily) : ''}
                    onChange={(e) => setReportExpenseDaily(parseCurrencyInput(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-400">주간 비용 (원)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={reportExpenseWeekly ? formatCurrencyInput(reportExpenseWeekly) : ''}
                    onChange={(e) => setReportExpenseWeekly(parseCurrencyInput(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1 col-span-2 sm:col-span-1">
                  <label className="font-bold text-slate-400">월간 비용 (원)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={reportExpenseMonthly ? formatCurrencyInput(reportExpenseMonthly) : ''}
                    onChange={(e) => setReportExpenseMonthly(parseCurrencyInput(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-xs font-mono"
                  />
                </div>
              </div>

              {/* 주간업무보고 인쇄 프리뷰 종이 영역 (A4 사이즈 모방) */}
              <div className="flex-1 overflow-y-auto bg-slate-950 p-4 sm:p-8 flex justify-center">
                <div
                  id="printable-report-wrapper"
                  className="w-full max-w-[210mm] bg-white text-black p-6 sm:p-10 shadow-2xl rounded-sm text-xs font-sans select-text leading-tight"
                >
                  {/* 보고서 내부 제목 */}
                  <div className="text-center mb-6">
                    <div className="inline-block border-b-4 border-double border-black pb-1 px-4">
                      <input
                        type="text"
                        value={reportTitle}
                        onChange={(e) => setReportTitle(e.target.value)}
                        className="bg-transparent border-0 outline-none text-xl sm:text-2xl font-extrabold text-black text-center focus:ring-0 p-0"
                      />
                    </div>
                  </div>

                  {/* 1단계: 보고 기간 / 부서 / 작성자 헤더 테이블 */}
                  <table className="w-full border-collapse border-[1.5px] border-black text-xs text-center font-sans mb-6">
                    <tbody>
                      <tr>
                        <td className="border border-black font-extrabold yellow-header p-2 w-[15%] text-black">보고 기간</td>
                        <td className="border border-black p-2 text-left pl-4 w-[85%] text-black font-semibold" colSpan={3}>
                          {reportStartDate} ~ {reportEndDate}
                        </td>
                      </tr>
                      <tr>
                        <td className="border border-black font-extrabold yellow-header p-2 w-[15%] text-black">소속 부서</td>
                        <td className="border border-black p-2 text-left pl-4 w-[35%] text-black font-semibold">
                          {reportDepartment}
                        </td>
                        <td className="border border-black font-extrabold yellow-header p-2 w-[15%] text-black">작성자</td>
                        <td className="border border-black p-2 text-left pl-4 w-[35%] text-black font-semibold">
                          {reportAuthor}
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  {/* 옵션 B인 경우 비용 정산 요약 테이블 추가 노출 */}
                  {reportOption === 'B' && (
                    <div className="mb-6 animate-fadeIn">
                      <h3 className="text-left font-extrabold text-[12px] text-black mb-2 flex items-center gap-1.5">
                        <span>비용 정산 요약 및 연동 현황</span>
                        <span className="no-print text-[10px] text-emerald-600 font-normal">(옵션 B 선택 시 노출)</span>
                      </h3>
                      <table className="w-full border-collapse border-[1.5px] border-black text-xs text-center font-sans">
                        <tbody>
                          <tr className="bg-yellow-50">
                            <td className="border border-black font-extrabold yellow-header p-2 w-[25%] text-black">일간 비용 합계</td>
                            <td className="border border-black font-extrabold yellow-header p-2 w-[25%] text-black">주간 비용 합계</td>
                            <td className="border border-black font-extrabold yellow-header p-2 w-[25%] text-black">월간 누적 비용</td>
                            <td className="border border-black font-extrabold yellow-header p-2 w-[25%] text-black">정산 총계 (주간+월간)</td>
                          </tr>
                          <tr>
                            <td className="border border-black p-2 font-mono font-bold text-slate-900">
                              {reportExpenseDaily.toLocaleString()}원
                            </td>
                            <td className="border border-black p-2 font-mono font-bold text-indigo-700">
                              {reportExpenseWeekly.toLocaleString()}원
                            </td>
                            <td className="border border-black p-2 font-mono font-bold text-emerald-700">
                              {reportExpenseMonthly.toLocaleString()}원
                            </td>
                            <td className="border border-black p-2 font-mono font-extrabold text-rose-600">
                              {(reportExpenseWeekly + reportExpenseMonthly).toLocaleString()}원
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Section 1: 지난주 요일별 상세 실시 사항 */}
                  <div className="mb-6">
                    <h3 className="text-left font-extrabold text-[12px] text-black mb-2 flex items-center gap-1.5">
                      <span>1. 지난주 요일별 상세 실시 사항</span>
                      <span className="no-print text-[10px] text-indigo-600 font-normal">(마우스 클릭 후 텍스트 편집 가능)</span>
                    </h3>
                    <table className="w-full border-collapse border-[1.5px] border-black text-xs text-black">
                      <thead>
                        <tr className="bg-yellow-100 text-black text-[10.5px]">
                          <th className="border border-black p-2 font-extrabold w-[8%] text-center yellow-header">Week</th>
                          <th className="border border-black p-2 font-extrabold w-[9%] text-center yellow-header">Date</th>
                          <th className="border border-black p-2 font-extrabold w-[13%] text-center yellow-header">Project</th>
                          <th className="border border-black p-2 font-extrabold w-[35%] text-center yellow-header">Description</th>
                          <th className="border border-black p-2 font-extrabold w-[8%] text-center yellow-header">Progress (%)</th>
                          <th className="border border-black p-2 font-extrabold w-[15%] text-center yellow-header" colSpan={2}>Expenses (비용)</th>
                        </tr>
                        <tr className="bg-yellow-50 text-black text-[9.5px]">
                          <th className="border border-black p-1 yellow-header" colSpan={5}></th>
                          <th className="border border-black p-1 font-bold text-center yellow-header w-[10%]">Description</th>
                          <th className="border border-black p-1 font-bold text-center yellow-header w-[5%]">Won</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportTable1.map((row, index) => (
                          <tr key={row.id}>
                            {index === 0 && (
                              <td
                                rowSpan={reportTable1.length}
                                className="border border-black p-2 font-bold text-center align-middle bg-white text-[11px] w-[8%]"
                              >
                                {row.weekLabel}
                              </td>
                            )}
                            <td className="border border-black p-2 font-medium text-center bg-white text-[10.5px] w-[9%] align-middle">
                              {row.dateLabel}
                            </td>
                            <td className="border border-black p-1 text-center bg-white w-[13%] align-middle">
                              <input
                                type="text"
                                value={row.project || ''}
                                onChange={(e) => handleTable1Change(row.id, 'project', e.target.value)}
                                placeholder="-"
                                className="w-full bg-transparent border-0 outline-none text-[10.5px] text-center text-black p-1 focus:ring-0"
                              />
                            </td>
                            <td className="border border-black p-1 text-left bg-white w-[35%] align-middle">
                              <textarea
                                value={row.description}
                                onChange={(e) => handleTable1Change(row.id, 'description', e.target.value)}
                                rows={row.description.split('\n').length || 2}
                                className="w-full bg-transparent border-0 outline-none text-[10.5px] text-black leading-normal p-1 focus:ring-0 resize-y whitespace-pre-wrap"
                              />
                            </td>
                            <td className="border border-black p-1 text-center bg-white w-[8%] align-middle">
                              <input
                                type="text"
                                value={row.progress}
                                onChange={(e) => handleTable1Change(row.id, 'progress', e.target.value)}
                                className="w-full bg-transparent border-0 outline-none text-[10.5px] font-semibold text-center text-black p-1 focus:ring-0"
                              />
                            </td>
                            <td className="border border-black p-1 text-left bg-white w-[10%] align-middle">
                              {(row.expenseItems && row.expenseItems.length > 0) ? row.expenseItems.map((exp: any) => (
                                <div key={exp.id} className="text-[10px] leading-tight py-0.5">{exp.description}</div>
                              )) : <span className="text-[10px] text-slate-400">-</span>}
                            </td>
                            <td className="border border-black p-1 text-right bg-white w-[5%] align-middle font-mono">
                              {(row.expenseItems && row.expenseItems.length > 0) ? row.expenseItems.map((exp: any) => (
                                <div key={exp.id} className="text-[10px] leading-tight py-0.5">{exp.amount.toLocaleString()}</div>
                              )) : <span className="text-[10px] text-slate-400">-</span>}
                            </td>
                          </tr>
                        ))}
                        <tr>
                          <td colSpan={5} className="border border-black p-1.5 text-right font-bold bg-yellow-50 text-[10.5px]">계</td>
                          <td colSpan={2} className="border border-black p-1.5 text-right font-bold bg-yellow-50 text-[10.5px] font-mono">
                            {reportTable1.reduce((sum, r: any) => sum + (r.expenseItems || []).reduce((s: number, e: any) => s + e.amount, 0), 0).toLocaleString()}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Section 2: 금주 요일별 상세 실시 사항 */}
                  <div className="mb-6">
                    <h3 className="text-left font-extrabold text-[12px] text-black mb-2">
                      2. 금주 요일별 상세 실시 사항
                    </h3>
                    <table className="w-full border-collapse border-[1.5px] border-black text-xs text-black">
                      <thead>
                        <tr className="bg-yellow-100 text-black text-[10.5px]">
                          <th className="border border-black p-2 font-extrabold w-[8%] text-center yellow-header">Week</th>
                          <th className="border border-black p-2 font-extrabold w-[9%] text-center yellow-header">Date</th>
                          <th className="border border-black p-2 font-extrabold w-[13%] text-center yellow-header">Project</th>
                          <th className="border border-black p-2 font-extrabold w-[35%] text-center yellow-header">Description</th>
                          <th className="border border-black p-2 font-extrabold w-[8%] text-center yellow-header">Estimated Time</th>
                          <th className="border border-black p-2 font-extrabold w-[15%] text-center yellow-header" colSpan={2}>Expenses (비용)</th>
                        </tr>
                        <tr className="bg-yellow-50 text-black text-[9.5px]">
                          <th className="border border-black p-1 yellow-header" colSpan={5}></th>
                          <th className="border border-black p-1 font-bold text-center yellow-header w-[10%]">Description</th>
                          <th className="border border-black p-1 font-bold text-center yellow-header w-[5%]">Won</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportTable2.map((row, index) => (
                          <tr key={row.id}>
                            {index === 0 && (
                              <td
                                rowSpan={reportTable2.length}
                                className="border border-black p-2 font-bold text-center align-middle bg-white text-[11px] w-[8%]"
                              >
                                {row.weekLabel}
                              </td>
                            )}
                            <td className="border border-black p-2 font-medium text-center bg-white text-[10.5px] w-[9%] align-middle">
                              {row.dateLabel}
                            </td>
                            <td className="border border-black p-1 text-center bg-white w-[13%] align-middle">
                              <input
                                type="text"
                                value={row.project || ''}
                                onChange={(e) => handleTable2Change(row.id, 'project', e.target.value)}
                                placeholder="-"
                                className="w-full bg-transparent border-0 outline-none text-[10.5px] text-center text-black p-1 focus:ring-0"
                              />
                            </td>
                            <td className="border border-black p-1 text-left bg-white w-[35%] align-middle">
                              <textarea
                                value={row.description}
                                onChange={(e) => handleTable2Change(row.id, 'description', e.target.value)}
                                rows={row.description.split('\n').length || 2}
                                className="w-full bg-transparent border-0 outline-none text-[10.5px] text-black leading-normal p-1 focus:ring-0 resize-y whitespace-pre-wrap"
                              />
                            </td>
                            <td className="border border-black p-1 text-center bg-white w-[8%] align-middle">
                              <input
                                type="text"
                                value={row.estimatedTime}
                                onChange={(e) => handleTable2Change(row.id, 'estimatedTime', e.target.value)}
                                className="w-full bg-transparent border-0 outline-none text-[10.5px] font-semibold text-center text-black p-1 focus:ring-0"
                              />
                            </td>
                            <td className="border border-black p-1 text-left bg-white w-[10%] align-middle">
                              {(row.expenseItems && row.expenseItems.length > 0) ? row.expenseItems.map((exp: any) => (
                                <div key={exp.id} className="text-[10px] leading-tight py-0.5">{exp.description}</div>
                              )) : <span className="text-[10px] text-slate-400">-</span>}
                            </td>
                            <td className="border border-black p-1 text-right bg-white w-[5%] align-middle font-mono">
                              {(row.expenseItems && row.expenseItems.length > 0) ? row.expenseItems.map((exp: any) => (
                                <div key={exp.id} className="text-[10px] leading-tight py-0.5">{exp.amount.toLocaleString()}</div>
                              )) : <span className="text-[10px] text-slate-400">-</span>}
                            </td>
                          </tr>
                        ))}
                        <tr>
                          <td colSpan={5} className="border border-black p-1.5 text-right font-bold bg-yellow-50 text-[10.5px]">계</td>
                          <td colSpan={2} className="border border-black p-1.5 text-right font-bold bg-yellow-50 text-[10.5px] font-mono">
                            {reportTable2.reduce((sum, r: any) => sum + (r.expenseItems || []).reduce((s: number, e: any) => s + e.amount, 0), 0).toLocaleString()}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Section 3: 차주 예정 사항 */}
                  <div className="mb-6">
                    <h3 className="text-left font-extrabold text-[12px] text-black mb-2">
                      3. 차주 예정 사항
                    </h3>
                    <table className="w-full border-collapse border-[1.5px] border-black text-xs text-black">
                      <thead>
                        <tr className="bg-yellow-100 text-black text-[10.5px]">
                          <th className="border border-black p-2 font-extrabold w-[10%] text-center yellow-header">Week</th>
                          <th className="border border-black p-2 font-extrabold w-[11%] text-center yellow-header">Date</th>
                          <th className="border border-black p-2 font-extrabold w-[15%] text-center yellow-header">Project</th>
                          <th className="border border-black p-2 font-extrabold w-[44%] text-center yellow-header">Description</th>
                          <th className="border border-black p-2 font-extrabold w-[10%] text-center yellow-header">Estimated Time</th>
                          <th className="border border-black p-2 font-extrabold w-[10%] text-center yellow-header">Remark</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportTable3.map((row, index) => (
                          <tr key={row.id}>
                            {index === 0 && (
                              <td
                                rowSpan={reportTable3.length}
                                className="border border-black p-2 font-bold text-center align-middle bg-white text-[11px] w-[10%]"
                              >
                                {row.weekLabel}
                              </td>
                            )}
                            <td className="border border-black p-2 font-medium text-center bg-white text-[10.5px] w-[11%] align-middle">
                              {row.dateLabel}
                            </td>
                            <td className="border border-black p-1 text-center bg-white w-[15%] align-middle">
                              <input
                                type="text"
                                value={(row as any).project || ''}
                                onChange={(e) => handleTable3Change(row.id, 'project', e.target.value)}
                                placeholder="-"
                                className="w-full bg-transparent border-0 outline-none text-[10.5px] text-center text-black p-1 focus:ring-0"
                              />
                            </td>
                            <td className="border border-black p-1 text-left bg-white w-[44%] align-middle">
                              <textarea
                                value={row.description}
                                onChange={(e) => handleTable3Change(row.id, 'description', e.target.value)}
                                rows={row.description.split('\n').length || 2}
                                className="w-full bg-transparent border-0 outline-none text-[10.5px] text-black leading-normal p-1 focus:ring-0 resize-y whitespace-pre-wrap"
                              />
                            </td>
                            <td className="border border-black p-1 text-center bg-white w-[10%] align-middle">
                              <input
                                type="text"
                                value={row.estimatedTime}
                                onChange={(e) => handleTable3Change(row.id, 'estimatedTime', e.target.value)}
                                className="w-full bg-transparent border-0 outline-none text-[10.5px] font-semibold text-center text-black p-1 focus:ring-0"
                              />
                            </td>
                            <td className="border border-black p-1 text-left bg-white w-[10%] align-middle">
                              <input
                                type="text"
                                value={row.remark}
                                onChange={(e) => handleTable3Change(row.id, 'remark', e.target.value)}
                                className="w-full bg-transparent border-0 outline-none text-[10.5px] text-black p-1 focus:ring-0"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Section 4: 애로 및 건의사항 / 피드백 */}
                  <div className="mb-2">
                    <h3 className="text-left font-extrabold text-[12px] text-black mb-2">
                      4. 애로 및 건의사항 / 피드백
                    </h3>
                    <table className="w-full border-collapse border border-black text-xs text-black">
                      <tbody>
                        {reportTable4.map((row, index) => (
                          <tr key={row.id}>
                            <td className="border border-black p-2 bg-white text-left text-[10.5px] leading-relaxed align-middle">
                              <div className="flex gap-2 items-start w-full">
                                <span className="font-semibold shrink-0">{index + 1}.</span>
                                <textarea
                                  value={row.description}
                                  onChange={(e) => handleTable4Change(row.id, 'description', e.target.value)}
                                  rows={row.description.split('\n').length || 1}
                                  className="w-full bg-transparent border-0 outline-none text-[10.5px] text-black leading-relaxed p-0 focus:ring-0 resize-y whitespace-pre-wrap"
                                />
                                <button
                                  type="button"
                                  onClick={() => setReportTable4(prev => prev.filter(i => i.id !== row.id))}
                                  className="no-print text-rose-500 hover:text-rose-700 text-xs px-1 font-bold shrink-0 ml-auto cursor-pointer"
                                  title="피드백 삭제"
                                >
                                  ×
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="no-print mt-2 flex justify-start">
                      <button
                        type="button"
                        onClick={() => setReportTable4(prev => [...prev, { id: `t4-new-${Date.now()}`, description: '', remark: '' }])}
                        className="text-xs font-bold text-indigo-600 hover:text-indigo-500 flex items-center gap-1 cursor-pointer bg-indigo-500/10 hover:bg-indigo-500/20 px-3 py-1.5 rounded-xl transition-all"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>애로 및 건의사항 추가</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* 비인쇄 하단 제어 바 (no-print) */}
              <div className="no-print p-4 sm:p-5 border-t border-slate-800 bg-slate-900/90 flex items-center justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setSelectedReportLog(null)}
                  className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs border border-slate-700 transition-colors cursor-pointer"
                >
                  닫기
                </button>
                <button
                  type="button"
                  onClick={downloadReportToExcel}
                  className="flex items-center gap-1.5 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-500/15 active:scale-95 transition-all cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>엑셀 다운로드</span>
                </button>
                <button
                  type="button"
                  onClick={handlePrintReport}
                  className="flex items-center gap-1.5 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-500/15 active:scale-95 transition-all cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>지금 인쇄 / PDF 저장</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 5. 영수증 자동 스캔 모달 */}
      <AnimatePresence>
        {isReceiptModalOpen && (
          <ReceiptScanModal
            expenseType="worklog"
            onClose={() => {
              setIsReceiptModalOpen(false);
              setScanningExpenseRowId(null);
            }}
            onScanComplete={handleReceiptScanComplete}
          />
        )}
      </AnimatePresence>

      {/* 6. 영수증 이미지 라이트박스 모달 */}
      <AnimatePresence>
        {viewingReceiptImage && (
          <div className="fixed inset-0 z-[110] bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center p-4">
            <div className="absolute top-4 right-4 z-20 flex gap-2">
              <button
                type="button"
                onClick={() => setViewingReceiptImage(null)}
                className="p-2.5 rounded-full bg-slate-900 border border-slate-700 hover:border-slate-500 text-white transition-all shadow-lg cursor-pointer"
                title="닫기"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="max-w-3xl max-h-[85vh] overflow-hidden flex items-center justify-center rounded-2xl border border-slate-800 bg-slate-950 p-2 shadow-2xl">
              <img src={viewingReceiptImage} alt="영수증 원본 이미지" className="max-w-full max-h-[80vh] object-contain rounded-xl" />
            </div>
            <p className="text-slate-400 text-xs mt-3.5 font-sans">우측 상단 X 단추로 닫을 수 있습니다.</p>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
