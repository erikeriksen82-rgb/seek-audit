import fs from 'fs'
import path from 'path'
import { AuditResult } from '../types'

const bransjer = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'config', 'bransjer.json'), 'utf-8'))

function kr(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace('.', ',') + ' mill'
  if (n >= 1000) return Math.round(n / 1000) + ' 000'
  return Math.round(n).toLocaleString('nb-NO')
}

function krFull(n: number): string {
  return Math.round(n).toLocaleString('nb-NO')
}

function kortUrl(url: string | null): string {
  if (!url) return 'nettsiden'
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

interface FindingInfo {
  title: string
  desc: string
  priority: 'hoy' | 'middels'
}

function genererFinding(flagg: string, data: AuditResult): FindingInfo | null {
  const w = data.website
  const g = data.gmb
  const r = data.orgRank
  const b = data.brreg
  const url = kortUrl(w.url)
  const by = b?.forretningsadresse?.poststed || 'lokal'
  const bransjeNavn = data.bransjeNavn?.toLowerCase() || 'håndverker'

  switch (flagg) {
    case 'ingen_chatbot': {
      const harSkjema = w.hasContactForm
      const feltCount = w.formFieldCount
      const skjemaTekst = harSkjema
        ? `Vi fant kontaktskjema på ${url} med ${feltCount} felt`
        : `Vi fant ikke noe kontaktskjema på ${url}`
      return {
        priority: 'hoy',
        title: 'Ingen chatbot — henvendelser utenfor arbeidstid tapes',
        desc: `${skjemaTekst}, men ingen chatbot-widget ble detektert (verken Tidio, Intercom, Crisp, Drift, Tawk eller lignende). Kunder som kontakter dere kl. 19 på en tirsdag får ingen umiddelbar bekreftelse. <strong>I håndverksbransjen velger kunden som regel den som svarer først — og det er sjelden dere.</strong>`,
      }
    }

    case 'ingen_auto_respons': {
      const harSkjemaAuto = w.hasContactForm
      const feltCount = w.formFieldCount
      const skjemaDesc = harSkjemaAuto
        ? `Kontaktskjemaet på ${url} har ${feltCount} felt`
        : `Henvendelsessiden på ${url}`
      return {
        priority: 'hoy',
        title: 'Kontaktskjema uten automatisk bekreftelse',
        desc: `${skjemaDesc} — vi fant ingen automatisk bekreftelse eller «vi svarer innen X»-melding. Kunden vet ikke om henvendelsen gikk gjennom. <strong>Uten bekreftelse antar mange at det ikke virket og ringer neste bedrift.</strong>`,
      }
    }

    case 'ingen_booking_kalender': {
      return {
        priority: 'hoy',
        title: 'Ingen online booking — befaring bookes manuelt',
        desc: `Vi fant ingen booking-kalender på ${url} — verken Calendly, Cal.com, SimplyBook eller lignende. Kunder som er klare til å bestille befaring nå${w.hasContactForm ? ' må sende skjema og vente på svar' : ' har ingen enkel vei videre'}. <strong>Hvert ekstra steg før bekreftet befaring reduserer konverteringen med 20–40 %.</strong>`,
      }
    }

    case 'gratis_befaring_uten_filter': {
      return {
        priority: 'hoy',
        title: '«Gratis befaring» tilbys uten forhåndskvalifisering',
        desc: `Vi fant «Gratis befaring» fremtredende på ${url} — uten spørsmål om jobbtype, omfang, budsjett eller tidsperspektiv. Det betyr at fagfolk reiser til kunder uten at grunnleggende kriterier er avklart på forhånd. <strong>En bom-befaring koster 1,5–2 fagtime + kjøring. Det er en skjult, men stor kostnad.</strong>`,
      }
    }

    case 'ingen_crm_spor': {
      const adsDetektert = w.hasGoogleAdsTag || w.hasMetaPixel
      const adsTekst = adsDetektert
        ? `Vi fant ${w.hasGoogleAdsTag ? 'Google Ads-tag' : ''}${w.hasGoogleAdsTag && w.hasMetaPixel ? ' og ' : ''}${w.hasMetaPixel ? 'Meta Pixel' : ''} på ${url} — men`
        : `Vi sjekket HTML-koden til ${url} for HubSpot, Pipedrive, GHL, ActiveCampaign og lignende, men`
      return {
        priority: 'hoy',
        title: 'Ingen CRM — tilbud følges ikke opp automatisk',
        desc: `${adsTekst} ingen CRM-spor ble detektert. Tilbud sendes ut manuelt, og oppfølging avhenger av at noen husker å ringe. <strong>Kunden henter typisk 3–4 tilbud og bruker dager på å bestemme seg — den som følger opp strukturert vinner.</strong>`,
      }
    }

    case 'ingen_retargeting_pixel': {
      const harAds = w.hasGoogleAdsTag
      return {
        priority: 'middels',
        title: 'Ingen retargeting — interesserte besøkende kan ikke nås igjen',
        desc: `Meta Pixel ble ikke detektert på ${url}${harAds ? ', selv om vi fant Google Ads-tag' : ''}. Folk som besøker siden, ser på tjenestene og lukker fanen — de er borte for alltid. <strong>Disse er allerede halvveis inn. Retargeting-annonser til dem konverterer 3–5× bedre enn kald trafikk.</strong>`,
      }
    }

    case 'ingen_email_automasjon': {
      return {
        priority: 'middels',
        title: 'Ingen e-post-automasjon detektert',
        desc: `Vi fant ingen spor av Mailchimp, Klaviyo, ActiveCampaign, Brevo eller lignende på ${url}. Ingen automatiserte sekvenser for nye henvendelser, oppfølging av tilbud eller reaktivering av gamle kunder. <strong>Manuell oppfølging er inkonsekvent og skalerer ikke når volumet øker.</strong>`,
      }
    }

    case 'utydelig_cta': {
      const ctaTekst = w.ctaText
      if (ctaTekst) {
        return {
          priority: 'middels',
          title: `CTA-teksten «${ctaTekst}» er ikke en tydelig kjøpshandling`,
          desc: `Den mest fremtredende handlingsknappen på ${url} sier «${ctaTekst}». Det er ikke tydelig hva kunden faktisk bestiller eller hva neste steg er. <strong>En klar CTA som «Bestill gratis befaring» eller «Ring oss nå» kan øke konverteringen med 30–50 %.</strong>`,
        }
      }
      return {
        priority: 'middels',
        title: 'Utydelig CTA — kunden vet ikke hva de skal gjøre',
        desc: `Vi fant ingen tydelig handlingsknapp på forsiden til ${url}. Kunden må lete etter hvordan de kommer i kontakt. <strong>Kjøpsbeslutningen tas i løpet av sekunder — hvis det ikke er åpenbart hva neste steg er, forlater kunden siden.</strong>`,
      }
    }

    case 'gmb_finnes_ikke': {
      return {
        priority: 'hoy',
        title: 'Ingen verifisert Google Business Profile',
        desc: `Vi fant ingen verifisert Google-profil for ${b?.navn || 'bedriften'} i ${by}. Det betyr at dere ikke vises i Google Maps eller i de lokale søkeresultatene for «${bransjeNavn} ${by}». <strong>70 % av lokale søk ender med at kunden kontakter en bedrift fra Google-kartet — ikke fra organiske resultater.</strong>`,
      }
    }

    case 'ikke_synlig_topp_10': {
      const soekOrd = r?.soekBransjeBy || `${bransjeNavn} ${by}`
      const soekAkutt = r?.soekBransjeByAkutt || `${bransjeNavn} ${by} akutt`
      return {
        priority: 'hoy',
        title: `Ikke synlig i topp 10 på «${soekOrd}»`,
        desc: `Vi søkte på «${soekOrd}» og «${soekAkutt}» — ${b?.navn || 'bedriften'} dukket ikke opp i topp 10 på noen av søkene. Konkurrentene er der kundene leter akkurat i kjøpsøyeblikket. <strong>Over 90 % av klikkene går til topp 3 resultater.</strong>`,
      }
    }

    case 'topp_4_10': {
      const rangering = r?.rankBransjeBy
      const soekOrd = r?.soekBransjeBy || `${bransjeNavn} ${by}`
      const plassText = rangering ? `#${rangering}` : 'plass 4–10'
      return {
        priority: 'middels',
        title: `Rangert ${plassText} på «${soekOrd}» — topp 3 tar 90 % av klikkene`,
        desc: `Vi søkte på «${soekOrd}» og fant ${b?.navn || 'bedriften'} på ${plassText}. Plass 4–10 får under 10 % av klikkene totalt — topp 3 tar resten. <strong>En forbedring på 2–3 plasser kan doble trafikken fra organisk søk.</strong>`,
      }
    }

    case 'ingen_nettside': {
      return {
        priority: 'hoy',
        title: 'Ingen nettside registrert',
        desc: `Vi fant ingen nettside tilknyttet ${b?.navn || 'bedriften'} — verken i Brønnøysundregistrene eller via Google Places. I dag starter de fleste kjøpsprosesser med et Google-søk. <strong>Uten nettside er dere usynlig for alle kunder som ikke allerede kjenner dere personlig.</strong>`,
      }
    }

    default:
      return null
  }
}

function radStyle(ok: boolean | 'warn'): string {
  if (ok === true) return `background:var(--green-bg);color:var(--green);`
  if (ok === 'warn') return `background:var(--gold-bg);color:#8a6a00;`
  return `background:var(--red-bg);color:var(--red);`
}

function seoRad(label: string, verdi: string | null, ok: boolean | 'warn'): string {
  const farger = ok === true ? 'var(--green-bg);color:var(--green)' : ok === 'warn' ? 'var(--gold-bg);color:#8a6a00' : 'var(--red-bg);color:var(--red)'
  return `
  <div style="display:flex;align-items:flex-start;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--k);gap:16px;">
    <span style="font-size:13px;color:var(--d);flex-shrink:0;">${label}</span>
    <span style="font-size:12px;font-weight:600;text-align:right;background:${fargen(ok)};padding:2px 8px;border-radius:6px;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${verdi || '—'}</span>
  </div>`
}

function fargen(ok: boolean | 'warn'): string {
  if (ok === true) return 'var(--green-bg);color:var(--green)'
  if (ok === 'warn') return 'var(--gold-bg);color:#8a6a00'
  return 'var(--red-bg);color:var(--red)'
}

export function renderRapport(data: AuditResult): string {
  const template = fs.readFileSync(path.join(process.cwd(), 'templates', 'rapport.html'), 'utf-8')
  const b = data.brreg
  const bransjeConfig = data.bransjeKey ? bransjer[data.bransjeKey] : null
  const p = bransjeConfig?.parametre

  const dato = new Date(data.timestamp).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' })
  const ansatte = b?.antallAnsatte || 3
  const snittjobb = p?.snittjobb_kr || 85000
  const snittprosjekt = p?.snittjobb_prosjekt_kr || snittjobb
  const marginPct = p?.margin_prosent || 28
  const henvendelser = Math.round((p?.henvendelser_per_uke_per_ansatt || 1.2) * ansatte)
  const etablertAar = b?.stiftelsesdato ? new Date(b.stiftelsesdato).getFullYear().toString() : 'Ukjent'
  const omsetning = data.regnskap?.sumDriftsInntekter ? kr(data.regnskap.sumDriftsInntekter) + ' kr' : 'Ikke tilgjengelig'

  const introHeading = (() => {
    if (data.score.responsGap.flags.includes('ingen_chatbot') || data.score.responsGap.flags.includes('ingen_auto_respons')) {
      return `Fundamentet er solid. <em>Men pengene lekker der dere ikke ser.</em>`
    }
    if (data.score.synlighet.flags.includes('gmb_finnes_ikke')) {
      return `Dere er gode på det dere gjør. <em>Men kundene finner dere ikke.</em>`
    }
    return `Dere har mye riktig. <em>Men det finnes gap som koster hver uke.</em>`
  })()

  const alleFlagg = [
    ...data.score.responsGap.flags,
    ...data.score.kundereise.flags,
    ...data.score.oppfolging.flags,
  ]

  const prioriterteFlagg = alleFlagg.filter(f => {
    const info = genererFinding(f, data)
    return info !== null
  })
  const visteflagg = prioriterteFlagg.slice(0, 4)

  const fagfolk = Math.min(Math.max(Math.ceil(ansatte * 0.7), 1), 8)
  const henPerUke = Math.round((p?.henvendelser_per_uke_per_ansatt || 1.2) * fagfolk)
  const bomPerUke = Math.round((p?.bom_befaringer_per_uke_per_ansatt || 1) * fagfolk)

  const findingTap: Record<string, number> = {
    ingen_chatbot: data.marginTap.responsGap,
    ingen_auto_respons: data.marginTap.responsGap,
    ingen_booking_kalender: Math.round(data.marginTap.responsGap * 0.3),
    gratis_befaring_uten_filter: data.marginTap.ressurslekkasje,
    ingen_crm_spor: data.marginTap.oppfolgingssvikt,
    ingen_retargeting_pixel: Math.round(data.marginTap.oppfolgingssvikt * 0.5),
    ingen_email_automasjon: Math.round(data.marginTap.oppfolgingssvikt * 0.7),
  }

  const findingTableRows: Record<string, string> = {
    ingen_chatbot: `
      <tr><td>Estimerte henvendelser per uke</td><td>~${henPerUke}</td></tr>
      <tr><td>Andel som kommer utenfor arbeidstid</td><td>~${Math.round((p?.andel_etter_arbeidstid || 0.3) * 100)} %</td></tr>
      <tr><td>Andel tapt til raskere konkurrent</td><td>~${Math.round((p?.andel_tapt_sen_respons || 0.5) * 100)} %</td></tr>
      <tr class="highlight"><td>Estimert årlig tap</td><td>~${krFull(data.marginTap.responsGap)} kr</td></tr>`,
    ingen_auto_respons: `
      <tr><td>Henvendelser per uke</td><td>~${henPerUke}</td></tr>
      <tr><td>Andel etter arbeidstid</td><td>~${Math.round((p?.andel_etter_arbeidstid || 0.3) * 100)} %</td></tr>
      <tr><td>Andel tapt uten umiddelbar bekreftelse</td><td>~${Math.round((p?.andel_tapt_sen_respons || 0.5) * 100)} %</td></tr>
      <tr class="highlight"><td>Estimert årlig tap</td><td>~${krFull(data.marginTap.responsGap)} kr</td></tr>`,
    gratis_befaring_uten_filter: `
      <tr><td>Estimerte bom-befaringer per uke</td><td>~${bomPerUke}</td></tr>
      <tr><td>Snittid per bomtur (inkl. kjøring)</td><td>${p?.timer_per_bom || 1.5} timer</td></tr>
      <tr><td>Fagtimer tapt per år</td><td>~${Math.round(bomPerUke * (p?.timer_per_bom || 1.5) * 48)}</td></tr>
      <tr class="highlight"><td>Estimert årlig kostnad</td><td>~${krFull(data.marginTap.ressurslekkasje)} kr</td></tr>`,
    ingen_crm_spor: `
      <tr><td>CRM-spor detektert i HTML</td><td>ingen</td></tr>
      <tr><td>E-post-automasjon detektert</td><td>${data.website.hasCRMTracking ? data.website.crmType || 'ja' : 'ingen'}</td></tr>
      <tr><td>Typisk tapt i beslutningsvinduet</td><td>${Math.round((p?.andel_tapt_oppfolging || 0.5) * 100)} %</td></tr>
      <tr class="highlight"><td>Estimert årlig tap</td><td>~${krFull(data.marginTap.oppfolgingssvikt)} kr</td></tr>`,
  }

  const findingsHtml = visteflagg.map((flagg, i) => {
    const info = genererFinding(flagg, data)
    if (!info) return ''
    const tap = findingTap[flagg]
    const tapRad = tap && tap > 0 && !findingTableRows[flagg]
      ? `<tr class="hl"><td>Estimert årlig tap</td><td>~${krFull(tap)} kr</td></tr>`
      : ''
    const rawRows = (findingTableRows[flagg] || '').replace(/class="highlight"/g, 'class="hl"')
    const tableRows = rawRows || tapRad
    return `
    <div class="finding-card pri-${info.priority}">
      <div class="finding-meta">
        <span class="finding-num">${String(i + 1).padStart(2, '0')}</span>
        <span class="finding-badge finding-badge-${info.priority}">${info.priority === 'hoy' ? 'Høy prioritet' : 'Middels prioritet'}</span>
      </div>
      <div class="finding-title">${info.title}</div>
      <div class="finding-desc">${info.desc}</div>
      ${tableRows ? `<table class="finding-table">${tableRows}</table>` : ''}
    </div>`
  }).join('\n')

  // GMB finding
  let gmbFindingHtml = ''
  const synlighetFlagg = data.score.synlighet.flags
  if (synlighetFlagg.some(f => ['gmb_finnes_ikke', 'ikke_synlig_topp_10', 'topp_4_10'].includes(f))) {
    const g = data.gmb
    const hovestFlagg = synlighetFlagg.find(f => ['gmb_finnes_ikke', 'ikke_synlig_topp_10', 'topp_4_10'].includes(f)) || 'gmb_finnes_ikke'
    const gmbInfo = genererFinding(hovestFlagg, data)
    const isPriHoy = hovestFlagg === 'gmb_finnes_ikke' || hovestFlagg === 'ikke_synlig_topp_10'
    const obsNr = visteflagg.length + 1

    if (gmbInfo) {
      gmbFindingHtml = `
    <div class="finding-card pri-${isPriHoy ? 'hoy' : 'middels'}">
      <div class="finding-meta">
        <span class="finding-num">${String(obsNr).padStart(2, '0')}</span>
        <span class="finding-badge finding-badge-${isPriHoy ? 'hoy' : 'middels'}">${isPriHoy ? 'Høy prioritet' : 'Middels prioritet'}</span>
      </div>
      <div class="finding-title">${gmbInfo.title}</div>
      <div class="finding-desc">${gmbInfo.desc}</div>
      <table class="finding-table">
        <tr><td>Google Business Profile</td><td>${g?.found ? `Funnet — ${g.name}` : 'Ikke funnet / ikke verifisert'}</td></tr>
        ${g?.found && g.rating ? `<tr><td>Google-rating</td><td>${g.rating} ★ (${g.reviewCount} anm.)</td></tr>` : ''}
        ${g?.found && !g.hasOpeningHours ? `<tr><td>Åpningstider i GMB</td><td>Ikke registrert</td></tr>` : ''}
        ${data.orgRank?.rankBransjeBy ? `<tr><td>Rangering «${data.orgRank.soekBransjeBy}»</td><td>#${data.orgRank.rankBransjeBy}</td></tr>` : data.orgRank?.soekBransjeBy ? `<tr><td>Rangering «${data.orgRank.soekBransjeBy}»</td><td>ikke i topp 10</td></tr>` : ''}
        ${data.orgRank?.rankBransjeByAkutt ? `<tr><td>Rangering «${data.orgRank.soekBransjeByAkutt}»</td><td>#${data.orgRank.rankBransjeByAkutt}</td></tr>` : data.orgRank?.soekBransjeByAkutt ? `<tr><td>Rangering «${data.orgRank.soekBransjeByAkutt}»</td><td>ikke i topp 10</td></tr>` : ''}
      </table>
    </div>`
    }
  }

  // ── SEO + KONKURRENTER ──────────────────────────────────────

  const by = b?.forretningsadresse?.poststed || ''
  const r = data.orgRank

  // Organisk rangering
  const rangeringHtml = (() => {
    if (!r) return `<div style="padding:16px 20px;font-size:13px;color:var(--d);">Ingen søkedata tilgjengelig</div>`
    const bedriftRad = (soek: string | null, rang: number | null) => {
      if (!soek) return ''
      const etikettStyle = rang
        ? (rang <= 3 ? `background:var(--green-bg);color:var(--green)` : `background:var(--gold-bg);color:#8a6a00`)
        : `background:var(--red-bg);color:var(--red)`
      const rangTekst = rang ? `#${rang}` : 'Ikke i topp 10'
      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 20px;border-bottom:1px solid var(--k);font-size:13px;">
        <span style="color:var(--s);font-weight:500;">«${soek}»</span>
        <span style="font-family:'Syne Mono',monospace;font-size:12px;font-weight:700;padding:2px 10px;border-radius:20px;${etikettStyle}">${rangTekst}</span>
      </div>`
    }
    const konkurRader = r.toppKonkurrenter.length > 0
      ? r.toppKonkurrenter.map(k => `<div style="display:flex;align-items:center;justify-content:space-between;padding:9px 20px;border-bottom:1px solid var(--ks);font-size:12px;">
          <span style="color:var(--d);">#${k.posisjon} ${k.url}</span>
          <span style="font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;background:var(--m);color:var(--d);padding:2px 8px;border-radius:20px;">konkurrent</span>
        </div>`).join('')
      : `<div style="padding:10px 20px;font-size:12px;color:var(--d);">Ingen konkurrentdata</div>`
    return bedriftRad(r.soekBransjeBy, r.rankBransjeBy)
      + bedriftRad(r.soekBransjeByAkutt, r.rankBransjeByAkutt)
      + (r.toppKonkurrenter.length > 0 ? `<div style="padding:8px 20px 4px;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--d);">Topp konkurrenter</div>` : '')
      + konkurRader
  })()

  // Annonsører
  const annonserHtml = (() => {
    if (!r) return `<div style="padding:16px 20px;font-size:13px;color:var(--d);">Ingen annonsedata</div>`
    const bedriftKjorer = data.website.hasGoogleAdsTag
    const bedriftRad = `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 20px;border-bottom:1px solid var(--k);font-size:13px;">
      <span style="color:var(--s);font-weight:500;">${b?.navn || 'Bedriften'}</span>
      <span style="font-size:11px;font-weight:700;padding:2px 10px;border-radius:20px;${bedriftKjorer ? 'background:var(--green-bg);color:var(--green)' : 'background:var(--red-bg);color:var(--red)'};">${bedriftKjorer ? 'Tag detektert' : 'Ingen ads-tag'}</span>
    </div>`
    const konkRader = r.annonsoerer.length > 0
      ? r.annonsoerer.map(a => `<div style="display:flex;align-items:center;justify-content:space-between;padding:9px 20px;border-bottom:1px solid var(--ks);font-size:12px;">
          <span style="color:var(--d);">${a}</span>
          <span style="font-size:10px;font-weight:700;background:var(--gold-bg);color:#8a6a00;padding:2px 8px;border-radius:20px;">annonserer nå</span>
        </div>`).join('')
      : `<div style="padding:10px 20px;font-size:12px;color:var(--d);">Ingen konkurrenter kjører ads på dette søkordet</div>`
    return bedriftRad
      + (r.annonsoerer.length > 0 ? `<div style="padding:8px 20px 4px;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--d);">Aktive annonsører</div>` : '')
      + konkRader
  })()

  // SEO-signaler
  const w2 = data.website
  const seoSignalerHtml = (() => {
    const rader: string[] = []
    const seoRad2 = (label: string, verdi: string | null | boolean, ok: boolean | 'warn') => {
      const clr = ok === true ? 'var(--green-bg);color:var(--green)' : ok === 'warn' ? 'var(--gold-bg);color:#8a6a00' : 'var(--red-bg);color:var(--red)'
      const vis = typeof verdi === 'boolean' ? (verdi ? 'Ja' : 'Nei') : (verdi || '—')
      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--k);gap:12px;">
        <span style="font-size:13px;color:var(--d);">${label}</span>
        <span style="font-size:12px;font-weight:600;background:${clr};padding:2px 10px;border-radius:6px;max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex-shrink:0;">${vis}</span>
      </div>`
    }
    rader.push(seoRad2('Meta-tittel', w2.metaTitle, !!w2.metaTitle))
    rader.push(seoRad2('Meta-beskrivelse', w2.metaDescription, !!w2.metaDescription))
    rader.push(seoRad2('H1-overskrift', w2.h1Text || (w2.hasH1 ? 'Funnet' : null), w2.hasH1))
    rader.push(seoRad2('Strukturert data (Schema.org)', w2.hasStructuredData, w2.hasStructuredData))
    rader.push(seoRad2('SSL / HTTPS', w2.hasSSL, w2.hasSSL))
    rader.push(seoRad2('Google Analytics', w2.hasGoogleAnalytics, w2.hasGoogleAnalytics ? true : 'warn'))
    if (data.pagespeed?.loadTimeSeconds) {
      const lt = data.pagespeed.loadTimeSeconds
      rader.push(seoRad2('Lastetid', `${lt.toFixed(1)} sek`, lt < 2.5 ? true : lt < 4 ? 'warn' : false))
    }
    rader.push(seoRad2('Mobilvennlig (PageSpeed)', data.pagespeed?.isMobileFriendly ?? false, data.pagespeed?.isMobileFriendly ?? false))
    return rader.join('\n')
  })()

  // Søkeordforslag
  const soekeordHtml = (() => {
    const soekeord: any[] = bransjeConfig?.soekeord || []
    if (soekeord.length === 0) return `<div style="font-size:13px;color:rgba(250,250,247,.4);">Ingen søkeorddata for denne bransjen</div>`
    const intentFarge: Record<string, string> = {
      transaksjon: 'background:rgba(212,66,14,.2);color:var(--red-t)',
      akutt: 'background:rgba(212,66,14,.3);color:var(--red-t)',
      kommersiell: 'background:rgba(196,154,26,.15);color:var(--gold-t)',
      informasjon: 'background:rgba(250,250,247,.08);color:rgba(250,250,247,.45)',
    }
    return `<div style="display:flex;flex-wrap:wrap;gap:8px;">` +
      soekeord.map((s: any) => {
        const ord = s.ord.replace('[by]', by)
        const farge = intentFarge[s.intent] || intentFarge.informasjon
        return `<div style="display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border-radius:10px;background:rgba(250,250,247,.05);border:1px solid rgba(250,250,247,.1);">
          <span style="font-size:13px;color:rgba(250,250,247,.8);font-weight:500;">${ord}</span>
          <span style="font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:2px 8px;border-radius:20px;${farge}">${s.intent}</span>
        </div>`
      }).join('') + `</div>`
  })()

  // ── STYRKER ─────────────────────────────────────────────────

  const checkSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`

  const styrkerHtml = data.styrker.length > 0
    ? data.styrker.map(s => `
    <div class="styrke-rad">
      <div class="styrke-ikon">${checkSvg}</div>
      <div class="styrke-tekst">${s}</div>
    </div>`).join('\n')
    : `<div class="styrke-rad"><div class="styrke-ikon">${checkSvg}</div><div class="styrke-tekst">Ingen klare styrker identifisert ennå — potensial for forbedring på alle fronter.</div></div>`

  // scoreData for JS chips and score bars
  const w = data.website
  const scoreDataJs = `Object.assign(scoreData, ${JSON.stringify({
    rg: data.score.responsGap.pct,
    kj: data.score.kundereise.pct,
    op: data.score.oppfolging.pct,
    syn: data.score.synlighet.pct,
    hasSSL: w.hasSSL,
    hasChatbot: w.hasChatbot,
    chatbotType: w.chatbotType,
    hasBooking: w.hasBookingCalendar,
    bookingType: w.bookingType,
    hasForm: w.hasContactForm,
    formFields: w.formFieldCount,
    hasPhone: w.hasClickablePhone,
    hasCTA: w.hasClearCTA,
    ctaText: w.ctaText,
    hasMetaPixel: w.hasMetaPixel,
    hasGoogleAds: w.hasGoogleAdsTag,
    hasGA: w.hasGoogleAnalytics,
    hasCRM: w.hasCRMTracking,
    crmType: w.crmType,
    hasNewsletter: w.hasNewsletterSignup,
    hasAutoResp: w.hasAutoResponse,
    hasGratisBefaring: w.hasGratisBefaringUtenFilter,
    gmbFound: data.gmb?.found ?? false,
    gmbRating: data.gmb?.rating ?? null,
    gmbReviews: data.gmb?.reviewCount ?? null,
    orgRankBransje: data.orgRank?.rankBransjeBy ?? null,
    orgRankBransjeAkutt: data.orgRank?.rankBransjeByAkutt ?? null,
    soekBransjeBy: data.orgRank?.soekBransjeBy ?? null,
    soekBransjeByAkutt: data.orgRank?.soekBransjeByAkutt ?? null,
  })});`

  const pakkerPriser: Record<string, number> = { Intro: 5990, Start: 16000, Drift: 25000, Vekst: 35000 }
  const pakkeKost = pakkerPriser[data.anbefaltPakke] || 25000

  return template
    .replace('// SCORE_DATA_PLACEHOLDER', scoreDataJs)
    .replace(/{{RANGERING_HTML}}/g, rangeringHtml)
    .replace(/{{ANNONSER_HTML}}/g, annonserHtml)
    .replace(/{{SEO_SIGNALER_HTML}}/g, seoSignalerHtml)
    .replace(/{{SOEKEORD_HTML}}/g, soekeordHtml)
    .replace(/{{BEDRIFT_NAVN}}/g, b?.navn || 'Ukjent bedrift')
    .replace(/{{ORGNR_FORMATERT}}/g, data.orgnr.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3'))
    .replace(/{{BRANSJE_NAVN}}/g, data.bransjeNavn || 'Ukjent bransje')
    .replace(/{{BY}}/g, b?.forretningsadresse?.poststed || 'Ukjent')
    .replace(/{{ANSATTE}}/g, String(ansatte))
    .replace(/{{ANSATTE_RAW}}/g, String(ansatte))
    .replace(/{{ETABLERT_AAR}}/g, etablertAar)
    .replace(/{{RAPPORT_DATO}}/g, dato)
    .replace(/{{OMSETNING_FORMATERT}}/g, omsetning)
    .replace(/{{SNITTPROSJEKT_KR_FORMATERT}}/g, krFull(snittprosjekt) + ' kr')
    .replace(/{{LEKKASJE_TOTAL_FORMATERT}}/g, krFull(data.marginTap.total) + ' kr')
    .replace(/{{SEEK_SCORE}}/g, String(data.score.total))
    .replace(/{{SCORE_LABEL}}/g, data.score.label)
    .replace(/{{INTRO_HEADING}}/g, introHeading)
    .replace(/{{AAPNINGSREPLIKK}}/g, data.aapningsreplikk)
    .replace(/{{FINDINGS_HTML}}/g, findingsHtml)
    .replace(/{{GMB_FINDING_HTML}}/g, gmbFindingHtml)
    .replace(/{{STYRKER_HTML}}/g, styrkerHtml)
    .replace(/{{SNITTJOBB_KR}}/g, String(snittjobb))
    .replace(/{{HENVENDELSER_ESTIMERT}}/g, String(henvendelser))
    .replace(/{{MARGIN_PCT}}/g, String(marginPct))
    .replace(/{{ANBEFALT_PAKKE}}/g, data.anbefaltPakke)
    .replace(/{{ANBEFALT_PAKKE_PRIS}}/g, krFull(pakkeKost))
    .replace(/{{ANBEFALT_PAKKE_PRIS_RAW}}/g, String(pakkeKost))
    .replace(/{{BREAK_EVEN_JOBBER}}/g, String(data.breakEvenJobber))
}
