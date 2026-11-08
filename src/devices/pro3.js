// =====================================================================================
//  Device Lab No. 07 · Matterport Pro3 (LiDAR + 360 panorama capture)
//  Specs (Matterport, n.d.): LiDAR range 0.5 - 100 m, accuracy +-20 mm at 10 m,
//  100,000 points/s, under 20 s per 360 deg scan, 134.2 MP panorama (HDR, 5 exposures),
//  FOV 360 x 295 deg, 2.2 kg, IP43, E57 export at 10 points per degree.
//  Solver: point spacing s = r * dtheta;  panorama texel = r * (pi / width_px);
//  mirror ghost: a mirror at d_m puts phantom points at d_m + d_reflected behind the glass.
// =====================================================================================
const { THREE, Lab, MAT, GEO, clamp, lerp, approach, fmt } = window.LabKit
const { addXR, refsHTML, polyline, chrome } = window.DevLab

const PTS = 1.5e6                    // points per 360 deg scan (Matterport, n.d.)
const DTH = Math.sqrt(360 * 295 / PTS) // mean angular spacing in degrees, about 0.27
const PANO_W = Math.round(Math.sqrt(134.2e6 * 2))   // equirectangular width for 134.2 MP at 2:1
const H = 1.45                       // scanner head height on the tripod

const lab = new Lab({
  prompt: 'a tripod LiDAR camera that scans a building into a digital twin: what limits the detail?',
  no: 7, title: 'Matterport Pro3', sub: 'LiDAR + 360',
  size: 2.2,
  view: { az: 30, el: 10, dist: 1.75, target: [0.1, 1.1, -0.2], fov: 30 },
  cut: { a: [0, 0, 1], b: [0, 1, 0], center: [0, H, 0], reach: 0.4 },
  pills: ['LiDAR', 'Point cloud', 'WebXR'],
})
chrome('pro3')

const bodyM = MAT.plastic({ color: [0.06, 0.06, 0.065], roughness: 0.35 })
const accentM = MAT.paint({ color: [0.9, 0.9, 0.88], roughness: 0.35 })
const glassM = MAT.glass({ color: [0.35, 0.37, 0.42], thickness: 0.004 })
const tripodM = MAT.aluminium({ roughness: 0.35 })
const blackM = MAT.anodised({ color: [0.05, 0.05, 0.055] })
const pcbM = MAT.plastic({ color: [0.04, 0.2, 0.1], roughness: 0.4 })
const wallM = MAT.paint({ color: [0.86, 0.84, 0.8], roughness: 0.8, clearcoat: 0 })

