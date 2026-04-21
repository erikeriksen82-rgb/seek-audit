import axios from 'axios'
import { OrgRankData } from '../types'
import { cacheGet, cacheSet } from './cache'

export async function hentOrganiskRangering(
  bedriftNavn: string,
  bransje: string,
  poststed: string | undefined,
  serpApiKey: string
): Promise<OrgRankData> {
  if (!poststed) {
    return { rankBransjeBy: null, rankBransjeByAkutt: null, soekBransjeBy: null, soekBransjeByAkutt: null, error: 'Ingen poststed' }
  }

  const soek1 = `${bransje} ${poststed}`
  const soek2 = `${bransje} ${poststed} akutt`
  const key = `serp_${soek1.toLowerCase().replace(/\s+/g, '_')}`
  const cached = cacheGet<OrgRankData>(key)
  if (cached) return cached

  try {
    const [res1, res2] = await Promise.all([
      søkSerpApi(soek1, bedriftNavn, serpApiKey),
      søkSerpApi(soek2, bedriftNavn, serpApiKey),
    ])

    const result: OrgRankData = {
      rankBransjeBy: res1,
      rankBransjeByAkutt: res2,
      soekBransjeBy: soek1,
      soekBransjeByAkutt: soek2,
      error: null,
    }

    cacheSet(key, result)
    return result
  } catch (err: any) {
    console.error('SerpAPI feil:', err.message)
    return { rankBransjeBy: null, rankBransjeByAkutt: null, soekBransjeBy: soek1, soekBransjeByAkutt: soek2, error: err.message }
  }
}

async function søkSerpApi(query: string, bedriftNavn: string, apiKey: string): Promise<number | null> {
  const res = await axios.get('https://serpapi.com/search', {
    params: {
      q: query,
      gl: 'no',
      hl: 'no',
      num: 10,
      api_key: apiKey,
    },
    timeout: 8000,
  })

  const organiske = res.data?.organic_results ?? []
  const navnLower = bedriftNavn.toLowerCase()

  for (let i = 0; i < organiske.length; i++) {
    const tittel = (organiske[i].title ?? '').toLowerCase()
    const link = (organiske[i].link ?? '').toLowerCase()
    if (tittel.includes(navnLower) || link.includes(navnLower.replace(/\s+/g, ''))) {
      return i + 1
    }
  }

  return null
}
