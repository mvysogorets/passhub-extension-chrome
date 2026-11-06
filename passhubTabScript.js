
/*

Why do we need PasshubTabScript? - because an extension can only send messages to the contentscripts, not to the web page itself

*/

// now defined in passkeyBridge

const consoleLog = console.log;
// const consoleLog = () => { };

consoleLog('passhubTabScript start');

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    consoleLog('passhubTabScript: message');
    consoleLog(message);
    consoleLog('passhubTabScript:  sender');
    consoleLog(sender);

    if (message.id === 'request to send') {
        sendResponse({ farewell: "passhubTabScript goodbye" });
        if (("version" in message) && message.version > 1) {
            consoleLog("passhubTabScript: an event created");
            const event = new Event("rts");
            document.dispatchEvent(event);
        } else {
            consoleLog("passhubTabScript: a message is posted");
            window.postMessage(message, message.origin);
        }
        return;
    }
    sendResponse({ farewell: "passhubTabScript goodbye" });
});

