
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000); 
camera.position.z = 4.5;

const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: "high-performance", preserveDrawingBuffer: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); 
container.appendChild(renderer.domElement);

// --- POST PROCESSING SETUP ---
const composer = new THREE.EffectComposer(renderer);
const renderPass = new THREE.RenderPass(scene, camera);
composer.addPass(renderPass);

const bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.2, 0.4, 0.85);
bloomPass.threshold = 0.1; bloomPass.strength = 0.0; bloomPass.radius = 0.5;
composer.addPass(bloomPass);

const rgbShiftPass = new THREE.ShaderPass(THREE.RGBShiftShader);
rgbShiftPass.uniforms['amount'].value = 0.0015;
composer.addPass(rgbShiftPass);

// --- PARTICLES (STARDUST) ---
const particlesGeometry = new THREE.BufferGeometry();
const particlesCount = 2000;
const posArray = new Float32Array(particlesCount * 3);
for(let i = 0; i < particlesCount * 3; i++) { posArray[i] = (Math.random() - 0.5) * 150; } 
particlesGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
const particlesMaterial = new THREE.PointsMaterial({ size: 0.08, color: 0xffffff, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending });
const particlesMesh = new THREE.Points(particlesGeometry, particlesMaterial);
scene.add(particlesMesh);

