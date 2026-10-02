// =====================================================================
//  CHROMA SPHERES V15
// =====================================================================
const elCache = {};
const $ = (id) => elCache[id] || (elCache[id] = document.getElementById(id));
const num = (id) => parseFloat($(id).value);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rand = (a, b) => a + Math.random() * (b - a);

const container = $('canvas-container');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 4.5;

const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: "high-performance", preserveDrawingBuffer: true });
renderer.setSize(window.innerWidth, window.innerHeight);
const maxPixelRatio = Math.min(window.devicePixelRatio, 2);
let currentPixelRatio = maxPixelRatio;
let isAutoQuality = true;
let lowFpsStreak = 0; let highFpsStreak = 0;
renderer.setPixelRatio(currentPixelRatio);
container.appendChild(renderer.domElement);

// --- POST PROCESSING SETUP ---
const composer = new THREE.EffectComposer(renderer);
composer.addPass(new THREE.RenderPass(scene, camera));

// Trails (optioneel: alleen als het script geladen is)
const afterimagePass = THREE.AfterimagePass ? new THREE.AfterimagePass(0.9) : null;
if (afterimagePass) { afterimagePass.enabled = false; composer.addPass(afterimagePass); }

const bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.2, 0.4, 0.85);
bloomPass.threshold = 0.1; bloomPass.strength = 0.0; bloomPass.radius = 0.5;
composer.addPass(bloomPass);

const rgbShiftPass = new THREE.ShaderPass(THREE.RGBShiftShader);
rgbShiftPass.uniforms['amount'].value = 0.0015;
composer.addPass(rgbShiftPass);

// Post-FX Studio: kaleidoscoop, spiegel, pixels, posterize, scanlines, grain, vignet, lens, golf
const fxPass = new THREE.ShaderPass({
    uniforms: {
        tDiffuse: { value: null }, u_time: { value: 0 }, u_res: { value: new THREE.Vector2(1, 1) },
        u_kaleido: { value: 0 }, u_mirror: { value: 0 }, u_pixel: { value: 0 }, u_poster: { value: 0 },
        u_sat: { value: 1 }, u_scan: { value: 0 }, u_grain: { value: 0 }, u_vignette: { value: 0 },
        u_warp: { value: 0 }, u_wobble: { value: 0 }, u_flash: { value: 0 }, u_blur: { value: 0 }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse; uniform float u_time; uniform vec2 u_res;
        uniform float u_kaleido; uniform float u_mirror; uniform float u_pixel; uniform float u_poster;
        uniform float u_sat; uniform float u_scan; uniform float u_grain; uniform float u_vignette;
        uniform float u_warp; uniform float u_wobble; uniform float u_flash; uniform float u_blur;
        varying vec2 vUv;
        void main() {
            vec2 uv = vUv;
            if (abs(u_warp) > 0.001) { vec2 c = uv - 0.5; uv = 0.5 + c * (1.0 + u_warp * dot(c, c) * 2.5); }
            if (u_wobble > 0.001) {
                uv.x += sin(uv.y * 18.0 + u_time * 2.0) * 0.012 * u_wobble;
                uv.y += cos(uv.x * 18.0 + u_time * 1.7) * 0.012 * u_wobble;
            }
            if (u_mirror > 0.5) uv.x = 0.5 - abs(uv.x - 0.5);
            if (u_mirror > 1.5) uv.y = 0.5 - abs(uv.y - 0.5);
            if (u_kaleido > 1.5) {
                float aspect = u_res.x / u_res.y;
                vec2 p = uv - 0.5; p.x *= aspect;
                float a = atan(p.y, p.x) + u_time * 0.1; float r = length(p);
                float seg = 6.2831853 / u_kaleido;
                a = mod(a, seg); a = abs(a - seg * 0.5);
                p = vec2(cos(a), sin(a)) * r; p.x /= aspect;
                uv = p + 0.5;
            }
            if (u_pixel > 1.5) { vec2 g = u_res / u_pixel; uv = (floor(uv * g) + 0.5) / g; }
            vec4 tex = texture2D(tDiffuse, uv);
            if (u_blur > 0.001) {
                vec4 acc = tex;
                for (int i = 1; i < 8; i++) { float k = float(i) / 8.0; acc += texture2D(tDiffuse, 0.5 + (uv - 0.5) * (1.0 - u_blur * k)); }
                tex = acc / 8.0;
            }
            vec3 col = tex.rgb;
            if (u_poster > 1.5) col = floor(col * u_poster) / u_poster;
            float l = dot(col, vec3(0.299, 0.587, 0.114));
            col = mix(vec3(l), col, u_sat);
            col *= 1.0 - u_scan * (0.5 + 0.5 * sin(vUv.y * u_res.y * 3.14159));
            col *= 1.0 - u_vignette * smoothstep(0.25, 0.95, length(vUv - 0.5));
            float n = fract(sin(dot(vUv + fract(u_time), vec2(12.9898, 78.233))) * 43758.5453);
            col += (n - 0.5) * u_grain + u_flash;
            col = max(col, 0.0);
            gl_FragColor = vec4(col, max(tex.a, max(col.r, max(col.g, col.b))));
        }
    `
});
composer.addPass(fxPass);

function updateFxResolution() {
    fxPass.uniforms.u_res.value.set(window.innerWidth * currentPixelRatio, window.innerHeight * currentPixelRatio);
    bgMaterial.uniforms.u_res.value.set(window.innerWidth, window.innerHeight);
}

// --- ACHTERGROND-SHADER (volledig scherm, reageert op audio) ---
const BG_MODES = { nebula: 1, synthgrid: 2, tunnel: 3, aurora: 4, voronoi: 5, galaxy: 6, ripples: 7 };
const bgMaterial = new THREE.ShaderMaterial({
    uniforms: {
        u_time: { value: 0 }, u_res: { value: new THREE.Vector2(1, 1) }, u_mode: { value: 1 },
        u_bass: { value: 0 }, u_mid: { value: 0 }, u_high: { value: 0 }, u_beat: { value: 0 },
        u_bright: { value: 0.6 }, u_look: { value: new THREE.Vector2() }, u_hue: { value: 0 },
        u_c1: { value: new THREE.Color(0xff0055) }, u_c2: { value: new THREE.Color(0x00d4ff) }, u_c3: { value: new THREE.Color(0x9900ff) }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 1.0, 1.0); }
    `,
    fragmentShader: `
        uniform float u_time; uniform vec2 u_res; uniform float u_mode;
        uniform float u_bass; uniform float u_mid; uniform float u_high; uniform float u_beat;
        uniform float u_bright; uniform vec2 u_look; uniform float u_hue;
        uniform vec3 u_c1; uniform vec3 u_c2; uniform vec3 u_c3;
        varying vec2 vUv;

        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        vec2 hash2(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
        float noise(vec2 p) {
            vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        float fbm(vec2 p) {
            float v = 0.0; float a = 0.5;
            for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.02 + vec2(17.0, 9.0); a *= 0.5; }
            return v;
        }
        vec3 hueRotate(vec3 c, float a) {
            float cs = cos(a); float sn = sin(a);
            mat3 m = mat3(
                0.299 + 0.701*cs + 0.168*sn, 0.299 - 0.299*cs - 0.328*sn, 0.299 - 0.300*cs + 1.250*sn,
                0.587 - 0.587*cs + 0.330*sn, 0.587 + 0.413*cs + 0.035*sn, 0.587 - 0.588*cs - 1.050*sn,
                0.114 - 0.114*cs - 0.497*sn, 0.114 - 0.114*cs + 0.292*sn, 0.114 + 0.886*cs - 0.203*sn
            );
            return max(m * c, 0.0);
        }
        float starField(vec2 uv, float t) {
            vec2 g = floor(uv * 70.0);
            float h = hash(g);
            return step(0.985, h) * (0.5 + 0.5 * sin(t * 3.0 + h * 40.0));
        }

        void main() {
            vec2 uv = (vUv - 0.5) * vec2(u_res.x / u_res.y, 1.0);
            uv += u_look * 0.15;
            float t = u_time;
            vec3 col = vec3(0.0);

            if (u_mode < 1.5) {                 // 1: nevel
                vec2 p = uv * 1.6;
                vec2 q = vec2(fbm(p + t * 0.05), fbm(p + vec2(5.2, 1.3) - t * 0.04));
                float f = fbm(p + 2.5 * q + t * 0.03);
                col = mix(u_c1, u_c2, clamp(f * 1.6, 0.0, 1.0));
                col = mix(col, u_c3, clamp(length(q) * 0.8, 0.0, 1.0) * 0.7);
                col *= (f * f * 3.0 + 0.1) * (0.35 + u_bass * 1.2 + u_beat * 0.5);
                col += starField(uv, t) * (0.6 + u_high);
            } else if (u_mode < 2.5) {          // 2: retro synthwave-grid met zon
                float horizon = -0.08;
                if (uv.y > horizon) {
                    col = mix(u_c2 * 0.55, u_c3 * 0.12, smoothstep(horizon, 0.7, uv.y));
                    vec2 sc = vec2(0.0, 0.16);
                    float d = length(uv - sc);
                    float mask = (uv.y > sc.y) ? 1.0 : step(0.25, fract(uv.y * 14.0 - t * 0.2));
                    float sun = smoothstep(0.3, 0.29, d) * mask;
                    col = mix(col, mix(u_c2, u_c1, clamp((sc.y + 0.3 - uv.y) * 1.8, 0.0, 1.0)) * 1.4, sun);
                    col += u_c1 * exp(-d * 3.0) * (0.25 + u_bass * 0.9);
                    col += starField(uv, t) * 0.7 * smoothstep(0.15, 0.6, uv.y);
                } else {
                    float depth = horizon - uv.y;
                    float z = 0.35 / depth;
                    float x = uv.x * z;
                    float lx = smoothstep(0.44, 0.5, abs(fract(x * 0.8) - 0.5));
                    float lz = smoothstep(0.44, 0.5, abs(fract(z * 0.8 - t * (0.6 + u_mid * 2.5)) - 0.5));
                    float line = max(lx, lz) * smoothstep(0.0, 0.18, depth);
                    col = u_c3 * 0.06 + u_c1 * line * (1.0 + u_bass * 2.5);
                }
                col *= 1.0 + u_beat * 0.5;
            } else if (u_mode < 3.5) {          // 3: tunnel
                float r = length(uv); float a = atan(uv.y, uv.x);
                float z = 0.4 / (r + 0.001);
                float rings = sin(z * 4.0 - t * (1.0 + u_mid * 3.0));
                float rays = sin(a * 8.0 + z * 0.8 + t * 0.3);
                float v = smoothstep(0.2, 0.9, rings * rays * 0.5 + 0.5);
                col = mix(u_c1, u_c2, 0.5 + 0.5 * sin(z + t * 0.5)) * v;
                col = mix(col, u_c3, 0.15 + 0.15 * sin(a * 3.0 + t));
                col *= smoothstep(0.0, 0.35, r) * (0.5 + u_bass * 1.5 + u_beat);
            } else if (u_mode < 4.5) {          // 4: aurora
                col = u_c3 * 0.1 * (1.0 - vUv.y) + starField(uv, t) * 0.5 * vUv.y;
                for (int i = 0; i < 4; i++) {
                    float fi = float(i);
                    float curtain = fbm(vec2(uv.x * 1.5 + fi * 3.1 + t * 0.07 * (1.0 + fi * 0.3), t * 0.1 + fi));
                    float yc = -0.15 + fi * 0.16 + (curtain - 0.5) * 0.7;
                    float band = exp(-pow((uv.y - yc) * 4.5, 2.0));
                    col += mix(u_c1, u_c2, fi / 3.0) * band * (0.45 + u_mid * 1.6 + u_beat * 0.4) * (0.6 + 0.4 * sin(uv.x * 6.0 + t + fi));
                }
            } else if (u_mode < 5.5) {          // 5: voronoi-cellen
                vec2 p = uv * 4.0;
                vec2 ip = floor(p); vec2 fp = fract(p);
                float d1 = 8.0; float d2 = 8.0; vec2 id = vec2(0.0);
                for (int j = -1; j <= 1; j++) {
                    for (int i = -1; i <= 1; i++) {
                        vec2 g = vec2(float(i), float(j));
                        vec2 o = hash2(ip + g); o = 0.5 + 0.5 * sin(t * 0.5 + 6.2831853 * o);
                        vec2 r = g + o - fp; float d = dot(r, r);
                        if (d < d1) { d2 = d1; d1 = d; id = ip + g; } else if (d < d2) { d2 = d; }
                    }
                }
                float edge = smoothstep(0.0, 0.08, sqrt(d2) - sqrt(d1));
                vec3 cell = mix(u_c1, u_c2, hash(id)); cell = mix(cell, u_c3, hash(id + 7.0) * 0.5);
                col = cell * (0.1 + 0.3 * hash(id + 3.0) * (0.5 + u_bass * 1.5)) + u_c3 * (1.0 - edge) * (0.7 + u_beat * 1.5);
            } else if (u_mode < 6.5) {          // 6: spiraalstelsel
                float r = length(uv); float a = atan(uv.y, uv.x);
                float spiral = sin(a * 2.0 - log(r + 0.01) * 6.0 + t * 0.3);
                float arms = smoothstep(0.0, 1.0, spiral * 0.5 + 0.5);
                float core = exp(-r * 3.5);
                float dust = fbm(vec2(a * 3.0 + t * 0.05, r * 5.0));
                col = mix(u_c1, u_c2, clamp(r * 1.2, 0.0, 1.0)) * arms * dust * exp(-r * 1.2) * 2.2;
                col += u_c3 * core * (1.0 + u_bass * 2.0 + u_beat);
                col += starField(uv, t) * 0.6;
            } else {                            // 7: rimpelringen die op de beat uitwaaieren
                float r = length(uv);
                float ring = exp(-pow((r - (1.0 - u_beat) * 1.4) * 8.0, 2.0)) * u_beat;
                float base = 0.5 + 0.5 * sin(r * 14.0 - t * 1.5 + u_bass * 5.0);
                col = mix(u_c1, u_c2, clamp(r, 0.0, 1.0)) * pow(base, 3.0) * 0.35 * (0.5 + u_mid) + u_c3 * ring * 2.0 + u_c3 * 0.04;
            }

            col = hueRotate(col, u_hue);
            col *= u_bright * (1.0 - 0.7 * dot(vUv - 0.5, vUv - 0.5));
            gl_FragColor = vec4(col, 1.0);
        }
    `,
    depthTest: false, depthWrite: false
});
const bgMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgMaterial);
bgMesh.frustumCulled = false; bgMesh.renderOrder = -1000; bgMesh.visible = false;
scene.add(bgMesh);
updateFxResolution();

