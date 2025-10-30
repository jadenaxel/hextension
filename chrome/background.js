// Hextension – Chrome MV3
// Cache-first; refresco con chrome.alarms; DNR limpio; logs visibles en el SW.

const CACHE_DURATION_MINUTES = 1; // <-- tu intervalo
const URLS_API = "http://localhost:3000/api/forbidden/urls";
const WORDS_API = "http://localhost:3000/api/forbidden/wordlist";

const URL_CACHE_KEY = "forbiddenUrlsCache";
const URL_CACHE_TIME = "forbiddenUrlsTimestamp";
const WORD_CACHE_KEY = "forbiddenWordlist";
const WORD_CACHE_TIME = "forbiddenWordlistTimestamp";

// ----- helpers -----
const getL = (k) => new Promise((r) => chrome.storage.local.get(k, r));
const setL = (o) => new Promise((r) => chrome.storage.local.set(o, r));
const getS = (k) => new Promise((r) => chrome.storage.sync.get(k, r));
const now = () => Date.now();
const ms = (m) => m * 60 * 1000;
const fresh = (t, m = CACHE_DURATION_MINUTES) => t && now() - t < ms(m);

const log = (...a) => console.log("[SW]", ...a);

// DNR regex
function buildRegexForDNR(url) {
    const clean = String(url || "")
        .replace(/^https?:\/\//i, "")
        .replace(/^www\./i, "")
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return `https?:\\/\\/([a-z0-9.-]+\\.)?${clean}`;
}

// ----- cache-first fetch -----
async function getUrls() {
    const s = await getL([URL_CACHE_KEY, URL_CACHE_TIME]);
    const cached = Array.isArray(s[URL_CACHE_KEY]) ? s[URL_CACHE_KEY] : [];
    const ts = s[URL_CACHE_TIME] || 0;

    if (cached.length && fresh(ts)) {
        log("URLs desde cache", cached.length);
        return cached;
    }

    try {
        const res = await fetch(URLS_API, { cache: "no-store" });
        if (!res.ok) throw new Error(`API ${res.status}`);
        const j = await res.json();
        const urls = Array.isArray(j.urls) ? j.urls : [];
        await setL({ [URL_CACHE_KEY]: urls, [URL_CACHE_TIME]: now() });
        log("URLs refrescadas desde API", urls.length);
        return urls;
    } catch (e) {
        log("API URLs caída, uso cache:", e.message);
        return cached;
    }
}

async function getWords() {
    const s = await getL([WORD_CACHE_KEY, WORD_CACHE_TIME]);
    const cached = Array.isArray(s[WORD_CACHE_KEY]) ? s[WORD_CACHE_KEY] : [];
    const ts = s[WORD_CACHE_TIME] || 0;

    if (cached.length && fresh(ts)) {
        log("Wordlist desde cache", cached.length);
        return cached;
    }

    try {
        const res = await fetch(WORDS_API, { cache: "no-store" });
        if (!res.ok) throw new Error(`API ${res.status}`);
        const j = await res.json();
        const words = Array.isArray(j.words) ? j.words : [];
        await setL({ [WORD_CACHE_KEY]: words, [WORD_CACHE_TIME]: now() });
        log("Wordlist refrescada desde API", words.length);
        return words;
    } catch (e) {
        log("API words caída, uso cache:", e.message);
        return cached;
    }
}

// ----- DNR -----
async function applyDNR(enabled, urls) {
    // limpia
    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    const removeRuleIds = existing.map((r) => r.id);
    if (removeRuleIds.length) {
        await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds,
            addRules: [],
        });
        log("Eliminadas", removeRuleIds.length, "reglas");
    }

    if (!enabled) {
        log("Bloqueo desactivado");
        return;
    }

    const addRules = urls.map((u, i) => ({
        id: i + 1,
        priority: 1,
        action: {
            type: "redirect",
            redirect: { url: chrome.runtime.getURL("block.html") },
        },
        condition: {
            regexFilter: buildRegexForDNR(u),
            resourceTypes: ["main_frame", "sub_frame"],
        },
    }));

    if (addRules.length) {
        await chrome.declarativeNetRequest.updateDynamicRules({ addRules });
    }
    log("Aplicadas", addRules.length, "reglas");
}

// ----- ciclo principal -----
async function updateAll() {
    const { enabled = true } = await getS(["enabled"]);
    const urls = await getUrls(); // cache-first
    await applyDNR(enabled, urls); // aplica reglas
    await getWords(); // precalienta cache palabras
}

// ----- eventos que DESPIERTAN el SW -----
chrome.runtime.onInstalled.addListener(async () => {
    log("onInstalled");
    chrome.alarms.create("refreshCache", {
        periodInMinutes: CACHE_DURATION_MINUTES,
    });
    await updateAll();
});

chrome.runtime.onStartup.addListener(async () => {
    log("onStartup");
    chrome.alarms.create("refreshCache", {
        periodInMinutes: CACHE_DURATION_MINUTES,
    });
    await updateAll();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== "refreshCache") return;
    log("Alarm: refreshCache");
    await updateAll();
});

// Mensajes (popup / content)
chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
    if (!msg || !msg.type) return;

    if (msg.type === "getWordlist") {
        (async () => {
            sendResponse({ words: await getWords() });
        })();
        return true;
    }
    if (msg.type === "toggle") {
        (async () => {
            await updateAll();
        })();
    }
});