// ---------------------------------------------------------------- tripod
for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3 + 0.4; lab.add(new THREE.Mesh(GEO.pipe([[0, H - 0.3, 0], [Math.cos(a) * 0.42, 0.01, Math.sin(a) * 0.42]], 0.012), tripodM), { name: `Tripod leg ${i + 1}`, explode: [Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2] }) }
for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3 + 0.4; lab.mesh(GEO.disc(0.018, 0.012), MAT.rubber(), { name: `Foot ${i + 1}`, pos: [Math.cos(a) * 0.42, 0.006, Math.sin(a) * 0.42], explode: [Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2] }) }
lab.mesh(GEO.tube(0.016, 0, 0.25), tripodM, { name: 'Centre column', pos: [0, H - 0.235, 0] })
lab.mesh(GEO.disc(0.04, 0.03, 0.004), blackM, { name: 'Leg hub', pos: [0, H - 0.3, 0] })
// quick-release plate (female 3/8"-16 thread) under the body; the body pans on it
lab.mesh(GEO.disc(0.035, 0.02, 0.003), MAT.aluminiumMachined(), { name: 'Quick-release mount (3/8")', pos: [0, H - 0.1, 0], explode: [0, -0.1, 0], label: 'Quick release · 3/8"' })
const turn = new THREE.Group(); lab.add(turn, { name: 'Rotating body', count: 0 })
// ---------------------------------------------------------------- body: 181 mm tall, 161 mm wide, 76 mm deep (Matterport, n.d.)
// The LiDAR mirror sits in the middle of the front and spins about the left-right axis, so the
// beam sweeps a vertical plane (295 deg; the body blocks the rest). The whole body pans 360 deg
// in under 20 s, which turns that plane into a sphere. One large camera lens sits above it.
const BH = 0.181, BW = 0.161, BD = 0.076, YC = H        // body centre at the mirror height
lab.add(new THREE.Mesh(GEO.rbox(BW, BH, BD, 0.03), bodyM), { name: 'Body', parent: turn, explode: [0, 0, -0.14], xray: 'shell', label: 'Pro3 · 2.2 kg · IP43' }).position.set(0, YC + 0.0005, 0)
const disc = (r, h) => { const g = GEO.disc(r, h, h * 0.15, 48); g.rotateX(Math.PI / 2); return g }
// camera: large lens in the upper front
lab.add(new THREE.Mesh(disc(0.03, 0.012), blackM), { name: 'Camera lens barrel', parent: turn, explode: [0, 0.04, 0.14] }).position.set(0, YC + 0.045, BD / 2 + 0.004)
lab.add(new THREE.Mesh(disc(0.022, 0.004), glassM), { name: 'Camera front element', parent: turn, explode: [0, 0.04, 0.16], label: 'Camera · 134.2 MP panorama' }).position.set(0, YC + 0.045, BD / 2 + 0.01)
lab.add(new THREE.Mesh(GEO.rbox(0.014, 0.011, 0.002, 0.001), MAT.paint({ color: [0.2, 0.12, 0.35], roughness: 0.15 })), { name: 'Image sensor', parent: turn, explode: [0, 0.04, 0.09] }).position.set(0, YC + 0.045, BD / 2 - 0.016)
// LiDAR: a horizontal window across the middle of the front, with the spinning mirror behind it
lab.add(new THREE.Mesh(GEO.rbox(0.11, 0.03, 0.004, 0.002), MAT.glass({ color: [0.35, 0.37, 0.42], thickness: 0.002 })), { name: 'LiDAR window', parent: turn, explode: [0, -0.02, 0.18] }).position.set(0, YC - 0.012, BD / 2 + 0.001)
const mirror = new THREE.Group(); mirror.position.set(0, YC - 0.012, BD / 2 - 0.012); turn.add(mirror)
lab.add(new THREE.Mesh(GEO.rbox(0.05, 0.02, 0.003, 0.001), MAT.chrome()), { name: 'LiDAR scan mirror', parent: mirror, explode: [0, -0.02, 0.12], label: 'LiDAR mirror · 100k pts/s' }).rotation.x = Math.PI / 4
lab.add(new THREE.Mesh(GEO.tube(0.006, 0, 0.07), MAT.steel()), { name: 'Mirror shaft', parent: mirror, explode: [0, -0.02, 0.1] }).rotation.z = Math.PI / 2
lab.add(new THREE.Mesh(GEO.rbox(0.014, 0.014, 0.02, 0.002), blackM), { name: 'Laser + receiver', parent: turn, explode: [0.06, -0.04, 0.06] }).position.set(0.04, YC - 0.012, 0.0)
lab.add(new THREE.Mesh(GEO.rbox(0.13, 0.15, 0.0016, 0.0005), pcbM), { name: 'Main board', parent: turn, explode: [0, 0, -0.08] }).position.set(0, YC + 0.005, -0.012)
// back: small status screen and power button; base: battery slot (removable, 45 Wh) and the pan motor
lab.add(new THREE.Mesh(GEO.rbox(0.04, 0.025, 0.002, 0.002), MAT.paint({ color: [0.03, 0.05, 0.08], roughness: 0.05, clearcoat: 1 })), { name: 'Status screen', parent: turn, explode: [0, 0, -0.18] }).position.set(0, YC + 0.05, -BD / 2 - 0.0005)
lab.add(new THREE.Mesh(disc(0.006, 0.004), MAT.paint({ color: [0.85, 0.85, 0.86] })), { name: 'Power button', parent: turn, explode: [0, 0, -0.18] }).position.set(0, YC + 0.02, -BD / 2 - 0.001)
lab.add(new THREE.Mesh(GEO.rbox(0.1, 0.03, 0.05, 0.004), MAT.paint({ color: [0.2, 0.22, 0.26] })), { name: 'Removable battery (45 Wh)', parent: turn, explode: [0, -0.1, -0.12], label: 'Battery · 45 Wh' }).position.set(0, YC - 0.07, -0.006)
lab.add(new THREE.Mesh(GEO.disc(0.014, 0.014), MAT.copper()), { name: 'Pan motor', parent: turn, explode: [0, -0.12, 0] }).position.set(0, YC - BH / 2 + 0.01, 0)
// a flash marker that lights at each of the four camera stops
const stopFlash = new THREE.Mesh(new THREE.SphereGeometry(0.008, 16, 10), MAT.glow({ emissive: [0.2, 0.6, 1.0], emissiveIntensity: 0 })); stopFlash.position.set(0, YC + 0.045, BD / 2 + 0.03); stopFlash.userData.noAO = true; turn.add(stopFlash)

