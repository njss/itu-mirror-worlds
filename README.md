# Mirror Worlds

An interactive 3D book about digital twins, built for the Digital Twins lectures at the RITA Lab – Extended Reality & Digital Twins, IT:U (Interdisciplinary Transformation University Austria), Linz.

33 lessons in 11 topics: Foundations, Reality capture, Computer vision, Interoperability, Unity 6 physics, Robotics, IoT, Smart farm kit (Keyestudio KS0567), Smart-home kit (Keyestudio KS5009), Adaptive twin (ECG, LSL to MQTT, interaction logging, adaptation rules, user study) and Twin data & validation. Each lesson follows predict → test → prove: students lock in a prediction, test it on an interactive 3D plate, then lift a flap for the answer, equations and code. Teacher's notes and APA 7 references are included.

Two display modes:
- **3D book**: an open book with pop-up ink diagrams and turning pages
- **Free 3D**: the diagram alone on a dark drafting plate with glowing data flows

## Device Lab (`lab/`)
Nine XR, biosignal and reality-capture devices rebuilt at real size, each with a live solver, explode / cutaway / x-ray modes and a "break it" button:
ZED 2i, Meta Quest 3, Touch Plus controllers, Varjo XR-3 / XR-4, Vive Tracker 3.0 + Base Station 2.0 (outside-in vs inside-out), Magic Leap 2, biosignalsplux ECG, Matterport Pro3 and Insta360 X5.

Every device page has **Enter VR** and **Enter MR** (WebXR). Open it in the Meta Quest Browser over https: grip grabs the device, trigger presses the in-world panel (or toggles explode), the right stick turns and zooms, A = x-ray, B = cut away. Add `?xrsim=vr` or `?xrsim=ar` on a desktop to preview the XR layout.

Built with the MIT-licensed [Machine Skill](https://github.com/AirsupHQ/machine-skill) kit (three.js 0.170). Sources live in a separate build folder; each page is one self-contained HTML file.

## Run locally
It is a single static page. Open `index.html` in a browser, or serve the folder:

```bash
python -m http.server 8000
```

Three.js r128 is loaded from cdnjs; OrbitControls from jsDelivr.

## Deploy
The repository is connected to Vercel; every push to `main` deploys to production.

© Dr. Nelson Silva, RITA Lab, IT:U Linz
