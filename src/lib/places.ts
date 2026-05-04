import axios from 'axios'
import puppeteer from 'puppeteer'
import { GmbData, KonkurrentGmb, Konkurrent, Review } from '../types'
import { cacheGet, cacheSet } from './cache'

function rensNavnForSøk(navn: string): string {
  return navn.replace(/\b(AS|ANS|DA|ENK|SA|BA|NUF|IKS)\b\.?$/i, '').trim()
}

function normaliserTelefon(tlf: string | undefined): string | null {
  if (!tlf) return null
  const siffer = tlf.replace(/\D/g, '')
  if (siffer.length === 8) return `+47${siffer}`
  if (siffer.length === 10 && siffer.startsWith('47')) return `+${siffer}`
  return null
}

function navnLikhetOk(funnetNavn: string, søktNavn: string): boolean {
  const rens = (s: string) => s.toLowerCase().replace(/\b(as|ans|da|enk|sa)\b/g, '').replace(/[^a-zæøå0-9]/g, ' ').trim()
  const a = rens(funnetNavn)
  const b = rens(søktNavn)
  const ord = b.split(/\s+/).filter(o => o.length > 2)
  return ord.some(o => a.includes(o))
}

async function finnPlaceId(query: string, inputtype: 'textquery' | 'phonenumber', googleApiKey: string, bedriftNavn?: string): Promise<string | null> {
  try {
    if (inputtype === 'textquery') {
      const søk = await axios.get('https://maps.googleapis.com/maps/api/place/textsearch/json', {
        params: { query, language: 'no', key: googleApiKey },
        timeout: 6000,
      })
      const status = søk.data?.status
      const results = søk.data?.results ?? []
      // Valider at funnet bedrift faktisk ligner på det vi søkte etter
      const treff = bedriftNavn
        ? results.find((r: any) => navnLikhetOk(r.name ?? '', bedriftNavn))
        : results[0]
      console.log(`  GMB textsearch "${query}" → status: ${status}, treff: ${results.length}, valgt: ${treff?.name ?? 'ingen'}`)
      return treff?.place_id ?? null
    } else {
      const søk = await axios.get('https://maps.googleapis.com/maps/api/place/findplacefromtext/json', {
        params: { input: query, inputtype: 'phonenumber', fields: 'place_id,name', key: googleApiKey },
        timeout: 6000,
      })
      const status = søk.data?.status
      const candidates = søk.data?.candidates ?? []
      console.log(`  GMB phonenumber "${query}" → status: ${status}, treff: ${candidates.length}${candidates[0] ? ` (${candidates[0].name})` : ''}`)
      return candidates[0]?.place_id ?? null
    }
  } catch (err: any) {
    console.error(`  GMB søk feilet "${query}":`, err.message)
    return null
  }
}

async function skrapGmbViaGoogleSøk(søkeTekst: string): Promise<GmbData | null> {
  let browser = null
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    })
    const page = await browser.newPage()
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'no-NO,no;q=0.9,en;q=0.8' })

    const url = `https://www.google.com/search?q=${encodeURIComponent(søkeTekst)}&hl=no&gl=no`
    console.log(`  GMB scrape → ${url}`)
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 })
    await new Promise(r => setTimeout(r, 2000))

    const data = await page.evaluate(() => {
      // Knowledge panel — Google viser dette i høyre kolonne for bedrifter
      const heleHtml = document.body.innerText

      // Navn: h2/h3 i knowledge panel
      const navnEl = document.querySelector('[data-attrid="title"] span, [data-ved] h2, .SPZz6b span, .qrShPb span')
      const name = navnEl?.textContent?.trim() || null

      // Rating: ser etter "4,8" eller "5,0" nær stjerner
      const ratingMatch = heleHtml.match(/(\d[,.]\d)\s*(?:★|\*|stjerner?|stars?)/i)
        || heleHtml.match(/(?:Vurdering|Rating|Rangering)[:\s]+(\d[,.]\d)/i)
      const rating = ratingMatch ? parseFloat(ratingMatch[1].replace(',', '.')) : null

      // Antall anmeldelser: "16 reviews" eller "16 anmeldelser"
      const reviewMatch = heleHtml.match(/(\d+)\s+(?:Google-anmeldelser|anmeldelser|reviews)/i)
      const reviewCount = reviewMatch ? parseInt(reviewMatch[1]) : null

      // Telefon
      const tlfMatch = heleHtml.match(/(?:Telefon|Phone|Tlf)[:\s]*([0-9\s]{8,12})/i)
        || heleHtml.match(/\b((?:\+47\s?)?[49]\d[\s]?\d{2}[\s]?\d{2}[\s]?\d{2})\b/)
      const hasPhone = !!tlfMatch

      // Nettside
      const hasWebsite = !!document.querySelector('a[data-url*="http"]:not([href*="google"]), a[aria-label*="ebsite"], a[aria-label*="nettsted"]')
        || heleHtml.includes('Website') || heleHtml.includes('Nettsted')

      // Åpningstider
      const hasOpeningHours = heleHtml.includes('Åpent') || heleHtml.includes('Stengt')
        || heleHtml.includes('Open') || heleHtml.includes('Closed') || heleHtml.includes('Åpningstider')

      // Adresse
      const adresseMatch = heleHtml.match(/([A-ZÆØÅ][a-zæøå]+(?:\s[A-ZÆØÅ]?[a-zæøå]+)*\s+\d+[A-Z]?,\s+\d{4}\s+[A-ZÆØÅ][a-zæøå]+)/m)
      const address = adresseMatch ? adresseMatch[1] : null

      return { name, rating, reviewCount, hasPhone, hasWebsite, hasOpeningHours, address }
    })

    console.log(`  GMB resultat: navn="${data.name}" rating=${data.rating} anm=${data.reviewCount}`)

    if (!data.rating && !data.reviewCount) return null

    return {
      found: true,
      placeId: null,
      name: data.name,
      rating: data.rating,
      reviewCount: data.reviewCount,
      hasOpeningHours: data.hasOpeningHours,
      hasPhone: data.hasPhone,
      hasWebsite: data.hasWebsite,
      address: data.address,
      reviews: [],
      svarer: false,
      error: null,
    }
  } catch (err: any) {
    console.error('  GMB Puppeteer feil:', err.message)
    return null
  } finally {
    await browser?.close()
  }
}

