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

browser.runtime.onMessage.addListener(async (msg) => {
    if (msg.type === "getForbidden") {
        const res = await fetch("http://127.0.0.1:3000/api/forbidden");
        const data = await res.json();
        return data;
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
