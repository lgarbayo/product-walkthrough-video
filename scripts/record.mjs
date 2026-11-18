#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 Luis Garbayo Fernández <lugarbayo@gmail.com>
// SPDX-License-Identifier: MIT
// product-walkthrough-video recorder: records the app inside every `chapter` scene of video/video.json in a headless
// browser, one take per chapter ("takePerScene": false for one continuous take), with a visible pointer (desktop)
// or tap marks (phone).
// Copy it into the project as video/record.mjs.
//
//   node video/record.mjs video/video.json [--out video/out] [--base-url URL]
//        [--shots id1,id2] [--setup] [--headed] [--no-video]
//
// Playwright is resolved from the current directory (the project's own playwright or @playwright/test),
// then from $PLAYWRIGHT_MODULE (a directory whose node_modules has playwright, e.g. an `npm i --prefix <dir> playwright`). $CHROMIUM_PATH points at
// another Chromium/Chrome binary when Playwright's own browser is not downloaded.
//
// The browser viewport is the app's: `device: "phone"` (default 390x844, touch) or `"browser"` (default 1280x800);
// `viewport` overrides it. Playwright records at the viewport's CSS size, which compose.mjs places in the device frame.
// Outputs in --out: stills/<id>.png, raw/<run>/*.webm and marks.json
// ({shots: {<id>: {segments: [{video, start, end}], error?, stillOnly?}}}, merged across runs). It is saved after every
// chapter, so a crash mid-run (a browser that dies on a codec, a killed process) keeps the chapters already recorded.
// `setup` (demo reset) runs on full runs; --shots skips it unless --setup is given.
// --no-video (or a failure to start video recording) records stills only; manual scenes are skipped.
// Exit codes: 0 ok, 1 some shots failed, 2 bad input, 3 no browser.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const argv = process.argv.slice(2)
const opt = (name, dflt) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : dflt
}
const flag = name => argv.includes(`--${name}`)
const shotsFile = argv.find(a => !a.startsWith('--') && a.endsWith('.json'))
if (!shotsFile) {
  console.error('usage: node record.mjs <video.json> [--out dir] [--base-url url] [--shots a,b] [--setup] [--headed] [--no-video]')
  process.exit(64)
}
const spec = JSON.parse(fs.readFileSync(shotsFile, 'utf8'))
const specDir = path.dirname(path.resolve(shotsFile))
const OUT = path.resolve(opt('out', path.join(specDir, 'out')))
const BASE = opt('base-url', process.env.VIDEO_BASE_URL || spec.baseUrl || '')
const PICK = (opt('shots', '') || '').split(',').filter(Boolean)
// A scene may override the video's device ("phone" or "browser"); each device gets its own browser context.
const DEFAULT_DEVICE = spec.device || 'phone'
const devOf = s => s.device || DEFAULT_DEVICE
const vpOf = dev => spec.viewports?.[dev] || (dev === DEFAULT_DEVICE && spec.viewport) || (dev === 'phone' ? { width: 390, height: 844 } : { width: 1280, height: 800 })
const SHOTS = (spec.scenes || []).filter(s => s.kind === 'chapter' && ((s.steps && s.steps.length) || s.manual))
const sleep = ms => new Promise(r => setTimeout(r, ms))
const log = (...a) => console.log('[record]', ...a)

async function loadPlaywright() {
  const bases = [path.join(process.cwd(), 'package.json'), process.env.PLAYWRIGHT_MODULE && path.join(process.env.PLAYWRIGHT_MODULE, 'package.json')].filter(Boolean)
  for (const base of bases) {
    for (const name of ['playwright', '@playwright/test', 'playwright-core']) {
      try {
        const resolved = createRequire(base).resolve(name)
        const mod = await import(pathToFileURL(resolved).href)
        const pw = mod.chromium ? mod : mod.default
        if (pw && pw.chromium) return { pw, from: resolved }
      } catch { /* try next */ }
    }
  }
  throw new Error('Playwright not found. Run from a project that has playwright or @playwright/test installed, or set PLAYWRIGHT_MODULE to a playwright package directory (npm i --prefix <scratch> playwright).')
}

