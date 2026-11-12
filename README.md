# XChat – Vše v jednom

Jedna instalace do Tampermonkey pro všech pět funkcí. Hlavní skript automaticky stáhne a spustí moduly přes `@require`; samostatné položky v seznamu nainstalovaných skriptů nevytváří.

## Instalace

1. Nahraj všechny soubory `*.user.js` do kořene větve `main` repozitáře `Martin-CHT/Xchat`. Zachovej názvy souborů.
2. V prohlížeči s Tampermonkey otevři [instalační odkaz](https://github.com/Martin-CHT/Xchat/raw/refs/heads/main/xchat.user.js) a potvrď instalaci.
3. Pokud máš původní samostatné skripty nainstalované, vypni je nebo odinstaluj, aby se funkce nespouštěly dvakrát. Obnov otevřené stránky XChatu.

Skript se spouští na `https://www.xchat.cz/*`, pouze v hlavním okně; dostupné rámce procházejí jednotlivé moduly. Vyplnění místnosti se aktivuje pouze na stránce `create_room`. Zvuk je potřeba odblokovat kliknutím na ovládací prvek v chatu.

## Soubory a verze

| Soubor | Funkce | Verze |
| --- | --- | --- |
| `xchat.user.js` | Společný instalační skript | 1.0.0 |
| `export.user.js` | Čas neaktivity a export chatu | 2.3.1 |
| `reklamy.user.js` | Skrývání reklam a systémového šeptání | 2.0.1 |
| `mistnost.user.js` | Vyplnění nové místnosti | 1.0.1 |
| `historie.user.js` | Zobrazení celé dostupné historie | 1.0.1 |
| `zvuky.user.js` | Zvuková upozornění | 1.2.2 |

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
