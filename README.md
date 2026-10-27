# Mirror Worlds

An interactive 3D book about digital twins, built for the Digital Twins lectures at the RITA Lab – Extended Reality & Digital Twins, IT:U (Interdisciplinary Transformation University Austria), Linz.

21 lessons in 8 topics: Foundations, Reality capture, Computer vision, Interoperability, Robotics, IoT, Smart farm kit (Keyestudio KS0567) and Validation. Each lesson follows predict → test → prove: students lock in a prediction, test it on an interactive 3D plate, then lift a flap for the answer, equations and code. Teacher's notes and APA 7 references are included.

Two display modes:
- **3D book**: an open book with pop-up ink diagrams and turning pages
- **Free 3D**: the diagram alone on a dark drafting plate with glowing data flows

## Run locally
It is a single static page. Open `index.html` in a browser, or serve the folder:

```bash
python -m http.server 8000
```

Three.js r128 is loaded from cdnjs; OrbitControls from jsDelivr.

## Deploy
The repository is connected to Vercel; every push to `main` deploys to production.

© Dr. Nelson Silva, RITA Lab, IT:U Linz
