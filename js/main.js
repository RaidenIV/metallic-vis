import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { TeapotGeometry } from 'three/addons/geometries/TeapotGeometry.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

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
const displayPixelRatio = Math.min(window.devicePixelRatio, 2);
re.setPixelRatio(displayPixelRatio);
re.setSize(cnvs.clientWidth * scale, cnvs.clientHeight * scale, false);
re.toneMapping = THREE.ACESFilmicToneMapping;
re.toneMappingExposure = 1.1;
re.outputColorSpace = THREE.SRGBColorSpace;

// Subtle studio lights complement the environment map. They create readable
// specular shape cues without replacing the selected background/reflections.
const keyLight = new THREE.DirectionalLight(0xffffff, 2.1);
keyLight.position.set(6, 8, 10);
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0x9fc5ff, 1.25);
rimLight.position.set(-8, 3, -7);
scene.add(rimLight);


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
const audioFileInput = document.createElement('input');
audioFileInput.type = 'file';
audioFileInput.accept = 'audio/*';
audioFileInput.hidden = true;
document.body.appendChild(audioFileInput);

let audioContext = null;
let decodeAudioContext = null;
let audioAnalyser = null;
let audioOutputGain = null;
let audioFrequencyData = null;
let transportSource = null;
let transportIsPlaying = false;
let transportOffset = 0;
let transportStartedAt = 0;
let transportStartedOffset = 0;

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
    particleSpeedResponse: 1.0,
    dissolveMotionResponse: 0,
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
    // Set once the user types a tempo in the loop modal. While true, automatic
    // detection must never overwrite it.
    bpmUserSet: false,
};

let decodedAudioBuffer = null;
let recordingDestination = null;
let audioInfoBindings = [];
let seekBinding = null;
// Tweakpane emits a 'change' event from refresh() whenever the bound value
// actually moved. The Seek % binding is refreshed from the render loop with the
// live transport position, so an unguarded refresh feeds straight back into the
// seek handler and restarts the AudioBufferSourceNode several times a second.
let suppressSeekBindingChange = false;
let loopBindings = [];
let loopButtonController = null;

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

// Programmatic refreshes must never be mistaken for a user scrub.
function refreshSeekBinding() {
    if (!seekBinding) return;
    suppressSeekBindingChange = true;
    try {
        seekBinding.refresh();
    } finally {
        suppressSeekBindingChange = false;
    }
}

function refreshPane() {
    if (!pane) return;
    suppressSeekBindingChange = true;
    suppressRotationYChange = true;
    try {
        pane.refresh();
    } finally {
        suppressSeekBindingChange = false;
        suppressRotationYChange = false;
    }
}

function refreshRotationYBinding() {
    if (!rotationYBinding) return;
    suppressRotationYChange = true;
    try {
        rotationYBinding.refresh();
    } finally {
        suppressRotationYChange = false;
    }
}

function refreshAudioInfo() {
    audioInfoBindings.forEach((binding) => binding.refresh());
    refreshSeekBinding();
    loopBindings.forEach((binding) => binding.refresh());
}

function getDecodeAudioContext() {
    if (!decodeAudioContext) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) throw new Error('Web Audio API is unavailable in this browser.');
        decodeAudioContext = new AudioContextClass();
    }
    return decodeAudioContext;
}

function applyAudioOutputGain() {
    if (!audioOutputGain || !audioContext) return;
    const volume = Math.max(0, Math.min(1, Number(audioInfo.volume) / 100));
    const gain = audioInfo.muted ? 0 : volume;
    audioOutputGain.gain.setValueAtTime(gain, audioContext.currentTime);
}

function ensureAudioAnalyser() {
    if (!audioContext) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) throw new Error('Web Audio API is unavailable in this browser.');
        audioContext = new AudioContextClass();
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

    if (!audioOutputGain) {
        audioOutputGain = audioContext.createGain();
        audioOutputGain.connect(audioContext.destination);
    }

    if (!recordingDestination) {
        recordingDestination = audioContext.createMediaStreamDestination();
        audioOutputGain.connect(recordingDestination);
    }

    applyAudioOutputGain();
}

function getTransportDuration() {
    return decodedAudioBuffer?.duration || 0;
}

function getTransportTime() {
    const duration = getTransportDuration();
    if (!(duration > 0)) return 0;
    if (!transportIsPlaying || !audioContext) {
        return clamp(transportOffset, 0, duration);
    }

    let time = transportStartedOffset + Math.max(0, audioContext.currentTime - transportStartedAt);
    if (loopSettings.enabled && loopSettings.end > loopSettings.start) {
        const start = clamp(loopSettings.start, 0, duration);
        const end = clamp(loopSettings.end, start, duration);
        const loopDuration = end - start;
        if (loopDuration > 0 && time >= end) {
            time = start + ((time - start) % loopDuration + loopDuration) % loopDuration;
        }
    }
    return clamp(time, 0, duration);
}

function stopTransportSource() {
    if (!transportSource) return;
    transportSource.onended = null;
    try { transportSource.stop(); } catch (_) {}
    try { transportSource.disconnect(); } catch (_) {}
    transportSource = null;
}

function configureTransportLoop(source) {
    if (!source) return;
    const duration = getTransportDuration();
    const start = clamp(loopSettings.start, 0, duration);
    const end = clamp(loopSettings.end || duration, start, duration);
    source.loop = Boolean(loopSettings.enabled && end > start + 0.005);
    if (source.loop) {
        source.loopStart = start;
        source.loopEnd = end;
    }
}

function startTransportAt(seconds) {
    if (!decodedAudioBuffer) return false;
    ensureAudioAnalyser();

    const duration = getTransportDuration();
    let offset = clamp(Number(seconds) || 0, 0, Math.max(0, duration - 1e-6));
    if (loopSettings.enabled && loopSettings.end > loopSettings.start) {
        const start = clamp(loopSettings.start, 0, duration);
        const end = clamp(loopSettings.end, start, duration);
        if (offset < start || offset >= end) offset = start;
    }

    stopTransportSource();
    const source = audioContext.createBufferSource();
    source.buffer = decodedAudioBuffer;
    source.connect(audioAnalyser);
    source.connect(audioOutputGain);
    configureTransportLoop(source);

    transportSource = source;
    transportStartedOffset = offset;
    transportStartedAt = audioContext.currentTime;
    transportOffset = offset;
    transportIsPlaying = true;

    source.onended = () => {
        if (transportSource !== source) return;
        transportSource = null;
        if (source.loop) return;
        transportIsPlaying = false;
        transportOffset = duration;
        audioInfo.currentTime = formatTime(duration);
        audioInfo.seekPercent = 100;
        audioInfo.status = 'Ended';
        refreshAudioInfo();
    };

    source.start(0, offset);
    return true;
}

async function playTransport() {
    if (!decodedAudioBuffer) return false;
    ensureAudioAnalyser();
    if (audioContext.state === 'suspended') await audioContext.resume();

    const duration = getTransportDuration();
    if (transportOffset >= duration - 1e-4) transportOffset = 0;
    if (loopSettings.enabled && loopSettings.end > loopSettings.start) {
        if (transportOffset < loopSettings.start || transportOffset >= loopSettings.end) {
            transportOffset = loopSettings.start;
        }
    }

    const started = startTransportAt(transportOffset);
    if (started) {
        audioInfo.status = 'Playing';
        refreshAudioInfo();
    }
    return started;
}

function pauseTransport() {
    if (!transportIsPlaying) return;
    transportOffset = getTransportTime();
    transportIsPlaying = false;
    stopTransportSource();
    if (audioInfo.status !== 'Loading audio…') audioInfo.status = 'Paused';
    refreshAudioInfo();
}

