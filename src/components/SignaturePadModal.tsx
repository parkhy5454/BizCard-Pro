import React, { useRef, useState, useEffect } from 'react';
import { X, RotateCcw, Check, PenTool } from 'lucide-react';
import { User } from '../types.js';

// [추가] 전자결재에서 승인할 때 도장처럼 찍히는 손글씨 서명을 등록/변경하는 화면.
// 마우스든 손가락(터치)이든 캔버스에 직접 그려서 등록하고, 한 번 등록해두면
// PUT /api/auth/signature로 서버(Supabase Storage)에 저장되어 이후 모든 결재에 재사용된다.

interface Props {
  currentUser: User;
  onClose: () => void;
  onSaved: (updatedUser: User) => void;
}

export const SignaturePadModal: React.FC<Props> = ({ currentUser, onClose, onSaved }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const hasStrokeRef = useRef(false);
  const [isEmpty, setIsEmpty] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

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

  const handleSave = async () => {
    const canvas = canvasRef.current;
    if (!canvas || isEmpty) return;
    setIsSaving(true);
    setError('');
    try {
      const dataUrl = canvas.toDataURL('image/png');
      const res = await fetch('/api/auth/signature', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-user-id': currentUser.id },
        body: JSON.stringify({ signatureImage: dataUrl })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || '서명 저장에 실패했습니다.');
      onSaved(data.user);
    } catch (err: any) {
      setError(err.message || '서명 저장 중 오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-500/20 flex items-center justify-center">
              <PenTool className="w-4 h-4 text-indigo-500" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">내 서명 등록</h2>
              <p className="text-[11px] text-slate-400">전자결재 승인 시 도장처럼 찍힙니다</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors">
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-xs text-slate-500">
            아래 네모 칸에 마우스나 손가락(터치)으로 서명을 그려주세요. 한 번 등록하면 다음 결재부터는 다시 그릴 필요 없이 자동으로 사용됩니다.
          </p>
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
              <p className="absolute inset-0 flex items-center justify-center text-xs text-slate-300 pointer-events-none">
                여기에 서명해주세요
              </p>
            )}
          </div>

          {error && <p className="text-xs text-rose-500 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex items-center gap-2">
            <button
              onClick={clearCanvas}
              disabled={isEmpty}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-xs font-bold text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" /> 다시 그리기
            </button>
            <button
              onClick={handleSave}
              disabled={isEmpty || isSaving}
              className="flex-1 flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Check className="w-3.5 h-3.5" /> {isSaving ? '저장 중...' : '서명 저장'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
