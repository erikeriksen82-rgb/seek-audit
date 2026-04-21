# SEEK Audit — Prosjektkontekst for Claude Code

Denne filen er primærkonteksten for alt arbeid i dette prosjektet. Les den først.

---

## 1. Hva prosjektet gjør

Audit-rapport-generator som tar en håndverksbedrift som input (org.nr eller navn) og produserer en PDF-rapport som brukes som inngang til salgssamtaler.

Rapporten måler hvor godt bedriften ligger an på fire områder, beregner estimert årlig margintap på grunn av svakheter, og gir selgeren ferdige replikker til bruk på telefon eller i møte.

Output: PDF per bedrift, lagret i `data/output/`.

Input: CSV-liste i `data/input/` eller enkelt oppslag via kommandolinje.

---

## 2. Forretningskontekst — SEEK

SEEK er et markedsføringsbyrå som spesialiserer seg utelukkende på norske håndverkere. I motsetning til vanlige byråer som leverer trafikk og leads, overtar SEEK hele salgsleddet etter at kunden tar kontakt — automatisk respons innen 30 sekunder, filtrering, oppfølging og booking av befaringer direkte i håndverkerens kalender.

SEEK identifiserer tre systemsvikter hos håndverkere:

1. **Respons-gapet** — manuell respons utenfor arbeidstid taper jobber
2. **Ressurslekkasjen** — fagkapasitet sløses på feil befaringer
3. **Oppfølgingssvikten** — strukturerte sekvenser mangler, leads kjølner

Audit-rapporten måler disse tre sviktene hos hver enkelt bedrift.

### SEEK-pakker (referanse for break-even-regnestykke)

| Pakke | Pris/mnd | Anbefalt annonsebudsjett | Total/mnd |
|-------|----------|--------------------------|-----------|
| Intro | 5 990 (engangs, 30 d) | inkludert | 5 990 |
| Start | 9 990 | 6 000+ | ~16 000 |
| Drift | 14 990 | 10 000+ | ~25 000 |
| Vekst | 19 990 | 15 000+ | ~35 000 |

Målgruppe: håndverkere med prosjektverdi 50 000+ per oppdrag. Én ekstra jobb/mnd skal dekke hele kostnaden.

---

## 3. Hva rapporten måler

### Område 1: Synlighet
- Google Business Profile: finnes, komplett, antall anmeldelser, snittvurdering, siste aktivitet
- Organisk rangering på `[bransje] [by]` og `[bransje] [by] akutt`
- Google Ads aktiv (via Google Ads Transparency Center)
- Meta Ads aktiv (via Meta Ad Library)
- Nettside: finnes, SSL, lastetid (PageSpeed), mobilvennlig

### Område 2: Respons-gap
- Chatbot-widget på nettside (detekter: Intercom, Tidio, Drift, Crisp, LiveChat, Tawk, Zendesk, GHL, Trengo)
- Automatisk respons på kontaktskjema (signal: bekreftelsestekst, "vi svarer innen X")
- Booking-kalender (signal: Calendly, Cal.com, SimplyBook, GHL-booking)
- Åpningstider oppgitt, vakttelefon, 24/7-løfte

### Område 3: Kundereise
- Kontaktskjema: finnes, antall felter, kvalifiseringsspørsmål (jobbtype, omfang, tidsperspektiv)
- "Gratis befaring" fremtredende uten filtrering → rødt flagg
- Telefonnummer klikkbart på mobil
- CTA-tydelighet på forside
- Antall klikk fra forside til henvendelse

### Område 4: Oppfølging
- CRM-spor i HTML (HubSpot, Pipedrive, GHL, ActiveCampaign, Mailchimp tracking)
- Retargeting-pixels (Meta Pixel, Google Ads conversion, LinkedIn Insight)
- Nyhetsbrev-påmelding synlig
- E-post-automasjon-plattform detektert

### Bedriftskontekst (fra Brreg)
- Omsetning (estimerer prosjektverdi og jobbvolum)
- Ansatte (skalerer regnestykke for ressurslekkasje)
- Bransjekode (matcher mot SEEK-prioriteringer)
- Etableringsår (modenhet)
- Eierstruktur og konsernforhold (skiller enmannsbedrift fra profesjonell aktør)

---

## 4. Scoring-logikk

Hver bedrift får en SEEK-score fra 0 til 100. Høyere score = flere svakheter = het lead.

Scoring er vektet per område:
- Respons-gap: 35 %
- Kundereise: 25 %
- Oppfølging: 20 %
- Synlighet: 20 %

Eksakte vekter og terskler ligger i `config/scoring-vekter.json`.

Score-tolkning:
- **70–100**: Het lead. Alle signaler peker mot SEEK-match. Ring først.
- **40–69**: Varm lead. Flere svakheter, men også noen styrker. Verdt samtale.
- **20–39**: Lav match. Bedriften har allerede mye på plass.
- **0–19**: Feil lead eller ekskludert. Ikke prioriter.

### Ekskluderingskriterier (fra SEEK-konseptet)
- Snittjobb under 15 000–20 000 kr (regnestykke fungerer ikke)
- Konkurrerer primært på pris
- Mangler kapasitet (f.eks. enmannsforetak uten vekstambisjon)
- Allerede har full automasjon (chatbot + booking + CRM) → lavere potensiale

---

## 5. Regnestykke — estimert årlig margintap

