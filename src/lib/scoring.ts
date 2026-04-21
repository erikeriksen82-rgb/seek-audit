import fs from 'fs'
import path from 'path'
import { AuditResult, AreaScore, SeekScore, MarginTap, WebsiteData, PageSpeedData, BrregEnhet, GmbData, OrgRankData } from '../types'

const vekter = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'config', 'scoring-vekter.json'), 'utf-8'))
const v_syn = vekter.synlighet
const v_rg = vekter.respons_gap
const v_kj = vekter.kundereise
const v_op = vekter.oppfolging
const omradeVekter = vekter.omrade_vekter

export function beregnScore(
  website: WebsiteData,
  pagespeed: PageSpeedData | null,
  brreg: BrregEnhet | null,
  bransjeConfig: any,
  gmb: GmbData | null,
  orgRank: OrgRankData | null
): SeekScore {

  // RESPONS-GAP
  const rgFlags: string[] = []
  let rgRaw = 0
  if (!website.hasChatbot) { rgRaw += v_rg.ingen_chatbot; rgFlags.push('ingen_chatbot') }
  if (!website.hasAutoResponse) { rgRaw += v_rg.ingen_auto_respons; rgFlags.push('ingen_auto_respons') }
  if (!website.hasBookingCalendar) { rgRaw += v_rg.ingen_booking_kalender; rgFlags.push('ingen_booking_kalender') }
  rgRaw += v_rg.ingen_24_7_vakt; rgFlags.push('ingen_24_7_vakt')
  const rgMax = v_rg.ingen_chatbot + v_rg.ingen_auto_respons + v_rg.ingen_booking_kalender + v_rg.ingen_24_7_vakt
  const responsGap: AreaScore = { raw: rgRaw, max: rgMax, pct: Math.min(100, Math.round(rgRaw / rgMax * 100)), flags: rgFlags }

  // KUNDEREISE
  const kjFlags: string[] = []
  let kjRaw = 0
  if (website.hasGratisBefaringUtenFilter) { kjRaw += v_kj.gratis_befaring_uten_filter; kjFlags.push('gratis_befaring_uten_filter') }
  if (website.formFieldCount < 3 && website.hasContactForm) { kjRaw += v_kj.skjema_under_3_felter; kjFlags.push('skjema_under_3_felter') }
  if (!website.hasQualificationFields) { kjRaw += v_kj.ingen_kvalifiseringssporsmal; kjFlags.push('ingen_kvalifiseringssporsmal') }
  if (!website.hasClickablePhone) { kjRaw += v_kj.telefon_ikke_klikkbart_mobil; kjFlags.push('telefon_ikke_klikkbart_mobil') }
  if (!website.hasClearCTA) { kjRaw += v_kj.utydelig_cta; kjFlags.push('utydelig_cta') }
  const kjMax = v_kj.gratis_befaring_uten_filter + v_kj.skjema_under_3_felter + v_kj.ingen_kvalifiseringssporsmal + v_kj.telefon_ikke_klikkbart_mobil + v_kj.utydelig_cta
  const kundereise: AreaScore = { raw: kjRaw, max: kjMax, pct: Math.min(100, Math.round(kjRaw / kjMax * 100)), flags: kjFlags }

  // OPPFØLGING
  const opFlags: string[] = []
  let opRaw = 0
  if (!website.hasCRMTracking) { opRaw += v_op.ingen_crm_spor; opFlags.push('ingen_crm_spor') }
  if (!website.hasGoogleAdsTag && !website.hasCRMTracking) { opRaw += v_op.ingen_email_automasjon; opFlags.push('ingen_email_automasjon') }
  if (!website.hasMetaPixel && !website.hasGoogleAdsTag) { opRaw += v_op.ingen_retargeting_pixel; opFlags.push('ingen_retargeting_pixel') }
  if (!website.hasNewsletterSignup) { opRaw += v_op.ingen_nyhetsbrev; opFlags.push('ingen_nyhetsbrev') }
  const opMax = v_op.ingen_crm_spor + v_op.ingen_email_automasjon + v_op.ingen_retargeting_pixel + v_op.ingen_nyhetsbrev
  const oppfolging: AreaScore = { raw: opRaw, max: opMax, pct: Math.min(100, Math.round(opRaw / opMax * 100)), flags: opFlags }

  // SYNLIGHET — inkluderer nå GMB og organisk rangering
  const synFlags: string[] = []
  let synRaw = 0

  // GMB
  if (!gmb || !gmb.found) {
    synRaw += v_syn.gmb_finnes_ikke; synFlags.push('gmb_finnes_ikke')
  } else {
    if (gmb.reviewCount !== null && gmb.reviewCount < 5) { synRaw += v_syn.gmb_under_5_anmeldelser; synFlags.push('gmb_under_5_anmeldelser') }
    else if (gmb.reviewCount !== null && gmb.reviewCount < 20) { synRaw += v_syn.gmb_under_20_anmeldelser; synFlags.push('gmb_under_20_anmeldelser') }
    if (gmb.rating !== null && gmb.rating < 4.0) { synRaw += v_syn.gmb_rating_under_4; synFlags.push('gmb_rating_under_4') }
  }

  // Organisk rangering
  if (orgRank && orgRank.rankBransjeBy === null) {
    synRaw += v_syn.ikke_synlig_topp_10; synFlags.push('ikke_synlig_topp_10')
  } else if (orgRank && orgRank.rankBransjeBy !== null && orgRank.rankBransjeBy >= 4) {
    synRaw += v_syn.topp_4_10; synFlags.push('topp_4_10')
  }

  // Nettside og teknisk
  if (!website.hasSSL && website.url) { synRaw += v_syn.nettside_ikke_ssl; synFlags.push('nettside_ikke_ssl') }
  if (!website.url || website.error) { synRaw += 10; synFlags.push('ingen_nettside') }
  if (pagespeed?.loadTimeSeconds && pagespeed.loadTimeSeconds > 4) { synRaw += v_syn.lastetid_over_4s; synFlags.push('lastetid_over_4s') }
  else if (pagespeed?.loadTimeSeconds && pagespeed.loadTimeSeconds > 2.5) { synRaw += v_syn.lastetid_over_2_5s; synFlags.push('lastetid_over_2_5s') }
  if (pagespeed && !pagespeed.isMobileFriendly) { synRaw += v_syn.ikke_mobilvennlig; synFlags.push('ikke_mobilvennlig') }
  if (!website.hasGoogleAdsTag) { synRaw += v_syn.ingen_google_ads; synFlags.push('ingen_google_ads') }
  if (!website.hasMetaPixel) { synRaw += v_syn.ingen_meta_ads; synFlags.push('ingen_meta_ads') }

  const synMax = v_syn.gmb_finnes_ikke + v_syn.gmb_under_5_anmeldelser + v_syn.gmb_rating_under_4 + v_syn.ikke_synlig_topp_10 + v_syn.ingen_google_ads + v_syn.ingen_meta_ads + v_syn.nettside_ikke_ssl + v_syn.lastetid_over_4s + v_syn.ikke_mobilvennlig + 10
  const synlighet: AreaScore = { raw: synRaw, max: synMax, pct: Math.min(100, Math.round(synRaw / synMax * 100)), flags: synFlags }

  // Vektet totalscore
  const total = Math.round(
    (responsGap.pct * omradeVekter.respons_gap +
     kundereise.pct * omradeVekter.kundereise +
     oppfolging.pct * omradeVekter.oppfolging +
     synlighet.pct * omradeVekter.synlighet) / 100
  )

  const terskler = vekter.score_terskler
  let label: SeekScore['label']
  let labelColor: string
  if (total >= terskler.het_lead) { label = 'HET LEAD'; labelColor = '#E8A830' }
  else if (total >= terskler.varm_lead) { label = 'VARM LEAD'; labelColor = '#E8A830' }
  else if (total >= terskler.lav_match) { label = 'LAV MATCH'; labelColor = 'rgba(255,255,255,0.08)' }
  else { label = 'IKKE PRIORITER'; labelColor = 'rgba(255,255,255,0.05)' }

  return { total, label, labelColor, synlighet, responsGap, kundereise, oppfolging }
}

