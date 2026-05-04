import fs from 'fs'
import path from 'path'
import { AuditResult, Review, KonkurrentGmb } from '../types'

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
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

function stjerner(rating: number | null): string {
  if (!rating) return '<span style="color:var(--d);">—</span>'
  const full = Math.round(rating)
  return `<span style="color:var(--gold);">${'★'.repeat(Math.min(full, 5))}${'☆'.repeat(Math.max(0, 5 - full))}</span> <span style="font-family:\'Syne Mono\',monospace;font-size:11px;">${rating.toFixed(1)}</span>`
}

interface FindingInfo { title: string; desc: string; priority: 'hoy' | 'middels' }

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
      const skjemaTekst = w.hasContactForm ? `Vi fant kontaktskjema på ${url} med ${w.formFieldCount} felt` : `Vi fant ikke noe kontaktskjema på ${url}`
      return { priority: 'hoy', title: 'Ingen chatbot — henvendelser utenfor arbeidstid tapes', desc: `${skjemaTekst}, men ingen chatbot-widget ble detektert (verken Tidio, Intercom, Crisp, Drift, Tawk eller lignende). Kunder som kontakter dere kl. 19 på en tirsdag får ingen umiddelbar bekreftelse. <strong>I håndverksbransjen velger kunden som regel den som svarer først — og det er sjelden dere.</strong>` }
    }
    case 'ingen_auto_respons': {
      const skjemaDesc = w.hasContactForm ? `Kontaktskjemaet på ${url} har ${w.formFieldCount} felt` : `Henvendelsessiden på ${url}`
      return { priority: 'hoy', title: 'Kontaktskjema uten automatisk bekreftelse', desc: `${skjemaDesc} — vi fant ingen automatisk bekreftelse eller «vi svarer innen X»-melding. Kunden vet ikke om henvendelsen gikk gjennom. <strong>Uten bekreftelse antar mange at det ikke virket og ringer neste bedrift.</strong>` }
    }
    case 'ingen_booking_kalender':
      return { priority: 'hoy', title: 'Ingen online booking — befaring bookes manuelt', desc: `Vi fant ingen booking-kalender på ${url} — verken Calendly, Cal.com, SimplyBook eller lignende. Kunder som er klare til å bestille befaring nå${w.hasContactForm ? ' må sende skjema og vente på svar' : ' har ingen enkel vei videre'}. <strong>Hvert ekstra steg før bekreftet befaring reduserer konverteringen med 20–40 %.</strong>` }
    case 'gratis_befaring_uten_filter':
      return { priority: 'hoy', title: '«Gratis befaring» tilbys uten forhåndskvalifisering', desc: `Vi fant «Gratis befaring» fremtredende på ${url} — uten spørsmål om jobbtype, omfang, budsjett eller tidsperspektiv. Fagfolk reiser til kunder uten at grunnleggende kriterier er avklart. <strong>En bom-befaring koster 1,5–2 fagtime + kjøring. Det er en skjult, men stor kostnad.</strong>` }
    case 'ingen_crm_spor': {
      const adsTekst = (w.hasGoogleAdsTag || w.hasMetaPixel)
        ? `Vi fant ${w.hasGoogleAdsTag ? 'Google Ads-tag' : ''}${w.hasGoogleAdsTag && w.hasMetaPixel ? ' og ' : ''}${w.hasMetaPixel ? 'Meta Pixel' : ''} på ${url} — men`
        : `Vi sjekket HTML-koden til ${url} for HubSpot, Pipedrive, GHL, ActiveCampaign og lignende, men`
      return { priority: 'hoy', title: 'Ingen CRM — tilbud følges ikke opp automatisk', desc: `${adsTekst} ingen CRM-spor ble detektert. Tilbud sendes ut manuelt, og oppfølging avhenger av at noen husker å ringe. <strong>Kunden henter typisk 3–4 tilbud og bruker dager på å bestemme seg — den som følger opp strukturert vinner.</strong>` }
    }
    case 'ingen_retargeting_pixel':
      return { priority: 'middels', title: 'Ingen retargeting — interesserte besøkende kan ikke nås igjen', desc: `Meta Pixel ble ikke detektert på ${url}${w.hasGoogleAdsTag ? ', selv om vi fant Google Ads-tag' : ''}. Folk som besøker siden og lukker fanen — de er borte for alltid. <strong>Disse er allerede halvveis inn. Retargeting-annonser til dem konverterer 3–5× bedre enn kald trafikk.</strong>` }
    case 'ingen_email_automasjon':
      return { priority: 'middels', title: 'Ingen e-post-automasjon detektert', desc: `Vi fant ingen spor av Mailchimp, ActiveCampaign, Brevo eller lignende på ${url}. Ingen automatiserte sekvenser for nye henvendelser, oppfølging av tilbud eller reaktivering av gamle kunder. <strong>Manuell oppfølging er inkonsekvent og skalerer ikke når volumet øker.</strong>` }
    case 'utydelig_cta': {
      if (w.ctaText) return { priority: 'middels', title: `CTA-teksten «${w.ctaText}» er ikke en tydelig kjøpshandling`, desc: `Den mest fremtredende handlingsknappen på ${url} sier «${w.ctaText}». Det er ikke tydelig hva kunden faktisk bestiller. <strong>En klar CTA som «Bestill gratis befaring» eller «Ring oss nå» kan øke konverteringen med 30–50 %.</strong>` }
      return { priority: 'middels', title: 'Utydelig CTA — kunden vet ikke hva de skal gjøre', desc: `Vi fant ingen tydelig handlingsknapp på forsiden til ${url}. Kunden må lete etter hvordan de kommer i kontakt. <strong>Kjøpsbeslutningen tas i løpet av sekunder — hvis det ikke er åpenbart hva neste steg er, forlater kunden siden.</strong>` }
    }
    case 'gmb_finnes_ikke':
      return { priority: 'hoy', title: 'Ingen verifisert Google Business Profile', desc: `Vi fant ingen verifisert Google-profil for ${b?.navn || 'bedriften'} i ${by}. Det betyr at dere ikke vises i Google Maps eller i de lokale søkeresultatene for «${bransjeNavn} ${by}». <strong>70 % av lokale søk ender med at kunden kontakter en bedrift fra Google-kartet — ikke fra organiske resultater.</strong>` }
    case 'ikke_synlig_topp_10': {
      const soekOrd = r?.soekBransjeBy || `${bransjeNavn} ${by}`
      const soekAkutt = r?.soekBransjeByAkutt || `${bransjeNavn} ${by} akutt`
      return { priority: 'hoy', title: `Ikke synlig i topp 10 på «${soekOrd}»`, desc: `Vi søkte på «${soekOrd}» og «${soekAkutt}» — ${b?.navn || 'bedriften'} dukket ikke opp i topp 10 på noen av søkene. Konkurrentene er der kundene leter akkurat i kjøpsøyeblikket. <strong>Over 90 % av klikkene går til topp 3 resultater.</strong>` }
    }
    case 'topp_4_10': {
      const rangering = r?.rankBransjeBy
      const soekOrd = r?.soekBransjeBy || `${bransjeNavn} ${by}`
      const plassText = rangering ? `#${rangering}` : 'plass 4–10'
      return { priority: 'middels', title: `Rangert ${plassText} på «${soekOrd}» — topp 3 tar 90 % av klikkene`, desc: `Vi søkte på «${soekOrd}» og fant ${b?.navn || 'bedriften'} på ${plassText}. Plass 4–10 får under 10 % av klikkene totalt. <strong>En forbedring på 2–3 plasser kan doble trafikken fra organisk søk.</strong>` }
    }
    case 'ingen_nettside':
      return { priority: 'hoy', title: 'Ingen nettside registrert', desc: `Vi fant ingen nettside tilknyttet ${b?.navn || 'bedriften'}. I dag starter de fleste kjøpsprosesser med et Google-søk. <strong>Uten nettside er dere usynlig for alle kunder som ikke allerede kjenner dere personlig.</strong>` }
    default: return null
  }
}

