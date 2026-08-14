import * as THREE from 'three';

export const METAL_PRESETS = Object.freeze({
  platinum: { color: 0xd9d8d2 },
  gold: { color: 0xd4af37 },
  titanium: { color: 0x747b80 }
});

export function applyMetalPreset(material, type = 'platinum') {
  const preset = METAL_PRESETS[type] ?? METAL_PRESETS.platinum;
  material.color.setHex(preset.color);
}

export function createMetalSphere() {
  const geometry = new THREE.SphereGeometry(1, 192, 128);

  const uniforms = {
    uTime: { value: 0 },
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
    uPropagationMode: { value: 1 }
  };

  const material = new THREE.MeshPhysicalMaterial({
    color: METAL_PRESETS.platinum.color,
    metalness: 1,
    roughness: 0.18,
    envMapIntensity: 1.8,
    dithering: true
  });

  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vSphereNormal;`
      )
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
        vSphereNormal = normalize(position);`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
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

        varying vec3 vSphereNormal;

        float sphereHash(vec3 p) {
          p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
          p *= 17.0;
          return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
        }

        float sphereNoise(vec3 x) {
          vec3 i = floor(x);
          vec3 f = fract(x);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(mix(sphereHash(i + vec3(0,0,0)), sphereHash(i + vec3(1,0,0)), f.x),
                mix(sphereHash(i + vec3(0,1,0)), sphereHash(i + vec3(1,1,0)), f.x), f.y),
            mix(mix(sphereHash(i + vec3(0,0,1)), sphereHash(i + vec3(1,0,1)), f.x),
                mix(sphereHash(i + vec3(0,1,1)), sphereHash(i + vec3(1,1,1)), f.x), f.y), f.z
          );
        }

        float sphereFbm(vec3 p) {
          float value = 0.0;
          float amp = 0.5;
          for (int i = 0; i < 5; i++) {
            value += amp * sphereNoise(p);
            p *= 2.03;
            amp *= 0.5;
          }
          return value;
        }

        float spherePropagationMask(vec3 n, float t) {
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
        }`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        vec3 sphereN = normalize(vSphereNormal);
        float sphereTime = uTime * uNoiseSpeed;
        float sphereMask = spherePropagationMask(sphereN, uTime);
        float sphereFineNoise = sphereFbm(sphereN * (uNoiseScale * 5.25) + vec3(sphereTime * 1.35));
        float sphereTexture = (sphereFineNoise - 0.5) * 2.0;
        float sphereAudio = clamp(
          uBass * 0.52 + uMids * 0.31 + uTreble * 0.17 + uLevel * 0.45 + uBeat * 0.35,
          0.0,
          1.75
        );
        float sphereAudioPolish = sphereMask * sphereAudio * uDeformation * 0.16;
        float sphereMicroRoughness = sphereTexture * uSurfaceDetail * 0.16;
        roughnessFactor = clamp(roughnessFactor + sphereMicroRoughness - sphereAudioPolish, 0.035, 1.0);`
      );
  };

  material.customProgramCacheKey = () => 'photoreal-metal-sphere-v2';

  const mesh = new THREE.Mesh(geometry, material);
  return { mesh, material, uniforms };
}
