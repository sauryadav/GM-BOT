# 🤖 MeetMind AI - Autonomous Google Meet Bot & Chrome Extension Platform

**MeetMind AI** is a complete, dual-mode intelligence platform for Google Meet:
1. 🚀 **Autonomous Headless Meeting Bot & Live Web Dashboard** — A standalone Node.js & Puppeteer bot that joins any Google Meet call by URL (`meet.google.com/xxx-xxxx-xxx`), automatically mutes mic & camera, transcribes live speech, detects attendee devices (**Laptop/PC vs. Phone/Mobile**), streams live Hindi ⇄ English translations via WebSockets, and compiles AI Minutes of Meeting (MoM).
2. 🧩 **Chrome Extension (Manifest V3)** — A side-by-side Chrome Side Panel assistant for users who want real-time meeting assistance directly inside their personal browser.

---

## 🌟 Key Features

### 1. 🤖 Autonomous Google Meet Bot (Server & Web Dashboard)
- **URL-Based Joining:** Simply paste a Google Meet URL or code (`meet.google.com/abc-defg-hij`) into the dashboard and click **▶ Join Meeting**.
- **Camera & Mic Bypass:** Automatically launches headless Chromium with `--use-fake-ui-for-media-stream`, `--mute-audio`, and auto-granted browser permissions.
- **Smart Room Navigation:** Handles pre-join name entry, disables camera/mic buttons, clicks "Ask to join" / "Join now", and monitors waiting rooms until admitted by the host.
- **Live Caption Ingestion:** Enables closed captions and streams incremental speaker statements in real time directly to the Web Dashboard.
- **WebSocket Streaming:** Full-duplex WebSocket connection (`ws://localhost:3000/ws`) broadcasting live speech, participant arrivals/departures, and bot status changes.
- **Built-in Demo Test Run:** 1-click test button (`🧪 Demo Test Run`) simulates a real meeting session end-to-end without needing an active Google Meet call.

---

### 2. 👥 Laptop vs. Phone Device Tracker & Attendance
- **Live Participant Count:** Real-time counter of total attendees in the meeting.
- **Hardware & Device Classification:**
  - 💻 **Laptop / Desktop (Web):** Browser attendees, 16:9 webcam feeds, keyboard interactions.
  - 📱 **Phone / Mobile / Dial-in:** Dial-in telephone callers, phone handset icons, vertical 9:16 mobile camera feeds, and mobile app clients.
- **Visual Status Badges:** Displayed next to every participant in the Live Feed, Attendance Roster, and exported reports.
- **Arrival & Departure Detection:** Logs when participants join and automatically marks departed members when they leave.
- **1-Click Attendance CSV:** Export complete rosters with Name, Device Type, Camera Status, First Seen, Last Seen, and Duration in minutes.

---

### 3. 🧠 Multilingual AI Minutes & Meeting Assistant
- **Powered by Google Gemini (with Intelligent Fallback):** Uses Google Gemini 1.5 Flash when configured, or smart NLP rule-based extraction if no API key is set.
- **Executive Summary:** Concise 3-5 sentence synthesis of the meeting.
- **Key Discussion Points:** Bullet-point extraction of core agenda items and debates.
- **Decisions & Announcements:** Clear log of agreements and key updates.
- **Action Items & Deadlines:** Actionable task extraction (`- [ ] [Assignee] Task (Deadline: Date)`).
- **Executive Follow-up Email Draft:** Ready-to-send follow-up email recap with subject line.
- **Objective Sentiment & Climate Analysis:** High-level meeting tone indicators (Constructive, Positive, Neutral, Concerns Flagged).

---

### 4. 🌐 Real-Time Hindi ⇄ English Translation
- Automatically identifies speech language.
- Translates **English ➔ Hindi** and **Hindi ➔ English** in real time.
- Displays original speech alongside translated text in both the Web Dashboard and Extension Side Panel.

---

### 5. 📑 Multi-Format Exporting & Local History
- **Plain Text (`.txt`):** Structured meeting minutes and full transcript.
- **Markdown (`.md`):** Formatted report ready for GitHub, Notion, or Obsidian.
- **Attendance CSV (`.csv`):** Standard CSV format for Excel and Google Sheets.
- **Printable HTML / PDF (`.html`):** Beautiful dark-theme executive report ready for 1-click printing or PDF export.
- **Meeting History:** View, search, filter, and re-download past meeting records anytime.

---

## 📁 Repository Structure