// --- PARTICLES (STARDUST) ---
const particlesGeometry = new THREE.BufferGeometry();
const particlesCount = 2000;
const posArray = new Float32Array(particlesCount * 3);
for(let i = 0; i < particlesCount * 3; i++) { posArray[i] = (Math.random() - 0.5) * 150; }
particlesGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
const particlesMaterial = new THREE.PointsMaterial({ size: 0.08, color: 0xffffff, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending });
const particlesMesh = new THREE.Points(particlesGeometry, particlesMaterial);
particlesMesh.frustumCulled = false;
scene.add(particlesMesh);

// --- EXPLOSION PARTICLES ---
const expParticleCount = 1500;
const expGeometry = new THREE.BufferGeometry();
const expPosArray = new Float32Array(expParticleCount * 3);
const expVelArray = [];
const expLifeArray = new Float32Array(expParticleCount);
for(let i=0; i<expParticleCount; i++) {
    expVelArray.push(new THREE.Vector3());
    expLifeArray[i] = 0.0;
}
expGeometry.setAttribute('position', new THREE.BufferAttribute(expPosArray, 3));
expGeometry.setAttribute('alpha', new THREE.BufferAttribute(expLifeArray, 1));
const expMaterial = new THREE.ShaderMaterial({
    uniforms: { u_color: { value: new THREE.Color(0x00d4ff) } },
    vertexShader: `
        attribute float alpha;
        varying float vAlpha;
        void main() {
            vAlpha = alpha;
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = 40.0 * (1.0 / -mvPosition.z) * alpha;
            gl_Position = projectionMatrix * mvPosition;
        }
    `,
    fragmentShader: `
        uniform vec3 u_color;
        varying float vAlpha;
        void main() {
            if (vAlpha <= 0.0) discard;
            float d = distance(gl_PointCoord, vec2(0.5));
            if (d > 0.5) discard;
            gl_FragColor = vec4(u_color, vAlpha * (1.0 - (d*2.0)));
        }
    `,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
});
const expMesh = new THREE.Points(expGeometry, expMaterial);
expMesh.frustumCulled = false;
scene.add(expMesh);

function triggerExplosion(pos, color) {
    if (color) expMaterial.uniforms.u_color.value.copy(color);
    let particlesSpawned = 0;
    const maxToSpawn = 100;
    for(let i=0; i<expParticleCount; i++) {
        if(expLifeArray[i] <= 0) {
            expPosArray[i*3] = pos.x; expPosArray[i*3+1] = pos.y; expPosArray[i*3+2] = pos.z;
            expVelArray[i].set((Math.random()-0.5)*2, (Math.random()-0.5)*2, (Math.random()-0.5)*2).normalize().multiplyScalar(Math.random() * 0.3 + 0.1);
            expLifeArray[i] = 1.0;
            particlesSpawned++;
            if(particlesSpawned >= maxToSpawn) break;
        }
    }
}

// --- GEOMETRIES ---
const geometries = {
    sphere: new THREE.SphereGeometry(1.2, 128, 128),
    cube: new THREE.BoxGeometry(1.6, 1.6, 1.6, 64, 64, 64),
    torus: new THREE.TorusGeometry(0.8, 0.4, 64, 128),
    knot: new THREE.TorusKnotGeometry(0.8, 0.25, 128, 32),
    knot2: new THREE.TorusKnotGeometry(0.8, 0.22, 160, 24, 3, 5),
    icosahedron: new THREE.IcosahedronGeometry(1.2, 20),
    octahedron: new THREE.OctahedronGeometry(1.4, 24),
    dodecahedron: new THREE.DodecahedronGeometry(1.3, 16),
    cylinder: new THREE.CylinderGeometry(0.8, 0.8, 2.0, 96, 64),
    hoop: new THREE.TorusGeometry(1.1, 0.14, 48, 160)
};
const geometryKeys = Object.keys(geometries);

let currentShape = 'sphere';
const group = new THREE.Group();
scene.add(group);
let meshes = [];

// --- SHADERS ---
const vertexShader = `
    uniform float u_time; uniform float u_randomOffset; uniform float u_displacementAmount;
    uniform float u_dispAudio; uniform float u_indDisp; uniform float u_deform;
    varying vec3 vNormal; varying vec3 vViewPosition; varying vec3 vObjectPosition;
    void main() {
        float t = u_time * 0.8 + u_randomOffset;
        float noise1 = sin(position.x * 2.5 + t) * cos(position.y * 2.5 - t) * sin(position.z * 2.5 + t);
        float noise2 = cos(position.x * 4.0 - t*0.5) * sin(position.y * 4.0 + t*0.5);
        float n = (noise1 + noise2) * 0.3;
        float activeDisp = (u_indDisp >= 0.0) ? u_indDisp : u_displacementAmount;
        float intensity = activeDisp + (u_dispAudio * 1.5);
        vec3 p = position; vec3 nrm = normal;

        if (u_deform > 3.5) {            // kristal: gefacetteerde ruis
            n = floor(n * 5.0 + 0.5) / 5.0 * 1.4;
        } else if (u_deform > 2.5) {     // rimpels: golven vanuit het midden
            n = sin(length(position) * 7.0 - t * 3.0) * 0.25 + noise1 * 0.1;
        } else if (u_deform > 1.5) {     // twist: draait rond de y-as
            float a = position.y * (0.6 + intensity * 0.8) + sin(t) * 0.5;
            float c = cos(a); float s = sin(a);
            p = vec3(position.x * c - position.z * s, position.y, position.x * s + position.z * c);
            nrm = vec3(normal.x * c - normal.z * s, normal.y, normal.x * s + normal.z * c);
            n = n * 0.5;
        } else if (u_deform > 0.5) {     // egel: scherpe pieken
            float sp = sin(position.x * 7.0 + t) * sin(position.y * 7.0 - t * 0.7) * sin(position.z * 7.0 + t * 0.5);
            n = pow(max(0.0, sp), 0.7) * 1.6 - 0.2;
        }

        vec3 newPosition = p + (nrm * n * intensity);
        vObjectPosition = newPosition;
        vec4 mvPosition = modelViewMatrix * vec4(newPosition, 1.0);
        vNormal = normalize(normalMatrix * nrm); vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
    }
`;

