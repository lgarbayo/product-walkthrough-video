#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 Luis Garbayo Fernández <lugarbayo@gmail.com>
// SPDX-License-Identifier: MIT
// product-walkthrough-video voice: one voice-over clip per scene from the `voice` text of video/video.json, with
// timings per character, so compose.mjs cues the screen to the words. Copy it into the project as video/voice.mjs.
//
//   node video/voice.mjs video/video.json [--provider elevenlabs|kokoro|recorded|none] [--out video/out]
//        [--only id1,id2] [--dry-run] [--force] [--estimate]
//
// Providers (video.json voice.provider, or --provider; default elevenlabs). The user chooses one:
//   elevenlabs  the most natural voice, billed to the user's own ElevenLabs account. ElevenLabs returns the timings.
//   kokoro      free and local: Kokoro-82M through `hyperframes tts`. Needs Python with kokoro-onnx and soundfile
//               ($HYPERFRAMES_PYTHON points at it); the first run downloads the model. Timings come from transcribing
//               each clip (`hyperframes transcribe`, Whisper, local).
//   recorded    the user's own voice: one recording per scene in <video.json dir>/<voice.takes or "vo-takes">/<id>.*
//               (wav, m4a, mp3, ogg, flac or webm). Without them, READ.md is written there with the text of each
//               scene to read. Head and tail silence are trimmed; timings come from transcribing.
//   none        no audio: timings at the script's pace (~145 wpm), and compose.mjs cuts a silent draft (--estimate).
//
// Environment (never in the repo, never printed):
//   ELEVENLABS_API_KEY   the user's API key (provider elevenlabs)
//   ELEVENLABS_VOICE_ID  optional: the voice to use; without it, video.json voice.name is looked up among the
//                        account's voices (GET /v1/voices; exact name, then name prefix, e.g. "George")
//   ELEVENLABS_MODEL_ID  optional, overrides video.json voice.model (default eleven_multilingual_v2)
//   HYPERFRAMES_PYTHON   a Python with kokoro-onnx and soundfile (provider kokoro)
//   HYPERFRAMES_VERSION, HYPERFRAMES_CLI   the HyperFrames used for tts and transcribe (as in compose.mjs)
//
// Outputs in --out/vo: <id>.mp3 or <id>.wav and <id>.json ({mode, hash, text, duration, alignment, audio}).
// A clip is made again only when its text, provider or voice settings change (the hash), or the recording changes.
// --dry-run prints what would be made and, for ElevenLabs, the characters it would bill.
// Without an ElevenLabs key, clips already generated for the same text are kept, never replaced by estimates.
// Exit codes: 0 ok, 1 some clips failed, 2 bad input, 4 the provider is not ready (no key, no voice, no Python for
// Kokoro, or recordings missing): estimated timings are written for the missing clips.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'

const argv = process.argv.slice(2)
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d }
const flag = n => argv.includes(`--${n}`)
const file = argv.find(a => !a.startsWith('--') && a.endsWith('.json'))
if (!file) { console.error('usage: node voice.mjs <video.json> [--provider elevenlabs|kokoro|recorded|none] [--out dir] [--only a,b] [--dry-run] [--force] [--estimate]'); process.exit(64) }
const spec = JSON.parse(fs.readFileSync(file, 'utf8'))
const SPEC_DIR = path.dirname(path.resolve(file))
const OUT = path.resolve(opt('out', path.join(SPEC_DIR, 'out')))
const VO = path.join(OUT, 'vo')
const ONLY = (opt('only', '') || '').split(',').filter(Boolean)
const V = spec.voice || {}
const PROVIDER = flag('estimate') ? 'none' : (opt('provider') || V.provider || 'elevenlabs')
if (!['elevenlabs', 'kokoro', 'recorded', 'none'].includes(PROVIDER)) { console.error(`[voice] unknown provider "${PROVIDER}" (elevenlabs, kokoro, recorded, none)`); process.exit(2) }
const LANG = String(V.language || spec.language || 'en').toLowerCase()
const WPM = V.wpm || 145
const KEY = process.env.ELEVENLABS_API_KEY || ''
let VOICE = process.env.ELEVENLABS_VOICE_ID || ''
const MODEL = process.env.ELEVENLABS_MODEL_ID || V.model || 'eleven_multilingual_v2'
const API = (process.env.ELEVENLABS_API_BASE || 'https://api.elevenlabs.io').replace(/\/$/, '')
const HF_VERSION = process.env.HYPERFRAMES_VERSION || '0.8.216'
// Kokoro: a British male voice like the reference's by default; Spanish gets Kokoro's Spanish voice.
const KOKORO_VOICE = V.kokoroVoice || (LANG.startsWith('es') ? 'ef_dora' : 'bm_george')
const KOKORO_SPEED = V.kokoroSpeed ?? V.speed ?? 1
const TAKES = path.resolve(SPEC_DIR, V.takes || 'vo-takes')
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
const sha = x => crypto.createHash('sha256').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex')
const tagOf = id => sha(id).slice(0, 8)
const hashOf = (text, extra = '') => sha([text, PROVIDER, PROVIDER === 'elevenlabs' ? [voiceTag, MODEL, settings] : PROVIDER === 'kokoro' ? [KOKORO_VOICE, KOKORO_SPEED] : [], V.language || '', extra]).slice(0, 16)
const probe = f => { const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }); return r.status === 0 ? +r.stdout.trim() : NaN }
const hf = (args, env = {}) => {
  const cli = process.env.HYPERFRAMES_CLI ? ['node', [process.env.HYPERFRAMES_CLI]] : ['npx', ['--yes', `hyperframes@${HF_VERSION}`]]
  return spawnSync(cli[0], [...cli[1], ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, DO_NOT_TRACK: '1', HYPERFRAMES_NO_TELEMETRY: '1', ...env } })
}
const lastJson = out => { const lines = String(out || '').trim().split('\n').reverse(); for (const l of lines) { try { return JSON.parse(l) } catch { /* progress or log line */ } } return null }

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

