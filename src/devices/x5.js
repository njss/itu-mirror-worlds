// =====================================================================================
//  Device Lab No. 08 · Insta360 X5 dual-fisheye 360 camera
//  Specs (Insta360, 2025; TechRadar review): two 1/1.28" sensors, f/2.0 fisheye lenses
//  (replaceable), 8K30 / 5.7K60 video, 72 MP photos, 46 x 124.5 x 38.2 mm, 200 g,
//  185 min recording, IP68 to 15 m.
//  Solver: equirectangular sampling PPD = W / 360; overlap = 2 (FOV/2) - 180 deg;
//  stitching parallax: the two lenses are b apart, so a subject at distance d is seen
//  from two places, angle = atan(b / d), shown as a seam error of angle x PPD pixels.
// =====================================================================================
const { THREE, Lab, MAT, GEO, clamp, lerp, approach, fmt } = window.LabKit
const { addXR, refsHTML, polyline, chrome } = window.DevLab

const BX = 0.046, BY = 0.1245, BZ = 0.0382        // body (m)
const NODAL = 0.03                                 // distance between the two lens entrance pupils (m), teaching value
const FISH_FOV = 200                               // each lens covers about 200 deg
const MODES = [['8K 30', 7680], ['5.7K 60', 5760], ['4K 100', 3840]]
const CY = 0.36                                    // lens centre height on the selfie stick stand

const lab = new Lab({
  prompt: 'a pocket 360 camera with two fisheye lenses: where does the stitch line come from?',
  no: 8, title: 'Insta360 X5', sub: 'dual fisheye 360',
  size: 0.42,
  view: { az: 38, el: 10, dist: 1.7, target: [0.06, 0.24, 0], fov: 30 },
  cut: { a: [1, 0, 0], b: [0, 1, 0], center: [0, CY, 0], reach: 0.3 },
  pills: ['360 video', 'Stitching', 'WebXR'],
})
chrome('X5')

const bodyM = MAT.plastic({ color: [0.03, 0.03, 0.033], roughness: 0.5 })
const gripM = MAT.rubber({ color: [0.04, 0.04, 0.045] })
const ringM = MAT.anodised({ color: [0.06, 0.06, 0.065] })
const domeM = MAT.glass({ color: [0.55, 0.6, 0.7], ior: 1.6, thickness: 0.006 })
const screenM = MAT.paint({ color: [0.02, 0.03, 0.05], roughness: 0.05, clearcoat: 1 })
const sensorM = MAT.paint({ color: [0.2, 0.12, 0.35], roughness: 0.15, clearcoat: 1 })
const pcbM = MAT.plastic({ color: [0.04, 0.2, 0.1], roughness: 0.4 })
const stickM = MAT.carbon()
const standM = MAT.anodised({ color: [0.1, 0.1, 0.11] })