// --- EXPLOSION PARTICLES ---
const expParticleCount = 1500;
const expGeometry = new THREE.BufferGeometry();
const expPosArray = new Float32Array(expParticleCount * 3);
const expVelArray = [];
const expLifeArray = new Float32Array(expParticleCount); 
for(let i=0; i<expParticleCount; i++) {
    expPosArray[i*3] = 0; expPosArray[i*3+1] = 0; expPosArray[i*3+2] = 0;
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
scene.add(expMesh);

function triggerExplosion(pos) {
    if(!document.getElementById('explosionsCheck').checked) return;
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
    icosahedron: new THREE.IcosahedronGeometry(1.2, 20) 
};
const geometryKeys = Object.keys(geometries);

let currentShape = 'sphere';
const group = new THREE.Group();
scene.add(group);
let meshes = [];

// --- SHADERS ---
const vertexShader = `
    uniform float u_time; uniform float u_randomOffset; uniform float u_displacementAmount; 
    uniform float u_dispAudio; uniform float u_indDisp; 
    varying vec3 vNormal; varying vec3 vViewPosition; varying vec3 vObjectPosition;
    void main() {
        float t = u_time * 0.8 + u_randomOffset;
        float noise1 = sin(position.x * 2.5 + t) * cos(position.y * 2.5 - t) * sin(position.z * 2.5 + t);
        float noise2 = cos(position.x * 4.0 - t*0.5) * sin(position.y * 4.0 + t*0.5);
        float combinedNoise = (noise1 + noise2) * 0.3; 
        float activeDisp = (u_indDisp >= 0.0) ? u_indDisp : u_displacementAmount;
        float intensity = activeDisp + (u_dispAudio * 1.5);
        vec3 newPosition = position + (normal * combinedNoise * intensity);
        vObjectPosition = newPosition; 
        vec4 mvPosition = modelViewMatrix * vec4(newPosition, 1.0);
        vNormal = normalize(normalMatrix * normal); vViewPosition = -mvPosition.xyz; 
        gl_Position = projectionMatrix * mvPosition;
    }
`;

const fragmentShader = `
    uniform vec3 color1; uniform vec3 color2; uniform vec3 color3;
    uniform float u_time; uniform float u_randomOffset; uniform float u_glowAudio; 
    uniform float u_isSelected;  
    varying vec3 vNormal; varying vec3 vViewPosition; varying vec3 vObjectPosition;
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
        vec3 coreGlow = gradient * centerBlob * (0.8 + (u_glowAudio * 3.0)); 
        vec3 finalColor = baseColor + coreGlow + (gradient * fresnel * 2.5);
        if(u_isSelected > 0.5) { finalColor += vec3(fresnel * 1.5); }
        gl_FragColor = vec4(finalColor, 1.0);
    }
`;

let currentTheme = 'random';
let customColors = ['#ff0055', '#00d4ff', '#66ff00'];

function getThemeColors() {
    if (currentTheme === 'cyberpunk') return [new THREE.Color(0xff0055), new THREE.Color(0x00d4ff), new THREE.Color(0x9900ff)];
    if (currentTheme === 'sunset') return [new THREE.Color(0xff5500), new THREE.Color(0xff0055), new THREE.Color(0xffaa00)];
    if (currentTheme === 'monochrome') return [new THREE.Color(0xffffff), new THREE.Color(0x666666), new THREE.Color(0x222222)];
    if (currentTheme === 'custom') return [new THREE.Color(customColors[0]), new THREE.Color(customColors[1]), new THREE.Color(customColors[2])];
    return [ new THREE.Color().setHSL(Math.random(), 0.8+Math.random()*0.2, 0.5), new THREE.Color().setHSL(Math.random(), 0.8+Math.random()*0.2, 0.5), new THREE.Color().setHSL(Math.random(), 0.8+Math.random()*0.2, 0.5) ];
}

function updateAllColors() {
    meshes.forEach(m => {
        if (!m.userData.isColorOverridden) {
            const cols = getThemeColors();
            m.material.uniforms.color1.value = cols[0]; m.material.uniforms.color2.value = cols[1]; m.material.uniforms.color3.value = cols[2];
        }
    });
}

// -- GLOBALE VARIABELEN --
let currentDisplacement = 0.3; let currentSpeed = 1.0; 
let gridCount = 1;
let globalRotSpeed = 1.0; let isRandomRotation = false; let randRotMultiplier = 0.5; 
let isRandomSize = false; let isRandomPos = false; let isWireframe = false; let isAutoRotate = false;
let baseBloom = 0.0; let baseRGB = 0.0015; let targetZoom = 4.5;

// -- AUDIO VARIABELEN --
let audioSmoothing = 0.85; // Nieuwe Demping/Smoothness variabele

let audioBass = 0.0; let audioMid = 0.0; let audioHigh = 0.0;

let audDispAmt = 1.0; let audGlowAmt = 1.0; let audScaleAmt = 0.0; let audRotAmt = 0.0; let audSpeedAmt = 0.0; let audRGBAmt = 0.0;
let mapDisp = 'bass'; let mapGlow = 'high'; let mapScale = 'bass'; let mapRot = 'mid'; let mapSpeed = 'mid'; let mapRGB = 'bass';

let audioDelayFrames = 0; let isAudioRandomDelay = false; 
const MAX_HISTORY = 150;
let audioHistory = []; for(let i=0; i<MAX_HISTORY; i++) { audioHistory.push({bass: 0, mid: 0, high: 0}); }
let histIndex = 0;

// -- PLAYGROUND VARIABELEN --
let isSwarmMode = false; let isShapeShifting = false; let isAutopilot = false; let isCinematic = false;
let glitchAmount = 0; let lastBeatTime = 0;
let apOffsets = { disp: Math.random()*100, bloom: Math.random()*100, rgb: Math.random()*100 };

function createGrid(size) {
    gridCount = size;
    meshes.forEach(m => { m.material.dispose(); group.remove(m); });
    meshes = [];
    group.rotation.set(0, 0, 0);

    const spacing = 3.5; 
    const offset = (size - 1) * spacing / 2.0; 

    for(let x = 0; x < size; x++) {
        for(let y = 0; y < size; y++) {
            const cols = getThemeColors();
            const material = new THREE.ShaderMaterial({
                uniforms: {
                    color1: { value: cols[0] }, color2: { value: cols[1] }, color3: { value: cols[2] },
                    u_time: { value: 0.0 }, u_randomOffset: { value: Math.random() * 100.0 },
                    u_displacementAmount: { value: currentDisplacement },
                    u_dispAudio: { value: 0.0 }, u_glowAudio: { value: 0.0 },
                    u_isSelected: { value: 0.0 }, u_indDisp: { value: -1.0 } 
                },
                vertexShader: vertexShader, fragmentShader: fragmentShader, wireframe: isWireframe
            });

            let activeGeometry = geometries[currentShape];
            if (currentShape === 'random') { activeGeometry = geometries[geometryKeys[Math.floor(Math.random() * geometryKeys.length)]]; }
            const mesh = new THREE.Mesh(activeGeometry, material);
            
            let posX = x * spacing - offset; let posY = y * spacing - offset; let posZ = 0;
            if (isRandomPos && size > 1) {
                posX += (Math.random() - 0.5) * 3.5; posY += (Math.random() - 0.5) * 3.5; posZ += (Math.random() - 0.5) * 4.0;
            }
            mesh.position.set(posX, posY, posZ);
            
            let objScale = 1.0;
            if (isRandomSize) objScale = Math.random() * 1.2 + 0.3; 
            mesh.scale.set(objScale, objScale, objScale);
            
            let rotX = (Math.random() - 0.5) * 0.02; let rotY = (Math.random() - 0.5) * 0.02; let rotZ = (Math.random() - 0.5) * 0.02;
            
            let vel = new THREE.Vector3((Math.random()-0.5)*0.1, (Math.random()-0.5)*0.1, (Math.random()-0.5)*0.1);
            let basePos = new THREE.Vector3(posX, posY, posZ);

            mesh.userData = { 
                baseScale: objScale, isColorOverridden: false,
                randRot: { x: rotX, y: rotY, z: rotZ }, id: x + "-" + y,
                randomDelayFactor: Math.random(),
                velocity: vel, basePos: basePos, swarmPhase: Math.random() * Math.PI * 2
            };
            
            group.add(mesh); meshes.push(mesh);
        }
    }
    
    if (size > 1 && !document.getElementById('zoomSlider').dataset.userTouched) {
        targetZoom = size * 4.0; document.getElementById('zoomSlider').value = targetZoom;
    }
}

createGrid(1);

// --- INDIVIDUELE SELECTIE ---
const raycaster = new THREE.Raycaster(); const mouse = new THREE.Vector2(); let selectedMesh = null; let isDraggingCamera = false;
document.getElementById('canvas-container').addEventListener('pointerdown', () => isDraggingCamera = false);
document.getElementById('canvas-container').addEventListener('pointermove', () => isDraggingCamera = true);
document.getElementById('canvas-container').addEventListener('click', (e) => {
    if (isDraggingCamera) return; 
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1; mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera); const intersects = raycaster.intersectObjects(group.children);
    if (intersects.length > 0) selectItem(intersects[0].object); else deselectItem();
});

