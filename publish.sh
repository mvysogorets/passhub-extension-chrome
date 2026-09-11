#!/bin/sh
rm -rf passhub-extension
mkdir passhub-extension
cp popup.js popup.css popup.html passhub-extension
cp manifest.json passhub-extension
cp passhubTabScript.js contentScript.js background.js passhub-extension
cp -r images passhub-extension
cp -r fonts  passhub-extension/fonts
tar czf  passhub-extension.tgz passhub-extension










