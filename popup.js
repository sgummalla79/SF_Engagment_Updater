// ============================================================
// Popup UI Logic
// ============================================================

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ---- Tab Switching ----
$$(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    $$(".tab-btn").forEach((b) => b.classList.remove("active"));
    $$(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    $(`#tab-${btn.dataset.tab}`).classList.add("active");

    if (btn.dataset.tab === "logs") loadLogs();
  });
});

// ---- Status Helpers ----
function showStatus(el, type, msg) {
  el.textContent = msg;
  el.className = `status-bar show ${type}`;
}
function clearStatus(el) {
  el.className = "status-bar";
}

// ---- Send message to background ----
function sendMsg(payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(payload, (resp) => resolve(resp));
  });
}

// ---- Load Config on Open ----
document.addEventListener("DOMContentLoaded", async () => {
  const resp = await sendMsg({ action: "getConfig" });
  if (resp?.config) populateForm(resp.config);
});

function populateForm(c) {
  $("#scheduledTime").value = c.scheduledTime || "09:00";
}

// ---- Gather Config from Form ----
function gatherConfig() {
  return {
    scheduledTime: $("#scheduledTime").value,
  };
}

// ---- Save ----
$("#btnSave").addEventListener("click", async () => {
  const config = gatherConfig();
  const resp = await sendMsg({ action: "saveConfig", config });
  showStatus(
    $("#statusBar"),
    resp.success ? "ok" : "error",
    resp.success ? `Saved! Next run scheduled at ${config.scheduledTime} daily.` : resp.error
  );
});

// ---- Test Connection ----
$("#btnTest").addEventListener("click", async () => {
  showStatus($("#statusBar"), "info", "Testing connection...");
  const resp = await sendMsg({ action: "testConnection" });
  showStatus(
    $("#statusBar"),
    resp.success ? "ok" : "error",
    resp.success ? "Connection successful! Session is valid." : resp.error
  );
});

// ---- Run Now ----
$("#btnRunNow").addEventListener("click", async () => {
  // Auto-save first
  const config = gatherConfig();
  await sendMsg({ action: "saveConfig", config });
  showStatus($("#statusBar"), "info", "Running update now...");
  const resp = await sendMsg({ action: "runNow" });
  showStatus(
    $("#statusBar"),
    resp.success ? "ok" : "error",
    resp.success ? "Run complete. Check the Logs tab for details." : resp.error
  );
});

// ---- Logs ----
async function loadLogs() {
  const resp = await sendMsg({ action: "getLogs" });
  const list = $("#logList");
  const logs = resp?.logs || [];

  if (logs.length === 0) {
    list.innerHTML = '<div class="empty-msg">No logs yet.</div>';
    return;
  }

  list.innerHTML = logs
    .map((l) => {
      const ts = new Date(l.ts).toLocaleString();
      return `<div class="log-entry">
        <span class="log-ts">${ts}</span>
        <span class="log-level ${l.level}">${l.level}</span>
        <span class="log-msg">${escHtml(l.message)}</span>
      </div>`;
    })
    .join("");
}

$("#btnClearLogs").addEventListener("click", async () => {
  await sendMsg({ action: "clearLogs" });
  loadLogs();
});

function escHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
