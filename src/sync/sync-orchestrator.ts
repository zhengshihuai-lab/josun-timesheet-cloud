/**
 * JOSUN PMO Timesheet Sync - Sync Orchestrator
 *
 * Main pipeline that ties together:
 * 1. WeCom data reading
 * 2. Change detection
 * 3. Data validation
 * 4. Transformation to YonSuite format
 * 5. Writing to YonSuite (or dry-run report)
 *
 * Includes retry logic, error handling, and detailed result reporting.
 */

import { readWeComTimesheets } from './wecom-reader.js';
import {
  transformBatch,
  filterByEmployees,
  filterByDateRange,
} from './data-transformer.js';
import {
  batchSaveTimesheets,
  queryExistingRecords,
  validateConnection,
} from '../adapter/client.js';
import { config, getSafeConfigSummary, hasYonSuiteCredentials } from '../config/env.js';
import { resolveEmployeeId } from '../config/field-mapping.js';
import type {
  SyncConfig,
  SyncResult,
  SyncRecordResult,
  ChangeRecord,
  WeComTimesheetRecord,
  YonSuiteTimesheetRecord,
} from '../types/index.js';

/** Maximum number of records per batchSave call. */
const BATCH_SIZE = 100;

/** Maximum retry attempts for failed batches. */
const BATCH_MAX_RETRIES = 2;

// ---------------------------------------------------------------------------
// Change Detection
// ---------------------------------------------------------------------------

/**
 * Detects which records are new vs. already existing in YonSuite.
 *
 * @param records - Transformed YonSuite records.
 * @returns Array of change records with type annotations.
 */
