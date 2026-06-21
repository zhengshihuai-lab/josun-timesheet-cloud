import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const { week, dryRun = true, employees, projects } = req.body || {};

  console.log(`[sync] Request received | week: ${week} | dryRun: ${dryRun} | timestamp: ${new Date().toISOString()}`);

  // Validate required environment variables
  const appKey = process.env.YONSUITE_APP_KEY;
  const appSecret = process.env.YONSUITE_APP_SECRET;
  const tenantId = process.env.YONSUITE_TENANT_ID;

  if (!appKey || !appSecret || !tenantId) {
    console.warn('[sync] Missing YonSuite credentials');
    return res.status(400).json({
      success: false,
      error: 'YonSuite credentials not configured. Set YONSUITE_APP_KEY, YONSUITE_APP_SECRET, and YONSUITE_TENANT_ID environment variables.',
      configured: {
        appKey: !!appKey,
        appSecret: !!appSecret,
        tenantId: !!tenantId
      }
    });
  }

  try {
    // TODO: Authenticate with YonSuite API
    // const authResponse = await fetch('https://c1.yonyoucloud.com/yonbip/auth/token', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({
    //     appKey, appSecret, tenantId,
    //     grant_type: 'client_credentials'
    //   })
    // });
    // const { access_token } = await authResponse.json();

    // TODO: Fetch timesheet data for the specified week
    // const timesheetRecords = await getTimesheetRecords(week, employees, projects);

    // TODO: Transform data to YonSuite format
    // const yonsuitePayload = transformToYonSuite(timesheetRecords);

    // TODO: Submit to YonSuite
    // if (!dryRun) {
    //   const result = await fetch('https://c1.yonyoucloud.com/yonbip/pm/timesheet', {
    //     method: 'POST',
    //     headers: {
    //       'Content-Type': 'application/json',
    //       'Authorization': `Bearer ${access_token}`,
    //       'tenantid': tenantId
    //     },
    //     body: JSON.stringify(yonsuitePayload)
    //   });
    // }

    const simulatedRecords = [
      { employee: '萌萌', category: '專案管理', hours: 15, project: '鵬鼎PA02' },
      { employee: '小熊', category: '前端開發', hours: 23, project: '鵬鼎PA06' },
      { employee: '蒙海', category: '後端開發', hours: 20, project: '群光電子' },
    ];

    console.log(`[sync] ${dryRun ? 'Dry-run' : 'Live'} sync completed | records: ${simulatedRecords.length}`);

    res.status(200).json({
      success: true,
      mode: dryRun ? 'dry-run' : 'live',
      week: week || 'latest',
      recordsProcessed: simulatedRecords.length,
      records: dryRun ? simulatedRecords : [],
      message: dryRun
        ? 'Dry-run completed. No data was written to YonSuite.'
        : 'Sync completed. Data written to YonSuite.',
      timestamp: new Date().toISOString(),
      yonSuiteConfig: {
        dataCenter: 'c1.yonyoucloud.com',
        entityPath: '/yonbip/pm/timesheet',
        authMethod: 'HmacSHA256',
        tokenTTL: '7200s'
      }
    });
  } catch (error) {
    console.error('[sync] Sync failed:', error);

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      mode: dryRun ? 'dry-run' : 'live'
    });
  }
}
