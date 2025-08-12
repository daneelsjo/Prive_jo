// Script/Javascript/menu.js

(function () {
    const $ = (sel) => document.querySelector(sel);
    const settingsLink = $("#settingsLink");
    const notesLink = $("#notesLink");
    if (!settingsLink || !notesLink) return;

    // ---------------- helpers ----------------
    const path = location.pathname.toLowerCase();

    // Detecteer basispad (werkt ook op GitHub Pages)
    const BASE = path.includes("/prive_jo/") ? "/Prive_jo/" : "/";

    const paths = {
        main: BASE + "index.html",
        settings: BASE + "HTML/settings.html",
        notes: BASE + "HTML/notes.html",
    };

    const isSettings = path.includes("/html/settings");
    const isNotes = path.includes("/html/notes");
    const isMain = !isSettings && !isNotes; // alles wat geen subpagina is

    function setLink(a, { href, title, icon }) {
        a.href = href;
        a.title = title;
        a.textContent = icon; // alleen icoon tonen
    }

    // ---------------- pagina-afhankelijk gedrag ----------------
    // Wens:
    // MAIN: [Settings, Notes]
    // SETTINGS: [Post-its (naar main), Notes]
    // NOTES: [Post-its (naar main), Settings]

    if (isMain) {
        setLink(settingsLink, { href: paths.settings, title: "Instellingen", icon: "⚙️" });
        setLink(notesLink, { href: paths.notes, title: "Notities", icon: "🗒️" });
    } else if (isSettings) {
        setLink(settingsLink, { href: paths.main, title: "Post-its", icon: "🗂️" });
        setLink(notesLink, { href: paths.notes, title: "Notities", icon: "🗒️" });
    } else if (isNotes) {
        setLink(settingsLink, { href: paths.main, title: "Post-its", icon: "🗂️" });
        setLink(notesLink, { href: paths.settings, title: "Instellingen", icon: "⚙️" });
    }
})();