// ---------------------------------------------------------------- tripod + invisible selfie stick (carbon)
for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3 + 0.2; lab.add(new THREE.Mesh(GEO.pipe([[0, 0.08, 0], [Math.cos(a) * 0.1, 0.004, Math.sin(a) * 0.1]], 0.004), standM), { name: `Tripod leg ${i + 1}` }) }
lab.mesh(GEO.tube(0.009, 0, 0.24), stickM, { name: 'Selfie stick (stitched out)', pos: [0, 0.2, 0], label: 'Stick hides in the stitch' })
lab.mesh(GEO.tube(0.006, 0.003, 0.012), MAT.brass(), { name: '1/4" thread', pos: [0, CY - BY / 2 - 0.004 + 0.02, 0] })
// ---------------------------------------------------------------- body
const yB = CY - 0.02                               // the lenses sit near the top of the tall body
lab.mesh(GEO.rbox(BX, BY, BZ, 0.012), bodyM, { name: 'Body', pos: [0, yB, 0], explode: [0.08, 0, 0], xray: 'shell', label: 'Body · 200 g · IP68' })
lab.mesh(GEO.rbox(BX + 0.0006, 0.055, BZ + 0.0006, 0.012), gripM, { name: 'Grip texture', pos: [0, yB - 0.03, 0], explode: [0.1, -0.03, 0] })
lab.mesh(GEO.rbox(0.034, 0.042, 0.0012, 0.003), screenM, { name: 'Touchscreen', pos: [0, yB - 0.022, BZ / 2 + 0.0006], explode: [0, 0, 0.06], label: 'Touchscreen' })
lab.mesh(GEO.disc(0.0055, 0.003, 0.001, 32), MAT.paint({ color: [0.85, 0.1, 0.1] }), { name: 'Shutter button', pos: [0, yB - 0.052, BZ / 2 + 0.001], rot: [Math.PI / 2, 0, 0], explode: [0, 0, 0.08] })
lab.mesh(GEO.rbox(0.03, 0.06, 0.016, 0.003), MAT.paint({ color: [0.2, 0.22, 0.26] }), { name: 'Battery 2400 mAh', pos: [0, yB - 0.03, -0.003], explode: [-0.1, -0.04, 0], label: 'Battery 2400 mAh' })
lab.mesh(GEO.rbox(0.036, 0.05, 0.0016, 0.0005), pcbM, { name: 'Main board', pos: [0, yB + 0.005, 0.008], explode: [-0.08, 0, 0.03] })
lab.mesh(GEO.rbox(0.012, 0.012, 0.0014, 0.0004), MAT.plastic({ color: [0.02, 0.02, 0.022] }), { name: 'Image processor (5 nm AI chip)', pos: [0, yB + 0.005, 0.0095], explode: [-0.08, 0, 0.04] })
lab.mesh(GEO.rbox(0.016, 0.011, 0.002, 0.0008), MAT.steelDark(), { name: 'microSD + USB-C', pos: [BX / 2, yB - 0.03, 0], explode: [0.06, -0.06, 0] })
for (const s of [-1, 1]) lab.mesh(GEO.disc(0.0012, 0.001, 0.0003, 12), MAT.steelDark(), { name: `Microphone ${s}`, pos: [s * 0.012, yB + BY / 2, 0], explode: [0, 0.04, 0], count: 1 })
// ---------------------------------------------------------------- the two fisheye modules, back to back along z
const lenses = []
for (const s of [-1, 1]) {
  const z = s * (BZ / 2)
  const g = new THREE.Group(); g.position.set(0, CY, z); g.rotation.y = s > 0 ? 0 : Math.PI   // +z = front lens
  lab.add(g, { name: s > 0 ? 'Front lens module' : 'Rear lens module', count: 0 })
  const ring = GEO.tube(0.0205, 0.0165, 0.008, 64, -0.004); ring.rotateX(Math.PI / 2)
  lab.add(new THREE.Mesh(ring, ringM), { name: `${s > 0 ? 'Front' : 'Rear'} lens guard ring (replaceable)`, parent: g, explode: [0, 0.02, 0.1] }).position.z = 0.004
  // the bulging fisheye front element: a hemisphere-ish dome
  const dome = new THREE.SphereGeometry(0.0172, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.42); dome.rotateX(Math.PI / 2)
  lab.add(new THREE.Mesh(dome, domeM), { name: `${s > 0 ? 'Front' : 'Rear'} fisheye element`, parent: g, explode: [0, 0.02, 0.13], label: s > 0 ? 'Fisheye f/2.0 · ~200°' : undefined }).position.z = 0.0008
  lab.add(new THREE.Mesh(GEO.rbox(0.013, 0.01, 0.0012, 0.0004), sensorM), { name: `${s > 0 ? 'Front' : 'Rear'} 1/1.28" sensor`, parent: g, explode: [0, 0.02, 0.06], label: s < 0 ? '1/1.28" sensor' : undefined }).position.z = -0.008
  lab.add(new THREE.Mesh(GEO.tube(0.013, 0.01, 0.01, 48), ringM), { name: `${s > 0 ? 'Front' : 'Rear'} lens barrel`, parent: g, explode: [0, 0.02, 0.08] }).position.z = -0.002
  lenses.push(g)
}
// the stitch line: a glowing ring in the plane between the lenses where the two images meet (overlap band)
const seam = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.0012, 8, 96), new THREE.MeshBasicMaterial({ color: 0xE69F00, transparent: true, opacity: 0.85, toneMapped: false }))
seam.position.set(0, CY, 0); seam.layers.set(1); lab.fx.add(seam)
const band = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.01, 96, 1, true), new THREE.MeshBasicMaterial({ color: 0xE69F00, transparent: true, opacity: 0.1, side: THREE.DoubleSide, toneMapped: false, depthWrite: false }))
band.rotation.x = Math.PI / 2; band.position.set(0, CY, 0); band.layers.set(1); lab.fx.add(band)
// a subject (a little person marker) standing on the stitch line at the chosen distance (drawn compressed)
const subj = new THREE.Group()
subj.add(new THREE.Mesh(GEO.tube(0.012, 0, 0.12), MAT.paint({ color: [0.0, 0.45, 0.7] })))
subj.children[0].position.y = 0.06
const headS = new THREE.Mesh(new THREE.SphereGeometry(0.014, 24, 16), MAT.paint({ color: [0.0, 0.45, 0.7] })); headS.position.y = 0.135; subj.add(headS)
lab.add(subj, { name: 'Subject on the stitch line', label: 'Subject', value: () => `${fmt(dist.value, 1)} m (drawn closer)` })
const rays = [-1, 1].map((s) => { const l = polyline([[0, CY, s * BZ / 2], [0.2, 0.1, 0]], s > 0 ? 0x0072B2 : 0xD55E00, 0.9); lab.fx.add(l); return l })

