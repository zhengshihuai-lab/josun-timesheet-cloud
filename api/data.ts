import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  TASK_CATEGORIES,
  ALL_EMPLOYEES,
  WEEK_DATE_MAP,
  WEEK_LABEL_MAP,
} from '../src/config/field-mapping.js';

// ---------------------------------------------------------------------------
// Embedded fallback data (used when cache file is unavailable)
// ---------------------------------------------------------------------------

const CATS = [...TASK_CATEGORIES];
const EMPLOYEES = [...ALL_EMPLOYEES];
const WEEKS = Object.keys(WEEK_DATE_MAP);

const WEEK_DATES: Record<string, string> = { ...WEEK_LABEL_MAP };

const TS: Record<string, Record<string, Record<string, number>>> = {
  W19: {
    萌萌: { 行政事務: 2, 內部溝通: 6, 專案管理: 16, 前端開發: 0, 後端開發: 0, 系統整合: 0, 圖控開發: 0, 設計規劃: 0, 客戶接洽: 5, 出差考察: 7, 突發狀況: 2 },
    小熊: { 行政事務: 2, 內部溝通: 4, 專案管理: 0, 前端開發: 24, 後端開發: 0, 系統整合: 0, 圖控開發: 0, 設計規劃: 3, 客戶接洽: 0, 出差考察: 0, 突發狀況: 7 },
    蒙海: { 行政事務: 0, 內部溝通: 4, 專案管理: 0, 前端開發: 0, 後端開發: 20, 系統整合: 12, 圖控開發: 0, 設計規劃: 0, 客戶接洽: 0, 出差考察: 0, 突發狀況: 6 },
    羅潔: { 行政事務: 0, 內部溝通: 4, 專案管理: 4, 前端開發: 0, 後端開發: 0, 系統整合: 18, 圖控開發: 0, 設計規劃: 0, 客戶接洽: 4, 出差考察: 6, 突發狀況: 4 },
    Marin: { 行政事務: 2, 內部溝通: 4, 專案管理: 0, 前端開發: 0, 後端開發: 0, 系統整合: 0, 圖控開發: 18, 設計規劃: 5, 客戶接洽: 0, 出差考察: 3, 突發狀況: 4 },
    廖嘉良: { 行政事務: 2, 內部溝通: 6, 專案管理: 10, 前端開發: 3, 後端開發: 4, 系統整合: 2, 圖控開發: 3, 設計規劃: 1, 客戶接洽: 4, 出差考察: 3, 突發狀況: 2 },
    天舒: { 行政事務: 2, 內部溝通: 4, 專案管理: 6, 前端開發: 4, 後端開發: 0, 系統整合: 0, 圖控開發: 0, 設計規劃: 0, 客戶接洽: 0, 出差考察: 0, 突發狀況: 0 },
    雪可: { 行政事務: 2, 內部溝通: 4, 專案管理: 8, 前端開發: 0, 後端開發: 0, 系統整合: 6, 圖控開發: 0, 設計規劃: 0, 客戶接洽: 4, 出差考察: 6, 突發狀況: 3 },
    馨蕊: { 行政事務: 2, 內部溝通: 6, 專案管理: 4, 前端開發: 0, 後端開發: 0, 系統整合: 0, 圖控開發: 0, 設計規劃: 8, 客戶接洽: 3, 出差考察: 0, 突發狀況: 0 },
    慧婷: { 行政事務: 2, 內部溝通: 6, 專案管理: 4, 前端開發: 0, 後端開發: 0, 系統整合: 0, 圖控開發: 0, 設計規劃: 6, 客戶接洽: 4, 出差考察: 0, 突發狀況: 0 },
    宇捷: { 行政事務: 2, 內部溝通: 4, 專案管理: 6, 前端開發: 0, 後端開發: 4, 系統整合: 4, 圖控開發: 0, 設計規劃: 0, 客戶接洽: 0, 出差考察: 0, 突發狀況: 0 },
    秉睿: { 行政事務: 2, 內部溝通: 4, 專案管理: 0, 前端開發: 0, 後端開發: 0, 系統整合: 8, 圖控開發: 0, 設計規劃: 0, 客戶接洽: 0, 出差考察: 0, 突發狀況: 2 },
  },
  W20: {
    萌萌: { 行政事務: 2, 內部溝通: 8, 專案管理: 18, 前端開發: 0, 後端開發: 0, 系統整合: 0, 圖控開發: 0, 設計規劃: 0, 客戶接洽: 6, 出差考察: 8, 突發狀況: 2 },
    小熊: { 行政事務: 2, 內部溝通: 4, 專案管理: 0, 前端開發: 22, 後端開發: 0, 系統整合: 0, 圖控開發: 0, 設計規劃: 2, 客戶接洽: 0, 出差考察: 0, 突發狀況: 12 },
    蒙海: { 行政事務: 0, 內部溝通: 4, 專案管理: 0, 前端開發: 0, 後端開發: 16, 系統整合: 13, 圖控開發: 0, 設計規劃: 0, 客戶接洽: 0, 出差考察: 0, 突發狀況: 7 },
    羅潔: { 行政事務: 0, 內部溝通: 4, 專案管理: 2, 前端開發: 0, 後端開發: 0, 系統整合: 18, 圖控開發: 0, 設計規劃: 0, 客戶接洽: 6, 出差考察: 4, 突發狀況: 4 },
    Marin: { 行政事務: 2, 內部溝通: 4, 專案管理: 0, 前端開發: 0, 後端開發: 0, 系統整合: 0, 圖控開發: 20, 設計規劃: 7, 客戶接洽: 0, 出差考察: 3, 突發狀況: 4 },
    廖嘉良: { 行政事務: 2, 內部溝通: 6, 專案管理: 8, 前端開發: 2, 後端開發: 3, 系統整合: 1, 圖控開發: 2, 設計規劃: 1, 客戶接洽: 6, 出差考察: 8, 突發狀況: 0 },
    天舒: { 行政事務: 2, 內部溝通: 6, 專案管理: 8, 前端開發: 2, 後端開發: 0, 系統整合: 0, 圖控開發: 0, 設計規劃: 0, 客戶接洽: 0, 出差考察: 0, 突發狀況: 0 },
    雪可: { 行政事務: 2, 內部溝通: 4, 專案管理: 10, 前端開發: 0, 後端開發: 0, 系統整合: 4, 圖控開發: 0, 設計規劃: 0, 客戶接洽: 6, 出差考察: 4, 突發狀況: 5 },
    馨蕊: { 行政事務: 2, 內部溝通: 6, 專案管理: 2, 前端開發: 0, 後端開發: 0, 系統整合: 0, 圖控開發: 0, 設計規劃: 10, 客戶接洽: 2, 出差考察: 0, 突發狀況: 0 },
    慧婷: { 行政事務: 2, 內部溝通: 6, 專案管理: 4, 前端開發: 0, 後端開發: 0, 系統整合: 0, 圖控開發: 0, 設計規劃: 8, 客戶接洽: 2, 出差考察: 0, 突發狀況: 0 },
    宇捷: { 行政事務: 2, 內部溝通: 4, 專案管理: 8, 前端開發: 0, 後端開發: 2, 系統整合: 2, 圖控開發: 0, 設計規劃: 0, 客戶接洽: 0, 出差考察: 0, 突發狀況: 0 },
    秉睿: { 行政事務: 2, 內部溝通: 4, 專案管理: 0, 前端開發: 0, 後端開發: 0, 系統整合: 10, 圖控開發: 0, 設計規劃: 0, 客戶接洽: 0, 出差考察: 0, 突發狀況: 2 },
  },
  W21: {
    萌萌: { 行政事務: 0, 內部溝通: 5, 專案管理: 22, 前端開發: 0, 後端開發: 0, 系統整合: 0, 圖控開發: 0, 設計規劃: 0, 客戶接洽: 3, 出差考察: 4, 突發狀況: 0 },
    小熊: { 行政事務: 1, 內部溝通: 6, 專案管理: 0, 前端開發: 22, 後端開發: 0, 系統整合: 0, 圖控開發: 0, 設計規劃: 0, 客戶接洽: 0, 出差考察: 0, 突發狀況: 13 },
    蒙海: { 行政事務: 0, 內部溝通: 2, 專案管理: 0, 前端開發: 0, 後端開發: 20, 系統整合: 15, 圖控開發: 0, 設計規劃: 0, 客戶接洽: 0, 出差考察: 0, 突發狀況: 5 },
    羅潔: { 行政事務: 0, 內部溝通: 6, 專案管理: 2, 前端開發: 0, 後端開發: 0, 系統整合: 25, 圖控開發: 0, 設計規劃: 0, 客戶接洽: 3, 出差考察: 0, 突發狀況: 0 },
    Marin: { 行政事務: 2, 內部溝通: 6, 專案管理: 0, 前端開發: 0, 後端開發: 0, 系統整合: 0, 圖控開發: 20, 設計規劃: 2, 客戶接洽: 0, 出差考察: 3, 突發狀況: 0 },
    廖嘉良: { 行政事務: 1, 內部溝通: 6, 專案管理: 6, 前端開發: 3, 後端開發: 4, 系統整合: 2, 圖控開發: 3, 設計規劃: 1, 客戶接洽: 5, 出差考察: 7, 突發狀況: 4 },
    天舒: { 行政事務: 1, 內部溝通: 4, 專案管理: 4, 前端開發: 2, 後端開發: 0, 系統整合: 0, 圖控開發: 0, 設計規劃: 0, 客戶接洽: 0, 出差考察: 0, 突發狀況: 0 },
    雪可: { 行政事務: 1, 內部溝通: 4, 專案管理: 6, 前端開發: 0, 後端開發: 0, 系統整合: 4, 圖控開發: 0, 設計規劃: 0, 客戶接洽: 4, 出差考察: 2, 突發狀況: 3 },
    馨蕊: { 行政事務: 1, 內部溝通: 5, 專案管理: 4, 前端開發: 0, 後端開發: 0, 系統整合: 0, 圖控開發: 0, 設計規劃: 8, 客戶接洽: 4, 出差考察: 0, 突發狀況: 0 },
    慧婷: { 行政事務: 1, 內部溝通: 5, 專案管理: 4, 前端開發: 0, 後端開發: 0, 系統整合: 0, 圖控開發: 0, 設計規劃: 6, 客戶接洽: 4, 出差考察: 0, 突發狀況: 0 },
    宇捷: { 行政事務: 1, 內部溝通: 4, 專案管理: 6, 前端開發: 0, 後端開發: 4, 系統整合: 4, 圖控開發: 0, 設計規劃: 0, 客戶接洽: 0, 出差考察: 0, 突發狀況: 0 },
    秉睿: { 行政事務: 1, 內部溝通: 4, 專案管理: 0, 前端開發: 0, 後端開發: 0, 系統整合: 8, 圖控開發: 0, 設計規劃: 0, 客戶接洽: 0, 出差考察: 0, 突發狀況: 3 },
  },
  W22: {
    萌萌: { 行政事務: 2, 內部溝通: 8, 專案管理: 15, 前端開發: 0, 後端開發: 0, 系統整合: 0, 圖控開發: 0, 設計規劃: 0, 客戶接洽: 5, 出差考察: 6, 突發狀況: 4 },
    小熊: { 行政事務: 2, 內部溝通: 4, 專案管理: 0, 前端開發: 23, 後端開發: 0, 系統整合: 0, 圖控開發: 0, 設計規劃: 6, 客戶接洽: 0, 出差考察: 0, 突發狀況: 5 },
    蒙海: { 行政事務: 0, 內部溝通: 2, 專案管理: 0, 前端開發: 0, 後端開發: 20, 系統整合: 11, 圖控開發: 0, 設計規劃: 0, 客戶接洽: 0, 出差考察: 0, 突發狀況: 11 },
    羅潔: { 行政事務: 0, 內部溝通: 4, 專案管理: 3, 前端開發: 0, 後端開發: 0, 系統整合: 18, 圖控開發: 0, 設計規劃: 0, 客戶接洽: 4, 出差考察: 3, 突發狀況: 10 },
    Marin: { 行政事務: 2, 內部溝通: 4, 專案管理: 0, 前端開發: 0, 後端開發: 0, 系統整合: 0, 圖控開發: 18, 設計規劃: 6, 客戶接洽: 0, 出差考察: 3, 突發狀況: 5 },
    廖嘉良: { 行政事務: 3, 內部溝通: 6, 專案管理: 9, 前端開發: 3, 後端開發: 3, 系統整合: 2, 圖控開發: 2, 設計規劃: 2, 客戶接洽: 4, 出差考察: 2, 突發狀況: 2 },
    天舒: { 行政事務: 2, 內部溝通: 4, 專案管理: 4, 前端開發: 4, 後端開發: 0, 系統整合: 0, 圖控開發: 0, 設計規劃: 0, 客戶接洽: 0, 出差考察: 0, 突發狀況: 0 },
    雪可: { 行政事務: 2, 內部溝通: 6, 專案管理: 8, 前端開發: 0, 後端開發: 0, 系統整合: 6, 圖控開發: 0, 設計規劃: 0, 客戶接洽: 4, 出差考察: 2, 突發狀況: 2 },
    馨蕊: { 行政事務: 2, 內部溝通: 6, 專案管理: 4, 前端開發: 0, 後端開發: 0, 系統整合: 0, 圖控開發: 0, 設計規劃: 8, 客戶接洽: 2, 出差考察: 0, 突發狀況: 0 },
    慧婷: { 行政事務: 2, 內部溝通: 6, 專案管理: 4, 前端開發: 0, 後端開發: 0, 系統整合: 0, 圖控開發: 0, 設計規劃: 6, 客戶接洽: 2, 出差考察: 0, 突發狀況: 0 },
    宇捷: { 行政事務: 2, 內部溝通: 4, 專案管理: 6, 前端開發: 0, 後端開發: 4, 系統整合: 4, 圖控開發: 0, 設計規劃: 0, 客戶接洽: 0, 出差考察: 0, 突發狀況: 0 },
    秉睿: { 行政事務: 2, 內部溝通: 4, 專案管理: 0, 前端開發: 0, 後端開發: 0, 系統整合: 8, 圖控開發: 0, 設計規劃: 0, 客戶接洽: 0, 出差考察: 0, 突發狀況: 2 },
  },
};

