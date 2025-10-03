/**
 * Compatibility Manager - Detección de compatibilidad AR y manejo de permisos
 * Soluciona problemas específicos de Android y iOS
 */

export class CompatibilityManager {
    constructor() {
        this.deviceInfo = this.detectDevice();
        this.browserInfo = this.detectBrowser();
        this.arSupport = null;
        this.microphonePermission = null;
        this.cameraPermission = null;
        this.isInitialized = false;
    }

    /**
     * Detectar información del dispositivo
     */
    detectDevice() {
        const ua = navigator.userAgent;
        const isIOS = /iPad|iPhone|iPod/.test(ua);
        const isAndroid = /Android/.test(ua);
        const isMobile = /Mobi|Android/i.test(ua);
        
        // Detectar versión específica para iOS
        let iosVersion = null;
        if (isIOS) {
            const match = ua.match(/OS (\d+)_(\d+)_?(\d+)?/);
            if (match) {
                iosVersion = parseFloat(`${match[1]}.${match[2]}`);
            }
        }

        // Detectar versión de Android
        let androidVersion = null;
        if (isAndroid) {
            const match = ua.match(/Android (\d+(?:\.\d+)?)/);
            if (match) {
                androidVersion = parseFloat(match[1]);
            }
        }

        return {
            isIOS,
            isAndroid,
            isMobile,
            iosVersion,
            androidVersion,
            userAgent: ua
        };
    }

    /**
     * Detectar información del navegador
     */
    detectBrowser() {
        const ua = navigator.userAgent;
        
        // Chrome/Chromium
        const isChrome = /Chrome/.test(ua) && !/Edg/.test(ua);
        const chromeMatch = ua.match(/Chrome\/(\d+)/);
        const chromeVersion = chromeMatch ? parseInt(chromeMatch[1]) : null;
        
        // Safari
        const isSafari = /Safari/.test(ua) && !/Chrome/.test(ua);
        const safariMatch = ua.match(/Version\/(\d+)/);
        const safariVersion = safariMatch ? parseInt(safariMatch[1]) : null;
        
        // Firefox
        const isFirefox = /Firefox/.test(ua);
        const firefoxMatch = ua.match(/Firefox\/(\d+)/);
        const firefoxVersion = firefoxMatch ? parseInt(firefoxMatch[1]) : null;
        
        // Edge
        const isEdge = /Edg/.test(ua);
        const edgeMatch = ua.match(/Edg\/(\d+)/);
        const edgeVersion = edgeMatch ? parseInt(edgeMatch[1]) : null;

        // Samsung Internet
        const isSamsung = /SamsungBrowser/.test(ua);
        
        return {
            isChrome,
            chromeVersion,
            isSafari,
            safariVersion,
            isFirefox,
            firefoxVersion,
            isEdge,
            edgeVersion,
            isSamsung,
            userAgent: ua
        };
    }

    /**
     * Verificar soporte AR completo
     */
    async checkARSupport() {
        console.log('🔍 Verificando soporte AR...');
        
        const result = {
            webxr: false,
            immersiveAR: false,
            hitTest: false,
            domOverlay: false,
            recommended: false,
            issues: [],
            fallbackReason: null
        };

        // 1. Verificar WebXR básico
        if (!navigator.xr) {
            result.issues.push('WebXR no disponible');
            result.fallbackReason = 'WebXR no soportado en este navegador';
            return result;
        }
        result.webxr = true;

        // 2. Verificar soporte immersive-ar
        try {
            const supported = await navigator.xr.isSessionSupported('immersive-ar');
            result.immersiveAR = supported;
            
            if (!supported) {
                result.issues.push('Sesión immersive-ar no soportada');
                result.fallbackReason = this.getARNotSupportedReason();
                return result;
            }
        } catch (error) {
            result.issues.push(`Error verificando immersive-ar: ${error.message}`);
            result.fallbackReason = 'Error al verificar compatibilidad AR';
            return result;
        }

        // 3. Verificar características específicas
        try {
            // Crear sesión temporal para verificar características
            const sessionInit = {
                requiredFeatures: [],
                optionalFeatures: ['hit-test', 'dom-overlay', 'anchors', 'light-estimation']
            };
            
            const session = await navigator.xr.requestSession('immersive-ar', sessionInit);
            
            // Verificar hit-test
            try {
                const viewerSpace = await session.requestReferenceSpace('viewer');
                const hitTestSource = await session.requestHitTestSource({ space: viewerSpace });
                result.hitTest = true;
                hitTestSource.cancel();
            } catch (e) {
                result.issues.push('Hit-test no disponible');
            }
            
            // Verificar dom-overlay
            if (session.domOverlayState) {
                result.domOverlay = true;
            }
            
            await session.end();
            
        } catch (error) {
            result.issues.push(`Error verificando características: ${error.message}`);
            result.fallbackReason = 'Características AR no disponibles';
            return result;
        }

        // 4. Determinar si es recomendado
        result.recommended = this.isARRecommended();
        
        if (!result.recommended) {
            result.fallbackReason = this.getNotRecommendedReason();
        }

        this.arSupport = result;
        return result;
    }

