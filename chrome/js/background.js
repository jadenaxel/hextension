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
    try {
        const response = await fetch(
            "http://localhost:3000/api/forbidden/urls"
        );
        if (!response.ok)
            throw new Error(`API ${response.status} ${response.statusText}`);
        const data = await response.json();

        // Crea expresiones regulares seguras
        const patterns = (data?.urls || []).map((url) => {
            const clean = url
                .replace(/^https?:\/\//, "")
                .replace(/^www\./, "")
                .replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // escapar regex
            return `https?:\\/\\/([a-z0-9.-]+\\.)?${clean}`;
        });

        const existing = await chrome.declarativeNetRequest.getDynamicRules();
        const removeIds = existing.map((r) => r.id);

        const addRules = enabled
            ? patterns.map((regex, idx) => ({
                  id: idx + 1,
                  priority: 1,
                  action: { type: "block" },
                  condition: {
                      regexFilter: regex,
                      resourceTypes: [
                          "main_frame",
                          "sub_frame",
                          "script",
                          "xmlhttprequest",
                          "stylesheet",
                          "image",
                          "object",
                          "media",
                          "font",
                          "other",
                      ],
                  },
              }))
            : [];

        await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: removeIds,
            addRules,
        });

        console.log("Bloqueando URLs:", patterns);
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
