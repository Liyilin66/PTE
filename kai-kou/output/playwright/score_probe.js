async (page) => {
  const reqId = `pw_score_probe_${Date.now()}`;
  try {
    const res = await page.evaluate(async ({ reqId }) => {
      const r = await fetch('/api/score', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer invalid_token_for_probe',
          'x-request-id': reqId
        },
        body: JSON.stringify({
          taskType: 'WE',
          transcript: 'probe text',
          questionContent: 'probe',
          request_id: reqId
        })
      });
      const t = await r.text();
      return {
        status: r.status,
        ok: r.ok,
        body: t.slice(0, 200)
      };
    }, { reqId });
    return { reqId, ...res, fetchFailed: false };
  } catch (e) {
    return { reqId, fetchFailed: true, error: `${e?.message || e}` };
  }
}