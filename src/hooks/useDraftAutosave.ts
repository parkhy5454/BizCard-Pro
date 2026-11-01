import { useEffect, useRef, useState } from 'react';

// 작성 중 임시 저장 (서버 보관 - 같은 계정이면 어느 기기에서든 이어서 작성)
//
// 사용법: 작성 중인 값(value)과 그 값을 바꾸는 함수(setValue)를 넘기면 된다.
// - 화면이 열릴 때 현재 내용을 기준으로 기억하고, 서버에 임시 저장본이 있으면 prompt로 알려준다.
// - 사용자가 내용을 바꾸면 입력이 잠시 멈춘 뒤(1.2초) 서버에 자동 저장한다.
// - 저장이 끝나면 discardOpen()을 호출해 임시 저장본을 지운다.
// - 사진(base64)은 서버가 파일로 올리고 URL만 남기므로, 드래프트가 커지지 않는다.

const DEBOUNCE_MS = 1200;

export interface DraftPrompt<T> { key: string; data: T; savedAt: string }

export interface UseDraftAutosaveOptions<T> {
  value: T | null;
  setValue: (updater: (prev: T | null) => T | null) => void;
  // 문서마다 고유한 키 (예: 'admin-doc:labor_contract:new'). 화면이 구분되도록 앞에 이름을 붙인다.
  keyOf: (doc: T) => string;
  userId: string | null | undefined;
}

// 값 안의 문자열을 모두 바꾼다 (base64 사진 -> 업로드된 URL)
function mapStrings(value: unknown, fn: (s: string) => string, depth = 0): unknown {
  if (depth > 20) return value;
  if (typeof value === 'string') return fn(value);
  if (Array.isArray(value)) return value.map((v) => mapStrings(v, fn, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = mapStrings(v, fn, depth + 1);
    return out;
  }
  return value;
}

// 보낸 값과 서버가 돌려준 값을 같은 자리끼리 짝지어서, base64 -> URL 대응표를 만든다
function collectUploaded(sent: unknown, saved: unknown, into: Map<string, string>, depth = 0) {
  if (depth > 20) return;
  if (typeof sent === 'string') {
    if (sent.startsWith('data:') && typeof saved === 'string' && !saved.startsWith('data:')) into.set(sent, saved);
    return;
  }
  if (Array.isArray(sent) && Array.isArray(saved)) {
    sent.forEach((v, i) => collectUploaded(v, saved[i], into, depth + 1));
    return;
  }
  if (sent && typeof sent === 'object' && saved && typeof saved === 'object') {
    for (const k of Object.keys(sent as Record<string, unknown>)) {
      collectUploaded((sent as Record<string, unknown>)[k], (saved as Record<string, unknown>)[k], into, depth + 1);
    }
  }
}

export function useDraftAutosave<T extends object>(opts: UseDraftAutosaveOptions<T>) {
  const { value, setValue, keyOf, userId } = opts;

  const openRef = useRef<{ key: string; snapshot: string } | null>(null);
  const timerRef = useRef<number | null>(null);
  // 저장 후에도 화면이 열린 채 입력칸만 비워지는 경우(연속 입력형)에, 비워진 상태가 다시 임시 저장되지 않도록
  // 다음 내용 변화를 새 기준선으로 삼는 표시
  const rebaseRef = useRef(false);
  // base64 사진 -> 서버에 올라간 URL. 같은 사진을 자동 저장 때마다 다시 보내지 않으려고 기억해둔다.
  const uploadedRef = useRef<Map<string, string>>(new Map());
  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  const [prompt, setPrompt] = useState<DraftPrompt<T> | null>(null);

  const headers = (): Record<string, string> => ({ 'Content-Type': 'application/json', 'x-user-id': userIdRef.current || '' });
  const urlFor = (key: string) => `/api/drafts/${encodeURIComponent(key)}`;

  const cancelTimer = () => {
    if (timerRef.current) { window.clearTimeout(timerRef.current); timerRef.current = null; }
  };

  const discard = (key: string) => {
    cancelTimer();
    fetch(urlFor(key), { method: 'DELETE', headers: headers() }).catch(() => {});
  };

  const save = (key: string, doc: T) => {
    const category = (doc as { category?: unknown }).category;
    const map = uploadedRef.current;
    const data = mapStrings(doc, (s) => map.get(s) ?? s);
    fetch(urlFor(key), {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ category: typeof category === 'string' ? category : '', data })
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((saved) => {
        if (saved && saved.data) collectUploaded(data, saved.data, map);
      })
      .catch(() => {});
  };

  // 화면이 열릴 때: 기준 내용을 기억하고, 임시 저장본이 있으면 알린다.
  useEffect(() => {
    if (!value) { openRef.current = null; setPrompt(null); return; }
    if (openRef.current) return;
    const key = keyOf(value);
    openRef.current = { key, snapshot: JSON.stringify(value) };
    if (!userIdRef.current) return;
    fetch(urlFor(key), { headers: headers() })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        // 열린 화면이 그대로일 때만 알린다
        if (d && d.data && openRef.current?.key === key) setPrompt({ key, data: d.data as T, savedAt: d.savedAt });
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // 내용이 바뀌면 잠시 뒤 자동 저장. 바뀐 뒤에는 "이어서 작성" 안내를 거둔다.
  useEffect(() => {
    const open = openRef.current;
    if (!value || !open) return;
    if (rebaseRef.current) {
      rebaseRef.current = false;
      open.snapshot = JSON.stringify(value);
      cancelTimer();
      setPrompt(null);
      return;
    }
    if (JSON.stringify(value) === open.snapshot) return;
    setPrompt(null);
    cancelTimer();
    const key = open.key;
    const latest = value;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      save(key, latest);
    }, DEBOUNCE_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const restore = () => {
    if (!prompt) return;
    const draft = prompt.data;
    // 드래프트 내용으로 바꾸되, 문서 번호(id)는 지금 열린 문서의 것을 쓴다
    setValue((prev) => (prev ? { ...draft, id: (prev as { id?: unknown }).id } as T : prev));
    setPrompt(null);
  };

  const dismiss = () => {
    if (prompt) discard(prompt.key);
    setPrompt(null);
  };

  // 저장이 끝났을 때 호출: 지금 열린 문서의 임시 저장본을 지운다
  const discardOpen = () => {
    const open = openRef.current;
    if (open) discard(open.key);
  };

  // 저장 후 화면이 열린 채 입력칸이 비워지는 경우: 임시 저장본을 지우고, 비워진 다음 상태를 새 기준선으로 삼는다
  const markSaved = () => {
    discardOpen();
    rebaseRef.current = true;
  };

  return { prompt, restore, dismiss, discardOpen, markSaved };
}
