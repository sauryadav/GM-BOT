/**
 * Meet.ai - Side Panel Controller
 * Handles live controls, live captions, translation, laptop vs mobile device tracking,
 * attendance roster, AI assistant generation, exports, and history dashboard.
 */

// --- Global State ---
let activeTab = null;
let activeMeetCode = null;
let sessionTimerInterval = null;
let sessionStartTime = null;
let currentFilter = "all";
let liveTranscriptMemory = [];

// --- DOM References ---
const timerEl = document.getElementById("sessionTimer");
const statusBadge = document.getElementById("statusBadge");
const activeMeetCodeText = document.getElementById("activeMeetCodeText");

// Device Stats
const statTotalEl = document.getElementById("statTotalCount");
const statLaptopEl = document.getElementById("statLaptopCount");
const statPhoneEl = document.getElementById("statPhoneCount");

// Session Buttons
const startAssistantBtn = document.getElementById("startAssistantBtn");
const pauseAssistantBtn = document.getElementById("pauseAssistantBtn");
const stopAssistantBtn = document.getElementById("stopAssistantBtn");
const syncMeetBtn = document.getElementById("syncMeetBtn");

// Captions Status Banner & Live Preview
const captionStatusBar = document.getElementById("captionStatusBar");
const captionStatusIcon = document.getElementById("captionStatusIcon");
const captionStatusText = document.getElementById("captionStatusText");
const enableCcBtn = document.getElementById("enableCcBtn");
const livePreviewBox = document.getElementById("livePreviewBox");
const livePreviewSpeaker = document.getElementById("livePreviewSpeaker");
const livePreviewText = document.getElementById("livePreviewText");

// Live Captions & Translation
const transLangPair = document.getElementById("transLangPair");
const toggleOverlaySubtitles = document.getElementById("toggleOverlaySubtitles");
const liveTranscriptFeed = document.getElementById("liveTranscriptFeed");
const transcriptCountEl = document.getElementById("transcriptCount");

// Attendance
const attendanceTableBody = document.getElementById("attendanceTableBody");
const filterChips = document.querySelectorAll(".chip");
const filterAllCount = document.getElementById("filterAllCount");
const filterLaptopCount = document.getElementById("filterLaptopCount");
const filterPhoneCount = document.getElementById("filterPhoneCount");
const manualNameInput = document.getElementById("manualNameInput");
const manualDeviceInput = document.getElementById("manualDeviceInput");
const addManualBtn = document.getElementById("addManualBtn");
const exportCsvBtn = document.getElementById("exportCsvBtn");

// AI Assistant
const generateAiBtn = document.getElementById("generateAiBtn");
const aiSummaryLang = document.getElementById("aiSummaryLang");
const aiLoadingIndicator = document.getElementById("aiLoadingIndicator");
const aiSummaryText = document.getElementById("aiSummaryText");
const aiKeyPointsText = document.getElementById("aiKeyPointsText");
const aiDecisionsText = document.getElementById("aiDecisionsText");
const aiActionItemsText = document.getElementById("aiActionItemsText");
const aiEmailText = document.getElementById("aiEmailText");
const exportMdBtn = document.getElementById("exportMdBtn");
const exportTxtBtn = document.getElementById("exportTxtBtn");
const exportPdfBtn = document.getElementById("exportPdfBtn");

// History
const historySearchInput = document.getElementById("historySearchInput");
const historyListContainer = document.getElementById("historyListContainer");
const clearAllHistoryBtn = document.getElementById("clearAllHistoryBtn");

// Settings
const settingBackendUrl = document.getElementById("settingBackendUrl");
const settingGeminiApiKey = document.getElementById("settingGeminiApiKey");
const settingAiModel = document.getElementById("settingAiModel");
const settingRecordAudio = document.getElementById("settingRecordAudio");
const saveSettingsBtn = document.getElementById("saveSettingsBtn");
const saveStatusNotice = document.getElementById("saveStatusNotice");

// --- Initialization ---

document.addEventListener("DOMContentLoaded", async () => {
  setupTabs();
  setupEventListeners();
  await loadSettings();
  await refreshActiveTab();
  await syncStateFromStorage();
  await renderHistoryList();
});

