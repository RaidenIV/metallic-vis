import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { TeapotGeometry } from 'three/addons/geometries/TeapotGeometry.js';

const snoise = String.raw`vec4 permute(vec4 x) {
    return mod(((x * 34.0) + 1.0) * x, 289.0);
}
vec4 taylorInvSqrt(vec4 r) {
    return 1.79284291400159 - 0.85373472095314 * r;
}

float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

    // First corner
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);

    // Other corners
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);

    //  x0 = x0 - 0. + 0.0 * C
    vec3 x1 = x0 - i1 + 1.0 * C.xxx;
    vec3 x2 = x0 - i2 + 2.0 * C.xxx;
    vec3 x3 = x0 - 1. + 3.0 * C.xxx;

    // Permutations
    i = mod(i, 289.0);
    vec4 p = permute(permute(permute(
                    i.z + vec4(0.0, i1.z, i2.z, 1.0))
                    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
                + i.x + vec4(0.0, i1.x, i2.x, 1.0));

    // Gradients
    // ( N*N points uniformly over a square, mapped onto an octahedron.)
    float n_ = 1.0 / 7.0; // N=7
    vec3 ns = n_ * D.wyz - D.xzx;

    vec4 j = p - 49.0 * floor(p * ns.z * ns.z); //  mod(p,N*N)

    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_); // mod(j,N)

    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);

    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);

    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));

    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);

    //Normalise gradients
    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;

    // Mix final noise value
    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1),
                dot(p2, x2), dot(p3, x3)));
}
`;

let scale = 1.0;
function isMobileDevice() {
    return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}
if (isMobileDevice()) scale = 0.7;


const cnvs = document.getElementById('c');
if (!cnvs) throw new Error('Canvas #c was not found.');
const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(75, cnvs.clientWidth / cnvs.clientHeight, 0.001, 100);


if (isMobileDevice()) cam.position.set(0, 8, 18)
else cam.position.set(0, 1, 14);
const blackColor = new THREE.Color(0x000000);
scene.background = blackColor;


const re = new THREE.WebGLRenderer({ canvas: cnvs, antialias: true });
re.setPixelRatio(Math.min(window.devicePixelRatio, 2));
re.setSize(cnvs.clientWidth * scale, cnvs.clientHeight * scale, false);
re.toneMapping = THREE.CineonToneMapping;
re.outputColorSpace = THREE.SRGBColorSpace;


const effectComposer1 = new EffectComposer(re);
const renderPass = new RenderPass(scene, cam);
let radius = isMobileDevice() ? 0.1 : 0.25;
const unrealBloomPass = new UnrealBloomPass(new THREE.Vector2(cnvs.clientWidth * scale, cnvs.clientHeight * scale), 0.5, radius, 0.2);
const outPass = new OutputPass();

