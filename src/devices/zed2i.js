// =====================================================================================
//  Device Lab No. 01 · Stereolabs ZED 2i stereo depth camera
//  Real dimensions (Stereolabs, n.d.): 175.25 x 30.25 x 43.10 mm, 230 g, baseline 120 mm,
//  2.1 mm f/2.0 lenses, dual 4 MP 1/3" sensors with 2 um pixels, 110 x 70 deg FOV,
//  depth range 0.3 - 20 m, IMU + barometer + magnetometer, USB-C, IP66.
//  Solver: pinhole stereo. Disparity d = f B / Z, depth error dZ = Z^2 dd / (f B).
// =====================================================================================
const { THREE, Lab, MAT, GEO, clamp, lerp, approach, fmt } = window.LabKit
const { addXR, refsHTML, frustum, polyline, chrome } = window.DevLab

// ---------------------------------------------------------------- constants (SI)
const L = 0.17525, H = 0.03025, D = 0.0431        // housing, metres
const B = 0.120                                    // stereo baseline (lens centre to lens centre)
const F_MM = 2.1e-3, PIX = 2e-6                    // focal length, pixel pitch
const CY = 0.128                                   // camera centreline height on the mini tripod
const ZF = D / 2                                   // front face z
// resolution modes: name, width px, height px, frame rate, binning factor
const MODES = [['WVGA', 672, 376, 100, 4], ['HD720', 1280, 720, 60, 2], ['HD1080', 1920, 1080, 30, 1], ['2K', 2208, 1242, 15, 1]]
const DD = 0.25                                    // sub-pixel matching uncertainty (px), typical for SGM style matchers
const DMAX_FRAC = 0.2                              // disparity search range as a fraction of image width

const lab = new Lab({
  prompt: 'a stereo depth camera: how do two eyes 12 cm apart measure distance?',
  no: 1, title: 'ZED 2i', sub: 'stereo depth',
  size: 0.24,
  view: { az: 34, el: 22, dist: 2.2, target: [0, 0.09, 0.07], fov: 30 },
  cut: { a: [0, 1, 0], b: [0, 0, 1], center: [0, CY, 0], reach: 0.3 },
  pills: ['Stereo vision', 'Depth', 'WebXR'],
})
chrome('zed2i')

// ---------------------------------------------------------------- materials
const shellM = MAT.satin({ color: [0.06, 0.065, 0.07], roughness: 0.48 })
const frontM = MAT.glass({ color: [0.55, 0.58, 0.62], roughness: 0.02, thickness: 0.001 })
const blackAl = MAT.anodised({ color: [0.03, 0.03, 0.035] })
const lensM = MAT.glass({ color: [0.75, 0.85, 1.0], ior: 1.6, thickness: 0.004 })
const pcbM = MAT.plastic({ color: [0.04, 0.22, 0.12], roughness: 0.4 })
const chipM = MAT.plastic({ color: [0.02, 0.02, 0.022], roughness: 0.3 })
const sensorM = MAT.paint({ color: [0.18, 0.12, 0.35], roughness: 0.15, clearcoat: 1 })
const goldM = MAT.gold()
const alM = MAT.aluminium({ roughness: 0.4 })
const brassM = MAT.brass()
const rubberM = MAT.rubber()
const tripodM = MAT.anodised({ color: [0.12, 0.12, 0.13] })
const ledM = MAT.glow({ emissive: [0.1, 0.55, 1.0], emissiveIntensity: 3 })
const usbM = MAT.stainless({ roughness: 0.25 })

