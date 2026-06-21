/**
 * JOSUN PMO Timesheet Sync - YonSuite Authentication
 *
 * Implements HmacSHA256-based authentication for the YonSuite OpenAPI.
 * Handles token acquisition, caching, and automatic refresh.
 */

import { createHmac } from 'node:crypto';
import { config, hasYonSuiteCredentials } from '../config/env.js';
import type { YonSuiteAuthToken } from '../types/index.js';

/** In-memory token cache (per serverless invocation). */
let cachedToken: YonSuiteAuthToken | null = null;

/**
 * Generates an HmacSHA256 signature for YonSuite API authentication.
 *
 * @param appSecret - The application secret key.
 * @param timestamp - Current UTC timestamp string.
 * @param nonce - A unique nonce value.
 * @returns The hex-encoded HMAC signature.
 */
export function generateHmacSignature(
  appSecret: string,
  timestamp: string,
  nonce: string,
): string {
  const message = `${timestamp}${nonce}`;
  return createHmac('sha256', appSecret).update(message).digest('hex');
}

/**
 * Builds the standard YonSuite request headers with HMAC auth.
 *
 * @param accessToken - A valid access token (omit for auth requests).
 * @returns Headers object for the API request.
 */
export function buildAuthHeaders(accessToken?: string): Record<string, string> {
  const timestamp = new Date().toISOString();
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const signature = generateHmacSignature(config.yonsuite.appSecret, timestamp, nonce);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'appKey': config.yonsuite.appKey,
    'timestamp': timestamp,
    'nonce': nonce,
    'signature': signature,
    'tenantid': config.yonsuite.tenantId,
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  return headers;
}

/**
 * Acquires an access token from the YonSuite auth endpoint.
 *
 * @returns A fresh auth token with expiration metadata.
 * @throws If credentials are missing or the API call fails.
 */
export async function acquireToken(): Promise<YonSuiteAuthToken> {
  if (!hasYonSuiteCredentials()) {
    throw new Error(
      'YonSuite credentials not configured. Set YONSUITE_APP_KEY, YONSUITE_APP_SECRET, and YONSUITE_TENANT_ID.',
    );
  }

  const url = `https://${config.yonsuite.dataCenter}${config.yonsuite.authPath}`;
  const timestamp = new Date().toISOString();
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const signature = generateHmacSignature(config.yonsuite.appSecret, timestamp, nonce);

  const body = JSON.stringify({
    appKey: config.yonsuite.appKey,
    appSecret: config.yonsuite.appSecret,
    tenantId: config.yonsuite.tenantId,
    grant_type: 'client_credentials',
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'timestamp': timestamp,
      'nonce': nonce,
      'signature': signature,
    },
    body,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `YonSuite auth failed (${response.status}): ${errorBody}`,
    );
  }

  const data = await response.json() as Record<string, unknown>;

  const token: YonSuiteAuthToken = {
    access_token: data.access_token as string,
    expires_in: (data.expires_in as number) || config.yonsuite.tokenTTL,
    token_type: (data.token_type as string) || 'Bearer',
    expires_at: Date.now() + ((data.expires_in as number) || config.yonsuite.tokenTTL) * 1000,
  };

  return token;
}

/**
 * Returns a valid access token, using the cached token if still valid.
 * Refreshes automatically when the token is within 5 minutes of expiry.
 *
 * @returns A valid access token string.
 */
export async function getAccessToken(): Promise<string> {
  const REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

  if (cachedToken && cachedToken.expires_at - Date.now() > REFRESH_BUFFER_MS) {
    return cachedToken.access_token;
  }

  console.log('[auth] Acquiring new YonSuite access token...');
  cachedToken = await acquireToken();
  console.log(`[auth] Token acquired, expires in ${cachedToken.expires_in}s`);

  return cachedToken.access_token;
}

/**
 * Clears the cached token (useful after auth errors to force re-auth).
 */
export function clearTokenCache(): void {
  cachedToken = null;
}
