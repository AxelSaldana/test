/**
 * Asistente Virtual AR - WebXR Puro (Sin Fallback)
 * Modelo: models/avatar_prueba.glb
 */
// Importar Three.js
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

// ===== CONFIGURACIÓN SIMPLE =====
const CONFIG = {
    MODEL: {
        PATH: 'models/avatar_prueba.glb', // ← Archivo en carpeta models/
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

// ===== GEMINI CLIENT =====
class GeminiClient {
    constructor() {
        this.apiKey = CONFIG.GEMINI.API_KEY;
        this.model = CONFIG.GEMINI.MODEL;
        this.baseURL = 'https://generativelanguage.googleapis.com/v1beta/models';
        this.isInitialized = false;
        this.conversationHistory = [];
    }

    async init() {
        try {
            console.log('🤖 CONECTANDO GEMINI 2.0...');

            const testResult = await this.testConnection();
            if (testResult) {
                this.isInitialized = true;
                console.log('✅ GEMINI 2.0 CONECTADO!');
                return true;
            } else {
                throw new Error('No se pudo conectar con Gemini 2.0');
            }

        } catch (error) {
            console.error('❌ ERROR GEMINI 2.0:', error);
            throw new Error('Gemini 2.0 no disponible: ' + error.message);
        }
    }

    async testConnection() {
        try {
            const response = await this.sendDirectToGemini("Test");
            return response.length > 0;
        } catch (error) {
            return false;
        }
    }

    async sendDirectToGemini(message) {
        const url = `${this.baseURL}/${this.model}:generateContent?key=${this.apiKey}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: message }] }],
                generationConfig: {
                    temperature: CONFIG.GEMINI.TEMPERATURE,
                    maxOutputTokens: CONFIG.GEMINI.MAX_TOKENS
                }
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Error ${response.status}: ${errorText}`);
        }

        const data = await response.json();

        if (data.candidates && data.candidates.length > 0) {
            const content = data.candidates[0].content;
            if (content && content.parts && content.parts.length > 0) {
                return content.parts[0].text.trim();
            }
        }

        throw new Error('Respuesta inválida');
    }

    async sendMessage(message) {
        if (!this.isInitialized) {
            throw new Error('Gemini 2.0 no conectado');
        }

        try {
            const prompt = `Eres Avatar, un asistente virtual inteligente con IA Gemini 2.0.
Respondes en español de forma natural y conversacional.
Eres amigable, útil y entusiasta.

Usuario: ${message}
Avatar:`;

            const response = await this.sendDirectToGemini(prompt);

            this.addToHistory('user', message);
            this.addToHistory('assistant', response);

            return response;

        } catch (error) {
            throw error;
        }
    }

    addToHistory(role, content) {
        this.conversationHistory.push({ role, content, timestamp: Date.now() });
        if (this.conversationHistory.length > 10) {
            this.conversationHistory = this.conversationHistory.slice(-10);
        }
    }

    async getWelcomeMessage() {
        try {
            return await this.sendDirectToGemini('Saluda al usuario como Avatar, un asistente virtual con IA Gemini 2.0. Sé amigable y entusiasta, máximo 2 frases.');
        } catch (error) {
            throw new Error('No se pudo obtener mensaje de bienvenida');
        }
    }

    async getARWelcomeMessage() {
        try {
            return await this.sendDirectToGemini('El usuario activó el modo AR. Salúdalo con entusiasmo sobre la experiencia AR con Gemini 2.0. Máximo 2 frases.');
        } catch (error) {
            throw new Error('No se pudo obtener mensaje AR');
        }
    }
}

// ===== SPEECH MANAGER =====
class SpeechManager {
    constructor() {
        this.recognition = null;
        this.synthesis = (typeof window !== 'undefined' && 'speechSynthesis' in window) ? window.speechSynthesis : null;
        this.isListening = false;
        this.isSpeaking = false;
        this.currentUtterance = null;
        this.voices = [];
        this.selectedVoice = null;
        this.isInitialized = false;
        this.unsupportedReason = '';
        this.lastError = '';
    }

    async init() {
        try {
            if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
                this.unsupportedReason = 'Este navegador no soporta reconocimiento de voz. Usa Chrome/Edge en escritorio o HTTPS en móvil.';
                return false;
            }

            // Solicitar permiso de micrófono explícito en móvil (algunos navegadores lo requieren antes)
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                stream.getTracks().forEach(track => track.stop());
            } catch (e) {
                // Si falla, continuamos: SpeechRecognition podría aún pedir permiso al iniciar
                console.warn('🎤 Permiso de micrófono (getUserMedia) falló o fue denegado inicialmente:', e?.name || e);
            }

            this.setupSpeechRecognition();
            if (typeof this.setupSpeechSynthesis === 'function') {
                await this.setupSpeechSynthesis();
            } else {
                console.warn('setupSpeechSynthesis no disponible; continuo sin TTS');
            }

            this.isInitialized = true;
            return true;
        } catch (error) {
            this.unsupportedReason = 'No se pudo inicializar la voz: ' + (error?.message || 'desconocido');
            return false;
        }
    }

    setupSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = new SpeechRecognition();

        this.recognition.continuous = false;
        this.recognition.interimResults = false;
        this.recognition.lang = CONFIG.SPEECH.LANGUAGE;
        this.recognition.maxAlternatives = 1;

        this.recognition.onstart = () => { this.isListening = true; };
        this.recognition.onend = () => { this.isListening = false; };
        this.recognition.onerror = (e) => {
            this.isListening = false;
            this.lastError = e && e.error ? e.error : 'unknown_error';
            console.warn('🎤 SpeechRecognition error:', this.lastError);
        };
    }

    async listen() {
        if (this.isListening) return null;

        return new Promise((resolve) => {
            // detener cualquier síntesis en curso
            this.stopSpeaking();

            // Crear una nueva instancia para cada intento (algunos navegadores fallan en reusar)
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SpeechRecognition) return resolve(null);
            const rec = new SpeechRecognition();
            this.recognition = rec;

            rec.continuous = false;
            rec.interimResults = false;
            rec.lang = CONFIG.SPEECH.LANGUAGE;
            rec.maxAlternatives = 1;

            this.isListening = true;

            let settled = false;
            const finish = (val) => {
                if (settled) return;
                settled = true;
                try { rec.stop(); } catch (_) { }
                this.isListening = false;
                resolve(val);
            };

            const timeoutMs = Math.max(5000, (CONFIG.SPEECH.RECOGNITION_TIMEOUT || 8000), 12000);
            const timer = setTimeout(() => finish(null), timeoutMs);

            // Diagnóstico útil
            rec.onaudiostart = () => console.log('🎤 onaudiostart');
            rec.onsoundstart = () => console.log('🎤 onsoundstart');
            rec.onspeechstart = () => console.log('🎤 onspeechstart');
            rec.onsoundend = () => console.log('🎤 onsoundend');
            rec.onnomatch = () => console.warn('🎤 onnomatch');

            rec.onresult = (event) => {
                clearTimeout(timer);
                let text = null;
                try {
                    if (event.results && event.results.length > 0) {
                        text = (event.results[0][0]?.transcript || '').trim();
                    }
                } catch (_) { }
                finish(text && text.length > 0 ? text : null);
            };

            rec.onerror = (e) => {
                clearTimeout(timer);
                console.warn('🎤 recognition.onerror:', e?.error || e);
                finish(null);
            };

            rec.onend = () => {
                clearTimeout(timer);
                finish(null);
            };

            try {
                rec.start();
            } catch (err) {
                console.warn('🎤 start error:', err?.message || err);
                clearTimeout(timer);
                finish(null);
            }
        });
    }

    async speak(text) {
        if (!this.synthesis || !text) return false;

        try {
            this.stopSpeaking();

            return new Promise((resolve) => {
                this.currentUtterance = new SpeechSynthesisUtterance(text);

                if (this.selectedVoice) {
                    this.currentUtterance.voice = this.selectedVoice;
                }

                this.currentUtterance.rate = CONFIG.SPEECH.VOICE_RATE;
                this.currentUtterance.pitch = CONFIG.SPEECH.VOICE_PITCH;
                this.currentUtterance.volume = CONFIG.SPEECH.VOICE_VOLUME;

                this.currentUtterance.onstart = () => this.isSpeaking = true;
                this.currentUtterance.onend = () => {
                    this.isSpeaking = false;
                    this.currentUtterance = null;
                    resolve(true);
                };
                this.currentUtterance.onerror = () => {
                    this.isSpeaking = false;
                    this.currentUtterance = null;
                    resolve(false);
                };

                this.synthesis.speak(this.currentUtterance);
            });

        } catch (error) {
            return false;
        }
    }

    stopSpeaking() {
        if (this.synthesis && this.isSpeaking) {
            this.synthesis.cancel();
            this.isSpeaking = false;
            this.currentUtterance = null;
        }
    }

    dispose() {
        this.stopSpeaking();
        this.isInitialized = false;
    }
}

