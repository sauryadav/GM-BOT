/**
 * Meet.ai - Background Service Worker (Manifest V3)
 * Manages active session state, offscreen audio recording, storage, and AI processing
 */

const DEFAULT_SETTINGS = {
  backendUrl: "http://localhost:3000",
  geminiApiKey: "", // User can optionally configure locally if not running backend
  aiModel: "gemini-1.5-flash",
  translationEnabled: true,
  sourceLang: "en",
  targetLang: "hi",
  showOverlay: true,
  recordAudio: true
};

let currentTranscriptMemory = [];
let currentParticipantsMemory = [];

// --- Initialization ---

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get(["settings", "meetingHistory"]);
  if (!existing.settings) {
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  }
  if (!existing.meetingHistory) {
    await chrome.storage.local.set({ meetingHistory: [] });
  }

  currentTranscriptMemory = [];
  currentParticipantsMemory = [];

  await chrome.storage.local.set({
    isRecording: false,
    isTranscribing: false,
    isPaused: false,
    activeMeetCode: null,
    activeTabId: null,
    startTime: null,
    stats: { total: 0, desktop: 0, mobile: 0 },
    currentTranscript: [],
    currentParticipants: [],
    captionStatus: "IDLE",
    captionStatusText: "Ready"
  });

  console.log("[Meet.ai Background] Installed and initialized.");
});

// Helper: Ensure Offscreen document exists for Audio Recording
async function ensureOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"]
  });

  if (existingContexts.length > 0) return;

  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["USER_MEDIA"],
    justification: "Recording Google Meet tab audio with MediaRecorder"
  });
  console.log("[Meet.ai Background] Offscreen document created.");
}

async function closeOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"]
  });
  if (existingContexts.length > 0) {
    await chrome.offscreen.closeDocument();
    console.log("[Meet.ai Background] Offscreen document closed.");
  }
}

// --- Message Handling ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handleAsync = async () => {
    switch (message.type) {
      case "START_SESSION":
        return await startSession(message.tabId, message.meetCode);

      case "PAUSE_SESSION":
        return await pauseSession();

      case "RESUME_SESSION":
        return await resumeSession();

      case "STOP_SESSION":
        return await stopSession();

      case "NEW_TRANSCRIPT_LINE":
        return await handleNewTranscriptLine(message.entry);

      case "UPDATE_TRANSCRIPT_TRANSLATION":
        return await handleUpdateTranslation(message.id, message.translation);

      case "CAPTION_STATUS_CHANGED":
        await chrome.storage.local.set({
          captionStatus: message.status,
          captionStatusText: message.statusText
        });
        chrome.runtime.sendMessage({
          type: "BROADCAST_CAPTION_STATUS",
          status: message.status,
          statusText: message.statusText
        }).catch(() => {});
        return { success: true };

      case "LIVE_CAPTION_PREVIEW":
        chrome.runtime.sendMessage({
          type: "BROADCAST_CAPTION_PREVIEW",
          speaker: message.speaker,
          previewText: message.previewText
        }).catch(() => {});
        return { success: true };

      case "PARTICIPANTS_UPDATED":
        return await handleParticipantsUpdated(message.stats, message.meetCode);

      case "TRANSLATE_TEXT":
        return await handleTranslate(message.text, message.fromLang, message.toLang);

      case "GENERATE_AI_SUMMARY":
        return await handleGenerateAISummary(message.transcript, message.participants, message.meetCode, message.language);

      case "UPDATE_ATTENDANCE_STATUS":
        return await updateParticipantAttendance(message.name, message.present);

      case "ADD_MANUAL_PARTICIPANT":
        return await addManualParticipant(message.participant);

      case "CLEAR_HISTORY":
        await chrome.storage.local.set({ meetingHistory: [] });
        return { success: true };

      case "DELETE_MEETING":
        return await deleteMeeting(message.meetingId);

      default:
        return { success: false, error: `Unknown message type: ${message.type}` };
    }
  };

  handleAsync()
    .then((res) => sendResponse(res))
    .catch((err) => {
      console.error("[Meet.ai Background] Error handling message:", message.type, err);
      sendResponse({ success: false, error: err.message });
    });

  return true; // Keep message channel open for async response
});

// --- Session Controls ---

