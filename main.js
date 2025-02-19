import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { Text } from "troika-three-text";

let umap;
let nEpochs;
let done = false;
let firstTextIndex = 0;

const renderer = new THREE.WebGLRenderer();
// renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
const pmremGenerator = new THREE.PMREMGenerator(renderer);

const scene = new THREE.Scene();
scene.environment = pmremGenerator.fromScene(
  new RoomEnvironment(),
  0.04
).texture;
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

const controls = new OrbitControls(camera, renderer.domElement);

// Lights

const ambientLight = new THREE.AmbientLight(0x000000);
scene.add(ambientLight);

const light1 = new THREE.DirectionalLight(0xffffff, 3);
light1.position.set(0, 200, 0);
scene.add(light1);

const light2 = new THREE.DirectionalLight(0xffffff, 3);
light2.position.set(100, 200, 100);
scene.add(light2);

const light3 = new THREE.DirectionalLight(0xffffff, 3);
light3.position.set(-100, -200, -100);
scene.add(light3);

// const lightHelper = new THREE.DirectionalLightHelper(light2, 5);
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

function updatePositions(projections, group, groupOffset = 0) {
  // debugger;
  const minX = Math.min(...projections.map((p) => p[0]));
  const maxX = Math.max(...projections.map((p) => p[0]));
  const minY = Math.min(...projections.map((p) => p[1]));
  const maxY = Math.max(...projections.map((p) => p[1]));
  // const minZ = Math.min(...projections.map((p) => p[2]));
  // const maxZ = Math.max(...projections.map((p) => p[2]));

  //SCENE SIZE

  const sceneSize = 20;

  for (let i = 0; i < projections.length; i++) {
    const image = group.children[i + groupOffset];
    const x = map(
      projections[i][0],
      minX,
      maxX,
      -sceneSize,
      sceneSize
    );
    const y = map(
      projections[i][1],
      minY,
      maxY,
      -sceneSize,
      sceneSize
    );
    
    const phi = (x / sceneSize) * Math.PI;
    const theta = (y / sceneSize) * Math.PI;
    image.position.x = sphereRadius * Math.sin(theta) * Math.cos(phi);
    image.position.y = sphereRadius * Math.sin(theta) * Math.sin(phi);
    image.position.z = sphereRadius * Math.cos(theta);
    image.lookAt(0, 0, 0);



    // image.position.x = 
    // image.position.y = 
    // image.position.z = map(
    //   projections[i][2],
    //   minZ,
    //   maxZ,
    //   -sceneSize,
    //   sceneSize
    // );
  }
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

  if (!done) {
    umap.step();
    if (umap.step() === nEpochs) {
      done = true;
    }
    const projections = umap.getEmbedding();
    // const imageProjections = projections.slice(0, firstTextIndex);
    // const textProjections = projections.slice(firstTextIndex);
    updatePositions(projections, imagesGroup, 0);
    // translateToCenter(imagesGroup, 0, firstTextIndex);
    // translateToCenter(imagesGroup, firstTextIndex, imagesGroup.children.length);
    // Flip all of the text meshes
    // for (let i = firstTextIndex; i < imagesGroup.children.length; i++) {
    //   const obj = imagesGroup.children[i];
    //   obj.position.x *= -1;
    //   obj.position.y *= -1;
    //   obj.position.z *= -1;
    // }
    // translateToCenter(imagesGroup, 0, imagesGroup.children.length);

    // updatePositions(textProjections, imagesGroup, firstTextIndex);
  }
  //   console.log(projections);

  renderer.render(scene, camera);
}
// animate();

async function load() {
  const imageRes = await fetch("image_embeds.json");
  const imageEmbeds = await imageRes.json();

  // const textRes = await fetch("text_embeds.json");
  // const textEmbeds = await textRes.json();

  // const allEmbeds = [...imageEmbeds, ...textEmbeds];
  const allEmbeds = [...imageEmbeds];
  firstTextIndex = imageEmbeds.length;

  umap = new UMAP({
    nNeighbors: 15,
    minDist: 0.1,
    nComponents: 2,
  });
  nEpochs = umap.initializeFit(allEmbeds.map((e) => e.embed));

  const textureLoader = new THREE.TextureLoader();
  for (const image of imageEmbeds) {
    const planeGeo = new THREE.PlaneGeometry();
    const planeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
    });
    planeMat.map = textureLoader.load(`images/${image.filename}`);
    const mesh = new THREE.Mesh(planeGeo, planeMat);
    const aspect = image.width / image.height;
    mesh.scale.y = 1.0;
    mesh.scale.x = mesh.scale.y * aspect;

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