// ===== CAMERA MANAGER =====
class CameraManager {
    constructor() {
        this.videoElement = null;
        this.stream = null;
        this.isInitialized = false;

        this.constraints = {
            video: {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30 }
            },
            audio: false
        };
    }

    async init() {
        try {
            this.videoElement = document.getElementById('camera');
            if (!this.videoElement) {
                throw new Error('Elemento video no encontrado');
            }

            await this.startCamera();
            this.isInitialized = true;
            return true;

        } catch (error) {
            console.error('❌ Error cámara:', error);
            this.handleCameraError(error);
            return false;
        }
    }

    async startCamera() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia(this.constraints);
            this.videoElement.srcObject = this.stream;

            return new Promise((resolve, reject) => {
                this.videoElement.onloadedmetadata = () => {
                    this.videoElement.play().then(resolve).catch(reject);
                };
                setTimeout(() => reject(new Error('Timeout cámara')), 10000);
            });

        } catch (error) {
            throw new Error('Error cámara: ' + error.message);
        }
    }

    handleCameraError(error) {
        let userMessage = 'Error con la cámara';
        if (error.name === 'NotAllowedError') {
            userMessage = 'Acceso denegado. Permite la cámara.';
        }

        const statusElement = document.querySelector('.modal-content p');
        if (statusElement) {
            statusElement.textContent = `❌ ${userMessage}`;
        }
    }

    destroy() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        if (this.videoElement) {
            this.videoElement.srcObject = null;
        }
        this.isInitialized = false;
    }
}

// ===== MODEL 3D MANAGER SIMPLE =====
class Model3DManager {
    constructor(canvas) {
        this.canvas = canvas;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.model = null;
        this.mixer = null;
        this.animations = {};
        this.currentAnimation = null;
        this.isARMode = false;
        this.clock = new THREE.Clock();
        this.isVisible = false;
        this.modelLoaded = false;
        this.defaultScale = (CONFIG && CONFIG.MODEL && CONFIG.MODEL.SCALE) ? CONFIG.MODEL.SCALE : 1.0;
        // WebXR state
        this.xrSession = null;
        this.xrRefSpace = null;        // 'local' reference space
        this.xrViewerSpace = null;     // 'viewer' reference for hit-test source
        this.xrHitTestSource = null;
        this.reticle = null;           // visual reticle for hit pose
        this.hasPlaced = false;        // whether the avatar is locked in place
        this._onXRFrameBound = null;   // cached bound frame callback
        this._xrFrames = 0;            // frames counted in XR
        this._xrHits = 0;              // number of hit-test results observed
        this._xrStartTs = 0;           // session start timestamp
        this._lastXRFrame = null;      // last XRFrame for select fallback
        // Anchors
        this.xrAnchor = null;          // active XRAnchor
        this.xrAnchorSpace = null;     // anchor space to get poses
        this._lastHitResult = null;    // cache last XRHitTestResult
        // Controles
        this._controls = {
            isDragging: false,
            lastX: 0,
            lastY: 0,
            rotateSpeed: 0.005,
            moveSpeed: 0.2,
            scaleMin: 0.1,
            scaleMax: 10.0
        };
        // Estado táctil (móvil)
        this._touch = {
            isTouching: false,
            isTwoFinger: false,
            startDist: 0,
            lastCenter: { x: 0, y: 0 }
        };
        // Tap-to-place (AR)
        this._raycaster = new THREE.Raycaster();
        this._ndc = new THREE.Vector2();
        this._groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // y = 0
        this._tapPlacementEnabled = false;
        this._tapHandler = null;
        this._touchEndHandler = null;
        // Tap detection state to avoid triggering placement after pinch
        this._tapTouchStartHandler = null;
        this._tapTouchMoveHandler = null;
        this._tapTouchEndHandler = null;
        this._tapStartX = 0;
        this._tapStartY = 0;
        this._tapStartTime = 0;
        this._tapHadMultiTouch = false;
    }

    async init() {
        try {
            console.log('🎭 Inicializando Model 3D...');

            if (typeof THREE === 'undefined') {
                throw new Error('Three.js no disponible');
            }

            this.setupRenderer();
            this.setupScene();
            this.setupCamera();
            this.setupLights();

            // CARGAR TU MODELO DIRECTAMENTE (SIN FALLBACK)
            try {
                await this.loadModel();
                console.log('✅ TU MODELO CARGADO!');
            } catch (error) {
                console.error('❌ NO SE PUDO CARGAR avatar_prueba.glb:', error);
                console.error('💡 VERIFICA:');
                console.error('   1. El archivo avatar_prueba.glb está en la raíz del proyecto');
                console.error('   2. Estás usando un servidor HTTP (no file://)');
                console.error('   3. La ruta es correcta:', CONFIG.MODEL.PATH);
                throw error; // NO crear modelo temporal, mostrar error real
            }
            // Activar controles interactivos
            this.enableControls();

            this.startRenderLoop();
            console.log('✅ Model 3D Manager listo');
        } catch (error) {
            console.error('❌ ERROR CRÍTICO - No se pudo inicializar Model3DManager:', error);
            console.error('💡 Revisa la consola arriba para ver el error específico');
            // NO crear modelo temporal - dejar que falle para ver el error real
            throw error;
        }
    }

    async loadModel() {
        return new Promise((resolve, reject) => {
            console.log('📦 CARGANDO:', CONFIG.MODEL.PATH);

            const loader = new GLTFLoader(); // ← Correcto: GLTFLoader (no THREE.GLTFLoader)

            // Configurar DRACO (requerido para tu modelo)
            const dracoLoader = new DRACOLoader();
            dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
            loader.setDRACOLoader(dracoLoader);
            console.log('🗜️ DRACO configurado para modelo comprimido');

            loader.load(
                CONFIG.MODEL.PATH,
                (gltf) => {
                    console.log('🎉 ¡AVATAR_PRUEBA.GLB CARGADO!');

                    this.model = gltf.scene;
                    this.modelLoaded = true;

                    // Configurar escala
                    this.model.scale.setScalar(CONFIG.MODEL.SCALE);

                    // Centrar modelo
                    const box = new THREE.Box3().setFromObject(this.model);
                    const center = box.getCenter(new THREE.Vector3());
                    const size = box.getSize(new THREE.Vector3());

                    console.log('📏 Tamaño de tu modelo:', size);
                    console.log('📍 Centro de tu modelo:', center);

                    this.model.position.sub(center);
                    this.model.position.y = 0;

                    // Configurar materiales
                    this.model.traverse((child) => {
                        if (child.isMesh) {
                            child.castShadow = true;
                            child.receiveShadow = true;
                        }
                    });

                    this.scene.add(this.model);

                    // Configurar animaciones si existen
                    if (gltf.animations && gltf.animations.length > 0) {
                        this.setupAnimations(gltf.animations);
                        console.log(`🎬 ${gltf.animations.length} animaciones en tu modelo`);
                    } else {
                        console.log('ℹ️ Tu modelo no tiene animaciones');
                    }

                    resolve();
                },
                (progress) => {
                    let percent = 0;
                    if (progress && typeof progress.total === 'number' && progress.total > 0) {
                        percent = Math.round((progress.loaded / progress.total) * 100);
                    } else if (progress && typeof progress.loaded === 'number') {
                        // fallback cuando no hay total
                        percent = Math.min(99, Math.round((progress.loaded / (1024 * 1024)) * 10));
                    }
                    console.log(`📥 Cargando tu modelo: ${percent}%`);
                },
                (error) => {
                    console.error('❌ ERROR CARGANDO TU MODELO:', error);
                    console.error('Ruta buscada:', CONFIG.MODEL.PATH);
                    console.error('Verifica que el archivo avatar_prueba.glb esté en la raíz del proyecto');
                    reject(error);
                }
            );
        });
    }

    createTemporaryModel() {
        console.log('🔧 Creando avatar simple como fallback...');

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

        this.model = avatarGroup;
        this.model.position.set(0, 0, 0);
        this.model.castShadow = true;
        this.modelLoaded = true;

        this.scene.add(this.model);

        console.log('✅ CUBO ROJO TEMPORAL CREADO');
    }

