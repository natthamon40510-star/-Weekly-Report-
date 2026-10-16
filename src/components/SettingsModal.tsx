import React, { useState } from 'react';
import { AppSettings, DEFAULT_OWNER_EMAIL } from '../types';
import { X, Settings2, Check, RotateCcw, Shield, Crown } from 'lucide-react';
import { DEFAULT_GROUPS, DEFAULT_TYPES, DEFAULT_PRIORITIES } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSave: (newSettings: Partial<AppSettings>) => void;
  onOpenPermissions?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSave,
  onOpenPermissions,
}) => {
  if (!isOpen) return null;

  const [groups, setGroups] = useState(settings.groups.join('\n'));
  const [types, setTypes] = useState(settings.types.join('\n'));
  const [priorities, setPriorities] = useState(settings.priorities.join('\n'));
  const [name, setName] = useState(settings.name || '');

  const handleResetDefaults = () => {
    setGroups(DEFAULT_GROUPS.join('\n'));
    setTypes(DEFAULT_TYPES.join('\n'));
    setPriorities(DEFAULT_PRIORITIES.join('\n'));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const gList = groups.split('\n').map(s => s.trim()).filter(Boolean);
    const tList = types.split('\n').map(s => s.trim()).filter(Boolean);
    const pList = priorities.split('\n').map(s => s.trim()).filter(Boolean);

    if (gList.length === 0 || tList.length === 0 || pList.length === 0) {
      alert('แต่ละรายการต้องมีตัวเลือกอย่างน้อย 1 รายการ');
      return;
    }

    onSave({
      name: name.trim(),
      groups: gList,
      types: tList,
      priorities: pList,
      updatedAt: Date.now(),
    });
    onClose();
  };

  const currentOwner = settings.ownerEmail || DEFAULT_OWNER_EMAIL;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border-t-6 border-[#2f55a8] max-w-xl w-full p-6 text-slate-800 my-6">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-[#1f3b7a]" /> ตั้งค่าระบบและตัวเลือก
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Web Owner & Permissions Banner */}
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-3.5 mb-4 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Crown className="w-4 h-4 text-amber-600" />
            <div>
              <div className="text-xs font-bold text-amber-950">
                เจ้าของเว็บปัจจุบัน: <span className="font-mono text-amber-900">{currentOwner}</span>
              </div>
              <div className="text-[11px] text-amber-800">
                สิทธิ์การมองเห็น: {settings.allowAllView ? 'เปิดให้ทุกคนเห็นงานร่วมกัน' : 'จำกัดสิทธิ์รายบุคคล'}
              </div>
            </div>
          </div>
          {onOpenPermissions && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenPermissions();
              }}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            >
              <Shield className="w-3.5 h-3.5" /> จัดการสิทธิ์ & เจ้าของเว็บ
            </button>
          )}
        </div>

        <p className="text-xs text-slate-500 mb-4">
          พิมพ์ตัวเลือกบรรทัดละ 1 รายการ ข้อมูลที่ตั้งค่าจะถูกจัดเก็บลงฐานข้อมูลออนไลน์และซิงก์ให้อัตโนมัติทุกเครื่อง
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
              ชื่อผู้รายงานเริ่มต้น (ค่าพื้นฐาน)
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="เช่น นายสมชาย สมบูรณ์ (แผนก QS)"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                กลุ่มงาน
              </label>
              <textarea
                rows={5}
                value={groups}
                onChange={e => setGroups(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600 text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                ประเภทงาน
              </label>
              <textarea
                rows={5}
                value={types}
                onChange={e => setTypes(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600 text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                ระดับความสำคัญ
              </label>
              <textarea
                rows={5}
                value={priorities}
                onChange={e => setPriorities(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600 text-xs font-mono"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={handleResetDefaults}
              className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" /> รีเซ็ตเป็นค่าเริ่มต้น
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 text-sm font-medium cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#1f3b7a] to-[#2f55a8] hover:from-[#193064] hover:to-[#274790] text-white text-sm font-medium shadow-md flex items-center gap-1.5 cursor-pointer"
              >
                <Check className="w-4 h-4" /> บันทึกการตั้งค่า
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
