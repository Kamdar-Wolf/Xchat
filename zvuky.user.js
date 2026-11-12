// ==UserScript==
// @name         XChat – Zvuková výstraha na nick
// @namespace    kamdar.xchat.sound
// @version      1.2.2
// @description  Zvuky sledovaných zpráv, příchodů a odchodů uživatelů.
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
        // 'Kamdar',
        // 'ahoj všichni',
    ];

    const WHISPER_NICKS = [
        'Sidian',
        // 'Kamdar',
    ];

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

    // ---------- Aktivace zvuku ----------

    function updateStatus() {
        const link = findElement(
            '#xchat-sound-control .xchat-sound-status'
        );

        if (!link) return;

        const ready = audio?.state === 'running';

        link.textContent = ready
            ? 'Zvuk: zapnutý'
            : 'Zvuk: odblokovat';

        link.title = ready
            ? 'Zvuky jsou aktivní. Kliknutí otestuje zvuk zprávy.'
            : 'Kliknutím povol přehrávání zvuku.';
    }

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

    // ---------- Přehrávání melodií ----------

    function playSound(kind, test = false) {
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

    // ---------- Rozpoznání zpráv a událostí ----------

    function parseRow(row) {
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

        const matches = (INCLUDE_SYSTEM || !isSystem)
            && (
                recipients.has(recipient)
                || patterns.some(pattern => pattern.test(message))
            );

        return {
            signature,
            kind: matches ? 'message' : null,
        };
    }

    // ---------- Pouze nové záznamy ----------

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

    // ---------- Jediný odkaz v panelu ----------

    function installControl(documents) {
        const idle = findElement('#idleWrapper', documents);
        const panel = idle?.closest('p');
        if (!panel) return;

        const doc = panel.ownerDocument;
        if (doc.getElementById('xchat-sound-control')) return;

        const wrapper = doc.createElement('span');
        wrapper.id = 'xchat-sound-control';
        wrapper.style.cssText =
            'float:right;margin-left:10px;white-space:nowrap;';

        const link = doc.createElement('a');
        link.href = '#';
        link.className = 'xchat-sound-status';
        link.textContent = 'Zvuk: odblokovat';

        link.addEventListener('click', async event => {
            event.preventDefault();

            const ready = await unlockAudio();

            if (ready) {
                playSound('message', true);
            } else {
                alert(
                    'Prohlížeč blokuje zvuk. Povol pro XChat automatické přehrávání zvuku.'
                );
            }
        });

        wrapper.appendChild(link);
        panel.prepend(wrapper);
        updateStatus();
    }

    function tick() {
        try {
            const documents = getDocuments();
            const board = findElement('#board', documents);
            if (!board) return;

            createAudio();
            connectInteractions(documents);
            installControl(documents);
            scan(board);
            updateStatus();
        } catch (error) {
            console.error('XChat: chyba zvukové výstrahy.', error);
        }
    }

    setInterval(tick, 1000);
    tick();
})();