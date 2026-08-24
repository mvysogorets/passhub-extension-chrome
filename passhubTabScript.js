/*

Why do we need PasshubTabScript? - because an extension can only send messages to the contentscripts, not to the web page itself

*/

// const consoleLog = console.log;
// Prevent duplicate installation.
(function() {
    'use strict';

    if (globalThis.__passHubTabScriptInstalled) return;
    globalThis.__passHubTabScriptInstalled = true;

    const consoleLog = (...args) => {
        console.log('%c[passhubTabScript]', 'color: #4CAF50; font-weight: bold', ...args);
    };

    consoleLog('passhubTabScript start');

    /**
    * Listen for messages from the extension (background.js).
    * Runs in the ISOLATED context and has access to the chrome.runtime API.
     */
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        consoleLog('Received from Extension:', request);

        // Ping-pong connectivity check.
        if (request.id === 'ping') {
            consoleLog('Responding to ping');
            sendResponse({ status: 'ok', context: 'passhubTabScript' });
            return true;
        }

        // Passkey request from the extension, forwarded by contentScript from passkeyInterceptor.
        if (request.id === 'passkey-create-request' || request.id === 'passkey-get-request') {
            consoleLog('Passkey request:', request.id);
            
            // Process asynchronously by sending the request to the PassHub API through the bridge.
            handlePasskeyRequest(request)
                .then(result => {
                    consoleLog('Sending result back to Extension:', result);
                    sendResponse(result);
                })
                .catch(error => {
                    consoleLog('Error:', error);
                    sendResponse({ error: error.message });
                });
            
            return true; // Keep channel open for async response
        }

        return false;
    });

    /**
    * Handle a passkey request by sending it to the PassHub API through the bridge.
     * 
     * FLOW:
    * 1. Verify that PassHubPasskeyAPI is loaded on the page.
    * 2. Create a request ID for matching the response.
    * 3. Send the request to PassHubPasskeyAPI through window.postMessage.
    * 4. Receive the correlated response and return it to the extension.
     * 
     * @param {Object} request - Passkey request {action, data}
    * @returns {Promise<Object>} WebAuthn credential or error
     */
    async function handlePasskeyRequest(request) {
        consoleLog('Processing passkey request');

        // Verify that PassHubPasskeyAPI is available on the page.
        if (!document.querySelector('script[src*="passhub-passkey-api.js"]')) {
            throw new Error('PassHubPasskeyAPI not loaded on this page');
        }

        return new Promise((resolve, reject) => {
            const requestId = Date.now() + Math.random();
            consoleLog(`Sending to PassHub API with requestId: ${requestId}`);

            const responseHandler = (event) => {
                if (event.source !== window) return;
                if (event.data?.type !== 'passhub-passkey-response') return;
                if (event.data.requestId !== requestId) return;

                consoleLog(`Response received for requestId: ${requestId}`, event.data.result);
                window.removeEventListener('message', responseHandler);

                const result = event.data.result;
                if (result && result.error) {
                    reject(new Error(result.error));
                } else {
                    resolve(result);
                }
            };

            window.addEventListener('message', responseHandler);
            window.postMessage({
                type: 'passhub-passkey-request',
                requestId,
                id: request.id,
                data: request.data
            }, window.location.origin);

            // Cleanup timeout.
            setTimeout(() => {
                window.removeEventListener('message', responseHandler);
                reject(new Error('PassHub API response timeout'));
            }, 60000);
        });
    }

    consoleLog('passhubTabScript ready');

})();
