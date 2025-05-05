import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { Text } from "troika-three-text";

// Either "umap" or "force"
let layoutMode = "force";

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
    // Group by name to get all clusters of pages
    this.groups = {};
    for (const image of images) {
      if (!this.groups[image.title]) {
        this.groups[image.title] = [];
      }
      this.groups[image.title].push(image);
    }
    this.groups = Object.values(this.groups);
    const inputSize = 5;

    this.clusterCentres = this.groups.map(() => {
      return { x: (Math.random() - 0.5) * inputSize, y: (Math.random() - 0.5) * inputSize };
    });

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
      .force("collision", d3.forceCollide().radius(0.05)) // prevent overlaps
      .alphaDecay(0.03) // optional: faster settle
      .stop();
  }
  step() {
    this.simulation.tick();
  }
  layout(group) {
    const positions = this.simulation.nodes();
    for (let i = 0; i < positions.length; i++) {
      const image = group.children[i];
      const inputSize = 5;
      const sceneSize = 20;
      const x = map(positions[i].x, -inputSize, inputSize, -sceneSize, sceneSize);
      const y = map(positions[i].y, -inputSize, inputSize, -sceneSize, sceneSize);

      const phi = (x / sceneSize) * Math.PI;
      const theta = (y / sceneSize) * Math.PI;
      image.position.x = sphereRadius * Math.sin(theta) * Math.cos(phi);
      image.position.y = sphereRadius * Math.sin(theta) * Math.sin(phi);
      image.position.z = sphereRadius * Math.cos(theta);
      image.lookAt(0, 0, 0);
    }
  }
}

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

// Lights

const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
scene.add(ambientLight);

const light1 = new THREE.DirectionalLight(0xffffff, 1);
light1.position.set(100, 200, 0);
scene.add(light1);

// const light2 = new THREE.DirectionalLight(0xffffff, 3);
// light2.position.set(100, 200, 100);
// scene.add(light2);

// const light3 = new THREE.DirectionalLight(0xffffff, 3);
// light3.position.set(-100, -200, -100);
// scene.add(light3);

// const lightHelper = new THREE.DirectionalLightHelper(light1, 5);
// scene.add(lightHelper);

//GRID SIZE
// const gridHelper = new THREE.GridHelper(100, 100);
// scene.add(gridHelper);

const sphereRadius = 10;

const sphereGeometry = new THREE.SphereGeometry(sphereRadius + 0.1, 32, 32);
const sphereMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, wireframe: true });
const sphereMesh = new THREE.Mesh(sphereGeometry, sphereMaterial);
scene.add(sphereMesh);

const imagesGroup = new THREE.Group();
scene.add(imagesGroup);

camera.position.z = 5;

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

function animate() {
  requestAnimationFrame(animate);

  const layoutAlgorithm = layoutAlgorithms[layoutMode];
  layoutAlgorithm.step();
  layoutAlgorithm.layout(imagesGroup);

  renderer.render(scene, camera);
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
      side: THREE.DoubleSide,
    });
    // const planeMat = new THREE.MeshBasicMaterial({
    //   color: 0xffffff,
    //   side: THREE.DoubleSide,
    // });

    planeMat.map = textureLoader.load(`images/${image.filename}`);
    const mesh = new THREE.Mesh(planeGeo, planeMat);
    const aspect = image.height / image.width;
    mesh.scale.x = 2.0;
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
  animate();
}

load();