    setupRenderer() {
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            alpha: true,
            antialias: true
        });

        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.outputEncoding = THREE.sRGBEncoding;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        // Enable WebXR rendering (AR)
        if (this.renderer && this.renderer.xr) {
            this.renderer.xr.enabled = true;
        }
        // Ensure full transparency in AR
        try { this.renderer.domElement.style.backgroundColor = 'transparent'; } catch (_) { }
    }

    setupScene() {
        this.scene = new THREE.Scene();
        this.scene.background = this.isARMode ? null : new THREE.Color(0x87CEEB);
    }

    setupCamera() {
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 3, 5);
        this.camera.lookAt(0, 1, 0);
    }

    setupLights() {
        // Luces brillantes para máxima visibilidad
        const ambientLight = new THREE.AmbientLight(0x404040, 1.5);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 2.0);
        directionalLight.position.set(10, 10, 5);
        directionalLight.castShadow = true;
        this.scene.add(directionalLight);

        const pointLight1 = new THREE.PointLight(0xffffff, 1.0, 50);
        pointLight1.position.set(5, 5, 5);
        this.scene.add(pointLight1);

        const pointLight2 = new THREE.PointLight(0xffffff, 1.0, 50);
        pointLight2.position.set(-5, 5, -5);
        this.scene.add(pointLight2);
    }

    setupAnimations(animations) {
        this.mixer = new THREE.AnimationMixer(this.model);

        animations.forEach((clip) => {
            const action = this.mixer.clipAction(clip);
            this.animations[clip.name.toLowerCase()] = action;
            console.log('🎬 Animación:', clip.name);
        });

        this.playIdleAnimation();
    }

    // Métodos de animación
    playIdleAnimation() {
        if (!this.modelLoaded) return;
        this.playAnimation(CONFIG.MODEL.ANIMATIONS.IDLE);
    }

    playTalkingAnimation() {
        if (!this.modelLoaded) return;
        this.playAnimation(CONFIG.MODEL.ANIMATIONS.TALKING);
    }

    playThinkingAnimation() {
        if (!this.modelLoaded) return;
        this.playAnimation(CONFIG.MODEL.ANIMATIONS.THINKING);
    }

    playListeningAnimation() {
        if (!this.modelLoaded) return;
        this.playAnimation(CONFIG.MODEL.ANIMATIONS.LISTENING);
    }

    playAnimation(animationName) {
        if (!this.mixer || !animationName) return;

        const action = this.animations[animationName.toLowerCase()];
        if (action) {
            // Ajustar velocidad global de reproducción
            const spd = (CONFIG && CONFIG.MODEL && typeof CONFIG.MODEL.ANIMATION_SPEED === 'number') ? CONFIG.MODEL.ANIMATION_SPEED : 1.0;
            this.mixer.timeScale = Math.max(0.1, spd);
            if (this.currentAnimation && this.currentAnimation !== action) {
                this.currentAnimation.fadeOut(0.3);
            }
            action.reset().fadeIn(0.3).play();
            this.currentAnimation = action;
            console.log('🎬 Reproduciendo:', animationName);
        }
    }

    setARMode(isAR) {
        this.isARMode = isAR;

        if (isAR) {
            this.scene.background = null;
            this.renderer.setClearColor(0x000000, 0);
            // Ensure canvas covers screen in AR
            if (this.canvas && this.canvas.style) {
                this.canvas.style.width = '100vw';
                this.canvas.style.height = '100vh';
            }
        } else {
            this.scene.background = new THREE.Color(0x87CEEB);
            this.renderer.setClearColor(0x87CEEB, 1);
            if (this.canvas && this.canvas.style) {
                this.canvas.style.width = '';
                this.canvas.style.height = '';
            }
        }
    }

    // ===== WebXR AR Session with Hit-Test =====
    async startARSession(useDomOverlay = true) {
        try {
            if (!navigator.xr || !this.renderer || !this.renderer.xr) {
                console.warn('WebXR no disponible');
                return false;
            }

            const supported = await navigator.xr.isSessionSupported?.('immersive-ar');
            if (!supported) {
                console.warn('Sesión immersive-ar no soportada');
                return false;
            }

            // Request AR session
            console.log('🕶️ Solicitando sesión WebXR immersive-ar...');
            this.renderer.xr.setReferenceSpaceType?.('local');
            const sessionInit = {
                requiredFeatures: ['hit-test'],
                optionalFeatures: ['local-floor', 'bounded-floor', 'unbounded', 'light-estimation', 'anchors']
            };
            if (useDomOverlay) {
                sessionInit.optionalFeatures.push('dom-overlay');
                sessionInit.domOverlay = { root: document.body };
            }
            this.xrSession = await navigator.xr.requestSession('immersive-ar', sessionInit);

            // Set session to renderer
            this.renderer.xr.setSession(this.xrSession);

            // Reference spaces (prefer local-floor if available)
            try {
                this.xrRefSpace = await this.xrSession.requestReferenceSpace('local-floor');
            } catch (_) {
                this.xrRefSpace = await this.xrSession.requestReferenceSpace('local');
            }
            this.xrViewerSpace = await this.xrSession.requestReferenceSpace('viewer');

            console.log('✅ Sesión WebXR iniciada. environmentBlendMode =', this.xrSession.environmentBlendMode);
            if (this.xrSession.environmentBlendMode && this.xrSession.environmentBlendMode === 'opaque') {
                console.warn('El modo de mezcla es "opaque" (no hay passthrough de cámara). Se usará el fallback.');
                try { await this.stopARSession(); } catch (_) { }
                return false;
            }

            // Create hit-test source from viewer forward ray (more reliable on some devices)
            let hitTestSource = null;
            try {
                const useOffset = (typeof XRRay !== 'undefined');
                hitTestSource = await this.xrSession.requestHitTestSource(useOffset ? {
                    space: this.xrViewerSpace,
                    offsetRay: new XRRay()
                } : { space: this.xrViewerSpace });
            } catch (e) {
                console.warn('requestHitTestSource with offsetRay falló, probando sin offsetRay:', e);
                hitTestSource = await this.xrSession.requestHitTestSource({ space: this.xrViewerSpace });
            }
            this.xrHitTestSource = hitTestSource;

            // Transient input hit-test (for screen taps)
            try {
                this.xrTransientHitTestSource = await this.xrSession.requestHitTestSourceForTransientInput({ profile: 'generic-touchscreen' });
            } catch (e) {
                console.warn('requestHitTestSourceForTransientInput no disponible:', e);
                this.xrTransientHitTestSource = null;
            }

            // Create reticle if not exists
            if (!this.reticle) this.createReticle();
            this.reticle.visible = false;
            this.hasPlaced = false;
            this._xrFrames = 0;
            this._xrHits = 0;
            this._xrStartTs = performance.now ? performance.now() : Date.now();

            // Input: place model on select. Prefer anchors; if no plane hit, fallback 1.5m in front of camera
            this._onXRSelect = async (ev) => {
                try {
                    // Obtener el frame del evento de forma segura
                    const frame = this._currentFrame || this._lastXRFrame;
                    if (this._lastHitResult && frame && typeof this._lastHitResult.createAnchor === 'function') {
                        this._lastHitResult.createAnchor().then((anchor) => {
                            this.xrAnchor = anchor;
                            this.xrAnchorSpace = anchor.anchorSpace;
                            this.hasPlaced = true;
                            if (this.reticle) this.reticle.visible = false;
                            // Deshabilitar matrixAutoUpdate para que el anchor controle la posición
                            if (this.model) this.model.matrixAutoUpdate = false;
                            console.log('📌 Modelo anclado con XRAnchor');
                            // Aviso UI
                            try { this.canvas?.dispatchEvent(new CustomEvent('xr-anchored')); } catch (_) { }
                        }).catch((e) => {
                            console.warn('No se pudo crear anchor, usando posición de retícula:', e);
                            if (this.model && this.reticle) {
                                // Guardar la pose completa de la retícula
                                this.model.matrix.copy(this.reticle.matrix);
                                this.model.matrix.decompose(this.model.position, this.model.quaternion, this.model.scale);
                                
                                // IMPORTANTE: Ajustar altura igual que la retícula
                                this.model.position.y = -2.5; // Mismo nivel que retícula
                                
                                // Deshabilitar updates automáticos para mantener fijo
                                this.model.matrixAutoUpdate = false;
                                this.model.updateMatrix();
                                this.hasPlaced = true;
                                if (this.reticle) this.reticle.visible = false;
                                console.log('📌 Modelo fijado en AR (sin anchor) en:', this.model.position);
                                try { this.canvas?.dispatchEvent(new CustomEvent('xr-placed-no-anchor')); } catch (_) { }
                            }
                        });
                        return;
                    }

                    // Si no tenemos hit anclable pero sí retícula visible, colocar en esa pose
                    if (this.model && this.reticle && this.reticle.visible) {
                        // Guardar la pose completa de la retícula
                        this.model.matrix.copy(this.reticle.matrix);
                        this.model.matrix.decompose(this.model.position, this.model.quaternion, this.model.scale);

                        // ASEGURAR que esté al nivel del piso ajustado
                        this.model.position.y = -2.5; // Mismo nivel que retícula

                        // Deshabilitar updates automáticos para mantener fijo
                        this.model.matrixAutoUpdate = false;
                        this.model.updateMatrix();
                        this.hasPlaced = true;
                        if (this.reticle) this.reticle.visible = false;

                        // Ocultar indicador de posición y mostrar mensaje de confirmación
                        if (this.ui && this.ui.arStatus) {
                            this.ui.arStatus.innerHTML = '✅ Modelo fijado en el piso';
                            setTimeout(() => this.ui.arStatus && this.ui.arStatus.classList.add('hidden'), 2000);
                        }

                        console.log('📌 Modelo fijado AL RAS DEL PISO en:', this.model.position);
                        return;
                    }

                    // Fallback MEJORADO: usar la posición guardada de la cámara
                    console.log('💡 Sin superficie detectada - Colocando modelo al frente');
                    if (this._lastCameraPosition && this._lastCameraDirection) {
                        // Usar la última posición conocida de la cámara
                        const pos = this._lastCameraPosition.clone();
                        const dir = this._lastCameraDirection.clone();

                        // Colocar 1.2m al frente al nivel del piso
                        const fallbackPos = pos.clone().add(dir.multiplyScalar(1.2));
                        fallbackPos.y = -0.5; // Mismo nivel que retícula

                        this.model.position.copy(fallbackPos);
                        // Hacer que el modelo mire hacia la cámara
                        this.model.lookAt(pos);
                        this.model.rotateY(Math.PI); // Dar la vuelta para que mire hacia ti

                        // Deshabilitar updates automáticos para mantener fijo
                        this.model.matrixAutoUpdate = false;
                        this.model.updateMatrix();
                        this.hasPlaced = true;
                        console.log('📌 Modelo colocado al frente en:', fallbackPos);
                        console.log('👍 ¡Listo! El avatar está fijo en el espacio');
                        try { this.canvas?.dispatchEvent(new CustomEvent('xr-placed-fallback')); } catch (_) { }
                    } else {
                        console.warn('⚠️ No hay posición de cámara guardada');
                    }
                } catch (e) {
                    console.warn('onXRSelect fallback error:', e);
                }
            };
            this.xrSession.addEventListener('select', this._onXRSelect);
            this.xrSession.addEventListener('end', () => console.log('🛑 XRSession end'));

            // Animation loop for XR frames
            this._onXRFrameBound = (time, frame) => this._onXRFrame(time, frame);
            this.renderer.setAnimationLoop(this._onXRFrameBound);

            // Si no hay frames después de 1.5s, reintentar sin domOverlay una sola vez
            if (useDomOverlay) {
                setTimeout(async () => {
                    try {
                        if (this._xrFrames === 0 && this.xrSession) {
                            console.warn('⚠️ Sin frames XR con domOverlay. Reintentando sin domOverlay...');
                            await this.stopARSession();
                            await this.startARSession(false);
                        }
                    } catch (e) { console.warn('Retry sin domOverlay falló:', e); }
                }, 1500);
            }

            return true;
        } catch (err) {
            console.error('❌ startARSession error:', err);
            return false;
        }
    }

    async stopARSession() {
        try {
            if (this.xrSession) {
                if (this._onXRSelect) {
                    try { this.xrSession.removeEventListener('select', this._onXRSelect); } catch (_) { }
                }
                await this.xrSession.end();
            }
        } catch (e) {
            console.warn('stopARSession warning:', e);
        } finally {
            this.xrSession = null;
            this.xrRefSpace = null;
            this.xrViewerSpace = null;
            this.xrHitTestSource = null;
            this.xrAnchor = null;
            this.xrAnchorSpace = null;
            this._onXRSelect = null;
            // Return to normal RAF loop
            if (this.renderer) this.renderer.setAnimationLoop(null);
            if (this.reticle) this.reticle.visible = false;
            this.hasPlaced = false;
            // Restaurar matrixAutoUpdate para modo preview
            if (this.model) {
                this.model.matrixAutoUpdate = true;
            }
        }
    }

    _onXRFrame(time, frame) {
        if (!frame || !this.renderer || !this.scene || !this.camera) return;

        const session = frame.session;
        this._lastXRFrame = frame;

        // Guardar posición de cámara en cada frame para colocación fallback
        if (this.xrRefSpace) {
            const viewerPose = frame.getViewerPose(this.xrRefSpace);
            if (viewerPose && viewerPose.views && viewerPose.views[0]) {
                const m = new THREE.Matrix4().fromArray(viewerPose.views[0].transform.matrix);
                this._lastCameraPosition = new THREE.Vector3().setFromMatrixPosition(m);
                this._lastCameraDirection = new THREE.Vector3(0, 0, -1).applyMatrix4(new THREE.Matrix4().extractRotation(m));
            }
        }

        // Update hit-test
        if (this.xrHitTestSource && this.xrRefSpace) {
            const results = frame.getHitTestResults(this.xrHitTestSource);
            if (results && results.length > 0) {
                const hit = results[0];
                this._lastHitResult = hit;
                const pose = hit.getPose(this.xrRefSpace);
                if (pose && this.reticle) {
                    this.reticle.visible = !this.hasPlaced; // hide reticle after placement

                    // Ajustar altura: Extraer posición y forzar Y = 0 (al ras del piso)
                    this.reticle.matrix.fromArray(pose.transform.matrix);
                    const position = new THREE.Vector3();
                    const quaternion = new THREE.Quaternion();
                    const scale = new THREE.Vector3();
                    this.reticle.matrix.decompose(position, quaternion, scale);

                    // IMPORTANTE: Bajar retícula al piso (ajustable según tu modelo)
                    position.y = -2.5; // Bajar 50cm más

                    // Reconstruir matriz con la nueva posición
                    this.reticle.matrix.compose(position, quaternion, scale);

                    // Actualizar UI con posición de la retícula
                    this._updateReticlePositionUI(position);

                    this._xrHits++;
                    // Aviso UI: se detecta plano
                    try { this.canvas?.dispatchEvent(new CustomEvent('xr-plane-detected')); } catch (_) { }
                }
            } else if (this.reticle) {
                // If no hits, try to place reticle 1.5m in front of the camera for visual confirmation
                const viewerPose = frame.getViewerPose(this.xrRefSpace);
                if (viewerPose && !this.hasPlaced) {
                    const view = viewerPose.views[0];
                    if (view) {
                        const m = new THREE.Matrix4().fromArray(view.transform.matrix);
                        const pos = new THREE.Vector3().setFromMatrixPosition(m);
                        const dir = new THREE.Vector3(0, 0, -1).applyMatrix4(new THREE.Matrix4().extractRotation(m));
                        const fallbackPos = pos.clone().add(dir.multiplyScalar(1.5));

                        // IMPORTANTE: Bajar al piso en fallback
                        fallbackPos.y = -2.5; // Bajar 50cm más

                        this.reticle.visible = true;
                        this.reticle.matrix.identity();
                        this.reticle.matrix.setPosition(fallbackPos);

                        // Actualizar UI con posición fallback
                        this._updateReticlePositionUI(fallbackPos);
                    }
                } else {
                    this.reticle.visible = false && !this.hasPlaced;
                }
            }
        }

        // Transient input hits (on tap)
        if (this.xrTransientHitTestSource && this.xrRefSpace) {
            const transientResults = frame.getHitTestResultsForTransientInput(this.xrTransientHitTestSource);
            if (transientResults && transientResults.length > 0) {
                const first = transientResults[0];
                if (first && first.results && first.results.length > 0) {
                    const pose = first.results[0].getPose(this.xrRefSpace);
                    if (pose && this.reticle && !this.hasPlaced) {
                        this.reticle.visible = true;
                        this.reticle.matrix.fromArray(pose.transform.matrix);
                        this._xrHits++;
                    }
                }
            }
        }

        // If anchored, update model pose from anchor space to keep it fixed in the real world
        if (this.xrAnchorSpace && this.hasPlaced) {
            const anchorPose = frame.getPose(this.xrAnchorSpace, this.xrRefSpace);
            if (anchorPose && this.model) {
                const m = new THREE.Matrix4().fromArray(anchorPose.transform.matrix);
                this.model.matrix.copy(m);
                // NO descomponemos ni actualizamos position/rotation/scale individualmente
                // para evitar conflictos con las transformaciones manuales
            }
        }
        // Si está colocado sin anchor, mantener la matriz fija (no hacer nada, matrixAutoUpdate=false)

        // Animate and render
        const deltaTime = this.clock.getDelta();
        if (this.mixer && this.modelLoaded) this.mixer.update(deltaTime);
        if (this.isVisible) this.renderer.render(this.scene, this.camera);

        // Diagnostics: count frames and optionally fallback after 5s without hits
        this._xrFrames++;
        if (this._xrStartTs && ((performance.now ? performance.now() : Date.now()) - this._xrStartTs) > 5000) {
            if (this._xrHits === 0) {
                console.warn('⏳ Sin resultados de hit-test en 5s. Considera mover el dispositivo o tocar para colocar al frente.');
                if (this.ui && this.ui.arStatus) {
                    try {
                        this.ui.arStatus.classList.remove('hidden');
                        this.ui.arStatus.textContent = 'Sin plano: toca para colocar al frente o mueve el teléfono';
                    } catch (_) { }
                }
            }
            // Only report once
            this._xrStartTs = 0;
        }
    }

    createReticle() {
        // Retículo azul brillante MUY GRANDE para mejor visibilidad
        const geo = new THREE.RingGeometry(0.2, 0.3, 32).rotateX(-Math.PI / 2);
        const mat = new THREE.MeshBasicMaterial({
            color: 0x00BFFF,  // Azul brillante (Deep Sky Blue)
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 1.0  // Totalmente opaco
        });
        this.reticle = new THREE.Mesh(geo, mat);
        this.reticle.matrixAutoUpdate = false;
        this.reticle.visible = false;
        this.scene.add(this.reticle);

        console.log('🎯 Retículo azul GRANDE creado (0.2-0.3m)');
    }

    _updateReticlePositionUI(position) {
        // Mostrar posición de la retícula en la UI
        if (this.ui && this.ui.arStatus) {
            try {
                this.ui.arStatus.classList.remove('hidden');
                const x = position.x.toFixed(2);
                const y = position.y.toFixed(2);
                const z = position.z.toFixed(2);
                this.ui.arStatus.innerHTML = `
                    <div style="font-family: monospace; font-size: 14px;">
                        📍 Retícula:<br>
                        X: ${x}m | Y: ${y}m | Z: ${z}m
                    </div>
                `;
            } catch (_) { }
        }
    }

    enableTapPlacement(enable = true) {
        if (!this.canvas) return;
        if (enable === this._tapPlacementEnabled) return;
        this._tapPlacementEnabled = enable;

        const handleTap = (clientX, clientY) => {
            if (!this.camera || !this.model) return;
            const rect = this.canvas.getBoundingClientRect();
            const x = ((clientX - rect.left) / rect.width) * 2 - 1;
            const y = -((clientY - rect.top) / rect.height) * 2 + 1;
            this._ndc.set(x, y);
            this._raycaster.setFromCamera(this._ndc, this.camera);
            const hit = new THREE.Vector3();
            if (this._raycaster.ray.intersectPlane(this._groundPlane, hit)) {
                this.model.position.x = hit.x;
                this.model.position.z = hit.z;
                // Mantener en el piso
                this.model.position.y = 0;
                console.log('📍 Colocado en:', hit.x.toFixed(2), hit.z.toFixed(2));
            }
        };

        if (enable) {
            // Click (desktop)
            this._tapHandler = (e) => {
                e.preventDefault();
                handleTap(e.clientX, e.clientY);
            };
            this.canvas.addEventListener('click', this._tapHandler, { passive: false });

            // Touch: solo disparar tap cuando NO hubo multitouch ni movimiento significativo
            this._tapTouchStartHandler = (e) => {
                if (!e.touches || e.touches.length === 0) return;
                const t = e.touches[0];
                this._tapStartX = t.clientX;
                this._tapStartY = t.clientY;
                this._tapStartTime = (typeof performance !== 'undefined' ? performance.now() : Date.now());
                // Si comenzó con más de un dedo, no es tap
                this._tapHadMultiTouch = e.touches.length > 1;
            };

            this._tapTouchMoveHandler = (e) => {
                // Si en cualquier momento hay 2+ dedos, marcar como multitouch
                if (e.touches && e.touches.length > 1) {
                    this._tapHadMultiTouch = true;
                }
            };

            this._tapTouchEndHandler = (e) => {
                if (!e.changedTouches || e.changedTouches.length === 0) return;
                // Si aún quedan dedos en pantalla, no considerar como tap
                if (e.touches && e.touches.length > 0) return;

                const t = e.changedTouches[0];
                const endX = t.clientX;
                const endY = t.clientY;
                const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - (this._tapStartTime || 0);
                const dx = endX - (this._tapStartX || 0);
                const dy = endY - (this._tapStartY || 0);
                const moved = Math.hypot(dx, dy);

                // Umbrales: 12px de movimiento y 500ms de duración
                const isQuick = elapsed <= 500;
                const isStationary = moved <= 12;

                if (!this._tapHadMultiTouch && isQuick && isStationary) {
                    e.preventDefault();
                    handleTap(endX, endY);
                }

                // Reset flag para próximos toques
                this._tapHadMultiTouch = false;
            };

            this.canvas.addEventListener('touchstart', this._tapTouchStartHandler, { passive: false });
            this.canvas.addEventListener('touchmove', this._tapTouchMoveHandler, { passive: false });
            this.canvas.addEventListener('touchend', this._tapTouchEndHandler, { passive: false });
        } else {
            if (this._tapHandler) this.canvas.removeEventListener('click', this._tapHandler);
            this._tapHandler = null;
            // Limpiar handlers táctiles de tap
            if (this._tapTouchStartHandler) this.canvas.removeEventListener('touchstart', this._tapTouchStartHandler);
            if (this._tapTouchMoveHandler) this.canvas.removeEventListener('touchmove', this._tapTouchMoveHandler);
            if (this._tapTouchEndHandler) this.canvas.removeEventListener('touchend', this._tapTouchEndHandler);
            this._tapTouchStartHandler = null;
            this._tapTouchMoveHandler = null;
            this._tapTouchEndHandler = null;
        }
    }

    setVisible(visible) {
        this.isVisible = visible;
        if (this.canvas) {
            this.canvas.style.display = visible ? 'block' : 'none';
            this.canvas.style.visibility = visible ? 'visible' : 'hidden';
            // Asegurar interacción táctil en móvil
            this.canvas.style.pointerEvents = visible ? 'auto' : 'none';
            console.log('👁️ Modelo visible:', visible);
        }
    }

    // Restablece escala, posición y rotación a un estado cómodo para Preview
    resetForPreview() {
        if (!this.model) return;
        // Escala por defecto
        const s = this.defaultScale || 1.0;
        this.model.scale.setScalar(s);
        // Centrado en origen, sobre el piso (y=0)
        // Recalcular caja para centrar si es necesario
        try {
            const box = new THREE.Box3().setFromObject(this.model);
            const center = box.getCenter(new THREE.Vector3());
            this.model.position.sub(center);
        } catch (_) { }
        this.model.position.y = 0;
        this.model.position.x = 0;
        this.model.position.z = 0;
        // Rotación cómoda
        this.model.rotation.set(0, 0, 0);
        // Cámara de preview
        if (this.camera) {
            this.camera.position.set(0, 3, 5);
            this.camera.lookAt(0, 1, 0);
        }
        // Animación idle
        this.playIdleAnimation();
        console.log('✅ Reset preview: escala', s);
    }

    handleResize() {
        if (!this.camera || !this.renderer) return;
        // Evitar cambiar tamaño mientras una sesión XR está presentando
        if (this.renderer.xr && this.renderer.xr.isPresenting) {
            // WebXR gestiona el viewport; ignorar este resize
            return;
        }

        const width = window.innerWidth;
        const height = window.innerHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    startRenderLoop() {
        const animate = () => {
            requestAnimationFrame(animate);

            const deltaTime = this.clock.getDelta();

            if (this.mixer && this.modelLoaded) {
                this.mixer.update(deltaTime);
            }

            // Rotación automática para que se vea
            if (this.model && CONFIG.MODEL.AUTO_ROTATE) {
                this.model.rotation.y += CONFIG.MODEL.ROTATE_SPEED;
            }

            // Renderizar cuando visible
            // Evitar render doble: si XR está presentando, el render lo maneja setAnimationLoop
            if (this.isVisible && this.renderer && this.scene && this.camera && !(this.renderer.xr && this.renderer.xr.isPresenting)) {
                this.renderer.render(this.scene, this.camera);
            }
        };

        animate();
        console.log('🎬 Renderizado iniciado');
    }

    // ===== Controles Interactivos =====
    enableControls() {
        if (!this.canvas) return;

        // Mejorar soporte móvil: no permitir gestos del navegador
        try {
            this.canvas.style.touchAction = 'none'; // desactiva gestos por defecto (pinch/zoom del navegador)
        } catch (_) { }

        // Rueda del ratón: escala
        this._wheelHandler = (e) => {
            if (!this.model) return;
            const delta = -e.deltaY * 0.001;
            const currentScale = this.model.scale.x || 1;
            const next = THREE.MathUtils.clamp(currentScale * (1 + delta), this._controls.scaleMin, this._controls.scaleMax);
            this.model.scale.setScalar(next);
        };
        this.canvas.addEventListener('wheel', this._wheelHandler, { passive: true });

        // Arrastrar: rotar
        this._pointerDown = (e) => {
            this._controls.isDragging = true;
            this._controls.lastX = e.clientX;
            this._controls.lastY = e.clientY;
        };
        this._pointerMove = (e) => {
            if (!this._controls.isDragging || !this.model) return;
            const dx = e.clientX - this._controls.lastX;
            const dy = e.clientY - this._controls.lastY;
            this._controls.lastX = e.clientX;
            this._controls.lastY = e.clientY;
            this.model.rotation.y += dx * this._controls.rotateSpeed;
            this.model.rotation.x += dy * this._controls.rotateSpeed;
        };
        this._pointerUp = () => { this._controls.isDragging = false; };
        this.canvas.addEventListener('mousedown', this._pointerDown);
        window.addEventListener('mousemove', this._pointerMove);
        window.addEventListener('mouseup', this._pointerUp);

        // Teclado: mover, rotar, escalar
        this._keyHandler = (e) => {
            if (!this.model) return;
            const k = e.key.toLowerCase();
            const m = this._controls.moveSpeed;
            switch (k) {
                case 'arrowleft':
                case 'a':
                    this.model.position.x -= m; break;
                case 'arrowright':
                case 'd':
                    this.model.position.x += m; break;
                case 'arrowup':
                case 'w':
                    this.model.position.z -= m; break;
                case 'arrowdown':
                case 's':
                    this.model.position.z += m; break;
                case 'r':
                    this.model.position.y += m; break;
                case 'f':
                    this.model.position.y -= m; break;
                case 'q':
                    this.model.rotation.y -= 0.1; break;
                case 'e':
                    this.model.rotation.y += 0.1; break;
                case '+':
                case '=':
                    this._scaleBy(1.1); break;
                case '-':
                case '_':
                    this._scaleBy(0.9); break;
            }
        };
        window.addEventListener('keydown', this._keyHandler);

        // ==== Gestos táctiles ====
        const distance = (t1, t2) => {
            const dx = t2.clientX - t1.clientX;
            const dy = t2.clientY - t1.clientY;
            return Math.hypot(dx, dy);
        };
        const centerPt = (t1, t2) => ({ x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 });

        this._touchStart = (e) => {
            // Evitar scroll/zoom del navegador
            if (e && typeof e.preventDefault === 'function') e.preventDefault();
            if (!this.model) return;
            this._touch.isTouching = true;
            if (e.touches.length === 1) {
                // rotación con un dedo
                this._controls.isDragging = true;
                this._controls.lastX = e.touches[0].clientX;
                this._controls.lastY = e.touches[0].clientY;
                this._touch.isTwoFinger = false;
            } else if (e.touches.length >= 2) {
                // pinch para escalar, pan para mover
                const t1 = e.touches[0];
                const t2 = e.touches[1];
                this._touch.startDist = distance(t1, t2);
                this._touch.lastCenter = centerPt(t1, t2);
                this._touch.isTwoFinger = true;
                this._controls.isDragging = false;
            }
        };

        this._touchMove = (e) => {
            if (e && typeof e.preventDefault === 'function') e.preventDefault();
            if (!this.model || !this._touch.isTouching) return;
            if (this._touch.isTwoFinger && e.touches.length >= 2) {
                // Escala
                const t1 = e.touches[0];
                const t2 = e.touches[1];
                const dist = distance(t1, t2);
                const scaleFactor = dist / Math.max(this._touch.startDist, 1);
                this._scaleBy(scaleFactor);
                this._touch.startDist = dist;

                // Pan (mover)
                const c = centerPt(t1, t2);
                if (!this.isARMode && !this._tapPlacementEnabled) {
                    const dx = (c.x - this._touch.lastCenter.x) * 0.01;
                    const dy = (c.y - this._touch.lastCenter.y) * 0.01;
                    // Umbral para evitar jitter por micro-movimientos
                    if (Math.abs(dx) + Math.abs(dy) > 0.06) {
                        this.model.position.x += dx;
                        this.model.position.y -= dy;
                    }
                } else {
                    // En AR mantener al avatar pegado al piso tras escalar
                    this.model.position.y = 0;
                }
                this._touch.lastCenter = c;
            } else if (e.touches.length === 1 && this._controls.isDragging) {
                // Rotar con un dedo
                const tx = e.touches[0].clientX;
                const ty = e.touches[0].clientY;
                const dx = tx - this._controls.lastX;
                const dy = ty - this._controls.lastY;
                this._controls.lastX = tx;
                this._controls.lastY = ty;
                this.model.rotation.y += dx * this._controls.rotateSpeed;
                this.model.rotation.x += dy * this._controls.rotateSpeed;
            }
        };

        this._touchEnd = () => {
            this._touch.isTouching = false;
            this._touch.isTwoFinger = false;
            this._controls.isDragging = false;
        };

        this.canvas.addEventListener('touchstart', this._touchStart, { passive: false });
        this.canvas.addEventListener('touchmove', this._touchMove, { passive: false });
        this.canvas.addEventListener('touchend', this._touchEnd, { passive: false });
        this.canvas.addEventListener('touchcancel', this._touchEnd, { passive: false });
    }

    _scaleBy(factor) {
        if (!this.model) return;
        const current = this.model.scale.x || 1;
        const next = THREE.MathUtils.clamp(current * factor, this._controls.scaleMin, this._controls.scaleMax);
        this.model.scale.setScalar(next);
    }

    dispose() {
        if (this.renderer) {
            this.renderer.dispose();
        }
        // Limpiar listeners de controles
        if (this.canvas && this._wheelHandler) this.canvas.removeEventListener('wheel', this._wheelHandler);
        if (this.canvas && this._pointerDown) this.canvas.removeEventListener('mousedown', this._pointerDown);
        if (this._pointerMove) window.removeEventListener('mousemove', this._pointerMove);
        if (this._pointerUp) window.removeEventListener('mouseup', this._pointerUp);
        if (this._keyHandler) window.removeEventListener('keydown', this._keyHandler);
        if (this.canvas && this._touchStart) this.canvas.removeEventListener('touchstart', this._touchStart);
        if (this.canvas && this._touchMove) this.canvas.removeEventListener('touchmove', this._touchMove);
        if (this.canvas && this._touchEnd) {
            this.canvas.removeEventListener('touchend', this._touchEnd);
            this.canvas.removeEventListener('touchcancel', this._touchEnd);
        }
    }
}

