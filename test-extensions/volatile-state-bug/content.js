// Same messaging contract as the healthy fixture; only worker persistence differs.
chrome.runtime.sendMessage({ type: 'read' }).then((reply) => {
  document.documentElement.dataset.mv3Counter = String(reply.counter);
}).catch(() => { document.documentElement.dataset.mv3Error = 'message failed'; });
