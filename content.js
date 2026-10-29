/**
 * Meet.ai - Content Script for Google Meet (Manifest V3)
 * Provides reliable Google Meet caption capture using actual DOM elements,
 * device detection (Laptop vs Phone), in-meet notification banner, and floating subtitles.
 */

(function () {
  console.log("%c[Meet.ai] Content script loaded on Google Meet page.", "color: #38bdf8; font-weight: bold;");

  // --- Configuration & Selectors ---
  const SELECTORS = {
    // Google Meet captions container wrappers
    captionContainers: [
      '.a4cQT',
      'div[aria-live="polite"]',
      'div[aria-live="assertive"]',
      'div[role="region"][aria-label*="Captions" i]',
      'div[role="region"][aria-label*="subtitles" i]',
      'div[jsname="tgaKEf"]',
      'div[jscontroller="D1tHje"]',
      'div[jscontroller="K4n4Eb"]'
    ].join(', '),

    // Caption blocks (one row per speaker turn)
    captionBlocks: [
      '.iTTPOb',
      '.nMHgL',
      '.bh44bd',
      '.TBMuR',
      '.a4cQT > div',
      'div[aria-live="polite"] > div',
      'div[jsname="tgaKEf"] > div'
    ].join(', '),

    // Speaker elements inside a caption block
    speakerNames: [
      '.zs7LEd',
      'img.K6W0fd',
      '[data-sender-name]',
      'span.poAEaf',
      '.NWpY1d',
      '.jxFHg',
      '[jsname="V67aGc"]',
      'span[dir="auto"]'
    ].join(', '),

    // Text containers inside a caption block
    captionTexts: [
      '.ygxPAd',
      'span[jsname="YSvyTc"]',
      'div[jsname="YSvyTc"]',
      '.CNHioc',
      'span.VbkSUe',
      'span[dir="ltr"]'
    ].join(', '),

    // Closed Caption (CC) toggle button
    ccButtons: [
      'button[aria-label*="caption" i]',
      'button[aria-label*="subtitles" i]',
      'button[data-tooltip*="caption" i]',
      'button[jsname="r8qRAd"]'
    ].join(', ')
  };

  // --- State ---
  let activeMeetCode = null;
  let isCapturing = false;
  let captionObserver = null;
  let captionSafetyInterval = null;
  let participantScanInterval = null;

  // Participant device roster
  const participantMap = new Map();

  // Utterance Buffering & Deduplication
  let currentSpeaker = "";
  let currentCaptionText = "";
  let captionDebounceTimer = null;
  const finalizedUtteranceHistory = []; // { speaker, text, clean, time }

  // Translation configuration
  let translationConfig = { enabled: true, sourceLang: "en", targetLang: "hi", showOverlay: true };

  // DOM Elements injected
  let bannerEl = null;
  let subtitlesBarEl = null;

  function extractMeetCode() {
    const match = window.location.pathname.match(/\/([a-z]{3}-[a-z]{4}-[a-z]{3})/i);
    return match ? match[1].toLowerCase() : null;
  }

  // --- 1. Notification Banner & Subtitle Overlay ---

  function createInMeetUI() {
    if (!document.getElementById("meetai-banner")) {
      bannerEl = document.createElement("div");
      bannerEl.id = "meetai-banner";
      bannerEl.style.display = "none";
      bannerEl.innerHTML = `
        <span class="meetai-dot" id="meetai-status-dot"></span>
        <div class="meetai-text">
          <span style="font-weight: 700;">Meet.ai</span>
          <span id="meetai-device-summary" class="meetai-badge">👥 0 | 💻 0 | 📱 0</span>
          <span id="meetai-caption-status" class="meetai-caption-pill">⚪ Checking captions...</span>
          <button id="meetai-quick-cc-btn" class="meetai-action-btn" style="display: none;">Turn on CC</button>
        </div>
        <button id="meetai-banner-close" class="meetai-btn" title="Dismiss banner">✕</button>
      `;
      document.body.appendChild(bannerEl);

      document.getElementById("meetai-banner-close")?.addEventListener("click", () => {
        bannerEl.style.display = "none";
      });

      document.getElementById("meetai-quick-cc-btn")?.addEventListener("click", () => {
        tryEnableMeetCaptions(true);
      });
    }

    if (!document.getElementById("meetai-subtitles-bar")) {
      subtitlesBarEl = document.createElement("div");
      subtitlesBarEl.id = "meetai-subtitles-bar";
      subtitlesBarEl.innerHTML = `
        <div class="speaker-name" id="meetai-sub-speaker">Speaker</div>
        <div class="original-text" id="meetai-sub-orig">Listening for captions...</div>
        <div class="translated-text" id="meetai-sub-trans" style="display: none;"></div>
      `;
      document.body.appendChild(subtitlesBarEl);
    }
  }

  function updateInMeetBanner(stats) {
    const summary = document.getElementById("meetai-device-summary");
    if (summary && stats) {
      summary.textContent = `👥 ${stats.total} | 💻 ${stats.desktop} | 📱 ${stats.mobile}`;
    }
    if (bannerEl && isCapturing) {
      bannerEl.style.display = "flex";
    }
  }

  function updateCaptionStatusUI(isActive, message, showCcAction = false) {
    const pill = document.getElementById("meetai-caption-status");
    const dot = document.getElementById("meetai-status-dot");
    const ccBtn = document.getElementById("meetai-quick-cc-btn");

    if (pill) pill.textContent = message;
    if (dot) {
      dot.className = isActive ? "meetai-dot live" : "meetai-dot warning";
    }
    if (ccBtn) {
      ccBtn.style.display = showCcAction ? "inline-block" : "none";
    }

    // Broadcast status to side panel and background
    chrome.runtime.sendMessage({
      type: "CAPTION_STATUS_CHANGED",
      status: isActive ? "ACTIVE" : "INACTIVE",
      statusText: message
    }).catch(() => {});
  }

  function showSubtitle(speaker, originalText, translatedText) {
    if (!subtitlesBarEl || !translationConfig.showOverlay) return;

    const spkEl = document.getElementById("meetai-sub-speaker");
    const origEl = document.getElementById("meetai-sub-orig");
    const transEl = document.getElementById("meetai-sub-trans");

    if (spkEl) spkEl.textContent = speaker || "Participant";
    if (origEl) origEl.textContent = originalText;
    if (transEl) {
      if (translatedText) {
        transEl.textContent = translatedText;
        transEl.style.display = "block";
      } else {
        transEl.style.display = "none";
      }
    }

    subtitlesBarEl.classList.add("visible");

    clearTimeout(subtitlesBarEl._hideTimer);
    subtitlesBarEl._hideTimer = setTimeout(() => {
      subtitlesBarEl.classList.remove("visible");
    }, 4500);
  }

  // --- 2. Reliable Caption Extraction & Observer ---

  function extractSpeakerAndText(block) {
    if (!block || !block.isConnected) return null;

    // 1. Extract Speaker
    let speaker = "";
    const speakerEl = block.querySelector(SELECTORS.speakerNames);
    if (speakerEl) {
      if (speakerEl.tagName === "IMG") {
        speaker = speakerEl.getAttribute("alt") || "";
      } else {
        speaker = speakerEl.innerText || speakerEl.textContent || "";
      }
    }

    speaker = speaker.trim();

    // 2. Extract Speech Text
    let text = "";
    const textEls = block.querySelectorAll(SELECTORS.captionTexts);
    if (textEls.length > 0) {
      text = Array.from(textEls)
        .map((el) => el.innerText || el.textContent || "")
        .join(" ")
        .trim();
    } else {
      // Fallback: entire text in block excluding speaker
      text = block.innerText || block.textContent || "";
      if (speaker && text.startsWith(speaker)) {
        text = text.slice(speaker.length).trim();
      }
    }

    // Clean up text
    text = text.replace(/^[:\-–\s]+/, "").trim();

    return { speaker: speaker || "Participant", text };
  }

  /**
   * Processes a detected caption block
   */
  function handleCaptionBlock(block) {
    const data = extractSpeakerAndText(block);
    if (!data || !data.text || data.text.length < 2) return;

    const { speaker, text } = data;

    // If speaker switched, immediately flush previous speaker's utterance
    if (currentSpeaker && speaker !== currentSpeaker && currentCaptionText) {
      commitFinalizedUtterance(currentSpeaker, currentCaptionText);
      currentCaptionText = "";
    }

    currentSpeaker = speaker;
    currentCaptionText = text;

    // Reset debounce timer: once speaker pauses for 950ms, finalize line
    clearTimeout(captionDebounceTimer);
    captionDebounceTimer = setTimeout(() => {
      if (currentCaptionText) {
        commitFinalizedUtterance(currentSpeaker, currentCaptionText);
        currentCaptionText = "";
      }
    }, 950);

    // Live Subtitle Overlay & Live Status Preview
    showSubtitle(currentSpeaker, currentCaptionText, null);
    chrome.runtime.sendMessage({
      type: "LIVE_CAPTION_PREVIEW",
      speaker: currentSpeaker,
      previewText: currentCaptionText
    }).catch(() => {});
  }

  /**
   * Finalizes an utterance, checks against duplicates, and sends to background & sidepanel
   */
  function commitFinalizedUtterance(speaker, text) {
    if (!text || !text.trim()) return;
    const trimmed = text.trim();

    // Normalized string for duplicate checking
    const clean = trimmed.toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
    if (!clean || clean.length < 2) return;

    const now = Date.now();

    // Check recent lines within the last 6 seconds to avoid duplicates
    const isDuplicate = finalizedUtteranceHistory.some((item) => {
      const age = now - item.time;
      if (age > 6500) return false;
      if (item.clean === clean) return true;
      if (item.speaker === speaker && item.clean.includes(clean)) return true;
      return false;
    });

    if (isDuplicate) {
      console.log("[Meet.ai Captions] Suppressed duplicate utterance:", trimmed);
      return;
    }

    // Add to history ring buffer
    finalizedUtteranceHistory.push({ speaker, text: trimmed, clean, time: now });
    if (finalizedUtteranceHistory.length > 20) finalizedUtteranceHistory.shift();

    console.log(`%c[Meet.ai Captions] Finalized: [${speaker}]: "${trimmed}"`, "color: #38bdf8; font-weight: bold;");

    finalizeCaptionLine(speaker, trimmed);
  }

  /**
   * Dispatches finalized caption line and triggers asynchronous translation
   */
  async function finalizeCaptionLine(speaker, trimmedText) {
    const timestamp = new Date().toISOString();
    const d = new Date();
    const timeStr = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

    // Look up speaker device
    const participant = participantMap.get(speaker);
    const device = participant?.device || "laptop";

    const entryId = "line_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5);

    // Construct the transcript entry
    const entry = {
      id: entryId,
      speaker,
      device,
      text: trimmedText,
      translation: null,
      timestamp,
      timeStr
    };

    // Immediately dispatch line to Background Service Worker and Side Panel
    chrome.runtime.sendMessage({
      type: "NEW_TRANSCRIPT_LINE",
      entry
    }).catch((err) => console.warn("[Meet.ai] Error sending transcript line:", err));

    // Handle Live Translation asynchronously without blocking
    if (translationConfig.enabled && translationConfig.targetLang !== "none") {
      translateText(trimmedText, translationConfig.sourceLang, translationConfig.targetLang)
        .then((translated) => {
          if (translated) {
            entry.translation = translated;
            showSubtitle(speaker, trimmedText, translated);
            // Broadcast translation update
            chrome.runtime.sendMessage({
              type: "UPDATE_TRANSCRIPT_TRANSLATION",
              id: entryId,
              translation: translated
            }).catch(() => {});
          }
        })
        .catch((err) => console.warn("[Meet.ai] Translation note:", err.message));
    } else {
      showSubtitle(speaker, trimmedText, null);
    }
  }

  /**
   * Scans all visible caption blocks currently rendered in the DOM
   */
  function scanAllVisibleCaptions() {
    if (!isCapturing) return;

    // Check if CC is ON or OFF in Meet
    const ccBtn = document.querySelector(SELECTORS.ccButtons);
    const isCcActive = ccBtn && (
      ccBtn.getAttribute("aria-pressed") === "true" ||
      ccBtn.getAttribute("data-is-muted") === "false" ||
      ccBtn.classList.contains("active") ||
      document.querySelector(SELECTORS.captionContainers) !== null
    );

    const captionBlocks = document.querySelectorAll(SELECTORS.captionBlocks);

    if (captionBlocks.length > 0) {
      updateCaptionStatusUI(true, "🟢 Captions Active: Monitoring speech");
      captionBlocks.forEach((block) => handleCaptionBlock(block));
    } else if (isCcActive) {
      updateCaptionStatusUI(true, "🟢 Captions Active: Waiting for speech...");
    } else {
      updateCaptionStatusUI(false, "⚠️ Closed Captions (CC) are OFF in Google Meet", true);
    }
  }

  /**
   * Start the reliable MutationObserver
   */
  function startCaptionObserver() {
    if (captionObserver) return;

    console.log("[Meet.ai Captions] Initializing MutationObserver on document.body...");

    captionObserver = new MutationObserver((mutations) => {
      if (!isCapturing) return;

      for (const mutation of mutations) {
        // 1. Check if mutation occurred inside or is a caption block
        let block = null;
        if (mutation.target && mutation.target.nodeType === Node.ELEMENT_NODE) {
          block = mutation.target.closest?.(SELECTORS.captionBlocks);
        } else if (mutation.target?.parentElement) {
          block = mutation.target.parentElement.closest?.(SELECTORS.captionBlocks);
        }

        if (block) {
          handleCaptionBlock(block);
        }

        // 2. Check added nodes
        if (mutation.addedNodes && mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const b = node.closest?.(SELECTORS.captionBlocks) || node.querySelector?.(SELECTORS.captionBlocks);
              if (b) handleCaptionBlock(b);
            }
          }
        }
      }
    });

    captionObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });

    // Immediate initial scan of existing captions
    scanAllVisibleCaptions();

    // Safety polling fallback every 400ms to guarantee zero missed words
    if (!captionSafetyInterval) {
      captionSafetyInterval = setInterval(scanAllVisibleCaptions, 400);
    }

    console.log("%c[Meet.ai Captions] Observer & safety poller active.", "color: #22c55e; font-weight: bold;");
  }

  function stopCaptionObserver() {
    if (captionObserver) {
      captionObserver.disconnect();
      captionObserver = null;
    }
    if (captionSafetyInterval) {
      clearInterval(captionSafetyInterval);
      captionSafetyInterval = null;
    }
    if (currentCaptionText) {
      commitFinalizedUtterance(currentSpeaker, currentCaptionText);
      currentCaptionText = "";
    }
    console.log("[Meet.ai Captions] Observer stopped.");
  }

  // --- 3. Closed Caption Toggle Helper ---

  function tryEnableMeetCaptions(forceClick = false) {
    const ccBtn = document.querySelector(SELECTORS.ccButtons);
    if (ccBtn) {
      const isMuted = ccBtn.getAttribute("aria-pressed") === "false" ||
                      ccBtn.getAttribute("data-is-muted") === "true";
      if (isMuted || forceClick) {
        ccBtn.click();
        console.log("[Meet.ai] Clicked Google Meet CC button to enable captions.");
        setTimeout(scanAllVisibleCaptions, 600);
      }
    }
  }

  // --- 4. Device Detection: Laptop vs Mobile / Phone ---

  function classifyParticipantDevice(element, nameText) {
    const phoneRegex = /^\+?[0-9\s\-()]{7,}$/;
    if (phoneRegex.test(nameText.trim())) {
      return { device: "phone", label: "Phone (Dial-in)", isDialIn: true };
    }

    if (/\((phone|dial-in|mobile)\)/i.test(nameText)) {
      return { device: "phone", label: "Phone (Dial-in)", isDialIn: true };
    }

    const icons = element.querySelectorAll("i, span.material-icons, span.google-material-icons, svg");
    for (const icon of icons) {
      const text = (icon.textContent || "").trim().toLowerCase();
      const aria = (icon.getAttribute("aria-label") || "").toLowerCase();
      if (
        text === "phone" ||
        text === "call" ||
        text === "dialpad" ||
        text === "phone_in_talk" ||
        text === "call_received" ||
        aria.includes("phone") ||
        aria.includes("dial-in")
      ) {
        return { device: "phone", label: "Phone (Dial-in)", isDialIn: true };
      }
    }

    const ariaText = (element.getAttribute("aria-label") || "").toLowerCase();
    if (ariaText.includes("phone") || ariaText.includes("dial-in")) {
      return { device: "phone", label: "Phone (Dial-in)", isDialIn: true };
    }

    const video = element.querySelector("video");
    if (video && video.videoHeight > 0 && video.videoWidth > 0) {
      if (video.videoHeight > video.videoWidth * 1.15) {
        return { device: "phone", label: "Phone (Mobile App)", isDialIn: false };
      }
    }

    const allText = (element.innerText || "").toLowerCase();
    if (allText.includes("mobile") || allText.includes("from phone")) {
      return { device: "phone", label: "Phone (Mobile App)", isDialIn: false };
    }

    return { device: "laptop", label: "Laptop / Desktop", isDialIn: false };
  }

  function scanParticipants() {
    activeMeetCode = extractMeetCode();
    if (!activeMeetCode) return;

    const now = new Date().toISOString();

    let meetTotalFromBadge = null;
    const peopleBtn = document.querySelector('button[aria-label*="People" i], button[aria-label*="Show everyone" i], button[data-panel-id="1"]');
    if (peopleBtn) {
      const aria = peopleBtn.getAttribute("aria-label") || "";
      const match = aria.match(/(\d+)/);
      if (match) {
        meetTotalFromBadge = parseInt(match[1], 10);
      } else {
        const badge = peopleBtn.querySelector("span, div");
        const bMatch = badge?.textContent?.match(/(\d+)/);
        if (bMatch) meetTotalFromBadge = parseInt(bMatch[1], 10);
      }
    }

    const currentSeenNames = new Set();

    const participantRows = document.querySelectorAll(
      'div[role="listitem"], div[data-participant-id], div[data-requested-participant-id], .zWGUib, .ZjFb7c'
    );

    participantRows.forEach((row) => {
      let nameEl = row.querySelector('.zWGUib, span[dir="auto"], .ZjFb7c, div[role="heading"]') || row;
      let name = (nameEl.innerText || nameEl.textContent || "").split("\n")[0].trim();
      const cleanName = name.replace(/\s*\((You|Presentation|Host|Meeting Host)\)/gi, "").trim();

      if (cleanName && cleanName.length > 1 && !cleanName.toLowerCase().includes("everyone") && !cleanName.toLowerCase().includes("in-call")) {
        currentSeenNames.add(cleanName);
        const { device, label, isDialIn } = classifyParticipantDevice(row, name);

        if (!participantMap.has(cleanName)) {
          participantMap.set(cleanName, {
            name: cleanName,
            device,
            deviceLabel: label,
            isDialIn,
            firstSeen: now,
            lastSeen: now,
            present: true
          });
        } else {
          const p = participantMap.get(cleanName);
          p.lastSeen = now;
          p.present = true;
          if (device === "phone") {
            p.device = "phone";
            p.deviceLabel = label;
            p.isDialIn = isDialIn;
          }
        }
      }
    });

    const videoTiles = document.querySelectorAll('div[data-participant-id], div[data-allocation-id]');
    videoTiles.forEach((tile) => {
      const nameEl = tile.querySelector('div[role="heading"], span, .zWGUib');
      const name = (nameEl?.innerText || nameEl?.textContent || "").split("\n")[0].trim();
      const cleanName = name.replace(/\s*\((You|Presentation|Host)\)/gi, "").trim();

      if (cleanName && cleanName.length > 1 && !cleanName.includes(":") && cleanName !== "...") {
        currentSeenNames.add(cleanName);
        const { device, label, isDialIn } = classifyParticipantDevice(tile, name);
        if (!participantMap.has(cleanName)) {
          participantMap.set(cleanName, {
            name: cleanName,
            device,
            deviceLabel: label,
            isDialIn,
            firstSeen: now,
            lastSeen: now,
            present: true
          });
        } else {
          const p = participantMap.get(cleanName);
          p.lastSeen = now;
          p.present = true;
          if (device === "phone") {
            p.device = "phone";
            p.deviceLabel = label;
          }
        }
      }
    });

    // Check if previously present attendees have left (not seen for > 15 seconds)
    if (currentSeenNames.size > 0) {
      const nowMs = Date.now();
      participantMap.forEach((p, name) => {
        if (!currentSeenNames.has(name) && name !== "You") {
          const lastSeenMs = new Date(p.lastSeen).getTime();
          if (nowMs - lastSeenMs > 15000) {
            p.present = false;
          }
        }
      });
    }

    if (participantMap.size === 0) {
      participantMap.set("You", {
        name: "You",
        device: "laptop",
        deviceLabel: "Laptop / Desktop",
        isDialIn: false,
        firstSeen: now,
        lastSeen: now,
        present: true
      });
    }

    const list = Array.from(participantMap.values());
    let desktop = 0;
    let mobile = 0;

    list.forEach((p) => {
      if (p.device === "phone") mobile++;
      else desktop++;
    });

    const total = Math.max(list.length, meetTotalFromBadge || 0);
    const stats = { total, desktop, mobile, list };

    updateInMeetBanner(stats);

    chrome.runtime.sendMessage({
      type: "PARTICIPANTS_UPDATED",
      meetCode: activeMeetCode,
      stats
    }).catch(() => {});
  }

  // --- 5. Translation Helper ---

  async function translateText(text, fromLang, toLang) {
    if (!text || !text.trim()) return "";
    
    try {
      const response = await chrome.runtime.sendMessage({
        type: "TRANSLATE_TEXT",
        text,
        fromLang,
        toLang
      });
      if (response && response.translated) {
        return response.translated;
      }
    } catch (e) {}

    // Fallback: Public translation endpoint
    try {
      const sl = fromLang || "auto";
      const tl = toLang || "hi";
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(text)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data && data[0]) {
        return data[0].map((item) => item[0]).join("");
      }
    } catch (err) {}

    return null;
  }

  // --- 6. Message Listener ---

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "PING_MEET_TAB") {
      const code = extractMeetCode();
      sendResponse({
        isMeet: !!code,
        meetCode: code,
        participantsCount: participantMap.size,
        stats: {
          total: participantMap.size,
          desktop: Array.from(participantMap.values()).filter(p => p.device !== "phone").length,
          mobile: Array.from(participantMap.values()).filter(p => p.device === "phone").length,
          list: Array.from(participantMap.values())
        }
      });
      return true;
    }

    if (message.type === "START_MEET_CAPTURE") {
      isCapturing = true;
      activeMeetCode = extractMeetCode();
      createInMeetUI();
      tryEnableMeetCaptions(false);
      startCaptionObserver();

      if (!participantScanInterval) {
        scanParticipants();
        participantScanInterval = setInterval(scanParticipants, 2000);
      }

      sendResponse({ success: true, meetCode: activeMeetCode });
      return true;
    }

    if (message.type === "STOP_MEET_CAPTURE") {
      isCapturing = false;
      stopCaptionObserver();
      if (participantScanInterval) {
        clearInterval(participantScanInterval);
        participantScanInterval = null;
      }
      if (bannerEl) bannerEl.style.display = "none";
      if (subtitlesBarEl) subtitlesBarEl.classList.remove("visible");

      sendResponse({ success: true });
      return true;
    }

    if (message.type === "TOGGLE_MEET_CC") {
      tryEnableMeetCaptions(true);
      sendResponse({ success: true });
      return true;
    }

    if (message.type === "UPDATE_TRANSLATION_SETTINGS") {
      translationConfig = { ...translationConfig, ...message.settings };
      sendResponse({ success: true });
      return true;
    }

    if (message.type === "SYNC_PARTICIPANTS") {
      scanParticipants();
      sendResponse({
        success: true,
        list: Array.from(participantMap.values())
      });
      return true;
    }
  });

  // Self-initialize UI and passive observer
  createInMeetUI();
  scanParticipants();
  participantScanInterval = setInterval(scanParticipants, 3000);

})();