// ── NYE RENDER-FUNKSJONER ────────────────────────────────────────

function renderHistorikkOmsetning(data: AuditResult): string {
  const historikk = data.regnskap?.historikk
  if (!historikk || historikk.length < 2) return ''

  const max = Math.max(...historikk.map(h => h.omsetning))
  const bars = historikk.map((h, i) => {
    const pct = Math.round((h.omsetning / max) * 100)
    const vekst = i > 0 ? ((h.omsetning - historikk[i - 1].omsetning) / historikk[i - 1].omsetning * 100) : 0
    const pilFarge = vekst > 0 ? 'var(--green)' : 'var(--red)'
    const pil = i > 0 ? (vekst > 0 ? '↑' : '↓') : ''
    return `<div style="display:flex;flex-direction:column;align-items:center;gap:5px;flex:1;">
      <div style="font-size:10px;color:var(--d);font-family:'Syne Mono',monospace;">${kr(h.omsetning)}</div>
      <div style="width:100%;height:${Math.max(8, Math.round(pct * 0.5))}px;background:var(--s);border-radius:3px 3px 0 0;"></div>
      <div style="font-size:10px;font-weight:700;color:${i > 0 ? pilFarge : 'var(--d)'};">${h.aar}${pil ? ' ' + pil : ''}</div>
    </div>`
  }).join('')

  const siste = historikk[historikk.length - 1]
  const forste = historikk[0]
  const totalVekst = forste.omsetning > 0 ? Math.round(((siste.omsetning - forste.omsetning) / forste.omsetning) * 100) : 0
  const vekstFarge = totalVekst > 0 ? 'var(--green)' : totalVekst < 0 ? 'var(--red)' : 'var(--d)'
  const vekstTekst = totalVekst > 0 ? `+${totalVekst}% vekst` : totalVekst < 0 ? `${totalVekst}% nedgang` : 'stabil'

  return `<div style="background:white;border:1px solid var(--k);border-radius:12px;padding:18px 22px;margin-top:16px;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
      <div style="font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--d);">Omsetningstrend (Regnskapsregisteret)</div>
      <div style="font-size:12px;font-weight:700;color:${vekstFarge};">${vekstTekst} (${forste.aar}–${siste.aar})</div>
    </div>
    <div style="display:flex;align-items:flex-end;gap:8px;height:70px;">${bars}</div>
  </div>`
}

