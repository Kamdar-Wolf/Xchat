// ==UserScript==
// @name         XChat – Značka přečtených zpráv
// @namespace    kamdar.xchat.readmark
// @version      1.1.2
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
            help.textContent = 'Klikni na poslední přečtenou zprávu. Dalším kliknutím čáru přesuneš. Nebo označ vše jako přečtené tlačítkem níže.';
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
