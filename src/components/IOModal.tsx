import React, { useState } from 'react';
import { ArrowDownUp, Download, Upload, FileSpreadsheet, FileText, CheckCircle2, ShieldAlert } from 'lucide-react';
import { BusinessCard, ContactGroup } from '../types.js';
import { generateStandardCardImage } from '../cardImageGenerator.js';
import * as XLSX from 'xlsx';

interface Props {
  contacts: BusinessCard[];
  groups: ContactGroup[];
  onImportSuccess: (imported: BusinessCard[]) => void;
}

export const IOModal: React.FC<Props> = ({ contacts, groups, onImportSuccess }) => {
  // 내보내기 범위 (전체 / 특정 그룹 / 특정 개인)
  const [exportScope, setExportScope] = useState<'all' | 'group' | 'single'>('all');
  const [selectedGid, setSelectedGid] = useState<string>(groups[0]?.id || '');
  const [selectedCid, setSelectedCid] = useState<string>(contacts[0]?.id || '');
  
  // 내보내기 파일 포맷
  const [exportFormat, setExportFormat] = useState<'vcf' | 'csv' | 'excel'>('vcf');

  // 가져오기 결과 알림
  const [importStatus, setImportStatus] = useState<string>('');
  // [수정] 외부에서 가져온 연락처는 데이터만 있고 사진이 없어서 밋밋했다. 이제는 이름/회사/
  // 연락처 정보를 예쁜 명함 템플릿에 자동으로 배치해서 이미지를 만들어 붙여준다(AI 생성이
  // 아니라 캔버스로 직접 그리는 방식이라 빠르고 비용이 안 든다). 기본은 켜져 있고, 원하면 끌 수 있다.
  const [autoGenerateImage, setAutoGenerateImage] = useState<boolean>(true);

  // [추가] 이름은 같은데 전화번호/이메일이 다른 경우 - 동명이인일 수도, 같은 사람 정보가
  // 업데이트된 걸 수도 있어서 자동으로 판단하지 않고 사용자에게 확인받는다.
  // (전화번호/이메일이 아예 같으면 서버가 이미 자동으로 중복으로 걸러준다 — 여긴 그 사각지대.)
  interface NameCollision {
    key: string;
    newContact: BusinessCard;
    existingContact: BusinessCard;
    resolution: 'add' | 'skip';
  }
  const [nameCollisions, setNameCollisions] = useState<NameCollision[] | null>(null);
  const [pendingImportList, setPendingImportList] = useState<BusinessCard[] | null>(null);

  // [수정] 명함 이미지를 그리는 로직 자체는 ../cardImageGenerator.ts로 옮겼다 (수정 화면에서
  // 이름 등을 바꿨을 때도 같은 방식으로 다시 그릴 수 있어야 해서 공용 함수로 뺐다).

  // 필터링된 대상 리스트
  const targetContacts = contacts.filter((c) => {
    if (exportScope === 'all') return true;
    if (exportScope === 'group') return c.groupId === selectedGid;
    if (exportScope === 'single') return c.id === selectedCid;
    return true;
  });

  // 1. CSV 생성 문자열
  const generateCSV = (list: BusinessCard[]) => {
    const headers = ['이름', '회사명', '부서', '직책', '핸드폰', '사무실전화', '팩스', '이메일', '주소', '메모', '생성일'];
    const rows = list.map((c) => [
      `"${c.name || ''}"`,
      `"${c.company || ''}"`,
      `"${c.department || ''}"`,
      `"${c.title || ''}"`,
      `"${c.phoneMobile || ''}"`,
      `"${c.phoneOffice || ''}"`,
      `"${c.phoneFax || ''}"`,
      `"${c.email || ''}"`,
      `"${c.address || ''}"`,
      `"${(c.memo || '').replace(/"/g, '""')}"`,
      `"${c.createdAt || ''}"`
    ]);
    return '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  };

  // 2. VCF(vCard) 생성 문자열
  const generateVCF = (list: BusinessCard[]) => {
    return list.map((c) => {
      return [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `FN:${c.name}`,
        `N:${c.name};;;;`,
        `ORG:${c.company || ''};${c.department || ''}`,
        `TITLE:${c.title || ''}`,
        c.phoneMobile ? `TEL;TYPE=CELL:${c.phoneMobile}` : '',
        c.phoneOffice ? `TEL;TYPE=WORK:${c.phoneOffice}` : '',
        c.phoneFax ? `TEL;TYPE=FAX:${c.phoneFax}` : '',
        c.email ? `EMAIL;TYPE=PREF,INTERNET:${c.email}` : '',
        c.address ? `ADR;TYPE=WORK:;;${c.address};;;;` : '',
        c.memo ? `NOTE:${c.memo}` : '',
        'END:VCARD'
      ].filter(Boolean).join('\r\n');
    }).join('\r\n\r\n');
  };

  // 다운로드 트리거
  const handleDownload = () => {
    if (targetContacts.length === 0) {
      alert('내보낼 명함 데이터가 없습니다.');
      return;
    }

    let content = '';
    let filename = `bizcards_${exportScope}_${Date.now()}`;
    let mimeType = '';

    if (exportFormat === 'csv') {
      content = generateCSV(targetContacts);
      filename += '.csv';
      mimeType = 'text/csv;charset=utf-8;';
    } else if (exportFormat === 'excel') {
      content = generateCSV(targetContacts); // 엑셀에서 바로 열리는 UTF-8 BOM CSV/TSV 기반 호환
      filename += '.xls';
      mimeType = 'application/vnd.ms-excel;charset=utf-8;';
    } else {
      content = generateVCF(targetContacts);
      filename += '.vcf';
      mimeType = 'text/vcard;charset=utf-8;';
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // 파일 가져오기(Import) 파싱 핸들러
  // [추가] 실제로 서버에 배치 전송하는 부분을 별도 함수로 분리했다. 이름 충돌이 없으면
  // 바로 이 함수를 부르고, 충돌이 있으면 사용자가 확인 화면에서 선택을 마친 뒤에 부른다.
  const runImport = async (finalList: BusinessCard[], autoGenerateImageUsed: boolean) => {
    try {
      if (finalList.length === 0) {
        setImportStatus('가져올 명함이 없습니다 (전부 건너뛰기로 선택됨).');
        return;
      }
      // [수정] 자동 이미지 생성을 켜면 각 명함마다 이미지(base64 PNG)가 붙어서 배치 하나가
      // 훨씬 무거워진다. 100건씩 보내면 서버가 이미지 100장을 업로드 처리하다가 응답이
      // 오래 걸리거나 실패할 수 있어서, 이미지 생성 시엔 배치를 더 작게(30건) 나눈다.
      const BATCH_SIZE = autoGenerateImageUsed ? 30 : 100;
      // [추가] fetch는 기본적으로 타임아웃이 없어서, 서버가 응답을 못 주고 멈추면
      // "가져오는 중..."에서 화면이 무한정 멈춰있는 것처럼 보였다(실제로 이런 사례가
      // 있었다). 배치당 90초 넘게 응답이 없으면 타임아웃으로 명확히 실패 처리한다.
      const BATCH_TIMEOUT_MS = 90_000;

      let latestFullContactList: BusinessCard[] = [];
      let totalSkippedDuplicates = 0;
      for (let i = 0; i < finalList.length; i += BATCH_SIZE) {
        const batch = finalList.slice(i, i + BATCH_SIZE);
        setImportStatus(`⏳ 가져오는 중... (${Math.min(i + BATCH_SIZE, finalList.length)}/${finalList.length}건)`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), BATCH_TIMEOUT_MS);

        let res: Response;
        try {
          res = await fetch('/api/contacts/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ importedContacts: batch }),
            signal: controller.signal
          });
        } catch (fetchErr: any) {
          if (fetchErr?.name === 'AbortError') {
            throw new Error(
              `${i + 1}~${i + batch.length}번째 항목 처리 중 서버 응답이 90초 넘게 없어서 중단했습니다. ` +
              `지금까지(${i}건)는 이미 저장됐을 수 있으니 명함 목록을 확인해보시고, ` +
              `"명함 이미지 자동 생성" 옵션을 끄고 나머지를 다시 가져오기 해보세요.`
            );
          }
          throw fetchErr;
        } finally {
          clearTimeout(timeoutId);
        }

        // [수정] res.json()을 바로 부르면, 서버가 에러 페이지(HTML/텍스트)를 돌려줬을 때
        // Safari에서 알아보기 힘든 에러가 난다. 먼저 상태와 응답 형식을 확인해서
        // 무슨 일이 있었는지 정확한 한글 메시지로 알려준다.
        const contentType = res.headers.get('content-type') || '';
        if (!res.ok || !contentType.includes('application/json')) {
          const bodyText = await res.text().catch(() => '');
          if (res.status === 413 || /too large|payload/i.test(bodyText)) {
            throw new Error(`${i + 1}~${i + batch.length}번째 항목 처리 중 요청 용량이 너무 커서 실패했습니다. "명함 이미지 자동 생성" 옵션을 끄고 다시 시도해보세요.`);
          }
          throw new Error(`${i + 1}~${i + batch.length}번째 항목 처리 중 서버 오류가 발생했습니다 (상태: ${res.status}).`);
        }

        // [수정] 이 API는 "이번 배치"가 아니라 "그 시점까지의 전체 명함 목록"을 돌려준다.
        // 그래서 배치마다 누적(push)하면 안 되고, 마지막 배치의 응답이 곧 최종 전체 목록이다.
        const data = await res.json();
        latestFullContactList = data.contacts || latestFullContactList;
        totalSkippedDuplicates += data.skippedDuplicates || 0;
      }

      const dupMsg = totalSkippedDuplicates > 0 ? ` (기존과 전화번호/이메일이 같은 ${totalSkippedDuplicates}건은 중복으로 건너뜀)` : '';
      setImportStatus(`✅ ${finalList.length - totalSkippedDuplicates}건의 명함 데이터를 성공적으로 복원(가져오기)했습니다.${dupMsg}${autoGenerateImageUsed ? ' 명함 이미지도 자동으로 만들었어요.' : ''}`);
      onImportSuccess(latestFullContactList);
    } catch (err: any) {
      alert('파일 가져오기 실패: ' + err.message);
    }
  };

  // 이름 정규화 (공백 제거 + 소문자화) - "김 희중"과 "김희중"을 같은 이름으로 보기 위함
  const normalizeName = (s?: string) => (s || '').replace(/\s+/g, '').toLowerCase();

  // [추가] CSV든 진짜 엑셀 파일이든, "행(row) 배열의 배열"만 넘기면 동일하게 명함 목록으로
  // 바꿔주는 공용 함수. 컬럼 순서: 이름, 회사, 부서, 직책, 핸드폰, 사무실전화, 팩스, 이메일, 주소, 메모
  const rowsToContacts = (rows: string[][]): BusinessCard[] => {
    const list: BusinessCard[] = [];
    const dataRows = rows.slice(1); // 헤더 제외
    dataRows.forEach((cols) => {
      if (cols[0] && String(cols[0]).trim()) {
        list.push({
          id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
          name: String(cols[0] ?? '').trim() || '이름없음',
          company: String(cols[1] ?? '').trim(),
          department: String(cols[2] ?? '').trim(),
          title: String(cols[3] ?? '').trim(),
          phoneMobile: String(cols[4] ?? '').trim(),
          phoneOffice: String(cols[5] ?? '').trim(),
          phoneFax: String(cols[6] ?? '').trim(),
          email: String(cols[7] ?? '').trim(),
          address: String(cols[8] ?? '').trim(),
          memo: String(cols[9] ?? '').trim(),
          createdAt: new Date().toISOString(),
          callHistory: []
        });
      }
    });
    return list;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // [수정] 예전엔 .xls/.xlsx도 무조건 텍스트로 읽어서(readAsText) CSV처럼 쉼표로
    // 쪼갰는데, 엑셀 파일은 실제로는 ZIP 기반의 "이진(바이너리)" 형식이라 텍스트로
    // 읽으면 글자가 깨진다 — "3.0" 같은 의미 없는 값이 이름으로 들어간 것도 이 문제였다.
    // 이제는 확장자를 보고 진짜 엑셀 파일이면 SheetJS로 제대로 읽는다.
    const isRealExcel = /\.xlsx?$/i.test(file.name);

    if (isRealExcel) {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const buffer = reader.result as ArrayBuffer;
          const workbook = XLSX.read(buffer, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          // header:1 -> 각 행을 ["셀1","셀2",...] 배열로 받는다(CSV 파싱과 같은 형태로 통일).
          // raw:false -> 숫자처럼 보이는 셀도 화면에 표시되는 문자열 그대로 가져온다(예: "3"이 3.0으로 안 바뀜).
          const rows = XLSX.utils.sheet_to_json<string[]>(firstSheet, { header: 1, raw: false, defval: '' });
          const parsedList = rowsToContacts(rows);
          if (parsedList.length === 0) throw new Error('파싱 가능한 명함 연락처가 없습니다.');
          await finalizeParsedList(parsedList);
        } catch (err: any) {
          alert('엑셀 파일을 읽는 중 오류가 발생했습니다: ' + err.message);
        }
      };
      reader.onerror = () => alert('파일을 읽는 중 오류가 발생했습니다.');
      reader.readAsArrayBuffer(file);
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const text = reader.result as string;
      const parsedList: BusinessCard[] = [];

      try {
        if (file.name.endsWith('.vcf')) {
          // 간이 vCard 파싱
          // [수정] 예전엔 정규식이 줄 시작에 고정돼 있지 않아서, 예를 들어 모든 vCard에
          // 항상 있는 "VERSION:3.0"이라는 줄의 뒷부분("N:3.0")이 이름 필드 "N:"으로 잘못
          // 걸려서, 이름 필드가 따로 없는 연락처(예: "벤츠고객센터"처럼 조직 이름만 있는
          // 경우)의 이름이 "3.0"으로 잘못 들어가는 버그가 있었다. 이제는 모든 필드를
          // "줄 맨 앞"에서만 찾도록 고정해서, 다른 줄의 일부가 걸리는 일이 없다.
          // field(vc, 'N')처럼 부르면, 그 줄("N:..." 또는 파라미터 붙은 "N;CHARSET=...:...")의
          // 콜론 뒷부분만 뽑아준다. 줄 시작(^)에 고정돼 있어서 다른 줄과 절대 안 헷갈린다.
          // [수정] vCard 표준(RFC 6350)에서는 필드 값 안에 쉼표(,)나 세미콜론(;)이 실제로
          // 들어가야 할 때 "\," "\;" 처럼 백슬래시를 붙여서 이스케이프 처리한다. 그런데
          // 우리 파서는 이 이스케이프를 원래 문자로 복원(un-escape)하지 않고 있어서, 예를
          // 들어 "521\, Teheran-ro\, Gangnam-gu\, Seoul\, 06164 Korea"처럼 백슬래시가
          // 그대로 주소에 남아있는 문제가 있었다. 이게 카카오 검색을 방해해서 실패의
          // 상당수 원인이 됐을 걸로 보인다. 모든 필드에 공통으로 적용해서 복원한다.
          const unescapeVCardValue = (v: string): string =>
            v
              .replace(/\\,/g, ',')
              .replace(/\\;/g, ';')
              .replace(/\\n/gi, ' ')
              .replace(/\\\\/g, '\\')
              .trim();

          const field = (vc: string, name: string, mustContain?: string): string => {
            const re = new RegExp(`^${name}[^:\\r\\n]*:(.*)$`, 'im');
            const lines = vc.split(/\r?\n/).filter((l) => new RegExp(`^${name}(?![A-Z])`, 'i').test(l));
            const target = mustContain
              ? lines.find((l) => l.toUpperCase().includes(mustContain.toUpperCase()))
              : lines[0];
            if (!target) return '';
            const m = target.match(re);
            return m ? unescapeVCardValue(m[1]) : '';
          };

          const vcards = text.split(/BEGIN:VCARD/i).filter(Boolean);
          vcards.forEach((vc) => {
            const rawName = field(vc, 'FN') || field(vc, 'N');
            const name = rawName.replace(/;/g, ' ').replace(/\s+/g, ' ').trim();
            const org = field(vc, 'ORG');

            // 이름도 조직명도 전혀 없으면 애초에 유효한 연락처가 아니므로 건너뛴다.
            if (!name && !org) return;

            {
              parsedList.push({
                id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
                name: name || '이름없음',
                company: org.split(';')[0].trim(),
                department: org.split(';')[1] ? org.split(';')[1].trim() : '',
                title: field(vc, 'TITLE').trim(),
                phoneMobile: (field(vc, 'TEL', 'CELL') || field(vc, 'TEL')).trim(),
                phoneOffice: field(vc, 'TEL', 'WORK').trim(),
                phoneFax: field(vc, 'TEL', 'FAX').trim(),
                email: field(vc, 'EMAIL').trim(),
                address: field(vc, 'ADR').replace(/;/g, ' ').trim(),
                // [수정] 예전엔 그룹 목록의 첫 번째 그룹으로 강제 배정했는데, "전체보기"에서만
                // 보이고 특정 그룹엔 안 걸리도록 그룹을 비워둔다.
                createdAt: new Date().toISOString(),
                callHistory: []
              });
            }
          });
        } else {
          // 진짜 CSV 파일 파싱 (엑셀 바이너리는 위에서 이미 별도 처리됨)
          const lines = text.split(/\r?\n/).filter(Boolean);
          const rows = lines.map((line) => line.split(',').map((s) => s.replace(/^"|"$/g, '').trim()));
          parsedList.push(...rowsToContacts(rows));
        }

        if (parsedList.length === 0) {
          throw new Error('파싱 가능한 명함 연락처가 없습니다.');
        }

        await finalizeParsedList(parsedList);
      } catch (err: any) {
        alert('파일 처리 중 오류가 발생했습니다: ' + err.message);
      }
    };

    reader.onerror = () => {
      alert('파일을 읽는 중 오류가 발생했습니다.');
    };

    reader.readAsText(file);
  };

  // [추가] 파싱까지 끝난 명함 목록을 이미지 생성 + 이름 충돌 검사까지 진행하는 공용 마무리 단계.
  // (기존에 handleFileUpload의 onload 안에 있던 후반부 로직을 그대로 옮긴 것)
  const finalizeParsedList = async (parsedList: BusinessCard[]) => {

        // [수정] 옵션이 켜져 있으면, 데이터만 있던 각 연락처에 정형화된 명함 이미지를 만들어 붙인다
        const finalList = autoGenerateImage
          ? parsedList.map((c) => ({ ...c, frontImage: generateStandardCardImage(c) || undefined, isAutoGeneratedImage: true }))
          : parsedList;

        // [추가] 이름은 같은데 전화번호/이메일이 다른(=서버가 자동으로 못 거르는) 경우를 찾는다.
        // 이런 건 동명이인일 수도, 같은 사람의 바뀐 연락처일 수도 있어서 사용자에게 확인받는다.
        const collisions: NameCollision[] = [];
        finalList.forEach((nc, idx) => {
          const ncName = normalizeName(nc.name);
          if (!ncName) return;
          const existing = contacts.find((ec) => {
            if (normalizeName(ec.name) !== ncName) return false;
            const samePhone = (ec.phoneMobile || '').trim() && (ec.phoneMobile || '').trim() === (nc.phoneMobile || '').trim();
            const sameEmail = (ec.email || '').trim().toLowerCase() && (ec.email || '').trim().toLowerCase() === (nc.email || '').trim().toLowerCase();
            return !samePhone && !sameEmail; // 전화/이메일이 같으면 서버가 이미 알아서 건너뛰므로 여기선 제외
          });
          if (existing) {
            collisions.push({ key: `${idx}-${nc.id}`, newContact: nc, existingContact: existing, resolution: 'add' });
          }
        });

        if (collisions.length > 0) {
          setPendingImportList(finalList);
          setNameCollisions(collisions);
          return; // 사용자가 확인 화면에서 선택을 마치면 그때 runImport를 호출한다
        }

        await runImport(finalList, autoGenerateImage);
  };

  // 이름 충돌 확인 화면에서 사용자가 선택을 마치고 "계속하기"를 눌렀을 때
  const handleResolveCollisions = async () => {
    if (!pendingImportList || !nameCollisions) return;
    const skipIds = new Set(nameCollisions.filter((c) => c.resolution === 'skip').map((c) => c.newContact.id));
    const filtered = pendingImportList.filter((c) => !skipIds.has(c.id));
    setNameCollisions(null);
    setPendingImportList(null);
    await runImport(filtered, autoGenerateImage);
  };

  // [추가] 이름 충돌이 있으면, 평소 화면 대신 확인 화면부터 보여준다.
  if (nameCollisions && nameCollisions.length > 0) {
    const addCount = nameCollisions.filter((c) => c.resolution === 'add').length;
    return (
      <div className="max-w-3xl mx-auto py-8 px-4">
        <div className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 shadow-2xl space-y-6">
          <div className="flex items-center gap-3 border-b border-slate-200 pb-5">
            <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl border border-amber-200">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">이름이 같은 명함이 있어요</h2>
              <p className="text-xs text-slate-400 mt-0.5">전화번호/이메일이 달라서 자동으로 판단하지 못했습니다. 같은 사람이면 "건너뛰기", 다른 사람(동명이인)이면 "새로 추가"를 선택해주세요.</p>
            </div>
          </div>

          <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
            {nameCollisions.map((c, i) => (
              <div key={c.key} className="border border-slate-200 rounded-2xl p-4 bg-slate-50 space-y-3">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-white border border-slate-200 rounded-xl p-3">
                    <p className="text-[10px] font-bold text-slate-400 mb-1">기존에 있던 명함</p>
                    <p className="font-bold text-slate-800">{c.existingContact.name}</p>
                    <p className="text-slate-500 mt-0.5">{c.existingContact.company || '회사 미등록'}</p>
                    <p className="text-slate-400 mt-0.5 font-mono">{c.existingContact.phoneMobile || c.existingContact.email || '연락처 없음'}</p>
                  </div>
                  <div className="bg-white border border-indigo-200 rounded-xl p-3">
                    <p className="text-[10px] font-bold text-indigo-500 mb-1">새로 가져오는 명함</p>
                    <p className="font-bold text-slate-800">{c.newContact.name}</p>
                    <p className="text-slate-500 mt-0.5">{c.newContact.company || '회사 미등록'}</p>
                    <p className="text-slate-400 mt-0.5 font-mono">{c.newContact.phoneMobile || c.newContact.email || '연락처 없음'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setNameCollisions((prev) => prev!.map((x, idx) => idx === i ? { ...x, resolution: 'add' } : x))}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${c.resolution === 'add' ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-100'}`}
                  >
                    다른 사람 · 새로 추가
                  </button>
                  <button
                    type="button"
                    onClick={() => setNameCollisions((prev) => prev!.map((x, idx) => idx === i ? { ...x, resolution: 'skip' } : x))}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${c.resolution === 'skip' ? 'bg-slate-700 text-white' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-100'}`}
                  >
                    같은 사람 · 건너뛰기
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-200">
            <p className="text-xs text-slate-400">{addCount}건 새로 추가 · {nameCollisions.length - addCount}건 건너뛰기</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setNameCollisions(null); setPendingImportList(null); setImportStatus(''); }}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold transition-all"
              >
                가져오기 취소
              </button>
              <button
                type="button"
                onClick={handleResolveCollisions}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all"
              >
                선택 완료, 계속 가져오기
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <div className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 shadow-2xl space-y-8">
        
        {/* 헤더 */}
        <div className="flex items-center gap-3 border-b border-slate-200 pb-5">
          <div className="p-3 bg-emerald-50 text-emerald-700 rounded-2xl border border-emerald-500/20">
            <ArrowDownUp className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">연락처 가져오기 / 내보내기 (Import & Export)</h2>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          
          {/* 섹션 1: 명함 백업 내보내기 (Export) */}
          <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 space-y-5 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-blue-400 uppercase font-mono tracking-wider">📤 데이터 내보내기 (Export)</span>
                <Download className="w-4 h-4 text-blue-400" />
              </div>

              {/* 내보내기 범위 선택 */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-600">1. 내보내기 대상 범위 선택</label>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setExportScope('all')}
                    className={`py-2 rounded-xl font-medium border transition-all ${exportScope === 'all' ? 'bg-blue-600 text-white font-bold border-blue-400 shadow' : 'bg-white text-slate-500 border-slate-200 hover:text-white'}`}
                  >
                    전체 명함 ({contacts.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setExportScope('group')}
                    className={`py-2 rounded-xl font-medium border transition-all ${exportScope === 'group' ? 'bg-blue-600 text-white font-bold border-blue-400 shadow' : 'bg-white text-slate-500 border-slate-200 hover:text-white'}`}
                  >
                    특정 그룹별
                  </button>
                  <button
                    type="button"
                    onClick={() => setExportScope('single')}
                    className={`py-2 rounded-xl font-medium border transition-all ${exportScope === 'single' ? 'bg-blue-600 text-white font-bold border-blue-400 shadow' : 'bg-white text-slate-500 border-slate-200 hover:text-white'}`}
                  >
                    개인 명함별
                  </button>
                </div>

                {/* 그룹 선택 콤보 */}
                {exportScope === 'group' && (
                  <select value={selectedGid} onChange={(e) => setSelectedGid(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-700 font-medium mt-2">
                    {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                )}

                {/* 개인 선택 콤보 */}
                {exportScope === 'single' && (
                  <select value={selectedCid} onChange={(e) => setSelectedCid(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-700 font-medium mt-2">
                    {contacts.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.company})</option>)}
                  </select>
                )}
              </div>

              {/* 포맷 선택 */}
              <div className="space-y-2 pt-2">
                <label className="text-xs font-semibold text-slate-600">2. 파일 저장 포맷 규격</label>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setExportFormat('vcf')}
                    className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl border font-bold ${exportFormat === 'vcf' ? 'bg-indigo-600/30 border-indigo-500 text-indigo-600' : 'bg-white border-slate-200 text-slate-500'}`}
                  >
                    <FileText className="w-3.5 h-3.5 text-indigo-400" /> VCF (vCard)
                  </button>
                  <button
                    type="button"
                    onClick={() => setExportFormat('excel')}
                    className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl border font-bold ${exportFormat === 'excel' ? 'bg-emerald-600/30 border-emerald-500 text-emerald-600' : 'bg-white border-slate-200 text-slate-500'}`}
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" /> Excel (.xls)
                  </button>
                  <button
                    type="button"
                    onClick={() => setExportFormat('csv')}
                    className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl border font-bold ${exportFormat === 'csv' ? 'bg-blue-600/30 border-blue-500 text-blue-600' : 'bg-white border-slate-200 text-slate-500'}`}
                  >
                    <FileText className="w-3.5 h-3.5 text-blue-400" /> CSV 파일
                  </button>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleDownload}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-sm shadow-lg shadow-blue-600/30 active:scale-95 transition-all flex items-center justify-center gap-2 mt-6"
            >
              <Download className="w-4 h-4" />
              <span>선택된 명함 ({targetContacts.length}건) 내보내기 파일 다운로드</span>
            </button>
          </div>

          {/* 섹션 2: 외부 주소록 가져오기 (Import) */}
          <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 space-y-5 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-400 uppercase font-mono tracking-wider">📥 외부 명함 파일 불러오기 (Import)</span>
                <Upload className="w-4 h-4 text-emerald-400" />
              </div>

              <div className="aspect-[2/1] w-full rounded-2xl border-2 border-dashed border-slate-200 hover:border-emerald-500/60 bg-slate-100 flex flex-col items-center justify-center p-4 text-center group cursor-pointer relative transition-all">
                <Upload className="w-8 h-8 text-slate-400 group-hover:text-emerald-400 transition-colors mb-2" />
                <span className="text-xs font-bold text-slate-700">여기를 클릭하여 파일 선택</span>
                <span className="text-[11px] text-slate-400 mt-1">지원 확장자: .vcf, .csv, .xls</span>
                <input type="file" accept=".vcf,.csv,.xls,.xlsx" onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
              </div>

              {/* [수정] 가져온 연락처에 자동으로 명함 이미지를 만들어 붙일지 선택 */}
              <label className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-100 border border-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoGenerateImage}
                  onChange={(e) => setAutoGenerateImage(e.target.checked)}
                  className="w-4 h-4 accent-emerald-500"
                />
                <span className="text-xs text-slate-600">
                  사진이 없는 연락처에 <span className="text-emerald-400 font-semibold">정형화된 명함 이미지 자동 생성</span>
                  <span className="block text-[10px] text-slate-400 mt-0.5">이름·회사·연락처로 깔끔한 명함 이미지를 자동으로 만들어줘요 (AI 생성 아님, 즉시 처리)</span>
                </span>
              </label>
            </div>

            {importStatus && (
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-500/30 text-xs text-emerald-700 font-medium flex items-center gap-2 animate-fadeIn">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{importStatus}</span>
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
};
