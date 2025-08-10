/**
 * include-partials.js
 * Laadt HTML-partials (bijv. header, footer, zijmenu) in pagina's via
 * <div data-include="pad/naar/bestand.html"></div>
 * en stuurt een event 'partials:loaded' uit zodra alles geladen is.
 */

(async function () {
    const includeNodes = document.querySelectorAll("[data-include]");

    for (const el of includeNodes) {
        const src = el.getAttribute("data-include");
        if (!src) continue;

        try {
            const response = await fetch(src);
            if (!response.ok) {
                console.error(`Fout bij laden van include: ${src}`, response.status);
                continue;
            }
            const html = await response.text();
            el.innerHTML = html;
        } catch (error) {
            console.error(`Include mislukt: ${src}`, error);
        }
    }

    // Laat weten dat alles geladen is
    document.dispatchEvent(new CustomEvent("partials:loaded"));

    // Als initMenu bestaat, meteen uitvoeren (bv. hamburger-menu activeren)
    if (typeof window.initMenu === "function") {
        try {
            window.initMenu();
        } catch (err) {
            console.error("Fout bij uitvoeren initMenu:", err);
        }
    }
})();
