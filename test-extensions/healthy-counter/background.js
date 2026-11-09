// Test fixture: boot identity is explicit opt-in instrumentation, not a kit injection.
const bootId = crypto.randomUUID();
chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message.type !== 'read' && message.type !== 'increment') return;
  (async () => {
    let { counter = 0 } = await chrome.storage.local.get('counter');
    if (message.type === 'increment') {
      counter += 1;
      await chrome.storage.local.set({ counter });
    }
    respond({ counter, bootId });
  })().catch((error) => respond({ error: String(error) }));
  return true;
});