// ---------------------------------------------------------------- housing and front
lab.mesh(GEO.rbox(L, H, D, 0.0145), shellM, { name: 'Housing', pos: [0, CY, 0], explode: [0, 0.1, -0.05], xray: 'shell', label: 'Housing · IP66' })
// front window: a rounded-rectangle extrusion that follows the stadium shaped face
const winShape = (() => { const w = L - 0.016, h = H - 0.008, r = h / 2 - 0.0005, s = new THREE.Shape(); s.moveTo(-w / 2 + r, -h / 2); s.lineTo(w / 2 - r, -h / 2); s.absarc(w / 2 - r, 0, h / 2, -Math.PI / 2, Math.PI / 2); s.lineTo(-w / 2 + r, h / 2); s.absarc(-w / 2 + r, 0, h / 2, Math.PI / 2, Math.PI * 1.5); return s })()
lab.mesh(GEO.extrude(winShape, 0.0012), frontM, { name: 'Polarised front window', pos: [0, CY, ZF + 0.0003], explode: [0, 0.05, 0.09] })

// lens stacks: barrel, two glass elements, sensor, sensor board (left and right eye)
const eyes = []
for (const s of [-1, 1]) {
  const x = s * B / 2, side = s < 0 ? 'Left' : 'Right'
  const barrel = GEO.tube(0.0088, 0.0062, 0.013); barrel.rotateX(Math.PI / 2)
  lab.mesh(barrel, blackAl, { name: `${side} lens barrel`, pos: [x, CY, ZF - 0.0072], explode: [s * 0.01, 0, 0.04] })
  const trim = GEO.tube(0.0105, 0.0088, 0.0012); trim.rotateX(Math.PI / 2)
  lab.mesh(trim, MAT.aluminiumMachined(), { name: `${side} lens trim ring`, pos: [x, CY, ZF - 0.0008], explode: [s * 0.01, 0, 0.055] })
  const el = GEO.lathe([[0, -0.0016], [0.0058, -0.0006], [0.006, 0.0006], [0, 0.0024]], 48); el.rotateX(Math.PI / 2)
  lab.mesh(el, lensM, { name: `${side} front element`, pos: [x, CY, ZF - 0.0022], explode: [s * 0.01, 0, 0.05] })
  const el2 = GEO.lathe([[0, -0.001], [0.0045, -0.0004], [0.0046, 0.0004], [0, 0.001]], 48); el2.rotateX(Math.PI / 2)
  lab.mesh(el2, lensM, { name: `${side} rear element`, pos: [x, CY, ZF - 0.0105], explode: [s * 0.01, 0, 0.035] })
  // 1/3" sensor: active area about 5.4 x 3.0 mm at 2 um, package 7 x 6 mm
  const sens = lab.mesh(GEO.rbox(0.007, 0.006, 0.0009, 0.0003), sensorM, { name: `${side} 4 MP sensor`, pos: [x, CY, ZF - 0.0152], explode: [s * 0.01, 0, 0.02], label: s < 0 ? '1/3" 4 MP sensor' : undefined })
  lab.mesh(GEO.rbox(0.022, 0.022, 0.0012, 0.0004), pcbM, { name: `${side} sensor board`, pos: [x, CY, ZF - 0.0164], explode: [s * 0.01, 0, 0.01] })
  // a glowing dot on each sensor: where the target point lands (moves with disparity)
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.00045, 12, 8), MAT.glow({ emissive: [1, 0.62, 0], emissiveIntensity: 6 }))
  dot.userData.noAO = true; dot.castShadow = false; sens.add(dot); dot.position.z = 0.0006
  // field of view of this eye: 110 deg x 70 deg
  const fr = frustum(110, 70, 0.06,  // spec field of view: 110° × 70°
    s < 0 ? 0x0072B2 : 0xE69F00, 0.35); fr.position.set(x, CY, ZF); lab.fx.add(fr)
  eyes.push({ x, dot, fr })
}

