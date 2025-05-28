import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { Text } from "troika-three-text";
import { HandDetector } from "./hand_detector.js";

// Either "umap" or "force"
let layoutMode = "force";

// Check if debug mode is enabled
const isDebugMode = new URLSearchParams(window.location.search).has("debug");

// Debug elements
let debugContainer, debugVideo, debugCanvas, debugCtx;

// Initialize debug UI if in debug mode
function initDebugUI() {
  if (!isDebugMode) return;

  // Create debug container
  debugContainer = document.createElement("div");
  debugContainer.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 20px;
    width: 320px;
    height: 240px;
    z-index: 1000;
    border: 2px solid #fff;
    border-radius: 8px;
    overflow: hidden;
    background: #000;
  `;

  // Create video element
  debugVideo = document.createElement("video");
  debugVideo.style.cssText = `
    width: 100%;
    height: 100%;
    object-fit: cover;
  `;
  debugVideo.autoplay = true;
  debugVideo.muted = true;

  // Create canvas overlay
  debugCanvas = document.createElement("canvas");
  debugCanvas.width = 320;
  debugCanvas.height = 240;
  debugCanvas.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  `;
  debugCtx = debugCanvas.getContext("2d");

  debugContainer.appendChild(debugVideo);
  debugContainer.appendChild(debugCanvas);
  document.body.appendChild(debugContainer);
}

// Update debug visualization
function updateDebugVisualization() {
  if (!isDebugMode || !debugCtx || !handDetectorReady) return;

  // Clear canvas
  debugCtx.clearRect(0, 0, debugCanvas.width, debugCanvas.height);

  const detections = getDetections();

  // Draw hand positions and gestures
  debugCtx.strokeStyle = "#00ff00";
  debugCtx.fillStyle = "#00ff00";
  debugCtx.lineWidth = 2;
  debugCtx.font = "12px Arial";

  // Left hand
  if (detections.leftHand.pinch.position) {
    const x = detections.leftHand.pinch.position.x * debugCanvas.width;
    const y = detections.leftHand.pinch.position.y * debugCanvas.height;

    debugCtx.beginPath();
    debugCtx.arc(x, y, detections.leftHand.pinch.isPinching ? 15 : 8, 0, 2 * Math.PI);
    debugCtx.stroke();

    if (detections.leftHand.pinch.isPinching) {
      debugCtx.fill();
    }

    debugCtx.fillText("L", x - 5, y - 20);
  }

  // Show left hand gesture even without pinch position
  if (detections.leftHand.gesture && detections.leftHand.gesture.position) {
    const x = detections.leftHand.gesture.position.x * debugCanvas.width;
    const y = detections.leftHand.gesture.position.y * debugCanvas.height;

    // If no pinch position was drawn, draw gesture position
    if (!detections.leftHand.pinch.position) {
      debugCtx.beginPath();
      debugCtx.arc(x, y, 8, 0, 2 * Math.PI);
      debugCtx.stroke();
      debugCtx.fillText("L", x - 5, y - 20);
    }

    debugCtx.fillText(
      `${detections.leftHand.gesture.name} (${detections.leftHand.gesture.confidence.toFixed(2)})`,
      x - 40,
      y + 30
    );
  }

  // Right hand
  if (detections.rightHand.pinch.position) {
    const x = detections.rightHand.pinch.position.x * debugCanvas.width;
    const y = detections.rightHand.pinch.position.y * debugCanvas.height;

    debugCtx.strokeStyle = "#ff0000";
    debugCtx.fillStyle = "#ff0000";

    debugCtx.beginPath();
    debugCtx.arc(x, y, detections.rightHand.pinch.isPinching ? 15 : 8, 0, 2 * Math.PI);
    debugCtx.stroke();

    if (detections.rightHand.pinch.isPinching) {
      debugCtx.fill();
    }

    debugCtx.fillText("R", x - 5, y - 20);
  }

  // Show right hand gesture even without pinch position
  if (detections.rightHand.gesture && detections.rightHand.gesture.position) {
    const x = detections.rightHand.gesture.position.x * debugCanvas.width;
    const y = detections.rightHand.gesture.position.y * debugCanvas.height;

    debugCtx.strokeStyle = "#ff0000";
    debugCtx.fillStyle = "#ff0000";

    // If no pinch position was drawn, draw gesture position
    if (!detections.rightHand.pinch.position) {
      debugCtx.beginPath();
      debugCtx.arc(x, y, 8, 0, 2 * Math.PI);
      debugCtx.stroke();
      debugCtx.fillText("R", x - 5, y - 20);
    }

    debugCtx.fillText(
      `${detections.rightHand.gesture.name} (${detections.rightHand.gesture.confidence.toFixed(2)})`,
      x - 40,
      y + 30
    );
  }
}

