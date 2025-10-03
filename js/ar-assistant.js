/**
 * AR Assistant - Clase principal que integra todos los componentes
 * Maneja compatibilidad, permisos, AR nativo y fallback
 */

import { CompatibilityManager } from './compatibility-manager.js';
import { FallbackManager } from './fallback-manager.js';

export class ARAssistant {
    constructor() {
        // Managers
        this.compatibilityManager = new CompatibilityManager();
        this.fallbackManager = null;
        this.model3DManager = null;
        this.speechManager = null;
        this.geminiClient = null;
        
        // Estado
        this.isInitialized = false;
        this.currentMode = 'preview'; // 'preview', 'ar', 'fallback'
        this.compatibilityInfo = null;
        this.permissionsGranted = false;
        
        // UI Elements
        this.ui = {
            loadingScreen: null,
            permissionModal: null,
            arButton: null,
            statusDisplay: null,
            mainControls: null
        };
    }

    /**
     * Inicializar asistente completo
     */
    async init() {
        try {
            console.log('🚀 Inicializando AR Assistant...');
            
            // 1. Obtener referencias UI
            this.setupUIReferences();
            
            // 2. Mostrar loading
            this.showLoading('Verificando compatibilidad...');
            
            // 3. Verificar compatibilidad
            this.compatibilityInfo = await this.compatibilityManager.init();
            console.log('📊 Info de compatibilidad:', this.compatibilityInfo);
            
            // 4. Mostrar modal de permisos con información específica
            await this.showPermissionModal();
            
            // 5. Inicializar componentes base
            await this.initializeComponents();
            
            // 6. Configurar UI según compatibilidad
            this.setupUIForCompatibility();
            
            // 7. Ocultar loading
            this.hideLoading();
            
            this.isInitialized = true;
            console.log('✅ AR Assistant inicializado');
            
        } catch (error) {
            console.error('❌ Error inicializando AR Assistant:', error);
            this.showError('Error de inicialización: ' + error.message);
        }
    }

    /**
     * Configurar referencias UI
     */
    setupUIReferences() {
        this.ui.loadingScreen = document.getElementById('loadingScreen');
        this.ui.permissionModal = document.getElementById('permissionModal');
        this.ui.arButton = document.getElementById('arBtn');
        this.ui.statusDisplay = document.getElementById('statusDisplay');
        this.ui.mainControls = document.getElementById('mainControls');
        
        // Event listeners básicos
        document.getElementById('requestPermissions')?.addEventListener('click', () => {
            this.handlePermissionRequest();
        });
        
        this.ui.arButton?.addEventListener('click', () => {
            this.handleARButtonClick();
        });
    }

    /**
     * Mostrar modal de permisos con información específica
     */
    async showPermissionModal() {
        return new Promise((resolve) => {
            const modal = this.ui.permissionModal;
            if (!modal) return resolve();

            // Actualizar contenido según compatibilidad
            const content = modal.querySelector('.modal-content');
            if (content) {
                content.innerHTML = this.generatePermissionModalContent();
            }

            // Mostrar modal
            modal.style.display = 'flex';

            // Configurar botón
            const requestBtn = document.getElementById('requestPermissions');
            if (requestBtn) {
                requestBtn.onclick = async () => {
                    await this.handlePermissionRequest();
                    modal.style.display = 'none';
                    resolve();
                };
            }
        });
    }

