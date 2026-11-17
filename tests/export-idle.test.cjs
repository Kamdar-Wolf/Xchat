const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'export.user.js'), 'utf8');
const storageKey = 'kamdar.xchat.idleIntervalMinutes';

// Minimal DOM fixture; no requests are made and /S is captured only by this fake form.
function matches(el, selector) {
    const parts = selector.trim().split(/\s+/);
    function simple(node, part) {
        if (!node) return false;
        const tag = part.match(/^[a-z]+/i)?.[0];
        if (tag && node.tagName !== tag.toUpperCase()) return false;
        for (const [, id] of part.matchAll(/#([\w-]+)/g)) if (node.id !== id) return false;
        for (const [, cls] of part.matchAll(/\.([\w-]+)/g)) if (!(node.className || '').split(' ').includes(cls)) return false;
        for (const [, attr, value] of part.matchAll(/\[([\w-]+)="?([^"\]]+)"?\]/g)) {
            if (String(node[attr] ?? node.attributes[attr]) !== value) return false;
        }
        return true;
    }
    if (!simple(el, parts.pop())) return false;
    let parent = el.parentElement;
    while (parts.length) {
        const part = parts.pop();
        while (parent && !simple(parent, part)) parent = parent.parentElement;
        if (!parent) return false;
        parent = parent.parentElement;
    }
    return true;
}
class Element {
    constructor(doc, tag) {
        this.ownerDocument = doc; this.tagName = tag.toUpperCase(); this.children = [];
        this.style = {}; this.attributes = {}; this.listeners = {}; this.value = '';
        this.textContent = ''; this.disabled = false; this.readOnly = false;
    }
    get nextElementSibling() {
        const siblings = this.parentElement?.children || [];
        return siblings[siblings.indexOf(this) + 1] || null;
    }
    get form() {
        for (let el = this.parentElement; el; el = el.parentElement) if (el.tagName === 'FORM') return el;
        return null;
    }
    append(...nodes) { nodes.forEach(node => this.appendChild(node)); }
    appendChild(node) { node.remove(); node.parentElement = this; this.children.push(node); return node; }
    prepend(node) { node.remove(); node.parentElement = this; this.children.unshift(node); }
    after(node) {
        node.remove(); node.parentElement = this.parentElement;
        this.parentElement.children.splice(this.parentElement.children.indexOf(this) + 1, 0, node);
    }
    remove() {
        if (this.parentElement) this.parentElement.children.splice(this.parentElement.children.indexOf(this), 1);
        this.parentElement = null;
    }
    querySelectorAll(selector) {
        const found = [];
        function visit(node) {
            for (const child of node.children) {
                if (selector.split(',').some(part => matches(child, part))) found.push(child);
                visit(child);
            }
        }
        visit(this); return found;
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    setAttribute(key, value) { this.attributes[key] = String(value); }
    removeAttribute(key) { delete this.attributes[key]; }
    getAttribute(key) { return this.attributes[key] ?? null; }
    addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
    dispatchEvent(event) { for (const listener of this.listeners[event.type] || []) listener(event); }
    click() { if (!this.disabled) this.dispatchEvent({type: 'click', preventDefault() {}, stopPropagation() {}}); }
}
class Document extends Element {
    constructor() {
        super(null, 'document'); this.ownerDocument = this;
        this.documentElement = this.createElement('html'); this.append(this.documentElement);
        this.head = this.createElement('head'); this.body = this.createElement('body');
        this.documentElement.append(this.head, this.body);
    }
    createElement(tag) { return new Element(this, tag); }
    createTextNode(text) { const node = this.createElement('text'); node.textContent = text; return node; }
    getElementById(id) { return this.querySelector('#' + id); }
}
function fixture({stored, storage = new Map(), frames = false, history = false, blocked = false, panel = true} = {}) {
    if (stored !== undefined) storage.set(storageKey, stored);
    const top = new Document(); const doc = frames ? new Document() : top;
    const messageDoc = frames ? new Document() : doc;
    const event = class { constructor(type, options) { this.type = type; Object.assign(this, options); } };
    function win(document) { const value = {document, frames: [], Event: event}; document.defaultView = value; return value; }
    const window = win(top);
    if (frames) window.frames = [win(doc), win(messageDoc)];
    const cr2 = doc.createElement('div'); cr2.id = 'cr2';
    const inner = doc.createElement('div'); inner.id = 'crdiv2'; cr2.append(inner);
    const form = doc.createElement('form'); form.name = 'f'; inner.append(form);
    if (panel) doc.body.append(cr2);
    const field = doc.createElement('input'); field.id = 'msg'; field.name = 'textarea';
    const submit = doc.createElement('input'); submit.type = 'submit'; submit.name = 'submit_text';
    const sent = []; submit.addEventListener('click', () => { sent.push(field.value); field.value = ''; });
    form.append(field, submit);
    const idle = messageDoc.createElement('span'); idle.id = 'idle'; idle.textContent = '00:00'; messageDoc.body.append(idle);
    const errors = []; let tick;
    const context = vm.createContext({
        window, document: top, location: {pathname: history ? '/room/history.html' : '/room/'},
        localStorage: {
            getItem(key) { if (blocked) throw new Error('Storage blocked'); return storage.get(key) ?? null; },
            setItem(key, value) { if (blocked) throw new Error('Storage blocked'); storage.set(key, value); }
        },
        console: {error: (...args) => errors.push(args.map(String).join(' '))},
        setInterval(callback) { tick = callback; }
    });
    vm.runInContext(source, context, {filename: 'export.user.js'});
    function at(value) { idle.textContent = value; tick(); assert.deepEqual(errors, []); }
    function save(value, enter = false) {
        const input = doc.getElementById('xchat-idle-interval'); assert.ok(input, 'Interval input exists');
        input.value = String(value);
        if (enter) {
            let prevented = false;
            input.dispatchEvent({type: 'keydown', key: 'Enter', preventDefault() {prevented = true;}, stopPropagation() {}});
            assert.equal(prevented, true);
        } else doc.querySelector('#xchat-tools-idle button').click();
    }
    assert.deepEqual(errors, []);
    return {doc, top, field, submit, idle, sent, storage, at, save, tick, cr2, form};
}

test('default 10 minutes; sends at boundary, once per idle period', () => {
    const f = fixture();
    assert.equal(f.doc.getElementById('xchat-idle-interval').value, '10');
    assert.equal(f.form.nextElementSibling.id, 'xchat-tools-settings');
    f.at('09:59'); assert.deepEqual(f.sent, []);
    f.at('10:00'); assert.deepEqual(f.sent, ['/S']);
    f.at('10:01'); assert.deepEqual(f.sent, ['/S']);
    f.at('00:00'); f.at('10:00'); assert.deepEqual(f.sent, ['/S', '/S']);
});
test('shorter interval takes effect immediately but never overwrites a draft', () => {
    const f = fixture(); f.at('07:00'); f.field.value = 'Rozepsaná zpráva'; f.save(5);
    f.at('07:01'); assert.deepEqual(f.sent, []); assert.equal(f.field.value, 'Rozepsaná zpráva');
    f.field.value = ''; f.at('07:02'); assert.deepEqual(f.sent, ['/S']);
    f.save(3); f.at('07:03'); assert.deepEqual(f.sent, ['/S']);
});
test('longer interval saved with Enter survives script reload and supports hours', () => {
    const f = fixture(); f.save(65, true); f.at('10:00'); assert.deepEqual(f.sent, []);
    const again = fixture({storage: f.storage});
    assert.equal(again.doc.getElementById('xchat-idle-interval').value, '65');
    again.at('01:04:59'); assert.deepEqual(again.sent, []);
    again.at('01:05:00'); assert.deepEqual(again.sent, ['/S']);
});
test('invalid edits leave the active interval and stored value untouched', () => {
    const f = fixture({stored: '5'});
    for (const invalid of ['', '0', '-1', '1.5', 'NaN', 'Infinity', '1e100', '9007199254740991']) {
        f.save(invalid);
        assert.equal(f.doc.getElementById('xchat-idle-interval').getAttribute('aria-invalid'), 'true');
        assert.equal(f.storage.get(storageKey), '5');
    }
    f.at('04:59'); assert.deepEqual(f.sent, []);
    f.at('05:00'); assert.deepEqual(f.sent, ['/S']);
    f.save(4); assert.equal(f.doc.getElementById('xchat-idle-interval').getAttribute('aria-invalid'), null);
});
test('invalid stored values fall back to ten minutes', () => {
    for (const stored of ['bad', '', '0', '-1', '2.5', 'Infinity', '1e100']) {
        const f = fixture({stored}); assert.equal(f.doc.getElementById('xchat-idle-interval').value, '10');
        f.at('09:59'); assert.deepEqual(f.sent, []);
    }
});
test('disabled/read-only inputs, disabled submit and invalid timer cannot send', () => {
    const f = fixture({stored: '1'});
    for (const invalid of ['loading', '1:99', '01:00:99']) { f.at(invalid); assert.deepEqual(f.sent, []); }
    f.field.disabled = true; f.at('02:00'); assert.deepEqual(f.sent, []); f.field.disabled = false;
    f.field.readOnly = true; f.at('02:00'); assert.deepEqual(f.sent, []); f.field.readOnly = false;
    f.submit.disabled = true; f.at('02:00'); assert.deepEqual(f.sent, []); f.submit.disabled = false;
    f.at('02:00'); assert.deepEqual(f.sent, ['/S']);
});
test('history exports remain available but no automatic command is sent', () => {
    const f = fixture({history: true, stored: '1'}); f.at('20:00');
    assert.deepEqual(f.sent, []); assert.equal(f.doc.getElementById('xchat-idle-interval'), null);
    assert.ok(f.doc.getElementById('xchat-export-controls'));
});
test('settings work across frames, survive sidebar replacement and do not duplicate', () => {
    const f = fixture({frames: true}); f.save(7); f.tick(); f.tick();
    assert.equal(f.doc.querySelectorAll('#xchat-idle-interval').length, 1);
    f.doc.getElementById('xchat-tools-settings').remove(); f.tick();
    assert.equal(f.doc.getElementById('xchat-idle-interval').value, '7');
    assert.equal(f.form.nextElementSibling.id, 'xchat-tools-settings');
    assert.ok(f.doc.getElementById('xchat-export-controls'));
    f.at('06:59'); assert.deepEqual(f.sent, []); f.at('07:00'); assert.deepEqual(f.sent, ['/S']);
});
test('late chat form creates settings once it becomes available', () => {
    const f = fixture({panel: false}); assert.equal(f.doc.getElementById('xchat-idle-interval'), null);
    f.doc.body.append(f.cr2); f.tick(); assert.ok(f.doc.getElementById('xchat-idle-interval'));
});
test('blocked storage reports temporary use and applies selected interval', () => {
    const f = fixture({blocked: true}); f.save(2);
    assert.match(f.doc.getElementById('xchat-idle-status').textContent, /nepovolil uložení/);
    f.at('02:00'); assert.deepEqual(f.sent, ['/S']);
});
test('existing export presence filter works alongside new settings', () => {
    const f = fixture(); const checkbox = f.doc.querySelector('.xchat-export-hide-presence');
    checkbox.checked = true; checkbox.dispatchEvent({type: 'change'});
    assert.equal(f.storage.get('kamdar.xchat.export.hidePresence'), '1');
    f.save(5); assert.equal(f.storage.get('kamdar.xchat.export.hidePresence'), '1');
});
test('main loader references actual module versions and the 1.7.0 release', () => {
    const main = fs.readFileSync(path.join(root, 'xchat.user.js'), 'utf8');
    assert.match(main, /@version\s+1\.7\.0/);
    for (const module of ['export', 'reklamy', 'mistnost', 'historie', 'zvuky', 'precteno']) {
        const content = fs.readFileSync(path.join(root, module + '.user.js'), 'utf8');
        const version = content.match(/@version\s+(\S+)/)[1];
        assert.ok(main.includes(`${module}.user.js?v=${version}`));
    }
});
