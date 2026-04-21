// ============================================================
// Salesforce Scheduled Updater — Background Service Worker
// ============================================================

// ---- Constants ----
const ALARM_NAME = "sf-daily-update";
const STORAGE_KEY = "sf_updater_config";
const LOG_KEY = "sf_updater_logs";
const ENGAGEMENTS_CACHE_KEY = "sf_engagements_cache";
const ENGAGEMENTS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const ENGAGEMENT_LOG_KEY = "sf_engagement_logs";
const PENDING_CALLS_KEY = "sf_pending_calls";
const MAX_LOGS = 200;

// ---- Log Level Hierarchy ----
// Lower number = more verbose. A configured level suppresses everything below it.
const LOG_LEVELS = { FINEST: 0, INFO: 1, OK: 1, SKIP: 1, WARN: 2, ERROR: 3 };

function isLevelEnabled(messageLevel, configuredLevel) {
  const msgPriority = LOG_LEVELS[messageLevel.toUpperCase()] ?? 1;
  const cfgPriority = LOG_LEVELS[(configuredLevel || "info").toUpperCase()] ?? 1;
  return msgPriority >= cfgPriority;
}

// ---- Config File ----

async function getFileConfig() {
  const url = chrome.runtime.getURL("config.json");
  const resp = await fetch(url);
  if (!resp.ok) throw new Error("Could not read config.json from extension package.");
  const cfg = await resp.json();
  if (!cfg.domain)                           throw new Error("'domain' is not set in config.json.");
  if (!cfg.apiVersion)                       throw new Error("'apiVersion' is not set in config.json (e.g. \"v60.0\").");
  if (!Number.isInteger(cfg.maxRecords) || cfg.maxRecords < 1)
    throw new Error("'maxRecords' must be a positive integer in config.json.");
  if (!cfg.object)         throw new Error("'object' is not set in config.json.");
  if (!cfg.ownerFieldName) throw new Error("'ownerFieldName' is not set in config.json. Updates are blocked until this is configured.");
  if (!cfg.dailyScheduler?.filters?.conditions?.length)
    throw new Error("'dailyScheduler.filters.conditions' must be a non-empty array in config.json.");
  if (cfg.dailyScheduler.filters.conditions.length > 1 && !cfg.dailyScheduler.filters.logic)
    throw new Error("'dailyScheduler.filters.logic' is required when more than one condition is defined.");
  if (!Array.isArray(cfg.dailyScheduler?.updateFields) || cfg.dailyScheduler.updateFields.length === 0)
    throw new Error("'dailyScheduler.updateFields' must be a non-empty array in config.json.");
  return cfg;
}

// ---- SOQL Builder ----

function conditionToSql(c) {
  const op = c.operator.toUpperCase();
  if (op === "IN" || op === "NOT IN") {
    const list = (Array.isArray(c.value) ? c.value : [c.value])
      .map((v) => `'${v}'`).join(", ");
    return `${c.field} ${op} (${list})`;
  }
  const val = typeof c.value === "string" ? `'${c.value}'` : c.value;
  return `${c.field} ${c.operator} ${val}`;
}

function buildWhereClause(filters) {
  const { conditions, logic } = filters;
  if (!logic) return conditionToSql(conditions[0]);
  return logic.replace(/\b(\d+)\b/g, (_, num) => {
    const idx = parseInt(num, 10) - 1;
    if (idx < 0 || idx >= conditions.length)
      throw new Error(`Logic expression references condition ${num} but only ${conditions.length} condition(s) are defined.`);
    return conditionToSql(conditions[idx]);
  });
}

// ---- Current User ----

async function getUserInfo(session) {
  const resp = await fetch(`${session.instanceUrl}/services/oauth2/userinfo`, {
    headers: { Authorization: `Bearer ${session.sid}` },
  });
  if (!resp.ok) throw new Error(`Could not fetch current user info (HTTP ${resp.status}).`);
  const info = await resp.json();
  if (!info.user_id) throw new Error("user_id missing in userinfo response.");
  return info;
}

async function getCurrentUserId(session) {
  const info = await getUserInfo(session);
  return info.user_id;
}

// ---- Alarm Lifecycle ----

chrome.runtime.onInstalled.addListener(() => {
  console.log("[Architect Cadence] Extension installed.");
  rescheduleAlarm();
});

