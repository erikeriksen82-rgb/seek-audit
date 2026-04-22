import axios from 'axios'
import { GmbData, KonkurrentGmb, Konkurrent, Review } from '../types'
import { cacheGet, cacheSet } from './cache'

export async function hentGmbData(bedriftNavn: string, poststed: string | undefined, googleApiKey: string): Promise<GmbData> {
  const soekQuery = poststed ? `${bedriftNavn} ${poststed}` : bedriftNavn
  const key = `gmb_${soekQuery.toLowerCase().replace(/\s+/g, '_').slice(0, 60)}`
  const cached = cacheGet<GmbData>(key)
  if (cached) return cached

  try {
    const søk = await axios.get('https://maps.googleapis.com/maps/api/place/findplacefromtext/json', {
      params: { input: soekQuery, inputtype: 'textquery', fields: 'place_id,name', key: googleApiKey },
      timeout: 6000,
    })

    const placeId = søk.data?.candidates?.[0]?.place_id
    if (!placeId) {
      const result: GmbData = { found: false, placeId: null, name: null, rating: null, reviewCount: null, hasOpeningHours: false, hasPhone: false, hasWebsite: false, address: null, reviews: [], svarer: false, error: null }
      cacheSet(key, result)
      return result
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

    cacheSet(key, result)
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