function renderKonkurrentTabell(data: AuditResult): string {
  const konkurrenter: KonkurrentGmb[] = data.konkurrentGmb ?? []
  const b = data.brreg
  const gmbTarget = data.gmb

  const targetRow = `<tr style="background:rgba(196,154,26,.07);">
    <td style="padding:10px 16px;font-weight:700;color:var(--s);border-left:3px solid var(--gold);">
      ${b?.navn || 'Bedriften'}
      <span style="margin-left:8px;font-size:10px;background:var(--gold-bg);color:#8a6a00;padding:1px 7px;border-radius:10px;font-weight:700;vertical-align:middle;">DIN BEDRIFT</span>
    </td>
    <td style="padding:10px 16px;">${stjerner(gmbTarget?.rating ?? null)}</td>
    <td style="padding:10px 16px;font-family:'Syne Mono',monospace;font-size:12px;">${gmbTarget?.found ? (gmbTarget.reviewCount !== null ? gmbTarget.reviewCount : '—') : '<span style="color:var(--red);font-size:12px;">ingen GMB</span>'}</td>
    <td style="padding:10px 16px;">${gmbTarget?.found ? '<span style="color:var(--green);font-weight:700;">✓ Verifisert</span>' : '<span style="color:var(--red);font-weight:700;">✗ Mangler</span>'}</td>
  </tr>`

  const konkRows = konkurrenter.map(k => `<tr>
    <td style="padding:10px 16px;font-size:13px;color:var(--d);">${k.tittel.slice(0, 45)}<br><span style="font-size:10px;font-family:'Syne Mono',monospace;color:rgba(13,13,11,.3);">${k.domene} · #${k.posisjon}</span></td>
    <td style="padding:10px 16px;">${stjerner(k.rating)}</td>
    <td style="padding:10px 16px;font-family:'Syne Mono',monospace;font-size:12px;color:var(--d);">${k.reviewCount ?? '—'}</td>
    <td style="padding:10px 16px;font-size:12px;">${k.hasWebsite ? '<span style="color:var(--green);">✓</span>' : '<span style="color:var(--d);">—</span>'}</td>
  </tr>`).join('')

  return `<div style="background:white;border:1px solid var(--k);border-radius:12px;overflow:hidden;margin-bottom:28px;">
    <div style="padding:14px 18px;background:var(--s);display:flex;align-items:center;justify-content:space-between;">
      <span style="font-size:12px;font-weight:700;color:var(--h);letter-spacing:.08em;text-transform:uppercase;">Konkurrentsammenligning</span>
      <span style="font-family:'Syne Mono',monospace;font-size:11px;color:rgba(250,250,247,.4);">Google Places · live data</span>
    </div>
    <table style="width:100%;border-collapse:collapse;">
      <thead><tr style="background:var(--l);">
        <th style="padding:9px 16px;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--d);text-align:left;border-bottom:1px solid var(--k);">Bedrift</th>
        <th style="padding:9px 16px;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--d);text-align:left;border-bottom:1px solid var(--k);">Rating</th>
        <th style="padding:9px 16px;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--d);text-align:left;border-bottom:1px solid var(--k);">Anmeldelser</th>
        <th style="padding:9px 16px;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--d);text-align:left;border-bottom:1px solid var(--k);">GMB</th>
      </tr></thead>
      <tbody style="font-size:13px;">${targetRow}${konkRows}</tbody>
    </table>
    ${konkurrenter.length === 0 ? '<div style="padding:12px 18px;font-size:12px;color:var(--d);">Ingen konkurrentdata — SerpAPI-nøkkel nødvendig</div>' : ''}
  </div>`
}

