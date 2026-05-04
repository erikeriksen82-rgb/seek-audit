import axios from 'axios'
import { OrgRankData, Konkurrent, GmbData } from '../types'
import { cacheGet, cacheSet } from './cache'

export async function hentGmbViaSerpApi(bedriftNavn: string, serpApiKey: string): Promise<GmbData | null> {
  const key = `serpgmb_${bedriftNavn.toLowerCase().replace(/\s+/g, '_').slice(0, 50)}`
  const cached = cacheGet<GmbData>(key)
  if (cached) return cached

  try {
    const res = await axios.get('https://serpapi.com/search', {
      params: { q: bedriftNavn, gl: 'no', hl: 'no', api_key: serpApiKey },
      timeout: 10000,
    })

    const søktOrd = bedriftNavn.toLowerCase().replace(/\b(as|ans|da)\b/g, '').trim().split(/\s+/).filter((o: string) => o.length > 2)

    let kg = res.data?.knowledge_graph
    let kgNavn = (kg?.title ?? '').toLowerCase()

    // Valider knowledge_graph — krev name-match OG rating/anmeldelser
    if (!kg?.title || !søktOrd.some((o: string) => kgNavn.includes(o)) || (!kg.rating && !kg.reviews)) {
      // Prøv local_results som alternativ kilde — mer pålitelig for mindre bedrifter
      const local = (res.data?.local_results ?? []) as any[]
      const localMatch = local.find((r: any) => {
        const name = (r.title ?? '').toLowerCase()
        return søktOrd.some((o: string) => name.includes(o)) && (r.rating || r.reviews)
      })
      if (localMatch) {
        kg = {
          title: localMatch.title,
          rating: localMatch.rating,
          reviews: localMatch.reviews,
          place_id: localMatch.place_id,
          phone: localMatch.phone,
          website: localMatch.website,
          hours: localMatch.hours,
          address: localMatch.address,
        }
        kgNavn = (kg.title ?? '').toLowerCase()
        console.log(`  GMB SerpAPI (local_results): ${kg.title} | rating: ${kg.rating} | anm: ${kg.reviews}`)
      } else {
        return null
      }
    }

    const rating = kg.rating ? parseFloat(String(kg.rating)) : null
    let reviewCount = kg.reviews ? parseInt(String(kg.reviews)) : null
    const hasOpeningHours = !!(kg.hours && Object.keys(kg.hours).length > 0)

    // Suppler anmeldelsestall via Google Maps-oppslag hvis mangler fra knowledge_graph
    if (reviewCount === null && kg.place_id) {
      try {
        const mapsRes = await axios.get('https://serpapi.com/search', {
          params: { engine: 'google_maps', place_id: kg.place_id, gl: 'no', hl: 'no', api_key: serpApiKey },
          timeout: 8000,
        })
        const pr = mapsRes.data?.place_results
        if (pr?.reviews) {
          reviewCount = parseInt(String(pr.reviews))
          console.log(`  GMB SerpAPI (maps suppler): ${pr.title} | anm: ${reviewCount}`)
        }
      } catch (suppErr: any) {
        console.error('  SerpAPI Maps suppler feil:', suppErr.message)
      }
    }

    console.log(`  GMB SerpAPI: ${kg.title} | rating: ${rating} | anm: ${reviewCount}`)

    const result: GmbData = {
      found: true,
      placeId: kg.place_id ?? null,
      name: kg.title ?? null,
      rating,
      reviewCount,
      hasOpeningHours,
      hasPhone: !!kg.phone,
      hasWebsite: !!kg.website,
      address: kg.address ?? null,
      reviews: [],
      svarer: false,
      error: null,
    }

    cacheSet(key, result)
    return result
  } catch (err: any) {
    console.error('SerpAPI GMB feil:', err.message)
    return null
  }
}

