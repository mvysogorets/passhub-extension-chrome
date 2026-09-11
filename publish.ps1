Remove-Item -Path passhub-extension -Recurse -Force -ErrorAction SilentlyContinue
New-Item -Path passhub-extension -ItemType Directory | Out-Null

Copy-Item popup.js passhub-extension
Copy-Item popup.css passhub-extension
Copy-Item popup.html passhub-extension
Copy-Item manifest.json passhub-extension
Copy-Item passhubTabScript.js passhub-extension
Copy-Item contentScript.js passhub-extension
Copy-Item background.js passhub-extension
Copy-Item options.js passhub-extension
Copy-Item options.html passhub-extension

Copy-Item passhubBridge.js passhub-extension
Copy-Item passhubPasskeyHandler.js passhub-extension
Copy-Item passkeyInterceptor.js passhub-extension
Copy-Item passkeyPopup.js passhub-extension
Copy-Item popup-bootstrap.js passhub-extension

Copy-Item images -Destination passhub-extension\images -Recurse
Copy-Item fonts -Destination passhub-extension\fonts -Recurse

Compress-Archive -Path passhub-extension -DestinationPath passhub-extension.zip -Force
