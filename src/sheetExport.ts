// 엑셀(.xlsx)·PDF 저장 공용 도구. 표(HTML)를 격자로 읽어 진짜 xlsx와 A4 PDF를 만들고,
// 아이폰은 공유 창(파일에 저장/iCloud/PC 전송)으로, 그 외에는 다운로드로 저장한다.

export const saveBlobFileShareOrDownload = async (blob: Blob, fileName: string): Promise<void> => {
  const file = new File([blob], fileName, { type: blob.type });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: fileName.replace(/\.[^.]+$/, '') });
      return;
    }
  } catch (err) {
    if ((err as { name?: string } | null)?.name === 'AbortError') return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};


// ── HTML 양식 → 격자(셀) 모델: 엑셀(.xlsx)과 PDF(캔버스)를 같은 격자로 만들어 글자 위치·칸 크기를 맞춘다 ──
export type GridCell = { r: number; c: number; rs: number; cs: number; text: string; bold: boolean; bg?: string; align: 'left' | 'center' | 'right'; border: boolean; height?: number; img?: string };
export type SheetGrid = { colPct: number[]; cells: GridCell[]; rowCount: number };

const gridHexToArgb = (hex: string): string => {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((ch) => ch + ch).join('');
  return `FF${h.toUpperCase()}`;
};

const wrapLinesForCanvas = (ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] => {
  const out: string[] = [];
  String(text ?? '').split('\n').forEach((para) => {
    let line = '';
    for (const ch of para) {
      const test = line + ch;
      if (line && ctx.measureText(test).width > maxW) { out.push(line); line = ch; } else { line = test; }
    }
    out.push(line);
  });
  return out.length ? out : [''];
};

