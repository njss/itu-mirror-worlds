// =====================================================================================
//  Device Lab No. 02 · Meta Quest 3 standalone mixed reality headset
//  Specs (Meta Quest 3, 2024): 2064 x 2208 px per eye LCD, 90/120 Hz, pancake lenses,
//  IPD 53-75 mm, about 25 pixels per degree at the centre, 515 g, Snapdragon XR2 Gen 2,
//  8 GB RAM, 4 IR tracking cameras, 2 x 4 MP RGB passthrough cameras, IR depth projector,
//  4879 mAh battery. Visor about 184 x 98 mm.
//  Solver: angular resolution and render load. PPD = pixels / degrees; load = 2 w h Hz.
// =====================================================================================
const { THREE, Lab, MAT, GEO, clamp, lerp, approach, fmt } = window.LabKit
const { addXR, refsHTML, frustum, polyline, chrome, headStand } = window.DevLab

const PANEL_W = 2064, PANEL_H = 2208, PPD_PANEL = 25        // per eye, centre of the lens
const EYEBUF_W = 1680, EYEBUF_H = 1760                      // Meta's default eye buffer for Quest 3
const BUDGET = 0.8e9                                        // shaded pixels per second a modest URP scene sustains (teaching assumption)
const W = 0.184, Hh = 0.098, Dv = 0.072                     // visor outer size (m)
const EY = 0.47                                             // eye height of the mannequin head
const ZV = 0.075                                            // visor centre z (front of the face)

const lab = new Lab({
  prompt: 'a standalone mixed reality headset: what is inside a Meta Quest 3?',
  no: 2, title: 'Meta Quest 3', sub: 'inside the visor',
  size: 0.5,
  view: { az: 30, el: 10, dist: 1.6, target: [0, 0.4, 0.0], fov: 30 },
  cut: { a: [1, 0, 0], b: [0, 1, 0], center: [0, EY, ZV], reach: 0.35 },
  pills: ['XR display', 'Tracking', 'WebXR'],
})
chrome('Meta Quest 3')

// ---------------------------------------------------------------- materials
const whiteM = MAT.plastic({ color: [0.86, 0.86, 0.85], roughness: 0.38 })
const pillM = MAT.plastic({ color: [0.015, 0.015, 0.018], roughness: 0.08, clearcoat: 1 })
const camLensM = MAT.glass({ color: [0.3, 0.32, 0.4], thickness: 0.002 })
const fabricM = MAT.satin({ color: [0.12, 0.12, 0.13], roughness: 0.85 })
const foamM = MAT.satin({ color: [0.82, 0.8, 0.76], roughness: 0.9 })
const pcbM = MAT.plastic({ color: [0.04, 0.2, 0.1], roughness: 0.4 })
const chipM = MAT.plastic({ color: [0.02, 0.02, 0.022], roughness: 0.3 })
const finM = MAT.aluminium({ roughness: 0.35 })
const lcdM = MAT.paint({ color: [0.02, 0.02, 0.03], roughness: 0.1, clearcoat: 1 })
const lensM = MAT.glass({ color: [0.9, 0.95, 1.0], ior: 1.55, thickness: 0.01 })
const battM = MAT.paint({ color: [0.18, 0.2, 0.24], roughness: 0.35 })
const strapM = MAT.plastic({ color: [0.82, 0.82, 0.8], roughness: 0.5 })
const standM = MAT.paint({ color: [0.1, 0.1, 0.11], roughness: 0.4 })
const irM = MAT.glow({ emissive: [0.85, 0.12, 0.12], emissiveIntensity: 1.2 })

headStand(lab, MAT, GEO, EY)

