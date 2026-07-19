import React, { useState } from 'react';
import { X, Upload, ScanLine, CheckCircle2, Sparkles, Building2, Camera } from 'lucide-react';
import { BusinessCard, ContactGroup } from '../types.js';
import { formatPhoneNumber } from '../phoneFormat.js';
import { CropAdjustModal } from './CropAdjustModal.js';
import { LiveCameraCapture } from './LiveCameraCapture.js';

interface Props {
  groups: ContactGroup[];
  onClose: () => void;
  onSave: (newCard: BusinessCard) => void;
}

export const ScanModal: React.FC<Props> = ({ groups, onClose, onSave }) => {
  const [frontImg, setFrontImg] = useState<string>('');
  const [backImg, setBackImg] = useState<string>('');
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanDone, setScanDone] = useState<boolean>(false);

  // 입력 폼
  const [form, setForm] = useState<Partial<BusinessCard>>({
    name: '',
    company: '',
    department: '',
    title: '',
    phoneMobile: '',
    phoneOffice: '',
    phoneOffice2: '',
    phoneFax: '',
    email: '',
    address: '',
    address2: '',
    memo: '',
    groupId: groups[0]?.id || 'g-client'
  });

  // 크롭 조정 모달 상태: 어느 면(front/back)의 사진을 조정 중인지 + 원본 데이터
  const [cropTarget, setCropTarget] = useState<{ side: 'front' | 'back'; rawImage: string } | null>(null);
  const [cameraTarget, setCameraTarget] = useState<'front' | 'back' | null>(null);
  const fallbackFileInputRef = React.useRef<HTMLInputElement>(null);

  const handleImageFile = (e: React.ChangeEvent<HTMLInputElement>, side: 'front' | 'back') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const raw = reader.result as string;
      setCropTarget({ side, rawImage: raw });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleStartOCR = async () => {
    if (!frontImg && !backImg) {
      alert('스캔할 명함 앞면 또는 뒷면 이미지를 업로드해주세요.');
      return;
    }

    setIsScanning(true);
    setScanDone(false);

    try {
      const res = await fetch('/api/scan-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frontImage: frontImg, backImage: backImg })
      });
      const data = await res.json();

      if (data.error) {
        throw new Error(data.error);
      }

      setForm((prev) => ({
        ...prev,
        name: data.name || prev.name || '',
        company: data.company || prev.company || '',
        department: data.department || prev.department || '',
        title: data.title || prev.title || '',
        phoneMobile: data.phoneMobile || prev.phoneMobile || '',
        phoneOffice: data.phoneOffice || prev.phoneOffice || '',
        phoneOffice2: data.phoneOffice2 || prev.phoneOffice2 || '',
        phoneFax: data.phoneFax || prev.phoneFax || '',
        email: data.email || prev.email || '',
        address: data.address || prev.address || '',
        address2: data.address2 || prev.address2 || '',
        memo: data.memo || prev.memo || ''
      }));

      setScanDone(true);
    } catch (err: any) {
      alert(err.message || '스캔 중 오류 발생');
    } finally {
      setIsScanning(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) {
      alert('성명을 입력해주세요.');
      return;
    }

    const newCard: BusinessCard = {
      id: `c-${Date.now()}`,
      name: form.name || '',
      company: form.company || '',
      department: form.department || '',
      title: form.title || '',
      phoneMobile: form.phoneMobile || '',
      phoneOffice: form.phoneOffice || '',
      phoneOffice2: form.phoneOffice2 || '',
      phoneFax: form.phoneFax || '',
      email: form.email || '',
      address: form.address || '',
      address2: form.address2 || '',
      groupId: form.groupId || groups[0]?.id || 'g-client',
      frontImage: frontImg || undefined,
      backImage: backImg || undefined,
      memo: form.memo || '',
      createdAt: new Date().toISOString(),
      callHistory: []
    };

    onSave(newCard);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl flex flex-col md:flex-row overflow-y-auto md:overflow-hidden max-h-[95vh] md:max-h-[92vh]">
        
        {/* 좌측: 앞면/뒷면 명함 스캔 업로딩 존 */}
        <div className="w-full md:w-1/2 bg-slate-950 p-6 flex flex-col justify-between border-b md:border-b-0 md:border-r border-slate-800 md:overflow-y-auto">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <ScanLine className="w-5 h-5 text-blue-400 animate-pulse" />
                <h3 className="font-bold text-base text-white">명함 스캔 & 이미지 저장</h3>
              </div>
              <span className="text-xs bg-blue-500/10 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded font-mono">앞·뒤 동시지원</span>
            </div>

            <div className="space-y-4">
              {/* 앞면 스캔 업로드 */}
              <div>
                <span className="text-xs font-bold text-slate-400 block mb-1.5 font-mono">① 명함 앞면 (Front Side)</span>
                <div className="aspect-video w-full rounded-2xl border-2 border-dashed border-slate-700 hover:border-blue-500/60 bg-slate-900/60 flex flex-col items-center justify-center relative overflow-hidden transition-all group">
                  {frontImg ? (
                    <>
                      <img src={frontImg} alt="앞면 미리보기" className="w-full h-full object-cover" />
                      <button 
                        type="button" 
                        onClick={() => setFrontImg('')} 
                        className="absolute top-2 right-2 p-1 rounded-full bg-slate-900/80 text-rose-400 hover:text-white"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center w-full h-full p-4 gap-2.5">
                      <Upload className="w-7 h-7 text-slate-500" />
                      <button
                        type="button"
                        onClick={() => setCameraTarget('front')}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-colors"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        카메라로 촬영 (가이드 자동맞춤)
                      </button>
                      <label className="text-[11px] text-slate-500 hover:text-slate-300 cursor-pointer underline underline-offset-2">
                        갤러리에서 사진 선택
                        <input type="file" accept="image/*" onChange={(e) => handleImageFile(e, 'front')} className="hidden" />
                      </label>
                    </div>
                  )}
                </div>
              </div>

              {/* 뒷면 스캔 업로드 */}
              <div>
                <span className="text-xs font-bold text-slate-400 block mb-1.5 font-mono">② 명함 뒷면 (Back Side - 선택사항)</span>
                <div className="aspect-[2.5/1] w-full rounded-2xl border-2 border-dashed border-slate-800 hover:border-slate-600 bg-slate-900/30 flex flex-col items-center justify-center relative overflow-hidden transition-all group">
                  {backImg ? (
                    <>
                      <img src={backImg} alt="뒷면 미리보기" className="w-full h-full object-cover" />
                      <button 
                        type="button" 
                        onClick={() => setBackImg('')} 
                        className="absolute top-2 right-2 p-1 rounded-full bg-slate-900/80 text-rose-400 hover:text-white"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <div className="flex items-center justify-center w-full h-full p-3 gap-3">
                      <button
                        type="button"
                        onClick={() => setCameraTarget('back')}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold transition-colors"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        카메라로 촬영
                      </button>
                      <label className="text-[11px] text-slate-500 hover:text-slate-300 cursor-pointer underline underline-offset-2">
                        갤러리에서 선택
                        <input type="file" accept="image/*" onChange={(e) => handleImageFile(e, 'back')} className="hidden" />
                      </label>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* AI 스캔 가동 버튼 */}
          <div className="pt-6">
            <button
              type="button"
              disabled={isScanning || (!frontImg && !backImg)}
              onClick={handleStartOCR}
              className={`w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 shadow-xl transition-all ${
                isScanning
                  ? 'bg-slate-800 text-slate-400 cursor-wait'
                  : (!frontImg && !backImg)
                  ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
                  : 'bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-600/30 active:scale-95'
              }`}
            >
              {isScanning ? (
                <>
                  <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                  <span>Gemini Vision이 명함을 분석 중입니다...</span>
                </>
              ) : scanDone ? (
                <>
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  <span>AI 스캔 및 추출 완료! 다시 스캔하기</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5 text-amber-300 animate-spin" />
                  <span>AI 자동 스캔 실행 (연락처 정보 파싱)</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* 우측: OCR 추출 결과 및 정보 확인 폼 */}
        <form onSubmit={handleSubmit} className="w-full md:w-1/2 p-6 flex flex-col justify-between md:overflow-y-auto">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
              <h3 className="font-bold text-lg text-white">스캔 정보 확인 및 입력</h3>
              <button type="button" onClick={onClose} className="text-slate-400 hover:text-white p-1 bg-slate-800 rounded-full"><X className="w-4 h-4" /></button>
            </div>

            <div className="space-y-4 text-sm pr-1">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1 font-medium">성명 *</label>
                  <input type="text" required placeholder="예: 김도현" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold focus:outline-none focus:border-blue-500" />
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1 font-medium">그룹 지정</label>
                  <select value={form.groupId} onChange={(e) => setForm({ ...form, groupId: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-medium focus:outline-none focus:border-blue-500">
                    {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">회사명</label>
                  <input type="text" placeholder="예: 네이버" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">부서명</label>
                  <input type="text" placeholder="예: 개발팀" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">직책/직급</label>
                  <input type="text" placeholder="예: 팀장" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500" />
                </div>
              </div>

              {/* 요구사항: 연락처 핸드폰/사무실/팩스 나누어 입력 */}
              <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-2.5">
                <span className="text-xs font-bold text-slate-400 uppercase font-mono tracking-wider">연락처 세부 분리</span>
                
                <div className="grid grid-cols-1 gap-2">
                  <div>
                    <label className="text-[11px] text-emerald-400 block mb-0.5 font-medium">핸드폰 번호 (Mobile)</label>
                    <input type="text" inputMode="numeric" placeholder="010-0000-0000" value={form.phoneMobile} onChange={(e) => setForm({ ...form, phoneMobile: formatPhoneNumber(e.target.value) })} className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-emerald-500" />
                  </div>

                  <div>
                    <label className="text-[11px] text-blue-400 block mb-0.5 font-medium flex items-center justify-between">
                      <span>사무실 유선전화 1 (Office 1)</span>
                    </label>
                    <input type="text" inputMode="numeric" placeholder="02-000-0000" value={form.phoneOffice} onChange={(e) => setForm({ ...form, phoneOffice: formatPhoneNumber(e.target.value) })} className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-blue-500" />
                  </div>

                  <div>
                    <label className="text-[11px] text-cyan-400 block mb-0.5 font-medium flex items-center justify-between">
                      <span>사무실 유선전화 2 / 직통번호 (Office 2)</span>
                      <span className="text-[9px] bg-cyan-500/10 text-cyan-400 px-1 py-0.2 rounded font-mono font-bold">스캔 분리</span>
                    </label>
                    <input type="text" inputMode="numeric" placeholder="지사번호, 직통번호 등이 표기된 경우 분리 인식됩니다." value={form.phoneOffice2 || ''} onChange={(e) => setForm({ ...form, phoneOffice2: formatPhoneNumber(e.target.value) })} className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-cyan-500" />
                  </div>

                  <div>
                    <label className="text-[11px] text-amber-400 block mb-0.5 font-medium">팩스 번호 (Fax)</label>
                    <input type="text" inputMode="numeric" placeholder="02-000-0001" value={form.phoneFax} onChange={(e) => setForm({ ...form, phoneFax: formatPhoneNumber(e.target.value) })} className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-amber-500" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">이메일 주소</label>
                  <input type="email" placeholder="email@domain.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">회사 주소 1 (본사)</label>
                  <input type="text" placeholder="서울시 강남구..." value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500" />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1 font-medium text-slate-300 flex items-center gap-1">
                  <span>회사 주소 2 (지사/공장 등 2번째 주소)</span>
                  <span className="text-[10px] bg-blue-500/10 text-blue-400 px-1.5 py-0.2 rounded">분리 인식</span>
                </label>
                <input type="text" placeholder="지사, 공장, 연구소 주소가 있는 경우 여기에 자동 또는 수동 입력됩니다." value={form.address2} onChange={(e) => setForm({ ...form, address2: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500" />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">메모 / 슬로건 요약</label>
                <textarea rows={2} placeholder="주요 협의 사항이나 메모 작성" value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-blue-500" />
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-slate-800 flex gap-3">
            <button type="button" onClick={onClose} className="w-1/3 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-sm">
              취소
            </button>
            <button type="submit" className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-600/30">
              명함 최종 등록
            </button>
          </div>
        </form>

      </div>

      {cropTarget && (
        <CropAdjustModal
          imageDataUrl={cropTarget.rawImage}
          title={cropTarget.side === 'front' ? '명함 앞면 테두리 확인' : '명함 뒷면 테두리 확인'}
          onConfirm={(cropped) => {
            if (cropTarget.side === 'front') setFrontImg(cropped);
            else setBackImg(cropped);
            setCropTarget(null);
          }}
          onCancel={() => setCropTarget(null)}
        />
      )}

      {cameraTarget && (
        <LiveCameraCapture
          title={cameraTarget === 'front' ? '명함 앞면 촬영' : '명함 뒷면 촬영'}
          guideAspectRatio={1.586}
          onCapture={(dataUrl) => {
            // 실시간 촬영본도 파일 업로드와 동일하게 확인/조정 단계를 거치도록 한다
            // (실시간 인식이 완벽하지 않았을 경우를 위한 안전장치)
            const side = cameraTarget;
            setCameraTarget(null);
            if (side) setCropTarget({ side, rawImage: dataUrl });
          }}
          onCancel={() => setCameraTarget(null)}
          onFallbackToFile={() => {
            fallbackFileInputRef.current?.click();
          }}
        />
      )}
      <input
        ref={fallbackFileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          if (cameraTarget) {
            handleImageFile(e, cameraTarget);
            setCameraTarget(null);
          }
        }}
      />
    </div>
  );
};
