# YonSuite 自建應用 API 存取設定指南

> 本指南說明如何在 YonSuite 管理平台建立自建應用（Self-Built Application），取得 API 存取憑證，並完成 PMO 工時同步系統的整合設定。

---

## 目錄

1. [建立自建應用](#1-建立自建應用)
2. [取得租戶資訊](#2-取得租戶資訊)
3. [設定 API 權限](#3-設定-api-權限)
4. [設定事件訂閱（可選）](#4-設定事件訂閱可選)
5. [環境變數設定](#5-環境變數設定)
6. [員工映射設定](#6-員工映射設定)
7. [驗證步驟](#7-驗證步驟)
8. [已知 YonSuite API 資訊](#8-已知-yonsuite-api-資訊)

---

## 1. 建立自建應用

### 1.1 進入管理後台

1. 使用**系統管理員帳號**登入 YonSuite 管理平台
2. 依序點選導航欄：**系統管理** → **應用管理** → **自建應用**

<!-- TODO: 截圖 — 自建應用入口頁面 -->

### 1.2 建立新應用

1. 點選頁面上方的 **「新增」** 或 **「建立自建應用」** 按鈕
2. 填寫以下基本資訊：

| 欄位 | 值 | 說明 |
|------|-----|------|
| **應用名稱** | `PMO工時同步` | 用於識別此整合用途 |
| **應用編碼** | `pmo-timesheet-sync` | 系統唯一識別碼（視需求自訂） |
| **應用描述** | `企業微信工時數據同步至 YonSuite 專案工時模組` | 簡述用途 |
| **應用圖標** | （可選）上傳一個識別圖標 | — |
| **負責人** | 選擇系統管理員 | — |

3. 確認填寫無誤後，點選 **「確定」** 或 **「儲存」**

<!-- TODO: 截圖 — 建立自建應用表單 -->

### 1.3 記錄應用憑證

建立完成後，系統會自動產生一組 **AppKey** 與 **AppSecret**。

> **重要：** 請立即複製並安全儲存 AppSecret，部分版本僅在建立時顯示一次。

| 憑證 | 說明 | 範例值 |
|------|------|--------|
| **AppKey** | 應用公開識別碼 | `a1b2c3d4e5f6...` |
| **AppSecret** | 應用私密金鑰（用於簽章） | `x9y8z7w6v5u4...` |

將此二值記錄於安全的位置，後續將設定為環境變數。

<!-- TODO: 截圖 — AppKey / AppSecret 顯示頁面 -->

---

## 2. 取得租戶資訊

### 2.1 查詢企業資訊

1. 登入 YonSuite 管理平台
2. 依序點選：**數位化建模** → **我的企業** → **企業資訊**

<!-- TODO: 截圖 — 企業資訊頁面路徑 -->

### 2.2 記錄關鍵資訊

從企業資訊頁面取得以下兩項資料：

| 欄位 | 說明 | 範例值 |
|------|------|--------|
| **企業帳號 ID（TenantId）** | 租戶唯一識別碼 | `1234567890` |
| **數據中心域名（Data Center Domain）** | API 請求的基礎域名 | `c1.yonyoucloud.com` |

> **注意：** 數據中心域名因企業部署環境而異，常見格式包括：
> - `c1.yonyoucloud.com`
> - `c2.yonyoucloud.com`
> - `c{n}.yonyoucloud.com`
>
> 請以實際頁面顯示的值為準。

<!-- TODO: 截圖 — 企業資訊頁面，標示 TenantId 與數據中心域名 -->

---

## 3. 設定 API 權限

自建應用建立後，需為其指派必要的 API 存取權限，方可讀寫對應的業務數據。

### 3.1 進入權限設定

1. 回到 **系統管理** → **應用管理** → **自建應用**
2. 找到剛建立的 **「PMO工時同步」** 應用，點選進入詳情或權限設定
3. 進入 **「API 權限」** 或 **「接口授權」** 頁籤

<!-- TODO: 截圖 — API 權限設定頁面 -->

### 3.2 指派所需權限

依下表逐一搜尋並啟用對應的 API 權限：

| 權限模組 | 權限範圍 | 讀取 | 寫入 | 用途說明 |
|----------|----------|:----:|:----:|----------|
| **項目管理**（Project Management） | 專案資料 | ✅ | ✅ | 讀取專案清單、寫入工時記錄 |
| **人力資源**（HR） | 員工主檔 | ✅ | — | 查詢員工 ID 以完成名稱映射 |
| **項目工時**（Project Timesheet） | 工時單據 | ✅ | ✅ | 讀取/寫入專案工時明細 |

### 3.3 權限申請注意事項

- 部分權限可能需要**管理員審批**後才會生效
- 若找不到對應權限項目，請確認當前租戶已開通相應的功能模組
- 權限變更後建議等待 **5 分鐘**再進行 API 測試，確保快取更新

<!-- TODO: 截圖 — 已勾選的權限列表 -->

---

## 4. 設定事件訂閱（可選）

若需在工時數據發生變更時即時收到通知（而非定時輪詢），可設定事件訂閱（Webhook）。

### 4.1 設定回調位址

1. 在自建應用詳情頁，進入 **「事件訂閱」** 或 **「回調設定」** 頁籤
2. 填入回調 URL（Callback URL）：

```
https://your-vercel-app.vercel.app/api/yonsuite/webhook
```

> 此 URL 需為公開可存取的 HTTPS 端點。若使用 Vercel 部署，請使用部署後取得的域名。

### 4.2 選擇訂閱事件

勾選以下事件類型（依實際可用項目選擇）：

| 事件名稱 | 說明 |
|----------|------|
| 工時單審批通過 | 工時單據經主管審批後觸發 |
| 工時單變更 | 工時記錄新增、修改、刪除時觸發 |
| 專案資料變更 | 專案基本資料異動時觸發（可選） |

### 4.3 驗證回調

YonSuite 在儲存回調位址時通常會發送一次驗證請求。確保你的 Webhook 端點已部署並能正確回應驗證挑戰（Challenge）。

<!-- TODO: 截圖 — 事件訂閱設定頁面 -->

---

## 5. 環境變數設定

完成上述步驟後，將取得的憑證與設定值配置至 Vercel 環境變數中。

### 5.1 Vercel 環境變數

在 Vercel 專案的 **Settings** → **Environment Variables** 中新增以下變數：

```bash
# === YonSuite API 憑證 ===
YONSUITE_APP_KEY=your_app_key
YONSUITE_APP_SECRET=your_app_secret
YONSUITE_TENANT_ID=your_tenant_id
YONSUITE_DATA_CENTER=c1.yonyoucloud.com

# === 企業微信文檔設定 ===
WECOM_DOC_ID=dcBVaHSF2V18DkkKZO9ZyO614Vx5ekdFfzkHVlbwYp006PhbJGctJSQFgUpY3AHLrW8PUPpjLOtOCVcOzqvAXQjg

# === 同步模式 ===
SYNC_MODE=live
```

### 5.2 各變數說明

| 變數名稱 | 來源 | 說明 |
|----------|------|------|
| `YONSUITE_APP_KEY` | 步驟 1.3 | 自建應用的 AppKey |
| `YONSUITE_APP_SECRET` | 步驟 1.3 | 自建應用的 AppSecret（用於 HmacSHA256 簽章） |
| `YONSUITE_TENANT_ID` | 步驟 2.2 | 企業帳號 ID |
| `YONSUITE_DATA_CENTER` | 步驟 2.2 | 數據中心域名（不含 `https://` 前綴） |
| `WECOM_DOC_ID` | 企業微信智能表格 | 工時數據來源的文檔 ID |
| `SYNC_MODE` | 手動設定 | `live` = 正式寫入；`dry-run` = 僅模擬不寫入 |

### 5.3 Vercel CLI 設定方式（替代方案）

亦可透過 Vercel CLI 批次設定：

```bash
# 逐一新增
vercel env add YONSUITE_APP_KEY production
# 貼上對應的值

vercel env add YONSUITE_APP_SECRET production
vercel env add YONSUITE_TENANT_ID production
vercel env add YONSUITE_DATA_CENTER production
vercel env add WECOM_DOC_ID production
vercel env add SYNC_MODE production
```

### 5.4 本地開發環境

若需在本地測試，可在專案根目錄建立 `.env.local` 檔案：

```bash
YONSUITE_APP_KEY=your_app_key
YONSUITE_APP_SECRET=your_app_secret
YONSUITE_TENANT_ID=your_tenant_id
YONSUITE_DATA_CENTER=c1.yonyoucloud.com
WECOM_DOC_ID=dcBVaHSF2V18DkkKZO9ZyO614Vx5ekdFfzkHVlbwYp006PhbJGctJSQFgUpY3AHLrW8PUPpjLOtOCVcOzqvAXQjg
SYNC_MODE=dry-run
```

> **安全提醒：** `.env.local` 已加入 `.gitignore`，請勿提交至版本控制系統。

---

## 6. 員工映射設定

YonSuite 工時系統使用內部員工 ID（而非姓名）來記錄工時，因此需要建立企業微信員工名稱與 YonSuite 員工 ID 的映射關係。

### 6.1 取得員工主檔

透過 YonSuite API 查詢員工清單：

```
GET https://{data_center_domain}/yonbip/digitalModel/staff/list
```

回傳資料中，每位員工至少包含：

| 欄位 | 說明 |
|------|------|
| `id` | YonSuite 員工內部 ID |
| `name` | 員工姓名 |
| `code` | 員工編號（如有） |

### 6.2 建立映射表

比對企業微信工時表中的員工名稱與 YonSuite 員工主檔，建立映射關係。

映射設定存放於專案中的 `field-mapping.ts`（或對應的設定檔），格式如下：

```typescript
export const EMPLOYEE_MAPPING: Record<string, string> = {
  // 企業微信名稱 → YonSuite 員工 ID
  "張三": "ys_emp_001",
  "李四": "ys_emp_002",
  "王五": "ys_emp_003",
};
```

### 6.3 映射注意事項

- **同名處理：** 若有多位同名員工，需搭配員工編號或部門資訊進一步區分
- **新進員工：** 新員工入職後需手動更新映射表
- **離職員工：** 建議將離職員工的映射值設為 `null` 或移除，避免寫入失敗
- **定期校驗：** 建議每月核對一次映射表與 YonSuite 員工主檔的一致性

---

## 7. 驗證步驟

完成所有設定後，依以下順序逐步驗證整合是否運作正常。

### 7.1 步驟一：Dry-Run 模式測試

先將 `SYNC_MODE` 設為 `dry-run`，執行一次同步：

```bash
# 本地測試
SYNC_MODE=dry-run npm run sync
```

檢查項目：

- [ ] API 認證是否成功取得 Access Token
- [ ] 企業微信工時數據是否正確讀取
- [ ] 數據轉換邏輯是否產出正確的 JSON 結構
- [ ] 員工映射是否全部命中（無未映射的員工）
- [ ] 日志輸出是否無異常錯誤

### 7.2 步驟二：檢查數據轉換結果

Dry-Run 模式會輸出即將寫入的 JSON 數據（但不實際呼叫寫入 API）。仔細檢查：

- [ ] `_status` 欄位值是否正確（`Insert` / `Update`）
- [ ] 工時小時數是否與來源數據一致
- [ ] 專案 ID 映射是否正確
- [ ] 日期格式是否符合 YonSuite API 要求

### 7.3 步驟三：Live 模式單人測試

將 `SYNC_MODE` 切換為 `live`，但僅針對**一位測試員工**執行同步：

```bash
SYNC_MODE=live EMPLOYEE_FILTER="張三" npm run sync
```

### 7.4 步驟四：YonSuite 端驗證

登入 YonSuite 管理平台，進入 **專案工時** 頁面：

1. 確認測試員工的工時記錄已正確出現
2. 檢查以下項目：
   - [ ] 工時日期是否正確
   - [ ] 工時小時數是否正確
   - [ ] 關聯的專案是否正確
   - [ ] 工時描述/備註是否完整
3. 若資料正確，可逐步擴大同步範圍至全部員工

<!-- TODO: 截圖 — YonSuite 專案工時頁面，顯示成功寫入的記錄 -->

### 7.5 常見問題排除

| 問題 | 可能原因 | 解決方式 |
|------|----------|----------|
| 認證失敗（401） | AppKey/AppSecret 錯誤或已過期 | 重新確認環境變數值 |
| 權限不足（403） | API 權限未指派或未審批 | 回到步驟 3 檢查權限設定 |
| 找不到員工 | 員工映射表缺少對應記錄 | 更新 `field-mapping.ts` |
| 寫入失敗（400） | 請求 JSON 格式錯誤 | 對照 API 文件檢查欄位名稱與格式 |
| 超時 | 數據中心域名錯誤 | 確認 `YONSUITE_DATA_CENTER` 值 |

---

## 8. 已知 YonSuite API 資訊

以下整理了目前已知的 YonSuite Open API 技術細節，供開發參考。

### 8.1 認證機制

YonSuite 自建應用使用 **HmacSHA256 簽章**認證（非 OAuth2 流程）。

**取得 Access Token：**

```
POST https://open.yonyoucloud.com/open-auth/selfAppAuth/getAccessToken
```

**請求參數：**

| 參數 | 說明 |
|------|------|
| `appKey` | 自建應用的 AppKey |
| `appSecret` | 自建應用的 AppSecret（用於生成簽章） |
| `tenantId` | 企業帳號 ID |

**回傳資料：**

```json
{
  "code": "200",
  "data": {
    "access_token": "eyJhbGciOi...",
    "expires_in": 7200
  }
}
```

| 屬性 | 值 | 說明 |
|------|-----|------|
| **Token TTL** | `7200` 秒（2 小時） | 到期前應主動刷新 |
| **簽章演算法** | HmacSHA256 | 使用 AppSecret 作為金鑰 |

> **實務建議：** 實作 Token 快取機制，在到期前 5 分鐘自動刷新，避免請求中途 Token 過期。

### 8.2 API 基礎 URL 格式

所有業務 API 的基礎 URL 格式為：

```
https://{data_center_domain}/yonbip/{domain}/{entity}/{operation}
```

其中：

| 區段 | 說明 | 範例 |
|------|------|------|
| `{data_center_domain}` | 企業數據中心域名 | `c1.yonyoucloud.com` |
| `{domain}` | 業務領域 | `pm`（專案管理）、`digitalModel`（數位建模） |
| `{entity}` | 資料實體 | `timesheet`、`staff`、`project` |
| `{operation}` | 操作類型 | `batchSave`、`list`、`audit` |

### 8.3 已知 API 端點

以下端點為目前已知的路徑，實際使用時可能需依租戶版本調整：

| 功能 | 端點路徑 | 方法 | 說明 |
|------|----------|------|------|
| **工時單** | `/yonbip/pm/timesheet` | POST | 專案工時讀寫 |
| **員工主檔** | `/yonbip/digitalModel/staff` | GET | 查詢員工資料 |
| **專案資料** | `/yonbip/pm/project` | GET | 查詢專案清單 |

> **注意：** 上述路徑為初步整理，實際端點請以用友官方 API 文件或 YonSuite 開發者中心說明為準。部署前務必逐一驗證。

### 8.4 已知操作類型

| 操作 | 說明 |
|------|------|
| `batchSave` | 批次儲存（新增或更新） |
| `list` | 查詢清單（支援分頁與篩選） |
| `audit` | 提交審批 |

### 8.5 請求數據格式

寫入類 API 使用 JSON 格式，結構如下：

```json
{
  "data": [
    {
      "_status": "Insert",
      "field1": "value1",
      "field2": "value2"
    },
    {
      "_status": "Update",
      "id": "existing_record_id",
      "field1": "new_value"
    }
  ]
}
```

| `_status` 值 | 說明 |
|--------------|------|
| `Insert` | 新增記錄 |
| `Update` | 更新既有記錄（需提供 `id`） |
| `Delete` | 刪除記錄（需提供 `id`） |

### 8.6 速率限制

| 項目 | 預設值 |
|------|--------|
| **請求頻率** | 2 次/秒 |
| **每日配額** | 依租戶方案而異 |

> **實務建議：** 在程式碼中實作速率限制器（Rate Limiter），確保不超過 2 requests/sec。批次寫入時建議每筆之間間隔 500ms 以上。

### 8.7 認證流程圖

```
┌─────────────────┐
│  PMO 工時同步    │
│  (Vercel App)   │
└────────┬────────┘
         │
         │ 1. POST getAccessToken
         │    (AppKey + AppSecret + TenantId)
         ▼
┌─────────────────────────────────┐
│  open.yonyoucloud.com           │
│  /open-auth/selfAppAuth/        │
│   getAccessToken                │
└────────┬────────────────────────┘
         │
         │ 2. 回傳 access_token (TTL: 7200s)
         ▼
┌─────────────────┐
│  PMO 工時同步    │
│  (快取 Token)   │
└────────┬────────┘
         │
         │ 3. 業務 API 呼叫
         │    (附帶 access_token)
         ▼
┌─────────────────────────────────┐
│  {data_center_domain}            │
│  /yonbip/pm/timesheet/batchSave │
│  /yonbip/digitalModel/staff/list│
│  /yonbip/pm/project/list        │
└─────────────────────────────────┘
```

---

## 附錄：快速檢查清單

完成所有設定後，使用以下清單確認無遺漏：

- [ ] **步驟 1：** 自建應用「PMO工時同步」已建立，AppKey 與 AppSecret 已記錄
- [ ] **步驟 2：** 企業帳號 ID（TenantId）與數據中心域名已記錄
- [ ] **步驟 3：** API 權限已指派（項目管理讀寫、人力資源讀取、項目工時讀寫）
- [ ] **步驟 4：** 事件訂閱已設定（可選）
- [ ] **步驟 5：** Vercel 環境變數已全部設定完成
- [ ] **步驟 6：** 員工映射表已建立並驗證
- [ ] **步驟 7：** Dry-Run 測試通過 → 單人 Live 測試通過 → YonSuite 端確認無誤

---

> **文件維護說明：** 本指南中的 API 路徑與參數基於目前已知的技術資訊整理。若用友官方更新 API 規格，請同步更新本文件第 8 節的內容。最後更新時間請參閱 Git 提交記錄。
