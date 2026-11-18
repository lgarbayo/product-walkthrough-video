#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 Luis Garbayo Fernández <lugarbayo@gmail.com>
// SPDX-License-Identifier: MIT
// product-walkthrough-video voice: one voice-over clip per scene from the `voice` text of video/video.json,
// with ElevenLabs (the user's account) and character timings, so compose.mjs cues the screen to the words.
// Copy it into the project as video/voice.mjs.
//
//   node video/voice.mjs video/video.json [--out video/out] [--only id1,id2] [--dry-run] [--estimate]
//
// Environment (never in the repo, never printed):
//   ELEVENLABS_API_KEY   the user's API key
//   ELEVENLABS_VOICE_ID  optional: the voice to use; without it, video.json voice.name is looked up among the
//                        account's voices (GET /v1/voices; exact name, then name prefix, e.g. "George")
//   ELEVENLABS_MODEL_ID  optional, overrides video.json voice.model (default eleven_multilingual_v2)
//
// Outputs in --out/vo: <id>.mp3 and <id>.json ({mode, hash, text, duration, alignment}).
// A clip is generated again only when its text or voice settings change (the hash), so re-runs spend no credits.
// --dry-run prints what would be generated and the characters it would bill.
// --estimate (or no API key) writes timings at the script's pace (~145 wpm) and no audio: compose.mjs then cuts a silent draft.
// Without a key, clips already generated for the same text are kept, never replaced by estimates.
// Exit codes: 0 ok, 1 some clips failed, 2 bad input, 4 API key or voice id missing (estimates written).
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const argv = process.argv.slice(2)
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d }
const flag = n => argv.includes(`--${n}`)
const file = argv.find(a => !a.startsWith('--') && a.endsWith('.json'))
if (!file) { console.error('usage: node voice.mjs <video.json> [--out dir] [--only a,b] [--dry-run] [--estimate]'); process.exit(64) }
const spec = JSON.parse(fs.readFileSync(file, 'utf8'))
const OUT = path.resolve(opt('out', path.join(path.dirname(path.resolve(file)), 'out')))
const VO = path.join(OUT, 'vo')
const ONLY = (opt('only', '') || '').split(',').filter(Boolean)
const V = spec.voice || {}
const WPM = V.wpm || 145
const KEY = process.env.ELEVENLABS_API_KEY || ''
let VOICE = process.env.ELEVENLABS_VOICE_ID || ''
const MODEL = process.env.ELEVENLABS_MODEL_ID || V.model || 'eleven_multilingual_v2'
const API = (process.env.ELEVENLABS_API_BASE || 'https://api.elevenlabs.io').replace(/\/$/, '')
const log = (...a) => console.log('[voice]', ...a)
const sleep = ms => new Promise(r => setTimeout(r, ms))

const scenes = (spec.scenes || []).filter(s => s.voice && String(s.voice).trim())
if (!scenes.length) { console.error('[voice] no scene has a "voice" text'); process.exit(2) }
// Defaults: the settings of the reference video's voice-over (references/format.md).
const settings = {
  stability: V.stability ?? 0.55,
  similarity_boost: V.similarity ?? 0.8,
  style: V.style ?? 0.12,
  use_speaker_boost: V.speakerBoost ?? true,
  speed: V.speed ?? 1,
}
let voiceTag = 'none'
const tagOf = id => crypto.createHash('sha256').update(id).digest('hex').slice(0, 8)
const hashOf = text => crypto.createHash('sha256').update(JSON.stringify([text, voiceTag, MODEL, settings, V.language || ''])).digest('hex').slice(0, 16)

// Timings at the script's pace: words spread at WPM, a short rest after sentence ends and commas.
function estimate(text) {
  const chars = [...text], starts = [], ends = []
  const perWord = 60 / WPM
  let t = 0
  const words = text.split(/(\s+)/)
  for (const w of words) {
    if (!w) continue
    if (/^\s+$/.test(w)) { for (const c of w) { starts.push(t); ends.push(t) } continue }
    const d = perWord * Math.max(0.6, Math.min(2.2, w.replace(/[^\p{L}\p{N}]/gu, '').length / 5))
    const n = [...w].length
    for (let k = 0; k < n; k++) { starts.push(t + (d * k) / n); ends.push(t + (d * (k + 1)) / n) }
    t += d + (/[.!?]$/.test(w) ? 0.35 : /[,;:]$/.test(w) ? 0.15 : 0)
  }
  return { characters: chars, character_start_times_seconds: starts, character_end_times_seconds: ends, duration: +t.toFixed(3) }
}

async function tts(scene, prev, next) {
  const body = { text: scene.voice, model_id: MODEL, voice_settings: settings }
  if (V.language) body.language_code = V.language
  if (V.seed !== undefined) body.seed = V.seed
  // Continuity with the previous clip (same intonation as one read). next_text only with continuity: "both":
  // it makes the model start the next clip's first word at the end of this one, cut off mid-sound.
  if (V.continuity !== false) { if (prev) body.previous_text = prev; if (next && V.continuity === 'both') body.next_text = next }
  const url = `${API}/v1/text-to-speech/${encodeURIComponent(VOICE)}/with-timestamps?output_format=${V.format || 'mp3_44100_128'}`
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { method: 'POST', headers: { 'xi-api-key': KEY, 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body) })
    if (res.ok) return res.json()
    const detail = (await res.text()).slice(0, 400).replace(KEY, '***')
    if ((res.status === 429 || res.status >= 500) && attempt < 3) { log(`${scene.id}: HTTP ${res.status}, retrying`); await sleep(4000 * attempt); continue }
    const err = new Error(`HTTP ${res.status}: ${detail}`)
    err.status = res.status
    throw err
  }
}

