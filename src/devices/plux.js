// =====================================================================================
//  Device Lab · PLUX biosignalsplux hub with the ECG sensor
//  Hub (PLUX datasheet): 4 analog channels, up to 3 kHz with 4 channels (4 kHz with 1-3 in
//  OpenSignals), 8 or 16 bit, Bluetooth class II (~10 m), 700 mAh LiPo (~10 h streaming),
//  85 x 54 x 10 mm, 45 g.  ECG sensor: gain 1000, range +-1.5 mV (VCC 3 V), 0.5-100 Hz,
//  CMRR 100 dB, bipolar with a reference electrode (V6-like placement).
//  Solver: ECG(mV) = (ADC/2^n - 1/2) VCC / G * 1000; timing step 1/fs; LSB = VCC/(G 2^n);
//  data rate = channels * fs * n / 8.
// =====================================================================================
const { THREE, Lab, MAT, GEO, clamp, lerp, approach, fmt } = window.LabKit
const { addXR, refsHTML, polyline, chrome } = window.DevLab

const VCC = 3, G = 1000
const PY = 0.62                                    // pedestal top height

const lab = new Lab({
  prompt: 'a wireless ECG hub on the chest: what does it really measure, and how fast must it sample?',
  no: 9, title: 'biosignalsplux', sub: 'ECG hub',
  size: 0.9,
  view: { az: 30, el: 12, dist: 1.9, target: [0.0, 0.66, 0.02], fov: 30 },
  cut: { a: [1, 0, 0], b: [0, 0, 1], center: [0, PY, 0], reach: 0.5 },
  pills: ['ECG', 'Sampling', 'WebXR'],
})
chrome('plux')

const torsoM = MAT.satin({ color: [0.36, 0.37, 0.4], roughness: 0.75 })
const standM = MAT.paint({ color: [0.1, 0.1, 0.11], roughness: 0.4 })
const hubM = MAT.plastic({ color: [0.92, 0.92, 0.9], roughness: 0.35 })
const capM = MAT.plastic({ color: [0.12, 0.45, 0.62], roughness: 0.3 })
const pcbM = MAT.plastic({ color: [0.04, 0.2, 0.1], roughness: 0.4 })
const chipM = MAT.plastic({ color: [0.02, 0.02, 0.022], roughness: 0.3 })
const cableM = MAT.rubber({ color: [0.06, 0.06, 0.065] })
const foamM = MAT.paint({ color: [0.95, 0.95, 0.94], roughness: 0.8, clearcoat: 0 })
const gelM = MAT.paint({ color: [0.55, 0.62, 0.7], roughness: 0.2, clearcoat: 1 })
const snapM = MAT.stainless({ roughness: 0.2 })

