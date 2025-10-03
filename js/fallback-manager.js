/**
 * Fallback Manager - Sistema de respaldo cuando AR no está disponible
 * Proporciona experiencia alternativa usando cámara HTML5 + overlay 3D
 */

import * as THREE from 'three';

export class FallbackManager {
    constructor(model3DManager) {
        this.model3DManager = model3DManager;
        this.videoElement = null;
        this.stream = null;
        this.isActive = false;
        this.overlayCanvas = null;
        this.overlayRenderer = null;
        this.overlayScene = null;
        this.overlayCamera = null;
        this.deviceOrientation = { alpha: 0, beta: 0, gamma: 0 };
        this.hasDeviceOrientation = false;
        this.fallbackModel = null;
        this.animationId = null;
    }

    /**
     * Inicializar sistema de fallback
     */
    async init() {
        try {
            console.log('🔄 Inicializando sistema de fallback AR...');
            
            // Crear elementos HTML necesarios
            this.createFallbackElements();
            
            // Configurar cámara HTML5
            await this.setupCamera();
            
            // Configurar overlay 3D
            this.setupOverlay();
            
            // Configurar sensores de orientación si están disponibles
            this.setupDeviceOrientation();
            
            console.log('✅ Sistema de fallback listo');
            return true;
            
        } catch (error) {
            console.error('❌ Error inicializando fallback:', error);
            return false;
        }
    }

