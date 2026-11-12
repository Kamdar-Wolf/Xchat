// ==UserScript==
// @name         XChat – Skrýt reklamy v chatu
// @namespace    kamdar.xchat.hide-adverts
// @version      2.1.2
// @description  Skrývá reklamy a umožňuje přepínat systémové šeptání.
// @match        https://www.xchat.cz/*
// @run-at       document-idle
// @grant        none
// @noframes
// @homepageURL  https://github.com/Martin-CHT/Xchat/
// @updateURL    https://github.com/Martin-CHT/Xchat/raw/refs/heads/main/reklamy.user.js
// @downloadURL  https://github.com/Martin-CHT/Xchat/raw/refs/heads/main/reklamy.user.js
// ==/UserScript==

(() => {
    'use strict';

    const STORAGE_KEY = 'kamdar.xchat.hideSystemWhispers';
    const STYLE_ID = 'xchat-message-visibility-style';
    const CONTROL_ID = 'xchat-system-whisper-control';

    let hideSystem = false;

    try {
        hideSystem = localStorage.getItem(STORAGE_KEY) === '1';
    } catch {}

    function getDocuments() {
        const documents = [];

        function visit(win) {
            try {
                documents.push(win.document);
            } catch {}

            try {
                for (let i = 0; i < win.frames.length; i++) {
                    visit(win.frames[i]);
                }
            } catch {}
        }

        visit(window);
        return documents;
    }

    function applyStyles(documents) {
        const css = `
            :is(#board, #kamdar-full-history-view) > div:has(.umsg_advert),
            :is(#board, #kamdar-full-history-view) > div:has(font.advert) {
                display: none !important;
            }

            ${hideSystem ? `
                :is(#board, #kamdar-full-history-view) > div:has(.umsg_wsystem) {
                    display: none !important;
                }
            ` : ''}
        `;

        for (const doc of documents) {
            try {
                let style = doc.getElementById(STYLE_ID);

                if (!style) {
                    const parent = doc.head || doc.documentElement;
                    if (!parent) continue;

                    style = doc.createElement('style');
                    style.id = STYLE_ID;
                    parent.appendChild(style);
                }

                if (style.textContent !== css) {
                    style.textContent = css;
                }
            } catch {}
        }
    }

    function updateLink(link) {
        link.textContent = hideSystem
            ? 'Systémové šeptání: zobrazit'
            : 'Systémové šeptání: skrýt';

        link.title = hideSystem
            ? 'Systémové šeptání je skryté. Kliknutím jej zobrazíš.'
            : 'Systémové šeptání je viditelné. Kliknutím jej skryješ.';
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
            const panel = settingsSection([doc], 'visibility', 'Reklamy a systémové šeptání', 30);
            if (!panel) continue;

            const existing = doc.getElementById(CONTROL_ID);

            if (existing) {
                updateLink(existing.querySelector('a'));
                return;
            }

            const wrapper = doc.createElement('span');
            wrapper.id = CONTROL_ID;
            wrapper.style.cssText =
                'display:flex;flex-direction:column;align-items:flex-start;gap:6px;white-space:normal;';

            const link = doc.createElement('a');
            link.href = '#';
            updateLink(link);

            link.addEventListener('click', event => {
                event.preventDefault();
                hideSystem = !hideSystem;

                try {
                    localStorage.setItem(
                        STORAGE_KEY,
                        hideSystem ? '1' : '0'
                    );
                } catch {}

                applyStyles(getDocuments());
                updateLink(link);
            });

            wrapper.appendChild(link);
            panel.appendChild(wrapper);
            return;
        }
    }

    function tick() {
        const documents = getDocuments();
        applyStyles(documents);
        installControl(documents);
    }

    setInterval(tick, 1000);
    tick();
})();