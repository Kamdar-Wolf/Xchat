((M) => {
    const arrival = /(?:vstoupil[ao]?|vešel|vešla|přišel|přišla)\s+(?:do\s+)?místnosti|připojil[ao]?\s+se\s+(?:do|k)\s+místnosti/iu;
    const departure = /opustil[ao]?\s+místnost|(?:odešel|odešla|vystoupil[ao]?)\s+(?:z|ze)\s+místnosti|odpojil[ao]?\s+se|(?:byl|byla)\s+(?:vyhozen|vyhozena|odpojen|odpojena)/iu;
    function sanitize(node, base) {
        if (node.nodeType === 3) return M.escape(node.nodeValue);
        if (node.nodeType !== 1) return '';
        const tag = node.tagName.toLowerCase();
        if (['script', 'style', 'iframe', 'object', 'form', 'input', 'button', 'svg', 'math'].includes(tag)) return '';
        const content = Array.from(node.childNodes).map(child => sanitize(child, base)).join('');
        if (tag === 'br') return '<br>';
        if (tag === 'img') {
            const url = M.safeURL(node.getAttribute('src'), base);
            return url ? `<img src="${M.escape(url)}" alt="${M.escape(node.getAttribute('alt') || 'obrázek')}" loading="lazy" referrerpolicy="no-referrer">` : M.escape(node.getAttribute('alt') || '');
        }
        if (tag === 'a') {
            const url = M.safeURL(node.getAttribute('href'), base);
            return url ? `<a href="${M.escape(url)}" target="_blank" rel="noopener noreferrer">${content}</a>` : content;
        }
        const safeTag = ['b', 'strong', 'i', 'em', 'u', 's', 'small', 'span', 'font'].includes(tag) ? (tag === 'font' ? 'span' : tag) : 'span';
        const color = node.style?.color || node.getAttribute('color') || '';
        const style = /^(#[a-f0-9]{3,8}|[a-z]{1,25}|rgba?\([\d.,%\s]+\))$/i.test(color) ? ` style="color:${M.escape(color)}"` : '';
        return `<${safeTag}${style}>${content}</${safeTag}>`;
    }
    function safeHTML(html) {
        const doc = new DOMParser().parseFromString('<html><body><div></div></body></html>', 'text/html');
        const div = doc.querySelector('div'); div.innerHTML = String(html || '');
        return Array.from(div.childNodes).map(node => sanitize(node, 'https://m.xchat.cz/')).join('');
    }
    function inspect(doc, url) {
        const field = doc.querySelector('input#formroomtext[name="text"], textarea#formroomtext[name="text"]');
        const form = field?.closest('form');
        if (!form || (form.getAttribute('method') || '').toLowerCase() !== 'post') return null;
        let action;
        try { action = new URL(form.getAttribute('action') || url, url); } catch { return null; }
        if (action.origin !== 'https://m.xchat.cz' || !/^\d+$/.test(action.searchParams.get('rid') || '')) return null;
        if (!form.querySelector('input[name="t"]')) return null;
        const nick = M.normalize(form.querySelector('b, strong')?.textContent);
        if (!nick) return null;
        let area = form.nextElementSibling;
        while (area && !['P', 'DIV'].includes(area.tagName)) area = area.nextElementSibling;
        // Never interpret menus, notices, or our own controls as chat messages.
        if (!area || area.id.startsWith('xcm-') || (!/\b\d{1,2}:\d{2}:\d{2}\b/.test(area.textContent) && area.tagName !== 'P')) return null;
        const links = Array.from(doc.querySelectorAll('a[href]'));
        const refreshLink = links.find(a => M.normalize(a.textContent).toLocaleLowerCase('cs') === 'obnovit');
        let refreshURL = action.href;
        try {
            const refresh = new URL(refreshLink?.getAttribute('href') || action.href, url);
            if (refresh.origin === action.origin && refresh.searchParams.get('rid') === action.searchParams.get('rid')) refreshURL = refresh.href;
        } catch {}
        const idle = form.textContent.match(/\((\d+):([0-5]\d)(?::([0-5]\d))?\)/);
        const idleSeconds = idle ? (idle[3] === undefined ? Number(idle[1]) * 60 + Number(idle[2]) : Number(idle[1]) * 3600 + Number(idle[2]) * 60 + Number(idle[3])) : null;
        return {form, field, area, action: action.href, refreshURL, refreshLink, nick, room: action.searchParams.get('rid'), idleSeconds};
    }
    function parseMessages(page, now = Date.now()) {
        const doc = page.form.ownerDocument;
        const chunks = []; let current = [];
        // In the mobile HTML messages are inline nodes separated by BR, not desktop div rows.
        for (const node of Array.from(page.area.childNodes)) {
            if (node.nodeType === 1 && node.tagName === 'BR') { chunks.push(current); current = []; }
            else current.push(node);
        }
        if (current.length) chunks.push(current);
        const groups = [];
        for (const nodes of chunks) {
            const text = nodes.map(n => n.textContent).join('');
            if (/^\s*\d{1,2}:\d{2}:\d{2}\b/.test(text)) groups.push([...nodes]);
            else if (groups.length && text.trim()) groups[groups.length - 1].push(doc.createElement('br'), ...nodes);
        }
        let date = new Date(now); date.setHours(0, 0, 0, 0);
        let previousTime = new Date(now).getHours() * 3600 + new Date(now).getMinutes() * 60 + new Date(now).getSeconds() + 300;
        const result = [];
        for (const nodes of groups) {
            const holder = doc.createElement('div'); nodes.forEach(n => holder.appendChild(n.cloneNode(true)));
            const readable = holder.cloneNode(true);
            readable.querySelectorAll('img').forEach(img => img.replaceWith(doc.createTextNode(img.getAttribute('alt') || '[obrázek]')));
            readable.querySelectorAll('br').forEach(br => br.replaceWith(doc.createTextNode('\n')));
            const fullText = readable.textContent.replace(/\u00a0/g, ' ').trim();
            const clock = fullText.match(/^(\d{1,2}):([0-5]\d):([0-5]\d)\s*/);
            if (!clock || Number(clock[1]) > 23) continue;
            const timeSeconds = Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3]);
            if (timeSeconds > previousTime) date.setDate(date.getDate() - 1);
            previousTime = timeSeconds;
            const instant = new Date(date); instant.setHours(Number(clock[1]), Number(clock[2]), Number(clock[3]), 0);
            const header = M.normalize(holder.querySelector('b, strong')?.textContent);
            const text = fullText.slice(clock[0].length).trim();
            const system = holder.firstElementChild?.tagName === 'SMALL' && /^\s*\d{1,2}:\d{2}:\d{2}/.test(holder.firstElementChild.textContent);
            const whisper = !system ? header.match(/^(.+?)\s*(?:->|→)\s*(.+)$/u) : null;
            const sender = system ? '' : whisper ? M.normalize(whisper[1]) : header.replace(/:$/, '');
            const recipient = whisper ? M.normalize(whisper[2]) : '';
            const presence = system && (arrival.test(text) ? 'arrival' : departure.test(text) ? 'departure' : '');
            const systemWhisper = Boolean(whisper && /^(system|systém)$/iu.test(sender));
            const advert = Boolean(holder.querySelector('.umsg_advert, .advert'));
            const day = `${instant.getFullYear()}-${String(instant.getMonth() + 1).padStart(2, '0')}-${String(instant.getDate()).padStart(2, '0')}`;
            const record = {time: clock[0].trim(), timestamp: +instant, day, text, sender, recipient,
                whisper: Boolean(whisper), system, systemWhisper, advert, presence: presence || '',
                html: Array.from(holder.childNodes).map(node => sanitize(node, page.action)).join('')};
            record.fingerprint = JSON.stringify([day, record.time, M.normalize(text), sender, recipient, system, presence, record.html]);
            result.push(record);
        }
        return result.reverse(); // Archive order is chronological.
    }
    function mergeSnapshot(incoming, previous, archive) {
        const records = new Map(archive.map(r => [r.id, r]));
        let best = {length: 0, old: 0, fresh: 0};
        // Reuse IDs in overlapping snapshots, including identical messages in the same second.
        for (let old = 0; old < previous.length; old++) for (let fresh = 0; fresh < incoming.length; fresh++) {
            if (previous[old].fingerprint !== incoming[fresh].fingerprint) continue;
            let length = 0;
            while (old + length < previous.length && fresh + length < incoming.length && previous[old + length].fingerprint === incoming[fresh + length].fingerprint) length++;
            if (length > best.length) best = {length, old, fresh};
        }
        const used = new Set(); const added = [];
        const snapshot = incoming.map((row, i) => {
            let id;
            if (best.length && i >= best.fresh && i < best.fresh + best.length) id = previous[best.old + i - best.fresh].id;
            // A snapshot without overlap can be a manually reopened older page.
            if (!id) id = archive.find(r => r.fingerprint === row.fingerprint && !used.has(r.id))?.id;
            if (!id) id = `${row.timestamp}-${M.uid()}`;
            used.add(id);
            const record = {...row, id};
            if (!records.has(id)) added.push(record);
            records.set(id, record);
            return record;
        });
        return {snapshot, added, archive: Array.from(records.values()).sort((a, b) => a.timestamp - b.timestamp)};
    }
    function loadArchive(known = new Map()) {
        const stored = M.read(M.roomKey + '.archive', []);
        return Array.isArray(stored) ? stored.filter(r => r && typeof r.id === 'string' && typeof r.fingerprint === 'string' && Number.isFinite(r.timestamp) && typeof r.text === 'string')
            .slice(-M.settings.archiveLimit).map(r => {
                const existing = known.get(r.id);
                return existing?.html === r.html && existing?.fingerprint === r.fingerprint ? existing : {...r, html: safeHTML(r.html)};
            }) : [];
    }
    function ingest(page, notify = false) {
        const incoming = parseMessages(page);
        const shared = loadArchive(new Map(M.archive.map(r => [r.id, r])));
        const mergedArchive = Array.from(new Map([...shared, ...M.archive].map(r => [r.id, r])).values());
        const oldLength = M.archive.length;
        const previousIds = new Set(M.snapshot.map(r => r.id));
        const previousOrder = M.snapshot.map(r => r.id).join('|');
        const previousNewest = M.snapshot.at(-1)?.timestamp ?? Infinity;
        const merged = mergeSnapshot(incoming, M.snapshot, mergedArchive);
        M.snapshot = merged.snapshot;
        M.archive = merged.archive.slice(-M.settings.archiveLimit);
        if (merged.archive.length > M.archive.length) M.archiveTrimmed = true;
        if (merged.added.length || merged.archive.length > M.archive.length || M.archiveUnsaved) {
            M.archiveUnsaved = !M.write(M.roomKey + '.archive', M.archive);
        }
        if (notify) M.notifyMessages(M.snapshot.filter(r => !previousIds.has(r.id) && r.timestamp >= previousNewest));
        return previousOrder !== M.snapshot.map(r => r.id).join('|') || oldLength !== M.archive.length;
    }
    function personal(record) {
        const own = M.lower(M.page.nick);
        if (M.lower(record.sender) === own) return {mention: false, whisper: false};
        const whisper = record.whisper && M.lower(record.recipient) === own;
        const mention = !record.whisper && !record.system && M.termMatches(record.text, M.page.nick);
        return {mention, whisper};
    }
    Object.assign(M, {sanitize, safeHTML, inspect, parseMessages, mergeSnapshot, loadArchive, ingest, personal,
        uid: () => window.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`});
})(M);
