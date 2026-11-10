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
  const modes = [['explode', 'Explode'], ['cut', 'Cut away'], ['xray', 'X-ray'], ['slow', 'Slow'], ['labels', 'Labels']]
  modes.forEach(([k, t], i) => mk(36 + i * 192, 392, 178, 70, t, () => lab.toggle(k), () => lab.target[k] > 0.5))
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

  // ---------------------------------------------------------------- 2b. labels in XR
  // The kit's labels are HTML on top of the page, which a headset cannot show. In XR each label
  // is mirrored as a camera-facing sprite with a leader line, placed beside the device on the
  // side it is on (as seen from the head) and spread so labels never overlap.
  const xrLabs = new THREE.Group(); xrLabs.visible = false; xrLabs.renderOrder = 11; scene.add(xrLabs)
  let lab3 = null
  const LH = 0.04                                    // label height in metres (readable at arm's length)
  function makeLab3(L) {
    const c = document.createElement('canvas'); c.width = 768; c.height = 96
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false, toneMapped: false }))
    sp.renderOrder = 12; xrLabs.add(sp)
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()])
    const ln = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x16181b, transparent: true, opacity: 0.6, depthTest: false }))
    ln.renderOrder = 12; xrLabs.add(ln)
    return { L, c, t, sp, ln, text: '', anchor: new THREE.Vector3(), side: 1, y: 0 }
  }
  function drawLab3(o, text) {
    const g = o.c.getContext('2d'), H = o.c.height
    g.font = '500 44px Inter, sans-serif'
    const w = Math.min(o.c.width, Math.ceil(g.measureText(text).width) + 48)
    g.clearRect(0, 0, o.c.width, H)
    g.fillStyle = 'rgba(255,255,255,0.94)'; roundRect(g, 0, 8, w, H - 16, 22); g.fill()
    g.strokeStyle = 'rgba(0,0,0,.22)'; g.lineWidth = 3; g.stroke()
    g.fillStyle = '#16181b'; g.fillText(text, 24, H / 2 + 15)
    o.t.needsUpdate = true; o.text = text
    o.sp.scale.set(LH * o.c.width / H, LH, 1)
    o.sp.center.set(o.side > 0 ? 24 / o.c.width : (w - 24) / o.c.width, 0.5)   // text starts at the leader line
  }
  const _c = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _v = new THREE.Vector3()
  function updateXRLabels() {
    const on = lab.state.labels ?? 0
    xrLabs.visible = on > 0.01
    if (!xrLabs.visible) return
    if (!lab3) lab3 = lab.labels.map(makeLab3)
    const cam = R.xr.isPresenting ? R.xr.getCamera() : lab.camera
    cam.updateMatrixWorld()
    _r.setFromMatrixColumn(cam.matrixWorld, 0).normalize()        // head right
    _u.setFromMatrixColumn(cam.matrixWorld, 1).normalize()        // head up
    lab.machine.updateWorldMatrix(true, false); _c.setFromMatrixPosition(lab.machine.matrixWorld)
    for (const o of lab3) {
      o.L.obj.updateWorldMatrix(true, false)
      o.anchor.copy(o.L.at).applyMatrix4(o.L.obj.matrixWorld)
      o.visible = o.L.obj.visible !== false
      const side = o.L.side === 'left' ? -1 : o.L.side === 'right' ? 1 : (_v.copy(o.anchor).sub(_c).dot(_r) < 0 ? -1 : 1)
      if (side !== o.side) { o.side = side; o.text = '' }
      o.y = _v.copy(o.anchor).sub(_c).dot(_u)
      const val = typeof o.L.value === 'function' ? o.L.value() : (o.L.small?.textContent ?? '')
      const name = (o.L.el.firstChild?.textContent ?? '').trim()
      const text = val ? name + '  ' + val : name
      if (text !== o.text) drawLab3(o, text)
    }
    // spread per side along head-up so labels never overlap, then place them beside the device
    for (const side of [-1, 1]) {
      const list = lab3.filter((o) => o.side === side && o.visible).sort((a, b) => b.y - a.y)
      let last = 1e9
      for (const o of list) {
        const y = Math.min(o.y, last - LH * 1.35); last = y
        const x = Math.abs(_v.copy(o.anchor).sub(_c).dot(_r)) + 0.08          // 8 cm beside its own anchor
        const p = _v.copy(_c).addScaledVector(_r, side * x).addScaledVector(_u, y)
        o.sp.position.copy(p)
        o.ln.geometry.attributes.position.setXYZ(0, o.anchor.x, o.anchor.y, o.anchor.z)
        o.ln.geometry.attributes.position.setXYZ(1, p.x, p.y, p.z)
        o.ln.geometry.attributes.position.needsUpdate = true
      }
    }
    for (const o of lab3) {
      o.sp.visible = o.ln.visible = o.visible
      o.sp.material.opacity = on; o.ln.material.opacity = 0.6 * on
    }
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
      updateXRLabels()
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
    panel.visible = false; xrLabs.visible = false
    lab.controlsOrbit.enabled = true
    lab.setView({})
    document.documentElement.classList.remove('xr-on')
    st.on = false; st.session = null
    // the kit's own requestAnimationFrame loop resumes by itself after the session ends
  }
  // the kit loop must not draw through the composer while the XR loop owns the frame
  let kitRender = lab.render.bind(lab)
  // Black-screen watchdog. On some desktop GPUs/browsers (seen: Chrome + Intel UHD with the
  // Immersive Web Emulator extension) the kit's large multisampled half-float render targets come
  // back black. Once a second for the first ~40 s we sample the frame edges, which always show the light
  // studio; if they are black we first drop MSAA on the composer targets, then, if still black,
  // render the scene directly without post-processing.
  let frames = 0, fix = 0
  lab.render = (dt) => {
    if (st.on) return
    kitRender(dt)
    if (fix < 3 && ++frames % 60 === 0 && frames <= 2400) checkBlack()    // once a second for ~40 s
    governor()
  }

  // Adaptive quality. The kit renders at up to 2x pixel ratio with ambient occlusion (GTAO),
  // bloom and 4x MSAA, which an integrated GPU (e.g. Intel UHD on a 2.5x laptop screen) cannot
  // keep at 60 fps. When the average frame takes longer than ~22 ms (under ~45 fps) for 1.5 s,
  // we step down one level: lower pixel ratio, cheaper AO, then no AO, then no bloom.
  // ?q=high keeps full quality, ?q=low starts at the lowest level.
  const QL = [
    { pr: 2, ao: 16, aoOn: true, bloom: true },
    { pr: 1.5, ao: 8, aoOn: true, bloom: true },
    { pr: 1.25, ao: 8, aoOn: false, bloom: true },
    { pr: 1, ao: 8, aoOn: false, bloom: false },
    { pr: 0.75, ao: 8, aoOn: false, bloom: false }
  ]
  const qParam = new URLSearchParams(location.search).get('q')
  let qLevel = 0, qCap = 2, lastT = 0, ema = 16.7, slowMs = 0, coolMs = 0, warm = 0
  const setPR = R.setPixelRatio.bind(R)
  R.setPixelRatio = (v) => setPR(Math.min(v, qCap))                // the kit's resize handler respects the cap
  function applyQ(l) {
    qLevel = l; const q = QL[l]; qCap = q.pr
    const pr = Math.min(devicePixelRatio, qCap)
    setPR(pr); R.setSize(innerWidth, innerHeight)
    const C = lab.composer
    if (C) { C.setPixelRatio(pr); C.setSize(innerWidth, innerHeight) }
    if (lab.ao) { lab.ao.enabled = q.aoOn; lab.ao.updateGtaoMaterial?.({ samples: q.ao }) }
    if (lab.bloom) lab.bloom.enabled = q.bloom
    console.info('[Device Lab] quality level ' + l + ' (pixel ratio ' + pr + (q.aoOn ? '' : ', no AO') + (q.bloom ? '' : ', no bloom') + ')')
  }
  function governor() {
    const now = performance.now(), d = now - lastT; lastT = now
    if (qParam === 'high' || d > 2000 || document.hidden) return    // hidden tab or a pause: ignore
    if (++warm < 30) return                                         // let shaders compile first
    ema += (d - ema) * 0.08
    if (coolMs > 0) { coolMs -= d; return }
    slowMs = ema > 22 ? slowMs + d : 0
    if (slowMs > 1500 && qLevel < QL.length - 1) { applyQ(qLevel + 1); slowMs = 0; coolMs = 1500; ema = 16.7 }
  }
  if (qParam === 'low') applyQ(QL.length - 2)
  window.__quality = (set) => { if (set != null) applyQ(set); return { level: qLevel, ema: Math.round(ema), warm, cap: qCap } }
  function checkBlack() {
    const gl = R.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(4)
    R.setRenderTarget(null)
    let dark = 0
    for (const [x, y] of [[0.03, 0.5], [0.03, 0.97], [0.5, 0.97], [0.5, 0.03]]) {
      gl.readPixels(Math.floor(x * w), Math.floor(y * h), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px)
      if (px[0] + px[1] + px[2] < 40) dark++
    }
    if (dark < 3) return                                        // looks right (the intro can differ, so keep checking)
    const C = lab.composer
    if (fix === 0 && C) {
      for (const rt of [C.renderTarget1, C.renderTarget2]) { rt.samples = 0; rt.dispose() }
      console.warn('[Device Lab] black frame: multisampling turned off for post-processing')
      fix = 1
    } else {
      kitRender = () => { R.setRenderTarget(null); R.render(scene, lab.camera) }
      console.warn('[Device Lab] black frame: post-processing turned off')
      fix = 3
    }
  }

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

