import React, { useEffect, useRef, useState } from 'react';
import { MessagesSquare, Send, Users, Hash } from 'lucide-react';
import { User as UserType } from '../types.js';

interface Props {
  currentUser: UserType;
}

interface ChatCoworker {
  id: string;
  name: string;
  position?: string;
  approvalStatus?: 'approved' | 'pending';
}

interface ChatMessageItem {
  id: string;
  channel: string;
  senderUserId: string;
  senderName: string;
  content: string;
  createdAt: string;
}

function dmChannelId(a: string, b: string): string {
  return `dm:${[a, b].sort().join(':')}`;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

// [추가] 사내 메신저. 별도 웹소켓 서버 없이 4초 간격 폴링으로 새 메시지를 가져오는
// 방식으로 구현했다 (무료 배포 환경에서도 추가 인프라 없이 바로 동작). "전체" 채널은
// 회사 전체가 보는 팀 채널이고, 동료를 선택하면 1:1 대화가 열린다.
export const TeamChatView: React.FC<Props> = ({ currentUser }) => {
  const [coworkers, setCoworkers] = useState<ChatCoworker[]>([]);
  const [activeChannel, setActiveChannel] = useState<string>('team');
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastIdRef = useRef<string | null>(null);
  const channelRef = useRef(activeChannel);

  useEffect(() => {
    fetch('/api/org/coworkers', { headers: { 'x-user-id': currentUser.id } })
      .then((res) => res.json())
      .then((data: ChatCoworker[]) => {
        if (Array.isArray(data)) {
          setCoworkers(data.filter((u) => u.id !== currentUser.id && u.approvalStatus !== 'pending'));
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id]);

  const loadInitial = (channel: string) => {
    setLoading(true);
    lastIdRef.current = null;
    fetch(`/api/chat/messages?channel=${encodeURIComponent(channel)}`, { headers: { 'x-user-id': currentUser.id } })
      .then((res) => res.json())
      .then((data: ChatMessageItem[]) => {
        if (Array.isArray(data)) {
          setMessages(data);
          if (data.length > 0) lastIdRef.current = data[data.length - 1].id;
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    channelRef.current = activeChannel;
    loadInitial(activeChannel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChannel]);

  // 4초마다 마지막으로 받은 메시지 이후의 새 메시지만 조회해서 이어붙인다.
  useEffect(() => {
    const timer = setInterval(() => {
      const channel = channelRef.current;
      const params = new URLSearchParams({ channel });
      if (lastIdRef.current) params.set('sinceId', lastIdRef.current);
      fetch(`/api/chat/messages?${params.toString()}`, { headers: { 'x-user-id': currentUser.id } })
        .then((res) => res.json())
        .then((data: ChatMessageItem[]) => {
          if (Array.isArray(data) && data.length > 0 && channelRef.current === channel) {
            setMessages((prev) => [...prev, ...data]);
            lastIdRef.current = data[data.length - 1].id;
          }
        })
        .catch(() => {});
    }, 4000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const content = input.trim();
    if (!content) return;
    setSending(true);
    try {
      const res = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': currentUser.id },
        body: JSON.stringify({ channel: activeChannel, content })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '전송하지 못했습니다.');
      setMessages((prev) => [...prev, data]);
      lastIdRef.current = data.id;
      setInput('');
    } catch (err: any) {
      alert(err.message || '전송하지 못했습니다.');
    } finally {
      setSending(false);
    }
  };

  const activeCoworker = activeChannel.startsWith('dm:')
    ? coworkers.find((c) => activeChannel === dmChannelId(currentUser.id, c.id))
    : null;

  return (
    <div className="max-w-4xl mx-auto py-6 px-4">
      <div className="flex items-center gap-2 mb-4">
        <MessagesSquare className="w-5 h-5 text-indigo-500" />
        <h2 className="text-xl font-bold text-slate-900">사내 메신저</h2>
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex h-[70vh] min-h-[420px]">
        <div className="w-48 shrink-0 border-r border-slate-200 bg-slate-50 overflow-y-auto">
          <button
            onClick={() => setActiveChannel('team')}
            className={`w-full flex items-center gap-2 px-3.5 py-2.5 text-xs font-bold text-left transition-colors ${activeChannel === 'team' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            <Hash className="w-3.5 h-3.5" /> 전체 채널
          </button>
          <div className="px-3.5 py-2 text-[10px] font-bold text-slate-400 flex items-center gap-1 mt-1">
            <Users className="w-3 h-3" /> 1:1 대화
          </div>
          {coworkers.map((c) => {
            const channel = dmChannelId(currentUser.id, c.id);
            return (
              <button
                key={c.id}
                onClick={() => setActiveChannel(channel)}
                className={`w-full flex items-center gap-2 px-3.5 py-2.5 text-xs font-bold text-left transition-colors ${activeChannel === channel ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                <span className="truncate">{c.name}</span>
                <span className="text-[10px] font-medium text-slate-400 truncate">{c.position}</span>
              </button>
            );
          })}
          {coworkers.length === 0 && (
            <p className="px-3.5 py-2 text-[11px] text-slate-400">대화할 동료가 없습니다.</p>
          )}
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          <div className="px-4 py-2.5 border-b border-slate-200 text-xs font-bold text-slate-700 shrink-0">
            {activeChannel === 'team' ? '전체 채널' : activeCoworker ? activeCoworker.name : '1:1 대화'}
          </div>
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
            {loading ? (
              <p className="text-center text-xs text-slate-400 py-8">불러오는 중...</p>
            ) : messages.length === 0 ? (
              <p className="text-center text-xs text-slate-400 py-8">아직 메시지가 없습니다. 첫 메시지를 보내보세요.</p>
            ) : (
              messages.map((m) => {
                const isMine = m.senderUserId === currentUser.id;
                return (
                  <div key={m.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] ${isMine ? 'items-end' : 'items-start'} flex flex-col`}>
                      {!isMine && <span className="text-[10px] text-slate-400 mb-0.5 px-1">{m.senderName}</span>}
                      <div className={`px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words ${isMine ? 'bg-indigo-600 text-white rounded-br-sm' : 'bg-slate-100 text-slate-700 rounded-bl-sm'}`}>
                        {m.content}
                      </div>
                      <span className="text-[10px] text-slate-300 mt-0.5 px-1">{formatTime(m.createdAt)}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div className="flex items-center gap-2 p-3 border-t border-slate-200 shrink-0">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="메시지를 입력하세요"
              className="flex-1 text-sm px-3.5 py-2.5 rounded-xl border border-slate-200 outline-none focus:border-indigo-500"
            />
            <button
              onClick={handleSend}
              disabled={sending || !input.trim()}
              className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white transition-colors shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
