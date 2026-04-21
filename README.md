# Architect Cadence — Chrome Extension

A Chrome extension that manages Salesforce Architect Engagements directly from your browser. It shows your active engagements, lets you log calls with one click, auto-reverts engagement status after a configurable timer, and runs a daily scheduled update — all driven by a single `config.json` file with zero manual intervention.

---

## Build

Package the extension into a zip ready for Chrome Web Store upload.

**Mac / Linux**
```bash
./scripts/build.sh
```

**Windows**
```bat
scripts\build.bat
```

Both scripts produce `archcadence.zip` containing only the files needed for the extension. Development files (`README.md`, `PRIVACY_POLICY.md`, `store-description.txt`, `scripts/`) are excluded.
- **Mac/Linux** — outputs to the project root
- **Windows** — outputs to `%TEMP%\archcadence.zip` (e.g. `C:\Users\you\AppData\Local\Temp\archcadence.zip`)

**Prepare store screenshots** (resizes popup screenshots to the required 1280×800):
```bash
python3 scripts/prepare-screenshots.py screenshot1.png screenshot2.png
```
Outputs `store-screenshot-1.png`, `store-screenshot-2.png` in the project root, ready to upload to the Chrome Web Store.

---

## Installation (local / development)

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **Load unpacked** and select this folder
4. The extension icon will appear in your toolbar

---

## Configuration

All behaviour is controlled by `config.json` in the extension folder. Edit this file before building or loading unpacked. Click **Show Config** in the popup to view the file path.

```json
{
  "domain": "yourorg.my.salesforce.com",
  "apiVersion": "v66.0",
  "maxRecords": 15,
  "logLevel": "info",
  "object": "Engagement__c",
  "ownerFieldName": "OwnerId",
  "dailyScheduler": {
    "filters": {
      "conditions": [
        { "field": "Stage__c", "operator": "=", "value": "Delivery" },
        { "field": "Engagement_Status__c", "operator": "!=", "value": "Waiting on Customer" }
      ],
      "logic": "1 AND 2"
    },
    "updateFields": [
      { "field": "Engagement_Status__c", "value": "Waiting on Customer" }
    ]
  },
  "engagementsView": {
    "nameField": "Name",
    "titleField": "Title__c",
    "statusField": "Engagement_Status__c",
    "stageField": "Stage__c",
    "filters": {
      "conditions": [
        { "field": "Stage__c", "operator": "=", "value": "Delivery" }
      ]
    },
    "callDurations": ["30s", "1m", "5m", "15m", "30m", "45m", "1h"],
    "callCompletedAction": {
      "updateFields": [
        { "field": "Engagement_Status__c", "value": "Waiting on Customer" }
      ]
    },
    "customerCallAction": {
      "updateFields": [
        { "field": "Engagement_Status__c", "value": "Call/Meeting Scheduled" }
      ],
      "createRecords": [
        {
          "object": "Activity__c",
          "fields": [
            { "field": "Name",          "value": "Customer Call" },
            { "field": "Priority__c",   "value": "High" },
            { "field": "Type__c",       "value": "External Meeting" },
            { "field": "Notes__c",      "value": "Please update notes on this record after customer call is completed" },
            { "field": "Engagement__c", "value": "{recordId}" }
          ]
        }
      ]
    },
    "internalCallAction": {
      "updateFields": [
        { "field": "Engagement_Status__c", "value": "Call/Meeting Scheduled" }
      ],
      "createRecords": [
        {
          "object": "Activity__c",
          "fields": [
            { "field": "Name",          "value": "Internal Call with CSM/Product" },
            { "field": "Priority__c",   "value": "Medium" },
            { "field": "Type__c",       "value": "Internal Meeting" },
            { "field": "Notes__c",      "value": "Please update notes on this record after internal call is completed" },
            { "field": "Engagement__c", "value": "{recordId}" }
          ]
        }
      ]
    }
  }
}
```

### Top-level properties

