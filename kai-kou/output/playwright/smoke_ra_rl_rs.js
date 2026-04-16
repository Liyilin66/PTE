async (page) => {
  const baseUrl = "http://127.0.0.1:5173";
  const email = "156277702@qq.com";
  const password = "050103";

  const consoleEntries = [];
  const pageErrors = [];
  const networkFailures = [];

  page.on("console", (msg) => {
    consoleEntries.push({
      type: `${msg.type() || ""}`.toLowerCase(),
      text: `${msg.text() || ""}`.trim(),
      url: page.url()
    });
  });

  page.on("pageerror", (error) => {
    pageErrors.push(`${error?.message || error || ""}`.trim());
  });

  page.on("requestfailed", (request) => {
    networkFailures.push({
      url: request.url(),
      method: request.method(),
      failure: request.failure()?.errorText || "UNKNOWN"
    });
  });

  const safeVisible = async (locator) => {
    try {
      return await locator.isVisible();
    } catch {
      return false;
    }
  };

  const safeClick = async (locator) => {
    try {
      if (await locator.isVisible()) {
        await locator.click({ timeout: 6000 });
        return true;
      }
    } catch {
      // no-op
    }
    return false;
  };

  const pollUntil = async (fn, timeoutMs = 30000, intervalMs = 400) => {
    const started = Date.now();
    while (Date.now() - started <= timeoutMs) {
      const value = await fn();
      if (value) return { ok: true, value, elapsedMs: Date.now() - started };
      await page.waitForTimeout(intervalMs);
    }
    return { ok: false, value: null, elapsedMs: Date.now() - started };
  };

  try {
    await page.context().grantPermissions(["microphone"], { origin: baseUrl });
  } catch {
    // no-op
  }

  await page.addInitScript(() => {
    try {
      window.localStorage?.setItem("RTS_RECORDER_DEBUG", "1");
    } catch {
      // no-op
    }
  });

  await page.goto(`${baseUrl}/auth`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(1000);
  if (page.url().includes("/auth")) {
    const emailInput = page.locator('input[placeholder="your@email.com"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    await emailInput.waitFor({ timeout: 20000 });
    await emailInput.fill(email);
    await passwordInput.fill(password);
    await passwordInput.press("Enter");
    const loggedIn = await pollUntil(async () => (!page.url().includes("/auth") ? { url: page.url() } : null), 30000, 500);
    if (!loggedIn.ok) {
      throw new Error("login_failed");
    }
  }

  const routes = [
    { key: "RA", path: "/ra" },
    { key: "RL", path: "/rl" },
    { key: "RS", path: "/rs" }
  ];

  const results = [];

  for (const route of routes) {
    const before = consoleEntries.length;
    await page.goto(`${baseUrl}${route.path}`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(1200);

    if (route.key === "RA") {
      const startNowBtn = page.locator('button:has-text("立即开始录音")').first();
      await safeClick(startNowBtn);
    }

    const recordingSignal = await pollUntil(async () => {
      const stopBtn = page.locator('button:has-text("结束录音"), button:has-text("正在录音")').first();
      const waveRecording = page.locator('text=Recording...').first();
      const waveWaiting = page.locator('text=Waiting...').first();
      if (await safeVisible(stopBtn)) return { state: "recording_ui", stopButton: true };
      if (await safeVisible(waveRecording)) return { state: "recording_wave", stopButton: false };
      if (await safeVisible(waveWaiting)) return { state: "wave_waiting", stopButton: false };
      return null;
    }, route.key === "RA" ? 45000 : 65000, 500);

    const afterLogs = consoleEntries.slice(before);
    const propWarnings = afterLogs.filter((entry) => /isRecording|Invalid prop|type check failed/i.test(entry.text));
    const startupErrors = afterLogs.filter((entry) => /录音启动失败|start_failed|RECORDER_ALL_ENGINES_FAILED|MEDIA_UNSUPPORTED|MEDIARECORDER_START/i.test(entry.text));

    results.push({
      route: route.key,
      url: page.url(),
      recordingSignal: recordingSignal.ok ? recordingSignal.value : null,
      recordingSignalOk: recordingSignal.ok,
      propWarningCount: propWarnings.length,
      propWarnings,
      startupErrorCount: startupErrors.length,
      startupErrors
    });
  }

  const allPropWarnings = consoleEntries.filter((entry) => /isRecording|Invalid prop|type check failed/i.test(entry.text));

  return {
    routeResults: results,
    allPropWarningCount: allPropWarnings.length,
    allPropWarnings,
    pageErrors,
    networkFailures
  };
}
