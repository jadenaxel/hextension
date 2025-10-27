const btn = document.getElementById("toggle");
const status = document.getElementById("status");

browser.storage.sync.get("enabled").then((res) => {
    const enabled = res.enabled ?? true;
    updateUI(enabled);
});

btn.addEventListener("click", () => {
    browser.storage.sync.get("enabled").then((res) => {
        const newState = !(res.enabled ?? true);
        browser.storage.sync.set({ enabled: newState }).then(() => {
            browser.runtime.sendMessage({ type: "toggle", enabled: newState });
            updateUI(newState);
        });
    });
});

function updateUI(enabled) {
    btn.textContent = enabled ? "Desactivar Bloqueo" : "Activar Bloqueo";
    btn.className = enabled ? "on" : "off";
    status.textContent = enabled ? "Bloqueo activo" : "Bloqueo desactivado";
}