function seekTransport(seconds) {
    const duration = getTransportDuration();
    if (!(duration > 0)) return;
    const wasPlaying = transportIsPlaying;
    const next = clamp(Number(seconds) || 0, 0, duration);
    transportOffset = next;
    if (wasPlaying) startTransportAt(next);
    audioInfo.currentTime = formatTime(next);
    audioInfo.seekPercent = (next / duration) * 100;
    refreshAudioInfo();
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
    if (!audioAnalyser || !audioFrequencyData || !transportIsPlaying) {
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
    if (!audioAnalyser || !audioFrequencyData || !audioContext || !transportIsPlaying) return 0.5;
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
    if (!decodedAudioBuffer) {
        audioFileInput.click();
        return;
    }

    try {
        if (transportIsPlaying) {
            pauseTransport();
        } else {
            await playTransport();
        }
    } catch (error) {
        console.error('Audio playback failed:', error);
        transportIsPlaying = false;
        audioInfo.status = 'Playback failed';
        refreshAudioInfo();
    }
}

async function loadAudioFile(file) {
    if (!file) return;

    pauseTransport();
    stopTransportSource();
    transportOffset = 0;
    audioInfo.status = 'Loading audio…';
    refreshAudioInfo();

    const progressLabel = `Audio · ${file.name}`;
    updateLoadProgress('audio', 0, progressLabel);
    audioInfo.name = file.name;
    audioInfo.type = file.type || 'Unknown';
    audioInfo.size = formatBytes(file.size);
    audioInfo.duration = 'Unavailable';
    audioInfo.sampleRate = 'Unavailable';
    audioInfo.channels = 'Unavailable';
    audioInfo.decode = 'Loading…';
    audioInfo.currentTime = '0:00';
    audioInfo.seekPercent = 0;
    decodedAudioBuffer = null;
    loopSettings.enabled = false;
    loopSettings.start = 0;
    loopSettings.end = 0;
    loopSettings.bpmUserSet = false;
    refreshAudioInfo();
    galaxyLoopController?.syncButton?.();

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

        try {
            decodedAudioBuffer = await getDecodeAudioContext().decodeAudioData(arrayBuffer.slice(0));
            audioInfo.duration = formatTime(decodedAudioBuffer.duration, true);
            audioInfo.sampleRate = `${decodedAudioBuffer.sampleRate.toLocaleString()} Hz`;
            audioInfo.channels = String(decodedAudioBuffer.numberOfChannels);
            audioInfo.decode = 'Ready';
            loopSettings.start = 0;
            loopSettings.end = decodedAudioBuffer.duration;
        } catch (decodeError) {
            console.error('Audio decode failed.', decodeError);
            decodedAudioBuffer = null;
            audioInfo.decode = 'Failed';
            throw new Error('The selected audio file could not be decoded for playback.');
        }

        const duration = decodedAudioBuffer?.duration || 0;
        if (duration > 0) {
            loopSettings.start = 0;
            loopSettings.end = duration;
            audioInfo.duration = formatTime(duration, true);
        }
        transportOffset = 0;
        updateAudioLoopMode();
        audioInfo.status = 'Ready';
        completeLoadProgress('audio', progressLabel);
        refreshAudioInfo();
        galaxyLoopController?.syncButton?.();
    } catch (error) {
        console.error(error);
        decodedAudioBuffer = null;
        audioInfo.decode = 'Failed';
        audioInfo.status = 'Audio load failed';
        refreshAudioInfo();
        galaxyLoopController?.syncButton?.();
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
    if (transportSource) configureTransportLoop(transportSource);
}

function enforceAudioLoopRange() {
    // AudioBufferSourceNode handles the applied loop natively at audio-clock
    // precision. Avoid repeatedly assigning currentTime on an HTMLMediaElement;
    // those decoder seeks were the source of loop gaps, clicks and stuttering.
}

function snapLoopTime(seconds) {
    if (!loopSettings.snapToBeats) return seconds;
    const beat = 60 / Math.max(1, loopSettings.bpm);
    return Math.round(seconds / beat) * beat;
}

function applyLoopBars() {
    const duration = getTransportDuration();
    if (!duration) return;
    loopSettings.start = Math.max(0, Math.min(duration, snapLoopTime(loopSettings.start)));
    const barSeconds = (60 / Math.max(1, loopSettings.bpm)) * 4;
    loopSettings.end = Math.min(duration, loopSettings.start + Math.max(1, loopSettings.bars) * barSeconds);
    updateAudioLoopMode();
    refreshAudioInfo();
}

function setFullTrackLoop() {
    const duration = getTransportDuration();
    if (!duration) return;
    loopSettings.start = 0;
    loopSettings.end = duration;
    updateAudioLoopMode();
    refreshAudioInfo();
}

async function detectLoopBpm(audioBuffer = decodedAudioBuffer) {
    if (!audioBuffer) return null;
    const OfflineContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OfflineContext) return null;

    const sampleRate = audioBuffer.sampleRate;
    const maxLength = Math.min(audioBuffer.length, sampleRate * 90);
    const mono = new Float32Array(maxLength);
    for (let channelIndex = 0; channelIndex < audioBuffer.numberOfChannels; channelIndex++) {
        const channel = audioBuffer.getChannelData(channelIndex);
        for (let i = 0; i < maxLength; i++) mono[i] += channel[i];
    }
    if (audioBuffer.numberOfChannels > 1) {
        const mixScale = 1 / audioBuffer.numberOfChannels;
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


function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function syncLoopControlButton() {
    if (!loopButtonController) return;
    loopButtonController.disabled = !decodedAudioBuffer;
}

const galaxyLoopController = (() => {
  // ── BPM Detective popup — fully integrated with the main visualizer ──

  // ── Popup-local state ──
  let popupOpen      = false;
  let popupCtx       = null;
  let popupGain      = null;
  let popupBuffer    = null;
  let popupSource    = null;
  let popupIsPlaying = false;
  let popupLoopOn    = true;
  let popupVolume    = 80;
  let popupMuted     = false;
  let popupOffset    = 0;
  let popupCtxStart  = 0;
  let popupBpm       = 120;
  let popupLoopBars  = 4;
  let popupLoopStart = 0;
  let popupLoopEnd   = 4;
  let popupZoomStart = 0;
  let popupZoomEnd   = 1;
  let popupPeaks     = null;
  let popupAnimRaf   = null;
  let popupResizeObs = null;
  let popupForceRestartFromLoopStart = true;
  let popupDocMouseMoveHandler = null;
  let popupDocMouseUpHandler = null;
  let popupDocKeydownHandler = null;
  // Canvas dims
  let cW = 0, cH = 0, mmW = 0, mmH = 0;
  // Drag state
  let dragging = null, dragX0 = 0, dragVal0 = 0, dragMoved = false;
  let dragLoopDuration = 0, dragLoopStart0 = 0;
  let mmDrag = false, mmX0 = 0, mmZS0 = 0, mmZE0 = 0;

  // ── Entry point ──
  function openLoopPopup() {
      if (popupOpen || !decodedAudioBuffer) return;
      popupOpen = true;
      popupIsPlaying = false;
      popupSource = null;
      popupVolume = clamp(audioInfo.volume, 0, 100);
      popupMuted = Boolean(audioInfo.muted);
      popupBpm = clamp(loopSettings.bpm || 120, 40, 300);
      popupLoopBars = Math.max(1, Math.round(loopSettings.bars || 4));

      pauseTransport();
      const mainPlayBtn = document.getElementById('play-btn');
      if (mainPlayBtn) {
          mainPlayBtn.textContent = '▶ Play';
          mainPlayBtn.className = 'play';
      }

      const overlay = document.createElement('div');
      overlay.id = 'loop-modal-overlay';
      overlay.tabIndex = -1;
      overlay.innerHTML = buildPopupHTML();
      document.body.appendChild(overlay);
      overlay.focus();

      // Wire up all popup events
      wirePopupEvents(overlay);
      const popupQuery = id => overlay.querySelector("#" + id);
      popupQuery("popup-vol-slider").value = String(popupVolume);
      popupQuery("popup-vol-pct").textContent = `${popupVolume}%`;
      refreshVolSlider(popupQuery);
      updateVolIcon(popupQuery);
      // popupLoopOn persists across opens, but the markup always renders the
      // pill in the "on" state. Without this sync the switch can claim looping
      // is enabled while the preview plays straight through.
      popupQuery("popup-loop-switch").classList.toggle('on', popupLoopOn);
      popupQuery("popup-bars-val").value = String(popupLoopBars);

      // Load and decode audio from state
      initPopupAudio(decodedAudioBuffer);
  }

  // ── HTML builder ──
  function buildPopupHTML() {
      return `
  <div class="loop-modal-panel" id="loop-panel">
    <div class="loop-header">
      <div class="loop-title">Loop Region</div>
      <button class="loop-close-btn" id="popup-close-btn" title="Close">✕</button>
    </div>

    <div class="loop-wave-section">
      <div class="loop-wave-header">
        <span class="loop-section-label">Waveform · Loop Region</span>
        <div class="loop-zoom-controls">
          <button class="loop-zoom-btn" id="popup-zoom-out">−</button>
          <span class="loop-zoom-level" id="popup-zoom-level">1×</span>
          <button class="loop-zoom-btn" id="popup-zoom-in">+</button>
          <button class="loop-zoom-btn loop-fit-btn" id="popup-zoom-fit">FIT</button>
        </div>
      </div>

      <div class="loop-waveform-wrap" id="popup-wave-wrap">
        <div class="loop-wave-clip">
          <canvas id="popup-wave-canvas"></canvas>
          <div id="popup-playhead"></div>
        </div>
        <div class="popup-lhandle" id="popup-h-left" style="left:0%">
          <div class="popup-handle-tag" id="popup-tag-left">0.00s</div>
          <div class="popup-handle-knob"></div>
        </div>
        <div class="popup-lhandle" id="popup-h-right" style="left:50%">
          <div class="popup-handle-tag" id="popup-tag-right">4.00s</div>
          <div class="popup-handle-knob"></div>
        </div>
        <div class="loop-analyzing" id="popup-analyzing">
          <div class="loop-dots"><span></span><span></span><span></span></div>
          <div class="loop-analyzing-text">Analysing audio…</div>
        </div>
      </div>

      <div class="loop-minimap-wrap" id="popup-minimap-wrap">
        <canvas id="popup-minimap-canvas"></canvas>
      </div>

      <div class="loop-progress-wrap" id="popup-progress-wrap">
        <div class="loop-progress-fill" id="popup-progress-fill"></div>
      </div>
      <div class="loop-time-row">
        <span class="loop-time-mono" id="popup-t-current">0:00.000</span>
        <span class="loop-time-mono" id="popup-t-total">0:00.000</span>
      </div>
    </div>

    <div class="loop-controls-section">
      <div class="loop-ctrl-block">
        <div class="loop-transport-row">
          <button class="loop-tbtn" id="popup-play-btn" disabled>▶ Play</button>
          <button class="loop-tbtn" id="popup-stop-btn" disabled>■ Stop</button>
          <div class="loop-pill">
            <div class="loop-pill-switch on" id="popup-loop-switch"></div>
            <span class="loop-pill-label">Loop</span>
          </div>
        </div>
        <div class="loop-option-row">
          <label class="loop-check-label">
            <input type="checkbox" id="popup-force-start-toggle" class="loop-check-input" checked>
            <span class="loop-check-box"></span>
            <span class="loop-check-text">Always start preview from loop start</span>
          </label>
        </div>
        <div class="loop-volume-row">
          <button class="loop-vol-btn" id="popup-mute-btn">🔊</button>
          <input class="loop-vol-slider" id="popup-vol-slider" type="range" min="0" max="100" value="80">
          <span class="loop-vol-pct" id="popup-vol-pct">80%</span>
        </div>
      </div>

      <div class="loop-ctrl-block loop-bpm-block">
        <div class="loop-section-label">Detected Tempo</div>
        <div class="loop-bpm-row">
          <input class="loop-bpm-input" id="popup-bpm-input" type="number" min="40" max="300" placeholder="—" disabled>
          <span class="loop-bpm-unit">BPM</span>
        </div>
        <div class="loop-bpm-hint">Click to edit · Enter to confirm</div>
      </div>

      <div class="loop-ctrl-block loop-bars-block">
        <div class="loop-section-label">Loop Length</div>
        <div class="loop-bars-row">
          <div class="value-editor has-suffix loop-bars-editor">
            <input class="value-input loop-bars-val" id="popup-bars-val" type="number" min="1" max="999" value="4" aria-label="Loop Length in Bars Value">
            <span class="value-suffix loop-bars-unit" aria-hidden="true">Bars</span>
            <button class="value-stepper loop-bars-stepper" id="popup-bars-decr" type="button" aria-label="Decrease Loop Length">−</button>
            <button class="value-stepper loop-bars-stepper" id="popup-bars-incr" type="button" aria-label="Increase Loop Length">+</button>
          </div>
        </div>
        <div class="loop-time-info" id="popup-loop-time-info">—</div>
      </div>
    </div>

    <div class="loop-status-bar">
      <span class="loop-stat">Rate: <b id="popup-stat-rate">—</b></span>
      <span class="loop-stat">Duration: <b id="popup-stat-dur">—</b></span>
      <span class="loop-stat">Loop: <b id="popup-stat-loop">—</b></span>
      <span class="loop-stat">Beat: <b id="popup-stat-beat">—</b></span>
    </div>

    <div class="loop-action-row">
      <button class="loop-action-btn loop-cancel-btn" id="popup-cancel-btn">Cancel</button>
      <button class="loop-action-btn loop-clear-btn" id="popup-clear-btn">Clear Loop</button>
      <button class="loop-action-btn loop-apply-btn" id="popup-apply-btn" disabled>Apply Loop</button>
    </div>
  </div>`;
  }

  // ── Wire all popup events ──
  function wirePopupEvents(overlay) {
      const $ = id => overlay.querySelector('#' + id);

      // Close
      $('popup-close-btn').addEventListener('click', closePopup);
      $('popup-cancel-btn').addEventListener('click', closePopup);

      // Clear loop
      $('popup-clear-btn').addEventListener('click', () => {
          clearAudioLoop();
          closePopup();
      });

      // Apply loop
      $('popup-apply-btn').addEventListener('click', () => {
          applyAudioLoop(popupLoopStart, popupLoopEnd);
          loopSettings.bpm = popupBpm;
          loopSettings.bpmUserSet = true;
          syncLoopControlButton();
          closePopup();
      });

      // Transport
      $('popup-play-btn').addEventListener('click', () => popupIsPlaying ? popupPause() : popupPlay($));
      $('popup-stop-btn').addEventListener('click', () => popupStop($));
      $('popup-loop-switch').addEventListener('click', () => {
          popupLoopOn = !popupLoopOn;
          $('popup-loop-switch').classList.toggle('on', popupLoopOn);
          if (popupSource && popupIsPlaying) { popupSource.loop = popupLoopOn; if (popupLoopOn) { popupSource.loopStart = popupLoopStart; popupSource.loopEnd = popupLoopEnd; } }
      });
      $('popup-force-start-toggle').checked = popupForceRestartFromLoopStart;
      $('popup-force-start-toggle').addEventListener('change', () => {
          popupForceRestartFromLoopStart = $('popup-force-start-toggle').checked;
      });

      // Volume
      $('popup-vol-slider').addEventListener('input', () => {
          popupVolume = +$('popup-vol-slider').value;
          $('popup-vol-pct').textContent = popupVolume + '%';
          if (!popupMuted && popupGain) popupGain.gain.value = popupMuted ? 0 : popupVolume / 100;
          refreshVolSlider($);
      });
      $('popup-mute-btn').addEventListener('click', () => {
          popupMuted = !popupMuted;
          if (popupGain) popupGain.gain.value = popupMuted ? 0 : popupVolume / 100;
          updateVolIcon($);
      });

      // BPM
      $('popup-bpm-input').addEventListener('blur', () => commitBPM($));
      $('popup-bpm-input').addEventListener('keydown', e => { if (e.key === 'Enter') $('popup-bpm-input').blur(); });

      // Bars
      $('popup-bars-val').addEventListener('blur', () => commitBars($));
      $('popup-bars-val').addEventListener('keydown', e => { if (e.key === 'Enter') $('popup-bars-val').blur(); });
      $('popup-bars-decr').addEventListener('click', () => {
          popupLoopBars = Math.max(1, popupLoopBars - 1);
          $('popup-bars-val').value = popupLoopBars;
          applyLoopChange($);
      });
      $('popup-bars-incr').addEventListener('click', () => {
          const maxBars = getMaxLoopBars();
          popupLoopBars = Math.min(maxBars, popupLoopBars + 1);
          $('popup-bars-val').value = popupLoopBars;
          applyLoopChange($);
      });

      // Zoom
      $('popup-zoom-in').addEventListener('click',  () => zoomAtX(cW / 2, 2, $));
      $('popup-zoom-out').addEventListener('click', () => zoomAtX(cW / 2, 0.5, $));
      $('popup-zoom-fit').addEventListener('click', () => { if (popupBuffer) setZoomWindow(0, popupBuffer.duration, $); });

      // Wave click to seek
      $('popup-wave-wrap').addEventListener('click', e => {
          if (dragMoved) { dragMoved = false; return; }
          if (!popupBuffer) return;
          const rect = $('popup-wave-wrap').getBoundingClientRect();
          seekTo(xToTime(e.clientX - rect.left), $);
      });

      // Wheel zoom
      $('popup-wave-wrap').addEventListener('wheel', e => {
          if (!popupBuffer) return;
          e.preventDefault();
          const rect = $('popup-wave-wrap').getBoundingClientRect();
          zoomAtX(e.clientX - rect.left, e.deltaY < 0 ? 1.6 : 0.625, $);
      }, { passive: false });

      // Progress click
      $('popup-progress-wrap').addEventListener('click', e => {
          if (!popupBuffer) return;
          const r = $('popup-progress-wrap').getBoundingClientRect();
          seekTo(((e.clientX - r.left) / r.width) * popupBuffer.duration, $);
      });

      // Handle drag — left
      $('popup-h-left').addEventListener('mousedown', e => { startHandleDrag('left', e, $); });
      $('popup-h-right').addEventListener('mousedown', e => { startHandleDrag('right', e, $); });
      $('popup-h-left').addEventListener('click', e => e.stopPropagation());
      $('popup-h-right').addEventListener('click', e => e.stopPropagation());

      // Minimap drag
      $('popup-minimap-wrap').addEventListener('mousedown', e => {
          if (!popupBuffer) return;
          const rect = $('popup-minimap-wrap').getBoundingClientRect();
          const x = e.clientX - rect.left;
          const vL = (popupZoomStart / popupBuffer.duration) * mmW;
          const vR = (popupZoomEnd   / popupBuffer.duration) * mmW;
          if (x < vL - 8 || x > vR + 8) {
              const ct = (x / mmW) * popupBuffer.duration, hw = (popupZoomEnd - popupZoomStart) / 2;
              setZoomWindow(ct - hw, ct + hw, $);
          }
          mmDrag = true; mmX0 = e.clientX; mmZS0 = popupZoomStart; mmZE0 = popupZoomEnd;
          e.preventDefault();
      });

      // Global handlers while popup is open
      popupDocMouseMoveHandler = e => onMouseMove(e, $);
      popupDocMouseUpHandler = () => onMouseUp($);
      document.addEventListener('mousemove', popupDocMouseMoveHandler);
      document.addEventListener('mouseup', popupDocMouseUpHandler);

      popupDocKeydownHandler = e => {
          if (!popupOpen) return;
          const active = document.activeElement;
          const editingInput = active && (active.id === 'popup-bpm-input' || active.id === 'popup-bars-val');
          if (editingInput && e.key !== 'Escape') return;

          if (e.key === ' ' || e.code === 'Space') {
              e.preventDefault();
              e.stopPropagation();
              e.stopImmediatePropagation();
              popupIsPlaying ? popupPause() : popupPlay($);
              return;
          }
          if (e.key === '+' || e.key === '=') {
              e.preventDefault();
              e.stopPropagation();
              e.stopImmediatePropagation();
              zoomAtX(cW / 2, 2, $);
              return;
          }
          if (e.key === '-') {
              e.preventDefault();
              e.stopPropagation();
              e.stopImmediatePropagation();
              zoomAtX(cW / 2, 0.5, $);
              return;
          }
          if (e.key === '0' && popupBuffer) {
              e.preventDefault();
              e.stopPropagation();
              e.stopImmediatePropagation();
              setZoomWindow(0, popupBuffer.duration, $);
              return;
          }
          if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              e.stopImmediatePropagation();
              closePopup();
          }
      };
      document.addEventListener('keydown', popupDocKeydownHandler, true);

      // Canvas resize observer
      popupResizeObs = new ResizeObserver(() => resizeCanvases($));
      popupResizeObs.observe(overlay.querySelector('#loop-panel'));
      setTimeout(() => resizeCanvases($), 60);
  }

  // ── Canvas resize ──
  function resizeCanvases($) {
      const wWrap = $('popup-wave-wrap');
      const mmWrap = $('popup-minimap-wrap');
      if (!wWrap || !mmWrap) return;
      const dpr = window.devicePixelRatio || 1;
      const wr = wWrap.getBoundingClientRect();
      const mr = mmWrap.getBoundingClientRect();
      cW = wr.width; cH = wr.height;
      const wc = $('popup-wave-canvas');
      wc.width = cW * dpr; wc.height = cH * dpr;
      wc.style.width = cW + 'px'; wc.style.height = cH + 'px';
      const wCtx = wc.getContext('2d'); wCtx.scale(dpr, dpr);
      mmW = mr.width; mmH = mr.height;
      const mc = $('popup-minimap-canvas');
      mc.width = mmW * dpr; mc.height = mmH * dpr;
      mc.style.width = mmW + 'px'; mc.style.height = mmH + 'px';
      const mCtx = mc.getContext('2d'); mCtx.scale(dpr, dpr);
      if (popupBuffer) buildPeaks();
      updateHandles($);
      renderWaveform($); renderMinimap($);
  }

  // ── Init loop editor from the AudioBuffer that the host app already decoded ──
  async function initPopupAudio(buffer) {
      const overlay = document.getElementById('loop-modal-overlay');
      if (!overlay) return;
      const $ = id => overlay.querySelector('#' + id);
      const analyzing = $('popup-analyzing');
      const analyzingText = analyzing?.querySelector('.loop-analyzing-text');
      if (analyzingText) analyzingText.textContent = 'Analysing audio…';
      analyzing?.classList.add('show');

      // The main loader already decoded the file. Do not create another audio
      // context or make BPM analysis a prerequisite for opening the editor.
      if (
          !buffer ||
          typeof buffer.getChannelData !== 'function' ||
          !Number.isFinite(buffer.duration) ||
          buffer.duration <= 0
      ) {
          console.error('Loop editor received an invalid decoded AudioBuffer.');
          if (analyzingText) analyzingText.textContent = 'Audio buffer unavailable.';
          return;
      }

      try {
          popupBuffer = buffer;

          // Start with a usable BPM immediately. The already-computed host
          // analysis is a reliable fallback if OfflineAudioContext analysis is
          // unavailable or fails for a particular browser/file.
          const analyzedFallback = loopSettings.bpm;
          popupBpm = clamp(
              Number.isFinite(analyzedFallback) && analyzedFallback > 0
                  ? analyzedFallback
                  : (loopSettings.bpm || 120),
              40,
              300
          );

          $('popup-stat-rate').textContent = popupBuffer.sampleRate + ' Hz';
          $('popup-stat-dur').textContent  = fmtDur(popupBuffer.duration);
          $('popup-t-total').textContent   = fmtTime(popupBuffer.duration);
          $('popup-bpm-input').value = popupBpm;
          $('popup-bpm-input').disabled = false;
          $('popup-stat-beat').textContent = (60 / popupBpm).toFixed(3) + 's';

          // If an existing loop is active, preserve it exactly. Otherwise build
          // the initial Binary Tower-style bar selection from the fallback BPM.
          if (loopSettings.enabled && loopSettings.end > loopSettings.start) {
              popupLoopStart = loopSettings.start;
              popupLoopEnd   = loopSettings.end;
              if (loopSettings.bpm > 0) {
                  popupBpm = clamp(loopSettings.bpm, 40, 300);
                  $('popup-bpm-input').value = popupBpm;
                  $('popup-stat-beat').textContent = (60 / popupBpm).toFixed(3) + 's';
                  const bd = (60 / popupBpm) * 4;
                  popupLoopBars = Math.max(1, Math.round((popupLoopEnd - popupLoopStart) / bd));
                  $('popup-bars-val').value = popupLoopBars;
              }
          } else {
              popupLoopStart = 0;
              updateLoopEnd($);
          }

          popupZoomStart = 0;
          popupZoomEnd   = popupBuffer.duration;
          updateZoomDisplay($);

          buildPeaks();
          renderWaveform($);
          renderMinimap($);
          syncBarsLimit($);
          updateHandles($);
          updateLoopInfo($);

          $('popup-play-btn').disabled = false;
          $('popup-stop-btn').disabled = false;
          $('popup-apply-btn').disabled = false;
          popupOffset = popupLoopStart;
      } catch (err) {
          console.error('Loop editor initialization error:', err);
          if (analyzingText) analyzingText.textContent = 'Loop editor initialization failed.';
          return;
      }

      // The editor is usable now; tempo refinement happens in the background.
      analyzing?.classList.remove('show');

      // A user-entered tempo is authoritative. Skip detection outright so no
      // late-arriving analysis can overwrite the number in the BPM field.
      if (loopSettings.bpmUserSet) return;

      const bufferAtDetectionStart = popupBuffer;
      try {
          const detectedBpm = await Promise.race([
              detectLoopBpm(bufferAtDetectionStart),
              new Promise((_, reject) => {
                  window.setTimeout(() => reject(new Error('BPM detection timed out.')), 8000);
              })
          ]);

          if (!popupOpen || popupBuffer !== bufferAtDetectionStart) return;

          // detectLoopBpm resolves with null when analysis is not possible
          // (no OfflineAudioContext, too few frames, silent buffer). Feeding
          // null through clamp() coerced the tempo to 40 BPM, which silently
          // rewrote the bar grid and the loop length. Keep the fallback BPM
          // and the selection already derived from it.
          if (!Number.isFinite(detectedBpm) || detectedBpm <= 0) return;

          const hadExistingLoop = Boolean(
              loopSettings.enabled && loopSettings.end > loopSettings.start
          );
          popupBpm = clamp(detectedBpm, 40, 300);
          $('popup-bpm-input').value = popupBpm;
          $('popup-stat-beat').textContent = (60 / popupBpm).toFixed(3) + 's';

          if (hadExistingLoop) {
              const barDuration = (60 / popupBpm) * 4;
              popupLoopBars = Math.max(1, Math.round((popupLoopEnd - popupLoopStart) / barDuration));
              $('popup-bars-val').value = popupLoopBars;
          } else {
              updateLoopEnd($);
          }

          syncBarsLimit($);
          updateHandles($);
          renderWaveform($);
          renderMinimap($);
          updateLoopInfo($);
      } catch (err) {
          // A BPM-analysis failure must never disable the loop editor. The
          // fallback BPM above remains editable and all loop controls stay live.
          console.warn('Loop BPM detection unavailable; using fallback BPM.', err);
      }
  }

  // ── Peaks ──
  function buildPeaks() {
      if (!popupBuffer || cW < 1) return;
      const N = Math.ceil(cW * 4);
      popupPeaks = new Float32Array(N);
      const ch = popupBuffer.getChannelData(0);
      const blk = Math.floor(popupBuffer.length / N);
      for (let i = 0; i < N; i++) {
          let pk = 0, off = i * blk;
          for (let j = 0; j < blk; j++) { const a = Math.abs(ch[off + j] || 0); if (a > pk) pk = a; }
          popupPeaks[i] = pk;
      }
  }

  // ── Coordinates ──
  const timeToX = t => (popupZoomEnd > popupZoomStart) ? ((t - popupZoomStart) / (popupZoomEnd - popupZoomStart)) * cW : 0;
  const xToTime = x => (popupZoomEnd > popupZoomStart) ? popupZoomStart + (x / cW) * (popupZoomEnd - popupZoomStart) : 0;

  // ── Waveform render ──
  function renderWaveform($) {
      const wc = document.getElementById('popup-wave-canvas');
      if (!wc) return;
      const ctx = wc.getContext('2d');
      ctx.clearRect(0, 0, cW, cH);
      ctx.fillStyle = '#080808'; ctx.fillRect(0, 0, cW, cH);
      ctx.strokeStyle = 'rgba(255,255,255,0.055)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, cH / 2); ctx.lineTo(cW, cH / 2); ctx.stroke();

      if (!popupPeaks || !popupBuffer) {
          ctx.fillStyle = 'rgba(140,140,140,0.80)'; ctx.font = '12px monospace'; ctx.textAlign = 'center';
          ctx.fillText('Loading…', cW / 2, cH / 2 + 4); return;
      }

      const lsX = timeToX(popupLoopStart), leX = timeToX(popupLoopEnd);
      ctx.fillStyle = 'rgba(255,42,26,0.09)'; ctx.fillRect(lsX, 0, leX - lsX, cH);

      // Beat grid
      if (popupBpm > 0) {
          const bd = 60 / popupBpm;
          let first = Math.floor(popupZoomStart / bd) * bd, bi = Math.round(first / bd);
          for (let t = first; t < popupZoomEnd; t += bd, bi++) {
              const x = timeToX(t), isBar = (bi % 4 === 0);
              ctx.strokeStyle = isBar ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.06)';
              ctx.lineWidth = isBar ? 0.8 : 0.5;
              ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, cH); ctx.stroke();
              if (isBar) {
                  ctx.fillStyle = 'rgba(140,140,140,0.70)'; ctx.font = '8px monospace'; ctx.textAlign = 'left';
                  ctx.fillText(Math.round(t / (bd * 4)) + 1, x + 2, 10);
              }
          }
      }

      // Waveform
      const N = popupPeaks.length, dur = popupBuffer.duration;
      const p0 = Math.floor((popupZoomStart / dur) * N), p1 = Math.ceil((popupZoomEnd / dur) * N);
      const sl = p1 - p0;
      for (let i = 0; i < cW; i++) {
          const pi = p0 + Math.round((i / cW) * sl);
          const pk = popupPeaks[Math.min(pi, N - 1)] || 0;
          const h = pk * cH * 0.88, y = (cH - h) / 2;
          const t = xToTime(i), inL = (t >= popupLoopStart && t <= popupLoopEnd);
          ctx.fillStyle = inL
              ? `rgba(255,${Math.round(82 + pk * 80)},${Math.round(58 + pk * 48)},${0.62 + pk * 0.34})`
              : `rgba(120,120,120,${0.22 + pk * 0.45})`;
          ctx.fillRect(i, y, 1, Math.max(0.5, h));
      }

      // Loop boundary lines
      ctx.strokeStyle = 'rgba(255,42,26,0.92)'; ctx.lineWidth = 1;
      [lsX, leX].forEach(x => { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, cH); ctx.stroke(); });
  }

  // ── Minimap render ──
  function renderMinimap($) {
      const mc = document.getElementById('popup-minimap-canvas');
      if (!mc) return;
      const ctx = mc.getContext('2d');
      ctx.clearRect(0, 0, mmW, mmH);
      ctx.fillStyle = '#080808'; ctx.fillRect(0, 0, mmW, mmH);
      if (!popupPeaks || !popupBuffer) return;

      const N = popupPeaks.length, dur = popupBuffer.duration;
      for (let i = 0; i < mmW; i++) {
          const pi = Math.round((i / mmW) * N);
          const pk = popupPeaks[Math.min(pi, N - 1)] || 0;
          const h = pk * mmH * 0.85, y = (mmH - h) / 2;
          const t = (i / mmW) * dur, inL = (t >= popupLoopStart && t <= popupLoopEnd);
          ctx.fillStyle = inL ? `rgba(255,42,26,${0.35 + pk * 0.5})` : `rgba(130,130,130,${0.18 + pk * 0.42})`;
          ctx.fillRect(i, y, 1, Math.max(0.5, h));
      }

      const vL = (popupZoomStart / dur) * mmW, vR = (popupZoomEnd / dur) * mmW;
      ctx.fillStyle = 'rgba(255,255,255,0.045)'; ctx.fillRect(vL, 0, vR - vL, mmH);
      ctx.strokeStyle = 'rgba(255,255,255,0.42)'; ctx.lineWidth = 1;
      ctx.strokeRect(vL + 0.5, 0.5, Math.max(1, vR - vL - 1), mmH - 1);

      if (popupOffset > 0) {
          const px = (popupOffset / dur) * mmW;
          ctx.strokeStyle = 'rgba(255,255,255,0.68)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, mmH); ctx.stroke();
      }
  }

  // ── Zoom ──
  function updateZoomDisplay($) {
      if (!popupBuffer) { $('popup-zoom-level').textContent = '1×'; return; }
      const z = popupBuffer.duration / (popupZoomEnd - popupZoomStart);
      $('popup-zoom-level').textContent = (z < 10 ? z.toFixed(1) : z.toFixed(0)) + '×';
  }

  function setZoomWindow(s, e, $) {
      if (!popupBuffer) return;
      const dur = popupBuffer.duration, minW = dur / 64;
      let sz = Math.max(minW, e - s);
      let ns = Math.max(0, s), ne = Math.min(dur, ns + sz);
      if (ne >= dur) { ne = dur; ns = Math.max(0, ne - sz); }
      popupZoomStart = ns; popupZoomEnd = ne;
      updateZoomDisplay($); updateHandles($); renderWaveform($); renderMinimap($);
  }

  function zoomAtX(canvasX, factor, $) {
      if (!popupBuffer) return;
      const anchor = xToTime(canvasX);
      const newW = Math.max(popupBuffer.duration / 64, Math.min(popupBuffer.duration, (popupZoomEnd - popupZoomStart) / factor));
      const rel = (anchor - popupZoomStart) / (popupZoomEnd - popupZoomStart);
      setZoomWindow(anchor - rel * newW, anchor - rel * newW + newW, $);
  }

  // ── Handles ──
  function updateHandles($) {
      if (!popupBuffer) return;
      $('popup-h-left').style.left  = (timeToX(popupLoopStart) / cW * 100).toFixed(3) + '%';
      $('popup-h-right').style.left = (timeToX(popupLoopEnd)   / cW * 100).toFixed(3) + '%';
      $('popup-tag-left').textContent  = fmtTime(popupLoopStart);
      $('popup-tag-right').textContent = fmtTime(popupLoopEnd);
  }

  function startHandleDrag(side, e, $) {
      dragging = side; dragMoved = false;
      dragX0 = (e.touches ? e.touches[0] : e).clientX;
      dragVal0 = popupLoopStart;
      dragLoopStart0 = popupLoopStart;
      dragLoopDuration = Math.max(0, popupLoopEnd - popupLoopStart);
      e.preventDefault(); e.stopPropagation();
  }

  function onMouseMove(e, $) {
      if (mmDrag && popupBuffer) {
          const dx = e.clientX - mmX0, dur = popupBuffer.duration;
          const dt = (dx / mmW) * dur;
          let ns = mmZS0 + dt, ne = mmZE0 + dt;
          if (ns < 0) { ne -= ns; ns = 0; }
          if (ne > dur) { ns -= (ne - dur); ne = dur; } ns = Math.max(0, ns);
          popupZoomStart = ns; popupZoomEnd = ne;
          updateZoomDisplay($); updateHandles($); renderWaveform($); renderMinimap($);
          return;
      }
      if (!dragging || !popupBuffer) return;
      dragMoved = true;
      const cx = (e.touches ? e.touches[0] : e).clientX;
      const wWrap = document.getElementById('popup-wave-wrap');
      if (!wWrap) return;
      const rect = wWrap.getBoundingClientRect();
      const dt = ((cx - dragX0) / rect.width) * (popupZoomEnd - popupZoomStart);
      const beat = popupBpm > 0 ? 60 / popupBpm : 0;
      const loopDuration = Math.max(0, dragLoopDuration || (popupLoopEnd - popupLoopStart));
      let ns = dragLoopStart0 + dt;
      if (beat > 0) ns = Math.round(ns / beat) * beat;
      const maxStart = Math.max(0, popupBuffer.duration - loopDuration);
      ns = Math.max(0, Math.min(ns, maxStart));
      popupLoopStart = ns;
      popupLoopEnd = Math.min(popupBuffer.duration, popupLoopStart + loopDuration);
      updateHandles($); renderWaveform($); renderMinimap($); updateLoopInfo($);
      if (popupIsPlaying && popupSource && popupLoopOn) {
          popupSource.loopStart = popupLoopStart; popupSource.loopEnd = popupLoopEnd;
      }
  }

  function onMouseUp($) {
      if (dragging) {
          if (dragMoved && popupIsPlaying) { popupPause(); popupPlay($); }
          dragging = null;
      } else { dragMoved = false; }
      mmDrag = false;
  }

  // ── Loop info ──
  function updateLoopInfo($) {
      if (!popupBuffer) return;
      $('popup-loop-time-info').textContent = `${popupLoopStart.toFixed(2)}s → ${popupLoopEnd.toFixed(2)}s · ${(popupLoopEnd - popupLoopStart).toFixed(3)}s`;
      $('popup-stat-loop').textContent = `${popupLoopStart.toFixed(2)}s – ${popupLoopEnd.toFixed(2)}s`;
  }

  function getLoopBarDuration() {
      return popupBpm > 0 ? (60 / popupBpm) * 4 : 0;
  }

  function getMaxLoopBars() {
      if (!popupBuffer) return 999;
      const barDur = getLoopBarDuration();
      if (barDur <= 0) return 999;
      return Math.max(1, Math.floor(((popupBuffer.duration - popupLoopStart) / barDur) + 1e-6));
  }

  function syncBarsLimit($) {
      const maxBars = getMaxLoopBars();
      const barsInput = $('popup-bars-val');
      popupLoopBars = Math.max(1, Math.min(popupLoopBars, maxBars));
      if (barsInput) {
          barsInput.max = String(maxBars);
          barsInput.value = popupLoopBars;
      }
      const decrBtn = $('popup-bars-decr');
      const incrBtn = $('popup-bars-incr');
      if (decrBtn) decrBtn.disabled = popupLoopBars <= 1;
      if (incrBtn) incrBtn.disabled = popupLoopBars >= maxBars;
      return maxBars;
  }

  function updateLoopEnd($) {
      if (!popupBuffer || popupBpm <= 0) return;
      syncBarsLimit($);
      const desiredDuration = Math.min(getLoopBarDuration() * popupLoopBars, popupBuffer.duration);
      if (popupLoopStart + desiredDuration > popupBuffer.duration) {
          popupLoopStart = Math.max(0, popupBuffer.duration - desiredDuration);
      }
      popupLoopEnd = Math.min(popupLoopStart + desiredDuration, popupBuffer.duration);
  }

  function applyLoopChange($) {
      updateLoopEnd($);
      syncBarsLimit($);
      updateHandles($); renderWaveform($); renderMinimap($); updateLoopInfo($);
      if (popupIsPlaying) { popupPause(); popupPlay($); }
  }

  function commitBPM($) {
      const v = +$('popup-bpm-input').value;
      if (v >= 40 && v <= 300) {
          popupBpm = v;
          // Persist immediately, not only on Apply, so the tempo survives a
          // Cancel and is restored the next time the modal opens.
          loopSettings.bpm = popupBpm;
          loopSettings.bpmUserSet = true;
          $('popup-stat-beat').textContent = (60 / popupBpm).toFixed(3) + 's';
          applyLoopChange($);
      } else { $('popup-bpm-input').value = popupBpm; }
  }

  function commitBars($) {
      const maxBars = getMaxLoopBars();
      const v = parseInt($('popup-bars-val').value);
      if (!Number.isNaN(v) && v >= 1) {
          popupLoopBars = Math.min(maxBars, v);
          applyLoopChange($);
      } else {
          $('popup-bars-val').value = popupLoopBars;
      }
  }

  // ── Playback ──
  function ensurePopupAudioGraph($) {
      if (popupCtx && popupGain) return true;
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
          console.warn('Loop preview audio is unavailable: AudioContext is not supported.');
          return false;
      }

      try {
          popupCtx = new AudioContextClass();
          popupGain = popupCtx.createGain();
          popupGain.gain.value = popupMuted ? 0 : popupVolume / 100;
          popupGain.connect(popupCtx.destination);
          return true;
      } catch (err) {
          console.warn('Loop preview audio could not initialize.', err);
          popupCtx = null;
          popupGain = null;
          const playButton = $('popup-play-btn');
          if (playButton) {
              playButton.disabled = true;
              playButton.title = 'Preview audio is unavailable in this browser.';
          }
          return false;
      }
  }

  function popupPlay($) {
      if (!popupBuffer || !ensurePopupAudioGraph($)) return;
      if (popupCtx.state === 'suspended') void popupCtx.resume();
      if (popupForceRestartFromLoopStart) popupOffset = popupLoopStart;
      if (popupLoopOn && (popupOffset < popupLoopStart || popupOffset >= popupLoopEnd)) popupOffset = popupLoopStart;
      popupSource = popupCtx.createBufferSource();
      popupSource.buffer = popupBuffer;
      popupSource.connect(popupGain);
      if (popupLoopOn) { popupSource.loop = true; popupSource.loopStart = popupLoopStart; popupSource.loopEnd = popupLoopEnd; }
      popupSource.start(0, popupOffset);
      popupCtxStart = popupCtx.currentTime - popupOffset;
      popupIsPlaying = true;
      $('popup-play-btn').innerHTML = '⏸ Pause'; $('popup-play-btn').classList.add('playing');
      document.getElementById('popup-playhead').style.display = 'block';
      popupSource.onended = () => {
          if (!popupLoopOn && popupIsPlaying) {
              popupIsPlaying = false;
              $('popup-play-btn').innerHTML = '▶ Play'; $('popup-play-btn').classList.remove('playing');
          }
      };
      if (popupAnimRaf) cancelAnimationFrame(popupAnimRaf);
      popupAnimRaf = requestAnimationFrame(ts => animLoop(ts, $));
  }

  function popupPause() {
      if (!popupIsPlaying) return;
      popupOffset = getLiveTime();
      if (popupSource) { popupSource.onended = null; try { popupSource.stop(); } catch (_) {} popupSource = null; }
      popupIsPlaying = false;
      const el = document.getElementById('popup-play-btn');
      if (el) { el.innerHTML = '▶ Play'; el.classList.remove('playing'); }
      if (popupAnimRaf) { cancelAnimationFrame(popupAnimRaf); popupAnimRaf = null; }
  }

  function popupStop($) {
      if (popupSource) { popupSource.onended = null; try { popupSource.stop(); } catch (_) {} popupSource = null; }
      popupIsPlaying = false;
      $('popup-play-btn').innerHTML = '▶ Play'; $('popup-play-btn').classList.remove('playing');
      if (popupAnimRaf) { cancelAnimationFrame(popupAnimRaf); popupAnimRaf = null; }
      popupOffset = popupLoopOn ? popupLoopStart : 0;
      updatePlayheadUI($, popupOffset); renderMinimap($);
      document.getElementById('popup-playhead').style.display = 'none';
  }

  function seekTo(t, $) {
      const was = popupIsPlaying; if (was) popupPause();
      popupOffset = Math.max(0, Math.min(t, popupBuffer ? popupBuffer.duration : 0));
      updatePlayheadUI($, popupOffset); renderMinimap($);
      if (was) popupPlay($);
  }

  function getLiveTime() {
      if (!popupIsPlaying || !popupCtx || !popupBuffer) return popupOffset;
      const el = popupCtx.currentTime - popupCtxStart;
      if (popupLoopOn) { const ld = popupLoopEnd - popupLoopStart; if (ld > 0) return popupLoopStart + ((el - popupLoopStart) % ld + ld) % ld; }
      return Math.min(el, popupBuffer.duration);
  }

  function updatePlayheadUI($, t) {
      if (!popupBuffer) return;
      const pct = t / popupBuffer.duration;
      document.getElementById('popup-progress-fill').style.width = (pct * 100) + '%';
      document.getElementById('popup-t-current').textContent = fmtTime(t);
      const px = timeToX(t);
      const ph = document.getElementById('popup-playhead');
      ph.style.left = px + 'px';
      ph.style.display = (px >= 0 && px <= cW) ? 'block' : 'none';
  }

  let lastMmTs = 0;
  function animLoop(ts, $) {
      if (!popupIsPlaying) return;
      const t = getLiveTime(); updatePlayheadUI($, t);
      if (ts - lastMmTs > 66) { renderMinimap($); lastMmTs = ts; }
      popupAnimRaf = requestAnimationFrame(ts2 => animLoop(ts2, $));
  }

  // ── Volume helpers ──
  function refreshVolSlider($) {
      const s = $('popup-vol-slider');
      s.style.background = `linear-gradient(90deg,rgba(255,42,26,0.92) ${popupVolume}%,rgba(255,255,255,0.12) ${popupVolume}%)`;
  }
  function updateVolIcon($) {
      const btn = $('popup-mute-btn');
      btn.textContent = popupMuted || popupVolume === 0 ? '🔇' : popupVolume < 40 ? '🔈' : popupVolume < 75 ? '🔉' : '🔊';
  }

  // ── Close popup ──
  function closePopup() {
      if (popupAnimRaf) { cancelAnimationFrame(popupAnimRaf); popupAnimRaf = null; }
      if (popupSource)  { try { popupSource.stop(); } catch (_) {} popupSource = null; }
      if (popupCtx)     { try { popupCtx.close(); }  catch (_) {} popupCtx = null; }
      if (popupResizeObs) { popupResizeObs.disconnect(); popupResizeObs = null; }
      if (popupDocMouseMoveHandler) { document.removeEventListener('mousemove', popupDocMouseMoveHandler); popupDocMouseMoveHandler = null; }
      if (popupDocMouseUpHandler) { document.removeEventListener('mouseup', popupDocMouseUpHandler); popupDocMouseUpHandler = null; }
      if (popupDocKeydownHandler) { document.removeEventListener('keydown', popupDocKeydownHandler, true); popupDocKeydownHandler = null; }
      const overlay = document.getElementById('loop-modal-overlay');
      if (overlay) overlay.remove();
      popupOpen = false; popupIsPlaying = false; popupBuffer = null; popupPeaks = null;
  }

  // ── Formatters ──
  const fmtTime = s => `${Math.floor(s / 60)}:${(s % 60).toFixed(3).padStart(6, '0')}`;
  const fmtDur  = s => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;


  // Host application bridge: apply/clear the popup selection on the main audio
  // element and update the same state used by playback and video export.
  function updateMainLoopButton() {
      syncLoopControlButton();
  }

  function applyAudioLoop(start, end) {
      const duration = getTransportDuration();
      if (!(duration > 0)) return;

      const nextStart = clamp(Number(start) || 0, 0, duration);
      const nextEnd = clamp(Number(end) || duration, nextStart + 0.01, duration);
      loopSettings.start = nextStart;
      loopSettings.end = nextEnd;
      loopSettings.bpm = clamp(Number(popupBpm) || loopSettings.bpm || 120, 40, 300);
      loopSettings.bars = Math.max(1, Math.round(Number(popupLoopBars) || 1));
      loopSettings.snapToBeats = true;
      loopSettings.enabled = nextEnd > nextStart + 0.005;

      updateAudioLoopMode();

      // Applying a loop is a deterministic transport operation: immediately
      // place the main playback head at the selected start so the next Play
      // action begins inside the committed region.
      if (loopSettings.enabled) {
          seekTransport(loopSettings.start);
          audioInfo.status = `Loop applied · ${formatTime(loopSettings.start, true)} – ${formatTime(loopSettings.end, true)}`;
      }

      updateMainLoopButton();
      refreshAudioInfo();
      window.dispatchEvent(new CustomEvent('visualizer-loop-changed', {
          detail: { start: loopSettings.start, end: loopSettings.end, enabled: loopSettings.enabled }
      }));
  }

  function clearAudioLoop() {
      const duration = getTransportDuration();
      loopSettings.enabled = false;
      loopSettings.start = 0;
      loopSettings.end = duration;
      updateAudioLoopMode();
      
      
      updateMainLoopButton();
      refreshAudioInfo();
      window.dispatchEvent(new CustomEvent('visualizer-loop-changed'));
  }
  return { open: openLoopPopup, close: closePopup, syncButton: updateMainLoopButton };
})();




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
    'Blue Slate': { type: 'image', url: new URL('../assets/backgrounds/BlueSlate/BlueSlate.jpg', import.meta.url).href },
    'Molten Rock': { type: 'image', url: new URL('../assets/backgrounds/MoltenRock/MoltenRock.jpg', import.meta.url).href },
    'Volcanic Eruption': { type: 'image', url: new URL('../assets/backgrounds/VolcanicEruption/VolcanicEruption.jpg', import.meta.url).href },
    'Violet Flux': { type: 'image', url: new URL('../assets/backgrounds/VioletFlux/VioletFlux.jpg', import.meta.url).href },
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
// Flat-image backgrounds were pinned to the original cubemap for reflections, so
// nothing the user selected ever showed up in the metal. Non-cube backgrounds now
// get a real pre-filtered environment map built from the same image.
const backgroundEnvironmentCache = new Map();
let pmremGenerator = null;
let defaultEnvironmentTexture = null;

