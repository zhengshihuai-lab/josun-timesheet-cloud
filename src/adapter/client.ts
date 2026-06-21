/**
 * JOSUN PMO Timesheet Sync - YonSuite API Client
 *
 * High-level client for interacting with the YonSuite ERP OpenAPI.
 * Handles request signing, retry logic, and response parsing.
 */

import { config } from '../config/env.js';
import { buildAuthHeaders, getAccessToken, clearTokenCache } from './auth.js';
import type {
  YonSuiteTimesheetRecord,
  YonSuiteBatchSaveResponse,
} from '../types/index.js';

/** Maximum number of retry attempts for transient failures. */
const MAX_RETRIES = 3;

/** Base delay in milliseconds between retries (exponential backoff). */
const RETRY_BASE_DELAY_MS = 1000;

/**
 * Performs a generic authenticated request to the YonSuite API.
 * Includes retry logic for transient failures (429, 500+).
 *
 * @param path - API path (appended to the data center base URL).
 * @param method - HTTP method.
 * @param body - Request body (will be JSON-serialized).
 * @returns Parsed JSON response.
 */
async function yonSuiteRequest<T>(
  path: string,
  method: string,
  body?: unknown,
): Promise<T> {
  const url = `https://${config.yonsuite.dataCenter}${path}`;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const accessToken = await getAccessToken();
      const headers = buildAuthHeaders(accessToken);

      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      // Handle auth expiry — clear cache and retry once
      if (response.status === 401 && attempt < MAX_RETRIES) {
        console.warn('[client] 401 Unauthorized — clearing token cache and retrying');
        clearTokenCache();
        continue;
      }

      // Retry on rate limit or server errors
      if ((response.status === 429 || response.status >= 500) && attempt < MAX_RETRIES) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
        console.warn(
          `[client] Transient error ${response.status}, retrying in ${delay}ms (attempt ${attempt}/${MAX_RETRIES})`,
        );
        await sleep(delay);
        continue;
      }

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `YonSuite API error ${response.status} at ${path}: ${errorBody}`,
        );
      }

      return (await response.json()) as T;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Network errors are retryable
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
        console.warn(
          `[client] Request failed: ${lastError.message}, retrying in ${delay}ms (attempt ${attempt}/${MAX_RETRIES})`,
        );
        await sleep(delay);
      }
    }
  }

  throw lastError || new Error(`YonSuite request to ${path} failed after ${MAX_RETRIES} retries`);
}

/**
 * Saves a batch of timesheet records to YonSuite via the batchSave endpoint.
 *
 * @param records - Array of YonSuite-formatted timesheet records.
 * @returns The batchSave API response.
 */
export async function batchSaveTimesheets(
  records: YonSuiteTimesheetRecord[],
): Promise<YonSuiteBatchSaveResponse> {
  if (records.length === 0) {
    return {
      success: true,
      code: '0',
      message: 'No records to save',
      data: { successCount: 0, failCount: 0 },
    };
  }

  console.log(`[client] Batch saving ${records.length} records to YonSuite...`);

  const payload = {
    entityName: 'timesheet',
    data: records,
  };

  const response = await yonSuiteRequest<YonSuiteBatchSaveResponse>(
    config.yonsuite.entityPath,
    'POST',
    payload,
  );

  console.log(
    `[client] Batch save result: success=${response.success}, ` +
    `created=${response.data?.successCount ?? '?'}, ` +
    `failed=${response.data?.failCount ?? '?'}`,
  );

  return response;
}

/**
 * Queries existing timesheet records from YonSuite to check for duplicates.
 *
 * @param employeeId - Filter by employee ID.
 * @param startDate - Start of date range (YYYY-MM-DD).
 * @param endDate - End of date range (YYYY-MM-DD).
 * @returns Array of existing sync_ids.
 */
export async function queryExistingRecords(
  employeeId: string,
  startDate: string,
  endDate: string,
): Promise<string[]> {
  try {
    const response = await yonSuiteRequest<{
      data?: Array<{ sync_id: string }>;
    }>(
      `${config.yonsuite.entityPath.replace('/batchSave', '')}/query`,
      'POST',
      {
        entityName: 'timesheet',
        filters: {
          employee_id: employeeId,
          start_date_gte: startDate,
          end_date_lte: endDate,
        },
        fields: ['sync_id'],
      },
    );

    return (response.data || []).map((r) => r.sync_id);
  } catch (err) {
    // Query endpoint may not exist; treat as empty
    console.warn(`[client] Failed to query existing records: ${(err as Error).message}`);
    return [];
  }
}

/**
 * Validates that the YonSuite connection is working by requesting a token.
 *
 * @returns True if authentication succeeds.
 */
export async function validateConnection(): Promise<boolean> {
  try {
    await getAccessToken();
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