// --- Tab Navigation ---

function setupTabs() {
  const tabs = document.querySelectorAll(".nav-tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      document.querySelectorAll(".tab-pane").forEach((p) => p.classList.remove("active"));

      tab.classList.add("active");
      const targetPane = document.getElementById(`tab-${tab.dataset.tab}`);
      if (targetPane) targetPane.classList.add("active");

      if (tab.dataset.tab === "history") {
        renderHistoryList();
      }
    });
  });
}

// --- Active Tab & State Sync ---

function extractMeetCode(url) {
  if (!url || !url.includes("meet.google.com/")) return null;
  const match = url.match(/meet\.google\.com\/(?:meet\/)?([a-z]{3}-[a-z]{4}-[a-z]{3})/i);
  return match ? match[1].toLowerCase() : null;
}

async function refreshActiveTab() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    activeTab = tabs[0];
    activeMeetCode = extractMeetCode(activeTab?.url);

    // If active tab in current window isn't meet, check if any meet tab is open in this window
    if (!activeMeetCode) {
      const allTabs = await chrome.tabs.query({ currentWindow: true });
      const meetTab = allTabs.find((t) => extractMeetCode(t.url));
      if (meetTab) {
        activeTab = meetTab;
        activeMeetCode = extractMeetCode(meetTab.url);
      }
    }

    if (activeMeetCode) {
      activeMeetCodeText.textContent = activeMeetCode;
    } else {
      activeMeetCodeText.textContent = "Open meet.google.com/xxx-xxxx-xxx";
    }
  } catch (e) {
    console.warn("[Meet.ai Sidepanel] Could not query tabs:", e);
  }
}

async function syncStateFromStorage() {
  const state = await chrome.storage.local.get([
    "isRecording",
    "isTranscribing",
    "isPaused",
    "activeMeetCode",
    "startTime",
    "stats",
    "currentTranscript",
    "currentParticipants",
    "captionStatus",
    "captionStatusText"
  ]);

  if (state.activeMeetCode) {
    activeMeetCode = state.activeMeetCode;
    activeMeetCodeText.textContent = state.activeMeetCode;
  }

  // Update Status & Controls
  if (state.isRecording || state.isTranscribing) {
    if (state.isPaused) {
      statusBadge.textContent = "PAUSED";
      statusBadge.className = "status-badge paused";
      startAssistantBtn.disabled = true;
      pauseAssistantBtn.disabled = false;
      pauseAssistantBtn.textContent = "▶ Resume";
      stopAssistantBtn.disabled = false;
    } else {
      statusBadge.textContent = "LIVE";
      statusBadge.className = "status-badge live";
      startAssistantBtn.disabled = true;
      pauseAssistantBtn.disabled = false;
      pauseAssistantBtn.textContent = "⏸ Pause";
      stopAssistantBtn.disabled = false;
    }

    if (state.startTime) {
      sessionStartTime = new Date(state.startTime);
      startTimer();
    }
  } else {
    statusBadge.textContent = "IDLE";
    statusBadge.className = "status-badge idle";
    startAssistantBtn.disabled = !activeMeetCode;
    pauseAssistantBtn.disabled = true;
    stopAssistantBtn.disabled = true;
    stopTimer();
  }

  // Update Caption Status
  updateCaptionStatusUI(state.captionStatus, state.captionStatusText);

  // Update Stats & Device Breakdown
  updateStatsDisplay(state.stats);

  // Update Transcript Feed
  liveTranscriptMemory = state.currentTranscript || [];
  renderTranscriptFeed(liveTranscriptMemory);

  // Update Attendance Roster
  renderAttendanceTable(state.currentParticipants || []);
}

// --- Direct Message Listener (Instant Real-time Dispatch) ---
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "CAPTION_LINE_ADDED" && message.entry) {
    console.log("[Meet.ai Sidepanel] Instant caption line received:", message.entry.speaker, message.entry.text);
    appendTranscriptCard(message.entry);
  }

  if (message.type === "BROADCAST_CAPTION_STATUS") {
    updateCaptionStatusUI(message.status, message.statusText);
  }

  if (message.type === "BROADCAST_CAPTION_PREVIEW") {
    showLiveSpeakerPreview(message.speaker, message.previewText);
  }

  if (message.type === "TRANSCRIPT_TRANSLATION_UPDATED") {
    updateCardTranslation(message.id, message.translation);
  }
});

