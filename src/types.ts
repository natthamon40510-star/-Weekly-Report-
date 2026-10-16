export type TaskVisibility = 'public' | 'private' | 'custom';

export interface Task {
  id: string;
  week: string; // ISO date of Monday (e.g., '2026-10-12')
  title: string;
  project?: string;
  group: string;
  type: string;
  priority: string;
  status: 'เสร็จสิ้น' | 'กำลังทำ' | 'ติดปัญหา';
  plan?: string;
  start?: string;
  actual?: string;
  days: number;
  note?: string;
  created: number;
  ord?: number;
  authorUid?: string;
  authorEmail?: string;
  authorName?: string;
  visibility?: TaskVisibility; // สิทธิ์การมองเห็นงานนี้
  allowedViewers?: string[]; // รายชื่ออีเมลหรือชื่อของบุคคลที่อนุญาตให้มองเห็นงานนี้ (กรณี custom)
}

export type UserViewRole = 'view_all' | 'own_only' | 'custom';

export interface UserPermissionConfig {
  role: UserViewRole;
  allowedAuthors?: string[]; // If role === 'custom', which authors' tasks can this user see?
  updatedAt?: number;
}

export interface AppSettings {
  name: string;
  groups: string[];
  types: string[];
  priorities: string[];
  logo?: string;
  allowAllView?: boolean;
  ownerEmail?: string;
  coOwners?: string[];
  userPermissions?: Record<string, boolean>; // key (lowercase email or name) -> canViewAll boolean
  userPermissionConfigs?: Record<string, UserPermissionConfig>; // detailed per-person config
  updatedAt?: number;
}

export const DEFAULT_OWNER_EMAIL = 'natthamon40510@gmail.com';
export const OWNER_EMAIL = DEFAULT_OWNER_EMAIL; // Alias for backward compatibility

export const DEFAULT_GROUPS = ['งานค้างเก่า', 'งานเริ่มใหม่'];
export const DEFAULT_TYPES = ['งานประจำ', 'งานเฉพาะกิจ', 'งานพัฒนา', 'อื่นๆ'];
export const DEFAULT_PRIORITIES = ['ปกติ', 'เร่งด่วน', 'ด่วนที่สุด'];

export const STATUS_LIST: Array<{ key: 'เสร็จสิ้น' | 'กำลังทำ' | 'ติดปัญหา'; color: string; bg: string; text: string }> = [
  { key: 'เสร็จสิ้น', color: '#0f9d72', bg: 'bg-emerald-50 border-emerald-300 text-emerald-800', text: 'text-emerald-700' },
  { key: 'กำลังทำ', color: '#2f8fe0', bg: 'bg-blue-50 border-blue-300 text-blue-800', text: 'text-blue-700' },
  { key: 'ติดปัญหา', color: '#e0384f', bg: 'bg-rose-50 border-rose-300 text-rose-800', text: 'text-rose-700' },
];
