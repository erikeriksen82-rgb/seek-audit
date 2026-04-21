import axios from 'axios'
import { GmbData } from '../types'
import { cacheGet, cacheSet } from './cache'

export async function hentGmbData(bedriftNavn: string, poststed: string | undefined, googleApiKey: string): Promise<GmbData> {
  const soekQuery = poststed ? `${bedriftNavn} ${poststed}` : bedriftNavn
  const key = `gmb_${soekQuery.toLowerCase().replace(/\s+/g, '_').slice(0, 60)}`
  const cached = cacheGet<GmbData>(key)
  if (cached) return cached

  try {
    const søk = await axios.get('https://maps.googleapis.com/maps/api/place/findplacefromtext/json', {
      params: {
        input: soekQuery,
        inputtype: 'textquery',
        fields: 'place_id,name',
        key: googleApiKey,
      },
      timeout: 6000,
    })

    const placeId = søk.data?.candidates?.[0]?.place_id
    if (!placeId) {
      const result: GmbData = { found: false, placeId: null, name: null, rating: null, reviewCount: null, hasOpeningHours: false, hasPhone: false, hasWebsite: false, address: null, error: null }
      cacheSet(key, result)
      return result
    }

    const detaljer = await axios.get('https://maps.googleapis.com/maps/api/place/details/json', {
      params: {
        place_id: placeId,
        fields: 'name,rating,user_ratings_total,opening_hours,formatted_phone_number,website,formatted_address',
        key: googleApiKey,
      },
      timeout: 6000,
    })

    const r = detaljer.data?.result
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
      error: null,
    }

    cacheSet(key, result)
    return result
  } catch (err: any) {
    console.error('Google Places feil:', err.message)
    return { found: false, placeId: null, name: null, rating: null, reviewCount: null, hasOpeningHours: false, hasPhone: false, hasWebsite: false, address: null, error: err.message }
  }
}

export async function finnNettside(bedriftNavn: string, googleApiKey: string): Promise<string | null> {
  const key = `places_url_${bedriftNavn.toLowerCase().replace(/\s+/g, '_').slice(0, 60)}`
  const cached = cacheGet<string>(key)
  if (cached) return cached

  try {
    const søk = await axios.get('https://maps.googleapis.com/maps/api/place/findplacefromtext/json', {
      params: {
        input: bedriftNavn,
        inputtype: 'textquery',
        fields: 'place_id',
        key: googleApiKey,
      },
      timeout: 6000,
    })

    const placeId = søk.data?.candidates?.[0]?.place_id
    if (!placeId) return null

    const detaljer = await axios.get('https://maps.googleapis.com/maps/api/place/details/json', {
      params: {
        place_id: placeId,
        fields: 'website',
        key: googleApiKey,
      },
      timeout: 6000,
    })

    const website = detaljer.data?.result?.website ?? null
    if (website) cacheSet(key, website)
    return website
  } catch {
    return null
  }
}