chrome.runtime.onStartup.addListener(() => {
  console.log("[Architect Cadence] Browser started.");
  rescheduleAlarm();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) {
    console.log("[Architect Cadence] Alarm fired at", new Date().toISOString());
    await executeScheduledUpdate();
  } else if (alarm.name.startsWith("oncall-")) {
    const recordId = alarm.name.slice("oncall-".length);
    await autoRevertCall(recordId);
  }
});

// ---- Message Handler (popup ↔ background) ----

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const handlers = {
    testConnection: () => handleTestConnection(),
    runNow: () => handleRunNow(),
    saveConfig: () => handleSaveConfig(msg.config),
    getConfig: () => handleGetConfig(),
    getLogs: () => handleGetLogs(),
    clearLogs: () => handleClearLogs(),
    getSession: () => handleGetSession(),
    getEngagements: () => handleGetEngagements(msg.force),
    onCall: () => handleOnCall(msg.recordId, msg.duration, msg.callType),
    callCompleted: () => handleCallCompleted(msg.recordId),
    getEngagementLogs: () => handleGetEngagementLogs(),
    clearEngagementLogs: () => handleClearEngagementLogs(),
  };

  const handler = handlers[msg.action];
  if (handler) {
    handler().then(sendResponse).catch((err) => {
      sendResponse({ success: false, error: err.message || String(err) });
    });
    return true; // keep message channel open
  }
});

// ---- Handler Implementations ----

async function handleGetSession() {
  try {
    const { domain } = await getFileConfig();
    const session = await getSalesforceSession(domain);
    if (!session) return { success: true, hasSession: false };
    const info = await getUserInfo(session);
    const userName = info.name || info.display_name || info.preferred_username || info.user_id;
    return { success: true, hasSession: true, userName, userId: info.user_id };
  } catch {
    return { success: true, hasSession: false };
  }
}

function parseDurationToMinutes(duration) {
  if (duration.endsWith("s")) return parseInt(duration) / 60;
  if (duration.endsWith("h")) return parseInt(duration) * 60;
  return parseInt(duration); // assume minutes
}

function resolvePlaceholders(value, context) {
  if (typeof value !== "string") return value;
  return value.replace(/\{(\w+)\}/g, (_, key) => context[key] ?? "");
}

async function handleCallCompleted(recordId) {
  try {
    const cfg = await getFileConfig();
    const session = await getSalesforceSession(cfg.domain);
    if (!session) {
      await addEngagementLog("ERROR", `Call Completed failed — no Salesforce session for [${recordId}]`);
      throw new Error("No Salesforce session. Please log in.");
    }

    const action = cfg.engagementsView?.callCompletedAction;
    if (!action) throw new Error("'engagementsView.callCompletedAction' is not configured.");

    const updateBody = {};
    for (const uf of action.updateFields || []) {
      updateBody[uf.field] = uf.value;
    }
    const updateLines = Object.entries(updateBody).map(([k, v]) => `  ${k} → "${v}"`).join("\n");
    await addEngagementLog("INFO", `PATCH ${cfg.object} [${recordId}] — Call Completed (manual)\n${updateLines}`);
    await sfApiCall(session, `/services/data/${cfg.apiVersion}/sobjects/${cfg.object}/${recordId}`, "PATCH", updateBody);
    await addEngagementLog("OK", `PATCH ${cfg.object} [${recordId}] — updated successfully`);

    // Cancel pending auto-revert alarm
    await chrome.alarms.clear(`oncall-${recordId}`);

    // Remove from pending calls
    const pendingData = await chrome.storage.local.get(PENDING_CALLS_KEY);
    const pending = pendingData[PENDING_CALLS_KEY] || {};
    delete pending[recordId];
    await chrome.storage.local.set({ [PENDING_CALLS_KEY]: pending });

    await chrome.storage.local.remove(ENGAGEMENTS_CACHE_KEY);
    return { success: true };
  } catch (err) {
    await addEngagementLog("ERROR", `Call Completed failed for [${recordId}]: ${err.message}`);
    throw err;
  }
}

