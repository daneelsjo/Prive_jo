/**
 * include-partials.js
 * Laadt HTML-partials via <div data-include="..."></div>
 * en dispatcht het event 'partials:loaded' wanneer alles klaar is.
 */
(async function () {
    const includeNodes = document.querySelectorAll("[data-include]");

    for (const el of includeNodes) {
        const src = el.getAttribute("data-include");
        if (!src) continue;

        try {
            const res = await fetch(src);
            if (!res.ok) {
                console.error(`Fout bij include: ${src} (${res.status})`);
                continue;
            }
            el.innerHTML = await res.text();
        } catch (err) {
            console.error(`Include mislukt: ${src}`, err);
        }
    }

    // Laat andere scripts weten dat de partials in de DOM staan
    document.dispatchEvent(new CustomEvent("partials:loaded"));

    // Start menu als de init aanwezig is
    if (typeof window.initMenu === "function") {
        try { window.initMenu(); } catch (e) { console.error(e); }
    }
})();

// include-partials.js (onderaan, na het injecteren)
document.dispatchEvent(new Event('partials:loaded'));