// Storage fallback listener
chrome.storage.onChanged.addListener((changes) => {
  if (changes.stats) {
    updateStatsDisplay(changes.stats.newValue);
  }
  if (changes.currentParticipants) {
    renderAttendanceTable(changes.currentParticipants.newValue || []);
  }
  if (changes.isRecording || changes.isPaused || changes.isTranscribing) {
    syncStateFromStorage();
  }
});

// --- Caption Status UI ---

function updateCaptionStatusUI(status, text) {
  if (!captionStatusBar || !captionStatusText) return;

  if (status === "ACTIVE") {
    captionStatusBar.className = "caption-status-box active";
    captionStatusIcon.textContent = "🟢";
    captionStatusText.textContent = text || "Captions Active: Monitoring speech";
    enableCcBtn.style.display = "none";
  } else if (status === "INACTIVE" || (text && text.includes("OFF"))) {
    captionStatusBar.className = "caption-status-box warning";
    captionStatusIcon.textContent = "⚠️";
    captionStatusText.textContent = text || "Closed Captions (CC) are OFF in Google Meet";
    enableCcBtn.style.display = "inline-block";
  } else {
    captionStatusBar.className = "caption-status-box waiting";
    captionStatusIcon.textContent = "⚪";
    captionStatusText.textContent = text || "Checking captions...";
    enableCcBtn.style.display = "none";
  }
}

let livePreviewHideTimer = null;
function showLiveSpeakerPreview(speaker, previewText) {
  if (!livePreviewBox || !livePreviewText || !livePreviewSpeaker) return;

  if (previewText && previewText.length > 1) {
    livePreviewSpeaker.textContent = speaker || "Speaker";
    livePreviewText.textContent = previewText;
    livePreviewBox.style.display = "flex";

    clearTimeout(livePreviewHideTimer);
    livePreviewHideTimer = setTimeout(() => {
      livePreviewBox.style.display = "none";
    }, 2500);
  }
}

// --- Timer ---

function startTimer() {
  stopTimer();
  sessionTimerInterval = setInterval(() => {
    if (!sessionStartTime) return;
    const diff = Math.floor((Date.now() - sessionStartTime.getTime()) / 1000);
    const hrs = String(Math.floor(diff / 3600)).padStart(2, "0");
    const mins = String(Math.floor((diff % 3600) / 60)).padStart(2, "0");
    const secs = String(diff % 60).padStart(2, "0");
    timerEl.textContent = `${hrs}:${mins}:${secs}`;
  }, 1000);
}

function stopTimer() {
  if (sessionTimerInterval) {
    clearInterval(sessionTimerInterval);
    sessionTimerInterval = null;
  }
  timerEl.textContent = "00:00:00";
}

// --- Device Stats & Metrics ---

function updateStatsDisplay(stats = { total: 0, desktop: 0, mobile: 0 }) {
  statTotalEl.textContent = stats.total || 0;
  statLaptopEl.textContent = stats.desktop || 0;
  statPhoneEl.textContent = stats.mobile || 0;

  filterAllCount.textContent = stats.total || 0;
  filterLaptopCount.textContent = stats.desktop || 0;
  filterPhoneCount.textContent = stats.mobile || 0;
}

// --- Live Transcript Feed ---

