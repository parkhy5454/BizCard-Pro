import React, { useState } from 'react';
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
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // 이메일 변경 영역
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [isRequestingEmail, setIsRequestingEmail] = useState(false);
  const [emailMessage, setEmailMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

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
      setSaveMessage({ type: 'ok', text: '프로필이 저장되었습니다.' });
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (error: unknown) {
      setSaveMessage({ type: 'err', text: getErrorMessage(error) || '저장에 실패했습니다.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRequestEmailChange = async () => {
    setIsRequestingEmail(true);
    setEmailMessage(null);
    try {
      const res = await fetch('/api/auth/email/change-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': currentUser.id },
        body: JSON.stringify({ newEmail: newEmail.trim(), password: emailPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '이메일 변경 요청에 실패했습니다.');
      onLocalUserPatch({ pendingEmail: data.pendingEmail });
      setEmailMessage({
        type: 'ok',
        text: `${data.pendingEmail} 주소로 인증 메일을 보냈습니다. 메일의 링크를 눌러야 이메일이 변경됩니다.`,
      });
      setNewEmail('');
      setEmailPassword('');
    } catch (error: unknown) {
      setEmailMessage({ type: 'err', text: getErrorMessage(error) || '이메일 변경 요청에 실패했습니다.' });
    } finally {
      setIsRequestingEmail(false);
    }
  };

  const canRequestEmail = newEmail.trim().length > 0 && emailPassword.length > 0 && !isRequestingEmail;

  return (
    <div className="max-w-2xl mx-auto py-8">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

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

          {/* 이메일 변경: 새 주소로 보낸 인증 링크를 눌러야 실제로 바뀐다 */}
          <div className="space-y-3 pt-4 border-t border-slate-200">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-700">
              <Mail className="w-4 h-4" />
              이메일 (로그인 아이디)
            </h2>
            <input type="email" value={currentUser.email || ''} disabled className={readOnlyClass} aria-label="현재 이메일" />

            {currentUser.pendingEmail && (
              <div className="p-3 rounded-lg text-sm bg-amber-50 text-amber-800 border border-amber-200">
                변경 대기 중: <span className="font-semibold">{currentUser.pendingEmail}</span>
                <br />
                새 주소로 받은 인증 링크를 누르면 변경됩니다. 링크를 누르기 전에는 기존 이메일로 로그인하세요.
              </div>
            )}

            <div className="space-y-2">
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="새 이메일 주소"
                className={inputClass}
              />
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-slate-500 shrink-0" />
                <input
                  type="password"
                  value={emailPassword}
                  onChange={(e) => setEmailPassword(e.target.value)}
                  placeholder="현재 비밀번호 (본인 확인)"
                  className={inputClass}
                />
              </div>
            </div>

            {emailMessage && (
              <div className={`p-3 rounded-lg text-sm font-medium border ${
                emailMessage.type === 'ok'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-rose-50 text-rose-700 border-rose-200'
              }`}>
                {emailMessage.text}
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                disabled={!canRequestEmail}
                onClick={handleRequestEmailChange}
                className="px-5 py-2.5 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors active:scale-95"
              >
                {isRequestingEmail ? '보내는 중...' : '새 이메일로 인증 메일 보내기'}
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