| Property | Required | Description |
|---|---|---|
| `domain` | Yes | Your Salesforce org domain |
| `apiVersion` | Yes | Salesforce REST API version, e.g. `v66.0` |
| `maxRecords` | Yes | Safety limit — aborts the daily scheduler run if the query returns more records than this value |
| `logLevel` | No | `info` (default), `finest`, `warn`, or `error` — see log levels table below |
| `object` | Yes | API name of the Salesforce object to query and update |
| `ownerFieldName` | Yes | Field used to match records to the current session user (e.g. `OwnerId`). Runs are blocked if omitted. |

### `dailyScheduler`

Controls the automatic daily bulk update run.

| Property | Required | Description |
|---|---|---|
| `filters.conditions` | Yes | Array of filter conditions — each has `field`, `operator`, and `value` |
| `filters.logic` | Yes* | Expression referencing condition numbers, e.g. `1 AND 2`. Required when more than one condition is defined. |
| `updateFields` | Yes | Array of `{ field, value }` pairs to apply to each matched record |

### `engagementsView`

Controls what appears in the **Engagements** tab.

| Property | Required | Description |
|---|---|---|
| `nameField` | Yes | Field displayed as the engagement name (first line) |
| `titleField` | No | Field displayed as the title/subtitle. If same as `nameField`, shown once. |
| `statusField` | Yes | Field shown as the status badge |
| `stageField` | Yes | Field shown as the stage badge |
| `filters.conditions` | No | Additional filters applied when querying engagements for the view. Always AND'd with `ownerFieldName = currentUser`. |
| `filters.logic` | Yes* | Required when `filters.conditions` has more than one entry. |
| `callDurations` | Yes | Array of duration labels shown in the dropdown (e.g. `["30s","1m","5m","15m","30m","45m","1h"]`) |
| `customerCallAction.updateFields` | Yes | Fields to update on the engagement when Customer Call is clicked |
| `customerCallAction.createRecords` | No | Array of records to create in Salesforce when Customer Call is clicked. Supports `{recordId}`, `{callType}`, `{duration}` placeholders. |
| `internalCallAction.updateFields` | Yes | Fields to update on the engagement when Internal Call is clicked |
| `internalCallAction.createRecords` | No | Array of records to create in Salesforce when Internal Call is clicked. Supports the same placeholders. |
| `callCompletedAction.updateFields` | Yes | Fields to update when Call Completed is clicked or the auto-revert timer fires |

### Supported operators
`=` `!=` `>` `<` `>=` `<=` `LIKE` `IN` `NOT IN`

### Logic expression
Numbers in `logic` are 1-based indexes into `conditions`. `logic` is optional when there is only one condition.
```
"logic": "1 AND (2 OR 3) AND 4"
```

### Log levels
| Level | What is logged |
|---|---|
| `error` | Errors only |
| `warn` | Warnings and errors |
| `info` | Normal run summaries (default) |
| `finest` | Everything above + full SOQL query + per-record update results |

---

## UI Overview

The popup has a fixed header and two tabs.

### Header
- **Extension icon + title** — Architect Cadence branding
- **Session user** — displays the logged-in Salesforce user's name (or "Not signed in")
- **🌙 / 🌕 Theme toggle** — switches between dark mode (default) and light mode
- **Active / Inactive toggle** — when Inactive, the daily scheduler SOQL still runs and logs the matched count, but no records are updated

### Engagements Tab (default)
Displays all engagements owned by the current session user that match `engagementsView.filters`. Results are cached for 5 minutes to avoid unnecessary API calls.

Each engagement card shows:
- **Line 1** — Engagement name and title
- **Line 2** — Stage badge · Status badge
- **Line 3** — Duration dropdown · 📞 Internal Call · 📞 Customer Call

When status is already `Call/Meeting Scheduled`:
- Line 3 shows `✓ Scheduled` and a **📵 Call Completed** button instead

**↺ Refresh** button at the top forces a live fetch, bypassing the cache and resetting the 5-minute timer.

