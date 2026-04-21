// ============================================================
// Popup UI Logic
// ============================================================

const $ = (sel) => document.querySelector(sel);

// ---- Toast ----
let toastTimer;
function showToast(type, msg) {
  const toast = $("#toast");
  const colors = { ok: ["#0a2e1f", "#3dd68c"], error: ["#2e0f12", "#f05e6b"], info: ["#0d1f3c", "#4f8ff7"] };
  const [bg, color] = colors[type] || colors.info;
  toast.style.background = bg;
  toast.style.color = color;
  toast.textContent = msg;
  toast.style.display = "block";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.style.display = "none"; }, 3000);
}

// ---- Send message to background ----
function sendMsg(payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(payload, (resp) => resolve(resp));
  });
}

// ---- Theme ----
function applyTheme(isLight) {
  document.documentElement.classList.toggle("light", isLight);
  $("#btnTheme").textContent = isLight ? "🌕" : "🌙";
}

$("#btnTheme").addEventListener("click", async () => {
  const isLight = !document.documentElement.classList.contains("light");
  applyTheme(isLight);
  await sendMsg({ action: "saveConfig", config: { scheduledTime: $("#scheduledTime").value, isActive: $("#btnToggle").classList.contains("active"), theme: isLight ? "light" : "dark" } });
});

// ---- Toggle ----
function applyToggleState(isActive) {
  const btn = $("#btnToggle");
  if (isActive) {
    btn.textContent = "● Active";
    btn.className = "btn btn-toggle active";
  } else {
    btn.textContent = "○ Inactive";
    btn.className = "btn btn-toggle inactive";
  }
}

$("#btnToggle").addEventListener("click", async () => {
  const isActive = $("#btnToggle").classList.contains("inactive");
  applyToggleState(isActive);
  const config = { scheduledTime: $("#scheduledTime").value, isActive };
  await sendMsg({ action: "saveConfig", config });
  showToast("info", isActive ? "Updates activated." : "Updates deactivated — SOQL will still run.");
});

// ---- Tabs ----
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
    if (btn.dataset.tab === "engagements") loadEngagements();
  });
});

// ---- Session User ----
async function loadSessionUser() {
  const resp = await sendMsg({ action: "getSession" });
  const el = $("#sessionUser");
  if (resp?.hasSession && resp.userName) {
    el.textContent = resp.userName;
    el.classList.remove("no-session");
  } else {
    el.textContent = "Not signed in";
    el.classList.add("no-session");
  }
}

// ---- Engagements ----
async function loadEngagements(force = false) {
  const list = $("#engList");
  if (force) list.innerHTML = '<div class="eng-loading">Loading engagements…</div>';

  const resp = await sendMsg({ action: "getEngagements", force });

  if (!resp?.hasSession) {
    list.innerHTML = '<div class="empty-msg">No Engagements</div>';
    return;
  }
  if (!resp.success) {
    list.innerHTML = `<div class="empty-msg">Error: ${escHtml(resp.error || "Unknown error")}</div>`;
    return;
  }
  if (!resp.records.length) {
    list.innerHTML = '<div class="empty-msg">No Engagements</div>';
    return;
  }

  const { nameField, titleField, statusField, stageField } = resp.view;
  const durations = resp.durations?.length ? resp.durations : ["30s","1m","5m","15m","30m","45m","1h"];

  const scheduledStatus = resp.scheduledStatus || "";

  list.innerHTML = resp.records.map((r) => {
    const name   = escHtml(r[nameField]   || "—");
    const title  = escHtml(r[titleField]  || "—");
    const status = escHtml(r[statusField] || "—");
    const stage  = escHtml(r[stageField]  || "—");
    const titlePart = nameField !== titleField ? ` — <span class="eng-title">${title}</span>` : "";
    const opts = durations.map((d) => `<option value="${d}">${d}</option>`).join("");
    const isScheduled = (r[statusField] || "") === scheduledStatus;
    const line3 = isScheduled
      ? `<span class="eng-scheduled-label">✓ Scheduled</span>
         <button class="btn-call-completed"><svg width="12" height="12" viewBox="0 0 24 24" fill="white" style="transform:rotate(135deg);vertical-align:middle;margin-right:3px"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.27-.27.68-.35 1.04-.2 1.1.4 2.3.6 3.6.6.55 0 1 .45 1 1V20c0 .55-.45 1-1 1C9.61 21 3 14.39 3 6c0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.3.2 2.5.6 3.6.14.36.06.77-.2 1.04L6.6 10.8z"/></svg> Call Completed</button>`
      : `<button class="btn-call internal" data-type="Internal"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:middle;margin-right:3px"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.27-.27.68-.35 1.04-.2 1.1.4 2.3.6 3.6.6.55 0 1 .45 1 1V20c0 .55-.45 1-1 1C9.61 21 3 14.39 3 6c0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.3.2 2.5.6 3.6.14.36.06.77-.2 1.04L6.6 10.8z"/></svg> Internal Call</button>
         <button class="btn-call customer" data-type="Customer"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:middle;margin-right:3px"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.27-.27.68-.35 1.04-.2 1.1.4 2.3.6 3.6.6.55 0 1 .45 1 1V20c0 .55-.45 1-1 1C9.61 21 3 14.39 3 6c0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.3.2 2.5.6 3.6.14.36.06.77-.2 1.04L6.6 10.8z"/></svg> Customer Call</button>
         <select class="eng-duration">${opts}</select>`;
    return `<div class="eng-card${isScheduled ? " scheduled" : ""}" data-id="${r.Id}">
      <div class="eng-line1">${name}${titlePart}</div>
      <div class="eng-line2">
        <span class="eng-badge stage">${stage}</span>
        <span class="eng-badge status">${status}</span>
      </div>
      <div class="eng-line3">${line3}</div>
    </div>`;
  }).join("");

  // Event delegation for Call Completed button
  list.querySelectorAll(".btn-call-completed").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const card = btn.closest(".eng-card");
      btn.disabled = true;
      const resp = await sendMsg({ action: "callCompleted", recordId: card.dataset.id });
      if (resp?.success) {
        loadEngagements(true);
        loadLogs();
      } else {
        showToast("error", resp?.error || "Call Completed action failed.");
        btn.disabled = false;
      }
    });
  });

  // Event delegation for Internal / Customer buttons
  list.querySelectorAll(".btn-call").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const card = btn.closest(".eng-card");
      const recordId = card.dataset.id;
      const duration = card.querySelector(".eng-duration")?.value || "15";
      const callType = btn.dataset.type;
      btn.disabled = true;
      card.querySelector(".btn-call.internal").disabled = true;
      card.querySelector(".btn-call.customer").disabled = true;
      const resp = await sendMsg({ action: "onCall", recordId, duration, callType });
      if (resp?.success) {
        loadEngagements(true);
        loadLogs();
      } else {
        showToast("error", resp?.error || "On Call action failed.");
        card.querySelectorAll(".btn-call").forEach((b) => { b.disabled = false; });
      }
    });
  });
}

