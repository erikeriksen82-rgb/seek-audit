import axios from 'axios'
import { OrgRankData, Konkurrent } from '../types'
import { cacheGet, cacheSet } from './cache'

export async function hentOrganiskRangering(
  bedriftNavn: string,
  bransje: string,
  poststed: string | undefined,
  serpApiKey: string
): Promise<OrgRankData> {
  if (!poststed) {
    return { rankBransjeBy: null, rankBransjeByAkutt: null, soekBransjeBy: null, soekBransjeByAkutt: null, toppKonkurrenter: [], annonsoerer: [], harAnnonsering: false, error: 'Ingen poststed' }
  }

  const soek1 = `${bransje} ${poststed}`
  const soek2 = `${bransje} ${poststed} akutt`
  const key = `serp_${soek1.toLowerCase().replace(/\s+/g, '_')}`
  const cached = cacheGet<OrgRankData>(key)
  if (cached) return cached

  try {
    const [res1, res2] = await Promise.all([
      søkSerpApi(soek1, serpApiKey),
      søkSerpApi(soek2, serpApiKey),
    ])

    const navnLower = bedriftNavn.toLowerCase()

    // Finn selskapets plassering
    const rankBransjeBy = finnRangering(res1.organiske, navnLower)
    const rankBransjeByAkutt = finnRangering(res2.organiske, navnLower)

    // Topp 3 konkurrenter (ekskluder selskapet selv og katalogsider)
    const toppKonkurrenter: Konkurrent[] = res1.organiske
      .filter(r => !r.link.includes(navnLower.replace(/\s+/g, '')) && !erKatalog(r.link))
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
