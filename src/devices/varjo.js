// =====================================================================================
//  Device Lab No. 04 · Varjo XR-3 and XR-4 (PC-tethered high-end mixed reality)
//  XR-4: mini-LED 3840 x 3744 per eye, 120 x 105 deg, up to 51 PPD, 2 x 20 MP passthrough,
//        LiDAR (7 m), 200 Hz eye tracking, 1021 g with headband.
//  XR-3: "bionic display": uOLED focus area 1920 x 1920 over 27 x 27 deg (~70 PPD)
//        on top of an LCD context display 2880 x 2720 over 115 deg (~30 PPD), 2 x 12 MP
//        passthrough, LiDAR, 200 Hz eye tracking.
//  Solver: pixels per degree at the gaze, against human acuity (60 px/deg = 1 arcmin),
//  which falls with eccentricity: needed(e) = 60 / (1 + e / 2.3).
//  Foveated rendering keeps full resolution only around the tracked gaze.
// =====================================================================================
const { THREE, Lab, MAT, GEO, clamp, lerp, approach, fmt } = window.LabKit
const { addXR, refsHTML, frustum, polyline, chrome, headStand } = window.DevLab

const EY = 0.47, ZV = 0.1, W = 0.205, Hh = 0.118, Dv = 0.1
const E2 = 2.3               // eccentricity where human acuity halves (deg)
const FOV_FOVEA = 15         // half width of the full-resolution foveated region (deg)
const FOV_PERIPH_SCALE = 0.4 // render resolution outside it, fraction of full

const lab = new Lab({
  prompt: 'a headset with human-eye resolution: how do Varjo XR-3 and XR-4 get there?',
  no: 4, title: 'Varjo XR-3 · XR-4', sub: 'eye resolution',
  size: 0.5,
  view: { az: 34, el: 10, dist: 1.6, target: [0, 0.42, 0.0], fov: 30 },
  cut: { a: [1, 0, 0], b: [0, 1, 0], center: [0, EY, ZV], reach: 0.35 },
  pills: ['Foveated rendering', 'Eye tracking', 'WebXR'],
})
chrome('Varjo')
headStand(lab, MAT, GEO, EY)

const shellM = MAT.paint({ color: [0.12, 0.125, 0.13], roughness: 0.42, clearcoat: 0.3 })
const frontM = MAT.plastic({ color: [0.02, 0.02, 0.024], roughness: 0.08, clearcoat: 1 })
const accentM = MAT.anodised({ color: [0.55, 0.56, 0.58] })
const lensGlass = MAT.glass({ color: [0.75, 0.8, 0.95], thickness: 0.003 })
const optic = MAT.glass({ color: [0.92, 0.96, 1.0], ior: 1.55, thickness: 0.012 })
const pcbM = MAT.plastic({ color: [0.04, 0.2, 0.1], roughness: 0.4 })
const chipM = MAT.plastic({ color: [0.02, 0.02, 0.022], roughness: 0.3 })
const padM = MAT.satin({ color: [0.08, 0.08, 0.085], roughness: 0.9 })
const lcdM = MAT.paint({ color: [0.02, 0.02, 0.03], roughness: 0.1, clearcoat: 1 })
const irM = MAT.glow({ emissive: [0.9, 0.1, 0.1], emissiveIntensity: 1.5 })
const camRing = MAT.aluminiumMachined()

