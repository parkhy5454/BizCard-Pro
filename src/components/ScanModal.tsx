import React, { useState } from 'react';
import { X, Upload, ScanLine, CheckCircle2, Sparkles, Building2 } from 'lucide-react';
import { BusinessCard, ContactGroup } from '../types.js';
import { formatPhoneNumber } from '../phoneFormat.js';

interface Props {
  groups: ContactGroup[];
  onClose: () => void;
  onSave: (newCard: BusinessCard) => void;
}

export const ScanModal: React.FC<Props> = ({ groups, onClose, onSave }) => {
  const [frontImg, setFrontImg] = useState<string>('');
  const [backImg, setBackImg] = useState<string>('');
  const [isCroppingFront, setIsCroppingFront] = useState<boolean>(false);
  const [isCroppingBack, setIsCroppingBack] = useState<boolean>(false);
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

  // OpenCV.js를 최초 1회만 지연 로딩 (명함 스캔 시에만 필요하므로 앱 초기 로딩 속도에 영향 없음)
  const loadOpenCv = (): Promise<void> => {
    const w = window as any;
    if (w.cv && w.cv.Mat) return Promise.resolve();
    if (w.__openCvLoadingPromise) return w.__openCvLoadingPromise;
    w.__openCvLoadingPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://docs.opencv.org/4.10.0/opencv.js';
      script.async = true;
      script.onload = () => {
        const check = () => {
          if (w.cv && w.cv.Mat) resolve();
          else setTimeout(check, 50);
        };
        check();
      };
      script.onerror = () => reject(new Error('OpenCV.js 로드 실패'));
      document.body.appendChild(script);
    });
    return w.__openCvLoadingPromise;
  };

  // 명함 4개 모서리를 자동으로 감지해서 그 부분만 반듯하게(원근보정) 잘라냅니다.
  // 감지에 실패하면 원본 사진을 그대로 사용합니다 (기능 저하 없이 안전하게 폴백).
  const autoCropCardImage = async (dataUrl: string): Promise<string> => {
    try {
      await loadOpenCv();
    } catch {
      return dataUrl;
    }
    const cv = (window as any).cv;

    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let src, gray, blurred, edged, dilated, kernel, contours, hierarchy, bestApprox: any = null;
        let srcTri, dstTri, M, dst;
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(img, 0, 0);

          src = cv.imread(canvas);
          gray = new cv.Mat();
          cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
          blurred = new cv.Mat();
          cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
          edged = new cv.Mat();
          cv.Canny(blurred, edged, 50, 150);
          dilated = new cv.Mat();
          kernel = cv.Mat.ones(3, 3, cv.CV_8U);
          cv.dilate(edged, dilated, kernel);

          contours = new cv.MatVector();
          hierarchy = new cv.Mat();
          cv.findContours(dilated, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

          let maxArea = 0;
          const minArea = img.width * img.height * 0.15; // 사진의 15% 이상 차지해야 명함으로 인정
          for (let i = 0; i < contours.size(); i++) {
            const cnt = contours.get(i);
            const peri = cv.arcLength(cnt, true);
            const approx = new cv.Mat();
            cv.approxPolyDP(cnt, approx, 0.02 * peri, true);
            const area = cv.contourArea(approx);
            if (approx.rows === 4 && area > maxArea && area > minArea) {
              maxArea = area;
              if (bestApprox) bestApprox.delete();
              bestApprox = approx;
            } else {
              approx.delete();
            }
            cnt.delete();
          }

          if (!bestApprox) {
            resolve(dataUrl); // 감지 실패 → 원본 사용
            return;
          }

          const pts: { x: number; y: number }[] = [];
          for (let i = 0; i < 4; i++) {
            pts.push({ x: bestApprox.data32S[i * 2], y: bestApprox.data32S[i * 2 + 1] });
          }
          const sums = pts.map((p) => p.x + p.y);
          const diffs = pts.map((p) => p.x - p.y);
          const tl = pts[sums.indexOf(Math.min(...sums))];
          const br = pts[sums.indexOf(Math.max(...sums))];
          const tr = pts[diffs.indexOf(Math.max(...diffs))];
          const bl = pts[diffs.indexOf(Math.min(...diffs))];

          const maxWidth = Math.max(Math.hypot(br.x - bl.x, br.y - bl.y), Math.hypot(tr.x - tl.x, tr.y - tl.y));
          const maxHeight = Math.max(Math.hypot(tr.x - br.x, tr.y - br.y), Math.hypot(tl.x - bl.x, tl.y - bl.y));

          srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]);
          dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, maxWidth, 0, maxWidth, maxHeight, 0, maxHeight]);
          M = cv.getPerspectiveTransform(srcTri, dstTri);
          dst = new cv.Mat();
          cv.warpPerspective(src, dst, M, new cv.Size(maxWidth, maxHeight));

          const outCanvas = document.createElement('canvas');
          outCanvas.width = maxWidth;
          outCanvas.height = maxHeight;
          cv.imshow(outCanvas, dst);
          resolve(outCanvas.toDataURL('image/jpeg', 0.92));
        } catch (err) {
          console.error('명함 자동 크롭 실패, 원본 사용:', err);
          resolve(dataUrl);
        } finally {
          [src, gray, blurred, edged, dilated, kernel, contours, hierarchy, bestApprox, srcTri, dstTri, M, dst].forEach((m) => {
            try { m && m.delete && m.delete(); } catch {}
          });
        }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  };

  const handleImageFile = (e: React.ChangeEvent<HTMLInputElement>, side: 'front' | 'back') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const raw = reader.result as string;
      // 우선 원본을 즉시 미리보기로 보여주고, 백그라운드에서 모서리 자동 인식 후 교체
      if (side === 'front') { setFrontImg(raw); setIsCroppingFront(true); }
      else { setBackImg(raw); setIsCroppingBack(true); }

      try {
        const cropped = await autoCropCardImage(raw);
        if (side === 'front') setFrontImg(cropped);
        else setBackImg(cropped);
      } finally {
        if (side === 'front') setIsCroppingFront(false);
        else setIsCroppingBack(false);
      }
    };
    reader.readAsDataURL(file);
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
                      {isCroppingFront && (
                        <div className="absolute inset-0 bg-slate-950/70 flex flex-col items-center justify-center gap-1.5">
                          <div className="w-6 h-6 border-2 border-slate-600 border-t-blue-400 rounded-full animate-spin" />
                          <span className="text-[11px] text-slate-300 font-semibold">명함 모서리 인식 중...</span>
                        </div>
                      )}
                      <button 
                        type="button" 
                        onClick={() => setFrontImg('')} 
                        className="absolute top-2 right-2 p-1 rounded-full bg-slate-900/80 text-rose-400 hover:text-white"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <label className="cursor-pointer flex flex-col items-center justify-center w-full h-full p-4 text-center">
                      <Upload className="w-8 h-8 text-slate-500 group-hover:text-blue-400 transition-colors mb-2" />
                      <span className="text-xs font-semibold text-slate-300">클릭하거나 사진 촬영/드래그</span>
                      <span className="text-[11px] text-slate-500 mt-0.5">명함 앞면 사진 업로드</span>
                      <input type="file" accept="image/*" onChange={(e) => handleImageFile(e, 'front')} className="hidden" />
                    </label>
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
                      {isCroppingBack && (
                        <div className="absolute inset-0 bg-slate-950/70 flex flex-col items-center justify-center gap-1.5">
                          <div className="w-6 h-6 border-2 border-slate-600 border-t-blue-400 rounded-full animate-spin" />
                          <span className="text-[11px] text-slate-300 font-semibold">명함 모서리 인식 중...</span>
                        </div>
                      )}
                      <button 
                        type="button" 
                        onClick={() => setBackImg('')} 
                        className="absolute top-2 right-2 p-1 rounded-full bg-slate-900/80 text-rose-400 hover:text-white"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <label className="cursor-pointer flex flex-col items-center justify-center w-full h-full p-3 text-center">
                      <span className="text-xs text-slate-400">+ 뒷면 이미지도 추가 저장하기</span>
                      <input type="file" accept="image/*" onChange={(e) => handleImageFile(e, 'back')} className="hidden" />
                    </label>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* AI 스캔 가동 버튼 */}
          <div className="pt-6">
            <button
              type="button"
              disabled={isScanning || isCroppingFront || isCroppingBack || (!frontImg && !backImg)}
              onClick={handleStartOCR}
              className={`w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 shadow-xl transition-all ${
                isScanning || isCroppingFront || isCroppingBack
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
    </div>
  );
};