// =====================================================================================
//  The Device Lab shell: the same look and structure as the Mirror Worlds book
//  (frosted top bar, contents menu, numbered pages, a work card with Predict → Test → Prove)
// =====================================================================================
/** every device, in contents order; `lessons` are book lesson ids (opened as /#id) */
export const DEVICES = [
  { id: 'quest3', name: 'Meta Quest 3', group: 'Headsets', lessons: [['twin', 'Model, shadow, twin'], ['uloop', 'The game loop'], ['xrig', 'XR Origin and interactors'], ['xloco', 'Moving in VR without feeling sick']],
    predict: { q: 'You raise Unity\'s render scale from 1.0 to 1.4 at 90 Hz. How many more pixels must the GPU shade each second?', options: ['1.4 times as many', 'About 2 times as many', 'The same number, just sharper'], answer: 1,
      why: 'Render scale multiplies both width and height, so the pixel count grows with its square: 1.4² ≈ 1.96. Try it on the Unity render scale slider and watch the Mpx/s figure.' } },
  { id: 'varjo', name: 'Varjo XR-3 · XR-4', group: 'Headsets', lessons: [['sync', 'Validating the twin']],
    predict: { q: 'Straight ahead your eye resolves about 60 pixels per degree. How much does it resolve 20° to the side?', options: ['Still about 60 px/°', 'About 6 px/°', 'About 20 px/°'], answer: 1,
      why: 'Acuity halves within about 2.3° of the gaze: 60 / (1 + 20/2.3) ≈ 6 px/°. That is why eye-tracked foveated rendering can spend full resolution only where you look.' } },
  { id: 'ml2', name: 'Magic Leap 2', group: 'Headsets', lessons: [],
    predict: { q: 'With dimming off, you walk from a 500 lx lab to a 5,000 lx window. What happens to the hologram\'s contrast?', options: ['It stays the same', 'It drops about 10 times', 'It gets better'], answer: 1,
      why: 'See-through AR can only add light. Ten times more room light coming through the lens means roughly ten times less contrast for the same hologram, until the dimmer cuts the background.' } },
  { id: 'touch', name: 'Touch Plus controllers', group: 'Tracking & input', lessons: [['xrig', 'XR Origin and interactors'], ['xgrab', 'Grabbing objects']],
    predict: { q: 'How many of the controller\'s LEDs must one headset camera see to compute its full position and orientation?', options: ['One', 'Four or more', 'All of them'], answer: 1,
      why: 'Perspective-n-point needs at least four known points (three give several possible poses). With fewer, the IMU carries on alone and drift grows with time squared.' } },
  { id: 'tracking', name: 'Lighthouse vs inside-out', group: 'Tracking & input', lessons: [['sync', 'Validating the twin'], ['bidir', 'Bidirectional twin data']],
    predict: { q: 'A Vive Tracker moves from 1 m to 4 m away from the base station. What happens to its position jitter?', options: ['It stays the same', 'It grows about 4 times', 'It grows about 16 times'], answer: 1,
      why: 'The station measures angles. The same angular noise covers a distance proportional to range, so jitter grows linearly: four times further, four times the jitter.' } },
  { id: 'plux', name: 'biosignalsplux ECG', group: 'Biosignals', lessons: [['ecg', 'ECG: from R-peaks to heart rate and HRV'], ['lsl', 'LSL to MQTT'], ['adapt', 'Adaptation rules']],
    predict: { q: 'The hub streams ECG at 1000 Hz with 16 bits. How small a voltage step can it resolve at the electrodes (gain 1000, 3 V supply)?', options: ['About 0.05 µV', 'About 50 µV', 'About 1 mV'], answer: 0,
      why: 'One ADC step is VCC / 2ⁿ = 3 V / 65,536 ≈ 46 µV at the converter; divided by the sensor gain of 1000 that is ≈ 0.046 µV at the skin. An R-wave of about 1 mV spans some 20,000 steps, so amplitude is never the problem: timing (the sampling rate) is.' } },
  { id: 'zed2i', name: 'ZED 2i', group: 'Reality capture', lessons: [['stereo', 'Depth from stereo'], ['camera', 'The pinhole camera']],
    predict: { q: 'At 1 m the ZED 2i (HD1080) measures depth to within about 2 mm. How good is it at 10 m?', options: ['About 2 cm (10× worse)', 'About 20 cm (100× worse)', 'Still about 2 mm'], answer: 1,
      why: 'Disparity shrinks as 1/Z, so a fixed matching error costs depth that grows with Z². Ten times further is a hundred times the error: about 20 cm at 10 m.' } },
  { id: 'pro3', name: 'Matterport Pro3', group: 'Reality capture', lessons: [['lidar', 'LiDAR and point clouds']],
    predict: { q: 'A Pro3 scan holds about 1.5 million points over its full sphere. How far apart are neighbouring points on a wall 10 m away?', options: ['About 5 mm', 'About 5 cm', 'About 50 cm'], answer: 1,
      why: '1.5 million points over 360° × 295° is one point every ≈ 0.27°. At 10 m that is 10 m × 0.0047 rad ≈ 4.6 cm, which is why you scan every few metres.' } },
  { id: 'x5', name: 'Insta360 X5', group: 'Reality capture', lessons: [['splats', 'From photos to Gaussian splats'], ['gsanat', 'Inside one Gaussian splat']],
    predict: { q: 'A person stands on the stitch line 0.5 m from the X5, recording in 8K. How far apart are their two images at the seam?', options: ['Under 5 pixels', 'About 70 pixels', 'About 700 pixels'], answer: 1,
      why: 'The lenses are about 3 cm apart: atan(0.03 / 0.5) ≈ 3.4°, and 8K has 21.3 px/°, so ≈ 73 px. Optical-flow stitching struggles; keep people about 1 m or more away.' } },
]