const BURN_DATA = [
  { name: '鵬鼎PA02', client: 'FMCS系統整合', actual: 120, est: 160 },
  { name: '鵬鼎PA06', client: '空調自控工程', actual: 85, est: 100 },
  { name: '耀登科技', client: '門禁系統整合', actual: 45, est: 60 },
  { name: '群光電子', client: 'BMS系統升級', actual: 68, est: 80 },
  { name: '川奇電子', client: '產線監控系統', actual: 32, est: 50 },
  { name: '联茂一期', client: '廠務監控新建', actual: 55, est: 70 },
  { name: '普英高分子', client: '環境監控系統', actual: 28, est: 40 },
];

const RISKS = [
  { level: 'high', title: '單點故障風險 — 蒙海', desc: '蒙海在鵬鼎系列專案中同時負責「後端開發」與「系統整合」兩項核心工作，且佔該專案後端工時超過 85%。', tag: 'SPOF' },
  { level: 'high', title: '單點故障風險 — 羅潔', desc: '羅潔在多個專案中包辦「系統整合」與「專案管理」，存在知識孤島風險。', tag: 'SPOF' },
  { level: 'medium', title: '工作碎片化 — 廖嘉良 (W21)', desc: '廖嘉良於 W21 填寫了 11 個不同的任務大類，工時高度碎片化，影響深度產出。', tag: '碎片化' },
  { level: 'medium', title: '突發狀況比例偏高 — 蒙海 (W22)', desc: '蒙海 W22「突發狀況」達 11 小時 (25%)，遠超 10% 警戒線，需關注根因。', tag: '突發' },
  { level: 'low', title: '工時不足 — 天舒', desc: '天舒近兩週工時偏低 (16hr)，建議確認是否有休假或任務分配不足。', tag: '工時' },
];