```
meet.ai/
├── server/                              # Autonomous Bot & Web Dashboard Platform
│   ├── server.js                        # Express + WebSocket server & REST APIs
│   ├── bot/
│   │   ├── meetBot.js                   # Puppeteer Google Meet orchestrator & mock runner
│   │   ├── deviceClassifier.js          # Laptop vs Phone heuristic classifier & tracker
│   │   └── captionProcessor.js          # Sentence aggregator & duplicate suppressor
│   ├── services/
│   │   ├── aiService.js                 # Gemini AI integration + rule-based MoM fallback
│   │   ├── translationService.js        # Google GTX + Gemini bilingual translation
│   │   ├── sentimentService.js          # Objective meeting sentiment analysis
│   │   ├── storageService.js            # Local JSON meeting history persistence
│   │   └── reportService.js             # TXT, Markdown, CSV, HTML, and PDF generator
│   ├── public/                          # Web Dashboard UI (http://localhost:3000)
│   │   ├── index.html                   # Bot control panel, live feed & reports UI
│   │   ├── css/style.css                # Modern responsive dark-mode styling
│   │   └── js/app.js                    # Reactive dashboard controller & WebSocket client
│   ├── package.json                     # Server dependencies (puppeteer, express, ws, etc.)
│   └── .env.example                     # Server configuration template
│
├── manifest.json                        # Chrome Extension Manifest V3
├── background.js                        # Extension service worker & audio session manager
├── content.js                           # Extension Meet DOM observer & caption scraper
├── content.css                          # Extension in-meet subtitles & status badge
├── offscreen.html / offscreen.js        # Manifest V3 offscreen tab audio recorder
├── sidepanel.html / .js / .css          # Chrome Side Panel UI & live meeting assistant
├── popup.html / popup.js                # Toolbar quick launcher popup
├── export-utils.js                      # Extension export utilities (CSV, MD, TXT, HTML)
│
└── test/                                # Automated Test Suites (All passing ✔)
    ├── test-meet-bot.js                 # Full Bot lifecycle & mock runner test
    ├── test-server-boot.js              # Real server startup & health check probe
    ├── test-device-classifier.js        # Laptop vs Phone classification heuristics
    ├── test-caption-observer.js         # Meet caption parsing, debouncing & deduplication
    ├── test-attendance-departure.js     # Participant arrival/departure tracking test
    ├── test-export-utils.js             # CSV, Markdown, TXT, and PDF formatting test
    └── test-backend.js                  # Backend REST API and translation tests
```

---

## 🚀 Quick Start Guide

### Option A: Run the Autonomous Google Meet Bot (Recommended)

The autonomous bot runs on your machine and joins Google Meet calls automatically without needing to install the Chrome extension.

#### 1. Start the Server
```bash
cd server
npm start
```

You will see:
```
=======================================================
🤖 MeetMind AI - Google Meet AI Meeting Bot Platform
📡 Server running on http://localhost:3000
🌐 Web Dashboard accessible at http://localhost:3000
⚡ WebSocket stream active at ws://localhost:3000/ws
🔑 Gemini API Key status: NOT CONFIGURED (Smart rule-based fallback active)
=======================================================
```

#### 2. Open the Web Dashboard
Open your browser and navigate to:
```
http://localhost:3000
```

#### 3. Test or Join a Meeting
- **To test immediately:** Click **🧪 Demo Test Run**. The dashboard will simulate a meeting session, demonstrate real-time speech capture with Laptop vs Phone badges, translate dialogue, and generate a full AI meeting summary.
- **To join a live Google Meet call:**
  1. Paste your meeting URL (e.g. `https://meet.google.com/xxx-xxxx-xxx`) into the top input bar.
  2. Click **▶ Join Meeting**.
  3. The headless bot will navigate to the meeting, bypass mic/camera access, enter the meeting room, and turn on captions.
  4. The host clicks "Admit" in Google Meet.
  5. The bot streams speech, updates attendance, and translates in real time!
  6. Click **⏹ Stop & Generate Report** to finalize the meeting and download your reports.

#### 4. Configure Google Gemini (Optional)
To enable Gemini AI for summarization, copy `.env.example` to `.env` in `server/` and add your key:
```env
PORT=3000
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-1.5-flash
```
*(Or enter your Gemini API key directly in **Settings** on the Web Dashboard!)*

---

### Option B: Load the Chrome Extension

If you prefer using the side-by-side Chrome Side Panel inside your own browser window:

1. Open Google Chrome and go to `chrome://extensions`.
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked** (top-left corner).
4. Select the project root folder:
   ```
   C:\Users\bhais\Desktop\meet.ai
   ```
5. Open any Google Meet call (`https://meet.google.com/xxx-xxxx-xxx`).
6. Click the **MeetMind AI** icon in your Chrome toolbar and open the **Side Panel**.
7. Click **▶ Start Meeting Assistant**.

---

## 🧪 Automated Test Suite

Run all verification tests from the project root directory:

```bash
# 1. Autonomous Bot end-to-end lifecycle, mock meeting & report exports
node test/test-meet-bot.js

# 2. Real Server boot & /api/health verification probe
node test/test-server-boot.js

# 3. Laptop vs. Phone device classification heuristics
node test/test-device-classifier.js

# 4. Google Meet caption scraper, incremental debouncing & deduplication
node test/test-caption-observer.js

# 5. Participant arrival, departure & attendance status
node test/test-attendance-departure.js

# 6. CSV, TXT, Markdown, and Printable HTML report export formatting
node test/test-export-utils.js

# 7. Backend REST endpoints and Hindi <-> English translation
node test/test-backend.js
```

All 7 test suites pass with 100% green checkmarks (`✔`).

---

## 🔒 Privacy, Security & Data Handling

- **No Third-Party Audio Leakage:** The bot does not stream audio to unvetted external servers.
- **Safe AI Ingestion:** Transcripts are processed through your configured Google Gemini key or local NLP summarizer. Secret API keys are never stored in client-side bundles.
- **Local Persistence:** Meeting records and attendance history are stored locally in `server/data/meetings/` on your own machine.
- **Meeting Consent:** When joining meetings, the bot displays its configured name (e.g. `MeetMind AI Notetaker`) and respects standard meeting host admission controls.
