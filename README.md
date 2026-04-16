# Architect Cadence — Chrome Extension

A Chrome extension that auto-updates Architect Engagement records in Salesforce on a daily cadence. It reads the Salesforce session cookie, checks field-level and object-level update permissions, and performs scheduled daily record updates — zero intervention needed.

## Installation

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **Load unpacked** and select this `sf-updater-extension` folder
4. The extension icon will appear in your toolbar

## Setup

### 1. Configuration Tab
- **Enable scheduled updates** — master on/off toggle
- **Salesforce Domain** — your org's domain, e.g. `acme.my.salesforce.com`
- **Salesforce Object** — API name of the object to update (e.g. `Account`, `Case`, `Custom_Object__c`)
- **Daily Run Time** — the time of day the update should execute (local time)
- **WHERE Clause Filter** — optional SOQL WHERE clause to narrow which records are updated (e.g. `Status = 'New' AND CreatedDate = TODAY`)

### 2. Update Fields Tab
- Click **Load Fields from SF** to fetch all updateable fields from the configured object
- Add rows for each field you want to update, specifying the new value
- The extension validates field-level permissions before every run

### 3. Logs Tab
- View execution history with timestamps and status levels
- Clear logs when needed

## How It Works

1. **Session Cookie** — The extension reads the `sid` cookie from your Salesforce domain using `chrome.cookies` API. You must be logged into Salesforce in the same browser.
2. **Permission Checks** — Before updating, it calls the Salesforce `describe` endpoint to verify:
   - Object-level update permission
   - Field-level update permission for every target field
3. **Query** — Runs a SOQL query (with your optional WHERE filter) to find matching records
4. **Update** — Sends individual PATCH requests to update each record
5. **Scheduling** — Uses `chrome.alarms` API to fire at the configured time daily

## Important Notes

- **Browser must be open** — Chrome alarms only fire when the browser is running. If the browser is closed at the scheduled time, the alarm fires when it next opens.
- **Session expiry** — If your Salesforce session has expired, the update will fail. Ensure you stay logged in or have a long session timeout.
- **API limits** — Each record update is a separate API call. Be mindful of your org's API request limits if updating large record sets.
- **Security** — The session token never leaves your browser. All API calls go directly from the extension to your Salesforce org.

## Testing

Use the **Test Connection** button to verify the extension can read your session cookie and reach the Salesforce API. Use **Run Now** to trigger an immediate execution without waiting for the scheduled time.