// ---- Init ----
document.addEventListener("DOMContentLoaded", async () => {
  const resp = await sendMsg({ action: "getConfig" });
  if (resp?.config) {
    $("#scheduledTime").value = resp.config.scheduledTime || "17:00";
    applyToggleState(resp.config.isActive !== false);
    applyTheme(resp.config.theme === "light");
  }
  loadLogs();
  loadSessionUser();
  loadEngagements();
});

// ---- Auto-save on time change ----
$("#scheduledTime").addEventListener("change", async () => {
  const config = { scheduledTime: $("#scheduledTime").value, isActive: $("#btnToggle").classList.contains("active") };
  const resp = await sendMsg({ action: "saveConfig", config });
  showToast(
    resp.success ? "ok" : "error",
    resp.success ? `Scheduled time saved — daily run at ${config.scheduledTime}.` : resp.error
  );
});

// ---- Open Config ----
$("#btnOpenConfig").addEventListener("click", () => {
  window.open(chrome.runtime.getURL("config.json"), "_blank");
});

// ---- Run Now ----
$("#btnRunNow").addEventListener("click", async () => {
  const config = { scheduledTime: $("#scheduledTime").value, isActive: $("#btnToggle").classList.contains("active") };
  await sendMsg({ action: "saveConfig", config });
  showToast("info", "Running update now...");
  const resp = await sendMsg({ action: "runNow" });
  showToast(
    resp.success ? "ok" : "error",
    resp.success ? "Run complete. Check logs below for details." : resp.error
  );
  loadLogs();
});

// ---- Accordion ----
document.querySelectorAll(".acc-header").forEach((header) => {
  header.addEventListener("click", (e) => {
    if (e.target.closest("button")) return;
    header.closest(".acc-section").classList.toggle("open");
  });
});

// ---- Logs ----
function renderLogEntries(logs) {
  if (!logs.length) return '<div class="empty-msg">No logs yet.</div>';
  return logs.map((l) => {
    const ts = new Date(l.ts).toLocaleString();
    return `<div class="log-entry">
      <div><span class="log-ts">${ts}</span> <span class="log-level ${l.level}">${l.level}</span></div>
      <div class="log-msg">${escHtml(l.message)}</div>
    </div>`;
  }).join("");
}

async function loadLogs() {
  const [engResp, schedResp] = await Promise.all([
    sendMsg({ action: "getEngagementLogs" }),
    sendMsg({ action: "getLogs" }),
  ]);

  const engLogs = engResp?.logs || [];
  const schedLogs = schedResp?.logs || [];

  $("#engLogList").innerHTML = renderLogEntries(engLogs);
  $("#schedLogList").innerHTML = renderLogEntries(schedLogs);
  $("#engLogCount").textContent = engLogs.length;
  $("#schedLogCount").textContent = schedLogs.length;
}

$("#btnRefreshEngagements").addEventListener("click", () => loadEngagements(true));

$("#btnClearEngLogs").addEventListener("click", async () => {
  await sendMsg({ action: "clearEngagementLogs" });
  loadLogs();
});

$("#btnClearSchedLogs").addEventListener("click", async () => {
  await sendMsg({ action: "clearLogs" });
  loadLogs();
});

function escHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
