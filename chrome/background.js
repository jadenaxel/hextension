const api = typeof browser !== "undefined" ? browser : chrome;
const log = (...a) => console.log("[SW]", ...a);

const API_BASE = "http://localhost:3000/api";
const COUNTRY_ENDPOINT = "https://api.country.is/";
const REFRESH_MINUTES = 1;
const STORAGE_KEYS = {
    words: "cachedWords",
    urls: "cachedUrls",
    regexRules: "cachedRegexRules",
    country: "cachedCountry",
    lastUpdated: "cachedLastUpdated",
};

const hasDnrSupport =
    !!api.declarativeNetRequest &&
    typeof api.declarativeNetRequest.updateDynamicRules === "function";
let webRequestListener = null;

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

    if (payload && Array.isArray(payload.data)) {
        return toNormalizedList(payload.data);
    }

    if (payload && Array.isArray(payload.list)) {
        return toNormalizedList(payload.list);
    }

    if (typeof payload === "string") {
        return toNormalizedList(payload.split(/\r?\n/));
    }

    return [];
}

function toNormalizedRegexRules(payload) {
    const list = Array.isArray(payload) ? payload : payload?.data || payload?.list;
    if (!Array.isArray(list)) return [];

    return list
        .map((r) => {
            const regex = r?.condition?.regexFilter;
            if (!regex || typeof regex !== "string") return null;
            const resourceTypes = Array.isArray(r?.condition?.resourceTypes)
                ? r.condition.resourceTypes
                : ["main_frame", "sub_frame"];
            return {
                regexFilter: regex,
                resourceTypes,
                actionType: r?.action?.type === "redirect" ? "redirect" : "block",
                redirectUrl: r?.action?.redirect?.url || null,
                priority: Number(r?.priority) > 0 ? Number(r.priority) : 1,
            };
        })
        .filter(Boolean);
}

