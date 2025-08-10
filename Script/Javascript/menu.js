// Script/Javascript/menu.js

// init wordt geroepen nadat header partial is ingeladen
window.initMenu = function () {
    const hamb = document.getElementById("hamburger");
    const menu = document.getElementById("sideMenu");
    const backdrop = document.getElementById("backdrop");

    const openDrawer = () => { menu?.classList.add("open"); backdrop?.classList.add("open"); };
    const closeDrawer = () => { menu?.classList.remove("open"); backdrop?.classList.remove("open"); };

    hamb?.addEventListener("click", openDrawer);
    backdrop?.addEventListener("click", closeDrawer);

    // settings-icoon → terugknop op settings-pagina
    const settingsLink = document.getElementById("settingsLink");
    if (settingsLink) {
        const onSettings = location.pathname.toLowerCase().includes("/html/settings");
        if (onSettings) {
            settingsLink.textContent = "⬅️";
            settingsLink.title = "Terug naar overzicht";
            settingsLink.href = "../index.html";
        }
    }

    // Accordion (standaard: dicht; localStorage onthoudt)
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

    // Klik op link → drawer dicht (optioneel)
    menu?.addEventListener("click", (e) => {
        const a = e.target.closest("a");
        if (a && a.getAttribute("href")) setTimeout(closeDrawer, 50);
    });
};

// 1) Init meteen als header er al staat
if (document.getElementById("hamburger")) {
    try { window.initMenu(); } catch { }
}

// 2) Init wanneer partials klaar zijn (include script vuurt dit event af)
document.addEventListener("partials:loaded", () => {
    try { window.initMenu(); } catch { }
});
