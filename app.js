// Importar Three.js
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Variables globales
let scene, camera, renderer, gl;
let arButton, statusText, instructionsDiv;
let xrSession = null;
let xrRefSpace = null;
let model = null;
let modelPlaced = false;
let reticle = null;
let hitTestSource = null;
let hitTestSourceRequested = false;

// Inicializar la aplicación
function init() {
    arButton = document.getElementById('ar-button');
    statusText = document.getElementById('status');
    instructionsDiv = document.getElementById('instructions');

    // Verificar compatibilidad con WebXR
    if (navigator.xr) {
        navigator.xr.isSessionSupported('immersive-ar').then((supported) => {
            if (supported) {
                statusText.textContent = '✓ Dispositivo compatible con AR';
                arButton.disabled = false;
                arButton.addEventListener('click', onARButtonClick);
            } else {
                statusText.textContent = '✗ AR no soportado en este dispositivo';
            }
        });
    } else {
        statusText.textContent = '✗ WebXR no disponible';
    }

    // Configurar Three.js
    setupThreeJS();
}

// Configurar Three.js
function setupThreeJS() {
    // Crear escena
    scene = new THREE.Scene();

    // Crear cámara
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

    // Crear renderer
    renderer = new THREE.WebGLRenderer({ 
        antialias: true, 
        alpha: true 
    });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    document.body.appendChild(renderer.domElement);

    // Añadir luz ambiental
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);
    // Añadir luz direccional
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
    directionalLight.position.set(0, 5, 5);
    scene.add(directionalLight);

    // Crear retículo para indicar donde se colocará el modelo
    createReticle();

    // Cargar el modelo GLTF
    loadGLTFModel();

    // Manejar redimensionamiento
    window.addEventListener('resize', onWindowResize);
}

// Cargar un modelo GLTF
// Crear retículo para indicar donde se colocará el modelo
function createReticle() {
    const geometry = new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({ 
        color: 0x00ff00,
        side: THREE.DoubleSide
    });
    reticle = new THREE.Mesh(geometry, material);
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);
}

// Crear avatar (modelo 3D simple)
function createAvatar() {
    // Crear un avatar simple con geometrías básicas
    const avatarGroup = new THREE.Group();

    // Cuerpo
    const bodyGeometry = new THREE.CylinderGeometry(0.3, 0.3, 0.8, 32);
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x4a90e2 });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0.4;
    avatarGroup.add(body);

    // Cabeza
    const headGeometry = new THREE.SphereGeometry(0.25, 32, 32);
    const headMaterial = new THREE.MeshStandardMaterial({ color: 0xffdbac });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 1.05;
    avatarGroup.add(head);

    // Brazos
    const armGeometry = new THREE.CylinderGeometry(0.1, 0.1, 0.6, 16);
    const armMaterial = new THREE.MeshStandardMaterial({ color: 0x4a90e2 });
    
    const leftArm = new THREE.Mesh(armGeometry, armMaterial);
    leftArm.position.set(-0.4, 0.4, 0);
    leftArm.rotation.z = Math.PI / 6;
    avatarGroup.add(leftArm);

    const rightArm = new THREE.Mesh(armGeometry, armMaterial);
    rightArm.position.set(0.4, 0.4, 0);
    rightArm.rotation.z = -Math.PI / 6;
    avatarGroup.add(rightArm);

    // Piernas
    const legGeometry = new THREE.CylinderGeometry(0.12, 0.12, 0.6, 16);
    const legMaterial = new THREE.MeshStandardMaterial({ color: 0x2c3e50 });
    
    const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
    leftLeg.position.set(-0.15, -0.3, 0);
    avatarGroup.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
    rightLeg.position.set(0.15, -0.3, 0);
    avatarGroup.add(rightLeg);

    // Escalar el avatar
    avatarGroup.scale.set(0.5, 0.5, 0.5);
    avatarGroup.visible = false;
    
    model = avatarGroup;
    scene.add(model);
    
    console.log('Avatar creado y añadido a la escena:', model);
}

// Cargar modelo GLTF
function loadGLTFModel() {
    const loader = new GLTFLoader();
    console.log('Iniciando carga del modelo avatar_prueba.glb...');
    
    loader.load(
        'avatar_prueba.glb',
        (gltf) => {
            model = gltf.scene;
            model.scale.set(1, 1, 1); // Tamaño normal del modelo
            model.visible = false;
            scene.add(model);
            console.log('Modelo cargado exitosamente:', model);
            console.log('Tamaño inicial:', model.scale);
        },
        (xhr) => {
            const percent = (xhr.loaded / xhr.total * 100).toFixed(2);
            console.log(`Cargando modelo: ${percent}%`);
        },
        (error) => {
            console.error('Error cargando modelo:', error);
            // Crear avatar simple como fallback
            console.log('Creando avatar simple como fallback...');
            createAvatar();
        }
    );
}

