/* Shared settings and storage for m.xchat.cz only. */
((M) => {
    const KEY = 'kamdar.xchat.mobile.v1';
    const defaults = {
        autoSend: true, intervalMinutes: 10, autoRead: true, readSeconds: 5,
        showAll: true, archiveLimit: 5000, hideAds: true, hideSystem: false,
        omitPresence: false, highlight: true, readLine: true,
        watchedTerms: ['Sidian', 'Woif'], whisperNicks: ['Sidian', 'Woif'],
        wholeWords: true, includeSystem: true,
        sounds: Object.fromEntries(['message', 'arrival', 'departure'].map(kind => [kind,
            {enabled: true, source: 'bundled', url: '', volume: 1}]))
    };
    const normalize = value => String(value ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
    const lower = value => normalize(value).toLocaleLowerCase('cs');
    const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    function read(key, fallback) {
        try { const value = JSON.parse(localStorage.getItem(KEY + '.' + key)); return value ?? fallback; }
        catch { return fallback; }
    }
    function write(key, value) {
        try { localStorage.setItem(KEY + '.' + key, JSON.stringify(value)); return true; }
        catch { M.storageWarning = 'Prohlížeč nepovolil uložení dat. Nastavení a historie mohou po zavření stránky zmizet.'; return false; }
    }
    function integer(value, fallback, min, max) {
        const n = Number(value);
        return Number.isSafeInteger(n) && n >= min && n <= max ? n : fallback;
    }
    function cleanSettings(raw = {}) {
        const result = JSON.parse(JSON.stringify(defaults));
        for (const key of Object.keys(result)) if (typeof result[key] === 'boolean' && typeof raw[key] === 'boolean') result[key] = raw[key];
        result.intervalMinutes = integer(raw.intervalMinutes, 10, 1, 1440);
        result.readSeconds = integer(raw.readSeconds, 5, 5, 3600);
        result.archiveLimit = integer(raw.archiveLimit, 5000, 100, 10000);
        for (const key of ['watchedTerms', 'whisperNicks']) {
            if (Array.isArray(raw[key])) result[key] = raw[key].map(normalize).filter(Boolean).map(s => s.slice(0, 100)).slice(0, 100);
        }
        for (const kind of Object.keys(result.sounds)) {
            const sound = raw.sounds?.[kind];
            if (!sound) continue;
            result.sounds[kind] = {
                enabled: typeof sound.enabled === 'boolean' ? sound.enabled : true,
                source: ['bundled', 'custom', 'tones'].includes(sound.source) ? sound.source : 'bundled',
                url: typeof sound.url === 'string' && /^https:\/\//i.test(sound.url) ? sound.url.slice(0, 3000) : '',
                volume: Number.isFinite(sound.volume) ? Math.min(1, Math.max(0, sound.volume)) : 1
            };
        }
        result.roomTemplate = {...M.roomDefaults};
        for (const key of Object.keys(result.roomTemplate)) if (typeof raw.roomTemplate?.[key] === 'string') result.roomTemplate[key] = raw.roomTemplate[key].slice(0, 10000);
        return result;
    }
    function safeURL(value, base = location.href) {
        try {
            const url = new URL(value, base);
            if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
            // Login tokens from mobile links must never enter saved history or exports.
            for (const key of Array.from(url.searchParams.keys())) if (/^(wh|token|session|sid|auth|rnd)$/i.test(key)) url.searchParams.delete(key);
            return url.href;
        } catch { return ''; }
    }
    function roomState() {
        const value = read(M.roomKey + '.state', {});
        return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    }
    function updateRoom(patch) {
        const next = {...state(), ...patch};
        const saved = write(M.roomKey + '.state', next);
        M.volatileRoom = saved ? null : next;
        M.stateSaved = saved;
        return next;
    }
    function state() { return M.volatileRoom || roomState(); }
    function termMatches(text, term) {
        if (!term) return false;
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(M.settings.wholeWords ? `(^|[^\\p{L}\\p{N}_])${escaped}(?=$|[^\\p{L}\\p{N}_])` : escaped, 'iu').test(text);
    }
    Object.assign(M, {KEY, defaults, normalize, lower, escape, read, write, integer, cleanSettings, safeURL,
        roomState, updateRoom, state, termMatches, settings: cleanSettings(read('settings', {})), volatileRoom: null, stateSaved: true, storageWarning: ''});
})(M);