async function startSession(tabId, meetCode) {
  const { settings } = await chrome.storage.local.get(["settings"]);
  const startTime = new Date().toISOString();

  currentTranscriptMemory = [];
  currentParticipantsMemory = [];

  // Reset current meeting data
  await chrome.storage.local.set({
    isRecording: true,
    isTranscribing: true,
    isPaused: false,
    activeMeetCode: meetCode,
    activeTabId: tabId,
    startTime: startTime,
    currentTranscript: [],
    currentParticipants: [],
    stats: { total: 0, desktop: 0, mobile: 0 },
    captionStatus: "ACTIVE",
    captionStatusText: "Captions Active (Listening...)"
  });

  // Signal content script in the Meet tab
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "START_MEET_CAPTURE",
      settings: settings || DEFAULT_SETTINGS
    });
  } catch (err) {
    console.warn("[Meet.ai Background] Content script not responding, injecting now...", err);
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content.js"]
      });
      await chrome.scripting.insertCSS({
        target: { tabId },
        files: ["content.css"]
      });
      await chrome.tabs.sendMessage(tabId, {
        type: "START_MEET_CAPTURE",
        settings: settings || DEFAULT_SETTINGS
      });
    } catch (injErr) {
      console.error("[Meet.ai Background] Script injection failed:", injErr);
    }
  }

  // Audio Recording via chrome.tabCapture & offscreen if enabled
  if (settings?.recordAudio !== false) {
    try {
      const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
      await ensureOffscreenDocument();
      await chrome.runtime.sendMessage({
        target: "offscreen",
        type: "START_RECORDING",
        streamId
      });
      console.log("[Meet.ai Background] Tab audio recording initialized.");
    } catch (recErr) {
      console.warn("[Meet.ai Background] Tab audio recording note:", recErr.message);
    }
  }

  return { success: true, meetCode };
}

async function pauseSession() {
  await chrome.storage.local.set({ isPaused: true });
  try {
    await chrome.runtime.sendMessage({
      target: "offscreen",
      type: "PAUSE_RECORDING"
    });
  } catch (e) {}
  return { success: true };
}

async function resumeSession() {
  await chrome.storage.local.set({ isPaused: false });
  try {
    await chrome.runtime.sendMessage({
      target: "offscreen",
      type: "RESUME_RECORDING"
    });
  } catch (e) {}
  return { success: true };
}

async function stopSession() {
  const data = await chrome.storage.local.get([
    "activeMeetCode",
    "activeTabId",
    "startTime",
    "currentTranscript",
    "currentParticipants",
    "meetingHistory"
  ]);

  const { activeMeetCode, activeTabId, startTime, currentTranscript = [], currentParticipants = [], meetingHistory = [] } = data;

  // Stop offscreen recording & trigger audio download if available
  try {
    const offscreenRes = await chrome.runtime.sendMessage({
      target: "offscreen",
      type: "STOP_RECORDING"
    });

    if (offscreenRes && offscreenRes.dataUrl) {
      const dateStr = new Date().toISOString().slice(0, 10);
      chrome.downloads.download({
        url: offscreenRes.dataUrl,
        filename: `meetai-recording-${activeMeetCode || "meeting"}-${dateStr}.webm`,
        saveAs: false
      });
    }
    await closeOffscreenDocument();
  } catch (e) {
    console.warn("[Meet.ai Background] Offscreen stop note:", e.message);
  }

  // Stop content script capture
  if (activeTabId) {
    try {
      await chrome.tabs.sendMessage(activeTabId, { type: "STOP_MEET_CAPTURE" });
    } catch (e) {}
  }

  // Compile finished meeting object
  const endTime = new Date().toISOString();
  let durationStr = "0m";
  if (startTime) {
    const durationMin = Math.max(1, Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / 60000));
    durationStr = `${durationMin} min`;
  }

  const finalTranscript = currentTranscriptMemory.length > 0 ? currentTranscriptMemory : currentTranscript;
  const finalParticipants = currentParticipantsMemory.length > 0 ? currentParticipantsMemory : currentParticipants;

  const meetingRecord = {
    id: "meet_" + Date.now(),
    meetCode: activeMeetCode || "unnamed-meet",
    title: `Google Meet (${activeMeetCode || "Call"})`,
    startTime: startTime || endTime,
    endTime,
    durationStr,
    transcript: finalTranscript,
    participants: finalParticipants,
    summary: "",
    keyPoints: "",
    decisions: "",
    actionItems: "",
    followUpEmail: "",
    createdAt: endTime
  };

  const updatedHistory = [meetingRecord, ...meetingHistory];
  await chrome.storage.local.set({
    meetingHistory: updatedHistory,
    isRecording: false,
    isTranscribing: false,
    isPaused: false,
    activeMeetCode: null,
    activeTabId: null
  });

  currentTranscriptMemory = [];
  currentParticipantsMemory = [];

  return { success: true, meeting: meetingRecord };
}

// --- Data Updaters ---

async function handleNewTranscriptLine(entry) {
  const data = await chrome.storage.local.get(["isPaused"]);
  if (data.isPaused) return { success: false, error: "Session is paused." };

  currentTranscriptMemory.push(entry);

  await chrome.storage.local.set({ currentTranscript: currentTranscriptMemory });

  // Broadcast to side panel immediately for instant UI update
  chrome.runtime.sendMessage({
    type: "CAPTION_LINE_ADDED",
    entry,
    totalLines: currentTranscriptMemory.length
  }).catch(() => {});

  return { success: true, totalLines: currentTranscriptMemory.length };
}

