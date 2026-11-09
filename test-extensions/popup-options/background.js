// Test-only opt-in boot identity; no production extension is instrumented.
const bootId = crypto.randomUUID();
chrome.runtime.onMessage.addListener((message, _sender, reply) => {
  if (message.type === 'ping') reply({ ok: true, bootId });
});