const layoutAlgorithms = {};

class UMAPLayoutAlgorithm {
  constructor(images) {
    this.umap = null;
    this.nEpochs = 0;
    this.done = false;

    this.umap = new UMAP({
      nNeighbors: 10,
      minDist: 0.01,
      nComponents: 2,
    });
    this.nEpochs = this.umap.initializeFit(images.map((img) => img.embed));
  }

  step() {
    if (this.umap.step() === this.nEpochs) {
      this.done = true;
    }
    return this.umap.getEmbedding();
  }

  layout(group) {
    const projections = this.umap.getEmbedding();

    const minX = Math.min(...projections.map((p) => p[0]));
    const maxX = Math.max(...projections.map((p) => p[0]));
    const minY = Math.min(...projections.map((p) => p[1]));
    const maxY = Math.max(...projections.map((p) => p[1]));

    const sceneSize = 20;

    for (let i = 0; i < projections.length; i++) {
      const image = group.children[i];
      const x = map(projections[i][0], minX, maxX, -sceneSize, sceneSize);
      const y = map(projections[i][1], minY, maxY, -sceneSize, sceneSize);

      const phi = (x / sceneSize) * Math.PI;
      const theta = (y / sceneSize) * Math.PI;
      image.position.x = sphereRadius * Math.sin(theta) * Math.cos(phi);
      image.position.y = sphereRadius * Math.sin(theta) * Math.sin(phi);
      image.position.z = sphereRadius * Math.cos(theta);
      image.lookAt(0, 0, 0);
    }
  }
}

class ForceLayoutAlgorithm {
  constructor(images) {
    this.simExtent = 20;
    // Group by name to get all clusters of pages
    this.groups = {};
    for (const image of images) {
      if (!this.groups[image.title]) {
        this.groups[image.title] = [];
      }
      this.groups[image.title].push(image);
    }
    this.groups = Object.values(this.groups);

    this.clusterCentres = this.groups.map(() => ({
      x: (Math.random() - 0.5) * 2 * this.simExtent,
      y: (Math.random() - 0.5) * 2 * this.simExtent,
    }));

    for (let gi = 0; gi < this.groups.length; gi++) {
      const { x: cx, y: cy } = this.clusterCentres[gi];
      for (const img of this.groups[gi]) {
        img.cluster = gi; // accessor key
        img.x = cx + (Math.random() - 0.01); // initial x/y for D3
        img.y = cy + (Math.random() - 0.01);
      }
    }

    // Initialize the simulation
    this.simulation = d3
      .forceSimulation(images)
      .force("x", d3.forceX((d) => this.clusterCentres[d.cluster].x).strength(0.5))
      .force("y", d3.forceY((d) => this.clusterCentres[d.cluster].y).strength(0.5))
      .force("charge", d3.forceManyBody().strength(-0.05)) // global repulsion
      .force("collision", d3.forceCollide().radius(0.3)) // prevent overlaps
      .alphaDecay(0.03) // optional: faster settle
      .stop();
  }
  step() {
    this.simulation.tick();
  }
  layout(group) {
    const nodes = this.simulation.nodes();
    for (let i = 0; i < nodes.length; i++) {
      const img = group.children[i];
      const nx = nodes[i].x; //   range  ~  [‑simExtent,+simExtent]
      const ny = nodes[i].y;

      const phi = (nx / this.simExtent) * Math.PI * 2; //   [‑π, +π]
      const theta = (ny / this.simExtent) * Math.PI * 2; //   [‑π, +π]  (use π/2 if you want poles at ±simExtent)

      img.position.set(
        sphereRadius * Math.sin(theta) * Math.cos(phi),
        sphereRadius * Math.sin(theta) * Math.sin(phi),
        sphereRadius * Math.cos(theta)
      );
      img.lookAt(0, 0, 0);
    }
  }
}

// Initialize Hand Detector
const handDetector = new HandDetector();
let handDetectorReady = false;