async function handleUpdateTranslation(id, translation) {
  const item = currentTranscriptMemory.find((e) => e.id === id);
  if (item) {
    item.translation = translation;
    await chrome.storage.local.set({ currentTranscript: currentTranscriptMemory });
    chrome.runtime.sendMessage({
      type: "TRANSCRIPT_TRANSLATION_UPDATED",
      id,
      translation
    }).catch(() => {});
  }
  return { success: true };
}

async function handleParticipantsUpdated(stats, meetCode) {
  if (!stats) return { success: false };

  currentParticipantsMemory = stats.list || [];

  await chrome.storage.local.set({
    stats: {
      total: stats.total || 0,
      desktop: stats.desktop || 0,
      mobile: stats.mobile || 0
    },
    currentParticipants: currentParticipantsMemory
  });

  return { success: true };
}

async function updateParticipantAttendance(name, present) {
  const { currentParticipants = [] } = await chrome.storage.local.get(["currentParticipants"]);
  const p = currentParticipants.find((item) => item.name === name);
  if (p) {
    p.present = present;
    await chrome.storage.local.set({ currentParticipants });
  }
  return { success: true };
}

async function addManualParticipant(p) {
  const { currentParticipants = [], stats = { total: 0, desktop: 0, mobile: 0 } } = await chrome.storage.local.get([
    "currentParticipants",
    "stats"
  ]);

  currentParticipants.push({
    name: p.name,
    device: p.device || "laptop",
    deviceLabel: p.device === "phone" ? "Phone / Mobile" : "Laptop / Desktop",
    isDialIn: p.device === "phone",
    firstSeen: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
    present: true
  });

  stats.total = currentParticipants.length;
  if (p.device === "phone") stats.mobile++;
  else stats.desktop++;

  await chrome.storage.local.set({ currentParticipants, stats });
  return { success: true };
}

async function deleteMeeting(meetingId) {
  const { meetingHistory = [] } = await chrome.storage.local.get(["meetingHistory"]);
  const filtered = meetingHistory.filter((m) => m.id !== meetingId);
  await chrome.storage.local.set({ meetingHistory: filtered });
  return { success: true };
}

// --- Translation Handler ---

async function handleTranslate(text, fromLang = "auto", toLang = "hi") {
  const { settings = DEFAULT_SETTINGS } = await chrome.storage.local.get(["settings"]);

  if (settings.backendUrl) {
    try {
      const res = await fetch(`${settings.backendUrl}/api/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, fromLang, toLang })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.translated) return { success: true, translated: data.translated };
      }
    } catch (backendErr) {}
  }

  try {
    const sl = fromLang || "auto";
    const tl = toLang || "hi";
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (data && data[0]) {
        const translated = data[0].map((item) => item[0]).join("");
        return { success: true, translated };
      }
    }
  } catch (err) {
    console.error("[Meet.ai] Translation fallback note:", err.message);
  }

  return { success: false, translated: text };
}

// --- AI Summary & Assistant Handler ---

async function handleGenerateAISummary(transcript, participants, meetCode, language = "en") {
  const { settings = DEFAULT_SETTINGS, meetingHistory = [] } = await chrome.storage.local.get([
    "settings",
    "meetingHistory"
  ]);

  if (!transcript || transcript.length === 0) {
    throw new Error("Cannot generate summary: Transcript is empty. Speak or enable captions during the meeting.");
  }

  const transcriptText = transcript.map((t) => `[${t.timeStr || "00:00"}] ${t.speaker}: ${t.text}`).join("\n");
  const participantList = (participants || []).map((p) => `${p.name} (${p.deviceLabel || p.device})`).join(", ");

  let result = null;

  if (settings.backendUrl) {
    try {
      const res = await fetch(`${settings.backendUrl}/api/summarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meetCode,
          participants: participantList,
          transcript: transcriptText,
          language
        })
      });

      if (res.ok) {
        result = await res.json();
      }
    } catch (err) {
      console.warn("[Meet.ai] Backend server not reachable, trying direct Gemini API...", err.message);
    }
  }

  if (!result && settings.geminiApiKey) {
    result = await callGeminiDirect(settings.geminiApiKey, settings.aiModel, transcriptText, participantList, meetCode, language);
  }

  if (!result) {
    result = generateRuleBasedSummary(transcript, participants, meetCode, language);
  }

  if (result) {
    const targetMeet = meetingHistory.find((m) => m.meetCode === meetCode || m.id === meetCode);
    if (targetMeet) {
      targetMeet.summary = result.summary || "";
      targetMeet.keyPoints = result.keyPoints || "";
      targetMeet.decisions = result.decisions || "";
      targetMeet.actionItems = result.actionItems || "";
      targetMeet.followUpEmail = result.followUpEmail || "";
      await chrome.storage.local.set({ meetingHistory });
    }
  }

  return { success: true, data: result };
}

