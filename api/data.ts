import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/**
 * Vercel serverless function that serves timesheet data.
 *
 * Priority:
 *   1. data/timesheet-cache.json (updated by QoderWork sync cron)
 *   2. Returns empty dataset if cache unavailable
 *
 * The dashboard fetches from this endpoint on load and merges
 * with its embedded fallback data.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Allow CORS for local dev
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  // Try multiple path strategies for finding the cache file
  const candidates = [
    // Strategy 1: relative to this file (api/ → ../data/)
    resolve(__dirname, '..', 'data', 'timesheet-cache.json'),
    // Strategy 2: process.cwd() (Vercel project root)
    resolve(process.cwd(), 'data', 'timesheet-cache.json'),
    // Strategy 3: env variable override
    process.env.CACHE_FILE_PATH ? resolve(process.cwd(), process.env.CACHE_FILE_PATH) : '',
  ].filter(Boolean);

  let cache: any = null;

  for (const p of candidates) {
    try {
      const raw = await readFile(p, 'utf-8');
      cache = JSON.parse(raw);
      break;
    } catch {
      // Try next candidate
    }
  }

  if (cache && cache.timesheet) {
    res.status(200).json({
      success: true,
      source: 'cache',
      lastUpdated: cache.lastUpdated || new Date().toISOString(),
      weeks: cache.weeks || [],
      weekDates: cache.weekDates || {},
      timesheet: cache.timesheet || {},
      heatmap: cache.heatmap || {},
      timestamp: new Date().toISOString(),
    });
  } else {
    console.error('[data] Cache file not found. Tried:', candidates);
    res.status(200).json({
      success: false,
      source: 'fallback',
      error: 'Cache file not found',
      timesheet: {},
      heatmap: {},
      weeks: [],
      weekDates: {},
      lastUpdated: null,
      timestamp: new Date().toISOString(),
    });
  }
}
