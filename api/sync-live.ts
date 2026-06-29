import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { config } from '../src/config/env.js';

/**
 * POST /api/sync-live  — Receive timesheet data and upsert to Supabase.
 *   Body: { timesheet: {week: {emp: {cat: hours}}}, heatmap: {week: {emp: {day: hours}}} }
 *
 * GET /api/sync-live   — Seed from local cache JSON into Supabase (one-time bootstrap).
 *   Query: ?seed=true
 *
 * Called by QoderWork cron after reading from WeCom smartsheet.
 * Requires SUPABASE_SERVICE_ROLE_KEY env var for write access.
 */

interface TimesheetPayload {
  timesheet: Record<string, Record<string, Record<string, number>>>;
  heatmap: Record<string, Record<string, Record<string, number>>>;
  weeks?: string[];
  weekDates?: Record<string, string>;
  lastUpdated?: string;
}

async function upsertToSupabase(payload: TimesheetPayload) {
  const url = config.supabase.url;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!url || !key) {
    throw new Error('Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel env.');
  }

  const authHeaders = {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
  };

  let weeklyCount = 0;
  let dailyCount = 0;
  const errors: string[] = [];

  // Collect all weeks being synced (for targeted delete)
  const allWeeks = new Set<string>([
    ...Object.keys(payload.timesheet || {}),
    ...Object.keys(payload.heatmap || {}),
  ]);

  // --- Phase 1: Delete existing rows for synced weeks (prevents 23505 unique violations) ---
  if (allWeeks.size > 0) {
    const weekFilter = allWeeks.size === 1
      ? `week=eq.${[...allWeeks][0]}`
      : `week=in.(${[...allWeeks].join(',')})`;

    // Delete weekly
    const delWeekly = await fetch(`${url}/rest/v1/timesheet_weekly?${weekFilter}`, {
      method: 'DELETE',
      headers: { ...authHeaders, 'Prefer': 'return=minimal' },
    });
    if (!delWeekly.ok) {
      errors.push(`DELETE weekly: ${delWeekly.status} ${await delWeekly.text()}`);
    }

    // Delete daily
    const delDaily = await fetch(`${url}/rest/v1/timesheet_daily?${weekFilter}`, {
      method: 'DELETE',
      headers: { ...authHeaders, 'Prefer': 'return=minimal' },
    });
    if (!delDaily.ok) {
      errors.push(`DELETE daily: ${delDaily.status} ${await delDaily.text()}`);
    }
  }

  // --- Phase 2: Build + deduplicate rows, then INSERT fresh ---
  const BATCH = 500;

  // 1. Insert timesheet_weekly (deduplicated by week+employee+category)
  const weeklyMap = new Map<string, { week: string; employee: string; category: string; hours: number }>();
  for (const [week, weekData] of Object.entries(payload.timesheet || {})) {
    for (const [emp, catData] of Object.entries(weekData)) {
      for (const [cat, hours] of Object.entries(catData)) {
        if (typeof hours === 'number' && hours >= 0) {
          weeklyMap.set(`${week}|${emp}|${cat}`, { week, employee: emp, category: cat, hours });
        }
      }
    }
  }
  const weeklyRows = [...weeklyMap.values()];

  for (let i = 0; i < weeklyRows.length; i += BATCH) {
    const batch = weeklyRows.slice(i, i + BATCH);
    const resp = await fetch(`${url}/rest/v1/timesheet_weekly`, {
      method: 'POST',
      headers: { ...authHeaders, 'Prefer': 'return=minimal' },
      body: JSON.stringify(batch),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      errors.push(`Weekly batch ${i}: ${resp.status} ${errText}`);
    } else {
      weeklyCount += batch.length;
    }
  }

  // 2. Insert timesheet_daily (deduplicated by week+employee+day)
  const dailyMap = new Map<string, { week: string; employee: string; day: string; hours: number }>();
  for (const [week, weekData] of Object.entries(payload.heatmap || {})) {
    for (const [emp, dayData] of Object.entries(weekData)) {
      for (const [day, hours] of Object.entries(dayData)) {
        if (typeof hours === 'number' && hours >= 0) {
          dailyMap.set(`${week}|${emp}|${day}`, { week, employee: emp, day, hours });
        }
      }
    }
  }
  const dailyRows = [...dailyMap.values()];

  for (let i = 0; i < dailyRows.length; i += BATCH) {
    const batch = dailyRows.slice(i, i + BATCH);
    const resp = await fetch(`${url}/rest/v1/timesheet_daily`, {
      method: 'POST',
      headers: { ...authHeaders, 'Prefer': 'return=minimal' },
      body: JSON.stringify(batch),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      errors.push(`Daily batch ${i}: ${resp.status} ${errText}`);
    } else {
      dailyCount += batch.length;
    }
  }

  // 3. Update metadata (key is PK, so delete+insert works)
  const metaKeys = ['last_updated', 'weeks', 'week_dates'];
  const delMeta = await fetch(
    `${url}/rest/v1/timesheet_meta?key=in.(${metaKeys.join(',')})`,
    { method: 'DELETE', headers: { ...authHeaders, 'Prefer': 'return=minimal' } }
  );
  if (!delMeta.ok) {
    errors.push(`DELETE meta: ${delMeta.status} ${await delMeta.text()}`);
  }

  const metaRows = [
    { key: 'last_updated', value: { timestamp: payload.lastUpdated || new Date().toISOString() } },
    { key: 'weeks', value: { list: payload.weeks || Object.keys(payload.timesheet || {}) } },
    { key: 'week_dates', value: { map: payload.weekDates || {} } },
  ];

  const metaResp = await fetch(`${url}/rest/v1/timesheet_meta`, {
    method: 'POST',
    headers: { ...authHeaders, 'Prefer': 'return=minimal' },
    body: JSON.stringify(metaRows),
  });
  if (!metaResp.ok) {
    errors.push(`Meta: ${metaResp.status} ${await metaResp.text()}`);
  }

  return { weeklyCount, dailyCount, errors };
}

function loadCacheData(): TimesheetPayload | null {
  const candidates = [
    resolve(__dirname, '..', 'data', 'timesheet-cache.json'),
    resolve(process.cwd(), 'data', 'timesheet-cache.json'),
    process.env.CACHE_FILE_PATH ? resolve(process.cwd(), process.env.CACHE_FILE_PATH) : '',
  ].filter(Boolean);

  for (const p of candidates) {
    try {
      // Synchronous read for simplicity in seeding
      const raw = require('fs').readFileSync(p, 'utf-8');
      return JSON.parse(raw) as TimesheetPayload;
    } catch { /* try next */ }
  }
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const cronTrigger = req.headers['x-vercel-cron'];
  const startedAt = Date.now();

  try {
    // GET: seed from cache (bootstrap) or cron trigger
    if (req.method === 'GET') {
      const cache = loadCacheData();
      if (!cache) {
        return res.status(404).json({ success: false, error: 'Cache file not found for seeding' });
      }
      const result = await upsertToSupabase(cache);
      return res.status(result.errors.length === 0 ? 200 : 207).json({
        success: result.errors.length === 0,
        source: 'cache-seed',
        trigger: cronTrigger ? 'cron' : 'manual',
        weeklyRows: result.weeklyCount,
        dailyRows: result.dailyCount,
        errors: result.errors.length > 0 ? result.errors : undefined,
        durationMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      });
    }

    // POST: receive data from QoderWork cron
    if (req.method === 'POST') {
      const payload = req.body as TimesheetPayload;
      if (!payload?.timesheet || Object.keys(payload.timesheet).length === 0) {
        return res.status(400).json({ success: false, error: 'Missing or empty timesheet data' });
      }

      const result = await upsertToSupabase(payload);
      return res.status(result.errors.length === 0 ? 200 : 207).json({
        success: result.errors.length === 0,
        source: 'push',
        weeklyRows: result.weeklyCount,
        dailyRows: result.dailyCount,
        errors: result.errors.length > 0 ? result.errors : undefined,
        durationMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('[sync-live] Error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      durationMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    });
  }
}
