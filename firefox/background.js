// ============================
// Hired Experts Policy Network (Firefox)
// Requests por país + cache-first + alarms
// ============================

const api = typeof browser !== "undefined" ? browser : chrome;

const API_URL = "http://172.31.1.11:3000";
const COUNTRY_API = "https://api.country.is/";
const CACHE_DURATION_MINUTES = 1;

// Países permitidos; si el API devuelve otro, se usa "US" como fallback
const AllowedCountries = ["US", "DO", "CO", "BO"];

// ======== Helpers de tiempo/cache ========
const now = () => Date.now();
const ms = (m) => m * 60 * 1000;
const fresh = (t, m = CACHE_DURATION_MINUTES) =>
    Boolean(t) && now() - t < ms(m);
const log = (...a) => console.log("[BG]", ...a);

// ======== Storage promisificado ========
const getL = (k) =>
    api.storage.local.get.length === 1
        ? api.storage.local.get(k)
        : new Promise((r) => api.storage.local.get(k, r));

const setL = (o) =>
    api.storage.local.set.length === 1
        ? api.storage.local.set(o)
        : new Promise((r) => api.storage.local.set(o, r));

const getS = (k) =>
    api.storage.sync.get.length === 1
        ? api.storage.sync.get(k)
        : new Promise((r) => api.storage.sync.get(k, r));

// ======== Claves de cache ========
const URL_CACHE_KEY = "forbiddenUrlsCache";
const URL_CACHE_TIME = "forbiddenUrlsTimestamp";
const WORD_CACHE_KEY = "forbiddenWordlist";
const WORD_CACHE_TIME = "forbiddenWordlistTimestamp";

