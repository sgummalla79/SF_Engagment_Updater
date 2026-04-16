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

// ---- Load Config on Open ----
document.addEventListener("DOMContentLoaded", async () => {
  const resp = await sendMsg({ action: "getConfig" });
  if (resp?.config) populateForm(resp.config);
});

function populateForm(c) {
  $("#scheduledTime").value = c.scheduledTime || "17:00";
}

// ---- Gather Config from Form ----
function gatherConfig() {
  return {
    scheduledTime: $("#scheduledTime").value,
  };
}

// ---- Auto-save on time change ----
$("#scheduledTime").addEventListener("change", async () => {
  const config = gatherConfig();
  const resp = await sendMsg({ action: "saveConfig", config });
  showToast(
    resp.success ? "ok" : "error",
    resp.success ? `Scheduled time saved — daily run at ${config.scheduledTime}.` : resp.error
  );
});

// ---- Run Now ----
$("#btnRunNow").addEventListener("click", async () => {
  const config = gatherConfig();
  await sendMsg({ action: "saveConfig", config });
  showToast("info", "Running update now...");
  const resp = await sendMsg({ action: "runNow" });
  showToast(
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
