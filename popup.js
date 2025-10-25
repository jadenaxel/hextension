const btn = document.getElementById("toggle");
const status = document.getElementById("status");

chrome.storage.sync.get(["enabled"], (res) => {
    const enabled = res.enabled ?? true;
    updateUI(enabled);
});

btn.addEventListener("click", () => {
    chrome.storage.sync.get(["enabled"], (res) => {
        const newState = !(res.enabled ?? true);
        chrome.storage.sync.set({ enabled: newState });
        chrome.runtime.sendMessage({ type: "toggle", enabled: newState });
        updateUI(newState);
    });
});

function updateUI(enabled) {
    btn.textContent = enabled ? "Desactivar Bloqueo" : "Activar Bloqueo";
    btn.className = enabled ? "on" : "off";
    status.textContent = enabled ? "Bloqueo activo" : "Bloqueo desactivado";
}
