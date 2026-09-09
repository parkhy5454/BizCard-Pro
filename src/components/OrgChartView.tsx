import React, { useEffect, useMemo, useState } from 'react';
import { Network, RefreshCw, User as UserIcon, Crown, Pencil, X, Check } from 'lucide-react';
import { User as UserType } from '../types.js';

interface Props {
  currentUser: UserType;
}

interface OrgMember {
  id: string;
  name: string;
  email: string;
  phone?: string;
  position?: string;
  role?: 'admin' | 'member';
  department?: string;
  managerUserId?: string;
  approvalStatus?: 'approved' | 'pending';
}

// [추가] 조직도 화면. 그룹웨어(다우오피스/하이웍스 등) 대비 부족했던 핵심 기능 중 하나.
// 별도 테이블 없이 기존 회원 정보(department, managerUserId)만으로 트리를 그린다 —
// 이 두 필드는 이번에 User 타입에 새로 추가했고, 값을 아직 아무도 입력하지 않은
// 상태(undefined)에서는 전원이 "미배정" 취급되어 최상위에 나란히 표시된다.
export const OrgChartView: React.FC<Props> = ({ currentUser }) => {
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDept, setEditDept] = useState('');
  const [editManagerId, setEditManagerId] = useState('');
  const [saving, setSaving] = useState(false);

  const isAdmin = currentUser.role === 'admin';

  const loadMembers = () => {
    setLoading(true);
    setError('');
    fetch('/api/auth/users', { headers: { 'x-user-id': currentUser.id } })
      .then(async (res) => {
        if (!res.ok) throw new Error('조직도 데이터를 불러오지 못했습니다.');
        return res.json();
      })
      .then((data: OrgMember[]) => {
        // 승인 대기 중인 사람은 아직 정식 소속이 아니므로 조직도에서는 제외한다.
        setMembers(Array.isArray(data) ? data.filter((m) => m.approvalStatus !== 'pending') : []);
      })
      .catch((err) => setError(err.message || '조직도 데이터를 불러오지 못했습니다.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id]);

  // managerUserId가 목록에 없는 사람을 가리키거나(퇴사 등) 비어있으면 최상위로 취급.
  const childrenByManager = useMemo(() => {
    const map = new Map<string, OrgMember[]>();
    const ids = new Set(members.map((m) => m.id));
    for (const m of members) {
      const key = m.managerUserId && ids.has(m.managerUserId) && m.managerUserId !== m.id ? m.managerUserId : '__root__';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    // 관리자를 먼저, 그다음 이름순
    for (const list of map.values()) {
      list.sort((a, b) => {
        if ((a.role === 'admin') !== (b.role === 'admin')) return a.role === 'admin' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    }
    return map;
  }, [members]);

  const startEdit = (m: OrgMember) => {
    setEditingId(m.id);
    setEditDept(m.department || '');
    setEditManagerId(m.managerUserId || '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDept('');
    setEditManagerId('');
  };

  const saveEdit = async (memberId: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/auth/users/${memberId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-user-id': currentUser.id },
        body: JSON.stringify({ department: editDept.trim(), managerUserId: editManagerId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '저장하지 못했습니다.');
      setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, department: data.user.department, managerUserId: data.user.managerUserId } : m)));
      cancelEdit();
    } catch (err: any) {
      alert(err.message || '저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  // 순환 참조(A의 상사가 B, B의 상사가 A인 경우) 방어를 위해 방문한 id를 추적하며 재귀 렌더링.
  const renderNode = (m: OrgMember, visited: Set<string>, depth: number): React.ReactNode => {
    if (visited.has(m.id)) return null;
    const nextVisited = new Set(visited).add(m.id);
    const children = childrenByManager.get(m.id) || [];
    const isEditing = editingId === m.id;

    return (
      <div key={m.id} className="relative">
        <div className="flex items-start gap-2.5 py-2">
          <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
            {m.role === 'admin' ? <Crown className="w-4 h-4 text-amber-500" /> : <UserIcon className="w-4 h-4 text-indigo-500" />}
          </div>
          <div className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5">
            {!isEditing ? (
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-800 truncate">
                    {m.name} <span className="text-xs font-medium text-slate-500">{m.position || '직책없음'}</span>
                  </p>
                  <p className="text-[11px] text-slate-500 truncate">
                    {m.department || '부서 미배정'} · {m.email}{m.phone ? ` · ${m.phone}` : ''}
                  </p>
                </div>
                {isAdmin && (
                  <button
                    onClick={() => startEdit(m)}
                    className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-[11px] font-bold text-slate-600 transition-colors"
                  >
                    <Pencil className="w-3 h-3" /> 배치 수정
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  type="text"
                  value={editDept}
                  onChange={(e) => setEditDept(e.target.value)}
                  placeholder="부서명 (예: 영업1팀)"
                  className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 outline-none focus:border-indigo-500"
                />
                <select
                  value={editManagerId}
                  onChange={(e) => setEditManagerId(e.target.value)}
                  className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 outline-none focus:border-indigo-500 bg-white"
                >
                  <option value="">직속 상사 없음 (최상위)</option>
                  {members.filter((cand) => cand.id !== m.id).map((cand) => (
                    <option key={cand.id} value={cand.id}>{cand.name} ({cand.position || '직책없음'})</option>
                  ))}
                </select>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => saveEdit(m.id)}
                    disabled={saving}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-[11px] font-bold transition-colors"
                  >
                    <Check className="w-3 h-3" /> 저장
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-[11px] font-bold text-slate-600 transition-colors"
                  >
                    <X className="w-3 h-3" /> 취소
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        {children.length > 0 && (
          <div className="ml-[18px] pl-[18px] border-l-2 border-dashed border-slate-200 space-y-0.5">
            {children.map((child) => renderNode(child, nextVisited, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const roots = childrenByManager.get('__root__') || [];

  return (
    <div className="max-w-3xl mx-auto py-6 px-4 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Network className="w-5 h-5 text-indigo-500" />
          <h2 className="text-xl font-bold text-slate-900">조직도</h2>
        </div>
        <button
          onClick={loadMembers}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-bold text-slate-600 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" /> 새로고침
        </button>
      </div>

      {isAdmin && (
        <p className="text-xs text-slate-400">
          "배치 수정"으로 각 팀원의 부서와 직속 상사를 지정하면, 그 아래에 자동으로 소속되어 표시됩니다.
        </p>
      )}

      {loading ? (
        <div className="text-center py-12 text-sm text-slate-400">불러오는 중...</div>
      ) : error ? (
        <div className="text-center py-12 text-sm text-rose-500 bg-rose-50 rounded-2xl border border-dashed border-rose-200">{error}</div>
      ) : roots.length === 0 ? (
        <div className="text-center py-16 text-sm text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
          표시할 조직 구성원이 없습니다.
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          {roots.map((m) => renderNode(m, new Set(), 0))}
        </div>
      )}
    </div>
  );
};
