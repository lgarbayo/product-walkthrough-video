#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 Luis Garbayo Fernández <lugarbayo@gmail.com>
// SPDX-License-Identifier: MIT
// product-walkthrough-video composer: turns video/video.json, the voice clips (voice.mjs) and the app recordings
// (record.mjs) into a HyperFrames composition: the fixed walkthrough format (references/format.md) in the
// product's own skin (video.json `theme`: colours, fonts, background, motif, extra CSS). It renders it, and
// writes the YouTube chapter list, the SRT, a contrast check of the skin and a side-by-side board against the
// reference layouts. Copy it into the project as video/compose.mjs.
//
//   node video/compose.mjs video/video.json [--out video/out] [--style-dir <skill>/assets/style]
//        [--no-render] [--only id1,id2] [--quality draft|looks|delivery] [--allow-over] [--no-music]
//
// Needs ffmpeg, and HyperFrames for the render: `npx --yes hyperframes@$HYPERFRAMES_VERSION` (default below; the
// first run downloads it with npm unless it is cached), or $HYPERFRAMES_CLI pointing at its bin/hyperframes.mjs.
// Telemetry is switched off for every HyperFrames call.
//
// Outputs in --out: hf/ (the composition: index.html, fonts/, media/), draft.mp4, captions.srt, chapters.txt,
// frames/<scene>.png (one frame per scene, at the moment every element is on screen), style-board.png
// (each scene next to the reference keyframe of its kind: compare layout and rhythm, not colours), report.json
// (with the theme used and the WCAG contrast of every text token on its surface).
// --only renders just those scenes (a short preview; the timeline keeps their real durations).
// Optional music bed (video.json `music`): mixed after the render and the speech normalization, ducked under
// every voice clip; report.json `music.check` compares the mix with the voice alone under each clip.
// Exit codes: 0 ok, 1 degraded (stills, placeholders, silent), 2 over the time limit, 3 error.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const HF_VERSION = process.env.HYPERFRAMES_VERSION || '0.8.216'
const GSAP_URL = 'https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js'
const argv = process.argv.slice(2)
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d }
const flag = n => argv.includes(`--${n}`)
const file = argv.find(a => !a.startsWith('--') && a.endsWith('.json'))
if (!file) { console.error('usage: node compose.mjs <video.json> [--out dir] [--style-dir dir] [--no-render] [--only a,b] [--quality q]'); process.exit(64) }
const SPEC_DIR = path.dirname(path.resolve(file))
const spec = JSON.parse(fs.readFileSync(file, 'utf8'))
// The skin (references/format.md, "Skin"); see the theme section below.
const THEME = spec.theme || null
const T = THEME || {}
const OUT = path.resolve(opt('out', path.join(SPEC_DIR, 'out')))
const HF = path.join(OUT, 'hf')
// Reference keyframes: --style-dir, $VIDEO_STYLE_DIR, or the skill's assets/style when run from the skill.
const SKILL_STYLE = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'assets', 'style')
const STYLE_DIR = opt('style-dir', process.env.VIDEO_STYLE_DIR || (fs.existsSync(SKILL_STYLE) ? SKILL_STYLE : ''))
const ONLY = (opt('only', '') || '').split(',').filter(Boolean)
const W = 1920, H = 1080, FPS = 30
const V = spec.voice || {}
const LEAD = V.lead ?? 0.4
const PAUSE = V.pause ?? 1.2
const MAX = spec.maxSeconds ?? 180
const MARGIN = spec.marginSeconds ?? 6
const MAX_SPEED = spec.maxSpeed ?? 2
// Each chapter scene may set its own device ("phone" or "browser"), like record.mjs.
const DEFAULT_DEVICE = spec.device || 'phone'
const devOf = s => s.device || DEFAULT_DEVICE
const vpOf = dev => spec.viewports?.[dev] || (dev === DEFAULT_DEVICE && spec.viewport) || (dev === 'phone' ? { width: 390, height: 844 } : { width: 1280, height: 800 })
// Where the app's screen sits in the 1920x1080 frame.
function screenRect(dev) {
  if (dev === 'phone') return { x: 282, y: 72, w: 431, h: 933 }
  const vp = vpOf('browser'), w = 840, h = Math.round(w * vp.height / vp.width)
  return { x: 96, y: Math.round((H - (h + 64)) / 2) + 52, w, h }
}
const warnings = []
const warn = m => { warnings.push(m); console.error(`[compose] ${m}`) }
const log = (...a) => console.log('[compose]', ...a)
const fx = n => (+n).toFixed(3)

function run(bin, args, opts = {}) {
  const r = spawnSync(bin, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, ...opts })
  if (r.error) throw new Error(`${bin}: ${r.error.message}`)
  if (r.status !== 0) throw new Error(`${bin} ${args[0]} failed (${r.status}):\n${((r.stderr || '') + (r.stdout || '')).split('\n').slice(-30).join('\n')}`)
  return r.stdout
}
const probe = f => +run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).trim()