let SHELL = null
/** register the page: builds the top bar now and the work card when the lab starts */
export function chrome(id) {
  const i = DEVICES.findIndex((d) => d.id === id), D = DEVICES[i]
  SHELL = { i, D }
  if (window.__lab) window.__lab.o.no = i + 1          // number devices in contents order
  const s = document.createElement('style')
  s.textContent = SHELL_CSS
  document.head.appendChild(s)
  const bar = document.createElement('header'); bar.className = 'dl-top'
  const groups = [...new Set(DEVICES.map((d) => d.group))]
  bar.innerHTML = `
    <a class="dl-brand" href="/"><b><span class="m">Mirror</span> <span class="w">Worlds</span></b><small>IT:U · RITA Lab · Device Lab</small><em>Created by Dr. Nelson Silva</em></a>
    <nav class="dl-chap" aria-label="Devices">
      <button type="button" class="dl-tocbtn" aria-expanded="false">Contents</button>
      <span class="dl-tname">${D.group}</span>
      ${DEVICES.map((d, k) => `<a href="/lab/${d.id}" title="${d.name}" ${k === i ? 'aria-current="true"' : ''}>${String(k + 1).padStart(2, '0')}</a>`).join('')}
    </nav>
    <div class="dl-tools"><a class="dl-btn" href="/">Book</a><span class="dl-xr"></span></div>
    <div class="dl-toc" hidden><p class="dl-credit">IT:U - RITA Lab - Mirror Worlds Virtual Book · Device Lab · created by Dr. Nelson J. S. Silva</p><div class="dl-toc-grid">${groups.map((g) => `<div><h4>${g}</h4>${DEVICES.map((d, k) => d.group !== g ? '' : `<a href="/lab/${d.id}" ${k === i ? 'aria-current="true"' : ''}><span class="n">${String(k + 1).padStart(2, '0')}</span><span class="t">${d.name}</span></a>`).join('')}</div>`).join('')}
      <div><h4>Overview</h4><a href="/lab/"><span class="n">··</span><span class="t">All devices</span></a><a href="/"><span class="n">↗</span><span class="t">Back to the book</span></a></div></div></div>`
  document.body.appendChild(bar)
  const tb = bar.querySelector('.dl-tocbtn'), toc = bar.querySelector('.dl-toc')
  tb.addEventListener('click', () => { const open = toc.hidden; toc.hidden = !open; tb.setAttribute('aria-expanded', String(open)) })
  addEventListener('keydown', (e) => { if (e.key === 'Escape') { toc.hidden = true; tb.setAttribute('aria-expanded', 'false') } })
}

