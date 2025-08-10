// Script/Javascript/menu.js

// hoofd-initializer — wordt aangeroepen na het laden van de header partial
window.initMenu = function () {
    // Drawer elementen
    const hamb = document.getElementById("hamburger");
    const menu = document.getElementById("sideMenu");
    const backdrop = document.getElementById("backdrop");

    const openDrawer = () => {
        menu?.classList.add("open");
        backdrop?.classList.add("open");
    };
    const closeDrawer = () => {
        menu?.classList.remove("open");
        backdrop?.classList.remove("open");
    };

    hamb?.addEventListener("click", openDrawer);
    backdrop?.addEventListener("click", closeDrawer);

    // Zet op /HTML/settings.html het tandwiel om naar 'terug'
    const settingsLink = document.getElementById("settingsLink");
    if (settingsLink) {
        const onSettings = location.pathname.toLowerCase().includes("/html/settings");
        if (onSettings) {
            settingsLink.textContent = "⬅️";
            settingsLink.setAttribute("title", "Terug naar overzicht");
            settingsLink.setAttribute("href", "../index.html");
        }
    }

    // Accordion voor zijmenu-secties
    // werkt voor .sidemenu-section h4 (drawer) en .menu-section .menu-title (variant)
    const sections = document.querySelectorAll(".sidemenu-section, .menu-section");
    sections.forEach((sec, i) => {
        const title = sec.querySelector("h4") || sec.querySelector(".menu-title");
        if (!title) return;

        const key = "drawer_sec_" + i;

        // Standaard: DICHT (pas open als localStorage 'open' zegt)
        const state = localStorage.getItem(key);
        if (state === "open") {
            sec.classList.add("open");
        } else {
            sec.classList.remove("open");
        }

        title.addEventListener("click", (e) => {
            e.preventDefault();
            sec.classList.toggle("open");
            localStorage.setItem(key, sec.classList.contains("open") ? "open" : "closed");
        });
    });

    // Sluit drawer bij klik op een link binnen de drawer (optioneel)
    menu?.addEventListener("click", (e) => {
        const a = e.target.closest("a");
        if (a && a.getAttribute("href")) {
            // mini-delay zodat de navigatie niet wordt onderbroken
            setTimeout(closeDrawer, 50);
        }
    });
};

// 1) Init meteen als de header al in de DOM staat
if (document.getElementById("hamburger")) {
    try { window.initMenu(); } catch (e) { /* silent */ }
}

// 2) Init opnieuw zodra partials klaar zijn (inclusief header.html)
document.addEventListener("partials:loaded", () => {
    try { window.initMenu(); } catch (e) { /* silent */ }
});