// main electronics
lab.mesh(GEO.rbox(0.15, 0.022, 0.0016, 0.0005), pcbM, { name: 'Main board', pos: [0, CY, ZF - 0.024], explode: [0, 0, -0.03], label: 'Main board' })
lab.mesh(GEO.rbox(0.0035, 0.003, 0.0009, 0.0002), chipM, { name: 'IMU (400 Hz)', pos: [0.006, CY + 0.004, ZF - 0.0226], explode: [0, 0.02, -0.03], label: 'IMU 400 Hz' })
lab.mesh(GEO.rbox(0.002, 0.002, 0.0008, 0.0002), chipM, { name: 'Barometer', pos: [-0.006, CY + 0.004, ZF - 0.0226], explode: [0, 0.025, -0.03] })
lab.mesh(GEO.rbox(0.002, 0.002, 0.0008, 0.0002), chipM, { name: 'Magnetometer', pos: [-0.012, CY - 0.004, ZF - 0.0226], explode: [0, 0.03, -0.03] })
lab.mesh(GEO.rbox(0.012, 0.012, 0.0014, 0.0004), chipM, { name: 'USB 3 bridge chip', pos: [0.024, CY, ZF - 0.0226], explode: [0, 0.02, -0.035] })
lab.mesh(GEO.rbox(0.008, 0.008, 0.0012, 0.0003), chipM, { name: 'Image signal processor', pos: [-0.026, CY, ZF - 0.0226], explode: [0, 0.02, -0.035] })
lab.mesh(GEO.rbox(0.13, 0.019, 0.0025, 0.0008), alM, { name: 'Heat spreader', pos: [0, CY, -ZF + 0.006], explode: [0, 0, -0.06] })
lab.mesh(GEO.rbox(0.0089, 0.0033, 0.0072, 0.0014), usbM, { name: 'USB-C port', pos: [0, CY, -ZF + 0.0031], explode: [0, 0, -0.08], label: 'USB-C · 5 V 380 mA' })
lab.mesh(GEO.disc(0.0011, 0.0012, 0.0002, 16), ledM, { name: 'Status LED', pos: [0, CY + 0.007, ZF + 0.0002], rot: [Math.PI / 2, 0, 0] })
// 1/4"-20 tripod insert in the base
lab.mesh(GEO.tube(0.0048, 0.0032, 0.007), brassM, { name: '1/4"-20 tripod insert', pos: [0, CY - H / 2 + 0.0035, 0], explode: [0, -0.03, 0] })

// ---------------------------------------------------------------- mini tripod (keeps it on the floor)
const yTop = CY - H / 2
lab.mesh(GEO.disc(0.017, 0.006, 0.001), tripodM, { name: 'Tripod plate', pos: [0, yTop - 0.003, 0], explode: [0, -0.05, 0] })
lab.mesh(new THREE.SphereGeometry(0.0085, 32, 20), tripodM, { name: 'Ball head', pos: [0, yTop - 0.013, 0], explode: [0, -0.055, 0] })
lab.mesh(GEO.tube(0.009, 0.0, 0.03), tripodM, { name: 'Tripod column', pos: [0, yTop - 0.04, 0], explode: [0, -0.06, 0] })
for (let i = 0; i < 3; i++) {
  const a = i * Math.PI * 2 / 3 + 0.5, r = 0.075
  lab.add(new THREE.Mesh(GEO.pipe([[0, yTop - 0.052, 0], [Math.cos(a) * r * 0.55, yTop * 0.45, Math.sin(a) * r * 0.55], [Math.cos(a) * r, 0.006, Math.sin(a) * r]], 0.0045), tripodM), { name: `Tripod leg ${i + 1}`, explode: [Math.cos(a) * 0.04, -0.03, Math.sin(a) * 0.04] })
  lab.mesh(new THREE.SphereGeometry(0.006, 16, 10), rubberM, { name: `Foot ${i + 1}`, pos: [Math.cos(a) * r, 0.005, Math.sin(a) * r], explode: [Math.cos(a) * 0.04, -0.03, Math.sin(a) * 0.04] })
}
// USB-C cable leaving the back and resting on the floor
lab.add(new THREE.Mesh(GEO.pipe([[0, CY, -ZF - 0.008], [0, CY, -ZF - 0.03], [0, CY - 0.06, -ZF - 0.07], [0.03, 0.004, -0.13], [0.09, 0.004, -0.17]], 0.0024), rubberM), { name: 'USB-C cable' })
lab.mesh(GEO.rbox(0.0125, 0.0068, 0.02, 0.002), rubberM, { name: 'Cable plug', pos: [0, CY, -ZF - 0.01], explode: [0, 0, -0.1] })

