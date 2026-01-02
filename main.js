// Global variables
let scene, camera, renderer, coin, coinBody;
let world, groundBody, walls = [];
let controls = {
    mouseX: 0,
    mouseY: 0,
    targetRotationX: 0,
    targetRotationY: 0,
    isMouseDown: false,
    zoom: 1
};

// Settings
let settings = {
    gravity: 9.82,
    density: 1,
    restitution: 0.6,
    groundCurvature: 10,
    boxSize: 5,
    damping: 0.1
};

// Animation variables
let animationId;
let lastTime = 0;

// Initialize the simulation
function init() {
    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xfafafa);
    
    // Setup camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 2, 6);
    
    // Setup renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    document.getElementById('container').appendChild(renderer.domElement);
    
    // Setup lighting
    setupLighting();
    
    // Initialize physics world
    initPhysics();
    
    // Create environment
    createEnvironment();
    
    // Create coin
    createCoin();
    
    // Setup controls
    setupControls();
    
    // Setup settings panel
    setupSettingsPanel();
    
    // Start animation loop
    animate();
}



function setupLighting() {
    // Ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);
    
    // Directional light (ceiling)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.7);
    directionalLight.position.set(0, 10, 0);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.1;
    directionalLight.shadow.camera.far = 20;
    directionalLight.shadow.camera.left = -10;
    directionalLight.shadow.camera.right = 10;
    directionalLight.shadow.camera.top = 10;
    directionalLight.shadow.camera.bottom = -10;
    scene.add(directionalLight);
    
    // Point light for better illumination
    const pointLight = new THREE.PointLight(0xffffff, 0.3, 20);
    pointLight.position.set(3, 5, 3);
    scene.add(pointLight);

    // hemisphere light!
    const hemi = new THREE.HemisphereLight(0xffffff,0x444444,0.7);
    scene.add(hemi);
}

function initPhysics() {
    // Create physics world
    world = new CANNON.World();
    world.gravity.set(0, -settings.gravity, 0);
    world.broadphase = new CANNON.NaiveBroadphase();
    world.solver.iterations = 10;
}

function createEnvironment() {
    /* ----- clear old stuff (keep exactly as you had it) ----- */
    walls.forEach(w => { scene.remove(w.mesh); world.remove(w.body); });
    walls = [];
    if (groundBody) { scene.remove(groundBody.mesh); world.remove(groundBody); }

    const size = settings.boxSize;
    const wallThick = 0.5; // 4× thicker than before (was 0.05)

    /* ---------- ground (unchanged) ---------- */
    const groundGeometry = new THREE.PlaneGeometry(size * 2, size * 2, 32, 32);
    const verts = groundGeometry.attributes.position.array;
    const radius = settings.groundCurvature * 0.04;
    for (let i = 0; i < verts.length; i += 3) {
        const x = verts[i], z = verts[i + 2];
        verts[i + 1] = (x * x + z * z) / (2 * radius);
    }
    groundGeometry.attributes.position.needsUpdate = true;
    groundGeometry.computeVertexNormals();

    const groundMat = new THREE.MeshStandardMaterial({
        color: 0xf0f0f0, transparent: true, opacity: 0.1,
        roughness: 0.8, metalness: 0.1
    });
    const groundMesh = new THREE.Mesh(groundGeometry, groundMat);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);

    const groundShape = new CANNON.Box(new CANNON.Vec3(size, 0.1, size));
    groundBody = new CANNON.Body({ mass: 0 });
    groundBody.addShape(groundShape);
    groundBody.position.set(0, -size / 2 - 0.1, 0);
    world.add(groundBody);
    groundBody.mesh = groundMesh;

    /* ---------- walls ---------- */
    const wallMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff, transparent: true, opacity: 0.1,
        side: THREE.DoubleSide, roughness: 0.1, metalness: 0
    });

    /* helper: make one wall ----------------------------*/
    function makeWall(wx, wy, wz, px, py, pz, rotX = 0, rotY = 0, rotZ = 0) {
        const geometry = new THREE.BoxGeometry(wx, wy, wz);
        const mesh = new THREE.Mesh(geometry, wallMaterial.clone());
        mesh.position.set(px, py, pz);
        mesh.rotation.set(rotX, rotY, rotZ);
        scene.add(mesh);

        const shape = new CANNON.Box(new CANNON.Vec3(wx / 2, wy / 2, wz / 2));
        const body = new CANNON.Body({ mass: 0 });
        body.addShape(shape);
        body.position.set(px, py, pz);
        world.add(body);
        walls.push({ mesh: mesh, body: body });
    }

    /* ---- outward-shifted cube walls (inside faces exactly 'size' apart) ---- */
    const hSize = size / 2; // half the internal size
    const T = wallThick;

    // floor & ceiling (Y-shifted)
    makeWall(size, T, size, 0, -hSize - T / 2, 0);
    makeWall(size, T, size, 0, hSize + T / 2, 0);

    // front & back (Z-shifted)
    makeWall(size, size + 2 * T, T, 0, 0, -hSize - T / 2);
    makeWall(size, size + 2 * T, T, 0, 0, hSize + T / 2);

    // left & right (X-shifted)
    makeWall(T, size + 2 * T, size + 2 * T, -hSize - T / 2, 0, 0);
    makeWall(T, size + 2 * T, size + 2 * T, hSize + T / 2, 0, 0);

    /* ---------- subtle grid (unchanged) ---------- */
    const grid = new THREE.GridHelper(20, 40, 0xcccccc, 0xcccccc);
    grid.material.opacity = 0.1;
    grid.material.transparent = true;
    scene.add(grid);
}

