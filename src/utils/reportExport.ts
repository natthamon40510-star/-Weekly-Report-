import { Task, AppSettings } from '../types';
import {
  formatThaiDate,
  daysOfTask,
  isTaskInWeek,
  isTaskCarriedForward,
  isTaskLate,
  formatWeekRange,
  workdays,
  addDays,
} from './dateUtils';
import { XL } from './xlsxWriter';

// Helper to save browser file
export function browserSave(filename: string, data: Blob | Uint8Array | string) {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  const types: Record<string, string> = {
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    pdf: 'application/pdf',
    png: 'image/png',
    csv: 'text/csv;charset=utf-8',
    zip: 'application/zip',
    json: 'application/json',
  };

  const blob =
    data instanceof Blob ? data : new Blob([data as unknown as BlobPart], { type: types[ext] || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// Thai word-wrapping helper using Intl.Segmenter
let _segmenter: Intl.Segmenter | null = null;
function wrapText(ctx: CanvasRenderingContext2D, text: unknown, maxW: number): string[] {
  const out: string[] = [];
  try {
    if (!_segmenter) _segmenter = new Intl.Segmenter('th', { granularity: 'word' });
  } catch (_) {
    _segmenter = null;
  }

  for (const para of String(text ?? '').split('\n')) {
    const words = _segmenter ? [..._segmenter.segment(para)].map(x => x.segment) : [...para];
    let line = '';
    for (const w of words) {
      if (ctx.measureText(line + w).width <= maxW) {
        line += w;
        continue;
      }
      if (line) {
        out.push(line.trimEnd());
        line = '';
      }
      if (ctx.measureText(w).width <= maxW) {
        line = w.trimStart();
        continue;
      }
      for (const ch of w) {
        if (line && ctx.measureText(line + ch).width > maxW) {
          out.push(line);
          line = ch;
        } else {
          line += ch;
        }
      }
    }
    out.push(line.trimEnd());
  }
  return out;
}

function loadImg(src: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

const PRX = ['#2f8fe0', '#d9780f', '#e0384f', '#6a5fc9', '#14a3a0', '#e0a030'];

export interface RenderResult {
  canvas: HTMLCanvasElement;
  W: number;
  H: number;
  S: number;
  bounds: number[];
  BAN: number;
  tableTop: number;
  headH: number;
  F: string;
}

/**
 * Renders complete webpage report into a high-resolution canvas (1400px Retina)
 * matching the visual design, banner, KPI cards, charts, and table.
 */
export async function renderReportCanvas(
  tasks: Task[],
  settings: AppSettings,
  weekMonday: string,
  rangeTitle?: string
): Promise<RenderResult | null> {
  const rows = [...tasks].sort((a, b) => (a.ord ?? a.created) - (b.ord ?? b.created));
  if (!rows.length) return null;

  const bounds: number[] = [];
  const F = '"IBM Plex Sans Thai","Noto Sans Thai",system-ui,sans-serif';

  try {
    await document.fonts.load('400 13px "IBM Plex Sans Thai"');
    await document.fonts.load('600 13px "IBM Plex Sans Thai"');
  } catch (_) {}

  const W = 1400;
  const S = 2; // Retina 2x scale
  const PAD = 25;
  const LH = 20;
  const CP = 8;
  const BAN = 120;

  const cols: Array<[string, number, string?]> = [
    ['ลำดับ', 50, 'c'],
    ['รายการงานที่ทำ', 230],
    ['โครงการ', 110],
    ['กลุ่มงาน', 90],
    ['ประเภทงาน', 100],
    ['ระดับความสำคัญ', 100],
    ['แผนจบที่วางไว้\n(วันที่)', 110],
    ['วันที่เริ่มต้นทำจริง\n(วันที่)', 100],
    ['วันที่แล้วเสร็จ\n(วันที่)', 100],
    ['เวลาที่ใช้จริง\n(วัน)', 70, 'c'],
    ['สถานะ', 90],
    ['อัปเดตล่าสุด / ปัญหา & ข้อช่วยเหลือ', 200],
  ];

  const measureCanvas = document.createElement('canvas');
  const m = measureCanvas.getContext('2d')!;
  m.font = `600 12px ${F}`;

  const headLines = cols.map(c => wrapText(m, c[0], c[1] - 2 * CP));
  const headH = Math.max(...headLines.map(l => l.length)) * 18 + 2 * CP;

  m.font = `400 13px ${F}`;
  const cells = rows.map((t, i) => [
    String(i + 1),
    t.title + (isTaskCarriedForward(t, weekMonday) ? `\n(ยกมาจากสัปดาห์ ${formatThaiDate(t.week)})` : ''),
    t.project || '–',
    t.group,
    t.type,
    t.priority,
    formatThaiDate(t.plan),
    formatThaiDate(t.start),
    formatThaiDate(t.actual),
    daysOfTask(t).toFixed(1),
    t.status,
    t.note || '',
  ]);

  const lines = cells.map(r => r.map((v, i) => wrapText(m, v, cols[i][1] - 2 * CP)));
  const rh = lines.map(l => Math.max(36, Math.max(...l.map(x => x.length)) * LH + 2 * CP));

  // Type stats
  const typeCounts: Record<string, { count: number; days: number }> = {};
  settings.types.forEach(t => {
    typeCounts[t] = { count: 0, days: 0 };
  });
  rows.forEach(t => {
    if (!typeCounts[t.type]) typeCounts[t.type] = { count: 0, days: 0 };
    typeCounts[t.type].count++;
    typeCounts[t.type].days += daysOfTask(t);
  });
  const typeEntries = Object.entries(typeCounts);

  const KH = 72;
  const pw4 = (W - 2 * PAD - 48) / 4;
  const secH = Math.max(130, 44 + Math.max(typeEntries.length, 3) * 24 + 14);

  const totalTableHeight = rh.reduce((a, b) => a + b, 0);
  const H = BAN + 16 + (KH + 16 + secH + 16) + headH + totalTableHeight + 20 + 54;

  const canvas = document.createElement('canvas');
  canvas.width = W * S;
  canvas.height = H * S;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(S, S);
  ctx.textBaseline = 'top';

  // White background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // Top banner with gradient
  const grad = ctx.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, '#1f3b7a');
  grad.addColorStop(0.6, '#2f55a8');
  grad.addColorStop(1, '#4a82d4');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, BAN);

  // Banner text
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 24px ${F}`;
  ctx.fillText('แผนและสรุปบันทึกงานประจำสัปดาห์ (Weekly Report)', PAD, 22);

  ctx.font = `400 15px ${F}`;
  ctx.fillText(`ชื่อ: ${settings.name || '...............................................'}`, PAD, 60);
  ctx.fillText(`ช่วงวันที่: ${rangeTitle || formatWeekRange(weekMonday)}`, PAD, 84);

  // Logo box
  const lw = 220;
  const lh = 76;
  const lx = W - PAD - lw;
  const ly = 22;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(lx, ly, lw, lh, 12);
  else ctx.rect(lx, ly, lw, lh);
  ctx.fill();

  const logoImg = settings.logo ? await loadImg(settings.logo) : null;
  if (logoImg) {
    const ratio = Math.min((lw - 16) / logoImg.width, (lh - 16) / logoImg.height);
    const iw = logoImg.width * ratio;
    const ih = logoImg.height * ratio;
    ctx.drawImage(logoImg, lx + (lw - iw) / 2, ly + (lh - ih) / 2, iw, ih);
  } else {
    ctx.fillStyle = '#1f3b7a';
    ctx.font = `700 15px ${F}`;
    ctx.textAlign = 'center';
    ctx.fillText('สี่พระยาก่อสร้าง จำกัด', lx + lw / 2, ly + 22);
    ctx.font = `500 11px ${F}`;
    ctx.fillStyle = '#56638a';
    ctx.fillText('Siphya Construction', lx + lw / 2, ly + 44);
    ctx.textAlign = 'left';
  }

  // Helper for rounded rectangles
  const rr = (px: number, py: number, w: number, h: number, r: number, fill?: string, stroke?: string) => {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(px, py, w, h, r);
    else ctx.rect(px, py, w, h);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  };

  // KPI Calculations
  let y = BAN + 16;
  const total = rows.length;
  const done = rows.filter(t => t.status === 'เสร็จสิ้น').length;
  const doing = rows.filter(t => t.status === 'กำลังทำ').length;
  const stuck = rows.filter(t => t.status === 'ติดปัญหา').length;
  const late = rows.filter(isTaskLate).length;
  const daysTotal = rows.reduce((sum, t) => sum + daysOfTask(t), 0);
  const donePct = total ? Math.round((done / total) * 100) : 0;

  const K: Array<[string | number, string, string]> = [
    [total, 'งานทั้งหมด', '#2f4f9e'],
    [`${done} (${donePct}%)`, 'เสร็จสิ้น', '#0f9d72'],
    [doing, 'กำลังทำ', '#2f8fe0'],
    [stuck, 'ติดปัญหา', '#e0384f'],
    [late, 'เลยกำหนดแผน', '#d9780f'],
    [daysTotal.toFixed(1), 'วันที่ใช้จริง', '#14a3a0'],
  ];

  const kw = (W - 2 * PAD - 60) / 6;
  K.forEach((k, i) => {
    const kx = PAD + i * (kw + 12);
    rr(kx, y, kw, KH, 14, '#ffffff');
    rr(kx, y, kw, KH, 14, `${k[2]}1c`, `${k[2]}55`);
    ctx.fillStyle = k[2];
    ctx.font = `600 24px ${F}`;
    ctx.fillText(String(k[0]), kx + 14, y + 10);
    ctx.fillStyle = '#56638a';
    ctx.font = `500 12px ${F}`;
    ctx.fillText(k[1], kx + 14, y + 46);
  });

  y += KH + 16;

  // 4 Chart Panels
  const pxs = (i: number) => PAD + i * (pw4 + 16);
  for (let i = 0; i < 4; i++) {
    rr(pxs(i), y, pw4, secH, 14, '#ffffff', '#d5ddf0');
  }

  ctx.fillStyle = '#56638a';
  ctx.font = `700 12px ${F}`;
  [
    'สถานะงาน',
    'เวลาที่ใช้จริง (วัน) แยกตามประเภทงาน',
    'จำนวน (งาน) แยกตามประเภทงาน',
    'ระดับความสำคัญ (งาน) แยกตามประเภทงาน',
  ].forEach((title, i) => ctx.fillText(title, pxs(i) + 14, y + 14));

  // 1. Status Stacked Bar
  const bx = pxs(0) + 14;
  const bw = pw4 - 28;
  const by = y + 44;
  ctx.save();
  rr(bx, by, bw, 18, 9, '#e5ebf8');
  ctx.clip();
  let sx = bx;
  const statusColors: Array<[string, number, string]> = [
    ['เสร็จสิ้น', done, '#0f9d72'],
    ['กำลังทำ', doing, '#2f8fe0'],
    ['ติดปัญหา', stuck, '#e0384f'],
  ];
  statusColors.forEach(([, count, col]) => {
    const w = (bw * count) / (total || 1);
    if (w > 0) {
      ctx.fillStyle = col;
      ctx.fillRect(sx, by, Math.max(0, w - 2), 18);
      sx += w;
    }
  });
  ctx.restore();

  statusColors.forEach(([name, count, col], i) => {
    const ly2 = y + 78 + i * 24;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(bx + 6, ly2 + 7, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#16233f';
    ctx.font = `400 13px ${F}`;
    ctx.textAlign = 'left';
    ctx.fillText(`${name} ${count}`, bx + 18, ly2);
  });

  // 2. Days by Type
  const PAL = ['#2f4f9e', '#3b93dc', '#14a3a0', '#e0a030', '#e0605a', '#6a5fc9'];
  const maxDays = Math.max(1, ...typeEntries.map(x => x[1].days));
  const maxCounts = Math.max(1, ...typeEntries.map(x => x[1].count));

  typeEntries.forEach(([tName, data], i) => {
    const ty = y + 44 + i * 24;
    ctx.fillStyle = '#16233f';
    ctx.font = `400 12px ${F}`;
    ctx.textAlign = 'left';
    ctx.fillText(tName, pxs(1) + 14, ty);

    const bx2 = pxs(1) + 14 + 88;
    const tw2 = pw4 - 28 - 88 - 36;
    rr(bx2, ty + 3, tw2, 12, 6, '#e5ebf8');
    if (data.days > 0) {
      const full = Math.max(10, (tw2 * data.days) / maxDays);
      rr(bx2, ty + 3, full, 12, 6, PAL[(i + 2) % 6]);
    }
    ctx.fillStyle = '#16233f';
    ctx.textAlign = 'right';
    ctx.font = `600 12px ${F}`;
    ctx.fillText(data.days.toFixed(1), pxs(1) + pw4 - 14, ty);
  });

  // 3. Count by Type
  typeEntries.forEach(([tName, data], i) => {
    const ty = y + 44 + i * 24;
    ctx.fillStyle = '#16233f';
    ctx.font = `400 12px ${F}`;
    ctx.textAlign = 'left';
    ctx.fillText(tName, pxs(2) + 14, ty);

    const bx2 = pxs(2) + 14 + 88;
    const tw2 = pw4 - 28 - 88 - 36;
    rr(bx2, ty + 3, tw2, 12, 6, '#e5ebf8');
    if (data.count > 0) {
      const full = Math.max(10, (tw2 * data.count) / maxCounts);
      rr(bx2, ty + 3, full, 12, 6, PAL[(i + 2) % 6]);
    }
    ctx.fillStyle = '#16233f';
    ctx.textAlign = 'right';
    ctx.font = `600 12px ${F}`;
    ctx.fillText(String(data.count), pxs(2) + pw4 - 14, ty);
  });

  // 4. Priority by Type
  typeEntries.forEach(([tName, data], i) => {
    const ty = y + 44 + i * 24;
    ctx.fillStyle = '#16233f';
    ctx.font = `400 12px ${F}`;
    ctx.textAlign = 'left';
    ctx.fillText(tName, pxs(3) + 14, ty);

    const bx2 = pxs(3) + 14 + 88;
    const tw2 = pw4 - 28 - 88 - 36;
    rr(bx2, ty + 3, tw2, 12, 6, '#e5ebf8');
    const pTasks = rows.filter(t => t.type === tName);

    if (data.count > 0) {
      const full = Math.max(10, (tw2 * data.count) / maxCounts);
      ctx.save();
      rr(bx2, ty + 3, full, 12, 6);
      ctx.clip();
      let q = bx2;
      settings.priorities.forEach((pri, pi) => {
        const cnt = pTasks.filter(t => t.priority === pri).length;
        if (cnt > 0) {
          const w2 = (full * cnt) / data.count;
          ctx.fillStyle = PRX[pi % 6];
          ctx.fillRect(q, ty + 3, Math.max(0, w2 - 2), 12);
          q += w2;
        }
      });
      ctx.restore();
    }
    ctx.fillStyle = '#16233f';
    ctx.textAlign = 'right';
    ctx.font = `600 12px ${F}`;
    ctx.fillText(String(data.count), pxs(3) + pw4 - 14, ty);
  });

  y += secH + 16;
  const tableTop = y;

  // Table header with gradient
  const tgrad = ctx.createLinearGradient(PAD, 0, W - PAD, 0);
  tgrad.addColorStop(0, '#1f3b7a');
  tgrad.addColorStop(1, '#3a68b8');
  ctx.fillStyle = tgrad;
  ctx.fillRect(PAD, y, W - 2 * PAD, headH);

  ctx.fillStyle = '#ffffff';
  ctx.font = `600 12px ${F}`;
  let cx = PAD;
  cols.forEach((col, i) => {
    headLines[i].forEach((ln, k) => {
      ctx.textAlign = col[2] === 'c' ? 'center' : 'left';
      ctx.fillText(ln, col[2] === 'c' ? cx + col[1] / 2 : cx + CP, y + CP + k * 18);
    });
    cx += col[1];
  });
  ctx.textAlign = 'left';
  y += headH;
  bounds.push(y);

  // Table rows
  const statusColorsMap: Record<string, string> = {
    เสร็จสิ้น: '#0f9d72',
    กำลังทำ: '#2f8fe0',
    ติดปัญหา: '#e0384f',
  };

  rows.forEach((t, r) => {
    if (r % 2) {
      ctx.fillStyle = '#eef2fa';
      ctx.fillRect(PAD, y, W - 2 * PAD, rh[r]);
    }
    ctx.fillStyle = statusColorsMap[t.status] || '#d5ddf0';
    ctx.fillRect(PAD, y, 5, rh[r]);
    ctx.fillStyle = '#d5ddf0';
    ctx.fillRect(PAD, y + rh[r] - 1, W - 2 * PAD, 1);

    let px = PAD;
    cols.forEach((col, i) => {
      const late = i === 6 && isTaskLate(t);
      const st = i === 10;
      ctx.font = `${st || i === 1 || late ? '600' : '400'} 13px ${F}`;
      ctx.fillStyle = st
        ? statusColorsMap[t.status] || '#16233f'
        : late
        ? '#e0384f'
        : i === 11
        ? '#56638a'
        : '#16233f';
      ctx.textAlign = col[2] === 'c' ? 'center' : 'left';
      lines[r][i].forEach((ln, k) => {
        ctx.fillText(ln, col[2] === 'c' ? px + col[1] / 2 : px + CP, y + CP + k * LH);
      });
      px += col[1];
    });
    ctx.textAlign = 'left';
    y += rh[r];
    bounds.push(y);
  });

  // Footer
  y += 20;
  ctx.fillStyle = '#d5ddf0';
  ctx.fillRect(PAD, y, W - 2 * PAD, 2);
  ctx.fillStyle = '#56638a';
  ctx.font = `600 14px ${F}`;
  ctx.fillText('Siphya Construction Co., Ltd.', PAD, y + 14);
  ctx.textAlign = 'right';
  ctx.fillText('แผนก QS ส่วนงาน Procurement', W - PAD, y + 14);
  ctx.textAlign = 'left';

  return {
    canvas,
    W,
    H,
    S,
    bounds,
    BAN,
    tableTop,
    headH,
    F,
  };
}

/**
 * Exports high-res PNG image matching the exact webpage
 */
export async function exportReportPNG(tasks: Task[], settings: AppSettings, weekMonday: string, title?: string) {
  const result = await renderReportCanvas(tasks, settings, weekMonday, title);
  if (!result) return;
  result.canvas.toBlob(blob => {
    if (blob) {
      browserSave(`weekly-report-${weekMonday}.png`, blob);
    }
  }, 'image/png');
}

/**
 * Builds binary PDF 1.4 from canvas pages with A4 landscape geometry
 */
function makePDFStream(pages: Array<{ data: Uint8Array; w: number; h: number }>): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offs: number[] = [];
  let len = 0;

  const push = (b: string | Uint8Array) => {
    const u = typeof b === 'string' ? enc.encode(b) : b;
    parts.push(u);
    len += u.length;
  };

  const obj = (id: number, fn: () => void) => {
    offs[id] = len;
    push(`${id} 0 obj\n`);
    fn();
    push('\nendobj\n');
  };

  push('%PDF-1.4\n');
  obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () =>
    push(
      `<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ')}] /Count ${pages.length} >>`
    )
  );

  const PW = 842;
  const PH = 595;
  pages.forEach((j, i) => {
    const id = 3 + i * 3;
    const cs = `q ${PW} 0 0 ${PH} 0 0 cm /Im${i} Do Q`;
    obj(id, () =>
      push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /XObject << /Im${i} ${
          id + 2
        } 0 R >> >> /Contents ${id + 1} 0 R >>`
      )
    );
    obj(id + 1, () => push(`<< /Length ${cs.length} >>\nstream\n${cs}\nendstream`));
    obj(id + 2, () => {
      push(
        `<< /Type /XObject /Subtype /Image /Width ${j.w} /Height ${j.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${j.data.length} >>\nstream\n`
      );
      push(j.data);
      push('\nendstream');
    });
  });

  const total = 3 + pages.length * 3;
  const xr = len;
  push('xref\n0 ' + total + '\n0000000000 65535 f \n');
  for (let i = 1; i < total; i++) {
    push(String(offs[i]).padStart(10, '0') + ' 00000 n \n');
  }
  push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xr}\n%%EOF`);

  const out = new Uint8Array(len);
  let o = 0;
  for (const u of parts) {
    out.set(u, o);
    o += u.length;
  }
  return out;
}

/**
 * Exports PDF document with full page layouts, repeating headers, and A4 landscape pagination
 */
export async function exportReportPDF(tasks: Task[], settings: AppSettings, weekMonday: string, title?: string) {
  const result = await renderReportCanvas(tasks, settings, weekMonday, title);
  if (!result) return;

  const { canvas, W, H, S, bounds, BAN, tableTop, headH, F } = result;
  const pageH = (W * 210) / 297; // A4 aspect ratio
  const GAP = 12;
  const FOOT = 28;
  const pagesDef: Array<{ start: number; end: number; first: boolean; top: number }> = [];

  let start = 0;
  while (start < H - 1) {
    const first = pagesDef.length === 0;
    const top = first ? 0 : BAN + GAP + headH;
    const avail = pageH - top - FOOT;
    let end = H;
    if (start + avail < H) {
      const cand = bounds.filter(b => b > start + 40 && b <= start + avail);
      end = cand.length ? cand[cand.length - 1] : start + avail;
    }
    pagesDef.push({ start, end, first, top });
    start = end;
  }

  const pages: Array<{ data: Uint8Array; w: number; h: number }> = [];
  pagesDef.forEach((pd, idx) => {
    const pc = document.createElement('canvas');
    pc.width = W * S;
    pc.height = Math.round(pageH * S);
    const px = pc.getContext('2d')!;
    px.fillStyle = '#ffffff';
    px.fillRect(0, 0, pc.width, pc.height);

    if (!pd.first) {
      px.drawImage(canvas, 0, 0, W * S, BAN * S, 0, 0, W * S, BAN * S);
      px.drawImage(canvas, 0, tableTop * S, W * S, headH * S, 0, (BAN + GAP) * S, W * S, headH * S);
    }
    px.drawImage(canvas, 0, pd.start * S, W * S, (pd.end - pd.start) * S, 0, pd.top * S, W * S, (pd.end - pd.start) * S);

    px.scale(S, S);
    px.fillStyle = '#56638a';
    px.font = `400 12px ${F}`;
    px.textBaseline = 'top';
    px.textAlign = 'right';
    px.fillText(`หน้า ${idx + 1} / ${pagesDef.length}`, W - 25, pageH - FOOT + 8);

    const bin = atob(pc.toDataURL('image/jpeg', 0.92).split(',')[1]);
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    pages.push({ data: u, w: pc.width, h: pc.height });
  });

  const pdfData = makePDFStream(pages);
  browserSave(`weekly-report-${weekMonday}.pdf`, pdfData);
}
