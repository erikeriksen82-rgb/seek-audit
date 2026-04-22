import puppeteer from 'puppeteer'
import { WebsiteData } from '../types'
import { cacheGet, cacheSet } from './cache'

export async function skrapNettside(url: string): Promise<WebsiteData> {
  if (!url) return tomWebsiteData(null, 'Ingen nettside oppgitt')

  const normalUrl = url.startsWith('http') ? url : `https://${url}`
  const key = `scrape2_${Buffer.from(normalUrl).toString('base64').slice(0, 40)}`
  const cached = cacheGet<WebsiteData>(key)
  if (cached) return cached

  let browser = null
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    })
    const page = await browser.newPage()
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    )
    await page.setViewport({ width: 1280, height: 800 })

    const networkUrls: string[] = []
    page.on('request', req => networkUrls.push(req.url().toLowerCase()))

    await page.goto(normalUrl, { waitUntil: 'networkidle2', timeout: 15000 })
    await new Promise(r => setTimeout(r, 3000))

    const networkUrlsStr = networkUrls.join(' ')
    const data = await page.evaluate((networkUrlsFromNode: string) => {
      const html = document.documentElement.innerHTML.toLowerCase()
      const scripts = Array.from(document.querySelectorAll('script[src]'))
        .map(s => (s as HTMLScriptElement).src.toLowerCase())
      const allSrc = scripts.join(' ')
      const inPageReqs = performance.getEntriesByType('resource')
        .map((e: any) => e.name.toLowerCase()).join(' ')
      const allNetReqs = networkUrlsFromNode + ' ' + inPageReqs

      // Chatbot
      const chatbotSignaler: Record<string, boolean> = {
        intercom: !!(window as any).Intercom || html.includes('intercom.io') || allNetReqs.includes('intercom'),
        tidio: !!(window as any).tidioChatApi || allSrc.includes('code.tidio.co') || allNetReqs.includes('tidio'),
        drift: !!(window as any).drift || html.includes('drift-widget') || allNetReqs.includes('js.driftt.com'),
        crisp: !!(window as any).$crisp || html.includes('crisp.chat') || allNetReqs.includes('crisp.chat') || allSrc.includes('crisp.chat'),
        livechat: !!(window as any).LC_API || allSrc.includes('livechatinc.com') || allNetReqs.includes('livechatinc'),
        tawk: !!(window as any).Tawk_API || allSrc.includes('tawk.to') || allNetReqs.includes('tawk.to'),
        zendesk: !!(window as any).zE || allSrc.includes('zopim') || allNetReqs.includes('zendesk'),
        ghl: allSrc.includes('leadconnectorhq.com') || html.includes('hl-chat') || allNetReqs.includes('leadconnector'),
        trengo: allSrc.includes('trengo') || allNetReqs.includes('trengo'),
        freshchat: !!(window as any).fcWidget || allNetReqs.includes('freshchat'),
      }
      const hasChatbot = Object.values(chatbotSignaler).some(Boolean)
      const chatbotType = hasChatbot ? Object.entries(chatbotSignaler).find(([, v]) => v)?.[0] ?? 'ukjent' : null

      // Booking
      const bookingSignaler: Record<string, boolean> = {
        calendly: html.includes('calendly') || allSrc.includes('calendly'),
        calcom: html.includes('cal.com') || allSrc.includes('cal.com'),
        simplybook: html.includes('simplybook') || allSrc.includes('simplybook'),
        ghl_booking: allSrc.includes('leadconnectorhq.com') && html.includes('booking'),
      }
      const hasBookingCalendar = Object.values(bookingSignaler).some(Boolean)
      const bookingType = hasBookingCalendar ? Object.entries(bookingSignaler).find(([, v]) => v)?.[0] ?? 'ukjent' : null

      // Tracking
      const hasMetaPixel = !!(window as any).fbq || allSrc.includes('connect.facebook.net')
      const hasGoogleAdsTag = allSrc.includes('googleadservices') || (html.includes('gtag') && html.includes('aw-'))
      const hasGoogleAnalytics = !!(window as any).gtag || !!(window as any).ga || allSrc.includes('google-analytics') || allSrc.includes('googletagmanager')
      const crmSignaler: Record<string, boolean> = {
        hubspot: allSrc.includes('hs-scripts.com') || allSrc.includes('hubspot'),
        pipedrive: allSrc.includes('pipedrive'),
        ghl: allSrc.includes('leadconnectorhq.com'),
        activecampaign: allSrc.includes('trackcmp.net'),
        mailchimp: allSrc.includes('chimpstatic.com'),
      }
      const hasCRMTracking = Object.values(crmSignaler).some(Boolean)
      const crmType = hasCRMTracking ? Object.entries(crmSignaler).find(([, v]) => v)?.[0] ?? 'ukjent' : null

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
          formText.includes('type') || formText.includes('omfang') ||
          formText.includes('tidsperspektiv') || formText.includes('prosjekt') ||
          formText.includes('størrelse') || formText.includes('budget') ||
          formText.includes('beskriv') || form.querySelectorAll('select').length > 0 ||
          form.querySelectorAll('textarea').length > 0
        ) hasQualificationFields = true
      })

      // Telefon
      const hasClickablePhone = document.querySelectorAll('a[href^="tel:"]').length > 0

      // CTA
      const ctaKandidater = Array.from(document.querySelectorAll('a, button')).filter(el => {
        const txt = el.textContent?.toLowerCase() || ''
        return txt.includes('kontakt') || txt.includes('befaring') || txt.includes('tilbud') ||
          txt.includes('ring') || txt.includes('book') || txt.includes('send') || txt.includes('start') || txt.includes('kom i gang')
      })
      const hasClearCTA = ctaKandidater.length > 0
      const ctaText = ctaKandidater[0]?.textContent?.trim() ?? null

      // Gratis befaring uten filter
      const harGratisBefaring = html.includes('gratis befaring')
      const harFilter = hasQualificationFields || hasBookingCalendar
      const hasGratisBefaringUtenFilter = harGratisBefaring && !harFilter

      // SEO
      const metaTitle = (document.querySelector('title')?.textContent || '').trim() || null
      const metaDescEl = document.querySelector('meta[name="description"]') as HTMLMetaElement | null
      const metaDescription = metaDescEl?.content?.trim() || null
      const h1El = document.querySelector('h1')
      const hasH1 = !!h1El
      const h1Text = h1El?.textContent?.trim() || null
      const hasStructuredData = !!document.querySelector('script[type="application/ld+json"]')

      // Nyhetsbrev + auto-respons
      const hasNewsletterSignup = html.includes('nyhetsbrev') || html.includes('newsletter') || html.includes('subscribe') || html.includes('meld deg på')
      const hasAutoResponse = html.includes('vi svarer innen') || html.includes('vi kontakter deg innen') || html.includes('automatisk bekreftelse') || html.includes('du vil høre fra oss innen')

      // Sosiale medier
      const allLinks = Array.from(document.querySelectorAll('a[href]')).map(a => (a as HTMLAnchorElement).href)
      const fbLinks = allLinks.filter(h => h.toLowerCase().includes('facebook.com/') && !h.toLowerCase().includes('sharer') && !h.toLowerCase().includes('share?'))
      const igLinks = allLinks.filter(h => h.toLowerCase().includes('instagram.com/'))
      const hasFacebook = fbLinks.length > 0
      const facebookUrl = fbLinks[0] || null
      const hasInstagram = igLinks.length > 0
      const instagramUrl = igLinks[0] || null

      // Nettsidens alder (copyright-år)
      const bodyText = document.body.innerText || document.body.textContent || ''
      const copyrightMatch = bodyText.match(/(?:©|copyright)\s*(\d{4})/i)
      const siteAge = copyrightMatch ? parseInt(copyrightMatch[1]) : null

      // Kontaktside-lenke
      const kontaktLenker = allLinks.filter(h => {
        const lower = h.toLowerCase()
        return (lower.includes('/kontakt') || lower.includes('/contact') || lower.includes('kontakt-oss') || lower.includes('ta-kontakt'))
          && !lower.startsWith('mailto:') && !lower.startsWith('tel:')
      })
      const contactPageUrl = kontaktLenker[0] || null

      return {
        hasChatbot, chatbotType, hasBookingCalendar, bookingType,
        hasMetaPixel, hasGoogleAdsTag, hasGoogleAnalytics, hasCRMTracking, crmType,
        hasContactForm, formFieldCount, hasQualificationFields, hasClickablePhone,
        hasClearCTA, ctaText, hasGratisBefaringUtenFilter, hasNewsletterSignup, hasAutoResponse,
        metaTitle, metaDescription, hasH1, h1Text, hasStructuredData,
        hasFacebook, facebookUrl, hasInstagram, instagramUrl, siteAge, contactPageUrl,
      }
    }, networkUrlsStr)

    // Besøk kontaktside om skjema ikke ble funnet på forsiden
    let contactPageFound = false
    if (!data.hasContactForm && data.contactPageUrl) {
      try {
        await page.goto(data.contactPageUrl, { waitUntil: 'networkidle2', timeout: 10000 })
        const kontaktData = await page.evaluate(() => {
          const forms = document.querySelectorAll('form')
          if (!forms.length) return null
          let formFieldCount = 0
          let hasQualificationFields = false
          forms.forEach(form => {
            const fields = form.querySelectorAll('input:not([type="hidden"]):not([type="submit"]), textarea, select')
            formFieldCount = Math.max(formFieldCount, fields.length)
            const formText = form.innerHTML.toLowerCase()
            if (formText.includes('type') || formText.includes('omfang') || formText.includes('beskriv') ||
              form.querySelectorAll('select').length > 0 || form.querySelectorAll('textarea').length > 0)
              hasQualificationFields = true
          })
          return { hasContactForm: true, formFieldCount, hasQualificationFields }
        })
        if (kontaktData) {
          data.hasContactForm = kontaktData.hasContactForm
          data.formFieldCount = kontaktData.formFieldCount
          data.hasQualificationFields = kontaktData.hasQualificationFields
          contactPageFound = true
        }
      } catch { /* ignore kontaktside-feil */ }
    }

    // Mobilsjekk — endre viewport og sjekk CTA-synlighet uten reload
    await page.setViewport({ width: 375, height: 667 })
    const mobileHasCTA = await page.evaluate(() => {
      const ctaEls = Array.from(document.querySelectorAll('a, button')).filter(el => {
        const txt = el.textContent?.toLowerCase() || ''
        return txt.includes('kontakt') || txt.includes('befaring') || txt.includes('tilbud') ||
          txt.includes('ring') || txt.includes('book') || txt.includes('send')
      })
      return ctaEls.some(el => {
        const rect = el.getBoundingClientRect()
        return rect.top < window.innerHeight && rect.width > 0 && rect.height > 0
      })
    })

    const hasSSL = normalUrl.startsWith('https://')
    const result: WebsiteData = {
      url: normalUrl, hasSSL, error: null,
      ...data,
      mobileHasCTA,
      contactPageFound,
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
    url, hasSSL: false, hasChatbot: false, chatbotType: null,
    hasBookingCalendar: false, bookingType: null, hasContactForm: false,
    formFieldCount: 0, hasQualificationFields: false, hasClickablePhone: false,
    hasClearCTA: false, ctaText: null, hasMetaPixel: false, hasGoogleAdsTag: false,
    hasGoogleAnalytics: false, hasCRMTracking: false, crmType: null,
    hasNewsletterSignup: false, hasAutoResponse: false, hasGratisBefaringUtenFilter: false,
    metaTitle: null, metaDescription: null, hasH1: false, h1Text: null, hasStructuredData: false,
    hasFacebook: false, facebookUrl: null, hasInstagram: false, instagramUrl: null,
    siteAge: null, mobileHasCTA: false, contactPageFound: false,
    error,
  }
}
