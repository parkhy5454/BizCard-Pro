import { BusinessCard, Project } from './types.js';

// [추가] "관계 인텔리전스"(CardGrid의 "지금 챙기면 좋은 거래처" 패널, AIIntelligenceView의
// "관계·영업 인텔리전스" 탭)의 채점/매칭 로직을 한 곳에 모아둔다. 두 화면이 서로 다른
// localStorage 키(개별 해제 목록)를 쓰는 것과 별개로, "무엇을 몇 점으로 챙길지 판단하는
// 기준" 자체는 반드시 동일해야 하므로 여기서 공용으로 관리한다.
//
// [추가] 기존에는 프로젝트에 명함이 직접 연결(contactIds)돼 있어야만 그 거래처가 분석
// 대상이 됐다. 하지만 프로젝트 등록 폼의 "영업 파이프라인 정보"(최종고객/발주처, 시공사,
// 건축설계사, 인테리어설계사, 전기설계사, 기계설계사, 감리사, 운영사)에는 회사명이
// 텍스트로 적혀 있어도 그 회사의 명함이 아직 프로젝트에 연결돼 있지 않은 경우가 많다.
// 이제는 명함의 회사명과 이 파이프라인 칸의 회사명이 일치하면(표기 차이는 정규화해서
// 무시) 명시적으로 연결하지 않아도 관련 있는 것으로 보고 분석 대상에 포함한다.

export const PRIORITY_WEIGHT: Record<string, number> = { high: 3, medium: 2, low: 1 };

const DAY_MS = 24 * 60 * 60 * 1000;

// "(주)"/"주식회사" 표기나 공백 유무 차이로 같은 회사를 놓치지 않도록 정규화해서 비교한다.
export const normalizeCompanyName = (s?: string): string =>
  (s || '').trim().replace(/^(주식회사|㈜|\(주\))\s*/, '').replace(/\s*(주식회사|㈜|\(주\))$/, '').replace(/\s+/g, '').toLowerCase();

// 영업 파이프라인 참여사 칸과, 역할별 가중치. 의사결정권이 큰 최종고객(발주처)을 가장
// 높게, 시공사를 그다음으로, 나머지 설계사·감리·운영사는 기본 가중치로 둔다.
// (developer는 endCustomer를 그대로 미러링하는 하위호환용 필드라 여기서는 endCustomer만 본다.)
export const PIPELINE_ROLE_FIELDS: { field: keyof Project; label: string; weight: number }[] = [
  { field: 'endCustomer', label: '최종고객(발주처)', weight: 1.5 },
  { field: 'contractor', label: '시공사', weight: 1.3 },
  { field: 'architect', label: '건축설계사', weight: 1.1 },
  { field: 'interiorDesigner', label: '인테리어설계사', weight: 1.1 },
  { field: 'electricalDesigner', label: '전기설계사', weight: 1.1 },
  { field: 'mechanicalDesigner', label: '기계설계사', weight: 1.1 },
  { field: 'supervisor', label: '감리사', weight: 1.1 },
  { field: 'operator', label: '운영사', weight: 1.1 },
];

// 이 명함의 회사명이, 프로젝트의 파이프라인 참여사 칸(최종고객/시공사/설계사 등) 중
// 하나와 일치하는지 확인한다. contactIds로 명시 연결돼 있지 않아도 이 매칭만으로
// "관련 있는 프로젝트"로 취급하기 위함.
export function matchPipelineRole(contactCompany: string | undefined, project: Project): { label: string; weight: number } | null {
  const norm = normalizeCompanyName(contactCompany);
  if (!norm) return null;
  for (const role of PIPELINE_ROLE_FIELDS) {
    const val = project[role.field] as string | undefined;
    if (val && normalizeCompanyName(val) === norm) return { label: role.label, weight: role.weight };
  }
  return null;
}

export interface RelationshipInsight {
  contact: BusinessCard;
  reasonText: string;
  daysSince: number;
  urgencyLabel: '높음' | '보통';
  score: number;
  linkedProjectName?: string;
  linkedProjectCount: number;
  salesScore: number;
}

