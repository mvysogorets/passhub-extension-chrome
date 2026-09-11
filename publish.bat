rmdir /s /q passhub-extension
mkdir passhub-extension
copy popup.js passhub-extension
copy popup.css passhub-extension
copy popup.html passhub-extension
copy manifest.json passhub-extension
copy passhubTabScript.js passhub-extension
copy contentScript.js passhub-extension
copy background.js passhub-extension
copy options.js passhub-extension
copy options.html passhub-extension

copy passhubBridge.js passhub-extension
copy passhubPasskeyHandler.js passhub-extension
copy passkeyInterceptor.js passhub-extension
copy passkeyPopup.js passhub-extension
copy popup-bootstrap.js passhub-extension

xcopy /i images passhub-extension\images
xcopy /i fonts  passhub-extension\fonts
tar -acf  passhub-extension.zip passhub-extension
