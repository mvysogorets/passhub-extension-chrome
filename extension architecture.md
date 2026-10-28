There are now three context scripts:

1. **passkeyInterceptor.js** is injected into all new tabs after the page has fully loaded. It runs in the MAIN world. Its functions intercept and redefine `navigator.credentials.get` and `navigator.credentials.create`. It communicates with `passkeyUrlBridge.js` using `postMessage`.
2. **passkeylBridge.js** is injected into every tab after the document has fully loaded. It runs in the ISOLATED world. It converts `postMessage` events to `chrome.runtime.sendMessage` calls and vice versa. It connects `passkeyInterceptor.js` to the extension's background script.
3. **autofull.js** (formerly `contextscript.js`) is injected only when the user clicks the popup button or a link on the Passhub page. It runs in the ISOLATED world, so it shares variables and functions (such as `consoleLog`) with `passkeyUrlBridge.js`.
   
When the background script receives a message from `passkeyInterceptor.js`, it shows a popup asking whether the user wants to use a Passhub passkey. To open the correct page in the popup, the background script sets the `storage.session` variable `"passhub"`.

The popup first checks whether `storage.session` variable `"passhub"` is set. If it is, the popup opens the passkey page and clears the variable.

To detect when the user closes the popup by clicking outside it, a static connection is established between the popup and the background script. When the popup closes, the connection port disconnects. `background.js` detects this event and sends a `"cancel"` result to `passkeyInterceptor.js`.

If the user's choice is `"system"` or `"cancel"`, it is sent back through `background.js` and `passkeyBridge.js`.

If the user choice is `"use passhub"`, the background checks if the active passhub (explain) is responsive. If not, the popup shows "login to passhub" page and the background sends "cancel" to the `passkeyBridge`