// Character timings from a word-level transcript: the script's words are matched to the transcribed ones (longest
// common subsequence on normalised words), and words the transcript spells differently ("thirty-seven" -> "37") get
// times interpolated between their matched neighbours, in proportion to their length.
const norm = w => w.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]/gu, '')
function align(text, words, duration) {
  const toks = [...text.matchAll(/\S+/g)].map(m => ({ i: m.index, j: m.index + m[0].length, n: norm(m[0]) }))
  const tw = words.map(w => ({ ...w, n: norm(w.text) })).filter(w => w.n)
  const A = toks.length, B = tw.length
  const L = Array.from({ length: A + 1 }, () => new Int32Array(B + 1))
  for (let a = A - 1; a >= 0; a--) for (let b = B - 1; b >= 0; b--) L[a][b] = toks[a].n && toks[a].n === tw[b].n ? L[a + 1][b + 1] + 1 : Math.max(L[a + 1][b], L[a][b + 1])
  for (let a = 0, b = 0; a < A && b < B;) {
    if (toks[a].n && toks[a].n === tw[b].n) { toks[a].s = tw[b].start; toks[a].e = tw[b].end; a++; b++ }
    else if (L[a + 1][b] >= L[a][b + 1]) a++
    else b++
  }
  const matched = toks.filter(t => t.s !== undefined).length
  // fill the gaps between matched words
  for (let a = 0; a < A;) {
    if (toks[a].s !== undefined) { a++; continue }
    let z = a; while (z < A && toks[z].s === undefined) z++
    const from = a > 0 ? toks[a - 1].e : 0, to = z < A ? toks[z].s : duration
    const len = toks.slice(a, z).reduce((n, t) => n + (t.j - t.i), 0) || 1
    let t = from
    for (let k = a; k < z; k++) { const d = Math.max(0, to - from) * (toks[k].j - toks[k].i) / len; toks[k].s = t; toks[k].e = t + d; t += d }
    a = z
  }
  const n = text.length, starts = new Array(n), ends = new Array(n)
  let k = 0, last = 0
  for (const t of toks) {
    for (; k < t.i; k++) { starts[k] = last; ends[k] = last }
    for (; k < t.j; k++) { const f = (k - t.i) / (t.j - t.i), g = (k + 1 - t.i) / (t.j - t.i); starts[k] = t.s + (t.e - t.s) * f; ends[k] = t.s + (t.e - t.s) * g }
    last = t.e
  }
  for (; k < n; k++) { starts[k] = last; ends[k] = last }
  return { alignment: { characters: text.split(''), character_start_times_seconds: starts.map(x => +x.toFixed(3)), character_end_times_seconds: ends.map(x => +x.toFixed(3)) }, matched, total: A }
}

function transcribe(audio) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pwv-tr-'))
  try {
    const model = V.whisperModel || (LANG.startsWith('en') ? 'small.en' : 'small')
    const r = hf(['transcribe', audio, '--json', '-l', LANG.slice(0, 2), '-m', model, '-d', dir])
    const tf = path.join(dir, 'transcript.json')
    if (r.status !== 0 || !fs.existsSync(tf)) throw new Error(`hyperframes transcribe failed: ${(lastJson(r.stdout)?.error?.message || r.stderr || '').toString().slice(-300)}`)
    const words = JSON.parse(fs.readFileSync(tf, 'utf8'))
    return Array.isArray(words) ? words : words.words || []
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
}

