import type { VercelRequest, VercelResponse } from '@vercel/node';
import { runSync } from '../src/sync/sync-orchestrator.js';
import { config, getSafeConfigSummary } from '../src/config/env.js';

/**
 * Vercel serverless function triggered by cron (weekly on Sunday 17:00 UTC+8).
 *
 * Runs the full sync pipeline:
 * - Reads data from WeCom smartsheet (or cache)
 * - Transforms to YonSuite format
 * - Writes to YonSuite ERP (or generates dry-run report)
 *
 * Sync mode is controlled by the SYNC_MODE environment variable.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cronTrigger = req.headers['x-vercel-cron'];
  const startedAt = new Date();

  console.log(`[refresh] Triggered at ${startedAt.toISOString()} | cron: ${cronTrigger || 'manual'}`);
  console.log(`[refresh] Sync mode: ${config.syncMode}`);
  console.log(`[refresh] Config:`, JSON.stringify(getSafeConfigSummary(), null, 2));

  try {
    const result = await runSync({
      mode: config.syncMode,
      week: (req.query.week as string) || undefined,
    });

    const statusCode = result.success ? 200 : 500;

    res.status(statusCode).json({
      success: result.success,
      trigger: cronTrigger ? 'cron' : 'manual',
      mode: result.mode,
      week: result.week,
      summary: result.summary,
      durationMs: result.durationMs,
      errors: result.errors.length > 0 ? result.errors : undefined,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[refresh] Unexpected error:', error);

    res.status(500).json({
      success: false,
      trigger: cronTrigger ? 'cron' : 'manual',
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error && process.env.NODE_ENV !== 'production'
        ? error.stack
        : undefined,
      timestamp: new Date().toISOString(),
    });
  }
}