### Logs Tab
Two collapsible accordion sections, each independently expandable and clearable:
- **Engagement View** — logs for all engagements tab actions: cache hits, DB pulls, PATCH updates, POST record creates, auto-reverts, and errors
- **Daily Scheduler** — logs for scheduled and manual runs: session check, permissions, SOQL query, per-record PATCH results, and errors

### Sticky Footer (visible on both tabs)
- **Daily Run** — time picker for the automatic daily run
- **Run Now** — triggers the daily scheduler immediately
- **Show Config** — opens `config.json` in a new browser tab

---

## How It Works

### Engagements View
1. **Session check** — verifies an active Salesforce `sid` cookie exists. Shows "No Engagements" if not signed in.
2. **Cache** — serves from `chrome.storage.local` cache if data is less than 5 minutes old. Logs whether data came from cache or Salesforce.
3. **Query** — fetches engagements with `SELECT … FROM {object} WHERE {ownerFieldName} = '{userId}' AND {engagementsView.filters}`.
4. **On Call (Internal / Customer)** — updates the engagement with `onCallAction.updateFields` and sets a `chrome.alarm` to auto-revert after the selected duration.
5. **Auto-revert** — when the alarm fires, the engagement is updated with `callCompletedAction.updateFields` automatically.
6. **Call Completed (manual)** — cancels the pending alarm and immediately applies `callCompletedAction.updateFields`.

### Daily Scheduler
1. **Session** — reads the `sid` cookie from your active Salesforce browser session.
2. **Owner check** — calls `/services/oauth2/userinfo` to get the current user's ID and appends `AND {ownerFieldName} = '{userId}'` to the query.
3. **Permission checks** — verifies object-level and field-level update permissions before touching any data.
4. **Query** — builds and runs a SOQL query from `dailyScheduler.filters`.
5. **Safety limit** — aborts if the query returns more than `maxRecords` records.
6. **Active / Inactive** — if Inactive, logs the matched record count but makes no updates.
7. **Update** — sends individual PATCH requests to update each matched record.
8. **Cache invalidation** — clears the engagements view cache after every run so the next tab open shows fresh data.
9. **Scheduling** — uses `chrome.alarms` to fire at the configured daily time.

---

## Important Notes

- **Browser must be open** — Chrome alarms only fire while the browser is running. If closed at the scheduled time, the alarm fires on next launch.
- **Session expiry** — if your Salesforce session has expired, all operations will fail. Keep a tab open or increase your org's session timeout.
- **Auto-revert minimum delay** — Chrome enforces a minimum alarm delay of 1 minute for published extensions. The `30s` duration option works correctly in development (unpacked) but fires after 1 minute in a published extension.
- **API limits** — each record update and On Call action is one API call. Be mindful of your org's daily API request limits.
- **Security** — the session token never leaves your browser. All API calls go directly to your Salesforce org.

---

## Demo Scenarios

The following scenarios cover all major features of the extension. Each can be demonstrated end-to-end from the popup.

---

### Scenario 1 — First Launch and Session Check

**What it shows:** The extension detects your active Salesforce session and identifies who is logged in.

1. Make sure you are logged in to Salesforce in another Chrome tab.
2. Click the Architect Cadence extension icon to open the popup.
3. **Expected:** The header shows your Salesforce user name next to "Connected as".
4. Now log out of Salesforce (or open a browser with no Salesforce session).
5. Open the popup again.
6. **Expected:** Header shows "Not signed in" in grey. Engagements tab shows "No Engagements".

---

### Scenario 2 — Viewing Engagements and Cache Behavior

**What it shows:** Engagements owned by you are loaded from Salesforce and cached for 5 minutes to avoid unnecessary API calls.

1. Open the popup. The **Engagements** tab loads automatically.
2. **Expected:** Your engagement cards appear — each showing Name, Stage badge, Status badge, duration dropdown, and call buttons.
3. Close and reopen the popup within 5 minutes.
4. **Expected:** Engagements load instantly from cache. Open the **Logs** tab → expand **Engagement View** → see a `Cache hit` log entry with the age in seconds.
5. Click **↺ Refresh** at the top of the Engagements tab.
6. **Expected:** Engagements are fetched live from Salesforce, bypassing the cache. Logs show a `DB pull` entry with the record count.

