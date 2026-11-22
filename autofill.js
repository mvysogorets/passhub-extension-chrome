// GPL: https://github.com/passff/passff


// consoleLog is defined in passkeyBridge

consoleLog('autofill started');

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

// Split OTP: a row of single-digit inputs (e.g. Cisco Webex activation code,
// <div id="activationCodes"> with digit1..digit6, maxlength=1).
// Returns the ordered group of inputs if `input` belongs to one, else null.
function getSplitOtpGroup(input) {
  if (!input.parentElement || input.maxLength !== 1) {
    return null;
  }
  const group = Array.from(input.parentElement.querySelectorAll('input')).filter(
    (i) => i.maxLength === 1 && ['text', 'tel', 'number', 'password'].includes(i.type.toLowerCase())
  );
  if (group.length < 4 || group.length > 10 || !group.includes(input)) {
    return null;
  }
  const isNumeric = (i) =>
    i.inputMode === 'numeric' || /^\[0-9\]/.test(i.pattern || '') || i.type.toLowerCase() === 'number';
  const known = input.parentElement.id === 'activationCodes' || group.every(isNumeric);
  return known ? group : null;
}


function fillSplitOtp(group, totp) {
  const digits = String(totp).replace(/\D/g, '');
  if (digits.length < group.length) {
    return false;
  }
  group.forEach((input, idx) => setInputValue(input, digits[idx]));
  return true;
}


function isTotpCandidate(input) {
  const autocomplete = input.getAttribute('autocomplete');
  if (autocomplete === "one-time-code") {
    return true;
  }

  if (input.name.toLowerCase().search("otp") != -1) {
    return true;
  }
  if (input.name.toLowerCase().search("code") != -1) {
    return true;
  }

  if ("placeholder" in input && input.placeholder.toLowerCase().search('enter code') != -1) {  //aws
    return true;
  }

  if (input.hasAttribute('data-test-id')) {  // hubspot
    const value = input.getAttribute('data-test-id');
    if (value === 'two-factor-code-input') {
      return true;
    }
  }

  const url = new URL(document.URL);
  if (url.host.endsWith("asana.com")) {
    const h4s = document.getElementsByTagName('h4')

    const h4sf = Array.from(h4s).filter(e => e.checkVisibility());
    if (h4sf.length) {
      if (h4sf[0].innerText == 'Enter authentication code') {
        return true;
      }
    }
  }

  return false;
}