export const buildSheetGrid = (html: string): SheetGrid => {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const root = doc.body;
  const colPct: number[] = [];
  const cg = root.querySelector('colgroup');
  if (cg) {
    const cols = Array.from(cg.querySelectorAll('col'));
    cols.forEach((col) => {
      const m = (col.getAttribute('style') || '').match(/width:\s*([\d.]+)%/);
      colPct.push(m ? parseFloat(m[1]) : 100 / cols.length);
    });
  }
  if (colPct.length === 0) {
    let maxCols = 1;
    root.querySelectorAll('tr').forEach((tr) => {
      let n = 0;
      Array.from(tr.children).forEach((cell) => { n += Math.max(1, (cell as HTMLTableCellElement).colSpan || 1); });
      maxCols = Math.max(maxCols, n);
    });
    for (let i = 0; i < maxCols; i++) colPct.push(100 / maxCols);
  }
  const colCount = colPct.length;
  const cells: GridCell[] = [];
  let cursor = 0;

  const textOf = (el: Element): string => {
    const clone = el.cloneNode(true) as Element;
    clone.querySelectorAll('br').forEach((br) => br.replaceWith('\u0001'));
    return (clone.textContent || '').replace(/\s+/g, ' ').split('\u0001').map((s) => s.trim()).join('\n').trim();
  };

  const addTableGrid = (table: HTMLTableElement) => {
    const occupied: boolean[][] = [];
    const isOcc = (r: number, c: number) => !!occupied[r] && !!occupied[r][c];
    const mark = (r: number, c: number) => { occupied[r] = occupied[r] || []; occupied[r][c] = true; };
    const rows = Array.from(table.rows);
    rows.forEach((tr, ri) => {
      const r = cursor + ri;
      let c = 0;
      (Array.from(tr.cells) as HTMLTableCellElement[]).forEach((td) => {
        while (isOcc(r, c)) c++;
        const rs = Math.max(1, td.rowSpan || 1);
        const cs = Math.max(1, td.colSpan || 1);
        const style = td.getAttribute('style') || '';
        const heightMatch = style.match(/height:\s*(\d+)px/);
        const img = td.querySelector('img');
        const imgSrc = img ? img.getAttribute('src') || '' : '';
        const align: 'left' | 'center' | 'right' = /text-align:\s*right/.test(style) ? 'right'
          : /text-align:\s*left/.test(style) ? 'left'
          : (td.tagName === 'TH' || /text-align:\s*center/.test(style)) ? 'center' : 'left';
        const bgMatch = style.match(/background-color:\s*(#[0-9a-fA-F]{3,6})/);
        cells.push({
          r, c, rs, cs,
          text: img ? '' : textOf(td),
          bold: td.tagName === 'TH' || /font-weight:\s*bold/.test(style),
          bg: bgMatch ? bgMatch[1] : undefined,
          align,
          border: /border:\s*[\d.]+(pt|px)\s*solid/.test(style),
          height: heightMatch && rs === 1 ? Number(heightMatch[1]) : undefined,
          img: imgSrc.startsWith('data:image/') ? imgSrc : undefined,
        });
        for (let dr = 0; dr < rs; dr++) for (let dc = 0; dc < cs; dc++) mark(r + dr, c + dc);
        c += cs;
      });
    });
    cursor += rows.length;
  };

  const walk = (el: Element) => {
    Array.from(el.children).forEach((child) => {
      if (child.tagName === 'TABLE') {
        const nested = child.querySelector('table');
        if (nested) {
          Array.from(child.querySelectorAll('td')).filter((td) => td.closest('table') === child).forEach((td) => walk(td));
        } else {
          addTableGrid(child as HTMLTableElement);
        }
        cursor += 1;
      } else if (child.querySelector('table')) {
        walk(child);
      } else {
        const text = textOf(child);
        if (text) {
          const html2 = child.innerHTML;
          const centered = /text-align:\s*center/.test(child.getAttribute('style') || '') || /text-align:\s*center/.test(html2);
          cells.push({ r: cursor, c: 0, rs: 1, cs: colCount, text, bold: /font-weight:\s*bold/.test(html2), align: centered ? 'center' : 'left', border: false, height: 40 });
          cursor += 1;
        }
      }
    });
  };

  walk(root);
  return { colPct, cells, rowCount: cursor };
};

export const writeSheetGridXlsx = async (grid: SheetGrid, sheetName: string): Promise<Blob> => {
  const ExcelJS = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  grid.colPct.forEach((p, i) => { ws.getColumn(i + 1).width = Math.max(4, p * 1.6); });
  grid.cells.forEach((cell) => {
    const top = cell.r + 1;
    const left = cell.c + 1;
    const bottom = cell.r + cell.rs;
    const right = cell.c + cell.cs;
    for (let rr = top; rr <= bottom; rr++) {
      for (let cc = left; cc <= right; cc++) {
        const xc = ws.getCell(rr, cc);
        xc.alignment = { vertical: 'middle', horizontal: cell.align, wrapText: true };
        xc.font = { name: 'Malgun Gothic', size: 10, bold: cell.bold };
        if (cell.border) {
          xc.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        }
        if (cell.bg) xc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: gridHexToArgb(cell.bg) } };
      }
    }
    if (cell.rs > 1 || cell.cs > 1) ws.mergeCells(top, left, bottom, right);
    if (cell.text) ws.getCell(top, left).value = cell.text;
    if (cell.height && cell.rs === 1) ws.getRow(top).height = cell.height * 0.75;
    if (cell.img) {
      const m = cell.img.match(/^data:image\/(png|jpeg|jpg|gif);base64,(.+)$/);
      if (m) {
        const ext = (m[1] === 'jpg' ? 'jpeg' : m[1]) as 'png' | 'jpeg' | 'gif';
        const imgId = wb.addImage({ base64: m[2], extension: ext });
        ws.addImage(imgId, { tl: { col: cell.c + 0.1, row: cell.r + 0.1 }, br: { col: cell.c + cell.cs - 0.1, row: cell.r + cell.rs - 0.1 }, editAs: 'oneCell' });
      }
    }
  });
  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
};

