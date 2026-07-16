
const consoleLog = () => { };
const windowClose = window.close;

/*
// Debug mode:
const consoleLog = console.log;
const windowClose = () => { consoleLog('xxx') };
*/

let activeTab = null;

let frameResponded = 0;
let validFrames = [];
let sameUrlFrames = [];
let paymentFrames = [];
let paymentStatus = "not a payment page";
let paymentHost = null;

// all enrties found by passhub.net for the current tab 
let foundRecords = [];

function validFramesRemove(frame) {
  validFrames = validFrames.filter(e => e !== frame);
}

function notConnected() {
  showPage(".login-page");

  browser.storage.local.get("passhubHost")
    .then(data => {
      consoleLog("storage");
      consoleLog(data);
      if (!data || !data.passhubHost || (data.passhubHost == '')) {
        currentServer = { passhubHost: "passhub.net" };
      } else {
        currentServer = data;
      }
      //      document.getElementById('url').value = currentServer.passhubHost;
      //      document.getElementById('current-server').innerText = currentServer.passhubHost;
      let passhubHost = currentServer.passhubHost.toLowerCase();

      document.getElementById('server-name-element').style.display = 'none';
      document.getElementById('login-to-passhub-link').innerText = passhubHost;

      document.querySelector('#passhub-link').onclick = () => { activatePassHubTab(passhubHost) };



      /*
      if (passhubHost == "passhub.net") {
        document.getElementById('server-name-element').style.display = 'none';
      } else {
        document.getElementById('server-name-element').innerText = passhubHost;
        document.getElementById('login-to-passhub-link').innerText = passhubHost;

        document.getElementById('server-name-element').style.display = 'initial';
        document.querySelector('#passhub-link').onclick = () => { activatePassHubTab(passhubHost) };
      }
        */

    })
}

function gotPaymentStatus(tab, frame, response) {

  if (response.payment == "payment page") {
    paymentStatus = response.payment;
    paymentFrames.push(frame);
  }

  if (response.payment == "not valid frame") {
    validFramesRemove(frame);
  } else {
    frameResponded++;
  }

  if (frameResponded == validFrames.length) {

    let mainURL = new URL(activeTab.url);

    const mainDomains = mainURL.host.split('.').reverse();
    if (mainDomains[mainDomains.length - 1] == 'www') {
      mainDomains.pop();
    }

    for (let frame of validFrames) {

      const frameURL = new URL(frame.url);
      const frameDomains = frameURL.host.split('.').reverse();
      if (frameDomains[frameDomains.length - 1] == 'www') {
        frameDomains.pop();
      }

      const minLength = mainDomains.length < frameDomains.length ? mainDomains.length : frameDomains.length;
      const maxLength = mainDomains.length > frameDomains.length ? mainDomains.length : frameDomains.length;
      if (maxLength - minLength > 1) {
        continue;
      }
      let same = true;
      for (let i = 0; i < minLength; i++) {
        if (frameDomains[i] != mainDomains[i]) {
          same = false;
          break;
        }
      }
      if (same) {
        sameUrlFrames.push(frame);
      }
    }

    if (paymentFrames.length) {
      const paymentUrl = new URL(paymentFrames[0].url);
      paymentHost = paymentUrl.host;
    }

    chrome.runtime.sendMessage({ id: paymentHost ? "payment page" : "not a payment page", url: tab.url, tabId: tab.id })
      .then(bgResponse => {
        const p = document.querySelector('#status-text');
        if (bgResponse.status == 'not connected') {
          notConnected();
        }
      })
      .catch(err => {
        consoleLog('catch 32');
        consoleLog(err);
      })
  }
}

function paymentPlatform() {
  if (paymentHost) {
    let mainURL = new URL(activeTab.url);
    let mHost = mainURL.host;

    let parts = mainURL.host.split('.');

    if (parts.length > 1) {
      mHost = parts.slice(parts.length - 2).join('.');
    }
    parts = paymentHost.split('.');

    let pHost = paymentHost;

    if (parts.length > 1) {
      pHost = parts.slice(parts.length - 2).join('.')
    }
    if (pHost != mHost) {
      return paymentHost;
    }
  }
  return null;
}

function notRegularPage(url) {
  // a page where injectScript fails
  // e.g. about:debugging#/runtime/this-firefox
  showPage(".not-a-regular-page");
  document.getElementById('not-a-regular-page-url').innerText = url;
}

