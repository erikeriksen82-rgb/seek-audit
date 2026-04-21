# SEEK Audit

Automatisert audit-rapport-generator for norske håndverksbedrifter. Brukes som salgsverktøy i SEEK — genererer PDF-rapport per bedrift med SEEK-score, estimert margintap, systemsvikter og ferdige replikker til telefonsalg.

## Kom i gang

```bash
# Installer avhengigheter
npm install

# Kopier env-mal og fyll inn API-nøkler
cp .env.example .env

# Kjør audit på én bedrift
npm run audit -- --orgnr 819595712

# Kjør batch på CSV-liste
npm run audit:batch -- --input data/input/leads.csv
```

## Struktur

```
seek-audit/
├── CLAUDE.md        Full prosjektkontekst (les denne)
├── src/             All kildekode
├── templates/       PDF-maler
├── data/
│   ├── input/       CSV-lister med leads
│   ├── cache/       API-svar caches her
│   └── output/      Ferdige PDFer
├── config/          Bransjer, vekter, replikker (JSON)
└── tests/           Tester
```

## For Claude Code

Les `CLAUDE.md` først. Den inneholder all forretningskontekst, scoring-logikk, datakilder og byggrekkefølge.

## Output

Hver rapport lagres som:
```
data/output/[dato]/[orgnr]-[bedriftsnavn].pdf
```
