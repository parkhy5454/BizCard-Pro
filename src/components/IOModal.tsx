import React, { useState } from 'react';
import { ArrowDownUp, Download, Upload, FileSpreadsheet, FileText, CheckCircle2, ShieldAlert } from 'lucide-react';
import { BusinessCard, ContactGroup } from '../types.js';

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

  const ACCENT_COLORS = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];
  const pickAccentColor = (seed: string) => {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    return ACCENT_COLORS[hash % ACCENT_COLORS.length];
  };

  // 이름/회사/연락처 정보로 정형화된 명함 이미지를 캔버스로 그려서 데이터 URL로 반환
  const generateStandardCardImage = (c: BusinessCard): string => {
    const canvas = document.createElement('canvas');
    const W = 1050, H = 662; // 실제 명함과 동일한 1.586 : 1 비율
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    const accent = pickAccentColor(c.company || c.name || 'x');

    // 배경
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    // 왼쪽 세로 악센트 바 (회사/이름에 따라 색이 달라져서 시각적으로 구분됨)
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, 22, H);

    // 회사명
    if (c.company) {
      ctx.fillStyle = accent;
      ctx.font = 'bold 32px "Malgun Gothic", sans-serif';
      ctx.fillText(c.company, 68, 88);
    }

    // 성명
    ctx.fillStyle = '#111827';
    ctx.font = 'bold 56px "Malgun Gothic", sans-serif';
    ctx.fillText(c.name || '이름없음', 68, 188);

    // 직책 · 부서
    const titleLine = [c.title, c.department].filter(Boolean).join(' · ');
    if (titleLine) {
      ctx.fillStyle = '#6b7280';
      ctx.font = '28px "Malgun Gothic", sans-serif';
      ctx.fillText(titleLine, 68, 232);
    }

    // 구분선
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(68, 300);
    ctx.lineTo(W - 60, 300);
    ctx.stroke();

    // 연락처 정보
    ctx.font = '25px "Malgun Gothic", sans-serif';
    ctx.fillStyle = '#374151';
    let y = 360;
    const lineHeight = 48;
    if (c.phoneMobile) { ctx.fillText(`M   ${c.phoneMobile}`, 68, y); y += lineHeight; }
    if (c.phoneOffice) { ctx.fillText(`T   ${c.phoneOffice}`, 68, y); y += lineHeight; }
    if (c.email) { ctx.fillText(`E   ${c.email}`, 68, y); y += lineHeight; }
    if (c.address) {
      ctx.font = '21px "Malgun Gothic", sans-serif';
      ctx.fillStyle = '#6b7280';
      ctx.fillText(`A   ${c.address.length > 42 ? c.address.slice(0, 42) + '…' : c.address}`, 68, y);
    }

    // 우측 하단 "가져온 연락처" 표시 (실제 명함 스캔과 구분되도록)
    ctx.font = '18px "Malgun Gothic", sans-serif';
    ctx.fillStyle = '#d1d5db';
    ctx.textAlign = 'right';
    ctx.fillText('가져온 연락처 · 사진 없음', W - 40, H - 30);
    ctx.textAlign = 'left';

    return canvas.toDataURL('image/png');
  };

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
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const text = reader.result as string;
      const parsedList: BusinessCard[] = [];

      try {
        if (file.name.endsWith('.vcf')) {
          // 간이 vCard 파싱
          const vcards = text.split(/BEGIN:VCARD/i).filter(Boolean);
          vcards.forEach((vc) => {
            const fnMatch = vc.match(/FN:(.*)/i) || vc.match(/N:(.*)/i);
            if (fnMatch) {
              const name = fnMatch[1].replace(/;/g, '').trim();
              const orgMatch = vc.match(/ORG:(.*)/i);
              const titleMatch = vc.match(/TITLE:(.*)/i);
              const cellMatch = vc.match(/TEL.*CELL.*:(.*)/i) || vc.match(/TEL:(.*)/i);
              const workMatch = vc.match(/TEL.*WORK.*:(.*)/i);
              const faxMatch = vc.match(/TEL.*FAX.*:(.*)/i);
              const emailMatch = vc.match(/EMAIL.*:(.*)/i);
              const adrMatch = vc.match(/ADR.*:(.*)/i);

              parsedList.push({
                id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
                name: name || '이름없음',
                company: orgMatch ? orgMatch[1].split(';')[0].trim() : '',
                department: orgMatch && orgMatch[1].split(';')[1] ? orgMatch[1].split(';')[1].trim() : '',
                title: titleMatch ? titleMatch[1].trim() : '',
                phoneMobile: cellMatch ? cellMatch[1].trim() : '',
                phoneOffice: workMatch ? workMatch[1].trim() : '',
                phoneFax: faxMatch ? faxMatch[1].trim() : '',
                email: emailMatch ? emailMatch[1].trim() : '',
                address: adrMatch ? adrMatch[1].replace(/;/g, ' ').trim() : '',
                groupId: groups[0]?.id || 'g-client',
                createdAt: new Date().toISOString(),
                callHistory: []
              });
            }
          });
        } else {
          // CSV / 엑셀(.csv) 파싱
          const lines = text.split(/\r?\n/).filter(Boolean);
          const dataLines = lines.slice(1); // 헤더 제외
          dataLines.forEach((line) => {
            const cols = line.split(',').map((s) => s.replace(/^"|"$/g, '').trim());
            if (cols[0]) {
              parsedList.push({
                id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
                name: cols[0] || '이름없음',
                company: cols[1] || '',
                department: cols[2] || '',
                title: cols[3] || '',
                phoneMobile: cols[4] || '',
                phoneOffice: cols[5] || '',
                phoneFax: cols[6] || '',
                email: cols[7] || '',
                address: cols[8] || '',
                memo: cols[9] || '',
                groupId: groups[0]?.id || 'g-client',
                createdAt: new Date().toISOString(),
                callHistory: []
              });
            }
          });
        }

        if (parsedList.length === 0) {
          throw new Error('파싱 가능한 명함 연락처가 없습니다.');
        }

        // [수정] 옵션이 켜져 있으면, 데이터만 있던 각 연락처에 정형화된 명함 이미지를 만들어 붙인다
        const finalList = autoGenerateImage
          ? parsedList.map((c) => ({ ...c, frontImage: generateStandardCardImage(c) || undefined }))
          : parsedList;

        // [수정] 예전에는 수천 건을 통째로 한 번의 요청에 담아 보냈는데, 자동 생성 명함
        // 이미지까지 붙으면 요청 하나가 수백MB로 불어나서 (특히 아이패드/아이폰에서)
        // 서버 용량 제한에 걸리거나 메모리 부담으로 실패했다. 그 실패 응답이 JSON이 아닌
        // 경우, Safari는 이걸 "The string did not match the expected pattern"이라는
        // 알아보기 힘든 메시지로 표시한다 — 실제로는 "요청이 너무 큼" 문제였던 것.
        // 이제는 일정 건수씩(배치) 나눠서 순차적으로 보낸다.
        const BATCH_SIZE = 100;
        let latestFullContactList: BusinessCard[] = [];
        let totalSkippedDuplicates = 0;
        for (let i = 0; i < finalList.length; i += BATCH_SIZE) {
          const batch = finalList.slice(i, i + BATCH_SIZE);
          setImportStatus(`⏳ 가져오는 중... (${Math.min(i + BATCH_SIZE, finalList.length)}/${finalList.length}건)`);

          const res = await fetch('/api/contacts/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ importedContacts: batch })
          });

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
        setImportStatus(`✅ 파일에서 ${finalList.length - totalSkippedDuplicates}건의 명함 데이터를 성공적으로 복원(가져오기)했습니다.${dupMsg}${autoGenerateImage ? ' 명함 이미지도 자동으로 만들었어요.' : ''}`);
        onImportSuccess(latestFullContactList);
      } catch (err: any) {
        alert('파일 가져오기 실패: ' + err.message);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-2xl space-y-8">
        
        {/* 헤더 */}
        <div className="flex items-center gap-3 border-b border-slate-800 pb-5">
          <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-2xl border border-emerald-500/20">
            <ArrowDownUp className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white tracking-tight">연락처 가져오기 / 내보내기 (Import & Export)</h2>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          
          {/* 섹션 1: 명함 백업 내보내기 (Export) */}
          <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 space-y-5 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-blue-400 uppercase font-mono tracking-wider">📤 데이터 내보내기 (Export)</span>
                <Download className="w-4 h-4 text-blue-400" />
              </div>

              {/* 내보내기 범위 선택 */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300">1. 내보내기 대상 범위 선택</label>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setExportScope('all')}
                    className={`py-2 rounded-xl font-medium border transition-all ${exportScope === 'all' ? 'bg-blue-600 text-white font-bold border-blue-400 shadow' : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'}`}
                  >
                    전체 명함 ({contacts.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setExportScope('group')}
                    className={`py-2 rounded-xl font-medium border transition-all ${exportScope === 'group' ? 'bg-blue-600 text-white font-bold border-blue-400 shadow' : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'}`}
                  >
                    특정 그룹별
                  </button>
                  <button
                    type="button"
                    onClick={() => setExportScope('single')}
                    className={`py-2 rounded-xl font-medium border transition-all ${exportScope === 'single' ? 'bg-blue-600 text-white font-bold border-blue-400 shadow' : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'}`}
                  >
                    개인 명함별
                  </button>
                </div>

                {/* 그룹 선택 콤보 */}
                {exportScope === 'group' && (
                  <select value={selectedGid} onChange={(e) => setSelectedGid(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-medium mt-2">
                    {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                )}

                {/* 개인 선택 콤보 */}
                {exportScope === 'single' && (
                  <select value={selectedCid} onChange={(e) => setSelectedCid(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-medium mt-2">
                    {contacts.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.company})</option>)}
                  </select>
                )}
              </div>

              {/* 포맷 선택 */}
              <div className="space-y-2 pt-2">
                <label className="text-xs font-semibold text-slate-300">2. 파일 저장 포맷 규격</label>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setExportFormat('vcf')}
                    className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl border font-bold ${exportFormat === 'vcf' ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300' : 'bg-slate-900 border-slate-800 text-slate-400'}`}
                  >
                    <FileText className="w-3.5 h-3.5 text-indigo-400" /> VCF (vCard)
                  </button>
                  <button
                    type="button"
                    onClick={() => setExportFormat('excel')}
                    className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl border font-bold ${exportFormat === 'excel' ? 'bg-emerald-600/30 border-emerald-500 text-emerald-300' : 'bg-slate-900 border-slate-800 text-slate-400'}`}
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" /> Excel (.xls)
                  </button>
                  <button
                    type="button"
                    onClick={() => setExportFormat('csv')}
                    className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl border font-bold ${exportFormat === 'csv' ? 'bg-blue-600/30 border-blue-500 text-blue-300' : 'bg-slate-900 border-slate-800 text-slate-400'}`}
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
          <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 space-y-5 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-400 uppercase font-mono tracking-wider">📥 외부 명함 파일 불러오기 (Import)</span>
                <Upload className="w-4 h-4 text-emerald-400" />
              </div>

              <div className="aspect-[2/1] w-full rounded-2xl border-2 border-dashed border-slate-800 hover:border-emerald-500/60 bg-slate-900/40 flex flex-col items-center justify-center p-4 text-center group cursor-pointer relative transition-all">
                <Upload className="w-8 h-8 text-slate-500 group-hover:text-emerald-400 transition-colors mb-2" />
                <span className="text-xs font-bold text-slate-200">여기를 클릭하여 파일 선택</span>
                <span className="text-[11px] text-slate-500 mt-1">지원 확장자: .vcf, .csv, .xls</span>
                <input type="file" accept=".vcf,.csv,.xls,.xlsx" onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
              </div>

              {/* [수정] 가져온 연락처에 자동으로 명함 이미지를 만들어 붙일지 선택 */}
              <label className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-900/60 border border-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoGenerateImage}
                  onChange={(e) => setAutoGenerateImage(e.target.checked)}
                  className="w-4 h-4 accent-emerald-500"
                />
                <span className="text-xs text-slate-300">
                  사진이 없는 연락처에 <span className="text-emerald-400 font-semibold">정형화된 명함 이미지 자동 생성</span>
                  <span className="block text-[10px] text-slate-500 mt-0.5">이름·회사·연락처로 깔끔한 명함 이미지를 자동으로 만들어줘요 (AI 생성 아님, 즉시 처리)</span>
                </span>
              </label>
            </div>

            {importStatus && (
              <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 font-medium flex items-center gap-2 animate-fadeIn">
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