function appendTranscriptCard(entry) {
  // Hide empty feed hint
  const emptyHint = liveTranscriptFeed.querySelector(".empty-feed-hint");
  if (emptyHint) emptyHint.remove();

  // Hide live preview box since this utterance is finalized
  if (livePreviewBox) livePreviewBox.style.display = "none";

  // Check if entry already exists
  const existingCard = document.getElementById(`card_${entry.id}`);
  if (existingCard) return;

  liveTranscriptMemory.push(entry);
  transcriptCountEl.textContent = `${liveTranscriptMemory.length} lines`;

  const card = document.createElement("div");
  card.id = `card_${entry.id}`;
  card.className = `transcript-card ${entry.device === "phone" ? "phone-speaker" : ""}`;

  const icon = entry.device === "phone" ? "📱" : "💻";
  const label = entry.device === "phone" ? "Phone" : "Laptop";

  card.innerHTML = `
    <div class="transcript-meta">
      <div>
        <span class="speaker-title">${escapeHtml(entry.speaker)}</span>
        <span class="speaker-device-badge">${icon} ${label}</span>
      </div>
      <span class="transcript-time">${entry.timeStr || ""}</span>
    </div>
    <div class="transcript-body">${escapeHtml(entry.text)}</div>
    <div class="transcript-translation" style="${entry.translation ? "display: block;" : "display: none;"}">
      ↳ ${escapeHtml(entry.translation || "")}
    </div>
  `;

  liveTranscriptFeed.appendChild(card);
  liveTranscriptFeed.scrollTop = liveTranscriptFeed.scrollHeight;
}

function updateCardTranslation(id, translation) {
  const card = document.getElementById(`card_${id}`);
  if (card) {
    const transEl = card.querySelector(".transcript-translation");
    if (transEl) {
      transEl.textContent = `↳ ${translation}`;
      transEl.style.display = "block";
    }
  }
}

function renderTranscriptFeed(transcript) {
  liveTranscriptMemory = transcript || [];
  transcriptCountEl.textContent = `${liveTranscriptMemory.length} lines`;

  if (!liveTranscriptMemory || liveTranscriptMemory.length === 0) {
    liveTranscriptFeed.innerHTML = `
      <div class="empty-feed-hint">
        <p>Ready to capture speech.</p>
        <small>Captions will appear here with speaker names and live translation.</small>
      </div>
    `;
    return;
  }

  liveTranscriptFeed.innerHTML = "";
  liveTranscriptMemory.forEach((entry) => {
    const card = document.createElement("div");
    card.id = `card_${entry.id}`;
    card.className = `transcript-card ${entry.device === "phone" ? "phone-speaker" : ""}`;

    const icon = entry.device === "phone" ? "📱" : "💻";
    const label = entry.device === "phone" ? "Phone" : "Laptop";

    card.innerHTML = `
      <div class="transcript-meta">
        <div>
          <span class="speaker-title">${escapeHtml(entry.speaker)}</span>
          <span class="speaker-device-badge">${icon} ${label}</span>
        </div>
        <span class="transcript-time">${entry.timeStr || ""}</span>
      </div>
      <div class="transcript-body">${escapeHtml(entry.text)}</div>
      <div class="transcript-translation" style="${entry.translation ? "display: block;" : "display: none;"}">
        ↳ ${escapeHtml(entry.translation || "")}
      </div>
    `;
    liveTranscriptFeed.appendChild(card);
  });

  liveTranscriptFeed.scrollTop = liveTranscriptFeed.scrollHeight;
}

// --- Attendance Roster ---

function renderAttendanceTable(participants) {
  if (!participants || participants.length === 0) {
    attendanceTableBody.innerHTML = `
      <tr>
        <td colspan="4" class="text-center text-muted">No participants captured yet.</td>
      </tr>
    `;
    return;
  }

  const filtered = participants.filter((p) => {
    if (currentFilter === "laptop") return p.device !== "phone";
    if (currentFilter === "phone") return p.device === "phone";
    return true;
  });

  attendanceTableBody.innerHTML = "";
  filtered.forEach((p) => {
    const tr = document.createElement("tr");

    const isPhone = p.device === "phone";
    const deviceBadgeClass = isPhone ? "phone" : "laptop";
    const deviceIcon = isPhone ? "📱" : "💻";
    const deviceText = isPhone ? "Phone / Mobile" : "Laptop / Desktop";
    const firstTime = p.firstSeen ? new Date(p.firstSeen).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--:--";
    const statusText = p.present ? "Present" : (p.lastSeen && p.firstSeen && p.lastSeen !== p.firstSeen ? "Left" : "Absent");
    const statusColor = p.present ? "#86efac" : "#94a3b8";

    tr.innerHTML = `
      <td>
        <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
          <input type="checkbox" class="attendance-check" data-name="${escapeHtml(p.name)}" ${p.present ? "checked" : ""} />
          <span style="font-size: 10px; font-weight: 600; color: ${statusColor};">${statusText}</span>
        </label>
      </td>
      <td><strong>${escapeHtml(p.name)}</strong></td>
      <td>
        <span class="device-badge-table ${deviceBadgeClass}">
          ${deviceIcon} ${deviceText}
        </span>
      </td>
      <td>${firstTime}</td>
    `;

    attendanceTableBody.appendChild(tr);
  });

  document.querySelectorAll(".attendance-check").forEach((chk) => {
    chk.addEventListener("change", (e) => {
      const name = e.target.dataset.name;
      const present = e.target.checked;
      chrome.runtime.sendMessage({
        type: "UPDATE_ATTENDANCE_STATUS",
        name,
        present
      });
    });
  });
}

