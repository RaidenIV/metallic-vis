const numericControls = [
  'sensitivity','smoothing','bass','mids','treble','radius','deformation','noiseScale','noiseSpeed','surfaceDetail',
  'metalness','roughness','reflection','propagationSpeed','propagationWidth','bloomStrength','bloomRadius','bloomThreshold',
  'exposure','cameraDistance','fov','rotateSpeed'
];

export const DEFAULT_PRESET = {
  sensitivity: 1.35,
  smoothing: 0.82,
  bass: 1.35,
  mids: 0.90,
  treble: 0.55,
  radius: 2.35,
  deformation: 0.78,
  noiseScale: 2.60,
  noiseSpeed: 0.22,
  surfaceDetail: 0.18,
  metalness: 1.0,
  roughness: 0.18,
  reflection: 1.80,
  propagationMode: 1,
  propagationSpeed: 0.55,
  propagationWidth: 0.22,
  bloomEnabled: true,
  bloomStrength: 0.48,
  bloomRadius: 0.35,
  bloomThreshold: 0.60,
  exposure: 1.10,
  cameraDistance: 7.50,
  fov: 46,
  autoRotate: true,
  rotateSpeed: 0.35,
  volume: 0.85
};

function formatValue(id, value) {
  if (id === 'fov') return String(Math.round(value));
  return Number(value).toFixed(2);
}

export function createUI(onChange) {
  const els = {};
  numericControls.forEach(id => {
    els[id] = document.getElementById(id);
    const output = document.getElementById(`${id}Value`);
    const publish = () => {
      const value = Number(els[id].value);
      if (output) output.value = formatValue(id, value);
      onChange(id, value);
    };
    els[id].addEventListener('input', publish);
  });

  ['bloomEnabled', 'autoRotate'].forEach(id => {
    els[id] = document.getElementById(id);
    els[id].addEventListener('change', () => onChange(id, els[id].checked));
  });

  els.propagationMode = document.getElementById('propagationMode');
  els.propagationMode.addEventListener('change', () => onChange('propagationMode', Number(els.propagationMode.value)));

  els.volume = document.getElementById('volume');
  els.volume.addEventListener('input', () => onChange('volume', Number(els.volume.value)));

  function applyPreset(preset) {
    Object.entries({ ...DEFAULT_PRESET, ...preset }).forEach(([id, value]) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (el.type === 'checkbox') el.checked = Boolean(value);
      else el.value = value;
      const output = document.getElementById(`${id}Value`);
      if (output) output.value = formatValue(id, Number(value));
      onChange(id, el.type === 'checkbox' ? el.checked : (el.tagName === 'SELECT' || el.type === 'range' ? Number(el.value) : el.value));
    });
  }

  function readPreset() {
    const preset = {};
    Object.keys(DEFAULT_PRESET).forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      preset[id] = el.type === 'checkbox' ? el.checked : Number(el.value);
    });
    return preset;
  }

  return { els, applyPreset, readPreset };
}