async function credits() {
  try {
    const r = await fetch(`${API}/v1/user/subscription`, { headers: { 'xi-api-key': KEY } })
    if (!r.ok) return null
    const j = await r.json()
    return { used: j.character_count, limit: j.character_limit, resets: j.next_character_count_reset_unix }
  } catch { return null }
}

// The voice by name among the account's voices; the id is never printed or written.
async function resolveVoice() {
  if (VOICE || !KEY || !V.name) return
  const r = await fetch(`${API}/v1/voices`, { headers: { 'xi-api-key': KEY } })
  if (!r.ok) { console.error(`[voice] cannot list voices (HTTP ${r.status}); set ELEVENLABS_VOICE_ID`); return }
  const voices = (await r.json()).voices || []
  const want = V.name.toLowerCase()
  const hit = voices.find(v => v.name.toLowerCase() === want) || voices.find(v => v.name.toLowerCase().startsWith(want))
  if (!hit) { console.error(`[voice] no voice named "${V.name}" in this account (${voices.length} voices); set ELEVENLABS_VOICE_ID`); return }
  VOICE = hit.voice_id
  log(`voice "${hit.name}" (${hit.category || 'voice'})`)
}

async function main() {
  fs.mkdirSync(VO, { recursive: true })
  if (!flag('estimate')) await resolveVoice()
  voiceTag = VOICE ? tagOf(VOICE) : 'none'
  const live = KEY && VOICE && !flag('estimate')
  if (!flag('estimate') && (!KEY || !VOICE)) console.error(`[voice] ${!KEY ? 'ELEVENLABS_API_KEY is not set' : 'no voice (ELEVENLABS_VOICE_ID or voice.name)'}: writing estimated timings, no audio`)
  const todo = []
  scenes.forEach((s, i) => {
    if (ONLY.length && !ONLY.includes(s.id)) return
    const jf = path.join(VO, `${s.id}.json`)
    const h = hashOf(s.voice)
    const old = fs.existsSync(jf) ? JSON.parse(fs.readFileSync(jf, 'utf8')) : null
    const fresh = old && old.hash === h && old.mode === 'elevenlabs' && fs.existsSync(path.join(VO, `${s.id}.mp3`))
    if (fresh && !flag('force')) { log(`${s.id}: up to date (${old.duration}s)`); return }
    // Without a key, never replace a paid clip whose text is unchanged (the voice settings cannot be checked).
    if (!live && old && old.mode === 'elevenlabs' && old.text === s.voice && fs.existsSync(path.join(VO, `${s.id}.mp3`))) { log(`${s.id}: kept the generated clip (no key to check its voice)`); return }
    todo.push({ s, i, h, jf })
  })
  const chars = todo.reduce((n, t) => n + t.s.voice.length, 0)
  if (flag('dry-run')) {
    for (const t of todo) log(`${t.s.id}: ${t.s.voice.length} chars, ~${estimate(t.s.voice).duration}s`)
    log(`${todo.length} clip(s), ${chars} characters to bill${live ? '' : ' (no key: estimates only)'}`)
    return 0
  }
  if (live && todo.length) {
    const c = await credits()
    log(`generating ${todo.length} clip(s), ${chars} characters with ${MODEL}${c ? `; account: ${c.used}/${c.limit} characters used this period` : ''}`)
    if (c && c.limit - c.used < chars) { console.error(`[voice] not enough credits: ${c.limit - c.used} left, ${chars} needed`); return 1 }
  }
  let failed = 0
  for (const { s, i, h, jf } of todo) {
    if (!live) {
      const est = estimate(s.voice)
      fs.writeFileSync(jf, JSON.stringify({ mode: 'estimate', hash: h, text: s.voice, duration: est.duration, alignment: { characters: est.characters, character_start_times_seconds: est.character_start_times_seconds, character_end_times_seconds: est.character_end_times_seconds } }))
      log(`${s.id}: estimate ${est.duration}s`)
      continue
    }
    try {
      const prev = scenes[i - 1]?.voice, next = scenes[i + 1]?.voice
      const j = await tts(s, prev, next)
      const mp3 = path.join(VO, `${s.id}.mp3`)
      fs.writeFileSync(mp3, Buffer.from(j.audio_base64, 'base64'))
      const al = j.alignment || j.normalized_alignment
      const ends = al?.character_end_times_seconds || []
      const duration = +(ends.length ? ends[ends.length - 1] : estimate(s.voice).duration).toFixed(3)
      fs.writeFileSync(jf, JSON.stringify({ mode: 'elevenlabs', hash: h, model: MODEL, voice: voiceTag, text: s.voice, duration, alignment: al }))
      log(`${s.id}: ${duration}s, ${s.voice.length} chars`)
    } catch (e) {
      failed++
      console.error(`[voice] ${s.id} FAILED: ${e.message}`)
      if (e.status === 401 || e.status === 403) { console.error('[voice] the key was rejected (or lacks text-to-speech permission); stopping'); break }
    }
  }
  if (!live && !flag('estimate')) return 4
  return failed ? 1 : 0
}

main().then(code => process.exit(code)).catch(e => { console.error(`[voice] ${e.message}`); process.exit(2) })
