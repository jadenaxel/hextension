const EXTENSION_NAME = "Hired Experts Search Policy Network";

const InnerHTML = (word) => {
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

chrome.storage.sync.get(["enabled"], async (res) => {
    const enabled = res.enabled ?? true;
    if (!enabled) return; // Si está apagado, no toques nada

    const CACHE_KEY = "forbiddenWordsCache";
    const CACHE_TIME_KEY = "forbiddenWordsTimestamp";
    const now = Date.now();
    const lastUpdate = localStorage.getItem(CACHE_TIME_KEY);
    let forbiddenWords = [];

    // Si hay datos y no han pasado más de 2 minutos, usa cache
    if (lastUpdate && now - Number(lastUpdate) < 2 * 60 * 1000) {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
            try {
                forbiddenWords = JSON.parse(cached);
            } catch {
                forbiddenWords = [];
            }
        }
    }

    // Si no hay cache válido, consulta la API
    if (forbiddenWords.length === 0) {
        try {
            const response = await fetch("http://localhost:3000/api/forbidden/wordlist", { cache: "no-store" });
            if (!response.ok) throw new Error(`API ${response.status} ${response.statusText}`);
            const data = await response.json();
            forbiddenWords = data.words || [];
            // guarda cache y timestamp
            localStorage.setItem(CACHE_KEY, JSON.stringify(forbiddenWords));
            localStorage.setItem(CACHE_TIME_KEY, now.toString());
        } catch (err) {
            console.error("Error al obtener la lista desde API, usando fallback de localStorage:", err);
            // Si falla la petición, intenta usar cualquier cache disponible aunque esté vencida
            const cached = localStorage.getItem(CACHE_KEY);
            if (cached) {
                try {
                    forbiddenWords = JSON.parse(cached);
                } catch (e) {
                    console.error("Cache corrupto:", e);
                    forbiddenWords = [];
                }
            } else {
                // No hay cache: dejamos forbiddenWords vacío para que la extensión siga sin romperse
                forbiddenWords = [];
            }
        }
    }

    // Si no hay textarea, buscamos texto en el body para evitar exceptions
    let textToCheck = "";
    const textareas = document.querySelectorAll("textarea");
    if (textareas && textareas.length > 0) {
        const ta = textareas[0];
        textToCheck = (ta.value || ta.innerText || ta.innerHTML || "").toLowerCase();
    } else {
        textToCheck = (document.body && (document.body.innerText || document.body.textContent) || "").toLowerCase();
    }

    for (const word of forbiddenWords) {
        const regex = new RegExp(`(?:^|\\s)${word}(?:$|\\s)`, "i");

        if (regex.test(textToCheck)) {
            window.document.title = EXTENSION_NAME;
            document.body.innerHTML = InnerHTML(word);
            break;
        }
    }
});