async function callGeminiDirect(apiKey, model = "gemini-1.5-flash", transcriptText, participantList, meetCode, language = "en") {
  const langGuidance = language === "hi"
    ? "IMPORTANT: Generate the entire summary, key discussion points, decisions, action items, and email in Hindi (हिन्दी)."
    : language === "bilingual"
    ? "IMPORTANT: Provide key outputs with bilingual English and Hindi text."
    : "Generate the output in professional English.";

  const prompt = `You are an elite executive AI meeting assistant.
${langGuidance}

Analyze this Google Meet transcript and return a valid JSON object with the following exact keys:
- "summary": A concise, high-impact executive summary paragraph (3-5 sentences).
- "keyPoints": Bullet-pointed list of major discussion points and topics discussed.
- "decisions": Bullet-pointed list of key decisions, agreements, and announcements made.
- "actionItems": Bullet-pointed list of action items with assignees and deadlines where available.
- "followUpEmail": A ready-to-send professional follow-up email draft with Subject and Body.

Meeting Details:
Meet Code: ${meetCode}
Attendees: ${participantList}

Transcript:
${transcriptText}

Output strictly valid JSON only without markdown code fences or backticks.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errText}`);
  }

  const json = await response.json();
  const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error("Empty response from Gemini.");

  const cleanJson = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
  return JSON.parse(cleanJson);
}

function generateRuleBasedSummary(transcript, participants, meetCode, language = "en") {
  const fullText = transcript.map((t) => t.text).join(" ");
  const sentences = fullText.split(/(?<=[.?!])\s+/).filter(Boolean);
  const keySentences = sentences.slice(0, 5).join(" ");

  const actionKeywords = /\b(will|should|need to|must|action|todo|assign|by tomorrow|by next|deadline|follow up|send|submit|review)\b/i;
  const decisionKeywords = /\b(decided|agreed|approved|concluded|confirmed|finalized|chosen|resolved)\b/i;

  const actionItemsList = [];
  const decisionsList = [];

  transcript.forEach((t) => {
    if (actionKeywords.test(t.text)) {
      actionItemsList.push(`- [ ] **${t.speaker}:** ${t.text}`);
    }
    if (decisionKeywords.test(t.text)) {
      decisionsList.push(`- **${t.speaker}:** ${t.text}`);
    }
  });

  const isHindi = language === "hi";

  return {
    summary: isHindi
      ? `बैठक ${meetCode || ""} में ${participants.length} प्रतिभागियों के बीच कुल ${transcript.length} संवाद रिकॉर्ड किए गए। मुख्य चर्चा: ${keySentences.substring(0, 250)}...`
      : `Meeting ${meetCode || ""} captured ${transcript.length} speech segments across ${participants.length} participants. Key discussion initiated around: ${keySentences.substring(0, 300)}...`,
    keyPoints: transcript.slice(0, 6).map((t) => `- **${t.speaker}:** ${t.text}`).join("\n") || (isHindi ? "- सामान्य चर्चा बिंदु लॉग किए गए।" : "- General discussion points logged in transcript."),
    decisions: decisionsList.length > 0 ? decisionsList.join("\n") : (isHindi ? "- टीम ने चर्चा किए गए प्रस्ताव पर सहमति व्यक्त की।" : "- Team consensus aligned on items discussed in meeting."),
    actionItems: actionItemsList.length > 0 ? actionItemsList.join("\n") : (isHindi ? "- [ ] कार्य विवरणों की समीक्षा करें।" : "- [ ] Follow up on items noted in transcript."),
    followUpEmail: isHindi
      ? `विषय: बैठक कार्यवृत्त और मुख्य बिंदु: ${meetCode || "Google Meet"}\n\nनमस्ते टीम,\n\nआज की बैठक में भाग लेने के लिए धन्यवाद। यहाँ मुख्य बिंदुओं का सारांश है:\n\nमुख्य बिंदु:\n- टीम सदस्यों द्वारा चर्चा किए गए विषय।\n\nअगले कदम:\n- कृपया अपने निर्धारित कार्यों की समीक्षा करें।\n\nसादर,\nमीटिंग होस्ट`
      : `Subject: Follow-up & Minutes: Meeting ${meetCode || ""}\n\nHi Team,\n\nThank you for attending today's meeting. Here is a brief recap:\n\nKey Points:\n- Topics discussed by team members.\n\nNext Steps:\n- Please review the action items and proceed accordingly.\n\nBest regards,\nMeeting Host`
  };
}