// Voice clips are cleaned before the mix, never cut: same length, so the alignment and the cues hold.
// - A short burst (<= 80 ms) at the very start or end of a clip, cut off from the speech by >= 150 ms of silence,
//   is an artefact of the TTS (with next_text, the onset of the next clip's first word leaks in and is cut
//   mid-sound). It is muted.
// - 10 ms fade-in and 30 ms fade-out on every clip, so no clip starts or stops on a non-zero sample.
// - Written sample by sample as 48 kHz 16-bit WAV: no MP3 encoder padding at either end.
function cleanVoice(src, out) {
  const SR = 48000, FR = 0.005, W = Math.round(SR * FR)
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', src, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 512 * 1024 * 1024 })
  if (r.status !== 0) throw new Error(`ffmpeg could not decode ${src}`)
  const pcm = new Float32Array(r.stdout.buffer, r.stdout.byteOffset, Math.floor(r.stdout.length / 4))
  const db = []
  for (let i = 0; i + W <= pcm.length; i += W) { let e = 0; for (let j = i; j < i + W; j++) e += pcm[j] * pcm[j]; db.push(10 * Math.log10(e / W + 1e-12)) }
  const loud = i => db[i] > -60, len = pcm.length / SR, muted = []
  // tail
  let k = db.length - 1; while (k > 0 && !loud(k)) k--
  let b = k; while (b > 0 && loud(b - 1)) b--
  let g = b - 1; while (g > 0 && !loud(g)) g--
  // mute from the middle of the silent gap to the edge: only silence and the burst are there
  if (k > 0 && (k - b + 1) * FR <= 0.08 && (b - g - 1) * FR >= 0.15) muted.push({ from: +(((g + 1) + (b - g - 1) / 2) * FR).toFixed(3), to: +len.toFixed(3), ms: Math.round((k - b + 1) * FR * 1000), at: 'end' })
  // head
  let f = 0; while (f < db.length && !loud(f)) f++
  let e = f; while (e < db.length - 1 && loud(e + 1)) e++
  let h = e + 1; while (h < db.length && !loud(h)) h++
  if (f < db.length && (e - f + 1) * FR <= 0.08 && (h - e - 1) * FR >= 0.15 && h < db.length) muted.push({ from: 0, to: +(((e + 1) + (h - e - 1) / 2) * FR).toFixed(3), ms: Math.round((e - f + 1) * FR * 1000), at: 'start' })
  // sample-accurate: mutes, then a 10 ms fade-in and a 30 ms fade-out
  const y = new Int16Array(pcm.length), fin = Math.round(0.01 * SR), fout = Math.round(0.03 * SR)
  for (let i = 0; i < pcm.length; i++) {
    const t = i / SR
    let v = muted.some(m => t >= m.from && t <= m.to) ? 0 : pcm[i]
    if (i < fin) v *= i / fin
    if (i > pcm.length - fout) v *= (pcm.length - i) / fout
    y[i] = Math.max(-32768, Math.min(32767, Math.round(v * 32767)))
  }
  const hdr = Buffer.alloc(44)
  hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + y.byteLength, 4); hdr.write('WAVE', 8); hdr.write('fmt ', 12)
  hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(1, 22); hdr.writeUInt32LE(SR, 24); hdr.writeUInt32LE(SR * 2, 28); hdr.writeUInt16LE(2, 32); hdr.writeUInt16LE(16, 34)
  hdr.write('data', 36); hdr.writeUInt32LE(y.byteLength, 40)
  fs.writeFileSync(out, Buffer.concat([hdr, Buffer.from(y.buffer)]))
  return { duration: +len.toFixed(3), muted }
}
// Loudness: measure once, then one constant gain to the target and a peak limiter at -1.5 dBTP. A dynamic
// loudnorm pass rides the gain (audible pumping at the start and the end of the video); this never does.
function loudnorm(file) {
  const target = +(V.lufs ?? -16)
  const measure = f => {
    const m = spawnSync('ffmpeg', ['-hide_banner', '-i', f, '-vn', '-af', `loudnorm=I=${target}:TP=-1.5:LRA=20:print_format=json`, '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    const found = (m.stderr || '').match(/\{[^{}]*"input_i"[^{}]*\}/)
    if (!found) throw new Error('loudnorm: no measurement in the ffmpeg output')
    return JSON.parse(found[0])
  }
  const j = measure(file)
  const gain = +(target - +j.input_i).toFixed(2)
  const tmp = file.replace(/\.mp4$/, '.norm.mp4')
  run('ffmpeg', ['-y', '-v', 'error', '-i', file, '-c:v', 'copy', '-af', `volume=${gain}dB,alimiter=limit=${(10 ** (-1.5 / 20)).toFixed(4)}:attack=5:release=50:level=disabled`, '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', tmp])
  fs.renameSync(tmp, file)
  const after = measure(file)
  return { inputLufs: +j.input_i, gainDb: gain, outputLufs: +after.input_i, truePeak: +after.input_tp }
}

// ---------- text helpers ----------
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
// **bold**, `code`; in terminals also __link__ (blue) and ~~dim~~.
const md = s => esc(s)
  .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
  .replace(/`(.+?)`/g, '<code>$1</code>')
  .replace(/__(.+?)__/g, '<u>$1</u>')
  .replace(/~~(.+?)~~/g, '<i>$1</i>')
// headline: ["Ink part.", {"muted": "Grey part."}, ...]; stacked = one part per line.
function headline(parts, stacked, cls = 'h') {
  const list = [].concat(parts || [])
  const span = p => (typeof p === 'string' ? `<span class="ink">${md(p)}</span>` : `<span class="muted">${md(p.muted)}</span>`)
  return `<h1 class="${cls} ${stacked ? 'stack' : ''} in">${list.map(span).join(stacked ? '' : ' ')}</h1>`
}

// A one-row headline that will wrap at 66 px over 1680 px (about 48 characters): the content under it moves down a line.
const tallHead = (parts, stacked) => !stacked && [].concat(parts || []).map(p => (typeof p === 'string' ? p : p.muted || '')).join(' ').replace(/[*`]/g, '').length > 48

// ---------- timeline ----------
function voiceOf(scene) {
  const jf = path.join(OUT, 'vo', `${scene.id}.json`)
  if (!scene.voice) return null
  if (fs.existsSync(jf)) {
    const j = JSON.parse(fs.readFileSync(jf, 'utf8'))
    if (j.text !== scene.voice) warn(`${scene.id}: voice text changed since the clip was generated; run voice.mjs again`)
    // any provider (elevenlabs, kokoro, recorded) names its clip in `audio`; older ElevenLabs runs left <id>.mp3
    const af = path.join(OUT, 'vo', j.audio || `${scene.id}.mp3`)
    const audio = j.mode !== 'estimate' && fs.existsSync(af) ? af : null
    return { ...j, audio, duration: audio ? Math.max(j.duration, probe(af)) : j.duration }
  }
  const words = scene.voice.trim().split(/\s+/).length
  return { mode: 'estimate', text: scene.voice, duration: +(words / (V.wpm || 145) * 60).toFixed(2), alignment: null }
}
// Seconds from the start of the voice at which character idx of its text is spoken (start or end of it).
function timeAt(vo, idx, end = false) {
  const al = vo.alignment
  const arr = al && (end ? al.character_end_times_seconds : al.character_start_times_seconds)
  if (arr && arr.length) {
    // the alignment is per character of the text; if the service normalized it, map by proportion
    const i = al.characters && al.characters.join('') === vo.text ? idx : Math.round(idx / vo.text.length * (arr.length - 1))
    return arr[Math.max(0, Math.min(arr.length - 1, i))]
  }
  return vo.duration * ((idx + (end ? 1 : 0)) / vo.text.length)
}
// Time at which a phrase of the voice begins.
function cueTime(scene, vo, cue) {
  if (!cue || !vo) return null
  const idx = vo.text.toLowerCase().indexOf(String(cue).toLowerCase())
  if (idx < 0) { warn(`${scene.id}: cue "${cue}" is not in the voice text`); return null }
  return timeAt(vo, idx)
}

// ---------- recordings ----------
const marks = fs.existsSync(path.join(OUT, 'marks.json')) ? JSON.parse(fs.readFileSync(path.join(OUT, 'marks.json'), 'utf8')).shots || {} : {}
const ENC = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-an']
function fitClip(scene, target, out) {
  const VP = vpOf(devOf(scene))
  const src = scene.take ? null : marks[scene.record || scene.id]
  if (scene.take) {
    const f = path.resolve(SPEC_DIR, scene.take)
    if (!fs.existsSync(f)) return null
    const len = probe(f) - (scene.takeStart || 0)
    const g = `[0:v]fps=${FPS},scale=${VP.width}:${VP.height}:force_original_aspect_ratio=increase,crop=${VP.width}:${VP.height}${len < target ? `,tpad=stop_mode=clone:stop_duration=${fx(target - len)}` : ''}[o]`
    run('ffmpeg', ['-y', '-ss', fx(scene.takeStart || 0), '-i', f, '-filter_complex', g, '-map', '[o]', '-t', fx(target), ...ENC, out])
    return { source: 'take', raw: +len.toFixed(2), speed: 1 }
  }
  if (!src || !src.segments || !src.segments.length) return null
  const segs = src.segments.filter(s => s.end - s.start > 0.05)
  const inputs = [], chains = []
  segs.forEach((s, i) => {
    inputs.push('-ss', fx(s.start), '-t', fx(s.end - s.start), '-i', path.resolve(OUT, s.video))
    chains.push(`[${i}:v]fps=${FPS},scale=${VP.width}:${VP.height},setsar=1,setpts=PTS-STARTPTS[s${i}]`)
  })
  const raw = segs.reduce((a, s) => a + (s.end - s.start), 0)
  let g = segs.length > 1 ? `${chains.join(';')};${segs.map((_, i) => `[s${i}]`).join('')}concat=n=${segs.length}:v=1:a=0[c]` : chains[0].replace('[s0]', '[c]')
  let v = '[c]'
  let speed = 1, len = raw
  if (raw > target + 0.05) {
    speed = Math.min(raw / target, scene.maxSpeed ?? MAX_SPEED)
    len = raw / speed
    g += `;${v}setpts=PTS/${fx(speed)}[p]`; v = '[p]'
    if (len > target + 0.05) {
      warn(`${scene.id}: the recording runs ${raw.toFixed(1)}s for a ${target.toFixed(1)}s scene even at ${speed.toFixed(1)}x; keeping its last ${target.toFixed(1)}s`)
      g += `;${v}trim=start=${fx(len - target)},setpts=PTS-STARTPTS[t]`; v = '[t]'; len = target
    }
  }
  if (len < target * 0.6) warn(`${scene.id}: the recording runs ${raw.toFixed(1)}s for a ${target.toFixed(1)}s scene; its last frame holds for ${(target - len).toFixed(1)}s (add waits or hold to the steps)`)
  if (len < target - 0.05) { g += `;${v}tpad=stop_mode=clone:stop_duration=${fx(target - len)}[d]`; v = '[d]' }
  g += `;${v}null[o]`
  run('ffmpeg', ['-y', ...inputs, '-filter_complex', g, '-map', '[o]', '-t', fx(target), ...ENC, out])
  return { source: 'recorded', raw: +raw.toFixed(2), speed: +speed.toFixed(2) }
}

// ---------- scene builders ----------
// Every builder returns {html, items}: items are [{sel, cue, at}] that appear in voice order.
let navNames = []
const ITEM = (sel, cue, extra = {}) => ({ sel, cue, ...extra })
const logo = (b, cls = 'logo') => {
  const brand = spec.brand || {}
  const img = brand.logo ? `<img src="media/${path.basename(brand.logo)}" alt="">` : ''
  return `<div class="${cls} in">${img}<span>${esc(brand.name || spec.title || '')}</span></div>`
}
// The brand motif on the intro and the closing: theme.motif = {kind: "svg", src, closing: "above"|"none"},
// {kind: "orb", colors: [a, b, c]} or {kind: "none"} (the default). In an SVG motif, shapes with pathLength="1"
// draw their stroke and shapes with data-pop appear; data-at (seconds into the scene) and data-dur time them.
const MOTIF = T.motif ? (T.motif.kind || (T.motif.src ? 'svg' : 'none')) : 'none'
let motifSvg = null
function motif(where) {
  if (MOTIF === 'none' || (where === 'closing' && T.motif?.closing === 'none')) return ''
  if (MOTIF === 'orb') return `<div class="motif orb motif-${where}"><i class="o1"></i><i class="o2"></i><i class="o3"></i></div>`
  if (motifSvg === null) {
    const f = path.resolve(SPEC_DIR, T.motif.src)
    if (!fs.existsSync(f)) throw new Error(`theme.motif.src: ${T.motif.src} not found`)
    motifSvg = fs.readFileSync(f, 'utf8').replace(/<\?xml[^>]*>/, '').replace(/<!--[\s\S]*?-->/g, '')
  }
  // ids are prefixed per placement: the same SVG appears twice in one page
  const svg = motifSvg.replace(/\bid="([^"]+)"/g, `id="${where}-$1"`).replace(/url\(#([^)]+)\)/g, `url(#${where}-$1)`).replace(/href="#([^"]+)"/g, `href="#${where}-$1"`)
  return `<div class="motif motif-${where}">${svg}</div>`
}
// When the SVG motif has finished drawing (seconds into its scene), from its data-at and data-dur.
function motifEnd() {
  let end = 0, i = 0, k = 0
  for (const m of motifSvg.matchAll(/<[^>]*\b(pathLength|data-pop)\b[^>]*>/g)) {
    const tag = m[0], at = tag.match(/data-at="([\d.]+)"/), dur = tag.match(/data-dur="([\d.]+)"/)
    const line = /pathLength/.test(tag)
    const start = at ? +at[1] : line ? 0.3 + i++ * 0.12 : 1.2 + k++ * 0.08
    end = Math.max(end, start + (dur ? +dur[1] : line ? 1.4 : 0.3))
  }
  return end
}
const acc = x => (x && x.accent ? ` acc-${x.accent}` : '')

const build = {
  intro(s) {
    const foot = s.footer || {}
    return {
      html: `${motif('intro')}${logo()}
        <div class="intro-body">${headline(s.headline, s.stack !== false, 'h hero')}${s.subtitle ? `<p class="sub in">${md(s.subtitle)}</p>` : ''}</div>
        <div class="foot"><span>${esc(foot.left ?? spec.event ?? '')}</span><span>${esc(foot.right ?? spec.links?.demo ?? '')}</span></div>`,
      items: [ITEM('.logo', null, { at: 0 }), ITEM('.hero', s.cueHeadline, { at: 0.3 }), ITEM('.sub', s.cueSubtitle)],
    }
  },
  problem(s) {
    const stats = (s.stats || []).map((c, i) => `<div class="card stat${acc(c)} in" data-i="${i}"><div class="big">${md(c.value)}</div><div class="txt">${md(c.text)}</div>${c.source ? `<div class="src">${md(c.source)}</div>` : ''}</div>`).join('')
    const flow = (s.flow || []).map((c, i) => `${i ? '<span class="arr">→</span>' : ''}<span class="chip">${md(c)}</span>`).join('')
    return {
      html: `<div class="top"><div class="eyebrow in">${esc(s.eyebrow || 'The problem')}</div>${headline(s.headline, s.stack)}</div>
        <div class="stats n${(s.stats || []).length}">${stats}</div>
        ${flow || s.promise ? `<div class="flow in">${flow}${s.promise ? `<span class="arr">→</span><span class="chip solid">${md(s.promise)}</span>` : ''}</div>` : ''}`,
      items: [ITEM('.eyebrow', null, { at: 0 }), ITEM('.h', null, { at: 0.2 }), ...(s.stats || []).map((c, i) => ITEM(`.stat[data-i="${i}"]`, c.cue)), ITEM('.flow', s.cueFlow)],
    }
  },
  architecture(s) {
    const cols = (s.columns || []).map((c, ci) => {
      const boxes = (c.boxes || []).map(b => `<div class="box ${b.strong ? 'strong' : ''}${acc(b)} in" data-box="${esc(b.id)}" style="${b.span ? `grid-column:span ${b.span};` : ''}${b.rows ? `grid-row:span ${b.rows};` : ''}"><div class="bt">${md(b.title)}</div>${b.body ? `<div class="bb">${md(b.body)}</div>` : ''}</div>`).join('')
      return `<div class="col ${c.frame ? 'frame' : ''}" style="flex:${c.width || 1}">${c.title ? `<div class="${c.frame ? 'ftag' : 'ctitle'} in" data-col="${ci}">${md(c.title)}</div>` : ''}<div class="boxes" style="${c.grid ? `display:grid;grid-template-columns:repeat(${c.grid},1fr);grid-auto-flow:row dense;` : ''}">${boxes}</div></div>`
    }).join('')
    const items = [ITEM('.eyebrow', null, { at: 0 }), ITEM('.h', null, { at: 0.2 })]
    ;(s.columns || []).forEach((c, ci) => {
      if (c.title) items.push(ITEM(`[data-col="${ci}"]`, c.cue, { group: 'col' }))
      ;(c.boxes || []).forEach(b => items.push(ITEM(`[data-box="${b.id}"]`, b.cue, { box: b.id })))
    })
    return {
      html: `<div class="top"><div class="eyebrow in">${esc(s.eyebrow || 'Architecture')}</div>${headline(s.headline, s.stack)}</div>
        <div class="arch">${cols}<svg class="wires" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"></svg></div>`,
      items, arrows: s.arrows || [],
    }
  },
  chapter(s, ctx) {
    const cards = (s.cards || []).map((c, i) => `<div class="card bts${acc(c)} in" data-i="${i}"><div class="lab">${md(c.label)}</div><div class="txt">${md(c.text)}</div></div>`).join('')
    const nav = navNames.map(n => `<div class="nv ${n === ctx.nav ? 'cur' : navNames.indexOf(n) < navNames.indexOf(ctx.nav) ? 'past' : ''}"><i></i><span>${esc(n)}</span></div>`).join('')
    const frame = devOf(s) === 'phone'
      ? `<div class="phone"></div>`
      : `<div class="browser"><div class="bar"><i></i><i></i><i></i><span>${esc(s.url || spec.links?.demo || '')}${esc(s.route || '')}</span></div></div>`
    const still = ctx.still ? `<img class="screen-img" src="media/${ctx.still}" alt="">` : ''
    const ph = ctx.placeholder ? `<div class="screen-ph"><b>${esc(ctx.placeholder)}</b><span>${esc(s.manual || '')}</span></div>` : ''
    const n = String(ctx.number).padStart(2, '0')
    return {
      html: `${frame}${still}${ph}
        <div class="right"><div class="eyebrow in">${esc(s.eyebrow || `${n} · ${s.name}`)}</div>${headline(s.headline, s.stack !== false, 'h ch')}
        ${s.route ? `<div class="route in"><i></i>${esc(s.route)}</div>` : ''}
        ${cards ? `<div class="bts-t in">Behind the screen</div><div class="btslist">${cards}</div>` : ''}</div>
        <div class="bottom">${s.note ? `<div class="note in"><i></i>${md(s.note)}</div>` : ''}<div class="nav">${nav}</div></div>`,
      items: [ITEM('.eyebrow', null, { at: 0 }), ITEM('.h', null, { at: 0.15 }), ITEM('.route', s.cueRoute, { at: 0.5 }), ITEM('.bts-t', null, { follow: 0 }), ...(s.cards || []).map((c, i) => ITEM(`.bts[data-i="${i}"]`, c.cue)), ITEM('.note', s.cueNote)],
    }
  },
  cards(s) {
    const panels = (s.panels || []).map((p, pi) => {
      const rows = (p.rows || []).map((r, ri) => `<div class="row in" data-r="${pi}-${ri}"><span>${md(r.k)}</span><code>${md(r.v)}</code></div>`).join('')
      return `<div class="card panel${acc(p)} in" data-p="${pi}">${p.tag ? `<div class="tag">${esc(p.tag)}</div>` : ''}<div class="pt">${md(p.title)}</div>${p.text ? `<div class="ptx">${md(p.text)}</div>` : ''}${rows}</div>`
    }).join('')
    const items = [ITEM('.eyebrow', null, { at: 0 }), ITEM('.h', null, { at: 0.2 })]
    ;(s.panels || []).forEach((p, pi) => { items.push(ITEM(`[data-p="${pi}"]`, p.cue)); (p.rows || []).forEach((r, ri) => items.push(ITEM(`[data-r="${pi}-${ri}"]`, r.cue))) })
    return { html: `<div class="top"><div class="eyebrow in">${esc(s.eyebrow || 'Under the hood')}</div>${headline(s.headline, s.stack)}</div><div class="panels n${(s.panels || []).length}${tallHead(s.headline, s.stack) ? ' tall' : ''}">${panels}</div>`, items }
  },
  terminal(s) {
    const pre = { cmd: '<i>$</i> ', ok: '<em>✓</em> ', call: '<i>→</i> ', out: '' }
    const lines = (s.lines || []).map((l, i) => { const o = typeof l === 'string' ? { t: l, kind: 'out' } : l; return `<div class="tl ${o.kind || 'out'}${acc(o)} in" data-l="${i}">${pre[o.kind || 'out'] || ''}${md(o.t)}</div>` }).join('')
    return {
      html: `<div class="top"><div class="eyebrow in">${esc(s.eyebrow || 'Under the hood')}</div><div class="hrow">${headline(s.headline, s.stack)}${s.tag ? `<span class="tag in">${esc(s.tag)}</span>` : ''}</div></div>
        <div class="term${tallHead(s.headline, s.stack) || (s.tag && tallHead([].concat(s.headline || [], s.tag), s.stack)) ? ' tall' : ''} in"><div class="tbar"><i></i><i></i><i></i><span>${esc(s.bar || '')}</span></div><div class="tbody">${lines}</div></div>`,
      items: [ITEM('.eyebrow', null, { at: 0 }), ITEM('.h', null, { at: 0.2 }), ITEM('.hrow .tag', null, { at: 0.5 }), ITEM('.term', null, { at: 0.6 }), ...(s.lines || []).map((l, i) => ITEM(`[data-l="${i}"]`, l.cue))],
    }
  },
  built(s) {
    const tl = (s.timeline || []).map((t, i) => `<div class="step${acc(t)} in" data-t="${i}"><i></i><div class="when">${esc(t.when)}</div><div class="what">${md(t.text)}</div></div>`).join('')
    const nums = (s.numbers || []).map((c, i) => `<div class="card num${acc(c)} in" data-n="${i}"><div class="big">${md(c.value)}</div><div class="txt">${md(c.text)}</div></div>`).join('')
    const f = s.footer
    return {
      html: `<div class="top"><div class="eyebrow in">${esc(s.eyebrow || 'Under the hood · How it was built')}</div>${headline(s.headline, s.stack)}</div>
        <div class="timeline"><div class="line in"></div>${tl}</div><div class="nums n${(s.numbers || []).length}">${nums}</div>
        ${f ? `<div class="bfoot in"><span>${esc(f.label || '')}</span>${(f.chips || []).map(c => `<code>${esc(c)}</code>`).join('')}</div>` : ''}`,
      items: [ITEM('.eyebrow', null, { at: 0 }), ITEM('.h', null, { at: 0.2 }), ITEM('.timeline .line', null, { at: 0.5 }), ...(s.timeline || []).map((t, i) => ITEM(`[data-t="${i}"]`, t.cue)), ...(s.numbers || []).map((c, i) => ITEM(`[data-n="${i}"]`, c.cue)), ITEM('.bfoot', s.cueFooter)],
    }
  },
  closing(s) {
    const pills = s.pills || [spec.links?.demo && { text: spec.links.demo }, spec.links?.repo && { text: spec.links.repo, outline: true }].filter(Boolean)
    return {
      html: `${motif('closing')}<div class="closing${MOTIF === 'svg' && T.motif?.closing !== 'none' ? ' below-motif' : ''}">${logo(null, 'logo c')}${headline(s.headline, s.stack !== false, 'h hero c')}<div class="pills in">${pills.map(p => `<span class="pill ${p.outline ? 'outline' : ''}">${esc(p.text)}</span>`).join('')}</div></div>`,
      items: [ITEM('.logo', null, { at: 0 }), ITEM('.hero', null, { at: 0.25 }), ITEM('.pills', s.cuePills)],
    }
  },
  html(s) {
    const f = path.resolve(SPEC_DIR, s.html)
    const body = fs.readFileSync(f, 'utf8')
    const cues = [...body.matchAll(/data-cue="([^"]*)"/g)].map(m => m[1])
    return { html: `<div class="custom">${body}</div>`, items: cues.map((c, i) => ITEM(`[data-cue="${c.replace(/"/g, '\\"')}"]`, c || null, { at: c ? undefined : 0.2 * i })) }
  },
}

// ---------- skin (references/format.md, "Skin") ----------
// The format is fixed; the skin comes from video.json `theme`, derived from the product's own direction.
// Without a theme the video uses neutral greys, system fonts and no motif, and report.json says so.
// Every colour the layout uses. Neutral defaults: no product's skin.
const TOKENS = {
  bg: '#F2F2F2', ink: '#161616', muted: '#5C5C5C', 'headline-muted': '#5C5C5C', soft: '#474747', faint: '#666666',
  line: '#DADADA', card: '#FFFFFF', 'card-ink': '#222222', chip: '#E9E9E9', 'chip-ink': '#2E2E2E',
  'on-ink': '#FFFFFF', pill: '#2E2E2E', 'pill-ink': '#FFFFFF', 'pill-outline': '#FFFFFF',
  shadow: '0 1px 2px rgba(0,0,0,.04), 0 10px 30px rgba(0,0,0,.04)',
  'col-line': '#D2D2D2', 'frame-line': '#2E2E2E', box: '#FFFFFF', 'box-frame': '#F7F7F7', 'ftag-bg': '#161616', 'ftag-ink': '#FFFFFF',
  wire: '#8F8F8F', 'wire-strong': '#161616',
  device: '#1A1A1A', 'device-shadow': '0 30px 60px rgba(0,0,0,.14)', browser: '#FFFFFF', 'browser-dot': '#CFCFCF', placeholder: '#E4E4E4',
  'row-line': '#E6E6E6', 'row-ink': '#2B2B2B', 'row-value': '#4F4F4F', 'tag-ink': '#333333',
  'term-bg': '#111111', 'term-line': '#262626', 'term-dot': '#3A3A3A', 'term-dim': '#8C8C8C', 'term-ink': '#EDEDED', 'term-out': '#C4C4C4',
  'term-ok': '#E0E0E0', 'term-key': '#FFFFFF', 'term-link': '#D6D6D6', 'term-shadow': '0 30px 70px rgba(0,0,0,.22)',
  'nav-todo': '#DCDCDC', 'nav-past': '#9A9A9A', 'nav-cur': '#161616', dot: '#161616',
}
const RADII = { card: '18px', box: '14px', chip: '30px', pill: '12px', code: '6px', tag: '8px', term: '22px', browser: '18px', phone: '66px', screen: '54px' }
const COLORS = { ...TOKENS, ...(T.colors || {}) }
for (const k of Object.keys(T.colors || {})) if (!(k in TOKENS)) warn(`theme.colors.${k} is not a token (${Object.keys(TOKENS).join(', ')})`)
const ACCENTS = T.accents || {}
// Fonts: theme.fonts.sans / .mono = {family, files: [{src, weight, style}]}; files resolve from video.json's folder.
function fontFaces() {
  const out = [], fam = {}
  for (const role of ['sans', 'mono']) {
    const f = T.fonts?.[role]
    if (!f) { fam[role] = role === 'sans' ? 'sans-serif' : 'monospace'; continue }
    fam[role] = `'${f.family}', ${role === 'sans' ? 'sans-serif' : 'monospace'}`
    for (const file of f.files || []) {
      const src = path.resolve(SPEC_DIR, file.src)
      if (!fs.existsSync(src)) throw new Error(`theme.fonts.${role}: ${file.src} not found`)
      const name = `${role}-${path.basename(src)}`
      fs.copyFileSync(src, path.join(HF, 'media', name))
      out.push(`@font-face{font-family:'${f.family}';src:url('media/${name}');font-weight:${file.weight || 400};font-style:${file.style || 'normal'};}`)
    }
  }
  return { faces: out.join('\n'), fam }
}
// WCAG contrast of the text tokens on the surfaces they sit on.
function contrastChecks() {
  const hex = c => { const m = String(c).trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i); if (!m) return null; const h = m[1].length === 3 ? [...m[1]].map(x => x + x).join('') : m[1]; return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255) }
  const lum = rgb => { const [r, g, b] = rgb.map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
  const ratio = (a, b) => { const x = hex(a), y = hex(b); if (!x || !y) return null; const [l1, l2] = [lum(x), lum(y)].sort((p, q) => q - p); return (l1 + 0.05) / (l2 + 0.05) }
  // [text, surface, minimum]: 4.5 for body text, 3 for headline-size text
  const pairs = [['ink', 'bg', 4.5], ['muted', 'bg', 4.5], ['headline-muted', 'bg', 3], ['soft', 'bg', 4.5], ['faint', 'bg', 4.5], ['card-ink', 'card', 4.5], ['soft', 'card', 4.5], ['faint', 'card', 4.5],
    ['chip-ink', 'chip', 4.5], ['tag-ink', 'chip', 4.5], ['muted', 'chip', 4.5], ['ink', 'box', 4.5], ['soft', 'box-frame', 4.5], ['ink', 'box-frame', 4.5], ['ftag-ink', 'ftag-bg', 4.5],
    ['on-ink', 'ink', 4.5], ['pill-ink', 'pill', 4.5], ['soft', 'pill-outline', 4.5], ['row-ink', 'card', 4.5], ['row-value', 'card', 4.5], ['muted', 'placeholder', 4.5],
    ['term-ink', 'term-bg', 4.5], ['term-out', 'term-bg', 4.5], ['term-dim', 'term-bg', 4.5], ['term-ok', 'term-bg', 4.5], ['term-key', 'term-bg', 4.5], ['term-link', 'term-bg', 4.5], ['ink', 'card', 4.5]]
  for (const [k, c] of Object.entries(ACCENTS)) pairs.push([`accent:${k}`, 'bg', 3], [`accent:${k}`, 'card', 3])
  const val = k => (k.startsWith('accent:') ? ACCENTS[k.slice(7)] : COLORS[k])
  return pairs.map(([a, b, min]) => { const r = ratio(val(a), val(b)); return { text: a, on: b, ratio: r === null ? null : +r.toFixed(2), min, ok: r === null ? null : r >= min } })
}

function css(fonts) {
  const P = screenRect('phone'), Bw = screenRect('browser')
  const rect = r => `left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;`
  const R = { ...RADII, ...(T.radius || {}) }
  const vars = [...Object.entries(COLORS).map(([k, v]) => `--${k}:${v};`), ...Object.entries(R).map(([k, v]) => `--r-${k}:${typeof v === 'number' ? v + 'px' : v};`), ...Object.entries(ACCENTS).map(([k, v]) => `--accent-${k}:${v};`)].join('')
  const accentCss = Object.keys(ACCENTS).map(k => `.acc-${k}{--acc:var(--accent-${k});}`).join('')
  const orb = T.motif?.kind === 'orb' ? (T.motif.colors || [COLORS.line, COLORS.chip, COLORS['nav-todo']]) : null
  return `
${fonts.faces}
:root{${vars}--sans:${fonts.fam.sans};--mono:${fonts.fam.mono};}
html,body{margin:0;background:var(--bg);}
#root{position:relative;width:100%;height:100%;overflow:hidden;background:${T.background || 'var(--bg)'};font-family:var(--sans);color:var(--ink);font-optical-sizing:auto;-webkit-font-smoothing:antialiased;}
.scene{position:absolute;inset:0;box-sizing:border-box;padding:0 120px;}
.scene .content{position:absolute;inset:0;padding:0 120px;box-sizing:border-box;}
b{font-weight:600;color:var(--ink);} code{font-family:var(--mono);font-size:.84em;background:var(--chip);border-radius:var(--r-code);padding:1px 7px;color:var(--chip-ink);}
.eyebrow{font-size:22px;font-weight:500;color:var(--muted);letter-spacing:.005em;}
.h{margin:0;font-weight:400;letter-spacing:-.022em;line-height:1.08;font-size:66px;max-width:1680px;}
.h .muted{color:var(--headline-muted);} .h.stack span{display:block;}
.top{position:absolute;left:120px;right:120px;top:92px;} .top .h{margin-top:12px;}
/* motif */
.motif{position:absolute;} .motif svg{width:100%;height:100%;display:block;overflow:visible;}
.motif-intro{left:1020px;top:170px;width:800px;height:740px;} .motif-closing{left:410px;top:96px;width:1100px;height:330px;}
.orb{filter:blur(64px);opacity:.95;} .orb i{position:absolute;border-radius:50%;display:block;}
${orb ? `.orb .o1{background:${orb[0]};} .orb .o2{background:${orb[1] || orb[0]};} .orb .o3{background:${orb[2] || orb[0]};}` : ''}
.orb.motif-intro{left:1110px;top:150px;width:720px;height:720px;} .orb.motif-closing{left:510px;top:60px;width:900px;height:900px;}
.orb .o1{left:4%;top:12%;width:58%;height:58%;} .orb .o2{left:40%;top:8%;width:56%;height:62%;} .orb .o3{left:22%;top:42%;width:58%;height:54%;}
/* intro / closing */
.logo{position:absolute;left:120px;top:96px;display:flex;align-items:center;gap:14px;font-size:30px;font-weight:500;letter-spacing:-.01em;}
.logo img{height:34px;} .logo.c{position:static;justify-content:center;font-size:40px;margin-bottom:34px;} .logo.c img{height:44px;}
.intro-body{position:absolute;left:120px;top:330px;width:1000px;} .hero{font-size:108px;line-height:1.04;letter-spacing:-.03em;}
.sub{margin:36px 0 0;font-size:28px;color:var(--muted);}
.foot{position:absolute;left:120px;right:120px;bottom:52px;display:flex;justify-content:space-between;font-size:18px;color:var(--faint);}
.closing{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;}
.closing.below-motif{justify-content:flex-start;padding-top:460px;box-sizing:border-box;}
.hero.c{font-size:94px;max-width:1300px;} .pills{display:flex;gap:16px;justify-content:center;margin-top:52px;}
.pill{font-size:21px;padding:11px 22px;border-radius:var(--r-pill);background:var(--pill);color:var(--pill-ink);} .pill.outline{background:var(--pill-outline);color:var(--soft);border:1px solid var(--line);}
/* cards; .acc-<team> marks a card with that accent */
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--r-card);box-shadow:var(--shadow);box-sizing:border-box;}
[class*="acc-"].card,[class*="acc-"].box{border-left:5px solid var(--acc);}
.stats{position:absolute;left:120px;right:120px;top:338px;display:grid;gap:28px;} .stats.n2{grid-template-columns:repeat(2,1fr);} .stats.n3{grid-template-columns:repeat(3,1fr);} .stats.n4{grid-template-columns:repeat(4,1fr);}
.stat{min-height:366px;padding:38px 38px;display:flex;flex-direction:column;} .stat .big{font-size:86px;font-weight:300;letter-spacing:-.03em;line-height:1;margin-top:6px;}
.stat .txt{font-size:25px;line-height:1.42;color:var(--soft);margin-top:26px;} .stat .src{margin-top:auto;padding-top:18px;font-size:17px;color:var(--faint);}
.flow{position:absolute;left:120px;right:120px;top:778px;display:flex;align-items:center;gap:18px;flex-wrap:wrap;}
.chip{font-size:22px;padding:13px 24px;border-radius:var(--r-chip);background:var(--card);border:1px solid var(--line);} .chip.solid{background:var(--ink);color:var(--on-ink);border-color:var(--ink);} .arr{color:var(--faint);font-size:22px;}
/* architecture */
.arch{position:absolute;left:80px;right:80px;top:300px;display:flex;align-items:stretch;gap:56px;}
.col{position:relative;display:flex;flex-direction:column;padding:44px 22px 22px;border:1px dashed var(--col-line);border-radius:calc(var(--r-card) + 4px);}
.col.frame{border:2px solid var(--frame-line);border-radius:calc(var(--r-card) + 8px);padding-top:44px;}
.ctitle{position:absolute;top:-34px;left:24px;font-size:18px;letter-spacing:.09em;text-transform:uppercase;color:var(--muted);font-weight:500;}
.ftag{position:absolute;top:-17px;left:28px;background:var(--ftag-bg);color:var(--ftag-ink);font-size:18px;font-weight:500;padding:5px 16px;border-radius:var(--r-chip);}
.boxes{display:flex;flex-direction:column;gap:20px;}
.box{position:relative;z-index:1;background:var(--box);border:1px solid var(--line);border-radius:var(--r-box);padding:20px 24px;} .frame .box{background:var(--box-frame);}
.box.strong{border:1.5px solid var(--frame-line);} .bt{font-size:23px;font-weight:500;} .bb{font-size:17px;color:var(--soft);line-height:1.4;margin-top:6px;}
.wires{position:absolute;left:-80px;top:-300px;z-index:0;pointer-events:none;overflow:visible;}
.wires path.w{fill:none;stroke:var(--wire);stroke-width:1.6;} .wires path.w.strong{stroke:var(--wire-strong);stroke-width:2.2;}
.wires marker path{fill:var(--wire);stroke:none;} .wires marker.strong path{fill:var(--wire-strong);}
/* chapter */
.phone{position:absolute;left:270px;top:60px;width:455px;height:957px;border-radius:var(--r-phone);background:var(--device);box-shadow:var(--device-shadow);}
.browser{position:absolute;left:84px;top:${Bw.y - 52}px;width:864px;height:${Bw.h + 64}px;border-radius:var(--r-browser);background:var(--browser);border:1px solid var(--line);box-shadow:var(--device-shadow);}
.browser .bar{height:52px;display:flex;align-items:center;gap:9px;padding:0 18px;border-bottom:1px solid var(--line);} .browser .bar i{width:12px;height:12px;border-radius:50%;background:var(--browser-dot);display:block;}
.browser .bar span{margin-left:18px;font:400 16px var(--mono);color:var(--muted);background:var(--chip);border-radius:var(--r-tag);padding:5px 14px;}
.screen-img,.screen-ph,.vwrap{position:absolute;overflow:hidden;object-fit:cover;object-position:top;}
.dev-phone .screen-img,.dev-phone .screen-ph,.vwrap.dev-phone{${rect(P)}border-radius:var(--r-screen);}
.dev-browser .screen-img,.dev-browser .screen-ph,.vwrap.dev-browser{${rect(Bw)}border-radius:0 0 calc(var(--r-browser) - 6px) calc(var(--r-browser) - 6px);}
.screen-ph{background:var(--placeholder);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;text-align:center;padding:40px;box-sizing:border-box;color:var(--muted);font-size:20px;} .screen-ph b{font:500 22px var(--mono);color:var(--ink);}
.vwrap video{width:100%;height:100%;display:block;object-fit:cover;}
.right{position:absolute;left:860px;right:120px;top:84px;} .dev-browser .right,.dev-browser .bottom{left:1010px;}
.h.ch{font-size:64px;line-height:1.1;margin-top:18px;}
.route{display:inline-flex;align-items:center;gap:14px;margin-top:30px;font:400 21px var(--mono);padding:11px 20px;border-radius:var(--r-chip);background:var(--card);border:1px solid var(--line);} .route i,.note i{width:9px;height:9px;border-radius:50%;background:var(--dot);display:block;}
.bts-t{margin-top:48px;font-size:19px;letter-spacing:.11em;text-transform:uppercase;color:var(--faint);font-weight:500;}
.btslist{display:flex;flex-direction:column;gap:16px;margin-top:16px;}
.bts{display:flex;gap:28px;padding:28px 34px;} .bts .lab{flex:0 0 190px;font:400 18px var(--mono);color:var(--faint);padding-top:4px;overflow-wrap:anywhere;} .bts .txt{font-size:25px;line-height:1.42;color:var(--card-ink);}
.bottom{position:absolute;left:860px;right:120px;bottom:48px;}
.note{display:flex;align-items:center;gap:12px;font-size:21px;color:var(--soft);margin-bottom:28px;} .note i{background:var(--faint);width:8px;height:8px;flex:0 0 8px;}
.nav{display:flex;gap:10px;} .nv{flex:1;min-width:0;} .nv i{display:block;height:3px;border-radius:2px;background:var(--nav-todo);} .nv.past i{background:var(--nav-past);} .nv.cur i{background:var(--nav-cur);}
.nv span{display:block;margin-top:14px;font-size:17px;color:var(--faint);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;} .nv.cur span{color:var(--ink);font-weight:500;}
/* under the hood */
.panels.tall{top:338px;} .panels{position:absolute;left:120px;right:120px;top:266px;display:grid;gap:28px;grid-template-columns:repeat(3,1fr);align-items:start;}
.panel{padding:40px 40px 22px;min-height:505px;} .tag{display:inline-block;font:400 17px var(--mono);background:var(--chip);border-radius:var(--r-tag);padding:4px 12px;color:var(--tag-ink);}
[class*="acc-"] .tag{background:var(--chip);color:var(--tag-ink);box-shadow:inset 3px 0 0 var(--acc);}
.pt{font-size:34px;margin:22px 0 18px;letter-spacing:-.01em;} .ptx{font-size:23px;color:var(--soft);line-height:1.45;}
.row{display:flex;justify-content:space-between;align-items:baseline;gap:20px;padding:19px 0;border-bottom:1px solid var(--row-line);} .row:last-child{border-bottom:0;}
.row span{font-size:24px;color:var(--row-ink);} .row code{background:none;padding:0;font-size:18px;color:var(--row-value);text-align:right;text-wrap:balance;}
/* terminal */
.hrow{display:flex;align-items:flex-start;gap:24px;} .hrow .tag{margin-top:4px;}
.term.tall{top:322px;} .term{position:absolute;left:120px;right:120px;top:250px;bottom:90px;border-radius:var(--r-term);background:var(--term-bg);box-shadow:var(--term-shadow);overflow:hidden;}
.tbar{height:52px;display:flex;align-items:center;gap:10px;padding:0 24px;border-bottom:1px solid var(--term-line);} .tbar i{width:13px;height:13px;border-radius:50%;background:var(--term-dot);display:block;} .tbar span{margin-left:16px;font:400 18px var(--mono);color:var(--term-dim);}
.tbody{padding:30px 34px;font:400 23px/1.6 var(--mono);color:var(--term-ink);white-space:pre-wrap;} .tl i{font-style:normal;color:var(--term-dim);} .tl em{font-style:normal;color:var(--term-ok);}
.tl b{color:var(--term-key);font-weight:400;} .tl u{text-decoration:none;color:var(--term-link);} .tl.out{color:var(--term-out);} .tl code{background:none;color:var(--term-dim);padding:0;font-size:1em;}
.tl[class*="acc-"]{color:var(--acc);}
/* built */
.timeline{position:absolute;left:120px;right:120px;top:318px;height:140px;display:flex;justify-content:space-between;}
.timeline .line{position:absolute;left:8px;right:0;top:4px;height:2px;background:var(--ink);transform-origin:left center;}
.step{position:relative;flex:1;padding-top:36px;} .step i{position:absolute;left:0;top:-4px;width:14px;height:14px;border-radius:50%;border:2px solid var(--ink);background:var(--bg);}
.step[class*="acc-"] i{border-color:var(--acc);background:var(--acc);}
.when{font:400 18px var(--mono);color:var(--faint);} .what{font-size:24px;margin-top:10px;line-height:1.35;max-width:300px;color:var(--card-ink);}
.nums{position:absolute;left:120px;right:120px;top:566px;display:grid;gap:24px;} ${[2, 3, 4, 5, 6, 7].map(n => `.nums.n${n}{grid-template-columns:repeat(${n},1fr);}`).join('')}
.num{padding:34px 32px;height:208px;} .num .big{font-size:72px;font-weight:300;letter-spacing:-.03em;line-height:1;} .num .txt{font-size:22px;color:var(--soft);margin-top:14px;line-height:1.3;}
.bfoot{position:absolute;left:120px;bottom:90px;display:flex;align-items:center;gap:14px;font-size:20px;color:var(--soft);} .bfoot code{font-size:17px;background:var(--card);border:1px solid var(--line);padding:6px 14px;border-radius:var(--r-chip);}
.custom{position:absolute;inset:0;}
${accentCss}
${T.css || ''}
`
}

// ---------- main ----------
// ---------- music bed (optional) ----------
// video.json `music`: {src, start, bedLufs, duckDb, pad, ramp, fadeIn, fadeOut}; src is relative to video.json.
// The bed is mixed after the render and the speech normalization, so the voice keeps its -16 LUFS. It is set to
// `bedLufs` (measured over the part of the track used) where nobody speaks, and lowered by `duckDb` under every
// voice clip, with ramps that are linear in dB. Whether the ducking is enough is not a matter of taste: under each
// clip the mix must measure like the voice alone (within 1 dB); report.json `music.check` lists every clip.
// Criterion and defaults after launch-video-kit (MIT, Borja Pérez Francés, scripts/LICENSE-launch-video-kit).
const M = spec.music || null
const SR = 48000
function decodePcm(src, ch, ss = 0, t = 0) {
  const args = ['-v', 'error', ...(ss ? ['-ss', fx(ss)] : []), '-i', src, ...(t ? ['-t', fx(t)] : []), '-vn', '-ac', String(ch), '-ar', String(SR), '-f', 'f32le', '-']
  const r = spawnSync('ffmpeg', args, { maxBuffer: 2048 * 1024 * 1024 })
  if (r.status !== 0) throw new Error(`ffmpeg could not decode ${src}: ${(r.stderr || '').toString().slice(-300)}`)
  return new Float32Array(new Uint8Array(r.stdout).buffer)
}
function measureLufs(args) {
  const m = spawnSync('ffmpeg', ['-hide_banner', ...args, '-vn', '-af', 'loudnorm=I=-16:TP=-1.5:LRA=20:print_format=json', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  const found = (m.stderr || '').match(/\{[^{}]*"input_i"[^{}]*\}/)
  if (!found) throw new Error('loudness: no measurement in the ffmpeg output')
  const j = JSON.parse(found[0])
  return { lufs: +j.input_i, truePeak: +j.input_tp }
}
const hasAudio = f => run('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', f]).trim() !== ''
const rmsDb = (pcm, a, b) => { let e = 0, n = 0; for (let i = Math.max(0, a); i < Math.min(pcm.length, b); i++) { e += pcm[i] * pcm[i]; n++ } return n ? 10 * Math.log10(e / n + 1e-12) : -120 }
function mixMusic(file, total, wins) {
  const src = path.resolve(SPEC_DIR, M.src || '')
  if (!M.src || !fs.existsSync(src)) { warn(`music: ${M.src || '(no src)'} not found; the video has no music bed`); return { mixed: false, reason: 'missing file' } }
  const start = +(M.start ?? 0), bedLufs = +(M.bedLufs ?? -22), duckDb = Math.abs(+(M.duckDb ?? 9))
  const pad = +(M.pad ?? 0.2), ramp = +(M.ramp ?? 0.35), fadeIn = +(M.fadeIn ?? 1.5), fadeOut = +(M.fadeOut ?? 3)
  const trackLen = probe(src) - start
  const used = Math.min(trackLen, total)
  if (trackLen < total - 0.05) warn(`music: the track gives ${trackLen.toFixed(1)}s from ${start}s for a ${total.toFixed(1)}s video; it fades out at its end. Lengthen it first with scripts/loop-music.mjs`)
  // one constant gain: the part of the track we use, measured, to bedLufs
  const m = measureLufs(['-ss', fx(start), '-t', fx(used), '-i', src])
  const gainDb = +(bedLufs - m.lufs).toFixed(2)
  const pcm = decodePcm(src, 2, start, used)
  const n = Math.round(total * SR), y = new Int16Array(n * 2)
  const endAt = used // the bed fades out at the end of the video or of the track, whichever comes first
  const g0 = 10 ** (gainDb / 20)
  // duck in dB per 1 ms block, then per sample by linear interpolation
  const B = SR / 1000, nb = Math.ceil(n / B) + 1, red = new Float32Array(nb)
  for (const w of wins) {
    const a = w.from - pad, b = w.to + pad
    const i0 = Math.max(0, Math.floor((a - ramp) * 1000)), i1 = Math.min(nb - 1, Math.ceil((b + ramp) * 1000))
    for (let i = i0; i <= i1; i++) {
      const t = i / 1000
      const k = Math.max(0, Math.min(1, (t - (a - ramp)) / ramp, ((b + ramp) - t) / ramp))
      if (duckDb * k > red[i]) red[i] = duckDb * k
    }
  }
  for (let i = 0; i < n; i++) {
    const t = i / SR, bi = Math.floor(i / B), fr = (i % B) / B
    const r = red[bi] + (red[Math.min(nb - 1, bi + 1)] - red[bi]) * fr
    let g = g0 * 10 ** (-r / 20)
    if (t < fadeIn) g *= t / fadeIn
    if (t > endAt - fadeOut) g *= Math.max(0, (endAt - t) / fadeOut)
    for (let c = 0; c < 2; c++) {
      const v = 2 * i + c < pcm.length ? pcm[2 * i + c] * g : 0
      y[2 * i + c] = Math.max(-32768, Math.min(32767, Math.round(v * 32767)))
    }
  }
  const bed = path.join(OUT, 'music-bed.wav')
  const hdr = Buffer.alloc(44)
  hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + y.byteLength, 4); hdr.write('WAVE', 8); hdr.write('fmt ', 12)
  hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(2, 22); hdr.writeUInt32LE(SR, 24); hdr.writeUInt32LE(SR * 4, 28); hdr.writeUInt16LE(4, 32); hdr.writeUInt16LE(16, 34)
  hdr.write('data', 36); hdr.writeUInt32LE(y.byteLength, 40)
  fs.writeFileSync(bed, Buffer.concat([hdr, Buffer.from(y.buffer)]))
  // mix: voice track untouched, bed under it, one peak limiter at -1.5 dBTP; the video stream is copied
  const voiced = hasAudio(file)
  const voicePcm = voiced ? decodePcm(file, 1) : null
  const tmp = file.replace(/\.mp4$/, '.music.mp4')
  const lim = `alimiter=limit=${(10 ** (-1.5 / 20)).toFixed(4)}:attack=5:release=50:level=disabled`
  const fmt = 'aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo'
  const graph = voiced ? `[0:a]${fmt}[v];[1:a]${fmt}[m];[v][m]amix=inputs=2:normalize=0:duration=first,${lim}[a]` : `[1:a]${fmt},${lim}[a]`
  run('ffmpeg', ['-y', '-v', 'error', '-i', file, '-i', bed, '-filter_complex', graph, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', fx(total), tmp])
  fs.renameSync(tmp, file)
  // the check: under each voice clip, mix vs voice alone; and the bed alone where nobody speaks
  const mixPcm = decodePcm(file, 1)
  const check = voicePcm ? wins.map(w => {
    const a = Math.round(w.from * SR), b = Math.round(w.to * SR)
    const v = rmsDb(voicePcm, a, b), x = rmsDb(mixPcm, a, b)
    return { id: w.id, voiceDb: +v.toFixed(1), mixDb: +x.toFixed(1), diffDb: +(x - v).toFixed(2), ok: x - v <= 1 }
  }) : []
  for (const c of check) if (!c.ok) warn(`music: under ${c.id} the mix measures ${c.diffDb} dB over the voice alone; raise duckDb or lower bedLufs`)
  const after = measureLufs(['-i', file])
  if (after.truePeak > -1) warn(`music: true peak ${after.truePeak} dBTP after the mix (should stay under -1)`)
  log(`music: ${path.basename(src)} at ${bedLufs} LUFS (gain ${gainDb} dB), ducked ${duckDb} dB under ${wins.length} clip(s); worst diff ${check.length ? Math.max(...check.map(c => c.diffDb)).toFixed(2) : 'n/a'} dB`)
  return { mixed: true, src: path.relative(SPEC_DIR, src), trackLufs: m.lufs, gainDb, bedLufs, duckDb, seconds: +used.toFixed(2), bed: path.relative(OUT, bed), output: after, check }
}

function main() {
  const allScenes = spec.scenes || []
  if (!allScenes.length) throw new Error('video.json has no scenes')
  for (const s of allScenes) if (!build[s.kind]) throw new Error(`scene ${s.id}: unknown kind "${s.kind}" (intro, problem, architecture, chapter, cards, terminal, built, closing, html)`)
  // chapter names for the progress bar
  const navOf = s => s.nav ?? (s.kind === 'intro' ? 'Intro' : s.kind === 'chapter' ? s.name : ['cards', 'terminal', 'built'].includes(s.kind) ? 'Under the hood' : null)
  let lastNav = null
  const sceneNav = allScenes.map(s => { const n = navOf(s); if (n) lastNav = n; return n || lastNav || 'Intro' })
  navNames = [...new Set(allScenes.filter(s => s.kind !== 'closing').map((s, i) => navOf(s)).filter(Boolean))]

  // timeline (--only: just those scenes, for a short preview)
  let t = 0
  const plan = allScenes.map((s, i) => [s, i]).filter(([s]) => !ONLY.length || ONLY.includes(s.id)).map(([s, i]) => {
    const vo = voiceOf(s)
    const dur = s.duration ?? (vo ? LEAD + vo.duration + PAUSE : 3)
    const p = { s, vo, start: +t.toFixed(3), duration: +dur.toFixed(3), nav: sceneNav[i] }
    t += dur
    return p
  })
  const total = +t.toFixed(3)
  const limit = MAX - MARGIN
  const over = !ONLY.length && total > limit
  if (over) warn(`total ${total.toFixed(1)}s is over the limit (${MAX}s - ${MARGIN}s margin = ${limit}s): cut or shorten scenes`)

  fs.rmSync(HF, { recursive: true, force: true })
  fs.mkdirSync(path.join(HF, 'media'), { recursive: true })
  if (spec.brand?.logo) fs.copyFileSync(path.resolve(SPEC_DIR, spec.brand.logo), path.join(HF, 'media', path.basename(spec.brand.logo)))
  if (spec.brand?.font || spec.brand?.fontFile) warn('brand.font and brand.fontFile are gone: put the fonts in theme.fonts')
  if (!THEME) warn('no theme in video.json: neutral greys, system fonts, no motif. Derive a skin from the product\'s design direction (references/format.md, "Skin")')
  if (THEME && !T.fonts?.sans) warn('theme.fonts.sans is missing: the video uses the system sans-serif')
  const fonts = fontFaces()
  const contrast = contrastChecks()
  for (const c of contrast) if (c.ok === false) warn(`contrast ${c.text} on ${c.on}: ${c.ratio}:1, needs ${c.min}:1 (WCAG AA)`)
  const style = { text: css(fonts) }

  const sections = [], media = [], tl = [], report = [], voiceWins = []
  let chapterNo = 0, degraded = false
  plan.forEach((p, idx) => {
    const { s, vo } = p
    const ctx = { nav: p.nav, number: s.kind === 'chapter' ? navNames.indexOf(p.nav) + 1 || ++chapterNo : 0 }
    const row = { id: s.id, kind: s.kind, device: s.kind === 'chapter' ? devOf(s) : undefined, start: p.start, duration: p.duration, voice: vo ? vo.mode : 'none' }
    if (vo && !vo.audio) degraded = true
    if (s.kind === 'chapter') {
      const clipFile = path.join(HF, 'media', `${s.id}.mp4`)
      const fit = fitClip(s, p.duration, clipFile)
      if (fit) { Object.assign(row, fit); media.push(`<div class="vwrap dev-${devOf(s)}" id="vw-${s.id}"><video id="v-${s.id}" class="clip" src="media/${s.id}.mp4" muted playsinline data-start="${fx(p.start)}" data-duration="${fx(p.duration)}" data-track-index="2"></video></div>`) }
      else {
        const still = path.join(OUT, 'stills', `${s.record || s.id}.png`)
        if (!s.take && fs.existsSync(still)) { fs.copyFileSync(still, path.join(HF, 'media', `${s.id}.png`)); ctx.still = `${s.id}.png`; row.source = 'still' }
        else { ctx.placeholder = s.manual ? `HUMAN TAKE · ${s.id}` : `MISSING RECORDING · ${s.id}`; row.source = s.manual ? 'human-take' : 'placeholder' }
        degraded = true
        warn(`${s.id}: no recording (${row.source})`)
      }
    }
    const b = build[s.kind](s, ctx)
    sections.push(`<section id="s-${s.id}" class="scene clip${s.kind === 'chapter' ? ` dev-${devOf(s)}` : ''}" data-start="${fx(p.start)}" data-duration="${fx(p.duration)}" data-track-index="1"><div class="content">${b.html}</div></section>`)
    if (vo && vo.audio) {
      const clean = cleanVoice(vo.audio, path.join(HF, 'media', `${s.id}.wav`))
      row.voiceClip = { seconds: clean.duration, window: +(p.duration - LEAD).toFixed(3), muted: clean.muted }
      voiceWins.push({ id: s.id, from: p.start + LEAD, to: p.start + LEAD + clean.duration })
      for (const m of clean.muted) warn(`${s.id}: muted a ${m.ms} ms burst at the ${m.at} of its voice clip (${m.from}-${m.to} s), an artefact of the TTS; regenerate the clip if it is audible speech`)
      if (clean.duration + 0.3 > p.duration - LEAD) warn(`${s.id}: the voice clip (${clean.duration}s) leaves less than 0.3 s before the scene ends`)
      media.push(`<audio id="a-${s.id}" src="media/${s.id}.wav" data-start="${fx(p.start + LEAD)}" data-duration="${fx(clean.duration)}" data-track-index="3" data-volume="1"></audio>`)
    }
    // cue times
    const vd = vo ? vo.duration : p.duration - LEAD
    const uncued = b.items.filter(it => it.at === undefined && !it.cue && it.follow === undefined)
    let k = 0
    const times = b.items.map(it => {
      let at
      if (it.cue) { const c = cueTime(s, vo, it.cue); if (c !== null) at = LEAD + c - 0.15 }
      if (at === undefined && it.at !== undefined) at = it.at
      if (at === undefined && it.follow === undefined) { at = LEAD + vd * (0.12 + 0.7 * (uncued.length > 1 ? k / (uncued.length - 1) : 0)); k++ }
      return { ...it, at }
    })
    // "follow" items appear with the next timed item
    times.forEach((it, i) => { if (it.at === undefined) { const nx = times.slice(i + 1).find(x => x.at !== undefined); it.at = nx ? Math.max(0, nx.at - 0.2) : 0.5 } })
    const latest = Math.max(0.6, ...times.map(x => x.at))
    if (latest > p.duration - 0.6) warn(`${s.id}: an element appears ${latest.toFixed(1)}s into a ${p.duration.toFixed(1)}s scene`)
    // the check frame waits for the motif too
    const motifDone = (s.kind === 'intro' || s.kind === 'closing') && motifSvg ? motifEnd() : 0
    row.allIn = +(Math.min(p.duration - 0.45, Math.max(latest + 0.6, motifDone + 0.2))).toFixed(2)
    const sel = x => `#s-${s.id} ${x}`
    tl.push(`// ${s.id}`)
    // wires measure the boxes: before their entrance tweens move them
    if (b.arrows && b.arrows.length) tl.push(`wires(${JSON.stringify(s.id)}, ${JSON.stringify(b.arrows)}, ${JSON.stringify(Object.fromEntries(times.filter(x => x.box).map(x => [x.box, +(p.start + x.at).toFixed(3)])))});`)
    if (idx > 0) tl.push(`tl.fromTo(${JSON.stringify(`#s-${s.id} .content`)}, {opacity:0}, {opacity:1, duration:.3, ease:'power1.out'}, ${fx(p.start)});`)
    for (const it of times) tl.push(`q(${JSON.stringify(sel(it.sel))}, ${fx(p.start + Math.max(0.05, it.at))});`)
    if (s.kind === 'built') tl.push(`tl.fromTo(${JSON.stringify(sel('.timeline .line'))}, {scaleX:0}, {scaleX:1, duration:1.2, ease:'power1.inOut'}, ${fx(p.start + 0.5)});`)
    if ((s.kind === 'intro' || s.kind === 'closing') && MOTIF === 'orb') tl.push(`tl.fromTo(${JSON.stringify(sel('.orb'))}, {opacity:0, scale:.92, rotation:-8}, {opacity:.95, scale:1, rotation:0, duration:1.4, ease:'power2.out'}, ${fx(p.start)}); tl.to(${JSON.stringify(sel('.orb'))}, {rotation:14, scale:1.04, duration:${fx(Math.max(0.5, p.duration - 1.4))}, ease:'none'}, ${fx(p.start + 1.4)});`)
    if ((s.kind === 'intro' || s.kind === 'closing') && MOTIF === 'svg') tl.push(`drawMotif(${JSON.stringify(sel('.motif svg'))}, ${fx(p.start)});`)
    // scene exit: fade the content (and the recording) out before the next scene
    if (idx < plan.length - 1) {
      tl.push(`tl.to(${JSON.stringify(`#s-${s.id} .content`)}, {opacity:0, duration:.35, ease:'power1.in'}, ${fx(p.start + p.duration - 0.38)});`)
      if (row.source === 'recorded' || row.source === 'take') tl.push(`tl.fromTo('#vw-${s.id}', {opacity:0}, {opacity:1, duration:.4}, ${fx(p.start + 0.05)}); tl.to('#vw-${s.id}', {opacity:0, duration:.35, ease:'power1.in'}, ${fx(p.start + p.duration - 0.38)});`)
    } else if (row.source === 'recorded' || row.source === 'take') tl.push(`tl.fromTo('#vw-${s.id}', {opacity:0}, {opacity:1, duration:.4}, ${fx(p.start + 0.05)});`)
    report.push(row)
  })

  const html = `<!doctype html>
<html lang="${esc(V.language || spec.language || 'en')}">
<head><meta charset="UTF-8"><meta name="viewport" content="width=${W}, height=${H}"><title>${esc(spec.title || 'Demo')}</title>
<script src="${GSAP_URL}"></script>
<style>${style.text}</style></head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-width="${W}" data-height="${H}" data-fps="${FPS}" data-duration="${fx(total)}">
${sections.join('\n')}
${media.join('\n')}
</div>
<script>
document.fonts.ready.then(() => {
  const tl = gsap.timeline({ paused: true });
  const q = (sel, at) => { if (document.querySelector(sel)) tl.fromTo(sel, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' }, at); };
  const drawMotif = (sel, at) => {
    const svg = document.querySelector(sel); if (!svg) return;
    const lines = [...svg.querySelectorAll('[pathLength]')], pops = [...svg.querySelectorAll('[data-pop]')];
    lines.forEach((el, i) => { const a = el.dataset.at !== undefined ? +el.dataset.at : 0.3 + i * 0.12; tl.fromTo(el, { strokeDasharray: 1, strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: +(el.dataset.dur || 1.4), ease: 'power1.inOut' }, at + a); });
    pops.forEach((el, i) => { const a = el.dataset.at !== undefined ? +el.dataset.at : 1.2 + i * 0.08; tl.fromTo(el, { opacity: 0, scale: 0.3, transformOrigin: '50% 50%' }, { opacity: 1, scale: 1, duration: 0.3, ease: 'back.out(2)' }, at + a); });
  };
  const wires = (id, arrows, at) => {
    const root = document.getElementById('s-' + id); const svg = root.querySelector('.wires'); if (!svg) return;
    const box = k => root.querySelector('[data-box="' + k + '"]');
    const S = svg.getBoundingClientRect(); const k = S.width / ${W} || 1;
    const R = el => { const r = el.getBoundingClientRect(); const l = (r.left - S.left) / k, t = (r.top - S.top) / k, w = r.width / k, h = r.height / k; return { l, r: l + w, t, b: t + h, cx: l + w / 2, cy: t + h / 2 }; };
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = '<marker id="ah-' + id + '" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z"/></marker><marker id="as-' + id + '" class="strong" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z"/></marker>';
    svg.appendChild(defs);
    for (const a of arrows) {
      const f = box(a.from), t = box(a.to); if (!f || !t) continue;
      const A = R(f), B = R(t); let d;
      if (B.l >= A.r - 4) { const x1 = A.r, y1 = A.cy, x2 = B.l - 2, y2 = B.cy, m = (x1 + x2) / 2; d = 'M' + x1 + ',' + y1 + ' C' + m + ',' + y1 + ' ' + m + ',' + y2 + ' ' + x2 + ',' + y2; }
      else if (B.r <= A.l + 4) { const x1 = A.l, y1 = A.cy, x2 = B.r + 2, y2 = B.cy, m = (x1 + x2) / 2; d = 'M' + x1 + ',' + y1 + ' C' + m + ',' + y1 + ' ' + m + ',' + y2 + ' ' + x2 + ',' + y2; }
      else if (B.t >= A.b) { d = 'M' + A.cx + ',' + A.b + ' L' + A.cx + ',' + (B.t - 2); }
      else { d = 'M' + A.cx + ',' + A.t + ' L' + A.cx + ',' + (B.b + 2); }
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', d); p.setAttribute('class', a.strong ? 'w strong' : 'w');
      p.setAttribute('marker-end', 'url(#' + (a.strong ? 'as-' : 'ah-') + id + ')');
      svg.appendChild(p);
      const len = p.getTotalLength();
      const start = Math.max(at[a.from] ?? 0, at[a.to] ?? 0) + 0.25;
      tl.fromTo(p, { strokeDasharray: len, strokeDashoffset: len, opacity: 0 }, { strokeDashoffset: 0, opacity: 1, duration: 0.5, ease: 'power1.inOut' }, start);
    }
  };
${tl.join('\n')}
  window.__timelines['main'] = tl;
});
</script>
</body></html>
`
  fs.writeFileSync(path.join(HF, 'index.html'), html)
  fs.writeFileSync(path.join(HF, 'hyperframes.json'), JSON.stringify({ name: spec.title || 'demo' }, null, 1))

  // captions.srt from the voice timings, chapters.txt for the video description
  const srt = []
  const ts = s => { const ms = Math.round(s * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}` }
  for (const p of plan) {
    if (!p.vo) continue
    const words = p.vo.text.split(/\s+/).filter(Boolean)
    const chunks = []
    let cur = []
    for (const w of words) { cur.push(w); if (cur.join(' ').length > 64 || /[.!?;:]$/.test(w)) { chunks.push(cur.join(' ')); cur = [] } }
    if (cur.length) chunks.push(cur.join(' '))
    let from = 0
    for (const c of chunks) {
      const i0 = p.vo.text.indexOf(c, from); from = i0 + c.length
      const a = timeAt(p.vo, i0)
      const b = timeAt(p.vo, Math.min(p.vo.text.length - 1, i0 + c.length - 1), true)
      srt.push(`${srt.length + 1}\n${ts(p.start + LEAD + a)} --> ${ts(p.start + LEAD + b + 0.15)}\n${c}\n`)
    }
  }
  fs.writeFileSync(path.join(OUT, 'captions.srt'), srt.join('\n'))
  const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  const chapters = []
  plan.forEach(p => { const n = p.nav; if (!chapters.find(c => c.name === n)) chapters.push({ name: n, start: p.start }) })
  fs.writeFileSync(path.join(OUT, 'chapters.txt'), chapters.map(c => `${mmss(c.start)} ${c.name}`).join('\n') + '\n')
  const shortCh = chapters.filter((c, i) => (chapters[i + 1]?.start ?? total) - c.start < 10)
  if (shortCh.length) warn(`YouTube needs every chapter to last 10s or more: ${shortCh.map(c => c.name).join(', ')}`)

  const result = { file: path.join(OUT, ONLY.length ? 'preview.mp4' : spec.output?.name || 'draft.mp4'), preview: ONLY.length ? ONLY : undefined, seconds: total, maxSeconds: MAX, limit, overLimit: over, voice: (() => { const v = plan.filter(p => p.vo), modes = [...new Set(v.filter(p => p.vo.audio).map(p => p.vo.mode))]; return !modes.length ? 'none' : v.every(p => p.vo.audio) ? modes.join('+') : 'partial' })(), scenes: report, theme: THEME ? (T.name || 'unnamed') : null, motif: MOTIF, contrast: contrast.filter(c => c.ok === false), warnings }
  if (flag('no-render') || (over && !flag('allow-over'))) {
    fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ ...result, rendered: false }, null, 1))
    log(`composition -> ${path.relative(process.cwd(), HF)} (${total.toFixed(1)}s), not rendered`)
    return over ? 2 : 0
  }

  // render
  const env = { ...process.env, DO_NOT_TRACK: '1', HYPERFRAMES_NO_TELEMETRY: '1' }
  const cli = process.env.HYPERFRAMES_CLI ? ['node', [process.env.HYPERFRAMES_CLI]] : ['npx', ['--yes', `hyperframes@${HF_VERSION}`]]
  const hf = (args, o = {}) => run(cli[0], [...cli[1], ...args], { env, cwd: OUT, ...o })
  // lint errors break renders silently; its structure warnings (one file, many sections) are expected here
  try { const lint = hf(['lint', HF]); const m = lint.match(/(\d+) error\(s\)/); if (m && +m[1] > 0) warn(`hyperframes lint: ${lint.split('\n').filter(l => /✗|error/i.test(l)).slice(0, 8).join(' | ')}`) } catch (e) { warn(`hyperframes lint: ${e.message.split('\n').slice(0, 12).join(' | ')}`) }
  const outFile = result.file
  const t0 = process.hrtime.bigint()
  const rendered = hf(['render', HF, '-o', outFile, '-q', opt('quality', 'looks'), '--video-frame-format', 'png'])
  fs.writeFileSync(path.join(OUT, 'render.log'), rendered)
  // Speech at -16 LUFS (true peak -1.5 dB) with one constant gain; the video stream is copied untouched.
  if (plan.some(p => p.vo && p.vo.audio)) result.loudness = loudnorm(outFile)
  if (M && !flag('no-music')) result.music = mixMusic(outFile, total, voiceWins)
  else if (M) result.music = { mixed: false, reason: '--no-music' }
  log(rendered.split('\n').filter(l => /rendered in|capture ·|MB ·/.test(l)).map(l => l.trim()).join(' | '))
  log(`rendered ${path.relative(process.cwd(), outFile)} in ${(Number(process.hrtime.bigint() - t0) / 1e9).toFixed(0)}s`)

  // one frame per scene (everything on screen) and the board against the reference keyframes
  const framesDir = path.join(OUT, 'frames')
  fs.rmSync(framesDir, { recursive: true, force: true })
  fs.mkdirSync(framesDir, { recursive: true })
  const REF = { intro: '01-title', problem: '02-problem', architecture: '03-architecture', chapter: '04-chapter', cards: '05-under-the-hood', terminal: '06-terminal', built: '07-built', closing: '08-closing' }
  const pairs = []
  for (const r of report) {
    const at = r.start + r.allIn
    const png = path.join(framesDir, `${r.id}.png`)
    run('ffmpeg', ['-y', '-v', 'error', '-ss', fx(at), '-i', outFile, '-frames:v', '1', png])
    r.frame = path.relative(OUT, png); r.frameAt = +at.toFixed(2)
    const ref = STYLE_DIR && REF[r.kind] && path.join(STYLE_DIR, `${REF[r.kind]}.jpg`)
    const pref = r.kind !== 'chapter' || r.device === 'phone' || !report.some(x => x.kind === 'chapter' && x.device === 'phone')
    if (ref && fs.existsSync(ref) && pref && !pairs.find(x => x.kind === r.kind)) pairs.push({ kind: r.kind, png, ref })
  }
  if (pairs.length) {
    const ins = pairs.flatMap(p => ['-i', p.ref, '-i', p.png])
    const g = pairs.map((p, i) => `[${2 * i}:v]scale=960:540,drawtext=text='reference layout ${p.kind}':x=16:y=12:fontsize=22:fontcolor=0x888888[r${i}];[${2 * i + 1}:v]scale=960:540,drawtext=text='ours ${p.kind}':x=16:y=12:fontsize=22:fontcolor=0x888888[o${i}];[r${i}][o${i}]hstack[p${i}]`).join(';')
    run('ffmpeg', ['-y', '-v', 'error', ...ins, '-filter_complex', `${g};${pairs.map((_, i) => `[p${i}]`).join('')}vstack=inputs=${pairs.length}[b]`, '-map', '[b]', '-frames:v', '1', path.join(OUT, 'style-board.png')])
    result.styleBoard = path.join(OUT, 'style-board.png')
  } else if (!STYLE_DIR) warn('no --style-dir: style-board.png not made (pass <skill>/assets/style)')
  result.sizeMB = +(fs.statSync(outFile).size / 1048576).toFixed(1)
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ ...result, rendered: true }, null, 1))
  log(`${total.toFixed(1)}s of ${MAX}s · voice ${result.voice} · ${warnings.length} warning(s) · report.json`)
  return over ? 2 : degraded ? 1 : 0
}

try { process.exit(main()) } catch (e) { console.error(`[compose] ${e.message}`); process.exit(3) }
