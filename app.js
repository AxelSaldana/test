// Importar Three.js
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

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
const CONFIG = {
    MODEL: {
        PATH: 'models/avatar_prueba.glb', // ← Archivo en la raíz
        SCALE: 1,
        AUTO_ROTATE: false,
        ROTATE_SPEED: 0.005,
        ANIMATION_SPEED: 3, // velocidad 20% más rápida
        ANIMATIONS: {
            IDLE: 'Animation',
            TALKING: 'animation',
            THINKING: 'animation',
            LISTENING: 'animation'
        }
    },
    GEMINI: {
        API_KEY: 'AIzaSyCo0VMAPnglts8T0e1Ap8x7MbtdhgsFrq4',
        MODEL: 'gemini-2.0-flash-001',
        MAX_TOKENS: 2000,
        TEMPERATURE: 0.9
    },
    SPEECH: {
        LANGUAGE: 'es-ES',
        VOICE_RATE: 1.0,
        VOICE_PITCH: 1.0,
        VOICE_VOLUME: 1.0,
        RECOGNITION_TIMEOUT: 15000
    },
    AR: {
        // WebXR puro, sin fallback a cámara HTML
        FORCE_FALLBACK: false,
        DISABLE_FALLBACK: true // Desactivar completamente el sistema de fallback
    }
};
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
// Crear retículo GRANDE y VISIBLE para indicar donde se colocará el modelo
function createReticle() {
    // Retículo MÁS GRANDE y con color azul brillante
    const geometry = new THREE.RingGeometry(0.25, 0.35, 32).rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({
        color: 0x00BFFF, // Azul brillante
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 1.0
    });
    reticle = new THREE.Mesh(geometry, material);
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);
    console.log('🎯 Retículo azul GRANDE creado (0.25-0.35m)');
}



// Cargar modelo GLTF
function loadGLTFModel() {
    const loader = new GLTFLoader();
    
    // Configurar DRACO para modelos comprimidos
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
    loader.setDRACOLoader(dracoLoader);
    
    console.log('Iniciando carga del modelo avatar_prueba.glb...');

    loader.load(
        CONFIG.MODEL.PATH,
        (gltf) => {
            model = gltf.scene;
            model.scale.set(CONFIG.MODEL.SCALE, CONFIG.MODEL.SCALE, CONFIG.MODEL.SCALE); // Tamaño normal del modelo
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

// Cuando el usuario toca la pantalla en AR - MEJORADO
function onSelect() {
    console.log('onSelect llamado - reticle.visible:', reticle.visible, 'modelPlaced:', modelPlaced, 'model:', model);

    if (!model) {
        console.warn('⚠️ Modelo aún no cargado, espera un momento...');
        return;
    }

    if (!modelPlaced) {
        if (reticle.visible) {
            // OPCIÓN 1: Copiar posición del retículo (con o sin superficie detectada)
            model.matrix.copy(reticle.matrix);
            model.matrix.decompose(model.position, model.quaternion, model.scale);
            console.log('📌 Modelo colocado usando retículo');
        } else if (lastCameraPosition && lastCameraDirection) {
            // OPCIÓN 2: Colocar al frente si no hay retículo
            console.log('💡 Sin retículo - Colocando modelo al frente AL RAS DEL PISO');
            const fallbackPos = lastCameraPosition.clone().add(
                lastCameraDirection.clone().multiplyScalar(1.2)
            );
            // IMPORTANTE: Poner AL RAS DEL PISO (Y = 0)
            fallbackPos.y = 0;

            model.position.copy(fallbackPos);
            model.lookAt(lastCameraPosition);
            model.rotateY(Math.PI); // Girar para que mire hacia ti
        }

        // IMPORTANTE: Desactivar matrixAutoUpdate para mantener el modelo fijo
        model.matrixAutoUpdate = false;
        model.updateMatrix();
        model.visible = true;
        modelPlaced = true;

        console.log('✅ Modelo fijado en AR en posición:', model.position);
        console.log('👍 ¡Listo! El avatar está en el espacio');

        // Ocultar retículo e instrucciones
        reticle.visible = false;
        instructionsDiv.style.display = 'none';
    }
}

// Variables para mejorar detección
let lastCameraPosition = null;
let lastCameraDirection = null;

// Loop de renderizado MEJORADO
function render(timestamp, frame) {
    if (frame) {
        // Guardar posición de cámara para colocación sin superficie
        const pose = frame.getViewerPose(xrRefSpace);
        if (pose && pose.views && pose.views[0]) {
            const viewMatrix = new THREE.Matrix4().fromArray(pose.views[0].transform.matrix);
            lastCameraPosition = new THREE.Vector3().setFromMatrixPosition(viewMatrix);
            lastCameraDirection = new THREE.Vector3(0, 0, -1).applyMatrix4(
                new THREE.Matrix4().extractRotation(viewMatrix)
            );
        }

        // Si el modelo ya está colocado, solo ocultar el retículo
        if (modelPlaced) {
            reticle.visible = false;
        } else {
            // Obtener resultados de hit test
            if (hitTestSource) {
                const hitTestResults = frame.getHitTestResults(hitTestSource);

                if (hitTestResults.length > 0) {
                    const hit = hitTestResults[0];
                    const hitPose = hit.getPose(xrRefSpace);

                    // Actualizar posición del retículo
                    reticle.visible = true;
                    reticle.matrix.fromArray(hitPose.transform.matrix);
                } else {
                    // MEJORADO: Mostrar retículo AL RAS DEL PISO si no hay detección
                    if (lastCameraPosition && lastCameraDirection) {
                        const fallbackPos = lastCameraPosition.clone().add(
                            lastCameraDirection.clone().multiplyScalar(1.5)
                        );
                        // IMPORTANTE: Poner al ras del piso (Y = 0)
                        fallbackPos.y = 0;

                        reticle.position.copy(fallbackPos);
                        reticle.rotation.x = -Math.PI / 2;
                        reticle.visible = true;
                        reticle.updateMatrix();
                    }
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
