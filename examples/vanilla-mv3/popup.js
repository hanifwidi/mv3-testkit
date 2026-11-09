const counter = document.querySelector('#counter');
const errorOutput = document.querySelector('#error');
async function update(type) {
  const reply = await chrome.runtime.sendMessage({ type });
  if (reply?.error || !Number.isInteger(reply?.counter)) throw new Error(reply?.error ?? 'Invalid counter reply');
  counter.textContent = String(reply.counter);
}
document.querySelector('#increment').addEventListener('click', () => {
  update('increment').catch(error => { errorOutput.textContent = error.message; });
});
update('read').catch(error => { errorOutput.textContent = error.message; });
