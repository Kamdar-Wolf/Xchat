// ==UserScript==
// @name         XChat – Skrýt reklamy v chatu
// @namespace    kamdar.xchat.hide-adverts
// @version      2.1.1
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