import React, { useState } from 'react';
import { X, Phone, Building2, Printer, Mail, MapPin, History, Edit3, Plus, ArrowDownLeft, ArrowUpRight, PhoneMissed, Calendar, Clock, MessageSquare, Sparkles, Navigation, Camera, RefreshCw, Share2, UserPlus, Lock, Unlock, Globe, Home, Smartphone } from 'lucide-react';
import { BusinessCard, ContactGroup, CallRecord, User } from '../types.js';
import { formatPhoneNumber } from '../phoneFormat.js';
import { LiveCameraCapture } from './LiveCameraCapture.js';
import { CropAdjustModal, rotateDataUrlByDegrees } from './CropAdjustModal.js';
import { generateStandardCardImage } from '../cardImageGenerator.js';
import { getContactGroupIds } from '../groupUtils.js';
import { getContactImageProxyUrl } from '../imageProxy.js';
import { GroupMultiSelect } from './GroupMultiSelect.js';
import { generateContactVCardText, downloadContactVCard } from '../vcardUtils.js';

interface Props {
  contact: BusinessCard | null;
  groups: ContactGroup[];
  currentUser?: User | null;
  onClose: () => void;
  onUpdateContact: (updated: BusinessCard) => void;
  onAddCallHistory: (contactId: string, record: { type: 'incoming'|'outgoing'|'missed'; duration?: string; note?: string }) => void;
  initialTab?: 'info' | 'history' | 'edit';
}