async function autoRevertCall(recordId) {
  try {
    const cfg = await getFileConfig();
    const session = await getSalesforceSession(cfg.domain);
    if (!session) {
      await addEngagementLog("WARN", `Auto-revert skipped — no session for [${recordId}]`);
      return;
    }

    const action = cfg.engagementsView?.callCompletedAction;
    if (!action) return;

    const updateBody = {};
    for (const uf of action.updateFields || []) {
      updateBody[uf.field] = uf.value;
    }
    const updateLines = Object.entries(updateBody).map(([k, v]) => `  ${k} → "${v}"`).join("\n");
    await addEngagementLog("INFO", `PATCH ${cfg.object} [${recordId}] — Auto-revert (timer expired)\n${updateLines}`);
    await sfApiCall(session, `/services/data/${cfg.apiVersion}/sobjects/${cfg.object}/${recordId}`, "PATCH", updateBody);
    await addEngagementLog("OK", `PATCH ${cfg.object} [${recordId}] — auto-reverted successfully`);

    // Clean up pending entry
    const pendingData = await chrome.storage.local.get(PENDING_CALLS_KEY);
    const pending = pendingData[PENDING_CALLS_KEY] || {};
    delete pending[recordId];
    await chrome.storage.local.set({ [PENDING_CALLS_KEY]: pending });

    await chrome.storage.local.remove(ENGAGEMENTS_CACHE_KEY);
  } catch (err) {
    await addEngagementLog("ERROR", `Auto-revert failed for [${recordId}]: ${err.message}`);
  }
}

async function handleOnCall(recordId, duration, callType) {
  try {
    const cfg = await getFileConfig();
    const session = await getSalesforceSession(cfg.domain);
    if (!session) {
      await addEngagementLog("ERROR", `On Call failed — no Salesforce session for [${recordId}]`);
      throw new Error("No Salesforce session. Please log in.");
    }

    const action = callType === "Customer"
      ? cfg.engagementsView?.customerCallAction
      : cfg.engagementsView?.internalCallAction;
    if (!action) throw new Error(`'engagementsView.${callType === "Customer" ? "customerCallAction" : "internalCallAction"}' is not configured.`);

    const context = { recordId, duration: String(duration), callType };

    // Update the engagement record
    const updateBody = {};
    for (const uf of action.updateFields || []) {
      updateBody[uf.field] = resolvePlaceholders(uf.value, context);
    }
    const updateLines = Object.entries(updateBody).map(([k, v]) => `  ${k} → "${v}"`).join("\n");
    await addEngagementLog("INFO", `PATCH ${cfg.object} [${recordId}] — ${callType} Call (${duration})\n${updateLines}`);
    await sfApiCall(session, `/services/data/${cfg.apiVersion}/sobjects/${cfg.object}/${recordId}`, "PATCH", updateBody);
    await addEngagementLog("OK", `PATCH ${cfg.object} [${recordId}] — updated successfully`);

    // Create associated records
    for (const rec of action.createRecords || []) {
      const createBody = {};
      for (const f of rec.fields || []) {
        createBody[f.field] = resolvePlaceholders(f.value, context);
      }
      const createLines = Object.entries(createBody).map(([k, v]) => `  ${k}: "${v}"`).join("\n");
      await addEngagementLog("INFO", `POST ${rec.object} — creating activity for [${recordId}]\n${createLines}`);
      try {
        const result = await sfApiCall(session, `/services/data/${cfg.apiVersion}/sobjects/${rec.object}`, "POST", createBody);
        await addEngagementLog("OK", `POST ${rec.object} — created successfully (id: ${result.id || "?"})`);
      } catch (err) {
        await addEngagementLog("ERROR", `POST ${rec.object} failed for [${recordId}]: ${err.message}`);
      }
    }

    // Schedule auto-revert alarm
    const alarmName = `oncall-${recordId}`;
    const delayInMinutes = parseDurationToMinutes(duration);
    await chrome.alarms.clear(alarmName);
    await chrome.alarms.create(alarmName, { delayInMinutes });

    // Store pending call so it can be cancelled on manual Call Completed
    const pendingData = await chrome.storage.local.get(PENDING_CALLS_KEY);
    const pending = pendingData[PENDING_CALLS_KEY] || {};
    pending[recordId] = { callType, duration, scheduledAt: Date.now(), revertAt: Date.now() + delayInMinutes * 60000 };
    await chrome.storage.local.set({ [PENDING_CALLS_KEY]: pending });

    await addEngagementLog("INFO", `Auto-revert timer set — [${recordId}] will revert in ${duration}`);

    // Invalidate engagements cache
    await chrome.storage.local.remove(ENGAGEMENTS_CACHE_KEY);

    return { success: true };
  } catch (err) {
    await addEngagementLog("ERROR", `On Call failed for [${recordId}]: ${err.message}`);
    throw err;
  }
}

