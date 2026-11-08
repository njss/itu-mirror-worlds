// =====================================================================================
//  Device Lab No. 05 · Outside-in vs inside-out tracking
//  SteamVR Base Station 2.0 (lighthouse): one rotor carries two laser fans tilted +-30 deg;
//  it sweeps the room 100 times a second (sync-on-beam, no blinker), FOV 160 x 115 deg,
//  range about 7 m, up to 4 stations. Vive Tracker 3.0: 70.9 x 79.0 x 44.1 mm, 75 g,
//  photodiodes time the sweeps; the time since the sync tells the angle.
//  Inside-out: cameras on the headset see the room; precision depends on pixels per radian.
//  Solver: angle = 2 pi f t;  sigma_pos = d * 2 pi f sigma_t  (outside-in),
//          sigma_pos = d * sigma_px / f_px                       (inside-out camera).
// =====================================================================================
const { THREE, Lab, MAT, GEO, clamp, lerp, approach, fmt } = window.LabKit
const { addXR, refsHTML, polyline, chrome } = window.DevLab

const F_ROT = 50                 // rotor revolutions per second (two fans = 100 sweeps/s)
const SIGMA_T = 0.5e-6           // photodiode edge timing jitter (s), teaching value
const CAM_FPX = 400 / (2 * Math.tan(THREE.MathUtils.degToRad(50)))   // 400 px over ~100 deg tracking camera
const SIGMA_PX = 0.15            // feature localisation noise (px), teaching value
const BS_H = 0.45, TR_H = 0.22   // drawn heights of the station and the tracker (the room is compressed)

const lab = new Lab({
  prompt: 'how does a laser lighthouse find a tracker, and how is that different from cameras on a headset?',
  no: 5, title: 'Lighthouse', sub: 'outside-in vs inside-out',
  size: 0.7,
  view: { az: 12, el: 12, dist: 1.75, target: [-0.08, 0.26, 0], fov: 30 },
  cut: { a: [0, 0, 1], b: [0, 1, 0], center: [0, 0.3, 0], reach: 0.5 },
  pills: ['Laser sweep', 'Photodiodes', 'WebXR'],
})
chrome('Tracking')

const bsShell = MAT.plastic({ color: [0.04, 0.04, 0.045], roughness: 0.35, clearcoat: 0.5 })
const bsFront = MAT.plastic({ color: [0.02, 0.02, 0.025], roughness: 0.05, clearcoat: 1 })
const trShell = MAT.plastic({ color: [0.06, 0.06, 0.065], roughness: 0.4 })
const standM = MAT.anodised({ color: [0.12, 0.12, 0.13] })
const diodeM = MAT.paint({ color: [0.15, 0.15, 0.17], roughness: 0.2, clearcoat: 1 })
const pcbM = MAT.plastic({ color: [0.04, 0.2, 0.1], roughness: 0.4 })

