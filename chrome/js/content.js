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

    const response = await fetch(
        "http://localhost:3000/api/forbidden/wordlist"
    );
    const data = await response.json();
    const forbiddenWords = data.words;

    for (const word of forbiddenWords) {
        const regex = new RegExp(`(?:^|\\s)${word}(?:$|\\s)`, "i");

        if (
            regex.test(
                document.querySelectorAll("textarea")[0].innerHTML.toLowerCase()
            )
        ) {
            window.document.title = EXTENSION_NAME;
            document.body.innerHTML = InnerHTML(word);
            break;
        }
    }
});
