const blockedPatterns = [
    "*://www.google.com/logos/*",
    "*://www.google.com/doodles/*",
    "*://www.google.com/fnbx/*",
    "*://www.google.com/fbx/*",
];

function blockRequest() {
    return { cancel: true };
}

let enabled = true;

browser.storage.sync.get(["enabled"], (res) => {
    enabled = res.enabled ?? true;
    updateListener();
});

browser.runtime.onMessage.addListener((msg) => {
    if (msg.type === "toggle") {
        enabled = msg.enabled;
        updateListener();
    }
});

function updateListener() {
    browser.webRequest.onBeforeRequest.removeListener(blockRequest);

    if (enabled) {
        browser.webRequest.onBeforeRequest.addListener(
            blockRequest,
            { urls: blockedPatterns },
            ["blocking"]
        );
    }
}
