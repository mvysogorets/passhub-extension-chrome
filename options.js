// const consoleLog = console.log;
const consoleLog = () => { };

let error_message = '';
let currentServer = '';

function initForm() {
  consoleLog('initForm');
  document.querySelector('#options-server').style.cursor = "initial";

  browser.storage.local.get("passhubHost")
    .then(data => {
      consoleLog("storage");
      consoleLog(data);
      if (!data || !data.passhubHost || (data.passhubHost == '')) {
        currentServer = { passhubHost: "passhub.net" };
      } else {
        currentServer = data;
      }

      document.getElementById('url').value = currentServer.passhubHost;
      //       document.getElementById('current-server').innerText = currentServer.passhubHost;
      document.getElementById('submit').style.display = 'none';
    })
    .catch(err => {
      consoleLog('catch 19');
      consoleLog(err);
    });
}

function onFormSubmit(e) {
  e.preventDefault();
  try {
    let val = document.getElementById('url').value;

    if (val.trim() == "") {
      val = "passhub.net";
      document.getElementById('url').value = val;
    }

    const protoPos = val.search('://');
    if (protoPos >= 0) {
      val = val.substr(protoPos + 3);
    }
    val = 'https://' + val;

    const newUrl = new URL(val);
    const newHostName = newUrl.hostname;

    consoleLog(newUrl);

    const allowedPatterns = chrome.runtime.getManifest().externally_connectable.matches;
    const urlMatchesAllowed = allowedPatterns.some(pattern => {
      const regexStr = pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*');
      return new RegExp('^' + regexStr + '$').test(newUrl.href);
    });
    if (!urlMatchesAllowed) {
      error_message = 'Host not allowed';
      document.getElementById('error-message').innerText = error_message;
      return;
    }

    consoleLog('url value to store ' + val);
    if (newHostName == currentServer.passhubHost) {
      consoleLog('same name');
      initForm();
      return;
    }
    document.querySelector('#options-server').style.cursor = "wait";

    consoleLog('changed from ' + currentServer.passhubHost);

    fetch(val, { method: "HEAD", signal: AbortSignal.timeout(4000) })
      .then(result => {
        consoleLog(`Got status: ${result.status}`);

        browser.storage.local.set({ passhubHost: newHostName, })
          .then(initForm);

      })
      .catch((err) => {
        consoleLog('catch 67');
        consoleLog(err);
        error_message = 'Host not responding';
        document.getElementById('error-message').innerText = error_message;
        document.querySelector('#options-server').style.cursor = "initial";
      })

  }
  catch (err) {
    consoleLog('catch 76');
    consoleLog(err);
    error_message = 'not a valid host name';
    document.getElementById('error-message').innerText = error_message;
    document.querySelector('#options-server').style.cursor = "initial";
  }
}

consoleLog('options JS started');

const form = document.querySelector("form");

form.addEventListener("submit", onFormSubmit);

document.getElementById('url').addEventListener('input', e => {

  document.getElementById('submit').style.display = 'initial';

  consoleLog('change event fired');
  error_message = '';
  document.getElementById('error-message').innerText = error_message;
});


document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === 'visible') {
    consoleLog('options visible');
  } else {
    consoleLog('options hidden');
  }
});


initForm();
