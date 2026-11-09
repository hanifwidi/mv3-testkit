// Deterministic test gate: runtime registration is deliberately conditional and late.
// Storage events remain registered synchronously so cold start can be verified
// independently of the broken runtime-message listener.
const bootId = crypto.randomUUID();
let installed = false;
function registerRuntimeListener() {
  if (installed) return;
  installed = true;
  chrome.runtime.onMessage.addListener((message, _sender, reply) => {
    if (message.type === 'ping') reply({ ok: true, bootId });
  });
  return chrome.storage.local.set({ listenerBootId: bootId });
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.listenerGate?.newValue === 'open')
    registerRuntimeListener();
});
// Explicit test-only instrumentation. All persistent writes are awaited in order.
(async () => {
  await chrome.storage.local.set({ bootId });
  const { listenerGate } = await chrome.storage.local.get('listenerGate');
  if (listenerGate === 'open') await registerRuntimeListener();
})();
