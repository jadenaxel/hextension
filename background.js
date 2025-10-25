async function updateRules(enabled) {
    const blockedPatterns = [
        "google.com/logos/",
        "google.com/doodles/",
        "google.com/fnbx",
        "google.com/fbx",
    ];

    await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [1],
        addRules: enabled
            ? [
                  {
                      id: 1,
                      priority: 1,
                      action: { type: "block" },
                      condition: {
                          regexFilter: blockedPatterns.join("|"),
                          resourceTypes: ["main_frame", "sub_frame"],
                      },
                  },
              ]
            : [],
    });
}

// Escucha cambios del interruptor en popup
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "toggle") updateRules(msg.enabled);
});

// Carga estado inicial
chrome.storage.sync.get(["enabled"], (res) => {
    updateRules(res.enabled ?? true);
});