// PMREMGenerator sizes its cube from source width / 4, so a 3840px background
// would allocate a 2880x3840 half-float target (~88 MB, twice over with the
// ping-pong buffer). Downsampling the source to 1024 lands on the 256px cube
// three documents as ideal and keeps the allocation near 6 MB.
function createEnvironmentSource(image) {
    const maxWidth = 1024;
    const sourceWidth = image.width || image.videoWidth || maxWidth;
    const sourceHeight = image.height || image.videoHeight || maxWidth;
    const width = Math.min(maxWidth, sourceWidth);
    const height = Math.max(1, Math.round((sourceHeight / sourceWidth) * width));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(image, 0, 0, width, height);

    const source = new THREE.CanvasTexture(canvas);
    source.colorSpace = THREE.SRGBColorSpace;
    return source;
}

// PMREMGenerator treats any non-cube texture as equirectangular, so the
// background texture itself needs no mapping change and scene.background keeps
// rendering exactly as before.
function getBackgroundEnvironment(name, texture) {
    const cached = backgroundEnvironmentCache.get(name);
    if (cached) return cached.texture;

    const image = texture.image;
    if (!image || !(image.width || image.videoWidth)) return null;

    if (!pmremGenerator) pmremGenerator = new THREE.PMREMGenerator(re);

    const source = createEnvironmentSource(image);
    try {
        const target = pmremGenerator.fromEquirectangular(source);
        backgroundEnvironmentCache.set(name, target);
        return target.texture;
    } finally {
        source.dispose();
    }
}
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
        } else {
            let environment = null;
            try {
                environment = getBackgroundEnvironment(name, texture);
            } catch (environmentError) {
                console.warn(`Environment map could not be generated for ${name}.`, environmentError);
            }
            scene.environment = environment || defaultEnvironmentTexture || cubeTexture;
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
const boxSegments = isMobileDevice() ? 4 : 6;
const boxCornerRadius = 0.9;
const radialSegments = isMobileDevice() ? 48 : 72;
const heightSegments = isMobileDevice() ? 18 : 32;
const icosahedron = new THREE.IcosahedronGeometry(4.5, polyDetail);
const dodecahedron = new THREE.DodecahedronGeometry(4.5, polyDetail);
const octahedron = new THREE.OctahedronGeometry(4.5, polyDetail + 1);
// Rounded corners. RoundedBoxGeometry expands its segment count to
// segments * 2 + 1 and returns a non-indexed buffer, so 6 segments lands at
// 6084 vertices — close to the 6534 the previous 32-segment BoxGeometry fed
// into the particle system, keeping particle density unchanged.
const cube = new RoundedBoxGeometry(7.2, 7.2, 7.2, boxSegments, boxCornerRadius);
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

const visualSettings = {
    exposure: 1.1,
    environmentIntensity: 1.15,
    roughnessVariation: 0.055,
    roughnessScale: 0.8,
    keyLightIntensity: 2.1,
    rimLightIntensity: 1.25,
};

// Surface presets. Only appearance properties are touched — colour, side and
// the dissolve shader injection stay under their existing controls. 'Metallic'
// reproduces the original material exactly.
const materialDefaults = {
    dispersion: 0.0, iridescenceIOR: 1.3, iridescenceThicknessRange: [100, 400],
    specularColor: 0xffffff,
};

const materialPresets = {
    'Metallic': {
        metalness: 1.0, roughness: 0.09, transmission: 0.0, thickness: 0.0,
        ior: 1.5, iridescence: 0.0, clearcoat: 0.18, clearcoatRoughness: 0.08,
        specularIntensity: 1.0, envMapIntensity: 1.25,
        attenuationDistance: Infinity, attenuationColor: 0xffffff,
    },
    'Chrome': {
        metalness: 1.0, roughness: 0.02, transmission: 0.0, thickness: 0.0,
        ior: 1.5, iridescence: 0.0, clearcoat: 0.0, clearcoatRoughness: 0.0,
        specularIntensity: 1.0, envMapIntensity: 1.6,
        attenuationDistance: Infinity, attenuationColor: 0xffffff,
    },
    'Liquid Glass': {
        metalness: 0.0, roughness: 0.02, transmission: 1.0, thickness: 3.4,
        ior: 1.5, iridescence: 0.28, clearcoat: 1.0, clearcoatRoughness: 0.0,
        specularIntensity: 1.0, envMapIntensity: 2.0,
        attenuationDistance: 3.2, attenuationColor: 0xbfe3ff,
        // Splits the refracted backdrop per channel — the single biggest
        // readability win for thick glass against a busy environment.
        dispersion: 0.18,
        iridescenceIOR: 1.25, iridescenceThicknessRange: [120, 520],
        specularColor: 0xffffff,
    },
    'Frosted Glass': {
        metalness: 0.0, roughness: 0.32, transmission: 1.0, thickness: 4.2,
        ior: 1.42, iridescence: 0.0, clearcoat: 0.6, clearcoatRoughness: 0.22,
        specularIntensity: 1.0, envMapIntensity: 1.5,
        attenuationDistance: 2.4, attenuationColor: 0xc2dcff,
        dispersion: 0.05,
        iridescenceIOR: 1.3, iridescenceThicknessRange: [100, 400],
        specularColor: 0xffffff,
    },
    'Matte': {
        metalness: 0.1, roughness: 0.85, transmission: 0.0, thickness: 0.0,
        ior: 1.5, iridescence: 0.0, clearcoat: 0.0, clearcoatRoughness: 0.0,
        specularIntensity: 0.4, envMapIntensity: 0.8,
        attenuationDistance: Infinity, attenuationColor: 0xffffff,
    },
};
const materialNames = Object.keys(materialPresets);
let currentMaterialName = materialNames[0];

function applyMaterialPreset(name) {
    const preset = materialPresets[name];
    if (!preset) return;

    // transmission, iridescence and dispersion each toggle a shader define, so
    // the program has to be rebuilt when a preset crosses zero on any of them.
    const nextDispersion = preset.dispersion ?? materialDefaults.dispersion;
    const needsRecompile =
        (phyMat.transmission > 0) !== (preset.transmission > 0) ||
        (phyMat.iridescence > 0) !== (preset.iridescence > 0) ||
        (phyMat.dispersion > 0) !== (nextDispersion > 0);

    phyMat.metalness = preset.metalness;
    phyMat.roughness = preset.roughness;
    phyMat.transmission = preset.transmission;
    phyMat.thickness = preset.thickness;
    phyMat.ior = preset.ior;
    phyMat.iridescence = preset.iridescence;
    phyMat.clearcoat = preset.clearcoat;
    phyMat.clearcoatRoughness = preset.clearcoatRoughness;
    phyMat.specularIntensity = preset.specularIntensity;
    phyMat.envMapIntensity = preset.envMapIntensity * visualSettings.environmentIntensity;
    phyMat.attenuationDistance = preset.attenuationDistance;
    phyMat.attenuationColor.set(preset.attenuationColor);

    // Glass-only properties fall back to three's own defaults so a non-glass
    // preset always clears whatever the previous one set.
    phyMat.dispersion = nextDispersion;
    phyMat.iridescenceIOR = preset.iridescenceIOR ?? materialDefaults.iridescenceIOR;
    phyMat.iridescenceThicknessRange = [...(preset.iridescenceThicknessRange ?? materialDefaults.iridescenceThicknessRange)];
    phyMat.specularColor.set(preset.specularColor ?? materialDefaults.specularColor);

    if (needsRecompile) phyMat.needsUpdate = true;
    currentMaterialName = name;
}

function applyVisualSettings() {
    re.toneMappingExposure = visualSettings.exposure;
    keyLight.intensity = visualSettings.keyLightIntensity;
    rimLight.intensity = visualSettings.rimLightIntensity;
    dissolveUniformData.uRoughnessVariation.value = visualSettings.roughnessVariation;
    dissolveUniformData.uRoughnessScale.value = visualSettings.roughnessScale;

    const preset = materialPresets[currentMaterialName];
    if (preset) phyMat.envMapIntensity = preset.envMapIntensity * visualSettings.environmentIntensity;
    if (typeof innerMat !== 'undefined' && innerMat) {
        innerMat.envMapIntensity = 0.55 * visualSettings.environmentIntensity;
    }
}


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
    },
    uMotionAngle: {
        value: 0.0
    },
    uMotionOffset: {
        value: new THREE.Vector3(0, 0, 0)
    },
    uEdgeBloomBoost: {
        value: 1.0
    },
    uEdgeCoreColor: {
        value: new THREE.Color(0xe8f6ff)
    },
    uEdgeCoreWidth: {
        value: 0.22
    },
    uEdgeIntensity: {
        value: 1.65
    },
    uEdgeSoftness: {
        value: 1.45
    },
    uRoughnessVariation: {
        value: visualSettings.roughnessVariation
    },
    uRoughnessScale: {
        value: visualSettings.roughnessScale
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
        uniform float uMotionAngle;
        uniform vec3 uMotionOffset;
        uniform vec3 uEdgeColor;
        uniform float uEdgeBloomBoost;
        uniform vec3 uEdgeCoreColor;
        uniform float uEdgeCoreWidth;
        uniform float uEdgeIntensity;
        uniform float uEdgeSoftness;
        uniform float uRoughnessVariation;
        uniform float uRoughnessScale;

        ${snoise}
    `);

    // Small-scale roughness variation gives reflections real surface breakup
    // without changing the silhouette or adding expensive texture assets.
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        float surfaceRoughnessNoise = snoise(vPos * uRoughnessScale);
        roughnessFactor = clamp(roughnessFactor + surfaceRoughnessNoise * uRoughnessVariation, 0.02, 1.0);
    `);

    // Apply the dissolve before Three.js tone mapping / output-color conversion.
    // Writing gl_FragColor after those stages made the emissive edge get processed
    // inconsistently by the post-processing/export pipeline, which could encode it
    // as a dark/black contour in captured video.
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
        float motionCos = cos(uMotionAngle);
        float motionSin = sin(uMotionAngle);
        vec3 rotatedNoisePos = vec3(
            motionCos * vPos.x - motionSin * vPos.z,
            vPos.y,
            motionSin * vPos.x + motionCos * vPos.z
        );

        // Give the dissolve field a second-axis rotation plus a translated
        // 3D drift. This makes dissolved regions flow across and around the
        // surface rather than only orbiting around the mesh's Y axis.
        float tiltAngle = uMotionAngle * 0.73;
        float tiltCos = cos(tiltAngle);
        float tiltSin = sin(tiltAngle);
        vec3 tiltedNoisePos = vec3(
            rotatedNoisePos.x,
            tiltCos * rotatedNoisePos.y - tiltSin * rotatedNoisePos.z,
            tiltSin * rotatedNoisePos.y + tiltCos * rotatedNoisePos.z
        );
        vec3 movingNoisePos = tiltedNoisePos + uMotionOffset;
        float noise = snoise(movingNoisePos * uFreq) * uAmp;

        if(noise < uProgress) discard;

        float edgeWidth = uProgress + uEdge;
        if(noise > uProgress && noise < edgeWidth){
            // Layer the boundary into a white-hot inner core and a softer colored
            // outer falloff. UnrealBloomPass turns the HDR intensity into the
            // visible halo while the material remains export-safe.
            float edgeT = clamp((noise - uProgress) / max(uEdge, 0.0001), 0.0, 1.0);
            float outerFalloff = pow(max(0.0, 1.0 - edgeT), max(0.15, uEdgeSoftness));
            float core = 1.0 - smoothstep(0.0, max(0.01, uEdgeCoreWidth), edgeT);
            vec3 layeredEdgeColor = mix(uEdgeColor, uEdgeCoreColor, core);
            float layeredIntensity = uEdgeIntensity * (0.45 + outerFalloff * 1.35) + core * 1.85;
            outgoingLight = layeredEdgeColor * layeredIntensity * uEdgeBloomBoost;
            diffuseColor.a = 1.0;
        }

        #include <opaque_fragment>
    `);

}


phyMat.onBeforeCompile = (shader) => {
    setupUniforms(shader, dissolveUniformData);
    setupDissolveShader(shader);
}


mesh = new THREE.Mesh(meshGeo, phyMat);
scene.add(mesh);

// A slightly inset secondary shell gives dissolved regions physical depth rather
// than revealing the background immediately. It uses the same moving dissolve
// field but survives one additional noise band behind the outer surface.
const innerUniformData = {
    uProgress: dissolveUniformData.uProgress,
    uFreq: dissolveUniformData.uFreq,
    uAmp: dissolveUniformData.uAmp,
    uMotionAngle: dissolveUniformData.uMotionAngle,
    uMotionOffset: dissolveUniformData.uMotionOffset,
    uInnerDepth: { value: 2.25 },
    uInnerColor: { value: new THREE.Color(0x2aa7ff) },
    uInnerIntensity: { value: 1.35 },
};

const innerMat = new THREE.MeshPhysicalMaterial({
    color: 0x071019,
    metalness: 0.35,
    roughness: 0.46,
    clearcoat: 0.2,
    clearcoatRoughness: 0.22,
    side: THREE.DoubleSide,
    envMapIntensity: 0.55 * visualSettings.environmentIntensity,
});

function setupInnerShellShader(shader) {
    setupUniforms(shader, innerUniformData);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
        varying vec3 vInnerPos;
    `);
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vInnerPos = transformed;
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
        varying vec3 vInnerPos;
        uniform float uProgress;
        uniform float uFreq;
        uniform float uAmp;
        uniform float uMotionAngle;
        uniform vec3 uMotionOffset;
        uniform float uInnerDepth;
        uniform vec3 uInnerColor;
        uniform float uInnerIntensity;
        ${snoise}
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
        float innerMotionCos = cos(uMotionAngle);
        float innerMotionSin = sin(uMotionAngle);
        vec3 innerRotated = vec3(
            innerMotionCos * vInnerPos.x - innerMotionSin * vInnerPos.z,
            vInnerPos.y,
            innerMotionSin * vInnerPos.x + innerMotionCos * vInnerPos.z
        );
        float innerTiltAngle = uMotionAngle * 0.73;
        float innerTiltCos = cos(innerTiltAngle);
        float innerTiltSin = sin(innerTiltAngle);
        vec3 innerTilted = vec3(
            innerRotated.x,
            innerTiltCos * innerRotated.y - innerTiltSin * innerRotated.z,
            innerTiltSin * innerRotated.y + innerTiltCos * innerRotated.z
        );
        float innerNoise = snoise((innerTilted + uMotionOffset) * uFreq) * uAmp;
        if(innerNoise < uProgress - uInnerDepth) discard;
        float innerBand = clamp((innerNoise - (uProgress - uInnerDepth)) / max(0.001, uInnerDepth), 0.0, 1.0);
        outgoingLight += uInnerColor * uInnerIntensity * (1.0 - innerBand * 0.45);
        #include <opaque_fragment>
    `);
}
innerMat.onBeforeCompile = setupInnerShellShader;

let innerShellScale = 0.965;
let innerMesh = new THREE.Mesh(meshGeo, innerMat);
innerMesh.scale.setScalar(innerShellScale);
scene.add(innerMesh);

applyVisualSettings();
applyMaterialPreset(currentMaterialName);

let particleMesh;
let particleMat = new THREE.ShaderMaterial();
particleMat.transparent = true;
particleMat.blending = THREE.AdditiveBlending;
particleMat.depthWrite = false;
let particleCount = meshGeo.attributes.position.count;
let particleMaxOffsetArr; // -- how far a particle can go from its initial position 
let particleInitPosArr; // store the initial position of the particles -- particle position will reset here if it exceed maxoffset
let particleCurrPosArr; // use to update he position of the particle 
let particleVelocityArr; // velocity of each particle
let particleDistArr;
let particleRotationArr;
let particleNormalArr;
// Stable per-particle randoms. Keeping the raw values lets Lifetime and Count be
// re-derived without reshuffling, so changing either never scrambles the swarm.
let particleLifeRandArr;
let particleSeedArr;
let particleData = {
    particleSpeedFactor: 0.02, // for tweaking velocity 
    velocityFactor: { x: 2.5, y: 2 },
    waveAmplitude: 0,
    particleCountRatio: 1,
    particleLifetime: 1,
    boundaryPush: 0.72,
}


function initParticleAttributes(meshGeo) {
    particleCount = meshGeo.attributes.position.count;
    particleMaxOffsetArr = new Float32Array(particleCount);
    particleInitPosArr = new Float32Array(meshGeo.getAttribute('position').array);
    particleCurrPosArr = new Float32Array(meshGeo.getAttribute('position').array);
    particleVelocityArr = new Float32Array(particleCount * 3);
    particleDistArr = new Float32Array(particleCount);
    particleRotationArr = new Float32Array(particleCount);
    particleNormalArr = new Float32Array(meshGeo.getAttribute('normal').array);
    particleLifeRandArr = new Float32Array(particleCount);
    particleSeedArr = new Float32Array(particleCount);

    const lifetime = Math.max(0.05, Number(particleData.particleLifetime) || 1);

    for (let i = 0; i < particleCount; i++) {
        let x = i * 3 + 0;
        let y = i * 3 + 1;
        let z = i * 3 + 2;

        particleLifeRandArr[i] = Math.random();
        particleSeedArr[i] = Math.random();
        particleMaxOffsetArr[i] = (particleLifeRandArr[i] * 5.5 + 1.5) * lifetime;

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
    meshGeo.setAttribute('aSeed', new THREE.BufferAttribute(particleSeedArr, 1));
}


// Lifetime scales the reset distance. Re-deriving from the stored randoms keeps
// each particle's relative range intact instead of redrawing the distribution.
function applyParticleLifetime() {
    if (!particleMaxOffsetArr || !particleLifeRandArr) return;
    const lifetime = Math.max(0.05, Number(particleData.particleLifetime) || 1);
    for (let i = 0; i < particleCount; i++) {
        particleMaxOffsetArr[i] = (particleLifeRandArr[i] * 5.5 + 1.5) * lifetime;
    }
    const offsetAttribute = meshGeo?.getAttribute('aOffset');
    if (offsetAttribute) offsetAttribute.needsUpdate = true;
}


// Count is expressed as a fraction of the mesh's vertices. Each particle owns a
// fixed seed and is active while that seed falls under the ratio, so raising the
// control adds particles without moving the ones already on screen.
function getActiveParticleCount() {
    if (!particleSeedArr) return 0;
    const ratio = clamp(Number(particleData.particleCountRatio) || 0, 0, 1);
    let active = 0;
    for (let i = 0; i < particleCount; i++) {
        if (particleSeedArr[i] <= ratio) active++;
    }
    return active;
}


function updateParticleAttributes() {
    const speed = Math.abs(particleData.particleSpeedFactor);
    const velocityX = particleData.velocityFactor.x;
    const velocityY = particleData.velocityFactor.y;
    const waveAmplitude = particleData.waveAmplitude;
    const countRatio = clamp(Number(particleData.particleCountRatio) || 0, 0, 1);

    for (let i = 0; i < particleCount; i++) {
        // Hidden particles cost nothing: lowering Count is a real CPU saving,
        // not just a visual mask.
        if (particleSeedArr[i] > countRatio) continue;

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

        // Emit away from the current dissolve boundary first, then let the
        // existing turbulence carry the particle. Mesh normals make this work
        // consistently across spheres, knots, boxes and every other mesh option.
        const normalPush = particleData.boundaryPush * 4.0;
        const nx = particleNormalArr[x] || 0;
        const ny = particleNormalArr[y] || 0;
        const nz = particleNormalArr[z] || 0;
        const vx = (nx * normalPush + particleVelocityArr[x] * velocityX + xwave * 0.28) * speed;
        const vy = (ny * normalPush + particleVelocityArr[y] * velocityY + ywave * 0.28) * speed;
        const vz = (nz * normalPush + particleVelocityArr[z]) * speed;

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
    // Same uniform objects the mesh dissolve uses, so the particle band samples
    // an identical noise field rather than a static one.
    uMotionAngle: dissolveUniformData.uMotionAngle,
    uMotionOffset: dissolveUniformData.uMotionOffset,
    uBaseSize: {
        value: isMobileDevice() ? 40 : 80,
    },
    uCountRatio: {
        value: particleData.particleCountRatio,
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
    uniform float uMotionAngle;
    uniform vec3 uMotionOffset;
    uniform float uCountRatio;

    varying float vNoise;
    varying float vAngle;
    varying float vActive;
    varying float vLife;

    attribute vec3 aCurrentPos;
    attribute float aDist;
    attribute float aOffset;
    attribute float aAngle;
    attribute float aSeed;

    void main() {
        vec3 pos = position;

        vActive = aSeed <= uCountRatio ? 1.0 : 0.0;

        // The mesh dissolve samples its noise through a rotated, tilted and
        // translated field. Reproduce that transform exactly here — sampling at
        // the untransformed rest position left the particle band pinned to a
        // static field while the mesh edge travelled, so the two drifted apart.
        float motionCos = cos(uMotionAngle);
        float motionSin = sin(uMotionAngle);
        vec3 rotatedNoisePos = vec3(
            motionCos * pos.x - motionSin * pos.z,
            pos.y,
            motionSin * pos.x + motionCos * pos.z
        );

        float tiltAngle = uMotionAngle * 0.73;
        float tiltCos = cos(tiltAngle);
        float tiltSin = sin(tiltAngle);
        vec3 tiltedNoisePos = vec3(
            rotatedNoisePos.x,
            tiltCos * rotatedNoisePos.y - tiltSin * rotatedNoisePos.z,
            tiltSin * rotatedNoisePos.y + tiltCos * rotatedNoisePos.z
        );
        vec3 movingNoisePos = tiltedNoisePos + uMotionOffset;

        float noise = snoise(movingNoisePos * uFreq) * uAmp;
        vNoise =noise;

        vAngle = aAngle;

        if( vNoise > uProgress-2.0 && vNoise < uProgress + uEdge+2.0){
            pos = aCurrentPos;
        }

        vec4 modelPosition = modelMatrix * vec4(pos, 1.0);
        vec4 viewPosition = viewMatrix * modelPosition;
        vec4 projectedPosition = projectionMatrix * viewPosition;
        gl_Position = projectedPosition;

        vLife = clamp(1.0 - (aDist / max(aOffset, 0.001)), 0.0, 1.0);
        float size = uBaseSize * uPixelDensity;
        size = size / (aDist + 1.0);
        size *= mix(0.3, 1.0, vLife);
        gl_PointSize = (size / -viewPosition.z) * vActive;
}
`;