// ---------------------------------------------------------------- visor shell
lab.mesh(GEO.rbox(W, Hh, Dv, 0.03), whiteM, { name: 'Front visor shell', pos: [0, EY, ZV], explode: [0, 0, 0.16], xray: 'shell', label: 'Visor' })
const zF = ZV + Dv / 2
// three vertical sensor pills on the front face
const pills = [-0.058, 0, 0.058]
for (const [i, x] of pills.entries()) lab.mesh(GEO.rbox(0.024, 0.052, 0.006, 0.0118), pillM, { name: ['Left', 'Centre', 'Right'][i] + ' sensor pill', pos: [x, EY + 0.004, zF], explode: [x * 0.6, 0, 0.2] })
// passthrough RGB cameras (top of the side pills) and tracking cameras (bottom of the side pills)
const camDisc = (r) => { const g = GEO.disc(r, 0.004, 0.0005, 32); g.rotateX(Math.PI / 2); return g }
for (const x of [-0.058, 0.058]) {
  lab.mesh(camDisc(0.0055), camLensM, { name: `RGB passthrough camera ${x < 0 ? 'L' : 'R'}`, pos: [x, EY + 0.016, zF + 0.002], explode: [x * 0.6, 0, 0.22], label: x > 0 ? '4 MP RGB passthrough' : undefined })
  lab.mesh(camDisc(0.0045), camLensM, { name: `Front tracking camera ${x < 0 ? 'L' : 'R'}`, pos: [x, EY - 0.010, zF + 0.002], explode: [x * 0.6, 0, 0.22] })
  const fr = frustum(80, 64, 0.09, 0xE69F00, 0.3); fr.position.set(x, EY + 0.016, zF + 0.004); lab.fx.add(fr)
}
// centre pill: IR depth projector (glows faint red) and IR flood
lab.mesh(camDisc(0.004), irM, { name: 'IR depth projector', pos: [0, EY + 0.012, zF + 0.002], explode: [0, 0, 0.22], label: 'IR depth projector' })
lab.mesh(camDisc(0.003), camLensM, { name: 'IR flood illuminator', pos: [0, EY - 0.006, zF + 0.002], explode: [0, 0, 0.22] })
// lower corner tracking cameras, angled down and out (they see the hands and controllers)
for (const s of [-1, 1]) {
  const m = lab.mesh(camDisc(0.0045), camLensM, { name: `Lower tracking camera ${s < 0 ? 'L' : 'R'}`, pos: [s * 0.083, EY - 0.04, zF - 0.012], rot: [0.5, s * 0.6, 0], explode: [s * 0.08, -0.04, 0.12], label: s > 0 ? 'Tracking camera (IR)' : undefined })
  const fr = frustum(100, 80, 0.09, 0x0072B2, 0.3); fr.position.set(s * 0.083, EY - 0.04, zF - 0.01); fr.rotation.set(0.5, s * 0.6, 0); lab.fx.add(fr)
  void m
}

// ---------------------------------------------------------------- inside: compute, power, cooling
lab.mesh(GEO.rbox(0.15, 0.06, 0.0016, 0.0005), pcbM, { name: 'Main logic board', pos: [0, EY, zF - 0.012], explode: [0, 0.1, 0.12], label: 'Main board' })
lab.mesh(GEO.rbox(0.013, 0.013, 0.0016, 0.0005), chipM, { name: 'Snapdragon XR2 Gen 2', pos: [0.012, EY + 0.005, zF - 0.0104], explode: [0, 0.1, 0.13], label: 'XR2 Gen 2 SoC' })
lab.mesh(GEO.rbox(0.012, 0.01, 0.0012, 0.0004), chipM, { name: '8 GB LPDDR5', pos: [-0.012, EY + 0.005, zF - 0.0104], explode: [0, 0.1, 0.13] })
// heat sink: a row of fins plus a blower fan
const fins = GEO.merge(Array.from({ length: 14 }, (_, i) => { const g = new THREE.BoxGeometry(0.0007, 0.024, 0.012); g.translate(-0.022 + i * 0.0034, 0, 0); return g }))
lab.mesh(fins, finM, { name: 'Heat sink', pos: [0.012, EY + 0.026, zF - 0.02], explode: [0, 0.16, 0.08] })
const fan = lab.mesh(GEO.rotor({ count: 11, axis: 'z', r0: 0.004, r1: 0.011, chord: 0.004, thick: 0.08, camber: 0.08, twist: 0.2, pitch: 0.5, nS: 4, nC: 5 }), MAT.plastic({ color: [0.1, 0.1, 0.11] }), { name: 'Blower fan', pos: [-0.04, EY + 0.024, zF - 0.02], explode: [0, 0.16, 0.08], count: 1 })
lab.mesh(GEO.rbox(0.13, 0.026, 0.011, 0.003), battM, { name: 'Battery 4879 mAh', pos: [0, EY - 0.033, zF - 0.02], explode: [0, -0.12, 0.08], label: 'Battery 4879 mAh' })

