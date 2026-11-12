# XChat – Vše v jednom

Jedna instalace do Tampermonkey pro všech šest modulů. Hlavní skript automaticky stáhne a spustí moduly přes `@require`; samostatné položky v seznamu nainstalovaných skriptů nevytváří.

## Instalace

1. Nahraj všechny soubory `*.user.js` do kořene větve `main` repozitáře `Martin-CHT/Xchat`. Zachovej názvy souborů.
2. V prohlížeči s Tampermonkey otevři [instalační odkaz](https://github.com/Martin-CHT/Xchat/raw/refs/heads/main/xchat.user.js) a potvrď instalaci.
3. Pokud máš původní samostatné skripty nainstalované, vypni je nebo odinstaluj, aby se funkce nespouštěly dvakrát. Obnov otevřené stránky XChatu.

Skript se spouští na `https://www.xchat.cz/*`, pouze v hlavním okně; dostupné rámce procházejí jednotlivé moduly. Vyplnění místnosti se aktivuje pouze na stránce `create_room`. Zvuk je potřeba odblokovat kliknutím na ovládací prvek v chatu.

## Soubory a verze

| Soubor | Funkce | Verze |
| --- | --- | --- |
| `xchat.user.js` | Společný instalační skript | 1.4.0 |
| `export.user.js` | Čas neaktivity a export chatu | 2.4.0 |
| `reklamy.user.js` | Skrývání reklam a systémového šeptání | 2.1.0 |
| `mistnost.user.js` | Vyplnění nové místnosti | 1.0.1 |
| `historie.user.js` | Zobrazení celé dostupné historie | 1.1.0 |
| `zvuky.user.js` | Zvuky, MP3 pro každý typ a zvýraznění nicku | 1.5.0 |
| `precteno.user.js` | Ruční hranice přečtených zpráv | 1.1.0 |

Moduly mají zachovaná původní jména a `@namespace`, tedy identitu pro samostatné instalace. Jejich verze byly zvýšeny o opravu kvůli novým aktualizačním metadatům. Obsah historie funguje i v kontextu společného skriptu s `@grant none`; skrývání reklam a systémového šeptání zahrnuje také celý výpis historie. Vlastní nastavení (sledované nicky, údaje místnosti apod.) zůstávají v odpovídajících modulech.

## Vydání aktualizace

1. Uprav modul a zvyš jeho `@version` (např. `1.2.2` → `1.2.3`).
2. V `xchat.user.js` změň parametr příslušného `@require` na stejnou verzi (`zvuky.user.js?v=1.2.3`). Změna URL zajistí nové načtení závislosti místo její staré kopie v mezipaměti.
3. Zvyš také `@version` v `xchat.user.js` (např. `1.0.0` → `1.0.1`). Tampermonkey kontroluje aktualizaci tohoto nainstalovaného skriptu; samotná změna verze modulu nestačí.
4. Aktualizuj tuto tabulku a nahraj změněné soubory společně do větve `main`. Pokud je nahráváš jednotlivě, hlavní skript nahraj jako poslední.
5. V Tampermonkey můžeš vyvolat kontrolu aktualizací ručně, jinak se řídí nastavením rozšíření. Potom obnov stránku XChatu.

Používej číselné verze `MAJOR.MINOR.PATCH`: oprava zvyšuje poslední číslo, nová funkce prostřední, nekompatibilní změna první. Verze nesnižuj. Hlavní skript má vlastní verzi nezávislou na verzích modulů. `@updateURL` a `@downloadURL` jsou stabilní a vždy ukazují na příslušný soubor ve větvi `main`.

Nový modul přidej jako další `@require` s verzí a zvyš verzi hlavního skriptu. Soubory přidané pouze do repozitáře se samy nespustí. Metadata modulů (`@match`, `@grant`, `@run-at` apod.) se při načítání přes `@require` neuplatňují; potřebná oprávnění a rozsah musí mít společný skript a případná omezení modulu musí být i v jeho kódu.

Při přejmenování souboru nelze již nainstalovaným starým skriptům zpětně změnit původní aktualizační adresu. Pro přechod na tuto sadu použij instalační odkaz výše.

Mechanismus metadat popisuje [dokumentace Tampermonkey](https://www.tampermonkey.net/documentation.php#meta:require).

## Ověření

Byla ověřena syntaxe všech šesti skriptů, shoda verzí `@require` s moduly, aktualizační URL a společné spuštění na simulované prázdné stránce. Ověření v přihlášeném XChatu a skutečná instalace z GitHubu musí proběhnout po nahrání souborů; soubory nebyly z této složky publikovány.

## Zvuky a zvýraznění (hlavní skript 1.3.0, zvuky 1.4.0)

Nick se průběžně načítá z prvku `body > form > table > tbody > tr > td.tdb > strong` v dostupných rámcích.
Zmínky jsou žluté, příchozí šeptání fialové, také v celé historii. Odkaz **Zvýraznění** funkci přepíná.
Vlastní zprávy a šeptání jiným příjemcům se osobně nezvýrazňují. Sledované výrazy a příjemci v WATCHED_TERMS
 a WHISPER_NICKS zůstávají zachováni a mohou nezávisle spouštět zvuk zprávy.

Pod formulářem otevři **Nastavení XChatu → Zvuky a zvýraznění → Nastavení zvuků**. Nastavení má tři samostatně popsané části:

| Typ | Co jej spouští |
| --- | --- |
| Zpráva / zmínka / šeptání | Osobní zmínka, příchozí šeptání nebo shoda s nastavenými výrazy/příjemci |
| Příchod do místnosti | Systémová událost o vstupu uživatele |
| Odchod z místnosti | Systémová událost o odchodu, odpojení nebo vyhození |

Každý typ má vlastní přímý HTTPS odkaz na MP3, vlastní hlasitost 0–1 a tlačítka:

- **Uložit** — uloží daný typ bez přehrání.
- **Test** — uloží daný typ a přehraje jej; umožňuje také povolit přehrávání v prohlížeči.
- **Původní melodie** — vymaže MP3 daného typu a obnoví původní syntetické tóny.

Stav pod každým typem říká, zda používá původní melodii nebo MP3, a popisuje případnou chybu.
Prázdná URL znamená původní tóny. Hlasitost v panelu ovládá MP3; původní tóny mají vlastní volume v SOUND_MESSAGE,
SOUND_ARRIVAL a SOUND_DEPARTURE. Nastavení se ukládají do localStorage. Dříve uložená MP3 zprávy se automaticky převezme.
Uložené volby mají přednost před AUDIO_DEFAULTS v kódu. Nicky Sidian a Woif v seznamech byly zachovány.

Použij přímou adresu zvukového souboru, nikoli stránku přehrávače. Například vlastní soubor po nahrání:
`https://github.com/Martin-CHT/Xchat/raw/refs/heads/main/prichod.mp3`.
Nahrávky nejsou součástí této sady. Přehrání závisí také na dostupnosti serveru a pravidlech prohlížeče.
Omezení opakování 1,5 s platí zvlášť pro každý typ; ruční Test jej obchází.
Při prvním načtení se staré zprávy neozývají. Překreslení celé historie neopakuje zvuky.

Kód zvukového modulu obsahuje očíslované komentáře k nastavení nahrávek, přehrávačům, stavům, výběru zdroje,
rozpoznání událostí, novým zprávám, ovládání a průběžné kontrole. Definice původních melodií i legenda tónů zůstaly zachované.

Pro toto vydání nahraj zvuky.user.js 1.4.0 a xchat.user.js 1.3.0, hlavní skript jako poslední.
Ostatní moduly a jejich verze se nemění. Existující @require na Kamdar-Wolf/Xchat zůstávají zachovány,
aktualizační metadata míří na Martin-CHT/Xchat; modul musí být dostupný na adrese uvedené v @require.

Ověření: `node --test tests/precteno.test.cjs tests/zvuky.test.cjs` — 10 testů, včetně oddělení všech tří MP3,
hlasitostí, migrace nastavení, odmítnutého přehrání, prvního tichého výpisu a návaznosti verzí všech modulů.
Skutečný přihlášený XChat a konkrétní nahrávky zatím ověřeny nejsou.

## Čára přečtených zpráv (1.2.0)

Nový modul precteno.user.js 1.0.0 přidává červenou vodorovnou čáru s popiskem
„↑ Nepřečtené · Přečtené ↓“. XChat zobrazuje nejnovější zprávy nahoře.

- Klikni levým tlačítkem na text poslední přečtené zprávy: čára se umístí nad tuto zprávu.
- Novější zprávy nad čárou jsou nepřečtené, vybraná zpráva a starší zprávy pod ní přečtené.
- Kliknutím na jinou zprávu čáru přesuneš.
- Odkaz **Čára** v nastavení pod formulářem vypne nebo znovu zapne čáru i přesouvání kliknutím.
- Odkaz **Vymazat čáru** odstraní uložené místo. Dalším kliknutím na zprávu vybereš nové.

Klikání na odkazy a ovládací prvky, klikání s Ctrl/Shift/Alt/Meta a označování textu značku neposouvá.
Značka se drží obsahu a výskytu zprávy, nikoli souřadnic na obrazovce. Funguje v běžném výpisu
`#board` i ve výpisu celé historie `#kamdar-full-history-view`, včetně překreslení historie.
Je umístěna mimo obsah zpráv, proto se nepřidává do exportů a nevyvolává zvuková upozornění.
Pokud vybraná zpráva už není dostupná ve výpisu, čára se skryje a panel zobrazí **Čára: mimo výpis**.
Po přepnutí na historii, která zprávu obsahuje, se znovu ukáže. Mimo obrazovku čáru neuvidíš,
ale místo zůstává vybrané. Obnovení stránky nebo změna adresy místnosti výběr vymaže.
Zcela totožné zprávy se rozlišují počtem stejných starších výskytů; pokud se starší kopie z historie odstraní,
nemusí už být původní místo jednoznačně dohledatelné.

Pro vydání nahraj precteno.user.js a aktualizovaný xchat.user.js (1.2.0), hlavní skript jako poslední.
Nový @require je verzovaný parametrem ?v=1.0.0 a používá stejný repozitář jako ostatní existující @require.
Ostatní moduly se nemění a jejich verze zůstávají zachované.

Ověření: `node --test tests/precteno.test.cjs` — 5 testů. Pokrývají nové zprávy, překreslení a přepnutí
historie, přesouvání kliknutím, odkazy a výběr textu, shodné zprávy, skrytí a změnu místnosti,
a shodu všech šesti závislostí s verzemi modulů. Skutečný přihlášený XChat zatím ověřený není.

## Společné nastavení a oprava úplné historie (1.4.0)

Ovládání exportu, výpisu historie, systémového šeptání, zvuků, zvýraznění a čáry je přesunuté
z horní lišty do jediného rozbalovacího panelu **Nastavení XChatu**, který je ve výchozím stavu otevřený.
Panel je bezprostředně pod formulářem `div#cr2.ac > div.cr > div.crdiv2 > form` a má sekce v jednom sloupci.
Pokud se formulář načte později nebo je v dostupném rámci, moduly ho při dalších kontrolách vyhledají.
Bez tohoto formuláře se panel na jiné místo stránky nevkládá. Tlačítko pro vyplnění nové místnosti zůstává u formuláře nové místnosti;
export v samostatném okně historie zůstává dostupný přímo v tomto okně.

Zvuky se rozbalují nativním prvkem details/summary v této sekci. Jejich nastavení už nezávisí na přítomnosti
živého výpisu ani na klikacím přepínači na liště. Vlastní WAV adresy receive.wav, login.wav, logout.wav i sledované nicky jsou zachované.

Čára má vlastní sekci s návodem, přepínačem, vymazáním a tlačítkem **Zobrazit čáru u nejnovější zprávy**.
To ji ihned ukotví nad nejnovější dostupnou zprávou, tedy označí dosavadní výpis jako přečtený.
Potom ji přesuneš kliknutím na text libovolné zprávy. Samotné zapnutí přepínače bez výběru zprávy
čáru nevytváří; pro první zobrazení použij toto tlačítko nebo klikni do chatu.

Úplná historie nyní vytváří samostatný blok pro každý záznam zásobníku včetně systémových událostí,
textových a inline HTML zpráv. Díky tomu lze určit kliknutou zprávu a umístění čáry i v úplném výpisu.
Výběr se zachová při příchodu nových zpráv a překreslení historie. Kliknutí se zachytává také před obsluhou původního chatu.

Verze tohoto vydání: hlavní 1.4.0, export 2.4.0, reklamy 2.1.0, historie 1.1.0, zvuky 1.5.0 a přečteno 1.1.0.
Místnost zůstává 1.0.1. Nahraj všech pět změněných modulů a hlavní skript, hlavní jako poslední.
Publikační adresy existujících souborů byly zachované, hlavní skript používá Kamdar-Wolf/Xchat.

Kontroly: 13 testů včetně DOM testů všech pěti sekcí pod zadaným formulářem, ukládání zvuků,
kliknutí do úplné historie s textovým/inline obsahem a čáry po překreslení.
Testy lze spustit pomocí `node --test tests/*.test.cjs`.
DOM testy používají linkedom v dočasné složce: `npm install --prefix "$env:TEMP/xchat-dom-tests" --no-save --ignore-scripts linkedom` (PowerShell).
Všechny userscripty prošly kontrolou syntaxe. V přihlášeném živém XChatu zatím změny ověřeny nebyly.
