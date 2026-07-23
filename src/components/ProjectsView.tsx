import React, { useState, useEffect } from 'react';
import { Briefcase, Plus, Calendar, DollarSign, Users, CheckCircle2, Circle, Clock, ChevronDown, ChevronUp, Trash2, Tag, Edit2, Mic, Volume2, Play, Pause, User, Music, Activity, Headphones, AlertTriangle, Sparkles, Paperclip, Download, FileText, Search, Receipt, Camera, X, Printer, FileSpreadsheet } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Project, BusinessCard, ProjectFollowUp, ProjectFollowUpAttachment, MeetingExpenseItem } from '../types.js';
import { CropAdjustModal } from './CropAdjustModal.js';
import { LiveCameraCapture } from './LiveCameraCapture.js';
import { formatCurrencyInput, parseCurrencyInput } from '../currencyFormat.js';
import { formatPhoneNumber } from '../phoneFormat.js';

interface Props {
  contacts: BusinessCard[];
  setContacts: React.Dispatch<React.SetStateAction<BusinessCard[]>>;
  projects: Project[];
  setProjects: React.Dispatch<React.SetStateAction<Project[]>>;
  filterStatus: 'all' | Project['status'];
  setFilterStatus: (status: 'all' | Project['status']) => void;
  currentUser?: import('../types.js').User | null;
  triggerNewProject?: number;
  // [수정] "새 프로젝트 등록" 버튼과 같은 위치(Navigation 상단바)에서 엑셀/PDF 버튼을 눌렀을 때
  // 신호를 받기 위한 트리거. triggerNewProject와 동일한 방식(숫자가 바뀔 때마다 실행)이다.
  triggerExcelExport?: number;
  triggerPrintPreview?: number;
  // [수정] "리스트 출력" 탭이 켜져 있으면 카드 목록 대신 표 형태의 리스트를 보여준다
  showListOutputView?: boolean;
}

