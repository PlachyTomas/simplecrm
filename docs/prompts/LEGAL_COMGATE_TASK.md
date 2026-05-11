# Právní a obsahové požadavky pro spuštění B2B SaaS „SimpleCRM" s platební bránou ComGate (ČR, 2026)

**TL;DR**
- Pro získání ComGate musí mít web s SimpleCRM před spuštěním nasazeno 8 konkrétních věcí (identifikační údaje OSVČ, kontakt, popis a cena služby, košík/objednávka, VOP, reklamační podmínky/podmínky vrácení, zásady ochrany osobních údajů, dodací a platební podmínky) plus HTTPS, loga Visa/Mastercard v patičce a samostatný popis opakovaných plateb se zaškrtávacím souhlasem. Smluvní proces s ComGate (od ledna 2026 jej využívá více než 21 000 obchodníků a zpracovává přes 53 mld. Kč v transakcích ročně) vyžaduje 2 doklady totožnosti, identifikační platbu 1 Kč, prohlášení o skutečném majiteli a prohlášení o zemi původu — pro OSVČ neexistuje žádné zjednodušení.
- Z pohledu zákona je B2B SaaS pro podnikatele výrazně méně regulován než B2C: nepoužije se § 1820 a násl. OZ o distančních smlouvách se spotřebitelem, nevztahuje se mimosoudní řešení sporů přes ČOI, nevztahuje se 14denní odstoupení od smlouvy. Klíčové ale jsou: § 435 OZ (identifikační údaje na webu), zákon č. 480/2004 Sb. (obchodní sdělení, identifikace v e-mailech), GDPR + zákon č. 110/2019 Sb. (zásady zpracování, zpracovatelská smlouva), § 89 odst. 3 zákona č. 127/2005 Sb. (cookies opt‑in), § 2389a a násl. OZ (smlouva o poskytování digitálního obsahu / digitální služby — povinnost aktualizací) a požadavky na fakturu neplátce DPH s povinnou poznámkou „Nejsem plátce DPH".
- EAA (zákon č. 424/2023 Sb.) na SimpleCRM nedopadá, dokud je provozovatel mikropodnikem dle doporučení Komise 2003/361/ES (méně než 10 osob a roční obrat nebo bilanční suma roční rozvahy nepřevyšující 2 miliony EUR) — výjimka platí pro služby. AML zákon (253/2008 Sb.) se SaaS provozovatele platby kartou netýká (povinnou osobou je ComGate). DAC7 se rovněž neuplatní (SimpleCRM neprodává cizí zboží/služby, prodává vlastní). Pro web doporučujeme nasadit kompletní balík: VOP B2B, Zásady ochrany osobních údajů, DPA jako přílohu VOP, Cookie policy + cookie lišta s rovnocenným tlačítkem „Odmítnout vše", patička s povinnými údaji, popis automatického obnovení a způsob ukončení.

---

## A) POŽADAVKY COMGATE PRO SCHVÁLENÍ PLATEBNÍ BRÁNY

### A.1 Povinné údaje na webu (VYŽADOVÁNO COMGATE)
Z oficiální dokumentace help.comgate.cz/docs/jak-ziskat-platebni-branu a help.comgate.cz/docs/nalezitosti-e-shopu plyne, že před aktivací ostrého provozu musí web obsahovat:

1. **Název podnikatele (jméno OSVČ), adresa dle živnostenského rejstříku, IČO** — shodné se smlouvou s ComGate.
2. **Kontaktní e-mail a telefon** na provozovatele.
3. **Informace o produktu** — popis služby, jednoznačná cena (99 Kč/uživatel/měsíc).
4. **Možnost provedení objednávky / nákupu** (košík nebo registrační/checkout flow).
5. **Všeobecné obchodní podmínky** (VOP).
6. **Reklamační podmínky** (vrácení zboží, peněz, storno služby) — ComGate vyžaduje tento dokument pro všechny obchody, **i pro B2B SaaS** (přestože zákonná povinnost dle § 13 zákona o ochraně spotřebitele míří jen na B2C). Pro B2B SaaS lze reklamační řád sloučit do VOP jako samostatnou sekci „Práva z vadného plnění a reklamace".
7. **Informace o ochraně osobních údajů** (Zásady zpracování / Privacy Policy).
8. **Dodací a platební podmínky** (u SaaS popis: jakmile dojde k platbě, do X minut je aktivován účet; způsoby platby).
9. **Zabezpečení webu protokolem HTTPS** — nezbytné.

### A.2 Údaje potřebné k uzavření smlouvy s ComGate (od OSVČ neplátce DPH)
- Název (= jméno a příjmení OSVČ), IČO, adresa sídla, kontakt (e-mail + telefon).
- Číslo běžného účtu pro převody.
- Předmět podnikání, URL webu, jméno developera.
- **Doklady k AML procesu (přes online formulář na doklady.comgate.cz):**
  - Sken **2 dokladů totožnosti** (občanský průkaz + 1 další, např. řidičák/pas).
  - Doklad o vlastnictví bankovního účtu (např. výpis nebo PDF z internetbankingu).
  - **Identifikační platba 1 Kč** z účtu, který bude pro vyplácení — částka je automaticky vrácena.
  - **Prohlášení o skutečném majiteli** a **prohlášení o zemi původu** (vyplňuje se v rámci online procesu, nikoli samostatným PDF).
- **OSVČ nemá žádné zjednodušení vůči s.r.o.** — proces je identický (regulace dle zákona č. 370/2017 Sb. o platebním styku a zákona č. 253/2008 Sb. o AML).

### A.3 Opakované platby (subscription) — POVINNOSTI DLE VISA/MASTERCARD A COMGATE
Funkce **opakovaných plateb (Card-on-File)** je u ComGate **na vyžádání, podléhá schválení** přes risk management. Před první (iniciační) platbou musí web zákazníkovi seznámit s podmínkami opakované platby. Podle help.comgate.cz/docs/opakovane-platby je obchodník povinen splnit pravidla karetních asociací:

1. Seznámit zákazníka s podmínkami opakované platby.
2. Získat zákazníkův souhlas s pravidelným strháváním (ComGate doporučuje **checkbox** v e-shopu před přesměrováním na bránu).
3. Po každé stržené platbě zákazníkovi zaslat doklad s potvrzením platby.
4. Informovat zákazníka o jakékoli změně (výše částky, frekvence) **předem**.