// ---------------------------------------------------------------- optics: LCD panels and pancake lenses per eye
const IPD0 = 0.064
const eyes = []
for (const s of [-1, 1]) {
  const lcd = lab.mesh(GEO.rbox(0.046, 0.049, 0.0022, 0.0008), lcdM, { name: `${s < 0 ? 'Left' : 'Right'} LCD 2064×2208`, pos: [s * IPD0 / 2, EY, ZV - 0.002], explode: [s * 0.04, 0, 0.05], label: s < 0 ? 'LCD 2064 × 2208' : undefined })
  const pan = GEO.lathe([[0, -0.0065], [0.0215, -0.0055], [0.022, 0.0055], [0, 0.0075]], 64); pan.rotateX(Math.PI / 2)
  const lens = lab.mesh(pan, lensM, { name: `${s < 0 ? 'Left' : 'Right'} pancake lens`, pos: [s * IPD0 / 2, EY, ZV - 0.018], explode: [s * 0.04, 0, -0.02], label: s > 0 ? 'Pancake lens (folded optics)' : undefined })
  const ring = GEO.tube(0.025, 0.022, 0.016); ring.rotateX(Math.PI / 2)
  const holder = lab.mesh(ring, MAT.plastic({ color: [0.08, 0.08, 0.09] }), { name: `${s < 0 ? 'Left' : 'Right'} lens barrel`, pos: [s * IPD0 / 2, EY, ZV - 0.012], explode: [s * 0.04, 0, -0.01] })
  eyes.push({ s, lcd, lens, holder })
}
lab.mesh(GEO.disc(0.006, 0.004, 0.0006, 32), MAT.plastic({ color: [0.2, 0.2, 0.22] }), { name: 'IPD adjustment wheel', pos: [0.07, EY - 0.05, ZV - 0.01], rot: [0, 0, Math.PI / 2] })
// facial interface (foam gasket against the face)
const gasket = (() => { const s = new THREE.Shape(); const w = 0.165, h = 0.085, r = 0.03; s.moveTo(-w / 2 + r, -h / 2); s.lineTo(-0.018, -h / 2); s.quadraticCurveTo(0, -h / 2 + 0.03, 0.018, -h / 2); s.lineTo(w / 2 - r, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r); s.lineTo(w / 2, h / 2 - r); s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2); s.lineTo(-w / 2 + r, h / 2); s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r); s.lineTo(-w / 2, -h / 2 + r); s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2); const hole = new THREE.Path(); hole.absellipse(0, 0.004, 0.07, 0.03, 0, Math.PI * 2, true); s.holes.push(hole); return s })()
lab.mesh(GEO.extrude(gasket, 0.016), fabricM, { name: 'Facial interface', pos: [0, EY, ZV - Dv / 2 - 0.008], explode: [0, 0, -0.07] })

// ---------------------------------------------------------------- strap, speakers, ports
const strapPts = []; for (let i = 0; i <= 24; i++) { const a = -Math.PI / 2 + (i / 24) * Math.PI * 2 * 0.5 - Math.PI / 2; strapPts.push([0.088 * Math.cos(a + Math.PI), EY + 0.02 - Math.sin(i / 24 * Math.PI) * 0.012, -0.06 + 0.105 * Math.sin(a + Math.PI)]) }
// rigid side arms from the visor to above the ears, then the fabric strap around the back of the head
for (const s of [-1, 1]) {
  lab.add(new THREE.Mesh(GEO.pipe([[s * 0.088, EY + 0.012, ZV - 0.01], [s * 0.093, EY + 0.016, -0.03], [s * 0.09, EY + 0.02, -0.07]], 0.006), strapM), { name: `${s < 0 ? 'Left' : 'Right'} strap arm`, explode: [s * 0.06, 0, 0] })
  lab.mesh(GEO.rbox(0.006, 0.014, 0.024, 0.003), MAT.plastic({ color: [0.25, 0.25, 0.27] }), { name: `${s < 0 ? 'Left' : 'Right'} speaker`, pos: [s * 0.094, EY + 0.006, -0.05], explode: [s * 0.08, 0, 0], label: s > 0 ? 'Spatial audio speaker' : undefined })
}
lab.add(new THREE.Mesh(GEO.pipe([[-0.09, EY + 0.02, -0.07], [-0.07, EY + 0.03, -0.14], [0, EY + 0.03, -0.172], [0.07, EY + 0.03, -0.14], [0.09, EY + 0.02, -0.07]], 0.009, { radial: 10 }), fabricM), { name: 'Back strap', explode: [0, 0, -0.06] })
lab.mesh(GEO.rbox(0.0035, 0.009, 0.004, 0.001), MAT.stainless(), { name: 'USB-C port', pos: [-0.093, EY - 0.02, ZV - 0.005] })
lab.mesh(GEO.rbox(0.004, 0.012, 0.004, 0.0015), MAT.plastic({ color: [0.3, 0.3, 0.3] }), { name: 'Power button', pos: [-0.093, EY + 0.0, ZV + 0.012] })

