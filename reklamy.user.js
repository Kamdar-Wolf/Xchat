// ==UserScript==
// @name         XChat – Skrýt reklamy v chatu
// @namespace    kamdar.xchat.hide-adverts
// @version      2.0.1
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

    function installControl(documents) {
        for (const doc of documents) {
            const panel = doc.getElementById('idleWrapper')?.closest('p');
            if (!panel) continue;

            const existing = doc.getElementById(CONTROL_ID);

            if (existing) {
                updateLink(existing.querySelector('a'));
                return;
            }

            const wrapper = doc.createElement('span');
            wrapper.id = CONTROL_ID;
            wrapper.style.cssText =
                'float:right;white-space:nowrap;margin-left:10px;';

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
            panel.prepend(wrapper);
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