export async function hentOrganiskRangering(
  bedriftNavn: string,
  bransje: string,
  poststed: string | undefined,
  serpApiKey: string,
  nettsideUrl?: string | null
): Promise<OrgRankData> {
  if (!poststed) {
    return { rankBransjeBy: null, rankBransjeByAkutt: null, soekBransjeBy: null, soekBransjeByAkutt: null, toppKonkurrenter: [], annonsoerer: [], harAnnonsering: false, error: 'Ingen poststed' }
  }

  const soek1 = `${bransje} ${poststed}`
  const soek2 = `${bransje} ${poststed} akutt`
  const key = `serp_${soek1.toLowerCase().replace(/[^a-zæøå0-9]+/g, '_').slice(0, 60)}`
  const cached = cacheGet<OrgRankData>(key)
  if (cached) return cached

  try {
    const [res1, res2] = await Promise.all([
      søkSerpApi(soek1, serpApiKey),
      søkSerpApi(soek2, serpApiKey),
    ])

    const navnLower = bedriftNavn.toLowerCase()
    const egetDomene = nettsideUrl ? kortDomene(nettsideUrl) : null

    // Finn selskapets plassering
    const rankBransjeBy = finnRangering(res1.organiske, navnLower)
    const rankBransjeByAkutt = finnRangering(res2.organiske, navnLower)

    // Topp 3 konkurrenter (ekskluder selskapet selv, eget domene og katalogsider)
    const toppKonkurrenter: Konkurrent[] = res1.organiske
      .filter(r => {
        const link = (r.link ?? '').toLowerCase()
        if (erKatalog(link)) return false
        if (link.includes(navnLower.replace(/\s+/g, ''))) return false
        if (egetDomene && link.includes(egetDomene)) return false
        return true
      })
      .slice(0, 3)
      .map((r, i) => ({
        tittel: r.title,
        url: kortDomene(r.link),
        posisjon: r.posisjon,
      }))

    // Annonsører fra begge søk
    const alleAnnonsorer = [...res1.ads, ...res2.ads]
      .map(a => kortDomene(a.link || a.displayed_link || ''))
      .filter(Boolean)
      .filter(d => !d.includes(navnLower.replace(/\s+/g, '')))
    const unike = [...new Set(alleAnnonsorer)].slice(0, 4)

    const result: OrgRankData = {
      rankBransjeBy,
      rankBransjeByAkutt,
      soekBransjeBy: soek1,
      soekBransjeByAkutt: soek2,
      toppKonkurrenter,
      annonsoerer: unike,
      harAnnonsering: alleAnnonsorer.length > 0,
      error: null,
    }

    cacheSet(key, result)
    return result
  } catch (err: any) {
    console.error('SerpAPI feil:', err.message)
    return { rankBransjeBy: null, rankBransjeByAkutt: null, soekBransjeBy: soek1, soekBransjeByAkutt: soek2, toppKonkurrenter: [], annonsoerer: [], harAnnonsering: false, error: err.message }
  }
}

async function søkSerpApi(query: string, apiKey: string): Promise<{ organiske: any[], ads: any[] }> {
  const res = await axios.get('https://serpapi.com/search', {
    params: { q: query, gl: 'no', hl: 'no', num: 10, api_key: apiKey },
    timeout: 8000,
  })
  return {
    organiske: (res.data?.organic_results ?? []).map((r: any, i: number) => ({ ...r, posisjon: i + 1 })),
    ads: res.data?.ads ?? [],
  }
}

function finnRangering(organiske: any[], navnLower: string): number | null {
  for (const r of organiske) {
    const tittel = (r.title ?? '').toLowerCase()
    const link = (r.link ?? '').toLowerCase()
    if (tittel.includes(navnLower) || link.includes(navnLower.replace(/\s+/g, ''))) {
      return r.posisjon
    }
  }
  return null
}

function kortDomene(url: string): string {
  try { return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '') }
  catch { return url.replace(/^www\./, '').split('/')[0] }
}

function erKatalog(url: string): boolean {
  const kataloger = ['1881', 'gulesider', 'finn.no', 'bygg', 'mittanbud', 'prisjakt', 'google.com', 'facebook.com']
  return kataloger.some(k => url.includes(k))
}