// ---------------------------------------------------------------- light path through a pancake lens
// display -> half mirror (passes) -> reflective polariser (bounces back) -> half mirror (bounces forward) -> eye
const paths = []
for (const s of [-1, 1]) for (const dy of [-0.012, 0, 0.012]) {
  const x = s * IPD0 / 2
  paths.push([[x, EY + dy, ZV - 0.001], [x, EY + dy * 0.9, ZV - 0.024], [x, EY + dy * 0.8, ZV - 0.006], [x, EY + dy * 0.7, ZV - 0.026], [x, EY + dy * 0.2, ZV - 0.06]])
}
const light = lab.flow({ paths, count: 160, length: 0.12, speed: 0.6, color: (i, u) => u < 0.75 ? [1, 0.62, 0.05] : [0, 0.45, 0.7] })

// ---------------------------------------------------------------- solver: angular resolution and render load
lab.hero({ label: 'Sharpness at the centre', unit: 'px/°', max: 30, digits: 1 })
const sc = lab.slider({ id: 'scale', label: 'Unity render scale', min: 0.5, max: 1.7, value: 1, digits: 2, unit: '×', ends: ['0.5 (blurry)', '1.7 (supersampled)'] })
const hz = lab.slider({ id: 'hz', label: 'Refresh rate', min: 72, max: 120, step: 1, value: 90, unit: 'Hz', ends: ['72 Hz', '120 Hz'] })
let forced = false, fps = 90
lab.onTick((dt, l, rdt) => {
  const s = forced ? 1.7 : sc.value, Hz = forced ? 120 : Math.round(hz.value)
  const w = Math.round(EYEBUF_W * s), h = Math.round(EYEBUF_H * s)
  const ppd = PPD_PANEL * Math.min(1, w / PANEL_W)              // eye buffer cannot be sharper than the panel
  const load = 2 * w * h * Hz                                    // shaded pixels per second, both eyes
  const budget = 1000 / Hz                                       // ms per frame
  const over = load > BUDGET
  fps = approach(fps, over ? Hz / 2 : Hz, 0.3, rdt)              // Asynchronous SpaceWarp halves the app rate when it misses
  light.speed = 0.6 * fps / 90
  fan.rotation.z += rdt * (8 + 30 * clamp(load / BUDGET))
  lab.setHero(ppd, { state: over ? 'missing frames' : 'holding ' + Hz + ' Hz', sub: `eye buffer ${fmt(w)} × ${fmt(h)} · ${fmt(load / 1e6)} Mpx/s of ${fmt(BUDGET / 1e6)} · ${fmt(budget, 1)} ms per frame${over ? ' · ASW: app runs at ' + fmt(fps) + ' fps, motion judders' : ''}`, bad: over })
})
lab.breakIt({ label: 'Overload GPU', run: () => { forced = true }, reset: () => { forced = false } })
lab.how(`Each eye looks through a <b>pancake lens</b>: polarisation makes light bounce three times between a half mirror and a reflective polariser, so a 1.5 cm gap acts like a 4 cm focal length and the headset gets slim (the orange-to-blue streaks). Sharpness is set by how many pixels fall into one degree of your view: about 25 px/° at the centre. Unity renders into an <b>eye buffer</b> smaller than the panel; raising the render scale makes it sharper until it matches the panel, but the shading load (pixels × eyes × refresh rate) grows with the square. Miss the frame budget and the runtime falls back to <b>ASW</b>, which halves your app's rate. Six cameras watch the room: four IR cameras for inside-out tracking, two RGB cameras for colour passthrough, and an IR projector for depth (room mesh). The GPU budget is a teaching assumption for a modest URP scene, not a Meta figure.` +
  refsHTML(['Meta. (2023). <i>Meta Quest 3: Tech specs</i>. https://www.meta.com/quest/quest-3/', 'Wikipedia contributors. (2024). Meta Quest 3. In <i>Wikipedia</i>. https://en.wikipedia.org/wiki/Meta_Quest_3', 'Wong, T. L., Yun, Z., Ambur, G., &amp; Etter, J. (2017). Folded optics with birefringent reflective polarizers. <i>Proceedings of SPIE, 10335</i>, 103350E. https://doi.org/10.1117/12.2270266']),
  ['PPD ≈ pixels across / degrees across ≈ 25 px/° (centre)', 'eye buffer = 1680 × 1760 × render scale', 'load = 2 · w · h · f<sub>refresh</sub>', 't<sub>frame</sub> = 1000 / f<sub>refresh</sub> ms', 'ASW: f<sub>app</sub> = f<sub>refresh</sub> / 2 when load > budget'])
addXR(lab, { mag: 1.5, tips: ['MR tip: hold your own Quest controller next to this one'] })
lab.start()
