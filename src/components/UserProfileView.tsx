import React, { useState, useEffect } from 'react';
import { User, Mail, Phone, MapPin, Building2, Save, CheckCircle } from 'lucide-react';
import { User as UserType } from '../types.js';

interface Props {
  currentUser: UserType;
  onUpdate: (updatedData: Partial<UserType>) => Promise<void>;
}

const formatPhoneNumber = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
};

export const UserProfileView: React.FC<Props> = ({ currentUser, onUpdate }) => {
  const [formData, setFormData] = useState({
    name: currentUser.name || '',
    email: currentUser.email || '',
    phone: currentUser.phone || '',
    location: currentUser.location || '',
    company: currentUser.companyName || '',
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    setFormData({
      name: currentUser.name || '',
      email: currentUser.email || '',
      phone: currentUser.phone || '',
      location: currentUser.location || '',
      company: currentUser.companyName || '',
    });
  }, [currentUser.id]);

  const handleInputChange = (field: string, value: string) => {
    if (field === 'phone') {
      setFormData(prev => ({ ...prev, [field]: formatPhoneNumber(value) }));
    } else {
      setFormData(prev => ({ ...prev, [field]: value }));
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage('');
    try {
      await onUpdate(formData);
      setSaveMessage('success');
      setTimeout(() => setSaveMessage(''), 2000);
    } catch (error) {
      setSaveMessage('error');
      console.error('Profile save error:', error);
      setTimeout(() => setSaveMessage(''), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges =
    formData.name !== currentUser.name ||
    formData.email !== currentUser.email ||
    formData.phone !== currentUser.phone ||
    formData.location !== currentUser.location ||
    formData.company !== currentUser.companyName;

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

        {/* 프로필 폼 */}
        <div className="p-6 space-y-5">

          {/* 이름 필드 */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-indigo-600" />
                이름
              </div>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              placeholder="이름을 입력하세요"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none text-slate-800 placeholder-slate-400 transition-all"
            />
          </div>

          {/* 이메일 필드 */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-indigo-600" />
                이메일
              </div>
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
              placeholder="이메일을 입력하세요"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none text-slate-800 placeholder-slate-400 transition-all"
            />
          </div>

          {/* 전화번호 필드 */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700">
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-indigo-600" />
                전화번호
              </div>
            </label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => handleInputChange('phone', e.target.value)}
              placeholder="010-0000-0000"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none text-slate-800 placeholder-slate-400 transition-all"
            />
            <p className="text-xs text-slate-400">자동으로 형식화됩니다 (010-1234-5678)</p>
          </div>

          {/* 위치/지역 필드 */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-indigo-600" />
                위치/지역
              </div>
            </label>
            <input
              type="text"
              value={formData.location}
              onChange={(e) => handleInputChange('location', e.target.value)}
              placeholder="예: 서울, 강남구"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none text-slate-800 placeholder-slate-400 transition-all"
            />
          </div>

          {/* 회사명 필드 */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-indigo-600" />
                회사명
              </div>
            </label>
            <input
              type="text"
              value={formData.company}
              onChange={(e) => handleInputChange('company', e.target.value)}
              placeholder="회사명을 입력하세요"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none text-slate-800 placeholder-slate-400 transition-all"
            />
          </div>

          {/* 메시지 표시 - 저장 성공/실패 */}
          {saveMessage && (
            <div className={`p-4 rounded-lg text-sm font-semibold flex items-center gap-2 animate-pulse ${
              saveMessage === 'success'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-300'
                : 'bg-rose-50 text-rose-700 border border-rose-300'
            }`}>
              {saveMessage === 'success' ? (
                <>
                  <CheckCircle className="w-5 h-5" />
                  <span>✅ 프로필이 저장되었습니다!</span>
                </>
              ) : (
                <>
                  <span>❌ 저장에 실패했습니다. 다시 시도해주세요.</span>
                </>
              )}
            </div>
          )}

        </div>

        {/* 버튼 영역 */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex gap-3 justify-end">
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
    </div>
  );
};
