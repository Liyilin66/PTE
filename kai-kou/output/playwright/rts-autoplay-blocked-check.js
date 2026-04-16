async (page) => {
  const baseUrl = "http://127.0.0.1:5173";
  const email = "156277702@qq.com";
  const password = "050103";

  const safeVisible = async (selector) => {
    try {
      return await page.locator(selector).first().isVisible();
    } catch {
      return false;
    }
  };

  const poll = async (fn, timeoutMs = 40000, intervalMs = 400) => {
    const started = Date.now();
    while (Date.now() - started <= timeoutMs) {
      const value = await fn();
      if (value) return value;
      await page.waitForTimeout(intervalMs);
    }
    return null;
  };

  await page.addInitScript(() => {
    if (window.__RTS_AUTOPLAY_BLOCK_PATCH__) return;
    window.__RTS_AUTOPLAY_BLOCK_PATCH__ = true;
    const originalPlay = HTMLMediaElement.prototype.play;
    let remainingReject = 1;
    HTMLMediaElement.prototype.play = function patchedPlay(...args) {
      if (remainingReject > 0) {
        remainingReject -= 1;
        return Promise.reject(new DOMException("forced_autoplay_block", "NotAllowedError"));
      }
      return originalPlay.apply(this, args);
    };
  });

  await page.goto(`${baseUrl}/auth`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(1200);
  if (page.url().includes("/auth")) {
    const emailInput = page.locator('input[placeholder="your@email.com"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    await emailInput.waitFor({ timeout: 20000 });
    await emailInput.fill(email);
    await passwordInput.fill(password);
    await passwordInput.press("Enter");
    await poll(async () => (!page.url().includes("/auth") ? { ok: true } : null), 25000, 500);
  }

  await page.goto(`${baseUrl}/rts/practice`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(2000);

  const promptState = await poll(async () => {
    if (await safeVisible('button:has-text("点击播放场景音频")')) return "prompt_visible";
    return null;
  }, 45000, 500);

  let manualRecoverState = "not_run";
  if (promptState === "prompt_visible") {
    await page.locator('button:has-text("点击播放场景音频")').first().click({ timeout: 10000 });
    const afterClick = await poll(async () => {
      if (await safeVisible('button:has-text("正在播放场景")')) return "playing";
      if (await safeVisible("text=准备阶段会在")) return "preparing";
      return null;
    }, 45000, 500);
    manualRecoverState = afterClick || "timeout";
  }

  return {
    promptState: promptState || "timeout",
    manualRecoverState
  };
}