// ---------------------------------------------------------------- base station on a light stand (left)
const BX = -0.32
for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3; lab.add(new THREE.Mesh(GEO.pipe([[BX, 0.12, 0], [BX + Math.cos(a) * 0.09, 0.004, Math.sin(a) * 0.09]], 0.004), standM), { name: `Stand leg ${i + 1}` }) }
lab.mesh(GEO.tube(0.006, 0, BS_H - 0.1), standM, { name: 'Light stand', pos: [BX, (BS_H - 0.1) / 2 + 0.06, 0] })
lab.mesh(GEO.disc(0.009, 0.02), standM, { name: '1/4" mount', pos: [BX, BS_H - 0.03, 0] })
const bs = new THREE.Group(); bs.position.set(BX, BS_H, 0); bs.rotation.y = Math.PI / 2   // faces +x
lab.add(bs, { name: 'Base Station 2.0', count: 0 })
// body 79 x 80 x 60 mm, curved black glass face
lab.add(new THREE.Mesh(GEO.rbox(0.079, 0.08, 0.06, 0.014), bsShell), { name: 'Station housing', parent: bs, explode: [0, 0.08, -0.04], xray: 'shell', label: 'Base Station 2.0' })
const face = GEO.lathe([[0, 0], [0.034, 0], [0.036, 0.004], [0.034, 0.008], [0, 0.009]], 64); face.rotateX(Math.PI / 2)
const faceM = lab.add(new THREE.Mesh(face, bsFront), { name: 'IR window', parent: bs, explode: [0, 0, 0.08] }); faceM.position.z = 0.029
// rotor: a vertical drum with two tilted line lenses; it spins at 50 Hz
const rotor = new THREE.Group(); rotor.position.z = 0.012; bs.add(rotor)
lab.add(new THREE.Mesh(GEO.tube(0.012, 0.0, 0.05), MAT.aluminiumMachined()), { name: 'Rotor drum', parent: rotor, explode: [0, 0, 0.05], label: 'Rotor · 50 rev/s' })
for (const s of [-1, 1]) { const ln = lab.add(new THREE.Mesh(GEO.rbox(0.004, 0.03, 0.003, 0.001), MAT.glass({ color: [0.9, 0.95, 1] })), { name: `Line lens ${s > 0 ? 'A' : 'B'}`, parent: rotor, explode: [0, 0, 0.06] }); ln.position.set(0, 0, 0.012); ln.rotation.z = s * THREE.MathUtils.degToRad(30); ln.rotation.y = s > 0 ? 0 : Math.PI }
lab.add(new THREE.Mesh(GEO.tube(0.009, 0.004, 0.012), MAT.copper()), { name: 'Spindle motor', parent: bs, explode: [0, -0.06, 0] }).position.set(0, -0.032, 0.012)
lab.add(new THREE.Mesh(GEO.rbox(0.004, 0.006, 0.004, 0.001), MAT.steelDark()), { name: 'Laser diode', parent: bs, explode: [0, -0.04, 0.02] }).position.set(0, -0.025, 0.012)
lab.add(new THREE.Mesh(GEO.rbox(0.06, 0.06, 0.0016, 0.0005), pcbM), { name: 'Station board', parent: bs, explode: [0, 0, -0.07] }).position.z = -0.022
// the laser fan: a thin translucent wedge that rotates with the rotor
const fanG = new THREE.BufferGeometry(); { const R = 0.55, n = 24, p = []; for (let i = 0; i < n; i++) { const a0 = -0.9 + 1.8 * i / n, a1 = -0.9 + 1.8 * (i + 1) / n; p.push(0, 0, 0, 0, R * Math.sin(a0), R * Math.cos(a0), 0, R * Math.sin(a1), R * Math.cos(a1)) } fanG.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)) }
const fanMat = new THREE.MeshBasicMaterial({ color: 0xD55E00, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false, toneMapped: false })
const fanMesh = new THREE.Mesh(fanG, fanMat); fanMesh.layers.set(1); rotor.add(fanMesh)

