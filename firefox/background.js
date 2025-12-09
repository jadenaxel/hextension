const api = typeof browser !== "undefined" ? browser : chrome;
const log = (...a) => console.log("[BG]", ...a);

const API_BASE = "http://localhost:3000/api";
const COUNTRY_ENDPOINT = "https://api.country.is/";
const REFRESH_MS = 5 * 60 * 1000;
const STORAGE_KEYS = {
    words: "cachedWords",
    urls: "cachedUrls",
    country: "cachedCountry",
    lastUpdated: "cachedLastUpdated",
};

function toNormalizedList(payload) {
    if (Array.isArray(payload)) {
        return Array.from(
            new Set(
                payload
                    .map((v) => (v == null ? "" : String(v).trim()))
                    .filter((v) => v && !v.startsWith("#"))
            )
        );
    }

    if (payload && Array.isArray(payload.data)) return toNormalizedList(payload.data);
    if (payload && Array.isArray(payload.list)) return toNormalizedList(payload.list);

    if (typeof payload === "string") {
        return toNormalizedList(payload.split(/\r?\n/));
    }

    return [];
}

async function getCountryCode() {
    try {
        const cached = await api.storage.local.get(STORAGE_KEYS.country);
        if (cached?.[STORAGE_KEYS.country]) {
            return String(cached[STORAGE_KEYS.country]).toUpperCase();
        }

        const res = await fetch(COUNTRY_ENDPOINT);
        const data = await res.json();
        const country = String(data?.country || "US").toUpperCase();

        await api.storage.local.set({ [STORAGE_KEYS.country]: country });
        return country;
    } catch (e) {
        log("Geolocation failed, using US", e);
        return "US";
    }
}

async function fetchList(kind, country) {
    const url = `${API_BASE}/${country}/v1/${kind}`;
    const res = await fetch(url);

    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

    const text = await res.text();
    let parsed = text;

    try {
        parsed = JSON.parse(text);
    } catch (e) {}

    return toNormalizedList(parsed);
}

async function getCachedData() {
    const data = await api.storage.local.get([
        STORAGE_KEYS.words,
        STORAGE_KEYS.urls,
    ]);

    return {
        words: toNormalizedList(data[STORAGE_KEYS.words] || []),
        urls: toNormalizedList(data[STORAGE_KEYS.urls] || []),
    };
}

async function persistData({ words, urls, country }) {
    await api.storage.local.set({
        [STORAGE_KEYS.words]: toNormalizedList(words),
        [STORAGE_KEYS.urls]: toNormalizedList(urls),
        [STORAGE_KEYS.country]: country,
        [STORAGE_KEYS.lastUpdated]: Date.now(),
    });
}

async function refreshFromApi() {
    try {
        const country = await getCountryCode();
        const [urls, words] = await Promise.all([
            fetchList("urllist", country),
            fetchList("wordlist", country),
        ]);

        await persistData({ words, urls, country });
        return { urls, words };
    } catch (e) {
        log("API request failed, falling back to cache", e);
        return null;
    }
}

function toPattern(url) {
    let clean = String(url || "").trim();
    if (!clean) return "*://*/*";

    if (!/^https?:\/\//i.test(clean)) clean = "https://" + clean;

    try {
        const u = new URL(clean);
        const host = u.hostname.replace(/^www\./, "");
        return `*://*.${host}/*`;
    } catch (e) {
        const host = clean.replace(/^https?:\/\//, "").split("/")[0];
        return `*://*.${host}/*`;
    }
}

let listener = null;

async function applyBlock(enabled, urls) {
    if (listener) {
        try {
            api.webRequest.onBeforeRequest.removeListener(listener);
        } catch (e) {}
        listener = null;
    }

    const sanitizedUrls = Array.from(
        new Set((urls || []).map((u) => String(u || "").trim()).filter(Boolean))
    );

    if (!enabled) {
        log("Bloqueo desactivado");
        return;
    }

    const patterns = sanitizedUrls.map(toPattern);

    listener = () => ({
        redirectUrl: api.runtime.getURL("privacy.html"),
    });

    api.webRequest.onBeforeRequest.addListener(
        listener,
        { urls: patterns, types: ["main_frame", "sub_frame"] },
        ["blocking"]
    );

    log("Bloqueo activo con", patterns.length, "patrones");
}

async function applyFromCache(enabled) {
    const { urls } = await getCachedData();
    await applyBlock(enabled, urls);
    log("Bloqueo aplicado desde cache", urls.length);
}

async function refreshAndApply(enabled) {
    const latest = await refreshFromApi();

    if (latest && latest.urls) {
        await applyBlock(enabled, latest.urls);
        log("Bloqueo actualizado desde API", latest.urls.length);
        return;
    }

    const { urls } = await getCachedData();
    await applyBlock(enabled, urls);
}

async function updateAll() {
    const { enabled = true } = await api.storage.sync.get("enabled");
    await applyFromCache(enabled);
    await refreshAndApply(enabled);
}

api.runtime.onInstalled.addListener(updateAll);
api.runtime.onStartup.addListener(updateAll);

setInterval(async () => {
    const { enabled = true } = await api.storage.sync.get("enabled");
    await refreshAndApply(enabled);
}, REFRESH_MS);

api.runtime.onMessage.addListener((msg, _s, send) => {
    if (!msg || !msg.type) return;

    if (msg.type === "getForbidden") {
        (async () => {
            const { words } = await getCachedData();
            send({ words });
        })();
        return true;
    }

    if (msg.type === "toggle") {
        updateAll();
    }
});