    /**
     * Determinar razón específica por la que AR no está soportado
     */
    getARNotSupportedReason() {
        const { deviceInfo, browserInfo } = this;
        
        if (deviceInfo.isIOS) {
            if (browserInfo.isSafari) {
                if (deviceInfo.iosVersion < 14.3) {
                    return 'iOS Safari requiere versión 14.3+ para WebXR';
                }
                return 'WebXR en iOS Safari aún es experimental. Usa Chrome iOS si está disponible.';
            }
            return 'WebXR no está disponible en este navegador iOS. Prueba Safari o Chrome.';
        }
        
        if (deviceInfo.isAndroid) {
            if (browserInfo.isChrome) {
                if (browserInfo.chromeVersion < 81) {
                    return 'Chrome Android requiere versión 81+ para WebXR';
                }
                return 'WebXR puede requerir activación manual en chrome://flags/#webxr-incubations';
            }
            if (browserInfo.isSamsung) {
                return 'Samsung Internet tiene soporte limitado de WebXR. Usa Chrome Android.';
            }
            return 'WebXR no está disponible en este navegador Android. Usa Chrome Android.';
        }
        
        return 'WebXR no está soportado en este dispositivo/navegador';
    }

    /**
     * Verificar si AR es recomendado en este dispositivo
     */
    isARRecommended() {
        const { deviceInfo, browserInfo } = this;
        
        // iOS: Solo Safari 14.3+ o Chrome experimental
        if (deviceInfo.isIOS) {
            if (browserInfo.isSafari && deviceInfo.iosVersion >= 14.3) {
                return true;
            }
            if (browserInfo.isChrome && browserInfo.chromeVersion >= 90) {
                return true; // Chrome iOS experimental
            }
            return false;
        }
        
        // Android: Chrome 81+ recomendado
        if (deviceInfo.isAndroid) {
            if (browserInfo.isChrome && browserInfo.chromeVersion >= 81) {
                return deviceInfo.androidVersion >= 7.0; // Android 7.0+
            }
            return false;
        }
        
        // Desktop: No recomendado para AR
        return false;
    }

    /**
     * Razón por la que no es recomendado
     */
    getNotRecommendedReason() {
        const { deviceInfo, browserInfo } = this;
        
        if (!deviceInfo.isMobile) {
            return 'AR está optimizado para dispositivos móviles';
        }
        
        if (deviceInfo.isIOS && !browserInfo.isSafari) {
            return 'En iOS, Safari ofrece la mejor experiencia AR';
        }
        
        if (deviceInfo.isAndroid && !browserInfo.isChrome) {
            return 'En Android, Chrome ofrece la mejor experiencia AR';
        }
        
        return 'Tu configuración puede tener limitaciones de AR';
    }

    /**
     * Solicitar permisos de forma inteligente según el dispositivo
     */
    async requestPermissions() {
        console.log('🔐 Solicitando permisos...');
        
        const results = {
            camera: false,
            microphone: false,
            errors: []
        };

        // En iOS, solicitar permisos secuencialmente para evitar problemas
        if (this.deviceInfo.isIOS) {
            return await this.requestPermissionsIOS(results);
        } else {
            return await this.requestPermissionsAndroid(results);
        }
    }

    /**
     * Manejo específico de permisos para iOS
     */
    async requestPermissionsIOS(results) {
        console.log('📱 Solicitando permisos iOS (secuencial)...');
        
        // 1. Primero cámara (requerida para AR)
        try {
            console.log('📷 Solicitando cámara...');
            const cameraStream = await navigator.mediaDevices.getUserMedia({
                video: { 
                    facingMode: 'environment',
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            });
            
            results.camera = true;
            this.cameraPermission = 'granted';
            
            // Detener stream inmediatamente
            cameraStream.getTracks().forEach(track => track.stop());
            console.log('✅ Cámara autorizada');
            
        } catch (error) {
            console.warn('❌ Cámara denegada:', error.name);
            results.errors.push(`Cámara: ${error.name}`);
            this.cameraPermission = 'denied';
        }

        // 2. Esperar un momento antes del micrófono (iOS es sensible)
        await new Promise(resolve => setTimeout(resolve, 500));

        // 3. Luego micrófono (con manejo especial iOS)
        try {
            console.log('🎤 Solicitando micrófono...');
            
            // En iOS Safari, usar configuración específica
            const audioConstraints = this.browserInfo.isSafari ? {
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: 44100
                }
            } : {
                audio: true
            };
            
            const audioStream = await navigator.mediaDevices.getUserMedia(audioConstraints);
            
            results.microphone = true;
            this.microphonePermission = 'granted';
            
            // Detener stream inmediatamente
            audioStream.getTracks().forEach(track => track.stop());
            console.log('✅ Micrófono autorizado');
            
        } catch (error) {
            console.warn('❌ Micrófono denegado:', error.name);
            results.errors.push(`Micrófono: ${error.name}`);
            this.microphonePermission = 'denied';
            
            // En iOS, si el micrófono falla, mostrar instrucciones específicas
            if (error.name === 'NotAllowedError') {
                results.errors.push('iOS: Ve a Configuración > Safari > Cámara y Micrófono > Permitir');
            }
        }

        return results;
    }