const zF = ZV + Dv / 2
lab.mesh(GEO.rbox(W, Hh, Dv, 0.034), shellM, { name: 'Visor shell', pos: [0, EY, ZV], explode: [0, 0, 0.18], xray: 'shell', label: 'Visor · 665 g front' })
lab.mesh(GEO.rbox(W - 0.02, Hh - 0.03, 0.006, 0.02), frontM, { name: 'Front glass panel', pos: [0, EY + 0.004, zF], explode: [0, 0, 0.24] })
// two 20 MP passthrough cameras, spaced like your eyes so the passthrough has correct stereo
const disc = (r, h) => { const g = GEO.disc(r, h, h * 0.15, 48); g.rotateX(Math.PI / 2); return g }
for (const s of [-1, 1]) {
  lab.mesh(disc(0.013, 0.008), camRing, { name: `${s < 0 ? 'Left' : 'Right'} camera bezel`, pos: [s * 0.032, EY + 0.006, zF + 0.004], explode: [s * 0.03, 0, 0.26] })
  lab.mesh(disc(0.009, 0.004), lensGlass, { name: `${s < 0 ? 'Left' : 'Right'} 20 MP passthrough camera`, pos: [s * 0.032, EY + 0.006, zF + 0.008], explode: [s * 0.03, 0, 0.27], label: s > 0 ? '20 MP passthrough (stereo)' : undefined })
  const fr = frustum(90, 80, 0.12, 0xE69F00, 0.28); fr.position.set(s * 0.032, EY + 0.006, zF + 0.01); lab.fx.add(fr)
}
lab.mesh(GEO.rbox(0.014, 0.01, 0.004, 0.002), lensGlass, { name: 'LiDAR depth sensor', pos: [0, EY - 0.018, zF + 0.003], explode: [0, -0.02, 0.27], label: 'LiDAR · 7 m' })
for (const s of [-1, 1]) lab.mesh(disc(0.004, 0.003), lensGlass, { name: `Inside-out tracking camera ${s < 0 ? 'L' : 'R'}`, pos: [s * 0.085, EY - 0.03, zF - 0.01], explode: [s * 0.06, -0.03, 0.2] })
for (const s of [-1, 1]) lab.mesh(disc(0.0025, 0.002), irM, { name: `IR illuminator ${s < 0 ? 'L' : 'R'}`, pos: [s * 0.065, EY - 0.018, zF + 0.003], explode: [s * 0.04, -0.02, 0.25] })
lab.mesh(GEO.rbox(0.17, 0.08, 0.0016, 0.0005), pcbM, { name: 'Camera & tracking board', pos: [0, EY, zF - 0.012], explode: [0, 0.1, 0.16] })
lab.mesh(GEO.rbox(0.014, 0.014, 0.0016, 0.0004), chipM, { name: 'Video passthrough ISP', pos: [0, EY + 0.01, zF - 0.0104], explode: [0, 0.1, 0.17] })
// cooling: twin fans either side (the XR-4 is actively cooled)
const fans = []
for (const s of [-1, 1]) fans.push(lab.mesh(GEO.rotor({ count: 9, axis: 'z', r0: 0.004, r1: 0.013, chord: 0.005, thick: 0.08, camber: 0.08, twist: 0.2, pitch: 0.5, nS: 4, nC: 5 }), MAT.plastic({ color: [0.1, 0.1, 0.11] }), { name: `${s < 0 ? 'Left' : 'Right'} cooling fan`, pos: [s * 0.075, EY + 0.03, zF - 0.025], explode: [s * 0.04, 0.12, 0.1], count: 1 }))

