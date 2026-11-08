// =====================================================================================
//  Mirror Worlds · Device Lab · XR add-on for Machine Skill kit pages
//  ------------------------------------------------------------------------------------
//  Adds "Enter VR" and "Enter MR" buttons to a kit page, so a student wearing a
//  Meta Quest 3 (or any WebXR headset) can stand next to the device, grab it, turn it,
//  explode it, cut it and x-ray it at a magnified scale.
//
//  Why a separate loop?  The kit renders through an EffectComposer (GTAO, bloom, grade).
//  Post-processing passes do not render into the stereo XR framebuffer, so while a
//  session is running we bypass the composer and call renderer.render() directly from
//  renderer.setAnimationLoop(), which is what WebXR requires (window.requestAnimationFrame
//  is paused by the browser during an immersive session).
//
//  Controls in the headset
//    grip (squeeze)        grab the device and move / turn it with your hand
//    trigger on the panel  press a panel button (Explode, Cut, X-ray, Slow, Break, -/+)
//    trigger elsewhere     toggle Explode
//    right thumbstick      left/right turns the device, up/down changes magnification
//    A / X                 X-ray       B / Y   Cut away
//    hand tracking         pinch = trigger, so panel buttons work with bare hands too
//
//  Test without a headset:  add ?xrsim=vr or ?xrsim=ar to the URL. The page then runs the
//  same placement, panel and render path from a fixed head pose (1.6 m, looking ahead).
//
//  Usage (after the device script has built the lab, before or after lab.start()):
//    addXR(lab, { mag: 4, tips: ['Compare with the real camera on the desk'] })
// =====================================================================================
import * as THREE from 'three'
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js'

