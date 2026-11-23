import React, { useMemo, useState } from 'react';
import { useDraftAutosave } from '../hooks/useDraftAutosave.js';
import { DraftPromptBanner } from './DraftPromptBanner.js';
import { User, Mail, Phone, Building2, Briefcase, Lock, Save } from 'lucide-react';
import { User as UserType } from '../types.js';

import { getErrorMessage } from '../errorUtils.js';
interface Props {
  currentUser: UserType;
  // 이름/전화/직책 저장. 서버에 저장되고, 실패하면 예외를 던진다.
  onUpdate: (updatedData: Partial<UserType>) => Promise<void>;
  // 서버 저장이 필요 없는 상태(예: 이메일 변경 대기 중 표시)만 화면에 반영한다.
  onLocalUserPatch: (patch: Partial<UserType>) => void;
}

const formatPhoneNumber = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
};

const inputClass =
  'w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none text-slate-800 placeholder-slate-400 transition-all';
const readOnlyClass =
  'w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-100 text-slate-600 cursor-not-allowed text-sm';
const labelClass = 'flex items-center gap-2 text-sm font-semibold text-slate-700';

export const UserProfileView: React.FC<Props> = ({ currentUser, onUpdate, onLocalUserPatch }) => {
  const isCompany = currentUser.type === 'company';

  // 저장 가능한 항목: 이름, 전화, 직책(회사 소속만)
  const [formData, setFormData] = useState({
    name: currentUser.name || '',
    phone: currentUser.phone || '',
    position: currentUser.position || '',
  });
  // [추가] 프로필 편집 중 임시 저장 (서버 보관 - 다른 기기에서도 이어서 수정)
  const profileDraftSnapshot = useMemo(() => ({ ...formData }), [formData]);
  const profileDraft = useDraftAutosave<typeof profileDraftSnapshot>({
    value: profileDraftSnapshot,
    setValue: (u) => { const n = u(profileDraftSnapshot); if (n) setFormData({ name: n.name, phone: n.phone, position: n.position }); },
    keyOf: () => 'user-profile',
    userId: currentUser.id,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // 이메일 변경 영역
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [newPwdConfirm, setNewPwdConfirm] = useState('');
  const [isChangingPwd, setIsChangingPwd] = useState(false);
  const [pwdMessage, setPwdMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const hasChanges =
    formData.name.trim() !== (currentUser.name || '') ||
    formData.phone !== (currentUser.phone || '') ||
    (isCompany && formData.position.trim() !== (currentUser.position || ''));

  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage(null);
    try {
      await onUpdate({
        name: formData.name.trim(),
        phone: formData.phone.trim() || undefined,
        ...(isCompany ? { position: formData.position.trim() || undefined } : {}),
      });
      profileDraft.discardOpen();
      setSaveMessage({ type: 'ok', text: '프로필이 저장되었습니다.' });
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (error: unknown) {
      setSaveMessage({ type: 'err', text: getErrorMessage(error) || '저장에 실패했습니다.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPwd !== newPwdConfirm) {
      setPwdMessage({ type: 'err', text: '새 비밀번호 확인이 일치하지 않습니다.' });
      return;
    }
    setIsChangingPwd(true);
    setPwdMessage(null);
    try {
      const res = await fetch('/api/auth/password/change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': currentUser.id },
        body: JSON.stringify({ currentPassword: currentPwd, newPassword: newPwd }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '비밀번호 변경에 실패했습니다.');
      setPwdMessage({ type: 'ok', text: '비밀번호가 변경되었습니다. 다음 로그인부터 새 비밀번호를 사용하세요.' });
      setCurrentPwd('');
      setNewPwd('');
      setNewPwdConfirm('');
    } catch (error: unknown) {
      setPwdMessage({ type: 'err', text: getErrorMessage(error) || '비밀번호 변경에 실패했습니다.' });
    } finally {
      setIsChangingPwd(false);
    }
  };

  const canChangePwd = currentPwd.length > 0 && newPwd.length > 0 && newPwdConfirm.length > 0 && !isChangingPwd;

  return (
    <div className="max-w-2xl mx-auto py-8">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* [추가] 임시 저장된 수정 내용이 있으면 이어서 쓸지 묻는다 */}
        <div className="p-4"><DraftPromptBanner prompt={profileDraft.prompt} onRestore={profileDraft.restore} onDismiss={profileDraft.dismiss} /></div>

        {/* 헤더 */}
        <div className="bg-gradient-to-r from-indigo-50 to-blue-50 px-6 py-6 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
              <User className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800">프로필 설정</h1>
              <p className="text-xs text-slate-500">내 정보 및 연락처 관리</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">

          {/* 기본 정보: 저장 버튼으로 서버에 저장 */}
          <div className="space-y-5">
            <div className="space-y-2">
              <label className={labelClass}>
                <User className="w-4 h-4 text-indigo-600" />
                이름
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="이름을 입력하세요"
                className={inputClass}
              />
            </div>

            <div className="space-y-2">
              <label className={labelClass}>
                <Phone className="w-4 h-4 text-indigo-600" />
                전화번호
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData(prev => ({ ...prev, phone: formatPhoneNumber(e.target.value) }))}
                placeholder="010-0000-0000"
                className={inputClass}
              />
              <p className="text-xs text-slate-400">자동으로 형식화됩니다 (010-1234-5678)</p>
            </div>

            {isCompany && (
              <div className="space-y-2">
                <label className={labelClass}>
                  <Briefcase className="w-4 h-4 text-indigo-600" />
                  직책
                </label>
                <input
                  type="text"
                  value={formData.position}
                  onChange={(e) => setFormData(prev => ({ ...prev, position: e.target.value }))}
                  placeholder="예: 영업팀 과장"
                  className={inputClass}
                />
              </div>
            )}

            {saveMessage && (
              <div className={`p-3 rounded-lg text-sm font-medium border ${
                saveMessage.type === 'ok'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-rose-50 text-rose-700 border-rose-200'
              }`}>
                {saveMessage.text}
              </div>
            )}

            <div className="flex justify-end">
              <button
                disabled={isSaving || !hasChanges}
                onClick={handleSave}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors active:scale-95"
              >
                <Save className="w-4 h-4" />
                {isSaving ? '저장 중...' : '저장하기'}
              </button>
            </div>
          </div>

          {/* 회사 정보: 회원가입 때 정한 값이라 여기서는 읽기 전용 */}
          {isCompany && (
            <div className="space-y-3 pt-4 border-t border-slate-200">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-700">
                <Building2 className="w-4 h-4" />
                회사 정보
              </h2>
              <input type="text" value={currentUser.companyName || ''} disabled className={readOnlyClass} aria-label="회사명" />
              <input type="text" value={currentUser.businessNumber || ''} disabled className={readOnlyClass} aria-label="사업자등록번호" />
              <p className="text-xs text-slate-500">
                회사명과 사업자등록번호는 여기서 바꿀 수 없습니다. 변경이 필요하면 관리자에게 문의해주세요.
              </p>
            </div>
          )}

          {/* 이메일(로그인 아이디)은 표시만 하고, 비밀번호는 본인이 직접 바꾼다 */}
          <div className="space-y-3 pt-4 border-t border-slate-200">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-700">
              <Mail className="w-4 h-4" />
              이메일 (로그인 아이디)
            </h2>
            <input type="email" value={currentUser.email || ''} disabled className={readOnlyClass} aria-label="현재 이메일" />
          </div>

          <div className="space-y-3 pt-4 border-t border-slate-200">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-700">
              <Lock className="w-4 h-4" />
              비밀번호 변경
            </h2>
            <div className="space-y-2">
              <input
                type="password"
                value={currentPwd}
                onChange={(e) => setCurrentPwd(e.target.value)}
                placeholder="현재 비밀번호"
                className={inputClass}
              />
              <input
                type="password"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                placeholder="새 비밀번호 (8자 이상)"
                className={inputClass}
              />
              <input
                type="password"
                value={newPwdConfirm}
                onChange={(e) => setNewPwdConfirm(e.target.value)}
                placeholder="새 비밀번호 확인"
                className={inputClass}
              />
            </div>

            {pwdMessage && (
              <div className={`p-3 rounded-lg text-sm font-medium border ${
                pwdMessage.type === 'ok'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-rose-50 text-rose-700 border-rose-200'
              }`}>
                {pwdMessage.text}
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                disabled={!canChangePwd}
                onClick={handleChangePassword}
                className="px-5 py-2.5 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors active:scale-95"
              >
                {isChangingPwd ? '변경 중...' : '비밀번호 변경'}
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
