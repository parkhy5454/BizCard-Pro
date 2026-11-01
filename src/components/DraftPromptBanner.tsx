import React from 'react';
import type { DraftPrompt } from '../hooks/useDraftAutosave.js';

// 작성 화면 맨 위에 "임시 저장된 내용이 있습니다 - 이어서 작성 / 버리기"를 보여주는 공용 안내 박스
// (useDraftAutosave 훅과 함께 쓴다)
export const DraftPromptBanner = <T,>({ prompt, onRestore, onDismiss, actionLabel = '이어서 작성' }: {
  prompt: DraftPrompt<T> | null;
  onRestore: () => void;
  onDismiss: () => void;
  actionLabel?: string;
}) => {
  if (!prompt) return null;
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 space-y-2 text-left">
      <p className="text-sm font-bold text-amber-800">임시 저장된 작성 내용이 있습니다</p>
      <p className="text-xs text-amber-700">{new Date(prompt.savedAt).toLocaleString('ko-KR')}에 저장됨 (다른 기기에서 작성한 내용도 보입니다)</p>
      <div className="flex gap-2">
        <button type="button" onClick={onRestore} className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-xs font-bold">{actionLabel}</button>
        <button type="button" onClick={onDismiss} className="px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-600 text-xs font-bold">버리기</button>
      </div>
    </div>
  );
};
