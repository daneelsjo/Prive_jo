// menu.js
(() => {
    let inited = false;

    function isNested() {
        // True wanneer we binnen /HTML/ zitten (bv. HTML/settings.html)
        return /\/HTML\//.test(location.pathname);
    }
    function prefixPath(p) {
        // "" op rootpagina's, "../" op subpagina's
        const pre = isNested() ? "../" : "";
        return p ? pre + p.replace(/^\.\//, "") : "";
    }

    function normalizeHeaderAssets() {
        // Corrigeer alle <a data-path> (interne navigatie)
        document.querySelectorAll('a[data-path]').forEach(a => {
            a.setAttribute('href', prefixPath(a.getAttribute('data-path')));
        });
        // Externe links in nieuwe tab
        document.querySelectorAll('a[data-newtab]').forEach(a => {
            a.setAttribute('target', '_blank');
            a.setAttribute('rel', 'noopener noreferrer');
        });
        // Corrigeer <img data-src>
        document.querySelectorAll('img[data-src]').forEach(img => {
            img.setAttribute('src', prefixPath(img.getAttribute('data-src')));
        });
    }

    function setOpen(drawer, backdrop, btn, open) {
        drawer.classList.toggle('open', open);
        backdrop.classList.toggle('open', open);
        btn.setAttribute('aria-expanded', String(open));
        drawer.setAttribute('aria-hidden', String(!open));
    }

    function closeAllTopMenus(root) {
        root.querySelectorAll('.has-submenu.open').forEach(li => {
            li.classList.remove('open');
            const a = li.querySelector(':scope > a[aria-expanded]');
            if (a) a.setAttribute('aria-expanded', 'false');
        });
    }

    function bindMenu() {
        if (inited) return;

        const btn = document.getElementById('hamburgerBtn');
        const drawer = document.getElementById('sidemenu');
        const backdrop = document.getElementById('backdrop');
        const topnav = document.querySelector('.mainnav');
        if (!btn || !drawer || !backdrop) return; // header nog niet aanwezig

        inited = true;

        // Normaliseer paden/targets (lost HTML/HTML-probleem op)
        normalizeHeaderAssets();

        // Hamburger open/dicht
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            setOpen(drawer, backdrop, btn, !drawer.classList.contains('open'));
        });

        // klik buiten zijmenu sluit
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) setOpen(drawer, backdrop, btn, false);
        });

        // Esc sluit zijmenu
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                setOpen(drawer, backdrop, btn, false);
                if (topnav) closeAllTopMenus(topnav);
            }
        });

        // Accordion in het zijmenu (kopje -> open/dicht)
        document.addEventListener('click', (e) => {
            const h = e.target.closest('.sidemenu-section h4');
            if (!h) return;
            h.parentElement.classList.toggle('open');
        });

        // Klik op een link in de drawer -> sluiten
        drawer.addEventListener('click', (e) => {
            if (e.target.closest('a')) setOpen(drawer, backdrop, btn, false);
        });

        // ------- TOPNAV: klik/touch toggle voor (geneste) submenu's -------
        if (topnav) {
            topnav.addEventListener('click', (e) => {
                const a = e.target.closest('.mainnav .has-submenu > a');
                if (!a) return;
                // Alleen togglen als het een "toggler" is (href '#' of heeft submenu)
                const parentLi = a.parentElement;
                if (a.getAttribute('href') === '#' || parentLi.classList.contains('has-submenu')) {
                    e.preventDefault();
                    const nowOpen = !parentLi.classList.contains('open');
                    // sluit siblings in hetzelfde niveau
                    parentLi.parentElement.querySelectorAll(':scope > .has-submenu.open').forEach(sib => {
                        if (sib !== parentLi) sib.classList.remove('open');
                        const sa = sib.querySelector(':scope > a[aria-expanded]');
                        if (sa) sa.setAttribute('aria-expanded', 'false');
                    });
                    parentLi.classList.toggle('open', nowOpen);
                    a.setAttribute('aria-expanded', String(nowOpen));
                }
            });

            // Klik buiten topnav sluit alle open dropdowns
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.mainnav')) closeAllTopMenus(topnav);
            });
        }
    }

    // Exporteer voor include-partials.js (optioneel)
    window.initMenu = bindMenu;

    document.addEventListener('DOMContentLoaded', bindMenu);
    document.addEventListener('partials:loaded', bindMenu);
})();