// Initialize hand detection
async function initHandDetector() {
  const success = await handDetector.initialize();
  if (success) {
    const webcamStarted = await handDetector.startWebcam();
    if (webcamStarted) {
      handDetectorReady = true;
      window.handDetectorReady = true;
      console.log("Hand detector ready for use");
      if (isDebugMode) {
        debugVideo.srcObject = handDetector.getVideoStream();
      }
    }
  }
}

// Function to get current hand detections (can be called from anywhere)
function getDetections() {
  if (!handDetectorReady) {
    return {
      leftHand: { gesture: null, pinch: { isPinching: false, position: null } },
      rightHand: { gesture: null, pinch: { isPinching: false, position: null } },
    };
  }
  return handDetector.getDetections();
}

// Expose globals for HTML interface
window.getDetections = getDetections;
window.handDetectorReady = false;
window.layoutMode = layoutMode;
window.setLayoutMode = function (mode) {
  if (layoutAlgorithms[mode]) {
    layoutMode = mode;
    window.layoutMode = mode;
    console.log(`Layout mode changed to: ${mode}`);
  }
};

const renderer = new THREE.WebGLRenderer();
// renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
const pmremGenerator = new THREE.PMREMGenerator(renderer);

const scene = new THREE.Scene();
// scene.environment = pmremGenerator.fromScene(
//   new RoomEnvironment(),
//   0.04
// ).texture;
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.15;
// Lights

const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
scene.add(ambientLight);

const light1 = new THREE.DirectionalLight(0xffffff, 1);
light1.position.set(100, 200, 0);
scene.add(light1);

//WEIRD BLUE LIGHT SCENE
// const light1 = new THREE.DirectionalLight(0x0000ff, 255);
// light1.position.set(1, 2, 0);
// scene.add(light1);

// const light2 = new THREE.DirectionalLight(0xffffff, 3);
// light2.position.set(100, 200, 100);
// scene.add(light2);

// const light3 = new THREE.DirectionalLight(0xffffff, 3);
// light3.position.set(-100, -200, -100);
// scene.add(light3);

// const lightHelper = new THREE.DirectionalLightHelper(light1, 5);
// scene.add(lightHelper);

//GRID SIZE - 'world grid'
//const gridHelper = new THREE.GridHelper(100, 100);
//scene.add(gridHelper);

const sphereRadius = 10;
//const sphereRadius = 1; - cluster

const sphereGeometry = new THREE.SphereGeometry(sphereRadius + 0.1, 32, 32);
//const sphereGeometry = new THREE.SphereGeometry(sphereRadius + 0.1, 5, 5); - more like web
const sphereMaterial = new THREE.MeshStandardMaterial({ color: 0x0000ff, wireframe: true });
const sphereMesh = new THREE.Mesh(sphereGeometry, sphereMaterial);
scene.add(sphereMesh);

const imagesGroup = new THREE.Group();
scene.add(imagesGroup);

//camera.position.z = 20; - more outside
camera.position.z = 10;

