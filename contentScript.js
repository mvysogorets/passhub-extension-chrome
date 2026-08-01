// GPL: https://github.com/passff/passff
console.log('✓ PassHub: contentScript.js loaded on', window.location.href);
// const consoleLog = console.log;
// const consoleLog = () => { };
  const consoleLog = console.log;
// Inject Passkey interceptor into page context (must run before page scripts)
(function injectPasskeyInterceptor() {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('passkeyInterceptor.js');
  script.onload = function() {
    console.log('✓ PassHub: Passkey interceptor injected successfully');
    this.remove();
  };
  script.onerror = function() {
    console.error('✗ PassHub: Failed to inject passkeyInterceptor.js');
    this.remove();
  };
  (document.head || document.documentElement).appendChild(script);
})();

// Relay: postMessage (page) ↔ chrome.runtime.sendMessage (background)
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
    window.postMessage({
      type: 'passhub-response',
      requestId,
      response: { error: error.message, useSystem: true }
    }, '*');
  }
});

function fireEvent(el, name) {
  el.dispatchEvent(
    new Event(name, {
      bubbles: true,
      composed: true,
      cancelable: true,
    })
  );
}

function setInputValue(input, value) {

  fireEvent(input, 'focus');
  fireEvent(input, 'focusin');
  fireEvent(input, 'keydown');
  input.value = value;
  fireEvent(input, 'input');
  fireEvent(input, 'change');
  fireEvent(input, 'keyup');
  fireEvent(input, 'blur');
  fireEvent(input, 'focusout');
}

let fillCounter = 0;
let intervalID = null;
let usernameID = null;

function initFillCredentials() {
  fillCounter = 0
  usernameID = null;

  clearInterval(intervalID);
  intervalID = null;
}


function isTotpCandidate(input) {
  const autocomplete = input.getAttribute('autocomplete');
  if (autocomplete === "one-time-code") {
    return true;
  }

  if (input.name.toLowerCase().search("otp") != -1) {
    return true;
  }
  return false;
}

function isUsernameCandidate(input) {

  if (isTotpCandidate(input)) {
    return false;
  }

  if ("id" in input && input.id.toLowerCase() === "password") {
    return false;
  }
  if ("id" in input && input.id.toLowerCase() === "captcha") {
    return false;
  }

  if ("id" in input && input.id.toLowerCase().search('search') != -1) {
    return false;
  }
  if ("placeholder" in input && input.placeholder.toLowerCase().search('search') != -1) {
    return false;
  }

  if (input.getBoundingClientRect().bottom < 0) {
    return false;
  }

  return true;
}

function findAllInputs() {

  const inputs = []

  function digShadowRoots(r) {
    consoleLog(r);
    // const x = [];
    const all = r.querySelectorAll('*');

    all.forEach(e => {
      if (e.shadowRoot && e.shadowRoot.mode === 'open') {
        consoleLog('element with shadowRoot')
        consoleLog(e)
        // x.push(e);
        const allInputs = e.shadowRoot.querySelectorAll('input')
        allInputs.forEach(i => inputs.push(i))
        digShadowRoots(e.shadowRoot)
      }
    })
  }

  document.querySelectorAll('input').forEach(i => inputs.push(i))

  digShadowRoots(document)

  return inputs;
};

