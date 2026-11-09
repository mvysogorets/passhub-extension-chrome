'use strict';

const consoleLog = console.log;
//const consoleLog = () => { };

let farewellCount = 0;

// sendResponse of the pending 'passkey-choose' request from the PassHub tab
let pendingSelect = null;

function resolveSelect(answer) {
  if (!pendingSelect) return;
  const respond = pendingSelect;
  pendingSelect = null;
  try { respond(answer); } catch (err) { consoleLog(err); }
}

let deferredMsg = null;

function logtime() {
  const today = new Date();
  return today.getHours() + ":" + today.getMinutes() + ":" + today.getSeconds() + " ";
}

consoleLog(logtime() + 'passhub extension background start');

//messages from externally connectables (= passhub tab) 
chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
  consoleLog(`external message from passhub window/ request from ${sender.url}`);
  consoleLog(request);

  if (!request) {
    consoleLog("no request");
    return;
  }


  if (request.id == 'clear to send') {
    if (!deferredMsg) {
      consoleLog('error deferredMsg absent');  // happens from time to time... 
    }
    sendResponse(deferredMsg);
    deferredMsg = null; // hand out once: a repeated "clear to send" must not replay an old request
    farewellCount++;
    return;
  }


  if (request.id == 'passkey-choose') {
    // PassHub found several passkeys for the site: let the user pick one in the popup.
    // The answer ({index} or {cancelled}) is sent back as the response to this very message.
    if (pendingSelect) {
      pendingSelect({ cancelled: true });
    }
    pendingSelect = sendResponse;
    const context = { rpId: request.rpId, title: request.title, tree: request.tree, candidates: request.candidates };
    chrome.storage.session.set({ passkeySelectContext: context })
      .then(() => chrome.runtime.sendMessage({ id: 'passkey-select-list', context })
        .then(() => chrome.storage.session.remove('passkeySelectContext')) // an open popup took it
        .catch(() => chrome.action.openPopup()))  // no popup open: open it, it reads the stored context
      .catch(err => {
        consoleLog(err);
        resolveSelect({ cancelled: true });
      });
    return true; // async response
  }

  if (request.id == 'passkey-create-response' || request.id == 'passkey-get-response') {
    sendToPasskeyInterceptor(request);
    /*    
        chrome.runtime.sendMessage(request)
          .catch(err => {
            consoleLog('catch 81');
            consoleLog(err);
          })
    */
    sendResponse({ farewell: `goodbye ${request.id} ${farewellCount}` });
    return;
  }

  if (request.id == 'loginRequest') {
    // sent by passhub tab when user clicks on the URL link of password record, forward to the target URL
    sendResponse({ farewell: `goodbye ${request.id} ${farewellCount}` });
    chrome.tabs.create({ url: request.url })
      .then(tab => {
        consoleLog('tab created');
        consoleLog(tab);

        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['autofill.js']
        })
          .then((injectionResult) => {
            consoleLog('inJectionResult');
            consoleLog(injectionResult);
            chrome.tabs.sendMessage(tab.id, request)
              .then(response => {
                consoleLog('bg got response from content script');
                consoleLog(response);
              })
              .catch(err => {
                consoleLog('catch 48');
                consoleLog(err);
              })
          });
      })
      .catch(err => {
        consoleLog('catch 42');
        consoleLog(err);
      })

  } else if (request.id == 'remember me') {
    // sent by passhub tab just after signin, the passhub tab is saved for future communications

    chrome.storage.session.set({ passhub: { peer: sender, version: ("version" in request) ? request.version : 1 } });
    sendResponse({ id: "63 Ok" });

    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id },
      files: ['passhubTabScript.js']
    })
      .then((injectionResult) => {
        consoleLog('passhubTabScript InjectionResult');
        consoleLog(injectionResult);
        //        sendResponse({ id: "Ok" });
      })
  } else if ((request.id == 'advise') || (request.id == 'payment') || (request.id == 'address')) {
    // sent by passhub tab as a response containing data, retransmitted to popup

    const originUrl = new URL(sender.origin);

    request.passhubInstance = originUrl.hostname;
    chrome.runtime.sendMessage(request)
      .catch(err => {
        consoleLog('catch 81');
        consoleLog(err);
      })
    sendResponse({ farewell: `goodbye ${request.id} ${farewellCount}` });
    farewellCount++;
  } else {
    sendResponse({ farewell: `goodbye ${request.id} ${farewellCount}` });
    farewellCount++;
  }
});


function notConnected() {
  chrome.runtime.sendMessage({ id: 'not connected' })
    .then(response => consoleLog(response))
    .catch(err => {
      consoleLog('catch 98');
      consoleLog(err);
    })
}

