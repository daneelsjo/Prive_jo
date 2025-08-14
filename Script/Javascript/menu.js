// Script/Javascript/menu.js
(() => {
    let wired = false;

    const isNested = () => /\/HTML\//i.test(location.pathname);
    const prefixPath = (p = "") => (isNested() ? "../" : "") + p.replace(/^\.\//, "");

    function currentPage() {
        const p = location.pathname.toLowerCase();
        if (p.endsWith("/index.html") || /\/$/.test(p)) return "index";
        if (p.endsWith("/settings.html")) return "settings";
        if (p.endsWith("/notes.html")) return "notes"; // beide accepteren
        return "index";
    }

    function setHeaderQuickLinks() {
        const el = document.getElementById("quickLinks");
        if (!el) return;

        const page = currentPage();
        const variants = {
            index: [
                { emoji: "📝", title: "Notities", path: "HTML/notes.html" },
                { emoji: "⚙️", title: "Instellingen", path: "HTML/settings.html" },
            ],
            settings: [
                { emoji: "📌", title: "Post-its", path: "index.html" },
                { emoji: "📝", title: "Notities", path: "HTML/notes.html" },
            ],
            notes: [
                { emoji: "📌", title: "Post-its", path: "index.html" },
                { emoji: "⚙️", title: "Instellingen", path: "HTML/settings.html" },
            ],
        };

        const links = variants[page] || variants.index;
        el.innerHTML = "";
        links.forEach((l) => {
            const a = document.createElement("a");
            a.href = prefixPath(l.path);
            a.className = "icon-btn header-link";
            a.title = l.title;
            a.setAttribute("aria-label", l.title);
            a.textContent = l.emoji;
            el.appendChild(a);
        });
    }

    function bindHamburger() {
        const btn = document.getElementById("hamburgerBtn");
        const drawer = document.getElementById("sidemenu");
        if (!btn || !drawer) return;

        let backdrop = document.querySelector(".sidemenu-backdrop");
        if (!backdrop) {
            backdrop = document.createElement("div");
            backdrop.className = "sidemenu-backdrop";
            document.body.appendChild(backdrop);
        }

        const setOpen = (open) => {
            drawer.classList.toggle("open", open);
            backdrop.classList.toggle("open", open);
            document.body.style.overflow = open ? "hidden" : "";
        };

        btn.addEventListener("click", (e) => {
            e.preventDefault();
            setOpen(!drawer.classList.contains("open"));
        });
        backdrop.addEventListener("click", () => setOpen(false));
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") setOpen(false);
        });

        // secties standaard dicht; klik op titel togglet
        drawer.querySelectorAll(".sidemenu-section h4").forEach((h) => {
            h.addEventListener("click", () => h.parentElement.classList.toggle("open"));
        });
    }

    function initMenu() {
        if (wired) return;
        wired = true;
        setHeaderQuickLinks();
        bindHamburger();
    }

    // initialiseren wanneer DOM klaar is en wanneer partials geladen zijn
    window.initMenu = () => { wired = false; initMenu(); };
    document.addEventListener("DOMContentLoaded", initMenu);
    document.addEventListener("partials:loaded", () => { wired = false; initMenu(); });
})();