function renderAnmeldelser(data: AuditResult): string {
  const reviews: Review[] = data.gmb?.reviews ?? []
  if (reviews.length === 0 || !data.gmb?.found) return ''

  const kortCards = reviews.slice(0, 3).map(rv => {
    const stjernePil = '★'.repeat(Math.min(Math.round(rv.rating), 5)) + '☆'.repeat(Math.max(0, 5 - Math.round(rv.rating)))
    const varselFarge = rv.rating <= 2 ? 'var(--red-bg);border-color:rgba(212,66,14,.25)' : rv.rating <= 3 ? 'var(--gold-bg);border-color:rgba(196,154,26,.3)' : 'var(--l);border-color:var(--k)'
    return `<div style="background:${varselFarge};border:1px solid;border-radius:10px;padding:14px 16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <span style="font-size:12px;font-weight:700;color:var(--s);">${rv.author}</span>
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="color:var(--gold);font-size:11px;">${stjernePil}</span>
          <span style="font-size:10px;color:var(--d);font-family:'Syne Mono',monospace;">${rv.relativeTime || ''}</span>
        </div>
      </div>
      <p style="font-size:12px;color:var(--d);line-height:1.6;margin:0;">${rv.text ? rv.text.slice(0, 180) + (rv.text.length > 180 ? '…' : '') : '(Ingen tekst)'}</p>
    </div>`
  }).join('')

  const lavRating = reviews.filter(r => r.rating <= 3)
  const lavRatingHtml = lavRating.length > 0
    ? `<div style="margin-top:10px;padding:10px 14px;background:var(--red-bg);border-radius:8px;border:1px solid rgba(212,66,14,.2);font-size:12px;font-weight:700;color:var(--red);">⚠ ${lavRating.length} av siste ${reviews.length} anmeldelser er 3 stjerner eller lavere</div>`
    : ''

  const svarerHtml = data.gmb.svarer
    ? `<span style="font-size:11px;background:var(--green-bg);color:var(--green);padding:2px 10px;border-radius:20px;font-weight:700;">Svarer på anmeldelser ✓</span>`
    : `<span style="font-size:11px;background:var(--red-bg);color:var(--red);padding:2px 10px;border-radius:20px;font-weight:700;">Svarer ikke på anmeldelser</span>`

  return `<div style="margin-bottom:28px;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
      <div style="font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--d);">Siste Google-anmeldelser</div>
      ${svarerHtml}
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">${kortCards}</div>
    ${lavRatingHtml}
  </div>`
}

