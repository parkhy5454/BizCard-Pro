import React, { useState, useEffect } from 'react';
import { QrCode, Send, MessageSquare, Mail, Share2, Copy, Check, Edit3, Smartphone, ExternalLink, Globe, Camera, Sparkles, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatPhoneNumber } from '../phoneFormat.js';
import { MyProfile } from '../types.js';
import { CropAdjustModal, resizeDataUrl } from './CropAdjustModal.js';
import { LiveCameraCapture } from './LiveCameraCapture.js';
import { loadOpenCv } from '../cardVision.js';

interface Props {
  onClose: () => void;
}

export const ShareMyCardModal: React.FC<Props> = ({ onClose }) => {
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'qr' | 'send' | 'edit'>('qr');
  const [scanImg, setScanImg] = useState<string>('');
  const [scanImgBack, setScanImgBack] = useState<string>('');
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [cameraTarget, setCameraTarget] = useState<'front' | 'back' | null>(null);
  // [수정] 명함 등록 화면처럼 앞/뒤를 좌우로 넘겨보는 캐러셀을 위한 상태
  const [activeSide, setActiveSide] = useState<'front' | 'back'>('front');
  const swipeStartXRef = React.useRef<number | null>(null);
  const [cropTarget, setCropTarget] = useState<{ side: 'front' | 'back'; rawImage: string } | null>(null);
  const galleryFileInputRef = React.useRef<HTMLInputElement>(null);
  const galleryFileInputBackRef = React.useRef<HTMLInputElement>(null);

  // [수정] "촬영" 버튼을 누르는 순간이 아니라 이 화면이 열리자마자 미리 OpenCV 엔진 로딩을 시작해둔다.
  // (ScanModal과 동일한 개선사항 — 실패해도 무시, LiveCameraCapture가 필요 시 다시 시도한다)
  useEffect(() => {
    loadOpenCv().catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/my-profile')
      .then((res) => res.json())
      .then((data) => {
        setProfile(data);
        // [수정] 서버에 저장된 앞/뒤 명함 사진이 있으면 불러와서 화면에 반영
        // (기존에는 이 부분이 없어서, 다른 기기/새로고침 시 방금 찍은 사진이 안 보였음)
        setScanImg(data.frontImage || '');
        setScanImgBack(data.backImage || '');
      })
      .catch(() => {
        setProfile({
          name: '박영록',
          company: 'BizCard Pro AI',
          department: '글로벌 사업총괄본부',
          title: '대표이사 / CEO',
          phoneMobile: '010-5454-0000',
          phoneOffice: '02-545-0000',
          phoneFax: '02-545-0001',
          email: 'parkyl5454@gmail.com',
          address: '서울특별시 강남구 테헤란로 152 강남파이낸스센터 18층',
          website: 'https://bizcard-pro.ai',
          memo: '스마트 명함 관리 & AI OCR 솔루션 전문가'
        });
      });
  }, []);

  if (!profile) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-slate-700 border-t-blue-400 rounded-full animate-spin" />
          <span className="text-xs text-slate-400">내 명함 정보를 불러오는 중...</span>
        </div>
      </div>
    );
  }

  // vCard 생성 문자열
  const generateVCardText = () => {
    return [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${profile.name}`,
      `N:${profile.name};;;;`,
      `ORG:${profile.company};${profile.department}`,
      `TITLE:${profile.title}`,
      `TEL;TYPE=CELL:${profile.phoneMobile}`,
      profile.phoneOffice ? `TEL;TYPE=WORK:${profile.phoneOffice}` : '',
      profile.phoneFax ? `TEL;TYPE=FAX:${profile.phoneFax}` : '',
      `EMAIL;TYPE=PREF,INTERNET:${profile.email}`,
      `ADR;TYPE=WORK:;;${profile.address};;;;`,
      profile.website ? `URL:${profile.website}` : '',
      profile.memo ? `NOTE:${profile.memo}` : '',
      'END:VCARD'
    ].filter(Boolean).join('\r\n');
  };

  const vCardDataUrl = `data:text/vcard;charset=utf-8,${encodeURIComponent(generateVCardText())}`;
  
  // QR에 들어갈 데이터 (실제 모바일 카메라 스캔 시 바로 연락처 추가되도록 MECARD 혹은 vCard 규격 URL)
  // 가장 확실하게 모바일 카메라에서 명함으로 인식하는 MECARD 규격
  const mecardString = `MECARD:N:${profile.name};ORG:${profile.company};TIL:${profile.title};TEL:${profile.phoneMobile};EMAIL:${profile.email};ADR:${profile.address};URL:${profile.website || ''};;`;
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=15&data=${encodeURIComponent(mecardString)}`;

  // 공유 메시지 텍스트
  const shareMessage = `[디지털 명함 전달]\n${profile.company} ${profile.department} ${profile.name} ${profile.title}\n📞 핸드폰: ${profile.phoneMobile}\n📧 이메일: ${profile.email}\n🏢 주소: ${profile.address}\n🌐 웹사이트: ${profile.website || ''}`;

  // 카카오톡 공유: 카카오 JS SDK를 최초 1회만 지연 로딩 후 초기화
  const KAKAO_JS_KEY = 'cb1b045b76bfb5a7d4deaf6985b50a2a';
  const loadKakaoSdk = (): Promise<void> => {
    const w = window as any;
    if (w.Kakao && w.Kakao.isInitialized && w.Kakao.isInitialized()) return Promise.resolve();
    if (w.__kakaoSdkLoadingPromise) return w.__kakaoSdkLoadingPromise;
    w.__kakaoSdkLoadingPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js';
      script.crossOrigin = 'anonymous';
      script.onload = () => {
        try {
          if (!w.Kakao.isInitialized()) w.Kakao.init(KAKAO_JS_KEY);
          resolve();
        } catch (err) {
          reject(err);
        }
      };
      script.onerror = () => reject(new Error('카카오 SDK 로드 실패'));
      document.body.appendChild(script);
    });
    return w.__kakaoSdkLoadingPromise;
  };

  const handleKakaoShare = async () => {
    try {
      await loadKakaoSdk();
      const w = window as any;
      w.Kakao.Share.sendDefault({
        objectType: 'feed',
        content: {
          title: `${profile.name} · ${profile.company}`,
          description: `${profile.title} | ${profile.department}\n📞 ${profile.phoneMobile}\n📧 ${profile.email}`,
          imageUrl: profile.website ? `${profile.website}/kakao-share-thumb.png` : 'https://bizcard-pro.onrender.com/kakao-share-thumb.png',
          link: {
            mobileWebUrl: profile.website || 'https://bizcard-pro.onrender.com',
            webUrl: profile.website || 'https://bizcard-pro.onrender.com'
          }
        },
        buttons: [
          {
            title: '명함 정보 보기',
            link: {
              mobileWebUrl: profile.website || 'https://bizcard-pro.onrender.com',
              webUrl: profile.website || 'https://bizcard-pro.onrender.com'
            }
          }
        ]
      });
    } catch (err) {
      console.error('카카오톡 공유 실패:', err);
      alert('카카오톡 공유를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
    }
  };

  // 링크 복사
  const handleCopyText = () => {
    navigator.clipboard.writeText(shareMessage);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // 프로필 저장
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    // [수정] 텍스트 정보뿐 아니라 앞/뒤 명함 사진(scanImg/scanImgBack)도 함께 저장한다.
    // (기존에는 profile 객체에만 담겨 전송되어, 촬영한 사진 자체는 서버에 저장되지 않았음)
    const payload = { ...profile, frontImage: scanImg || '', backImage: scanImgBack || '' };
    try {
      const res = await fetch('/api/my-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`저장 실패 (HTTP ${res.status}) ${errText.slice(0, 200)}`);
      }
      const saved = await res.json().catch(() => payload);
      setProfile(saved);
      setScanImg(saved.frontImage || '');
      setScanImgBack(saved.backImage || '');
      setIsEditing(false);
      setActiveTab('qr');
    } catch (err: any) {
      console.error('내 명함 프로필 저장 실패:', err);
      alert(`저장 중 문제가 발생했습니다: ${err.message || err}\n다시 시도해주세요.`);
    }
  };

  // 내 명함 사진 업로드 (촬영 또는 갤러리 선택)
  const handleScanImageUpload = (e: React.ChangeEvent<HTMLInputElement>, side: 'front' | 'back') => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCropTarget({ side, rawImage: ev.target?.result as string });
    };
    reader.readAsDataURL(file);
    e.target.value = ''; // 같은 파일 재선택도 가능하도록 초기화
  };

  // 캐러셀 좌우 스와이프로 앞면/뒷면 전환
  const handleCarouselPointerDown = (e: React.PointerEvent) => {
    swipeStartXRef.current = e.clientX;
  };
  const handleCarouselPointerUp = (e: React.PointerEvent) => {
    if (swipeStartXRef.current === null) return;
    const dx = e.clientX - swipeStartXRef.current;
    swipeStartXRef.current = null;
    const threshold = 40;
    if (dx > threshold) setActiveSide('front');
    else if (dx < -threshold) setActiveSide('back');
  };

  // 업로드한 내 명함 사진(앞/뒤)을 AI로 인식해서 입력 폼에 자동 반영
  const handleRunProfileScan = async () => {
    if (!scanImg && !scanImgBack) return;
    setIsScanning(true);
    try {
      const res = await fetch('/api/scan-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frontImage: scanImg, backImage: scanImgBack })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '명함 인식에 실패했습니다.');

      setProfile((prev) => prev ? {
        ...prev,
        name: data.name || prev.name,
        company: data.company || prev.company,
        department: data.department || prev.department,
        title: data.title || prev.title,
        phoneMobile: data.phoneMobile || prev.phoneMobile,
        phoneOffice: data.phoneOffice || prev.phoneOffice,
        phoneFax: data.phoneFax || prev.phoneFax,
        email: data.email || prev.email,
        address: data.address || prev.address,
        memo: data.memo || prev.memo
      } : prev);
    } catch (err: any) {
      alert(err.message || '명함 인식 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl flex flex-col">
        
        {/* 상단 타이틀 바 */}
        <div className="p-6 bg-gradient-to-r from-blue-900/40 to-indigo-900/40 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-500/20 text-blue-400 rounded-2xl border border-blue-500/30">
              <Share2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white tracking-tight">내 명함 공유 및 전송</h3>
              <p className="text-xs text-slate-300">QR 스캔, 카카오톡, 문자, 이메일, SNS로 내 명함을 즉시 전달하세요</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
          >
            ✕
          </button>
        </div>

        {/* 미니 프로필 요약 카드 */}
        <div className="p-5 bg-slate-950/60 border-b border-slate-800 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-white text-base">{profile.name}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">{profile.title}</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">{profile.company} · {profile.department}</p>
          </div>
          <button
            onClick={() => setActiveTab(activeTab === 'edit' ? 'qr' : 'edit')}
            className="text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>{activeTab === 'edit' ? '공유 화면으로' : '내 정보 수정'}</span>
          </button>
        </div>

        {/* 탭 쉘 */}
        <div className="flex border-b border-slate-800 bg-slate-900/50">
          <button
            onClick={() => setActiveTab('qr')}
            className={`flex-1 py-3 text-xs font-bold border-b-2 transition-all flex items-center justify-center gap-1.5 ${activeTab === 'qr' ? 'border-blue-500 text-blue-400 bg-blue-500/5' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
          >
            <QrCode className="w-4 h-4" />
            <span>QR 코드 스캔</span>
          </button>
          <button
            onClick={() => setActiveTab('send')}
            className={`flex-1 py-3 text-xs font-bold border-b-2 transition-all flex items-center justify-center gap-1.5 ${activeTab === 'send' ? 'border-blue-500 text-blue-400 bg-blue-500/5' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
          >
            <Send className="w-4 h-4" />
            <span>카카오톡 / 문자 / 이메일 / SNS</span>
          </button>
        </div>

        {/* 본문 콘텐츠 영역 */}
        <div className="p-6 flex-1 overflow-y-auto max-h-[60vh]">
          
          {/* 탭 1: QR 코드 스캔 */}
          {activeTab === 'qr' && (
            <div className="flex flex-col items-center justify-center space-y-6 py-2">
              <div className="p-4 bg-white rounded-3xl shadow-2xl border-4 border-blue-500/30">
                <img src={qrImageUrl} alt="My QR Code" className="w-56 h-56 object-contain" />
              </div>

              <div className="text-center space-y-1">
                <p className="text-sm font-bold text-white">상대방 스마트폰 기본 카메라로 스캔하세요</p>
              </div>

              <div className="w-full pt-2 flex gap-3">
                <a
                  href={vCardDataUrl}
                  download={`${profile.name}_명함.vcf`}
                  className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-all shadow"
                >
                  <Smartphone className="w-4 h-4 text-blue-400" />
                  <span>vCard(.vcf) 파일 받기</span>
                </a>
                <button
                  onClick={handleCopyText}
                  className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-all shadow"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
                  <span>{copied ? '복사 완료!' : '명함 텍스트 복사'}</span>
                </button>
              </div>
            </div>
          )}

          {/* 탭 2: 전송 채널 선택 */}
          {activeTab === 'send' && (
            <div className="space-y-6">
              
              {/* 1. 기본 앱 전송 */}
              <div className="space-y-3">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono">🚀 다이렉트 전송</span>

                {/* 카카오톡 공유 (가장 많이 쓰는 채널이라 상단에 강조 배치) */}
                <button
                  type="button"
                  onClick={handleKakaoShare}
                  className="w-full p-4 rounded-2xl bg-[#FEE500] hover:brightness-95 flex items-center gap-3 transition-all group"
                >
                  <div className="p-2.5 rounded-xl bg-black/10 text-black group-hover:scale-110 transition-transform">
                    <MessageSquare className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <div className="text-xs font-bold text-black">카카오톡 공유</div>
                    <div className="text-[11px] text-black/60">카카오톡으로 명함 카드 전달</div>
                  </div>
                </button>

                <div className="grid grid-cols-2 gap-3">
                  <a
                    href={`sms:?body=${encodeURIComponent(shareMessage)}`}
                    className="p-4 rounded-2xl bg-slate-950 border border-slate-800 hover:border-emerald-500/50 hover:bg-slate-800/60 flex items-center gap-3 transition-all group"
                  >
                    <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 group-hover:scale-110 transition-transform">
                      <MessageSquare className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white">문자(SMS) 전송</div>
                      <div className="text-[11px] text-slate-400">문자 앱 자동 연결</div>
                    </div>
                  </a>

                  <a
                    href={`mailto:?subject=${encodeURIComponent(`[비즈니스 명함] ${profile.company} ${profile.name}`)}&body=${encodeURIComponent(shareMessage)}`}
                    className="p-4 rounded-2xl bg-slate-950 border border-slate-800 hover:border-blue-500/50 hover:bg-slate-800/60 flex items-center gap-3 transition-all group"
                  >
                    <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400 group-hover:scale-110 transition-transform">
                      <Mail className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white">이메일 전송</div>
                      <div className="text-[11px] text-slate-400">메일 클라이언트 열기</div>
                    </div>
                  </a>
                </div>
              </div>

              {/* 2. SNS 및 공유 링크 */}
              <div className="space-y-3">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono">🌐 소셜 미디어(SNS) 공유</span>
                <div className="grid grid-cols-2 gap-3">
                  <a
                    href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareMessage)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 hover:border-slate-700 flex items-center gap-3 transition-all"
                  >
                    <Globe className="w-4 h-4 text-sky-400" />
                    <span className="text-xs font-medium text-slate-200">트위터 / X 공유</span>
                  </a>

                  <a
                    href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(profile.website || 'https://bizcard-pro.ai')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 hover:border-slate-700 flex items-center gap-3 transition-all"
                  >
                    <ExternalLink className="w-4 h-4 text-blue-500" />
                    <span className="text-xs font-medium text-slate-200">링크드인 공유</span>
                  </a>
                </div>
              </div>

              {/* 미리보기 박스 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300">전송될 명함 텍스트 미리보기</span>
                  <button onClick={handleCopyText} className="text-[11px] text-blue-400 hover:underline flex items-center gap-1">
                    <Copy className="w-3 h-3" /> 복사하기
                  </button>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-slate-300 whitespace-pre-wrap leading-relaxed select-all">
                  {shareMessage}
                </div>
              </div>

            </div>
          )}

          {/* 탭 3: 내 정보 수정 */}
          {activeTab === 'edit' && (
            <form onSubmit={handleSaveProfile} className="space-y-4 text-xs">

              {/* 내 명함 사진으로 자동 채우기 (앞면/뒷면) */}
              <div className="bg-slate-950 border border-dashed border-blue-500/40 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2 text-blue-400 font-semibold">
                  <Sparkles className="w-4 h-4" />
                  <span>내 명함 사진으로 자동 채우기</span>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-400 font-semibold">
                      {activeSide === 'front' ? '① 앞면' : '② 뒷면 (선택)'}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setActiveSide('front')}
                        aria-label="앞면 보기"
                        className={`w-1.5 h-1.5 rounded-full transition-colors ${activeSide === 'front' ? 'bg-blue-400' : 'bg-slate-700'}`}
                      />
                      <button
                        type="button"
                        onClick={() => setActiveSide('back')}
                        aria-label="뒷면 보기"
                        className={`w-1.5 h-1.5 rounded-full transition-colors ${activeSide === 'back' ? 'bg-blue-400' : 'bg-slate-700'}`}
                      />
                    </div>
                  </div>

                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setActiveSide('front')}
                      className="absolute left-1 top-1/2 -translate-y-1/2 z-10 p-1.5 rounded-full bg-slate-950/70 hover:bg-slate-900 text-slate-300 hover:text-white transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveSide('back')}
                      className="absolute right-1 top-1/2 -translate-y-1/2 z-10 p-1.5 rounded-full bg-slate-950/70 hover:bg-slate-900 text-slate-300 hover:text-white transition-colors"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>

                    <div
                      className="overflow-hidden rounded-xl touch-pan-y"
                      onPointerDown={handleCarouselPointerDown}
                      onPointerUp={handleCarouselPointerUp}
                    >
                      <div
                        className="flex transition-transform duration-300 ease-out"
                        style={{ width: '200%', transform: activeSide === 'front' ? 'translateX(0%)' : 'translateX(-50%)' }}
                      >
                        {/* 앞면 슬라이드 */}
                        <div style={{ width: '50%' }} className="px-0.5">
                          <div className="relative aspect-[1.586/1] w-full rounded-xl overflow-hidden bg-slate-900 border border-slate-800">
                            {scanImg ? (
                              <>
                                <img src={scanImg} alt="앞면 미리보기" className="w-full h-full object-cover" />
                                <button
                                  type="button"
                                  onClick={() => setScanImg('')}
                                  className="absolute top-1.5 right-1.5 bg-slate-900/80 hover:bg-slate-900 rounded-full p-1"
                                >
                                  <X className="w-3.5 h-3.5 text-white" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setCameraTarget('front')}
                                  className="absolute bottom-0 inset-x-0 py-1.5 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center gap-1.5 text-[11px] font-bold text-white hover:bg-slate-900/85 transition-colors"
                                >
                                  <Camera className="w-3.5 h-3.5" />
                                  앞면 재촬영
                                </button>
                              </>
                            ) : (
                              <div className="flex flex-col items-center justify-center gap-1.5 w-full h-full text-slate-500 p-2">
                                <button
                                  type="button"
                                  onClick={() => setCameraTarget('front')}
                                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold transition-colors"
                                >
                                  <Camera className="w-3 h-3" />
                                  촬영
                                </button>
                                <label className="text-[10px] text-slate-500 hover:text-slate-300 cursor-pointer underline underline-offset-2">
                                  갤러리
                                  <input ref={galleryFileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleScanImageUpload(e, 'front')} />
                                </label>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* 뒷면 슬라이드 */}
                        <div style={{ width: '50%' }} className="px-0.5">
                          <div className="relative aspect-[1.586/1] w-full rounded-xl overflow-hidden bg-slate-900 border border-slate-800">
                            {scanImgBack ? (
                              <>
                                <img src={scanImgBack} alt="뒷면 미리보기" className="w-full h-full object-cover" />
                                <button
                                  type="button"
                                  onClick={() => setScanImgBack('')}
                                  className="absolute top-1.5 right-1.5 bg-slate-900/80 hover:bg-slate-900 rounded-full p-1"
                                >
                                  <X className="w-3.5 h-3.5 text-white" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setCameraTarget('back')}
                                  className="absolute bottom-0 inset-x-0 py-1.5 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center gap-1.5 text-[11px] font-bold text-white hover:bg-slate-900/85 transition-colors"
                                >
                                  <Camera className="w-3.5 h-3.5" />
                                  뒷면 재촬영
                                </button>
                              </>
                            ) : (
                              <div className="flex flex-col items-center justify-center gap-1.5 w-full h-full text-slate-500 p-2">
                                <button
                                  type="button"
                                  onClick={() => setCameraTarget('back')}
                                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold transition-colors"
                                >
                                  <Camera className="w-3 h-3" />
                                  촬영
                                </button>
                                <label className="text-[10px] text-slate-500 hover:text-slate-300 cursor-pointer underline underline-offset-2">
                                  갤러리
                                  <input ref={galleryFileInputBackRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleScanImageUpload(e, 'back')} />
                                </label>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <p className="text-center text-[10px] text-slate-600">좌우로 밀어서 앞면 · 뒷면을 확인하고, 보이는 면에서 바로 재촬영할 수 있어요</p>
                </div>


                <button
                  type="button"
                  disabled={(!scanImg && !scanImgBack) || isScanning}
                  onClick={handleRunProfileScan}
                  className="w-full py-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold flex items-center justify-center gap-2 transition-all"
                >
                  {isScanning ? (
                    <span>인식 중...</span>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>AI로 정보 채우기</span>
                    </>
                  )}
                </button>
                <p className="text-slate-500">사진을 올리고 인식하면, 아래 항목들이 자동으로 채워져요. 채워진 내용은 저장 전에 직접 수정할 수 있어요.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">성명</label>
                  <input type="text" value={profile.name} onChange={(e) => setProfile({...profile, name: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-medium focus:border-blue-500 outline-none" required />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">직책</label>
                  <input type="text" value={profile.title} onChange={(e) => setProfile({...profile, title: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-medium focus:border-blue-500 outline-none" required />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">회사명</label>
                  <input type="text" value={profile.company} onChange={(e) => setProfile({...profile, company: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-medium focus:border-blue-500 outline-none" required />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">부서</label>
                  <input type="text" value={profile.department} onChange={(e) => setProfile({...profile, department: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-medium focus:border-blue-500 outline-none" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">핸드폰</label>
                  <input type="text" inputMode="numeric" value={profile.phoneMobile} onChange={(e) => setProfile({...profile, phoneMobile: formatPhoneNumber(e.target.value)})} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-medium focus:border-blue-500 outline-none" required />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">이메일</label>
                  <input type="email" value={profile.email} onChange={(e) => setProfile({...profile, email: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-medium focus:border-blue-500 outline-none" required />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">회사 주소</label>
                <input type="text" value={profile.address} onChange={(e) => setProfile({...profile, address: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-medium focus:border-blue-500 outline-none" />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">웹사이트 / 홈페이지</label>
                <input type="text" value={profile.website || ''} onChange={(e) => setProfile({...profile, website: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-medium focus:border-blue-500 outline-none" placeholder="https://" />
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg shadow-blue-600/20 active:scale-95 transition-all mt-4"
              >
                내 명함 정보 변경 저장
              </button>
            </form>
          )}

        </div>

        {/* 하단 닫기 풋바 */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 text-center">
          <button onClick={onClose} className="text-xs font-semibold text-slate-400 hover:text-white px-6 py-2">
            닫기
          </button>
        </div>

      </div>

      {cropTarget && (
        <CropAdjustModal
          imageDataUrl={cropTarget.rawImage}
          title={cropTarget.side === 'front' ? '명함 앞면 테두리 확인' : '명함 뒷면 테두리 확인'}
          onConfirm={(cropped) => {
            if (cropTarget.side === 'front') setScanImg(cropped);
            else setScanImgBack(cropped);
            setCropTarget(null);
          }}
          onCancel={() => setCropTarget(null)}
        />
      )}

      {cameraTarget && (
        <LiveCameraCapture
          title={cameraTarget === 'front' ? '명함 앞면 촬영' : '명함 뒷면 촬영'}
          guideAspectRatio={1.586}
          onCapture={async (dataUrl, autoDetected) => {
            // [수정] 자동 인식이 성공한 경우에만 CropAdjustModal을 건너뛰고 바로 사용한다.
            // 실패했다면(OpenCV 로딩 실패 등) 화면 중앙 고정 박스로 대충 잘린 것이므로
            // 그대로 쓰지 않고 사용자가 직접 테두리를 맞추도록 안내한다.
            const side = cameraTarget;
            setCameraTarget(null);
            if (!side) return;
            if (autoDetected) {
              const resized = await resizeDataUrl(dataUrl);
              if (side === 'front') setScanImg(resized);
              else setScanImgBack(resized);
            } else {
              setCropTarget({ side, rawImage: dataUrl });
            }
          }}
          onCancel={() => setCameraTarget(null)}
          onFallbackToFile={() => {
            const side = cameraTarget;
            setCameraTarget(null);
            if (side === 'front') galleryFileInputRef.current?.click();
            else galleryFileInputBackRef.current?.click();
          }}
        />
      )}
    </div>
  );
};
