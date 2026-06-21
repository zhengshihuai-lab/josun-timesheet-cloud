/**
 * JOSUN PMO Timesheet Sync - Type Definitions
 *
 * Shared types for the WeCom-to-YonSuite timesheet sync pipeline.
 */

// ---------------------------------------------------------------------------
// WeCom Smartsheet Types
// ---------------------------------------------------------------------------

/** A single cell value from a WeCom smartsheet row. */
export interface WeComCellValue {
  /** Column ID */
  columnId: string;
  /** Cell value (string, number, or null) */
  value: string | number | null;
}

/** A raw record (row) from the WeCom smartsheet API response. */
export interface WeComSheetRecord {
  /** Row ID in the smartsheet */
  rowId: string;
  /** Cell values keyed by column */
  cells: WeComCellValue[];
}

/** Metadata about a WeCom smartsheet column. */
export interface WeComColumn {
  id: string;
  title: string;
  type: string;
}

/** Parsed timesheet record from a WeCom smartsheet row. */
export interface WeComTimesheetRecord {
  /** Employee name as written in the smartsheet */
  employeeName: string;
  /** ISO week identifier, e.g. "W22" */
  week: string;
  /** Week date range, e.g. "5/26~5/30" */
  weekDates: string;
  /** Hours per task category for the week */
  hoursByCategory: Record<string, number>;
  /** Total hours for the week */
  totalHours: number;
}

// ---------------------------------------------------------------------------
// YonSuite Types
// ---------------------------------------------------------------------------

/** A single timesheet record formatted for YonSuite batchSave API. */
export interface YonSuiteTimesheetRecord {
  /** Unique sync ID for idempotency: {employeeId}_{projectId}_{date}_{taskType} */
  sync_id: string;
  /** YonSuite employee ID */
  employee_id: string;
  /** Employee display name */
  employee_name: string;
  /** Project code (e.g., "E260011") */
  project_code: string;
  /** Project name (e.g., "鵬鼎PA02") */
  project_name: string;
  /** Project organization */
  project_org: string;
  /** Activity name (e.g., "前端開發") */
  activity_name: string;
  /** Start date in YYYY-MM-DD format */
  start_date: string;
  /** End date in YYYY-MM-DD format */
  end_date: string;
  /** Start time in HH:mm format */
  start_time: string;
  /** End time in HH:mm format */
  end_time: string;
  /** Hours worked (decimal) */
  hours: number;
  /** Timesheet type (e.g., "正常") */
  timesheet_type: string;
  /** Reporter name */
  reporter: string;
  /** Report time ISO 8601 */
  report_time: string;
  /** Notes / remarks */
  notes: string;
}

/** YonSuite authentication token response. */
export interface YonSuiteAuthToken {
  access_token: string;
  expires_in: number;
  token_type: string;
  /** Absolute timestamp when the token expires */
  expires_at: number;
}

/** YonSuite batchSave API response. */
export interface YonSuiteBatchSaveResponse {
  success: boolean;
  code: string;
  message: string;
  data?: {
    successCount: number;
    failCount: number;
    errors?: Array<{
      index: number;
      message: string;
    }>;
  };
}

// ---------------------------------------------------------------------------
// Sync Pipeline Types
// ---------------------------------------------------------------------------

/** Configuration for a sync run. */
export interface SyncConfig {
  /** Sync mode */
  mode: 'dry-run' | 'live';
  /** Target week (e.g., "W22"). If undefined, syncs latest week. */
  week?: string;
  /** Filter to specific employees */
  employeeFilter?: string[];
  /** Start date filter (ISO) */
  startDate?: string;
  /** End date filter (ISO) */
  endDate?: string;
}

/** Result of a single record sync attempt. */
export interface SyncRecordResult {
  sync_id: string;
  status: 'created' | 'skipped' | 'error';
  employee: string;
  project: string;
  date: string;
  hours: number;
  error?: string;
}

/** Overall result of a sync run. */
export interface SyncResult {
  success: boolean;
  mode: 'dry-run' | 'live';
  week: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  summary: {
    totalRecords: number;
    created: number;
    skipped: number;
    errors: number;
  };
  records: SyncRecordResult[];
  errors: string[];
}

/** Change detection result for a single record. */
export interface ChangeRecord {
  sync_id: string;
  type: 'new' | 'updated' | 'unchanged';
  employeeName: string;
  category: string;
  hours: number;
  date: string;
}

/** Dashboard data returned by the /api/data endpoint. */
export interface DashboardData {
  weeks: string[];
  weekDates: Record<string, string>;
  employees: string[];
  categories: string[];
  timesheet: Record<string, Record<string, Record<string, number>>>;
  burnData: BurnEntry[];
  risks: RiskEntry[];
  lastUpdated: string;
}

/** Project burn-down entry for the dashboard. */
export interface BurnEntry {
  name: string;
  client: string;
  actual: number;
  est: number;
}

/** Risk entry for the dashboard. */
export interface RiskEntry {
  level: 'high' | 'medium' | 'low';
  title: string;
  desc: string;
  tag: string;
}
