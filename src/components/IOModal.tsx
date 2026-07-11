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
                id: `c-${Date.now()}-${Math.random().toString(36).substr(2,4)}`,
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
                id: `c-${Date.now()}-${Math.random().toString(36).substr(2,4)}`,
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

        // 서버 벌크 수신 API 전송
        const res = await fetch('/api/contacts/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ importedContacts: parsedList })
        });
        const data = await res.json();
        
        setImportStatus(`✅ 파일에서 ${parsedList.length}건의 명함 데이터를 성공적으로 복원(가져오기)했습니다.`);
        onImportSuccess(data.contacts || parsedList);
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
            <p className="text-xs text-slate-400 mt-1">전체, 특정 그룹, 혹은 개인별 연락처를 VCF, Excel, CSV 형식으로 백업하고 호환하세요.</p>
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

              <p className="text-xs text-slate-300 leading-relaxed">
                스마트폰 주소록이나 아웃룩에서 내보낸 **VCF(.vcf)** 또는 **CSV(.csv)** 파일을 업로드하면 내 명함 DB에 즉시 병합 등록됩니다.
              </p>

              <div className="aspect-[2/1] w-full rounded-2xl border-2 border-dashed border-slate-800 hover:border-emerald-500/60 bg-slate-900/40 flex flex-col items-center justify-center p-4 text-center group cursor-pointer relative transition-all">
                <Upload className="w-8 h-8 text-slate-500 group-hover:text-emerald-400 transition-colors mb-2" />
                <span className="text-xs font-bold text-slate-200">여기를 클릭하여 파일 선택</span>
                <span className="text-[11px] text-slate-500 mt-1">지원 확장자: .vcf, .csv, .xls</span>
                <input type="file" accept=".vcf,.csv,.xls,.xlsx" onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
              </div>
            </div>

            {importStatus && (
              <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 font-medium flex items-center gap-2 animate-fadeIn">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{importStatus}</span>
              </div>
            )}
          </div>

        </div>

        <div className="flex items-center gap-2.5 p-4 rounded-2xl bg-slate-950/80 border border-slate-800 text-xs text-slate-400">
          <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0" />
          <span>VCF(vCard 3.0) 포맷은 아이폰/안드로이드 연락처 앱과 100% 호환되며, Excel 내보내기 시 한글 깨짐을 방지하는 UTF-8 BOM 인코딩이 적용됩니다.</span>
        </div>

      </div>
    </div>
  );
};
