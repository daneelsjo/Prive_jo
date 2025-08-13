// menu.js
(() => {
    let inited = false;

    function isNested() { return /\/HTML\//.test(location.pathname); }
    function prefixPath(p) {
        const pre = isNested() ? "../" : "";
        return p ? pre + p.replace(/^\.\//, "") : "";
    }

    function normalizeHeaderAssets() {
        document.querySelectorAll('a[data-path]').forEach(a => {
            a.setAttribute('href', prefixPath(a.getAttribute('data-path')));
        });
        document.querySelectorAll('a[data-newtab]').forEach(a => {
            a.setAttribute('target', '_blank');
            a.setAttribute('rel', 'noopener noreferrer');
        });
        document.querySelectorAll('img[data-src]').forEach(img => {
            img.setAttribute('src', prefixPath(img.getAttribute('data-src')));
        });
    }

    // ---------- dynamische quick links rechtsboven ----------
    function pageKey() {
        let p = location.pathname.toLowerCase();
        if (p.endsWith('/')) p += 'index.html';
        const base = p.split('/').pop();
        if (base === 'index.html') return 'index';
        if (base === 'settings.html') return 'settings';
        if (base === 'notes.html') return 'notes';
        return 'other';
    }

    function setHeaderQuickLinks() {
        const host = document.getElementById('quickLinks');
        if (!host) return;
        const key = pageKey();

        // definieer gewenste knoppen per pagina
        const variants = {
            index: [
                { label: '📝 Notities', path: 'HTML/notes.html', title: 'Notities' },
                { label: '⚙️ Instellingen', path: 'HTML/settings.html', title: 'Instellingen' }
            ],
            settings: [
                { label: '📌 Post-its', path: 'index.html', title: 'Post-its' },
                { label: '📝 Notities', path: 'HTML/notes.html', title: 'Notities' }
            ],
            notes: [
                { label: '📌 Post-its', path: 'index.html', title: 'Post-its' },
                { label: '⚙️ Instellingen', path: 'HTML/settings.html', title: 'Instellingen' }
            ],
            other: [
                { label: '📌 Post-its', path: 'index.html', title: 'Post-its' },
                { label: '📝 Notities', path: 'HTML/notes.html', title: 'Notities' }
            ]
        };

        host.innerHTML = '';
        (variants[key] || variants.other).forEach(item => {
            const a = document.createElement('a');
            a.className = 'settings-icon';
            a.setAttribute('data-path', item.path);
            a.setAttribute('title', item.title);
            a.textContent = item.label;
            host.appendChild(a);
        });

        // zet correcte hrefs na injectie
        normalizeHeaderAssets();
    }
    // --------------------------------------------------------

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
        if (!btn || !drawer || !backdrop) return;

        inited = true;

        // normaliseer assets & bouw quick links
        normalizeHeaderAssets();
        setHeaderQuickLinks();

        // Hamburger open/dicht
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            setOpen(drawer, backdrop, btn, !drawer.classList.contains('open'));
        });

        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) setOpen(drawer, backdrop, btn, false);
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                setOpen(drawer, backdrop, btn, false);
                if (topnav) closeAllTopMenus(topnav);
            }
        });

        // accordion in de zijlade
        document.addEventListener('click', (e) => {
            const h = e.target.closest('.sidemenu-section h4');
            if (!h) return;
            h.parentElement.classList.toggle('open');
        });

        drawer.addEventListener('click', (e) => {
            if (e.target.closest('a')) setOpen(drawer, backdrop, btn, false);
        });

        // topnav nested submenu’s (klik/touch)
        if (topnav) {
            topnav.addEventListener('click', (e) => {
                const a = e.target.closest('.mainnav .has-submenu > a');
                if (!a) return;
                const li = a.parentElement;
                if (a.getAttribute('href') === '#' || li.classList.contains('has-submenu')) {
                    e.preventDefault();
                    const open = !li.classList.contains('open');
                    li.parentElement.querySelectorAll(':scope > .has-submenu.open').forEach(sib => {
                        if (sib !== li) {
                            sib.classList.remove('open');
                            const sa = sib.querySelector(':scope > a[aria-expanded]');
                            if (sa) sa.setAttribute('aria-expanded', 'false');
                        }
                    });
                    li.classList.toggle('open', open);
                    a.setAttribute('aria-expanded', String(open));
                }
            });

            document.addEventListener('click', (e) => {
                if (!e.target.closest('.mainnav')) closeAllTopMenus(topnav);
            });
        }
    }

    // export voor include-partials
    window.initMenu = bindMenu;

    document.addEventListener('DOMContentLoaded', bindMenu);
    document.addEventListener('partials:loaded', bindMenu);
})();