// ---------------------------------------------------------------- Vive Tracker 3.0 on a tripod (right)
const tr = new THREE.Group(); lab.add(tr, { name: 'Vive Tracker 3.0', count: 0 })
lab.add(new THREE.Mesh(GEO.tube(0.005, 0, TR_H - 0.03), standM), { name: 'Tracker tripod column', parent: tr }).position.y = (TR_H - 0.03) / 2 + 0.02
for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3 + 0.3; lab.add(new THREE.Mesh(GEO.pipe([[0, 0.07, 0], [Math.cos(a) * 0.07, 0.004, Math.sin(a) * 0.07]], 0.0035), standM), { name: `Tracker tripod leg ${i + 1}`, parent: tr }) }
const puck = new THREE.Group(); puck.position.y = TR_H + 0.022; tr.add(puck)
// the puck: a rounded hub with three prongs (79 mm across, 44 mm tall), photodiodes in the prongs
lab.add(new THREE.Mesh(GEO.disc(0.026, 0.03, 0.008, 64), trShell), { name: 'Tracker hub', parent: puck, explode: [0, 0.06, 0], xray: 'shell', label: 'Vive Tracker 3.0 · 75 g' })
const diodes = []
for (let i = 0; i < 3; i++) {
  const a = i * Math.PI * 2 / 3 + Math.PI / 6
  const prong = lab.add(new THREE.Mesh(GEO.rbox(0.03, 0.024, 0.024, 0.009), trShell), { name: `Prong ${i + 1}`, parent: puck, explode: [Math.cos(a) * 0.05, 0.03, Math.sin(a) * 0.05], xray: 'shell' })
  prong.position.set(Math.cos(a) * 0.03, 0.004, Math.sin(a) * 0.03); prong.rotation.y = -a
  for (let k = 0; k < 6; k++) {
    const b = a + (k - 2.5) * 0.28, r = 0.035 + (k % 2) * 0.006
    const d = new THREE.Mesh(GEO.rbox(0.004, 0.004, 0.001, 0.0005), diodeM); d.position.set(Math.cos(b) * r, 0.008 + (k % 3) * 0.005, Math.sin(b) * r); d.lookAt(Math.cos(b) * 2, 0.6, Math.sin(b) * 2)
    puck.add(d); diodes.push({ d, n: new THREE.Vector3(Math.cos(b), 0.35, Math.sin(b)).normalize() })
  }
}
lab.add(new THREE.Mesh(GEO.tube(0.006, 0.0032, 0.005), MAT.brass()), { name: '1/4" mount + pogo pins', parent: puck, explode: [0, -0.05, 0] }).position.y = -0.016
lab.add(new THREE.Mesh(GEO.rbox(0.03, 0.006, 0.03, 0.002), MAT.paint({ color: [0.2, 0.22, 0.26] })), { name: 'Battery 7.5 h', parent: puck, explode: [0, 0.1, 0] }).position.y = 0.0
lab.add(new THREE.Mesh(GEO.disc(0.02, 0.0012), pcbM), { name: 'Tracker board (FPGA + IMU)', parent: puck, explode: [0, 0.12, 0], label: 'Timing FPGA + IMU' }).position.y = 0.01
lab.add(new THREE.Mesh(GEO.disc(0.0035, 0.002), MAT.glow({ emissive: [0.1, 1, 0.3], emissiveIntensity: 3 })), { name: 'Status LED', parent: puck }).position.set(0, 0.016, 0)
const hitRays = [0, 1].map(() => { const l = polyline([[0, 0, 0], [1, 0, 0]], 0xD55E00, 0.95); lab.fx.add(l); return l })