// ===== APLICACIÓN PRINCIPAL =====
class VirtualAssistantApp {
    constructor() {
        this.cameraManager = null;
        this.model3dManager = null;
        this.gemini = new GeminiClient();
        this.speech = new SpeechManager();

        this.isInAR = false;
        this.isInPreview = false;
        this.isLoading = true;
        this.isProcessing = false;
        this.isInitialized = false;

        this.initUIElements();
        this.init();
    }

    initUIElements() {
        this.ui = {
            loadingScreen: document.getElementById('loadingScreen'),
            permissionModal: document.getElementById('permissionModal'),

            mainControls: document.getElementById('mainControls'),
            chatBtn: document.getElementById('chatBtn'),
            arBtn: document.getElementById('arBtn'),
            voiceBtn: document.getElementById('voiceBtn'),
            modelBtn: document.getElementById('modelBtn'),

            chatModal: document.getElementById('chatModal'),
            chatMessages: document.getElementById('chatMessages'),
            userInput: document.getElementById('userInput'),
            sendBtn: document.getElementById('sendBtn'),
            micBtn: document.getElementById('micBtn'),
            closeBtn: document.getElementById('closeBtn'),
            chatStatus: document.getElementById('chatStatus'),

            arChat: document.getElementById('arChat'),
            arResponse: document.getElementById('arResponse'),
            arInput: document.getElementById('arInput'),
            arSendBtn: document.getElementById('arSendBtn'),
            arMicBtn: document.getElementById('arMicBtn'),
            arCloseBtn: document.getElementById('arCloseBtn'),

            statusDisplay: document.getElementById('statusDisplay'),
            appStatus: document.getElementById('appStatus'),
            arStatus: document.getElementById('arStatus'),

            camera: document.getElementById('camera'),
            model3dCanvas: document.getElementById('model3dCanvas')
        };
    }

