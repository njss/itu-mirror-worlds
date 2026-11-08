// =====================================================================================
//  Device Lab No. 03 · Meta Quest Touch Plus controller (Quest 3)
//  Ringless design: IR LEDs sit under IR-transparent plastic on the face and handle.
//  The headset's IR cameras see the LED constellation; a perspective-n-point solve gives
//  the pose; the IMU fills the gaps between camera frames; when the LEDs are hidden the
//  runtime fuses hand tracking (UploadVR, 2023). One AA battery, TruTouch haptics.
//  Solver: LED visibility (Lambert cone + facing), PnP needs >= 4 LEDs,
//  IMU dead reckoning drift e = 1/2 b t^2 while optical tracking is lost.
// =====================================================================================
const { THREE, Lab, MAT, GEO, clamp, lerp, approach, fmt } = window.LabKit
const { addXR, refsHTML, polyline, chrome } = window.DevLab

const BIAS = 0.03            // residual accelerometer bias after calibration, m/s^2 (consumer MEMS, teaching value)
const LED_HALF = 60          // LED emission half angle, degrees
const CY = 0.12              // controller pivot height on its display stand

const lab = new Lab({
  prompt: 'a VR controller with no tracking ring: how does the headset know where it is?',
  no: 3, title: 'Touch Plus', sub: 'constellation tracking',
  size: 0.2,
  view: { az: 140, el: 16, dist: 2.2, target: [-0.02, 0.13, -0.06], fov: 30 },
  cut: { a: [1, 0, 0], b: [0, 0, 1], center: [0, CY, 0], reach: 0.3 },
  pills: ['IR LEDs', 'Sensor fusion', 'WebXR'],
})
chrome('Touch Plus')

const shellM = MAT.plastic({ color: [0.88, 0.88, 0.87], roughness: 0.4 })
const faceM = MAT.plastic({ color: [0.06, 0.06, 0.065], roughness: 0.25, clearcoat: 0.6 })
const btnM = MAT.plastic({ color: [0.12, 0.12, 0.13], roughness: 0.3 })
const stickM = MAT.rubber({ color: [0.05, 0.05, 0.055] })
const pcbM = MAT.plastic({ color: [0.04, 0.2, 0.1], roughness: 0.4 })
const chipM = MAT.plastic({ color: [0.02, 0.02, 0.022], roughness: 0.3 })
const battM = MAT.paint({ color: [0.85, 0.55, 0.1], roughness: 0.3 })
const woodM = MAT.paint({ color: [0.55, 0.38, 0.22], roughness: 0.6, clearcoat: 0.2 })

// display stand: a wooden puck with a cradle post
// the post meets the bottom of the handle (handle tilted 0.6 rad, 65 mm below the pivot)
lab.mesh(GEO.disc(0.05, 0.012, 0.002), woodM, { name: 'Stand base', pos: [0, 0.006, 0.037] })
lab.mesh(GEO.tube(0.005, 0, 0.062), MAT.steel(), { name: 'Stand post', pos: [0, 0.043, 0.037] })