// per eye: display, aspheric lens, eye tracking ring with IR LEDs
const eyeRigs = []
for (const s of [-1, 1]) {
  const x = s * 0.032
  lab.mesh(GEO.rbox(0.052, 0.05, 0.003, 0.001), lcdM, { name: `${s < 0 ? 'Left' : 'Right'} mini-LED display`, pos: [x, EY, ZV - 0.0], explode: [s * 0.05, 0, 0.08], label: s < 0 ? 'Mini-LED 3840 × 3744' : undefined })
  const lens = GEO.lathe([[0, -0.009], [0.023, -0.006], [0.024, 0.006], [0, 0.011]], 64); lens.rotateX(Math.PI / 2)
  lab.mesh(lens, optic, { name: `${s < 0 ? 'Left' : 'Right'} aspheric lens`, pos: [x, EY, ZV - 0.032], explode: [s * 0.05, 0, -0.03], label: s > 0 ? 'Aspheric lens' : undefined })
  const ring = GEO.tube(0.029, 0.025, 0.006); ring.rotateX(Math.PI / 2)
  lab.mesh(ring, MAT.plastic({ color: [0.05, 0.05, 0.055] }), { name: `${s < 0 ? 'Left' : 'Right'} eye tracking ring`, pos: [x, EY, ZV - 0.044], explode: [s * 0.05, 0, -0.06], label: s < 0 ? 'Eye tracking 200 Hz' : undefined })
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; lab.mesh(new THREE.SphereGeometry(0.0012, 10, 8), irM, { name: `Eye tracking IR LED ${s}${i}`, pos: [x + Math.cos(a) * 0.027, EY + Math.sin(a) * 0.027, ZV - 0.048], explode: [s * 0.05, 0, -0.06], count: 1 }) }
  lab.mesh(disc(0.0028, 0.004), lensGlass, { name: `${s < 0 ? 'Left' : 'Right'} eye camera`, pos: [x + s * 0.026, EY - 0.02, ZV - 0.048], explode: [s * 0.05, 0, -0.06] })
  eyeRigs.push(x)
}
// face pad, headband with rear dial, tether cable
const pad = (() => { const s = new THREE.Shape(); const w = 0.185, h = 0.1, r = 0.035; s.moveTo(-w / 2 + r, -h / 2); s.lineTo(-0.02, -h / 2); s.quadraticCurveTo(0, -h / 2 + 0.032, 0.02, -h / 2); s.lineTo(w / 2 - r, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r); s.lineTo(w / 2, h / 2 - r); s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2); s.lineTo(-w / 2 + r, h / 2); s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r); s.lineTo(-w / 2, -h / 2 + r); s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2); const hole = new THREE.Path(); hole.absellipse(0, 0.004, 0.075, 0.034, 0, Math.PI * 2, true); s.holes.push(hole); return s })()
lab.mesh(GEO.extrude(pad, 0.02), padM, { name: 'Face cushion', pos: [0, EY, ZV - Dv / 2 - 0.01], explode: [0, 0, -0.1] })
const bandPts = []; for (let i = 0; i <= 20; i++) { const a = Math.PI * (i / 20); bandPts.push([-Math.cos(a) * 0.092, EY + 0.03, -0.06 - Math.sin(a) * 0.112 + 0.04 * (1 - Math.sin(a))]) }
lab.add(new THREE.Mesh(GEO.pipe(bandPts, 0.011, { radial: 12 }), shellM), { name: 'Headband', explode: [0, 0, -0.08] })
lab.add(new THREE.Mesh(GEO.pipe([[-0.06, EY + 0.03, -0.01], [0, EY + 0.115, -0.05], [0.06, EY + 0.03, -0.01]].map((p, i) => [p[0], p[1], i === 1 ? -0.06 : -0.02]), 0.008), shellM), { name: 'Top strap', explode: [0, 0.08, -0.04] })
lab.mesh(disc(0.022, 0.016), accentM, { name: 'Rear fit dial', pos: [0, EY + 0.03, -0.175], explode: [0, 0, -0.14] })
lab.add(new THREE.Mesh(GEO.pipe([[0.03, EY + 0.03, -0.17], [0.05, EY - 0.05, -0.2], [0.1, 0.12, -0.24], [0.16, 0.006, -0.28], [0.26, 0.006, -0.3]], 0.004), MAT.rubber()), { name: 'Tether cable (DisplayPort + USB-C)' })

