import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { MessagesSquare, Send, Plus, X, Check, Search, Hash, UsersRound, ChevronLeft, Users, UserPlus, UserMinus, LogOut, Pencil } from 'lucide-react';
import { User as UserType } from '../types.js';

import { getErrorMessage } from '../errorUtils.js';

interface Props {
  currentUser: UserType;
}

interface ChatCoworker {
  id: string;
  name: string;
  position?: string;
  approvalStatus?: 'approved' | 'pending';
  profileImage?: string;
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
  createdByUserId?: string;
}

type RoomKind = 'team' | 'group' | 'dm';

interface RoomItem {
  channel: string;
  kind: RoomKind;
  title: string;
  subtitle: string;
  peerId?: string;
}

const TEAM_CHANNEL = 'team';
const LAST_READ_KEY_PREFIX = 'bizcard-chat-lastread:';
// 같은 사람이 이 시간(5분) 안에 연달아 보낸 메시지는 한 묶음으로 보여준다 (카톡처럼 시간/이름 생략).
const RUN_GAP_MS = 5 * 60 * 1000;
const AVATAR_COLORS = ['bg-rose-400', 'bg-amber-500', 'bg-emerald-500', 'bg-sky-500', 'bg-violet-500', 'bg-teal-500', 'bg-orange-400', 'bg-indigo-500'];

function dmChannelId(a: string, b: string): string {
  return `dm:${[a, b].sort().join(':')}`;
}

function groupChannelId(groupId: string): string {
  return `group:${groupId}`;
}

function avatarColor(seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function readLastRead(userId: string): Record<string, string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(LAST_READ_KEY_PREFIX + userId) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeLastRead(userId: string, map: Record<string, string>): void {
  try {
    localStorage.setItem(LAST_READ_KEY_PREFIX + userId, JSON.stringify(map));
  } catch {
    // 저장 실패(사생활 보호 모드 등)는 무시 - 안 읽음 표시만 정확도가 떨어진다.
  }
}

// 프로필 사진: 가운데를 정사각형으로 잘라 256px JPEG로 줄인다 (서버 저장 용량을 작게 유지).
function resizeToProfileDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('사진을 읽지 못했습니다.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('사진 형식을 확인해주세요.'));
      img.onload = () => {
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('사진을 처리할 수 없습니다.'));
        const side = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

function formatListTime(iso: string): string {
  const d = new Date(iso);
  if (d.toDateString() === new Date().toDateString()) {
    return d.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
  }
  return d.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' });
}

function formatBubbleTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
}

function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
}

function sameDay(a: string, b: string): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

function msBetween(a: string, b: string): number {
  return Math.abs(new Date(b).getTime() - new Date(a).getTime());
}