function createCoin() {
    // Remove existing coin
    if (coin) {
        scene.remove(coin);
        world.remove(coinBody);
    }
    
    // Create coin geometry (thin cylinder)
    const coinRadius = 0.5;
    const coinHeight = 0.08;
    const coinGeometry = new THREE.CylinderGeometry(coinRadius, coinRadius, coinHeight, 32);
    coinGeometry.rotateX(Math.PI / 2);   // ← add this

    
    // Create canvas for coin textures
    function createCoinTexture(text, isHeads) {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        
        // Background
        ctx.fillStyle = isHeads ? '#FFD700' : '#FFA500';
        ctx.fillRect(0, 0, 512, 512);
        
        // Add subtle gradient
        const gradient = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
        gradient.addColorStop(0, isHeads ? '#FFED4E' : '#FFB347');
        gradient.addColorStop(1, isHeads ? '#DAA520' : '#CC8400');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 512, 512);
        
        // Draw letter
        ctx.fillStyle = '#8B6914';
        ctx.font = 'bold 280px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 256, 256);
        
        // Add relief effect with shadow
        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        ctx.shadowBlur = 2;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
        ctx.fillStyle = '#B8860B';
        ctx.fillText(text, 258, 258);
        
        return new THREE.CanvasTexture(canvas);
    }
    
    // Create materials for both sides
    const headsTexture = createCoinTexture('H', true);
    const tailsTexture = createCoinTexture('T', false);
    
    // Create PBR material for realistic metallic appearance
    const coinMaterial = new THREE.MeshStandardMaterial({
        color: 0xFFD700,
        metalness: 0.9,
        roughness: 0.2,
        map: headsTexture,
        normalScale: new THREE.Vector2(0.1, 0.1),
        envMapIntensity: 1.0
    });
    
    // Create coin mesh
    coin = new THREE.Mesh(coinGeometry, coinMaterial);
    coin.castShadow = true;
    coin.receiveShadow = true;
    coin.position.set(0, 2, 0);
    scene.add(coin);
    
    // Create physics body
    const coinShape = new CANNON.Cylinder(coinRadius, coinRadius, coinHeight, 8);
    
    coinBody = new CANNON.Body({
        mass: settings.density * 0.1,
        shape: coinShape,
        linearDamping: settings.damping,
        angularDamping: 0.1
    });
    coinBody.position.set(0, 2, 0);
    coinBody.material = new CANNON.Material({
        restitution: settings.restitution,
        friction: 0.3
    });
    world.add(coinBody);
    
    // Store textures for switching
    coin.userData = {
        headsTexture,
        tailsTexture,
        isHeads: true
    };
}