// A visible pointer and click ripple (or, on a phone, only a tap mark): headless recordings show no OS cursor.
const CURSOR = touch => `(() => {
  if (window.__hkCursor) return; window.__hkCursor = true;
  const mk = () => {
    if (!document.body || document.getElementById('__hk_cursor')) return;
    const c = document.createElement('div'); c.id = '__hk_cursor';
    c.innerHTML = '<svg width="28" height="28" viewBox="0 0 28 28"><path d="M4 2 L4 22 L9.5 17 L13 25 L16.5 23.5 L13 15.8 L20.5 15.8 Z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, {position:'fixed',left:'0',top:'0',zIndex:'2147483647',pointerEvents:'none',transform:'translate(-4px,-2px)',transition:'none',display:'none'});
    document.body.appendChild(c);
  };
  const st = document.createElement('style');
  st.textContent = '@keyframes __hkr{from{transform:translate(-50%,-50%) scale(.2);opacity:.55}to{transform:translate(-50%,-50%) scale(1);opacity:0}}';
  document.addEventListener('DOMContentLoaded', () => { document.head.appendChild(st); mk(); });
  document.addEventListener('mousemove', e => { if (${touch}) return; mk(); const c = document.getElementById('__hk_cursor'); if (c) { c.style.display='block'; c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; } }, true);
  document.addEventListener('mousedown', e => { const r = document.createElement('div');
    Object.assign(r.style,{position:'fixed',left:e.clientX+'px',top:e.clientY+'px',width:'46px',height:'46px',borderRadius:'50%',background:'rgba(13,13,15,.22)',zIndex:'2147483646',pointerEvents:'none',animation:'__hkr .5s ease-out forwards'});
    document.body.appendChild(r); setTimeout(() => r.remove(), 600); }, true);
})();`

