
'use strict';

(function () {


  const consoleLog = console.log;
  //const consoleLog = () => { };


  const originalCreate = navigator.credentials.create.bind(navigator.credentials);
  const originalGet = navigator.credentials.get.bind(navigator.credentials);

  consoleLog("Hello 576");

  navigator.credentials.create = async function (options) {
    consoleLog('PassHub: Intercepted credentials.create', options);

    if (!options || !options.publicKey) {
      return originalCreate(options);
    }

    const publicKey = options.publicKey;
    const siteName = publicKey.rp?.name || publicKey.rp?.id || window.location.hostname;
    const userName = publicKey.user?.name || '';

    options.origin = window.location.origin;

    if (options.publicKey.challenge) {
      options.publicKey.challenge = arrayBufferToBase64(options.publicKey.challenge);
    }
    if (options.publicKey.user?.id) {
      options.publicKey.user.id = arrayBufferToBase64(options.publicKey.user?.id);
    }

    const response = await showPasskeyChooser('create', siteName, userName, options);
    if (response?.id === 'passkey-create-response') {
      let r = response.response;
      r.rawId = base64ToArrayBuffer(r.rawId);
      r.response.attestationObject = base64ToArrayBuffer(r.response.attestationObject);
      r.response.clientDataJSON = base64ToArrayBuffer(r.response.clientDataJSON);
      return r;
    }
    if (response === 'system') {
      return originalCreate(options);
    }
    if (response === 'passhub') {
      return true; // do nothing
    }

    if (response === 'cancel' || response === 'dismissed') {
      throw new DOMException('User cancelled', 'NotAllowedError');
    }


    try {

      if (response && response.credential) {
        return reconstructCredential(response.credential, 'create');
      } else if (response && response.useSystem) {
        return originalCreate(options);
      } else if (response && response.error) {
        throw responseToError(response);
      } else {
        throw new DOMException('PassHub: passkey creation failed', 'NotAllowedError');
      }
    } catch (error) {
      console.error('PassHub passkey creation failed:', error);
      throw new DOMException(`PassHub: ${error.message}`, 'NotAllowedError');
    }
  };

  /**
  * Intercept passkey use (authentication).
   */
  navigator.credentials.get = async function (options) {
    consoleLog('PassHub: Intercepted credentials.get', options);

    // Let the browser handle Conditional UI (autofill).
    if (options && options.mediation === 'conditional') {
      return originalGet(options);
    }

    if (!options || !options.publicKey) {
      return originalGet(options);
    }

    const publicKey = options.publicKey;
    const siteName = publicKey.rpId || window.location.hostname;

    // JSON-safe copy for PassHub (binary fields -> base64url); `options` stays intact for originalGet
    const serializedOptions = {
      origin: window.location.origin,
      publicKey: {
        rpId: publicKey.rpId,
        challenge: arrayBufferToBase64(publicKey.challenge),
        allowCredentials: (publicKey.allowCredentials || []).map(cred => ({
          id: arrayBufferToBase64(cred.id),
          type: cred.type
        })),
        userVerification: publicKey.userVerification || 'preferred'
      }
    };

    const choice = await showPasskeyChooser('get', siteName, '', serializedOptions);

    if (choice === 'system') {
      return originalGet(options);
    }
    if (choice === 'cancel' || choice === 'dismissed') {
      throw new DOMException('User cancelled', 'NotAllowedError');
    }

    // PassHub answered: { id: 'passkey-get-response', assertion | error }
    if (choice?.id === 'passkey-get-response') {
      if (choice.assertion) {
        return reconstructCredential(choice.assertion, 'get', {
          challenge: serializedOptions.publicKey.challenge,
          allowCredentials: serializedOptions.publicKey.allowCredentials
        });
      }
      throw new DOMException(`PassHub: ${choice.error || 'passkey authentication failed'}`, 'NotAllowedError');
    }

    throw new DOMException('PassHub: passkey authentication failed', 'NotAllowedError');
  };

  /**
  * Returns Promise<'passhub' | 'system' | 'cancel' | 'dismissed'>;
  * 'dismissed' = popup closed without using any of its buttons.
   */
  function showPasskeyChooser(mode, siteName, userName, options) {

    return new Promise((resolve) => {

      const requestId = crypto.randomUUID();

      const resultHandler = (event) => {
        if (event.source !== window) return;
        if (event.data?.id === 'passkey-create-response' || event.data?.id === 'passkey-get-response') {
          window.removeEventListener('message', resultHandler);
          resolve(event.data);
        }

        if (event.data?.type !== 'passhub-passkey-chooser-result') return;
        if (event.data.requestId !== requestId) return;
        window.removeEventListener('message', resultHandler);
        resolve(event.data.choice);
      };
      window.addEventListener('message', resultHandler);

      // Hand the passkey options and page URL to passkeyUrlBridge (ISOLATED world).

      window.postMessage({
        type: 'passhub-passkey-chooser',
        requestId,
        mode,
        //        passkey: serializePasskeyOptions(options?.publicKey),
        options,
        url: window.location.href
      }, '*');

      /*
      
            window.postMessage({
              type: 'passhub-passkey-chooser',
              requestId,
              mode,
              passkey: serializePasskeyOptions(options?.publicKey),
              url: window.location.href
            }, '*');
      */

      //      document.documentElement.appendChild(iframe);
    });
  }
  /*
    // Binary fields become base64url so the data is plain JSON-safe.
    function serializePasskeyOptions(publicKey) {
      if (!publicKey) return null;
      const toB64 = (v) => (v ? arrayBufferToBase64(v) : null);
      return {
        rpId: publicKey.rpId || publicKey.rp?.id || window.location.hostname,
        rpName: publicKey.rp?.name || null,
        user: publicKey.user ? {
          id: toB64(publicKey.user.id),
          name: publicKey.user.name || '',
          displayName: publicKey.user.displayName || ''
        } : null,
        challenge: toB64(publicKey.challenge),
        allowCredentials: (publicKey.allowCredentials || []).map(c => ({ id: toB64(c.id), type: c.type })),
        userVerification: publicKey.userVerification || null
      };
    }
  */
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
   * Utilities
    */




  function arrayBufferToBase64(buffer) {

    const uint8Array = new Uint8Array(buffer);
    return uint8Array.toBase64({ alphabet: "base64url" });

    /*    
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
*/
  }


  function base64ToArrayBuffer(base64string) {

    return Uint8Array.fromBase64(base64string, { alphabet: "base64url" })
    /*
    
        // Restore padding.
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
    */
  }

  function normalizeBase64Url(base64) {
    return base64
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  function responseToError(response) {
    if (response.errorName === 'SecurityError' ||
      response.errorName === 'NotSupportedError' ||
      response.errorName === 'InvalidStateError') {
      return new DOMException(response.error, response.errorName);
    }
    if (response.errorName === 'TypeError') {
      return new TypeError(response.error);
    }
    return new Error(response.error);
  }

  function reconstructCredential(data, type, request = {}) {
    if (type === 'create') {
      // PublicKeyCredential for registration.
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
      // PublicKeyCredential for authentication.
      const authenticatorData = new Uint8Array(base64ToArrayBuffer(data.authenticatorData));
      const clientData = JSON.parse(new TextDecoder().decode(base64ToArrayBuffer(data.clientDataJSON)));
      const flags = authenticatorData[32];
      const credentialId = normalizeBase64Url(data.credentialId);
      const allowedIds = (request.allowCredentials || []).map(credential => normalizeBase64Url(credential.id));
      const userHandle = allowedIds.length || !data.userHandle
        ? null
        : base64ToArrayBuffer(data.userHandle);
      const credentialJson = {
        id: credentialId,
        rawId: credentialId,
        response: {
          clientDataJSON: normalizeBase64Url(data.clientDataJSON),
          authenticatorData: normalizeBase64Url(data.authenticatorData),
          signature: normalizeBase64Url(data.signature),
          userHandle: userHandle ? arrayBufferToBase64(userHandle) : null
        },
        authenticatorAttachment: null,
        clientExtensionResults: {},
        type: 'public-key'
      };
      console.info('[PassHub WebAuthn] assertion returned to RP', JSON.stringify({
        credentialId,
        credentialAllowed: !allowedIds.length || allowedIds.includes(credentialId),
        clientDataType: clientData.type,
        challengeMatches: normalizeBase64Url(clientData.challenge) === normalizeBase64Url(request.challenge || ''),
        origin: clientData.origin,
        crossOrigin: clientData.crossOrigin,
        flags: `0x${flags.toString(16).padStart(2, '0')}`,
        userPresent: Boolean(flags & 0x01),
        userVerified: Boolean(flags & 0x04),
        backupEligible: Boolean(flags & 0x08),
        backupState: Boolean(flags & 0x10),
        signCount: new DataView(authenticatorData.buffer).getUint32(33, false),
        userHandleLength: userHandle?.byteLength || 0,
        userHandleOmittedForAllowList: Boolean(allowedIds.length && data.userHandle),
        toJSONSupported: true,
        signatureLength: base64ToArrayBuffer(data.signature).byteLength
      }));
      return {
        id: credentialId,
        rawId: base64ToArrayBuffer(data.credentialId),
        type: 'public-key',
        authenticatorAttachment: null,
        getClientExtensionResults() {
          return {};
        },
        toJSON() {
          return credentialJson;
        },
        response: {
          clientDataJSON: base64ToArrayBuffer(data.clientDataJSON),
          authenticatorData: authenticatorData.buffer,
          signature: base64ToArrayBuffer(data.signature),
          userHandle
        }
      };
    }
  }

})();
