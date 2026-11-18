#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 Luis Garbayo Fernández <lugarbayo@gmail.com>
// SPDX-License-Identifier: MIT
// product-walkthrough-video music finder: a track for the optional music bed, either a file already on this machine or
// a Creative Commons track found and downloaded through the Openverse API (https://api.openverse.org, no key needed).
//
//   node find-music.mjs local [--dirs a,b] [--min 120]
//        lists audio files in ~/Música, ~/Music, ~/Descargas, ~/Downloads (or --dirs), with their length
//   node find-music.mjs search "<one to three words>" [--min 150] [--license cc0,by] [--n 8] [--page 1]
//        searches music; prints id, title, author, licence, length and the page where a person can listen to it
//   node find-music.mjs get <openverse-id> [--out video/music]
//        downloads that track, appends its attribution to <out>/CREDITS.md and prints the `music` block for video.json
//
// Licences. Putting music under a video in timed relation is an adaptation under Creative Commons, so ND (no
// derivatives) never fits; NC rules out commercial use; SA would make the whole video BY-SA. The default is therefore
// cc0,by (CC0 and CC BY); pdm (public domain mark) can be added. CC BY needs the attribution that `get` writes: put it in
// the video description. Openverse aggregates other sites (mostly Jamendo and Freesound): the licence it reports is the
// source's, and a person should check the track's page before publishing.
// Search tip: Openverse matches every word, so one to three words find far more than a long phrase ("ambient piano",
// "lofi", "corporate", "acoustic guitar"). Exit codes: 0 ok, 1 nothing found or a download failed, 2 bad input.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const API = 'https://api.openverse.org/v1/audio/'
const UA = { 'User-Agent': 'product-walkthrough-video/0.1 (music finder)' }
const argv = process.argv.slice(2)
const cmd = argv[0]
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const mmss = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`
const probe = f => { const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }); return r.status === 0 ? +r.stdout.trim() : NaN }

async function api(url) {
  for (let i = 0; i < 4; i++) {
    const res = await fetch(url, { headers: UA })
    const text = await res.text()
    if (res.ok) { try { return JSON.parse(text) } catch { /* an HTML throttle page */ } }
    if (res.status === 404) throw new Error('not found on Openverse')
    // anonymous requests: 20 a minute, 200 a day, at most 20 results a page. Retry only when throttled or down.
    if (res.status !== 429 && res.status < 500) throw new Error(`Openverse said HTTP ${res.status}: ${text.slice(0, 200)}`)
    await sleep(4000 * (i + 1))
  }
  throw new Error('Openverse did not answer (rate limited or down); wait a minute and try again')
}

async function local() {
  const home = os.homedir()
  const dirs = (opt('dirs') || ['Música', 'Music', 'Descargas', 'Downloads'].map(d => path.join(home, d)).join(',')).split(',')
  const min = +opt('min', 0)
  const found = []
  const walk = (d, depth) => {
    let entries = []
    try { entries = fs.readdirSync(d, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      const p = path.join(d, e.name)
      if (e.isDirectory() && depth < 3 && !e.name.startsWith('.') && e.name !== 'node_modules') walk(p, depth + 1)
      else if (e.isFile() && /\.(mp3|wav|m4a|aac|ogg|flac|opus)$/i.test(e.name)) found.push(p)
    }
  }
  dirs.forEach(d => walk(d, 0))
  const rows = found.map(f => ({ f, s: probe(f) })).filter(r => r.s >= min && r.s >= 20).sort((a, b) => b.s - a.s)
  if (!rows.length) { console.log('no audio files of 20 s or more in', dirs.join(', ')); return 1 }
  for (const r of rows) console.log(`${mmss(r.s).padStart(6)}  ${r.f}`)
  console.log(`\n${rows.length} file(s). Voice notes and voice-overs show up here too: ask which one is music, and whether it may be published.`)
  return 0
}

async function search() {
  const q = argv[1]
  if (!q || q.startsWith('--')) { console.error('usage: find-music.mjs search "<words>" [--min s] [--license cc0,by] [--n 8]'); return 2 }
  const min = +opt('min', 0), n = +opt('n', 8)
  const params = new URLSearchParams({ q, license: opt('license', 'cc0,by'), category: 'music', page_size: '20', page: opt('page', '1') })
  const d = await api(`${API}?${params}`)
  const rows = (d.results || []).filter(r => !min || (r.duration || 0) / 1000 >= min).slice(0, n)
  if (!rows.length) { console.log(`nothing for "${q}"${min ? ` of ${min} s or more` : ''} (${d.result_count || 0} results before the length filter). Try fewer or other words, or --min lower and loop-music.mjs.`); return 1 }
  for (const r of rows) {
    console.log(`${r.id}\n   ${r.title} · ${r.creator || 'unknown'} · CC ${r.license.toUpperCase()} ${r.license_version || ''} · ${mmss((r.duration || 0) / 1000)} · ${r.source}`)
    console.log(`   listen: ${r.foreign_landing_url}`)
  }
  console.log(`\n${rows.length} shown of ${d.result_count} result(s). Download one with: find-music.mjs get <id> --out video/music`)
  return 0
}

async function get() {
  const id = argv[1]
  if (!id || id.startsWith('--')) { console.error('usage: find-music.mjs get <openverse-id> [--out dir]'); return 2 }
  const out = path.resolve(opt('out', 'video/music'))
  const r = await api(`${API}${encodeURIComponent(id)}/`)
  if (['nd', 'by-nd', 'by-nc-nd'].includes(r.license)) console.error(`warning: CC ${r.license.toUpperCase()} forbids adaptations; putting it under a video is one`)
  if (r.license.includes('nc')) console.error(`warning: CC ${r.license.toUpperCase()} forbids commercial use`)
  if (r.license.includes('sa')) console.error(`warning: CC ${r.license.toUpperCase()} would make the video itself ${r.license.toUpperCase()}`)
  fs.mkdirSync(out, { recursive: true })
  const slug = `${r.title || r.id}-${r.creator || ''}`.normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').toLowerCase().slice(0, 60) || r.id
  const ft = String(r.filetype || 'mp3').toLowerCase()
  const ext = /^mp3/.test(ft) ? 'mp3' : (ft.match(/^[a-z]+/)?.[0] || 'mp3') // Jamendo reports "mp32"
  const file = path.join(out, `${slug}.${ext}`)
  const res = await fetch(r.url, { headers: UA, redirect: 'follow' })
  if (!res.ok) { console.error(`download failed: HTTP ${res.status} for ${r.url}`); return 1 }
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()))
  const secs = probe(file)
  if (!(secs > 0)) { fs.rmSync(file, { force: true }); console.error('the download is not playable audio'); return 1 }
  const credits = path.join(out, 'CREDITS.md')
  const line = `- \`${path.basename(file)}\`: ${r.attribution || `"${r.title}" by ${r.creator}, CC ${r.license.toUpperCase()} ${r.license_version || ''}`} Source: ${r.foreign_landing_url}\n`
  const prev = fs.existsSync(credits) ? fs.readFileSync(credits, 'utf8') : '# Music credits\n\nPut these lines in the video description (CC BY requires attribution).\n\n'
  if (!prev.includes(path.basename(file))) fs.writeFileSync(credits, prev + line)
  console.log(`saved ${file} (${mmss(secs)}, CC ${r.license.toUpperCase()} ${r.license_version || ''})`)
  console.log(`credits -> ${credits}`)
  console.log(`\nvideo.json:\n  "music": { "src": "music/${path.basename(file)}" }`)
  return 0
}

const run = { local, search, get }[cmd]
if (!run) { console.error('usage: find-music.mjs local | search "<words>" | get <id>   (see the header of this file)'); process.exit(2) }
run().then(c => process.exit(c), e => { console.error(`[music] ${e.message}`); process.exit(1) })