particleMat.fragmentShader = `
    uniform vec3 uColor;
    uniform float uEdge;
    uniform float uProgress;
    uniform sampler2D uTexture;

    varying float vNoise;
    varying float vAngle;
    varying float vActive;
    varying float vLife;

    void main(){
        // Some drivers clamp gl_PointSize up to 1.0, so the count gate is
        // enforced here as well as in the vertex stage.
        if( vActive < 0.5 ) discard;
        if( vLife <= 0.01 ) discard;
        if( vNoise < uProgress ) discard;
        if( vNoise > uProgress + uEdge) discard;

        vec2 coord = gl_PointCoord;
        coord = coord - 0.5; // get the coordinate from 0-1 ot -0.5 to 0.5
        coord = coord * mat2(cos(vAngle),sin(vAngle) , -sin(vAngle), cos(vAngle)); // apply the rotation transformaion
        coord = coord +  0.5; // reset the coordinate to 0-1  

        vec4 texture = texture2D(uTexture,coord);

        gl_FragColor = vec4(uColor.xyz * texture.xyz * vLife, texture.a * vLife);
    }
`;


particleMesh = new THREE.Points(meshGeo, particleMat);
scene.add(particleMesh);


function resizeRendererToDisplaySize() {
    const width = exportOverrideSize ? exportOverrideSize.width : cnvs.clientWidth * scale;
    const height = exportOverrideSize ? exportOverrideSize.height : cnvs.clientHeight * scale;

    // Export dimensions are already physical output pixels. Rendering them again
    // at the display DPR (often 2x) made a 1080p export render internally at up to
    // 2160p and, because canvas.width no longer matched `width`, forced every
    // composer/render target to be resized on every animation frame. That causes
    // heavy allocation churn and visible judder in moving/rotating backgrounds.
    const targetPixelRatio = exportOverrideSize ? 1 : displayPixelRatio;
    const drawingWidth = Math.max(1, Math.floor(width * targetPixelRatio));
    const drawingHeight = Math.max(1, Math.floor(height * targetPixelRatio));
    const pixelRatioChanged = Math.abs(re.getPixelRatio() - targetPixelRatio) > 1e-6;
    const needResize = pixelRatioChanged || cnvs.width !== drawingWidth || cnvs.height !== drawingHeight;

    if (needResize) {
        if (pixelRatioChanged) {
            re.setPixelRatio(targetPixelRatio);
            effectComposer1.setPixelRatio(targetPixelRatio);
            effectComposer2.setPixelRatio(targetPixelRatio);
        }

        re.setSize(width, height, false);
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
    edgeCoreColor: "#" + dissolveUniformData.uEdgeCoreColor.value.getHexString(),
    edgeCoreWidth: dissolveUniformData.uEdgeCoreWidth.value,
    edgeIntensity: dissolveUniformData.uEdgeIntensity.value,
    edgeSoftness: dissolveUniformData.uEdgeSoftness.value,
    innerDepth: innerUniformData.uInnerDepth.value,
    innerColor: "#" + innerUniformData.uInnerColor.value.getHexString(),
    innerIntensity: innerUniformData.uInnerIntensity.value,
    innerScale: innerShellScale,
    autoDissolve: false,

    particleVisible: true,
    particleBaseSize: particlesUniformData.uBaseSize.value,
    particleColor: "#" + particlesUniformData.uColor.value.getHexString(),
    particleSpeedFactor: particleData.particleSpeedFactor,
    velocityFactor: particleData.velocityFactor,
    waveAmplitude: particleData.waveAmplitude,
    particleCountPercent: particleData.particleCountRatio * 100,
    particleLifetime: particleData.particleLifetime,
    particleBoundaryPush: particleData.boundaryPush,
    particleActiveCount: particleCount,

    bloomStrength: unrealBloomPass.strength,
    rotationY: mesh.rotation.y,
    meshAutoRotate: false,
    meshRotationSpeed: 0.35,
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
    scene.remove(innerMesh);
    scene.remove(particleMesh);

    meshGeo = geo;
    mesh = new THREE.Mesh(geo, phyMat);
    innerMesh = new THREE.Mesh(geo, innerMat);
    innerMesh.scale.setScalar(tweaks?.innerScale ?? innerShellScale);

    initParticleAttributes(geo);
    particleMesh = new THREE.Points(geo, particleMat);
    mesh.visible = tweaks?.meshVisible ?? true;
    innerMesh.visible = tweaks?.meshVisible ?? true;
    particleMesh.visible = tweaks?.particleVisible ?? true;
    if (tweaks) {
        mesh.rotation.y = innerMesh.rotation.y = particleMesh.rotation.y = tweaks.rotationY;
    }

    scene.add(innerMesh);
    scene.add(mesh);
    scene.add(particleMesh);
    if (name) currentMeshName = name;
    syncParticleCountReadout();
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

function updateCameraMotion(time, audio, delta) {
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
        orbCtrls.update(delta);
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
    orbCtrls.update(delta);
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
        material: currentMaterialName,
        viewport: { ...viewportSettings },
        camera: { ...cameraSettings },
        visual: { ...visualSettings },
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
            edgeCoreColor: tweaks.edgeCoreColor,
            edgeCoreWidth: tweaks.edgeCoreWidth,
            edgeIntensity: tweaks.edgeIntensity,
            edgeSoftness: tweaks.edgeSoftness,
            innerDepth: tweaks.innerDepth,
            innerColor: tweaks.innerColor,
            innerIntensity: tweaks.innerIntensity,
            innerScale: tweaks.innerScale,
            autoDissolve: tweaks.autoDissolve,
        },
        particle: {
            particleVisible: tweaks.particleVisible,
            particleBaseSize: tweaks.particleBaseSize,
            particleColor: tweaks.particleColor,
            particleSpeedFactor: tweaks.particleSpeedFactor,
            velocityFactor: { ...particleData.velocityFactor },
            waveAmplitude: tweaks.waveAmplitude,
            particleCountPercent: tweaks.particleCountPercent,
            particleLifetime: tweaks.particleLifetime,
            particleBoundaryPush: tweaks.particleBoundaryPush,
        },
        bloomStrength: tweaks.bloomStrength,
        rotationY: tweaks.rotationY,
        meshAutoRotate: tweaks.meshAutoRotate,
        meshRotationSpeed: tweaks.meshRotationSpeed,
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
    if (data.visual) {
        Object.assign(visualSettings, data.visual);
        applyVisualSettings();
    }
    if (data.dissolve) {
        Object.assign(tweaks, data.dissolve);
        dissolveUniformData.uProgress.value = tweaks.dissolveProgress;
        dissolveUniformData.uEdge.value = tweaks.edgeWidth;
        dissolveUniformData.uAmp.value = tweaks.amplitude;
        dissolveUniformData.uFreq.value = tweaks.frequency;
        phyMat.color.set(tweaks.meshColor);
        dissolveUniformData.uEdgeColor.value.set(tweaks.edgeColor);
        dissolveUniformData.uEdgeCoreColor.value.set(tweaks.edgeCoreColor);
        dissolveUniformData.uEdgeCoreWidth.value = tweaks.edgeCoreWidth;
        dissolveUniformData.uEdgeIntensity.value = tweaks.edgeIntensity;
        dissolveUniformData.uEdgeSoftness.value = tweaks.edgeSoftness;
        innerUniformData.uInnerDepth.value = tweaks.innerDepth;
        innerUniformData.uInnerColor.value.set(tweaks.innerColor);
        innerUniformData.uInnerIntensity.value = tweaks.innerIntensity;
        innerShellScale = tweaks.innerScale;
        mesh.visible = innerMesh.visible = tweaks.meshVisible;
    }
    if (data.particle) {
        Object.assign(tweaks, data.particle);
        particlesUniformData.uBaseSize.value = tweaks.particleBaseSize;
        particlesUniformData.uColor.value.set(tweaks.particleColor);
        particleData.particleSpeedFactor = tweaks.particleSpeedFactor;
        particleData.waveAmplitude = tweaks.waveAmplitude;
        if (data.particle.velocityFactor) Object.assign(particleData.velocityFactor, data.particle.velocityFactor);
        if (Number.isFinite(data.particle.particleCountPercent)) {
            particleData.particleCountRatio = clamp(tweaks.particleCountPercent / 100, 0, 1);
            particlesUniformData.uCountRatio.value = particleData.particleCountRatio;
        }
        if (Number.isFinite(data.particle.particleLifetime)) {
            particleData.particleLifetime = tweaks.particleLifetime;
            applyParticleLifetime();
        }
        if (Number.isFinite(data.particle.particleBoundaryPush)) {
            particleData.boundaryPush = tweaks.particleBoundaryPush;
        }
        particleMesh.visible = tweaks.particleVisible;
        syncParticleCountReadout();
    }
    if (Number.isFinite(data.bloomStrength)) {
        tweaks.bloomStrength = data.bloomStrength;
        unrealBloomPass.strength = data.bloomStrength;
    }
    if (Number.isFinite(data.rotationY)) {
        tweaks.rotationY = data.rotationY;
        mesh.rotation.y = innerMesh.rotation.y = particleMesh.rotation.y = data.rotationY;
    }
    if (typeof data.meshAutoRotate === 'boolean') tweaks.meshAutoRotate = data.meshAutoRotate;
    if (Number.isFinite(data.meshRotationSpeed)) tweaks.meshRotationSpeed = data.meshRotationSpeed;
    if (data.material && materialPresets[data.material]) applyMaterialPreset(data.material);
    if (data.background && backgroundPresets[data.background]) await loadBackground(data.background);
    if (data.mesh && geoNames.includes(data.mesh)) handleMeshChange(geometries[geoNames.indexOf(data.mesh)], data.mesh);
    fitViewport();
    cameraSettingsDirty = true;
    updateAudioLoopMode();
    refreshPane();
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
        refreshPane();
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
    if (!decodedAudioBuffer) {
        exportSettings.status = 'Load audio before video export';
        refreshPane();
        return;
    }
    if (!window.MediaRecorder || !cnvs.captureStream) {
        exportSettings.status = 'Video export unsupported';
        refreshPane();
        return;
    }

    ensureAudioAnalyser();
    if (audioContext.state === 'suspended') await audioContext.resume();
    exportOverrideSize = getExportDimensions();
    resizeRendererToDisplaySize();

    const frameRate = Number(exportSettings.frameRate) || 60;
    const canvasStream = cnvs.captureStream(frameRate);
    const videoTrack = canvasStream.getVideoTracks()[0];
    if (videoTrack && 'contentHint' in videoTrack) videoTrack.contentHint = 'motion';
    const tracks = videoTrack ? [videoTrack] : [];
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
        refreshPane();
    });

    const duration = getTransportDuration();
    const useLoopRange = loopSettings.enabled && duration > 0;
    const start = useLoopRange ? Math.max(0, loopSettings.start) : 0;
    const end = useLoopRange ? Math.min(duration, loopSettings.end || duration) : duration;
    exportPreviousLoop = loopSettings.enabled;
    loopSettings.enabled = false;
    updateAudioLoopMode();
    seekTransport(start);
    exportStopAt = end;
    exportSettings.status = 'Exporting video…';
    mediaRecorder.start(500);
    await playTransport();
    refreshPane();
}

