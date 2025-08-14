// Script/Javascript/modal.js
(() => {
    const backdrop = () => document.getElementById('modal-backdrop');
    let openId = null;
    let lastFocus = null;

    function qs(id) { return document.getElementById(id); }
    function visible(el) { el.hidden = false; el.setAttribute('aria-hidden', 'false'); }
    function hidden(el) { el.hidden = true; el.setAttribute('aria-hidden', 'true'); }

    function lockBody(lock) {
        document.body.style.overflow = lock ? 'hidden' : '';
    }

    function trapFocus(modal, e) {
        const focusables = modal.querySelectorAll(
            'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])'
        );
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
        else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
    }

    function onKeydown(e) {
        if (!openId) return;
        const modal = qs(openId);
        if (e.key === 'Escape') { Modal.close(); }
        else if (e.key === 'Tab') { trapFocus(modal, e); }
    }

    const Modal = {
        open(id) {
            const modal = qs(id);
            if (!modal) return;
            // sluit andere
            if (openId) Modal.close();

            lastFocus = document.activeElement;
            visible(backdrop()); visible(modal);
            lockBody(true);
            openId = id;

            document.addEventListener('keydown', onKeydown);
            // focus eerste element
            setTimeout(() => {
                const first = modal.querySelector(
                    'input,textarea,button,[tabindex]:not([tabindex="-1"])'
                );
                (first || modal).focus();
            }, 0);
        },
        close() {
            if (!openId) return;
            const modal = qs(openId);
            hidden(modal); hidden(backdrop());
            lockBody(false);
            document.removeEventListener('keydown', onKeydown);
            if (lastFocus) { try { lastFocus.focus(); } catch (_e) { } }
            openId = null;
        },
        // Helpers voor snelle alerts
        alert({ title = "Melding", html = "", okText = "OK", onOk = null } = {}) {
            qs('modal-alert-title').textContent = title;
            qs('modal-alert-body').innerHTML = html;
            const ok = qs('modal-alert-ok');
            ok.onclick = () => { if (onOk) onOk(); Modal.close(); };
            Modal.open('modal-alert');
        },
        isOpen(id) { return openId === id; }
    };

    // backdrop klik sluit
    document.addEventListener('click', (e) => {
        if (!openId) return;
        if (e.target === backdrop()) Modal.close();
        const closeBtn = e.target.closest('[data-modal-close]');
        if (closeBtn) Modal.close();
    });

    // Expose globally
    window.Modal = Modal;

    // Zorg dat backdrop in DOM staat (als partial nog niet geladen is)
    document.addEventListener('DOMContentLoaded', () => {
        if (!backdrop()) {
            const bd = document.createElement('div');
            bd.id = 'modal-backdrop';
            bd.className = 'modal-backdrop';
            bd.hidden = true;
            document.body.appendChild(bd);
        }
    });
})();
