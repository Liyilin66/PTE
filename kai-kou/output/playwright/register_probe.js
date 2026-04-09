async (page) => {
  const email = `pw_verify_${Date.now()}@example.com`;
  const password = 'PteVerify!123';
  const tabButtons = page.locator('button');
  await tabButtons.nth(1).click();
  await page.getByPlaceholder('your@email.com').fill(email);
  await page.getByPlaceholder('÷¡…Ÿ 6 Œª').fill(password);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(3500);
  const url = page.url();
  const bodyText = await page.textContent('body');
  return {
    email,
    url,
    hasHome: url.includes('/home'),
    bodySnippet: (bodyText || '').slice(0, 500)
  };
}