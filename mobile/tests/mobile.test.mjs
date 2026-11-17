import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {fileURLToPath, pathToFileURL} from 'node:url';
import path from 'node:path';
const {parseHTML, DOMParser} = process.env.XCHAT_TEST_DOM_MODULE
    ? await import(pathToFileURL(process.env.XCHAT_TEST_DOM_MODULE)) : await import('linkedom');
const root = fileURLToPath(new URL('../../', import.meta.url));
const code = fs.readFileSync(path.join(root, 'xchat-mobile.user.js'), 'utf8').replace('/* MOBILE_TEST_HOOK */', 'window.__mobileTest = M;');
const fixture = fs.readFileSync(new URL('room.html', import.meta.url), 'utf8');
const settingsKey = 'kamdar.xchat.mobile.v1.settings';
const initial = new Date('2026-11-17T12:00:01').getTime();
function locks() {
    const busy = new Set();
    return {request: async (name, options, action) => { if (busy.has(name)) return action(null); busy.add(name); try { return await action({name}); } finally { busy.delete(name); } }};
}
function harness({html = fixture, storage = new Map(), settings = {}, lock = locks(), now = initial, blockedStorage = false} = {}) {
    if (Object.keys(settings).length) storage.set(settingsKey, JSON.stringify(settings));
    const {window: dom, document} = parseHTML(html);
    const window = {document, Event: dom.Event, HTMLSelectElement: dom.HTMLSelectElement, addEventListener() {}, removeEventListener() {}};
    let clock = now; let hidden = false; let fetchHandler; let timerId = 0;
    const requests = []; const audio = []; const intervals = []; const timeouts = new Map();
    const location = new URL('https://m.xchat.cz/?c=0&m=4&wh=TEST_ONLY&rid=123');
    const navigator = {onLine: true, locks: lock};
    const errors = [];
    class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
    class TestAudio { constructor(url) { this.src = url; this.volume = 1; this.currentTime = 0; } play() {audio.push({url: this.src, muted: this.muted, volume: this.volume}); return Promise.resolve();} pause() {} }
    class FormDataFixture {
        constructor(form) {
            this.items = Array.from(form.querySelectorAll('input, select, textarea')).filter(el => el.name && !el.disabled && !['submit', 'button', 'reset', 'file'].includes(el.type) && (!['checkbox', 'radio'].includes(el.type) || el.checked)).map(el => [el.name, el.value]);
        }
        [Symbol.iterator]() { return this.items[Symbol.iterator](); }
    }
    const descriptor = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value');
    if (!descriptor?.set) Object.defineProperty(window.HTMLSelectElement.prototype, 'value', {configurable: true,
        get() {return this.querySelector('option[selected]')?.getAttribute('value') ?? this.querySelector('option')?.getAttribute('value') ?? '';},
        set(value) {for (const option of this.querySelectorAll('option')) {if (option.getAttribute('value') === String(value)) option.setAttribute('selected', ''); else option.removeAttribute('selected');}}
    });
    Object.defineProperty(document, 'hidden', {get: () => hidden});
    Object.defineProperty(document, 'readyState', {value: 'complete'});
    window.top = window; window.location = location; window.Audio = TestAudio;
    window.crypto = {randomUUID: () => `test-${Math.random().toString(36).slice(2)}`};
    window.scrollY = 0; window.scrollBy = () => {}; window.getSelection = () => ({toString: () => ''}); window.confirm = () => true;
    const timeout = (fn, delay) => {timeouts.set(++timerId, {fn, due: clock + delay}); return timerId;};
    const context = vm.createContext({window, document, location, navigator, DOMParser, URL, URLSearchParams,
        FormData: FormDataFixture, Blob, AbortController, Date: ClockDate, Event: window.Event,
        localStorage: {getItem: key => {if (blockedStorage) throw Error('blocked'); return storage.get(key) ?? null;}, setItem: (key, value) => {if (blockedStorage) throw Error('blocked'); storage.set(key, String(value));}},
        setInterval: fn => {intervals.push(fn); return intervals.length;}, setTimeout: timeout,
        clearTimeout: id => timeouts.delete(id), clearInterval: () => {},
        fetch: async (url, options) => {
            requests.push({url, method: options.method, body: options.body?.toString(), credentials: options.credentials});
            return fetchHandler ? fetchHandler(url, options) : {ok: true, status: 200, url, text: async () => html};
        }, console: {log() {}, warn() {}, error: (...args) => errors.push(args)}
    });
    vm.runInContext(code, context, {filename: 'xchat-mobile.user.js'});
    const M = window.__mobileTest;
    return {M, document, window, context, storage, navigator, requests, audio, errors, intervals,
        setTime(value) {clock = value;}, advance(ms) {clock += ms;}, setHidden(value) {hidden = value;}, setFetch(fn) {fetchHandler = fn;},
        async tick() {await M.tick(clock);}, click(el) {el.dispatchEvent(new window.Event('click', {bubbles: true}));},
        async timers(ms) {clock += ms; for (const [id, timer] of timeouts) if (timer.due <= clock) {timeouts.delete(id); await timer.fn();}},
        response(text, url = location.href) {return {ok: true, status: 200, url, text: async () => text};}
    };
}
function pageWithRows(rows, nick = 'Tester', room = '123') {
    return fixture.replace(/<p style="overflow: hidden;">[\s\S]*?<\/p>/, '<p style="overflow: hidden;">' + rows + '</p>')
        .replace(/<b>Tester<\/b>:/, `<b>${nick}</b>:`).replace(/rid=123/g, 'rid=' + room);
}
function latest(text = 'Nová zpráva', time = '12:00:02') { return pageWithRows(`${time} <b>Host</b>: ${text}<br>12:00:00 <small>Text systému</small><br>`); }