async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  const marksFile = path.join(OUT, 'marks.json')
  const marks = fs.existsSync(marksFile) ? JSON.parse(fs.readFileSync(marksFile, 'utf8')) : { shots: {} }
  // Written after every shot (temp file + rename, so a crash never leaves it half-written).
  const saveMarks = () => { const tmp = `${marksFile}.tmp`; fs.writeFileSync(tmp, JSON.stringify(marks, null, 1)); fs.renameSync(tmp, marksFile) }
  const wanted = s => (!PICK.length || PICK.includes(s.id))
  const screens = SHOTS.filter(wanted)
  if (!screens.length) { console.error('[record] no chapter scene with steps to record'); process.exit(2) }
  const { pw, from } = await loadPlaywright()
  log(`playwright from ${from}`)
  let browser
  try {
    browser = await pw.chromium.launch({ headless: !flag('headed'), executablePath: process.env.CHROMIUM_PATH || undefined })
  } catch (e) {
    console.error(`[record] cannot launch Chromium: ${e.message.split('\n')[0]}\nInstall the browser that matches this Playwright (npx playwright install chromium) or set CHROMIUM_PATH.`)
    process.exit(3)
  }
  let failed = 0

  {
    if (!BASE && screens.some(s => (s.steps || []).some(st => typeof st.goto === 'string' && st.goto.startsWith('/')))) throw new Error('relative goto needs baseUrl in video.json or --base-url')
    const run = `run-${Date.now()}`
    const rawDir = path.join(OUT, 'raw', run)
    fs.mkdirSync(path.join(OUT, 'stills'), { recursive: true })
    // setup resets the demo: it runs on full runs only, not when re-recording single shots (unless --setup).
    if (spec.setup && spec.setup.length && (!PICK.length || flag('setup'))) {
      const req = await pw.request.newContext({ baseURL: BASE || undefined })
      for (const r of spec.setup) {
        const res = await req.fetch(r.url, { method: r.method || 'POST', data: r.data })
        log(`setup ${r.method || 'POST'} ${r.url} -> ${res.status()}`)
      }
      await req.dispose()
    }
    const born = new Map()
    const now = p => (Date.now() - born.get(p)) / 1000
    let videoOn = !flag('no-video')
    let context, main, device
    const open = async (dev) => {
      device = dev
      const phone = dev === 'phone', vp = vpOf(dev)
      const ctxOpts = {
        viewport: vp, baseURL: BASE || undefined, deviceScaleFactor: 1, isMobile: phone, hasTouch: phone,
        locale: spec.locale || 'en-US', timezoneId: spec.timezone, colorScheme: spec.colorScheme || 'light',
      }
      context = await browser.newContext(videoOn ? { ...ctxOpts, recordVideo: { dir: rawDir, size: vp } } : ctxOpts)
      if (spec.cursor !== false) await context.addInitScript(CURSOR(spec.cursor === 'touch' || (phone && spec.cursor !== 'pointer')))
      if (spec.css) await context.addInitScript(`document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent=${JSON.stringify(spec.css)};document.head.appendChild(s)})`)
      context.on('page', p => born.set(p, Date.now()))
      main = await context.newPage()
      born.set(main, Date.now())
    }
    const firstDev = devOf(screens.find(s => !s.manual) || screens[0])
    try { await open(firstDev) } catch (e) {
      if (!videoOn) throw e
      console.error(`[record] video recording unavailable (${e.message.split('\n')[0]}); falling back to stills only`)
      videoOn = false
      await context?.close().catch(() => {})
      await open(firstDev)
    }
    let active = main
    const videoOf = async p => (videoOn && p.video() ? path.relative(OUT, await p.video().path()) : null)
    const moveTo = async (loc, ms = 600, timeout = 30000) => {
      await loc.scrollIntoViewIfNeeded({ timeout })
      const b = await loc.boundingBox()
      if (!b) return null
      const to = { x: b.x + b.width / 2, y: b.y + b.height / 2 }
      await active.mouse.move(to.x, to.y, { steps: Math.max(8, Math.round(ms / 16)) })
      return to
    }
    const L = sel => active.locator(sel).first()
    // Secrets (sandbox passwords) come from the environment, never from video.json: {"fill": sel, "env": "NAME"}.
    const val = (st, key) => {
      if (!st.env) return String(st[key] ?? '')
      if (process.env[st.env] === undefined) throw new Error(`environment variable ${st.env} is not set`)
      return process.env[st.env]
    }
    const url = u => (u.startsWith('/') ? BASE.replace(/\/$/, '') + u : u)

    for (const s of screens) {
      if (s.manual) { log(`shot ${s.id}: manual (human take), skipped`); continue }
      // One take per chapter by default: Playwright's recorder drifts from the wall clock over a long take (about 10 s
      // behind after 80 s in one measured run), and the cut then shows the previous chapter. A fresh context per chapter
      // keeps each take short; every chapter logs in and seeds its own state anyway. "takePerScene": false = one take.
      const fresh = spec.takePerScene !== false && s !== screens.find(x => !x.manual)
      // closing the previous context also finishes writing its video file; a crashed browser must not stop the run
      if (fresh || devOf(s) !== device) { await context.close().catch(() => {}); await open(devOf(s)); active = main }
      const segs = []
      let seg = { page: active, start: now(active) }
      const cutSeg = async () => { const end = now(seg.page); const video = await videoOf(seg.page); if (video) segs.push({ video, start: +seg.start.toFixed(3), end: +end.toFixed(3) }) }
      try {
        for (const st of s.steps || []) {
          const t = st.timeout ?? 30000
          try {
          if (st.goto) { await active.goto(url(st.goto), { waitUntil: st.waitUntil || 'load', timeout: t }) }
          else if (st.waitFor) { await L(st.waitFor).waitFor({ state: st.state || 'visible', timeout: t }) }
          else if (st.wait) { await sleep(st.wait) }
          else if (st.click) { const loc = L(st.click); await moveTo(loc, st.moveMs, t); await loc.click({ timeout: t }) }
          else if (st.hover) { await moveTo(L(st.hover), st.moveMs, t) }
          else if (st.fill) { const loc = L(st.fill); await moveTo(loc, st.moveMs, t); await loc.fill(val(st, 'value'), { timeout: t }) }
          else if (st.type) { const loc = L(st.type); await moveTo(loc, st.moveMs, t); await loc.click({ timeout: t }); await loc.pressSequentially(val(st, 'text'), { delay: st.delay ?? 45 }) }
          else if (st.upload) { await L(st.upload).setInputFiles([].concat(st.files).map(f => path.resolve(f))) }
          else if (st.press) { if (st.on) await L(st.on).press(st.press); else await active.keyboard.press(st.press) }
          else if (st.scroll) { await L(st.scroll).evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' })); await sleep(st.settle ?? 900) }
          else if (st.scrollBy) { await active.evaluate(dy => window.scrollBy({ top: dy, behavior: 'smooth' }), st.scrollBy); await sleep(st.settle ?? 900) }
          else if (st.drag) {
            const from = await moveTo(L(st.drag), st.moveMs, t)
            if (!from) throw new Error(`drag source not visible: ${st.drag}`)
            let to
            if (st.to) { const b = await L(st.to).boundingBox(); to = { x: b.x + b.width / 2, y: b.y + b.height / 2 } }
            else to = { x: from.x + (st.dx || 0), y: from.y + (st.dy || 0) }
            await active.mouse.down()
            await active.mouse.move(to.x, to.y, { steps: Math.max(20, Math.round((st.ms ?? 1200) / 16)) })
            await sleep(st.hold ?? 300)
            await active.mouse.up()
          }
          else if (st.clickPopup) {
            const loc = L(st.clickPopup); await moveTo(loc, st.moveMs, t)
            const [p] = await Promise.all([context.waitForEvent('page', { timeout: t }), loc.click({ timeout: t })])
            await p.waitForLoadState(st.waitUntil || 'load').catch(() => {})
            await cutSeg(); active = p; seg = { page: p, start: now(p) }
          }
          else if (st.switch !== undefined) {
            const pages = context.pages().filter(p => !p.isClosed())
            const next = st.switch === 'main' ? main : pages[st.switch]
            if (!next) throw new Error(`no page ${st.switch}`)
            await next.bringToFront(); await cutSeg(); active = next; seg = { page: next, start: now(next) }
          }
          else if (st.eval) { await active.evaluate(st.eval) }
          else if (st.request) { const r = await context.request.fetch(url(st.request.url), { method: st.request.method || 'POST', data: st.request.data }); log(`${s.id}: request ${st.request.url} -> ${r.status()}`) }
          else if (st.mark === 'in') { seg.start = now(active) }
          else if (st.screenshot) { await active.screenshot({ path: path.join(OUT, 'stills', `${s.id}-${st.screenshot}.png`) }) }
          else throw new Error('unknown step')
          if (st.after) await sleep(st.after)
          } catch (e) { e.step = st; throw e }
        }
        await sleep(s.hold ?? 700)
        await active.screenshot({ path: path.join(OUT, 'stills', `${s.id}.png`) })
        await cutSeg()
        marks.shots[s.id] = videoOn ? { run, segments: segs } : { run, segments: [], stillOnly: true }
        log(`shot ${s.id}: ${videoOn ? segs.map(g => `${g.video} ${g.start}-${g.end}s`).join(' + ') : 'still only'}`)
      } catch (e) {
        failed++
        await active.screenshot({ path: path.join(OUT, 'stills', `${s.id}-error.png`) }).catch(() => {})
        const msg = `${e.message.split('\n')[0]}${e.step ? ` at step ${JSON.stringify(e.step)}` : ''}`
        const prev = marks.shots[s.id]
        // A failed retake keeps the last good take of the shot.
        marks.shots[s.id] = prev && !prev.error && prev.segments && prev.segments.length ? { ...prev, lastError: msg } : { run, segments: [], error: msg }
        console.error(`[record] shot ${s.id} FAILED: ${msg}`)
      }
      saveMarks()
    }
    await context.close().catch(() => {})
  }
  await browser.close().catch(() => {})
  saveMarks()
  log(`marks -> ${path.relative(process.cwd(), marksFile)}${failed ? `, ${failed} shot(s) failed` : ''}`)
  process.exit(failed ? 1 : 0)
}

main().catch(e => { console.error(`[record] ${e.message}`); process.exit(2) })
