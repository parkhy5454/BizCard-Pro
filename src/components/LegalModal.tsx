import React, { useState } from 'react';
import { X, FileText, ShieldCheck, AlertTriangle } from 'lucide-react';

interface Props {
  initialTab?: 'terms' | 'privacy';
  onClose: () => void;
}

// [수정] 이용약관/개인정보처리방침 초안. 실제 유료 서비스로 운영하기 전에 반드시 변호사 검토를
// 받아야 하며, "[ ]"로 표시된 빈칸(운영 주체 정보 등)은 실제 정보로 채워 넣어야 한다.
// 아래 내용은 일반적인 SaaS/CRM 서비스 및 한국 개인정보보호법(PIPA) 표준 항목을 참고해 작성한
// 초안이며, 법률 자문을 대체하지 않는다.

export const LegalModal: React.FC<Props> = ({ initialTab = 'terms', onClose }) => {
  const [tab, setTab] = useState<'terms' | 'privacy'>(initialTab);

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-3xl max-h-[88vh] bg-white border border-slate-200 rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            {tab === 'terms' ? <FileText className="w-5 h-5 text-indigo-400" /> : <ShieldCheck className="w-5 h-5 text-emerald-400" />}
            <h2 className="text-base font-bold text-slate-800">{tab === 'terms' ? '이용약관' : '개인정보처리방침'}</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pt-3 flex items-center gap-2 shrink-0">
          <button
            onClick={() => setTab('terms')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${tab === 'terms' ? 'bg-indigo-600/20 text-indigo-600 border border-indigo-500/40' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}
          >
            이용약관
          </button>
          <button
            onClick={() => setTab('privacy')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${tab === 'privacy' ? 'bg-emerald-600/20 text-emerald-600 border border-emerald-500/40' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}
          >
            개인정보처리방침
          </button>
        </div>

        {/* 초안 안내 배너 */}
        <div className="mx-5 mt-3 p-3 bg-amber-500/10 border border-amber-500/25 rounded-xl flex items-start gap-2 shrink-0">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-600/90 leading-relaxed">
            이 문서는 일반적인 초안이며 법률 자문이 아닙니다. <span className="text-amber-800 font-bold">[ ]</span>로 표시된 부분은 실제 운영 정보로 채워야 하고,
            실제 유료 서비스 운영 전 반드시 변호사 검토를 받으시길 권장합니다.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'terms' ? <TermsContent /> : <PrivacyContent />}
        </div>
      </div>
    </div>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="mb-5">
    <h3 className="text-sm font-bold text-slate-800 mb-1.5">{title}</h3>
    <div className="text-xs text-slate-500 leading-relaxed space-y-1.5">{children}</div>
  </div>
);

export const TermsContent: React.FC = () => (
  <div>
    <p className="text-[11px] text-slate-400 mb-5">시행일자: 2026.10.23</p>

    <Section title="제1조 (목적)">
      <p>
        이 약관은 주식회사 카이저솔루션(이하 "회사")가 제공하는 명함 스캔·고객관계관리(CRM)·차량관리·업무일지·전자결재 등의
        서비스(이하 "서비스")를 이용함에 있어 회사와 이용자의 권리·의무 및 책임사항, 기타 필요한 사항을 규정함을 목적으로 합니다.
      </p>
    </Section>

    <Section title="제2조 (용어의 정의)">
      <p>1. "서비스"란 회사가 제공하는 웹 및 모바일 기반의 명함 관리, 차량 관리, 프로젝트 관리, 업무일지, 전자결재 등 일체의 기능을 말합니다.</p>
      <p>2. "이용자"란 이 약관에 따라 회사가 제공하는 서비스를 이용하는 개인 또는 법인 회원을 말합니다.</p>
      <p>3. "회사 계정"이란 동일한 회사명 및 사업자등록번호로 가입하여 데이터를 공유하는 이용자 그룹을 말합니다.</p>
    </Section>

    <Section title="제3조 (약관의 효력 및 변경)">
      <p>1. 이 약관은 서비스 화면에 게시하거나 기타의 방법으로 이용자에게 공지함으로써 효력이 발생합니다.</p>
      <p>2. 회사는 관련 법령을 위배하지 않는 범위에서 이 약관을 개정할 수 있으며, 개정 시 적용일자 및 개정 사유를 명시하여 최소 7일(이용자에게 불리한 변경의 경우 30일) 전에 공지합니다.</p>
    </Section>

    <Section title="제4조 (서비스의 제공 및 변경)">
      <p>1. 회사는 다음과 같은 서비스를 제공합니다: 명함 스캔 및 인식(AI OCR), 연락처 관리, 통합 차량 관리(운행기록·비용·정비), 프로젝트/영업 팔로우업 관리, 업무일지 작성, 전자결재(가지급금 정산서·휴가신청서 등).</p>
      <p>2. 회사는 서비스의 내용, 운영상 또는 기술상 필요에 따라 제공하고 있는 서비스의 전부 또는 일부를 변경할 수 있으며, 이 경우 변경 사유와 내용을 사전에 공지합니다.</p>
      <p>3. 회사는 시스템 점검, 교체, 고장, 통신 두절 등의 사유가 발생한 경우 서비스 제공을 일시적으로 중단할 수 있습니다.</p>
    </Section>

    <Section title="제5조 (회원가입 및 계정 관리)">
      <p>1. 이용자는 회사가 정한 절차에 따라 개인 회원 또는 회사(법인) 회원으로 가입할 수 있습니다.</p>
      <p>2. 동일한 회사명 및 사업자등록번호로 가입한 이용자는 명함, 프로젝트, 차량 정보 등 일부 데이터를 자동으로 공유합니다. 이용자는 가입 시 이 점에 동의한 것으로 봅니다.</p>
      <p>3. 이용자는 가입 정보에 변경이 있는 경우 지체 없이 갱신하여야 하며, 정보 미갱신으로 발생한 불이익에 대해 회사는 책임을 지지 않습니다.</p>
    </Section>

    <Section title="제6조 (이용자의 의무)">
      <p>1. 이용자는 관계 법령, 이 약관의 규정, 이용안내 및 서비스와 관련하여 공지한 주의사항을 준수하여야 합니다.</p>
      <p>2. 이용자는 타인의 명함, 개인정보 등을 스캔·등록함에 있어 관계 법령(개인정보보호법 등)을 준수하여야 하며, 부정한 목적으로 이용해서는 안 됩니다.</p>
      <p>3. 이용자는 계정 정보(이메일, 비밀번호 등)를 제3자에게 양도, 대여할 수 없습니다.</p>
    </Section>

    <Section title="제7조 (서비스 이용요금 및 결제)">
      <p>1. 요금은 다음과 같습니다.</p>
      <p>- 무료(Free): 0원. 명함 50장, AI 명함 스캔 월 10회 등 기본 기능을 제공합니다.</p>
      <p>- 개인 Pro: 월 9,900원(부가세 포함) 또는 연 99,000원(부가세 포함, 10개월분으로 1년 이용).</p>
      <p>- 팀 Business: 1인당 월 12,000원(부가세 별도, 결제액 1인 13,200원). 승인된 구성원 2명 이상 900명 이하를 대상으로 합니다. 팀 연간 결제는 추후 제공 시 별도로 공지합니다.</p>
      <p>2. 결제는 토스페이먼츠를 통해 이용자가 등록한 카드로 정기 자동결제합니다. 카드 등록 후 개인 Pro 월 구독을 시작하면 최초 1회에 한해 14일 무료체험을 제공하며, 체험 기간이 끝나는 날 첫 결제가 이루어집니다.</p>
      <p>3. 프로젝트, 차량 운행일지, 업무일지, 기업 인텔리전스 등 유료 기능은 구독 결제가 완료된 이후에만 이용할 수 있으며, 무료체험 기간에는 제공되지 않습니다.</p>
      <p>4. 팀 구독은 관리자 계정이 결제합니다. 구독을 시작하려면 승인된 구성원이 2명 이상이어야 하며, 구성원이 2명 미만으로 줄어도 최소 2명분으로 청구합니다.</p>
      <p>5. 팀 구성원의 요금은 구성원마다 승인된 날짜(구독 시작일 포함)를 기준으로 매월 같은 날짜에 1명분씩 청구합니다. 같은 날짜에 승인된 구성원은 한 번에 묶어서 청구합니다.</p>
      <p>6. 구독 중 새로 승인된 구성원은 승인 즉시 1명분(1개월)을 결제하고, 그날부터 매월 같은 날짜에 정기결제합니다. 남은 기간에 대한 일할 계산은 하지 않습니다.</p>
      <p>7. 구독이 시작되기 전에는 구성원을 승인할 수 없습니다.</p>
      <p>8. 연간 결제는 결제일로부터 1년 동안 이용할 수 있으며, 해지하지 않으면 같은 조건으로 자동 갱신됩니다.</p>
      <p>9. 요금제를 도입하거나 변경하는 경우, 회사는 적용일 최소 30일 전에 이용자에게 공지합니다.</p>
    </Section>

    <Section title="제7조의2 (구독 해지 및 환불)">
      <p>1. 이용자는 언제든지 구독 관리 화면에서 구독을 해지할 수 있습니다. 해지하면 다음 결제일부터 청구되지 않으며, 이미 결제한 기간이 끝날 때까지 유료 기능을 이용할 수 있습니다.</p>
      <p>2. 팀 구성원을 제거하면 그 구성원에 대한 다음 결제일부터 청구하지 않습니다. 이미 결제된 금액은 환불되지 않습니다.</p>
      <p>3. 결제일로부터 7일 이내에 유료 기능을 한 번도 이용하지 않은 경우, 이용자는 전액 환불을 요청할 수 있습니다.</p>
      <p>4. 개인 Pro 월 구독은 결제 후 이용을 시작한 뒤에는 환불되지 않으며, 해지 후 남은 기간 동안 계속 이용할 수 있습니다.</p>
      <p>5. 개인 Pro 연간 구독을 중도에 환불하는 경우, 환불 금액은 결제 금액에서 사용한 개월 수(1개월 단위로 올림, 1개월당 9,900원 부가세 포함)를 공제한 금액으로 합니다. 공제 후 금액이 0원 이하이면 환불하지 않습니다.</p>
      <p>6. 회사의 귀책으로 서비스를 이용할 수 없었던 경우에는 그 기간만큼 이용 기간을 연장하거나, 일할 계산하여 환불합니다.</p>
      <p>7. 구독이 끝나거나 해지되면 무료(Free) 요금제로 전환됩니다. 기존 데이터는 삭제되지 않으며, 무료 요금제의 명함 50장 한도를 넘는 경우 신규 등록만 제한됩니다.</p>
      <p>8. 환불 요청은 고객센터로 접수하며, 환불은 접수일로부터 [N]영업일 이내에 결제 수단으로 처리합니다.</p>
    </Section>

    <Section title="제8조 (지식재산권)">
      <p>1. 서비스에 대한 저작권 및 지식재산권은 회사에 귀속됩니다.</p>
      <p>2. 이용자가 서비스에 등록한 데이터(명함, 프로젝트 정보 등)의 소유권은 이용자에게 있으며, 회사는 서비스 제공 목적 범위 내에서만 이를 처리합니다.</p>
    </Section>

    <Section title="제9조 (면책조항)">
      <p>1. 회사는 천재지변, 통신장애 등 불가항력으로 인하여 서비스를 제공할 수 없는 경우 책임이 면제됩니다.</p>
      <p>2. 회사는 AI(인공지능) 기반 명함·영수증 인식 결과의 완전한 정확성을 보장하지 않으며, 이용자는 등록 전 인식 결과를 확인·수정할 책임이 있습니다.</p>
      <p>3. 회사는 이용자가 서비스를 이용하여 기대하는 수익을 얻지 못하거나 상실한 것에 대하여 책임을 지지 않습니다.</p>
    </Section>

    <Section title="제10조 (분쟁해결)">
      <p>이 약관과 관련하여 발생한 분쟁에 대해서는 대한민국 법을 준거법으로 하며, 회사의 주소지를 관할하는 법원을 관할 법원으로 합니다.</p>
    </Section>

    <Section title="환불 규정 안내">
      <p>구독 해지와 환불의 기준은 제7조의2(구독 해지 및 환불)를 따릅니다.</p>
    </Section>

    <Section title="부칙">
      <p>이 약관은 2026.12.01부터 시행합니다.</p>
    </Section>
  </div>
);

export const PrivacyContent: React.FC = () => (
  <div>
    <p className="text-[11px] text-slate-400 mb-5">시행일자: 2026.10.23</p>

    <p className="text-xs text-slate-500 leading-relaxed mb-5">
      주식회사 카이저솔루션(이하 "회사")는 개인정보보호법 등 관계 법령상의 개인정보보호 규정을 준수하며,
      이용자의 개인정보 보호에 최선을 다하고 있습니다. 회사는 개인정보처리방침을 통해 이용자가 제공하는
      개인정보가 어떠한 목적과 방식으로 이용되고 있으며, 개인정보 보호를 위해 어떠한 조치가 취해지고 있는지 알려드립니다.
    </p>

    <Section title="1. 수집하는 개인정보 항목">
      <p><span className="text-slate-600 font-semibold">가입 시:</span> 이메일, 비밀번호(암호화 저장), 이름, 핸드폰 번호(선택), 회사명, 사업자등록번호, 직책(선택)</p>
      <p><span className="text-slate-600 font-semibold">서비스 이용 중:</span> 이용자가 직접 등록/촬영하는 명함 정보(성명, 회사명, 연락처, 이메일, 주소 등 명함 실물에 기재된 정보), 명함·영수증 이미지, 차량 운행/비용/정비 기록, 프로젝트 및 업무일지 내용, 전자결재 문서</p>
      <p><span className="text-slate-600 font-semibold">자동 수집 정보:</span> 접속 로그, 서비스 이용 기록, 기기 정보</p>
    </Section>

    <Section title="2. 개인정보의 수집 및 이용 목적">
      <p>1. 회원 가입 의사 확인, 회원제 서비스 제공에 따른 본인 식별·인증</p>
      <p>2. 명함 스캔(OCR), AI 기반 정보 추출 및 자동 입력 서비스 제공</p>
      <p>3. 고객관계관리(CRM), 차량관리, 프로젝트관리, 업무일지, 전자결재 등 서비스 제공</p>
      <p>4. 서비스 이용에 따른 본인 확인, 부정 이용 방지, 고지사항 전달</p>
      <p>5. 문의사항 처리 및 응답</p>
    </Section>

    <Section title="3. 개인정보의 보유 및 이용 기간">
      <p>
        회사는 원칙적으로 개인정보 수집 및 이용 목적이 달성된 후, 또는 이용자가 회원 탈퇴를 요청한 경우 해당 정보를
        지체 없이 파기합니다. 다만 관계 법령에 따라 보존할 필요가 있는 경우 해당 법령에서 정한 기간 동안 보관합니다.
      </p>
    </Section>

    <Section title="4. 명함 등 제3자(타인) 정보의 처리에 관한 안내">
      <p>
        본 서비스는 이용자가 업무상 취득한 타인의 명함을 스캔·등록하여 관리하는 기능을 제공합니다. 이 경우 명함에
        기재된 정보의 주체는 이용자가 아닌 제3자이며, 이용자는 해당 정보를 정당한 업무 목적(거래처 관리 등) 범위 내에서만
        이용하여야 하고, 관계 법령을 준수할 책임이 있습니다. 회사는 이용자가 등록한 제3자 정보에 대해 저장 공간을
        제공하는 역할을 하며, 그 수집의 적법성에 대한 최종 책임은 이를 등록한 이용자에게 있습니다.
        <span className="text-amber-600"> [이 조항은 실제 서비스 형태에 맞춰 법률 검토가 특히 필요한 부분입니다.]</span>
      </p>
    </Section>

    <Section title="5. 개인정보 처리의 위탁">
      <p>회사는 서비스 제공을 위해 아래와 같이 개인정보 처리업무를 외부 업체에 위탁하고 있습니다.</p>
      <div className="mt-2 border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-[11px]">
          <thead className="bg-slate-50">
            <tr>
              <th className="p-2 text-left border-b border-slate-200">수탁업체</th>
              <th className="p-2 text-left border-b border-slate-200">위탁업무 내용</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="p-2 border-b border-slate-200">Google (Gemini API)</td>
              <td className="p-2 border-b border-slate-200">명함/영수증 이미지의 AI 텍스트 인식(OCR) 및 정보 추출</td>
            </tr>
            <tr>
              <td className="p-2">Supabase Inc.</td>
              <td className="p-2">데이터베이스 및 이미지 파일 저장(클라우드 호스팅)</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Section>

    <Section title="6. 정보주체의 권리·의무 및 행사 방법">
      <p>이용자는 언제든지 등록되어 있는 자신의 개인정보를 조회, 수정할 수 있으며 가입 해지를 요청할 수 있습니다.</p>
      <p>개인정보 조회, 수정, 삭제를 원하시는 경우 아래 개인정보 보호책임자에게 문의해주시기 바랍니다.</p>
    </Section>

    <Section title="7. 개인정보의 파기 절차 및 방법">
      <p>전자적 파일 형태의 정보는 기록을 재생할 수 없는 기술적 방법을 사용하여 삭제하며, 종이 문서에 기록·저장된 개인정보는 분쇄기로 분쇄하거나 소각하여 파기합니다.</p>
    </Section>

    <Section title="8. 개인정보의 안전성 확보 조치">
      <p>1. 비밀번호는 암호화하여 저장·관리하고 있습니다.</p>
      <p>2. 회사와 회사가 아닌 다른 이용자의 데이터는 별도의 공간(스코프)으로 분리하여 저장하며, 접근 권한을 제한하고 있습니다.</p>
      <p>3. 개인정보에 대한 접근 권한을 최소한의 인원으로 제한하고 있습니다.</p>
    </Section>

    <Section title="9. 개인정보 보호책임자">
      <p>회사는 개인정보 처리에 관한 업무를 총괄해서 책임지고, 개인정보 처리와 관련한 이용자의 불만처리 및 피해구제 등을 위하여 아래와 같이 개인정보 보호책임자를 지정하고 있습니다.</p>
      <div className="mt-2 p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px]">
        <p>성명: 박현용</p>
        <p>연락처: w_ks@daum.net / 02-971-0954</p>
      </div>
    </Section>

    <Section title="10. 개인정보처리방침의 변경">
      <p>이 개인정보처리방침은 시행일로부터 적용되며, 법령 및 방침에 따른 변경내용의 추가, 삭제 및 정정이 있는 경우에는 변경사항의 시행 7일 전부터 서비스 내 공지사항을 통하여 고지할 것입니다.</p>
    </Section>
  </div>
);