export function beregnMarginTap(
  bransjeConfig: any,
  score: SeekScore,
  ansatte: number
): MarginTap {
  const p = bransjeConfig?.parametre
  if (!p) return { responsGap: 0, ressurslekkasje: 0, oppfolgingssvikt: 0, total: 0 }

  const fagfolk = Math.min(Math.max(Math.ceil(ansatte * 0.7), 1), 8)
  const henvendelerPerUke = p.henvendelser_per_uke_per_ansatt * fagfolk

  const responsGap = Math.round(
    henvendelerPerUke * p.andel_etter_arbeidstid * p.andel_tapt_sen_respons *
    p.snittjobb_kr * (p.margin_prosent / 100) * 52
  )

  const bomPerUke = p.bom_befaringer_per_uke_per_ansatt * fagfolk
  const ressurslekkasje = Math.round(
    bomPerUke * p.timer_per_bom * p.timepris_fag * 48
  )

  const tilbudPerMnd = henvendelerPerUke * 4
  const oppfolgingssvikt = Math.round(
    tilbudPerMnd * p.andel_hoyverdi * p.andel_tapt_oppfolging *
    p.snittjobb_kr * (p.margin_prosent / 100)
  )

  return {
    responsGap,
    ressurslekkasje,
    oppfolgingssvikt,
    total: responsGap + ressurslekkasje + oppfolgingssvikt,
  }
}