function setupControls() {
    // Mouse controls
    renderer.domElement.addEventListener('mousedown', onMouseDown);
    renderer.domElement.addEventListener('mousemove', onMouseMove);
    renderer.domElement.addEventListener('mouseup', onMouseUp);
    renderer.domElement.addEventListener('wheel', onWheel);
    
    // Touch controls
    renderer.domElement.addEventListener('touchstart', onTouchStart);
    renderer.domElement.addEventListener('touchmove', onTouchMove);
    renderer.domElement.addEventListener('touchend', onTouchEnd);
    
    // Keyboard controls
    document.addEventListener('keydown', onKeyDown);
    
    // Window resize
    window.addEventListener('resize', onWindowResize);
}

function onMouseDown(event) {
    if (event.button === 0) { // Left click
        controls.isMouseDown = true;
        controls.lastMouseX = event.clientX;
        controls.lastMouseY = event.clientY;
        document.body.classList.add('grabbing');
    }
}

function onMouseMove(event) {
    if (controls.isMouseDown) {
        const deltaX = event.clientX - controls.lastMouseX;
        const deltaY = event.clientY - controls.lastMouseY;
        
        controls.targetRotationY += deltaX * 0.01;
        controls.targetRotationX += deltaY * 0.01;
        
        // Clamp vertical rotation
        controls.targetRotationX = Math.max(-Math.PI/2, Math.min(Math.PI/2, controls.targetRotationX));
        
        controls.lastMouseX = event.clientX;
        controls.lastMouseY = event.clientY;
    }
}

function onMouseUp() {
    controls.isMouseDown = false;
    document.body.classList.remove('grabbing');
}

function onWheel(event) {
    controls.zoom += event.deltaY * 0.001;
    controls.zoom = Math.max(0.5, Math.min(3, controls.zoom));
}

function onTouchStart(event) {
    if (event.touches.length === 1) {
        controls.isMouseDown = true;
        controls.lastMouseX = event.touches[0].clientX;
        controls.lastMouseY = event.touches[0].clientY;
    }
}

function onTouchMove(event) {
    if (event.touches.length === 1 && controls.isMouseDown) {
        const deltaX = event.touches[0].clientX - controls.lastMouseX;
        const deltaY = event.touches[0].clientY - controls.lastMouseY;
        
        controls.targetRotationY += deltaX * 0.01;
        controls.targetRotationX += deltaY * 0.01;
        
        controls.targetRotationX = Math.max(-Math.PI/2, Math.min(Math.PI/2, controls.targetRotationX));
        
        controls.lastMouseX = event.touches[0].clientX;
        controls.lastMouseY = event.touches[0].clientY;
    }
}

function onTouchEnd() {
    controls.isMouseDown = false;
}

function onKeyDown(event) {
    const rotationSpeed = 0.05;
    
    switch(event.code) {
        case 'Space':
            event.preventDefault();
            flipCoin();
            break;
        case 'ArrowLeft':
            controls.targetRotationY -= rotationSpeed;
            break;
        case 'ArrowRight':
            controls.targetRotationY += rotationSpeed;
            break;
        case 'ArrowUp':
            controls.targetRotationX -= rotationSpeed;
            break;
        case 'ArrowDown':
            controls.targetRotationX += rotationSpeed;
            break;
    }
}

function flipCoin() {
    if (!coinBody) return;

    const maxH = settings.boxSize * 0.6; // never exceed ~60 % of box height
    const upImpulse = THREE.MathUtils.randFloat(4, 7); // was 10-25
    const horizImpulse = THREE.MathUtils.randFloatSpread(4); // ±2

    coinBody.velocity.set(horizImpulse, 0, horizImpulse); // zero old vel
    coinBody.applyImpulse(
        new CANNON.Vec3(horizImpulse, upImpulse, 0),
        coinBody.position
    );

    // angular spin (same as before, just capped)
    const ang = 20;
    coinBody.angularVelocity.set(
        THREE.MathUtils.randFloatSpread(ang),
        THREE.MathUtils.randFloatSpread(ang),
        THREE.MathUtils.randFloatSpread(ang)
    );
}

