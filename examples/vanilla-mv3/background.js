// First-party example explicitly opts into a boot identity for lifecycle tests.
const bootId = crypto.randomUUID();
chrome.runtime.onMessage.addListener((message, _sender, reply) => {
  if (message.type !== 'read' && message.type !== 'increment') return;
  (async () => {
    let { counter = 0 } = await chrome.storage.local.get('counter');
    if (message.type === 'increment') {
      counter++;
      await chrome.storage.local.set({ counter });
    }
    reply({ counter, bootId });
  })().catch(error => reply({ error: String(error) }));
  return true;
});
