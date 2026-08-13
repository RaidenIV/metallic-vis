import * as THREE from 'three';

const vertexShader = /* glsl */`
  uniform float uTime;
  uniform float uRadius;
  uniform float uDeformation;
  uniform float uNoiseScale;
  uniform float uNoiseSpeed;
  uniform float uSurfaceDetail;
  uniform float uBass;
  uniform float uMids;
  uniform float uTreble;
  uniform float uLevel;
  uniform float uBeat;
  uniform float uPropagationSpeed;
  uniform float uPropagationWidth;
  uniform int uPropagationMode;

  varying vec3 vWorldPosition;
  varying vec3 vNormalW;
  varying float vAudio;
  varying float vDisplacement;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(.1,.2,.3));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
          mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
          mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z
    );
  }

  float fbm(vec3 p) {
    float value = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 5; i++) {
      value += amp * noise(p);
      p *= 2.03;
      amp *= 0.5;
    }
    return value;
  }

  float propagationMask(vec3 n, float t) {
    if (uPropagationMode == 0) return 1.0;
    float phase = fract(t * uPropagationSpeed);
    float coord = 0.0;

    if (uPropagationMode == 1) {
      coord = n.y * 0.5 + 0.5;
    } else if (uPropagationMode == 2) {
      coord = abs(n.y);
    } else if (uPropagationMode == 3) {
      coord = acos(clamp(dot(n, normalize(vec3(0.8, 0.55, 0.25))), -1.0, 1.0)) / 3.14159265;
    } else if (uPropagationMode == 4) {
      coord = fract(atan(n.z, n.x) / 6.2831853 + 0.5);
    } else {
      float angle = fract(atan(n.z, n.x) / 6.2831853 + 0.5);
      coord = fract(angle + (n.y * 0.5 + 0.5) * 0.65);
    }

    float d = abs(coord - phase);
    d = min(d, 1.0 - d);
    return 1.0 - smoothstep(uPropagationWidth, uPropagationWidth * 1.8, d);
  }

  void main() {
    vec3 baseNormal = normalize(position);
    float time = uTime * uNoiseSpeed;
    float lowNoise = fbm(baseNormal * uNoiseScale + vec3(time * 0.45));
    float midNoise = fbm(baseNormal * (uNoiseScale * 2.15) - vec3(time * 0.7));
    float fineNoise = fbm(baseNormal * (uNoiseScale * 5.25) + vec3(time * 1.35));

    float mask = propagationMask(baseNormal, uTime);
    float audioShape =
      uBass * (lowNoise - 0.43) * 1.85 +
      uMids * (midNoise - 0.5) * 0.92 +
      uTreble * (fineNoise - 0.5) * 0.45;

    float baseTexture = (fineNoise - 0.5) * uSurfaceDetail;
    float globalPulse = uLevel * 0.055 + uBeat * 0.13;
    float displacement = (audioShape * mask * uDeformation) + baseTexture + globalPulse;

    vec3 displaced = baseNormal * (uRadius + displacement);
    vec4 world = modelMatrix * vec4(displaced, 1.0);
    vWorldPosition = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * baseNormal);
    vAudio = clamp(uLevel * 0.7 + mask * (uBass + uMids + uTreble) * 0.22, 0.0, 1.5);
    vDisplacement = displacement;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */`
  uniform vec3 uBaseColor;
  uniform float uMetalness;
  uniform float uRoughness;
  uniform float uReflection;
  uniform vec3 uCameraPosition;
  uniform vec3 uKeyDirection;
  uniform vec3 uRimDirection;

  varying vec3 vWorldPosition;
  varying vec3 vNormalW;
  varying float vAudio;
  varying float vDisplacement;

  void main() {
    vec3 V = normalize(uCameraPosition - vWorldPosition);
    vec3 N = normalize(cross(dFdx(vWorldPosition), dFdy(vWorldPosition)));
    if (dot(N, V) < 0.0) N = -N;
    vec3 K = normalize(uKeyDirection);
    vec3 R = normalize(uRimDirection);

    float ndv = max(dot(N, V), 0.0);
    float fresnel = pow(1.0 - ndv, mix(5.5, 2.2, uRoughness));
    float key = pow(max(dot(reflect(-K, N), V), 0.0), mix(180.0, 8.0, uRoughness));
    float rim = pow(max(dot(reflect(-R, N), V), 0.0), 22.0);
    float diffuse = max(dot(N, K), 0.0) * (1.0 - uMetalness) * 0.35;

    vec3 chrome = uBaseColor * (0.18 + diffuse);
    chrome += vec3(1.0) * key * (1.15 + uReflection * 0.55);
    chrome += vec3(0.32, 0.48, 0.7) * rim * uReflection * 0.55;
    chrome += vec3(0.56, 0.65, 0.78) * fresnel * (0.3 + uReflection * 0.32);

    float ridge = smoothstep(0.05, 0.36, abs(vDisplacement));
    chrome += vec3(0.12, 0.28, 0.52) * ridge * vAudio * 0.65;

    gl_FragColor = vec4(chrome, 1.0);
  }
`;

export function createMetalSphere() {
  const geometry = new THREE.IcosahedronGeometry(1, 6);
  const uniforms = {
    uTime: { value: 0 },
    uRadius: { value: 2.35 },
    uDeformation: { value: 0.78 },
    uNoiseScale: { value: 2.6 },
    uNoiseSpeed: { value: 0.22 },
    uSurfaceDetail: { value: 0.18 },
    uBass: { value: 0 },
    uMids: { value: 0 },
    uTreble: { value: 0 },
    uLevel: { value: 0 },
    uBeat: { value: 0 },
    uPropagationSpeed: { value: 0.55 },
    uPropagationWidth: { value: 0.22 },
    uPropagationMode: { value: 1 },
    uBaseColor: { value: new THREE.Color(0x20242a) },
    uMetalness: { value: 1 },
    uRoughness: { value: 0.18 },
    uReflection: { value: 1.8 },
    uCameraPosition: { value: new THREE.Vector3(0, 0, 7.5) },
    uKeyDirection: { value: new THREE.Vector3(-0.55, 0.7, 0.4).normalize() },
    uRimDirection: { value: new THREE.Vector3(0.65, -0.15, -0.72).normalize() }
  };

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    side: THREE.FrontSide
  });

  const mesh = new THREE.Mesh(geometry, material);
  return { mesh, material, uniforms };
}