const fragmentShader = `
    uniform vec3 color1; uniform vec3 color2; uniform vec3 color3;
    uniform float u_time; uniform float u_randomOffset; uniform float u_glowAudio;
    uniform float u_isSelected; uniform float u_style; uniform float u_hueShift;
    varying vec3 vNormal; varying vec3 vViewPosition; varying vec3 vObjectPosition;

    vec3 hueRotate(vec3 c, float a) {
        float cs = cos(a); float sn = sin(a);
        mat3 m = mat3(
            0.299 + 0.701*cs + 0.168*sn, 0.299 - 0.299*cs - 0.328*sn, 0.299 - 0.300*cs + 1.250*sn,
            0.587 - 0.587*cs + 0.330*sn, 0.587 + 0.413*cs + 0.035*sn, 0.587 - 0.588*cs - 1.050*sn,
            0.114 - 0.114*cs - 0.497*sn, 0.114 - 0.114*cs + 0.292*sn, 0.114 + 0.886*cs - 0.203*sn
        );
        return max(m * c, 0.0);
    }

    void main() {
        vec3 viewNormal = normalize(vNormal); vec3 viewDir = normalize(vViewPosition);
        float dotProduct = max(dot(viewNormal, viewDir), 0.0);
        float fresnel = pow(1.0 - dotProduct, 2.2);
        float t = u_time * 0.6 + u_randomOffset;
        vec3 p = vObjectPosition * 1.2;
        float blob1 = sin(p.x + t) * cos(p.y - t) * sin(p.z + t*0.8);
        float blob2 = cos(p.x * 1.5 - t) * sin(p.y * 1.2 + t) * cos(p.z * 1.1 - t*0.5);
        float mix1Factor = (blob1 + 1.0) * 0.5; float mix2Factor = (blob2 + 1.0) * 0.5;
        vec3 mix1 = mix(color1, color2, mix1Factor); vec3 gradient = mix(mix1, color3, mix2Factor);
        vec3 baseColor = vec3(0.02, 0.02, 0.02);
        float centerBlob = (sin(p.x * 2.0 + t) * cos(p.y * 2.0 - t) * sin(p.z * 2.0 + t)) * 0.5 + 0.5;
        float glow = 0.8 + (u_glowAudio * 3.0);
        vec3 finalColor;

        if (u_style < 0.5) {             // 0: vloeibaar (origineel)
            finalColor = baseColor + gradient * centerBlob * glow + (gradient * fresnel * 2.5);
        } else if (u_style < 1.5) {      // 1: olievlek / iriserend
            vec3 irid = 0.5 + 0.5 * cos(6.2831853 * (vec3(0.0, 0.33, 0.67) + fresnel * 1.2 + blob1 * 0.4 + t * 0.15));
            finalColor = baseColor + irid * mix(vec3(1.0), gradient, 0.4) * (0.55 + glow * 0.35) + fresnel * irid * 1.5;
        } else if (u_style < 2.5) {      // 2: cartoon / toon met inktrand
            vec3 toon = mix(color1, color2, step(0.5, mix1Factor));
            toon = mix(toon, color3, step(0.65, mix2Factor));
            toon *= 0.45 + 0.55 * floor(dotProduct * 3.0) / 3.0;
            finalColor = toon * (0.9 + u_glowAudio * 1.5);
            finalColor = mix(finalColor, vec3(0.0), step(dotProduct, 0.2));
        } else if (u_style < 3.5) {      // 3: hologram met scanlines
            float scan = 0.5 + 0.5 * sin(vObjectPosition.y * 40.0 - u_time * 4.0);
            float flicker = 0.88 + 0.12 * sin(u_time * 30.0 + u_randomOffset);
            finalColor = (gradient * (0.25 + 0.75 * scan) * glow * 0.6 + gradient * fresnel * 3.0) * flicker;
        } else if (u_style < 4.5) {      // 4: plasma / vuur
            float v = sin(p.x * 3.0 + t) + sin(p.y * 3.0 - t * 1.3) + sin((p.x + p.y + p.z) * 2.0 + t * 0.7) + sin(length(p) * 4.0 - t * 2.0);
            v = v * 0.25 + 0.5;
            vec3 plasma = mix(color1, color2, v);
            plasma = mix(plasma, color3, smoothstep(0.6, 1.0, v));
            finalColor = plasma * (0.6 + u_glowAudio * 3.0) + fresnel * gradient * 1.5;
        } else if (u_style < 5.5) {      // 5: neon-glas: donker lichaam, felle rand
            finalColor = baseColor + gradient * pow(1.0 - dotProduct, 3.0) * 4.0 * (0.8 + u_glowAudio * 2.0) + gradient * centerBlob * 0.12;
        } else {                         // 6: regenboog-normalen
            vec3 rb = 0.5 + 0.5 * cos(6.2831853 * (viewNormal * 0.5 + vec3(0.0, 0.33, 0.67) + t * 0.1));
            finalColor = mix(rb, gradient, 0.3) * (0.6 + glow * 0.3) + fresnel * 0.5;
        }

        finalColor = hueRotate(finalColor, u_hueShift);
        if(u_isSelected > 0.5) { finalColor += vec3(fresnel * 1.5); }
        gl_FragColor = vec4(finalColor, 1.0);
    }
`;

// --- THEMA'S ---
const THEME_COLORS = {
    cyberpunk: [0xff0055, 0x00d4ff, 0x9900ff],
    sunset: [0xff5500, 0xff0055, 0xffaa00],
    monochrome: [0xffffff, 0x666666, 0x222222],
    vaporwave: [0xff71ce, 0x01cdfe, 0xb967ff],
    ocean: [0x00e5ff, 0x0066ff, 0x00ffb3],
    fire: [0xff2a00, 0xff9500, 0xffe600],
    toxic: [0xaaff00, 0x00ff99, 0x7700ff],
    aurora: [0x00ff9d, 0x7a5cff, 0x00c3ff],
    candy: [0xff9ecd, 0xa0e7ff, 0xfff59e],
    gold: [0xffd700, 0xff8c00, 0xfff2b3]
};
let currentTheme = 'random';
let customColors = ['#ff0055', '#00d4ff', '#66ff00'];

function getThemeColors(index, count) {
    if (THEME_COLORS[currentTheme]) return THEME_COLORS[currentTheme].map(c => new THREE.Color(c));
    if (currentTheme === 'custom') return customColors.map(c => new THREE.Color(c));
    if (currentTheme === 'rainbow') {
        const h = ((index || 0) / Math.max(1, count || 1)) % 1;
        return [0, 0.12, 0.28].map(o => new THREE.Color().setHSL((h + o) % 1, 0.9, 0.55));
    }
    return [0, 1, 2].map(() => new THREE.Color().setHSL(Math.random(), 0.8 + Math.random() * 0.2, 0.5));
}

function updateAllColors() {
    meshes.forEach(m => {
        if (!m.userData.isColorOverridden) {
            const cols = getThemeColors(m.userData.index, meshes.length);
            m.material.uniforms.color1.value = cols[0]; m.material.uniforms.color2.value = cols[1]; m.material.uniforms.color3.value = cols[2];
        }
    });
}

// -- GLOBALE VARIABELEN --
let currentDisplacement = 0.3; let currentSpeed = 1.0;
let gridCount = 1; let gridDirty = true;
let globalRotSpeed = 1.0; let isRandomRotation = false; let randRotMultiplier = 0.5;
let isRandomSize = false; let isRandomPos = false; let isWireframe = false; let isAutoRotate = false;
let baseBloom = 0.0; let baseRGB = 0.0015; let targetZoom = 4.5;
let hueAngle = 0; let elapsed = 0; let bgTime = 0;
let camAngle = 0; let layoutExtent = 4; const spin = { x: 0, y: 0 };

// -- AUDIO VARIABELEN --
let audioSmoothing = 0.85;
let audioBass = 0.0; let audioMid = 0.0; let audioHigh = 0.0; let bassAverage = 0.0;
let audDispAmt = 1.0; let audGlowAmt = 1.0; let audScaleAmt = 0.0; let audRotAmt = 0.0; let audSpeedAmt = 0.0; let audRGBAmt = 0.0;
let mapDisp = 'bass'; let mapGlow = 'high'; let mapScale = 'bass'; let mapRot = 'mid'; let mapSpeed = 'mid'; let mapRGB = 'bass';
let audioDelayFrames = 0; let isAudioRandomDelay = false;
const MAX_HISTORY = 150;
let audioHistory = []; for(let i=0; i<MAX_HISTORY; i++) { audioHistory.push({bass: 0, mid: 0, high: 0}); }
let histIndex = 0;
let demoPhase = 0; let lastDemoBeat = -1;

// -- PLAYGROUND VARIABELEN --
let isSwarmMode = false; let isShapeShifting = false; let isAutopilot = false; let isCinematic = false;
let glitchAmount = 0; let lastBeatTime = 0;
let beatEnergy = 0; let fovKick = 0; let beatSign = 1; let djTimer = 0;
let apOffsets = { disp: Math.random()*100, bloom: Math.random()*100, rgb: Math.random()*100 };

// -- SELECTIE --
let selectedMesh = null;

// --- LAYOUTS ---
function getLayoutPositions(size, layout, spacing) {
    const n = size * size; const pts = [];
    for (let i = 0; i < n; i++) {
        let x = 0, y = 0, z = 0;
        if (n > 1) {
            switch (layout) {
                case 'ring': {
                    const r = Math.max(spacing * 1.2, n * spacing / (2 * Math.PI)); const a = (i / n) * Math.PI * 2;
                    x = Math.cos(a) * r; y = Math.sin(a) * r; break;
                }
                case 'sphere': {
                    const r = spacing * Math.sqrt(n) * 0.55; const phi = Math.acos(1 - 2 * (i + 0.5) / n); const th = Math.PI * (1 + Math.sqrt(5)) * i;
                    x = r * Math.cos(th) * Math.sin(phi); y = r * Math.sin(th) * Math.sin(phi); z = r * Math.cos(phi); break;
                }
                case 'spiral': {
                    const r = spacing * 0.75 * Math.sqrt(i + 0.5); const a = i * 2.399963;
                    x = Math.cos(a) * r; y = Math.sin(a) * r; break;
                }
                case 'helix': {
                    const a = i * 0.6;
                    x = Math.cos(a) * spacing * 1.6; z = Math.sin(a) * spacing * 1.6; y = (i - (n - 1) / 2) * spacing * 0.45; break;
                }
                case 'cloud': {
                    const r = spacing * Math.sqrt(n) * 0.6 * Math.cbrt(Math.random()); const u = Math.random() * 2 - 1; const a = Math.random() * Math.PI * 2; const s = Math.sqrt(1 - u * u);
                    x = r * s * Math.cos(a); y = r * s * Math.sin(a); z = r * u; break;
                }
                case 'wave': {
                    const ix = i % size, iy = Math.floor(i / size); const off = (size - 1) * spacing / 2;
                    x = ix * spacing - off; y = iy * spacing - off; z = Math.sin(ix * 0.8) * Math.cos(iy * 0.8) * spacing * 0.8; break;
                }
                default: {
                    const ix = Math.floor(i / size), iy = i % size; const off = (size - 1) * spacing / 2;
                    x = ix * spacing - off; y = iy * spacing - off;
                }
            }
        }
        pts.push(new THREE.Vector3(x, y, z));
    }
    return pts;
}

