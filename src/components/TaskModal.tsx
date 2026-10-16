import React, { useState } from 'react';
import { Task, AppSettings, TaskVisibility } from '../types';
import { todayISO, mondayOf, workdays } from '../utils/dateUtils';
import { X, Trash2, Calendar, CheckCircle2, Clock, AlertTriangle, Users, Lock, Globe, Plus } from 'lucide-react';

interface TaskModalProps {
  task: Partial<Task> | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (task: Partial<Task>) => void;
  onDelete?: (id: string) => void;
  settings: AppSettings;
  existingProjects: string[];
  currentWeek: string;
  knownAuthors?: string[];
}

export const TaskModal: React.FC<TaskModalProps> = ({
  task,
  isOpen,
  onClose,
  onSave,
  onDelete,
  settings,
  existingProjects,
  currentWeek,
  knownAuthors = [],
}) => {
  if (!isOpen) return null;

  const isNew = !task?.id;
  const [title, setTitle] = useState(task?.title || '');
  const [project, setProject] = useState(task?.project || '');
  const [group, setGroup] = useState(task?.group || settings.groups[1] || settings.groups[0] || 'งานเริ่มใหม่');
  const [type, setType] = useState(task?.type || settings.types[0] || 'งานประจำ');
  const [priority, setPriority] = useState(task?.priority || settings.priorities[0] || 'ปกติ');
  const [status, setStatus] = useState<'เสร็จสิ้น' | 'กำลังทำ' | 'ติดปัญหา'>(task?.status || 'กำลังทำ');
  const [plan, setPlan] = useState(task?.plan || '');
  const [start, setStart] = useState(task?.start || '');
  const [actual, setActual] = useState(task?.actual || '');
  const [week, setWeek] = useState(task?.week || currentWeek);
  const [note, setNote] = useState(task?.note || '');
  const [visibility, setVisibility] = useState<TaskVisibility>(task?.visibility || 'public');
  const [allowedViewers, setAllowedViewers] = useState<string[]>(task?.allowedViewers || []);
  const [viewerInput, setViewerInput] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Auto calculate days
  const calculatedDays = start ? workdays(start, actual || todayISO()) : 0;

  // Handle status change side-effects
  const handleStatusChange = (newStatus: 'เสร็จสิ้น' | 'กำลังทำ' | 'ติดปัญหา') => {
    setStatus(newStatus);
    if (newStatus === 'กำลังทำ' && !start) {
      setStart(todayISO());
    } else if (newStatus === 'เสร็จสิ้น' && !actual) {
      setActual(todayISO());
    }
  };

  // Handle actual date change side-effects
  const handleActualChange = (val: string) => {
    setActual(val);
    if (val) {
      setStatus('เสร็จสิ้น');
    } else if (status === 'เสร็จสิ้น') {
      setStatus('กำลังทำ');
    }
  };

  // Toggle allowed viewer
  const handleToggleViewer = (member: string) => {
    const m = member.trim();
    if (!m) return;
    setAllowedViewers(prev =>
      prev.includes(m) ? prev.filter(v => v !== m) : [...prev, m]
    );
  };

  // Add custom viewer from input
  const handleAddViewerInput = (e: React.FormEvent) => {
    e.preventDefault();
    const val = viewerInput.trim();
    if (!val) return;
    if (!allowedViewers.includes(val)) {
      setAllowedViewers(prev => [...prev, val]);
    }
    setViewerInput('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const taskWeek = week ? mondayOf(week) : currentWeek;

    onSave({
      id: task?.id,
      title: title.trim(),
      project: project.trim(),
      group,
      type,
      priority,
      status: actual ? 'เสร็จสิ้น' : (status === 'เสร็จสิ้น' ? 'กำลังทำ' : status),
      plan,
      start,
      actual,
      days: calculatedDays,
      week: taskWeek,
      note: note.trim(),
      visibility,
      allowedViewers: visibility === 'custom' ? allowedViewers : [],
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div
        className="bg-white rounded-2xl shadow-2xl border-t-6 border-[#2f55a8] max-w-2xl w-full p-6 my-8 text-slate-800 transition-all max-h-[90vh] overflow-y-auto"
        role="dialog"
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            {isNew ? (
              <span className="flex items-center gap-2 text-[#1f3b7a]">
                <Calendar className="w-5 h-5" /> เพิ่มรายการงานใหม่
              </span>
            ) : (
              <span className="flex items-center gap-2 text-[#1f3b7a]">
                <Clock className="w-5 h-5" /> แก้ไขรายการงาน
              </span>
            )}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
              รายการงานที่ทำ <span className="text-red-500">*</span>
            </label>
            <textarea
              required
              rows={2}
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="ระบุรายละเอียดงาน เช่น จัดทำเอกสารเปรียบเทียบราคาเหล็ก, ตรวจสอบงวดงาน..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent text-sm"
            />
          </div>

          {/* Project & Group */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                โครงการ (Project)
              </label>
              <input
                type="text"
                list="project-list"
                value={project}
                onChange={e => setProject(e.target.value)}
                placeholder="เลือกหรือพิมพ์โครงการ เช่น Rama 9, Bangna..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm"
              />
              <datalist id="project-list">
                {existingProjects.map(p => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                กลุ่มงาน
              </label>
              <select
                value={group}
                onChange={e => setGroup(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm bg-white"
              >
                {settings.groups.map(g => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Type & Priority & Status */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                ประเภทงาน
              </label>
              <select
                value={type}
                onChange={e => setType(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm bg-white"
              >
                {settings.types.map(t => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                ระดับความสำคัญ
              </label>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm bg-white"
              >
                {settings.priorities.map(p => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                สถานะงาน
              </label>
              <select
                value={status}
                onChange={e => handleStatusChange(e.target.value as 'เสร็จสิ้น' | 'กำลังทำ' | 'ติดปัญหา')}
                className={`w-full px-3.5 py-2.5 rounded-xl border text-sm font-semibold focus:outline-none focus:ring-2 ${
                  status === 'เสร็จสิ้น'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300 focus:ring-emerald-500'
                    : status === 'กำลังทำ'
                    ? 'bg-blue-50 text-blue-800 border-blue-300 focus:ring-blue-500'
                    : 'bg-rose-50 text-rose-800 border-rose-300 focus:ring-rose-500'
                }`}
              >
                <option value="กำลังทำ">กำลังทำ</option>
                <option value="เสร็จสิ้น">เสร็จสิ้น</option>
                <option value="ติดปัญหา">ติดปัญหา</option>
              </select>
            </div>
          </div>

          {/* Dates: Plan, Start, Actual */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                แผนจบที่วางไว้ (วันที่)
              </label>
              <input
                type="date"
                value={plan}
                onChange={e => setPlan(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                วันที่เริ่มต้นทำจริง
              </label>
              <input
                type="date"
                value={start}
                onChange={e => setStart(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                วันที่แล้วเสร็จ
              </label>
              <input
                type="date"
                value={actual}
                onChange={e => handleActualChange(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm"
              />
            </div>
          </div>

          {/* Auto days and target week */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
            <div>
              <span className="block text-xs font-semibold text-slate-600 mb-1">เวลาที่ใช้จริง (วัน)</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xl font-bold text-blue-900">{calculatedDays.toFixed(1)}</span>
                <span className="text-xs text-slate-500">วันทำงาน</span>
              </div>
              <span className="text-[11px] text-slate-400 block mt-0.5">
                {start
                  ? `คำนวณอัตโนมัติ (ไม่นับเสาร์-อาทิตย์ และวันหยุดบริษัท 2569) ถึง ${actual ? 'วันที่เสร็จ' : 'วันนี้'}`
                  : 'ยังไม่ใส่วันที่เริ่มต้นทำจริง'}
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                สัปดาห์ที่เริ่มงาน (สัปดาห์จันทร์)
              </label>
              <input
                type="date"
                value={week}
                onChange={e => setWeek(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
              />
              <span className="text-[11px] text-slate-400 block mt-0.5">
                งานที่ยังไม่เสร็จจะยกยอดแสดงในสัปดาห์ถัดๆ ไปอัตโนมัติ
              </span>
            </div>
          </div>

          {/* Visibility Section: สิทธิ์การมองเห็นงานนี้ */}
          <div className="bg-slate-50/90 p-3.5 rounded-xl border border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-[#2f55a8]" /> สิทธิ์การมองเห็นงานนี้ (Visibility)
              </label>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setVisibility('public')}
                  className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                    visibility === 'public'
                      ? 'bg-[#1f3b7a] text-white shadow-xs'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <Globe className="w-3.5 h-3.5" /> ทุกคนในทีม
                </button>
                <button
                  type="button"
                  onClick={() => setVisibility('private')}
                  className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                    visibility === 'private'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <Lock className="w-3.5 h-3.5" /> เฉพาะฉันและเจ้าของเว็บ
                </button>
                <button
                  type="button"
                  onClick={() => setVisibility('custom')}
                  className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                    visibility === 'custom'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" /> กำหนดบุคคล
                </button>
              </div>
            </div>

            {visibility === 'custom' && (
              <div className="pt-2 border-t border-slate-200 space-y-2">
                <span className="text-[11px] font-semibold text-slate-600 block">
                  เลือกหรือระบุบุคคลที่อนุญาตให้มองเห็นงานชิ้นนี้:
                </span>

                {knownAuthors.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {knownAuthors.map(author => {
                      const isSelected = allowedViewers.includes(author);
                      return (
                        <button
                          key={author}
                          type="button"
                          onClick={() => handleToggleViewer(author)}
                          className={`text-xs px-2.5 py-1 rounded-lg border transition-colors cursor-pointer flex items-center gap-1 ${
                            isSelected
                              ? 'bg-blue-100 text-blue-900 border-blue-400 font-semibold'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {isSelected ? '✓ ' : '+ '}
                          {author}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <input
                    type="text"
                    value={viewerInput}
                    onChange={e => setViewerInput(e.target.value)}
                    placeholder="พิมพ์ชื่อหรืออีเมลเพิ่มเติม..."
                    className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                  <button
                    type="button"
                    onClick={handleAddViewerInput}
                    className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> เพิ่มชื่อ
                  </button>
                </div>

                {allowedViewers.length > 0 && (
                  <div className="text-[11px] text-slate-500">
                    บุคคลที่มองเห็นได้: <strong className="text-slate-700">{allowedViewers.join(', ')}</strong> (และเจ้าของเว็บ)
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Note & Roadblocks */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
              อัปเดตล่าสุด / ปัญหา &amp; ข้อช่วยเหลือ
            </label>
            <textarea
              rows={3}
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="ระบุความคืบหน้า ปัญหาที่พบ หรือสิ่งที่ต้องการให้ประสานงานช่วยเหลือ..."
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm"
            />
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-100">
            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#1f3b7a] to-[#2f55a8] hover:from-[#193064] hover:to-[#274790] text-white font-medium text-sm shadow-md hover:shadow-lg transition-all flex items-center gap-2 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" /> บันทึกข้อมูล
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 text-sm font-medium transition-colors cursor-pointer"
              >
                ยกเลิก
              </button>
            </div>

            {!isNew && onDelete && task?.id && (
              <div>
                {confirmDelete ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onDelete(task.id!)}
                      className="px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <AlertTriangle className="w-3.5 h-3.5" /> ยืนยันลบงานนี้
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1"
                    >
                      ยกเลิก
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="p-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-xl text-sm transition-colors cursor-pointer flex items-center gap-1.5"
                    title="ลบงานนี้"
                  >
                    <Trash2 className="w-4 h-4" /> ลบงาน
                  </button>
                )}
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