export async function hentGmbData(
  bedriftNavn: string,
  poststed: string | undefined,
  googleApiKey: string | undefined,
  telefon?: string,
  kommune?: string,
): Promise<GmbData> {
  const renNavn = rensNavnForSøk(bedriftNavn)
  const cacheKey = `gmb_${renNavn.toLowerCase().replace(/\s+/g, '_').slice(0, 50)}${poststed ? '_' + poststed.toLowerCase() : ''}`
  const cached = cacheGet<GmbData>(cacheKey)
  if (cached) return cached

  let placeId: string | null = null

  if (googleApiKey) {
    // 1. Telefonnummer — eksakt treff om GMB har samme nummer som Brreg
    const normTlf = normaliserTelefon(telefon)
    if (normTlf) placeId = await finnPlaceId(normTlf, 'phonenumber', googleApiKey, bedriftNavn)

    // 2. Navn + poststed (mer spesifikt enn kommune)
    if (!placeId && poststed) placeId = await finnPlaceId(`${renNavn} ${poststed}`, 'textquery', googleApiKey, bedriftNavn)

    // 3. Navn + kommune
    if (!placeId && kommune) placeId = await finnPlaceId(`${renNavn} ${kommune}`, 'textquery', googleApiKey, bedriftNavn)

    // 4. Bare renset navn
    if (!placeId) placeId = await finnPlaceId(renNavn, 'textquery', googleApiKey, bedriftNavn)

    // 5. Fullt juridisk navn
    if (!placeId && bedriftNavn !== renNavn) placeId = await finnPlaceId(bedriftNavn, 'textquery', googleApiKey, bedriftNavn)
  }

  try {
    if (!placeId) {
      // Fallback: scrape Google Maps direkte med Puppeteer
      console.log(`  Places API fant ingen treff — prøver Google Maps scraping...`)
      const søk = kommune ? `${renNavn} ${kommune}` : poststed ? `${renNavn} ${poststed}` : renNavn
      const puppeteerResultat = await skrapGmbViaGoogleSøk(søk)
      if (puppeteerResultat) {
        cacheSet(cacheKey, puppeteerResultat)
        return puppeteerResultat
      }
      return { found: false, placeId: null, name: null, rating: null, reviewCount: null, hasOpeningHours: false, hasPhone: false, hasWebsite: false, address: null, reviews: [], svarer: false, error: null }
    }

    const detaljer = await axios.get('https://maps.googleapis.com/maps/api/place/details/json', {
      params: {
        place_id: placeId,
        fields: 'name,rating,user_ratings_total,opening_hours,formatted_phone_number,website,formatted_address,reviews',
        key: googleApiKey,
        language: 'no',
      },
      timeout: 6000,
    })

    const r = detaljer.data?.result
    const rawReviews: Review[] = (r?.reviews || []).slice(0, 5).map((rv: any) => ({
      author: rv.author_name || 'Anonym',
      rating: rv.rating,
      text: rv.text?.trim() || null,
      relativeTime: rv.relative_time_description || null,
    }))

    const result: GmbData = {
      found: true,
      placeId,
      name: r?.name ?? null,
      rating: r?.rating ?? null,
      reviewCount: r?.user_ratings_total ?? null,
      hasOpeningHours: !!(r?.opening_hours?.periods?.length),
      hasPhone: !!r?.formatted_phone_number,
      hasWebsite: !!r?.website,
      address: r?.formatted_address ?? null,
      reviews: rawReviews,
      svarer: (r?.reviews || []).some((rv: any) => !!rv.owner_answer),
      error: null,
    }

    cacheSet(cacheKey, result)
    return result
  } catch (err: any) {
    console.error('Google Places feil:', err.message)
    return { found: false, placeId: null, name: null, rating: null, reviewCount: null, hasOpeningHours: false, hasPhone: false, hasWebsite: false, address: null, reviews: [], svarer: false, error: err.message }
  }
}