export const renderSheetGridToCanvas = async (grid: SheetGrid): Promise<HTMLCanvasElement> => {
  const S = 2;
  const W = 760 * S;
  const PAD = 6 * S;
  const LH = 18 * S;
  const FONT = 13 * S;
  const BASE_H = 30 * S;
  const FAMILY = "'Apple SD Gothic Neo','Malgun Gothic',Arial,sans-serif";
  const colW = grid.colPct.map((p) => (p / 100) * W);
  const colLeft: number[] = [0];
  colW.forEach((w) => colLeft.push(colLeft[colLeft.length - 1] + w));
  const measure = document.createElement('canvas').getContext('2d');
  if (!measure) throw new Error('캔버스를 만들 수 없습니다.');
  const rowH: number[] = Array.from({ length: grid.rowCount }, () => 8 * S);
  const hasCell: boolean[] = Array.from({ length: grid.rowCount }, () => false);
  grid.cells.forEach((cell) => {
    hasCell[cell.r] = true;
    if (cell.rs !== 1) return;
    const w = colLeft[cell.c + cell.cs] - colLeft[cell.c] - PAD * 2;
    measure.font = `${cell.bold ? 'bold ' : ''}${FONT}px ${FAMILY}`;
    const lines = cell.text ? wrapLinesForCanvas(measure, cell.text, w).length : 1;
    const need = lines * LH + PAD * 2;
    const base = cell.height ? cell.height * S : BASE_H;
    rowH[cell.r] = Math.max(rowH[cell.r], need, base);
  });
  grid.cells.forEach((cell) => {
    if (cell.rs === 1 && !hasCell[cell.r]) return;
  });
  const rowTop: number[] = [0];
  rowH.forEach((h) => rowTop.push(rowTop[rowTop.length - 1] + h));
  const H = rowTop[rowTop.length - 1];
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = Math.max(1, Math.ceil(H));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('캔버스를 만들 수 없습니다.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, canvas.height);
  for (const cell of grid.cells) {
    const x = colLeft[cell.c];
    const y = rowTop[cell.r];
    const w = colLeft[cell.c + cell.cs] - x;
    const h = rowTop[cell.r + cell.rs] - y;
    if (cell.bg) { ctx.fillStyle = cell.bg; ctx.fillRect(x, y, w, h); }
    if (cell.border) {
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = S;
      ctx.strokeRect(x + S / 2, y + S / 2, w - S, h - S);
    }
    if (cell.img) {
      try {
        const im = new Image();
        im.src = cell.img;
        await im.decode();
        const maxW = w - PAD * 2;
        const maxH = h - PAD * 2;
        const ratio = Math.min(maxW / im.width, maxH / im.height, 1);
        const dw = im.width * ratio;
        const dh = im.height * ratio;
        ctx.drawImage(im, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
      } catch {
        // 서명 이미지를 읽지 못하면 빈칸으로 둔다
      }
    }
    if (cell.text) {
      ctx.fillStyle = '#000000';
      ctx.font = `${cell.bold ? 'bold ' : ''}${FONT}px ${FAMILY}`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      const lines = wrapLinesForCanvas(ctx, cell.text, w - PAD * 2);
      const blockH = lines.length * LH;
      const firstY = y + (h - blockH) / 2 + LH / 2;
      const tx = cell.align === 'right' ? x + w - PAD : cell.align === 'center' ? x + w / 2 : x + PAD;
      ctx.textAlign = cell.align === 'right' ? 'right' : cell.align === 'center' ? 'center' : 'left';
      lines.forEach((ln, i) => ctx.fillText(ln, tx, firstY + i * LH));
    }
  }
  return canvas;
};

export const canvasToPdfShare = async (canvas: HTMLCanvasElement, fileName: string): Promise<void> => {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageH = 297;
  const pageW = 210;
  const margin = 10;
  const imgW = pageW - margin * 2;
  const pxPerMm = canvas.width / imgW;
  const sliceH = Math.floor((pageH - margin * 2) * pxPerMm);
  let y = 0;
  let first = true;
  while (y < canvas.height) {
    const h = Math.min(sliceH, canvas.height - y);
    const part = document.createElement('canvas');
    part.width = canvas.width;
    part.height = h;
    const ctx = part.getContext('2d');
    if (!ctx) throw new Error('캔버스를 만들 수 없습니다.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, part.width, part.height);
    ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
    if (!first) pdf.addPage();
    first = false;
    pdf.addImage(part.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, imgW, h / pxPerMm);
    y += h;
  }
  await saveBlobFileShareOrDownload(pdf.output('blob'), fileName);
};

