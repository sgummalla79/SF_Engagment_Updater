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

// ---- Init ----
document.addEventListener("DOMContentLoaded", async () => {
  const resp = await sendMsg({ action: "getConfig" });
  if (resp?.config) {
    $("#scheduledTime").value = resp.config.scheduledTime || "17:00";
    applyToggleState(resp.config.isActive !== false);
  }
  loadLogs();
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
        <div><span class="log-ts">${ts}</span> <span class="log-level ${l.level}">${l.level}</span></div>
        <div class="log-msg">${escHtml(l.message)}</div>
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
