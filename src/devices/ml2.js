// =====================================================================================
//  Device Lab No. 06 · Magic Leap 2 (optical see-through augmented reality)
//  Specs (VR & AR Wiki, n.d.): LCoS projectors into diffractive waveguides, 1440 x 1760
//  per eye, 120 Hz, 70 deg diagonal FOV (44.6 x 53.6 deg), up to 2000 nits, dynamic
//  dimming (global or segmented), headset 260 g, compute pack 420 g (AMD Zen 2 + RDNA 2),
//  3 world cameras, ToF depth 544 x 480, 12.6 MP RGB camera, 4 eye cameras, 3.5 h.
//  Solver: additive display contrast against the real world:
//     L_bg = E rho / pi,   CR = (L_virtual + T L_bg) / (T L_bg)
// =====================================================================================
const { THREE, Lab, MAT, GEO, clamp, lerp, approach, fmt } = window.LabKit
const { addXR, refsHTML, frustum, chrome, headStand } = window.DevLab

const L_VIRT = 2000 * 0.5      // nits reaching the eye for full white content (half of peak, teaching value)
const RHO = 0.3                // typical room reflectance
const T_CLEAR = 0.22           // lens transmission with dimming off
const EY = 0.47, ZV = 0.055

const lab = new Lab({
  prompt: 'AR glasses you see through: why does a hologram fade in sunlight, and how does Magic Leap 2 fight it?',
  no: 6, title: 'Magic Leap 2', sub: 'see-through AR',
  size: 0.55,
  view: { az: 30, el: 10, dist: 1.5, target: [0.02, 0.4, 0.0], fov: 30 },
  cut: { a: [1, 0, 0], b: [0, 1, 0], center: [0, EY, ZV], reach: 0.35 },
  pills: ['Waveguides', 'Dimming', 'WebXR'],
})
chrome('ml2')
headStand(lab, MAT, GEO, EY)

const frameM = MAT.paint({ color: [0.07, 0.07, 0.075], roughness: 0.35, clearcoat: 0.5 })
const grayM = MAT.anodised({ color: [0.32, 0.33, 0.35] })
const camM = MAT.glass({ color: [0.3, 0.32, 0.4], thickness: 0.002 })
const pcbM = MAT.plastic({ color: [0.04, 0.2, 0.1], roughness: 0.4 })
const chipM = MAT.plastic({ color: [0.02, 0.02, 0.022], roughness: 0.3 })
// eyepiece stack: outer dimmer (its tint is live), three waveguide plates (R, G, B), inner cover
const dimM = MAT.glass({ color: [0.75, 0.75, 0.78], thickness: 0.001 })
const wgM = [[0.95, 0.75, 0.75], [0.75, 0.95, 0.78], [0.75, 0.8, 0.98]].map((c) => MAT.glass({ color: c, thickness: 0.0008, ior: 1.8 }))

