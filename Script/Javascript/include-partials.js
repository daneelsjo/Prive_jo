/**
 * include-partials.js
 * - Laadt <div data-include="..."></div> PARTIALS
 * - Dispatcht 'partials:loaded' na het inladen
 * - Zet favicon centraal (werkt zowel op root als in /HTML/)
 */
(() => {
    const FAVICON_PATH = "IMG/JD_Web_Solutions.ico";

    // Voeg favicon zo vroeg mogelijk toe (voorkomt extra 404's)
    (function ensureEarlyFavicon() {
        try {
            const href = new URL(FAVICON_PATH, document.baseURI).href;
            const head = document.head || document.getElementsByTagName("head")[0];
            // verwijder bestaande
            head.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]').forEach(el => el.remove());
            const link = document.createElement("link");
            link.rel = "icon";
            link.type = "image/x-icon";
            link.href = href;
            head.appendChild(link);
        } catch (e) {
            console.warn("[partials] favicon niet kunnen instellen:", e);
        }
    })();

    async function loadPartials() {
        const hosts = Array.from(document.querySelectorAll("[data-include]"));
        if (!hosts.length) {
            document.dispatchEvent(new CustomEvent("partials:loaded"));
            return;
        }

        await Promise.all(hosts.map(async host => {
            const src = host.getAttribute("data-include") || "";
            // RELATIEF t.o.v. de huidige pagina (werkt in / en /HTML/)
            const url = new URL(src, document.baseURI).href;
            try {
                const res = await fetch(url, { cache: "no-cache", credentials: "same-origin" });
                if (!res.ok) { console.warn("[partials] fetch faalde:", url, res.status); return; }
                const html = await res.text();
                const wrap = document.createElement("div");
                wrap.innerHTML = html;
                host.replaceWith(...wrap.childNodes);
            } catch (e) {
                console.error("[partials] laden mislukt:", url, e);
            }
        }));

        document.dispatchEvent(new CustomEvent("partials:loaded"));

        // optioneel: menu initialiseren als aanwezig
        if (typeof window.initMenu === "function") {
            try { window.initMenu(); } catch (e) { console.error(e); }
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", loadPartials);
    } else {
        loadPartials();
    }
})();