function selectItem(mesh) {
    if (selectedMesh) selectedMesh.material.uniforms.u_isSelected.value = 0.0;
    selectedMesh = mesh; selectedMesh.material.uniforms.u_isSelected.value = 1.0;
    document.getElementById('individual-panel').style.display = 'block'; document.getElementById('indScale').value = selectedMesh.scale.x;
}
function deselectItem() {
    if (selectedMesh) selectedMesh.material.uniforms.u_isSelected.value = 0.0;
    selectedMesh = null; document.getElementById('individual-panel').style.display = 'none';
}
document.getElementById('deselectBtn').addEventListener('click', deselectItem);
document.getElementById('indScale').addEventListener('input', (e) => { if(selectedMesh) { const val = parseFloat(e.target.value); selectedMesh.scale.set(val, val, val); } });
['indCol1', 'indCol2', 'indCol3'].forEach((id, idx) => { document.getElementById(id).addEventListener('input', (e) => { if(selectedMesh) { selectedMesh.userData.isColorOverridden = true; selectedMesh.material.uniforms['color'+(idx+1)].value = new THREE.Color(e.target.value); } }); });

// --- UI EVENTS ---
function updateSlider(id, val) { 
    const el = document.getElementById(id); 
    if(el) { el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); }
}

document.getElementById('gridSlider').addEventListener('input', (e) => { 
    document.getElementById('zoomSlider').dataset.userTouched = ''; 
    document.getElementById('gridNum').value = e.target.value; 
    createGrid(parseInt(e.target.value)); 
});
document.getElementById('gridNum').addEventListener('input', (e) => { 
    document.getElementById('zoomSlider').dataset.userTouched = ''; 
    document.getElementById('gridSlider').value = e.target.value; 
    createGrid(parseInt(e.target.value)); 
});

