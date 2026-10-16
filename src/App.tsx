import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
} from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { db, auth, signInWithGoogle, logOut, testConnection, handleFirestoreError, OperationType } from './firebase';
import {
  Task,
  AppSettings,
  DEFAULT_OWNER_EMAIL,
  OWNER_EMAIL,
  DEFAULT_GROUPS,
  DEFAULT_TYPES,
  DEFAULT_PRIORITIES,
  STATUS_LIST,
  UserPermissionConfig,
} from './types';
import {
  mondayOf,
  todayISO,
  addDays,
  formatThaiDate,
  formatWeekRange,
  workdays,
  daysOfTask,
  isTaskInWeek,
  isTaskCarriedForward,
  isTaskLate,
  parseISO,
} from './utils/dateUtils';
import { exportWeekToExcel, exportAllToExcel, exportToCSV, parseImportFile } from './utils/excelExport';
import { exportReportPDF, exportReportPNG } from './utils/reportExport';
import { TaskModal } from './components/TaskModal';
import { SettingsModal } from './components/SettingsModal';
import { ExportModal } from './components/ExportModal';
import { PermissionModal } from './components/PermissionModal';

const LOCAL_STORAGE_KEY = 'siphya_weekly_report_local';
const USER_PROFILE_KEY = 'siphya_user_profile';

