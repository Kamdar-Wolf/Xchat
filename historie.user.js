// ==UserScript==
// @name         XChat – Zobrazit všechny uložené zprávy
// @namespace    kamdar.xchat.fullhistory
// @version      1.0.1
// @description  Přepnutí mezi běžným výpisem a celou dostupnou historií chatu.
// @match        https://www.xchat.cz/*
// @run-at       document-idle
// @grant        unsafeWindow
// @noframes
// @homepageURL  https://github.com/Martin-CHT/Xchat/
// @updateURL    https://github.com/Martin-CHT/Xchat/raw/refs/heads/main/historie.user.js
// @downloadURL  https://github.com/Martin-CHT/Xchat/raw/refs/heads/main/historie.user.js
// ==/UserScript==

(() => {
    'use strict';

    // ============================================================
    // NASTAVENÍ
    // ============================================================

    // true = celý výpis se zapne automaticky při otevření místnosti.
    // false = zapneš jej ručně odkazem „Všechny zprávy“.
    const AUTOMATICKY_ZOBRAZIT = true;

    // Jak často kontrolovat nové zprávy.
    const INTERVAL_MS = 1000;

    // ============================================================
    // VNITŘNÍ STAV
    // ============================================================

    // Ve společném skriptu s @grant none běžíme přímo v kontextu stránky.
    const PAGE = typeof unsafeWindow === 'undefined' ? window : unsafeWindow;

    const CONTROL_ID = 'kamdar-full-history-control';
    const VIEW_ID = 'kamdar-full-history-view';
    const STYLE_ID = 'kamdar-full-history-style';
    const ACTIVE_CLASS = 'kamdar-full-history-active';

    let enabled = AUTOMATICKY_ZOBRAZIT;
    let currentBoard = null;
    let currentView = null;
    let lastSnapshot = null;

    // ============================================================
    // HLEDÁNÍ RÁMCŮ A ULOŽENÉ HISTORIE
    // ============================================================

    function getWindows() {
        const result = [];
        const visited = new Set();

        function walk(win) {
            if (!win || visited.has(win)) return;
            visited.add(win);

            try {
                // Přístup k dokumentu zároveň ověří dostupnost rámce.
                void win.document.documentElement;
                result.push(win);

                for (let i = 0; i < win.frames.length; i++) {
                    walk(win.frames[i]);
                }
            } catch {
                // Nedostupné rámy přeskočíme.
            }
        }

        walk(PAGE);
        return result;
    }

    function findElement(selector, windows) {
        for (const win of windows) {
            try {
                const element = win.document.querySelector(selector);
                if (element) return element;
            } catch {
                // Rámec se mohl mezitím obnovit.
            }
        }

        return null;
    }

    function readHistory(windows) {
        // Nejprve historie hlavního okna, kterou používá history.html.
        for (const win of windows) {
            try {
                const buffer = win.histbuff;

                if (!Array.isArray(buffer) || buffer.length === 0) {
                    continue;
                }

                const entries = [];

                for (let i = 0; i < buffer.length; i++) {
                    if (typeof buffer[i] === 'string' && buffer[i].trim()) {
                        entries.push(buffer[i]);
                    }
                }

                if (entries.length) return entries;
            } catch {
                // Nedostupný zásobník přeskočíme.
            }
        }

        return null;
    }

    // ============================================================
    // BEZPEČNÉ VYKRESLENÍ ZPRÁV
    // ============================================================

    function safeUrl(value, baseUrl) {
        try {
            const url = new URL(value, baseUrl);

            return ['https:', 'http:'].includes(url.protocol)
                ? url.href
                : null;
        } catch {
            return null;
        }
    }

    function createContent(doc, html) {
        const template = doc.createElement('template');
        template.innerHTML = html;

        template.content.querySelectorAll(
            'script, style, iframe, frame, object, embed, ' +
            'form, input, button, textarea, select, link, meta, base'
        ).forEach(element => element.remove());

        for (const element of template.content.querySelectorAll('*')) {
            for (const attribute of Array.from(element.attributes)) {
                const name = attribute.name.toLowerCase();

                if (name.startsWith('on') || name === 'srcdoc') {
                    element.removeAttribute(attribute.name);
                }
            }

            // Kopie zpráv nesmí přebírat ID prvků živého chatu.
            element.removeAttribute('id');

            if (element.tagName === 'A') {
                const href = element.getAttribute('href');
                const url = href ? safeUrl(href, doc.baseURI) : null;

                if (url) {
                    element.setAttribute('href', url);
                    element.setAttribute('target', '_blank');
                    element.setAttribute('rel', 'noopener noreferrer');
                } else {
                    element.removeAttribute('href');
                    element.removeAttribute('target');
                }
            }

            if (element.tagName === 'IMG') {
                const src = element.getAttribute('src');
                const url = src ? safeUrl(src, doc.baseURI) : null;

                element.removeAttribute('srcset');

                if (url) {
                    element.setAttribute('src', url);
                } else {
                    element.removeAttribute('src');
                }
            }
        }

        return template.content;
    }

    function ensureView(board) {
        if (currentBoard !== board || !currentView?.isConnected) {
            deactivateView();

            currentBoard = board;

            const doc = board.ownerDocument;
            let style = doc.getElementById(STYLE_ID);

            if (!style) {
                style = doc.createElement('style');
                style.id = STYLE_ID;
                style.textContent = `
                    body.${ACTIVE_CLASS} #board {
                        display: none !important;
                    }

                    #${VIEW_ID} {
                        display: none;
                        overflow-wrap: anywhere;
                    }

                    body.${ACTIVE_CLASS} #${VIEW_ID} {
                        display: block;
                    }
                `;

                (doc.head || doc.documentElement).appendChild(style);
            }

            currentView = doc.createElement('div');
            currentView.id = VIEW_ID;

            // Zachování vzhledu původního chatu.
            const appearance = doc.defaultView.getComputedStyle(board);

            currentView.style.fontFamily = appearance.fontFamily;
            currentView.style.fontSize = appearance.fontSize;
            currentView.style.lineHeight = appearance.lineHeight;
            currentView.style.color = appearance.color;
            currentView.style.backgroundColor = appearance.backgroundColor;

            board.before(currentView);
            lastSnapshot = null;
        }
    }

    function deactivateView() {
        if (currentBoard) {
            currentBoard.ownerDocument.body?.classList.remove(ACTIVE_CLASS);
        }

        currentView?.remove();

        currentBoard = null;
        currentView = null;
        lastSnapshot = null;
    }

    function renderHistory(board, history) {
        ensureView(board);

        // Stejné pořadí jako v chatu: nejnovější zprávy nahoře.
        const entries = history.slice().reverse();
        const snapshot = JSON.stringify(entries);

        if (snapshot !== lastSnapshot) {
            const doc = board.ownerDocument;
            const win = doc.defaultView;
            const scrolling = doc.scrollingElement;

            const oldHeight = scrolling?.scrollHeight || 0;
            const oldScroll = win.scrollY;
            const wasVisible = doc.body.classList.contains(ACTIVE_CLASS);

            const content = createContent(doc, entries.join(''));
            currentView.replaceChildren(content);

            doc.body.classList.add(ACTIVE_CLASS);
            lastSnapshot = snapshot;

            // Při čtení starších zpráv omezí posun po příchodu nových.
            if (wasVisible && oldScroll > 40 && scrolling) {
                const difference = scrolling.scrollHeight - oldHeight;
                win.scrollTo(win.scrollX, Math.max(0, oldScroll + difference));
            }
        } else {
            board.ownerDocument.body.classList.add(ACTIVE_CLASS);
        }
    }

    // ============================================================
    // ODKAZ V INFORMAČNÍM PANELU
    // ============================================================

    function updateControl(windows) {
        const wrapper = findElement(`#${CONTROL_ID}`, windows);
        const link = wrapper?.querySelector('a');

        if (link) {
            link.textContent = enabled
                ? 'Běžný výpis'
                : 'Všechny zprávy';

            link.title = enabled
                ? 'Vrátit původní výpis chatu'
                : 'Zobrazit celý dostupný zásobník historie';
        }
    }

    function installControl(windows) {
        if (findElement(`#${CONTROL_ID}`, windows)) return;

        const idle = findElement('#idleWrapper', windows);
        const panel = idle?.closest('p');

        if (!panel) return;

        const doc = panel.ownerDocument;
        const wrapper = doc.createElement('span');
        wrapper.id = CONTROL_ID;

        wrapper.style.cssText =
            'float:right; white-space:nowrap; margin-left:10px;';

        const link = doc.createElement('a');
        link.href = '#';

        link.addEventListener('click', event => {
            event.preventDefault();

            if (enabled) {
                enabled = false;
                deactivateView();
            } else {
                const availableWindows = getWindows();
                const board = findElement('#board', availableWindows);
                const history = readHistory(availableWindows);

                if (!board || !history) {
                    doc.defaultView.alert(
                        'Uložená historie zatím není dostupná. ' +
                        'Zkus to znovu za chvíli.'
                    );
                    return;
                }

                enabled = true;
                renderHistory(board, history);
            }

            updateControl(getWindows());
        });

        wrapper.appendChild(link);
        panel.prepend(wrapper);
    }

    // ============================================================
    // PRŮBĚŽNÁ AKTUALIZACE
    // ============================================================

    function tick() {
        const windows = getWindows();

        installControl(windows);
        updateControl(windows);

        if (!enabled) return;

        const board = findElement('#board', windows);
        const history = readHistory(windows);

        if (board && history) {
            renderHistory(board, history);
        }
    }

    tick();

    setInterval(() => {
        try {
            tick();
        } catch (error) {
            console.warn('XChat – celý výpis:', error);
        }
    }, INTERVAL_MS);
})();