// ---------------------------------------------------------------- the target and the two rays
// The real target is metres away; it is drawn 10 - 30 cm in front so the rays fit the frame.
const target = new THREE.Group()
const board = new THREE.Mesh(new THREE.PlaneGeometry(0.034, 0.034), new THREE.MeshStandardMaterial({ map: (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { g.fillStyle = (i + j) % 2 ? '#111' : '#f4f2ec'; g.fillRect(i * 16, j * 16, 16, 16) } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t })(), roughness: 0.6, side: THREE.DoubleSide }))
board.rotation.y = Math.PI
target.add(board)
const stand = new THREE.Mesh(GEO.tube(0.0015, 0, 0.1), MAT.steel()); target.add(stand)
const base = new THREE.Mesh(GEO.disc(0.014, 0.003), MAT.steelDark()); target.add(base)
lab.add(target, { name: 'Checkerboard target', label: 'Target', value: () => `${fmt(Zc.value, 1)} m · see the ruler` })
const rays = eyes.map((e, i) => { const l = polyline([[e.x, CY, ZF], [0, CY, 0.2]], i ? 0xE69F00 : 0x0072B2); lab.fx.add(l); return l })
// depth uncertainty band: a translucent orange bar along the optical axis, length ~ dZ
// a printed distance ruler on the floor: the real metres, on a log scale, under the drawn target
const ruler = (() => {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 160; const g = c.getContext('2d')
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 1024, 160); g.fillStyle = '#1B2027'; g.font = '600 34px Inter, sans-serif'
  const X = (m) => 40 + 944 * Math.log(m / 0.3) / Math.log(20 / 0.3)
  g.fillRect(40, 70, 944, 4)
  for (const m of [0.3, 0.5, 1, 2, 3, 5, 10, 20]) { g.fillRect(X(m) - 2, 50, 4, 40); const t = m + ' m'; g.fillText(t, Math.min(1024 - g.measureText(t).width - 6, Math.max(6, X(m) - g.measureText(t).width / 2)), 130) }
  g.fillStyle = '#5E6773'; g.font = '500 24px Inter, sans-serif'; g.fillText('real distance (log scale)', 40, 36)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.019), new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 }))
  m.rotation.x = -Math.PI / 2; m.rotation.z = -Math.PI / 2; m.position.set(0.03, 0.0008, ZF + 0.14); return m
})()
lab.add(ruler, { name: 'Distance ruler (log scale)' })
const band = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.004, 1), new THREE.MeshBasicMaterial({ color: 0xE69F00, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false }))
band.layers.set(1); lab.fx.add(band)