async function detectChanges(
  records: YonSuiteTimesheetRecord[],
): Promise<ChangeRecord[]> {
  if (records.length === 0) return [];

  // Collect unique employee IDs and date range
  const employeeIds = [...new Set(records.map((r) => r.employee_id))];
  const dates = records.map((r) => r.start_date).sort();
  const startDate = dates[0];
  const endDate = dates[dates.length - 1];

  // Query existing records for each employee
  const existingSyncIds = new Set<string>();

  for (const empId of employeeIds) {
    try {
      const existing = await queryExistingRecords(empId, startDate, endDate);
      for (const id of existing) {
        existingSyncIds.add(id);
      }
    } catch (err) {
      console.warn(
        `[orchestrator] Could not query existing records for ${empId}: ${(err as Error).message}`,
      );
    }
  }

  return records.map((r) => ({
    sync_id: r.sync_id,
    type: existingSyncIds.has(r.sync_id) ? 'unchanged' : 'new',
    employeeName: r.employee_name,
    category: r.activity_name,
    hours: r.hours,
    date: r.start_date,
  }));
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validates WeCom timesheet records before transformation.
 *
 * @param records - Raw WeCom records.
 * @returns Object with valid records and validation errors.
 */
function validateRecords(records: WeComTimesheetRecord[]): {
  valid: WeComTimesheetRecord[];
  errors: string[];
} {
  const errors: string[] = [];
  const valid: WeComTimesheetRecord[] = [];

  for (const record of records) {
    if (!record.employeeName) {
      errors.push(`Record ${record.week}: missing employee name`);
      continue;
    }

    if (!record.week) {
      errors.push(`Record for ${record.employeeName}: missing week identifier`);
      continue;
    }

    if (record.totalHours <= 0) {
      errors.push(`${record.employeeName} (${record.week}): zero total hours, skipping`);
      continue;
    }

    if (record.totalHours > 80) {
      errors.push(
        `${record.employeeName} (${record.week}): suspiciously high total hours (${record.totalHours}h), including anyway`,
      );
    }

    valid.push(record);
  }

  return { valid, errors };
}

// ---------------------------------------------------------------------------
// Batch Writing
// ---------------------------------------------------------------------------

/**
 * Writes records to YonSuite in batches with retry logic.
 *
 * @param records - Records to write.
 * @param mode - 'dry-run' or 'live'.
 * @returns Array of per-record results.
 */
async function writeBatches(
  records: YonSuiteTimesheetRecord[],
  mode: 'dry-run' | 'live',
): Promise<SyncRecordResult[]> {
  const results: SyncRecordResult[] = [];

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(records.length / BATCH_SIZE);

    console.log(
      `[orchestrator] Processing batch ${batchNum}/${totalBatches} (${batch.length} records)`,
    );

    if (mode === 'dry-run') {
      // In dry-run mode, simulate success for all records
      for (const record of batch) {
        results.push({
          sync_id: record.sync_id,
          status: 'created',
          employee: record.employee_name,
          project: record.project_name,
          date: record.start_date,
          hours: record.hours,
        });
      }
      continue;
    }

    // Live mode — call YonSuite API with retries
    let success = false;
    let lastError = '';

    for (let attempt = 1; attempt <= BATCH_MAX_RETRIES; attempt++) {
      try {
        const response = await batchSaveTimesheets(batch);

        if (response.success) {
          const failedIndices = new Set(
            (response.data?.errors || []).map((e) => e.index),
          );

          for (let j = 0; j < batch.length; j++) {
            const record = batch[j];
            if (failedIndices.has(j)) {
              const errorMsg = response.data?.errors?.find((e) => e.index === j)?.message || 'Unknown error';
              results.push({
                sync_id: record.sync_id,
                status: 'error',
                employee: record.employee_name,
                project: record.project_name,
                date: record.start_date,
                hours: record.hours,
                error: errorMsg,
              });
            } else {
              results.push({
                sync_id: record.sync_id,
                status: 'created',
                employee: record.employee_name,
                project: record.project_name,
                date: record.start_date,
                hours: record.hours,
              });
            }
          }

          success = true;
          break;
        } else {
          lastError = response.message;
          console.warn(
            `[orchestrator] Batch ${batchNum} failed: ${response.message} (attempt ${attempt}/${BATCH_MAX_RETRIES})`,
          );
        }
      } catch (err) {
        lastError = (err as Error).message;
        console.error(
          `[orchestrator] Batch ${batchNum} error: ${lastError} (attempt ${attempt}/${BATCH_MAX_RETRIES})`,
        );
      }
    }

    if (!success) {
      // Mark entire batch as failed
      for (const record of batch) {
        results.push({
          sync_id: record.sync_id,
          status: 'error',
          employee: record.employee_name,
          project: record.project_name,
          date: record.start_date,
          hours: record.hours,
          error: `Batch failed after ${BATCH_MAX_RETRIES} retries: ${lastError}`,
        });
      }
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Runs the full sync pipeline.
 *
 * Steps:
 * 1. Read timesheet data from WeCom (or cache)
 * 2. Validate records
 * 3. Transform to YonSuite format
 * 4. Filter by employee/date if configured
 * 5. Detect changes (new vs. existing)
 * 6. Write to YonSuite (or generate dry-run report)
 * 7. Return detailed results
 *
 * @param syncConfig - Sync configuration (mode, filters, etc.).
 * @returns Detailed sync result with per-record outcomes.
 */
export async function runSync(syncConfig: SyncConfig): Promise<SyncResult> {
  const startedAt = new Date();
  const errors: string[] = [];

  console.log('[orchestrator] ========================================');
  console.log(`[orchestrator] Starting sync | mode=${syncConfig.mode} | week=${syncConfig.week || 'latest'}`);
  console.log(`[orchestrator] Config:`, JSON.stringify(getSafeConfigSummary(), null, 2));
  console.log('[orchestrator] ========================================');

  // Step 0: Validate credentials for live mode
  if (syncConfig.mode === 'live' && !hasYonSuiteCredentials()) {
    const error = 'Cannot run live sync: YonSuite credentials not configured';
    console.error(`[orchestrator] ${error}`);
    return {
      success: false,
      mode: syncConfig.mode,
      week: syncConfig.week || 'unknown',
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
      summary: { totalRecords: 0, created: 0, skipped: 0, errors: 1 },
      records: [],
      errors: [error],
    };
  }

  // Step 0.5: Validate connection for live mode
  if (syncConfig.mode === 'live') {
    const connected = await validateConnection();
    if (!connected) {
      const error = 'Cannot connect to YonSuite API — authentication failed';
      console.error(`[orchestrator] ${error}`);
      return {
        success: false,
        mode: syncConfig.mode,
        week: syncConfig.week || 'unknown',
        startedAt: startedAt.toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt.getTime(),
        summary: { totalRecords: 0, created: 0, skipped: 0, errors: 1 },
        records: [],
        errors: [error],
      };
    }
    console.log('[orchestrator] YonSuite connection validated');
  }

  // Step 1: Read from WeCom
  console.log('[orchestrator] Step 1: Reading data from WeCom...');
  let wecomRecords: WeComTimesheetRecord[];
  try {
    wecomRecords = await readWeComTimesheets(syncConfig.week);
    console.log(`[orchestrator] Read ${wecomRecords.length} records from WeCom`);
  } catch (err) {
    const error = `Failed to read WeCom data: ${(err as Error).message}`;
    console.error(`[orchestrator] ${error}`);
    return {
      success: false,
      mode: syncConfig.mode,
      week: syncConfig.week || 'unknown',
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
      summary: { totalRecords: 0, created: 0, skipped: 0, errors: 1 },
      records: [],
      errors: [error],
    };
  }

  if (wecomRecords.length === 0) {
    console.warn('[orchestrator] No records found — nothing to sync');
    return {
      success: true,
      mode: syncConfig.mode,
      week: syncConfig.week || 'unknown',
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
      summary: { totalRecords: 0, created: 0, skipped: 0, errors: 0 },
      records: [],
      errors: [],
    };
  }

  // Step 2: Validate
  console.log('[orchestrator] Step 2: Validating records...');
  const validation = validateRecords(wecomRecords);
  errors.push(...validation.errors);
  console.log(
    `[orchestrator] Validation: ${validation.valid.length} valid, ${validation.errors.length} issues`,
  );

  // Step 3: Transform
  console.log('[orchestrator] Step 3: Transforming to YonSuite format...');
  let yonRecords = transformBatch(validation.valid);
  console.log(`[orchestrator] Generated ${yonRecords.length} YonSuite daily records`);

  // Step 4: Apply filters
  if (syncConfig.employeeFilter && syncConfig.employeeFilter.length > 0) {
    const empIds = syncConfig.employeeFilter.map(resolveEmployeeId);
    yonRecords = filterByEmployees(yonRecords, empIds);
    console.log(`[orchestrator] After employee filter: ${yonRecords.length} records`);
  }

  if (syncConfig.startDate && syncConfig.endDate) {
    yonRecords = filterByDateRange(yonRecords, syncConfig.startDate, syncConfig.endDate);
    console.log(`[orchestrator] After date filter: ${yonRecords.length} records`);
  }

  // Step 5: Change detection
  console.log('[orchestrator] Step 5: Detecting changes...');
  let changes: ChangeRecord[] = [];
  try {
    changes = await detectChanges(yonRecords);
    const newCount = changes.filter((c) => c.type === 'new').length;
    const unchangedCount = changes.filter((c) => c.type === 'unchanged').length;
    console.log(`[orchestrator] Changes: ${newCount} new, ${unchangedCount} unchanged`);
  } catch (err) {
    console.warn(`[orchestrator] Change detection failed: ${(err as Error).message}`);
    // Treat all as new if detection fails
    changes = yonRecords.map((r) => ({
      sync_id: r.sync_id,
      type: 'new',
      employeeName: r.employee_name,
      category: r.activity_name,
      hours: r.hours,
      date: r.start_date,
    }));
  }

  // Only process new records
  const newSyncIds = new Set(
    changes.filter((c) => c.type === 'new').map((c) => c.sync_id),
  );
  const recordsToWrite = yonRecords.filter((r) => newSyncIds.has(r.sync_id));
  const skippedCount = yonRecords.length - recordsToWrite.length;

  console.log(
    `[orchestrator] Records to write: ${recordsToWrite.length} (skipping ${skippedCount} unchanged)`,
  );

  // Step 6: Write
  console.log(`[orchestrator] Step 6: Writing records (${syncConfig.mode} mode)...`);
  const recordResults = await writeBatches(recordsToWrite, syncConfig.mode);

  // Step 7: Compile results
  const created = recordResults.filter((r) => r.status === 'created').length;
  const errored = recordResults.filter((r) => r.status === 'error').length;

  // Collect write errors
  for (const r of recordResults) {
    if (r.status === 'error' && r.error) {
      errors.push(`${r.employee} / ${r.project} / ${r.date}: ${r.error}`);
    }
  }

  const completedAt = new Date();
  const result: SyncResult = {
    success: errored === 0,
    mode: syncConfig.mode,
    week: syncConfig.week || 'latest',
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: completedAt.getTime() - startedAt.getTime(),
    summary: {
      totalRecords: yonRecords.length,
      created,
      skipped: skippedCount,
      errors: errored,
    },
    records: recordResults,
    errors,
  };

  console.log('[orchestrator] ========================================');
  console.log(
    `[orchestrator] Sync complete | mode=${result.mode} | ` +
    `created=${result.summary.created} | skipped=${result.summary.skipped} | ` +
    `errors=${result.summary.errors} | duration=${result.durationMs}ms`,
  );
  console.log('[orchestrator] ========================================');

  return result;
}
