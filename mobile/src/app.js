((M) => {
    function start() {
        if (document.getElementById('xcm-settings')) return;
        M.page = M.inspect(document, location.href);
        if (!M.page) {
            const roomForm = document.querySelector('form [name="r_name"], form #r_name')?.closest('form');
            if (roomForm) {
                M.installStyle();
                const panel = M.el('details', null, {id: 'xcm-settings'}); panel.appendChild(M.el('summary', 'Předvolba nové místnosti · mobil'));
                roomForm.after(panel); M.buildRoomTemplate(panel);
            }
            return;
        }
        M.roomKey = 'room.' + encodeURIComponent(M.lower(M.page.nick)) + '.' + M.page.room;
        M.archive = M.loadArchive(); M.snapshot = []; M.lastRead = 0;
        M.ingest(M.page, false); // Historical messages on startup never produce sound notifications.
        M.initializeClock(); M.installUI(); M.connect();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true});
    else start();
})(M);