export function addXR(lab, opt = {}) {
  const R = lab.renderer, scene = lab.scene, root = lab.root
  const q = new URLSearchParams(location.search)
  const sim = q.get('xrsim')                         // 'vr' | 'ar' | null
  const st = { on: false, mode: null, mag: opt.mag ?? 1, saved: null, session: null }

  // ---------------------------------------------------------------- 1. the two buttons
  const css = document.createElement('style')
  css.textContent = `
  .xr-bar{position:fixed;left:18px;top:124px;z-index:40;display:flex;gap:8px;font:500 12px Inter,system-ui,sans-serif}
  .xr-bar button{border:1px solid rgba(0,0,0,.18);background:#fff;color:#16181b;padding:7px 12px;border-radius:999px;cursor:pointer}
  .xr-bar button.vr{background:#0072B2;color:#fff;border-color:#0072B2}
  .xr-bar button.mr{background:#E69F00;color:#16181b;border-color:#E69F00}
  .xr-bar button[disabled]{opacity:.45;cursor:not-allowed}
  .xr-bar .why{position:absolute;left:0;top:36px;width:240px;background:#16181b;color:#eee;padding:8px 10px;border-radius:8px;font-size:11px;line-height:1.4;display:none}
  .xr-bar:hover .why{display:block}
  .lab-embed .xr-bar{display:none}
  .xr-on .lab-ui,.xr-on .dl-nav{display:none}`
  document.head.appendChild(css)
  const bar = document.createElement('div'); bar.className = 'xr-bar'
  bar.innerHTML = `<button class="vr" data-m="immersive-vr">Enter VR</button><button class="mr" data-m="immersive-ar">Enter MR</button><div class="why"></div>`
  document.body.appendChild(bar)
  const why = bar.querySelector('.why')
  const bVR = bar.querySelector('.vr'), bMR = bar.querySelector('.mr')

  // feature detection: WebXR needs HTTPS and a headset browser (Quest Browser, Wolvic, PC VR via SteamVR/OpenXR in Chrome)
  const setWhy = (t) => { why.textContent = t }
  if (!navigator.xr) {
    bVR.disabled = bMR.disabled = !sim
    setWhy('WebXR is not available in this browser. Open this page in the Meta Quest Browser (or Chrome with a PC VR headset) over https. Try ?xrsim=vr to preview the XR layout here.')
  } else {
    navigator.xr.isSessionSupported('immersive-vr').then((ok) => { if (!ok && !sim) bVR.disabled = true }).catch(() => { bVR.disabled = true })
    navigator.xr.isSessionSupported('immersive-ar').then((ok) => { if (!ok && !sim) bMR.disabled = true }).catch(() => { bMR.disabled = true })
    setWhy('VR: the device floats in the studio at ' + st.mag + '× size. MR: the same device appears in your real room through Quest 3 passthrough. Grip to grab, trigger to press panel buttons.')
  }
  bar.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && !b.disabled) enter(b.dataset.m) })

  // ---------------------------------------------------------------- 2. in-world info panel
  // A canvas texture on a plane. Buttons are rectangles in canvas pixels; the controller ray
  // hits the plane, the hit uv becomes a canvas pixel, the pixel picks the button.
  const PW = 1024, PH = 700
  const cv = document.createElement('canvas'); cv.width = PW; cv.height = PH
  const g2 = cv.getContext('2d')
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.56 * PH / PW), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }))
  panel.visible = false; panel.renderOrder = 10
  scene.add(panel)
  const sliders = Object.values(lab.controls).slice(0, 2)
  const buttons = []          // {x,y,w,h,label,act(),on()}
  const mk = (x, y, w, h, label, act, on = () => false) => buttons.push({ x, y, w, h, label, act, on })
  const modes = [['explode', 'Explode'], ['cut', 'Cut away'], ['xray', 'X-ray'], ['slow', 'Slow']]
  modes.forEach(([k, t], i) => mk(36 + i * 240, 392, 222, 70, t, () => lab.toggle(k), () => lab.target[k] > 0.5))
  if (lab._break) mk(36, 480, 462, 70, lab._break.label ?? 'Break it', () => lab.toggle('break'), () => lab.broken)
  mk(516, 480, 222, 70, 'Reset pose', () => placeDevice())
  mk(756, 480, 222, 70, 'Exit XR', () => exit())
  sliders.forEach((c, i) => {
    const y = 580 + i * 0                      // one row per slider; a second slider shares the row
    const x0 = i === 0 ? 36 : 516
    const step = (c.o.max - c.o.min) / 20
    mk(x0, y, 90, 70, '−', () => c.set(c.value - step))
    mk(x0 + 372, y, 90, 70, '+', () => c.set(c.value + step))
  })
  let hover = null, pointing = ''
  const drawPanel = () => {
    const g = g2
    g.clearRect(0, 0, PW, PH)
    g.fillStyle = 'rgba(246,245,241,0.96)'; roundRect(g, 0, 0, PW, PH, 28); g.fill()
    g.fillStyle = '#16181b'; g.font = '500 30px Inter, sans-serif'
    g.fillText(`No. ${String(lab.o.no ?? 1).padStart(2, '0')} · ${lab.o.title ?? ''}  ${lab.o.sub ? '· ' + lab.o.sub : ''}`, 36, 58)
    // hero number from the kit's solver (same value as the 2D page)
    const h = lab.heroO
    if (h) {
      g.fillStyle = '#5a5f66'; g.font = '400 26px Inter, sans-serif'
      g.fillText(`${h.label} · ${lab._hs?.textContent ?? ''}`, 36, 108)
      g.fillStyle = '#16181b'; g.font = '400 112px "Instrument Serif", Georgia, serif'
      const v = lab._hv?.textContent ?? ''
      g.fillText(v, 36, 222)
      const w = g.measureText(v).width
      g.font = '400 40px "Instrument Serif", Georgia, serif'; g.fillText(h.unit ?? '', 52 + w, 222)
      g.fillStyle = '#5a5f66'; g.font = '400 24px Inter, sans-serif'
      wrap(g, (lab._hsub?.textContent ?? ''), 36, 266, PW - 72, 30, 2)
    }
    g.fillStyle = '#0072B2'; g.font = '500 24px Inter, sans-serif'
    g.fillText(pointing ? `Pointing at: ${pointing}` : (opt.tips?.[0] ?? 'Grip to grab · trigger to press · stick to turn / zoom'), 36, 360)
    for (const b of buttons) {
      const on = b.on()
      g.fillStyle = on ? '#16181b' : b === hover ? '#e3e1da' : '#ffffff'
      roundRect(g, b.x, b.y, b.w, b.h, 16); g.fill()
      g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 2; g.stroke()
      g.fillStyle = on ? '#ffffff' : '#16181b'; g.font = '500 28px Inter, sans-serif'
      const tw = g.measureText(b.label).width
      g.fillText(b.label, b.x + (b.w - tw) / 2, b.y + b.h / 2 + 10)
    }
    sliders.forEach((c, i) => {
      const x0 = i === 0 ? 36 : 516
      g.fillStyle = '#16181b'; g.font = '500 24px Inter, sans-serif'
      g.fillText(c.o.label, x0 + 104, 606)
      g.font = '400 24px JetBrains Mono, monospace'
      g.fillText(c.wrap.querySelector('b').textContent, x0 + 104, 638)
    })
    g.fillStyle = '#8a8f96'; g.font = '400 20px Inter, sans-serif'
    g.fillText(`shown at ${st.mag.toFixed(1)}× real size · ${st.mode === 'immersive-ar' ? 'mixed reality (passthrough)' : 'virtual reality'}`, 36, PH - 18)
    tex.needsUpdate = true
  }

  // ---------------------------------------------------------------- 3. controllers
  const ctrls = []
  const factory = new XRControllerModelFactory()
  const ray = new THREE.Raycaster()
  for (let i = 0; i < 2; i++) {
    const c = R.xr.getController(i)
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]), new THREE.LineBasicMaterial({ color: 0x0072B2, toneMapped: false }))
    line.scale.z = 2; c.add(line)
    c.userData = { line, held: false, btn: {} }
    c.addEventListener('connected', (e) => { c.userData.src = e.data })
    c.addEventListener('disconnected', () => { c.userData.src = null })
    c.addEventListener('selectstart', () => onSelect(c))
    c.addEventListener('squeezestart', () => grab(c))
    c.addEventListener('squeezeend', () => release(c))
    const grip = R.xr.getControllerGrip(i)
    grip.add(factory.createControllerModel(grip))
    c.visible = grip.visible = false
    scene.add(c, grip)
    ctrls.push({ c, grip })
  }
  const tmpM = new THREE.Matrix4()
  const castFrom = (c) => {
    tmpM.identity().extractRotation(c.matrixWorld)
    ray.ray.origin.setFromMatrixPosition(c.matrixWorld)
    ray.ray.direction.set(0, 0, -1).applyMatrix4(tmpM)
  }
  const panelHit = (c) => {
    castFrom(c)
    const h = ray.intersectObject(panel, false)[0]
    if (!h) return null
    const px = h.uv.x * PW, py = (1 - h.uv.y) * PH
    return { dist: h.distance, b: buttons.find((b) => px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) }
  }
  const partName = (c) => {
    castFrom(c)
    const h = ray.intersectObject(lab.machine, true).find((x) => x.object.visible && x.object.layers.mask & 1)
    if (!h) return ''
    for (let o = h.object; o; o = o.parent) { const p = lab.parts.find((pp) => pp.obj === o); if (p?.name) return p.name }
    return ''
  }
  function onSelect(c) {
    const ph = panelHit(c)
    if (ph?.b) { ph.b.act(); drawPanel(); return }
    if (!ph) lab.toggle('explode')
  }
  function grab(c) { c.attach(root); c.userData.held = true }
  function release(c) { if (c.userData.held) { scene.attach(root); c.userData.held = false } }

  // ---------------------------------------------------------------- 4. enter / exit
  function placeDevice() {
    // centre the machine 0.75 m in front of the viewer at chest height, magnified
    root.position.set(0, 0, 0); root.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(opt.yaw ?? 0)); root.scale.setScalar(st.mag)
    root.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(lab.machine), c = box.getCenter(new THREE.Vector3())
    root.position.set(-c.x, 1.15 - c.y, -0.75 - c.z)
    // the panel sits to the left, angled toward the viewer
    panel.position.set(-0.62, 1.32, -0.62); panel.rotation.set(-0.12, 0.62, 0)
  }
  async function enter(mode) {
    if (st.on) return
    let session = null
    if (!sim) {
      try {
        session = await navigator.xr.requestSession(mode, { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] })
      } catch (err) { setWhy('Could not start ' + mode + ': ' + err.message); return }
    }
    st.on = true; st.mode = sim ? (sim === 'ar' ? 'immersive-ar' : 'immersive-vr') : mode; st.session = session
    // remember the desktop state so exit() restores it exactly
    st.saved = { pos: root.position.clone(), quat: root.quaternion.clone(), scale: root.scale.clone(), bg: scene.background, floorY: lab.floor.position.y, floorVis: lab.floor.visible, contact: lab._contact.plane.visible, clearA: R.getClearAlpha(), shadow: lab.key.castShadow }
    lab.key.castShadow = false                      // shadows are the most expensive thing on a standalone headset
    lab._contact.plane.visible = false
    if (st.mode === 'immersive-ar') {               // passthrough: no backdrop, no floor, transparent clear
      scene.background = null; lab.floor.visible = false; R.setClearAlpha(0)
    } else {
      lab.floor.position.y = 0                       // real floor at y = 0 in local-floor space
    }
    placeDevice()
    panel.visible = true
    document.documentElement.classList.add('xr-on')
    if (session) {
      R.xr.enabled = true
      R.xr.setReferenceSpaceType('local-floor')
      await R.xr.setSession(session)
      for (const { c, grip } of ctrls) c.visible = grip.visible = true
      session.addEventListener('end', () => exit(true))
    } else {
      // simulated head pose for checking the layout on a desktop
      lab.camera.clearViewOffset()
      lab.camera.position.set(0, 1.6, 0.05); lab.camera.fov = 70; lab.camera.lookAt(-0.12, 1.2, -0.75); lab.camera.updateProjectionMatrix()
      lab.controlsOrbit.enabled = false
    }
    let last = performance.now(), tPanel = 0
    R.setAnimationLoop((now) => {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now
      lab._assembly = 0
      lab._update(dt)
      pollGamepads(dt)
      // hover feedback and "pointing at" from whichever controller points at something
      hover = null; pointing = ''
      for (const { c } of ctrls) {
        if (!c.visible) continue
        const ph = panelHit(c)
        if (ph) { hover = ph.b ?? null; c.userData.line.scale.z = ph.dist; continue }
        c.userData.line.scale.z = 2
        const n = partName(c); if (n) pointing = n
      }
      tPanel += dt; if (tPanel > 0.1) { tPanel = 0; drawPanel() }
      R.render(scene, lab.camera)
    })
  }
  function exit(fromSession) {
    if (!st.on) return
    if (!fromSession && st.session) { st.session.end(); return }     // 'end' event calls exit(true)
    R.setAnimationLoop(null)
    for (const { c, grip } of ctrls) { release(c); c.visible = grip.visible = false }
    const s = st.saved
    root.position.copy(s.pos); root.quaternion.copy(s.quat); root.scale.copy(s.scale)
    scene.background = s.bg; lab.floor.position.y = s.floorY; lab.floor.visible = s.floorVis
    lab._contact.plane.visible = s.contact; R.setClearAlpha(s.clearA); lab.key.castShadow = s.shadow
    panel.visible = false
    lab.controlsOrbit.enabled = true
    lab.setView({})
    document.documentElement.classList.remove('xr-on')
    st.on = false; st.session = null
    // the kit's own requestAnimationFrame loop resumes by itself after the session ends
  }
  // the kit loop must not draw through the composer while the XR loop owns the frame
  const kitRender = lab.render.bind(lab)
  lab.render = (dt) => { if (!st.on) kitRender(dt) }

  // ---------------------------------------------------------------- 5. gamepad polling
  // Quest Touch: buttons[0]=trigger [1]=squeeze [3]=stick press [4]=A/X [5]=B/Y; axes[2],[3]=stick
  function pollGamepads(dt) {
    for (const { c } of ctrls) {
      const src = c.userData.src, gp = src?.gamepad
      if (!gp) continue
      const edge = (i) => { const p = !!gp.buttons[i]?.pressed, was = c.userData.btn[i]; c.userData.btn[i] = p; return p && !was }
      if (edge(4)) lab.toggle('xray')
      if (edge(5)) lab.toggle('cut')
      if (src.handedness === 'right' || ctrls.length === 1) {
        const ax = gp.axes[2] ?? 0, ay = gp.axes[3] ?? 0
        if (Math.abs(ax) > 0.15 && !c.userData.held) root.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), -ax * dt * 1.8)
        if (Math.abs(ay) > 0.2 && !c.userData.held) {
          const f = Math.exp(-ay * dt * 0.9); st.mag = THREE.MathUtils.clamp(st.mag * f, 0.25, 40)
          root.scale.setScalar(st.mag)
        }
      }
    }
  }

  if (sim) setTimeout(() => enter(sim === 'ar' ? 'immersive-ar' : 'immersive-vr'), 300)
  return { enter, exit, state: st }
}