function installScript(tab, frame) {

  chrome.tabs.sendMessage(tab.id, { id: 'payment status' }, { frameId: frame.frameId })
    .then(response => {
      gotPaymentStatus(tab, frame, response);
    })
    .catch(err => {
      consoleLog(`catch69 frame: ${frame.frameId}`);
      consoleLog(err);

      chrome.scripting.executeScript(
        {
          target: { tabId: tab.id, frameIds: [frame.frameId] },
          files: ['contentScript.js'],
        })
        .then(injectionResult => {

          chrome.tabs.sendMessage(tab.id, { id: 'payment status' }, { frameId: frame.frameId })
            .then(response => {
              gotPaymentStatus(tab, frame, response);
            })
            .catch(err => {
              consoleLog(`catch70 frame: ${frame.frameId} ${frame.url}`);
              consoleLog(err);
              gotPaymentStatus(tab, frame, { payment: "not valid frame" });
            })
        })
        .catch(err => {
          consoleLog(`catch71 frame: ${frame.frameId} ${frame.url}`);
          consoleLog(err);
          if (frame.frameId == 0) {
            notRegularPage(activeTab.url);
          }
          gotPaymentStatus(tab, frame, { payment: "not valid frame" });
        })
    })
}

const dial =
  `<svg style="transform: rotate(90deg) scale(-1,1)" width="24" viewBox="0 0 200 200" version="1.1"
    xmlns="http://www.w3.org/2000/svg">
    <circle r="90" cx="100" cy="100" fill="transparent" stroke-width="20">
    </circle>
    <circle class="otp-dial" r="85" cx="100" cy="100" fill="transparent"  stroke-width="30";
        stroke-dashoffset="0"></circle>
</svg>`

function setOtpDial(val) {
  const circles = document.querySelectorAll('svg .otp-dial');

  if (isNaN(val)) {
    val = 100;
  } else {
    if (val < 0) { val = 0; }
    if (val > 100) { val = 100; }


    for (const circle of circles) {
      const r = circle.getAttribute('r');
      const c = Math.PI * (r * 2);
      const pct = c - ((100 - val) / 100) * c;

      circle.style.strokeDashoffset = pct;
      circle.style.strokeDasharray = c;

    }
  }
}

// all entries foundRecords by passhub.net for the current tab 

function updateOtp() {
  for (let i = 0; i < foundRecords.length; i++) {
    if ('totp_next' in foundRecords[i]) {
      foundRecords[i].totp = foundRecords[i].totp_next;
      const record = document.querySelector(`[data-row = "${i}"]`)
      const totpValue = record.querySelector('.totp-value')
      if (totpValue) {
        totpValue.innerText = foundRecords[i].totp;
      }
    }
  }
}

setInterval(() => {
  const d = new Date();
  setOtpDial((d.getSeconds() % 30) * 10 / 3)
  if ((d.getSeconds() % 30) == 0) {
    updateOtp()
  }
}, 1000)

function hideTitles() {
  for (const foundEntry of document.querySelectorAll(".found-entry")) {
    foundEntry.setAttribute('data-save-title', foundEntry.title);
    foundEntry.title = '';
  }
}

function restoreTitles() {
  for (const foundEntry of document.querySelectorAll(".found-entry")) {
    foundEntry.title = foundEntry.getAttribute('data-save-title');
  }
}

document.querySelector('#modal-mask').addEventListener('click', (ev) => {
  ev.stopPropagation();
  ev.target.style.display = 'none';
  restoreTitles();

  const copyDialogs = document.querySelectorAll('.copy-dialog')
  for (const copyDialog of copyDialogs) {
    copyDialog.style.display = 'none'
  }
})

function copyDivEntryClick(ev, fieldName) {
  ev.stopPropagation();
  document.querySelector('#modal-mask').style.display = 'none';
  restoreTitles();
  const foundEntry = ev.target.closest('.found-entry');
  const row = parseInt(foundEntry.getAttribute('data-row'));
  if (paymentStatus == "payment page") {
    const card = foundRecords[row].card;
    if (fieldName == "cc-name") {
      navigator.clipboard.writeText(card[4].trim())
    }
    if (fieldName == "cc-number") {
      navigator.clipboard.writeText(card[3].trim())
    }
    if (fieldName == "cc-exp-month") {
      navigator.clipboard.writeText(card[5].trim())
    }
    if (fieldName == "cc-exp-year") {
      navigator.clipboard.writeText(card[6].trim())
    }
    if (fieldName == "cc-exp") {
      const exp = `${card[5]}/${card[6].slice(-2)}`
      navigator.clipboard.writeText(exp)
    }
    if (fieldName == "cc-csc") {
      navigator.clipboard.writeText(card[7].trim())
    }
  } else {
    const field = foundRecords[row][fieldName];
    navigator.clipboard.writeText(field.trim())
  }

  const p = ev.target.closest('.copy-dialog');
  p.style.display = 'none'
}

