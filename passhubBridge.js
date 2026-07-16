/**
 * passhubBridge.js
 * Bridge между ISOLATED context (passhubTabScript.js) и MAIN context (passhub-passkey-api.js)
 * 
 * Injected в MAIN context через DOM script element
 */
(function() {
    'use strict';
    console.log('🔗 PassHub bridge loaded in MAIN context');

    // Слушаем команды от passhubTabScript (ISOLATED context) через CustomEvent
    document.addEventListener('passhub-bridge-request', async (event) => {
        console.log('📥 Bridge received request from ISOLATED:', event.detail);

        const { id, data, requestId } = event.detail;

        // Отправляем в passhub-passkey-api.js через window.postMessage (MAIN context)
        window.postMessage({
            type: 'passhub-passkey-request',
            id: id,
            data: data
        }, '*');

        // Слушаем ответ от passhub-passkey-api.js
        const responseHandler = (e) => {
            if (e.data && e.data.type === 'passhub-passkey-response') {
                console.log('📥 Bridge received response from PassHubPasskeyAPI:', e.data.result);
                window.removeEventListener('message', responseHandler);

                // Отправляем ответ обратно в passhubTabScript через CustomEvent
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

        // Timeout для cleanup
        setTimeout(() => {
            window.removeEventListener('message', responseHandler);
        }, 30000);
    });

    console.log('✅ PassHub bridge ready');
})();