const zF = ZV + 0.022
// front frame: a brow bar plus the shroud that holds the eyepieces
lab.mesh(GEO.rbox(0.17, 0.028, 0.03, 0.012), frameM, { name: 'Brow bar', pos: [0, EY + 0.032, ZV + 0.008], explode: [0, 0.1, 0.05], xray: 'shell', label: 'Brow bar · sensors' })
lab.mesh(GEO.rbox(0.162, 0.012, 0.022, 0.005), frameM, { name: 'Lower rim', pos: [0, EY - 0.03, ZV + 0.006], explode: [0, -0.08, 0.04] })
lab.mesh(GEO.rbox(0.01, 0.024, 0.016, 0.004), frameM, { name: 'Nose bridge', pos: [0, EY - 0.008, ZV + 0.004], explode: [0, -0.04, 0.05] })
const eyepieces = []
for (const s of [-1, 1]) {
  const x = s * 0.04
  const shape = new THREE.Shape(); shape.absellipse(0, 0, 0.034, 0.026, 0, Math.PI * 2, false)
  // eyepiece frame: an elliptical ring that holds the stack
  const rim = new THREE.Shape(); rim.absellipse(0, 0, 0.038, 0.03, 0, Math.PI * 2, false); const hole = new THREE.Path(); hole.absellipse(0, 0, 0.034, 0.026, 0, Math.PI * 2, true); rim.holes.push(hole)
  lab.mesh(GEO.extrude(rim, 0.012), frameM, { name: `${s < 0 ? 'Left' : 'Right'} eyepiece frame`, pos: [x, EY, zF - 0.004], explode: [s * 0.03, 0, 0.06] })
  const dim = lab.mesh(GEO.extrude(shape, 0.0012), dimM, { name: `${s < 0 ? 'Left' : 'Right'} dimmer (segmented LC)`, pos: [x, EY, zF], explode: [s * 0.02, 0, 0.12], label: s > 0 ? 'Dynamic dimmer' : undefined })
  for (let k = 0; k < 3; k++) lab.mesh(GEO.extrude(shape, 0.0008), wgM[k], { name: `${s < 0 ? 'Left' : 'Right'} waveguide ${'RGB'[k]}`, pos: [x, EY, zF - 0.003 - k * 0.0018], explode: [s * 0.02, 0, 0.09 - k * 0.02], label: s < 0 && k === 1 ? 'Waveguides (R, G, B)' : undefined })
  lab.mesh(GEO.extrude(shape, 0.001), MAT.glass({ thickness: 0.001 }), { name: `${s < 0 ? 'Left' : 'Right'} inner cover`, pos: [x, EY, zF - 0.01], explode: [s * 0.02, 0, 0.02] })
  // LCoS projector in the temple corner, injecting into the in-coupling grating
  lab.mesh(GEO.rbox(0.014, 0.016, 0.022, 0.003), grayM, { name: `${s < 0 ? 'Left' : 'Right'} LCoS projector`, pos: [s * 0.08, EY + 0.012, ZV - 0.004], explode: [s * 0.06, 0.03, 0], label: s > 0 ? 'LCoS projector' : undefined })
  eyepieces.push({ dim, x })
}
// sensors on the brow bar: 3 world cameras, ToF depth, RGB camera
const disc = (r) => { const g = GEO.disc(r, 0.003, 0.0004, 32); g.rotateX(Math.PI / 2); return g }
for (const [n, x, r] of [['World camera L', -0.07, 0.0035], ['World camera centre', 0.0, 0.0035], ['World camera R', 0.07, 0.0035], ['ToF depth sensor', -0.022, 0.0045], ['12.6 MP RGB camera', 0.022, 0.0042]]) {
  lab.mesh(disc(r), camM, { name: n, pos: [x, EY + 0.034, ZV + 0.0235], explode: [0, 0.1, 0.07], label: n === 'ToF depth sensor' ? 'ToF depth 544 × 480' : undefined })
}
const tof = frustum(75, 65, 0.1, 0x009E73, 0.32); tof.position.set(-0.022, EY + 0.034, ZV + 0.025); lab.fx.add(tof)
for (const s of [-1, 1]) for (let i = 0; i < 2; i++) lab.mesh(disc(0.0018), camM, { name: `Eye camera ${s}${i}`, pos: [s * (0.022 + i * 0.036), EY - 0.026, ZV - 0.004], explode: [0, -0.06, 0], count: 1 })
lab.mesh(GEO.rbox(0.12, 0.016, 0.0014, 0.0004), pcbM, { name: 'Headset sensor board', pos: [0, EY + 0.032, ZV - 0.004], explode: [0, 0.14, 0] })
// temples and the rear crown band
for (const s of [-1, 1]) lab.add(new THREE.Mesh(GEO.pipe([[s * 0.086, EY + 0.02, ZV - 0.01], [s * 0.09, EY + 0.024, -0.05], [s * 0.084, EY + 0.03, -0.1]], 0.007), frameM), { name: `${s < 0 ? 'Left' : 'Right'} temple arm`, explode: [s * 0.05, 0, 0] })
lab.add(new THREE.Mesh(GEO.pipe([[-0.084, EY + 0.03, -0.1], [-0.05, EY + 0.04, -0.152], [0, EY + 0.042, -0.168], [0.05, EY + 0.04, -0.152], [0.084, EY + 0.03, -0.1]], 0.012, { radial: 12 }), grayM), { name: 'Rear crown band', explode: [0, 0, -0.06] })
// compute pack on the floor next to the stand, with its cable
lab.mesh(GEO.rbox(0.16, 0.022, 0.09, 0.012), frameM, { name: 'Compute pack', pos: [0.2, 0.011, 0.06], explode: [0.05, 0.06, 0], label: 'Compute pack · Zen 2 + RDNA 2' })
lab.mesh(GEO.rbox(0.03, 0.002, 0.03, 0.0005), chipM, { name: 'AMD SoC', pos: [0.2, 0.023, 0.06], explode: [0.05, 0.1, 0] })
lab.add(new THREE.Mesh(GEO.pipe([[0.084, EY + 0.02, -0.11], [0.11, EY - 0.08, -0.12], [0.14, 0.15, -0.05], [0.16, 0.02, 0.04], [0.2, 0.012, 0.06]], 0.0025), MAT.rubber()), { name: 'Headset cable' })
// controller resting on the compute pack's side
lab.mesh(GEO.rbox(0.032, 0.022, 0.14, 0.01), frameM, { name: 'Controller', pos: [0.32, 0.011, 0.02], rot: [0, 0.3, 0], explode: [0.05, 0.05, 0] })

