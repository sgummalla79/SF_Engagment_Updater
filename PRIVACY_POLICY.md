# Privacy Policy — Architect Cadence

_Last updated: April 16, 2026_

## Overview

Architect Cadence ("the extension") is a Chrome browser extension that updates Salesforce records using your active Salesforce browser session. This policy explains what data the extension accesses, how it is used, and what is never collected.

## Data Accessed

### Salesforce Session Cookie
The extension reads the `sid` session cookie from your active Salesforce browser session solely to authenticate API requests to Salesforce. This cookie is never transmitted to any server other than your own Salesforce instance (the domain configured in `config.json`).

### Salesforce Record Data
The extension queries and updates Salesforce records as configured in `config.json`. This data is sent directly between your browser and your Salesforce instance. No record data is read, stored, or transmitted by the extension beyond what is necessary to perform the configured update.

### Current User Identity
The extension calls the Salesforce `/services/oauth2/userinfo` endpoint to retrieve the currently logged-in user's ID. This is used exclusively to filter records so that only records owned by or assigned to the current user are updated. The user ID is not stored or transmitted elsewhere.

## Data Stored Locally

The extension stores the following data in Chrome's local storage (`chrome.storage.local`) on your device only:

- **Scheduled run time** — the daily time you configure for automatic runs
- **Active / Inactive state** — whether the extension is currently set to apply updates or run in preview-only mode
- **Execution logs** — a history of run results including timestamps, record counts, and any errors (up to 200 entries)

This data never leaves your device and is not accessible to any third party.

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

The `config.json` file bundled with the extension contains query and update settings. This file is stored locally within the extension package on your device and is not transmitted anywhere.

## Changes to This Policy

If this policy is updated, the new version will be published to this repository with an updated date at the top of this document.

## Contact

For questions about this privacy policy, please open an issue in the GitHub repository where this extension is hosted.
