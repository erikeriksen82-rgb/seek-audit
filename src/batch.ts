import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import { kjorAudit } from './lib/rapport'
import { renderRapport } from './lib/render'
import { genererPDF } from './lib/pdf'

dotenv.config()

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY
const SERP_API_KEY = process.env.SERP_API_KEY
const INPUT_FILE = process.argv[2] || 'data/input/leads.csv'
const OUTPUT_DIR = path.join('data', 'output', new Date().toISOString().slice(0, 10))

async function kjorBatch() {
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`Finner ikke inputfil: ${INPUT_FILE}`)
    process.exit(1)
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true })

  const innhold = fs.readFileSync(INPUT_FILE, 'utf-8')
  const linjer = innhold.split('\n').map(l => l.trim()).filter(Boolean)

  // Hopp over header-rad hvis første felt ikke er et org.nr
  const start = /^\d{9}/.test(linjer[0]?.replace(/\s/g, '')) ? 0 : 1
  const orgnumre = linjer.slice(start).map(l => l.split(/[,;]/)[0].replace(/\s/g, '').trim()).filter(o => /^\d{9}$/.test(o))

  console.log(`\n  SEEK Batch — ${orgnumre.length} bedrifter\n`)

  const resultater: { orgnr: string; navn: string; score: number; label: string; tap: number; status: string }[] = []

  for (let i = 0; i < orgnumre.length; i++) {
    const orgnr = orgnumre[i]
    process.stdout.write(`  [${i + 1}/${orgnumre.length}] ${orgnr} ... `)

    try {
      const data = await kjorAudit(orgnr, GOOGLE_API_KEY, false, undefined, SERP_API_KEY)
      const html = renderRapport(data)
      const pdf = await genererPDF(html)

      const navn = data.brreg?.navn?.replace(/[^a-zA-Z0-9æøåÆØÅ]/g, '-') || orgnr
      const filnavn = path.join(OUTPUT_DIR, `${navn}-${orgnr}.pdf`)
      fs.writeFileSync(filnavn, pdf)

      resultater.push({
        orgnr,
        navn: data.brreg?.navn || orgnr,
        score: data.score.total,
        label: data.score.label,
        tap: data.marginTap.total,
        status: 'ok',
      })

      console.log(`${data.score.label} (${data.score.total}) — ${Math.round(data.marginTap.total / 1000)}k kr`)
    } catch (err: any) {
      console.log(`FEIL: ${err.message}`)
      resultater.push({ orgnr, navn: orgnr, score: 0, label: 'FEIL', tap: 0, status: err.message })
    }

    // Kort pause mellom kall for å unngå rate-limiting
    if (i < orgnumre.length - 1) await sleep(800)
  }

  // Skriv sammendrag
  const sammendrag = ['orgnr,navn,score,label,estimert_tap_kr,status']
    .concat(resultater.map(r => `${r.orgnr},"${r.navn}",${r.score},${r.label},${r.tap},${r.status}`))
    .join('\n')

  const sammendragFil = path.join(OUTPUT_DIR, '_sammendrag.csv')
  fs.writeFileSync(sammendragFil, sammendrag, 'utf-8')

  const hetLeads = resultater.filter(r => r.label === 'HET LEAD').length
  const varmLeads = resultater.filter(r => r.label === 'VARM LEAD').length

  console.log(`\n  Ferdig. ${hetLeads} hete leads, ${varmLeads} varme leads.`)
  console.log(`  PDF-er lagret i: ${OUTPUT_DIR}`)
  console.log(`  Sammendrag: ${sammendragFil}\n`)
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

kjorBatch().catch(console.error)
