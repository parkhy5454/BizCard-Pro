import React, { useEffect, useRef, useState } from 'react';
import { MessagesSquare, Send, Users, Hash, UsersRound, Plus, X, Check } from 'lucide-react';
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

interface ChatGroupItem {
  id: string;
  name: string;
  memberUserIds: string[];
}

function dmChannelId(a: string, b: string): string {
  return `dm:${[a, b].sort().join(':')}`;
}

function groupChannelId(groupId: string): string {
  return `group:${groupId}`;
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
// 회사 전체가 보는 팀 채널, 동료를 선택하면 1:1 대화, "그룹 채팅 만들기"로 2명 이상을
// 골라 이름을 붙인 소그룹 대화방도 만들 수 있다 (부서/프로젝트 단위 대화용).
export const TeamChatView: React.FC<Props> = ({ currentUser }) => {
  const [coworkers, setCoworkers] = useState<ChatCoworker[]>([]);
  const [groups, setGroups] = useState<ChatGroupItem[]>([]);
  const [activeChannel, setActiveChannel] = useState<string>('team');
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastIdRef = useRef<string | null>(null);
  const channelRef = useRef(activeChannel);

  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupMemberIds, setNewGroupMemberIds] = useState<string[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [groupError, setGroupError] = useState('');

  const loadCoworkers = () => {
    fetch('/api/org/coworkers', { headers: { 'x-user-id': currentUser.id } })
      .then((res) => res.json())
      .then((data: ChatCoworker[]) => {
        if (Array.isArray(data)) {
          setCoworkers(data.filter((u) => u.id !== currentUser.id && u.approvalStatus !== 'pending'));
        }
      })
      .catch(() => {});
  };

  const loadGroups = () => {
    fetch('/api/chat/groups', { headers: { 'x-user-id': currentUser.id } })
      .then((res) => res.json())
      .then((data: ChatGroupItem[]) => {
        if (Array.isArray(data)) setGroups(data);
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadCoworkers();
    loadGroups();
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

  const toggleNewGroupMember = (id: string) => {
    setNewGroupMemberIds((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));
  };

  const openGroupCreator = () => {
    setNewGroupName('');
    setNewGroupMemberIds([]);
    setGroupError('');
    setIsCreatingGroup(true);
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) {
      setGroupError('그룹 이름을 입력해주세요.');
      return;
    }
    if (newGroupMemberIds.length === 0) {
      setGroupError('대화할 동료를 1명 이상 선택해주세요.');
      return;
    }
    setCreatingGroup(true);
    setGroupError('');
    try {
      const res = await fetch('/api/chat/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': currentUser.id },
        body: JSON.stringify({ name: newGroupName.trim(), memberUserIds: newGroupMemberIds })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '그룹을 만들지 못했습니다.');
      setGroups((prev) => [...prev, data]);
      setIsCreatingGroup(false);
      setActiveChannel(groupChannelId(data.id));
    } catch (err: any) {
      setGroupError(err.message || '그룹을 만들지 못했습니다.');
    } finally {
      setCreatingGroup(false);
    }
  };

  const activeCoworker = activeChannel.startsWith('dm:')
    ? coworkers.find((c) => activeChannel === dmChannelId(currentUser.id, c.id))
    : null;
  const activeGroup = activeChannel.startsWith('group:')
    ? groups.find((g) => activeChannel === groupChannelId(g.id))
    : null;

  const headerLabel = activeChannel === 'team' ? '전체 채널' : activeCoworker ? activeCoworker.name : activeGroup ? activeGroup.name : '대화';

  return (
    <div className="max-w-4xl mx-auto py-6 px-4">
      <div className="flex items-center gap-2 mb-4">
        <MessagesSquare className="w-5 h-5 text-indigo-500" />
        <h2 className="text-xl font-bold text-slate-900">사내 메신저</h2>
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex h-[70vh] min-h-[420px]">
        <div className="w-52 shrink-0 border-r border-slate-200 bg-slate-50 overflow-y-auto">
          <button
            onClick={() => setActiveChannel('team')}
            className={`w-full flex items-center gap-2 px-3.5 py-2.5 text-xs font-bold text-left transition-colors ${activeChannel === 'team' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            <Hash className="w-3.5 h-3.5" /> 전체 채널
          </button>

          <div className="px-3.5 py-2 mt-1 flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
              <UsersRound className="w-3 h-3" /> 그룹 채팅
            </span>
            <button onClick={openGroupCreator} title="새 그룹 채팅 만들기" className="p-0.5 rounded hover:bg-slate-200 text-slate-500">
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
          {groups.map((g) => {
            const channel = groupChannelId(g.id);
            return (
              <button
                key={g.id}
                onClick={() => setActiveChannel(channel)}
                className={`w-full flex items-center gap-2 px-3.5 py-2.5 text-xs font-bold text-left transition-colors ${activeChannel === channel ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                <span className="truncate">{g.name}</span>
                <span className="text-[10px] font-medium text-slate-400 shrink-0">{g.memberUserIds.length}명</span>
              </button>
            );
          })}
          {groups.length === 0 && (
            <p className="px-3.5 py-1.5 text-[11px] text-slate-400">만든 그룹이 없습니다.</p>
          )}

          <div className="px-3.5 py-2 mt-1 text-[10px] font-bold text-slate-400 flex items-center gap-1">
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
          {isCreatingGroup ? (
            <div className="flex-1 flex flex-col p-4 overflow-y-auto">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-800">새 그룹 채팅 만들기</h3>
                <button onClick={() => setIsCreatingGroup(false)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="그룹 이름 (예: 강남프로젝트 TF)"
                className="w-full text-sm px-3 py-2.5 rounded-xl border border-slate-200 outline-none focus:border-indigo-500 mb-3"
              />
              <p className="text-[11px] font-bold text-slate-500 mb-1.5">대화할 동료 선택</p>
              <div className="flex-1 overflow-y-auto space-y-1 border border-slate-200 rounded-xl p-2 mb-3">
                {coworkers.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      checked={newGroupMemberIds.includes(c.id)}
                      onChange={() => toggleNewGroupMember(c.id)}
                      className="rounded"
                    />
                    <span className="font-medium text-slate-700">{c.name}</span>
                    <span className="text-slate-400">{c.position}</span>
                  </label>
                ))}
                {coworkers.length === 0 && <p className="text-[11px] text-slate-400 px-2 py-1.5">초대할 동료가 없습니다.</p>}
              </div>
              {groupError && <p className="text-xs text-rose-500 mb-2">{groupError}</p>}
              <button
                onClick={handleCreateGroup}
                disabled={creatingGroup}
                className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold transition-colors"
              >
                <Check className="w-3.5 h-3.5" /> {creatingGroup ? '만드는 중...' : '그룹 만들기'}
              </button>
            </div>
          ) : (
            <>
              <div className="px-4 py-2.5 border-b border-slate-200 text-xs font-bold text-slate-700 shrink-0">
                {headerLabel}
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
            </>
          )}
        </div>
      </div>
    </div>
  );
};
