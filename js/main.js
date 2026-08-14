import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { TeapotGeometry } from 'three/addons/geometries/TeapotGeometry.js';
import { Pane } from 'https://cdn.jsdelivr.net/npm/tweakpane@4.0.5/+esm';

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
re.setPixelRatio(window.devicePixelRatio);
re.setSize(cnvs.clientWidth * scale, cnvs.clientHeight * scale, false);
re.toneMapping = THREE.CineonToneMapping;
re.outputColorSpace = THREE.SRGBColorSpace;


const effectComposer1 = new EffectComposer(re);
const renderPass = new RenderPass(scene, cam);
let radius = isMobileDevice() ? 0.1 : 0.25;
const unrealBloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerHeight * scale, window.innerWidth * scale), 0.5, radius, 0.2);
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
    shapeResponse: 0.9,
    dissolveResponse: 4.5,
    particleResponse: 2.0,
    bloomResponse: 1.8,
};

function ensureAudioAnalyser() {
    if (!audioContext) {
        audioContext = new AudioContext();
    }

    if (!audioAnalyser) {
        audioAnalyser = audioContext.createAnalyser();
        audioAnalyser.fftSize = 1024;
        audioAnalyser.smoothingTimeConstant = audioReactive.smoothing;
        audioFrequencyData = new Uint8Array(audioAnalyser.frequencyBinCount);
    }

    if (!audioSource) {
        audioSource = audioContext.createMediaElementSource(audioElement);
        audioSource.connect(audioAnalyser);
        audioAnalyser.connect(audioContext.destination);
    }
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
    const bass = Math.min(1, getBandLevel(20, 180) * sensitivity);
    const mids = Math.min(1, getBandLevel(180, 2200) * sensitivity);
    const highs = Math.min(1, getBandLevel(2200, 12000) * sensitivity);
    const level = Math.min(1, ((bass * 0.5) + (mids * 0.3) + (highs * 0.2)));

    return { bass, mids, highs, level };
}

async function toggleAudioPlayback() {
    if (!audioElement.src) {
        audioFileInput.click();
        return;
    }

    ensureAudioAnalyser();
    if (audioContext?.state === 'suspended') await audioContext.resume();

    if (audioElement.paused) await audioElement.play();
    else audioElement.pause();
}

