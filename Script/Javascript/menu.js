// Script/Javascript/menu.js
// Init menu & drawer na het inladen van de header partial
window.initMenu = function () {
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

    // Zet op settingspagina het tandwiel om naar 'terug'
    const settingsLink = document.getElementById("settingsLink");
    if (settingsLink) {
        const onSettings = location.pathname.toLowerCase().includes("/html/settings");
        if (onSettings) {
            settingsLink.textContent = "⬅️";
            settingsLink.setAttribute("title", "Terug naar overzicht");
            settingsLink.setAttribute("href", "../index.html");
        }
    }

    // Accordion: werkt voor .sidemenu-section h4 (drawer) én .menu-section .menu-title (eventuele varianten)
    // - standaard: secties open, maar als je "closed" had opgeslagen blijven ze dicht
    const sections = document.querySelectorAll(".sidemenu-section, .menu-section");
    sections.forEach((sec, i) => {
        const title =
            sec.querySelector("h4") ||
            sec.querySelector(".menu-title");
        if (!title) return;

        // Beginstand uit localStorage
        const key = "drawer_sec_" + i;
        const state = localStorage.getItem(key);
        if (state === "closed") {
            sec.classList.remove("open");
        } else {
            sec.classList.add("open"); // standaard open
        }

        title.addEventListener("click", (e) => {
            e.preventDefault();
            sec.classList.toggle("open");
            localStorage.setItem(key, sec.classList.contains("open") ? "open" : "closed");
        });
    });

    // Sluit drawer bij klik op link (optioneel: alleen voor links binnen de drawer)
    menu?.addEventListener("click", (e) => {
        const a = e.target.closest("a");
        if (a && a.getAttribute("href")) {
            // kleine delay zodat de klik werkt
            setTimeout(closeDrawer, 50);
        }
    });
};
