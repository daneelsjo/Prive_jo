// Zorgt dat hamburger ↔ zijmenu werkt en dat de settingsLink slim wijzigt op settings-pagina.
window.initMenu = function () {
    const hamb = document.getElementById("hamburger");
    const menu = document.getElementById("sideMenu");
    const backdrop = document.getElementById("backdrop");

    function open() {
        menu?.classList.add("open");
        backdrop?.classList.add("open");
    }
    function close() {
        menu?.classList.remove("open");
        backdrop?.classList.remove("open");
    }
    hamb?.addEventListener("click", open);
    backdrop?.addEventListener("click", close);

    // Als we op /HTML/settings.html staan → maak het tandwiel rechtsboven een "terug" link.
    const settingsLink = document.getElementById("settingsLink");
    if (settingsLink) {
        const onSettings = location.pathname.toLowerCase().includes("/html/settings");
        if (onSettings) {
            settingsLink.textContent = "⬅️";
            settingsLink.setAttribute("title", "Terug naar overzicht");
            settingsLink.setAttribute("href", "../index.html");
        }
    }
};