document.getElementById('dispSlider').addEventListener('input', (e) => currentDisplacement = parseFloat(e.target.value));
document.getElementById('speedSlider').addEventListener('input', (e) => currentSpeed = parseFloat(e.target.value));
document.getElementById('rotSpeedSlider').addEventListener('input', (e) => globalRotSpeed = parseFloat(e.target.value));
document.getElementById('zoomSlider').addEventListener('input', (e) => { targetZoom = parseFloat(e.target.value); if(e.isTrusted) e.target.dataset.userTouched = 'true'; });

document.getElementById('randomRotCheck').addEventListener('change', (e) => isRandomRotation = e.target.checked);
document.getElementById('randRotSpeedSlider').addEventListener('input', (e) => randRotMultiplier = parseFloat(e.target.value)); 

document.getElementById('randomSizeCheck').addEventListener('change', (e) => { isRandomSize = e.target.checked; createGrid(gridCount); });
document.getElementById('randomPosCheck').addEventListener('change', (e) => { isRandomPos = e.target.checked; createGrid(gridCount); });
document.getElementById('wireframeCheck').addEventListener('change', (e) => { isWireframe = e.target.checked; meshes.forEach(m => m.material.wireframe = isWireframe); });
document.getElementById('particlesCheck').addEventListener('change', (e) => { particlesMesh.visible = e.target.checked; });
document.getElementById('autoRotCheck').addEventListener('change', (e) => { isAutoRotate = e.target.checked; });

// V13 Playground toggles
document.getElementById('swarmCheck').addEventListener('change', (e) => isSwarmMode = e.target.checked);
document.getElementById('shapeShiftCheck').addEventListener('change', (e) => isShapeShifting = e.target.checked);
document.getElementById('autopilotCheck').addEventListener('change', (e) => isAutopilot = e.target.checked);
document.getElementById('cinematicCheck').addEventListener('change', (e) => isCinematic = e.target.checked);
document.getElementById('glitchSlider').addEventListener('input', (e) => glitchAmount = parseFloat(e.target.value));

document.getElementById('themeSelect').addEventListener('change', (e) => { currentTheme = e.target.value; document.getElementById('customColorPickers').style.display = (currentTheme === 'custom') ? 'flex' : 'none'; updateAllColors(); });
['cColor1', 'cColor2', 'cColor3'].forEach((id, index) => { document.getElementById(id).addEventListener('input', (e) => { customColors[index] = e.target.value; updateAllColors(); }); });
document.getElementById('shapeSelect').addEventListener('change', (e) => { currentShape = e.target.value; createGrid(gridCount); });
document.getElementById('bloomSlider').addEventListener('input', (e) => baseBloom = parseFloat(e.target.value));
document.getElementById('rgbSlider').addEventListener('input', (e) => baseRGB = parseFloat(e.target.value));

// -- AUDIO MATRIX UI EVENTS (Amounts) --
document.getElementById('audDisp').addEventListener('input', (e) => audDispAmt = parseFloat(e.target.value));
document.getElementById('audGlow').addEventListener('input', (e) => audGlowAmt = parseFloat(e.target.value));
document.getElementById('audScale').addEventListener('input', (e) => audScaleAmt = parseFloat(e.target.value));
document.getElementById('audRot').addEventListener('input', (e) => audRotAmt = parseFloat(e.target.value));
document.getElementById('audSpeed').addEventListener('input', (e) => audSpeedAmt = parseFloat(e.target.value));
document.getElementById('audRGB').addEventListener('input', (e) => audRGBAmt = parseFloat(e.target.value));
document.getElementById('audioDelaySlider').addEventListener('input', (e) => audioDelayFrames = parseInt(e.target.value));
document.getElementById('audioRandomDelayCheck').addEventListener('change', (e) => isAudioRandomDelay = e.target.checked);
document.getElementById('audioSmoothSlider').addEventListener('input', (e) => audioSmoothing = parseFloat(e.target.value)); // Nieuwe Smoothing slider

