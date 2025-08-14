// menu.js
(() => {
    let wired = false;

    const isNested = () => /\/HTML\//.test(location.pathname);
    const prefixPath = (p = "") => (isNested() ? "../" : "") + p.replace(/^\.\//, "");

    function setHeaderQuickLinks() {
        const el = document.getElementById("quickLinks");
        if (!el) return;
        const page = location.pathname.endsWith("notes.html") ? "notes"
            : location.pathname.endsWith("settings.html") ? "settings"
                : "index";

        /** Mapping van pagina -> knoppen rechtsboven */
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
            ]
        };

        const links = variants[page] || variants.index;
        el.innerHTML = "";
        links.forEach(l => {
            const a = document.createElement("a");
            a.href = prefixPath(l.path);
            a.className = "icon-btn";
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

        function setOpen(open) {
            drawer.classList.toggle("open", open);
            backdrop.classList.toggle("open", open);
            document.body.style.overflow = open ? "hidden" : "";
        }

        btn.addEventListener("click", (e) => {
            e.preventDefault();
            setOpen(!drawer.classList.contains("open"));
        });
        backdrop.addEventListener("click", () => setOpen(false));
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") setOpen(false);
        });

        // side sections toggle
        drawer.querySelectorAll(".sidemenu-section h4").forEach(h => {
            h.addEventListener("click", () => h.parentElement.classList.toggle("open"));
        });
    }

    function bindMenu() {
        if (wired) return;
        wired = true;
        setHeaderQuickLinks();
        bindHamburger();
    }

    window.initMenu = bindMenu;
    document.addEventListener("DOMContentLoaded", bindMenu);
    document.addEventListener("partials:loaded", bindMenu);
})();
