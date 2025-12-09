const EXTENSION_NAME = "Hired Experts Search Policy Network";

const RenderHTML = (word) => {
    return `
        <!DOCTYPE html>
<html lang="en">

<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Blocked</title>
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
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
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

    <p class="message">
        Restricted keyword detected: <strong>${word}</strong>
    </p>

    <div class="info-box">
        <p>Security Policy Enforcement</p>
    </div>

    <p class="footer-text">
        Contact: <span>cybersecurity@hiredexpertsdr.com</span>
    </p>
</div>
</body>

</html>
`;
};

browser.storage.sync.get("enabled").then(async (res) => {
    if (res.enabled === false) return;

    // Use cached list first, then ask the background if needed
    let forbiddenWords = [];
    try {
        const cached = await browser.storage.local.get("cachedWords");
        if (Array.isArray(cached.cachedWords)) {
            forbiddenWords = cached.cachedWords;
        }
    } catch (e) {}

    if (!forbiddenWords.length) {
        try {
            const data = await browser.runtime.sendMessage({
                type: "getForbidden",
            });
            forbiddenWords = data.words || [];
        } catch (e) {
            forbiddenWords = [];
        }
    }

    let text = "";

    const fields = document.querySelectorAll("input, textarea");

    for (const f of fields) {
        const v = f.value || f.getAttribute("value") || "";
        if (v && typeof v === "string") text += " " + v.toLowerCase();
    }

    if (!text.trim()) {
        text = (
            document.body.innerText ||
            document.body.textContent ||
            ""
        ).toLowerCase();
    }

    for (const w of forbiddenWords) {
        const esc = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const re = new RegExp(`(?:^|\\s)${esc}(?:$|\\s)`, "i");

        if (re.test(text)) {
            document.title = EXTENSION_NAME;
            document.documentElement.innerHTML = RenderHTML(w);
            break;
        }
    }
});
