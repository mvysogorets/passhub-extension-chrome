const popupParams = new URLSearchParams(window.location.search);
const popupScript = document.createElement('script');

popupScript.src = popupParams.get('view') === 'passkey'
  ? 'passkeyPopup.js'
  : 'popup.js';

document.body.appendChild(popupScript);