// a hologram in front of the glasses: a small cube whose visibility follows the contrast ratio
const holo = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: 0x56B4E9, transparent: true, opacity: 0.8, toneMapped: false, depthWrite: false }))
holo.layers.set(1); holo.position.set(0, EY + 0.01, 0.2); lab.fx.add(holo)
const holoEdges = new THREE.LineSegments(new THREE.EdgesGeometry(holo.geometry), new THREE.LineBasicMaterial({ color: 0x0072B2, transparent: true, toneMapped: false })); holoEdges.layers.set(1); holo.add(holoEdges)

// ---------------------------------------------------------------- solver
lab.hero({ label: 'Hologram contrast', unit: ': 1', max: 20, digits: 1 })
const lux = lab.slider({ id: 'lux', label: 'Room light', min: 1, max: 4.7, value: 2.7, fmt: (v) => fmt(Math.pow(10, v)) + ' lx', ends: ['dim lab', 'daylight'] })
const dimS = lab.slider({ id: 'dim', label: 'Dimming', min: 0, max: 100, value: 0, unit: '%', ends: ['off (22 % see-through)', 'max (0.3 %)'] })
let outside = false, luxNow = 500
lab.onTick((dt, l, rdt) => {
  luxNow = approach(luxNow, outside ? 50000 : Math.pow(10, lux.value), 0.4, rdt)
  const E = luxNow
  const T = outside ? T_CLEAR : T_CLEAR * Math.pow(0.003 / T_CLEAR, dimS.value / 100)   // log taper from 22 % to 0.3 %
  const Lbg = E * RHO / Math.PI                       // background luminance, cd/m^2
  const CR = (L_VIRT + T * Lbg) / (T * Lbg)
  const vis = clamp(Math.log10(CR) / Math.log10(10))  // 1 when CR >= 10:1
  holo.material.opacity = 0.08 + 0.75 * vis; holoEdges.material.opacity = 0.15 + 0.85 * vis
  holo.rotation.y += rdt * 0.5
  for (const e of eyepieces) { const c = lerp(0.03, 0.42, Math.pow(T / T_CLEAR, 0.35)); e.dim.material.color.setRGB(c, c, c * 1.02) }
  lab.setHero(CR, { state: CR > 10 ? 'solid' : CR > 3 ? 'readable' : 'washed out', sub: `background ${fmt(Lbg)} cd/m² · see-through ${fmt(T * 100, 1)} % · hologram adds ${fmt(L_VIRT)} cd/m²`, bad: CR < 2 })
})
lab.breakIt({ label: 'Step outside', run: () => { outside = true }, reset: () => { outside = false } })
lab.how(`Magic Leap 2 is <b>optical see-through</b>: you look at the real world through glass, and tiny <b>LCoS projectors</b> inject the image into thin <b>diffractive waveguides</b> (one per colour), which spread it across the lens towards your eye. Light can only be <b>added</b>, never subtracted. So a hologram's contrast is its own brightness compared with the room light coming through: bright rooms wash it out. The fix is a liquid crystal <b>dimmer</b> in front of the waveguides that cuts the incoming light, globally or per segment, behind the content. Compare this with Quest 3 and Varjo, which are <b>video see-through</b>: there every pixel is drawn, so black is possible but the world is only as good as the cameras. Delivered brightness and room reflectance are teaching assumptions.` +
  refsHTML(['VR &amp; AR Wiki. (n.d.). Magic Leap 2. https://www.vrarwiki.com/wiki/Magic_Leap_2', 'Kress, B. C. (2020). <i>Optical architectures for augmented-, virtual-, and mixed-reality headsets</i>. SPIE Press. https://doi.org/10.1117/3.2559304']),
  ['L<sub>bg</sub> = E · ρ / π', 'CR = (L<sub>virtual</sub> + T · L<sub>bg</sub>) / (T · L<sub>bg</sub>)', 'T = 0.22 · (0.003 / 0.22)<sup>dim</sup>', 'readable when CR ≳ 3 : 1'])
addXR(lab, { mag: 1.4, tips: ['MR tip: Quest 3 passthrough is video see-through, ML2 is optical'] })
lab.start()