// -- AUDIO MATRIX UI EVENTS (Mappings) --
document.getElementById('mapDisp').addEventListener('change', (e) => mapDisp = e.target.value);
document.getElementById('mapGlow').addEventListener('change', (e) => mapGlow = e.target.value);
document.getElementById('mapScale').addEventListener('change', (e) => mapScale = e.target.value);
document.getElementById('mapRot').addEventListener('change', (e) => mapRot = e.target.value);
document.getElementById('mapSpeed').addEventListener('change', (e) => mapSpeed = e.target.value);
document.getElementById('mapRGB').addEventListener('change', (e) => mapRGB = e.target.value);

document.getElementById('exportBtn').addEventListener('click', () => { composer.render(); const dataURL = renderer.domElement.toDataURL('image/png'); const link = document.createElement('a'); link.download = 'Chroma_Generatie.png'; link.href = dataURL; link.click(); });

function setPreset(opts) {
    document.getElementById('themeSelect').value = opts.theme; currentTheme = opts.theme;
    document.getElementById('customColorPickers').style.display = (currentTheme === 'custom') ? 'flex' : 'none';
    document.getElementById('shapeSelect').value = opts.shape; currentShape = opts.shape;
    document.getElementById('wireframeCheck').checked = opts.wire; isWireframe = opts.wire;
    updateSlider('speedSlider', opts.speed); updateSlider('dispSlider', opts.disp); updateSlider('bloomSlider', opts.bloom);
    document.getElementById('randomSizeCheck').checked = opts.randSize; isRandomSize = opts.randSize;
    document.getElementById('randomPosCheck').checked = opts.randPos; isRandomPos = opts.randPos;
    document.getElementById('autoRotCheck').checked = opts.autoRot; isAutoRotate = opts.autoRot;
    
    updateSlider('audDisp', opts.ad); updateSlider('audGlow', opts.ag); updateSlider('audScale', opts.as);
    updateSlider('audRot', 0); updateSlider('audSpeed', 0); updateSlider('audRGB', opts.argb);
    createGrid(gridCount);
}

document.getElementById('preZen').addEventListener('click', () => setPreset({theme: 'sunset', shape: 'sphere', wire: false, speed: 0.2, disp: 0.1, bloom: 0.0, randSize: false, randPos: false, autoRot: true, ad: 0.5, ag: 0.5, as: 0, argb: 0}));
document.getElementById('preRave').addEventListener('click', () => setPreset({theme: 'cyberpunk', shape: 'torus', wire: true, speed: 3.5, disp: 1.5, bloom: 0.0, randSize: false, randPos: false, autoRot: true, ad: 2.0, ag: 2.5, as: 0.5, argb: 0.02}));
document.getElementById('preChaos').addEventListener('click', () => setPreset({theme: 'random', shape: 'random', wire: false, speed: 1.5, disp: 0.8, bloom: 0.0, randSize: true, randPos: true, autoRot: false, ad: 1.5, ag: 1.5, as: 0.2, argb: 0.005}));

