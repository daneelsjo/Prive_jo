(function () {
    const $ = (s) => document.querySelector(s);

    // Bepaal basepad (lokale dev vs GitHub Pages)
    const path = location.pathname.toLowerCase();
    const BASE = path.includes("/prive_jo/") ? "/Prive_jo/" : "/";

    const paths = {
        main: BASE + "index.html",
        settings: BASE + "HTML/settings.html",
        notes: BASE + "HTML/notes.html",
    };

    function isMainPage() {
        // root of index
        return (
            !path.includes("/html/settings") &&
            !path.includes("/html/notes")
        );
    }
    function isSettingsPage() { return path.includes("/html/settings"); }
    function isNotesPage() { return path.includes("/html/notes"); }

    function setLink(a, { href, title, icon }) {
        if (!a) return;
        a.setAttribute("href", href);   // absolute href
        a.setAttribute("title", title);
        a.textContent = icon;
    }

    function applyHeaderLinks() {
        const settingsLink = $("#settingsLink");
        const notesLink = $("#notesLink");
        if (!settingsLink || !notesLink) return false; // header nog niet geladen

        if (isMainPage()) {
            // MAIN: [Settings, Notes]
            setLink(settingsLink, { href: paths.settings, title: "Instellingen", icon: "⚙️" });
            setLink(notesLink, { href: paths.notes, title: "Notities", icon: "🗒️" });
        } else if (isSettingsPage()) {
            // SETTINGS: [Post‑its, Notes]
            setLink(settingsLink, { href: paths.main, title: "Post‑its", icon: "🗂️" });
            setLink(notesLink, { href: paths.notes, title: "Notities", icon: "🗒️" });
        } else if (isNotesPage()) {
            // NOTES: [Post‑its, Settings]
            setLink(settingsLink, { href: paths.main, title: "Post‑its", icon: "🗂️" });
            setLink(notesLink, { href: paths.settings, title: "Instellingen", icon: "⚙️" });
        }
        return true;
    }

    // --- Zorg dat we pas linken als header geladen is ---

    // 1) probeer meteen
    if (!applyHeaderLinks()) {
        // 2) retry kort even (include kan async zijn)
        let tries = 0;
        const timer = setInterval(() => {
            tries++;
            if (applyHeaderLinks() || tries > 60) clearInterval(timer); // max ~3s
        }, 50);
    }

    // 3) als jouw include-partials.js een event dispatcht, luister daarop
    document.addEventListener("partials:loaded", applyHeaderLinks);

    // 4) fallback na DOMContentLoaded
    document.addEventListener("DOMContentLoaded", applyHeaderLinks);
})();