// the controller lives in its own group so the solver can turn it (yaw = wrist rotation)
const ctl = new THREE.Group(); ctl.position.set(0, CY, 0)
lab.add(ctl, { name: 'Controller', count: 0 })
// handle: a lathe capsule tilted forward 35 degrees, about 105 mm long, 36 mm across
const handle = new THREE.Group(); handle.rotation.x = -0.6; ctl.add(handle)
const hg = GEO.lathe([[0, -0.065], [0.012, -0.064], [0.0175, -0.055], [0.0185, -0.02], [0.0175, 0.02], [0.0155, 0.035], [0, 0.036]], 64)
lab.add(new THREE.Mesh(hg, shellM), { name: 'Handle shell', parent: handle, explode: [0, -0.05, -0.03], xray: 'shell' })
// face: the top disc with thumbstick and buttons, 64 mm across
const face = new THREE.Group(); face.position.set(0, 0.03, 0.012); face.rotation.x = 0.35; ctl.add(face)
lab.add(new THREE.Mesh(GEO.disc(0.033, 0.016, 0.004, 64), shellM), { name: 'Face housing', parent: face, explode: [0, 0.05, 0], xray: 'shell' })
lab.add(new THREE.Mesh(GEO.disc(0.029, 0.0012, 0.0004, 64), faceM), { name: 'Face plate', parent: face, explode: [0, 0.07, 0] }).position.y = 0.0084
const stick = new THREE.Group(); stick.position.set(-0.008, 0.009, 0.004); face.add(stick)
lab.add(new THREE.Mesh(GEO.tube(0.0025, 0, 0.008), MAT.steel()), { name: 'Thumbstick shaft', parent: stick, explode: [0, 0.09, 0] }).position.y = 0.004
lab.add(new THREE.Mesh(GEO.disc(0.0085, 0.004, 0.0015, 48), stickM), { name: 'Thumbstick cap', parent: stick, explode: [0, 0.1, 0] }).position.y = 0.009
for (const [n, x, z] of [['A button', 0.012, 0.006], ['B button', 0.016, -0.006], ['Meta button', 0.004, -0.016]]) {
  lab.add(new THREE.Mesh(GEO.disc(n === 'Meta button' ? 0.0035 : 0.0052, 0.003, 0.001, 32), btnM), { name: n, parent: face, explode: [0, 0.085, 0] }).position.set(x, 0.0095, z)
}
// trigger (index finger) and grip button (middle finger)
const trigShape = new THREE.Shape(); trigShape.moveTo(0, 0); trigShape.quadraticCurveTo(0.012, -0.004, 0.014, -0.022); trigShape.lineTo(0.009, -0.024); trigShape.quadraticCurveTo(0.007, -0.008, -0.002, -0.004); trigShape.closePath()
const trig = lab.add(new THREE.Mesh(GEO.extrude(trigShape, 0.014), btnM), { name: 'Index trigger', parent: ctl, explode: [0, 0, 0.05], label: 'Trigger (capacitive)' })
trig.rotation.y = -Math.PI / 2; trig.position.set(0, 0.022, 0.03)
const grip = lab.add(new THREE.Mesh(GEO.rbox(0.008, 0.03, 0.016, 0.004), btnM), { name: 'Grip button', parent: handle, explode: [0.04, 0, 0] })
grip.position.set(0.016, -0.012, 0.004)
// internals: AA battery, PCB, IMU, haptic voice coil
lab.add(new THREE.Mesh(GEO.tube(0.00725, 0, 0.0505), battM), { name: 'AA battery', parent: handle, explode: [0, -0.1, 0], label: 'AA battery' }).position.y = -0.03
lab.add(new THREE.Mesh(GEO.rbox(0.05, 0.0012, 0.04, 0.0004), pcbM), { name: 'Logic board', parent: face, explode: [0, 0.03, 0] }).position.y = -0.002
lab.add(new THREE.Mesh(GEO.rbox(0.004, 0.001, 0.004, 0.0002), chipM), { name: 'IMU (gyro + accel)', parent: face, explode: [0, 0.035, 0], label: 'IMU 1 kHz' }).position.set(0.006, -0.0008, 0)
lab.add(new THREE.Mesh(GEO.rbox(0.008, 0.0012, 0.008, 0.0003), chipM), { name: 'Radio + MCU', parent: face, explode: [0, 0.035, 0] }).position.set(-0.01, -0.0008, 0.006)
lab.add(new THREE.Mesh(GEO.tube(0.0055, 0, 0.012), MAT.steelDark()), { name: 'TruTouch haptic actuator', parent: handle, explode: [-0.04, 0, 0], label: 'Haptic voice coil' }).position.set(0, 0.01, 0.006)

// ---------------------------------------------------------------- IR LEDs: the constellation
// positions on the face rim and handle front (in their parent frames) with outward normals
const leds = []
const ledG = new THREE.SphereGeometry(0.0016, 12, 8)
const addLed = (parent, p, n) => {
  const m = new THREE.Mesh(ledG, MAT.glow({ emissive: [1, 0.15, 0.1], emissiveIntensity: 0 })); m.position.set(...p); m.userData.noAO = true; m.castShadow = false
  parent.add(m); leds.push({ m, n: new THREE.Vector3(...n).normalize(), vis: false })
}
for (let i = 0; i < 10; i++) { const a = i * Math.PI * 2 / 10 + 0.2; addLed(face, [Math.cos(a) * 0.0335, 0.002, Math.sin(a) * 0.0335], [Math.cos(a), 0.35, Math.sin(a)]) }
for (let i = 0; i < 5; i++) { const y = -0.05 + i * 0.016; addLed(handle, [0, y, -0.018], [0, 0.1, -1]) }
for (let i = 0; i < 3; i++) { const y = -0.04 + i * 0.02; addLed(handle, [-0.0175, y, 0.004], [-1, 0, 0.2]) }
lab.label(face, 'IR LEDs (hidden under the plastic)', { at: [0.034, 0.002, 0] })

// the headset's lower tracking camera, drawn 30 cm away up and back (the real one is on your face)
const camPos = new THREE.Vector3(-0.06, CY + 0.1, -0.2)
const camMark = lab.mesh(GEO.rbox(0.03, 0.02, 0.02, 0.004), MAT.plastic({ color: [0.85, 0.85, 0.84] }), { name: 'Headset tracking camera (marker)', pos: camPos.toArray(), label: 'Headset IR camera' })
// a thin pole so the marker is not floating
lab.mesh(GEO.tube(0.002, 0, camPos.y), MAT.steel(), { name: 'Camera marker pole', pos: [camPos.x, camPos.y / 2, camPos.z] })
const rays = leds.map(() => { const l = polyline([[0, 0, 0], camPos.toArray()], 0xD55E00, 0.6); lab.fx.add(l); return l })