/** turn the kit's side column into the book's work card: eyebrow, title, Predict, Test, Prove, pager */
function buildCard(lab) {
  if (!SHELL || lab.embed) return
  const { i, D } = SHELL, side = lab.$('.lab-side'), how = lab.$('.lab-how')
  const prev = DEVICES[i - 1], next = DEVICES[i + 1]
  side.classList.add('on', 'dl-card')
  const no = side.querySelector('.lab-no'), title = side.querySelector('.lab-title'), metric = side.querySelector('.lab-metric'), ctls = side.querySelector('.lab-ctls')
  no.innerHTML = `Device ${String(i + 1).padStart(2, '0')} · ${D.group}`
  const ask = document.createElement('p'); ask.className = 'dl-ask'; ask.textContent = lab.o.prompt ?? ''
  const links = D.lessons.length ? `<p class="dl-links">In the book: ${D.lessons.map(([id, t]) => `<a href="/#${id}">${t} ↗</a>`).join('')}</p>` : ''
  const P = D.predict
  const pred = document.createElement('section'); pred.className = 'dl-step'
  pred.innerHTML = `<h3><b>1</b>Predict</h3><p class="dl-q">${P.q}</p><div class="dl-opts">${P.options.map((o, k) => `<button type="button" data-k="${k}">${o}</button>`).join('')}</div><p class="dl-note">Your choice locks once you pick it.</p>`
  const test = document.createElement('section'); test.className = 'dl-step'
  test.innerHTML = `<h3><b>2</b>Test</h3><p class="dl-hint">Move the slider, then try Explode, Cut away, X-ray and the red button under the model.</p>`
  test.append(metric, ctls)
  const prove = document.createElement('section'); prove.className = 'dl-step'
  prove.innerHTML = `<h3><b>3</b>Prove</h3><button type="button" class="dl-lift">Show the answer</button><div class="dl-answer" hidden></div>`
  how.classList.add('dl-how'); how.open = false
  prove.append(how)
  const pager = document.createElement('nav'); pager.className = 'dl-pager'
  pager.innerHTML = `${prev ? `<a href="/lab/${prev.id}">← Previous<span>${prev.name}</span></a>` : '<span></span>'}${next ? `<a href="/lab/${next.id}">Next →<span>${next.name}</span></a>` : `<a href="/">Back to the book →<span>Mirror Worlds</span></a>`}`
  title.insertAdjacentElement('afterend', ask)
  if (links) ask.insertAdjacentHTML('afterend', links)
  side.append(pred, test, prove, pager)
  // predict → lock; prove → reveal the verdict and the reasoning
  let pick = null
  try { pick = JSON.parse(localStorage.getItem('dl-pred-' + D.id) ?? 'null') } catch (e) { pick = null }
  const opts = [...pred.querySelectorAll('button')], note = pred.querySelector('.dl-note'), ans = prove.querySelector('.dl-answer'), lift = prove.querySelector('.dl-lift')
  const lock = (k) => { pick = k; opts.forEach((b, j) => { b.disabled = true; b.setAttribute('aria-pressed', String(j === k)) }); note.textContent = 'Locked in. Now test it on the model.' }
  if (pick !== null) lock(pick)
  opts.forEach((b, k) => b.addEventListener('click', () => { if (pick !== null) return; lock(k); try { localStorage.setItem('dl-pred-' + D.id, String(k)) } catch (e) { /* storage unavailable */ } }))
  lift.addEventListener('click', () => {
    const ok = pick === P.answer
    ans.innerHTML = `<p class="dl-verdict ${pick === null ? '' : ok ? 'ok' : 'no'}">${pick === null ? 'Answer' : ok ? 'Your prediction was right.' : 'Not quite.'} ${P.options[P.answer]}.</p><p>${P.why}</p>`
    ans.hidden = false; lift.disabled = true; how.open = true
  })
  // the XR buttons move into the top bar
  const xr = document.querySelector('.xr-bar'); if (xr) document.querySelector('.dl-xr')?.append(xr)
}