document.getElementById('nukeBtn').addEventListener('click', () => {
    const selects = ['shapeSelect', 'themeSelect'];
    selects.forEach(id => {
        const el = document.getElementById(id);
        const options = el.options;
        el.selectedIndex = Math.floor(Math.random() * options.length);
        el.dispatchEvent(new Event('change'));
    });
    const checks = ['wireframeCheck', 'randomSizeCheck', 'randomPosCheck', 'swarmCheck', 'shapeShiftCheck', 'explosionsCheck', 'autopilotCheck', 'cinematicCheck', 'audioRandomDelayCheck'];
    checks.forEach(id => {
        const el = document.getElementById(id);
        el.checked = Math.random() > 0.5;
        el.dispatchEvent(new Event('change'));
    });
    const sliders = ['speedSlider', 'dispSlider', 'bloomSlider', 'rgbSlider', 'audDisp', 'audGlow', 'audScale', 'audSpeed', 'audRGB', 'audioDelaySlider', 'audioSmoothSlider'];
    sliders.forEach(id => {
        const el = document.getElementById(id);
        const min = parseFloat(el.min); const max = parseFloat(el.max);
        const val = Math.random() * (max - min) + min;
        updateSlider(id, val.toFixed(2));
    });
    updateSlider('gridSlider', Math.floor(Math.random() * 8) + 1);
});

// --- AUDIO SETUP ---
let audioContext, analyser, dataArray; let isAudioActive = false;
async function setupAudio(stream, btnElement, activeText) {
    if (isAudioActive) return; 
    try {
        if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser(); 
        analyser.fftSize = 512; 
        analyser.smoothingTimeConstant = 0.85; // Installeert basissmoothing op de input
        const source = audioContext.createMediaStreamSource(stream); source.connect(analyser);
        dataArray = new Uint8Array(analyser.frequencyBinCount); isAudioActive = true;
        document.getElementById('micBtn').style.opacity = "0.5"; document.getElementById('sysAudioBtn').style.opacity = "0.5";
        btnElement.innerText = activeText; btnElement.style.background = "linear-gradient(45deg, #00d4ff, #00ff88)"; btnElement.style.opacity = "1";
    } catch (err) {}
}
document.getElementById('sysAudioBtn').addEventListener('click', async (e) => { if (isAudioActive) return; try { const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }); setupAudio(stream, e.target, "🎵 Systeem Audio Actief"); } catch (err) {} });
document.getElementById('micBtn').addEventListener('click', async (e) => { if (isAudioActive) return; try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); setupAudio(stream, e.target, "🎙️ Microfoon Actief"); } catch (err) {} });

// --- ANIMATIE & V13 LOGICA ---
const clock = new THREE.Clock();
let timeAccumulator = 0.0;
let frames = 0; let prevTime = performance.now();  
let cineTimer = 0; let cineTarget = new THREE.Vector3();
let tempCamVec = new THREE.Vector3(); 