// ---------------------------------------------------------------- solver
lab.hero({ label: 'LEDs seen by the camera', unit: 'of ' + leds.length, max: leds.length })
const yaw = lab.slider({ id: 'yaw', label: 'Wrist rotation', min: -180, max: 180, value: 20, unit: '°', ends: ['palm away', 'palm toward'] })
const fpsC = lab.slider({ id: 'fps', label: 'Camera frame rate', min: 30, max: 90, step: 1, value: 60, unit: 'Hz', ends: ['30', '90'] })
let hidden = false, lost = 0, yawNow = 20
const wp = new THREE.Vector3(), wn = new THREE.Vector3(), toCam = new THREE.Vector3(), q = new THREE.Quaternion()
lab.onTick((dt, l, rdt) => {
  yawNow = approach(yawNow, hidden ? 180 : yaw.value, 0.3, rdt)
  ctl.rotation.y = THREE.MathUtils.degToRad(yawNow)
  lab.machine.updateMatrixWorld(true)
  let n = 0
  const cam = camMark.position.clone()
  for (const [i, L] of leds.entries()) {
    L.m.getWorldPosition(wp); L.m.parent.getWorldQuaternion(q)
    wn.copy(L.n).applyQuaternion(q)
    // LED in world space -> machine space (the root is scaled), direction to the camera marker
    const pm = lab.machine.worldToLocal(wp.clone())
    toCam.copy(cam).sub(pm).normalize()
    const cosA = wn.dot(toCam)
    // visible if the camera is inside the LED's emission cone and the LED faces it (self occlusion by the body)
    L.vis = cosA > Math.cos(THREE.MathUtils.degToRad(LED_HALF)) && !hidden
    L.m.material.emissiveIntensity = L.vis ? 7 : 0.4
    const p = rays[i].geometry.attributes.position; p.setXYZ(0, pm.x, pm.y, pm.z); p.setXYZ(1, cam.x, cam.y, cam.z); p.needsUpdate = true
    rays[i].visible = L.vis
    if (L.vis) n++
  }
  const tracked = n >= 4                             // PnP: four or more non-collinear points give a unique pose
  lost = tracked ? 0 : lost + rdt
  const drift = 0.5 * BIAS * lost * lost             // metres
  const lat = 1000 / fpsC.value
  lab.setHero(n, {
    state: tracked ? 'optical lock' : 'IMU only',
    sub: tracked ? `pose from PnP every ${fmt(lat, 1)} ms · IMU predicts between frames (1 kHz)` : `${fmt(lost, 1)} s without LEDs · IMU drift ${fmt(drift * 100, 1)} cm · runtime blends in hand tracking`,
    bad: !tracked,
  })
})
lab.breakIt({ label: 'Hide behind back', run: () => { hidden = true }, reset: () => { hidden = false } })
lab.how(`Quest 3's controllers have no tracking ring. Infrared LEDs sit under plastic that is opaque to you and clear to infrared. They flash in sync with the exposure of the headset's IR tracking cameras, so they show up as bright dots. Knowing where each LED sits on the controller (the <b>constellation</b>), the headset solves a <b>perspective-n-point</b> problem: four or more dots give the full pose. Between camera frames, the 1 kHz IMU predicts motion. If the LEDs face away or the controller goes behind your back, only the IMU is left. Its bias integrates twice, so the position error grows with <b>t²</b>. Quest 3 then fuses hand tracking to hold the pose. The orange lines are LEDs the camera can see; turn the wrist to watch them drop out. The bias value is a teaching estimate.` +
  refsHTML(['Lang, B. (2023, October 5). Meta explains how Quest 3 controllers are tracked without rings. <i>UploadVR</i>. https://www.uploadvr.com/meta-explains-quest-3-controller-tracking/', 'Lepetit, V., Moreno-Noguer, F., &amp; Fua, P. (2009). EPnP: An accurate O(n) solution to the PnP problem. <i>International Journal of Computer Vision, 81</i>(2), 155–166. https://doi.org/10.1007/s11263-008-0152-6']),
  ['LED visible ⇔ n̂·ĉ > cos 60°', 'pose solvable ⇔ N<sub>visible</sub> ≥ 4 (PnP)', 'e<sub>drift</sub> = ½ · b · t²,  b ≈ 0.03 m/s²', 'Δt<sub>camera</sub> = 1 / f<sub>camera</sub>'])
addXR(lab, { mag: 2.5, tips: ['MR tip: turn your real controller the same way and watch hand tracking take over'] })
lab.start()