const SHELL_CSS = `
:root{--paper:#F4F6F8;--ink:#1B2027;--mute:#6B7581;--faint:#B3BCC6;--line:#DEE3E9;--accent:#D55E00;--phys:#C2610C;--dig:#1F63B5}
.lab-prompt,.lab-pills{display:none!important}
.dl-top{position:fixed;top:0;left:0;right:0;z-index:30;display:flex;align-items:center;gap:10px 18px;flex-wrap:nowrap;padding:10px 16px;
  background:rgba(255,255,255,.86);-webkit-backdrop-filter:saturate(1.4) blur(12px);backdrop-filter:saturate(1.4) blur(12px);border-bottom:1px solid var(--line);font:500 12px Inter,system-ui,sans-serif}
.dl-brand{display:flex;flex-direction:column;text-decoration:none;color:var(--ink);line-height:1;white-space:nowrap;flex:0 0 auto}
.dl-brand b{font:400 26px/1 "Instrument Serif",Georgia,serif;letter-spacing:-.01em} .dl-brand .m{color:var(--phys)} .dl-brand .w{color:var(--dig);font-style:italic}
.dl-brand em{font:500 11px/1.2 Inter,system-ui,sans-serif;font-style:normal;color:var(--ink);margin-top:3px}
.dl-brand small{font:500 10px "JetBrains Mono",monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--mute);margin-top:4px}
.dl-chap{display:flex;align-items:center;gap:4px;overflow-x:auto;scrollbar-width:none;min-width:0;flex:1 1 auto}
.dl-chap > *{flex:0 0 auto}
.dl-chap a{width:38px!important;min-width:0!important;padding:0!important}
.dl-chap a,.dl-tocbtn,.dl-btn{font:500 12px "JetBrains Mono",monospace;color:var(--mute);background:#fff;border:1px solid var(--line);border-radius:8px;height:32px;min-width:36px;display:inline-grid;place-items:center;padding:0 10px;text-decoration:none;cursor:pointer}
.dl-tocbtn{color:var(--ink);letter-spacing:.06em;text-transform:uppercase;font-size:11px}
.dl-tocbtn[aria-expanded="true"],.dl-chap a[aria-current="true"]{background:var(--ink);color:#fff;border-color:var(--ink)}
.dl-tname{font:600 11px "JetBrains Mono",monospace;letter-spacing:.08em;text-transform:uppercase;color:var(--phys);padding:0 6px;white-space:nowrap}
.dl-tools{margin-left:auto;display:flex;gap:8px;align-items:center;flex:0 0 auto;white-space:nowrap}
.dl-btn{color:var(--ink);text-transform:uppercase;letter-spacing:.08em;font-size:11px}
.dl-toc{position:absolute;top:100%;left:16px;right:16px;max-width:900px;margin-top:8px;background:#fff;border-radius:14px;padding:18px 20px;box-shadow:0 24px 60px -20px rgba(16,24,40,.35),0 0 0 1px rgba(16,24,40,.06)}
.dl-credit{margin:0 0 12px;font:600 13px/1.35 Inter,system-ui,sans-serif;color:var(--ink)}
.dl-toc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:14px 22px}
.dl-toc h4{font:600 11px "JetBrains Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--phys);margin:0 0 6px;padding-bottom:6px;border-bottom:1px solid var(--line)}
.dl-toc a{display:flex;gap:10px;align-items:baseline;padding:7px 8px;border-radius:8px;color:var(--ink);text-decoration:none}
.dl-toc a:hover{background:#F3F5F8} .dl-toc a[aria-current="true"]{background:var(--ink);color:#fff}
.dl-toc .n{font:500 11px "JetBrains Mono",monospace;opacity:.7} .dl-toc .t{font:500 14px Inter,sans-serif}
.dl-xr .xr-bar{position:static;display:flex;gap:6px}
.dl-xr .xr-bar button{height:32px;padding:0 12px;white-space:nowrap;border-radius:8px;font:600 12px Inter,sans-serif}
.dl-xr .xr-bar .why{left:auto;right:0;top:40px}
/* the work card */
.lab-side.dl-card{top:76px;bottom:16px;right:16px;transform:none;width:min(380px,32vw);background:#fff;border-radius:16px;padding:20px 22px 16px;overflow-y:auto;overscroll-behavior:contain;
  box-shadow:0 24px 60px -24px rgba(16,24,40,.35),0 0 0 1px rgba(16,24,40,.07)}
.dl-card .lab-no{font:500 10.5px "JetBrains Mono",monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--mute)}
.dl-card .lab-title{font-size:clamp(30px,2.5vw,44px);line-height:1}
.dl-card .lab-title i{display:inline;font-size:.62em;margin-left:.25em;color:var(--mute)}
.dl-ask{font:400 14px/1.5 Inter,sans-serif;color:var(--mute);margin:.6em 0 0}
.dl-links{font:500 11px/1.6 "JetBrains Mono",monospace;color:var(--mute);margin:.5em 0 0}
.dl-links a{display:inline-block;color:var(--dig);text-decoration:none;border:1px solid rgba(31,99,181,.3);background:rgba(31,99,181,.06);padding:2px 9px;border-radius:999px;margin:.25em .35em 0 0}
.dl-step{border-top:1px solid var(--line);padding-top:14px;margin-top:16px;display:flex;flex-direction:column;gap:10px}
.dl-step h3{font:600 11px "JetBrains Mono",monospace;letter-spacing:.14em;text-transform:uppercase;margin:0;display:flex;gap:9px;align-items:center}
.dl-step h3 b{display:inline-grid;place-items:center;width:22px;height:22px;border-radius:50%;background:var(--ink);color:#fff;font-size:11px;letter-spacing:0}
.dl-q{font:500 14.5px/1.5 Inter,sans-serif;margin:0}
.dl-opts{display:grid;gap:7px}
.dl-opts button{text-align:left;font:400 14px/1.35 Inter,sans-serif;padding:10px 12px;border:1px solid var(--line);background:#F3F5F8;border-radius:10px;cursor:pointer;color:var(--ink)}
.dl-opts button:hover:not(:disabled){border-color:var(--ink)} .dl-opts button[aria-pressed="true"]{background:var(--ink);color:#fff;border-color:var(--ink)}
.dl-opts button:disabled:not([aria-pressed="true"]){opacity:.5;cursor:default}
.dl-note,.dl-hint{font:400 12px/1.5 Inter,sans-serif;color:var(--mute);margin:0}
.dl-card .lab-metric{margin-top:0} .dl-card .lab-big{font-size:clamp(48px,4.4vw,80px)}
.dl-card .lab-metric .lbl,.dl-card .lab-sub,.dl-card .lab-ctl .row{font-size:13px} .dl-card .lab-ctl{margin-top:12px} .dl-card .lab-ctl .ends{font-size:11px}
.dl-lift{align-self:start;font:600 11px "JetBrains Mono",monospace;letter-spacing:.1em;text-transform:uppercase;background:var(--ink);color:#fff;border:0;border-radius:999px;padding:11px 18px;cursor:pointer}
.dl-lift:disabled{opacity:.45;cursor:default}
.dl-answer p{margin:0 0 8px;font:400 14px/1.55 Inter,sans-serif} .dl-verdict{font-weight:600!important} .dl-verdict.ok{color:var(--dig)} .dl-verdict.no{color:var(--phys)}
.lab-how.dl-how{position:static;width:auto;font-size:13px;pointer-events:auto}
.dl-pager{display:flex;justify-content:space-between;gap:12px;margin-top:18px;border-top:1px solid var(--line);padding-top:12px}
.dl-pager a{font:500 11px "JetBrains Mono",monospace;color:var(--ink);text-decoration:none;max-width:48%} .dl-pager a:last-child{text-align:right}
.dl-pager span{display:block;font:600 14px Inter,sans-serif;margin-top:2px}
.dl-refs{margin-top:10px;font-size:11px;line-height:1.45;opacity:.85}.dl-refs p{margin:4px 0 0;padding-left:1.4em;text-indent:-1.4em}
.lab-scale{bottom:calc(4.2vh + 3.4em)}
.lab-embed .dl-top{display:none}
.xr-on .dl-top{display:none}
@media (max-width:760px){
  .dl-chap a{display:none} .dl-chap .dl-tocbtn{display:inline-grid}
  .lab-side.dl-card{top:auto;left:8px;right:8px;bottom:8px;width:auto;max-height:46vh}
  .lab-modes{bottom:calc(46vh + 16px)}
}
`

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
  KitLab.prototype.start = function () { for (const p of this.parts) if (!p.obj.position.equals(p.base)) p.base.copy(p.obj.position); const r = start0.call(this); buildCard(this); return r }
  // cool grey studio instead of the kit's warm paper (the floor fades into the same colour)
  const studio0 = KitLab.prototype._initStudio
  KitLab.prototype._initStudio = function () { this.o.bg ??= 0xF4F6F8; const r = studio0.call(this); this.key?.color.set(0xffffff); return r }
  KitLab.prototype._dlPatched = true
}

if (typeof window !== 'undefined') window.DevLab = { addXR, refsHTML, frustum, polyline, chrome, headStand, DEVICES }
