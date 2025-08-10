// Laadt elk element met [data-include="pad/naar.html"] en voert daarna initMenu() uit.
(async function () {
    const nodes = document.querySelectorAll("[data-include]");
    for (const el of nodes) {
        const src = el.getAttribute("data-include");
        try {
            const res = await fetch(src);
            const html = await res.text();
            el.innerHTML = html;
        } catch (e) {
            console.error("Include failed:", src, e);
            el.innerHTML = "<!-- include failed: " + src + " -->";
        }
    }
    // init menu listeners (gedeeld)
    if (window.initMenu) window.initMenu();
})();