    async init() {
        try {
            console.log('🚀 Iniciando Asistente Virtual AR...');
            // Mostrar el modelo en modo Preview antes de pedir permisos
            await this.initPreviewModel();

            this.setupEventListeners();
            this.showPermissionModal();
        } catch (error) {
            console.error('❌ Error inicializando:', error);
        }
    }

    async initPreviewModel() {
        try {
            if (!this.ui || !this.ui.model3dCanvas) return;
            if (!this.model3dManager) {
                this.model3dManager = new Model3DManager(this.ui.model3dCanvas);
                await this.model3dManager.init();
            }
            this.isInPreview = true;
            this.isInAR = false;
            if (this.ui.camera) this.ui.camera.style.display = 'none';
            this.model3dManager.setARMode(false);
            this.model3dManager.setVisible(true);
            console.log('✅ Preview inicial listo');
        } catch (e) {
            console.error('⚠️ No se pudo iniciar preview inicial:', e);
        }
    }

    showPermissionModal() {
        if (this.ui.permissionModal) {
            this.ui.permissionModal.classList.remove('hidden');
            this.ui.permissionModal.style.display = 'flex';
        }
    }

    hidePermissionModal() {
        if (this.ui.permissionModal) {
            this.ui.permissionModal.classList.add('hidden');
            setTimeout(() => {
                this.ui.permissionModal.style.display = 'none';
            }, 300);
        }
    }

