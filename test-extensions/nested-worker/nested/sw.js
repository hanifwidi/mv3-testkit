const bootId = crypto.randomUUID();
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'ping') sendResponse({ bootId, ok: true });
});
