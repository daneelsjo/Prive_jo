/**
 * include-partials.js
 * - Laadt <div data-include="..."></div> partials
 * - Dispatcht 'partials:loaded' exact 1x
 * - Zet favicon centraal (werkt op root + /HTML/ subpagina's)
 */
(() => {
    // === 1 plek om je icoon te kiezen ===
    // Zet je .ico in /IMG/ en laat dit zo. Of pas het pad hier aan.
    const FAVICON_RELATIVE = "IMG/JD_Web_Solutions.ico";

    const isNested = () => /\/HTML\//.test(location.pathname);
    const prefixPath = (p) => (isNested() ? "../" : "") + (p || "").replace(/^\.\//, "");

    function ensureFavicon() {
        const href = prefixPath(FAVICON_RELATIVE);
        const head = document.head || document.getElementsByTagName("head")[0];

        // oude icon-links opruimen
        head.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]').forEach(el => el.remove());

        // nieuwe icon-links toevoegen
        const icon = document.createElement("link");
        icon.rel = "icon";
        icon.type = "image/x-icon";
        icon.href = href;
        head.appendChild(icon);

        const shortcut = document.createElement("link");
        shortcut.rel = "shortcut icon";
        shortcut.href = href;
        head.appendChild(shortcut);
    }

    async function loadPartials() {
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

        // favicon na partials zodat evt. <head>-manipulatie later niet overschreven wordt
        ensureFavicon();

        // Laat andere scripts weten dat de partials klaar zijn (exact 1x)
        document.dispatchEvent(new CustomEvent("partials:loaded"));

        // Optioneel: menu initialiseren als aanwezig
        if (typeof window.initMenu === "function") {
            try { window.initMenu(); } catch (e) { console.error(e); }
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        // favicon ook meteen zetten bij DOM-ready (voor pagina's zonder partials)
        ensureFavicon();
        loadPartials();
    });
})();
