// ==UserScript==
// @name         XChat – Vyplnit novou místnost
// @namespace    kamdar.xchat.room
// @version      1.0.1
// @description  Tlačítko Vyplnit vedle nadpisu Nová místnost.
// @match        https://www.xchat.cz/*create_room*
// @run-at       document-idle
// @grant        none
// @noframes
// @homepageURL  https://github.com/Martin-CHT/Xchat/
// @updateURL    https://github.com/Martin-CHT/Xchat/raw/refs/heads/main/mistnost.user.js
// @downloadURL  https://github.com/Martin-CHT/Xchat/raw/refs/heads/main/mistnost.user.js
// ==/UserScript==

(() => {
    'use strict';

    // Podporuje i adresy s přihlašovacím segmentem před /create_room/.
    if (!/(?:^|\/)create_room(?:\/|$)/.test(location.pathname)) return;

    // \u00a0 je nezalomitelná mezera. \n je zalomení řádku.
    const VALUES = Object.freeze({
        r_name: 'Furry - Yiff',
        r_title: '*5151* Furry, Yiff a jiné neřesti\u00a0*54* Povídky NE!',
        r_disclaimer:
            '<b>Před vstupem prosím potvrďte, že chápete význam slova <i>FURRY</i> a <i>YIFF</i></b>' +
            '\n\n' +
            '<b>Vstupem potvrzujete, že tématu rozumíte, a jeho obsah Vás nepohoršuje.</b>' +
            '\n\n',
        r_fontcolor: 'C9945A',
        r_color: '5E4228',
        r_image: 'https://f.ximg.cz/img6/4854/27404854_1_ghlu553.png',
    });

    function install() {
        if (document.getElementById('xchat-fill-room')) return true;

        const form = document.getElementById('r_name')?.closest('form');
        const heading = form && Array.from(form.querySelectorAll('h2'))
            .find(el => el.textContent.trim() === 'Nová místnost');

        if (!heading) return false;

        const button = document.createElement('button');
        button.id = 'xchat-fill-room';
        button.type = 'button';
        button.textContent = 'Vyplnit';
        button.title = 'Vyplnit připravené údaje místnosti';
        button.style.cssText =
            'margin-left:12px;padding:4px 12px;font:13px Arial,sans-serif;' +
            'cursor:pointer;vertical-align:middle;';

        const status = document.createElement('span');
        status.setAttribute('role', 'status');
        status.style.cssText =
            'margin-left:8px;font:12px Arial,sans-serif;';

        button.addEventListener('click', () => {
            const fields = Object.keys(VALUES)
                .map(id => [id, form.querySelector('#' + id)]);

            const missing = fields
                .filter(([, el]) => !el)
                .map(([id]) => id);

            if (missing.length) {
                status.textContent = 'Chybí pole: ' + missing.join(', ');
                status.style.color = '#b00020';
                return;
            }

            for (const [id, field] of fields) {
                // HTML podmínek patří doslova do textarea.
                field.value = VALUES[id];
                field.dispatchEvent(new Event('input', { bubbles: true }));
                field.dispatchEvent(new Event('change', { bubbles: true }));
            }

            const settings = form.querySelector('#settings');
            if (settings) settings.style.display = 'block';

            const switchLink = form.querySelector('#setup-switch a');
            if (switchLink) {
                switchLink.textContent = 'Skrýt pokročilé nastavení';
            }

            const remaining = form.querySelector('#chars-remains');
            if (remaining) {
                remaining.textContent =
                    'Zbývá znaků: ' + (50 - VALUES.r_title.length);
            }

            const altered = fields
                .filter(([id, el]) => el.value !== VALUES[id]);

            status.style.color = altered.length ? '#b00020' : '#28752b';
            status.textContent = altered.length
                ? 'Stránka změnila obsah: ' +
                  altered.map(([id]) => id).join(', ')
                : 'Vyplněno.';
        });

        heading.append(button, status);
        return true;
    }

    if (!install()) {
        const observer = new MutationObserver(() => {
            if (install()) observer.disconnect();
        });

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
        });
    }
})();