// ---------------------------------------------------------------------------
// Data Loading
// ---------------------------------------------------------------------------

/**
 * Attempts to load timesheet data from the cache file.
 * Falls back to embedded data if the file is unavailable.
 */
async function loadData(): Promise<{
  timesheet: Record<string, Record<string, Record<string, number>>>;
  source: 'cache' | 'embedded';
  lastUpdated: string;
}> {
  // Try cache file first
  try {
    const cachePath = resolve(
      process.cwd(),
      process.env.CACHE_FILE_PATH || 'data/timesheet-cache.json',
    );
    const raw = await readFile(cachePath, 'utf-8');
    const data = JSON.parse(raw);

    if (data.timesheet && typeof data.timesheet === 'object') {
      return {
        timesheet: data.timesheet,
        source: 'cache',
        lastUpdated: data.lastUpdated || new Date().toISOString(),
      };
    }
  } catch {
    // Cache unavailable — use embedded data
  }

  return {
    timesheet: TS,
    source: 'embedded',
    lastUpdated: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Vercel serverless function that serves timesheet data for the frontend dashboard.
 *
 * Query parameters:
 * - week: Filter to a specific week (e.g., "W22")
 * - employee: Filter to a specific employee name
 * - department: Filter by department (reserved for future use)
 *
 * Returns JSON data for the dashboard to render.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const week = (req.query.week as string) || undefined;
  const employee = (req.query.employee as string) || undefined;
  const department = (req.query.department as string) || undefined;

  try {
    const { timesheet, source, lastUpdated } = await loadData();

    // Determine available weeks from data
    const availableWeeks = Object.keys(timesheet).sort();
    const weekDates: Record<string, string> = {};
    for (const w of availableWeeks) {
      weekDates[w] = WEEK_DATES[w] || w;
    }

    // If a specific week is requested, return only that week's data
    if (week && timesheet[week]) {
      let weekData = timesheet[week];

      // Apply employee filter
      if (employee) {
        const filteredData: Record<string, Record<string, number>> = {};
        if (weekData[employee]) {
          filteredData[employee] = weekData[employee];
        }
        weekData = filteredData;
      }

      return res.status(200).json({
        week,
        weekDates: weekDates[week],
        employees: Object.keys(weekData),
        categories: CATS,
        timesheet: weekData,
        source,
        lastUpdated,
        timestamp: new Date().toISOString(),
      });
    }

    // Filter all weeks by employee if requested
    let filteredTimesheet = timesheet;
    if (employee) {
      filteredTimesheet = {};
      for (const [w, weekData] of Object.entries(timesheet)) {
        if (weekData[employee]) {
          filteredTimesheet[w] = { [employee]: weekData[employee] };
        }
      }
    }

    // Return all data
    res.status(200).json({
      weeks: availableWeeks,
      weekDates,
      employees: employee ? [employee] : EMPLOYEES,
      categories: CATS,
      timesheet: filteredTimesheet,
      burnData: BURN_DATA,
      risks: RISKS,
      source,
      lastUpdated,
      filters: {
        week: week || null,
        employee: employee || null,
        department: department || null,
      },
    });
  } catch (error) {
    console.error('[data] Error loading data:', error);

    res.status(500).json({
      error: 'Failed to load timesheet data',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
}