function startCopiedTimer() {
  setTimeout(() => {
    document
      .querySelectorAll(".copied")
      .forEach((e) => (e.style.display = "none"));
    windowClose();

  }, 1000);
}

function renderFoundEntry(entryData, row) {

  const foundEntry = document.createElement('div');
  foundEntry.setAttribute('data-row', `${row}`);
  foundEntry.setAttribute('class', 'found-entry');

  const copyDialog = document.createElement('div');
  copyDialog.setAttribute('class', 'copy-dialog')

  if (paymentStatus == "payment page") {

    const copyCcName = document.createElement('div');
    copyCcName.innerHTML = '<span>Copy name</span>';

    copyCcName.addEventListener('click', (ev) => {
      copyDivEntryClick(ev, 'cc-name');
    })
    copyDialog.append(copyCcName);

    const copyCcNumber = document.createElement('div');
    copyCcNumber.innerHTML = '<span>Copy number</span>';

    copyCcNumber.addEventListener('click', (ev) => {
      copyDivEntryClick(ev, 'cc-number');
    })
    copyDialog.append(copyCcNumber);

    const copyCcCSC = document.createElement('div');
    copyCcCSC.innerHTML = '<span>Copy CVC</span>';

    copyCcCSC.addEventListener('click', (ev) => {
      copyDivEntryClick(ev, 'cc-csc');
    })
    copyDialog.append(copyCcCSC);

    const copyCcExp = document.createElement('div');
    const card = entryData.card;
    copyCcExp.innerHTML = `<span>Copy Exp. Date ${card[5]}/${card[6].slice(-2)}</span>`;

    copyCcExp.addEventListener('click', (ev) => {
      copyDivEntryClick(ev, 'cc-exp');
    })
    copyDialog.append(copyCcExp);

  } else {
    const copyUsername = document.createElement('div');
    copyUsername.innerHTML = '<span>Copy Username</span>';

    copyUsername.addEventListener('click', (ev) => {
      copyDivEntryClick(ev, 'username');
    })
    copyDialog.append(copyUsername);

    const copyPassword = document.createElement('div');
    copyPassword.innerHTML = '<span>Copy Password</span>';

    copyPassword.addEventListener('click', (ev) => {
      copyDivEntryClick(ev, 'password');
    })
    copyDialog.append(copyPassword);
  }

  foundEntry.setAttribute('title', 'Click to fill the form');

  if ("totp" in entryData) {
    const copyTotp = document.createElement('div');
    copyTotp.innerHTML = '<span>Copy One-time Code</span>';

    copyTotp.addEventListener('click', (ev) => {
      copyDivEntryClick(ev, 'totp');
    })
    copyDialog.append(copyTotp);
    foundEntry.setAttribute('title', 'Click to fill the form & copy TOTP');
  }

  copyDialog.style.display = 'none';
  foundEntry.append(copyDialog);

  const fillSpan = document.createElement('span')
  fillSpan.setAttribute('class', 'three-dots')

  fillSpan.innerHTML = '<img src="images/three-dots-vertical.svg">'
  fillSpan.setAttribute('title', 'Details')
  foundEntry.append(fillSpan);

  fillSpan.addEventListener('click', (ev) => {
    ev.stopPropagation();
    const p = ev.target.closest('.found-entry');
    const c = p.querySelector('.copy-dialog');
    c.style.display = 'block';
    document.querySelector('#modal-mask').style.display = 'block'
    hideTitles()
  })

  foundEntry.onclick = advItemClick;

  const titleDiv = document.createElement('div');
  titleDiv.setAttribute('class', 'found-title');
  titleDiv.innerText = entryData.title;
  foundEntry.appendChild(titleDiv);

  const safeDiv = document.createElement('div');
  safeDiv.setAttribute('class', 'found-safe');
  safeDiv.innerText = entryData.safe;
  foundEntry.appendChild(safeDiv);

  if ("totp" in entryData) {
    const totpDiv = document.createElement('div');
    totpDiv.setAttribute('class', 'found-totp');
    totpDiv.innerHTML = dial;
    totpDiv.innerHTML += '<div style="margin: 0 20px 0 10px; font-size: 14px">One-time code (TOTP)</div>';
    const totpValue = document.createElement('div');
    totpValue.setAttribute("title", "Copy one-time code");

    totpValue.innerHTML = `<code class="totp-value">${entryData.totp}
            <div class="copied" >
              <div>Copied &#10003;</div>
            </div>
          </code>`
      ;

    totpValue.addEventListener('click', (ev) => {
      ev.stopPropagation();
      totpValue.querySelector('.copied').style.display = 'initial';
      startCopiedTimer();
      navigator.clipboard.writeText(entryData.totp.trim()).then(() => {
        //windowClose();
      })
    })
    totpDiv.appendChild(totpValue);
    foundEntry.appendChild(totpDiv);
  }
  return foundEntry;
}