function toHostForRule(url) {
    let clean = String(url || "").trim();
    if (!clean) return "";

    if (!/^https?:\/\//i.test(clean)) clean = "https://" + clean;

    try {
        const u = new URL(clean);
        return u.hostname.replace(/^www\./, "");
    } catch (e) {
        return clean
            .replace(/^https?:\/\//, "")
            .split("/")[0]
            .replace(/^www\./, "");
    }
}

function sanitizeHost(host) {
    const cleaned = String(host || "")
        .replace(/^[*.]+/, "")
        .replace(/\s+/g, "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9.-]/g, "")
        .replace(/\.+/g, ".")
        .replace(/^\./, "")
        .replace(/\.$/, "");

    if (!cleaned) return "";

    const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(cleaned);
    if (isIp) return cleaned;

    if (!cleaned.includes(".")) return "";
    return cleaned;
}

function buildUrlFilter(host) {
    const clean = sanitizeHost(host);
    if (!clean) return "";
    const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(clean);
    return isIp ? `*://${clean}/*` : `*://*.${clean}/*`;
}

async function getCountryCode() {
    try {
        const cached = await api.storage.local.get(STORAGE_KEYS.country);
        if (cached?.[STORAGE_KEYS.country]) {
            return String(cached[STORAGE_KEYS.country]).toUpperCase();
        }

        const res = await fetch(COUNTRY_ENDPOINT);
        const data = await res.json();
        const country = String(data?.country || "DO").toUpperCase();

        await api.storage.local.set({
            [STORAGE_KEYS.country]: country,
        });

        return country;
    } catch (e) {
        log("Geolocation failed, using DO", e);
        return "DO";
    }
}

async function fetchList(kind, country) {
    const url = `${API_BASE}/${country}/v1/forbidden/${kind}`;
    console.log(url);

    const res = await fetch(url);

    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

    const text = await res.text();
    console.log(text);
    let parsed = text;

    try {
        parsed = JSON.parse(text);
    } catch (e) {}

    if (kind === "rules") {
        return toNormalizedRegexRules(parsed);
    }

    return toNormalizedList(parsed);
}

async function getCachedData() {
    const data = await api.storage.local.get([
        STORAGE_KEYS.words,
        STORAGE_KEYS.urls,
        STORAGE_KEYS.regexRules,
    ]);

    return {
        words: toNormalizedList(data[STORAGE_KEYS.words] || []),
        urls: toNormalizedList(data[STORAGE_KEYS.urls] || []),
        regexRules: toNormalizedRegexRules(data[STORAGE_KEYS.regexRules] || []),
    };
}

async function persistData({ words, urls, regexRules, country }) {
    await api.storage.local.set({
        [STORAGE_KEYS.words]: toNormalizedList(words),
        [STORAGE_KEYS.urls]: toNormalizedList(urls),
        [STORAGE_KEYS.regexRules]: toNormalizedRegexRules(regexRules),
        [STORAGE_KEYS.country]: country,
        [STORAGE_KEYS.lastUpdated]: Date.now(),
    });
}

async function refreshFromApi() {
    try {
        const country = await getCountryCode();
        const [urls, words, regexRules] = await Promise.all([
            fetchList("urls", country),
            fetchList("wordlist", country),
            fetchList("rules", country),
        ]);

        await persistData({ words, urls, regexRules, country });
        return { urls, words, regexRules };
    } catch (e) {
        log("Error consultando API, se usa cache si existe", e);
        return null;
    }
}

function buildUrlPatternsForWebRequest(host) {
    const clean = String(host || "")
        .replace(/^[*.]+/, "")
        .replace(/\s+/g, "")
        .trim();

    if (!clean) return [];
    return [`*://${clean}/*`, `*://*.${clean}/*`];
}

function teardownWebRequest() {
    if (
        webRequestListener &&
        api.webRequest?.onBeforeRequest?.hasListener(webRequestListener)
    ) {
        api.webRequest.onBeforeRequest.removeListener(webRequestListener);
    }
    webRequestListener = null;
}

async function applyWebRequestRules(enabled, urls) {
    teardownWebRequest();

    if (!enabled) {
        log("Bloqueo desactivado (webRequest fallback)");
        return;
    }

    if (!api.webRequest?.onBeforeRequest?.addListener) {
        log("webRequest no soportado, no se aplican reglas");
        return;
    }

    const sanitizedHosts = Array.from(
        new Set(
            (urls || [])
                .map((u) => sanitizeHost(toHostForRule(u)))
                .filter(Boolean)
        )
    );

    const urlPatterns = sanitizedHosts.flatMap((h) =>
        buildUrlPatternsForWebRequest(h)
    );

    if (!urlPatterns.length) {
        log("Sin patrones para bloquear (webRequest)");
        return;
    }

    webRequestListener = (_details) => ({
        redirectUrl: api.runtime.getURL("policy.html"),
    });

    api.webRequest.onBeforeRequest.addListener(
        webRequestListener,
        {
            urls: urlPatterns,
            types: ["main_frame", "sub_frame"],
        },
        ["blocking"]
    );

    log("Reglas aplicadas (webRequest):", urlPatterns.length);
}

function buildDynamicRuleFromRegex(rule, id) {
    if (!rule?.regexFilter) return null;

    const redirectUrl =
        rule.redirectUrl || api.runtime.getURL("policy.html");
    const action = {
        type: "redirect",
        redirect: { url: redirectUrl },
    };

    const condition = {
        regexFilter: rule.regexFilter,
        resourceTypes:
            Array.isArray(rule.resourceTypes) && rule.resourceTypes.length
                ? rule.resourceTypes
                : ["main_frame", "sub_frame"],
    };

    return {
        id,
        priority: rule.priority || 1,
        action,
        condition,
    };
}

async function applyDNR(enabled, urls, regexRules = []) {
    teardownWebRequest();

    const sanitizedHosts = Array.from(
        new Set(
            (urls || [])
                .map((u) => sanitizeHost(toHostForRule(u)))
                .filter(Boolean)
        )
    );

    const existing = await api.declarativeNetRequest.getDynamicRules();
    const removeIds = existing.map((r) => r.id);

    if (removeIds.length) {
        await api.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: removeIds,
            addRules: [],
        });
    }

    if (!enabled) {
        log("Bloqueo desactivado");
        return;
    }

    if (!sanitizedHosts.length && !regexRules.length) {
        log("Sin reglas válidas para aplicar");
        return;
    }

    const rules = sanitizedHosts.map((host, i) => ({
        id: i + 1,
        priority: 1,
        action: {
            type: "redirect",
            redirect: { url: api.runtime.getURL("policy.html") },
        },
        condition: {
            urlFilter: buildUrlFilter(host),
            resourceTypes: ["main_frame", "sub_frame"],
        },
    }));

    const regexDynamicRules = regexRules
        .map((r, idx) => buildDynamicRuleFromRegex(r, rules.length + idx + 1))
        .filter(Boolean);

    const allRules = rules.concat(regexDynamicRules);

    if (allRules.length) {
        await api.declarativeNetRequest.updateDynamicRules({
            addRules: allRules,
        });
    }

    log("Reglas aplicadas:", allRules.length);
}

async function applyFromCache(enabled) {
    const { urls, regexRules } = await getCachedData();
    if (hasDnrSupport) {
        await applyDNR(enabled, urls, regexRules);
    } else {
        await applyWebRequestRules(enabled, urls);
    }
    const countUrls = Array.isArray(urls) ? urls.length : 0;
    const countRegex = Array.isArray(regexRules) ? regexRules.length : 0;
    log("Reglas aplicadas desde cache", countUrls + countRegex);
}

async function refreshAndApply(enabled) {
    const latest = await refreshFromApi();

    if (latest && (latest.urls || latest.regexRules)) {
        if (hasDnrSupport) {
            await applyDNR(enabled, latest.urls, latest.regexRules);
        } else {
            await applyWebRequestRules(enabled, latest.urls);
        }
        const countUrls = Array.isArray(latest.urls) ? latest.urls.length : 0;
        const countRegex = Array.isArray(latest.regexRules)
            ? latest.regexRules.length
            : 0;
        log("Reglas actualizadas desde API", countUrls + countRegex);
        return;
    }

    const { urls, regexRules } = await getCachedData();
    if ((Array.isArray(urls) && urls.length) || (Array.isArray(regexRules) && regexRules.length)) {
        if (hasDnrSupport) {
            await applyDNR(enabled, urls, regexRules);
        } else {
            await applyWebRequestRules(enabled, urls);
        }
    } else {
        // Nada que bloquear, limpiar reglas por si quedaron previas
        if (hasDnrSupport) {
            await applyDNR(false, []);
        } else {
            await applyWebRequestRules(false, []);
        }
    }
}

async function updateAll() {
    const { enabled = true } = await api.storage.sync.get(["enabled"]);
    await refreshAndApply(enabled);
}

api.runtime.onInstalled.addListener(async () => {
    api.alarms.create("refresh", { periodInMinutes: REFRESH_MINUTES });
    await updateAll();
});

api.runtime.onStartup.addListener(async () => {
    api.alarms.create("refresh", { periodInMinutes: REFRESH_MINUTES });
    await updateAll();
});

api.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === "refresh") {
        const { enabled = true } = await api.storage.sync.get(["enabled"]);
        await refreshAndApply(enabled);
    }
});

api.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || !msg.type) return;

    if (msg.type === "getWordlist") {
        (async () => {
            const { words } = await getCachedData();
            sendResponse({ words });
        })();
        return true;
    }

    if (msg.type === "toggle") {
        (async () => {
            await updateAll();
        })();
    }
});
