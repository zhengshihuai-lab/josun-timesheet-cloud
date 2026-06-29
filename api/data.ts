import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { config } from '../src/config/env.js';

/**
 * Vercel serverless function that serves timesheet data.
 *
 * Priority:
 *   1. Supabase tables (real-time data, updated by sync-live endpoint)
 *   2. data/timesheet-cache.json (fallback, updated by QoderWork sync cron)
 *   3. Returns empty dataset if neither available
 *
 * The dashboard fetches from this endpoint on load and merges
 * with its embedded fallback data. Also returns Supabase config
 * for the frontend to subscribe to real-time updates.
 */

interface SupabaseTimesheet {
  timesheet: Record<string, Record<string, Record<string, number>>>;
  heatmap: Record<string, Record<string, Record<string, number>>>;
  weeks: string[];
  weekDates: Record<string, string>;
  lastUpdated: string | null;
}

async function fetchAllRows<T>(url: string, headers: Record<string, string>): Promise<T[]> {
  const allRows: T[] = [];
  let offset = 0;
  const batchSize = 1000;
  while (true) {
    const resp = await fetch(url, {
      headers: { ...headers, 'Range': `${offset}-${offset + batchSize - 1}` },
    });
    if (!resp.ok) break;
    const rows = await resp.json() as T[];
    allRows.push(...rows);
    if (rows.length < batchSize) break;
    offset += batchSize;
  }
  return allRows;
}

async function readFromSupabase(): Promise<SupabaseTimesheet | null> {
  const url = config.supabase.url;
  const key = config.supabase.key;
  if (!url || !key) return null;

  const headers = {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
  };

  try {
    // Fetch all weekly records (paginated to bypass 1000-row limit)
    const weeklyRows = await fetchAllRows<{ week: string; employee: string; category: string; hours: number }>(
      `${url}/rest/v1/timesheet_weekly?select=week,employee,category,hours&order=week,employee`,
      headers
    );

    // Fetch all daily records (paginated)
    const dailyRows = await fetchAllRows<{ week: string; employee: string; day: string; hours: number }>(
      `${url}/rest/v1/timesheet_daily?select=week,employee,day,hours&order=week,employee`,
      headers
    );

    // Fetch metadata
    const metaResp = await fetch(
      `${url}/rest/v1/timesheet_meta?select=key,value`,
      { headers }
    );
    const metaRows = metaResp.ok ? await metaResp.json() as Array<{ key: string; value: any }> : [];
    const meta: Record<string, any> = {};
    metaRows.forEach(r => { meta[r.key] = r.value; });

    if (weeklyRows.length === 0 && dailyRows.length === 0) return null;

    // Reconstruct timesheet object
    const timesheet: Record<string, Record<string, Record<string, number>>> = {};
    for (const row of weeklyRows) {
      if (!timesheet[row.week]) timesheet[row.week] = {};
      if (!timesheet[row.week][row.employee]) timesheet[row.week][row.employee] = {};
      timesheet[row.week][row.employee][row.category] = row.hours;
    }

    // Reconstruct heatmap object
    const heatmap: Record<string, Record<string, Record<string, number>>> = {};
    for (const row of dailyRows) {
      if (!heatmap[row.week]) heatmap[row.week] = {};
      if (!heatmap[row.week][row.employee]) heatmap[row.week][row.employee] = {};
      heatmap[row.week][row.employee][row.day] = row.hours;
    }

    return {
      timesheet,
      heatmap,
      weeks: meta.weeks?.list || Object.keys(timesheet).sort(),
      weekDates: meta.week_dates?.map || {},
      lastUpdated: meta.last_updated?.timestamp || null,
    };
  } catch (e) {
    console.error('[data] Supabase read error:', e);
    return null;
  }
}

function readCacheFile(): any {
  const candidates = [
    resolve(__dirname, '..', 'data', 'timesheet-cache.json'),
    resolve(process.cwd(), 'data', 'timesheet-cache.json'),
    process.env.CACHE_FILE_PATH ? resolve(process.cwd(), process.env.CACHE_FILE_PATH) : '',
  ].filter(Boolean);

  for (const p of candidates) {
    try {
      const raw = require('fs').readFileSync(p, 'utf-8');
      return JSON.parse(raw);
    } catch { /* try next */ }
  }
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  // 1. Try Supabase first (real-time data)
  const sbData = await readFromSupabase();
  if (sbData && Object.keys(sbData.timesheet).length > 0) {
    return res.status(200).json({
      success: true,
      source: 'supabase',
      lastUpdated: sbData.lastUpdated || new Date().toISOString(),
      weeks: sbData.weeks,
      weekDates: sbData.weekDates,
      timesheet: sbData.timesheet,
      heatmap: sbData.heatmap,
      supabase: config.supabase.url ? { url: config.supabase.url, key: config.supabase.key } : null,
      timestamp: new Date().toISOString(),
    });
  }

  // 2. Fallback to cache file
  const cache = readCacheFile();
  if (cache && cache.timesheet) {
    return res.status(200).json({
      success: true,
      source: 'cache',
      lastUpdated: cache.lastUpdated || new Date().toISOString(),
      weeks: cache.weeks || [],
      weekDates: cache.weekDates || {},
      timesheet: cache.timesheet || {},
      heatmap: cache.heatmap || {},
      supabase: config.supabase.url ? { url: config.supabase.url, key: config.supabase.key } : null,
      timestamp: new Date().toISOString(),
    });
  }

  // 3. No data available
  console.error('[data] No data source available');
  return res.status(200).json({
    success: false,
    source: 'fallback',
    error: 'No data source available',
    timesheet: {},
    heatmap: {},
    weeks: [],
    weekDates: {},
    supabase: config.supabase.url ? { url: config.supabase.url, key: config.supabase.key } : null,
    lastUpdated: null,
    timestamp: new Date().toISOString(),
  });
}
