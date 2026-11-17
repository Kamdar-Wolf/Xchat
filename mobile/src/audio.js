((M) => {
    const players = new Map(); const lastPlayed = new Map();
    let context;
    M.audioUnlocked = false;
    M.audioStatus = {};
    const notes = {
        message: [[659.25, 0, .45], [987.77, .18, .55]],
        arrival: [[523.25, 0, .22], [659.25, .14, .22], [783.99, .28, .35]],
        departure: [[783.99, 0, .22], [659.25, .14, .22], [523.25, .28, .35]]
    };
    function player(kind) {
        const config = M.settings.sounds[kind];
        const url = config.source === 'bundled' ? M.bundledAudio[kind] : config.url;
        if (!url || (config.source === 'custom' && !/^https:\/\//i.test(url))) throw new Error('Zadej veřejný HTTPS odkaz na MP3 nebo WAV.');
        let current = players.get(kind);
        if (!current || current.url !== url) {
            current?.audio.pause();
            const audio = new window.Audio(url); audio.preload = 'none';
            current = {audio, url}; players.set(kind, current);
        }
        current.audio.volume = config.volume;
        return current.audio;
    }
    function tones(kind) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) throw new Error('Prohlížeč nepodporuje syntetické tóny.');
        context ||= new AudioContext();
        const ready = context.resume();
        return Promise.resolve(ready).then(() => {
            for (const [hz, start, duration] of notes[kind]) {
                const osc = context.createOscillator(); const gain = context.createGain();
                const at = context.currentTime + start;
                osc.type = 'sine'; osc.frequency.value = hz;
                gain.gain.setValueAtTime(0, at);
                gain.gain.linearRampToValueAtTime(.12 * M.settings.sounds[kind].volume, at + .02);
                gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
                osc.connect(gain); gain.connect(context.destination);
                osc.start(at); osc.stop(at + duration);
                osc.onended = () => { osc.disconnect(); gain.disconnect(); };
            }
        });
    }
    async function play(kind, test = false) {
        if (!test && (!M.audioUnlocked || !M.settings.sounds[kind].enabled || Date.now() - (lastPlayed.get(kind) || 0) < 1500)) return;
        lastPlayed.set(kind, Date.now());
        try {
            if (M.settings.sounds[kind].source === 'tones') await tones(kind);
            else { const audio = player(kind); audio.currentTime = 0; audio.muted = false; await audio.play(); }
            M.audioUnlocked = true;
            M.audioStatus[kind] = 'Zvuk připraven.';
        } catch (error) {
            M.audioStatus[kind] = error.name === 'NotAllowedError' ? 'Klikni na Test nebo Povolit zvuky.' : 'Zvuk nelze přehrát. Ověř zdroj a jeho dostupnost.';
        }
        M.updateStatus?.();
    }
    async function unlockAudio() {
        const tasks = [];
        for (const kind of Object.keys(notes)) {
            if (M.settings.sounds[kind].source === 'tones') continue;
            try {
                const audio = player(kind); audio.muted = true;
                tasks.push(Promise.resolve(audio.play()).then(() => {
                    audio.pause(); audio.currentTime = 0; audio.muted = false;
                    M.audioStatus[kind] = 'Zvuk povolen.';
                }).catch(() => { audio.muted = false; M.audioStatus[kind] = 'Zvuk blokován nebo nedostupný. Použij Test.'; }));
            } catch { M.audioStatus[kind] = 'Nastav zdroj zvuku.'; }
        }
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) { context ||= new AudioContext(); tasks.push(context.resume()); }
        await Promise.allSettled(tasks);
        M.audioUnlocked = true; M.updateStatus?.();
    }
    function notifyMessages(records) {
        const kinds = new Set();
        for (const record of records) {
            if (record.advert) continue;
            if (record.presence) { kinds.add(record.presence); continue; }
            if ((record.system || record.systemWhisper) && !M.settings.includeSystem) continue;
            const personal = M.personal(record);
            const term = M.settings.watchedTerms.some(t => M.termMatches(record.text, t));
            const recipient = record.whisper && M.settings.whisperNicks.some(n => M.lower(n) === M.lower(record.recipient));
            if (personal.mention || personal.whisper || term || recipient) kinds.add('message');
        }
        for (const kind of kinds) void play(kind);
    }
    Object.assign(M, {play, unlockAudio, notifyMessages});
})(M);
