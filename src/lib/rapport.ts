import { WebsiteData } from '../types'
import { hentBrregData, hentRegnskapsdata, finnBransjeKey } from './brreg'
import { skrapNettside } from './scraper'
import { hentPageSpeed } from './pagespeed'
import { hentGmbData, finnNettside, hentKonkurrentGmb } from './places'
import { hentOrganiskRangering } from './serp'
import { beregnScore, beregnMarginTap, finnStyrker, finnAanbefaltPakke } from './scoring'
import { cacheGet, cacheSet } from './cache'
import { AuditResult } from '../types'
import fs from 'fs'
import path from 'path'

const bransjer = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'config', 'bransjer.json'), 'utf-8'))

export async function kjorAudit(orgnr: string, googleApiKey?: string, bustCache = false, manuellUrl?: string, serpApiKey?: string): Promise<AuditResult> {
  const cacheKey = `audit2_${orgnr}`
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
  const kommune = brreg?.forretningsadresse?.kommune
  const telefon = brreg?.mobil || brreg?.telefon

  let nettsideUrl = manuellUrl || brreg?.hjemmeside || null

  // Forsøk å utlede nettside fra e-postdomene (f.eks. fredrik@vel-blast.no → https://vel-blast.no)
  if (!nettsideUrl && brreg?.epostadresse) {
    const domene = brreg.epostadresse.split('@')[1]
    if (domene && !domene.includes('gmail') && !domene.includes('hotmail') && !domene.includes('outlook') && !domene.includes('yahoo')) {
      nettsideUrl = `https://${domene}`
      console.log(`Utledet nettside fra e-post: ${nettsideUrl}`)
    }
  }

  if (!nettsideUrl && googleApiKey && brreg?.navn) {
    console.log(`Ingen nettside i Brreg — søker Google Places for "${brreg.navn}"...`)
    nettsideUrl = await finnNettside(brreg.navn, googleApiKey)
    if (nettsideUrl) console.log(`Google Places fant: ${nettsideUrl}`)
  }

  const [website, pagespeed, gmb, orgRank] = await Promise.all([
    nettsideUrl ? skrapNettside(nettsideUrl) : Promise.resolve(ingenNettside()),
    nettsideUrl && googleApiKey ? hentPageSpeed(nettsideUrl, googleApiKey) : Promise.resolve(null),
    brreg?.navn ? hentGmbData(brreg.navn, poststed, googleApiKey, telefon, kommune) : Promise.resolve(null),
    serpApiKey && brreg?.navn && bransjeConfig?.navn ? hentOrganiskRangering(brreg.navn, bransjeConfig.navn, poststed, serpApiKey) : Promise.resolve(null),
  ])

  // Hent GMB-data for topp konkurrenter
  const konkurrentGmb = (googleApiKey && orgRank?.toppKonkurrenter?.length)
    ? await hentKonkurrentGmb(orgRank.toppKonkurrenter, poststed, googleApiKey)
    : []

  const ansatte = brreg?.antallAnsatte || 3
  const score = beregnScore(website, pagespeed, brreg, bransjeConfig, gmb, orgRank)
  const marginTap = beregnMarginTap(bransjeConfig, score, ansatte, regnskap?.sumDriftsInntekter ?? null)
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
    orgnr, brreg, regnskap, bransjeKey,
    bransjeNavn: bransjeConfig?.navn ?? brreg?.naeringskode1?.beskrivelse ?? 'Ukjent bransje',
    website, pagespeed, gmb, orgRank, konkurrentGmb,
    score, marginTap, styrker, flaggPrioritet, aapningsreplikk,
    anbefaltPakke, breakEvenJobber,
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
    metaTitle: null, metaDescription: null, hasH1: false, h1Text: null, hasStructuredData: false,
    hasFacebook: false, facebookUrl: null, hasInstagram: false, instagramUrl: null,
    siteAge: null, mobileHasCTA: false, contactPageFound: false,
    error: 'Ingen nettside registrert i Brreg',
  }
}

function byggAapningsreplikk(navn: string, bransjeConfig: any, score: any, website: any, styrker: string[]): string {
  const styrke = styrker[0] ?? 'nettstedet er oppe og fungerer'
  if (score.responsGap.flags.includes('ingen_chatbot') && score.responsGap.flags.includes('ingen_auto_respons')) {
    return `${navn} har ${styrke}. Det vi registrerte er at det ikke finnes automatisk respons på henvendelser utenfor arbeidstid — kunder som tar kontakt på kveldstid eller helg får ingen bekreftelse og vet ikke om meldingen gikk frem.`
  }
  if (score.kundereise.flags.includes('gratis_befaring_uten_filter')) {
    return `${navn} tilbyr gratis befaring, noe som senker terskelen for å ta kontakt. Det vi registrerte er at det ikke stilles spørsmål om jobbtype, omfang eller budsjett før befaring bookes — noe som kan føre til unødvendige turer.`
  }
  if (score.synlighet.flags.includes('gmb_finnes_ikke')) {
    return `${navn} har ikke en verifisert Google-profil. Det betyr at bedriften ikke vises i Google Maps eller de lokale søkeresultatene for ${bransjeConfig?.navn?.toLowerCase() ?? 'håndverker'} i området — der de fleste kunder begynner søket.`
  }
  if (score.oppfolging.flags.includes('ingen_crm_spor')) {
    return `${navn} har ikke spor av et CRM-system eller automatisert oppfølging på nettsiden. Tilbud som sendes ut følges sannsynligvis opp manuelt, noe som gjør prosessen sårbar for glemsel i travle perioder.`
  }
  return `Analysen av ${navn} viser flere områder der den digitale tilstedeværelsen kan styrkes — særlig rundt synlighet i søk og responsinfrastruktur for nye henvendelser.`
}
