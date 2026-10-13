// ============================================================================
// ALACANTINAPP V5 - LÓGICA DE NEGOCIO Y ARQUITECTURA OFFLINE-FIRST
// Club Gallina Alacantina (Código Oficial ESGA025)
// Cumplimiento: Protocolo CNZ (5 de junio de 2025), RD 45/2019, Reg. UE 2016/1012
// ============================================================================

// Espacio de nombres principal de la aplicación
const app = {
  // Configuración de Supabase
  supabaseUrl: localStorage.getItem('alacantina_supabase_url') || '',
  supabaseKey: localStorage.getItem('alacantina_supabase_key') || '',
  supabaseClient: null,

  // Estado reactivo de la aplicación
  estado: {
    animales: [],
    explotaciones: [],
    inspecciones: [],
    controlesPuesta: [],
    lotes: [],
    syncQueue: [],
    animalSeleccionadoId: null,
    fotosCapturadas: {
      lateral: null,
      cabeza: null,
      tarsos: null
    },
    gpsUbicacion: null,
    filtros: {
      busqueda: '',
      seccion: 'TODAS',
      sexo: 'TODOS',
      familia: 'TODAS'
    }
  },

  // =========================================================================
  // 1. INICIALIZACIÓN DE LA APLICACIÓN Y BASE DE DATOS LOCAL (INDEXEDDB)
  // =========================================================================
  async init() {
    console.log('[AlacantinApp] Iniciando aplicación v5 (ESGA025)...');
    
    // Iniciar IndexedDB local
    await this.db.init();

    // Iniciar cliente de Supabase si hay credenciales configuradas
    this.iniciarSupabaseClient();

    // Registrar observadores de red online/offline
    this.configurarObservadoresRed();

    // Cargar datos (de IndexedDB primero, y luego sincronizar con Supabase si online)
    await this.cargarDatos();

    // Actualizar interfaz inicial
    this.poblarSelectores();
    this.actualizarReglasSexo();
    this.renderizarCenso();
    this.actualizarKPIs();
    this.recalcularBaremo();
    this.renderizarLotes();

    // Comprobar si hay hash en la URL para cambiar de pestaña directamente
    const hash = window.location.hash.replace('#', '');
    if (['registro', 'censo', 'inspeccion', 'pedigri', 'lotes'].includes(hash)) {
      this.cambiarTab(hash);
    }
  },

  // Módulo de Base de Datos IndexedDB
  db: {
    dbName: 'AlacantinDB_v5',
    version: 1,
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
          if (!db.objectStoreNames.contains('syncQueue')) {
            db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
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

  // Configuración de Supabase
  iniciarSupabaseClient() {
    if (this.supabaseUrl && this.supabaseKey && window.supabase) {
      try {
        this.supabaseClient = window.supabase.createClient(this.supabaseUrl, this.supabaseKey);
        console.log('[Supabase] Cliente inicializado.');
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
  // 2. CARGA Y SINCRONIZACIÓN DE DATOS (LOCAL + NUBE)
  // =========================================================================
  async cargarDatos() {
    let animalesLocales = await this.db.getAll('animales');
    let explotacionesLocales = await this.db.getAll('explotaciones');
    let inspeccionesLocales = await this.db.getAll('inspecciones');
    let controlesLocales = await this.db.getAll('controlesPuesta');
    let lotesLocales = await this.db.getAll('lotes');
    this.estado.syncQueue = await this.db.getAll('syncQueue');

    // Si la BD local está vacía, cargar los datos semilla oficiales ESGA025
    if (!animalesLocales || animalesLocales.length === 0) {
      console.log('[AlacantinApp] Cargando datos semilla iniciales de la raza ESGA025...');
      await this.cargarSemillaInicial(false);
      animalesLocales = await this.db.getAll('animales');
      explotacionesLocales = await this.db.getAll('explotaciones');
      inspeccionesLocales = await this.db.getAll('inspecciones');
      lotesLocales = await this.db.getAll('lotes');
    }

    this.estado.animales = animalesLocales;
    this.estado.explotaciones = explotacionesLocales;
    this.estado.inspecciones = inspeccionesLocales;
    this.estado.controlesPuesta = controlesLocales;
    this.estado.lotes = lotesLocales;

    // Calcular consanguinidad en cliente para todos los ejemplares
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
    }

    const explotacionesSemilla = [
      {
        id: 'exp-01',
        codigo_rega: 'ES030140000001',
        nombre_titular: 'Vicent Soler Mas',
        nombre_criadero: 'Criadero El Palmeral - ESGA025',
        municipio: 'Elche',
        provincia: 'Alicante',
        latitud: 38.2671,
        longitud: -0.6983,
        telefono: '600123456',
        activo: true
      },
      {
        id: 'exp-02',
        codigo_rega: 'ES030590000002',
        nombre_criadero: 'Aviario Crevillent Zootecnia',
        nombre_titular: 'Antoni Bernabeu',
        municipio: 'Crevillent',
        provincia: 'Alicante',
        latitud: 38.2492,
        longitud: -0.8091,
        telefono: '611987654',
        activo: true
      }
    ];

    const animalesSemilla = [
      // 1. Patriarcas Fundacionales (RF)
      {
        id: 'alac-001',
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
        familia_origen: 'Familia A',
        peso_actual_kg: 3.350,
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
          tarsos: './icons/icon-512.png'
        },
        notas: 'Fundador de la Familia A. Cola erguida a 70º y excelente pecho recto sin quilla desvaída.'
      },
      {
        id: 'alac-002',
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
        familia_origen: 'Familia A',
        peso_actual_kg: 2.450,
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
          tarsos: './icons/icon-512.png'
        },
        notas: 'Matriarca fundacional de alta prolificidad y excelente cáscara blanco crema.'
      },
      // 2. Macho de Familia B
      {
        id: 'alac-003',
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
        familia_origen: 'Familia B',
        peso_actual_kg: 3.280,
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
          tarsos: './icons/icon-512.png'
        },
        notas: 'Aprobado en inspección zootécnica oficial con 88 puntos. Muy buen porte.'
      },
      // 3. Hembra de Familia B
      {
        id: 'alac-004',
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
        familia_origen: 'Familia B',
        peso_actual_kg: 2.380,
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
          tarsos: './icons/icon-512.png'
        },
        notas: 'Registro de Méritos (RM) por calificación superior a 92 puntos y puesta media de 62 g.'
      },
      // 4. Nueva Generación (Aspirante RN)
      {
        id: 'alac-005',
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
        familia_origen: 'Familia C',
        peso_actual_kg: 3.150,
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
          tarsos: './icons/icon-512.png'
        },
        notas: 'Aspirante en Registro de Nacimientos pendiente de inspección oficial de aptitud.'
      },
      // 5. Hembra Familia C
      {
        id: 'alac-006',
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
        familia_origen: 'Familia C',
        peso_actual_kg: 2.300,
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
          tarsos: './icons/icon-512.png'
        },
        notas: 'Excelente porte y tarsos blanco rosáceos impecables.'
      }
    ];

    const inspeccionesSemilla = [
      {
        id: 'insp-01',
        animal_id: 'alac-003',
        fecha_inspeccion: '2024-05-10',
        calificador_oficial: 'Dr. Zootecnista CNZ ESGA025',
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
        calificador_oficial: 'Dr. Zootecnista CNZ ESGA025',
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
    await this.db.putBatch('lotes', lotesSemilla);

    if (forzar) {
      await this.cargarDatos();
      this.poblarSelectores();
      this.renderizarCenso();
      this.actualizarKPIs();
      this.renderizarLotes();
      alert('Censo Semilla ESGA025 recargado correctamente.');
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
        this.estado.animales = animalesRemotos;
        this.renderizarCenso();
        this.actualizarKPIs();
      }
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
          item.payload.fotos = fotosUrls;

          const { error } = await this.supabaseClient.from('animales').upsert(item.payload);
          if (!error) {
            await this.db.delete('syncQueue', item.id);
            sincronizados++;
          }
        } else if (item.tipo === 'INSPECCION') {
          const { error } = await this.supabaseClient.from('inspecciones_morfologicas').upsert(item.payload);
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
        }
      } catch (err) {
        console.error('[SyncQueue] Error al sincronizar item:', item, err);
      }
    }

    this.estado.syncQueue = await this.db.getAll('syncQueue');
    this.actualizarContadorSyncQueue();
    if (manual) {
      alert(`Sincronización completada. Se enviaron ${sincronizados} elementos a Supabase.`);
    }
  },

  // Subir imagen en Base64 al Storage Bucket 'fotos-alacantina'
  async subirFotoStorage(animalId, tipoFoto, base64Data) {
    if (!this.supabaseClient) return null;
    try {
      const blob = this.base64ToBlob(base64Data);
      const filePath = `${animalId}/${tipoFoto}_${Date.now()}.jpg`;

      const { data, error } = await this.supabaseClient.storage
        .from('fotos-alacantina')
        .upload(filePath, blob, {
          contentType: 'image/jpeg',
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
    if (badge) {
      if (count > 0) {
        badge.textContent = count;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
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

  // Procesamiento y compresión en cliente de las 3 tomas fotográficas obligatorias
  procesarCapturaFoto(tipoToma, inputElement) {
    const file = inputElement.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // Redimensionar y comprimir en canvas para optimizar almacenamiento y offline
        const canvas = document.createElement('canvas');
        const maxDim = 1200;
        let width = img.width;
        let height = img.height;

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

        const base64Jpeg = canvas.toDataURL('image/jpeg', 0.82);

        // Guardar en el estado temporal
        this.estado.fotosCapturadas[tipoToma] = base64Jpeg;

        // Actualizar UI
        const slot = document.getElementById(`slot-${tipoToma}`);
        const placeholder = document.getElementById(`preview-${tipoToma}-placeholder`);
        const previewImg = document.getElementById(`preview-${tipoToma}-img`);

        if (previewImg) {
          previewImg.src = base64Jpeg;
          previewImg.classList.remove('hidden');
        }
        if (placeholder) placeholder.classList.add('hidden');
        if (slot) slot.classList.add('filled');
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
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

    const sexo = document.getElementById('alta-sexo').value;
    const anilla = document.getElementById('alta-anilla').value.trim();
    const codigoId = document.getElementById('alta-codigo-id').value.trim();
    const nombre = document.getElementById('alta-nombre').value.trim();
    const fechaNac = document.getElementById('alta-fecha-nac').value;
    const variedad = document.getElementById('alta-variedad').value;
    const seccion = document.getElementById('alta-seccion').value;
    const explotacionId = document.getElementById('alta-explotacion').value;
    const familia = document.getElementById('alta-familia').value;
    const padreId = document.getElementById('alta-padre').value || null;
    const madreId = document.getElementById('alta-madre').value || null;
    const peso = parseFloat(document.getElementById('alta-peso').value);
    const notas = document.getElementById('alta-notas').value.trim();

    // Validar anilla duplicada
    if (this.estado.animales.some(a => a.numero_anilla === anilla)) {
      alert(`Error: Ya existe un ejemplar registrado con el número de anilla ${anilla}.`);
      return;
    }

    // Calcular Fx
    const fx = (padreId && madreId) 
      ? this.zootecnia.calcularFxDescendencia(padreId, madreId, this.estado.animales) 
      : 0.0;

    const calibre = sexo === 'Macho' ? 20.0 : 18.0;

    const nuevoAnimal = {
      id: 'alac-' + Date.now(),
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
      familia_origen: familia,
      peso_actual_kg: peso,
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
        tarsos: this.estado.fotosCapturadas.tarsos
      },
      geolocalizacion_alta: this.estado.gpsUbicacion,
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

    alert(`¡Ejemplar ${nuevoAnimal.codigo_identificacion} dado de alta con éxito en el Libro Genealógico ESGA025!`);
    this.cambiarTab('censo');
  },

  limpiarFormularioAlta() {
    document.getElementById('form-alta-animal').reset();
    document.getElementById('alta-fecha-nac').valueAsDate = new Date();
    this.estado.fotosCapturadas = { lateral: null, cabeza: null, tarsos: null };
    this.estado.gpsUbicacion = null;

    ['lateral', 'cabeza', 'tarsos'].forEach(tipo => {
      const slot = document.getElementById(`slot-${tipo}`);
      const placeholder = document.getElementById(`preview-${tipo}-placeholder`);
      const previewImg = document.getElementById(`preview-${tipo}-img`);
      if (previewImg) { previewImg.src = ''; previewImg.classList.add('hidden'); }
      if (placeholder) placeholder.classList.remove('hidden');
      if (slot) slot.classList.remove('filled');
    });

    document.getElementById('gps-display-box').classList.add('hidden');
    document.getElementById('alta-fx-preview').classList.add('hidden');
    this.actualizarReglasSexo();
    this.generarAnillaSiguiente();
  },

  // =========================================================================
  // 4. PESTAÑA 2: CENSO OFICIAL, FILTROS Y MODAL DE FICHA INDIVIDUAL
  // =========================================================================
  filtrarCenso() {
    const busqueda = document.getElementById('filtro-buscar').value.toLowerCase().trim();
    const seccion = document.getElementById('filtro-seccion').value;
    const sexo = document.getElementById('filtro-sexo').value;
    const familia = document.getElementById('filtro-familia').value;

    this.estado.filtros = { busqueda, seccion, sexo, familia };
    this.renderizarCenso();
  },

  renderizarCenso() {
    const tbody = document.getElementById('tabla-censo-body');
    const msgVacio = document.getElementById('censo-vacio-msg');
    if (!tbody) return;

    tbody.innerHTML = '';

    const filtrados = this.estado.animales.filter(a => {
      const f = this.estado.filtros;
      if (f.seccion !== 'TODAS' && a.seccion_libro !== f.seccion) return false;
      if (f.sexo !== 'TODOS' && a.sexo !== f.sexo) return false;
      if (f.familia !== 'TODAS' && a.familia_origen !== f.familia) return false;
      if (f.busqueda) {
        const txt = `${a.numero_anilla} ${a.codigo_identificacion} ${a.nombre || ''} ${a.variedad}`.toLowerCase();
        if (!txt.includes(f.busqueda)) return false;
      }
      return true;
    });

    if (filtrados.length === 0) {
      if (msgVacio) msgVacio.classList.remove('hidden');
      return;
    } else {
      if (msgVacio) msgVacio.classList.add('hidden');
    }

    filtrados.forEach(animal => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-800/40 transition border-b border-slate-800/60';

      const colorSeccion = this.obtenerColorBadgeSeccion(animal.seccion_libro);
      const fx = (animal.coeficiente_consanguinidad || 0);
      const fxColor = fx > 0.0625 ? 'text-red-400 font-bold' : (fx > 0.03 ? 'text-amber-400' : 'text-emerald-400');

      // Foto miniatura
      const fotoThumb = animal.fotos?.lateral || './icons/logo.png';

      tr.innerHTML = `
        <td class="py-3 px-3">
          <div class="flex items-center gap-2.5">
            <img src="${fotoThumb}" onerror="this.src='./icons/icon-192.png'" class="h-9 w-9 rounded-md object-cover border border-slate-700 bg-slate-950 cursor-pointer" onclick="app.verFichaAnimal('${animal.id}')" title="Ver ficha">
            <div>
              <span class="font-bold text-white font-mono text-xs block cursor-pointer hover:text-amber-400" onclick="app.verFichaAnimal('${animal.id}')">#${animal.numero_anilla}</span>
              <span class="text-[10px] text-slate-400 font-sans">${animal.nombre || 'Sin alias'}</span>
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
          <span class="text-xs text-slate-400" title="3 tomas oficiales">
            <i class="fa-solid fa-camera ${animal.fotos?.lateral ? 'text-emerald-400' : 'text-slate-600'}"></i>
          </span>
        </td>
        <td class="py-3 px-3 text-center">
          <div class="flex items-center justify-center gap-1.5 font-sans">
            <button onclick="app.verFichaAnimal('${animal.id}')" class="p-1 rounded hover:bg-slate-700 text-sky-400" title="Ficha completa">
              <i class="fa-solid fa-eye"></i>
            </button>
            <button onclick="app.abrirInspeccionDirecta('${animal.id}')" class="p-1 rounded hover:bg-slate-700 text-emerald-400" title="Calificar 100p">
              <i class="fa-solid fa-clipboard-check"></i>
            </button>
            <button onclick="app.abrirPedigriDirecto('${animal.id}')" class="p-1 rounded hover:bg-slate-700 text-purple-400" title="Pedigrí a 5 generaciones">
              <i class="fa-solid fa-sitemap"></i>
            </button>
            <button onclick="app.imprimirCertificadoDirecto('${animal.id}')" class="p-1 rounded hover:bg-slate-700 text-amber-400" title="Certificado Oficial PDF">
              <i class="fa-solid fa-print"></i>
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
    
    const badgeSec = document.getElementById('mf-badge-seccion');
    badgeSec.textContent = animal.seccion_libro;
    badgeSec.className = `px-2 py-0.5 rounded text-xs font-bold ${this.obtenerColorBadgeSeccion(animal.seccion_libro)}`;

    // Fotos de las 3 tomas
    const defFoto = './icons/logo.png';
    document.getElementById('mf-foto-lateral').src = animal.fotos?.lateral || defFoto;
    document.getElementById('mf-foto-cabeza').src = animal.fotos?.cabeza || defFoto;
    document.getElementById('mf-foto-tarsos').src = animal.fotos?.tarsos || defFoto;

    document.getElementById('mf-anilla-calibre').textContent = `${animal.numero_anilla} (${animal.calibre_anilla_mm || (animal.sexo === 'Macho' ? 20 : 18)} mm)`;
    document.getElementById('mf-nacimiento').textContent = animal.fecha_nacimiento || '--';
    document.getElementById('mf-peso').textContent = animal.peso_actual_kg ? `${animal.peso_actual_kg.toFixed(3)} kg` : '--';
    document.getElementById('mf-familia').textContent = animal.familia_origen || 'Familia A';
    
    const fx = animal.coeficiente_consanguinidad || 0;
    document.getElementById('mf-fx').textContent = `${fx.toFixed(5)} (${(fx * 100).toFixed(2)}%)`;
    document.getElementById('mf-estado').textContent = animal.estado || 'Activo';

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
    this.imprimirCertificadoDirecto(id);
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
    document.getElementById('lightbox-img').src = src;
    document.getElementById('lightbox-caption').textContent = titulos[tipoToma] || 'Fotografía in situ';
    document.getElementById('modal-lightbox').classList.remove('hidden');
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

    const calificador = document.getElementById('inspeccion-calificador').value.trim() || 'Calificador Oficial CNZ';

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
    const animalId = document.getElementById('inspeccion-animal-select').value;
    if (!animalId) {
      alert('Por favor, selecciona primero una gallina en el selector superior.');
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

    const conforme = (pesoHuevo >= 55.0 && pesoHuevo <= 70.0 && colorCascara.includes('crema'));

    const nuevoControl = {
      id: 'puesta-' + Date.now(),
      animal_id: animalId,
      fecha_inicio: fInicio,
      fecha_fin: fFin,
      total_huevos_15d: totalHuevos,
      peso_medio_huevo_g: pesoHuevo,
      color_cascara: colorCascara,
      calidad_cascara: 'Buena',
      conforme_estandar: conforme,
      observaciones: `Prueba individual de 15 días: ${totalHuevos} huevos. Peso medio: ${pesoHuevo} g.`
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
    alert(`Control de puesta registrado con éxito. Conforme al estándar racial: ${conforme ? 'SÍ' : 'NO'}.`);
    document.getElementById('form-control-puesta').reset();
  },

  // =========================================================================
  // 6. PESTAÑA 4: PEDIGRÍ A 5 GENERACIONES, WRIGHT Fx & MATRIZ Ne
  // =========================================================================
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

  // Simulador de Apareamiento Preventivo (Gallo x Gallina)
  simularCrucePreventivo() {
    const machoId = document.getElementById('sim-macho').value;
    const hembraId = document.getElementById('sim-hembra').value;
    const resultadoEl = document.getElementById('sim-fx-resultado');
    const recEl = document.getElementById('sim-recomendacion');

    if (!machoId || !hembraId) {
      resultadoEl.textContent = '--';
      recEl.textContent = 'Selecciona ambos reproductores para simular el apareamiento.';
      return;
    }

    const fx = this.zootecnia.calcularFxDescendencia(machoId, hembraId, this.estado.animales);
    const fxPct = (fx * 100).toFixed(3);

    resultadoEl.textContent = `${fx.toFixed(5)} (${fxPct}%)`;

    if (fx > 0.0625) {
      resultadoEl.className = 'font-mono font-bold text-sm text-red-400';
      recEl.className = 'text-[11px] text-red-400 font-semibold';
      recEl.innerHTML = `⚠️ <strong>CRUCE DESACONSEJADO:</strong> Consanguinidad esperada elevada (${fxPct}%). Alto riesgo de depresión consanguínea y pérdida de vigor híbrido según CNZ.`;
    } else if (fx > 0.03) {
      resultadoEl.className = 'font-mono font-bold text-sm text-amber-400';
      recEl.className = 'text-[11px] text-amber-400 font-semibold';
      recEl.innerHTML = `⚡ <strong>CRUCE MODERADO:</strong> Consanguinidad tolerable (${fxPct}%). Se recomienda compensar en la siguiente generación con otra familia.`;
    } else {
      resultadoEl.className = 'font-mono font-bold text-sm text-emerald-400';
      recEl.className = 'text-[11px] text-emerald-400 font-semibold';
      recEl.innerHTML = `✓ <strong>CRUCE ÓPTIMO RECOMENDADO:</strong> Consanguinidad muy baja (${fxPct}%). Cumple con el objetivo de mantenimiento de la variabilidad genética ESGA025.`;
    }
  },

  // Exportador CSV de Matriz de Pedigrí para Ne (ENDOG / CFC / R)
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

  // Generador de Certificado Oficial PDF
  generarCertificadoActual() {
    const animalId = document.getElementById('pedigri-animal-select').value;
    if (!animalId) {
      alert('Selecciona un ejemplar para generar su Certificado Genealógico.');
      return;
    }
    this.imprimirCertificadoDirecto(animalId);
  },

  imprimirCertificadoDirecto(animalId) {
    const animal = this.estado.animales.find(a => a.id === animalId);
    if (!animal) return;

    // Buscar ancestros a 3 generaciones
    const padre = this.estado.animales.find(a => a.id === animal.id_padre);
    const madre = this.estado.animales.find(a => a.id === animal.id_madre);

    const abuelo_pp = padre ? this.estado.animales.find(a => a.id === padre.id_padre) : null;
    const abuela_pm = padre ? this.estado.animales.find(a => a.id === padre.id_madre) : null;
    const abuelo_mp = madre ? this.estado.animales.find(a => a.id === madre.id_padre) : null;
    const abuela_mm = madre ? this.estado.animales.find(a => a.id === madre.id_madre) : null;

    const ancestros = {
      padre, madre,
      abuelo_pp, abuela_pm, abuelo_mp, abuela_mm
    };

    if (window.PDFEngine) {
      window.PDFEngine.generarCertificadoGenealogico(animal, ancestros);
    } else {
      alert('Motor de PDF no disponible.');
    }
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

    // Filtrar select de gallos destacando los de esa familia
    const selectGallo = document.getElementById('lote-gallo');
    if (selectGallo) {
      const machos = this.estado.animales.filter(a => a.sexo === 'Macho');
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

    if (!this.estado.lotes || this.estado.lotes.length === 0) {
      cont.innerHTML = '<p class="text-xs text-slate-500">No hay lotes de apareamiento registrados actualmente.</p>';
      return;
    }

    cont.innerHTML = '';
    this.estado.lotes.forEach(l => {
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
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-nav-btn').forEach(btn => {
      btn.className = 'tab-nav-btn flex items-center gap-2 px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold transition text-slate-400 hover:text-white hover:bg-slate-800';
    });

    const targetTab = document.getElementById(`tab-${tabName}`);
    const targetBtn = document.getElementById(`tab-btn-${tabName}`);

    if (targetTab) targetTab.classList.add('active');
    if (targetBtn) {
      targetBtn.className = 'tab-nav-btn flex items-center gap-2 px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold transition text-amber-400 bg-slate-800 border border-amber-500/30';
    }

    window.location.hash = tabName;
  },

  poblarSelectores() {
    // Select Explotaciones
    const selectExp = document.getElementById('alta-explotacion');
    if (selectExp) {
      selectExp.innerHTML = '';
      this.estado.explotaciones.forEach(e => {
        const opt = document.createElement('option');
        opt.value = e.id;
        opt.textContent = `${e.codigo_rega} - ${e.nombre_titular} (${e.municipio})`;
        selectExp.appendChild(opt);
      });
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

    this.sugerirMachoGobe(document.getElementById('lote-familia-receptora')?.value || 'Familia B');
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
  }
};

// Iniciar aplicación al cargar el DOM
window.addEventListener('DOMContentLoaded', () => {
  window.app = app;
  app.init();
});