function createGrid(size) {
    gridCount = size;
    deselectItem();
    meshes.forEach(m => { m.material.dispose(); group.remove(m); });
    meshes = [];
    group.rotation.set(0, 0, 0);

    const spacing = 3.5;
    const pts = getLayoutPositions(size, $('layoutSelect').value, spacing);
    let maxRadius = 0.001; let maxAxis = 0;
    pts.forEach(p => { maxRadius = Math.max(maxRadius, p.length()); maxAxis = Math.max(maxAxis, Math.abs(p.x), Math.abs(p.y), Math.abs(p.z) * 0.5); });
    layoutExtent = Math.max(maxAxis, maxRadius * 0.7);

    pts.forEach((pt, i) => {
        const cols = getThemeColors(i, pts.length);
        const material = new THREE.ShaderMaterial({
            uniforms: {
                color1: { value: cols[0] }, color2: { value: cols[1] }, color3: { value: cols[2] },
                u_time: { value: 0.0 }, u_randomOffset: { value: Math.random() * 100.0 },
                u_displacementAmount: { value: currentDisplacement },
                u_dispAudio: { value: 0.0 }, u_glowAudio: { value: 0.0 },
                u_isSelected: { value: 0.0 }, u_indDisp: { value: -1.0 },
                u_style: { value: 0.0 }, u_deform: { value: 0.0 }, u_hueShift: { value: 0.0 }
            },
            vertexShader: vertexShader, fragmentShader: fragmentShader, wireframe: isWireframe
        });

        let activeGeometry = geometries[currentShape];
        if (currentShape === 'random') { activeGeometry = geometries[pick(geometryKeys)]; }
        const mesh = new THREE.Mesh(activeGeometry, material);

        let posX = pt.x, posY = pt.y, posZ = pt.z;
        if (isRandomPos && pts.length > 1) {
            posX += (Math.random() - 0.5) * 3.5; posY += (Math.random() - 0.5) * 3.5; posZ += (Math.random() - 0.5) * 4.0;
        }
        mesh.position.set(posX, posY, posZ);

        let objScale = 1.0;
        if (isRandomSize) objScale = Math.random() * 1.2 + 0.3;
        mesh.scale.set(objScale, objScale, objScale);

        mesh.userData = {
            baseScale: objScale, isColorOverridden: false, index: i,
            randRot: { x: (Math.random() - 0.5) * 0.02, y: (Math.random() - 0.5) * 0.02, z: (Math.random() - 0.5) * 0.02 },
            id: i, randomDelayFactor: Math.random(), distNorm: pt.length() / maxRadius,
            velocity: new THREE.Vector3((Math.random()-0.5)*0.1, (Math.random()-0.5)*0.1, (Math.random()-0.5)*0.1),
            basePos: new THREE.Vector3(posX, posY, posZ), swarmPhase: Math.random() * Math.PI * 2,
            style: Math.floor(Math.random() * 7), deform: Math.floor(Math.random() * 5)
        };
        group.add(mesh); meshes.push(mesh);
    });

    if (pts.length > 1 && !$('zoomSlider').dataset.userTouched) {
        targetZoom = Math.max(4.5, (maxAxis + 1.5) * 2.3);
        $('zoomSlider').value = Math.min(250, targetZoom);
    }
}
function scheduleGrid() { gridDirty = true; }

// --- INDIVIDUELE SELECTIE ---
const raycaster = new THREE.Raycaster(); const mouse = new THREE.Vector2(); let isDraggingCamera = false;
let pointerDownPos = { x: 0, y: 0 };
$('canvas-container').addEventListener('pointerdown', (e) => { isDraggingCamera = false; pointerDownPos = { x: e.clientX, y: e.clientY }; });
$('canvas-container').addEventListener('pointermove', (e) => { if (Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y) > 5) isDraggingCamera = true; });
$('canvas-container').addEventListener('click', (e) => {
    if (isDraggingCamera) return;
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1; mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera); const intersects = raycaster.intersectObjects(group.children);
    if (intersects.length > 0) selectItem(intersects[0].object); else deselectItem();
});

function selectItem(mesh) {
    if (selectedMesh) selectedMesh.material.uniforms.u_isSelected.value = 0.0;
    selectedMesh = mesh; selectedMesh.material.uniforms.u_isSelected.value = 1.0;
    $('individual-panel').style.display = 'block'; $('indScale').value = selectedMesh.scale.x;
    const key = geometryKeys.find(k => geometries[k] === selectedMesh.geometry);
    if (key) $('indShape').value = key;
}
function deselectItem() {
    if (selectedMesh) selectedMesh.material.uniforms.u_isSelected.value = 0.0;
    selectedMesh = null; $('individual-panel').style.display = 'none';
}
$('deselectBtn').addEventListener('click', deselectItem);
$('indScale').addEventListener('input', (e) => { if(selectedMesh) { const val = parseFloat(e.target.value); selectedMesh.userData.baseScale = val; selectedMesh.scale.set(val, val, val); } });
$('indShape').addEventListener('change', (e) => { if(selectedMesh) selectedMesh.geometry = geometries[e.target.value]; });
['indCol1', 'indCol2', 'indCol3'].forEach((id, idx) => { $(id).addEventListener('input', (e) => { if(selectedMesh) { selectedMesh.userData.isColorOverridden = true; selectedMesh.material.uniforms['color'+(idx+1)].value = new THREE.Color(e.target.value); } }); });

// --- UI EVENTS ---
$('gridSlider').addEventListener('input', (e) => {
    $('zoomSlider').dataset.userTouched = '';
    $('gridNum').value = e.target.value;
    gridCount = parseInt(e.target.value); scheduleGrid();
});
$('gridNum').addEventListener('input', (e) => {
    $('zoomSlider').dataset.userTouched = '';
    $('gridSlider').value = e.target.value;
    gridCount = parseInt(e.target.value); scheduleGrid();
});

$('dispSlider').addEventListener('input', (e) => currentDisplacement = parseFloat(e.target.value));
$('speedSlider').addEventListener('input', (e) => currentSpeed = parseFloat(e.target.value));
$('rotSpeedSlider').addEventListener('input', (e) => globalRotSpeed = parseFloat(e.target.value));
$('zoomSlider').addEventListener('input', (e) => { targetZoom = parseFloat(e.target.value); if(e.isTrusted) e.target.dataset.userTouched = 'true'; });

$('randomRotCheck').addEventListener('change', (e) => isRandomRotation = e.target.checked);
$('randRotSpeedSlider').addEventListener('input', (e) => randRotMultiplier = parseFloat(e.target.value));

$('randomSizeCheck').addEventListener('change', (e) => { isRandomSize = e.target.checked; scheduleGrid(); });
$('randomPosCheck').addEventListener('change', (e) => { isRandomPos = e.target.checked; scheduleGrid(); });
$('wireframeCheck').addEventListener('change', (e) => { isWireframe = e.target.checked; meshes.forEach(m => m.material.wireframe = isWireframe); });
$('particlesCheck').addEventListener('change', (e) => { particlesMesh.visible = e.target.checked; });
$('autoRotCheck').addEventListener('change', (e) => { isAutoRotate = e.target.checked; });

$('swarmCheck').addEventListener('change', (e) => isSwarmMode = e.target.checked);
$('shapeShiftCheck').addEventListener('change', (e) => isShapeShifting = e.target.checked);
$('autopilotCheck').addEventListener('change', (e) => isAutopilot = e.target.checked);
$('cinematicCheck').addEventListener('change', (e) => isCinematic = e.target.checked);
$('glitchSlider').addEventListener('input', (e) => glitchAmount = parseFloat(e.target.value));

$('themeSelect').addEventListener('change', (e) => { currentTheme = e.target.value; $('customColorPickers').style.display = (currentTheme === 'custom') ? 'flex' : 'none'; updateAllColors(); });
['cColor1', 'cColor2', 'cColor3'].forEach((id, index) => { $(id).addEventListener('input', (e) => { customColors[index] = e.target.value; updateAllColors(); }); });
$('shapeSelect').addEventListener('change', (e) => { currentShape = e.target.value; scheduleGrid(); });
$('layoutSelect').addEventListener('change', scheduleGrid);
$('bloomSlider').addEventListener('input', (e) => baseBloom = parseFloat(e.target.value));
$('rgbSlider').addEventListener('input', (e) => baseRGB = parseFloat(e.target.value));

// -- AUDIO MATRIX UI EVENTS --
$('audDisp').addEventListener('input', (e) => audDispAmt = parseFloat(e.target.value));
$('audGlow').addEventListener('input', (e) => audGlowAmt = parseFloat(e.target.value));
$('audScale').addEventListener('input', (e) => audScaleAmt = parseFloat(e.target.value));
$('audRot').addEventListener('input', (e) => audRotAmt = parseFloat(e.target.value));
$('audSpeed').addEventListener('input', (e) => audSpeedAmt = parseFloat(e.target.value));
$('audRGB').addEventListener('input', (e) => audRGBAmt = parseFloat(e.target.value));
$('audioDelaySlider').addEventListener('input', (e) => audioDelayFrames = parseInt(e.target.value));
$('audioRandomDelayCheck').addEventListener('change', (e) => isAudioRandomDelay = e.target.checked);
$('audioSmoothSlider').addEventListener('input', (e) => audioSmoothing = parseFloat(e.target.value));
$('mapDisp').addEventListener('change', (e) => mapDisp = e.target.value);
$('mapGlow').addEventListener('change', (e) => mapGlow = e.target.value);
$('mapScale').addEventListener('change', (e) => mapScale = e.target.value);
$('mapRot').addEventListener('change', (e) => mapRot = e.target.value);
$('mapSpeed').addEventListener('change', (e) => mapSpeed = e.target.value);
$('mapRGB').addEventListener('change', (e) => mapRGB = e.target.value);

