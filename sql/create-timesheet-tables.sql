-- ============================================
-- JOSUN 工時智慧分析平台 — Supabase 資料表遷移
-- 在 Supabase Dashboard → SQL Editor 中執行
-- ============================================

-- 1. 每週工時明細（員工 × 任務分類 × 週次）
CREATE TABLE IF NOT EXISTS public.timesheet_weekly (
  id BIGSERIAL PRIMARY KEY,
  week TEXT NOT NULL,
  employee TEXT NOT NULL,
  category TEXT NOT NULL,
  hours NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(week, employee, category)
);

-- 2. 每日工時（員工 × 星期 × 週次）
CREATE TABLE IF NOT EXISTS public.timesheet_daily (
  id BIGSERIAL PRIMARY KEY,
  week TEXT NOT NULL,
  employee TEXT NOT NULL,
  day TEXT NOT NULL,
  hours NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(week, employee, day)
);

-- 3. 同步元數據
CREATE TABLE IF NOT EXISTS public.timesheet_meta (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. 索引（加速查詢）
CREATE INDEX IF NOT EXISTS idx_tw_week ON public.timesheet_weekly(week);
CREATE INDEX IF NOT EXISTS idx_tw_employee ON public.timesheet_weekly(employee);
CREATE INDEX IF NOT EXISTS idx_td_week ON public.timesheet_daily(week);
CREATE INDEX IF NOT EXISTS idx_td_employee ON public.timesheet_daily(employee);

-- 5. RLS 策略（公開讀取，僅服務端寫入）
ALTER TABLE public.timesheet_weekly ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timesheet_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timesheet_meta ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access" ON public.timesheet_weekly FOR SELECT USING (true);
CREATE POLICY "Public read access" ON public.timesheet_daily FOR SELECT USING (true);
CREATE POLICY "Public read access" ON public.timesheet_meta FOR SELECT USING (true);

-- 6. 啟用 Realtime（前端即時訂閱）
ALTER PUBLICATION supabase_realtime ADD TABLE public.timesheet_weekly;
ALTER PUBLICATION supabase_realtime ADD TABLE public.timesheet_daily;
ALTER PUBLICATION supabase_realtime ADD TABLE public.timesheet_meta;

-- 7. 自動更新 updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_tw_updated_at BEFORE UPDATE ON public.timesheet_weekly
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_td_updated_at BEFORE UPDATE ON public.timesheet_daily
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tm_updated_at BEFORE UPDATE ON public.timesheet_meta
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
