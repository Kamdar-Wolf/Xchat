// ==UserScript==
// @name         XChat – Čas neaktivity a export chatu
// @namespace    kamdar.xchat.tools
// @version      2.4.1
// @description  Export živého chatu i historie, filtry uživatelů a šeptání.
// @match        https://www.xchat.cz/*
// @run-at       document-idle
// @grant        none
// @noframes
// @homepageURL  https://github.com/Martin-CHT/Xchat/
// @updateURL    https://github.com/Martin-CHT/Xchat/raw/refs/heads/main/export.user.js
// @downloadURL  https://github.com/Martin-CHT/Xchat/raw/refs/heads/main/export.user.js
// ==/UserScript==

(() => {
    'use strict';

    // ============================================================
    //                         NASTAVENÍ
    // ============================================================

    const IDLE_LIMIT_SECONDS = 600; // 600 = 10 minut
    const AUTO_COMMAND = '/S';

    const IS_HISTORY = /\/room\/history\.html\/?$/.test(
        location.pathname
    );

    const archive = new Map();

    let board = null;
    let observer = null;
    let idleHandled = false;
    let historySnapshot = null;

    // ============================================================
    //                       POMOCNÉ FUNKCE
    // ============================================================

    function normalize(value) {
        return String(value)
            .normalize('NFC')
            .replace(/\u00a0/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function getDocuments(startWindow = window) {
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

        visit(startWindow);
        return documents;
    }

    function findElement(selector, documents = getDocuments()) {
        for (const doc of documents) {
            try {
                const element = doc.querySelector(selector);
                if (element) return element;
            } catch {}
        }

        return null;
    }

    function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, char => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
        }[char]));
    }

    function escapeMarkdown(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/[\\`*_{}\[\]()#+.!|~-]/g, '\\$&');
    }

    function safeUrl(value, base) {
        if (!value) return null;

        try {
            const url = new URL(value, base);
            return ['https:', 'http:'].includes(url.protocol)
                ? url.href
                : null;
        } catch {
            return null;
        }
    }

    function imageDescription(img) {
        return img.getAttribute('alt')?.trim()
            || img.getAttribute('title')?.trim()
            || 'smajlík/obrázek';
    }

    function readableText(element) {
        const copy = element.cloneNode(true);

        copy.querySelectorAll('script, style').forEach(el => el.remove());

        copy.querySelectorAll('br').forEach(el => {
            el.replaceWith(copy.ownerDocument.createTextNode('\n'));
        });

        copy.querySelectorAll('img').forEach(img => {
            img.replaceWith(
                copy.ownerDocument.createTextNode(
                    `[${imageDescription(img)}]`
                )
            );
        });

        return copy.textContent
            .replace(/\u00a0/g, ' ')
            .replace(/\r\n?/g, '\n')
            .trim();
    }

    function backgroundOf(element) {
        const win = element.ownerDocument.defaultView;

        for (let el = element; el; el = el.parentElement) {
            const color = win.getComputedStyle(el).backgroundColor;

            if (
                color
                && color !== 'transparent'
                && color !== 'rgba(0, 0, 0, 0)'
            ) {
                return color;
            }
        }

        return '#ffffff';
    }

    // ============================================================
    //                       HLÍDÁNÍ ČASU
    // ============================================================

    function checkIdle(documents) {
        // Okno historie nic automaticky neodesílá.
        if (IS_HISTORY) return;

        const idle = findElement('#idleWrapper #idle', documents)
            || findElement('#idle', documents);

        if (!idle) return;

        const match = idle.textContent.trim().match(
            /^(\d+):([0-5]\d)(?::([0-5]\d))?$/
        );

        if (!match) return;

        const seconds = match[3] !== undefined
            ? Number(match[1]) * 3600
                + Number(match[2]) * 60
                + Number(match[3])
            : Number(match[1]) * 60 + Number(match[2]);

        if (seconds <= IDLE_LIMIT_SECONDS) {
            idleHandled = false;
            return;
        }

        if (idleHandled) return;

        const field = findElement(
            'form[name="f"] input#msg[name="textarea"]',
            documents
        );

        if (!field || field.disabled || field.readOnly) return;
        if (field.value !== '') return;

        const button = field.form?.querySelector(
            'input[type="submit"][name="submit_text"]'
        );

        if (!button || button.disabled) return;

        idleHandled = true;

        try {
            const win = field.ownerDocument.defaultView;
            field.value = AUTO_COMMAND;

            field.dispatchEvent(
                new win.Event('input', { bubbles: true })
            );
            field.dispatchEvent(
                new win.Event('change', { bubbles: true })
            );

            button.click();
        } catch (error) {
            console.error('XChat: odeslání příkazu selhalo.', error);
        }
    }

    // ============================================================
    //                     BARVY HTML EXPORTU
    // ============================================================

    function coloredHtml(element) {
        const doc = element.ownerDocument;
        const win = doc.defaultView;

        function render(node) {
            if (node.nodeType === 3) {
                return escapeHtml(node.nodeValue || '');
            }

            if (node.nodeType !== 1) return '';

            const tag = node.tagName.toLowerCase();

            if (['script', 'style', 'iframe', 'object'].includes(tag)) {
                return '';
            }

            if (tag === 'br') return '<br>';

            const style = win.getComputedStyle(node);
            if (style.display === 'none') return '';

            const css = [
                `color:${style.color}`,
                `font-weight:${style.fontWeight}`,
                `font-style:${style.fontStyle}`,
                `text-decoration-line:${style.textDecorationLine}`,
            ].join(';');

            if (tag === 'img') {
                const src = safeUrl(
                    node.getAttribute('src'),
                    doc.baseURI
                );

                if (!src) {
                    return escapeHtml(`[${imageDescription(node)}]`);
                }

                return `<img class="chat-image"`
                    + ` src="${escapeHtml(src)}"`
                    + ` alt="${escapeHtml(imageDescription(node))}"`
                    + ' loading="lazy" referrerpolicy="no-referrer">';
            }

            const content = Array.from(node.childNodes)
                .map(render)
                .join('');

            if (tag === 'a') {
                const href = safeUrl(
                    node.getAttribute('href'),
                    doc.baseURI
                );

                if (href) {
                    return `<a href="${escapeHtml(href)}"`
                        + ` style="${escapeHtml(css)}"`
                        + ' target="_blank" rel="noopener noreferrer">'
                        + content + '</a>';
                }
            }

            return `<span style="${escapeHtml(css)}">`
                + content + '</span>';
        }

        const children = Array.from(element.childNodes);

        while (children.length) {
            const last = children[children.length - 1];

            if (
                (last.nodeType === 3 && !last.nodeValue.trim())
                || (last.nodeType === 1 && last.tagName === 'BR')
            ) {
                children.pop();
            } else {
                break;
            }
        }

        const color = win.getComputedStyle(element).color;

        return `<span style="color:${escapeHtml(color)}">`
            + children.map(render).join('')
            + '</span>';
    }

    // ============================================================
    //                  ROZPOZNÁNÍ JEDNÉ ZPRÁVY
    // ============================================================

    function parseParticipants(row, content, type) {
        if (type === 'Systémová událost' || type === 'Reklama') {
            return { sender: '', recipient: '', whisper: false };
        }

        const bold = row.querySelector('b, strong');
        const label = normalize(bold?.textContent || '');

        const header = label.endsWith(':')
            && normalize(content).startsWith(label)
            ? label
            : normalize(content);

        const whisper = header.match(
            /^(.{1,80}?)\s*(?:->|→)\s*(.{1,80}?)\s*:/
        );

        if (whisper) {
            return {
                sender: normalize(whisper[1]),
                recipient: normalize(whisper[2]),
                whisper: true,
            };
        }

        const normal = header.match(/^([^\s:<>]{1,80})\s*:/);

        return {
            sender: normal ? normalize(normal[1]) : '',
            recipient: '',
            whisper: false,
        };
    }

    function parseRow(row) {
        if (row.id === 'splash') return null;

        const fullText = readableText(row);
        const match = fullText.match(/^(\d{1,2}:\d{2}:\d{2})\s*/);

        if (!match) return null;

        let type = 'Zpráva';

        if (row.querySelector('.umsg_advert, .advert')) {
            type = 'Reklama';
        } else if (row.querySelector('.umsg_wsystem')) {
            type = 'Systémová odpověď';
        } else if (row.querySelector('.systemtext')) {
            type = 'Systémová událost';
        }

        const text = fullText.slice(match[0].length);

        return {
            time: match[1],
            type,
            text,
            fullText,
            ...parseParticipants(row, text, type),
            links: Array.from(row.querySelectorAll('a[href]')).map(a => ({
                text: a.textContent.trim(),
                href: a.getAttribute('href') || '',
            })),
            images: Array.from(row.querySelectorAll('img')).map(img =>
                img.getAttribute('src') || ''
            ),
        };
    }

    // ============================================================
    //                    ARCHIV BEZ DUPLICIT
    // ============================================================

    function archiveRows(rows, background = null) {
        const occurrences = new Map();

        for (const row of rows) {
            const data = parseRow(row);
            if (!data) continue;

            const signature = JSON.stringify([
                data.time,
                data.type,
                data.fullText,
                data.links,
                data.images,
            ]);

            const occurrence = (occurrences.get(signature) || 0) + 1;
            occurrences.set(signature, occurrence);

            const key = JSON.stringify([signature, occurrence]);
            const existing = archive.get(key);

            if (existing) {
                if (!IS_HISTORY && existing.sourceRow !== row) {
                    existing.html = coloredHtml(row);
                    existing.background = backgroundOf(row);
                    existing.sourceRow = row;
                }
                continue;
            }

            archive.set(key, {
                ...data,
                html: coloredHtml(row),
                background: background || backgroundOf(row),
                sourceRow: IS_HISTORY ? null : row,
            });
        }

        updateCounter();
    }

    function updateCounter() {
        const counter = findElement(
            '#xchat-export-controls .xchat-export-count'
        );

        if (counter) {
            counter.textContent = ` (${archive.size} zpráv)`;
        }
    }

    // ============================================================
    //                      NAČÍTÁNÍ HISTORIE
    // ============================================================

    function timeSeconds(value) {
        const parts = value.split(':').map(Number);
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }

    function newestFirst(rows) {
        let previous = null;

        for (const row of rows) {
            const match = readableText(row).match(
                /^(\d{1,2}:\d{2}:\d{2})/
            );

            if (!match) continue;

            const current = timeSeconds(match[1]);

            if (previous !== null && current !== previous) {
                // Zohlední i přechod přes půlnoc.
                const forward = (current - previous + 86400) % 86400;
                return forward > 43200;
            }

            previous = current;
        }

        return true;
    }

    function captureHistory() {
        if (!document.body) return;

        // Historie z přílohy: font[face] > font[size],
        // jednotlivé zprávy jsou oddělené přímými <br>.
        const root = document.body.querySelector('font[face] > font')
            || document.body.querySelector('font[face]');

        if (!root) return;

        const snapshot = root.innerHTML;
        if (snapshot === historySnapshot) return;

        const holder = document.createElement('div');
        const style = getComputedStyle(root);
        const background = backgroundOf(root);

        holder.style.cssText =
            'position:absolute;left:-100000px;top:0;'
            + 'visibility:hidden;pointer-events:none;';

        holder.style.color = style.color;
        holder.style.fontFamily = style.fontFamily;
        holder.style.fontSize = style.fontSize;
        holder.style.backgroundColor = background;

        const children = Array.from(root.childNodes);
        let start = 0;

        function addSegment(end) {
            if (end <= start) return;

            const range = document.createRange();
            range.setStart(root, start);
            range.setEnd(root, end);

            const row = document.createElement('div');
            row.appendChild(range.cloneContents());

            if (/^\d{1,2}:\d{2}:\d{2}/.test(readableText(row))) {
                holder.appendChild(row);
            }
        }

        for (let index = 0; index < children.length; index++) {
            const node = children[index];

            if (node.nodeType === 1 && node.tagName === 'BR') {
                addSegment(index);
                start = index + 1;
            }
        }

        addSegment(children.length);

        document.body.appendChild(holder);

        try {
            const rows = Array.from(holder.children);

            if (newestFirst(rows)) rows.reverse();

            archiveRows(rows, background);
            historySnapshot = snapshot;
        } finally {
            holder.remove();
        }
    }

    // ============================================================
    //                     NAČÍTÁNÍ ŽIVÉHO CHATU
    // ============================================================

    function captureBoard() {
        if (!board?.isConnected) return;
        archiveRows(Array.from(board.children).reverse());
    }

    function attachBoard(documents) {
        const nextBoard = findElement('#board', documents);
        if (!nextBoard || nextBoard === board) return;

        observer?.disconnect();
        board = nextBoard;
        captureBoard();

        const Observer = board.ownerDocument.defaultView.MutationObserver;
        observer = new Observer(captureBoard);

        observer.observe(board, {
            childList: true,
            subtree: true,
            characterData: true,
        });
    }

    // ============================================================
    //                       EXPORTNÍ SOUBORY
    // ============================================================

    function exportInfo() {
        let documents = getDocuments();

        // Historie může převzít název a ID místnosti z původního okna.
        if (IS_HISTORY) {
            try {
                if (window.opener && !window.opener.closed) {
                    documents = documents.concat(
                        getDocuments(window.opener.top)
                    );
                }
            } catch {}
        }

        const idle = findElement('#idleWrapper', documents);

        return {
            room: idle?.ownerDocument
                .querySelector('a[href^="javascript:roominfo"]')
                ?.textContent.trim()
                || (IS_HISTORY ? 'Historie XChatu' : 'XChat'),
            roomId: findElement(
                'form[name="f"] input[name="rid"]',
                documents
            )?.value || 'historie',
            exportedAt: new Date().toISOString(),
        };
    }

    function makeTxt(info, messages) {
        const header = [
            `VÝPIS CHATU – ${info.room}`,
            `ID místnosti: ${info.roomId}`,
            `Export: ${info.exportedAt}`,
            `Počet zpráv: ${messages.length}`,
            '',
        ].join('\n');

        return '\uFEFF' + header + messages.map(record =>
            `[${record.time}] ${record.text}`
        ).join('\n');
    }

    function makeMarkdown(info, messages) {
        const md = escapeMarkdown;

        const header = [
            `# Výpis chatu – ${md(info.room)}`,
            '',
            `- ID místnosti: ${md(info.roomId)}`,
            `- Export: ${md(info.exportedAt)}`,
            `- Počet zpráv: ${messages.length}`,
            '',
            '---',
            '',
        ].join('\n');

        return header + messages.map(record =>
            `**${record.time}** ${md(record.text).replace(/\n/g, '  \n')}`
        ).join('  \n') + '\n';
    }

    function makeHtml(info, messages) {
        const esc = escapeHtml;
        const background = messages.at(-1)?.background || '#ffffff';

        const rows = [...messages].reverse().map(record => {
            const small = record.type === 'Systémová událost'
                ? ' system-event'
                : '';

            return `<div class="chat-row${small}"`
                + ` data-sender="${esc(record.sender)}"`
                + ` data-recipient="${esc(record.recipient)}"`
                + ` data-whisper="${record.whisper ? '1' : '0'}"`
                + ` title="${esc(record.type)}"`
                + ` style="background-color:${esc(record.background)}">`
                + record.html + '</div>';
        }).join('\n');

        return `<!doctype html>
<html lang="cs">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>XChat – ${esc(info.room)}</title>
<style>
    * { box-sizing: border-box; }
    body {
        margin: 0;
        padding: 12px 14px;
        color: #000;
        background: ${esc(background)};
        font: 16px/1.35 Arial, Helvetica, sans-serif;
    }
    .metadata {
        font-size: 12px;
        margin-bottom: 10px;
        color: #333;
    }
    .metadata strong { font-size: 15px; }
    .filters {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px 16px;
        margin-bottom: 12px;
        padding: 8px 0;
        border-top: 1px solid #999;
        border-bottom: 1px solid #999;
        font-size: 13px;
    }
    .filters label {
        display: flex;
        align-items: center;
        gap: 6px;
        max-width: 100%;
    }
    select {
        padding: 4px;
        font: inherit;
        max-width: 100%;
        min-width: 0;
    }
    .chat-row {
        margin: 0;
        padding: 1px 0;
        overflow-wrap: anywhere;
        white-space: pre-wrap;
    }
    .system-event {
        font-size: 12px;
        padding: 3px 0;
    }
    .chat-image {
        max-width: 100%;
        max-height: 32px;
        vertical-align: middle;
    }
    [hidden] { display: none !important; }
    @media print {
        .filters { display: none; }
        .chat-row { break-inside: avoid; }
    }
</style>
</head>
<body>
<div class="metadata">
<strong>${esc(info.room)}</strong>
 · ID ${esc(info.roomId)}
 · Export ${esc(new Date(info.exportedAt).toLocaleString('cs-CZ'))}
 · Nejnovější zprávy nahoře
</div>

<div class="filters">
<label>
    Uživatel:
    <select id="user-filter">
        <option value="">Všichni uživatelé</option>
    </select>
</label>
<label>
    Šeptání:
    <select id="whisper-filter">
        <option value="">Všechny zprávy</option>
        <option value="only">Pouze šeptání</option>
    </select>
</label>
<span id="visible-count" role="status" aria-live="polite"></span>
</div>

<div id="transcript">${rows}</div>

<script>
(() => {
    'use strict';

    const rows = Array.from(
        document.querySelectorAll('#transcript > .chat-row')
    );

    const userFilter = document.getElementById('user-filter');
    const whisperFilter = document.getElementById('whisper-filter');
    const counter = document.getElementById('visible-count');

    const lower = value => value.normalize('NFC').toLocaleLowerCase();
    const users = new Map();
    const pairs = new Map();

    function pairKey(sender, recipient) {
        return JSON.stringify([
            lower(sender),
            lower(recipient)
        ].sort());
    }

    for (const row of rows) {
        const sender = row.dataset.sender;
        const recipient = row.dataset.recipient;

        for (const nick of [sender, recipient]) {
            if (nick && !users.has(lower(nick))) {
                users.set(lower(nick), nick);
            }
        }

        if (row.dataset.whisper === '1' && sender && recipient) {
            const key = pairKey(sender, recipient);

            if (!pairs.has(key)) {
                pairs.set(
                    key,
                    [sender, recipient]
                        .sort((a, b) => a.localeCompare(b, 'cs'))
                        .join(' ↔ ')
                );
            }
        }
    }

    function addOption(select, value, label) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        select.appendChild(option);
    }

    [...users.entries()]
        .sort((a, b) => a[1].localeCompare(b[1], 'cs'))
        .forEach(([value, label]) => {
            addOption(userFilter, value, label);
        });

    [...pairs.entries()]
        .sort((a, b) => a[1].localeCompare(b[1], 'cs'))
        .forEach(([value, label]) => {
            addOption(whisperFilter, value, label);
        });

    function applyFilters() {
        let visible = 0;

        for (const row of rows) {
            const sender = row.dataset.sender;
            const recipient = row.dataset.recipient;
            const whisper = row.dataset.whisper === '1';

            const userMatches = !userFilter.value
                || lower(sender) === userFilter.value
                || lower(recipient) === userFilter.value;

            const selectedWhisper = whisperFilter.value;

            const whisperMatches = !selectedWhisper
                || (
                    selectedWhisper === 'only'
                    ? whisper
                    : whisper
                        && pairKey(sender, recipient) === selectedWhisper
                );

            row.hidden = !(userMatches && whisperMatches);
            if (!row.hidden) visible++;
        }

        counter.textContent =
            'Zobrazeno ' + visible + ' / ' + rows.length + ' zpráv';
    }

    userFilter.addEventListener('change', applyFilters);
    whisperFilter.addEventListener('change', applyFilters);

    applyFilters();
})();
</script>
</body>
</html>`;
    }

    function download(format) {
        if (IS_HISTORY) {
            captureHistory();
        } else {
            attachBoard(getDocuments());
            captureBoard();
        }

        const messages = Array.from(archive.values());

        if (!messages.length) {
            alert('Zatím nebyly rozpoznány žádné zprávy.');
            return;
        }

        const info = exportInfo();

        const formats = {
            txt: [makeTxt, 'text/plain;charset=utf-8'],
            md: [makeMarkdown, 'text/markdown;charset=utf-8'],
            html: [makeHtml, 'text/html;charset=utf-8'],
        };

        const [makeContent, mime] = formats[format];
        const blob = new Blob([makeContent(info, messages)], {
            type: mime,
        });

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');

        const stamp = info.exportedAt
            .replace(/[:.]/g, '-')
            .replace('T', '_');

        const roomId = info.roomId.replace(/[^a-zA-Z0-9_-]/g, '_');

        link.href = url;
        link.download = `XChat_${roomId}_${stamp}.${format}`;

        document.documentElement.appendChild(link);
        link.click();
        link.remove();

        setTimeout(() => URL.revokeObjectURL(url), 10000);
    }

    // ============================================================
    //                  ODKAZY PRO STAŽENÍ NA STRÁNCE
    // ============================================================

    function fillControls(controls, doc) {
        [
            ['TXT', 'txt'],
            ['Markdown', 'md'],
            ['HTML', 'html'],
        ].forEach(([label, format], index) => {
            if (index) {
                controls.appendChild(doc.createTextNode(' · '));
            }

            const link = doc.createElement('a');
            link.href = '#';
            link.textContent = label;
            link.title = `Stáhnout chat jako ${label}`;

            link.addEventListener('click', event => {
                event.preventDefault();
                download(format);
            });

            controls.appendChild(link);
        });

        const counter = doc.createElement('span');
        counter.className = 'xchat-export-count';
        counter.textContent = ` (${archive.size} zpráv)`;
        controls.appendChild(counter);
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

    function installLinks(documents) {
        if (IS_HISTORY) {
            if (!document.body) return;
            if (document.getElementById('xchat-export-controls')) return;

            const controls = document.createElement('div');
            controls.id = 'xchat-export-controls';
            controls.style.cssText =
                'position:sticky;top:0;z-index:10000;'
                + 'padding:8px 12px;margin-bottom:12px;'
                + 'background:#f5f5f5;color:#222;'
                + 'border-bottom:1px solid #999;'
                + 'font:14px Arial,sans-serif;';

            controls.appendChild(
                document.createTextNode('Stáhnout historii: ')
            );

            fillControls(controls, document);
            document.body.prepend(controls);
            return;
        }

        const panel = settingsSection(documents, 'export', 'Export chatu', 10);
        if (!panel) return;
        const doc = panel.ownerDocument;
        if (doc.getElementById('xchat-export-controls')) return;

        const controls = doc.createElement('span');
        controls.id = 'xchat-export-controls';
        controls.style.cssText =
            'display:flex;flex-direction:column;align-items:flex-start;gap:6px;white-space:normal;';

        fillControls(controls, doc);
        panel.appendChild(controls);
    }

    function tick() {
        const documents = getDocuments();

        try {
            checkIdle(documents);
        } catch (error) {
            console.error('XChat: chyba hlídání času.', error);
        }

        try {
            if (IS_HISTORY) {
                captureHistory();
            } else {
                attachBoard(documents);
                captureBoard();
            }

            installLinks(documents);
            updateCounter();
        } catch (error) {
            console.error('XChat: chyba zachytávání chatu.', error);
        }
    }

    setInterval(tick, 1000);
    tick();
})();