    /**
     * Crear elementos HTML para el fallback
     */
    createFallbackElements() {
        // Contenedor principal del fallback
        const fallbackContainer = document.createElement('div');
        fallbackContainer.id = 'fallbackContainer';
        fallbackContainer.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: black;
            z-index: 1000;
            display: none;
        `;

        // Video de la cámara
        this.videoElement = document.createElement('video');
        this.videoElement.id = 'fallbackVideo';
        this.videoElement.autoplay = true;
        this.videoElement.muted = true;
        this.videoElement.playsInline = true;
        this.videoElement.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            object-fit: cover;
        `;

        // Canvas para overlay 3D
        this.overlayCanvas = document.createElement('canvas');
        this.overlayCanvas.id = 'fallbackOverlay';
        this.overlayCanvas.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
        `;

        // Controles del fallback
        const controls = document.createElement('div');
        controls.innerHTML = `
            <div style="
                position: absolute;
                bottom: 20px;
                left: 50%;
                transform: translateX(-50%);
                display: flex;
                gap: 10px;
                z-index: 1001;
            ">
                <button id="fallbackPlace" style="
                    padding: 12px 20px;
                    background: #007AFF;
                    color: white;
                    border: none;
                    border-radius: 25px;
                    font-size: 16px;
                    cursor: pointer;
                ">📍 Colocar Avatar</button>
                <button id="fallbackClose" style="
                    padding: 12px 20px;
                    background: #FF3B30;
                    color: white;
                    border: none;
                    border-radius: 25px;
                    font-size: 16px;
                    cursor: pointer;
                ">✕ Cerrar</button>
            </div>
            
            <div id="fallbackInstructions" style="
                position: absolute;
                top: 20px;
                left: 20px;
                right: 20px;
                background: rgba(0,0,0,0.7);
                color: white;
                padding: 15px;
                border-radius: 10px;
                text-align: center;
                z-index: 1001;
            ">
                <h3>🤖 Modo AR Simulado</h3>
                <p>Mueve tu dispositivo para ver el avatar desde diferentes ángulos</p>
                <p>Toca "Colocar Avatar" para fijar la posición</p>
            </div>
        `;

        fallbackContainer.appendChild(this.videoElement);
        fallbackContainer.appendChild(this.overlayCanvas);
        fallbackContainer.appendChild(controls);
        document.body.appendChild(fallbackContainer);

        // Event listeners para controles
        document.getElementById('fallbackPlace')?.addEventListener('click', () => {
            this.placeModel();
        });

        document.getElementById('fallbackClose')?.addEventListener('click', () => {
            this.stop();
        });
    }

    /**
     * Configurar cámara HTML5
     */
    async setupCamera() {
        try {
            const constraints = {
                video: {
                    facingMode: 'environment', // Cámara trasera
                    width: { ideal: 1280, max: 1920 },
                    height: { ideal: 720, max: 1080 },
                    frameRate: { ideal: 30 }
                }
            };

            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.videoElement.srcObject = this.stream;

            return new Promise((resolve, reject) => {
                this.videoElement.onloadedmetadata = () => {
                    this.videoElement.play()
                        .then(() => {
                            console.log('📹 Cámara fallback iniciada');
                            resolve();
                        })
                        .catch(reject);
                };
                
                setTimeout(() => reject(new Error('Timeout cámara fallback')), 10000);
            });

        } catch (error) {
            throw new Error(`Error cámara fallback: ${error.message}`);
        }
    }

    /**
     * Configurar overlay 3D
     */
    setupOverlay() {
        // Renderer para overlay
        this.overlayRenderer = new THREE.WebGLRenderer({
            canvas: this.overlayCanvas,
            alpha: true,
            antialias: true
        });
        this.overlayRenderer.setSize(window.innerWidth, window.innerHeight);
        this.overlayRenderer.setPixelRatio(window.devicePixelRatio);
        this.overlayRenderer.setClearColor(0x000000, 0); // Transparente

        // Escena para overlay
        this.overlayScene = new THREE.Scene();

        // Cámara para overlay
        this.overlayCamera = new THREE.PerspectiveCamera(
            75, 
            window.innerWidth / window.innerHeight, 
            0.1, 
            1000
        );
        this.overlayCamera.position.set(0, 1.6, 0); // Altura de ojos

        // Luces
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
        this.overlayScene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
        directionalLight.position.set(5, 5, 5);
        this.overlayScene.add(directionalLight);

        // Clonar modelo del manager principal
        if (this.model3DManager.model) {
            this.fallbackModel = this.model3DManager.model.clone();
            this.fallbackModel.position.set(0, 0, -2); // 2 metros al frente
            this.fallbackModel.scale.setScalar(0.8); // Ligeramente más pequeño
            this.overlayScene.add(this.fallbackModel);
        }
    }

    /**
     * Configurar sensores de orientación del dispositivo
     */
    setupDeviceOrientation() {
        // Verificar si DeviceOrientationEvent está disponible
        if (typeof DeviceOrientationEvent !== 'undefined') {
            // Solicitar permisos en iOS 13+
            if (typeof DeviceOrientationEvent.requestPermission === 'function') {
                DeviceOrientationEvent.requestPermission()
                    .then(response => {
                        if (response === 'granted') {
                            this.enableDeviceOrientation();
                        } else {
                            console.warn('Permiso de orientación denegado');
                        }
                    })
                    .catch(console.error);
            } else {
                // Android o iOS más antiguo
                this.enableDeviceOrientation();
            }
        }
    }

    /**
     * Activar seguimiento de orientación
     */
    enableDeviceOrientation() {
        this.hasDeviceOrientation = true;
        
        window.addEventListener('deviceorientation', (event) => {
            this.deviceOrientation = {
                alpha: event.alpha || 0,  // Rotación Z (brújula)
                beta: event.beta || 0,    // Rotación X (inclinación adelante/atrás)
                gamma: event.gamma || 0   // Rotación Y (inclinación izquierda/derecha)
            };
        });

        console.log('📱 Orientación del dispositivo activada');
    }

    /**
     * Iniciar modo fallback
     */
    async start() {
        if (this.isActive) return;

        try {
            const container = document.getElementById('fallbackContainer');
            if (!container) {
                throw new Error('Contenedor fallback no encontrado');
            }

            // Mostrar contenedor
            container.style.display = 'block';
            
            // Ocultar canvas principal
            if (this.model3DManager.canvas) {
                this.model3DManager.canvas.style.display = 'none';
            }

            // Iniciar renderizado
            this.startRenderLoop();
            
            this.isActive = true;
            console.log('🎬 Modo fallback AR iniciado');

            // Ocultar instrucciones después de 5 segundos
            setTimeout(() => {
                const instructions = document.getElementById('fallbackInstructions');
                if (instructions) {
                    instructions.style.opacity = '0';
                    instructions.style.transition = 'opacity 0.5s';
                }
            }, 5000);

        } catch (error) {
            console.error('❌ Error iniciando fallback:', error);
            throw error;
        }
    }

    /**
     * Detener modo fallback
     */
    stop() {
        if (!this.isActive) return;

        // Ocultar contenedor
        const container = document.getElementById('fallbackContainer');
        if (container) {
            container.style.display = 'none';
        }

        // Mostrar canvas principal
        if (this.model3DManager.canvas) {
            this.model3DManager.canvas.style.display = 'block';
        }

        // Detener renderizado
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }

        // Detener cámara
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
        }

        this.isActive = false;
        console.log('🛑 Modo fallback AR detenido');

        // Disparar evento personalizado
        window.dispatchEvent(new CustomEvent('fallback-ar-stopped'));
    }

    /**
     * Colocar modelo en la escena
     */
    placeModel() {
        if (!this.fallbackModel) return;

        // Simular colocación basada en orientación
        const distance = 1.5; // 1.5 metros al frente
        const angle = (this.deviceOrientation.alpha || 0) * Math.PI / 180;
        
        this.fallbackModel.position.set(
            Math.sin(angle) * distance,
            0,
            -Math.cos(angle) * distance
        );

        // Hacer que el modelo mire hacia la cámara
        this.fallbackModel.lookAt(this.overlayCamera.position);
        this.fallbackModel.rotateY(Math.PI);

        console.log('📍 Modelo colocado en fallback AR');

        // Ocultar botón de colocar
        const placeBtn = document.getElementById('fallbackPlace');
        if (placeBtn) {
            placeBtn.style.display = 'none';
        }

        // Mostrar confirmación
        const instructions = document.getElementById('fallbackInstructions');
        if (instructions) {
            instructions.innerHTML = `
                <h3>✅ Avatar Colocado</h3>
                <p>El avatar está ahora fijo en el espacio virtual</p>
            `;
            setTimeout(() => {
                instructions.style.opacity = '0';
            }, 3000);
        }
    }

    /**
     * Loop de renderizado
     */
    startRenderLoop() {
        const render = () => {
            if (!this.isActive) return;

            // Actualizar cámara basada en orientación del dispositivo
            if (this.hasDeviceOrientation && this.overlayCamera) {
                const { alpha, beta, gamma } = this.deviceOrientation;
                
                // Convertir orientación a rotación de cámara
                this.overlayCamera.rotation.set(
                    (beta - 90) * Math.PI / 180,  // Pitch
                    alpha * Math.PI / 180,        // Yaw
                    gamma * Math.PI / 180         // Roll
                );
            }

            // Actualizar animaciones del modelo
            if (this.model3DManager.mixer) {
                const deltaTime = this.model3DManager.clock.getDelta();
                this.model3DManager.mixer.update(deltaTime);
            }

            // Renderizar overlay
            if (this.overlayRenderer && this.overlayScene && this.overlayCamera) {
                this.overlayRenderer.render(this.overlayScene, this.overlayCamera);
            }

            this.animationId = requestAnimationFrame(render);
        };

        render();
    }

    /**
     * Manejar redimensionamiento
     */
    handleResize() {
        if (!this.isActive) return;

        const width = window.innerWidth;
        const height = window.innerHeight;

        if (this.overlayCamera) {
            this.overlayCamera.aspect = width / height;
            this.overlayCamera.updateProjectionMatrix();
        }

        if (this.overlayRenderer) {
            this.overlayRenderer.setSize(width, height);
        }
    }

    /**
     * Limpiar recursos
     */
    dispose() {
        this.stop();
        
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
        }

        if (this.overlayRenderer) {
            this.overlayRenderer.dispose();
        }

        // Remover elementos del DOM
        const container = document.getElementById('fallbackContainer');
        if (container) {
            container.remove();
        }

        console.log('🗑️ Fallback Manager limpiado');
    }
}
