// Script/Javascript/menu.js
// Zorgt voor: drawer open/dicht, settings → terug op /HTML/settings.html,
// accordion in zijmenu, init zowel direct als na include.

(function () {
    let inited = false;

    window.initMenu = function () {
        if (inited) return; // voorkom dubbele listeners als init 2x wordt geroepen
        inited = true;

        const hamb = document.getElementById("hamburger");
        const menu = document.getElementById("sideMenu");
        const backdrop = document.getElementById("backdrop");

        const openDrawer = () => { menu?.classList.add("open"); backdrop?.classList.add("open"); };
        const closeDrawer = () => { menu?.classList.remove("open"); backdrop?.classList.remove("open"); };

        hamb?.addEventListener("click", openDrawer);
        backdrop?.addEventListener("click", closeDrawer);

        // settings-icoon → terugpijl op settings pagina
        const settingsLink = document.getElementById("settingsLink");
        if (settingsLink) {
            const onSettings = location.pathname.toLowerCase().includes("/html/settings");
            if (onSettings) {
                settingsLink.textContent = "⬅️";
                settingsLink.title = "Terug naar overzicht";
                settingsLink.href = "../index.html";
            }
        }

        // Accordion (standaard: dicht, localStorage onthoudt 'open')
        const sections = document.querySelectorAll(".sidemenu-section");
        sections.forEach((sec, i) => {
            const title = sec.querySelector("h4");
            const key = "drawer_sec_" + i;
            const state = localStorage.getItem(key);

            if (state === "open") sec.classList.add("open");
            else sec.classList.remove("open");

            title?.addEventListener("click", () => {
                sec.classList.toggle("open");
                localStorage.setItem(key, sec.classList.contains("open") ? "open" : "closed");
            });
        });

        // Klik op link in menu → sluit drawer
        menu?.addEventListener("click", (e) => {
            const a = e.target.closest("a");
            if (a && a.getAttribute("href")) setTimeout(closeDrawer, 50);
        });
    };

    // Init direct als header al aanwezig is
    if (document.getElementById("hamburger")) {
        try { window.initMenu(); } catch { }
    }

    // En opnieuw wanneer partials geladen zijn
    document.addEventListener("partials:loaded", () => {
        try { window.initMenu(); } catch { }
    });
})();