function renderInnvendinger(data: AuditResult): string {
  const b = data.brreg
  const navn = b?.navn || 'bedriften'
  const alleFlagg = [...data.score.responsGap.flags, ...data.score.kundereise.flags, ...data.score.oppfolging.flags, ...data.score.synlighet.flags]

  const innvendinger: Array<{ innvending: string; svar: string; replikk: string }> = []

  innvendinger.push({
    innvending: '"Vi har det bra som det er"',
    svar: 'Anerkjenn styrker, vis konkurrenttabellen',
    replikk: `Det ser jeg — ${data.styrker[0] || 'dere er aktive'}. Men ser du at ${data.orgRank?.toppKonkurrenter[0]?.tittel?.split(' - ')[0] || 'konkurrenten din'} ${data.orgRank?.toppKonkurrenter[0]?.posisjon === 1 ? 'rangerer #1' : 'er foran deg'} på søkene dine akkurat nå? Det er ikke kritikk — det er en mulighet mens de ennå ikke er på SEEK.`,
  })

  if (alleFlagg.includes('ingen_chatbot') || alleFlagg.includes('ingen_auto_respons')) {
    innvendinger.push({
      innvending: '"Vi svarer alle henvendelser manuelt"',
      svar: 'Godta det — sett det i kroner',
      replikk: `Bra. Og søndag kveld kl 21 — hvem svarer da? Med ~${Math.round((data.brreg?.antallAnsatte || 3) * 1.4)} henvendelser per uke og ${Math.round(30 * 100) / 100}% utenfor arbeidstid, er det mellom ${Math.round(data.brreg?.antallAnsatte || 3) * 2}–${Math.round(data.brreg?.antallAnsatte || 3) * 4} potensielle jobber i uka som hører stillhet. Hva er det verdt i kroner?`,
    })
  }

  innvendinger.push({
    innvending: '"Det er for dyrt"',
    svar: 'Bruk break-even — én jobb',
    replikk: `Forstår det. SEEK ${data.anbefaltPakke} er ${data.breakEvenJobber === 1 ? 'én ekstra jobb' : data.breakEvenJobber + ' ekstra jobber'} i måneden å tjene inn. Av de henvendelsene som faller bort utenfor arbeidstid — er det urealistisk at én av dem i måneden hadde blitt en jobb med automatisk respons innen 30 sekunder?`,
  })

  if (alleFlagg.includes('ingen_crm_spor')) {
    innvendinger.push({
      innvending: '"Vi følger opp tilbud selv"',
      svar: 'Bygg på det — vis gapet',
      replikk: `Det er bra — og det fungerer sikkert for de tilbudene dere husker. Men hva med tilbud #3 og #4 på mandagen etter en travel uke? Strukturert oppfølging over 3 uker dobler lukkingsraten for tilbud som ellers kjølner.`,
    })
  }

  const kortKort = innvendinger.slice(0, 3).map((inn, i) => `
    <div style="background:white;border:1px solid var(--k);border-radius:12px;overflow:hidden;">
      <div style="padding:14px 18px 10px;border-bottom:1px solid var(--k);background:var(--l);">
        <div style="font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--d);margin-bottom:6px;">Innvending ${i + 1}</div>
        <div style="font-size:16px;font-weight:700;color:var(--s);font-family:'Instrument Serif',serif;font-style:italic;">${inn.innvending}</div>
      </div>
      <div style="padding:14px 18px;">
        <div style="font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--gold);margin-bottom:8px;">${inn.svar}</div>
        <div style="font-size:13px;color:var(--d);line-height:1.65;border-left:3px solid var(--gold-bg);padding-left:12px;">"${inn.replikk}"</div>
      </div>
    </div>`).join('')

  return `<div class="sek alt">
    <div class="sek-tag">05 — Innvendingshåndtering</div>
    <h2>Når kunden sier nei<br><em>— slik svarer du</em></h2>
    <p class="sek-lead">Skreddersydd for ${navn} basert på de svakhetene vi fant. Bruk disse replikkene direkte i samtalen.</p>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;">${kortKort}</div>
  </div>`
}

