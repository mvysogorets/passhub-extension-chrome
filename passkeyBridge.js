'use strict';


const consoleLog = console.log;
//const consoleLog = () => { };


// Runs in the isolated world, where chrome.runtime is available, and hands the
// extension's base URL to the MAIN-world passkey interceptor (passkeyInterceptor.js)
// via the shared DOM, since MAIN-world scripts has no chrome.* API access.

// Receives the passkey options and page URL from showPasskeyChooser (MAIN world).
window.addEventListener('message', async (event) => {

  if (event.source !== window) return;
  if (!event.data || event.data.type !== 'passhub-passkey-chooser') return;

  console.log('bridge got message', event.data);

  //  const { requestId, mode, passkey, url } = event.data;
  try {
    let response = await chrome.runtime.sendMessage({
      id: 'passkey-chooser-context',
      data: event.data
    });
    consoleLog('29 response is');
    consoleLog(response);
  } catch (error) {
    consoleLog('PassHub relay: chooser context not delivered', error);
  }
});

// Popup closed: background reports how, pass it on to the MAIN-world interceptor.
chrome.runtime.onMessage.addListener((msg) => {

  if (msg?.id === 'passkey-chooser-result') {
    window.postMessage({
      type: 'passhub-passkey-chooser-result',
      requestId: msg.requestId,
      choice: msg.choice
    }, '*');
    return;
  } else if (msg?.id === 'passkey-create-response' || msg?.id === 'passkey-get-response') {
    window.postMessage(msg, '*');
    return;
  }
  return;
});