// --- Event Listeners Setup ---

function setupEventListeners() {
  // Session Controls
  startAssistantBtn.addEventListener("click", handleStartSession);
  pauseAssistantBtn.addEventListener("click", handlePauseResumeSession);
  stopAssistantBtn.addEventListener("click", handleStopSession);
  syncMeetBtn.addEventListener("click", handleSyncMeet);

  // CC Enable Button
  enableCcBtn.addEventListener("click", () => {
    if (activeTab?.id) {
      chrome.tabs.sendMessage(activeTab.id, { type: "TOGGLE_MEET_CC" });
    }
  });

  // Translation & Overlay
  transLangPair.addEventListener("change", handleTranslationLangChange);
  toggleOverlaySubtitles.addEventListener("change", handleOverlayToggle);

  // Attendance Filters & Add
  filterChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      filterChips.forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      currentFilter = chip.dataset.filter;
      chrome.storage.local.get(["currentParticipants"]).then((data) => {
        renderAttendanceTable(data.currentParticipants || []);
      });
    });
  });

  addManualBtn.addEventListener("click", handleAddManualParticipant);
  exportCsvBtn.addEventListener("click", handleExportCsv);

  // AI Assistant Controls
  generateAiBtn.addEventListener("click", handleGenerateAi);
  setupCopyButtons();

  exportMdBtn.addEventListener("click", () => handleExportMeeting("md"));
  exportTxtBtn.addEventListener("click", () => handleExportMeeting("txt"));
  exportPdfBtn.addEventListener("click", () => handleExportMeeting("pdf"));

  // History Controls
  historySearchInput.addEventListener("input", handleHistorySearch);
  clearAllHistoryBtn.addEventListener("click", handleClearAllHistory);

  // Settings
  saveSettingsBtn.addEventListener("click", handleSaveSettings);
}

// --- Handler Implementations ---

async function handleStartSession() {
  await refreshActiveTab();
  if (!activeMeetCode || !activeTab?.id) {
    alert("Please open an active Google Meet call tab (meet.google.com/xxx-xxxx-xxx) first.");
    return;
  }

  startAssistantBtn.disabled = true;
  statusBadge.textContent = "STARTING...";

  const res = await chrome.runtime.sendMessage({
    type: "START_SESSION",
    tabId: activeTab.id,
    meetCode: activeMeetCode
  });

  if (res?.success) {
    statusBadge.textContent = "LIVE";
    statusBadge.className = "status-badge live";
    pauseAssistantBtn.disabled = false;
    stopAssistantBtn.disabled = false;
    sessionStartTime = new Date();
    startTimer();
    updateCaptionStatusUI("ACTIVE", "Captions Active: Listening for speech...");
  } else {
    alert("Failed to start session: " + (res?.error || "Unknown error"));
    startAssistantBtn.disabled = false;
    statusBadge.textContent = "IDLE";
  }
}

