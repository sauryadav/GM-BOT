/**
 * Meet.ai - Popup Controller
 */

const statusBadge = document.getElementById("statusBadge");
const meetCodeDisplay = document.getElementById("meetCodeDisplay");
const openSidePanelBtn = document.getElementById("openSidePanelBtn");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const totalCountEl = document.getElementById("totalCount");
const desktopCountEl = document.getElementById("desktopCount");
const mobileCountEl = document.getElementById("mobileCount");

let currentTab = null;

function extractMeetCode(url) {
  if (!url || !url.includes("meet.google.com/")) return null;
  const match = url.match(/meet\.google\.com\/(?:meet\/)?([a-z]{3}-[a-z]{4}-[a-z]{3})/i);
  return match ? match[1].toLowerCase() : null;
}

async function initPopup() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;

  let meetCode = extractMeetCode(tab?.url);
  if (!meetCode) {
    const allTabs = await chrome.tabs.query({ currentWindow: true });
    const meetTab = allTabs.find((t) => extractMeetCode(t.url));
    if (meetTab) {
      currentTab = meetTab;
      meetCode = extractMeetCode(meetTab.url);
    }
  }
  const state = await chrome.storage.local.get([
    "isRecording",
    "isTranscribing",
    "isPaused",
    "activeMeetCode",
    "stats"
  ]);

  if (state.stats) {
    totalCountEl.textContent = state.stats.total || 0;
    desktopCountEl.textContent = state.stats.desktop || 0;
    mobileCountEl.textContent = state.stats.mobile || 0;
  }

  if (state.isRecording || state.isTranscribing) {
    statusBadge.textContent = state.isPaused ? "PAUSED" : "LIVE";
    statusBadge.className = `badge ${state.isPaused ? "paused" : "live"}`;
    meetCodeDisplay.textContent = state.activeMeetCode || "Active Call";
    startBtn.style.display = "none";
    stopBtn.style.display = "flex";
  } else {
    statusBadge.textContent = "IDLE";
    statusBadge.className = "badge";
    startBtn.style.display = "flex";
    stopBtn.style.display = "none";

    if (!meetCode) {
      meetCodeDisplay.textContent = "Not in Meet";
      startBtn.disabled = true;
    } else {
      meetCodeDisplay.textContent = meetCode;
      startBtn.disabled = false;
    }
  }
}

// Open Chrome Side Panel
openSidePanelBtn.addEventListener("click", async () => {
  if (chrome.sidePanel && chrome.sidePanel.open) {
    const window = await chrome.windows.getCurrent();
    await chrome.sidePanel.open({ windowId: window.id });
    window.close(); // Close popup once side panel is opened
  } else {
    // Fallback if sidePanel API is not supported in window context
    chrome.tabs.create({ url: "sidepanel.html" });
  }
});

startBtn.addEventListener("click", async () => {
  const meetCode = extractMeetCode(currentTab?.url);
  if (!meetCode) return;

  startBtn.disabled = true;
  statusBadge.textContent = "STARTING...";

  const response = await chrome.runtime.sendMessage({
    type: "START_SESSION",
    tabId: currentTab.id,
    meetCode: meetCode
  });

  if (response?.success) {
    statusBadge.textContent = "LIVE";
    statusBadge.className = "badge live";
    startBtn.style.display = "none";
    stopBtn.style.display = "flex";
  } else {
    alert("Failed to start: " + (response?.error || "Unknown"));
    startBtn.disabled = false;
    statusBadge.textContent = "IDLE";
  }
});

stopBtn.addEventListener("click", async () => {
  stopBtn.disabled = true;
  statusBadge.textContent = "STOPPING...";

  const response = await chrome.runtime.sendMessage({
    type: "STOP_SESSION"
  });

  if (response?.success) {
    statusBadge.textContent = "IDLE";
    statusBadge.className = "badge";
    stopBtn.style.display = "none";
    startBtn.style.display = "flex";
    startBtn.disabled = false;
  }
});

// Real-time listener for device stats & session changes
chrome.storage.onChanged.addListener((changes) => {
  if (changes.stats) {
    totalCountEl.textContent = changes.stats.newValue?.total || 0;
    desktopCountEl.textContent = changes.stats.newValue?.desktop || 0;
    mobileCountEl.textContent = changes.stats.newValue?.mobile || 0;
  }
  if (changes.isRecording || changes.isPaused) {
    initPopup();
  }
});

initPopup();
