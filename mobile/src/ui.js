((M) => {
    const css = `
#xcm-settings,#xcm-board{font:16px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;box-sizing:border-box;max-width:100%;color:#16354b}
#xcm-settings *{box-sizing:border-box}#xcm-settings{margin:12px 0;border:1px solid #86b8d1;border-radius:10px;background:#edf8ff;overflow:hidden}
#xcm-settings summary{padding:12px;cursor:pointer;font-weight:650;background:#d7effc;overflow-wrap:anywhere}#xcm-settings .xcm-sections{padding:0 12px}
#xcm-settings section{padding:12px 0;border-bottom:1px solid #b9d6e8}#xcm-settings section:last-child{border-bottom:0}
#xcm-settings h3{font-size:1rem;margin:0 0 8px}#xcm-settings p{margin:6px 0;font-size:.87rem;overflow-wrap:anywhere}
#xcm-settings label{display:block;margin:9px 0}#xcm-settings input:not([type=checkbox]),#xcm-settings textarea,#xcm-settings select{display:block;width:100%;max-width:100%;min-width:0;min-height:44px;padding:8px;border:1px solid #87a9bc;border-radius:6px;background:#fff;color:#16354b;font:inherit}
#xcm-settings input[type=checkbox]{width:22px;height:22px;vertical-align:middle;margin:0 8px 0 0}#xcm-settings textarea{min-height:75px;resize:vertical}
#xcm-settings button,#xcm-settings .xcm-link{min-height:44px;max-width:100%;border:1px solid #6c9eb9;border-radius:6px;padding:8px 12px;background:#fff;color:#153f5b;font:inherit;cursor:pointer;overflow-wrap:anywhere;text-decoration:none}
#xcm-settings .xcm-actions{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}#xcm-settings .xcm-primary{background:#17608e;color:#fff;border-color:#17608e}
#xcm-settings fieldset{min-width:0;margin:12px 0;padding:10px;border:1px solid #a7c8db;border-radius:7px}#xcm-settings legend{padding:0 4px;font-weight:600}
#xcm-settings [aria-invalid=true]{border-color:#b62828!important}#xcm-settings .xcm-status{font-size:.85rem;color:#3a586e}#xcm-settings .xcm-error{color:#9a2020}
#xcm-board .xcm-row{padding:8px 5px;border-bottom:1px solid #c8d8e2;overflow-wrap:anywhere;white-space:pre-wrap;scroll-margin-top:8px}
#xcm-board img{max-width:100%;height:auto;vertical-align:middle}#xcm-board .xcm-mention{background:#fff0ad;color:#241b00;box-shadow:inset 4px 0 #d69500;padding-left:10px}
#xcm-board .xcm-whisper{background:#e7d9ff;color:#25103d;box-shadow:inset 4px 0 #8545c1;padding-left:10px}#xcm-board .xcm-day{display:block;color:#607789;font-size:.72rem}
#xcm-board .xcm-read-marker{border-top:3px solid #cc3030;color:#a32020;font:12px/1.5 system-ui;padding:2px 4px;margin-top:6px}
#xcm-board .xcm-row[hidden]{display:none!important}#xcm-settings button:focus-visible,#xcm-settings input:focus-visible{outline:3px solid #1971a6;outline-offset:2px}
@media(max-width:360px){#xcm-settings .xcm-sections{padding:0 8px}#xcm-settings button{padding:8px}}
@media print{#xcm-settings{display:none!important}}
`;
    function el(tag, text, attrs = {}) {
        const node = document.createElement(tag); if (text != null) node.textContent = text;
        for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
        return node;
    }
    function button(text, action, primary = false) {
        const node = el('button', text, {type: 'button'}); if (primary) node.className = 'xcm-primary';
        node.addEventListener('click', action); return node;
    }
    function section(title) {
        const node = el('section'); node.appendChild(el('h3', title)); M.sections.appendChild(node); return node;
    }
    function input(parent, title, id, value, type = 'text', attrs = {}) {
        const label = el('label', title, {for: id}); const field = el(type === 'textarea' ? 'textarea' : 'input', null, {id, ...attrs});
        if (type !== 'textarea') field.type = type;
        if (type === 'checkbox') { field.checked = Boolean(value); label.prepend(field); }
        else { field.value = String(value ?? ''); label.appendChild(field); }
        parent.appendChild(label); return field;
    }
    function status(parent, id) { const node = el('p', '', {id, class: 'xcm-status'}); parent.appendChild(node); return node; }
    function saveSettings() {
        const saved = M.write('settings', M.settings);
        M.notice = saved ? 'Nastavení uloženo.' : M.storageWarning;
        M.updateStatus(); return saved;
    }
    function toggle(parent, title, key, rerender = true) {
        const field = input(parent, title, 'xcm-' + key, M.settings[key], 'checkbox');
        field.addEventListener('change', () => { M.settings[key] = field.checked; saveSettings(); if (rerender) M.renderMessages(); });
        return field;
    }
    function buildAutomatic() {
        const box = section('Automatická aktualizace');
        const enabled = input(box, 'Automaticky odesílat /s při neaktivitě', 'xcm-auto-send', M.settings.autoSend, 'checkbox');
        const minutes = input(box, 'Interval /s (minuty, 1–1440)', 'xcm-interval', M.settings.intervalMinutes, 'number', {min: 1, max: 1440, step: 1});
        const reading = input(box, 'Průběžně načítat nové zprávy', 'xcm-auto-read', M.settings.autoRead, 'checkbox');
        const seconds = input(box, 'Načítání zpráv (sekundy, 5–3600)', 'xcm-read-seconds', M.settings.readSeconds, 'number', {min: 5, max: 3600, step: 1});
        const actions = el('div', null, {class: 'xcm-actions'});
        actions.append(button('Uložit intervaly', () => {
            const interval = M.integer(minutes.value, null, 1, 1440); const read = M.integer(seconds.value, null, 5, 3600);
            minutes.setAttribute('aria-invalid', String(interval === null)); seconds.setAttribute('aria-invalid', String(read === null));
            if (interval === null || read === null) { M.notice = 'Zadej celé minuty 1–1440 a sekundy 5–3600.'; M.updateStatus(); return; }
            M.settings.autoSend = enabled.checked; M.settings.intervalMinutes = interval;
            M.settings.autoRead = reading.checked; M.settings.readSeconds = read;
            M.nextRead = Date.now() + read * 1000; saveSettings();
        }, true), button('Obnovit zprávy', () => { void M.request('read'); }));
        M.resumeButton = button('Obnovit automatické /s', M.resume); actions.appendChild(M.resumeButton); box.appendChild(actions);
        status(box, 'xcm-countdown'); status(box, 'xcm-network');
        box.appendChild(el('p', 'Odeslání zprávy spustí interval znovu. Rozepsaný text automatické /s odloží; načítání zpráv jej nesmaže. Při uspání karty se čeká na její návrat.'));
        const original = el('a', 'Otevřít původní stránku', {href: M.page.refreshURL, class: 'xcm-link'}); box.appendChild(original);
    }
    function buildExport() {
        const box = section('Export a historie'); const actions = el('div', null, {class: 'xcm-actions'});
        for (const [name, format] of [['TXT', 'txt'], ['Markdown', 'md'], ['HTML', 'html']]) actions.appendChild(button(name, () => M.download(format)));
        box.appendChild(actions); toggle(box, 'Vynechat příchody a odchody v exportu', 'omitPresence', false);
        toggle(box, 'Zobrazovat celou nasbíranou historii', 'showAll');
        const limit = input(box, 'Nejvýše uložených zpráv v této místnosti', 'xcm-archive-limit', M.settings.archiveLimit, 'number', {min: 100, max: 10000, step: 100});
        box.appendChild(button('Uložit limit historie', () => {
            const value = M.integer(limit.value, null, 100, 10000);
            if (value === null) { M.notice = 'Limit musí být celé číslo 100–10000.'; M.updateStatus(); return; }
            if (value < M.archive.length && !window.confirm('Nižší limit odstraní nejstarší uložené zprávy. Pokračovat?')) return;
            M.settings.archiveLimit = value; M.archive = M.archive.slice(-value); M.write(M.roomKey + '.archive', M.archive); saveSettings(); M.renderMessages();
        }));
        box.appendChild(button('Vymazat starší historii', () => {
            if (!window.confirm('Vymazat starší nasbíranou historii této místnosti? Aktuální výpis zůstane.')) return;
            M.archive = M.snapshot.slice(); M.write(M.roomKey + '.archive', M.archive); M.updateRoom({readMarker: null}); M.renderMessages();
        }));
        status(box, 'xcm-archive-count');
        box.appendChild(el('p', 'Historie se ukládá odděleně podle nicku a místnosti. Obsahuje pouze zprávy skutečně načtené od instalace. HTML export má filtry uživatelů, dvojic šeptání a příchodů/odchodů.'));
    }
    function buildVisibility() {
        const box = section('Zobrazení zpráv');
        toggle(box, 'Skrýt rozpoznané reklamy', 'hideAds'); toggle(box, 'Skrýt systémové šeptání', 'hideSystem');
        toggle(box, 'Zvýraznit moje zmínky a příchozí šeptání', 'highlight');
        box.appendChild(el('p', 'Zmínky jsou žluté; příchozí šeptání fialové. Nick se načítá z formuláře chatu.'));
    }
    function buildAudio() {
        const box = section('Zvuky a sledované výrazy');
        box.appendChild(button('Povolit zvuky', () => { void M.unlockAudio(); }, true));
        box.appendChild(el('p', 'Po otevření stránky jednou klikni na Povolit zvuky nebo Test. Přiložené nahrávky fungují bez přístupu ke GitHubu.'));
        for (const [kind, title] of [['message', 'Zpráva / zmínka / šeptání'], ['arrival', 'Příchod do místnosti'], ['departure', 'Odchod z místnosti']]) {
            const group = el('fieldset'); group.appendChild(el('legend', title)); box.appendChild(group);
            const config = M.settings.sounds[kind];
            const enabled = input(group, 'Zvuk zapnutý', 'xcm-sound-' + kind, config.enabled, 'checkbox');
            const label = el('label', 'Zdroj zvuku', {for: 'xcm-source-' + kind});
            const source = el('select', null, {id: 'xcm-source-' + kind});
            for (const [value, text] of [['bundled', 'Přiložená nahrávka'], ['custom', 'Vlastní MP3 / WAV'], ['tones', 'Původní tóny']]) source.appendChild(el('option', text, {value}));
            source.value = config.source; label.appendChild(source); group.appendChild(label);
            const url = input(group, 'Veřejný HTTPS odkaz na zvuk', 'xcm-url-' + kind, config.url, 'url');
            const volume = input(group, 'Hlasitost (0–1)', 'xcm-volume-' + kind, config.volume, 'number', {min: 0, max: 1, step: .05});
            const updateSource = () => { url.parentElement.hidden = source.value !== 'custom'; }; source.addEventListener('change', updateSource); updateSource();
            const save = () => {
                const loudness = Number(volume.value); let validURL = true;
                if (source.value === 'custom') { try { const parsed = new URL(url.value); validURL = parsed.protocol === 'https:' && !parsed.username && !parsed.password; } catch { validURL = false; } }
                if (!validURL || !volume.value.trim() || !Number.isFinite(loudness) || loudness < 0 || loudness > 1) { M.notice = 'Zkontroluj HTTPS odkaz a hlasitost od 0 do 1.'; M.updateStatus(); return false; }
                M.settings.sounds[kind] = {enabled: enabled.checked, source: source.value, url: url.value.trim(), volume: loudness}; saveSettings(); return true;
            };
            const actions = el('div', null, {class: 'xcm-actions'});
            actions.append(button('Uložit', save), button('Test', () => { if (save()) void M.play(kind, true); }), button('Původní tóny', () => { source.value = 'tones'; updateSource(); save(); }));
            group.appendChild(actions); status(group, 'xcm-audio-' + kind);
        }
        const terms = input(box, 'Sledované výrazy (jeden na řádek)', 'xcm-terms', M.settings.watchedTerms.join('\n'), 'textarea');
        const nicks = input(box, 'Sledovaní příjemci šeptání (jeden na řádek)', 'xcm-nicks', M.settings.whisperNicks.join('\n'), 'textarea');
        const whole = input(box, 'Hledat celá slova', 'xcm-whole', M.settings.wholeWords, 'checkbox');
        const system = input(box, 'Sledovat výrazy i v systémových zprávách', 'xcm-include-system', M.settings.includeSystem, 'checkbox');
        box.appendChild(button('Uložit sledování', () => {
            M.settings.watchedTerms = terms.value.split('\n').map(M.normalize).filter(Boolean).slice(0, 100);
            M.settings.whisperNicks = nicks.value.split('\n').map(M.normalize).filter(Boolean).slice(0, 100);
            M.settings.wholeWords = whole.checked; M.settings.includeSystem = system.checked; saveSettings(); M.renderMessages();
        }));
    }
    function buildReadMarker() {
        const box = section('Přečtené a nepřečtené zprávy'); toggle(box, 'Zobrazit čáru přečtených zpráv', 'readLine');
        const actions = el('div', null, {class: 'xcm-actions'});
        actions.append(button('Označit vše jako přečtené', () => { M.updateRoom({readMarker: (M.settings.showAll ? M.archive : M.snapshot).at(-1)?.id || null}); M.renderMessages(); }),
            button('Vymazat čáru', () => { M.updateRoom({readMarker: null}); M.renderMessages(); }));
        box.append(actions, el('p', 'Čáru přesuneš klepnutím na text poslední přečtené zprávy. Novější zprávy nad čárou jsou nepřečtené. Odkazy ani označování textu čáru neposouvají.'));
        status(box, 'xcm-read-status');
    }
    function buildRoomTemplate(parent) {
        const box = parent || section('Předvyplnění nové místnosti');
        const labels = {r_name: 'Název místnosti', r_title: 'Titulek', r_disclaimer: 'Vstupní upozornění', r_fontcolor: 'Barva písma', r_color: 'Barva pozadí', r_image: 'Obrázek pozadí (URL)'};
        const fields = {};
        for (const [key, title] of Object.entries(labels)) fields[key] = input(box, title, 'xcm-template-' + key, M.settings.roomTemplate[key], key === 'r_disclaimer' ? 'textarea' : 'text');
        const actions = el('div', null, {class: 'xcm-actions'});
        const feedback = el('p', '', {role: 'status'});
        actions.appendChild(button('Uložit předvolbu místnosti', () => { for (const key of Object.keys(fields)) M.settings.roomTemplate[key] = fields[key].value; feedback.textContent = saveSettings() ? 'Předvolba uložena.' : M.storageWarning; }));
        const actual = document.querySelector('form [name="r_name"], form #r_name')?.closest('form');
        if (actual) actions.appendChild(button('Vyplnit novou místnost', () => {
            let filled = 0;
            for (const [key, field] of Object.entries(fields)) {
                const target = actual.querySelector(`[name="${key}"], #${key}`);
                if (!target) continue;
                target.value = field.value; target.dispatchEvent(new Event('input', {bubbles: true})); target.dispatchEvent(new Event('change', {bubbles: true})); filled++;
            }
            M.notice = `Vyplněno ${filled} dostupných polí. Formulář odešli ručně.`; feedback.textContent = M.notice; M.updateStatus();
        }));
        else box.appendChild(el('p', 'Předvolbu lze použít na stránce s formulářem nové místnosti, pokud mobilní web nabídne odpovídající pole. Samotná místnost se automaticky nevytváří.'));
        box.append(actions, feedback);
    }
    function installStyle() {
        if (!document.querySelector('meta[name="viewport"]')) document.head.appendChild(el('meta', null, {name: 'viewport', content: 'width=device-width, initial-scale=1'}));
        if (!document.getElementById('xcm-style')) document.head.appendChild(el('style', css, {id: 'xcm-style'}));
    }
    function installUI() {
        installStyle();
        const panel = el('details', null, {id: 'xcm-settings'});
        panel.open = M.read('panelOpen', false);
        M.summary = el('summary', 'Nastavení XChatu · mobil'); panel.appendChild(M.summary);
        M.sections = el('div', null, {class: 'xcm-sections'}); panel.appendChild(M.sections);
        M.page.form.after(panel); M.panel = panel;
        panel.addEventListener('toggle', () => M.write('panelOpen', panel.open));
        panel.addEventListener('click', event => event.stopPropagation());
        buildAutomatic(); buildExport(); buildVisibility(); buildAudio(); buildReadMarker(); buildRoomTemplate();
        const notice = status(M.sections, 'xcm-notice'); notice.setAttribute('role', 'status');
        status(M.sections, 'xcm-storage');
        M.board = el('div', null, {id: 'xcm-board'}); M.page.area.after(M.board); M.page.area.hidden = true;
        M.board.addEventListener('click', event => {
            if (!M.settings.readLine || event.ctrlKey || event.altKey || event.shiftKey || event.metaKey || event.button > 0) return;
            if (window.getSelection?.()?.toString() || event.target.closest('a, button, input, select, textarea')) return;
            const row = event.target.closest('.xcm-row'); if (!row) return;
            M.updateRoom({readMarker: row.dataset.id}); M.renderMessages();
        });
        M.renderMessages(); M.updateStatus();
    }
    function renderMessages() {
        if (!M.board) return;
        const scrollY = window.scrollY || 0;
        const anchor = scrollY > 20 ? Array.from(M.board.children).find(row => row.classList.contains('xcm-row') && row.getBoundingClientRect().bottom > 0) : null;
        const top = anchor?.getBoundingClientRect().top; const anchorId = anchor?.dataset.id;
        const rows = (M.settings.showAll ? M.archive : M.snapshot).slice().reverse();
        const marker = M.state().readMarker;
        const fragment = document.createDocumentFragment(); let markerShown = false;
        for (const row of rows) {
            if (M.settings.hideAds && row.advert || M.settings.hideSystem && row.systemWhisper) continue;
            if (M.settings.readLine && marker === row.id) { fragment.appendChild(el('div', '↑ Nepřečtené · Přečtené ↓', {class: 'xcm-read-marker'})); markerShown = true; }
            const article = el('div', null, {class: 'xcm-row', 'data-id': row.id});
            const personal = M.personal(row);
            if (M.settings.highlight) { article.classList.toggle('xcm-mention', personal.mention); article.classList.toggle('xcm-whisper', personal.whisper); }
            article.innerHTML = row.html; // Sanitized on parsing or loading from storage.
            article.prepend(el('small', row.day, {class: 'xcm-day'})); fragment.appendChild(article);
        }
        M.board.replaceChildren(fragment);
        if (anchorId) {
            const replacement = Array.from(M.board.children).find(node => node.dataset.id === anchorId);
            if (replacement) window.scrollBy?.(0, replacement.getBoundingClientRect().top - top);
        }
        const readStatus = document.getElementById('xcm-read-status');
        if (readStatus) readStatus.textContent = !M.settings.readLine ? 'Čára je vypnutá.' : !marker ? 'Čára zatím není umístěná.' : markerShown ? 'Čára je umístěná.' : 'Čára je mimo výpis nebo u skryté zprávy.';
        document.querySelectorAll('.umsg_advert, .advert').forEach(node => { if (!node.closest('#xcm-settings, #xcm-board')) node.hidden = M.settings.hideAds; });
        M.updateStatus?.();
    }
    function duration(ms) { const seconds = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; }
    function updateStatus() {
        const set = (id, text) => { const node = document.getElementById(id); if (node && node.textContent !== text) node.textContent = text; };
        if (!M.page) return;
        const s = M.state(); const left = (s.lastActivity || Date.now()) + M.settings.intervalMinutes * 60000 - Date.now();
        let state = !M.settings.autoSend ? 'Automatické /s je vypnuté.' : s.blocked ? 'Automatické /s je pozastavené po nepotvrzeném požadavku.' : s.pending ? 'Čekám na potvrzení odeslání…' : document.hidden ? 'Karta není aktivní; odpočet se ověří po návratu.' : M.page.field.value ? 'Rozepsaná zpráva: automatické /s čeká.' : navigator.onLine === false ? 'Čekám na připojení.' : `Další /s za ${duration(left)} · interval ${M.settings.intervalMinutes} min.`;
        set('xcm-countdown', state);
        set('xcm-network', M.busy ? 'Probíhá požadavek…' : M.lastRead ? `Zprávy naposledy načteny ${new Date(M.lastRead).toLocaleTimeString('cs-CZ')}.` : 'Zobrazen původní výpis stránky.');
        set('xcm-notice', M.notice || ''); set('xcm-storage', M.storageWarning || '');
        set('xcm-archive-count', `Uloženo ${M.archive?.length || 0} / ${M.settings.archiveLimit} zpráv. Pro export: ${M.exportRecords?.().length || 0}.` + (M.archiveTrimmed ? ' Nejstarší zprávy nad limit byly odstraněny.' : '') + (M.archiveUnsaved ? ' Poslední historii se nepodařilo uložit.' : ''));
        for (const kind of ['message', 'arrival', 'departure']) set('xcm-audio-' + kind, M.audioStatus[kind] || 'Pro přehrávání použij Povolit zvuky nebo Test.');
        if (M.resumeButton) M.resumeButton.hidden = !s.blocked;
        if (M.summary) M.summary.textContent = 'Nastavení XChatu · mobil' + (M.settings.autoSend && !s.blocked ? ` · /s ${duration(left)}` : '');
    }
    Object.assign(M, {el, input, button, installStyle, installUI, renderMessages, updateStatus, saveSettings, buildRoomTemplate});
})(M);
