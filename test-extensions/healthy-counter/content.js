// Runs in the extension's isolated world. The host page observes only the DOM.
chrome.runtime.sendMessage({ type: 'read' }).then((reply) => {
  document.documentElement.dataset.mv3Counter = String(reply.counter);
}).catch(() => { document.documentElement.dataset.mv3Error = 'message failed'; });