**Informace zobrazené před první platbou musí obsahovat minimálně:**
- výše částky,
- jak často (frekvence/perioda),
- do jaké doby trvá závazek,
- **způsob, jak může zákazník opakované platby jednoduše online zrušit** (povinnost vyplývá z aktuálních OP ComGate — klient musí umožnit online ukončení odběru).

### A.4 Loga a texty v patičce (VYŽADOVÁNO COMGATE)
Z help.comgate.cz/docs/loga-a-udaje-na-webu:
- **Povinnost** umístit do patičky **loga Visa a Mastercard** (ve formě poskytnuté ComGate).
- Doporučeno: **logo Comgate s odkazem na www.comgate.eu**, případně Apple Pay / Google Pay.
- Po ukončení smluvního vztahu klient musí loga z webu odstranit.

**Doporučený text** (na stránku „Platba" nebo do VOP), doslovná formulace ComGate:
> „Online platby pro nás zajišťuje platební brána Comgate. Poskytovatel služby, společnost Comgate a.s. je licencovaná Platební instituce působící pod dohledem České národní banky. Platby probíhající skrze platební bránu jsou plně zabezpečeny a veškeré informace jsou šifrovány. Další informace a kontakty na www.comgate.eu."
>
> „Kontaktní údaje na společnost Comgate, a.s. pro případné reklamace nebo dotazy k platbám: Comgate, a.s., Gočárova třída 1754/48b, 500 02 Hradec Králové, e-mail: platby-podpora@comgate.cz, tel.: +420 228 224 267."

### A.5 Další provozní pravidla ComGate
- **Min. výše transakce: 1 CZK** (testovací mikroplatby OK).
- **Surcharging zakázán** — klient nesmí účtovat zákazníkům za platbu kartou žádný extra poplatek.
- Karetní asociace mají na schválení karetních plateb až 5 dní; bankovní převody jdou rychleji.

---

## B) POVINNÉ NÁLEŽITOSTI WEBU PODLE ČESKÉHO ZÁKONA (2025–2026)

### B.1 Identifikační údaje na webu (POVINNÉ ZE ZÁKONA — § 435 OZ)
§ 435 zákona č. 89/2012 Sb., občanský zákoník, ukládá každému podnikateli na **obchodních listinách a v informacích zpřístupňovaných veřejnosti prostřednictvím dálkového přístupu** (= internetové stránky) uvádět:

- **Jméno a příjmení** OSVČ (případně dodatek odlišující od jiných podnikatelů).
- **Sídlo** (adresa zapsaná v živnostenském rejstříku).
- **IČO**.
- **Údaj o zápisu v živnostenském rejstříku** — formulace: *„Fyzická osoba zapsaná v živnostenském rejstříku, evidenční úřad: Magistrát města Brna."*
- DIČ je u neplátce DPH **nepovinné** (a Tomáš by ho neměl uvádět, pokud mu nebylo přiděleno jako identifikované osobě).

Sankce za neuvedení: pokuta až **100 000 Kč** dle živnostenského zákona a zákona o přestupcích (§ 24 odst. 2 zák. č. 200/1990 Sb.; po rekodifikaci zákon č. 251/2016 Sb.). Kontroluje živnostenský úřad nebo ČOI.

### B.2 Zákon č. 480/2004 Sb. — služby informační společnosti (POVINNÉ ZE ZÁKONA)
- **§ 7 — obchodní sdělení** (newslettery, marketingové e-maily): musí být označena jako obchodní sdělení, musí být zřejmé, kdo je odesílá (jméno, IČO, sídlo), a musí umožnit jednoduché bezplatné odhlášení. Zasílání **pouze se souhlasem** (opt-in), s výjimkou tzv. „zákaznické výjimky" (§ 7 odst. 3) pro již existující zákazníky a produkty obdobného druhu.
- **§ 8 — informační povinnost poskytovatele služby informační společnosti**: jméno/název, sídlo, IČO, kontakt (e-mail), případně registrační/identifikační číslo (živnostenský rejstřík).

### B.3 Občanský zákoník — smlouva uzavřená distančním způsobem (§ 1820 a násl.) — **NEAPLIKUJE SE NA B2B**
- § 1820 a násl. OZ chrání **spotřebitele** (definice spotřebitele dle § 419 OZ). SimpleCRM uzavírá smlouvy **výhradně s podnikateli**, proto se ustanovení o informační povinnosti, 14denním odstoupení a tlačítku „Objednávka zavazující k platbě" **NEPOUŽIJÍ**.
- **Doporučení**: ve VOP a v registračním flow výslovně vyloučit zákazníky, kteří nejsou podnikatelé. V registračním formuláři vyžadovat **IČO** a deklaraci, že kupující jedná v rámci své podnikatelské činnosti.
- Tlačítko „Objednat" je dostatečné (formulace „Objednávka zavazující k platbě" je povinná jen u B2C dle § 1826a OZ).

### B.4 Smlouva o poskytování digitálního obsahu / digitální služby (§ 2389a–§ 2389u OZ)
Novelou účinnou od 6. ledna 2023 implementující směrnice EU 2019/770 a 2019/771 byl zaveden nový smluvní typ — **smlouva o poskytování digitálního obsahu/služby**. SaaS spadá pod § 2389a a násl. OZ.

- **Pododdíl 1 (§ 2389a–§ 2389f) se aplikuje i na B2B** — definice, doba plnění, zpřístupnění.
- Pododdíl 2 (§ 2389g–§ 2389s) — pouze pro spotřebitele, na SimpleCRM se neuplatní.
- **Pododdíl 3 (§ 2389t–§ 2389u) opět dopadá i na B2B** — některá ujednání.
- **Důležité**: pro B2B SaaS lze ujednání občanského zákoníku o aktualizacích, vadách a odpovědnosti **smluvně vyloučit nebo upravit** (na rozdíl od B2C, kde nelze). Tomáš by měl ve VOP výslovně:
  - vymezit rozsah aktualizací,
  - omezit odpovědnost za výpadky (cap na zaplacenou cenu za posledních X měsíců),
  - vyloučit některá dispozitivní ustanovení (§ 1751 odst. 3 OZ — inkorporace VOP odkazem).

