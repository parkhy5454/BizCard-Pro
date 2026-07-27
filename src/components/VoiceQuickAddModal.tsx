import React, { useState, useEffect, useRef } from 'react';
import { X, Mic, CheckCircle2, Loader2, AlertTriangle } from 'lucide-react';
import { BusinessCard, ContactGroup } from '../types.js';
import { findDuplicateContact } from './ScanModal.js';

interface Props {
  groups: ContactGroup[];
  contacts: BusinessCard[];
  onClose: () => void;
  onSave: (newCard: BusinessCard) => void;
  onUpdate?: (updated: BusinessCard) => void;
}

// [수정] 음성 명함 등록: 전시회처럼 손이 바쁠 때 "방금 만난 사람 이름 불러줘"로 빠르게
// 기록하고, 사진 없이 일단 저장해둔다. 나중에 실제 명함을 스캔하면 기존 중복 감지 로직이
// 자동으로 "기존 정보 업데이트"를 제안해서 이 항목이 자연스럽게 완성된다.
export const VoiceQuickAddModal: React.FC<Props> = ({ groups, contacts, onClose, onSave, onUpdate }) => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [parsed, setParsed] = useState<{ name: string; company: string; department: string; title: string; memo: string } | null>(null);
  const [duplicateMatch, setDuplicateMatch] = useState<BusinessCard | null>(null);
  const [saved, setSaved] = useState(false);
  const recognitionRef = useRef<any>(null);
  const [speechSupported, setSpeechSupported] = useState(true);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSpeechSupported(false);
      return;
    }
    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'ko-KR';
    rec.onresult = (event: any) => {
      let finalText = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) finalText += event.results[i][0].transcript;
      }
      if (finalText) setTranscript((prev) => (prev ? prev + ' ' + finalText : finalText));
    };
    rec.onerror = () => setIsListening(false);
    recognitionRef.current = rec;
    return () => {
      try { rec.stop(); } catch {}
    };
  }, []);

  const startListening = () => {
    setTranscript('');
    setParsed(null);
    setDuplicateMatch(null);
    setIsListening(true);
    try { recognitionRef.current?.start(); } catch {}
  };

  const stopListening = async () => {
    setIsListening(false);
    try { recognitionRef.current?.stop(); } catch {}
    if (transcript.trim()) {
      await parseTranscript(transcript);
    }
  };

  const parseTranscript = async (text: string) => {
    setIsParsing(true);
    try {
      const res = await fetch('/api/parse-voice-contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText: text })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setParsed(data);
      const match = findDuplicateContact({ name: data.name, company: data.company }, contacts);
      setDuplicateMatch(match);
    } catch (err: any) {
      alert(err.message || '음성 인식 결과를 처리하지 못했습니다. 다시 시도해주세요.');
    } finally {
      setIsParsing(false);
    }
  };

  const handleSave = (asUpdate: boolean) => {
    if (!parsed || !parsed.name.trim()) return;

    if (asUpdate && duplicateMatch && onUpdate) {
      onUpdate({
        ...duplicateMatch,
        name: parsed.name || duplicateMatch.name,
        company: parsed.company || duplicateMatch.company,
        department: parsed.department || duplicateMatch.department,
        title: parsed.title || duplicateMatch.title,
        memo: [duplicateMatch.memo, parsed.memo].filter(Boolean).join(' · ')
      });
    } else {
      const newCard: BusinessCard = {
        id: `c-${Date.now()}`,
        name: parsed.name,
        company: parsed.company || '',
        department: parsed.department || '',
        title: parsed.title || '',
        phoneMobile: '',
        phoneOffice: '',
        phoneFax: '',
        email: '',
        address: '',
        groupId: groups[0]?.id || 'g-client',
        memo: parsed.memo ? `🎤 음성으로 빠르게 등록됨: ${parsed.memo}` : '🎤 음성으로 빠르게 등록됨 (사진 없음 · 나중에 명함 스캔하면 자동으로 완성돼요)',
        createdAt: new Date().toISOString(),
        callHistory: []
      };
      onSave(newCard);
    }
    setSaved(true);
    setTimeout(() => onClose(), 1200);
  };

  return (
    <div className="fixed inset-0 z-[95] bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden">
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
              <Mic className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-100">음성으로 빠르게 등록</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {!speechSupported ? (
            <div className="py-8 text-center space-y-2">
              <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
              <p className="text-xs text-slate-400">이 브라우저는 음성 인식을 지원하지 않아요. 크롬 브라우저를 이용해주세요.</p>
            </div>
          ) : saved ? (
            <div className="py-8 flex flex-col items-center gap-2 text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-400" />
              <p className="text-sm font-bold text-slate-100">저장됐어요!</p>
              <p className="text-xs text-slate-500">나중에 명함을 스캔하면 자동으로 완성돼요.</p>
            </div>
          ) : parsed ? (
            <div className="space-y-3">
              {duplicateMatch && (
                <div className="flex items-start gap-2 text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>이미 등록된 "{duplicateMatch.name}"({duplicateMatch.company || '회사 미등록'})와 비슷해요.</span>
                </div>
              )}
              <div className="space-y-2">
                <div>
                  <label className="text-[10px] text-slate-500 font-bold">성명</label>
                  <input
                    value={parsed.name}
                    onChange={(e) => setParsed({ ...parsed, name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white font-bold focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 font-bold">회사명</label>
                  <input
                    value={parsed.company}
                    onChange={(e) => setParsed({ ...parsed, company: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={parsed.department}
                    onChange={(e) => setParsed({ ...parsed, department: e.target.value })}
                    placeholder="부서명"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                  <input
                    value={parsed.title}
                    onChange={(e) => setParsed({ ...parsed, title: e.target.value })}
                    placeholder="직책"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                {duplicateMatch && onUpdate ? (
                  <button
                    onClick={() => handleSave(true)}
                    disabled={!parsed.name.trim()}
                    className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs disabled:opacity-40"
                  >
                    기존 "{duplicateMatch.name}" 정보 업데이트
                  </button>
                ) : null}
                <button
                  onClick={() => handleSave(false)}
                  disabled={!parsed.name.trim()}
                  className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs disabled:opacity-40"
                >
                  {duplicateMatch ? '그래도 새로 등록' : '이대로 빠르게 저장'}
                </button>
                <button
                  onClick={startListening}
                  className="w-full py-2 text-slate-500 hover:text-slate-300 text-[11px]"
                >
                  다시 말하기
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 py-4">
              <button
                type="button"
                onClick={isListening ? stopListening : startListening}
                className={`w-20 h-20 rounded-full flex items-center justify-center transition-all active:scale-95 ${
                  isListening
                    ? 'bg-rose-600 shadow-lg shadow-rose-600/40 animate-pulse'
                    : 'bg-gradient-to-tr from-indigo-600 to-blue-500 shadow-lg shadow-indigo-600/30'
                }`}
              >
                {isParsing ? <Loader2 className="w-8 h-8 text-white animate-spin" /> : <Mic className="w-8 h-8 text-white" />}
              </button>
              <p className="text-xs text-slate-400 text-center leading-relaxed">
                {isParsing
                  ? 'AI가 이름/회사를 정리하고 있어요...'
                  : isListening
                  ? '듣고 있어요! 예: "김철수, 카이저솔루션 부장님" · 다 말했으면 다시 눌러주세요'
                  : '버튼을 누르고, 방금 만난 분의 이름과 회사를 말해주세요'}
              </p>
              {transcript && (
                <p className="text-[11px] text-slate-500 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 w-full text-center">
                  "{transcript}"
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
