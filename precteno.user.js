// ==UserScript==
// @name         XChat – Značka přečtených zpráv
// @namespace    kamdar.xchat.readmark
// @version      1.1.1
// @description  Ručně přesouvatelná čára mezi přečtenými a nepřečtenými zprávami.
// @match        https://www.xchat.cz/*
// @run-at       document-idle
// @grant        none
// @noframes
// @homepageURL  https://github.com/Martin-CHT/Xchat/
// @updateURL    https://github.com/Martin-CHT/Xchat/raw/refs/heads/main/precteno.user.js
// @downloadURL  https://github.com/Martin-CHT/Xchat/raw/refs/heads/main/precteno.user.js
// ==/UserScript==

(() => {
    'use strict';

    const BOARDS = '#board, #kamdar-full-history-view';
    const LINE_ID = 'xchat-read-marker';
    const CONTROL_ID = 'xchat-read-marker-control';
    const connected = new WeakSet();
    let anchor = null;
    let enabled = true;
    let pageUrl = location.href;

    function getDocuments() {
        const result = [];
        const visited = new Set();
        function visit(win) {
            if (visited.has(win)) return;
            visited.add(win);
            try {
                result.push(win.document);
                for (let i = 0; i < win.frames.length; i++) visit(win.frames[i]);
            } catch { /* Cizí nebo právě obnovovaný rámec. */ }
        }
        visit(window);
        return result;
    }

    function signature(row) {
        // Text funguje stejně pro původní zprávu a její bezpečnou kopii v historii.
        return String(row.textContent || '').normalize('NFC')
            .replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    }

    function rowsOf(board) {
        return Array.from(board.children).filter(row =>
            row.id !== 'splash' && (row.dataset?.xchatHistoryEntry === '1'
                ? Boolean(signature(row)) : /^\d{1,2}:\d{2}:\d{2}/.test(signature(row)))
        );
    }

    function makeAnchor(board, selected) {
        const rows = rowsOf(board);
        const index = rows.indexOf(selected);
        if (index < 0) return null;
        const text = signature(selected);
        // Počítání od nejstarších zachová místo při vložení totožné zprávy nahoře.
        const olderCopies = rows.slice(index + 1).filter(row => signature(row) === text).length;
        return { text, olderCopies };
    }

    function findAnchor(board) {
        if (!anchor) return null;
        const matches = rowsOf(board).filter(row => signature(row) === anchor.text);
        return matches[matches.length - 1 - anchor.olderCopies] || null;
    }

    function onChatClick(event) {
        if (!enabled || event.defaultPrevented || event.button !== 0
            || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        const target = event.target?.nodeType === 1 ? event.target : event.target?.parentElement;
        if (!target || target.closest('a, button, input, textarea, select, label, [contenteditable]')) return;
        const board = target.closest(BOARDS);
        if (!board) return;
        // Tažení myší při kopírování textu nemá posouvat značku.
        if (String(board.ownerDocument.defaultView.getSelection() || '').trim()) return;
        let row = target;
        while (row && row.parentElement !== board) row = row.parentElement;
        if (!row) return;
        const next = makeAnchor(board, row);
        if (!next) return;
        anchor = next;
        render();
    }

    function ensureLine(doc) {
        let line = doc.getElementById(LINE_ID);
        if (!line && doc.body) {
            line = doc.createElement('div');
            line.id = LINE_ID;
            line.setAttribute('role', 'separator');
            line.setAttribute('aria-label', 'Hranice přečtených zpráv. Nad čárou nepřečtené, pod čárou přečtené.');
            // Samostatná vrstva mimo zprávy: nenaruší export, zvuky ani obsah historie.
            line.style.cssText = 'display:none;position:fixed;pointer-events:none;z-index:1000;'
                + 'height:0;border-top:2px solid #dc3545;box-sizing:border-box;';
            const label = doc.createElement('span');
            label.textContent = '↑ Nepřečtené · Přečtené ↓';
            label.style.cssText = 'position:absolute;right:4px;bottom:2px;background:#fff;'
                + 'color:#a31f2c;border:1px solid #dc3545;border-radius:3px;'
                + 'padding:1px 5px;font:11px Arial,sans-serif;white-space:nowrap;';
            line.appendChild(label);
            doc.body.appendChild(line);
        }
        return line;
    }

    // Společné místo pro ovládání. Každý modul funguje i při samostatné instalaci.
    function settingsSection(documents, name, title, order) {
        for (const doc of documents) {
            // crdiv2 může být ID i třída; stavová třída ac se mění při rozbalení.
            // Nesmíme podle ní podmiňovat samotné vytvoření nastavení.
            const form = doc.querySelector('#cr2 #crdiv2 form, #cr2 .crdiv2 form, #cr2 form');
            if (!form) continue;
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

    function installControl(documents) {
        for (const doc of documents) {
            if (doc.getElementById(CONTROL_ID)) continue;
            const panel = settingsSection([doc], 'read', 'Přečtené a nepřečtené zprávy', 50);
            if (!panel) continue;
            const wrapper = doc.createElement('span');
            wrapper.id = CONTROL_ID;
            wrapper.style.cssText = 'display:flex;flex-direction:column;align-items:flex-start;gap:6px;white-space:normal;';
            const toggle = doc.createElement('a');
            toggle.href = '#';
            toggle.dataset.readAction = 'toggle';
            toggle.addEventListener('click', event => {
                event.preventDefault();
                enabled = !enabled;
                render();
            });
            const clear = doc.createElement('a');
            clear.href = '#';
            clear.textContent = 'Vymazat čáru';
            clear.style.marginLeft = '8px';
            clear.addEventListener('click', event => {
                event.preventDefault();
                anchor = null;
                render();
            });
            const place = doc.createElement('button');
            place.type = 'button';
            place.textContent = 'Zobrazit čáru u nejnovější zprávy';
            place.addEventListener('click', () => {
                enabled = true;
                for (const chatDoc of getDocuments()) {
                    for (const board of chatDoc.querySelectorAll(BOARDS)) {
                        if (!board.getBoundingClientRect().height) continue;
                        const first = rowsOf(board)[0];
                        if (!first) continue;
                        anchor = makeAnchor(board, first);
                        render();
                        return;
                    }
                }
                doc.defaultView.alert('Výpis zpráv zatím není dostupný. Zkus to po načtení chatu.');
            });
            const help = doc.createElement('p');
            help.textContent = 'Čára se zobrazí až po výběru zprávy. Klikni na text poslední přečtené zprávy, nebo použij tlačítko níže. Dalším kliknutím na zprávu ji přesuneš.';
            help.style.margin = '0';
            wrapper.append(help, place, toggle, clear);
            panel.appendChild(wrapper);
        }
    }

    function render() {
        if (pageUrl !== location.href) {
            anchor = null;
            pageUrl = location.href;
        }
        const documents = getDocuments();
        installControl(documents);
        let found = false;
        for (const doc of documents) {
            if (!connected.has(doc)) {
                connected.add(doc);
                // Zachytíme kliknutí i když je původní chat při bublání zastaví.
                doc.addEventListener('click', onChatClick, true);
                doc.addEventListener('scroll', render, true);
                doc.defaultView.addEventListener('resize', render);
            }
            let position = null;
            if (enabled && anchor) {
                for (const board of doc.querySelectorAll(BOARDS)) {
                    const bounds = board.getBoundingClientRect();
                    if (!bounds.width || !bounds.height) continue;
                    const row = findAnchor(board);
                    if (!row) continue;
                    found = true;
                    const rect = row.getBoundingClientRect();
                    const viewport = doc.documentElement.clientHeight;
                    if (rect.top >= 0 && rect.top <= viewport) {
                        position = { top: rect.top, left: bounds.left, width: bounds.width };
                        break;
                    }
                }
            }
            // Nevytvářet značku na ostatních stránkách XChatu, kde není vybrána zpráva.
            const line = position ? ensureLine(doc) : doc.getElementById(LINE_ID);
            if (line) {
                line.style.display = position ? 'block' : 'none';
                if (position) {
                    line.style.top = position.top + 'px';
                    line.style.left = position.left + 'px';
                    line.style.width = position.width + 'px';
                }
            }
        }
        for (const doc of documents) {
            const control = doc.getElementById(CONTROL_ID)?.querySelector('[data-read-action="toggle"]');
            if (!control) continue;
            control.textContent = !enabled ? 'Čára: vypnuta'
                : !anchor ? 'Čára: klikni na zprávu'
                : found ? 'Čára: zapnuta' : 'Čára: mimo výpis';
            control.title = 'Klikni na text poslední přečtené zprávy. Čára se umístí nad ni. '
                + 'Další kliknutí ji přesune. Kliknutím na tento odkaz přesouvání a čáru vypneš/zapneš.';
        }
    }

    // Překreslení celé historie nahrazuje DOM uzly; značku obnovujeme podle zprávy.
    // Stav žije jen v otevřené stránce, po obnovení je třeba místo zvolit znovu.
    setInterval(render, 250);
    render();
})();
