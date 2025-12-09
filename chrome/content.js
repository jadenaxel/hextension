const api = typeof browser !== "undefined" ? browser : chrome;
const runtime = api.runtime;
const EXTENSION_NAME = "Hired Experts Search Policy Network";
const SEARCH_HOST_PATTERNS = [
    /\.google\./i,
    /\.bing\.com$/i,
    /\.search\.yahoo\.com$/i,
    /\.duckduckgo\.com$/i,
    /\.baidu\.com$/i,
];

function getSearchQuery() {
    const params = new URLSearchParams(
        window.location.search || window.location.hash.split("?")[1] || ""
    );
    const candidates = [
        params.get("q"),
        params.get("p"),
        params.get("query"),
        params.get("text"),
    ].filter(Boolean);

    if (candidates.length) return candidates[0];

    const inputs = Array.from(
        document.querySelectorAll("input[name=q], input[name=p], input[name=query], input[name=text]")
    );
    for (const el of inputs) {
        if (el && typeof el.value === "string" && el.value.trim()) {
            return el.value;
        }
    }
    return "";
}

function sendMessageCompat(payload) {
    return new Promise((resolve, reject) => {
        try {
            const maybePromise = runtime.sendMessage(
                payload,
                (resp) => {
                    if (runtime.lastError) return reject(runtime.lastError);
                    resolve(resp);
                }
            );

            if (maybePromise && typeof maybePromise.then === "function") {
                maybePromise.then(resolve).catch(reject);
            }
        } catch (e) {
            reject(e);
        }
    });
}

const RenderMessagePage = (word) => {
    return `
        <!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
body {
    font-family: Arial, sans-serif;
    background: #f4f4f4;
    margin: 0;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    height: 100dvh;
}

.card {
    max-width: 600px;
    background: #ffffff;
    margin: 0 auto;
    padding: 30px 35px;
    border-radius: 6px;
    box-shadow: 0 4px 15px rgba(0,0,0,0.1);
    color: #333;
}

.header {
    background: #eb0029;
    padding: 10px 20px;
    margin: -30px -35px 20px -35px;
}

.brand {
    font-size: 22px;
    font-weight: bold;
    color: #fff;
    text-align: center;
}

.title {
    margin: 10px 0 15px;
    font-size: 22px;
    font-weight: bold;
    color: #222;
}

.message {
    line-height: 1.6;
}

.info-box {
    background: #efefef;
    padding: 15px;
    border-radius: 5px;
    margin: 20px 0;
    display: flex;
    align-items: center;
}

.info-box p {
    font-weight: bold;
}

.info-box span {
    font-weight: lighter !important;
}

.footer-text {
    font-size: 14px;
    color: #555;
}

.footer-text span {
    font-weight: bold;
}

</style>
</head>

<body>

    <div class="card">
        <div class="header">
            <h1 class="brand">${EXTENSION_NAME}</h1>
        </div>

        <h2 class="title">Intrusion Prevention - Access Blocked</h2>

        <p class="message">Access denied — Restricted word detected.</p>

        <div class="info-box">
            <p>Detected: <span>${word}</span></p>
        </div>

        <p class="footer-text">If you believe this is an error, contact: <span>cybersecurity@hiredexpertsdr.com</span></p>
    </div>

</body>
</html>
    `;
};

(async function main() {
    const host = location.hostname;
    const isSearchHost = SEARCH_HOST_PATTERNS.some((re) => re.test(host));
    if (!isSearchHost) return;

    const queryText = getSearchQuery();
    const isSearchPage =
        /search/i.test(location.pathname) || Boolean(queryText);
    if (!isSearchPage) return;

    const enabledRes = await api.storage.sync.get(["enabled"]);
    const enabled = enabledRes.enabled ?? true;
    if (!enabled) return;

    // Use cached list first, then ask the background if empty
    let forbiddenWords = [];
    try {
        const cached = await api.storage.local.get("cachedWords");
        if (Array.isArray(cached.cachedWords)) {
            forbiddenWords = cached.cachedWords;
        }
    } catch (e) {}

    if (!forbiddenWords.length) {
        try {
            const data = await sendMessageCompat({ type: "getWordlist" });

            forbiddenWords = Array.isArray(data?.words) ? data.words : [];
        } catch (e) {
            forbiddenWords = [];
        }
    }

    const textToCheck = String(queryText || "").toLowerCase().slice(0, 512);
    if (!textToCheck.trim()) return;

    for (const w of forbiddenWords) {
        const esc = String(w).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const re = new RegExp(`(?:^|\\s)${esc}(?:$|\\s)`, "i");

        if (re.test(textToCheck)) {
            document.title = EXTENSION_NAME;
            document.documentElement.innerHTML = RenderMessagePage(w);
            break;
        }
    }
})();