// ======== País (para construir endpoints v1 por país) ========
async function checkCountry() {
    try {
        const res = await fetch(COUNTRY_API, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        const c = (data && data.country) || "US";
        return AllowedCountries.includes(c) ? c : "US";
    } catch (e) {
        log("No se pudo detectar país, usando US. Motivo:", e.message || e);
        return "US";
    }
}

// ======== Transformador de URLs a patrón webRequest (Firefox) ========
function toUrlFilterPattern(input) {
    let raw = (input || "").trim();
    if (!raw) return "*://*/*";
    if (!/^https?:\/\//i.test(raw)) raw = "https://" + raw;

    try {
        const u = new URL(raw);
        const baseHost = u.hostname.replace(/^www\./i, "");
        const hostPart = baseHost.includes("*") ? baseHost : `*.${baseHost}`;
        let pathPart = u.pathname || "/";
        pathPart = pathPart.replace(/\/+$/, "");
        if (pathPart === "") pathPart = "/";
        if (!pathPart.endsWith("/*")) pathPart += "/*";
        return `*://${hostPart}${pathPart}`;
    } catch {
        const host = input
            .replace(/^https?:\/\//i, "")
            .replace(/\/.*$/, "")
            .replace(/^www\./i, "");
        return `*://*.${host}/*`;
    }
}

// ======== Cache-first: URLs prohibidas ========
async function getUrls() {
    const s = await getL([URL_CACHE_KEY, URL_CACHE_TIME]);
    const cached = Array.isArray(s[URL_CACHE_KEY]) ? s[URL_CACHE_KEY] : [];
    const ts = s[URL_CACHE_TIME] || 0;

    if (cached.length && fresh(ts)) {
        log("URLs desde cache:", cached.length);
        return cached;
    }

    try {
        const country = await checkCountry();
        const res = await fetch(`${API_URL}/api/${country}/v1/forbidden/urls`, {
            cache: "no-store",
        });
        if (!res.ok) throw new Error(`API URLs ${res.status}`);
        const j = await res.json();
        const urls = Array.isArray(j.urls) ? j.urls : [];
        await setL({ [URL_CACHE_KEY]: urls, [URL_CACHE_TIME]: now() });
        log("URLs refrescadas desde API:", urls.length);
        return urls;
    } catch (e) {
        log("API URLs caída, uso cache. Motivo:", e.message || e);
        return cached;
    }
}

// ======== Cache-first: Wordlist ========
async function getWords() {
    const s = await getL([WORD_CACHE_KEY, WORD_CACHE_TIME]);
    const cached = Array.isArray(s[WORD_CACHE_KEY]) ? s[WORD_CACHE_KEY] : [];
    const ts = s[WORD_CACHE_TIME] || 0;

    if (cached.length && fresh(ts)) {
        log("Wordlist desde cache:", cached.length);
        return cached;
    }

    try {
        const country = await checkCountry();
        const res = await fetch(
            `${API_URL}/api/${country}/v1/forbidden/wordlist`,
            {
                cache: "no-store",
            }
        );
        if (!res.ok) throw new Error(`API words ${res.status}`);
        const j = await res.json();
        const words = Array.isArray(j.words) ? j.words : [];
        await setL({ [WORD_CACHE_KEY]: words, [WORD_CACHE_TIME]: now() });
        log("Wordlist refrescada desde API:", words.length);
        return words;
    } catch (e) {
        log("API words caída, uso cache. Motivo:", e.message || e);
        return cached;
    }
}

// ======== Bloqueo en Firefox con webRequest ========
let ffRequestListener = null;

async function applyFirefoxWebRequest(enabled, urlsData) {
    // limpiar listener previo
    if (ffRequestListener) {
        try {
            api.webRequest.onBeforeRequest.removeListener(ffRequestListener);
        } catch {}
        ffRequestListener = null;
    }

    if (!enabled) {
        log("Bloqueo desactivado (Firefox)");
        return;
    }

    const urlFilters = urlsData.length
        ? urlsData.map(toUrlFilterPattern)
        : ["*://*/*"];

    ffRequestListener = () => ({
        redirectUrl: api.runtime.getURL("privacy.html"),
    });

    api.webRequest.onBeforeRequest.addListener(
        ffRequestListener,
        {
            urls: urlFilters,
            types: ["main_frame"],
        },
        ["blocking"]
    );

    log("webRequest activo (Firefox). Filtros:", urlFilters.length);
}

// ======== Ciclo principal ========
async function updateAll() {
    const { enabled = true } = await getS(["enabled"]);
    const urls = await getUrls(); // cache-first
    await applyFirefoxWebRequest(enabled, urls);
    // precalienta cache de palabras (para content.js)
    await getWords();
}

// ======== Eventos de ciclo de vida ========
if (api.runtime && api.runtime.onInstalled) {
    api.runtime.onInstalled.addListener(async () => {
        log("onInstalled");
        if (api.alarms && api.alarms.create) {
            api.alarms.create("refreshCache", {
                periodInMinutes: CACHE_DURATION_MINUTES,
            });
        }
        await updateAll();
    });
}

if (api.runtime && api.runtime.onStartup) {
    api.runtime.onStartup.addListener(async () => {
        log("onStartup");
        if (api.alarms && api.alarms.create) {
            api.alarms.create("refreshCache", {
                periodInMinutes: CACHE_DURATION_MINUTES,
            });
        }
        await updateAll();
    });
}

if (api.alarms && api.alarms.onAlarm) {
    api.alarms.onAlarm.addListener(async (alarm) => {
        if (alarm.name !== "refreshCache") return;
        log("Alarm: refreshCache");
        await updateAll();
    });
}

// ======== Mensajería (compat: getWordlist y getForbidden) ========
api.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || !msg.type) return;

    // Nuevo nombre (Chrome) y tu nombre anterior (Firefox)
    if (msg.type === "getWordlist" || msg.type === "getForbidden") {
        (async () => {
            sendResponse({ words: await getWords() });
        })();
        return true; // necesario para respuesta async
    }

    if (msg.type === "toggle") {
        (async () => {
            await updateAll();
        })();
    }
});

// ======== Carga inicial (por si el SW ya estaba activo) ========
(async () => {
    try {
        await updateAll();
    } catch (e) {
        log("Fallo en carga inicial:", e.message || e);
    }
})();
