/**
 * include-partials.js
 * - Laadt <div data-include="..."></div> partials
 * - Dispatcht 'partials:loaded' exact 1x na alle includes
 * - Zet favicon centraal (werkt op root + /HTML/ subpagina's)
 */
(() => {
    const FAVICON_RELATIVE = "IMG/JD_Web_Solutions.ico";
    const isNested = () => /\/HTML\//.test(location.pathname);
    const prefixPath = (p = "") => (isNested() ? "../" : "") + p.replace(/^\.\//, "");

    function ensureFavicon() {
        const href = prefixPath(FAVICON_RELATIVE);
        const head = document.head || document.getElementsByTagName("head")[0];

        // verwijder bestaande
        head.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]').forEach(el => el.remove());

        const link = document.createElement("link");
        link.rel = "icon";
        link.type = "image/x-icon";
        link.href = href;
        head.appendChild(link);
    }

    async function loadPartials() {
        const hosts = Array.from(document.querySelectorAll("[data-include]"));
        if (!hosts.length) {
            ensureFavicon();
            document.dispatchEvent(new CustomEvent("partials:loaded"));
            return;
        }

        await Promise.all(hosts.map(async host => {
            const src = host.getAttribute("data-include");
            const url = prefixPath(src);
            try {
                const res = await fetch(url, { cache: "no-cache" });
                const html = await res.text();
                host.outerHTML = html;
            } catch (e) {
                console.error("Partial laden mislukt:", url, e);
            }
        }));

        ensureFavicon();
        document.dispatchEvent(new CustomEvent("partials:loaded"));

        if (typeof window.initMenu === "function") {
            try { window.initMenu(); } catch (e) { console.error(e); }
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        ensureFavicon();
        loadPartials();
    });
})();
