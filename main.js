// Import necessary libraries for 3D graphics and hand detection
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { Text } from "troika-three-text";
import { HandDetector } from "./hand_detector.js";

// Set the layout mode - determines how images are arranged
// Can be either "umap" or "force" - different algorithms for positioning
let layoutMode = "force";

// Check if we're in debug mode by looking at the URL parameters
// Debug mode shows additional visual information for development
const isDebugMode = true; // new URLSearchParams(window.location.search).has("debug");

// Variables for layout transition
let isTransitioningLayout = false;
let transitionStartTime;
const transitionDuration = 750; // milliseconds for smooth transition
let capturedOldPositions = [];

// Variables to hold debug UI elements
let debugContainer, debugVideo, debugCanvas, debugCtx;

// Function to create debug interface if debug mode is enabled
function initDebugUI() {
  if (!isDebugMode) return; // Exit early if not in debug mode

  // Create a container div element to hold debug information
  debugContainer = document.createElement("div");
  // Set CSS styles to position the debug container in bottom-left corner
  debugContainer.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 320px;
    height: 240px;
    z-index: 1000;
    border: 2px solid #fff;
    border-radius: 8px;
    overflow: hidden;
    background: #000;
  `;

  // Create video element to show webcam feed
  debugVideo = document.createElement("video");
  debugVideo.style.cssText = `
    width: 100%;
    height: 100%;
    object-fit: cover;
  `;
  debugVideo.autoplay = true; // Start playing automatically
  debugVideo.muted = true; // Mute audio to avoid feedback

  // Create canvas overlay to draw hand detection visualizations
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
  debugCtx = debugCanvas.getContext("2d"); // Get 2D drawing context

  // Add video and canvas to container, then add container to page
  debugContainer.appendChild(debugVideo);
  debugContainer.appendChild(debugCanvas);
  document.body.appendChild(debugContainer);
}

// Function to draw hand detection information on debug canvas
function updateDebugVisualization() {
  if (!isDebugMode || !debugCtx || !handDetectorReady) return;

  // Clear the canvas for fresh drawing
  debugCtx.clearRect(0, 0, debugCanvas.width, debugCanvas.height);

  const detections = getDetections(); // Get current hand positions and gestures

  // Set drawing styles for hand visualization
  debugCtx.strokeStyle = "#00ff00"; // Green color for outlines
  debugCtx.fillStyle = "#00ff00"; // Green color for fills
  debugCtx.lineWidth = 2;
  debugCtx.font = "12px Arial";

  // Draw left hand information
  if (detections.leftHand.pinch.position) {
    // Convert normalized coordinates (0-1) to canvas pixel coordinates
    const x = detections.leftHand.pinch.position.x * debugCanvas.width;
    const y = detections.leftHand.pinch.position.y * debugCanvas.height;

    // Draw circle - larger and filled if pinching, smaller if not
    debugCtx.beginPath();
    debugCtx.arc(x, y, detections.leftHand.pinch.isPinching ? 15 : 8, 0, 2 * Math.PI);
    debugCtx.stroke();

    // Fill circle if pinching to show active state
    if (detections.leftHand.pinch.isPinching) {
      debugCtx.fill();
    }

    // Label as "L" for left hand
    debugCtx.fillText("L", x - 5, y - 20);
  }

  // Show left hand gesture information even without pinch position
  if (detections.leftHand.gesture && detections.leftHand.gesture.handPosition) {
    const x = detections.leftHand.gesture.handPosition.x * debugCanvas.width;
    const y = detections.leftHand.gesture.handPosition.y * debugCanvas.height;

    // If no pinch position was drawn, draw gesture position
    if (!detections.leftHand.pinch.position) {
      debugCtx.beginPath();
      debugCtx.arc(x, y, 8, 0, 2 * Math.PI);
      debugCtx.stroke();
      debugCtx.fillText("L", x - 5, y - 20);
    }

    // Display gesture name and confidence level
    debugCtx.fillText(
      `${detections.leftHand.gesture.name} (${detections.leftHand.gesture.confidence.toFixed(2)})`,
      x - 40,
      y + 30
    );
  }

  // Draw right hand information (similar to left hand)
  if (detections.rightHand.pinch.position) {
    const x = detections.rightHand.pinch.position.x * debugCanvas.width;
    const y = detections.rightHand.pinch.position.y * debugCanvas.height;

    // Use red color for right hand
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

  // Show right hand gesture information
  if (detections.rightHand.gesture && detections.rightHand.gesture.handPosition) {
    const x = detections.rightHand.gesture.handPosition.x * debugCanvas.width;
    const y = detections.rightHand.gesture.handPosition.y * debugCanvas.height;

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

  // Open Palm indicators
  debugCtx.font = "14px Arial";
  debugCtx.fillStyle = "#FFFF00"; // Yellow for Open Palm indicators

  if (
    detections.leftHand.gesture &&
    detections.leftHand.gesture.name === "Open_Palm" &&
    detections.leftHand.gesture.handPosition
  ) {
    const x = detections.leftHand.gesture.handPosition.x * debugCanvas.width;
    const y = detections.leftHand.gesture.handPosition.y * debugCanvas.height;
    debugCtx.fillText("L: Open Palm", x - 40, y + 45);
  }

  if (
    detections.rightHand.gesture &&
    detections.rightHand.gesture.name === "Open_Palm" &&
    detections.rightHand.gesture.handPosition
  ) {
    const x = detections.rightHand.gesture.handPosition.x * debugCanvas.width;
    const y = detections.rightHand.gesture.handPosition.y * debugCanvas.height;
    debugCtx.fillText("R: Open Palm", x - 40, y + 45);
  }
}

// Object to store different layout algorithms
const layoutAlgorithms = {};

// Class to handle UMAP layout algorithm (dimensionality reduction)
class UMAPLayoutAlgorithm {
  constructor(images) {
    this.umap = null; // Will hold the UMAP instance
    this.nEpochs = 0; // Number of training iterations
    this.done = false; // Whether algorithm has finished

    // Create UMAP instance with configuration
    this.umap = new UMAP({
      nNeighbors: 10, // Number of neighbors to consider
      minDist: 0.01, // Minimum distance between points
      nComponents: 2, // Output dimensions (2D)
    });
    // Initialize with image embeddings (high-dimensional vectors)
    this.nEpochs = this.umap.initializeFit(images.map((img) => img.embed));
  }

  // Perform one iteration of the algorithm
  step() {
    if (this.umap.step() === this.nEpochs) {
      this.done = true; // Mark as complete when all epochs done
    }
    // UMAP's getEmbedding() is relatively stable after initialization for a given dataset
    // but step() is called to adhere to the pattern.
    return this.umap.getEmbedding();
  }

  getTargetPositions(group) {
    const positions = [];
    const projections = this.umap.getEmbedding(); // Get 2D coordinates

    // Find the range of coordinates to normalize them
    const minX = Math.min(...projections.map((p) => p[0]));
    const maxX = Math.max(...projections.map((p) => p[0]));
    const minY = Math.min(...projections.map((p) => p[1]));
    const maxY = Math.max(...projections.map((p) => p[1]));

    const sceneSize = 20; // Size of our 3D scene

    for (let i = 0; i < projections.length; i++) {
      const x = map(projections[i][0], minX, maxX, -sceneSize, sceneSize);
      const y = map(projections[i][1], minY, maxY, -sceneSize, sceneSize);

      const phi = (x / sceneSize) * Math.PI;
      const theta = (y / sceneSize) * Math.PI;

      const targetX = sphereRadius * Math.sin(theta) * Math.cos(phi);
      const targetY = sphereRadius * Math.sin(theta) * Math.sin(phi);
      const targetZ = sphereRadius * Math.cos(theta);
      positions.push(new THREE.Vector3(targetX, targetY, targetZ));
    }
    return positions;
  }

  // Position images in 3D space based on UMAP results
  applyLayout(group) {
    const targetPositions = this.getTargetPositions(group);
    group.children.forEach((image, i) => {
      if (targetPositions[i]) {
        image.position.copy(targetPositions[i]);
      }
      image.lookAt(0, 0, 0);
    });
  }
}

// Class to handle force-directed layout algorithm
class ForceLayoutAlgorithm {
  constructor(images) {
    this.simExtent = 20; // Size of simulation space

    // Group images by title to create clusters
    this.groups = {};
    for (const image of images) {
      if (!this.groups[image.title]) {
        this.groups[image.title] = [];
      }
      this.groups[image.title].push(image);
    }
    this.groups = Object.values(this.groups);

    // Create random center points for each cluster
    this.clusterCentres = this.groups.map(() => ({
      x: (Math.random() - 0.5) * 2 * this.simExtent,
      y: (Math.random() - 0.5) * 2 * this.simExtent,
    }));

    // Assign each image to its cluster and give initial positions
    for (let gi = 0; gi < this.groups.length; gi++) {
      const { x: cx, y: cy } = this.clusterCentres[gi];
      for (const img of this.groups[gi]) {
        img.cluster = gi; // Remember which cluster this image belongs to
        // Start near cluster center with small random offset
        img.x = cx + (Math.random() - 0.01);
        img.y = cy + (Math.random() - 0.01);
      }
    }

    // Create D3 force simulation to handle physics
    this.simulation = d3
      .forceSimulation(images)
      // Pull images toward their cluster centers
      .force("x", d3.forceX((d) => this.clusterCentres[d.cluster].x).strength(0.5))
      .force("y", d3.forceY((d) => this.clusterCentres[d.cluster].y).strength(0.5))
      // Add repulsion between all images to spread them out
      .force("charge", d3.forceManyBody().strength(-0.05))
      // Prevent images from overlapping
      .force("collision", d3.forceCollide().radius(0.3))
      .alphaDecay(0.03) // How quickly simulation settles down
      .stop(); // Don't start automatically
  }

  // Perform one iteration of physics simulation
  step() {
    this.simulation.tick();
  }

  getTargetPositions(group) {
    const positions = [];
    const nodes = this.simulation.nodes();
    for (let i = 0; i < nodes.length; i++) {
      const nx = nodes[i].x; // X position from simulation
      const ny = nodes[i].y; // Y position from simulation

      const phi = (nx / this.simExtent) * Math.PI * 2;
      const theta = (ny / this.simExtent) * Math.PI * 2;

      const targetX = sphereRadius * Math.sin(theta) * Math.cos(phi);
      const targetY = sphereRadius * Math.sin(theta) * Math.sin(phi);
      const targetZ = sphereRadius * Math.cos(theta);
      positions.push(new THREE.Vector3(targetX, targetY, targetZ));
    }
    return positions;
  }

  // Position images in 3D space based on simulation results
  applyLayout(group) {
    const targetPositions = this.getTargetPositions(group);
    group.children.forEach((img, i) => {
      if (targetPositions[i]) {
        img.position.copy(targetPositions[i]);
      }
      img.lookAt(0, 0, 0);
    });
  }
}

// Hand detector setup
const handDetector = new HandDetector();
let handDetectorReady = false; // Track if hand detection is working

// Initialize hand detection system
async function initHandDetector() {
  const success = await handDetector.initialize();
  if (success) {
    const webcamStarted = await handDetector.startWebcam();
    if (webcamStarted) {
      handDetectorReady = true;
      window.handDetectorReady = true; // Make available globally
      console.log("Hand detector ready for use");
      if (isDebugMode) {
        // Show webcam feed in debug mode
        debugVideo.srcObject = handDetector.getVideoStream();
      }
    }
  }
}

// Function to get current hand positions and gestures
function getDetections() {
  if (!handDetectorReady) {
    // Return empty detections if not ready
    return {
      leftHand: { gesture: null, pinch: { isPinching: false, position: null } },
      rightHand: { gesture: null, pinch: { isPinching: false, position: null } },
    };
  }
  return handDetector.getDetections();
}

// Make functions available globally (can be used from HTML/console)
window.getDetections = getDetections;
window.handDetectorReady = false;
window.layoutMode = layoutMode;

// Function to toggle layout mode and start transition
function toggleLayoutMode() {
  if (isTransitioningLayout) return; // Don't switch if already transitioning

  const newMode = layoutMode === "force" ? "umap" : "force";
  console.log(`Switching layout from ${layoutMode} to ${newMode}`);

  // Capture current visual positions
  capturedOldPositions = imagesGroup.children.map((child) => child.position.clone());

  layoutMode = newMode;
  window.layoutMode = newMode; // Update global for inspection

  // The new layout algorithm (currentLayoutAlgorithm in animate) will now be the target.
  // Its step() and getTargetPositions() will be called in the animate loop.

  isTransitioningLayout = true;
  transitionStartTime = performance.now();
}

// Event listener for spacebar to toggle layout
window.addEventListener("keydown", (event) => {
  if (event.code === "Space") {
    event.preventDefault(); // Prevent page scrolling
    toggleLayoutMode();
  }
});

// Original setLayoutMode function - can be kept or removed if spacebar is primary
window.setLayoutMode = function (mode) {
  if (layoutAlgorithms[mode]) {
    layoutMode = mode;
    window.layoutMode = mode;
    console.log(`Layout mode changed to: ${mode}`);
  }
};

// Create the 3D renderer (draws everything to screen)
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight); // Full screen
document.body.appendChild(renderer.domElement); // Add to web page

// Handle window resizing
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener("resize", onWindowResize, false);

const pmremGenerator = new THREE.PMREMGenerator(renderer);

// Create the 3D scene (container for all 3D objects)
const scene = new THREE.Scene();

// Create camera (our viewpoint into the 3D world)
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);

// Create orbit controls (allows mouse interaction to rotate/zoom camera)
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; // Smooth camera movement
controls.dampingFactor = 0.15; // How smooth the movement is
// controls.enableZoom = false;
// controls.minPolarAngle = Math.PI / 2; // 90°
// controls.maxPolarAngle = Math.PI / 2; // 90°

// Lighting setup

// Ambient light - provides overall illumination from all directions
const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
scene.add(ambientLight);

// Directional light - like sunlight, comes from one direction
const light1 = new THREE.DirectionalLight(0xffffff, 1);
light1.position.set(100, 200, 0); // Position the light source
scene.add(light1);

// Constants for sphere setup
const sphereRadius = 10; // How big our invisible sphere is

// Create wireframe sphere to show the boundary where images will be placed
const sphereGeometry = new THREE.SphereGeometry(sphereRadius + 0.1, 32, 32);
const sphereMaterial = new THREE.MeshStandardMaterial({ color: 0x0000ff, wireframe: true });
const sphereMesh = new THREE.Mesh(sphereGeometry, sphereMaterial);
scene.add(sphereMesh);

// Create group to hold all the images
const imagesGroup = new THREE.Group();
scene.add(imagesGroup);

// Position camera to look at the sphere
camera.position.z = 10;

// Utility function to map values from one range to another
// Example: map(5, 0, 10, 0, 100) converts 5 (from 0-10 range) to 50 (in 0-100 range)
function map(v, inMin, inMax, outMin, outMax) {
  return ((v - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
}

// Function to center a group of objects around the origin (not currently used)
function translateToCenter(group, startIndex, endIndex) {
  // Calculate average position (centroid)
  let centroid = new THREE.Vector3();
  for (let i = startIndex; i < endIndex; i++) {
    centroid.add(group.children[i].position);
  }
  centroid.divideScalar(endIndex - startIndex);

  // Move all objects so centroid is at origin
  for (let i = startIndex; i < endIndex; i++) {
    group.children[i].position.sub(centroid);
  }
}

// Variables for pinch-to-zoom gesture
let initialPinchDistance = null; // Distance between hands when pinch started

// Variables for open palm orbiting gesture
let lastPalmPosition = null; // Previous palm position for calculating movement
let isOrbiting = false; // Whether we're currently in orbit mode

let initialOffset;
// Main animation loop - runs 60 times per second
function animate() {
  requestAnimationFrame(animate); // Schedule next frame

  // Check for hand gestures if hand detection is ready
  if (handDetectorReady) {
    const detections = getDetections();

    // Check if either hand is pinching
    const leftPinching = detections.leftHand.pinch.isPinching;
    const rightPinching = detections.rightHand.pinch.isPinching;

    // Two-hand pinch-to-zoom (highest priority interaction)
    if (leftPinching && rightPinching && detections.leftHand.pinch.position && detections.rightHand.pinch.position) {
      // Calculate distance between the two pinch points
      const leftPos = detections.leftHand.pinch.position;
      const rightPos = detections.rightHand.pinch.position;
      const currentDistance = Math.sqrt(Math.pow(rightPos.x - leftPos.x, 2) + Math.pow(rightPos.y - leftPos.y, 2));

      if (initialPinchDistance === null) {
        initialPinchDistance = currentDistance;
        initialOffset = camera.position.clone().sub(controls.target);
      } else {
        const scale = currentDistance / initialPinchDistance;
        const newOffset = initialOffset.clone().divideScalar(scale);
        camera.position.copy(controls.target).add(newOffset);
      }
    } else {
      initialPinchDistance = null;
      // Check for open palm orbiting gesture (either hand)
      let palmPosition = null;
      if (
        detections.leftHand.gesture &&
        detections.leftHand.gesture.name === "Open_Palm" &&
        detections.leftHand.gesture.handPosition
      ) {
        palmPosition = detections.leftHand.gesture.handPosition;
      } else if (
        detections.rightHand.gesture &&
        detections.rightHand.gesture.name === "Open_Palm" &&
        detections.rightHand.gesture.handPosition
      ) {
        palmPosition = detections.rightHand.gesture.handPosition;
      }

      if (palmPosition) {
        if (lastPalmPosition && isOrbiting) {
          const rotationSpeed = 3.5;
          const deltaX = (palmPosition.x - lastPalmPosition.x) * rotationSpeed;
          const deltaY = (palmPosition.y - lastPalmPosition.y) * rotationSpeed;

          const offset = new THREE.Vector3().subVectors(camera.position, controls.target);
          const spherical = new THREE.Spherical().setFromVector3(offset);
          spherical.theta += deltaX;
          spherical.phi -= deltaY;
          spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi));
          offset.setFromSpherical(spherical);
          camera.position.copy(controls.target).add(offset);
          camera.lookAt(controls.target);
        }
        lastPalmPosition = { x: palmPosition.x, y: palmPosition.y };
        isOrbiting = true;
      } else {
        lastPalmPosition = null;
        isOrbiting = false;
      }
    }
  }

  // Update layout algorithm
  const currentLayoutAlgorithm = layoutAlgorithms[layoutMode];
  currentLayoutAlgorithm.step(); // Update algorithm's internal state

  const newTargetPositions = currentLayoutAlgorithm.getTargetPositions(imagesGroup);

  if (isTransitioningLayout) {
    const elapsedTime = performance.now() - transitionStartTime;
    const progress = Math.min(elapsedTime / transitionDuration, 1);

    imagesGroup.children.forEach((child, index) => {
      if (capturedOldPositions[index] && newTargetPositions[index]) {
        child.position.lerpVectors(capturedOldPositions[index], newTargetPositions[index], progress);
      }
      child.lookAt(0, 0, 0); // Keep looking at center during transition
    });

    if (progress >= 1) {
      isTransitioningLayout = false;
      // Ensure final positions are accurately set
      imagesGroup.children.forEach((child, index) => {
        if (newTargetPositions[index]) {
          child.position.copy(newTargetPositions[index]);
        }
        // Ensure lookAt is applied after final position
        child.lookAt(0, 0, 0);
      });
      console.log("Layout transition complete.");
      capturedOldPositions = []; // Clear old positions
    }
  } else {
    // Normal operation: apply layout directly
    imagesGroup.children.forEach((child, index) => {
      if (newTargetPositions[index]) {
        child.position.copy(newTargetPositions[index]);
      }
      child.lookAt(0, 0, 0);
    });
  }

  // Update orbit controls (handles mouse interaction)
  controls.update();

  // Draw everything to the screen
  renderer.render(scene, camera);

  // Update debug visualization if in debug mode
  updateDebugVisualization();
}

// Function to load images and set up the scene
async function load() {
  // Load image data from JSON file
  const imageRes = await fetch("image_embeds.json");
  const imageEmbeds = await imageRes.json();

  // Initialize both layout algorithms with the image data
  layoutAlgorithms["umap"] = new UMAPLayoutAlgorithm(imageEmbeds);
  layoutAlgorithms["force"] = new ForceLayoutAlgorithm(imageEmbeds);

  // Create texture loader to load image files
  const textureLoader = new THREE.TextureLoader();

  // Create a 3D object for each image
  for (const image of imageEmbeds) {
    // Create flat rectangle geometry to display image on
    const planeGeo = new THREE.PlaneGeometry();

    // Create material that can show images
    const planeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, // White color (won't tint the image)
      side: THREE.DoubleSide, // Visible from both sides
    });

    // Load the actual image file and apply it to the material
    planeMat.map = textureLoader.load(`images_resized/${image.filename}`);

    // Create 3D mesh by combining geometry and material
    const mesh = new THREE.Mesh(planeGeo, planeMat);

    // Scale the mesh to maintain proper aspect ratio
    const aspect = image.height / image.width;
    mesh.scale.x = 0.8; // Width
    mesh.scale.y = mesh.scale.x * aspect; // Height based on aspect ratio

    // Give initial random position (will be overridden by layout algorithm)
    mesh.position.x = Math.random() * 10 - 5;
    mesh.position.y = Math.random() * 10 - 5;

    // Add to the images group
    imagesGroup.add(mesh);
  }

  // Initialize hand detection system
  initHandDetector();

  // Initialize debug interface
  initDebugUI();

  // Start the animation loop
  animate();
}

// Start the application by loading everything
load();
