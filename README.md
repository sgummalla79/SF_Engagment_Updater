# Architect Cadence — Chrome Extension

A Chrome extension that automatically updates Salesforce records on a scheduled daily basis. It reads your active Salesforce session, filters records using structured SOQL conditions, enforces an owner safety check, and updates only the records you configure — zero manual intervention needed.

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

Both scripts produce `archcadence.zip` in the project root containing only the files needed for the extension. Development files (`README.md`, `PRIVACY_POLICY.md`, `store-description.txt`, `scripts/`) are excluded.

---

## Installation (local / development)

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **Load unpacked** and select this folder
4. The extension icon will appear in your toolbar

---

## Configuration

All behaviour is controlled by `config.json` in the extension folder. Edit this file before building or loading unpacked.

```json
{
  "domain": "yourorg.my.salesforce.com",
  "apiVersion": "v60.0",
  "logLevel": "info",
  "object": "Student__c",
  "ownerFieldName": "OwnerId",
  "filters": {
    "conditions": [
      { "field": "Status__c", "operator": "=",  "value": "Active" },
      { "field": "Id",        "operator": "IN", "value": ["a0uXXXXXXXXXXXXX"] }
    ],
    "logic": "1 AND 2"
  },
  "updateFields": [
    { "field": "Status__c", "value": "Completed" }
  ]
}
```

| Property | Required | Description |
|---|---|---|
| `domain` | Yes | Your Salesforce org domain |
| `apiVersion` | Yes | Salesforce REST API version, e.g. `v60.0` |
| `logLevel` | No | `info` (default) or `finest` for full debug logs |
| `object` | Yes | API name of the Salesforce object to update |
| `ownerFieldName` | Yes | Field used to match records to the current session user (e.g. `OwnerId`). Updates are blocked if omitted. |
| `filters.conditions` | Yes | Array of filter conditions — each has `field`, `operator`, and `value` |
| `filters.logic` | Yes | Expression referencing condition numbers, e.g. `1 AND (2 OR 3) AND 4` |
| `updateFields` | Yes | Array of `{ field, value }` pairs to apply to each matched record |

### Supported operators
`=` `!=` `>` `<` `>=` `<=` `LIKE` `IN` `NOT IN`

### Logic expression
Numbers in `logic` are 1-based indexes into `conditions`. Parentheses and `AND`/`OR` work as in SOQL:
```
"logic": "1 AND (2 OR 3) AND 4"
```

### Log levels
| Level | What is logged |
|---|---|
| `error` | Errors only |
| `warn` | Warnings and errors |
| `info` | Normal run summaries (default) |
| `finest` | Everything above + full SOQL query + updated record IDs |

---

## How It Works

1. **Session** — Reads the `sid` cookie from your active Salesforce browser session. You must be logged into Salesforce in the same browser.
2. **Owner check** — Calls `/services/oauth2/userinfo` to get the current user's ID and appends `AND {ownerFieldName} = '{userId}'` to the query automatically.
3. **Safety limit** — Aborts if the query returns more than 15 records. Refine your filters and try again.
4. **Permission checks** — Verifies object-level and field-level update permissions before touching any data.
5. **Query** — Builds and runs a SOQL query from your `filters` config.
6. **Update** — Sends individual PATCH requests to update each matched record.
7. **Scheduling** — Uses `chrome.alarms` to fire at the configured daily time.

---

## Important Notes

- **Browser must be open** — Chrome alarms only fire while the browser is running. If closed at the scheduled time, the alarm fires on next launch.
- **Session expiry** — If your Salesforce session has expired the run will fail. Keep a tab open or increase your org's session timeout.
- **API limits** — Each record update is one API call. Be mindful of your org's daily API request limits.
- **Security** — The session token never leaves your browser. All API calls go directly to your Salesforce org.

---

## Publishing to Chrome Web Store

1. Run the build script to generate `archcadence.zip`
2. Go to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
3. Pay the one-time $5 developer registration fee (if not already done)
4. Click **New Item** and upload `archcadence.zip`
5. Fill in the store listing using `store-description.txt`
6. Add your privacy policy URL pointing to `PRIVACY_POLICY.md` in this repo
7. Upload screenshots and submit for review
