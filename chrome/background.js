function toUrlFilterPattern(input) {
    let raw = (input || "").trim();

    // Si no trae esquema, asumimos https para poder parsear
    if (!/^https?:\/\//i.test(raw)) raw = "https://" + raw;

    try {
        const { hostname, pathname } = new URL(raw);

        // Quita "www." para no duplicar y usa wildcard de subdominio
        const baseHost = hostname.replace(/^www\./i, "");
        const hostPart = `*.${baseHost}`;

        // Normaliza path
        let pathPart = pathname || "/";
        pathPart = pathPart.replace(/\/+$/, "");
        if (pathPart === "") pathPart = "/";
        if (!pathPart.endsWith("/*")) pathPart += "/*";

        return `*://${hostPart}${pathPart}`;
    } catch (e) {
        // Si no se puede parsear, bloquea todo el host
        const host = input
            .replace(/^https?:\/\//i, "")
            .replace(/\/.*$/, "")
            .replace(/^www\./i, "");
        return `*://*.${host}/*`;
    }
}

async function updateRules(enabled) {
    const CACHE_KEY = "forbiddenUrlsCache";
    const CACHE_TIME_KEY = "forbiddenUrlsTimestamp";
    const now = Date.now();
    let urlsData = [];
    let lastUpdate = 0;

    try {
        // Obtener cache local (si existe)
        const stored = await new Promise((resolve) =>
            chrome.storage.local.get([CACHE_KEY, CACHE_TIME_KEY], resolve)
        );
        if (stored[CACHE_TIME_KEY]) lastUpdate = stored[CACHE_TIME_KEY];

        // Intentar cargar desde API
        let apiSuccess = false;
        try {
            const response = await fetch("http://localhost:3000/api/forbidden/urls", { cache: "no-store" });
            if (!response.ok) throw new Error(`API ${response.status} ${response.statusText}`);
            const data = await response.json();
            urlsData = data.urls || [];
            await new Promise((resolve) =>
                chrome.storage.local.set({ [CACHE_KEY]: urlsData, [CACHE_TIME_KEY]: now }, resolve)
            );
            console.log("✅ Cache actualizado desde API:", urlsData.length);
            apiSuccess = true;
        } catch (apiErr) {
            console.warn("⚠️ No se pudo acceder a la API, usando cache local:", apiErr.message);
        }

        // Si la API falló o devolvió vacío, usar el cache local
        if (!apiSuccess || urlsData.length === 0) {
            if (stored[CACHE_KEY]) {
                urlsData = stored[CACHE_KEY];
                console.log("📦 Usando datos almacenados en cache local:", urlsData.length);
            } else {
                console.warn("❌ No hay cache local disponible.");
                urlsData = [];
            }
        }

        // Crear reglas
        const patterns = (urlsData || []).map((url) => {
            const clean = url
                .replace(/^https?:\/\//, "")
                .replace(/^www\./, "")
                .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            return `https?:\\/\\/([a-z0-9.-]+\\.)?${clean}`;
        });

        const existing = await chrome.declarativeNetRequest.getDynamicRules();
        const removeIds = existing.map((r) => r.id);

        const addRules = enabled
            ? patterns.map((regex, idx) => ({
                  id: idx + 1,
                  priority: 1,
                  action: {
                      type: "redirect",
                      redirect: { url: chrome.runtime.getURL("block.html") },
                  },
                  condition: {
                      regexFilter: regex,
                      resourceTypes: ["main_frame", "sub_frame"],
                  },
              }))
            : [];

        await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: removeIds,
            addRules,
        });

        console.log("🚫 Reglas de bloqueo aplicadas:", patterns.length);
    } catch (err) {
        console.error("updateRules error:", err);
    }
}

// Escucha cambios del interruptor en popup
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "toggle") updateRules(msg.enabled);
});

// Carga estado inicial
chrome.storage.sync.get(["enabled"], (res) => {
    updateRules(res.enabled ?? true);
});