// --- TOAST ---
let toastTimer = null;
function showToast(msg, ms = 2500) {
    const t = $('toast'); t.innerText = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

// --- EXPORT PNG ---
function exportPNG() {
    composer.render();
    const link = document.createElement('a'); link.download = 'Chroma_Generatie.png'; link.href = renderer.domElement.toDataURL('image/png'); link.click();
}
$('exportBtn').addEventListener('click', exportPNG);

// --- VIDEO OPNEMEN ---
let recorder = null; let recChunks = []; let recStart = 0; let recTimer = null;
function toggleRecord() {
    const btn = $('recBtn');
    if (recorder) { recorder.stop(); return; }
    if (!renderer.domElement.captureStream || !window.MediaRecorder) { showToast('Opnemen wordt niet ondersteund in deze browser.'); return; }
    const stream = renderer.domElement.captureStream(60);
    if (activeStream) activeStream.getAudioTracks().forEach(t => stream.addTrack(t.clone()));
    const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m));
    try { recorder = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 12000000 } : {}); }
    catch (err) { showToast('Opnemen mislukt: ' + err.message); return; }
    recChunks = [];
    recorder.ondataavailable = (e) => { if (e.data.size) recChunks.push(e.data); };
    recorder.onstop = () => {
        clearInterval(recTimer);
        const blob = new Blob(recChunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = 'Chroma_opname.webm'; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        recorder = null; btn.innerText = '⏺ Video opnemen (WebM)'; btn.classList.remove('recording');
        showToast('Opname opgeslagen');
    };
    recorder.start(1000); recStart = performance.now(); btn.classList.add('recording');
    const tick = () => { const s = Math.floor((performance.now() - recStart) / 1000); btn.innerText = '⏹ Stop opname  ' + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
    tick(); recTimer = setInterval(tick, 500);
}
$('recBtn').addEventListener('click', toggleRecord);

function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {});
}
$('fullscreenBtn').addEventListener('click', toggleFullscreen);

// --- INSTELLINGEN: opslaan, delen, presets ---
const STORAGE_KEY = 'chroma-spheres-settings';
const SKIP_IDS = new Set(['gridNum', 'indScale', 'indShape', 'indCol1', 'indCol2', 'indCol3']);
const controlsPanel = $('controls');
const settingEls = [...controlsPanel.querySelectorAll('input[id], select[id]')].filter(el => !SKIP_IDS.has(el.id));
const defaults = {};
settingEls.forEach(el => { defaults[el.id] = el.type === 'checkbox' ? el.checked : el.value; });

function setControl(id, val) {
    const el = $(id); if (!el) return;
    if (el.type === 'checkbox') el.checked = !!val; else el.value = val;
    el.dispatchEvent(new Event(el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
}
function collectSettings() {
    const data = {};
    settingEls.forEach(el => { data[el.id] = el.type === 'checkbox' ? el.checked : el.value; });
    return data;
}
// Deze blijven bij een preset/verrassing zoals ze zijn
const PRESET_SKIP = new Set(['zoomSlider', 'autoQualityCheck', 'demoCheck', 'demoBpm', 'djCheck', 'djInterval', 'audioSmoothSlider', 'audioDelaySlider', 'audioRandomDelayCheck', 'cColor1', 'cColor2', 'cColor3', 'bgColor']);
function applyPreset(values) {
    settingEls.forEach(el => {
        if (PRESET_SKIP.has(el.id)) return;
        setControl(el.id, el.id in values ? values[el.id] : defaults[el.id]);
    });
    Object.keys(values).forEach(id => { if (PRESET_SKIP.has(id)) setControl(id, values[id]); });
}

let saveTimer = null;
function saveSettings() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(collectSettings())); } catch (err) {} }
controlsPanel.addEventListener('input', () => { clearTimeout(saveTimer); saveTimer = setTimeout(saveSettings, 400); });
controlsPanel.addEventListener('change', () => { clearTimeout(saveTimer); saveTimer = setTimeout(saveSettings, 400); });

function restoreSettings(data) {
    // zoom als laatste: grid-wijzigingen zetten de zoom opnieuw
    const ordered = settingEls.filter(el => el.id !== 'zoomSlider').concat(settingEls.filter(el => el.id === 'zoomSlider'));
    ordered.forEach(el => { if (el.id in data) setControl(el.id, data[el.id]); });
    if ('zoomSlider' in data) $('zoomSlider').dataset.userTouched = 'true';
}
function loadInitialSettings() {
    try {
        if (location.hash.startsWith('#s=')) {
            const data = JSON.parse(decodeURIComponent(escape(atob(location.hash.slice(3)))));
            restoreSettings(data); return;
        }
    } catch (err) {}
    try {
        const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
        if (data) restoreSettings(data);
    } catch (err) {}
}
$('resetBtn').addEventListener('click', () => {
    try { localStorage.removeItem(STORAGE_KEY); } catch (err) {}
    history.replaceState(null, '', location.pathname + location.search);
    location.reload();
});
$('shareBtn').addEventListener('click', async () => {
    const code = btoa(unescape(encodeURIComponent(JSON.stringify(collectSettings()))));
    const url = location.href.split('#')[0] + '#s=' + code;
    try { await navigator.clipboard.writeText(url); showToast('🔗 Deel-link gekopieerd'); }
    catch (err) { window.prompt('Kopieer deze link:', url); }
});

// --- PRESETS ---
const PRESETS = {
    zen: { themeSelect: 'sunset', shapeSelect: 'sphere', speedSlider: 0.2, dispSlider: 0.1, autoRotCheck: true, audDisp: 0.5, audGlow: 0.5, audScale: 0, audRGB: 0 },
    rave: { bgSelect: 'tunnel', camMode: 'orbit', themeSelect: 'cyberpunk', shapeSelect: 'torus', wireframeCheck: true, speedSlider: 3.5, dispSlider: 1.5, autoRotCheck: true, audDisp: 2, audGlow: 2.5, audScale: 0.5, audRGB: 0.02, beatPunch: 8, flashAmt: 0.3 },
    chaos: { bgSelect: 'galaxy', themeSelect: 'random', shapeSelect: 'random', styleSelect: 'mix', deformSelect: 'mix', layoutSelect: 'cloud', gridSlider: 4, speedSlider: 1.5, dispSlider: 0.8, randomSizeCheck: true, randomPosCheck: true, audDisp: 1.5, audGlow: 1.5, audScale: 0.2, audRGB: 0.005, camShake: 0.3 },
    vaporwave: { themeSelect: 'vaporwave', styleSelect: '1', layoutSelect: 'ring', gridSlider: 4, bgSelect: 'synthgrid', camMode: 'orbit', camOrbitSpeed: 0.15, fxScan: 0.35, fxGrain: 0.06, fxVignette: 0.5, bloomSlider: 0.8, autoRotCheck: true, audDisp: 1.2, audGlow: 1.5 },
    inferno: { themeSelect: 'fire', styleSelect: '4', deformSelect: '1', speedSlider: 2.5, dispSlider: 0.9, bloomSlider: 1.2, bgSelect: 'ripples', starModeSelect: 'rise', fxGrain: 0.08, beatPunch: 10, flashAmt: 0.4, audDisp: 1.8, audGlow: 2 },
    deepsea: { themeSelect: 'ocean', styleSelect: '0', deformSelect: '3', layoutSelect: 'sphere', gridSlider: 6, speedSlider: 0.5, bgSelect: 'aurora', camMode: 'orbit', camOrbitSpeed: 0.12, starModeSelect: 'rise', starSizeSlider: 0.05, fxWobble: 0.6, fxVignette: 0.6, bloomSlider: 0.5, autoRotCheck: true },
    hologram: { themeSelect: 'aurora', styleSelect: '3', shapeSelect: 'icosahedron', layoutSelect: 'helix', gridSlider: 5, fxScan: 0.4, fxGrain: 0.05, bloomSlider: 1, bgSelect: 'voronoi', camMode: 'fly', fxTrails: 0.5, autoRotCheck: true },
    glitch: { themeSelect: 'cyberpunk', styleSelect: '2', shapeSelect: 'cube', deformSelect: '4', gridSlider: 3, glitchSlider: 0.5, fxPixel: 6, fxPoster: 6, fxScan: 0.3, rgbSlider: 0.01, camShake: 0.4, beatPunch: 12, flashAmt: 0.5 },
    kaleido: { themeSelect: 'vaporwave', styleSelect: '1', shapeSelect: 'knot2', fxKaleido: 6, hueSpeedSlider: 0.3, fxTrails: 0.6, bloomSlider: 1, bgSelect: 'tunnel', camMode: 'vertigo', autoRotCheck: true, speedSlider: 1.2 }
};
Object.keys(PRESETS).forEach(name => {
    const btn = $('pre-' + name); if (btn) btn.addEventListener('click', () => applyPreset(PRESETS[name]));
});

// --- VERRAS ME (gecureerd willekeurig) & NUKE (alles willekeurig) ---
function surpriseMe() {
    const themes = [...$('themeSelect').options].map(o => o.value).filter(v => v !== 'custom');
    const layout = pick(['grid', 'grid', 'ring', 'sphere', 'spiral', 'helix', 'wave', 'cloud']);
    const fxPool = [
        { fxKaleido: pick([4, 5, 6, 8]) }, { fxMirror: 1 }, { fxMirror: 2 }, { fxPixel: pick([4, 6, 8]) }, { fxPoster: pick([4, 6]) },
        { fxScan: 0.35 }, { fxGrain: 0.12 }, { fxWarp: pick([-0.4, 0.4]) }, { fxWobble: 0.6 }, { fxTrails: 0.8 }, { fxVignette: 0.6 }, {}
    ];
    const values = {
        themeSelect: pick(themes), shapeSelect: pick([...geometryKeys, 'random']),
        styleSelect: pick(['0', '1', '2', '3', '4', '5', '6', 'mix']), deformSelect: pick(['0', '0', '1', '2', '3', '4', 'mix']),
        layoutSelect: layout, gridSlider: layout === 'grid' ? Math.floor(rand(1, 5)) : Math.floor(rand(3, 8)),
        hueSpeedSlider: Math.random() < 0.4 ? rand(0.05, 0.5).toFixed(2) : 0,
        bgSelect: pick(['dark', 'deep', 'cycle', 'pulse', 'nebula', 'synthgrid', 'tunnel', 'aurora', 'voronoi', 'galaxy', 'ripples', 'nebula', 'aurora']), camMode: pick(['free', 'free', 'orbit', 'fly', 'vertigo']), starModeSelect: pick(['drift', 'warp', 'swirl', 'rain', 'rise']),
        speedSlider: rand(0.3, 3).toFixed(1), dispSlider: rand(0.1, 1.2).toFixed(2), bloomSlider: rand(0, 1.6).toFixed(1),
        rgbSlider: pick([0.0015, 0.003, 0.006]), wireframeCheck: Math.random() < 0.15, autoRotCheck: Math.random() < 0.6,
        randomRotCheck: Math.random() < 0.3, randomSizeCheck: Math.random() < 0.25,
        beatPunch: pick([0, 6, 12]), flashAmt: pick([0, 0.2, 0.4]), camShake: pick([0, 0, 0.25]), camRoll: pick([0, 0, 0, -15, 15, 30]),
        audDisp: rand(0.5, 2.5).toFixed(1), audGlow: rand(0.5, 2.5).toFixed(1), audScale: pick([0, 0.2, 0.5]),
        mapDisp: pick(['bass', 'mid', 'high']), mapGlow: pick(['bass', 'mid', 'high']), mapScale: pick(['bass', 'mid', 'high'])
    };
    Object.assign(values, pick(fxPool), Math.random() < 0.4 ? pick(fxPool) : {});
    applyPreset(values);
    showToast('🎲 ' + values.themeSelect + ' · ' + values.layoutSelect);
}
$('surpriseBtn').addEventListener('click', surpriseMe);