function setupSettingsPanel() {
    const toggle = document.getElementById('settings-toggle');
    const panel = document.getElementById('settings-panel');
    
    toggle.addEventListener('click', () => {
        panel.classList.toggle('visible');
        toggle.classList.toggle('active');
    });
    
    // Close panel when clicking outside
    document.addEventListener('click', (event) => {
        if (!panel.contains(event.target) && !toggle.contains(event.target)) {
            panel.classList.remove('visible');
            toggle.classList.remove('active');
        }
    });
    
    // Setup sliders
    const sliders = {
        gravity: { element: 'gravity', value: 'gravity-value', callback: (value) => {
            settings.gravity = value;
            world.gravity.set(0, -value, 0);
        }},
        density: { element: 'density', value: 'density-value', callback: (value) => {
            settings.density = value;
            if (coinBody) {
                coinBody.mass = value * 0.1;
                coinBody.updateMassProperties();
            }
        }},
        restitution: { element: 'restitution', value: 'restitution-value', callback: (value) => {
            settings.restitution = value;
            if (coinBody && coinBody.material) {
                coinBody.material.restitution = value;
            }
        }},
        'ground-curvature': { element: 'ground-curvature', value: 'curvature-value', callback: (value) => {
            settings.groundCurvature = value;
            createEnvironment();
        }},
        'box-size': { element: 'box-size', value: 'box-size-value', callback: (value) => {
            settings.boxSize = value;
            createEnvironment();
        }},
        damping: { element: 'damping', value: 'damping-value', callback: (value) => {
            settings.damping = value;
            if (coinBody) {
                coinBody.linearDamping = value;
            }
        }}
    };
    
    Object.keys(sliders).forEach(key => {
        const slider = sliders[key];
        const element = document.getElementById(slider.element);
        const valueElement = document.getElementById(slider.value);
        
        element.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            valueElement.textContent = value;
            slider.callback(value);
        });
    });
}

function updateCoinOrientation() {
    if (!coin || !coinBody) return;
    
    // Update coin mesh position and rotation from physics body
    coin.position.copy(coinBody.position);
    coin.quaternion.copy(coinBody.quaternion);
    
    // Determine which side is facing up
    const upVector = new THREE.Vector3(0, 1, 0);
    const coinUp = new THREE.Vector3(0, 1, 0).applyQuaternion(coin.quaternion);
    const dotProduct = upVector.dot(coinUp);
    
    // Switch texture based on orientation
    if (dotProduct > 0.7) {
        // Heads facing up
        if (!coin.userData.isHeads) {
            coin.material.map = coin.userData.headsTexture;
            coin.material.needsUpdate = true;
            coin.userData.isHeads = true;
        }
    } else if (dotProduct < -0.7) {
        // Tails facing up
        if (coin.userData.isHeads) {
            coin.material.map = coin.userData.tailsTexture;
            coin.material.needsUpdate = true;
            coin.userData.isHeads = false;
        }
    }
}

function updateCamera() {
    // Smooth camera rotation
    const targetX = Math.sin(controls.targetRotationY) * Math.cos(controls.targetRotationX) * 8 * controls.zoom;
    const targetY = Math.sin(controls.targetRotationX) * 8 * controls.zoom + 2;
    const targetZ = Math.cos(controls.targetRotationY) * Math.cos(controls.targetRotationX) * 8 * controls.zoom;
    
    camera.position.lerp(new THREE.Vector3(targetX, targetY, targetZ), 0.1);
    camera.lookAt(0, 0, 0);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate(currentTime) {
    animationId = requestAnimationFrame(animate);
    
    const deltaTime = (currentTime - lastTime) / 1000;
    lastTime = currentTime;
    
    if (deltaTime > 0 && deltaTime < 0.1) {
        // Step physics
        world.step(deltaTime);
        
        // Update coin
        updateCoinOrientation();
    }
    
    // Update camera
    updateCamera();
    
    // Render
    renderer.render(scene, camera);
}

// Initialize when page loads
window.addEventListener('load', init);

// Cleanup
window.addEventListener('beforeunload', () => {
    if (animationId) {
        cancelAnimationFrame(animationId);
    }
});
