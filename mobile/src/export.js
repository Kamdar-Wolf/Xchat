((M) => {
    function exportRecords() { return M.archive.filter(row => !M.settings.omitPresence || !row.presence); }
    function pair(a, b) { return [M.lower(a), M.lower(b)].sort().join('\u2194'); }
    function exportHTML(records) {
        const users = new Map(); const pairs = new Map();
        for (const row of records) {
            for (const name of [row.sender, row.recipient]) if (name) users.set(M.lower(name), name);
            if (row.whisper) pairs.set(pair(row.sender, row.recipient), [row.sender, row.recipient].sort().join(' ↔ '));
        }
        const options = entries => Array.from(entries).sort((a, b) => a[1].localeCompare(b[1], 'cs')).map(([key, value]) => `<option value="${M.escape(key)}">${M.escape(value)}</option>`).join('');
        const rows = records.slice().reverse().map(row => `<article data-sender="${M.escape(M.lower(row.sender))}" data-recipient="${M.escape(M.lower(row.recipient))}" data-whisper="${row.whisper ? '1' : '0'}" data-pair="${M.escape(pair(row.sender, row.recipient))}" data-presence="${row.presence ? '1' : '0'}"><small class="day">${M.escape(row.day)}</small> ${M.safeHTML(row.html)}</article>`).join('\n');
        return `<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>XChat — místnost ${M.escape(M.page.room)}</title><style>body{font:16px/1.5 system-ui;margin:auto;max-width:960px;padding:16px;color:#152c3c;background:#f7fbff}header{background:#e1f2ff;padding:12px;border-radius:8px}label{display:inline-block;margin:6px}select{font:inherit;max-width:100%}article{padding:8px;border-bottom:1px solid #bdd0dd;overflow-wrap:anywhere;white-space:pre-wrap}article[hidden]{display:none}img{max-width:100%;height:auto;vertical-align:middle}.day{color:#607786}</style></head><body><header><h1>XChat — místnost ${M.escape(M.page.room)}</h1><p>Export ${M.escape(new Date().toLocaleString('cs-CZ'))}; ${records.length} zpráv. Nejnovější nahoře.</p><label>Uživatel <select id="user"><option value="">Všichni</option>${options(users)}</select></label><label>Šeptání <select id="whisper"><option value="">Vše</option><option value="only">Pouze šeptání</option>${options(pairs)}</select></label><label><input id="presence" type="checkbox"> Skrýt příchody a odchody</label><p id="count"></p></header><main>${rows}</main><script>
(() => { const user=document.getElementById('user'), whisper=document.getElementById('whisper'), presence=document.getElementById('presence'), rows=Array.from(document.querySelectorAll('article'));
function filter(){let count=0;for(const row of rows){const d=row.dataset;row.hidden=Boolean((user.value && d.sender!==user.value && d.recipient!==user.value)||(whisper.value && (d.whisper!=='1'||(whisper.value!=='only' && d.pair!==whisper.value)))||(presence.checked && d.presence==='1'));if(!row.hidden)count++;}document.getElementById('count').textContent='Zobrazeno '+count+' / '+rows.length+' zpráv';}
for(const input of [user,whisper,presence])input.addEventListener('change',filter);filter();})();
</script></body></html>`;
    }
    function exportContent(format, records = exportRecords()) {
        if (format === 'html') return exportHTML(records);
        const header = `XChat — místnost ${M.page.room}\nExport: ${new Date().toLocaleString('cs-CZ')}\n\n`;
        const lines = records.map(row => `[${row.day} ${row.time}] ${row.text}`);
        if (format === 'md') return '# ' + header + lines.map(line => line.replace(/[\\`*_{}\[\]()#+.!|~<>]/g, '\\$&')).join('  \n');
        return header + lines.join('\n');
    }
    function download(format) {
        const records = exportRecords();
        if (!records.length) { M.notice = 'Pro export nejsou dostupné žádné zprávy.'; M.updateStatus(); return; }
        const mime = {html: 'text/html', txt: 'text/plain', md: 'text/markdown'}[format];
        const blob = new Blob([exportContent(format, records)], {type: mime + ';charset=utf-8'});
        const url = URL.createObjectURL(blob); const link = document.createElement('a');
        link.href = url; link.download = `XChat_mobil_${M.page.room}_${new Date().toISOString().replace(/[:.]/g, '-')}.${format}`;
        document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
    }
    Object.assign(M, {exportRecords, exportContent, download});
})(M);
