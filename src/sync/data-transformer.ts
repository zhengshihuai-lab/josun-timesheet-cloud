/**
 * JOSUN PMO Timesheet Sync - Data Transformer
 *
 * Transforms WeCom timesheet records (weekly rows with per-category hours)
 * into individual daily YonSuite timesheet records.
 */

import {
  resolveEmployeeId,
  resolveProject,
  resolveActivityName,
  getWeekDates,
  WEEK_DATE_MAP,
} from '../config/field-mapping.js';
import type {
  WeComTimesheetRecord,
  YonSuiteTimesheetRecord,
} from '../types/index.js';

// ---------------------------------------------------------------------------
// Time Calculation Helpers
// ---------------------------------------------------------------------------

/** Standard work day start time. */
const WORK_START_HOUR = 9;

/**
 * Calculates start_time and end_time strings based on hours worked in a day.
 * Assumes a standard 09:00 start and computes the end time from hours.
 *
 * @param hours - Hours worked (decimal).
 * @returns Object with start_time and end_time in HH:mm format.
 */
function calculateTimeRange(hours: number): { start_time: string; end_time: string } {
  if (hours <= 0) {
    return { start_time: '09:00', end_time: '09:00' };
  }

  const startMinutes = WORK_START_HOUR * 60;
  const endMinutes = startMinutes + Math.round(hours * 60);

  const startH = Math.floor(startMinutes / 60);
  const startM = startMinutes % 60;
  const endH = Math.floor(endMinutes / 60);
  const endM = endMinutes % 60;

  const pad = (n: number) => String(n).padStart(2, '0');

  return {
    start_time: `${pad(startH)}:${pad(startM)}`,
    end_time: `${pad(Math.min(endH, 23))}:${pad(endM)}`,
  };
}

/**
 * Generates a unique sync_id for idempotency.
 * Format: {employeeId}_{projectCode}_{date}_{activityName}
 *
 * @param employeeId - YonSuite employee ID.
 * @param projectCode - YonSuite project code.
 * @param date - Date in YYYY-MM-DD format.
 * @param activityName - Activity name.
 * @returns A unique sync_id string.
 */
function generateSyncId(
  employeeId: string,
  projectCode: string,
  date: string,
  activityName: string,
): string {
  const sanitizedActivity = activityName.replace(/\s+/g, '_');
  return `${employeeId}_${projectCode}_${date}_${sanitizedActivity}`;
}

// ---------------------------------------------------------------------------
// Transformation
// ---------------------------------------------------------------------------

/**
 * Splits a weekly WeCom timesheet record into individual daily records
 * for each task category that has non-zero hours.
 *
 * The weekly hours are distributed evenly across the 5 weekdays (Mon-Fri).
 * For example, 20 hours of "後端開發" across the week becomes 4 hours/day
 * for each of the 5 days.
 *
 * @param record - A single WeCom weekly timesheet record.
 * @returns Array of YonSuite-formatted daily timesheet records.
 */
export function transformToYonSuiteRecords(
  record: WeComTimesheetRecord,
): YonSuiteTimesheetRecord[] {
  const employeeId = resolveEmployeeId(record.employeeName);
  const weekDates = getWeekDates(record.week);

  // If we can't resolve week dates, skip this record
  if (weekDates.length === 0) {
    console.warn(
      `[transformer] Unknown week "${record.week}" for ${record.employeeName}, skipping`,
    );
    return [];
  }

  const weekRange = WEEK_DATE_MAP[record.week];
  const results: YonSuiteTimesheetRecord[] = [];
  const reportTime = new Date().toISOString();

  // Determine the "project" for non-project categories
  // Internal categories (行政事務, 內部溝通, etc.) map to the INTERNAL project
  const INTERNAL_CATEGORIES = new Set([
    '行政事務',
    '內部溝通',
    '客戶接洽',
    '出差考察',
    '突發狀況',
  ]);

  for (const [category, weeklyHours] of Object.entries(record.hoursByCategory)) {
    if (weeklyHours <= 0) continue;

    // Distribute hours evenly across 5 work days
    const dailyHours = Math.round((weeklyHours / 5) * 100) / 100; // Round to 2 decimals
    const remainder = Math.round((weeklyHours - dailyHours * 5) * 100) / 100;

    // Determine project mapping
    const isInternal = INTERNAL_CATEGORIES.has(category);
    const projectName = isInternal ? '內部' : record.employeeName; // Default if no project context
    const project = resolveProject(isInternal ? '內部' : projectName);
    const activityName = resolveActivityName(category);

    for (let dayIndex = 0; dayIndex < weekDates.length; dayIndex++) {
      const date = weekDates[dayIndex];
      // Add remainder to the last day
      const hours = dayIndex === weekDates.length - 1
        ? Math.round((dailyHours + remainder) * 100) / 100
        : dailyHours;

      if (hours <= 0) continue;

      const { start_time, end_time } = calculateTimeRange(hours);
      const syncId = generateSyncId(employeeId, project.code, date, activityName);

      results.push({
        sync_id: syncId,
        employee_id: employeeId,
        employee_name: record.employeeName,
        project_code: project.code,
        project_name: isInternal ? '內部管理' : projectName,
        project_org: project.org,
        activity_name: activityName,
        start_date: date,
        end_date: date,
        start_time,
        end_time,
        hours,
        timesheet_type: '正常',
        reporter: record.employeeName,
        report_time: reportTime,
        notes: `${record.week} ${category}`,
      });
    }
  }

  return results;
}

/**
 * Transforms an array of WeCom weekly records into YonSuite daily records.
 * Deduplicates by sync_id (keeps the last occurrence).
 *
 * @param records - Array of WeCom weekly timesheet records.
 * @returns Array of unique YonSuite daily records ready for batch save.
 */
export function transformBatch(
  records: WeComTimesheetRecord[],
): YonSuiteTimesheetRecord[] {
  const seen = new Map<string, YonSuiteTimesheetRecord>();

  for (const record of records) {
    const dailyRecords = transformToYonSuiteRecords(record);
    for (const daily of dailyRecords) {
      // Last write wins for duplicate sync_ids
      seen.set(daily.sync_id, daily);
    }
  }

  const result = Array.from(seen.values());
  console.log(
    `[transformer] Transformed ${records.length} weekly records → ${result.length} daily records`,
  );

  return result;
}

/**
 * Filters YonSuite records by employee IDs.
 *
 * @param records - Full set of records.
 * @param employeeIds - Allowed employee IDs.
 * @returns Filtered records.
 */
export function filterByEmployees(
  records: YonSuiteTimesheetRecord[],
  employeeIds: string[],
): YonSuiteTimesheetRecord[] {
  if (employeeIds.length === 0) return records;
  const idSet = new Set(employeeIds);
  return records.filter((r) => idSet.has(r.employee_id));
}

/**
 * Filters YonSuite records by date range.
 *
 * @param records - Full set of records.
 * @param startDate - Start date (YYYY-MM-DD, inclusive).
 * @param endDate - End date (YYYY-MM-DD, inclusive).
 * @returns Filtered records.
 */
export function filterByDateRange(
  records: YonSuiteTimesheetRecord[],
  startDate: string,
  endDate: string,
): YonSuiteTimesheetRecord[] {
  return records.filter((r) => r.start_date >= startDate && r.start_date <= endDate);
}