function fillCredentials(loginData = null) {
  if (!loginData) {

    clearInterval(intervalID);
    intervalID = null;
    return;
  }

  let usernameInput = null;
  let passwordInput = null;

  const inputs = findAllInputs()


  fillCounter++;

  if (fillCounter < 100) {
    consoleLog(inputs.length);
  } else {
    clearInterval(intervalID);
    intervalID = null;
    return;
  }

  /*  
  let frameId = loginData.frameId; // debug
  
    if (frameId != 0) {
      consoleLog('frameId');
      consoleLog(frameId);
      let p = document.querySelector("#password-input");
      consoleLog('password element');
      consoleLog(document.querySelector("#password-input"));
      if (p) {
        consoleLog('password element found');
        passwordInput = p;
      }
  
      let u = document.querySelector("#userId-input");
      consoleLog('userId element');
      consoleLog(document.querySelector("#userId-input"));
      if (u) {
        consoleLog('username element found');
        usernameInput = u;
        //      usernameInput.value = loginData.username;
        //      u.dispatchEvent(new KeyboardEvent('keydown', { 'key': 'a' }));
  
  
      }
  
      const ui = document.querySelector("#userId-input");
      consoleLog('userId-input');
      consoleLog(document.querySelector("#userId-input"));
      if (ui) {
        consoleLog('userId-input element found');
      }
  
    }
  */

  if (!(usernameInput && passwordInput)) {
    consoleLog('contentScript: looking for username & password inputs');
    for (let input of inputs) {
      consoleLog('input');
      consoleLog(input);

      if (input.offsetParent === null) {
        continue;
      }
      if (input.disabled === true) {
        continue;
      }
      if (window.getComputedStyle(input).visibility == 'hidden') {
        continue;
      }

      if (("totp" in loginData) && isTotpCandidate(input)) {
        setInputValue(input, loginData.totp);
        return;
      }

      const itype = input.type.toLowerCase();
      if ((passwordInput == null) || (usernameInput == null)) {
        if ((itype == 'text') || (itype == 'email')) {
          if (isUsernameCandidate(input)) usernameInput = input;
        }
      }

      if ("id" in input && input.id == "password") {
        passwordInput = input;
      }

      if (itype === 'password') {
        passwordInput = input;
      }

      if (usernameInput && passwordInput) {
        break;
      }
    }
  }

  if (usernameInput && passwordInput) {
    consoleLog('contentScript done: username & password');
    setInputValue(usernameInput, loginData.username);
    setInputValue(passwordInput, loginData.password);

    clearInterval(intervalID);
    intervalID = null;
    return;
  }
  if (passwordInput) {
    consoleLog('contentScript done: password');
    setInputValue(passwordInput, loginData.password);

    clearInterval(intervalID);
    intervalID = null;
    return;
  }

  if (usernameInput) {
    if (
      usernameID != null &&
      typeof usernameInput.id != 'undefined' &&
      usernameInput.id == usernameID
    ) {
      // do nothing, already set
      return false;
    }
    consoleLog('contentScript: username only');
    setInputValue(usernameInput, loginData.username);

    if (typeof usernameInput.id != 'undefined') {
      usernameID = usernameInput.id;
    }
    return false;
  }

  if (usernameInput == null && passwordInput == null) {
    //    if (fillCounter > 20) {
    if (true) {
      consoleLog('contentScript nothing found');
      clearInterval(intervalID);
      intervalID = null;
      return;
    }
  }
}

function altCardnum() {
  const inputs = document.querySelectorAll('input');
  for (const input of inputs) {
    consoleLog('input');
    if (input.name.match(/card.{0,1}number|cc_number/i)) {
      return input;
    }
  }
  return null;
}

function altHolderName() {
  const inputs = document.querySelectorAll('input');
  for (const input of inputs) {
    if (input.name.match(/nameoncard|accountHolderName|cardholderName|cc-name/i)) {
      return input;
    }
  }
  return null;
}

function altCCExp() {

  let result = document.querySelector('#expiration-date');
  if (result) {
    return result;
  }

  return document.querySelector('input[name="cc_mmyy"]'); // e.g. vultr

}

function altCCYear() {
  let elements = document.querySelectorAll('select');
  for (const element of elements) {
    if (element.id.match(/cc.{0,1}year/i)) {
      let digits = element.querySelector('option').value.length;
      return { element, digits };
    }
    if (element.name.match(/year/i)) {
      let digits = element.querySelector('option').value.length;
      return { element, digits };
    }
  }
  return null;
}