// ---------------------------------------------------------------- solver
lab.hero({ label: 'Depth error', unit: 'cm', max: 60, digits: 1 })
const Zc = lab.slider({ id: 'z', label: 'Distance to target', min: 0.3, max: 20, value: 3, unit: 'm', digits: 1, ends: ['0.3 m', '20 m'] })
const Mc = lab.slider({ id: 'mode', label: 'Video mode', min: 0, max: 3, step: 1, value: 2, fmt: (v) => { const m = MODES[Math.round(v)]; return `${m[0]} ${m[3]} fps` }, ends: ['WVGA 100 fps', '2K 15 fps'] })
let Zshow = 3, broken = false
lab.onTick((dt) => {
  const m = MODES[Math.round(Mc.value)]
  const f = (F_MM / PIX) / m[4]                    // focal length in pixels after binning
  const Zt = broken ? 0.15 : Zc.value
  Zshow = approach(Zshow, Zt, 0.25, dt)
  const Z = Zshow
  const d = f * B / Z                              // disparity (px)
  const dmax = DMAX_FRAC * m[1]                    // matcher search range (px)
  const dZ = Z * Z * DD / (f * B)                  // depth error (m)
  const ok = d <= dmax
  // place the drawn target: 0.3 m -> 10 cm in front, 20 m -> 30 cm in front (log scale)
  const zs = ZF + lerp(0.08, 0.2, Math.log(Z / 0.3) / Math.log(20 / 0.3))
  lab.place(target, 0, 0, zs)
  board.position.set(0, CY, 0); stand.position.set(0, (CY - 0.017) / 2, -0.001); stand.scale.y = (CY - 0.017) / 0.1; base.position.set(0, 0.0015, 0)
  for (const [i, e] of eyes.entries()) {
    const p = rays[i].geometry.attributes.position; p.setXYZ(0, e.x, CY, ZF); p.setXYZ(1, 0, CY, zs); p.needsUpdate = true
    rays[i].material.opacity = ok ? 0.9 : 0.25
    // image-plane offset of the point: half the disparity, in metres on the sensor (clamped to the active area)
    e.dot.position.x = clamp(-Math.sign(e.x) * (d / 2) * PIX * m[4], -0.0027, 0.0027)
    e.dot.visible = ok
  }
  band.position.set(0, CY, zs); band.scale.z = clamp(dZ / Z * 0.6, 0.002, 0.2)
  band.visible = ok
  if (ok) lab.setHero(dZ * 100, { state: Z < 1 ? 'close range' : Z < 8 ? 'good depth' : 'long range', sub: `disparity ${fmt(d, 1)} px · f ${fmt(f)} px · error ${fmt(dZ / Z * 100, 2)} % of the distance (Stereolabs spec: under 1 % to 3 m, under 5 % to 15 m)`, bad: dZ / Z > 0.05 })
  else lab.setHero(0, { state: 'no match', sub: `disparity ${fmt(d)} px exceeds the ${fmt(dmax)} px search range: closer than f·B/d<sub>max</sub> = ${fmt(f * B / dmax, 2)} m, the two views no longer overlap`, bad: true })
})

lab.breakIt({ label: 'Too close', run: () => { broken = true }, reset: () => { broken = false } })
lab.how(`Two cameras 12 cm apart see the same point at slightly different image positions. That shift, the <b>disparity</b> <i>d</i>, shrinks with distance, so depth comes from triangulation. A fixed matching error of a quarter pixel therefore costs more and more depth as the point recedes: error grows with the <b>square</b> of distance. Binning (WVGA, HD720) halves the focal length in pixels and doubles the error. The model predicts about 0.6 % at 3 m and 3 % at 15 m, inside Stereolabs' published accuracy. The target is drawn close so it fits the frame; the ruler on the floor shows its real distance. Too close, the disparity exceeds the matcher's search range and depth fails. In a digital twin this sets how far a ZED can map a room before the walls get noisy.` +
  refsHTML(['Hartley, R., &amp; Zisserman, A. (2004). <i>Multiple view geometry in computer vision</i> (2nd ed.). Cambridge University Press.', 'Stereolabs. (n.d.). <i>ZED 2i</i> [Product specifications]. https://www.stereolabs.com/en-at/store/products/zed-2i']),
  ['d = f·B / Z', 'ΔZ = Z²·Δd / (f·B),  Δd ≈ 0.25 px', 'f<sub>px</sub> = f<sub>mm</sub> / p = 2.1 mm / 2 µm = 1050 px', 'HFOV = 2·atan(W·p / 2f)', 'Z<sub>min</sub> = f·B / d<sub>max</sub>'])
addXR(lab, { mag: 4, yaw: 55, tips: ['MR tip: hold your hand 30 cm from the lenses, the ZED minimum range'] })
lab.start()
