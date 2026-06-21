/**
 * JOSUN PMO Timesheet Sync - Centralized Environment Configuration
 *
 * All environment variables are read once and exposed through this module.
 * This avoids scattering process.env reads across the codebase.
 */

export const config = {
  /** YonSuite ERP API credentials and endpoint. */
  yonsuite: {
    appKey: process.env.YONSUITE_APP_KEY || '',
    appSecret: process.env.YONSUITE_APP_SECRET || '',
    tenantId: process.env.YONSUITE_TENANT_ID || '',
    dataCenter: process.env.YONSUITE_DATA_CENTER || 'c1.yonyoucloud.com',
    /** YonSuite batchSave entity path */
    entityPath: '/yonbip/pm/timesheet/batchSave',
    /** Auth token endpoint */
    authPath: '/yonbip/auth/token',
    /** Token TTL in seconds */
    tokenTTL: 7200,
  },

  /** WeCom (企业微信) smartsheet configuration. */
  wecom: {
    /** Smartsheet document ID */
    docId: process.env.WECOM_DOC_ID || '',
    /** WeCom corp ID */
    corpId: process.env.WECOM_CORP_ID || '',
    /** WeCom API secret for smartsheet access */
    apiSecret: process.env.WECOM_API_SECRET || '',
    /** WeCom API agent ID */
    agentId: process.env.WECOM_AGENT_ID || '',
    /** Base URL for the WeCom OpenAPI */
    apiBase: 'https://open.weixin.qq.com',
    /** Access token (if provided directly, e.g. via MCP bridge) */
    accessToken: process.env.WECOM_ACCESS_TOKEN || '',
  },

  /** Sync execution mode. */
  syncMode: (process.env.SYNC_MODE || 'dry-run') as 'dry-run' | 'live',

  /** Supabase storage (optional, for persisting sync state). */
  supabase: {
    url: process.env.SUPABASE_URL || '',
    key: process.env.SUPABASE_ANON_KEY || '',
  },

  /** Path to the cached JSON data file (fallback when API is unavailable). */
  cacheFilePath: process.env.CACHE_FILE_PATH || 'data/timesheet-cache.json',
} as const;

/**
 * Returns true if all required YonSuite credentials are configured.
 */
export function hasYonSuiteCredentials(): boolean {
  return !!(
    config.yonsuite.appKey &&
    config.yonsuite.appSecret &&
    config.yonsuite.tenantId
  );
}

/**
 * Returns true if all required WeCom credentials are configured.
 */
export function hasWecomCredentials(): boolean {
  return !!(
    config.wecom.docId &&
    (config.wecom.apiSecret || config.wecom.accessToken)
  );
}

/**
 * Returns a sanitized config summary safe for logging (secrets masked).
 */
export function getSafeConfigSummary(): Record<string, unknown> {
  return {
    yonsuite: {
      appKey: config.yonsuite.appKey ? '***configured***' : 'MISSING',
      appSecret: config.yonsuite.appSecret ? '***configured***' : 'MISSING',
      tenantId: config.yonsuite.tenantId ? '***configured***' : 'MISSING',
      dataCenter: config.yonsuite.dataCenter,
    },
    wecom: {
      docId: config.wecom.docId || 'MISSING',
      apiSecret: config.wecom.apiSecret ? '***configured***' : 'MISSING',
      accessToken: config.wecom.accessToken ? '***configured***' : 'MISSING',
    },
    syncMode: config.syncMode,
  };
}
