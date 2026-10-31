import React, { useRef, useState, useEffect } from 'react';
import { X, RotateCcw, Check, PenTool, Upload, Image as ImageIcon } from 'lucide-react';
import { User } from '../types.js';

import { getErrorMessage } from '../errorUtils.js';
// [수정] 전자결재에서 승인할 때 도장처럼 찍히는 손글씨 서명을 등록/변경하는 화면.
// 마우스든 손가락(터치)이든 캔버스에 직접 그려서 등록하거나, 스캔/촬영해둔 서명 이미지
// 파일을 업로드해서 등록할 수도 있다(두 방식 다 최종적으로 이미지 data URL 하나로
// 합쳐져서 PUT /api/auth/signature로 서버(Supabase Storage)에 저장되고, 이후 모든
// 결재에 재사용된다). 이 모달은 플랫폼 전체에서 서명을 등록하는 유일한 화면이라
// 여기 한 곳만 고치면 전자결재를 포함한 모든 서명 등록 지점에 동일하게 적용된다.

interface Props {
  currentUser: User;
  onClose: () => void;
  onSaved: (updatedUser: User) => void;
}

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB

// [추가] 모바일에서는 팝업이 상단 헤더·결재 탭과 하단 탭을 가리지 않도록 보이는 영역 사이에만 펼친다
const mobileModalInsets = (): React.CSSProperties | undefined => {
  if (typeof window === 'undefined' || window.innerWidth >= 768) return undefined;
  let top = 0;
  const header = document.querySelector('header') as HTMLElement | null;
  if (header) top = Math.max(top, header.getBoundingClientRect().bottom);
  ['app-top-action-row', 'app-projects-top-bar', 'approval-top-bar', 'approval-fixed-tabs'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) top = Math.max(top, el.getBoundingClientRect().bottom);
  });
  let bottom = 0;
  const tabbar = document.querySelector('[data-app-tabbar]') as HTMLElement | null;
  if (tabbar && tabbar.getBoundingClientRect().height > 0) bottom = Math.max(0, window.innerHeight - tabbar.getBoundingClientRect().top);
  return { top, bottom };
};

