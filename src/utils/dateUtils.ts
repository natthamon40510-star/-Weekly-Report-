import { Task } from '../types';

export const HOLIDAYS_2569: Record<string, string> = {
  '2026-01-01': 'วันขึ้นปีใหม่',
  '2026-02-16': 'เทศกาลตรุษจีน',
  '2026-02-17': 'เทศกาลตรุษจีน',
  '2026-03-03': 'วันมาฆบูชา',
  '2026-04-13': 'วันสงกรานต์',
  '2026-04-14': 'วันสงกรานต์',
  '2026-04-15': 'วันสงกรานต์',
  '2026-05-01': 'วันแรงงานแห่งชาติ',
  '2026-06-03': 'วันเฉลิมพระชนมพรรษา สมเด็จพระนางเจ้าฯ พระบรมราชินี',
  '2026-07-28': 'วันเฉลิมพระชนมพรรษา พระบาทสมเด็จพระเจ้าอยู่หัว',
  '2026-08-12': 'วันแม่แห่งชาติ',
  '2026-10-13': 'วันนวมินทรมหาราช',
  '2026-10-23': 'วันปิยมหาราช',
  '2026-12-05': 'วันพ่อแห่งชาติ',
  '2026-12-31': 'วันสิ้นปี',
};

export function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISO(s: string | undefined): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s.trim());
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3]);
}

export function mondayOf(dateOrIso: Date | string): string {
  const d = typeof dateOrIso === 'string' ? parseISO(dateOrIso) || new Date() : dateOrIso;
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay();
  const diff = (day + 6) % 7; // Distance to Monday
  x.setDate(x.getDate() - diff);
  return toISODate(x);
}

export function addDays(isoStr: string, n: number): string {
  const d = parseISO(isoStr);
  if (!d) return isoStr;
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function formatThaiDate(isoStr?: string, longYear = false): string {
  if (!isoStr) return '';
  const d = parseISO(isoStr);
  if (!d) return isoStr;
  return d.toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: longYear ? 'numeric' : '2-digit',
  });
}

export function workdays(startIso?: string, endIso?: string): number {
  const s = parseISO(startIso);
  const e = parseISO(endIso);
  if (!s || !e || e < s) return 0;
  let count = 0;
  const curr = new Date(s);
  for (let i = 0; i < 3700 && curr <= e; i++) {
    const day = curr.getDay();
    const isoD = toISODate(curr);
    if (day !== 0 && day !== 6 && !HOLIDAYS_2569[isoD]) {
      count++;
    }
    curr.setDate(curr.getDate() + 1);
  }
  return count;
}

export function formatWeekRange(mondayIso: string, fridayIso?: string): string {
  const fri = fridayIso || addDays(mondayIso, 4);
  const sd = parseISO(mondayIso);
  const ed = parseISO(fri);
  if (!sd || !ed) return `${mondayIso} - ${fri}`;
  const st = sd.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
  const sy = sd.getFullYear() === ed.getFullYear() ? '' : ` ${sd.getFullYear() + 543}`;
  return `${st}${sy} – ${formatThaiDate(fri, true)} · วันทำงาน ${workdays(mondayIso, fri)} วัน`;
}

export function endWeekOfTask(t: Task): string {
  if (t.actual) {
    const d = parseISO(t.actual);
    if (d) {
      const mw = mondayOf(d);
      return mw < t.week ? t.week : mw;
    }
  }
  if (t.status === 'เสร็จสิ้น') return t.week;
  return '';
}

export function isTaskInWeek(t: Task, targetWeekMonday: string): boolean {
  if (t.week === targetWeekMonday) return true;
  if (t.week < targetWeekMonday) {
    const endWk = endWeekOfTask(t);
    return !endWk || targetWeekMonday <= endWk;
  }
  return false;
}

export function isTaskCarriedForward(t: Task, currentWeekMonday: string): boolean {
  return t.week < currentWeekMonday;
}

export function daysOfTask(t: Task): number {
  if (!t.start) return 0;
  return workdays(t.start, t.actual || todayISO());
}

export function isTaskLate(t: Task): boolean {
  if (!t.plan) return false;
  if (t.status !== 'เสร็จสิ้น') {
    return t.plan < todayISO();
  }
  return !!t.actual && t.actual > t.plan;
}
