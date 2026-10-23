   There are now three context scripts:

   1. passkeyInterceptor.js. Is injected to all new tabs just after page is fully loaded. Works in the MAIN world. Functions: intercept and redefine navigator.credentials.get and navigator.credentials.create. Communicates event with passkeyUrlBridge.js (postMesage)
   2. passkeyUrlBridge.js (misleading name, should be passkeyBridge). Injected in every tab when document is fully loaded. Works in the ISOLARED world. Converts postMessage events to the chrome.runtime.sendMessage and back. Connects passkeyinterceptor with extension backgrond
   3. autofull.js (former contextscript.js). It is injected only when user clicks popup button or clicks a link on the passhub page. Works in the ISOLATED world, hence shares variables and functions (consoleLog) with passkeyUrlBridge.js
   
   Background, on receiving a message from passkeyInterceptor, shows popup asking if the user wants to use  Passhub passkey. To open proper page in the popup, background fills storage.session "passhub" variable.
   Popup first checks if the storage.session "passhub" is set, opens the passkey page and clears storage.session "passhub".

   If the user choice is  "system" or "cancel", it is sent back through background.js and passkeyUlrBridge. 
   In order to detect popup window closes due to user clicks outside the popup, a static conneection is established between the popup and the background. When popup closes, the connection port disconnects. Background.js detects the event and sends "cancel" relust to the passkeyInerceptor

