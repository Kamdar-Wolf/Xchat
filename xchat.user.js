// ==UserScript==
// @name         XChat – Vše v jednom
// @namespace    kamdar.xchat.all
// @version      1.5.0
// @description  Export a neaktivita, skrytí reklam, vyplnění místnosti, celá historie, zvuková upozornění a čára přečtených zpráv.
// @homepageURL  https://github.com/Kamdar-Wolf/Xchat/
// @updateURL    https://github.com/Kamdar-Wolf/Xchat/raw/refs/heads/main/xchat.user.js
// @downloadURL  https://github.com/Kamdar-Wolf/Xchat/raw/refs/heads/main/xchat.user.js
// @match        https://www.xchat.cz/*
// @run-at       document-idle
// @grant        none
// @noframes
// @require      https://github.com/Kamdar-Wolf/Xchat/raw/refs/heads/main/export.user.js?v=2.4.2
// @require      https://github.com/Kamdar-Wolf/Xchat/raw/refs/heads/main/reklamy.user.js?v=2.1.2
// @require      https://github.com/Kamdar-Wolf/Xchat/raw/refs/heads/main/mistnost.user.js?v=1.0.1
// @require      https://github.com/Kamdar-Wolf/Xchat/raw/refs/heads/main/historie.user.js?v=1.1.2
// @require      https://github.com/Kamdar-Wolf/Xchat/raw/refs/heads/main/zvuky.user.js?v=1.6.0
// @require      https://github.com/Kamdar-Wolf/Xchat/raw/refs/heads/main/precteno.user.js?v=1.1.2
// ==/UserScript==

// Moduly spustí Tampermonkey v pořadí @require před tímto tělem.
// Při vydání změny zvyš @version tohoto skriptu i ?v= změněného modulu.
// Metadata a aktualizační odkazy jednotlivých modulů se při @require neuplatňují.
(() => {
    'use strict';
})();