// ---------------------------------------------------------------- solver
lab.hero({ label: 'Resolution at your gaze', unit: 'px/°', max: 75, digits: 0 })
const model = lab.slider({ id: 'model', label: 'Headset', min: 3, max: 4, step: 1, value: 4, fmt: (v) => v < 3.5 ? 'XR-3 (bionic)' : 'XR-4', ends: ['XR-3', 'XR-4'] })
const ecc = lab.slider({ id: 'ecc', label: 'Gaze angle off centre', min: 0, max: 50, value: 0, unit: '°', ends: ['straight ahead', '50°'] })
let lostET = false, fovCentre = 0
// display PPD of each model as a function of the angle from the lens centre
const displayPPD = (m, e) => m === 3 ? (e <= 13.5 ? 70 : 30) : 51 * (1 - 0.35 * clamp(e / 50))   // XR-4: aspheric lens, sharpest at the centre
lab.onTick((dt, l, rdt) => {
  for (const f of fans) f.rotation.z += rdt * 30
  const m = model.value < 3.5 ? 3 : 4, e = ecc.value
  fovCentre = approach(fovCentre, lostET ? 0 : e, 0.03, rdt)       // 200 Hz eye tracking follows the gaze within ~5 ms
  const inFovea = Math.abs(e - fovCentre) <= FOV_FOVEA
  const disp = displayPPD(m, e)
  const rendered = disp * (inFovea ? 1 : FOV_PERIPH_SCALE)
  const eye = 60 / (1 + e / E2)                                     // what your eye can resolve at that angle
  const verdict = rendered >= eye ? 'sharper than your eye' : 'softer than your eye'
  lab.setHero(rendered, {
    state: lostET ? 'eye tracking lost' : verdict,
    sub: `display ${fmt(disp)} px/° · rendered ${inFovea ? 'full res (foveated region)' : fmt(FOV_PERIPH_SCALE * 100) + ' % res (periphery)'} · your eye resolves ${fmt(eye, 1)} px/° at ${fmt(e)}°${m === 3 ? (e <= 13.5 ? ' · inside the 27° uOLED focus area' : ' · on the LCD context display') : ''}`,
    bad: lostET && !inFovea,
  })
})
lab.breakIt({ label: 'Lose eye tracking', run: () => { lostET = true; ecc.set(30) }, reset: () => { lostET = false } })
lab.how(`Human vision resolves about one arc-minute, <b>60 pixels per degree</b>, but only at the very centre of the gaze; acuity halves 2.3° away. Varjo's answer differs by generation. The <b>XR-3</b> projects a tiny 1920 × 1920 uOLED focus display (≈ 70 px/°) into the central 27° through a beam combiner, over an LCD context display. The <b>XR-4</b> uses one mini-LED panel of 3840 × 3744 per eye (up to 51 px/°). Rendering every pixel at full rate is too expensive, so 200 Hz <b>eye tracking</b> moves a full-resolution region with your gaze: <b>foveated rendering</b>. If eye tracking fails, the sharp region stays put and you see the cheap periphery. The 20 MP passthrough cameras sit eye-distance apart, so mixed reality keeps true stereo, and LiDAR gives the room's depth for occlusion. The periphery render scale (40 %) is a teaching assumption.` +
  refsHTML(['VR &amp; AR Wiki. (n.d.). Varjo XR-4. https://vrarwiki.com/wiki/Varjo_XR-4', 'Shilov, A. (2020, December 1). Varjo VR-3 and XR-3 headsets. <i>Tom\'s Hardware</i>. https://www.tomshardware.com/news/varjo-vr-3-and-xr-3-virtual-reality-headsets', 'Strasburger, H., Rentschler, I., &amp; Jüttner, M. (2011). Peripheral vision and pattern recognition: A review. <i>Journal of Vision, 11</i>(5), 13. https://doi.org/10.1167/11.5.13']),
  ['acuity<sub>eye</sub>(e) = 60 / (1 + e / 2.3)  px/°', 'PPD<sub>XR-3</sub> = 70 (|e| ≤ 13.5°), 30 otherwise', 'PPD<sub>XR-4</sub> ≈ 51 · (1 − 0.35 e/50)', 'rendered = PPD · (1 if |e − gaze| ≤ 15° else 0.4)'])
addXR(lab, { mag: 1.4, tips: ['MR tip: compare this passthrough with your Quest 3 passthrough'] })
lab.start()
