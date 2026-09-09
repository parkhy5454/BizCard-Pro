import React, { useEffect, useState } from 'react';
import { X, Gift, Copy, Check, MessageSquare, Users, PartyPopper } from 'lucide-react';
import { User as UserType } from '../types.js';

interface Props {
  currentUser: UserType;
  onClose: () => void;
}

interface ReferralInfo {
  referralCode: string;
  shareUrl: string;
  totalReferred: number;
  totalRewarded: number;
  pendingCreditMonths: number;
  referrals: {
    refereeName: string;
    refereeEmail: string;
    status: 'pending' | 'rewarded';
    createdAt: string;
    rewardedAt: string | null;
  }[];
}

// [추가] 친구 추천 프로그램 화면. 본인의 추천 코드/링크를 확인하고 카카오톡/문자/링크
// 복사로 공유할 수 있으며, 지금까지 몇 명을 추천했고 몇 명에게 보상이 지급됐는지 볼 수 있다.
// 카카오톡 공유는 ShareMyCardModal에서 이미 쓰고 있는 것과 똑같은 방식(카카오 JS SDK
// 지연 로딩)을 그대로 재사용한다.
export const ReferralModal: React.FC<Props> = ({ currentUser, onClose }) => {
  const [info, setInfo] = useState<ReferralInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch('/api/referral/me', { headers: { 'x-user-id': currentUser.id } })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '추천 정보를 불러오지 못했습니다.');
        setInfo(data);
      })
      .catch((err) => setError(err.message || '추천 정보를 불러오지 못했습니다.'))
      .finally(() => setLoading(false));
  }, [currentUser.id]);

  const shareMessage = info
    ? `BizCard Pro AI를 추천해요! 아래 링크로 가입하고 첫 구독 결제를 완료하면 저와 회원님 모두 1개월씩 무료로 이용할 수 있어요.\n🔗 ${info.shareUrl}`
    : '';

  const KAKAO_JS_KEY = 'cb1b045b76bfb5a7d4deaf6985b50a2a';
  const loadKakaoSdk = (): Promise<void> => {
    const w = window as any;
    if (w.Kakao && w.Kakao.isInitialized && w.Kakao.isInitialized()) return Promise.resolve();
    if (w.__kakaoSdkLoadingPromise) return w.__kakaoSdkLoadingPromise;
    w.__kakaoSdkLoadingPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js';
      script.crossOrigin = 'anonymous';
      script.onload = () => {
        try {
          if (!w.Kakao.isInitialized()) w.Kakao.init(KAKAO_JS_KEY);
          resolve();
        } catch (err) {
          reject(err);
        }
      };
      script.onerror = () => reject(new Error('카카오 SDK 로드 실패'));
      document.body.appendChild(script);
    });
    return w.__kakaoSdkLoadingPromise;
  };

  const handleKakaoShare = async () => {
    if (!info) return;
    try {
      await loadKakaoSdk();
      const w = window as any;
      w.Kakao.Share.sendDefault({
        objectType: 'feed',
        content: {
          title: 'BizCard Pro AI 추천',
          description: '가입하고 첫 구독 결제를 완료하면 서로 1개월씩 무료!',
          imageUrl: 'https://bizcard-pro.onrender.com/kakao-share-thumb.png',
          link: { mobileWebUrl: info.shareUrl, webUrl: info.shareUrl }
        },
        buttons: [
          { title: '가입하러 가기', link: { mobileWebUrl: info.shareUrl, webUrl: info.shareUrl } }
        ]
      });
    } catch (err) {
      console.error('카카오톡 공유 실패:', err);
      alert('카카오톡 공유를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
    }
  };

  const handleCopy = () => {
    if (!info) return;
    navigator.clipboard.writeText(shareMessage);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between p-5 border-b border-slate-200 bg-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <Gift className="w-4.5 h-4.5 text-amber-500" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">친구 추천</h2>
              <p className="text-xs text-slate-500">추천한 친구가 첫 결제를 하면 서로 1개월 무료</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 flex-1 overflow-y-auto space-y-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-10 text-slate-500 gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
              <p className="text-sm">불러오는 중...</p>
            </div>
          ) : error ? (
            <p className="text-center py-10 text-rose-400 text-sm">{error}</p>
          ) : info ? (
            <>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <p className="text-lg font-extrabold text-slate-800">{info.totalReferred}</p>
                  <p className="text-[10px] text-slate-500">추천한 인원</p>
                </div>
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                  <p className="text-lg font-extrabold text-emerald-700">{info.totalRewarded}</p>
                  <p className="text-[10px] text-emerald-600">보상 지급됨</p>
                </div>
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                  <p className="text-lg font-extrabold text-amber-700">{info.pendingCreditMonths}</p>
                  <p className="text-[10px] text-amber-600">적립된 무료 개월</p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-600">내 추천 코드</label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 font-mono text-lg font-bold tracking-widest text-center text-indigo-600">
                    {info.referralCode}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleKakaoShare}
                  className="w-full p-3.5 rounded-2xl bg-[#FEE500] hover:brightness-95 flex items-center gap-3 transition-all"
                >
                  <div className="p-2 rounded-xl bg-black/10 text-black">
                    <MessageSquare className="w-4.5 h-4.5" />
                  </div>
                  <span className="text-xs font-bold text-black">카카오톡으로 추천 링크 보내기</span>
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <a
                    href={`sms:?body=${encodeURIComponent(shareMessage)}`}
                    className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 hover:border-emerald-500/50 flex items-center justify-center gap-2 transition-all"
                  >
                    <MessageSquare className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-bold text-slate-700">문자로 보내기</span>
                  </a>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 hover:border-indigo-500/50 flex items-center justify-center gap-2 transition-all"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-indigo-600" />}
                    <span className="text-xs font-bold text-slate-700">{copied ? '복사 완료!' : '링크 복사'}</span>
                  </button>
                </div>
              </div>

              {info.referrals.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-slate-200">
                  <p className="text-xs font-bold text-slate-600 flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> 내가 추천한 사람들</p>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {info.referrals.map((r, idx) => (
                      <div key={idx} className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs">
                        <span className="text-slate-700 font-medium truncate">{r.refereeName || r.refereeEmail}</span>
                        {r.status === 'rewarded' ? (
                          <span className="flex items-center gap-1 text-emerald-600 font-bold text-[10px] shrink-0">
                            <PartyPopper className="w-3 h-3" /> 보상 지급됨
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[10px] shrink-0">결제 대기 중</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};
