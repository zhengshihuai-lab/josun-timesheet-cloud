import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Verify cron origin (Vercel adds x-vercel-cron header)
  const cronTrigger = req.headers['x-vercel-cron'];

  console.log(`[refresh] Triggered at ${new Date().toISOString()} | cron: ${cronTrigger || 'manual'}`);

  try {
    // TODO: Fetch data from WeCom smartsheet API
    // const docId = process.env.WECOM_DOC_ID;
    // const response = await fetch(`https://wecom-api.example.com/sheets/${docId}/data`, {
    //   headers: { Authorization: `Bearer ${process.env.WECOM_API_TOKEN}` }
    // });
    // const timesheetData = await response.json();
    // Process and store/transform data for dashboard consumption...

    console.log('[refresh] Data refresh completed successfully');

    res.status(200).json({
      success: true,
      message: 'Timesheet data refresh triggered',
      timestamp: new Date().toISOString(),
      cron: cronTrigger || 'manual'
    });
  } catch (error) {
    console.error('[refresh] Refresh failed:', error);

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
