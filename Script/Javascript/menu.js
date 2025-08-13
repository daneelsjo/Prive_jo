// menu.js
(() => {
    let inited = false;

    function setOpen(drawer, backdrop, btn, open) {
        drawer.classList.toggle('open', open);
        backdrop.classList.toggle('open', open);
        btn.setAttribute('aria-expanded', String(open));
        drawer.setAttribute('aria-hidden', String(!open));
    }

    function bindMenu() {
        if (inited) return;

        const btn = document.getElementById('hamburgerBtn');
        const drawer = document.getElementById('sidemenu');
        const backdrop = document.getElementById('backdrop');
        if (!btn || !drawer || !backdrop) return; // header nog niet aanwezig

        inited = true;

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            setOpen(drawer, backdrop, btn, !drawer.classList.contains('open'));
        });

        // klik buiten menu sluit
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) setOpen(drawer, backdrop, btn, false);
        });

        // Esc sluit
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') setOpen(drawer, backdrop, btn, false);
        });

        // accordion in het zijmenu (kopje -> open/dicht)
        document.addEventListener('click', (e) => {
            const h = e.target.closest('.sidemenu-section h4');
            if (!h) return;
            h.parentElement.classList.toggle('open');
        });

        // klik op een link in de drawer -> sluiten
        drawer.addEventListener('click', (e) => {
            if (e.target.closest('a')) setOpen(drawer, backdrop, btn, false);
        });
    }

    // Exporteer voor include-partials.js (optioneel)
    window.initMenu = bindMenu;

    document.addEventListener('DOMContentLoaded', bindMenu);
    document.addEventListener('partials:loaded', bindMenu);
})();