// ---------------------------------------------------------------- solver
lab.hero({ label: 'Position jitter', unit: 'mm', max: 5, digits: 2 })
const dist = lab.slider({ id: 'd', label: 'Tracker distance from station', min: 0.5, max: 7, value: 3, unit: 'm', digits: 1, ends: ['0.5 m', '7 m'] })
const yawC = lab.slider({ id: 'yaw', label: 'Tracker rotation', min: 0, max: 360, value: 30, unit: '°', ends: ['0°', '360°'] })
let blocked = false, phase = 0, lost = 0
const wp = new THREE.Vector3(), q = new THREE.Quaternion(), wn = new THREE.Vector3()
lab.onTick((dt, l, rdt) => {
  const d = dist.value
  // drawn position: 0.5 m -> 0.2 drawn units, 7 m -> 0.6 (compressed room), always in front of the station
  const xs = BX + lerp(0.22, 0.62, Math.log(d / 0.5) / Math.log(14))
  lab.place(tr, xs, 0, 0)
  puck.rotation.y = THREE.MathUtils.degToRad(yawC.value)
  // the rotor: shown slowed down (real 50 rev/s is a blur); its fan alternates tilt each half turn
  phase += rdt * 1.2
  rotor.rotation.y = Math.sin(phase) * 0.9
  fanMesh.rotation.z = (Math.floor(phase / Math.PI) % 2 ? 1 : -1) * THREE.MathUtils.degToRad(30)
  // which photodiodes face the station
  lab.machine.updateMatrixWorld(true)
  const bsW = new THREE.Vector3(); faceM.getWorldPosition(bsW); const bsL = lab.machine.worldToLocal(bsW.clone())
  let n = 0, k = 0
  for (const D of diodes) {
    D.d.getWorldPosition(wp); const pl = lab.machine.worldToLocal(wp.clone())
    D.d.parent.getWorldQuaternion(q); wn.copy(D.n).applyQuaternion(q)
    const to = bsL.clone().sub(pl).normalize()
    const vis = wn.dot(to) > 0.2 && !blocked
    D.d.material = vis ? (D.d.userData.onM ??= MAT.glow({ emissive: [1, 0.35, 0], emissiveIntensity: 5 })) : diodeM
    if (vis) { n++; if (k < 2) { const p = hitRays[k].geometry.attributes.position; p.setXYZ(0, bsL.x, bsL.y, bsL.z); p.setXYZ(1, pl.x, pl.y, pl.z); p.needsUpdate = true; k++ } }
  }
  hitRays.forEach((r, i) => { r.visible = i < k && Math.abs(Math.sin(phase * 3)) > 0.3 })
  const sigTheta = 2 * Math.PI * F_ROT * SIGMA_T                       // rad per sweep
  const sigOut = d * sigTheta / Math.sqrt(Math.max(1, n / 2))            // more diodes hit, more averaging
  const sigIn = d * SIGMA_PX / CAM_FPX
  const ok = n >= 4
  lost = ok ? 0 : lost + rdt
  if (ok) lab.setHero(sigOut * 1000, { state: `${n} photodiodes hit`, sub: `angle = 2π·f·t: 1 µs of time is ${fmt(2 * Math.PI * F_ROT * 1e-6 * 1e6, 0)} µrad · inside-out camera at the same distance: ${fmt(sigIn * 1000, 2)} mm`, bad: false })
  else lab.setHero(0.5 * 0.03 * lost * lost * 1000, { state: 'occluded: IMU only', sub: `${fmt(lost, 1)} s without a sweep · drift grows as ½·b·t² until a laser reaches the tracker again`, bad: true })
})
lab.breakIt({ label: 'Walk in front', run: () => { blocked = true }, reset: () => { blocked = false } })
lab.how(`<b>Outside-in</b> (lighthouse): the base station has no camera. A rotor sweeps two laser fans, tilted ±30°, across the room 100 times a second. Each photodiode on the tracker notes the moment a fan passes. Because the rotor turns at a known rate, that moment is an <b>angle</b>, and two tilted fans give two angles per diode. With the diode layout known, the tracker solves its own pose; the IMU fills in between sweeps. Timing to a fraction of a microsecond gives sub-millimetre jitter, and it scales with distance. <b>Inside-out</b> (Quest 3, Varjo XR-4): cameras on the headset find features in the room and the controllers' LEDs, so there is nothing to mount on walls. Precision depends on pixels per radian, so it is usually a little noisier. Laser tracking gives up when a body blocks the line of sight; inside-out tracking loses the controllers when they leave the camera view. Timing jitter and pixel noise are teaching values. The real rotor spins much faster than shown.` +
  refsHTML(['HTC Corporation. (n.d.). <i>VIVE Tracker (3.0)</i>. https://shop-us.vive.com/collections/accessories/products/2104002', 'VR &amp; AR Wiki. (n.d.). SteamVR Base Station 2.0. https://vrarwiki.com/wiki/SteamVR_Base_Station_2.0', 'Niehorster, D. C., Li, L., &amp; Lappe, M. (2017). The accuracy and precision of position and orientation tracking in the HTC Vive virtual reality system for scientific research. <i>i-Perception, 8</i>(3). https://doi.org/10.1177/2041669517708205']),
  ['θ = 2π · f<sub>rotor</sub> · (t<sub>hit</sub> − t<sub>sync</sub>)', 'σ<sub>pos,out</sub> = d · 2π f σ<sub>t</sub> / √(N/2)', 'σ<sub>pos,in</sub> = d · σ<sub>px</sub> / f<sub>px</sub>', 'pose needs N ≥ 4 photodiodes (PnP)', 'e<sub>drift</sub> = ½ · b · t²'])
addXR(lab, { mag: 2, tips: ['VR tip: walk behind the station and watch the photodiodes go dark'] })
lab.start()