    /**
     * Generar contenido del modal según compatibilidad
     */
    generatePermissionModalContent() {
        const { compatibilityInfo } = this;
        const { deviceInfo, browserInfo, arSupport, recommendations } = compatibilityInfo;
        
        let arStatusHtml = '';
        let recommendationsHtml = '';
        
        // Estado AR
        if (arSupport.immersiveAR && arSupport.recommended) {
            arStatusHtml = `
                <div style="color: #34C759; margin: 10px 0;">
                    ✅ AR Nativo Disponible
                </div>
            `;
        } else if (arSupport.immersiveAR && !arSupport.recommended) {
            arStatusHtml = `
                <div style="color: #FF9500; margin: 10px 0;">
                    ⚠️ AR Experimental (puede tener limitaciones)
                </div>
            `;
        } else {
            arStatusHtml = `
                <div style="color: #FF3B30; margin: 10px 0;">
                    ❌ AR Nativo No Disponible
                    <br><small>Se usará modo simulado con cámara</small>
                </div>
            `;
        }
        
        // Recomendaciones
        if (recommendations.length > 0) {
            recommendationsHtml = `
                <div style="margin: 15px 0; padding: 10px; background: rgba(255,149,0,0.1); border-radius: 8px;">
                    <strong>💡 Recomendaciones:</strong>
                    ${recommendations.map(rec => `
                        <div style="margin: 5px 0; font-size: 14px;">
                            • ${rec.description}
                        </div>
                    `).join('')}
                </div>
            `;
        }

        return `
            <h3>🤖 Asistente Virtual AR</h3>
            <p>Dispositivo: ${deviceInfo.isIOS ? 'iOS' : deviceInfo.isAndroid ? 'Android' : 'Desktop'} 
               ${browserInfo.isChrome ? 'Chrome' : browserInfo.isSafari ? 'Safari' : 'Otro navegador'}</p>
            
            ${arStatusHtml}
            ${recommendationsHtml}
            
            <div class="permissions-list">
                <div class="permission-item">📷 Cámara (Realidad Aumentada)</div>
                <div class="permission-item">🎤 Micrófono (Comandos de voz)</div>
                <div class="permission-item">🤖 IA Gemini (Chat inteligente)</div>
            </div>
            
            <button id="requestPermissions" class="permission-btn">
                ${arSupport.immersiveAR ? 'Activar Asistente AR' : 'Activar Asistente (Modo Simulado)'}
            </button>
        `;
    }

    /**
     * Manejar solicitud de permisos
     */
    async handlePermissionRequest() {
        try {
            this.showLoading('Solicitando permisos...');
            
            const results = await this.compatibilityManager.requestPermissions();
            console.log('🔐 Resultados permisos:', results);
            
            if (results.camera || results.microphone) {
                this.permissionsGranted = true;
                this.updateStatus('✅ Permisos concedidos');
            } else {
                this.showPermissionError(results.errors);
                return;
            }
            
        } catch (error) {
            console.error('❌ Error solicitando permisos:', error);
            this.showPermissionError([error.message]);
        }
    }

    /**
     * Mostrar error de permisos con instrucciones específicas
     */
    showPermissionError(errors) {
        const { deviceInfo, browserInfo } = this.compatibilityInfo;
        
        let instructions = 'No se pudieron obtener los permisos necesarios.';
        
        if (deviceInfo.isIOS) {
            instructions = `
                <strong>Instrucciones para iOS:</strong><br>
                1. Ve a Configuración > Safari > Cámara y Micrófono<br>
                2. Selecciona "Permitir"<br>
                3. Recarga esta página<br><br>
                O prueba abriendo en Chrome iOS si está disponible.
            `;
        } else if (deviceInfo.isAndroid) {
            instructions = `
                <strong>Instrucciones para Android:</strong><br>
                1. Toca el ícono de candado en la barra de direcciones<br>
                2. Permite Cámara y Micrófono<br>
                3. Recarga la página<br><br>
                ${!browserInfo.isChrome ? 'Recomendamos usar Chrome Android para mejor compatibilidad.' : ''}
            `;
        }
        
        this.showError(`
            ${instructions}<br><br>
            <small>Errores: ${errors.join(', ')}</small>
        `);
    }

