import React, { useState } from 'react';
import { Task, AppSettings } from '../types';
import { toISODate, addDays, mondayOf } from '../utils/dateUtils';
import { exportWeekToExcel, exportAllToExcel, exportToCSV } from '../utils/excelExport';
import { exportReportPDF, exportReportPNG } from '../utils/reportExport';
import { X, Download, FileSpreadsheet, FileText, Printer, Image } from 'lucide-react';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: Task[];
  settings: AppSettings;
  currentWeek: string;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  tasks,
  settings,
  currentWeek,
}) => {
  if (!isOpen) return null;

  const [fromDate, setFromDate] = useState(currentWeek);
  const [toDate, setToDate] = useState(addDays(currentWeek, 4));
  const [format, setFormat] = useState<'xlsxWeek' | 'pdf' | 'png' | 'xlsxAll' | 'csv' | 'print'>('xlsxWeek');
  const [isExporting, setIsExporting] = useState(false);

  const handleSetCurrentWeek = () => {
    setFromDate(currentWeek);
    setToDate(addDays(currentWeek, 4));
    setFormat('xlsxWeek');
  };

  const handleSetCurrentMonth = () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    setFromDate(toISODate(firstDay));
    setToDate(toISODate(lastDay));
  };

  const handleSetAll = () => {
    setFormat('xlsxAll');
  };

  const handleExport = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsExporting(true);
    try {
      const mon = mondayOf(fromDate);
      if (format === 'xlsxWeek') {
        exportWeekToExcel(tasks, settings, mon);
      } else if (format === 'pdf') {
        await exportReportPDF(tasks, settings, mon);
      } else if (format === 'png') {
        await exportReportPNG(tasks, settings, mon);
      } else if (format === 'xlsxAll') {
        exportAllToExcel(tasks, settings);
      } else if (format === 'csv') {
        exportToCSV(tasks, settings);
      } else if (format === 'print') {
        window.print();
      }
      onClose();
    } catch (err) {
      console.error('Export error:', err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border-t-6 border-[#2f55a8] max-w-lg w-full p-6 text-slate-800">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Download className="w-5 h-5 text-[#1f3b7a]" /> ส่งออกรายงาน (Export Report)
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleExport} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
              รูปแบบการส่งออก (แสดงข้อมูลเหมือนหน้าเว็บ)
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              {/* Excel (.xlsx) */}
              <label
                className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                  format === 'xlsxWeek'
                    ? 'border-blue-600 bg-blue-50/70 text-blue-900 ring-1 ring-blue-600'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <input
                  type="radio"
                  name="exportFormat"
                  value="xlsxWeek"
                  checked={format === 'xlsxWeek'}
                  onChange={() => setFormat('xlsxWeek')}
                  className="mt-0.5"
                />
                <div>
                  <div className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Excel (.xlsx)
                  </div>
                  <span className="text-[11px] text-slate-500">ตามฟอร์มทางการ สัปดาห์ที่เลือก</span>
                </div>
              </label>

              {/* PDF (.pdf) */}
              <label
                className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                  format === 'pdf'
                    ? 'border-blue-600 bg-blue-50/70 text-blue-900 ring-1 ring-blue-600'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <input
                  type="radio"
                  name="exportFormat"
                  value="pdf"
                  checked={format === 'pdf'}
                  onChange={() => setFormat('pdf')}
                  className="mt-0.5"
                />
                <div>
                  <div className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
                    <FileText className="w-4 h-4 text-rose-600" /> PDF (.pdf)
                  </div>
                  <span className="text-[11px] text-slate-500">เต็มหน้า พร้อมหัวตารางและกราฟ</span>
                </div>
              </label>

              {/* PNG (.png) */}
              <label
                className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                  format === 'png'
                    ? 'border-blue-600 bg-blue-50/70 text-blue-900 ring-1 ring-blue-600'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <input
                  type="radio"
                  name="exportFormat"
                  value="png"
                  checked={format === 'png'}
                  onChange={() => setFormat('png')}
                  className="mt-0.5"
                />
                <div>
                  <div className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
                    <Image className="w-4 h-4 text-blue-600" /> รูปภาพ (.png)
                  </div>
                  <span className="text-[11px] text-slate-500">ความละเอียดสูง เหมือนหน้าเว็บ</span>
                </div>
              </label>

              {/* CSV (.csv) */}
              <label
                className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                  format === 'csv'
                    ? 'border-blue-600 bg-blue-50/70 text-blue-900 ring-1 ring-blue-600'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <input
                  type="radio"
                  name="exportFormat"
                  value="csv"
                  checked={format === 'csv'}
                  onChange={() => setFormat('csv')}
                  className="mt-0.5"
                />
                <div>
                  <div className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
                    <FileText className="w-4 h-4 text-amber-600" /> ไฟล์ CSV
                  </div>
                  <span className="text-[11px] text-slate-500">ข้อมูลตารางดิบ UTF-8 สำหรับ Excel</span>
                </div>
              </label>

              {/* Excel All Weeks */}
              <label
                className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                  format === 'xlsxAll'
                    ? 'border-blue-600 bg-blue-50/70 text-blue-900 ring-1 ring-blue-600'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <input
                  type="radio"
                  name="exportFormat"
                  value="xlsxAll"
                  checked={format === 'xlsxAll'}
                  onChange={() => setFormat('xlsxAll')}
                  className="mt-0.5"
                />
                <div>
                  <div className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
                    <FileSpreadsheet className="w-4 h-4 text-indigo-600" /> Excel ทุกสัปดาห์
                  </div>
                  <span className="text-[11px] text-slate-500">แยกตามสัปดาห์ + ชีตรวม</span>
                </div>
              </label>

              {/* Print */}
              <label
                className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                  format === 'print'
                    ? 'border-blue-600 bg-blue-50/70 text-blue-900 ring-1 ring-blue-600'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <input
                  type="radio"
                  name="exportFormat"
                  value="print"
                  checked={format === 'print'}
                  onChange={() => setFormat('print')}
                  className="mt-0.5"
                />
                <div>
                  <div className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
                    <Printer className="w-4 h-4 text-purple-600" /> พิมพ์ (Print)
                  </div>
                  <span className="text-[11px] text-slate-500">เปิดหน้าต่างพิมพ์ของเบราว์เซอร์</span>
                </div>
              </label>
            </div>
          </div>

          {/* Quick filters */}
          <div className="flex items-center gap-2 pt-2">
            <span className="text-xs text-slate-500 font-medium">ช่วงด่วน:</span>
            <button
              type="button"
              onClick={handleSetCurrentWeek}
              className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700"
            >
              สัปดาห์ปัจจุบัน
            </button>
            <button
              type="button"
              onClick={handleSetCurrentMonth}
              className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700"
            >
              เดือนนี้
            </button>
            <button
              type="button"
              onClick={handleSetAll}
              className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700"
            >
              งานทั้งหมด ({tasks.length})
            </button>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isExporting}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 text-sm font-medium"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={isExporting}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#1f3b7a] to-[#2f55a8] hover:from-[#193064] hover:to-[#274790] text-white text-sm font-semibold shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Download className="w-4 h-4" /> {isExporting ? 'กำลังสร้างไฟล์...' : 'ส่งออกไฟล์เดี๋ยวนี้'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
