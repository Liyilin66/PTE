async (page) => {
  const visible = async (selector) => {
    try {
      return await page.locator(selector).first().isVisible();
    } catch {
      return false;
    }
  };

  const pollState = async (timeoutMs = 40000) => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (await visible('button:has-text("点击播放场景音频")')) return "blocked";
      if (await visible('button:has-text("正在播放场景")')) return "playing";
      if (await visible("text=准备阶段会在")) return "preparing";
      await page.waitForTimeout(400);
    }
    return "timeout";
  };

  await page.goto("http://127.0.0.1:5173/rts/practice", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(1800);
  const firstState = await pollState(40000);

  const nextBtn = page.locator('button:has-text("下一题")').first();
  await nextBtn.click({ timeout: 10000 });
  await page.waitForTimeout(1500);
  const nextState = await pollState(40000);

  return {
    firstState,
    nextState
  };
}