// small canvas helpers
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath() }
function wrap(g, text, x, y, w, lh, maxLines) {
  const words = String(text).split(/\s+/); let line = '', n = 0
  for (const wd of words) { const t = line ? line + ' ' + wd : wd; if (g.measureText(t).width > w && line) { g.fillText(line, x, y); y += lh; line = wd; if (++n >= maxLines) return } else line = t }
  if (line) g.fillText(line, x, y)
}

// =====================================================================================
//  Shared Device Lab helpers (exposed as window.DevLab for the device scripts)
// =====================================================================================

/** APA 7 reference list as HTML for the "How it is computed" panel */
export function refsHTML(list) {
  return `<div class="dl-refs"><b>References</b>${list.map((r) => `<p>${r}</p>`).join('')}</div>`
}

/** a camera / sensor field of view drawn as glowing edges (hfov, vfov in degrees, length in metres) */
export function frustum(hfov, vfov, len, color = 0x0072B2, opacity = 0.55) {
  const tx = Math.tan(THREE.MathUtils.degToRad(hfov / 2)) * len, ty = Math.tan(THREE.MathUtils.degToRad(vfov / 2)) * len
  const c = [[-tx, -ty], [tx, -ty], [tx, ty], [-tx, ty]]
  const p = []
  for (const [x, y] of c) p.push(0, 0, 0, x, y, len)
  for (let i = 0; i < 4; i++) { const a = c[i], b = c[(i + 1) % 4]; p.push(a[0], a[1], len, b[0], b[1], len) }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3))
  const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false }))
  l.layers.set(1); l.renderOrder = 4
  return l
}

