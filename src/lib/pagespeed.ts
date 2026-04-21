import axios from 'axios'
import { PageSpeedData } from '../types'
import { cacheGet, cacheSet } from './cache'

export async function hentPageSpeed(url: string, apiKey?: string): Promise<PageSpeedData> {
  if (!url) return { loadTimeSeconds: 0, mobileScore: 0, isMobileFriendly: false, error: 'Ingen URL' }

  const key = `pagespeed_${Buffer.from(url).toString('base64').slice(0, 40)}`
  const cached = cacheGet<PageSpeedData>(key)
  if (cached) return cached

  if (!apiKey) {
    return { loadTimeSeconds: 0, mobileScore: 0, isMobileFriendly: false, error: 'Mangler API-nøkkel' }
  }

  try {
    const res = await axios.get('https://www.googleapis.com/pagespeedonline/v5/runPagespeed', {
      params: { url, strategy: 'mobile', key: apiKey },
      timeout: 20000,
    })

    const lcp = res.data.lighthouseResult?.audits?.['largest-contentful-paint']?.numericValue
    const fcp = res.data.lighthouseResult?.audits?.['first-contentful-paint']?.numericValue
    const loadTimeMs = lcp || fcp || 0
    const mobileScore = Math.round((res.data.lighthouseResult?.categories?.performance?.score || 0) * 100)
    const viewport = res.data.lighthouseResult?.audits?.['viewport']?.score
    const isMobileFriendly = viewport === 1

    const data: PageSpeedData = {
      loadTimeSeconds: Math.round(loadTimeMs / 100) / 10,
      mobileScore,
      isMobileFriendly,
      error: null,
    }
    cacheSet(key, data)
    return data
  } catch (err: any) {
    console.error('PageSpeed feil:', err.message)
    return { loadTimeSeconds: 0, mobileScore: 0, isMobileFriendly: false, error: err.message }
  }
}
