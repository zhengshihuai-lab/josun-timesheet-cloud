import type { VercelRequest, VercelResponse } from '@vercel/node';
import { runSync } from '../src/sync/sync-orchestrator.js';
import { config, hasYonSuiteCredentials, getSafeConfigSummary } from '../src/config/env.js';
import { resolveEmployeeId, ALL_EMPLOYEES } from '../src/config/field-mapping.js';

/**
 * Vercel serverless function for on-demand sync operations.
 *
 * Accepts POST requests with parameters to control the sync:
 * - week: Target week identifier (e.g., "W22")
 * - dryRun: Boolean flag (default: true)
 * - employees: Array of employee names to filter
 * - startDate: Start date filter (YYYY-MM-DD)
 * - endDate: End date filter (YYYY-MM-DD)
 *
 * Returns detailed sync results including per-record outcomes.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed. Use POST.',
      usage: {
        method: 'POST',
        body: {
          week: 'string (optional, e.g., "W22")',
          dryRun: 'boolean (optional, default: true)',
          employees: 'string[] (optional, employee names)',
          startDate: 'string (optional, YYYY-MM-DD)',
          endDate: 'string (optional, YYYY-MM-DD)',
        },
      },
    });
  }

  const {
    week,
    dryRun = true,
    employees,
    startDate,
    endDate,
  } = (req.body || {}) as {
    week?: string;
    dryRun?: boolean;
    employees?: string[];
    startDate?: string;
    endDate?: string;
  };

  const mode = dryRun ? 'dry-run' : 'live';
  const startedAt = new Date();

  console.log(
    `[sync] Request received | mode=${mode} | week=${week || 'latest'} | ` +
    `employees=${employees?.join(',') || 'all'} | dateRange=${startDate || '?'}~${endDate || '?'} | ` +
    `timestamp=${startedAt.toISOString()}`,
  );

  // Validate credentials for live mode
  if (mode === 'live' && !hasYonSuiteCredentials()) {
    console.warn('[sync] Missing YonSuite credentials for live sync');
    return res.status(400).json({
      success: false,
      error: 'YonSuite credentials not configured. Set YONSUITE_APP_KEY, YONSUITE_APP_SECRET, and YONSUITE_TENANT_ID environment variables.',
      configured: {
        appKey: !!config.yonsuite.appKey,
        appSecret: !!config.yonsuite.appSecret,
        tenantId: !!config.yonsuite.tenantId,
      },
      config: getSafeConfigSummary(),
    });
  }

  try {
    // Build employee filter as IDs
    let employeeFilter: string[] | undefined;
    if (employees && employees.length > 0) {
      // Validate employee names
      const validEmployees = employees.filter((e) => ALL_EMPLOYEES.includes(e));
      const invalidEmployees = employees.filter((e) => !ALL_EMPLOYEES.includes(e));

      if (invalidEmployees.length > 0) {
        console.warn(`[sync] Unknown employees: ${invalidEmployees.join(', ')}`);
      }

      employeeFilter = validEmployees.map(resolveEmployeeId);
    }

    const result = await runSync({
      mode,
      week,
      employeeFilter,
      startDate,
      endDate,
    });

    const statusCode = result.success ? 200 : 500;

    res.status(statusCode).json({
      success: result.success,
      mode: result.mode,
      week: result.week,
      summary: result.summary,
      records: result.records,
      errors: result.errors.length > 0 ? result.errors : undefined,
      durationMs: result.durationMs,
      startedAt: result.startedAt,
      completedAt: result.completedAt,
      yonSuiteConfig: {
        dataCenter: config.yonsuite.dataCenter,
        entityPath: config.yonsuite.entityPath,
        authMethod: 'HmacSHA256',
        tokenTTL: `${config.yonsuite.tokenTTL}s`,
      },
    });
  } catch (error) {
    console.error('[sync] Unexpected error:', error);

    res.status(500).json({
      success: false,
      mode,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error && process.env.NODE_ENV !== 'production'
        ? error.stack
        : undefined,
      timestamp: new Date().toISOString(),
    });
  }
}
