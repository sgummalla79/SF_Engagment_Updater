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
    "callCompletedAction": {
      "updateFields": [
        { "field": "Engagement_Status__c", "value": "Waiting on Customer" }
      ]
    },
    "onCallAction": {
      "durations": ["30s", "1m", "5m", "15m", "30m", "45m", "1h"],
      "updateFields": [
        { "field": "Engagement_Status__c", "value": "Call/Meeting Scheduled" }
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
| `onCallAction.durations` | Yes | Array of duration labels shown in the dropdown (e.g. `["30s","1m","5m","15m","30m","45m","1h"]`) |
| `onCallAction.updateFields` | Yes | Fields to update on the engagement when Internal Call or Customer Call is clicked |
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

### Schedule Tab
- **Daily Run** — time picker for the automatic daily run
- **Run Now** — triggers the daily scheduler immediately
- **Show Config** — opens `config.json` in a new browser tab
- **Logs accordion** — two collapsible sections:
  - **Engagement View** — logs for engagements tab actions (cache hits, DB pulls, on-call updates, auto-reverts, errors)
  - **Daily Scheduler** — logs for scheduled and manual runs (session, permissions, SOQL, per-record results, errors)

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

## Publishing to Chrome Web Store

1. Run the build script to generate `archcadence.zip`
2. Go to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
3. Pay the one-time $5 developer registration fee (if not already done)
4. Click **New Item** and upload `archcadence.zip`
5. Fill in the store listing using `store-description.txt`
6. Add your privacy policy URL pointing to `PRIVACY_POLICY.md` in this repo
7. Upload screenshots and submit for review