    /**
     * Inicializar componentes base
     */
    async initializeComponents() {
        // Aquí se inicializarían los otros managers
        // Por ahora solo simulamos la carga
        this.showLoading('Cargando modelo 3D...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        this.showLoading('Conectando IA...');
        await new Promise(resolve => setTimeout(resolve, 500));
        
        this.showLoading('Configurando voz...');
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    /**
     * Configurar UI según compatibilidad
     */
    setupUIForCompatibility() {
        const { arSupport } = this.compatibilityInfo;
        
        if (this.ui.arButton) {
            if (arSupport.immersiveAR) {
                // AR nativo disponible
                this.ui.arButton.innerHTML = `
                    <span class="btn-icon">🕶️</span>
                    <span class="btn-text">AR Nativo</span>
                `;
                this.ui.arButton.style.background = '#34C759';
            } else {
                // Solo fallback disponible
                this.ui.arButton.innerHTML = `
                    <span class="btn-icon">📱</span>
                    <span class="btn-text">AR Simulado</span>
                `;
                this.ui.arButton.style.background = '#FF9500';
            }
        }
        
        // Actualizar status
        this.updateStatus(this.getCompatibilityStatusText());
    }

    /**
     * Obtener texto de estado según compatibilidad
     */
    getCompatibilityStatusText() {
        const { arSupport, deviceInfo } = this.compatibilityInfo;
        
        if (arSupport.immersiveAR && arSupport.recommended) {
            return '🕶️ AR Nativo Listo';
        } else if (arSupport.immersiveAR && !arSupport.recommended) {
            return '⚠️ AR Experimental Disponible';
        } else {
            return `📱 Modo Simulado (${deviceInfo.isIOS ? 'iOS' : 'Android'})`;
        }
    }

    /**
     * Manejar click en botón AR
     */
    async handleARButtonClick() {
        if (!this.permissionsGranted) {
            this.showError('Primero debes conceder los permisos necesarios');
            return;
        }

        const { arSupport } = this.compatibilityInfo;
        
        if (arSupport.immersiveAR) {
            await this.startNativeAR();
        } else {
            await this.startFallbackAR();
        }
    }

    /**
     * Iniciar AR nativo
     */
    async startNativeAR() {
        try {
            console.log('🕶️ Iniciando AR nativo...');
            this.updateStatus('Iniciando AR nativo...');
            
            // Aquí se iniciaría el AR nativo real
            // Por ahora simulamos
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            this.currentMode = 'ar';
            this.updateStatus('🕶️ AR Nativo Activo');
            
        } catch (error) {
            console.error('❌ Error AR nativo:', error);
            this.showError('Error iniciando AR nativo: ' + error.message);
            
            // Fallback automático
            console.log('🔄 Intentando fallback...');
            await this.startFallbackAR();
        }
    }

    /**
     * Iniciar AR fallback
     */
    async startFallbackAR() {
        try {
            console.log('📱 Iniciando AR simulado...');
            this.updateStatus('Iniciando AR simulado...');
            
            // Inicializar fallback manager si no existe
            if (!this.fallbackManager) {
                this.fallbackManager = new FallbackManager(this.model3DManager);
                await this.fallbackManager.init();
            }
            
            await this.fallbackManager.start();
            
            this.currentMode = 'fallback';
            this.updateStatus('📱 AR Simulado Activo');
            
        } catch (error) {
            console.error('❌ Error AR fallback:', error);
            this.showError('Error iniciando AR simulado: ' + error.message);
        }
    }

    /**
     * Detener AR
     */
    stopAR() {
        if (this.currentMode === 'fallback' && this.fallbackManager) {
            this.fallbackManager.stop();
        }
        
        this.currentMode = 'preview';
        this.updateStatus(this.getCompatibilityStatusText());
    }

    /**
     * Utilidades UI
     */
    showLoading(message) {
        if (this.ui.loadingScreen) {
            this.ui.loadingScreen.style.display = 'flex';
            const text = this.ui.loadingScreen.querySelector('p');
            if (text) text.textContent = message;
        }
    }

    hideLoading() {
        if (this.ui.loadingScreen) {
            this.ui.loadingScreen.style.display = 'none';
        }
    }

    updateStatus(message) {
        const statusElement = document.getElementById('appStatus');
        if (statusElement) {
            statusElement.textContent = message;
        }
    }

    showError(message) {
        this.hideLoading();
        alert(message); // Temporal - se podría mejorar con modal personalizado
    }

    /**
     * Limpiar recursos
     */
    dispose() {
        if (this.fallbackManager) {
            this.fallbackManager.dispose();
        }
        
        console.log('🗑️ AR Assistant limpiado');
    }
}

// Inicializar cuando el DOM esté listo
let arAssistant = null;

function initApp() {
    arAssistant = new ARAssistant();
    arAssistant.init().catch(console.error);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

// Limpiar al cerrar
window.addEventListener('beforeunload', () => {
    if (arAssistant) {
        arAssistant.dispose();
    }
});
