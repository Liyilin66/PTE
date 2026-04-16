async (page) => {
  await page.goto('http://127.0.0.1:5173/rts/practice?debugRecorder=1', { waitUntil: 'domcontentloaded' });
  const caps = await page.evaluate(async () => {
    const out = {
      ua: navigator.userAgent,
      hasMediaDevices: !!navigator.mediaDevices,
      hasGetUserMedia: !!navigator.mediaDevices?.getUserMedia,
      hasMediaRecorder: typeof MediaRecorder !== 'undefined',
      hasAudioContext: typeof (window.AudioContext || window.webkitAudioContext) !== 'undefined',
      secureContext: window.isSecureContext === true
    };
    if (navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        out.gumOk = true;
        out.trackCount = stream?.getAudioTracks?.().length || 0;
        out.streamActive = !!stream?.active;
        stream?.getTracks?.().forEach((t) => t.stop());
      } catch (err) {
        out.gumOk = false;
        out.gumError = err?.name || err?.message || String(err);
      }
    }
    return out;
  });
  return caps;
}
