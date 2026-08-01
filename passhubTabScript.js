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
                    sendResponse({ error: error.message });
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
    * 3. Отправить запрос в PassHubPasskeyAPI через window.postMessage
    * 4. Получить коррелированный response и вернуть его в Extension
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
            consoleLog(`📤 Sending to PassHub API with requestId: ${requestId}`);

            const responseHandler = (event) => {
                if (event.source !== window) return;
                if (event.data?.type !== 'passhub-passkey-response') return;
                if (event.data.requestId !== requestId) return;

                consoleLog(`📥 Response received for requestId: ${requestId}`, event.data.result);
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

            // Timeout для cleanup (30 секунд)
            setTimeout(() => {
                window.removeEventListener('message', responseHandler);
                reject(new Error('PassHub API response timeout'));
            }, 30000);
        });
    }

    consoleLog('✅ passhubTabScript ready');

})();
