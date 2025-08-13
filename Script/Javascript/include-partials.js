/**
 * include-partials.js
 * Laadt HTML-partials via <div data-include="..."></div>
 * en dispatcht het event 'partials:loaded' wanneer alles klaar is.
 */
(async function () {
    const includeNodes = document.querySelectorAll("[data-include]");
    const tasks = [];

    for (const el of includeNodes) {
        const src = el.getAttribute("data-include");
        if (!src) continue;
        tasks.push(
            fetch(src)
                .then((res) => {
                    if (!res.ok) throw new Error(`Fout bij include: ${src} (${res.status})`);
                    return res.text();
                })
                .then((html) => { el.innerHTML = html; })
                .catch((err) => console.error(`Include mislukt: ${src}`, err))
        );
    }

    await Promise.allSettled(tasks);

    // Laat andere scripts weten dat de partials in de DOM staan (exact 1 keer).
    document.dispatchEvent(new CustomEvent("partials:loaded"));

    // Start menu als de init aanwezig is
    if (typeof window.initMenu === "function") {
        try { window.initMenu(); } catch (e) { console.error(e); }
    }
})();