// ---------------------------------------------------------------- pedestal and torso mannequin
lab.mesh(GEO.disc(0.16, 0.02, 0.004), standM, { name: 'Pedestal base', pos: [0, 0.01, 0] })
lab.mesh(GEO.tube(0.03, 0, PY - 0.02), standM, { name: 'Pedestal column', pos: [0, (PY - 0.02) / 2 + 0.02, 0] })
const torsoG = new THREE.SphereGeometry(1, 48, 32); torsoG.scale(0.17, 0.24, 0.11)
lab.mesh(torsoG, torsoM, { name: 'Torso mannequin', pos: [0, PY + 0.2, 0], xray: 'shell' })
lab.mesh(GEO.tube(0.05, 0, 0.06), torsoM, { name: 'Neck', pos: [0, PY + 0.46, -0.005] })
// electrode positions on the chest surface (+z is the front): two measuring, one reference
const onChest = (x, y) => { const ny = (y - (PY + 0.2)) / 0.24, nx = x / 0.17; const z = 0.11 * Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)); return [x, y, z] }
const EL = [['IN+ electrode', onChest(0.06, PY + 0.2)], ['IN- electrode', onChest(-0.05, PY + 0.29)], ['Reference electrode', onChest(0.0, PY + 0.08)]]
const discZ = (r, h) => { const g = GEO.disc(r, h, h * 0.3, 32); g.rotateX(Math.PI / 2); return g }
for (const [n, p] of EL) {
  // 24 mm foam pad, gel centre, stainless snap: pushed slightly out along the chest normal
  const nrm = new THREE.Vector3(p[0] / 0.17 ** 2, (p[1] - (PY + 0.2)) / 0.24 ** 2, p[2] / 0.11 ** 2).normalize()
  const at = (d) => [p[0] + nrm.x * d, p[1] + nrm.y * d, p[2] + nrm.z * d]
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), nrm), e = new THREE.Euler().setFromQuaternion(q)
  lab.mesh(discZ(0.012, 0.0015), foamM, { name: n + ' pad', pos: at(0.001), rot: [e.x, e.y, e.z], explode: [nrm.x * 0.05, nrm.y * 0.05, nrm.z * 0.05], label: n === 'Reference electrode' ? 'Ag/AgCl gel electrodes' : undefined })
  lab.mesh(discZ(0.006, 0.0012), gelM, { name: n + ' gel', pos: at(0.0022), rot: [e.x, e.y, e.z], explode: [nrm.x * 0.06, nrm.y * 0.06, nrm.z * 0.06], count: 1 })
  lab.mesh(discZ(0.003, 0.004), snapM, { name: n + ' snap', pos: at(0.004), rot: [e.x, e.y, e.z], explode: [nrm.x * 0.07, nrm.y * 0.07, nrm.z * 0.07], count: 1 })
}
// ECG sensor board (1.8 x 1.0 cm) hanging between the electrodes, its leads, and the 105 cm cable to the hub
const SB = [0.0, PY + 0.17, 0.125]
lab.mesh(GEO.rbox(0.018, 0.01, 0.004, 0.0015), capM, { name: 'ECG sensor (G = 1000)', pos: SB, explode: [0, 0, 0.08], label: 'ECG sensor · gain 1000' })
for (const [, p] of EL) lab.add(new THREE.Mesh(GEO.pipe([SB, [(SB[0] + p[0]) / 2, (SB[1] + p[1]) / 2, Math.max(SB[2], p[2]) + 0.012], [p[0], p[1], p[2] + 0.006]], 0.0012), cableM), { name: 'Electrode lead', count: 1 })
// hub on a little shelf at the side of the pedestal
const HUB = [0.2, PY - 0.08, 0.03]
lab.mesh(GEO.rbox(0.12, 0.012, 0.09, 0.003), standM, { name: 'Shelf', pos: [HUB[0], HUB[1] - 0.012, HUB[2]] })
lab.mesh(GEO.rbox(0.01, 0.07, 0.01, 0.002), standM, { name: 'Shelf arm', pos: [0.1, HUB[1] - 0.012, HUB[2]], rot: [0, 0, Math.PI / 2] })
lab.mesh(GEO.rbox(0.085, 0.01, 0.054, 0.004), hubM, { name: 'Hub housing (85 × 54 × 10 mm)', pos: HUB, explode: [0.05, 0.08, 0], xray: 'shell', label: 'biosignalsplux hub · 45 g' })
lab.mesh(GEO.rbox(0.078, 0.0016, 0.048, 0.001), pcbM, { name: 'Hub board', pos: [HUB[0], HUB[1] - 0.002, HUB[2]], explode: [0.05, 0.04, 0] })
lab.mesh(GEO.rbox(0.008, 0.0012, 0.008, 0.0004), chipM, { name: '16-bit ADC', pos: [HUB[0] - 0.015, HUB[1] - 0.0005, HUB[2]], explode: [0.05, 0.05, 0], label: 'ADC 8/16 bit' })
lab.mesh(GEO.rbox(0.01, 0.0012, 0.01, 0.0004), chipM, { name: 'Bluetooth radio', pos: [HUB[0] + 0.015, HUB[1] - 0.0005, HUB[2]], explode: [0.05, 0.05, 0] })
lab.mesh(GEO.rbox(0.05, 0.004, 0.034, 0.002), MAT.paint({ color: [0.2, 0.22, 0.26] }), { name: 'LiPo 700 mAh', pos: [HUB[0], HUB[1] - 0.0035, HUB[2]], explode: [0.05, -0.05, 0], label: 'LiPo 700 mAh · ~10 h' })
for (let i = 0; i < 4; i++) lab.mesh(GEO.rbox(0.008, 0.006, 0.006, 0.001), MAT.paint({ color: [0.2, 0.2, 0.22] }), { name: `Analog port ${i + 1}`, pos: [HUB[0] - 0.03 + i * 0.02, HUB[1], HUB[2] + 0.028], explode: [0.05, 0.08, 0.03], count: 1 })
lab.add(new THREE.Mesh(GEO.pipe([SB, [0.06, PY + 0.06, 0.14], [0.14, PY - 0.05, 0.12], [HUB[0] - 0.03, HUB[1], HUB[2] + 0.03]], 0.0015), cableM), { name: 'Sensor cable (105 cm)' })
// a monitor on a stand showing the live ECG (canvas texture), with the Bluetooth link drawn as a line
const MON = [-0.3, 0.55, -0.05]
lab.mesh(GEO.tube(0.01, 0, MON[1] - 0.09), standM, { name: 'Monitor stand', pos: [MON[0], (MON[1] - 0.09) / 2, MON[2]] })
lab.mesh(GEO.disc(0.07, 0.01), standM, { name: 'Monitor foot', pos: [MON[0], 0.005, MON[2]] })
lab.mesh(GEO.rbox(0.3, 0.19, 0.015, 0.006), MAT.plastic({ color: [0.08, 0.08, 0.09] }), { name: 'Monitor (OpenSignals)', pos: MON, rot: [0, 0.5, 0] })
const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 640; const g2 = cv.getContext('2d')
const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace
const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.175), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }))
screen.position.set(MON[0] + Math.sin(0.5) * 0.0085, MON[1], MON[2] + Math.cos(0.5) * 0.0085); screen.rotation.y = 0.5; lab.machine.add(screen)
const bt = polyline([[HUB[0], HUB[1] + 0.01, HUB[2]], [MON[0], MON[1] + 0.1, MON[2]]], 0x0072B2, 0.6); lab.fx.add(bt)

