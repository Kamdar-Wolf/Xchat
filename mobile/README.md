# XChat – Mobilní sada 1.0.0

Samostatná sada pro **https://m.xchat.cz/**. Instalace obsahuje všechny moduly i tři zvukové nahrávky v jediném souboru; při běhu se nic nedotahuje z GitHubu.

## Instalace a první spuštění

1. V prohlížeči s funkčním Tampermonkey otevři [instalační odkaz](https://github.com/Kamdar-Wolf/Xchat/raw/refs/heads/main/xchat-mobile.user.js) a nainstaluj **XChat – Mobilní sada**. U soukromého repozitáře musíš být přihlášený na GitHubu s přístupem k němu. Pokud se zobrazí zdroj místo instalace, zkopíruj celý obsah do nového skriptu v Tampermonkey a ulož jej.
2. Otevři místnost na [m.xchat.cz](https://m.xchat.cz/). Pod polem zprávy se objeví **Nastavení XChatu · mobil**. Klepnutím panel rozbalíš.
3. V části **Automatická aktualizace** nastav požadovaný interval a stiskni **Uložit intervaly**.
4. Pro zvuková upozornění klepni na **Povolit zvuky**, případně na **Test** u konkrétního zvuku.

Desktopová sada může zůstat nainstalovaná: používá `www.xchat.cz`, mobilní sada pouze `m.xchat.cz`. Nastavení mobilní sady se ukládá samostatně a z desktopu se automaticky nepřenáší. Na telefonu musí userscripty podporovat zvolený prohlížeč a jeho rozšíření; samotné otevření odkazu v běžném prohlížeči skript nespustí.

## Automatické /s a načítání zpráv

| Volba | Výchozí stav | Rozsah |
| --- | --- | --- |
| Automatické odesílání `/s` při neaktivitě | Zapnuto, 10 minut | Celé minuty 1–1440 |
| Průběžné načítání nových zpráv | Zapnuto, 5 sekund | Celé sekundy 5–3600 |
| Limit místní historie | 5000 zpráv | 100–10000 zpráv |

Mobilní výpis obsahuje statický údaj neaktivity, na kterém časovač **nezávisí**. Sada si ukládá čas posledního potvrzeného odeslání pro daný nick a místnost. Při prvním otevření začíná interval od nuly; další obnovení stránky uložený čas zachová. Vlastní zpráva i automatické `/s` začnou interval znovu. Pouhé načtení nových zpráv interval neposouvá.

- `/s` se odešle pouze při prázdném poli zprávy. Rozepsaný text se nepřepisuje. Po jeho vymazání se případný překročený interval vyřídí při další kontrole.
- Zkrácení intervalu platí po uložení. Pokud už uplynul, následující kontrola může odeslat `/s`.
- Načítání zpráv probíhá bez obnovení celé stránky a zachová text, otevřené nastavení i aktivaci zvuku.
- V dodaném HTML je také původní pětisekundová obnova celé stránky. Sada ji nahrazuje vlastním načítáním. Po vypnutí průběžného načítání lze použít **Obnovit zprávy** nebo původní odkaz **Obnovit**.
- Skrytá karta a stav bez připojení automatické požadavky pozastaví. Po návratu se zkontroluje skutečně uplynulý čas a odešle se nejvýše jeden opožděný příkaz. Mobilní systém může prohlížeč uspat nebo ukončit; skript nezaručuje udržení relace na pozadí či se zamčenou obrazovkou.
- Více karet stejné místnosti sdílí stav odesílání. Kde je dostupné Web Locks API, používá se společný zámek; starší prohlížeče používají krátkou rezervaci v místním úložišti.
- Při nepotvrzeném odeslání se automatické `/s` pozastaví i pro další otevření stránky. Nejprve ověř výsledek přes **Obnovit zprávy**, potom použij **Obnovit automatické /s**. Tím začne nový interval. Nejistý požadavek se automaticky neopakuje.

## Ostatní nastavení

| Část | Dostupné funkce |
| --- | --- |
| Export a historie | TXT, Markdown, HTML; vynechání příchodů/odchodů; přepnutí aktuálního výpisu a celé nasbírané historie; limit a vymazání starší historie |
| HTML export | Filtr uživatele, pouze šeptání, konkrétní dvojice šeptání a skrytí příchodů/odchodů; zachované dostupné barvy a formátování |
| Zobrazení zpráv | Skrývání rozpoznaných reklam, systémového šeptání; žluté zmínky vlastního nicku a fialové příchozí šeptání |
| Zvuky | Zvlášť zpráva/zmínka/šeptání, příchod a odchod; zapnutí, přiložená nahrávka, vlastní veřejný HTTPS odkaz MP3/WAV nebo původní tóny; hlasitost, uložení a test |
| Sledované výrazy | Výrazy a příjemci šeptání po řádcích; celá slova; zahrnutí systémových zpráv |
| Čára přečtených zpráv | Zapnutí, označení všeho jako přečteného, vymazání a přesun klepnutím na zprávu; uložená poloha podle místnosti |
| Předvyplnění místnosti | Název, titulek, vstupní upozornění, barvy a obrázek pozadí; uložení předvolby a vyplnění dostupného formuláře |

Historie obsahuje jen zprávy, které stránka skutečně poskytla při otevření nebo načítání. Starší zprávy mimo dostupný výpis serveru ani zprávy z doby, kdy skript neběžel, se nedají zpětně doplnit touto místní historií. Po dosažení limitu se nejstarší uložené zprávy odstraňují. Nastavení a historie jsou v místním úložišti daného prohlížeče; vymazání dat webu je odstraní. Odkazy v uložené historii a exportu neobsahují přihlašovací parametr `wh` ani další rozpoznané parametry relace.

Původní zprávy při otevření nezahrají zvuk. Po úplném znovunačtení stránky může prohlížeč vyžadovat nové klepnutí na **Povolit zvuky**. Vlastní zvuk musí být přímo dostupný na veřejné HTTPS adrese; přiložené nahrávky toto omezení nemají.

Dodaná ukázka neobsahuje formulář vytvoření místnosti. Předvolba je upravitelná v mobilním nastavení; tlačítko **Vyplnit novou místnost** se objeví jen u formuláře s rozpoznanými poli `r_name`, `r_title` a dalšími dostupnými `r_*` poli. Podpora konkrétního mobilního formuláře proto zatím není ověřená. Sada místnost sama nezakládá.

## Vývoj a ověření

Zdrojové moduly jsou v `mobile/src/`. Distribuční soubor `xchat-mobile.user.js` a malá aktualizační metadata `xchat-mobile.meta.js` vytváří `scripts/build-mobile.cjs`. Verze se mění v `mobile/package.json`. Sestavení přebírá tři vestavěné nahrávky a výchozí předvolbu místnosti z existujících desktopových modulů; nemění je.

Z kořene repozitáře:

```sh
npm --prefix mobile install --ignore-scripts
node scripts/build-mobile.cjs
npm --prefix mobile test
npm --prefix mobile run check
node --test tests/export-idle.test.cjs
```

DOM testy simulují čas, síť, úložiště a zvuky. Pokrývají mobilní HTML, nastavení, vlastní časovač, rozepsanou zprávu, souběh karet, návrat po uspání, chyby odesílání, přihlášení a změnu místnosti, ukládání historie, sanitizaci a export, půlnoc, shodné zprávy, zvuky a čáru přečtených zpráv. V repozitáři je pouze syntetická ukázka bez přihlašovacích údajů a soukromé komunikace. Volitelný test vlastního HTML lze zapnout proměnnou `XCHAT_SAMPLE_HTML` s místní cestou k souboru.

Při přípravě vydání prošlo 22 mobilních testů včetně testu nad dodaným HTML s 30 zprávami a 12 desktopových regresních testů. Odesílání do živé přihlášené místnosti, skutečné přehrání na telefonu a vzhled v mobilním prohlížeči zatím nejsou ověřené.
