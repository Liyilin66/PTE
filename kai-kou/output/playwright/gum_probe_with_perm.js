async (page) => {
  const baseUrl='http://127.0.0.1:5173';
  try { await page.context().grantPermissions(['microphone'], { origin: baseUrl }); } catch (e) {}
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  const out = await page.evaluate(async () => {
    const res = { hasGetUserMedia: !!navigator.mediaDevices?.getUserMedia };
    if (!res.hasGetUserMedia) return res;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      res.gumOk = true;
      res.trackCount = stream.getAudioTracks().length;
      stream.getTracks().forEach(t=>t.stop());
    } catch (err) {
      res.gumOk = false;
      res.errorName = err?.name || String(err);
      res.errorMessage = err?.message || '';
    }
    return res;
  });
  return out;
}
