async (page) => {
  const baseUrl = "http://127.0.0.1:5173";
  const email = "156277702@qq.com";
  const password = "050103";

  const recorderEvents = [];
  const tasks = [];

  const toVal = async (arg) => {
    try { return await arg.jsonValue(); } catch { try { return arg.toString(); } catch { return "[x]"; } }
  };

  page.on('console', (msg) => {
    const t = (async () => {
      const args = [];
      for (const arg of msg.args()) args.push(await toVal(arg));
      const first = `${args[0] || ''}`;
      const event = `${args[1] || ''}`;
      if (first.includes('[rts-recorder]') && event) {
        recorderEvents.push({ event, payload: (args[2] && typeof args[2] === 'object') ? args[2] : null, text: `${msg.text()||''}` });
      }
    })();
    tasks.push(t);
  });

  const poll = async (fn, timeoutMs = 30000, intervalMs = 400) => {
    const start = Date.now();
    while (Date.now() - start <= timeoutMs) {
      const v = await fn();
      if (v) return { ok: true, value: v, elapsedMs: Date.now() - start };
      await page.waitForTimeout(intervalMs);
    }
    return { ok: false, value: null, elapsedMs: Date.now() - start };
  };

  const visible = async (locator) => { try { return await locator.isVisible(); } catch { return false; } };
  const enabled = async (locator) => { try { return await locator.isEnabled(); } catch { return false; } };

  await page.addInitScript(() => {
    try { window.localStorage?.setItem('RTS_RECORDER_DEBUG', '1'); } catch {}
  });

  try { await page.context().grantPermissions(['microphone'], { origin: baseUrl }); } catch {}

  await page.goto(`${baseUrl}/auth`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  if (page.url().includes('/auth')) {
    const emailInput = page.locator('input[placeholder="your@email.com"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    await emailInput.waitFor({ timeout: 20000 });
    await emailInput.fill(email);
    await passwordInput.fill(password);
    await passwordInput.press('Enter');
    await poll(async () => (!page.url().includes('/auth') ? { ok: true } : null), 30000, 500);
  }

  await page.goto(`${baseUrl}/rts/practice?debugRecorder=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  const manualBtn = page.locator('button:has-text("点击播放场景音频")').first();
  const startBtn = page.locator('button:has-text("准备完毕，开始回应")').first();
  const stopBtn = page.locator('button:has-text("正在录音")').first();

  const pre = await poll(async () => {
    if (await visible(startBtn)) return { state: 'prepare' };
    if (await visible(manualBtn)) return { state: 'manual' };
    return null;
  }, 70000, 500);

  if (pre.ok && pre.value.state === 'manual') {
    await manualBtn.click({ timeout: 8000 });
    await poll(async () => (await visible(startBtn) ? { state: 'prepare' } : null), 70000, 500);
  }

  const before = recorderEvents.length;
  await startBtn.click({ timeout: 10000 });

  const startOutcome = await poll(async () => {
    const events = recorderEvents.slice(before).filter((e) => ['start_success', 'start_failed', 'start_exception'].includes(e.event));
    if (events.length > 0) {
      const last = events[events.length - 1];
      return { event: last.event, payload: last.payload, eventsCount: events.length };
    }
    return null;
  }, 20000, 300);

  let stopClicked = false;
  if (startOutcome.ok && startOutcome.value.event === 'start_success') {
    const stopReady = await poll(async () => (await visible(stopBtn) && await enabled(stopBtn) ? { ok: true } : null), 45000, 500);
    if (stopReady.ok) {
      await stopBtn.click({ timeout: 8000 });
      stopClicked = true;
    }
  }

  await Promise.allSettled(tasks);

  return {
    ua: await page.evaluate(() => navigator.userAgent || ''),
    startOutcome,
    stopClicked,
    startEventsTail: recorderEvents.slice(-8)
  };
}
