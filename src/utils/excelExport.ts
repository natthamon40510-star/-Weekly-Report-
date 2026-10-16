import * as XLSX from 'xlsx';
import { Task, AppSettings } from '../types';
import { formatThaiDate, daysOfTask, isTaskInWeek, isTaskCarriedForward, formatWeekRange, parseISO, mondayOf, toISODate, pad } from './dateUtils';

export function exportWeekToExcel(tasks: Task[], settings: AppSettings, weekMonday: string) {
  const weekTasks = tasks
    .filter(t => isTaskInWeek(t, weekMonday))
    .sort((a, b) => (a.ord ?? a.created) - (b.ord ?? b.created));

  const headers = [
    'ลำดับ',
    'รายการงานที่ทำ',
    'โครงการ',
    'กลุ่มงาน',
    'ประเภทงาน',
    'ระดับความสำคัญ',
    'แผนจบที่วางไว้ (วันที่)',
    'วันที่เริ่มต้นทำจริง (วันที่)',
    'วันที่แล้วเสร็จ (วันที่)',
    'เวลาที่ใช้จริง (วัน)',
    'สถานะ',
    'อัปเดตล่าสุด / ปัญหา & ข้อช่วยเหลือ',
  ];

  const rows = weekTasks.map((t, idx) => [
    idx + 1,
    t.title + (isTaskCarriedForward(t, weekMonday) ? ` (ยกมาจากสัปดาห์ ${formatThaiDate(t.week)})` : ''),
    t.project || '-',
    t.group,
    t.type,
    t.priority,
    formatThaiDate(t.plan, true),
    formatThaiDate(t.start, true),
    formatThaiDate(t.actual, true),
    daysOfTask(t),
    t.status,
    t.note || '',
  ]);

  const metaHeader = [
    ['แผนและสรุปบันทึกงานประจำสัปดาห์ (Weekly Report) - สี่พระยาก่อสร้าง จำกัด'],
    [`ชื่อผู้รายงาน: ${settings.name || '–'}`, `ช่วงวันที่: ${formatWeekRange(weekMonday)}`],
    [], // empty row
    headers,
    ...rows,
  ];

  const ws = XLSX.utils.aoa_to_sheet(metaHeader);

  // Set column widths
  ws['!cols'] = [
    { wch: 6 },  // No.
    { wch: 38 }, // Title
    { wch: 18 }, // Project
    { wch: 14 }, // Group
    { wch: 14 }, // Type
    { wch: 14 }, // Priority
    { wch: 16 }, // Plan
    { wch: 16 }, // Start
    { wch: 16 }, // Actual
    { wch: 14 }, // Days
    { wch: 12 }, // Status
    { wch: 40 }, // Notes
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `สัปดาห์ ${weekMonday}`);

  XLSX.writeFile(wb, `weekly-report-${weekMonday}.xlsx`);
}

export function exportAllToExcel(tasks: Task[], settings: AppSettings) {
  const wb = XLSX.utils.book_new();

  // 1. All tasks sheet
  const allHeaders = [
    'สัปดาห์เริ่ม (จันทร์)',
    'ชื่อผู้รายงาน',
    'รายการงานที่ทำ',
    'โครงการ',
    'กลุ่มงาน',
    'ประเภทงาน',
    'ระดับความสำคัญ',
    'แผนจบที่วางไว้',
    'วันที่เริ่มต้นทำจริง',
    'วันที่แล้วเสร็จ',
    'เวลาที่ใช้จริง (วัน)',
    'สถานะ',
    'อัปเดตล่าสุด / ปัญหา & ข้อช่วยเหลือ',
  ];

  const sortedTasks = [...tasks].sort((a, b) => a.week.localeCompare(b.week) || (a.ord ?? a.created) - (b.ord ?? b.created));

  const allRows = sortedTasks.map(t => [
    t.week,
    settings.name || '',
    t.title,
    t.project || '',
    t.group,
    t.type,
    t.priority,
    formatThaiDate(t.plan, true),
    formatThaiDate(t.start, true),
    formatThaiDate(t.actual, true),
    daysOfTask(t),
    t.status,
    t.note || '',
  ]);

  const wsAll = XLSX.utils.aoa_to_sheet([allHeaders, ...allRows]);
  wsAll['!cols'] = [
    { wch: 14 },
    { wch: 18 },
    { wch: 38 },
    { wch: 18 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 14 },
    { wch: 12 },
    { wch: 40 },
  ];
  XLSX.utils.book_append_sheet(wb, wsAll, 'ข้อมูลทั้งหมด');

  // 2. Add individual sheets for recent weeks that have tasks
  const weeks = [...new Set(tasks.map(t => t.week))].sort();
  weeks.slice(-8).forEach(w => {
    const wTasks = tasks.filter(t => isTaskInWeek(t, w));
    if (wTasks.length > 0) {
      const headers = ['ลำดับ', 'รายการงานที่ทำ', 'โครงการ', 'กลุ่มงาน', 'ประเภทงาน', 'ระดับความสำคัญ', 'แผนจบ', 'เริ่มจริง', 'แล้วเสร็จ', 'วันจริง', 'สถานะ', 'อัปเดต'];
      const data = wTasks.map((t, i) => [
        i + 1,
        t.title,
        t.project || '',
        t.group,
        t.type,
        t.priority,
        t.plan || '',
        t.start || '',
        t.actual || '',
        daysOfTask(t),
        t.status,
        t.note || '',
      ]);
      const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
      XLSX.utils.book_append_sheet(wb, ws, `สัปดาห์ ${w}`);
    }
  });

  const todayStr = toISODate(new Date());
  XLSX.writeFile(wb, `weekly-report-all-${todayStr}.xlsx`);
}

