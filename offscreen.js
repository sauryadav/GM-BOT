/**
 * Meet.ai - Offscreen Audio Recorder
 * Captures tab audio via chromeMediaSourceId, preserves playback, and records with MediaRecorder
 */

let mediaRecorder = null;
let audioChunks = [];
let audioContext = null;
let mediaStream = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== "offscreen") return;

  if (message.type === "START_RECORDING") {
    startRecording(message.streamId)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "PAUSE_RECORDING") {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.pause();
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: "Recorder not recording" });
    }
    return true;
  }

  if (message.type === "RESUME_RECORDING") {
    if (mediaRecorder && mediaRecorder.state === "paused") {
      mediaRecorder.resume();
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: "Recorder not paused" });
    }
    return true;
  }

  if (message.type === "STOP_RECORDING") {
    stopRecording()
      .then((dataUrl) => sendResponse({ success: true, dataUrl }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

async function startRecording(streamId) {
  try {
    audioChunks = [];

    // Obtain the tab audio stream
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: "tab",
          chromeMediaSourceId: streamId
        }
      },
      video: false
    });

    // Route audio to speakers so user can hear the call while recording
    audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(mediaStream);
    source.connect(audioContext.destination);

    // Initialize MediaRecorder
    const options = { mimeType: "audio/webm;codecs=opus" };
    mediaRecorder = new MediaRecorder(mediaStream, options);

    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    mediaRecorder.start(1000); // 1-second chunks
    console.log("[Meet.ai Offscreen] Recording tab audio started.");
  } catch (err) {
    console.error("[Meet.ai Offscreen] Error starting recording:", err);
    throw err;
  }
}

async function stopRecording() {
  return new Promise((resolve, reject) => {
    if (!mediaRecorder) {
      return reject(new Error("No active MediaRecorder instance."));
    }

    mediaRecorder.onstop = async () => {
      try {
        const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = reader.result;
          // Stop media tracks
          if (mediaStream) {
            mediaStream.getTracks().forEach((track) => track.stop());
          }
          if (audioContext) {
            audioContext.close();
          }
          mediaRecorder = null;
          audioChunks = [];
          resolve(dataUrl);
        };
        reader.onerror = reject;
        reader.readAsDataURL(audioBlob);
      } catch (err) {
        reject(err);
      }
    };

    if (mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    } else {
      resolve(null);
    }
  });
}
