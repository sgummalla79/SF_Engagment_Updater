// ============================================================
// Salesforce Scheduled Updater — Background Service Worker
// ============================================================

// ---- Constants ----
const ALARM_NAME = "sf-daily-update";
const STORAGE_KEY = "sf_updater_config";
const LOG_KEY = "sf_updater_logs";
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
  if (!cfg.domain)   throw new Error("'domain' is not set in config.json.");
  if (!cfg.object)   throw new Error("'object' is not set in config.json.");
  if (!cfg.filters?.conditions?.length) throw new Error("'filters.conditions' must be a non-empty array in config.json.");
  if (!cfg.filters?.logic)              throw new Error("'filters.logic' is not set in config.json.");
  if (!Array.isArray(cfg.updateFields) || cfg.updateFields.length === 0)
    throw new Error("'updateFields' must be a non-empty array in config.json.");
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
  return logic.replace(/\b(\d+)\b/g, (_, num) => {
    const idx = parseInt(num, 10) - 1;
    if (idx < 0 || idx >= conditions.length)
      throw new Error(`Logic expression references condition ${num} but only ${conditions.length} condition(s) are defined.`);
    return conditionToSql(conditions[idx]);
  });
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

async function handleTestConnection() {
  const { domain } = await getFileConfig();
  const session = await getSalesforceSession(domain);
  if (!session) {
    return { success: false, error: "No Salesforce session cookie found for this domain." };
  }
  const userInfo = await sfApiCall(session, "/services/data/v60.0/");
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
  const { domain, logLevel, object: objectName, filters, updateFields } = await getFileConfig();
  const log = (level, message) =>
    isLevelEnabled(level, logLevel) ? addLog(level, message) : Promise.resolve();

  const whereClause = buildWhereClause(filters);
  const soqlQuery = `SELECT Id FROM ${objectName} WHERE ${whereClause}`;

  try {
    // Step 1: Get session
    const session = await getSalesforceSession(domain);
    if (!session) {
      throw new Error("No Salesforce session cookie. Please log in to Salesforce.");
    }

    await log("INFO",   `Starting update on ${objectName}...`);
    await log("FINEST", `SOQL: ${soqlQuery}`);

    // Step 2: Check object-level update permission
    const describe = await sfApiCall(session, `/services/data/v60.0/sobjects/${objectName}/describe`);
    if (!describe.updateable) {
      throw new Error(`You do not have update permission on ${objectName}.`);
    }

    // Step 3: Check field-level update permissions
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

    // Step 4: Query all records (handles pagination)
    const records = [];
    let queryResult = await sfApiCall(session, `/services/data/v60.0/query?q=${encodeURIComponent(soqlQuery)}`);
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

    if (records.length > 15) {
      await log("ERROR", `Query returned ${records.length} records — exceeds the 15-record safety limit. Update aborted. Refine your SOQL query and try again.`);
      notify("Salesforce Update Aborted", `Query returned ${records.length} records, limit is 15.`);
      return;
    }

    await log("INFO", `Found ${records.length} record(s) to update.`);

    // Step 5: Build the update payload per record and send PATCH requests
    const updateBody = {};
    for (const uf of updateFields) {
      updateBody[uf.field] = castValue(uf.value, fieldMap.get(uf.field).type);
    }

    let successCount = 0;
    let failCount = 0;
    const errors = [];

    const updatedIds = [];
    for (const record of records) {
      try {
        await sfApiCall(
          session,
          `/services/data/v60.0/sobjects/${objectName}/${record.Id}`,
          "PATCH",
          updateBody
        );
        successCount++;
        updatedIds.push(record.Id);
      } catch (err) {
        failCount++;
        errors.push(`${record.Id}: ${err.message}`);
      }
    }

    if (updatedIds.length > 0) {
      await log("FINEST", `Updated record IDs:\n${updatedIds.join("\n")}`);
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

// ---- Notifications ----

function notify(title, message) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon128.png",
    title,
    message,
  });
}