const effectComposer2 = new EffectComposer(re);
const shaderPass = new ShaderPass(new THREE.ShaderMaterial({
    uniforms: {
        tDiffuse: { value: null },
        uBloomTexture: {
            value: effectComposer1.renderTarget2.texture
        },
        uStrength: {
            value: isMobileDevice() ? 6.00 : 8.00,
        },
    },

    vertexShader: `
        varying vec2 vUv;
        void main(){
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
        }
    `,

    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform sampler2D uBloomTexture;
        uniform float uStrength;
        varying vec2 vUv;
        void main(){
            vec4 baseEffect = texture2D(tDiffuse,vUv);
            vec4 bloomEffect = texture2D(uBloomTexture,vUv);
            gl_FragColor =baseEffect + bloomEffect * uStrength;
        }
    `,
}));

effectComposer1.addPass(renderPass);
effectComposer1.addPass(unrealBloomPass);
effectComposer1.renderToScreen = false;

effectComposer2.addPass(renderPass);
effectComposer2.addPass(shaderPass);
effectComposer2.addPass(outPass);


//const stat = new Stats();
const orbCtrls = new OrbitControls(cam, cnvs);
//document.body.appendChild(stat.dom);


const loadProgressUi = {
    background: {
        panel: document.getElementById('background-load-progress'),
        label: document.getElementById('background-load-label'),
        percent: document.getElementById('background-load-percent'),
        fill: document.getElementById('background-load-fill'),
        hideTimer: null,
    },
    audio: {
        panel: document.getElementById('audio-load-progress'),
        label: document.getElementById('audio-load-label'),
        percent: document.getElementById('audio-load-percent'),
        fill: document.getElementById('audio-load-fill'),
        hideTimer: null,
    },
};

function updateLoadProgress(kind, progress, label) {
    const ui = loadProgressUi[kind];
    if (!ui?.panel || !ui.label || !ui.percent || !ui.fill) return;

    if (ui.hideTimer) {
        clearTimeout(ui.hideTimer);
        ui.hideTimer = null;
    }

    const value = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
    const percent = Math.round(value * 100);
    ui.panel.hidden = false;
    if (label) ui.label.textContent = label;
    ui.percent.textContent = `${percent}%`;
    ui.fill.style.width = `${percent}%`;
}

function completeLoadProgress(kind, label) {
    const ui = loadProgressUi[kind];
    updateLoadProgress(kind, 1, label);
    if (!ui?.panel) return;
    ui.hideTimer = setTimeout(() => {
        ui.panel.hidden = true;
        ui.hideTimer = null;
    }, 550);
}

function failLoadProgress(kind, label) {
    const ui = loadProgressUi[kind];
    if (!ui?.panel || !ui.label || !ui.percent) return;
    if (ui.hideTimer) clearTimeout(ui.hideTimer);
    ui.panel.hidden = false;
    ui.label.textContent = label;
    ui.percent.textContent = 'ERROR';
    ui.hideTimer = setTimeout(() => {
        ui.panel.hidden = true;
        ui.hideTimer = null;
    }, 1800);
}


// Audio-reactive layer. The selected file stays local to the browser and is
// analysed with the Web Audio API; the original visual effect remains intact.
const audioElement = new Audio();
audioElement.preload = 'metadata';

const audioFileInput = document.createElement('input');
audioFileInput.type = 'file';
audioFileInput.accept = 'audio/*';
audioFileInput.hidden = true;
document.body.appendChild(audioFileInput);

let audioContext = null;
let audioAnalyser = null;
let audioSource = null;
let audioFrequencyData = null;
let audioObjectUrl = null;

const audioReactive = {
    sensitivity: 1.35,
    smoothing: 0.78,
    bassMinHz: 20,
    bassMaxHz: 180,
    midsMinHz: 180,
    midsMaxHz: 2200,
    highsMinHz: 2200,
    highsMaxHz: 12000,
    lowMeshSizeResponse: 0.45,
    bloomResponse: 1.5,
    particleSizeResponse: 1.25,
};

const audioSettings = {
    fftSize: 1024,
};

const audioInfo = {
    name: 'No file loaded',
    type: 'Unavailable',
    size: 'Unavailable',
    duration: 'Unavailable',
    sampleRate: 'Unavailable',
    channels: 'Unavailable',
    decode: 'Not loaded',
    status: 'Choose or drop a supported audio file.',
    currentTime: '0:00',
    seekPercent: 0,
    volume: 100,
    muted: false,
};

const loopSettings = {
    enabled: false,
    start: 0,
    end: 0,
    bpm: 120,
    bars: 4,
    snapToBeats: true,
};

let decodedAudioBuffer = null;
let recordingDestination = null;
let audioInfoBindings = [];
let seekBinding = null;
let loopBindings = [];

function formatTime(seconds, precise = false) {
    const value = Math.max(0, Number(seconds) || 0);
    const minutes = Math.floor(value / 60);
    const secs = value - minutes * 60;
    if (precise) return `${minutes}:${secs.toFixed(3).padStart(6, '0')}`;
    return `${minutes}:${Math.floor(secs).toString().padStart(2, '0')}`;
}

function formatBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function refreshAudioInfo() {
    audioInfoBindings.forEach((binding) => binding.refresh());
    if (seekBinding) seekBinding.refresh();
    loopBindings.forEach((binding) => binding.refresh());
}

function ensureAudioAnalyser() {
    if (!audioContext) {
        audioContext = new AudioContext();
    }

    if (!audioAnalyser) {
        audioAnalyser = audioContext.createAnalyser();
        audioAnalyser.smoothingTimeConstant = audioReactive.smoothing;
    }

    if (audioAnalyser.fftSize !== audioSettings.fftSize) {
        audioAnalyser.fftSize = audioSettings.fftSize;
    }
    if (!audioFrequencyData || audioFrequencyData.length !== audioAnalyser.frequencyBinCount) {
        audioFrequencyData = new Uint8Array(audioAnalyser.frequencyBinCount);
    }

    if (!audioSource) {
        audioSource = audioContext.createMediaElementSource(audioElement);
        audioSource.connect(audioAnalyser);
        audioAnalyser.connect(audioContext.destination);
    }

    if (!recordingDestination) {
        recordingDestination = audioContext.createMediaStreamDestination();
        audioAnalyser.connect(recordingDestination);
    }
}

function setAudioResolution(fftSize) {
    const next = Number(fftSize);
    if (![256, 512, 1024, 2048, 4096, 8192, 16384].includes(next)) return;
    audioSettings.fftSize = next;
    ensureAudioAnalyser();
    audioAnalyser.fftSize = next;
    audioFrequencyData = new Uint8Array(audioAnalyser.frequencyBinCount);
}

function getBandLevel(minHz, maxHz) {
    if (!audioAnalyser || !audioFrequencyData || !audioContext) return 0;

    const nyquist = audioContext.sampleRate / 2;
    const firstBin = Math.max(0, Math.floor((minHz / nyquist) * audioFrequencyData.length));
    const lastBin = Math.min(audioFrequencyData.length - 1, Math.ceil((maxHz / nyquist) * audioFrequencyData.length));
    if (lastBin < firstBin) return 0;

    let total = 0;
    for (let i = firstBin; i <= lastBin; i++) total += audioFrequencyData[i];
    return (total / (lastBin - firstBin + 1)) / 255;
}

function readAudioLevels() {
    if (!audioAnalyser || !audioFrequencyData || audioElement.paused) {
        return { bass: 0, mids: 0, highs: 0, level: 0 };
    }

    audioAnalyser.smoothingTimeConstant = audioReactive.smoothing;
    audioAnalyser.getByteFrequencyData(audioFrequencyData);

    const sensitivity = audioReactive.sensitivity;
    const bassMin = Math.min(audioReactive.bassMinHz, audioReactive.bassMaxHz);
    const bassMax = Math.max(audioReactive.bassMinHz, audioReactive.bassMaxHz);
    const midsMin = Math.min(audioReactive.midsMinHz, audioReactive.midsMaxHz);
    const midsMax = Math.max(audioReactive.midsMinHz, audioReactive.midsMaxHz);
    const highsMin = Math.min(audioReactive.highsMinHz, audioReactive.highsMaxHz);
    const highsMax = Math.max(audioReactive.highsMinHz, audioReactive.highsMaxHz);

    const bass = Math.min(1, getBandLevel(bassMin, bassMax) * sensitivity);
    const mids = Math.min(1, getBandLevel(midsMin, midsMax) * sensitivity);
    const highs = Math.min(1, getBandLevel(highsMin, highsMax) * sensitivity);
    const level = Math.min(1, ((bass * 0.5) + (mids * 0.3) + (highs * 0.2)));

    return { bass, mids, highs, level };
}

function getSpectralCentroid() {
    if (!audioAnalyser || !audioFrequencyData || !audioContext || audioElement.paused) return 0.5;
    let weighted = 0;
    let total = 0;
    for (let i = 0; i < audioFrequencyData.length; i++) {
        const magnitude = audioFrequencyData[i] / 255;
        weighted += i * magnitude;
        total += magnitude;
    }
    if (total <= 1e-6) return 0.5;
    return Math.max(0, Math.min(1, (weighted / total) / Math.max(1, audioFrequencyData.length - 1)));
}

async function toggleAudioPlayback() {
    if (!audioElement.src) {
        audioFileInput.click();
        return;
    }

    ensureAudioAnalyser();
    if (audioContext?.state === 'suspended') await audioContext.resume();

    if (audioElement.paused) {
        await audioElement.play();
        audioInfo.status = 'Playing';
    } else {
        audioElement.pause();
        audioInfo.status = 'Paused';
    }
    refreshAudioInfo();
}

async function loadAudioFile(file) {
    if (!file) return;

    const progressLabel = `Audio · ${file.name}`;
    updateLoadProgress('audio', 0, progressLabel);
    audioInfo.name = file.name;
    audioInfo.type = file.type || 'Unknown';
    audioInfo.size = formatBytes(file.size);
    audioInfo.decode = 'Loading…';
    audioInfo.status = 'Loading audio…';
    refreshAudioInfo();

    try {
        const arrayBuffer = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.addEventListener('progress', (event) => {
                if (event.lengthComputable && event.total > 0) {
                    updateLoadProgress('audio', event.loaded / event.total, progressLabel);
                }
            });
            reader.addEventListener('load', () => resolve(reader.result), { once: true });
            reader.addEventListener('error', () => reject(reader.error || new Error('Audio file read failed.')), { once: true });
            reader.addEventListener('abort', () => reject(new Error('Audio file read was cancelled.')), { once: true });
            reader.readAsArrayBuffer(file);
        });

        ensureAudioAnalyser();
        if (audioContext?.state === 'suspended') await audioContext.resume();

        try {
            decodedAudioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
            audioInfo.duration = formatTime(decodedAudioBuffer.duration, true);
            audioInfo.sampleRate = `${decodedAudioBuffer.sampleRate.toLocaleString()} Hz`;
            audioInfo.channels = String(decodedAudioBuffer.numberOfChannels);
            audioInfo.decode = 'Ready';
            loopSettings.start = 0;
            loopSettings.end = decodedAudioBuffer.duration;
        } catch (decodeError) {
            console.warn('Audio metadata decode failed; playback can still continue.', decodeError);
            decodedAudioBuffer = null;
            audioInfo.decode = 'Playback only';
        }

        if (audioObjectUrl) URL.revokeObjectURL(audioObjectUrl);
        audioObjectUrl = URL.createObjectURL(file);
        audioElement.src = audioObjectUrl;
        audioElement.load();
        audioInfo.seekPercent = 0;
        audioInfo.status = 'Ready';
        completeLoadProgress('audio', progressLabel);
        refreshAudioInfo();
        await audioElement.play();
        audioInfo.status = 'Playing';
        refreshAudioInfo();
    } catch (error) {
        console.error(error);
        audioInfo.decode = 'Failed';
        audioInfo.status = 'Audio load failed';
        refreshAudioInfo();
        failLoadProgress('audio', 'Audio load failed');
    }
}

audioFileInput.addEventListener('change', async () => {
    const file = audioFileInput.files?.[0];
    await loadAudioFile(file);
    audioFileInput.value = '';
});

window.addEventListener('dragover', (event) => {
    if ([...event.dataTransfer.types].includes('Files')) event.preventDefault();
});
window.addEventListener('drop', (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    event.preventDefault();
    if (file.type.startsWith('audio/') || /\.(wav|mp3|m4a|aac|ogg|flac)$/i.test(file.name)) {
        void loadAudioFile(file);
    }
});


function updateAudioLoopMode() {
    const duration = audioElement.duration || decodedAudioBuffer?.duration || 0;
    const fullTrack = duration > 0 && loopSettings.start <= 0.001 && loopSettings.end >= duration - 0.001;
    audioElement.loop = Boolean(loopSettings.enabled && fullTrack);
}

function snapLoopTime(seconds) {
    if (!loopSettings.snapToBeats) return seconds;
    const beat = 60 / Math.max(1, loopSettings.bpm);
    return Math.round(seconds / beat) * beat;
}

function applyLoopBars() {
    const duration = audioElement.duration || decodedAudioBuffer?.duration || 0;
    if (!duration) return;
    loopSettings.start = Math.max(0, Math.min(duration, snapLoopTime(loopSettings.start)));
    const barSeconds = (60 / Math.max(1, loopSettings.bpm)) * 4;
    loopSettings.end = Math.min(duration, loopSettings.start + Math.max(1, loopSettings.bars) * barSeconds);
    updateAudioLoopMode();
    refreshAudioInfo();
}

function setFullTrackLoop() {
    const duration = audioElement.duration || decodedAudioBuffer?.duration || 0;
    if (!duration) return;
    loopSettings.start = 0;
    loopSettings.end = duration;
    updateAudioLoopMode();
    refreshAudioInfo();
}

async function detectLoopBpm() {
    if (!decodedAudioBuffer) return null;
    const OfflineContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OfflineContext) return null;

    const sampleRate = decodedAudioBuffer.sampleRate;
    const maxLength = Math.min(decodedAudioBuffer.length, sampleRate * 90);
    const mono = new Float32Array(maxLength);
    for (let channelIndex = 0; channelIndex < decodedAudioBuffer.numberOfChannels; channelIndex++) {
        const channel = decodedAudioBuffer.getChannelData(channelIndex);
        for (let i = 0; i < maxLength; i++) mono[i] += channel[i];
    }
    if (decodedAudioBuffer.numberOfChannels > 1) {
        const mixScale = 1 / decodedAudioBuffer.numberOfChannels;
        for (let i = 0; i < maxLength; i++) mono[i] *= mixScale;
    }

    const offline = new OfflineContext(1, maxLength, sampleRate);
    const buffer = offline.createBuffer(1, maxLength, sampleRate);
    buffer.getChannelData(0).set(mono);
    const source = offline.createBufferSource();
    source.buffer = buffer;
    const lowPass = offline.createBiquadFilter();
    lowPass.type = 'lowpass';
    lowPass.frequency.value = 180;
    source.connect(lowPass);
    lowPass.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    const filtered = rendered.getChannelData(0);

    const hop = 512;
    const frames = Math.floor(filtered.length / hop);
    if (frames < 8) return null;
    const energy = new Float32Array(frames);
    let maxEnergy = 0;
    for (let frame = 0; frame < frames; frame++) {
        let sum = 0;
        const offset = frame * hop;
        for (let i = 0; i < hop; i++) {
            const sample = filtered[offset + i];
            sum += sample * sample;
        }
        energy[frame] = sum;
        maxEnergy = Math.max(maxEnergy, sum);
    }
    if (maxEnergy <= 0) return null;
    for (let i = 0; i < energy.length; i++) energy[i] /= maxEnergy;

    const fps = sampleRate / hop;
    const minLag = Math.max(2, Math.floor(fps * 60 / 200));
    const maxLag = Math.min(frames - 1, Math.ceil(fps * 60 / 60));
    let bestLag = minLag;
    let best = -Infinity;
    for (let lag = minLag; lag <= maxLag; lag++) {
        let corr = 0;
        for (let i = 0; i < frames - lag; i++) corr += energy[i] * energy[i + lag];
        if (corr > best) {
            best = corr;
            bestLag = lag;
        }
    }
    let bpm = Math.round((60 * fps) / bestLag);
    while (bpm < 70) bpm *= 2;
    while (bpm > 180) bpm = Math.round(bpm / 2);
    return bpm;
}

audioElement.addEventListener('loadedmetadata', () => {
    if (Number.isFinite(audioElement.duration)) {
        audioInfo.duration = formatTime(audioElement.duration, true);
        if (!loopSettings.end) loopSettings.end = audioElement.duration;
    }
    refreshAudioInfo();
});

audioElement.addEventListener('timeupdate', () => {
    const duration = audioElement.duration || 0;
    audioInfo.currentTime = formatTime(audioElement.currentTime);
    audioInfo.seekPercent = duration > 0 ? (audioElement.currentTime / duration) * 100 : 0;

    if (loopSettings.enabled && duration > 0) {
        const start = Math.max(0, Math.min(duration, loopSettings.start));
        const end = Math.max(start + 0.01, Math.min(duration, loopSettings.end || duration));
        const partial = start > 0.001 || end < duration - 0.001;
        if (partial && audioElement.currentTime >= end - 0.02) {
            audioElement.currentTime = start;
            if (!audioElement.paused) void audioElement.play();
        }
    }
    refreshAudioInfo();
});

audioElement.addEventListener('ended', () => {
    if (loopSettings.enabled) {
        audioElement.currentTime = Math.max(0, loopSettings.start);
        void audioElement.play();
    }
});



const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(256);
const cubeCamera = new THREE.CubeCamera(0.1, 500, cubeRenderTarget);
//let lightProbe = new THREE.LightProbe();
let cubeTextureUrls;
let cubeTexture;


function generateCubeUrls(prefix, postfix) {
    return [
        prefix + 'posx' + postfix, prefix + 'negx' + postfix,
        prefix + 'posy' + postfix, prefix + 'negy' + postfix,
        prefix + 'posz' + postfix, prefix + 'negz' + postfix
    ];
}


const cubeMap2Url = new URL('../assets/cubeMap2/', import.meta.url).href;

const backgroundPresets = {
    'Original': { type: 'cube', prefix: cubeMap2Url, postfix: '.png' },
    'Football Field 2': { type: 'cube', prefix: new URL('../assets/backgrounds/Footballfield2/', import.meta.url).href, postfix: '.jpg' },
    'Swedish Royal Castle': { type: 'cube', prefix: new URL('../assets/backgrounds/SwedishRoyalCastle/', import.meta.url).href, postfix: '.jpg' },
    'Creek': { type: 'cube', prefix: new URL('../assets/backgrounds/Creek/', import.meta.url).href, postfix: '.jpg' },
    'Grass': { type: 'image', url: new URL('../assets/backgrounds/Grass/Grass.jpg', import.meta.url).href },
    'Stones': { type: 'image', url: new URL('../assets/backgrounds/Stones/Stones.jpg', import.meta.url).href },
    'Ryfjallet': { type: 'cube', prefix: new URL('../assets/backgrounds/Ryfjallet/', import.meta.url).href, postfix: '.jpg' },
    'Ice River': { type: 'cube', prefix: new URL('../assets/backgrounds/IceRiver/', import.meta.url).href, postfix: '.jpg' },
    'Hornstulls Strand': { type: 'cube', prefix: new URL('../assets/backgrounds/HornstullsStrand/', import.meta.url).href, postfix: '.jpg' },
    'Tantolunden': { type: 'cube', prefix: new URL('../assets/backgrounds/Tantolunden/', import.meta.url).href, postfix: '.jpg' },
    'Vindelalven': { type: 'cube', prefix: new URL('../assets/backgrounds/Vindelalven/', import.meta.url).href, postfix: '.jpg' },
    'Yokohama 3': { type: 'cube', prefix: new URL('../assets/backgrounds/Yokohama3/', import.meta.url).href, postfix: '.jpg' },
    'Milky Way': { type: 'equirect', url: new URL('../assets/backgrounds/8k_stars_milky_way.jpg', import.meta.url).href },
    'Stars': { type: 'equirect', url: new URL('../assets/backgrounds/8k_stars.jpg', import.meta.url).href },
};
const backgroundNames = Object.keys(backgroundPresets);
const backgroundTextureCache = new Map();
let defaultEnvironmentTexture = null;
let activeBackgroundTexture = null;


async function loadBackground(name) {
    const preset = backgroundPresets[name];
    if (!preset) return;

    const progressLabel = `Background · ${name}`;
    let texture = backgroundTextureCache.get(name);

    try {
        if (!texture) {
            updateLoadProgress('background', 0, progressLabel);

            const manager = new THREE.LoadingManager();
            manager.onProgress = (_url, itemsLoaded, itemsTotal) => {
                if (itemsTotal > 0) {
                    updateLoadProgress('background', itemsLoaded / itemsTotal, progressLabel);
                }
            };
            manager.onError = () => {
                failLoadProgress('background', `Background failed · ${name}`);
            };

            if (preset.type === 'cube') {
                cubeTextureUrls = generateCubeUrls(preset.prefix, preset.postfix);
                texture = await new THREE.CubeTextureLoader(manager).loadAsync(cubeTextureUrls);
            } else {
                texture = await new THREE.TextureLoader(manager).loadAsync(preset.url);
                if (preset.type === 'equirect') {
                    texture.mapping = THREE.EquirectangularReflectionMapping;
                }
            }
            texture.colorSpace = THREE.SRGBColorSpace;
            backgroundTextureCache.set(name, texture);
            completeLoadProgress('background', progressLabel);
        }

        if (name === 'Original' && preset.type === 'cube' && !defaultEnvironmentTexture) {
            defaultEnvironmentTexture = texture;
        }

        activeBackgroundTexture = texture;
        currentBackgroundName = name;
        scene.background = texture;
        if (preset.type === 'cube') {
            cubeTexture = texture;
            scene.environment = texture;
        } else if (preset.type === 'equirect') {
            scene.environment = texture;
        } else {
            scene.environment = defaultEnvironmentTexture || cubeTexture;
        }

        cubeCamera.update(re, scene);
        document.body.classList.remove("loading");
    } catch (error) {
        console.error(error);
        failLoadProgress('background', `Background failed · ${name}`);
        document.body.classList.remove("loading");
    }
}


async function loadTextures() {
    await loadBackground('Original');
    //lightProbe = await LightProbeGenerator.fromCubeRenderTarget(re, cubeRenderTarget);
    //scene.add(lightProbe);
}


loadTextures();


let segments1 = isMobileDevice() ? 90 : 140;
let segments2 = isMobileDevice() ? 18 : 32;

const sphere = new THREE.SphereGeometry(4.5, segments1, segments1);
const teaPot = new TeapotGeometry(3, segments2);
const torus = new THREE.TorusGeometry(3, 1.5, segments1, segments1);
const torusKnot = new THREE.TorusKnotGeometry(2.5, 0.8, segments1, segments1);
const polyDetail = isMobileDevice() ? 2 : 3;
const boxSegments = isMobileDevice() ? 18 : 32;
const radialSegments = isMobileDevice() ? 48 : 72;
const heightSegments = isMobileDevice() ? 18 : 32;
const icosahedron = new THREE.IcosahedronGeometry(4.5, polyDetail);
const dodecahedron = new THREE.DodecahedronGeometry(4.5, polyDetail);
const octahedron = new THREE.OctahedronGeometry(4.5, polyDetail + 1);
const cube = new THREE.BoxGeometry(7.2, 7.2, 7.2, boxSegments, boxSegments, boxSegments);
const cylinder = new THREE.CylinderGeometry(3.5, 3.5, 7.0, radialSegments, heightSegments, false);
const cone = new THREE.ConeGeometry(4.0, 7.5, radialSegments, heightSegments, false);

let geoNames = [
    "Sphere",
    "TorusKnot",
    "Tea Pot",
    "Torus",
    "Icosahedron",
    "Dodecahedron",
    "Octahedron",
    "Cube",
    "Cylinder",
    "Cone",
];
let geometries = [
    sphere,
    torusKnot,
    teaPot,
    torus,
    icosahedron,
    dodecahedron,
    octahedron,
    cube,
    cylinder,
    cone,
];



let particleTexture;
particleTexture = new THREE.TextureLoader().load(new URL('../assets/particle.png', import.meta.url).href)


let mesh;
let meshGeo;

meshGeo = geometries[0];
const phyMat = new THREE.MeshPhysicalMaterial();
phyMat.color = new THREE.Color(0x636363);
phyMat.metalness = 2.0;
phyMat.roughness = 0.0;
phyMat.side = THREE.DoubleSide;


const dissolveUniformData = {
    uEdgeColor: {
        value: new THREE.Color(0x4d9bff),
    },
    uFreq: {
        value: 0.25,
    },
    uAmp: {
        value: 16.0
    },
    uProgress: {
        value: -7.0
    },
    uEdge: {
        value: 0.8
    }
}

function setupUniforms(shader, uniforms) {
    const keys = Object.keys(uniforms);
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        shader.uniforms[key] = uniforms[key];
    }
}

function setupDissolveShader(shader) {
    // Keep the original mesh geometry intact. Audio now changes the mesh size
    // uniformly from low-frequency magnitude rather than distorting vertices.
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
        varying vec3 vPos;
    `);

    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vPos = transformed;
    `);

    // fragment shader snippet outside main
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
        varying vec3 vPos;

        uniform float uFreq;
        uniform float uAmp;
        uniform float uProgress;
        uniform float uEdge;
        uniform vec3 uEdgeColor;

        ${snoise}
    `);

    // fragment shader snippet inside main
    shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>

        float noise = snoise(vPos * uFreq) * uAmp; // calculate snoise in fragment shader for smooth dissolve edges

        if(noise < uProgress) discard; // discard any fragment where noise is lower than progress

        float edgeWidth = uProgress + uEdge;

        if(noise > uProgress && noise < edgeWidth){
            gl_FragColor = vec4(vec3(uEdgeColor),noise); // colors the edge
        }else{
            gl_FragColor = vec4(gl_FragColor.xyz,1.0);
        }
    `);

}


phyMat.onBeforeCompile = (shader) => {
    setupUniforms(shader, dissolveUniformData);
    setupDissolveShader(shader);
}


mesh = new THREE.Mesh(meshGeo, phyMat);
scene.add(mesh);


let particleMesh;
let particleMat = new THREE.ShaderMaterial();
particleMat.transparent = true;
particleMat.blending = THREE.AdditiveBlending;
let particleCount = meshGeo.attributes.position.count;
let particleMaxOffsetArr; // -- how far a particle can go from its initial position 
let particleInitPosArr; // store the initial position of the particles -- particle position will reset here if it exceed maxoffset
let particleCurrPosArr; // use to update he position of the particle 
let particleVelocityArr; // velocity of each particle
let particleDistArr;
let particleRotationArr;
let particleData = {
    particleSpeedFactor: 0.02, // for tweaking velocity 
    velocityFactor: { x: 2.5, y: 2 },
    waveAmplitude: 0,
}


function initParticleAttributes(meshGeo) {
    particleCount = meshGeo.attributes.position.count;
    particleMaxOffsetArr = new Float32Array(particleCount);
    particleInitPosArr = new Float32Array(meshGeo.getAttribute('position').array);
    particleCurrPosArr = new Float32Array(meshGeo.getAttribute('position').array);
    particleVelocityArr = new Float32Array(particleCount * 3);
    particleDistArr = new Float32Array(particleCount);
    particleRotationArr = new Float32Array(particleCount);


    for (let i = 0; i < particleCount; i++) {
        let x = i * 3 + 0;
        let y = i * 3 + 1;
        let z = i * 3 + 2;

        particleMaxOffsetArr[i] = Math.random() * 5.5 + 1.5;

        particleVelocityArr[x] = Math.random() * 0.5 + 0.5;
        particleVelocityArr[y] = Math.random() * 0.5 + 0.5;
        particleVelocityArr[z] = Math.random() * 0.1;

        particleDistArr[i] = 0.001;
        particleRotationArr[i] = Math.random() * Math.PI * 2;

    }

    meshGeo.setAttribute('aOffset', new THREE.BufferAttribute(particleMaxOffsetArr, 1));
    meshGeo.setAttribute('aCurrentPos', new THREE.BufferAttribute(particleCurrPosArr, 3).setUsage(THREE.DynamicDrawUsage));
    meshGeo.setAttribute('aVelocity', new THREE.BufferAttribute(particleVelocityArr, 3));
    meshGeo.setAttribute('aDist', new THREE.BufferAttribute(particleDistArr, 1).setUsage(THREE.DynamicDrawUsage));
    meshGeo.setAttribute('aAngle', new THREE.BufferAttribute(particleRotationArr, 1).setUsage(THREE.DynamicDrawUsage));
}


function updateParticleAttributes() {
    const speed = Math.abs(particleData.particleSpeedFactor);
    const velocityX = particleData.velocityFactor.x;
    const velocityY = particleData.velocityFactor.y;
    const waveAmplitude = particleData.waveAmplitude;

    for (let i = 0; i < particleCount; i++) {
        const x = i * 3;
        const y = x + 1;
        const z = x + 2;

        const posx = particleCurrPosArr[x];
        const posy = particleCurrPosArr[y];

        const xwave =
            Math.sin(posy * 2) * (0.8 + waveAmplitude) +
            Math.sin(posy * 5) * (0.2 + waveAmplitude) +
            Math.sin(posy * 8) * (0.8 + waveAmplitude) +
            Math.sin(posy * 3) * (0.8 + waveAmplitude);
        const ywave =
            Math.sin(posx * 2) * (0.6 + waveAmplitude) +
            Math.sin(posx) * (0.9 + waveAmplitude) +
            Math.sin(posx * 5) * (0.6 + waveAmplitude) +
            Math.sin(posx * 7) * (0.6 + waveAmplitude);

        const vx = (particleVelocityArr[x] * velocityX + xwave) * speed;
        const vy = (particleVelocityArr[y] * velocityY + ywave) * speed;
        const vz = particleVelocityArr[z] * speed;

        particleCurrPosArr[x] += vx;
        particleCurrPosArr[y] += vy;
        particleCurrPosArr[z] += vz;

        const dx = particleCurrPosArr[x] - particleInitPosArr[x];
        const dy = particleCurrPosArr[y] - particleInitPosArr[y];
        const dz = particleCurrPosArr[z] - particleInitPosArr[z];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        particleDistArr[i] = dist;
        particleRotationArr[i] += 0.01;

        if (dist > particleMaxOffsetArr[i]) {
            particleCurrPosArr[x] = particleInitPosArr[x];
            particleCurrPosArr[y] = particleInitPosArr[y];
            particleCurrPosArr[z] = particleInitPosArr[z];
            particleDistArr[i] = 0.001;
        }
    }

    meshGeo.getAttribute('aCurrentPos').needsUpdate = true;
    meshGeo.getAttribute('aDist').needsUpdate = true;
    meshGeo.getAttribute('aAngle').needsUpdate = true;
}


initParticleAttributes(meshGeo);


const particlesUniformData = {
    uTexture: {
        value: particleTexture,
    },
    uPixelDensity: {
        value: re.getPixelRatio()
    },
    uProgress: dissolveUniformData.uProgress,
    uEdge: dissolveUniformData.uEdge,
    uAmp: dissolveUniformData.uAmp,
    uFreq: dissolveUniformData.uFreq,
    uBaseSize: {
        value: isMobileDevice() ? 40 : 80,
    },
    uColor: {
        value: new THREE.Color(0x4d9bff),
    }
}

particleMat.uniforms = particlesUniformData;

particleMat.vertexShader = `

    ${snoise}

    uniform float uPixelDensity;
    uniform float uBaseSize;
    uniform float uFreq;
    uniform float uAmp;
    uniform float uEdge;
    uniform float uProgress;

    varying float vNoise;
    varying float vAngle;

    attribute vec3 aCurrentPos;
    attribute float aDist;
    attribute float aAngle;

    void main() {
        vec3 pos = position;

        float noise = snoise(pos * uFreq) * uAmp;
        vNoise =noise;

        vAngle = aAngle;

        if( vNoise > uProgress-2.0 && vNoise < uProgress + uEdge+2.0){
            pos = aCurrentPos;
        }

        vec4 modelPosition = modelMatrix * vec4(pos, 1.0);
        vec4 viewPosition = viewMatrix * modelPosition;
        vec4 projectedPosition = projectionMatrix * viewPosition;
        gl_Position = projectedPosition;

        float size = uBaseSize * uPixelDensity;
        size = size  / (aDist + 1.0);
        gl_PointSize = size / -viewPosition.z;
}
`;

particleMat.fragmentShader = `
    uniform vec3 uColor;
    uniform float uEdge;
    uniform float uProgress;
    uniform sampler2D uTexture;

    varying float vNoise;
    varying float vAngle;

    void main(){
        if( vNoise < uProgress ) discard;
        if( vNoise > uProgress + uEdge) discard;

        vec2 coord = gl_PointCoord;
        coord = coord - 0.5; // get the coordinate from 0-1 ot -0.5 to 0.5
        coord = coord * mat2(cos(vAngle),sin(vAngle) , -sin(vAngle), cos(vAngle)); // apply the rotation transformaion
        coord = coord +  0.5; // reset the coordinate to 0-1  

        vec4 texture = texture2D(uTexture,coord);

        gl_FragColor = vec4(vec3(uColor.xyz * texture.xyz),1.0);
    }
`;


particleMesh = new THREE.Points(meshGeo, particleMat);
scene.add(particleMesh);


function resizeRendererToDisplaySize() {
    const width = exportOverrideSize ? exportOverrideSize.width : cnvs.clientWidth * scale;
    const height = exportOverrideSize ? exportOverrideSize.height : cnvs.clientHeight * scale;
    const needResize = cnvs.width !== width || cnvs.height !== height;
    if (needResize) {
        re.setSize(width, height, false);

        renderPass.setSize(width, height);
        outPass.setSize(width, height);
        unrealBloomPass.setSize(width, height);

        effectComposer1.setSize(width, height);
        effectComposer2.setSize(width, height);
    }

    return needResize;
}


let tweaks = {
    x: 0,
    z: 0,

    dissolveProgress: dissolveUniformData.uProgress.value,
    edgeWidth: dissolveUniformData.uEdge.value,
    amplitude: dissolveUniformData.uAmp.value,
    frequency: dissolveUniformData.uFreq.value,
    meshVisible: true,
    meshColor: "#" + phyMat.color.getHexString(),
    edgeColor: "#" + dissolveUniformData.uEdgeColor.value.getHexString(),
    autoDissolve: false,

    particleVisible: true,
    particleBaseSize: particlesUniformData.uBaseSize.value,
    particleColor: "#" + particlesUniformData.uColor.value.getHexString(),
    particleSpeedFactor: particleData.particleSpeedFactor,
    velocityFactor: particleData.velocityFactor,
    waveAmplitude: particleData.waveAmplitude,

    bloomStrength: unrealBloomPass.strength,
    rotationY: mesh.rotation.y,
};


function createTweakList(container, name, keys, vals) {
    const opts = [];
    for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        const v = vals[i];
        opts.push({ text: k, value: v });
    }

    return container.addBlade({
        view: 'list', label: name,
        options: opts,
        value: vals[0]
    });
}


let currentMeshName = geoNames[0];
let currentBackgroundName = 'Original';

function handleMeshChange(geo, name = null) {
    scene.remove(mesh);
    scene.remove(particleMesh);

    meshGeo = geo;
    mesh = new THREE.Mesh(geo, phyMat);

    initParticleAttributes(geo);
    particleMesh = new THREE.Points(geo, particleMat);
    mesh.visible = tweaks?.meshVisible ?? true;
    particleMesh.visible = tweaks?.particleVisible ?? true;
    if (tweaks) {
        mesh.rotation.y = particleMesh.rotation.y = tweaks.rotationY;
    }

    scene.add(mesh);
    scene.add(particleMesh);
    if (name) currentMeshName = name;
}



const viewportSettings = {
    format: 'Fill Window',
};
const viewportAspects = {
    'Fill Window': null,
    'Landscape — 16:9': 16 / 9,
    'Square — 1:1': 1,
    'Portrait — 9:16': 9 / 16,
};

function getViewportAspect() {
    return viewportAspects[viewportSettings.format] || (window.innerWidth / Math.max(1, window.innerHeight));
}

function fitViewport() {
    const aspect = viewportAspects[viewportSettings.format];
    if (!aspect) {
        cnvs.classList.remove('viewport-framed');
        cnvs.style.width = '100vw';
        cnvs.style.height = '100vh';
        return;
    }
    let width = window.innerWidth;
    let height = window.innerHeight;
    if (width / height > aspect) width = height * aspect;
    else height = width / aspect;
    cnvs.classList.add('viewport-framed');
    cnvs.style.width = `${Math.max(1, Math.floor(width))}px`;
    cnvs.style.height = `${Math.max(1, Math.floor(height))}px`;
}

const cameraSettings = {
    preset: 'Static',
    autoRotate: false,
    autoRotateSpeed: 1.0,
    movementSpeed: 1.0,
    movementAmount: 1.0,
    distance: isMobileDevice() ? 18 : 14,
    elevation: isMobileDevice() ? 24 : 4,
    azimuth: 0,
    fov: 75,
    damping: true,
    mouseControls: true,
};
let cameraSettingsDirty = true;

function centerVisualization() {
    orbCtrls.target.set(0, 0, 0);
    cameraSettings.azimuth = 0;
    cameraSettings.elevation = isMobileDevice() ? 24 : 4;
    cameraSettings.distance = isMobileDevice() ? 18 : 14;
    cameraSettingsDirty = true;
    pane?.refresh();
}

function setCameraFromSpherical(distance, elevationDeg, azimuthDeg) {
    const elevation = THREE.MathUtils.degToRad(elevationDeg);
    const azimuth = THREE.MathUtils.degToRad(azimuthDeg);
    const horizontal = Math.cos(elevation) * distance;
    cam.position.set(
        Math.sin(azimuth) * horizontal,
        Math.sin(elevation) * distance,
        Math.cos(azimuth) * horizontal,
    );
    cam.lookAt(orbCtrls.target);
}

function updateCameraMotion(time, audio) {
    orbCtrls.enabled = cameraSettings.mouseControls;
    orbCtrls.enableDamping = cameraSettings.damping;
    orbCtrls.autoRotate = cameraSettings.autoRotate && cameraSettings.preset === 'Static';
    orbCtrls.autoRotateSpeed = cameraSettings.autoRotateSpeed;
    cam.fov = cameraSettings.fov;
    cam.updateProjectionMatrix();

    const preset = cameraSettings.preset;
    if (preset === 'Static') {
        if (cameraSettingsDirty) {
            setCameraFromSpherical(cameraSettings.distance, cameraSettings.elevation, cameraSettings.azimuth);
            cameraSettingsDirty = false;
        }
        orbCtrls.update();
        return;
    }

    const speed = cameraSettings.movementSpeed;
    const amount = cameraSettings.movementAmount;
    const t = time * speed;
    const distance = cameraSettings.distance;
    const baseElevation = THREE.MathUtils.degToRad(cameraSettings.elevation);
    const baseAzimuth = THREE.MathUtils.degToRad(cameraSettings.azimuth);
    const radius = distance * 0.42 * amount;
    let x = 0;
    let y = Math.sin(baseElevation) * distance;
    let z = Math.cos(baseElevation) * distance;

    switch (preset) {
        case 'Orbit': {
            const angle = t * 0.55 + baseAzimuth;
            x = Math.cos(angle) * radius;
            z = distance + Math.sin(angle) * radius * 0.25;
            break;
        }
        case 'Horizontal Orbit': {
            const angle = t * 0.42 + baseAzimuth;
            x = Math.sin(angle) * distance * amount;
            z = Math.cos(angle) * distance;
            break;
        }
        case 'Vertical Arc': {
            const angle = Math.sin(t * 0.38) * Math.PI * 0.34 * amount + baseElevation;
            x = Math.sin(baseAzimuth) * distance * 0.15;
            y = Math.sin(angle) * distance;
            z = Math.max(4, Math.cos(angle) * distance);
            break;
        }
        case 'Helix': {
            const angle = t * 0.4 + baseAzimuth;
            x = Math.sin(angle) * distance * amount;
            z = Math.cos(angle) * distance;
            y = Math.sin(t * 0.18) * distance * 0.3 * amount;
            break;
        }
        case 'Pendulum': {
            x = Math.sin(t * 0.52) * radius * 1.15;
            y = Math.sin(t * 0.26 + 0.8) * radius * 0.28;
            z = Math.max(4, distance + Math.cos(t * 0.52) * radius * 0.18);
            break;
        }
        case 'Cinematic Sweep': {
            x = Math.sin(t * 0.22) * radius * 1.35;
            y = Math.sin(t * 0.15 + 1.1) * radius * 0.42;
            z = Math.max(4, distance + Math.cos(t * 0.27) * radius * 0.34);
            break;
        }
        case 'Figure Eight': {
            const angle = t * 0.5;
            x = Math.sin(angle) * radius;
            y = Math.sin(angle * 2) * radius * 0.5;
            z = distance;
            break;
        }
        case 'Push / Pull': {
            z = Math.max(4, distance + Math.sin(t * 0.7) * distance * 0.35 * amount);
            break;
        }
        case 'Drift': {
            x = Math.sin(t * 0.42) * radius;
            y = Math.sin(t * 0.31 + 1.35) * radius * 0.6;
            z = Math.max(4, distance + Math.sin(t * 0.23 + 2.1) * radius * 0.45);
            break;
        }
        case 'Audio Follow': {
            const centroid = getSpectralCentroid();
            const energy = audio?.level || 0;
            const angle = baseAzimuth + (centroid - 0.5) * Math.PI * amount;
            x = Math.sin(angle) * distance;
            z = Math.cos(angle) * distance;
            y = Math.sin(baseElevation) * distance + (energy - 0.5) * distance * 0.15 * amount;
            break;
        }
        default:
            break;
    }

    if (cameraSettings.autoRotate) {
        const angle = t * 0.15 * cameraSettings.autoRotateSpeed;
        const rotatedX = x * Math.cos(angle) + z * Math.sin(angle);
        const rotatedZ = -x * Math.sin(angle) + z * Math.cos(angle);
        x = rotatedX;
        z = rotatedZ;
    }

    cam.position.set(x, y, z);
    cam.lookAt(orbCtrls.target);
    orbCtrls.update();
}

const exportSettings = {
    fileName: 'metallic-vis',
    resolution: '1080',
    frameRate: '60',
    bitrateMbps: '16',
    videoType: 'Auto',
    status: 'Idle',
};
let exportOverrideSize = null;
let mediaRecorder = null;
let recordedChunks = [];
let exportStopAt = null;
let exportPreviousLoop = false;

function getExportDimensions() {
    const shortSideMap = { '1080': 1080, '2K': 1440, '4K': 2160 };
    const shortSide = shortSideMap[exportSettings.resolution] || 1080;
    const aspect = getViewportAspect();
    let width;
    let height;
    if (aspect >= 1) {
        height = shortSide;
        width = Math.round(height * aspect);
    } else {
        width = shortSide;
        height = Math.round(width / aspect);
    }
    if (width % 2) width++;
    if (height % 2) height++;
    return { width, height };
}

function safeFileName(extension) {
    const base = (exportSettings.fileName || audioInfo.name.replace(/\.[^.]+$/, '') || 'metallic-vis')
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
        .trim() || 'metallic-vis';
    return `${base}.${extension}`;
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function renderCurrentFrame() {
    scene.background = blackColor;
    effectComposer1.render();
    scene.background = activeBackgroundTexture || cubeTexture || blackColor;
    effectComposer2.render();
}

async function exportPng() {
    const priorOverride = exportOverrideSize;
    exportOverrideSize = getExportDimensions();
    resizeRendererToDisplaySize();
    renderCurrentFrame();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const blob = await new Promise((resolve) => cnvs.toBlob(resolve, 'image/png'));
    exportOverrideSize = priorOverride;
    resizeRendererToDisplaySize();
    if (blob) downloadBlob(blob, safeFileName('png'));
}

function collectSettings() {
    return {
        version: 1,
        background: currentBackgroundName,
        mesh: currentMeshName,
        viewport: { ...viewportSettings },
        camera: { ...cameraSettings },
        audioReactive: { ...audioReactive },
        audioResolution: audioSettings.fftSize,
        loop: { ...loopSettings },
        dissolve: {
            dissolveProgress: tweaks.dissolveProgress,
            edgeWidth: tweaks.edgeWidth,
            amplitude: tweaks.amplitude,
            frequency: tweaks.frequency,
            meshVisible: tweaks.meshVisible,
            meshColor: tweaks.meshColor,
            edgeColor: tweaks.edgeColor,
            autoDissolve: tweaks.autoDissolve,
        },
        particle: {
            particleVisible: tweaks.particleVisible,
            particleBaseSize: tweaks.particleBaseSize,
            particleColor: tweaks.particleColor,
            particleSpeedFactor: tweaks.particleSpeedFactor,
            velocityFactor: { ...particleData.velocityFactor },
            waveAmplitude: tweaks.waveAmplitude,
        },
        bloomStrength: tweaks.bloomStrength,
        rotationY: tweaks.rotationY,
    };
}

function exportJson() {
    const blob = new Blob([JSON.stringify(collectSettings(), null, 2)], { type: 'application/json' });
    downloadBlob(blob, safeFileName('json'));
}

const importJsonInput = document.createElement('input');
importJsonInput.type = 'file';
importJsonInput.accept = 'application/json,.json';
importJsonInput.hidden = true;
document.body.appendChild(importJsonInput);

async function applyImportedSettings(data) {
    if (!data || typeof data !== 'object') throw new Error('Invalid settings file.');
    if (data.audioReactive) Object.assign(audioReactive, data.audioReactive);
    if (data.audioResolution) setAudioResolution(data.audioResolution);
    if (data.loop) Object.assign(loopSettings, data.loop);
    if (data.viewport) Object.assign(viewportSettings, data.viewport);
    if (data.camera) Object.assign(cameraSettings, data.camera);
    if (data.dissolve) {
        Object.assign(tweaks, data.dissolve);
        dissolveUniformData.uProgress.value = tweaks.dissolveProgress;
        dissolveUniformData.uEdge.value = tweaks.edgeWidth;
        dissolveUniformData.uAmp.value = tweaks.amplitude;
        dissolveUniformData.uFreq.value = tweaks.frequency;
        phyMat.color.set(tweaks.meshColor);
        dissolveUniformData.uEdgeColor.value.set(tweaks.edgeColor);
        mesh.visible = tweaks.meshVisible;
    }
    if (data.particle) {
        Object.assign(tweaks, data.particle);
        particlesUniformData.uBaseSize.value = tweaks.particleBaseSize;
        particlesUniformData.uColor.value.set(tweaks.particleColor);
        particleData.particleSpeedFactor = tweaks.particleSpeedFactor;
        particleData.waveAmplitude = tweaks.waveAmplitude;
        if (data.particle.velocityFactor) Object.assign(particleData.velocityFactor, data.particle.velocityFactor);
        particleMesh.visible = tweaks.particleVisible;
    }
    if (Number.isFinite(data.bloomStrength)) {
        tweaks.bloomStrength = data.bloomStrength;
        unrealBloomPass.strength = data.bloomStrength;
    }
    if (Number.isFinite(data.rotationY)) {
        tweaks.rotationY = data.rotationY;
        mesh.rotation.y = particleMesh.rotation.y = data.rotationY;
    }
    if (data.background && backgroundPresets[data.background]) await loadBackground(data.background);
    if (data.mesh && geoNames.includes(data.mesh)) handleMeshChange(geometries[geoNames.indexOf(data.mesh)], data.mesh);
    fitViewport();
    cameraSettingsDirty = true;
    updateAudioLoopMode();
    pane.refresh();
}

importJsonInput.addEventListener('change', async () => {
    const file = importJsonInput.files?.[0];
    if (!file) return;
    try {
        await applyImportedSettings(JSON.parse(await file.text()));
        exportSettings.status = 'Settings imported';
    } catch (error) {
        console.error(error);
        exportSettings.status = 'Import failed';
    } finally {
        importJsonInput.value = '';
        pane.refresh();
    }
});

function chooseRecordingMimeType() {
    const requested = exportSettings.videoType;
    const candidates = requested === 'MP4'
        ? ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4']
        : requested === 'WebM'
            ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
            : ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

function stopVideoExport() {
    if (mediaRecorder?.state === 'recording') mediaRecorder.stop();
}

async function startVideoExport() {
    if (mediaRecorder?.state === 'recording') {
        stopVideoExport();
        return;
    }
    if (!audioElement.src) {
        exportSettings.status = 'Load audio before video export';
        pane.refresh();
        return;
    }
    if (!window.MediaRecorder || !cnvs.captureStream) {
        exportSettings.status = 'Video export unsupported';
        pane.refresh();
        return;
    }

    ensureAudioAnalyser();
    if (audioContext.state === 'suspended') await audioContext.resume();
    exportOverrideSize = getExportDimensions();
    resizeRendererToDisplaySize();

    const frameRate = Number(exportSettings.frameRate) || 60;
    const canvasStream = cnvs.captureStream(frameRate);
    const tracks = [...canvasStream.getVideoTracks()];
    if (recordingDestination?.stream?.getAudioTracks().length) {
        tracks.push(...recordingDestination.stream.getAudioTracks());
    }
    const stream = new MediaStream(tracks);
    const mimeType = chooseRecordingMimeType();
    const options = {
        videoBitsPerSecond: Math.max(1, Number(exportSettings.bitrateMbps) || 16) * 1_000_000,
    };
    if (mimeType) options.mimeType = mimeType;

    recordedChunks = [];
    mediaRecorder = new MediaRecorder(stream, options);
    mediaRecorder.addEventListener('dataavailable', (event) => {
        if (event.data?.size) recordedChunks.push(event.data);
    });
    mediaRecorder.addEventListener('stop', () => {
        const type = mediaRecorder.mimeType || mimeType || 'video/webm';
        const extension = type.includes('mp4') ? 'mp4' : 'webm';
        if (recordedChunks.length) downloadBlob(new Blob(recordedChunks, { type }), safeFileName(extension));
        exportOverrideSize = null;
        resizeRendererToDisplaySize();
        exportSettings.status = 'Video exported';
        mediaRecorder = null;
        exportStopAt = null;
        loopSettings.enabled = exportPreviousLoop;
        updateAudioLoopMode();
        pane.refresh();
    });

    const duration = audioElement.duration || 0;
    const useLoopRange = loopSettings.enabled && duration > 0;
    const start = useLoopRange ? Math.max(0, loopSettings.start) : 0;
    const end = useLoopRange ? Math.min(duration, loopSettings.end || duration) : duration;
    exportPreviousLoop = loopSettings.enabled;
    loopSettings.enabled = false;
    updateAudioLoopMode();
    audioElement.currentTime = start;
    exportStopAt = end;
    exportSettings.status = 'Exporting video…';
    mediaRecorder.start(500);
    await audioElement.play();
    pane.refresh();
}

fitViewport();
window.addEventListener('resize', () => fitViewport());

const controlsContainer = document.getElementById('controls');
if (!controlsContainer) throw new Error('Controls container was not found.');

let pane = null;
let meshBlade = null;
let progressBinding = null;
let fpsBinding = null;
const performanceStats = { fps: 0 };
let fpsFrameCount = 0;
let fpsSampleStart = performance.now();

async function loadPaneConstructor() {
    const sources = [
        'https://cdn.jsdelivr.net/npm/tweakpane@4.0.5/dist/tweakpane.min.js',
        'https://cdn.jsdelivr.net/npm/tweakpane@4.0.5/+esm',
        'https://unpkg.com/tweakpane@4.0.5/dist/tweakpane.min.js',
    ];
    let lastError = null;
    for (const source of sources) {
        try {
            const module = await import(source);
            if (typeof module.Pane === 'function') return module.Pane;
        } catch (error) {
            lastError = error;
            console.warn(`Tweakpane failed to load from ${source}`, error);
        }
    }
    throw lastError || new Error('Tweakpane could not be loaded.');
}

async function initControls() {
    try {
        const Pane = await loadPaneConstructor();
        pane = new Pane({
            title: 'Controls',
            expanded: true,
            container: controlsContainer,
        });
        const controller = pane;
        fpsBinding = controller.addBinding(performanceStats, 'fps', { label: 'FPS', readonly: true });

        const audioFolder = controller.addFolder({ title: 'Audio Source', expanded: true });
        audioFolder.addButton({ title: 'Load Audio File' }).on('click', () => audioFileInput.click());
        audioFolder.addButton({ title: 'Play / Pause' }).on('click', () => { void toggleAudioPlayback(); });

        audioInfoBindings = [
            audioFolder.addBinding(audioInfo, 'name', { label: 'Name', readonly: true }),
            audioFolder.addBinding(audioInfo, 'type', { label: 'Type', readonly: true }),
            audioFolder.addBinding(audioInfo, 'size', { label: 'Size', readonly: true }),
            audioFolder.addBinding(audioInfo, 'duration', { label: 'Duration', readonly: true }),
            audioFolder.addBinding(audioInfo, 'sampleRate', { label: 'Sample Rate', readonly: true }),
            audioFolder.addBinding(audioInfo, 'channels', { label: 'Channels', readonly: true }),
            audioFolder.addBinding(audioInfo, 'decode', { label: 'Decode', readonly: true }),
            audioFolder.addBinding(audioInfo, 'status', { label: 'Status', readonly: true }),
            audioFolder.addBinding(audioInfo, 'currentTime', { label: 'Time', readonly: true }),
        ];
        seekBinding = audioFolder.addBinding(audioInfo, 'seekPercent', { min: 0, max: 100, step: 0.1, label: 'Seek %' }).on('change', (event) => {
            const duration = audioElement.duration || 0;
            if (duration > 0) audioElement.currentTime = duration * (event.value / 100);
        });
        audioFolder.addBinding(audioInfo, 'volume', { min: 0, max: 100, step: 1, label: 'Volume' }).on('change', (event) => {
            audioElement.volume = event.value / 100;
        });
        audioFolder.addBinding(audioInfo, 'muted', { label: 'Mute' }).on('change', (event) => {
            audioElement.muted = event.value;
        });

        const loopFolder = audioFolder.addFolder({ title: 'Loop', expanded: false });
        loopBindings = [
            loopFolder.addBinding(loopSettings, 'enabled', { label: 'Loop' }).on('change', () => updateAudioLoopMode()),
            loopFolder.addBinding(loopSettings, 'start', { min: 0, max: 7200, step: 0.001, label: 'Start (s)' }).on('change', (event) => {
                loopSettings.start = Math.max(0, snapLoopTime(event.value));
                if (loopSettings.end <= loopSettings.start) loopSettings.end = loopSettings.start + 0.05;
                updateAudioLoopMode();
                refreshAudioInfo();
            }),
            loopFolder.addBinding(loopSettings, 'end', { min: 0, max: 7200, step: 0.001, label: 'End (s)' }).on('change', (event) => {
                const duration = audioElement.duration || event.value;
                loopSettings.end = Math.min(duration, Math.max(loopSettings.start + 0.05, snapLoopTime(event.value)));
                updateAudioLoopMode();
                refreshAudioInfo();
            }),
            loopFolder.addBinding(loopSettings, 'bpm', { min: 40, max: 300, step: 1, label: 'BPM' }).on('change', () => applyLoopBars()),
            loopFolder.addBinding(loopSettings, 'bars', { min: 1, max: 999, step: 1, label: 'Bars' }).on('change', () => applyLoopBars()),
            loopFolder.addBinding(loopSettings, 'snapToBeats', { label: 'Snap to Beats' }),
        ];
        loopFolder.addButton({ title: 'Detect BPM' }).on('click', async () => {
            const bpm = await detectLoopBpm();
            if (bpm) {
                loopSettings.bpm = bpm;
                applyLoopBars();
                pane.refresh();
            }
        });
        loopFolder.addButton({ title: 'Full Track' }).on('click', () => setFullTrackLoop());

        const audioResolutionFolder = audioFolder.addFolder({ title: 'Audio Resolution', expanded: false });
        const fftBlade = createTweakList(
            audioResolutionFolder,
            'FFT',
            ['1× (256)', '2× (512)', '4× (1024)', '8× (2048)', '16× (4096)', '32× (8192)', '64× (16384)'],
            [256, 512, 1024, 2048, 4096, 8192, 16384],
        );
        fftBlade.value = audioSettings.fftSize;
        fftBlade.on('change', (event) => setAudioResolution(event.value));

        audioFolder.addBinding(audioReactive, 'sensitivity', { min: 0.1, max: 4, step: 0.01, label: 'Sensitivity' });
        audioFolder.addBinding(audioReactive, 'smoothing', { min: 0, max: 0.95, step: 0.01, label: 'Smoothing' });

        const reactivityFolder = audioFolder.addFolder({ title: 'Reactivity', expanded: true });
        reactivityFolder.addBinding(audioReactive, 'lowMeshSizeResponse', { min: 0, max: 1.5, step: 0.01, label: 'Low → Mesh Size' });
        reactivityFolder.addBinding(audioReactive, 'bloomResponse', { min: 0, max: 5, step: 0.01, label: 'Bloom' });
        reactivityFolder.addBinding(audioReactive, 'particleSizeResponse', { min: 0, max: 5, step: 0.01, label: 'Particle Size' });

        const frequencyFolder = audioFolder.addFolder({ title: 'Frequency Bands', expanded: false });
        frequencyFolder.addBinding(audioReactive, 'bassMinHz', { min: 20, max: 20000, step: 10, label: 'Low Min Hz' });
        frequencyFolder.addBinding(audioReactive, 'bassMaxHz', { min: 20, max: 20000, step: 10, label: 'Low Max Hz' });
        frequencyFolder.addBinding(audioReactive, 'midsMinHz', { min: 20, max: 20000, step: 10, label: 'Mids Min Hz' });
        frequencyFolder.addBinding(audioReactive, 'midsMaxHz', { min: 20, max: 20000, step: 10, label: 'Mids Max Hz' });
        frequencyFolder.addBinding(audioReactive, 'highsMinHz', { min: 20, max: 20000, step: 10, label: 'Highs Min Hz' });
        frequencyFolder.addBinding(audioReactive, 'highsMaxHz', { min: 20, max: 20000, step: 10, label: 'Highs Max Hz' });

        const viewportFolder = controller.addFolder({ title: 'Viewport', expanded: false });
        const viewportBlade = createTweakList(viewportFolder, 'Format', Object.keys(viewportAspects), Object.keys(viewportAspects));
        viewportBlade.value = viewportSettings.format;
        viewportBlade.on('change', (event) => {
            viewportSettings.format = event.value;
            fitViewport();
        });

        const cameraFolder = controller.addFolder({ title: 'Camera', expanded: false });
        const cameraPresetNames = ['Static', 'Orbit', 'Horizontal Orbit', 'Vertical Arc', 'Helix', 'Pendulum', 'Cinematic Sweep', 'Figure Eight', 'Push / Pull', 'Drift', 'Audio Follow'];
        const cameraPresetBlade = createTweakList(cameraFolder, 'Preset', cameraPresetNames, cameraPresetNames);
        cameraPresetBlade.value = cameraSettings.preset;
        cameraPresetBlade.on('change', (event) => {
            cameraSettings.preset = event.value;
            cameraSettingsDirty = true;
        });
        cameraFolder.addBinding(cameraSettings, 'autoRotate', { label: 'Auto Rotate' }).on('change', () => cameraSettingsDirty = true);
        cameraFolder.addBinding(cameraSettings, 'autoRotateSpeed', { min: -10, max: 10, step: 0.05, label: 'Rotation Speed' });
        cameraFolder.addBinding(cameraSettings, 'movementSpeed', { min: 0.1, max: 3, step: 0.05, label: 'Movement Speed' });
        cameraFolder.addBinding(cameraSettings, 'movementAmount', { min: 0, max: 2, step: 0.05, label: 'Movement Amount' });
        cameraFolder.addBinding(cameraSettings, 'distance', { min: 5, max: 50, step: 0.1, label: 'Distance' }).on('change', () => cameraSettingsDirty = true);
        cameraFolder.addBinding(cameraSettings, 'elevation', { min: -89, max: 89, step: 1, label: 'Elevation' }).on('change', () => cameraSettingsDirty = true);
        cameraFolder.addBinding(cameraSettings, 'azimuth', { min: -180, max: 180, step: 1, label: 'Azimuth' }).on('change', () => cameraSettingsDirty = true);
        cameraFolder.addBinding(cameraSettings, 'fov', { min: 30, max: 110, step: 1, label: 'FOV' });
        cameraFolder.addBinding(cameraSettings, 'mouseControls', { label: 'Mouse Controls' });
        cameraFolder.addBinding(cameraSettings, 'damping', { label: 'Damping' });
        cameraFolder.addButton({ title: 'Center Visualization' }).on('click', () => centerVisualization());

        const backgroundFolder = controller.addFolder({ title: 'Background', expanded: false });
        const backgroundBlade = createTweakList(backgroundFolder, 'Background', backgroundNames, backgroundNames);
        backgroundBlade.value = currentBackgroundName;
        backgroundBlade.on('change', (event) => { void loadBackground(event.value); });

        const meshFolder = controller.addFolder({ title: 'Mesh', expanded: false });
        meshBlade = createTweakList(meshFolder, 'Mesh', geoNames, geometries);
        meshBlade.value = geometries[0];
        meshBlade.on('change', (event) => {
            const index = geometries.indexOf(event.value);
            handleMeshChange(event.value, geoNames[index] || currentMeshName);
        });
        meshFolder.addBinding(tweaks, 'bloomStrength', { min: 0, max: 5, step: 0.01, label: 'Bloom Strength' }).on('change', (event) => {
            unrealBloomPass.strength = event.value;
        });
        meshFolder.addBinding(tweaks, 'rotationY', { min: -(Math.PI * 2), max: (Math.PI * 2), step: 0.01, label: 'Rotation Y' }).on('change', (event) => {
            particleMesh.rotation.y = mesh.rotation.y = event.value;
        });

        const dissolveFolder = controller.addFolder({ title: 'Dissolve Effect', expanded: false });
        dissolveFolder.addBinding(tweaks, 'meshVisible', { label: 'Visible' }).on('change', (event) => { mesh.visible = event.value; });
        progressBinding = dissolveFolder.addBinding(tweaks, 'dissolveProgress', { min: -20, max: 20, step: 0.0001, label: 'Progress' }).on('change', (event) => { dissolveUniformData.uProgress.value = event.value; });
        dissolveFolder.addBinding(tweaks, 'autoDissolve', { label: 'Auto Animate' });
        dissolveFolder.addBinding(tweaks, 'edgeWidth', { min: 0.1, max: 8, step: 0.001, label: 'Edge Width' }).on('change', (event) => { dissolveUniformData.uEdge.value = event.value; });
        dissolveFolder.addBinding(tweaks, 'frequency', { min: 0.001, max: 2, step: 0.001, label: 'Frequency' }).on('change', (event) => { dissolveUniformData.uFreq.value = event.value; });
        dissolveFolder.addBinding(tweaks, 'amplitude', { min: 0.1, max: 20, step: 0.001, label: 'Amplitude' }).on('change', (event) => { dissolveUniformData.uAmp.value = event.value; });
        dissolveFolder.addBinding(tweaks, 'meshColor', { label: 'Mesh Color' }).on('change', (event) => { phyMat.color.set(event.value); });
        dissolveFolder.addBinding(tweaks, 'edgeColor', { label: 'Edge Color' }).on('change', (event) => { dissolveUniformData.uEdgeColor.value.set(event.value); });

        const particleFolder = controller.addFolder({ title: 'Particle Motion', expanded: false });
        particleFolder.addBinding(tweaks, 'particleVisible', { label: 'Visible' }).on('change', (event) => { particleMesh.visible = event.value; });
        particleFolder.addBinding(tweaks, 'particleBaseSize', { min: 10, max: 100, step: 0.01, label: 'Base Size' }).on('change', (event) => { particlesUniformData.uBaseSize.value = event.value; });
        particleFolder.addBinding(tweaks, 'particleColor', { label: 'Color' }).on('change', (event) => { particlesUniformData.uColor.value.set(event.value); });
        particleFolder.addBinding(tweaks, 'particleSpeedFactor', { min: 0.001, max: 0.1, step: 0.001, label: 'Speed' }).on('change', (event) => { particleData.particleSpeedFactor = event.value; });
        particleFolder.addBinding(tweaks, 'waveAmplitude', { min: 0, max: 5, step: 0.01, label: 'Wave Amplitude' }).on('change', (event) => { particleData.waveAmplitude = event.value; });
        particleFolder.addBinding(tweaks, 'velocityFactor', { expanded: true, picker: 'inline', label: 'Velocity Factor' }).on('change', (event) => { particleData.velocityFactor = event.value; });

        const exportFolder = controller.addFolder({ title: 'Export', expanded: false });
        exportFolder.addBinding(exportSettings, 'fileName', { label: 'File Name' });
        const exportResolutionBlade = createTweakList(exportFolder, 'Resolution', ['1080', '2K', '4K'], ['1080', '2K', '4K']);
        exportResolutionBlade.value = exportSettings.resolution;
        exportResolutionBlade.on('change', (event) => exportSettings.resolution = event.value);
        const exportFpsBlade = createTweakList(exportFolder, 'Frame Rate', ['24 FPS', '30 FPS', '60 FPS'], ['24', '30', '60']);
        exportFpsBlade.value = exportSettings.frameRate;
        exportFpsBlade.on('change', (event) => exportSettings.frameRate = event.value);
        const exportBitrateBlade = createTweakList(exportFolder, 'Bitrate', ['6 Mbps', '10 Mbps', '16 Mbps', '24 Mbps'], ['6', '10', '16', '24']);
        exportBitrateBlade.value = exportSettings.bitrateMbps;
        exportBitrateBlade.on('change', (event) => exportSettings.bitrateMbps = event.value);
        const exportTypeBlade = createTweakList(exportFolder, 'Video Type', ['Auto', 'MP4', 'WebM'], ['Auto', 'MP4', 'WebM']);
        exportTypeBlade.value = exportSettings.videoType;
        exportTypeBlade.on('change', (event) => exportSettings.videoType = event.value);
        exportFolder.addButton({ title: 'Export Video' }).on('click', () => { void startVideoExport(); });
        exportFolder.addButton({ title: 'Export PNG' }).on('click', () => { void exportPng(); });
        exportFolder.addButton({ title: 'Export JSON' }).on('click', () => exportJson());
        exportFolder.addButton({ title: 'Import JSON' }).on('click', () => importJsonInput.click());
        exportFolder.addBinding(exportSettings, 'status', { label: 'Status', readonly: true });
    } catch (error) {
        console.error('Controls failed to initialize.', error);
        controlsContainer.textContent = 'Controls failed to load. Refresh the page to retry.';
        controlsContainer.classList.add('control-panel--error');
    }
}

void initControls();

let dissolving = true;
let geoIdx = 0;
let geoLength = geometries.length;


function animateDissolve() {
    if (!tweaks.autoDissolve) return;
    let progress = dissolveUniformData.uProgress;
    if (dissolving) {
        progress.value += isMobileDevice() ? 0.12 : 0.08;
    } else {
        progress.value -= isMobileDevice() ? 0.12 : 0.08;
    }
    if (progress.value > 14 && dissolving) {
        dissolving = false;
        geoIdx++;
        const nextIndex = geoIdx % geoLength;
        handleMeshChange(geometries[nextIndex], geoNames[nextIndex]);
        if (meshBlade) meshBlade.value = geometries[nextIndex];
    };
    if (progress.value < -17 && !dissolving) dissolving = true;

    if (progressBinding) progressBinding.controller.value.setRawValue(progress.value);
}


function floatMeshes(time) {
    mesh.position.set(0, Math.sin(time * 2.0) * 0.5, 0);
    particleMesh.position.set(0, Math.sin(time * 2.0) * 0.5, 0);
}


const clock = new THREE.Clock();
function animate() {
    let time = clock.getElapsedTime();

    animateDissolve();

    // Apply the requested frequency mapping without changing the underlying
    // control values: lows scale the mesh, while mids/highs drive bloom and
    // particle sprite size. Silence returns every audio-driven value to baseline.
    const baseParticleSize = particlesUniformData.uBaseSize.value;
    const baseBloomStrength = unrealBloomPass.strength;
    const audio = readAudioLevels();

    if (loopSettings.enabled && !audioElement.paused && Number.isFinite(audioElement.duration) && audioElement.duration > 0) {
        const loopStart = Math.max(0, Math.min(audioElement.duration, loopSettings.start));
        const loopEnd = Math.max(loopStart + 0.01, Math.min(audioElement.duration, loopSettings.end || audioElement.duration));
        const partialLoop = loopStart > 0.001 || loopEnd < audioElement.duration - 0.001;
        if (partialLoop && audioElement.currentTime >= loopEnd - 0.015) {
            audioElement.currentTime = loopStart;
        }
    }

    const meshScale = 1 + audio.bass * audioReactive.lowMeshSizeResponse;
    mesh.scale.setScalar(meshScale);
    particleMesh.scale.setScalar(meshScale);

    const midHighMagnitude = Math.max(audio.mids, audio.highs);
    unrealBloomPass.strength = baseBloomStrength * (1 + midHighMagnitude * audioReactive.bloomResponse);
    particlesUniformData.uBaseSize.value = baseParticleSize * (1 + midHighMagnitude * audioReactive.particleSizeResponse);

    updateCameraMotion(time, audio);

    updateParticleAttributes();

    floatMeshes(time);

    if (resizeRendererToDisplaySize()) {
        const canvas = re.domElement;
        cam.aspect = canvas.clientWidth / canvas.clientHeight;
        cam.updateProjectionMatrix();
    }


    scene.background = blackColor;
    effectComposer1.render();

    scene.background = activeBackgroundTexture || cubeTexture || blackColor;
    effectComposer2.render();

    if (mediaRecorder?.state === 'recording' && exportStopAt != null && audioElement.currentTime >= exportStopAt - 0.02) {
        audioElement.pause();
        stopVideoExport();
    }

    // Restore baseline values so audio reactivity never rewrites user controls.
    particlesUniformData.uBaseSize.value = baseParticleSize;
    unrealBloomPass.strength = baseBloomStrength;

    fpsFrameCount++;
    const now = performance.now();
    const fpsElapsed = now - fpsSampleStart;
    if (fpsElapsed >= 500) {
        performanceStats.fps = Math.round((fpsFrameCount * 1000) / fpsElapsed);
        if (fpsBinding) fpsBinding.refresh();
        fpsFrameCount = 0;
        fpsSampleStart = now;
    }

    requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

window.addEventListener('orientationchange', () => {
    fitViewport();
    cameraSettingsDirty = true;
});