export const CardDetailModal: React.FC<Props> = ({ contact, groups, currentUser, onClose, onUpdateContact, onAddCallHistory, initialTab = 'info' }) => {
  // Hooks(useState/useRef/useEffect)는 반드시 조건 없이 매 렌더링마다 동일한 순서로 호출되어야 하므로,
  // "contact가 없으면 그리지 않는다" 처리보다 먼저 선언합니다 (React Hooks 규칙).
  const [activeTab, setActiveTab] = useState<'info' | 'history' | 'edit'>(initialTab);
  const [cardSide, setCardSide] = useState<'front' | 'back'>('front');
  const [rescanCameraTarget, setRescanCameraTarget] = useState<'front' | 'back' | null>(null);
  const [rescanCropTarget, setRescanCropTarget] = useState<{ side: 'front' | 'back'; rawImage: string } | null>(null);
  const rescanFileInputRef = React.useRef<HTMLInputElement>(null);
  const cardSwipeStartX = React.useRef<number>(0);
  // [수정] "전달하기" 버튼이 잠깐 "복사됨" 등으로 상태를 표시할 수 있도록
  const [shareStatus, setShareStatus] = useState<'idle' | 'copied'>('idle');
  // [수정] "이 분에게 앱 추천하기" 버튼의 상태 표시용
  const [inviteStatus, setInviteStatus] = useState<'idle' | 'copied'>('idle');

  // 통화기록 추가 폼 상태
  const [callType, setCallType] = useState<'incoming' | 'outgoing' | 'missed'>('incoming');
  const [callDuration, setCallDuration] = useState('');
  const [callNote, setCallNote] = useState('');
  const [isAddingCall, setIsAddingCall] = useState(false);
  // [추가] "이미지 다시 만들기" 버튼을 눌렀다는 걸 명확히 알 수 있도록 하는 상태.
  // 왼쪽 미리보기가 즉시 바뀌는 것과 더불어, 확실한 텍스트 확인까지 준다.
  const [imageRegeneratedAt, setImageRegeneratedAt] = useState<number | null>(null);

  // AI 회사 요약 검색 상태
  const [isSearchingCompany, setIsSearchingCompany] = useState(false);

  // [추가] 재스캔 후 "새로 인식된 내용 중 뭘 반영할지" 비교해서 보여주는 상태.
  // AI 인식이 가끔 틀릴 수 있어서, 자동으로 덮어쓰지 않고 바뀐 항목만 사람이 골라서
  // 반영하게 한다(예: 이직해서 회사/부서/직책/연락처가 바뀐 경우).
  type FieldDiff = { field: keyof BusinessCard; label: string; oldValue: string; newValue: string; selected: boolean };
  const [rescanDiffs, setRescanDiffs] = useState<FieldDiff[] | null>(null);
  const [isRecognizingRescan, setIsRecognizingRescan] = useState(false);
  const [rescanRecognizeError, setRescanRecognizeError] = useState<string | null>(null);

  const RESCAN_DIFF_FIELDS: { field: keyof BusinessCard; label: string }[] = [
    { field: 'name', label: '이름' },
    { field: 'company', label: '회사명' },
    { field: 'department', label: '부서' },
    { field: 'title', label: '직책' },
    { field: 'phoneMobile', label: '휴대전화' },
    { field: 'phoneOffice', label: '사무실 전화' },
    { field: 'phoneOffice2', label: '사무실 전화2' },
    { field: 'phoneFax', label: '팩스' },
    { field: 'email', label: '이메일' },
    { field: 'address', label: '주소' },
    { field: 'address2', label: '주소2' },
    { field: 'website', label: '웹사이트' }
  ];

  // 수정 폼 상태
  const [editForm, setEditForm] = useState<BusinessCard>({ ...contact } as BusinessCard);

  // 연락처 변경 시 상태 동기화
  React.useEffect(() => {
    if (contact) {
      setActiveTab(initialTab);
      setEditForm({ ...contact });
      setImageRegeneratedAt(null);
      setRescanDiffs(null);
      setRescanRecognizeError(null);
    }
  }, [contact?.id, initialTab]);

  if (!contact) return null;

  // 재스캔한(또는 조정 완료한) 이미지를 해당 면에 저장
  // [수정] 예전엔 서버(contact)에만 새 이미지를 저장하고, 이 모달이 들고 있는 수정 폼
  // 상태(editForm)는 그대로 옛날 이미지를 들고 있었다. "수정" 탭 화면은 editForm 기준으로
  // 그려지기 때문에 재스캔 직후 화면엔 반영된 것처럼 보였지만, 그 상태에서 다른 값을 고치고
  // "저장"을 누르면 editForm에 남아있던 옛날 이미지가 방금 찍은 사진을 다시 덮어써버리는
  // 문제가 있었다. 이제 서버 저장과 함께 editForm도 같이 갱신해서, 재스캔 이후 저장을
  // 몇 번을 눌러도 방금 스캔한 사진이 유지되게 한다.
  const applyRescannedImage = (side: 'front' | 'back', dataUrl: string) => {
    if (!contact) return;
    // [수정] 실제로 사진을 다시 찍었으니, 더 이상 "자동 생성 이미지"가 아니다. 이 플래그를 꺼두지
    // 않으면, 나중에 이름 등 텍스트만 고쳐도 지금 찍은 실제 사진이 자동생성 이미지로 덮어써진다.
    const field = side === 'front' ? 'frontImage' : 'backImage';
    onUpdateContact({
      ...contact,
      [field]: dataUrl,
      isAutoGeneratedImage: false
    });
    setEditForm((prev) => ({
      ...prev,
      [field]: dataUrl,
      isAutoGeneratedImage: false
    }));

    // [추가] 이직 등으로 회사/부서/직책/연락처가 바뀌었을 수 있으니, 방금 찍은 새 사진을
    // AI로 읽어서 기존 정보와 다른 항목이 있으면 비교해서 보여준다. AI 인식이 가끔 틀릴 수
    // 있어서 자동으로 덮어쓰지 않고, 사람이 바뀐 항목만 골라서 반영하게 한다.
    void recognizeAndDiffRescan(side, dataUrl);
  };

  // [추가] contact.frontImage/backImage는 이미 저장된 명함이면 base64가 아니라 서버(Supabase)
  // 저장소의 이미지 "주소(URL)"인 경우가 많다. 이걸 AI API에 그대로 보내면 "사진 데이터"가
  // 아니라 "글자로 된 URL 문자열"을 사진으로 오인하고 디코딩에 실패해서 에러가 난다
  // (재스캔한 한쪽 면만 실제 base64이고, 나머지 한쪽 면이 URL인 상태로 같이 보낼 때 발생).
  // URL이면 실제로 내려받아서 base64로 바꿔주고, 이미 base64(data:)면 그대로 쓴다.
  const ensureBase64Image = async (img: string): Promise<string> => {
    if (!img) return '';
    if (img.startsWith('data:')) return img;
    try {
      const res = await fetch(img);
      const blob = await res.blob();
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('이미지를 불러오지 못했습니다.'));
        reader.readAsDataURL(blob);
      });
    } catch {
      // 저장소 이미지 다운로드에 실패하면, 이 면은 인식 대상에서 빼고 진행한다
      // (재스캔한 면만이라도 인식되게 하는 게 아예 실패하는 것보다 낫다).
      return '';
    }
  };

  const recognizeAndDiffRescan = async (side: 'front' | 'back', dataUrl: string) => {
    if (!contact) return;
    setIsRecognizingRescan(true);
    setRescanRecognizeError(null);
    try {
      const otherSideRaw = side === 'front' ? (editForm.backImage || contact.backImage || '') : (editForm.frontImage || contact.frontImage || '');
      const otherSideBase64 = await ensureBase64Image(otherSideRaw);
      const frontImage = side === 'front' ? dataUrl : otherSideBase64;
      const backImage = side === 'back' ? dataUrl : otherSideBase64;
      const res = await fetch('/api/scan-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frontImage, backImage })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      // [추가] 이 재스캔 화면은 사진을 즉시 저장한 뒤(applyRescannedImage) AI 응답을 나중에 받기
      // 때문에, 크롭 단계의 순수 도형 인식(expectedAspectRatio)만으로는 못 잡는 상하 반전(180도)이
      // 그대로 저장돼 있을 수 있었다. Gemini가 실제로 읽은 글자 방향(frontRotation/backRotation)을
      // 이제서야 받았으니, 방금 재스캔한 면의 사진만 마지막으로 한 번 더 보정해서 다시 저장한다.
      const rescanRotation = side === 'front' ? data.frontRotation : data.backRotation;
      let finalDataUrl = dataUrl;
      if (rescanRotation) {
        try {
          finalDataUrl = await rotateDataUrlByDegrees(dataUrl, rescanRotation);
          const field = side === 'front' ? 'frontImage' : 'backImage';
          onUpdateContact({ ...contact, ...editForm, [field]: finalDataUrl, isAutoGeneratedImage: false });
          setEditForm((prev) => ({ ...prev, [field]: finalDataUrl, isAutoGeneratedImage: false }));
        } catch (err) {
          console.error('재스캔 사진 방향 보정 실패, 보정 전 사진 유지:', err);
        }
      }

      const base = { ...contact, ...editForm, ...(rescanRotation ? { [side === 'front' ? 'frontImage' : 'backImage']: finalDataUrl } : {}) };
      const diffs: FieldDiff[] = RESCAN_DIFF_FIELDS
        .map(({ field, label }) => {
          const newValue = (data[field] || '').toString().trim();
          const oldValue = ((base[field] as string) || '').toString().trim();
          if (!newValue || newValue === oldValue) return null;
          return { field, label, oldValue, newValue, selected: true };
        })
        .filter((d): d is FieldDiff => d !== null);

      if (diffs.length > 0) {
        setRescanDiffs(diffs);
      }
    } catch (err: any) {
      setRescanRecognizeError(err.message || '명함 인식에 실패했습니다. 사진은 정상적으로 저장됐습니다.');
    } finally {
      setIsRecognizingRescan(false);
    }
  };

  const toggleRescanDiff = (field: keyof BusinessCard) => {
    setRescanDiffs((prev) => prev ? prev.map((d) => d.field === field ? { ...d, selected: !d.selected } : d) : prev);
  };

  const applySelectedRescanDiffs = () => {
    if (!rescanDiffs || !contact) return;
    const patch: Partial<BusinessCard> = {};
    rescanDiffs.forEach((d) => {
      if (d.selected) (patch as any)[d.field] = d.newValue;
    });
    const updated = { ...contact, ...editForm, ...patch } as BusinessCard;
    onUpdateContact(updated);
    setEditForm(updated);
    setRescanDiffs(null);
  };

  const handleRescanFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const side = rescanCameraTarget;
    if (!file || !side) return;
    const reader = new FileReader();
    reader.onload = () => {
      setRescanCropTarget({ side, rawImage: reader.result as string });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
    setRescanCameraTarget(null);
  };

  const contactGroups = getContactGroupIds(contact).map((gid) => groups.find((g) => g.id === gid)).filter((g): g is ContactGroup => Boolean(g));

  const handleSearchCompanySummary = async () => {
    if (!contact.company) return;
    setIsSearchingCompany(true);
    try {
      const response = await fetch('/api/company/search-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company: contact.company })
      });
      if (response.ok) {
        const data = await response.json();
        if (data.companyInfo) {
          const updated = { ...contact, companyInfo: data.companyInfo };
          onUpdateContact(updated);
          setEditForm(prev => ({ ...prev, companyInfo: data.companyInfo }));
        }
      }
    } catch (error) {
      console.error('Error searching company summary:', error);
    } finally {
      setIsSearchingCompany(false);
    }
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    // [수정] 가져오기 때 사진이 없어서 이름/회사로 자동 생성해둔 명함 이미지는, 텍스트만
    // 고치고 저장하면 사진 속 글자는 예전 그대로 남아있는 문제가 있었다(예: "희중 김"으로
    // 잘못 들어온 이름을 "김희중"으로 고쳐도 사진에는 여전히 "희중 김"). 자동 생성 이미지인
    // 경우, 저장하는 시점의 최신 정보로 이미지를 다시 그려서 함께 저장한다. 실제 사진을
    // 촬영/업로드한 명함은 isAutoGeneratedImage가 false라 여기서 건드리지 않는다.
    const finalForm = editForm.isAutoGeneratedImage
      ? { ...editForm, frontImage: generateStandardCardImage(editForm) || editForm.frontImage }
      : editForm;
    onUpdateContact(finalForm);
    setActiveTab('info');
  };

  // [추가] "통화가 됐는지"는 웹앱이 알 방법이 없지만(iOS/Android 정책상 막혀있음),
  // "언제 전화 버튼을 눌렀는지"는 100% 알 수 있다. 그래서 전화 앱으로 넘어가는 바로 그
  // 순간에, 자동으로 "발신 시도" 통화 기록을 하나 남긴다. 실제로 통화가 됐는지 여부와
  // 상관없이 "몇 시에 연락을 시도했는지"만큼은 놓치지 않고 남는다.
  const handleDialClick = (phoneNumber: string) => {
    if (!contact || !phoneNumber) return;
    onAddCallHistory(contact.id, {
      type: 'outgoing',
      note: '(자동 기록) 전화 버튼을 눌러 발신을 시도했습니다.'
    });
  };

  const handleSaveCallRecord = (e: React.FormEvent) => {
    e.preventDefault();
    onAddCallHistory(contact.id, {
      type: callType,
      duration: callDuration || undefined,
      note: callNote || undefined
    });
    setCallDuration('');
    setCallNote('');
    setIsAddingCall(false);
  };

  // [수정] 회사 사람이 아닌 외부인에게 이 명함(회사 내부에서 등록해 공유 중인 거래처 명함)을 전달하는 기능.
  // 별도의 공개 웹링크를 만들지 않고, 휴대폰 기본 공유 시트(Web Share API)를 통해 그 자리에서
  // 카카오톡/문자/메일/에어드롭 등 사용자가 이미 쓰는 채널로 1:1 전달하도록 한다.
  const handleShareContact = async () => {
    const text = [
      `[명함 전달] ${contact.name} · ${contact.company}`,
      `${contact.title}${contact.department ? ' | ' + contact.department : ''}`,
      contact.phoneMobile ? `📞 ${contact.phoneMobile}` : '',
      contact.email ? `📧 ${contact.email}` : '',
      contact.address ? `🏢 ${contact.address}` : ''
    ].filter(Boolean).join('\n');

    try {
      const nav = navigator as any;
      // 1) vCard 파일까지 함께 공유 가능한 환경이면 파일로 전달 (상대방이 바로 연락처 저장 가능)
      if (nav.canShare && typeof File !== 'undefined') {
        try {
          const vcardText = generateContactVCardText(contact);
          const file = new File([vcardText], `${contact.name}.vcf`, { type: 'text/vcard' });
          if (nav.canShare({ files: [file] })) {
            await nav.share({ title: `${contact.name} 명함`, text, files: [file] });
            return;
          }
        } catch {
          // 파일 공유 준비 중 문제가 있으면 아래 텍스트 공유로 조용히 넘어간다
        }
      }
      // 2) 파일 공유는 안 되지만 기본 공유 시트는 지원하는 환경 (텍스트만 공유)
      if (nav.share) {
        await nav.share({ title: `${contact.name} 명함`, text });
        return;
      }
      // 3) 공유 API 자체를 지원하지 않는 환경(주로 PC 브라우저): 클립보드로 복사
      await navigator.clipboard.writeText(text);
      setShareStatus('copied');
      setTimeout(() => setShareStatus('idle'), 2000);
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.error('명함 전달 실패:', err);
      }
    }
  };

  // [수정] 명함 스캔 초대(바이럴 루프): 이 명함의 주인에게 앱 사용을 추천하는 메시지를 보낸다.
  // 실제로 그 사람이 이 링크로 가입했는지까지는 추적하지 않고, "보냈다"는 사실만 서버에 기록해서
  // 나중에 "누가 몇 명 추천했는지" 정도는 볼 수 있게 해둔다.
  const handleInviteContact = async () => {
    const inviteText = [
      `${currentUser?.name ? currentUser.name + '님이' : '지인이'} BizCard Pro를 추천했어요!`,
      `명함을 카메라로 찍기만 하면 AI가 자동으로 인식해서 저장해주는 스마트 명함 관리 앱이에요.`,
      `👉 https://bizcard-pro.onrender.com`
    ].join('\n');

    let channel: 'sms' | 'share' | 'other' = 'other';
    try {
      const nav = navigator as any;
      if (nav.share) {
        channel = 'share';
        await nav.share({ title: 'BizCard Pro 추천', text: inviteText });
      } else if (contact.phoneMobile) {
        channel = 'sms';
        window.open(`sms:${contact.phoneMobile}?body=${encodeURIComponent(inviteText)}`, '_blank');
      } else {
        await navigator.clipboard.writeText(inviteText);
        setInviteStatus('copied');
        setTimeout(() => setInviteStatus('idle'), 2000);
      }

      // 발송 이력 기록 (실패해도 사용자 경험엔 영향 없도록 조용히 무시)
      try {
        const headers: any = { 'Content-Type': 'application/json' };
        if (currentUser) headers['x-user-id'] = currentUser.id;
        await fetch('/api/invites', {
          method: 'POST',
          headers,
          body: JSON.stringify({ contactId: contact.id, contactName: contact.name, channel })
        });
      } catch (err) {
        console.error('초대 기록 저장 실패:', err);
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.error('초대 보내기 실패:', err);
      }
    }
  };

  // [수정] "나만 보기(비공개)" 토글. 이 명함을 등록한 본인만 켜고 끌 수 있다
  // (오래된 데이터처럼 등록자 정보가 없는 경우엔 누구나 설정 가능하게 허용).
  const canTogglePrivacy = !contact.addedByUserId || contact.addedByUserId === currentUser?.id;
  const handleTogglePrivate = () => {
    onUpdateContact({ ...contact, isPrivate: !contact.isPrivate });
  };

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return iso;
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const date = String(d.getDate()).padStart(2, '0');
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      return `${year}년 ${month}월 ${date}일 ${hours}시 ${minutes}분`;
    } catch {
      return iso;
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="relative w-full max-w-4xl bg-white border border-slate-200 rounded-3xl shadow-2xl flex flex-col md:flex-row overflow-y-auto md:overflow-hidden max-h-[95vh] md:max-h-[90vh]">
        
        {/* 좌측: 명함 앞/뒤 이미지 프리뷰 영역 */}
        <div className="w-full md:w-1/2 bg-slate-50 p-6 flex flex-col justify-between border-b md:border-b-0 md:border-r border-slate-200">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold tracking-wider text-slate-500 uppercase font-mono">
                명함 원본 스캔 프리뷰
              </span>
              
              {/* 앞면/뒷면 전환 버튼 */}
              {/* [수정] 예전엔 뒷면 이미지가 이미 있을 때만 이 버튼이 보였다. 그러면 아직
              뒷면을 한 번도 스캔한 적 없는 명함은 "뒷면" 모드로 전환할 방법 자체가 없어서
              뒷면을 처음 스캔하는 게 불가능했다. 이제 뒷면 이미지 유무와 상관없이 항상
              전환 버튼을 보여줘서, 뒷면이 없는 상태에서도 "뒷면"으로 넘어가 처음 스캔할
              수 있게 한다. */}
              <div className="flex bg-white rounded-lg p-1 border border-slate-200 text-xs">
                <button
                  onClick={() => setCardSide('front')}
                  className={`px-3 py-1 rounded-md font-medium transition-all ${cardSide === 'front' ? 'bg-blue-600 text-white shadow' : 'text-slate-500 hover:text-white'}`}
                >
                  앞면
                </button>
                <button
                  onClick={() => setCardSide('back')}
                  className={`px-3 py-1 rounded-md font-medium transition-all ${cardSide === 'back' ? 'bg-blue-600 text-white shadow' : 'text-slate-500 hover:text-white'}`}
                >
                  뒷면
                </button>
              </div>
            </div>

            {/* 카드 액자 (명함 비율에 맞춰 전체가 잘리지 않게 표시, 좌우로 밀어도 전환됨) */}
            <div
              className="aspect-[1.586/1] w-full rounded-2xl overflow-hidden bg-white border border-slate-200 shadow-2xl relative group/img flex items-center justify-center touch-pan-y"
              onTouchStart={(e) => { cardSwipeStartX.current = e.touches[0].clientX; }}
              onTouchEnd={(e) => {
                const deltaX = e.changedTouches[0].clientX - cardSwipeStartX.current;
                if (Math.abs(deltaX) < 40) return;
                setCardSide((prev) => (prev === 'front' ? 'back' : 'front'));
              }}
            >
              {cardSide === 'front' ? (
                (activeTab === 'edit' ? editForm.frontImage : contact.frontImage) ? (
                  <img src={activeTab === 'edit' ? editForm.frontImage : getContactImageProxyUrl(contact, 'front')} alt="명함 앞면" className="w-full h-full object-contain transition-transform duration-500 group-hover/img:scale-105 select-none" draggable={false} />
                ) : (
                  <div className="text-center p-6 text-slate-400">
                    <Building2 className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">앞면 스캔 이미지가 없습니다</p>
                  </div>
                )
              ) : (
                contact.backImage ? (
                  <img src={getContactImageProxyUrl(contact, 'back')} alt="명함 뒷면" className="w-full h-full object-contain transition-transform duration-500 group-hover/img:scale-105 select-none" draggable={false} />
                ) : (
                  <div className="text-center p-6 text-slate-400">
                    <Building2 className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">뒷면 스캔 이미지가 없습니다</p>
                  </div>
                )
              )}

              {/* 앞/뒤 점 표시기 (뒷면 있을 때만) */}
              {contact.backImage && (
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-10">
                  <span className={`w-1.5 h-1.5 rounded-full transition-all ${cardSide === 'front' ? 'bg-white' : 'bg-white/40'}`} />
                  <span className={`w-1.5 h-1.5 rounded-full transition-all ${cardSide === 'back' ? 'bg-white' : 'bg-white/40'}`} />
                </div>
              )}
            </div>

            {/* 현재 보고 있는 면(앞/뒤)을 카메라 가이드로 다시 스캔.
            뒷면 이미지가 아직 없어도 cardSide를 '뒷면'으로 전환한 뒤 이 버튼을 누르면
            뒷면을 처음 스캔할 수 있다(위 앞면/뒷면 버튼이 이제 항상 보이므로 가능해졌다). */}
            <button
              type="button"
              onClick={() => setRescanCameraTarget(cardSide)}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 hover:text-indigo-800 text-xs font-bold transition-colors"
            >
              <Camera className="w-3.5 h-3.5" />
              {cardSide === 'front' ? '앞면 재스캔' : '뒷면 재스캔'}
            </button>
          </div>

          {/* 빠른 전화/문자 발신 바 */}
          <div className="pt-6 space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">다이렉트 액션</p>
            <div className="grid grid-cols-2 gap-3">
              <a
                href={contact.phoneMobile ? `tel:${contact.phoneMobile}` : '#'}
                onClick={() => contact.phoneMobile && handleDialClick(contact.phoneMobile)}
                className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-sm shadow-lg transition-all ${contact.phoneMobile ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-500 hover:to-teal-500 active:scale-95' : 'bg-slate-100 text-slate-400 pointer-events-none'}`}
              >
                <Phone className="w-4 h-4" />
                <span>핸드폰 통화</span>
              </a>

              <a
                href={contact.phoneMobile ? `sms:${contact.phoneMobile}` : '#'}
                className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-sm shadow-lg transition-all ${contact.phoneMobile ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-500 hover:to-indigo-500 active:scale-95' : 'bg-slate-100 text-slate-400 pointer-events-none'}`}
              >
                <MessageSquare className="w-4 h-4" />
                <span>문자 보내기</span>
              </a>
            </div>
            
            {contact.phoneOffice && (
              <a
                href={`tel:${contact.phoneOffice}`}
                onClick={() => handleDialClick(contact.phoneOffice)}
                className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl bg-white border border-slate-200 hover:border-slate-200 text-slate-600 font-medium text-xs transition-colors"
              >
                <Building2 className="w-3.5 h-3.5 text-blue-400" />
                <span>사무실 유선전화 연결 ({contact.phoneOffice})</span>
              </a>
            )}

            {/* [수정] 외부(회사 밖) 사람에게 이 명함을 전달하는 버튼. 휴대폰 기본 공유 시트를 열어
                카카오톡/문자/메일/에어드롭 등으로 그 자리에서 바로 보낼 수 있게 한다. */}
            <button
              type="button"
              onClick={handleShareContact}
              className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl bg-white border border-slate-200 hover:border-indigo-500/50 text-slate-700 hover:text-slate-700 font-bold text-xs transition-colors"
            >
              <Share2 className="w-3.5 h-3.5 text-indigo-400" />
              <span>{shareStatus === 'copied' ? '명함 정보가 복사되었습니다!' : '이 명함 외부로 전달하기'}</span>
            </button>

            {/* [추가] 캠카드의 "아이폰에 저장" 버튼과 동일한 기능. vCard(.vcf) 파일을 바로
                다운로드해서, 아이폰(iOS Safari)에서는 곧바로 "연락처에 추가" 화면이 뜨고
                안드로이드/PC에서도 기본 연락처 앱으로 바로 열린다. 이 앱에 이미 저장돼 있는
                명함을 휴대폰 기본 연락처 앱에도 따로 저장하고 싶을 때 쓰는 버튼이다. */}
            <button
              type="button"
              onClick={() => downloadContactVCard(contact)}
              className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl bg-white border border-slate-200 hover:border-emerald-500/50 text-slate-700 hover:text-slate-700 font-bold text-xs transition-colors"
            >
              <Smartphone className="w-3.5 h-3.5 text-emerald-500" />
              <span>휴대폰 연락처에 저장 (vCard)</span>
            </button>

            {/* [수정] 명함 스캔 초대(바이럴 루프): 이 명함 주인에게 앱 사용을 추천하는 메시지를 보낸다 */}
            <button
              type="button"
              onClick={handleInviteContact}
              className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200 hover:border-indigo-300 text-indigo-700 hover:text-indigo-800 font-bold text-xs transition-colors"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>{inviteStatus === 'copied' ? '추천 메시지가 복사되었습니다!' : '이 분에게 앱 추천하기'}</span>
            </button>
          </div>
        </div>

        {/* 우측: 상세 인포메이션 & 히스토리 타임라인 탭 */}
        <div className="w-full md:w-1/2 p-6 flex flex-col md:overflow-hidden">
          
          {/* 상단 헤더 & 닫기 */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab('info')}
                className={`px-3 py-1.5 rounded-xl text-sm font-semibold transition-all ${activeTab === 'info' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40' : 'text-slate-500 hover:text-white'}`}
              >
                명함 상세정보
              </button>
              
              <button
                onClick={() => setActiveTab('history')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold transition-all ${activeTab === 'history' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40' : 'text-slate-500 hover:text-white'}`}
              >
                <History className="w-4 h-4" />
                <span>통화 히스토리</span>
                <span className="px-1.5 py-0.2 rounded-full text-xs bg-slate-100 text-blue-600 font-mono">{contact.callHistory?.length || 0}</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              {activeTab === 'info' && (
                <button
                  onClick={() => setActiveTab('edit')}
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-700 text-xs flex items-center gap-1"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>수정</span>
                </button>
              )}
              <button
                onClick={onClose}
                className="p-2 rounded-full bg-slate-100 hover:bg-rose-600 text-slate-500 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* 탭 1: 상세정보 뷰 */}
          {activeTab === 'info' && (
            <div className="flex-1 overflow-y-auto py-5 space-y-6 pr-2">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">{contact.name}</h2>
                  {contactGroups.map((g) => (
                    <span key={g.id} className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${g.color}`}>{g.name}</span>
                  ))}
                  {/* [수정] 팀/부서별 공유 범위: 이 명함을 등록한 본인만 켜고 끌 수 있는 "나만 보기(비공개)" 토글 */}
                  {canTogglePrivacy && (
                    <button
                      type="button"
                      onClick={handleTogglePrivate}
                      title={contact.isPrivate ? '비공개 상태 - 눌러서 회사 전체에 공개하기' : '눌러서 나만 보기(비공개)로 전환'}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border transition-colors ${
                        contact.isPrivate
                          ? 'bg-amber-50 text-amber-700 border-amber-500/30 hover:bg-amber-500/20'
                          : 'bg-slate-100 text-slate-400 border-slate-200 hover:text-slate-600'
                      }`}
                    >
                      {contact.isPrivate ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                      <span>{contact.isPrivate ? '나만 보기' : '회사 전체 공개'}</span>
                    </button>
                  )}
                </div>
                <p className="text-base font-semibold text-blue-400 mt-1">{contact.title || '직책 미등록'}</p>
                <p className="text-sm font-medium text-slate-600 flex items-center gap-1.5 mt-1">
                  <Building2 className="w-4 h-4 text-slate-500" />
                  <span>{contact.company} {contact.department ? `| ${contact.department}` : ''}</span>
                </p>
              </div>

              {/* 핸드폰/사무실/팩스 분리 박스 */}
              <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider font-mono">연락처 상세 분리 입력</h4>
                
                <div className="grid grid-cols-1 gap-2.5 text-sm">
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-slate-200">
                    <span className="flex items-center gap-2 text-slate-500 text-xs font-medium"><Phone className="w-4 h-4 text-emerald-400" /> 핸드폰 (Mobile)</span>
                    <span className="font-mono font-bold text-emerald-600">{contact.phoneMobile || '-'}</span>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-slate-200">
                    <span className="flex items-center gap-2 text-slate-500 text-xs font-medium"><Building2 className="w-4 h-4 text-blue-400" /> 사무실 1 (Office 1)</span>
                    <span className="font-mono font-semibold text-slate-700">{contact.phoneOffice || '-'}</span>
                  </div>

                  {contact.phoneOffice2 && (
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-slate-200">
                      <span className="flex items-center gap-2 text-slate-500 text-xs font-medium"><Building2 className="w-4 h-4 text-cyan-400" /> 사무실 2 (Office 2)</span>
                      <span className="font-mono font-semibold text-slate-700">{contact.phoneOffice2}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-slate-200">
                    <span className="flex items-center gap-2 text-slate-500 text-xs font-medium"><Printer className="w-4 h-4 text-amber-400" /> 팩스 번호 (Fax)</span>
                    <span className="font-mono text-slate-600">{contact.phoneFax || '-'}</span>
                  </div>
                </div>
              </div>

              {/* 주소 & 이메일 */}
              <div className="space-y-3 text-sm text-slate-600">
                <div className="flex items-start gap-3 bg-slate-100 p-3.5 rounded-xl border border-slate-200">
                  <Mail className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-slate-500 font-medium">이메일</p>
                    <p className="font-mono font-medium text-slate-800">{contact.email || '미등록'}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 bg-slate-100 p-3.5 rounded-xl border border-slate-200">
                  <Globe className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-xs text-slate-500 font-medium">홈페이지</p>
                    {contact.website ? (
                      <a
                        href={contact.website.startsWith('http') ? contact.website : `https://${contact.website}`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="font-mono font-medium text-sky-600 hover:underline break-all"
                      >
                        {contact.website}
                      </a>
                    ) : (
                      <p className="font-mono font-medium text-slate-400">미등록</p>
                    )}
                  </div>
                </div>

                {contact.homeAddress && (
                  <div className="flex items-start gap-3 bg-amber-50 p-3.5 rounded-xl border border-amber-200">
                    <Home className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-amber-600 font-medium">집 주소 <span className="font-normal opacity-70">(개인정보)</span></p>
                      <p className="font-mono font-medium text-slate-700 break-all">{contact.homeAddress}</p>
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-3 bg-slate-100 p-3.5 rounded-xl border border-slate-200">
                  <MapPin className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-500 font-medium">회사 주소 1 (본사 - 지도 연동)</p>
                    <p className="text-slate-700 mt-0.5 break-words">{contact.address || '미등록'}</p>
                    {contact.lat && <p className="text-[10px] text-slate-400 font-mono mt-1">좌표: {contact.lat.toFixed(4)}, {contact.lng?.toFixed(4)}</p>}
                    
                    {contact.address && contact.address !== '미등록' && (
                      <div className="mt-2 pt-2 border-t border-slate-200 flex flex-wrap gap-1.5 items-center">
                        <span className="text-[10px] text-slate-500 mr-1 font-medium flex items-center gap-1">
                          <Navigation className="w-3 h-3 text-blue-400 animate-pulse" />
                          길찾기:
                        </span>
                        <button
                          onClick={() => {
                            const enc = encodeURIComponent(contact.address);
                            window.open(`tmap://search?name=${enc}`, '_blank');
                            setTimeout(() => {
                              window.open(`https://search.naver.com/search.naver?query=${enc}+길찾기`, '_blank');
                            }, 500);
                          }}
                          className="text-[10px] px-2 py-0.5 bg-amber-50 hover:bg-amber-500/20 text-amber-700 rounded-md border border-amber-500/20 transition-all font-bold cursor-pointer"
                          title="티맵 앱 실행 (모바일) 또는 웹 검색"
                        >
                          티맵
                        </button>
                        <button
                          onClick={() => window.open(`https://map.kakao.com/link/search/${encodeURIComponent(contact.address)}`, '_blank')}
                          className="text-[10px] px-2 py-0.5 bg-yellow-400/10 hover:bg-yellow-400/20 text-yellow-500 rounded-md border border-yellow-400/20 transition-all font-bold cursor-pointer"
                          title="카카오맵/카카오내비 연결"
                        >
                          카카오
                        </button>
                        <button
                          onClick={() => window.open(`https://map.naver.com/v5/search/${encodeURIComponent(contact.address)}`, '_blank')}
                          className="text-[10px] px-2 py-0.5 bg-emerald-50 hover:bg-emerald-500/20 text-emerald-700 rounded-md border border-emerald-500/20 transition-all font-bold cursor-pointer"
                          title="네이버 지도 연결"
                        >
                          네이버
                        </button>
                        <button
                          onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(contact.address)}`, '_blank')}
                          className="text-[10px] px-2 py-0.5 bg-blue-50 hover:bg-blue-500/20 text-blue-700 rounded-md border border-blue-500/20 transition-all font-bold cursor-pointer"
                          title="구글 지도 연결"
                        >
                          구글맵
                        </button>
                        <button
                          onClick={() => window.open(`https://maps.apple.com/?q=${encodeURIComponent(contact.address)}`, '_blank')}
                          className="text-[10px] px-2 py-0.5 bg-purple-50 hover:bg-purple-500/20 text-purple-700 rounded-md border border-purple-500/20 transition-all font-bold cursor-pointer"
                          title="애플 지도 연결"
                        >
                          애플맵
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {contact.address2 && (
                  <div className="flex items-start gap-3 bg-slate-100 p-3.5 rounded-xl border border-slate-200">
                    <MapPin className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-indigo-400 font-medium flex items-center gap-1.5">
                        <span>회사 주소 2 (지사/공장 등)</span>
                        <span className="text-[9px] bg-indigo-50 text-indigo-700 px-1.5 py-0.2 rounded font-bold font-mono">스캔 분리</span>
                      </p>
                      <p className="text-slate-700 mt-0.5 break-words">{contact.address2}</p>
                      
                      <div className="mt-2 pt-2 border-t border-slate-200 flex flex-wrap gap-1.5 items-center">
                        <span className="text-[10px] text-indigo-400 mr-1 font-medium flex items-center gap-1">
                          <Navigation className="w-3 h-3 text-indigo-400 animate-pulse" />
                          길찾기:
                        </span>
                        <button
                          onClick={() => {
                            const enc = encodeURIComponent(contact.address2!);
                            window.open(`tmap://search?name=${enc}`, '_blank');
                            setTimeout(() => {
                              window.open(`https://search.naver.com/search.naver?query=${enc}+길찾기`, '_blank');
                            }, 500);
                          }}
                          className="text-[10px] px-2 py-0.5 bg-amber-50 hover:bg-amber-500/20 text-amber-700 rounded-md border border-amber-500/20 transition-all font-bold cursor-pointer"
                          title="티맵 앱 실행 (모바일) 또는 웹 검색"
                        >
                          티맵
                        </button>
                        <button
                          onClick={() => window.open(`https://map.kakao.com/link/search/${encodeURIComponent(contact.address2!)}`, '_blank')}
                          className="text-[10px] px-2 py-0.5 bg-yellow-400/10 hover:bg-yellow-400/20 text-yellow-500 rounded-md border border-yellow-400/20 transition-all font-bold cursor-pointer"
                          title="카카오맵/카카오내비 연결"
                        >
                          카카오
                        </button>
                        <button
                          onClick={() => window.open(`https://map.naver.com/v5/search/${encodeURIComponent(contact.address2!)}`, '_blank')}
                          className="text-[10px] px-2 py-0.5 bg-emerald-50 hover:bg-emerald-500/20 text-emerald-700 rounded-md border border-emerald-500/20 transition-all font-bold cursor-pointer"
                          title="네이버 지도 연결"
                        >
                          네이버
                        </button>
                        <button
                          onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(contact.address2!)}`, '_blank')}
                          className="text-[10px] px-2 py-0.5 bg-blue-50 hover:bg-blue-500/20 text-blue-700 rounded-md border border-blue-500/20 transition-all font-bold cursor-pointer"
                          title="구글 지도 연결"
                        >
                          구글맵
                        </button>
                        <button
                          onClick={() => window.open(`https://maps.apple.com/?q=${encodeURIComponent(contact.address2!)}`, '_blank')}
                          className="text-[10px] px-2 py-0.5 bg-purple-50 hover:bg-purple-500/20 text-purple-700 rounded-md border border-purple-500/20 transition-all font-bold cursor-pointer"
                          title="애플 지도 연결"
                        >
                          애플맵
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* [수정] 예전엔 이 블록이 이름/직책 바로 아래(수정하러 들어가기 전엔 눈에 덜
              띄는 위치)에 있었는데, 메모 바로 위로 옮겨서 상세정보 화면을 열자마자 스크롤
              한 번이면 바로 보이게 했다. 이름도 "AI 기업 인텔리전스"로 바꿨다. */}
              <div className="p-3.5 rounded-2xl bg-indigo-50 border border-indigo-100 text-xs text-slate-700">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                  <span className="font-bold text-indigo-700 text-[10px] uppercase tracking-wider font-mono flex items-center gap-1.5">
                    🏢 AI 기업 인텔리전스
                  </span>
                  {contact.company && (
                    <button
                      type="button"
                      disabled={isSearchingCompany}
                      onClick={handleSearchCompanySummary}
                      className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-[10px] flex items-center gap-1 transition-all shadow-md active:scale-95 disabled:opacity-50 select-none cursor-pointer self-start sm:self-auto shrink-0"
                    >
                      {isSearchingCompany ? (
                        <>
                          <div className="w-2.5 h-2.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>검색 중...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-2.5 h-2.5 text-blue-100 animate-pulse" />
                          <span>AI 기업 인텔리전스</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
                {contact.companyInfo ? (
                  <p className="leading-relaxed text-slate-800 text-xs font-medium bg-white p-2.5 rounded-xl border border-indigo-100">
                    {contact.companyInfo}
                  </p>
                ) : (
                  <div className="text-center py-3 text-slate-400 text-[11px] bg-white rounded-xl border border-dashed border-slate-200">
                    회사 정보가 아직 요약되지 않았습니다. 실시간 검색 버튼을 눌러 업종·주요 사업, 매출액, 직원수를 검색해 보세요.
                  </div>
                )}
              </div>

              {/* 명함 메모 */}
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-4 rounded-2xl border border-indigo-100">
                <h4 className="text-xs font-bold text-indigo-700 uppercase tracking-wider mb-2">비즈니스 메모 / 요약</h4>
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{contact.memo || '작성된 비즈니스 메모가 없습니다.'}</p>
              </div>
            </div>
          )}

          {/* 탭 2: 통화 히스토리 타임라인 */}
          {activeTab === 'history' && (
            <div className="flex-1 flex flex-col overflow-hidden pt-4">
              <div className="flex items-center justify-between pb-3">
                <span className="text-xs text-slate-500 font-medium">과거~현재 통화 & 미팅 히스토리 타임라인</span>
                <button
                  onClick={() => setIsAddingCall(!isAddingCall)}
                  className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white shadow transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>통화기록 추가</span>
                </button>
              </div>

              {/* 통화기록 추가 모달/서브폼 */}
              {isAddingCall && (
                <form onSubmit={handleSaveCallRecord} className="mb-4 bg-slate-50 p-4 rounded-2xl border border-blue-500/40 space-y-3 animate-fadeIn text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-blue-400 uppercase">새 통화 히스토리 기록</span>
                    <button type="button" onClick={() => setIsAddingCall(false)} className="text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setCallType('incoming')}
                      className={`flex items-center justify-center gap-1.5 p-2 rounded-lg border font-medium transition-all ${callType === 'incoming' ? 'bg-emerald-600/20 border-emerald-500 text-emerald-600 font-bold' : 'bg-white border-slate-200 text-slate-500'}`}
                    >
                      <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-400" /> 수신통화
                    </button>
                    <button
                      type="button"
                      onClick={() => setCallType('outgoing')}
                      className={`flex items-center justify-center gap-1.5 p-2 rounded-lg border font-medium transition-all ${callType === 'outgoing' ? 'bg-blue-600/20 border-blue-500 text-blue-600 font-bold' : 'bg-white border-slate-200 text-slate-500'}`}
                    >
                      <ArrowUpRight className="w-3.5 h-3.5 text-blue-400" /> 발신통화
                    </button>
                    <button
                      type="button"
                      onClick={() => setCallType('missed')}
                      className={`flex items-center justify-center gap-1.5 p-2 rounded-lg border font-medium transition-all ${callType === 'missed' ? 'bg-rose-600/20 border-rose-500 text-rose-600 font-bold' : 'bg-white border-slate-200 text-slate-500'}`}
                    >
                      <PhoneMissed className="w-3.5 h-3.5 text-rose-400" /> 부재중
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="통화 소요시간 (예: 5분 30초)"
                      value={callDuration}
                      onChange={(e) => setCallDuration(e.target.value)}
                      className="w-1/3 bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none focus:border-blue-500"
                    />
                    <input
                      type="text"
                      placeholder="통화 내용 메모 요약 (예: 제안서 피드백 논의 건)"
                      value={callNote}
                      onChange={(e) => setCallNote(e.target.value)}
                      className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <button type="submit" className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-xs shadow transition-all">
                    히스토리 타임라인에 저장
                  </button>
                </form>
              )}

              {/* 타임라인 리스트 */}
              <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                {(!contact.callHistory || contact.callHistory.length === 0) ? (
                  <div className="py-12 text-center text-slate-400">
                    <History className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">기록된 통화 히스토리가 없습니다</p>
                    <p className="text-xs text-slate-400 mt-1">상단의 '통화기록 추가' 버튼으로 과거 약속이나 통화 내용을 남겨보세요.</p>
                  </div>
                ) : (
                  <div className="relative pl-6 border-l-2 border-slate-200 space-y-6 my-2">
                    {[...(contact.callHistory || [])]
                      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                      .map((record) => {
                      const isInc = record.type === 'incoming';
                      const isOut = record.type === 'outgoing';
                      const isMiss = record.type === 'missed';

                      return (
                        <div key={record.id} className="relative group/rec">
                          {/* 타임라인 핀 마커 */}
                          <div className={`absolute -left-[31px] top-1 w-6 h-6 rounded-full flex items-center justify-center border-2 border-slate-200 shadow-md ${isInc ? 'bg-emerald-500 text-slate-950' : isOut ? 'bg-blue-500 text-white' : 'bg-rose-500 text-white'}`}>
                            {isInc && <ArrowDownLeft className="w-3.5 h-3.5 font-bold" />}
                            {isOut && <ArrowUpRight className="w-3.5 h-3.5 font-bold" />}
                            {isMiss && <PhoneMissed className="w-3.5 h-3.5 font-bold" />}
                          </div>

                          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 hover:border-slate-200 transition-all">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className={`text-xs font-bold font-mono ${isInc ? 'text-emerald-400' : isOut ? 'text-blue-400' : 'text-rose-400'}`}>
                                {isInc ? '전화 걸려옴 (수신)' : isOut ? '전화 걸음 (발신)' : '부재중 전화'}
                              </span>
                              <span className="text-[11px] text-slate-400 font-mono flex items-center gap-1">
                                <Clock className="w-3 h-3" /> {formatDate(record.timestamp)}
                              </span>
                            </div>

                            {record.duration && (
                              <p className="text-xs text-slate-500 font-mono mb-2 bg-slate-100 px-2 py-0.5 rounded inline-block">
                                통화 시간: {record.duration}
                              </p>
                            )}

                            {record.note ? (
                              <p className="text-sm text-slate-700 font-medium bg-slate-100 p-2.5 rounded-xl border border-slate-200/50">
                                {record.note}
                              </p>
                            ) : (
                              <p className="text-xs text-slate-400 italic">남겨진 메모가 없습니다.</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 탭 3: 명함 수정 폼 */}
          {activeTab === 'edit' && (
            <form onSubmit={handleSaveEdit} className="flex-1 overflow-y-auto py-3 space-y-4 pr-2 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500 block mb-1 font-medium">성명 *</label>
                  <input type="text" required value={editForm.name} onChange={e=>setEditForm({...editForm, name:e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700 focus:outline-none focus:border-blue-500" />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-500 block mb-1 font-medium">그룹 선택 <span className="text-[10px] text-slate-400 font-normal">(여러 개 선택 가능)</span></label>
                <GroupMultiSelect
                  groups={groups}
                  value={editForm.groupIds || (editForm.groupId ? [editForm.groupId] : [])}
                  onChange={(ids) => setEditForm({ ...editForm, groupIds: ids, groupId: ids[0] || '' })}
                />
              </div>

              {/* [추가] "가져오기"로 등록된 명함 중, 이 기능이 생기기 전에 가져온 것들은 이름을 고쳐도
              사진이 자동으로 안 바뀐다(사진 속 텍스트가 예전 이름 그대로 남아있음). 그런 경우를 위해
              언제든 수동으로 지금 입력된 정보로 사진을 다시 그릴 수 있는 버튼을 둔다. 실제로 촬영/스캔한
              사진에는 의미가 없는 기능이라, 안내 문구로 구분해서 보여준다. */}
              <button
                type="button"
                onClick={() => {
                  setEditForm({ ...editForm, frontImage: generateStandardCardImage(editForm) || editForm.frontImage, isAutoGeneratedImage: true });
                  setImageRegeneratedAt(Date.now());
                }}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-xs font-semibold transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                지금 입력한 정보로 명함 이미지 다시 만들기
              </button>
              {imageRegeneratedAt ? (
                <p className="text-[11px] text-emerald-600 font-medium -mt-2.5 px-1 flex items-center gap-1">
                  ✅ 이미지를 새로 만들었어요. 왼쪽 미리보기에서 바로 확인해보세요.
                </p>
              ) : (
                <p className="text-[10px] text-slate-400 -mt-2.5 px-1">
                  "가져오기"로 등록해서 사진 없이 자동으로 만들어진 명함 이미지에만 사용하세요. 실제로 촬영/스캔한 사진이 있다면 누르지 마세요 (사진이 대체됩니다).
                </p>
              )}

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-slate-500 block mb-1 font-medium">회사명</label>
                  <input type="text" value={editForm.company} onChange={e=>setEditForm({...editForm, company:e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700 focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1 font-medium">부서명</label>
                  <input type="text" value={editForm.department} onChange={e=>setEditForm({...editForm, department:e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700 focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1 font-medium">직책</label>
                  <input type="text" value={editForm.title} onChange={e=>setEditForm({...editForm, title:e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700 focus:outline-none focus:border-blue-500" />
                </div>
              </div>

              {/* 분리된 연락처 */}
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-3">
                <span className="text-xs font-bold text-slate-500 uppercase font-mono">연락처 분리 입력</span>
                <div className="grid grid-cols-1 gap-2.5">
                  <div>
                    <label className="text-xs text-emerald-400 block mb-1">핸드폰 번호 (Mobile)</label>
                    <input type="text" inputMode="numeric" value={editForm.phoneMobile} onChange={e=>setEditForm({...editForm, phoneMobile:formatPhoneNumber(e.target.value)})} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-700 font-mono focus:outline-none focus:border-emerald-500" />
                  </div>
                  <div>
                    <label className="text-xs text-blue-400 block mb-1">사무실 유선전화 1 (Office 1)</label>
                    <input type="text" inputMode="numeric" value={editForm.phoneOffice} onChange={e=>setEditForm({...editForm, phoneOffice:formatPhoneNumber(e.target.value)})} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-700 font-mono focus:outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="text-xs text-cyan-400 block mb-1 flex items-center gap-1.5">
                      <span>사무실 유선전화 2 / 직통번호 (Office 2)</span>
                      <span className="text-[9px] bg-cyan-500/10 text-cyan-400 px-1 py-0.2 rounded font-mono font-bold">스캔 분리</span>
                    </label>
                    <input type="text" inputMode="numeric" value={editForm.phoneOffice2 || ''} onChange={e=>setEditForm({...editForm, phoneOffice2:formatPhoneNumber(e.target.value)})} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-700 font-mono focus:outline-none focus:border-cyan-500" />
                  </div>
                  <div>
                    <label className="text-xs text-amber-400 block mb-1">팩스 번호 (Fax)</label>
                    <input type="text" inputMode="numeric" value={editForm.phoneFax} onChange={e=>setEditForm({...editForm, phoneFax:formatPhoneNumber(e.target.value)})} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-700 font-mono focus:outline-none focus:border-amber-500" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500 block mb-1 font-medium">이메일</label>
                  <input type="email" value={editForm.email} onChange={e=>setEditForm({...editForm, email:e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700 focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1 font-medium">회사 주소 1 (본사)</label>
                  <input type="text" value={editForm.address} onChange={e=>setEditForm({...editForm, address:e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700 focus:outline-none focus:border-blue-500" />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-500 block mb-1 font-medium text-slate-600 flex items-center gap-1">
                  <span>회사 주소 2 (지사/공장 등)</span>
                  <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.2 rounded font-mono">분리 인식</span>
                </label>
                <input type="text" value={editForm.address2 || ''} onChange={e=>setEditForm({...editForm, address2:e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700 focus:outline-none focus:border-blue-500" />
              </div>

              <div>
                <label className="text-xs text-slate-500 block mb-1 font-medium">홈페이지</label>
                <input type="text" placeholder="예: www.company.com" value={editForm.website || ''} onChange={e=>setEditForm({...editForm, website:e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700 focus:outline-none focus:border-blue-500" />
              </div>

              <div>
                <label className="text-xs text-slate-500 block mb-1 font-medium text-slate-600 flex items-center gap-1">
                  <span>집 주소</span>
                  <span className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.2 rounded font-mono">개인정보 · 명함 이미지엔 안 나옴</span>
                </label>
                <input type="text" placeholder="필요한 경우에만 입력 (회사 주소와 별도 관리)" value={editForm.homeAddress || ''} onChange={e=>setEditForm({...editForm, homeAddress:e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700 focus:outline-none focus:border-blue-500" />
              </div>

              <div>
                <label className="text-xs text-slate-500 block mb-1 font-medium">회사 비즈니스 요약 정보</label>
                <input type="text" value={editForm.companyInfo || ''} onChange={e=>setEditForm({...editForm, companyInfo:e.target.value})} placeholder="예: 인공지능 기반 B2B DX 및 스마트 비즈니스 솔루션 기업" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700 focus:outline-none focus:border-blue-500" />
              </div>

              <div>
                <label className="text-xs text-slate-500 block mb-1 font-medium">메모 / 요약</label>
                <textarea rows={3} value={editForm.memo} onChange={e=>setEditForm({...editForm, memo:e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 focus:outline-none focus:border-blue-500" />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={()=>setActiveTab('info')} className="w-1/3 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold">취소</button>
                <button type="submit" className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold shadow-lg shadow-blue-600/30">수정 완료 저장</button>
              </div>
            </form>
          )}

        </div>

      </div>

      {rescanCameraTarget && (
        <LiveCameraCapture
          title={rescanCameraTarget === 'front' ? '명함 앞면 재촬영' : '명함 뒷면 재촬영'}
          guideAspectRatio={1.586}
          onCapture={(dataUrl) => {
            // 실시간 촬영본도 파일 업로드와 동일하게 확인/조정 단계를 거치도록 한다
            const side = rescanCameraTarget;
            setRescanCameraTarget(null);
            if (side) setRescanCropTarget({ side, rawImage: dataUrl });
          }}
          onCancel={() => setRescanCameraTarget(null)}
          onFallbackToFile={() => rescanFileInputRef.current?.click()}
        />
      )}

      {rescanCropTarget && (
        <CropAdjustModal
          imageDataUrl={rescanCropTarget.rawImage}
          title={rescanCropTarget.side === 'front' ? '명함 앞면 테두리 확인' : '명함 뒷면 테두리 확인'}
          expectedAspectRatio={1.586}
          onConfirm={(cropped) => {
            applyRescannedImage(rescanCropTarget.side, cropped);
            setRescanCropTarget(null);
          }}
          onCancel={() => setRescanCropTarget(null)}
        />
      )}

      {/* [추가] 재스캔 사진을 AI로 읽는 동안 잠깐 보여주는 작은 로딩 표시 */}
      {isRecognizingRescan && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] flex items-center gap-2 bg-slate-900 text-white text-xs font-bold px-4 py-2.5 rounded-full shadow-xl">
          <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          새 명함 사진에서 변경된 정보 확인 중...
        </div>
      )}

      {rescanRecognizeError && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] flex items-center gap-2 bg-amber-600 text-white text-xs font-bold px-4 py-2.5 rounded-full shadow-xl">
          {rescanRecognizeError}
          <button onClick={() => setRescanRecognizeError(null)} className="ml-1"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* [추가] 재스캔 후 바뀐 항목 비교/선택 반영 모달. AI 인식이 가끔 틀릴 수 있어서
      자동으로 덮어쓰지 않고, 바뀐 항목만 골라서 사람이 확인 후 반영하게 한다. */}
      {rescanDiffs && rescanDiffs.length > 0 && (
        <div className="fixed inset-0 z-[80] overflow-y-auto">
          <div onClick={() => setRescanDiffs(null)} className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" />
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="relative w-full max-w-md bg-white border border-slate-200 rounded-3xl p-6 shadow-2xl space-y-4 z-10 max-h-[85vh] overflow-y-auto">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-indigo-500" />
                <div>
                  <h3 className="text-base font-bold text-slate-800">새로 인식된 정보</h3>
                  <p className="text-xs text-slate-400">새 명함 사진에서 이전과 다른 항목이 발견됐어요. 반영할 항목만 체크해주세요.</p>
                </div>
              </div>

              <div className="space-y-2">
                {rescanDiffs.map((d) => (
                  <label
                    key={d.field}
                    className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 hover:border-indigo-300 cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={d.selected}
                      onChange={() => toggleRescanDiff(d.field)}
                      className="w-4 h-4 mt-0.5 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-600 mb-1">{d.label}</p>
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="text-slate-400 line-through truncate">{d.oldValue || '(비어있음)'}</span>
                        <span className="text-slate-300 shrink-0">→</span>
                        <span className="text-indigo-600 font-semibold truncate">{d.newValue}</span>
                      </div>
                    </div>
                  </label>
                ))}
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setRescanDiffs(null)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-bold transition-colors"
                >
                  반영 안 함
                </button>
                <button
                  onClick={applySelectedRescanDiffs}
                  className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold shadow-md transition-all"
                >
                  선택한 항목 반영
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <input
        ref={rescanFileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleRescanFileChange}
      />
    </div>
  );
};
