const forbiddenWords = ["pacman", "dino", "snake", "t-rex"];

for (const word of forbiddenWords) {
    if (document.body.innerText.toLowerCase().includes(word)) {
        document.body.innerHTML = `
      <div style="
        text-align:center;
        margin-top:20%;
        font-family:sans-serif;
        color:#ff0033;
      ">
        <h1>🚫 Juego bloqueado</h1>
        <p>Vuelve al trabajo, guerrero digital. El mundo real te necesita más que este pixel.</p>
      </div>
    `;
        break;
    }
}