export function finnStyrker(website: WebsiteData, brreg: BrregEnhet | null, gmb: GmbData | null): string[] {
  const styrker: string[] = []
  if (website.hasChatbot) styrker.push(`Chatbot installert (${website.chatbotType})`)
  if (website.hasBookingCalendar) styrker.push(`Online booking på plass (${website.bookingType})`)
  if (website.hasMetaPixel) styrker.push('Meta Pixel installert — retargeting er mulig')
  if (website.hasCRMTracking) styrker.push(`CRM-sporing aktiv (${website.crmType})`)
  if (website.hasSSL) styrker.push('Nettside er sikret med SSL')
  if (website.hasQualificationFields) styrker.push('Kontaktskjema kvalifiserer leads')
  if (website.hasClickablePhone) styrker.push('Telefonnummer klikkbart på mobil')
  if (gmb?.found && gmb.reviewCount && gmb.reviewCount >= 20) styrker.push(`${gmb.reviewCount} Google-anmeldelser (snitt ${gmb.rating})`)
  else if (gmb?.found && gmb.rating && gmb.rating >= 4.5) styrker.push(`Google-rating ${gmb.rating} ★`)
  if (brreg?.antallAnsatte && brreg.antallAnsatte >= 5) styrker.push(`${brreg.antallAnsatte} ansatte — kapasitet til å skalere`)
  return styrker
}

export function finnAanbefaltPakke(marginTap: MarginTap, ansatte: number): { pakke: string; pris: number; breakEven: number } {
  const pakker = [
    { pakke: 'Intro', pris: 5990 },
    { pakke: 'Start', pris: 16000 },
    { pakke: 'Drift', pris: 25000 },
    { pakke: 'Vekst', pris: 35000 },
  ]
  let valgt = pakker[1]
  if (ansatte >= 10 || marginTap.total > 500000) valgt = pakker[3]
  else if (ansatte >= 5 || marginTap.total > 200000) valgt = pakker[2]

  const snittjobb = 85000
  const margin = 0.28
  const breakEven = Math.ceil(valgt.pris / (snittjobb * margin))

  return { ...valgt, breakEven }
}