    async requestPermissions() {
        try {
            this.updatePermissionStatus('🔄 Inicializando...');

            // WebXR puro - NO necesita cámara HTML
            console.log('📱 Modo WebXR puro - Saltando inicialización de cámara HTML');

            // 1. Gemini 2.0
            this.updatePermissionStatus('🤖 Conectando Gemini 2.0...');
            const aiSuccess = await this.gemini.init();

            if (!aiSuccess) {
                throw new Error('No se pudo conectar con Gemini 2.0');
            }

            // 2. Speech
            this.updatePermissionStatus('🎤 Configurando voz...');
            const speechOk = await this.speech.init();
            if (!speechOk) {
                const reason = (this.speech && this.speech.unsupportedReason) ? this.speech.unsupportedReason : 'Voz no disponible';
                this.updatePermissionStatus(`❌ ${reason}`);
                throw new Error(reason);
            }

            // 3. Modelo 3D (reutilizar si ya está cargado para preview)
            this.updatePermissionStatus('🎭 Preparando modelo 3D...');
            if (!this.model3dManager) {
                this.model3dManager = new Model3DManager(this.ui.model3dCanvas);
                await this.model3dManager.init();
            }

            // 4. Listo
            this.isInitialized = true;
            this.hidePermissionModal();
            this.hideLoadingScreen();
            // Dejar al usuario en Preview por defecto tras permisos
            this.enterPreviewMode();

            console.log('🎉 ¡Sistema completo!');

        } catch (error) {
            console.error('❌ ERROR CRÍTICO:', error);
            this.updatePermissionStatus(`❌ ${error.message}`);

            const btn = document.getElementById('requestPermissions');
            if (btn) {
                btn.textContent = '🔄 Reintentar';
            }
        }
    }

