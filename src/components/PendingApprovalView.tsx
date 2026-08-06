import React from 'react';
import { Clock3, LogOut, Building2 } from 'lucide-react';
import { User } from '../types.js';

interface Props {
  currentUser: User;
  onLogout: () => void;
}

// [추가] 같은 회사(사업자번호)로 가입했지만 아직 관리자 승인을 받지 못한 회원에게 보여주는 화면.
// 이 화면이 떠 있는 동안에는 서버가 명함/프로젝트 등 회사 데이터 API를 전부 403으로 막기 때문에,
// 프런트엔드도 굳이 메인 화면을 그리지 않고 여기서 안내만 해준다.
export const PendingApprovalView: React.FC<Props> = ({ currentUser, onLogout }) => {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-8 text-center shadow-2xl">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-5">
          <Clock3 className="w-7 h-7 text-amber-400" />
        </div>
        <h1 className="text-lg font-bold text-slate-800 mb-2">관리자 승인 대기 중입니다</h1>
        <p className="text-sm text-slate-500 leading-relaxed mb-6">
          <span className="text-slate-700 font-medium">{currentUser.companyName || '회사'}</span> 소속으로 가입 신청이 접수되었습니다.
          회사 관리자가 승인하면 명함, 프로젝트 등 회사 데이터를 이용하실 수 있어요.
        </p>
        <div className="flex items-center justify-center gap-2 text-xs text-slate-400 bg-slate-100 border border-slate-200 rounded-xl px-3 py-2.5 mb-6">
          <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span>{currentUser.name} · {currentUser.email}</span>
        </div>
        <button
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          로그아웃
        </button>
      </div>
    </div>
  );
};
