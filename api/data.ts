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

  try {
    const cachePath = resolve(
      process.cwd(),
      process.env.CACHE_FILE_PATH || 'data/timesheet-cache.json',
    );
    const raw = await readFile(cachePath, 'utf-8');
    const cache = JSON.parse(raw);

    // Return full dataset
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
  } catch (error) {
    console.error('[data] Error loading cache:', error);

    // Return empty dataset — dashboard will use embedded fallback
    res.status(200).json({
      success: false,
      source: 'fallback',
      error: error instanceof Error ? error.message : 'Cache unavailable',
      timesheet: {},
      heatmap: {},
      weeks: [],
      weekDates: {},
      lastUpdated: null,
      timestamp: new Date().toISOString(),
    });
  }
}
