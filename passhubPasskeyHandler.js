/**
 * passhubPasskeyHandler.js
 * 
 * Handles passkey requests inside the PassHub tab.
 * Injected into passhub.net to process requests from the extension.
 */

'use strict';

(function() {
    console.log('PassHub Passkey Handler loaded');

    // Listen for messages from the extension.
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        console.log('PassHub received message:', message);

        if (message.id === 'passkey-create-request') {
            handleCreatePasskey(message.data, message.senderTab)
                .then(result => sendResponse(result))
                .catch(error => sendResponse({ error: error.message, useSystem: true }));
            return true; // Keep the channel open for an asynchronous response.
        }

        if (message.id === 'passkey-get-request') {
            handleGetPasskey(message.data, message.senderTab)
                .then(result => sendResponse(result))
                .catch(error => sendResponse({ error: error.message, useSystem: true }));
            return true;
        }
    });

    /**
    * Handle new passkey creation.
     */
    async function handleCreatePasskey(data, senderTab) {
        console.log('Creating passkey for:', data);

        // Display a confirmation dialog.
        const userChoice = await showPasskeyDialog({
            type: 'create',
            rpId: data.rpId,
            rpName: data.rpName,
            userName: data.userName,
            userDisplayName: data.userDisplayName,
            siteUrl: senderTab.url,
            siteTitle: senderTab.title
        });

        if (!userChoice.approved) {
            if (userChoice.useSystem) {
                return { useSystem: true };
            }
            throw new Error('User declined passkey creation');
        }

        // Use the PassHub API when available.
        if (typeof window.PassHubPasskeyAPI !== 'undefined') {
            const result = await window.PassHubPasskeyAPI.createPasskey(data, {
                url: senderTab.url,
                title: senderTab.title
            });

            if (!result.success) {
                throw new Error('Failed to create passkey in PassHub');
            }

            // Create attestation for the site.
            const attestation = await PasskeyGenerator.createCredentialForSite(
                result.passkey.passkey,
                data.challenge,
                data.origin,
                window.PassHubDecrypt || window.PassHubPasskeyAPI.decrypt
            );

            return {
                credential: {
                    credentialId: attestation.credentialId,
                    clientDataJSON: attestation.clientDataJSON,
                    attestationObject: attestation.attestationObject
                }
            };
        }

        // Fallback: create directly when the API is unavailable.
        if (typeof PasskeyGenerator === 'undefined') {
            throw new Error('PasskeyGenerator not loaded');
        }

        const passkeyData = await PasskeyGenerator.createPasskey(
            data.rpName,
            data.userName,
            data.rpId,
            window.PassHubEncrypt // PassHub encryption function.
        );

        // Save to PassHub through the Integration API.
        if (typeof PasskeyIntegration !== 'undefined') {
            await PasskeyIntegration.savePasskey(passkeyData, userChoice.safe);
        }

        // Create attestation for the site.
        const attestation = await PasskeyGenerator.createCredentialForSite(
            passkeyData.passkey,
            data.challenge,
            data.origin,
            window.PassHubDecrypt
        );

        return {
            credential: {
                credentialId: attestation.credentialId,
                clientDataJSON: attestation.clientDataJSON,
                attestationObject: attestation.attestationObject
            }
        };
    }

    /**
    * Handle passkey use.
     */
    async function handleGetPasskey(data, senderTab) {
        console.log('Getting passkey for:', data);

        // Find passkeys for the RP ID through the API.
        let passkeys = [];
        
        if (typeof window.PassHubPasskeyAPI !== 'undefined') {
            passkeys = await window.PassHubPasskeyAPI.getPasskeys(data.rpId);
        } else if (typeof PasskeyIntegration !== 'undefined') {
            passkeys = await PasskeyIntegration.getPasskeysForRpId(data.rpId);
        }

        if (passkeys.length === 0) {
            throw new Error('No passkeys found for ' + data.rpId);
        }

        // Display the selection dialog.
        const userChoice = await showPasskeyDialog({
            type: 'get',
            rpId: data.rpId,
            passkeys: passkeys,
            siteUrl: senderTab.url,
            siteTitle: senderTab.title
        });

        if (!userChoice.approved) {
            if (userChoice.useSystem) {
                return { useSystem: true };
            }
            throw new Error('User declined passkey usage');
        }

        const selectedPasskey = userChoice.passkey;

        // Create the assertion through the API or directly.
        let assertion;
        
        if (typeof window.PassHubPasskeyAPI !== 'undefined') {
            const result = await window.PassHubPasskeyAPI.usePasskey(
                selectedPasskey._id,
                data.challenge
            );
            assertion = result.assertion;
        } else {
            // Fallback
            assertion = await PasskeyGenerator.usePasskey(
                selectedPasskey.passkey,
                data.challenge,
                window.PassHubDecrypt
            );

            // Update the counter.
            if (typeof PasskeyIntegration !== 'undefined') {
                await PasskeyIntegration.incrementCounter(selectedPasskey._id);
            }
        }

        return {
            assertion: {
                credentialId: assertion.credentialId,
                clientDataJSON: assertion.clientDataJSON,
                authenticatorData: assertion.authenticatorData,
                signature: assertion.signature,
                userHandle: assertion.userHandle
            }
        };
    }

    /**
    * Display a dialog to the user.
     */
    function showPasskeyDialog(options) {
        return new Promise((resolve) => {
            const dialog = document.createElement('div');
            dialog.className = 'passkey-extension-dialog';
            dialog.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: white;
                padding: 24px;
                border-radius: 12px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.3);
                z-index: 10000;
                min-width: 400px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            `;

            if (options.type === 'create') {
                dialog.innerHTML = `
                    <h3 style="margin: 0 0 16px 0; color: #333;">🔑 Create Passkey</h3>
                    <p style="margin: 0 0 8px 0; color: #666;">
                        <strong>${escapeHtml(options.siteTitle)}</strong> wants to create a passkey
                    </p>
                    <p style="margin: 0 0 16px 0; color: #888; font-size: 13px;">
                        Domain: ${escapeHtml(options.rpId)}<br>
                        Username: ${escapeHtml(options.userName)}
                    </p>
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; margin-bottom: 4px; font-size: 13px; color: #666;">
                            Save to Safe:
                        </label>
                        <select id="passkey-safe-select" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                            <!-- Will be populated -->
                        </select>
                    </div>
                    <div style="display: flex; gap: 8px; justify-content: flex-end;">
                        <button id="passkey-system" style="padding: 8px 16px; border: 1px solid #ddd; background: white; border-radius: 6px; cursor: pointer;">
                            Use System
                        </button>
                        <button id="passkey-deny" style="padding: 8px 16px; border: 1px solid #ddd; background: white; border-radius: 6px; cursor: pointer;">
                            Deny
                        </button>
                        <button id="passkey-allow" style="padding: 8px 16px; border: none; background: #007bff; color: white; border-radius: 6px; cursor: pointer;">
                            Create in PassHub
                        </button>
                    </div>
                `;
            } else {
                // type === 'get'
                const passkeyList = options.passkeys.map((pk, idx) => 
                    `<option value="${idx}">${escapeHtml(pk.cleartext[0])} - ${escapeHtml(pk.cleartext[1])}</option>`
                ).join('');

                dialog.innerHTML = `
                    <h3 style="margin: 0 0 16px 0; color: #333;">🔑 Use Passkey</h3>
                    <p style="margin: 0 0 8px 0; color: #666;">
                        <strong>${escapeHtml(options.siteTitle)}</strong> requests authentication
                    </p>
                    <p style="margin: 0 0 16px 0; color: #888; font-size: 13px;">
                        Domain: ${escapeHtml(options.rpId)}
                    </p>
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; margin-bottom: 4px; font-size: 13px; color: #666;">
                            Select Passkey:
                        </label>
                        <select id="passkey-select" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                            ${passkeyList}
                        </select>
                    </div>
                    <div style="display: flex; gap: 8px; justify-content: flex-end;">
                        <button id="passkey-system" style="padding: 8px 16px; border: 1px solid #ddd; background: white; border-radius: 6px; cursor: pointer;">
                            Use System
                        </button>
                        <button id="passkey-deny" style="padding: 8px 16px; border: 1px solid #ddd; background: white; border-radius: 6px; cursor: pointer;">
                            Deny
                        </button>
                        <button id="passkey-allow" style="padding: 8px 16px; border: none; background: #007bff; color: white; border-radius: 6px; cursor: pointer;">
                            Use Passkey
                        </button>
                    </div>
                `;
            }

            document.body.appendChild(dialog);

            // Populate safe select for create
            if (options.type === 'create') {
                const safeSelect = dialog.querySelector('#passkey-safe-select');
                
                // Get the safe list through the API.
                if (typeof window.PassHubPasskeyAPI !== 'undefined') {
                    const safes = window.PassHubPasskeyAPI.getSafeList();
                    safeSelect.innerHTML = safes.map(s => 
                        `<option value="${s.id}">${escapeHtml(s.name)}</option>`
                    ).join('');
                } else {
                    safeSelect.innerHTML = '<option value="default">Default Safe</option>';
                }
            }

            // Event handlers
            dialog.querySelector('#passkey-allow').onclick = () => {
                const result = { approved: true };
                
                if (options.type === 'create') {
                    const safeSelect = dialog.querySelector('#passkey-safe-select');
                    result.safe = safeSelect.value;
                } else {
                    const passkeySelect = dialog.querySelector('#passkey-select');
                    result.passkey = options.passkeys[parseInt(passkeySelect.value)];
                }
                
                document.body.removeChild(dialog);
                resolve(result);
            };

            dialog.querySelector('#passkey-deny').onclick = () => {
                document.body.removeChild(dialog);
                resolve({ approved: false });
            };

            dialog.querySelector('#passkey-system').onclick = () => {
                document.body.removeChild(dialog);
                resolve({ approved: false, useSystem: true });
            };
        });
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
})();
