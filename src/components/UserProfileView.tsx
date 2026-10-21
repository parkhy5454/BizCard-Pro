import React, { useState } from 'react';
import { User, Mail, Phone, MapPin, Building2, Save, X } from 'lucide-react';
import { User as UserType } from '../types.js';

interface Props {
  currentUser: UserType;
  onUpdate?: (updatedUser: Partial<UserType>) => void;
}

export const UserProfileView: React.FC<Props> = ({ currentUser, onUpdate }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    name: currentUser.name || '',
    phone: currentUser.phone || '',
    email: currentUser.email || '',
    location: currentUser.location || '',
    company: currentUser.company || '',
  });

  // 전화번호 포맷팅 함수 (010-1234-5678 형식)
  const formatPhoneNumber = (value: string): string => {
    // 숫자만 추출
    const numbers = value.replace(/\D/g, '');

    // 길이에 따라 포맷팅
    if (numbers.length <= 3) return numbers;
    if (numbers.length <= 7) return `${numbers.slice(0, 3)}-${numbers.slice(3)}`;
    return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7, 11)}`;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    if (name === 'phone') {
      // 전화번호는 포맷팅 적용
      setFormData(prev => ({ ...prev, [name]: formatPhoneNumber(value) }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSave = () => {
    onUpdate?.(formData);
    setIsEditing(false);
  };

  return (
    <div className="min-h-[calc(100vh-200px)] bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-2xl mx-auto">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-slate-900">프로필 설정</h1>
          <button
            onClick={() => setIsEditing(!isEditing)}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              isEditing
                ? 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                : 'bg-indigo-600 text-white hover:bg-indigo-700'
            }`}
          >
            {isEditing ? '취소' : '수정'}
          </button>
        </div>

        {/* 프로필 카드 */}
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          {/* 프로필 헤더 배경 */}
          <div className="h-32 bg-gradient-to-r from-indigo-500 to-indigo-600" />

          {/* 프로필 정보 */}
          <div className="px-8 pb-8">
            {/* 프로필 이미지 영역 */}
            <div className="flex items-end gap-4 -mt-16 mb-8">
              <div className="w-24 h-24 rounded-full bg-indigo-100 border-4 border-white flex items-center justify-center shadow-md">
                {currentUser.profileImage ? (
                  <img src={currentUser.profileImage} alt={currentUser.name} className="w-full h-full rounded-full object-cover" />
                ) : (
                  <User className="w-12 h-12 text-indigo-500" />
                )}
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-900">{currentUser.name}</h2>
                <p className="text-slate-500">{currentUser.email}</p>
              </div>
            </div>

            {/* 정보 필드들 */}
            <div className="space-y-6">
              {/* 이름 */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">이름</label>
                {isEditing ? (
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                ) : (
                  <p className="text-slate-700">{currentUser.name}</p>
                )}
              </div>

              {/* 이메일 */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Mail className="w-4 h-4 text-slate-500" />
                  <label className="text-sm font-semibold text-slate-700">이메일</label>
                </div>
                {isEditing ? (
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                ) : (
                  <p className="text-slate-700">{currentUser.email}</p>
                )}
              </div>

              {/* 전화번호 */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Phone className="w-4 h-4 text-slate-500" />
                  <label className="text-sm font-semibold text-slate-700">전화번호</label>
                </div>
                {isEditing ? (
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="01012345678"
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                ) : (
                  <p className="text-slate-700">{currentUser.phone || '미등록'}</p>
                )}
              </div>

              {/* 주소 */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <MapPin className="w-4 h-4 text-slate-500" />
                  <label className="text-sm font-semibold text-slate-700">주소</label>
                </div>
                {isEditing ? (
                  <input
                    type="text"
                    name="location"
                    value={formData.location}
                    onChange={handleChange}
                    placeholder="서울시 강남구..."
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                ) : (
                  <p className="text-slate-700">{currentUser.location || '미등록'}</p>
                )}
              </div>

              {/* 회사 */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Building2 className="w-4 h-4 text-slate-500" />
                  <label className="text-sm font-semibold text-slate-700">회사</label>
                </div>
                {isEditing ? (
                  <input
                    type="text"
                    name="company"
                    value={formData.company}
                    onChange={handleChange}
                    placeholder="회사명"
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                ) : (
                  <p className="text-slate-700">{currentUser.company || '미등록'}</p>
                )}
              </div>

              {/* 계정 타입 */}
              <div>
                <label className="text-sm font-semibold text-slate-700 mb-2 block">계정 타입</label>
                <p className="text-slate-700 px-4 py-2 bg-slate-100 rounded-lg">
                  {currentUser.type === 'company' ? '회사 계정' : '개인 계정'}
                </p>
              </div>

              {/* 가입일 */}
              <div>
                <label className="text-sm font-semibold text-slate-700 mb-2 block">가입일</label>
                <p className="text-slate-700">
                  {new Date(currentUser.createdAt).toLocaleDateString('ko-KR')}
                </p>
              </div>
            </div>

            {/* 저장 버튼 */}
            {isEditing && (
              <div className="flex gap-3 mt-8 pt-6 border-t border-slate-200">
                <button
                  onClick={handleSave}
                  className="flex items-center gap-2 flex-1 px-4 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-all"
                >
                  <Save className="w-4 h-4" />
                  저장하기
                </button>
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setFormData({
                      name: currentUser.name || '',
                      phone: currentUser.phone || '',
                      email: currentUser.email || '',
                      location: currentUser.location || '',
                      company: currentUser.company || '',
                    });
                  }}
                  className="flex items-center gap-2 flex-1 px-4 py-3 bg-slate-200 text-slate-700 rounded-lg font-semibold hover:bg-slate-300 transition-all"
                >
                  <X className="w-4 h-4" />
                  취소하기
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
