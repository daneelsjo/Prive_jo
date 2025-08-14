// Script/Javascript/menu.js
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
        // minimale inline-styles (valnet)
        Object.assign(bd.style, {
            position: "fixed", inset: "0", background: "rgba(0,0,0,.4)", zIndex: "1900",
            display: bd.classList.contains("open") ? "block" : "none"
        });
        return bd;
    }

    function ensureDrawerBase(drawer) {
        // Basislayout, hard met !important zodat hij altijd zichtbaar kán worden
        const S = drawer.style;
        S.setProperty("position", "fixed", "important");
        S.setProperty("top", "0", "important");
        S.setProperty("bottom", "0", "important");
        S.setProperty("left", "-320px", "important"); // start buiten beeld
        S.setProperty("right", "auto", "important");
        S.setProperty("width", "300px", "important");
        S.setProperty("background", "var(--card,#fff)", "important");
        S.setProperty("color", "var(--fg,#111)", "important");
        S.setProperty("border-right", "1px solid var(--border,#e5e7eb)", "important");
        S.setProperty("padding", "1rem", "important");
        S.setProperty("overflow", "auto", "important");
        S.setProperty("z-index", "9999", "important");
        S.setProperty("transition", "left .25s ease", "important");
        S.setProperty("transform", "none", "important");  // geen translate meer
        S.setProperty("display", "block", "important");   // altijd renderen
    }

    function bindHamburger() {
        const btn = document.getElementById("hamburgerBtn");
        const drawer = document.getElementById("sidemenu");
        if (!btn || !drawer) return;

        const bd = ensureBackdrop();
        ensureDrawerBase(drawer);

        const setOpen = (open) => {
            drawer.classList.toggle("open", open);
            bd.classList.toggle("open", open);
            btn.setAttribute("aria-expanded", String(open));
            drawer.setAttribute("aria-hidden", String(!open));

            // Brute-force zichtbaar/verstoppen (override met !important)
            const DS = drawer.style, BS = bd.style;
            if (open) {
                DS.setProperty("left", "0px", "important");      // IN beeld
                DS.setProperty("transform", "none", "important");
                DS.setProperty("display", "block", "important");
                BS.setProperty("display", "block", "important");
                BS.setProperty("z-index", "9998", "important");
                document.body.style.overflow = "hidden";
            } else {
                DS.setProperty("left", "-320px", "important");   // UIT beeld
                DS.setProperty("transform", "none", "important");
                BS.setProperty("display", "none", "important");
                document.body.style.overflow = "";
            }
            if (window.DEBUG) console.log("[menu] drawer", open ? "OPEN" : "CLOSE");
        };

        btn.addEventListener("click", (e) => {
            e.preventDefault();
            setOpen(!drawer.classList.contains("open"));
        });
        bd.addEventListener("click", () => setOpen(false));
        document.addEventListener("keydown", (e) => { if (e.key === "Escape") setOpen(false); });

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

    window.MenuDebug = () => ({
        btn: !!document.getElementById("hamburgerBtn"),
        drawer: !!document.getElementById("sidemenu"),
        style: document.getElementById("sidemenu") ? getComputedStyle(document.getElementById("sidemenu")).cssText : null
    });
})();
