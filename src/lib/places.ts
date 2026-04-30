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

async function finnPlaceId(query: string, inputtype: 'textquery' | 'phonenumber', googleApiKey: string): Promise<string | null> {
  try {
    const søk = await axios.get('https://maps.googleapis.com/maps/api/place/findplacefromtext/json', {
      params: { input: query, inputtype, fields: 'place_id,name', key: googleApiKey },
      timeout: 6000,
    })
    const status = søk.data?.status
    const candidates = søk.data?.candidates ?? []
    console.log(`  GMB [${inputtype}] "${query}" → status: ${status}, treff: ${candidates.length}${candidates[0] ? ` (${candidates[0].name})` : ''}`)
    if (status === 'REQUEST_DENIED') console.error('  ⚠ API-nøkkel mangler tilgang til Places API:', søk.data?.error_message)
    return candidates[0]?.place_id ?? null
  } catch (err: any) {
    console.error(`  GMB søk feilet [${inputtype}] "${query}":`, err.message)
    return null
  }
}

async function skrapGmbViaMaps(søkeTekst: string): Promise<GmbData | null> {
  let browser = null
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    })
    const page = await browser.newPage()
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'no-NO,no;q=0.9' })

    const url = `https://www.google.com/maps/search/${encodeURIComponent(søkeTekst)}?hl=no`
    console.log(`  GMB Puppeteer → ${url}`)
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 })
    await new Promise(r => setTimeout(r, 2000))

    // Klikk første resultat om vi er på listesiden
    const erListeside = await page.$('[role="feed"]')
    if (erListeside) {
      const forsteResultat = await page.$('a[href*="/maps/place/"]')
      if (forsteResultat) {
        await forsteResultat.click()
        await new Promise(r => setTimeout(r, 3000))
      } else {
        return null
      }
    }

    // Sjekk om vi har en bedriftsprofil oppe
    const harProfil = await page.$('[data-item-id="rating"]') || await page.$('button[data-item-id*="phone"]') || await page.$('span[aria-label*="stjerner"]')
    if (!harProfil) {
      const tittel = await page.title()
      console.log(`  GMB: ingen profil funnet, sidetittel: ${tittel}`)
      return null
    }

    const data = await page.evaluate(() => {
      const tekst = (sel: string) => document.querySelector(sel)?.textContent?.trim() || null

      // Rating og antall anmeldelser
      const ratingEl = document.querySelector('span[aria-label*="stjerner"], span[aria-label*="stars"]')
      const ratingTekst = ratingEl?.getAttribute('aria-label') || ''
      const ratingMatch = ratingTekst.match(/(\d[.,]\d)/)
      const rating = ratingMatch ? parseFloat(ratingMatch[1].replace(',', '.')) : null

      const reviewEl = document.querySelector('button[aria-label*="anmeldelser"], button[aria-label*="reviews"]')
      const reviewTekst = reviewEl?.getAttribute('aria-label') || reviewEl?.textContent || ''
      const reviewMatch = reviewTekst.match(/(\d+)/)
      const reviewCount = reviewMatch ? parseInt(reviewMatch[1]) : null

      // Navn
      const name = document.querySelector('h1')?.textContent?.trim() || null

      // Adresse
      const adresseEl = document.querySelector('button[data-item-id="address"], [data-tooltip="Kopier adresse"]')
      const address = adresseEl?.textContent?.trim() || null

      // Telefon
      const tlfEl = document.querySelector('button[data-item-id*="phone"], [data-tooltip="Kopier telefonnummer"]')
      const hasPhone = !!tlfEl

      // Nettside
      const websiteEl = document.querySelector('a[data-item-id="authority"], a[aria-label*="nettsted"], a[aria-label*="website"]')
      const hasWebsite = !!websiteEl

      // Åpningstider
      const hasOpeningHours = !!document.querySelector('[data-item-id*="oh"], button[aria-label*="Åpningstider"], button[aria-label*="Hours"]')

      return { name, rating, reviewCount, address, hasPhone, hasWebsite, hasOpeningHours }
    })

    if (!data.name && !data.rating) return null

    console.log(`  GMB Puppeteer fant: ${data.name}, rating: ${data.rating}, anmeldelser: ${data.reviewCount}`)

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
    if (normTlf) placeId = await finnPlaceId(normTlf, 'phonenumber', googleApiKey)

    // 2. Navn + kommune
    if (!placeId && kommune) placeId = await finnPlaceId(`${renNavn} ${kommune}`, 'textquery', googleApiKey)

    // 3. Navn + poststed
    if (!placeId && poststed) placeId = await finnPlaceId(`${renNavn} ${poststed}`, 'textquery', googleApiKey)

    // 4. Bare renset navn
    if (!placeId) placeId = await finnPlaceId(renNavn, 'textquery', googleApiKey)

    // 5. Fullt juridisk navn
    if (!placeId && bedriftNavn !== renNavn) placeId = await finnPlaceId(bedriftNavn, 'textquery', googleApiKey)
  }

  try {
    if (!placeId) {
      // Fallback: scrape Google Maps direkte med Puppeteer
      console.log(`  Places API fant ingen treff — prøver Google Maps scraping...`)
      const søk = kommune ? `${renNavn} ${kommune}` : poststed ? `${renNavn} ${poststed}` : renNavn
      const puppeteerResultat = await skrapGmbViaMaps(søk)
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