// CardGrid의 "관계 인텔리전스" 패널과 AIIntelligenceView의 "관계·영업 인텔리전스" 탭이
// 공통으로 쓰는 채점 로직. 프로젝트에 직접 연결된 명함뿐 아니라, 파이프라인 참여사 칸에
// 회사명이 일치하는 명함까지 함께 대상으로 삼는다.
export function computeRelationshipInsights(contacts: BusinessCard[], projects: Project[]): RelationshipInsight[] {
  const now = Date.now();
  const list: RelationshipInsight[] = [];

  contacts.forEach((c) => {
    const relevant: { project: Project; roleLabel: string; roleWeight: number }[] = [];
    projects.forEach((p) => {
      if (p.status !== 'opportunity' && p.status !== 'progress') return;
      if ((p.contactIds || []).includes(c.id)) {
        relevant.push({ project: p, roleLabel: '연결된 거래처', roleWeight: 1 });
        return;
      }
      const roleMatch = matchPipelineRole(c.company, p);
      if (roleMatch) relevant.push({ project: p, roleLabel: roleMatch.label, roleWeight: roleMatch.weight });
    });

    let best: RelationshipInsight | null = null;

    for (const { project: p, roleLabel, roleWeight } of relevant) {
      // 이 프로젝트의 "마지막 활동일" = 가장 최근 팔로우업 날짜, 없으면 프로젝트 등록일
      const followUpDates = (p.followUps || []).map((f) => new Date(f.date || '').getTime()).filter((t) => !isNaN(t));
      const lastActivity = followUpDates.length > 0 ? Math.max(...followUpDates) : new Date(p.createdAt).getTime();
      if (isNaN(lastActivity)) continue;
      const daysSince = Math.floor((now - lastActivity) / DAY_MS);
      if (daysSince < 7) continue; // 일주일 안 됐으면 아직 급하지 않다고 판단

      const priorityWeight = PRIORITY_WEIGHT[p.priority] || 1;
      const score = daysSince * priorityWeight * roleWeight;

      if (!best || score > best.score) {
        const linkedProjectCount = relevant.length;
        // 영업점수 = 기본 40점 + (연결/관련 프로젝트 수 x6, 상한 있음) + (우선순위 가중치 x6) +
        // (방치 일수, 25일 상한) - 0~99 범위로 clamp. 챙길수록 급한 거래처일수록 높게 나온다.
        const salesScore = Math.min(99, Math.round(40 + Math.min(linkedProjectCount, 6) * 6 + priorityWeight * 6 + Math.min(daysSince, 25)));
        best = {
          contact: c,
          reasonText: `"${p.name}" 프로젝트 ${roleLabel === '연결된 거래처' ? '연결' : roleLabel + '로 등록'} · ${p.priority === 'high' ? '우선순위 높음' : p.priority === 'medium' ? '우선순위 보통' : '우선순위 낮음'}`,
          daysSince,
          urgencyLabel: score >= 40 ? '높음' : '보통',
          score,
          linkedProjectName: p.name,
          linkedProjectCount,
          salesScore
        };
      }
    }

    // 연결/관련된 활성 프로젝트가 없으면, 기존처럼 통화기록 기준으로 판단(최소한의 안전망)
    if (!best && c.callHistory && c.callHistory.length > 0) {
      const lastCall = c.callHistory.reduce((latest, cur) => {
        const t = new Date(cur.timestamp).getTime();
        return t > latest ? t : latest;
      }, 0);
      if (lastCall) {
        const daysSince = Math.floor((now - lastCall) / DAY_MS);
        if (daysSince >= 10) {
          best = {
            contact: c,
            reasonText: '연결된 진행중 프로젝트는 없지만, 통화 기록 기준 연락이 뜸함',
            daysSince,
            urgencyLabel: daysSince >= 20 ? '높음' : '보통',
            score: daysSince,
            linkedProjectCount: 0,
            salesScore: Math.min(99, Math.round(30 + Math.min(daysSince, 60)))
          };
        }
      }
    }

    if (best) list.push(best);
  });

  return list.sort((a, b) => b.score - a.score);
}

export interface MissingParticipant {
  projectId: string;
  projectName: string;
  roleLabel: string;
  companyName: string;
}

// 진행중/기회 상태 프로젝트의 파이프라인 참여사 칸(최종고객/시공사/설계사 등)에 회사명은
// 적혀 있는데, 그 회사의 명함이 하나도 등록되어 있지 않은 경우를 찾아준다. contacts는
// (그룹 제외 등으로) 걸러지지 않은 전체 명함 목록을 넘겨야 "이미 있는데 못 찾은" 오탐을
// 막을 수 있다.
export function computeMissingParticipants(projects: Project[], contacts: BusinessCard[]): MissingParticipant[] {
  const contactCompanyNorms = new Set(contacts.map((c) => normalizeCompanyName(c.company)).filter(Boolean));
  const result: MissingParticipant[] = [];
  const seen = new Set<string>(); // 같은 프로젝트에 같은 회사가 여러 역할로 중복 표시되지 않게

  projects.forEach((p) => {
    if (p.status !== 'opportunity' && p.status !== 'progress') return;
    PIPELINE_ROLE_FIELDS.forEach((role) => {
      const val = p[role.field] as string | undefined;
      if (!val || !val.trim()) return;
      const norm = normalizeCompanyName(val);
      if (contactCompanyNorms.has(norm)) return;
      const key = `${p.id}:${norm}`;
      if (seen.has(key)) return;
      seen.add(key);
      result.push({ projectId: p.id, projectName: p.name, roleLabel: role.label, companyName: val.trim() });
    });
  });

  return result;
}
