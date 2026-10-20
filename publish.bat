rmdir /s /q passhub-extension
mkdir passhub-extension
copy popup.js passhub-extension
copy popup.css passhub-extension
copy popup.html passhub-extension
copy manifest.json passhub-extension
copy passhubTabScript.js passhub-extension
copy autofill.js passhub-extension
copy background.js passhub-extension
copy options.js passhub-extension
copy options.html passhub-extension

copy passkeyUrlBridge.js passhub-extension
copy popup-passkey.html passhub-extension

xcopy /i images passhub-extension\images
xcopy /i fonts  passhub-extension\fonts
tar -acf  passhub-extension.zip passhub-extension
