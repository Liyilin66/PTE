import { ref } from "vue";

export function useRecorder() {
  const isRecording = ref(false);
  const transcript = ref("");
  const audioBlob = ref(null);
  const error = ref(null);
  const isSupported = ref(true);

  let recognition = null;
  let mediaRecorder = null;
  let mediaStream = null;
  let audioChunks = [];
  let stopRequested = false;

  function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      isSupported.value = false;
      error.value = "Current browser does not support Speech Recognition. Please use Chrome.";
      return false;
    }

    recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        if (event.results[i].isFinal) {
          finalText += `${event.results[i][0].transcript} `;
        }
      }
      if (finalText) {
        transcript.value = `${transcript.value}${finalText}`.trim();
      }
    };

    recognition.onerror = (event) => {
      if (event.error !== "no-speech" && event.error !== "aborted") {
        error.value = `Speech recognition error: ${event.error}`;
      }
    };

    recognition.onend = () => {
      // Keep recognition alive while recording, unless it was stopped intentionally.
      if (!stopRequested && isRecording.value) {
        try {
          recognition.start();
        } catch {
          // Ignore duplicate start errors.
        }
      }
    };

    return true;
  }

  async function initMediaRecorder() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === "undefined") {
      error.value = "Current browser does not support microphone recording.";
      return false;
    }

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(mediaStream);
      audioChunks = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        audioBlob.value = new Blob(audioChunks, { type: "audio/webm" });
        if (mediaStream) {
          mediaStream.getTracks().forEach((track) => track.stop());
          mediaStream = null;
        }
      };

      return true;
    } catch {
      error.value = "Unable to access microphone. Please allow microphone permission.";
      return false;
    }
  }

  async function startRecording() {
    transcript.value = "";
    audioBlob.value = null;
    error.value = null;
    stopRequested = false;

    const speechReady = initSpeechRecognition();
    const mediaReady = await initMediaRecorder();
    if (!speechReady || !mediaReady) {
      return false;
    }

    try {
      recognition.start();
    } catch {
      // Recognition might already be running.
    }

    mediaRecorder.start(100);
    isRecording.value = true;
    return true;
  }

  function stopRecording() {
    stopRequested = true;
    if (recognition) {
      try {
        recognition.stop();
      } catch {
        // no-op
      }
    }

    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    } else if (mediaStream) {
      mediaStream.getTracks().forEach((track) => track.stop());
      mediaStream = null;
    }

    isRecording.value = false;
  }

  return {
    isRecording,
    transcript,
    audioBlob,
    error,
    isSupported,
    startRecording,
    stopRecording
  };
}