function renderAccounts(message) {

  const passhubInstanceLink = document.getElementById('server-name-element');
  if (('passhubInstance' in message) && (message.passhubInstance != "passhub.net") && (message.passhubInstance != "www.passhub.net")) {
    if (message.passhubInstance.startsWith("www.")) {
      passhubInstanceLink.innerText = message.passhubInstance.substring(4);
    } else {
      passhubInstanceLink.innerText = message.passhubInstance;
    }
    passhubInstanceLink.href = `https://${message.passhubInstance}`
    passhubInstanceLink.style.display = 'block';
  } else {
    passhubInstanceLink.innerText = '';
    passhubInstanceLink.style.display = 'none';
  }

  foundRecords = message.found;

  if (message.id === "payment") {
    paymentStatus = "payment page";
    document.querySelector('#credit-card').style.display = 'none';
    document.querySelector('#password-icon').style.display = 'initial';

    if (paymentHost) {
      let platform = paymentPlatform();
      if (platform) {
        document.getElementById('paygate').style.display = 'block';
        document.getElementById('paygate-url').innerText = platform;
      }
    }
    document.querySelector('#password-icon').addEventListener('click', () => {

      chrome.tabs.query({ active: true, currentWindow: true })
        .then(tabs => {

          chrome.runtime.sendMessage({ id: "not a payment page", url: tabs[0].url, tabId: tabs[0].id })
            .then(bgResponse => {
              const p = document.querySelector('#status-text');
              if (bgResponse.status == 'not connected') {
                notConnected();
              }
            })
            .catch(err => {
              consoleLog('catch 32');
              consoleLog(err);
            })
        })
    })

  } else {
    paymentStatus = "not a payment page";
    document.querySelector('#password-icon').style.display = 'none';
    document.querySelector('#credit-card').style.display = 'initial';
    document.querySelector('#credit-card').addEventListener('click', () => {

      chrome.runtime.sendMessage({ id: "payment page" /*, url: tab.url, tabId: tab.id */ })
        .then(bgResponse => {
          const p = document.querySelector('#status-text');
          if (bgResponse.status == 'not connected') {
            notConnected();
          }
        })
        .catch(err => {
          consoleLog('catch 32');
          consoleLog(err);
        })
    })
  }

  if (foundRecords.length === 0) {
    showPage(".not-found-page");
    if (message.id === "payment") {
      document.getElementById("not-found-password").style.display = "none";
      document.getElementById("not-found-payment-card").style.display = "block";
    } else {
      document.getElementById("not-found-password").style.display = "block";
      document.getElementById("not-found-payment-card").style.display = "none";
      const notFoundHostName = document.getElementById("not-found-hostname");
      notFoundHostName.innerText = message.hostname;
    }
    return;
  }

  const adviceListDiv = document.querySelector('#advice-list');
  adviceListDiv.replaceChildren() // clean-up the div (hiding errors - there should be nothing.. :)

  try {
    for (let i = 0; i < foundRecords.length; i++) {
      const foundEntry = renderFoundEntry(foundRecords[i], i)

      adviceListDiv.appendChild(foundEntry);
    }
  } catch (e) {
    consoleLog('catch 193');
    consoleLog(e);
  }
  adviceListDiv.style.display = 'block';
  showPage(".advice-page")
}