    // ===== MODOS DE OPERACIÓN =====

    enterNormalMode() {
        this.isInPreview = false;
        this.isInAR = false;

        if (this.ui.camera) this.ui.camera.style.display = 'none';
        if (this.model3dManager) this.model3dManager.setVisible(false);

        if (this.ui.mainControls) this.ui.mainControls.style.display = 'flex';
        if (this.ui.arChat) this.ui.arChat.style.display = 'none';

        if (this.ui.arBtn) {
            this.ui.arBtn.innerHTML = '<span class="btn-icon">📱</span><span class="btn-text">AR</span>';
        }
        if (this.ui.modelBtn) {
            this.ui.modelBtn.innerHTML = '<span class="btn-icon">🎭</span><span class="btn-text">Ver Avatar</span>';
        }

        if (this.ui.appStatus) this.ui.appStatus.textContent = '🤖 Avatar con Gemini 2.0 listo';
        if (this.ui.arStatus) this.ui.arStatus.classList.add('hidden');
    }

    enterPreviewMode() {
        console.log('🎭 Mostrando modelo...');

        this.isInPreview = true;
        this.isInAR = false;

        if (this.ui.camera) this.ui.camera.style.display = 'none';
        if (this.model3dManager) {
            this.model3dManager.setVisible(true);
            this.model3dManager.setARMode(false);
            // Asegurar escala y posición correctas en Preview
            this.model3dManager.resetForPreview();
        }

        if (this.ui.mainControls) this.ui.mainControls.style.display = 'flex';
        if (this.ui.arChat) this.ui.arChat.style.display = 'none';

        if (this.ui.modelBtn) {
            this.ui.modelBtn.innerHTML = '<span class="btn-icon">🎭</span><span class="btn-text">Ocultar Avatar</span>';
        }

        if (this.ui.appStatus) this.ui.appStatus.textContent = '🎭 Viendo Avatar 3D';

        if (this.model3dManager) {
            this.model3dManager.playIdleAnimation();
        }

        console.log('✅ Modelo visible');
    }

    enterARMode() {
        this.isInAR = true;
        this.isInPreview = false;

        const startXR = async () => {
            // Solo WebXR, sin fallback
            console.log('🚀 Iniciando WebXR AR (modo puro)...');

            let xrOk = false;
            if (this.model3dManager) {
                this.model3dManager.setVisible(true);
                this.model3dManager.setARMode(true);
                xrOk = await this.model3dManager.startARSession();
            }

            if (xrOk) {
                // WebXR usa video passthrough nativo
                if (this.model3dManager) this.model3dManager.enableTapPlacement(false);
                if (this.ui.arStatus) this.ui.arStatus.textContent = 'WebXR AR activo';
                console.log('✅ WebXR AR iniciado correctamente');
            } else {
                // Sin fallback - mostrar error
                console.error('❌ WebXR no disponible en este dispositivo');
                if (this.ui.arStatus) this.ui.arStatus.textContent = '❌ WebXR no soportado';
                alert('WebXR AR no está disponible en este dispositivo o navegador.\n\nRequiere:\n- Android con Chrome/Edge\n- iOS 15+ con Safari\n- HTTPS');
                this.exitARMode();
                return;
            }
        };
        startXR();

        if (this.ui.mainControls) this.ui.mainControls.style.display = 'none';
        if (this.ui.chatModal) this.ui.chatModal.style.display = 'none';

        if (this.ui.arChat) {
            this.ui.arChat.style.display = 'block';
            this.ui.arChat.style.visibility = 'visible';
            this.ui.arChat.style.opacity = '1';
            this.ui.arChat.style.zIndex = '9999';
        }

        if (this.ui.appStatus) this.ui.appStatus.textContent = '📱 Modo AR Activo';
        if (this.ui.arStatus) this.ui.arStatus.classList.remove('hidden');

        setTimeout(() => this.showARWelcome(), 1000);
    }

    exitARMode() {
        this.isInAR = false;
        // Al salir de AR, volver a Preview para mantener el modelo visible
        this.enterPreviewMode();

        if (this.ui.arChat) this.ui.arChat.style.display = 'none';
        if (this.ui.arResponse) this.ui.arResponse.innerHTML = '';
        if (this.ui.arInput) this.ui.arInput.value = '';

        if (this.model3dManager) {
            this.model3dManager.setARMode(false);
            // Deshabilitar tap-to-place fuera de AR
            this.model3dManager.enableTapPlacement(false);
            // Restablecer pose y escala en Preview
            this.model3dManager.resetForPreview();
            // Parar sesión XR si estaba activa
            if (this.model3dManager.xrSession) {
                this.model3dManager.stopARSession();
            }
        }
    }

    toggleAR() {
        if (!this.isInitialized) {
            this.showPermissionModal();
            return;
        }

        if (this.isInAR) {
            this.exitARMode();
        } else {
            this.enterARMode();
        }
    }

    toggleModel() {
        if (!this.isInitialized) {
            this.showPermissionModal();
            return;
        }

        console.log('🔄 Toggle modelo - Preview:', this.isInPreview);

        if (this.isInPreview) {
            this.enterNormalMode();
        } else {
            this.enterPreviewMode();
        }
    }

