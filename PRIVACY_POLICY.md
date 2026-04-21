# Privacy Policy — Architect Cadence

_Last updated: April 20, 2026_

## Overview

Architect Cadence ("the extension") is a Chrome browser extension that manages Salesforce Architect Engagements directly from your browser. It queries and updates Salesforce records using your active Salesforce browser session. This policy explains what data the extension accesses, how it is used, and what is never collected.

## Data Accessed

### Salesforce Session Cookie
The extension reads the `sid` session cookie from your active Salesforce browser session solely to authenticate API requests to Salesforce. This cookie is never transmitted to any server other than your own Salesforce instance (the domain configured in `config.json`).

### Salesforce Record Data
The extension queries and updates Salesforce records as configured in `config.json`. This includes:
- Reading engagement records owned by the current user to display in the Engagements tab
- Updating engagement status fields when the daily scheduler runs, when a call is logged, when a call is completed, or when an auto-revert timer fires

All data is sent directly between your browser and your Salesforce instance. No record data is read, stored, or transmitted by the extension beyond what is necessary to perform the configured operations.

### Current User Identity
The extension calls the Salesforce `/services/oauth2/userinfo` endpoint to retrieve the currently logged-in user's name and ID. This is used to:
- Display the signed-in user's name in the extension header
- Filter all queries so that only records owned by or assigned to the current user are shown and updated

The user identity is not stored persistently and is not transmitted to any party other than your Salesforce instance.

## Data Stored Locally

The extension stores the following data in Chrome's local storage (`chrome.storage.local`) on your device only:

- **Scheduled run time** — the daily time configured for automatic runs
- **Active / Inactive state** — whether the extension is set to apply updates or run in preview-only mode
- **UI theme preference** — light or dark mode selection
- **Engagement view cache** — a short-lived cache (5-minute TTL) of engagement records fetched from Salesforce, used to reduce unnecessary API calls
- **Pending call timers** — a record of active auto-revert timers (engagement record ID, call type, duration, scheduled revert time), used to cancel timers when Call Completed is clicked manually
- **Engagement View logs** — a history of engagements tab actions including cache hits, DB pulls, on-call updates, auto-reverts, and errors (up to 200 entries)
- **Daily Scheduler logs** — a history of scheduled and manual run results including timestamps, record counts, permission checks, and any errors (up to 200 entries)

All data stored locally never leaves your device and is not accessible to any third party.

## Data Never Collected

Architect Cadence does **not**:

- Collect, transmit, or share any personal data with the extension developer or any third party
- Send any Salesforce data, credentials, or session tokens to any external server
- Use analytics, telemetry, or tracking of any kind
- Store data in any remote database or cloud service

## Third-Party Services

The extension communicates exclusively with:

- Your own Salesforce instance (the domain you configure in `config.json`)

No other third-party services, APIs, or servers are contacted.

## Configuration File

The `config.json` file bundled with the extension contains all query, update, and display settings. This file is stored locally within the extension package on your device and is not transmitted anywhere.

## Changes to This Policy

If this policy is updated, the new version will be published to this repository with an updated date at the top of this document.

## Contact

For questions about this privacy policy, please open an issue in the GitHub repository where this extension is hosted.