// ---------------------------------------------------------------- a corner of the room being scanned (two walls, a floor strip)
const RW = 1.2
lab.mesh(new THREE.BoxGeometry(2.0, 1.9, 0.04), wallM, { name: 'Back wall', pos: [0.2, 0.95, -RW], add: true })
lab.mesh(new THREE.BoxGeometry(0.04, 1.9, 1.6), wallM, { name: 'Side wall (mirror side)', pos: [-0.8, 0.95, -0.4] })
const mirrorM = lab.mesh(new THREE.BoxGeometry(0.01, 0.8, 0.6), MAT.chrome({ roughness: 0.02 }), { name: 'Wall mirror', pos: [-0.775, 1.15, -0.5] })
// the LiDAR beam and the points it has left on the walls
const beam = polyline([[0, H, 0], [0, H, -RW]], 0xD55E00, 0.95); lab.fx.add(beam)
const NP = 3000, pts = new Float32Array(NP * 3), cols = new Float32Array(NP * 3)
const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pts, 3)); pg.setAttribute('color', new THREE.BufferAttribute(cols, 3)); pg.setDrawRange(0, 0)
const cloud = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.03, vertexColors: true, toneMapped: false, transparent: true, depthWrite: false }))
cloud.layers.set(1); cloud.frustumCulled = false; lab.fx.add(cloud)
let np = 0, scanA = 0, ghosts = 0
// Turbo colour map (Mikhailov, 2019), polynomial fit: near = blue, far = red
const turbo = (t) => { t = clamp(t); const r = 34.61 + t * (1172.33 + t * (-10793.56 + t * (33300.12 + t * (-38394.49 + t * 14825.05)))); const g = 23.31 + t * (557.33 + t * (1225.33 + t * (-3574.96 + t * (1073.77 + t * 707.56)))); const b = 27.2 + t * (3211.1 + t * (-15327.97 + t * (27814 + t * (-22569.18 + t * 6838.66)))); return [clamp(r / 255), clamp(g / 255), clamp(b / 255)] }
// cast a ray from the head into the room corner (back wall z=-RW, side wall x=-0.78, floor y=0); mirror reflects
function cast(dir, withMirror) {
  const o = new THREE.Vector3(0, H, 0)
  let best = 1e9, n = null
  if (dir.z < 0) { const t = (-RW + 0.02 - o.z) / dir.z; if (t > 0 && t < best) { best = t; n = 'back' } }
  if (dir.x < 0) { const t = (-0.78 - o.x) / dir.x; const p = o.clone().addScaledVector(dir, t); if (t > 0 && t < best && p.z > -RW && p.z < 0.4) { best = t; n = 'side' } }
  if (dir.y < 0) { const t = (0.0 - o.y) / dir.y; if (t > 0 && t < best) { best = t; n = 'floor' } }
  if (!n) return null
  const p = o.clone().addScaledVector(dir, best)
  // the mirror: a hit inside its rectangle continues as a reflected ray, but the scanner assumes a straight line
  if (withMirror && n === 'side' && p.y > 0.75 && p.y < 1.55 && p.z > -0.8 && p.z < -0.2) {
    const r = dir.clone(); r.x = -r.x
    const t2 = (0.6 - p.x) / Math.max(1e-3, r.x)       // reflected ray hits a far object 1.4 m away (outside the drawn room)
    return { p: o.clone().addScaledVector(dir, best + Math.abs(t2)), ghost: true, hit: p }
  }
  return { p, ghost: false, hit: p }
}

