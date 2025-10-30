// ============================
// Hired Experts Policy Network
// Compatible con Chrome y Firefox
// ============================

// Alias universal para compatibilidad
const api = typeof browser !== "undefined" ? browser : chrome;

// ===== CONFIGURACIÓN =====
const CACHE_DURATION_MINUTES = 1; // 🔄 tiempo de actualización automática (en minutos)
const WORDLIST_URL = "http://127.0.0.1:3000/api/forbidden/wordlist";
const URLS_URL = "http://127.0.0.1:3000/api/forbidden/urls";

// ===== CLAVES DE CACHE =====
const URL_CACHE_KEY = "forbiddenUrlsCache";
const URL_CACHE_TIME = "forbiddenUrlsTimestamp";
const WORD_CACHE_KEY = "forbiddenWordlist";
const WORD_CACHE_TIME = "forbiddenWordlistTimestamp";

// ===== UTILIDADES DE STORAGE (compatibles con ambos navegadores) =====
const storageLocalGet = (keys) =>
    api.storage.local.get.length === 1
        ? api.storage.local.get(keys)
        : new Promise((resolve) => api.storage.local.get(keys, resolve));

const storageLocalSet = (items) =>
    api.storage.local.set.length === 1
        ? api.storage.local.set(items)
        : new Promise((resolve) => api.storage.local.set(items, resolve));

const storageSyncGet = (keys) =>
    api.storage.sync.get.length === 1
        ? api.storage.sync.get(keys)
        : new Promise((resolve) => api.storage.sync.get(keys, resolve));

// ===== FUNCIONES AUXILIARES =====

// Verifica si la cache sigue dentro del tiempo válido
function isCacheValid(timestamp) {
    if (!timestamp) return false;
    const ageMs = Date.now() - timestamp;
    return ageMs < CACHE_DURATION_MINUTES * 60 * 1000;
}

// Formato de URL para Firefox webRequest
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

function buildRegexForDNR(url) {
    const clean = url
        .replace(/^https?:\/\//i, "")
        .replace(/^www\./i, "")
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return `https?:\\/\\/([a-z0-9.-]+\\.)?${clean}`;
}

// ===== FETCH Y CACHE DE DATOS =====
async function getCachedData(apiUrl, cacheKey, cacheTimeKey) {
    const stored = await storageLocalGet([cacheKey, cacheTimeKey]);
    const isValid = isCacheValid(stored[cacheTimeKey]);

    if (stored[cacheKey] && stored[cacheKey].length && isValid) {
        console.log(
            `📦 Cache válida encontrada (${cacheKey}):`,
            stored[cacheKey].length
        );
        return stored[cacheKey];
    }

    try {
        const res = await fetch(apiUrl, { cache: "no-store" });
        if (!res.ok) throw new Error(`API ${res.status} ${res.statusText}`);
        const data = await res.json();

        const payload =
            cacheKey === URL_CACHE_KEY
                ? Array.isArray(data.urls)
                    ? data.urls
                    : []
                : Array.isArray(data.words)
                ? data.words
                : [];

        await storageLocalSet({
            [cacheKey]: payload,
            [cacheTimeKey]: Date.now(),
        });

        console.log(
            `✅ Datos actualizados desde API (${cacheKey}):`,
            payload.length
        );
        return payload;
    } catch (err) {
        console.warn(
            `⚠️ No se pudo acceder a la API (${apiUrl}). Uso cache local.`
        );
        return stored[cacheKey] || [];
    }
}

// ===== BLOQUEO DE URLS =====
let ffRequestListener = null;

async function applyFirefoxWebRequest(enabled, urlsData) {
    if (ffRequestListener) {
        try {
            api.webRequest.onBeforeRequest.removeListener(ffRequestListener);
        } catch {}
        ffRequestListener = null;
    }

    if (!enabled) {
        console.log("🦊 Bloqueo desactivado en Firefox.");
        return;
    }

    const urlFilters = urlsData.length
        ? urlsData.map(toUrlFilterPattern)
        : ["*://*/*"];

    ffRequestListener = () => ({
        redirectUrl: api.runtime.getURL("block.html"),
    });

    api.webRequest.onBeforeRequest.addListener(
        ffRequestListener,
        { urls: urlFilters, types: ["main_frame"] },
        ["blocking"]
    );

    console.log("🦊 webRequest activo (Firefox). URLs:", urlFilters.length);
}

async function applyChromeDNR(enabled, urlsData) {
    const patterns = urlsData.map(buildRegexForDNR);
    const existing = await api.declarativeNetRequest.getDynamicRules();
    const removeIds = existing.map((r) => r.id);

    const addRules = enabled
        ? patterns.map((regex, idx) => ({
              id: idx + 1,
              priority: 1,
              action: {
                  type: "redirect",
                  redirect: { url: api.runtime.getURL("block.html") },
              },
              condition: {
                  regexFilter: regex,
                  resourceTypes: ["main_frame", "sub_frame"],
              },
          }))
        : [];

    await api.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: removeIds,
        addRules,
    });

    console.log("🧩 DNR aplicado (Chrome). Reglas:", addRules.length);
}

// ===== APLICACIÓN DE REGLAS =====
async function updateRules(enabled) {
    try {
        const urlsData = await getCachedData(
            URLS_URL,
            URL_CACHE_KEY,
            URL_CACHE_TIME
        );
        const hasDNR = typeof api.declarativeNetRequest !== "undefined";

        if (hasDNR) {
            await applyChromeDNR(enabled, urlsData);
        } else {
            await applyFirefoxWebRequest(enabled, urlsData);
        }
    } catch (err) {
        console.error("updateRules error:", err);
    }
}

// ===== MENSAJES DESDE CONTENT SCRIPT =====
api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "getForbidden") {
        getCachedData(WORDLIST_URL, WORD_CACHE_KEY, WORD_CACHE_TIME)
            .then((words) => sendResponse({ words }))
            .catch((err) => {
                console.error("❌ Error al obtener wordlist:", err);
                sendResponse({ words: [] });
            });
        return true; // ← Necesario para Firefox
    }

    if (msg.type === "toggle") {
        updateRules(msg.enabled);
    }
});

// ===== CARGA INICIAL =====
storageSyncGet(["enabled"]).then((res) => {
    const initial =
        res && typeof res.enabled !== "undefined" ? res.enabled : true;
    updateRules(initial);
});

// ===== ACTUALIZACIÓN AUTOMÁTICA =====
setInterval(async () => {
    console.log("🔄 Actualización automática de cache...");
    const urls = await getCachedData(URLS_URL, URL_CACHE_KEY, URL_CACHE_TIME);
    const words = await getCachedData(
        WORDLIST_URL,
        WORD_CACHE_KEY,
        WORD_CACHE_TIME
    );
    console.log(
        `✅ Refrescadas ${urls.length} URLs y ${words.length} palabras.`
    );
}, CACHE_DURATION_MINUTES * 60 * 1000);
