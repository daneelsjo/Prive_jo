// menu.js
(() => {
    let inited = false;

    function initMenu() {
        if (inited) return;

        const btn = document.getElementById('hamburgerBtn'); // in header.html
        const drawer = document.getElementById('sidemenu');
        const backdrop = document.getElementById('backdrop');

        if (!btn || !drawer || !backdrop) return; // wacht tot partial er is

        inited = true;

        const open = () => { drawer.classList.add('open'); backdrop.classList.add('open'); };
        const close = () => { drawer.classList.remove('open'); backdrop.classList.remove('open'); };

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            if (drawer.classList.contains('open')) close(); else open();
        });

        backdrop.addEventListener('click', close);
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

        // accordion in het zijmenu (kopje -> open/dicht)
        document.addEventListener('click', (e) => {
            const h = e.target.closest('.sidemenu-section h4');
            if (!h) return;
            h.parentElement.classList.toggle('open');
        });

        // klik op een link in de drawer -> sluiten
        drawer.addEventListener('click', (e) => {
            if (e.target.closest('a')) close();
        });
    }

    // init bij gewone pagina‑load
    document.addEventListener('DOMContentLoaded', initMenu);
    // init opnieuw nadat de header partial is ingevoegd
    document.addEventListener('partials:loaded', initMenu);
})();
