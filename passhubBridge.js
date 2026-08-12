/**
 * passhubBridge.js
 * Bridge between the ISOLATED context (passhubTabScript.js) and MAIN context (passhub-passkey-api.js).
 * 
 * Injected into the MAIN context through a DOM script element.
 */
(function() {
    'use strict';
    console.log('🔗 PassHub bridge loaded in MAIN context');

    // Listen for commands from passhubTabScript (ISOLATED context) through CustomEvent.
    document.addEventListener('passhub-bridge-request', async (event) => {
        console.log('📥 Bridge received request from ISOLATED:', event.detail);

        const { id, data, requestId } = event.detail;

        

        // Listen for the response from passhub-passkey-api.js.
        const responseHandler = (e) => {
            if (e.data?.type === 'passhub-passkey-response' && e.data.requestId === requestId) {
                console.log('📥 Bridge received response from PassHubPasskeyAPI:', e.data.result);
                window.removeEventListener('message', responseHandler);

                // Send the response back to passhubTabScript through CustomEvent.
                const responseEvent = new CustomEvent('passhub-bridge-response', {
                    detail: {
                        requestId: requestId,
                        result: e.data.result
                    }
                });
                document.dispatchEvent(responseEvent);
                console.log('📤 Bridge sent response to ISOLATED');
            }
        };

        window.addEventListener('message', responseHandler);
        // Send to passhub-passkey-api.js through window.postMessage (MAIN context).
        window.postMessage({
            type: 'passhub-passkey-request',
            requestId,
            id,
            data
        }, '*');

        // Cleanup timeout.
        setTimeout(() => {
            window.removeEventListener('message', responseHandler);
        }, 30000);
    });

    console.log('✅ PassHub bridge ready');
})();
