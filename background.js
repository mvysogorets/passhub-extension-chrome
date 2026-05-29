'use strict';

// const consoleLog = console.log;
const consoleLog = () => { };

let farewellCount = 0;

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

  if (request.id == 'clear to send') {
    if (!deferredMsg) {
      consoleLog('error deferredMsg absent');  // happens from time to time... 
    }
    sendResponse(deferredMsg);
    farewellCount++;
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
          files: ['contentScript.js']
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
  } else if ((request.id == 'advise') || (request.id == 'payment')) {
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

chrome.runtime.onMessage.addListener((popupMessage, sender, sendResponse) => {
  consoleLog("bg got (popup) message");
  consoleLog(popupMessage);

  sendResponse({ status: 'wait' });

  chrome.storage.session.get("passhub")
    .then(passhubWindow => {
      consoleLog("session storage returns");
      consoleLog(passhubWindow);
      if (!passhubWindow.passhub) {
        notConnected();
      } else {
        chrome.tabs.sendMessage(passhubWindow.passhub.peer.tab.id, {
          id: "request to send",
          origin: passhubWindow.passhub.origin,
          version: ("version" in passhubWindow.passhub) ? passhubWindow.passhub.version : 1
        })
          .then(response => {
            consoleLog('response to rts');
            consoleLog(response);
            if (response.farewell.includes('passhubTabScript')) {
              deferredMsg = popupMessage;
              consoleLog('deferredMsg set to');
              consoleLog(popupMessage);
            } else {
              notConnected();
            }
          })
          .catch(err => {
            notConnected();
          })
      }
    })
})

function injectionOnInstall() {
  const event = new Event("passhubExtInstalled");
  document.dispatchEvent(event);
  console.log("extension installed");
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
