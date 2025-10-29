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

let blockListener = null;

async function updateRules(enabled) {
    try {
        const response = await fetch(
            "http://localhost:3000/api/forbidden/urls"
        );
        if (!response.ok)
            throw new Error(`API ${response.status} ${response.statusText}`);
        const data = await response.json();

        const patterns = (data?.urls || []).map((url) => {
            const clean = url
                .replace(/^https?:\/\//, "")
                .replace(/^www\./, "")
                .replace(/\/+$/, ""); // quita / al final

            // Si termina con una ruta específica, capturamos también los parámetros
            const separator = clean.includes("/") ? "" : "/*";
            return `*://*.${clean}${separator}*`;
        });

        for (const listener of browser.webRequest.onBeforeRequest.listeners ||
            []) {
            browser.webRequest.onBeforeRequest.removeListener(listener);
        }

        if (enabled) {
            blockListener = (details) => ({ cancel: true });
            browser.webRequest.onBeforeRequest.addListener(
                blockListener,
                { urls: patterns },
                ["blocking"]
            );
            console.log("Bloqueando URLs:", patterns);
        } else {
            console.log("Bloqueo desactivado");
        }
    } catch (err) {
        console.error("updateRules error:", err);
    }
}

// Escucha cambios del interruptor en popup
browser.runtime.onMessage.addListener((msg) => {
    if (msg.type === "toggle") updateRules(msg.enabled);
});

// Carga estado inicial
browser.storage.sync.get(["enabled"], (res) => {
    updateRules(res.enabled ?? true);
});

browser.runtime.onMessage.addListener(async (msg) => {
    if (msg.type === "getForbidden") {
        const res = await fetch("http://127.0.0.1:3000/api/forbidden/wordlist");
        const data = await res.json();
        return data;
    }
});