function isUsernameCandidate(input) {

  if (isTotpCandidate(input)) {
    return false;
  }

  if (getSplitOtpGroup(input)) {
    return false;
  }

  if (isPasswordCandidate(input)) {
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

function isPasswordCandidate(input) {
  const autocomplete = input.getAttribute('autocomplete');
  if (autocomplete === "new-password" || autocomplete === "current-password") {
    return true;
  }

  if (input.labels) {
    for (const label of input.labels) {
      if (label.textContent.toLowerCase().search("password") != -1) {
        return true;
      }
    }
  }

  if (input.placeholder && input.placeholder.toLowerCase() === "password") {
    return true;
  }

  if (input.type === "password") {
    return true;
  }

  if ("id" in input && input.id == "password") {
    return true;
  }

  return false;
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
  let otpInput = null;

  const inputs = findAllInputs()


  fillCounter++;

  if (fillCounter < 100) {
    consoleLog(inputs.length);
  } else {
    clearInterval(intervalID);
    intervalID = null;
    return;
  }

  if (!(usernameInput && passwordInput)) {
    consoleLog('autofill: looking for username & password inputs');
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
        otpInput = input;
        return;
      }

      if ("totp" in loginData) {
        const otpGroup = getSplitOtpGroup(input);
        if (otpGroup) {
          if (fillSplitOtp(otpGroup, loginData.totp)) {
            otpInput = input;
            clearInterval(intervalID);
            intervalID = null;
          }
          return;
        }
      }

      const itype = input.type.toLowerCase();
      if ((passwordInput == null) || (usernameInput == null)) {
        if ((itype == 'text') || (itype == 'email')) {
          if (isUsernameCandidate(input)) usernameInput = input;
        }
      }

      if (isPasswordCandidate(input)) {
        passwordInput = input;
      }

      if (usernameInput && passwordInput) {
        break;
      }
    }
  }

  if (usernameInput && passwordInput) {
    consoleLog('autofill done: username & password');
    setInputValue(usernameInput, loginData.username);
    setInputValue(passwordInput, loginData.password);

    clearInterval(intervalID);
    intervalID = null;

    if (!otpInput && ("totp" in loginData)) {
      for (let input of inputs) {
        if ((input != usernameInput) && (input != passwordInput)) {
          if (isTotpCandidate(input)) {
            setInputValue(input, loginData.totp);
            otpInput = input;
            break;
          }
        }
      }
    }

    return;
  }
  if (passwordInput) {
    consoleLog('autofill done: password');
    setInputValue(passwordInput, loginData.password);

    clearInterval(intervalID);
    intervalID = null;

    if (!otpInput && ("totp" in loginData)) {
      for (let input of inputs) {
        if ((input != passwordInput)) {
          if (isTotpCandidate(input)) {
            setInputValue(input, loginData.totp);
            otpInput = input;
            break;
          }
        }
      }
    }
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
    consoleLog('autofill: username only');
    setInputValue(usernameInput, loginData.username);

    if (typeof usernameInput.id != 'undefined') {
      usernameID = usernameInput.id;
    }
    return false;
  }

  if (usernameInput == null && passwordInput == null) {
    //    if (fillCounter > 20) {
    if (true) {
      consoleLog('autofill nothing found');
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
    if (input.name.match(/card.{0,1}number|cc_number|accountNumber/i)) {
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
  if (!element) {
    element = document.querySelector("#cardSecurityCode");
  }
  return element;
}

function addressFieldsPresent() {
  const autocompleteTokens = [
    'address-line1', 'address-line2', 'address-line3',
    'street-address', 'postal-code', 'country', 'country-name',
    'address-level1', 'address-level2'
  ];
  const pattern = new RegExp(`^(?:(?:shipping|billing)\\s+)?(?:${autocompleteTokens.join('|')})$`, 'i');
  const elements = document.querySelectorAll('[autocomplete]');

  consoleLog("address elements found");
  consoleLog(elements);
  for (const element of elements) {
    if (pattern.test(element.getAttribute('autocomplete').trim())) {
      return element;
    }
  }
  return null;
}

function cardFieldsPresent() {

  let ccNumber = document.querySelector('[autocomplete="cc-number"]');
  if (!ccNumber) {
    ccNumber = altCardnum();
  }
  const ccName = document.querySelector('[autocomplete="cc-name"]');
  const ccCSC = document.querySelector('[autocomplete="cc-csc"]');
  return (ccNumber != null) || (ccName != null) || (ccCSC != null);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  consoleLog(message);
  consoleLog(sender.tab ?
    "from a content script:" + sender.tab.url :
    "from the extension");
  if (message.id === "loginRequest") {
    initFillCredentials();

    fillCredentials(message);
    sendResponse({ farewell: "Ok" });
    return;
  }

  if (message.id === "card") {
    fillCardData(message.card);
    sendResponse({ farewell: "Ok" });
    return;
  }

  if (message.id === "address") {
    fillAddressData(message.address);
    sendResponse({ farewell: "Ok" });
    return;
  }

  if (message.id === "payment status") {

    const cardDetected = cardFieldsPresent();
    const addressDetected = addressFieldsPresent();

    let paymentStatus = "not a payment page";

    if (cardDetected && addressDetected) {
      paymentStatus = "payment and address page";
    } else if (cardDetected) {
      paymentStatus = "payment page";
    } else if (addressDetected) {
      paymentStatus = "address page";
    }

    consoleLog('response 1');
    consoleLog(paymentStatus);
    sendResponse(paymentStatus);
    return;
  }
  sendResponse({ farewell: "autofill goodbye" });
}
);

// address elements only 
function findByAutocompleteToken(token) {
  const pattern = new RegExp(`^(?:(?:shipping|billing)\\s+)?${token}$`, 'i');
  return Array.from(document.querySelectorAll('[autocomplete]'))
    .find(el => pattern.test(el.getAttribute('autocomplete').trim()));
}

function fillAddressData(address) {
  let country = findByAutocompleteToken('country');
  if (country) {
    setInputValue(country, address[8]);
  }
  let state = findByAutocompleteToken('address-level1');

  if (!state) {
    state = findByAutocompleteToken('state');
  }

  if (state) {
    setInputValue(state, address[6]);
  }

  let zip = findByAutocompleteToken('postal-code');
  if (zip) {
    setInputValue(zip, address[7]);
  }
  let city = findByAutocompleteToken('address-level2');
  if (city) {
    setInputValue(city, address[5]);
  }


  let streetAddress = findByAutocompleteToken('street-address');
  if (streetAddress) {
    setInputValue(streetAddress, `${address[3]} ${address[4]}`);
  } else {
    let addressLine1 = findByAutocompleteToken('address-line1');
    if (addressLine1) {
      setInputValue(addressLine1, address[3]);
    }
    let addressLine2 = findByAutocompleteToken('address-line2');
    if (addressLine2) {
      setInputValue(addressLine2, address[4]);
    }
  }
}

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
      let yearValue = card[6];
      if (digits === 2 && card[6].length > 2) {
        yearValue = card[6].slice(-2); // Get last two characters
      }
      setInputValue(year, yearValue);
    }
  }

  let csc = document.querySelector('[autocomplete="cc-csc"]');
  if (!csc) {
    csc = altCSC();
  }
  if (csc) {
    setInputValue(csc, card[7]);
  }

  if (card.length > 8) {
    let zip = findByAutocompleteToken('postal-code');
    if (zip) {
      setInputValue(zip, card[8]);
    }
  }
}
