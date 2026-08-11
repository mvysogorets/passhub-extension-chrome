/**
 * passkeyInterceptor.js
 *
 * Перехватывает WebAuthn запросы (navigator.credentials.create/get)
 * и показывает overlay с выбором: PassHub или системный authenticator.
 */

'use strict';

(function() {
    if (window.__passHubPasskeyInterceptorInstalled) return;
    window.__passHubPasskeyInterceptorInstalled = true;

    if (!window.PublicKeyCredential) {
        console.log('PassHub Extension: WebAuthn not supported');
        return;
    }

    console.log('PassHub Extension: WebAuthn supported');

    const originalCreate = navigator.credentials.create.bind(navigator.credentials);
    const originalGet = navigator.credentials.get.bind(navigator.credentials);
    const extensionScriptUrl = document.currentScript?.src;
    const popupUrl = extensionScriptUrl ? new URL('popup.html', extensionScriptUrl) : null;

    /**
     * Показать overlay с выбором authenticator'а.
     * Возвращает Promise<'passhub' | 'system' | 'cancel'>
     */
    function showPasskeyChooser(mode, siteName, userName) {
        return new Promise((resolve) => {
            if (!popupUrl) {
                resolve('cancel');
                return;
            }

            const requestId = crypto.randomUUID();
            const chooserUrl = new URL(popupUrl);
            chooserUrl.searchParams.set('view', 'passkey');
            chooserUrl.searchParams.set('requestId', requestId);
            chooserUrl.searchParams.set('mode', mode);
            chooserUrl.searchParams.set('siteName', siteName);
            chooserUrl.searchParams.set('userName', userName);

            const iframe = document.createElement('iframe');
            iframe.setAttribute('title', mode === 'create' ? 'Save passkey' : 'Use passkey');
            iframe.src = chooserUrl.href;
            iframe.style.cssText = `
                all: initial;
                position: fixed;
                top: 16px;
                right: 16px;
                z-index: 2147483647;
                width: min(400px, calc(100vw - 24px));
                height: 380px;
                border: 0;
                border-radius: 5px;
                background: #fff;
                box-shadow: 0 4px 34px rgba(27, 27, 38, 0.28);
            `;

            const cleanup = (result) => {
                window.removeEventListener('message', responseHandler);
                iframe.remove();
                resolve(result);
            };

            const responseHandler = (event) => {
                if (event.source !== iframe.contentWindow) return;
                if (event.data?.type !== 'passhub-passkey-choice') return;
                if (event.data.requestId !== requestId) return;
                cleanup(event.data.choice);
            };

            window.addEventListener('message', responseHandler);
            document.documentElement.appendChild(iframe);
        });
    }

    /**
     * Перехват создания нового passkey (регистрация)
     */
    navigator.credentials.create = async function(options) {
        console.log('PassHub: Intercepted credentials.create', options);

        if (!options || !options.publicKey) {
            return originalCreate(options);
        }

        const publicKey = options.publicKey;
        const siteName = publicKey.rp?.name || publicKey.rp?.id || window.location.hostname;
        const userName = publicKey.user?.name || '';

        const choice = await showPasskeyChooser('create', siteName, userName);

        if (choice === 'system') {
            return originalCreate(options);
        }
        if (choice === 'cancel') {
            throw new DOMException('User cancelled', 'NotAllowedError');
        }

        // choice === 'passhub'
        const passkeyRequest = {
            type: 'passkey-create',
            rpId: publicKey.rp?.id || window.location.hostname,
            rpName: siteName,
            userName,
            userDisplayName: publicKey.user?.displayName || '',
            userHandle: publicKey.user?.id ? arrayBufferToBase64(publicKey.user.id) : null,
            challenge: arrayBufferToBase64(publicKey.challenge),
            origin: window.location.origin
        };

        try {
            const response = await sendToExtension({
                id: 'passkey-create-request',
                data: passkeyRequest
            });

            if (response && response.credential) {
                return reconstructCredential(response.credential, 'create');
            } else if (response && response.useSystem) {
                return originalCreate(options);
            } else if (response && response.error) {
                throw new Error(response.error);
            } else {
                throw new DOMException('PassHub: passkey creation failed', 'NotAllowedError');
            }
        } catch (error) {
            console.error('PassHub passkey creation failed:', error);
            throw new DOMException(`PassHub: ${error.message}`, 'NotAllowedError');
        }
    };

    /**
     * Перехват использования passkey (аутентификация)
     */
    navigator.credentials.get = async function(options) {
        console.log('PassHub: Intercepted credentials.get', options);

        // Conditional UI (autofill) — не перехватываем, пусть браузер обрабатывает
        if (options && options.mediation === 'conditional') {
            return originalGet(options);
        }

        if (!options || !options.publicKey) {
            return originalGet(options);
        }

        const publicKey = options.publicKey;
        const siteName = publicKey.rpId || window.location.hostname;

        const choice = await showPasskeyChooser('get', siteName, '');

        if (choice === 'system') {
            return originalGet(options);
        }
        if (choice === 'cancel') {
            throw new DOMException('User cancelled', 'NotAllowedError');
        }

        // choice === 'passhub'
        const passkeyRequest = {
            type: 'passkey-get',
            rpId: siteName,
            challenge: arrayBufferToBase64(publicKey.challenge),
            allowCredentials: publicKey.allowCredentials?.map(cred => ({
                id: arrayBufferToBase64(cred.id),
                type: cred.type
            })) || [],
            userVerification: publicKey.userVerification || 'preferred',
            origin: window.location.origin
        };

        console.info('[PassHub WebAuthn] authentication request', {
            rpId: passkeyRequest.rpId,
            origin: passkeyRequest.origin,
            userVerification: passkeyRequest.userVerification,
            allowCredentialsCount: passkeyRequest.allowCredentials.length,
            extensionNames: Object.keys(publicKey.extensions || {})
        });

        try {
            const response = await sendToExtension({
                id: 'passkey-get-request',
                data: passkeyRequest
            });

            if (response && response.assertion) {
                return reconstructCredential(response.assertion, 'get');
            } else if (response && response.useSystem) {
                return originalGet(options);
            } else if (response && response.error) {
                throw new Error(response.error);
            } else {
                throw new DOMException('PassHub: passkey authentication failed', 'NotAllowedError');
            }
        } catch (error) {
            console.error('PassHub passkey authentication failed:', error);
            throw new DOMException(`PassHub: ${error.message}`, 'NotAllowedError');
        }
    };

    /**
     * Bridge: postMessage → contentScript → background
     */
    function sendToExtension(message) {
        return new Promise((resolve, reject) => {
            const requestId = Math.random().toString(36).slice(2);

            function listener(event) {
                if (event.source !== window) return;
                if (!event.data || event.data.type !== 'passhub-response') return;
                if (event.data.requestId !== requestId) return;
                window.removeEventListener('message', listener);
                resolve(event.data.response);
            }

            window.addEventListener('message', listener);
            window.postMessage({ type: 'passhub-request', requestId, ...message }, '*');

            setTimeout(() => {
                window.removeEventListener('message', listener);
                reject(new Error('PassHub request timeout'));
            }, 60000);
        });
    }

    /**
     * Утилиты
     */
    function arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    }

    function base64ToArrayBuffer(base64) {
        // Восстановить padding
        base64 = base64.replace(/-/g, '+').replace(/_/g, '/');
        while (base64.length % 4 !== 0) {
            base64 += '=';
        }
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }

    function normalizeBase64Url(base64) {
        return base64
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    }

    function reconstructCredential(data, type) {
        if (type === 'create') {
            // PublicKeyCredential для создания
            return {
                id: normalizeBase64Url(data.credentialId),
                rawId: base64ToArrayBuffer(data.credentialId),
                type: 'public-key',
                authenticatorAttachment: null,
                getClientExtensionResults() {
                    return { credProps: { rk: true } };
                },
                response: {
                    clientDataJSON: base64ToArrayBuffer(data.clientDataJSON),
                    attestationObject: base64ToArrayBuffer(data.attestationObject),
                    getTransports() {
                        return [];
                    }
                }
            };
        } else {
            // PublicKeyCredential для аутентификации
            const authenticatorData = new Uint8Array(base64ToArrayBuffer(data.authenticatorData));
            const clientData = JSON.parse(new TextDecoder().decode(base64ToArrayBuffer(data.clientDataJSON)));
            const flags = authenticatorData[32];
            console.info('[PassHub WebAuthn] assertion returned to RP', {
                credentialId: normalizeBase64Url(data.credentialId),
                clientDataType: clientData.type,
                origin: clientData.origin,
                crossOrigin: clientData.crossOrigin,
                flags: `0x${flags.toString(16).padStart(2, '0')}`,
                userPresent: Boolean(flags & 0x01),
                userVerified: Boolean(flags & 0x04),
                backupEligible: Boolean(flags & 0x08),
                backupState: Boolean(flags & 0x10),
                signCount: new DataView(authenticatorData.buffer).getUint32(33, false),
                userHandleLength: data.userHandle ? base64ToArrayBuffer(data.userHandle).byteLength : 0,
                signatureLength: base64ToArrayBuffer(data.signature).byteLength
            });
            return {
                id: normalizeBase64Url(data.credentialId),
                rawId: base64ToArrayBuffer(data.credentialId),
                type: 'public-key',
                authenticatorAttachment: null,
                getClientExtensionResults() {
                    return {};
                },
                response: {
                    clientDataJSON: base64ToArrayBuffer(data.clientDataJSON),
                    authenticatorData: authenticatorData.buffer,
                    signature: base64ToArrayBuffer(data.signature),
                    userHandle: data.userHandle ? base64ToArrayBuffer(data.userHandle) : null
                }
            };
        }
    }

    // Уведомить extension что перехватчик готов
    window.postMessage({ type: 'passhub-interceptor-ready' }, window.location.origin);
})();