    /**
     * Manejo específico de permisos para Android
     */
    async requestPermissionsAndroid(results) {
        console.log('🤖 Solicitando permisos Android...');
        
        // En Android podemos solicitar ambos simultáneamente
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { 
                    facingMode: 'environment',
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true
                }
            });
            
            results.camera = true;
            results.microphone = true;
            this.cameraPermission = 'granted';
            this.microphonePermission = 'granted';
            
            // Detener streams
            stream.getTracks().forEach(track => track.stop());
            console.log('✅ Cámara y micrófono autorizados');
            
        } catch (error) {
            console.warn('❌ Permisos denegados:', error.name);
            
            // Intentar solo cámara
            try {
                const videoStream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'environment' }
                });
                results.camera = true;
                this.cameraPermission = 'granted';
                videoStream.getTracks().forEach(track => track.stop());
                console.log('✅ Solo cámara autorizada');
            } catch (videoError) {
                results.errors.push(`Cámara: ${videoError.name}`);
                this.cameraPermission = 'denied';
            }
            
            // Intentar solo micrófono
            try {
                const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                results.microphone = true;
                this.microphonePermission = 'granted';
                audioStream.getTracks().forEach(track => track.stop());
                console.log('✅ Solo micrófono autorizado');
            } catch (audioError) {
                results.errors.push(`Micrófono: ${audioError.name}`);
                this.microphonePermission = 'denied';
            }
        }

        return results;
    }

    /**
     * Verificar estado actual de permisos
     */
    async checkPermissions() {
        if (!navigator.permissions) {
            return { camera: 'unknown', microphone: 'unknown' };
        }

        try {
            const [camera, microphone] = await Promise.all([
                navigator.permissions.query({ name: 'camera' }),
                navigator.permissions.query({ name: 'microphone' })
            ]);

            return {
                camera: camera.state,
                microphone: microphone.state
            };
        } catch (error) {
            console.warn('No se pudo verificar permisos:', error);
            return { camera: 'unknown', microphone: 'unknown' };
        }
    }

    /**
     * Generar recomendaciones específicas para el usuario
     */
    getRecommendations() {
        const recommendations = [];
        const { deviceInfo, browserInfo } = this;

        if (deviceInfo.isIOS) {
            if (!browserInfo.isSafari) {
                recommendations.push({
                    type: 'browser',
                    title: 'Usa Safari para mejor AR',
                    description: 'Safari en iOS ofrece la mejor compatibilidad con WebXR',
                    action: 'Abrir en Safari'
                });
            }
            
            if (deviceInfo.iosVersion < 14.3) {
                recommendations.push({
                    type: 'system',
                    title: 'Actualiza iOS',
                    description: 'WebXR requiere iOS 14.3 o superior',
                    action: 'Ir a Configuración > General > Actualización'
                });
            }
        }

        if (deviceInfo.isAndroid) {
            if (!browserInfo.isChrome) {
                recommendations.push({
                    type: 'browser',
                    title: 'Usa Chrome Android',
                    description: 'Chrome Android ofrece la mejor compatibilidad con WebXR',
                    action: 'Descargar Chrome'
                });
            }
            
            if (browserInfo.isChrome && browserInfo.chromeVersion < 81) {
                recommendations.push({
                    type: 'browser',
                    title: 'Actualiza Chrome',
                    description: 'WebXR requiere Chrome 81 o superior',
                    action: 'Actualizar Chrome'
                });
            }

            if (browserInfo.isChrome && browserInfo.chromeVersion >= 81) {
                recommendations.push({
                    type: 'settings',
                    title: 'Activar WebXR',
                    description: 'Puede requerir activación manual en Chrome',
                    action: 'Ir a chrome://flags/#webxr-incubations'
                });
            }
        }

        if (!deviceInfo.isMobile) {
            recommendations.push({
                type: 'device',
                title: 'Usa un dispositivo móvil',
                description: 'AR funciona mejor en teléfonos y tablets',
                action: 'Abrir en móvil'
            });
        }

        return recommendations;
    }

    /**
     * Inicializar manager completo
     */
    async init() {
        console.log('🔧 Inicializando Compatibility Manager...');
        
        // Verificar soporte AR
        const arSupport = await this.checkARSupport();
        
        // Verificar permisos actuales
        const permissions = await this.checkPermissions();
        
        // Generar recomendaciones
        const recommendations = this.getRecommendations();
        
        this.isInitialized = true;
        
        const result = {
            deviceInfo: this.deviceInfo,
            browserInfo: this.browserInfo,
            arSupport,
            permissions,
            recommendations,
            canUseAR: arSupport.immersiveAR && arSupport.recommended,
            needsFallback: !arSupport.immersiveAR || !arSupport.recommended
        };
        
        console.log('✅ Compatibility Manager inicializado:', result);
        return result;
    }
}