// 사내 메신저. 별도 웹소켓 서버 없이 폴링으로 동작한다.
// - 모바일: 대화 목록 → 대화방(전체 화면) 두 화면으로 나뉘고, 카카오톡처럼 뒤로가기로 목록에 돌아간다.
// - 데스크톱: 목록과 대화방을 나란히 보여준다.
// - 목록에는 대화별 마지막 메시지, 시간, 안 읽은 개수를 보여준다 (안 읽음 기준은 이 기기의 localStorage).
// - "전체 채널"은 회사 전체, 동료는 1:1 대화, "+"로 2명 이상과 그룹 대화를 만든다.
export const TeamChatView: React.FC<Props> = ({ currentUser }) => {
  const [coworkers, setCoworkers] = useState<ChatCoworker[]>([]);
  const [groups, setGroups] = useState<ChatGroupItem[]>([]);
  const [messagesByChannel, setMessagesByChannel] = useState<Record<string, ChatMessageItem[]>>({});
  const [lastRead, setLastRead] = useState<Record<string, string>>(() => readLastRead(currentUser.id));
  const [activeChannel, setActiveChannel] = useState<string>(TEAM_CHANNEL);
  const [roomOpen, setRoomOpen] = useState(false);
  const [loadingRoom, setLoadingRoom] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState('');
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  const [topInset, setTopInset] = useState(0);

  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [readUpTo, setReadUpTo] = useState<Record<string, string>>({});
  const [typingUsers, setTypingUsers] = useState<{ userId: string; name: string }[]>([]);
  const postedReadRef = useRef<Record<string, string>>({});
  const typingSentRef = useRef(0);
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [groupEditName, setGroupEditName] = useState<string | null>(null);
  const [groupAddIds, setGroupAddIds] = useState<string[] | null>(null);
  const [groupBusy, setGroupBusy] = useState(false);
  const [groupInfoError, setGroupInfoError] = useState('');

  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupMemberIds, setNewGroupMemberIds] = useState<string[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [groupError, setGroupError] = useState('');

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef(messagesByChannel);
  const activeRef = useRef(activeChannel);
  const scrolledChannelRef = useRef<string | null>(null);

  useEffect(() => {
    messagesRef.current = messagesByChannel;
  }, [messagesByChannel]);

  useEffect(() => {
    activeRef.current = activeChannel;
  }, [activeChannel]);

  // 모바일 대화방은 앱 상단 헤더 아래부터 화면 맨 아래(탭바 위까지 덮음)로 펼친다.
  useLayoutEffect(() => {
    const measure = () => {
      setIsMobile(window.innerWidth < 768);
      const header = document.querySelector('header');
      setTopInset(header ? Math.round(header.getBoundingClientRect().bottom) : 0);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const fetchMessages = async (channel: string, sinceId?: string): Promise<ChatMessageItem[]> => {
    const params = new URLSearchParams({ channel });
    if (sinceId) params.set('sinceId', sinceId);
    const res = await fetch(`/api/chat/messages?${params.toString()}`, { headers: { 'x-user-id': currentUser.id } });
    const data = await res.json();
    return res.ok && Array.isArray(data) ? (data as ChatMessageItem[]) : [];
  };

  const loadCoworkers = () => {
    fetch('/api/org/coworkers', { headers: { 'x-user-id': currentUser.id } })
      .then((res) => res.json())
      .then((data: ChatCoworker[]) => {
        if (Array.isArray(data)) {
          // 동료 목록에는 본인도 포함되어 있어서, 본인 사진도 여기서 함께 받아온다.
          setPhotos(Object.fromEntries(data.filter((u) => u.profileImage).map((u) => [u.id, u.profileImage as string])));
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

  const rooms: RoomItem[] = useMemo(() => {
    const list: RoomItem[] = [{ channel: TEAM_CHANNEL, kind: 'team', title: '전체 채널', subtitle: '회사 전체 대화방' }];
    groups.forEach((g) => list.push({ channel: groupChannelId(g.id), kind: 'group', title: g.name, subtitle: `${g.memberUserIds.length}명` }));
    coworkers.forEach((c) => list.push({ channel: dmChannelId(currentUser.id, c.id), kind: 'dm', title: c.name, subtitle: c.position || '', peerId: c.id }));
    return list;
  }, [coworkers, groups, currentUser.id]);

  const roomsKey = rooms.map((r) => r.channel).join('|');
  const listVisible = !isMobile || !roomOpen;

  // 목록에 보이는 모든 대화의 최근 메시지를 가져와 미리보기/안 읽음 계산에 쓴다.
  // 목록이 보일 때만 15초마다 갱신해서 요청 수를 줄인다.
  useEffect(() => {
    if (!listVisible) return;
    let cancelled = false;
    const loadPreviews = async () => {
      const results = await Promise.all(
        rooms.map((r) => fetchMessages(r.channel).then((data) => ({ channel: r.channel, data })).catch(() => ({ channel: r.channel, data: [] as ChatMessageItem[] })))
      );
      if (cancelled) return;
      setMessagesByChannel((prev) => {
        const next = { ...prev };
        results.forEach(({ channel, data }) => { next[channel] = data; });
        return next;
      });
      setLastRead((prev) => {
        let changed = false;
        const next = { ...prev };
        // 처음 보는 대화는 지금까지 온 메시지를 모두 읽은 것으로 본다 (처음 쓰는 날 안 읽음 폭탄 방지)
        results.forEach(({ channel, data }) => {
          if (!next[channel] && data.length > 0) {
            next[channel] = data[data.length - 1].createdAt;
            changed = true;
          }
        });
        if (!changed) return prev;
        writeLastRead(currentUser.id, next);
        return next;
      });
    };
    loadPreviews();
    const timer = setInterval(loadPreviews, 15000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomsKey, listVisible, currentUser.id]);

  // 열려 있는 대화방은 4초마다 새 메시지만 가져와 이어붙인다.
  useEffect(() => {
    const timer = setInterval(async () => {
      const channel = activeRef.current;
      const arr = messagesRef.current[channel] || [];
      const lastId = arr.length ? arr[arr.length - 1].id : undefined;
      const fresh = await fetchMessages(channel, lastId).catch(() => [] as ChatMessageItem[]);
      if (fresh.length === 0 || activeRef.current !== channel) return;
      setMessagesByChannel((prev) => {
        const cur = prev[channel] || [];
        const seen = new Set(cur.map((m) => m.id));
        const added = fresh.filter((m) => !seen.has(m.id));
        if (added.length === 0) return prev;
        return { ...prev, [channel]: [...cur, ...added] };
      });
    }, 4000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id]);

  const openRoom = (channel: string) => {
    setActiveChannel(channel);
    setRoomOpen(true);
    setIsCreatingGroup(false);
    setShowGroupInfo(false);
    scrolledChannelRef.current = null;
    setLoadingRoom(true);
    fetchMessages(channel)
      .then((data) => setMessagesByChannel((prev) => ({ ...prev, [channel]: data })))
      .catch(() => {})
      .finally(() => setLoadingRoom(false));
  };

  const activeMessages = messagesByChannel[activeChannel];
  const roomVisible = roomOpen || !isMobile;

  // 읽음 숫자와 입력 중 상태는 보고 있는 대화방만 3초마다 확인한다.
  useEffect(() => {
    setReadUpTo({});
    setTypingUsers([]);
    if (!roomVisible) return;
    let cancelled = false;
    const poll = () => {
      fetch(`/api/chat/state?channel=${encodeURIComponent(activeChannel)}`, { headers: { 'x-user-id': currentUser.id } })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (cancelled || !data) return;
          setReadUpTo(data.reads || {});
          setTypingUsers(Array.isArray(data.typing) ? data.typing : []);
        })
        .catch(() => {});
    };
    poll();
    const timer = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeChannel, roomVisible, currentUser.id]);

  // 대화방을 보고 있으면 마지막 메시지까지 읽은 것으로 표시한다.
  useEffect(() => {
    if (!roomVisible || isCreatingGroup || !activeMessages || activeMessages.length === 0) return;
    const latest = activeMessages[activeMessages.length - 1].createdAt;
    if (postedReadRef.current[activeChannel] !== latest) {
      postedReadRef.current[activeChannel] = latest;
      fetch('/api/chat/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': currentUser.id },
        body: JSON.stringify({ channel: activeChannel, upTo: latest })
      }).catch(() => {});
    }
    setLastRead((prev) => {
      if (prev[activeChannel] === latest) return prev;
      const next = { ...prev, [activeChannel]: latest };
      writeLastRead(currentUser.id, next);
      return next;
    });
  }, [activeChannel, activeMessages, roomVisible, isCreatingGroup, currentUser.id]);

  // 대화방을 처음 열면 맨 아래로, 이후에는 내가 맨 아래 근처에 있거나 내가 보낸 메시지일 때만 따라 내려간다.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const channelChanged = scrolledChannelRef.current !== activeChannel;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    const last = activeMessages && activeMessages.length ? activeMessages[activeMessages.length - 1] : undefined;
    const lastMine = !!last && last.senderUserId === currentUser.id;
    if (channelChanged || nearBottom || lastMine) el.scrollTop = el.scrollHeight;
    scrolledChannelRef.current = activeChannel;
  }, [activeChannel, activeMessages, roomOpen, isCreatingGroup, currentUser.id]);

  const handleSend = async () => {
    const content = input.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      const res = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': currentUser.id },
        body: JSON.stringify({ channel: activeChannel, content })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '전송하지 못했습니다.');
      setMessagesByChannel((prev) => {
        const cur = prev[activeChannel] || [];
        if (cur.some((m) => m.id === data.id)) return prev;
        return { ...prev, [activeChannel]: [...cur, data] };
      });
      setInput('');
      notifyTyping(false);
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    } catch (err: unknown) {
      alert(getErrorMessage(err) || '전송하지 못했습니다.');
    } finally {
      setSending(false);
    }
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const dataUrl = await resizeToProfileDataUrl(file);
      const res = await fetch('/api/auth/profile-image', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-user-id': currentUser.id },
        body: JSON.stringify({ profileImage: dataUrl })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '프로필 사진을 저장하지 못했습니다.');
      setPhotos((prev) => ({ ...prev, [currentUser.id]: data.profileImage || dataUrl }));
    } catch (err: unknown) {
      alert(getErrorMessage(err) || '프로필 사진을 저장하지 못했습니다.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  // 입력 중 표시: 글을 치는 동안 2.5초마다 한 번씩 알리고, 입력이 비면 바로 끈다.
  const notifyTyping = (typing: boolean) => {
    const now = Date.now();
    if (typing && now - typingSentRef.current < 2500) return;
    if (!typing && typingSentRef.current === 0) return;
    typingSentRef.current = typing ? now : 0;
    fetch('/api/chat/typing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': currentUser.id },
      body: JSON.stringify({ channel: activeChannel, typing })
    }).catch(() => {});
  };

  const autoGrow = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  };

  const toggleNewGroupMember = (id: string) => {
    setNewGroupMemberIds((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));
  };

  const openGroupCreator = () => {
    setNewGroupName('');
    setNewGroupMemberIds([]);
    setGroupError('');
    setIsCreatingGroup(true);
    setRoomOpen(true);
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
      openRoom(groupChannelId(data.id));
    } catch (err: unknown) {
      setGroupError(getErrorMessage(err) || '그룹을 만들지 못했습니다.');
    } finally {
      setCreatingGroup(false);
    }
  };

  const activeGroup = activeChannel.startsWith('group:') ? groups.find((g) => groupChannelId(g.id) === activeChannel) : undefined;

  const nameOf = (userId: string): string => {
    if (userId === currentUser.id) return currentUser.name;
    return coworkers.find((c) => c.id === userId)?.name || '알 수 없는 사용자';
  };

  // 그룹 관리 요청을 보내고, 성공하면 갱신된 그룹을 돌려받는다.
  const runGroupAction = async (body: Record<string, unknown>): Promise<ChatGroupItem | null> => {
    if (!activeGroup) return null;
    setGroupBusy(true);
    setGroupInfoError('');
    try {
      const res = await fetch(`/api/chat/groups/${encodeURIComponent(activeGroup.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-user-id': currentUser.id },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '저장하지 못했습니다.');
      return data as ChatGroupItem;
    } catch (err: unknown) {
      setGroupInfoError(getErrorMessage(err) || '저장하지 못했습니다.');
      return null;
    } finally {
      setGroupBusy(false);
    }
  };

  const applyGroup = (updated: ChatGroupItem) => {
    setGroups((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
  };

  const saveGroupName = async () => {
    const name = (groupEditName || '').trim();
    if (!name) {
      setGroupInfoError('그룹 이름을 입력해주세요.');
      return;
    }
    const updated = await runGroupAction({ action: 'rename', name });
    if (updated) {
      applyGroup(updated);
      setGroupEditName(null);
    }
  };

  const saveGroupAdd = async () => {
    if (!groupAddIds || groupAddIds.length === 0) {
      setGroupInfoError('추가할 동료를 선택해주세요.');
      return;
    }
    const updated = await runGroupAction({ action: 'add', userIds: groupAddIds });
    if (updated) {
      applyGroup(updated);
      setGroupAddIds(null);
    }
  };

  const removeGroupMember = async (userId: string) => {
    if (!window.confirm(`${nameOf(userId)}님을 그룹에서 내보낼까요?`)) return;
    const updated = await runGroupAction({ action: 'remove', userId });
    if (updated) applyGroup(updated);
  };

  const leaveGroup = async () => {
    if (!window.confirm('이 그룹 대화방을 나갈까요? 나가면 대화 목록에서 사라집니다.')) return;
    const updated = await runGroupAction({ action: 'leave' });
    if (updated) {
      setGroups((prev) => prev.filter((g) => g.id !== updated.id));
      setShowGroupInfo(false);
      setRoomOpen(false);
      setActiveChannel(TEAM_CHANNEL);
    }
  };

  const lastOf = (channel: string): ChatMessageItem | undefined => {
    const arr = messagesByChannel[channel];
    return arr && arr.length ? arr[arr.length - 1] : undefined;
  };

  const unreadOf = (channel: string): number => {
    const arr = messagesByChannel[channel] || [];
    const since = lastRead[channel];
    return arr.filter((m) => m.senderUserId !== currentUser.id && (!since || m.createdAt > since)).length;
  };

  // 대화가 있는 방은 최근 메시지 순(팀 채널은 항상 맨 위), 아직 대화가 없는 동료는 따로 모아 보여준다.
  const { chatRooms, contactRooms } = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matches = (r: RoomItem) => !q || r.title.toLowerCase().includes(q) || r.subtitle.toLowerCase().includes(q);
    const teamRoom = rooms.find((r) => r.kind === 'team');
    const others = rooms.filter((r) => r.kind !== 'team' && matches(r));
    const stamp = (channel: string) => {
      const arr = messagesByChannel[channel];
      return arr && arr.length ? arr[arr.length - 1].createdAt : '';
    };
    const withChat = others.filter((r) => r.kind === 'group' || stamp(r.channel) !== '');
    const withoutChat = others.filter((r) => r.kind === 'dm' && stamp(r.channel) === '');
    withChat.sort((a, b) => stamp(b.channel).localeCompare(stamp(a.channel)));
    withoutChat.sort((a, b) => a.title.localeCompare(b.title, 'ko'));
    const chat = teamRoom && matches(teamRoom) ? [teamRoom, ...withChat] : withChat;
    return { chatRooms: chat, contactRooms: withoutChat };
  }, [rooms, messagesByChannel, search]);

  // 읽음 숫자 대상: 1:1은 상대 1명, 그룹은 나를 뺀 멤버. 전체 채널은 인원을 알 수 없어 숫자를 띄우지 않는다.
  const readTargets = useMemo(() => {
    const room = rooms.find((r) => r.channel === activeChannel);
    if (!room) return null;
    if (room.kind === 'dm') return room.peerId ? [room.peerId] : null;
    if (room.kind === 'group') {
      const g = groups.find((item) => groupChannelId(item.id) === activeChannel);
      return g ? g.memberUserIds.filter((id) => id !== currentUser.id) : null;
    }
    return null;
  }, [rooms, groups, activeChannel, currentUser.id]);

  // 이 메시지를 아직 안 읽은 사람 수 (읽은 시각이 메시지 시각 이상이면 읽은 것)
  const unreadFor = (m: ChatMessageItem): number =>
    readTargets ? readTargets.filter((uid) => !(readUpTo[uid] && readUpTo[uid] >= m.createdAt)).length : 0;

  const activeRoom = rooms.find((r) => r.channel === activeChannel);
  const headerTitle = activeRoom ? activeRoom.title : '대화';
  const headerSub = !activeRoom ? '' : activeRoom.kind === 'team' ? '회사 전체 대화방' : activeRoom.kind === 'group' ? `${activeRoom.subtitle} 참여` : activeRoom.subtitle || '1:1 대화';
  const messages = activeMessages || [];

  const renderPerson = (userId: string, name: string, sizeClass: string, textClass: string) =>
    photos[userId] ? (
      <img src={photos[userId]} alt="" className={`${sizeClass} rounded-2xl object-cover shrink-0`} />
    ) : (
      <div className={`${sizeClass} rounded-2xl ${avatarColor(userId)} text-white ${textClass} font-bold flex items-center justify-center shrink-0`}>
        {name.charAt(0)}
      </div>
    );

  const renderAvatar = (room: RoomItem) => {
    if (room.kind === 'team') {
      return (
        <div className="w-12 h-12 rounded-2xl bg-slate-700 text-white flex items-center justify-center shrink-0">
          <Hash className="w-5 h-5" />
        </div>
      );
    }
    if (room.kind === 'group') {
      return (
        <div className="w-12 h-12 rounded-2xl bg-indigo-500 text-white flex items-center justify-center shrink-0">
          <UsersRound className="w-5 h-5" />
        </div>
      );
    }
    return renderPerson(room.peerId || room.channel, room.title, 'w-12 h-12', 'text-lg');
  };

  const renderRow = (room: RoomItem) => {
    const last = lastOf(room.channel);
    const unread = unreadOf(room.channel);
    const isActive = !isMobile && activeChannel === room.channel;
    const preview = last ? last.content.replace(/\s+/g, ' ') : room.kind === 'dm' ? '대화를 시작해 보세요' : '아직 메시지가 없습니다';
    return (
      <button
        key={room.channel}
        onClick={() => openRoom(room.channel)}
        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${isActive ? 'bg-indigo-50' : 'active:bg-slate-100 hover:bg-slate-50'}`}
      >
        {renderAvatar(room)}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5 min-w-0">
            <span className="text-base font-bold text-slate-900 truncate">{room.title}</span>
            {room.subtitle && <span className="text-xs text-slate-400 truncate shrink-0 max-w-[45%]">{room.subtitle}</span>}
          </div>
          <p className="text-sm text-slate-500 truncate mt-0.5">{preview}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0 self-stretch justify-center">
          {last && <span className="text-xs text-slate-400">{formatListTime(last.createdAt)}</span>}
          {unread > 0 && (
            <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-amber-400 text-slate-900 text-xs font-bold flex items-center justify-center">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </div>
      </button>
    );
  };

  // 그룹 정보 패널: 이름 변경, 멤버 보기/추가/내보내기, 나가기
  const renderGroupInfo = (group: ChatGroupItem) => {
    const isOwner = group.createdByUserId === currentUser.id;
    const addable = coworkers.filter((c) => !group.memberUserIds.includes(c.id));
    return (
      <div className="flex-1 min-h-0 overflow-y-auto bg-white p-4 space-y-5">
        <div>
          <p className="text-xs font-bold text-slate-500 mb-2">그룹 이름</p>
          {groupEditName === null ? (
            <div className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3.5 py-3">
              <span className="text-base font-bold text-slate-900 truncate">{group.name}</span>
              <button
                onClick={() => {
                  setGroupInfoError('');
                  setGroupEditName(group.name);
                }}
                className="shrink-0 flex items-center gap-1 text-sm font-bold text-indigo-600 px-2 py-1"
              >
                <Pencil className="w-4 h-4" /> 변경
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                type="text"
                value={groupEditName}
                maxLength={30}
                onChange={(e) => setGroupEditName(e.target.value)}
                className="flex-1 min-w-0 text-base px-3.5 py-2.5 rounded-xl bg-slate-100 outline-none focus:ring-1 focus:ring-indigo-300"
              />
              <button onClick={saveGroupName} disabled={groupBusy} className="shrink-0 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold disabled:opacity-50">
                저장
              </button>
              <button onClick={() => setGroupEditName(null)} className="shrink-0 px-3 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-sm font-bold">
                취소
              </button>
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-slate-500">멤버 {group.memberUserIds.length}명</p>
            {groupAddIds === null && addable.length > 0 && (
              <button
                onClick={() => {
                  setGroupInfoError('');
                  setGroupAddIds([]);
                }}
                className="flex items-center gap-1 text-sm font-bold text-indigo-600"
              >
                <UserPlus className="w-4 h-4" /> 멤버 추가
              </button>
            )}
          </div>

          {groupAddIds !== null && (
            <div className="mb-3 rounded-xl border border-slate-200 divide-y divide-slate-100">
              {addable.map((c) => (
                <label key={c.id} className="flex items-center gap-3 px-3.5 py-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={groupAddIds.includes(c.id)}
                    onChange={() =>
                      setGroupAddIds((prev) => {
                        const cur = prev || [];
                        return cur.includes(c.id) ? cur.filter((id) => id !== c.id) : [...cur, c.id];
                      })
                    }
                    className="w-5 h-5 accent-indigo-600"
                  />
                  <span className="text-base text-slate-800">{c.name}</span>
                  <span className="text-sm text-slate-400">{c.position}</span>
                </label>
              ))}
              <div className="flex gap-2 p-3">
                <button onClick={saveGroupAdd} disabled={groupBusy} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold disabled:opacity-50">
                  추가하기
                </button>
                <button onClick={() => setGroupAddIds(null)} className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-sm font-bold">
                  취소
                </button>
              </div>
            </div>
          )}

          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {group.memberUserIds.map((uid) => (
              <li key={uid} className="flex items-center gap-3 px-3.5 py-3">
                {renderPerson(uid, nameOf(uid), 'w-9 h-9', 'text-sm')}
                <p className="flex-1 min-w-0 text-base font-medium text-slate-900 truncate">
                  {nameOf(uid)}
                  {uid === currentUser.id && <span className="text-xs text-slate-400 ml-1.5">나</span>}
                </p>
                {isOwner && uid !== currentUser.id && (
                  <button onClick={() => removeGroupMember(uid)} disabled={groupBusy} aria-label="내보내기" className="p-2 rounded-lg text-rose-500 active:bg-rose-50 disabled:opacity-50">
                    <UserMinus className="w-4 h-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>

        {groupInfoError && <p className="text-sm text-rose-500">{groupInfoError}</p>}

        <button
          onClick={leaveGroup}
          disabled={groupBusy}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-rose-200 text-rose-600 text-base font-bold active:bg-rose-50 disabled:opacity-50"
        >
          <LogOut className="w-4 h-4" /> 그룹 나가기
        </button>
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto md:py-6 md:px-4">
      <div className="flex items-center gap-2 px-4 pt-4 pb-3 md:px-0 md:pt-0 md:mb-4">
        <MessagesSquare className="w-5 h-5 text-indigo-500" />
        <h2 className="text-xl font-bold text-slate-900">사내 메신저</h2>
      </div>

      <div className="bg-white md:border md:border-slate-200 md:rounded-2xl overflow-hidden flex md:h-[70vh] md:min-h-[420px]">
        {/* 대화 목록 */}
        <aside className={`${roomOpen ? 'hidden md:flex' : 'flex'} w-full md:w-72 md:shrink-0 md:border-r border-slate-200 bg-white flex-col min-h-0`}>
          <div className="flex items-center gap-2 px-3 py-2.5 shrink-0">
            <button
              onClick={() => photoInputRef.current?.click()}
              disabled={uploadingPhoto}
              title="내 프로필 사진 바꾸기"
              className="shrink-0 rounded-2xl active:opacity-70 disabled:opacity-50"
            >
              {renderPerson(currentUser.id, currentUser.name, 'w-10 h-10', 'text-sm')}
            </button>
            <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="이름 검색"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-100 text-base md:text-sm outline-none focus:ring-1 focus:ring-indigo-300"
              />
            </div>
            <button onClick={openGroupCreator} title="그룹 채팅 만들기" className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 shrink-0">
              <Plus className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0 pb-2">
            {chatRooms.length > 0 && <p className="px-4 pt-2 pb-1 text-xs font-bold text-slate-400">대화</p>}
            {chatRooms.map(renderRow)}

            {contactRooms.length > 0 && <p className="px-4 pt-4 pb-1 text-xs font-bold text-slate-400">동료 · {contactRooms.length}명</p>}
            {contactRooms.map(renderRow)}

            {chatRooms.length === 0 && contactRooms.length === 0 && (
              <p className="text-center text-sm text-slate-400 py-10">{search ? '검색 결과가 없습니다.' : '표시할 대화가 없습니다.'}</p>
            )}
          </div>
        </aside>

        {/* 대화방 (모바일에서는 전체 화면으로 덮는다) */}
        <section
          style={isMobile ? { top: topInset, bottom: 0 } : undefined}
          className={`${roomOpen ? 'fixed inset-x-0 z-[100] flex' : 'hidden'} md:flex md:static md:inset-auto md:z-auto md:flex-1 md:min-w-0 flex-col bg-[#b2c7d9] md:bg-slate-50`}
        >
          <div className="flex items-center gap-1 px-2 md:px-4 py-2.5 md:py-3 bg-white border-b border-slate-200 shrink-0">
            <button
              onClick={() => {
                if (isCreatingGroup) setIsCreatingGroup(false);
                else if (showGroupInfo) setShowGroupInfo(false);
                else setRoomOpen(false);
              }}
              className="md:hidden p-2 rounded-full text-slate-700 active:bg-slate-100 shrink-0"
              aria-label="뒤로"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <div className="flex-1 min-w-0 px-1">
              <p className="text-base font-bold text-slate-900 truncate">{isCreatingGroup ? '새 그룹 채팅' : showGroupInfo ? '그룹 정보' : headerTitle}</p>
              {!isCreatingGroup && !showGroupInfo && headerSub && <p className="text-xs text-slate-500 truncate">{headerSub}</p>}
            </div>
            {activeGroup && !isCreatingGroup && (
              <button
                onClick={() => {
                  setShowGroupInfo((v) => !v);
                  setGroupEditName(null);
                  setGroupAddIds(null);
                  setGroupInfoError('');
                }}
                aria-label="그룹 정보"
                className="p-2 rounded-full text-slate-700 active:bg-slate-100 shrink-0"
              >
                <Users className="w-5 h-5" />
              </button>
            )}
          </div>

          {showGroupInfo && activeGroup ? (
            renderGroupInfo(activeGroup)
          ) : isCreatingGroup ? (
            <div className="flex-1 min-h-0 flex flex-col p-4 overflow-y-auto bg-white">
              <div className="hidden md:flex items-center justify-between mb-3">
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
                className="w-full text-base md:text-sm px-3.5 py-3 rounded-xl bg-slate-100 outline-none focus:ring-1 focus:ring-indigo-300 mb-4"
              />
              <p className="text-xs font-bold text-slate-500 mb-2">대화할 동료 선택</p>
              <div className="flex-1 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl mb-4">
                {coworkers.map((c) => (
                  <label key={c.id} className="flex items-center gap-3 px-3.5 py-3 cursor-pointer active:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={newGroupMemberIds.includes(c.id)}
                      onChange={() => toggleNewGroupMember(c.id)}
                      className="w-5 h-5 rounded accent-indigo-600"
                    />
                    <span className="text-base font-medium text-slate-800">{c.name}</span>
                    <span className="text-sm text-slate-400">{c.position}</span>
                  </label>
                ))}
                {coworkers.length === 0 && <p className="text-sm text-slate-400 px-3.5 py-3">초대할 동료가 없습니다.</p>}
              </div>
              {groupError && <p className="text-sm text-rose-500 mb-2">{groupError}</p>}
              <button
                onClick={handleCreateGroup}
                disabled={creatingGroup}
                className="flex items-center justify-center gap-1.5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-base font-bold transition-colors"
              >
                <Check className="w-4 h-4" /> {creatingGroup ? '만드는 중...' : '그룹 만들기'}
              </button>
            </div>
          ) : (
            <>
              <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-3 md:px-5 py-3 md:py-4">
                {loadingRoom && messages.length === 0 ? (
                  <p className="text-center text-sm text-slate-500 py-10">불러오는 중...</p>
                ) : messages.length === 0 ? (
                  <div className="h-full flex items-center justify-center">
                    <p className="text-sm text-slate-600 bg-white/80 rounded-xl px-4 py-2.5 text-center">아직 메시지가 없습니다.<br />첫 메시지를 보내보세요.</p>
                  </div>
                ) : (
                  messages.map((m, i) => {
                    const prev = messages[i - 1];
                    const next = messages[i + 1];
                    const isMine = m.senderUserId === currentUser.id;
                    const showDate = !prev || !sameDay(prev.createdAt, m.createdAt);
                    const unread = isMine ? unreadFor(m) : 0;
                    const startsRun = showDate || prev.senderUserId !== m.senderUserId || msBetween(prev.createdAt, m.createdAt) > RUN_GAP_MS;
                    const endsRun = !next || !sameDay(m.createdAt, next.createdAt) || next.senderUserId !== m.senderUserId || msBetween(m.createdAt, next.createdAt) > RUN_GAP_MS;
                    return (
                      <React.Fragment key={m.id}>
                        {showDate && (
                          <div className="flex justify-center my-3">
                            <span className="text-[11px] text-white md:text-slate-500 bg-black/20 md:bg-slate-200 px-3 py-1 rounded-full">{dayLabel(m.createdAt)}</span>
                          </div>
                        )}
                        <div className={`flex gap-2 ${isMine ? 'justify-end' : 'justify-start'} ${startsRun ? 'mt-3' : 'mt-0.5'}`}>
                          {!isMine && (
                            <div className="w-10 shrink-0">
                              {startsRun && renderPerson(m.senderUserId, m.senderName, 'w-10 h-10', 'text-sm')}
                            </div>
                          )}
                          <div className={`flex flex-col min-w-0 max-w-[75%] md:max-w-[65%] ${isMine ? 'items-end' : 'items-start'}`}>
                            {!isMine && startsRun && <span className="text-xs text-slate-700 mb-1 ml-0.5">{m.senderName}</span>}
                            <div className={`flex items-end gap-1.5 ${isMine ? 'flex-row-reverse' : ''}`}>
                              <div className={`px-3 py-2 rounded-2xl text-[15px] leading-relaxed whitespace-pre-wrap break-words shadow-sm ${isMine ? 'bg-[#fee500] text-slate-900 rounded-tr-sm' : 'bg-white text-slate-900 rounded-tl-sm'}`}>
                                {m.content}
                              </div>
                              {(unread > 0 || endsRun) && (
                                <div className={`flex flex-col shrink-0 mb-0.5 ${isMine ? 'items-end' : 'items-start'}`}>
                                  {unread > 0 && <span className="text-[11px] font-bold text-amber-700 leading-none">{unread}</span>}
                                  {endsRun && <span className="text-[10px] text-slate-600 md:text-slate-400 leading-tight">{formatBubbleTime(m.createdAt)}</span>}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })
                )}
              </div>

              {typingUsers.length > 0 && (
                <p className="px-4 py-1 text-xs text-slate-600 bg-white/80 shrink-0">{typingUsers.map((u) => u.name).join(', ')} 입력 중...</p>
              )}
              <div className="flex items-end gap-2 px-2.5 md:px-4 py-2 md:py-3 bg-white border-t border-slate-200 shrink-0 pb-[max(env(safe-area-inset-bottom),0.5rem)] md:pb-3">
                <textarea
                  ref={textareaRef}
                  rows={1}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    autoGrow(e.target);
                    notifyTyping(e.target.value.trim().length > 0);
                  }}
                  onKeyDown={(e) => {
                    // PC에서는 Enter 전송, Shift+Enter 줄바꿈. 모바일은 Enter가 줄바꿈이고 전송 버튼으로 보낸다.
                    if (!isMobile && e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="메시지를 입력하세요"
                  className="flex-1 resize-none text-base md:text-sm px-3.5 py-2.5 rounded-2xl bg-slate-100 outline-none focus:ring-1 focus:ring-indigo-300 leading-snug max-h-32"
                />
                <button
                  onClick={handleSend}
                  disabled={sending || !input.trim()}
                  aria-label="보내기"
                  className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition-colors ${input.trim() ? 'bg-[#fee500] text-slate-900' : 'bg-slate-200 text-slate-400'}`}
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
};