export function exportToCSV(tasks: Task[], settings: AppSettings) {
  const headers = ['สัปดาห์เริ่ม', 'ชื่อผู้รายงาน', 'รายการงานที่ทำ', 'โครงการ', 'กลุ่มงาน', 'ประเภทงาน', 'ระดับความสำคัญ', 'แผนจบที่วางไว้', 'วันที่เริ่มต้นทำจริง', 'วันที่แล้วเสร็จ', 'เวลาที่ใช้จริง (วัน)', 'สถานะ', 'อัปเดตล่าสุด / ปัญหา'];
  const sorted = [...tasks].sort((a, b) => a.week.localeCompare(b.week) || (a.ord ?? a.created) - (b.ord ?? b.created));
  const rows = sorted.map(t => [
    t.week,
    settings.name || '',
    t.title,
    t.project || '',
    t.group,
    t.type,
    t.priority,
    t.plan || '',
    t.start || '',
    t.actual || '',
    daysOfTask(t),
    t.status,
    t.note || '',
  ]);

  const csvContent = '\uFEFF' + [headers, ...rows]
    .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `weekly-report-${toISODate(new Date())}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function parseExcelDate(val: unknown): string {
  if (!val) return '';
  if (val instanceof Date) {
    return toISODate(val);
  }
  if (typeof val === 'number' && val > 20000) {
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    return toISODate(d);
  }
  const s = String(val).trim();
  const m1 = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/.exec(s);
  if (m1) {
    let y = +m1[3];
    if (y < 100) y += 2000;
    if (y > 2400) y -= 543; // Buddhist era
    return `${y}-${pad(+m1[2])}-${pad(+m1[1])}`;
  }
  const m2 = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;
  return '';
}

export async function parseImportFile(file: File, defaultWeek: string): Promise<Partial<Task>[]> {
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, { type: 'array', cellDates: true });
  const results: Partial<Task>[] = [];

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: '' });
    if (!rawRows || rawRows.length === 0) continue;

    const headIdx = rawRows.findIndex(r => Array.isArray(r) && r.some(c => String(c).includes('รายการงานที่ทำ')));
    if (headIdx < 0) continue;

    const headers = (rawRows[headIdx] as unknown[]).map(c => String(c).trim());
    const findCol = (kw: string) => headers.findIndex(h => h.includes(kw));

    const cTitle = findCol('รายการงานที่ทำ');
    const cProj = findCol('โครงการ');
    const cGroup = findCol('กลุ่มงาน');
    const cType = findCol('ประเภทงาน');
    const cPri = findCol('ระดับความ');
    const cPlan = findCol('แผนจบ');
    const cStart = findCol('วันที่เริ่มต้น');
    const cAct = Math.max(findCol('วันที่แล้วเสร็จ'), findCol('ทำได้จริง'));
    const cDays = findCol('เวลาที่ใช้');
    const cStatus = findCol('สถานะ');
    const cNote = findCol('อัปเดต');
    const cWeek = findCol('สัปดาห์เริ่ม');

    for (const row of rawRows.slice(headIdx + 1) as unknown[][]) {
      const title = String(row[cTitle] || '').trim();
      if (!title || title.startsWith('(') || title.includes('ยกมาจากสัปดาห์')) continue;

      const rawWeek = parseExcelDate(cWeek >= 0 ? row[cWeek] : '');
      const taskWeek = rawWeek ? mondayOf(rawWeek) : defaultWeek;
      const statusRaw = String(row[cStatus] || '').trim();
      const status: 'เสร็จสิ้น' | 'กำลังทำ' | 'ติดปัญหา' =
        statusRaw === 'เสร็จสิ้น' || statusRaw === 'กำลังทำ' || statusRaw === 'ติดปัญหา'
          ? statusRaw
          : 'กำลังทำ';

      results.push({
        title,
        project: cProj >= 0 ? String(row[cProj] || '').trim() : '',
        group: cGroup >= 0 ? String(row[cGroup] || '').trim() : 'งานเริ่มใหม่',
        type: cType >= 0 ? String(row[cType] || '').trim() : 'งานประจำ',
        priority: cPri >= 0 ? String(row[cPri] || '').trim() : 'ปกติ',
        plan: cPlan >= 0 ? parseExcelDate(row[cPlan]) : '',
        start: cStart >= 0 ? parseExcelDate(row[cStart]) : '',
        actual: cAct >= 0 ? parseExcelDate(row[cAct]) : '',
        days: cDays >= 0 ? Number(row[cDays]) || 0 : 0,
        status,
        note: cNote >= 0 ? String(row[cNote] || '').trim() : '',
        week: taskWeek,
      });
    }

    if (results.length > 0) break; // Found tasks in the main sheet
  }

  return results;
}