async function handlePauseResumeSession() {
  const state = await chrome.storage.local.get(["isPaused"]);
  if (state.isPaused) {
    await chrome.runtime.sendMessage({ type: "RESUME_SESSION" });
    pauseAssistantBtn.textContent = "⏸ Pause";
    statusBadge.textContent = "LIVE";
    statusBadge.className = "status-badge live";
  } else {
    await chrome.runtime.sendMessage({ type: "PAUSE_SESSION" });
    pauseAssistantBtn.textContent = "▶ Resume";
    statusBadge.textContent = "PAUSED";
    statusBadge.className = "status-badge paused";
  }
}

async function handleStopSession() {
  if (!confirm("Stop assistant and save meeting minutes?")) return;

  stopAssistantBtn.disabled = true;
  pauseAssistantBtn.disabled = true;

  const res = await chrome.runtime.sendMessage({ type: "STOP_SESSION" });
  if (res?.success) {
    statusBadge.textContent = "IDLE";
    statusBadge.className = "status-badge idle";
    startAssistantBtn.disabled = false;
    stopTimer();
    updateCaptionStatusUI("IDLE", "Session Stopped");
    alert(`Meeting for ${res.meeting.meetCode} successfully saved to History!`);
    renderHistoryList();
  }
}

async function handleSyncMeet() {
  await refreshActiveTab();
  if (!activeTab?.id) return;
  try {
    const res = await chrome.tabs.sendMessage(activeTab.id, { type: "SYNC_PARTICIPANTS" });
    if (res?.list) {
      renderAttendanceTable(res.list);
    }
  } catch (err) {
    console.warn("Could not sync participants directly:", err);
  }
}

function handleTranslationLangChange() {
  const val = transLangPair.value;
  let enabled = true;
  let sourceLang = "auto";
  let targetLang = "hi";

  if (val === "none") {
    enabled = false;
  } else if (val === "en-hi") {
    sourceLang = "en";
    targetLang = "hi";
  } else if (val === "hi-en") {
    sourceLang = "hi";
    targetLang = "en";
  } else if (val === "auto-en") {
    sourceLang = "auto";
    targetLang = "en";
  } else if (val === "auto-hi") {
    sourceLang = "auto";
    targetLang = "hi";
  }

  if (activeTab?.id) {
    chrome.tabs.sendMessage(activeTab.id, {
      type: "UPDATE_TRANSLATION_SETTINGS",
      settings: {
        enabled,
        sourceLang,
        targetLang,
        showOverlay: toggleOverlaySubtitles.checked
      }
    }).catch(() => {});
  }
}

function handleOverlayToggle() {
  if (activeTab?.id) {
    chrome.tabs.sendMessage(activeTab.id, {
      type: "UPDATE_TRANSLATION_SETTINGS",
      settings: {
        showOverlay: toggleOverlaySubtitles.checked
      }
    }).catch(() => {});
  }
}

async function handleAddManualParticipant() {
  const name = manualNameInput.value.trim();
  if (!name) return;

  const device = manualDeviceInput.value;
  await chrome.runtime.sendMessage({
    type: "ADD_MANUAL_PARTICIPANT",
    participant: { name, device }
  });

  manualNameInput.value = "";
}

async function handleExportCsv() {
  const state = await chrome.storage.local.get(["currentParticipants", "activeMeetCode", "startTime"]);
  const meeting = {
    meetCode: state.activeMeetCode || "meeting",
    startTime: state.startTime || new Date().toISOString(),
    participants: state.currentParticipants || []
  };

  const csvContent = window.ExportUtils.formatAttendanceCsv(meeting);
  downloadBlob(csvContent, `attendance-${meeting.meetCode}-${new Date().toISOString().slice(0, 10)}.csv`, "text/csv;charset=utf-8;");
}

// --- AI Assistant Logic ---