const NUKE_SKIP = new Set(['zoomSlider', 'autoQualityCheck', 'demoCheck', 'demoBpm', 'djCheck', 'djInterval', 'cColor1', 'cColor2', 'cColor3', 'bgColor', 'audioSmoothSlider']);
$('nukeBtn').addEventListener('click', () => {
    settingEls.forEach(el => {
        if (NUKE_SKIP.has(el.id)) return;
        if (el.tagName === 'SELECT') { setControl(el.id, el.options[Math.floor(Math.random() * el.options.length)].value); }
        else if (el.type === 'checkbox') { setControl(el.id, Math.random() > 0.5); }
        else if (el.type === 'range') {
            const min = parseFloat(el.min); let max = parseFloat(el.max);
            if (el.id === 'gridSlider') max = 8;
            else if (el.id.startsWith('fx') && el.id !== 'fxSat') max = min + (max - min) * 0.5;
            setControl(el.id, (Math.random() * (max - min) + min).toFixed(2));
        }
    });
});

// --- AUDIO SETUP ---
let audioContext, analyser, dataArray; let isAudioActive = false; let activeStream = null;
const audioStatus = $('audio-status');
const audioButtons = {
    sys: { el: $('sysAudioBtn'), idle: $('sysAudioBtn').innerText },
    mic: { el: $('micBtn'), idle: $('micBtn').innerText },
    file: { el: $('fileAudioBtn'), idle: $('fileAudioBtn').innerText }
};
let audioEl = null;
function showAudioStatus(msg) { audioStatus.innerText = msg; audioStatus.style.display = msg ? 'block' : 'none'; }

function stopAudio() {
    if (audioEl) { audioEl.pause(); URL.revokeObjectURL(audioEl.src); audioEl = null; }
    if (activeStream) activeStream.getTracks().forEach(t => t.stop());
    activeStream = null; isAudioActive = false; analyser = null;
    audioBass = audioMid = audioHigh = bassAverage = 0;
    ['bass', 'mid', 'high'].forEach(k => $('bar-' + k).style.height = '5%');
    Object.values(audioButtons).forEach(b => { b.el.innerText = b.idle; b.el.style.background = ''; b.el.style.opacity = '1'; });
}

async function setupAudio(stream, btnElement, activeText) {
    if (isAudioActive) return;
    if (stream.getAudioTracks().length === 0) {
        stream.getTracks().forEach(t => t.stop());
        showAudioStatus('Geen audio ontvangen. Kies bij het delen een tabblad en vink "Tabaudio delen" aan.');
        return;
    }
    try {
        if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === 'suspended') await audioContext.resume();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.85;
        stream.getVideoTracks().forEach(t => t.stop());
        const source = audioContext.createMediaStreamSource(new MediaStream(stream.getAudioTracks())); source.connect(analyser);
        dataArray = new Uint8Array(analyser.frequencyBinCount); isAudioActive = true; activeStream = stream;
        stream.getAudioTracks()[0].addEventListener('ended', stopAudio);
        Object.values(audioButtons).forEach(b => b.el.style.opacity = '0.5');
        btnElement.innerText = activeText + ' (klik om te stoppen)'; btnElement.style.background = 'linear-gradient(45deg, #00d4ff, #00ff88)'; btnElement.style.opacity = '1';
        showAudioStatus('');
    } catch (err) {
        stream.getTracks().forEach(t => t.stop());
        showAudioStatus('Audio kon niet gestart worden: ' + err.message);
    }
}
async function playAudioFile(file) {
    if (isAudioActive) stopAudio();
    try {
        if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === 'suspended') await audioContext.resume();
        const el = new Audio(); el.src = URL.createObjectURL(file); el.loop = true;
        analyser = audioContext.createAnalyser(); analyser.fftSize = 512; analyser.smoothingTimeConstant = 0.85;
        const source = audioContext.createMediaElementSource(el);
        source.connect(analyser); analyser.connect(audioContext.destination); // zodat je het ook hoort
        dataArray = new Uint8Array(analyser.frequencyBinCount);
        await el.play();
        audioEl = el; isAudioActive = true;
        activeStream = el.captureStream ? el.captureStream() : null;
        Object.values(audioButtons).forEach(b => b.el.style.opacity = '0.5');
        const btn = audioButtons.file.el;
        btn.innerText = '🎶 ' + (file.name.length > 28 ? file.name.slice(0, 25) + '...' : file.name) + ' (klik om te stoppen)';
        btn.style.background = 'linear-gradient(45deg, #00d4ff, #00ff88)'; btn.style.opacity = '1';
        showAudioStatus('');
    } catch (err) { analyser = null; showAudioStatus('Bestand kon niet afgespeeld worden: ' + err.message); }
}
const fileInput = document.createElement('input'); fileInput.type = 'file'; fileInput.accept = 'audio/*';
fileInput.addEventListener('change', () => { if (fileInput.files[0]) playAudioFile(fileInput.files[0]); fileInput.value = ''; });
$('fileAudioBtn').addEventListener('click', () => { if (isAudioActive) stopAudio(); else fileInput.click(); });
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => {
    e.preventDefault();
    const f = [...e.dataTransfer.files].find(f => f.type.startsWith('audio/'));
    if (f) playAudioFile(f); else showToast('Sleep een audiobestand (mp3, wav, ogg...)');
});

function audioErrorMessage(err) {
    if (err.name === 'NotAllowedError') return 'Toegang geweigerd. Sta het delen of de microfoon toe in je browser.';
    if (err.name === 'NotFoundError') return 'Geen microfoon of audiobron gevonden.';
    return 'Audio kon niet gestart worden: ' + err.message;
}
$('sysAudioBtn').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    if (isAudioActive) { stopAudio(); return; }
    try { const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }); setupAudio(stream, btn, "🎵 Systeem Audio Actief"); }
    catch (err) { showAudioStatus(audioErrorMessage(err)); }
});
$('micBtn').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    if (isAudioActive) { stopAudio(); return; }
    try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); setupAudio(stream, btn, "🎙️ Microfoon Actief"); }
    catch (err) { showAudioStatus(audioErrorMessage(err)); }
});

// --- ACHTERGROND ---
let lastBg = '';
function updateBackground(delta) {
    const mode = $('bgSelect').value;
    if (BG_MODES[mode]) {
        const react = num('bgReact'); const u = bgMaterial.uniforms;
        bgTime += delta * num('bgSpeed');
        bgMesh.visible = true;
        u.u_mode.value = BG_MODES[mode]; u.u_time.value = bgTime;
        u.u_bass.value = audioBass * react; u.u_mid.value = audioMid * react; u.u_high.value = audioHigh * react;
        u.u_beat.value = beatEnergy * react; u.u_bright.value = num('bgBright');
        u.u_hue.value = THREE.MathUtils.degToRad(num('hueSlider')) + hueAngle;
        u.u_look.value.set(Math.sin(group.rotation.y) * 0.5, Math.sin(group.rotation.x) * 0.5);
        const m0 = meshes[0];
        if (m0) { u.u_c1.value.copy(m0.material.uniforms.color1.value); u.u_c2.value.copy(m0.material.uniforms.color2.value); u.u_c3.value.copy(m0.material.uniforms.color3.value); }
        if (lastBg !== '#000') { document.body.style.background = '#000'; lastBg = '#000'; }
        return;
    }
    bgMesh.visible = false;
    let css;
    if (mode === 'deep') css = 'radial-gradient(circle at 50% 40%, #14143a 0%, #05050f 70%)';
    else if (mode === 'cycle') { const h = (elapsed * 8) % 360; css = `radial-gradient(circle at 50% 40%, hsl(${h}, 60%, 15%) 0%, hsl(${(h + 70) % 360}, 70%, 3%) 80%)`; }
    else if (mode === 'pulse') { const h = (elapsed * 12) % 360; css = `radial-gradient(circle at 50% 50%, hsl(${h}, 70%, ${(3 + audioBass * 26).toFixed(1)}%) 0%, hsl(${(h + 40) % 360}, 60%, 2%) 85%)`; }
    else if (mode === 'custom') css = $('bgColor').value;
    else css = '#050505';
    if (css !== lastBg) { document.body.style.background = css; lastBg = css; }
}

// --- STARDUST ---
function updateStars(delta) {
    particlesMaterial.size = num('starSizeSlider') * (1 + audioHigh * 1.5);
    particlesMaterial.opacity = 0.35 + audioHigh * 0.4;
    if (!particlesMesh.visible) return;
    const mode = $('starModeSelect').value;
    if (mode === 'drift') { particlesMesh.rotation.y -= 0.0005; particlesMesh.rotation.x -= 0.0002; return; }
    if (mode === 'swirl') { particlesMesh.rotation.y -= 0.002 + audioMid * 0.02; particlesMesh.rotation.z += 0.0005; return; }
    particlesMesh.rotation.set(0, 0, 0);
    const speed = (6 + audioBass * 40) * delta;
    for (let i = 0; i < particlesCount; i++) {
        const ix = i * 3;
        if (mode === 'warp') { posArray[ix + 2] += speed * 2; if (posArray[ix + 2] > 75) posArray[ix + 2] -= 150; }
        else if (mode === 'rain') { posArray[ix + 1] -= speed; if (posArray[ix + 1] < -75) posArray[ix + 1] += 150; }
        else { posArray[ix + 1] += speed; if (posArray[ix + 1] > 75) posArray[ix + 1] -= 150; }
    }
    particlesGeometry.attributes.position.needsUpdate = true;
}

