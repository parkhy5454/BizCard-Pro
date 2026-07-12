import React, { useState, useEffect } from 'react';
import { QrCode, Send, MessageSquare, Mail, Share2, Copy, Check, Edit3, Smartphone, ExternalLink, Globe, Camera, Sparkles, X } from 'lucide-react';
import { MyProfile } from '../types.js';

interface Props {
  onClose: () => void;
}

export const ShareMyCardModal: React.FC<Props> = ({ onClose }) => {
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'qr' | 'send' | 'edit'>('qr');
  const [scanImg, setScanImg] = useState<string>('');
  const [isScanning, setIsScanning] = useState<boolean>(false);

  useEffect(() => {
    fetch('/api/my-profile')
      .then((res) => res.json())
      .then((data) => setProfile(data))
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

  if (!profile) return null;

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

  // 링크 복사
  const handleCopyText = () => {
    navigator.clipboard.writeText(shareMessage);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // 프로필 저장
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch('/api/my-profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile)
    });
    setIsEditing(false);
    setActiveTab('qr');
  };

  // 내 명함 사진 업로드 (촬영 또는 갤러리 선택)
  const handleScanImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setScanImg(ev.target?.result as string);
    reader.readAsDataURL(file);
    e.target.value = ''; // 같은 파일 재선택도 가능하도록 초기화
  };

  // 업로드한 내 명함 사진을 AI로 인식해서 입력 폼에 자동 반영
  const handleRunProfileScan = async () => {
    if (!scanImg) return;
    setIsScanning(true);
    try {
      const res = await fetch('/api/scan-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frontImage: scanImg, backImage: '' })
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
              <p className="text-xs text-slate-300">QR 스캔, 문자, 이메일, SNS로 내 명함을 즉시 전달하세요</p>
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
            <span>문자 / 이메일 / SNS 전송</span>
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
                <p className="text-xs text-slate-400">스캔 시 스마트폰 주소록에 내 이름, 회사, 전화번호, 이메일이 자동 입력됩니다.</p>
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

              {/* 내 명함 사진으로 자동 채우기 */}
              <div className="bg-slate-950 border border-dashed border-blue-500/40 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2 text-blue-400 font-semibold">
                  <Sparkles className="w-4 h-4" />
                  <span>내 명함 사진으로 자동 채우기</span>
                </div>
                {scanImg ? (
                  <div className="relative">
                    <img src={scanImg} alt="스캔용 명함 미리보기" className="w-full h-32 object-cover rounded-lg" />
                    <button
                      type="button"
                      onClick={() => setScanImg('')}
                      className="absolute top-1.5 right-1.5 bg-slate-900/80 hover:bg-slate-900 rounded-full p-1"
                    >
                      <X className="w-4 h-4 text-white" />
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center gap-1 border border-slate-700 rounded-lg h-24 cursor-pointer hover:border-blue-500 text-slate-500 transition-colors">
                    <Camera className="w-5 h-5" />
                    <span>사진 촬영 또는 업로드</span>
                    <input type="file" accept="image/*" className="hidden" onChange={handleScanImageUpload} />
                  </label>
                )}
                <button
                  type="button"
                  disabled={!scanImg || isScanning}
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
                  <input type="text" value={profile.phoneMobile} onChange={(e) => setProfile({...profile, phoneMobile: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-medium focus:border-blue-500 outline-none" required />
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
    </div>
  );
};
