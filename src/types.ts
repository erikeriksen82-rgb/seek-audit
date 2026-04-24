export interface Review {
  author: string
  rating: number
  text: string | null
  relativeTime: string | null
}

export interface KonkurrentGmb {
  tittel: string
  domene: string
  posisjon: number
  rating: number | null
  reviewCount: number | null
  hasWebsite: boolean
}

export interface HistoriskRegnskap {
  aar: number
  omsetning: number
}

export interface BrregEnhet {
  organisasjonsnummer: string
  navn: string
  antallAnsatte: number
  naeringskode1?: { kode: string; beskrivelse: string }
  forretningsadresse?: { poststed: string; adresse?: string[] }
  stiftelsesdato?: string
  organisasjonsform?: { kode: string; beskrivelse: string }
  hjemmeside?: string
  konkurs?: boolean
  underAvvikling?: boolean
}

export interface RegnskapData {
  aaretsResultat?: number
  sumDriftsInntekter?: number
  aar?: number
  historikk: HistoriskRegnskap[]
}

export interface WebsiteData {
  url: string | null
  hasSSL: boolean
  hasChatbot: boolean
  chatbotType: string | null
  hasBookingCalendar: boolean
  bookingType: string | null
  hasContactForm: boolean
  formFieldCount: number
  hasQualificationFields: boolean
  hasClickablePhone: boolean
  hasClearCTA: boolean
  ctaText: string | null
  hasMetaPixel: boolean
  hasGoogleAdsTag: boolean
  hasGoogleAnalytics: boolean
  hasCRMTracking: boolean
  crmType: string | null
  hasNewsletterSignup: boolean
  hasAutoResponse: boolean
  hasGratisBefaringUtenFilter: boolean
  metaTitle: string | null
  metaDescription: string | null
  hasH1: boolean
  h1Text: string | null
  hasStructuredData: boolean
  hasFacebook: boolean
  facebookUrl: string | null
  hasInstagram: boolean
  instagramUrl: string | null
  siteAge: number | null
  mobileHasCTA: boolean
  contactPageFound: boolean
  error: string | null
}

export interface PageSpeedData {
  loadTimeSeconds: number
  mobileScore: number
  isMobileFriendly: boolean
  error: string | null
}

export interface GmbData {
  found: boolean
  placeId: string | null
  name: string | null
  rating: number | null
  reviewCount: number | null
  hasOpeningHours: boolean
  hasPhone: boolean
  hasWebsite: boolean
  address: string | null
  reviews: Review[]
  svarer: boolean
  error: string | null
}

export interface Konkurrent {
  tittel: string
  url: string
  posisjon: number
}

export interface OrgRankData {
  rankBransjeBy: number | null
  rankBransjeByAkutt: number | null
  soekBransjeBy: string | null
  soekBransjeByAkutt: string | null
  toppKonkurrenter: Konkurrent[]
  annonsoerer: string[]
  harAnnonsering: boolean
  error: string | null
}

export interface AreaScore {
  raw: number
  max: number
  pct: number
  flags: string[]
}

export interface SeekScore {
  total: number
  label: 'HET LEAD' | 'VARM LEAD' | 'LAV MATCH' | 'IKKE PRIORITER'
  labelColor: string
  synlighet: AreaScore
  responsGap: AreaScore
  kundereise: AreaScore
  oppfolging: AreaScore
}

export interface MarginTap {
  responsGap: number
  ressurslekkasje: number
  oppfolgingssvikt: number
  total: number
  snittjobbBeregnet: number
}

export interface AuditResult {
  orgnr: string
  brreg: BrregEnhet | null
  regnskap: RegnskapData | null
  bransjeKey: string | null
  bransjeNavn: string | null
  website: WebsiteData
  pagespeed: PageSpeedData | null
  gmb: GmbData | null
  orgRank: OrgRankData | null
  konkurrentGmb: KonkurrentGmb[]
  score: SeekScore
  marginTap: MarginTap
  styrker: string[]
  flaggPrioritet: string[]
  aapningsreplikk: string
  anbefaltPakke: string
  breakEvenJobber: number
  timestamp: string
}