export async function finnNettside(bedriftNavn: string, googleApiKey: string): Promise<string | null> {
  const key = `places_url_${bedriftNavn.toLowerCase().replace(/\s+/g, '_').slice(0, 60)}`
  const cached = cacheGet<string>(key)
  if (cached) return cached

  try {
    const søk = await axios.get('https://maps.googleapis.com/maps/api/place/findplacefromtext/json', {
      params: { input: bedriftNavn, inputtype: 'textquery', fields: 'place_id', key: googleApiKey },
      timeout: 6000,
    })

    const placeId = søk.data?.candidates?.[0]?.place_id
    if (!placeId) return null

    const detaljer = await axios.get('https://maps.googleapis.com/maps/api/place/details/json', {
      params: { place_id: placeId, fields: 'website', key: googleApiKey },
      timeout: 6000,
    })

    const website = detaljer.data?.result?.website ?? null
    if (website) cacheSet(key, website)
    return website
  } catch {
    return null
  }
}

export async function hentGmbDetaljerViaPlaceId(
  placeId: string,
  googleApiKey: string
): Promise<{ reviewCount: number | null; rating: number | null; reviews: any[]; svarer: boolean } | null> {
  try {
    const detaljer = await axios.get('https://maps.googleapis.com/maps/api/place/details/json', {
      params: {
        place_id: placeId,
        fields: 'rating,user_ratings_total,reviews',
        key: googleApiKey,
        language: 'no',
      },
      timeout: 6000,
    })
    const status = detaljer.data?.status
    const r = detaljer.data?.result
    console.log(`  Places Details status: ${status} | total: ${r?.user_ratings_total} | rating: ${r?.rating}`)
    if (!r) return null
    return {
      rating: r.rating ?? null,
      reviewCount: r.user_ratings_total ?? null,
      reviews: (r.reviews || []).slice(0, 5).map((rv: any) => ({
        author: rv.author_name || 'Anonym',
        rating: rv.rating,
        text: rv.text?.trim() || null,
        relativeTime: rv.relative_time_description || null,
      })),
      svarer: (r.reviews || []).some((rv: any) => !!rv.owner_answer),
    }
  } catch (err: any) {
    console.error('Places Details via placeId feil:', err.message)
    return null
  }
}

export async function hentKonkurrentGmb(
  konkurrenter: Konkurrent[],
  poststed: string | undefined,
  googleApiKey: string
): Promise<KonkurrentGmb[]> {
  const resultater: KonkurrentGmb[] = []

  for (const k of konkurrenter.slice(0, 3)) {
    const renTittel = k.tittel.split(' - ')[0].split(' | ')[0].trim()
    const soekQuery = poststed ? `${renTittel} ${poststed}` : renTittel
    const key = `konkgmb_${k.url.replace(/[^a-z0-9]/gi, '_').slice(0, 50)}`
    const cached = cacheGet<KonkurrentGmb>(key)
    if (cached) { resultater.push(cached); continue }

    try {
      const søk = await axios.get('https://maps.googleapis.com/maps/api/place/findplacefromtext/json', {
        params: { input: soekQuery, inputtype: 'textquery', fields: 'place_id,name', key: googleApiKey },
        timeout: 5000,
      })

      const placeId = søk.data?.candidates?.[0]?.place_id
      if (!placeId) {
        const fallback: KonkurrentGmb = { tittel: renTittel, domene: k.url, posisjon: k.posisjon, rating: null, reviewCount: null, hasWebsite: true }
        cacheSet(key, fallback)
        resultater.push(fallback)
        continue
      }

      const detaljer = await axios.get('https://maps.googleapis.com/maps/api/place/details/json', {
        params: { place_id: placeId, fields: 'name,rating,user_ratings_total,website', key: googleApiKey },
        timeout: 5000,
      })

      const d = detaljer.data?.result
      const result: KonkurrentGmb = {
        tittel: d?.name || renTittel,
        domene: k.url,
        posisjon: k.posisjon,
        rating: d?.rating ?? null,
        reviewCount: d?.user_ratings_total ?? null,
        hasWebsite: !!d?.website,
      }
      cacheSet(key, result)
      resultater.push(result)
    } catch {
      const fallback: KonkurrentGmb = { tittel: renTittel, domene: k.url, posisjon: k.posisjon, rating: null, reviewCount: null, hasWebsite: true }
      cacheSet(key, fallback)
      resultater.push(fallback)
    }
  }

  return resultater
}