audioFileInput.addEventListener('change', async () => {
    const file = audioFileInput.files?.[0];
    if (!file) return;

    if (audioObjectUrl) URL.revokeObjectURL(audioObjectUrl);
    audioObjectUrl = URL.createObjectURL(file);
    audioElement.src = audioObjectUrl;
    audioElement.load();

    ensureAudioAnalyser();
    if (audioContext?.state === 'suspended') await audioContext.resume();
    await audioElement.play();
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
cubeTextureUrls = generateCubeUrls(cubeMap2Url, '.png');


async function loadTextures() {

    const cubeTextureLoader = new THREE.CubeTextureLoader();
    cubeTexture = await cubeTextureLoader.loadAsync(cubeTextureUrls);

    scene.background = cubeTexture;
    scene.environment = cubeTexture;

    cubeCamera.update(re, scene);

    document.body.classList.remove("loading");
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
let geoNames = ["TorusKnot", "Tea Pot", "Sphere", "Torus"];
let geometries = [torusKnot, teaPot, sphere, torus];


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

const shapeUniformData = {
    uShapeBass: { value: 0 },
    uShapeMids: { value: 0 },
    uShapeHighs: { value: 0 },
    uShapeTime: { value: 0 },
    uShapeStrength: { value: audioReactive.shapeResponse },
};


function setupUniforms(shader, uniforms) {
    const keys = Object.keys(uniforms);
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        shader.uniforms[key] = uniforms[key];
    }
}

function setupDissolveShader(shader) {
    // Deform the metallic mesh along its surface normals using separate audio
    // bands. With zero audio input every offset resolves to zero, so the
    // original geometry is preserved exactly when playback stops.
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
        varying vec3 vPos;

        uniform float uShapeBass;
        uniform float uShapeMids;
        uniform float uShapeHighs;
        uniform float uShapeTime;
        uniform float uShapeStrength;

        ${snoise}
    `);

    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 shapeNormal = normalize(normal);

        float bassWave = 0.5 + 0.5 * sin(
            position.y * 1.35 - uShapeTime * 5.0 +
            sin(position.x * 0.65 + position.z * 0.65)
        );

        float midWave = snoise(
            position * 0.48 + vec3(
                uShapeTime * 0.55,
                -uShapeTime * 0.35,
                uShapeTime * 0.25
            )
        );

        float highWave = snoise(
            position * 1.85 + vec3(
                -uShapeTime * 1.15,
                uShapeTime * 0.95,
                uShapeTime * 1.25
            )
        );

        float shapeOffset = uShapeStrength * (
            uShapeBass * (0.20 + bassWave * 0.55) +
            uShapeMids * midWave * 0.24 +
            uShapeHighs * highWave * 0.07
        );

        transformed += shapeNormal * shapeOffset;
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
    setupUniforms(shader, shapeUniformData);
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
    meshGeo.setAttribute('aCurrentPos', new THREE.BufferAttribute(particleCurrPosArr, 3));
    meshGeo.setAttribute('aVelocity', new THREE.BufferAttribute(particleVelocityArr, 3));
    meshGeo.setAttribute('aDist', new THREE.BufferAttribute(particleDistArr, 1));
    meshGeo.setAttribute('aAngle', new THREE.BufferAttribute(particleRotationArr, 1));
}


function calculateWaveOffset(idx) {

    const posx = particleCurrPosArr[idx * 3 + 0];
    const posy = particleCurrPosArr[idx * 3 + 1];

    let xwave1 = Math.sin(posy * 2) * (0.8 + particleData.waveAmplitude);
    let ywave1 = Math.sin(posx * 2) * (0.6 + particleData.waveAmplitude);

    let xwave2 = Math.sin(posy * 5) * (0.2 + particleData.waveAmplitude);
    let ywave2 = Math.sin(posx * 1) * (0.9 + particleData.waveAmplitude);


    let xwave3 = Math.sin(posy * 8) * (0.8 + particleData.waveAmplitude);
    let ywave3 = Math.sin(posx * 5) * (0.6 + particleData.waveAmplitude);


    let xwave4 = Math.sin(posy * 3) * (0.8 + particleData.waveAmplitude);
    let ywave4 = Math.sin(posx * 7) * (0.6 + particleData.waveAmplitude);

    let xwave = xwave1 + xwave2 + xwave3 + xwave4;
    let ywave = ywave1 + ywave2 + ywave3 + ywave4;

    return { xwave, ywave }
}


function updateVelocity(idx) {

    let vx = particleVelocityArr[idx * 3 + 0];
    let vy = particleVelocityArr[idx * 3 + 1];
    let vz = particleVelocityArr[idx * 3 + 2];

    vx *= particleData.velocityFactor.x;
    vy *= particleData.velocityFactor.y;

    let { xwave, ywave } = calculateWaveOffset(idx);

    vx += xwave;
    vy += ywave;


    vx *= Math.abs(particleData.particleSpeedFactor);
    vy *= Math.abs(particleData.particleSpeedFactor);
    vz *= Math.abs(particleData.particleSpeedFactor);

    return { vx, vy, vz }
}


function updateParticleAttriutes() {
    for (let i = 0; i < particleCount; i++) {
        let x = i * 3 + 0;
        let y = i * 3 + 1;
        let z = i * 3 + 2;

        let { vx, vy, vz } = updateVelocity(i);

        particleCurrPosArr[x] += vx;
        particleCurrPosArr[y] += vy;
        particleCurrPosArr[z] += vz;

        const vec1 = new THREE.Vector3(particleInitPosArr[x], particleInitPosArr[y], particleInitPosArr[z]);
        const vec2 = new THREE.Vector3(particleCurrPosArr[x], particleCurrPosArr[y], particleCurrPosArr[z]);
        const dist = vec1.distanceTo(vec2);

        particleDistArr[i] = dist;
        particleRotationArr[i] += 0.01;

        if (dist > particleMaxOffsetArr[i]) {
            particleCurrPosArr[x] = particleInitPosArr[x];
            particleCurrPosArr[y] = particleInitPosArr[y];
            particleCurrPosArr[z] = particleInitPosArr[z];
        }
    }

    meshGeo.setAttribute('aOffset', new THREE.BufferAttribute(particleMaxOffsetArr, 1));
    meshGeo.setAttribute('aCurrentPos', new THREE.BufferAttribute(particleCurrPosArr, 3));
    meshGeo.setAttribute('aVelocity', new THREE.BufferAttribute(particleVelocityArr, 3));
    meshGeo.setAttribute('aDist', new THREE.BufferAttribute(particleDistArr, 1));
    meshGeo.setAttribute('aAngle', new THREE.BufferAttribute(particleRotationArr, 1));
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
    const width = cnvs.clientWidth * scale;
    const height = cnvs.clientHeight * scale;
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

    bloomStrength: shaderPass.uniforms.uStrength.value,
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


function handleMeshChange(geo) {
    scene.remove(mesh);
    scene.remove(particleMesh);

    meshGeo = geo;
    mesh = new THREE.Mesh(geo, phyMat);

    initParticleAttributes(geo);
    particleMesh = new THREE.Points(geo, particleMat);

    scene.add(mesh);
    scene.add(particleMesh);
}


const controlsContainer = document.getElementById('controls');
if (!controlsContainer) throw new Error('Controls container was not found.');

const pane = new Pane({
    title: 'Controls',
    expanded: true,
    container: controlsContainer,
});
const controller = pane;

const audioFolder = controller.addFolder({ title: "Audio", expanded: true });
audioFolder.addButton({ title: "Load Audio" }).on('click', () => audioFileInput.click());
audioFolder.addButton({ title: "Play / Pause" }).on('click', () => { void toggleAudioPlayback(); });
audioFolder.addBinding(audioReactive, "sensitivity", { min: 0.1, max: 4, step: 0.01, label: "Sensitivity" });
audioFolder.addBinding(audioReactive, "smoothing", { min: 0, max: 0.95, step: 0.01, label: "Smoothing" });
audioFolder.addBinding(audioReactive, "shapeResponse", { min: 0, max: 2.5, step: 0.01, label: "Shape" });
audioFolder.addBinding(audioReactive, "dissolveResponse", { min: 0, max: 10, step: 0.01, label: "Dissolve" });
audioFolder.addBinding(audioReactive, "particleResponse", { min: 0, max: 5, step: 0.01, label: "Particles" });
audioFolder.addBinding(audioReactive, "bloomResponse", { min: 0, max: 5, step: 0.01, label: "Bloom" });


const meshFolder = controller.addFolder({ title: "Mesh", expanded: false });
let meshBlade = createTweakList(meshFolder, 'Mesh', geoNames, geometries);
meshBlade.on('change', (val) => { handleMeshChange(val.value) });
meshFolder.addBinding(tweaks, "bloomStrength", { min: 1, max: 20, step: 0.01, label: "Bloom Strength" }).on('change', (obj) => { shaderPass.uniforms.uStrength.value = obj.value; })
meshFolder.addBinding(tweaks, "rotationY", { min: -(Math.PI * 2), max: (Math.PI * 2), step: 0.01, label: "Rotation Y" }).on('change', (obj) => { particleMesh.rotation.y = mesh.rotation.y = obj.value; });


const dissolveFolder = controller.addFolder({ title: "Dissolve Effect", expanded: false, });
dissolveFolder.addBinding(tweaks, "meshVisible", { label: "Visible" }).on('change', (obj) => { mesh.visible = obj.value; });
let progressBinding = dissolveFolder.addBinding(tweaks, "dissolveProgress", { min: -20, max: 20, step: 0.0001, label: "Progress" }).on('change', (obj) => { dissolveUniformData.uProgress.value = obj.value; });
dissolveFolder.addBinding(tweaks, "autoDissolve", { label: "Auto Animate" }).on('change', (obj) => { tweaks.autoDissolve = obj.value });
dissolveFolder.addBinding(tweaks, "edgeWidth", { min: 0.1, max: 8, step: 0.001, label: "Edge Width" }).on('change', (obj) => { dissolveUniformData.uEdge.value = obj.value });
dissolveFolder.addBinding(tweaks, "frequency", { min: 0.001, max: 2, step: 0.001, label: "Frequency" }).on('change', (obj) => { dissolveUniformData.uFreq.value = obj.value });
dissolveFolder.addBinding(tweaks, "amplitude", { min: 0.1, max: 20, step: 0.001, label: "Amplitude" }).on('change', (obj) => { dissolveUniformData.uAmp.value = obj.value });
dissolveFolder.addBinding(tweaks, "meshColor", { label: "Mesh Color" }).on('change', (obj) => { phyMat.color.set(obj.value) });
dissolveFolder.addBinding(tweaks, "edgeColor", { label: "Edge Color" }).on('change', (obj) => { dissolveUniformData.uEdgeColor.value.set(obj.value); });


const particleFolder = controller.addFolder({ title: "Particle", expanded: false });
particleFolder.addBinding(tweaks, "particleVisible", { label: "Visible" }).on('change', (obj) => { particleMesh.visible = obj.value; });
particleFolder.addBinding(tweaks, "particleBaseSize", { min: 10.0, max: 100, step: 0.01, label: "Base size" }).on('change', (obj) => { particlesUniformData.uBaseSize.value = obj.value; });
particleFolder.addBinding(tweaks, "particleColor", { label: "Color" }).on('change', (obj) => { particlesUniformData.uColor.value.set(obj.value); });
particleFolder.addBinding(tweaks, "particleSpeedFactor", { min: 0.001, max: 0.1, step: 0.001, label: "Speed" }).on('change', (obj) => { particleData.particleSpeedFactor = obj.value });
particleFolder.addBinding(tweaks, "waveAmplitude", { min: 0, max: 5, step: 0.01, label: "Wave Amp" }).on('change', (obj) => { particleData.waveAmplitude = obj.value; });
particleFolder.addBinding(tweaks, "velocityFactor", { expanded: true, picker: 'inline', label: "Velocity Factor" }).on('change', (obj) => { particleData.velocityFactor = obj.value });

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
        handleMeshChange(geometries[geoIdx % geoLength]);
                meshBlade.value = geometries[geoIdx % geoLength];
    };
    if (progress.value < -17 && !dissolving) dissolving = true;

    progressBinding.controller.value.setRawValue(progress.value);
}


function floatMeshes(time) {
    mesh.position.set(0, Math.sin(time * 2.0) * 0.5, 0);
    particleMesh.position.set(0, Math.sin(time * 2.0) * 0.5, 0);
}


const clock = new THREE.Clock();
function animate() {
    //   stat.update();
    orbCtrls.update();

    let time = clock.getElapsedTime();

    animateDissolve();

    // Keep the existing tweak values as the baseline and temporarily layer audio
    // response on top for this frame. This avoids audio permanently overwriting
    // any of the original controls.
    const baseProgress = dissolveUniformData.uProgress.value;
    const baseEdge = dissolveUniformData.uEdge.value;
    const baseParticleSpeed = particleData.particleSpeedFactor;
    const baseWaveAmplitude = particleData.waveAmplitude;
    const baseBloomStrength = shaderPass.uniforms.uStrength.value;

    const audio = readAudioLevels();

    // Shape reactivity is evaluated in the metallic material's vertex shader.
    // Bass creates broad traveling bulges, mids create organic surface waves,
    // and highs add fine vibration. All displacement follows the vertex normal.
    shapeUniformData.uShapeBass.value = audio.bass;
    shapeUniformData.uShapeMids.value = audio.mids;
    shapeUniformData.uShapeHighs.value = audio.highs;
    shapeUniformData.uShapeTime.value = time;
    shapeUniformData.uShapeStrength.value = audioReactive.shapeResponse;

    dissolveUniformData.uProgress.value = baseProgress + (audio.bass * audioReactive.dissolveResponse);
    dissolveUniformData.uEdge.value = baseEdge * (1 + audio.highs * 0.6);
    particleData.particleSpeedFactor = baseParticleSpeed * (1 + audio.mids * audioReactive.particleResponse);
    particleData.waveAmplitude = baseWaveAmplitude + (audio.bass * audioReactive.particleResponse);
    shaderPass.uniforms.uStrength.value = baseBloomStrength * (1 + audio.level * audioReactive.bloomResponse);

    updateParticleAttriutes();

    floatMeshes(time);

    if (resizeRendererToDisplaySize()) {
        const canvas = re.domElement;
        cam.aspect = canvas.clientWidth / canvas.clientHeight;
        cam.updateProjectionMatrix();
    }


    scene.background = blackColor;
    effectComposer1.render();

    scene.background = cubeTexture;
    effectComposer2.render();

    // Restore the original control values after rendering so the audio layer is
    // non-destructive and Auto Animate continues to operate exactly as before.
    dissolveUniformData.uProgress.value = baseProgress;
    dissolveUniformData.uEdge.value = baseEdge;
    particleData.particleSpeedFactor = baseParticleSpeed;
    particleData.waveAmplitude = baseWaveAmplitude;
    shaderPass.uniforms.uStrength.value = baseBloomStrength;

    requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

window.addEventListener('orientationchange', () => {
    location.reload();
});

