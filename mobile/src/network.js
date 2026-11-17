/* Absolute timestamps survive navigation. Only one request and one automatic send may run at a time. */
((M) => {
    M.busy = false; M.nextRead = 0; M.readFailures = 0; M.notice = '';
    const timeoutMs = 20000;
    function initializeClock(now = Date.now()) {
        const current = M.state();
        let lastActivity = Number.isFinite(current.lastActivity) ? current.lastActivity : now;
        if (lastActivity > now + 60000) lastActivity = now; // Device clock moved backwards.
        M.updateRoom({lastActivity});
        M.nextRead = now + M.settings.readSeconds * 1000;
    }
    function due(now = Date.now()) {
        const s = M.state();
        return M.settings.autoSend && !s.blocked && !s.pending && now >= (s.lastActivity ?? now) + M.settings.intervalMinutes * 60000;
    }
    function canAuto(now = Date.now()) {
        return due(now) && !M.busy && !document.hidden && navigator.onLine !== false && !M.page.field.disabled && !M.page.field.readOnly && M.page.field.value === '';
    }
    async function automaticLock(action) {
        const name = 'xchat-mobile-send:' + M.roomKey;
        if (navigator.locks?.request) return navigator.locks.request(name, {mode: 'exclusive', ifAvailable: true}, lock => lock ? action() : false);
        // Older browsers: short shared lease plus persisted attempt state, checked again before POST.
        const key = M.roomKey + '.lease'; const now = Date.now();
        const existing = M.read(key, null);
        if (existing?.until > now) return false;
        const token = M.uid();
        if (!M.write(key, {token, until: now + 30000})) return false;
        await new Promise(resolve => setTimeout(resolve, 100 + Math.floor(Math.random() * 100)));
        if (M.read(key, null)?.token !== token) return false;
        try { return await action(); }
        finally { if (M.read(key, null)?.token === token) M.write(key, null); }
    }
    function payload(text, submitter) {
        const body = new URLSearchParams();
        for (const [key, value] of new FormData(M.page.form)) if (typeof value === 'string') body.append(key, value);
        body.set(M.page.field.name, text);
        if (submitter?.name) body.set(submitter.name, submitter.value || '');
        return body;
    }
    function synchronizeForm(next) {
        // Keep the actual message input and any newly typed draft; refresh only server-owned hidden fields.
        const originals = Array.from(M.page.form.querySelectorAll('input[type="hidden"]'));
        for (const hidden of originals) hidden.remove();
        for (const hidden of next.form.querySelectorAll('input[type="hidden"]')) M.page.form.appendChild(document.importNode(hidden, true));
        M.page.action = next.action; M.page.refreshURL = next.refreshURL;
        M.page.form.setAttribute('action', next.action);
        if (M.page.refreshLink) M.page.refreshLink.href = next.refreshURL;
    }
    async function request(kind, text = '', submitter = null) {
        const isPost = kind === 'auto' || kind === 'manual';
        if (M.busy) return false;
        if (kind === 'auto' && !canAuto()) return false;
        if (navigator.onLine === false) { M.notice = 'Bez připojení. Rozepsaná zpráva zůstává zachována.'; M.updateStatus(); return false; }
        const url = new URL(isPost ? M.page.action : M.page.refreshURL);
        if (url.origin !== location.origin || url.origin !== 'https://m.xchat.cz' || url.searchParams.get('rid') !== M.page.room) return false;
        url.hash = ''; if (!isPost) url.searchParams.set('rnd', String(Math.floor(Math.random() * 1000000)));
        const started = Date.now();
        if (isPost) {
            // Reserve the attempt before any network await. An ambiguous POST is never automatically retried.
            M.updateRoom({pending: {at: started, id: M.uid(), automatic: kind === 'auto'}});
            if (kind === 'auto' && !M.stateSaved) { M.updateRoom({pending: null, blocked: true}); M.notice = 'Automatické /s je pozastavené: nelze uložit čas odeslání.'; M.updateStatus(); return false; }
        }
        M.busy = true; M.updateStatus();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const options = {method: isPost ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', signal: controller.signal};
            if (isPost) { options.body = payload(text, submitter); options.headers = {'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'}; }
            const response = await fetch(url.href, options);
            if (!response.ok) throw new Error('http');
            const responseURL = response.url || url.href;
            if (new URL(responseURL).origin !== location.origin) throw new Error('session');
            const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
            const next = M.inspect(doc, responseURL);
            if (!next || next.room !== M.page.room || M.lower(next.nick) !== M.lower(M.page.nick)) throw new Error('session');
            const changed = M.ingest(next, true);
            synchronizeForm(next);
            if (isPost) {
                M.updateRoom({lastActivity: started, pending: null, blocked: false});
                if (kind === 'manual' && M.page.field.value === text) M.page.field.value = '';
                M.notice = kind === 'auto' ? 'Automatické /s odesláno.' : 'Zpráva odeslána.';
            } else {
                M.notice = 'Zprávy načteny.';
            }
            M.readFailures = 0; M.lastRead = Date.now();
            if (changed) M.renderMessages();
            return true;
        } catch (error) {
            if (isPost) {
                M.updateRoom({pending: null, blocked: true});
                M.notice = 'Odeslání se nepodařilo potvrdit. Automatické /s je pozastavené, aby se příkaz neopakoval. Zprávu ověř přes Obnovit.';
            } else if (error.message === 'session') {
                M.updateRoom({blocked: true}); M.sessionInvalid = true;
                M.notice = 'Relace nebo místnost se změnila. Otevři znovu původní stránku a případně se přihlas.';
            } else { M.readFailures++; M.notice = 'Nové zprávy se nepodařilo načíst. Další pokus proběhne později.'; }
            return false;
        } finally {
            clearTimeout(timer); M.busy = false;
            M.nextRead = Date.now() + Math.max(M.settings.readSeconds * 1000, M.readFailures ? Math.min(60000, 5000 * 2 ** M.readFailures) : 0);
            M.updateStatus();
        }
    }
    async function tick(now = Date.now()) {
        if (!M.page || M.stopped) return;
        const state = M.state();
        if (state.pending && now - state.pending.at > 30000 && !M.busy) {
            M.updateRoom({pending: null, blocked: true});
            M.notice = 'Předchozí odeslání nemá potvrzení. Automatické /s je pozastavené.';
        }
        M.updateStatus();
        if (M.busy || document.hidden || navigator.onLine === false || M.sessionInvalid) return;
        if (canAuto(now)) {
            await automaticLock(() => canAuto() ? request('auto', '/s') : false);
        }
        if (!M.busy && M.settings.autoRead && Date.now() >= M.nextRead) await request('read');
    }
    function resume() {
        if (M.busy || M.state().pending) return;
        M.updateRoom({blocked: false, pending: null, lastActivity: Date.now()});
        M.notice = 'Automatické /s obnoveno. Interval začíná nyní.'; M.updateStatus();
    }
    function connect() {
        M.page.form.addEventListener('submit', event => {
            event.preventDefault(); event.stopPropagation();
            const field = M.page.field;
            if (M.busy) { M.notice = 'Počkej na dokončení předchozího požadavku. Rozepsaná zpráva zůstává.'; M.updateStatus(); return; }
            if (!field.value || field.disabled || field.readOnly) return;
            void request('manual', field.value, event.submitter);
        });
        M.page.refreshLink?.addEventListener('click', event => { event.preventDefault(); void request('read'); });
        M.page.field.addEventListener('input', () => M.updateStatus());
        document.addEventListener('visibilitychange', () => { if (!document.hidden) void tick(); });
        window.addEventListener('online', () => { M.nextRead = Date.now(); void tick(); });
        window.addEventListener('storage', event => { if (event.key?.includes(M.roomKey)) M.updateStatus(); });
        // The supplied mobile page schedules a string callback. Replacing its function cancels future full-page reloads.
        window.reloadRoomPage = function xchatMobileManagedRefresh() {};
        M.timer = setInterval(() => { void tick(); }, 1000);
    }
    Object.assign(M, {initializeClock, due, canAuto, automaticLock, payload, request, tick, resume, connect});
})(M);