function radStyle(ok: boolean | 'warn'): string {
  if (ok === true) return `background:var(--green-bg);color:var(--green);`
  if (ok === 'warn') return `background:var(--gold-bg);color:#8a6a00;`
  return `background:var(--red-bg);color:var(--red);`
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
  const ansatte = b?.antallAnsatte || 1
  const snittjobb = p?.snittjobb_kr || 85000
  const snittprosjekt = p?.snittjobb_prosjekt_kr || snittjobb
  const marginPct = p?.margin_prosent || 28
  const henvendelser = Math.round((p?.henvendelser_per_uke_per_ansatt || 1.2) * ansatte)
  const etablertAar = b?.stiftelsesdato ? new Date(b.stiftelsesdato).getFullYear().toString() : 'Ukjent'
  const omsetning = data.regnskap?.sumDriftsInntekter ? kr(data.regnskap.sumDriftsInntekter) + ' kr' : 'Ikke tilgjengelig'

  const introHeading = (() => {
    if (data.score.responsGap.flags.includes('ingen_chatbot') || data.score.responsGap.flags.includes('ingen_auto_respons'))
      return `Fundamentet er solid. <em>Men pengene lekker der dere ikke ser.</em>`
    if (data.score.synlighet.flags.includes('gmb_finnes_ikke'))
      return `Dere er gode på det dere gjør. <em>Men kundene finner dere ikke.</em>`
    return `Dere har mye riktig. <em>Men det finnes gap som koster hver uke.</em>`
  })()

  const alleFlagg = [...data.score.responsGap.flags, ...data.score.kundereise.flags, ...data.score.oppfolging.flags]
  const visteflagg = alleFlagg.filter(f => genererFinding(f, data) !== null).slice(0, 4)

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
    ingen_chatbot: `<tr><td>Estimerte henvendelser per uke</td><td>~${henPerUke}</td></tr><tr><td>Andel som kommer utenfor arbeidstid</td><td>~${Math.round((p?.andel_etter_arbeidstid || 0.3) * 100)} %</td></tr><tr><td>Andel tapt til raskere konkurrent</td><td>~${Math.round((p?.andel_tapt_sen_respons || 0.5) * 100)} %</td></tr><tr class="highlight"><td>Estimert årlig tap</td><td>~${krFull(data.marginTap.responsGap)} kr</td></tr>`,
    ingen_auto_respons: `<tr><td>Henvendelser per uke</td><td>~${henPerUke}</td></tr><tr><td>Andel etter arbeidstid</td><td>~${Math.round((p?.andel_etter_arbeidstid || 0.3) * 100)} %</td></tr><tr><td>Andel tapt uten umiddelbar bekreftelse</td><td>~${Math.round((p?.andel_tapt_sen_respons || 0.5) * 100)} %</td></tr><tr class="highlight"><td>Estimert årlig tap</td><td>~${krFull(data.marginTap.responsGap)} kr</td></tr>`,
    gratis_befaring_uten_filter: `<tr><td>Estimerte bom-befaringer per uke</td><td>~${bomPerUke}</td></tr><tr><td>Snittid per bomtur (inkl. kjøring)</td><td>${p?.timer_per_bom || 1.5} timer</td></tr><tr><td>Fagtimer tapt per år</td><td>~${Math.round(bomPerUke * (p?.timer_per_bom || 1.5) * 48)}</td></tr><tr class="highlight"><td>Estimert årlig kostnad</td><td>~${krFull(data.marginTap.ressurslekkasje)} kr</td></tr>`,
    ingen_crm_spor: `<tr><td>CRM-spor detektert i HTML</td><td>ingen</td></tr><tr><td>E-post-automasjon detektert</td><td>${data.website.hasCRMTracking ? data.website.crmType || 'ja' : 'ingen'}</td></tr><tr><td>Typisk tapt i beslutningsvinduet</td><td>${Math.round((p?.andel_tapt_oppfolging || 0.5) * 100)} %</td></tr><tr class="highlight"><td>Estimert årlig tap</td><td>~${krFull(data.marginTap.oppfolgingssvikt)} kr</td></tr>`,
  }

  const findingsHtml = visteflagg.map((flagg, i) => {
    const info = genererFinding(flagg, data)
    if (!info) return ''
    const tap = findingTap[flagg]
    const tapRad = tap && tap > 0 && !findingTableRows[flagg] ? `<tr class="hl"><td>Estimert årlig tap</td><td>~${krFull(tap)} kr</td></tr>` : ''
    const rawRows = (findingTableRows[flagg] || '').replace(/class="highlight"/g, 'class="hl"')
    const tableRows = rawRows || tapRad
    return `<div class="finding-card pri-${info.priority}">
      <div class="finding-meta"><span class="finding-num">${String(i + 1).padStart(2, '0')}</span><span class="finding-badge finding-badge-${info.priority}">${info.priority === 'hoy' ? 'Høy prioritet' : 'Middels prioritet'}</span></div>
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
      gmbFindingHtml = `<div class="finding-card pri-${isPriHoy ? 'hoy' : 'middels'}">
        <div class="finding-meta"><span class="finding-num">${String(obsNr).padStart(2, '0')}</span><span class="finding-badge finding-badge-${isPriHoy ? 'hoy' : 'middels'}">${isPriHoy ? 'Høy prioritet' : 'Middels prioritet'}</span></div>
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

  const by = b?.forretningsadresse?.poststed || ''
  const r = data.orgRank

  const rangeringHtml = (() => {
    if (!r) return `<div style="padding:16px 20px;font-size:13px;color:var(--d);">Ingen søkedata tilgjengelig</div>`
    const bedriftRad = (soek: string | null, rang: number | null) => {
      if (!soek) return ''
      const etikettStyle = rang ? (rang <= 3 ? `background:var(--green-bg);color:var(--green)` : `background:var(--gold-bg);color:#8a6a00`) : `background:var(--red-bg);color:var(--red)`
      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 20px;border-bottom:1px solid var(--k);font-size:13px;">
        <span style="color:var(--s);font-weight:500;">«${soek}»</span>
        <span style="font-family:'Syne Mono',monospace;font-size:12px;font-weight:700;padding:2px 10px;border-radius:20px;${etikettStyle}">${rang ? `#${rang}` : 'Ikke i topp 10'}</span>
      </div>`
    }
    const konkurRader = r.toppKonkurrenter.length > 0
      ? r.toppKonkurrenter.map(k => `<div style="display:flex;align-items:center;justify-content:space-between;padding:9px 20px;border-bottom:1px solid var(--ks);font-size:12px;">
          <span style="color:var(--d);">#${k.posisjon} ${k.url}</span>
          <span style="font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;background:var(--m);color:var(--d);padding:2px 8px;border-radius:20px;">konkurrent</span>
        </div>`).join('')
      : `<div style="padding:10px 20px;font-size:12px;color:var(--d);">Ingen konkurrentdata</div>`
    return bedriftRad(r.soekBransjeBy, r.rankBransjeBy) + bedriftRad(r.soekBransjeByAkutt, r.rankBransjeByAkutt)
      + (r.toppKonkurrenter.length > 0 ? `<div style="padding:8px 20px 4px;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--d);">Topp konkurrenter</div>` : '')
      + konkurRader
  })()

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
    return bedriftRad + (r.annonsoerer.length > 0 ? `<div style="padding:8px 20px 4px;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--d);">Aktive annonsører</div>` : '') + konkRader
  })()

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
    if (w2.siteAge) rader.push(seoRad2('Nettside copyright-år', String(w2.siteAge), w2.siteAge >= new Date().getFullYear() - 3 ? true : 'warn'))
    if (data.pagespeed?.loadTimeSeconds) {
      const lt = data.pagespeed.loadTimeSeconds
      rader.push(seoRad2('Lastetid (mobil)', `${lt.toFixed(1)} sek`, lt < 2.5 ? true : lt < 4 ? 'warn' : false))
    }
    rader.push(seoRad2('Mobilvennlig (PageSpeed)', data.pagespeed?.isMobileFriendly ?? false, data.pagespeed?.isMobileFriendly ?? false))
    rader.push(seoRad2('CTA synlig på mobil', w2.mobileHasCTA, w2.mobileHasCTA ? true : 'warn'))
    return rader.join('\n')
  })()

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

  const checkSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
  const styrkerHtml = data.styrker.length > 0
    ? data.styrker.map(s => `<div class="styrke-rad"><div class="styrke-ikon">${checkSvg}</div><div class="styrke-tekst">${s}</div></div>`).join('\n')
    : `<div class="styrke-rad"><div class="styrke-ikon">${checkSvg}</div><div class="styrke-tekst">Ingen klare styrker identifisert ennå — potensial for forbedring på alle fronter.</div></div>`

  const w = data.website
  const scoreDataJs = `Object.assign(scoreData, ${JSON.stringify({
    rg: data.score.responsGap.pct, kj: data.score.kundereise.pct,
    op: data.score.oppfolging.pct, syn: data.score.synlighet.pct,
    hasSSL: w.hasSSL, hasChatbot: w.hasChatbot, chatbotType: w.chatbotType,
    hasBooking: w.hasBookingCalendar, bookingType: w.bookingType,
    hasForm: w.hasContactForm, formFields: w.formFieldCount,
    hasPhone: w.hasClickablePhone, hasCTA: w.hasClearCTA, ctaText: w.ctaText,
    hasMetaPixel: w.hasMetaPixel, hasGoogleAds: w.hasGoogleAdsTag, hasGA: w.hasGoogleAnalytics,
    hasCRM: w.hasCRMTracking, crmType: w.crmType, hasNewsletter: w.hasNewsletterSignup,
    hasAutoResp: w.hasAutoResponse, hasGratisBefaring: w.hasGratisBefaringUtenFilter,
    hasFacebook: w.hasFacebook, hasInstagram: w.hasInstagram,
    mobileHasCTA: w.mobileHasCTA, siteAge: w.siteAge,
    gmbFound: data.gmb?.found ?? false, gmbRating: data.gmb?.rating ?? null,
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
    .replace(/{{HISTORISK_OMSETNING_HTML}}/g, renderHistorikkOmsetning(data))
    .replace(/{{KONKURRENT_TABELL_HTML}}/g, renderKonkurrentTabell(data))
    .replace(/{{ANMELDELSER_HTML}}/g, renderAnmeldelser(data))
    .replace(/{{INNVENDINGER_HTML}}/g, renderInnvendinger(data))
    .replace(/{{BEDRIFT_NAVN}}/g, b?.navn || 'Ukjent bedrift')
    .replace(/{{ORGNR}}/g, data.orgnr)
    .replace(/{{ORGNR_FORMATERT}}/g, data.orgnr.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3'))
    .replace(/{{BRANSJE_NAVN}}/g, data.bransjeNavn || 'Ukjent bransje')
    .replace(/{{BY}}/g, b?.forretningsadresse?.poststed || 'Ukjent')
    .replace(/{{ANSATTE}}/g, b?.antallAnsatte ? String(b.antallAnsatte) : 'Ikke registrert')
    .replace(/{{ANSATTE_TEKST}}/g, b?.antallAnsatte ? `${b.antallAnsatte} ansatte` : 'bedriftens størrelse')
    .replace(/{{ANSATTE_RAW}}/g, String(ansatte))
    .replace(/{{ETABLERT_AAR}}/g, etablertAar)
    .replace(/{{RAPPORT_DATO}}/g, dato)
    .replace(/{{OMSETNING_FORMATERT}}/g, omsetning)
    .replace(/{{SEEK_SCORE}}/g, String(data.score.total))
    .replace(/{{SCORE_LABEL}}/g, data.score.label)
    .replace(/{{INTRO_HEADING}}/g, introHeading)
    .replace(/{{AAPNINGSREPLIKK}}/g, data.aapningsreplikk)
    .replace(/{{FINDINGS_HTML}}/g, findingsHtml)
    .replace(/{{GMB_FINDING_HTML}}/g, gmbFindingHtml)
    .replace(/{{STYRKER_HTML}}/g, styrkerHtml)
    .replace(/{{GMB_RATING_DISPLAY}}/g, (() => {
      if (!data.gmb?.found) return '—'
      return data.gmb.rating ? data.gmb.rating.toFixed(1) + ' ★' : '—'
    })())
    .replace(/{{GMB_RATING_COLOR}}/g, (() => {
      if (!data.gmb?.found || !data.gmb.rating) return ''
      return data.gmb.rating >= 4.5 ? 'green' : data.gmb.rating >= 4.0 ? 'gold' : 'red'
    })())
    .replace(/{{GMB_REVIEWS_DISPLAY}}/g, (() => {
      if (!data.gmb?.found) return 'Ingen GMB-profil'
      const n = data.gmb.reviewCount
      return n !== null ? `${n} Google-anmeldelser` : 'Anmeldelser ikke tilgjengelig'
    })())
    .replace(/{{RANK_DISPLAY}}/g, (() => {
      const r = data.orgRank?.rankBransjeBy
      if (r === null || r === undefined) return 'Ikke synlig'
      return `#${r}`
    })())
    .replace(/{{RANK_COLOR}}/g, (() => {
      const r = data.orgRank?.rankBransjeBy
      if (r === null || r === undefined) return 'red'
      return r <= 3 ? 'green' : r <= 7 ? 'gold' : ''
    })())
    .replace(/{{RANK_SØKEORD}}/g, (() => {
      const bransjeNavn = bransjeConfig?.soekeord?.[0]?.ord?.replace('[by]', b?.forretningsadresse?.poststed || 'din by') || 'organisk søk'
      return bransjeNavn
    })())
    .replace(/{{LASTETID_DISPLAY}}/g, (() => {
      const t = data.pagespeed?.loadTimeSeconds
      if (!t) return '—'
      return t.toFixed(1) + ' s'
    })())
    .replace(/{{LASTETID_COLOR}}/g, (() => {
      const t = data.pagespeed?.loadTimeSeconds
      if (!t) return ''
      return t <= 2.5 ? 'green' : t <= 4 ? 'gold' : 'red'
    })())
    .replace(/{{ANBEFALT_PAKKE}}/g, data.anbefaltPakke)
    .replace(/{{ANBEFALT_PAKKE_PRIS}}/g, krFull(pakkeKost))
    .replace(/{{ANBEFALT_PAKKE_PRIS_RAW}}/g, String(pakkeKost))
    .replace(/{{SNITTPROSJEKT_KR_FORMATERT}}/g, krFull(snittprosjekt) + ' kr')
    .replace(/{{BREAK_EVEN_JOBBER}}/g, String(data.breakEvenJobber))
    .replace(/{{BREAK_EVEN_JOBBER_TEKST}}/g, data.breakEvenJobber === 1 ? '1 jobb/mnd' : `${data.breakEvenJobber} jobber/mnd`)
}
