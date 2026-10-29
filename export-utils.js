/**
 * Meet.ai - Export Utilities
 * Generates formatted text, Markdown, CSV, and HTML for print/PDF
 */

function formatTimestamp(isoString) {
  if (!isoString) return "--:--:--";
  const d = new Date(isoString);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatDate(isoString) {
  if (!isoString) return new Date().toLocaleDateString();
  return new Date(isoString).toLocaleDateString([], {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

/**
 * Format Attendance records into standard CSV string
 */
function formatAttendanceCsv(meeting) {
  const participants = meeting.participants || [];
  const headers = ["Name", "Device", "Status", "First Seen", "Last Seen", "Duration (Min)"];
  
  const rows = participants.map((p) => {
    const first = p.firstSeen ? new Date(p.firstSeen) : null;
    const last = p.lastSeen ? new Date(p.lastSeen) : null;
    let durationMin = 0;
    if (first && last) {
      durationMin = Math.max(1, Math.round((last.getTime() - first.getTime()) / 60000));
    }
    
    const escapeCsv = (str) => {
      const s = String(str || "").replace(/"/g, '""');
      return `"${s}"`;
    };

    const statusStr = p.present ? "Present" : (p.lastSeen && p.firstSeen && p.lastSeen !== p.firstSeen ? "Left" : "Absent");

    return [
      escapeCsv(p.name),
      escapeCsv(p.deviceLabel || (p.device === "phone" ? "Phone / Mobile" : "Laptop / Desktop")),
      escapeCsv(statusStr),
      escapeCsv(first ? first.toLocaleTimeString() : "--"),
      escapeCsv(last ? last.toLocaleTimeString() : "--"),
      durationMin
    ].join(",");
  });

  return [headers.join(","), ...rows].join("\r\n");
}

/**
 * Format raw transcript into TXT
 */
function formatTranscriptTxt(meeting) {
  const lines = [
    `MEET.AI - MEETING TRANSCRIPT`,
    `Meet Code: ${meeting.meetCode || "Unknown"}`,
    `Date: ${formatDate(meeting.startTime)}`,
    `Start Time: ${formatTimestamp(meeting.startTime)}`,
    `Total Participants: ${meeting.participants?.length || 0}`,
    `------------------------------------------------------------\n`
  ];

  const transcript = meeting.transcript || [];
  if (transcript.length === 0) {
    lines.push("(No speech captured)");
  } else {
    transcript.forEach((entry) => {
      const time = entry.timeStr || formatTimestamp(entry.timestamp);
      const speaker = entry.speaker || "Participant";
      const deviceTag = entry.device ? ` [${entry.device === "phone" ? "Phone" : "Laptop"}]` : "";
      lines.push(`[${time}] ${speaker}${deviceTag}: ${entry.text}`);
      if (entry.translation) {
        lines.push(`         ↳ Translated: ${entry.translation}`);
      }
    });
  }

  return lines.join("\n");
}

/**
 * Format transcript into Markdown
 */
function formatTranscriptMd(meeting) {
  const lines = [
    `# Meeting Transcript: ${meeting.meetCode || "Google Meet"}`,
    `**Date:** ${formatDate(meeting.startTime)} | **Time:** ${formatTimestamp(meeting.startTime)}`,
    `\n## Participants (${meeting.participants?.length || 0})`,
    ""
  ];

  (meeting.participants || []).forEach((p) => {
    const icon = p.device === "phone" ? "📱" : "💻";
    lines.push(`- ${icon} **${p.name}** (${p.deviceLabel || p.device})`);
  });

  lines.push("\n---\n## Live Transcript\n");

  const transcript = meeting.transcript || [];
  if (transcript.length === 0) {
    lines.push("_No speech captured._");
  } else {
    transcript.forEach((entry) => {
      const time = entry.timeStr || formatTimestamp(entry.timestamp);
      const speaker = entry.speaker || "Participant";
      const icon = entry.device === "phone" ? "📱" : "💻";
      lines.push(`> **[${time}] ${icon} ${speaker}:** ${entry.text}`);
      if (entry.translation) {
        lines.push(`> *Translated:* ${entry.translation}\n`);
      } else {
        lines.push("");
      }
    });
  }

  return lines.join("\n");
}

/**
 * Format Full Meeting Minutes & AI Summary as Markdown
 */
function formatFullMeetingMd(meeting) {
  const lines = [
    `# Meeting Report: ${meeting.title || meeting.meetCode || "Google Meet"}`,
    `**Meeting Code:** \`${meeting.meetCode || "N/A"}\``,
    `**Date:** ${formatDate(meeting.startTime)}`,
    `**Duration:** ${meeting.durationStr || "N/A"}`,
    `**Total Participants:** ${meeting.participants?.length || 0}`,
    ""
  ];

  lines.push("## 👥 Attendance & Device Breakdown");
  const desktopCount = (meeting.participants || []).filter((p) => p.device !== "phone").length;
  const mobileCount = (meeting.participants || []).filter((p) => p.device === "phone").length;
  lines.push(`- **💻 Laptop / Desktop:** ${desktopCount}`);
  lines.push(`- **📱 Phone / Mobile:** ${mobileCount}`);
  lines.push("");

  lines.push("| Name | Device | Status | First Seen |");
  lines.push("| :--- | :--- | :--- | :--- |");
  (meeting.participants || []).forEach((p) => {
    const icon = p.device === "phone" ? "📱 Phone" : "💻 Laptop";
    lines.push(`| ${p.name} | ${icon} | ${p.present ? "Present" : "Absent"} | ${formatTimestamp(p.firstSeen)} |`);
  });

  lines.push("\n---\n## 📋 Executive Summary\n");
  lines.push(meeting.summary || "_No summary generated yet._");

  lines.push("\n## 💡 Key Discussion Points\n");
  lines.push(meeting.keyPoints || "_No discussion points extracted._");

  lines.push("\n## ⚖️ Decisions & Announcements\n");
  lines.push(meeting.decisions || "_No decisions recorded._");

  lines.push("\n## 🎯 Action Items & Deadlines\n");
  lines.push(meeting.actionItems || "_No action items detected._");

  if (meeting.followUpEmail) {
    lines.push("\n## ✉️ Follow-up Email Draft\n");
    lines.push("```email");
    lines.push(meeting.followUpEmail);
    lines.push("```");
  }

  lines.push("\n---\n## 📝 Full Timestamped Transcript\n");
  (meeting.transcript || []).forEach((entry) => {
    const time = entry.timeStr || formatTimestamp(entry.timestamp);
    const speaker = entry.speaker || "Participant";
    lines.push(`**[${time}] ${speaker}:** ${entry.text}`);
    if (entry.translation) {
      lines.push(`*Translation:* ${entry.translation}\n`);
    }
  });

  return lines.join("\n");
}

/**
 * Generate clean printable HTML view for PDF Export
 */
function generatePrintableHtml(meeting) {
  const desktopCount = (meeting.participants || []).filter((p) => p.device !== "phone").length;
  const mobileCount = (meeting.participants || []).filter((p) => p.device === "phone").length;

  const participantRows = (meeting.participants || []).map((p) => `
    <tr>
      <td>${p.name}</td>
      <td><span class="badge ${p.device === "phone" ? "badge-phone" : "badge-laptop"}">
        ${p.device === "phone" ? "📱 Phone" : "💻 Laptop"}
      </span></td>
      <td>${p.present ? "✅ Present" : "❌ Absent"}</td>
      <td>${formatTimestamp(p.firstSeen)}</td>
    </tr>
  `).join("");

  const transcriptRows = (meeting.transcript || []).map((t) => `
    <div class="transcript-entry">
      <span class="t-time">[${t.timeStr || formatTimestamp(t.timestamp)}]</span>
      <strong class="t-speaker">${t.speaker}:</strong>
      <span class="t-text">${t.text}</span>
      ${t.translation ? `<div class="t-translation">↳ ${t.translation}</div>` : ""}
    </div>
  `).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Meeting Report - ${meeting.meetCode || "Google Meet"}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.6;
      color: #1e293b;
      max-width: 850px;
      margin: 30px auto;
      padding: 0 20px;
    }
    .header {
      border-bottom: 2px solid #0284c7;
      padding-bottom: 12px;
      margin-bottom: 20px;
    }
    .title {
      font-size: 26px;
      font-weight: 800;
      color: #0369a1;
      margin: 0 0 6px 0;
    }
    .meta {
      font-size: 14px;
      color: #64748b;
    }
    .stats-bar {
      display: flex;
      gap: 15px;
      margin: 15px 0;
      background: #f1f5f9;
      padding: 12px;
      border-radius: 8px;
    }
    .stat-pill {
      font-weight: 600;
      font-size: 13px;
    }
    h2 {
      font-size: 18px;
      color: #0f172a;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 6px;
      margin-top: 24px;
    }
    .section-content {
      background: #fafafa;
      padding: 12px 16px;
      border-left: 4px solid #0284c7;
      border-radius: 4px;
      white-space: pre-wrap;
      font-size: 14px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 12px 0;
      font-size: 13px;
    }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 8px 12px;
      text-align: left;
    }
    th {
      background: #f8fafc;
      font-weight: 600;
    }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: bold;
    }
    .badge-laptop { background: #e0f2fe; color: #0369a1; }
    .badge-phone { background: #fef3c7; color: #b45309; }
    .transcript-entry {
      margin-bottom: 8px;
      font-size: 13px;
    }
    .t-time { color: #64748b; font-size: 11px; margin-right: 6px; }
    .t-speaker { color: #0f172a; margin-right: 6px; }
    .t-translation { color: #475569; font-style: italic; margin-left: 20px; font-size: 12px; }
    @media print {
      body { margin: 0; padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom: 20px; text-align: right;">
    <button onclick="window.print()" style="padding: 8px 16px; background: #0284c7; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">
      🖨️ Print / Save as PDF
    </button>
  </div>
  <div class="header">
    <h1 class="title">Meet.ai - Meeting Minutes & Report</h1>
    <div class="meta">
      <strong>Meeting Code:</strong> ${meeting.meetCode || "Google Meet"} |
      <strong>Date:</strong> ${formatDate(meeting.startTime)} |
      <strong>Duration:</strong> ${meeting.durationStr || "N/A"}
    </div>
    <div class="stats-bar">
      <div class="stat-pill">👥 Total Attendees: ${meeting.participants?.length || 0}</div>
      <div class="stat-pill">💻 Laptop / Desktop: ${desktopCount}</div>
      <div class="stat-pill">📱 Phone / Mobile: ${mobileCount}</div>
    </div>
  </div>

  <h2>📋 Executive Summary</h2>
  <div class="section-content">${meeting.summary || "No summary generated."}</div>

  <h2>💡 Key Discussion Points</h2>
  <div class="section-content">${meeting.keyPoints || "No key points recorded."}</div>

  <h2>⚖️ Decisions & Announcements</h2>
  <div class="section-content">${meeting.decisions || "No decisions recorded."}</div>

  <h2>🎯 Action Items & Deadlines</h2>
  <div class="section-content">${meeting.actionItems || "No action items recorded."}</div>

  ${meeting.followUpEmail ? `
    <h2>✉️ Follow-Up Email Draft</h2>
    <div class="section-content">${meeting.followUpEmail}</div>
  ` : ""}

  <h2>👥 Attendance Roster</h2>
  <table>
    <thead>
      <tr><th>Name</th><th>Device Type</th><th>Status</th><th>First Seen</th></tr>
    </thead>
    <tbody>
      ${participantRows || '<tr><td colspan="4">No participants detected</td></tr>'}
    </tbody>
  </table>

  <h2>📝 Full Timestamped Transcript</h2>
  <div style="max-height: none;">
    ${transcriptRows || '<p>No transcript recorded.</p>'}
  </div>
</body>
</html>`;
}

// Export for ES modules / Browser Window
if (typeof window !== "undefined") {
  window.ExportUtils = {
    formatTimestamp,
    formatDate,
    formatAttendanceCsv,
    formatTranscriptTxt,
    formatTranscriptMd,
    formatFullMeetingMd,
    generatePrintableHtml
  };
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    formatTimestamp,
    formatDate,
    formatAttendanceCsv,
    formatTranscriptTxt,
    formatTranscriptMd,
    formatFullMeetingMd,
    generatePrintableHtml
  };
}