// synthetic ECG (Gaussian P-QRS-T waves), in mV
const W = [[-0.2, 0.025, 0.15], [-0.03, 0.01, -0.1], [0, 0.011, 1.2], [0.03, 0.01, -0.25], [0.26, 0.05, 0.32]]
const ecg = (t, rr) => { const k = Math.floor(t / rr); let v = 0; for (let j = k - 1; j <= k + 1; j++) for (const [o, w, a] of W) { const d = t - (j * rr + 0.4) - o; v += a * Math.exp(-d * d / (2 * w * w)) } return v }

// ---------------------------------------------------------------- solver
lab.hero({ label: 'R-peak timing step', unit: 'ms', max: 20, digits: 1 })
const FS = [50, 100, 250, 500, 1000, 2000, 3000, 4000]
const fsC = lab.slider({ id: 'fs', label: 'Sampling rate', min: 0, max: 7, step: 1, value: 4, fmt: (v) => FS[Math.round(v)] + ' Hz', ends: ['50 Hz', '4 kHz'] })
const chC = lab.slider({ id: 'ch', label: 'Channels in use', min: 1, max: 4, step: 1, value: 1, fmt: (v) => Math.round(v) + (Math.round(v) > 1 ? ' channels' : ' channel'), ends: ['1', '4'] })
let off = false, tDraw = 0, t = 0
lab.onTick((dt, l, rdt) => {
  t += rdt
  const ch = Math.round(chC.value), want = FS[Math.round(fsC.value)], fmax = ch === 4 ? 3000 : 4000
  const fs = Math.min(want, fmax), n = 16
  const step = 1000 / fs, lsb = VCC / (G * 2 ** n) * 1e6                 // µV at the skin
  const rate = ch * fs * n / 8 / 1000                                    // kB/s
  // redraw the monitor ten times a second: 3 s of ECG, samples as dots
  tDraw += rdt
  if (tDraw > 0.1) {
    tDraw = 0
    g2.fillStyle = '#0d1117'; g2.fillRect(0, 0, 1024, 640)
    g2.strokeStyle = '#1f2a37'; g2.lineWidth = 1; for (let x = 0; x < 1024; x += 64) { g2.beginPath(); g2.moveTo(x, 0); g2.lineTo(x, 640); g2.stroke() } for (let y = 0; y < 640; y += 64) { g2.beginPath(); g2.moveTo(0, y); g2.lineTo(1024, y); g2.stroke() }
    g2.fillStyle = '#e6eaf0'; g2.font = '600 34px Inter, sans-serif'; g2.fillText(`ECG · ${fs} Hz · 16 bit`, 28, 52)
    const T0 = t * 0.5, span = 3, N = Math.max(2, Math.floor(span * fs)), shown = Math.min(N, 1200)
    g2.strokeStyle = off ? '#D55E00' : '#56B4E9'; g2.lineWidth = 3; g2.beginPath()
    for (let i = 0; i < shown; i++) {
      const ts = T0 + (i / shown) * span, tq = Math.floor(ts * fs) / fs                    // sample-and-hold at fs
      const v = off ? (Math.sin(ts * 9) > 0 ? 1.5 : -1.5) : ecg(tq, 60 / 72) + 0.02 * Math.sin(ts * 50)
      const x = 20 + (i / shown) * 984, y = 380 - clamp(v, -1.5, 1.5) * 190
      if (i === 0) g2.moveTo(x, y); else g2.lineTo(x, y)
    }
    g2.stroke()
    if (fs <= 250 && !off) { g2.fillStyle = '#E69F00'; for (let j = 0; j < span * fs; j++) { const ts = Math.floor(T0 * fs + j) / fs; const x = 20 + ((ts - T0) / span) * 984, y = 380 - ecg(ts, 60 / 72) * 190; g2.beginPath(); g2.arc(x, y, 4, 0, Math.PI * 2); g2.fill() } }
    g2.fillStyle = '#9aa4b0'; g2.font = '500 26px Inter, sans-serif'; g2.fillText(off ? 'electrode off: amplifier saturates at ±1.5 mV' : 'HR 72 bpm', 28, 610)
    tex.needsUpdate = true
  }
  bt.material.opacity = 0.35 + 0.35 * Math.abs(Math.sin(t * 6))
  if (off) lab.setHero(0, { state: 'no ECG', sub: 'a lifted electrode leaves the input floating: the amplifier saturates at its ±1.5 mV range and no R-peaks can be found', bad: true })
  else lab.setHero(step, { state: step <= 4 ? 'good for HRV' : step <= 10 ? 'heart rate only' : 'too coarse', sub: `one ADC step = ${fmt(lsb * 1000, 0)} nV at the skin · ${fmt(rate, 1)} kB/s over Bluetooth${want > fmax ? ` · capped at ${fmax} Hz with ${ch} channels` : ''}`, bad: step > 10 })
})
lab.breakIt({ label: 'Electrode off', run: () => { off = true }, reset: () => { off = false } })
lab.how(`Three gel electrodes pick up the heart's electrical activity: two measure the difference (bipolar), the third is a reference that keeps the amplifier near the body's potential. The ECG sensor amplifies that roughly ±1.5 mV signal by <b>1000</b> and keeps 0.5–100 Hz. The hub's ADC turns it into numbers, 8 or 16 bits at up to 4,000 samples per second, and sends them over Bluetooth to OpenSignals, which can publish a Lab Streaming Layer stream. Amplitude resolution is never the limit at 16 bits; <b>timing</b> is, because each R-peak can only be placed on a sample, so HRV needs at least about 250 Hz. A lifted electrode leaves the input floating and the amplifier saturates; check contact before every session. Electrode positions on the mannequin are illustrative, not a clinical placement guide.` +
  refsHTML(['PLUX Wireless Biosignals. (2020). <i>Electrocardiography (ECG) sensor datasheet</i>. https://www.pluxbiosignals.com/products/electrocardiography-ecg-sensor-1', 'PLUX Wireless Biosignals. (n.d.). <i>biosignalsplux 4-channel hub datasheet</i>. https://www.pluxbiosignals.com/', 'Task Force of the European Society of Cardiology and the North American Society of Pacing and Electrophysiology. (1996). Heart rate variability: Standards of measurement, physiological interpretation and clinical use. <i>Circulation, 93</i>(5), 1043–1065. https://doi.org/10.1161/01.CIR.93.5.1043']),
  ['ECG(mV) = (ADC / 2ⁿ − ½) · VCC / G · 1000', 'LSB = VCC / (G · 2ⁿ) = 3 V / (1000 · 65,536) ≈ 46 nV', 'Δt = 1 / f<sub>s</sub>   (250 Hz → 4 ms)', 'data rate = channels · f<sub>s</sub> · n / 8', 'f<sub>s,max</sub> = 4 kHz (1–3 ch), 3 kHz (4 ch)'])
addXR(lab, { mag: 1.4, tips: ['MR tip: compare with the real hub and electrodes on the lab table'] })
lab.start()
