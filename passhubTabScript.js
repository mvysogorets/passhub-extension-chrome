/*

Why do we need PasshubTabScript? - because an extension can only send messages to the contentscripts, not to the web page itself

*/

// const consoleLog = console.log;
// Защита от повторной загрузки
(function() {
    'use strict';

    const consoleLog = (...args) => {
        console.log('%c[passhubTabScript]', 'color: #4CAF50; font-weight: bold', ...args);
    };

    consoleLog('passhubTabScript start');

    // Инжектировать bridge в MAIN context (один раз)
    // Bridge загружается через script.src для соблюдения CSP (Content Security Policy)
    let bridgeInjected = false;
    function injectBridge() {
        if (bridgeInjected) return;
        
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('passhubBridge.js');
        (document.head || document.documentElement).appendChild(script);
        script.remove(); // Cleanup DOM после загрузки
        bridgeInjected = true;
        consoleLog('✅ Bridge injected into MAIN context');
    }

    // Inject bridge сразу при загрузке
    injectBridge();

    /**
     * Слушать сообщения от Extension (background.js)
     * Работает в ISOLATED context, имеет доступ к chrome.runtime API
     */
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        consoleLog('📨 Received from Extension:', request);

        // Ping-pong для проверки связи
        if (request.id === 'ping') {
            consoleLog('🏓 Responding to ping');
            sendResponse({ status: 'ok', context: 'passhubTabScript' });
            return true;
        }

        // Passkey request от Extension (forwarded from passkeyInterceptor via contentScript)
        if (request.id === 'passkey-create-request' || request.id === 'passkey-get-request') {
            consoleLog('🔑 Passkey request:', request.id);
            
            // Async обработка: отправить в PassHub API через bridge
            handlePasskeyRequest(request)
                .then(result => {
                    consoleLog('✅ Sending result back to Extension:', result);
                    sendResponse(result);
                })
                .catch(error => {
                    consoleLog('❌ Error:', error);
                    sendResponse({ 
                        error: error.message,
                        useSystem: true // Fallback на системный WebAuthn
                    });
                });
            
            return true; // Keep channel open for async response
        }

        return false;
    });

    /**
     * Handle passkey request: отправить в PassHub API через bridge
     * 
     * FLOW:
     * 1. Проверить что PassHubPasskeyAPI загружен на странице
     * 2. Создать requestId для матчинга response
     * 3. Отправить CustomEvent 'passhub-bridge-request' на document (ISOLATED → MAIN)
     * 4. Bridge получит event, отправит window.postMessage в passhub-passkey-api.js (MAIN → MAIN)
     * 5. PassHubPasskeyAPI обработает, вернет window.postMessage
     * 6. Bridge получит response, отправит CustomEvent 'passhub-bridge-response' (MAIN → ISOLATED)
     * 7. Этот handler получит response и вернет в Extension
     * 
     * @param {Object} request - Passkey request {action, data}
     * @returns {Promise<Object>} - WebAuthn credential или error
     */
    async function handlePasskeyRequest(request) {
        consoleLog('🔄 Processing passkey request');

        // Проверка что PassHubPasskeyAPI доступен на странице
        if (!document.querySelector('script[src*="passhub-passkey-api.js"]')) {
            throw new Error('PassHubPasskeyAPI not loaded on this page');
        }

        return new Promise((resolve, reject) => {
            const requestId = Date.now() + Math.random();
            consoleLog(`📤 Sending to bridge with requestId: ${requestId}`);

            // Отправить через CustomEvent в bridge (ISOLATED → MAIN via document)
            const requestEvent = new CustomEvent('passhub-bridge-request', {
                detail: {
                    id: request.id,
                    data: request.data,
                    requestId: requestId
                }
            });
            

            // Слушать ответ от bridge через CustomEvent
            const responseHandler = (event) => {
                if (event.detail.requestId === requestId) {
                    consoleLog(`📥 Response received for requestId: ${requestId}`, event.detail.result);
                    document.removeEventListener('passhub-bridge-response', responseHandler);
                    
                    const result = event.detail.result;
                    if (result && result.error) {
                        reject(new Error(result.error));
                    } else {
                        resolve(result);
                    }
                }
            };

            document.addEventListener('passhub-bridge-response', responseHandler);
            document.dispatchEvent(requestEvent);
            // Timeout для cleanup (30 секунд)
            setTimeout(() => {
                document.removeEventListener('passhub-bridge-response', responseHandler);
                reject(new Error('Bridge response timeout'));
            }, 30000);
        });
    }

    consoleLog('✅ passhubTabScript ready');

})();