async function handleGetEngagements(force = false) {
  try {
    const cfg = await getFileConfig();
    const session = await getSalesforceSession(cfg.domain);
    if (!session) return { success: true, hasSession: false, records: [] };

    if (!force) {
      const cached = (await chrome.storage.local.get(ENGAGEMENTS_CACHE_KEY))[ENGAGEMENTS_CACHE_KEY];
      if (cached && (Date.now() - cached.ts) < ENGAGEMENTS_CACHE_TTL_MS) {
        const age = Math.round((Date.now() - cached.ts) / 1000);
        await addEngagementLog("INFO", `Cache hit — ${cached.records.length} engagement(s) served from cache (${age}s old)`);
        return { success: true, hasSession: true, records: cached.records, view: cached.view, scheduledStatus: cached.scheduledStatus || "", durations: cached.durations || [], fromCache: true };
      }
    }

    const info = await getUserInfo(session);
    const userId = info.user_id;
    const userName = info.name || info.preferred_username || userId;
    await addEngagementLog("INFO", `Session established — ${userName} (${userId})`);

    const viewCfg = cfg.engagementsView || {};
    const nameField   = viewCfg.nameField   || "Name";
    const titleField  = viewCfg.titleField  || "Name";
    const statusField = viewCfg.statusField || "Engagement_Status__c";
    const stageField  = viewCfg.stageField  || "Stage__c";

    const fields = [...new Set(["Id", nameField, titleField, statusField, stageField])];
    const extraWhere = viewCfg.filters?.conditions?.length
      ? ` AND ${buildWhereClause(viewCfg.filters)}`
      : "";
    const soql = `SELECT ${fields.join(", ")} FROM ${cfg.object} WHERE ${cfg.ownerFieldName} = '${userId}'${extraWhere} ORDER BY Name LIMIT 50`;

    await addEngagementLog("INFO", `Querying ${cfg.object}: ${soql}`);

    let result;
    try {
      result = await sfApiCall(session, `/services/data/${cfg.apiVersion}/query?q=${encodeURIComponent(soql)}`);
    } catch (err) {
      await addEngagementLog("ERROR", `Query failed — ${err.message}`);
      throw err;
    }

    const records = result.records || [];
    const scheduledStatus = cfg.engagementsView?.customerCallAction?.updateFields?.[0]?.value || "";
    const durations = cfg.engagementsView?.callDurations || [];
    const view = { nameField, titleField, statusField, stageField };
    await chrome.storage.local.set({ [ENGAGEMENTS_CACHE_KEY]: { ts: Date.now(), records, view, scheduledStatus, durations } });
    await addEngagementLog("INFO", `DB pull — ${records.length} engagement(s) fetched from Salesforce`);
    return { success: true, hasSession: true, records, view, scheduledStatus, durations };
  } catch (err) {
    await addEngagementLog("ERROR", `Engagements load failed — ${err.message}`);
    return { success: false, hasSession: false, error: err.message, records: [] };
  }
}

async function handleTestConnection() {
  const { domain, apiVersion } = await getFileConfig();
  const session = await getSalesforceSession(domain);
  if (!session) {
    return { success: false, error: "No Salesforce session cookie found for this domain." };
  }
  const userInfo = await sfApiCall(session, `/services/data/${apiVersion}/`);
  return { success: true, userInfo };
}

async function handleRunNow() {
  await executeScheduledUpdate();
  return { success: true };
}

async function handleSaveConfig(config) {
  await chrome.storage.local.set({ [STORAGE_KEY]: config });
  await rescheduleAlarm();
  return { success: true };
}

async function handleGetConfig() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  const config = data[STORAGE_KEY] || {};
  if (!config.scheduledTime || config.scheduledTime === "09:00") {
    config.scheduledTime = "17:00";
  }
  if (config.isActive === undefined) config.isActive = true;
  return { success: true, config };
}

async function handleGetLogs() {
  const data = await chrome.storage.local.get(LOG_KEY);
  return { success: true, logs: data[LOG_KEY] || [] };
}

async function handleClearLogs() {
  await chrome.storage.local.set({ [LOG_KEY]: [] });
  return { success: true };
}

// ---- Core: Scheduled Update Execution ----