### B.5 Zákon o ochraně spotřebitele č. 634/1992 Sb. — **NEAPLIKUJE SE NA B2B**
- ČOI nemá pravomoc řešit B2B spory. SimpleCRM tedy **nemusí** uvádět ve VOP informaci o ADR/mimosoudním řešení sporů.
- Pokud by ale Tomáš začal nabízet službu i spotřebitelům, musel by doplnit ADR doložku s odkazem na ČOI (adr.coi.cz).

### B.6 Spotřebitelský úvěr a finanční arbitr — NEAPLIKUJE SE
Zákon č. 257/2016 Sb., o spotřebitelském úvěru, dopadá na úvěry pro spotřebitele. SimpleCRM neposkytuje úvěr.

---

## C) GDPR A OCHRANA OSOBNÍCH ÚDAJŮ (2026)

### C.1 Postavení provozovatele a uživatelů
- Tomáš je **správcem** osobních údajů uživatelů SimpleCRM (kontaktní osoba ve firmě klienta, fakturační údaje, přihlašovací údaje atd.).
- Tomáš je **zpracovatelem** dat, která klientské firmy nahrávají do SimpleCRM (kontakty zákazníků klientů, obchodní příležitosti). To znamená povinnost uzavřít se zákazníkem **smlouvu o zpracování osobních údajů (DPA)** dle čl. 28 GDPR.

### C.2 Co musí obsahovat Zásady zpracování osobních údajů
Podle čl. 13/14 GDPR a metodiky ÚOOÚ:
- Totožnost a kontaktní údaje **správce** (Tomáš).
- **Účel zpracování a právní základ** (smlouva čl. 6 odst. 1 písm. b GDPR; oprávněný zájem čl. 6 odst. 1 písm. f; případně souhlas pro newsletter čl. 6 odst. 1 písm. a).
- Kategorie zpracovávaných údajů.
- Příjemci údajů (hosting, fakturační software, platební brána, e-mailing).
- Doba uchování (po dobu trvání služby + 10 let pro účetní/daňové doklady dle zákona č. 563/1991 Sb. o účetnictví).
- Předávání do třetích zemí (pokud používá Hetzner DE — pouze EU/EHP, žádné předávání mimo EU, není třeba SCC).
- **Práva subjektů údajů** (přístup, oprava, výmaz, omezení, přenositelnost, námitka, odvolání souhlasu, stížnost u ÚOOÚ).

### C.3 Záznamy o činnostech zpracování (čl. 30 GDPR)
- Povinné, i pro mikropodnik, pokud zpracování není „příležitostné". Pro SimpleCRM je zpracování pravidelné, tedy záznamy musí být vedeny **interně** (nezveřejňují se).