---

### Scenario 3 — Customer Call

**What it shows:** Clicking Customer Call updates the engagement status and creates a high-priority External Meeting activity record in Salesforce.

1. On the Engagements tab, find a card whose status is not already `Call/Meeting Scheduled`.
2. Select a duration from the dropdown (e.g. **5m**).
3. Click **Customer Call**.
4. **Expected (popup):** The card immediately shows `✓ Scheduled` and a red **Call Completed** button. Both call buttons are replaced.
5. **Expected (Salesforce):** Open the engagement record — `Engagement_Status__c` is now `Call/Meeting Scheduled`.
6. **Expected (Salesforce):** An `Activity__c` record is created linked to the engagement with:
   - Name: `Customer Call`
   - Priority: `High`
   - Type: `External Meeting`
   - Notes: `Please update notes on this record after customer call is completed`
7. Open the **Logs** tab → expand **Engagement View** — you should see:
   - `PATCH Engagement__c [id] — Customer Call (5m)` with the field values
   - `PATCH Engagement__c [id] — updated successfully`
   - `POST Activity__c — creating activity for [id]` with all field values
   - `POST Activity__c — created successfully (id: ...)`

---

### Scenario 4 — Internal Call

**What it shows:** Same flow as Customer Call but creates a medium-priority Internal Meeting activity record.

1. On the Engagements tab, find a card whose status is not already `Call/Meeting Scheduled`.
2. Select a duration from the dropdown (e.g. **15m**).
3. Click **Internal Call**.
4. **Expected (popup):** Same as Scenario 3 — card shows `✓ Scheduled` + **Call Completed** button.
5. **Expected (Salesforce):** `Engagement_Status__c` → `Call/Meeting Scheduled`.
6. **Expected (Salesforce):** An `Activity__c` record created with:
   - Name: `Internal Call with CSM/Product`
   - Priority: `Medium`
   - Type: `Internal Meeting`
   - Notes: `Please update notes on this record after internal call is completed`
7. Open **Logs** → **Engagement View** — verify the same PATCH + POST log sequence as Scenario 3.

---

### Scenario 5 — Auto-Revert Timer

**What it shows:** After the selected duration expires, the engagement status automatically reverts to `Waiting on Customer` without any manual action.

> **Note:** Use **30s** duration for a quick demo. In a published extension Chrome enforces a minimum alarm delay of 1 minute — in development (Load unpacked) 30s works as-is.

1. Find a card not already in `Call/Meeting Scheduled` status.
2. Select **30s** from the duration dropdown.
3. Click **Customer Call** or **Internal Call**.
4. **Expected:** Card shows `✓ Scheduled` + **Call Completed** button. Logs show the timer is set.
5. Wait 30 seconds (or ~1 minute in a published extension).
6. Click **↺ Refresh** on the Engagements tab.
7. **Expected:** The card is back to showing the call buttons — status has reverted to `Waiting on Customer`.
8. Open **Logs** → **Engagement View** — look for:
   - `PATCH Engagement__c [id] — Auto-revert (timer expired)`
   - `PATCH Engagement__c [id] — auto-reverted successfully`

---

### Scenario 6 — Manual Call Completed

**What it shows:** When a call ends early, clicking Call Completed immediately reverts the status and cancels the pending auto-revert timer.

1. Click **Customer Call** or **Internal Call** on any card — choose a long duration like **1h**.
2. **Expected:** Card shows `✓ Scheduled` + red **Call Completed** button.
3. Click **Call Completed** before the timer fires.
4. **Expected (popup):** Card immediately returns to showing the call buttons with original status.
5. **Expected (Salesforce):** `Engagement_Status__c` → `Waiting on Customer`.
6. Open **Logs** → **Engagement View** — look for:
   - `PATCH Engagement__c [id] — Call Completed (manual)`
   - `PATCH Engagement__c [id] — updated successfully`
7. **Confirm timer cancelled:** Wait the original 1 hour duration — the status does NOT revert again because the alarm was cleared.

