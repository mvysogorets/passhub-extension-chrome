'use strict';


const consoleLog = console.log;
//const consoleLog = () => { };


// Runs in the isolated world, where chrome.runtime is available, and hands the
// extension's base URL to the MAIN-world passkey interceptor (passkeyInterceptor.js)
// via the shared DOM, since MAIN-world scripts has no chrome.* API access.
try {
  document.documentElement.setAttribute('data-passhub-ext-url', chrome.runtime.getURL(''));
} catch (err) {
  // chrome.runtime unavailable; MAIN-world code falls back to treating passkeys as unsupported.
}


// Receives the passkey options and page URL from showPasskeyChooser (MAIN world).
window.addEventListener('message', async (event) => {
  if (event.source !== window) return;
  if (!event.data || event.data.type !== 'passhub-passkey-chooser') return;

  const { requestId, mode, passkey, url } = event.data;
  try {
    let response = await chrome.runtime.sendMessage({
      id: 'passkey-chooser-context',
      data: { requestId, mode, passkey, url }
    });
    consoleLog('29 response is');
    consoleLog(response);
  } catch (error) {
    consoleLog('PassHub relay: chooser context not delivered', error);
  }
});

// Popup closed: background reports how, pass it on to the MAIN-world interceptor.
chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.id !== 'passkey-chooser-result') return;
  window.postMessage({
    type: 'passhub-passkey-chooser-result',
    requestId: msg.requestId,
    choice: msg.choice
  }, '*');
});

/*
window.addEventListener('message', async (event) => {
  if (event.source !== window) return;
  if (!event.data || event.data.type !== 'passhub-request') return;

  const { requestId, id, data } = event.data;
  consoleLog('PassHub relay: forwarding to background', id);

  try {
    const response = await chrome.runtime.sendMessage({ id, data });
    window.postMessage({ type: 'passhub-response', requestId, response }, '*');
  } catch (error) {
    consoleLog('PassHub relay error:', error);
    const message = error.message === 'Extension context invalidated.'
      ? 'PassHub extension was reloaded. Reload this page and try again.'
      : error.message;
    window.postMessage({
      type: 'passhub-response',
      requestId,
      response: { error: message }
    }, '*');
  }
})
*/