test('actual mobile DOM is parsed; settings, six areas, whispers, presence, nick and safe image export', () => {
    const h = harness();
    assert.ok(h.document.getElementById('xcm-settings'));
    assert.equal(h.document.querySelectorAll('#xcm-settings section').length, 6);
    assert.equal(h.M.archive.length, 6);
    assert.equal(h.M.page.nick, 'Tester'); assert.equal(h.M.page.room, '123');
    assert.equal(h.M.archive.filter(r => r.whisper).length, 2);
    assert.equal(h.M.archive.filter(r => r.presence).length, 2);
    assert.equal(h.document.querySelectorAll('.xcm-whisper').length, 2);
    assert.equal(h.document.querySelectorAll('.xcm-mention').length, 1);
    assert.equal(h.M.page.area.hidden, true);
    assert.match(h.M.exportContent('txt'), /\*1\*/);
    assert.equal(h.audio.length, 0); assert.equal(h.requests.length, 0);
    assert.doesNotThrow(() => h.window.reloadRoomPage());
    if (process.env.XCHAT_PREVIEW_HTML) {
        h.document.getElementById('xcm-settings').setAttribute('open', '');
        h.document.querySelectorAll('script').forEach(node => node.remove());
        const style = h.document.createElement('style');
        style.textContent = 'body{margin:0;padding:12px;background:#fff;font:16px/1.4 Arial}#content{width:375px;max-width:100%;margin:auto}#formroomtext{max-width:170px}';
        h.document.head.appendChild(style);
        fs.writeFileSync(process.env.XCHAT_PREVIEW_HTML, h.document.toString());
    }
});
test('deadline does not depend on the frozen site clock; GET refresh does not postpone /s', async () => {
    const h = harness({settings: {intervalMinutes: 1}});
    h.advance(30000); await h.M.request('read');
    assert.equal(h.M.state().lastActivity, initial);
    h.setTime(initial + 59999); await h.tick(); assert.equal(h.requests.filter(r => r.method === 'POST').length, 0);
    h.setTime(initial + 60000); await h.tick();
    const posts = h.requests.filter(r => r.method === 'POST'); assert.equal(posts.length, 1);
    const body = new URLSearchParams(posts[0].body); assert.equal(body.get('text'), '/s'); assert.equal(body.get('t'), '1');
    assert.equal(posts[0].credentials, 'same-origin'); assert.equal(h.M.page.field.value, '');
    await h.tick(); assert.equal(h.requests.filter(r => r.method === 'POST').length, 1);
});
test('reload preserves the last send timestamp and saved interval', async () => {
    const first = harness({settings: {intervalMinutes: 2, autoRead: false}});
    const next = harness({storage: first.storage, now: initial + 119000});
    assert.equal(next.M.settings.intervalMinutes, 2); assert.equal(next.M.state().lastActivity, initial);
    await next.tick(); assert.equal(next.requests.length, 0);
    next.advance(1000); await next.tick(); assert.equal(next.requests.length, 1);
});
test('draft pauses /s; read refresh preserves draft; clearing it allows one overdue command', async () => {
    const h = harness({settings: {intervalMinutes: 1, autoRead: false}}); h.M.page.field.value = 'Rozepsaná zpráva';
    h.advance(60000); await h.tick(); assert.equal(h.requests.length, 0);
    await h.M.request('read'); assert.equal(h.M.page.field.value, 'Rozepsaná zpráva');
    h.M.page.field.value = ''; await h.tick(); assert.equal(h.requests.filter(r => r.method === 'POST').length, 1);
});
test('manual send restarts inactivity and never clears a newer draft typed during the request', async () => {
    const h = harness({settings: {intervalMinutes: 1, autoRead: false}}); h.advance(30000);
    let finish; h.setFetch(() => new Promise(resolve => {finish = resolve;})); h.M.page.field.value = 'První';
    const request = h.M.request('manual', 'První'); h.M.page.field.value = 'Druhá';
    finish(h.response(fixture)); await request;
    assert.equal(h.M.page.field.value, 'Druhá'); assert.equal(h.M.state().lastActivity, initial + 30000);
    assert.equal(new URLSearchParams(h.requests[0].body).get('text'), 'První');
});
test('suspended and offline tabs send nothing; resuming after hours sends only once', async () => {
    const h = harness({settings: {intervalMinutes: 1, autoRead: false}}); h.setHidden(true); h.advance(4 * 3600000);
    await h.tick(); assert.equal(h.requests.length, 0);
    h.setHidden(false); h.navigator.onLine = false; await h.tick(); assert.equal(h.requests.length, 0);
    h.navigator.onLine = true; await h.tick(); await h.tick(); assert.equal(h.requests.length, 1);
});
test('two tabs share lock and activity timestamp, avoiding duplicate automatic POSTs', async () => {
    const storage = new Map(); const lock = locks();
    const a = harness({storage, lock, settings: {intervalMinutes: 1, autoRead: false}});
    const b = harness({storage, lock}); a.advance(60000); b.advance(60000);
    await Promise.all([a.tick(), b.tick()]); await b.tick();
    assert.equal(a.requests.length + b.requests.length, 1);
});
test('unconfirmed POST blocks automatic retry including after reload', async () => {
    const h = harness({settings: {intervalMinutes: 1, autoRead: false}});
    h.setFetch(async () => {throw Error('network lost');}); h.advance(60000); await h.tick();
    assert.equal(h.M.state().blocked, true); h.advance(60000); await h.tick(); assert.equal(h.requests.length, 1);
    const reload = harness({storage: h.storage, now: initial + 180000}); await reload.tick(); assert.equal(reload.requests.length, 0);
    reload.M.resume(); assert.equal(reload.M.state().blocked, false); await reload.tick(); assert.equal(reload.requests.length, 0);
});
test('login page, different account, and different room are not accepted as a successful send', async () => {
    for (const response of ['<html><body>Přihlášení</body></html>', pageWithRows('12:00:00 <b>A</b>: ahoj', 'Other'), pageWithRows('12:00:00 <b>A</b>: ahoj', 'Tester', '456')]) {
        const h = harness({settings: {intervalMinutes: 1, autoRead: false}});
        h.setFetch(async () => h.response(response)); h.advance(60000); await h.tick();
        assert.equal(h.M.state().blocked, true); assert.equal(h.M.archive.length, 6);
    }
});
test('incoming pages are sanitized; no scripts run, and auth URLs are removed from exports/storage', async () => {
    const h = harness(); h.setTime(initial + 2000);
    const malicious = latest('<img src="https://example.org/a.png" onerror="boom()"><a href="javascript:alert(1)">evil</a><a href="https://m.xchat.cz/?wh=SECRET&amp;rid=123">profil</a><script>boom()</script>');
    h.setFetch(async () => h.response(malicious)); await h.M.request('read');
    const exported = h.M.exportContent('html');
    assert.ok(!exported.includes('onerror')); assert.ok(!exported.includes('javascript:')); assert.ok(!exported.includes('SECRET')); assert.ok(!exported.includes('boom()'));
    assert.ok(![...h.storage.values()].join('\n').includes('TEST_ONLY'));
    assert.ok(![...h.storage.values()].join('\n').includes('SECRET'));
    assert.equal(h.M.archive.length, 8);
});
test('identical messages in the same second survive overlapping snapshots without duplicating history', () => {
    const h = harness();
    const make = content => h.M.parseMessages(h.M.inspect(new DOMParser().parseFromString(pageWithRows(content), 'text/html'), h.M.page.action));
    const a = make('12:00:00 <b>A</b>: Stejné<br>11:59:59 <b>B</b>: Starší<br>');
    const first = h.M.mergeSnapshot(a, [], []);
    const b = make('12:00:00 <b>A</b>: Stejné<br>12:00:00 <b>A</b>: Stejné<br>11:59:59 <b>B</b>: Starší<br>');
    const second = h.M.mergeSnapshot(b, first.snapshot, first.archive);
    assert.equal(second.archive.length, 3);
    const repeated = h.M.mergeSnapshot(b, second.snapshot, second.archive); assert.equal(repeated.archive.length, 3); assert.equal(repeated.added.length, 0);
    const shortened = h.M.mergeSnapshot(b.slice(1), repeated.snapshot, repeated.archive); assert.equal(shortened.archive.length, 3);
});
test('midnight separates identical timestamps on consecutive days', () => {
    const h = harness(); const now = new Date('2026-11-18T00:00:05').getTime();
    const page = h.M.inspect(new DOMParser().parseFromString(pageWithRows('00:00:04 <b>A</b>: nové<br>23:59:59 <b>B</b>: staré<br>'), 'text/html'), h.M.page.action);
    const rows = h.M.parseMessages(page, now);
    assert.equal(rows[0].day, '2026-11-17'); assert.equal(rows[1].day, '2026-11-18');
    assert.equal(rows[1].timestamp - rows[0].timestamp, 5000);
});
test('filters, read marker, export formats and saved preference changes work through DOM controls', () => {
    const h = harness();
    const hide = h.document.getElementById('xcm-hideSystem'); hide.checked = true; hide.dispatchEvent(new h.window.Event('change'));
    assert.equal(h.document.querySelectorAll('.xcm-whisper').length, 1);
    const row = h.document.querySelector('#xcm-board .xcm-row'); h.click(row);
    assert.ok(h.M.state().readMarker); assert.equal(h.document.querySelectorAll('.xcm-read-marker').length, 1);
    h.M.settings.omitPresence = true;
    assert.equal(h.M.exportRecords().length, 4);
    for (const format of ['txt', 'md', 'html']) { const output = h.M.exportContent(format); assert.ok(!output.includes('opustil místnost')); assert.ok(output.includes('Moje zpráva')); }
    assert.match(h.M.exportContent('html'), /Skrýt příchody a odchody/);
    assert.ok(JSON.parse(h.storage.get(settingsKey)).hideSystem);
});
test('initial history is silent; only new qualifying messages play after audio unlock', async () => {
    const h = harness(); assert.equal(h.audio.length, 0);
    await h.M.unlockAudio(); const baseline = h.audio.length;
    h.advance(2000); h.setFetch(async () => h.response(latest('Tester, nová zmínka'))); await h.M.request('read');
    await Promise.resolve(); assert.equal(h.audio.length, baseline + 1);
    await h.M.request('read'); assert.equal(h.audio.length, baseline + 1);
    assert.ok(h.audio.at(-1).url.startsWith('data:audio/wav;base64,'));
});
test('invalid intervals cannot overwrite saved configuration, while valid changes apply immediately', () => {
    const h = harness(); const input = h.document.getElementById('xcm-interval');
    const save = Array.from(h.document.querySelectorAll('button')).find(b => b.textContent === 'Uložit intervaly');
    for (const value of ['', '0', '-1', '1.5', 'Infinity', '1441']) { input.value = value; h.click(save); assert.equal(h.M.settings.intervalMinutes, 10); }
    input.value = '3'; h.click(save); assert.equal(h.M.settings.intervalMinutes, 3); assert.equal(JSON.parse(h.storage.get(settingsKey)).intervalMinutes, 3);
});
test('blocked storage is reported; automatic POST fails closed', async () => {
    const h = harness({blockedStorage: true}); h.advance(600000); await h.tick();
    assert.match(h.M.storageWarning, /nepovolil/); assert.equal(h.requests.filter(r => r.method === 'POST').length, 0);
});
test('unknown pages, login forms, and foreign form actions are left untouched', () => {
    for (const html of ['<html><head></head><body><form><input name="password"></form></body></html>', fixture.replace('action="?c=0', 'action="https://example.org/?c=0')]) {
        const h = harness({html}); assert.equal(h.document.getElementById('xcm-settings'), null); assert.equal(h.requests.length, 0);
    }
});
test('lease fallback coordinates old browsers without Web Locks', async () => {
    const storage = new Map();
    const a = harness({storage, settings: {intervalMinutes: 1, autoRead: false}, lock: null});
    const b = harness({storage, lock: null}); a.advance(60000); b.advance(60000);
    const pending = a.tick(); await b.tick(); await a.timers(250); await pending;
    assert.equal(a.requests.length + b.requests.length, 1);
});
test('a message already archived by another tab is still rendered locally without duplicate records', async () => {
    const storage = new Map();
    const a = harness({storage}); const b = harness({storage});
    a.advance(2000); b.advance(2000);
    const html = latest('Společná zpráva'); a.setFetch(async () => a.response(html)); b.setFetch(async () => b.response(html));
    await a.M.request('read'); await b.M.request('read');
    assert.match(b.document.getElementById('xcm-board').textContent, /Společná zpráva/);
    assert.equal(b.M.archive.filter(r => r.text.includes('Společná zpráva')).length, 1);
    assert.equal(a.M.archive.length, b.M.archive.length);
});
test('existing room template fields can be filled without submitting or affecting login forms', () => {
    const html = '<html><head></head><body><form><input name="r_name"><input name="r_title"><textarea name="r_disclaimer"></textarea><input name="r_fontcolor"><input name="r_color"><input name="r_image"><button>Vytvořit</button></form></body></html>';
    const h = harness({html});
    h.document.getElementById('xcm-template-r_name').value = 'Testovací místnost';
    const fill = Array.from(h.document.querySelectorAll('button')).find(b => b.textContent === 'Vyplnit novou místnost'); h.click(fill);
    assert.equal(h.document.querySelector('[name=r_name]').value, 'Testovací místnost'); assert.equal(h.requests.length, 0);
    assert.ok(h.document.getElementById('xcm-style'));
});
test('sound source, volume, enabled toggle and watched terms persist independently', async () => {
    const h = harness(); const group = h.document.getElementById('xcm-volume-arrival').closest('fieldset');
    h.document.getElementById('xcm-volume-arrival').value = '0.25';
    h.document.getElementById('xcm-sound-arrival').checked = false;
    const save = Array.from(group.querySelectorAll('button')).find(b => b.textContent === 'Uložit'); h.click(save);
    assert.equal(h.M.settings.sounds.arrival.volume, .25); assert.equal(h.M.settings.sounds.arrival.enabled, false);
    assert.equal(h.M.settings.sounds.departure.volume, 1);
    await h.M.unlockAudio(); const before = h.audio.length; await h.M.play('arrival'); assert.equal(h.audio.length, before);
    h.document.getElementById('xcm-terms').value = 'vlastní výraz\nDalší';
    h.click(Array.from(h.document.querySelectorAll('button')).find(b => b.textContent === 'Uložit sledování'));
    assert.equal(h.M.settings.watchedTerms[0], 'vlastní výraz'); assert.equal(JSON.parse(h.storage.get(settingsKey)).sounds.arrival.volume, .25);
});
test('the supplied page builds the complete mobile UI without persisting session tokens', {skip: !process.env.XCHAT_SAMPLE_HTML}, () => {
    const raw = fs.readFileSync(process.env.XCHAT_SAMPLE_HTML, 'utf8');
    const h = harness({html: raw, now: new Date('2026-11-17T23:15:00').getTime()});
    assert.ok(h.M.page); assert.ok(h.M.archive.length >= 20);
    assert.equal(h.document.querySelectorAll('#xcm-settings section').length, 6);
    const token = new URL(h.M.page.action).searchParams.get('wh');
    assert.ok(token); assert.ok(!h.M.exportContent('html').includes(token)); assert.ok(![...h.storage.values()].join('\n').includes(token));
    console.log('Supplied HTML: parsed ' + h.M.archive.length + ' messages; all settings built; session token absent from archive and exports.');
});