function animate() {
    requestAnimationFrame(animate);
    
    frames++; const timeNow = performance.now();
    if (timeNow >= prevTime + 1000) { document.getElementById('fps-counter').innerText = Math.round((frames * 1000) / (timeNow - prevTime)) + ' FPS'; frames = 0; prevTime = timeNow; }
    
    let delta = clock.getDelta();
    
    if (isAutopilot) {
        apOffsets.disp += delta * 0.5; apOffsets.bloom += delta * 0.2; apOffsets.rgb += delta * 0.1;
        updateSlider('dispSlider', (Math.sin(apOffsets.disp)*0.5 + 0.5) * 2.0); 
        updateSlider('bloomSlider', (Math.sin(apOffsets.bloom)*0.5 + 0.5) * 2.0); 
    }

    let glitchActive = false;
    if (glitchAmount > 0 && Math.random() < (glitchAmount * 0.05)) {
        glitchActive = true;
        delta *= -2.0; 
        rgbShiftPass.uniforms['amount'].value = Math.random() * 0.05; 
        camera.position.x += (Math.random() - 0.5) * glitchAmount * 2;
        camera.position.y += (Math.random() - 0.5) * glitchAmount * 2;
    }

    if (isAutoRotate && !isCinematic) { group.rotation.y += 0.005; } 
    if (particlesMesh.visible) { particlesMesh.rotation.y -= 0.0005; particlesMesh.rotation.x -= 0.0002; }

    let beatDropped = false;
    
    if (isAudioActive && analyser) {
        analyser.getByteFrequencyData(dataArray);
        
        let sumBass = 0; for(let i = 0; i < 10; i++) sumBass += dataArray[i];
        let targetBass = (sumBass / 10) / 255.0;
        
        let sumMid = 0; for(let i = 20; i < 60; i++) sumMid += dataArray[i];
        let targetMid = (sumMid / 40) / 255.0;
        
        let sumTreble = 0; for(let i = 100; i < 200; i++) sumTreble += dataArray[i];
        let targetTreble = (sumTreble / 100) / 255.0;
        
        if (targetBass - audioBass > 0.15 && timeNow - lastBeatTime > 400) {
            beatDropped = true;
            lastBeatTime = timeNow;
        }

        // V13.7: SMOOTH LERPING ipv Fast Attack
        // lerpFactor bepaalt hoe snel de visuals zich aanpassen aan de raw audio data.
        let lerpFactor = 1.0 - audioSmoothing; 
        
        audioBass += (targetBass - audioBass) * lerpFactor;
        audioMid += (targetMid - audioMid) * lerpFactor;
        audioHigh += (targetTreble - audioHigh) * lerpFactor;
        
        // UI Visualizer Update (met de vloeiende waardes!)
        document.getElementById('bar-bass').style.height = (audioBass * 100) + '%';
        document.getElementById('bar-mid').style.height = (audioMid * 100) + '%';
        document.getElementById('bar-high').style.height = (audioHigh * 100) + '%';

        histIndex = (histIndex - 1 + MAX_HISTORY) % MAX_HISTORY;
        audioHistory[histIndex].bass = audioBass;
        audioHistory[histIndex].mid = audioMid;
        audioHistory[histIndex].high = audioHigh;
        
    } else {
        histIndex = (histIndex - 1 + MAX_HISTORY) % MAX_HISTORY;
        audioHistory[histIndex].bass = 0;
        audioHistory[histIndex].mid = 0;
        audioHistory[histIndex].high = 0;
    }
    
    if (beatDropped) {
        if (isShapeShifting) {
            currentShape = geometryKeys[Math.floor(Math.random() * geometryKeys.length)];
            document.getElementById('shapeSelect').value = 'random'; 
            meshes.forEach(m => m.geometry = geometries[currentShape]);
        }
        if (document.getElementById('explosionsCheck').checked && meshes.length > 0) {
            let rMesh = meshes[Math.floor(Math.random() * meshes.length)];
            let worldPos = new THREE.Vector3(); rMesh.getWorldPosition(worldPos);
            triggerExplosion(worldPos);
        }
        if (isSwarmMode) {
            meshes.forEach(m => { 
                m.userData.velocity.x += (Math.random()-0.5)*0.5;
                m.userData.velocity.y += (Math.random()-0.5)*0.5;
                m.userData.velocity.z += (Math.random()-0.5)*0.5;
            });
        }
    }

    for(let i=0; i<expParticleCount; i++) {
        if(expLifeArray[i] > 0) {
            expPosArray[i*3] += expVelArray[i].x; expPosArray[i*3+1] += expVelArray[i].y; expPosArray[i*3+2] += expVelArray[i].z;
            expVelArray[i].multiplyScalar(0.95); 
            expLifeArray[i] -= 0.015; 
        }
    }
    expGeometry.attributes.position.needsUpdate = true;
    expGeometry.attributes.alpha.needsUpdate = true;

    let globalDelayIndex = Math.min(audioDelayFrames, MAX_HISTORY - 1);
    let globalReadIdx = (histIndex + globalDelayIndex) % MAX_HISTORY;
    let globalHist = audioHistory[globalReadIdx];
    
    let gSpeedAudio = globalHist[mapSpeed] || 0;
    let gGlowAudio = globalHist[mapGlow] || 0;
    let gRGBAudio = globalHist[mapRGB] || 0;
    
    let effSpeed = currentSpeed + (gSpeedAudio * audSpeedAmt);
    timeAccumulator += delta * effSpeed; 
    
    bloomPass.strength = baseBloom + (gGlowAudio * audGlowAmt);
    if(!glitchActive) rgbShiftPass.uniforms['amount'].value = baseRGB + (gRGBAudio * audRGBAmt);
    
    let dynZoom = targetZoom;
    
    if (isCinematic) {
        cineTimer -= delta;
        if(cineTimer <= 0) {
            cineTimer = 3.0 + Math.random() * 4.0; 
            if (meshes.length > 0) {
                let rMesh = meshes[Math.floor(Math.random() * meshes.length)];
                cineTarget.copy(rMesh.position).multiplyScalar(1.5); 
                dynZoom = 2.0 + Math.random() * 15.0; 
                if(Math.random() > 0.6) {
                    camera.position.set((Math.random()-0.5)*20, (Math.random()-0.5)*20, dynZoom);
                }
            }
        }
        tempCamVec.set(cineTarget.x * 0.5, cineTarget.y * 0.5, dynZoom);
        camera.position.lerp(tempCamVec, 0.02);
        camera.lookAt(group.position);
    } else {
        if(!glitchActive) camera.position.z += (dynZoom - camera.position.z) * 0.05;
        camera.lookAt(scene.position);
    }
    
    meshes.forEach(s => {
        let delayIndex = audioDelayFrames;
        if (isAudioRandomDelay) delayIndex = Math.floor(s.userData.randomDelayFactor * audioDelayFrames);
        delayIndex = Math.min(delayIndex, MAX_HISTORY - 1);
        let readIdx = (histIndex + delayIndex) % MAX_HISTORY;
        let hist = audioHistory[readIdx];
        
        let sDispAudio = hist[mapDisp] || 0;
        let sGlowAudio = hist[mapGlow] || 0;
        let sScaleAudio = hist[mapScale] || 0;
        let sRotAudio = hist[mapRot] || 0;
        
        s.material.uniforms.u_time.value = timeAccumulator;
        s.material.uniforms.u_displacementAmount.value = currentDisplacement;
        s.material.uniforms.u_dispAudio.value = sDispAudio * audDispAmt;
        s.material.uniforms.u_glowAudio.value = sGlowAudio * audGlowAmt;
        
        let finalScale = s.userData.baseScale * (1.0 + (sScaleAudio * audScaleAmt));
        s.scale.set(finalScale, finalScale, finalScale);
        
        let finalRotSpeed = globalRotSpeed + (sRotAudio * audRotAmt);
        
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
            s.userData.velocity.x += Math.sin(s.userData.swarmPhase + s.userData.id.charCodeAt(0)) * 0.001;
            s.userData.velocity.y += Math.cos(s.userData.swarmPhase) * 0.001;
            s.userData.velocity.x -= s.position.x * 0.0005;
            s.userData.velocity.y -= s.position.y * 0.0005;
            s.userData.velocity.z -= s.position.z * 0.0005;
            s.userData.velocity.clampLength(0, 0.1);
            s.position.add(s.userData.velocity);
        } else {
            s.position.lerp(s.userData.basePos, 0.05);
        }
    });
    
    composer.render();
}
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight); composer.setSize(window.innerWidth, window.innerHeight);
});

let dragInfo = { active: false, px: 0, py: 0 };
document.addEventListener('pointerdown', (e) => { if (e.target.closest('#controls')) return; dragInfo.active = true; dragInfo.px = e.clientX; dragInfo.py = e.clientY; });
document.addEventListener('pointermove', (e) => {
    if (dragInfo.active && !isCinematic) { group.rotation.y += (e.clientX - dragInfo.px) * 0.01; group.rotation.x += (e.clientY - dragInfo.py) * 0.01; dragInfo.px = e.clientX; dragInfo.py = e.clientY; }
});
document.addEventListener('pointerup', () => dragInfo.active = false); document.addEventListener('pointerleave', () => dragInfo.active = false);