fitViewport();
window.addEventListener('resize', () => fitViewport());

// Section defaults are captured once from the live initial state rather than
// written out a second time, so a control's default and its reset value cannot
// drift apart. Everything here is read after all module state is constructed.
const sectionDefaults = {
    audioReactive: { ...audioReactive },
    audioFftSize: audioSettings.fftSize,
    audioVolume: audioInfo.volume,
    audioMuted: audioInfo.muted,
    viewport: { ...viewportSettings },
    camera: { ...cameraSettings },
    visual: { ...visualSettings },
    background: currentBackgroundName,
    meshName: geoNames[0],
    materialName: currentMaterialName,
    mesh: {
        bloomStrength: tweaks.bloomStrength,
        meshAutoRotate: tweaks.meshAutoRotate,
        meshRotationSpeed: tweaks.meshRotationSpeed,
        rotationY: tweaks.rotationY,
    },
    dissolve: {
        meshVisible: tweaks.meshVisible,
        dissolveProgress: tweaks.dissolveProgress,
        autoDissolve: tweaks.autoDissolve,
        edgeWidth: tweaks.edgeWidth,
        frequency: tweaks.frequency,
        amplitude: tweaks.amplitude,
        meshColor: tweaks.meshColor,
        edgeColor: tweaks.edgeColor,
        edgeCoreColor: tweaks.edgeCoreColor,
        edgeCoreWidth: tweaks.edgeCoreWidth,
        edgeIntensity: tweaks.edgeIntensity,
        edgeSoftness: tweaks.edgeSoftness,
        innerDepth: tweaks.innerDepth,
        innerColor: tweaks.innerColor,
        innerIntensity: tweaks.innerIntensity,
        innerScale: tweaks.innerScale,
    },
    particle: {
        particleVisible: tweaks.particleVisible,
        particleBaseSize: tweaks.particleBaseSize,
        particleColor: tweaks.particleColor,
        particleSpeedFactor: tweaks.particleSpeedFactor,
        waveAmplitude: tweaks.waveAmplitude,
        velocityFactor: { ...particleData.velocityFactor },
        particleCountPercent: tweaks.particleCountPercent,
        particleLifetime: tweaks.particleLifetime,
        particleBoundaryPush: tweaks.particleBoundaryPush,
    },
    exportSettings: { ...exportSettings },
};

