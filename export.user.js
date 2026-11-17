// ==UserScript==
// @name         XChat – Čas neaktivity a export chatu
// @namespace    kamdar.xchat.tools
// @version      2.6.0
// @description  Nastavitelný interval automatického /S, export živého chatu i historie, filtry uživatelů a šeptání.
// @match        https://www.xchat.cz/*
// @run-at       document-idle
// @grant        none
// @noframes
// @homepageURL  https://github.com/Kamdar-Wolf/Xchat/
// @updateURL    https://github.com/Kamdar-Wolf/Xchat/raw/refs/heads/main/export.user.js
// @downloadURL  https://github.com/Kamdar-Wolf/Xchat/raw/refs/heads/main/export.user.js
// ==/UserScript==

(() => {
    'use strict';

    // ============================================================
    //                         NASTAVENÍ
    // ============================================================

    const DEFAULT_IDLE_INTERVAL_MINUTES = 10;
    const IDLE_INTERVAL_KEY = 'kamdar.xchat.idleIntervalMinutes';
    let idleIntervalMinutes = DEFAULT_IDLE_INTERVAL_MINUTES;
    try {
        idleIntervalMinutes = parseIdleInterval(localStorage.getItem(IDLE_INTERVAL_KEY))
            ?? DEFAULT_IDLE_INTERVAL_MINUTES;
    } catch {}
    const AUTO_COMMAND = '/S';
    const PRESENCE_FILTER_KEY = 'kamdar.xchat.export.hidePresence';
    let hidePresence = false;
    try { hidePresence = localStorage.getItem(PRESENCE_FILTER_KEY) === '1'; } catch {}

    // Pouze příchody/odchody systémového původu. Text běžných zpráv nefiltrujeme.
    const PRESENCE_PATTERN = /(?:vstoupil[ao]?|vešel|vešla|přišel|přišla)\s+(?:do\s+)?místnosti|připojil[ao]?\s+se\s+(?:do|k)\s+místnosti|opustil[ao]?\s+místnost|(?:odešel|odešla|vystoupil[ao]?)\s+(?:z|ze)\s+místnosti|odpojil[ao]?\s+se|(?:byl|byla)\s+(?:vyhozen|vyhozena|odpojen|odpojena)/iu;

    function exportMessages(messages) {
        return hidePresence ? messages.filter(record => !record.presenceEvent) : messages;
    }

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

    function parseIdleInterval(value) {
        const minutes = Number(value);
        return Number.isSafeInteger(minutes) && minutes >= 1
            && Number.isSafeInteger(minutes * 60) ? minutes : null;
    }

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

        if (seconds < idleIntervalMinutes * 60) {
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
            presenceEvent: type === 'Systémová událost' && (
                Boolean(row.querySelector('.system.in, .system.out')) || PRESENCE_PATTERN.test(text)
            ),
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
            counter.textContent = hidePresence
                ? ` (${exportMessages(Array.from(archive.values())).length} / ${archive.size} zpráv)`
                : ` (${archive.size} zpráv)`;
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
                + ` data-presence="${record.presenceEvent ? '1' : '0'}"`
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
<label><input type="checkbox" id="presence-filter"> Skrýt příchody a odchody</label>
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
    const presenceFilter = document.getElementById('presence-filter');
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

            const presenceMatches = !presenceFilter.checked || row.dataset.presence !== '1';
            row.hidden = !(userMatches && whisperMatches && presenceMatches);
            if (!row.hidden) visible++;
        }

        counter.textContent =
            'Zobrazeno ' + visible + ' / ' + rows.length + ' zpráv';
    }

    userFilter.addEventListener('change', applyFilters);
    whisperFilter.addEventListener('change', applyFilters);
    presenceFilter.addEventListener('change', applyFilters);

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

        // Jediný filtr před sestavením TXT, Markdownu i HTML; archiv zůstává úplný.
        const messages = exportMessages(Array.from(archive.values()));

        if (!messages.length) {
            alert(archive.size ? 'Po vynechání příchodů a odchodů nezůstaly žádné zprávy.' : 'Zatím nebyly rozpoznány žádné zprávy.');
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
            // Exportní formáty jsou vedle sebe; bez samostatných oddělovačů.

            const link = doc.createElement('a');
            link.href = '#';
            link.style.marginRight = '6px';
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

        const label = doc.createElement('label');
        label.style.cssText = 'display:flex!important;align-items:center;gap:5px;flex-basis:100%;font-size:11px;';
        const checkbox = doc.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'xchat-export-hide-presence';
        checkbox.checked = hidePresence;
        checkbox.style.cssText = 'width:auto;height:auto;flex:none;';
        label.append(checkbox, doc.createTextNode('Vynechat příchody a odchody'));
        label.title = 'Platí pro TXT, Markdown i HTML. Ostatní systémové události a zprávy zůstanou zachované.';
        checkbox.addEventListener('change', () => {
            hidePresence = checkbox.checked;
            try { localStorage.setItem(PRESENCE_FILTER_KEY, hidePresence ? '1' : '0'); } catch {}
            for (const target of getDocuments()) {
                for (const input of target.querySelectorAll('.xchat-export-hide-presence')) input.checked = hidePresence;
            }
            updateCounter();
        });
        controls.appendChild(label);
        updateCounter();
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

    function installIdleSettings(documents) {
        if (IS_HISTORY) return;
        const panel = settingsSection(documents, 'idle', 'Automatická aktualizace', 5);
        if (!panel || panel.querySelector('#xchat-idle-interval')) return;
        const doc = panel.ownerDocument;

        const label = doc.createElement('label');
        label.htmlFor = 'xchat-idle-interval';
        label.textContent = 'Interval neaktivity (minuty):';

        const input = doc.createElement('input');
        input.id = 'xchat-idle-interval';
        input.type = 'number';
        input.min = '1';
        input.step = '1';
        input.required = true;
        input.value = String(idleIntervalMinutes);
        input.setAttribute('aria-describedby', 'xchat-idle-help xchat-idle-status');

        const save = doc.createElement('button');
        save.type = 'button';
        save.textContent = 'Uložit';
        const actions = doc.createElement('div');
        actions.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:5px;';
        actions.append(input, save);

        const help = doc.createElement('p');
        help.id = 'xchat-idle-help';
        help.textContent = 'Po dosažení intervalu neaktivity odešle /S. Rozepsanou zprávu nepřeruší. Změna platí ihned podle aktuální doby neaktivity.';
        const status = doc.createElement('p');
        status.id = 'xchat-idle-status';
        status.setAttribute('aria-live', 'polite');
        status.textContent = `Aktivní interval: ${idleIntervalMinutes} min.`;

        function saveInterval() {
            const minutes = parseIdleInterval(input.value);
            if (minutes === null) {
                input.setAttribute('aria-invalid', 'true');
                status.textContent = `Zadej kladný celý počet minut. Aktivní interval zůstává ${idleIntervalMinutes} min.`;
                return;
            }
            input.removeAttribute('aria-invalid');
            idleIntervalMinutes = minutes;
            input.value = String(minutes);
            // Zachováme idleHandled: změna nastavení nesmí opakovat již odeslané /S.
            try {
                localStorage.setItem(IDLE_INTERVAL_KEY, String(minutes));
                status.textContent = `Uloženo. Aktivní interval: ${minutes} min.`;
            } catch {
                status.textContent = `Aktivní interval: ${minutes} min. Prohlížeč nepovolil uložení; platí jen do obnovení stránky.`;
            }
        }
        save.addEventListener('click', saveInterval);
        input.addEventListener('keydown', event => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            event.stopPropagation();
            saveInterval();
        });
        panel.append(label, actions, help, status);
    }

    function tick() {
        const documents = getDocuments();

        try {
            checkIdle(documents);
            installIdleSettings(documents);
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
