import { useEffect, useRef, useState } from 'react';

// 작성 중 임시 저장 (서버 보관 - 같은 계정이면 어느 기기에서든 이어서 작성)
//
// 사용법: 작성 중인 값(value)과 그 값을 바꾸는 함수(setValue)를 넘기면 된다.
// - 화면이 열릴 때 현재 내용을 기준으로 기억하고, 서버에 임시 저장본이 있으면 prompt로 알려준다.
// - 사용자가 내용을 바꾸면 입력이 잠시 멈춘 뒤(1.2초) 서버에 자동 저장한다.
// - 저장이 끝나면 discardOpen()을 호출해 임시 저장본을 지운다.
// - 첨부파일(base64)은 서버가 파일로 올리고 URL만 남기므로, 드래프트가 커지지 않는다.

const DEBOUNCE_MS = 1200;

export interface DraftAttachment { id: string; name: string; dataUrl: string; size?: number }

export interface DraftPrompt<T> { key: string; data: T; savedAt: string }

export interface UseDraftAutosaveOptions<T> {
  value: T | null;
  setValue: (updater: (prev: T | null) => T | null) => void;
  // 문서마다 고유한 키 (예: 'admin-doc:labor_contract:new'). 화면이 구분되도록 앞에 이름을 붙인다.
  keyOf: (doc: T) => string;
  userId: string | null | undefined;
}

export function useDraftAutosave<T extends object>(opts: UseDraftAutosaveOptions<T>) {
  const { value, setValue, keyOf, userId } = opts;

  const openRef = useRef<{ key: string; snapshot: string } | null>(null);
  const timerRef = useRef<number | null>(null);
  // 첨부파일 id -> 서버에 올라간 URL. 같은 첨부를 입력마다 다시 올리지 않으려고 기억해둔다.
  const uploadedUrlRef = useRef<Map<string, string>>(new Map());
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
    const withUrls = doc as T & { attachments?: DraftAttachment[] };
    const attachments = withUrls.attachments?.map((a) => {
      const url = uploadedUrlRef.current.get(a.id);
      return url ? { ...a, dataUrl: url } : a;
    });
    const data = attachments ? { ...withUrls, attachments } : withUrls;
    const category = (doc as { category?: unknown }).category;
    fetch(urlFor(key), {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ category: typeof category === 'string' ? category : '', data })
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((saved) => {
        const list = saved?.data?.attachments;
        if (Array.isArray(list)) {
          for (const a of list as DraftAttachment[]) {
            if (a?.id && a.dataUrl && !a.dataUrl.startsWith('data:')) uploadedUrlRef.current.set(a.id, a.dataUrl);
          }
        }
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

  return { prompt, restore, dismiss, discardOpen };
}
