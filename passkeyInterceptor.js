/**
 * passkeyInterceptor.js
 *
 * Перехватывает WebAuthn запросы (navigator.credentials.create/get)
 * и показывает overlay с выбором: PassHub или системный authenticator.
 */

'use strict';

(function() {
    if (!window.PublicKeyCredential) {
        console.log('PassHub Extension: WebAuthn not supported');
        return;
    }

    console.log('PassHub Extension: WebAuthn supported');

    const originalCreate = navigator.credentials.create.bind(navigator.credentials);
    const originalGet = navigator.credentials.get.bind(navigator.credentials);

    /**
     * Показать overlay с выбором authenticator'а.
     * Возвращает Promise<'passhub' | 'system' | 'cancel'>
     */
    function showPasskeyChooser(mode, siteName, userName) {
        return new Promise((resolve) => {
            // Overlay (backdrop)
            const overlay = document.createElement('div');
            overlay.style.cssText = `
                all: initial;
                position: fixed; inset: 0; z-index: 2147483647;
                background: rgba(0,0,0,0.45);
                display: flex; align-items: center; justify-content: center;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            `;

            // Dialog
            const dialog = document.createElement('div');
            dialog.style.cssText = `
                background: #fff; border-radius: 16px;
                padding: 28px 32px; width: 340px; box-shadow: 0 8px 40px rgba(0,0,0,0.22);
                display: flex; flex-direction: column; gap: 16px;
            `;

            const title = mode === 'create' ? 'Create Passkey' : 'Sign in with Passkey';
            const subtitle = mode === 'create'
                ? `Save passkey for <b>${siteName}</b>${userName ? ` (${userName})` : ''} to:`
                : `Use passkey for <b>${siteName}</b> from:`;

            dialog.innerHTML = `
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px;">
                    <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
                        <rect width="32" height="32" rx="8" fill="#1a73e8"/>
                        <path d="M16 7a5 5 0 0 1 5 5c0 2.1-1.28 3.9-3.13 4.68L17.5 25h-3l.63-8.32A5 5 0 0 1 16 7z" fill="#fff" opacity=".9"/>
                        <circle cx="16" cy="12" r="2.5" fill="#fff"/>
                    </svg>
                    <span style="font-size:17px;font-weight:600;color:#1a1a1a;">${title}</span>
                </div>
                <div style="font-size:14px;color:#444;line-height:1.5;">${subtitle}</div>
                <button id="ph-btn-passhub" style="
                    background:#1a73e8;color:#fff;border:none;border-radius:10px;
                    padding:12px 0;font-size:15px;font-weight:600;cursor:pointer;
                    display:flex;align-items:center;justify-content:center;gap:8px;">
                    🔑 PassHub
                </button>
                <button id="ph-btn-system" style="
                    background:#f1f3f4;color:#1a1a1a;border:none;border-radius:10px;
                    padding:12px 0;font-size:15px;font-weight:500;cursor:pointer;">
                    System authenticator
                </button>
                <button id="ph-btn-cancel" style="
                    background:none;color:#888;border:none;font-size:13px;cursor:pointer;padding:4px 0;">
                    Cancel
                </button>
            `;

            overlay.appendChild(dialog);
            document.body.appendChild(overlay);

            const cleanup = (result) => {
                overlay.remove();
                resolve(result);
            };

            dialog.querySelector('#ph-btn-passhub').onclick = () => cleanup('passhub');
            dialog.querySelector('#ph-btn-system').onclick  = () => cleanup('system');
            dialog.querySelector('#ph-btn-cancel').onclick  = () => cleanup('cancel');
            overlay.onclick = (e) => { if (e.target === overlay) cleanup('cancel'); };
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
            } else {
                throw new DOMException('PassHub: passkey creation failed', 'NotAllowedError');
            }
        } catch (error) {
            console.error('PassHub passkey creation failed:', error);
            return originalCreate(options);
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
            origin: window.location.origin
        };

        try {
            const response = await sendToExtension({
                id: 'passkey-get-request',
                data: passkeyRequest
            });

            if (response && response.assertion) {
                return reconstructCredential(response.assertion, 'get');
            } else if (response && response.useSystem) {
                return originalGet(options);
            } else {
                throw new DOMException('PassHub: passkey authentication failed', 'NotAllowedError');
            }
        } catch (error) {
            console.error('PassHub passkey authentication failed:', error);
            return originalGet(options);
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
            }, 30000);
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

    function reconstructCredential(data, type) {
        if (type === 'create') {
            // PublicKeyCredential для создания
            return {
                id: data.credentialId,
                rawId: base64ToArrayBuffer(data.credentialId),
                type: 'public-key',
                response: {
                    clientDataJSON: base64ToArrayBuffer(data.clientDataJSON),
                    attestationObject: base64ToArrayBuffer(data.attestationObject)
                }
            };
        } else {
            // PublicKeyCredential для аутентификации
            return {
                id: data.credentialId,
                rawId: base64ToArrayBuffer(data.credentialId),
                type: 'public-key',
                response: {
                    clientDataJSON: base64ToArrayBuffer(data.clientDataJSON),
                    authenticatorData: base64ToArrayBuffer(data.authenticatorData),
                    signature: base64ToArrayBuffer(data.signature),
                    userHandle: data.userHandle ? base64ToArrayBuffer(data.userHandle) : null
                }
            };
        }
    }

    // Уведомить extension что перехватчик готов
    window.postMessage({ type: 'passhub-interceptor-ready' }, window.location.origin);
})();
