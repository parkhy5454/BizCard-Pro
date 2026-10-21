import React, { useState } from 'react';
import { User as UserType } from '../types.js';
import { User, Briefcase, Phone, Mail, Building2, AlertCircle, Check } from 'lucide-react';

interface Props {
  currentUser: UserType | null;
  onUserUpdate: (user: UserType) => void;
}

export const ProfileSettingsView: React.FC<Props> = ({ currentUser, onUserUpdate }) => {
  const [name, setName] = useState(currentUser?.name || '');
  const [position, setPosition] = useState(currentUser?.position || '');
  const [phone, setPhone] = useState(currentUser?.phone || '');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-User-ID': currentUser?.id || ''
        },
        body: JSON.stringify({
          name: name.trim(),
          position: position.trim(),
          phone: phone.trim() || undefined
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '정보 업데이트에 실패했습니다.');
      }

      setMessage({ type: 'success', text: '프로필이 성공적으로 업데이트되었습니다!' });
      if (currentUser) {
        onUserUpdate({
          ...currentUser,
          name,
          position,
          phone
        });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || '정보 업데이트 중 오류가 발생했습니다.' });
    } finally {
      setLoading(false);
    }
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-slate-400 mx-auto mb-4" />
          <p className="text-slate-600">로그인 후 프로필을 수정할 수 있습니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="max-w-2xl mx-auto">
        {/* 헤더 */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">프로필 설정</h1>
          <p className="text-slate-600">회원 정보를 수정할 수 있습니다.</p>
        </div>

        {/* 카드 */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8">
          {/* 메시지 */}
          {message && (
            <div
              className={`mb-6 p-4 rounded-xl flex items-center gap-3 ${
                message.type === 'success'
                  ? 'bg-emerald-50 border border-emerald-200'
                  : 'bg-red-50 border border-red-200'
              }`}
            >
              {message.type === 'success' ? (
                <Check className="w-5 h-5 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
              )}
              <span
                className={message.type === 'success' ? 'text-emerald-700' : 'text-red-700'}
              >
                {message.text}
              </span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* 이메일 (읽기 전용) */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">
                <Mail className="inline w-4 h-4 mr-2" />
                이메일
              </label>
              <input
                type="email"
                value={currentUser.email}
                disabled
                className="w-full px-4 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-slate-600 cursor-not-allowed"
              />
              <p className="mt-1 text-xs text-slate-500">이메일은 변경할 수 없습니다.</p>
            </div>

            {/* 이름 */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">
                <User className="inline w-4 h-4 mr-2" />
                이름 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 박현용"
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>

            {/* 직책 */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">
                <Briefcase className="inline w-4 h-4 mr-2" />
                직책 <span className="text-slate-400">(선택)</span>
              </label>
              <input
                type="text"
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                placeholder="예: 대표이사, 기술이사, 경영지원실장"
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* 휴대폰 */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">
                <Phone className="inline w-4 h-4 mr-2" />
                휴대폰 번호 <span className="text-slate-400">(선택)</span>
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="010-0000-0000"
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* 회사 정보 (읽기 전용) */}
            {currentUser.type === 'company' && (
              <>
                <hr className="border-slate-200" />
                <div className="space-y-4 pt-2">
                  <h3 className="font-bold text-slate-700 flex items-center gap-2">
                    <Building2 className="w-4 h-4" />
                    회사 정보
                  </h3>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      회사명
                    </label>
                    <input
                      type="text"
                      value={currentUser.companyName || ''}
                      disabled
                      className="w-full px-4 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-slate-600 cursor-not-allowed text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      사업자등록번호
                    </label>
                    <input
                      type="text"
                      value={currentUser.businessNumber || ''}
                      disabled
                      className="w-full px-4 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-slate-600 cursor-not-allowed text-sm"
                    />
                  </div>
                  <p className="text-xs text-slate-500">
                    회사 정보는 변경할 수 없습니다. 변경이 필요하면 관리자에게 문의해주세요.
                  </p>
                </div>
              </>
            )}

            {/* 제출 버튼 */}
            <div className="flex gap-3 pt-6">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-400 text-white font-bold py-3 px-4 rounded-xl transition-colors"
              >
                {loading ? '저장 중...' : '저장하기'}
              </button>
            </div>
          </form>
        </div>

        {/* 안내 */}
        <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-xl">
          <p className="text-sm text-blue-800">
            <span className="font-semibold">💡 팁:</span> 프로필 정보는 언제든지 수정할 수 있습니다.
          </p>
        </div>
      </div>
    </div>
  );
};