export default function App() {
  // Auth state
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [customUser, setCustomUser] = useState<{ email: string; name: string; uid: string } | null>(() => {
    try {
      const saved = localStorage.getItem(USER_PROFILE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch (_) {
      return null;
    }
  });

  const [dbConnected, setDbConnected] = useState<boolean>(true);

  // Effective active user (Google Auth or Custom Profile)
  const activeUser = useMemo(() => {
    if (currentUser) {
      return {
        email: currentUser.email || '',
        name: currentUser.displayName || currentUser.email || 'ผู้รายงาน',
        uid: currentUser.uid,
      };
    }
    return customUser;
  }, [currentUser, customUser]);

  // App data state
  const [tasks, setTasks] = useState<Task[]>([]);
  const [settings, setSettings] = useState<AppSettings>({
    name: '',
    groups: DEFAULT_GROUPS,
    types: DEFAULT_TYPES,
    priorities: DEFAULT_PRIORITIES,
    logo: '',
    allowAllView: false,
    ownerEmail: DEFAULT_OWNER_EMAIL,
  });

  // Effective owner email
  const effectiveOwner = useMemo(() => {
    return (settings.ownerEmail || DEFAULT_OWNER_EMAIL).trim().toLowerCase();
  }, [settings.ownerEmail]);

  // Co-owners
  const coOwners = useMemo(() => {
    return (settings.coOwners || []).map(s => s.trim().toLowerCase());
  }, [settings.coOwners]);

  // Check if active user is owner or co-admin
  const isOwner = useMemo(() => {
    if (!activeUser?.email && !activeUser?.name) return false;
    const userEmail = (activeUser.email || '').toLowerCase();
    const userName = (activeUser.name || '').toLowerCase();
    return (
      userEmail === effectiveOwner ||
      userName === effectiveOwner ||
      coOwners.includes(userEmail) ||
      coOwners.includes(userName)
    );
  }, [activeUser, effectiveOwner, coOwners]);

  // Per-person permission config
  const userPermConfig = useMemo<UserPermissionConfig | null>(() => {
    if (!activeUser) return null;
    const userEmail = (activeUser.email || '').toLowerCase();
    const userName = (activeUser.name || '').toLowerCase();
    const configs = settings.userPermissionConfigs || {};
    return configs[userEmail] || configs[userName] || null;
  }, [activeUser, settings.userPermissionConfigs]);

  // Can active user view all tasks?
  const canViewAll = useMemo(() => {
    if (isOwner) return true;
    if (settings.allowAllView) return true;
    if (!activeUser) return false;
    const userEmail = (activeUser.email || '').toLowerCase();
    const userName = (activeUser.name || '').toLowerCase();
    if (userPermConfig) {
      return userPermConfig.role === 'view_all';
    }
    if (settings.userPermissions) {
      return !!(settings.userPermissions[userEmail] || settings.userPermissions[userName]);
    }
    return false;
  }, [isOwner, settings.allowAllView, activeUser, userPermConfig, settings.userPermissions]);

  // View parameters
  const [currentWeek, setCurrentWeek] = useState<string>(() => mondayOf(new Date()));
  const [scope, setScope] = useState<'week' | 'range' | 'all'>('week');
  const [rangeFrom, setRangeFrom] = useState<string>(() => mondayOf(new Date()));
  const [rangeTo, setRangeTo] = useState<string>(() => addDays(mondayOf(new Date()), 4));
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterGroup, setFilterGroup] = useState<string>('');
  const [filterProject, setFilterProject] = useState<string>('');
  const [filterAuthor, setFilterAuthor] = useState<string>(''); // For Owner to filter by author
  const [filterLateOnly, setFilterLateOnly] = useState<boolean>(false);
  const [dateFilterFrom, setDateFilterFrom] = useState<string>('');
  const [dateFilterTo, setDateFilterTo] = useState<string>('');

  // Modals & Popovers
  const [activeModal, setActiveModal] = useState<'task' | 'settings' | 'export' | 'login' | 'permissions' | null>(null);
  const [selectedTask, setSelectedTask] = useState<Partial<Task> | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showTopExportMenu, setShowTopExportMenu] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Quick login modal input state
  const [loginInput, setLoginInput] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3200);
  };

  // 1. Auth listener & Connection test
  useEffect(() => {
    testConnection().then(ok => setDbConnected(ok));

    const unsubAuth = onAuthStateChanged(auth, user => {
      setCurrentUser(user);
    });

    return () => unsubAuth();
  }, []);

  // 2. Real-time Firestore sync (Tasks & Settings)
  useEffect(() => {
    // Settings listener
    const settingsRef = doc(db, 'meta', 'settings');
    const unsubSettings = onSnapshot(
      settingsRef,
      docSnap => {
        if (docSnap.exists()) {
          const data = docSnap.data() as AppSettings;
          setSettings(prev => ({ ...prev, ...data }));
        }
      },
      error => {
        console.warn('Settings fetch notice:', error);
      }
    );

    // Tasks listener
    const tasksCol = collection(db, 'tasks');
    const unsubTasks = onSnapshot(
      tasksCol,
      snapshot => {
        const list: Task[] = [];
        snapshot.forEach(docSnap => {
          const data = docSnap.data() as Task;
          list.push({ ...data, id: docSnap.id });
        });
        setTasks(list);
        setDbConnected(true);
        try {
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ tasks: list, settings }));
        } catch (_) {}
      },
      error => {
        console.warn('Tasks fetch notice:', error);
        setDbConnected(false);
        try {
          const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
          if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed.tasks) setTasks(parsed.tasks);
          }
        } catch (_) {}
      }
    );

    return () => {
      unsubSettings();
      unsubTasks();
    };
  }, []);

  // Save task
  const saveTask = async (taskData: Partial<Task>) => {
    if (!activeUser) {
      setActiveModal('login');
      showToast('กรุณาระบุชื่อหรือเข้าสู่ระบบก่อนเพิ่มงาน');
      return;
    }

    const isNew = !taskData.id;
    const taskId = taskData.id || `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const fullTask: Task = {
      id: taskId,
      title: taskData.title || '',
      week: taskData.week || currentWeek,
      project: taskData.project || '',
      group: taskData.group || settings.groups[0] || 'งานเริ่มใหม่',
      type: taskData.type || settings.types[0] || 'งานประจำ',
      priority: taskData.priority || settings.priorities[0] || 'ปกติ',
      status: taskData.status || 'กำลังทำ',
      plan: taskData.plan || '',
      start: taskData.start || '',
      actual: taskData.actual || '',
      days: taskData.days ?? 0,
      note: taskData.note || '',
      created: taskData.created || Date.now(),
      ord: taskData.ord ?? Date.now(),
      authorUid: taskData.authorUid || activeUser.uid,
      authorEmail: taskData.authorEmail || activeUser.email,
      authorName: taskData.authorName || activeUser.name,
      visibility: taskData.visibility || 'public',
      allowedViewers: taskData.allowedViewers || [],
    };

    try {
      await setDoc(doc(db, 'tasks', taskId), fullTask);
      showToast(isNew ? '✅ เพิ่มงานสำเร็จ (ซิงก์ออนไลน์แล้ว)' : '✅ บันทึกการแก้ไขแล้ว');
    } catch (err) {
      console.warn('Firestore write notice:', err);
      // Local fallback
      setTasks(prev => {
        const idx = prev.findIndex(t => t.id === taskId);
        return idx >= 0 ? [...prev.slice(0, idx), fullTask, ...prev.slice(idx + 1)] : [...prev, fullTask];
      });
      showToast('💾 บันทึกข้อมูลแล้ว');
    }
  };

  // Delete task
  const deleteTask = async (taskId: string) => {
    try {
      await deleteDoc(doc(db, 'tasks', taskId));
      showToast('🗑 ลบงานออกจากระบบแล้ว');
    } catch (err) {
      console.warn('Firestore delete notice:', err);
      setTasks(prev => prev.filter(t => t.id !== taskId));
      showToast('🗑 ลบงานแล้ว');
    }
  };

  // Save settings
  const saveSettings = async (newSettings: Partial<AppSettings>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);

    try {
      await setDoc(doc(db, 'meta', 'settings'), updated);
      showToast('⚙️ บันทึกการตั้งค่าแล้ว');
    } catch (err) {
      console.warn('Settings write notice:', err);
      showToast('⚙️ บันทึกการตั้งค่าแล้ว');
    }
  };

  // Move task up/down
  const moveTask = async (taskId: string, direction: 'up' | 'down') => {
    const visibleList = filteredTasks;
    const idx = visibleList.findIndex(t => t.id === taskId);
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (idx < 0 || targetIdx < 0 || targetIdx >= visibleList.length) return;

    const currentItem = visibleList[idx];
    const targetItem = visibleList[targetIdx];

    const currentOrd = currentItem.ord ?? currentItem.created;
    const targetOrd = targetItem.ord ?? targetItem.created;

    await saveTask({ ...currentItem, ord: targetOrd });
    await saveTask({ ...targetItem, ord: currentOrd });
  };

  // Sign in with Google safely
  const handleGoogleSignIn = async () => {
    const res = await signInWithGoogle();
    if (res.cancelled) {
      showToast('ℹ️ ปิดหน้าต่างเข้าสู่ระบบ');
    } else if (!res.success && res.error) {
      showToast(`⚠️ ${res.error}`);
    } else if (res.success) {
      setActiveModal(null);
      showToast('👋 เข้าสู่ระบบด้วย Google สำเร็จ');
    }
  };

  // Sign in with custom name or email
  const handleCustomLogin = (emailOrName: string) => {
    const val = emailOrName.trim();
    if (!val) return;
    const isEmail = val.includes('@');
    const profile = {
      email: isEmail ? val : `${val}@local.siphya`,
      name: isEmail ? val.split('@')[0] : val,
      uid: `u_${val.replace(/[^a-zA-Z0-9]/g, '_')}`,
    };
    setCustomUser(profile);
    try {
      localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(profile));
    } catch (_) {}
    setActiveModal(null);
    setLoginInput('');
    showToast(`👋 เข้าสู่ระบบในชื่อ ${profile.name}`);
  };

  // Logout
  const handleLogout = () => {
    setCustomUser(null);
    try {
      localStorage.removeItem(USER_PROFILE_KEY);
    } catch (_) {}
    logOut();
    showToast('ออกจากระบบแล้ว');
  };

  // File import handler
  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    try {
      if (file.name.endsWith('.json')) {
        const text = await file.text();
        const data = JSON.parse(text);
        if (Array.isArray(data.tasks)) {
          for (const t of data.tasks) {
            await saveTask(t);
          }
          if (data.settings && isOwner) {
            await saveSettings(data.settings);
          }
          showToast(`📥 กู้คืนข้อมูลสำเร็จ ${data.tasks.length} รายการ`);
        }
      } else {
        const parsed = await parseImportFile(file, currentWeek);
        if (parsed.length === 0) {
          showToast('⚠️ ไม่พบข้อมูลหรือหัวตารางที่ถูกต้องในไฟล์');
          return;
        }
        for (const t of parsed) {
          await saveTask(t);
        }
        showToast(`📥 นำเข้าสำเร็จ ${parsed.length} รายการ`);
      }
    } catch (err) {
      console.error('Import error:', err);
      showToast('❌ นำเข้าไฟล์ไม่สำเร็จ ตรวจสอบรูปแบบไฟล์');
    }
  };

  // Logo upload handler
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      saveSettings({ logo: result });
      showToast('🖼 อัปเดตตราบริษัทแล้ว');
    };
    reader.readAsDataURL(file);
  };

  // Sample data loader
  const handleLoadSample = async () => {
    const samples: Partial<Task>[] = [
      {
        title: 'จัดทำรายงานสรุปยอดประจำเดือน ส่วนงาน Procurement',
        project: 'Lumpini Tower',
        group: settings.groups[1] || 'งานเริ่มใหม่',
        type: settings.types[0] || 'งานประจำ',
        priority: settings.priorities[1] || 'เร่งด่วน',
        status: 'เสร็จสิ้น',
        plan: addDays(currentWeek, 2),
        start: currentWeek,
        actual: addDays(currentWeek, 2),
        days: 1.5,
        week: currentWeek,
        note: 'ส่งให้หัวหน้าตรวจเรียบร้อยแล้ว',
      },
      {
        title: 'ตรวจสอบและเปรียบเทียบราคาเหล็กเส้น ผู้รับเหมาช่วง',
        project: 'Bangna Condo',
        group: settings.groups[1] || 'งานเริ่มใหม่',
        type: settings.types[1] || 'งานเฉพาะกิจ',
        priority: settings.priorities[2] || 'ด่วนที่สุด',
        status: 'กำลังทำ',
        plan: addDays(currentWeek, 4),
        start: addDays(currentWeek, 1),
        actual: '',
        days: 2,
        week: currentWeek,
        note: 'รอใบเสนอราคาซัพพลายเออร์ 2 รายสุดท้าย',
      },
      {
        title: 'ประสานงานตรวจรับอุปกรณ์และวัสดุก่อสร้างหน้างาน',
        project: 'Rama 4 Bridge',
        group: settings.groups[0] || 'งานค้างเก่า',
        type: settings.types[0] || 'งานประจำ',
        priority: settings.priorities[0] || 'ปกติ',
        status: 'ติดปัญหา',
        plan: addDays(currentWeek, 3),
        start: currentWeek,
        actual: '',
        days: 1,
        week: currentWeek,
        note: 'รอผู้ขายส่งเอกสารรับประกันคุณภาพ ขอให้ช่วยติดตาม',
      },
    ];

    for (const s of samples) {
      await saveTask(s);
    }
    showToast('✨ เพิ่มข้อมูลตัวอย่าง 3 รายการแล้ว');
  };

  // Distinct authors (for owner filter and permissions)
  const authors = useMemo(() => {
    const set = new Set<string>();
    tasks.forEach(t => {
      if (t.authorEmail) set.add(t.authorEmail);
      else if (t.authorName) set.add(t.authorName);
    });
    return Array.from(set).sort();
  }, [tasks]);

  // Task counts by author
  const taskCountsByAuthor = useMemo(() => {
    const counts: Record<string, number> = {};
    tasks.forEach(t => {
      const key = t.authorEmail || t.authorName || 'ไม่ระบุ';
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [tasks]);

  // Distinct projects
  const projects = useMemo(() => {
    return Array.from(new Set(tasks.map(t => (t.project || '').trim()).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b, 'th')
    );
  }, [tasks]);

  // Date overlapping test for custom range
  const dateOverlap = (t: Task) => {
    const lo = dateFilterFrom || '1970-01-01';
    const hi = dateFilterTo || '2100-12-31';
    const s0 = t.start || t.week;
    const e = t.actual || (t.status === 'เสร็จสิ้น' ? s0 : todayISO() > s0 ? todayISO() : s0);
    return s0 <= hi && e >= lo;
  };

  // Scope check
  const inScope = (t: Task) => {
    if (dateFilterFrom || dateFilterTo) return dateOverlap(t);
    if (scope === 'all') return true;
    if (scope === 'range') {
      const lo = rangeFrom;
      const hi = mondayOf(parseISO(rangeTo) || new Date());
      return t.week <= hi && t.week >= lo;
    }
    return isTaskInWeek(t, currentWeek);
  };

  // 1. Base tasks for the current view (filtered by user privacy, scope, project, group, author, date range, search)
  // Everything EXCEPT the status filter or late-only filter
  const baseVisibleTasks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const userEmail = (activeUser?.email || '').toLowerCase();
    const userName = (activeUser?.name || '').toLowerCase();

    return tasks.filter(t => {
      // 1. Privacy filter & per-person permissions:
      const isMyTask = Boolean(
        activeUser && (
          (t.authorUid && t.authorUid === activeUser.uid) ||
          (t.authorEmail && t.authorEmail.toLowerCase() === userEmail) ||
          (t.authorName && t.authorName.toLowerCase() === userName)
        )
      );

      const isSharedWithMe = Boolean(
        activeUser &&
          t.allowedViewers?.some(v => {
            const vl = v.toLowerCase();
            return vl === userEmail || vl === userName;
          })
      );

      // Owner always sees everything
      if (!isOwner) {
        // If task is strictly private: only author (and owner) can see
        if (t.visibility === 'private' && !isMyTask) {
          return false;
        }

        // If task is custom visibility: only author, owner, and allowed viewers can see
        if (t.visibility === 'custom' && !isMyTask && !isSharedWithMe) {
          return false;
        }

        // If user does not have view-all rights:
        if (!canViewAll) {
          const authorKey = (t.authorEmail || t.authorName || '').toLowerCase();
          const isAllowedAuthor = Boolean(
            userPermConfig?.role === 'custom' &&
              userPermConfig.allowedAuthors?.some(a => a.toLowerCase() === authorKey)
          );

          if (!isMyTask && !isSharedWithMe && !isAllowedAuthor) {
            return false;
          }
        }
      }

      // 2. Scope & Date filters:
      if (!inScope(t)) return false;

      // 3. Selection filters (Project, Group, Author, Search):
      if (filterGroup && t.group !== filterGroup) return false;
      if (filterProject && (t.project || '').trim() !== filterProject) return false;
      if (filterAuthor && t.authorEmail !== filterAuthor && t.authorName !== filterAuthor) return false;
      if (q) {
        const match =
          t.title.toLowerCase().includes(q) ||
          (t.project || '').toLowerCase().includes(q) ||
          (t.note || '').toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [
    tasks,
    isOwner,
    canViewAll,
    activeUser,
    userPermConfig,
    currentWeek,
    scope,
    rangeFrom,
    rangeTo,
    dateFilterFrom,
    dateFilterTo,
    filterGroup,
    filterProject,
    filterAuthor,
    searchQuery,
  ]);

  // 2. Summary KPI statistics strictly linking to the current filtered view
  const kpiStats = useMemo(() => {
    const total = baseVisibleTasks.length;
    const done = baseVisibleTasks.filter(t => t.status === 'เสร็จสิ้น').length;
    const doing = baseVisibleTasks.filter(t => t.status === 'กำลังทำ').length;
    const stuck = baseVisibleTasks.filter(t => t.status === 'ติดปัญหา').length;
    const late = baseVisibleTasks.filter(isTaskLate).length;
    const days = baseVisibleTasks.reduce((sum, t) => sum + daysOfTask(t), 0);
    const pct = total ? Math.round((done / total) * 100) : 0;
    return { total, done, doing, stuck, late, days, pct };
  }, [baseVisibleTasks]);

  // 3. 4 Charts strictly linking to the current filtered view
  const typeStats = useMemo(() => {
    const counts: Record<string, { count: number; days: number }> = {};
    settings.types.forEach(type => {
      counts[type] = { count: 0, days: 0 };
    });
    baseVisibleTasks.forEach(t => {
      if (!counts[t.type]) counts[t.type] = { count: 0, days: 0 };
      counts[t.type].count++;
      counts[t.type].days += daysOfTask(t);
    });
    return Object.entries(counts);
  }, [baseVisibleTasks, settings.types]);

  // 4. Visible table rows applying the status / late filter on top of baseVisibleTasks
  const filteredTasks = useMemo(() => {
    return baseVisibleTasks
      .filter(t => {
        if (filterStatus && t.status !== filterStatus) return false;
        if (filterLateOnly && !isTaskLate(t)) return false;
        return true;
      })
      .sort((a, b) => (a.ord ?? a.created) - (b.ord ?? b.created));
  }, [baseVisibleTasks, filterStatus, filterLateOnly]);

  return (
    <div className="wrap" id="app">
      {/* Toast Notification */}
      {toastMessage && <div id="toast">{toastMessage}</div>}

      {/* Header Banner */}
      <header>
        <div className="toprow">
          <div className="title">
            <h1>แผนและสรุปบันทึกงานประจำสัปดาห์ (Weekly Report)</h1>
            <div className="sub">
              <label style={{ flexDirection: 'row', alignItems: 'center', gap: '6px' }}>
                ชื่อ{' '}
                <input
                  id="name"
                  placeholder="ชื่อผู้รายงาน"
                  aria-label="ชื่อผู้รายงาน"
                  value={settings.name}
                  onChange={e => saveSettings({ name: e.target.value })}
                />
              </label>

              <span className={`dot ${dbConnected ? '' : 'local'}`}></span>
              <span id="savestate">
                {activeUser
                  ? dbConnected
                    ? 'ซิงก์ออนไลน์ทุกเครื่อง (Firestore)'
                    : 'ออฟไลน์'
                  : 'ยังไม่ได้ระบุตัวตน (คลิกเข้าสู่ระบบ)'}
              </span>

              {/* Privacy badge */}
              {isOwner ? (
                <span className="gschip owner" title="คุณคือเจ้าของเว็บ มีสิทธิ์ดูงานของทุกคน">
                  👑 เจ้าของเว็บ (Admin: {activeUser?.email})
                </span>
              ) : activeUser ? (
                <span className="gschip" title="คุณกำลังดูเฉพาะงานที่คุณเพิ่มเท่านั้น">
                  🔒 ส่วนตัว: {activeUser.name}
                </span>
              ) : (
                <span className="gschip err">
                  🔒 ยังไม่ได้ระบุผู้ใช้งาน
                </span>
              )}

              {/* Auth / Profile Button */}
              {activeUser ? (
                <button
                  type="button"
                  onClick={handleLogout}
                  className="gschip"
                  style={{ background: 'rgba(255,255,255,0.25)' }}
                  title="ออกจากระบบ"
                >
                  ออกจากระบบ ({activeUser.name})
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setActiveModal('login')}
                  className="gschip"
                  style={{ background: '#2563eb', fontWeight: 600 }}
                >
                  🔑 เข้าสู่ระบบ / ระบุชื่อ
                </button>
              )}
            </div>
          </div>

          <div className="brand">
            <button
              className="logo"
              id="logo"
              type="button"
              onClick={() => logoInputRef.current?.click()}
              aria-label="ตราบริษัท สี่พระยาก่อสร้าง จำกัด (คลิกเพื่อเปลี่ยนรูป)"
            >
              {settings.logo ? (
                <img alt="ตราบริษัท สี่พระยาก่อสร้าง จำกัด" src={settings.logo} />
              ) : (
                <span>
                  สี่พระยาก่อสร้าง จำกัด<small>คลิกเพื่อใส่ตราบริษัท</small>
                </span>
              )}
            </button>
            <input
              ref={logoInputRef}
              type="file"
              id="logoFile"
              accept="image/*"
              onChange={handleLogoUpload}
              hidden
            />
          </div>
        </div>

        {/* Bottom row of Header */}
        <div className="bottomrow">
          <div className="weeknav">
            <button
              className="btn"
              id="prev"
              onClick={() => {
                setScope('week');
                setCurrentWeek(addDays(currentWeek, -7));
              }}
              aria-label="สัปดาห์ก่อนหน้า"
            >
              ‹
            </button>
            <div className="range" id="range">
              {scope === 'range'
                ? `${formatThaiDate(rangeFrom)} – ${formatThaiDate(rangeTo, true)} · วันทำงาน ${workdays(
                    rangeFrom,
                    rangeTo
                  )} วัน`
                : formatWeekRange(currentWeek)}
            </div>
            <button
              className="btn"
              id="next"
              onClick={() => {
                setScope('week');
                setCurrentWeek(addDays(currentWeek, 7));
              }}
              aria-label="สัปดาห์ถัดไป"
            >
              ›
            </button>
            <button
              className="btn"
              id="today"
              onClick={() => {
                setScope('week');
                setCurrentWeek(mondayOf(new Date()));
              }}
            >
              สัปดาห์นี้
            </button>
            <label className="rgbox">
              ตั้งแต่{' '}
              <input
                type="date"
                id="rFrom"
                value={rangeFrom}
                onChange={e => {
                  setRangeFrom(e.target.value);
                  setScope('range');
                }}
                aria-label="ตั้งแต่วันที่"
              />
            </label>
            <label className="rgbox">
              ถึง{' '}
              <input
                type="date"
                id="rTo"
                value={rangeTo}
                onChange={e => {
                  setRangeTo(e.target.value);
                  setScope('range');
                }}
                aria-label="ถึงวันที่"
              />
            </label>
          </div>

          <div className="xport menu">
            <button
              className="xbtn"
              id="xBtn"
              type="button"
              onClick={() => setShowTopExportMenu(!showTopExportMenu)}
              aria-haspopup="true"
              aria-expanded={showTopExportMenu}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 3v12M7 10l5 5 5-5M4 20h16" />
              </svg>
              Export <span aria-hidden="true">▾</span>
            </button>
            {showTopExportMenu && (
              <div
                className="pop xpop"
                id="xPop"
                onClick={() => setShowTopExportMenu(false)}
              >
                <button
                  type="button"
                  onClick={() => setActiveModal('export')}
                >
                  <span className="mi">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <rect x="3" y="5" width="18" height="16" rx="2" />
                      <path d="M3 10h18M8 3v4M16 3v4" />
                    </svg>
                  </span>
                  <span>
                    เลือกช่วงวันที่<small>หลายสัปดาห์ Excel / PDF / PNG</small>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => exportWeekToExcel(filteredTasks, settings, currentWeek)}
                >
                  <span className="mi">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <rect x="3" y="4" width="18" height="16" rx="2" />
                      <path d="M3 10h18M3 15h18M9 4v16" />
                    </svg>
                  </span>
                  <span>
                    Excel (.xlsx)<small>ฟอร์มรายงาน สัปดาห์ที่เลือก</small>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => exportReportPDF(filteredTasks, settings, currentWeek)}
                >
                  <span className="mi">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M6 3h8l4 4v14H6z" />
                      <path d="M14 3v4h4M9 13h6M9 17h6" />
                    </svg>
                  </span>
                  <span>
                    PDF (.pdf)<small>เต็มหน้า สัปดาห์ที่เลือก</small>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => exportReportPNG(filteredTasks, settings, currentWeek)}
                >
                  <span className="mi">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <rect x="3" y="4" width="18" height="16" rx="2" />
                      <circle cx="9" cy="10" r="1.6" />
                      <path d="M21 17l-5-5-9 8" />
                    </svg>
                  </span>
                  <span>
                    รูปภาพ (.png)<small>เต็มหน้า สัปดาห์ที่เลือก</small>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => exportToCSV(filteredTasks, settings)}
                >
                  <span className="mi">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <rect x="3" y="4" width="18" height="16" rx="2" />
                      <circle cx="9" cy="10" r="1.6" />
                      <path d="M21 17l-5-5-9 8" />
                    </svg>
                  </span>
                  <span>
                    CSV<small>ข้อมูลทั้งหมด (เปิดใน Excel ได้)</small>
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Owner Control Banner */}
      {isOwner && (
        <div style={{ background: '#fff', border: '1px solid #f59e0b', borderRadius: '14px', padding: '12px 16px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px' }}>👑</span>
            <div>
              <strong style={{ color: '#92400e' }}>แผงควบคุมเจ้าของเว็บ (Web Owner: {OWNER_EMAIL})</strong>
              <div style={{ fontSize: '12px', color: '#78350f' }}>
                คุณสามารถตรวจดูงานของผู้ร่วมงานทุกคน หรือกรองดูเฉพาะรายบุคคล และเปิด/ปิดสิทธิ์การมองเห็นได้
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <label style={{ flexDirection: 'row', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#78350f', fontWeight: 600 }}>
              กรองตามผู้รายงาน:
              <select
                value={filterAuthor}
                onChange={e => setFilterAuthor(e.target.value)}
                style={{ width: 'auto', padding: '4px 8px', fontSize: '12px', borderRadius: '8px', background: '#fffbeb', borderColor: '#fcd34d' }}
              >
                <option value="">ทุกคน (ทั้งหมด {tasks.length} งาน)</option>
                {authors.map(author => (
                  <option key={author} value={author}>
                    {author} ({tasks.filter(t => t.authorEmail === author || t.authorName === author).length} งาน)
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              className="btn"
              onClick={() => {
                const nextState = !settings.allowAllView;
                saveSettings({ allowAllView: nextState });
                showToast(nextState ? '🌐 อนุญาตให้ทุกคนเห็นงานของกันและกันแล้ว' : '🔒 ตั้งค่าเป็นโหมดส่วนตัว (แต่ละคนเห็นเฉพาะงานของตนเอง)');
              }}
              style={{ fontSize: '12px', padding: '5px 12px', background: settings.allowAllView ? '#ecfdf5' : '#fffbeb', borderColor: settings.allowAllView ? '#10b981' : '#f59e0b', color: settings.allowAllView ? '#065f46' : '#92400e', fontWeight: 600 }}
            >
              {settings.allowAllView ? '🌐 สิทธิ์ปัจจุบัน: อนุญาตให้เห็นงานทุกคน' : '🔒 สิทธิ์ปัจจุบัน: ส่วนตัว (แต่ละคนเห็นเฉพาะงานตนเอง)'}
            </button>
          </div>
        </div>
      )}

      {/* KPI Section */}
      <section className="kpis" id="kpis" aria-label="สรุป">
        <button
          type="button"
          className="kpi"
          id="kAll"
          onClick={() => {
            setFilterStatus('');
            setFilterLateOnly(false);
          }}
          aria-pressed={!filterStatus && !filterLateOnly}
          style={{ '--k': 'var(--c1)' } as React.CSSProperties}
          title="แสดงงานทั้งหมดในมุมมองที่เลือก (ล้างตัวกรองสถานะ)"
        >
          <b>{kpiStats.total}</b>
          <span>งานทั้งหมด</span>
        </button>

        <button
          type="button"
          className="kpi"
          id="kS0"
          onClick={() => {
            setFilterStatus(filterStatus === 'เสร็จสิ้น' ? '' : 'เสร็จสิ้น');
            setFilterLateOnly(false);
          }}
          aria-pressed={filterStatus === 'เสร็จสิ้น'}
          style={{ '--k': 'var(--ok)' } as React.CSSProperties}
          title="ดูเฉพาะงานที่เสร็จสิ้น"
        >
          <b>{kpiStats.done} ({kpiStats.pct}%)</b>
          <span>เสร็จสิ้น</span>
        </button>

        <button
          type="button"
          className="kpi"
          id="kS1"
          onClick={() => {
            setFilterStatus(filterStatus === 'กำลังทำ' ? '' : 'กำลังทำ');
            setFilterLateOnly(false);
          }}
          aria-pressed={filterStatus === 'กำลังทำ'}
          style={{ '--k': 'var(--doing)' } as React.CSSProperties}
          title="ดูเฉพาะงานที่กำลังทำ"
        >
          <b>{kpiStats.doing}</b>
          <span>กำลังทำ</span>
        </button>

        <button
          type="button"
          className="kpi"
          id="kS2"
          onClick={() => {
            setFilterStatus(filterStatus === 'ติดปัญหา' ? '' : 'ติดปัญหา');
            setFilterLateOnly(false);
          }}
          aria-pressed={filterStatus === 'ติดปัญหา'}
          style={{ '--k': 'var(--bad)' } as React.CSSProperties}
          title="ดูเฉพาะงานที่ติดปัญหา"
        >
          <b>{kpiStats.stuck}</b>
          <span>ติดปัญหา</span>
        </button>

        <button
          type="button"
          className="kpi"
          id="kLate"
          onClick={() => {
            setFilterLateOnly(!filterLateOnly);
            setFilterStatus('');
          }}
          aria-pressed={filterLateOnly}
          style={{ '--k': 'var(--warn)' } as React.CSSProperties}
          title="ดูเฉพาะงานที่เลยกำหนดแผนในมุมมองที่เลือก"
        >
          <b>{kpiStats.late}</b>
          <span>เลยกำหนดแผน</span>
        </button>

        <div className="kpi" style={{ '--k': 'var(--c3)' } as React.CSSProperties}>
          <b>{kpiStats.days.toFixed(1)}</b>
          <span>วันที่ใช้จริง</span>
        </div>
      </section>

      {/* 4 Charts Section */}
      <section className="charts">
        {/* Status Chart */}
        <div className="panel">
          <h2>สถานะงาน</h2>
          <div id="chStatus">
            {kpiStats.total > 0 ? (
              <>
                <div className="stack" role="img" aria-label="สัดส่วนสถานะ">
                  {kpiStats.done > 0 && (
                    <i style={{ width: `${(kpiStats.done / kpiStats.total) * 100}%`, background: 'var(--ok)' }}></i>
                  )}
                  {kpiStats.doing > 0 && (
                    <i style={{ width: `${(kpiStats.doing / kpiStats.total) * 100}%`, background: 'var(--doing)' }}></i>
                  )}
                  {kpiStats.stuck > 0 && (
                    <i style={{ width: `${(kpiStats.stuck / kpiStats.total) * 100}%`, background: 'var(--bad)' }}></i>
                  )}
                </div>
                <div className="legend">
                  <span>
                    <i className="sw" style={{ background: 'var(--ok)' }}></i>เสร็จสิ้น <em>{kpiStats.done}</em>
                  </span>
                  <span>
                    <i className="sw" style={{ background: 'var(--doing)' }}></i>กำลังทำ <em>{kpiStats.doing}</em>
                  </span>
                  <span>
                    <i className="sw" style={{ background: 'var(--bad)' }}></i>ติดปัญหา <em>{kpiStats.stuck}</em>
                  </span>
                </div>
              </>
            ) : (
              <div className="empty-chart">ยังไม่มีงานในช่วงนี้</div>
            )}
          </div>
        </div>

        {/* Workdays by Type Chart */}
        <div className="panel">
          <h2>เวลาที่ใช้จริง (วัน) แยกตามประเภทงาน</h2>
          <div id="chType">
            {kpiStats.total > 0 ? (
              <div className="hbars">
                {typeStats.map(([tName, data], i) => {
                  const mx = Math.max(1, ...typeStats.map(x => x[1].days));
                  return (
                    <div className="hbar" key={tName}>
                      <span title={tName}>{tName}</span>
                      <div className="track">
                        <i
                          style={{
                            width: `${(data.days / mx) * 100}%`,
                            background: `var(--c${((i + 2) % 6) + 1})`,
                          }}
                        ></i>
                      </div>
                      <span className="v">{data.days.toFixed(1)}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="empty-chart">ยังไม่มีข้อมูล</div>
            )}
          </div>
        </div>

        {/* Task Count by Type Chart */}
        <div className="panel">
          <h2>จำนวน (งาน) แยกตามประเภทงาน</h2>
          <div id="chTypeN">
            {kpiStats.total > 0 ? (
              <div className="hbars">
                {typeStats.map(([tName, data], i) => {
                  const mxN = Math.max(1, ...typeStats.map(x => x[1].count));
                  return (
                    <div className="hbar" key={tName}>
                      <span title={tName}>{tName}</span>
                      <div className="track">
                        <i
                          style={{
                            width: `${(data.count / mxN) * 100}%`,
                            background: `var(--c${((i + 2) % 6) + 1})`,
                          }}
                        ></i>
                      </div>
                      <span className="v">{data.count}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="empty-chart">ยังไม่มีข้อมูล</div>
            )}
          </div>
        </div>

        {/* Priority Chart */}
        <div className="panel">
          <h2>ระดับความสำคัญ (งาน) แยกตามประเภทงาน</h2>
          <div id="chPri">
            {kpiStats.total > 0 ? (
              <>
                <div className="hbars">
                  {typeStats.map(([tName, data], i) => {
                    const mxN = Math.max(1, ...typeStats.map(x => x[1].count));
                    const pTasks = baseVisibleTasks.filter((t: Task) => t.type === tName);
                    return (
                      <div className="hbar" key={tName}>
                        <span title={tName}>{tName}</span>
                        <div className="track">
                          <div className="pstack" style={{ width: `${(data.count / mxN) * 100}%` }}>
                            {settings.priorities.map((pri, pi) => {
                              const cnt = pTasks.filter((t: Task) => t.priority === pri).length;
                              if (!cnt) return null;
                              const colors = ['var(--doing)', 'var(--warn)', 'var(--bad)'];
                              return (
                                <b
                                  key={pri}
                                  style={{ flex: cnt, background: colors[pi % 3] }}
                                  title={`${pri} ${cnt}`}
                                ></b>
                              );
                            })}
                          </div>
                        </div>
                        <span className="v">{data.count}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="legend">
                  {settings.priorities.map((pri, i) => {
                    const colors = ['var(--doing)', 'var(--warn)', 'var(--bad)'];
                    const count = baseVisibleTasks.filter((t: Task) => t.priority === pri).length;
                    return (
                      <span key={pri}>
                        <i className="sw" style={{ background: colors[i % 3] }}></i>
                        {pri} <em>{count}</em>
                      </span>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="empty-chart">ยังไม่มีข้อมูล</div>
            )}
          </div>
        </div>
      </section>

      {/* Toolbar */}
      <section className="toolbar">
        <div className="seg" role="group" aria-label="ช่วงข้อมูล">
          <button
            id="scWeek"
            onClick={() => setScope('week')}
            aria-pressed={scope === 'week'}
          >
            สัปดาห์นี้
          </button>
          {scope === 'range' && (
            <button id="scRange" aria-pressed={true}>
              ช่วงที่เลือก
            </button>
          )}
          <button
            id="scAll"
            onClick={() => setScope('all')}
            aria-pressed={scope === 'all'}
          >
            ทั้งหมด
          </button>
        </div>

        <div className={`dfilter ${dateFilterFrom || dateFilterTo ? 'on' : ''}`} id="dfilter" role="group" aria-label="กรองตามช่วงวันที่">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M3 10h18M8 3v4M16 3v4" />
          </svg>
          <span>ตั้งแต่</span>
          <input
            type="date"
            id="dFrom"
            value={dateFilterFrom}
            onChange={e => setDateFilterFrom(e.target.value)}
            aria-label="ตั้งแต่วันที่"
          />
          <span>ถึง</span>
          <input
            type="date"
            id="dTo"
            value={dateFilterTo}
            onChange={e => setDateFilterTo(e.target.value)}
            aria-label="ถึงวันที่"
          />
          {(dateFilterFrom || dateFilterTo) && (
            <button
              type="button"
              id="dClear"
              onClick={() => {
                setDateFilterFrom('');
                setDateFilterTo('');
              }}
              title="ล้างช่วงวันที่"
              aria-label="ล้างช่วงวันที่"
            >
              ✕
            </button>
          )}
        </div>

        <input
          className="grow"
          id="q"
          type="search"
          placeholder="ค้นหารายการงาน / ปัญหา"
          aria-label="ค้นหา"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />

        <select
          id="fStatus"
          aria-label="กรองสถานะ"
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
        >
          <option value="">ทุกสถานะ</option>
          {STATUS_LIST.map(s => (
            <option key={s.key} value={s.key}>
              {s.key}
            </option>
          ))}
        </select>

        <select
          id="fGroup"
          aria-label="กรองกลุ่มงาน"
          value={filterGroup}
          onChange={e => setFilterGroup(e.target.value)}
        >
          <option value="">ทุกกลุ่มงาน</option>
          {settings.groups.map(g => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>

        <select
          id="fProject"
          aria-label="กรองโครงการ"
          value={filterProject}
          onChange={e => setFilterProject(e.target.value)}
        >
          <option value="">ทุกโครงการ</option>
          {projects.map(p => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        <button
          className="btn primary"
          id="add"
          onClick={() => {
            if (!activeUser) {
              setActiveModal('login');
              return;
            }
            setSelectedTask(null);
            setActiveModal('task');
          }}
        >
          + เพิ่มงาน
        </button>

        <div className="menu">
          <button
            className="btn"
            id="expBtn"
            onClick={() => setShowExportMenu(!showExportMenu)}
            aria-haspopup="true"
            aria-expanded={showExportMenu}
          >
            ส่งออก / นำเข้า ▾
          </button>
          {showExportMenu && (
            <div
              className="pop"
              id="expPop"
              onClick={() => setShowExportMenu(false)}
            >
              <button type="button" onClick={() => setActiveModal('export')}>
                Export ตามช่วงวันที่ <small>เลือกวันเริ่ม–สิ้นสุด หลายสัปดาห์</small>
              </button>
              <button type="button" onClick={() => exportReportPDF(filteredTasks, settings, currentWeek)}>
                PDF (.pdf) <small>เต็มหน้า สัปดาห์ที่เลือก เหมือนหน้าเว็บ</small>
              </button>
              <button type="button" onClick={() => exportReportPNG(filteredTasks, settings, currentWeek)}>
                รูปภาพ (.png) <small>เต็มหน้า สัปดาห์ที่เลือก เหมือนหน้าเว็บ</small>
              </button>
              <button type="button" onClick={() => exportWeekToExcel(filteredTasks, settings, currentWeek)}>
                Excel (.xlsx) <small>สัปดาห์ที่เลือก ตามฟอร์มเดิม</small>
              </button>
              <button type="button" onClick={() => exportAllToExcel(tasks, settings)}>
                Excel (.xlsx) <small>ทุกสัปดาห์ แยกชีตตามสัปดาห์</small>
              </button>
              <button type="button" onClick={() => exportToCSV(filteredTasks, settings)}>
                CSV <small>ข้อมูลทั้งหมด (เปิดใน Excel ได้)</small>
              </button>
              <button
                type="button"
                onClick={() => {
                  const blob = new Blob([JSON.stringify({ settings, tasks: filteredTasks }, null, 2)], {
                    type: 'application/json',
                  });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `weekly-report-backup-${todayISO()}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                สำรองข้อมูล (.json)
              </button>
              <hr />
              <button type="button" onClick={() => fileInputRef.current?.click()}>
                นำเข้าจาก Excel / CSV <small>เข้าสัปดาห์ที่เลือก</small>
              </button>
              <button type="button" onClick={() => fileInputRef.current?.click()}>
                กู้คืนจากไฟล์สำรอง (.json)
              </button>
              <hr />
              <button type="button" onClick={() => setActiveModal('settings')}>
                ตั้งค่ารายการตัวเลือก
              </button>
              <button type="button" onClick={() => logoInputRef.current?.click()}>
                อัปโหลดตราบริษัท
              </button>
              <button
                type="button"
                onClick={() => {
                  saveSettings({ logo: '' });
                  showToast('ลบตราบริษัทแล้ว');
                }}
              >
                ลบตราบริษัท
              </button>
            </div>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          id="file"
          accept=".xlsx,.xls,.csv,.json"
          onChange={handleFileImport}
          hidden
        />
      </section>

      {/* Table Section */}
      <section className="tablewrap" id="tablewrap">
        {filteredTasks.length === 0 ? (
          <div className="empty">
            <h3>
              {searchQuery || filterStatus || filterGroup || filterProject || filterAuthor || filterLateOnly
                ? 'ไม่พบงานตามเงื่อนไขที่เลือก'
                : `ยังไม่มีงานของคุณในช่วง ${formatWeekRange(currentWeek)}`}
            </h3>
            {searchQuery || filterStatus || filterGroup || filterProject || filterAuthor || filterLateOnly
              ? 'ลองล้างตัวกรองหรือคำค้นหา'
              : activeUser
              ? 'เพิ่มงานแรกของคุณ หรือนำเข้าจากไฟล์ Excel เดิม (แต่ละคนจะเห็นเฉพาะงานของตนเอง)'
              : 'กรุณาระบุชื่อหรือเข้าสู่ระบบ เพื่อเพิ่มและดูงานส่วนตัวของคุณ'}
            <div className="acts">
              {activeUser ? (
                <>
                  <button
                    className="btn primary"
                    onClick={() => {
                      setSelectedTask(null);
                      setActiveModal('task');
                    }}
                  >
                    + เพิ่มงาน
                  </button>
                  <button className="btn" onClick={() => fileInputRef.current?.click()}>
                    นำเข้าจาก Excel
                  </button>
                  <button className="btn" onClick={handleLoadSample}>
                    ใส่ข้อมูลตัวอย่าง
                  </button>
                </>
              ) : (
                <button className="btn primary" onClick={() => setActiveModal('login')}>
                  🔑 ระบุชื่อ / เข้าสู่ระบบ เพื่อเริ่มใช้งาน
                </button>
              )}
            </div>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>ลำดับ</th>
                <th>รายการงานที่ทำ</th>
                <th>โครงการ</th>
                <th>กลุ่มงาน</th>
                <th>ประเภทงาน</th>
                <th>ระดับความสำคัญ</th>
                <th>
                  แผนจบที่วางไว้<small>(วันที่)</small>
                </th>
                <th>
                  วันที่เริ่มต้นทำจริง<small>(วันที่)</small>
                </th>
                <th>
                  วันที่แล้วเสร็จ<small>(วันที่)</small>
                </th>
                <th className="num">
                  เวลาที่ใช้จริง<small>(วัน)</small>
                </th>
                <th>สถานะ</th>
                <th>อัปเดตล่าสุด / ปัญหา &amp; ข้อช่วยเหลือ</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredTasks.map((t, idx) => {
                const late = isTaskLate(t);
                const carried = isTaskCarriedForward(t, currentWeek);
                const statusObj = STATUS_LIST.find(s => s.key === t.status) || STATUS_LIST[1];
                const pi = Math.max(0, settings.priorities.indexOf(t.priority));
                const pClass = pi >= 2 ? 'p2' : pi === 1 ? 'p1' : '';
                const sc = t.status === 'เสร็จสิ้น' ? 'done' : t.status === 'กำลังทำ' ? 'doing' : 'stuck';
                const colIdx = (idx % 6) + 1;

                return (
                  <tr
                    key={t.id}
                    data-id={t.id}
                    style={{ '--st': `var(${statusObj.color === '#0f9d72' ? '--ok' : statusObj.color === '#2f8fe0' ? '--doing' : '--bad'})` } as React.CSSProperties}
                  >
                    <td className="idx">
                      <span className="grip" title="ลำดับ">
                        ⠿
                      </span>
                      <span className="n">{idx + 1}</span>
                      <span className="mv">
                        <button
                          type="button"
                          onClick={() => moveTask(t.id, 'up')}
                          title="เลื่อนขึ้น"
                          aria-label="เลื่อนขึ้น"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          onClick={() => moveTask(t.id, 'down')}
                          title="เลื่อนลง"
                          aria-label="เลื่อนลง"
                        >
                          ▼
                        </button>
                      </span>
                    </td>

                    <td className="job">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedTask(t);
                          setActiveModal('task');
                        }}
                        title="คลิกเพื่อแก้ไข"
                      >
                        {t.title || '(ไม่มีชื่องาน)'}
                      </button>
                      {scope !== 'week' || dateFilterFrom || dateFilterTo ? (
                        <span className="tag">สัปดาห์ {formatThaiDate(t.week)}</span>
                      ) : carried ? (
                        <span className="tag">↪ ยกมาจากสัปดาห์ {formatThaiDate(t.week)}</span>
                      ) : null}

                      {/* Author badge if Owner is viewing other people's tasks */}
                      {isOwner && t.authorEmail && (
                        <span className="author">
                          👤 ผู้รายงาน: {t.authorName || t.authorEmail}
                        </span>
                      )}
                    </td>

                    <td>
                      {t.project ? (
                        <span className="chip" style={{ '--c': `var(--c${colIdx})` } as React.CSSProperties}>
                          {t.project}
                        </span>
                      ) : (
                        <span className="hint">–</span>
                      )}
                    </td>

                    <td>
                      <span className="chip" style={{ '--c': 'var(--c1)' } as React.CSSProperties}>
                        {t.group}
                      </span>
                    </td>

                    <td>
                      <span className="chip" style={{ '--c': 'var(--c3)' } as React.CSSProperties}>
                        {t.type}
                      </span>
                    </td>

                    <td>
                      <span className={`pill ${pClass}`}>{t.priority}</span>
                    </td>

                    <td className={`date ${late ? 'late' : ''}`}>
                      {formatThaiDate(t.plan)}
                      {late ? ' ⚠' : ''}
                    </td>

                    <td className="date">{formatThaiDate(t.start)}</td>

                    <td className="date">{formatThaiDate(t.actual)}</td>

                    <td className="num">{daysOfTask(t).toFixed(1)}</td>

                    <td>
                      <select
                        className={`st s-${sc}`}
                        value={t.status}
                        onChange={e => {
                          const newStatus = e.target.value as 'เสร็จสิ้น' | 'กำลังทำ' | 'ติดปัญหา';
                          saveTask({
                            ...t,
                            status: newStatus,
                            start: newStatus === 'กำลังทำ' && !t.start ? todayISO() : t.start,
                            actual: newStatus === 'เสร็จสิ้น' && !t.actual ? todayISO() : t.actual,
                          });
                        }}
                        aria-label="สถานะ"
                      >
                        {STATUS_LIST.map(x => (
                          <option key={x.key} value={x.key}>
                            {x.key}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className="note">{t.note}</td>

                    <td className="rowact">
                      <button
                        className="btn ghost"
                        type="button"
                        onClick={() => {
                          setSelectedTask(t);
                          setActiveModal('task');
                        }}
                      >
                        แก้ไข
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* Table Footer info */}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px', fontSize: '12px', color: 'var(--muted)', fontWeight: 500 }}>
        <span>
          แสดงผล {filteredTasks.length} รายการ (จากทั้งหมด {kpiStats.total} รายการตามเงื่อนไขที่เลือกดู)
        </span>
        {filterStatus && (
          <span>
            กรองเฉพาะสถานะ: <strong style={{ color: 'var(--accent)' }}>{filterStatus}</strong>
          </span>
        )}
      </div>

      {/* Footer */}
      <footer className="foot">
        <span>Siphya Construction Co., Ltd.</span>
        <span>แผนก QS ส่วนงาน Procurement</span>
      </footer>

      {/* Login / Profile Modal */}
      {activeModal === 'login' && (
        <div className="overlay" onClick={() => setActiveModal(null)}>
          <div
            className="modal"
            style={{ maxWidth: '440px' }}
            onClick={e => e.stopPropagation()}
            role="dialog"
          >
            <h2>เข้าสู่ระบบเพื่อใช้งานพื้นที่ส่วนตัว</h2>
            <p className="hint" style={{ margin: 0 }}>
              ระบบแยกพื้นที่งานของแต่ละคนเป็นส่วนตัว โดยแต่ละคนจะมองเห็นเฉพาะงานของตนเอง (ยกเว้นเจ้าของเว็บที่เห็นทุกคน)
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '6px' }}>
              {/* Option A: Quick name / email input (100% reliable, no popup blocks) */}
              <form
                onSubmit={e => {
                  e.preventDefault();
                  handleCustomLogin(loginInput);
                }}
                style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
              >
                <label>
                  พิมพ์ชื่อ หรือ อีเมล ของคุณ:
                  <input
                    type="text"
                    required
                    placeholder="เช่น สมชาย (QS) หรือ somchai@siphya.com"
                    value={loginInput}
                    onChange={e => setLoginInput(e.target.value)}
                    autoFocus
                  />
                </label>

                <button type="submit" className="btn primary" style={{ justifyContent: 'center' }}>
                  เข้าใช้งานทันที (แนะนำ - ใช้งานได้ทุกเครื่อง)
                </button>
              </form>

              {/* Quick switch to Owner */}
              <div style={{ background: '#fffbeb', border: '1px dashed #f59e0b', borderRadius: '10px', padding: '10px', fontSize: '12px' }}>
                <span style={{ fontWeight: 600, color: '#92400e' }}>สำหรับเจ้าของเว็บ:</span>
                <button
                  type="button"
                  onClick={() => handleCustomLogin(OWNER_EMAIL)}
                  style={{ all: 'unset', cursor: 'pointer', display: 'block', color: '#b45309', textDecoration: 'underline', marginTop: '4px', fontWeight: 600 }}
                >
                  👑 คลิกที่นี่เพื่อเข้าสู่ระบบในฐานะเจ้าของเว็บ ({OWNER_EMAIL})
                </button>
              </div>

              <div style={{ textAlign: 'center', fontSize: '11px', color: '#94a3b8' }}>— หรือ —</div>

              {/* Option B: Google popup */}
              <button
                type="button"
                className="btn"
                onClick={handleGoogleSignIn}
                style={{ justifyContent: 'center', background: '#f8fafc' }}
              >
                เข้าสู่ระบบด้วย Google Account
              </button>

              <button
                type="button"
                className="btn ghost"
                onClick={() => setActiveModal(null)}
                style={{ justifyContent: 'center' }}
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Task Modal */}
      {activeModal === 'task' && (
        <TaskModal
          isOpen={true}
          task={selectedTask}
          onClose={() => setActiveModal(null)}
          onSave={saveTask}
          onDelete={deleteTask}
          settings={settings}
          existingProjects={projects}
          currentWeek={currentWeek}
        />
      )}

      {/* Settings Modal */}
      {activeModal === 'settings' && (
        <SettingsModal
          isOpen={true}
          settings={settings}
          onClose={() => setActiveModal(null)}
          onSave={saveSettings}
        />
      )}

      {/* Export Modal */}
      {activeModal === 'export' && (
        <ExportModal
          isOpen={true}
          onClose={() => setActiveModal(null)}
          tasks={filteredTasks}
          settings={settings}
          currentWeek={currentWeek}
        />
      )}
    </div>
  );
}