/** a simple polyline in the FX layer (used for rays, sweeps and data links) */
export function polyline(points, color = 0xE69F00, opacity = 0.9) {
  const g = new THREE.BufferGeometry().setFromPoints(points.map((q) => new THREE.Vector3(...q)))
  const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false }))
  l.layers.set(1); l.renderOrder = 4; l.frustumCulled = false
  return l
}

/** top-left link back to the book and the Device Lab index, plus a little CSS for references */
export function chrome(title) {
  const s = document.createElement('style')
  s.textContent = `.dl-nav{position:fixed;left:18px;top:84px;z-index:40;font:500 12px Inter,system-ui,sans-serif;display:flex;gap:8px}
  .dl-nav a{color:#16181b;text-decoration:none;background:#fff;border:1px solid rgba(0,0,0,.15);padding:6px 11px;border-radius:999px}
  .lab-night .dl-nav a{background:#1b1d21;color:#eee;border-color:#333}
  .dl-refs{margin-top:10px;font-size:11px;line-height:1.45;opacity:.85}.dl-refs p{margin:4px 0 0;padding-left:1.4em;text-indent:-1.4em}
  .lab-embed .dl-nav{display:none}`
  document.head.appendChild(s)
  const n = document.createElement('div'); n.className = 'dl-nav'
  n.innerHTML = `<a href="../index.html">← Mirror Worlds book</a><a href="index.html">Device Lab</a>`
  document.body.appendChild(n)
}