function altCCMonth() {
  const elements = document.querySelectorAll('select');
  for (const element of elements) {
    if (element.id.match(/cc.{0,1}month/i)) {
      let digits = element.querySelector('option').value.length;
      return { element, digits };
    }
    if (element.name.match(/month/i)) {
      let digits = element.querySelectorAll('option')[1].value.length; // first element (index 0) is usually a placeholder
      return { element, digits };
    }
  }
  return null;
}

function altCSC() {
  let element = document.querySelector('input[name="cvv"]');
  if (!element) {
    element = document.querySelector('input[name="cc_cvv"]');
  }
  if (!element) {
    element = document.querySelector('input[name="cc_cscv"]'); // e.g. vultr
  }
  return element;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  consoleLog(message);
  consoleLog(sender.tab ?
    "from a content script:" + sender.tab.url :
    "from the extension");
  if (message.id === "loginRequest") {
    initFillCredentials();

    fillCredentials(message);

    /*    
        intervalID = setInterval(() => {
          fillCredentials(message);
          consoleLog(`fillCounter ${fillCounter}`)
        },
          100);
    */
    sendResponse({ farewell: "Ok" });
    return;
  }

  if (message.id === "card") {
    fillCardData(message.card);
    sendResponse({ farewell: "Ok" });
    return;
  }

  if (message.id === "payment status") {
    let ccNumber = document.querySelector('[autocomplete="cc-number"]');

    if (!ccNumber) {
      ccNumber = altCardnum();
    }
    /*
        if (ccNumber) {
          const paymentStatus = { payment: "payment page" }
          consoleLog('response 2');
          consoleLog(paymentStatus);
          sendResponse(paymentStatus);
        }
    */

    const ccName = document.querySelector('[autocomplete="cc-name"]');
    const ccCSC = document.querySelector('[autocomplete="cc-csc"]');

    const paymentStatus = { payment: ((ccNumber != null) || (ccName != null) || (ccCSC != null)) ? "payment page" : "not a payment page" }
    consoleLog('response 1');
    consoleLog(paymentStatus);
    sendResponse(paymentStatus);
    return;
  }
  sendResponse({ farewell: "contentScript goodbye" });
}
);

function fillCardData(card) {
  let cardnum = document.querySelector('[autocomplete="cc-number"]');

  if (!cardnum) {
    cardnum = altCardnum();
  }

  if (cardnum) {
    setInputValue(cardnum, card[3]);
  }

  let name = document.querySelector('[autocomplete="cc-name"]');
  if (!name) {
    name = altHolderName();
  }
  if (name) {
    setInputValue(name, card[4]);
  }

  let exp = document.querySelector('[autocomplete="cc-exp"]');
  let digits = 0;

  if (!exp) {
    exp = altCCExp();
  }
  if (exp) {
    let twoDigitYear = card[6];
    if (card[6].length > 2) {
      twoDigitYear = card[6].slice(-2); // Get last two characters
    }

    setInputValue(exp, `${card[5]}/${twoDigitYear}`);
  } else {
    let month = document.querySelector('[autocomplete="cc-exp-month"]');
    if (!month) {
      month = altCCMonth();
      if (month) {
        digits = month.digits;
        month = month.element;
      }
    }
    let cardMonth = card[5];

    if (digits === 1) {
      if (cardMonth[0] === '0') {
        cardMonth = card[5].slice(-1);
      }
    }

    if (month) {
      setInputValue(month, cardMonth);
    }

    let year = document.querySelector('[autocomplete="cc-exp-year"]');
    if (!year) {
      year = altCCYear();
      if (year) {
        digits = year.digits;
        year = year.element;
      }
    }
    if (year) {
      let twoDigitYear = card[6];
      if (card[6].length > 2) {
        twoDigitYear = card[6]
      }
      setInputValue(year, card[6]);
    }
  }

  let csc = document.querySelector('[autocomplete="cc-csc"]');
  if (!csc) {
    csc = altCSC();
  }
  if (csc) {
    setInputValue(csc, card[7]);
  }
}

