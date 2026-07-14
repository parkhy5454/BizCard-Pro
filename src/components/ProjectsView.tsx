import React, { useState, useEffect } from 'react';
import { Briefcase, Plus, Calendar, DollarSign, Users, CheckCircle2, Circle, Clock, ChevronDown, ChevronUp, Trash2, Tag, Edit2, Mic, Volume2, Play, Pause, User, Music, Activity, Headphones, AlertTriangle, Sparkles, Paperclip, Download, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Project, BusinessCard, ProjectFollowUp, ProjectFollowUpAttachment } from '../types.js';
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
}

export const ProjectsView: React.FC<Props> = ({ 
  contacts,
  setContacts,
  projects,
  setProjects,
  filterStatus,
  setFilterStatus,
  currentUser
}) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
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
  const [meetingAttendee, setMeetingAttendee] = useState<string>('');
  const [meetingStaffName, setMeetingStaffName] = useState<string>('');
  const [attendeeNameInput, setAttendeeNameInput] = useState<string>('');
  const [attendeeOfficeInput, setAttendeeOfficeInput] = useState<string>('');
  const [attendeeMobileInput, setAttendeeMobileInput] = useState<string>('');
  const [meetingDate, setMeetingDate] = useState<string>('');
  const [meetingContent, setMeetingContent] = useState<string>('');
  const [meetingAttachments, setMeetingAttachments] = useState<ProjectFollowUpAttachment[]>([]);
  
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
  const [newName, setNewName] = useState<string>('');
  const [newDeveloper, setNewDeveloper] = useState<string>('');
  const [newContractor, setNewContractor] = useState<string>('');
  const [newArchitect, setNewArchitect] = useState<string>('');
  const [newElectricalDesigner, setNewElectricalDesigner] = useState<string>('');
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
          attendee: followup.attendee,
          internalStaffName: followup.internalStaffName,
          attachments: followup.attachments || []
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

  const handleAddFollowup = async (projectId: string, e: React.FormEvent) => {
    e.preventDefault();
    if (!meetingContent.trim() && !voiceAttached && meetingAttachments.length === 0) return;

    const payload = {
      content: meetingContent,
      date: meetingDate || new Date().toISOString().split('T')[0],
      status: 'done' as const,
      meetingDegree: meetingDegree || undefined,
      attendee: meetingAttendee,
      internalStaffName: meetingStaffName,
      hasVoice: voiceAttached,
      voiceUrl: voiceAttached ? attachedVoiceUrl : undefined,
      voiceDuration: voiceAttached ? attachedVoiceDuration : undefined,
      attachments: meetingAttachments
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
          attendee: payload.attendee,
          internalStaffName: payload.internalStaffName,
          hasVoice: payload.hasVoice,
          voiceUrl: payload.voiceUrl,
          voiceDuration: payload.voiceDuration,
          attachments: payload.attachments
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
    setMeetingDegree(prev => prev + 1);
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

  const filteredProjects = projects.filter((p) => filterStatus === 'all' || p.status === filterStatus);

  return (
    <div className="space-y-3 animate-fadeIn max-w-6xl mx-auto">
      
      {/* 헤더 바 */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3.5 bg-indigo-500/10 text-indigo-400 rounded-2xl border border-indigo-500/20 shadow-inner">
            <Briefcase className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white tracking-tight">비즈니스 프로젝트 관리</h2>
            <p className="text-xs text-slate-400 mt-1">등록된 명함 거래처들과 연계하여 기회 발굴, 영업 진행 상태, 완료 및 실패 프로젝트를 체계적으로 트래킹하세요.</p>
          </div>
        </div>

        <button
          onClick={() => setIsNewOpen(true)}
          className="px-5 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 active:scale-95 transition-all flex items-center justify-center gap-2 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>새 프로젝트 등록</span>
        </button>
      </div>

      {/* ⚠️ 팔로우업 알림 배너 */}
      {(() => {
        const needyProjs = projects.filter(p => {
          if (p.status !== 'opportunity' && p.status !== 'progress') return false;
          const { days } = getDaysSinceLastActivity(p);
          return days >= 7;
        });

        if (needyProjs.length > 0) {
          return (
            <div className="bg-gradient-to-r from-rose-950/40 to-amber-950/30 border border-rose-500/30 rounded-3xl p-5 md:p-6 shadow-xl flex items-start gap-4 animate-fadeIn">
              <div className="p-2.5 bg-rose-500/20 text-rose-400 rounded-xl border border-rose-500/30 shrink-0">
                <AlertTriangle className="w-5 h-5 animate-bounce" />
              </div>
              <div className="space-y-1.5 flex-1">
                <h4 className="text-sm font-bold text-rose-300 flex items-center gap-1.5">
                  <span>신속한 팔로우업이 필요한 활성 프로젝트가 {needyProjs.length}개 있습니다!</span>
                </h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  마지막 미팅 또는 비즈니스 프로젝트 등록 후 <span className="text-rose-400 font-bold">1주일(7일) 이상</span> 경과하여 연락이 뜸해진 건들입니다. 신속하게 안부 연락이나 차기 미팅 조율을 진행해 보세요.
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
        {/* 가로 슬라이딩 가이드 팁 */}
        <div className="flex items-center justify-center gap-2 text-xs text-slate-400 bg-slate-900/40 border border-slate-800/60 py-2.5 px-4 rounded-2xl max-w-sm mx-auto animate-pulse select-none">
          <Sparkles className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
          <span>💡 화면을 좌우로 쓸어넘겨 프로젝트 필터 상태를 전환하세요</span>
        </div>

        {loading ? (
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
                          if (days >= 7) {
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
                          const isOverdue = days >= 7;
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
                          ['전기설계사', proj.electricalDesigner],
                          ['기계설계사', proj.mechanicalDesigner],
                          ['감리사', proj.supervisor],
                          ['운영사', proj.operator]
                        ] as [string, string | undefined][]).map(([label, companyName], boxIdx) => {
                          const matched = findContactsForCompany(companyName);
                          return (
                            <div key={label} className={`bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/40 ${boxIdx === 6 ? 'col-span-2' : ''}`}>
                              <div className="text-[10px] text-slate-500 font-semibold mb-0.5">{label}</div>
                              <div className="text-slate-200 font-medium">{companyName || '-'}</div>
                              {matched.length > 0 && (
                                <div className="mt-1.5 pt-1.5 border-t border-slate-800/60 space-y-1">
                                  {matched.map((c) => (
                                    <div key={c.id} className="text-[10px] text-indigo-300 leading-relaxed">
                                      <span className="font-bold text-indigo-200">{c.name}</span>
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
                          {/* 미팅 차수 (제한 없이 직접 입력, 비워두면 '업무 기록'으로 처리) */}
                          <div className="w-full md:w-1/4">
                            <label className="block text-[10px] text-slate-400 font-bold mb-1">미팅 차수 (선택, 제한 없음)</label>
                            <input
                              type="number"
                              min={1}
                              value={meetingDegree || ''}
                              onChange={(e) => setMeetingDegree(e.target.value ? Number(e.target.value) : 0)}
                              placeholder="예: 47"
                              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-medium outline-none focus:border-indigo-500"
                            />
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
                              // 차수 기준 오름차순 또는 내림차순 정렬 (기본 등록 내림차순)
                              const aVal = a.meetingDegree || 0;
                              const bVal = b.meetingDegree || 0;
                              return bVal - aVal; // 최신 차수 미팅이 맨 위로 오도록 정렬
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
                                      {fu.meetingDegree ? `${fu.meetingDegree}차 미팅` : '업무 기록'}
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

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">건축설계사</label>
                  <input type="text" value={newArchitect} onChange={(e) => setNewArchitect(e.target.value)} placeholder="예: 희림건축" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-medium outline-none focus:border-indigo-500" />
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

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">건축설계사</label>
                  <input type="text" value={editingProject.architect || ''} onChange={(e) => setEditingProject({ ...editingProject, architect: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-medium outline-none focus:border-indigo-500" />
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
                    <label className="block text-slate-300 font-semibold mb-1">미팅 차수 (선택, 제한 없음)</label>
                    <input
                      type="number"
                      min={1}
                      value={fu.meetingDegree || ''}
                      onChange={(e) => setEditingFollowup({ ...editingFollowup, followup: { ...fu, meetingDegree: e.target.value ? Number(e.target.value) : undefined } })}
                      placeholder="예: 47 (비워두면 업무 기록으로 표시)"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-medium outline-none focus:border-indigo-500"
                    />
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

                <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
                  <button type="button" onClick={() => setEditingFollowup(null)} className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold">취소</button>
                  <button type="submit" className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-lg shadow-indigo-600/30">저장하기</button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

    </div>
  );
};