// --- MUIS: magneet ---
const mouseNDC = new THREE.Vector2(); let mouseActive = false;
const mousePlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const mouseWorld = new THREE.Vector3(); const mouseLocal = new THREE.Vector3();
const tmpTarget = new THREE.Vector3(); const tmpDir = new THREE.Vector3();
document.addEventListener('pointermove', (e) => {
    if (e.target.closest('#controls')) { mouseActive = false; return; }
    mouseNDC.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1); mouseActive = true;
});
document.documentElement.addEventListener('mouseleave', () => mouseActive = false);

// --- QUALITY ---
function setPixelRatio(ratio) {
    currentPixelRatio = ratio;
    renderer.setPixelRatio(ratio);
    composer.setPixelRatio(ratio);
    composer.setSize(window.innerWidth, window.innerHeight);
    updateFxResolution();
}
function adaptQuality(fps) {
    lowFpsStreak = fps < 30 ? lowFpsStreak + 1 : 0;
    highFpsStreak = fps >= 58 ? highFpsStreak + 1 : 0;
    if (lowFpsStreak >= 2 && currentPixelRatio > 0.5) { setPixelRatio(Math.max(0.5, currentPixelRatio - 0.25)); lowFpsStreak = 0; }
    else if (highFpsStreak >= 6 && currentPixelRatio < maxPixelRatio) { setPixelRatio(Math.min(maxPixelRatio, currentPixelRatio + 0.25)); highFpsStreak = 0; }
}
$('autoQualityCheck').addEventListener('change', (e) => {
    isAutoQuality = e.target.checked;
    if (!isAutoQuality) setPixelRatio(maxPixelRatio);
});

// --- ANIMATIE ---
const clock = new THREE.Clock();
let timeAccumulator = 0.0;
let frames = 0; let prevTime = performance.now();
let cineTimer = 0; let cineTarget = new THREE.Vector3(); let cineZoom = 6;
let tempCamVec = new THREE.Vector3();
const FX_IDS = { fxKaleido: 'u_kaleido', fxMirror: 'u_mirror', fxPixel: 'u_pixel', fxPoster: 'u_poster', fxSat: 'u_sat', fxScan: 'u_scan', fxGrain: 'u_grain', fxVignette: 'u_vignette', fxWarp: 'u_warp', fxWobble: 'u_wobble' };

function animate() {
    requestAnimationFrame(animate);

    frames++; const timeNow = performance.now();
    if (timeNow >= prevTime + 1000) {
        const fps = Math.round((frames * 1000) / (timeNow - prevTime));
        $('fps-counter').innerText = fps + ' FPS';
        frames = 0; prevTime = timeNow;
        if (isAutoQuality && !document.hidden) adaptQuality(fps);
    }

    const delta = Math.min(clock.getDelta(), 0.1);
    elapsed += delta;
    if (gridDirty) { gridDirty = false; createGrid(gridCount); }

    if (isAutopilot) {
        apOffsets.disp += delta * 0.5; apOffsets.bloom += delta * 0.2; apOffsets.rgb += delta * 0.1;
        currentDisplacement = (Math.sin(apOffsets.disp)*0.5 + 0.5) * 2.0;
        baseBloom = (Math.sin(apOffsets.bloom)*0.5 + 0.5) * 2.0;
        $('dispSlider').value = currentDisplacement;
        $('bloomSlider').value = baseBloom;
    }

    let timeDelta = delta;
    let glitchActive = false;
    if (glitchAmount > 0 && Math.random() < (glitchAmount * 0.05)) {
        glitchActive = true;
        timeDelta = delta * -2.0;
        rgbShiftPass.uniforms['amount'].value = Math.random() * 0.05;
        camera.position.x += (Math.random() - 0.5) * glitchAmount * 2;
        camera.position.y += (Math.random() - 0.5) * glitchAmount * 2;
    }

    if (isAutoRotate && !isCinematic) { group.rotation.y += 0.005; }
    hueAngle += delta * num('hueSpeedSlider') * 2.0;

    // --- AUDIO: echte invoer, of het demo-ritme ---
    let beatDropped = false;
    let targetBass = 0, targetMid = 0, targetTreble = 0;

    if (isAudioActive && analyser) {
        analyser.getByteFrequencyData(dataArray);
        let sumBass = 0; for(let i = 0; i < 10; i++) sumBass += dataArray[i];
        targetBass = (sumBass / 10) / 255.0;
        let sumMid = 0; for(let i = 20; i < 60; i++) sumMid += dataArray[i];
        targetMid = (sumMid / 40) / 255.0;
        let sumTreble = 0; for(let i = 100; i < 200; i++) sumTreble += dataArray[i];
        targetTreble = (sumTreble / 100) / 255.0;

        // Beat = ruwe bass ruim boven het lopende gemiddelde (los van de smoothing-slider)
        bassAverage = bassAverage * 0.95 + targetBass * 0.05;
        if (targetBass > 0.2 && targetBass > bassAverage * 1.35 && timeNow - lastBeatTime > 300) {
            beatDropped = true; lastBeatTime = timeNow;
        }
    } else if ($('demoCheck').checked) {
        demoPhase += delta * num('demoBpm') / 60;
        const beatIndex = Math.floor(demoPhase);
        const f = demoPhase % 1; const fOff = (demoPhase + 0.5) % 1; const fHat = (demoPhase * 2 + 0.25) % 1;
        targetBass = 0.12 + (beatIndex % 4 === 0 ? 0.85 : 0.68) * Math.exp(-f * 7);
        targetMid = 0.2 + 0.45 * Math.exp(-fOff * 9) + 0.12 * (Math.sin(elapsed * 1.3) * 0.5 + 0.5);
        targetTreble = 0.12 + 0.5 * Math.exp(-fHat * 14);
        if (beatIndex !== lastDemoBeat) { lastDemoBeat = beatIndex; beatDropped = true; }
    }

    const lerpFactor = 1.0 - audioSmoothing;
    audioBass += (targetBass - audioBass) * lerpFactor;
    audioMid += (targetMid - audioMid) * lerpFactor;
    audioHigh += (targetTreble - audioHigh) * lerpFactor;

    $('bar-bass').style.height = (audioBass * 100) + '%';
    $('bar-mid').style.height = (audioMid * 100) + '%';
    $('bar-high').style.height = (audioHigh * 100) + '%';

    histIndex = (histIndex - 1 + MAX_HISTORY) % MAX_HISTORY;
    audioHistory[histIndex].bass = audioBass;
    audioHistory[histIndex].mid = audioMid;
    audioHistory[histIndex].high = audioHigh;

    // --- BEAT-REACTIES ---
    beatEnergy *= Math.exp(-delta * 5);
    fovKick *= Math.exp(-delta * 8);
    if (beatDropped) {
        beatEnergy = 1.0; beatSign = -beatSign; fovKick = num('beatPunch');
        if (isShapeShifting) {
            const shiftKey = pick(geometryKeys);
            meshes.forEach(m => m.geometry = geometries[shiftKey]);
        }
        if ($('explosionsCheck').checked && meshes.length > 0) {
            const rMesh = pick(meshes);
            const worldPos = new THREE.Vector3(); rMesh.getWorldPosition(worldPos);
            triggerExplosion(worldPos, rMesh.material.uniforms.color1.value);
        }
        if (isSwarmMode) {
            meshes.forEach(m => {
                m.userData.velocity.x += (Math.random()-0.5)*0.5;
                m.userData.velocity.y += (Math.random()-0.5)*0.5;
                m.userData.velocity.z += (Math.random()-0.5)*0.5;
            });
        }
    }

    // --- AUTO-DJ ---
    if ($('djCheck').checked) {
        djTimer += delta;
        const interval = num('djInterval');
        if (djTimer >= interval && (beatDropped || djTimer >= interval * 1.6)) { djTimer = 0; surpriseMe(); }
    } else { djTimer = 0; }

    for(let i=0; i<expParticleCount; i++) {
        if(expLifeArray[i] > 0) {
            expPosArray[i*3] += expVelArray[i].x; expPosArray[i*3+1] += expVelArray[i].y; expPosArray[i*3+2] += expVelArray[i].z;
            expVelArray[i].multiplyScalar(0.95);
            expLifeArray[i] -= 0.015;
        }
    }
    expGeometry.attributes.position.needsUpdate = true;
    expGeometry.attributes.alpha.needsUpdate = true;

    updateStars(delta);
    updateBackground(delta);

    const globalDelayIndex = Math.min(audioDelayFrames, MAX_HISTORY - 1);
    const globalHist = audioHistory[(histIndex + globalDelayIndex) % MAX_HISTORY];
    const gSpeedAudio = globalHist[mapSpeed] || 0;
    const gGlowAudio = globalHist[mapGlow] || 0;
    const gRGBAudio = globalHist[mapRGB] || 0;

    timeAccumulator += timeDelta * (currentSpeed + (gSpeedAudio * audSpeedAmt));

    // --- POST-FX ---
    const flash = beatEnergy * num('flashAmt');
    bloomPass.strength = baseBloom + (gGlowAudio * audGlowAmt) + flash * 1.5;
    bloomPass.enabled = bloomPass.strength > 0.01;
    if(!glitchActive) rgbShiftPass.uniforms['amount'].value = baseRGB + (gRGBAudio * audRGBAmt);
    rgbShiftPass.enabled = glitchActive || rgbShiftPass.uniforms['amount'].value > 0.0001;

    if (afterimagePass) {
        const trails = num('fxTrails');
        afterimagePass.enabled = trails > 0.01;
        afterimagePass.uniforms['damp'].value = trails;
    }
    let fxOn = flash > 0.01;
    for (const id in FX_IDS) {
        const v = num(id); fxPass.uniforms[FX_IDS[id]].value = v;
        if (id === 'fxSat' ? Math.abs(v - 1) > 0.01 : (id === 'fxWarp' ? Math.abs(v) > 0.001 : v > 0.001)) fxOn = true;
    }
    const blur = num('fxBlur') + beatEnergy * num('beatPunch') * 0.004;
    fxPass.uniforms.u_blur.value = blur; if (blur > 0.001) fxOn = true;
    fxPass.uniforms.u_flash.value = flash * 0.25;
    fxPass.uniforms.u_time.value = elapsed;
    fxPass.enabled = fxOn;

    // --- CAMERA ---
    const camMode = $('camMode').value;
    const baseFov = num('camFov');
    let fovBase = baseFov;
    if (isCinematic) {
        cineTimer -= delta;
        if(cineTimer <= 0) {
            cineTimer = 3.0 + Math.random() * 4.0;
            if (meshes.length > 0) {
                const rMesh = pick(meshes);
                cineTarget.copy(rMesh.position).multiplyScalar(1.5);
                cineZoom = 2.0 + Math.random() * 15.0;
                if(Math.random() > 0.6) {
                    camera.position.set((Math.random()-0.5)*20, (Math.random()-0.5)*20, cineZoom);
                }
            }
        }
        tempCamVec.set(cineTarget.x * 0.5, cineTarget.y * 0.5, cineZoom);
        camera.position.lerp(tempCamVec, 0.02);
        camera.lookAt(group.position);
    } else if (camMode === 'orbit') {
        // Camera cirkelt zelf rond de scene, met een rustige op-en-neer beweging
        camAngle += delta * num('camOrbitSpeed');
        tempCamVec.set(Math.sin(camAngle) * targetZoom, Math.sin(elapsed * 0.25) * targetZoom * 0.3, Math.cos(camAngle) * targetZoom);
        camera.position.lerp(tempCamVec, 0.08);
        camera.lookAt(scene.position);
    } else if (camMode === 'fly') {
        // Fly-through: de camera zweeft door en tussen de objecten, kijkend naar waar hij heen gaat
        const e = Math.max(layoutExtent, 3.5); const k = elapsed * 0.12 * (0.4 + num('camOrbitSpeed'));
        const path = (kk, out) => out.set(Math.sin(kk * 1.3) * e * 0.8, Math.cos(kk * 0.9) * e * 0.55, Math.sin(kk * 0.7 + 1.0) * e * 0.8);
        path(k, tempCamVec); camera.position.lerp(tempCamVec, 0.1);
        path(k + 0.25, cineTarget); camera.lookAt(cineTarget);
    } else if (camMode === 'vertigo') {
        // Dolly-zoom: FOV en afstand compenseren elkaar, dus de achtergrond rekt terwijl het onderwerp even groot blijft
        fovBase = baseFov + 28 * Math.sin(elapsed * 0.7);
        const dist = targetZoom * Math.tan(THREE.MathUtils.degToRad(baseFov / 2)) / Math.tan(THREE.MathUtils.degToRad(fovBase / 2));
        camera.position.z += (dist - camera.position.z) * 0.2;
        camera.position.x += (0 - camera.position.x) * 0.1;
        camera.position.y += (0 - camera.position.y) * 0.1;
        camera.lookAt(scene.position);
    } else {
        if(!glitchActive) {
            camera.position.z += (targetZoom - camera.position.z) * 0.05;
            camera.position.x += (0 - camera.position.x) * 0.1;
            camera.position.y += (0 - camera.position.y) * 0.1;
        }
        camera.lookAt(scene.position);
    }
    const shake = num('camShake');
    if (shake > 0) {
        const e = 0.15 + beatEnergy;
        camera.position.x += (Math.random() - 0.5) * shake * e * 0.8;
        camera.position.y += (Math.random() - 0.5) * shake * e * 0.8;
    }
    camera.rotateZ(THREE.MathUtils.degToRad(num('camRoll')) + beatSign * beatEnergy * num('beatPunch') * 0.004);
    const targetFov = fovBase + fovKick;
    if (Math.abs(camera.fov - targetFov) > 0.01) { camera.fov = targetFov; camera.updateProjectionMatrix(); }

    // Traagheid: na loslaten tolt de rotatie rustig uit
    if (activePointers.size === 0 && !isCinematic) {
        group.rotation.y += spin.y;
        group.rotation.x = Math.max(-1.5, Math.min(1.5, group.rotation.x + spin.x));
        const damp = Math.exp(-delta * 2.5); spin.x *= damp; spin.y *= damp;
    }

    // --- MUIS-MAGNEET ---
    const magnet = num('magnetSlider');
    let useMagnet = false;
    if (magnet !== 0 && mouseActive) {
        raycaster.setFromCamera(mouseNDC, camera);
        if (raycaster.ray.intersectPlane(mousePlane, mouseWorld)) { mouseLocal.copy(mouseWorld); group.worldToLocal(mouseLocal); useMagnet = true; }
    }

    // --- OBJECTEN ---
    const styleSel = $('styleSelect').value; const deformSel = $('deformSelect').value;
    const hueShift = THREE.MathUtils.degToRad(num('hueSlider')) + hueAngle;
    const waveDelay = $('delayWaveCheck').checked;

    meshes.forEach(s => {
        let delayIndex = audioDelayFrames;
        if (isAudioRandomDelay) delayIndex = Math.floor(s.userData.randomDelayFactor * audioDelayFrames);
        else if (waveDelay) delayIndex = Math.floor(s.userData.distNorm * audioDelayFrames);
        delayIndex = Math.min(delayIndex, MAX_HISTORY - 1);
        const hist = audioHistory[(histIndex + delayIndex) % MAX_HISTORY];

        const sDispAudio = hist[mapDisp] || 0;
        const sGlowAudio = hist[mapGlow] || 0;
        const sScaleAudio = hist[mapScale] || 0;
        const sRotAudio = hist[mapRot] || 0;

        const u = s.material.uniforms;
        u.u_time.value = timeAccumulator;
        u.u_displacementAmount.value = currentDisplacement;
        u.u_dispAudio.value = sDispAudio * audDispAmt;
        u.u_glowAudio.value = sGlowAudio * audGlowAmt;
        u.u_style.value = styleSel === 'mix' ? s.userData.style : parseFloat(styleSel);
        u.u_deform.value = deformSel === 'mix' ? s.userData.deform : parseFloat(deformSel);
        u.u_hueShift.value = hueShift;

        const finalScale = s.userData.baseScale * (1.0 + (sScaleAudio * audScaleAmt));
        s.scale.set(finalScale, finalScale, finalScale);

        const finalRotSpeed = globalRotSpeed + (sRotAudio * audRotAmt);
        if (isRandomRotation) {
            s.rotation.x += s.userData.randRot.x * finalRotSpeed * randRotMultiplier * 10;
            s.rotation.y += s.userData.randRot.y * finalRotSpeed * randRotMultiplier * 10;
            s.rotation.z += s.userData.randRot.z * finalRotSpeed * randRotMultiplier * 10;
        } else {
            s.rotation.x += 0.001 * finalRotSpeed;
            s.rotation.y += 0.0015 * finalRotSpeed;
        }

        if (isSwarmMode) {
            s.userData.swarmPhase += delta * 0.5;
            s.userData.velocity.x += Math.sin(s.userData.swarmPhase + s.userData.id) * 0.001;
            s.userData.velocity.y += Math.cos(s.userData.swarmPhase) * 0.001;
            s.userData.velocity.x -= s.position.x * 0.0005;
            s.userData.velocity.y -= s.position.y * 0.0005;
            s.userData.velocity.z -= s.position.z * 0.0005;
            s.userData.velocity.clampLength(0, 0.1);
            s.position.add(s.userData.velocity);
        } else {
            tmpTarget.copy(s.userData.basePos);
            if (useMagnet) {
                tmpDir.copy(s.position).sub(mouseLocal);
                const d = tmpDir.length(); const R = 6;
                if (d < R && d > 0.001) tmpTarget.addScaledVector(tmpDir.multiplyScalar(1 / d), (1 - d / R) * magnet * 3.0);
            }
            s.position.lerp(tmpTarget, 0.08);
        }
    });

    composer.render();
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight); composer.setSize(window.innerWidth, window.innerHeight);
    updateFxResolution();
});

