// Script/Javascript/modal.js
(() => {
    // voorkom dubbele initialisatie
    if (window.Modal && window.__modalInited) return;
    window.__modalInited = true;

    const $ = (id) => document.getElementById(id);
    const allModals = () => Array.from(document.querySelectorAll('.modal-card'));
    const backdrop = () => $('modal-backdrop');

    let openId = null;
    let lastFocus = null;

    function ensureBackdrop() {
        if (!backdrop()) {
            const bd = document.createElement('div');
            bd.id = 'modal-backdrop';
            bd.className = 'modal-backdrop';
            bd.setAttribute('aria-hidden', 'true');
            document.body.appendChild(bd);
        }
    }

    function show(el) {
        el.hidden = false;
        el.setAttribute('aria-hidden', 'false');
    }
    function hide(el) {
        el.hidden = true;
        el.setAttribute('aria-hidden', 'true');
    }
    function hideAllModals() {
        allModals().forEach(hide);
    }
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
        if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
    }

    function onKeydown(e) {
        if (!openId) return;
        const modal = $(openId);
        if (!modal) return;
        if (e.key === 'Escape') Modal.close();
        else if (e.key === 'Tab') trapFocus(modal, e);
    }

    const Modal = {
        open(id) {
            ensureBackdrop();
            // sluit ALLES eerst (ook bij dubbele partials)
            hideAllModals();

            const m = $(id);
            if (!m) return;
            if (backdrop()) { show(backdrop()); }
            show(m);
            lockBody(true);

            openId = id;
            lastFocus = document.activeElement;

            document.addEventListener('keydown', onKeydown, true);

            // focus eerste focusbaar element
            setTimeout(() => {
                const first = m.querySelector('input,textarea,button,[tabindex]:not([tabindex="-1"])');
                (first || m).focus();
            }, 0);
        },

        close() {
            // sluit ALLE zichtbare modals
            hideAllModals();
            if (backdrop()) backdrop().setAttribute('aria-hidden', 'true');
            lockBody(false);
            document.removeEventListener('keydown', onKeydown, true);
            openId = null;
            if (lastFocus) { try { lastFocus.focus(); } catch (_) { } }
        },

        alert({ title = "Melding", html = "", okText = "OK", onOk = null } = {}) {
            ensureBackdrop();
            const titleEl = $('modal-alert-title');
            const bodyEl = $('modal-alert-body');
            const okBtn = $('modal-alert-ok');
            if (!titleEl || !bodyEl || !okBtn) return;

            titleEl.textContent = title;
            bodyEl.innerHTML = html;
            okBtn.textContent = okText;
            okBtn.onclick = () => { if (onOk) onOk(); Modal.close(); };
            Modal.open('modal-alert');
        },

        isOpen(id) { return openId === id; },
    };

    // klik buiten of op een [data-modal-close] sluit altijd
    document.addEventListener('click', (e) => {
        const bd = backdrop();
        if (!bd) return;

        // backdrop klik
        if (e.target === bd) { Modal.close(); return; }

        // specifieke close knoppen/links
        const closer = e.target.closest('[data-modal-close]');
        if (closer) { Modal.close(); }
    }, true);

    // export
    window.Modal = Modal;

    // fallback: zorg dat backdrop bestaat na DOM-ready
    document.addEventListener('DOMContentLoaded', ensureBackdrop);
})();
