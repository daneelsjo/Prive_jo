// Script/Javascript/menu.js

window.DEBUG = true; MenuDebug();


(() => {
    let wired = false;

    const isNested = () => /\/HTML\//i.test(location.pathname);
    const prefixPath = (p = "") => (isNested() ? "../" : "") + p.replace(/^\.\//, "");

    function currentPage() {
        const p = location.pathname.toLowerCase();
        if (p.endsWith("/index.html") || /\/$/.test(p)) return "index";
        if (p.endsWith("/settings.html")) return "settings";
        if (p.endsWith("/notes.html") || p.endsWith("/notities.html")) return "notes";
        return "index";
    }

    function setHeaderQuickLinks() {
        const el = document.getElementById("quickLinks");
        if (!el) return;
        const page = currentPage();
        const variants = {
            index: [{ emoji: "📝", title: "Notities", path: "HTML/notes.html" },
            { emoji: "⚙️", title: "Instellingen", path: "HTML/settings.html" }],
            settings: [{ emoji: "📌", title: "Post-its", path: "index.html" },
            { emoji: "📝", title: "Notities", path: "HTML/notes.html" }],
            notes: [{ emoji: "📌", title: "Post-its", path: "index.html" },
            { emoji: "⚙️", title: "Instellingen", path: "HTML/settings.html" }],
        };

        el.innerHTML = "";
        (variants[page] || variants.index).forEach(l => {
            const a = document.createElement("a");
            a.href = prefixPath(l.path);
            a.className = "icon-btn header-link";
            a.title = l.title; a.setAttribute("aria-label", l.title);
            a.textContent = l.emoji;
            el.appendChild(a);
        });
    }

    function ensureBackdrop() {
        let bd = document.querySelector(".sidemenu-backdrop");
        if (!bd) {
            bd = document.createElement("div");
            bd.className = "sidemenu-backdrop";
            document.body.appendChild(bd);
        }
        return bd;
    }

    function bindHamburger() {
        const btn = document.getElementById("hamburgerBtn");
        const drawer = document.getElementById("sidemenu");
        if (!btn || !drawer) return;

        const bd = ensureBackdrop();

        const setOpen = (open) => {
            drawer.classList.toggle("open", open);
            bd.classList.toggle("open", open);
            btn.setAttribute("aria-expanded", String(open));
            drawer.setAttribute("aria-hidden", String(!open));
            // Fallback als CSS ontbreekt
            drawer.style.transform = open ? "translateX(0)" : "";
            document.body.style.overflow = open ? "hidden" : "";
            if (window.DEBUG) console.log("[menu] drawer", open ? "OPEN" : "CLOSE");
        };

        btn.addEventListener("click", (e) => {
            e.preventDefault();
            setOpen(!drawer.classList.contains("open"));
        });
        bd.addEventListener("click", () => setOpen(false));
        document.addEventListener("keydown", (e) => { if (e.key === "Escape") setOpen(false); });

        // secties in de drawer togglen
        drawer.querySelectorAll(".sidemenu-section h4").forEach(h => {
            h.addEventListener("click", () => h.parentElement.classList.toggle("open"));
        });
    }

    function bindNeonMainnav() {
        const nav = document.querySelector(".mainnav");
        if (!nav) return;

        nav.querySelectorAll("li.has-submenu > a").forEach(a => {
            a.addEventListener("click", (e) => {
                if (a.getAttribute("href") !== "#") return;
                e.preventDefault();
                const li = a.parentElement;
                const open = li.classList.contains("open");
                nav.querySelectorAll("li.has-submenu.open").forEach(s => s !== li && s.classList.remove("open"));
                li.classList.toggle("open", !open);
                a.setAttribute("aria-expanded", String(!open));
            });
        });

        document.addEventListener("click", (e) => {
            if (!nav.contains(e.target)) {
                nav.querySelectorAll("li.has-submenu.open").forEach(li => li.classList.remove("open"));
            }
        });

        nav.querySelectorAll('a[data-newtab]').forEach(a => {
            a.target = "_blank"; a.rel = "noopener noreferrer";
        });
    }

    function initMenu() {
        if (wired) return;
        wired = true;

        setHeaderQuickLinks();
        bindHamburger();
        bindNeonMainnav();

        if (window.DEBUG) {
            console.log("[menu] wired:", {
                hamburgerBtn: !!document.getElementById("hamburgerBtn"),
                sidemenu: !!document.getElementById("sidemenu"),
            });
        }
    }

    window.initMenu = () => { wired = false; initMenu(); };
    document.addEventListener("DOMContentLoaded", initMenu);
    document.addEventListener("partials:loaded", () => { wired = false; initMenu(); });

    // kleine helper om snel te checken in console
    window.MenuDebug = () => ({
        btn: !!document.getElementById("hamburgerBtn"),
        drawer: !!document.getElementById("sidemenu"),
        drawerClasses: document.getElementById("sidemenu")?.className
    });
})();