export const ProjectsView: React.FC<Props> = ({ 
  contacts,
  setContacts,
  projects,
  setProjects,
  filterStatus,
  setFilterStatus,
  currentUser,
  triggerNewProject,
  triggerExcelExport,
  triggerPrintPreview,
  showListOutputView = false
}) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // [수정] 영수증 썸네일을 눌렀을 때 크게 볼 수 있는 팝업(라이트박스)용 상태
  const [enlargedReceiptUrl, setEnlargedReceiptUrl] = useState<string | null>(null);
  // [수정] 팔로우업 알림 배너를 닫을 수 있게: 닫으면 "오늘 하루만" 숨기고, 완전히 사라지지 않도록
  // 작은 뱃지로 흔적을 남겨서 다시 펼쳐볼 수 있게 한다. 날짜가 바뀌면 자동으로 다시 배너가 뜬다.
  const [followupBannerDismissedDate, setFollowupBannerDismissedDate] = useState<string>(() => {
    try { return localStorage.getItem('bizcard_followup_banner_dismissed_date') || ''; } catch { return ''; }
  });
  const todayStr = new Date().toISOString().split('T')[0];
  const isFollowupBannerDismissed = followupBannerDismissedDate === todayStr;
  const dismissFollowupBannerForToday = () => {
    try { localStorage.setItem('bizcard_followup_banner_dismissed_date', todayStr); } catch {}
    setFollowupBannerDismissedDate(todayStr);
  };
  const reopenFollowupBanner = () => {
    try { localStorage.removeItem('bizcard_followup_banner_dismissed_date'); } catch {}
    setFollowupBannerDismissedDate('');
  };
  const [companyStaff, setCompanyStaff] = useState<{ id: string; name: string }[]>([]);

  // 같은 회사(사업자번호)로 가입한 다른 계정들을 "우리 회사 직원" 목록으로 불러옴
  useEffect(() => {
    if (!currentUser || currentUser.type !== 'company' || !currentUser.companyName || !currentUser.businessNumber) {
      setCompanyStaff([]);
      return;
    }
    fetch('/api/auth/users')
      .then((res) => res.json())
      .then((allUsers: import('../types.js').User[]) => {
        const staff = allUsers.filter(
          (u) =>
            u.type === 'company' &&
            (u.companyName || '').trim() === (currentUser.companyName || '').trim() &&
            (u.businessNumber || '').trim() === (currentUser.businessNumber || '').trim()
        );
        setCompanyStaff(staff.map((u) => ({ id: u.id, name: u.name })));
        if (!meetingStaffName && currentUser.name) setMeetingStaffName(currentUser.name);
      })
      .catch((err) => console.error('Failed to load company staff:', err));
  }, [currentUser]);

  // 프로젝트 상태 필터 좌우 쓸어넘겨서 전환하기 위한 터치 제스처 상태 및 핸들러
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
    const minSwipeDistance = 70; // 70px 이상 스와이프 시 변경

    const tabs: ('all' | Project['status'])[] = ['all', 'opportunity', 'progress', 'completed', 'failed'];
    const currentIndex = tabs.indexOf(filterStatus);

    if (distance > minSwipeDistance) {
      // 왼쪽으로 쓸기 (Swipe Left) -> 다음 상태 필터로 이동
      if (currentIndex < tabs.length - 1) {
        setFilterStatus(tabs[currentIndex + 1]);
      }
    } else if (distance < -minSwipeDistance) {
      // 오른쪽으로 쓸기 (Swipe Right) -> 이전 상태 필터로 이동
      if (currentIndex > 0) {
        setFilterStatus(tabs[currentIndex - 1]);
      }
    }
  };

  // 미팅 기록 전용 상태 (최초 미팅, 2번째, 3번째 등 차수, 미팅자, 미팅일자, 미팅 내용 및 음성메모)
  const [meetingDegree, setMeetingDegree] = useState<number>(1);
  const [meetingType, setMeetingType] = useState<'meeting' | 'followup'>('meeting');
  const [meetingAttendee, setMeetingAttendee] = useState<string>('');
  const [meetingStaffName, setMeetingStaffName] = useState<string>('');
  const [attendeeNameInput, setAttendeeNameInput] = useState<string>('');
  const [attendeeOfficeInput, setAttendeeOfficeInput] = useState<string>('');
  const [attendeeMobileInput, setAttendeeMobileInput] = useState<string>('');
  const [meetingDate, setMeetingDate] = useState<string>('');
  const [meetingContent, setMeetingContent] = useState<string>('');
  const [meetingAttachments, setMeetingAttachments] = useState<ProjectFollowUpAttachment[]>([]);
  const [meetingExpenses, setMeetingExpenses] = useState<MeetingExpenseItem[]>([]);
  const [scanningExpenseId, setScanningExpenseId] = useState<string | null>(null);
  
  // 음성 메모 녹음 관련 상태
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const [voiceAttached, setVoiceAttached] = useState<boolean>(false);
  const [attachedVoiceDuration, setAttachedVoiceDuration] = useState<string>('');
  const [attachedVoiceUrl, setAttachedVoiceUrl] = useState<string>('');

  // 음성 재생 시뮬레이션 상태
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [playbackProgress, setPlaybackProgress] = useState<{ [key: string]: number }>({});

  const [recognition, setRecognition] = useState<any>(null);

  // 브라우저 음성 인식 API 바인딩
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'ko-KR';
      
      rec.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }
        if (finalTranscript) {
          setMeetingContent(prev => prev ? prev + ' ' + finalTranscript : finalTranscript);
        }
      };
      
      setRecognition(rec);
    }
  }, []);

  // 녹음 타이머 작동
  useEffect(() => {
    let timer: any;
    if (isRecording) {
      timer = setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);
    } else {
      setRecordingSeconds(0);
    }
    return () => clearInterval(timer);
  }, [isRecording]);

  // 음성 재생 바 시뮬레이션
  useEffect(() => {
    let playTimer: any;
    if (playingVoiceId) {
      playTimer = setInterval(() => {
        setPlaybackProgress(prev => {
          const current = prev[playingVoiceId] || 0;
          if (current >= 100) {
            setPlayingVoiceId(null);
            return { ...prev, [playingVoiceId]: 0 };
          }
          return { ...prev, [playingVoiceId]: current + 5 };
        });
      }, 200);
    }
    return () => clearInterval(playTimer);
  }, [playingVoiceId]);

  // 프로젝트 카드가 확장될 때 미팅 폼 초기 설정 자동화
  useEffect(() => {
    if (expandedId) {
      const proj = projects.find(p => p.id === expandedId);
      if (proj) {
        const nextDegree = (proj.followUps || []).length + 1;
        setMeetingDegree(nextDegree);
        
        // 관련 거래처 담당자명을 미팅참석자(미팅자) 기본값으로 입력
        const related = contacts.filter((c) => (proj.contactIds || []).includes(c.id));
        const names = related.map(r => r.name).join(', ');
        setMeetingAttendee(names);
        
        setMeetingDate(new Date().toISOString().split('T')[0]);
        setMeetingContent('');
        
        // 녹음 초기화
        setIsRecording(false);
        setRecordingSeconds(0);
        setVoiceAttached(false);
        setAttachedVoiceDuration('');
        setAttachedVoiceUrl('');
      }
    }
  }, [expandedId, projects, contacts]);

  const startRecording = () => {
    setIsRecording(true);
    setRecordingSeconds(0);
    setVoiceAttached(false);
    
    if (recognition) {
      try {
        recognition.start();
      } catch (e) {
        console.warn('SpeechRecognition start error:', e);
      }
    }
  };

  const stopRecording = () => {
    setIsRecording(false);
    if (recognition) {
      try {
        recognition.stop();
      } catch (e) {
        console.warn('SpeechRecognition stop error:', e);
      }
    }
    
    setVoiceAttached(true);
    const m = Math.floor(recordingSeconds / 60);
    const s = recordingSeconds % 60;
    const durStr = `${m}:${s < 10 ? '0' + s : s}`;
    setAttachedVoiceDuration(durStr === '0:00' ? '0:06' : durStr);
    
    // 만약 타이핑된 텍스트가 없고, 음성인식도 안되었다면, 미팅 맥락에 맞는 시뮬레이션 한국어 텍스트 제공
    if (!meetingContent.trim()) {
      const sampleTranscripts = [
        "오늘 미팅 진행했습니다. 전체적인 비즈니스 요건에 대해 설명했고 담당 임원분께 긍정적인 평가를 받았습니다.",
        "스펙 사양과 공급 계약 조건에 대해 자세히 협의를 마쳤습니다. 다음 미팅에서 구체적인 계약 초안 일정을 정하기로 했습니다.",
        "시스템 연동 방안에 대해 양사 개발팀과 세부 조율을 완료했습니다. 후속 검토 결과가 고무적입니다."
      ];
      const randomText = sampleTranscripts[Math.floor(Math.random() * sampleTranscripts.length)];
      setMeetingContent(randomText);
    }
    
    setAttachedVoiceUrl('simulated-voice-memo');
  };

  // 마지막 미팅(또는 프로젝트 생성일)로부터 경과된 일수 계산 함수
  const getDaysSinceLastActivity = (proj: Project): { days: number; lastDate: string; reason: 'createdAt' | 'followUp' } => {
    let lastDateStr = proj.createdAt ? proj.createdAt.split('T')[0] : new Date().toISOString().split('T')[0];
    let reason: 'createdAt' | 'followUp' = 'createdAt';

    if (proj.followUps && proj.followUps.length > 0) {
      let maxDateStr = proj.followUps[0].date;
      proj.followUps.forEach(f => {
        if (f.date > maxDateStr) {
          maxDateStr = f.date;
        }
      });
      lastDateStr = maxDateStr.split('T')[0];
      reason = 'followUp';
    }

    const parseLocalDate = (str: string) => {
      const parts = str.split('-');
      if (parts.length === 3) {
        return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      }
      return new Date(str);
    };

    const lastDateObj = parseLocalDate(lastDateStr);
    const todayStr = new Date().toISOString().split('T')[0];
    const todayObj = parseLocalDate(todayStr);

    const diffTime = todayObj.getTime() - lastDateObj.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    return {
      days: diffDays >= 0 ? diffDays : 0,
      lastDate: lastDateStr,
      reason
    };
  };
  
  // 새 프로젝트 생성 모달 상태
  const [isNewOpen, setIsNewOpen] = useState<boolean>(false);
  const [projectSearchQuery, setProjectSearchQuery] = useState<string>('');
  // [수정] 등록된 전체 프로젝트를 엑셀/PDF로 다운로드하기 위한 상태
  const [showProjectsPrintPreview, setShowProjectsPrintPreview] = useState<boolean>(false);

  // 상단 메뉴의 '새 프로젝트 등록' 버튼에서 신호가 오면 등록 모달을 엽니다.
  useEffect(() => {
    if (triggerNewProject) setIsNewOpen(true);
  }, [triggerNewProject]);
  const [newName, setNewName] = useState<string>('');
  const [newDeveloper, setNewDeveloper] = useState<string>('');
  const [newContractor, setNewContractor] = useState<string>('');
  const [newArchitect, setNewArchitect] = useState<string>('');
  const [newElectricalDesigner, setNewElectricalDesigner] = useState<string>('');
  const [newInteriorDesigner, setNewInteriorDesigner] = useState<string>('');
  const [newMechanicalDesigner, setNewMechanicalDesigner] = useState<string>('');
  const [newSupervisor, setNewSupervisor] = useState<string>('');
  const [newOperator, setNewOperator] = useState<string>('');
  const [newStatus, setNewStatus] = useState<Project['status']>('opportunity');
  const [newPriority, setNewPriority] = useState<Project['priority']>('high');
  const [newDueDate, setNewDueDate] = useState<string>(new Date(Date.now() + 86400000 * 14).toISOString().split('T')[0]);
  const [newBudget, setNewBudget] = useState<string>('');
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);

  // 프로젝트 정보 수정용 상태
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  // 미팅 기록(팔로우업) 수정용 상태
  const [editingFollowup, setEditingFollowup] = useState<{ projectId: string; followup: ProjectFollowUp } | null>(null);
  const [editAttendeeNameInput, setEditAttendeeNameInput] = useState<string>('');
  const [editAttendeeOfficeInput, setEditAttendeeOfficeInput] = useState<string>('');
  const [editAttendeeMobileInput, setEditAttendeeMobileInput] = useState<string>('');

  // 거래처 직접 입력 상태
  const [useDirectContact, setUseDirectContact] = useState<boolean>(false);
  const [directContactName, setDirectContactName] = useState<string>('');
  const [directContactCompany, setDirectContactCompany] = useState<string>('');
  const [directContactDept, setDirectContactDept] = useState<string>('');
  const [directContactTitle, setDirectContactTitle] = useState<string>('');
  const [directContactPhoneOffice, setDirectContactPhoneOffice] = useState<string>('');
  const [directContactPhoneMobile, setDirectContactPhoneMobile] = useState<string>('');
  const [directContactEmail, setDirectContactEmail] = useState<string>('');

  // 새 팔로우업 노트 입력 폼 상태
  const [followupInput, setFollowupInput] = useState<{ [key: string]: string }>({});

  // 프로젝트 생성 핸들러
  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    let finalContactIds = [...selectedContacts];

    if (useDirectContact && directContactName.trim()) {
      const newCardData = {
        name: directContactName.trim(),
        company: directContactCompany.trim() || newName || '직접 입력',
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
          headers: {
            'Content-Type': 'application/json',
            ...(currentUser ? { 'x-user-id': currentUser.id } : {})
          },
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

    const newProj: Partial<Project> = {
      name: newName,
      developer: newDeveloper,
      contractor: newContractor,
      architect: newArchitect,
      electricalDesigner: newElectricalDesigner,
      interiorDesigner: newInteriorDesigner,
      mechanicalDesigner: newMechanicalDesigner,
      supervisor: newSupervisor,
      operator: newOperator,
      status: newStatus,
      priority: newPriority,
      dueDate: newDueDate,
      budget: newBudget,
      contactIds: finalContactIds
    };

    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(currentUser ? { 'x-user-id': currentUser.id } : {})
        },
        body: JSON.stringify(newProj)
      });
      const created = await res.json();
      setProjects([created, ...projects]);
    } catch {
      const fake = { id: `p-${Date.now()}`, createdAt: new Date().toISOString(), followUps: [], ...newProj } as Project;
      setProjects([fake, ...projects]);
    }

    // 초기화
    setNewName('');
    setNewDeveloper('');
    setNewContractor('');
    setNewArchitect('');
    setNewElectricalDesigner('');
    setNewInteriorDesigner('');
    setNewMechanicalDesigner('');
    setNewSupervisor('');
    setNewOperator('');
    setNewBudget('');
    setSelectedContacts([]);
    setUseDirectContact(false);
    setDirectContactName('');
    setDirectContactCompany('');
    setDirectContactDept('');
    setDirectContactTitle('');
    setDirectContactPhoneOffice('');
    setDirectContactPhoneMobile('');
    setDirectContactEmail('');
    setIsNewOpen(false);
  };

  // 프로젝트 정보(예산 등) 수정 핸들러
  const handleUpdateProjectDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProject) return;

    let updated = editingProject;

    // 새로운 담당자를 직접 입력했으면 먼저 명함으로 저장하고 프로젝트에 연결
    if (useDirectContact && directContactName.trim()) {
      const newCardData = {
        name: directContactName.trim(),
        company: directContactCompany.trim() || editingProject.name || '직접 입력',
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
          headers: {
            'Content-Type': 'application/json',
            ...(currentUser ? { 'x-user-id': currentUser.id } : {})
          },
          body: JSON.stringify(newCardData)
        });
        if (contactRes.ok) {
          const savedContact = await contactRes.json();
          setContacts((prev) => [savedContact, ...prev]);
          updated = { ...updated, contactIds: [...(updated.contactIds || []), savedContact.id] };
        }
      } catch (err) {
        console.error('Failed to save direct contact:', err);
      }
    }

    setProjects(projects.map((p) => (p.id === updated.id ? updated : p)));
    setEditingProject(null);
    setUseDirectContact(false);
    setDirectContactName('');
    setDirectContactCompany('');
    setDirectContactDept('');
    setDirectContactTitle('');
    setDirectContactPhoneOffice('');
    setDirectContactPhoneMobile('');
    setDirectContactEmail('');

    try {
      await fetch(`/api/projects/${updated.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(currentUser ? { 'x-user-id': currentUser.id } : {})
        },
        body: JSON.stringify(updated)
      });
    } catch (err) {
      console.error('Failed to update project:', err);
    }
  };

  // 미팅 기록(팔로우업) 수정 핸들러
  const handleUpdateFollowup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFollowup) return;
    const { projectId, followup } = editingFollowup;

    setProjects(projects.map((p) => {
      if (p.id !== projectId) return p;
      return { ...p, followUps: p.followUps.map((f) => (f.id === followup.id ? followup : f)) };
    }));
    setEditingFollowup(null);

    try {
      await fetch(`/api/projects/${projectId}/followups/${followup.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(currentUser ? { 'x-user-id': currentUser.id } : {})
        },
        body: JSON.stringify({
          content: followup.content,
          date: followup.date,
          meetingDegree: followup.meetingDegree,
          meetingType: followup.meetingType,
          attendee: followup.attendee,
          internalStaffName: followup.internalStaffName,
          attachments: followup.attachments || [],
          expenses: followup.expenses || []
        })
      });
    } catch (err) {
      console.error('Failed to update followup:', err);
    }
  };

  // 프로젝트 삭제 핸들러
  const handleDeleteProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('이 프로젝트 및 관련 팔로우업 기록을 완전히 삭제하시겠습니까?')) return;
    try {
      await fetch(`/api/projects/${id}`, { 
        method: 'DELETE',
        headers: currentUser ? { 'x-user-id': currentUser.id } : undefined
      });
    } finally {
      setProjects(projects.filter((p) => p.id !== id));
    }
  };

  // 상태 변경 핸들러
  const handleStatusChange = async (id: string, newSt: Project['status'], e: React.ChangeEvent<HTMLSelectElement>) => {
    e.stopPropagation();
    const target = projects.find((p) => p.id === id);
    if (!target) return;
    const updated = { ...target, status: newSt };
    setProjects(projects.map((p) => (p.id === id ? updated : p)));
    fetch(`/api/projects/${id}`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        ...(currentUser ? { 'x-user-id': currentUser.id } : {})
      },
      body: JSON.stringify({ status: newSt })
    });
  };

  // 팔로우업 노트 및 미팅 정보 추가
  // 미팅자 문자열은 이름만 콤마로 저장합니다 (전화번호는 표시할 때 명함에서 실시간으로 찾아 붙입니다)
  const formatAttendeeEntry = (c: BusinessCard): string => c.name;

  // 미팅/팔로우업 차수 시퀀스: 1차 미팅 → 1차 팔로우업 → 2차 미팅 → 2차 팔로우업 → ... 순서로 값을 만들고,
  // 이미 기록된 차수/구분은 건너뛰어 "다음에 기록해야 할 차수"를 계산합니다.
  const buildMeetingSequenceLabel = (degree: number, type: 'meeting' | 'followup'): string =>
    `${degree}차 ${type === 'meeting' ? '미팅' : '팔로우업'}`;

  const getNextMeetingSlot = (followUps: ProjectFollowUp[]): { degree: number; type: 'meeting' | 'followup' } => {
    const used = new Set(
      followUps
        .filter((f) => f.meetingDegree)
        .map((f) => `${f.meetingDegree}-${f.meetingType || 'meeting'}`)
    );
    for (let degree = 1; degree <= 500; degree++) {
      if (!used.has(`${degree}-meeting`)) return { degree, type: 'meeting' };
      if (!used.has(`${degree}-followup`)) return { degree, type: 'followup' };
    }
    return { degree: 1, type: 'meeting' };
  };

  // 드롭다운에 보여줄 차수 목록: 이미 쓰인 차수 + 앞으로 선택 가능한 여유분(10개)까지 생성
  const buildMeetingSequenceOptions = (followUps: ProjectFollowUp[]): { degree: number; type: 'meeting' | 'followup'; label: string; used: boolean }[] => {
    const used = new Set(
      followUps
        .filter((f) => f.meetingDegree)
        .map((f) => `${f.meetingDegree}-${f.meetingType || 'meeting'}`)
    );
    const maxUsedDegree = followUps.reduce((max, f) => Math.max(max, f.meetingDegree || 0), 0);
    const upperBound = Math.max(maxUsedDegree + 10, 10);
    const options: { degree: number; type: 'meeting' | 'followup'; label: string; used: boolean }[] = [];
    for (let degree = 1; degree <= upperBound; degree++) {
      (['meeting', 'followup'] as const).forEach((type) => {
        const key = `${degree}-${type}`;
        options.push({ degree, type, label: buildMeetingSequenceLabel(degree, type), used: used.has(key) });
      });
    }
    return options;
  };

  // 프로젝트를 펼치면(expandedId 변경), 그 프로젝트의 다음 기록 차수/구분을 자동으로 미리 선택해 둠
  useEffect(() => {
    if (!expandedId) return;
    const proj = projects.find((p) => p.id === expandedId);
    if (!proj) return;
    const next = getNextMeetingSlot(proj.followUps || []);
    setMeetingDegree(next.degree);
    setMeetingType(next.type);
  }, [expandedId]);

  // 파일을 base64로 읽어서 첨부파일 목록에 추가 (제안서, 견적서, 발송자료 등)
  const readFilesAsAttachments = (files: FileList, onAdd: (att: ProjectFollowUpAttachment) => void) => {
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        onAdd({
          id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: file.name,
          dataUrl: ev.target?.result as string,
          size: file.size
        });
      };
      reader.readAsDataURL(file);
    });
  };

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return '';
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  // 비용 카테고리 한글 라벨
  const expenseCategoryLabel = (item: MeetingExpenseItem): string => {
    const labels: Record<string, string> = {
      meal: '식대',
      drinks: '음료(커피)',
      purchase: '물품 구입',
      service_fee: '식사 서비스 비용',
      custom: item.categoryCustom || '직접 입력'
    };
    return labels[item.category] || item.category;
  };

  // /api/scan-receipt가 반환하는 범용 카테고리를, 미팅 비용에서 쓰는 카테고리로 변환
  const mapReceiptCategoryToMeeting = (cat: string): { category: MeetingExpenseItem['category']; categoryCustom?: string } => {
    if (cat === 'meal') return { category: 'meal' };
    if (cat === 'beverage') return { category: 'drinks' };
    if (cat === 'supplies') return { category: 'purchase' };
    const otherLabels: Record<string, string> = {
      fuel: '주유비', parking: '주차비', toll: '통행료', maintenance: '차량 정비', agency_drive: '대리운전', other: '기타'
    };
    return { category: 'custom', categoryCustom: otherLabels[cat] || '기타' };
  };

  const addMeetingExpense = (setter: React.Dispatch<React.SetStateAction<MeetingExpenseItem[]>>) => {
    setter((prev) => [...prev, {
      id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      category: 'meal',
      amount: 0,
      payMethod: 'company_card',
      memo: ''
    }]);
  };
  const updateMeetingExpense = (setter: React.Dispatch<React.SetStateAction<MeetingExpenseItem[]>>, id: string, patch: Partial<MeetingExpenseItem>) => {
    setter((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  };
  const removeMeetingExpense = (setter: React.Dispatch<React.SetStateAction<MeetingExpenseItem[]>>, id: string) => {
    setter((prev) => prev.filter((e) => e.id !== id));
  };

  // 영수증 크롭 조정 모달 대상 (미팅 비용은 등록/수정 화면 어느 쪽 setter를 쓸지도 같이 기억해둠)
  const [receiptCropTarget, setReceiptCropTarget] = useState<{
    tempId: string;
    rawImage: string;
    setter: React.Dispatch<React.SetStateAction<MeetingExpenseItem[]>>;
  } | null>(null);
  const [receiptCameraTarget, setReceiptCameraTarget] = useState<{
    setter: React.Dispatch<React.SetStateAction<MeetingExpenseItem[]>>;
  } | null>(null);

  const meetingReceiptFallbackInputRef = React.useRef<HTMLInputElement>(null);
  const meetingReceiptFallbackRef = React.useRef<React.Dispatch<React.SetStateAction<MeetingExpenseItem[]>> | null>(null);

  // 영수증 사진을 선택하면 우선 항목으로 추가해두고, 크롭 조정 모달을 띄움
  const scanReceiptAndAddExpense = (file: File, setter: React.Dispatch<React.SetStateAction<MeetingExpenseItem[]>>) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const rawDataUrl = ev.target?.result as string;
      const tempId = `exp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setter((prev) => [...prev, { id: tempId, category: 'custom', amount: 0, payMethod: 'company_card', memo: '', receiptImage: rawDataUrl }]);
      setReceiptCropTarget({ tempId, rawImage: rawDataUrl, setter });
    };
    reader.readAsDataURL(file);
  };

  // 크롭이 확정된 영수증을 AI로 인식해서 해당 비용 항목에 반영
  const runMeetingReceiptOcr = async (target: NonNullable<typeof receiptCropTarget>, dataUrl: string) => {
    const { tempId, setter } = target;
    updateMeetingExpense(setter, tempId, { receiptImage: dataUrl });
    setScanningExpenseId(tempId);
    try {
      const res = await fetch('/api/scan-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl })
      });
      const data = await res.json();
      if (res.ok) {
        const mapped = mapReceiptCategoryToMeeting(data.category);
        updateMeetingExpense(setter, tempId, {
          category: mapped.category,
          categoryCustom: mapped.categoryCustom,
          amount: data.amount || 0,
          payMethod: data.payMethod === 'personal_card' ? 'personal_card' : data.payMethod === 'cash' ? 'cash' : 'company_card',
          memo: [data.merchantName, data.memo].filter(Boolean).join(' · ')
        });
      }
    } catch (err) {
      console.error('영수증 스캔 실패:', err);
    } finally {
      setScanningExpenseId(null);
    }
  };


  // 이름 + 사무실/핸드폰 번호를 직접 입력해서 미팅자 항목을 만듭니다 (예: "김대리(H.010-..., O.02-...)")
  const buildAttendeeEntry = (name: string, office: string, mobile: string): string => {
    const parts: string[] = [];
    if (mobile) parts.push(`H.${mobile}`);
    if (office) parts.push(`O.${office}`);
    return parts.length ? `${name.trim()}(${parts.join(', ')})` : name.trim();
  };

  // 미팅자 문자열을 콤마로 나누되, "이름(전화번호)" 처럼 괄호 안의 콤마는 나누지 않습니다.
  const splitAttendeeEntries = (attendee: string): string[] => {
    const result: string[] = [];
    let depth = 0;
    let current = '';
    for (const ch of attendee) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) {
        if (current.trim()) result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    if (current.trim()) result.push(current.trim());
    return result;
  };

  // "이름(전화번호)" 형식이면 이름과 직접입력 전화번호를 분리해서 반환
  const parseAttendeeEntry = (entry: string): { name: string; manualPhone: string | null } => {
    const match = entry.match(/^(.+?)\s*\(([^)]*)\)\s*$/);
    if (match) return { name: match[1].trim(), manualPhone: match[2].trim() };
    return { name: entry.trim(), manualPhone: null };
  };

  // 미팅자 문자열에서 특정 명함 이름의 항목을 제거 (괄호 안 전화번호 포함해서 통째로 제거)
  const removeAttendeeEntry = (current: string, c: BusinessCard): string => {
    const entries = splitAttendeeEntries(current);
    return entries
      .filter((entry) => parseAttendeeEntry(entry).name !== c.name)
      .join(', ');
  };

  // 읽기 전용 화면에 미팅자를 표시할 때, 각 참여자마다:
  // 1) "이름(전화번호)" 형식으로 직접 입력한 번호가 있으면 그대로 표시
  // 2) 아니면 명함(주소록)에서 이름이 일치하는 연락처를 찾아 자동 표시
  // 3) 둘 다 없으면 이름만 표시
  const renderAttendeeWithPhone = (attendee?: string) => {
    if (!attendee) return null;
    const entries = splitAttendeeEntries(attendee);
    return entries.map((entry, idx) => {
      const { name, manualPhone } = parseAttendeeEntry(entry);
      let phoneDisplay = manualPhone || '';
      if (!phoneDisplay) {
        const c = contacts.find((x) => x.name === name);
        const phoneParts: string[] = [];
        if (c?.phoneMobile) phoneParts.push(`H.${c.phoneMobile}`);
        if (c?.phoneOffice) phoneParts.push(`O.${c.phoneOffice}`);
        phoneDisplay = phoneParts.join(', ');
      }
      return (
        <span key={idx}>
          {idx > 0 && ', '}
          {name}
          {phoneDisplay && <span className="text-slate-500"> ({phoneDisplay})</span>}
        </span>
      );
    });
  };

  // 미팅 비용 지출 UI 섹션 (등록/수정 화면 공용)
  const renderExpenseSection = (expenses: MeetingExpenseItem[], setter: React.Dispatch<React.SetStateAction<MeetingExpenseItem[]>>) => (
    <div className="space-y-1.5">
      <label className="block text-[10px] text-slate-400 font-bold flex items-center gap-1">
        <Receipt className="w-3 h-3" /> 비용 지출 (영수증 스캔 가능)
      </label>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setReceiptCameraTarget({ setter })}
          className="flex-1 flex items-center justify-center gap-1.5 border border-dashed border-slate-700 rounded-xl py-2.5 hover:border-emerald-500 text-slate-500 hover:text-emerald-400 text-[11px] font-semibold transition-colors"
        >
          <Camera className="w-3.5 h-3.5" />
          <span>영수증 촬영</span>
        </button>
        <button
          type="button"
          onClick={() => addMeetingExpense(setter)}
          className="px-3 rounded-xl border border-dashed border-slate-700 text-slate-500 hover:text-indigo-400 hover:border-indigo-500 text-[11px] font-semibold transition-colors shrink-0"
        >
          + 직접 입력
        </button>
      </div>

      {expenses.length > 0 && (
        <div className="space-y-2">
          {expenses.map((exp) => (
            <div key={exp.id} className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 space-y-1.5">
              <div className="flex items-start gap-2">
                {exp.receiptImage && (
                  <img
                    src={exp.receiptImage}
                    alt="영수증"
                    onClick={() => setEnlargedReceiptUrl(exp.receiptImage!)}
                    className="w-12 h-12 rounded-lg object-cover border border-slate-700 shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                  />
                )}
                <div className="flex-1 grid grid-cols-2 gap-1.5">
                  <select
                    value={exp.category}
                    onChange={(e) => updateMeetingExpense(setter, exp.id, { category: e.target.value as MeetingExpenseItem['category'] })}
                    className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-[11px] text-white outline-none focus:border-indigo-500"
                  >
                    <option value="meal">식대</option>
                    <option value="drinks">음료(커피)</option>
                    <option value="purchase">물품 구입</option>
                    <option value="service_fee">식사 서비스 비용</option>
                    <option value="custom">직접 입력</option>
                  </select>
                  <select
                    value={exp.payMethod}
                    onChange={(e) => updateMeetingExpense(setter, exp.id, { payMethod: e.target.value as MeetingExpenseItem['payMethod'] })}
                    className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-[11px] text-white outline-none focus:border-indigo-500"
                  >
                    <option value="company_card">법인(회사)카드</option>
                    <option value="personal_card">개인카드</option>
                    <option value="cash">현금</option>
                  </select>
                  {exp.category === 'custom' && (
                    <input
                      type="text"
                      value={exp.categoryCustom || ''}
                      onChange={(e) => updateMeetingExpense(setter, exp.id, { categoryCustom: e.target.value })}
                      placeholder="카테고리명 직접 입력"
                      className="col-span-2 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-[11px] text-white placeholder:text-slate-600 outline-none focus:border-indigo-500"
                    />
                  )}
                  <input
                    type="text"
                    inputMode="numeric"
                    value={exp.amount ? formatCurrencyInput(exp.amount) : ''}
                    onChange={(e) => updateMeetingExpense(setter, exp.id, { amount: parseCurrencyInput(e.target.value) })}
                    placeholder="금액 (원)"
                    className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-[11px] text-white placeholder:text-slate-600 font-mono outline-none focus:border-indigo-500"
                  />
                  <input
                    type="text"
                    value={exp.memo || ''}
                    onChange={(e) => updateMeetingExpense(setter, exp.id, { memo: e.target.value })}
                    placeholder="지출 상세 사유/메모"
                    className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-[11px] text-white placeholder:text-slate-600 outline-none focus:border-indigo-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeMeetingExpense(setter, exp.id)}
                  className="text-rose-400 hover:text-rose-300 font-bold shrink-0 px-1"
                >
                  ✕
                </button>
              </div>
              {scanningExpenseId === exp.id && (
                <div className="text-[10px] text-indigo-400 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> 영수증 스캔 중...
                </div>
              )}
            </div>
          ))}
          <div className="text-right text-[11px] text-slate-400 font-bold">
            합계: <span className="text-emerald-400 font-mono">{formatCurrencyInput(expenses.reduce((s, e) => s + e.amount, 0))}원</span>
          </div>
        </div>
      )}
    </div>
  );

  // 수정 모달에서 editingFollowup.followup.expenses 를 다루기 위한 setState 어댑터
  const editExpensesSetter: React.Dispatch<React.SetStateAction<MeetingExpenseItem[]>> = (updater) => {
    setEditingFollowup((prev) => {
      if (!prev) return prev;
      const current = prev.followup.expenses || [];
      const next = typeof updater === 'function' ? (updater as (p: MeetingExpenseItem[]) => MeetingExpenseItem[])(current) : updater;
      return { ...prev, followup: { ...prev.followup, expenses: next } };
    });
  };

  const handleAddFollowup = async (projectId: string, e: React.FormEvent) => {
    e.preventDefault();
    if (!meetingContent.trim() && !voiceAttached && meetingAttachments.length === 0 && meetingExpenses.length === 0) return;

    const payload = {
      content: meetingContent,
      date: meetingDate || new Date().toISOString().split('T')[0],
      status: 'done' as const,
      meetingDegree: meetingDegree || undefined,
      meetingType: meetingDegree ? meetingType : undefined,
      attendee: meetingAttendee,
      internalStaffName: meetingStaffName,
      hasVoice: voiceAttached,
      voiceUrl: voiceAttached ? attachedVoiceUrl : undefined,
      voiceDuration: voiceAttached ? attachedVoiceDuration : undefined,
      attachments: meetingAttachments,
      expenses: meetingExpenses
    };

    try {
      const res = await fetch(`/api/projects/${projectId}/followups`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(currentUser ? { 'x-user-id': currentUser.id } : {})
        },
        body: JSON.stringify(payload)
      });
      const updated = await res.json();
      setProjects(projects.map((p) => (p.id === projectId ? updated : p)));
    } catch {
      const target = projects.find((p) => p.id === projectId);
      if (target) {
        const newF: ProjectFollowUp = {
          id: `f-${Date.now()}`,
          projectId,
          content: payload.content,
          date: payload.date,
          status: 'done',
          meetingDegree: payload.meetingDegree,
          meetingType: payload.meetingType,
          attendee: payload.attendee,
          internalStaffName: payload.internalStaffName,
          hasVoice: payload.hasVoice,
          voiceUrl: payload.voiceUrl,
          voiceDuration: payload.voiceDuration,
          attachments: payload.attachments,
          expenses: payload.expenses
        };
        const updated = { ...target, followUps: [newF, ...target.followUps] };
        setProjects(projects.map((p) => (p.id === projectId ? updated : p)));
      }
    }

    setMeetingContent('');
    setVoiceAttached(false);
    setAttachedVoiceDuration('');
    setAttachedVoiceUrl('');
    setMeetingAttachments([]);
    setMeetingExpenses([]);
    // 다음 기록을 위해 차수/구분을 순서대로 한 단계 전진 (1차 미팅 → 1차 팔로우업 → 2차 미팅 → ...)
    if (meetingDegree > 0) {
      if (meetingType === 'meeting') {
        setMeetingType('followup');
      } else {
        setMeetingDegree(meetingDegree + 1);
        setMeetingType('meeting');
      }
    }
  };

  // 팔로우업 상태 토글 (완료/진행중)
  const handleToggleFollowupStatus = async (projectId: string, followupId: string) => {
    const proj = projects.find((p) => p.id === projectId);
    if (!proj) return;
    const f = proj.followUps.find((item) => item.id === followupId);
    if (!f) return;
    const nextSt = f.status === 'done' ? 'planned' : 'done';

    const updatedFollowups = proj.followUps.map((item) => (item.id === followupId ? { ...item, status: nextSt } : item));
    const updatedProj = { ...proj, followUps: updatedFollowups };
    setProjects(projects.map((p) => (p.id === projectId ? updatedProj : p)));

    fetch(`/api/projects/${projectId}/followups/${followupId}`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        ...(currentUser ? { 'x-user-id': currentUser.id } : {})
      },
      body: JSON.stringify({ status: nextSt })
    });
  };

  const getStatusBadge = (st: Project['status']) => {
    switch (st) {
      case 'opportunity': return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/30">💡 기회</span>;
      case 'progress': return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">⚡ 진행</span>;
      case 'completed': return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">✅ 완료</span>;
      case 'failed': return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30">❌ 실패</span>;
    }
  };

  const filteredProjects = projects
    .filter((p) => filterStatus === 'all' || p.status === filterStatus)
    .filter((p) => {
      const q = projectSearchQuery.trim().toLowerCase();
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.developer || '').toLowerCase().includes(q) ||
        (p.contractor || '').toLowerCase().includes(q)
      );
    });

  // [수정] 전체 프로젝트 목록을 엑셀(.xls)로 다운로드. 현재 화면에 적용된 상태 필터/검색어를 그대로 반영한다.
  const STATUS_LABEL_KO: Record<Project['status'], string> = { opportunity: '기회', progress: '진행', completed: '완료', failed: '실패' };
  const PRIORITY_LABEL_KO: Record<Project['priority'], string> = { high: '높음', medium: '보통', low: '낮음' };

  const handleExportProjectsExcel = () => {
    const esc = (v: any) => (v === null || v === undefined ? '' : String(v)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const headers = ['프로젝트명', '상태', '우선순위', '마감일', '예산', '시행사(발주처)', '시공사', '건축설계사', '인테리어설계사', '전기설계사', '기계설계사', '감리사', '운영사', '관련 명함 수', '팔로우업 건수'];
    const rows = filteredProjects.map(p => [
      p.name, STATUS_LABEL_KO[p.status], PRIORITY_LABEL_KO[p.priority], p.dueDate || '', p.budget || '',
      p.developer || '', p.contractor || '', p.architect || '', p.interiorDesigner || '', p.electricalDesigner || '',
      p.mechanicalDesigner || '', p.supervisor || '', p.operator || '',
      String((p.contactIds || []).length), String((p.followUps || []).length)
    ]);

    const tableHtml = `
      <table style="border-collapse: collapse; font-family: 'Malgun Gothic', Arial; font-size: 10pt;">
        <tr>${headers.map(h => `<th style="border: 0.5pt solid #000; background:#f1f5f9; font-weight:bold; padding:6px 8px;">${h}</th>`).join('')}</tr>
        ${rows.map(r => `<tr>${r.map(c => `<td style="border: 0.5pt solid #000; padding:6px 8px;">${esc(c)}</td>`).join('')}</tr>`).join('')}
      </table>
    `;
    const excelContent = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="utf-8">
      <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
      <x:Name>전체_프로젝트</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
      </x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
      </head><body>${tableHtml}</body></html>
    `;
    const blob = new Blob([excelContent], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `전체_프로젝트_목록_${new Date().toISOString().split('T')[0]}.xls`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // [수정] "새 프로젝트 등록"과 같은 위치(Navigation 상단바)의 엑셀/PDF 버튼에서 신호가 오면 실행
  useEffect(() => {
    if (triggerExcelExport) handleExportProjectsExcel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerExcelExport]);

  useEffect(() => {
    if (triggerPrintPreview) setShowProjectsPrintPreview(true);
  }, [triggerPrintPreview]);

  return (
    <div className="space-y-3 animate-fadeIn max-w-6xl mx-auto">
      
      {/* ⚠️ 팔로우업 알림 배너 */}
      {(() => {
        const needyProjs = projects.filter(p => {
          if (p.status !== 'opportunity' && p.status !== 'progress') return false;
          const { days } = getDaysSinceLastActivity(p);
          return days >= 5;
        });

        if (needyProjs.length > 0) {
          // 오늘 이미 닫은 상태면, 완전히 숨기지 않고 작은 뱃지로 흔적을 남긴다
          if (isFollowupBannerDismissed) {
            return (
              <button
                onClick={reopenFollowupBanner}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-semibold transition-all animate-fadeIn"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>팔로우업 필요 {needyProjs.length}건</span>
              </button>
            );
          }
          return (
            <div className="relative bg-gradient-to-r from-rose-950/40 to-amber-950/30 border border-rose-500/30 rounded-3xl p-5 md:p-6 shadow-xl flex items-start gap-4 animate-fadeIn">
              <button
                onClick={dismissFollowupBannerForToday}
                className="absolute top-3 right-3 p-1.5 rounded-lg text-rose-300/70 hover:text-rose-200 hover:bg-rose-500/10 transition-colors"
                title="오늘 하루 닫기"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="p-2.5 bg-rose-500/20 text-rose-400 rounded-xl border border-rose-500/30 shrink-0">
                <AlertTriangle className="w-5 h-5 animate-bounce" />
              </div>
              <div className="space-y-1.5 flex-1 pr-6">
                <h4 className="text-sm font-bold text-rose-300 flex items-center gap-1.5">
                  <span>신속한 팔로우업이 필요한 활성 프로젝트가 {needyProjs.length}개 있습니다!</span>
                </h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  마지막 미팅 또는 비즈니스 프로젝트 등록 후 <span className="text-rose-400 font-bold">5일 이상</span> 경과하여 연락이 뜸해진 건들입니다. 신속하게 안부 연락이나 차기 미팅 조율을 진행해 보세요.
                </p>
                <div className="flex flex-wrap gap-2 pt-1.5">
                  {needyProjs.map(p => {
                    const { days } = getDaysSinceLastActivity(p);
                    return (
                      <button
                        key={p.id}
                        onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}
                        className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all flex items-center gap-1.5 ${expandedId === p.id ? 'bg-rose-500 text-white border-rose-400 shadow animate-pulse' : 'bg-slate-950 hover:bg-slate-900 border-rose-500/20 hover:border-rose-500/40 text-rose-300'}`}
                      >
                        <span className="font-bold">{p.name}</span>
                        <span className="text-[10px] opacity-80 font-mono">({days}일 경과)</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        }
        return null;
      })()}

      {/* 프로젝트 리스트 */}
      <div 
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="touch-pan-y space-y-4"
      >
        {/* 프로젝트 검색 */}
        <div className="max-w-md mx-auto relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="프로젝트명, 시행사, 시공사로 검색..."
            value={projectSearchQuery}
            onChange={(e) => setProjectSearchQuery(e.target.value)}
            className="w-full pl-11 pr-16 py-2.5 rounded-2xl bg-slate-900 border border-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-200 transition-all placeholder:text-slate-500 shadow-inner"
          />
          {projectSearchQuery && (
            <button
              onClick={() => setProjectSearchQuery('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors bg-indigo-500/10 px-2 py-1 rounded-lg cursor-pointer"
            >
              지우기
            </button>
          )}
        </div>

        {showListOutputView ? (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-200">전체 프로젝트 리스트 ({filteredProjects.length}건)</h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportProjectsExcel}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition-all active:scale-95"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>엑셀 다운로드</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowProjectsPrintPreview(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-600/20 transition-all active:scale-95"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>PDF 인쇄 / 다운로드</span>
                </button>
              </div>
            </div>

            {filteredProjects.length === 0 ? (
              <div className="bg-slate-900/60 border border-slate-800/80 rounded-3xl p-16 text-center space-y-4">
                <Briefcase className="w-12 h-12 text-slate-600 mx-auto" />
                <h3 className="text-lg font-bold text-white">해당하는 프로젝트가 없습니다.</h3>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-800">
                <table className="w-full text-xs text-slate-300 whitespace-nowrap">
                  <thead className="bg-slate-900 text-slate-400">
                    <tr>
                      {['프로젝트명', '상태', '우선순위', '마감일', '예산', '시행사', '시공사', '건축설계', '인테리어', '전기설계', '기계설계', '감리사', '운영사', '명함', '팔로우업'].map(h => (
                        <th key={h} className="px-3 py-2.5 text-left font-bold border-b border-slate-800">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredProjects.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-900/50 transition-colors">
                        <td className="px-3 py-2.5 font-semibold text-slate-100">{p.name}</td>
                        <td className="px-3 py-2.5">{STATUS_LABEL_KO[p.status]}</td>
                        <td className="px-3 py-2.5">{PRIORITY_LABEL_KO[p.priority]}</td>
                        <td className="px-3 py-2.5 font-mono">{p.dueDate}</td>
                        <td className="px-3 py-2.5">{p.budget || '-'}</td>
                        <td className="px-3 py-2.5">{p.developer || '-'}</td>
                        <td className="px-3 py-2.5">{p.contractor || '-'}</td>
                        <td className="px-3 py-2.5">{p.architect || '-'}</td>
                        <td className="px-3 py-2.5">{p.interiorDesigner || '-'}</td>
                        <td className="px-3 py-2.5">{p.electricalDesigner || '-'}</td>
                        <td className="px-3 py-2.5">{p.mechanicalDesigner || '-'}</td>
                        <td className="px-3 py-2.5">{p.supervisor || '-'}</td>
                        <td className="px-3 py-2.5">{p.operator || '-'}</td>
                        <td className="px-3 py-2.5 text-center">{(p.contactIds || []).length}</td>
                        <td className="px-3 py-2.5 text-center">{(p.followUps || []).length}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : loading ? (
          <div className="py-24 text-center text-slate-500 text-sm">프로젝트 히스토리 불러오는 중...</div>
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={filterStatus}
              initial={{ opacity: 0, x: filterStatus === 'all' ? -15 : 15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: filterStatus === 'all' ? 15 : -15 }}
              transition={{ duration: 0.2 }}
              className="w-full"
            >
              {filteredProjects.length === 0 ? (
                <div className="bg-slate-900/60 border border-slate-800/80 rounded-3xl p-16 text-center space-y-4">
                  <Briefcase className="w-12 h-12 text-slate-600 mx-auto" />
                  <h3 className="text-lg font-bold text-white">해당하는 프로젝트가 없습니다.</h3>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">상단의 '새 프로젝트 등록' 버튼을 눌러 중요한 거래처 영업 및 제안 일정을 새롭게 기록해보세요.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
          {filteredProjects.map((proj) => {
            const isExpanded = expandedId === proj.id;
            const relatedContacts = contacts.filter((c) => (proj.contactIds || []).includes(c.id));

            // 시행사/시공사/설계사 등 회사명과, 이 프로젝트에 연결된 명함의 회사명이 일치하면
            // 그 담당자(이름/직급/연락처)를 같이 보여주기 위한 매칭 함수
            const findContactsForCompany = (companyName?: string) => {
              const target = (companyName || '').trim();
              if (!target) return [];
              return relatedContacts.filter((c) => {
                const cCompany = (c.company || '').trim();
                if (!cCompany) return false;
                return cCompany.includes(target) || target.includes(cCompany);
              });
            };

            return (
              <div
                key={proj.id}
                className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden hover:border-slate-700 transition-all shadow-xl"
              >
                {/* 프로젝트 카드 메인 상단바 */}
                <div
                  onClick={() => setExpandedId(isExpanded ? null : proj.id)}
                  className="p-6 cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/90"
                >
                  <div className="space-y-2 flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded font-bold ${proj.priority === 'high' ? 'bg-red-500/20 text-red-300 border border-red-500/30' : 'bg-slate-800 text-slate-400'}`}>
                        {proj.priority === 'high' ? '🔥 우선순위 높음' : '보통'}
                      </span>
                      {getStatusBadge(proj.status)}
                      {(() => {
                        if (proj.status === 'opportunity' || proj.status === 'progress') {
                          const { days } = getDaysSinceLastActivity(proj);
                          if (days >= 5) {
                            return (
                              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30 flex items-center gap-1 animate-pulse">
                                <AlertTriangle className="w-3 h-3" />
                                <span>팔로우업 필요 ({days}일째)</span>
                              </span>
                            );
                          }
                        }
                        return null;
                      })()}
                      <h3 className="text-lg font-bold text-white tracking-tight">{proj.name}</h3>
                    </div>

                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {proj.developer && <span className="text-[10px] bg-slate-800 border border-slate-700/60 text-slate-300 px-2 py-0.5 rounded-md font-medium">시행: {proj.developer}</span>}
                      {proj.contractor && <span className="text-[10px] bg-slate-800 border border-slate-700/60 text-slate-300 px-2 py-0.5 rounded-md font-medium">시공: {proj.contractor}</span>}
                      {proj.architect && <span className="text-[10px] bg-slate-800 border border-slate-700/60 text-slate-300 px-2 py-0.5 rounded-md font-medium">건축설계: {proj.architect}</span>}
                      {proj.interiorDesigner && <span className="text-[10px] bg-slate-800 border border-slate-700/60 text-slate-300 px-2 py-0.5 rounded-md font-medium">인테리어: {proj.interiorDesigner}</span>}
                      {proj.electricalDesigner && <span className="text-[10px] bg-slate-800 border border-slate-700/60 text-slate-300 px-2 py-0.5 rounded-md font-medium">전기설계: {proj.electricalDesigner}</span>}
                      {proj.mechanicalDesigner && <span className="text-[10px] bg-slate-800 border border-slate-700/60 text-slate-300 px-2 py-0.5 rounded-md font-medium">기계설계: {proj.mechanicalDesigner}</span>}
                      {proj.supervisor && <span className="text-[10px] bg-slate-800 border border-slate-700/60 text-slate-300 px-2 py-0.5 rounded-md font-medium">감리: {proj.supervisor}</span>}
                      {proj.operator && <span className="text-[10px] bg-slate-800 border border-slate-700/60 text-slate-300 px-2 py-0.5 rounded-md font-medium">운영: {proj.operator}</span>}
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-400 pt-1 font-mono">
                      <span className="flex items-center gap-1 text-slate-300">
                        <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                        기한: {proj.dueDate}
                      </span>
                      {proj.budget && (
                        <span className="flex items-center gap-1 text-emerald-300">
                          <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                          예산: {/^\d+$/.test(proj.budget) ? `${formatCurrencyInput(proj.budget)}원` : proj.budget}
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-blue-300">
                        <Users className="w-3.5 h-3.5 text-blue-400" />
                        관련 명함 {relatedContacts.length}명
                      </span>
                      {(() => {
                        if (proj.status === 'opportunity' || proj.status === 'progress') {
                          const { days, reason } = getDaysSinceLastActivity(proj);
                          const isOverdue = days >= 5;
                          const iconColor = isOverdue ? 'text-rose-400' : 'text-amber-400';
                          const textColor = isOverdue ? 'text-rose-300 font-bold' : 'text-slate-400';
                          return (
                            <span className={`flex items-center gap-1 ${textColor}`}>
                              <Clock className={`w-3.5 h-3.5 ${iconColor}`} />
                              <span>
                                {reason === 'followUp' ? `마지막 미팅: ${days === 0 ? '오늘' : `${days}일 전`}` : `등록/시작일: ${days === 0 ? '오늘' : `${days}일 전`}`}
                              </span>
                            </span>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  </div>

                  {/* 우측 컨트롤 */}
                  <div className="flex items-center gap-3 shrink-0 self-end md:self-center" onClick={(e) => e.stopPropagation()}>
                    <select
                      value={proj.status}
                      onChange={(e) => handleStatusChange(proj.id, e.target.value as any, e)}
                      className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-white outline-none focus:border-indigo-500 shadow-inner"
                    >
                      <option value="opportunity">💡 기회</option>
                      <option value="progress">⚡ 진행</option>
                      <option value="completed">✅ 완료</option>
                      <option value="failed">❌ 실패</option>
                    </select>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingProject(proj);
                        setUseDirectContact(false);
                        setDirectContactName('');
                        setDirectContactCompany('');
                        setDirectContactDept('');
                        setDirectContactTitle('');
                        setDirectContactPhoneOffice('');
                        setDirectContactPhoneMobile('');
                        setDirectContactEmail('');
                      }}
                      className="p-2.5 rounded-xl bg-slate-950 hover:bg-indigo-500/20 text-slate-400 hover:text-indigo-400 border border-slate-800 transition-colors"
                      title="프로젝트 정보 수정"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>

                    <button
                      onClick={(e) => handleDeleteProject(proj.id, e)}
                      className="p-2.5 rounded-xl bg-slate-950 hover:bg-red-500/20 text-slate-400 hover:text-red-400 border border-slate-800 transition-colors"
                      title="프로젝트 삭제"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>

                    <div onClick={() => setExpandedId(isExpanded ? null : proj.id)} className="p-2.5 rounded-xl bg-slate-800 text-slate-300 cursor-pointer">
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </div>
                </div>

                {/* 전개된 상세 & 팔로우업 노트 섹션 */}
                {isExpanded && (
                  <div className="p-6 bg-slate-950 border-t border-slate-800/80 space-y-6 animate-fadeIn">
                    
                    {/* 프로젝트 관계사 / 참여사 정보 */}
                    <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-4 space-y-3">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-400 uppercase tracking-wider font-mono">
                        <Briefcase className="w-3.5 h-3.5 text-indigo-400" /> 프로젝트 관계사 / 참여사 정보
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                        {([
                          ['시행사(발주처)', proj.developer],
                          ['시공사', proj.contractor],
                          ['건축설계사', proj.architect],
                          ['인테리어설계사', proj.interiorDesigner],
                          ['전기설계사', proj.electricalDesigner],
                          ['기계설계사', proj.mechanicalDesigner],
                          ['감리사', proj.supervisor],
                          ['운영사', proj.operator]
                        ] as [string, string | undefined][]).map(([label, companyName]) => {
                          const matched = findContactsForCompany(companyName);
                          return (
                            <div key={label} className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/40">
                              <div className="text-[10px] text-slate-500 font-semibold mb-0.5">{label}</div>
                              <div className="text-slate-200 font-medium">{companyName || '-'}</div>
                              {matched.length > 0 && (
                                <div className="mt-1.5 pt-1.5 border-t border-slate-800/60 space-y-1">
                                  {matched.map((c) => (
                                    <div key={c.id} className="text-[10px] text-indigo-300 leading-relaxed">
                                      <span className="font-bold text-indigo-200">{c.name}</span>
                                      {c.department && <span className="text-slate-400"> · {c.department}</span>}
                                      {c.title && <span className="text-slate-400"> · {c.title}</span>}
                                      {c.phoneMobile && <div className="text-slate-400 font-mono">{c.phoneMobile}</div>}
                                      {!c.phoneMobile && c.phoneOffice && <div className="text-slate-400 font-mono">{c.phoneOffice}</div>}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                                        
                    {/* 1. 연관된 거래처 명함 칩즈 */}
                    {relatedContacts.length > 0 && (
                      <div className="space-y-2">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
                          <Tag className="w-3.5 h-3.5 text-blue-400" /> 연관 거래처 담당자 명함
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {relatedContacts.map((rc) => (
                            <div key={rc.id} className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white">
                              <span className="font-bold">{rc.name}</span>
                              <span className="text-[11px] text-slate-400">{rc.company} ({rc.title})</span>
                              <span className="text-[10px] text-indigo-300 font-mono">{rc.phoneMobile}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 2. 미팅 및 후속 업무 타임라인 */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                        <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-indigo-400" /> 히스토리별 미팅 & 업무 기록 (최초 미팅 ~ N차 미팅)
                        </span>
                        <span className="text-[11px] text-slate-500">체계적인 미팅 관리</span>
                      </div>

                      {/* 미팅 입력 폼 */}
                      <form onSubmit={(e) => handleAddFollowup(proj.id, e)} className="bg-slate-900/50 border border-slate-800 p-4 rounded-2xl space-y-3.5">
                        <span className="text-xs font-bold text-slate-300 block">📝 새로운 미팅/팔로우업 기록 추가</span>
                        
                        <div className="flex flex-col md:flex-row gap-3">
                          {/* 미팅/팔로우업 차수 (제한 없음, 이미 기록된 차수는 건너뛰고 다음 차수를 자동 선택) */}
                          <div className="w-full md:w-1/4">
                            <label className="block text-[10px] text-slate-400 font-bold mb-1">미팅/팔로우업 차수 (선택, 제한 없음)</label>
                            <select
                              value={`${meetingDegree}-${meetingType}`}
                              onChange={(e) => {
                                const [d, t] = e.target.value.split('-');
                                setMeetingDegree(Number(d));
                                setMeetingType(t as 'meeting' | 'followup');
                              }}
                              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-medium outline-none focus:border-indigo-500"
                            >
                              <option value="0-meeting">업무 기록 (차수 없음)</option>
                              {buildMeetingSequenceOptions(proj.followUps || []).map((opt) => (
                                <option key={`${opt.degree}-${opt.type}`} value={`${opt.degree}-${opt.type}`}>
                                  {opt.label}{opt.used ? ' (기록됨)' : ''}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* 미팅일자 */}
                          <div className="w-full md:w-1/4">
                            <label className="block text-[10px] text-slate-400 font-bold mb-1">미팅일자</label>
                            <input
                              type="date"
                              value={meetingDate}
                              onChange={(e) => setMeetingDate(e.target.value)}
                              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white font-medium outline-none focus:border-indigo-500"
                            />
                          </div>

                          {/* 우리 회사 담당 직원 */}
                          <div className="w-full md:w-1/4">
                            <label className="block text-[10px] text-slate-400 font-bold mb-1">담당 직원 (우리 회사)</label>
                            {companyStaff.length > 0 ? (
                              <select
                                value={meetingStaffName}
                                onChange={(e) => setMeetingStaffName(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-medium outline-none focus:border-indigo-500"
                              >
                                <option value="">선택 안함</option>
                                {companyStaff.map((s) => (
                                  <option key={s.id} value={s.name}>{s.name}</option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type="text"
                                value={meetingStaffName}
                                onChange={(e) => setMeetingStaffName(e.target.value)}
                                placeholder="담당 직원명"
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white placeholder:text-slate-600 font-medium outline-none focus:border-indigo-500"
                              />
                            )}
                          </div>

                          {/* 미팅자 */}
                          <div className="flex-1">
                            <label className="block text-[10px] text-slate-400 font-bold mb-1 flex items-center justify-between">
                              <span>미팅 참여자 (미팅자)</span>
                              {relatedContacts.length > 0 && <span className="text-[9px] text-indigo-400 font-normal">아래 명함 클릭 시 자동 추가</span>}
                            </label>
                            <input
                              type="text"
                              value={meetingAttendee}
                              onChange={(e) => setMeetingAttendee(e.target.value)}
                              placeholder="예: 홍길동, 김대리(010-9999-8888) — 명함에 없는 분은 이름(전화번호)로 입력"
                              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-600 outline-none focus:border-indigo-500 font-medium"
                            />
                          </div>
                        </div>

                        {/* 미팅자 이름·연락처 직접 입력해서 추가 (명함 연동 없이도 바로 입력 가능) */}
                        <div className="border border-slate-800/80 bg-slate-950/40 rounded-xl p-3 space-y-2">
                          <span className="text-[10px] text-slate-400 font-bold block">📇 미팅자 이름 · 연락처 입력해서 추가</span>
                          <div className="flex flex-col md:flex-row gap-2">
                            <input
                              type="text"
                              value={attendeeNameInput}
                              onChange={(e) => setAttendeeNameInput(e.target.value)}
                              placeholder="이름 (필수)"
                              className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-slate-600 outline-none focus:border-indigo-500"
                            />
                            <input
                              type="text"
                              inputMode="numeric"
                              value={attendeeOfficeInput}
                              onChange={(e) => setAttendeeOfficeInput(formatPhoneNumber(e.target.value))}
                              placeholder="사무실 전화"
                              className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-slate-600 outline-none focus:border-indigo-500"
                            />
                            <input
                              type="text"
                              inputMode="numeric"
                              value={attendeeMobileInput}
                              onChange={(e) => setAttendeeMobileInput(formatPhoneNumber(e.target.value))}
                              placeholder="핸드폰"
                              className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-slate-600 outline-none focus:border-indigo-500"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (!attendeeNameInput.trim()) return;
                                const entry = buildAttendeeEntry(attendeeNameInput, attendeeOfficeInput, attendeeMobileInput);
                                setMeetingAttendee((prev) => (prev ? `${prev}, ${entry}` : entry));
                                setAttendeeNameInput('');
                                setAttendeeOfficeInput('');
                                setAttendeeMobileInput('');
                              }}
                              className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shrink-0 transition-colors"
                            >
                              + 추가
                            </button>
                          </div>
                        </div>

                        {/* 연관 명함 클릭 추가 */}
                        {relatedContacts.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                            <span className="text-[10px] text-slate-500 mr-1">빠른 미팅자 지정:</span>
                            {relatedContacts.map(c => {
                              const isAdded = meetingAttendee.includes(c.name);
                              return (
                                <button
                                  type="button"
                                  key={c.id}
                                  onClick={() => {
                                    if (isAdded) {
                                      setMeetingAttendee(prev => removeAttendeeEntry(prev, c));
                                    } else {
                                      setMeetingAttendee(prev => prev ? `${prev}, ${formatAttendeeEntry(c)}` : formatAttendeeEntry(c));
                                    }
                                  }}
                                  className={`text-[10px] px-2 py-0.5 rounded-lg border transition-all ${isAdded ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500/50 font-bold' : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'}`}
                                >
                                  + {c.name}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {/* 전체 명함(주소록)에서 검색해서 추가 */}
                        <div className="w-full">
                          <label className="block text-[10px] text-slate-500 mb-1">전체 명함(주소록)에서 찾아 추가 — 이 프로젝트에 연결 안 된 분도 검색 가능</label>
                          <select
                            value=""
                            onChange={(e) => {
                              const c = contacts.find((x) => x.id === e.target.value);
                              if (c && !meetingAttendee.includes(c.name)) {
                                setMeetingAttendee((prev) => (prev ? `${prev}, ${formatAttendeeEntry(c)}` : formatAttendeeEntry(c)));
                              }
                            }}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-medium outline-none focus:border-indigo-500"
                          >
                            <option value="">명함 검색해서 선택하면 자동 추가됩니다...</option>
                            {contacts.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name} · {c.company}{c.department ? ` (${c.department})` : ''}{c.phoneMobile ? ` — H.${c.phoneMobile}` : ''}{c.phoneOffice ? ` O.${c.phoneOffice}` : ''}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* 미팅 메모 입력 영역 (음성 지원) */}
                        <div className="space-y-1.5">
                          <label className="block text-[10px] text-slate-400 font-bold">미팅 내용 (타이핑 또는 음성 메모 가능)</label>
                          <div className="relative bg-slate-950 border border-slate-800 rounded-2xl p-3 focus-within:border-indigo-500 transition-all">
                            <textarea
                              value={meetingContent}
                              onChange={(e) => setMeetingContent(e.target.value)}
                              placeholder="오늘 논의된 미팅 상세 안건 및 피드백을 기록하세요..."
                              rows={3}
                              className="w-full bg-transparent text-xs text-slate-100 outline-none placeholder:text-slate-600 resize-none font-medium leading-relaxed"
                            />
                            
                            {/* 음성 녹음 중 오버레이 */}
                            {isRecording ? (
                              <div className="absolute inset-0 bg-slate-950/95 rounded-2xl flex items-center justify-between px-5 animate-pulse border border-rose-500/40">
                                <div className="flex items-center gap-2.5">
                                  <div className="relative flex items-center justify-center">
                                    <span className="absolute inline-flex h-4 w-4 rounded-full bg-rose-400 opacity-75 animate-ping"></span>
                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
                                  </div>
                                  <div className="space-y-0.5">
                                    <span className="text-[11px] font-bold text-rose-400">🎤 음성 메모 녹음 및 한글 음성 인식 가동 중...</span>
                                    <div className="flex items-center gap-1">
                                      {/* 애니메이션 오디오 파형 */}
                                      {[...Array(6)].map((_, i) => (
                                        <span 
                                          key={i} 
                                          className="w-1 bg-rose-500 rounded-full animate-bounce" 
                                          style={{ 
                                            height: `${8 + Math.floor(Math.random() * 12)}px`,
                                            animationDelay: `${i * 0.08}s`,
                                            animationDuration: '0.5s'
                                          }}
                                        />
                                      ))}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-xs text-slate-300 font-bold bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                                    {Math.floor(recordingSeconds / 60)}:{(recordingSeconds % 60) < 10 ? '0' + (recordingSeconds % 60) : (recordingSeconds % 60)}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={stopRecording}
                                    className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold transition-all shadow-md shadow-rose-600/30"
                                  >
                                    녹음 종료
                                  </button>
                                </div>
                              </div>
                            ) : voiceAttached ? (
                              <div className="mt-2 p-2 bg-indigo-950/40 border border-indigo-500/20 rounded-xl flex items-center justify-between text-[11px] text-indigo-300">
                                <div className="flex items-center gap-2">
                                  <Volume2 className="w-3.5 h-3.5 text-indigo-400 animate-pulse animate-duration-1000" />
                                  <span className="font-semibold text-slate-200">🎤 음성 메모 녹음 첨부됨 ({attachedVoiceDuration})</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setVoiceAttached(false);
                                    setAttachedVoiceUrl('');
                                    setAttachedVoiceDuration('');
                                  }}
                                  className="text-[10px] text-rose-400 hover:text-rose-300 font-bold px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800"
                                >
                                  삭제
                                </button>
                              </div>
                            ) : null}

                            {/* 컨트롤 바 */}
                            {!isRecording && (
                              <div className="flex items-center justify-between pt-2 border-t border-slate-900 mt-2">
                                <span className="text-[10px] text-slate-500 font-mono">
                                  {meetingContent.length}자 입력됨
                                </span>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={startRecording}
                                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-rose-950/30 border border-slate-800 hover:border-rose-900/30 text-rose-400 text-[10px] font-semibold transition-colors"
                                  >
                                    <Mic className="w-3 h-3 text-rose-400" />
                                    <span>🎤 음성 메모 녹음</span>
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* 첨부파일 (제안서, 견적서, 발송자료 등) */}
                        <div className="space-y-1.5">
                          <label className="block text-[10px] text-slate-400 font-bold flex items-center gap-1">
                            <Paperclip className="w-3 h-3" /> 첨부파일 (제안서, 견적서, 발송자료 등)
                          </label>
                          <label className="flex items-center justify-center gap-1.5 border border-dashed border-slate-700 rounded-xl py-2.5 cursor-pointer hover:border-indigo-500 text-slate-500 hover:text-indigo-400 text-[11px] font-semibold transition-colors">
                            <Paperclip className="w-3.5 h-3.5" />
                            <span>파일 선택 (여러 개 가능)</span>
                            <input
                              type="file"
                              multiple
                              className="hidden"
                              onChange={(e) => {
                                if (e.target.files) readFilesAsAttachments(e.target.files, (att) => setMeetingAttachments((prev) => [...prev, att]));
                                e.target.value = '';
                              }}
                            />
                          </label>
                          {meetingAttachments.length > 0 && (
                            <div className="space-y-1">
                              {meetingAttachments.map((att) => (
                                <div key={att.id} className="flex items-center justify-between gap-2 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-[11px]">
                                  <span className="flex items-center gap-1.5 text-slate-300 truncate">
                                    <FileText className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                                    <span className="truncate">{att.name}</span>
                                    <span className="text-slate-500 shrink-0">({formatFileSize(att.size)})</span>
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setMeetingAttachments((prev) => prev.filter((x) => x.id !== att.id))}
                                    className="text-rose-400 hover:text-rose-300 font-bold shrink-0"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {renderExpenseSection(meetingExpenses, setMeetingExpenses)}

                        {/* 전송 버튼 */}
                        <div className="flex justify-end pt-1">
                          <button
                            type="submit"
                            className="px-4.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md transition-all active:scale-95"
                          >
                            미팅 및 업무 기록 추가
                          </button>
                        </div>
                      </form>

                      {/* 히스토리 아이템들 */}
                      <div className="space-y-3 pt-1 max-h-96 overflow-y-auto pr-1">
                        {proj.followUps && proj.followUps.length > 0 ? (
                          [...proj.followUps]
                            .sort((a, b) => {
                              // 차수 기준 내림차순, 같은 차수면 팔로우업이 미팅보다 위로 오도록 정렬
                              const aVal = a.meetingDegree || 0;
                              const bVal = b.meetingDegree || 0;
                              if (bVal !== aVal) return bVal - aVal; // 최신 차수가 맨 위로
                              const aType = a.meetingType === 'followup' ? 1 : 0;
                              const bType = b.meetingType === 'followup' ? 1 : 0;
                              return bType - aType;
                            })
                            .map((fu) => (
                              <div
                                key={fu.id}
                                className="group/meeting p-4 rounded-2xl bg-slate-900 border border-slate-800 text-slate-200 hover:border-slate-700/80 hover:bg-slate-900/90 transition-all shadow-md relative flex flex-col justify-between space-y-2.5"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex items-center gap-2.5 flex-wrap">
                                    {/* 차수 뱃지 */}
                                    <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 font-bold text-[10px]">
                                      {fu.meetingDegree ? buildMeetingSequenceLabel(fu.meetingDegree, fu.meetingType || 'meeting') : '업무 기록'}
                                    </span>
                                    
                                    {/* 미팅 일자 */}
                                    <span className="text-[10px] font-mono text-slate-400 font-semibold">{fu.date}</span>

                                    {/* 담당 직원 (우리 회사) */}
                                    {fu.internalStaffName && (
                                      <span className="text-[11px] text-emerald-300 flex items-center gap-1 font-medium bg-emerald-950/30 px-2 py-0.5 rounded border border-emerald-500/20">
                                        <User className="w-3 h-3 text-emerald-400 shrink-0" />
                                        <span className="text-[10px] text-emerald-400/80 mr-0.5">담당:</span> {fu.internalStaffName}
                                      </span>
                                    )}

                                    {/* 미팅자 */}
                                    {fu.attendee && (
                                      <span className="text-[11px] text-slate-300 flex items-center gap-1 font-medium bg-slate-950/50 px-2 py-0.5 rounded border border-slate-800">
                                        <User className="w-3 h-3 text-indigo-400 shrink-0" />
                                        <span className="text-[10px] text-slate-400 mr-0.5">참석자:</span> {renderAttendeeWithPhone(fu.attendee)}
                                      </span>
                                    )}

                                    {/* 첨부파일 개수 */}
                                    {(fu.attachments || []).length > 0 && (
                                      <span className="text-[10px] text-indigo-300 flex items-center gap-1 font-bold bg-indigo-950/40 px-2 py-0.5 rounded border border-indigo-500/20">
                                        <Paperclip className="w-3 h-3" />
                                        첨부 {(fu.attachments || []).length}개
                                      </span>
                                    )}
                                  </div>

                                  {/* 수정/삭제 액션 */}
                                  <div className="flex items-center gap-1.5 opacity-0 group-hover/meeting:opacity-100 transition-all">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingFollowup({ projectId: proj.id, followup: { ...fu } });
                                        setEditAttendeeNameInput('');
                                        setEditAttendeeOfficeInput('');
                                        setEditAttendeeMobileInput('');
                                      }}
                                      className="p-1.5 rounded bg-slate-950 hover:bg-indigo-500/20 text-slate-500 hover:text-indigo-400 border border-slate-800 hover:border-indigo-900/30 transition-all shadow"
                                      title="기록 수정"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        if (confirm('이 미팅 및 팔로우업 기록을 삭제하시겠습니까?')) {
                                          try {
                                            await fetch(`/api/projects/${proj.id}/followups/${fu.id}`, { method: 'DELETE' });
                                          } finally {
                                            setProjects(projects.map(p => {
                                              if (p.id === proj.id) {
                                                return { ...p, followUps: p.followUps.filter(f => f.id !== fu.id) };
                                              }
                                              return p;
                                            }));
                                          }
                                        }
                                      }}
                                      className="p-1.5 rounded bg-slate-950 hover:bg-red-500/20 text-slate-500 hover:text-red-400 border border-slate-800 hover:border-red-900/30 transition-all shadow"
                                      title="기록 삭제"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>

                                {/* 미팅 메모 본문 */}
                                <div className="text-xs text-slate-200 leading-relaxed font-medium whitespace-pre-line pl-1">
                                  {fu.content || <span className="text-slate-500 italic">내용 메모 없음</span>}
                                </div>

                                {/* 첨부파일 목록 (제안서, 견적서, 발송자료 등) */}
                                {(fu.attachments || []).length > 0 && (
                                  <div className="flex flex-wrap gap-1.5 pl-1" onClick={(e) => e.stopPropagation()}>
                                    {(fu.attachments || []).map((att) => (
                                      <a
                                        key={att.id}
                                        href={att.dataUrl}
                                        download={att.name}
                                        className="flex items-center gap-1.5 bg-slate-950 hover:bg-indigo-950/40 border border-slate-800 hover:border-indigo-500/40 rounded-lg px-2.5 py-1 text-[11px] text-indigo-300 hover:text-indigo-200 font-semibold transition-colors"
                                      >
                                        <Paperclip className="w-3 h-3" />
                                        <span className="max-w-[160px] truncate">{att.name}</span>
                                        <Download className="w-3 h-3 opacity-60" />
                                      </a>
                                    ))}
                                  </div>
                                )}

                                {/* 비용 지출 내역 */}
                                {(fu.expenses || []).length > 0 && (
                                  <div className="bg-emerald-950/20 border border-emerald-500/20 rounded-xl p-2.5 space-y-1" onClick={(e) => e.stopPropagation()}>
                                    <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-bold">
                                      <Receipt className="w-3 h-3" />
                                      <span>비용 지출 {(fu.expenses || []).length}건</span>
                                      <span className="ml-auto font-mono">{formatCurrencyInput((fu.expenses || []).reduce((s, e) => s + e.amount, 0))}원</span>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                      {(fu.expenses || []).map((exp) => (
                                        <span key={exp.id} className="text-[10px] text-slate-300 bg-slate-950/60 border border-slate-800 rounded-lg px-2 py-1 flex items-center gap-1">
                                          {exp.receiptImage && <Camera className="w-3 h-3 text-emerald-400" />}
                                          <span>{expenseCategoryLabel(exp)}</span>
                                          <span className="font-mono text-slate-400">{formatCurrencyInput(exp.amount)}원</span>
                                          <span className="text-slate-500">
                                            ({exp.payMethod === 'company_card' ? '법인카드' : exp.payMethod === 'personal_card' ? '개인카드' : '현금'})
                                          </span>
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* 음성메모가 있을 경우 재생 플레이어 렌더링 */}
                                {fu.hasVoice && (
                                  <div className="p-3 bg-slate-950/80 border border-slate-800/60 rounded-xl max-w-sm space-y-2 mt-1" onClick={(e) => e.stopPropagation()}>
                                    <div className="flex items-center gap-3">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (playingVoiceId === fu.id) {
                                            setPlayingVoiceId(null);
                                          } else {
                                            setPlayingVoiceId(fu.id);
                                          }
                                        }}
                                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-all shrink-0 shadow-lg ${playingVoiceId === fu.id ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-indigo-400 hover:bg-slate-700'}`}
                                      >
                                        {playingVoiceId === fu.id ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
                                      </button>
                                      
                                      <div className="flex-1 space-y-1 overflow-hidden">
                                        <div className="flex items-center justify-between text-[10px]">
                                          <span className="text-slate-400 font-semibold flex items-center gap-1 truncate">
                                            <Headphones className="w-3 h-3 text-indigo-400 shrink-0" /> 음성 메모 녹음본
                                          </span>
                                          <span className="font-mono text-slate-500 shrink-0">{playingVoiceId === fu.id ? '재생 중' : '정지'} ({fu.voiceDuration || '0:06'})</span>
                                        </div>

                                        {/* 커스텀 오디오 파형 */}
                                        <div className="flex items-end gap-0.5 h-4 pt-0.5">
                                          {Array.from({ length: 24 }).map((_, index) => {
                                            const progress = playbackProgress[fu.id] || 0;
                                            const isPlayed = (index / 24) * 100 <= progress;
                                            const height = [8, 12, 6, 10, 12, 14, 4, 10, 12, 11, 6, 8, 11, 14, 10, 6, 8, 12, 10, 4, 11, 8, 10, 6][index % 24];
                                            
                                            // 재생중일 때 바가 위아래로 춤추는 애니메이션 효과
                                            const isPlaying = playingVoiceId === fu.id;
                                            const animatedHeight = isPlaying 
                                              ? Math.max(3, Math.round(height * (0.3 + Math.random() * 0.8))) 
                                              : height;

                                            return (
                                              <div
                                                key={index}
                                                className={`flex-1 rounded-t transition-all duration-150 ${isPlayed ? 'bg-indigo-500' : 'bg-slate-800'}`}
                                                style={{ height: `${animatedHeight}px` }}
                                              />
                                            );
                                          })}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))
                        ) : (
                          <div className="py-8 text-center text-xs text-slate-600 bg-slate-900/20 border border-slate-900/60 rounded-2xl">아직 작성된 미팅 기록이 없습니다.</div>
                        )}
                      </div>
                    </div>

                  </div>
                )}
              </div>
            );
          })}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {/* 모달: 새 프로젝트 생성 */}
      {isNewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 md:p-8 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h3 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-indigo-400" /> 신규 영업/제안 프로젝트 등록
              </h3>
              <button onClick={() => setIsNewOpen(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleCreateProject} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">프로젝트 타이틀 *</label>
                <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="예: 삼성전자 온디바이스 B2B 라이선스 공급 제안" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-medium outline-none focus:border-indigo-500" required />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">시행사(발주처)</label>
                  <input type="text" value={newDeveloper} onChange={(e) => setNewDeveloper(e.target.value)} placeholder="예: 한국디벨로퍼" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-medium outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">시공사</label>
                  <input type="text" value={newContractor} onChange={(e) => setNewContractor(e.target.value)} placeholder="예: 현대건설" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-medium outline-none focus:border-indigo-500" />
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">건축설계사</label>
                  <input type="text" value={newArchitect} onChange={(e) => setNewArchitect(e.target.value)} placeholder="예: 희림건축" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-medium outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">인테리어설계사</label>
                  <input type="text" value={newInteriorDesigner} onChange={(e) => setNewInteriorDesigner(e.target.value)} placeholder="예: 원오디자인" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-medium outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">전기설계사</label>
                  <input type="text" value={newElectricalDesigner} onChange={(e) => setNewElectricalDesigner(e.target.value)} placeholder="예: 나라설계" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-medium outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">기계설계사</label>
                  <input type="text" value={newMechanicalDesigner} onChange={(e) => setNewMechanicalDesigner(e.target.value)} placeholder="예: 우원엠앤이" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-medium outline-none focus:border-indigo-500" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">감리사</label>
                  <input type="text" value={newSupervisor} onChange={(e) => setNewSupervisor(e.target.value)} placeholder="예: 한미글로벌" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-medium outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">운영사</label>
                  <input type="text" value={newOperator} onChange={(e) => setNewOperator(e.target.value)} placeholder="예: 에스원" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-medium outline-none focus:border-indigo-500" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">진행 단계</label>
                  <select value={newStatus} onChange={(e) => setNewStatus(e.target.value as any)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-medium outline-none focus:border-indigo-500">
                    <option value="opportunity">기회 (Opportunity)</option>
                    <option value="progress">진행 (Progress)</option>
                    <option value="completed">완료 (Completed)</option>
                    <option value="failed">실패 (Failed)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">마감 기한</label>
                  <input type="date" value={newDueDate} onChange={(e) => setNewDueDate(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-medium outline-none focus:border-indigo-500" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">예상 거래 규모 / 예산 (원)</label>
                  <input type="text" inputMode="numeric" value={newBudget ? formatCurrencyInput(newBudget) : ''} onChange={(e) => setNewBudget(e.target.value.replace(/[^\d]/g, ''))} placeholder="예: 50,000,000" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-medium outline-none focus:border-indigo-500" />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">중요도</label>
                  <select value={newPriority} onChange={(e) => setNewPriority(e.target.value as any)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-medium outline-none focus:border-indigo-500">
                    <option value="high">🔥 높음</option>
                    <option value="medium">⚡ 보통</option>
                    <option value="low">🌱 낮음</option>
                  </select>
                </div>
              </div>

              {/* 연관 명함 체크 */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">연관된 명함 담당자 선택 (다중선택 가능)</label>
                <div className="max-h-36 overflow-y-auto bg-slate-950 border border-slate-800 rounded-xl p-2 space-y-1">
                  {contacts.map((c) => {
                    const checked = selectedContacts.includes(c.id);
                    return (
                      <label key={c.id} className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${checked ? 'bg-indigo-600/20 text-white font-bold' : 'text-slate-400 hover:bg-slate-900'}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedContacts([...selectedContacts, c.id]);
                            else setSelectedContacts(selectedContacts.filter((id) => id !== c.id));
                          }}
                          className="rounded border-slate-700 bg-slate-900 text-indigo-500"
                        />
                        <span>{c.name}</span>
                        <span className="text-[10px] text-slate-500">{c.company} ({c.title})</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* 거래처 인맥 직접 추가 */}
              <div className="border border-slate-800/80 bg-slate-950/40 rounded-xl p-3.5 space-y-3">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={useDirectContact}
                    onChange={(e) => setUseDirectContact(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-900 text-indigo-500 focus:ring-0 focus:ring-offset-0"
                  />
                  <span className="text-slate-300 font-semibold">새로운 담당자 직접 입력하여 연결</span>
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
                        inputMode="numeric"
                        value={directContactPhoneOffice}
                        onChange={(e) => setDirectContactPhoneOffice(formatPhoneNumber(e.target.value))}
                        placeholder="예: 02-1234-5678"
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white outline-none focus:border-indigo-500 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 text-[10px] font-semibold mb-1">연락처(핸드폰)</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={directContactPhoneMobile}
                        onChange={(e) => setDirectContactPhoneMobile(formatPhoneNumber(e.target.value))}
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

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
                <button type="button" onClick={() => setIsNewOpen(false)} className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold">취소</button>
                <button type="submit" className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-lg shadow-indigo-600/30">프로젝트 생성</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 모달: 프로젝트 정보 수정 (예산 등 등록 내용 수정) */}
      {editingProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 md:p-8 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h3 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-indigo-400" /> 프로젝트 정보 수정
              </h3>
              <button onClick={() => setEditingProject(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleUpdateProjectDetails} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">프로젝트 타이틀 *</label>
                <input type="text" value={editingProject.name} onChange={(e) => setEditingProject({ ...editingProject, name: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-medium outline-none focus:border-indigo-500" required />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">시행사(발주처)</label>
                  <input type="text" value={editingProject.developer || ''} onChange={(e) => setEditingProject({ ...editingProject, developer: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-medium outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">시공사</label>
                  <input type="text" value={editingProject.contractor || ''} onChange={(e) => setEditingProject({ ...editingProject, contractor: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-medium outline-none focus:border-indigo-500" />
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">건축설계사</label>
                  <input type="text" value={editingProject.architect || ''} onChange={(e) => setEditingProject({ ...editingProject, architect: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-medium outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">인테리어설계사</label>
                  <input type="text" value={editingProject.interiorDesigner || ''} onChange={(e) => setEditingProject({ ...editingProject, interiorDesigner: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-medium outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">전기설계사</label>
                  <input type="text" value={editingProject.electricalDesigner || ''} onChange={(e) => setEditingProject({ ...editingProject, electricalDesigner: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-medium outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">기계설계사</label>
                  <input type="text" value={editingProject.mechanicalDesigner || ''} onChange={(e) => setEditingProject({ ...editingProject, mechanicalDesigner: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-medium outline-none focus:border-indigo-500" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">감리사</label>
                  <input type="text" value={editingProject.supervisor || ''} onChange={(e) => setEditingProject({ ...editingProject, supervisor: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-medium outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">운영사</label>
                  <input type="text" value={editingProject.operator || ''} onChange={(e) => setEditingProject({ ...editingProject, operator: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-medium outline-none focus:border-indigo-500" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">진행 단계</label>
                  <select value={editingProject.status} onChange={(e) => setEditingProject({ ...editingProject, status: e.target.value as any })} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-medium outline-none focus:border-indigo-500">
                    <option value="opportunity">기회 (Opportunity)</option>
                    <option value="progress">진행 (Progress)</option>
                    <option value="completed">완료 (Completed)</option>
                    <option value="failed">실패 (Failed)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">마감 기한</label>
                  <input type="date" value={editingProject.dueDate} onChange={(e) => setEditingProject({ ...editingProject, dueDate: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-medium outline-none focus:border-indigo-500" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">예상 거래 규모 / 예산 (원)</label>
                  <input type="text" inputMode="numeric" value={editingProject.budget ? formatCurrencyInput(editingProject.budget) : ''} onChange={(e) => setEditingProject({ ...editingProject, budget: e.target.value.replace(/[^\d]/g, '') })} placeholder="예: 50,000,000" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-medium outline-none focus:border-indigo-500" />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">중요도</label>
                  <select value={editingProject.priority} onChange={(e) => setEditingProject({ ...editingProject, priority: e.target.value as any })} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-medium outline-none focus:border-indigo-500">
                    <option value="high">🔥 높음</option>
                    <option value="medium">⚡ 보통</option>
                    <option value="low">🌱 낮음</option>
                  </select>
                </div>
              </div>

              {/* 연관 명함 체크 (등록 화면과 동일하게 수정 가능) */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">연관된 명함 담당자 선택 (다중선택 가능)</label>
                <div className="max-h-36 overflow-y-auto bg-slate-950 border border-slate-800 rounded-xl p-2 space-y-1">
                  {contacts.map((c) => {
                    const checked = (editingProject.contactIds || []).includes(c.id);
                    return (
                      <label key={c.id} className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${checked ? 'bg-indigo-600/20 text-white font-bold' : 'text-slate-400 hover:bg-slate-900'}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const current = editingProject.contactIds || [];
                            const next = e.target.checked ? [...current, c.id] : current.filter((id) => id !== c.id);
                            setEditingProject({ ...editingProject, contactIds: next });
                          }}
                          className="rounded border-slate-700 bg-slate-900 text-indigo-500"
                        />
                        <span>{c.name}</span>
                        <span className="text-[10px] text-slate-500">{c.company} ({c.title})</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* 거래처 인맥 직접 추가 */}
              <div className="border border-slate-800/80 bg-slate-950/40 rounded-xl p-3.5 space-y-3">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={useDirectContact}
                    onChange={(e) => setUseDirectContact(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-900 text-indigo-500 focus:ring-0 focus:ring-offset-0"
                  />
                  <span className="text-slate-300 font-semibold">새로운 담당자 직접 입력하여 연결</span>
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
                        inputMode="numeric"
                        value={directContactPhoneOffice}
                        onChange={(e) => setDirectContactPhoneOffice(formatPhoneNumber(e.target.value))}
                        placeholder="예: 02-1234-5678"
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white outline-none focus:border-indigo-500 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 text-[10px] font-semibold mb-1">연락처(핸드폰)</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={directContactPhoneMobile}
                        onChange={(e) => setDirectContactPhoneMobile(formatPhoneNumber(e.target.value))}
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

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
                <button type="button" onClick={() => setEditingProject(null)} className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold">취소</button>
                <button type="submit" className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-lg shadow-indigo-600/30">저장하기</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 모달: 미팅 기록(팔로우업) 수정 */}
      {editingFollowup && (() => {
        const targetProject = projects.find((p) => p.id === editingFollowup.projectId);
        const relatedContactsForEdit = targetProject ? contacts.filter((c) => (targetProject.contactIds || []).includes(c.id)) : [];
        const fu = editingFollowup.followup;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 md:p-8 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <h3 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                  <Edit2 className="w-5 h-5 text-indigo-400" /> 미팅 기록 수정
                </h3>
                <button onClick={() => setEditingFollowup(null)} className="text-slate-400 hover:text-white">✕</button>
              </div>

              <form onSubmit={handleUpdateFollowup} className="space-y-4 text-xs">
                <div className="flex flex-col md:flex-row gap-3">
                  <div className="w-full md:w-1/3">
                    <label className="block text-slate-300 font-semibold mb-1">미팅/팔로우업 차수 (선택, 제한 없음)</label>
                    <select
                      value={`${fu.meetingDegree || 0}-${fu.meetingType || 'meeting'}`}
                      onChange={(e) => {
                        const [d, t] = e.target.value.split('-');
                        setEditingFollowup({ ...editingFollowup, followup: { ...fu, meetingDegree: Number(d) || undefined, meetingType: t as 'meeting' | 'followup' } });
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-medium outline-none focus:border-indigo-500"
                    >
                      <option value="0-meeting">업무 기록 (차수 없음)</option>
                      {buildMeetingSequenceOptions((targetProject?.followUps || []).filter((f) => f.id !== fu.id)).map((opt) => (
                        <option key={`${opt.degree}-${opt.type}`} value={`${opt.degree}-${opt.type}`}>
                          {opt.label}{opt.used ? ' (기록됨)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="w-full md:w-1/3">
                    <label className="block text-slate-300 font-semibold mb-1">미팅일자</label>
                    <input
                      type="date"
                      value={fu.date}
                      onChange={(e) => setEditingFollowup({ ...editingFollowup, followup: { ...fu, date: e.target.value } })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-medium outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="w-full md:w-1/3">
                    <label className="block text-slate-300 font-semibold mb-1">담당 직원 (우리 회사)</label>
                    {companyStaff.length > 0 ? (
                      <select
                        value={fu.internalStaffName || ''}
                        onChange={(e) => setEditingFollowup({ ...editingFollowup, followup: { ...fu, internalStaffName: e.target.value } })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-medium outline-none focus:border-indigo-500"
                      >
                        <option value="">선택 안함</option>
                        {companyStaff.map((s) => (
                          <option key={s.id} value={s.name}>{s.name}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={fu.internalStaffName || ''}
                        onChange={(e) => setEditingFollowup({ ...editingFollowup, followup: { ...fu, internalStaffName: e.target.value } })}
                        placeholder="담당 직원명"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white placeholder:text-slate-600 font-medium outline-none focus:border-indigo-500"
                      />
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1 flex items-center justify-between">
                    <span>미팅 참여자 (미팅자)</span>
                    {relatedContactsForEdit.length > 0 && <span className="text-[10px] text-indigo-400 font-normal">아래 명함 클릭 시 자동 추가/제거</span>}
                  </label>
                  <input
                    type="text"
                    value={fu.attendee || ''}
                    onChange={(e) => setEditingFollowup({ ...editingFollowup, followup: { ...fu, attendee: e.target.value } })}
                    placeholder="예: 홍길동, 김대리(010-9999-8888) — 명함에 없는 분은 이름(전화번호)로 입력"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white placeholder:text-slate-600 outline-none focus:border-indigo-500 font-medium"
                  />

                  {/* 미팅자 이름·연락처 직접 입력해서 추가 */}
                  <div className="border border-slate-800/80 bg-slate-950/40 rounded-xl p-3 space-y-2 mt-2">
                    <span className="text-[10px] text-slate-400 font-bold block">📇 미팅자 이름 · 연락처 입력해서 추가</span>
                    <div className="flex flex-col md:flex-row gap-2">
                      <input
                        type="text"
                        value={editAttendeeNameInput}
                        onChange={(e) => setEditAttendeeNameInput(e.target.value)}
                        placeholder="이름 (필수)"
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-slate-600 outline-none focus:border-indigo-500"
                      />
                      <input
                        type="text"
                        inputMode="numeric"
                        value={editAttendeeOfficeInput}
                        onChange={(e) => setEditAttendeeOfficeInput(formatPhoneNumber(e.target.value))}
                        placeholder="사무실 전화"
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-slate-600 outline-none focus:border-indigo-500"
                      />
                      <input
                        type="text"
                        inputMode="numeric"
                        value={editAttendeeMobileInput}
                        onChange={(e) => setEditAttendeeMobileInput(formatPhoneNumber(e.target.value))}
                        placeholder="핸드폰"
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-slate-600 outline-none focus:border-indigo-500"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (!editAttendeeNameInput.trim()) return;
                          const entry = buildAttendeeEntry(editAttendeeNameInput, editAttendeeOfficeInput, editAttendeeMobileInput);
                          const current = fu.attendee || '';
                          setEditingFollowup({ ...editingFollowup, followup: { ...fu, attendee: current ? `${current}, ${entry}` : entry } });
                          setEditAttendeeNameInput('');
                          setEditAttendeeOfficeInput('');
                          setEditAttendeeMobileInput('');
                        }}
                        className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shrink-0 transition-colors"
                      >
                        + 추가
                      </button>
                    </div>
                  </div>

                  {relatedContactsForEdit.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-2">
                      <span className="text-[10px] text-slate-500 mr-1">이 프로젝트의 연관 명함:</span>
                      {relatedContactsForEdit.map((c) => {
                        const isAdded = (fu.attendee || '').includes(c.name);
                        return (
                          <button
                            type="button"
                            key={c.id}
                            onClick={() => {
                              const current = fu.attendee || '';
                              const next = isAdded
                                ? removeAttendeeEntry(current, c)
                                : (current ? `${current}, ${formatAttendeeEntry(c)}` : formatAttendeeEntry(c));
                              setEditingFollowup({ ...editingFollowup, followup: { ...fu, attendee: next } });
                            }}
                            className={`text-[10px] px-2 py-0.5 rounded-lg border transition-all ${isAdded ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500/50 font-bold' : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'}`}
                          >
                            + {c.name}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <div className="pt-2">
                    <label className="block text-[10px] text-slate-500 mb-1">전체 명함(주소록)에서 찾아 추가 — 이 프로젝트에 연결 안 된 분도 검색 가능</label>
                    <select
                      value=""
                      onChange={(e) => {
                        const c = contacts.find((x) => x.id === e.target.value);
                        if (c && !(fu.attendee || '').includes(c.name)) {
                          const entry = formatAttendeeEntry(c);
                          setEditingFollowup({ ...editingFollowup, followup: { ...fu, attendee: fu.attendee ? `${fu.attendee}, ${entry}` : entry } });
                        }
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-medium outline-none focus:border-indigo-500"
                    >
                      <option value="">명함 검색해서 선택하면 자동 추가됩니다...</option>
                      {contacts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} · {c.company}{c.department ? ` (${c.department})` : ''}{c.phoneMobile ? ` — H.${c.phoneMobile}` : ''}{c.phoneOffice ? ` O.${c.phoneOffice}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">미팅 내용</label>
                  <textarea
                    value={fu.content}
                    onChange={(e) => setEditingFollowup({ ...editingFollowup, followup: { ...fu, content: e.target.value } })}
                    rows={5}
                    placeholder="미팅 내용을 입력하세요"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white placeholder:text-slate-600 outline-none focus:border-indigo-500 font-medium resize-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1 flex items-center gap-1">
                    <Paperclip className="w-3.5 h-3.5" /> 첨부파일 (제안서, 견적서, 발송자료 등)
                  </label>
                  <label className="flex items-center justify-center gap-1.5 border border-dashed border-slate-700 rounded-xl py-2.5 cursor-pointer hover:border-indigo-500 text-slate-500 hover:text-indigo-400 font-semibold transition-colors">
                    <Paperclip className="w-3.5 h-3.5" />
                    <span>파일 선택 (여러 개 가능)</span>
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files) {
                          readFilesAsAttachments(e.target.files, (att) => {
                            setEditingFollowup((prevEdit) => {
                              if (!prevEdit) return prevEdit;
                              const prevAttachments = prevEdit.followup.attachments || [];
                              return { ...prevEdit, followup: { ...prevEdit.followup, attachments: [...prevAttachments, att] } };
                            });
                          });
                        }
                        e.target.value = '';
                      }}
                    />
                  </label>
                  {(fu.attachments || []).length > 0 && (
                    <div className="space-y-1 mt-2">
                      {(fu.attachments || []).map((att) => (
                        <div key={att.id} className="flex items-center justify-between gap-2 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5">
                          <span className="flex items-center gap-1.5 text-slate-300 truncate">
                            <FileText className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                            <span className="truncate">{att.name}</span>
                            <span className="text-slate-500 shrink-0">({formatFileSize(att.size)})</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => setEditingFollowup({ ...editingFollowup, followup: { ...fu, attachments: (fu.attachments || []).filter((x) => x.id !== att.id) } })}
                            className="text-rose-400 hover:text-rose-300 font-bold shrink-0"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {renderExpenseSection(fu.expenses || [], editExpensesSetter)}

                <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
                  <button type="button" onClick={() => setEditingFollowup(null)} className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold">취소</button>
                  <button type="submit" className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-lg shadow-indigo-600/30">저장하기</button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* [수정] 영수증 썸네일 확대보기 라이트박스 */}
      {enlargedReceiptUrl && (
        <div
          className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-[110] flex items-center justify-center p-4"
          onClick={() => setEnlargedReceiptUrl(null)}
        >
          <button
            onClick={() => setEnlargedReceiptUrl(null)}
            className="absolute top-4 right-4 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold border border-slate-700 transition-all"
          >
            닫기
          </button>
          <img
            src={enlargedReceiptUrl}
            alt="영수증 확대보기"
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl border border-slate-800"
          />
        </div>
      )}

      {receiptCropTarget && (
        <CropAdjustModal
          imageDataUrl={receiptCropTarget.rawImage}
          title="영수증 테두리 확인"
          onConfirm={(cropped) => {
            runMeetingReceiptOcr(receiptCropTarget, cropped);
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
            const { setter } = receiptCameraTarget;
            const tempId = `exp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            setter((prev) => [...prev, { id: tempId, category: 'custom', amount: 0, payMethod: 'company_card', memo: '', receiptImage: dataUrl }]);
            runMeetingReceiptOcr({ tempId, rawImage: dataUrl, setter }, dataUrl);
            setReceiptCameraTarget(null);
          }}
          onCancel={() => setReceiptCameraTarget(null)}
          onFallbackToFile={() => {
            const setter = receiptCameraTarget.setter;
            setReceiptCameraTarget(null);
            meetingReceiptFallbackRef.current = setter;
            meetingReceiptFallbackInputRef.current?.click();
          }}
        />
      )}
      <input
        ref={meetingReceiptFallbackInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          const setter = meetingReceiptFallbackRef.current;
          if (file && setter) scanReceiptAndAddExpense(file, setter);
          e.target.value = '';
        }}
      />

      {/* [수정] 전체 프로젝트 목록 PDF 인쇄/미리보기 모달 */}
      {showProjectsPrintPreview && (
        <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center overflow-y-auto p-4">
          <div className="w-full max-w-[215mm] h-[92vh] mx-auto bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden">
            <div className="no-print p-4 sm:p-5 border-b border-slate-800 bg-slate-900/90 flex flex-col sm:flex-row sm:items-center justify-between gap-4 sticky top-0 z-10">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                  <FileText className="w-5 h-5" />
                </div>
                <h2 className="text-base sm:text-lg font-bold text-slate-100 tracking-tight">전체 프로젝트 목록 미리보기 (총 {filteredProjects.length}건)</h2>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={handleExportProjectsExcel} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-500/15 active:scale-95 transition-all">
                  <FileSpreadsheet className="w-3.5 h-3.5" /><span>엑셀 다운로드</span>
                </button>
                <button onClick={() => window.print()} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-500/15 active:scale-95 transition-all">
                  <Printer className="w-3.5 h-3.5" /><span>인쇄 / PDF 저장</span>
                </button>
                <button onClick={() => setShowProjectsPrintPreview(false)} className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 bg-slate-950 p-4 sm:p-8 overflow-y-auto flex justify-center">
              <table className="shrink-0" style={{ width: '210mm', borderCollapse: 'collapse' }}><tbody><tr><td style={{ border: '2px solid #000000', background: '#fff' }}>
              <div className="text-black p-6 sm:p-8 text-xs font-sans leading-tight">
                <div className="text-center mb-6">
                  <span className="inline-block border-b-4 border-double border-black pb-1 px-4 text-xl sm:text-2xl font-extrabold text-black">전체 프로젝트 목록</span>
                  <p className="text-[10px] text-gray-500 mt-1">출력일: {new Date().toLocaleDateString('ko-KR')}</p>
                </div>

                <table className="w-full border-collapse border-[1.5px] border-black text-[10px]">
                  <thead>
                    <tr className="bg-gray-100">
                      {['프로젝트명', '상태', '우선순위', '마감일', '예산', '시행사', '시공사', '건축설계', '인테리어', '전기설계', '기계설계', '감리사', '운영사', '명함', '팔로우업'].map(h => (
                        <th key={h} className="border border-black px-1.5 py-1.5 font-bold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProjects.map(p => (
                      <tr key={p.id}>
                        <td className="border border-black px-1.5 py-1.5 text-left">{p.name}</td>
                        <td className="border border-black px-1.5 py-1.5 text-center">{STATUS_LABEL_KO[p.status]}</td>
                        <td className="border border-black px-1.5 py-1.5 text-center">{PRIORITY_LABEL_KO[p.priority]}</td>
                        <td className="border border-black px-1.5 py-1.5 text-center">{p.dueDate}</td>
                        <td className="border border-black px-1.5 py-1.5 text-right">{p.budget || '-'}</td>
                        <td className="border border-black px-1.5 py-1.5">{p.developer || '-'}</td>
                        <td className="border border-black px-1.5 py-1.5">{p.contractor || '-'}</td>
                        <td className="border border-black px-1.5 py-1.5">{p.architect || '-'}</td>
                        <td className="border border-black px-1.5 py-1.5">{p.interiorDesigner || '-'}</td>
                        <td className="border border-black px-1.5 py-1.5">{p.electricalDesigner || '-'}</td>
                        <td className="border border-black px-1.5 py-1.5">{p.mechanicalDesigner || '-'}</td>
                        <td className="border border-black px-1.5 py-1.5">{p.supervisor || '-'}</td>
                        <td className="border border-black px-1.5 py-1.5">{p.operator || '-'}</td>
                        <td className="border border-black px-1.5 py-1.5 text-center">{(p.contactIds || []).length}</td>
                        <td className="border border-black px-1.5 py-1.5 text-center">{(p.followUps || []).length}</td>
                      </tr>
                    ))}
                    {filteredProjects.length === 0 && (
                      <tr><td colSpan={15} className="border border-black px-2 py-6 text-center text-gray-400">표시할 프로젝트가 없습니다.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              </td></tr></tbody></table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