// ---------------------------------------------------------------- solver
lab.hero({ label: 'Point spacing on the wall', unit: 'mm', max: 200, digits: 1 })
const rng = lab.slider({ id: 'r', label: 'Distance to surface', min: 0.5, max: 100, value: 6, unit: 'm', digits: 1, ends: ['0.5 m', '100 m'] })
let mirrorOn = false
lab.onTick((dt, l, rdt) => {
  const r = rng.value
  const dth = THREE.MathUtils.degToRad(DTH)
  const spacing = r * dth                                  // m between neighbouring points
  const texel = r * (2 * Math.PI / PANO_W)                 // m per panorama pixel
  // animate: the body pans slowly (real: about 20 s per 360), the mirror spins fast
  turn.rotation.y += rdt * (2 * Math.PI / 20)
  mirror.rotation.x += rdt * 40
  const stop = ((turn.rotation.y % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2); stopFlash.material.emissiveIntensity = stop < 0.06 ? 8 : 0
  // deposit points: the beam sweeps a vertical plane that rotates with the body
  for (let k = 0; k < 6; k++) {
    scanA += 0.21
    const az = turn.rotation.y + Math.PI, el = -1.1 + ((scanA * 0.37) % 2.2)
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el))
    const h = cast(dir, mirrorOn); if (!h) continue
    const i = np % NP; pts.set(h.p.toArray(), i * 3)
    const c = h.ghost ? [0.84, 0.37, 0] : turbo(h.p.distanceTo(new THREE.Vector3(0, H, 0)) / 2.4)
    cols.set(c, i * 3); np++; if (h.ghost) ghosts++
    if (k === 5) { const b = beam.geometry.attributes.position; b.setXYZ(0, Math.sin(turn.rotation.y) * 0.03, H - 0.012, Math.cos(turn.rotation.y) * 0.03); b.setXYZ(1, h.hit.x, h.hit.y, h.hit.z); b.needsUpdate = true }
  }
  pg.setDrawRange(0, Math.min(np, NP)); pg.attributes.position.needsUpdate = true; pg.attributes.color.needsUpdate = true
  lab.setHero(spacing * 1000, {
    state: spacing < 0.01 ? 'fine detail' : spacing < 0.05 ? 'room detail' : 'coarse',
    sub: `one point every ${fmt(DTH, 2)}° (1.5 M points per scan) · panorama pixel ${fmt(texel * 1000, 1)} mm · spec accuracy ±20 mm at 10 m${r > 20 ? ' · beyond 20 m only in the E57 export' : ''}${mirrorOn ? ` · ${fmt(ghosts)} phantom points behind the mirror` : ''}`,
    bad: mirrorOn,
  })
})
lab.breakIt({ label: 'Scan a mirror', run: () => { mirrorOn = true; ghosts = 0 }, reset: () => { mirrorOn = false } })
lab.how(`The Pro3 combines two instruments in one turning body. A <b>LiDAR</b> fires laser pulses at a mirror in the middle of the front; the mirror spins and sweeps the beam up and down (295°), and timing each echo gives its distance (time of flight). The whole body pans 360° on its tripod mount in under 20 s, turning that sweep into a sphere of up to 1.5 million points. At <b>four stops</b> the large <b>camera</b> lens takes bracketed HDR photos (several exposures merged), which become the 134-megapixel panorama that colours the points and the walkthrough view. Spreading 1.5 million points over the sphere leaves one point every ≈ 0.27°, so points sit r·Δθ apart: about 5 cm on a wall 10 m away, which is why you scan every few metres. Mirrors and glass break the assumption that light travels straight: the scanner places reflected points <b>behind</b> the mirror, a phantom room to clean up before the twin is used. The scan is slowed down here, and the mirror's exact position inside the case is simplified.` +
  refsHTML(['Matterport. (n.d.). <i>Matterport Pro3 camera</i> [Product specifications]. https://matterport.com/store/product/cam-mc300-x', 'Vosselman, G., &amp; Maas, H.-G. (Eds.). (2010). <i>Airborne and terrestrial laser scanning</i>. Whittles Publishing.']),
  ['d = c · Δt / 2', 'Δθ = √(360° · 295° / 1.5 M) ≈ 0.27°', 's = r · Δθ   (10 m → ≈ 46 mm)', 'pixel = r · 2π / W<sub>pano</sub>,  W ≈ 16,400 px', 'ghost: r<sub>reported</sub> = r<sub>to mirror</sub> + r<sub>after mirror</sub>'])
addXR(lab, { mag: 1, tips: ['VR tip: stand where the scanner stands; the points are what it sees'] })
lab.start()
