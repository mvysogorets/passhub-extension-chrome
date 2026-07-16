
/*

Why do we need PasshubTabScript? - because an extension can only send messages to the contentscripts, not to the web page itself

*/

// const consoleLog = console.log;
// Защита от повторной загрузки
if (!window.passhubTabScriptLoaded) {
    window.passhubTabScriptLoaded = true;

const consoleLog = () => { };

consoleLog('passhubTabScript start');

    // Инжектировать bridge в MAIN context (один раз)
    let bridgeInjected = false;
    function injectBridge() {
        if (bridgeInjected) return;
        
        const script = document.createElement('script');
        script.textContent = `
/**
 * passhubBridge - inline injected
 * Bridge между ISOLATED context (passhubTabScript.js) и MAIN context (passhub-passkey-api.js)
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
        `;
        (document.head || document.documentElement).appendChild(script);
        script.remove();
        bridgeInjected = true;
        console.log('✅ Bridge injected into MAIN context');
    }

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    consoleLog('passhubTabScript: message');
    consoleLog(message);
    consoleLog('passhubTabScript:  sender');
    consoleLog(sender);

    if (message.id === 'request to send') {
        sendResponse({ farewell: "passhubTabScript goodbye" });
        if (("version" in message) && message.version > 1) {
            consoleLog("passhubTabScript: an event created");
            const event = new Event("rts");
            document.dispatchEvent(event);
        } else {
            consoleLog("passhubTabScript: a message is posted");
            window.postMessage(message, message.origin);
        }
        return;
    }

        // Passkey request handling через bridge
        if (message.id === 'passkey-create-request' || message.id === 'passkey-get-request') {
            // Убедимся что bridge инжектирован
            injectBridge();

            (async () => {
                try {
                    const requestId = Math.random().toString(36).slice(2);
                    console.log('📤 Sending request to MAIN context via bridge, requestId:', requestId);

                    // Слушаем ответ от bridge (MAIN context)
                    const responsePromise = new Promise((resolve) => {
                        const handler = (e) => {
                            if (e.detail && e.detail.requestId === requestId) {
                                console.log('🔔 Received response from bridge:', e.detail.result);
                                document.removeEventListener('passhub-bridge-response', handler);
                                resolve(e.detail.result);
                            }
                        };
                        document.addEventListener('passhub-bridge-response', handler);
                    });

                    // Отправляем запрос в bridge через CustomEvent
                    const requestEvent = new CustomEvent('passhub-bridge-request', {
                        detail: {
                            requestId: requestId,
                            id: message.id,
                            data: message.data
                        }
                    });
                    document.dispatchEvent(requestEvent);

                    const result = await responsePromise;
                    console.log('✅ Sending result back to Extension:', result);
                    sendResponse(result);
                } catch (error) {
                    console.error('❌ Error in passkey bridge:', error);
                    sendResponse({ error: error.message, useSystem: true });
                }
            })();

            return true; // Async response
        }

    sendResponse({ farewell: "passhubTabScript goodbye" });
});
}
