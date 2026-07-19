/**
 * JOSUN PMO Timesheet Sync - Field Mapping Configuration
 *
 * Maps WeCom smartsheet fields to YonSuite ERP fields, including:
 * - Employee name → YonSuite employee ID
 * - Client / project name → YonSuite project code
 * - Task category → YonSuite activity name
 * - Week identifiers → date ranges
 */

// ---------------------------------------------------------------------------
// Employee Mapping: WeCom name → YonSuite employee ID
// ---------------------------------------------------------------------------

/** Maps employee display names (WeCom) to YonSuite employee IDs. */
export const EMPLOYEE_ID_MAP: Record<string, string> = {
  '萌萌': 'EMP001',
  '小熊': 'EMP002',
  '蒙海': 'EMP003',
  '羅潔': 'EMP004',
  'Marin': 'EMP005',
  '廖嘉良': 'EMP006',
  '天舒': 'EMP007',
  '雪可': 'EMP008',
  '馨蕊': 'EMP009',
  '慧婷': 'EMP010',
  '宇捷': 'EMP011',
  '秉睿': 'EMP012',
  '實習生': 'EMP013',
  '王笑一': 'EMP014',
  '裴文': 'EMP015',
};

/**
 * Resolves a WeCom employee name to a YonSuite employee ID.
 * Falls back to generating a deterministic ID from the name.
 */
export function resolveEmployeeId(name: string): string {
  if (EMPLOYEE_ID_MAP[name]) {
    return EMPLOYEE_ID_MAP[name];
  }
  // Deterministic fallback: hash-like prefix + sanitized name
  const sanitized = name.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '');
  return `EMP_${sanitized}`;
}

// ---------------------------------------------------------------------------
// Project / Client Mapping: WeCom project name → YonSuite project code
// ---------------------------------------------------------------------------

/** Maps project display names (WeCom) to YonSuite project codes. */
export const PROJECT_CODE_MAP: Record<string, { code: string; org: string }> = {
  '鵬鼎PA02': { code: 'E260011', org: 'FMCS系統整合' },
  '鵬鼎PA06': { code: 'E260012', org: '空調自控工程' },
  '耀登科技': { code: 'E260021', org: '門禁系統整合' },
  '群光電子': { code: 'E260031', org: 'BMS系統升級' },
  '川奇電子': { code: 'E260041', org: '產線監控系統' },
  '联茂一期': { code: 'E260051', org: '廠務監控新建' },
  '普英高分子': { code: 'E260061', org: '環境監控系統' },
  // Internal / non-billable categories are mapped to a generic internal project
  '內部': { code: 'INTERNAL', org: '內部管理' },
};

/**
 * Resolves a project name to a YonSuite project code and organization.
 */
export function resolveProject(name: string): { code: string; org: string } {
  if (PROJECT_CODE_MAP[name]) {
    return PROJECT_CODE_MAP[name];
  }
  return { code: 'UNKNOWN', org: '未分類' };
}

// ---------------------------------------------------------------------------
// Task Category → YonSuite Activity Name
// ---------------------------------------------------------------------------

/** All recognized task categories in the WeCom smartsheet. */
export const TASK_CATEGORIES = [
  '行政事務',
  '內部溝通',
  '專案管理',
  '前端開發',
  '後端開發',
  '系統整合',
  '圖控開發',
  '設計規劃',
  '客戶接洽',
  '出差考察',
  '突發狀況',
] as const;

export type TaskCategory = (typeof TASK_CATEGORIES)[number];

/**
 * Maps a WeCom task category to a YonSuite activity name.
 * Currently a 1:1 mapping; adjust if YonSuite uses different labels.
 */
export function resolveActivityName(category: string): string {
  // Direct mapping — same labels used in both systems
  return category;
}

// ---------------------------------------------------------------------------
// Week → Date Range Mapping
// ---------------------------------------------------------------------------

/** Maps ISO week identifiers to date ranges (Mon-Fri). */
export const WEEK_DATE_MAP: Record<string, { start: string; end: string }> = {
  'W19': { start: '2025-05-05', end: '2025-05-09' },
  'W20': { start: '2025-05-12', end: '2025-05-16' },
  'W21': { start: '2025-05-19', end: '2025-05-23' },
  'W22': { start: '2025-05-26', end: '2025-05-30' },
  'W23': { start: '2025-06-02', end: '2025-06-06' },
  'W24': { start: '2025-06-09', end: '2025-06-13' },
  'W25': { start: '2025-06-16', end: '2025-06-20' },
  'W26': { start: '2025-06-23', end: '2025-06-27' },
  'W27': { start: '2025-06-30', end: '2025-07-04' },
  'W28': { start: '2025-07-07', end: '2025-07-11' },
  'W29': { start: '2026-07-13', end: '2026-07-17' },
  'W30': { start: '2026-07-20', end: '2026-07-24' },
};

/** Short labels for the dashboard. */
export const WEEK_LABEL_MAP: Record<string, string> = {
  'W19': '5/5~5/9',
  'W20': '5/12~5/16',
  'W21': '5/19~5/23',
  'W22': '5/26~5/30',
  'W23': '6/2~6/6',
  'W24': '6/9~6/13',
  'W25': '6/16~6/20',
  'W26': '6/23~6/27',
  'W27': '6/30~7/4',
  'W28': '7/7~7/11',
  'W29': '7/13~7/17',
  'W30': '7/20~7/24',
};

/**
 * Returns an array of ISO dates (YYYY-MM-DD) for Mon-Fri of the given week.
 */
export function getWeekDates(weekId: string): string[] {
  const range = WEEK_DATE_MAP[weekId];
  if (!range) return [];

  const dates: string[] = [];
  const start = new Date(range.start + 'T00:00:00');
  for (let i = 0; i < 5; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

// ---------------------------------------------------------------------------
// All employees list (for dashboard and sync filtering)
// ---------------------------------------------------------------------------

export const ALL_EMPLOYEES = Object.keys(EMPLOYEE_ID_MAP);
