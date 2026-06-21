/**
 * JOSUN PMO Timesheet Sync - WeCom Smartsheet Reader
 *
 * Reads timesheet data from the WeCom (企业微信) smartsheet API.
 * Falls back to a cached JSON file when the API is unavailable.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { config, hasWecomCredentials } from '../config/env.js';
import { TASK_CATEGORIES } from '../config/field-mapping.js';
import type {
  WeComTimesheetRecord,
  WeComSheetRecord,
  WeComColumn,
} from '../types/index.js';

// ---------------------------------------------------------------------------
// WeCom API Token Management
// ---------------------------------------------------------------------------

/** Cached WeCom access token (per serverless invocation). */
let wecomToken: string | null = null;
let wecomTokenExpiry = 0;

/**
 * Acquires a WeCom access token using corp credentials.
 *
 * @returns A valid WeCom access token string.
 */
async function getWecomAccessToken(): Promise<string> {
  // Use pre-supplied token if available
  if (config.wecom.accessToken) {
    return config.wecom.accessToken;
  }

  if (wecomToken && Date.now() < wecomTokenExpiry) {
    return wecomToken;
  }

  const url =
    `${config.wecom.apiBase}/cgi-bin/gettoken` +
    `?corpid=${encodeURIComponent(config.wecom.corpId)}` +
    `&corpsecret=${encodeURIComponent(config.wecom.apiSecret)}`;

  const response = await fetch(url, { method: 'GET' });
  if (!response.ok) {
    throw new Error(`WeCom token request failed: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as {
    errcode: number;
    errmsg: string;
    access_token: string;
    expires_in: number;
  };

  if (data.errcode !== 0) {
    throw new Error(`WeCom token error: ${data.errcode} ${data.errmsg}`);
  }

  wecomToken = data.access_token;
  // Expire 5 minutes early to avoid edge cases
  wecomTokenExpiry = Date.now() + (data.expires_in - 300) * 1000;

  return wecomToken;
}

// ---------------------------------------------------------------------------
// WeCom Smartsheet API
// ---------------------------------------------------------------------------

/**
 * Fetches the smartsheet schema (columns) from WeCom.
 *
 * @param token - WeCom access token.
 * @returns Array of column definitions.
 */
async function fetchSheetColumns(token: string): Promise<WeComColumn[]> {
  const url = `${config.wecom.apiBase}/cgi-bin/wedoc/smartsheet/get_sheet?access_token=${token}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      docid: config.wecom.docId,
      sheet_id: 'sheet1', // Default sheet ID
    }),
  });

  if (!response.ok) {
    throw new Error(`WeCom get_sheet failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    errcode: number;
    errmsg: string;
    sheet_info?: {
      columns?: Array<{ id: string; title: string; type: string }>;
    };
  };

  if (data.errcode !== 0) {
    throw new Error(`WeCom get_sheet error: ${data.errcode} ${data.errmsg}`);
  }

  return (data.sheet_info?.columns || []).map((c) => ({
    id: c.id,
    title: c.title,
    type: c.type,
  }));
}

/**
 * Fetches smartsheet records (rows) from WeCom.
 *
 * @param token - WeCom access token.
 * @param offset - Pagination offset.
 * @param limit - Number of records per page.
 * @returns Array of raw sheet records.
 */
async function fetchSheetRecords(
  token: string,
  offset = 0,
  limit = 200,
): Promise<{ records: WeComSheetRecord[]; hasMore: boolean; total: number }> {
  const url = `${config.wecom.apiBase}/cgi-bin/wedoc/smartsheet/get_records?access_token=${token}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      docid: config.wecom.docId,
      sheet_id: 'sheet1',
      offset,
      limit,
    }),
  });

  if (!response.ok) {
    throw new Error(`WeCom get_records failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    errcode: number;
    errmsg: string;
    records?: Array<{
      row_id: string;
      cells: Array<{ column_id: string; value: unknown }>;
    }>;
    total?: number;
    has_more?: boolean;
  };

  if (data.errcode !== 0) {
    throw new Error(`WeCom get_records error: ${data.errcode} ${data.errmsg}`);
  }

  const records: WeComSheetRecord[] = (data.records || []).map((r) => ({
    rowId: r.row_id,
    cells: (r.cells || []).map((c) => ({
      columnId: c.column_id,
      value: c.value == null ? null : String(c.value),
    })),
  }));

  return {
    records,
    hasMore: data.has_more ?? false,
    total: data.total ?? records.length,
  };
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Parses raw smartsheet records into WeComTimesheetRecord format.
 *
 * Expected smartsheet columns:
 * - 姓名 (employee name)
 * - 週次 (week identifier, e.g., "W22")
 * - 日期 (week date range, e.g., "5/26~5/30")
 * - One column per task category with numeric hours
 *
 * @param records - Raw records from the smartsheet API.
 * @param columns - Column definitions for name→id mapping.
 * @returns Parsed timesheet records.
 */
function parseRecords(
  records: WeComSheetRecord[],
  columns: WeComColumn[],
): WeComTimesheetRecord[] {
  // Build a title→id lookup
  const colById = new Map<string, string>();
  for (const col of columns) {
    colById.set(col.id, col.title);
  }

  const parsed: WeComTimesheetRecord[] = [];

  for (const record of records) {
    let employeeName = '';
    let week = '';
    let weekDates = '';
    const hoursByCategory: Record<string, number> = {};
    let totalHours = 0;

    for (const cell of record.cells) {
      const colTitle = colById.get(cell.columnId);
      if (!colTitle) continue;

      switch (colTitle) {
        case '姓名':
        case '人員':
        case 'employee':
          employeeName = String(cell.value || '').trim();
          break;
        case '週次':
        case 'week':
          week = String(cell.value || '').trim();
          break;
        case '日期':
        case 'date':
          weekDates = String(cell.value || '').trim();
          break;
        default: {
          // Check if this column is a known task category
          const category = TASK_CATEGORIES.find(
            (cat) => colTitle.includes(cat) || cat.includes(colTitle),
          );
          if (category) {
            const hours = Number(cell.value) || 0;
            hoursByCategory[category] = hours;
            totalHours += hours;
          }
          break;
        }
      }
    }

    // Skip empty rows
    if (!employeeName || !week) continue;

    parsed.push({
      employeeName,
      week,
      weekDates,
      hoursByCategory,
      totalHours,
    });
  }

  return parsed;
}

// ---------------------------------------------------------------------------
// Cache Fallback
// ---------------------------------------------------------------------------

/**
 * Reads timesheet data from the local JSON cache file.
 * Used when the WeCom API is unavailable (e.g., missing credentials, network issues).
 *
 * @param weekFilter - Optional week to filter by.
 * @returns Parsed timesheet records.
 */
async function readFromCache(weekFilter?: string): Promise<WeComTimesheetRecord[]> {
  const cachePath = resolve(process.cwd(), config.cacheFilePath);
  console.log(`[wecom-reader] Reading from cache file: ${cachePath}`);

  try {
    const raw = await readFile(cachePath, 'utf-8');
    const data = JSON.parse(raw) as {
      timesheet?: Record<string, Record<string, Record<string, number>>>;
    };

    if (!data.timesheet) {
      console.warn('[wecom-reader] Cache file has no timesheet data');
      return [];
    }

    const records: WeComTimesheetRecord[] = [];
    const weeks = weekFilter ? [weekFilter] : Object.keys(data.timesheet);

    for (const week of weeks) {
      const weekData = data.timesheet[week];
      if (!weekData) continue;

      for (const [employeeName, categories] of Object.entries(weekData)) {
        let totalHours = 0;
        const hoursByCategory: Record<string, number> = {};

        for (const [cat, hours] of Object.entries(categories)) {
          hoursByCategory[cat] = hours;
          totalHours += hours;
        }

        records.push({
          employeeName,
          week,
          weekDates: '',
          hoursByCategory,
          totalHours,
        });
      }
    }

    console.log(`[wecom-reader] Loaded ${records.length} records from cache`);
    return records;
  } catch (err) {
    console.error(`[wecom-reader] Cache read failed: ${(err as Error).message}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Reads timesheet records from WeCom smartsheet (or falls back to cache).
 *
 * @param weekFilter - Optional week identifier to filter by (e.g., "W22").
 * @returns Array of parsed WeCom timesheet records.
 */
export async function readWeComTimesheets(
  weekFilter?: string,
): Promise<WeComTimesheetRecord[]> {
  // Attempt WeCom API first
  if (hasWecomCredentials()) {
    try {
      console.log('[wecom-reader] Fetching from WeCom smartsheet API...');
      const token = await getWecomAccessToken();

      const [columns, recordsPage] = await Promise.all([
        fetchSheetColumns(token),
        fetchSheetRecords(token),
      ]);

      let allRecords = recordsPage.records;

      // Paginate if needed
      while (recordsPage.hasMore) {
        const next = await fetchSheetRecords(token, allRecords.length);
        allRecords = allRecords.concat(next.records);
      }

      console.log(`[wecom-reader] Fetched ${allRecords.length} raw records from WeCom`);

      const parsed = parseRecords(allRecords, columns);
      console.log(`[wecom-reader] Parsed ${parsed.length} valid timesheet records`);

      // Apply week filter
      if (weekFilter) {
        return parsed.filter((r) => r.week === weekFilter);
      }

      return parsed;
    } catch (err) {
      console.error(`[wecom-reader] WeCom API failed: ${(err as Error).message}`);
      console.log('[wecom-reader] Falling back to cache...');
    }
  } else {
    console.log('[wecom-reader] WeCom credentials not configured, using cache');
  }

  // Fallback to cache
  return readFromCache(weekFilter);
}