function map(v, inMin, inMax, outMin, outMax) {
  return ((v - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
}

function translateToCenter(group, startIndex, endIndex) {
  // Calculate centroid
  let centroid = new THREE.Vector3();
  for (let i = startIndex; i < endIndex; i++) {
    centroid.add(group.children[i].position);
  }
  centroid.divideScalar(endIndex - startIndex);
  // Translate to center
  for (let i = startIndex; i < endIndex; i++) {
    group.children[i].position.sub(centroid);
  }
}

// Pinch-to-zoom variables
let initialPinchDistance = null;
let initialCameraZ = null;

// Open palm orbiting variables
let lastPalmPosition = null;
let isOrbiting = false;

function animate() {
  requestAnimationFrame(animate);

  // Poll hand detections
  if (handDetectorReady) {
    const detections = getDetections();

    const leftPinching = detections.leftHand.pinch.isPinching;
    const rightPinching = detections.rightHand.pinch.isPinching;

    // Two-hand pinch-to-zoom (highest priority)
    if (leftPinching && rightPinching && detections.leftHand.pinch.position && detections.rightHand.pinch.position) {
      // Calculate distance between pinch points
      const leftPos = detections.leftHand.pinch.position;
      const rightPos = detections.rightHand.pinch.position;
      const currentDistance = Math.sqrt(Math.pow(rightPos.x - leftPos.x, 2) + Math.pow(rightPos.y - leftPos.y, 2));

      if (initialPinchDistance === null) {
        // Start pinch-to-zoom
        initialPinchDistance = currentDistance;
        initialCameraZ = camera.position.z;
      } else {
        // Update zoom based on distance change
        const distanceRatio = currentDistance / initialPinchDistance;
        const minZ = 3;
        const maxZ = 30;
        const newZ = Math.max(minZ, Math.min(maxZ, initialCameraZ / distanceRatio));
        camera.position.z = newZ;
      }
    } else {
      // Reset pinch-to-zoom when not both hands pinching
      initialPinchDistance = null;
      initialCameraZ = null;

      // Open palm orbiting (either hand with open palm gesture)
      let palmPosition = null;
      if (
        detections.leftHand.gesture &&
        detections.leftHand.gesture.name === "Open_Palm" &&
        detections.leftHand.gesture.position
      ) {
        palmPosition = detections.leftHand.gesture.position;
      } else if (
        detections.rightHand.gesture &&
        detections.rightHand.gesture.name === "Open_Palm" &&
        detections.rightHand.gesture.position
      ) {
        palmPosition = detections.rightHand.gesture.position;
      }

      if (palmPosition) {
        if (lastPalmPosition && isOrbiting) {
          // Calculate movement delta
          const deltaX = (palmPosition.x - lastPalmPosition.x) * Math.PI * 2;
          const deltaY = (palmPosition.y - lastPalmPosition.y) * Math.PI * 2;

          // Orbit around the sphere
          const sphericalCoords = new THREE.Spherical();
          sphericalCoords.setFromVector3(camera.position);

          sphericalCoords.theta -= deltaX; // Horizontal rotation
          sphericalCoords.phi = Math.max(0.1, Math.min(Math.PI - 0.1, sphericalCoords.phi + deltaY)); // Vertical rotation with limits

          camera.position.setFromSpherical(sphericalCoords);
          camera.lookAt(0, 0, 0);
        }

        lastPalmPosition = {
          x: palmPosition.x,
          y: palmPosition.y,
        };
        isOrbiting = true;
      } else {
        // Reset orbiting
        lastPalmPosition = null;
        isOrbiting = false;
      }
    }
  }

  const layoutAlgorithm = layoutAlgorithms[layoutMode];
  layoutAlgorithm.step();
  layoutAlgorithm.layout(imagesGroup);

  controls.update();

  renderer.render(scene, camera);

  // Update debug visualization
  updateDebugVisualization();
}

async function load() {
  const imageRes = await fetch("image_embeds.json");
  const imageEmbeds = await imageRes.json();

  layoutAlgorithms["umap"] = new UMAPLayoutAlgorithm(imageEmbeds);
  layoutAlgorithms["force"] = new ForceLayoutAlgorithm(imageEmbeds);

  const textureLoader = new THREE.TextureLoader();
  for (const image of imageEmbeds) {
    const planeGeo = new THREE.PlaneGeometry();
    const planeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      //color: 0x0000ff, - blue color
      side: THREE.DoubleSide,
    });
    // const planeMat = new THREE.MeshBasicMaterial({
    //   color: 0xffffff,
    //   side: THREE.DoubleSide,
    // });

    planeMat.map = textureLoader.load(`images_resized/${image.filename}`);
    const mesh = new THREE.Mesh(planeGeo, planeMat);
    const aspect = image.height / image.width;
    //mesh.scale.x = 0.1; -Star sky
    mesh.scale.x = 0.8;
    mesh.scale.y = mesh.scale.x * aspect;

    mesh.position.x = Math.random() * 10 - 5;
    mesh.position.y = Math.random() * 10 - 5;
    // mesh.position.z = Math.random() * 10 - 5;
    imagesGroup.add(mesh);
  }
  // for (const text of textEmbeds) {
  //   const textMesh = new Text();
  //   textMesh.text = text.concept;
  //   textMesh.fontSize = 0.2;
  //   textMesh.position.x = Math.random() * 10 - 5;
  //   textMesh.position.y = Math.random() * 10 - 5;
  //   textMesh.position.z = Math.random() * 10 - 5;
  //   textMesh.color = 0xffffff;
  //   textMesh.sync();
  //   // textMesh.visible = false;
  //   imagesGroup.add(textMesh);
  // }

  // Initialize hand detector
  initHandDetector();

  // Initialize debug UI
  initDebugUI();

  // Initialize debug UI
  initDebugUI();

  animate();
}

load();
