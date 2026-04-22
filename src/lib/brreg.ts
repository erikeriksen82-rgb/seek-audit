import axios from 'axios'
import { BrregEnhet, RegnskapData, HistoriskRegnskap } from '../types'
import { cacheGet, cacheSet } from './cache'

export async function hentBrregData(orgnr: string): Promise<BrregEnhet | null> {
  const key = `brreg_${orgnr}`
  const cached = cacheGet<BrregEnhet>(key)
  if (cached) return cached

  try {
    const res = await axios.get(
      `https://data.brreg.no/enhetsregisteret/api/enheter/${orgnr}`,
      { timeout: 8000 }
    )
    const enhet: BrregEnhet = res.data
    cacheSet(key, enhet)
    return enhet
  } catch (err) {
    console.error(`Brreg feil for ${orgnr}:`, err)
    return null
  }
}

export async function hentRegnskapsdata(orgnr: string): Promise<RegnskapData | null> {
  const key = `regnskap_${orgnr}`
  const cached = cacheGet<RegnskapData>(key)
  if (cached) return cached

  try {
    const res = await axios.get(
      `https://data.regnskapsregisteret.brreg.no/regnskap?orgNummer=${orgnr}`,
      { timeout: 8000 }
    )
    const records = res.data?._embedded?.regnskap
    if (!records?.length) return null

    const sorterte = records.sort((a: any, b: any) =>
      (b.regnskapsperiode?.fraDato || '').localeCompare(a.regnskapsperiode?.fraDato || '')
    )

    const siste = sorterte[0]

    const historikk: HistoriskRegnskap[] = sorterte
      .slice(0, 4)
      .map((r: any) => ({
        aar: r.regnskapsperiode?.fraDato ? new Date(r.regnskapsperiode.fraDato).getFullYear() : 0,
        omsetning: r.resultatregnskapResultat?.driftsresultat?.driftsinntekter?.sumDriftsinntekter ?? 0,
      }))
      .filter((r: HistoriskRegnskap) => r.aar > 0 && r.omsetning > 0)
      .sort((a: HistoriskRegnskap, b: HistoriskRegnskap) => a.aar - b.aar)

    const data: RegnskapData = {
      aaretsResultat: siste.resultatregnskapResultat?.aarsresultat?.sumAarsresultat,
      sumDriftsInntekter: siste.resultatregnskapResultat?.driftsresultat?.driftsinntekter?.sumDriftsinntekter,
      aar: siste.regnskapsperiode?.fraDato
        ? new Date(siste.regnskapsperiode.fraDato).getFullYear()
        : undefined,
      historikk,
    }
    cacheSet(key, data)
    return data
  } catch {
    return null
  }
}

export function finnBransjeKey(naceKode: string | undefined, bransjer: Record<string, any>): string | null {
  if (!naceKode) return null
  const kodeUten = naceKode.replace('.', '')
  for (const [key, bransje] of Object.entries(bransjer)) {
    for (const kode of bransje.nace_koder) {
      if (kodeUten.startsWith(kode.replace('.', ''))) return key
    }
  }
  return null
}

export function formaterOrgnr(orgnr: string): string {
  const clean = orgnr.replace(/\s/g, '')
  return clean.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3')
}
