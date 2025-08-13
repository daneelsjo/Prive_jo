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


// Script/Javascript/menu.js
function wireHamburger() {
    const btn = document.getElementById('hamburgerBtn');
    const menu = document.getElementById('sidemenu');
    const backdrop = document.getElementById('backdrop');
    if (!btn || !menu || !backdrop) return; // header nog niet in DOM

    const setOpen = (open) => {
        menu.classList.toggle('open', open);
        backdrop.classList.toggle('open', open);
        btn.setAttribute('aria-expanded', String(open));
        menu.setAttribute('aria-hidden', String(!open));
    };

    btn.onclick = (e) => {
        e.preventDefault();
        setOpen(!menu.classList.contains('open'));
    };

    // klik naast de lade sluit
    backdrop.onclick = (e) => { if (e.target === backdrop) setOpen(false); };

    // Esc sluit
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') setOpen(false);
    });
}

// werkt als de header al in de HTML staat…
document.addEventListener('DOMContentLoaded', wireHamburger);
// …en ook als de header via partials werd ingeladen
document.addEventListener('partials:loaded', wireHamburger);