---

### Scenario 7 — Daily Scheduler: Run Now (Active Mode)

**What it shows:** The daily scheduler queries matching records and updates them in bulk. Full audit trail in the Daily Scheduler log.

1. Confirm the **● Active** toggle is shown in the header (green).
2. In the sticky footer, click **Run Now**.
3. **Expected:** A toast notification says "Running update now..." followed by "Run complete."
4. Open the **Logs** tab → expand **Daily Scheduler**. You should see the full sequence:
   - Session established
   - SOQL query with filters
   - Permission check passed
   - Found N record(s)
   - `PATCH Engagement__c [id] — updated successfully` per record
   - `Update complete — N of N records updated successfully`
5. **Expected (Salesforce):** All matched engagements now show `Engagement_Status__c` = `Waiting on Customer`.

---

### Scenario 8 — Daily Scheduler: Inactive Mode (Preview / Dry Run)

**What it shows:** With the toggle set to Inactive, the SOQL still runs and logs the match count but no records are changed — safe for testing filters.

1. Click the **● Active** button in the header to switch it to **○ Inactive** (grey).
2. Click **Run Now** in the sticky footer.
3. **Expected (popup):** Toast shows "Run complete."
4. Open **Logs** → **Daily Scheduler**. Look for:
   - The SOQL query and record count are logged normally
   - `Updates are deactivated. N record(s) matched — no changes were made`
5. **Expected (Salesforce):** No records were updated — verify one of the matched engagement records is unchanged.
6. Click **○ Inactive** to turn it back to **● Active**.

---

### Scenario 9 — Scheduled Daily Run (Automatic)

**What it shows:** The extension fires automatically at the configured time every day without any user action.

1. Note the current time. In the sticky footer, set **Daily Run** to 2–3 minutes from now.
2. Close the popup and leave Chrome open with a Salesforce tab active.
3. When the scheduled time arrives, the run fires automatically in the background.
4. Open the popup and go to **Logs** → **Daily Scheduler**.
5. **Expected:** A new run entry appears with the automatic trigger timestamp.
6. Reset the **Daily Run** time back to your preferred daily time (e.g. `17:00`).

---

### Scenario 10 — Theme Toggle

**What it shows:** The popup persists your light/dark preference across sessions.

1. Click the **🌙** button in the top-right of the header.
2. **Expected:** The popup switches to light mode and the button changes to **🌕**.
3. Close and reopen the popup.
4. **Expected:** Light mode is remembered.
5. Click **🌕** to switch back to dark mode.

---

### Scenario 11 — Logs: View, Expand, and Clear

**What it shows:** All Salesforce API calls are captured in segregated log streams — Engagement View actions separate from Daily Scheduler runs.

1. After performing a few calls (Scenarios 3–8), open the **Logs** tab.
2. Click the **Engagement View** accordion header to expand it.
3. **Expected:** Timestamped entries for every PATCH and POST made from the Engagements tab — colour-coded by level (green = OK, blue = INFO, red = ERROR).
4. Click the **Daily Scheduler** accordion header to expand it.
5. **Expected:** Separate entries for the Run Now and/or scheduled runs — no mixing with engagement logs.
6. Click **Clear** on the **Engagement View** section.
7. **Expected:** That section empties. Daily Scheduler logs are unaffected.

---

### Scenario 12 — Show Config

**What it shows:** The full `config.json` is always accessible from the popup for quick inspection.

1. Click **Show Config** in the sticky footer.
2. **Expected:** A new browser tab opens showing the raw `config.json` content.
3. This is the single file that controls all queries, updates, durations, and activity record creation — no other settings exist.

---

## Publishing to Chrome Web Store

1. Run the build script to generate `archcadence.zip`
2. Go to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
3. Pay the one-time $5 developer registration fee (if not already done)
4. Click **New Item** and upload `archcadence.zip`
5. Fill in the store listing using `store-description.txt`
6. Add your privacy policy URL pointing to `PRIVACY_POLICY.md` in this repo
7. Upload screenshots and submit for review