export const SignaturePadModal: React.FC<Props> = ({ currentUser, onClose, onSaved }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isDrawingRef = useRef(false);
  const hasStrokeRef = useRef(false);
  const [isEmpty, setIsEmpty] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  // [추가] "직접 그리기" / "파일 업로드" 두 가지 등록 방식을 탭으로 전환
  const [mode, setMode] = useState<'draw' | 'upload'>('draw');
  const [uploadedImage, setUploadedImage] = useState<string>('');

  // 캔버스를 흰 배경으로 초기화 (투명 배경이면 나중에 문서에 찍었을 때 회색으로 보일 수 있음)
  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111827';
    hasStrokeRef.current = false;
    setIsEmpty(true);
  };

  useEffect(() => {
    clearCanvas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    isDrawingRef.current = true;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!hasStrokeRef.current) {
      hasStrokeRef.current = true;
      setIsEmpty(false);
    }
  };

  const handlePointerUp = () => {
    isDrawingRef.current = false;
  };

  // [추가] 서명 스캔본/촬영 파일을 선택하면 data URL로 읽어서 미리보기+저장에 사용한다.
  // 캔버스로 그린 것과 똑같이 최종적으로 data URL 하나로 서버에 전달되므로, 저장 로직은
  // handleSave에서 mode만 보고 어느 쪽 data URL을 쓸지 고르면 된다.
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 같은 파일을 다시 선택해도 onChange가 또 발생하도록 초기화
    if (!file) return;
    setError('');
    if (!file.type.startsWith('image/')) {
      setError('이미지 파일(JPG, PNG 등)만 업로드할 수 있습니다.');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError('파일 용량이 너무 큽니다. 5MB 이하 이미지를 올려주세요.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setUploadedImage(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => setError('파일을 읽는 중 오류가 발생했습니다.');
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    const canvas = canvasRef.current;
    const isCanvasMode = mode === 'draw';
    if (isCanvasMode && (!canvas || isEmpty)) return;
    if (!isCanvasMode && !uploadedImage) return;
    setIsSaving(true);
    setError('');
    try {
      const dataUrl = isCanvasMode ? canvas!.toDataURL('image/png') : uploadedImage;
      const res = await fetch('/api/auth/signature', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-user-id': currentUser.id },
        body: JSON.stringify({ signatureImage: dataUrl })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || '서명 저장에 실패했습니다.');
      onSaved(data.user);
    } catch (err: unknown) {
      setError(getErrorMessage(err) || '서명 저장 중 오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-stretch md:items-center justify-center p-0 md:p-4 bg-white md:bg-slate-900/60 md:backdrop-blur-sm" style={mobileModalInsets()}>
      <div className="bg-white md:border md:border-slate-200 rounded-none md:rounded-2xl w-full md:max-w-md h-full md:h-auto flex flex-col overflow-y-auto md:overflow-hidden shadow-none md:shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-white md:bg-slate-50 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 md:w-8 md:h-8 rounded-lg bg-indigo-50 border border-indigo-500/20 flex items-center justify-center">
              <PenTool className="w-5 h-5 md:w-4 md:h-4 text-indigo-500" />
            </div>
            <div>
              <h2 className="text-lg md:text-sm font-bold text-slate-800">내 서명 등록</h2>
              <p className="text-base md:text-[11px] text-slate-500 md:text-slate-400">전자결재 승인 시 도장처럼 찍힙니다</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors">
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        <div className="p-4 space-y-4 md:space-y-3 flex-1 min-h-0">
          {/* [추가] 직접 그리기 / 파일 업로드 전환 탭 */}
          <div className="flex items-center gap-1.5 p-1 bg-white md:bg-slate-100 border border-slate-200 md:border-0 rounded-xl">
            <button
              type="button"
              onClick={() => { setMode('draw'); setError(''); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 md:py-1.5 rounded-lg text-base md:text-xs font-bold transition-colors ${mode === 'draw' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <PenTool className="w-3.5 h-3.5" /> 직접 그리기
            </button>
            <button
              type="button"
              onClick={() => { setMode('upload'); setError(''); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 md:py-1.5 rounded-lg text-base md:text-xs font-bold transition-colors ${mode === 'upload' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Upload className="w-3.5 h-3.5" /> 파일 업로드
            </button>
          </div>

          {mode === 'draw' ? (
            <>
              <div className="relative border-2 border-dashed border-slate-300 rounded-xl overflow-hidden bg-white">
                <canvas
                  ref={canvasRef}
                  width={500}
                  height={220}
                  className="w-full h-[180px] touch-none cursor-crosshair"
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerLeave={handlePointerUp}
                />
                {isEmpty && (
                  <p className="absolute inset-0 flex items-center justify-center text-base md:text-xs text-slate-300 pointer-events-none">
                    여기에 서명해주세요
                  </p>
                )}
              </div>
            </>
          ) : (
            <>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
              {uploadedImage ? (
                <div className="relative border-2 border-dashed border-slate-300 rounded-xl overflow-hidden bg-white">
                  <img src={uploadedImage} alt="업로드한 서명 미리보기" className="w-full h-[180px] object-contain" />
                  <button
                    type="button"
                    onClick={() => setUploadedImage('')}
                    className="absolute top-2 right-2 p-1.5 rounded-lg bg-white/90 hover:bg-white text-slate-500 hover:text-rose-500 border border-slate-200 shadow-sm transition-colors"
                    title="다시 선택"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-[180px] flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-300 rounded-xl bg-white hover:bg-slate-50 hover:border-indigo-400 text-slate-400 hover:text-indigo-500 transition-colors"
                >
                  <ImageIcon className="w-7 h-7" />
                  <span className="text-base md:text-xs font-bold">탭하여 서명 이미지 선택</span>
                </button>
              )}
              <p className="text-base md:text-xs text-slate-500">JPG, PNG 등 5MB 이하 이미지 파일을 지원합니다.</p>
            </>
          )}

          {error && <p className="text-base md:text-xs text-rose-500 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex items-center gap-2">
            {mode === 'draw' && (
              <button
                onClick={clearCanvas}
                disabled={isEmpty}
                className="flex items-center gap-1.5 px-3.5 py-3 md:py-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-base md:text-xs font-bold text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" /> 다시 그리기
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={(mode === 'draw' ? isEmpty : !uploadedImage) || isSaving}
              className="flex-1 flex items-center justify-center gap-1.5 px-3.5 py-3 md:py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-base md:text-xs font-bold shadow-lg shadow-indigo-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Check className="w-3.5 h-3.5" /> {isSaving ? '저장 중...' : '서명 저장'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
