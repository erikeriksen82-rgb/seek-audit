import puppeteer from 'puppeteer'
import { WebsiteData } from '../types'
import { cacheGet, cacheSet } from './cache'

export async function skrapNettside(url: string): Promise<WebsiteData> {
  if (!url) return tomWebsiteData(null, 'Ingen nettside oppgitt')

  const normalUrl = url.startsWith('http') ? url : `https://${url}`
  const key = `scrape_${Buffer.from(normalUrl).toString('base64').slice(0, 40)}`
  const cached = cacheGet<WebsiteData>(key)
  if (cached) return cached

  let browser = null
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    })
    const page = await browser.newPage()
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    )
    await page.setViewport({ width: 1280, height: 800 })

    await page.goto(normalUrl, { waitUntil: 'networkidle2', timeout: 15000 })

    const data = await page.evaluate(() => {
      const html = document.documentElement.innerHTML.toLowerCase()
      const scripts = Array.from(document.querySelectorAll('script[src]'))
        .map(s => (s as HTMLScriptElement).src.toLowerCase())
      const allSrc = scripts.join(' ')

      // Chatbot-deteksjon
      const chatbotSignaler: Record<string, boolean> = {
        intercom: !!(window as any).Intercom || html.includes('intercom'),
        tidio: !!(window as any).tidioChatApi || allSrc.includes('code.tidio.co'),
        drift: !!(window as any).drift || html.includes('drift-widget'),
        crisp: !!(window as any).$crisp || allSrc.includes('crisp.chat'),
        livechat: !!(window as any).LC_API || allSrc.includes('livechatinc.com'),
        tawk: !!(window as any).Tawk_API || allSrc.includes('tawk.to'),
        zendesk: !!(window as any).zE || allSrc.includes('zopim') || allSrc.includes('zendesk'),
        ghl: allSrc.includes('leadconnectorhq.com') || allSrc.includes('highlevel.com') || html.includes('hl-chat'),
        trengo: allSrc.includes('trengo'),
      }
      const hasChatbot = Object.values(chatbotSignaler).some(Boolean)
      const chatbotType = hasChatbot
        ? Object.entries(chatbotSignaler).find(([, v]) => v)?.[0] ?? 'ukjent'
        : null

      // Booking-deteksjon
      const bookingSignaler: Record<string, boolean> = {
        calendly: html.includes('calendly') || allSrc.includes('calendly'),
        calcom: html.includes('cal.com') || allSrc.includes('cal.com'),
        simplybook: html.includes('simplybook') || allSrc.includes('simplybook'),
        ghl_booking: allSrc.includes('leadconnectorhq.com') && html.includes('booking'),
      }
      const hasBookingCalendar = Object.values(bookingSignaler).some(Boolean)
      const bookingType = hasBookingCalendar
        ? Object.entries(bookingSignaler).find(([, v]) => v)?.[0] ?? 'ukjent'
        : null

      // Tracking-pixels og CRM
      const hasMetaPixel = !!(window as any).fbq || allSrc.includes('connect.facebook.net')
      const hasGoogleAdsTag = allSrc.includes('googleadservices') || html.includes('gtag') && html.includes('aw-')
      const hasGoogleAnalytics = !!(window as any).gtag || !!(window as any).ga || allSrc.includes('google-analytics') || allSrc.includes('googletagmanager')
      const crmSignaler: Record<string, boolean> = {
        hubspot: allSrc.includes('hs-scripts.com') || allSrc.includes('hubspot'),
        pipedrive: allSrc.includes('pipedrive'),
        ghl: allSrc.includes('leadconnectorhq.com'),
        activecampaign: allSrc.includes('trackcmp.net'),
        mailchimp: allSrc.includes('chimpstatic.com'),
      }
      const hasCRMTracking = Object.values(crmSignaler).some(Boolean)
      const crmType = hasCRMTracking
        ? Object.entries(crmSignaler).find(([, v]) => v)?.[0] ?? 'ukjent'
        : null

      // Kontaktskjema
      const forms = document.querySelectorAll('form')
      const hasContactForm = forms.length > 0
      let formFieldCount = 0
      let hasQualificationFields = false
      forms.forEach(form => {
        const fields = form.querySelectorAll('input:not([type="hidden"]):not([type="submit"]), textarea, select')
        formFieldCount = Math.max(formFieldCount, fields.length)
        const formText = form.innerHTML.toLowerCase()
        if (
          formText.includes('type') ||
          formText.includes('omfang') ||
          formText.includes('tidsperspektiv') ||
          formText.includes('prosjekt') ||
          formText.includes('størrelse') ||
          formText.includes('budget') ||
          formText.includes('beskriv') ||
          form.querySelectorAll('select').length > 0 ||
          form.querySelectorAll('textarea').length > 0
        ) hasQualificationFields = true
      })

      // Telefon klikkbart
      const telLinks = document.querySelectorAll('a[href^="tel:"]')
      const hasClickablePhone = telLinks.length > 0

      // CTA-analyse
      const ctaKandidater = Array.from(
        document.querySelectorAll('a, button')
      ).filter(el => {
        const txt = el.textContent?.toLowerCase() || ''
        return (
          txt.includes('kontakt') ||
          txt.includes('befaring') ||
          txt.includes('tilbud') ||
          txt.includes('ring') ||
          txt.includes('book') ||
          txt.includes('send') ||
          txt.includes('start') ||
          txt.includes('kom i gang')
        )
      })
      const hasClearCTA = ctaKandidater.length > 0
      const ctaText = ctaKandidater[0]?.textContent?.trim() ?? null

      // Gratis befaring uten filter
      const harGratisBefaring = html.includes('gratis befaring') || html.includes('gratis befaring')
      const harFilter = hasQualificationFields || hasBookingCalendar
      const hasGratisBefaringUtenFilter = harGratisBefaring && !harFilter

      // Nyhetsbrev
      const hasNewsletterSignup =
        html.includes('nyhetsbrev') ||
        html.includes('newsletter') ||
        html.includes('subscribe') ||
        html.includes('meld deg på')

      // Auto-respons signal
      const hasAutoResponse =
        html.includes('vi svarer innen') ||
        html.includes('vi kontakter deg innen') ||
        html.includes('automatisk bekreftelse') ||
        html.includes('du vil høre fra oss innen')

      return {
        hasChatbot,
        chatbotType,
        hasBookingCalendar,
        bookingType,
        hasMetaPixel,
        hasGoogleAdsTag,
        hasGoogleAnalytics,
        hasCRMTracking,
        crmType,
        hasContactForm,
        formFieldCount,
        hasQualificationFields,
        hasClickablePhone,
        hasClearCTA,
        ctaText,
        hasGratisBefaringUtenFilter,
        hasNewsletterSignup,
        hasAutoResponse,
      }
    })

    const hasSSL = normalUrl.startsWith('https://')

    const result: WebsiteData = {
      url: normalUrl,
      hasSSL,
      error: null,
      ...data,
    }

    cacheSet(key, result)
    return result
  } catch (err: any) {
    console.error(`Scraping feil for ${url}:`, err.message)
    return tomWebsiteData(url, err.message)
  } finally {
    if (browser) await browser.close()
  }
}

function tomWebsiteData(url: string | null, error: string): WebsiteData {
  return {
    url,
    hasSSL: false,
    hasChatbot: false,
    chatbotType: null,
    hasBookingCalendar: false,
    bookingType: null,
    hasContactForm: false,
    formFieldCount: 0,
    hasQualificationFields: false,
    hasClickablePhone: false,
    hasClearCTA: false,
    ctaText: null,
    hasMetaPixel: false,
    hasGoogleAdsTag: false,
    hasGoogleAnalytics: false,
    hasCRMTracking: false,
    crmType: null,
    hasNewsletterSignup: false,
    hasAutoResponse: false,
    hasGratisBefaringUtenFilter: false,
    error,
  }
}