    setupEventListeners() {
        const permissionBtn = document.getElementById('requestPermissions');
        if (permissionBtn) {
            permissionBtn.addEventListener('click', () => this.requestPermissions());
        }

        if (this.ui.arBtn) this.ui.arBtn.addEventListener('click', () => this.toggleAR());
        if (this.ui.chatBtn) this.ui.chatBtn.addEventListener('click', () => this.openChat());
        if (this.ui.voiceBtn) this.ui.voiceBtn.addEventListener('click', () => this.startVoiceInteraction());
        if (this.ui.modelBtn) this.ui.modelBtn.addEventListener('click', () => {
            if (!this.isInitialized) {
                this.showPermissionModal();
                return;
            }
            // Forzar mostrar el modelo en Preview
            this.enterPreviewMode();
            if (this.model3dManager) {
                this.model3dManager.resetForPreview();
            }
        });

        if (this.ui.sendBtn) this.ui.sendBtn.addEventListener('click', () => this.sendMessage());
        if (this.ui.closeBtn) this.ui.closeBtn.addEventListener('click', () => this.closeChat());
        if (this.ui.micBtn) this.ui.micBtn.addEventListener('click', () => this.startVoiceInteraction());

        if (this.ui.arSendBtn) this.ui.arSendBtn.addEventListener('click', () => this.sendARMessage());
        if (this.ui.arCloseBtn) this.ui.arCloseBtn.addEventListener('click', () => this.toggleAR());
        const relocateBtn = document.getElementById('arRelocateBtn');
        if (relocateBtn) relocateBtn.addEventListener('click', () => {
            if (!this.model3dManager) return;
            // Permitir recolocar: mostrar retícula y permitir tap de nuevo
            this.model3dManager.hasPlaced = false;
            // Limpiar anchor activo para permitir nueva fijación
            this.model3dManager.xrAnchor = null;
            this.model3dManager.xrAnchorSpace = null;
            if (this.model3dManager.reticle) this.model3dManager.reticle.visible = true;
            // Hint en UI
            if (this.ui && this.ui.arResponse) {
                this.ui.arResponse.innerHTML = '<div style="color:#00BFFF; font-size: 16px;">🎯 <strong>Recolocando...</strong><br><br>✨ Busca el círculo azul grande y toca<br>💡 O simplemente <strong>toca en cualquier lugar</strong> para colocar al frente</div>';
            }
        });
        if (this.ui.arMicBtn) this.ui.arMicBtn.addEventListener('click', () => this.startVoiceInteraction(true));

        // Listeners para eventos XR (emitidos desde Model3DManager)
        if (this.model3dManager && this.model3dManager.canvas) {
            const c = this.model3dManager.canvas;
            c.addEventListener('xr-no-plane', () => {
                if (this.ui.arStatus) {
                    this.ui.arStatus.classList.remove('hidden');
                    this.ui.arStatus.textContent = 'Sin plano: toca para colocar al frente o mueve el teléfono';
                    setTimeout(() => this.ui.arStatus && this.ui.arStatus.classList.add('hidden'), 3000);
                }
            });
            c.addEventListener('xr-plane-detected', () => {
                if (this.ui.arStatus) {
                    this.ui.arStatus.classList.remove('hidden');
                    this.ui.arStatus.textContent = 'Plano detectado: toca para fijar el avatar';
                    setTimeout(() => this.ui.arStatus && this.ui.arStatus.classList.add('hidden'), 3000);
                }
            });
            c.addEventListener('xr-anchored', () => {
                if (this.ui.arStatus) {
                    this.ui.arStatus.classList.remove('hidden');
                    this.ui.arStatus.textContent = 'Anclado al mundo ✅';
                    setTimeout(() => this.ui.arStatus && this.ui.arStatus.classList.add('hidden'), 3000);
                }
            });
            c.addEventListener('xr-placed-no-anchor', () => {
                if (this.ui.arStatus) {
                    this.ui.arStatus.classList.remove('hidden');
                    this.ui.arStatus.textContent = 'Colocado (sin anchor). Puedes Recolocar cuando detecte plano';
                    setTimeout(() => this.ui.arStatus && this.ui.arStatus.classList.add('hidden'), 3000);
                }
            });
            c.addEventListener('xr-placed-fallback', () => {
                if (this.ui.arStatus) {
                    this.ui.arStatus.classList.remove('hidden');
                    this.ui.arStatus.textContent = 'Colocado al frente. Usa Recolocar para anclar';
                    setTimeout(() => this.ui.arStatus && this.ui.arStatus.classList.add('hidden'), 3000);
                }
            });
        }

        if (this.ui.userInput) {
            this.ui.userInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });
        }

        if (this.ui.arInput) {
            this.ui.arInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendARMessage();
                }
            });
        }

        window.addEventListener('resize', () => {
            if (this.model3dManager) {
                this.model3dManager.handleResize();
            }
        });
    }

    async openChat() {
        if (!this.isInitialized) {
            this.showPermissionModal();
            return;
        }

        if (this.ui.chatModal) {
            this.ui.chatModal.style.display = 'flex';
        }

        if (this.ui.chatMessages && this.ui.chatMessages.children.length === 0) {
            try {
                const welcomeMsg = await this.gemini.getWelcomeMessage();
                this.addMessage('assistant', welcomeMsg);

                if (this.speech) {
                    this.speech.speak(welcomeMsg);
                }

                if (this.isInPreview && this.model3dManager) {
                    this.model3dManager.playTalkingAnimation();
                }
            } catch (error) {
                console.error('❌ Error bienvenida:', error);
                this.addMessage('assistant', 'Error: No se pudo conectar con Gemini 2.0.');
            }
        }

        if (this.ui.userInput) {
            setTimeout(() => this.ui.userInput.focus(), 100);
        }
    }

    closeChat() {
        if (this.ui.chatModal) {
            this.ui.chatModal.style.display = 'none';
        }

        if (this.speech) {
            this.speech.stopSpeaking();
        }

        if ((this.isInPreview || this.isInAR) && this.model3dManager) {
            this.model3dManager.playIdleAnimation();
        }
    }

    async sendMessage() {
        if (!this.ui.userInput) return;

        const message = this.ui.userInput.value.trim();
        if (!message || this.isProcessing) return;

        this.ui.userInput.value = '';
        this.addMessage('user', message);
        await this.processMessage(message, false);
    }

    async sendARMessage() {
        if (!this.ui.arInput) return;

        const message = this.ui.arInput.value.trim();
        if (!message || this.isProcessing) return;

        this.ui.arInput.value = '';
        await this.processMessage(message, true);
    }

    async processMessage(message, isAR = false) {
        this.isProcessing = true;
        this.updateChatStatus('🤔 Preguntando a Gemini 2.0...');

        if ((this.isInPreview || this.isInAR) && this.model3dManager) {
            this.model3dManager.playThinkingAnimation();
        }

        try {
            console.log('🧠 Enviando a Gemini 2.0:', message);

            const response = await this.gemini.sendMessage(message);

            console.log('💭 Respuesta Gemini 2.0:', response);

            if (isAR && this.ui.arResponse) {
                this.ui.arResponse.innerHTML = `
                    <div style="color: #00dd88; margin-bottom: 8px; font-weight: bold;">
                        Tu pregunta: ${message}
                    </div>
                    <div>${response}</div>
                `;
            } else {
                this.addMessage('assistant', response);
            }

            if (this.speech) {
                this.speech.speak(response);
            }

            if ((this.isInPreview || this.isInAR) && this.model3dManager) {
                this.model3dManager.playTalkingAnimation();
            }
            this.updateChatStatus('✅ Respuesta de Gemini 2.0');

        } catch (error) {
            console.error('❌ Error Gemini 2.0:', error);
            const fallback = 'Lo siento, ahora mismo no puedo ayudarte con eso. ¿Podrías reformular tu pregunta o intentar con otro tema?';
            const suggestions = 'Sugerencias: "Cuéntame un dato curioso", "¿Qué clima hay en Madrid?", "Explícame HTML en 1 frase", "Dime un chiste corto".';

            if (isAR && this.ui.arResponse) {
                this.ui.arResponse.innerHTML = `
                    <div style="color: #ffd166;">
                        🤔 ${fallback}
                    </div>
                    <div style="margin-top:8px;color:#ddd;">${suggestions}</div>
                `;
            } else {
                this.addMessage('assistant', `${fallback}\n\n${suggestions}`);
            }

            if (this.speech) {
                this.speech.speak(`${fallback} ${suggestions}`);
            }

            this.updateChatStatus('');

        } finally {
            this.isProcessing = false;

            setTimeout(() => {
                if ((this.isInPreview || this.isInAR) && this.model3dManager) {
                    this.model3dManager.playIdleAnimation();
                }
                this.updateChatStatus('');
            }, 3000);
        }
    }

    async startVoiceInteraction(isAR = false) {
        if (this.isProcessing) return;
        if (!this.speech) {
            this.updateChatStatus('❌ Voz no inicializada');
            return;
        }
        if (!this.speech.isInitialized) {
            const reason = this.speech.unsupportedReason || 'Reconocimiento de voz no disponible en este navegador o contexto.';
            this.updateChatStatus(`❌ ${reason}`);
            return;
        }

        try {
            console.log('🎤 Iniciando reconocimiento...');
            this.updateChatStatus('🎤 Habla ahora...');

            if ((this.isInPreview || this.isInAR) && this.model3dManager) {
                this.model3dManager.playListeningAnimation();
            }

            const transcript = await this.speech.listen();

            if (transcript && transcript.length > 1) {
                console.log('👂 Reconocido:', transcript);
                await this.processMessage(transcript, isAR);
            } else {
                this.updateChatStatus('🤷 No se detectó voz');

                if ((this.isInPreview || this.isInAR) && this.model3dManager) {
                    this.model3dManager.playIdleAnimation();
                }
            }

        } catch (error) {
            console.error('❌ Error voz:', error);
            this.updateChatStatus('❌ Error micrófono');

            if ((this.isInPreview || this.isInAR) && this.model3dManager) {
                this.model3dManager.playIdleAnimation();
            }
        }
    }

    async showARWelcome() {
        if (!this.isInAR || !this.ui.arResponse) return;

        try {
            const welcomeMsg = await this.gemini.getARWelcomeMessage();

            this.ui.arResponse.innerHTML = `
                <div style="color: #00BFFF; font-size: 18px; margin-bottom: 10px;">
                    🤖 ¡Avatar con Gemini 2.0 en AR!
                </div>
                <div style="margin-bottom: 10px;">${welcomeMsg}</div>
                <div style="color: #00BFFF; font-size: 15px; background: rgba(0,0,0,0.6); padding: 10px; border-radius: 8px;">
                    ✨ <strong>Busca el círculo azul grande</strong><br>
                    💡 O <strong>toca en cualquier lugar</strong> para colocar al frente
                </div>
            `;

            if (this.speech) {
                this.speech.speak(welcomeMsg);
            }

            if (this.model3dManager) {
                this.model3dManager.playTalkingAnimation();
            }

        } catch (error) {
            console.error('Error bienvenida AR:', error);
            if (this.ui.arResponse) {
                this.ui.arResponse.innerHTML = `
                    <div style="color: #00BFFF; font-size: 18px; margin-bottom: 10px;">
                        🎯 Modo AR Activo
                    </div>
                    <div style="color: #00BFFF; font-size: 15px; background: rgba(0,0,0,0.6); padding: 10px; border-radius: 8px;">
                        ✨ Mueve el teléfono para detectar superficies<br>
                        🎯 <strong>Busca el círculo azul grande</strong><br>
                        💡 O simplemente <strong>toca la pantalla</strong> para colocar al frente
                    </div>
                `;
            }
        }
    }

    addMessage(sender, text) {
        if (!this.ui.chatMessages) return;

        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}`;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.textContent = text;

        messageDiv.appendChild(contentDiv);
        this.ui.chatMessages.appendChild(messageDiv);

        this.ui.chatMessages.scrollTop = this.ui.chatMessages.scrollHeight;
    }

    updateChatStatus(status) {
        if (this.ui.chatStatus) {
            this.ui.chatStatus.textContent = status;
        }
    }

    updatePermissionStatus(message) {
        const statusElement = document.querySelector('.modal-content p');
        if (statusElement) {
            statusElement.textContent = message;
        }
        console.log('📋', message);
    }

    hideLoadingScreen() {
        this.isLoading = false;
        if (this.ui.loadingScreen) {
            this.ui.loadingScreen.style.opacity = '0';
            setTimeout(() => {
                this.ui.loadingScreen.style.display = 'none';
            }, 500);
        }
    }

    dispose() {
        if (this.cameraManager) this.cameraManager.destroy();
        if (this.model3dManager) this.model3dManager.dispose();
        if (this.speech) this.speech.dispose();
    }
}

// ===== INICIALIZACIÓN =====
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎉 Iniciando Asistente Virtual AR...');
    window.app = new VirtualAssistantApp();
});
