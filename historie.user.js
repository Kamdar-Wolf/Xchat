// ==UserScript==
// @name         XChat – Zobrazit všechny uložené zprávy
// @namespace    kamdar.xchat.fullhistory
// @version      1.1.2
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

            // Zásobník může obsahovat i text a inline prvky oddělené <br>.
            // Každý záznam proto dostane vlastní blok: lze na něj kliknout a změřit jeho pozici.
            const content = doc.createDocumentFragment();
            for (const entry of entries) {
                const row = doc.createElement('div');
                row.dataset.xchatHistoryEntry = '1';
                row.appendChild(createContent(doc, entry));
                content.appendChild(row);
            }
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

    // Společné místo pro ovládání. Každý modul funguje i při samostatné instalaci.
    function settingsSection(documents, name, title, order) {
        for (const doc of documents) {
            // crdiv2 může být ID i třída; stavová třída ac se mění při rozbalení.
            // Nesmíme podle ní podmiňovat samotné vytvoření nastavení.
            const form = doc.querySelector('#cr2 #crdiv2 form, #cr2 .crdiv2 form, #cr2 form');
            if (!form) continue;
            // Styly jsou omezené na náš panel; přebijí staré globální CSS XChatu.
            if (!doc.getElementById('xchat-tools-settings-style')) {
                const style = doc.createElement('style');
                style.id = 'xchat-tools-settings-style';
                style.textContent = "\n#xchat-tools-settings { display:block!important;clear:both;margin:10px 0 0!important;padding:0!important;border:1px solid #73a9c8!important;border-radius:3px;background:#bde8ff!important;color:#00376c!important;font:12px/1.35 Arial,Helvetica,sans-serif!important;box-sizing:border-box;max-width:100%; }\n#xchat-tools-settings *,#xchat-tools-settings *::before,#xchat-tools-settings *::after { box-sizing:border-box; }\n#xchat-tools-settings > summary { padding:6px 7px!important;background:#9bd4f5;color:#00376c;cursor:pointer;font-size:12px!important;font-weight:bold;line-height:1.35; }\n#xchat-tools-settings > summary:hover { background:#88caef; }\n#xchat-tools-settings #xchat-tools-settings-content { display:flex;flex-direction:column;gap:0!important;margin:0!important;padding:0 7px!important;border:0!important;overflow:visible!important; }\n#xchat-tools-settings section { display:flex;flex-direction:column;gap:5px!important;padding:7px 0!important;margin:0!important;border:0;border-bottom:1px solid #91bdd8;min-width:0; }\n#xchat-tools-settings section:last-child { border-bottom:0; }\n#xchat-tools-settings h4 { margin:0!important;padding:0!important;color:#00376c;font:bold 12px/1.35 Arial,sans-serif!important; }\n#xchat-tools-settings p { margin:3px 0!important;padding:0!important;float:none!important;width:auto!important;font:11px/1.4 Arial,sans-serif!important; }\n#xchat-tools-settings div { border:0!important;padding:0!important;overflow:visible!important; }\n#xchat-tools-settings a,#xchat-tools-settings button { display:inline-flex;align-items:center;justify-content:center;max-width:100%;min-width:0;min-height:23px;margin:0!important;padding:3px 6px!important;border:1px solid #7aaac8;border-radius:3px;background:#e6f5ff;color:#00376c!important;font:11px/1.3 Arial,sans-serif!important;text-decoration:none!important;text-align:left;white-space:normal;overflow-wrap:anywhere;cursor:pointer; }\n#xchat-tools-settings a:hover,#xchat-tools-settings button:hover { background:#fff;border-color:#397fae; }\n#xchat-tools-settings a:focus-visible,#xchat-tools-settings button:focus-visible,#xchat-tools-settings summary:focus-visible { outline:2px solid #175c99;outline-offset:2px; }\n#xchat-tools-settings #xchat-export-controls { display:flex!important;flex-direction:row!important;flex-wrap:wrap;gap:4px!important;align-items:center!important; }\n#xchat-tools-settings .xchat-export-count { flex-basis:100%;color:#365e77;font-size:11px; }\n#xchat-tools-settings #xchat-audio-settings { margin:0!important;padding:0!important;border:0!important;background:transparent!important;color:inherit!important;font:inherit!important; }\n#xchat-tools-settings #xchat-audio-settings > summary { padding:4px 0!important;margin:0!important;cursor:pointer;font-size:11px;font-weight:bold;color:#00376c; }\n#xchat-tools-settings fieldset { min-width:0;margin:7px 0!important;padding:6px!important;border:1px solid #82b5d3!important;border-radius:3px;background:#d5efff; }\n#xchat-tools-settings legend { max-width:100%;padding:0 3px!important;font:bold 11px/1.3 Arial,sans-serif;white-space:normal;color:#00376c; }\n#xchat-tools-settings label { display:block;margin:4px 0;font:11px/1.35 Arial,sans-serif; }\n#xchat-tools-settings input { max-width:100%;min-width:0;height:23px;margin:3px 0!important;padding:2px 4px;border:1px solid #7ba7c0;border-radius:2px;background:#fff;color:#142f40;font:11px Arial,sans-serif; }\n#xchat-tools-settings input[type=url] { display:block;width:100%!important; }\n#xchat-tools-settings input[type=number] { width:55px!important; }\n#xchat-tools-settings .xchat-audio-actions { display:flex;flex-wrap:wrap;gap:4px;margin-top:5px; }\n#xchat-tools-settings [aria-live] { color:#365e77;overflow-wrap:anywhere; }\n";
                (doc.head || doc.documentElement).appendChild(style);
            }
            let root = doc.getElementById('xchat-tools-settings');
            if (!root) {
                root = doc.createElement('details');
                root.id = 'xchat-tools-settings';
                root.open = true;
                root.style.cssText = 'display:block;clear:both;margin:12px 0;padding:12px;border:1px solid #aaa;background:#fafafa;color:#222;font:13px Arial,sans-serif;';
                const summary = doc.createElement('summary');
                summary.textContent = 'Nastavení XChatu';
                summary.style.cssText = 'font-weight:bold;cursor:pointer;';
                const content = doc.createElement('div');
                content.id = 'xchat-tools-settings-content';
                content.style.cssText = 'display:flex;flex-direction:column;gap:12px;margin-top:10px;';
                root.append(summary, content);
                // Ovládání nástrojů nesmí spouštět klikací obsluhu okolního chatu.
                root.addEventListener('click', event => event.stopPropagation());
            }
            if (form.nextElementSibling !== root) form.after(root);
            let section = doc.getElementById('xchat-tools-' + name);
            if (!section) {
                section = doc.createElement('section');
                section.id = 'xchat-tools-' + name;
                section.style.cssText = 'display:flex;flex-direction:column;align-items:stretch;gap:6px;min-width:0;order:' + order + ';';
                const heading = doc.createElement('h4');
                heading.textContent = title;
                heading.style.margin = '0';
                section.appendChild(heading);
                root.querySelector('#xchat-tools-settings-content').appendChild(section);
            }
            return section;
        }
        return null;
    }

    function installControl(windows) {
        if (findElement(`#${CONTROL_ID}`, windows)) return;

        const panel = settingsSection(windows.map(win => win.document), 'history', 'Výpis zpráv', 20);

        if (!panel) return;

        const doc = panel.ownerDocument;
        const wrapper = doc.createElement('span');
        wrapper.id = CONTROL_ID;

        wrapper.style.cssText =
            'display:flex;flex-direction:column;align-items:flex-start;gap:6px;white-space:normal;';

        const link = doc.createElement('a');
        link.href = '#';
        link.textContent = enabled ? 'Běžný výpis' : 'Všechny zprávy';

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
        panel.appendChild(wrapper);
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