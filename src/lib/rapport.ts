import { WebsiteData } from '../types'
import { hentBrregData, hentRegnskapsdata, finnBransjeKey } from './brreg'
import { skrapNettside } from './scraper'
import { hentPageSpeed } from './pagespeed'
import { hentGmbData, finnNettside } from './places'
import { hentOrganiskRangering } from './serp'
import { beregnScore, beregnMarginTap, finnStyrker, finnAanbefaltPakke } from './scoring'
import { cacheGet, cacheSet } from './cache'
import { AuditResult } from '../types'
import fs from 'fs'
import path from 'path'

const bransjer = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'config', 'bransjer.json'), 'utf-8'))
const pitchBibliotek = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'config', 'pitch-bibliotek.json'), 'utf-8'))

export async function kjorAudit(orgnr: string, googleApiKey?: string, bustCache = false, manuellUrl?: string, serpApiKey?: string): Promise<AuditResult> {
  const cacheKey = `audit_${orgnr}`
  if (!bustCache) {
    const cached = cacheGet<AuditResult>(cacheKey)
    if (cached) return cached
  }

  const [brreg, regnskap] = await Promise.all([
    hentBrregData(orgnr),
    hentRegnskapsdata(orgnr),
  ])

  const naceKode = brreg?.naeringskode1?.kode
  const bransjeKey = finnBransjeKey(naceKode, bransjer)
  const bransjeConfig = bransjeKey ? bransjer[bransjeKey] : null
  const poststed = brreg?.forretningsadresse?.poststed

  // Prioritering: manuell URL > Brreg hjemmeside > Google Places-oppslag
  let nettsideUrl = manuellUrl || brreg?.hjemmeside || null
  if (!nettsideUrl && googleApiKey && brreg?.navn) {
    console.log(`Ingen nettside i Brreg — søker Google Places for "${brreg.navn}"...`)
    nettsideUrl = await finnNettside(brreg.navn, googleApiKey)
    if (nettsideUrl) console.log(`Google Places fant: ${nettsideUrl}`)
  }

  // Parallell innhenting av alle datakilder
  const [website, pagespeed, gmb, orgRank] = await Promise.all([
    nettsideUrl ? skrapNettside(nettsideUrl) : Promise.resolve(ingenNettside()),
    nettsideUrl && googleApiKey ? hentPageSpeed(nettsideUrl, googleApiKey) : Promise.resolve(null),
    googleApiKey && brreg?.navn ? hentGmbData(brreg.navn, poststed, googleApiKey) : Promise.resolve(null),
    serpApiKey && brreg?.navn && bransjeConfig?.navn ? hentOrganiskRangering(brreg.navn, bransjeConfig.navn, poststed, serpApiKey) : Promise.resolve(null),
  ])

  const ansatte = brreg?.antallAnsatte || 3
  const score = beregnScore(website, pagespeed, brreg, bransjeConfig, gmb, orgRank)
  const marginTap = beregnMarginTap(bransjeConfig, score, ansatte)
  const styrker = finnStyrker(website, brreg, gmb)
  const { pakke: anbefaltPakke, breakEven: breakEvenJobber } = finnAanbefaltPakke(marginTap, ansatte)

  const alleFlagg = [
    ...score.responsGap.flags,
    ...score.kundereise.flags,
    ...score.oppfolging.flags,
    ...score.synlighet.flags,
  ]
  const flaggPrioritet = alleFlagg.slice(0, 5)

  const aapningsreplikk = byggAapningsreplikk(brreg?.navn ?? 'bedriften', bransjeConfig, score, website, styrker)

  const result: AuditResult = {
    orgnr,
    brreg,
    regnskap,
    bransjeKey,
    bransjeNavn: bransjeConfig?.navn ?? brreg?.naeringskode1?.beskrivelse ?? 'Ukjent bransje',
    website,
    pagespeed,
    gmb,
    orgRank,
    score,
    marginTap,
    styrker,
    flaggPrioritet,
    aapningsreplikk,
    anbefaltPakke,
    breakEvenJobber,
    timestamp: new Date().toISOString(),
  }

  cacheSet(cacheKey, result)
  return result
}

function ingenNettside(): WebsiteData {
  return {
    url: null, hasSSL: false, hasChatbot: false, chatbotType: null,
    hasBookingCalendar: false, bookingType: null, hasContactForm: false,
    formFieldCount: 0, hasQualificationFields: false, hasClickablePhone: false,
    hasClearCTA: false, ctaText: null, hasMetaPixel: false, hasGoogleAdsTag: false,
    hasGoogleAnalytics: false, hasCRMTracking: false, crmType: null,
    hasNewsletterSignup: false, hasAutoResponse: false, hasGratisBefaringUtenFilter: false,
    error: 'Ingen nettside registrert i Brreg',
  }
}

function byggAapningsreplikk(
  navn: string,
  bransjeConfig: any,
  score: any,
  website: any,
  styrker: string[]
): string {
  const styrke = styrker[0] ?? 'nettstedet deres er oppe'

  if (score.responsGap.flags.includes('ingen_chatbot') && score.responsGap.flags.includes('ingen_auto_respons')) {
    return `Jeg har sett på ${navn} — dere har ${styrke}. Men jeg vil stille ett spørsmål: når en kunde sender kontaktskjema kl 19 onsdag, hvem svarer dem — og hvor lang tid tar det?`
  }
  if (score.kundereise.flags.includes('gratis_befaring_uten_filter')) {
    return `Jeg har sett på ${navn}. Dere tilbyr gratis befaring — det er bra for konvertering. Men jeg lurer på: hvor mange av de befaringene ender faktisk i jobb? Fordi uten filtrering er det et kostbart tilbud.`
  }
  if (score.synlighet.flags.includes('gmb_finnes_ikke')) {
    return `Jeg har sett på ${navn}. Dere har ikke en verifisert Google-profil — det betyr at kunder som søker etter ${bransjeConfig?.navn?.toLowerCase() ?? 'håndverker'} i ${navn.split(' ').pop()} ikke finner dere. Kan jeg vise deg hva det koster?`
  }
  if (score.oppfolging.flags.includes('ingen_crm_spor')) {
    return `Jeg har sett på ${navn}. De tilbudene dere sender ut — hva skjer med dem når kunden ikke svarer? Har dere en strukturert oppfølging, eller avhenger det av hvem som husker å ringe?`
  }
  return `Jeg har gjort en analyse på ${navn}. Vi ser noen tydelige svakheter i salgsleddet som sannsynligvis koster dere jobber hver uke — kan jeg dele det med deg på 2 minutter?`
}