async function executeScheduledUpdate() {
  const storedData = await chrome.storage.local.get(STORAGE_KEY);
  const isActive = storedData[STORAGE_KEY]?.isActive !== false;

  const { domain, apiVersion, maxRecords, logLevel, object: objectName, ownerFieldName, dailyScheduler } = await getFileConfig();
  const { filters, updateFields } = dailyScheduler;
  const log = (level, message) =>
    isLevelEnabled(level, logLevel) ? addLog(level, message) : Promise.resolve();

  try {
    // Step 1: Get session
    const session = await getSalesforceSession(domain);
    if (!session) {
      throw new Error("No Salesforce session cookie. Please log in to Salesforce.");
    }

    // Step 2: Get current session user and enforce owner filter
    const userInfo = await getUserInfo(session);
    const currentUserId = userInfo.user_id;
    const currentUserName = userInfo.name || userInfo.preferred_username || currentUserId;
    await log("FINEST", `Session user: ${currentUserName} (${currentUserId})`);

    const whereClause = buildWhereClause(filters);
    const soqlQuery = `SELECT Id FROM ${objectName} WHERE ${whereClause} AND ${ownerFieldName} = '${currentUserId}'`;

    await log("INFO", `Starting update on ${objectName}...`);
    await log("INFO", `SOQL: ${soqlQuery}`);

    // Step 3: Check object-level update permission
    await log("INFO", `Fetching describe for ${objectName}...`);
    let describe;
    try {
      describe = await sfApiCall(session, `/services/data/${apiVersion}/sobjects/${objectName}/describe`);
    } catch (err) {
      throw new Error(`Describe failed for ${objectName}: ${err.message}`);
    }
    if (!describe.updateable) {
      throw new Error(`You do not have update permission on ${objectName}.`);
    }
    await log("INFO", `Permission check passed for ${objectName}.`);

    // Step 4: Check field-level update permissions
    const fieldMap = new Map(describe.fields.map((f) => [f.name, f]));
    for (const uf of updateFields) {
      const meta = fieldMap.get(uf.field);
      if (!meta) {
        throw new Error(`Field "${uf.field}" does not exist on ${objectName}.`);
      }
      if (!meta.updateable) {
        throw new Error(`You do not have update permission on field "${uf.field}".`);
      }
    }
    await log("INFO", `Field-level permissions verified for: ${updateFields.map(f => f.field).join(", ")}`);

    // Step 5: Query all records (handles pagination)
    const records = [];
    let queryResult = await sfApiCall(session, `/services/data/${apiVersion}/query?q=${encodeURIComponent(soqlQuery)}`);
    records.push(...(queryResult.records || []));
    while (!queryResult.done && queryResult.nextRecordsUrl) {
      queryResult = await sfApiCall(session, queryResult.nextRecordsUrl);
      records.push(...(queryResult.records || []));
    }

    if (records.length === 0) {
      await log("INFO", `No records matched the SOQL query on ${objectName}. Nothing to update.`);
      notify("Salesforce Update", `No records matched the SOQL query on ${objectName}.`);
      return;
    }

    if (records.length > maxRecords) {
      await log("ERROR", `Query returned ${records.length} records — exceeds the maxRecords safety limit of ${maxRecords}. Update aborted. Refine your filters or increase maxRecords in config.json.`);
      notify("Salesforce Update Aborted", `Query returned ${records.length} records, limit is ${maxRecords}.`);
      return;
    }

    await log("INFO", `Found ${records.length} record(s).`);

    // Step 6: Update records (skipped when inactive)
    if (!isActive) {
      await log("SKIP", `Updates are deactivated. ${records.length} record(s) matched the query — no changes were made.`);
      notify("Architect Cadence (Inactive)", `${records.length} record(s) matched. Updates skipped.`);
      return;
    }

    const updateBody = {};
    for (const uf of updateFields) {
      updateBody[uf.field] = castValue(uf.value, fieldMap.get(uf.field).type);
    }

    let successCount = 0;
    let failCount = 0;
    const errors = [];
    const updatedIds = [];

    const updateLines = Object.entries(updateBody).map(([k, v]) => `  ${k} → "${v}"`).join("\n");
    await log("INFO", `Updating ${records.length} record(s) with:\n${updateLines}`);

    for (const record of records) {
      try {
        await sfApiCall(
          session,
          `/services/data/${apiVersion}/sobjects/${objectName}/${record.Id}`,
          "PATCH",
          updateBody
        );
        successCount++;
        updatedIds.push(record.Id);
        await log("INFO", `  ✓ PATCH ${objectName} [${record.Id}] — updated successfully`);
      } catch (err) {
        failCount++;
        errors.push(`${record.Id}: ${err.message}`);
        await log("ERROR", `  ✗ Failed [${record.Id}]: ${err.message}`);
      }
    }

    const summary = failCount > 0
      ? `Update complete — ${successCount} of ${records.length} records updated. ${failCount} failed.`
      : `Update complete — ${successCount} of ${records.length} records updated successfully.`;
    await log(failCount > 0 ? "WARN" : "OK", summary);
    if (errors.length > 0) {
      await log("ERROR", `Failed records:\n${errors.join("\n")}`);
    }
    notify("Salesforce Update Complete", summary);
  } catch (err) {
    await addLog("ERROR", err.message);
    notify("Salesforce Update Failed", err.message);
  }

  await chrome.storage.local.remove(ENGAGEMENTS_CACHE_KEY);
}