// ---------------------------------------------------------------- solver
lab.hero({ label: 'Parallax at the seam', unit: 'px', max: 120, digits: 1 })
const dist = lab.slider({ id: 'd', label: 'Subject distance', min: 0.15, max: 10, value: 1.5, unit: 'm', digits: 2, ends: ['15 cm', '10 m'] })
const mode = lab.slider({ id: 'm', label: 'Video mode', min: 0, max: 2, step: 1, value: 0, fmt: (v) => MODES[Math.round(v)][0], ends: ['8K 30', '4K 100'] })
let tooClose = false, dNow = 1.5
lab.onTick((dt, l, rdt) => {
  dNow = approach(dNow, tooClose ? 0.15 : dist.value, 0.3, rdt)
  const d = dNow, [mname, W] = MODES[Math.round(mode.value)]
  const ppd = W / 360                                               // equirectangular pixels per degree
  const overlap = FISH_FOV - 180                                    // degrees shared by both lenses (total band)
  const par = THREE.MathUtils.radToDeg(Math.atan(NODAL / d))        // parallax angle between the two viewpoints
  const seamPx = par * ppd
  // place the subject on the seam plane (x axis), drawn between 0.08 and 0.2 m away
  const xs = lerp(0.08, 0.2, Math.log(d / 0.15) / Math.log(10 / 0.15))
  lab.place(subj, xs, 0.0, 0)
  for (const [i, r] of rays.entries()) { const p = r.geometry.attributes.position; p.setXYZ(0, 0, CY, (i ? 1 : -1) * BZ / 2); p.setXYZ(1, xs, 0.135, 0); p.needsUpdate = true }
  seam.material.color.setHex(seamPx > 40 ? 0xD55E00 : 0xE69F00)
  band.scale.y = clamp(seamPx / 10, 0.5, 2.5)
  lab.setHero(seamPx, {
    state: seamPx < 8 ? 'blends cleanly' : seamPx < 40 ? 'optical-flow stitching hides it' : 'ghosting / cut-off',
    sub: `${mname}: ${fmt(ppd, 1)} px/° · overlap band ${fmt(overlap)}° · parallax ${fmt(par, 2)}° from lenses ${fmt(NODAL * 1000)} mm apart`,
    bad: seamPx > 40,
  })
})
lab.breakIt({ label: 'Too close', run: () => { tooClose = true }, reset: () => { tooClose = false } })
lab.how(`Each fisheye lens sees a bit more than a hemisphere (about 200°), so the two images share a <b>20° overlap band</b> around the camera's waist. The stitching software blends them there into one <b>equirectangular</b> frame, 7680 px wide in 8K: about 21 px per degree. The two lenses are about 3 cm apart, though, so a nearby subject on the seam is seen from two slightly different places (<b>parallax</b>). The two images then disagree by atan(b/d). Optical-flow stitching warps away moderate disagreement, but beyond a few dozen pixels the seam shows doubled or cut-off edges. Far subjects line up; keep people at least about 1 m away and turned toward a lens. The stick sits in the lens' blind spot and is stitched out. For <b>Gaussian splatting</b> and photogrammetry, 360 frames are often split into perspective views; the px/° figure tells you how much detail each view can hold. The 30 mm nodal distance is a teaching estimate.` +
  refsHTML(['Insta360. (2025). <i>Insta360 X5</i> [Product specifications]. https://www.insta360.com/product/insta360-x5', 'Carter, J. (2025). Insta360 X5 review. <i>TechRadar</i>. https://www.techradar.com/cameras/360-cameras/insta360-x5-review', 'Szeliski, R. (2022). <i>Computer vision: Algorithms and applications</i> (2nd ed.). Springer. https://szeliski.org/Book/']),
  ['PPD = W<sub>equirect</sub> / 360°', 'overlap = FOV<sub>lens</sub> − 180°', 'parallax = atan(b / d)', 'seam disparity ≈ parallax · PPD  px', 'clean < 8 px · flow-stitched < 40 px (teaching thresholds)'])
addXR(lab, { mag: 3, yaw: 90, tips: ['MR tip: hold a real X5 at the same height and compare'] })
lab.start()
