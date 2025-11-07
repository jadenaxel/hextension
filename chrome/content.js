const EXTENSION_NAME = "Hired Experts Search Policy Network";

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

.review-link {
    display: inline-block;
    margin-top: 10px;
    font-size: 14px;
    text-decoration: none;
    color: #0066cc;
    border-bottom: 1px solid transparent;
    transition: 0.2s ease-in-out;
}

.review-link:hover {
    color: #004999;
    border-bottom: 1px solid #004999;
}
</style>
</head>

<body>

    <div class="card">
        <div class="header">
            <h1 class="brand">${EXTENSION_NAME}</h1>
        </div>

        <h2 class="title">Intrusion Prevention - Access Blocked</h2>

        <p class="message">Access denied — This action was blocked by the Cybersecurity Team.</p>
        <p class="message">
            You have tried to search a web page that is not allowed by your Internet usage policy.
        </p>
        <p class="message">All activity is monitored for security compliance.</p>

        <div class="info-box">
            <p>Searched for: <span> ${word}</span></p>
        </div>

        <p class="footer-text">
            If you believe this is an error, contact: <span>cybersecurity@hiredexpertsdr.com</span>
        </p>
    </div>

</body>

</html>
    `;
};

(async function main() {
    // 1) check if extension enabled
    const enabledRes = await new Promise((res) =>
        chrome.storage.sync.get(["enabled"], res)
    );
    const enabled =
        typeof enabledRes.enabled === "undefined"
            ? true
            : Boolean(enabledRes.enabled);
    if (!enabled) return; // user turned it off

    const CACHE_KEY = "forbiddenWordsCache";
    const CACHE_TIME_KEY = "forbiddenWordsTimestamp";
    const now = Date.now();

    // 2) try to read cached words from localStorage (per-page) first (fast)
    let forbiddenWords = [];
    try {
        const local = localStorage.getItem(CACHE_KEY);
        const localTs = Number(localStorage.getItem(CACHE_TIME_KEY) || 0);
        if (local && localTs && now - localTs < 5 * 60 * 1000) {
            // short local fallback freshness
            forbiddenWords = JSON.parse(local);
            // continue with this list (but still okay if empty)
        }
    } catch (e) {
        forbiddenWords = [];
    }

    // 3) If empty or stale, request background for authoritative list (cache-first there)
    if (!forbiddenWords || forbiddenWords.length === 0) {
        try {
            const data = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({ type: "getWordlist" }, (resp) => {
                    if (chrome.runtime.lastError) {
                        return reject(chrome.runtime.lastError);
                    }
                    resolve(resp);
                });
            });
            forbiddenWords = Array.isArray(data.words) ? data.words : [];
            // store on page localStorage for faster subsequent checks on same page
            try {
                localStorage.setItem(CACHE_KEY, JSON.stringify(forbiddenWords));
                localStorage.setItem(CACHE_TIME_KEY, now.toString());
            } catch (e) {
                // ignore storage errors (private mode, etc)
            }
        } catch (err) {
            // background failed: try to use whatever localStorage had (even if stale)
            try {
                const fallback = localStorage.getItem(CACHE_KEY);
                forbiddenWords = fallback ? JSON.parse(fallback) : [];
            } catch (e) {
                forbiddenWords = [];
            }
            console.warn(
                "[content] ⚠️ No se pudo obtener wordlist desde background:",
                err
            );
        }
    }

    // ----------------------
    // 4) Buscar texto en inputs/textarea y body
    // ----------------------
    let textToCheck = "";

    // selecciona inputs relevantes y textareas visibles
    const inputSelectors = ["input", "textarea"];
    const fields = Array.from(
        document.querySelectorAll(inputSelectors.join(","))
    );

    // concatena valores (prioriza values actuales)
    for (const field of fields) {
        try {
            const v = field.value || field.getAttribute("value") || "";
            if (v && typeof v === "string")
                textToCheck += " " + v.toLowerCase();
        } catch (e) {
            // ignorar elementos extraños
        }
    }

    // si no hay texto en inputs/textarea, revisa body
    if (!textToCheck.trim()) {
        textToCheck = (
            (document.body &&
                (document.body.innerText || document.body.textContent)) ||
            ""
        ).toLowerCase();
    }

    if (!textToCheck) return; // nothing to check

    // ----------------------
    // 5) check words (use word boundaries-ish)
    // ----------------------
    for (const w of forbiddenWords) {
        if (!w) continue;
        // escape special regex chars
        const esc = String(w).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const re = new RegExp(`(?:^|\\s)${esc}(?:$|\\s)`, "i");
        if (re.test(textToCheck)) {
            // found a forbidden word -> replace whole body with block page
            try {
                document.title = EXTENSION_NAME;
                document.documentElement.innerHTML = RenderMessagePage(w);
            } catch (e) {
                // fallback: replace body only
                document.body.innerHTML = RenderMessagePage(w);
            }
            break;
        }
    }
})();