Tre komponenter, alle kalibrert per bransje i `config/bransjer.json`:

**Tap fra respons-gap:**
```
henvendelser_per_uke × andel_etter_arbeidstid × andel_tapt_pga_sen_respons × snittjobb × margin × 52
```

**Tap fra ressurslekkasje:**
```
bom_befaringer_per_uke × timer_per_bom × timepris × 48
```

**Tap fra oppfølgingssvikt:**
```
tilbud_per_mnd × andel_høyverdi × andel_tapt_i_oppfølging × snittjobb × margin × 12
```

Alle tre justeres med scaling-faktor basert på antall ansatte og omsetning.

---

## 6. Bransjer vi auditerer

Prioritering fra SEEK-konseptet:

| Bransje | Primær systemsvikt | Prioritet |
|---------|-------------------|-----------|
| Rørlegger | Respons-gap | Høy |
| Elektriker | Ressurslekkasje | Høy |
| Tømrer / Snekker | Ressurslekkasje | Høy |
| Bad / Totalrenovering | Oppfølgingssvikt | Høy |
| Tak / Fasade | Sesongfiltrering | Middels-høy |
| VVS / Varmepumpe | Routing | Middels |
| Mur / Puss / Betong | Pre-kvalifisering | Middels |

Hver bransje har egne parametre i `config/bransjer.json`:
- Snittjobb (kr)
- Margin (%)
- Estimerte henvendelser per uke per ansatt
- Andel etter arbeidstid
- Andel høyverdi-prosjekter
- Primær pitch-vinkel

---

## 7. Datakilder (API-er)

| Kilde | Bruk | Kostnad | Auth |
|-------|------|---------|------|
| Brønnøysundregistrene | Org.data, bransje, ansatte | Gratis | Ingen |
| Regnskapstall (Brreg) | Omsetning, resultat | Gratis | Ingen |
| Google Places API | GMB, anmeldelser, åpningstider | Betalt per oppslag | API-nøkkel |
| PageSpeed Insights | Nettside-ytelse, mobilvennlighet | Gratis | API-nøkkel |
| Google Custom Search / SerpAPI | Organisk rangering | Betalt | API-nøkkel |
| Google Ads Transparency | Aktive Ads | Scraping | Ingen (rate-limit) |
| Meta Ad Library | Aktive Meta Ads | Scraping | Ingen (rate-limit) |
| Nettside-scraping | Chatbot, skjema, CRM-pixels | Gratis | Ingen |

Cache alltid API-svar til `data/cache/` med TTL (typisk 7 dager) for å spare kostnader ved re-kjøring.

---

## 8. PDF-rapportens struktur

Rapporten følger en fast layout. Seksjoner i rekkefølge:

1. **Header** — Bedriftsnavn, nøkkeldata fra Brreg, rapportdato, SEEK-score (stort tall)
2. **Nøkkeltall** — Omsetning, estimert snittjobb, estimert årlig margintap, SEEK break-even
3. **Scorekort** — Horisontale søyler for hvert av de fire områdene
4. **Konkurrent-sammenligning** — Tabell eller graf, 2–3 lokale konkurrenter
5. **Systemsvikter, detaljert** — Én boks per svikt med observasjon, regnestykke, replikk
6. **Styrker** — Kortliste, brukes til anerkjennelse først i samtale
7. **SEEK-match og break-even** — Hvilken pakke passer, hvor raskt den dekkes
8. **Åpningsreplikk** — Ferdig første setning selger kan bruke

Replikker hentes fra `config/pitch-bibliotek.json` basert på hvilke flagg som trigges.

---

## 9. Teknisk stack (foreslått, justerbart)

- **Språk**: Node.js / TypeScript (eller Python hvis foretrukket)
- **HTTP**: `axios` eller `fetch`
- **HTML-parsing**: `cheerio` for nettside-scraping
- **PDF**: `Puppeteer` (HTML → PDF) eller `pdfkit`
- **CSV-håndtering**: `papaparse`
- **Cache**: enkel filbasert JSON-cache i `data/cache/`

Holdes enkelt. Ingen database i første versjon — filsystem holder.

---

## 10. Kjøring

Enkelt oppslag:
```
npm run audit -- --orgnr 819595712
```

Batch fra CSV:
```
npm run audit:batch -- --input data/input/leads.csv
```

Output havner i `data/output/[dato]/[bedriftsnavn].pdf`.

---

## 11. Arbeidsflyt for Claude Code

Når du bygger nye moduler:
1. Les denne filen først
2. Se etter eksisterende moduler å gjenbruke før du lager nytt
3. Cache alltid API-svar
4. Logg feil til konsoll, men la batch-kjøring fortsette selv om én bedrift feiler
5. Nye bransjer og regnestykke-justeringer gjøres i `config/*.json`, ikke i kode
6. Hold PDF-malen som én HTML-fil — enklere å vedlikeholde enn komponentbibliotek

---

## 12. Prioritert byggrekkefølge

1. Brreg-collector (grunnlag for alt annet)
2. Nettside-scraper (chatbot, skjema, pixels)
3. Scoring-logikk med mock-data for å validere PDF-utseende
4. PDF-generator med statisk testdata
5. Google Places API
6. PageSpeed API
7. Konkurrent-søk (SerpAPI)
8. Google Ads / Meta Ads-sjekk
9. Batch-kjøring fra CSV
10. Integrasjon mot CRM (kommer senere)