function timed(scene, audio, h, extra = {}) {
  const duration = +probe(audio).toFixed(3)
  const words = transcribe(audio)
  const { alignment, matched, total } = align(scene.voice, words, duration)
  if (matched < total * 0.5) console.error(`[voice] ${scene.id}: only ${matched} of ${total} words matched the transcript; check that the clip reads this scene's text (language "${LANG}")`)
  return { mode: PROVIDER, hash: h, text: scene.voice, duration, alignment, audio: path.basename(audio), matched: `${matched}/${total}`, ...extra }
}

// ---------- ElevenLabs ----------
async function elevenlabs(scene, prev, next) {
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

// ---------- Kokoro (local) ----------
function kokoroReady() {
  const py = process.env.HYPERFRAMES_PYTHON || 'python3'
  const r = spawnSync(py, ['-c', 'import kokoro_onnx, soundfile'], { encoding: 'utf8' })
  if (r.status === 0) return true
  console.error(`[voice] Kokoro needs a Python with kokoro-onnx and soundfile (tried ${py}). Make one outside the project, e.g.:\n  uv venv ~/.cache/product-walkthrough-video/kokoro && uv pip install --python ~/.cache/product-walkthrough-video/kokoro/bin/python kokoro-onnx soundfile\nand run with HYPERFRAMES_PYTHON=~/.cache/product-walkthrough-video/kokoro/bin/python`)
  return false
}
function kokoro(scene, h) {
  const wav = path.join(VO, `${scene.id}.wav`)
  const r = hf(['tts', scene.voice, '-v', KOKORO_VOICE, '-s', String(KOKORO_SPEED), '-o', wav, '--json'])
  const j = lastJson(r.stdout)
  if (r.status !== 0 || !j?.ok || !fs.existsSync(wav)) throw new Error(`hyperframes tts failed: ${j?.error?.message || (r.stderr || '').slice(-300)}`)
  return timed(scene, wav, h, { voice: KOKORO_VOICE })
}

// ---------- the user's own recordings ----------
const takeOf = id => { for (const ext of ['wav', 'm4a', 'mp3', 'ogg', 'flac', 'webm', 'aac', 'opus']) { const f = path.join(TAKES, `${id}.${ext}`); if (fs.existsSync(f)) return f } return null }
function writeReadingScript() {
  fs.mkdirSync(TAKES, { recursive: true })
  const lines = ['# Voice-over to record', '', 'Record one file per scene, named exactly as below (wav, m4a, mp3, ogg, flac or webm), in this folder.', 'Read calmly, about 145 words a minute, in a quiet room; leave a second of silence before and after.', '']
  for (const s of scenes) lines.push(`## ${s.id}`, '', s.voice, '')
  fs.writeFileSync(path.join(TAKES, 'READ.md'), lines.join('\n'))
  log(`reading script -> ${path.relative(process.cwd(), path.join(TAKES, 'READ.md'))}`)
}
function recorded(scene, take, h) {
  const wav = path.join(VO, `${scene.id}.wav`)
  // mono 48 kHz, head and tail silence trimmed, so the scene starts on the first word
  const trim = 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.08'
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', take, '-ac', '1', '-ar', '48000', '-af', `${trim},areverse,${trim},areverse`, wav], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`ffmpeg could not read ${take}: ${(r.stderr || '').slice(-200)}`)
  return timed(scene, wav, h, { take: path.relative(SPEC_DIR, take) })
}

async function main() {
  fs.mkdirSync(VO, { recursive: true })
  let ready = true
  if (PROVIDER === 'elevenlabs') {
    await resolveVoice()
    voiceTag = VOICE ? tagOf(VOICE) : 'none'
    if (!KEY || !VOICE) { ready = false; console.error(`[voice] ${!KEY ? 'ELEVENLABS_API_KEY is not set' : 'no voice (ELEVENLABS_VOICE_ID or voice.name)'}: writing estimated timings, no audio`) }
  }
  if (PROVIDER === 'kokoro' && !flag('dry-run')) ready = kokoroReady()
  if (PROVIDER === 'recorded') {
    const missing = scenes.filter(s => (!ONLY.length || ONLY.includes(s.id)) && !takeOf(s.id))
    if (missing.length) { writeReadingScript(); console.error(`[voice] missing recordings in ${path.relative(process.cwd(), TAKES)}: ${missing.map(s => s.id).join(', ')}`) }
  }
  log(`provider: ${PROVIDER}${PROVIDER === 'kokoro' ? ` (${KOKORO_VOICE})` : ''}`)

  const todo = []
  scenes.forEach((s, i) => {
    if (ONLY.length && !ONLY.includes(s.id)) return
    const jf = path.join(VO, `${s.id}.json`)
    const take = PROVIDER === 'recorded' ? takeOf(s.id) : null
    const h = hashOf(s.voice, take ? `${fs.statSync(take).size}:${fs.statSync(take).mtimeMs}` : '')
    const old = fs.existsSync(jf) ? JSON.parse(fs.readFileSync(jf, 'utf8')) : null
    const oldAudio = old && path.join(VO, old.audio || `${s.id}.mp3`)
    const fresh = old && old.hash === h && old.mode === PROVIDER && (PROVIDER === 'none' || fs.existsSync(oldAudio))
    if (fresh && !flag('force')) { log(`${s.id}: up to date (${old.duration}s)`); return }
    // Without a key, never replace a paid clip whose text is unchanged (the voice settings cannot be checked).
    if (PROVIDER === 'elevenlabs' && !ready && old && old.mode === 'elevenlabs' && old.text === s.voice && fs.existsSync(oldAudio)) { log(`${s.id}: kept the generated clip (no key to check its voice)`); return }
    todo.push({ s, i, h, jf, take })
  })
  const chars = todo.reduce((n, t) => n + t.s.voice.length, 0)
  if (flag('dry-run')) {
    for (const t of todo) log(`${t.s.id}: ${t.s.voice.length} chars, ~${estimate(t.s.voice).duration}s${PROVIDER === 'recorded' && !t.take ? ' (no recording yet)' : ''}`)
    log(`${todo.length} clip(s)${PROVIDER === 'elevenlabs' ? `, ${chars} characters to bill to the user's ElevenLabs account${ready ? '' : ' (no key: estimates only)'}` : ', nothing billed'}`)
    return 0
  }
  if (PROVIDER === 'elevenlabs' && ready && todo.length) {
    const c = await credits()
    log(`generating ${todo.length} clip(s), ${chars} characters with ${MODEL}${c ? `; account: ${c.used}/${c.limit} characters used this period` : ''}`)
    if (c && c.limit - c.used < chars) { console.error(`[voice] not enough credits: ${c.limit - c.used} left, ${chars} needed`); return 1 }
  }
  let failed = 0, waiting = 0
  const writeEstimate = ({ s, h, jf }) => {
    const est = estimate(s.voice)
    fs.writeFileSync(jf, JSON.stringify({ mode: 'estimate', hash: PROVIDER === 'none' ? h : 'pending', text: s.voice, duration: est.duration, alignment: { characters: est.characters, character_start_times_seconds: est.character_start_times_seconds, character_end_times_seconds: est.character_end_times_seconds } }))
    log(`${s.id}: estimate ${est.duration}s`)
  }
  for (const t of todo) {
    const { s, i, h, jf, take } = t
    if (PROVIDER === 'none' || !ready || (PROVIDER === 'recorded' && !take)) { writeEstimate(t); if (PROVIDER !== 'none') waiting++; continue }
    try {
      let j
      if (PROVIDER === 'elevenlabs') {
        const r = await elevenlabs(s, scenes[i - 1]?.voice, scenes[i + 1]?.voice)
        fs.writeFileSync(path.join(VO, `${s.id}.mp3`), Buffer.from(r.audio_base64, 'base64'))
        const al = r.alignment || r.normalized_alignment
        const ends = al?.character_end_times_seconds || []
        const duration = +(ends.length ? ends[ends.length - 1] : estimate(s.voice).duration).toFixed(3)
        j = { mode: 'elevenlabs', hash: h, model: MODEL, voice: voiceTag, text: s.voice, duration, alignment: al, audio: `${s.id}.mp3` }
      } else if (PROVIDER === 'kokoro') j = kokoro(s, h)
      else j = recorded(s, take, h)
      fs.writeFileSync(jf, JSON.stringify(j))
      log(`${s.id}: ${j.duration}s${j.matched ? `, ${j.matched} words matched` : `, ${s.voice.length} chars`}`)
    } catch (e) {
      failed++
      console.error(`[voice] ${s.id} FAILED: ${e.message}`)
      if (e.status === 401 || e.status === 403) { console.error('[voice] the key was rejected (or lacks text-to-speech permission); stopping'); break }
    }
  }
  if (waiting) return 4
  return failed ? 1 : 0
}

main().then(code => process.exit(code)).catch(e => { console.error(`[voice] ${e.message}`); process.exit(2) })