// Defers msg until the connected PassHub tab asks for it ('clear to send').
// Resolves "Ok" when the PassHub tab script is ready to fetch it, "not connected" otherwise.
function sendToPassHub(msg) {
  return chrome.storage.session.get("passhub")
    .then(passhubWindow => {
      consoleLog("session storage returns");
      consoleLog(passhubWindow);
      if (!passhubWindow.passhub) {
        return "not connected";
      }
      return chrome.tabs.sendMessage(passhubWindow.passhub.peer.tab.id, {
        id: "request to send",
        origin: passhubWindow.passhub.origin,
        version: ("version" in passhubWindow.passhub) ? passhubWindow.passhub.version : 1
      })
        .then(response => {
          consoleLog('response to rts');
          consoleLog(response);
          if (response.farewell.includes('passhubTabScript')) {
            deferredMsg = msg;
            consoleLog('deferredMsg set to');
            consoleLog(msg);
            return "Ok";
          }
          return "not connected";
        });
    })
    .catch(err => {
      consoleLog(err);
      return "not connected";
    });
}

// requestId -> { tabId, frameId } of the page that is waiting for the passkey chooser result
const pendingChoosers = new Map();

let requestId = null;


function sendToPasskeyInterceptor(message) {
  const id = message.requestId || requestId;
  const target = pendingChoosers.get(id);
  if (!target) return;
  pendingChoosers.delete(id);

  // choice is 'passhub' | 'system' | 'cancel' when a button was used,
  // otherwise the popup was closed some other way (click outside, Esc, window closed).

  chrome.tabs.sendMessage(target.tabId, message, { frameId: target.frameId })
    .catch(err => consoleLog(err));
};

// The chooser popup opens a port; its messages say which button was used and its
// disconnect means the popup is gone. The outcome is relayed to the page that asked
// (passkeyUrlBridge -> passkeyInterceptor).
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'passkey-select') {
    // popup showing the list of passkeys: a message carries the choice,
    // a disconnect without a choice means the popup was closed (= cancel)
    port.onMessage.addListener((msg) => {
      if (msg && Number.isInteger(msg.index)) resolveSelect({ index: msg.index });
    });
    port.onDisconnect.addListener(() => resolveSelect({ cancelled: true }));
    return;
  }
  if (port.name !== 'passkey-chooser') return;

  let choice = null;
  let context = null; // full chooser context (mode, passkey, url, requestId) sent by the popup

  port.onMessage.addListener((msg) => {
    if (msg.requestId) requestId = msg.requestId;
    if (msg.context) context = msg.context;
    if (msg.choice) choice = msg.choice;
    if (choice == 'passhub') {
      console.log('background got passhub passkey choice from popup', context);
      if (context.mode == 'create') {
        context.id = "passkey-create";
      }
      if (context.mode == 'get') {
        context.id = "passkey-get";
      }

      delete context.type; // passhub-passkey-chooser
      delete context.mode; // moved to id

      sendToPassHub(context)
        .then(result => {
          consoleLog('sendToPassHub: ' + result);
          if (result == "not connected") {
            choice = "cancel";
            port.postMessage(result);
          }
        });
    }
  });

  port.onDisconnect.addListener(() => {
    console.log('port disconnected');
    if (choice == 'passhub') {
      return;
    }
    // choice is 'passhub' | 'system' | 'cancel' when a button was used,
    // otherwise the popup was closed some other way (click outside, Esc, window closed).

    sendToPasskeyInterceptor({
      id: 'passkey-chooser-result',
      requestId,
      choice: choice || 'dismissed'
    });

  });


});





chrome.runtime.onMessage.addListener((popupMessage, sender, sendResponse) => {

  if (popupMessage.id == "passkey-chooser-context") {
    //message from passkeyBridge, just open popup with passkey page
    console.log('background got message from passkeyBridge', popupMessage);
    if (sender.tab?.id !== undefined) {
      pendingChoosers.set(popupMessage.data.requestId, { tabId: sender.tab.id, frameId: sender.frameId });
    }
    chrome.storage.session.set({ passkeyChooserContext: popupMessage.data })
      .then(() => chrome.action.openPopup({ windowId: sender.tab?.windowId }))
      .catch(err => {
        // Window has no toolbar (popup/app/devtools window): use a standalone window.
        consoleLog('openPopup failed, opening popup window: ' + err.message);
        return false;
      })
      .then(() => {
        consoleLog('popup successfully opened')
        sendResponse({ status: 'ok' })
      })
      .catch(err => {
        consoleLog(err);
        sendResponse({ error: err.message });
      });
    return true; // async response
  }

  consoleLog("bg got (popup) message");
  consoleLog(popupMessage);

  sendResponse({ status: 'wait' });

  sendToPassHub(popupMessage)
    .then(result => {
      if (result != "Ok") notConnected();
    });
})

function injectionOnInstall() {
  const event = new Event("passhubExtInstalled");
  document.dispatchEvent(event);
  consoleLog("extension installed");
}

chrome.runtime.onInstalled.addListener(() => {
  const manifest = chrome.runtime.getManifest();
  const urlList = manifest.externally_connectable.matches;

  chrome.tabs.query({ url: urlList }, function (passHubTabs) {
    if (passHubTabs && passHubTabs.length) {
      const tabId = passHubTabs[0].id;

      chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: injectionOnInstall,
      })
        .catch(err => {
          consoleLog('catch 107');
          consoleLog(err)
        })
    }
  });
})