// --- ZOOM & ROTATIE MET MUIS / TOUCH ---
function applyZoom(value) {
    targetZoom = Math.min(250, Math.max(2, value));
    const slider = $('zoomSlider');
    slider.value = targetZoom; slider.dataset.userTouched = 'true';
}
$('canvas-container').addEventListener('wheel', (e) => {
    e.preventDefault();
    applyZoom(targetZoom * Math.exp(e.deltaY * 0.001));
}, { passive: false });

const activePointers = new Map(); let pinchDistance = 0;
function currentPinchDistance() { const [a, b] = [...activePointers.values()]; return Math.hypot(a.x - b.x, a.y - b.y); }
document.addEventListener('pointerdown', (e) => {
    if (e.target.closest('#controls') || e.target.closest('#ui-toggle')) return;
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointers.size === 2) pinchDistance = currentPinchDistance();
});
document.addEventListener('pointermove', (e) => {
    const prev = activePointers.get(e.pointerId);
    if (!prev) return;
    const next = { x: e.clientX, y: e.clientY };
    if (activePointers.size === 2) {
        activePointers.set(e.pointerId, next);
        const dist = currentPinchDistance();
        if (pinchDistance > 0 && dist > 0) applyZoom(targetZoom * (pinchDistance / dist));
        pinchDistance = dist;
    } else if (!isCinematic) {
        spin.y = (next.x - prev.x) * 0.01; spin.x = (next.y - prev.y) * 0.01;
        group.rotation.y += spin.y;
        group.rotation.x = Math.max(-1.5, Math.min(1.5, group.rotation.x + spin.x));
        activePointers.set(e.pointerId, next);
    } else {
        activePointers.set(e.pointerId, next);
    }
});
const endPointer = (e) => { activePointers.delete(e.pointerId); pinchDistance = 0; };
document.addEventListener('pointerup', endPointer); document.addEventListener('pointercancel', endPointer); document.addEventListener('pointerleave', endPointer);

// --- UI: verbergen (H) & sneltoetsen ---
function toggleUI() { controlsPanel.classList.toggle('hidden'); }
$('ui-toggle').addEventListener('click', toggleUI);
document.addEventListener('keydown', (e) => {
    if (e.target.matches('input[type="number"], select') || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'h') toggleUI();
    else if (k === 'r') surpriseMe();
    else if (k === 'f') toggleFullscreen();
    else if (k === 's') exportPNG();
    else if (k === 'c') { const opts = [...$('camMode').options].map(o => o.value); const next = opts[(opts.indexOf($('camMode').value) + 1) % opts.length]; setControl('camMode', next); showToast('📷 Camera: ' + next); }
    else if (k === 'd') { const c = $('djCheck'); c.checked = !c.checked; c.dispatchEvent(new Event('change', { bubbles: true })); showToast('Auto-DJ ' + (c.checked ? 'aan' : 'uit')); }
});

loadInitialSettings();
animate();
