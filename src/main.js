import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { AudioEngine } from './audio.js';
import { createMetalSphere } from './sphere.js';
import { createUI, DEFAULT_PRESET } from './ui.js';

const canvas = document.getElementById('visualizer');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x050505, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = DEFAULT_PRESET.exposure;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(DEFAULT_PRESET.fov, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, DEFAULT_PRESET.cameraDistance);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.enablePan = false;
controls.minDistance = 3.1;
controls.maxDistance = 15;
controls.autoRotate = DEFAULT_PRESET.autoRotate;
controls.autoRotateSpeed = DEFAULT_PRESET.rotateSpeed;

const { mesh: sphere, uniforms } = createMetalSphere();
scene.add(sphere);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), DEFAULT_PRESET.bloomStrength, DEFAULT_PRESET.bloomRadius, DEFAULT_PRESET.bloomThreshold);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const audio = new AudioEngine();
audio.audio.volume = DEFAULT_PRESET.volume;

let params = { ...DEFAULT_PRESET };
let loadedFileName = '';
let suppressSeek = false;

function applyParam(id, value) {
  params[id] = value;
  const map = {
    radius: 'uRadius', deformation: 'uDeformation', noiseScale: 'uNoiseScale', noiseSpeed: 'uNoiseSpeed',
    surfaceDetail: 'uSurfaceDetail', metalness: 'uMetalness', roughness: 'uRoughness', reflection: 'uReflection',
    propagationSpeed: 'uPropagationSpeed', propagationWidth: 'uPropagationWidth', propagationMode: 'uPropagationMode'
  };
  if (map[id]) uniforms[map[id]].value = value;

  if (id === 'sensitivity') audio.sensitivity = value;
  if (id === 'smoothing') audio.setSmoothing(value);
  if (id === 'bloomEnabled') bloom.enabled = value;
  if (id === 'bloomStrength') bloom.strength = value;
  if (id === 'bloomRadius') bloom.radius = value;
  if (id === 'bloomThreshold') bloom.threshold = value;
  if (id === 'exposure') renderer.toneMappingExposure = value;
  if (id === 'autoRotate') controls.autoRotate = value;
  if (id === 'rotateSpeed') controls.autoRotateSpeed = value;
  if (id === 'fov') { camera.fov = value; camera.updateProjectionMatrix(); }
  if (id === 'cameraDistance') {
    const dir = camera.position.clone().normalize();
    camera.position.copy(dir.multiplyScalar(value));
    controls.update();
  }
  if (id === 'volume') audio.audio.volume = value;
}

const ui = createUI(applyParam);
ui.applyPreset(DEFAULT_PRESET);

const loadAudioButton = document.getElementById('loadAudioButton');
const audioFileInput = document.getElementById('audioFileInput');
const dropZone = document.getElementById('dropZone');
const playPause = document.getElementById('playPause');
const trackName = document.getElementById('trackName');
const currentTimeEl = document.getElementById('currentTime');
const durationEl = document.getElementById('duration');
const seek = document.getElementById('seek');
const status = document.getElementById('audioStatus');
const togglePanel = document.getElementById('togglePanel');
const controlPanel = document.getElementById('controlPanel');

function setStatus(text) { status.textContent = text; }
function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

async function loadAudioFile(file) {
  if (!file || !file.type.startsWith('audio/')) {
    setStatus('INVALID AUDIO');
    return;
  }
  setStatus('LOADING');
  try {
    await audio.loadFile(file);
    loadedFileName = file.name;
    trackName.textContent = file.name;
    durationEl.textContent = formatTime(audio.audio.duration);
    seek.disabled = false;
    playPause.disabled = false;
    playPause.textContent = '▶';
    setStatus('LOADED');
  } catch (error) {
    console.error(error);
    setStatus('LOAD ERROR');
  }
}

loadAudioButton.addEventListener('click', () => audioFileInput.click());
audioFileInput.addEventListener('change', e => loadAudioFile(e.target.files?.[0]));

dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  loadAudioFile(e.dataTransfer.files?.[0]);
});
dropZone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') audioFileInput.click(); });

playPause.addEventListener('click', async () => {
  if (!loadedFileName) return;
  await audio.togglePlayback();
});
audio.audio.addEventListener('play', () => { playPause.textContent = 'Ⅱ'; setStatus('PLAYING'); });
audio.audio.addEventListener('pause', () => { playPause.textContent = '▶'; setStatus(audio.audio.ended ? 'ENDED' : 'PAUSED'); });
audio.audio.addEventListener('ended', () => { playPause.textContent = '▶'; setStatus('ENDED'); });
audio.audio.addEventListener('timeupdate', () => {
  if (!suppressSeek && Number.isFinite(audio.audio.duration) && audio.audio.duration > 0) {
    seek.value = Math.round((audio.audio.currentTime / audio.audio.duration) * 1000);
    currentTimeEl.textContent = formatTime(audio.audio.currentTime);
  }
});
seek.addEventListener('pointerdown', () => { suppressSeek = true; });
seek.addEventListener('pointerup', () => { suppressSeek = false; });
seek.addEventListener('input', () => {
  if (Number.isFinite(audio.audio.duration)) {
    audio.audio.currentTime = (Number(seek.value) / 1000) * audio.audio.duration;
    currentTimeEl.textContent = formatTime(audio.audio.currentTime);
  }
});

togglePanel.addEventListener('click', () => {
  const hidden = controlPanel.classList.toggle('hidden');
  togglePanel.setAttribute('aria-expanded', String(!hidden));
});

document.getElementById('centerCamera').addEventListener('click', () => {
  controls.target.set(0, 0, 0);
  camera.position.set(0, 0, params.cameraDistance);
  controls.update();
});

document.getElementById('resetPreset').addEventListener('click', () => ui.applyPreset(DEFAULT_PRESET));
document.getElementById('exportPreset').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(ui.readPreset(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'metal-sphere-preset.json';
  a.click();
  URL.revokeObjectURL(url);
});
const presetFileInput = document.getElementById('presetFileInput');
document.getElementById('importPreset').addEventListener('click', () => presetFileInput.click());
presetFileInput.addEventListener('change', async e => {
  try {
    const file = e.target.files?.[0];
    if (!file) return;
    ui.applyPreset(JSON.parse(await file.text()));
    setStatus('PRESET LOADED');
  } catch (error) {
    console.error(error);
    setStatus('PRESET ERROR');
  }
});

const clock = new THREE.Clock();
let bassSmooth = 0, midsSmooth = 0, trebleSmooth = 0, levelSmooth = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  const bands = audio.update(dt);
  const ease = 1 - Math.pow(0.001, dt);
  bassSmooth += (bands.bass * params.bass - bassSmooth) * ease;
  midsSmooth += (bands.mids * params.mids - midsSmooth) * ease;
  trebleSmooth += (bands.treble * params.treble - trebleSmooth) * ease;
  levelSmooth += (bands.level - levelSmooth) * ease;

  uniforms.uTime.value = t;
  uniforms.uBass.value = bassSmooth;
  uniforms.uMids.value = midsSmooth;
  uniforms.uTreble.value = trebleSmooth;
  uniforms.uLevel.value = levelSmooth;
  uniforms.uBeat.value = bands.beat;
  uniforms.uCameraPosition.value.copy(camera.position);

  sphere.rotation.y += dt * 0.035;
  sphere.rotation.x = Math.sin(t * 0.12) * 0.055;
  controls.update();
  composer.render();
}
animate();

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
}
window.addEventListener('resize', resize);
window.addEventListener('beforeunload', () => audio.dispose());
