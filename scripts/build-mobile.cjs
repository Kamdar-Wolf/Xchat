// Standalone distribution: the private repository is not needed at runtime.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'mobile/package.json'), 'utf8')).version;
const original = fs.readFileSync(path.join(root, 'zvuky.user.js'), 'utf8');
const audioBlock = original.match(/const BUNDLED_AUDIO = \{([\s\S]*?)\n    \};/)?.[1];
if (!audioBlock) throw new Error('Bundled desktop audio not found');
const audio = {};
for (const kind of ['message', 'arrival', 'departure']) {
    const value = audioBlock.match(new RegExp(kind + ': ("[^"\\n]+")'))?.[1];
    if (!value) throw new Error('Missing audio: ' + kind);
    audio[kind] = JSON.parse(value);
    if (!audio[kind].startsWith('data:audio/wav;base64,')) throw new Error('Invalid audio: ' + kind);
}
const roomSource = fs.readFileSync(path.join(root, 'mistnost.user.js'), 'utf8');
const roomLiteral = roomSource.match(/const VALUES = Object.freeze\((\{[\s\S]*?\})\);/)?.[1];
if (!roomLiteral) throw new Error('Room template missing');
const header = `// ==UserScript==
// @name         XChat – Mobilní sada
// @namespace    kamdar.xchat.mobile
// @version      ${version}
// @description  Mobilní XChat: časované /s, plynulé načítání, historie, export, zvuky, zvýraznění a nastavení.
// @match        https://m.xchat.cz/*
// @run-at       document-end
// @grant        none
// @noframes
// @homepageURL  https://github.com/Kamdar-Wolf/Xchat/
// @updateURL    https://github.com/Kamdar-Wolf/Xchat/raw/refs/heads/main/xchat-mobile.meta.js
// @downloadURL  https://github.com/Kamdar-Wolf/Xchat/raw/refs/heads/main/xchat-mobile.user.js
// ==/UserScript==
`;
const sources = ['core', 'messages', 'audio', 'export', 'network', 'ui', 'app'].map(name =>
    '\n// --- mobile/src/' + name + '.js ---\n' + fs.readFileSync(path.join(root, 'mobile/src', name + '.js'), 'utf8'));
const bundle = header + `\n(() => {\n'use strict';\nif (location.hostname !== 'm.xchat.cz' || window.top !== window) return;\nconst M = {version: ${JSON.stringify(version)}};\nM.bundledAudio = ${JSON.stringify(audio)};\nM.roomDefaults = ${roomLiteral};\n` + sources.join('\n') + '\n/* MOBILE_TEST_HOOK */\n})();\n';
const outputs = {'xchat-mobile.user.js': bundle, 'xchat-mobile.meta.js': header};
for (const [name, content] of Object.entries(outputs)) {
    const destination = path.join(root, name);
    if (process.argv.includes('--check')) {
        if (!fs.existsSync(destination) || fs.readFileSync(destination, 'utf8') !== content) throw new Error(name + ' differs from source. Run node scripts/build-mobile.cjs.');
    } else fs.writeFileSync(destination, content);
}
console.log(process.argv.includes('--check') ? 'Mobile bundle matches source.' : `Built mobile ${version}: ${Buffer.byteLength(bundle)} bytes.`);