// ---- Salesforce Helpers ----

async function getSalesforceSession(domain) {
  // Try the exact domain first
  let cookie = await chrome.cookies.get({ url: `https://${domain}`, name: "sid" });
  if (cookie) return { sid: cookie.value, instanceUrl: `https://${domain}` };

  // Fallback: search all sid cookies and pick the first matching one
  const allCookies = await chrome.cookies.getAll({ name: "sid" });
  for (const c of allCookies) {
    if (c.domain.includes("salesforce.com") || c.domain.includes("force.com")) {
      const host = c.domain.startsWith(".") ? c.domain.slice(1) : c.domain;
      return { sid: c.value, instanceUrl: `https://${host}` };
    }
  }
  return null;
}

async function sfApiCall(session, path, method = "GET", body = null) {
  const url = `${session.instanceUrl}${path}`;
  const opts = {
    method,
    headers: {
      Authorization: `Bearer ${session.sid}`,
      "Content-Type": "application/json",
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const resp = await fetch(url, opts);

  // PATCH 204 No Content = success with no body
  if (resp.status === 204) return { success: true };

  const json = await resp.json();

  if (!resp.ok) {
    const errMsg = Array.isArray(json) ? json.map((e) => e.message).join("; ") : json.message || resp.statusText;
    throw new Error(`SF API ${resp.status}: ${errMsg}`);
  }
  return json;
}

function castValue(rawValue, sfType) {
  if (rawValue === "" || rawValue === null || rawValue === undefined) return null;
  switch (sfType) {
    case "boolean":
      return rawValue === "true" || rawValue === true;
    case "int":
    case "integer":
      return parseInt(rawValue, 10);
    case "double":
    case "currency":
    case "percent":
      return parseFloat(rawValue);
    default:
      return rawValue;
  }
}

// ---- Alarm Scheduling ----

async function rescheduleAlarm() {
  await chrome.alarms.clear(ALARM_NAME);

  const data = await chrome.storage.local.get(STORAGE_KEY);
  const scheduledTime = data[STORAGE_KEY]?.scheduledTime || "17:00";

  const [hours, minutes] = scheduledTime.split(":").map(Number);
  const now = new Date();
  let next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0);

  // If today's time has already passed, schedule for tomorrow
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }

  const delayInMinutes = (next.getTime() - now.getTime()) / 60000;

  chrome.alarms.create(ALARM_NAME, {
    delayInMinutes,
    periodInMinutes: 24 * 60, // repeat every 24 hours
  });

  console.log(`[Architect Cadence] Alarm scheduled. Next fire: ${next.toLocaleString()} (in ${Math.round(delayInMinutes)} min)`);
}

// ---- Logging ----

async function addLog(level, message) {
  const data = await chrome.storage.local.get(LOG_KEY);
  const logs = data[LOG_KEY] || [];
  logs.unshift({ ts: new Date().toISOString(), level, message });
  if (logs.length > MAX_LOGS) logs.length = MAX_LOGS;
  await chrome.storage.local.set({ [LOG_KEY]: logs });
}

async function addEngagementLog(level, message) {
  const data = await chrome.storage.local.get(ENGAGEMENT_LOG_KEY);
  const logs = data[ENGAGEMENT_LOG_KEY] || [];
  logs.unshift({ ts: new Date().toISOString(), level, message });
  if (logs.length > MAX_LOGS) logs.length = MAX_LOGS;
  await chrome.storage.local.set({ [ENGAGEMENT_LOG_KEY]: logs });
}

async function handleGetEngagementLogs() {
  const data = await chrome.storage.local.get(ENGAGEMENT_LOG_KEY);
  return { success: true, logs: data[ENGAGEMENT_LOG_KEY] || [] };
}

async function handleClearEngagementLogs() {
  await chrome.storage.local.set({ [ENGAGEMENT_LOG_KEY]: [] });
  return { success: true };
}

// ---- Notifications ----

function notify(title, message) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon128.png",
    title,
    message,
  });
}
