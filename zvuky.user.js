// ==UserScript==
// @name         XChat – Zvuková výstraha na nick
// @namespace    kamdar.xchat.sound
// @version      1.5.0
// @description  Zvuky, vlastní MP3 a zvýraznění zmínek a šeptání přihlášenému uživateli.
// @match        https://www.xchat.cz/*
// @run-at       document-idle
// @grant        none
// @noframes
// @homepageURL  https://github.com/Martin-CHT/Xchat/
// @updateURL    https://github.com/Martin-CHT/Xchat/raw/refs/heads/main/zvuky.user.js
// @downloadURL  https://github.com/Martin-CHT/Xchat/raw/refs/heads/main/zvuky.user.js
// ==/UserScript==

(() => {
    'use strict';

    // ============================================================
    //                   SLEDOVANÉ VÝRAZY A NICKY
    // ============================================================

    const WATCHED_TERMS = [
        'Sidian',
        'Woif',
        // 'Kamdar',
        // 'ahoj všichni',
    ];

    const WHISPER_NICKS = [
        'Sidian',
        'Woif',
        // 'Kamdar',
    ];

    // 1. NASTAVENÍ NAHRÁVEK: každý typ má vlastní URL a hlasitost 0–1.
    // Prázdná URL používá původní tóny definované v SOUND_* níže.
    // Volby uložené přes panel v chatu mají přednost před těmito výchozími hodnotami.
    const AUDIO_DEFAULTS = {
        message: { url: 'https://github.com/Kamdar-Wolf/Xchat/raw/refs/heads/main/Zvuky/receive.wav', volume: 1.0 },
        arrival: { url: 'https://github.com/Kamdar-Wolf/Xchat/raw/refs/heads/main/Zvuky/login.wav', volume: 1.0 },
        departure: { url: 'https://github.com/Kamdar-Wolf/Xchat/raw/refs/heads/main/Zvuky/logout.wav', volume: 1.0 },
    };
    const SOUND_TYPES = {
        message: { label: 'Zpráva / zmínka / šeptání', description: 'Zmínka přihlášeného nicku, příchozí šeptání nebo shoda se sledovaným výrazem či příjemcem.' },
        arrival: { label: 'Příchod do místnosti', description: 'Systémová zpráva o vstupu kteréhokoli uživatele do místnosti.' },
        departure: { label: 'Odchod z místnosti', description: 'Systémová zpráva o odchodu, odpojení nebo vyhození uživatele.' },
    };
    const AUDIO_KEY = 'kamdar.xchat.audioSettings';
    const HIGHLIGHT_KEY = 'kamdar.xchat.highlightSelf';
    const NICK_SELECTOR = 'body > form > table > tbody > tr > td.tdb > strong';
    const audioSettings = Object.fromEntries(Object.entries(AUDIO_DEFAULTS).map(([kind, config]) => [kind, { ...config }]));
    let highlightEnabled = true;
    try {
        const stored = JSON.parse(localStorage.getItem(AUDIO_KEY) || 'null');
        for (const kind of Object.keys(SOUND_TYPES)) {
            if (typeof stored?.[kind]?.url === 'string') audioSettings[kind].url = stored[kind].url;
            if (Number.isFinite(stored?.[kind]?.volume)) audioSettings[kind].volume = Math.max(0, Math.min(1, stored[kind].volume));
        }
        // Převod MP3 zprávy ze starší verze bez ztráty uživatelova nastavení.
        if (!stored) audioSettings.message.url = localStorage.getItem('kamdar.xchat.messageAudioUrl') ?? AUDIO_DEFAULTS.message.url;
        highlightEnabled = localStorage.getItem(HIGHLIGHT_KEY) !== '0';
    } catch { /* Při nedostupném úložišti fungují nastavení po dobu otevřené stránky. */ }
    let ownNick = '';
    let ownPattern = null;
    // Přehrávač i stav jsou oddělené: chyba MP3 příchodu neovlivní zvuk zprávy.
    const mediaPlayers = new Map();
    const mediaStates = new Map();

    const WHOLE_WORDS = true;
    const INCLUDE_SYSTEM = true;

    // Příchody a odchody hlídají všechny uživatele.
    const NOTIFY_ARRIVALS = true;
    const NOTIFY_DEPARTURES = true;

    // ============================================================
    //                  LEGENDA TÓNŮ — FREKVENCE Hz
    // ============================================================
    //
    // Vyšší frekvence = vyšší tón.
    // Každá další oktáva má dvojnásobnou frekvenci.
    // Ladění A4 = 440 Hz.
    //
    // Tón          Oktáva 4       Oktáva 5       Oktáva 6
    // ------------------------------------------------------------
    // C             261.63         523.25        1046.50
    // C# / Db       277.18         554.37        1108.73
    // D             293.66         587.33        1174.66
    // D# / Eb       311.13         622.25        1244.51
    // E             329.63         659.25        1318.51
    // F             349.23         698.46        1396.91
    // F# / Gb       369.99         739.99        1479.98
    // G             392.00         783.99        1567.98
    // G# / Ab       415.30         830.61        1661.22
    // A             440.00         880.00        1760.00
    // A# / Bb       466.16         932.33        1864.66
    // B (= české H) 493.88         987.77        1975.53
    //
    // Anglické B = české H; anglické Bb = české B.
    //
    // PARAMETRY ZVUKU:
    // volume: hlasitost 0 až 1
    // wave: 'sine', 'triangle', 'square', 'sawtooth'
    // hz: frekvence tónu
    // start: začátek tónu v sekundách
    // duration: délka tónu v sekundách
    // attack: délka náběhu hlasitosti v sekundách
    //
    // O oktávu níže: vyděl všechna hz dvěma.
    // O oktávu výše: vynásob všechna hz dvěma.
    // ============================================================

    // ============================================================
    //              ZVUK 1 — UPOZORNĚNÍ NA ZPRÁVU
    //                  Jemné zazvonění E5–H5
    // ============================================================

    const SOUND_MESSAGE = {
        volume: 0.12,
        wave: 'sine',
        attack: 0.015,
        notes: [
            { hz: 659.25, start: 0.00, duration: 0.45 },
            { hz: 987.77, start: 0.18, duration: 0.55 },
        ],
    };

    // ============================================================
    //                    ZVUK 2 — PŘÍCHOD
    //                Vzestupná melodie C5–E5–G5
    // ============================================================

    const SOUND_ARRIVAL = {
        volume: 0.12,
        wave: 'sine',
        attack: 0.020,
        notes: [
            { hz: 523.25, start: 0.00, duration: 0.22 },
            { hz: 659.25, start: 0.14, duration: 0.22 },
            { hz: 783.99, start: 0.28, duration: 0.35 },
        ],
    };

    // ============================================================
    //                     ZVUK 3 — ODCHOD
    //                Sestupná melodie G5–E5–C5
    // ============================================================

    const SOUND_DEPARTURE = {
        volume: 0.12,
        wave: 'sine',
        attack: 0.020,
        notes: [
            { hz: 783.99, start: 0.00, duration: 0.22 },
            { hz: 659.25, start: 0.14, duration: 0.22 },
            { hz: 523.25, start: 0.28, duration: 0.35 },
        ],
    };

    // ============================================================
    //              ROZPOZNÁNÍ PŘÍCHODŮ A ODCHODŮ
    // ============================================================

    const ARRIVAL_PATTERN =
        /(?:vstoupil[ao]?|vešel|vešla|přišel|přišla)\s+(?:do\s+)?místnosti|připojil[ao]?\s+se\s+(?:do|k)\s+místnosti/iu;

    const DEPARTURE_PATTERN =
        /opustil[ao]?\s+místnost|(?:odešel|odešla|vystoupil[ao]?)\s+(?:z|ze)\s+místnosti|odpojil[ao]?\s+se|(?:byl|byla)\s+(?:vyhozen|vyhozena|odpojen|odpojena)/iu;

    // ============================================================
    //                        TECHNICKÁ ČÁST
    // ============================================================

    const sounds = {
        message: SOUND_MESSAGE,
        arrival: SOUND_ARRIVAL,
        departure: SOUND_DEPARTURE,
    };

    const seen = new Map();
    const connectedDocuments = new WeakSet();
    const lastPlayed = new Map();

    let initialized = false;
    let audio = null;
    let nextSoundAt = 0;

    function normalize(value) {
        return String(value)
            .normalize('NFC')
            .replace(/\u00a0/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function escapeRegex(value) {
        return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    const patterns = WATCHED_TERMS
        .map(normalize)
        .filter(Boolean)
        .map(term => {
            const escaped = escapeRegex(term);

            return new RegExp(
                WHOLE_WORDS
                    ? '(^|[^\\p{L}\\p{N}_])'
                        + escaped
                        + '(?=$|[^\\p{L}\\p{N}_])'
                    : escaped,
                'iu'
            );
        });

    const recipients = new Set(
        WHISPER_NICKS
            .map(normalize)
            .filter(Boolean)
            .map(nick => nick.toLocaleLowerCase())
    );

    // ---------- Rámy stránky ----------

    function getDocuments() {
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

        visit(window);
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

    // ---------- Přihlášený nick a zvýraznění ----------
    function updateOwnNick(documents) {
        const nick = normalize(findElement(NICK_SELECTOR, documents)?.textContent || '');
        if (nick === ownNick) return;
        ownNick = nick;
        ownPattern = nick ? new RegExp("(^|[^\\p{L}\\p{N}_])" + escapeRegex(nick) + "(?=$|[^\\p{L}\\p{N}_])", 'iu') : null;
    }
    function markRow(row, mention = false, whisper = false) {
        row.classList.toggle('xchat-self-mention', highlightEnabled && mention && !whisper);
        row.classList.toggle('xchat-self-whisper', highlightEnabled && whisper);
    }
    function installHighlightStyles(documents) {
        for (const doc of documents) {
            if (doc.getElementById('xchat-self-highlight-style')) continue;
            const style = doc.createElement('style');
            style.id = 'xchat-self-highlight-style';
            style.textContent = '.xchat-self-mention { background: #fff0ad !important; color: #241b00 !important; box-shadow: inset 4px 0 #d69500; padding-left: 7px; }'
                + '.xchat-self-whisper { background: #e7d9ff !important; color: #25103d !important; box-shadow: inset 4px 0 #8545c1; padding-left: 7px; }';
            (doc.head || doc.documentElement)?.appendChild(style);
        }
    }

    // 2. PŘEHRÁNÍ MP3: samostatný přehrávač pro každý typ události.
    function playFileAudio(kind) {
        const config = audioSettings[kind];
        try {
            const url = new URL(config.url);
            if (url.protocol !== 'https:') throw new Error('Použij přímý HTTPS odkaz na zvuk.');
            let player = mediaPlayers.get(kind);
            if (!player) {
                player = new window.Audio(url.href);
                player.preload = 'auto';
                mediaPlayers.set(kind, player);
            }
            player.volume = config.volume;
            player.currentTime = 0;
            mediaStates.set(kind, 'Načítání nahrávky…');
            const currentPlayer = player;
            Promise.resolve(player.play()).then(() => {
                if (mediaPlayers.get(kind) !== currentPlayer) return;
                mediaStates.set(kind, 'MP3 připravena');
                updateStatus();
            }).catch(error => {
                if (mediaPlayers.get(kind) !== currentPlayer) return;
                mediaStates.set(kind, error.name === 'NotAllowedError'
                    ? 'Přehrávání blokováno — klikni na Test.'
                    : 'Chyba MP3 — ověř přímý odkaz a dostupnost souboru.');
                console.warn('XChat: ' + SOUND_TYPES[kind].label, error);
                updateStatus();
            });
        } catch (error) {
            mediaStates.set(kind, error.message);
        }
        updateStatus();
    }

    // 3. STAV OVLÁDÁNÍ: každý řádek říká, zda používá MP3 nebo původní melodii.
    function updateStatus() {
        for (const doc of getDocuments()) {
            for (const kind of Object.keys(SOUND_TYPES)) {
                const status = doc.getElementById('xchat-audio-status-' + kind);
                if (!status) continue;
                status.textContent = audioSettings[kind].url
                    ? (mediaStates.get(kind) || 'Vlastní MP3 — vyzkoušej tlačítkem Test')
                    : (audio?.state === 'running' ? 'Původní melodie — připravena' : 'Původní melodie — povol tlačítkem Test');
            }
        }
    }

    // Web Audio se používá jen pro původní syntetické melodie.


    function createAudio() {
        if (audio) return;

        const Constructor =
            window.AudioContext || window.webkitAudioContext;

        if (!Constructor) {
            throw new Error('Prohlížeč nepodporuje AudioContext.');
        }

        audio = new Constructor();
        audio.addEventListener('statechange', updateStatus);

        audio.resume().then(updateStatus).catch(error => {
            console.warn('XChat: automatický zvuk je blokovaný.', error);
            updateStatus();
        });
    }

    function unlockAudio() {
        try {
            createAudio();

            return audio.resume().then(() => {
                updateStatus();
                return audio.state === 'running';
            });
        } catch (error) {
            console.error('XChat: zvuk nelze aktivovat.', error);
            return Promise.resolve(false);
        }
    }

    function connectInteractions(documents) {
        for (const doc of documents) {
            if (connectedDocuments.has(doc)) continue;
            connectedDocuments.add(doc);

            const activate = event => {
                if (event.isTrusted && audio?.state !== 'running') {
                    unlockAudio();
                }
            };

            doc.addEventListener('click', activate, true);
            doc.addEventListener('keydown', activate, true);
        }
    }

    // 4. VÝBĚR ZDROJE: vlastní MP3 má přednost, prázdná URL přehrává SOUND_* tóny.
    // Omezení 1,5 s platí zvlášť pro každý typ; ruční Test jej obchází.

    function playSound(kind, test = false) {
        if (!SOUND_TYPES[kind]) return;
        if (audioSettings[kind].url) {
            const now = performance.now();
            if (!test && now - (lastPlayed.get(kind) ?? -Infinity) < 1500) return;
            lastPlayed.set(kind, now);
            playFileAudio(kind);
            return;
        }
        if (!audio || audio.state !== 'running') {
            updateStatus();
            return;
        }

        const config = sounds[kind];
        if (!config || !config.notes.length) return;

        const now = performance.now();
        const previous = lastPlayed.get(kind) ?? -Infinity;

        if (!test && now - previous < 1500) return;
        lastPlayed.set(kind, now);

        const base = Math.max(audio.currentTime + 0.02, nextSoundAt);
        const volume = Math.max(0, Math.min(1, config.volume));
        let totalDuration = 0;

        for (const note of config.notes) {
            const startOffset = Math.max(0, note.start);
            const duration = Math.max(0.05, note.duration);
            const start = base + startOffset;
            const end = start + duration;

            const attack = Math.max(
                0.005,
                Math.min(config.attack, duration / 3)
            );

            const oscillator = audio.createOscillator();
            const gain = audio.createGain();

            oscillator.type = config.wave;
            oscillator.frequency.value = Math.max(20, note.hz);

            gain.gain.setValueAtTime(0, start);
            gain.gain.linearRampToValueAtTime(
                Math.max(0.0001, volume),
                start + attack
            );
            gain.gain.exponentialRampToValueAtTime(0.0001, end);
            gain.gain.setValueAtTime(0, end + 0.01);

            oscillator.connect(gain);
            gain.connect(audio.destination);

            oscillator.onended = () => {
                oscillator.disconnect();
                gain.disconnect();
            };

            oscillator.start(start);
            oscillator.stop(end + 0.02);

            totalDuration = Math.max(
                totalDuration,
                startOffset + duration
            );
        }

        nextSoundAt = base + totalDuration + 0.12;
    }

    // 5. ROZPOZNÁNÍ UDÁLOSTI: nejprve příchod/odchod, potom zmínky a šeptání.

    function parseRow(row) {
        markRow(row);
        if (row.id === 'splash') return null;

        const text = normalize(row.textContent);
        const time = text.match(/^(\d{1,2}:\d{2}:\d{2})\s*/);
        if (!time) return null;

        const content = text.slice(time[0].length);
        const signature = JSON.stringify([time[1], content]);
        const event = row.querySelector('.systemtext');

        if (event) {
            const eventText = normalize(event.textContent);

            if (
                NOTIFY_ARRIVALS
                && (
                    event.querySelector('.system.in')
                    || ARRIVAL_PATTERN.test(eventText)
                )
            ) {
                return { signature, kind: 'arrival' };
            }

            if (
                NOTIFY_DEPARTURES
                && (
                    event.querySelector('.system.out')
                    || DEPARTURE_PATTERN.test(eventText)
                )
            ) {
                return { signature, kind: 'departure' };
            }

            return { signature, kind: null };
        }

        if (row.querySelector('.umsg_advert, .advert')) {
            return { signature, kind: null };
        }

        const firstBold = row.querySelector('b, strong');
        const label = normalize(firstBold?.textContent || '');

        const whisper = label.match(
            /^(.+?)\s*(?:->|→)\s*([^:]+?)\s*:/
        );

        const isSystem = Boolean(row.querySelector('.umsg_wsystem'));

        const hasHeader = label.endsWith(':')
            && content.startsWith(label);

        const message = hasHeader
            ? content.slice(label.length).trim()
            : content;

        const recipient = normalize(whisper?.[2] || '')
            .toLocaleLowerCase();

        const sender = normalize(whisper?.[1] || label.replace(/:\s*$/, '')).toLocaleLowerCase();
        const self = ownNick.toLocaleLowerCase();
        const fromSelf = Boolean(self && sender === self);
        const personalWhisper = Boolean(self && !fromSelf && recipient === self && !isSystem);
        const personalMention = Boolean(ownPattern && !fromSelf && !isSystem
            && (!whisper || recipient === self) && ownPattern.test(message));
        markRow(row, personalMention, personalWhisper);

        const matches = personalWhisper || personalMention || (INCLUDE_SYSTEM || !isSystem)
            && (
                recipients.has(recipient)
                || patterns.some(pattern => pattern.test(message))
            );

        return {
            signature,
            kind: matches ? 'message' : null,
        };
    }

    // 6. NOVÉ ZPRÁVY: první výpis je tichý, opakovaná kontrola nehraje staré zprávy.

    function scan(board) {
        const occurrences = new Map();
        const notifications = new Set();

        for (const row of Array.from(board.children).reverse()) {
            const record = parseRow(row);
            if (!record) continue;

            const count = (
                occurrences.get(record.signature) || 0
            ) + 1;

            occurrences.set(record.signature, count);

            const previous = seen.get(record.signature) || 0;

            if (initialized && count > previous && record.kind) {
                notifications.add(record.kind);
            }
        }

        for (const [signature, count] of occurrences) {
            seen.set(
                signature,
                Math.max(seen.get(signature) || 0, count)
            );
        }

        initialized = true;

        for (const kind of notifications) {
            playSound(kind);
        }
    }

    // 7. NASTAVENÍ V CHATU: každý typ má vlastní URL, hlasitost, Test a obnovení tónů.
    // Společné místo pro ovládání. Každý modul funguje i při samostatné instalaci.
    function settingsSection(documents, name, title, order) {
        for (const doc of documents) {
            const form = doc.querySelector('div#cr2.ac > div.cr > div.crdiv2 > form');
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

    function installControl(documents) {
        const panel = settingsSection(documents, 'audio', 'Zvuky a zvýraznění', 40);
        if (!panel) return;
        const doc = panel.ownerDocument;
        if (doc.getElementById('xchat-sound-control')) return;
        const wrapper = doc.createElement('span');
        wrapper.id = 'xchat-sound-control';
        wrapper.style.cssText = 'display:flex;flex-direction:column;align-items:flex-start;gap:6px;white-space:normal;';
        const settings = doc.createElement('details');
        settings.id = 'xchat-audio-settings';
        settings.open = false;
        settings.style.cssText = 'clear:both;padding:12px;margin:8px 0;background:#fafafa;color:#222;border:1px solid #aaa;font:13px Arial,sans-serif;';
        const heading = doc.createElement('summary');
        heading.textContent = 'Nastavení zvuků — zprávy, příchody a odchody';
        heading.style.cursor = 'pointer';
        heading.style.margin = '0 0 8px';
        const help = doc.createElement('p');
        help.textContent = 'Každý typ má vlastní nahrávku. Prázdný odkaz = původní melodie. Uložit použije nastavení, Test ho přehraje. Hlasitost platí pro MP3; hlasitost původních tónů je v SOUND_* v kódu.';
        settings.append(heading, help);
        for (const [kind, type] of Object.entries(SOUND_TYPES)) {
            const group = doc.createElement('fieldset');
            group.style.cssText = 'margin:8px 0;padding:10px;min-width:0;';
            const legend = doc.createElement('legend');
            legend.textContent = type.label;
            legend.style.fontWeight = 'bold';
            const description = doc.createElement('p');
            description.textContent = type.description;
            description.style.margin = '0 0 8px';
            const urlLabel = doc.createElement('label');
            urlLabel.textContent = 'Přímý HTTPS odkaz na MP3: ';
            const input = doc.createElement('input');
            input.type = 'url';
            input.value = audioSettings[kind].url;
            input.placeholder = 'https://…/oznameni.mp3';
            input.style.cssText = 'width:100%;box-sizing:border-box;margin:4px 0 8px;';
            urlLabel.appendChild(input);
            const volumeLabel = doc.createElement('label');
            volumeLabel.textContent = 'Hlasitost MP3 (0–1): ';
            const volume = doc.createElement('input');
            volume.type = 'number'; volume.min = '0'; volume.max = '1'; volume.step = '0.05';
            volume.value = String(audioSettings[kind].volume);
            volume.style.width = '65px';
            volumeLabel.appendChild(volume);
            const status = doc.createElement('p');
            status.id = 'xchat-audio-status-' + kind;
            status.setAttribute('aria-live', 'polite');
            const save = () => {
                const url = input.value.trim();
                const loudness = Number(volume.value);
                try { if (url && new URL(url).protocol !== 'https:') throw new Error(); }
                catch { doc.defaultView.alert(type.label + ': zadej platný přímý HTTPS odkaz.'); return false; }
                if (!volume.value.trim() || !Number.isFinite(loudness) || loudness < 0 || loudness > 1) {
                    doc.defaultView.alert(type.label + ': hlasitost musí být číslo 0 až 1.'); return false;
                }
                mediaPlayers.get(kind)?.pause();
                mediaPlayers.delete(kind);
                mediaStates.delete(kind);
                audioSettings[kind] = { url, volume: loudness };
                try { localStorage.setItem(AUDIO_KEY, JSON.stringify(audioSettings)); }
                catch { doc.defaultView.alert('Nastavení platí pro tuto stránku; prohlížeč nepovolil jeho trvalé uložení.'); }
                updateStatus();
                return true;
            };
            const button = (label, action) => {
                const el = doc.createElement('button');
                el.type = 'button'; el.textContent = label;
                el.style.marginLeft = '8px'; el.addEventListener('click', action);
                return el;
            };
            const saveButton = button('Uložit', save);
            const test = button('Test', () => {
                if (!save()) return;
                // MP3 se musí spustit přímo během kliknutí, ještě před await.
                if (audioSettings[kind].url) playSound(kind, true);
                else unlockAudio().then(ready => { if (ready) playSound(kind, true); });
            });
            const reset = button('Původní melodie', () => { input.value = ''; save(); });
            group.append(legend, description, urlLabel, volumeLabel, saveButton, test, reset, status);
            settings.appendChild(group);
        }
        const highlight = doc.createElement('a');
        highlight.href = '#'; highlight.className = 'xchat-highlight-status';
        highlight.style.marginLeft = '8px';
        highlight.addEventListener('click', event => {
            event.preventDefault(); highlightEnabled = !highlightEnabled;
            try { localStorage.setItem(HIGHLIGHT_KEY, highlightEnabled ? '1' : '0'); } catch {}
            tick();
        });
        wrapper.appendChild(highlight);
        panel.append(wrapper, settings);
        updateStatus();
    }

    // 8. PRŮBĚŽNÁ KONTROLA: zvuky jen ze živého chatu, kopie historie jen zvýrazníme.


    function tick() {
        try {
            const documents = getDocuments();
            const board = findElement('#board', documents);

            updateOwnNick(documents);
            installHighlightStyles(documents);
            connectInteractions(documents);
            installControl(documents);
            if (board) scan(board);
            for (const doc of documents) {
                const history = doc.getElementById('kamdar-full-history-view');
                if (history) for (const row of history.children) parseRow(row);
                const control = doc.querySelector('.xchat-highlight-status');
                if (control) {
                    control.textContent = 'Zvýraznění: ' + (highlightEnabled ? 'zapnuto' : 'vypnuto');
                    control.title = ownNick ? 'Přihlášený nick: ' + ownNick : 'Čekám na nick ve spodní liště.';
                }
            }
            updateStatus();
        } catch (error) {
            console.error('XChat: chyba zvukové výstrahy.', error);
        }
    }

    setInterval(tick, 1000);
    tick();
})();