function advItemClick(e) {
  const row = parseInt(this.getAttribute('data-row'));

  chrome.tabs.query({ active: true, currentWindow: true })
    .then(tabs => {

      if (paymentStatus == "payment page") {
        if (paymentHost) {

          for (let frame of paymentFrames) {
            chrome.tabs.sendMessage(
              tabs[0].id,
              {
                id: 'card',
                card: foundRecords[row].card,
              },
              { frameId: frame.frameId })
              .then(response => {
                windowClose();
              })
              .catch(err => {
                consoleLog('catched 169');
                consoleLog(err);
              })
          }
        }
        return;
      }

      for (let frame of sameUrlFrames) {

        const messageToContentScript = {
          id: 'loginRequest',
          username: foundRecords[row].username,
          password: foundRecords[row].password,
          frameId: frame.frameId //debug
        }
        if ("totp" in foundRecords[row]) {
          navigator.clipboard.writeText(foundRecords[row].totp.trim())
          messageToContentScript.totp = foundRecords[row].totp.trim()
        }

        chrome.tabs.sendMessage(
          tabs[0].id, messageToContentScript,
          { frameId: frame.frameId }
        )
          .then(response => {
            windowClose();
          })
          .catch(err => {
            consoleLog('catched 169');
            consoleLog(err);
          })
      }
    });
}

function showPage(pageSelector) {
  const pages = document.querySelectorAll('.page');
  for (const page of pages) {
    page.style.display = "none";
  }
  const thePage = document.querySelector(pageSelector);
  thePage.style.display = 'block';
}

function activatePassHubDocTab() {
  const manifest = chrome.runtime.getManifest();
  const urlList = manifest.externally_connectable.matches;

  chrome.tabs.query({ url: urlList, currentWindow: true }, tabs => {
    for (let tab of tabs) {
      if (tab.url.includes('/doc/browser-extension')) {
        chrome.tabs.update(tab.id, { active: true });
        return;
      }
    }
    window.open('https://passhub.net/doc/browser-extension', '_blank');
  });
}

function activatePassHubTab(passhubHost = "passhub.net") {
  const manifest = chrome.runtime.getManifest();
  const urlList = manifest.externally_connectable.matches;

  chrome.tabs.query({ url: urlList, currentWindow: true })
    .then(passHubTabs => {
      for (let tab of passHubTabs) {
        if (tab.url.includes('doc')) {
          continue;
        }
        let url = new URL(tab.url);
        if (url.host == passhubHost) {
          chrome.tabs.update(tab.id, { active: true });
          window.close();
          return;
        }
      }
      window.open(`https://${passhubHost}`, '_blank');
    })
    .catch(err => {
      consoleLog('catch 657');
      consoleLog(err);
    })
}

document.querySelector('.help').onclick = activatePassHubDocTab;

document.querySelector('#server-name-element').onclick = () => {
  let passhubHost = document.querySelector('#server-name-element').innerText;
  activatePassHubTab(passhubHost);
}

document.querySelector('.close-popup').addEventListener('click', (ev) => {
  window.close()
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

  if (request.id === "not connected") {
    sendResponse({ response: 'Bye' })
    notConnected();
  }

  if ((request.id === "advise") || (request.id === "payment")) {
    sendResponse({ response: 'Bye' })
    renderAccounts(request);
    return;
  }
});

chrome.tabs.query({ active: true, currentWindow: true })
  .then(tabs => {
    activeTab = tabs[0];

    let mainURL = new URL(activeTab.url);

    if (mainURL.host == "") {
      notRegularPage(activeTab.url, mainURL.protocol);
      return;
    }

    if (mainURL.protocol != "https:") {
      if (mainURL.protocol == "http:") {
        document.querySelector("#danger-http").style.display = "block";
      } else {

        notRegularPage(activeTab.url, mainURL.protocol);
        return;
      }
    }

    let mainUrlFrames = [];  // do we need it?

    chrome.webNavigation.getAllFrames({ tabId: activeTab.id })
      .then(frameList => {
        for (let frame of frameList) {
          let frameURL = new URL(frame.url);
          if ((frameURL.host !== "") || (frameURL.protocol == "https:")) {
            validFrames.push(frame);
            if (frameURL.host == mainURL.host) {
              mainUrlFrames.push(frame);
            }
          }
        }

        if (mainUrlFrames.length == 0) {
          notRegularPage(activeTab.url);
          return;
        }

        for (let frame of validFrames) {
          installScript(activeTab, frame)
        }
      })
      .catch(err => {
        consoleLog('catch 105');
        consoleLog(err);

      })
  });
