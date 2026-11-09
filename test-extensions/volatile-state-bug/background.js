// Intentionally broken: this state vanishes whenever the worker is restarted.
const bootId = crypto.randomUUID();
let counter = 0;
chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message.type !== 'read' && message.type !== 'increment') return;
  if (message.type === 'increment') counter += 1;
  respond({ counter, bootId });
});