// Manejar click en botón AR
async function onARButtonClick() {
    if (xrSession === null) {
        // Iniciar sesión AR
        const sessionInit = {
            requiredFeatures: ['hit-test'],
            optionalFeatures: ['dom-overlay'],
            domOverlay: { root: document.getElementById('container') }
        };

        try {
            xrSession = await navigator.xr.requestSession('immersive-ar', sessionInit);
            onSessionStarted();
        } catch (error) {
            console.error('Error iniciando sesión AR:', error);
            statusText.textContent = 'Error: ' + error.message;
        }
    } else {
        // Terminar sesión AR
        xrSession.end();
    }
}

// Cuando la sesión AR inicia
function onSessionStarted() {
    xrSession.addEventListener('end', onSessionEnded);
    xrSession.addEventListener('select', onSelect);

    renderer.xr.setReferenceSpaceType('local');
    renderer.xr.setSession(xrSession);

    arButton.textContent = 'Detener AR';
    instructionsDiv.style.display = 'block';

    // Obtener espacio de referencia
    xrSession.requestReferenceSpace('viewer').then((refSpace) => {
        xrSession.requestHitTestSource({ space: refSpace }).then((source) => {
            hitTestSource = source;
        });
    });

    xrSession.requestReferenceSpace('local').then((refSpace) => {
        xrRefSpace = refSpace;
        renderer.xr.setReferenceSpaceType('local');
        
        // Iniciar loop de renderizado
        renderer.setAnimationLoop(render);
    });
}

// Cuando la sesión AR termina
function onSessionEnded() {
    xrSession.removeEventListener('end', onSessionEnded);
    xrSession.removeEventListener('select', onSelect);

    if (hitTestSource) {
        hitTestSource.cancel();
        hitTestSource = null;
    }

    xrSession = null;
    arButton.textContent = 'Iniciar AR';
    instructionsDiv.style.display = 'none';
    
    // Ocultar modelo y retículo
    if (model) model.visible = false;
    if (reticle) reticle.visible = false;
    modelPlaced = false;

    renderer.setAnimationLoop(null);
}

// Cuando el usuario toca la pantalla en AR
function onSelect() {
    console.log('onSelect llamado - reticle.visible:', reticle.visible, 'modelPlaced:', modelPlaced, 'model:', model);
    
    if (!model) {
        console.warn('Modelo aún no cargado, espera un momento...');
        return;
    }
    
    if (reticle.visible && !modelPlaced) {
        // CLAVE: Copiar la matriz completa del retículo al modelo
        model.matrix.copy(reticle.matrix);
        
        // Descomponer la matriz en position, quaternion y scale
        model.matrix.decompose(model.position, model.quaternion, model.scale);
        
        // IMPORTANTE: Desactivar matrixAutoUpdate para mantener el modelo fijo
        model.matrixAutoUpdate = false;
        model.updateMatrix();
        
        model.visible = true;
        modelPlaced = true;
        
        console.log('📌 Modelo fijado en AR en posición:', model.position);
        console.log('Modelo visible:', model.visible);
        console.log('Escala del modelo:', model.scale);
        
        // Ocultar retículo después de colocar el modelo
        reticle.visible = false;
        instructionsDiv.style.display = 'none';
    }
}

// Loop de renderizado
function render(timestamp, frame) {
    if (frame) {
        // Si el modelo ya está colocado, solo ocultar el retículo
        if (modelPlaced) {
            reticle.visible = false;
        } else {
            // Obtener resultados de hit test solo si el modelo no está colocado
            if (hitTestSource) {
                const hitTestResults = frame.getHitTestResults(hitTestSource);

                if (hitTestResults.length > 0) {
                    const hit = hitTestResults[0];
                    const pose = hit.getPose(xrRefSpace);

                    // Actualizar posición del retículo
                    reticle.visible = true;
                    reticle.matrix.fromArray(pose.transform.matrix);
                } else {
                    reticle.visible = false;
                }
            }
        }
    }

    // Siempre renderizar la escena
    renderer.render(scene, camera);
}

// Manejar redimensionamiento de ventana
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Iniciar cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