const controlsContainer = document.getElementById('controls');
if (!controlsContainer) throw new Error('Controls container was not found.');

let pane = null;
let meshBlade = null;
let rotationYBinding = null;
// Same guard rationale as the seek binding: refreshing a bound value re-emits
// 'change', and the auto-rotate loop writes rotationY every frame.
let suppressRotationYChange = false;
let progressBinding = null;
let particleActiveBinding = null;

function syncParticleCountReadout() {
    if (!tweaks) return;
    tweaks.particleActiveCount = getActiveParticleCount();
    if (particleActiveBinding) particleActiveBinding.refresh();
}
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
        // Each section's reset pushes its defaults through the same setters the
        // bindings use, then refreshes the pane via the guarded helper. List
        // blades are not bindings, so refreshPane() cannot sync them — their
        // values are assigned explicitly, which fires their own change handlers.
        const addResetButton = (folder, apply) => {
            folder.addButton({ title: 'Reset to Defaults' }).on('click', () => {
                apply();
                refreshPane();
            });
        };
        fpsBinding = controller.addBinding(performanceStats, 'fps', { label: 'FPS', readonly: true });

        const audioFolder = controller.addFolder({ title: 'Audio Source', expanded: true });
        audioFolder.addButton({ title: 'Load Audio File' }).on('click', () => audioFileInput.click());
        audioFolder.addButton({ title: 'Play / Pause' }).on('click', () => { void toggleAudioPlayback(); });

        const metadataFolder = audioFolder.addFolder({ title: 'Audio Metadata', expanded: false });
        audioInfoBindings = [
            metadataFolder.addBinding(audioInfo, 'name', { label: 'Name', readonly: true }),
            metadataFolder.addBinding(audioInfo, 'type', { label: 'Type', readonly: true }),
            metadataFolder.addBinding(audioInfo, 'size', { label: 'Size', readonly: true }),
            metadataFolder.addBinding(audioInfo, 'duration', { label: 'Duration', readonly: true }),
            metadataFolder.addBinding(audioInfo, 'sampleRate', { label: 'Sample Rate', readonly: true }),
            metadataFolder.addBinding(audioInfo, 'channels', { label: 'Channels', readonly: true }),
            metadataFolder.addBinding(audioInfo, 'decode', { label: 'Decode', readonly: true }),
            audioFolder.addBinding(audioInfo, 'status', { label: 'Status', readonly: true }),
            audioFolder.addBinding(audioInfo, 'currentTime', { label: 'Time', readonly: true }),
        ];
        seekBinding = audioFolder.addBinding(audioInfo, 'seekPercent', { min: 0, max: 100, step: 0.1, label: 'Seek %' }).on('change', (event) => {
            if (suppressSeekBindingChange) return;
            const duration = getTransportDuration();
            if (duration > 0) seekTransport(duration * (event.value / 100));
        });
        audioFolder.addBinding(audioInfo, 'volume', { min: 0, max: 100, step: 1, label: 'Volume' }).on('change', () => {
            applyAudioOutputGain();
        });
        audioFolder.addBinding(audioInfo, 'muted', { label: 'Mute' }).on('change', () => {
            applyAudioOutputGain();
        });

        loopButtonController = audioFolder.addButton({ title: 'Loop' });
        loopButtonController.disabled = !decodedAudioBuffer;
        loopButtonController.on('click', () => galaxyLoopController.open());

        syncLoopControlButton();

        const audioResolutionFolder = audioFolder.addFolder({ title: 'Audio Resolution', expanded: false });
        const fftBlade = createTweakList(
            audioResolutionFolder,
            'FFT',
            ['1× (256)', '2× (512)', '4× (1024)', '8× (2048)', '16× (4096)', '32× (8192)', '64× (16384)'],
            [256, 512, 1024, 2048, 4096, 8192, 16384],
        );
        fftBlade.value = audioSettings.fftSize;
        fftBlade.on('change', (event) => setAudioResolution(event.value));
        addResetButton(audioResolutionFolder, () => {
            setAudioResolution(sectionDefaults.audioFftSize);
            fftBlade.value = sectionDefaults.audioFftSize;
        });

        audioFolder.addBinding(audioReactive, 'sensitivity', { min: 0.1, max: 4, step: 0.01, label: 'Sensitivity' });
        audioFolder.addBinding(audioReactive, 'smoothing', { min: 0, max: 0.95, step: 0.01, label: 'Smoothing' });

        const reactivityFolder = audioFolder.addFolder({ title: 'Reactivity', expanded: true });
        reactivityFolder.addBinding(audioReactive, 'lowMeshSizeResponse', { min: 0, max: 1.5, step: 0.01, label: 'Low → Mesh Size' });
        reactivityFolder.addBinding(audioReactive, 'bloomResponse', { min: 0, max: 5, step: 0.01, label: 'Bloom' });
        reactivityFolder.addBinding(audioReactive, 'particleSizeResponse', { min: 0, max: 5, step: 0.01, label: 'Particle Size' });
        reactivityFolder.addBinding(audioReactive, 'particleSpeedResponse', { min: 0, max: 5, step: 0.01, label: 'Particle Speed' });
        reactivityFolder.addBinding(audioReactive, 'dissolveMotionResponse', { min: 0, max: 5, step: 0.01, label: 'Dissolve Motion' });
        addResetButton(reactivityFolder, () => {
            for (const key of ['lowMeshSizeResponse', 'bloomResponse', 'particleSizeResponse', 'particleSpeedResponse', 'dissolveMotionResponse']) {
                audioReactive[key] = sectionDefaults.audioReactive[key];
            }
        });

        const frequencyFolder = audioFolder.addFolder({ title: 'Frequency Bands', expanded: false });
        frequencyFolder.addBinding(audioReactive, 'bassMinHz', { min: 20, max: 20000, step: 10, label: 'Low Min Hz' });
        frequencyFolder.addBinding(audioReactive, 'bassMaxHz', { min: 20, max: 20000, step: 10, label: 'Low Max Hz' });
        frequencyFolder.addBinding(audioReactive, 'midsMinHz', { min: 20, max: 20000, step: 10, label: 'Mids Min Hz' });
        frequencyFolder.addBinding(audioReactive, 'midsMaxHz', { min: 20, max: 20000, step: 10, label: 'Mids Max Hz' });
        frequencyFolder.addBinding(audioReactive, 'highsMinHz', { min: 20, max: 20000, step: 10, label: 'Highs Min Hz' });
        frequencyFolder.addBinding(audioReactive, 'highsMaxHz', { min: 20, max: 20000, step: 10, label: 'Highs Max Hz' });
        addResetButton(frequencyFolder, () => {
            for (const key of ['bassMinHz', 'bassMaxHz', 'midsMinHz', 'midsMaxHz', 'highsMinHz', 'highsMaxHz']) {
                audioReactive[key] = sectionDefaults.audioReactive[key];
            }
        });

        // Placed after the sub-folders so it renders at the end of Audio Source.
        addResetButton(audioFolder, () => {
            Object.assign(audioReactive, sectionDefaults.audioReactive);
            setAudioResolution(sectionDefaults.audioFftSize);
            fftBlade.value = sectionDefaults.audioFftSize;
            audioInfo.volume = sectionDefaults.audioVolume;
            audioInfo.muted = sectionDefaults.audioMuted;
            applyAudioOutputGain();
        });

        const viewportFolder = controller.addFolder({ title: 'Viewport', expanded: false });
        const viewportBlade = createTweakList(viewportFolder, 'Format', Object.keys(viewportAspects), Object.keys(viewportAspects));
        viewportBlade.value = viewportSettings.format;
        viewportBlade.on('change', (event) => {
            viewportSettings.format = event.value;
            fitViewport();
        });
        addResetButton(viewportFolder, () => {
            viewportBlade.value = sectionDefaults.viewport.format;
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
        addResetButton(cameraFolder, () => {
            Object.assign(cameraSettings, sectionDefaults.camera);
            cameraPresetBlade.value = sectionDefaults.camera.preset;
            cameraSettingsDirty = true;
        });

        const backgroundFolder = controller.addFolder({ title: 'Background', expanded: false });
        const backgroundBlade = createTweakList(backgroundFolder, 'Background', backgroundNames, backgroundNames);
        backgroundBlade.value = currentBackgroundName;
        backgroundBlade.on('change', (event) => { void loadBackground(event.value); });
        addResetButton(backgroundFolder, () => {
            backgroundBlade.value = sectionDefaults.background;
        });

        const meshFolder = controller.addFolder({ title: 'Mesh', expanded: false });
        meshBlade = createTweakList(meshFolder, 'Mesh', geoNames, geometries);
        meshBlade.value = geometries[0];
        meshBlade.on('change', (event) => {
            const index = geometries.indexOf(event.value);
            handleMeshChange(event.value, geoNames[index] || currentMeshName);
        });
        const materialBlade = createTweakList(meshFolder, 'Material', materialNames, materialNames);
        materialBlade.value = currentMaterialName;
        materialBlade.on('change', (event) => applyMaterialPreset(event.value));

        const lightingFolder = meshFolder.addFolder({ title: 'Lighting & Surface', expanded: false });
        lightingFolder.addBinding(visualSettings, 'exposure', { min: 0.35, max: 2.5, step: 0.01, label: 'Exposure' }).on('change', applyVisualSettings);
        lightingFolder.addBinding(visualSettings, 'environmentIntensity', { min: 0, max: 3, step: 0.01, label: 'Environment' }).on('change', applyVisualSettings);
        lightingFolder.addBinding(visualSettings, 'roughnessVariation', { min: 0, max: 0.35, step: 0.001, label: 'Roughness Variation' }).on('change', applyVisualSettings);
        lightingFolder.addBinding(visualSettings, 'roughnessScale', { min: 0.05, max: 4, step: 0.01, label: 'Roughness Scale' }).on('change', applyVisualSettings);
        lightingFolder.addBinding(visualSettings, 'keyLightIntensity', { min: 0, max: 8, step: 0.05, label: 'Key Light' }).on('change', applyVisualSettings);
        lightingFolder.addBinding(visualSettings, 'rimLightIntensity', { min: 0, max: 8, step: 0.05, label: 'Rim Light' }).on('change', applyVisualSettings);
        addResetButton(lightingFolder, () => {
            Object.assign(visualSettings, sectionDefaults.visual);
            applyVisualSettings();
        });

        meshFolder.addBinding(tweaks, 'bloomStrength', { min: 0, max: 5, step: 0.01, label: 'Bloom Strength' }).on('change', (event) => {
            unrealBloomPass.strength = event.value;
        });
        meshFolder.addBinding(tweaks, 'meshAutoRotate', { label: 'Auto Rotate' });
        meshFolder.addBinding(tweaks, 'meshRotationSpeed', { min: -3, max: 3, step: 0.01, label: 'Rotate Speed' });
        rotationYBinding = meshFolder.addBinding(tweaks, 'rotationY', { min: -(Math.PI * 2), max: (Math.PI * 2), step: 0.01, label: 'Rotation Y' }).on('change', (event) => {
            if (suppressRotationYChange) return;
            particleMesh.rotation.y = innerMesh.rotation.y = mesh.rotation.y = event.value;
        });
        addResetButton(meshFolder, () => {
            meshBlade.value = geometries[geoNames.indexOf(sectionDefaults.meshName)];
            materialBlade.value = sectionDefaults.materialName;
            Object.assign(tweaks, sectionDefaults.mesh);
            unrealBloomPass.strength = tweaks.bloomStrength;
            particleMesh.rotation.y = innerMesh.rotation.y = mesh.rotation.y = tweaks.rotationY;
        });

        const dissolveFolder = controller.addFolder({ title: 'Dissolve Effect', expanded: false });
        dissolveFolder.addBinding(tweaks, 'meshVisible', { label: 'Visible' }).on('change', (event) => { mesh.visible = innerMesh.visible = event.value; });
        progressBinding = dissolveFolder.addBinding(tweaks, 'dissolveProgress', { min: -20, max: 20, step: 0.0001, label: 'Progress' }).on('change', (event) => { dissolveUniformData.uProgress.value = event.value; });
        dissolveFolder.addBinding(tweaks, 'autoDissolve', { label: 'Auto Animate' });
        dissolveFolder.addBinding(tweaks, 'edgeWidth', { min: 0.1, max: 8, step: 0.001, label: 'Edge Width' }).on('change', (event) => { dissolveUniformData.uEdge.value = event.value; });
        dissolveFolder.addBinding(tweaks, 'frequency', { min: 0.001, max: 2, step: 0.001, label: 'Frequency' }).on('change', (event) => { dissolveUniformData.uFreq.value = event.value; });
        dissolveFolder.addBinding(tweaks, 'amplitude', { min: 0.1, max: 20, step: 0.001, label: 'Amplitude' }).on('change', (event) => { dissolveUniformData.uAmp.value = event.value; });
        dissolveFolder.addBinding(tweaks, 'meshColor', { label: 'Mesh Color' }).on('change', (event) => { phyMat.color.set(event.value); });
        dissolveFolder.addBinding(tweaks, 'edgeColor', { label: 'Edge Color' }).on('change', (event) => { dissolveUniformData.uEdgeColor.value.set(event.value); });
        dissolveFolder.addBinding(tweaks, 'edgeCoreColor', { label: 'Core Color' }).on('change', (event) => { dissolveUniformData.uEdgeCoreColor.value.set(event.value); });
        dissolveFolder.addBinding(tweaks, 'edgeCoreWidth', { min: 0.02, max: 0.8, step: 0.01, label: 'Core Width' }).on('change', (event) => { dissolveUniformData.uEdgeCoreWidth.value = event.value; });
        dissolveFolder.addBinding(tweaks, 'edgeIntensity', { min: 0.1, max: 6, step: 0.01, label: 'Edge Intensity' }).on('change', (event) => { dissolveUniformData.uEdgeIntensity.value = event.value; });
        dissolveFolder.addBinding(tweaks, 'edgeSoftness', { min: 0.15, max: 4, step: 0.01, label: 'Edge Falloff' }).on('change', (event) => { dissolveUniformData.uEdgeSoftness.value = event.value; });
        dissolveFolder.addBinding(tweaks, 'innerDepth', { min: 0.1, max: 8, step: 0.01, label: 'Inner Depth' }).on('change', (event) => { innerUniformData.uInnerDepth.value = event.value; });
        dissolveFolder.addBinding(tweaks, 'innerColor', { label: 'Inner Color' }).on('change', (event) => { innerUniformData.uInnerColor.value.set(event.value); });
        dissolveFolder.addBinding(tweaks, 'innerIntensity', { min: 0, max: 6, step: 0.01, label: 'Inner Glow' }).on('change', (event) => { innerUniformData.uInnerIntensity.value = event.value; });
        dissolveFolder.addBinding(tweaks, 'innerScale', { min: 0.88, max: 0.995, step: 0.001, label: 'Inner Scale' }).on('change', (event) => { innerShellScale = event.value; });
        addResetButton(dissolveFolder, () => {
            Object.assign(tweaks, sectionDefaults.dissolve);
            dissolveUniformData.uProgress.value = tweaks.dissolveProgress;
            dissolveUniformData.uEdge.value = tweaks.edgeWidth;
            dissolveUniformData.uFreq.value = tweaks.frequency;
            dissolveUniformData.uAmp.value = tweaks.amplitude;
            dissolveUniformData.uEdgeColor.value.set(tweaks.edgeColor);
            dissolveUniformData.uEdgeCoreColor.value.set(tweaks.edgeCoreColor);
            dissolveUniformData.uEdgeCoreWidth.value = tweaks.edgeCoreWidth;
            dissolveUniformData.uEdgeIntensity.value = tweaks.edgeIntensity;
            dissolveUniformData.uEdgeSoftness.value = tweaks.edgeSoftness;
            innerUniformData.uInnerDepth.value = tweaks.innerDepth;
            innerUniformData.uInnerColor.value.set(tweaks.innerColor);
            innerUniformData.uInnerIntensity.value = tweaks.innerIntensity;
            innerShellScale = tweaks.innerScale;
            phyMat.color.set(tweaks.meshColor);
            mesh.visible = innerMesh.visible = tweaks.meshVisible;
        });

        const particleFolder = controller.addFolder({ title: 'Particle Motion', expanded: false });
        particleFolder.addBinding(tweaks, 'particleVisible', { label: 'Visible' }).on('change', (event) => { particleMesh.visible = event.value; });
        particleFolder.addBinding(tweaks, 'particleBaseSize', { min: 10, max: 100, step: 0.01, label: 'Base Size' }).on('change', (event) => { particlesUniformData.uBaseSize.value = event.value; });
        particleFolder.addBinding(tweaks, 'particleColor', { label: 'Color' }).on('change', (event) => { particlesUniformData.uColor.value.set(event.value); });
        particleFolder.addBinding(tweaks, 'particleSpeedFactor', { min: 0.001, max: 0.1, step: 0.001, label: 'Speed' }).on('change', (event) => { particleData.particleSpeedFactor = event.value; });
        particleFolder.addBinding(tweaks, 'waveAmplitude', { min: 0, max: 5, step: 0.01, label: 'Wave Amplitude' }).on('change', (event) => { particleData.waveAmplitude = event.value; });
        particleFolder.addBinding(tweaks, 'particleBoundaryPush', { min: 0, max: 3, step: 0.01, label: 'Boundary Push' }).on('change', (event) => { particleData.boundaryPush = event.value; });
        particleFolder.addBinding(tweaks, 'velocityFactor', { expanded: true, picker: 'inline', label: 'Velocity Factor' }).on('change', (event) => { particleData.velocityFactor = event.value; });
        particleFolder.addBinding(tweaks, 'particleCountPercent', { min: 0, max: 100, step: 1, label: 'Count %' }).on('change', (event) => {
            particleData.particleCountRatio = clamp(event.value / 100, 0, 1);
            particlesUniformData.uCountRatio.value = particleData.particleCountRatio;
            syncParticleCountReadout();
        });
        particleActiveBinding = particleFolder.addBinding(tweaks, 'particleActiveCount', { label: 'Particles', readonly: true, format: (value) => Math.round(value).toLocaleString() });
        particleFolder.addBinding(tweaks, 'particleLifetime', { min: 0.05, max: 5, step: 0.01, label: 'Lifetime' }).on('change', (event) => {
            particleData.particleLifetime = event.value;
            applyParticleLifetime();
        });
        addResetButton(particleFolder, () => {
            Object.assign(tweaks, sectionDefaults.particle);
            tweaks.velocityFactor = { ...sectionDefaults.particle.velocityFactor };
            particlesUniformData.uBaseSize.value = tweaks.particleBaseSize;
            particlesUniformData.uColor.value.set(tweaks.particleColor);
            particleData.particleSpeedFactor = tweaks.particleSpeedFactor;
            particleData.waveAmplitude = tweaks.waveAmplitude;
            particleData.boundaryPush = tweaks.particleBoundaryPush;
            particleData.velocityFactor = tweaks.velocityFactor;
            particleData.particleCountRatio = clamp(tweaks.particleCountPercent / 100, 0, 1);
            particlesUniformData.uCountRatio.value = particleData.particleCountRatio;
            particleData.particleLifetime = tweaks.particleLifetime;
            applyParticleLifetime();
            particleMesh.visible = tweaks.particleVisible;
            syncParticleCountReadout();
        });
        syncParticleCountReadout();

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
        addResetButton(exportFolder, () => {
            Object.assign(exportSettings, sectionDefaults.exportSettings);
            exportResolutionBlade.value = exportSettings.resolution;
            exportFpsBlade.value = exportSettings.frameRate;
            exportBitrateBlade.value = exportSettings.bitrateMbps;
            exportTypeBlade.value = exportSettings.videoType;
        });
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


function animateMeshRotation(delta) {
    if (!tweaks.meshAutoRotate) return;
    const speed = Number(tweaks.meshRotationSpeed) || 0;
    if (speed === 0) return;

    const twoPi = Math.PI * 2;
    let next = tweaks.rotationY + speed * delta;
    // The Rotation Y control is bounded to ±2π. Wrapping by a full 4π keeps the
    // slider inside that range without any visible jump, since +2π and -2π are
    // the same orientation.
    if (next > twoPi) next -= twoPi * 2;
    else if (next < -twoPi) next += twoPi * 2;

    tweaks.rotationY = next;
    mesh.rotation.y = innerMesh.rotation.y = particleMesh.rotation.y = next;
}


function floatMeshes(time) {
    const floatY = Math.sin(time * 2.0) * 0.5;
    mesh.position.set(0, floatY, 0);
    innerMesh.position.set(0, floatY, 0);
    particleMesh.position.set(0, floatY, 0);
}


const clock = new THREE.Clock();
let dissolveMotionPhase = 0;
let previousAnimationTime = performance.now();
let lastTransportUiUpdate = 0;
function animate() {
    let time = clock.getElapsedTime();
    const animationNow = performance.now();
    const animationDelta = Math.min(0.1, Math.max(0, (animationNow - previousAnimationTime) / 1000));
    previousAnimationTime = animationNow;

    animateDissolve();
    animateMeshRotation(animationDelta);

    // Apply the requested frequency mapping without changing the underlying
    // control values: lows scale the mesh, while mids/highs drive bloom and
    // particle sprite size. Silence returns every audio-driven value to baseline.
    const baseParticleSize = particlesUniformData.uBaseSize.value;
    const baseParticleSpeed = particleData.particleSpeedFactor;
    const baseBloomStrength = Math.max(0, Number(tweaks.bloomStrength) || 0);
    const audio = readAudioLevels();

    // Move the existing dissolve field dynamically through 3D object space
    // without changing the dissolve threshold. Overall level controls travel
    // speed while bass/mids/highs independently influence the spatial drift.
    // Silence freezes the current pattern in place.
    if (audioReactive.dissolveMotionResponse > 0 && audio.level > 0) {
        dissolveMotionPhase += audio.level * audioReactive.dissolveMotionResponse * animationDelta * 2.5;

        dissolveUniformData.uMotionAngle.value = dissolveMotionPhase;
        dissolveUniformData.uMotionOffset.value.set(
            Math.sin(dissolveMotionPhase * 0.83) * (2.0 + audio.mids * 6.0),
            Math.cos(dissolveMotionPhase * 0.61) * (1.5 + audio.highs * 5.0),
            Math.sin(dissolveMotionPhase * 0.47 + 1.2) * (2.0 + audio.bass * 6.0)
        );
    } else if (audioReactive.dissolveMotionResponse <= 0) {
        dissolveMotionPhase = 0;
        dissolveUniformData.uMotionAngle.value = 0;
        dissolveUniformData.uMotionOffset.value.set(0, 0, 0);
    }

    enforceAudioLoopRange();

    if (animationNow - lastTransportUiUpdate >= 200) {
        const duration = getTransportDuration();
        const currentTime = getTransportTime();
        audioInfo.currentTime = formatTime(currentTime);
        audioInfo.seekPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
        refreshSeekBinding();
        const timeBinding = audioInfoBindings[audioInfoBindings.length - 1];
        if (timeBinding) timeBinding.refresh();
        if (tweaks.meshAutoRotate) refreshRotationYBinding();
        lastTransportUiUpdate = animationNow;
    }

    const meshScale = 1 + audio.bass * audioReactive.lowMeshSizeResponse;
    mesh.scale.setScalar(meshScale);
    innerMesh.scale.setScalar(meshScale * innerShellScale);
    particleMesh.scale.setScalar(meshScale);

    const midHighMagnitude = Math.min(1, audio.mids * 0.55 + audio.highs * 0.65);
    const reactiveBloomAmount = midHighMagnitude * audioReactive.bloomResponse;
    unrealBloomPass.strength = baseBloomStrength + reactiveBloomAmount;
    // Feed the same reactive bloom amount into the emissive dissolve edge so
    // the edge itself becomes a stronger bloom source as mids/highs rise.
    dissolveUniformData.uEdgeBloomBoost.value = 1 + reactiveBloomAmount;
    particlesUniformData.uBaseSize.value = baseParticleSize * (1 + midHighMagnitude * audioReactive.particleSizeResponse);
    // Overall level drives how fast particles travel away from the surface, so
    // the swarm accelerates with the track and settles back in silence.
    particleData.particleSpeedFactor = baseParticleSpeed * (1 + audio.level * audioReactive.particleSpeedResponse);

    updateCameraMotion(time, audio, animationDelta);

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

    if (mediaRecorder?.state === 'recording' && exportStopAt != null && getTransportTime() >= exportStopAt - 0.02) {
        pauseTransport();
        stopVideoExport();
    }

    // Restore baseline values so audio reactivity never rewrites user controls.
    particlesUniformData.uBaseSize.value = baseParticleSize;
    particleData.particleSpeedFactor = baseParticleSpeed;
    unrealBloomPass.strength = baseBloomStrength;
    dissolveUniformData.uEdgeBloomBoost.value = 1;

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