/** dark mannequin head on a display stand, eyes at height ey (m); returns nothing, parts are registered */
export function headStand(lab, MAT, GEO, ey, z = -0.06) {
  const standM = MAT.paint({ color: [0.1, 0.1, 0.11], roughness: 0.4 })
  const headM = MAT.satin({ color: [0.32, 0.33, 0.35], roughness: 0.7 })
  lab.mesh(GEO.disc(0.11, 0.016, 0.003), standM, { name: 'Stand base', pos: [0, 0.008, z] })
  lab.mesh(GEO.tube(0.012, 0, ey - 0.16), standM, { name: 'Stand post', pos: [0, (ey - 0.16) / 2 + 0.01, z] })
  const g = new THREE.SphereGeometry(1, 48, 32); g.scale(0.078, 0.115, 0.1)
  lab.mesh(g, headM, { name: 'Mannequin head', pos: [0, ey + 0.01, z] })
  lab.mesh(GEO.tube(0.038, 0, 0.08), headM, { name: 'Neck', pos: [0, ey - 0.11, z - 0.005] })
}

// Kit patch: lab.add() records a part's rest position when it is added, so a position set
// on the returned object afterwards (lab.add(m).position.y = 0.01) would be lost on the
// first frame. Before the loop starts, adopt any such later position as the rest position.
const KitLab = typeof window !== 'undefined' ? window.LabKit?.Lab : null
if (KitLab && !KitLab.prototype._dlPatched) {
  const start0 = KitLab.prototype.start
  KitLab.prototype.start = function () { for (const p of this.parts) if (!p.obj.position.equals(p.base)) p.base.copy(p.obj.position); return start0.call(this) }
  KitLab.prototype._dlPatched = true
}

if (typeof window !== 'undefined') window.DevLab = { addXR, refsHTML, frustum, polyline, chrome, headStand }
