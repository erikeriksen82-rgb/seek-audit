import express from 'express'
import path from 'path'
import dotenv from 'dotenv'
import { kjorAudit } from './lib/rapport'
import { renderRapport } from './lib/render'
import { genererPDF } from './lib/pdf'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3000
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY
const SERP_API_KEY = process.env.SERP_API_KEY

app.use(express.static(path.join(process.cwd(), 'public')))
app.use(express.json())

// Hoved-audit route — kjør og vis rapport
app.get('/rapport/:orgnr', async (req, res) => {
  const { orgnr } = req.params
  const bustCache = req.query.refresh === '1'
  const manuellUrl = req.query.url ? String(req.query.url) : undefined

  if (!/^\d{9}$/.test(orgnr.replace(/\s/g, ''))) {
    return res.status(400).send('Ugyldig org.nr — må være 9 siffer')
  }

  try {
    console.log(`Kjører audit for ${orgnr}${manuellUrl ? ` (manuell URL: ${manuellUrl})` : ''}...`)
    const data = await kjorAudit(orgnr.replace(/\s/g, ''), GOOGLE_API_KEY, bustCache, manuellUrl, SERP_API_KEY)
    const html = renderRapport(data)
    res.send(html)
  } catch (err: any) {
    console.error(err)
    res.status(500).send(`<pre>Feil: ${err.message}</pre>`)
  }
})

// PDF-nedlasting
app.get('/pdf/:orgnr', async (req, res) => {
  const { orgnr } = req.params

  try {
    const data = await kjorAudit(orgnr.replace(/\s/g, ''), GOOGLE_API_KEY, false, undefined, SERP_API_KEY)
    const html = renderRapport(data)
    const pdf = await genererPDF(html)

    const navn = data.brreg?.navn?.replace(/[^a-zA-Z0-9æøåÆØÅ]/g, '-') || orgnr
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="SEEK-rapport-${navn}.pdf"`)
    res.send(pdf)
  } catch (err: any) {
    console.error(err)
    res.status(500).send(`Feil ved PDF-generering: ${err.message}`)
  }
})

// API-endepunkt (for debugging og fremtidig bruk)
app.get('/api/audit/:orgnr', async (req, res) => {
  try {
    const data = await kjorAudit(req.params.orgnr, GOOGLE_API_KEY)
    res.json(data)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// Navnesøk mot Brreg
app.get('/api/sok', async (req, res) => {
  const q = String(req.query.q || '').trim()
  if (!q) return res.json([])
  try {
    const axios = (await import('axios')).default
    const r = await axios.get('https://data.brreg.no/enhetsregisteret/api/enheter', {
      params: { navn: q, size: 5 },
      timeout: 5000,
    })
    const treff = (r.data?._embedded?.enheter || []).map((e: any) => ({
      orgnr: e.organisasjonsnummer,
      navn: e.navn,
      poststed: e.forretningsadresse?.poststed || '',
      bransje: e.naeringskode1?.beskrivelse || '',
    }))
    res.json(treff)
  } catch {
    res.json([])
  }
})

// Helse-sjekk
app.get('/health', (_, res) => res.json({ ok: true, timestamp: new Date().toISOString() }))

app.listen(PORT, () => {
  console.log(`\n  SEEK Audit kjører på http://localhost:${PORT}\n`)
})