async function handleGenerateAi() {
  const transcript = liveTranscriptMemory.length > 0
    ? liveTranscriptMemory
    : (await chrome.storage.local.get(["currentTranscript"])).currentTranscript || [];

  if (transcript.length === 0) {
    alert("Transcript is empty. Make sure Google Meet captions are enabled and participants speak before generating AI summary.");
    return;
  }

  const state = await chrome.storage.local.get(["currentParticipants", "activeMeetCode"]);

  generateAiBtn.disabled = true;
  aiLoadingIndicator.style.display = "flex";

  try {
    const summaryLanguage = aiSummaryLang?.value || "en";

    const response = await chrome.runtime.sendMessage({
      type: "GENERATE_AI_SUMMARY",
      transcript,
      participants: state.currentParticipants || [],
      meetCode: state.activeMeetCode || "Google Meet",
      language: summaryLanguage
    });

    if (response?.success && response.data) {
      aiSummaryText.value = response.data.summary || "";
      aiKeyPointsText.value = response.data.keyPoints || "";
      aiDecisionsText.value = response.data.decisions || "";
      aiActionItemsText.value = response.data.actionItems || "";
      aiEmailText.value = response.data.followUpEmail || "";
    } else {
      alert("Error generating summary: " + (response?.error || "Unknown"));
    }
  } catch (err) {
    alert("AI generation failed: " + err.message);
  } finally {
    generateAiBtn.disabled = false;
    aiLoadingIndicator.style.display = "none";
  }
}

function setupCopyButtons() {
  document.querySelectorAll(".btn-copy").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.dataset.target;
      const el = document.getElementById(targetId);
      if (el && el.value) {
        navigator.clipboard.writeText(el.value).then(() => {
          const oldText = btn.textContent;
          btn.textContent = "Copied! ✓";
          setTimeout(() => (btn.textContent = oldText), 1800);
        });
      }
    });
  });
}

async function handleExportMeeting(format) {
  const state = await chrome.storage.local.get([
    "activeMeetCode",
    "startTime",
    "currentParticipants"
  ]);

  const meeting = {
    meetCode: state.activeMeetCode || "meeting",
    startTime: state.startTime || new Date().toISOString(),
    durationStr: timerEl.textContent,
    transcript: liveTranscriptMemory,
    participants: state.currentParticipants || [],
    summary: aiSummaryText.value,
    keyPoints: aiKeyPointsText.value,
    decisions: aiDecisionsText.value,
    actionItems: aiActionItemsText.value,
    followUpEmail: aiEmailText.value
  };

  const code = meeting.meetCode;
  const dateStr = new Date().toISOString().slice(0, 10);

  if (format === "md") {
    const md = window.ExportUtils.formatFullMeetingMd(meeting);
    downloadBlob(md, `meetai-report-${code}-${dateStr}.md`, "text/markdown");
  } else if (format === "txt") {
    const txt = window.ExportUtils.formatTranscriptTxt(meeting);
    downloadBlob(txt, `meetai-transcript-${code}-${dateStr}.txt`, "text/plain");
  } else if (format === "pdf") {
    const html = window.ExportUtils.generatePrintableHtml(meeting);
    const printWindow = window.open("", "_blank");
    printWindow.document.write(html);
    printWindow.document.close();
  }
}

// --- History Dashboard ---