### C.4 Zpracovatelská smlouva (DPA) — POVINNÁ
- Pokud zákazník (klient B2B firma) nahrává do SimpleCRM osobní údaje svých zákazníků nebo zaměstnanců, Tomáš je v pozici **zpracovatele**. Smlouva o zpracování dle čl. 28 GDPR je **povinná** a musí být uzavřena písemně.
- Pro B2B SaaS je standardem zařadit DPA jako **přílohu VOP** (anglicky „Data Processing Addendum"). Souhlas se VOP automaticky znamená i souhlas s DPA.
- **Minimální obsah** (čl. 28 odst. 3 GDPR):
  - předmět a doba zpracování,
  - povaha a účel zpracování,
  - typ osobních údajů a kategorie subjektů,
  - povinnosti a práva správce,
  - mlčenlivost, technická a organizační opatření,
  - subdodavatelé (sub-processors) — seznam + procedura schválení,
  - pomoc správci s žádostmi subjektů údajů,
  - oznámení porušení zabezpečení,
  - osud dat po ukončení smlouvy (vrácení/výmaz).

### C.5 Hosting v EU
Hetzner DE leží v EU/EHP — předávání není „do třetí země", není třeba SCC. Postačí informace v Zásadách + DPA s Hetznerem (Hetzner poskytuje vlastní DPA online).

---

## D) COOKIES A E-PRIVACY (ČR 2026)

### D.1 Právní rámec — opt-in (POVINNÉ ZE ZÁKONA)
Od 1. 1. 2022 platí v ČR **opt-in** režim pro cookies a podobné technologie podle § 89 odst. 3 zákona č. 127/2005 Sb., o elektronických komunikacích, ve znění novely účinné od 1. 1. 2022. Souhlas musí splňovat parametry GDPR (svobodný, konkrétní, informovaný, jednoznačný).

### D.2 Cookie lišta — pravidla ÚOOÚ
- **Tlačítka „Přijmout vše" a „Odmítnout vše"** musí být **stejně viditelná, ve stejné vrstvě**, ne menší ani méně kontrastní (rovnocenné).
- **Nesouhlas musí být stejně jednoduchý jako souhlas**.
- Předzaškrtnuté checkboxy jsou neplatné (Soudní dvůr EU, věc C‑673/17 Planet49).
- **Cookie wall** (blokování přístupu k webu bez souhlasu) je nepřípustný.
- Lišta nesmí bránit interakci s webem; možnost zavřít křížkem **bez souhlasu**.
- Granulární souhlas po kategoriích: nezbytné (bez souhlasu), analytické (souhlas), preferenční (souhlas), marketingové (souhlas).

### D.3 Co s analytikou
- **Google Analytics 4 — vyžaduje souhlas**, doporučeno nasadit Consent Mode v2.
- **Plausible Analytics** dle své Data Policy (plausible.io) neukládá cookies — **nevyžaduje souhlas**, vhodné pro SimpleCRM.

---

## E) DAŇOVÉ POVINNOSTI (OSVČ NEPLÁTCE DPH, 2026)

### E.1 Faktura neplátce DPH — náležitosti
- Označení dokladu („Faktura", „Daňový doklad").
- Identifikace dodavatele a odběratele (jméno, sídlo, IČO).
- Datum vystavení a datum uskutečnění zdanitelného plnění (DUZP).
- Předmět plnění, množství, cena.
- **Povinná poznámka „Nejsem plátce DPH"** (dle § 11 odst. 1 zákona o účetnictví ve spojení s § 92 ZDPH).
- Variabilní symbol, splatnost, bankovní účet.

### E.2 Limity DPH 2025–2026
Dle novely zákona č. 235/2004 Sb., o dani z přidané hodnoty (účinnost od 1. 1. 2025, viz Finanční správa ČR, „Informace ke změnám v oblasti DPH od 1. 1. 2025", financnisprava.gov.cz):
- **Obrat za kalendářní rok 2 000 000 Kč** → plátcem od 1. ledna následujícího roku, žádost o registraci do 10 pracovních dnů od překročení.
- **Obrat 2 536 500 Kč** → plátcem ihned od druhého dne po překročení, žádost o registraci do 10 pracovních dnů.

### E.3 Identifikovaná osoba
Pokud Tomáš nakoupí službu od zahraničního dodavatele z EU (např. Stripe Irsko, Google Workspace, AWS Lucembursko) nebo prodá službu podnikateli v jiném státě EU, vzniká povinnost **registrace k identifikované osobě** do 15 dnů. Cílová skupina SimpleCRM jsou české firmy → identifikovaná osoba ano, jakmile začne kupovat reklamu na Facebooku/Google nebo zahraniční SaaS.

### E.4 DAC7 — **NEDOPADÁ NA SIMPLECRM**
DAC7 (zákon č. 373/2022 Sb., novela zákona o mezinárodní spolupráci při správě daní) ukládá oznamovací povinnost provozovatelům **digitálních platforem**, které propojují prodejce a kupující. SimpleCRM prodává **vlastní službu** pod vlastním IČO, nikoli zboží/služby třetích stran. Stanovisko GFŘ: prodej vlastních produktů z e-shopu pod vlastním IČO není „oznamovanou činností" dle DAC7.

### E.5 One Stop Shop — neaplikuje se
OSS by se uplatnil pro B2C prodej do EU. SimpleCRM cílí na české B2B (reverse charge u zahraničních B2B). Pro tuzemský B2B prodej v ČR se OSS nepoužívá.

---

## F) DALŠÍ POVINNÉ NÁLEŽITOSTI A REGULACE

### F.1 AML zákon (č. 253/2008 Sb.) — **NEDOPADÁ NA SAAS**
Povinné osoby dle § 2 AML zákona jsou banky, pojišťovny, advokáti, účetní, realitní zprostředkovatelé, hazardní hry, virtuální aktiva atd. Provozovatel B2B SaaS není povinnou osobou. Tomáš tedy nemá AML povinnosti (KYC svých zákazníků provádí pouze ComGate vůči Tomášovi).

### F.2 Whistleblowing (zákon č. 171/2023 Sb.) — NEDOPADÁ
Zákon o ochraně oznamovatelů se vztahuje na zaměstnavatele s **50 a více zaměstnanci**. OSVČ bez zaměstnanců nemá povinnost zavádět vnitřní oznamovací systém.

### F.3 European Accessibility Act / zákon č. 424/2023 Sb. — VÝJIMKA PRO MIKROPODNIK
Účinnost od 28. června 2025. **Výjimka pro mikropodniky** poskytující služby je vázána na definici dle doporučení Komise 2003/361/ES (resp. přílohy I nařízení Komise (EU) 651/2014): *„podniky, které zaměstnávají méně než 10 osob a jejichž roční obrat nepřesahuje 2 miliony EUR nebo jejichž bilanční suma roční rozvahy nepřevyšuje 2 miliony EUR"* (zdroj: gdpr.cz/pristupnost-vyrobku-a-sluzeb; HAVEL & PARTNERS). OSVČ bez zaměstnanců a s plánovaným obratem do 5 mil. Kč ročně splňuje obě podmínky → **EAA na SimpleCRM nedopadá**.

Pozor: pokud Tomáš dosáhne 10+ zaměstnanců nebo přesáhne obrat ~50 mil. Kč ročně, výjimka padá a web musí splňovat WCAG 2.1 úroveň AA. **Doporučení**: budovat web již teď s WCAG AA jako konkurenční výhodu a prevence budoucího re-designu.

### F.4 Free trial — žádné speciální značení v B2B
Pro B2C platí novelizovaný § 1813a OZ („tlačítková novela") — informace o ceně po skončení zkušebního období musí být uvedena před objednávkou. **V B2B není povinnost**, ale **best practice**: na ceníku a registraci jasně uvést „30denní free trial bez platební karty, po skončení trialu neproběhne automatické strhávání bez vašeho potvrzení".

### F.5 Automatické obnovování předplatného — POVINNÉ NÁLEŽITOSTI
Pravidla Visa/Mastercard a ComGate vyžadují:
- **Před první platbou** zákazník výslovně potvrdí podmínky opakování (checkbox).
- Po každé stržené platbě zaslat doklad e-mailem.
- O jakékoli změně ceny nebo frekvence informovat **předem**.
- Možnost **online ukončení odběru** kdykoli (zrušit v aplikaci nebo e-mailem na konkrétní adresu).

### F.6 Storno a vypovězení smlouvy
Pro B2B SaaS doporučuji:
- Smlouva na dobu neurčitou s **měsíční výpovědní lhůtou k poslednímu dni zúčtovacího období**, nebo
- Smlouva na dobu určitou (např. roční plán) s automatickým prodloužením, pokud zákazník nevypoví nejméně 30 dní před koncem.

---

## G) BEST PRACTICES A DOPORUČENÉ STRÁNKY

| Stránka | Doporučení | Status |
|---|---|---|
| Landing page | Hero, hodnotová proposice, social proof | Best practice |
| Ceník | 99 Kč/uživatel/měsíc, jasné podmínky free trial | Best practice + povinné cena |
| Registrace | IČO povinné, deklarace B2B | Best practice |
| Kontakt | E-mail, telefon, adresa, IČO | Povinné (ComGate) |
| Obchodní podmínky | Kompletní text VOP | Povinné (ComGate) |
| Zásady ochrany osobních údajů | GDPR | Povinné (GDPR) |
| Cookie policy + lišta | Opt-in, rovnocenná tlačítka | Povinné (§ 89/127/2005) |
| Zpracovatelská smlouva (DPA) | Příloha VOP | Povinné (GDPR čl. 28) |
| Reklamační podmínky / Práva z vadného plnění | Sekce ve VOP | Vyžadováno ComGate |
| Patička s povinnými údaji | Tomáš + IČO + ŽR + loga Visa/MC | Povinné (§ 435 OZ + ComGate) |
| Status page | uptime, výpadky | Best practice |
| Documentation / Help | uživatelská dokumentace | Best practice |
| Blog | Marketing | Best practice |

### G.1 Patička e-mailu (POVINNÉ ZE ZÁKONA)
Každý obchodní e-mail dle § 7 zákona č. 480/2004 Sb. musí v patičce obsahovat:
- Identifikaci odesílatele (jméno, IČO, sídlo).
- U marketingových e-mailů jednoduchý odhlašovací odkaz.
- Označení, že jde o obchodní sdělení (např. „Tento e-mail je obchodní sdělení dle § 7 zák. č. 480/2004 Sb.").

### G.2 Newsletter — souhlas
- Souhlas musí být svobodný, konkrétní, informovaný, jednoznačný, **prokazatelný** (nepředzaškrtnutý checkbox, doložení zdroje).
- Pro existující zákazníky lze zasílat obchodní sdělení o **obdobných produktech a službách** bez souhlasu (§ 7 odst. 3 zákona č. 480/2004 Sb.), ale s povinností v každém e-mailu nabídnout odhlášení.

---

## H) NÁVRH PŘESNÉHO ČESKÉHO OBSAHU PRO SIMPLECRM.CZ

> **Placeholdery k doplnění Tomášem:** `[Jméno a příjmení]`, `[IČO]`, `[Adresa sídla]`, `[E-mail]`, `[Telefon]`, `[Číslo bankovního účtu]`, `[Datum účinnosti]`. Příklad: Tomáš Novák, IČO 12345678, sídlem Příklad 123, 602 00 Brno.

### H.1 Kontaktní stránka — struktura a obsah

**Hlavička:** „Kontakt"

**Sekce 1 — Provozovatel služby**
```
SimpleCRM provozuje:
[Jméno a příjmení]
[Adresa sídla, Brno]
IČO: [IČO]
Fyzická osoba zapsaná v živnostenském rejstříku.

E-mail: [obecný kontaktní e-mail, např. ahoj@simplecrm.cz]
Podpora: [podpora@simplecrm.cz]
Obchod: [obchod@simplecrm.cz]
Telefon: [+420 XXX XXX XXX] (Po–Pá 9:00–17:00)
```

**Sekce 2 — Kontaktní formulář** (jméno, e-mail, firma, IČO, předmět, zpráva, GDPR checkbox + odkaz na Zásady)

**Sekce 3 — Reklamace a podpora**
Reklamace přijímáme výhradně písemně na `[podpora@simplecrm.cz]`. Postup viz [Obchodní podmínky, čl. X].

**Sekce 4 — Fakturační a právní stránky** (odkazy na VOP, Zásady, Cookies, DPA).

---

### H.2 Obchodní podmínky pro B2B SaaS — kompletní text

```
VŠEOBECNÉ OBCHODNÍ PODMÍNKY SLUŽBY SIMPLECRM

[Jméno a příjmení], IČO [IČO], se sídlem [Adresa sídla, Brno],
fyzická osoba zapsaná v živnostenském rejstříku
(dále jen „Poskytovatel")
vydává tyto všeobecné obchodní podmínky (dále jen „VOP"):

1. ÚVODNÍ USTANOVENÍ

1.1 Tyto VOP upravují v souladu s § 1751 odst. 1 zákona č. 89/2012 Sb.,
občanský zákoník (dále jen „OZ"), vzájemná práva a povinnosti
Poskytovatele a zákazníka (dále jen „Uživatel") vzniklé v souvislosti
s poskytováním cloudové služby SimpleCRM (dále jen „Služba") prostřednictvím
webové aplikace dostupné na simplecrm.cz.

1.2 Smlouva o poskytování Služby (dále jen „Smlouva") se uzavírá
distančním způsobem v souladu s § 2389a a násl. OZ jako smlouva
o poskytování digitální služby.

1.3 Tyto VOP se vztahují výhradně na vztahy mezi podnikateli (B2B).
Uživatel uzavřením Smlouvy prohlašuje, že je podnikatelem ve smyslu
§ 420 OZ a jedná v rámci své podnikatelské činnosti. Služba není určena
spotřebitelům ve smyslu § 419 OZ.

2. DEFINICE POJMŮ

„Služba" znamená cloudovou aplikaci SimpleCRM pro řízení vztahů se
zákazníky a obchodními příležitostmi, kterou Poskytovatel nabízí
formou software jako služby (SaaS).
„Uživatelský účet" — administrátorský účet a uživatelské licence v rámci tarifu.
„Uživatelská licence" — oprávnění jednoho fyzického uživatele.
„Plán" / „Tarif" — placená varianta služby dle Ceníku.
„Zúčtovací období" — měsíční nebo roční období dle volby Uživatele.

3. UZAVŘENÍ SMLOUVY A REGISTRACE

3.1 Uživatel se registruje vyplněním formuláře na simplecrm.cz, kde uvádí
zejména název firmy, IČO, sídlo, fakturační údaje, jméno administrátora
a kontaktní e-mail. Uvedením IČO Uživatel potvrzuje, že je podnikatelem.

3.2 Smlouva je uzavřena okamžikem odeslání potvrzujícího e-mailu
Poskytovatelem na e-mailovou adresu Uživatele.

3.3 Smlouva se uzavírá na dobu neurčitou s možností výpovědi dle čl. 9.

4. ZKUŠEBNÍ OBDOBÍ (FREE TRIAL)

4.1 Uživatel má nárok na bezplatné zkušební užívání Služby po dobu
30 dnů od založení účtu, a to bez nutnosti zadání platební karty.

4.2 Po skončení zkušebního období nedojde k automatickému strhávání
platby. Pro pokračování ve Službě musí Uživatel aktivně zvolit Plán
a zadat platební metodu.

5. CENA A PLATEBNÍ PODMÍNKY

5.1 Cena za Službu je stanovena Ceníkem zveřejněným na simplecrm.cz
a je uvedena v Kč za jednoho uživatele za jeden kalendářní měsíc.
Poskytovatel není plátcem DPH.

5.2 Cena je hrazena předem na začátku každého Zúčtovacího období
prostřednictvím platební brány Comgate. Daňový doklad bude Uživateli
vystaven elektronicky a zaslán na kontaktní e-mail.

5.3 Pokud se Uživatel rozhodne pro automatické obnovování předplatného
(viz čl. 6), platí podmínky opakovaných plateb.

5.4 Poskytovatel je oprávněn jednostranně změnit cenu Služby.
Změnu oznámí Uživateli e-mailem nejméně 30 dnů předem. Uživatel má
právo Smlouvu vypovědět ke dni účinnosti nové ceny.

6. AUTOMATICKÉ OBNOVOVÁNÍ PŘEDPLATNÉHO (OPAKOVANÉ PLATBY)

6.1 Uživatel si může zvolit režim automatického obnovování předplatného,
v rámci kterého jsou platby pravidelně strhávány z jeho platební karty
prostřednictvím funkce opakovaných plateb platební brány Comgate (Card-on-File).

6.2 Před aktivací automatického obnovení Uživatel výslovně potvrdí,
že souhlasí s tím, že:
  a) z jeho karty bude pravidelně strhávána částka odpovídající jeho Plánu
     a počtu uživatelských licencí,
  b) frekvence stržení odpovídá zvolenému Zúčtovacímu období (měsíčně nebo ročně),
  c) opakované platby budou trvat do doby, než je Uživatel zruší,
  d) o každé stržené platbě obdrží potvrzení (daňový doklad) na svůj e-mail,
  e) o jakékoliv změně výše stržené částky nebo frekvence bude předem
     informován e-mailem.

6.3 Uživatel může automatické obnovování kdykoli zrušit:
  a) v administraci svého účtu (záložka „Předplatné"),
  b) e-mailem na adresu [podpora@simplecrm.cz], nejpozději 1 pracovní
     den před stržením další platby.

6.4 Zrušením opakovaných plateb nedochází k automatickému ukončení
Smlouvy — Smlouva trvá do konce zaplaceného Zúčtovacího období,
po jeho uplynutí dojde k pozastavení účtu, pokud Uživatel neprovede
úhradu jinou cestou.

7. PRÁVA A POVINNOSTI UŽIVATELE

7.1 Uživatel se zavazuje:
  a) chránit přihlašovací údaje před zneužitím,
  b) užívat Službu v souladu s právními předpisy a dobrými mravy,
  c) nezasahovat do Služby, neprovádět reverzní inženýrství,
  d) neporušovat autorská práva Poskytovatele.

7.2 Uživatel odpovídá za obsah, který do Služby nahrává (zejména
osobní údaje svých zákazníků a kontaktů).

8. PRÁVA A POVINNOSTI POSKYTOVATELE, SLA

8.1 Poskytovatel se zavazuje zajistit dostupnost Služby v rozsahu 99,5 %
měsíční dostupnosti, mimo plánované odstávky oznámené alespoň 48 hodin předem.

8.2 Poskytovatel je oprávněn dočasně pozastavit Službu z důvodů
údržby, technické poruchy, vyšší moci nebo zásahu třetí strany.

8.3 Poskytovatel zajistí dostupnost aktualizací Služby nezbytných
pro udržení její funkčnosti.

8.4 Poskytovatel je oprávněn jednostranně měnit funkce Služby.
O zásadních změnách (omezení funkcí) informuje Uživatele e-mailem
alespoň 30 dnů předem.

9. UKONČENÍ SMLOUVY

9.1 Uživatel může Smlouvu kdykoli vypovědět bez udání důvodu zrušením
účtu v administraci. Výpověď je účinná ke konci aktuálního Zúčtovacího období.

9.2 Poskytovatel může Smlouvu vypovědět s 30denní výpovědní lhůtou
nebo odstoupit při porušení Smlouvy ze strany Uživatele.

10. ODPOVĚDNOST ZA VADY, REKLAMACE A NÁHRADA ŠKODY

10.1 Vadou Služby se rozumí významná nedostupnost (delší než SLA),
ztráta dat zaviněná Poskytovatelem, případně dlouhodobá nefunkčnost
zásadní funkce.

10.2 Reklamaci Uživatel uplatňuje písemně na [podpora@simplecrm.cz],
Poskytovatel ji vyřídí do 30 dnů.

10.3 Práva z vadného plnění: oprava, sleva z ceny, případně odstoupení
od Smlouvy při podstatném porušení.

10.4 Celková výše náhrady škody vůči Uživateli je
omezena částkou rovnající se ceně Služby zaplacené Uživatelem
za posledních 12 měsíců předcházejících vzniku škody. Vyloučena
je odpovědnost za ušlý zisk a následné/nepřímé škody. Uživatel
s tímto omezením výslovně souhlasí.

11. OCHRANA OSOBNÍCH ÚDAJŮ

11.1 Při poskytování Služby zpracovává Poskytovatel osobní údaje
zaměstnanců a kontaktních osob Uživatele jako správce — podrobnosti
v dokumentu „Zásady zpracování osobních údajů".

11.2 Pokud Uživatel nahraje do Služby osobní údaje třetích osob
(svých zákazníků, kontaktů), je Poskytovatel v postavení zpracovatele
podle čl. 28 GDPR. Vztah upravuje samostatná Smlouva o zpracování
osobních údajů (DPA), která tvoří Přílohu č. 1 těchto VOP.

12. AUTORSKÁ PRÁVA A LICENCE

12.1 Služba a její součásti jsou autorským dílem Poskytovatele.
Uživatel získává nevýhradní, časově omezenou (po dobu trvání Smlouvy)
licenci k užívání Služby výhradně pro účely svého podnikání.

12.2 Uživatel není oprávněn Službu kopírovat, dále poskytovat třetím
stranám, zpřístupňovat ve formě veřejné nabídky či používat ke
školení AI systémů.

13. ZÁVĚREČNÁ USTANOVENÍ

13.1 Tyto VOP a Smlouva se řídí právním řádem České republiky.
K řešení sporů jsou příslušné obecné soudy České republiky.

13.2 Poskytovatel je oprávněn tyto VOP jednostranně měnit.
O změně bude Uživatel informován e-mailem alespoň 30 dnů před účinností.
Uživatel je oprávněn Smlouvu z důvodu nesouhlasu se změnou vypovědět
ke dni účinnosti změny.

13.3 Tyto VOP nabývají účinnosti dne [Datum účinnosti].
```

---

### H.3 Zásady zpracování osobních údajů — kompletní text

```
ZÁSADY ZPRACOVÁNÍ OSOBNÍCH ÚDAJŮ

1. SPRÁVCE OSOBNÍCH ÚDAJŮ

Správcem osobních údajů je:
[Jméno a příjmení], IČO [IČO], se sídlem [Adresa sídla, Brno],
zapsaná v živnostenském rejstříku.
Kontakt: [e-mail], [telefon].

2. JAKÉ ÚDAJE ZPRACOVÁVÁME A NA JAKÉM ZÁKLADĚ

a) Identifikační a kontaktní údaje uživatelské registrace
(jméno, příjmení, e-mail, telefon, firma, IČO, fakturační adresa)
   Účel: plnění smlouvy, fakturace
   Právní základ: čl. 6 odst. 1 písm. b) GDPR (smlouva),
   čl. 6 odst. 1 písm. c) GDPR (zákonné povinnosti — účetnictví)
   Doba uchování: po dobu trvání smlouvy + 10 let (zákon č. 563/1991 Sb.)

b) Údaje o užívání služby (IP adresa, log-in, akce v aplikaci)
   Účel: zabezpečení, audit, technická podpora
   Právní základ: čl. 6 odst. 1 písm. f) GDPR (oprávněný zájem)
   Doba uchování: 12 měsíců

c) Marketingové údaje (e-mail pro newsletter)
   Účel: zasílání obchodních sdělení o našich službách
   Právní základ: čl. 6 odst. 1 písm. f) GDPR (oprávněný zájem
   u stávajících zákazníků dle § 7 zák. č. 480/2004 Sb.);
   souhlas u ostatních
   Doba uchování: do odvolání souhlasu / odhlášení

3. PŘÍJEMCI OSOBNÍCH ÚDAJŮ

Vaše údaje předáváme pouze:
- poskytovatelům hostingu a IT infrastruktury (Hetzner Online GmbH, Německo, EU),
- platební bráně Comgate, a.s.,
- fakturačnímu systému [Fakturoid, s. r. o. / iDoklad, …],
- e-mailingovému nástroji [Brevo / Smartemailing …],
- nástrojům pro zákaznickou podporu [Crisp / Help Scout …],
- účetní [jméno účetní] po dohodě.

Všichni dodavatelé jsou v EU/EHP. Nepředáváme údaje do třetích zemí.

4. PRÁVA SUBJEKTŮ ÚDAJŮ

Máte právo:
- na přístup ke svým údajům (čl. 15 GDPR),
- na opravu (čl. 16),
- na výmaz / „zapomenutí" (čl. 17),
- na omezení zpracování (čl. 18),
- na přenositelnost (čl. 20),
- vznést námitku proti zpracování (čl. 21),
- odvolat souhlas (čl. 7 odst. 3),
- podat stížnost u Úřadu pro ochranu osobních údajů (uoou.gov.cz).

Pro uplatnění práv kontaktujte: [e-mail].

5. ZABEZPEČENÍ

Údaje jsou chráněny šifrovaným přenosem (HTTPS/TLS),
šifrovaným úložištěm, dvoufaktorovým ověřením administrátorských
přístupů a pravidelnými zálohami.

6. ZPRACOVÁNÍ ÚDAJŮ V CRM (POSTAVENÍ ZPRACOVATELE)

Pokud nahráváte do SimpleCRM osobní údaje svých zákazníků, jsme
v postavení zpracovatele dle čl. 28 GDPR. Vztah řídí samostatná
Smlouva o zpracování osobních údajů (DPA), která je přílohou VOP.

7. AKTUÁLNOST

Tyto zásady jsou účinné od [Datum]. Aktuální verze je vždy
zveřejněna na simplecrm.cz/ochrana-osobnich-udaju.
```

---

### H.4 Cookie policy + cookie lišta

**Cookie lišta — texty:**

První vrstva (banner):
> „Tento web používá cookies. Nezbytné cookies používáme pro správné fungování webu. S vaším souhlasem budeme používat i analytické cookies pro zlepšování naší služby. Podrobné nastavení můžete kdykoli změnit. Více informací v [Zásadách cookies]."
>
> [Přijmout vše] [Odmítnout vše] [Nastavení]

> **Důležité**: Tlačítka „Přijmout vše" a „Odmítnout vše" musí být **vizuálně rovnocenná** (stejná velikost, kontrast, pozice).

**Cookie policy:**
```
ZÁSADY POUŽÍVÁNÍ COOKIES

1. Co jsou cookies
Cookies jsou malé textové soubory, které se ukládají do vašeho
zařízení při návštěvě webové stránky.

2. Které cookies používáme

a) Nezbytné cookies (bez souhlasu — § 89 odst. 3 zák. č. 127/2005 Sb.)
   - session_id — udržení přihlášení, doba: 1 hodina
   - cookie_consent — záznam vaší volby, doba: 12 měsíců

b) Analytické cookies (vyžadují souhlas)
   - [Plausible Analytics: žádné cookies / GA4 _ga: 14 měsíců]

c) Marketingové cookies — nepoužíváme.

3. Jak souhlas spravovat
Své preference můžete kdykoli změnit kliknutím na odkaz
„Nastavení cookies" v patičce webu.

4. Doba uchování
Konkrétní doby uvedeny výše.
```

---

### H.5 Patička webu — povinné údaje

```
─────────────────────────────────────────────
[Logo SimpleCRM]

PROVOZOVATEL
[Jméno a příjmení]
[Adresa sídla, Brno]
IČO: [IČO]
Fyzická osoba zapsaná v živnostenském rejstříku.

KONTAKT
[ahoj@simplecrm.cz]
[+420 XXX XXX XXX]

ODKAZY
[Obchodní podmínky] [Zásady ochrany osobních údajů]
[Zpracovatelská smlouva (DPA)] [Cookies]
[Nastavení cookies]

PLATEBNÍ METODY
[VISA] [Mastercard] [Apple Pay] [Google Pay] [Comgate]

Online platby pro nás zajišťuje platební brána Comgate.

© 2026 SimpleCRM
─────────────────────────────────────────────
```

---

### H.6 Reklamační řád / Práva z vadného plnění (sekce ve VOP)

Vzhledem k B2B charakteru lze řešit jako sekci ve VOP (čl. 10). Klíčové body:
- Definice vady služby (nedostupnost, ztráta dat, nefunkčnost).
- Forma reklamace (e-mail).
- Lhůta vyřízení (30 dnů).
- Práva: oprava, sleva, odstoupení.

---

### H.7 Smlouva o zpracování osobních údajů (DPA) — příloha VOP

```
SMLOUVA O ZPRACOVÁNÍ OSOBNÍCH ÚDAJŮ
(Příloha č. 1 VOP)

Tato smlouva tvoří nedílnou součást VOP a uzavírá se v souladu
s článkem 28 GDPR mezi:

Správcem: Uživatel (specifikovaný registrací)
Zpracovatelem: [Jméno a příjmení], IČO [IČO], se sídlem [Adresa]

1. PŘEDMĚT A POVAHA ZPRACOVÁNÍ
Zpracovatel zpracovává osobní údaje subjektů údajů, které Správce
nahrává do Služby SimpleCRM (zejména kontakty zákazníků, obchodní
korespondence, fakturační údaje), výhradně za účelem poskytování Služby
po dobu trvání Smlouvy.

2. KATEGORIE SUBJEKTŮ ÚDAJŮ
Zákazníci, obchodní partneři, zaměstnanci a kontaktní osoby Správce.

3. KATEGORIE OSOBNÍCH ÚDAJŮ
Identifikační údaje (jméno, název firmy, IČO), kontaktní údaje
(e-mail, telefon, adresa), údaje o obchodních vztazích.

4. POVINNOSTI ZPRACOVATELE
Zpracovatel:
a) zpracovává údaje pouze na základě pokynů Správce,
b) zajišťuje mlčenlivost osob s přístupem k údajům,
c) přijímá technická a organizační opatření dle čl. 32 GDPR
   (šifrování přenosů a úložiště, autentizace, logování, zálohy),
d) bez zbytečného odkladu informuje Správce o porušení
   zabezpečení (max. do 48 hodin),
e) pomáhá Správci s žádostmi subjektů údajů,
f) na konci smlouvy údaje vymaže nebo vrátí Správci (dle volby),
g) umožňuje audit Správci (předem oznámený, max. 1x ročně).

5. SUBDODAVATELÉ (SUB-PROCESSORS)
Správce uděluje obecné povolení k zapojení subdodavatelů uvedených
níže. O změně subdodavatele bude Správce informován s 30denním
předstihem a má právo vznést námitku.

Aktuální seznam:
- Hetzner Online GmbH (hosting, DE)
- Comgate, a.s. (platby, CZ)
- [Fakturoid s.r.o. / iDoklad / …] (fakturace, CZ)
- [Brevo / SmartEmailing / …] (e-mail, EU)

6. PŘEDÁVÁNÍ DO TŘETÍCH ZEMÍ
Veškeré zpracování probíhá v EU/EHP. Předávání mimo EU
neprobíhá.

7. DOBA TRVÁNÍ
Tato DPA je účinná po dobu trvání hlavní Smlouvy a 30 dnů po jejím
ukončení (období na export dat).
```

---

### H.8 Informace o automatickém obnovování předplatného (stránka „Předplatné a platby")

```
JAK FUNGUJE PŘEDPLATNÉ SIMPLECRM

Po skončení 30denního zkušebního období můžete pokračovat zaplacením
předplatného. Předplatné se neaktivuje automaticky.

OPAKOVANÉ PLATBY (AUTOMATICKÉ OBNOVENÍ)
Pokud zvolíte automatické obnovení, bude:

✓ Z vaší platební karty pravidelně stržena částka odpovídající
  vašemu plánu (99 Kč × počet uživatelů × měsíc).
✓ Stržení probíhá vždy první den nového zúčtovacího období.
✓ Platby trvají do doby, než je zrušíte.
✓ O každé platbě dostanete e-mail s daňovým dokladem.
✓ O jakékoliv změně ceny vás informujeme e-mailem alespoň 30 dní předem.

ZRUŠENÍ AUTOMATICKÝCH PLATEB
Můžete je zrušit kdykoli:
1. V administraci → Předplatné → tlačítko „Zrušit automatické obnovení",
2. Nebo e-mailem na podpora@simplecrm.cz, nejpozději 1 pracovní den
   před stržením další platby.

Zrušení automatických plateb neukončí vaše předplatné — služba pojede
do konce zaplaceného období. Pro úplné ukončení smlouvy zrušte účet
v administraci.

ZABEZPEČENÍ PLATEB
Platební údaje zpracovává Comgate, a.s. dle standardu PCI-DSS Level 1
(comgate.cz/en/about-us uvádí: „We recertify the PCI DSS Level 1
security certification annually, thus renewing it" — certifikace
poprvé dosažena 2020; Comgate je přímým členem karetních asociací
Visa a Mastercard — Principal member). SimpleCRM nikdy nemá přístup
k číslu vaší karty.
```

---

## Doporučení — postup pro Tomáše (chronologicky)

1. **Před spuštěním webu**: doplnit povinné údaje v patičce a kontaktu (jméno, IČO, sídlo, „zapsán v živnostenském rejstříku"); nasadit HTTPS.
2. **Připravit právní balík**: VOP B2B, Zásady ochrany osobních údajů, DPA (jako Příloha 1 VOP), Cookie policy.
3. **Cookie lišta**: nasadit CMP s rovnocenným tlačítkem „Přijmout vše" / „Odmítnout vše"; doporučuji **Plausible Analytics místo Google Analytics** (žádné cookies, žádný souhlas).
4. **Zaregistrovat se u ComGate** přes inquiry formulář, vyplnit AML doklady na doklady.comgate.cz (2 doklady, identifikační platba 1 Kč, prohlášení).
5. **Aktivovat opakované platby** přes podporu ComGate (zvlášť schvalují).
6. **Otestovat** v sandboxu — provést testovací platbu, ověřit notifikace, doklady.
7. SimpleCRM = služba, výjimka platí. Pokud Tomáš začne nabízet i nějaký hardware nebo by překročil 10 zaměstnanců, výjimka padá.
- **Doporučuji** uzavřít s ComGate smlouvu **dříve než s ostatními poskytovateli**, aby Tomáš stihl 14denní AML proces a 5denní schválení karetních asociací před plánovaným spuštěním.
