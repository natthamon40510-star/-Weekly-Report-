import React, { useState, useMemo } from 'react';
import { AppSettings, DEFAULT_OWNER_EMAIL, UserPermissionConfig, UserViewRole } from '../types';
import { X, Shield, Crown, UserCheck, UserX, Plus, Trash2, Check, Users, Search, ChevronDown, ChevronUp } from 'lucide-react';

interface PermissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSave: (newSettings: Partial<AppSettings>) => void;
  knownAuthors: string[];
  taskCountsByAuthor: Record<string, number>;
  activeUserEmail?: string;
}

export const PermissionModal: React.FC<PermissionModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSave,
  knownAuthors,
  taskCountsByAuthor,
  activeUserEmail = '',
}) => {
  if (!isOpen) return null;

  const currentOwner = settings.ownerEmail || DEFAULT_OWNER_EMAIL;
  const [ownerInput, setOwnerInput] = useState(currentOwner);
  const [coOwnerInput, setCoOwnerInput] = useState((settings.coOwners || []).join(', '));
  const [newUser, setNewUser] = useState('');
  const [searchMember, setSearchMember] = useState('');
  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  // Legacy userPermissions (map of email -> boolean)
  const [userPermissions, setUserPermissions] = useState<Record<string, boolean>>(
    settings.userPermissions || {}
  );

  // Detailed per-person config: userPermissionConfigs (map of email -> UserPermissionConfig)
  const [permissionConfigs, setPermissionConfigs] = useState<Record<string, UserPermissionConfig>>(() => {
    const initial: Record<string, UserPermissionConfig> = { ...(settings.userPermissionConfigs || {}) };
    // Backfill from legacy userPermissions if not present
    if (settings.userPermissions) {
      Object.entries(settings.userPermissions).forEach(([k, canView]) => {
        if (!initial[k]) {
          initial[k] = {
            role: canView ? 'view_all' : 'own_only',
            allowedAuthors: [],
          };
        }
      });
    }
    return initial;
  });

  const [allowAllView, setAllowAllView] = useState<boolean>(!!settings.allowAllView);

  // Combine known authors from tasks with existing permission keys
  const allMembers = useMemo(() => {
    return Array.from(
      new Set([
        ...knownAuthors,
        ...Object.keys(userPermissions),
        ...Object.keys(permissionConfigs),
        activeUserEmail,
      ])
    ).filter(Boolean);
  }, [knownAuthors, userPermissions, permissionConfigs, activeUserEmail]);

  // Filtered members by search
  const filteredMembers = useMemo(() => {
    const q = searchMember.trim().toLowerCase();
    if (!q) return allMembers;
    return allMembers.filter(m => m.toLowerCase().includes(q));
  }, [allMembers, searchMember]);

  // Set role for a specific member
  const handleSetRole = (key: string, role: UserViewRole) => {
    const k = key.toLowerCase();
    const current = permissionConfigs[k] || { role: 'own_only', allowedAuthors: [] };
    const updated: UserPermissionConfig = {
      ...current,
      role,
      updatedAt: Date.now(),
    };

    setPermissionConfigs(prev => ({
      ...prev,
      [k]: updated,
    }));

    // Keep legacy userPermissions in sync
    setUserPermissions(prev => ({
      ...prev,
      [k]: role === 'view_all',
    }));
  };

  // Toggle specific author allowed for custom role
  const handleToggleAllowedAuthor = (userKey: string, authorToToggle: string) => {
    const k = userKey.toLowerCase();
    const current = permissionConfigs[k] || { role: 'custom', allowedAuthors: [] };
    const list = current.allowedAuthors || [];
    const nextList = list.includes(authorToToggle)
      ? list.filter(a => a !== authorToToggle)
      : [...list, authorToToggle];

    setPermissionConfigs(prev => ({
      ...prev,
      [k]: {
        ...current,
        role: 'custom',
        allowedAuthors: nextList,
        updatedAt: Date.now(),
      },
    }));
  };

  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault();
    const val = newUser.trim().toLowerCase();
    if (!val) return;

    setPermissionConfigs(prev => ({
      ...prev,
      [val]: {
        role: 'view_all', // default to grant access when explicitly added
        allowedAuthors: [],
        updatedAt: Date.now(),
      },
    }));

    setUserPermissions(prev => ({
      ...prev,
      [val]: true,
    }));

    setNewUser('');
  };

  const handleRemoveUser = (key: string) => {
    const k = key.toLowerCase();
    setPermissionConfigs(prev => {
      const next = { ...prev };
      delete next[k];
      return next;
    });
    setUserPermissions(prev => {
      const next = { ...prev };
      delete next[k];
      return next;
    });
  };

  const handleSave = () => {
    const cleanOwner = ownerInput.trim().toLowerCase() || DEFAULT_OWNER_EMAIL;
    const cleanCoOwners = coOwnerInput
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);

    onSave({
      ownerEmail: cleanOwner,
      coOwners: cleanCoOwners,
      userPermissions,
      userPermissionConfigs: permissionConfigs,
      allowAllView,
      updatedAt: Date.now(),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div
        className="bg-white rounded-2xl shadow-2xl border-t-6 border-[#2f55a8] max-w-2xl w-full p-6 text-slate-800 my-6 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
        role="dialog"
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Shield className="w-5 h-5 text-[#2f55a8]" />
            จัดการสิทธิ์การมองเห็นและแก้ไขเจ้าของเว็บ
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Section 1: Change Web Owner */}
        <div className="bg-amber-50/80 border border-amber-300 rounded-xl p-4 mb-5 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 font-bold text-amber-900 text-sm">
              <Crown className="w-5 h-5 text-amber-600" />
              แก้ไขเจ้าของเว็บ (Web Owner Admin)
            </div>
            {activeUserEmail && activeUserEmail.toLowerCase() !== ownerInput.trim().toLowerCase() && (
              <button
                type="button"
                onClick={() => setOwnerInput(activeUserEmail)}
                className="text-xs bg-amber-600 hover:bg-amber-700 text-white font-medium px-2.5 py-1 rounded-lg transition-colors shadow-xs"
              >
                👑 ตั้งฉัน ({activeUserEmail.split('@')[0]}) เป็นเจ้าของเว็บ
              </button>
            )}
          </div>
          <p className="text-xs text-amber-800 m-0">
            เจ้าของเว็บจะได้รับสิทธิ์สูงสุดในระบบ สามารถดูงานของทุกคน, กรองดูงานรายบุคคล, จัดการสิทธิ์การมองเห็น, และโอนย้ายเจ้าของได้
          </p>

          <div className="space-y-2 pt-1">
            <label className="block text-xs font-semibold text-amber-950">
              อีเมล / ชื่อ บัญชีเจ้าของเว็บหลัก:
              <input
                type="text"
                value={ownerInput}
                onChange={e => setOwnerInput(e.target.value)}
                placeholder="เช่น natthamon40510@gmail.com หรือ Somchai (QS)"
                className="mt-1 w-full px-3 py-2 rounded-lg border border-amber-300 bg-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </label>

            <label className="block text-xs font-semibold text-amber-950">
              ผู้ดูแลร่วม / เจ้าของร่วม (Co-Admins, คั่นด้วยเครื่องหมายจุลภาค ,):
              <input
                type="text"
                value={coOwnerInput}
                onChange={e => setCoOwnerInput(e.target.value)}
                placeholder="เช่น manager1@siphya.com, qs_head@siphya.com"
                className="mt-1 w-full px-3 py-2 rounded-lg border border-amber-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </label>
          </div>
        </div>

        {/* Section 2: Global Mode vs Per-person permissions */}
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2 pb-1 border-b border-slate-100">
            <div className="font-bold text-sm text-slate-800 flex items-center gap-2">
              <Users className="w-4 h-4 text-[#2f55a8]" />
              สิทธิ์การมองเห็นรายบุคคล (Per-Person Permissions)
            </div>

            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
              <input
                type="checkbox"
                checked={allowAllView}
                onChange={e => setAllowAllView(e.target.checked)}
                className="rounded text-blue-600 focus:ring-blue-500"
              />
              เปิดให้ทุกคนในทีมมองเห็นงานร่วมกันได้ทันที
            </label>
          </div>

          <p className="text-xs text-slate-500 m-0">
            {allowAllView
              ? '🌐 ขณะนี้เปิดโหมดทีม: สมาชิกทุกคนสามารถเห็นงานของกันและกันได้'
              : '🔒 ขณะนี้โหมดส่วนตัว: แต่ละคนจะเห็นเฉพาะงานของตนเอง หรือตามที่กำหนดสิทธิ์รายบุคคลด้านล่าง'}
          </p>

          {/* Add member or search */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <form onSubmit={handleAddUser} className="flex gap-2">
              <input
                type="text"
                placeholder="พิมพ์อีเมลหรือชื่อสมาชิกเพื่อเพิ่ม..."
                value={newUser}
                onChange={e => setNewUser(e.target.value)}
                className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <button
                type="submit"
                className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-[#1f3b7a] font-semibold text-xs rounded-lg border border-blue-200 flex items-center gap-1 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> เพิ่ม
              </button>
            </form>

            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="ค้นหารายชื่อในตาราง..."
                value={searchMember}
                onChange={e => setSearchMember(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          {/* Member List with individual toggles */}
          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
            <div className="bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-500 grid grid-cols-12 gap-2 items-center border-b border-slate-200">
              <span className="col-span-4 sm:col-span-5">ผู้ใช้งาน / สมาชิก</span>
              <span className="col-span-5 sm:col-span-5 text-center">สิทธิ์การมองเห็นรายบุคคล</span>
              <span className="col-span-3 sm:col-span-2 text-right">การจัดการ</span>
            </div>

            <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
              {filteredMembers.length === 0 ? (
                <div className="p-6 text-center text-slate-400 text-xs">
                  ไม่พบรายชื่อสมาชิก (สมาชิกจะปรากฏอัตโนมัติเมื่อเพิ่มงาน หรือพิมพ์เพิ่มด้านบน)
                </div>
              ) : (
                filteredMembers.map(member => {
                  const mKey = member.toLowerCase();
                  const isUserOwner =
                    mKey === ownerInput.trim().toLowerCase() ||
                    coOwnerInput
                      .split(',')
                      .map(s => s.trim().toLowerCase())
                      .includes(mKey);

                  const config = permissionConfigs[mKey] || {
                    role: userPermissions[mKey] ? 'view_all' : 'own_only',
                    allowedAuthors: [],
                  };
                  const currentRole: UserViewRole = config.role || (userPermissions[mKey] ? 'view_all' : 'own_only');
                  const count = taskCountsByAuthor[member] || 0;
                  const isExpanded = expandedUser === mKey;

                  return (
                    <div key={member} className="px-3.5 py-2.5 text-xs">
                      <div className="grid grid-cols-12 gap-2 items-center">
                        {/* Member Name */}
                        <div className="col-span-4 sm:col-span-5 truncate">
                          <span className="font-semibold text-slate-800">{member}</span>
                          {isUserOwner && (
                            <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                              👑 เจ้าของเว็บ
                            </span>
                          )}
                          <div className="text-[11px] text-slate-400">
                            งานในระบบ: {count} รายการ
                          </div>
                        </div>

                        {/* Permission Controls */}
                        <div className="col-span-5 sm:col-span-5 flex flex-col items-center justify-center">
                          {isUserOwner ? (
                            <span className="text-amber-700 font-semibold text-xs flex items-center gap-1">
                              <Crown className="w-3.5 h-3.5" /> เห็นงานทุกคน (Admin)
                            </span>
                          ) : (
                            <div className="flex items-center gap-1">
                              <select
                                value={currentRole}
                                onChange={e => handleSetRole(member, e.target.value as UserViewRole)}
                                className={`px-2 py-1 rounded-lg border text-xs font-semibold focus:outline-none ${
                                  currentRole === 'view_all'
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                    : currentRole === 'custom'
                                    ? 'bg-blue-50 text-blue-800 border-blue-300'
                                    : 'bg-slate-50 text-slate-600 border-slate-300'
                                }`}
                              >
                                <option value="view_all">👁️ เห็นงานทุกคน</option>
                                <option value="own_only">🔒 เฉพาะงานตนเอง</option>
                                <option value="custom">👥 กำหนดเฉพาะบุคคล...</option>
                              </select>

                              {currentRole === 'custom' && (
                                <button
                                  type="button"
                                  onClick={() => setExpandedUser(isExpanded ? null : mKey)}
                                  className="p-1 rounded text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                                  title="เลือกรายชื่อบุคคลที่มองเห็นได้"
                                >
                                  {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="col-span-3 sm:col-span-2 text-right flex justify-end items-center gap-1">
                          {!isUserOwner && (
                            <button
                              type="button"
                              onClick={() => handleRemoveUser(member)}
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                              title="ลบการตั้งค่าสมาชิกนี้"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Expanded custom allowed authors list */}
                      {!isUserOwner && currentRole === 'custom' && isExpanded && (
                        <div className="mt-2.5 pt-2 border-t border-slate-100 bg-slate-50/70 p-2.5 rounded-lg space-y-1.5">
                          <span className="text-[11px] font-bold text-slate-600 block">
                            เลือกสมาชิกที่ <strong className="text-blue-800">{member}</strong> ได้รับอนุญาตให้มองเห็นงาน:
                          </span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-36 overflow-y-auto">
                            {allMembers
                              .filter(m => m.toLowerCase() !== mKey)
                              .map(otherMember => {
                                const isChecked = (config.allowedAuthors || []).includes(otherMember);
                                return (
                                  <label
                                    key={otherMember}
                                    className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer bg-white px-2 py-1 rounded border border-slate-200 hover:bg-slate-50"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => handleToggleAllowedAuthor(member, otherMember)}
                                      className="rounded text-blue-600 focus:ring-blue-500"
                                    />
                                    <span className="truncate">{otherMember}</span>
                                  </label>
                                );
                              })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-100 mt-5">
          <button
            type="button"
            className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 text-sm font-medium transition-colors cursor-pointer"
            onClick={onClose}
          >
            ยกเลิก
          </button>
          <button
            type="button"
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#1f3b7a] to-[#2f55a8] hover:from-[#193064] hover:to-[#274790] text-white text-sm font-medium shadow-md flex items-center gap-1.5 cursor-pointer"
            onClick={handleSave}
          >
            <Check className="w-4 h-4" /> บันทึกการเปลี่ยนแปลง
          </button>
        </div>
      </div>
    </div>
  );
};