async function renderHistoryList(filterText = "") {
  const { meetingHistory = [] } = await chrome.storage.local.get(["meetingHistory"]);

  if (meetingHistory.length === 0) {
    historyListContainer.innerHTML = `<p class="text-center text-muted">No saved meetings yet.</p>`;
    return;
  }

  const query = filterText.toLowerCase();
  const filtered = meetingHistory.filter((m) => {
    if (!query) return true;
    return (
      (m.meetCode && m.meetCode.toLowerCase().includes(query)) ||
      (m.startTime && m.startTime.toLowerCase().includes(query)) ||
      (m.summary && m.summary.toLowerCase().includes(query)) ||
      (m.transcript && m.transcript.some((t) => t.text.toLowerCase().includes(query)))
    );
  });

  if (filtered.length === 0) {
    historyListContainer.innerHTML = `<p class="text-center text-muted">No meetings matched "${escapeHtml(filterText)}".</p>`;
    return;
  }

  historyListContainer.innerHTML = "";
  filtered.forEach((m) => {
    const item = document.createElement("div");
    item.className = "history-item";

    const dateStr = m.startTime ? new Date(m.startTime).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "Recent";
    const desktopCount = (m.participants || []).filter((p) => p.device !== "phone").length;
    const mobileCount = (m.participants || []).filter((p) => p.device === "phone").length;

    item.innerHTML = `
      <div class="history-item-header">
        <span class="history-title">Meet: ${escapeHtml(m.meetCode || "Unknown")}</span>
        <span class="history-meta">${dateStr}</span>
      </div>
      <div class="history-meta">
        ⏱ ${m.durationStr || "N/A"} | 👥 ${m.participants?.length || 0} (💻 ${desktopCount} | 📱 ${mobileCount}) | 📝 ${m.transcript?.length || 0} lines
      </div>
      <div class="history-actions">
        <button class="btn btn-secondary btn-small btn-view-hist" data-id="${m.id}">Load in Assistant</button>
        <button class="btn btn-secondary btn-small btn-export-csv" data-id="${m.id}">CSV</button>
        <button class="btn btn-primary btn-small btn-print-pdf" data-id="${m.id}">PDF</button>
        <button class="btn btn-danger btn-small btn-del-hist" data-id="${m.id}">Delete</button>
      </div>
    `;

    historyListContainer.appendChild(item);
  });

  historyListContainer.querySelectorAll(".btn-view-hist").forEach((btn) => {
    btn.addEventListener("click", () => {
      const meet = meetingHistory.find((m) => m.id === btn.dataset.id);
      if (meet) loadMeetingIntoAssistant(meet);
    });
  });

  historyListContainer.querySelectorAll(".btn-export-csv").forEach((btn) => {
    btn.addEventListener("click", () => {
      const meet = meetingHistory.find((m) => m.id === btn.dataset.id);
      if (meet) {
        const csv = window.ExportUtils.formatAttendanceCsv(meet);
        downloadBlob(csv, `attendance-${meet.meetCode}.csv`, "text/csv");
      }
    });
  });

  historyListContainer.querySelectorAll(".btn-print-pdf").forEach((btn) => {
    btn.addEventListener("click", () => {
      const meet = meetingHistory.find((m) => m.id === btn.dataset.id);
      if (meet) {
        const html = window.ExportUtils.generatePrintableHtml(meet);
        const win = window.open("", "_blank");
        win.document.write(html);
        win.document.close();
      }
    });
  });

  historyListContainer.querySelectorAll(".btn-del-hist").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (confirm("Delete this meeting record?")) {
        await chrome.runtime.sendMessage({ type: "DELETE_MEETING", meetingId: btn.dataset.id });
        renderHistoryList(historySearchInput.value);
      }
    });
  });
}

function loadMeetingIntoAssistant(meet) {
  aiSummaryText.value = meet.summary || "";
  aiKeyPointsText.value = meet.keyPoints || "";
  aiDecisionsText.value = meet.decisions || "";
  aiActionItemsText.value = meet.actionItems || "";
  aiEmailText.value = meet.followUpEmail || "";

  document.querySelector('.nav-tab[data-tab="assistant"]')?.click();
}

function handleHistorySearch(e) {
  renderHistoryList(e.target.value);
}

async function handleClearAllHistory() {
  if (confirm("Are you sure you want to delete all meeting history? This cannot be undone.")) {
    await chrome.runtime.sendMessage({ type: "CLEAR_HISTORY" });
    renderHistoryList();
  }
}

// --- Settings Management ---

async function loadSettings() {
  const { settings } = await chrome.storage.local.get(["settings"]);
  if (settings) {
    if (settings.backendUrl) settingBackendUrl.value = settings.backendUrl;
    if (settings.geminiApiKey) settingGeminiApiKey.value = settings.geminiApiKey;
    if (settings.aiModel) settingAiModel.value = settings.aiModel;
    if (typeof settings.recordAudio === "boolean") settingRecordAudio.checked = settings.recordAudio;
  }
}

async function handleSaveSettings() {
  const settings = {
    backendUrl: settingBackendUrl.value.trim(),
    geminiApiKey: settingGeminiApiKey.value.trim(),
    aiModel: settingAiModel.value,
    recordAudio: settingRecordAudio.checked
  };

  await chrome.storage.local.set({ settings });

  saveStatusNotice.style.display = "inline";
  setTimeout(() => (saveStatusNotice.style.display = "none"), 2000);
}

// --- Helper Functions ---

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function downloadBlob(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
