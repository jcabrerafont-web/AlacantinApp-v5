// ============================================================================
// ALACANTINAPP V6 - LÓGICA DE NEGOCIO, SUPABASE AUTH, RBAC Y OFFLINE-FIRST
// Club Gallina Alacantina (Código Oficial ESGA025)
// Cumplimiento: Protocolo CNZ (5 de junio de 2025), RD 45/2019, Reg. UE 2016/1012
// ============================================================================

// Espacio de nombres principal de la aplicación
const app = {
  // Configuración de Supabase
  supabaseUrl: localStorage.getItem('alacantina_supabase_url') || '',
  supabaseKey: localStorage.getItem('alacantina_supabase_key') || '',
  supabaseClient: null,

  // Generador de estructura limpia de estado en memoria (sin datos residuales ni valores mock)
  obtenerEstadoInicialLimpio() {
    return {
      usuarioActivo: null,
      usuarioActual: null,
      modoVisitante: true,
      usuarios: [],
      solicitudesInspeccion: [],
      animales: [],
      explotaciones: [],
      aviario: null,
      aviarioActivo: null,
      gpsAviarioTemporal: null,
      editandoAviarioId: null,
      inspecciones: [],
      controlesPuesta: [],
      lotes: [],
      lotesIncubacion: [],
      bancoGermoplasma: [],
      syncQueue: [],
      animalSeleccionadoId: null,
      fotosCapturadas: {
        lateral: null,
        cabeza: null,
        tarsos: null
      },
      fotosOpcionalesCapturadas: [],
      gpsUbicacion: null,
      filtros: {
        busqueda: '',
        seccion: 'TODAS',
        sexo: 'TODOS',
        familia: 'TODAS',
        variedad: 'TODAS',
        rega: 'TODOS',
        edad: 'TODAS',
        etiquetaGaleria: ''
      },
      rfid: {
        dispositivo: null,
        caracteristicaTx: null,
        lectorSerial: null,
        tipoConexion: null,
        estado: 'desconectado',
        nombreDispositivo: null,
        ultimoChipLeido: null,
        ultimaLecturaTs: null,
        animalDetectado: null,
        sonidoActivo: true,
        bufferRecepcion: '',
        historialEntradas: []
      },
      inspeccionInSitu: {
        rolRBAC: 'visitante',
        modoExteriorSolar: false,
        animalActualId: null,
        dictamenSeleccionado: 'APTO_RD',
        dictamenManual: false,
        defectos: {
          orejilla: false,
          pecho: false,
          cola: false,
          tarsos: false,
          flameado: false
        },
        firmaBase64: null,
        firmaConfirmada: false,
        trazosFirma: 0,
        gpsInSitu: {
          latitud: null,
          longitud: null,
          precision_m: null
        },
        regionGuiaActiva: 1,
        actaSeleccionada: null
      }
    };
  },

  // Estado reactivo de la aplicación
  estado: {
    usuarioActivo: null,
    usuarioActual: null,
    modoVisitante: true,
    usuarios: [],
    solicitudesInspeccion: [],
    animales: [],
    explotaciones: [],
    aviario: null,
    aviarioActivo: null,
    gpsAviarioTemporal: null,
    editandoAviarioId: null,
    inspecciones: [],
    controlesPuesta: [],
    lotes: [],
    lotesIncubacion: [],
    bancoGermoplasma: [],
    syncQueue: [],
    animalSeleccionadoId: null,
    fotosCapturadas: {
      lateral: null,
      cabeza: null,
      tarsos: null
    },
    fotosOpcionalesCapturadas: [],
    gpsUbicacion: null,
    filtros: {
      busqueda: '',
      seccion: 'TODAS',
      sexo: 'TODOS',
      familia: 'TODAS',
      variedad: 'TODAS',
      rega: 'TODOS',
      edad: 'TODAS',
      etiquetaGaleria: ''
    },
    // Estado reactivo del módulo RFID y Ponederos Inteligentes (Fase 5)
    rfid: {
      dispositivo: null,       // Instancia BluetoothDevice o SerialPort
      caracteristicaTx: null,  // BluetoothRemoteGATTCharacteristic
      lectorSerial: null,      // ReadableStreamDefaultReader
      tipoConexion: null,      // 'bluetooth' | 'serial' | 'manual'
      estado: 'desconectado',  // 'desconectado' | 'buscando' | 'conectado'
      nombreDispositivo: null,
      ultimoChipLeido: null,
      ultimaLecturaTs: null,
      animalDetectado: null,
      sonidoActivo: true,
      bufferRecepcion: '',
      historialEntradas: []
    },
    // Estado reactivo del Modo Inspección Zootécnica In Situ y Guía de Campo (Fase 6)
    inspeccionInSitu: {
      rolRBAC: 'visitante',
      modoExteriorSolar: false,
      animalActualId: null,
      dictamenSeleccionado: 'APTO_RD',
      dictamenManual: false,
      defectos: {
        orejilla: false,
        pecho: false,
        cola: false,
        tarsos: false,
        flameado: false
      },
      firmaBase64: null,
      firmaConfirmada: false,
      trazosFirma: 0,
      gpsInSitu: {
        latitud: null,
        longitud: null,
        precision_m: null
      },
      regionGuiaActiva: 1,
      actaSeleccionada: null
    }
  },
  chartsPuesta: {
    intensidad: null,
    peso: null,
    cascara: null
  },

  // =========================================================================
  // 1. INICIALIZACIÓN DE LA APLICACIÓN Y BASE DE DATOS LOCAL (INDEXEDDB)
  // =========================================================================
  async init() {
    console.log('[AlacantinApp] Iniciando aplicación v6 (ESGA025 - Supabase Auth & RBAC)...');
    
    // Iniciar IndexedDB local
    await this.db.init();

    // Iniciar cliente de Supabase si hay credenciales configuradas
    this.iniciarSupabaseClient();

    // Registrar observadores de red online/offline
    this.configurarObservadoresRed();

    // Asegurar semilla inicial en IndexedDB antes de autenticar y filtrar por usuario
    await this.asegurarSemillaBaseIndexedDB();

    // Inicializar sesión persistente V6 (Supabase Auth / LocalStorage Offline)
    await this.inicializarSesionAuthV6();

    // Cargar y filtrar datos desde IndexedDB estrictamente para el usuario activo
    await this.cargarDatos();

    // Sobrescribir estrictamente app.estado.aviario y app.estado.aviarioActivo con el REGA y GPS del usuario logueado
    await this.inicializarAviarioActivo();

    // Re-filtrar colecciones una vez vinculado el aviario del usuario activo
    await this.cargarDatos();

    // Actualizar interfaz inicial
    this.poblarSelectores();
    this.actualizarReglasSexo();
    this.renderizarCenso();
    this.actualizarKPIs();
    this.recalcularBaremo();
    this.renderizarLotes();
    this.poblarSimuladorAcoplamientos();
    this.renderizarModuloIncubacion();
    this.renderizarModuloGermoplasma();
    this.actualizarBadgeAviario();
    this.actualizarVistaRegistroAviario();
    this.renderizarGaleriaOpcionalAlta();
    this.configurarEventosExportacion();
    this.poblarSelectoresAnaliticaPuesta();
    this.renderizarAnaliticaPuesta();
    this.configurarWedgeRfid();
    this.poblarSelectoresRfid();
    this.inicializarModuloInspeccionInSitu();
    this.sincronizarInputsInspectorAutenticado();

    // Actualizar Pastilla de Usuario, Permisos RBAC, Solicitudes y Panel Admin (V6)
    this.actualizarPastillaUsuario();
    this.aplicarPermisosRBAC();
    this.renderizarSolicitudesInspeccion();
    this.renderizarTablaUsuariosAdmin();

    // Cerrar menú desplegable "Mi Cuenta" al hacer clic fuera
    document.addEventListener('click', (e) => {
      const wrapper = document.getElementById('user-account-menu-container') || document.getElementById('user-account-wrapper');
      const dropdown = document.getElementById('dropdown-mi-cuenta');
      if (wrapper && dropdown && !dropdown.classList.contains('hidden')) {
        if (!wrapper.contains(e.target)) {
          dropdown.classList.add('hidden');
        }
      }
    });

    // Comprobar si hay hash en la URL para cambiar de pestaña directamente
    const hash = window.location.hash.replace('#', '');
    if (hash === 'puesta') {
      this.cambiarTab('inspeccion');
    } else if (['registro', 'censo', 'inspeccion', 'pedigri', 'lotes', 'mapa-gis', 'germoplasma', 'inspeccion-insitu', 'admin'].includes(hash)) {
      this.cambiarTab(hash);
    }
  },

  // Módulo de Base de Datos IndexedDB
  db: {
    dbName: 'AlacantinDB_v5',
    version: 4,
    instance: null,

    init() {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(this.dbName, this.version);

        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('animales')) {
            db.createObjectStore('animales', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('explotaciones')) {
            db.createObjectStore('explotaciones', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('inspecciones')) {
            db.createObjectStore('inspecciones', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('controlesPuesta')) {
            db.createObjectStore('controlesPuesta', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('lotes')) {
            db.createObjectStore('lotes', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('lotesIncubacion')) {
            db.createObjectStore('lotesIncubacion', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('bancoGermoplasma')) {
            db.createObjectStore('bancoGermoplasma', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('syncQueue')) {
            db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
          }
          if (!db.objectStoreNames.contains('usuarios')) {
            db.createObjectStore('usuarios', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('solicitudesInspeccion')) {
            db.createObjectStore('solicitudesInspeccion', { keyPath: 'id' });
          }
        };

        req.onsuccess = (e) => {
          this.instance = e.target.result;
          resolve(this.instance);
        };

        req.onerror = (e) => {
          console.error('[IndexedDB] Error al abrir:', e);
          reject(e);
        };
      });
    },

    getAll(storeName) {
      return new Promise((resolve) => {
        const tx = this.instance.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });
    },

    put(storeName, item) {
      return new Promise((resolve, reject) => {
        const tx = this.instance.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const req = store.put(item);
        req.onsuccess = () => resolve(req.result);
        req.onerror = (err) => reject(err);
      });
    },

    putBatch(storeName, items) {
      return new Promise((resolve, reject) => {
        const tx = this.instance.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        items.forEach(item => store.put(item));
        tx.oncomplete = () => resolve();
        tx.onerror = (err) => reject(err);
      });
    },

    clear(storeName) {
      return new Promise((resolve) => {
        const tx = this.instance.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        store.clear();
        tx.oncomplete = () => resolve();
      });
    },

    delete(storeName, key) {
      return new Promise((resolve) => {
        const tx = this.instance.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        store.delete(key);
        tx.oncomplete = () => resolve();
      });
    }
  },

  // Configuración de Supabase y observador reactivo de sesión Auth
  iniciarSupabaseClient() {
    if (this.supabaseUrl && this.supabaseKey && window.supabase) {
      try {
        this.supabaseClient = window.supabase.createClient(this.supabaseUrl, this.supabaseKey);
        console.log('[Supabase] Cliente inicializado.');

        if (this.supabaseClient.auth && typeof this.supabaseClient.auth.onAuthStateChange === 'function') {
          this.supabaseClient.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_OUT') {
              this.estado.usuarioActivo = null;
              this.estado.usuarioActual = null;
              this.estado.aviarioActivo = null;
              this.estado.aviario = null;
              this.estado.animales = [];
              this.estado.explotaciones = [];
              this.estado.controlesPuesta = [];
              this.estado.lotes = [];
              this.actualizarPastillaUsuario();
              this.actualizarBadgeAviario();
              this.actualizarVistaRegistroAviario();
              this.aplicarPermisosRBAC();
            } else if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') && session?.user) {
              const perfil = await this.sincronizarUsuarioDesdeAuth(session.user);
              if (perfil) {
                this.estado.usuarioActivo = perfil;
                this.estado.usuarioActual = perfil;
                this.estado.modoVisitante = false;
                localStorage.setItem('alacantina_v6_session', JSON.stringify(perfil));
                await this.inicializarAviarioActivo();
                await this.cargarDatos();
                this.actualizarPastillaUsuario();
                this.actualizarBadgeAviario();
                this.actualizarVistaRegistroAviario();
                this.aplicarPermisosRBAC();
                this.sincronizarInputsInspectorAutenticado();
              }
            }
          });
        }
      } catch (err) {
        console.warn('[Supabase] No se pudo inicializar cliente:', err);
        this.supabaseClient = null;
      }
    }
  },

  // Observador de conectividad en tiempo real
  configurarObservadoresRed() {
    const actualizarEstado = () => {
      const banner = document.getElementById('offline-banner');
      const badge = document.getElementById('net-status-badge');
      const text = document.getElementById('net-status-text');

      if (navigator.onLine) {
        if (banner) banner.classList.add('hidden');
        if (badge) {
          badge.className = 'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-950 text-emerald-400 border border-emerald-800';
        }
        if (text) text.textContent = this.supabaseClient ? 'Online (Supabase)' : 'Online (Local)';
        // Al recuperar conexión, disparar sincronización de cola pendiente
        this.sincronizarCola(false);
      } else {
        if (banner) banner.classList.remove('hidden');
        if (badge) {
          badge.className = 'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-950 text-amber-400 border border-amber-800';
        }
        if (text) text.textContent = 'Offline (SyncQueue)';
      }
    };

    window.addEventListener('online', actualizarEstado);
    window.addEventListener('offline', actualizarEstado);
    actualizarEstado();
  },

  // =========================================================================
  // 2. CARGA, AISLAMIENTO MULTIUSUARIO Y SINCRONIZACIÓN DE DATOS (LOCAL + NUBE)
  // =========================================================================

  // Asegura que IndexedDB tenga la semilla base de la aplicación sin cargar en memoria datos de otro usuario
  async asegurarSemillaBaseIndexedDB() {
    let animalesLocales = await this.db.getAll('animales');
    if (!animalesLocales || animalesLocales.length === 0) {
      await this.cargarSemillaInicial(false);
    }

    let controlesLocales = await this.db.getAll('controlesPuesta');
    if (!controlesLocales || controlesLocales.length === 0) {
      await this.db.putBatch('controlesPuesta', this.obtenerControlesPuestaSemilla());
    }

    let usuariosLocales = await this.db.getAll('usuarios');
    if (!usuariosLocales || usuariosLocales.length === 0) {
      await this.db.putBatch('usuarios', this.obtenerUsuariosSemillaV6());
    }

    let solicitudesLocales = await this.db.getAll('solicitudesInspeccion');
    if (!solicitudesLocales || solicitudesLocales.length === 0) {
      await this.db.putBatch('solicitudesInspeccion', this.obtenerSolicitudesInspeccionSemillaV6());
    }

    let lotesIncLocales = await this.db.getAll('lotesIncubacion');
    if (!lotesIncLocales || lotesIncLocales.length === 0) {
      await this.db.putBatch('lotesIncubacion', this.obtenerLotesIncubacionSemilla());
    }

    let germoLocales = await this.db.getAll('bancoGermoplasma');
    if (!germoLocales || germoLocales.length === 0) {
      await this.db.putBatch('bancoGermoplasma', this.obtenerGermoplasmaSemilla());
    }
  },

  // Determina si un registro de IndexedDB (animal, explotación, control de puesta, lote) pertenece al usuario activo
  perteneceAUsuarioActivo(registro, usuario = null, aviario = null) {
    if (!registro) return false;
    const u = usuario || this.estado.usuarioActivo;

    // Si está en Modo Visitante (solo lectura del censo público), permitir lectura pública
    if (!u) {
      return Boolean(this.estado.modoVisitante);
    }

    // Inspectores Zootécnicos y Administradores tienen visibilidad global de auditoría
    if (u.rol === 'admin' || u.rol === 'inspector') {
      return true;
    }

    const av = aviario || this.estado.aviario || this.estado.aviarioActivo;

    // 1. Coincidencia directa por user.id (usuario_id)
    if (registro.usuario_id && u.id) {
      return String(registro.usuario_id) === String(u.id);
    }

    // 2. Coincidencia por explotación vinculada al usuario
    const expIdUsuario = av?.id || u.explotacion_id;
    if (expIdUsuario) {
      if (registro.explotacion_id && String(registro.explotacion_id) === String(expIdUsuario)) {
        return true;
      }
      if (registro.id && String(registro.id) === String(expIdUsuario)) {
        return true;
      }
    }

    // 3. Coincidencia por código REGA oficial (siempre que no sea provisional genérico de otro usuario)
    const regaUsuario = (av?.codigo_rega || av?.rega || u.rega || '').trim().toUpperCase();
    const regaRegistro = (registro.codigo_rega || registro.rega || '').trim().toUpperCase();
    if (regaUsuario && regaRegistro && regaUsuario !== 'TEMP-REGA-001' && regaUsuario === regaRegistro) {
      return true;
    }

    // 4. Si el registro es un control de puesta o lote vinculado a un animal propio
    if (registro.animal_id && Array.isArray(this.estado.animales)) {
      const animalPropio = this.estado.animales.find(a => a.id === registro.animal_id);
      if (animalPropio) return true;
    }

    return false;
  },

  async cargarDatos() {
    await this.asegurarSemillaBaseIndexedDB();

    let animalesLocales = await this.db.getAll('animales');
    let explotacionesLocales = await this.db.getAll('explotaciones');
    let inspeccionesLocales = await this.db.getAll('inspecciones');
    let controlesLocales = await this.db.getAll('controlesPuesta');
    let lotesLocales = await this.db.getAll('lotes');
    let lotesIncLocales = await this.db.getAll('lotesIncubacion');
    let germoLocales = await this.db.getAll('bancoGermoplasma');
    let usuariosLocales = await this.db.getAll('usuarios');
    let solicitudesLocales = await this.db.getAll('solicitudesInspeccion');
    this.estado.syncQueue = await this.db.getAll('syncQueue');

    // Garantizar que los ejemplares semilla tengan sus metadatos de propietario y galerías actualizados
    const galeriasSemilla = {
      'alac-001': [
        { url: './icons/logo.png', titulo: 'Exposición 2026 - Campeón Adulto' },
        { url: './icons/icon-512.png', titulo: 'Detalle de cresta y orejilla' }
      ],
      'alac-002': [
        { url: './icons/icon-192.png', titulo: 'Premio Especial Hembra Fundadora' },
        { url: './icons/logo.png', titulo: 'Detalle de ala y remeras' }
      ],
      'alac-003': [
        { url: './icons/logo.png', titulo: 'Exposición 2026 Crevillent' },
        { url: './icons/icon-192.png', titulo: 'Tarsos y porte erguido 70º' }
      ],
      'alac-004': [
        { url: './icons/icon-512.png', titulo: 'Muda otoñal de plumaje' },
        { url: './icons/logo.png', titulo: 'Premio Mejor Puesta 2025' }
      ],
      'alac-005': [
        { url: './icons/icon-192.png', titulo: 'Detalle de ala en crecimiento' },
        { url: './icons/logo.png', titulo: 'Muda juvenil primaveral' }
      ],
      'alac-006': [
        { url: './icons/icon-512.png', titulo: 'Exposición 2026 Joven Promesa' },
        { url: './icons/logo.png', titulo: 'Tarsos sin plumas descalificantes' }
      ]
    };

    const rfidSemilla = {
      'alac-001': '968000010000001',
      'alac-002': '968000010000002',
      'alac-003': '968000010000045',
      'alac-004': '968000010000046',
      'alac-005': '968000010000142',
      'alac-006': '968000010000143'
    };

    if (explotacionesLocales && explotacionesLocales.length > 0) {
      for (const exp of explotacionesLocales) {
        let modExp = false;
        if (exp.id === 'exp-01' && (!exp.usuario_id || exp.codigo_rega === 'ES030140000001')) {
          exp.usuario_id = 'usr-criador-01';
          exp.codigo_rega = 'ES030140001234';
          exp.rega = 'ES030140001234';
          exp.nombre_titular = 'Juan Pérez Soler';
          modExp = true;
        } else if (exp.id === 'exp-02' && !exp.usuario_id) {
          exp.usuario_id = 'usr-aspirante-02';
          exp.codigo_rega = 'TEMP-REGA-001';
          exp.rega = 'TEMP-REGA-001';
          exp.nombre_titular = 'Pedro García Orts';
          modExp = true;
        }
        if (modExp) await this.db.put('explotaciones', exp);
      }
    }

    if (animalesLocales && animalesLocales.length > 0) {
      for (const a of animalesLocales) {
        let modificado = false;
        if (galeriasSemilla[a.id]) {
          const galActual = a.fotos?.galeria_opcional || a.multimedia_urls?.galeria_opcional || [];
          if (!Array.isArray(galActual) || galActual.length === 0) {
            if (!a.fotos) a.fotos = {};
            if (!a.multimedia_urls) a.multimedia_urls = {};
            a.fotos.galeria_opcional = galeriasSemilla[a.id];
            a.multimedia_urls.galeria_opcional = galeriasSemilla[a.id];
            modificado = true;
          }
        }
        if (!a.rfid_chip_id && rfidSemilla[a.id]) {
          a.rfid_chip_id = rfidSemilla[a.id];
          modificado = true;
        }
        if (!a.usuario_id) {
          if (a.explotacion_id === 'exp-01') {
            a.usuario_id = 'usr-criador-01';
            a.codigo_rega = a.codigo_rega || 'ES030140001234';
            a.titular_nombre = a.titular_nombre || 'Juan Pérez Soler';
            modificado = true;
          } else if (a.explotacion_id === 'exp-02') {
            a.usuario_id = 'usr-aspirante-02';
            a.codigo_rega = a.codigo_rega || 'TEMP-REGA-001';
            a.titular_nombre = a.titular_nombre || 'Pedro García Orts';
            modificado = true;
          }
        }
        if (modificado) {
          await this.db.put('animales', a);
        }
      }
    }

    // AISLAMIENTO MULTIUSUARIO EN MEMORIA (filtrar estrictamente por el user.id activo)
    const u = this.estado.usuarioActivo;
    this.estado.usuarios = usuariosLocales;
    this.estado.inspecciones = inspeccionesLocales;

    if (!u && !this.estado.modoVisitante) {
      // Sin sesión ni modo visitante activo: memoria de datos de usuario vacía
      this.estado.animales = [];
      this.estado.explotaciones = [];
      this.estado.controlesPuesta = [];
      this.estado.lotes = [];
      this.estado.lotesIncubacion = [];
      this.estado.bancoGermoplasma = [];
      this.estado.solicitudesInspeccion = [];
    } else if (this.estado.modoVisitante || u?.rol === 'admin' || u?.rol === 'inspector') {
      // Modo Visitante (solo lectura del censo público) o Inspector/Admin (auditoría global)
      this.estado.explotaciones = explotacionesLocales;
      this.estado.animales = animalesLocales;
      this.estado.controlesPuesta = controlesLocales;
      this.estado.lotes = lotesLocales;
      this.estado.lotesIncubacion = lotesIncLocales;
      this.estado.bancoGermoplasma = germoLocales;
      this.estado.solicitudesInspeccion = solicitudesLocales;
    } else {
      // Criador Oficial o Aspirante: filtrar estrictamente por su user.id y su explotación
      this.estado.explotaciones = explotacionesLocales.filter(e => this.perteneceAUsuarioActivo(e, u));
      const avPropio = this.estado.aviario || this.estado.aviarioActivo || this.estado.explotaciones[0] || null;
      this.estado.animales = animalesLocales.filter(a => this.perteneceAUsuarioActivo(a, u, avPropio));
      const idsAnimalesPropios = new Set(this.estado.animales.map(a => a.id));
      this.estado.controlesPuesta = controlesLocales.filter(
        c => this.perteneceAUsuarioActivo(c, u, avPropio) || idsAnimalesPropios.has(c.animal_id)
      );
      this.estado.lotes = lotesLocales.filter(l => this.perteneceAUsuarioActivo(l, u, avPropio));
      this.estado.lotesIncubacion = lotesIncLocales.filter(li => this.perteneceAUsuarioActivo(li, u, avPropio));
      this.estado.bancoGermoplasma = germoLocales.filter(g => this.perteneceAUsuarioActivo(g, u, avPropio));
      this.estado.solicitudesInspeccion = solicitudesLocales.filter(
        s => String(s.usuario_id) === String(u.id) || (u.rega && s.codigo_rega === u.rega)
      );
    }

    // Calcular consanguinidad en cliente para los ejemplares cargados
    this.recalcularConsanguinidadCenso();

    // Si hay conexión con Supabase, descargar últimas actualizaciones
    if (navigator.onLine && this.supabaseClient) {
      this.sincronizarDesdeSupabase();
    }

    this.actualizarContadorSyncQueue();
  },

  // Carga del censo inicial oficial con las 5 Familias de Gobe y ejemplares RF, RA, RN, RD, RM
  async cargarSemillaInicial(forzar = false) {
    if (forzar) {
      await this.db.clear('animales');
      await this.db.clear('explotaciones');
      await this.db.clear('inspecciones');
      await this.db.clear('controlesPuesta');
      await this.db.clear('lotes');
      await this.db.clear('lotesIncubacion');
      await this.db.clear('bancoGermoplasma');
      await this.db.clear('usuarios');
      await this.db.clear('solicitudesInspeccion');
    }

    const explotacionesSemilla = [
      {
        id: 'exp-01',
        usuario_id: 'usr-criador-01',
        codigo_rega: 'ES030140001234',
        rega: 'ES030140001234',
        numero_socio: 'NS-014',
        nombre_titular: 'Juan Pérez Soler',
        nombre_criadero: 'Aviario El Palmeral - ESGA025',
        municipio: 'Elche',
        provincia: 'Alicante',
        latitud: 38.2671,
        longitud: -0.6983,
        geolocalizacion_precision: 5,
        telefono: '612345678',
        activo: true
      },
      {
        id: 'exp-02',
        usuario_id: 'usr-aspirante-02',
        codigo_rega: 'TEMP-REGA-001',
        rega: 'TEMP-REGA-001',
        numero_socio: 'NS-000',
        nombre_criadero: 'Aviario Crevillent En Trámite',
        nombre_titular: 'Pedro García Orts',
        municipio: 'Crevillent',
        provincia: 'Alicante',
        latitud: 38.2492,
        longitud: -0.8091,
        geolocalizacion_precision: 6,
        telefono: '698765432',
        activo: true
      }
    ];

    const animalesSemilla = [
      // 1. Patriarcas Fundacionales (RF)
      {
        id: 'alac-001',
        usuario_id: 'usr-criador-01',
        codigo_identificacion: 'ESGA025-22-M-0001',
        numero_anilla: '0001',
        calibre_anilla_mm: 20.0,
        nombre: 'Patriarca I (Tronco Norte)',
        sexo: 'Macho',
        fecha_nacimiento: '2022-03-15',
        variedad: 'Moteada / Exchequer',
        seccion_libro: 'RF',
        id_padre: null,
        id_madre: null,
        explotacion_id: 'exp-01',
        codigo_rega: 'ES030140001234',
        titular_nombre: 'Juan Pérez Soler',
        familia_origen: 'Familia A',
        peso_actual_kg: 3.350,
        rfid_chip_id: '968000010000001',
        estado: 'Activo',
        coeficiente_consanguinidad: 0.0,
        feno_zoometria: {
          angulo_cola_grados: 70,
          perfil_pecho: 'Recto/Plano',
          color_tarsos: 'Blanco rosáceo',
          color_orejillas: 'Blanco'
        },
        fotos: {
          lateral: './icons/logo.png',
          cabeza: './icons/icon-192.png',
          tarsos: './icons/icon-512.png',
          galeria_opcional: [
            { url: './icons/logo.png', titulo: 'Exposición 2026 - Campeón Adulto' },
            { url: './icons/icon-512.png', titulo: 'Detalle de cresta y orejilla' }
          ]
        },
        multimedia_urls: {
          lateral: './icons/logo.png',
          cabeza: './icons/icon-192.png',
          tarsos: './icons/icon-512.png',
          galeria_opcional: [
            { url: './icons/logo.png', titulo: 'Exposición 2026 - Campeón Adulto' },
            { url: './icons/icon-512.png', titulo: 'Detalle de cresta y orejilla' }
          ]
        },
        notas: 'Fundador de la Familia A. Cola erguida a 70º y excelente pecho recto sin quilla desvaída.'
      },
      {
        id: 'alac-002',
        usuario_id: 'usr-criador-01',
        codigo_identificacion: 'ESGA025-22-H-0002',
        numero_anilla: '0002',
        calibre_anilla_mm: 18.0,
        nombre: 'Reina del Vinalopó',
        sexo: 'Hembra',
        fecha_nacimiento: '2022-04-10',
        variedad: 'Moteada / Exchequer',
        seccion_libro: 'RF',
        id_padre: null,
        id_madre: null,
        explotacion_id: 'exp-01',
        codigo_rega: 'ES030140001234',
        titular_nombre: 'Juan Pérez Soler',
        familia_origen: 'Familia A',
        peso_actual_kg: 2.450,
        rfid_chip_id: '968000010000002',
        estado: 'Activo',
        coeficiente_consanguinidad: 0.0,
        feno_zoometria: {
          angulo_cola_grados: 70,
          perfil_pecho: 'Recto/Plano',
          color_tarsos: 'Blanco rosáceo',
          color_orejillas: 'Blanco'
        },
        fotos: {
          lateral: './icons/logo.png',
          cabeza: './icons/icon-192.png',
          tarsos: './icons/icon-512.png',
          galeria_opcional: [
            { url: './icons/icon-192.png', titulo: 'Premio Especial Hembra Fundadora' },
            { url: './icons/logo.png', titulo: 'Detalle de ala y remeras' }
          ]
        },
        multimedia_urls: {
          lateral: './icons/logo.png',
          cabeza: './icons/icon-192.png',
          tarsos: './icons/icon-512.png',
          galeria_opcional: [
            { url: './icons/icon-192.png', titulo: 'Premio Especial Hembra Fundadora' },
            { url: './icons/logo.png', titulo: 'Detalle de ala y remeras' }
          ]
        },
        notas: 'Matriarca fundacional de alta prolificidad y excelente cáscara blanco crema.'
      },
      // 2. Macho de Familia B
      {
        id: 'alac-003',
        usuario_id: 'usr-aspirante-02',
        codigo_identificacion: 'ESGA025-23-M-0045',
        numero_anilla: '0045',
        calibre_anilla_mm: 20.0,
        nombre: 'Gobernador de Crevillent',
        sexo: 'Macho',
        fecha_nacimiento: '2023-02-18',
        variedad: 'Moteada / Exchequer',
        seccion_libro: 'RD',
        id_padre: 'alac-001',
        id_madre: 'alac-002',
        explotacion_id: 'exp-02',
        codigo_rega: 'TEMP-REGA-001',
        titular_nombre: 'Pedro García Orts',
        familia_origen: 'Familia B',
        peso_actual_kg: 3.280,
        rfid_chip_id: '968000010000045',
        estado: 'Activo',
        coeficiente_consanguinidad: 0.0,
        feno_zoometria: {
          angulo_cola_grados: 70,
          perfil_pecho: 'Recto/Plano',
          color_tarsos: 'Blanco rosáceo',
          color_orejillas: 'Blanco'
        },
        fotos: {
          lateral: './icons/logo.png',
          cabeza: './icons/icon-192.png',
          tarsos: './icons/icon-512.png',
          galeria_opcional: [
            { url: './icons/logo.png', titulo: 'Exposición 2026 Crevillent' },
            { url: './icons/icon-192.png', titulo: 'Tarsos y porte erguido 70º' }
          ]
        },
        multimedia_urls: {
          lateral: './icons/logo.png',
          cabeza: './icons/icon-192.png',
          tarsos: './icons/icon-512.png',
          galeria_opcional: [
            { url: './icons/logo.png', titulo: 'Exposición 2026 Crevillent' },
            { url: './icons/icon-192.png', titulo: 'Tarsos y porte erguido 70º' }
          ]
        },
        notas: 'Aprobado en inspección zootécnica oficial con 88 puntos. Muy buen porte.'
      },
      // 3. Hembra de Familia B
      {
        id: 'alac-004',
        usuario_id: 'usr-criador-01',
        codigo_identificacion: 'ESGA025-23-H-0046',
        numero_anilla: '0046',
        calibre_anilla_mm: 18.0,
        nombre: 'Dama de Elche',
        sexo: 'Hembra',
        fecha_nacimiento: '2023-03-01',
        variedad: 'Moteada / Exchequer',
        seccion_libro: 'RM',
        id_padre: 'alac-001',
        id_madre: 'alac-002',
        explotacion_id: 'exp-01',
        codigo_rega: 'ES030140001234',
        titular_nombre: 'Juan Pérez Soler',
        familia_origen: 'Familia B',
        peso_actual_kg: 2.380,
        rfid_chip_id: '968000010000046',
        estado: 'Activo',
        coeficiente_consanguinidad: 0.0,
        feno_zoometria: {
          angulo_cola_grados: 70,
          perfil_pecho: 'Recto/Plano',
          color_tarsos: 'Blanco rosáceo',
          color_orejillas: 'Blanco'
        },
        fotos: {
          lateral: './icons/logo.png',
          cabeza: './icons/icon-192.png',
          tarsos: './icons/icon-512.png',
          galeria_opcional: [
            { url: './icons/icon-512.png', titulo: 'Muda otoñal de plumaje' },
            { url: './icons/logo.png', titulo: 'Premio Mejor Puesta 2025' }
          ]
        },
        multimedia_urls: {
          lateral: './icons/logo.png',
          cabeza: './icons/icon-192.png',
          tarsos: './icons/icon-512.png',
          galeria_opcional: [
            { url: './icons/icon-512.png', titulo: 'Muda otoñal de plumaje' },
            { url: './icons/logo.png', titulo: 'Premio Mejor Puesta 2025' }
          ]
        },
        notas: 'Registro de Méritos (RM) por calificación superior a 92 puntos y puesta media de 62 g.'
      },
      // 4. Nueva Generación (Aspirante RN)
      {
        id: 'alac-005',
        usuario_id: 'usr-aspirante-02',
        codigo_identificacion: 'ESGA025-24-M-0142',
        numero_anilla: '0142',
        calibre_anilla_mm: 20.0,
        nombre: 'Joven Lucero',
        sexo: 'Macho',
        fecha_nacimiento: '2024-04-12',
        variedad: 'Moteada / Exchequer',
        seccion_libro: 'RN',
        id_padre: 'alac-003',
        id_madre: 'alac-004',
        explotacion_id: 'exp-02',
        codigo_rega: 'TEMP-REGA-001',
        titular_nombre: 'Pedro García Orts',
        familia_origen: 'Familia C',
        peso_actual_kg: 3.150,
        rfid_chip_id: '968000010000142',
        estado: 'Activo',
        coeficiente_consanguinidad: 0.25,
        feno_zoometria: {
          angulo_cola_grados: 70,
          perfil_pecho: 'Recto/Plano',
          color_tarsos: 'Blanco rosáceo',
          color_orejillas: 'Blanco'
        },
        fotos: {
          lateral: './icons/logo.png',
          cabeza: './icons/icon-192.png',
          tarsos: './icons/icon-512.png',
          galeria_opcional: [
            { url: './icons/icon-192.png', titulo: 'Detalle de ala en crecimiento' },
            { url: './icons/logo.png', titulo: 'Muda juvenil primaveral' }
          ]
        },
        multimedia_urls: {
          lateral: './icons/logo.png',
          cabeza: './icons/icon-192.png',
          tarsos: './icons/icon-512.png',
          galeria_opcional: [
            { url: './icons/icon-192.png', titulo: 'Detalle de ala en crecimiento' },
            { url: './icons/logo.png', titulo: 'Muda juvenil primaveral' }
          ]
        },
        notas: 'Aspirante en Registro de Nacimientos pendiente de inspección oficial de aptitud.'
      },
      // 5. Hembra Familia C
      {
        id: 'alac-006',
        usuario_id: 'usr-criador-01',
        codigo_identificacion: 'ESGA025-24-H-0143',
        numero_anilla: '0143',
        calibre_anilla_mm: 18.0,
        nombre: 'Palmera Blanca',
        sexo: 'Hembra',
        fecha_nacimiento: '2024-04-20',
        variedad: 'Moteada / Exchequer',
        seccion_libro: 'RD',
        id_padre: 'alac-003',
        id_madre: 'alac-002',
        explotacion_id: 'exp-01',
        codigo_rega: 'ES030140001234',
        titular_nombre: 'Juan Pérez Soler',
        familia_origen: 'Familia C',
        peso_actual_kg: 2.300,
        rfid_chip_id: '968000010000143',
        estado: 'Activo',
        coeficiente_consanguinidad: 0.125,
        feno_zoometria: {
          angulo_cola_grados: 70,
          perfil_pecho: 'Recto/Plano',
          color_tarsos: 'Blanco rosáceo',
          color_orejillas: 'Blanco'
        },
        fotos: {
          lateral: './icons/logo.png',
          cabeza: './icons/icon-192.png',
          tarsos: './icons/icon-512.png',
          galeria_opcional: [
            { url: './icons/icon-512.png', titulo: 'Exposición 2026 Joven Promesa' },
            { url: './icons/logo.png', titulo: 'Tarsos sin plumas descalificantes' }
          ]
        },
        multimedia_urls: {
          lateral: './icons/logo.png',
          cabeza: './icons/icon-192.png',
          tarsos: './icons/icon-512.png',
          galeria_opcional: [
            { url: './icons/icon-512.png', titulo: 'Exposición 2026 Joven Promesa' },
            { url: './icons/logo.png', titulo: 'Tarsos sin plumas descalificantes' }
          ]
        },
        notas: 'Excelente porte y tarsos blanco rosáceos impecables.'
      }
    ];

    const inspeccionesSemilla = [
      {
        id: 'insp-01',
        animal_id: 'alac-003',
        fecha_inspeccion: '2024-05-10',
        calificador_oficial: 'Dra. Elena Valor (Inspectora CNZ)',
        inspector_id: 'INSP-CNZ-025',
        inspector_usuario_id: 'usr-inspector-01',
        cabeza_cresta_cara: 13.5,
        cuello_esclavina: 9.0,
        pecho_tronco: 18.0,
        cola_porte: 18.5,
        extremidades_tarsos: 13.0,
        plumaje_variedad: 8.5,
        peso_desarrollo: 9.0,
        puntuacion_total: 89.5,
        descalificado: false,
        calificacion: 'Muy Bueno',
        observaciones: 'Ejemplar con porte erguido excelente. Cola en ángulo estricto a 70º.'
      },
      {
        id: 'insp-02',
        animal_id: 'alac-004',
        fecha_inspeccion: '2024-05-10',
        calificador_oficial: 'Dra. Elena Valor (Inspectora CNZ)',
        inspector_id: 'INSP-CNZ-025',
        inspector_usuario_id: 'usr-inspector-01',
        cabeza_cresta_cara: 14.5,
        cuello_esclavina: 9.5,
        pecho_tronco: 19.0,
        cola_porte: 19.0,
        extremidades_tarsos: 14.0,
        plumaje_variedad: 9.5,
        peso_desarrollo: 9.5,
        puntuacion_total: 95.0,
        descalificado: false,
        calificacion: 'Excelente',
        observaciones: 'Cumple a la perfección el estándar morfológico oficial ESGA025. Orejillas blanco puro.'
      }
    ];

    const lotesSemilla = [
      {
        id: 'lote-01',
        usuario_id: 'usr-criador-01',
        explotacion_id: 'exp-01',
        codigo_rega: 'ES030140001234',
        codigo_lote: 'LOTE-GOBE-2026-B',
        familia_receptora: 'Familia B',
        familia_macho: 'Familia A',
        id_gallo: 'alac-001',
        gallinas_ids: ['alac-004'],
        temporada: 2026,
        coeficiente_consanguinidad_esperado: 0.0,
        rotacion_siguiente_familia: 'Familia C',
        activo: true,
        notas: 'Macho de Familia A cubriendo hembras de Familia B conforme a la regla de Gobe.'
      }
    ];

    await this.db.putBatch('explotaciones', explotacionesSemilla);
    await this.db.putBatch('animales', animalesSemilla);
    await this.db.putBatch('inspecciones', inspeccionesSemilla);
    await this.db.putBatch('controlesPuesta', this.obtenerControlesPuestaSemilla());
    await this.db.putBatch('lotes', lotesSemilla);
    await this.db.putBatch('usuarios', this.obtenerUsuariosSemillaV6());
    await this.db.putBatch('solicitudesInspeccion', this.obtenerSolicitudesInspeccionSemillaV6());

    if (forzar) {
      await this.cargarDatos();
      this.poblarSelectores();
      this.renderizarCenso();
      this.actualizarKPIs();
      this.renderizarLotes();
      this.poblarSelectoresAnaliticaPuesta();
      this.renderizarAnaliticaPuesta();
      this.renderizarSolicitudesInspeccion();
      this.renderizarTablaUsuariosAdmin();
      alert('Censo Semilla ESGA025 y Usuarios V6 recargados correctamente.');
    }
  },

  // Sincronización desde Supabase cuando se tiene conexión
  async sincronizarDesdeSupabase() {
    if (!this.supabaseClient) return;
    try {
      console.log('[Supabase] Consultando actualizaciones remotas...');
      const { data: animalesRemotos, error: errA } = await this.supabaseClient.from('animales').select('*');
      if (!errA && animalesRemotos && animalesRemotos.length > 0) {
        await this.db.putBatch('animales', animalesRemotos);
        this.estado.animales = animalesRemotos.filter(a => this.perteneceAUsuarioActivo(a));
        this.renderizarCenso();
        this.actualizarKPIs();
      }
      // Sincronizar perfiles de usuarios y solicitudes de inspección si existen tablas en Supabase
      try {
        const { data: usuariosRemotos, error: errU } = await this.supabaseClient.from('perfiles_usuarios').select('*');
        if (!errU && usuariosRemotos && usuariosRemotos.length > 0) {
          await this.db.putBatch('usuarios', usuariosRemotos);
          this.estado.usuarios = await this.db.getAll('usuarios');
          this.renderizarTablaUsuariosAdmin();
        }
      } catch (_) {}

      try {
        const { data: solicitudesRemotas, error: errS } = await this.supabaseClient.from('solicitudes_inspeccion').select('*');
        if (!errS && solicitudesRemotas && solicitudesRemotas.length > 0) {
          await this.db.putBatch('solicitudesInspeccion', solicitudesRemotas);
          const todasSol = await this.db.getAll('solicitudesInspeccion');
          const u = this.estado.usuarioActivo;
          if (u && (u.rol === 'admin' || u.rol === 'inspector')) {
            this.estado.solicitudesInspeccion = todasSol;
          } else if (u) {
            this.estado.solicitudesInspeccion = todasSol.filter(s => String(s.usuario_id) === String(u.id));
          }
          this.renderizarSolicitudesInspeccion();
        }
      } catch (_) {}
    } catch (e) {
      console.warn('[Supabase] Error sincronizando desde nube:', e);
    }
  },

  // Sincronización de la cola offline (SyncQueue) hacia Supabase
  async sincronizarCola(manual = true) {
    if (!navigator.onLine) {
      if (manual) alert('No hay conexión a internet actualmente. Las tareas continuarán guardadas en la cola.');
      return;
    }

    if (!this.supabaseClient) {
      if (manual) alert('Para sincronizar con Supabase, introduce la URL y Anon Key en Configuración.');
      return;
    }

    const cola = await this.db.getAll('syncQueue');
    if (!cola || cola.length === 0) {
      if (manual) alert('La cola de sincronización está vacía. Todos los datos están al día.');
      return;
    }

    console.log(`[SyncQueue] Procesando ${cola.length} elementos pendientes...`);
    let sincronizados = 0;

    for (const item of cola) {
      try {
        if (item.tipo === 'ALTA_ANIMAL') {
          // Subir fotos en Base64 al bucket de Storage si existen
          const fotosUrls = { ...item.payload.fotos };
          for (const tipoFoto of ['lateral', 'cabeza', 'tarsos']) {
            if (fotosUrls[tipoFoto] && fotosUrls[tipoFoto].startsWith('data:')) {
              const urlSubida = await this.subirFotoStorage(item.payload.id, tipoFoto, fotosUrls[tipoFoto]);
              if (urlSubida) fotosUrls[tipoFoto] = urlSubida;
            }
          }

          // Subir fotos opcionales también si existen
          if (Array.isArray(fotosUrls.galeria_opcional)) {
            const galeriaSubida = [];
            for (let i = 0; i < fotosUrls.galeria_opcional.length; i++) {
              const opc = { ...fotosUrls.galeria_opcional[i] };
              if (opc.url && opc.url.startsWith('data:')) {
                const urlSubida = await this.subirFotoStorage(item.payload.id, `opcional_${i}`, opc.url);
                if (urlSubida) opc.url = urlSubida;
              }
              galeriaSubida.push(opc);
            }
            fotosUrls.galeria_opcional = galeriaSubida;
          }

          item.payload.fotos = fotosUrls;
          if (item.payload.multimedia_urls) {
            item.payload.multimedia_urls = fotosUrls;
          }

          const { error } = await this.supabaseClient.from('animales').upsert(item.payload);
          if (!error) {
            await this.db.delete('syncQueue', item.id);
            sincronizados++;
          }
        } else if (item.tipo === 'INSPECCION' || item.tipo === 'ACTA_INSPECCION_INSITU') {
          const payloadActa = { ...item.payload };
          // Si incluye firma digital en Base64, subirla a Supabase Storage (bucket 'fotos-alacantina')
          if (payloadActa.firma_inspector_base64 && payloadActa.firma_inspector_base64.startsWith('data:')) {
            const urlFirma = await this.subirFotoStorage(payloadActa.animal_id || 'inspeccion', 'firma_inspector', payloadActa.firma_inspector_base64);
            if (urlFirma) {
              payloadActa.firma_storage_url = urlFirma;
            }
          }
          const { error } = await this.supabaseClient.from('inspecciones_morfologicas').upsert(payloadActa);
          // Disparar función/trigger de promoción en Supabase promover_ejemplar_inspeccion()
          try {
            await this.supabaseClient.rpc('promover_ejemplar_inspeccion', {
              p_animal_id: payloadActa.animal_id,
              p_puntuacion_total: payloadActa.puntuacion_total,
              p_descalificado: payloadActa.descalificado,
              p_dictamen: payloadActa.dictamen_zootecnico || payloadActa.calificacion,
              p_nueva_seccion: payloadActa.seccion_promovida
            });
          } catch (rpcErr) {
            console.warn('[Supabase RPC] promover_ejemplar_inspeccion fallback update:', rpcErr);
          }
          if (payloadActa.seccion_promovida && payloadActa.animal_id) {
            await this.supabaseClient.from('animales').update({
              seccion_libro: payloadActa.seccion_promovida,
              estado_reproductor: payloadActa.dictamen_zootecnico === 'APTO_RD' ? 'Apto' : (payloadActa.dictamen_zootecnico === 'PROVISIONAL' ? 'Provisional' : 'No Apto'),
              estado: payloadActa.dictamen_zootecnico === 'NO_APTO_BAJA' ? 'Baja' : 'Activo'
            }).eq('id', payloadActa.animal_id);
          }
          if (!error) {
            await this.db.delete('syncQueue', item.id);
            sincronizados++;
          }
        } else if (item.tipo === 'CONTROL_PUESTA') {
          const { error } = await this.supabaseClient.from('controles_puesta').upsert(item.payload);
          if (!error) {
            await this.db.delete('syncQueue', item.id);
            sincronizados++;
          }
        } else if (item.tipo === 'LOTE') {
          const { error } = await this.supabaseClient.from('lotes_apareamiento').upsert(item.payload);
          if (!error) {
            await this.db.delete('syncQueue', item.id);
            sincronizados++;
          }
        } else if (item.tipo === 'ALTA_EXPLOTACION') {
          const { error } = await this.supabaseClient.from('explotaciones').upsert(item.payload);
          if (!error) {
            await this.db.delete('syncQueue', item.id);
            sincronizados++;
          }
        } else if (item.tipo === 'ACTUALIZAR_REGA_MASIVA') {
          const { explotacionId, nuevaRega, nuevosDatos } = item.payload;
          const { error: rpcErr } = await this.supabaseClient.rpc('actualizar_rega_masiva', {
            p_explotacion_id: explotacionId,
            p_nueva_rega: nuevaRega
          });
          if (rpcErr) {
            await this.supabaseClient.from('explotaciones').update({
              codigo_rega: nuevaRega,
              rega: nuevaRega,
              ...(nuevosDatos || {})
            }).eq('id', explotacionId);

            await this.supabaseClient.from('animales').update({
              codigo_rega: nuevaRega
            }).eq('explotacion_id', explotacionId);
          }
          await this.db.delete('syncQueue', item.id);
          sincronizados++;
        } else if (item.tipo === 'USUARIO_PERFIL' || item.tipo === 'CAMBIO_ROL_ADMIN') {
          try {
            await this.supabaseClient.from('perfiles_usuarios').upsert(item.payload);
          } catch (_) {}
          await this.db.delete('syncQueue', item.id);
          sincronizados++;
        } else if (item.tipo === 'SOLICITUD_INSPECCION') {
          try {
            await this.supabaseClient.from('solicitudes_inspeccion').upsert(item.payload);
          } catch (_) {}
          await this.db.delete('syncQueue', item.id);
          sincronizados++;
        } else if (item.tipo === 'LOTE_INCUBACION') {
          try {
            await this.supabaseClient.from('lotes_incubacion').upsert(item.payload);
          } catch (_) {}
          await this.db.delete('syncQueue', item.id);
          sincronizados++;
        } else if (item.tipo === 'BANCO_GERMOPLASMA') {
          try {
            await this.supabaseClient.from('banco_germoplasma').upsert(item.payload);
          } catch (_) {}
          await this.db.delete('syncQueue', item.id);
          sincronizados++;
        }
      } catch (err) {
        console.error('[SyncQueue] Error al sincronizar item:', item, err);
      }
    }

    this.estado.syncQueue = await this.db.getAll('syncQueue');
    this.actualizarContadorSyncQueue();
    if (sincronizados > 0) {
      this.mostrarNotificacionToast(`☁️ Sincronizado: ${sincronizados} registro(s) subidos a Supabase.`, 'success');
    }
    if (manual) {
      alert(`Sincronización completada. Se enviaron ${sincronizados} elementos a Supabase.`);
    }
  },

  // Subir imagen en Base64 (WebP optimizado < 300 KB o JPEG/PNG) al Storage Bucket 'fotos-alacantina'
  async subirFotoStorage(animalId, tipoFoto, base64Data) {
    if (!this.supabaseClient) return null;
    try {
      const blob = this.base64ToBlob(base64Data);
      const mimeType = blob.type || 'image/webp';
      const ext = mimeType.includes('webp') ? 'webp' : (mimeType.includes('png') ? 'png' : 'jpg');
      const filePath = `${animalId}/${tipoFoto}_${Date.now()}.${ext}`;

      const { data, error } = await this.supabaseClient.storage
        .from('fotos-alacantina')
        .upload(filePath, blob, {
          contentType: mimeType,
          upsert: true
        });

      if (error) throw error;

      const { data: publicUrlData } = this.supabaseClient.storage
        .from('fotos-alacantina')
        .getPublicUrl(filePath);

      return publicUrlData.publicUrl;
    } catch (err) {
      console.warn(`[Storage] No se pudo subir foto ${tipoFoto}:`, err);
      return null;
    }
  },

  base64ToBlob(base64) {
    const parts = base64.split(';base64,');
    const contentType = parts[0].split(':')[1];
    const raw = window.atob(parts[1]);
    const uInt8Array = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; ++i) {
      uInt8Array[i] = raw.charCodeAt(i);
    }
    return new Blob([uInt8Array], { type: contentType });
  },

  actualizarContadorSyncQueue() {
    const count = this.estado.syncQueue ? this.estado.syncQueue.length : 0;
    const badge = document.getElementById('sync-pending-count');
    const btnSync = document.getElementById('btn-sync-queue');
    const labelSync = document.getElementById('sync-monitor-label');

    if (count > 0) {
      if (badge) {
        badge.textContent = count;
        badge.classList.remove('hidden');
      }
      if (labelSync) {
        labelSync.textContent = `☁️ ${count} ${count === 1 ? 'pendiente' : 'pendientes'}`;
      }
      if (btnSync) {
        btnSync.className = 'relative px-2.5 py-1.5 rounded-xl bg-amber-950/90 hover:bg-amber-900/90 text-amber-300 border border-amber-500/70 text-xs font-bold flex items-center gap-1.5 transition shadow-sm';
      }
    } else {
      if (badge) {
        badge.textContent = '0';
        badge.classList.add('hidden');
      }
      if (labelSync) {
        labelSync.textContent = '☁️ Sincronizado';
      }
      if (btnSync) {
        btnSync.className = 'relative px-2.5 py-1.5 rounded-xl bg-emerald-950/80 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-700/70 text-xs font-bold flex items-center gap-1.5 transition shadow-sm';
      }
    }
  },

  // =========================================================================
  // 3. PESTAÑA 1: ALTA DE EJEMPLAR, GPS IN SITU Y 3 FOTOS OBLIGATORIAS
  // =========================================================================
  actualizarReglasSexo() {
    const sexo = document.getElementById('alta-sexo').value;
    const calibreHint = document.getElementById('alta-calibre-hint');
    const pesoHint = document.getElementById('alta-peso-feedback');

    if (sexo === 'Macho') {
      if (calibreHint) calibreHint.textContent = 'Calibre reglamentario: 20.0 mm (Gallo Repr.)';
      if (pesoHint) pesoHint.textContent = 'Rango oficial reproductor: Gallo 3.000 kg – 3.500 kg';
    } else {
      if (calibreHint) calibreHint.textContent = 'Calibre reglamentario: 18.0 mm (Gallina Repr.)';
      if (pesoHint) pesoHint.textContent = 'Rango oficial reproductora: Gallina 2.200 kg – 2.600 kg';
    }
    this.autogenerarCodigoOficial();
    this.validarPesoRacial();
  },

  autogenerarCodigoOficial() {
    const sexo = document.getElementById('alta-sexo').value;
    const anilla = document.getElementById('alta-anilla').value.trim();
    const fechaNac = document.getElementById('alta-fecha-nac').value;
    const codigoInput = document.getElementById('alta-codigo-id');

    let anio = '25';
    if (fechaNac) {
      anio = new Date(fechaNac).getFullYear().toString().slice(-2);
    }

    const letraSexo = sexo === 'Macho' ? 'M' : 'H';
    const anillaPad = anilla.padStart(4, '0');
    codigoInput.value = `ESGA025-${anio}-${letraSexo}-${anillaPad}`;
  },

  generarAnillaSiguiente() {
    let max = 0;
    this.estado.animales.forEach(a => {
      const n = parseInt(a.numero_anilla, 10);
      if (!isNaN(n) && n > max) max = n;
    });
    const siguiente = String(max + 1).padStart(4, '0');
    document.getElementById('alta-anilla').value = siguiente;
    this.autogenerarCodigoOficial();
  },

  validarPesoRacial() {
    const sexo = document.getElementById('alta-sexo').value;
    const peso = parseFloat(document.getElementById('alta-peso').value);
    const feedback = document.getElementById('alta-peso-feedback');
    if (!peso || isNaN(peso)) return;

    let dentroDeRango = false;
    if (sexo === 'Macho' && peso >= 3.000 && peso <= 3.500) dentroDeRango = true;
    if (sexo === 'Hembra' && peso >= 2.200 && peso <= 2.600) dentroDeRango = true;

    if (dentroDeRango) {
      feedback.className = 'text-[11px] text-emerald-400 mt-1 font-semibold';
      feedback.textContent = `✓ Peso dentro del estándar racial oficial (${peso.toFixed(3)} kg).`;
    } else {
      feedback.className = 'text-[11px] text-amber-400 mt-1 font-semibold';
      feedback.textContent = `⚠️ Peso fuera del rango estricto de reproductor (Gallo: 3.0-3.5kg | Gallina: 2.2-2.6kg).`;
    }
  },

  // Captura de Coordenadas GPS in situ
  capturarGPS() {
    const btnText = document.getElementById('btn-gps-text');
    if (!navigator.geolocation) {
      alert('Tu navegador no soporta geolocalización in situ.');
      return;
    }

    btnText.textContent = 'Adquiriendo satélites...';

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const prec = Math.round(pos.coords.accuracy);

        this.estado.gpsUbicacion = { latitud: lat, longitud: lng, precision_m: prec };

        document.getElementById('gps-lat').textContent = lat.toFixed(6);
        document.getElementById('gps-lng').textContent = lng.toFixed(6);
        document.getElementById('gps-prec').textContent = prec;
        document.getElementById('gps-display-box').classList.remove('hidden');

        btnText.textContent = 'GPS Actualizado';
      },
      (err) => {
        console.warn('[GPS] Error:', err);
        btnText.textContent = 'Obtener GPS in situ';
        alert(`No se pudo obtener la ubicación GPS: ${err.message}. Comprueba los permisos.`);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  },

  /**
   * Compresor WebP transparente en cliente (Canvas HTML5):
   * Convierte cualquier imagen de cámara o galería a formato WebP optimizado (< 300 KB)
   * garantizando máxima fluidez offline/online sin perder calidad de inspección zootécnica.
   */
  comprimirImagenWebP(img, maxDim = 1280, maxBytes = 300 * 1024) {
    const canvas = document.createElement('canvas');
    let width = img.width || 1200;
    let height = img.height || 900;

    if (width > height && width > maxDim) {
      height = Math.round((height * maxDim) / width);
      width = maxDim;
    } else if (height > maxDim) {
      width = Math.round((width * maxDim) / height);
      height = maxDim;
    }

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);

    // Comprobar soporte nativo de codificación image/webp en Canvas y ajustar calidad iterativamente (< 300 KB)
    let quality = 0.84;
    let dataUrl = canvas.toDataURL('image/webp', quality);
    const mimeType = dataUrl.startsWith('data:image/webp') ? 'image/webp' : 'image/jpeg';
    if (mimeType === 'image/jpeg') {
      dataUrl = canvas.toDataURL('image/jpeg', quality);
    }

    const calcularBytesBase64 = (b64) => {
      const idx = b64.indexOf(';base64,');
      if (idx === -1) return b64.length;
      return Math.ceil(((b64.length - (idx + 8)) * 3) / 4);
    };

    let bytes = calcularBytesBase64(dataUrl);
    while (bytes > maxBytes && quality > 0.38) {
      quality = Math.max(0.35, Number((quality - 0.1).toFixed(2)));
      dataUrl = canvas.toDataURL(mimeType, quality);
      bytes = calcularBytesBase64(dataUrl);
    }

    // Si aún supera 300 KB por resolución extrema, reducir escala un 20% adicional
    if (bytes > maxBytes) {
      canvas.width = Math.round(width * 0.8);
      canvas.height = Math.round(height * 0.8);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      dataUrl = canvas.toDataURL(mimeType, 0.72);
      bytes = calcularBytesBase64(dataUrl);
    }

    const kb = (bytes / 1024).toFixed(1);
    console.log(`[Compresor WebP] Imagen optimizada en cliente: ${mimeType} · ${canvas.width}x${canvas.height}px · ${kb} KB (< 300 KB)`);
    return {
      dataUrl,
      bytes,
      kb,
      mimeType
    };
  },

  // Procesamiento y compresión WebP (< 300 KB) en cliente de las 3 tomas fotográficas obligatorias
  procesarCapturaFoto(tipoToma, inputElement) {
    const file = inputElement.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // Procesar en Canvas a formato WebP optimizado (< 300 KB) antes de guardar en IndexedDB o subir a Supabase
        const comprimida = this.comprimirImagenWebP(img, 1280, 300 * 1024);
        const base64Webp = comprimida.dataUrl;

        // Guardar en el estado temporal
        this.estado.fotosCapturadas[tipoToma] = base64Webp;

        // Actualizar UI
        const slot = document.getElementById(`slot-${tipoToma}`);
        const placeholder = document.getElementById(`preview-${tipoToma}-placeholder`);
        const previewImg = document.getElementById(`preview-${tipoToma}-img`);
        const btnEliminar = document.getElementById(`btn-eliminar-${tipoToma}`);
        const badgeCaptura = document.getElementById(`badge-captura-${tipoToma}`);

        if (previewImg) {
          previewImg.src = base64Webp;
          previewImg.classList.remove('hidden');
        }
        if (placeholder) placeholder.classList.add('hidden');
        if (slot) slot.classList.add('filled');
        if (btnEliminar) btnEliminar.classList.remove('hidden');
        if (badgeCaptura) {
          badgeCaptura.textContent = `✓ WebP (${comprimida.kb} KB)`;
          badgeCaptura.classList.remove('hidden');
        }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  },

  // Eliminar / Repetir fotografía capturada
  eliminarFoto(tipoToma, event) {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }

    // 1. Limpiar estado en memoria
    this.estado.fotosCapturadas[tipoToma] = null;

    // 2. Limpiar ambos inputs de archivo para permitir seleccionar de nuevo la misma foto si se desea
    const inputCam = document.getElementById(`input-foto-camara-${tipoToma}`);
    const inputGal = document.getElementById(`input-foto-galeria-${tipoToma}`);
    if (inputCam) inputCam.value = '';
    if (inputGal) inputGal.value = '';

    // 3. Restaurar UI interactiva del contenedor
    const slot = document.getElementById(`slot-${tipoToma}`);
    const placeholder = document.getElementById(`preview-${tipoToma}-placeholder`);
    const previewImg = document.getElementById(`preview-${tipoToma}-img`);
    const btnEliminar = document.getElementById(`btn-eliminar-${tipoToma}`);
    const badgeCaptura = document.getElementById(`badge-captura-${tipoToma}`);

    if (previewImg) {
      previewImg.src = '';
      previewImg.classList.add('hidden');
    }
    if (placeholder) placeholder.classList.remove('hidden');
    if (slot) slot.classList.remove('filled');
    if (btnEliminar) btnEliminar.classList.add('hidden');
    if (badgeCaptura) badgeCaptura.classList.add('hidden');
  },

  // =========================================================================
  // GESTOR DE FOTOGRAFÍAS OPCIONALES CON TITULADO / ETIQUETADO (COMPRESOR WEBP)
  // =========================================================================
  procesarCapturaFotoOpcional(inputElement) {
    const file = inputElement.files && inputElement.files[0];
    if (!file) return;

    // Obtener título o etiqueta escrita por el usuario
    const inputTitulo = document.getElementById('foto-opcional-titulo');
    const titulo = inputTitulo ? inputTitulo.value.trim() : '';

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // Compresión transparente en cliente a formato WebP (< 300 KB) en Canvas
        const comprimida = this.comprimirImagenWebP(img, 1280, 300 * 1024);
        const base64Webp = comprimida.dataUrl;

        // Incorporar al estado reactivo
        this.estado.fotosOpcionalesCapturadas.push({
          url: base64Webp,
          formato: 'WebP',
          tamano_kb: Number(comprimida.kb),
          titulo: titulo || `Foto adicional #${this.estado.fotosOpcionalesCapturadas.length + 1}`,
          fecha: new Date().toISOString()
        });

        // Limpiar inputs para permitir incorporar más fotos
        if (inputTitulo) inputTitulo.value = '';
        inputElement.value = '';
        const otroInputId = inputElement.id === 'input-foto-camara-opcional' 
          ? 'input-foto-galeria-opcional' 
          : 'input-foto-camara-opcional';
        const otroInput = document.getElementById(otroInputId);
        if (otroInput) otroInput.value = '';

        // Actualizar cuadrícula de previsualización en la UI
        this.renderizarGaleriaOpcionalAlta();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  },

  // Renderizar la cuadrícula interactiva de fotos opcionales en el formulario de alta
  renderizarGaleriaOpcionalAlta() {
    const grid = document.getElementById('grid-galeria-opcional');
    const badge = document.getElementById('galeria-opcional-badge');
    const empty = document.getElementById('galeria-opcional-empty');
    const fotos = this.estado.fotosOpcionalesCapturadas || [];

    if (badge) {
      badge.textContent = `${fotos.length} foto${fotos.length === 1 ? '' : 's'} añadida${fotos.length === 1 ? '' : 's'}`;
    }

    if (fotos.length === 0) {
      if (grid) grid.innerHTML = '';
      if (empty) empty.classList.remove('hidden');
      return;
    }

    if (empty) empty.classList.add('hidden');

    if (grid) {
      grid.innerHTML = fotos.map((item, index) => {
        const tituloEsc = this.escaparHtml(item.titulo || `Foto #${index + 1}`);
        return `
          <div class="relative bg-slate-900 border border-slate-800 rounded-xl overflow-hidden group shadow-md hover:border-amber-500/60 transition flex flex-col">
            <div class="relative aspect-square w-full overflow-hidden bg-slate-950 cursor-pointer" onclick="app.abrirLightbox('${item.url}', '${tituloEsc}')" title="Ampliar imagen">
              <img src="${item.url}" alt="${tituloEsc}" class="w-full h-full object-cover group-hover:scale-105 transition duration-200">
              <span class="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-sm text-[10px] font-mono text-slate-300 border border-slate-700/60">
                #${index + 1}
              </span>
            </div>
            <!-- Botón suprayacente de borrado con icono papelera y backdrop-blur -->
            <button type="button" 
                    onclick="app.eliminarFotoOpcional(${index}, event)" 
                    class="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-slate-950/80 hover:bg-rose-600 text-slate-300 hover:text-white backdrop-blur-md flex items-center justify-center transition shadow-lg border border-slate-700/60 hover:border-rose-500 z-10" 
                    title="Eliminar esta foto de la galería">
              <i class="fa-solid fa-trash-can text-xs"></i>
            </button>
            <!-- Título o etiqueta visible en la parte inferior -->
            <div class="p-2 bg-slate-950/90 border-t border-slate-800/80 text-[11px] font-medium text-slate-300 truncate text-center" title="${tituloEsc}">
              ${tituloEsc}
            </div>
          </div>
        `;
      }).join('');
    }
  },

  // Eliminar una fotografía opcional individual por índice
  eliminarFotoOpcional(index, event) {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    if (index >= 0 && index < this.estado.fotosOpcionalesCapturadas.length) {
      this.estado.fotosOpcionalesCapturadas.splice(index, 1);
      this.renderizarGaleriaOpcionalAlta();
    }
  },

  // Helper para abrir cualquier imagen en el visor Lightbox con soporte para destacados de etiqueta
  abrirLightbox(src, caption = '', etiquetaCoincidente = '') {
    if (!src) return;
    const imgEl = document.getElementById('lightbox-img');
    const capEl = document.getElementById('lightbox-caption');
    const modalLight = document.getElementById('modal-lightbox');
    if (imgEl && modalLight) {
      imgEl.src = src;
      if (capEl) {
        if (etiquetaCoincidente) {
          capEl.innerHTML = `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500 text-slate-950 font-bold text-[11px] mr-2 shadow-sm"><i class="fa-solid fa-tag text-[10px]"></i> 🏷️ ${this.escaparHtml(etiquetaCoincidente)}</span> <span class="font-medium text-slate-200">${this.escaparHtml(caption || 'Fotografía')}</span>`;
        } else {
          capEl.textContent = caption || 'Fotografía ampliada';
        }
      }
      modalLight.classList.remove('hidden');
    }
  },

  // Helper de sanitización de texto HTML
  escaparHtml(texto) {
    if (!texto) return '';
    return String(texto)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  },

  // Ver vista previa ampliada en Lightbox de la foto recién capturada
  verFotoAltaPreview(tipoToma) {
    const src = this.estado.fotosCapturadas[tipoToma];
    if (!src) return;
    const titulos = {
      lateral: 'Vista Previa: Toma Lateral Completa',
      cabeza: 'Vista Previa: Toma de Cabeza y Cresta',
      tarsos: 'Vista Previa: Toma de Tarsos y Patas'
    };
    this.abrirLightbox(src, titulos[tipoToma] || 'Fotografía in situ');
  },

  // Cálculo en vivo de consanguinidad esperada en el formulario de alta
  calcularConsanguinidadEstimadaAlta() {
    const padreId = document.getElementById('alta-padre').value;
    const madreId = document.getElementById('alta-madre').value;
    const box = document.getElementById('alta-fx-preview');
    const valText = document.getElementById('alta-fx-val');

    if (padreId && madreId) {
      const fx = this.zootecnia.calcularFxDescendencia(padreId, madreId, this.estado.animales);
      box.classList.remove('hidden');
      valText.textContent = `${fx.toFixed(5)} (${(fx * 100).toFixed(2)}%)`;
      if (fx > 0.0625) {
        valText.className = 'font-mono font-bold text-red-400';
      } else {
        valText.className = 'font-mono font-bold text-emerald-400';
      }
    } else {
      box.classList.add('hidden');
    }
  },

  // Guardar nuevo animal en el Libro Genealógico
  async guardarNuevoAnimal(event) {
    event.preventDefault();

    const u = this.estado.usuarioActivo;
    if (!u || this.estado.modoVisitante) {
      alert('Debes iniciar sesión con una cuenta de usuario activa para dar de alta ejemplares.');
      return;
    }

    // 1. Vincular estrictamente el aviario del usuario autenticado (app.estado.aviario)
    let aviario = this.estado.aviario || this.estado.aviarioActivo;
    if (!aviario) {
      const selectVal = document.getElementById('alta-explotacion')?.value;
      if (selectVal) {
        aviario = this.estado.explotaciones.find(e => e.id === selectVal && this.perteneceAUsuarioActivo(e, u));
      }
    }

    if (!aviario) {
      if (confirm('No tienes ningún aviario o explotación activa configurada en tu cuenta.\n¿Deseas configurar tu aviario ahora para vincular tu código REGA y ubicación?')) {
        this.abrirModalAviario(true);
      }
      return;
    }

    const explotacionId = aviario.id;
    const codigoRega = aviario.codigo_rega || aviario.rega || u.rega || 'TEMP-REGA-001';
    const titularNombre = aviario.nombre_titular || u.nombre || '';

    const sexo = document.getElementById('alta-sexo').value;
    const anilla = document.getElementById('alta-anilla').value.trim();
    const codigoId = document.getElementById('alta-codigo-id').value.trim();
    const nombre = document.getElementById('alta-nombre').value.trim();
    const fechaNac = document.getElementById('alta-fecha-nac').value;
    const variedad = document.getElementById('alta-variedad').value;
    const seccion = document.getElementById('alta-seccion').value;
    const familia = document.getElementById('alta-familia').value;
    const padreId = document.getElementById('alta-padre').value || null;
    const madreId = document.getElementById('alta-madre').value || null;
    const peso = parseFloat(document.getElementById('alta-peso').value);
    const notas = document.getElementById('alta-notas').value.trim();
    const rfid = document.getElementById('alta-rfid')?.value.trim() || null;

    // Validar anilla duplicada
    if (this.estado.animales.some(a => a.numero_anilla === anilla)) {
      alert(`Error: Ya existe un ejemplar registrado con el número de anilla ${anilla}.`);
      return;
    }

    // Validar transpondedor RFID duplicado
    if (rfid && this.estado.animales.some(a => a.rfid_chip_id && a.rfid_chip_id.toUpperCase() === rfid.toUpperCase())) {
      alert(`Error: Ya existe un ejemplar registrado con el transpondedor RFID ${rfid}.`);
      return;
    }

    // Calcular Fx
    const fx = (padreId && madreId) 
      ? this.zootecnia.calcularFxDescendencia(padreId, madreId, this.estado.animales) 
      : 0.0;

    const calibre = sexo === 'Macho' ? 20.0 : 18.0;

    // GPS: Heredar dinámicamente las coordenadas reales del aviario del usuario logueado si no se capturó GPS puntual
    let gpsFinal = this.estado.gpsUbicacion;
    if (!gpsFinal && aviario && aviario.latitud !== null && aviario.latitud !== undefined && aviario.longitud !== null && aviario.longitud !== undefined) {
      gpsFinal = {
        latitud: Number(aviario.latitud),
        longitud: Number(aviario.longitud),
        precision_m: aviario.geolocalizacion_precision || 10,
        origen: 'aviario_heredado'
      };
    }

    const nuevoAnimal = {
      id: 'alac-' + Date.now(),
      usuario_id: u.id,
      codigo_identificacion: codigoId,
      numero_anilla: anilla,
      calibre_anilla_mm: calibre,
      nombre: nombre || `Ejemplar ESGA025 #${anilla}`,
      sexo: sexo,
      fecha_nacimiento: fechaNac,
      variedad: variedad,
      seccion_libro: seccion,
      id_padre: padreId,
      id_madre: madreId,
      explotacion_id: explotacionId,
      codigo_rega: codigoRega,
      titular_nombre: titularNombre,
      familia_origen: familia,
      peso_actual_kg: peso,
      rfid_chip_id: rfid,
      estado: 'Activo',
      coeficiente_consanguinidad: fx,
      feno_zoometria: {
        angulo_cola_grados: 70,
        perfil_pecho: 'Recto/Plano',
        color_tarsos: 'Blanco rosáceo',
        color_orejillas: 'Blanco'
      },
      fotos: {
        lateral: this.estado.fotosCapturadas.lateral,
        cabeza: this.estado.fotosCapturadas.cabeza,
        tarsos: this.estado.fotosCapturadas.tarsos,
        galeria_opcional: [...this.estado.fotosOpcionalesCapturadas]
      },
      multimedia_urls: {
        lateral: this.estado.fotosCapturadas.lateral,
        cabeza: this.estado.fotosCapturadas.cabeza,
        tarsos: this.estado.fotosCapturadas.tarsos,
        galeria_opcional: [...this.estado.fotosOpcionalesCapturadas]
      },
      geolocalizacion_alta: gpsFinal,
      notas: notas,
      created_at: new Date().toISOString()
    };

    // 1. Guardar en IndexedDB local de inmediato
    await this.db.put('animales', nuevoAnimal);
    this.estado.animales.unshift(nuevoAnimal);

    // 2. Encolar en SyncQueue para sincronización o subir a Supabase
    if (navigator.onLine && this.supabaseClient) {
      try {
        await this.supabaseClient.from('animales').insert([nuevoAnimal]);
        console.log('[Supabase] Guardado directamente en la nube.');
      } catch (err) {
        console.warn('[Supabase] Falló guardado directo, encolando offline:', err);
        await this.db.put('syncQueue', { tipo: 'ALTA_ANIMAL', payload: nuevoAnimal, creado_en: Date.now() });
      }
    } else {
      await this.db.put('syncQueue', { tipo: 'ALTA_ANIMAL', payload: nuevoAnimal, creado_en: Date.now() });
      console.log('[SyncQueue] Encolado para sincronización cuando haya conexión.');
    }

    this.estado.syncQueue = await this.db.getAll('syncQueue');
    this.actualizarContadorSyncQueue();

    // Actualizar UI completa
    this.poblarSelectores();
    this.renderizarCenso();
    this.actualizarKPIs();
    this.limpiarFormularioAlta();

    const regaMsg = codigoRega ? ` (REGA: ${codigoRega})` : '';
    alert(`¡Ejemplar ${nuevoAnimal.codigo_identificacion} dado de alta con éxito en el Libro Genealógico ESGA025${regaMsg}!`);
    this.cambiarTab('censo');
  },

  limpiarFormularioAlta() {
    document.getElementById('form-alta-animal').reset();
    document.getElementById('alta-fecha-nac').valueAsDate = new Date();
    const elRfid = document.getElementById('alta-rfid');
    if (elRfid) elRfid.value = '';
    this.estado.gpsUbicacion = null;
    ['lateral', 'cabeza', 'tarsos'].forEach(tipo => {
      this.eliminarFoto(tipo);
    });

    // Limpiar galería fotográfica opcional
    this.estado.fotosOpcionalesCapturadas = [];
    const inputTituloOpc = document.getElementById('foto-opcional-titulo');
    if (inputTituloOpc) inputTituloOpc.value = '';
    const inCamOpc = document.getElementById('input-foto-camara-opcional');
    if (inCamOpc) inCamOpc.value = '';
    const inGalOpc = document.getElementById('input-foto-galeria-opcional');
    if (inGalOpc) inGalOpc.value = '';
    this.renderizarGaleriaOpcionalAlta();

    const gpsDisplay = document.getElementById('gps-display-box');
    if (gpsDisplay) gpsDisplay.classList.add('hidden');
    const fxPreview = document.getElementById('alta-fx-preview');
    if (fxPreview) fxPreview.classList.add('hidden');

    const btnGpsText = document.getElementById('btn-gps-text');
    if (btnGpsText) btnGpsText.textContent = 'GPS Específico Ave (Opcional)';

    // Mantener selección del aviario activo si existe
    if (this.estado.aviarioActivo) {
      const selectExp = document.getElementById('alta-explotacion');
      if (selectExp) selectExp.value = this.estado.aviarioActivo.id;
    }

    this.actualizarReglasSexo();
    this.generarAnillaSiguiente();
    this.actualizarVistaRegistroAviario();
  },

  // =========================================================================
  // 4. PESTAÑA 2: CENSO OFICIAL, FILTROS Y MODAL DE FICHA INDIVIDUAL
  // =========================================================================

  // Helper de normalización case-insensitive y accent-insensitive (FASE 2)
  normalizarTexto(txt) {
    if (!txt) return '';
    return txt
      .toString()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  },

  coincideTextoFlexible(fuente, busqueda) {
    if (!busqueda) return true;
    if (!fuente) return false;
    const fuenteNorm = this.normalizarTexto(fuente);
    const busquedaNorm = this.normalizarTexto(busqueda);
    return fuenteNorm.includes(busquedaNorm);
  },

  obtenerFotosGaleriaOpcional(animal) {
    if (!animal) return [];
    const galeria = animal.fotos?.galeria_opcional || animal.multimedia_urls?.galeria_opcional || [];
    if (!Array.isArray(galeria)) return [];
    return galeria;
  },

  obtenerFotosCoincidentes(animal, etiquetaBuscada) {
    if (!etiquetaBuscada) return [];
    const fotos = this.obtenerFotosGaleriaOpcional(animal);
    return fotos.filter(foto => {
      const titulo = typeof foto === 'object' && foto.titulo ? foto.titulo : (typeof foto === 'string' ? 'Foto adicional' : '');
      return this.coincideTextoFlexible(titulo, etiquetaBuscada);
    });
  },

  animalTieneFotoConEtiqueta(animal, etiquetaBuscada) {
    if (!etiquetaBuscada) return true;
    const coincidentes = this.obtenerFotosCoincidentes(animal, etiquetaBuscada);
    return coincidentes.length > 0;
  },

  filtrarCenso() {
    this.filtrarCensoEjemplares();
  },

  filtrarCensoEjemplares() {
    const busqueda = (document.getElementById('filtro-buscar')?.value || '').trim();
    const seccion = document.getElementById('filtro-seccion')?.value || 'TODAS';
    const sexo = document.getElementById('filtro-sexo')?.value || 'TODOS';
    const familia = document.getElementById('filtro-familia')?.value || 'TODAS';
    const variedad = document.getElementById('filtro-variedad')?.value || 'TODAS';
    const rega = document.getElementById('filtro-rega')?.value || 'TODOS';
    const edad = document.getElementById('filtro-edad')?.value || 'TODAS';
    const etiquetaGaleria = (document.getElementById('filtro-etiqueta-galeria')?.value || '').trim();

    this.estado.filtros = {
      busqueda,
      seccion,
      sexo,
      familia,
      variedad,
      rega,
      edad,
      etiquetaGaleria
    };

    // Actualizar visibilidad del botón borrar etiqueta
    const btnBorrar = document.getElementById('btn-limpiar-filtro-etiqueta');
    if (btnBorrar) {
      if (etiquetaGaleria) {
        btnBorrar.classList.remove('hidden');
      } else {
        btnBorrar.classList.add('hidden');
      }
    }

    this.actualizarSugerenciasEtiquetas();
    this.renderizarCenso();
  },

  actualizarSugerenciasEtiquetas() {
    const contenedor = document.getElementById('contenedor-chips-etiquetas');
    if (!contenedor) return;

    const contadorEtiquetas = new Map();

    this.estado.animales.forEach(animal => {
      const fotos = this.obtenerFotosGaleriaOpcional(animal);
      fotos.forEach(foto => {
        const tit = typeof foto === 'object' && foto.titulo ? foto.titulo.trim() : '';
        if (tit) {
          const clave = this.normalizarTexto(tit);
          if (!contadorEtiquetas.has(clave)) {
            contadorEtiquetas.set(clave, { label: tit, count: 0, norm: clave });
          }
          contadorEtiquetas.get(clave).count++;
        }
      });
    });

    if (contadorEtiquetas.size === 0) {
      const defaults = ['Exposición 2026', 'Detalle de ala', 'Muda', 'Tarsos', 'Premio'];
      defaults.forEach(d => {
        const c = this.normalizarTexto(d);
        contadorEtiquetas.set(c, { label: d, count: 0, norm: c });
      });
    }

    const etiquetasOrdenadas = Array.from(contadorEtiquetas.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    const filtroActualNorm = this.normalizarTexto(this.estado.filtros?.etiquetaGaleria || '');

    contenedor.innerHTML = etiquetasOrdenadas.map(item => {
      const esActivo = Boolean(filtroActualNorm && this.coincideTextoFlexible(item.norm, filtroActualNorm));
      const clases = esActivo
        ? 'bg-amber-500 text-slate-950 font-bold border-amber-400 shadow-md shadow-amber-500/25 scale-105'
        : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border-slate-700/80';

      return `
        <button type="button" 
                onclick="app.seleccionarChipEtiqueta('${this.escaparHtml(item.label)}')" 
                class="px-2.5 py-1 rounded-full text-[11px] transition-all flex items-center gap-1.5 border cursor-pointer active:scale-95 ${clases}"
                title="Filtrar por etiqueta: ${this.escaparHtml(item.label)}">
          <i class="fa-solid fa-tag text-[9px] ${esActivo ? 'text-slate-950' : 'text-amber-400'}"></i>
          <span>${this.escaparHtml(item.label)}</span>
          ${item.count > 0 ? `
            <span class="px-1.5 py-0.2 rounded-full text-[9px] font-mono font-bold ${
              esActivo ? 'bg-slate-950 text-amber-300' : 'bg-slate-900 text-slate-400'
            }">
              ${item.count}
            </span>
          ` : ''}
        </button>
      `;
    }).join('');
  },

  seleccionarChipEtiqueta(etiqueta) {
    const input = document.getElementById('filtro-etiqueta-galeria');
    if (!input) return;

    const actualNorm = this.normalizarTexto(input.value);
    const clickNorm = this.normalizarTexto(etiqueta);

    if (actualNorm === clickNorm) {
      input.value = '';
    } else {
      input.value = etiqueta;
    }
    this.filtrarCensoEjemplares();
  },

  limpiarFiltroEtiqueta() {
    const input = document.getElementById('filtro-etiqueta-galeria');
    if (input) input.value = '';
    this.filtrarCensoEjemplares();
  },

  obtenerAnimalesFiltrados() {
    const f = this.estado.filtros || {};
    return this.estado.animales.filter(a => {
      // 1. Filtro Sección
      if (f.seccion && f.seccion !== 'TODAS' && a.seccion_libro !== f.seccion) return false;

      // 2. Filtro Sexo
      if (f.sexo && f.sexo !== 'TODOS' && a.sexo !== f.sexo) return false;

      // 3. Filtro Familia
      if (f.familia && f.familia !== 'TODAS' && a.familia_origen !== f.familia) return false;

      // 4. Filtro Variedad
      if (f.variedad && f.variedad !== 'TODAS' && a.variedad !== f.variedad) return false;

      // 5. Filtro REGA
      if (f.rega && f.rega !== 'TODOS') {
        const aRega = (a.codigo_rega || '').toLowerCase();
        const expId = (a.explotacion_id || '').toLowerCase();
        const regaBuscada = f.rega.toLowerCase();
        if (aRega !== regaBuscada && expId !== regaBuscada) return false;
      }

      // 6. Filtro Edad
      if (f.edad && f.edad !== 'TODAS' && a.fecha_nacimiento) {
        const nac = new Date(a.fecha_nacimiento);
        const hoy = new Date();
        const meses = (hoy.getFullYear() - nac.getFullYear()) * 12 + (hoy.getMonth() - nac.getMonth());
        if (f.edad === 'ADULTO' && meses < 12) return false;
        if (f.edad === 'JOVEN' && meses >= 12) return false;
      }

      // 7. Búsqueda General
      if (f.busqueda) {
        const txt = `${a.numero_anilla} ${a.codigo_identificacion} ${a.nombre || ''} ${a.variedad} ${a.codigo_rega || ''}`.toLowerCase();
        if (!this.coincideTextoFlexible(txt, f.busqueda)) return false;
      }

      // 8. BÚSQUEDA Y FILTRADO POR ETIQUETA DE FOTOS OPCIONALES (FASE 2)
      if (f.etiquetaGaleria) {
        if (!this.animalTieneFotoConEtiqueta(a, f.etiquetaGaleria)) {
          return false;
        }
      }

      return true;
    });
  },

  renderizarCenso() {
    const tbody = document.getElementById('tabla-censo-body');
    const msgVacio = document.getElementById('censo-vacio-msg');
    if (!tbody) return;

    tbody.innerHTML = '';

    const filtrados = this.obtenerAnimalesFiltrados();
    this.actualizarConteoExportacion();

    if (filtrados.length === 0) {
      if (msgVacio) msgVacio.classList.remove('hidden');
      return;
    } else {
      if (msgVacio) msgVacio.classList.add('hidden');
    }

    const filtroEtiqueta = (f.etiquetaGaleria || '').trim();

    filtrados.forEach(animal => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-800/40 transition border-b border-slate-800/60';

      const colorSeccion = this.obtenerColorBadgeSeccion(animal.seccion_libro);
      const fx = (animal.coeficiente_consanguinidad || 0);
      const fxColor = fx > 0.0625 ? 'text-red-400 font-bold' : (fx > 0.03 ? 'text-amber-400' : 'text-emerald-400');

      // Foto miniatura
      const fotoThumb = animal.fotos?.lateral || './icons/logo.png';

      // Inspección de fotos opcionales y coincidencias con la etiqueta buscada
      const fotosGaleria = this.obtenerFotosGaleriaOpcional(animal);
      const totalFotosOpcionales = fotosGaleria.length;
      const fotosCoincidentes = filtroEtiqueta ? this.obtenerFotosCoincidentes(animal, filtroEtiqueta) : [];
      const tieneCoincidencia = fotosCoincidentes.length > 0;

      tr.innerHTML = `
        <td class="py-3 px-3">
          <div class="flex items-center gap-2.5">
            <img src="${fotoThumb}" onerror="this.src='./icons/icon-192.png'" class="h-9 w-9 rounded-md object-cover border border-slate-700 bg-slate-950 cursor-pointer" onclick="app.verFichaAnimal('${animal.id}')" title="Ver ficha">
            <div>
              <div class="flex items-center gap-1.5">
                <span class="font-bold text-white font-mono text-xs block cursor-pointer hover:text-amber-400" onclick="app.verFichaAnimal('${animal.id}')">#${animal.numero_anilla}</span>
                ${animal.rfid_chip_id ? `<span class="inline-flex items-center gap-1 text-[9px] text-indigo-300 bg-indigo-950/80 border border-indigo-700/80 px-1 py-0.2 rounded font-mono" title="Transpondedor RFID: ${animal.rfid_chip_id}"><i class="fa-solid fa-microchip text-[8px] text-indigo-400"></i> RFID</span>` : ''}
              </div>
              <span class="text-[10px] text-slate-400 font-sans block">${animal.nombre || 'Sin alias'}</span>
              ${tieneCoincidencia ? `
                <div class="mt-1">
                  <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 cursor-pointer hover:bg-amber-500/30 transition shadow-sm" onclick="app.verFichaAnimal('${animal.id}')" title="Coincide con la etiqueta '${this.escaparHtml(filtroEtiqueta)}'">
                    <i class="fa-solid fa-tag text-[9px] text-amber-400"></i>
                    <span>🏷️ ${fotosCoincidentes.length} foto${fotosCoincidentes.length === 1 ? '' : 's'} '${this.escaparHtml(filtroEtiqueta)}'</span>
                  </span>
                </div>
              ` : ''}
            </div>
          </div>
        </td>
        <td class="py-3 px-3 font-mono font-bold text-slate-300 text-[11px]">${animal.codigo_identificacion}</td>
        <td class="py-3 px-3">
          <span class="inline-flex items-center gap-1 font-sans ${animal.sexo === 'Macho' ? 'text-sky-400' : 'text-pink-400'} font-semibold">
            <i class="fa-solid ${animal.sexo === 'Macho' ? 'fa-mars' : 'fa-venus'}"></i>
            ${animal.sexo} (${animal.calibre_anilla_mm || (animal.sexo === 'Macho' ? 20 : 18)}mm)
          </span>
        </td>
        <td class="py-3 px-3">
          <span class="px-2 py-0.5 rounded text-[10px] font-bold ${colorSeccion}">${animal.seccion_libro}</span>
        </td>
        <td class="py-3 px-3 text-slate-300 font-sans text-xs">${animal.familia_origen || 'Familia A'}</td>
        <td class="py-3 px-3 text-right font-mono text-slate-300">${animal.peso_actual_kg ? animal.peso_actual_kg.toFixed(3) : '--'}</td>
        <td class="py-3 px-3 text-center font-mono ${fxColor}">${(fx * 100).toFixed(2)}%</td>
        <td class="py-3 px-3 text-center">
          <div class="flex flex-col items-center justify-center gap-0.5">
            <span class="text-xs text-slate-400" title="3 tomas oficiales + ${totalFotosOpcionales} en galería opcional">
              <i class="fa-solid fa-camera ${animal.fotos?.lateral ? 'text-emerald-400' : 'text-slate-600'}"></i>
            </span>
            ${tieneCoincidencia ? `
              <span class="px-1.5 py-0.2 rounded text-[9px] font-bold font-mono bg-amber-500/25 text-amber-300 border border-amber-500/40" title="${fotosCoincidentes.length} foto(s) con etiqueta '${this.escaparHtml(filtroEtiqueta)}'">
                🏷️ ${fotosCoincidentes.length}
              </span>
            ` : (totalFotosOpcionales > 0 ? `
              <span class="text-[9px] text-slate-400 font-mono" title="${totalFotosOpcionales} foto(s) en galería opcional">+${totalFotosOpcionales}</span>
            ` : '')}
          </div>
        </td>
        <td class="py-3 px-3 text-center">
          <div class="flex items-center justify-center gap-1.5 font-sans">
            <button onclick="app.generarCertificadoPDF('${animal.id}')" class="px-2 py-1 rounded bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-[11px] flex items-center gap-1 shadow-sm transition" title="📜 Generar Certificado Zootécnico (PDF)">
              <span>📜 Certificado PDF</span>
            </button>
            <button onclick="app.verFichaAnimal('${animal.id}')" class="p-1 rounded hover:bg-slate-700 text-sky-400" title="Ficha completa">
              <i class="fa-solid fa-eye"></i>
            </button>
            <button onclick="app.abrirInspeccionDirecta('${animal.id}')" class="p-1 rounded hover:bg-slate-700 text-emerald-400" title="Calificar 100p">
              <i class="fa-solid fa-clipboard-check"></i>
            </button>
            <button onclick="app.abrirPedigriDirecto('${animal.id}')" class="p-1 rounded hover:bg-slate-700 text-purple-400" title="Pedigrí a 5 generaciones">
              <i class="fa-solid fa-sitemap"></i>
            </button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  },

  obtenerColorBadgeSeccion(seccion) {
    switch (seccion) {
      case 'RF': return 'bg-purple-950 text-purple-300 border border-purple-800';
      case 'RA': return 'bg-orange-950 text-orange-300 border border-orange-800';
      case 'RN': return 'bg-sky-950 text-sky-300 border border-sky-800';
      case 'RD': return 'bg-emerald-950 text-emerald-300 border border-emerald-800';
      case 'RM': return 'bg-amber-950 text-amber-300 border border-amber-800';
      default: return 'bg-slate-800 text-slate-300';
    }
  },

  actualizarKPIs() {
    const total = this.estado.animales.length;
    const machos = this.estado.animales.filter(a => a.sexo === 'Macho').length;
    const hembras = this.estado.animales.filter(a => a.sexo === 'Hembra').length;
    const rd = this.estado.animales.filter(a => a.seccion_libro === 'RD').length;
    const rm = this.estado.animales.filter(a => a.seccion_libro === 'RM').length;

    let sumaFx = 0;
    this.estado.animales.forEach(a => sumaFx += (a.coeficiente_consanguinidad || 0));
    const fxMedia = total > 0 ? (sumaFx / total) * 100 : 0;

    document.getElementById('kpi-total').textContent = total;
    document.getElementById('kpi-machos').textContent = machos;
    document.getElementById('kpi-hembras').textContent = hembras;
    document.getElementById('kpi-rd').textContent = rd;
    document.getElementById('kpi-rm').textContent = rm;
    document.getElementById('kpi-fx-media').textContent = `${fxMedia.toFixed(2)}%`;
  },

  // Modal de Ficha Detallada Individual
  verFichaAnimal(animalId) {
    const animal = this.estado.animales.find(a => a.id === animalId);
    if (!animal) return;

    this.estado.animalSeleccionadoId = animalId;

    document.getElementById('mf-anilla-codigo').textContent = animal.codigo_identificacion;
    document.getElementById('mf-nombre-sexo').textContent = `${animal.nombre || 'Sin alias'} · ${animal.sexo} · ${animal.variedad}`;

    // Mostrar criador y REGA
    const exp = this.estado.explotaciones.find(e => e.id === animal.explotacion_id);
    const rega = animal.codigo_rega || (exp ? (exp.codigo_rega || exp.rega) : 'Sin REGA');
    const criador = animal.titular_nombre || (exp ? (exp.nombre_criadero || exp.nombre_titular) : 'Criador Asociado');
    const elCriadorRega = document.getElementById('mf-criador-rega');
    if (elCriadorRega) {
      const elNombre = document.getElementById('mf-criador-nombre');
      const elRega = document.getElementById('mf-rega-codigo');
      if (elNombre) elNombre.textContent = criador;
      if (elRega) elRega.textContent = `REGA: ${rega}`;
    }
    
    const badgeSec = document.getElementById('mf-badge-seccion');
    badgeSec.textContent = animal.seccion_libro;
    badgeSec.className = `px-2 py-0.5 rounded text-xs font-bold ${this.obtenerColorBadgeSeccion(animal.seccion_libro)}`;

    // Fotos de las 3 tomas
    const defFoto = './icons/logo.png';
    document.getElementById('mf-foto-lateral').src = animal.fotos?.lateral || defFoto;
    document.getElementById('mf-foto-cabeza').src = animal.fotos?.cabeza || defFoto;
    document.getElementById('mf-foto-tarsos').src = animal.fotos?.tarsos || defFoto;

    // Galería de Fotos Adicionales (Opcional) en la Ficha del Censo con soporte para resaltado de etiqueta
    const galeriaOpcional = this.obtenerFotosGaleriaOpcional(animal);
    const seccionGaleria = document.getElementById('mf-galeria-opcional-seccion');
    const gridGaleria = document.getElementById('mf-galeria-opcional-grid');
    const badgeCount = document.getElementById('mf-galeria-opcional-count');

    const filtroEtiqueta = (this.estado.filtros?.etiquetaGaleria || '').trim();

    if (seccionGaleria && gridGaleria) {
      if (Array.isArray(galeriaOpcional) && galeriaOpcional.length > 0) {
        seccionGaleria.classList.remove('hidden');

        let coincidentesCount = 0;
        const fotosConMatch = galeriaOpcional.map(item => {
          const titulo = (typeof item === 'object' && item.titulo) ? item.titulo : '';
          const coincide = Boolean(filtroEtiqueta && this.coincideTextoFlexible(titulo, filtroEtiqueta));
          if (coincide) coincidentesCount++;
          return { item, coincide, titulo };
        });

        if (badgeCount) {
          if (filtroEtiqueta && coincidentesCount > 0) {
            badgeCount.innerHTML = `${galeriaOpcional.length} foto${galeriaOpcional.length === 1 ? '' : 's'} <span class="text-amber-400 font-bold ml-1">(🏷️ ${coincidentesCount} con '${this.escaparHtml(filtroEtiqueta)}')</span>`;
          } else {
            badgeCount.textContent = `${galeriaOpcional.length} foto${galeriaOpcional.length === 1 ? '' : 's'}`;
          }
        }

        gridGaleria.innerHTML = fotosConMatch.map(({ item, coincide, titulo }, idx) => {
          const url = (typeof item === 'string') ? item : (item.url || './icons/logo.png');
          const tituloDisplay = titulo || `Foto adicional #${idx + 1}`;
          const tituloEsc = this.escaparHtml(tituloDisplay);
          const etiquetaPass = coincide ? this.escaparHtml(filtroEtiqueta) : '';

          const borderClases = coincide 
            ? 'ring-2 ring-amber-400 border-2 border-amber-500 shadow-xl shadow-amber-500/25 scale-[1.02]' 
            : 'border-slate-800 hover:border-amber-600/60';

          return `
            <div class="relative bg-slate-950 border ${borderClases} rounded-lg overflow-hidden group cursor-pointer transition-all duration-200 flex flex-col" onclick="app.abrirLightbox('${url}', '${tituloEsc}', '${etiquetaPass}')" title="Ampliar imagen">
              ${coincide ? `
                <div class="absolute top-1.5 right-1.5 z-10 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500 text-slate-950 flex items-center gap-1 shadow-md">
                  <i class="fa-solid fa-tag text-[8px]"></i>
                  <span>Coincidencia</span>
                </div>
              ` : ''}
              <div class="aspect-video sm:aspect-square w-full overflow-hidden bg-slate-900 relative">
                <img src="${url}" class="w-full h-full object-cover group-hover:scale-105 transition duration-300" alt="${tituloEsc}">
                ${coincide ? `<div class="absolute inset-0 bg-amber-500/10 pointer-events-none"></div>` : ''}
              </div>
              <div class="p-1.5 bg-slate-950/95 border-t border-slate-800 text-[10px] font-medium ${coincide ? 'text-amber-300 font-bold' : 'text-slate-300'} truncate text-center" title="${tituloEsc}">
                ${tituloEsc}
              </div>
            </div>
          `;
        }).join('');
      } else {
        seccionGaleria.classList.add('hidden');
        gridGaleria.innerHTML = '';
      }
    }

    document.getElementById('mf-anilla-calibre').textContent = `${animal.numero_anilla} (${animal.calibre_anilla_mm || (animal.sexo === 'Macho' ? 20 : 18)} mm)`;
    document.getElementById('mf-nacimiento').textContent = animal.fecha_nacimiento || '--';
    document.getElementById('mf-peso').textContent = animal.peso_actual_kg ? `${animal.peso_actual_kg.toFixed(3)} kg` : '--';
    document.getElementById('mf-familia').textContent = animal.familia_origen || 'Familia A';
    
    const fx = animal.coeficiente_consanguinidad || 0;
    document.getElementById('mf-fx').textContent = `${fx.toFixed(5)} (${(fx * 100).toFixed(2)}%)`;
    document.getElementById('mf-estado').textContent = animal.estado || 'Activo';

    // Transpondedor RFID oficial
    const elMfRfid = document.getElementById('mf-rfid');
    if (elMfRfid) {
      if (animal.rfid_chip_id) {
        elMfRfid.textContent = animal.rfid_chip_id;
        elMfRfid.className = 'font-bold text-indigo-300 font-mono text-xs';
      } else {
        elMfRfid.textContent = 'Sin transpondedor vinculado';
        elMfRfid.className = 'font-normal text-slate-500 italic text-xs';
      }
    }

    // Progenitores
    const padre = this.estado.animales.find(a => a.id === animal.id_padre);
    const madre = this.estado.animales.find(a => a.id === animal.id_madre);
    document.getElementById('mf-padre-info').textContent = padre ? `${padre.numero_anilla} (${padre.codigo_identificacion})` : 'Sin registrar';
    document.getElementById('mf-madre-info').textContent = madre ? `${madre.numero_anilla} (${madre.codigo_identificacion})` : 'Sin registrar';

    // Inspección morfológica resumen
    const insp = this.estado.inspecciones.find(i => i.animal_id === animal.id);
    const divInsp = document.getElementById('mf-inspeccion-resumen');
    if (insp) {
      divInsp.innerHTML = `
        <div class="flex items-center justify-between">
          <span><strong>Fecha:</strong> ${insp.fecha_inspeccion} | <strong>Calificador:</strong> ${insp.calificador_oficial}</span>
          <span class="font-bold font-mono text-emerald-400">${insp.puntuacion_total} / 100p (${insp.calificacion})</span>
        </div>
        <p class="mt-1 text-slate-400 italic">"${insp.observaciones || 'Sin notas adicionales'}"</p>
      `;
    } else {
      divInsp.textContent = 'Este ejemplar aún no ha sido evaluado en inspección oficial.';
    }

    document.getElementById('modal-ficha-animal').classList.remove('hidden');
  },

  cerrarModalFicha() {
    document.getElementById('modal-ficha-animal').classList.add('hidden');
  },

  abrirInspeccionDesdeModal() {
    const id = this.estado.animalSeleccionadoId;
    this.cerrarModalFicha();
    this.abrirInspeccionDirecta(id);
  },

  abrirPedigriDesdeModal() {
    const id = this.estado.animalSeleccionadoId;
    this.cerrarModalFicha();
    this.abrirPedigriDirecto(id);
  },

  imprimirCertificadoModal() {
    const id = this.estado.animalSeleccionadoId;
    this.generarCertificadoPDF(id);
  },

  verFotoLightbox(tipoToma) {
    const animal = this.estado.animales.find(a => a.id === this.estado.animalSeleccionadoId);
    if (!animal) return;
    const src = animal.fotos?.[tipoToma] || './icons/logo.png';
    const titulos = {
      lateral: 'Toma Lateral Completa (Porte 70º y Pecho Recto)',
      cabeza: 'Toma de Cabeza y Cresta (Orejilla blanca de tamaño medio)',
      tarsos: 'Toma de Tarsos y Patas (Color blanco rosáceo, 4 dedos limpios)'
    };
    this.abrirLightbox(src, titulos[tipoToma] || 'Fotografía in situ');
  },

  cerrarLightbox() {
    document.getElementById('modal-lightbox').classList.add('hidden');
  },

  // =========================================================================
  // 5. PESTAÑA 3: INSPECCIÓN MORFOLÓGICA (100P CNZ 2025) & CONTROL DE PUESTA
  // =========================================================================
  abrirInspeccionDirecta(animalId) {
    this.cambiarTab('inspeccion');
    document.getElementById('inspeccion-animal-select').value = animalId;
    this.cargarAnimalParaInspeccion(animalId);
  },

  cargarAnimalParaInspeccion(animalId) {
    const animal = this.estado.animales.find(a => a.id === animalId);
    const header = document.getElementById('inspeccion-animal-header');
    if (!animal) {
      if (header) header.classList.add('hidden');
      return;
    }

    header.classList.remove('hidden');
    document.getElementById('insp-badge-anilla').textContent = `#${animal.numero_anilla} (${animal.codigo_identificacion})`;
    const bSec = document.getElementById('insp-badge-seccion');
    bSec.textContent = animal.seccion_libro;
    bSec.className = `px-2 py-0.5 rounded text-[10px] font-bold ${this.obtenerColorBadgeSeccion(animal.seccion_libro)}`;
    document.getElementById('insp-badge-sub').textContent = `${animal.sexo} · ${animal.variedad} · Peso: ${animal.peso_actual_kg ? animal.peso_actual_kg.toFixed(3) + ' kg' : '--'}`;

    // Foto miniatura
    const thumb = document.getElementById('inspeccion-foto-thumb');
    thumb.innerHTML = `<img src="${animal.fotos?.lateral || './icons/logo.png'}" class="w-full h-full object-cover">`;

    // Buscar si ya tiene inspección previa para cargar sus datos
    const inspPrevia = this.estado.inspecciones.find(i => i.animal_id === animal.id);
    if (inspPrevia) {
      document.getElementById('insp-prev-score').textContent = `${inspPrevia.puntuacion_total} p (${inspPrevia.calificacion})`;
      document.getElementById('rng-baremo-cabeza').value = inspPrevia.cabeza_cresta_cara;
      document.getElementById('rng-baremo-cuello').value = inspPrevia.cuello_esclavina;
      document.getElementById('rng-baremo-pecho').value = inspPrevia.pecho_tronco;
      document.getElementById('rng-baremo-cola').value = inspPrevia.cola_porte;
      document.getElementById('rng-baremo-tarsos').value = inspPrevia.extremidades_tarsos;
      document.getElementById('rng-baremo-plumaje').value = inspPrevia.plumaje_variedad;
      document.getElementById('rng-baremo-peso').value = inspPrevia.peso_desarrollo;
    } else {
      document.getElementById('insp-prev-score').textContent = 'Sin calificar';
    }

    // Resetear checklist de defectos
    ['orejilla', 'pecho', 'cola', 'tarsos', 'flameado', 'otro'].forEach(d => {
      const chk = document.getElementById(`chk-def-${d}`);
      if (chk) chk.checked = false;
    });

    this.recalcularBaremo();
  },

  recalcularBaremo() {
    // 1. Verificar si hay defectos descalificables activados
    const defOrejilla = document.getElementById('chk-def-orejilla').checked;
    const defPecho = document.getElementById('chk-def-pecho').checked;
    const defCola = document.getElementById('chk-def-cola').checked;
    const defTarsos = document.getElementById('chk-def-tarsos').checked;
    const defFlameado = document.getElementById('chk-def-flameado').checked;
    const defOtro = document.getElementById('chk-def-otro').checked;

    const descalificado = defOrejilla || defPecho || defCola || defTarsos || defFlameado || defOtro;
    const alertaDescalificado = document.getElementById('alerta-descalificado');

    if (descalificado) {
      alertaDescalificado.classList.remove('hidden');
    } else {
      alertaDescalificado.classList.add('hidden');
    }

    // 2. Sumar las 7 regiones anatómicas del Baremo
    const c1 = parseFloat(document.getElementById('rng-baremo-cabeza').value) || 0;
    const c2 = parseFloat(document.getElementById('rng-baremo-cuello').value) || 0;
    const c3 = parseFloat(document.getElementById('rng-baremo-pecho').value) || 0;
    const c4 = parseFloat(document.getElementById('rng-baremo-cola').value) || 0;
    const c5 = parseFloat(document.getElementById('rng-baremo-tarsos').value) || 0;
    const c6 = parseFloat(document.getElementById('rng-baremo-plumaje').value) || 0;
    const c7 = parseFloat(document.getElementById('rng-baremo-peso').value) || 0;

    // Actualizar labels de valores
    document.getElementById('val-baremo-cabeza').textContent = c1.toFixed(1) + ' p';
    document.getElementById('val-baremo-cuello').textContent = c2.toFixed(1) + ' p';
    document.getElementById('val-baremo-pecho').textContent = c3.toFixed(1) + ' p';
    document.getElementById('val-baremo-cola').textContent = c4.toFixed(1) + ' p';
    document.getElementById('val-baremo-tarsos').textContent = c5.toFixed(1) + ' p';
    document.getElementById('val-baremo-plumaje').textContent = c6.toFixed(1) + ' p';
    document.getElementById('val-baremo-peso').textContent = c7.toFixed(1) + ' p';

    const total = c1 + c2 + c3 + c4 + c5 + c6 + c7;
    const totalPtsEl = document.getElementById('baremo-total-pts');
    const badgeVeredicto = document.getElementById('baremo-veredicto-badge');

    totalPtsEl.textContent = total.toFixed(1);

    if (descalificado) {
      totalPtsEl.className = 'text-3xl font-extrabold text-red-500 font-mono';
      badgeVeredicto.className = 'inline-block mt-0.5 px-3 py-1 rounded-lg text-xs font-bold bg-red-950 border border-red-600 text-red-300';
      badgeVeredicto.textContent = 'NO APTO (DESCALIFICADO POR DEFECTO REGLAMENTARIO)';
    } else if (total >= 90.0) {
      totalPtsEl.className = 'text-3xl font-extrabold text-amber-400 font-mono';
      badgeVeredicto.className = 'inline-block mt-0.5 px-3 py-1 rounded-lg text-xs font-bold bg-amber-950 border border-amber-600 text-amber-300';
      badgeVeredicto.textContent = 'EXCELENTE (CANDIDATO A REGISTRO DE MÉRITOS RM)';
    } else if (total >= 70.0) {
      totalPtsEl.className = 'text-3xl font-extrabold text-emerald-400 font-mono';
      badgeVeredicto.className = 'inline-block mt-0.5 px-3 py-1 rounded-lg text-xs font-bold bg-emerald-950 border border-emerald-600 text-emerald-300';
      badgeVeredicto.textContent = 'APTO (PROMOCIÓN AUTOMÁTICA A REGISTRO DEFINITIVO RD)';
    } else {
      totalPtsEl.className = 'text-3xl font-extrabold text-amber-500 font-mono';
      badgeVeredicto.className = 'inline-block mt-0.5 px-3 py-1 rounded-lg text-xs font-bold bg-amber-950 border border-amber-600 text-amber-300';
      badgeVeredicto.textContent = 'NO APTO (PUNTUACIÓN INSUFICIENTE < 70 PUNTOS)';
    }
  },

  async guardarInspeccion() {
    const animalId = document.getElementById('inspeccion-animal-select').value;
    if (!animalId) {
      alert('Por favor, selecciona un ejemplar para calificar.');
      return;
    }

    const animal = this.estado.animales.find(a => a.id === animalId);
    if (!animal) return;

    const datosInsp = this.obtenerDatosInspectorActivo();
    const calificador = document.getElementById('inspeccion-calificador').value.trim() || datosInsp.nombre || 'Inspector Zootécnico';

    const defOrejilla = document.getElementById('chk-def-orejilla').checked;
    const defPecho = document.getElementById('chk-def-pecho').checked;
    const defCola = document.getElementById('chk-def-cola').checked;
    const defTarsos = document.getElementById('chk-def-tarsos').checked;
    const defFlameado = document.getElementById('chk-def-flameado').checked;
    const defOtro = document.getElementById('chk-def-otro').checked;

    const descalificado = defOrejilla || defPecho || defCola || defTarsos || defFlameado || defOtro;

    const c1 = parseFloat(document.getElementById('rng-baremo-cabeza').value) || 0;
    const c2 = parseFloat(document.getElementById('rng-baremo-cuello').value) || 0;
    const c3 = parseFloat(document.getElementById('rng-baremo-pecho').value) || 0;
    const c4 = parseFloat(document.getElementById('rng-baremo-cola').value) || 0;
    const c5 = parseFloat(document.getElementById('rng-baremo-tarsos').value) || 0;
    const c6 = parseFloat(document.getElementById('rng-baremo-plumaje').value) || 0;
    const c7 = parseFloat(document.getElementById('rng-baremo-peso').value) || 0;
    const total = c1 + c2 + c3 + c4 + c5 + c6 + c7;

    let calificacion = 'Apto';
    if (descalificado || total < 70.0) calificacion = 'No Apto';
    else if (total >= 90.0) calificacion = 'Excelente';
    else if (total >= 80.0) calificacion = 'Muy Bueno';

    const nuevaInsp = {
      id: 'insp-' + Date.now(),
      animal_id: animalId,
      fecha_inspeccion: new Date().toISOString().split('T')[0],
      calificador_oficial: calificador,
      inspector_id: datosInsp.id,
      inspector_usuario_id: datosInsp.usuario_id,
      firma_inspector_base64: datosInsp.firma_base64 || null,
      cabeza_cresta_cara: c1,
      cuello_esclavina: c2,
      pecho_tronco: c3,
      cola_porte: c4,
      extremidades_tarsos: c5,
      plumaje_variedad: c6,
      peso_desarrollo: c7,
      puntuacion_total: total,
      defecto_orejilla_no_blanca: defOrejilla,
      defecto_pecho_prominente: defPecho,
      defecto_cola_baja: defCola,
      defecto_tarsos_anomalos: defTarsos,
      defecto_flameado_esclavina: defFlameado,
      descalificado: descalificado,
      calificacion: calificacion,
      observaciones: `Inspección oficial realizada conforme al Protocolo CNZ de 5 de junio de 2025. Puntuación: ${total.toFixed(1)}/100p.`
    };

    // Actualización automática de sección en el libro (Regla zootécnica oficial)
    if (!descalificado && total >= 70.0) {
      if (total >= 90.0) {
        animal.seccion_libro = 'RM'; // Registro de Méritos
      } else if (animal.seccion_libro === 'RN' || animal.seccion_libro === 'RA') {
        animal.seccion_libro = 'RD'; // Registro Definitivo
      }
      await this.db.put('animales', animal);
    }

    await this.db.put('inspecciones', nuevaInsp);
    this.estado.inspecciones.unshift(nuevaInsp);

    // Encolar o sincronizar
    if (navigator.onLine && this.supabaseClient) {
      try {
        await this.supabaseClient.from('inspecciones_morfologicas').insert([nuevaInsp]);
        await this.supabaseClient.from('animales').update({ seccion_libro: animal.seccion_libro }).eq('id', animal.id);
      } catch (err) {
        await this.db.put('syncQueue', { tipo: 'INSPECCION', payload: nuevaInsp, creado_en: Date.now() });
      }
    } else {
      await this.db.put('syncQueue', { tipo: 'INSPECCION', payload: nuevaInsp, creado_en: Date.now() });
    }

    this.actualizarContadorSyncQueue();
    this.renderizarCenso();
    this.actualizarKPIs();
    this.cargarAnimalParaInspeccion(animalId);

    alert(`¡Calificación registrada con éxito! Puntuación: ${total.toFixed(1)}p (${calificacion}). Sección actual del animal: ${animal.seccion_libro}`);
  },

  async guardarControlPuesta(event) {
    event.preventDefault();
    const animalId = document.getElementById('puesta-form-animal-select')?.value || document.getElementById('inspeccion-animal-select')?.value;
    if (!animalId) {
      alert('Por favor, selecciona primero una gallina en el formulario o en el selector superior.');
      return;
    }

    const animal = this.estado.animales.find(a => a.id === animalId);
    if (!animal || animal.sexo !== 'Hembra') {
      alert('El control de puesta oficial solo puede realizarse sobre ejemplares hembra (gallinas).');
      return;
    }

    const fInicio = document.getElementById('puesta-inicio').value;
    const fFin = new Date(new Date(fInicio).getTime() + 15 * 86400000).toISOString().split('T')[0];
    const totalHuevos = parseInt(document.getElementById('puesta-total-huevos').value, 10);
    const pesoHuevo = parseFloat(document.getElementById('puesta-peso-huevo').value);
    const colorCascara = document.getElementById('puesta-color-cascara').value;

    const enRangoPeso = (pesoHuevo >= 55.0 && pesoHuevo <= 70.0);
    const colorConforme = colorCascara.includes('crema');
    const conforme = (enRangoPeso && colorConforme);

    const u = this.estado.usuarioActivo;
    const aviario = this.estado.aviario || this.estado.aviarioActivo;

    const nuevoControl = {
      id: 'puesta-' + Date.now(),
      animal_id: animalId,
      usuario_id: u?.id || animal.usuario_id || null,
      explotacion_id: aviario?.id || animal.explotacion_id || null,
      codigo_rega: aviario?.codigo_rega || aviario?.rega || animal.codigo_rega || u?.rega || null,
      fecha_inicio: fInicio,
      fecha_fin: fFin,
      total_huevos_15d: totalHuevos,
      peso_medio_huevo_g: pesoHuevo,
      color_cascara: colorCascara,
      calidad_cascara: conforme ? 'Excelente' : (pesoHuevo < 55.0 || pesoHuevo > 70.0 ? 'Defectuosa (Peso)' : 'No estándar (Color)'),
      conforme_estandar: conforme,
      observaciones: `Prueba individual de 15 días: ${totalHuevos} huevos. Peso medio: ${pesoHuevo} g. ${conforme ? 'Conforme estándar racial ESGA025.' : 'Descarte para incubación.'}`
    };

    await this.db.put('controlesPuesta', nuevoControl);
    this.estado.controlesPuesta.unshift(nuevoControl);

    if (navigator.onLine && this.supabaseClient) {
      try {
        await this.supabaseClient.from('controles_puesta').insert([nuevoControl]);
      } catch (err) {
        await this.db.put('syncQueue', { tipo: 'CONTROL_PUESTA', payload: nuevoControl, creado_en: Date.now() });
      }
    } else {
      await this.db.put('syncQueue', { tipo: 'CONTROL_PUESTA', payload: nuevoControl, creado_en: Date.now() });
    }

    this.actualizarContadorSyncQueue();
    this.renderizarAnaliticaPuesta();
    alert(`¡Control de puesta registrado con éxito!\n• Total huevos: ${totalHuevos} (Tasa Hen-Day: ${((totalHuevos / 15) * 100).toFixed(1)}%)\n• Peso medio: ${pesoHuevo.toFixed(1)} g\n• Conforme al estándar racial (55-70 g, Blanco crema): ${conforme ? 'SÍ (Apto incubación)' : 'NO (Descarte incubación)'}`);
    document.getElementById('form-control-puesta').reset();
    this.cambiarSubtabPuesta('analitica');
  },

  // =========================================================================
  // 5.8 MÓDULO DE ANALÍTICA VISUAL Y CURVAS DE PUESTA (FASE 4)
  // Estándar oficial Gallina Alacantina ESGA025 (55 g - 70 g, Blanco Crema)
  // =========================================================================

  obtenerControlesPuestaSemilla() {
    const base = [
      {
        id: 'puesta-sem-01',
        animal_id: 'alac-002', // Reina del Vinalopó (Familia A)
        fecha_inicio: '2026-01-10',
        fecha_fin: '2026-01-25',
        total_huevos_15d: 12,
        peso_medio_huevo_g: 62.5,
        color_cascara: 'Blanco crema',
        calidad_cascara: 'Excelente',
        conforme_estandar: true,
        observaciones: 'Puesta invernal óptima. Huevo uniforme y cutícula blanco crema apta para incubación.'
      },
      {
        id: 'puesta-sem-02',
        animal_id: 'alac-004', // Dama de Elche (Familia B)
        fecha_inicio: '2026-01-15',
        fecha_fin: '2026-01-30',
        total_huevos_15d: 11,
        peso_medio_huevo_g: 59.0,
        color_cascara: 'Blanco crema',
        calidad_cascara: 'Buena',
        conforme_estandar: true,
        observaciones: 'Prueba oficial lote Gobe Familia B. Calibre medio estándar 59.0 g.'
      },
      {
        id: 'puesta-sem-03',
        animal_id: 'alac-006', // Palmera Blanca (Familia C)
        fecha_inicio: '2026-02-01',
        fecha_fin: '2026-02-16',
        total_huevos_15d: 10,
        peso_medio_huevo_g: 53.5, // ALERTA: < 55 g
        color_cascara: 'Blanco crema',
        calidad_cascara: 'Buena',
        conforme_estandar: false,
        observaciones: 'Primer ciclo joven: peso 53.5 g inferior al umbral de 55 g. Descarte para incubación.'
      },
      {
        id: 'puesta-sem-04',
        animal_id: 'alac-002', // Reina del Vinalopó
        fecha_inicio: '2026-02-12',
        fecha_fin: '2026-02-27',
        total_huevos_15d: 13,
        peso_medio_huevo_g: 63.8,
        color_cascara: 'Blanco crema',
        calidad_cascara: 'Excelente',
        conforme_estandar: true,
        observaciones: 'Pico de puesta invernal (86.7% Hen-Day). Excelente vigor genético.'
      },
      {
        id: 'puesta-sem-05',
        animal_id: 'alac-004', // Dama de Elche
        fecha_inicio: '2026-02-15',
        fecha_fin: '2026-03-02',
        total_huevos_15d: 12,
        peso_medio_huevo_g: 61.2,
        color_cascara: 'Blanco crema',
        calidad_cascara: 'Excelente',
        conforme_estandar: true,
        observaciones: 'Lote Gobe reproductor. Peso óptimo en rango medio.'
      },
      {
        id: 'puesta-sem-06',
        animal_id: 'alac-006', // Palmera Blanca
        fecha_inicio: '2026-03-01',
        fecha_fin: '2026-03-16',
        total_huevos_15d: 12,
        peso_medio_huevo_g: 56.5,
        color_cascara: 'Blanco crema',
        calidad_cascara: 'Buena',
        conforme_estandar: true,
        observaciones: 'Peso normalizado a 56.5 g tras madurez, entrando en estándar oficial ESGA025.'
      },
      {
        id: 'puesta-sem-07',
        animal_id: 'alac-002', // Reina del Vinalopó
        fecha_inicio: '2026-03-10',
        fecha_fin: '2026-03-25',
        total_huevos_15d: 14,
        peso_medio_huevo_g: 64.5,
        color_cascara: 'Blanco crema',
        calidad_cascara: 'Excelente',
        conforme_estandar: true,
        observaciones: 'Pico de producción primaveral: 93.3% Hen-Day con 64.5 g de peso medio.'
      },
      {
        id: 'puesta-sem-08',
        animal_id: 'alac-004', // Dama de Elche
        fecha_inicio: '2026-03-15',
        fecha_fin: '2026-03-30',
        total_huevos_15d: 13,
        peso_medio_huevo_g: 62.0,
        color_cascara: 'Blanco puro',
        calidad_cascara: 'Buena',
        conforme_estandar: true,
        observaciones: 'Cutícula blanco puro sin motas. Apto para incubación.'
      },
      {
        id: 'puesta-sem-09',
        animal_id: 'alac-006', // Palmera Blanca
        fecha_inicio: '2026-04-01',
        fecha_fin: '2026-04-16',
        total_huevos_15d: 11,
        peso_medio_huevo_g: 58.0,
        color_cascara: 'Blanco crema',
        calidad_cascara: 'Excelente',
        conforme_estandar: true,
        observaciones: 'Línea de puesta regular con 73.3% de intensidad Hen-Day.'
      },
      {
        id: 'puesta-sem-10',
        animal_id: 'alac-004', // Dama de Elche
        fecha_inicio: '2026-04-10',
        fecha_fin: '2026-04-25',
        total_huevos_15d: 9,
        peso_medio_huevo_g: 57.0,
        color_cascara: 'Moteado / Anomalía',
        calidad_cascara: 'Defectuosa',
        conforme_estandar: false,
        observaciones: 'Presencia de porosidades rugosas y moteado anormal. Descarte estricto para incubación.'
      }
    ];
    return base.map(c => ({
      ...c,
      usuario_id: 'usr-criador-01',
      explotacion_id: 'exp-01',
      codigo_rega: 'ES030140001234'
    }));
  },

  cambiarSubtabPuesta(subtab) {
    const tabs = ['analitica', 'rfid', 'registro', 'tabla', 'incubacion'];
    tabs.forEach(t => {
      const btn = document.getElementById(`btn-subtab-${t}-puesta`);
      const panel = document.getElementById(`subtab-${t}-puesta`);
      if (btn) {
        if (t === subtab) {
          btn.className = 'subtab-puesta-btn px-3 py-1.5 rounded-lg text-xs font-bold transition text-amber-400 bg-slate-800 border border-amber-500/30 flex items-center gap-1.5 shadow-sm';
        } else {
          btn.className = 'subtab-puesta-btn px-3 py-1.5 rounded-lg text-xs font-semibold transition text-slate-400 hover:text-white hover:bg-slate-900 border-transparent flex items-center gap-1.5';
        }
      }
      if (panel) {
        if (t === subtab) {
          panel.classList.remove('hidden');
        } else {
          panel.classList.add('hidden');
        }
      }
    });

    if (subtab === 'analitica') {
      setTimeout(() => {
        this.renderizarAnaliticaPuesta();
      }, 50);
    } else if (subtab === 'rfid') {
      this.poblarSelectoresRfid();
    } else if (subtab === 'tabla') {
      this.renderizarTablaHistorialPuesta();
    } else if (subtab === 'incubacion') {
      this.renderizarModuloIncubacion();
    } else if (subtab === 'registro') {
      const selectAnimal = document.getElementById('puesta-form-animal-select');
      const inspAnimal = document.getElementById('inspeccion-animal-select')?.value;
      if (selectAnimal && !selectAnimal.value && inspAnimal) {
        const animal = this.estado.animales.find(a => a.id === inspAnimal);
        if (animal && animal.sexo === 'Hembra') {
          selectAnimal.value = inspAnimal;
        }
      }
    }
  },

  poblarSelectoresAnaliticaPuesta() {
    const gallinasPropias = (this.estado.animales || []).filter(a => a.sexo === 'Hembra' && this.perteneceAUsuarioActivo(a));
    const lotesPropios = (this.estado.lotes || []).filter(l => this.perteneceAUsuarioActivo(l));

    // 1. Selector de gallina para analítica
    const selectAnimal = document.getElementById('filtro-analitica-animal');
    if (selectAnimal) {
      const valActual = selectAnimal.value;
      selectAnimal.innerHTML = '<option value="TODAS">Todas las gallinas reproductoras</option>';
      gallinasPropias.forEach(a => {
        const opt = document.createElement('option');
        opt.value = a.id;
        opt.textContent = `#${a.numero_anilla} - ${a.nombre || a.codigo_identificacion} (${a.familia_origen})`;
        selectAnimal.appendChild(opt);
      });
      if (valActual && (valActual === 'TODAS' || gallinasPropias.some(a => a.id === valActual))) {
        selectAnimal.value = valActual;
      }
    }

    // 2. Selector de lotes para analítica
    const optgroupLotes = document.getElementById('optgroup-analitica-lotes');
    if (optgroupLotes) {
      optgroupLotes.innerHTML = '';
      lotesPropios.forEach(lote => {
        const opt = document.createElement('option');
        opt.value = lote.codigo_lote || lote.id;
        opt.textContent = `${lote.codigo_lote} (${lote.familia_macho} → ${lote.familia_receptora})`;
        optgroupLotes.appendChild(opt);
      });
    }

    // 3. Selector del formulario de registro de puesta
    const selectFormAnimal = document.getElementById('puesta-form-animal-select');
    if (selectFormAnimal) {
      const valActual = selectFormAnimal.value;
      selectFormAnimal.innerHTML = '<option value="">Selecciona una gallina...</option>';
      gallinasPropias.forEach(a => {
        const opt = document.createElement('option');
        opt.value = a.id;
        opt.textContent = `#${a.numero_anilla} (${a.codigo_identificacion}) - ${a.nombre || 'Gallina'} [${a.familia_origen}]`;
        selectFormAnimal.appendChild(opt);
      });
      if (valActual && gallinasPropias.some(a => a.id === valActual)) {
        selectFormAnimal.value = valActual;
      }
    }
  },

  obtenerControlesPuestaFiltrados() {
    const animalId = document.getElementById('filtro-analitica-animal')?.value || 'TODAS';
    const loteFamilia = document.getElementById('filtro-analitica-lote')?.value || 'TODOS';
    const periodo = document.getElementById('filtro-analitica-periodo')?.value || 'TODAS';

    // Aislar estrictamente para el usuario/aviario autenticado
    let lista = (this.estado.controlesPuesta || []).filter(c => {
      if (this.perteneceAUsuarioActivo(c)) return true;
      const animal = this.estado.animales.find(a => a.id === c.animal_id);
      return Boolean(animal && this.perteneceAUsuarioActivo(animal));
    });

    // Filtro por animal
    if (animalId && animalId !== 'TODAS') {
      lista = lista.filter(c => c.animal_id === animalId);
    }

    // Filtro por Lote o Familia
    if (loteFamilia && loteFamilia !== 'TODOS') {
      if (loteFamilia.startsWith('Familia')) {
        lista = lista.filter(c => {
          const animal = this.estado.animales.find(a => a.id === c.animal_id);
          return animal && animal.familia_origen === loteFamilia;
        });
      } else {
        // Es código de lote
        const lote = (this.estado.lotes || []).find(l => l.codigo_lote === loteFamilia || l.id === loteFamilia);
        if (lote && Array.isArray(lote.gallinas_ids)) {
          lista = lista.filter(c => lote.gallinas_ids.includes(c.animal_id));
        }
      }
    }

    // Filtro por Periodo temporal
    if (periodo && periodo !== 'TODAS') {
      const hoy = new Date();
      if (periodo === '15DIAS') {
        // Tomar la prueba más reciente por animal o las últimas pruebas
        lista.sort((a, b) => new Date(b.fecha_inicio) - new Date(a.fecha_inicio));
        const vistas = new Set();
        lista = lista.filter(c => {
          if (!vistas.has(c.animal_id)) {
            vistas.add(c.animal_id);
            return true;
          }
          return false;
        });
      } else if (periodo === 'MENSUAL') {
        const limite60d = new Date(hoy.getTime() - 60 * 86400000);
        lista = lista.filter(c => new Date(c.fecha_inicio) >= limite60d);
      } else if (periodo === 'ANUAL') {
        const anioActual = hoy.getFullYear();
        lista = lista.filter(c => new Date(c.fecha_inicio).getFullYear() === anioActual);
      }
    }

    // Ordenar cronológicamente (ascendente) para las curvas
    lista.sort((a, b) => new Date(a.fecha_inicio) - new Date(b.fecha_inicio));
    return lista;
  },

  calcularZootecniaPuesta(controles) {
    const total = controles.length;
    let sumaHuevos = 0;
    let sumaHenDays = 0;
    let sumaPesos = 0;

    let blancoCrema = 0;
    let blancoPuro = 0;
    let tostado = 0;
    let anomalia = 0;

    const alertas = [];

    controles.forEach(c => {
      const huevos = Number(c.total_huevos_15d) || 0;
      const peso = Number(c.peso_medio_huevo_g) || 0;
      const color = c.color_cascara || 'Blanco crema';

      sumaHuevos += huevos;
      sumaPesos += peso;

      const fIni = new Date(c.fecha_inicio);
      const fFin = new Date(c.fecha_fin);
      const dias = Math.max(1, Math.round((fFin - fIni) / 86400000)) || 15;
      sumaHenDays += dias;

      // Desglose de cáscara
      if (color === 'Blanco crema') {
        blancoCrema++;
      } else if (color === 'Blanco puro') {
        blancoPuro++;
      } else if (color.includes('Tostado')) {
        tostado++;
      } else {
        anomalia++;
      }

      // Marcado de alerta: Fuera de 55-70 g o defecto de cáscara
      if (peso < 55.0 || peso > 70.0 || color.includes('Anomalía') || color.includes('Moteado')) {
        alertas.push({
          control: c,
          motivo: peso < 55.0 ? `Peso bajo (${peso.toFixed(1)} g < 55 g)` : (peso > 70.0 ? `Peso alto (${peso.toFixed(1)} g > 70 g)` : `Cáscara defectuosa (${color})`)
        });
      }
    });

    const tasaHenDay = sumaHenDays > 0 ? (sumaHuevos / sumaHenDays) * 100 : 0;
    const pesoMedio = total > 0 ? sumaPesos / total : 0;
    const pctBlancoCrema = total > 0 ? (blancoCrema / total) * 100 : 0;

    return {
      total,
      sumaHuevos,
      sumaHenDays,
      tasaHenDay,
      pesoMedio,
      blancoCrema,
      blancoPuro,
      tostado,
      anomalia,
      pctBlancoCrema,
      alertas
    };
  },

  actualizarKPIsPuesta(calculos) {
    const kpiHenDay = document.getElementById('kpi-puesta-henday');
    const kpiHenDaySub = document.getElementById('kpi-puesta-henday-sub');
    const kpiPeso = document.getElementById('kpi-puesta-pesomedio');
    const kpiPesoSub = document.getElementById('kpi-puesta-pesomedio-sub');
    const kpiConf = document.getElementById('kpi-puesta-conformidad');
    const kpiConfSub = document.getElementById('kpi-puesta-conformidad-sub');
    const kpiAlertas = document.getElementById('kpi-puesta-alertas');
    const badgeTotal = document.getElementById('badge-total-controles-filtrados');

    if (badgeTotal) {
      badgeTotal.textContent = `${calculos.total} ${calculos.total === 1 ? 'prueba' : 'pruebas'}`;
    }

    if (kpiHenDay) {
      kpiHenDay.textContent = `${calculos.tasaHenDay.toFixed(1)}%`;
      if (kpiHenDaySub) {
        kpiHenDaySub.textContent = calculos.tasaHenDay >= 75 ? 'Rendimiento óptimo' : (calculos.tasaHenDay >= 60 ? 'Rendimiento estándar' : 'Rendimiento bajo');
      }
    }

    if (kpiPeso) {
      kpiPeso.textContent = `${calculos.pesoMedio.toFixed(1)} g`;
      if (kpiPesoSub) {
        const enRango = calculos.pesoMedio >= 55.0 && calculos.pesoMedio <= 70.0;
        kpiPesoSub.textContent = enRango ? '✓ Conforme (55-70 g)' : (calculos.pesoMedio < 55.0 ? '⚠️ Menor a 55 g' : '⚠️ Mayor a 70 g');
        kpiPesoSub.className = enRango ? 'text-[10px] text-emerald-400 block' : 'text-[10px] text-rose-400 font-bold block';
      }
    }

    if (kpiConf) {
      kpiConf.textContent = `${calculos.pctBlancoCrema.toFixed(1)}%`;
      if (kpiConfSub) {
        kpiConfSub.textContent = `${calculos.blancoCrema} de ${calculos.total} pruebas`;
      }
    }

    if (kpiAlertas) {
      kpiAlertas.textContent = calculos.alertas.length;
      kpiAlertas.className = calculos.alertas.length > 0 ? 'text-xl font-extrabold text-rose-400 font-mono animate-pulse' : 'text-xl font-extrabold text-slate-400 font-mono';
    }

    // Actualizar estadísticas numéricas de cáscara
    const statCrema = document.getElementById('stat-cascara-crema');
    const statBlanco = document.getElementById('stat-cascara-blanco');
    const statTostado = document.getElementById('stat-cascara-tostado');
    const statAnomalia = document.getElementById('stat-cascara-anomalia');

    const tot = calculos.total || 1;
    if (statCrema) statCrema.textContent = `${((calculos.blancoCrema / tot) * 100).toFixed(1)}% (${calculos.blancoCrema})`;
    if (statBlanco) statBlanco.textContent = `${((calculos.blancoPuro / tot) * 100).toFixed(1)}% (${calculos.blancoPuro})`;
    if (statTostado) statTostado.textContent = `${((calculos.tostado / tot) * 100).toFixed(1)}% (${calculos.tostado})`;
    if (statAnomalia) statAnomalia.textContent = `${((calculos.anomalia / tot) * 100).toFixed(1)}% (${calculos.anomalia})`;

    // Banner de alertas
    const bannerAlerta = document.getElementById('banner-alerta-incubacion');
    const bannerMsg = document.getElementById('banner-alerta-incubacion-msg');
    if (bannerAlerta && bannerMsg) {
      if (calculos.alertas.length > 0) {
        bannerAlerta.classList.remove('hidden');
        const detalles = calculos.alertas.map(a => {
          const hen = this.estado.animales.find(an => an.id === a.control.animal_id);
          const anilla = hen ? `#${hen.numero_anilla}` : 'Gallina';
          return `${anilla} (${a.control.fecha_inicio}): ${a.motivo}`;
        }).slice(0, 3).join(' · ');
        bannerMsg.textContent = `Se han detectado ${calculos.alertas.length} prueba(s) con huevos no aptos para incubación (fuera de 55-70 g o con defectos de cáscara). Detalle: ${detalles}${calculos.alertas.length > 3 ? '...' : ''}.`;
      } else {
        bannerAlerta.classList.add('hidden');
      }
    }
  },

  renderizarAnaliticaPuesta() {
    const controles = this.obtenerControlesPuestaFiltrados();
    const calculos = this.calcularZootecniaPuesta(controles);

    this.actualizarKPIsPuesta(calculos);
    this.renderizarGraficosPuesta(controles, calculos);
    this.renderizarTablaHistorialPuesta(controles);
  },

  renderizarGraficosPuesta(controles, calculos) {
    const ctx1 = document.getElementById('chart-intensidad-puesta');
    const ctx2 = document.getElementById('chart-peso-huevo');
    const ctx3 = document.getElementById('chart-calidad-cascara');

    if (!ctx1 || !ctx2 || !ctx3) return;

    // Destruir gráficos previos de Chart.js si existen
    if (this.chartsPuesta.intensidad) {
      this.chartsPuesta.intensidad.destroy();
      this.chartsPuesta.intensidad = null;
    }
    if (this.chartsPuesta.peso) {
      this.chartsPuesta.peso.destroy();
      this.chartsPuesta.peso = null;
    }
    if (this.chartsPuesta.cascara) {
      this.chartsPuesta.cascara.destroy();
      this.chartsPuesta.cascara = null;
    }

    // Si Chart.js está cargado, usar Chart.js con configuraciones zootécnicas
    if (typeof Chart !== 'undefined') {
      this.renderizarGraficosChartJs(ctx1, ctx2, ctx3, controles, calculos);
    } else {
      // Fallback nativo Canvas HTML5
      this.renderizarGraficosFallbackCanvas(ctx1, ctx2, ctx3, controles, calculos);
    }
  },

  renderizarGraficosChartJs(ctx1, ctx2, ctx3, controles, calculos) {
    const labels = controles.map(c => {
      const d = new Date(c.fecha_inicio);
      const hen = this.estado.animales.find(a => a.id === c.animal_id);
      const anilla = hen ? `#${hen.numero_anilla}` : '';
      return `${d.getDate()} ${d.toLocaleString('es-ES', { month: 'short' })} ${anilla}`.trim();
    });

    const dataHenDay = controles.map(c => {
      const fIni = new Date(c.fecha_inicio);
      const fFin = new Date(c.fecha_fin);
      const dias = Math.max(1, Math.round((fFin - fIni) / 86400000)) || 15;
      return Number(((Number(c.total_huevos_15d) / dias) * 100).toFixed(1));
    });

    const dataRefHenDay = controles.map(() => 75.0);

    const dataPesos = controles.map(c => Number(c.peso_medio_huevo_g));
    const dataMin55 = controles.map(() => 55.0);
    const dataMax70 = controles.map(() => 70.0);
    const pointColors = controles.map(c => (c.peso_medio_huevo_g < 55.0 || c.peso_medio_huevo_g > 70.0) ? '#f43f5e' : '#10b981');
    const pointRadii = controles.map(c => (c.peso_medio_huevo_g < 55.0 || c.peso_medio_huevo_g > 70.0) ? 7 : 5);

    // 1. GRÁFICO 1: Intensidad de Puesta (%)
    this.chartsPuesta.intensidad = new Chart(ctx1, {
      type: 'line',
      data: {
        labels: labels.length > 0 ? labels : ['Sin datos'],
        datasets: [
          {
            label: 'Tasa Hen-Day Production (%)',
            data: dataHenDay.length > 0 ? dataHenDay : [0],
            borderColor: '#f59e0b',
            backgroundColor: 'rgba(245, 158, 11, 0.15)',
            fill: true,
            tension: 0.35,
            borderWidth: 2.5,
            pointBackgroundColor: '#f59e0b',
            pointBorderColor: '#0f172a',
            pointBorderWidth: 1.5,
            pointRadius: 5,
            pointHoverRadius: 8
          },
          {
            label: 'Objetivo Zootécnico (75%)',
            data: dataRefHenDay.length > 0 ? dataRefHenDay : [75],
            borderColor: 'rgba(56, 189, 248, 0.65)',
            borderDash: [6, 4],
            borderWidth: 2,
            fill: false,
            pointRadius: 0
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: { color: '#cbd5e1', font: { size: 10, family: 'monospace' } }
          },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y}%`
            }
          }
        },
        scales: {
          y: {
            min: 0,
            max: 100,
            ticks: {
              color: '#94a3b8',
              callback: (val) => val + '%'
            },
            grid: { color: 'rgba(51, 65, 85, 0.4)' }
          },
          x: {
            ticks: { color: '#94a3b8', maxRotation: 45, minRotation: 0, font: { size: 10 } },
            grid: { color: 'rgba(51, 65, 85, 0.2)' }
          }
        }
      }
    });

    // 2. GRÁFICO 2: Evolución del Peso Medio del Huevo (g)
    this.chartsPuesta.peso = new Chart(ctx2, {
      type: 'line',
      data: {
        labels: labels.length > 0 ? labels : ['Sin datos'],
        datasets: [
          {
            label: 'Peso Medio Huevo (g)',
            data: dataPesos.length > 0 ? dataPesos : [60],
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            borderWidth: 2.5,
            tension: 0.3,
            fill: false,
            pointBackgroundColor: pointColors.length > 0 ? pointColors : ['#10b981'],
            pointBorderColor: '#ffffff',
            pointBorderWidth: 1.5,
            pointRadius: pointRadii.length > 0 ? pointRadii : [5],
            pointHoverRadius: 9
          },
          {
            label: 'Mínimo Estándar (55.0 g)',
            data: dataMin55.length > 0 ? dataMin55 : [55],
            borderColor: 'rgba(245, 158, 11, 0.85)',
            borderDash: [5, 5],
            borderWidth: 2,
            fill: false,
            pointRadius: 0
          },
          {
            label: 'Máximo Estándar (70.0 g)',
            data: dataMax70.length > 0 ? dataMax70 : [70],
            borderColor: 'rgba(244, 63, 94, 0.85)',
            borderDash: [5, 5],
            borderWidth: 2,
            fill: false,
            pointRadius: 0
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: { color: '#cbd5e1', font: { size: 10, family: 'monospace' } }
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const val = ctx.parsed.y;
                if (ctx.datasetIndex === 0) {
                  const alerta = (val < 55.0 || val > 70.0) ? ' ⚠️ DESCARTE INCUBACIÓN' : ' ✓ CONFORME ESGA025';
                  return ` Peso: ${val} g ${alerta}`;
                }
                return ` ${ctx.dataset.label}: ${val} g`;
              }
            }
          }
        },
        scales: {
          y: {
            min: 45,
            max: 75,
            ticks: {
              color: '#94a3b8',
              callback: (val) => val + ' g'
            },
            grid: { color: 'rgba(51, 65, 85, 0.4)' }
          },
          x: {
            ticks: { color: '#94a3b8', maxRotation: 45, minRotation: 0, font: { size: 10 } },
            grid: { color: 'rgba(51, 65, 85, 0.2)' }
          }
        }
      }
    });

    // 3. GRÁFICO 3: Distribución de Calidad de Cáscara
    this.chartsPuesta.cascara = new Chart(ctx3, {
      type: 'doughnut',
      data: {
        labels: [
          'Blanco Crema (Oficial)',
          'Blanco Puro',
          'Tostado Claro',
          'Moteado / Anomalía'
        ],
        datasets: [
          {
            data: [
              calculos.blancoCrema,
              calculos.blancoPuro,
              calculos.tostado,
              calculos.anomalia
            ],
            backgroundColor: [
              '#f59e0b',
              '#38bdf8',
              '#fb923c',
              '#f43f5e'
            ],
            borderColor: '#0f172a',
            borderWidth: 2,
            hoverOffset: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: '#cbd5e1', font: { size: 10, family: 'monospace' }, boxWidth: 12 }
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                const val = ctx.raw;
                const pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
                return ` ${ctx.label}: ${val} (${pct}%)`;
              }
            }
          }
        },
        cutout: '62%'
      }
    });
  },

  renderizarGraficosFallbackCanvas(ctx1, ctx2, ctx3, controles, calculos) {
    this.dibujarCanvasIntensidadFallback(ctx1, controles);
    this.dibujarCanvasPesoFallback(ctx2, controles);
    this.dibujarCanvasCascaraFallback(ctx3, calculos);
  },

  dibujarCanvasIntensidadFallback(canvas, controles) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width = canvas.parentElement?.clientWidth || 400;
    const h = canvas.height = 240;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, w, h);

    const padL = 40, padR = 20, padT = 30, padB = 40;
    const chartW = w - padL - padR;
    const chartH = h - padT - padB;

    // Ejes y rejilla
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.4)';
    ctx.lineWidth = 1;
    for (let p = 0; p <= 100; p += 25) {
      const y = padT + chartH - (p / 100) * chartH;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + chartW, y);
      ctx.stroke();

      ctx.fillStyle = '#64748b';
      ctx.font = '10px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(p + '%', padL - 6, y + 3);
    }

    // Línea objetivo 75%
    const y75 = padT + chartH - 0.75 * chartH;
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(padL, y75);
    ctx.lineTo(padL + chartW, y75);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#38bdf8';
    ctx.font = '9px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Obj. 75%', padL + 4, y75 - 4);

    if (!controles || controles.length === 0) return;

    // Curva de puntos
    const step = controles.length > 1 ? chartW / (controles.length - 1) : chartW / 2;
    const puntos = controles.map((c, idx) => {
      const fIni = new Date(c.fecha_inicio);
      const fFin = new Date(c.fecha_fin);
      const dias = Math.max(1, Math.round((fFin - fIni) / 86400000)) || 15;
      const henDay = Math.min(100, Math.max(0, (Number(c.total_huevos_15d) / dias) * 100));
      const x = padL + (controles.length > 1 ? idx * step : chartW / 2);
      const y = padT + chartH - (henDay / 100) * chartH;
      return { x, y, henDay, date: c.fecha_inicio };
    });

    // Dibujar línea ámbar
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    puntos.forEach((pt, i) => {
      if (i === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.stroke();

    // Dibujar puntos
    puntos.forEach(pt => {
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f8fafc';
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(pt.henDay.toFixed(0) + '%', pt.x, pt.y - 8);
    });
  },

  dibujarCanvasPesoFallback(canvas, controles) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width = canvas.parentElement?.clientWidth || 400;
    const h = canvas.height = 240;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, w, h);

    const padL = 40, padR = 20, padT = 30, padB = 40;
    const chartW = w - padL - padR;
    const chartH = h - padT - padB;
    const minG = 45, maxG = 75;

    // Ejes
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.4)';
    ctx.lineWidth = 1;
    for (let g = 45; g <= 75; g += 5) {
      const y = padT + chartH - ((g - minG) / (maxG - minG)) * chartH;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + chartW, y);
      ctx.stroke();

      ctx.fillStyle = '#64748b';
      ctx.font = '10px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(g + 'g', padL - 6, y + 3);
    }

    // Línea Mínimo 55 g (Ámbar)
    const y55 = padT + chartH - ((55 - minG) / (maxG - minG)) * chartH;
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.85)';
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(padL, y55);
    ctx.lineTo(padL + chartW, y55);
    ctx.stroke();
    ctx.fillStyle = '#f59e0b';
    ctx.font = '9px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Mín. 55 g (ESGA025)', padL + 4, y55 - 4);

    // Línea Máximo 70 g (Rojo)
    const y70 = padT + chartH - ((70 - minG) / (maxG - minG)) * chartH;
    ctx.strokeStyle = 'rgba(244, 63, 94, 0.85)';
    ctx.beginPath();
    ctx.moveTo(padL, y70);
    ctx.lineTo(padL + chartW, y70);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#f43f5e';
    ctx.fillText('Máx. 70 g (ESGA025)', padL + 4, y70 - 4);

    if (!controles || controles.length === 0) return;

    const step = controles.length > 1 ? chartW / (controles.length - 1) : chartW / 2;
    const puntos = controles.map((c, idx) => {
      const peso = Number(c.peso_medio_huevo_g) || 60;
      const x = padL + (controles.length > 1 ? idx * step : chartW / 2);
      const y = padT + chartH - ((peso - minG) / (maxG - minG)) * chartH;
      const alerta = (peso < 55.0 || peso > 70.0);
      return { x, y, peso, alerta };
    });

    // Línea verde
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2;
    ctx.beginPath();
    puntos.forEach((pt, i) => {
      if (i === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.stroke();

    // Puntos destacados
    puntos.forEach(pt => {
      ctx.fillStyle = pt.alerta ? '#f43f5e' : '#10b981';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.alerta ? 6 : 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = pt.alerta ? '#fca5a5' : '#a7f3d0';
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(pt.peso.toFixed(1) + 'g', pt.x, pt.y - 8);
    });
  },

  dibujarCanvasCascaraFallback(canvas, calculos) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width = 240;
    const h = canvas.height = 220;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2, cy = h / 2, r = 70;
    const datos = [
      { val: calculos.blancoCrema, col: '#f59e0b' },
      { val: calculos.blancoPuro, col: '#38bdf8' },
      { val: calculos.tostado, col: '#fb923c' },
      { val: calculos.anomalia, col: '#f43f5e' }
    ];

    const total = datos.reduce((a, b) => a + b.val, 0);
    if (total === 0) {
      ctx.fillStyle = '#64748b';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Sin datos registrados', cx, cy);
      return;
    }

    let startAngle = -Math.PI / 2;
    datos.forEach(d => {
      if (d.val === 0) return;
      const sliceAngle = (d.val / total) * 2 * Math.PI;
      ctx.fillStyle = d.col;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, startAngle, startAngle + sliceAngle);
      ctx.closePath();
      ctx.fill();
      startAngle += sliceAngle;
    });

    // Donut hole
    ctx.fillStyle = '#090d16';
    ctx.beginPath();
    ctx.arc(cx, cy, 42, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${calculos.pctBlancoCrema.toFixed(0)}%`, cx, cy + 4);
  },

  renderizarTablaHistorialPuesta(controles = null) {
    const tbody = document.getElementById('tabla-puesta-body');
    const msgVacio = document.getElementById('tabla-puesta-vacia-msg');
    if (!tbody) return;

    tbody.innerHTML = '';
    const lista = controles || this.obtenerControlesPuestaFiltrados();

    if (!lista || lista.length === 0) {
      if (msgVacio) msgVacio.classList.remove('hidden');
      return;
    }
    if (msgVacio) msgVacio.classList.add('hidden');

    lista.forEach(c => {
      const hen = this.estado.animales.find(a => a.id === c.animal_id);
      const anilla = hen ? `#${hen.numero_anilla} (${hen.nombre || hen.codigo_identificacion})` : 'Gallina';
      const familia = hen ? hen.familia_origen : 'Sin familia';

      const fIni = new Date(c.fecha_inicio);
      const fFin = new Date(c.fecha_fin);
      const dias = Math.max(1, Math.round((fFin - fIni) / 86400000)) || 15;
      const henDay = ((Number(c.total_huevos_15d) / dias) * 100).toFixed(1);
      const peso = Number(c.peso_medio_huevo_g) || 0;
      const color = c.color_cascara || 'Blanco crema';

      const enRangoPeso = (peso >= 55.0 && peso <= 70.0);
      const colorConforme = color === 'Blanco crema' || color === 'Blanco puro';
      const esApto = enRangoPeso && colorConforme;

      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-800/40 transition border-b border-slate-800/60 text-xs';

      tr.innerHTML = `
        <td class="py-2.5 px-3 text-slate-300 font-mono">${c.fecha_inicio}</td>
        <td class="py-2.5 px-3 font-semibold text-white">${anilla}</td>
        <td class="py-2.5 px-3 text-slate-400">${familia}</td>
        <td class="py-2.5 px-3 text-center font-bold text-amber-300">${c.total_huevos_15d} h / ${dias}d</td>
        <td class="py-2.5 px-3 text-center font-bold text-sky-400">${henDay}%</td>
        <td class="py-2.5 px-3 text-center font-bold ${enRangoPeso ? 'text-emerald-400' : 'text-rose-400'}">${peso.toFixed(1)} g</td>
        <td class="py-2.5 px-3">
          <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold ${color === 'Blanco crema' ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30' : (color === 'Blanco puro' ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30' : 'bg-rose-500/15 text-rose-300 border border-rose-500/30')}">
            ${color}
          </span>
        </td>
        <td class="py-2.5 px-3 text-center">
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${esApto ? 'bg-emerald-950 text-emerald-300 border border-emerald-700' : 'bg-rose-950 text-rose-300 border border-rose-700'}">
            ${esApto ? '✓ APTO INCUBACIÓN' : (peso < 55.0 ? '⚠️ DESCARTE (<55g)' : (peso > 70.0 ? '⚠️ DESCARTE (>70g)' : '⚠️ DESCARTE (Cáscara)'))}
          </span>
        </td>
      `;
      tbody.appendChild(tr);
    });
  },

  // =========================================================================
  // 5.9 MÓDULO DE INTEGRACIÓN RFID PARA PONEDEROS INTELIGENTES (FASE 5)
  // Comunicación Web Bluetooth API & Web Serial API (134.2 kHz ISO 11784/85 & NFC)
  // =========================================================================

  // 1. Conexión inalámbrica mediante Web Bluetooth API
  async conectarLectorBluetooth() {
    if (!navigator.bluetooth) {
      alert('Tu navegador actual no soporta Web Bluetooth API.\n\nPara vincular lectores RFID inalámbricos, utiliza Google Chrome, Microsoft Edge u Opera en PC, Mac o Android mediante conexión HTTPS/localhost.\n\nPuedes seguir utilizando el lector mediante Simulación o USB Serial.');
      return;
    }

    try {
      this.actualizarUIBadgeRfid('buscando', 'Buscando lector Bluetooth...');

      // Servicios estándar para lectores RFID de animales y nidos inteligentes
      // Nordic UART, Transparent UART (HM-10/CC2541), Microchip, y genéricos
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [
          '6e400001-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART Service
          '0000ffe0-0000-1000-8000-00805f9b34fb', // Transparent UART HM-10
          '0000fff0-0000-1000-8000-00805f9b34fb', // Serial BLE Custom
          '49535343-fe7d-4ae5-8fa9-9fafd205e455', // Microchip Transparent
          'generic_access'
        ]
      });

      device.addEventListener('gattserverdisconnected', () => {
        console.warn('[RFID-BLE] Dispositivo Bluetooth desconectado.');
        this.desconectarLectorRfid(false);
        this.mostrarNotificacionToast('Lector RFID Bluetooth desconectado.', 'warning');
      });

      const server = await device.gatt.connect();

      // Buscar características de notificación en los servicios disponibles
      let txCharacteristic = null;
      const serviciosCandidatos = [
        '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
        '0000ffe0-0000-1000-8000-00805f9b34fb',
        '0000fff0-0000-1000-8000-00805f9b34fb'
      ];

      for (const uuid of serviciosCandidatos) {
        try {
          const s = await server.getPrimaryService(uuid);
          if (s) {
            const chars = await s.getCharacteristics();
            txCharacteristic = chars.find(c => c.properties.notify || c.properties.indicate || c.properties.read);
            if (txCharacteristic) break;
          }
        } catch (e) {
          // Continuar probando
        }
      }

      if (!txCharacteristic) {
        try {
          const allServices = await server.getPrimaryServices();
          for (const s of allServices) {
            const chars = await s.getCharacteristics();
            const notifyChar = chars.find(c => c.properties.notify || c.properties.indicate);
            if (notifyChar) {
              txCharacteristic = notifyChar;
              break;
            }
          }
        } catch (e) {}
      }

      if (txCharacteristic && (txCharacteristic.properties.notify || txCharacteristic.properties.indicate)) {
        await txCharacteristic.startNotifications();
        txCharacteristic.addEventListener('characteristicvaluechanged', (event) => {
          const value = event.target.value;
          const decoder = new TextDecoder('utf-8');
          const str = decoder.decode(value);
          this.procesarFragmentoBufferRfid(str);
        });
      }

      this.estado.rfid.dispositivo = device;
      this.estado.rfid.caracteristicaTx = txCharacteristic;
      this.estado.rfid.tipoConexion = 'bluetooth';
      this.estado.rfid.estado = 'conectado';
      this.estado.rfid.nombreDispositivo = device.name || 'Lector BLE (Ponedero #1)';

      this.actualizarUIBadgeRfid('conectado', this.estado.rfid.nombreDispositivo);
      this.reproducirBeepRfid('exito');
      this.mostrarNotificacionToast(`Lector RFID conectado: ${this.estado.rfid.nombreDispositivo}`, 'success');

    } catch (err) {
      console.error('[RFID-BLE] Error al conectar:', err);
      this.actualizarUIBadgeRfid('desconectado');
      if (err.name !== 'NotFoundError') {
        alert(`No se pudo conectar al lector Bluetooth:\n${err.message || err}`);
      }
    }
  },

  // 2. Conexión por cable USB mediante Web Serial API
  async conectarLectorSerial() {
    if (!navigator.serial) {
      alert('Tu navegador actual no soporta Web Serial API.\n\nPara vincular lectores RFID por cable USB o puerto Serie COM, utiliza Google Chrome, Microsoft Edge u Opera en PC o Mac.\n\nPuedes seguir utilizando el lector mediante Simulación manual o entrada por teclado.');
      return;
    }

    try {
      this.actualizarUIBadgeRfid('buscando', 'Seleccionando puerto USB / COM...');

      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' });

      this.estado.rfid.dispositivo = port;
      this.estado.rfid.tipoConexion = 'serial';
      this.estado.rfid.estado = 'conectado';

      const info = port.getInfo ? port.getInfo() : {};
      const nombre = info.usbVendorId ? `Lector USB (VID: 0x${info.usbVendorId.toString(16)})` : 'Lector Serie USB / COM';
      this.estado.rfid.nombreDispositivo = nombre;

      this.actualizarUIBadgeRfid('conectado', nombre);
      this.reproducirBeepRfid('exito');
      this.mostrarNotificacionToast(`Puerto serie conectado: ${nombre}`, 'success');

      // Iniciar bucle de lectura asíncrona continua
      this.iniciarBucleLecturaSerial(port);

    } catch (err) {
      console.error('[RFID-Serial] Error al conectar:', err);
      this.actualizarUIBadgeRfid('desconectado');
      if (err.name !== 'NotFoundError') {
        alert(`No se pudo abrir el puerto serie:\n${err.message || err}`);
      }
    }
  },

  async iniciarBucleLecturaSerial(port) {
    const textDecoder = new TextDecoderStream();
    const readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
    const reader = textDecoder.readable.getReader();
    this.estado.rfid.lectorSerial = reader;

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          this.procesarFragmentoBufferRfid(value);
        }
      }
    } catch (err) {
      console.warn('[RFID-Serial] Flujo de lectura finalizado o cancelado:', err);
    } finally {
      reader.releaseLock();
    }
  },

  // 3. Desconectar lector actual (Bluetooth o Serial)
  async desconectarLectorRfid(manual = true) {
    try {
      if (this.estado.rfid.tipoConexion === 'bluetooth') {
        if (this.estado.rfid.caracteristicaTx) {
          try { await this.estado.rfid.caracteristicaTx.stopNotifications(); } catch(e){}
        }
        if (this.estado.rfid.dispositivo && this.estado.rfid.dispositivo.gatt.connected) {
          this.estado.rfid.dispositivo.gatt.disconnect();
        }
      } else if (this.estado.rfid.tipoConexion === 'serial') {
        if (this.estado.rfid.lectorSerial) {
          try { await this.estado.rfid.lectorSerial.cancel(); } catch(e){}
        }
        if (this.estado.rfid.dispositivo && this.estado.rfid.dispositivo.close) {
          try { await this.estado.rfid.dispositivo.close(); } catch(e){}
        }
      }
    } catch (e) {
      console.warn('[RFID] Error al desconectar dispositivo:', e);
    }

    this.estado.rfid.dispositivo = null;
    this.estado.rfid.caracteristicaTx = null;
    this.estado.rfid.lectorSerial = null;
    this.estado.rfid.tipoConexion = null;
    this.estado.rfid.estado = 'desconectado';
    this.estado.rfid.nombreDispositivo = null;

    this.actualizarUIBadgeRfid('desconectado');
    if (manual) {
      this.mostrarNotificacionToast('Lector RFID desconectado correctamente.', 'info');
    }
  },

  // 4. Alternar señal acústica Beep
  alternarSonidoRfid() {
    this.estado.rfid.sonidoActivo = !this.estado.rfid.sonidoActivo;
    const icono = document.getElementById('icono-rfid-sonido');
    const texto = document.getElementById('texto-rfid-sonido');
    const btn = document.getElementById('btn-rfid-sonido');
    if (this.estado.rfid.sonidoActivo) {
      if (icono) icono.className = 'fa-solid fa-volume-high text-emerald-400';
      if (texto) texto.textContent = 'Beep';
      if (btn) btn.className = 'px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1.5 transition';
      this.reproducirBeepRfid('exito');
    } else {
      if (icono) icono.className = 'fa-solid fa-volume-xmark text-slate-500';
      if (texto) texto.textContent = 'Mudo';
      if (btn) btn.className = 'px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-500 text-xs font-medium flex items-center gap-1.5 transition';
    }
  },

  // 5. Actualizar insignia de estado hardware en la interfaz
  actualizarUIBadgeRfid(estado, nombre = '') {
    const badge = document.getElementById('badge-rfid-estado');
    const badgeTexto = document.getElementById('badge-rfid-estado-texto');
    const btnDesconectar = document.getElementById('btn-rfid-desconectar');
    const btnBt = document.getElementById('btn-rfid-bluetooth');
    const btnSerial = document.getElementById('btn-rfid-serial');

    if (!badge || !badgeTexto) return;

    if (estado === 'conectado') {
      badge.className = 'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-700 shadow-sm';
      badge.innerHTML = `<span class="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span> <span id="badge-rfid-estado-texto">Conectado: ${this.escaparHtml(nombre)}</span>`;
      if (btnDesconectar) btnDesconectar.classList.remove('hidden');
      if (btnBt) btnBt.classList.add('hidden');
      if (btnSerial) btnSerial.classList.add('hidden');
    } else if (estado === 'buscando') {
      badge.className = 'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-950/80 text-amber-300 border border-amber-700 animate-pulse';
      badge.innerHTML = `<span class="h-2 w-2 rounded-full bg-amber-400"></span> <span id="badge-rfid-estado-texto">${this.escaparHtml(nombre || 'Buscando...')}</span>`;
    } else {
      badge.className = 'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-800 text-slate-400 border border-slate-700';
      badge.innerHTML = `<span class="h-2 w-2 rounded-full bg-slate-500"></span> <span id="badge-rfid-estado-texto">Desconectado</span>`;
      if (btnDesconectar) btnDesconectar.classList.add('hidden');
      if (btnBt) btnBt.classList.remove('hidden');
      if (btnSerial) btnSerial.classList.remove('hidden');
    }
  },

  // 6. Procesar fragmentos continuos de buffer serie/bluetooth
  procesarFragmentoBufferRfid(chunk) {
    this.estado.rfid.bufferRecepcion = (this.estado.rfid.bufferRecepcion || '') + chunk;
    if (this.estado.rfid.bufferRecepcion.includes('\n') || this.estado.rfid.bufferRecepcion.includes('\r')) {
      const lineas = this.estado.rfid.bufferRecepcion.split(/[\r\n]+/);
      this.estado.rfid.bufferRecepcion = lineas.pop() || '';
      for (const l of lineas) {
        const limpia = l.trim();
        if (limpia) {
          this.procesarLecturaRfid(limpia);
        }
      }
    } else if (this.estado.rfid.bufferRecepcion.length > 40) {
      const codigo = this.estado.rfid.bufferRecepcion.trim();
      this.estado.rfid.bufferRecepcion = '';
      this.procesarLecturaRfid(codigo);
    }
  },

  // 7. Lógica central de lectura, decodificación y emparejamiento RFID
  procesarLecturaRfid(codigoRaw) {
    if (!codigoRaw) return;
    let codigo = String(codigoRaw).replace(/[\u0000-\u001F\u007F-\u009F]/g, '').trim();

    // Extraer código de 15 dígitos numéricos (ISO 11784/85 FDX-B) o alfanumérico NFC
    const match15 = codigo.match(/\b\d{15}\b/);
    if (match15) {
      codigo = match15[0];
    } else {
      const matchHex = codigo.match(/\b[A-Fa-f0-9]{8,14}\b/);
      if (matchHex) {
        codigo = matchHex[0].toUpperCase();
      }
    }

    if (!codigo || codigo.length < 4) return;

    console.log(`[RFID] Transpondedor detectado: ${codigo}`);
    this.estado.rfid.ultimoChipLeido = codigo;
    this.estado.rfid.ultimaLecturaTs = new Date();

    // Caso A: Si el usuario está en el formulario de Alta (Tab 1), autocompletar el campo alta-rfid
    const inputAltaRfid = document.getElementById('alta-rfid');
    const tabRegistro = document.getElementById('tab-registro');
    if (inputAltaRfid && tabRegistro && tabRegistro.classList.contains('active')) {
      inputAltaRfid.value = codigo;
      inputAltaRfid.classList.add('ring-2', 'ring-emerald-400', 'bg-emerald-950/40');
      setTimeout(() => {
        inputAltaRfid.classList.remove('ring-2', 'ring-emerald-400', 'bg-emerald-950/40');
      }, 1200);
      this.reproducirBeepRfid('exito');
      this.mostrarNotificacionToast(`✓ Chip RFID #${codigo} cargado en el formulario de alta.`, 'success');
      return;
    }

    // Caso B: Si el modal de vinculación rápida está abierto, autocompletar allí
    const modalVincular = document.getElementById('modal-vincular-rfid');
    const inputModalVincular = document.getElementById('modal-vincular-rfid-input');
    if (modalVincular && !modalVincular.classList.contains('hidden') && inputModalVincular) {
      inputModalVincular.value = codigo;
      this.reproducirBeepRfid('exito');
      this.mostrarNotificacionToast(`✓ Chip #${codigo} capturado para vincular.`, 'success');
      return;
    }

    // Caso C: Detección en ponedero inteligente
    const animal = this.estado.animales.find(a => 
      a.rfid_chip_id && (a.rfid_chip_id.trim().toUpperCase() === codigo.toUpperCase())
    );

    if (animal) {
      this.estado.rfid.animalDetectado = animal;
      this.reproducirBeepRfid('exito');

      // Mostrar panel de entrada detectada en el ponedero
      this.mostrarAnimalDetectadoRfid(animal, codigo);

      // Autocompletar el formulario de control de puesta de 15 días
      const selectPuesta15 = document.getElementById('puesta-form-animal-select');
      if (selectPuesta15) selectPuesta15.value = animal.id;
      const inputPuestaIni = document.getElementById('puesta-inicio');
      if (inputPuestaIni && !inputPuestaIni.value) {
        inputPuestaIni.value = new Date().toISOString().split('T')[0];
      }

      this.mostrarNotificacionToast(`✓ Gallina identificada: #${animal.numero_anilla} (${animal.nombre || 'Gallina'}) · Chip ${codigo}`, 'success');
    } else {
      this.estado.rfid.animalDetectado = null;
      this.reproducirBeepRfid('alerta');
      this.mostrarChipNoAsignadoRfid(codigo);
      this.mostrarNotificacionToast(`⚠️ Chip ${codigo} detectado pero no vinculado a ninguna gallina.`, 'warning');
    }
  },

  // 8. Lectura manual desde el input de prueba
  procesarLecturaManualRfid(codigo) {
    if (!codigo || !codigo.trim()) return;
    this.procesarLecturaRfid(codigo.trim());
  },

  // 9. Simulación de lectura con chip específico
  simularLecturaRfid(chipId) {
    if (!chipId) return;
    this.procesarLecturaRfid(chipId);
  },

  // 10. Simulación aleatoria entre las gallinas con chip del censo
  simularLecturaAleatoria() {
    const hembrasConChip = this.estado.animales.filter(a => a.sexo === 'Hembra' && a.rfid_chip_id);
    if (hembrasConChip.length === 0) {
      // Simular con chip genérico de prueba
      this.simularLecturaRfid('968000010000002');
      return;
    }
    const elegida = hembrasConChip[Math.floor(Math.random() * hembrasConChip.length)];
    this.simularLecturaRfid(elegida.rfid_chip_id);
  },

  // 11. Emisión de tono acústico ("Beep" Web Audio API)
  reproducirBeepRfid(tipo = 'exito') {
    if (!this.estado.rfid.sonidoActivo) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;
      if (tipo === 'exito') {
        // Doble chirrido armónico agudo de escáner oficial (1400 Hz -> 2000 Hz)
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1400, now);
        osc.frequency.setValueAtTime(2000, now + 0.08);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.setValueAtTime(0.01, now + 0.07);
        gain.gain.setValueAtTime(0.25, now + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc.start(now);
        osc.stop(now + 0.18);
      } else if (tipo === 'alerta') {
        // Zumbido grave de advertencia (300 Hz)
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.linearRampToValueAtTime(220, now + 0.3);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
      }
    } catch (err) {
      console.warn('[Audio] No se pudo reproducir beep RFID:', err);
    }
  },

  // 12. Mostrar panel de gallina detectada en el ponedero inteligente
  mostrarAnimalDetectadoRfid(animal, codigo) {
    const radar = document.getElementById('rfid-radar-esperando');
    const panelDetectado = document.getElementById('rfid-panel-detectado');
    const panelDesconocido = document.getElementById('rfid-panel-desconocido');

    if (radar) radar.classList.add('hidden');
    if (panelDesconocido) panelDesconocido.classList.add('hidden');
    if (panelDetectado) panelDetectado.classList.remove('hidden');

    // Poblar datos del animal
    const foto = document.getElementById('rfid-detectado-foto');
    if (foto) foto.src = animal.fotos?.lateral || './icons/logo.png';
    const anilla = document.getElementById('rfid-detectado-anilla');
    if (anilla) anilla.textContent = `#${animal.numero_anilla}`;
    const codigoId = document.getElementById('rfid-detectado-codigo');
    if (codigoId) codigoId.textContent = animal.codigo_identificacion;
    const nombre = document.getElementById('rfid-detectado-nombre');
    if (nombre) nombre.textContent = `${animal.nombre || 'Gallina'} · ${animal.familia_origen}`;
    const chip = document.getElementById('rfid-detectado-chip');
    if (chip) chip.textContent = codigo;

    const ahora = new Date();
    const ts = document.getElementById('rfid-detectado-timestamp');
    if (ts) ts.textContent = ahora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // Preparar formulario
    const inputFechaHora = document.getElementById('rfid-fecha-hora');
    if (inputFechaHora) {
      const year = ahora.getFullYear();
      const month = String(ahora.getMonth() + 1).padStart(2, '0');
      const day = String(ahora.getDate()).padStart(2, '0');
      const hours = String(ahora.getHours()).padStart(2, '0');
      const mins = String(ahora.getMinutes()).padStart(2, '0');
      inputFechaHora.value = `${year}-${month}-${day}T${hours}:${mins}`;
    }

    const inputPeso = document.getElementById('rfid-peso-huevo');
    if (inputPeso) {
      inputPeso.value = '';
      setTimeout(() => inputPeso.focus(), 100);
    }

    const feedback = document.getElementById('rfid-peso-feedback');
    if (feedback) {
      feedback.textContent = 'Estándar racial: 55.0 - 70.0 g';
      feedback.className = 'text-[10px] font-bold text-slate-400';
    }
  },

  // 13. Mostrar panel de transpondedor no asignado
  mostrarChipNoAsignadoRfid(codigo) {
    const radar = document.getElementById('rfid-radar-esperando');
    const panelDetectado = document.getElementById('rfid-panel-detectado');
    const panelDesconocido = document.getElementById('rfid-panel-desconocido');

    if (radar) radar.classList.add('hidden');
    if (panelDetectado) panelDetectado.classList.add('hidden');
    if (panelDesconocido) panelDesconocido.classList.remove('hidden');

    const chipTxt = document.getElementById('rfid-desconocido-chip');
    if (chipTxt) chipTxt.textContent = codigo;
  },

  // 14. Validación dinámica en tiempo real del peso del huevo
  validarPesoRfid(valor) {
    const feedback = document.getElementById('rfid-peso-feedback');
    if (!feedback) return;
    const peso = parseFloat(valor);
    if (isNaN(peso) || peso <= 0) {
      feedback.textContent = 'Estándar racial: 55.0 - 70.0 g';
      feedback.className = 'text-[10px] font-bold text-slate-400';
      return;
    }
    if (peso >= 55.0 && peso <= 70.0) {
      feedback.textContent = '✓ Conforme Estándar Oficial ESGA025';
      feedback.className = 'text-[10px] font-bold text-emerald-400';
    } else if (peso < 55.0) {
      feedback.textContent = `⚠️ ${peso.toFixed(1)} g < 55 g (Descarte de incubación)`;
      feedback.className = 'text-[10px] font-bold text-rose-400';
    } else {
      feedback.textContent = `⚠️ ${peso.toFixed(1)} g > 70 g (Descarte de incubación)`;
      feedback.className = 'text-[10px] font-bold text-rose-400';
    }
  },

  // 15. Guardar evento de puesta individual desde el ponedero inteligente
  async guardarHuevoPonederoRfid(event) {
    if (event) event.preventDefault();

    const animal = this.estado.rfid.animalDetectado;
    if (!animal) {
      alert('No hay ninguna gallina detectada actualmente en el ponedero.');
      return;
    }

    const inputPeso = document.getElementById('rfid-peso-huevo');
    const peso = parseFloat(inputPeso?.value);
    if (!peso || isNaN(peso) || peso <= 0) {
      alert('Por favor, introduce el peso en gramos del huevo recogido.');
      inputPeso?.focus();
      return;
    }

    const colorCascara = document.getElementById('rfid-color-cascara')?.value || 'Blanco crema';
    const fechaHora = document.getElementById('rfid-fecha-hora')?.value || new Date().toISOString().slice(0, 16);
    const fechaSolo = fechaHora.split('T')[0];

    const enRangoPeso = (peso >= 55.0 && peso <= 70.0);
    const colorConforme = colorCascara.includes('crema');
    const conforme = enRangoPeso && colorConforme;

    const u = this.estado.usuarioActivo;
    const aviario = this.estado.aviario || this.estado.aviarioActivo;

    const nuevoControl = {
      id: 'puesta-rfid-' + Date.now(),
      animal_id: animal.id,
      usuario_id: u?.id || animal.usuario_id || null,
      explotacion_id: aviario?.id || animal.explotacion_id || null,
      codigo_rega: aviario?.codigo_rega || aviario?.rega || animal.codigo_rega || u?.rega || null,
      fecha_inicio: fechaSolo,
      fecha_fin: fechaSolo,
      hora_registro: fechaHora,
      total_huevos_15d: 1, // Unidad de puesta de ponedero individual
      peso_medio_huevo_g: peso,
      color_cascara: colorCascara,
      calidad_cascara: conforme ? 'Excelente' : (peso < 55.0 || peso > 70.0 ? 'Defectuosa (Peso)' : 'No estándar (Color)'),
      conforme_estandar: conforme,
      origen_registro: 'rfid_ponedero',
      rfid_chip_id: animal.rfid_chip_id || this.estado.rfid.ultimoChipLeido,
      observaciones: `Puesta individual en ponedero inteligente RFID (${fechaHora.replace('T', ' ')}). Peso: ${peso.toFixed(1)} g. ${conforme ? 'Conforme estándar racial ESGA025.' : 'Descarte para incubación.'}`
    };

    // Guardar en IndexedDB
    await this.db.put('controlesPuesta', nuevoControl);
    this.estado.controlesPuesta.unshift(nuevoControl);

    // Sincronizar o encolar
    if (navigator.onLine && this.supabaseClient) {
      try {
        await this.supabaseClient.from('controles_puesta').insert([nuevoControl]);
      } catch (err) {
        await this.db.put('syncQueue', { tipo: 'CONTROL_PUESTA', payload: nuevoControl, creado_en: Date.now() });
      }
    } else {
      await this.db.put('syncQueue', { tipo: 'CONTROL_PUESTA', payload: nuevoControl, creado_en: Date.now() });
    }

    this.actualizarContadorSyncQueue();
    this.reproducirBeepRfid('exito');
    this.mostrarNotificacionToast(`🥚 Puesta de #${animal.numero_anilla} (${peso.toFixed(1)} g) registrada con éxito.`, 'success');

    // Registrar en historial visual del ponedero
    this.agregarRegistroHistorialRfid(nuevoControl, animal);

    // Actualizar gráficas analíticas de puesta
    this.renderizarAnaliticaPuesta();

    // Liberar ponedero
    this.resetearPonederoRfid();
  },

  // 16. Restablecer el ponedero al estado de espera
  resetearPonederoRfid() {
    this.estado.rfid.animalDetectado = null;
    const radar = document.getElementById('rfid-radar-esperando');
    const panelDetectado = document.getElementById('rfid-panel-detectado');
    const panelDesconocido = document.getElementById('rfid-panel-desconocido');

    if (panelDetectado) panelDetectado.classList.add('hidden');
    if (panelDesconocido) panelDesconocido.classList.add('hidden');
    if (radar) radar.classList.remove('hidden');

    const inputManual = document.getElementById('input-rfid-manual-scan');
    if (inputManual) inputManual.value = '';
  },

  // 17. Transferir datos de la gallina detectada a la prueba de 15 días
  transferirRfidAControl15D() {
    const animal = this.estado.rfid.animalDetectado;
    if (!animal) return;

    this.cambiarSubtabPuesta('registro');
    const selectAnimal = document.getElementById('puesta-form-animal-select');
    if (selectAnimal) selectAnimal.value = animal.id;

    const inputInicio = document.getElementById('puesta-inicio');
    if (inputInicio) inputInicio.value = new Date().toISOString().split('T')[0];

    const inputPeso = document.getElementById('puesta-peso-huevo');
    const pesoRfid = document.getElementById('rfid-peso-huevo')?.value;
    if (inputPeso && pesoRfid) inputPeso.value = pesoRfid;

    this.mostrarNotificacionToast(`Gallina #${animal.numero_anilla} transferida a la prueba de 15 días.`, 'info');
  },

  // 18. Poblar selector de simulación y chips de prueba
  poblarSelectoresRfid() {
    const selectSim = document.getElementById('select-rfid-simulacion');
    const containerChips = document.getElementById('rfid-chips-demo-container');

    const hembrasConChip = this.estado.animales.filter(a => a.sexo === 'Hembra' && a.rfid_chip_id);

    if (selectSim) {
      selectSim.innerHTML = '<option value="">⚡ Simular paso de gallina por el ponedero...</option>';
      hembrasConChip.forEach(a => {
        const opt = document.createElement('option');
        opt.value = a.rfid_chip_id;
        opt.textContent = `#${a.numero_anilla} ${a.nombre || 'Gallina'} (${a.rfid_chip_id}) [${a.familia_origen}]`;
        selectSim.appendChild(opt);
      });
      const optDesconocido = document.createElement('option');
      optDesconocido.value = '968000099999999';
      optDesconocido.textContent = '⚠️ Simular Chip Desconocido (No vinculado)';
      selectSim.appendChild(optDesconocido);
    }

    if (containerChips) {
      containerChips.innerHTML = '';
      if (hembrasConChip.length === 0) {
        containerChips.innerHTML = '<span class="text-xs text-slate-500 italic">No hay gallinas con chip RFID registrado en el censo.</span>';
      } else {
        hembrasConChip.forEach(a => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'px-2.5 py-1 rounded-lg bg-indigo-950/70 hover:bg-indigo-900 border border-indigo-700/60 text-indigo-300 text-[11px] font-semibold flex items-center gap-1.5 transition shadow-sm active:scale-95';
          btn.innerHTML = `<i class="fa-solid fa-microchip text-indigo-400"></i> #${a.numero_anilla} (${a.nombre || 'Gallina'})`;
          btn.onclick = () => this.simularLecturaRfid(a.rfid_chip_id);
          containerChips.appendChild(btn);
        });

        // Botón de chip no asignado para pruebas
        const btnAnon = document.createElement('button');
        btnAnon.type = 'button';
        btnAnon.className = 'px-2.5 py-1 rounded-lg bg-rose-950/60 hover:bg-rose-900 border border-rose-800 text-rose-300 text-[11px] font-semibold flex items-center gap-1 transition shadow-sm';
        btnAnon.innerHTML = '<i class="fa-solid fa-triangle-exclamation text-rose-400"></i> Chip Sin Vincular';
        btnAnon.onclick = () => this.simularLecturaRfid('968000099999999');
        containerChips.appendChild(btnAnon);
      }
    }
  },

  // 19. Añadir entrada al registro visual del ponedero
  agregarRegistroHistorialRfid(control, animal) {
    const tbody = document.getElementById('tabla-rfid-historial-body');
    const badgeTotal = document.getElementById('badge-total-entradas-rfid');
    if (!tbody) return;

    if (!this.estado.rfid.historialEntradas) {
      this.estado.rfid.historialEntradas = [];
    }
    this.estado.rfid.historialEntradas.unshift({ control, animal });

    const total = this.estado.rfid.historialEntradas.length;
    if (badgeTotal) badgeTotal.textContent = `${total} ${total === 1 ? 'registro' : 'registros'}`;

    tbody.innerHTML = '';
    this.estado.rfid.historialEntradas.slice(0, 15).forEach(({ control: c, animal: a }) => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-800/40 border-b border-slate-800/60 transition text-xs';
      const horaStr = c.hora_registro ? c.hora_registro.replace('T', ' ') : c.fecha_inicio;
      const pesoNum = Number(c.peso_medio_huevo_g) || 0;
      const conforme = c.conforme_estandar;

      tr.innerHTML = `
        <td class="py-2.5 px-3 font-mono text-slate-300">${horaStr}</td>
        <td class="py-2.5 px-3">
          <span class="font-bold text-white font-mono">#${a.numero_anilla}</span>
          <span class="text-slate-400 font-sans block text-[11px]">${a.nombre || 'Gallina'}</span>
        </td>
        <td class="py-2.5 px-3 font-mono text-indigo-300">${c.rfid_chip_id || a.rfid_chip_id || '--'}</td>
        <td class="py-2.5 px-3 text-right font-mono font-bold ${conforme ? 'text-emerald-400' : 'text-rose-400'}">${pesoNum.toFixed(1)} g</td>
        <td class="py-2.5 px-3 text-slate-300">${c.color_cascara}</td>
        <td class="py-2.5 px-3 text-center">
          <span class="px-2 py-0.5 rounded text-[10px] font-bold font-mono ${conforme ? 'bg-emerald-950 text-emerald-300 border border-emerald-700' : 'bg-rose-950 text-rose-300 border border-rose-800'}">
            ${conforme ? '✓ Apto (55-70 g)' : '⚠️ Descarte'}
          </span>
        </td>
      `;
      tbody.appendChild(tr);
    });
  },

  // 20. Capturar RFID para el formulario de Alta
  capturarRfidParaAlta() {
    const input = document.getElementById('alta-rfid');
    if (!input) return;

    if (this.estado.rfid.ultimoChipLeido) {
      input.value = this.estado.rfid.ultimoChipLeido;
      input.classList.add('ring-2', 'ring-indigo-400');
      setTimeout(() => input.classList.remove('ring-2', 'ring-indigo-400'), 1000);
      this.reproducirBeepRfid('exito');
      this.mostrarNotificacionToast(`Último chip leído (${this.estado.rfid.ultimoChipLeido}) asignado al alta.`, 'info');
    } else {
      input.focus();
      this.mostrarNotificacionToast('Pasa la anilla RFID por el lector para capturar automáticamente.', 'info');
    }
  },

  // 21. Generar código de prueba para el formulario de Alta
  generarChipRfidPruebaAlta() {
    const input = document.getElementById('alta-rfid');
    if (!input) return;
    const aleat = Math.floor(10000000 + Math.random() * 90000000);
    input.value = `9680000${aleat}`;
    this.reproducirBeepRfid('exito');
  },

  // 22. Modal para vincular o cambiar chip RFID a ejemplar existente
  abrirModalVincularRfid(animalId) {
    const animal = this.estado.animales.find(a => a.id === animalId);
    if (!animal) return;

    this.estado.editandoAnimalRfidId = animalId;
    const sub = document.getElementById('modal-vincular-rfid-sub');
    if (sub) {
      sub.textContent = `#${animal.numero_anilla} · ${animal.nombre || animal.codigo_identificacion} [${animal.familia_origen}]`;
    }

    const input = document.getElementById('modal-vincular-rfid-input');
    if (input) {
      input.value = animal.rfid_chip_id || '';
      setTimeout(() => input.focus(), 100);
    }

    document.getElementById('modal-vincular-rfid')?.classList.remove('hidden');
  },

  cerrarModalVincularRfid() {
    document.getElementById('modal-vincular-rfid')?.classList.add('hidden');
    this.estado.editandoAnimalRfidId = null;
  },

  generarChipRfidPruebaModal() {
    const input = document.getElementById('modal-vincular-rfid-input');
    if (!input) return;
    const aleat = Math.floor(10000000 + Math.random() * 90000000);
    input.value = `9680000${aleat}`;
    this.reproducirBeepRfid('exito');
  },

  async confirmarVinculacionRfidModal() {
    const animalId = this.estado.editandoAnimalRfidId;
    const input = document.getElementById('modal-vincular-rfid-input');
    const chipVal = input ? input.value.trim() : '';

    if (!animalId) return;

    if (!chipVal) {
      if (confirm('¿Deseas desvincular el transpondedor RFID de este ejemplar?')) {
        await this.vincularChipAnimal(animalId, null);
        this.cerrarModalVincularRfid();
      }
      return;
    }

    const ok = await this.vincularChipAnimal(animalId, chipVal);
    if (ok) {
      this.cerrarModalVincularRfid();
    }
  },

  // 23. Vincular chip no asignado directamente
  abrirModalVincularChipDesconocido() {
    const chip = this.estado.rfid.ultimoChipLeido;
    if (!chip) return;

    const hembrasSinChip = this.estado.animales.filter(a => a.sexo === 'Hembra');
    if (hembrasSinChip.length === 0) {
      alert('No hay gallinas registradas en el censo para vincular.');
      return;
    }

    let msg = `Selecciona el número de orden de la gallina para vincular el chip ${chip}:\n\n`;
    hembrasSinChip.forEach((h, idx) => {
      msg += `${idx + 1}. #${h.numero_anilla} (${h.nombre || h.codigo_identificacion}) [${h.familia_origen}]\n`;
    });

    const resp = prompt(msg, '1');
    if (!resp) return;

    const num = parseInt(resp, 10);
    if (isNaN(num) || num < 1 || num > hembrasSinChip.length) {
      alert('Opción inválida.');
      return;
    }

    const elegida = hembrasSinChip[num - 1];
    this.vincularChipAnimal(elegida.id, chip);
    this.resetearPonederoRfid();
  },

  // 24. Asignar y persistir chip en IndexedDB y Supabase
  async vincularChipAnimal(animalId, nuevoChipId) {
    if (!animalId) return false;

    if (nuevoChipId) {
      nuevoChipId = nuevoChipId.trim();
      const dup = this.estado.animales.find(a => 
        a.id !== animalId && a.rfid_chip_id && a.rfid_chip_id.toUpperCase() === nuevoChipId.toUpperCase()
      );
      if (dup) {
        alert(`Error: El transpondedor RFID ${nuevoChipId} ya está asignado al ejemplar #${dup.numero_anilla} (${dup.nombre}).`);
        return false;
      }
    }

    const animal = this.estado.animales.find(a => a.id === animalId);
    if (!animal) return false;

    animal.rfid_chip_id = nuevoChipId || null;
    await this.db.put('animales', animal);

    if (navigator.onLine && this.supabaseClient) {
      try {
        await this.supabaseClient.from('animales').update({ rfid_chip_id: animal.rfid_chip_id }).eq('id', animal.id);
      } catch (e) {
        await this.db.put('syncQueue', { tipo: 'UPDATE_ANIMAL_RFID', payload: { id: animal.id, rfid_chip_id: animal.rfid_chip_id }, creado_en: Date.now() });
      }
    } else {
      await this.db.put('syncQueue', { tipo: 'UPDATE_ANIMAL_RFID', payload: { id: animal.id, rfid_chip_id: animal.rfid_chip_id }, creado_en: Date.now() });
    }

    this.actualizarContadorSyncQueue();
    this.renderizarCenso();
    this.poblarSelectoresRfid();

    if (this.estado.animalSeleccionadoId === animalId) {
      this.verFichaAnimal(animalId);
    }

    this.reproducirBeepRfid('exito');
    this.mostrarNotificacionToast(`✓ Transpondedor ${nuevoChipId || 'eliminado'} para #${animal.numero_anilla}`, 'success');
    return true;
  },

  // 25. Escucha tipo cuña de teclado para escáneres USB/Bluetooth HID
  configurarWedgeRfid() {
    let wedgeBuffer = '';
    let lastKeyTime = Date.now();

    window.addEventListener('keydown', (e) => {
      const target = e.target;
      if (target && target.id === 'input-rfid-manual-scan') {
        return; // El input ya tiene su propio handler onkeydown
      }

      const now = Date.now();
      const diff = now - lastKeyTime;
      lastKeyTime = now;

      if (e.key === 'Enter') {
        if (wedgeBuffer.length >= 8 && diff < 150) {
          const codigo = wedgeBuffer.trim();
          wedgeBuffer = '';
          console.log('[RFID-Wedge] Escaneo por cuña de teclado detectado:', codigo);
          this.procesarLecturaRfid(codigo);
          e.preventDefault();
        } else {
          wedgeBuffer = '';
        }
        return;
      }

      if (e.key.length === 1 && /[0-9a-zA-Z]/.test(e.key)) {
        if (diff > 250) {
          wedgeBuffer = '';
        }
        wedgeBuffer += e.key;
      }
    });
  },
  abrirPedigriDirecto(animalId) {
    this.cambiarTab('pedigri');
    document.getElementById('pedigri-animal-select').value = animalId;
    this.renderizarPedigri(animalId);
  },

  renderizarPedigri(animalId) {
    const contenedor = document.getElementById('pedigree-tree-wrapper');
    if (!animalId) {
      contenedor.innerHTML = '<div class="p-8 text-center text-slate-500 text-xs m-auto">Selecciona un ejemplar arriba para ver su árbol genealógico.</div>';
      return;
    }

    const raiz = this.estado.animales.find(a => a.id === animalId);
    if (!raiz) return;

    // Calcular consanguinidad exacta de Wright en cliente
    const fx = this.zootecnia.calcularFxAnimal(raiz, this.estado.animales);
    document.getElementById('pedigri-fx-val').textContent = `${fx.toFixed(5)} (${(fx * 100).toFixed(2)}%)`;

    const fxEval = document.getElementById('pedigri-fx-eval');
    if (fx > 0.0625) {
      fxEval.className = 'text-[11px] text-red-400 bg-red-950/60 border border-red-800 px-2 py-0.5 rounded';
      fxEval.textContent = 'Alerta: Consanguinidad Elevada (> 6.25%)';
    } else if (fx > 0.03) {
      fxEval.className = 'text-[11px] text-amber-400 bg-amber-950/60 border border-amber-800 px-2 py-0.5 rounded';
      fxEval.textContent = 'Consanguinidad Moderada (Supervisada)';
    } else {
      fxEval.className = 'text-[11px] text-emerald-400 bg-emerald-950/60 border border-emerald-800 px-2 py-0.5 rounded';
      fxEval.textContent = 'Consanguinidad Óptima / Mínima (Favorable)';
    }

    // Construcción visual del árbol hasta 5 generaciones
    // Generación 0 (Raíz), Gen 1 (Padres), Gen 2 (Abuelos), Gen 3 (Bisabuelos), Gen 4 (Tatarabuelos)
    const gen0 = [raiz];
    const gen1 = this.obtenerAncestrosNivel(gen0);
    const gen2 = this.obtenerAncestrosNivel(gen1);
    const gen3 = this.obtenerAncestrosNivel(gen2);
    const gen4 = this.obtenerAncestrosNivel(gen3);

    contenedor.innerHTML = `
      <!-- Gen 0: Ejemplar -->
      <div class="pedigree-col">
        <div class="text-[10px] font-bold text-amber-400 uppercase tracking-wider text-center">Ejemplar</div>
        ${this.renderNodoPedigri(raiz, true)}
      </div>

      <!-- Gen 1: Padres -->
      <div class="pedigree-col">
        <div class="text-[10px] font-bold text-sky-400 uppercase tracking-wider text-center">Padres (1ª Gen)</div>
        ${gen1.map(a => this.renderNodoPedigri(a)).join('')}
      </div>

      <!-- Gen 2: Abuelos -->
      <div class="pedigree-col">
        <div class="text-[10px] font-bold text-purple-400 uppercase tracking-wider text-center">Abuelos (2ª Gen)</div>
        ${gen2.map(a => this.renderNodoPedigri(a)).join('')}
      </div>

      <!-- Gen 3: Bisabuelos -->
      <div class="pedigree-col">
        <div class="text-[10px] font-bold text-indigo-400 uppercase tracking-wider text-center">Bisabuelos (3ª Gen)</div>
        ${gen3.map(a => this.renderNodoPedigri(a)).join('')}
      </div>

      <!-- Gen 4: Tatarabuelos -->
      <div class="pedigree-col">
        <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center">Tatarabuelos (4ª Gen)</div>
        ${gen4.map(a => this.renderNodoPedigri(a)).join('')}
      </div>
    `;
  },

  obtenerAncestrosNivel(nivelAnterior) {
    const siguienteNivel = [];
    nivelAnterior.forEach(item => {
      if (item && item.id) {
        const padre = this.estado.animales.find(a => a.id === item.id_padre) || null;
        const madre = this.estado.animales.find(a => a.id === item.id_madre) || null;
        siguienteNivel.push(padre);
        siguienteNivel.push(madre);
      } else {
        siguienteNivel.push(null);
        siguienteNivel.push(null);
      }
    });
    return siguienteNivel;
  },

  renderNodoPedigri(animal, esRaiz = false) {
    if (!animal) {
      return `
        <div class="pedigree-node opacity-40 border-dashed">
          <span class="text-[10px] text-slate-500 block">Línea Base / No registrado</span>
          <span class="text-xs font-mono text-slate-600">Fundacional (RF)</span>
        </div>
      `;
    }

    const claseSexo = animal.sexo === 'Macho' ? 'node-macho' : 'node-hembra';
    const claseRaiz = esRaiz ? 'node-root' : '';
    const badgeSec = this.obtenerColorBadgeSeccion(animal.seccion_libro);

    return `
      <div class="pedigree-node ${claseSexo} ${claseRaiz} cursor-pointer" onclick="app.verFichaAnimal('${animal.id}')" title="Ver ficha">
        <div class="flex items-center justify-between">
          <span class="text-[10px] font-bold text-white font-mono">#${animal.numero_anilla}</span>
          <span class="px-1.5 py-0.2 rounded text-[9px] font-bold ${badgeSec}">${animal.seccion_libro}</span>
        </div>
        <div class="text-[11px] font-semibold text-slate-300 truncate mt-0.5">${animal.nombre || animal.codigo_identificacion}</div>
        <div class="flex items-center justify-between text-[9px] text-slate-400 mt-1">
          <span>${animal.sexo}</span>
          <span class="font-mono text-purple-300">Fx: ${((animal.coeficiente_consanguinidad || 0) * 100).toFixed(1)}%</span>
        </div>
      </div>
    `;
  },

  // Simulador de Apareamiento Preventivo (Gallo x Gallina - 5 Generaciones Wright)
  simularCrucePreventivo() {
    const machoId = document.getElementById('sim-macho')?.value;
    const hembraId = document.getElementById('sim-hembra')?.value;
    const resultadoEl = document.getElementById('sim-fx-resultado');
    const recEl = document.getElementById('sim-recomendacion');
    const boxEl = document.getElementById('sim-resultado-box');

    if (!machoId || !hembraId) {
      if (resultadoEl) resultadoEl.textContent = '--';
      if (recEl) recEl.textContent = 'Selecciona ambos reproductores para simular el apareamiento.';
      return;
    }

    const { fx, ancestrosComunes } = this.calcularFxWright5Gen(machoId, hembraId, this.estado.animales);
    const fxPct = (fx * 100).toFixed(2);
    const diag = this.obtenerDiagnosticoColorWright(fx);

    if (resultadoEl) {
      resultadoEl.textContent = `${fx.toFixed(4)} (${fxPct}%)`;
      resultadoEl.className = `font-mono font-bold text-sm ${diag.textClass}`;
    }
    if (boxEl) {
      boxEl.className = `p-3.5 rounded-lg border space-y-1.5 ${diag.borderClass}`;
    }

    const macho = (this.estado.animales || []).find(a => a.id === machoId);
    const rotacionGobe = {
      'Familia A': 'Familia B',
      'Familia B': 'Familia C',
      'Familia C': 'Familia D',
      'Familia D': 'Familia E',
      'Familia E': 'Familia A'
    };
    const famSugerida = macho?.familia_origen ? (rotacionGobe[macho.familia_origen] || 'Familia B') : 'Familia B';

    if (recEl) {
      recEl.className = `text-[11px] font-semibold ${diag.textClass}`;
      recEl.innerHTML = `
        <div><strong>${diag.etiqueta}</strong> (${fxPct}%).</div>
        <div class="text-slate-300 font-normal mt-0.5">
          ${ancestrosComunes.length > 0 ? `Ancestros comunes en 5 gen: ${ancestrosComunes.map(c => '#' + this.escaparHtml(c.anilla)).join(', ')}. ` : ''}
          Regla de Gobe: El gallo #${this.escaparHtml(macho?.numero_anilla || '')} (${this.escaparHtml(macho?.familia_origen || '')}) rota óptimamente hacia hembras de <strong>${this.escaparHtml(famSugerida)}</strong>.
        </div>
      `;
    }
  },

  // =========================================================================
  // 5.5 MÓDULO DE EXPORTADORES OFICIALES PARA EL MAPA, ARCA Y DAD-IS (FASE 3)
  // Cumplimiento: Real Decreto 45/2019, Reglamento (UE) 2016/1012, FAO DAD-IS
  // =========================================================================

  // Descargador universal en cliente mediante Blob y URL.createObjectURL (100% Offline)
  descargarArchivoCliente(contenido, nombreArchivo, tipoMime = 'text/plain') {
    try {
      const blob = new Blob([contenido], { type: tipoMime });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = nombreArchivo;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 1500);
    } catch (err) {
      console.error('[Exportador] Error descargando archivo cliente:', err);
      alert(`Error al generar la descarga: ${err.message}`);
    }
  },

  escaparValorCSV(val) {
    if (val === null || val === undefined) return '""';
    const str = String(val).trim().replace(/"/g, '""');
    return `"${str}"`;
  },

  obtenerAnimalesParaExportar(soloFiltrados = null) {
    if (soloFiltrados === true) {
      return this.obtenerAnimalesFiltrados();
    }
    if (soloFiltrados === false) {
      return [...this.estado.animales];
    }
    const radio = document.querySelector('input[name="export-ambito"]:checked');
    if (radio && radio.value === 'filtrado') {
      return this.obtenerAnimalesFiltrados();
    }
    return [...this.estado.animales];
  },

  toggleDropdownExportaciones() {
    const menu = document.getElementById('menu-exportaciones-oficiales');
    const btn = document.getElementById('btn-dropdown-exportaciones');
    const chevron = document.getElementById('icon-chevron-exportaciones');
    if (!menu) return;

    this.actualizarConteoExportacion();
    const isHidden = menu.classList.contains('hidden');
    if (isHidden) {
      menu.classList.remove('hidden');
      if (chevron) chevron.classList.add('rotate-180');
      if (btn) btn.setAttribute('aria-expanded', 'true');
    } else {
      menu.classList.add('hidden');
      if (chevron) chevron.classList.remove('rotate-180');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    }
  },

  cerrarDropdownExportaciones() {
    const menu = document.getElementById('menu-exportaciones-oficiales');
    const btn = document.getElementById('btn-dropdown-exportaciones');
    const chevron = document.getElementById('icon-chevron-exportaciones');
    if (menu) menu.classList.add('hidden');
    if (chevron) chevron.classList.remove('rotate-180');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  },

  actualizarConteoExportacion() {
    const conteoEl = document.getElementById('export-conteo-info');
    const labelFiltrados = document.getElementById('export-label-filtrados');
    const labelCompleto = document.getElementById('export-label-completo');

    const total = this.estado.animales ? this.estado.animales.length : 0;
    const filtrados = this.obtenerAnimalesFiltrados ? this.obtenerAnimalesFiltrados().length : total;

    if (labelFiltrados) {
      labelFiltrados.textContent = `Filtros activos (${filtrados})`;
    }
    if (labelCompleto) {
      labelCompleto.textContent = `Censo completo (${total})`;
    }

    if (conteoEl) {
      const radio = document.querySelector('input[name="export-ambito"]:checked');
      const esFiltrado = radio ? radio.value === 'filtrado' : true;
      if (esFiltrado) {
        conteoEl.textContent = `${filtrados} ${filtrados === 1 ? 'ejemplar' : 'ejemplares'}`;
      } else {
        conteoEl.textContent = `${total} ${total === 1 ? 'ejemplar' : 'ejemplares'}`;
      }
    }
  },

  configurarEventosExportacion() {
    document.addEventListener('click', (e) => {
      const dropdown = document.getElementById('dropdown-exportaciones-oficiales');
      if (dropdown && !dropdown.contains(e.target)) {
        this.cerrarDropdownExportaciones();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.cerrarDropdownExportaciones();
      }
    });
  },

  // =========================================================================
  // EXPORTADOR OFICIAL 1: SISTEMA ARCA / e-ZOOTECNIA (CSV CON BOM UTF-8)
  // Cumplimiento: Real Decreto 45/2019, Reglamento (UE) 2016/1012, MAPA
  // Columnas: codigo_rega, titular_nombre, codigo_anilla, seccion_libro (RF, RA, RN, RD, RM),
  //           sexo, fecha_nacimiento, variedad, anilla_padre, anilla_madre,
  //           puntuacion_100p, estado_reproductor, latitud_gps, longitud_gps
  // =========================================================================
  exportarFormatoARCA(soloFiltrados = null) {
    const censo = this.obtenerAnimalesParaExportar(soloFiltrados);
    if (!censo || censo.length === 0) {
      alert('No hay ejemplares disponibles para exportar con los criterios seleccionados.');
      return;
    }

    const fechaStr = new Date().toISOString().split('T')[0];
    const columnasOficiales = [
      'codigo_rega',
      'titular_nombre',
      'codigo_anilla',
      'seccion_libro',
      'sexo',
      'fecha_nacimiento',
      'variedad',
      'anilla_padre',
      'anilla_madre',
      'puntuacion_100p',
      'estado_reproductor',
      'latitud_gps',
      'longitud_gps'
    ];

    const lineas = [columnasOficiales.join(',')];

    censo.forEach(a => {
      // 1. Explotación y titular
      const exp = this.estado.explotaciones.find(e => e.id === a.explotacion_id);
      const codigoRega = a.codigo_rega || a.rega || exp?.codigo_rega || exp?.rega || '';
      const titularNombre = exp?.nombre_titular || a.titular_nombre || 'Criador Asociado ESGA025';

      // 2. Anilla oficial y sección
      const codigoAnilla = a.codigo_identificacion || a.numero_anilla || '';
      const seccionLibro = a.seccion_libro || 'RN';
      const sexo = a.sexo || '';
      const fechaNac = a.fecha_nacimiento || '';
      const variedad = a.variedad || 'Moteada / Exchequer';

      // 3. Progenitores oficiales (anillas)
      const p = this.estado.animales.find(x => x.id === a.id_padre || x.codigo_identificacion === a.id_padre || x.numero_anilla === a.id_padre);
      const anillaPadre = p ? (p.codigo_identificacion || p.numero_anilla) : (a.id_padre || '');

      const m = this.estado.animales.find(x => x.id === a.id_madre || x.codigo_identificacion === a.id_madre || x.numero_anilla === a.id_madre);
      const anillaMadre = m ? (m.codigo_identificacion || m.numero_anilla) : (a.id_madre || '');

      // 4. Puntuación oficial baremo 100 puntos (CNZ)
      const insp = this.estado.inspecciones ? this.estado.inspecciones.find(i => i.animal_id === a.id) : null;
      let puntuacion100p = '';
      if (insp && insp.puntuacion_total != null) {
        puntuacion100p = Number(insp.puntuacion_total).toFixed(1);
      } else if (a.puntuacion_100p != null) {
        puntuacion100p = Number(a.puntuacion_100p).toFixed(1);
      }

      // 5. Estado reproductor oficial
      let estadoReproductor = a.estado_reproductor;
      if (!estadoReproductor) {
        if (a.estado === 'Baja') {
          estadoReproductor = 'Baja';
        } else if (['RF', 'RD', 'RM'].includes(a.seccion_libro)) {
          estadoReproductor = 'Apto';
        } else if (a.seccion_libro === 'RN') {
          estadoReproductor = 'Pendiente';
        } else {
          estadoReproductor = 'Auxiliar';
        }
      }

      // 6. Coordenadas GPS
      const latGps = a.geolocalizacion_alta?.latitud ?? a.latitud ?? exp?.latitud ?? '';
      const lonGps = a.geolocalizacion_alta?.longitud ?? a.longitud ?? exp?.longitud ?? '';

      const fila = [
        this.escaparValorCSV(codigoRega),
        this.escaparValorCSV(titularNombre),
        this.escaparValorCSV(codigoAnilla),
        this.escaparValorCSV(seccionLibro),
        this.escaparValorCSV(sexo),
        this.escaparValorCSV(fechaNac),
        this.escaparValorCSV(variedad),
        this.escaparValorCSV(anillaPadre),
        this.escaparValorCSV(anillaMadre),
        puntuacion100p !== '' ? puntuacion100p : '""',
        this.escaparValorCSV(estadoReproductor),
        latGps !== '' ? latGps : '""',
        lonGps !== '' ? lonGps : '""'
      ];

      lineas.push(fila.join(','));
    });

    // UTF-8 BOM para apertura nativa e inmediata en Excel en Windows / Mac sin corrupción de caracteres
    const BOM = '\uFEFF';
    const csvCompleto = BOM + lineas.join('\r\n');
    const nombreArchivo = `ARCA_ESGA025_Censo_${fechaStr}.csv`;

    this.descargarArchivoCliente(csvCompleto, nombreArchivo, 'text/csv;charset=utf-8;');
    this.cerrarDropdownExportaciones();
  },

  // =========================================================================
  // EXPORTADOR OFICIAL 2: INFORME DEMOGRÁFICO Y BIODIVERSIDAD DAD-IS / FAO (JSON)
  // Cumplimiento: Directrices FAO para la Conservación In Situ / DAD-IS
  // Indicadores: Total activos, Machos reproductores, Hembras reproductoras,
  //              Explotaciones REGA activas, Estimación Ne (Tamaño Efectivo), Fx medio
  // =========================================================================
  exportarInformeDADIS(soloFiltrados = null) {
    const censo = this.obtenerAnimalesParaExportar(soloFiltrados);
    if (!censo || censo.length === 0) {
      alert('No hay ejemplares disponibles para generar el informe demográfico DAD-IS.');
      return;
    }

    const fechaIso = new Date().toISOString();
    const fechaStr = fechaIso.split('T')[0];
    const anio = new Date().getFullYear();

    // 1. Filtrar animales activos (excluyendo bajas)
    const activos = censo.filter(a => a.estado !== 'Baja');

    // 2. Machos y hembras reproductores (aptos según sección de libro RF/RD/RM o inspección)
    const machosReproductores = activos.filter(a =>
      a.sexo === 'Macho' && (['RF', 'RD', 'RM'].includes(a.seccion_libro) || a.estado_reproductor === 'Apto')
    );
    const hembrasReproductoras = activos.filter(a =>
      a.sexo === 'Hembra' && (['RF', 'RD', 'RM'].includes(a.seccion_libro) || a.estado_reproductor === 'Apto')
    );

    const Nm = machosReproductores.length;
    const Nf = hembrasReproductoras.length;

    // 3. Estimación del Tamaño Efectivo (Ne): Fórmula clásica de Sewall Wright: Ne = (4 * Nm * Nf) / (Nm + Nf)
    const ne = (Nm > 0 && Nf > 0) ? ((4 * Nm * Nf) / (Nm + Nf)) : 0;
    const neEstimado = Math.round(ne * 100) / 100;

    // 4. Coeficiente de Consanguinidad medio (Fx) de la población
    const sumaFx = activos.reduce((acc, a) => acc + (Number(a.coeficiente_consanguinidad) || 0), 0);
    const fxMedia = activos.length > 0 ? (sumaFx / activos.length) : 0;
    const fxMediaRedondeada = Math.round(fxMedia * 100000) / 100000;
    const fxMediaPorcentaje = `${(fxMedia * 100).toFixed(2)}%`;

    // 5. Explotaciones REGA activas censadas
    const regasMap = new Map();
    activos.forEach(a => {
      const exp = this.estado.explotaciones.find(e => e.id === a.explotacion_id);
      const rega = a.codigo_rega || a.rega || exp?.codigo_rega || exp?.rega;
      if (rega && rega !== 'Sin REGA') {
        if (!regasMap.has(rega)) {
          regasMap.set(rega, {
            codigo_rega: rega,
            titular: exp?.nombre_titular || a.titular_nombre || 'Criador Asociado',
            criadero: exp?.nombre_criadero || 'Aviario Oficial',
            municipio: exp?.municipio || 'Alicante',
            provincia: exp?.provincia || 'Alicante',
            ejemplares_censados: 0
          });
        }
        regasMap.get(rega).ejemplares_censados++;
      }
    });

    const totalRegasActivas = regasMap.size;
    const explotacionesDetalladas = Array.from(regasMap.values());

    // 6. Desglose por Secciones de Libro Genealógico
    const secciones = { RF: 0, RA: 0, RN: 0, RD: 0, RM: 0 };
    activos.forEach(a => {
      if (secciones[a.seccion_libro] !== undefined) {
        secciones[a.seccion_libro]++;
      }
    });

    // 7. Desglose por Variedades
    const variedades = {};
    activos.forEach(a => {
      const v = a.variedad || 'Moteada / Exchequer';
      variedades[v] = (variedades[v] || 0) + 1;
    });

    // 8. Estado de Riesgo Zoocenótico según umbrales FAO DAD-IS
    let estadoRiesgoFAO = 'En peligro / Endangered';
    if (Nf === 0 || neEstimado < 50) {
      estadoRiesgoFAO = 'Crítico / Critical (Ne < 50)';
    } else if (Nf <= 1000 || neEstimado < 100) {
      estadoRiesgoFAO = 'En Peligro / Endangered (Ne < 100, Hembras <= 1000)';
    } else if (Nf <= 2000) {
      estadoRiesgoFAO = 'Vulnerable';
    } else {
      estadoRiesgoFAO = 'Fuera de Riesgo / Not at risk';
    }

    const reporteDADIS = {
      sistema_emisor: 'AlacantinApp v5 (Oficial ESGA025)',
      fecha_reporte: fechaIso,
      anio_referencia: anio,
      ambito_exportacion: censo.length === this.estado.animales.length ? 'Censo Completo' : 'Censo Filtrado (Filtros Activos)',
      normativa_legal: 'Reglamento (UE) 2016/1012 y Real Decreto 45/2019',
      raza: {
        codigo_nacional: 'ESGA025',
        nombre_oficial: 'Gallina Alacantina',
        especie: 'Gallus gallus domesticus (Aviar)',
        pais_origen: 'España (ESP)',
        comunidad_autonoma: 'Comunidad Valenciana',
        asociacion_criadores: 'Club Gallina Alacantina'
      },

      // INDICADORES DE BIODIVERSIDAD EXIGIDOS POR FAO DAD-IS / MAPA
      indicadores_biodiversidad_fao: {
        total_animales_activos: activos.length,
        numero_machos_reproductores: Nm,
        numero_hembras_reproductoras: Nf,
        numero_explotaciones_rega_activas: totalRegasActivas,
        estimacion_ne_tamano_efectivo: neEstimado,
        consanguinidad_media_fx: fxMediaRedondeada,
        consanguinidad_media_porcentaje: fxMediaPorcentaje,
        estado_riesgo_zoocenotico: estadoRiesgoFAO
      },

      // DESGLOSE DEMOGRÁFICO DETALLADO
      desglose_demografico: {
        censo_total_analizado: censo.length,
        machos_totales_activos: activos.filter(a => a.sexo === 'Macho').length,
        hembras_totales_activas: activos.filter(a => a.sexo === 'Hembra').length,
        ejemplares_baja_o_inactivos: censo.filter(a => a.estado === 'Baja').length,
        distribucion_por_seccion: secciones,
        distribucion_por_variedad: variedades
      },

      // CENSO DE EXPLOTACIONES REGA ACTIVAS
      explotaciones_rega_activas: explotacionesDetalladas,

      // MAPEO ESTÁNDAR DAD-IS (FAO GLOBAL ANIMAL GENETIC RESOURCES DATA BANK)
      fao_dadis_standard_mapping: {
        specie_name: 'Chicken',
        breed_name: 'Gallina Alacantina',
        breed_code: 'ESGA025',
        iso3_country: 'ESP',
        reporting_year: anio,
        total_population: activos.length,
        breeding_males: Nm,
        breeding_females: Nf,
        active_herds_or_flocks: totalRegasActivas,
        effective_population_size_ne: neEstimado,
        average_inbreeding_coefficient: fxMediaRedondeada,
        risk_category: estadoRiesgoFAO
      }
    };

    const jsonFinal = JSON.stringify(reporteDADIS, null, 2);
    const nombreArchivo = `DADIS_ESGA025_Reporte_${fechaStr}.json`;

    this.descargarArchivoCliente(jsonFinal, nombreArchivo, 'application/json;charset=utf-8;');
    this.cerrarDropdownExportaciones();
  },

  // =========================================================================
  // EXPORTADOR OFICIAL 3: MATRIZ COMPLETA DE PEDIGRÍ SANEADA (CSV 3 COLUMNAS)
  // Formato estandarizado para software científico: ENDOG, CFC, PEDIG, R optiSel
  // Columnas: ID_Animal, ID_Padre, ID_Madre
  // Saneado: Código '0' para ancestros desconocidos y clausura genealógica limpia
  // =========================================================================
  exportarMatrizPedigriCientifica(soloFiltrados = null) {
    const censo = this.obtenerAnimalesParaExportar(soloFiltrados);
    if (!censo || censo.length === 0) {
      alert('No hay ejemplares disponibles para generar la matriz de pedigrí.');
      return;
    }

    const fechaStr = new Date().toISOString().split('T')[0];

    // Función de saneado estricto para programas científicos (sin comas, comillas ni espacios)
    const sanearId = (id) => {
      if (!id || id === '0' || id === 'null' || id === 'undefined' || id === 'Sin registrar') return '0';
      return String(id).trim().replace(/[,;"'\s]/g, '_');
    };

    // Mapa de registros de pedigrí saneados
    const mapaPedigri = new Map();
    const animalesBase = new Set();

    // 1. Registrar ejemplares del conjunto
    censo.forEach(a => {
      const idAnimal = sanearId(a.codigo_identificacion || a.id);

      // Resolver padre
      const p = this.estado.animales.find(x => x.id === a.id_padre || x.codigo_identificacion === a.id_padre || x.numero_anilla === a.id_padre);
      const idPadre = p ? sanearId(p.codigo_identificacion || p.id) : (a.id_padre ? sanearId(a.id_padre) : '0');

      // Resolver madre
      const m = this.estado.animales.find(x => x.id === a.id_madre || x.codigo_identificacion === a.id_madre || x.numero_anilla === a.id_madre);
      const idMadre = m ? sanearId(m.codigo_identificacion || m.id) : (a.id_madre ? sanearId(a.id_madre) : '0');

      mapaPedigri.set(idAnimal, {
        idAnimal,
        idPadre,
        idMadre,
        esFundador: (idPadre === '0' && idMadre === '0')
      });

      if (idPadre !== '0') animalesBase.add(idPadre);
      if (idMadre !== '0') animalesBase.add(idMadre);
    });

    // 2. Clausura genealógica saneada: si un padre/madre no tiene fila propia (ej. subset filtrado),
    //    se añade como animal base con progenitores '0,0' para garantizar la compatibilidad con ENDOG y CFC
    animalesBase.forEach(idAncestro => {
      if (!mapaPedigri.has(idAncestro)) {
        mapaPedigri.set(idAncestro, {
          idAnimal: idAncestro,
          idPadre: '0',
          idMadre: '0',
          esFundador: true
        });
      }
    });

    // 3. Ordenación topológica para ENDOG / CFC: Primero fundadores (0, 0), luego descendientes
    const registros = Array.from(mapaPedigri.values());
    registros.sort((x, y) => {
      if (x.esFundador && !y.esFundador) return -1;
      if (!x.esFundador && y.esFundador) return 1;
      return x.idAnimal.localeCompare(y.idAnimal);
    });

    // 4. Formatear matriz de 3 columnas
    const lineas = ['ID_Animal,ID_Padre,ID_Madre'];
    registros.forEach(r => {
      lineas.push(`${r.idAnimal},${r.idPadre},${r.idMadre}`);
    });

    const BOM = '\uFEFF';
    const csvCompleto = BOM + lineas.join('\r\n');
    const nombreArchivo = `Matriz_Pedigri_ESGA025_${fechaStr}.csv`;

    this.descargarArchivoCliente(csvCompleto, nombreArchivo, 'text/csv;charset=utf-8;');
    this.cerrarDropdownExportaciones();
  },

  // Exportador CSV de Matriz de Pedigrí extendida para Ne (ENDOG / CFC / R)
  exportarMatrizNeCSV() {
    const lineas = [
      'ANIMAL_ID,SIRE_ID,DAM_ID,BIRTH_YEAR,SEX,SECTION,VARIETY,WRIGHT_FX'
    ];

    this.estado.animales.forEach(a => {
      const anio = a.fecha_nacimiento ? new Date(a.fecha_nacimiento).getFullYear() : '2023';
      const padre = a.id_padre ? a.id_padre : '0';
      const madre = a.id_madre ? a.id_madre : '0';
      const sexoNum = a.sexo === 'Macho' ? '1' : '2';
      const fx = (a.coeficiente_consanguinidad || 0).toFixed(5);

      lineas.push(`${a.id},${padre},${madre},${anio},${sexoNum},${a.seccion_libro},"${a.variedad}",${fx}`);
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + encodeURIComponent(lineas.join('\n'));
    const link = document.createElement('a');
    link.setAttribute('href', csvContent);
    link.setAttribute('download', `ESGA025_Matriz_Pedigri_Ne_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  exportarLibroCSV() {
    const lineas = [
      'CODIGO_OFICIAL,NUMERO_ANILLA,CALIBRE_MM,SEXO,NOMBRE,FECHA_NAC,SECCION,FAMILIA,PESO_KG,CONSANGUINIDAD_FX'
    ];

    this.estado.animales.forEach(a => {
      lineas.push(`"${a.codigo_identificacion}","${a.numero_anilla}",${a.calibre_anilla_mm || (a.sexo === 'Macho'?20:18)},"${a.sexo}","${a.nombre || ''}","${a.fecha_nacimiento}","${a.seccion_libro}","${a.familia_origen}",${a.peso_actual_kg || 0},${(a.coeficiente_consanguinidad || 0).toFixed(5)}`);
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + encodeURIComponent(lineas.join('\n'));
    const link = document.createElement('a');
    link.setAttribute('href', csvContent);
    link.setAttribute('download', `Libro_Genealogico_ESGA025_Oficial_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  // =========================================================================
  // 6. MÓDULO GENERADOR DE CERTIFICADOS ZOOTÉCNICOS OFICIALES (PDF)
  // Cumplimiento: Reglamento (UE) 2016/1012, RD 45/2019 y Protocolo CNZ (ESGA025)
  // =========================================================================

  generarCertificadoActual() {
    const animalId = document.getElementById('pedigri-animal-select')?.value;
    if (!animalId) {
      alert('Por favor, selecciona un ejemplar para generar su Certificado Zootécnico Oficial.');
      return;
    }
    this.generarCertificadoPDF(animalId);
  },

  imprimirCertificadoDirecto(animalId) {
    this.generarCertificadoPDF(animalId);
  },

  async generarCertificadoPDF(animalId) {
    if (!animalId) {
      alert('Por favor, selecciona un ejemplar válido para generar su Certificado Zootécnico.');
      return;
    }

    const animal = this.estado.animales.find(a => a.id === animalId);
    if (!animal) {
      alert('Error: Ejemplar no localizado en el censo oficial.');
      return;
    }

    const anillaLimpia = (animal.numero_anilla || '0000').toString().trim();
    this.mostrarNotificacionToast(`⏳ Recopilando datos y maquetando Certificado Zootécnico para #${anillaLimpia}...`, 'info');

    // 1. Recopilar genealogía completa a 3 generaciones (Padres, Abuelos y Bisabuelos)
    const padre = this.estado.animales.find(a => a.id === animal.id_padre) || null;
    const madre = this.estado.animales.find(a => a.id === animal.id_madre) || null;

    const abuelo_pp = padre ? this.estado.animales.find(a => a.id === padre.id_padre) : null;
    const abuela_pm = padre ? this.estado.animales.find(a => a.id === padre.id_madre) : null;
    const abuelo_mp = madre ? this.estado.animales.find(a => a.id === madre.id_padre) : null;
    const abuela_mm = madre ? this.estado.animales.find(a => a.id === madre.id_madre) : null;

    const bis_ppp = abuelo_pp ? this.estado.animales.find(a => a.id === abuelo_pp.id_padre) : null;
    const bis_ppm = abuelo_pp ? this.estado.animales.find(a => a.id === abuelo_pp.id_madre) : null;
    const bis_pmp = abuela_pm ? this.estado.animales.find(a => a.id === abuela_pm.id_padre) : null;
    const bis_pmm = abuela_pm ? this.estado.animales.find(a => a.id === abuela_pm.id_madre) : null;

    const bis_mpp = abuelo_mp ? this.estado.animales.find(a => a.id === abuelo_mp.id_padre) : null;
    const bis_mpm = abuelo_mp ? this.estado.animales.find(a => a.id === abuelo_mp.id_madre) : null;
    const bis_mmp = abuela_mm ? this.estado.animales.find(a => a.id === abuela_mm.id_padre) : null;
    const bis_mmm = abuela_mm ? this.estado.animales.find(a => a.id === abuela_mm.id_madre) : null;

    const ancestros = {
      padre, madre,
      abuelo_pp, abuela_pm, abuelo_mp, abuela_mm,
      bis_ppp, bis_ppm, bis_pmp, bis_pmm,
      bis_mpp, bis_mpm, bis_mmp, bis_mmm
    };

    // 2. Recopilar datos de Explotación Ganadera y Criador Asociado
    let explotacion = this.estado.explotaciones.find(e => e.id === animal.explotacion_id);
    if (!explotacion && (this.estado.aviario || this.estado.aviarioActivo)) {
      explotacion = this.estado.aviario || this.estado.aviarioActivo;
    }
    if (!explotacion) {
      explotacion = {
        nombre_titular: animal.titular_nombre || this.estado.usuarioActivo?.nombre || '',
        nombre_criadero: 'Aviario Registrado ESGA025',
        codigo_rega: animal.codigo_rega || this.estado.usuarioActivo?.rega || 'TEMP-REGA-001',
        numero_socio: this.estado.usuarioActivo?.numero_socio || 'NS-000',
        municipio: 'Alicante',
        provincia: 'Alicante',
        latitud: animal.geolocalizacion_alta?.latitud ?? null,
        longitud: animal.geolocalizacion_alta?.longitud ?? null
      };
    }

    // 3. Recopilar Evaluación Morfológica Oficial (Baremo 100 Puntos CNZ) e Inspector Dinámico
    const inspeccion = this.estado.inspecciones.find(i => i.animal_id === animal.id) || null;
    const inspector = this.obtenerDatosInspectorActivo(inspeccion);

    // 4. Recopilar Control Oficial de Rendimiento y Puesta (15 Días)
    const controlPuesta = this.estado.controlesPuesta
      ? this.estado.controlesPuesta.find(c => c.animal_id === animal.id)
      : null;

    // 5. Recopilar Fotografías (Obligatorias + Galería Opcional in situ)
    const fotos = {
      lateral: animal.fotos?.lateral || animal.multimedia_urls?.lateral,
      cabeza: animal.fotos?.cabeza || animal.multimedia_urls?.cabeza,
      tarsos: animal.fotos?.tarsos || animal.multimedia_urls?.tarsos,
      galeria_opcional: animal.fotos?.galeria_opcional || animal.multimedia_urls?.galeria_opcional || []
    };

    // 6. Generar Documento PDF Oficial
    if (window.PDFEngine && window.PDFEngine.descargarCertificadoZootecnicoPDF) {
      try {
        const resultado = await window.PDFEngine.descargarCertificadoZootecnicoPDF(animal, {
          ancestros,
          explotacion,
          inspeccion,
          inspector,
          controlPuesta,
          fotos
        });

        this.mostrarNotificacionToast(
          `✅ Certificado generado con éxito: Certificado_ESGA025_${anillaLimpia}.pdf`,
          'success'
        );
      } catch (err) {
        console.error('[App] Error al generar certificado zootécnico:', err);
        this.mostrarNotificacionToast('⚠️ Error al generar PDF cliente. Abriendo vista de impresión...', 'error');
        window.PDFEngine.abrirVentanaImpresionDirecta(
          await window.PDFEngine.construirHtmlCertificado(animal, { ancestros, explotacion, inspeccion, inspector, controlPuesta, fotos }),
          `Certificado_ESGA025_${anillaLimpia}.pdf`
        );
      }
    } else {
      alert('El motor oficial de PDF no está inicializado. Por favor, recarga la aplicación.');
    }
  },

  // Notificaciones flotantes tipo Toast no intrusivas
  mostrarNotificacionToast(mensaje, tipo = 'info') {
    let toast = document.getElementById('alacantina-app-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'alacantina-app-toast';
      document.body.appendChild(toast);
    }

    const estilos = {
      info: 'bg-slate-900/95 text-white border-amber-500/60 shadow-amber-500/20',
      success: 'bg-emerald-950/95 text-emerald-200 border-emerald-600 shadow-emerald-500/20',
      error: 'bg-rose-950/95 text-rose-200 border-rose-600 shadow-rose-500/20'
    };

    toast.className = `fixed bottom-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl backdrop-blur transition-all duration-300 font-sans text-xs border ${estilos[tipo] || estilos.info}`;
    toast.innerHTML = `
      <div class="flex items-center gap-2">
        <i class="fa-solid ${tipo === 'success' ? 'fa-circle-check text-emerald-400 text-sm' : (tipo === 'error' ? 'fa-triangle-exclamation text-rose-400 text-sm' : 'fa-circle-notch fa-spin text-amber-400 text-sm')}"></i>
        <span class="font-medium">${mensaje}</span>
      </div>
    `;
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';

    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
    }, 4500);
  },

  // =========================================================================
  // 7. PESTAÑA 5: GESTIÓN DE LOTES Y FAMILIAS (REGLA DE GOBE)
  // =========================================================================
  sugerirMachoGobe(familiaReceptora) {
    // Regla circular: E -> A -> B -> C -> D -> E
    const rotacionInversa = {
      'Familia B': 'Familia A',
      'Familia C': 'Familia B',
      'Familia D': 'Familia C',
      'Familia E': 'Familia D',
      'Familia A': 'Familia E'
    };

    const familiaOrigenSugerida = rotacionInversa[familiaReceptora] || 'Familia A';
    const sugerenciaText = document.getElementById('lote-gobe-sugerencia');
    if (sugerenciaText) {
      sugerenciaText.textContent = `Recomendación Gobe: Para cubrir hembras de ${familiaReceptora}, asignar un macho procedente de ${familiaOrigenSugerida}.`;
    }

    // Filtrar select de gallos destacando los de esa familia (solo animales del usuario/aviario activo)
    const selectGallo = document.getElementById('lote-gallo');
    if (selectGallo) {
      const machos = this.estado.animales.filter(a => a.sexo === 'Macho' && this.perteneceAUsuarioActivo(a));
      selectGallo.innerHTML = '<option value="">-- Seleccionar Gallo Reproductor --</option>';
      machos.forEach(m => {
        const esSugerido = m.familia_origen === familiaOrigenSugerida;
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = `${m.numero_anilla} (${m.nombre || m.codigo_identificacion}) - ${m.familia_origen} ${esSugerido ? '★ [RECOMENDADO GOBE]' : ''}`;
        if (esSugerido) opt.selected = true;
        selectGallo.appendChild(opt);
      });
    }
  },

  async guardarNuevoLote(event) {
    event.preventDefault();

    const u = this.estado.usuarioActivo;
    const aviario = this.estado.aviario || this.estado.aviarioActivo;
    if (!u || this.estado.modoVisitante) {
      alert('Debes iniciar sesión con tu cuenta de criador para registrar lotes de reproducción.');
      return;
    }

    const codigo = document.getElementById('lote-codigo').value.trim();
    const receptora = document.getElementById('lote-familia-receptora').value;
    const temporada = parseInt(document.getElementById('lote-temporada').value, 10);
    const galloId = document.getElementById('lote-gallo').value;
    const estado = document.getElementById('lote-estado').value;

    const gallo = this.estado.animales.find(a => a.id === galloId);
    const siguienteRotacion = {
      'Familia A': 'Familia B',
      'Familia B': 'Familia C',
      'Familia C': 'Familia D',
      'Familia D': 'Familia E',
      'Familia E': 'Familia A'
    };

    const nuevoLote = {
      id: 'lote-' + Date.now(),
      codigo_lote: codigo,
      familia_receptora: receptora,
      familia_macho: gallo ? gallo.familia_origen : 'Familia A',
      id_gallo: galloId,
      temporada: temporada,
      rotacion_siguiente_familia: siguienteRotacion[receptora] || 'Familia A',
      activo: (estado === 'Activo'),
      usuario_id: u.id,
      explotacion_id: aviario?.id || u.explotacion_id || null,
      codigo_rega: aviario?.codigo_rega || aviario?.rega || u.rega || 'TEMP-REGA-001',
      notas: `Lote de apareamiento de temporada ${temporada} conforme a la Regla de Gobe.`
    };

    await this.db.put('lotes', nuevoLote);
    this.estado.lotes.unshift(nuevoLote);

    if (navigator.onLine && this.supabaseClient) {
      try {
        await this.supabaseClient.from('lotes_apareamiento').insert([nuevoLote]);
      } catch (err) {
        await this.db.put('syncQueue', { tipo: 'LOTE', payload: nuevoLote, creado_en: Date.now() });
      }
    } else {
      await this.db.put('syncQueue', { tipo: 'LOTE', payload: nuevoLote, creado_en: Date.now() });
    }

    this.actualizarContadorSyncQueue();
    this.renderizarLotes();
    alert(`Lote ${codigo} guardado con éxito.`);
    document.getElementById('form-nuevo-lote').reset();
  },

  renderizarLotes() {
    const cont = document.getElementById('lista-lotes-container');
    if (!cont) return;

    const lotesVisibles = (this.estado.lotes || []).filter(l => this.perteneceAUsuarioActivo(l));

    if (lotesVisibles.length === 0) {
      cont.innerHTML = '<p class="text-xs text-slate-500">No hay lotes de apareamiento registrados para este aviario/usuario actualmente.</p>';
      return;
    }

    cont.innerHTML = '';
    lotesVisibles.forEach(l => {
      const gallo = this.estado.animales.find(a => a.id === l.id_gallo);
      const card = document.createElement('div');
      card.className = 'p-3 rounded-lg bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs';
      card.innerHTML = `
        <div>
          <div class="flex items-center gap-2">
            <span class="font-bold font-mono text-white">${l.codigo_lote}</span>
            <span class="px-2 py-0.5 rounded text-[10px] font-bold ${l.activo ? 'bg-emerald-950 text-emerald-400' : 'bg-slate-800 text-slate-400'}">${l.activo ? 'Activo' : 'Cerrado'}</span>
          </div>
          <p class="text-slate-400 mt-0.5">
            <strong>Hembras:</strong> ${l.familia_receptora} | <strong>Gallo:</strong> ${gallo ? `#${gallo.numero_anilla} (${gallo.nombre || gallo.codigo_identificacion})` : 'Sin asignar'} (${l.familia_macho})
          </p>
        </div>
        <div class="text-right">
          <span class="text-[10px] text-pink-400 block font-semibold">Siguiente en ciclo Gobe:</span>
          <span class="font-bold text-slate-200">→ ${l.rotacion_siguiente_familia}</span>
        </div>
      `;
      cont.appendChild(card);
    });
  },

  // =========================================================================
  // 8. ALGORITMOS ZOOTÉCNICOS (WRIGHT Fx & PARENTESCO)
  // =========================================================================
  zootecnia: {
    /**
     * Coeficiente de Consanguinidad de Wright de un animal individual:
     * Fx = sum (1/2)^(n1 + n2 + 1) * (1 + FA)
     */
    calcularFxAnimal(animal, censo) {
      if (!animal || !animal.id_padre || !animal.id_madre) return 0.0;
      return this.calcularFxDescendencia(animal.id_padre, animal.id_madre, censo);
    },

    /**
     * Calcula la consanguinidad potencial del hipotético hijo entre dos ejemplares
     */
    calcularFxDescendencia(padreId, madreId, censo) {
      if (!padreId || !madreId || padreId === madreId) {
        if (padreId && padreId === madreId) return 0.5; // Autofecundación teórica
        return 0.0;
      }

      // Obtener todos los caminos de ancestros desde el padre y desde la madre
      const caminosPadre = this.obtenerRutasAncestros(padreId, censo, 0);
      const caminosMadre = this.obtenerRutasAncestros(madreId, censo, 0);

      // Ancestros comunes en ambos linajes
      let fxTotal = 0.0;
      const ancestrosComunes = Object.keys(caminosPadre).filter(id => caminosMadre[id]);

      ancestrosComunes.forEach(ancestroId => {
        const distanciasP = caminosPadre[ancestroId];
        const distanciasM = caminosMadre[ancestroId];

        // Consanguinidad del propio ancestro común FA
        const animalAncestro = censo.find(a => a.id === ancestroId);
        const fA = animalAncestro ? (animalAncestro.coeficiente_consanguinidad || 0) : 0;

        distanciasP.forEach(n1 => {
          distanciasM.forEach(n2 => {
            // Fórmula estricta de Sewall Wright
            const incremento = Math.pow(0.5, n1 + n2 + 1) * (1 + fA);
            fxTotal += incremento;
          });
        });
      });

      return Math.min(1.0, fxTotal);
    },

    obtenerRutasAncestros(individuoId, censo, distanciaActual, visitados = new Set()) {
      const mapa = {};
      if (distanciaActual > 6 || visitados.has(individuoId)) return mapa;
      visitados.add(individuoId);

      const ind = censo.find(a => a.id === individuoId);
      if (!ind) return mapa;

      if (!mapa[individuoId]) mapa[individuoId] = [];
      mapa[individuoId].push(distanciaActual);

      if (ind.id_padre) {
        const padres = this.obtenerRutasAncestros(ind.id_padre, censo, distanciaActual + 1, new Set(visitados));
        for (const [id, dists] of Object.entries(padres)) {
          if (!mapa[id]) mapa[id] = [];
          mapa[id].push(...dists);
        }
      }

      if (ind.id_madre) {
        const madres = this.obtenerRutasAncestros(ind.id_madre, censo, distanciaActual + 1, new Set(visitados));
        for (const [id, dists] of Object.entries(madres)) {
          if (!mapa[id]) mapa[id] = [];
          mapa[id].push(...dists);
        }
      }

      return mapa;
    }
  },

  recalcularConsanguinidadCenso() {
    this.estado.animales.forEach(a => {
      if (a.id_padre && a.id_madre) {
        a.coeficiente_consanguinidad = this.zootecnia.calcularFxDescendencia(a.id_padre, a.id_madre, this.estado.animales);
      }
    });
  },

  // =========================================================================
  // 9. NAVEGACIÓN SPA Y MODALES AUXILIARES
  // =========================================================================
  cambiarTab(tabName) {
    if (tabName === 'puesta') {
      tabName = 'inspeccion';
    }

    const rolActual = this.obtenerRolUsuarioActual();

    // Protección RBAC estricta para el Panel de Administración (Vista exclusiva Administrador)
    if (tabName === 'admin' && rolActual !== 'administrador') {
      this.mostrarNotificacionToast('🔒 Acceso restringido: El Panel de Administración es exclusivo para usuarios con rol Administrador.', 'warning');
      tabName = 'censo';
    }

    // Protección Modo Visitante (Solo lectura: Censo, Pedigrí y Guía de Campo ESGA025)
    if (rolActual === 'visitante' && ['registro', 'lotes', 'inspeccion-insitu', 'admin'].includes(tabName)) {
      this.mostrarNotificacionToast('👀 Modo Visitante (Solo Lectura): Inicia sesión o regístrate para gestionar el censo, lotes o inspecciones.', 'info');
      tabName = 'censo';
    }

    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-nav-btn').forEach(btn => {
      if (btn.id === 'tab-btn-inspeccion-insitu') {
        btn.className = 'tab-nav-btn flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-extrabold transition text-emerald-300 bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/60 shadow-sm';
      } else if (btn.id === 'tab-btn-admin') {
        const ocultoAdmin = rolActual !== 'administrador' ? ' hidden' : '';
        btn.className = `tab-nav-btn flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-extrabold transition text-purple-300 bg-purple-950/80 hover:bg-purple-900 border border-purple-500/60 shadow-sm${ocultoAdmin}`;
      } else {
        btn.className = 'tab-nav-btn flex items-center gap-2 px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold transition text-slate-400 hover:text-white hover:bg-slate-800';
      }
    });

    const targetTab = document.getElementById(`tab-${tabName}`);
    const targetBtn = document.getElementById(`tab-btn-${tabName}`);

    if (targetTab) targetTab.classList.add('active');
    if (targetBtn) {
      if (tabName === 'inspeccion-insitu') {
        targetBtn.className = 'tab-nav-btn flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-black transition text-slate-950 bg-emerald-400 border-2 border-amber-300 shadow-lg';
      } else if (tabName === 'admin') {
        targetBtn.className = 'tab-nav-btn flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-black transition text-white bg-purple-600 border-2 border-amber-300 shadow-lg';
      } else {
        targetBtn.className = 'tab-nav-btn flex items-center gap-2 px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold transition text-amber-400 bg-slate-800 border border-amber-500/30';
      }
    }

    window.location.hash = tabName;

    if (tabName === 'inspeccion') {
      setTimeout(() => {
        this.renderizarAnaliticaPuesta();
        if (typeof this.renderizarModuloIncubacion === 'function') {
          this.renderizarModuloIncubacion();
        }
      }, 50);
    } else if (tabName === 'lotes') {
      setTimeout(() => {
        this.renderizarLotes();
        if (typeof this.poblarSimuladorAcoplamientos === 'function') {
          this.poblarSimuladorAcoplamientos();
        }
      }, 50);
    } else if (tabName === 'mapa-gis') {
      setTimeout(() => {
        if (typeof this.actualizarMapaGIS === 'function') {
          this.actualizarMapaGIS();
        }
      }, 80);
    } else if (tabName === 'germoplasma') {
      setTimeout(() => {
        if (typeof this.renderizarModuloGermoplasma === 'function') {
          this.renderizarModuloGermoplasma();
        }
      }, 50);
    } else if (tabName === 'inspeccion-insitu') {
      setTimeout(() => {
        this.refrescarVistaInspeccionInSitu();
        this.renderizarSolicitudesInspeccion();
      }, 50);
    } else if (tabName === 'admin') {
      setTimeout(() => {
        this.renderizarTablaUsuariosAdmin();
        this.renderizarSolicitudesInspeccion();
      }, 50);
    }
  },

  poblarSelectores() {
    // Select Explotaciones
    const selectExp = document.getElementById('alta-explotacion');
    if (selectExp) {
      selectExp.innerHTML = '';
      this.estado.explotaciones.forEach(e => {
        const opt = document.createElement('option');
        opt.value = e.id;
        const regaTxt = e.codigo_rega || e.rega || 'Sin REGA';
        const nombreExp = e.nombre_criadero || e.nombre_titular;
        opt.textContent = `${nombreExp} (${regaTxt}) - ${e.municipio}`;
        selectExp.appendChild(opt);
      });
      if (this.estado.aviarioActivo) {
        selectExp.value = this.estado.aviarioActivo.id;
      }
    }

    // Select Padres (Machos) y Madres (Hembras)
    const selectPadre = document.getElementById('alta-padre');
    const selectMadre = document.getElementById('alta-madre');
    const selectSimMacho = document.getElementById('sim-macho');
    const selectSimHembra = document.getElementById('sim-hembra');
    const selectInsp = document.getElementById('inspeccion-animal-select');
    const selectPedigri = document.getElementById('pedigri-animal-select');

    if (selectPadre) selectPadre.innerHTML = '<option value="">-- Sin padre registrado / Desconocido --</option>';
    if (selectMadre) selectMadre.innerHTML = '<option value="">-- Sin madre registrada / Desconocida --</option>';
    if (selectSimMacho) selectSimMacho.innerHTML = '<option value="">-- Seleccionar Gallo --</option>';
    if (selectSimHembra) selectSimHembra.innerHTML = '<option value="">-- Seleccionar Gallina --</option>';
    if (selectInsp) selectInsp.innerHTML = '<option value="">-- Seleccionar Ejemplar para Calificar --</option>';
    if (selectPedigri) selectPedigri.innerHTML = '<option value="">-- Seleccionar Ejemplar para Ver Pedigrí --</option>';

    this.estado.animales.forEach(a => {
      const label = `#${a.numero_anilla} (${a.nombre || a.codigo_identificacion}) - ${a.seccion_libro} - ${a.familia_origen}`;

      if (a.sexo === 'Macho') {
        if (selectPadre) {
          const opt = document.createElement('option');
          opt.value = a.id;
          opt.textContent = label;
          selectPadre.appendChild(opt);
        }
        if (selectSimMacho) {
          const opt = document.createElement('option');
          opt.value = a.id;
          opt.textContent = label;
          selectSimMacho.appendChild(opt);
        }
      } else {
        if (selectMadre) {
          const opt = document.createElement('option');
          opt.value = a.id;
          opt.textContent = label;
          selectMadre.appendChild(opt);
        }
        if (selectSimHembra) {
          const opt = document.createElement('option');
          opt.value = a.id;
          opt.textContent = label;
          selectSimHembra.appendChild(opt);
        }
      }

      if (selectInsp) {
        const opt = document.createElement('option');
        opt.value = a.id;
        opt.textContent = `${a.sexo === 'Macho' ? '♂' : '♀'} ${label}`;
        selectInsp.appendChild(opt);
      }

      if (selectPedigri) {
        const opt = document.createElement('option');
        opt.value = a.id;
        opt.textContent = `${a.sexo === 'Macho' ? '♂' : '♀'} ${label}`;
        selectPedigri.appendChild(opt);
      }
    });

    // Select Filtro REGA en Censo (FASE 2)
    const selectFiltroRega = document.getElementById('filtro-rega');
    if (selectFiltroRega) {
      const regas = new Set();
      this.estado.explotaciones.forEach(e => {
        const r = e.codigo_rega || e.rega;
        if (r) regas.add(r.trim());
      });
      this.estado.animales.forEach(a => {
        if (a.codigo_rega) regas.add(a.codigo_rega.trim());
      });
      const valPrevio = selectFiltroRega.value || 'TODOS';
      selectFiltroRega.innerHTML = '<option value="TODOS">REGA: Todos</option>';
      Array.from(regas).sort().forEach(r => {
        const opt = document.createElement('option');
        opt.value = r;
        opt.textContent = `REGA: ${r}`;
        selectFiltroRega.appendChild(opt);
      });
      if (Array.from(selectFiltroRega.options).some(o => o.value === valPrevio)) {
        selectFiltroRega.value = valPrevio;
      }
    }

    if (typeof this.poblarSelectoresInSitu === 'function') {
      this.poblarSelectoresInSitu();
    }

    // Select Filtro Variedad en Censo (FASE 2)
    const selectFiltroVariedad = document.getElementById('filtro-variedad');
    if (selectFiltroVariedad) {
      const variedades = new Set(['Moteada / Exchequer']);
      this.estado.animales.forEach(a => {
        if (a.variedad) variedades.add(a.variedad.trim());
      });
      const valPrevio = selectFiltroVariedad.value || 'TODAS';
      selectFiltroVariedad.innerHTML = '<option value="TODAS">Variedad: Todas</option>';
      Array.from(variedades).sort().forEach(v => {
        const opt = document.createElement('option');
        opt.value = v;
        opt.textContent = v;
        selectFiltroVariedad.appendChild(opt);
      });
      if (Array.from(selectFiltroVariedad.options).some(o => o.value === valPrevio)) {
        selectFiltroVariedad.value = valPrevio;
      }
    }

    // Actualizar sugerencias dinámicas de chips de etiquetas (FASE 2)
    this.actualizarSugerenciasEtiquetas();

    this.sugerirMachoGobe(document.getElementById('lote-familia-receptora')?.value || 'Familia B');
    this.poblarSelectoresAnaliticaPuesta();
    this.poblarSelectoresRfid();
    if (typeof this.poblarSimuladorAcoplamientos === 'function') {
      this.poblarSimuladorAcoplamientos();
    }
    if (typeof this.renderizarModuloIncubacion === 'function') {
      this.renderizarModuloIncubacion();
    }
    if (typeof this.renderizarModuloGermoplasma === 'function') {
      this.renderizarModuloGermoplasma();
    }
  },

  // Modales de Configuración y SyncQueue
  abrirModalConfig() {
    document.getElementById('cfg-supabase-url').value = this.supabaseUrl;
    document.getElementById('cfg-supabase-key').value = this.supabaseKey;
    document.getElementById('modal-config').classList.remove('hidden');
  },

  cerrarModalConfig() {
    document.getElementById('modal-config').classList.add('hidden');
  },

  guardarConfigSupabase() {
    const url = document.getElementById('cfg-supabase-url').value.trim();
    const key = document.getElementById('cfg-supabase-key').value.trim();
    localStorage.setItem('alacantina_supabase_url', url);
    localStorage.setItem('alacantina_supabase_key', key);
    this.supabaseUrl = url;
    this.supabaseKey = key;
    this.iniciarSupabaseClient();
    alert('Configuración guardada. Comprobando conexión...');
    this.testSupabaseConnection();
  },

  async testSupabaseConnection() {
    if (!this.supabaseUrl || !this.supabaseKey) {
      alert('Por favor, introduce la URL y Key de Supabase.');
      return;
    }
    this.iniciarSupabaseClient();
    if (!this.supabaseClient) {
      alert('Error: La librería de Supabase no está disponible.');
      return;
    }

    try {
      const { data, error } = await this.supabaseClient.from('animales').select('id').limit(1);
      if (error) throw error;
      alert('✓ ¡Conexión con Supabase establecida con éxito!');
      this.cerrarModalConfig();
      this.sincronizarCola(false);
    } catch (err) {
      alert(`No se pudo conectar a Supabase: ${err.message}. Comprueba las credenciales.`);
    }
  },

  async limpiarIndexedDB() {
    if (confirm('¿Estás seguro de que deseas limpiar la base de datos local IndexedDB? Se restablecerá con los datos semilla oficiales.')) {
      await this.cargarSemillaInicial(true);
      this.cerrarModalConfig();
    }
  },

  abrirModalSyncQueue() {
    const list = document.getElementById('sync-queue-list');
    const statusText = document.getElementById('sync-queue-status-text');
    list.innerHTML = '';

    const cola = this.estado.syncQueue || [];
    statusText.textContent = `${cola.length} elementos pendientes`;

    if (cola.length === 0) {
      list.innerHTML = '<p class="text-xs text-slate-500 p-4 text-center">No hay registros pendientes de sincronizar.</p>';
    } else {
      cola.forEach(item => {
        const d = document.createElement('div');
        d.className = 'p-2 text-xs flex justify-between items-center text-slate-300';
        d.innerHTML = `
          <div>
            <span class="font-bold text-sky-400 block">${item.tipo}</span>
            <span class="text-[10px] text-slate-400">${item.payload?.codigo_identificacion || item.payload?.id || 'Registro'}</span>
          </div>
          <span class="text-[10px] text-amber-400 bg-amber-950/60 border border-amber-800 px-1.5 py-0.5 rounded">Encolado</span>
        `;
        list.appendChild(d);
      });
    }

    document.getElementById('modal-sync-queue').classList.remove('hidden');
  },

  cerrarModalSyncQueue() {
    document.getElementById('modal-sync-queue').classList.add('hidden');
  },

  // =========================================================================
  // 10. CONFIGURACIÓN DEL AVIARIO / CRIADOR, BADGE Y ACTUALIZACIÓN MASIVA
  // =========================================================================

  // Comprobar e inicializar la explotación activa (app.estado.aviario / app.estado.aviarioActivo) vinculada estrictamente al usuario autenticado
  async inicializarAviarioActivo() {
    const u = this.estado.usuarioActivo || this.estado.usuarioActual;

    // Si no hay sesión activa o está en Modo Visitante, limpiar app.estado.aviario y app.estado.aviarioActivo
    if (!u || this.estado.modoVisitante) {
      this.estado.aviario = null;
      this.estado.aviarioActivo = null;
      return;
    }

    const todasExplotacionesDB = await this.db.getAll('explotaciones');
    const listaExplotaciones = Array.isArray(todasExplotacionesDB) && todasExplotacionesDB.length > 0
      ? todasExplotacionesDB
      : (this.estado.explotaciones || []);

    let expUsuario = null;

    // 1. Buscar estrictamente por usuario_id del usuario autenticado
    if (u.id) {
      expUsuario = listaExplotaciones.find(e => e.usuario_id && e.usuario_id === u.id) || null;
    }

    // 2. Si no se encontró por usuario_id, buscar por explotacion_id asignada al usuario activo
    if (!expUsuario && u.explotacion_id) {
      const candidata = listaExplotaciones.find(e => e.id === u.explotacion_id) || null;
      if (candidata && (!candidata.usuario_id || candidata.usuario_id === u.id)) {
        expUsuario = candidata;
      }
    }

    // 3. Si no se encontró, buscar por código REGA oficial válido del usuario y coincidencia de titular
    if (!expUsuario) {
      const regaUser = (u.rega || '').trim().toUpperCase();
      const tieneRegaOficial = this.esRegaOficialValido(regaUser);
      expUsuario = listaExplotaciones.find(e => {
        if (e.usuario_id && e.usuario_id !== u.id) return false;
        const regaExp = (e.codigo_rega || e.rega || '').trim().toUpperCase();
        if (tieneRegaOficial && regaExp === regaUser && (!e.nombre_titular || !u.nombre || e.nombre_titular.toLowerCase() === u.nombre.toLowerCase())) {
          return true;
        }
        return false;
      }) || null;
    }

    const regaReal = (u.rega && this.esRegaOficialValido(u.rega))
      ? u.rega.trim().toUpperCase()
      : (u.codigo_provisional || 'TEMP-REGA-001');
    const socioReal = u.numero_socio || (this.esRegaOficialValido(regaReal) ? ('SOC-' + regaReal.slice(-3)) : 'NS-000');
    const nombreReal = u.nombre || u.email || 'Usuario Autenticado';

    // 4. Si el usuario autenticado no tiene una explotación propia registrada aún, crear la suya con sus datos reales (sin coordenadas estáticas de prueba)
    if (!expUsuario) {
      expUsuario = {
        id: (u.explotacion_id && !listaExplotaciones.some(e => e.id === u.explotacion_id && e.usuario_id && e.usuario_id !== u.id))
          ? u.explotacion_id
          : ('exp-usr-' + u.id),
        usuario_id: u.id,
        codigo_rega: regaReal,
        rega: regaReal,
        numero_socio: socioReal,
        nombre_titular: nombreReal,
        nombre_criadero: `Aviario de ${nombreReal}`,
        municipio: u.municipio || 'Alicante',
        provincia: u.provincia || 'Alicante',
        telefono: u.telefono || '',
        latitud: (u.latitud !== undefined && u.latitud !== null) ? Number(u.latitud) : null,
        longitud: (u.longitud !== undefined && u.longitud !== null) ? Number(u.longitud) : null,
        geolocalizacion_precision: (u.latitud !== undefined && u.latitud !== null) ? 10 : null,
        activo: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      await this.db.put('explotaciones', expUsuario);
      if (!Array.isArray(this.estado.explotaciones)) this.estado.explotaciones = [];
      if (!this.estado.explotaciones.some(e => e.id === expUsuario.id)) {
        this.estado.explotaciones.push(expUsuario);
      }

      u.explotacion_id = expUsuario.id;
      await this.db.put('usuarios', u);
      localStorage.setItem('alacantina_v6_session', JSON.stringify(u));
    } else {
      // Sobreescribir estrictamente con el usuario_id, código REGA y coordenadas GPS reales del usuario logueado
      expUsuario.usuario_id = expUsuario.usuario_id || u.id;
      if (u.nombre) expUsuario.nombre_titular = u.nombre;
      if (u.telefono) expUsuario.telefono = u.telefono;
      if (this.esRegaOficialValido(u.rega)) {
        expUsuario.codigo_rega = u.rega.trim().toUpperCase();
        expUsuario.rega = u.rega.trim().toUpperCase();
      } else if (!this.esRegaOficialValido(expUsuario.codigo_rega)) {
        expUsuario.codigo_rega = u.codigo_provisional || 'TEMP-REGA-001';
        expUsuario.rega = expUsuario.codigo_rega;
      }
      if (u.numero_socio) {
        expUsuario.numero_socio = u.numero_socio;
      }
      if (u.latitud !== undefined && u.latitud !== null && (expUsuario.latitud === undefined || expUsuario.latitud === null)) {
        expUsuario.latitud = Number(u.latitud);
      }
      if (u.longitud !== undefined && u.longitud !== null && (expUsuario.longitud === undefined || expUsuario.longitud === null)) {
        expUsuario.longitud = Number(u.longitud);
      }
      await this.db.put('explotaciones', expUsuario);
    }

    // Sobreescribir estrictamente tanto app.estado.aviario como app.estado.aviarioActivo
    this.estado.aviario = expUsuario;
    this.estado.aviarioActivo = expUsuario;
    localStorage.setItem('alacantina_aviario_activo_id', expUsuario.id);
    localStorage.setItem('alacantina_aviario_activo_datos', JSON.stringify(expUsuario));
  },

  // Abrir Modal de Configuración / Bienvenida
  abrirModalAviario(esBienvenida = false) {
    const modal = document.getElementById('modal-config-aviario');
    if (!modal) return;

    const tituloEl = document.getElementById('modal-aviario-titulo');
    const subtituloEl = document.getElementById('modal-aviario-subtitulo');
    const boxSelector = document.getElementById('box-selector-aviarios-existentes');
    const selectExistentes = document.getElementById('select-aviarios-existentes');
    const alertaCambio = document.getElementById('aviario-rega-cambio-alerta');

    // Poblar selector de explotaciones existentes visibles para este usuario
    if (selectExistentes) {
      selectExistentes.innerHTML = '<option value="">-- O seleccionar explotación existente registrada --</option>';
      if (this.estado.explotaciones && this.estado.explotaciones.length > 0) {
        this.estado.explotaciones.forEach(e => {
          const opt = document.createElement('option');
          opt.value = e.id;
          const regaTxt = e.codigo_rega || e.rega || 'Sin REGA';
          opt.textContent = `${e.nombre_criadero || e.nombre_titular} (REGA: ${regaTxt}) - ${e.municipio}`;
          selectExistentes.appendChild(opt);
        });
        if (boxSelector) boxSelector.classList.remove('hidden');
      } else {
        if (boxSelector) boxSelector.classList.add('hidden');
      }
    }

    const aviarioActual = this.estado.aviario || this.estado.aviarioActivo;

    // Configurar textos de bienvenida o edición
    if (esBienvenida && !aviarioActual) {
      if (tituloEl) tituloEl.textContent = 'Configuración del Aviario / Criador';
      if (subtituloEl) subtituloEl.textContent = 'Bienvenido a AlacantinApp v6. Configura tu explotación zootécnica y código REGA oficial.';
    } else if (aviarioActual) {
      if (tituloEl) tituloEl.textContent = 'Configuración del Aviario / Criador';
      if (subtituloEl) subtituloEl.textContent = 'Actualiza los datos de tu explotación ganadera, código REGA oficial (ES + 12 dígitos) o geolocalización GPS.';
    }

    // Resetear temporal GPS
    this.estado.gpsAviarioTemporal = null;

    // Si hay un aviario activo, precargar sus datos en el formulario
    if (aviarioActual) {
      const av = aviarioActual;
      this.estado.editandoAviarioId = av.id;

      if (selectExistentes) selectExistentes.value = av.id;

      const titularInput = document.getElementById('aviario-titular');
      const nombreInput = document.getElementById('aviario-nombre');
      const socioInput = document.getElementById('aviario-socio');
      const socioAspCheck = document.getElementById('aviario-socio-aspirante');
      const regaInput = document.getElementById('aviario-rega');
      const regaTramiteCheck = document.getElementById('aviario-rega-tramite');
      const munInput = document.getElementById('aviario-municipio');
      const provInput = document.getElementById('aviario-provincia');
      const telInput = document.getElementById('aviario-telefono');
      const pill = document.getElementById('aviario-rega-status-pill');

      if (titularInput) titularInput.value = av.nombre_titular || this.estado.usuarioActual?.nombre || '';
      if (nombreInput) nombreInput.value = av.nombre_criadero || '';
      if (socioInput) socioInput.value = av.numero_socio || this.estado.usuarioActual?.numero_socio || '';
      if (socioAspCheck) socioAspCheck.checked = (!av.numero_socio || av.numero_socio === 'NS-000');
      if (telInput) telInput.value = av.telefono || this.estado.usuarioActual?.telefono || '';

      const regaActual = av.codigo_rega || av.rega || this.estado.usuarioActual?.rega || '';
      if (regaInput) regaInput.value = regaActual;

      const esTempRega = (!regaActual || regaActual.startsWith('TEMP-REGA') || regaActual === 'NS-000' || regaActual.toLowerCase().includes('sin rega'));
      if (regaTramiteCheck) regaTramiteCheck.checked = esTempRega;

      if (pill) {
        if (esTempRega) {
          pill.textContent = 'En trámite (Provisional)';
          pill.className = 'text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30';
        } else {
          pill.textContent = 'REGA Oficial';
          pill.className = 'text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
        }
      }

      if (munInput) munInput.value = av.municipio || '';
      if (provInput) provInput.value = av.provincia || 'Alicante';

      // Mostrar coordenadas existentes
      const latEl = document.getElementById('aviario-lat');
      const lngEl = document.getElementById('aviario-lng');
      const precEl = document.getElementById('aviario-prec');
      const badgeGps = document.getElementById('aviario-gps-badge');
      const btnGpsTexto = document.getElementById('btn-gps-aviario-texto');

      if (av.latitud !== null && av.latitud !== undefined && av.longitud !== null && av.longitud !== undefined) {
        if (latEl) latEl.textContent = Number(av.latitud).toFixed(6);
        if (lngEl) lngEl.textContent = Number(av.longitud).toFixed(6);
        if (precEl) precEl.textContent = av.geolocalizacion_precision || '--';
        if (badgeGps) {
          badgeGps.textContent = `Registrado (±${av.geolocalizacion_precision || 10}m)`;
          badgeGps.className = 'text-[10px] text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800';
        }
        if (btnGpsTexto) btnGpsTexto.textContent = '📍 Actualizar Coordenadas GPS';
      } else {
        if (latEl) latEl.textContent = '--';
        if (lngEl) lngEl.textContent = '--';
        if (precEl) precEl.textContent = '--';
        if (badgeGps) {
          badgeGps.textContent = 'Sin capturar';
          badgeGps.className = 'text-[10px] text-slate-500 bg-slate-950 px-2 py-0.5 rounded border border-slate-800';
        }
        if (btnGpsTexto) btnGpsTexto.textContent = '📍 Capturar Coordenadas GPS del Aviario';
      }

      // Si tiene REGA provisional, alertar que cambiarla actualizará los animales
      if (alertaCambio) {
        if (esTempRega) {
          alertaCambio.classList.remove('hidden');
        } else {
          alertaCambio.classList.add('hidden');
        }
      }
      this.alEscribirRega(regaActual);
    } else {
      // Formulario limpio para nuevo aviario, precargando datos del usuario actual si existe
      this.estado.editandoAviarioId = null;
      const form = document.getElementById('form-config-aviario');
      if (form) form.reset();

      const u = this.estado.usuarioActivo || this.estado.usuarioActual;
      const titularInput = document.getElementById('aviario-titular');
      const socioInput = document.getElementById('aviario-socio');
      const regaInput = document.getElementById('aviario-rega');
      const telInput = document.getElementById('aviario-telefono');
      const provInput = document.getElementById('aviario-provincia');

      if (titularInput && u?.nombre) titularInput.value = u.nombre;
      if (socioInput && u?.numero_socio) socioInput.value = u.numero_socio;
      if (regaInput && u?.rega) regaInput.value = u.rega;
      if (telInput && u?.telefono) telInput.value = u.telefono;
      if (provInput) provInput.value = 'Alicante';

      const latEl = document.getElementById('aviario-lat');
      const lngEl = document.getElementById('aviario-lng');
      const precEl = document.getElementById('aviario-prec');
      const badgeGps = document.getElementById('aviario-gps-badge');
      const btnGpsTexto = document.getElementById('btn-gps-aviario-texto');

      if (latEl) latEl.textContent = '--';
      if (lngEl) lngEl.textContent = '--';
      if (precEl) precEl.textContent = '--';
      if (badgeGps) {
        badgeGps.textContent = 'Sin capturar';
        badgeGps.className = 'text-[10px] text-slate-500 bg-slate-950 px-2 py-0.5 rounded border border-slate-800';
      }
      if (btnGpsTexto) btnGpsTexto.textContent = '📍 Capturar Coordenadas GPS del Aviario';
      if (alertaCambio) alertaCambio.classList.add('hidden');
    }

    modal.classList.remove('hidden');
  },

  // Cerrar Modal de Configuración
  cerrarModalAviario() {
    const modal = document.getElementById('modal-config-aviario');
    if (modal) modal.classList.add('hidden');
    this.estado.editandoAviarioId = null;
    this.estado.gpsAviarioTemporal = null;
  },

  // Saltar por ahora / Modo Visitante
  saltarModoVisitante() {
    this.entrarComoVisitante();
    this.cerrarModalAviario();
  },

  // Toggle casilla "Aspirante / No socio aún"
  toggleSocioAspirante(checked) {
    const inputSocio = document.getElementById('aviario-socio');
    if (inputSocio) {
      if (checked) {
        inputSocio.value = 'NS-000';
      } else {
        if (inputSocio.value === 'NS-000') {
          inputSocio.value = '';
        }
      }
    }
  },

  // Toggle casilla "En trámite / Sin REGA"
  toggleRegaTramite(checked) {
    const inputRega = document.getElementById('aviario-rega');
    const pill = document.getElementById('aviario-rega-status-pill');
    const alertaCambio = document.getElementById('aviario-rega-cambio-alerta');
    const msgVal = document.getElementById('aviario-rega-validacion-msg');

    if (checked) {
      if (inputRega) {
        if (!inputRega.value || !inputRega.value.startsWith('TEMP-REGA')) {
          inputRega.value = 'TEMP-REGA-001';
        }
      }
      if (pill) {
        pill.textContent = 'En trámite (Provisional)';
        pill.className = 'text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30';
      }
      if (msgVal) {
        msgVal.textContent = '🟡 REGA provisional en trámite (Rol Aspirante NS-000). Cuando introduzcas un REGA oficial (ES + 12 dígitos) serás promovido automáticamente a Criador Oficial.';
        msgVal.className = 'text-[11px] font-semibold mt-1 text-amber-300';
        msgVal.classList.remove('hidden');
      }
    } else {
      if (inputRega && inputRega.value.startsWith('TEMP-REGA')) {
        inputRega.value = '';
      }
      if (pill) {
        pill.textContent = 'REGA Oficial';
        pill.className = 'text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
      }
      if (alertaCambio) alertaCambio.classList.add('hidden');
      if (msgVal) msgVal.classList.add('hidden');
    }
  },

  // Observador en tiempo real al escribir código REGA (Validación ES + 12 dígitos y aviso de promoción)
  alEscribirRega(valor) {
    const v = (valor || '').trim().toUpperCase();
    const checkTramite = document.getElementById('aviario-rega-tramite');
    const pill = document.getElementById('aviario-rega-status-pill');
    const alertaCambio = document.getElementById('aviario-rega-cambio-alerta');
    const msgVal = document.getElementById('aviario-rega-validacion-msg');

    const esProvisional = (!v || v.startsWith('TEMP-REGA') || v === 'NS-000' || v.includes('SIN REGA'));
    const esRegaOficialValido = /^ES\d{12}$/i.test(v);

    if (checkTramite) checkTramite.checked = esProvisional;
    if (pill) {
      if (esProvisional) {
        pill.textContent = 'En trámite (Provisional)';
        pill.className = 'text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30';
      } else if (esRegaOficialValido) {
        pill.textContent = '✓ REGA Oficial Válido';
        pill.className = 'text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
      } else {
        pill.textContent = 'Formato incompleto (ES + 12 dígitos)';
        pill.className = 'text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30';
      }
    }

    if (msgVal) {
      if (esRegaOficialValido) {
        msgVal.textContent = '🟢 Código REGA oficial válido (ES + 12 dígitos). Al guardar, tu cuenta quedará acreditada como Criador Oficial con acceso total.';
        msgVal.className = 'text-[11px] font-bold mt-1 text-emerald-400';
        msgVal.classList.remove('hidden');
      } else if (esProvisional) {
        msgVal.textContent = '🟡 Identificador provisional (Aspirante). Introduce un REGA con formato ES + 12 dígitos (ej. ES030140001234) para promoción automática a Criador Oficial.';
        msgVal.className = 'text-[11px] font-semibold mt-1 text-amber-300';
        msgVal.classList.remove('hidden');
      } else {
        msgVal.textContent = '⚠️ El código REGA oficial debe tener exactamente el prefijo ES seguido de 12 dígitos numéricos (ej. ES030140001234), o marca "En trámite".';
        msgVal.className = 'text-[11px] font-semibold mt-1 text-rose-400';
        msgVal.classList.remove('hidden');
      }
    }

    if (this.estado.editandoAviarioId && alertaCambio) {
      const exp = this.estado.explotaciones.find(e => e.id === this.estado.editandoAviarioId);
      const regaVieja = exp ? (exp.codigo_rega || exp.rega) : '';
      if (regaVieja && regaVieja !== v) {
        alertaCambio.classList.remove('hidden');
      } else {
        alertaCambio.classList.add('hidden');
      }
    }
  },

  // Capturar Coordenadas GPS del Aviario en el Modal
  capturarGPSAviario() {
    const btnTexto = document.getElementById('btn-gps-aviario-texto');
    const badge = document.getElementById('aviario-gps-badge');
    const latEl = document.getElementById('aviario-lat');
    const lngEl = document.getElementById('aviario-lng');
    const precEl = document.getElementById('aviario-prec');

    if (!('geolocation' in navigator)) {
      alert('La geolocalización no está soportada en este dispositivo.');
      return;
    }

    if (btnTexto) btnTexto.textContent = '📍 Obteniendo GPS...';
    if (badge) {
      badge.textContent = 'Buscando satélites...';
      badge.className = 'text-[10px] text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800 animate-pulse';
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const prec = pos.coords.accuracy;

        this.estado.gpsAviarioTemporal = {
          latitud: lat,
          longitud: lng,
          precision_m: Math.round(prec * 10) / 10
        };

        if (latEl) latEl.textContent = lat.toFixed(6);
        if (lngEl) lngEl.textContent = lng.toFixed(6);
        if (precEl) precEl.textContent = Math.round(prec);

        if (badge) {
          badge.textContent = `GPS Capturado (±${Math.round(prec)}m)`;
          badge.className = 'text-[10px] text-emerald-300 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800';
        }
        if (btnTexto) btnTexto.textContent = '📍 Coordenadas GPS Capturadas';
      },
      (err) => {
        console.warn('[GPS Aviario] Error:', err);
        if (btnTexto) btnTexto.textContent = '📍 Capturar Coordenadas GPS';
        if (badge) {
          badge.textContent = 'Error al capturar GPS';
          badge.className = 'text-[10px] text-rose-400 bg-rose-950/60 px-2 py-0.5 rounded border border-rose-800';
        }
        alert('No se pudo obtener la ubicación GPS del aviario: ' + err.message);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  },

  // Cargar datos en el formulario desde una explotación existente
  cargarAviarioDesdeExistente(explotacionId) {
    if (!explotacionId) {
      this.estado.editandoAviarioId = null;
      const form = document.getElementById('form-config-aviario');
      if (form) form.reset();
      const prov = document.getElementById('aviario-provincia');
      if (prov) prov.value = 'Alicante';
      document.getElementById('aviario-lat').textContent = '--';
      document.getElementById('aviario-lng').textContent = '--';
      document.getElementById('aviario-prec').textContent = '--';
      return;
    }

    const av = this.estado.explotaciones.find(e => e.id === explotacionId);
    if (!av) return;

    this.estado.editandoAviarioId = av.id;

    const titularInput = document.getElementById('aviario-titular');
    const nombreInput = document.getElementById('aviario-nombre');
    const socioInput = document.getElementById('aviario-socio');
    const socioAspCheck = document.getElementById('aviario-socio-aspirante');
    const regaInput = document.getElementById('aviario-rega');
    const regaTramiteCheck = document.getElementById('aviario-rega-tramite');
    const munInput = document.getElementById('aviario-municipio');
    const provInput = document.getElementById('aviario-provincia');
    const telInput = document.getElementById('aviario-telefono');
    const pill = document.getElementById('aviario-rega-status-pill');
    const alertaCambio = document.getElementById('aviario-rega-cambio-alerta');

    if (titularInput) titularInput.value = av.nombre_titular || '';
    if (nombreInput) nombreInput.value = av.nombre_criadero || '';
    if (socioInput) socioInput.value = av.numero_socio || '';
    if (socioAspCheck) socioAspCheck.checked = (!av.numero_socio || av.numero_socio === 'NS-000');
    if (telInput) telInput.value = av.telefono || this.estado.usuarioActual?.telefono || '';

    const regaActual = av.codigo_rega || av.rega || '';
    if (regaInput) regaInput.value = regaActual;

    const esTempRega = (!regaActual || regaActual.startsWith('TEMP-REGA') || regaActual.toLowerCase().includes('sin rega'));
    if (regaTramiteCheck) regaTramiteCheck.checked = esTempRega;

    if (pill) {
      if (esTempRega) {
        pill.textContent = 'En trámite (Provisional)';
        pill.className = 'text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30';
      } else {
        pill.textContent = 'REGA Oficial';
        pill.className = 'text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
      }
    }

    if (munInput) munInput.value = av.municipio || '';
    if (provInput) provInput.value = av.provincia || 'Alicante';

    const latEl = document.getElementById('aviario-lat');
    const lngEl = document.getElementById('aviario-lng');
    const precEl = document.getElementById('aviario-prec');
    const badgeGps = document.getElementById('aviario-gps-badge');

    if (av.latitud !== null && av.latitud !== undefined && av.longitud !== null && av.longitud !== undefined) {
      if (latEl) latEl.textContent = Number(av.latitud).toFixed(6);
      if (lngEl) lngEl.textContent = Number(av.longitud).toFixed(6);
      if (precEl) precEl.textContent = av.geolocalizacion_precision || '--';
      if (badgeGps) {
        badgeGps.textContent = `Registrado (±${av.geolocalizacion_precision || 10}m)`;
        badgeGps.className = 'text-[10px] text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800';
      }
    } else {
      if (latEl) latEl.textContent = '--';
      if (lngEl) lngEl.textContent = '--';
      if (precEl) precEl.textContent = '--';
      if (badgeGps) {
        badgeGps.textContent = 'Sin capturar';
        badgeGps.className = 'text-[10px] text-slate-500 bg-slate-950 px-2 py-0.5 rounded border border-slate-800';
      }
    }

    if (alertaCambio) {
      if (esTempRega) {
        alertaCambio.classList.remove('hidden');
      } else {
        alertaCambio.classList.add('hidden');
      }
    }
    this.alEscribirRega(regaActual);
  },

  // Seleccionar aviario activo desde el selector desplegable en Tab 1
  seleccionarAviarioDesdeSelect(explotacionId) {
    if (!explotacionId) return;
    const exp = this.estado.explotaciones.find(e => e.id === explotacionId);
    if (exp) {
      this.estado.aviario = exp;
      this.estado.aviarioActivo = exp;
      localStorage.setItem('alacantina_aviario_activo_id', exp.id);
      localStorage.setItem('alacantina_aviario_activo_datos', JSON.stringify(exp));
      sessionStorage.removeItem('alacantina_modo_visitante');
      this.actualizarBadgeAviario();
      this.actualizarVistaRegistroAviario();
    }
  },

  // Guardar configuración del aviario y ejecutar actualización masiva + promoción automática por REGA
  async guardarConfigAviario(event) {
    event.preventDefault();

    const titular = document.getElementById('aviario-titular').value.trim();
    const nombreCriadero = document.getElementById('aviario-nombre').value.trim();
    let socio = document.getElementById('aviario-socio').value.trim();
    const socioAspirante = document.getElementById('aviario-socio-aspirante').checked;
    let rega = document.getElementById('aviario-rega').value.trim().toUpperCase();
    const regaTramite = document.getElementById('aviario-rega-tramite').checked;
    const municipio = document.getElementById('aviario-municipio').value.trim();
    const provincia = document.getElementById('aviario-provincia').value.trim() || 'Alicante';
    const telefono = (document.getElementById('aviario-telefono')?.value || '').trim();

    if (!titular) {
      alert('Por favor, introduce el Nombre del Criador o Razón Social.');
      return;
    }
    if (!municipio) {
      alert('Por favor, introduce el Municipio de la explotación.');
      return;
    }

    // Validar formato estándar REGA (ES + 12 dígitos) si no está en trámite
    const esProvisionalInput = regaTramite || !rega || rega.startsWith('TEMP-REGA') || rega === 'NS-000';
    if (!esProvisionalInput && !/^ES\d{12}$/i.test(rega)) {
      alert('⚠️ El código REGA oficial debe cumplir el formato estándar español: "ES" seguido de 12 dígitos numéricos (ejemplo: ES030140001234).\n\nSi todavía tienes el REGA en trámite, marca la casilla "En trámite / Sin REGA".');
      return;
    }

    // Regla de Socio Aspirante
    if (socioAspirante || !socio) {
      socio = /^ES\d{12}$/i.test(rega) ? ('SOC-' + rega.slice(-3)) : 'NS-000';
    } else if (socio === 'NS-000' && /^ES\d{12}$/i.test(rega)) {
      socio = 'SOC-' + rega.slice(-3);
    }

    // Regla de REGA en trámite / Sin REGA
    if (regaTramite || !rega) {
      const avPrev = this.estado.editandoAviarioId 
        ? this.estado.explotaciones.find(e => e.id === this.estado.editandoAviarioId)
        : null;
      if (avPrev && (avPrev.codigo_rega || avPrev.rega) && (avPrev.codigo_rega || avPrev.rega).startsWith('TEMP-REGA')) {
        rega = avPrev.codigo_rega || avPrev.rega;
      } else {
        rega = 'TEMP-REGA-001';
      }
    }

    // Coordenadas GPS
    let lat = null;
    let lng = null;
    let prec = null;

    if (this.estado.gpsAviarioTemporal) {
      lat = this.estado.gpsAviarioTemporal.latitud;
      lng = this.estado.gpsAviarioTemporal.longitud;
      prec = this.estado.gpsAviarioTemporal.precision_m;
    } else if (this.estado.editandoAviarioId) {
      const expPrev = this.estado.explotaciones.find(e => e.id === this.estado.editandoAviarioId);
      if (expPrev) {
        lat = expPrev.latitud;
        lng = expPrev.longitud;
        prec = expPrev.geolocalizacion_precision;
      }
    }

    const uActivo = this.estado.usuarioActivo || this.estado.usuarioActual;
    const editandoId = this.estado.editandoAviarioId;
    let expFinal = null;
    let animalesActualizadosCount = 0;

    if (editandoId) {
      // -------------------------------------------------------------
      // MODO EDICIÓN: Actualizar explotación existente
      // -------------------------------------------------------------
      const expExistente = this.estado.explotaciones.find(e => e.id === editandoId);
      if (!expExistente) {
        alert('Error: Explotación no encontrada.');
        return;
      }

      const regaAnterior = expExistente.codigo_rega || expExistente.rega;
      const huboCambioRega = (regaAnterior !== rega);

      expExistente.usuario_id = expExistente.usuario_id || uActivo?.id || null;
      expExistente.nombre_titular = titular;
      expExistente.nombre_criadero = nombreCriadero || titular;
      expExistente.numero_socio = socio;
      expExistente.codigo_rega = rega;
      expExistente.rega = rega;
      expExistente.municipio = municipio;
      expExistente.provincia = provincia;
      if (telefono) expExistente.telefono = telefono;
      if (lat !== null) expExistente.latitud = lat;
      if (lng !== null) expExistente.longitud = lng;
      if (prec !== null) expExistente.geolocalizacion_precision = prec;
      expExistente.updated_at = new Date().toISOString();

      expFinal = expExistente;

      // 1. Guardar explotación actualizada en IndexedDB
      await this.db.put('explotaciones', expExistente);

      // 2. Si hubo cambio de REGA: Ejecutar actualización masiva de los animales de esta explotación/usuario
      if (huboCambioRega) {
        console.log(`[Aviario] Cambio de REGA detectado de ${regaAnterior} a ${rega}. Actualizando ejemplares asociados...`);
        
        // Actualizar en IndexedDB únicamente los animales pertenecientes a esta explotación o usuario
        const todosAnimales = await this.db.getAll('animales');
        for (const a of todosAnimales) {
          const esDelUsuarioOExplotacion = (a.explotacion_id === expExistente.id) || (uActivo?.id && a.usuario_id === uActivo.id);
          if (esDelUsuarioOExplotacion) {
            a.codigo_rega = rega;
            a.titular_nombre = titular;
            await this.db.put('animales', a);
            animalesActualizadosCount++;
          }
        }

        // Actualizar en estado reactivo en memoria
        this.estado.animales.forEach(a => {
          if (a.explotacion_id === expExistente.id || (uActivo?.id && a.usuario_id === uActivo.id)) {
            a.codigo_rega = rega;
            a.titular_nombre = titular;
          }
        });

        // Actualizar en Supabase si online o encolar en syncQueue
        if (navigator.onLine && this.supabaseClient) {
          try {
            const { error: rpcErr } = await this.supabaseClient.rpc('actualizar_rega_masiva', {
              p_explotacion_id: expExistente.id,
              p_nueva_rega: rega
            });
            if (rpcErr) {
              console.warn('[Supabase] Falló RPC actualizar_rega_masiva, realizando update directo:', rpcErr);
              await this.supabaseClient.from('explotaciones').update({
                codigo_rega: rega,
                rega: rega,
                nombre_titular: titular,
                nombre_criadero: nombreCriadero || titular,
                numero_socio: socio,
                municipio: municipio,
                provincia: provincia,
                latitud: expExistente.latitud,
                longitud: expExistente.longitud,
                updated_at: new Date().toISOString()
              }).eq('id', expExistente.id);

              await this.supabaseClient.from('animales').update({
                codigo_rega: rega,
                updated_at: new Date().toISOString()
              }).eq('explotacion_id', expExistente.id);
            }
          } catch (err) {
            console.warn('[Supabase] Error al actualizar online, encolando en SyncQueue:', err);
            await this.db.put('syncQueue', {
              id: 'sync-' + Date.now(),
              tipo: 'ACTUALIZAR_REGA_MASIVA',
              payload: {
                explotacionId: expExistente.id,
                nuevaRega: rega,
                nuevosDatos: {
                  codigo_rega: rega,
                  rega: rega,
                  nombre_titular: titular,
                  nombre_criadero: nombreCriadero || titular,
                  numero_socio: socio,
                  municipio: municipio,
                  provincia: provincia,
                  latitud: expExistente.latitud,
                  longitud: expExistente.longitud
                }
              },
              creado_en: Date.now()
            });
          }
        } else {
          // Offline
          await this.db.put('syncQueue', {
            id: 'sync-' + Date.now(),
            tipo: 'ACTUALIZAR_REGA_MASIVA',
            payload: {
              explotacionId: expExistente.id,
              nuevaRega: rega,
              nuevosDatos: {
                codigo_rega: rega,
                rega: rega,
                nombre_titular: titular,
                nombre_criadero: nombreCriadero || titular,
                numero_socio: socio,
                municipio: municipio,
                provincia: provincia,
                latitud: expExistente.latitud,
                longitud: expExistente.longitud
              }
            },
            creado_en: Date.now()
          });
        }
      } else {
        // Actualizar datos del criadero sin cambio de REGA
        if (navigator.onLine && this.supabaseClient) {
          try {
            await this.supabaseClient.from('explotaciones').update({
              codigo_rega: rega,
              rega: rega,
              nombre_titular: titular,
              nombre_criadero: nombreCriadero || titular,
              numero_socio: socio,
              municipio: municipio,
              provincia: provincia,
              latitud: expExistente.latitud,
              longitud: expExistente.longitud,
              updated_at: new Date().toISOString()
            }).eq('id', expExistente.id);
          } catch (err) {
            await this.db.put('syncQueue', {
              id: 'sync-' + Date.now(),
              tipo: 'ALTA_EXPLOTACION',
              payload: expExistente,
              creado_en: Date.now()
            });
          }
        } else {
          await this.db.put('syncQueue', {
            id: 'sync-' + Date.now(),
            tipo: 'ALTA_EXPLOTACION',
            payload: expExistente,
            creado_en: Date.now()
          });
        }
      }

    } else {
      // -------------------------------------------------------------
      // MODO CREACIÓN: Nueva explotación
      // -------------------------------------------------------------
      const nuevoId = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : 'exp-' + Date.now();

      const nuevaExp = {
        id: nuevoId,
        usuario_id: uActivo?.id || null,
        codigo_rega: rega,
        rega: rega,
        numero_socio: socio,
        nombre_titular: titular,
        nombre_criadero: nombreCriadero || titular,
        municipio: municipio,
        provincia: provincia,
        telefono: telefono || '',
        latitud: lat,
        longitud: lng,
        geolocalizacion_precision: prec,
        activo: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      expFinal = nuevaExp;

      // 1. Guardar en IndexedDB
      await this.db.put('explotaciones', nuevaExp);
      this.estado.explotaciones.push(nuevaExp);

      // 2. Subir a Supabase o encolar
      if (navigator.onLine && this.supabaseClient) {
        try {
          await this.supabaseClient.from('explotaciones').insert([nuevaExp]);
        } catch (err) {
          console.warn('[Supabase] Error al crear explotación online, encolando:', err);
          await this.db.put('syncQueue', {
            id: 'sync-' + Date.now(),
            tipo: 'ALTA_EXPLOTACION',
            payload: nuevaExp,
            creado_en: Date.now()
          });
        }
      } else {
        await this.db.put('syncQueue', {
          id: 'sync-' + Date.now(),
          tipo: 'ALTA_EXPLOTACION',
          payload: nuevaExp,
          creado_en: Date.now()
        });
      }
    }

    // Establecer como aviario activo (app.estado.aviario y app.estado.aviarioActivo) y persistir
    this.estado.aviario = expFinal;
    this.estado.aviarioActivo = expFinal;
    localStorage.setItem('alacantina_aviario_activo_id', expFinal.id);
    localStorage.setItem('alacantina_aviario_activo_datos', JSON.stringify(expFinal));
    sessionStorage.removeItem('alacantina_modo_visitante');

    if (uActivo) {
      uActivo.explotacion_id = expFinal.id;
      if (lat !== null) uActivo.latitud = lat;
      if (lng !== null) uActivo.longitud = lng;
    }

    this.estado.gpsAviarioTemporal = null;
    this.estado.editandoAviarioId = null;

    // Verificar y ejecutar Promoción Automática de Rol si se introdujo un REGA Oficial Válido (ES + 12 dígitos)
    const fuePromovidoACriador = await this.verificarYPromoverRolPorRega(rega, telefono, titular, socio);

    // Actualizar cola y UI completa
    this.estado.syncQueue = await this.db.getAll('syncQueue');
    this.actualizarContadorSyncQueue();
    this.poblarSelectores();
    this.actualizarBadgeAviario();
    this.actualizarVistaRegistroAviario();
    this.actualizarPastillaUsuario();
    this.aplicarPermisosRBAC();
    this.renderizarTablaUsuariosAdmin();
    this.renderizarCenso();

    // Cerrar el modal
    this.cerrarModalAviario();

    if (fuePromovidoACriador) {
      alert(`🎉 ¡PROMOCIÓN AUTOMÁTICA A CRIADOR OFICIAL!\n\nSe ha validado tu código REGA oficial (${rega}).\nTu cuenta ha sido actualizada automáticamente de "Aspirante" a "Criador Oficial" en Supabase y se han liberado todas las funciones del Libro Genealógico ESGA025.`);
    } else if (animalesActualizadosCount > 0) {
      alert(`¡Aviario guardado con éxito!\nCódigo REGA: ${rega}\nSe han actualizado automáticamente ${animalesActualizadosCount} ejemplar(es) asociados a esta explotación.`);
    } else {
      alert(`¡Aviario "${expFinal.nombre_criadero || expFinal.nombre_titular}" guardado y configurado como activo!\nLos nuevos registros se vincularán automáticamente.`);
    }
  },

  // Indicador visual en cabecera (Badge de Aviario Activo)
  actualizarBadgeAviario() {
    const u = this.estado.usuarioActivo || this.estado.usuarioActual;
    const aviario = (!u || this.estado.modoVisitante) ? null : (this.estado.aviario || this.estado.aviarioActivo);
    const nombreEl = document.getElementById('badge-aviario-nombre');
    const subtextoEl = document.getElementById('badge-aviario-subtexto');
    const estadoEl = document.getElementById('badge-aviario-estado');

    if (aviario && u) {
      const nombreMostrar = aviario.nombre_criadero || aviario.nombre_titular || u.nombre || 'Aviario Activo';
      const regaRaw = (u.rega && /^ES\d{12}$/i.test(u.rega.trim()))
        ? u.rega.trim().toUpperCase()
        : (aviario.codigo_rega || aviario.rega || 'TEMP-REGA-001');
      const esProvisional = !/^ES\d{12}$/i.test(regaRaw);
      const regaMostrar = esProvisional ? 'TEMP-REGA-001' : regaRaw;

      if (nombreEl) nombreEl.textContent = nombreMostrar;
      if (subtextoEl) {
        if (esProvisional) {
          subtextoEl.textContent = `REGA: ${regaMostrar} (En trámite)`;
          subtextoEl.className = 'text-[10px] text-amber-400 font-mono truncate';
        } else {
          subtextoEl.textContent = `REGA: ${regaMostrar}`;
          subtextoEl.className = 'text-[10px] text-emerald-300 font-mono truncate';
        }
      }
      if (estadoEl) {
        if (esProvisional) {
          estadoEl.textContent = 'En trámite';
          estadoEl.className = 'text-[9px] px-1 py-0.2 rounded font-semibold bg-amber-950 text-amber-400 border border-amber-800 hidden lg:inline';
        } else {
          estadoEl.textContent = 'Oficial';
          estadoEl.className = 'text-[9px] px-1 py-0.2 rounded font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800 hidden lg:inline';
        }
      }
    } else {
      // Modo visitante o sin sesión activa
      if (nombreEl) nombreEl.textContent = 'Sin Sesión';
      if (subtextoEl) {
        subtextoEl.textContent = 'Sin REGA · Modo Lectura';
        subtextoEl.className = 'text-[10px] text-slate-400 font-mono truncate';
      }
      if (estadoEl) {
        estadoEl.textContent = 'Visitante';
        estadoEl.className = 'text-[9px] px-1 py-0.2 rounded font-semibold bg-slate-800 text-slate-400 border border-slate-700 hidden lg:inline';
      }
    }
  },

  // Actualizar tarjeta compacta e indicadores en la pestaña de Registro (Tab 1) y Censo (Tab 2)
  actualizarVistaRegistroAviario() {
    const u = this.estado.usuarioActivo || this.estado.usuarioActual;
    const aviario = (!u || this.estado.modoVisitante) ? null : (this.estado.aviario || this.estado.aviarioActivo);
    const boxInfo = document.getElementById('registro-aviario-info-box');
    const boxAviso = document.getElementById('registro-aviso-sin-aviario');

    // Elementos de la ficha del aviario en Tab 2 (Censo) - IDs actuales en index.html
    const censoTitulo = document.getElementById('censo-aviario-titulo');
    const censoRegaPill = document.getElementById('censo-aviario-rega-pill');
    const censoListosPill = document.getElementById('censo-aviario-listos-pill');
    const censoSub = document.getElementById('censo-aviario-sub');

    // Elementos alternativos legacy
    const censoNombre = document.getElementById('censo-card-aviario-nombre');
    const censoRega = document.getElementById('censo-card-aviario-rega');
    const censoTitular = document.getElementById('censo-card-aviario-titular');
    const censoGps = document.getElementById('censo-card-aviario-gps');
    const censoTel = document.getElementById('censo-card-aviario-tel');

    if (aviario && u) {
      if (boxInfo) boxInfo.classList.remove('hidden');
      if (boxAviso) boxAviso.classList.add('hidden');

      const titular = u.nombre || aviario.nombre_titular || u.email || 'Usuario Autenticado';
      const nombre = aviario.nombre_criadero || `Aviario de ${titular}`;
      const regaRaw = (u.rega && /^ES\d{12}$/i.test(u.rega.trim()))
        ? u.rega.trim().toUpperCase()
        : (aviario.codigo_rega || aviario.rega || 'TEMP-REGA-001');
      const esProvisional = !/^ES\d{12}$/i.test(regaRaw);
      const rega = esProvisional ? 'TEMP-REGA-001' : regaRaw;
      const socio = u.numero_socio || aviario.numero_socio || (esProvisional ? 'NS-000' : ('SOC-' + rega.slice(-3)));
      const munProv = `${aviario.municipio || 'Alicante'}, ${aviario.provincia || 'Alicante'}`;
      const telefono = u.telefono || aviario.telefono || 'Sin teléfono';
      
      const elNombre = document.getElementById('reg-box-aviario-nombre');
      const elRega = document.getElementById('reg-box-aviario-rega');
      const elSocio = document.getElementById('reg-box-aviario-socio');
      const elTitular = document.getElementById('reg-box-aviario-titular');
      const elMun = document.getElementById('reg-box-aviario-municipio');
      const elGps = document.getElementById('reg-box-aviario-gps');

      if (elNombre) elNombre.textContent = nombre;
      if (elRega) {
        elRega.textContent = `REGA: ${rega}`;
        elRega.className = esProvisional
          ? 'px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono'
          : 'px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono';
      }
      if (elSocio) elSocio.textContent = `Socio: ${socio}`;
      if (elTitular) elTitular.innerHTML = `<i class="fa-solid fa-user text-slate-500 mr-1"></i>${this.escaparHtml(titular)}`;
      if (elMun) elMun.innerHTML = `<i class="fa-solid fa-map-pin text-slate-500 mr-1"></i>${this.escaparHtml(munProv)}`;
      if (elGps) {
        if (aviario.latitud !== null && aviario.latitud !== undefined && aviario.longitud !== null && aviario.longitud !== undefined) {
          const lat = Number(aviario.latitud).toFixed(4);
          const lng = Number(aviario.longitud).toFixed(4);
          elGps.innerHTML = `<i class="fa-solid fa-satellite-dish mr-1"></i>GPS Aviario Heredado (${lat}, ${lng})`;
          elGps.className = 'text-emerald-400 font-mono';
        } else {
          elGps.innerHTML = `<i class="fa-solid fa-location-crosshairs mr-1"></i>Sin GPS asignado`;
          elGps.className = 'text-slate-500 font-mono';
        }
      }

      // Calcular ejemplares listos para valorar (RN/RA) en este aviario
      const listosCount = (this.estado.animales || []).filter(a =>
        this.perteneceAUsuarioActivo(a, u, aviario) &&
        (a.seccion_libro === 'RN' || a.seccion_libro === 'RA')
      ).length;

      // Actualizar Ficha del Aviario en Tab 2 (Censo) - IDs de index.html
      if (censoTitulo) censoTitulo.textContent = nombre;
      if (censoRegaPill) {
        censoRegaPill.textContent = `REGA: ${rega}`;
        censoRegaPill.className = esProvisional
          ? 'px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40'
          : 'px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40';
      }
      if (censoListosPill) {
        censoListosPill.textContent = `Listos para valorar (RN/RA): ${listosCount} ${listosCount === 1 ? 'ave' : 'aves'}`;
      }
      if (censoSub) {
        const gpsStr = (aviario.latitud !== null && aviario.latitud !== undefined && aviario.longitud !== null && aviario.longitud !== undefined) ? 'GPS Verificado' : 'GPS Pendiente';
        censoSub.textContent = `Titular: ${titular} · ${munProv} · Tel: ${telefono} · ${gpsStr}`;
      }

      // Actualizar también IDs alternativos si existen
      if (censoNombre) censoNombre.textContent = nombre;
      if (censoRega) {
        censoRega.textContent = `REGA: ${rega}`;
        censoRega.className = esProvisional
          ? 'px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30'
          : 'px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
      }
      if (censoTitular) censoTitular.innerHTML = `<i class="fa-solid fa-user text-slate-500 mr-1"></i>${this.escaparHtml(titular)}`;
      if (censoGps) {
        if (aviario.latitud !== null && aviario.latitud !== undefined && aviario.longitud !== null && aviario.longitud !== undefined) {
          censoGps.innerHTML = `<i class="fa-solid fa-location-dot text-emerald-400 mr-1"></i>GPS: ${Number(aviario.latitud).toFixed(4)}, ${Number(aviario.longitud).toFixed(4)}`;
        } else {
          censoGps.innerHTML = `<i class="fa-solid fa-location-dot text-slate-500 mr-1"></i>GPS: ${this.escaparHtml(munProv)}`;
        }
      }
      if (censoTel) censoTel.innerHTML = `<i class="fa-solid fa-phone text-amber-400 mr-1"></i>Tel: ${this.escaparHtml(telefono)}`;

      // Sincronizar selección en el dropdown de alta-explotacion si existe
      const selectExp = document.getElementById('alta-explotacion');
      if (selectExp && selectExp.value !== aviario.id) {
        selectExp.value = aviario.id;
      }
    } else {
      // Modo visitante o sin sesión activa
      if (boxInfo) boxInfo.classList.add('hidden');
      if (boxAviso) boxAviso.classList.remove('hidden');

      if (censoTitulo) censoTitulo.textContent = 'Modo Visitante (Consulta Pública)';
      if (censoRegaPill) {
        censoRegaPill.textContent = 'Sin REGA · Modo Lectura';
        censoRegaPill.className = 'px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-slate-800 text-slate-300 border border-slate-700';
      }
      if (censoListosPill) censoListosPill.textContent = 'Solo Lectura';
      if (censoSub) censoSub.textContent = '👤 Visitante (Modo Lectura) · Inicia sesión para gestionar tu aviario';

      if (censoNombre) censoNombre.textContent = 'Modo Visitante (Consulta Pública)';
      if (censoRega) {
        censoRega.textContent = 'Sin REGA';
        censoRega.className = 'px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-800 text-slate-300 border border-slate-700';
      }
      if (censoTitular) censoTitular.innerHTML = `<i class="fa-solid fa-user text-slate-500 mr-1"></i>Visitante`;
      if (censoGps) censoGps.innerHTML = `<i class="fa-solid fa-location-dot text-slate-500 mr-1"></i>GPS: Modo Lectura`;
      if (censoTel) censoTel.innerHTML = `<i class="fa-solid fa-phone text-amber-400 mr-1"></i>Tel: --`;
    }
  },

  // =========================================================================
  // 11. FASE 6: MODO INSPECCIÓN ZOOTÉCNICA IN SITU, FIRMA DIGITAL Y GUÍA CAMPO
  // Cumplimiento: Estándar ESGA025 · Protocolo CNZ 2025 · Reg. (UE) 2016/1012
  // =========================================================================

  // Extraer dinámicamente Nombre, ID/DNI y Firma Digital del perfil del usuario autenticado con rol Inspector Zootécnico / Administrador
  obtenerDatosInspectorActivo(actaPrevia = null) {
    const u = this.estado.usuarioActivo || this.estado.usuarioActual;
    const rol = this.obtenerRolUsuarioActual();
    const esInspectorAutenticado = u && (rol === 'inspector' || rol === 'administrador');

    const inputNombreVal = (document.getElementById('insitu-inspector-nombre')?.value || '').trim();
    const inputIdVal = (document.getElementById('insitu-inspector-id')?.value || '').trim();
    const inputTab3Val = (document.getElementById('inspeccion-calificador')?.value || '').trim();

    const nombreDinamico = (esInspectorAutenticado && u.nombre)
      ? u.nombre
      : (actaPrevia?.calificador_oficial || inputNombreVal || inputTab3Val || u?.nombre || '');

    const idDinamico = (esInspectorAutenticado && (u.dni || u.numero_socio || u.id))
      ? (u.dni || u.numero_socio || u.id)
      : (actaPrevia?.inspector_id || inputIdVal || u?.dni || u?.numero_socio || u?.id || '');

    const firmaDinamica = this.estado.inspeccionInSitu?.firmaBase64
      || (esInspectorAutenticado ? u.firma_base64 : null)
      || actaPrevia?.firma_inspector_base64
      || actaPrevia?.firma_storage_url
      || u?.firma_base64
      || null;

    return {
      nombre: nombreDinamico,
      id: idDinamico,
      dni: u?.dni || idDinamico,
      rol: rol,
      firma_base64: firmaDinamica
    };
  },

  // Sincronizar campos de Calificador/Inspector en DOM (Fase 1 Tab 3 y Fase 6 Tab 6) con el perfil autenticado
  sincronizarInputsInspectorAutenticado() {
    const u = this.estado.usuarioActivo || this.estado.usuarioActual;
    const rol = this.obtenerRolUsuarioActual();
    const inpInspId = document.getElementById('insitu-inspector-id');
    const inpInspNombre = document.getElementById('insitu-inspector-nombre');
    const inpCalifTab3 = document.getElementById('inspeccion-calificador');

    if (u && (rol === 'inspector' || rol === 'administrador' || rol === 'criador' || rol === 'aspirante')) {
      const idInspector = u.dni || u.numero_socio || u.id || '';
      const nombreInspector = u.nombre || u.email || '';
      if (inpInspId) inpInspId.value = idInspector;
      if (inpInspNombre) inpInspNombre.value = nombreInspector;
      if (inpCalifTab3) inpCalifTab3.value = nombreInspector;
      if (u.firma_base64 && this.estado.inspeccionInSitu) {
        this.estado.inspeccionInSitu.firmaBase64 = u.firma_base64;
        this.estado.inspeccionInSitu.firmaConfirmada = true;
      }
    } else {
      if (inpInspId) inpInspId.value = '';
      if (inpInspNombre) inpInspNombre.value = '';
      if (inpCalifTab3) inpCalifTab3.value = '';
    }
  },

  inicializarModuloInspeccionInSitu() {
    // 1. Inicializar fecha/hora actual en el campo de inspección in situ
    const inputFechaHora = document.getElementById('insitu-fecha-hora');
    if (inputFechaHora && !inputFechaHora.value) {
      const now = new Date();
      const offset = now.getTimezoneOffset() * 60000;
      inputFechaHora.value = new Date(now - offset).toISOString().slice(0, 16);
    }

    // 2. Sincronizar rol RBAC y datos reales del Inspector autenticado
    const rolGuardado = this.obtenerRolUsuarioActual();
    this.estado.inspeccionInSitu.rolRBAC = rolGuardado;
    this.actualizarBadgeRBACInSitu(rolGuardado);
    this.sincronizarInputsInspectorAutenticado();

    // 3. Heredar coordenadas GPS iniciales del aviario activo del usuario si existen
    const av = this.estado.aviario || this.estado.aviarioActivo;
    if (av && av.latitud !== null && av.latitud !== undefined && av.longitud !== null && av.longitud !== undefined) {
      this.estado.inspeccionInSitu.gpsInSitu = {
        latitud: Number(av.latitud),
        longitud: Number(av.longitud),
        precision_m: Number(av.geolocalizacion_precision) || 5
      };
    } else {
      this.estado.inspeccionInSitu.gpsInSitu = null;
    }
    this.actualizarUIGpsInSitu();

    // 4. Inicializar selectores, Canvas de firma digital, Guía de 12 Regiones y Actas
    this.poblarSelectoresInSitu();
    this.inicializarCanvasFirma();
    this.renderizarGuiaCampo12Regiones();
    this.seleccionarRegionGuiaCampo(1);
    this.recalcularInSitu();
    this.renderizarHistorialActasInSitu();

    // Preseleccionar primer ejemplar aspirante (RN) o primer animal del censo visible
    if (this.estado.animales && this.estado.animales.length > 0 && !this.estado.inspeccionInSitu.animalActualId) {
      const aspirante = this.estado.animales.find(a => a.seccion_libro === 'RN') || this.estado.animales[0];
      if (aspirante) {
        const sel = document.getElementById('insitu-animal-select');
        if (sel) sel.value = aspirante.id;
        this.cargarAnimalInSitu(aspirante.id);
      }
    }
  },

  refrescarVistaInspeccionInSitu() {
    this.sincronizarInputsInspectorAutenticado();
    this.poblarSelectoresInSitu();
    this.redimensionarCanvasFirma();
    this.renderizarHistorialActasInSitu();
    if (!this.estado.inspeccionInSitu.animalActualId && this.estado.animales.length > 0) {
      const aspirante = this.estado.animales.find(a => a.seccion_libro === 'RN') || this.estado.animales[0];
      if (aspirante) {
        const sel = document.getElementById('insitu-animal-select');
        if (sel) sel.value = aspirante.id;
        this.cargarAnimalInSitu(aspirante.id);
      }
    }
  },

  // Arquitectura Modular RBAC: Cambio de Rol
  cambiarRolRBAC(nuevoRol) {
    this.estado.inspeccionInSitu.rolRBAC = nuevoRol;
    localStorage.setItem('alacantina_rol_rbac', nuevoRol);
    this.actualizarBadgeRBACInSitu(nuevoRol);

    const nombresRol = {
      inspector: 'Inspector Zootécnico Oficial (CNZ)',
      criador: 'Criador / Titular de Explotación REGA',
      direccion: 'Dirección Técnica Libro ESGA025'
    };
    this.mostrarNotificacionToast(`🔐 Rol RBAC activo: ${nombresRol[nuevoRol] || nuevoRol}`, 'info');

    if (nuevoRol === 'inspector') {
      this.cambiarTab('inspeccion-insitu');
    }
  },

  actualizarBadgeRBACInSitu(rol) {
    const badge = document.getElementById('insitu-rbac-badge');
    if (!badge) return;
    if (rol === 'inspector') {
      badge.textContent = 'Rol Activo: Inspector Zootécnico CNZ';
      badge.className = 'px-2.5 py-0.5 rounded-md text-xs font-bold bg-emerald-950 text-emerald-300 border border-emerald-500';
    } else if (rol === 'direccion') {
      badge.textContent = 'Rol Activo: Dirección Técnica ESGA025';
      badge.className = 'px-2.5 py-0.5 rounded-md text-xs font-bold bg-sky-950 text-sky-300 border border-sky-500';
    } else {
      badge.textContent = 'Rol Activo: Criador (Modo Consulta)';
      badge.className = 'px-2.5 py-0.5 rounded-md text-xs font-bold bg-amber-950 text-amber-300 border border-amber-500';
    }
  },

  abrirModoInspeccionInSituDesdeTab3() {
    const animalTab3 = document.getElementById('inspeccion-animal-select')?.value;
    this.cambiarTab('inspeccion-insitu');
    if (animalTab3) {
      const selInSitu = document.getElementById('insitu-animal-select');
      if (selInSitu) selInSitu.value = animalTab3;
      this.cargarAnimalInSitu(animalTab3);
    }
  },

  // Interfaz Optimizada para Exteriores: Modo Alto Contraste bajo Luz Solar Directa
  toggleModoExteriorSolar() {
    this.estado.inspeccionInSitu.modoExteriorSolar = !this.estado.inspeccionInSitu.modoExteriorSolar;
    const activo = this.estado.inspeccionInSitu.modoExteriorSolar;
    const wrapper = document.getElementById('insitu-main-wrapper');
    const txtBtn = document.getElementById('texto-modo-exterior');
    const btn = document.getElementById('btn-toggle-exterior');

    if (wrapper) {
      if (activo) {
        wrapper.classList.add('outdoor-contrast-mode');
      } else {
        wrapper.classList.remove('outdoor-contrast-mode');
      }
    }

    if (txtBtn) {
      txtBtn.textContent = activo ? '☀️ Alto Contraste Solar: ON' : '☀️ Alto Contraste Solar: OFF';
    }
    if (btn) {
      btn.className = activo
        ? 'px-4 py-2.5 rounded-xl bg-yellow-300 hover:bg-yellow-200 text-black font-black text-xs sm:text-sm flex items-center gap-2 shadow-xl ring-4 ring-white transition'
        : 'px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs sm:text-sm flex items-center gap-2 shadow-lg transition active:scale-95';
    }

    this.mostrarNotificacionToast(
      activo
        ? '☀️ Modo Exterior de Alto Contraste activado para lectura bajo luz solar directa.'
        : '🌙 Modo Estándar de Inspección restaurado.',
      'info'
    );
  },

  // Captura de Coordenadas GPS Exactas para el Acta de Inspección In Situ
  capturarGPSInspeccionInSitu() {
    const btnTxt = document.getElementById('btn-insitu-gps-texto');
    if (btnTxt) btnTxt.textContent = '🛰️ Localizando GPS...';

    if (!navigator.geolocation) {
      this.mostrarNotificacionToast('⚠️ Navegador sin soporte GPS.', 'error');
      if (btnTxt) btnTxt.textContent = '📍 Capturar GPS In Situ';
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.estado.inspeccionInSitu.gpsInSitu = {
          latitud: Number(pos.coords.latitude.toFixed(6)),
          longitud: Number(pos.coords.longitude.toFixed(6)),
          precision_m: Math.round(pos.coords.accuracy || 4)
        };
        this.actualizarUIGpsInSitu();
        if (btnTxt) btnTxt.textContent = '✓ GPS In Situ Fijado';
        this.mostrarNotificacionToast(
          `📍 Coordenadas GPS de inspección fijadas (${this.estado.inspeccionInSitu.gpsInSitu.latitud}, ${this.estado.inspeccionInSitu.gpsInSitu.longitud})`,
          'success'
        );
      },
      (err) => {
        console.warn('[GPS InSitu] Error al capturar GPS:', err);
        const av = this.estado.aviario || this.estado.aviarioActivo;
        if (av && av.latitud !== null && av.latitud !== undefined && av.longitud !== null && av.longitud !== undefined) {
          this.estado.inspeccionInSitu.gpsInSitu = {
            latitud: Number(av.latitud),
            longitud: Number(av.longitud),
            precision_m: Number(av.geolocalizacion_precision) || 6
          };
          this.actualizarUIGpsInSitu();
          if (btnTxt) btnTxt.textContent = '📍 GPS Aviario';
          this.mostrarNotificacionToast('📍 Usando coordenadas GPS registradas de la explotación.', 'info');
        } else {
          if (btnTxt) btnTxt.textContent = '📍 Capturar GPS In Situ';
          this.mostrarNotificacionToast('⚠️ No se pudo obtener ubicación GPS.', 'error');
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  },

  actualizarUIGpsInSitu() {
    const gps = this.estado.inspeccionInSitu?.gpsInSitu;
    const latEl = document.getElementById('insitu-gps-lat');
    const lngEl = document.getElementById('insitu-gps-lng');
    const precEl = document.getElementById('insitu-gps-prec');
    if (gps && gps.latitud !== null && gps.latitud !== undefined && gps.longitud !== null && gps.longitud !== undefined) {
      if (latEl) latEl.textContent = Number(gps.latitud).toFixed(6);
      if (lngEl) lngEl.textContent = Number(gps.longitud).toFixed(6);
      if (precEl) precEl.textContent = gps.precision_m || 5;
    } else {
      if (latEl) latEl.textContent = '--';
      if (lngEl) lngEl.textContent = '--';
      if (precEl) precEl.textContent = '--';
    }
  },

  // Selectores de Aviario REGA y Ejemplares en Modo Inspección In Situ
  poblarSelectoresInSitu() {
    const selRega = document.getElementById('insitu-rega-select');
    const selAnimal = document.getElementById('insitu-animal-select');
    if (!selAnimal) return;

    // 1. Poblar REGA
    if (selRega) {
      const regaPrevia = selRega.value || 'TODOS';
      selRega.innerHTML = '<option value="TODOS">Todas las Explotaciones REGA</option>';
      const regasMap = new Map();
      (this.estado.explotaciones || []).forEach(e => {
        const codigo = e.codigo_rega || e.rega;
        if (codigo) {
          regasMap.set(codigo, `${codigo} · ${e.nombre_criadero || e.nombre_titular} (${e.municipio || 'Alicante'})`);
        }
      });
      (this.estado.animales || []).forEach(a => {
        if (a.codigo_rega && !regasMap.has(a.codigo_rega)) {
          regasMap.set(a.codigo_rega, `${a.codigo_rega} · ${a.titular_nombre || 'Aviario Asociado'}`);
        }
      });
      regasMap.forEach((label, codigo) => {
        const opt = document.createElement('option');
        opt.value = codigo;
        opt.textContent = label;
        selRega.appendChild(opt);
      });
      if (Array.from(selRega.options).some(o => o.value === regaPrevia)) {
        selRega.value = regaPrevia;
      }
    }

    // 2. Poblar ejemplares según filtro REGA
    const regaFiltro = selRega ? selRega.value : 'TODOS';
    this.filtrarAnimalesInSituPorRega(regaFiltro, false);
  },

  filtrarAnimalesInSituPorRega(rega, recargarAnimal = true) {
    const selAnimal = document.getElementById('insitu-animal-select');
    const contadorEl = document.getElementById('insitu-contador-ejemplares');
    if (!selAnimal) return;

    const valorPrevio = this.estado.inspeccionInSitu.animalActualId || selAnimal.value;
    let lista = [...(this.estado.animales || [])];

    if (rega && rega !== 'TODOS') {
      lista = lista.filter(a => {
        const exp = (this.estado.explotaciones || []).find(e => e.id === a.explotacion_id);
        const regaAnimal = a.codigo_rega || exp?.codigo_rega || exp?.rega || '';
        return regaAnimal === rega;
      });
    }

    if (contadorEl) {
      contadorEl.textContent = `${lista.length} ejemplar${lista.length === 1 ? '' : 'es'}`;
    }

    selAnimal.innerHTML = '<option value="">-- Seleccionar Ejemplar por Anilla / Código ESGA025 --</option>';
    lista.forEach(a => {
      const opt = document.createElement('option');
      opt.value = a.id;
      const iconoSexo = a.sexo === 'Macho' ? '♂ Gallo' : '♀ Gallina';
      opt.textContent = `Anilla #${a.numero_anilla} | ${a.codigo_identificacion} | [${a.seccion_libro}] ${iconoSexo} - ${a.nombre || a.variedad}`;
      selAnimal.appendChild(opt);
    });

    if (valorPrevio && lista.some(a => a.id === valorPrevio)) {
      selAnimal.value = valorPrevio;
    } else if (recargarAnimal && lista.length > 0) {
      selAnimal.value = lista[0].id;
      this.cargarAnimalInSitu(lista[0].id);
    }
  },

  cargarAnimalInSitu(animalId) {
    const animal = (this.estado.animales || []).find(a => a.id === animalId);
    this.estado.inspeccionInSitu.animalActualId = animal ? animal.id : null;

    if (!animal) return;

    // Obtener explotación vinculada dinámicamente (sin fallback hardcodeado ES030140000001)
    const exp = (this.estado.explotaciones || []).find(e => e.id === animal.explotacion_id) || this.estado.aviario || this.estado.aviarioActivo;
    const regaAnimal = animal.codigo_rega || exp?.codigo_rega || exp?.rega || 'TEMP-REGA-001';

    // Actualizar tarjeta resumen del ejemplar
    const imgEl = document.getElementById('insitu-animal-foto');
    const anillaEl = document.getElementById('insitu-animal-anilla');
    const secEl = document.getElementById('insitu-animal-seccion');
    const sexoEl = document.getElementById('insitu-animal-sexo');
    const detEl = document.getElementById('insitu-animal-detalles');
    const regaTxtEl = document.getElementById('insitu-animal-rega-txt');
    const pesoFxEl = document.getElementById('insitu-animal-peso-fx');

    if (imgEl) imgEl.src = animal.fotos?.lateral || './icons/logo.png';
    if (anillaEl) anillaEl.textContent = `ANILLA #${animal.numero_anilla}`;
    if (secEl) {
      secEl.textContent = `Sección: ${animal.seccion_libro}`;
      secEl.className = `px-2.5 py-0.5 rounded text-xs font-black ${this.obtenerColorBadgeSeccion(animal.seccion_libro)}`;
    }
    if (sexoEl) {
      sexoEl.textContent = `${animal.sexo} (${animal.calibre_anilla_mm || (animal.sexo === 'Macho' ? 20 : 18)}mm)`;
    }
    if (detEl) {
      detEl.textContent = `${animal.codigo_identificacion} · ${animal.nombre || 'Ejemplar Oficial'} · Variedad: ${animal.variedad}`;
    }
    if (regaTxtEl) {
      regaTxtEl.textContent = `REGA: ${regaAnimal} · ${animal.familia_origen || 'Familia A'} · Estado: ${animal.estado || 'Activo'}`;
    }
    if (pesoFxEl) {
      const fxPct = ((animal.coeficiente_consanguinidad || 0) * 100).toFixed(2);
      pesoFxEl.textContent = `${animal.peso_actual_kg ? animal.peso_actual_kg.toFixed(3) : '--'} kg · Fx: ${fxPct}%`;
    }

    // Actualizar GPS solo si la explotación o el ejemplar tienen coordenadas reales
    if (exp && exp.latitud !== null && exp.latitud !== undefined && exp.longitud !== null && exp.longitud !== undefined) {
      this.estado.inspeccionInSitu.gpsInSitu = {
        latitud: Number(exp.latitud),
        longitud: Number(exp.longitud),
        precision_m: Number(exp.geolocalizacion_precision) || 5
      };
      this.actualizarUIGpsInSitu();
    } else if (animal.geolocalizacion_alta?.latitud && animal.geolocalizacion_alta?.longitud) {
      this.estado.inspeccionInSitu.gpsInSitu = {
        latitud: Number(animal.geolocalizacion_alta.latitud),
        longitud: Number(animal.geolocalizacion_alta.longitud),
        precision_m: Number(animal.geolocalizacion_alta.precision_m) || 5
      };
      this.actualizarUIGpsInSitu();
    }

    // Limpiar defectos descalificables previos y cargar baremo previo si existe
    this.limpiarDefectosInSitu(false);
    this.estado.inspeccionInSitu.dictamenManual = false;

    const inspPrevia = (this.estado.inspecciones || []).find(i => i.animal_id === animal.id);
    const setSlider = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val;
    };

    if (inspPrevia) {
      setSlider('insitu-rng-cabeza', inspPrevia.cabeza_cresta_cara ?? 13);
      setSlider('insitu-rng-cuello', inspPrevia.cuello_esclavina ?? 8.5);
      setSlider('insitu-rng-pecho', inspPrevia.pecho_tronco ?? 17);
      setSlider('insitu-rng-cola', inspPrevia.cola_porte ?? 17.5);
      setSlider('insitu-rng-tarsos', inspPrevia.extremidades_tarsos ?? 13);
      setSlider('insitu-rng-plumaje', inspPrevia.plumaje_variedad ?? 8.5);
      setSlider('insitu-rng-peso', inspPrevia.peso_desarrollo ?? 8.5);

      if (inspPrevia.defecto_orejilla_no_blanca) this.toggleDefectoInSitu('orejilla', false);
      if (inspPrevia.defecto_pecho_prominente) this.toggleDefectoInSitu('pecho', false);
      if (inspPrevia.defecto_cola_baja) this.toggleDefectoInSitu('cola', false);
      if (inspPrevia.defecto_tarsos_anomalos) this.toggleDefectoInSitu('tarsos', false);
      if (inspPrevia.defecto_flameado_esclavina) this.toggleDefectoInSitu('flameado', false);
    } else {
      setSlider('insitu-rng-cabeza', 12.5);
      setSlider('insitu-rng-cuello', 8.5);
      setSlider('insitu-rng-pecho', 16.5);
      setSlider('insitu-rng-cola', 17.0);
      setSlider('insitu-rng-tarsos', 12.5);
      setSlider('insitu-rng-plumaje', 8.5);
      setSlider('insitu-rng-peso', 8.5);
    }

    this.recalcularInSitu();
  },

  siguienteAnimalInSitu() {
    const sel = document.getElementById('insitu-animal-select');
    if (!sel || sel.options.length <= 1) return;
    let nextIdx = sel.selectedIndex + 1;
    if (nextIdx >= sel.options.length) nextIdx = 1;
    sel.selectedIndex = nextIdx;
    this.cargarAnimalInSitu(sel.value);
    this.mostrarNotificacionToast(`Cargado ejemplar: ${sel.options[nextIdx].text.split('|')[0]}`, 'info');
  },

  // Checklist Visual de Un Solo Toque para Defectos Descalificables (Estándar ESGA025)
  toggleDefectoInSitu(clave, recalcular = true) {
    if (!this.estado.inspeccionInSitu.defectos.hasOwnProperty(clave)) return;
    this.estado.inspeccionInSitu.defectos[clave] = !this.estado.inspeccionInSitu.defectos[clave];
    const activo = this.estado.inspeccionInSitu.defectos[clave];

    const card = document.getElementById(`card-def-${clave}`);
    const pill = document.getElementById(`status-def-${clave}`);

    if (card) {
      if (activo) {
        card.classList.add('defect-active');
      } else {
        card.classList.remove('defect-active');
      }
    }
    if (pill) {
      if (activo) {
        pill.textContent = '🚫 DESCALIFICA';
        pill.className = 'px-2 py-0.5 rounded text-[10px] font-black bg-red-600 text-white uppercase shadow';
      } else {
        pill.textContent = 'SIN TARA';
        pill.className = 'px-2 py-0.5 rounded text-[10px] font-black bg-slate-800 text-slate-400 uppercase';
      }
    }

    // Sincronizar también con los checkboxes de la pestaña 3
    const chkTab3 = document.getElementById(`chk-def-${clave}`);
    if (chkTab3) chkTab3.checked = activo;

    if (recalcular) {
      this.estado.inspeccionInSitu.dictamenManual = false;
      this.recalcularInSitu();
    }
  },

  limpiarDefectosInSitu(recalcular = true) {
    ['orejilla', 'pecho', 'cola', 'tarsos', 'flameado'].forEach(clave => {
      this.estado.inspeccionInSitu.defectos[clave] = false;
      const card = document.getElementById(`card-def-${clave}`);
      const pill = document.getElementById(`status-def-${clave}`);
      if (card) card.classList.remove('defect-active');
      if (pill) {
        pill.textContent = 'SIN TARA';
        pill.className = 'px-2 py-0.5 rounded text-[10px] font-black bg-slate-800 text-slate-400 uppercase';
      }
      const chkTab3 = document.getElementById(`chk-def-${clave}`);
      if (chkTab3) chkTab3.checked = false;
    });

    if (recalcular) {
      this.estado.inspeccionInSitu.dictamenManual = false;
      this.recalcularInSitu();
    }
  },

  // Ajuste táctil de [-0.5] / [+0.5] en el Baremo de 100 Puntos para uso con una mano en campo
  ajustarSliderInSitu(bloque, delta) {
    const slider = document.getElementById(`insitu-rng-${bloque}`);
    if (!slider) return;
    const min = parseFloat(slider.min) || 0;
    const max = parseFloat(slider.max) || 20;
    const actual = parseFloat(slider.value) || 0;
    const nuevo = Math.min(max, Math.max(min, actual + delta));
    slider.value = nuevo;
    this.recalcularInSitu();
  },

  recalcularInSitu() {
    const leer = (id) => parseFloat(document.getElementById(id)?.value) || 0;
    const c1 = leer('insitu-rng-cabeza');
    const c2 = leer('insitu-rng-cuello');
    const c3 = leer('insitu-rng-pecho');
    const c4 = leer('insitu-rng-cola');
    const c5 = leer('insitu-rng-tarsos');
    const c6 = leer('insitu-rng-plumaje');
    const c7 = leer('insitu-rng-peso');

    const setTxt = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = `${val.toFixed(1)}p`;
    };
    setTxt('insitu-val-cabeza', c1);
    setTxt('insitu-val-cuello', c2);
    setTxt('insitu-val-pecho', c3);
    setTxt('insitu-val-cola', c4);
    setTxt('insitu-val-tarsos', c5);
    setTxt('insitu-val-plumaje', c6);
    setTxt('insitu-val-peso', c7);

    const total = c1 + c2 + c3 + c4 + c5 + c6 + c7;
    const totalEl = document.getElementById('insitu-baremo-total');
    if (totalEl) totalEl.textContent = total.toFixed(1);

    const defs = this.estado.inspeccionInSitu.defectos;
    const tieneTaraDescalificante = defs.orejilla || defs.pecho || defs.cola || defs.tarsos || defs.flameado;

    const badgeDesc = document.getElementById('insitu-badge-descalificado');
    if (badgeDesc) {
      if (tieneTaraDescalificante) {
        badgeDesc.classList.remove('hidden');
      } else {
        badgeDesc.classList.add('hidden');
      }
    }

    // Determinar dictamen automático si no fue forzado manualmente (o si hay tara descalificante)
    if (tieneTaraDescalificante) {
      this.seleccionarDictamenInSitu('NO_APTO_BAJA', false);
      if (totalEl) totalEl.className = 'text-2xl sm:text-3xl font-black text-rose-500 font-mono';
    } else if (!this.estado.inspeccionInSitu.dictamenManual) {
      if (total >= 70.0) {
        this.seleccionarDictamenInSitu('APTO_RD', false);
        if (totalEl) totalEl.className = 'text-2xl sm:text-3xl font-black text-emerald-400 font-mono';
      } else if (total >= 60.0) {
        this.seleccionarDictamenInSitu('PROVISIONAL', false);
        if (totalEl) totalEl.className = 'text-2xl sm:text-3xl font-black text-amber-400 font-mono';
      } else {
        this.seleccionarDictamenInSitu('NO_APTO_BAJA', false);
        if (totalEl) totalEl.className = 'text-2xl sm:text-3xl font-black text-rose-500 font-mono';
      }
    } else {
      // Actualizar resumen manteniendo el dictamen manual si es válido
      this.seleccionarDictamenInSitu(this.estado.inspeccionInSitu.dictamenSeleccionado, true);
    }
  },

  // Flujo Ágil de Dictamen Zootécnico: [ Apto Reproductor (RD) ], [ Provisional ], [ No Apto / Baja ]
  seleccionarDictamenInSitu(dictamen, esManual = true) {
    const defs = this.estado.inspeccionInSitu.defectos;
    const tieneTara = defs.orejilla || defs.pecho || defs.cola || defs.tarsos || defs.flameado;
    const totalPts = parseFloat(document.getElementById('insitu-baremo-total')?.textContent) || 0;

    if (esManual && dictamen === 'APTO_RD' && tieneTara) {
      this.mostrarNotificacionToast('🚫 Un ejemplar con defectos descalificables ESGA025 no puede declararse Apto Reproductor (RD).', 'error');
      dictamen = 'NO_APTO_BAJA';
    } else if (esManual && dictamen === 'APTO_RD' && totalPts < 70.0) {
      this.mostrarNotificacionToast('⚠️ Para Apto Reproductor (RD) el ejemplar requiere al menos 70.0 puntos en el Baremo CNZ.', 'error');
      dictamen = 'PROVISIONAL';
    }

    this.estado.inspeccionInSitu.dictamenSeleccionado = dictamen;
    if (esManual) {
      this.estado.inspeccionInSitu.dictamenManual = true;
    }

    const btnApto = document.getElementById('btn-dictamen-apto');
    const btnProv = document.getElementById('btn-dictamen-provisional');
    const btnNoApto = document.getElementById('btn-dictamen-noapto');

    const baseInactive = 'p-3.5 rounded-xl border-2 border-slate-700 bg-slate-900 text-slate-400 font-bold text-xs sm:text-sm flex flex-col items-center justify-center gap-1.5 transition active:scale-95 opacity-75 hover:opacity-100';

    if (btnApto) {
      btnApto.className = dictamen === 'APTO_RD'
        ? 'p-3.5 rounded-xl border-2 border-emerald-400 bg-emerald-950 text-emerald-200 font-black text-xs sm:text-sm flex flex-col items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/25 ring-2 ring-emerald-400/50 transition'
        : baseInactive;
    }
    if (btnProv) {
      btnProv.className = dictamen === 'PROVISIONAL'
        ? 'p-3.5 rounded-xl border-2 border-amber-400 bg-amber-950 text-amber-200 font-black text-xs sm:text-sm flex flex-col items-center justify-center gap-1.5 shadow-lg shadow-amber-500/25 ring-2 ring-amber-400/50 transition'
        : baseInactive;
    }
    if (btnNoApto) {
      btnNoApto.className = dictamen === 'NO_APTO_BAJA'
        ? 'p-3.5 rounded-xl border-2 border-rose-500 bg-rose-950 text-rose-200 font-black text-xs sm:text-sm flex flex-col items-center justify-center gap-1.5 shadow-lg shadow-rose-500/25 ring-2 ring-rose-500/50 transition'
        : baseInactive;
    }

    // Actualizar cuadro explicativo de promoción de estado en Libro Genealógico
    const animal = (this.estado.animales || []).find(a => a.id === this.estado.inspeccionInSitu.animalActualId);
    const secActual = animal ? animal.seccion_libro : 'RN';
    const boxResumen = document.getElementById('insitu-dictamen-resumen-box');
    const txtDictamen = document.getElementById('insitu-dictamen-texto');
    const pillProm = document.getElementById('insitu-promocion-pill');
    const txtExp = document.getElementById('insitu-dictamen-explicacion');

    if (dictamen === 'APTO_RD') {
      const secDestino = totalPts >= 90.0 ? 'RM' : (secActual === 'RF' ? 'RF' : 'RD');
      if (boxResumen) boxResumen.className = 'p-3.5 rounded-xl bg-emerald-950/60 border-2 border-emerald-500/80 text-xs space-y-1';
      if (txtDictamen) txtDictamen.textContent = totalPts >= 90.0 ? 'APTO EXCELENTE · REGISTRO DE MÉRITOS (RM)' : 'APTO REPRODUCTOR · REGISTRO DEFINITIVO (RD)';
      if (pillProm) {
        pillProm.textContent = `${secActual} ➔ ${secDestino}`;
        pillProm.className = 'px-2.5 py-0.5 rounded bg-emerald-400 text-slate-950 font-mono font-black text-[11px]';
      }
      if (txtExp) {
        txtExp.textContent = `Trigger promover_ejemplar_inspeccion(): El ejemplar (${totalPts.toFixed(1)}p) promociona oficialmente a la sección ${secDestino} del Libro Genealógico ESGA025.`;
      }
    } else if (dictamen === 'PROVISIONAL') {
      const secDestino = secActual === 'RA' ? 'RA' : 'RN';
      if (boxResumen) boxResumen.className = 'p-3.5 rounded-xl bg-amber-950/60 border-2 border-amber-500/80 text-xs space-y-1';
      if (txtDictamen) txtDictamen.textContent = 'PROVISIONAL (PENDIENTE DE REVISIÓN / MUDA)';
      if (pillProm) {
        pillProm.textContent = `Mantiene ${secDestino} (Provisional)`;
        pillProm.className = 'px-2.5 py-0.5 rounded bg-amber-400 text-slate-950 font-mono font-black text-[11px]';
      }
      if (txtExp) {
        txtExp.textContent = 'El ejemplar permanece en observación zootécnica provisional hasta completar desarrollo corporal o muda de plumaje.';
      }
    } else {
      if (boxResumen) boxResumen.className = 'p-3.5 rounded-xl bg-rose-950/70 border-2 border-rose-500/80 text-xs space-y-1';
      if (txtDictamen) txtDictamen.textContent = 'NO APTO / BAJA REPRODUCTIVA';
      if (pillProm) {
        pillProm.textContent = `${secActual} ➔ NO APTO / BAJA`;
        pillProm.className = 'px-2.5 py-0.5 rounded bg-rose-500 text-white font-mono font-black text-[11px]';
      }
      if (txtExp) {
        txtExp.textContent = tieneTara
          ? 'Descalificación directa por tara morfológica excluyente del Estándar ESGA025. Excluido como reproductor.'
          : 'Puntuación inferior al mínimo reglamentario de 70 puntos. Excluido del Registro Definitivo.';
      }
    }
  },

  // =========================================================================
  // CAPTURA DE FIRMA DIGITAL MANUSCRITA MEDIANTE CANVAS HTML5 (#canvas-firma-inspector)
  // =========================================================================
  inicializarCanvasFirma() {
    const canvas = document.getElementById('canvas-firma-inspector');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let dibujando = false;
    let ultimoX = 0;
    let ultimoY = 0;

    const obtenerCoordenadas = (e) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / (rect.width || 600);
      const scaleY = canvas.height / (rect.height || 190);
      let clientX = e.clientX;
      let clientY = e.clientY;
      if (e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      }
      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
      };
    };

    const iniciarTrazo = (e) => {
      if (e.cancelable) e.preventDefault();
      dibujando = true;
      const pos = obtenerCoordenadas(e);
      ultimoX = pos.x;
      ultimoY = pos.y;
      this.estado.inspeccionInSitu.trazosFirma++;
      this.estado.inspeccionInSitu.firmaConfirmada = false;
      const badge = document.getElementById('badge-estado-firma');
      if (badge) {
        badge.textContent = 'Firmando en lienzo...';
        badge.className = 'px-2.5 py-0.5 rounded text-[10px] font-black bg-sky-950 text-sky-300 border border-sky-600 uppercase';
      }
    };

    const moverTrazo = (e) => {
      if (!dibujando) return;
      if (e.cancelable) e.preventDefault();
      const pos = obtenerCoordenadas(e);
      ctx.beginPath();
      ctx.moveTo(ultimoX, ultimoY);
      ctx.lineTo(pos.x, pos.y);
      ctx.strokeStyle = this.estado.inspeccionInSitu.modoExteriorSolar ? '#0f172a' : '#38bdf8';
      ctx.lineWidth = 3.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
      ultimoX = pos.x;
      ultimoY = pos.y;
    };

    const finalizarTrazo = (e) => {
      if (!dibujando) return;
      if (e && e.cancelable) e.preventDefault();
      dibujando = false;
    };

    // Eventos de ratón
    canvas.addEventListener('mousedown', iniciarTrazo);
    canvas.addEventListener('mousemove', moverTrazo);
    window.addEventListener('mouseup', finalizarTrazo);

    // Eventos táctiles móviles (exteriores)
    canvas.addEventListener('touchstart', iniciarTrazo, { passive: false });
    canvas.addEventListener('touchmove', moverTrazo, { passive: false });
    canvas.addEventListener('touchend', finalizarTrazo, { passive: false });
  },

  redimensionarCanvasFirma() {
    const canvas = document.getElementById('canvas-firma-inspector');
    if (!canvas) return;
    if (!canvas.width) canvas.width = 600;
    if (!canvas.height) canvas.height = 190;
  },

  limpiarFirmaInspector() {
    const canvas = document.getElementById('canvas-firma-inspector');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    this.estado.inspeccionInSitu.firmaBase64 = null;
    this.estado.inspeccionInSitu.firmaConfirmada = false;
    this.estado.inspeccionInSitu.trazosFirma = 0;

    const badge = document.getElementById('badge-estado-firma');
    if (badge) {
      badge.textContent = 'Pendiente de Confirmar';
      badge.className = 'px-2.5 py-0.5 rounded text-[10px] font-black bg-amber-950 text-amber-300 border border-amber-700 uppercase';
    }
  },

  generarRubricaAutomaticaEnCanvas() {
    const canvas = document.getElementById('canvas-firma-inspector');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const datosInsp = this.obtenerDatosInspectorActivo();
    const inspectorId = datosInsp.id || 'ID-SIN-ASIGNAR';
    const inspectorNombre = datosInsp.nombre || 'Inspector Autenticado';

    ctx.save();
    ctx.strokeStyle = this.estado.inspeccionInSitu.modoExteriorSolar ? '#0f172a' : '#38bdf8';
    ctx.lineWidth = 2.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(90, 125);
    ctx.bezierCurveTo(140, 45, 195, 155, 255, 75);
    ctx.bezierCurveTo(305, 35, 340, 130, 420, 85);
    ctx.bezierCurveTo(465, 65, 495, 115, 520, 95);
    ctx.stroke();

    // Subrayado y sello técnico con los datos reales del Inspector autenticado
    ctx.beginPath();
    ctx.moveTo(110, 140);
    ctx.lineTo(485, 132);
    ctx.stroke();

    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = this.estado.inspeccionInSitu.modoExteriorSolar ? '#1e293b' : '#94a3b8';
    ctx.fillText(`Fdo. Digitalmente: ${inspectorNombre} [${inspectorId}]`, 115, 162);
    ctx.restore();
    this.estado.inspeccionInSitu.trazosFirma = 3;
  },

  async confirmarFirmaInspector() {
    const canvas = document.getElementById('canvas-firma-inspector');
    if (!canvas) return false;

    // Si el inspector pulsa confirmar sin haber trazado manualmente, trazamos su rúbrica digital acreditada con su nombre e ID reales
    if (this.estado.inspeccionInSitu.trazosFirma === 0) {
      this.generarRubricaAutomaticaEnCanvas();
    }

    const dataUrl = canvas.toDataURL('image/png');
    this.estado.inspeccionInSitu.firmaBase64 = dataUrl;
    this.estado.inspeccionInSitu.firmaConfirmada = true;

    // Guardar también la firma digital en el perfil del usuario autenticado (Inspector / Admin)
    const u = this.estado.usuarioActivo || this.estado.usuarioActual;
    if (u) {
      u.firma_base64 = dataUrl;
      this.estado.usuarioActivo = u;
      this.estado.usuarioActual = u;
      await this.db.put('usuarios', u);
      localStorage.setItem('alacantina_v6_session', JSON.stringify(u));
    }

    const badge = document.getElementById('badge-estado-firma');
    if (badge) {
      badge.textContent = '✓ Firma Digital Confirmada (Base64)';
      badge.className = 'px-2.5 py-0.5 rounded text-[10px] font-black bg-emerald-950 text-emerald-300 border border-emerald-500 uppercase';
    }

    this.mostrarNotificacionToast('✍️ Firma manuscrita del inspector confirmada y vinculada a tu perfil.', 'success');
    return true;
  },

  // =========================================================================
  // GENERACIÓN DEL ACTA OFICIAL Y DISPARO DE promover_ejemplar_inspeccion()
  // =========================================================================
  async guardarActaInspeccionInSitu() {
    // Verificar rol RBAC
    if (this.estado.inspeccionInSitu.rolRBAC === 'criador' || this.estado.inspeccionInSitu.rolRBAC === 'aspirante') {
      if (!confirm('Estás en el rol de Criador/Aspirante. La emisión de Actas Oficiales corresponde al Inspector Zootécnico CNZ.\n¿Deseas conmutar automáticamente al modo Inspector y emitir el acta con tus datos de sesión?')) {
        return;
      }
      this.cambiarRolRBAC('inspector');
    }

    const animalId = this.estado.inspeccionInSitu.animalActualId || document.getElementById('insitu-animal-select')?.value;
    if (!animalId) {
      alert('Por favor, selecciona primero el ejemplar a evaluar.');
      return;
    }

    const animal = (this.estado.animales || []).find(a => a.id === animalId);
    if (!animal) {
      alert('Ejemplar no encontrado en el censo local.');
      return;
    }

    // Confirmar firma automáticamente si aún no se pulsó Confirmar
    if (!this.estado.inspeccionInSitu.firmaConfirmada || !this.estado.inspeccionInSitu.firmaBase64) {
      await this.confirmarFirmaInspector();
    }

    // Extraer dinámicamente Nombre, ID/DNI y Firma Digital del usuario autenticado
    const datosInspector = this.obtenerDatosInspectorActivo();
    const inspectorId = datosInspector.id;
    const inspectorNombre = datosInspector.nombre;

    if (!inspectorNombre || !inspectorId) {
      alert('Por favor, verifica que tu perfil de Inspector Zootécnico tenga Nombre e ID/DNI válidos.');
      return;
    }

    const fechaHoraVal = document.getElementById('insitu-fecha-hora')?.value || new Date().toISOString().slice(0, 16);
    const fechaSolo = fechaHoraVal.split('T')[0];

    const exp = (this.estado.explotaciones || []).find(e => e.id === animal.explotacion_id) || this.estado.aviario || this.estado.aviarioActivo;
    const codigoRega = animal.codigo_rega || exp?.codigo_rega || exp?.rega || 'TEMP-REGA-001';
    const titularAviario = exp?.nombre_titular || animal.titular_nombre || '';
    const nombreAviario = exp?.nombre_criadero || '';

    // Puntuaciones del Baremo de 100 Puntos
    const leer = (id) => parseFloat(document.getElementById(id)?.value) || 0;
    const c1 = leer('insitu-rng-cabeza');
    const c2 = leer('insitu-rng-cuello');
    const c3 = leer('insitu-rng-pecho');
    const c4 = leer('insitu-rng-cola');
    const c5 = leer('insitu-rng-tarsos');
    const c6 = leer('insitu-rng-plumaje');
    const c7 = leer('insitu-rng-peso');
    const total = c1 + c2 + c3 + c4 + c5 + c6 + c7;

    // Defectos descalificables detectados
    const defs = this.estado.inspeccionInSitu.defectos;
    const descalificado = Boolean(defs.orejilla || defs.pecho || defs.cola || defs.tarsos || defs.flameado);

    const TextosDefectos = [];
    if (defs.orejilla) TextosDefectos.push('Orejilla roja o amarilla');
    if (defs.pecho) TextosDefectos.push('Pecho prominente/redondeado');
    if (defs.cola) TextosDefectos.push('Cola llevada a menos de 70º o defectuosa');
    if (defs.tarsos) TextosDefectos.push('Tarsos amarillos o emplumados');
    if (defs.flameado) TextosDefectos.push('Flameado en esclavina (Moteada/Exchequer)');

    const dictamen = this.estado.inspeccionInSitu.dictamenSeleccionado || 'APTO_RD';
    const seccionAnterior = animal.seccion_libro || 'RN';
    let seccionPromovida = seccionAnterior;
    let calificacionTexto = 'Apto Reproductor (RD)';

    if (dictamen === 'APTO_RD' && !descalificado && total >= 70.0) {
      seccionPromovida = total >= 90.0 ? 'RM' : (seccionAnterior === 'RF' ? 'RF' : 'RD');
      calificacionTexto = total >= 90.0 ? 'Excelente (RM)' : (total >= 80.0 ? 'Muy Bueno (RD)' : 'Apto Reproductor (RD)');
    } else if (dictamen === 'PROVISIONAL') {
      seccionPromovida = seccionAnterior === 'RA' ? 'RA' : 'RN';
      calificacionTexto = 'Provisional (En revisión)';
    } else {
      seccionPromovida = seccionAnterior;
      calificacionTexto = 'No Apto / Baja';
    }

    const gps = this.estado.inspeccionInSitu.gpsInSitu || (exp && exp.latitud && exp.longitud ? { latitud: exp.latitud, longitud: exp.longitud, precision_m: exp.geolocalizacion_precision || 5 } : null);
    const obsInput = (document.getElementById('insitu-observaciones')?.value || '').trim();
    const codigoActa = `ACTA-ESGA025-${new Date().getFullYear()}-${String(Math.floor(1000 + Math.random() * 9000))}`;
    const uActivo = this.estado.usuarioActivo || this.estado.usuarioActual;

    const nuevaActa = {
      id: 'insp-acta-' + Date.now(),
      codigo_acta: codigoActa,
      animal_id: animal.id,
      codigo_identificacion: animal.codigo_identificacion,
      numero_anilla: animal.numero_anilla,
      sexo: animal.sexo,
      variedad: animal.variedad,
      explotacion_id: animal.explotacion_id || exp?.id || null,
      codigo_rega: codigoRega,
      nombre_aviario: nombreAviario,
      titular_aviario: titularAviario,
      inspector_usuario_id: uActivo?.id || null,
      inspector_id: inspectorId,
      inspector_dni: datosInspector.dni || inspectorId,
      calificador_oficial: inspectorNombre,
      rol_rbac: this.estado.inspeccionInSitu.rolRBAC,
      fecha_inspeccion: fechaSolo,
      fecha_hora_inspeccion: fechaHoraVal,
      coordenadas_gps: gps ? {
        latitud: gps.latitud,
        longitud: gps.longitud,
        precision_m: gps.precision_m
      } : null,
      cabeza_cresta_cara: c1,
      cuello_esclavina: c2,
      pecho_tronco: c3,
      cola_porte: c4,
      extremidades_tarsos: c5,
      plumaje_variedad: c6,
      peso_desarrollo: c7,
      puntuacion_total: total,
      defecto_orejilla_no_blanca: defs.orejilla,
      defecto_pecho_prominente: defs.pecho,
      defecto_cola_baja: defs.cola,
      defecto_tarsos_anomalos: defs.tarsos,
      defecto_flameado_esclavina: defs.flameado,
      defectos_detectados: TextosDefectos,
      descalificado: descalificado,
      dictamen_zootecnico: dictamen,
      calificacion: calificacionTexto,
      seccion_anterior: seccionAnterior,
      seccion_promovida: seccionPromovida,
      firma_inspector_base64: datosInspector.firma_base64 || this.estado.inspeccionInSitu.firmaBase64,
      firma_storage_url: null,
      observaciones: obsInput || `Acta Oficial de Inspección Zootécnica In Situ (${codigoActa}). Dictamen: ${calificacionTexto}. Puntuación: ${total.toFixed(1)}/100p. REGA: ${codigoRega}.`
    };

    // Ejecutar función de promoción de ejemplar y guardado offline/online
    await this.promoverEjemplarInspeccion(animal, nuevaActa);

    // Limpiar campo de observaciones para la siguiente ave
    const elObs = document.getElementById('insitu-observaciones');
    if (elObs) elObs.value = '';

    // Actualizar UI general
    this.poblarSelectores();
    this.renderizarCenso();
    this.actualizarKPIs();
    this.cargarAnimalInSitu(animal.id);
    this.renderizarHistorialActasInSitu();

    // Mostrar inmediatamente el Acta Digital Oficial generada
    this.verActaInspeccionModal(nuevaActa.id);
  },

  // Disparo del trigger/función de promoción de estado en Supabase (promover_ejemplar_inspeccion()) y persistencia IndexedDB
  async promoverEjemplarInspeccion(animal, acta) {
    // 1. Actualizar estado del animal localmente en el Libro Genealógico
    animal.seccion_libro = acta.seccion_promovida;
    if (acta.dictamen_zootecnico === 'APTO_RD') {
      animal.estado_reproductor = 'Apto';
      animal.estado = 'Activo';
    } else if (acta.dictamen_zootecnico === 'PROVISIONAL') {
      animal.estado_reproductor = 'Provisional';
      animal.estado = 'Activo';
    } else {
      animal.estado_reproductor = 'No Apto';
      animal.estado = 'Baja';
    }
    animal.ultima_acta_id = acta.id;
    animal.ultima_puntuacion_100p = acta.puntuacion_total;

    await this.db.put('animales', animal);

    // 2. Guardar el Acta en el almacén local IndexedDB 'inspecciones'
    await this.db.put('inspecciones', acta);
    const idxExistente = this.estado.inspecciones.findIndex(i => i.id === acta.id);
    if (idxExistente >= 0) {
      this.estado.inspecciones[idxExistente] = acta;
    } else {
      this.estado.inspecciones.unshift(acta);
    }

    // 3. Si hay red y cliente Supabase, subir firma Base64 a Storage, guardar acta e invocar promover_ejemplar_inspeccion()
    if (navigator.onLine && this.supabaseClient) {
      try {
        if (acta.firma_inspector_base64 && acta.firma_inspector_base64.startsWith('data:')) {
          const urlSubida = await this.subirFotoStorage(animal.id, 'firma_inspector', acta.firma_inspector_base64);
          if (urlSubida) {
            acta.firma_storage_url = urlSubida;
            await this.db.put('inspecciones', acta);
          }
        }

        await this.supabaseClient.from('inspecciones_morfologicas').upsert(acta);

        // Disparar función/trigger oficial en Supabase: promover_ejemplar_inspeccion()
        const { error: rpcError } = await this.supabaseClient.rpc('promover_ejemplar_inspeccion', {
          p_animal_id: animal.id,
          p_puntuacion_total: acta.puntuacion_total,
          p_descalificado: acta.descalificado,
          p_dictamen: acta.dictamen_zootecnico,
          p_nueva_seccion: acta.seccion_promovida
        });

        if (rpcError) {
          console.warn('[Supabase] RPC promover_ejemplar_inspeccion no disponible, aplicando update directo:', rpcError);
        }

        await this.supabaseClient.from('animales').update({
          seccion_libro: animal.seccion_libro,
          estado_reproductor: animal.estado_reproductor,
          estado: animal.estado
        }).eq('id', animal.id);

        this.mostrarNotificacionToast(
          `✅ Acta ${acta.codigo_acta} sincronizada y promover_ejemplar_inspeccion() ejecutado (${acta.seccion_anterior} ➔ ${acta.seccion_promovida}).`,
          'success'
        );
      } catch (err) {
        console.warn('[Supabase] Error en sincronización directa de Acta, guardando en SyncQueue offline:', err);
        await this.db.put('syncQueue', {
          tipo: 'ACTA_INSPECCION_INSITU',
          payload: acta,
          creado_en: Date.now()
        });
        this.mostrarNotificacionToast(
          `📦 Acta ${acta.codigo_acta} guardada en IndexedDB (SyncQueue) para sincronizar al recuperar red.`,
          'info'
        );
      }
    } else {
      // Modo 100% Offline (Zonas rurales sin cobertura)
      await this.db.put('syncQueue', {
        tipo: 'ACTA_INSPECCION_INSITU',
        payload: acta,
        creado_en: Date.now()
      });
      this.mostrarNotificacionToast(
        `📡 Modo Offline: Acta ${acta.codigo_acta} y promoción (${acta.seccion_anterior} ➔ ${acta.seccion_promovida}) encoladas en SyncQueue.`,
        'success'
      );
    }

    this.estado.syncQueue = await this.db.getAll('syncQueue');
    this.actualizarContadorSyncQueue();
  },

  // Renderizado del listado de Actas Oficiales emitidas
  renderizarHistorialActasInSitu() {
    const cont = document.getElementById('insitu-lista-actas');
    const badge = document.getElementById('insitu-total-actas-badge');
    if (!cont) return;

    const lista = this.estado.inspecciones || [];
    if (badge) {
      badge.textContent = `${lista.length} acta${lista.length === 1 ? '' : 's'} registrada${lista.length === 1 ? '' : 's'}`;
    }

    if (lista.length === 0) {
      cont.innerHTML = '<div class="col-span-2 p-6 text-center text-slate-500 text-xs">No hay actas de inspección registradas todavía.</div>';
      return;
    }

    const datosInspActivo = this.obtenerDatosInspectorActivo();

    cont.innerHTML = lista.slice(0, 10).map(insp => {
      const animal = (this.estado.animales || []).find(a => a.id === insp.animal_id);
      const anilla = insp.numero_anilla || animal?.numero_anilla || '----';
      const codigoId = insp.codigo_identificacion || animal?.codigo_identificacion || 'ESGA025';
      const codigoActa = insp.codigo_acta || `ACTA-${insp.id.toUpperCase()}`;
      const rega = insp.codigo_rega || animal?.codigo_rega || 'TEMP-REGA-001';
      const gpsTxt = (insp.coordenadas_gps && insp.coordenadas_gps.latitud !== null && insp.coordenadas_gps.longitud !== null)
        ? `${Number(insp.coordenadas_gps.latitud).toFixed(4)}, ${Number(insp.coordenadas_gps.longitud).toFixed(4)}`
        : 'Sin GPS';
      const inspectorMostrar = insp.calificador_oficial || insp.inspector_id || datosInspActivo.nombre || 'Inspector Oficial';
      const esNoApto = insp.descalificado || insp.calificacion?.includes('No Apto');
      const colorBorde = esNoApto ? 'border-rose-700/70' : 'border-emerald-700/70';

      return `
        <div class="p-3.5 rounded-xl bg-slate-900 border ${colorBorde} flex flex-col justify-between gap-2.5 text-xs">
          <div class="flex items-start justify-between gap-2">
            <div>
              <div class="flex flex-wrap items-center gap-1.5">
                <span class="font-mono font-black text-amber-400">${this.escaparHtml(codigoActa)}</span>
                <span class="px-2 py-0.5 rounded text-[10px] font-black ${esNoApto ? 'bg-rose-950 text-rose-300 border border-rose-700' : 'bg-emerald-950 text-emerald-300 border border-emerald-700'}">
                  ${this.escaparHtml(insp.calificacion || 'Apto')} (${Number(insp.puntuacion_total || 0).toFixed(1)}p)
                </span>
              </div>
              <p class="font-bold text-white mt-1">
                Ejemplar #${this.escaparHtml(anilla)} · <span class="font-mono text-slate-300">${this.escaparHtml(codigoId)}</span>
                ${insp.seccion_promovida ? `<span class="ml-1 text-emerald-400 font-mono">(${insp.seccion_anterior || 'RN'} ➔ ${insp.seccion_promovida})</span>` : ''}
              </p>
            </div>
            <button type="button" onclick="app.verActaInspeccionModal('${insp.id}')" class="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/50 text-emerald-300 font-bold text-[11px] flex items-center gap-1 shrink-0 transition">
              <i class="fa-solid fa-file-contract"></i>
              <span>Ver Acta</span>
            </button>
          </div>
          <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800 text-[11px] text-slate-400 font-mono">
            <span><i class="fa-solid fa-warehouse text-amber-400 mr-1"></i>REGA: ${this.escaparHtml(rega)}</span>
            <span><i class="fa-solid fa-location-dot text-sky-400 mr-1"></i>GPS: ${gpsTxt}</span>
            <span><i class="fa-solid fa-user-check text-emerald-400 mr-1"></i>${this.escaparHtml(inspectorMostrar)}</span>
          </div>
        </div>
      `;
    }).join('');
  },

  // Modal de Vista Previa e Impresión del Acta Digital de Inspección Zootécnica
  verActaInspeccionModal(actaId) {
    const acta = (this.estado.inspecciones || []).find(i => i.id === actaId);
    if (!acta) return;

    this.estado.inspeccionInSitu.actaSeleccionada = acta;
    const animal = (this.estado.animales || []).find(a => a.id === acta.animal_id);
    const contenedor = document.getElementById('acta-digital-printable-content');
    const modal = document.getElementById('modal-acta-inspeccion');
    if (!contenedor || !modal) return;

    const datosInsp = this.obtenerDatosInspectorActivo(acta);
    const codigoActa = acta.codigo_acta || `ACTA-ESGA025-${acta.id.toUpperCase()}`;
    const fechaHora = acta.fecha_hora_inspeccion ? acta.fecha_hora_inspeccion.replace('T', ' ') : acta.fecha_inspeccion;
    const rega = acta.codigo_rega || animal?.codigo_rega || 'TEMP-REGA-001';
    const inspectorId = datosInsp.id || acta.inspector_id || 'Pendiente';
    const inspectorNombre = datosInsp.nombre || acta.calificador_oficial || 'Inspector Zootécnico';
    const firmaBase64 = datosInsp.firma_base64 || acta.firma_inspector_base64;
    const tieneGps = acta.coordenadas_gps && acta.coordenadas_gps.latitud !== null && acta.coordenadas_gps.longitud !== null;
    const gpsTexto = tieneGps
      ? `Lat: ${Number(acta.coordenadas_gps.latitud).toFixed(6)}, Lng: ${Number(acta.coordenadas_gps.longitud).toFixed(6)}`
      : 'No registrado';
    const prec = acta.coordenadas_gps?.precision_m ?? '--';
    const defectosArr = Array.isArray(acta.defectos_detectados) && acta.defectos_detectados.length > 0
      ? acta.defectos_detectados
      : (acta.descalificado ? ['Defecto morfológico excluyente ESGA025'] : []);

    contenedor.innerHTML = `
      <div class="border-b-2 border-amber-500/60 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <img src="./icons/logo.png" onerror="this.src='./icons/icon-192.png'" class="h-12 w-12 rounded-xl border border-amber-400 p-0.5 bg-slate-900" alt="ESGA025">
          <div>
            <div class="flex items-center gap-2">
              <span class="px-2 py-0.5 rounded bg-amber-400 text-slate-950 font-black text-[10px] uppercase">Documento Oficial</span>
              <span class="font-mono font-bold text-emerald-400 text-xs">${this.escaparHtml(codigoActa)}</span>
            </div>
            <h4 class="text-sm sm:text-base font-black text-white uppercase mt-0.5">
              Acta Digital de Inspección Zootécnica In Situ · Raza Gallina Alacantina (ESGA025)
            </h4>
            <p class="text-[11px] text-slate-400">
              Protocolo CNZ (5 junio 2025) · Real Decreto 45/2019 · Reglamento Zootécnico (UE) 2016/1012
            </p>
          </div>
        </div>
        <div class="text-left sm:text-right font-mono text-[11px]">
          <span class="text-slate-400 block">FECHA / HORA OFICIAL:</span>
          <strong class="text-white">${this.escaparHtml(fechaHora)}</strong>
        </div>
      </div>

      <!-- Datos de Trazabilidad: Aviario REGA, Coordenadas GPS e Inspector -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
        <div class="p-3 rounded-lg bg-slate-900 border border-slate-800">
          <span class="text-[10px] font-bold text-amber-400 uppercase block">Explotación Ganadera (REGA)</span>
          <strong class="text-sm font-mono text-white block mt-0.5">${this.escaparHtml(rega)}</strong>
          <span class="text-[11px] text-slate-400">${this.escaparHtml(acta.nombre_aviario || acta.titular_aviario || 'Aviario Asociado')}</span>
        </div>
        <div class="p-3 rounded-lg bg-slate-900 border border-slate-800">
          <span class="text-[10px] font-bold text-sky-400 uppercase block">Georreferencia GPS In Situ</span>
          <strong class="text-xs font-mono text-emerald-400 block mt-0.5">${gpsTexto}</strong>
          <span class="text-[11px] text-slate-400">Precisión satelital: ±${prec} metros</span>
        </div>
        <div class="p-3 rounded-lg bg-slate-900 border border-slate-800">
          <span class="text-[10px] font-bold text-emerald-400 uppercase block">Inspector Zootécnico Acreditado</span>
          <strong class="text-xs font-mono text-white block mt-0.5">ID/DNI: ${this.escaparHtml(inspectorId)}</strong>
          <span class="text-[11px] text-slate-400">${this.escaparHtml(inspectorNombre)}</span>
        </div>
      </div>

      <!-- Datos del Ejemplar Evaluado y Promoción en el Libro -->
      <div class="p-3.5 rounded-xl bg-slate-900 border border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <span class="text-[10px] font-bold text-slate-400 uppercase block">Ejemplar Inspeccionado</span>
          <div class="flex flex-wrap items-center gap-2 mt-0.5">
            <span class="text-sm font-black text-white font-mono">Anilla #${this.escaparHtml(acta.numero_anilla || animal?.numero_anilla || '----')}</span>
            <span class="text-xs font-mono text-amber-300">(${this.escaparHtml(acta.codigo_identificacion || animal?.codigo_identificacion || 'ESGA025')})</span>
            <span class="text-xs text-slate-300">· ${this.escaparHtml(acta.sexo || animal?.sexo || 'Macho')} · ${this.escaparHtml(acta.variedad || animal?.variedad || 'Moteada / Exchequer')}</span>
          </div>
        </div>
        <div class="text-left sm:text-right">
          <span class="text-[10px] font-bold text-slate-400 uppercase block">Promoción Libro Genealógico</span>
          <span class="inline-block mt-0.5 px-2.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-500 text-emerald-300 font-mono font-black text-xs">
            ${this.escaparHtml(acta.seccion_anterior || 'RN')} ➔ ${this.escaparHtml(acta.seccion_promovida || animal?.seccion_libro || 'RD')}
          </span>
        </div>
      </div>

      <!-- Desglose del Baremo Oficial de 100 Puntos -->
      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <h5 class="text-xs font-black text-white uppercase">Desglose del Baremo Oficial de 100 Puntos (CNZ 2025)</h5>
          <span class="text-sm font-mono font-black text-amber-400">TOTAL: ${Number(acta.puntuacion_total || 0).toFixed(1)} / 100.0 pts</span>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono">
          <div class="p-2 rounded bg-slate-900 border border-slate-800 flex justify-between"><span>1. Cabeza/Cresta:</span><strong class="text-white">${Number(acta.cabeza_cresta_cara || 0).toFixed(1)}/15</strong></div>
          <div class="p-2 rounded bg-slate-900 border border-slate-800 flex justify-between"><span>2. Cuello/Esclav.:</span><strong class="text-white">${Number(acta.cuello_esclavina || 0).toFixed(1)}/10</strong></div>
          <div class="p-2 rounded bg-slate-900 border border-slate-800 flex justify-between"><span>3. Pecho/Tronco:</span><strong class="text-white">${Number(acta.pecho_tronco || 0).toFixed(1)}/20</strong></div>
          <div class="p-2 rounded bg-slate-900 border border-slate-800 flex justify-between"><span>4. Cola 70º/Porte:</span><strong class="text-white">${Number(acta.cola_porte || 0).toFixed(1)}/20</strong></div>
          <div class="p-2 rounded bg-slate-900 border border-slate-800 flex justify-between"><span>5. Tarsos/Patas:</span><strong class="text-white">${Number(acta.extremidades_tarsos || 0).toFixed(1)}/15</strong></div>
          <div class="p-2 rounded bg-slate-900 border border-slate-800 flex justify-between"><span>6. Plumaje/Var.:</span><strong class="text-white">${Number(acta.plumaje_variedad || 0).toFixed(1)}/10</strong></div>
          <div class="p-2 rounded bg-slate-900 border border-slate-800 flex justify-between"><span>7. Peso/Desarr.:</span><strong class="text-white">${Number(acta.peso_desarrollo || 0).toFixed(1)}/10</strong></div>
          <div class="p-2 rounded bg-emerald-950/60 border border-emerald-600/60 flex justify-between"><span class="text-emerald-300">DICTAMEN:</span><strong class="text-white">${this.escaparHtml(acta.calificacion || 'Apto')}</strong></div>
        </div>
      </div>

      <!-- Checklist de Descalificaciones y Observaciones -->
      <div class="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
        <span class="text-[10px] font-bold text-rose-400 uppercase block">Taras Morfológicas / Descalificaciones Detectadas (ESGA025):</span>
        <p class="text-xs font-semibold ${defectosArr.length > 0 ? 'text-rose-300' : 'text-emerald-400'}">
          ${defectosArr.length > 0 ? '🚫 ' + defectosArr.map(d => this.escaparHtml(d)).join(' · ') : '✓ Ninguna tara descalificable detectada. Conformidad morfológica racial.'}
        </p>
        <p class="text-[11px] text-slate-300 italic pt-1 border-t border-slate-800 mt-1">
          "${this.escaparHtml(acta.observaciones || 'Sin observaciones adicionales.')}"
        </p>
      </div>

      <!-- Firma Digital Manuscrita del Inspector -->
      <div class="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-800">
        <div class="text-[11px] text-slate-400 space-y-0.5">
          <p class="font-bold text-slate-200">Validación Criptográfica y Firma Manuscrita In Situ</p>
          <p>Trigger ejecutado: <code>promover_ejemplar_inspeccion()</code></p>
          <p>Almacenamiento: IndexedDB <code>SyncQueue</code> / Supabase Storage (Base64)</p>
        </div>
        <div class="bg-slate-900 border border-slate-700 rounded-xl p-2 text-center min-w-[240px]">
          ${firmaBase64
            ? `<img src="${firmaBase64}" alt="Firma Inspector" class="h-20 mx-auto object-contain">`
            : `<div class="h-16 flex items-center justify-center text-slate-500 font-mono text-xs">Firmado: ${this.escaparHtml(inspectorId)}</div>`
          }
          <span class="block text-[10px] font-mono text-slate-400 border-t border-slate-800 pt-1 mt-1">
            Firma Oficial: ${this.escaparHtml(inspectorNombre)} (${this.escaparHtml(inspectorId)})
          </span>
        </div>
      </div>
    `;

    modal.classList.remove('hidden');
  },

  cerrarModalActaInspeccion() {
    document.getElementById('modal-acta-inspeccion')?.classList.add('hidden');
  },

  imprimirActaInspeccionActual() {
    const contenido = document.getElementById('acta-digital-printable-content');
    const acta = this.estado.inspeccionInSitu.actaSeleccionada;
    if (!contenido) return;

    const nombreArchivo = `${acta?.codigo_acta || 'Acta_Inspeccion_ESGA025'}.pdf`;

    if (typeof html2pdf !== 'undefined') {
      this.mostrarNotificacionToast(`⏳ Generando PDF del Acta Oficial (${nombreArchivo})...`, 'info');
      html2pdf()
        .set({
          margin: 10,
          filename: nombreArchivo,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, backgroundColor: '#020617', useCORS: true },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        })
        .from(contenido)
        .save()
        .then(() => {
          this.mostrarNotificacionToast(`✅ Acta descargada: ${nombreArchivo}`, 'success');
        })
        .catch(() => {
          window.print();
        });
    } else {
      window.print();
    }
  },

  // =========================================================================
  // GUÍA INTERACTIVA DE CAMPO (ASISTENTE ZOOTÉCNICO - 12 REGIONES ESGA025)
  // =========================================================================
  obtener12RegionesEstandarESGA025() {
    return [
      {
        num: 1,
        nombre: '1. Cabeza y Cráneo',
        baremo: 'Bloque 1 (Cabeza, Cresta y Cara · Máx 15p)',
        estandarGallo: 'Cabeza medianamente larga, ancha y fuerte, bien proporcionada y de porte altivo.',
        estandarGallina: 'Cabeza fina, proporcionada y de líneas suaves.',
        defectosTaras: 'Cabeza estrecha, alargada tipo cuervo o desproporcionada.',
        consejoCampo: 'Verificar anchura craneal sujetando suavemente al ejemplar de frente.'
      },
      {
        num: 2,
        nombre: '2. Cresta (5-6 Dientes)',
        baremo: 'Bloque 1 (Cabeza, Cresta y Cara · Máx 15p)',
        estandarGallo: 'Sencilla, derecha, firme, de tamaño medio a grande, rojo vivo, con 5 a 6 dientes bien definidos y espolón siguiendo la línea de la nuca sin tocarla.',
        estandarGallina: 'Sencilla, mediana, derecha o ligeramente inclinada hacia un lado en su parte posterior durante la puesta.',
        defectosTaras: 'DESCALIFICA: Cresta doble, en rosa, bifurcada, con claveles laterales o caída tapando el ojo en el gallo.',
        consejoCampo: 'Contar los dientes bien aserrados (5-6) y comprobar que no existan apéndices laterales.'
      },
      {
        num: 3,
        nombre: '3. Cara y Ojos',
        baremo: 'Bloque 1 (Cabeza, Cresta y Cara · Máx 15p)',
        estandarGallo: 'Cara lisa, roja viva sin trazas de blanco. Ojos grandes, vivos, con iris rojo anaranjado intenso.',
        estandarGallina: 'Cara roja lisa y ojos grandes de expresión vivaz con iris rojo anaranjado.',
        defectosTaras: 'DESCALIFICA: Cara blanca (invasión de esmalte en cara) o iris perlado/grisáceo/negro.',
        consejoCampo: 'Observar el iris bajo luz natural lateral para confirmar el tono rojo anaranjado.'
      },
      {
        num: 4,
        nombre: '4. Pico y Barbillas',
        baremo: 'Bloque 1 (Cabeza, Cresta y Cara · Máx 15p)',
        estandarGallo: 'Pico fuerte, bien curvado, color córneo claro a pizarra según variedad. Barbillas medianamente largas, ovaladas, finas y sin pliegues.',
        estandarGallina: 'Pico proporcionado y barbillas redondeadas, finas y de rojo intenso.',
        defectosTaras: 'DESCALIFICA: Pico cruzado, prognatismo o manchas blancas en barbillas.',
        consejoCampo: 'Comprobar el cierre simétrico de ambas mandíbulas.'
      },
      {
        num: 5,
        nombre: '5. Orejillas (Blanco Puro)',
        baremo: 'Bloque 1 (Cabeza, Cresta y Cara · Máx 15p)',
        estandarGallo: 'De tamaño mediano, almendradas, lisas, ceñidas y de color BLANCO PURO esmaltado.',
        estandarGallina: 'Ovaladas/almendradas, lisas y de color blanco puro brillante.',
        defectosTaras: 'DESCALIFICACIÓN INMEDIATA: Orejilla roja o amarilla en más de 1/3 de su superficie.',
        consejoCampo: 'Rasgo crítico ESGA025: verificar ausencia de vascularización roja o pigmento carotenoide amarillo.'
      },
      {
        num: 6,
        nombre: '6. Cuello y Esclavina',
        baremo: 'Bloque 2 (Cuello y Esclavina · Máx 10p)',
        estandarGallo: 'Cuello medianamente largo, erguido y bien arqueado. Esclavina muy abundante cubriendo bien los hombros.',
        estandarGallina: 'Cuello gracioso con esclavina bien poblada sin transiciones bruscas.',
        defectosTaras: 'DESCALIFICA: Flameado rojizo/dorado en esclavina en la variedad Moteada/Exchequer o cuello torcido.',
        consejoCampo: 'Abrir las plumas de la esclavina en ejemplares Moteados para descartar flameado oculto.'
      },
      {
        num: 7,
        nombre: '7. Dorso, Silla y Caireles',
        baremo: 'Bloque 3 y 7 (Tronco y Desarrollo · 20p + 10p)',
        estandarGallo: 'Dorso ancho en los hombros, largo y ligeramente inclinado hacia atrás. Silla ancha con abundantes caireles.',
        estandarGallina: 'Dorso ancho, largo, recto y suavemente inclinado hacia la cola.',
        defectosTaras: 'DESCALIFICA: Dorso jorobado (cifosis), desviación de columna o grupa estrecha.',
        consejoCampo: 'Palpar la línea dorsal desde los hombros hasta la rabadilla comprobando rectitud ósea.'
      },
      {
        num: 8,
        nombre: '8. Pecho y Quilla (Perfil Plano)',
        baremo: 'Bloque 3 (Pecho y Tronco · Máx 20p)',
        estandarGallo: 'Pecho de perfil RECTO Y PLANO característico de la raza Alacantina (nunca prominente ni redondeado). Quilla larga y recta.',
        estandarGallina: 'Pecho plano, profundo y bien sostenido.',
        defectosTaras: 'DESCALIFICACIÓN INMEDIATA: Pecho prominente, abombado o redondeado; quilla torcida en S.',
        consejoCampo: 'Observar al ejemplar de perfil estricto y palpar el esternón: la caída anterior del pecho debe ser recta/plana.'
      },
      {
        num: 9,
        nombre: '9. Alas y Hombros',
        baremo: 'Bloque 3 y 6 (Tronco y Plumaje · 20p + 10p)',
        estandarGallo: 'Alas grandes, fuertes, bien ceñidas al cuerpo y llevadas horizontalmente sin sobrepasar el tronco.',
        estandarGallina: 'Alas bien plegadas y pegadas a los flancos.',
        defectosTaras: 'DESCALIFICA: Ala caída, ala hendida (espacio axial abierto entre primarias y secundarias) o remeras retorcidas.',
        consejoCampo: 'Desplegar ambas alas para verificar la integridad de las plumas remeras primarias y secundarias.'
      },
      {
        num: 10,
        nombre: '10. Cola y Porte (Ángulo ≥ 70º)',
        baremo: 'Bloque 4 (Cola y Porte · Máx 20p)',
        estandarGallo: 'Cola grande, bien poblada, llevada MUY ALTA en ángulo de al menos 70º sobre la horizontal (sin llegar a cola ardilla >90º). Hoces bien curvadas.',
        estandarGallina: 'Cola bien desarrollada, ligeramente abierta en abanico y llevada a 70º sobre la horizontal.',
        defectosTaras: 'DESCALIFICACIÓN INMEDIATA: Cola llevada a menos de 70º (porte bajo), cola ardilla o cola torcida lateralmente.',
        consejoCampo: 'Evaluar al ave en reposo libre en suelo plano antes de capturarla para medir su ángulo natural de 70º.'
      },
      {
        num: 11,
        nombre: '11. Muslos y Tarsos',
        baremo: 'Bloque 5 (Extremidades y Tarsos · Máx 15p)',
        estandarGallo: 'Muslos largos, fuertes y bien visibles. Tarsos medianamente largos, gruesos, completamente desnudos de plumas y de color BLANCO ROSÁCEO.',
        estandarGallina: 'Muslos bien formados y tarsos limpios blanco-rosáceos (admite leve tono apizarrado solo en variedades melanizadas jóvenes).',
        defectosTaras: 'DESCALIFICACIÓN INMEDIATA: Tarsos amarillos, verdes o tarsos emplumados / con cañones.',
        consejoCampo: 'Inspeccionar las escamas laterales de los tarsos buscando ausencia total de pigmento amarillo y plumas.'
      },
      {
        num: 12,
        nombre: '12. Dedos y Plumaje General',
        baremo: 'Bloque 5 y 6 (Extremidades y Variedad · 15p + 10p)',
        estandarGallo: 'Cuatro (4) dedos rectos, largos y bien abiertos. Calibre anilla oficial: 20 mm. Plumaje ceñido y brillante acorde a las 7 variedades oficiales.',
        estandarGallina: 'Cuatro (4) dedos rectos y limpios. Calibre anilla oficial: 18 mm. Moteado o patrón cromático nítido.',
        defectosTaras: 'DESCALIFICA: Polidactilia (5 dedos), dedos torcidos/palmeados o colores no reconocidos en el Estándar ESGA025.',
        consejoCampo: 'Contar los 4 dedos apoyados en superficie plana y verificar calibre reglamentario de anilla (20mm Macho / 18mm Hembra).'
      }
    ];
  },

  toggleGuiaCampoInline() {
    const drawer = document.getElementById('insitu-guia-inline-drawer');
    if (!drawer) return;
    drawer.classList.toggle('hidden');
    if (!drawer.classList.contains('hidden')) {
      this.seleccionarRegionGuiaCampo(this.estado.inspeccionInSitu.regionGuiaActiva || 1);
    }
  },

  abrirRegionEnGuia(numRegion) {
    const drawer = document.getElementById('insitu-guia-inline-drawer');
    if (drawer && drawer.classList.contains('hidden')) {
      drawer.classList.remove('hidden');
    }
    this.seleccionarRegionGuiaCampo(numRegion);
    drawer?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },

  seleccionarRegionGuiaCampo(numRegion) {
    this.estado.inspeccionInSitu.regionGuiaActiva = numRegion;
    const regiones = this.obtener12RegionesEstandarESGA025();
    const reg = regiones.find(r => r.num === numRegion) || regiones[0];

    const contBotones = document.getElementById('guia-campo-botones-12');
    if (contBotones) {
      contBotones.innerHTML = regiones.map(r => {
        const activa = r.num === reg.num;
        return `
          <button type="button" onclick="app.seleccionarRegionGuiaCampo(${r.num})" class="px-2.5 py-1.5 rounded-lg text-left text-[11px] font-bold transition truncate ${activa ? 'bg-amber-400 text-slate-950 font-black shadow' : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700'}">
            ${this.escaparHtml(r.nombre)}
          </button>
        `;
      }).join('');
    }

    const contDetalle = document.getElementById('guia-campo-detalle-activa');
    if (contDetalle && reg) {
      contDetalle.innerHTML = `
        <div class="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800">
          <h4 class="text-sm font-black text-amber-400 uppercase">${this.escaparHtml(reg.nombre)}</h4>
          <span class="px-2 py-0.5 rounded bg-slate-800 text-emerald-300 font-mono text-[10px] font-bold border border-slate-700">
            ${this.escaparHtml(reg.baremo)}
          </span>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
          <div class="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
            <span class="text-[10px] font-black text-sky-400 uppercase block">♂ Estándar en Gallo (20mm):</span>
            <p class="text-slate-200 mt-0.5 leading-snug">${this.escaparHtml(reg.estandarGallo)}</p>
          </div>
          <div class="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
            <span class="text-[10px] font-black text-pink-400 uppercase block">♀ Estándar en Gallina (18mm):</span>
            <p class="text-slate-200 mt-0.5 leading-snug">${this.escaparHtml(reg.estandarGallina)}</p>
          </div>
        </div>
        <div class="p-2.5 rounded-lg bg-rose-950/40 border border-rose-800/70">
          <span class="text-[10px] font-black text-rose-400 uppercase block">🚫 Defectos y Descalificaciones (CNZ 2025):</span>
          <p class="text-rose-200 font-semibold mt-0.5">${this.escaparHtml(reg.defectosTaras)}</p>
        </div>
        <div class="p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-800/60 flex items-center gap-2">
          <i class="fa-solid fa-magnifying-glass-chart text-emerald-400 text-sm shrink-0"></i>
          <p class="text-emerald-200 text-[11px]"><strong>Inspección In Situ:</strong> ${this.escaparHtml(reg.consejoCampo)}</p>
        </div>
      `;
    }
  },

  renderizarGuiaCampo12Regiones(filtroTexto = '') {
    const grid = document.getElementById('grid-modal-guia-12-regiones');
    if (!grid) return;

    const regiones = this.obtener12RegionesEstandarESGA025();
    const filtradas = filtroTexto
      ? regiones.filter(r =>
          this.coincideTextoFlexible(r.nombre, filtroTexto) ||
          this.coincideTextoFlexible(r.estandarGallo, filtroTexto) ||
          this.coincideTextoFlexible(r.defectosTaras, filtroTexto)
        )
      : regiones;

    grid.innerHTML = filtradas.map(r => `
      <div class="p-4 rounded-xl bg-slate-950 border border-slate-800 hover:border-amber-500/50 transition space-y-2 text-xs flex flex-col justify-between">
        <div class="space-y-1.5">
          <div class="flex items-center justify-between gap-2 pb-1.5 border-b border-slate-800">
            <span class="font-black text-amber-400 text-sm">${this.escaparHtml(r.nombre)}</span>
            <span class="px-2 py-0.5 rounded bg-slate-900 text-emerald-400 font-mono text-[10px] border border-slate-800">Región #${r.num}</span>
          </div>
          <p class="text-[11px] text-slate-300"><strong class="text-sky-400">♂ Gallo:</strong> ${this.escaparHtml(r.estandarGallo)}</p>
          <p class="text-[11px] text-slate-300"><strong class="text-pink-400">♀ Gallina:</strong> ${this.escaparHtml(r.estandarGallina)}</p>
        </div>
        <div class="space-y-1.5 pt-2 border-t border-slate-900">
          <div class="p-2 rounded bg-rose-950/40 border border-rose-900/60 text-[11px] text-rose-200">
            <strong class="text-rose-400 block uppercase text-[10px]">Descalificaciones:</strong>
            ${this.escaparHtml(r.defectosTaras)}
          </div>
          <div class="text-[10px] text-emerald-300 font-medium">
            <i class="fa-solid fa-check-circle mr-1"></i>${this.escaparHtml(r.consejoCampo)}
          </div>
        </div>
      </div>
    `).join('');
  },

  abrirModalGuiaCampo() {
    this.renderizarGuiaCampo12Regiones('');
    const inp = document.getElementById('input-buscar-guia-campo');
    if (inp) inp.value = '';
    document.getElementById('modal-guia-campo')?.classList.remove('hidden');
  },

  cerrarModalGuiaCampo() {
    document.getElementById('modal-guia-campo')?.classList.add('hidden');
  },

  filtrarTarjetasGuiaCampo(texto) {
    this.renderizarGuiaCampo12Regiones(texto);
  },

  // =========================================================================
  // 12. FASE 1 V6: ARQUITECTURA DE AUTENTICACIÓN (SUPABASE AUTH), RBAC,
  //     PROMOCIÓN AUTOMÁTICA POR REGA, PANEL ADMIN Y SOLICITUD DE INSPECCIÓN
  // =========================================================================

  // Semilla oficial de Usuarios para AlacantinApp V6
  obtenerUsuariosSemillaV6() {
    return [
      {
        id: 'usr-criador-01',
        nombre: 'Juan Pérez Soler',
        email: 'juan.perez@alacantina.es',
        password_hash: 'demo1234',
        telefono: '+34 612 345 678',
        rega: 'ES030140001234',
        numero_socio: 'SOC-014',
        dni: '21456789A',
        rol: 'criador',
        explotacion_id: 'exp-01',
        latitud: 38.2671,
        longitud: -0.6983,
        created_at: '2025-01-15T09:00:00Z',
        updated_at: '2026-06-05T10:00:00Z'
      },
      {
        id: 'usr-aspirante-02',
        nombre: 'Pedro García Orts',
        email: 'pedro.garcia@alacantina.es',
        password_hash: 'demo1234',
        telefono: '+34 678 901 234',
        rega: 'TEMP-REGA-001',
        codigo_provisional: 'TEMP-REGA-001',
        numero_socio: 'NS-000',
        dni: '48321654B',
        rol: 'aspirante',
        explotacion_id: 'exp-02',
        latitud: 38.2492,
        longitud: -0.8091,
        created_at: '2026-03-10T11:30:00Z',
        updated_at: '2026-03-10T11:30:00Z'
      },
      {
        id: 'usr-inspector-03',
        nombre: 'Dr. Carles Valls',
        email: 'inspector.cnz@alacantina.es',
        password_hash: 'demo1234',
        telefono: '+34 655 112 233',
        rega: 'ES030140009999',
        numero_socio: 'INSP-CNZ-025',
        dni: '74125896C',
        rol: 'inspector',
        explotacion_id: 'exp-01',
        created_at: '2024-11-01T08:00:00Z',
        updated_at: '2026-06-05T10:00:00Z'
      },
      {
        id: 'usr-admin-04',
        nombre: 'Dirección Técnica ESGA025 (Admin)',
        email: 'admin@alacantina.es',
        password_hash: 'admin1234',
        telefono: '+34 600 998 877',
        rega: 'ES030140008888',
        numero_socio: 'DIR-ESGA025',
        dni: '21998877D',
        rol: 'administrador',
        explotacion_id: 'exp-01',
        created_at: '2024-06-01T08:00:00Z',
        updated_at: '2026-06-05T10:00:00Z'
      }
    ];
  },

  // Semilla inicial de Solicitudes de Inspección Zootécnica In Situ (V6)
  obtenerSolicitudesInspeccionSemillaV6() {
    return [
      {
        id: 'sol-insp-2026-001',
        usuario_id: 'usr-criador-01',
        criador_nombre: 'Juan Pérez Soler',
        nombre_aviario: 'Criadero El Palmeral - ESGA025',
        explotacion_id: 'exp-01',
        codigo_rega: 'ES030140001234',
        num_animales: 8,
        telefono_contacto: '+34 612 345 678',
        latitud: 38.2671,
        longitud: -0.6983,
        municipio: 'Elche (Alicante)',
        observaciones_horario: 'Disponible mañanas de 09:00 a 13:30h. Lote de 8 reproductores jóvenes (5 hembras y 3 gallos Moteada/Exchequer) listos para valoración de paso a Registro Definitivo (RD).',
        estado: 'PENDIENTE',
        created_at: '2026-06-12T08:45:00Z'
      },
      {
        id: 'sol-insp-2026-002',
        usuario_id: 'usr-aspirante-02',
        criador_nombre: 'Pedro García Orts',
        nombre_aviario: 'Aviario Sierra de Crevillent',
        explotacion_id: 'exp-02',
        codigo_rega: 'TEMP-REGA-001',
        num_animales: 5,
        telefono_contacto: '+34 678 901 234',
        latitud: 38.2485,
        longitud: -0.8087,
        municipio: 'Crevillent (Alicante)',
        observaciones_horario: 'Disponible viernes tarde y sábados por la mañana. Solicito primera inspección in situ para inscripción inicial en Registro Auxiliar (RA) / Fundacional.',
        estado: 'PENDIENTE',
        created_at: '2026-06-14T16:20:00Z'
      }
    ];
  },

  // Obtener el rol normalizado del usuario activo ('visitante' | 'aspirante' | 'criador' | 'inspector' | 'administrador')
  obtenerRolUsuarioActual() {
    const u = this.estado.usuarioActivo || this.estado.usuarioActual;
    if (this.estado.modoVisitante || !u) {
      return 'visitante';
    }
    const rol = (u.rol || 'aspirante').toLowerCase();
    if (['aspirante', 'criador', 'inspector', 'administrador', 'visitante'].includes(rol)) {
      return rol;
    }
    return 'aspirante';
  },

  // Validar si un código REGA cumple el formato oficial español: ES + 12 dígitos numéricos
  esRegaOficialValido(rega) {
    if (!rega || typeof rega !== 'string') return false;
    return /^ES\d{12}$/i.test(rega.trim());
  },

  // Formatear nombre corto con inicial del apellido (ej. "Jose Cano" -> "Jose C.")
  formatearNombreCortoPastilla(nombreCompleto, emailFallback = '') {
    const base = (nombreCompleto || '').replace(/\(.*?\)/g, '').trim();
    if (!base) {
      return (emailFallback || '').trim() || 'Usuario';
    }
    const partes = base.split(/\s+/).filter(Boolean);
    if (partes.length === 0) return (emailFallback || '').trim() || 'Usuario';
    if (partes.length === 1) return partes[0];
    if (/^(dr\.|dra\.)$/i.test(partes[0]) && partes.length >= 3) {
      return `${partes[0]} ${partes[1]} ${partes[2].charAt(0).toUpperCase()}.`;
    }
    return `${partes[0]} ${partes[1].charAt(0).toUpperCase()}.`;
  },

  // Extraer las iniciales reales del usuario autenticado (ej. "Jose C." -> "JC", "Juan Pérez" -> "JP")
  obtenerInicialesUsuario(nombreOEmail) {
    if (!nombreOEmail || typeof nombreOEmail !== 'string') return '👤';
    let limpio = nombreOEmail.replace(/\(.*?\)/g, '').replace(/^(dr\.|dra\.)\s*/i, '').trim();
    if (!limpio) return '👤';

    // Si es un email (ej. jose.cano@dominio.es), extraer de la parte local
    if (limpio.includes('@') && !limpio.includes(' ')) {
      const localPart = limpio.split('@')[0];
      const subPartes = localPart.split(/[._-]+/).filter(Boolean);
      if (subPartes.length >= 2) {
        return (subPartes[0].charAt(0) + subPartes[1].charAt(0)).toUpperCase();
      }
      return localPart.slice(0, 2).toUpperCase();
    }

    const partes = limpio.split(/\s+/).filter(Boolean);
    if (partes.length === 0) return '👤';
    if (partes.length === 1) {
      const p = partes[0].replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ0-9]/g, '');
      return (p.slice(0, 2) || 'US').toUpperCase();
    }
    const ini1 = partes[0].replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ0-9]/g, '').charAt(0) || partes[0].charAt(0);
    const ini2 = partes[1].replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ0-9]/g, '').charAt(0) || partes[1].charAt(0);
    return (ini1 + ini2).toUpperCase();
  },

  // Sincronizar objeto de usuario desde Supabase Auth (getUser / session.user) + tabla perfiles_usuarios / IndexedDB
  async sincronizarUsuarioDesdeAuth(supUser) {
    if (!supUser || !supUser.id) return null;

    const emailReal = (supUser.email || '').trim().toLowerCase();
    const meta = supUser.user_metadata || {};

    // 1. Buscar en IndexedDB local por ID o Email
    let usuariosDB = await this.db.getAll('usuarios');
    if (Array.isArray(usuariosDB) && usuariosDB.length > 0) {
      this.estado.usuarios = usuariosDB;
    }
    let perfilLocal = (this.estado.usuarios || []).find(
      u => u.id === supUser.id || (emailReal && u.email && u.email.toLowerCase() === emailReal)
    );

    // 2. Si estamos online y hay cliente Supabase, intentar leer de tabla 'perfiles_usuarios'
    let perfilRemoto = null;
    if (navigator.onLine && this.supabaseClient) {
      try {
        const { data, error } = await this.supabaseClient
          .from('perfiles_usuarios')
          .select('*')
          .eq('id', supUser.id)
          .maybeSingle();
        if (!error && data) {
          perfilRemoto = data;
        }
      } catch (e) {
        // Ignorar si la tabla aún no existe en remoto
      }
    }

    const regaCandidata = (
      perfilRemoto?.rega ||
      perfilLocal?.rega ||
      meta.rega ||
      'TEMP-REGA-001'
    ).toString().trim().toUpperCase();

    const tieneRegaOficial = this.esRegaOficialValido(regaCandidata);
    const regaFinal = tieneRegaOficial ? regaCandidata : 'TEMP-REGA-001';
    const rolBase = (perfilRemoto?.rol || perfilLocal?.rol || meta.rol || 'aspirante').toLowerCase();
    const rolFinal = (rolBase === 'aspirante' && tieneRegaOficial) ? 'criador' : rolBase;

    const perfilUnificado = {
      ...(perfilLocal || {}),
      ...(perfilRemoto || {}),
      id: supUser.id,
      nombre: perfilRemoto?.nombre || perfilLocal?.nombre || meta.nombre || meta.full_name || emailReal.split('@')[0] || 'Usuario',
      email: emailReal || perfilRemoto?.email || perfilLocal?.email || '',
      telefono: perfilRemoto?.telefono || perfilLocal?.telefono || meta.telefono || '',
      rega: regaFinal,
      codigo_provisional: tieneRegaOficial ? null : 'TEMP-REGA-001',
      numero_socio: perfilRemoto?.numero_socio || perfilLocal?.numero_socio || (tieneRegaOficial ? ('SOC-' + regaFinal.slice(-3)) : 'NS-000'),
      rol: rolFinal,
      created_at: perfilLocal?.created_at || supUser.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await this.db.put('usuarios', perfilUnificado);
    const idx = (this.estado.usuarios || []).findIndex(u => u.id === perfilUnificado.id || (emailReal && u.email?.toLowerCase() === emailReal));
    if (idx !== -1) {
      this.estado.usuarios[idx] = perfilUnificado;
    } else {
      this.estado.usuarios.push(perfilUnificado);
    }

    return perfilUnificado;
  },

  // -------------------------------------------------------------------------
  // 12.1. INICIALIZACIÓN DE SESIÓN PERSISTENTE (SUPABASE AUTH + OFFLINE)
  // -------------------------------------------------------------------------
  async inicializarSesionAuthV6() {
    this.estado.usuarioActivo = null;
    this.estado.usuarioActual = null;
    this.estado.aviario = null;
    this.estado.aviarioActivo = null;

    // 1. Comprobar si existe sesión persistida en localStorage / IndexedDB (Soporte Offline continuo)
    const rawSession = localStorage.getItem('alacantina_v6_session');
    const modoVisitanteGuardado = localStorage.getItem('alacantina_v6_modo_visitante') === 'true';

    if (rawSession) {
      try {
        const sesionLocal = JSON.parse(rawSession);
        if (sesionLocal && (sesionLocal.id || sesionLocal.email)) {
          // Cargar siempre los datos más recientes desde IndexedDB 'usuarios'
          const todosUsuariosDB = await this.db.getAll('usuarios');
          if (Array.isArray(todosUsuariosDB) && todosUsuariosDB.length > 0) {
            this.estado.usuarios = todosUsuariosDB;
          }
          const usuarioEnDB = (this.estado.usuarios || []).find(
            u => (sesionLocal.id && u.id === sesionLocal.id) ||
                 (u.email && sesionLocal.email && u.email.toLowerCase() === sesionLocal.email.toLowerCase())
          );
          const usuarioRestaurado = usuarioEnDB ? { ...sesionLocal, ...usuarioEnDB } : sesionLocal;

          this.estado.usuarioActivo = usuarioRestaurado;
          this.estado.usuarioActual = usuarioRestaurado;
          this.estado.modoVisitante = false;
          localStorage.setItem('alacantina_v6_session', JSON.stringify(usuarioRestaurado));
          console.log(`[Auth V6] Sesión persistente restaurada (${navigator.onLine ? 'Online' : 'Offline'}):`, usuarioRestaurado.nombre || usuarioRestaurado.email, '- Rol:', usuarioRestaurado.rol);
        }
      } catch (e) {
        console.warn('[Auth V6] Error al leer sesión local:', e);
      }
    }

    // 2. Si hay cliente Supabase configurado y estamos online, verificar token real con supabase.auth.getUser() / getSession()
    if (navigator.onLine && this.supabaseClient && this.supabaseClient.auth) {
      try {
        let supUser = null;
        if (typeof this.supabaseClient.auth.getUser === 'function') {
          const { data: userData } = await this.supabaseClient.auth.getUser();
          if (userData && userData.user) {
            supUser = userData.user;
          }
        }
        if (!supUser && typeof this.supabaseClient.auth.getSession === 'function') {
          const { data: sessionData } = await this.supabaseClient.auth.getSession();
          if (sessionData?.session?.user) {
            supUser = sessionData.session.user;
          }
        }

        if (supUser) {
          const perfilSincronizado = await this.sincronizarUsuarioDesdeAuth(supUser);
          if (perfilSincronizado) {
            this.estado.usuarioActivo = perfilSincronizado;
            this.estado.usuarioActual = perfilSincronizado;
            this.estado.modoVisitante = false;
            localStorage.setItem('alacantina_v6_session', JSON.stringify(perfilSincronizado));
            localStorage.removeItem('alacantina_v6_modo_visitante');
          }
        }
      } catch (err) {
        console.warn('[Supabase Auth] Continuando con sesión persistente en dispositivo:', err);
      }
    }

    // 3. Si existe una sesión persistente válida, sincronizar su rol y actualizar la pastilla de inmediato
    const usuarioActivo = this.estado.usuarioActivo || this.estado.usuarioActual;
    if (usuarioActivo) {
      this.estado.usuarioActivo = usuarioActivo;
      this.estado.usuarioActual = usuarioActivo;
      this.estado.inspeccionInSitu.rolRBAC = this.obtenerRolUsuarioActual();
      this.actualizarPastillaUsuario();
      this.sincronizarInputsInspectorAutenticado();
      this.cerrarModalAuthAcceso();
      return;
    }

    // 4. Si no hay sesión activa: limpiar aviario / aviarioActivo y mostrar la pastilla con "👤 Visitante (Modo Lectura)"
    this.estado.usuarioActivo = null;
    this.estado.usuarioActual = null;
    this.estado.aviario = null;
    this.estado.aviarioActivo = null;
    this.estado.modoVisitante = true;
    this.estado.inspeccionInSitu.rolRBAC = 'visitante';
    this.actualizarPastillaUsuario();
    this.sincronizarInputsInspectorAutenticado();

    if (modoVisitanteGuardado) {
      this.cerrarModalAuthAcceso();
      return;
    }

    // 5. Si NO había sesión ni eligió visitante aún -> Mostrar Modal de Login/Acceso (#modal-auth-acceso)
    this.abrirModalAuthAcceso('login');
  },

  abrirModalAuthAcceso(tab = 'login') {
    const modal = document.getElementById('modal-auth-acceso');
    if (!modal) return;
    modal.classList.remove('hidden');
    this.cambiarTabModalAuth(tab);
  },

  cerrarModalAuthAcceso() {
    const modal = document.getElementById('modal-auth-acceso');
    if (modal) modal.classList.add('hidden');
  },

  cambiarTabModalAuth(tab = 'login') {
    const formLogin = document.getElementById('form-auth-login');
    const formRegister = document.getElementById('form-auth-register');
    const btnLogin = document.getElementById('btn-auth-tab-login') || document.getElementById('auth-tab-btn-login');
    const btnRegister = document.getElementById('btn-auth-tab-register') || document.getElementById('auth-tab-btn-register');
    const errBox = document.getElementById('auth-feedback-box') || document.getElementById('auth-error-msg');
    if (errBox) errBox.classList.add('hidden');

    if (tab === 'register') {
      formLogin?.classList.add('hidden');
      formRegister?.classList.remove('hidden');
      if (btnRegister) {
        btnRegister.className = 'py-2 px-3 rounded-lg text-xs font-extrabold transition bg-emerald-500 text-slate-950 shadow';
      }
      if (btnLogin) {
        btnLogin.className = 'py-2 px-3 rounded-lg text-xs font-bold transition text-slate-400 hover:text-white';
      }
    } else {
      formRegister?.classList.add('hidden');
      formLogin?.classList.remove('hidden');
      if (btnLogin) {
        btnLogin.className = 'py-2 px-3 rounded-lg text-xs font-extrabold transition bg-amber-500 text-slate-950 shadow';
      }
      if (btnRegister) {
        btnRegister.className = 'py-2 px-3 rounded-lg text-xs font-bold transition text-slate-400 hover:text-white';
      }
    }
  },

  mostrarErrorAuthModal(mensaje) {
    const errBox = document.getElementById('auth-feedback-box') || document.getElementById('auth-error-msg');
    if (!errBox) {
      alert(mensaje);
      return;
    }
    errBox.textContent = mensaje;
    errBox.className = 'p-3 rounded-xl text-xs font-semibold border bg-rose-950/80 border-rose-700 text-rose-200';
    errBox.classList.remove('hidden');
  },

  // [ Iniciar Sesión ]: Email + Contraseña con persistencia en dispositivo y Supabase Auth
  async iniciarSesionUsuario(event) {
    if (event) event.preventDefault();
    const email = (document.getElementById('auth-login-email')?.value || '').trim().toLowerCase();
    const password = (document.getElementById('auth-login-password')?.value || '').trim();
    const recordar = document.getElementById('auth-login-remember')?.checked !== false;

    if (!email || !password) {
      this.mostrarErrorAuthModal('Por favor, introduce tu correo electrónico y contraseña.');
      return;
    }

    let usuarioAutenticado = null;

    // 1. Intentar autenticar contra Supabase Auth si está configurado y online
    if (navigator.onLine && this.supabaseClient && this.supabaseClient.auth) {
      try {
        const { data, error } = await this.supabaseClient.auth.signInWithPassword({
          email,
          password
        });
        if (!error && data?.user) {
          usuarioAutenticado = await this.sincronizarUsuarioDesdeAuth(data.user);
        }
      } catch (err) {
        console.warn('[Supabase Auth] Fallback a verificación local IndexedDB:', err);
      }
    }

    // 2. Verificar en la base de datos local IndexedDB ('usuarios')
    if (!usuarioAutenticado) {
      const todosDB = await this.db.getAll('usuarios');
      if (Array.isArray(todosDB) && todosDB.length > 0) {
        this.estado.usuarios = todosDB;
      }
      const encontrado = (this.estado.usuarios || []).find(
        u => (u.email || '').toLowerCase() === email
      );
      if (!encontrado) {
        this.mostrarErrorAuthModal('No existe ninguna cuenta registrada con ese correo electrónico. Puedes darte de alta en la pestaña [ Registrarse ].');
        return;
      }
      if (encontrado.password_hash && encontrado.password_hash !== password) {
        this.mostrarErrorAuthModal('Contraseña incorrecta. Verifica tus credenciales o utiliza los botones de acceso rápido.');
        return;
      }
      usuarioAutenticado = encontrado;
    }

    await this.activarSesionUsuario(usuarioAutenticado, recordar);
    this.mostrarNotificacionToast(`🔐 Sesión iniciada: ${usuarioAutenticado.nombre || usuarioAutenticado.email}`, 'success');
  },

  // [ Registrarse ]: Alta rápida de nuevo usuario (Nombre, Email, Contraseña) -> Inicia como "Aspirante" (NS-000 / TEMP-REGA-001)
  async registrarNuevoUsuario(event) {
    if (event) event.preventDefault();
    const nombre = (document.getElementById('auth-reg-nombre')?.value || '').trim();
    const email = (document.getElementById('auth-reg-email')?.value || '').trim().toLowerCase();
    const password = (document.getElementById('auth-reg-password')?.value || '').trim();
    const telefono = (document.getElementById('auth-reg-telefono')?.value || '').trim();

    if (!nombre || !email || !password) {
      this.mostrarErrorAuthModal('Por favor, completa Nombre, Email y Contraseña para registrarte.');
      return;
    }

    if (password.length < 6) {
      this.mostrarErrorAuthModal('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    const todosDB = await this.db.getAll('usuarios');
    if (Array.isArray(todosDB) && todosDB.length > 0) {
      this.estado.usuarios = todosDB;
    }

    // Comprobar si el email ya está registrado
    const yaExiste = (this.estado.usuarios || []).some(u => (u.email || '').toLowerCase() === email);
    if (yaExiste) {
      this.mostrarErrorAuthModal('Este correo electrónico ya está registrado. Pulsa en [ Iniciar Sesión ] para acceder.');
      return;
    }

    let nuevoId = 'usr-' + Date.now();

    // 1. Registrar en Supabase Auth si hay conexión y cliente configurado
    if (navigator.onLine && this.supabaseClient && this.supabaseClient.auth) {
      try {
        const { data, error } = await this.supabaseClient.auth.signUp({
          email,
          password,
          options: {
            data: {
              nombre,
              telefono,
              rol: 'aspirante',
              rega: 'TEMP-REGA-001',
              codigo_provisional: 'TEMP-REGA-001'
            }
          }
        });
        if (!error && data?.user?.id) {
          nuevoId = data.user.id;
        }
      } catch (err) {
        console.warn('[Supabase Auth] Registro offline en IndexedDB:', err);
      }
    }

    // 2. Crear una explotación provisional vinculada estrictamente al nuevo Aspirante (sin coordenadas GPS estáticas de prueba)
    const nuevaExpId = 'exp-asp-' + Date.now();
    const nuevaExpAspirante = {
      id: nuevaExpId,
      usuario_id: nuevoId,
      codigo_rega: 'TEMP-REGA-001',
      rega: 'TEMP-REGA-001',
      numero_socio: 'NS-000',
      nombre_titular: nombre,
      nombre_criadero: `Aviario de ${nombre}`,
      municipio: 'Alicante',
      provincia: 'Alicante',
      telefono: telefono || '',
      latitud: null,
      longitud: null,
      geolocalizacion_precision: null,
      activo: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await this.db.put('explotaciones', nuevaExpAspirante);

    // 3. Todo nuevo usuario registrado inicia automáticamente con el rol "Aspirante" (NS-000 / TEMP-REGA-001)
    const nuevoUsuario = {
      id: nuevoId,
      nombre: nombre,
      email: email,
      password_hash: password,
      telefono: telefono || '',
      rega: 'TEMP-REGA-001',
      codigo_provisional: 'TEMP-REGA-001',
      numero_socio: 'NS-000',
      rol: 'aspirante',
      explotacion_id: nuevaExpId,
      latitud: null,
      longitud: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await this.db.put('usuarios', nuevoUsuario);
    if (!Array.isArray(this.estado.usuarios)) this.estado.usuarios = [];
    this.estado.usuarios.push(nuevoUsuario);

    // Sincronizar con Supabase o encolar en SyncQueue
    await this.sincronizarPerfilUsuarioSupabase(nuevoUsuario, 'USUARIO_PERFIL');

    // Activar sesión inmediatamente (filtrando y aislando todos los almacenes de IndexedDB para este nuevo usuario)
    await this.activarSesionUsuario(nuevoUsuario, true);

    this.mostrarNotificacionToast(`🟡 Cuenta creada como Aspirante (NS-000): ${nombre}`, 'info');
  },

  // Acceso rápido con cuentas semilla para evaluación inmediata de los 4 roles
  async loginRapidoDemo(tipoRol) {
    const mapaEmails = {
      criador: 'juan.perez@alacantina.es',
      aspirante: 'pedro.garcia@alacantina.es',
      inspector: 'inspector.cnz@alacantina.es',
      administrador: 'admin@alacantina.es'
    };
    const emailBuscado = mapaEmails[tipoRol];
    const todosDB = await this.db.getAll('usuarios');
    if (Array.isArray(todosDB) && todosDB.length > 0) {
      this.estado.usuarios = todosDB;
    }
    let usuario = (this.estado.usuarios || []).find(u => u.email === emailBuscado || u.rol === tipoRol);

    if (!usuario) {
      const semillas = this.obtenerUsuariosSemillaV6();
      usuario = semillas.find(u => u.rol === tipoRol) || semillas[0];
      await this.db.put('usuarios', usuario);
      this.estado.usuarios.push(usuario);
    }

    await this.activarSesionUsuario(usuario, true);
    this.mostrarNotificacionToast(`✅ Sesión iniciada como ${this.obtenerEtiquetaRol(usuario.rol, this.esRegaOficialValido(usuario.rega))}: ${usuario.nombre}`, 'success');
  },

  // Activar sesión de usuario en estado, aislar sus datos en IndexedDB y sobreescribir app.estado.aviario dinámicamente
  async activarSesionUsuario(usuario, persistir = true) {
    if (!usuario) return;

    // 1. Asegurar sincronización con IndexedDB para este ID de usuario
    const todosUsuariosDB = await this.db.getAll('usuarios');
    const enDB = (todosUsuariosDB || []).find(
      u => u.id === usuario.id || (u.email && usuario.email && u.email.toLowerCase() === usuario.email.toLowerCase())
    );
    const usuarioFinal = enDB ? { ...enDB, ...usuario } : usuario;

    // 2. Reiniciar estado en memoria antes de hidratar la nueva cuenta para evitar contaminación entre sesiones
    this.estado = {};
    Object.assign(this.estado, this.obtenerEstadoInicialLimpio());

    this.estado.usuarioActivo = usuarioFinal;
    this.estado.usuarioActual = usuarioFinal;
    this.estado.modoVisitante = false;
    this.estado.inspeccionInSitu.rolRBAC = this.obtenerRolUsuarioActual();

    if (persistir) {
      localStorage.setItem('alacantina_v6_session', JSON.stringify(usuarioFinal));
    }
    localStorage.removeItem('alacantina_v6_modo_visitante');
    sessionStorage.removeItem('alacantina_modo_visitante');

    // 3. Cargar datos desde IndexedDB filtrados estrictamente por el user.id autenticado e inicializar su aviario propio
    await this.cargarDatos();
    await this.inicializarAviarioActivo();
    await this.cargarDatos();

    // 4. Sincronizar datos dinámicos del Inspector en las vistas de calificación y actas
    this.sincronizarInputsInspectorAutenticado();

    // 5. Actualizar interfaz completa con los datos aislados del usuario activo
    this.cerrarModalAuthAcceso();
    this.poblarSelectores();
    this.actualizarBadgeAviario();
    this.actualizarVistaRegistroAviario();
    this.actualizarPastillaUsuario();
    this.aplicarPermisosRBAC();
    this.renderizarCenso();
    this.actualizarKPIs();
    this.renderizarLotes();
    this.poblarSelectoresAnaliticaPuesta();
    this.renderizarAnaliticaPuesta();
    this.renderizarTablaHistorialPuesta();
    this.poblarSelectoresInSitu();
    this.renderizarHistorialActasInSitu();
    this.renderizarSolicitudesInspeccion();
    this.renderizarTablaUsuariosAdmin();

    // Redirigir a la vista más adecuada según el rol
    const rol = this.obtenerRolUsuarioActual();
    if (rol === 'administrador') {
      this.cambiarTab('admin');
    } else if (rol === 'inspector') {
      this.cambiarTab('inspeccion-insitu');
    } else {
      this.cambiarTab('censo');
    }
  },

  // [ Entrar como Visitante ]: Acceso de solo lectura al Estándar Racial ESGA025, Guía de Campo y Censo Público
  async entrarComoVisitante() {
    this.estado = {};
    Object.assign(this.estado, this.obtenerEstadoInicialLimpio());
    this.estado.modoVisitante = true;
    this.estado.inspeccionInSitu.rolRBAC = 'visitante';

    localStorage.removeItem('alacantina_v6_session');
    localStorage.removeItem('alacantina_aviario_activo_id');
    localStorage.removeItem('alacantina_aviario_activo_datos');
    localStorage.setItem('alacantina_v6_modo_visitante', 'true');
    sessionStorage.setItem('alacantina_modo_visitante', 'true');

    await this.cargarDatos();
    this.sincronizarInputsInspectorAutenticado();

    this.cerrarModalAuthAcceso();
    this.cerrarMenuMiCuenta();
    this.poblarSelectores();
    this.actualizarBadgeAviario();
    this.actualizarVistaRegistroAviario();
    this.actualizarPastillaUsuario();
    this.aplicarPermisosRBAC();
    this.renderizarCenso();
    this.actualizarKPIs();
    this.renderizarLotes();
    this.poblarSelectoresAnaliticaPuesta();
    this.renderizarAnaliticaPuesta();
    this.cambiarTab('censo');

    this.mostrarNotificacionToast('👤 Visitante (Modo Lectura): Censo Público, Pedigrí y Guía ESGA025', 'info');
  },

  // 2. PURGA DE MEMORIA Y AISLAMIENTO EN LOGOUT (LOGOUT PURGE & MULTI-ACCOUNT)
  async cerrarSesion() {
    if (navigator.onLine && this.supabaseClient && this.supabaseClient.auth) {
      try {
        await this.supabaseClient.auth.signOut();
      } catch (e) {
        console.warn('[Supabase Auth] signOut local:', e);
      }
    }

    // 1. Reiniciar por completo el objeto en memoria (app.estado = {}) y rehidratar estructura limpia vacía
    this.estado = {};
    Object.assign(this.estado, this.obtenerEstadoInicialLimpio());
    this.estado.modoVisitante = true;
    this.estado.inspeccionInSitu.rolRBAC = 'visitante';

    // 2. Purgar claves de sesión y aviario activo en localStorage / sessionStorage
    localStorage.removeItem('alacantina_v6_session');
    localStorage.removeItem('alacantina_v6_modo_visitante');
    localStorage.removeItem('alacantina_aviario_activo_id');
    localStorage.removeItem('alacantina_aviario_activo_datos');
    sessionStorage.removeItem('alacantina_modo_visitante');

    this.cerrarMenuMiCuenta();
    this.cerrarModalMiCuenta();

    // 3. Limpiar formularios, tablas, selectores y firma en el DOM para que no queden rastros del usuario anterior
    this.limpiarFirmaInspector();
    this.sincronizarInputsInspectorAutenticado();

    const tbodyCenso = document.getElementById('tabla-censo-body');
    if (tbodyCenso) {
      tbodyCenso.innerHTML = '<tr><td colspan="7" class="px-4 py-8 text-center text-slate-500 text-xs">Sin sesión activa. Inicia sesión o entra en Modo Visitante para consultar el censo.</td></tr>';
    }
    const lotesCont = document.getElementById('lista-lotes-container');
    if (lotesCont) {
      lotesCont.innerHTML = '<p class="text-xs text-slate-500">Sin sesión activa. Inicia sesión para gestionar tus lotes de apareamiento.</p>';
    }
    const tbodyPuesta = document.getElementById('tabla-historial-puesta-body');
    if (tbodyPuesta) {
      tbodyPuesta.innerHTML = '<tr><td colspan="6" class="px-4 py-6 text-center text-slate-500 text-xs">Sin sesión activa.</td></tr>';
    }

    // 4. Vaciar los elementos del DOM de la cabecera y restablecer la vista a "Visitante / Sin Sesión"
    this.poblarSelectores();
    this.poblarSelectoresAnaliticaPuesta();
    this.renderizarAnaliticaPuesta();
    this.actualizarKPIs();
    this.actualizarPastillaUsuario();
    this.actualizarBadgeAviario();
    this.actualizarVistaRegistroAviario();
    this.aplicarPermisosRBAC();

    // 5. Abrir el modal de Login/Acceso (#modal-auth-acceso)
    this.abrirModalAuthAcceso('login');
    this.mostrarNotificacionToast('🚪 Sesión cerrada y memoria purgada. Vista restablecida a Visitante / Sin Sesión.', 'info');
  },

  // -------------------------------------------------------------------------
  // 12.2. PASTILLA/AVATAR DE USUARIO EN CABECERA Y MENÚ "MI CUENTA" (DINÁMICO)
  // -------------------------------------------------------------------------
  obtenerEtiquetaRol(rol, tieneRegaOficial = false) {
    const r = (rol || '').toLowerCase();
    if (r === 'administrador') return 'Administrador';
    if (r === 'inspector') return 'Inspector Zootécnico';
    if (r === 'criador' && tieneRegaOficial) return 'Criador Oficial';
    if (r === 'criador' && !tieneRegaOficial) return 'Aspirante (NS-000)';
    if (r === 'aspirante') return 'Aspirante (NS-000)';
    if (r === 'visitante') return 'Visitante (Modo Lectura)';
    return 'Aspirante (NS-000)';
  },

  // Alias explícito para compatibilidad con llamadas a app.renderizarMenuCuenta()
  renderizarMenuCuenta() {
    this.actualizarPastillaUsuario();
  },

  // Renderizado 100% dinámico de la pastilla de cabecera y menú desplegable "Mi Cuenta" sin datos mock
  actualizarPastillaUsuario() {
    // Sincronizar referencia entre usuarioActivo y usuarioActual
    const u = this.estado.usuarioActivo || this.estado.usuarioActual;
    if (u) {
      this.estado.usuarioActivo = u;
      this.estado.usuarioActual = u;
    }

    const rol = this.obtenerRolUsuarioActual();

    // Elementos principales del DOM en la pastilla de cabecera (#user-avatar-pill)
    const pillBtn = document.getElementById('user-avatar-pill');
    const avatarInicialesEl = document.getElementById('user-avatar-iniciales') || document.getElementById('user-pill-initials');
    const nombreDisplayEl = document.getElementById('user-nombre-display') || document.getElementById('user-pill-status-text');
    const rolDisplayEl = document.getElementById('user-rol-display') || document.getElementById('user-pill-role-sub');
    const regaDisplayEl = document.getElementById('user-rega-display');

    // Elementos del menú desplegable (#dropdown-mi-cuenta)
    const dropInitials = document.getElementById('dropdown-user-initials');
    const dropNombre = document.getElementById('dropdown-user-nombre') || document.getElementById('dropdown-cuenta-nombre');
    const dropEmail = document.getElementById('dropdown-user-email') || document.getElementById('dropdown-cuenta-email');
    const dropRolBadge = document.getElementById('dropdown-user-rol-badge') || document.getElementById('dropdown-cuenta-rol-badge');
    const dropRega = document.getElementById('dropdown-user-rega') || document.getElementById('dropdown-cuenta-rega-badge');
    const dropSocio = document.getElementById('dropdown-user-socio');
    const dropTelefono = document.getElementById('dropdown-user-telefono');
    const boxAccionesAuth = document.getElementById('dropdown-acciones-autenticado');
    const boxAccionesVis = document.getElementById('dropdown-acciones-visitante');

    // CASO 1: Sin sesión activa o en Modo Visitante -> Estado "👤 Visitante (Modo Lectura)" / "Sin Sesión / Visitante"
    if (!u || rol === 'visitante') {
      if (avatarInicialesEl) {
        avatarInicialesEl.textContent = '👤';
        avatarInicialesEl.className = 'h-7 w-7 rounded-full bg-slate-800 border border-slate-600 text-slate-300 font-black text-xs flex items-center justify-center shadow-inner shrink-0';
      }
      if (nombreDisplayEl) {
        nombreDisplayEl.textContent = '👤 Visitante (Modo Lectura)';
        nombreDisplayEl.className = 'block text-[11px] sm:text-xs font-bold text-slate-200 truncate';
      }
      if (rolDisplayEl) {
        rolDisplayEl.textContent = 'Sin Sesión / Visitante';
        rolDisplayEl.className = 'text-[9px] font-mono text-slate-400 truncate';
      }
      if (regaDisplayEl) {
        regaDisplayEl.textContent = '';
        regaDisplayEl.classList.add('hidden');
      }
      if (pillBtn) {
        pillBtn.className = 'flex items-center gap-2 pl-1.5 pr-3 py-1 rounded-full bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-amber-400 transition shadow-md group';
      }

      // Limpiar y restaurar el menú desplegable a estado Visitante
      if (dropInitials) {
        dropInitials.textContent = '👤';
        dropInitials.className = 'h-11 w-11 rounded-full bg-slate-800 border border-slate-600 text-slate-300 font-black text-sm flex items-center justify-center shrink-0';
      }
      if (dropNombre) dropNombre.textContent = 'Visitante (Modo Lectura)';
      if (dropEmail) dropEmail.textContent = 'Sin sesión activa';
      if (dropRolBadge) {
        dropRolBadge.textContent = 'Visitante (Modo Lectura)';
        dropRolBadge.className = 'inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700';
      }
      if (dropRega) {
        dropRega.textContent = 'Sin Sesión';
        dropRega.className = 'font-bold text-slate-400';
      }
      if (dropSocio) dropSocio.textContent = 'NS-000';
      if (dropTelefono) dropTelefono.textContent = 'No registrado';
      if (boxAccionesAuth) boxAccionesAuth.classList.add('hidden');
      if (boxAccionesVis) boxAccionesVis.classList.remove('hidden');
      return;
    }

    // CASO 2: Usuario Autenticado -> Renderizar exclusivamente los datos reales de su sesión
    const nombreReal = (u.nombre || '').trim() || (u.email || '').trim() || 'Usuario';
    const emailReal = (u.email || '').trim() || 'Sin email registrado';
    const iniciales = this.obtenerInicialesUsuario(u.nombre || u.email);
    const nombreCorto = this.formatearNombreCortoPastilla(u.nombre, u.email);

    // Evaluar código REGA real del usuario activo (sin ningún REGA estático por defecto)
    const regaGuardada = (u.rega || '').toString().trim().toUpperCase();
    const tieneRegaOficial = this.esRegaOficialValido(regaGuardada);
    const regaMostrar = tieneRegaOficial ? regaGuardada : 'TEMP-REGA-001';
    const socioMostrar = u.numero_socio || (tieneRegaOficial ? ('SOC-' + regaMostrar.slice(-3)) : 'NS-000');
    const telefonoMostrar = (u.telefono || '').trim() || 'No registrado';

    // Determinar Badge de Rol y Estado según el rol real en Supabase/IndexedDB y la validez del REGA
    let etiquetaRol = '';
    let iconoEstado = '🟢';
    let claseAvatar = '';
    let clasePillBorder = '';
    let claseRolBadgeDropdown = '';

    if (rol === 'administrador') {
      etiquetaRol = 'Administrador';
      iconoEstado = '🟢';
      claseAvatar = 'h-7 w-7 rounded-full bg-purple-500/25 border border-purple-400 text-purple-200 font-black text-xs flex items-center justify-center shadow-inner shrink-0';
      clasePillBorder = 'border-purple-500/50 hover:border-purple-400';
      claseRolBadgeDropdown = 'inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold bg-purple-950 text-purple-300 border border-purple-700';
    } else if (rol === 'inspector') {
      etiquetaRol = 'Inspector Zootécnico';
      iconoEstado = '🟢';
      claseAvatar = 'h-7 w-7 rounded-full bg-sky-500/25 border border-sky-400 text-sky-200 font-black text-xs flex items-center justify-center shadow-inner shrink-0';
      clasePillBorder = 'border-sky-500/50 hover:border-sky-400';
      claseRolBadgeDropdown = 'inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold bg-sky-950 text-sky-300 border border-sky-700';
    } else if (rol === 'criador' && tieneRegaOficial) {
      etiquetaRol = 'Criador Oficial';
      iconoEstado = '🟢';
      claseAvatar = 'h-7 w-7 rounded-full bg-emerald-500/25 border border-emerald-400 text-emerald-200 font-black text-xs flex items-center justify-center shadow-inner shrink-0';
      clasePillBorder = 'border-emerald-500/50 hover:border-emerald-400';
      claseRolBadgeDropdown = 'inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-700';
    } else {
      // Si es 'aspirante' o no dispone de REGA oficial válido -> "Aspirante (NS-000)"
      etiquetaRol = 'Aspirante (NS-000)';
      iconoEstado = '🟡';
      claseAvatar = 'h-7 w-7 rounded-full bg-amber-500/25 border border-amber-400 text-amber-200 font-black text-xs flex items-center justify-center shadow-inner shrink-0';
      clasePillBorder = 'border-amber-500/50 hover:border-amber-400';
      claseRolBadgeDropdown = 'inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-700';
    }

    // 1. Iniciales del Avatar (#user-avatar-iniciales)
    if (avatarInicialesEl) {
      avatarInicialesEl.textContent = iniciales;
      avatarInicialesEl.className = claseAvatar;
    }

    // 2. Nombre a Mostrar (#user-nombre-display)
    if (nombreDisplayEl) {
      nombreDisplayEl.textContent = `${iconoEstado} ${nombreCorto} - ${regaMostrar}`;
      nombreDisplayEl.title = `${nombreReal} (${emailReal})`;
      nombreDisplayEl.className = 'block text-[11px] sm:text-xs font-bold text-white truncate';
    }

    // 3. Badge de Rol y Estado (#user-rol-display)
    if (rolDisplayEl) {
      rolDisplayEl.textContent = etiquetaRol;
      rolDisplayEl.className = tieneRegaOficial
        ? 'text-[9px] font-mono text-emerald-300 truncate'
        : 'text-[9px] font-mono text-amber-300 truncate';
    }

    // 4. Código REGA / Estado (#user-rega-display) en tono verde si es oficial o amarillo/naranja si es TEMP-REGA-001
    if (regaDisplayEl) {
      regaDisplayEl.textContent = regaMostrar;
      regaDisplayEl.className = tieneRegaOficial
        ? 'text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-emerald-950/90 text-emerald-300 border border-emerald-700/70'
        : 'text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-amber-950/90 text-amber-300 border border-amber-600/70';
      regaDisplayEl.classList.remove('hidden');
    }

    if (pillBtn) {
      pillBtn.className = `flex items-center gap-2 pl-1.5 pr-3 py-1 rounded-full bg-slate-800/95 hover:bg-slate-800 border ${clasePillBorder} transition shadow-md group`;
    }

    // 5. Actualizar elementos del menú desplegable "Mi Cuenta" (#dropdown-mi-cuenta)
    if (dropInitials) {
      dropInitials.textContent = iniciales;
      dropInitials.className = tieneRegaOficial
        ? 'h-11 w-11 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-slate-950 font-black text-sm flex items-center justify-center shrink-0'
        : 'h-11 w-11 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 text-slate-950 font-black text-sm flex items-center justify-center shrink-0';
    }
    if (dropNombre) dropNombre.textContent = nombreReal;
    if (dropEmail) dropEmail.textContent = emailReal;
    if (dropRolBadge) {
      dropRolBadge.textContent = etiquetaRol;
      dropRolBadge.className = claseRolBadgeDropdown;
    }
    if (dropRega) {
      dropRega.textContent = tieneRegaOficial ? regaMostrar : `${regaMostrar} (En trámite)`;
      dropRega.className = tieneRegaOficial ? 'font-bold text-emerald-400' : 'font-bold text-amber-400';
    }
    if (dropSocio) {
      dropSocio.textContent = socioMostrar;
      dropSocio.className = tieneRegaOficial ? 'font-bold text-sky-400' : 'font-bold text-amber-300';
    }
    if (dropTelefono) {
      dropTelefono.textContent = telefonoMostrar;
    }
    if (boxAccionesAuth) boxAccionesAuth.classList.remove('hidden');
    if (boxAccionesVis) boxAccionesVis.classList.add('hidden');
  },

  toggleMenuMiCuenta(event) {
    if (event) event.stopPropagation();
    const dropdown = document.getElementById('dropdown-mi-cuenta');
    if (dropdown) {
      this.actualizarPastillaUsuario();
      dropdown.classList.toggle('hidden');
    }
  },

  cerrarMenuMiCuenta() {
    const dropdown = document.getElementById('dropdown-mi-cuenta');
    if (dropdown) dropdown.classList.add('hidden');
  },

  // 2. VINCULACIÓN CON EL MODAL "MI CUENTA" (#modal-mi-cuenta)
  async abrirModalMiCuenta(focoSeccion = 'perfil') {
    this.cerrarMenuMiCuenta();

    let u = this.estado.usuarioActivo || this.estado.usuarioActual;
    if (!u || this.estado.modoVisitante) {
      this.abrirModalAuthAcceso('login');
      return;
    }

    // Cargar los valores reales más recientes guardados en IndexedDB / Supabase para el ID del usuario con sesión activa
    try {
      const usuariosDB = await this.db.getAll('usuarios');
      if (Array.isArray(usuariosDB) && usuariosDB.length > 0) {
        this.estado.usuarios = usuariosDB;
        const fresco = usuariosDB.find(item => item.id === u.id || (item.email && u.email && item.email.toLowerCase() === u.email.toLowerCase()));
        if (fresco) {
          u = { ...u, ...fresco };
          this.estado.usuarioActivo = u;
          this.estado.usuarioActual = u;
        }
      }
    } catch (e) {
      console.warn('[Mi Cuenta] Error al refrescar perfil desde IndexedDB:', e);
    }

    const rol = this.obtenerRolUsuarioActual();
    const regaRaw = (u.rega || '').toString().trim().toUpperCase();
    const tieneRegaOficial = this.esRegaOficialValido(regaRaw);
    const regaMostrar = tieneRegaOficial ? regaRaw : 'TEMP-REGA-001';
    const socioMostrar = u.numero_socio || (tieneRegaOficial ? ('SOC-' + regaMostrar.slice(-3)) : 'NS-000');
    const etiquetaRol = this.obtenerEtiquetaRol(rol, tieneRegaOficial);

    // Actualizar cabecera del modal #modal-mi-cuenta
    const avatarEl = document.getElementById('mi-cuenta-avatar') || document.getElementById('mi-cuenta-avatar-lg');
    const nombreHeaderEl = document.getElementById('mi-cuenta-header-nombre');
    const emailHeaderEl = document.getElementById('mi-cuenta-email-sub') || document.getElementById('mi-cuenta-header-email');
    const rolBadgeEl = document.getElementById('mi-cuenta-rol-badge') || document.getElementById('mi-cuenta-header-rol-pill');

    if (avatarEl) {
      avatarEl.textContent = this.obtenerInicialesUsuario(u.nombre || u.email);
    }
    if (nombreHeaderEl) {
      nombreHeaderEl.textContent = u.nombre || u.email || 'Mi Cuenta Zootécnica';
    }
    if (emailHeaderEl) {
      emailHeaderEl.textContent = u.email || '';
    }
    if (rolBadgeEl) {
      rolBadgeEl.textContent = etiquetaRol;
      rolBadgeEl.className = (rol === 'aspirante' || (!tieneRegaOficial && rol === 'criador'))
        ? 'px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-700'
        : 'px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-700';
    }

    // Autocompletar los inputs de texto (Nombre, Email, Código REGA, Teléfono, Socio) con los datos reales del usuario activo
    const inpNombre = document.getElementById('mi-cuenta-nombre');
    const inpEmail = document.getElementById('mi-cuenta-email');
    const inpTel = document.getElementById('mi-cuenta-telefono');
    const inpSocio = document.getElementById('mi-cuenta-socio');
    const inpRega = document.getElementById('mi-cuenta-rega');

    if (inpNombre) inpNombre.value = u.nombre || '';
    if (inpEmail) inpEmail.value = u.email || '';
    if (inpTel) inpTel.value = u.telefono || '';
    if (inpSocio) inpSocio.value = socioMostrar;
    if (inpRega) {
      inpRega.value = tieneRegaOficial ? regaRaw : 'TEMP-REGA-001';
      this.validarInputRegaMiCuenta(inpRega.value);
    }

    const modal = document.getElementById('modal-mi-cuenta');
    if (modal) modal.classList.remove('hidden');

    if (focoSeccion === 'password') {
      setTimeout(() => (document.getElementById('mi-cuenta-pass-nueva') || document.getElementById('mi-cuenta-new-password'))?.focus(), 100);
    } else if (focoSeccion === 'rega') {
      setTimeout(() => document.getElementById('mi-cuenta-rega')?.focus(), 100);
    }
  },

  cerrarModalMiCuenta() {
    document.getElementById('modal-mi-cuenta')?.classList.add('hidden');
  },

  validarInputRegaMiCuenta(valor) {
    const v = (valor || '').trim().toUpperCase();
    const pill = document.getElementById('mi-cuenta-rega-pill') || document.getElementById('mi-cuenta-rega-valid-pill');
    const feedback = document.getElementById('mi-cuenta-rega-feedback');

    if (!v || v === 'NS-000' || v.startsWith('TEMP-REGA')) {
      if (pill) {
        pill.textContent = 'TEMP-REGA-001 (En trámite)';
        pill.className = 'text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-700 font-bold';
      }
      if (feedback) {
        feedback.innerHTML = 'Estado actual: <strong class="text-amber-300">🟡 En trámite (TEMP-REGA-001 / NS-000)</strong>. Introduce un código REGA oficial (<code class="text-emerald-400">ES + 12 dígitos</code>) para promocionar automáticamente a <strong>🟢 Criador Oficial</strong>.';
      }
    } else if (this.esRegaOficialValido(v)) {
      if (pill) {
        pill.textContent = `✓ ${v} (REGA Oficial)`;
        pill.className = 'text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-600 font-bold';
      }
      if (feedback) {
        feedback.innerHTML = '✓ <strong class="text-emerald-400">Código REGA Oficial válido</strong>. Al pulsar en Guardar se actualizará tu perfil y la pastilla de sesión inmediatamente.';
      }
    } else {
      if (pill) {
        pill.textContent = 'Formato requerido: ES + 12 dígitos';
        pill.className = 'text-[10px] font-mono px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-700 font-bold';
      }
      if (feedback) {
        feedback.innerHTML = '⚠️ El código REGA oficial debe contener <code class="text-rose-300">ES</code> seguido de 12 dígitos numéricos (ej. <code class="text-emerald-400">ES030140001234</code>), o <code class="text-amber-300">TEMP-REGA-001</code> si sigue en trámite.';
      }
    }
  },

  // Guardar datos en "Mi Cuenta", promover rol si el REGA es válido y actualizar inmediatamente el DOM de la pastilla sin recargar
  async guardarPerfilMiCuenta(event) {
    if (event) event.preventDefault();
    const u = this.estado.usuarioActivo || this.estado.usuarioActual;
    if (!u) return;

    const nombre = (document.getElementById('mi-cuenta-nombre')?.value || '').trim();
    const emailInput = (document.getElementById('mi-cuenta-email')?.value || '').trim().toLowerCase();
    const telefono = (document.getElementById('mi-cuenta-telefono')?.value || '').trim();
    let regaInput = (document.getElementById('mi-cuenta-rega')?.value || '').trim().toUpperCase();

    if (!nombre) {
      alert('El nombre completo no puede estar vacío.');
      return;
    }

    // Validar código REGA si no es provisional
    const esProvisional = (!regaInput || regaInput === 'NS-000' || regaInput.startsWith('TEMP-REGA'));
    if (!esProvisional && !this.esRegaOficialValido(regaInput)) {
      alert('⚠️ Formato REGA no válido.\n\nEl código REGA oficial debe estar compuesto por "ES" seguido de 12 dígitos numéricos (ejemplo: ES030140001234).\nSi aún está en trámite, deja "TEMP-REGA-001" o vacío.');
      return;
    }

    const regaFinal = esProvisional ? 'TEMP-REGA-001' : regaInput;

    u.nombre = nombre;
    if (emailInput) u.email = emailInput;
    u.telefono = telefono;
    u.updated_at = new Date().toISOString();

    this.estado.usuarioActivo = u;
    this.estado.usuarioActual = u;

    // Comprobar si hay promoción automática por REGA válido
    const fuePromovido = await this.verificarYPromoverRolPorRega(regaFinal, telefono, nombre);

    if (!fuePromovido) {
      u.rega = regaFinal;
      if (esProvisional) {
        u.codigo_provisional = 'TEMP-REGA-001';
        if (!u.numero_socio || u.numero_socio.startsWith('SOC-')) {
          u.numero_socio = 'NS-000';
        }
      } else if (!u.numero_socio || u.numero_socio === 'NS-000') {
        u.numero_socio = 'SOC-' + regaFinal.slice(-3);
      }

      await this.db.put('usuarios', u);
      const idx = (this.estado.usuarios || []).findIndex(item => item.id === u.id);
      if (idx !== -1) {
        this.estado.usuarios[idx] = u;
      } else {
        this.estado.usuarios.push(u);
      }
      localStorage.setItem('alacantina_v6_session', JSON.stringify(u));
      await this.sincronizarPerfilUsuarioSupabase(u, 'USUARIO_PERFIL');
    }

    // Sincronizar también en el aviario activo del usuario (app.estado.aviario y app.estado.aviarioActivo)
    await this.inicializarAviarioActivo();
    const avActivo = this.estado.aviario || this.estado.aviarioActivo;
    if (avActivo) {
      avActivo.usuario_id = u.id;
      avActivo.nombre_titular = nombre;
      avActivo.telefono = telefono;
      avActivo.codigo_rega = regaFinal;
      avActivo.rega = regaFinal;
      avActivo.numero_socio = u.numero_socio || 'NS-000';
      this.estado.aviario = avActivo;
      this.estado.aviarioActivo = avActivo;
      await this.db.put('explotaciones', avActivo);
      localStorage.setItem('alacantina_aviario_activo_datos', JSON.stringify(avActivo));
    }

    // Ejecutar inmediatamente la actualización del DOM de la pastilla y vistas sin recargar la página
    this.sincronizarInputsInspectorAutenticado();
    this.actualizarPastillaUsuario();
    this.actualizarBadgeAviario();
    this.actualizarVistaRegistroAviario();
    this.aplicarPermisosRBAC();
    this.renderizarTablaUsuariosAdmin();
    this.cerrarModalMiCuenta();

    if (fuePromovido) {
      alert(`🎉 ¡PROMOCIÓN AUTOMÁTICA COMPLETADA!\n\nCódigo REGA validado: ${regaFinal}\nTu cuenta ha evolucionado automáticamente del rol "Aspirante" a "Criador Oficial" en Supabase y la pastilla de sesión se ha actualizado en tiempo real.`);
    } else {
      this.mostrarNotificacionToast('✅ Perfil y pastilla de sesión actualizados dinámicamente.', 'success');
    }
  },

  // Cambiar contraseña desde el modal "Mi Cuenta"
  async cambiarPasswordMiCuenta(event) {
    if (event) event.preventDefault();
    const u = this.estado.usuarioActivo || this.estado.usuarioActual;
    if (!u) return;

    const elP1 = document.getElementById('mi-cuenta-pass-nueva') || document.getElementById('mi-cuenta-new-password');
    const elP2 = document.getElementById('mi-cuenta-pass-confirm') || document.getElementById('mi-cuenta-confirm-password');
    const p1 = (elP1?.value || '').trim();
    const p2 = (elP2?.value || '').trim();

    if (!p1 || p1.length < 6) {
      alert('La nueva contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (p1 !== p2) {
      alert('Las contraseñas introducidas no coinciden.');
      return;
    }

    // Actualizar en Supabase Auth si hay sesión remota
    if (navigator.onLine && this.supabaseClient && this.supabaseClient.auth) {
      try {
        await this.supabaseClient.auth.updateUser({ password: p1 });
      } catch (e) {
        console.warn('[Supabase Auth] Cambio de contraseña guardado en local:', e);
      }
    }

    u.password_hash = p1;
    u.updated_at = new Date().toISOString();
    this.estado.usuarioActivo = u;
    this.estado.usuarioActual = u;
    await this.db.put('usuarios', u);
    localStorage.setItem('alacantina_v6_session', JSON.stringify(u));

    if (elP1) elP1.value = '';
    if (elP2) elP2.value = '';

    this.mostrarNotificacionToast('🔑 Contraseña actualizada con éxito.', 'success');
  },

  // -------------------------------------------------------------------------
  // 12.3. EVOLUCIÓN AUTOMÁTICA DE ROLES Y PROMOCIÓN POR REGA (ES + 12 DÍGITOS)
  // -------------------------------------------------------------------------
  async verificarYPromoverRolPorRega(codigoRega, telefono = '', nombreTitular = '', numeroSocio = '') {
    const usuario = this.estado.usuarioActivo || this.estado.usuarioActual;
    if (!usuario) return false;

    const regaLimpio = (codigoRega || '').trim().toUpperCase();
    const esValido = this.esRegaOficialValido(regaLimpio);

    if (telefono) usuario.telefono = telefono;
    if (nombreTitular) usuario.nombre = nombreTitular;

    if (!esValido) {
      return false;
    }

    const rolAnterior = (usuario.rol || 'aspirante').toLowerCase();
    usuario.rega = regaLimpio;
    usuario.codigo_provisional = null;
    if (numeroSocio && numeroSocio !== 'NS-000') {
      usuario.numero_socio = numeroSocio;
    } else if (!usuario.numero_socio || usuario.numero_socio === 'NS-000') {
      usuario.numero_socio = 'SOC-' + regaLimpio.slice(-3);
    }

    let promovidoAhora = false;
    // Si el usuario era "Aspirante", promociona automáticamente a "Criador Oficial" ('criador')
    if (rolAnterior === 'aspirante') {
      usuario.rol = 'criador';
      this.estado.inspeccionInSitu.rolRBAC = 'criador';
      promovidoAhora = true;
    }

    usuario.updated_at = new Date().toISOString();
    this.estado.usuarioActivo = usuario;
    this.estado.usuarioActual = usuario;

    // Guardar en IndexedDB 'usuarios' y en el array reactivo
    await this.db.put('usuarios', usuario);
    const idx = (this.estado.usuarios || []).findIndex(u => u.id === usuario.id);
    if (idx !== -1) {
      this.estado.usuarios[idx] = usuario;
    } else {
      this.estado.usuarios.push(usuario);
    }

    // Persistir sesión actualizada en localStorage
    localStorage.setItem('alacantina_v6_session', JSON.stringify(usuario));

    // Sincronizar con Supabase Auth metadata y tabla 'perfiles_usuarios'
    await this.sincronizarPerfilUsuarioSupabase(usuario, 'USUARIO_PERFIL');

    if (promovidoAhora) {
      this.mostrarNotificacionToast(`🟢 ¡Promoción automática a Criador Oficial! REGA validado: ${regaLimpio}`, 'success');
    }

    return promovidoAhora;
  },

  async sincronizarPerfilUsuarioSupabase(usuario, tipoCola = 'USUARIO_PERFIL') {
    const payload = {
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      telefono: usuario.telefono || '',
      rega: usuario.rega || 'TEMP-REGA-001',
      numero_socio: usuario.numero_socio || 'NS-000',
      rol: usuario.rol || 'aspirante',
      updated_at: new Date().toISOString()
    };

    const activo = this.estado.usuarioActivo || this.estado.usuarioActual;
    if (navigator.onLine && this.supabaseClient) {
      try {
        if (this.supabaseClient.auth && activo && activo.id === usuario.id) {
          await this.supabaseClient.auth.updateUser({
            data: {
              nombre: payload.nombre,
              telefono: payload.telefono,
              rega: payload.rega,
              rol: payload.rol
            }
          });
        }
        const { error } = await this.supabaseClient.from('perfiles_usuarios').upsert(payload);
        if (error) throw error;
        return;
      } catch (err) {
        console.warn('[Supabase] Encolando actualización de perfil/rol en SyncQueue:', err);
      }
    }

    await this.db.put('syncQueue', {
      id: 'sync-usr-' + Date.now(),
      tipo: tipoCola,
      payload: payload,
      creado_en: Date.now()
    });
    this.estado.syncQueue = await this.db.getAll('syncQueue');
    this.actualizarContadorSyncQueue();
  },

  // -------------------------------------------------------------------------
  // 12.4. CONTROL DE ACCESO POR ROLES (RBAC) EN LA INTERFAZ
  // -------------------------------------------------------------------------
  aplicarPermisosRBAC() {
    const rol = this.obtenerRolUsuarioActual();

    const btnTabRegistro = document.getElementById('tab-btn-registro');
    const btnTabLotes = document.getElementById('tab-btn-lotes');
    const btnTabInSitu = document.getElementById('tab-btn-inspeccion-insitu');
    const btnTabAdmin = document.getElementById('tab-btn-admin');

    const bannerAspirante = document.getElementById('banner-aspirante-promocion');
    const bannerVisitante = document.getElementById('banner-visitante-lectura');
    const panelSolicitudesInSitu = document.getElementById('panel-solicitudes-inspeccion-insitu');
    const fichaAviarioCenso = document.getElementById('censo-ficha-aviario-criador');

    // 1. Pestaña exclusiva de Administración: SOLO visible para rol 'administrador'
    if (btnTabAdmin) {
      if (rol === 'administrador') {
        btnTabAdmin.classList.remove('hidden');
      } else {
        btnTabAdmin.classList.add('hidden');
      }
    }

    // 2. Banners contextuales superiores según el rol activo
    if (bannerAspirante) {
      if (rol === 'aspirante') {
        bannerAspirante.classList.remove('hidden');
      } else {
        bannerAspirante.classList.add('hidden');
      }
    }

    if (bannerVisitante) {
      if (rol === 'visitante') {
        bannerVisitante.classList.remove('hidden');
      } else {
        bannerVisitante.classList.add('hidden');
      }
    }

    // 3. Visibilidad de pestañas de escritura vs solo lectura (Visitante)
    if (rol === 'visitante') {
      btnTabRegistro?.classList.add('opacity-50');
      btnTabLotes?.classList.add('opacity-50');
      btnTabInSitu?.classList.add('hidden');
      fichaAviarioCenso?.classList.add('hidden');
    } else {
      btnTabRegistro?.classList.remove('opacity-50');
      btnTabLotes?.classList.remove('opacity-50');
      btnTabInSitu?.classList.remove('hidden');
      fichaAviarioCenso?.classList.remove('hidden');
    }

    // 4. Panel de Solicitudes de Inspección Pendientes en Tab 6 (Visible para Inspector y Administrador)
    if (panelSolicitudesInSitu) {
      if (rol === 'inspector' || rol === 'administrador') {
        panelSolicitudesInSitu.classList.remove('hidden');
      } else {
        panelSolicitudesInSitu.classList.add('hidden');
      }
    }

    // 5. Actualizar badge de rol en Inspección In Situ
    this.actualizarBadgeRBACInSitu(rol);
  },

  actualizarBadgeRBACInSitu(rol) {
    const badge = document.getElementById('insitu-rbac-badge');
    if (!badge) return;
    const r = (rol || this.obtenerRolUsuarioActual()).toLowerCase();
    if (r === 'inspector') {
      badge.textContent = 'Rol Activo: Inspector Zootécnico CNZ';
      badge.className = 'px-2.5 py-0.5 rounded-md text-xs font-bold bg-emerald-950 text-emerald-300 border border-emerald-500';
    } else if (r === 'administrador') {
      badge.textContent = 'Rol Activo: Administrador General ESGA025';
      badge.className = 'px-2.5 py-0.5 rounded-md text-xs font-bold bg-purple-950 text-purple-300 border border-purple-500';
    } else if (r === 'criador') {
      badge.textContent = 'Rol Activo: Criador Oficial REGA';
      badge.className = 'px-2.5 py-0.5 rounded-md text-xs font-bold bg-emerald-950 text-emerald-300 border border-emerald-600';
    } else if (r === 'aspirante') {
      badge.textContent = 'Rol Activo: Aspirante (NS-000)';
      badge.className = 'px-2.5 py-0.5 rounded-md text-xs font-bold bg-amber-950 text-amber-300 border border-amber-500';
    } else {
      badge.textContent = 'Rol Activo: Visitante (Solo Lectura)';
      badge.className = 'px-2.5 py-0.5 rounded-md text-xs font-bold bg-slate-800 text-slate-300 border border-slate-600';
    }
  },

  // -------------------------------------------------------------------------
  // 12.5. PANEL EXCLUSIVO DE ADMINISTRACIÓN DE USUARIOS Y ROLES (VISTA ADMIN)
  // -------------------------------------------------------------------------
  renderizarTablaUsuariosAdmin() {
    const tbody = document.getElementById('tabla-usuarios-admin-body');
    if (!tbody) return;

    const usuarios = this.estado.usuarios || [];

    // Actualizar KPIs del Panel Admin
    const elTotal = document.getElementById('kpi-admin-total-users');
    const elAsp = document.getElementById('kpi-admin-aspirantes');
    const elCri = document.getElementById('kpi-admin-criadores');
    const elInsp = document.getElementById('kpi-admin-inspectores');
    const elAdm = document.getElementById('kpi-admin-admins');

    if (elTotal) elTotal.textContent = usuarios.length;
    if (elAsp) elAsp.textContent = usuarios.filter(u => (u.rol || 'aspirante') === 'aspirante').length;
    if (elCri) elCri.textContent = usuarios.filter(u => u.rol === 'criador').length;
    if (elInsp) elInsp.textContent = usuarios.filter(u => u.rol === 'inspector').length;
    if (elAdm) elAdm.textContent = usuarios.filter(u => u.rol === 'administrador').length;

    // Filtros de búsqueda y rol en la vista Admin
    const textoFiltro = (document.getElementById('admin-filtro-usuarios')?.value || '').trim().toLowerCase();
    const rolFiltro = document.getElementById('admin-filtro-rol')?.value || 'TODOS';

    const filtrados = usuarios.filter(u => {
      const cumpleRol = rolFiltro === 'TODOS' || (u.rol || 'aspirante') === rolFiltro;
      if (!cumpleRol) return false;
      if (!textoFiltro) return true;
      return (
        (u.nombre || '').toLowerCase().includes(textoFiltro) ||
        (u.email || '').toLowerCase().includes(textoFiltro) ||
        (u.rega || '').toLowerCase().includes(textoFiltro) ||
        (u.telefono || '').toLowerCase().includes(textoFiltro)
      );
    });

    if (filtrados.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="px-4 py-8 text-center text-slate-400 text-xs">
            No se encontraron usuarios registrados con los filtros seleccionados.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = filtrados.map(u => {
      const rol = (u.rol || 'aspirante').toLowerCase();
      const iniciales = this.obtenerInicialesUsuario(u.nombre);
      const regaVal = u.rega || 'NS-000';
      const esRegaOficial = this.esRegaOficialValido(regaVal);
      const esUsuarioActual = this.estado.usuarioActual && this.estado.usuarioActual.id === u.id;

      const badgeRolEstilo = {
        aspirante: 'bg-amber-950 text-amber-300 border-amber-700',
        criador: 'bg-emerald-950 text-emerald-300 border-emerald-600',
        inspector: 'bg-sky-950 text-sky-300 border-sky-600',
        administrador: 'bg-purple-950 text-purple-300 border-purple-600'
      }[rol] || 'bg-slate-800 text-slate-300 border-slate-700';

      const iconoEstado = rol === 'aspirante' ? '🟡' : '🟢';

      return `
        <tr class="hover:bg-slate-800/60 transition ${esUsuarioActual ? 'bg-purple-950/20' : ''}">
          <td class="px-4 py-3">
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-full bg-slate-800 border border-slate-600 flex items-center justify-center text-xs font-black text-amber-400 shrink-0">
                ${this.escaparHtml(iniciales)}
              </div>
              <div>
                <p class="font-bold text-white text-xs flex items-center gap-1.5">
                  <span>${iconoEstado} ${this.escaparHtml(u.nombre)}</span>
                  ${esUsuarioActual ? '<span class="px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40 text-[9px] font-black uppercase">Tú</span>' : ''}
                </p>
                <span class="text-[10px] text-slate-400 font-mono">Socio: ${this.escaparHtml(u.numero_socio || 'NS-000')}</span>
              </div>
            </div>
          </td>
          <td class="px-4 py-3 font-mono text-xs text-slate-300">
            ${this.escaparHtml(u.email || '--')}
          </td>
          <td class="px-4 py-3">
            <div class="flex items-center gap-1.5">
              <span class="px-2 py-0.5 rounded text-xs font-mono font-bold border ${esRegaOficial ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700' : 'bg-amber-950/80 text-amber-300 border-amber-700'}">
                ${this.escaparHtml(regaVal)}
              </span>
              <button type="button" onclick="app.editarRegaUsuarioAdmin('${u.id}')" title="Editar REGA del usuario" class="text-slate-400 hover:text-amber-400 p-1 rounded transition">
                <i class="fa-solid fa-pen-to-square text-xs"></i>
              </button>
            </div>
          </td>
          <td class="px-4 py-3 text-xs text-slate-300 font-mono">
            ${u.telefono ? `<a href="tel:${this.escaparHtml(u.telefono)}" class="hover:text-emerald-400 transition"><i class="fa-solid fa-phone mr-1 text-emerald-400"></i>${this.escaparHtml(u.telefono)}</a>` : '<span class="text-slate-500">Sin teléfono</span>'}
          </td>
          <td class="px-4 py-3">
            <span class="px-2.5 py-1 rounded-full text-[10px] font-black uppercase border ${badgeRolEstilo}">
              ${this.escaparHtml(this.obtenerEtiquetaRol(rol, esRegaOficial))}
            </span>
          </td>
          <td class="px-4 py-3">
            <select onchange="app.cambiarRolUsuarioAdmin('${u.id}', this.value)" class="bg-slate-950 border border-purple-500/50 hover:border-purple-400 rounded-lg px-2.5 py-1.5 text-xs font-bold text-white focus:border-amber-400 focus:outline-none cursor-pointer">
              <option value="aspirante" ${rol === 'aspirante' ? 'selected' : ''}>🟡 Aspirante (NS-000)</option>
              <option value="criador" ${rol === 'criador' ? 'selected' : ''}>🟢 Criador Oficial</option>
              <option value="inspector" ${rol === 'inspector' ? 'selected' : ''}>📋 Inspector Zootécnico</option>
              <option value="administrador" ${rol === 'administrador' ? 'selected' : ''}>🛡️ Administrador</option>
            </select>
          </td>
        </tr>
      `;
    }).join('');
  },

  // Modificación manual de roles por parte del Administrador desde el selector desplegable
  async cambiarRolUsuarioAdmin(userId, nuevoRol) {
    if (this.obtenerRolUsuarioActual() !== 'administrador') {
      alert('Acceso denegado: Solo un Administrador puede modificar roles de usuario.');
      this.renderizarTablaUsuariosAdmin();
      return;
    }

    const usuario = (this.estado.usuarios || []).find(u => u.id === userId);
    if (!usuario) return;

    const rolAnterior = usuario.rol;
    usuario.rol = nuevoRol;
    usuario.updated_at = new Date().toISOString();

    await this.db.put('usuarios', usuario);

    // Si el administrador modificó su propio rol, actualizar también su sesión activa
    if (this.estado.usuarioActual && this.estado.usuarioActual.id === usuario.id) {
      this.estado.usuarioActual.rol = nuevoRol;
      this.estado.usuarioActivo = this.estado.usuarioActual;
      localStorage.setItem('alacantina_v6_session', JSON.stringify(this.estado.usuarioActual));
      this.actualizarPastillaUsuario();
      this.aplicarPermisosRBAC();
    }

    await this.sincronizarPerfilUsuarioSupabase(usuario, 'CAMBIO_ROL_ADMIN');
    this.renderizarTablaUsuariosAdmin();

    this.mostrarNotificacionToast(
      `🛡️ Rol de "${usuario.nombre}" actualizado de ${this.obtenerEtiquetaRol(rolAnterior, this.esRegaOficialValido(usuario.rega))} a ${this.obtenerEtiquetaRol(nuevoRol, this.esRegaOficialValido(usuario.rega))}`,
      'success'
    );
  },

  // Permitir al Administrador asignar o corregir el REGA de un usuario (con promoción automática si es Aspirante)
  async editarRegaUsuarioAdmin(userId) {
    if (this.obtenerRolUsuarioActual() !== 'administrador') return;
    const usuario = (this.estado.usuarios || []).find(u => u.id === userId);
    if (!usuario) return;

    const nuevoRega = prompt(
      `Introduce el código REGA oficial para ${usuario.nombre} (formato ES + 12 dígitos, ej. ES030140001234) o NS-000 para provisional:`,
      usuario.rega || 'NS-000'
    );
    if (nuevoRega === null) return;

    const regaLimpio = nuevoRega.trim().toUpperCase();
    if (regaLimpio !== 'NS-000' && !regaLimpio.startsWith('TEMP-REGA') && !this.esRegaOficialValido(regaLimpio)) {
      alert('⚠️ Formato REGA inválido. Debe ser ES seguido de 12 dígitos numéricos (ej. ES030140001234) o NS-000.');
      return;
    }

    usuario.rega = regaLimpio;
    if (this.esRegaOficialValido(regaLimpio) && usuario.rol === 'aspirante') {
      usuario.rol = 'criador';
      usuario.numero_socio = 'SOC-' + regaLimpio.slice(-3);
      this.mostrarNotificacionToast(`🟢 ${usuario.nombre} promovido automáticamente a Criador Oficial al validar REGA ${regaLimpio}`, 'success');
    }
    usuario.updated_at = new Date().toISOString();

    await this.db.put('usuarios', usuario);
    if (this.estado.usuarioActual && this.estado.usuarioActual.id === usuario.id) {
      this.estado.usuarioActual = { ...usuario };
      this.estado.usuarioActivo = this.estado.usuarioActual;
      localStorage.setItem('alacantina_v6_session', JSON.stringify(usuario));
      this.actualizarPastillaUsuario();
      this.aplicarPermisosRBAC();
    }

    await this.sincronizarPerfilUsuarioSupabase(usuario, 'USUARIO_PERFIL');
    this.renderizarTablaUsuariosAdmin();
  },

  async abrirModalNuevoUsuarioAdmin() {
    if (this.obtenerRolUsuarioActual() !== 'administrador') return;
    const nombre = prompt('Nombre y Apellidos del nuevo usuario:');
    if (!nombre || !nombre.trim()) return;
    const email = prompt('Correo electrónico del usuario:');
    if (!email || !email.trim()) return;
    const regaInput = (prompt('Código REGA (ES + 12 dígitos) o dejar en NS-000 si es Aspirante:', 'NS-000') || 'NS-000').trim().toUpperCase();
    const telefono = (prompt('Teléfono de contacto (ej. +34 600 000 000):', '+34 ') || '').trim();

    const esRegaValido = this.esRegaOficialValido(regaInput);
    const rolInicial = esRegaValido ? 'criador' : 'aspirante';

    const nuevoUsuario = {
      id: 'usr-' + Date.now(),
      nombre: nombre.trim(),
      email: email.trim().toLowerCase(),
      password_hash: 'demo1234',
      telefono: telefono,
      rega: esRegaValido ? regaInput : 'TEMP-REGA-001',
      numero_socio: esRegaValido ? ('SOC-' + regaInput.slice(-3)) : 'NS-000',
      rol: rolInicial,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await this.db.put('usuarios', nuevoUsuario);
    this.estado.usuarios.push(nuevoUsuario);
    await this.sincronizarPerfilUsuarioSupabase(nuevoUsuario, 'USUARIO_PERFIL');
    this.renderizarTablaUsuariosAdmin();
    this.mostrarNotificacionToast(`✅ Usuario "${nuevoUsuario.nombre}" dado de alta con rol ${this.obtenerEtiquetaRol(rolInicial, esRegaValido)}.`, 'success');
  },

  async sincronizarUsuariosAdmin() {
    await this.sincronizarDesdeSupabase();
    this.renderizarTablaUsuariosAdmin();
    this.renderizarSolicitudesInspeccion();
    this.mostrarNotificacionToast('🔄 Lista de usuarios y solicitudes sincronizada.', 'info');
  },

  // -------------------------------------------------------------------------
  // 12.6. MÓDULO DE SOLICITUD DE INSPECCIÓN ZOOTÉCNICA CON VALIDACIÓN DE TELÉFONO
  // -------------------------------------------------------------------------
  async abrirModalSolicitudInspeccion() {
    if (this.obtenerRolUsuarioActual() === 'visitante') {
      this.mostrarNotificacionToast('🔒 Inicia sesión o regístrate para solicitar una Inspección Zootécnica In Situ.', 'warning');
      this.abrirModalAuthAcceso('login');
      return;
    }

    let u = this.estado.usuarioActivo || this.estado.usuarioActual;
    if (u) {
      try {
        const usuariosDB = await this.db.getAll('usuarios');
        const fresco = (usuariosDB || []).find(item => item.id === u.id || (item.email && u.email && item.email.toLowerCase() === u.email.toLowerCase()));
        if (fresco) {
          u = { ...u, ...fresco };
          this.estado.usuarioActivo = u;
          this.estado.usuarioActual = u;
        }
      } catch (e) {
        // Ignorar si falla lectura puntual
      }
    }

    const av = this.estado.aviario || this.estado.aviarioActivo;

    // Calcular número de animales listos para valorar (en RN o RA) estrictamente del aviario/usuario autenticado
    const animalesExplotacion = (this.estado.animales || []).filter(a => {
      if (!this.perteneceAUsuarioActivo(a, u, av)) return false;
      return a.seccion_libro === 'RN' || a.seccion_libro === 'RA';
    });
    const numSugerido = animalesExplotacion.length > 0 ? animalesExplotacion.length : Math.max(1, (this.estado.animales || []).length);

    const inpNum = document.getElementById('sol-insp-num-animales');
    const inpTel = document.getElementById('sol-insp-telefono');
    const avisoSinTel = document.getElementById('sol-insp-aviso-sin-telefono');
    const inpRega = document.getElementById('sol-insp-rega');
    const inpCriador = document.getElementById('sol-insp-criador');
    const inpLat = document.getElementById('sol-insp-gps-lat');
    const inpLng = document.getElementById('sol-insp-gps-lng');
    const inpObs = document.getElementById('sol-insp-observaciones');

    const telefonoPerfil = (u?.telefono || av?.telefono || '').trim();
    const regaReal = (u?.rega && this.esRegaOficialValido(u.rega))
      ? u.rega.trim().toUpperCase()
      : (av?.codigo_rega || av?.rega || u?.rega || 'TEMP-REGA-001');

    if (inpNum) inpNum.value = numSugerido;
    if (inpTel) {
      inpTel.value = telefonoPerfil;
      if (!telefonoPerfil) {
        inpTel.classList.add('border-rose-500', 'ring-2', 'ring-rose-500/40');
      } else {
        inpTel.classList.remove('border-rose-500', 'ring-2', 'ring-rose-500/40');
      }
    }
    if (avisoSinTel) {
      if (!telefonoPerfil) {
        avisoSinTel.classList.remove('hidden');
      } else {
        avisoSinTel.classList.add('hidden');
      }
    }

    if (inpRega) inpRega.value = regaReal;
    if (inpCriador) {
      inpCriador.value = av
        ? `${av.nombre_criadero || av.nombre_titular || u?.nombre || ''} (${av.municipio || 'Alicante'})`
        : (u?.nombre || u?.email || '');
    }
    if (inpLat) inpLat.value = (av?.latitud !== null && av?.latitud !== undefined && av?.latitud !== '') ? Number(av.latitud).toFixed(6) : '';
    if (inpLng) inpLng.value = (av?.longitud !== null && av?.longitud !== undefined && av?.longitud !== '') ? Number(av.longitud).toFixed(6) : '';
    if (inpObs && !inpObs.value) inpObs.value = '';

    document.getElementById('modal-solicitud-inspeccion')?.classList.remove('hidden');

    if (!telefonoPerfil && inpTel) {
      setTimeout(() => inpTel.focus(), 120);
    }
  },

  cerrarModalSolicitudInspeccion() {
    document.getElementById('modal-solicitud-inspeccion')?.classList.add('hidden');
  },

  capturarGPSSolicitudInspeccion() {
    const inpLat = document.getElementById('sol-insp-gps-lat');
    const inpLng = document.getElementById('sol-insp-gps-lng');

    if (!('geolocation' in navigator)) {
      alert('Geolocalización GPS no soportada en este navegador.');
      return;
    }

    this.mostrarNotificacionToast('🛰️ Obteniendo coordenadas GPS de la explotación...', 'info');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (inpLat) inpLat.value = pos.coords.latitude.toFixed(6);
        if (inpLng) inpLng.value = pos.coords.longitude.toFixed(6);
        this.mostrarNotificacionToast(`📍 GPS actualizado (±${Math.round(pos.coords.accuracy)}m)`, 'success');
      },
      (err) => {
        console.warn('[GPS Solicitud] Error:', err);
        alert('No se pudo obtener el GPS en tiempo real: ' + err.message);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  },

  async guardarSolicitudInspeccion(event) {
    if (event) event.preventDefault();

    const inpTel = document.getElementById('sol-insp-telefono');
    const avisoSinTel = document.getElementById('sol-insp-aviso-sin-telefono');
    const numAnimales = parseInt(document.getElementById('sol-insp-num-animales')?.value, 10) || 1;
    const telefono = (inpTel?.value || '').trim();
    const codigoRega = (document.getElementById('sol-insp-rega')?.value || 'TEMP-REGA-001').trim().toUpperCase();
    const criadorAviario = (document.getElementById('sol-insp-criador')?.value || '').trim();
    const latInput = parseFloat(document.getElementById('sol-insp-gps-lat')?.value);
    const lngInput = parseFloat(document.getElementById('sol-insp-gps-lng')?.value);
    const observaciones = (document.getElementById('sol-insp-observaciones')?.value || '').trim();

    // Validación estricta de teléfono (mínimo 9 dígitos numéricos reales)
    const digitosTel = telefono.replace(/\D+/g, '');
    if (!telefono || digitosTel.length < 9) {
      if (avisoSinTel) avisoSinTel.classList.remove('hidden');
      if (inpTel) {
        inpTel.classList.add('border-rose-500', 'ring-2', 'ring-rose-500/40');
        inpTel.focus();
      }
      alert('⚠️ Teléfono de Contacto obligatorio.\n\nTu perfil no tenía un teléfono válido o el campo está incompleto. Por favor, introduce un número de teléfono válido (mínimo 9 dígitos) antes de enviar la solicitud; se guardará automáticamente en tu perfil.');
      return;
    }

    if (inpTel) inpTel.classList.remove('border-rose-500', 'ring-2', 'ring-rose-500/40');
    if (avisoSinTel) avisoSinTel.classList.add('hidden');

    const u = this.estado.usuarioActivo || this.estado.usuarioActual;
    const av = this.estado.aviario || this.estado.aviarioActivo;

    const latitud = !isNaN(latInput) ? latInput : (av?.latitud ?? null);
    const longitud = !isNaN(lngInput) ? lngInput : (av?.longitud ?? null);

    // Actualizar automáticamente el teléfono en el perfil de usuario en Supabase e IndexedDB
    if (u) {
      u.telefono = telefono;
      if (latitud !== null && !u.latitud) u.latitud = latitud;
      if (longitud !== null && !u.longitud) u.longitud = longitud;
      u.updated_at = new Date().toISOString();
      this.estado.usuarioActivo = u;
      this.estado.usuarioActual = u;
      await this.db.put('usuarios', u);
      const idxU = (this.estado.usuarios || []).findIndex(item => item.id === u.id);
      if (idxU !== -1) this.estado.usuarios[idxU] = u;
      localStorage.setItem('alacantina_v6_session', JSON.stringify(u));
      await this.sincronizarPerfilUsuarioSupabase(u, 'USUARIO_PERFIL');
    }

    if (av) {
      av.telefono = telefono;
      if (latitud !== null) av.latitud = latitud;
      if (longitud !== null) av.longitud = longitud;
      av.updated_at = new Date().toISOString();
      this.estado.aviario = av;
      this.estado.aviarioActivo = av;
      await this.db.put('explotaciones', av);
      localStorage.setItem('alacantina_aviario_activo_datos', JSON.stringify(av));
    }

    const nuevaSolicitud = {
      id: 'sol-insp-' + Date.now(),
      usuario_id: u?.id || null,
      criador_nombre: u?.nombre || av?.nombre_titular || criadorAviario || 'Criador Asociado',
      nombre_aviario: av?.nombre_criadero || criadorAviario || `Aviario de ${u?.nombre || 'Criador'}`,
      explotacion_id: av?.id || u?.explotacion_id || null,
      codigo_rega: codigoRega,
      num_animales: numAnimales,
      telefono_contacto: telefono,
      latitud: latitud,
      longitud: longitud,
      municipio: av ? `${av.municipio || 'Alicante'} (${av.provincia || 'Alicante'})` : 'Alicante',
      observaciones_horario: observaciones || 'Disponible mañanas. Ejemplares listos para valoración morfológica oficial in situ.',
      estado: 'PENDIENTE',
      created_at: new Date().toISOString()
    };

    // 1. Guardar en IndexedDB 'solicitudesInspeccion'
    await this.db.put('solicitudesInspeccion', nuevaSolicitud);
    this.estado.solicitudesInspeccion.unshift(nuevaSolicitud);

    // 2. Sincronizar con Supabase o encolar en SyncQueue
    if (navigator.onLine && this.supabaseClient) {
      try {
        const { error } = await this.supabaseClient.from('solicitudes_inspeccion').upsert(nuevaSolicitud);
        if (error) throw error;
      } catch (err) {
        await this.db.put('syncQueue', {
          id: 'sync-sol-' + Date.now(),
          tipo: 'SOLICITUD_INSPECCION',
          payload: nuevaSolicitud,
          creado_en: Date.now()
        });
      }
    } else {
      await this.db.put('syncQueue', {
        id: 'sync-sol-' + Date.now(),
        tipo: 'SOLICITUD_INSPECCION',
        payload: nuevaSolicitud,
        creado_en: Date.now()
      });
    }

    this.estado.syncQueue = await this.db.getAll('syncQueue');
    this.actualizarContadorSyncQueue();
    this.actualizarPastillaUsuario();
    this.actualizarVistaRegistroAviario();
    this.renderizarSolicitudesInspeccion();
    this.cerrarModalSolicitudInspeccion();

    alert(
      `📩 ¡SOLICITUD DE INSPECCIÓN ZOOTÉCNICA ENVIADA!\n\n` +
      `• Explotación REGA: ${codigoRega}\n` +
      `• Ejemplares a evaluar: ${numAnimales} aves\n` +
      `• Teléfono actualizado en tu perfil: ${telefono}\n` +
      `• Disponibilidad: ${nuevaSolicitud.observaciones_horario}\n\n` +
      `El Inspector Zootécnico y la Dirección Técnica han recibido tu solicitud con acceso directo para llamarte o escribirte por WhatsApp.`
    );
  },

  // Limpiar teléfono para URL oficial de WhatsApp (https://wa.me/34612345678)
  formatearTelefonoWhatsApp(telefono) {
    let digitos = (telefono || '').replace(/\D+/g, '');
    if (!digitos) return '';
    if (digitos.length === 9 && /^[6789]/.test(digitos)) {
      digitos = '34' + digitos;
    }
    return digitos;
  },

  // Renderizar tarjetas de Solicitudes de Inspección Pendientes en Vista Inspector (Tab 6) y Vista Admin
  renderizarSolicitudesInspeccion() {
    const gridInSitu = document.getElementById('grid-solicitudes-inspeccion-insitu');
    const gridAdmin = document.getElementById('grid-solicitudes-inspeccion-admin');
    const badgeCountInSitu = document.getElementById('badge-solicitudes-pendientes-count');
    const badgeNav = document.getElementById('badge-nav-solicitudes-pendientes');

    const todas = (this.estado.solicitudesInspeccion || []).slice().sort(
      (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
    );
    const pendientesCount = todas.filter(s => s.estado !== 'COMPLETADA').length;

    if (badgeCountInSitu) {
      badgeCountInSitu.textContent = `${pendientesCount} pendiente${pendientesCount === 1 ? '' : 's'}`;
    }
    if (badgeNav) {
      if (pendientesCount > 0) {
        badgeNav.textContent = pendientesCount;
        badgeNav.classList.remove('hidden');
      } else {
        badgeNav.classList.add('hidden');
      }
    }

    const generarHtmlTarjetas = (lista) => {
      if (!lista || lista.length === 0) {
        return `
          <div class="col-span-full p-6 rounded-xl bg-slate-900/60 border border-slate-800 text-center text-xs text-slate-400">
            No hay solicitudes de inspección zootécnica registradas en este momento.
          </div>
        `;
      }

      return lista.map(sol => {
        const telLimpio = (sol.telefono_contacto || '').replace(/\s+/g, '');
        const waPhone = this.formatearTelefonoWhatsApp(sol.telefono_contacto);
        const waMsg = encodeURIComponent(
          `Hola ${sol.criador_nombre}, soy Inspector Zootécnico del Club Gallina Alacantina (ESGA025). Me pongo en contacto contigo respecto a tu solicitud de inspección in situ para ${sol.num_animales} ejemplares en la explotación REGA ${sol.codigo_rega}.`
        );
        const waUrl = `https://wa.me/${waPhone}?text=${waMsg}`;
        const telUrl = `tel:${telLimpio}`;

        const fechaStr = sol.created_at
          ? new Date(sol.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
          : 'Reciente';
        const esPendiente = sol.estado !== 'COMPLETADA';
        const esRegaValido = this.esRegaOficialValido(sol.codigo_rega);
        const gpsStr = (sol.latitud !== null && sol.latitud !== undefined && sol.longitud !== null && sol.longitud !== undefined)
          ? `${Number(sol.latitud).toFixed(4)}, ${Number(sol.longitud).toFixed(4)}`
          : 'GPS pendiente';

        return `
          <div class="p-4 rounded-xl bg-slate-900/95 border ${esPendiente ? 'border-amber-500/50 shadow-md shadow-amber-950/20' : 'border-emerald-800/60 opacity-85'} flex flex-col justify-between gap-3">
            <div class="space-y-2">
              <div class="flex items-start justify-between gap-2">
                <div>
                  <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black uppercase ${esPendiente ? 'bg-amber-400 text-slate-950' : 'bg-emerald-950 text-emerald-300 border border-emerald-700'}">
                    ${esPendiente ? '⏳ Pendiente de Visita' : '✓ Inspección Atendida'}
                  </span>
                  <h4 class="text-sm font-black text-white mt-1.5">${this.escaparHtml(sol.criador_nombre)}</h4>
                  <p class="text-xs text-amber-300 font-semibold">${this.escaparHtml(sol.nombre_aviario || 'Aviario Asociado')}</p>
                </div>
                <div class="text-right shrink-0">
                  <span class="px-2.5 py-1 rounded-lg bg-emerald-950 border border-emerald-600 text-emerald-300 font-black text-xs block">
                    🐓 ${sol.num_animales} Aves
                  </span>
                  <span class="text-[10px] text-slate-400 font-mono block mt-1">${fechaStr}</span>
                </div>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] bg-slate-950/90 p-2.5 rounded-lg border border-slate-800">
                <div class="truncate">
                  <span class="text-slate-500 block text-[10px]">Código REGA:</span>
                  <span class="font-mono font-bold ${esRegaValido ? 'text-emerald-400' : 'text-amber-400'}">${this.escaparHtml(sol.codigo_rega)}</span>
                </div>
                <div class="truncate">
                  <span class="text-slate-500 block text-[10px]">Teléfono Contacto:</span>
                  <span class="font-mono font-bold text-white"><i class="fa-solid fa-phone text-emerald-400 mr-1"></i>${this.escaparHtml(sol.telefono_contacto)}</span>
                </div>
                <div class="sm:col-span-2 truncate">
                  <span class="text-slate-500 text-[10px] mr-1">📍 GPS Explotación:</span>
                  <span class="font-mono text-sky-300 text-[11px]">${gpsStr} · ${this.escaparHtml(sol.municipio || 'Alicante')}</span>
                </div>
              </div>

              <div class="p-2.5 rounded-lg bg-amber-950/25 border border-amber-800/40 text-xs text-amber-100">
                <span class="text-[10px] font-black uppercase text-amber-400 block mb-0.5">
                  <i class="fa-regular fa-clock mr-1"></i>Horario / Observaciones del Criador:
                </span>
                <p class="leading-snug text-[11px]">${this.escaparHtml(sol.observaciones_horario || 'Sin observaciones adicionales.')}</p>
              </div>
            </div>

            <!-- Botones de Acción Directa: [ Llamar por Teléfono ] (tel:) y [ Enviar WhatsApp ] (https://wa.me/) -->
            <div class="pt-2 border-t border-slate-800 space-y-2">
              <div class="grid grid-cols-2 gap-2">
                <a href="${telUrl}" class="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-black text-xs shadow transition text-center">
                  <i class="fa-solid fa-phone-volume"></i> Llamar por Teléfono
                </a>
                <a href="${waUrl}" target="_blank" rel="noopener noreferrer" class="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow transition text-center">
                  <i class="fa-brands fa-whatsapp text-sm"></i> Enviar WhatsApp
                </a>
              </div>
              <div class="flex items-center justify-between gap-2">
                <button type="button" onclick="app.atenderSolicitudInspeccion('${sol.id}')" class="flex-1 px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[11px] font-bold transition">
                  <i class="fa-solid fa-clipboard-check mr-1"></i>Cargar en Mesa de Inspección
                </button>
                <button type="button" onclick="app.cambiarEstadoSolicitudInspeccion('${sol.id}')" class="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[11px] font-semibold transition">
                  ${esPendiente ? '✓ Marcar Atendida' : '↺ Reabrir'}
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('');
    };

    if (gridInSitu) gridInSitu.innerHTML = generarHtmlTarjetas(todas);
    if (gridAdmin) gridAdmin.innerHTML = generarHtmlTarjetas(todas);
  },

  // Cargar los datos de una solicitud directamente en la mesa de Inspección In Situ (Tab 6)
  atenderSolicitudInspeccion(solicitudId) {
    const sol = (this.estado.solicitudesInspeccion || []).find(s => s.id === solicitudId);
    if (!sol) return;

    // Sincronizar coordenadas GPS de la solicitud con la inspección in situ
    if (sol.latitud !== null && sol.latitud !== undefined && sol.longitud !== null && sol.longitud !== undefined) {
      this.estado.inspeccionInSitu.gpsInSitu = {
        latitud: Number(sol.latitud),
        longitud: Number(sol.longitud),
        precision_m: 5
      };
      this.actualizarUIGpsInSitu();
    }

    // Buscar primer ejemplar de esa explotación o REGA para preseleccionarlo
    const animalExp = (this.estado.animales || []).find(
      a => a.explotacion_id === sol.explotacion_id || a.codigo_rega === sol.codigo_rega
    );

    this.cambiarTab('inspeccion-insitu');

    if (animalExp) {
      const sel = document.getElementById('insitu-animal-select');
      if (sel) sel.value = animalExp.id;
      this.cargarAnimalInSitu(animalExp.id);
    }

    this.mostrarNotificacionToast(
      `📋 Cargada solicitud de ${sol.criador_nombre} (${sol.codigo_rega} · ${sol.num_animales} aves)`,
      'info'
    );
  },

  async cambiarEstadoSolicitudInspeccion(solicitudId) {
    const sol = (this.estado.solicitudesInspeccion || []).find(s => s.id === solicitudId);
    if (!sol) return;

    sol.estado = sol.estado === 'COMPLETADA' ? 'PENDIENTE' : 'COMPLETADA';
    await this.db.put('solicitudesInspeccion', sol);
    this.renderizarSolicitudesInspeccion();

    this.mostrarNotificacionToast(
      sol.estado === 'COMPLETADA'
        ? `✅ Solicitud de ${sol.criador_nombre} marcada como atendida.`
        : `⏳ Solicitud de ${sol.criador_nombre} reabierta como pendiente.`,
      'info'
    );
  },

  // =========================================================================
  // 12. FASE 4: SIMULADOR PREVENTIVO DE CRUZAMIENTOS (F_x WRIGHT 5 GEN)
  // Y GESTOR DE LOTES DE INCUBACIÓN / NACEDORA / ANILLADO ENTENTE EUROPEA
  // =========================================================================

  irASimuladorAcoplamientos() {
    this.cambiarTab('lotes');
    setTimeout(() => {
      this.poblarSimuladorAcoplamientos();
      const card = document.getElementById('card-simulador-acoplamientos-preventivo');
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 80);
  },

  /**
   * Analiza hasta 5 generaciones ancestrales de un individuo para el cálculo de Wright (Fx)
   */
  obtenerAncestros5Generaciones(individuoId, censo, generacionActual = 0, visitados = new Set()) {
    const mapa = {};
    if (!individuoId || generacionActual > 5 || visitados.has(individuoId)) return mapa;
    visitados.add(individuoId);

    const ind = (censo || []).find(a => a.id === individuoId);
    if (!ind) return mapa;

    if (!mapa[individuoId]) mapa[individuoId] = [];
    mapa[individuoId].push(generacionActual);

    if (generacionActual < 5) {
      if (ind.id_padre) {
        const rutasP = this.obtenerAncestros5Generaciones(ind.id_padre, censo, generacionActual + 1, new Set(visitados));
        for (const [id, dists] of Object.entries(rutasP)) {
          if (!mapa[id]) mapa[id] = [];
          mapa[id].push(...dists);
        }
      }
      if (ind.id_madre) {
        const rutasM = this.obtenerAncestros5Generaciones(ind.id_madre, censo, generacionActual + 1, new Set(visitados));
        for (const [id, dists] of Object.entries(rutasM)) {
          if (!mapa[id]) mapa[id] = [];
          mapa[id].push(...dists);
        }
      }
    }
    return mapa;
  },

  /**
   * Calcula en tiempo real el Coeficiente de Consanguinidad de Wright (Fx) estimado
   * para la descendencia futura analizando las 5 generaciones ancestrales de ambos progenitores:
   * Fx = sum (1/2)^(n1 + n2 + 1) * (1 + FA)
   */
  calcularFxWright5Gen(machoId, hembraId, censo = null) {
    const lista = censo || this.estado.animales || [];
    if (!machoId || !hembraId) return { fx: 0, ancestrosComunes: [] };
    if (machoId === hembraId) return { fx: 0.5, ancestrosComunes: [machoId] };

    const macho = lista.find(a => a.id === machoId);
    const hembra = lista.find(a => a.id === hembraId);

    const caminosPadre = this.obtenerAncestros5Generaciones(machoId, lista, 0);
    const caminosMadre = this.obtenerAncestros5Generaciones(hembraId, lista, 0);

    let fxTotal = 0.0;
    const idsComunes = Object.keys(caminosPadre).filter(id => caminosMadre[id]);
    const detalleComunes = [];

    idsComunes.forEach(ancId => {
      const distsP = caminosPadre[ancId];
      const distsM = caminosMadre[ancId];
      const ancObj = lista.find(a => a.id === ancId);
      const fA = ancObj ? (Number(ancObj.coeficiente_consanguinidad) || 0) : 0;

      let aporteAncestro = 0;
      distsP.forEach(n1 => {
        distsM.forEach(n2 => {
          if (n1 + n2 <= 10) {
            aporteAncestro += Math.pow(0.5, n1 + n2 + 1) * (1 + fA);
          }
        });
      });
      fxTotal += aporteAncestro;
      if (ancObj) {
        detalleComunes.push({
          id: ancId,
          anilla: ancObj.numero_anilla,
          nombre: ancObj.nombre || ancObj.codigo_identificacion,
          aporte: aporteAncestro
        });
      }
    });

    // Si pertenecen a la misma Familia Gobe sin genealogía completa cargada pero comparten línea cerrada fundacional,
    // considerar el parentesco intrafamiliar preventivo (medio hermanos / primos Gobe)
    if (fxTotal === 0 && macho && hembra && macho.familia_origen && macho.familia_origen === hembra.familia_origen) {
      fxTotal = 0.0625; // 6.25% (cruce intrafamiliar misma Familia Gobe)
      detalleComunes.push({
        id: macho.familia_origen,
        anilla: macho.familia_origen,
        nombre: `Línea Materna/Paterna cerrada (${macho.familia_origen})`,
        aporte: 0.0625
      });
    }

    return {
      fx: Math.min(1.0, fxTotal),
      ancestrosComunes: detalleComunes
    };
  },

  obtenerDiagnosticoColorWright(fx) {
    const pct = fx * 100;
    if (pct < 5.0) {
      return {
        nivel: 'VERDE',
        icono: '🟢',
        etiqueta: '🟢 Verde: Apto / Baja Consanguinidad (F_x < 5%)',
        resumenCorto: 'Apto / Baja Consanguinidad',
        borderClass: 'border-emerald-500/70 bg-emerald-950/20',
        badgeClass: 'bg-emerald-950 text-emerald-300 border-emerald-600',
        textClass: 'text-emerald-400'
      };
    } else if (pct <= 10.0) {
      return {
        nivel: 'AMARILLO',
        icono: '🟡',
        etiqueta: '🟡 Amarillo: Precaución / Consanguinidad Moderada (5% <= F_x <= 10%)',
        resumenCorto: 'Precaución / Consanguinidad Moderada',
        borderClass: 'border-amber-500/70 bg-amber-950/20',
        badgeClass: 'bg-amber-950 text-amber-300 border-amber-600',
        textClass: 'text-amber-400'
      };
    } else {
      return {
        nivel: 'ROJO',
        icono: '🔴',
        etiqueta: '🔴 Rojo: Alerta de Inbreeding / Consanguinidad Elevada (F_x > 10%)',
        resumenCorto: 'Alerta de Inbreeding / Consanguinidad Elevada',
        borderClass: 'border-red-500/80 bg-red-950/25',
        badgeClass: 'bg-red-950 text-red-300 border-red-600',
        textClass: 'text-red-400'
      };
    }
  },

  poblarSimuladorAcoplamientos() {
    const selectMacho = document.getElementById('sim-gobe-macho');
    const checklistHembras = document.getElementById('sim-gobe-hembras-checklist');
    if (!selectMacho || !checklistHembras) return;

    const animalesPropios = (this.estado.animales || []).filter(a => a.estado !== 'Baja' && this.perteneceAUsuarioActivo(a));
    const machos = animalesPropios.filter(a => a.sexo === 'Macho');
    const hembras = animalesPropios.filter(a => a.sexo === 'Hembra');

    const machoPrevio = selectMacho.value;
    selectMacho.innerHTML = '<option value="">-- Seleccionar Gallo Reproductor --</option>';
    machos.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = `♂ #${m.numero_anilla} · ${m.nombre || m.codigo_identificacion} (${m.familia_origen || 'Sin familia'} · ${m.seccion_libro})`;
      selectMacho.appendChild(opt);
    });
    if (machoPrevio && machos.some(m => m.id === machoPrevio)) {
      selectMacho.value = machoPrevio;
    } else if (machos.length > 0) {
      selectMacho.value = machos[0].id;
    }

    // Preservar selección previa de gallinas o preseleccionar las primeras 2
    const seleccionadasPrevias = new Set(
      Array.from(document.querySelectorAll('.sim-gobe-hembra-chk:checked')).map(el => el.value)
    );

    if (hembras.length === 0) {
      checklistHembras.innerHTML = '<div class="p-3 text-center text-xs text-slate-500">No hay gallinas reproductoras activas en el censo actual.</div>';
    } else {
      checklistHembras.innerHTML = hembras.map((h, idx) => {
        const checked = seleccionadasPrevias.size > 0
          ? seleccionadasPrevias.has(h.id)
          : idx < 3;
        return `
          <label class="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-800 cursor-pointer transition text-xs">
            <div class="flex items-center gap-2 min-w-0">
              <input type="checkbox"
                     class="sim-gobe-hembra-chk rounded border-slate-600 text-pink-500 focus:ring-pink-500"
                     value="${h.id}"
                     data-familia="${this.escaparHtml(h.familia_origen || '')}"
                     ${checked ? 'checked' : ''}
                     onchange="app.ejecutarSimuladorAcoplamientoPreventivo()">
              <span class="font-mono font-bold text-white">#${this.escaparHtml(h.numero_anilla)}</span>
              <span class="text-slate-300 truncate">${this.escaparHtml(h.nombre || h.codigo_identificacion)}</span>
            </div>
            <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-pink-950/70 text-pink-300 border border-pink-800/60 shrink-0">
              ${this.escaparHtml(h.familia_origen || 'Sin fam.')}
            </span>
          </label>
        `;
      }).join('');
    }

    this.ejecutarSimuladorAcoplamientoPreventivo();
  },

  seleccionarFamiliaSimulador(filtroFamilia) {
    const checkboxes = document.querySelectorAll('.sim-gobe-hembra-chk');
    checkboxes.forEach(chk => {
      if (filtroFamilia === 'TODAS') {
        chk.checked = true;
      } else if (filtroFamilia === 'NINGUNA') {
        chk.checked = false;
      } else if (filtroFamilia) {
        chk.checked = (chk.getAttribute('data-familia') === filtroFamilia);
      }
    });
    this.ejecutarSimuladorAcoplamientoPreventivo();
  },

  aplicarGalloSugeridoSimulador(galloId) {
    const selectMacho = document.getElementById('sim-gobe-macho');
    if (selectMacho && galloId) {
      selectMacho.value = galloId;
      this.ejecutarSimuladorAcoplamientoPreventivo();
      this.mostrarNotificacionToast('🧬 Aplicado Gallo alternativo según rotación circular de Gobe.', 'success');
    }
  },

  descartarHembrasIncompatiblesSimulador(machoId) {
    const checkboxes = document.querySelectorAll('.sim-gobe-hembra-chk:checked');
    let descartadas = 0;
    checkboxes.forEach(chk => {
      const { fx } = this.calcularFxWright5Gen(machoId, chk.value, this.estado.animales);
      if (fx >= 0.05) {
        chk.checked = false;
        descartadas++;
      }
    });
    this.ejecutarSimuladorAcoplamientoPreventivo();
    this.mostrarNotificacionToast(
      descartadas > 0
        ? `✅ Se retiraron ${descartadas} hembra(s) con F_x >= 5% del lote simulado.`
        : 'ℹ️ Todas las hembras seleccionadas ya presentan F_x < 5%.',
      'info'
    );
  },

  ejecutarSimuladorAcoplamientoPreventivo() {
    const selectMacho = document.getElementById('sim-gobe-macho');
    const badgeFamiliaMacho = document.getElementById('sim-gobe-macho-familia-badge');
    const cardDiag = document.getElementById('sim-gobe-diagnostico-card');
    const badgeSemaforo = document.getElementById('sim-gobe-semaforo-badge');
    const fxGlobalEl = document.getElementById('sim-gobe-fx-valor-global');
    const desgloseCont = document.getElementById('sim-gobe-desglose-parejas');
    const sugerenciasCont = document.getElementById('sim-gobe-sugerencias-content');

    if (!selectMacho || !cardDiag || !desgloseCont) return;

    const machoId = selectMacho.value;
    const macho = (this.estado.animales || []).find(a => a.id === machoId);
    if (badgeFamiliaMacho) {
      badgeFamiliaMacho.textContent = macho ? `${macho.familia_origen || 'Sin Familia'} · #${macho.numero_anilla}` : 'Sin selección';
    }

    const hembrasIds = Array.from(document.querySelectorAll('.sim-gobe-hembra-chk:checked')).map(el => el.value);

    if (!macho || hembrasIds.length === 0) {
      cardDiag.className = 'p-4 rounded-xl bg-slate-950 border-2 border-slate-800 transition-all space-y-3';
      if (badgeSemaforo) {
        badgeSemaforo.className = 'mt-1 inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-black bg-slate-900 text-slate-300 border border-slate-700';
        badgeSemaforo.innerHTML = '<span>⚪ Selecciona 1 Gallo y al menos 1 Gallina</span>';
      }
      if (fxGlobalEl) {
        fxGlobalEl.textContent = '--';
        fxGlobalEl.className = 'font-mono font-black text-xl text-slate-400';
      }
      desgloseCont.innerHTML = '<div class="p-4 text-center text-xs text-slate-500">Selecciona un Gallo reproductor y marca una o varias Gallinas para calcular el $F_x$ a 5 generaciones.</div>';
      if (sugerenciasCont) {
        sugerenciasCont.innerHTML = 'Selecciona los reproductores para recibir recomendaciones de rotación circular de machos o sustitución de hembras según la Regla de Gobe.';
      }
      return;
    }

    const resultadosParejas = hembrasIds.map(hId => {
      const hembra = (this.estado.animales || []).find(a => a.id === hId);
      const calc = this.calcularFxWright5Gen(macho.id, hId, this.estado.animales);
      const diag = this.obtenerDiagnosticoColorWright(calc.fx);
      return {
        hembra,
        fx: calc.fx,
        fxPct: (calc.fx * 100).toFixed(2),
        ancestrosComunes: calc.ancestrosComunes,
        diag
      };
    }).filter(r => r.hembra);

    const fxMax = Math.max(...resultadosParejas.map(r => r.fx), 0);
    const fxMedio = resultadosParejas.reduce((acc, r) => acc + r.fx, 0) / (resultadosParejas.length || 1);
    const diagGlobal = this.obtenerDiagnosticoColorWright(fxMax);

    cardDiag.className = `p-4 rounded-xl border-2 transition-all space-y-3 ${diagGlobal.borderClass}`;
    if (badgeSemaforo) {
      badgeSemaforo.className = `mt-1 inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-black border ${diagGlobal.badgeClass}`;
      badgeSemaforo.textContent = diagGlobal.etiqueta;
    }
    if (fxGlobalEl) {
      fxGlobalEl.className = `font-mono font-black text-lg sm:text-xl ${diagGlobal.textClass}`;
      fxGlobalEl.textContent = resultadosParejas.length === 1
        ? `F_x = ${(fxMax * 100).toFixed(2)}%`
        : `Media: ${(fxMedio * 100).toFixed(2)}% · Máx: ${(fxMax * 100).toFixed(2)}%`;
    }

    desgloseCont.innerHTML = resultadosParejas.map(r => {
      const comunesTxt = r.ancestrosComunes.length > 0
        ? `Ancestros comunes (5 Gen): ${r.ancestrosComunes.map(c => `#${this.escaparHtml(c.anilla)}`).join(', ')}`
        : 'Sin ancestros comunes en 5 generaciones (F_x = 0.00%)';
      return `
        <div class="p-2.5 rounded-lg bg-slate-900/95 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div>
            <div class="flex items-center gap-2">
              <span>${r.diag.icono}</span>
              <span class="font-mono font-bold text-white">♂ #${this.escaparHtml(macho.numero_anilla)} × ♀ #${this.escaparHtml(r.hembra.numero_anilla)}</span>
              <span class="text-slate-300 font-semibold">(${this.escaparHtml(r.hembra.nombre || r.hembra.codigo_identificacion)})</span>
              <span class="px-1.5 py-0.2 rounded text-[10px] bg-pink-950/80 text-pink-300 border border-pink-800/50">${this.escaparHtml(r.hembra.familia_origen || 'Sin fam.')}</span>
            </div>
            <p class="text-[10px] text-slate-400 mt-0.5">${comunesTxt}</p>
          </div>
          <div class="text-right shrink-0">
            <span class="font-mono font-black text-sm ${r.diag.textClass}">F_x: ${r.fxPct}%</span>
            <span class="block text-[10px] ${r.diag.textClass}">${r.diag.resumenCorto}</span>
          </div>
        </div>
      `;
    }).join('');

    // Generar sugerencias de rotación de machos o sustitución de hembras según la Regla de Gobe
    if (sugerenciasCont) {
      const rotacionGobeHacia = {
        'Familia A': 'Familia B',
        'Familia B': 'Familia C',
        'Familia C': 'Familia D',
        'Familia D': 'Familia E',
        'Familia E': 'Familia A'
      };
      const donanteIdealPorFamilia = {
        'Familia B': 'Familia A',
        'Familia C': 'Familia B',
        'Familia D': 'Familia C',
        'Familia E': 'Familia D',
        'Familia A': 'Familia E'
      };

      const famMacho = macho.familia_origen || 'Familia A';
      const famReceptoraIdeal = rotacionGobeHacia[famMacho] || 'Familia B';
      const parejasEnRiesgo = resultadosParejas.filter(r => r.fx >= 0.05);

      // Buscar mejor gallo alternativo para el conjunto de hembras seleccionadas
      const todosMachos = (this.estado.animales || []).filter(a => a.sexo === 'Macho' && a.estado !== 'Baja' && a.id !== macho.id && this.perteneceAUsuarioActivo(a));
      let mejorGalloAlt = null;
      let menorFxAlt = Infinity;

      todosMachos.forEach(mAlt => {
        const maxFxConMAlt = Math.max(...hembrasIds.map(hId => this.calcularFxWright5Gen(mAlt.id, hId, this.estado.animales).fx), 0);
        const famHembraPrincipal = resultadosParejas[0]?.hembra?.familia_origen;
        const cumpleGobe = famHembraPrincipal && donanteIdealPorFamilia[famHembraPrincipal] === mAlt.familia_origen;
        const score = maxFxConMAlt - (cumpleGobe ? 0.001 : 0);
        if (score < menorFxAlt) {
          menorFxAlt = maxFxConMAlt;
          mejorGalloAlt = mAlt;
        }
      });

      // Buscar hembras alternativas de la familia receptora ideal con Fx < 5%
      const hembrasAlternativas = (this.estado.animales || []).filter(
        a => a.sexo === 'Hembra' && a.estado !== 'Baja' && !hembrasIds.includes(a.id) && this.perteneceAUsuarioActivo(a)
      ).filter(hAlt => this.calcularFxWright5Gen(macho.id, hAlt.id, this.estado.animales).fx < 0.05);

      if (parejasEnRiesgo.length === 0) {
        sugerenciasCont.innerHTML = `
          <div class="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-emerald-200 text-xs space-y-1">
            <p>✅ <strong>Acoplamiento Óptimo según Regla de Gobe y Wright ($F_x &lt; 5\%$):</strong> El Gallo <strong>#${this.escaparHtml(macho.numero_anilla)} (${this.escaparHtml(famMacho)})</strong> presenta total compatibilidad genética con las ${resultadosParejas.length} hembra(s) seleccionada(s).</p>
            <p class="text-[11px] text-emerald-300/90">• Según el círculo de Gobe, los machos de <strong>${this.escaparHtml(famMacho)}</strong> rotan preferentemente hacia el lote de <strong>${this.escaparHtml(famReceptoraIdeal)}</strong>.</p>
          </div>
        `;
      } else {
        let htmlSug = `
          <div class="space-y-2">
            <p class="text-amber-300 font-semibold">
              ⚠️ Se han detectado <strong>${parejasEnRiesgo.length} acoplamiento(s)</strong> con consanguinidad $F_x \ge 5\%$. Alternativas recomendadas por la Regla de Gobe:
            </p>
            <ul class="list-disc list-inside space-y-1 text-[11px] text-slate-300">
              <li><strong>Rotación Circular de Macho:</strong> El gallo actual pertenece a <strong>${this.escaparHtml(famMacho)}</strong>, por lo que su destino óptimo sin parentesco es cubrir hembras de <strong>${this.escaparHtml(famReceptoraIdeal)}</strong>.</li>
        `;
        if (mejorGalloAlt) {
          htmlSug += `
              <li><strong>Sustitución de Reproductor Macho:</strong> Cambiar al Gallo <strong>#${this.escaparHtml(mejorGalloAlt.numero_anilla)} (${this.escaparHtml(mejorGalloAlt.nombre || mejorGalloAlt.codigo_identificacion)} · ${this.escaparHtml(mejorGalloAlt.familia_origen)})</strong> reduce el $F_x$ máximo del lote al <strong>${(menorFxAlt * 100).toFixed(2)}%</strong>.</li>
          `;
        }
        if (hembrasAlternativas.length > 0) {
          const hEj = hembrasAlternativas.slice(0, 2).map(h => `#${this.escaparHtml(h.numero_anilla)} (${this.escaparHtml(h.familia_origen)})`).join(', ');
          htmlSug += `
              <li><strong>Sustitución de Hembras:</strong> Retirar las gallinas con parentesco común y sustituirlas por reproductoras compatibles (${hEj}).</li>
          `;
        }
        htmlSug += `</ul><div class="flex flex-wrap items-center gap-2 pt-1">`;
        if (mejorGalloAlt) {
          htmlSug += `
            <button type="button" onclick="app.aplicarGalloSugeridoSimulador('${mejorGalloAlt.id}')" class="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-slate-950 font-bold text-[11px] flex items-center gap-1.5 transition">
              <i class="fa-solid fa-arrows-rotate"></i>
              <span>Rotar a Gallo #${this.escaparHtml(mejorGalloAlt.numero_anilla)} (${this.escaparHtml(mejorGalloAlt.familia_origen)})</span>
            </button>
          `;
        }
        htmlSug += `
            <button type="button" onclick="app.seleccionarFamiliaSimulador('${famReceptoraIdeal}')" class="px-3 py-1.5 rounded-lg bg-pink-600 hover:bg-pink-500 text-slate-950 font-bold text-[11px] flex items-center gap-1.5 transition">
              <i class="fa-solid fa-venus-mars"></i>
              <span>Cargar Lote Receptor Gobe (${this.escaparHtml(famReceptoraIdeal)})</span>
            </button>
            <button type="button" onclick="app.descartarHembrasIncompatiblesSimulador('${macho.id}')" class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 font-semibold text-[11px] transition">
              Desmarcar Hembras con $F_x \ge 5\%$
            </button>
          </div></div>
        `;
        sugerenciasCont.innerHTML = htmlSug;
      }
    }
  },

  // =========================================================================
  // GESTOR DE LOTES DE INCUBACIÓN Y TRAZABILIDAD DE RECRÍA (DÍA 21 + ANILLAS EE)
  // =========================================================================

  obtenerLotesIncubacionSemilla() {
    return [
      {
        id: 'inc-sem-01',
        nombre_lote: 'Incubación #01 - Familia Gobe B',
        lote_apareamiento_id: 'lote-sem-01',
        familia_gobe: 'Familia B',
        id_gallo: 'alac-001',
        huevos_cargados: 25,
        peso_rango_g: '55 g - 70 g (Media: 62.2 g)',
        fecha_puesta: '2026-03-01',
        fecha_entrada: '2026-03-10',
        fecha_miraje: '2026-03-17',
        fecha_eclosion: '2026-03-31',
        huevos_fertiles: 22,
        pollitos_nacidos: 19,
        estado_ciclo: 'Eclosionado / Recría',
        pollitos_anillados: [
          {
            id: 'alac-005',
            numero_anilla: 'EE-ES-2026-20-0142',
            sexo: 'Macho',
            calibre_mm: 20,
            id_madre: 'alac-004'
          }
        ],
        usuario_id: 'usr-criador-01',
        explotacion_id: 'exp-01',
        codigo_rega: 'ES030140001234'
      }
    ];
  },

  recalcularFechasIncubacionForm() {
    const inputEntrada = document.getElementById('inc-fecha-entrada');
    const inputMiraje = document.getElementById('inc-fecha-miraje');
    const inputEclosion = document.getElementById('inc-fecha-eclosion');
    const inputPuesta = document.getElementById('inc-fecha-puesta');
    if (!inputEntrada || !inputEntrada.value) return;

    const fechaBase = new Date(inputEntrada.value + 'T12:00:00');
    if (isNaN(fechaBase.getTime())) return;

    if (inputPuesta && !inputPuesta.value) {
      const fPuesta = new Date(fechaBase);
      fPuesta.setDate(fPuesta.getDate() - 7);
      inputPuesta.value = fPuesta.toISOString().split('T')[0];
    }

    if (inputMiraje) {
      const fMiraje = new Date(fechaBase);
      fMiraje.setDate(fMiraje.getDate() + 7); // Día 7: Ovoscopia / Miraje oficial
      inputMiraje.value = fMiraje.toISOString().split('T')[0];
    }

    if (inputEclosion) {
      const fEclosion = new Date(fechaBase);
      fEclosion.setDate(fEclosion.getDate() + 21); // Día 21: Eclosión en Nacedora
      inputEclosion.value = fEclosion.toISOString().split('T')[0];
    }
  },

  obtenerHuevosAptosPorFamilia(familiaGobe = null) {
    const controlesPropios = (this.estado.controlesPuesta || []).filter(c => this.perteneceAUsuarioActivo(c));
    const controlesAptos = controlesPropios.filter(c => {
      const peso = Number(c.peso_medio_huevo_g) || 0;
      const enRangoPeso = peso >= 55.0 && peso <= 70.0;
      if (!enRangoPeso || c.conforme_estandar === false) return false;
      if (!familiaGobe || familiaGobe === 'TODAS') return true;
      const gallina = (this.estado.animales || []).find(a => a.id === c.animal_id);
      return gallina && gallina.familia_origen === familiaGobe;
    });

    const totalHuevosAptos = controlesAptos.reduce((acc, c) => acc + (Number(c.total_huevos_15d) || 0), 0);
    const pesoMedio = controlesAptos.length > 0
      ? (controlesAptos.reduce((acc, c) => acc + (Number(c.peso_medio_huevo_g) || 60), 0) / controlesAptos.length).toFixed(1)
      : '61.5';

    return {
      totalHuevosAptos,
      pesoMedio,
      numControles: controlesAptos.length
    };
  },

  alCambiarLoteGobeIncubacion(valorSelect) {
    const inputHuevos = document.getElementById('inc-huevos-cargados');
    const infoAptos = document.getElementById('inc-huevos-aptos-info');
    const inputNombre = document.getElementById('inc-nombre-lote');

    let familia = valorSelect;
    const loteObj = (this.estado.lotes || []).find(l => l.id === valorSelect);
    if (loteObj) {
      familia = loteObj.familia_receptora;
    }

    const { totalHuevosAptos, pesoMedio } = this.obtenerHuevosAptosPorFamilia(familia);
    if (inputHuevos && totalHuevosAptos > 0) {
      inputHuevos.value = totalHuevosAptos;
    }
    if (infoAptos) {
      infoAptos.textContent = totalHuevosAptos > 0
        ? `✓ ${totalHuevosAptos} huevos aptos (55-70g · Media ${pesoMedio}g)`
        : `Rango estándar 55g - 70g (${familia || 'Lote Gobe'})`;
    }
    if (inputNombre && !inputNombre.value.trim() && familia) {
      const numSiguiente = ((this.estado.lotesIncubacion || []).length + 1).toString().padStart(2, '0');
      inputNombre.value = `Incubación #${numSiguiente} - ${familia.replace('Familia ', 'Familia Gobe ')}`;
    }
  },

  renderizarModuloIncubacion() {
    const selectLote = document.getElementById('inc-lote-gobe-select');
    const contLista = document.getElementById('lista-lotes-incubacion-container');
    if (!contLista) return;

    // Inicializar fechas por defecto en el formulario si están vacías
    const inputEntrada = document.getElementById('inc-fecha-entrada');
    if (inputEntrada && !inputEntrada.value) {
      inputEntrada.value = new Date().toISOString().split('T')[0];
      this.recalcularFechasIncubacionForm();
    }

    // Poblar selector de Lotes Gobe / Familias
    if (selectLote) {
      const valActual = selectLote.value;
      const lotesPropios = (this.estado.lotes || []).filter(l => this.perteneceAUsuarioActivo(l));
      selectLote.innerHTML = '<option value="">-- Seleccionar Lote / Familia Gobe --</option>';
      lotesPropios.forEach(l => {
        const gallo = (this.estado.animales || []).find(a => a.id === l.id_gallo);
        const opt = document.createElement('option');
        opt.value = l.id;
        opt.textContent = `${l.codigo_lote} · ${l.familia_receptora} (Gallo: ${gallo ? '#' + gallo.numero_anilla : l.familia_macho})`;
        selectLote.appendChild(opt);
      });
      ['Familia A', 'Familia B', 'Familia C', 'Familia D', 'Familia E'].forEach(fam => {
        const opt = document.createElement('option');
        opt.value = fam;
        opt.textContent = `Lote Reproductor ${fam} (Regla de Gobe)`;
        selectLote.appendChild(opt);
      });
      if (valActual) selectLote.value = valActual;
    }

    const lotesInc = (this.estado.lotesIncubacion || []).filter(li => this.perteneceAUsuarioActivo(li));
    const stockAptosGlobal = this.obtenerHuevosAptosPorFamilia('TODAS');

    // Calcular KPIs globales de incubación y nacedora
    const totalCargados = lotesInc.reduce((acc, l) => acc + (Number(l.huevos_cargados) || 0), 0);
    const lotesConMiraje = lotesInc.filter(l => l.huevos_fertiles !== null && l.huevos_fertiles !== undefined && l.huevos_fertiles !== '');
    const totalCargadosMiraje = lotesConMiraje.reduce((acc, l) => acc + (Number(l.huevos_cargados) || 0), 0);
    const totalFertiles = lotesConMiraje.reduce((acc, l) => acc + (Number(l.huevos_fertiles) || 0), 0);
    const pctFertilidadGlobal = totalCargadosMiraje > 0 ? ((totalFertiles / totalCargadosMiraje) * 100).toFixed(1) : '0.0';

    const lotesConNacedora = lotesInc.filter(l => l.pollitos_nacidos !== null && l.pollitos_nacidos !== undefined && l.pollitos_nacidos !== '');
    const totalBaseNacedora = lotesConNacedora.reduce((acc, l) => acc + (Number(l.huevos_fertiles) || Number(l.huevos_cargados) || 0), 0);
    const totalNacidos = lotesConNacedora.reduce((acc, l) => acc + (Number(l.pollitos_nacidos) || 0), 0);
    const pctNacimientoGlobal = totalBaseNacedora > 0 ? ((totalNacidos / totalBaseNacedora) * 100).toFixed(1) : '0.0';

    const elKpiLotes = document.getElementById('kpi-inc-lotes');
    const elKpiHuevos = document.getElementById('kpi-inc-huevos');
    const elKpiStock = document.getElementById('kpi-inc-aptos-stock');
    const elKpiFert = document.getElementById('kpi-inc-fertilidad');
    const elKpiNac = document.getElementById('kpi-inc-nacimiento');

    if (elKpiLotes) elKpiLotes.textContent = lotesInc.length;
    if (elKpiHuevos) elKpiHuevos.textContent = totalCargados;
    if (elKpiStock) elKpiStock.textContent = `Aptos en control puesta (55-70g): ${stockAptosGlobal.totalHuevosAptos} huevos`;
    if (elKpiFert) elKpiFert.textContent = `${pctFertilidadGlobal}%`;
    if (elKpiNac) elKpiNac.textContent = `${pctNacimientoGlobal}%`;

    if (lotesInc.length === 0) {
      contLista.innerHTML = `
        <div class="p-8 rounded-xl bg-slate-900 border border-slate-800 text-center text-xs text-slate-400">
          No hay lotes de incubación abiertos para este aviario. Utiliza el formulario superior para abrir un lote (ej. <em>Incubación #05 - Familia Gobe 2</em>) vinculando los huevos de 55 g a 70 g.
        </div>
      `;
      return;
    }

    contLista.innerHTML = lotesInc.map(lote => {
      const cargados = Number(lote.huevos_cargados) || 0;
      const fertiles = (lote.huevos_fertiles !== null && lote.huevos_fertiles !== undefined && lote.huevos_fertiles !== '')
        ? Number(lote.huevos_fertiles)
        : null;
      const nacidos = (lote.pollitos_nacidos !== null && lote.pollitos_nacidos !== undefined && lote.pollitos_nacidos !== '')
        ? Number(lote.pollitos_nacidos)
        : null;

      const pctFertilidad = (fertiles !== null && cargados > 0)
        ? ((fertiles / cargados) * 100).toFixed(1) + '%'
        : 'Pendiente';
      const baseNac = (fertiles !== null && fertiles > 0) ? fertiles : cargados;
      const pctNacimientoSobreFertiles = (nacidos !== null && baseNac > 0)
        ? ((nacidos / baseNac) * 100).toFixed(1) + '%'
        : 'Pendiente';
      const pctNacimientoSobreTotal = (nacidos !== null && cargados > 0)
        ? ((nacidos / cargados) * 100).toFixed(1) + '%'
        : '--';

      const gallo = (this.estado.animales || []).find(a => a.id === lote.id_gallo);
      const anilladosArr = Array.isArray(lote.pollitos_anillados) ? lote.pollitos_anillados : [];

      return `
        <div class="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  ${this.escaparHtml(lote.estado_ciclo || 'En Incubadora')}
                </span>
                <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-pink-950/80 text-pink-300 border border-pink-800/60">
                  ${this.escaparHtml(lote.familia_gobe || 'Familia Gobe')}
                </span>
                <span class="text-[11px] text-sky-300 font-mono">
                  ♂ Gallo: ${gallo ? '#' + this.escaparHtml(gallo.numero_anilla) + ' (' + this.escaparHtml(gallo.nombre || gallo.codigo_identificacion) + ')' : 'Lote Gobe'}
                </span>
              </div>
              <h5 class="text-base font-black text-white mt-1">${this.escaparHtml(lote.nombre_lote)}</h5>
              <p class="text-[11px] text-slate-400">
                Huevos vinculados (55 g - 70 g): <strong class="text-amber-300 font-mono">${cargados} huevos</strong> · ${this.escaparHtml(lote.peso_rango_g || '55 g - 70 g')}
              </p>
            </div>

            <div class="flex flex-wrap items-center gap-2">
              <button type="button"
                      onclick="app.abrirModalAnillarPollitos('${lote.id}')"
                      class="px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 text-xs font-black flex items-center gap-1.5 shadow-lg shadow-amber-500/20 transition">
                <i class="fa-solid fa-ring"></i>
                <span>💍 Asignar Anillas EE (♂ 20mm / ♀ 18mm)</span>
              </button>
            </div>
          </div>

          <!-- Seguimiento del Calendario de 21 Días -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div class="p-3 rounded-lg bg-slate-950 border border-slate-800">
              <span class="text-[10px] text-slate-400 uppercase font-bold block">1. Fecha de Puesta</span>
              <span class="font-mono font-bold text-white mt-0.5 block">${this.escaparHtml(lote.fecha_puesta || '--')}</span>
              <span class="text-[10px] text-emerald-400">Selección 55g - 70g</span>
            </div>
            <div class="p-3 rounded-lg bg-slate-950 border border-amber-800/50">
              <span class="text-[10px] text-amber-300 uppercase font-bold block">2. Entrada Incubadora</span>
              <span class="font-mono font-bold text-amber-300 mt-0.5 block">${this.escaparHtml(lote.fecha_entrada || '--')}</span>
              <span class="text-[10px] text-slate-400">Día 0 · 37.7 °C / 55% HR</span>
            </div>
            <div class="p-3 rounded-lg bg-slate-950 border border-sky-800/50">
              <span class="text-[10px] text-sky-300 uppercase font-bold block">3. Ovoscopia / Miraje</span>
              <span class="font-mono font-bold text-sky-300 mt-0.5 block">${this.escaparHtml(lote.fecha_miraje || '--')}</span>
              <span class="text-[10px] text-slate-400">Día 7-10 · Fértiles: <strong>${fertiles !== null ? fertiles : '--'}</strong></span>
            </div>
            <div class="p-3 rounded-lg bg-slate-950 border border-emerald-800/50">
              <span class="text-[10px] text-emerald-300 uppercase font-bold block">4. Eclosión Estimada (Día 21)</span>
              <span class="font-mono font-bold text-emerald-300 mt-0.5 block">${this.escaparHtml(lote.fecha_eclosion || '--')}</span>
              <span class="text-[10px] text-slate-400">Nacedora · Nacidos: <strong>${nacidos !== null ? nacidos : '--'}</strong></span>
            </div>
          </div>

          <!-- Balance de Nacedora y Controles de Actualización Rápida -->
          <div class="p-3.5 rounded-xl bg-slate-950 border border-slate-800 grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
            <div class="lg:col-span-5 grid grid-cols-3 gap-2 text-center">
              <div class="p-2 rounded-lg bg-slate-900 border border-slate-800">
                <span class="text-[10px] text-slate-400 block">% Fertilidad</span>
                <span class="font-mono font-black text-sm text-sky-400">${pctFertilidad}</span>
                <span class="text-[9px] text-slate-500 block">${fertiles !== null ? `${fertiles}/${cargados} fértiles` : 'Sin miraje'}</span>
              </div>
              <div class="p-2 rounded-lg bg-slate-900 border border-slate-800">
                <span class="text-[10px] text-slate-400 block">% Nacimiento</span>
                <span class="font-mono font-black text-sm text-emerald-400">${pctNacimientoSobreFertiles}</span>
                <span class="text-[9px] text-slate-500 block">Total: ${pctNacimientoSobreTotal}</span>
              </div>
              <div class="p-2 rounded-lg bg-slate-900 border border-slate-800">
                <span class="text-[10px] text-slate-400 block">Anillados EE (RN)</span>
                <span class="font-mono font-black text-sm text-amber-400">${anilladosArr.length} / ${nacidos !== null ? nacidos : 0}</span>
                <span class="text-[9px] text-slate-500 block">♂20mm · ♀18mm</span>
              </div>
            </div>

            <div class="lg:col-span-7 flex flex-wrap items-end gap-2">
              <div class="flex-1 min-w-[110px]">
                <label class="block text-[10px] text-sky-300 font-bold mb-1">Huevos Fértiles (Miraje)</label>
                <input type="number" id="edit-inc-fertiles-${lote.id}" min="0" max="${cargados}" value="${fertiles !== null ? fertiles : ''}" placeholder="0 - ${cargados}" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-sky-300 font-mono">
              </div>
              <div class="flex-1 min-w-[110px]">
                <label class="block text-[10px] text-emerald-300 font-bold mb-1">Pollitos Nacidos (Día 21)</label>
                <input type="number" id="edit-inc-nacidos-${lote.id}" min="0" max="${cargados}" value="${nacidos !== null ? nacidos : ''}" placeholder="0 - ${fertiles !== null ? fertiles : cargados}" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-emerald-300 font-mono">
              </div>
              <div class="flex-1 min-w-[140px]">
                <label class="block text-[10px] text-slate-400 font-bold mb-1">Fase del Lote</label>
                <select id="edit-inc-estado-${lote.id}" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white">
                  <option value="En Incubadora" ${lote.estado_ciclo === 'En Incubadora' ? 'selected' : ''}>🌡️ En Incubadora</option>
                  <option value="Ovoscopia Realizada" ${lote.estado_ciclo === 'Ovoscopia Realizada' ? 'selected' : ''}>🔦 Ovoscopia Realizada</option>
                  <option value="En Nacedora" ${lote.estado_ciclo === 'En Nacedora' ? 'selected' : ''}>🐣 En Nacedora</option>
                  <option value="Eclosionado / Recría" ${lote.estado_ciclo === 'Eclosionado / Recría' ? 'selected' : ''}>💍 Eclosionado / Recría</option>
                </select>
              </div>
              <button type="button"
                      onclick="app.actualizarDatosMirajeNacedora('${lote.id}')"
                      class="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-slate-950 font-bold text-xs transition shrink-0">
                Guardar Balance
              </button>
            </div>
          </div>

          ${anilladosArr.length > 0 ? `
            <div class="pt-1">
              <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                Pollitos inscritos en Libro Genealógico (Sección RN) con Anilla Entente Europea:
              </span>
              <div class="flex flex-wrap gap-1.5">
                ${anilladosArr.map(p => `
                  <span onclick="app.verFichaAnimal('${p.id}')" class="cursor-pointer px-2.5 py-1 rounded-lg bg-amber-950/50 hover:bg-amber-900/60 border border-amber-700/50 text-[11px] font-mono text-amber-200 flex items-center gap-1.5 transition">
                    <i class="fa-solid fa-ring text-amber-400"></i>
                    <strong>#${this.escaparHtml(p.numero_anilla)}</strong>
                    <span>(${p.sexo === 'Macho' ? '♂ Gallo 20mm' : '♀ Gallina 18mm'})</span>
                  </span>
                `).join('')}
              </div>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  },

  async guardarLoteIncubacion(event) {
    event.preventDefault();

    const u = this.estado.usuarioActivo;
    const aviario = this.estado.aviario || this.estado.aviarioActivo;
    if (!u || this.estado.modoVisitante) {
      alert('Debes iniciar sesión con tu cuenta de criador para abrir lotes de incubación.');
      return;
    }

    const nombreLote = document.getElementById('inc-nombre-lote')?.value.trim();
    const valorSelectGobe = document.getElementById('inc-lote-gobe-select')?.value;
    const huevosCargados = parseInt(document.getElementById('inc-huevos-cargados')?.value || '0', 10);
    const fechaPuesta = document.getElementById('inc-fecha-puesta')?.value;
    const fechaEntrada = document.getElementById('inc-fecha-entrada')?.value;
    const fechaMiraje = document.getElementById('inc-fecha-miraje')?.value;
    const fechaEclosion = document.getElementById('inc-fecha-eclosion')?.value;
    const fertilesStr = document.getElementById('inc-huevos-fertiles')?.value;
    const nacidosStr = document.getElementById('inc-pollitos-nacidos')?.value;
    const estadoCiclo = document.getElementById('inc-estado-ciclo')?.value || 'En Incubadora';

    const loteApareamiento = (this.estado.lotes || []).find(l => l.id === valorSelectGobe);
    const familiaGobe = loteApareamiento ? loteApareamiento.familia_receptora : (valorSelectGobe || 'Familia B');
    const machosPropios = (this.estado.animales || []).filter(a => a.sexo === 'Macho' && this.perteneceAUsuarioActivo(a));
    const idGallo = loteApareamiento?.id_gallo || machosPropios[0]?.id || null;

    const infoAptos = this.obtenerHuevosAptosPorFamilia(familiaGobe);

    const nuevoLoteInc = {
      id: 'inc-' + Date.now(),
      nombre_lote: nombreLote,
      lote_apareamiento_id: loteApareamiento ? loteApareamiento.id : null,
      familia_gobe: familiaGobe,
      id_gallo: idGallo,
      huevos_cargados: huevosCargados,
      peso_rango_g: `55 g - 70 g (Media lote: ${infoAptos.pesoMedio} g)`,
      fecha_puesta: fechaPuesta,
      fecha_entrada: fechaEntrada,
      fecha_miraje: fechaMiraje,
      fecha_eclosion: fechaEclosion,
      huevos_fertiles: fertilesStr !== '' ? parseInt(fertilesStr, 10) : null,
      pollitos_nacidos: nacidosStr !== '' ? parseInt(nacidosStr, 10) : null,
      estado_ciclo: estadoCiclo,
      pollitos_anillados: [],
      usuario_id: u.id,
      explotacion_id: aviario?.id || u.explotacion_id || null,
      codigo_rega: aviario?.codigo_rega || aviario?.rega || u.rega || 'TEMP-REGA-001',
      creado_en: new Date().toISOString()
    };

    await this.db.put('lotesIncubacion', nuevoLoteInc);
    if (!Array.isArray(this.estado.lotesIncubacion)) this.estado.lotesIncubacion = [];
    this.estado.lotesIncubacion.unshift(nuevoLoteInc);

    if (navigator.onLine && this.supabaseClient) {
      try {
        const { error } = await this.supabaseClient.from('lotes_incubacion').upsert(nuevoLoteInc);
        if (error) throw error;
      } catch (_) {
        await this.db.put('syncQueue', { tipo: 'LOTE_INCUBACION', payload: nuevoLoteInc, creado_en: Date.now() });
      }
    } else {
      await this.db.put('syncQueue', { tipo: 'LOTE_INCUBACION', payload: nuevoLoteInc, creado_en: Date.now() });
    }

    this.estado.syncQueue = await this.db.getAll('syncQueue');
    this.actualizarContadorSyncQueue();
    this.renderizarModuloIncubacion();

    const form = document.getElementById('form-nuevo-lote-incubacion');
    if (form) form.reset();
    const inputEnt = document.getElementById('inc-fecha-entrada');
    if (inputEnt) {
      inputEnt.value = new Date().toISOString().split('T')[0];
      this.recalcularFechasIncubacionForm();
    }

    this.mostrarNotificacionToast(`🐣 Lote "${nombreLote}" abierto con ${huevosCargados} huevos (55-70g). Eclosión Día 21: ${fechaEclosion}`, 'success');
  },

  async actualizarDatosMirajeNacedora(loteIncId) {
    const lote = (this.estado.lotesIncubacion || []).find(l => l.id === loteIncId);
    if (!lote) return;

    const valFertiles = document.getElementById(`edit-inc-fertiles-${loteIncId}`)?.value;
    const valNacidos = document.getElementById(`edit-inc-nacidos-${loteIncId}`)?.value;
    const valEstado = document.getElementById(`edit-inc-estado-${loteIncId}`)?.value;

    lote.huevos_fertiles = (valFertiles !== undefined && valFertiles !== '') ? parseInt(valFertiles, 10) : null;
    lote.pollitos_nacidos = (valNacidos !== undefined && valNacidos !== '') ? parseInt(valNacidos, 10) : null;
    if (valEstado) lote.estado_ciclo = valEstado;

    await this.db.put('lotesIncubacion', lote);
    if (!navigator.onLine || !this.supabaseClient) {
      await this.db.put('syncQueue', { tipo: 'LOTE_INCUBACION', payload: lote, creado_en: Date.now() });
      this.estado.syncQueue = await this.db.getAll('syncQueue');
      this.actualizarContadorSyncQueue();
    }

    this.renderizarModuloIncubacion();
    this.mostrarNotificacionToast(`✅ Balance de incubación y nacedora actualizado para "${lote.nombre_lote}".`, 'success');
  },

  abrirModalAnillarPollitos(loteIncId) {
    const lote = (this.estado.lotesIncubacion || []).find(l => l.id === loteIncId);
    if (!lote) return;

    const modal = document.getElementById('modal-anillar-incubacion');
    if (!modal) return;

    document.getElementById('anillar-inc-lote-id').value = lote.id;
    const subEl = document.getElementById('anillar-inc-lote-subtitle');
    if (subEl) subEl.textContent = `${lote.nombre_lote} · Calibres EE: Gallo 20 mm / Gallina 18 mm`;

    const gallo = (this.estado.animales || []).find(a => a.id === lote.id_gallo);
    const padreLbl = document.getElementById('anillar-inc-padre-lbl');
    const famLbl = document.getElementById('anillar-inc-familia-lbl');
    const nacLbl = document.getElementById('anillar-inc-nacidos-lbl');
    const aniLbl = document.getElementById('anillar-inc-anillados-lbl');

    if (padreLbl) padreLbl.textContent = gallo ? `#${gallo.numero_anilla}` : 'Lote Gobe';
    if (famLbl) famLbl.textContent = lote.familia_gobe || 'Familia B';
    if (nacLbl) nacLbl.textContent = lote.pollitos_nacidos ?? 0;
    if (aniLbl) aniLbl.textContent = Array.isArray(lote.pollitos_anillados) ? lote.pollitos_anillados.length : 0;

    // Poblar selector de Madres del lote Gobe correspondiente
    const selectMadre = document.getElementById('anillar-inc-madre');
    if (selectMadre) {
      const hembrasPropias = (this.estado.animales || []).filter(a => a.sexo === 'Hembra' && this.perteneceAUsuarioActivo(a));
      const hembrasLote = hembrasPropias.filter(h => !lote.familia_gobe || h.familia_origen === lote.familia_gobe);
      const listaMadres = hembrasLote.length > 0 ? hembrasLote : hembrasPropias;

      selectMadre.innerHTML = '<option value="">-- Seleccionar Gallina Madre --</option>';
      listaMadres.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = `♀ #${m.numero_anilla} (${m.nombre || m.codigo_identificacion}) · ${m.familia_origen}`;
        selectMadre.appendChild(opt);
      });
      if (listaMadres.length > 0) selectMadre.value = listaMadres[0].id;
    }

    this.actualizarCalibreAnillaModal();

    // Renderizar historial de pollitos ya anillados en este lote
    const histBox = document.getElementById('anillar-inc-historial-box');
    const histLista = document.getElementById('anillar-inc-historial-lista');
    const anillados = Array.isArray(lote.pollitos_anillados) ? lote.pollitos_anillados : [];
    if (histBox && histLista) {
      if (anillados.length > 0) {
        histBox.classList.remove('hidden');
        histLista.innerHTML = anillados.map(p => `
          <span class="px-2 py-0.5 rounded bg-amber-950/70 border border-amber-700/60 text-[10px] font-mono text-amber-200">
            #${this.escaparHtml(p.numero_anilla)} (${p.sexo === 'Macho' ? '♂ 20mm' : '♀ 18mm'})
          </span>
        `).join('');
      } else {
        histBox.classList.add('hidden');
      }
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
  },

  cerrarModalAnillarPollitos() {
    const modal = document.getElementById('modal-anillar-incubacion');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  },

  actualizarCalibreAnillaModal() {
    const sexoCod = document.getElementById('anillar-inc-sexo')?.value || 'H';
    const inputCalibre = document.getElementById('anillar-inc-calibre');
    const inputCodigo = document.getElementById('anillar-inc-codigo');
    const calibreMm = sexoCod === 'M' ? 20 : 18;
    const anio = new Date().getFullYear();

    if (inputCalibre) {
      inputCalibre.value = sexoCod === 'M'
        ? '20 mm — Calibre Oficial Gallo (Entente Europea)'
        : '18 mm — Calibre Oficial Gallina (Entente Europea)';
    }
    if (inputCodigo) {
      const secuencial = ((this.estado.animales || []).length + 1).toString().padStart(4, '0');
      inputCodigo.value = `EE-ES-${anio}-${calibreMm}-${secuencial}`;
    }
  },

  async ejecutarAltaPollitoAnillado(event) {
    event.preventDefault();

    const loteId = document.getElementById('anillar-inc-lote-id')?.value;
    const lote = (this.estado.lotesIncubacion || []).find(l => l.id === loteId);
    if (!lote) return;

    const sexoCod = document.getElementById('anillar-inc-sexo')?.value || 'H';
    const sexoTexto = sexoCod === 'M' ? 'Macho' : 'Hembra';
    const calibreMm = sexoCod === 'M' ? 20 : 18;
    const numeroAnilla = document.getElementById('anillar-inc-codigo')?.value.trim();
    const idMadre = document.getElementById('anillar-inc-madre')?.value || null;
    const variedad = document.getElementById('anillar-inc-variedad')?.value || 'Milflores';
    const nombre = document.getElementById('anillar-inc-nombre')?.value.trim() || `Recría ${lote.familia_gobe || ''} #${(lote.pollitos_anillados?.length || 0) + 1}`;

    if (!numeroAnilla) {
      alert('Introduce el código de anilla oficial Entente Europea.');
      return;
    }

    const u = this.estado.usuarioActivo;
    const aviario = this.estado.aviario || this.estado.aviarioActivo;
    const madreObj = (this.estado.animales || []).find(a => a.id === idMadre);
    const fxCalc = this.calcularFxWright5Gen(lote.id_gallo, idMadre, this.estado.animales);

    const nuevoPollitoRN = {
      id: 'alac-rn-' + Date.now(),
      numero_anilla: numeroAnilla,
      codigo_identificacion: numeroAnilla,
      nombre: nombre,
      sexo: sexoTexto,
      calibre_anilla_mm: calibreMm,
      fecha_nacimiento: lote.fecha_eclosion || new Date().toISOString().split('T')[0],
      variedad: variedad,
      tipo_cresta: 'Sencilla',
      seccion_libro: 'RN',
      familia_origen: madreObj?.familia_origen || lote.familia_gobe || 'Familia B',
      id_padre: lote.id_gallo || null,
      id_madre: idMadre,
      lote_incubacion_id: lote.id,
      coeficiente_consanguinidad: fxCalc.fx,
      peso_g: sexoTexto === 'Macho' ? 450 : 380,
      estado_reproductor: 'En recría (RN)',
      estado: 'Activo',
      explotacion_id: aviario?.id || u?.explotacion_id || lote.explotacion_id || 'exp-01',
      codigo_rega: aviario?.codigo_rega || aviario?.rega || u?.rega || lote.codigo_rega || 'TEMP-REGA-001',
      usuario_id: u?.id || lote.usuario_id || null,
      titular_nombre: u?.nombre || aviario?.nombre_titular || '',
      geolocalizacion_alta: {
        latitud: aviario?.latitud ?? null,
        longitud: aviario?.longitud ?? null
      },
      fotos: {
        lateral: './icons/logo.png',
        cabeza: './icons/icon-192.png',
        tarsos: './icons/icon-512.png',
        galeria_opcional: []
      }
    };

    await this.db.put('animales', nuevoPollitoRN);
    this.estado.animales.unshift(nuevoPollitoRN);

    if (!Array.isArray(lote.pollitos_anillados)) lote.pollitos_anillados = [];
    lote.pollitos_anillados.push({
      id: nuevoPollitoRN.id,
      numero_anilla: numeroAnilla,
      sexo: sexoTexto,
      calibre_mm: calibreMm,
      id_madre: idMadre
    });
    if (!lote.pollitos_nacidos || lote.pollitos_nacidos < lote.pollitos_anillados.length) {
      lote.pollitos_nacidos = lote.pollitos_anillados.length;
    }
    lote.estado_ciclo = 'Eclosionado / Recría';
    await this.db.put('lotesIncubacion', lote);

    await this.db.put('syncQueue', { tipo: 'ALTA_ANIMAL', payload: nuevoPollitoRN, creado_en: Date.now() });
    this.estado.syncQueue = await this.db.getAll('syncQueue');
    this.actualizarContadorSyncQueue();

    this.poblarSelectores();
    this.renderizarCenso();
    this.actualizarKPIs();
    this.renderizarModuloIncubacion();
    this.abrirModalAnillarPollitos(lote.id);

    this.mostrarNotificacionToast(
      `💍 Pollito anillado con éxito: ${numeroAnilla} (${sexoTexto} · Calibre ${calibreMm} mm) inscrito en Sección RN.`,
      'success'
    );
  },

  // =========================================================================
  // 13. FASE 5: MAPA INTERACTIVO GIS DE EXPLOTACIONES (LEAFLET / OSM) Y
  // MÓDULO DEL BANCO DE GERMOPLASMA EX SITU (RD 45/2019 ARTS. 15-17 Y CNZ)
  // =========================================================================

  _leafletMap: null,
  _leafletLayerGroup: null,

  obtenerGermoplasmaSemilla() {
    return [
      {
        id: 'germo-sem-01',
        animal_id: 'alac-001',
        ejemplar_anilla: 'EE-ES-2024-20-0001',
        nombre_donante: 'Tossal de Alicante',
        sexo_donante: 'Macho',
        seccion_libro: 'RM',
        variedad: 'Milflores',
        familia_origen: 'Familia A',
        tipo_muestra: 'Dosis de Semen Criopreservado',
        codigo_canister_nitrogeno: 'CAN-N2-01-PAJ-001',
        numero_dosis: 40,
        fecha_congelacion: '2026-01-20',
        centro_germoplasma: 'CEGA - Centro de Evaluación y Gestión Avícola (CV)',
        usuario_id: 'usr-criador-01',
        explotacion_id: 'exp-01',
        codigo_rega: 'ES030140001234'
      },
      {
        id: 'germo-sem-02',
        animal_id: 'alac-002',
        ejemplar_anilla: 'EE-ES-2024-18-0002',
        nombre_donante: 'Reina del Vinalopó',
        sexo_donante: 'Hembra',
        seccion_libro: 'RD',
        variedad: 'Milflores',
        familia_origen: 'Familia A',
        tipo_muestra: 'Embriones',
        codigo_canister_nitrogeno: 'CAN-N2-02-EMB-014',
        numero_dosis: 18,
        fecha_congelacion: '2026-02-11',
        centro_germoplasma: 'Banco Nacional de Germoplasma Animal (INIA-CSIC / MAPA)',
        usuario_id: 'usr-criador-01',
        explotacion_id: 'exp-01',
        codigo_rega: 'ES030140001234'
      },
      {
        id: 'germo-sem-03',
        animal_id: 'alac-003',
        ejemplar_anilla: 'EE-ES-2025-20-0045',
        nombre_donante: 'Cid Campeador',
        sexo_donante: 'Macho',
        seccion_libro: 'RD',
        variedad: 'Armiñada',
        familia_origen: 'Familia B',
        tipo_muestra: 'Muestras de ADN / Tejido',
        codigo_canister_nitrogeno: 'CAN-N2-03-ADN-088',
        numero_dosis: 12,
        fecha_congelacion: '2026-03-05',
        centro_germoplasma: 'CEGA - Centro de Evaluación y Gestión Avícola (CV)',
        usuario_id: 'usr-criador-01',
        explotacion_id: 'exp-01',
        codigo_rega: 'ES030140001234'
      }
    ];
  },

  /**
   * Obtiene el listado completo de explotaciones territoriales geolocalizadas y su censo activo
   * combinando las explotaciones registradas en IndexedDB con los núcleos colaboradores de la red ESGA025.
   */
  async obtenerDatosTerritorialesGIS() {
    const todasExplotacionesDB = await this.db.getAll('explotaciones');
    const todosAnimalesDB = await this.db.getAll('animales');

    // Núcleos territoriales complementarios de referencia de la Red de Conservación ESGA025
    const nucleosRedComplementarios = [
      {
        id: 'exp-red-03',
        nombre_criadero: 'Aviario Serra de Mariola',
        nombre_titular: 'Cooperativa Avícola Alcoià',
        codigo_rega: 'ES030090004512',
        municipio: 'Alcoy',
        provincia: 'Alicante',
        comarca: 'L\'Alcoià',
        latitud: 38.7054,
        longitud: -0.4743,
        machos_base: 3,
        hembras_base: 11,
        variedades_base: ['Aperdizada', 'Milflores']
      },
      {
        id: 'exp-red-04',
        nombre_criadero: 'Criadero Marina Alta ESGA025',
        nombre_titular: 'Associació Ramadera Dénia',
        codigo_rega: 'ES030630008821',
        municipio: 'Dénia',
        provincia: 'Alicante',
        comarca: 'Marina Alta',
        latitud: 38.8408,
        longitud: 0.1057,
        machos_base: 2,
        hembras_base: 7,
        variedades_base: ['Moteada', 'Negra Moteada']
      },
      {
        id: 'exp-red-05',
        nombre_criadero: 'Núcleo Conservación Vega Baja',
        nombre_titular: 'Granja Escuela Orihuela',
        codigo_rega: 'ES030990003190',
        municipio: 'Orihuela',
        provincia: 'Alicante',
        comarca: 'Vega Baja',
        latitud: 38.0848,
        longitud: -0.9440,
        machos_base: 2,
        hembras_base: 6,
        variedades_base: ['Trigueña', 'Armiñada']
      },
      {
        id: 'exp-red-06',
        nombre_criadero: 'Centro Oficial CEGA Valencia',
        nombre_titular: 'Conselleria Agricultura / CEGA',
        codigo_rega: 'ES462500009901',
        municipio: 'Valencia',
        provincia: 'Valencia',
        comarca: 'L\'Horta',
        latitud: 39.4699,
        longitud: -0.3763,
        machos_base: 4,
        hembras_base: 14,
        variedades_base: ['Milflores', 'Aperdizada', 'Moteada', 'Blanca']
      },
      {
        id: 'exp-red-07',
        nombre_criadero: 'Aviario Huerta de Murcia',
        nombre_titular: 'Núcleo Colaborador Segura',
        codigo_rega: 'ES300300007714',
        municipio: 'Murcia',
        provincia: 'Murcia',
        comarca: 'Huerta de Murcia',
        latitud: 37.9922,
        longitud: -1.1307,
        machos_base: 1,
        hembras_base: 4,
        variedades_base: ['Azul', 'Negra']
      }
    ];

    const mapaExplotaciones = new Map();

    (todasExplotacionesDB || []).forEach(exp => {
      const lat = Number(exp.latitud) || 38.3452;
      const lng = Number(exp.longitud) || -0.4815;
      const rega = exp.codigo_rega || exp.rega || 'TEMP-REGA-001';
      const avesExp = (todosAnimalesDB || []).filter(
        a => a.estado !== 'Baja' && (a.explotacion_id === exp.id || (a.codigo_rega && a.codigo_rega === rega))
      );
      const machos = avesExp.filter(a => a.sexo === 'Macho').length;
      const hembras = avesExp.filter(a => a.sexo === 'Hembra').length;
      const variedadesSet = new Set(avesExp.map(a => a.variedad).filter(Boolean));
      if (variedadesSet.size === 0) variedadesSet.add('Milflores');

      mapaExplotaciones.set(exp.id, {
        id: exp.id,
        nombre_criadero: exp.nombre_criadero || `Aviario ${exp.municipio || 'Alicante'}`,
        nombre_titular: exp.nombre_titular || 'Criador Registrado',
        codigo_rega: rega,
        municipio: exp.municipio || 'Alicante',
        provincia: exp.provincia || 'Alicante',
        comarca: exp.municipio === 'Elche' ? 'Baix Vinalopó' : 'L\'Alacantí',
        latitud: lat,
        longitud: lng,
        machos,
        hembras,
        total: machos + hembras,
        variedades: Array.from(variedadesSet)
      });
    });

    nucleosRedComplementarios.forEach(nuc => {
      if (!mapaExplotaciones.has(nuc.id)) {
        mapaExplotaciones.set(nuc.id, {
          id: nuc.id,
          nombre_criadero: nuc.nombre_criadero,
          nombre_titular: nuc.nombre_titular,
          codigo_rega: nuc.codigo_rega,
          municipio: nuc.municipio,
          provincia: nuc.provincia,
          comarca: nuc.comarca,
          latitud: nuc.latitud,
          longitud: nuc.longitud,
          machos: nuc.machos_base,
          hembras: nuc.hembras_base,
          total: nuc.machos_base + nuc.hembras_base,
          variedades: nuc.variedades_base
        });
      }
    });

    let lista = Array.from(mapaExplotaciones.values());

    // Aplicar Filtro Rápido por Variedad Racial
    const filtroVariedad = document.getElementById('filtro-gis-variedad')?.value || 'TODAS';
    if (filtroVariedad !== 'TODAS') {
      const busqVar = filtroVariedad.toLowerCase();
      lista = lista.filter(item =>
        item.variedades.some(v => {
          const vl = v.toLowerCase();
          if (busqVar === 'moteada') return vl.includes('moteada') || vl.includes('exchequer');
          if (busqVar === 'aperdizada') return vl.includes('aperdizada') || vl.includes('perdiz') || vl.includes('dorada');
          return vl.includes(busqVar);
        })
      );
    }

    // Aplicar Filtro Rápido por Rango de Censo
    const filtroRango = document.getElementById('filtro-gis-rango-censo')?.value || 'TODOS';
    if (filtroRango === '1-3') {
      lista = lista.filter(item => item.total >= 1 && item.total <= 3);
    } else if (filtroRango === '4-8') {
      lista = lista.filter(item => item.total >= 4 && item.total <= 8);
    } else if (filtroRango === '9+') {
      lista = lista.filter(item => item.total >= 9);
    }

    return lista;
  },

  cambiarEscalaMapaGIS(escala) {
    if (this._leafletMap) {
      if (escala === 'NACIONAL') {
        this._leafletMap.setView([39.5, -2.5], 6);
      } else if (escala === 'AUTONOMICA') {
        this._leafletMap.setView([38.9, -0.55], 8);
      } else {
        this._leafletMap.setView([38.45, -0.52], 9);
      }
    }
    this.actualizarMapaGIS();
  },

  centrarMapaEnMiAviario() {
    const av = this.estado.aviario || this.estado.aviarioActivo;
    const lat = Number(av?.latitud) || 38.3452;
    const lng = Number(av?.longitud) || -0.4815;
    this.centrarMapaEnCoordenadas(lat, lng, av?.nombre_criadero || 'Mi Aviario');
  },

  centrarMapaEnCoordenadas(lat, lng, etiqueta = '') {
    if (this._leafletMap && typeof this._leafletMap.setView === 'function') {
      this._leafletMap.setView([Number(lat), Number(lng)], 12, { animate: true });
      if (etiqueta) {
        this.mostrarNotificacionToast(`📍 Mapa centrado en: ${etiqueta} (${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)})`, 'info');
      }
    }
  },

  async actualizarMapaGIS() {
    const mapContainer = document.getElementById('leaflet-mapa-gis');
    if (!mapContainer) return;

    const datos = await this.obtenerDatosTerritorialesGIS();
    const esModoPublicoVisitante = Boolean(this.estado.modoVisitante || !this.estado.usuarioActivo);

    // Actualizar Badge de Privacidad según Rol
    const badgePriv = document.getElementById('mapa-gis-modo-privacidad-badge');
    const hintPriv = document.getElementById('mapa-gis-privacidad-hint');
    if (badgePriv) {
      if (esModoPublicoVisitante) {
        badgePriv.className = 'px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold';
        badgePriv.textContent = '🔒 Modo Público Visitante (Datos Agregados por Municipio)';
      } else {
        badgePriv.className = 'px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold';
        badgePriv.textContent = '🔓 Vista Criador / Administrador (Detalle REGA y Censo Activo)';
      }
    }
    if (hintPriv) {
      hintPriv.textContent = esModoPublicoVisitante
        ? 'Modo Público activo: Los marcadores muestran únicamente datos agregados por municipio para proteger la privacidad de los criadores.'
        : 'Modo Criador/Admin activo: Pulsa cualquier marcador para ver Nombre del Aviario, Código REGA, Municipio/Provincia y desglose de Machos, Hembras y Variedades.';
    }

    // Actualizar KPIs Territoriales
    const municipiosUnicos = new Set(datos.map(d => `${d.municipio} (${d.provincia})`));
    const totalMachos = datos.reduce((acc, d) => acc + d.machos, 0);
    const totalHembras = datos.reduce((acc, d) => acc + d.hembras, 0);
    const variedadesUnicas = new Set();
    datos.forEach(d => d.variedades.forEach(v => variedadesUnicas.add(v)));

    const elExp = document.getElementById('kpi-gis-explotaciones');
    const elMun = document.getElementById('kpi-gis-municipios');
    const elMH = document.getElementById('kpi-gis-machos-hembras');
    const elVar = document.getElementById('kpi-gis-variedades');

    if (elExp) elExp.textContent = datos.length;
    if (elMun) elMun.textContent = municipiosUnicos.size;
    if (elMH) elMH.textContent = `${totalMachos} ♂ · ${totalHembras} ♀`;
    if (elVar) elVar.textContent = variedadesUnicas.size;

    // Preparar datos según Modo de Privacidad (Visitante = Agregado por Municipio vs Autenticado = Por Aviario REGA)
    const escala = document.getElementById('filtro-gis-escala')?.value || 'COMARCAL';
    const usarCluster = document.getElementById('check-gis-cluster')?.checked !== false;

    let nodosParaMapa = [];
    if (esModoPublicoVisitante) {
      // Agregar estrictamente por Municipio para preservar la privacidad de los criadores
      const porMunicipio = new Map();
      datos.forEach(d => {
        const key = `${d.municipio}_${d.provincia}`;
        if (!porMunicipio.has(key)) {
          porMunicipio.set(key, {
            esAgregadoPublico: true,
            municipio: d.municipio,
            provincia: d.provincia,
            comarca: d.comarca,
            latitud: Number((d.latitud).toFixed(2)),
            longitud: Number((d.longitud).toFixed(2)),
            num_aviarios: 0,
            machos: 0,
            hembras: 0,
            total: 0,
            variedades: new Set()
          });
        }
        const m = porMunicipio.get(key);
        m.num_aviarios += 1;
        m.machos += d.machos;
        m.hembras += d.hembras;
        m.total += d.total;
        d.variedades.forEach(v => m.variedades.add(v));
      });
      nodosParaMapa = Array.from(porMunicipio.values()).map(m => ({
        ...m,
        variedades: Array.from(m.variedades)
      }));
    } else if (usarCluster && escala === 'NACIONAL') {
      // Agrupamiento / Clusterización automática por Provincia para escala nacional
      const porProvincia = new Map();
      datos.forEach(d => {
        const key = d.provincia || 'Alicante';
        if (!porProvincia.has(key)) {
          porProvincia.set(key, {
            esClusterProvincial: true,
            provincia: key,
            municipios: new Set(),
            latitud: d.latitud,
            longitud: d.longitud,
            num_aviarios: 0,
            machos: 0,
            hembras: 0,
            total: 0,
            variedades: new Set(),
            regas: []
          });
        }
        const p = porProvincia.get(key);
        p.municipios.add(d.municipio);
        p.num_aviarios += 1;
        p.machos += d.machos;
        p.hembras += d.hembras;
        p.total += d.total;
        p.regas.push(d.codigo_rega);
        d.variedades.forEach(v => p.variedades.add(v));
      });
      nodosParaMapa = Array.from(porProvincia.values()).map(p => ({
        ...p,
        municipios: Array.from(p.municipios),
        variedades: Array.from(p.variedades)
      }));
    } else {
      nodosParaMapa = datos;
    }

    // Renderizar en motor Leaflet.js (o respaldo vectorial interactivo si está sin red ni caché de CDN)
    if (typeof window.L !== 'undefined') {
      if (!this._leafletMap) {
        mapContainer.innerHTML = '';
        this._leafletMap = window.L.map('leaflet-mapa-gis', {
          center: [38.45, -0.52],
          zoom: 9,
          zoomControl: true
        });

        window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 18,
          attribution: '&copy; OpenStreetMap contributors · AlacantinApp v6 GIS (ESGA025)'
        }).addTo(this._leafletMap);
      }

      setTimeout(() => {
        if (this._leafletMap) this._leafletMap.invalidateSize();
      }, 120);

      if (this._leafletLayerGroup) {
        this._leafletMap.removeLayer(this._leafletLayerGroup);
      }

      if (usarCluster && typeof window.L.markerClusterGroup === 'function') {
        this._leafletLayerGroup = window.L.markerClusterGroup({
          showCoverageOnHover: false,
          maxClusterRadius: escala === 'AUTONOMICA' ? 65 : 45
        });
      } else {
        this._leafletLayerGroup = window.L.layerGroup();
      }

      nodosParaMapa.forEach(nodo => {
        const esRegaOficial = nodo.codigo_rega ? this.esRegaOficialValido(nodo.codigo_rega) : true;
        const colorPin = nodo.esClusterProvincial
          ? '#38bdf8'
          : (esModoPublicoVisitante ? '#14b8a6' : (esRegaOficial ? '#10b981' : '#f59e0b'));

        const htmlIcon = `
          <div style="
            background: ${colorPin};
            color: #0f172a;
            border: 2px solid #ffffff;
            border-radius: 9999px;
            min-width: 34px;
            height: 34px;
            padding: 0 7px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 900;
            font-size: 11px;
            font-family: monospace;
            box-shadow: 0 4px 12px rgba(0,0,0,0.45);
          ">
            ${nodo.esClusterProvincial ? `${nodo.num_aviarios} av.` : `${nodo.total}🐔`}
          </div>
        `;

        const customIcon = window.L.divIcon({
          html: htmlIcon,
          className: 'alacantin-gis-pin',
          iconSize: [38, 38],
          iconAnchor: [19, 19],
          popupAnchor: [0, -18]
        });

        let popupHtml = '';
        if (esModoPublicoVisitante) {
          // POPUP PARA VISITANTES (MODO PÚBLICO): Únicamente datos agregados por municipio y censo total
          popupHtml = `
            <div style="min-width: 220px; font-family: sans-serif; color: #0f172a; padding: 2px;">
              <div style="font-size: 10px; font-weight: 800; color: #0d9488; text-transform: uppercase;">
                🔒 Censo Público Agregado por Municipio
              </div>
              <div style="font-size: 14px; font-weight: 900; margin-top: 2px;">
                📍 ${this.escaparHtml(nodo.municipio)} (${this.escaparHtml(nodo.provincia)})
              </div>
              <div style="font-size: 11px; color: #475569; margin-bottom: 6px;">
                Comarca: ${this.escaparHtml(nodo.comarca || 'Comunidad Valenciana')}
              </div>
              <div style="background: #f1f5f9; border-radius: 6px; padding: 6px 8px; font-size: 11px;">
                <div><strong>Censo Total Municipio:</strong> ${nodo.total} ejemplares ESGA025</div>
                <div><strong>Aviarios Colaboradores:</strong> ${nodo.num_aviarios} núcleo(s)</div>
                <div><strong>Variedades presentes:</strong> ${this.escaparHtml(nodo.variedades.join(', '))}</div>
              </div>
              <div style="font-size: 9px; color: #64748b; margin-top: 5px;">
                * Datos personales y códigos REGA ocultos en Modo Visitante por protección de datos.
              </div>
            </div>
          `;
        } else if (nodo.esClusterProvincial) {
          popupHtml = `
            <div style="min-width: 240px; font-family: sans-serif; color: #0f172a; padding: 2px;">
              <div style="font-size: 10px; font-weight: 800; color: #0284c7; text-transform: uppercase;">
                🗺️ Cluster Provincial ESGA025
              </div>
              <div style="font-size: 14px; font-weight: 900; margin-top: 2px;">
                Provincia de ${this.escaparHtml(nodo.provincia)}
              </div>
              <div style="background: #f1f5f9; border-radius: 6px; padding: 6px 8px; font-size: 11px; margin-top: 6px;">
                <div><strong>Explotaciones REGA:</strong> ${nodo.num_aviarios} (${this.escaparHtml(nodo.municipios.join(', '))})</div>
                <div><strong>Desglose Censo Activo:</strong> ♂ ${nodo.machos} Machos · ♀ ${nodo.hembras} Hembras (${nodo.total} total)</div>
                <div><strong>Variedades criadas:</strong> ${this.escaparHtml(nodo.variedades.join(', '))}</div>
              </div>
            </div>
          `;
        } else {
          // POPUP PARA CRIADORES / ADMINISTRADORES: Nombre del Aviario, Código REGA, Municipio/Provincia y desglose activo
          popupHtml = `
            <div style="min-width: 245px; font-family: sans-serif; color: #0f172a; padding: 2px;">
              <div style="font-size: 10px; font-weight: 800; color: #059669; text-transform: uppercase;">
                🏡 Explotación Ganadera REGA · ESGA025
              </div>
              <div style="font-size: 14px; font-weight: 900; margin-top: 2px;">
                ${this.escaparHtml(nodo.nombre_criadero)}
              </div>
              <div style="font-size: 11px; font-family: monospace; font-weight: 700; color: #0f766e; margin-top: 1px;">
                Código REGA: ${this.escaparHtml(nodo.codigo_rega)}
              </div>
              <div style="font-size: 11px; color: #334155; margin-bottom: 6px;">
                📍 ${this.escaparHtml(nodo.municipio)} (${this.escaparHtml(nodo.provincia)} · ${this.escaparHtml(nodo.comarca)})
              </div>
              <div style="background: #f1f5f9; border-radius: 6px; padding: 6px 8px; font-size: 11px;">
                <div><strong>Desglose Censo Activo (${nodo.total} aves):</strong></div>
                <div style="margin-top: 2px;">• <strong>Nº de Machos (♂):</strong> ${nodo.machos} reproductores</div>
                <div>• <strong>Nº de Hembras (♀):</strong> ${nodo.hembras} reproductoras</div>
                <div style="margin-top: 3px;">• <strong>Variedades criadas:</strong> ${this.escaparHtml(nodo.variedades.join(', '))}</div>
              </div>
            </div>
          `;
        }

        const marker = window.L.marker([nodo.latitud, nodo.longitud], { icon: customIcon });
        marker.bindPopup(popupHtml);
        this._leafletLayerGroup.addLayer(marker);
      });

      this._leafletMap.addLayer(this._leafletLayerGroup);
    } else {
      // Respaldo interactivo 100% Offline si Leaflet CDN no pudo cargarse sin red
      mapContainer.innerHTML = `
        <div class="w-full h-full flex flex-col items-center justify-center p-6 bg-slate-900 text-center space-y-3">
          <i class="fa-solid fa-map-location-dot text-3xl text-teal-400"></i>
          <p class="text-xs font-bold text-white">Cartografía Territorial Offline Activa (${nodosParaMapa.length} núcleos geolocalizados)</p>
          <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 w-full max-w-4xl overflow-y-auto max-h-72 text-left">
            ${nodosParaMapa.map(n => `
              <div class="p-3 rounded-xl bg-slate-950 border border-teal-500/40 text-xs space-y-1">
                <div class="font-bold text-teal-300">${this.escaparHtml(esModoPublicoVisitante ? `${n.municipio} (${n.provincia})` : n.nombre_criadero)}</div>
                <div class="text-[11px] font-mono text-slate-400">${esModoPublicoVisitante ? 'REGA Protegido (Modo Público)' : this.escaparHtml(n.codigo_rega)}</div>
                <div class="text-[11px] text-white">${esModoPublicoVisitante ? `Censo Total: ${n.total} aves` : `♂ ${n.machos} Machos · ♀ ${n.hembras} Hembras`}</div>
                <div class="text-[10px] text-amber-300">Variedades: ${this.escaparHtml(n.variedades.join(', '))}</div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    // Renderizar Tabla Territorial Inferior respetando Privacidad RBAC
    const tbody = document.getElementById('tabla-gis-territorial-body');
    const contadorEl = document.getElementById('tabla-gis-contador');
    if (contadorEl) {
      contadorEl.textContent = esModoPublicoVisitante
        ? `${nodosParaMapa.length} municipios (Modo Público)`
        : `${datos.length} aviarios REGA`;
    }

    if (tbody) {
      const filas = esModoPublicoVisitante ? nodosParaMapa : datos;
      if (filas.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="7" class="py-6 text-center text-xs text-slate-500">
              No hay explotaciones que coincidan con los filtros territoriales seleccionados.
            </td>
          </tr>
        `;
      } else {
        tbody.innerHTML = filas.map(item => `
          <tr class="hover:bg-slate-900/70 transition">
            <td class="py-2.5 px-4">
              <div class="font-bold text-white">${this.escaparHtml(esModoPublicoVisitante ? `Municipio de ${item.municipio}` : item.nombre_criadero)}</div>
              <div class="text-[10px] text-slate-400">${this.escaparHtml(item.municipio)} (${this.escaparHtml(item.provincia)} · ${this.escaparHtml(item.comarca || '')})</div>
            </td>
            <td class="py-2.5 px-4 font-mono text-xs">
              ${esModoPublicoVisitante
                ? `<span class="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px]">🔒 Agregado (${item.num_aviarios} av.)</span>`
                : `<span class="px-2 py-0.5 rounded bg-teal-950/80 text-teal-300 border border-teal-700/60 font-bold">${this.escaparHtml(item.codigo_rega)}</span>`}
            </td>
            <td class="py-2.5 px-4 font-mono text-[11px] text-slate-400">
              ${esModoPublicoVisitante
                ? `${Number(item.latitud).toFixed(2)}, ${Number(item.longitud).toFixed(2)}`
                : `${Number(item.latitud).toFixed(4)}, ${Number(item.longitud).toFixed(4)}`}
            </td>
            <td class="py-2.5 px-4 text-center font-mono font-bold text-sky-400">
              ${esModoPublicoVisitante ? '--' : item.machos}
            </td>
            <td class="py-2.5 px-4 text-center font-mono font-bold text-pink-400">
              ${esModoPublicoVisitante ? `Total: ${item.total}` : item.hembras}
            </td>
            <td class="py-2.5 px-4">
              <div class="flex flex-wrap gap-1">
                ${item.variedades.map(v => `<span class="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-[10px] text-amber-300">${this.escaparHtml(v)}</span>`).join('')}
              </div>
            </td>
            <td class="py-2.5 px-4 text-right">
              <button type="button"
                      onclick="app.centrarMapaEnCoordenadas(${item.latitud}, ${item.longitud}, '${this.escaparHtml(esModoPublicoVisitante ? item.municipio : item.nombre_criadero)}')"
                      class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-teal-900/70 text-teal-300 border border-teal-700/50 text-[11px] font-semibold transition">
                <i class="fa-solid fa-crosshairs mr-1"></i>Ver Pin
              </button>
            </td>
          </tr>
        `).join('');
      }
    }
  },

  // =========================================================================
  // MÓDULO DEL BANCO DE GERMOPLASMA Y MATERIAL GENÉTICO EX SITU (RD 45/2019)
  // =========================================================================

  renderizarModuloGermoplasma() {
    const selectDonante = document.getElementById('ejemplar_anilla');
    const inputFecha = document.getElementById('fecha_congelacion');
    const inputCanister = document.getElementById('codigo_canister_nitrogeno');
    const tbody = document.getElementById('tabla-germoplasma-body');
    if (!tbody) return;

    if (inputFecha && !inputFecha.value) {
      inputFecha.value = new Date().toISOString().split('T')[0];
    }

    // Filtrar estrictamente reproductores con Registro Definitivo (RD) o Registro de Méritos (RM)
    const donantesCualificados = (this.estado.animales || []).filter(
      a => a.estado !== 'Baja' && ['RD', 'RM'].includes(a.seccion_libro) && this.perteneceAUsuarioActivo(a)
    );

    if (selectDonante) {
      const valPrevio = selectDonante.value;
      selectDonante.innerHTML = '<option value="">-- Seleccionar Reproductor Donante (RD / RM) --</option>';
      donantesCualificados.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.numero_anilla;
        opt.setAttribute('data-animal-id', d.id);
        opt.textContent = `[${d.seccion_libro}] #${d.numero_anilla} · ${d.nombre || d.codigo_identificacion} (${d.sexo} · ${d.variedad} · ${d.familia_origen})`;
        selectDonante.appendChild(opt);
      });
      if (valPrevio && donantesCualificados.some(d => d.numero_anilla === valPrevio)) {
        selectDonante.value = valPrevio;
      } else if (donantesCualificados.length > 0) {
        selectDonante.value = donantesCualificados[0].numero_anilla;
      }
    }

    const muestras = (this.estado.bancoGermoplasma || []).filter(m => this.perteneceAUsuarioActivo(m));

    if (inputCanister && !inputCanister.value) {
      const sec = (muestras.length + 1).toString().padStart(3, '0');
      inputCanister.value = `CAN-N2-04-PAJ-${sec}`;
    }

    // Calcular KPIs de dosis ex situ disponibles
    const totalDosis = muestras.reduce((acc, m) => acc + (Number(m.numero_dosis) || 0), 0);
    const dosisSemen = muestras
      .filter(m => m.tipo_muestra === 'Dosis de Semen Criopreservado')
      .reduce((acc, m) => acc + (Number(m.numero_dosis) || 0), 0);
    const dosisEmbriones = muestras
      .filter(m => m.tipo_muestra === 'Embriones')
      .reduce((acc, m) => acc + (Number(m.numero_dosis) || 0), 0);
    const dosisAdn = muestras
      .filter(m => m.tipo_muestra === 'Muestras de ADN / Tejido')
      .reduce((acc, m) => acc + (Number(m.numero_dosis) || 0), 0);
    const donantesUnicos = new Set(muestras.map(m => m.ejemplar_anilla)).size;

    const elTotal = document.getElementById('kpi-germo-total-dosis');
    const elSemen = document.getElementById('kpi-germo-dosis-semen');
    const elEmb = document.getElementById('kpi-germo-embriones');
    const elAdn = document.getElementById('kpi-germo-adn');
    const elDon = document.getElementById('kpi-germo-donantes');

    if (elTotal) elTotal.textContent = totalDosis;
    if (elSemen) elSemen.textContent = dosisSemen;
    if (elEmb) elEmb.textContent = dosisEmbriones;
    if (elAdn) elAdn.textContent = dosisAdn;
    if (elDon) elDon.textContent = donantesUnicos;

    const filtroTipo = document.getElementById('filtro-germo-tipo')?.value || 'TODOS';
    const muestrasFiltradas = filtroTipo === 'TODOS'
      ? muestras
      : muestras.filter(m => m.tipo_muestra === filtroTipo);

    if (muestrasFiltradas.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="py-6 text-center text-xs text-slate-500">
            No hay lotes de germoplasma registrados para el filtro seleccionado.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = muestrasFiltradas.map(m => {
      const badgeTipo = m.tipo_muestra === 'Dosis de Semen Criopreservado'
        ? 'bg-sky-950/80 text-sky-300 border-sky-700/60'
        : (m.tipo_muestra === 'Embriones'
          ? 'bg-pink-950/80 text-pink-300 border-pink-700/60'
          : 'bg-purple-950/80 text-purple-300 border-purple-700/60');

      return `
        <tr class="hover:bg-slate-900/70 transition">
          <td class="py-2.5 px-4">
            <div class="flex items-center gap-1.5">
              <span class="px-1.5 py-0.2 rounded text-[10px] font-black ${m.seccion_libro === 'RM' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'}">
                ${this.escaparHtml(m.seccion_libro || 'RD')}
              </span>
              <span class="font-mono font-bold text-white">#${this.escaparHtml(m.ejemplar_anilla)}</span>
            </div>
            <div class="text-[10px] text-slate-400 mt-0.5">${this.escaparHtml(m.nombre_donante || '')} (${this.escaparHtml(m.sexo_donante || '')})</div>
          </td>
          <td class="py-2.5 px-4 text-xs">
            <span class="text-amber-300 font-semibold">${this.escaparHtml(m.variedad || 'Milflores')}</span>
            <span class="block text-[10px] text-slate-400">${this.escaparHtml(m.familia_origen || '')}</span>
          </td>
          <td class="py-2.5 px-4">
            <span class="px-2.5 py-1 rounded-full text-[10px] font-bold border ${badgeTipo}">
              ${this.escaparHtml(m.tipo_muestra)}
            </span>
          </td>
          <td class="py-2.5 px-4 font-mono font-bold text-cyan-300 text-xs">
            ${this.escaparHtml(m.codigo_canister_nitrogeno)}
          </td>
          <td class="py-2.5 px-4 text-center font-mono font-black text-sm text-white">
            ${Number(m.numero_dosis) || 0}
          </td>
          <td class="py-2.5 px-4 font-mono text-xs text-slate-300">
            ${this.escaparHtml(m.fecha_congelacion)}
          </td>
          <td class="py-2.5 px-4 text-xs text-slate-300">
            ${this.escaparHtml(m.centro_germoplasma)}
          </td>
          <td class="py-2.5 px-4 text-right">
            <button type="button"
                    onclick="app.eliminarMuestraGermoplasma('${m.id}')"
                    title="Retirar lote del inventario"
                    class="px-2 py-1 rounded bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800/60 text-[10px] transition">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');
  },

  async guardarMuestraGermoplasma(event) {
    event.preventDefault();

    const u = this.estado.usuarioActivo;
    const aviario = this.estado.aviario || this.estado.aviarioActivo;
    if (!u || this.estado.modoVisitante) {
      alert('Debes iniciar sesión con tu cuenta de criador o inspector para registrar muestras en el Banco de Germoplasma.');
      return;
    }

    const ejemplarAnilla = document.getElementById('ejemplar_anilla')?.value.trim();
    const tipoMuestra = document.getElementById('tipo_muestra')?.value;
    const codigoCanister = document.getElementById('codigo_canister_nitrogeno')?.value.trim();
    const numeroDosis = parseInt(document.getElementById('numero_dosis')?.value || '0', 10);
    const fechaCongelacion = document.getElementById('fecha_congelacion')?.value;
    const centroGermoplasma = document.getElementById('centro_germoplasma')?.value.trim();

    const donante = (this.estado.animales || []).find(a => a.numero_anilla === ejemplarAnilla);
    if (!donante || !['RD', 'RM'].includes(donante.seccion_libro)) {
      alert('Conforme al RD 45/2019 y Protocolo CNZ, el ejemplar donante debe pertenecer al Registro Definitivo (RD) o Registro de Méritos (RM).');
      return;
    }

    const nuevaMuestra = {
      id: 'germo-' + Date.now(),
      animal_id: donante.id,
      ejemplar_anilla: ejemplarAnilla,
      nombre_donante: donante.nombre || donante.codigo_identificacion,
      sexo_donante: donante.sexo,
      seccion_libro: donante.seccion_libro,
      variedad: donante.variedad || 'Milflores',
      familia_origen: donante.familia_origen || 'Familia A',
      tipo_muestra: tipoMuestra,
      codigo_canister_nitrogeno: codigoCanister,
      numero_dosis: numeroDosis,
      fecha_congelacion: fechaCongelacion,
      centro_germoplasma: centroGermoplasma,
      usuario_id: u.id,
      explotacion_id: aviario?.id || u.explotacion_id || donante.explotacion_id || 'exp-01',
      codigo_rega: aviario?.codigo_rega || aviario?.rega || u.rega || donante.codigo_rega || 'TEMP-REGA-001',
      creado_en: new Date().toISOString()
    };

    await this.db.put('bancoGermoplasma', nuevaMuestra);
    if (!Array.isArray(this.estado.bancoGermoplasma)) this.estado.bancoGermoplasma = [];
    this.estado.bancoGermoplasma.unshift(nuevaMuestra);

    if (navigator.onLine && this.supabaseClient) {
      try {
        const { error } = await this.supabaseClient.from('banco_germoplasma').upsert(nuevaMuestra);
        if (error) throw error;
      } catch (_) {
        await this.db.put('syncQueue', { tipo: 'BANCO_GERMOPLASMA', payload: nuevaMuestra, creado_en: Date.now() });
      }
    } else {
      await this.db.put('syncQueue', { tipo: 'BANCO_GERMOPLASMA', payload: nuevaMuestra, creado_en: Date.now() });
    }

    this.estado.syncQueue = await this.db.getAll('syncQueue');
    this.actualizarContadorSyncQueue();
    this.renderizarModuloGermoplasma();

    const inputCanister = document.getElementById('codigo_canister_nitrogeno');
    if (inputCanister) {
      const sec = (this.estado.bancoGermoplasma.length + 1).toString().padStart(3, '0');
      inputCanister.value = `CAN-N2-04-PAJ-${sec}`;
    }

    this.mostrarNotificacionToast(
      `🧬 Depositadas ${numeroDosis} unidades de "${tipoMuestra}" del donante #${ejemplarAnilla} (${donante.seccion_libro}) en ${codigoCanister}.`,
      'success'
    );
  },

  async eliminarMuestraGermoplasma(id) {
    if (!confirm('¿Deseas retirar este lote del inventario del Banco de Germoplasma?')) return;
    await this.db.delete('bancoGermoplasma', id);
    this.estado.bancoGermoplasma = (this.estado.bancoGermoplasma || []).filter(m => m.id !== id);
    this.renderizarModuloGermoplasma();
    this.mostrarNotificacionToast('🗑️ Lote retirado del inventario de germoplasma.', 'info');
  },

  exportarInventarioGermoplasmaCSV() {
    const muestras = (this.estado.bancoGermoplasma || []).filter(m => this.perteneceAUsuarioActivo(m));
    if (muestras.length === 0) {
      alert('No hay lotes registrados en el Banco de Germoplasma para exportar.');
      return;
    }

    const cabeceras = [
      'ID_LOTE_GERMOPLASMA',
      'CODIGO_RAZA_MAPA',
      'EJEMPLAR_ANILLA',
      'NOMBRE_DONANTE',
      'SEXO_DONANTE',
      'SECCION_LIBRO_GENEALOGICO',
      'VARIEDAD_RACIAL',
      'FAMILIA_GOBE',
      'TIPO_MUESTRA_EX_SITU',
      'CODIGO_CANISTER_NITROGENO',
      'NUMERO_DOSIS_DISPONIBLES',
      'FECHA_CONGELACION',
      'CENTRO_GERMOPLASMA_DEPOSITARIO',
      'CODIGO_REGA_ORIGEN',
      'NORMATIVA_CUMPLIMIENTO'
    ];

    const filas = muestras.map(m => [
      this.escaparValorCSV(m.id),
      this.escaparValorCSV('ESGA025'),
      this.escaparValorCSV(m.ejemplar_anilla),
      this.escaparValorCSV(m.nombre_donante || ''),
      this.escaparValorCSV(m.sexo_donante || ''),
      this.escaparValorCSV(m.seccion_libro || 'RD'),
      this.escaparValorCSV(m.variedad || 'Milflores'),
      this.escaparValorCSV(m.familia_origen || ''),
      this.escaparValorCSV(m.tipo_muestra),
      this.escaparValorCSV(m.codigo_canister_nitrogeno),
      this.escaparValorCSV(m.numero_dosis),
      this.escaparValorCSV(m.fecha_congelacion),
      this.escaparValorCSV(m.centro_germoplasma),
      this.escaparValorCSV(m.codigo_rega || 'ES030140001234'),
      this.escaparValorCSV('RD 45/2019 Arts. 15-17 · Protocolo CNZ')
    ].join(','));

    const contenidoCSV = '\uFEFF' + [cabeceras.join(','), ...filas].join('\r\n');
    const fechaStr = new Date().toISOString().split('T')[0];
    const nombreArchivo = `Inventario_Oficial_Banco_Germoplasma_ESGA025_${fechaStr}.csv`;

    this.descargarArchivoCliente(contenidoCSV, nombreArchivo, 'text/csv;charset=utf-8;');
    this.mostrarNotificacionToast(`📥 Exportado inventario oficial CSV (${muestras.length} lotes ex situ) para MAPA / Autoridad Competente.`, 'success');
  }
};

// Iniciar aplicación al cargar el DOM
window.addEventListener('DOMContentLoaded', () => {
  window.app = app;
  app.init();
});



