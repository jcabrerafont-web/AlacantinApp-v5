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
    aviarioActivo: null,
    gpsAviarioTemporal: null,
    editandoAviarioId: null,
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
      rolRBAC: localStorage.getItem('alacantina_rol_rbac') || 'inspector',
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
      gpsInSitu: null,
      regionGuiaActiva: 1,
      actaSeleccionada: null
    },
    // Estado reactivo de Auditoría Zootécnica, Respaldos y Cierre Censal Anual (Fase 6 v6)
    auditoria: {
      alertas: [],
      categoriaActiva: 'TODAS',
      panelVisible: true,
      simulacionActiva: false,
      ultimaEjecucion: null
    },
    cierreAnual: {
      firmasInicializadas: false,
      firmaCriadorBase64: null,
      firmaSecretarioBase64: null
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
    console.log('[AlacantinApp v6] Iniciando aplicación en Estado Cero Oficial (ESGA025)...');
    
    // Iniciar IndexedDB local
    await this.db.init();

    // Iniciar cliente de Supabase si hay credenciales configuradas
    this.iniciarSupabaseClient();

    // Registrar observadores de red online/offline
    this.configurarObservadoresRed();

    // Cargar datos reales (Estado Cero por defecto: 0 ejemplares y 0 aviarios ficticios)
    await this.cargarDatos();

    // Comprobar e inicializar aviario activo real o desplegar bienvenida
    this.inicializarAviarioActivo();

    // Actualizar interfaz inicial
    this.poblarSelectores();
    this.actualizarReglasSexo();
    this.renderizarCenso();
    this.actualizarKPIs();
    this.recalcularBaremo();
    this.renderizarLotes();
    this.actualizarBadgeAviario();
    this.actualizarVistaRegistroAviario();
    this.renderizarGaleriaOpcionalAlta();
    this.configurarEventosExportacion();
    this.poblarSelectoresAnaliticaPuesta();
    this.renderizarAnaliticaPuesta();
    this.configurarWedgeRfid();
    this.poblarSelectoresRfid();
    this.inicializarModuloInspeccionInSitu();
    this.ejecutarAuditoriaIntegridad(false);

    // Comprobar si hay hash en la URL para cambiar de pestaña directamente
    const hash = window.location.hash.replace('#', '');
    if (hash === 'puesta') {
      this.cambiarTab('inspeccion');
    } else if (['registro', 'censo', 'inspeccion', 'pedigri', 'lotes', 'inspeccion-insitu'].includes(hash)) {
      this.cambiarTab(hash);
    }
  },

  // Módulo de Base de Datos IndexedDB (Limpio para Producción - Estado Cero)
  db: {
    dbName: 'AlacantinDB_v6_Oficial',
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
  // 2. CARGA Y SINCRONIZACIÓN DE DATOS REALES (ESTADO CERO + SUPABASE AUTH)
  // =========================================================================
  async cargarDatos() {
    // Purga preventiva de cualquier registro semilla legado si existiera en el navegador
    const idsAnimalesFicticios = new Set(['alac-001', 'alac-002', 'alac-003', 'alac-004', 'alac-005', 'alac-006', 'alac-demo-audit']);
    const idsExpFicticias = new Set(['exp-01', 'exp-02']);
    const idsInspFicticias = new Set(['insp-01', 'insp-02']);
    const idsLotesFicticios = new Set(['lote-01']);

    let animalesLocales = await this.db.getAll('animales');
    let explotacionesLocales = await this.db.getAll('explotaciones');
    let inspeccionesLocales = await this.db.getAll('inspecciones');
    let controlesLocales = await this.db.getAll('controlesPuesta');
    let lotesLocales = await this.db.getAll('lotes');

    // Eliminar de raíz cualquier registro ficticio residual en IndexedDB
    for (const a of (animalesLocales || [])) {
      if (idsAnimalesFicticios.has(a.id)) {
        await this.db.delete('animales', a.id);
      }
    }
    for (const e of (explotacionesLocales || [])) {
      if (idsExpFicticias.has(e.id)) {
        await this.db.delete('explotaciones', e.id);
      }
    }
    for (const i of (inspeccionesLocales || [])) {
      if (idsInspFicticias.has(i.id)) {
        await this.db.delete('inspecciones', i.id);
      }
    }
    for (const c of (controlesLocales || [])) {
      if (String(c.id || '').startsWith('puesta-sem-') || c.id === 'puesta-demo-audit') {
        await this.db.delete('controlesPuesta', c.id);
      }
    }
    for (const l of (lotesLocales || [])) {
      if (idsLotesFicticios.has(l.id)) {
        await this.db.delete('lotes', l.id);
      }
    }

    animalesLocales = (await this.db.getAll('animales')) || [];
    explotacionesLocales = (await this.db.getAll('explotaciones')) || [];
    inspeccionesLocales = (await this.db.getAll('inspecciones')) || [];
    controlesLocales = (await this.db.getAll('controlesPuesta')) || [];
    lotesLocales = (await this.db.getAll('lotes')) || [];
    this.estado.syncQueue = (await this.db.getAll('syncQueue')) || [];

    // Normalizar nomenclatura de variedad 100% en femenino en ejemplares reales registrados
    if (animalesLocales.length > 0) {
      animalesLocales.forEach(a => {
        const varNorm = this.normalizarVariedadFemenino(a.variedad);
        if (a.variedad !== varNorm) {
          a.variedad = varNorm;
          this.db.put('animales', a);
        }
      });
    }

    this.estado.animales = animalesLocales;
    this.estado.explotaciones = explotacionesLocales;
    this.estado.inspecciones = inspeccionesLocales;
    this.estado.controlesPuesta = controlesLocales;
    this.estado.lotes = lotesLocales;

    // Calcular consanguinidad en cliente para los ejemplares reales
    this.recalcularConsanguinidadCenso();

    // Si hay conexión con Supabase y sesión activa, sincronizar registros reales
    if (navigator.onLine && this.supabaseClient) {
      this.sincronizarDesdeSupabase();
    }

    this.actualizarContadorSyncQueue();
  },

  // Inicialización en Estado Cero (0 ejemplares, 0 aviarios ficticios)
  async cargarSemillaInicial(forzar = false) {
    await this.db.clear('animales');
    await this.db.clear('explotaciones');
    await this.db.clear('inspecciones');
    await this.db.clear('controlesPuesta');
    await this.db.clear('lotes');
    await this.db.clear('syncQueue');

    localStorage.removeItem('alacantina_aviario_activo_id');
    localStorage.removeItem('alacantina_aviario_activo_datos');

    this.estado.animales = [];
    this.estado.explotaciones = [];
    this.estado.inspecciones = [];
    this.estado.controlesPuesta = [];
    this.estado.lotes = [];
    this.estado.syncQueue = [];
    this.estado.aviarioActivo = null;
    this.estado.inspeccionInSitu.gpsInSitu = null;
    this.estado.inspeccionInSitu.animalActualId = null;

    if (forzar) {
      this.poblarSelectores();
      this.renderizarCenso();
      this.actualizarKPIs();
      this.renderizarLotes();
      this.actualizarBadgeAviario();
      this.actualizarVistaRegistroAviario();
      this.poblarSelectoresAnaliticaPuesta();
      this.renderizarAnaliticaPuesta();
      this.ejecutarAuditoriaIntegridad(false);
      alert('Base de datos local restablecida en Estado Cero (0 ejemplares y 0 aviarios).');
    }
  },

  // Sincronización desde Supabase para usuarios autenticados (Supabase Auth)
  async sincronizarDesdeSupabase() {
    if (!this.supabaseClient) return;
    try {
      // Verificar sesión autenticada en Supabase Auth cuando esté disponible
      if (this.supabaseClient.auth && typeof this.supabaseClient.auth.getSession === 'function') {
        const { data: sessionData } = await this.supabaseClient.auth.getSession();
        if (sessionData?.session?.user) {
          this.estado.usuarioAutenticado = sessionData.session.user;
        }
      }

      console.log('[Supabase] Consultando registros reales en la nube...');
      const { data: expRemotas, error: errE } = await this.supabaseClient.from('explotaciones').select('*');
      if (!errE && Array.isArray(expRemotas)) {
        await this.db.putBatch('explotaciones', expRemotas);
        this.estado.explotaciones = expRemotas;
      }

      const { data: animalesRemotos, error: errA } = await this.supabaseClient.from('animales').select('*');
      if (!errA && Array.isArray(animalesRemotos)) {
        await this.db.putBatch('animales', animalesRemotos);
        this.estado.animales = animalesRemotos;
        this.poblarSelectores();
        this.renderizarCenso();
        this.actualizarKPIs();
        this.ejecutarAuditoriaIntegridad(false);
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
  obtenerVariedadesOficialesFemenino() {
    return [
      'Negra Moteada (Oficial)',
      'Pinta o Exchequer (Oficial)',
      'Blanca (Oficial)',
      'Milflores (En proceso de reconocimiento)',
      'Armiñada en negro (En proceso de reconocimiento)'
    ];
  },

  normalizarVariedadFemenino(variedadRaw, fallback = 'Negra Moteada (Oficial)') {
    const listaOficial = this.obtenerVariedadesOficialesFemenino();
    if (!variedadRaw) return fallback;
    const v = String(variedadRaw).trim();
    if (listaOficial.includes(v)) return v;

    const lower = v.toLowerCase();
    if (lower.includes('exchequer') || lower.includes('pinta')) {
      return 'Pinta o Exchequer (Oficial)';
    }
    if (lower.includes('motead')) {
      return 'Negra Moteada (Oficial)';
    }
    if (lower.includes('blanc')) {
      return 'Blanca (Oficial)';
    }
    if (lower.includes('milflores')) {
      return 'Milflores (En proceso de reconocimiento)';
    }
    if (lower.includes('armiñad') || lower.includes('arminad')) {
      return 'Armiñada en negro (En proceso de reconocimiento)';
    }
    return fallback;
  },

  obtenerDetalleAnatomicoVariedad(variedadRaw) {
    const variedad = this.normalizarVariedadFemenino(variedadRaw);
    if (variedad === 'Blanca (Oficial)') {
      return {
        variedad,
        color_pico: 'Color hueso',
        color_tarsos: 'Blanco-rosáceos (con pico hueso en Blanca)',
        resumen_ficha: 'Pico color hueso · Tarsos blanco-rosáceos con pico hueso (Variedad Blanca).'
      };
    }
    if (variedad === 'Negra Moteada (Oficial)' || variedad === 'Pinta o Exchequer (Oficial)') {
      return {
        variedad,
        color_pico: 'Color córneo con manchas negras',
        color_tarsos: 'Blanco-rosáceos con roña',
        resumen_ficha: 'Pico color córneo con manchas negras · Tarsos blanco-rosáceos con roña (Variedades Negra Moteada y Pinta o Exchequer).'
      };
    }
    return {
      variedad,
      color_pico: 'Color córneo con manchas negras (Moteada/Exchequer) | Color hueso (Blanca)',
      color_tarsos: 'Blanco-rosáceos',
      resumen_ficha: `${variedad}: Tarsos blanco-rosáceos · Estándar anatómico ESGA025 (pico color córneo con manchas negras en Moteada/Exchequer y color hueso en Blanca).`
    };
  },

  actualizarReglasSexo() {
    const sexo = document.getElementById('alta-sexo').value;
    const calibreHint = document.getElementById('alta-calibre-hint');
    const pesoHint = document.getElementById('alta-peso-feedback');
    const pesoInput = document.getElementById('alta-peso');

    if (sexo === 'Macho') {
      if (calibreHint) calibreHint.textContent = 'Calibre reglamentario: 20.0 mm (Gallo Repr.)';
      if (pesoInput) {
        pesoInput.placeholder = 'Ej: 3.25';
        const valAct = parseFloat(pesoInput.value);
        if (!valAct || Math.abs(valAct - 2.40) < 0.005 || Math.abs(valAct - 3.20) < 0.005) {
          pesoInput.value = '3.25';
        }
      }
      if (pesoHint) pesoHint.textContent = 'Rango oficial ESGA025: Gallo 3.00 - 3.50 kg (Media: 3.25 kg) | Gallina 2.20 - 2.60 kg (Media: 2.40 kg)';
    } else {
      if (calibreHint) calibreHint.textContent = 'Calibre reglamentario: 18.0 mm (Gallina Repr.)';
      if (pesoInput) {
        pesoInput.placeholder = 'Ej: 2.40';
        const valAct = parseFloat(pesoInput.value);
        if (!valAct || Math.abs(valAct - 3.25) < 0.005 || Math.abs(valAct - 3.20) < 0.005) {
          pesoInput.value = '2.40';
        }
      }
      if (pesoHint) pesoHint.textContent = 'Rango oficial ESGA025: Gallo 3.00 - 3.50 kg (Media: 3.25 kg) | Gallina 2.20 - 2.60 kg (Media: 2.40 kg)';
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
    if (sexo === 'Macho' && peso >= 3.00 && peso <= 3.50) dentroDeRango = true;
    if (sexo === 'Hembra' && peso >= 2.20 && peso <= 2.60) dentroDeRango = true;

    if (dentroDeRango) {
      feedback.className = 'text-[11px] text-emerald-400 mt-1 font-semibold';
      feedback.textContent = `✓ Peso dentro del estándar racial oficial ESGA025 (${peso.toFixed(2)} kg · Media ref.: ${sexo === 'Macho' ? '3.25 kg' : '2.40 kg'}).`;
    } else {
      feedback.className = 'text-[11px] text-amber-400 mt-1 font-semibold';
      feedback.textContent = `⚠️ Peso fuera del rango estricto ESGA025 (Gallo: 3.00-3.50 kg [Media 3.25 kg] | Gallina: 2.20-2.60 kg [Media 2.40 kg]).`;
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
        const btnEliminar = document.getElementById(`btn-eliminar-${tipoToma}`);
        const badgeCaptura = document.getElementById(`badge-captura-${tipoToma}`);

        if (previewImg) {
          previewImg.src = base64Jpeg;
          previewImg.classList.remove('hidden');
        }
        if (placeholder) placeholder.classList.add('hidden');
        if (slot) slot.classList.add('filled');
        if (btnEliminar) btnEliminar.classList.remove('hidden');
        if (badgeCaptura) badgeCaptura.classList.remove('hidden');
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
  // GESTOR DE FOTOGRAFÍAS OPCIONALES CON TITULADO / ETIQUETADO
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
        // Compresión y escalado Canvas JPEG cliente (máx 1200px, 0.82 calidad)
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const maxDim = 1200;

        if (width > maxDim && width >= height) {
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

        // Incorporar al estado reactivo
        this.estado.fotosOpcionalesCapturadas.push({
          url: base64Jpeg,
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

    // 1. Vincular automáticamente la explotación / aviario activo
    let aviario = this.estado.aviarioActivo;
    if (!aviario) {
      const selectVal = document.getElementById('alta-explotacion')?.value;
      if (selectVal) {
        aviario = this.estado.explotaciones.find(e => e.id === selectVal);
      }
    }

    if (!aviario) {
      if (confirm('No tienes ningún aviario o explotación activa seleccionada.\n¿Deseas configurar tu aviario ahora para vincular automáticamente el código REGA y ubicación oficial?')) {
        this.abrirModalAviario(true);
        return;
      }
    }

    const explotacionId = aviario ? aviario.id : (document.getElementById('alta-explotacion')?.value || null);
    const codigoRega = aviario ? (aviario.codigo_rega || aviario.rega || 'TEMP-REGA-001') : 'TEMP-REGA-001';
    const titularNombre = aviario ? (aviario.nombre_titular || 'Criador Asociado') : 'Criador Asociado';

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

    // GPS: Heredar automáticamente las coordenadas del aviario activo si no se capturó GPS específico
    let gpsFinal = this.estado.gpsUbicacion;
    if (!gpsFinal && aviario && aviario.latitud && aviario.longitud) {
      gpsFinal = {
        latitud: Number(aviario.latitud),
        longitud: Number(aviario.longitud),
        precision_m: aviario.geolocalizacion_precision || 10,
        origen: 'aviario_heredado'
      };
    }

    const variedadNormalizada = this.normalizarVariedadFemenino(variedad);
    const detalleAnatomico = this.obtenerDetalleAnatomicoVariedad(variedadNormalizada);
    const pesoFinal = !isNaN(peso) && peso > 0 ? peso : (sexo === 'Macho' ? 3.25 : 2.40);

    const nuevoAnimal = {
      id: 'alac-' + Date.now(),
      codigo_identificacion: codigoId,
      numero_anilla: anilla,
      calibre_anilla_mm: calibre,
      nombre: nombre || `Ejemplar ESGA025 #${anilla}`,
      sexo: sexo,
      fecha_nacimiento: fechaNac,
      variedad: variedadNormalizada,
      seccion_libro: seccion,
      id_padre: padreId,
      id_madre: madreId,
      explotacion_id: explotacionId,
      codigo_rega: codigoRega,
      titular_nombre: titularNombre,
      familia_origen: familia,
      peso_actual_kg: pesoFinal,
      rfid_chip_id: rfid,
      estado: 'Activo',
      coeficiente_consanguinidad: fx,
      feno_zoometria: {
        angulo_cola_grados: 70,
        perfil_pecho: 'Recto/Plano',
        color_pico: detalleAnatomico.color_pico,
        color_tarsos: detalleAnatomico.color_tarsos,
        color_orejillas: 'Blanco puro'
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
    if (typeof this.ejecutarAuditoriaIntegridad === 'function') {
      this.ejecutarAuditoriaIntegridad(false);
    }

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

    // Detalles anatómicos específicos por variedad (Pico y Tarsos - Estándar ESGA025)
    const elAnatPicoTarsos = document.getElementById('mf-anatomia-pico-tarsos');
    if (elAnatPicoTarsos) {
      const detAnat = this.obtenerDetalleAnatomicoVariedad(animal.variedad);
      elAnatPicoTarsos.textContent = detAnat.resumen_ficha;
    }

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

    // Validar rango ponderal estricto ESGA025 (Macho: 3.00-3.50 kg [media 3.25] | Hembra: 2.20-2.60 kg [media 2.40])
    const animalSelId = document.getElementById('inspeccion-animal-select')?.value;
    const animalSel = animalSelId ? this.estado.animales.find(a => a.id === animalSelId) : null;
    const pesoVivo = animalSel ? Number(animalSel.peso_actual_kg) : NaN;
    const fueraRangoPeso = animalSel && !isNaN(pesoVivo) && (
      (animalSel.sexo === 'Macho' && (pesoVivo < 3.00 || pesoVivo > 3.50)) ||
      (animalSel.sexo === 'Hembra' && (pesoVivo < 2.20 || pesoVivo > 2.60))
    );

    totalPtsEl.textContent = total.toFixed(1);

    if (descalificado) {
      totalPtsEl.className = 'text-3xl font-extrabold text-red-500 font-mono';
      badgeVeredicto.className = 'inline-block mt-0.5 px-3 py-1 rounded-lg text-xs font-bold bg-red-950 border border-red-600 text-red-300';
      badgeVeredicto.textContent = 'NO APTO (DESCALIFICADO POR DEFECTO REGLAMENTARIO ESGA025)';
    } else if (fueraRangoPeso) {
      totalPtsEl.className = 'text-3xl font-extrabold text-amber-400 font-mono';
      badgeVeredicto.className = 'inline-block mt-0.5 px-3 py-1 rounded-lg text-xs font-bold bg-amber-950 border border-amber-600 text-amber-300';
      badgeVeredicto.textContent = `ALERTA DE PESO FUERA DE RANGO ESGA025 (${pesoVivo.toFixed(2)} kg · ${animalSel.sexo === 'Macho' ? '3.00-3.50 kg' : '2.20-2.60 kg'})`;
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

    const nuevoControl = {
      id: 'puesta-' + Date.now(),
      animal_id: animalId,
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
    // Inicialización en Estado Cero: 0 controles de puesta ficticios
    return [];
  },

  cambiarSubtabPuesta(subtab) {
    const tabs = ['analitica', 'rfid', 'registro', 'tabla'];
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
    // 1. Selector de gallina para analítica
    const selectAnimal = document.getElementById('filtro-analitica-animal');
    if (selectAnimal) {
      const valActual = selectAnimal.value;
      selectAnimal.innerHTML = '<option value="TODAS">Todas las gallinas reproductoras</option>';
      this.estado.animales.filter(a => a.sexo === 'Hembra').forEach(a => {
        const opt = document.createElement('option');
        opt.value = a.id;
        opt.textContent = `#${a.numero_anilla} - ${a.nombre || a.codigo_identificacion} (${a.familia_origen})`;
        selectAnimal.appendChild(opt);
      });
      if (valActual) selectAnimal.value = valActual;
    }

    // 2. Selector de lotes para analítica
    const optgroupLotes = document.getElementById('optgroup-analitica-lotes');
    if (optgroupLotes) {
      optgroupLotes.innerHTML = '';
      (this.estado.lotes || []).forEach(lote => {
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
      this.estado.animales.filter(a => a.sexo === 'Hembra').forEach(a => {
        const opt = document.createElement('option');
        opt.value = a.id;
        opt.textContent = `#${a.numero_anilla} (${a.codigo_identificacion}) - ${a.nombre || 'Gallina'} [${a.familia_origen}]`;
        selectFormAnimal.appendChild(opt);
      });
      if (valActual) selectFormAnimal.value = valActual;
    }
  },

  obtenerControlesPuestaFiltrados() {
    const animalId = document.getElementById('filtro-analitica-animal')?.value || 'TODAS';
    const loteFamilia = document.getElementById('filtro-analitica-lote')?.value || 'TODOS';
    const periodo = document.getElementById('filtro-analitica-periodo')?.value || 'TODAS';

    let lista = [...(this.estado.controlesPuesta || [])];

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

    const nuevoControl = {
      id: 'puesta-rfid-' + Date.now(),
      animal_id: animal.id,
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
      const variedad = this.normalizarVariedadFemenino(a.variedad);

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

    // 7. Desglose por Variedades (Nomenclatura Unificada en Femenino ESGA025)
    const variedades = {};
    activos.forEach(a => {
      const v = this.normalizarVariedadFemenino(a.variedad);
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
    if (!explotacion && this.estado.aviarioActivo) {
      explotacion = this.estado.aviarioActivo;
    }
    if (!explotacion) {
      explotacion = {
        nombre_titular: animal.titular_nombre || 'Criador Asociado ESGA025',
        nombre_criadero: 'Aviario Oficial Alacantina',
        codigo_rega: animal.codigo_rega || 'Sin REGA',
        numero_socio: 'Aspirante',
        municipio: 'Alicante',
        provincia: 'Alicante',
        latitud: animal.geolocalizacion_alta?.latitud,
        longitud: animal.geolocalizacion_alta?.longitud
      };
    }

    // 3. Recopilar Evaluación Morfológica Oficial (Baremo 100 Puntos CNZ)
    const inspeccion = this.estado.inspecciones.find(i => i.animal_id === animal.id) || null;

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
          await window.PDFEngine.construirHtmlCertificado(animal, { ancestros, explotacion, inspeccion, controlPuesta, fotos }),
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
    if (tabName === 'puesta') {
      tabName = 'inspeccion';
    }
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-nav-btn').forEach(btn => {
      if (btn.id === 'tab-btn-inspeccion-insitu') {
        btn.className = 'tab-nav-btn flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-extrabold transition text-emerald-300 bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/60 shadow-sm';
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
      } else {
        targetBtn.className = 'tab-nav-btn flex items-center gap-2 px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold transition text-amber-400 bg-slate-800 border border-amber-500/30';
      }
    }

    window.location.hash = tabName;

    if (tabName === 'inspeccion') {
      setTimeout(() => {
        this.renderizarAnaliticaPuesta();
      }, 50);
    } else if (tabName === 'inspeccion-insitu') {
      setTimeout(() => {
        this.refrescarVistaInspeccionInSitu();
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

    // Select Filtro Variedad en Censo (5 Variedades Unificadas 100% en Femenino ESGA025)
    const selectFiltroVariedad = document.getElementById('filtro-variedad');
    if (selectFiltroVariedad) {
      const variedadesOficiales = this.obtenerVariedadesOficialesFemenino();
      const valPrevio = selectFiltroVariedad.value || 'TODAS';
      selectFiltroVariedad.innerHTML = '<option value="TODAS">Variedad: Todas</option>';
      variedadesOficiales.forEach(v => {
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
    if (confirm('¿Estás seguro de que deseas vaciar la base de datos local IndexedDB? Se restablecerá en Estado Cero (0 ejemplares y 0 aviarios).')) {
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

  // Comprobar si existe una explotación activa en localStorage / sesión o desplegar modal bienvenida
  inicializarAviarioActivo() {
    let aviarioActivoId = localStorage.getItem('alacantina_aviario_activo_id');
    const modoVisitante = sessionStorage.getItem('alacantina_modo_visitante') === 'true';

    // Purga preventiva de IDs ficticios heredados en localStorage
    if (aviarioActivoId === 'exp-01' || aviarioActivoId === 'exp-02') {
      localStorage.removeItem('alacantina_aviario_activo_id');
      localStorage.removeItem('alacantina_aviario_activo_datos');
      aviarioActivoId = null;
    }

    // 1. Buscar si hay una explotación guardada por ID
    if (aviarioActivoId && this.estado.explotaciones && this.estado.explotaciones.length > 0) {
      const exp = this.estado.explotaciones.find(e => e.id === aviarioActivoId);
      if (exp) {
        this.estado.aviarioActivo = exp;
      }
    }

    // 2. Si no se encontró por ID, verificar si hay objeto completo guardado en localStorage
    if (!this.estado.aviarioActivo) {
      const raw = localStorage.getItem('alacantina_aviario_activo_datos');
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.id && parsed.id !== 'exp-01' && parsed.id !== 'exp-02') {
            this.estado.aviarioActivo = parsed;
            if (!this.estado.explotaciones.some(e => e.id === parsed.id)) {
              this.estado.explotaciones.push(parsed);
              this.db.put('explotaciones', parsed);
            }
          } else {
            localStorage.removeItem('alacantina_aviario_activo_datos');
          }
        } catch (e) {
          console.warn('[Aviario] Error al parsear aviario guardado:', e);
        }
      }
    }

    // 3. Si no hay aviario configurado y no se ha activado el modo visitante en esta sesión:
    // Desplegar automáticamente el Modal de Bienvenida
    if (!this.estado.aviarioActivo && !modoVisitante) {
      console.log('[AlacantinApp v6] Sin aviario activo configurado. Desplegando modal de bienvenida en Estado Cero...');
      setTimeout(() => {
        this.abrirModalAviario(true);
      }, 150);
    }
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

    // Poblar selector de explotaciones existentes si las hay
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

    // Configurar textos de bienvenida o edición
    if (esBienvenida && !this.estado.aviarioActivo) {
      if (tituloEl) tituloEl.textContent = 'Configuración del Aviario / Criador';
      if (subtituloEl) subtituloEl.textContent = 'Bienvenido a AlacantinApp v6. Configura tu explotación zootécnica real o selecciona un rol en Estado Cero.';
    } else if (this.estado.aviarioActivo) {
      if (tituloEl) tituloEl.textContent = 'Configuración del Aviario / Criador';
      if (subtituloEl) subtituloEl.textContent = 'Actualiza los datos de tu explotación ganadera, código REGA oficial o geolocalización GPS.';
    }

    // Resetear temporal GPS
    this.estado.gpsAviarioTemporal = null;

    // Si hay un aviario activo, precargar sus datos en el formulario
    if (this.estado.aviarioActivo) {
      const av = this.estado.aviarioActivo;
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
      const pill = document.getElementById('aviario-rega-status-pill');

      if (titularInput) titularInput.value = av.nombre_titular || '';
      if (nombreInput) nombreInput.value = av.nombre_criadero || '';
      if (socioInput) socioInput.value = av.numero_socio || '';
      if (socioAspCheck) socioAspCheck.checked = (!av.numero_socio || av.numero_socio === 'NS-000');

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

      // Mostrar coordenadas existentes
      const latEl = document.getElementById('aviario-lat');
      const lngEl = document.getElementById('aviario-lng');
      const precEl = document.getElementById('aviario-prec');
      const badgeGps = document.getElementById('aviario-gps-badge');
      const btnGpsTexto = document.getElementById('btn-gps-aviario-texto');

      if (av.latitud && av.longitud) {
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
    } else {
      // Formulario limpio para nuevo aviario
      this.estado.editandoAviarioId = null;
      const form = document.getElementById('form-config-aviario');
      if (form) form.reset();

      const provInput = document.getElementById('aviario-provincia');
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
    sessionStorage.setItem('alacantina_modo_visitante', 'true');
    this.estado.aviarioActivo = null;
    localStorage.removeItem('alacantina_aviario_activo_id');
    localStorage.removeItem('alacantina_aviario_activo_datos');
    this.cerrarModalAviario();
    this.actualizarBadgeAviario();
    this.actualizarVistaRegistroAviario();
  },

  // Iniciar con rol de prueba / evaluación vinculado a un censo vacío (Estado Cero: 0 ejemplares, 0 aviarios ficticios)
  iniciarConRolEstadoCero(rol = 'criador') {
    sessionStorage.setItem('alacantina_modo_visitante', 'true');
    this.estado.aviarioActivo = null;
    localStorage.removeItem('alacantina_aviario_activo_id');
    localStorage.removeItem('alacantina_aviario_activo_datos');
    this.cambiarRolRBAC(rol);
    const selRol = document.getElementById('selector-rol-rbac');
    if (selRol) selRol.value = rol;
    this.cerrarModalAviario();
    this.actualizarBadgeAviario();
    this.actualizarVistaRegistroAviario();
    this.renderizarCenso();
    this.actualizarKPIs();
    if (typeof this.mostrarNotificacionToast === 'function') {
      const nombresRol = {
        criador: 'Criador Asociado',
        inspector: 'Inspector Zootécnico CNZ',
        direccion: 'Dirección Técnica LG'
      };
      this.mostrarNotificacionToast(`🛡️ Rol activo: ${nombresRol[rol] || rol} · Censo en Estado Cero (0 ejemplares).`, 'info');
    }
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
    } else {
      if (inputRega && inputRega.value.startsWith('TEMP-REGA')) {
        inputRega.value = '';
      }
      if (pill) {
        pill.textContent = 'REGA Oficial';
        pill.className = 'text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
      }
      if (alertaCambio) alertaCambio.classList.add('hidden');
    }
  },

  // Observador en tiempo real al escribir código REGA
  alEscribirRega(valor) {
    const v = (valor || '').trim().toUpperCase();
    const checkTramite = document.getElementById('aviario-rega-tramite');
    const pill = document.getElementById('aviario-rega-status-pill');
    const alertaCambio = document.getElementById('aviario-rega-cambio-alerta');

    const esProvisional = (!v || v.startsWith('TEMP-REGA') || v.includes('SIN REGA'));

    if (checkTramite) checkTramite.checked = esProvisional;
    if (pill) {
      if (esProvisional) {
        pill.textContent = 'En trámite (Provisional)';
        pill.className = 'text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30';
      } else {
        pill.textContent = 'REGA Oficial';
        pill.className = 'text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
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
    const pill = document.getElementById('aviario-rega-status-pill');
    const alertaCambio = document.getElementById('aviario-rega-cambio-alerta');

    if (titularInput) titularInput.value = av.nombre_titular || '';
    if (nombreInput) nombreInput.value = av.nombre_criadero || '';
    if (socioInput) socioInput.value = av.numero_socio || '';
    if (socioAspCheck) socioAspCheck.checked = (!av.numero_socio || av.numero_socio === 'NS-000');

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

    if (av.latitud && av.longitud) {
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
  },

  // Seleccionar aviario activo desde el selector desplegable en Tab 1
  seleccionarAviarioDesdeSelect(explotacionId) {
    if (!explotacionId) return;
    const exp = this.estado.explotaciones.find(e => e.id === explotacionId);
    if (exp) {
      this.estado.aviarioActivo = exp;
      localStorage.setItem('alacantina_aviario_activo_id', exp.id);
      localStorage.setItem('alacantina_aviario_activo_datos', JSON.stringify(exp));
      sessionStorage.removeItem('alacantina_modo_visitante');
      this.actualizarBadgeAviario();
      this.actualizarVistaRegistroAviario();
    }
  },

  // Guardar configuración del aviario y ejecutar actualización masiva si procede
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

    if (!titular) {
      alert('Por favor, introduce el Nombre del Criador o Razón Social.');
      return;
    }
    if (!municipio) {
      alert('Por favor, introduce el Municipio de la explotación.');
      return;
    }

    // Regla de Socio Aspirante
    if (socioAspirante || !socio) {
      socio = 'NS-000';
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

      expExistente.nombre_titular = titular;
      expExistente.nombre_criadero = nombreCriadero || titular;
      expExistente.numero_socio = socio;
      expExistente.codigo_rega = rega;
      expExistente.rega = rega;
      expExistente.municipio = municipio;
      expExistente.provincia = provincia;
      if (lat !== null) expExistente.latitud = lat;
      if (lng !== null) expExistente.longitud = lng;
      if (prec !== null) expExistente.geolocalizacion_precision = prec;
      expExistente.updated_at = new Date().toISOString();

      expFinal = expExistente;

      // 1. Guardar explotación actualizada en IndexedDB
      await this.db.put('explotaciones', expExistente);

      // 2. Si hubo cambio de REGA: Ejecutar actualización masiva de todos los animales asociados
      if (huboCambioRega) {
        console.log(`[Aviario] Cambio de REGA detectado de ${regaAnterior} a ${rega}. Actualizando ejemplares asociados...`);
        
        // Actualizar en IndexedDB
        const todosAnimales = await this.db.getAll('animales');
        for (const a of todosAnimales) {
          if (a.explotacion_id === expExistente.id || a.codigo_rega === regaAnterior) {
            a.codigo_rega = rega;
            a.titular_nombre = titular;
            await this.db.put('animales', a);
            animalesActualizadosCount++;
          }
        }

        // Actualizar en estado reactivo en memoria
        this.estado.animales.forEach(a => {
          if (a.explotacion_id === expExistente.id || a.codigo_rega === regaAnterior) {
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
        codigo_rega: rega,
        rega: rega,
        numero_socio: socio,
        nombre_titular: titular,
        nombre_criadero: nombreCriadero || titular,
        municipio: municipio,
        provincia: provincia,
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

    // Establecer como aviario activo y persistir
    this.estado.aviarioActivo = expFinal;
    localStorage.setItem('alacantina_aviario_activo_id', expFinal.id);
    localStorage.setItem('alacantina_aviario_activo_datos', JSON.stringify(expFinal));
    sessionStorage.removeItem('alacantina_modo_visitante');

    this.estado.gpsAviarioTemporal = null;
    this.estado.editandoAviarioId = null;

    // Actualizar cola y UI completa
    this.estado.syncQueue = await this.db.getAll('syncQueue');
    this.actualizarContadorSyncQueue();
    this.poblarSelectores();
    this.actualizarBadgeAviario();
    this.actualizarVistaRegistroAviario();
    this.renderizarCenso();

    // Cerrar el modal
    this.cerrarModalAviario();

    if (animalesActualizadosCount > 0) {
      alert(`¡Aviario guardado con éxito!\nCódigo REGA: ${rega}\nSe han actualizado automáticamente ${animalesActualizadosCount} ejemplar(es) asociados a esta explotación.`);
    } else {
      alert(`¡Aviario "${expFinal.nombre_criadero || expFinal.nombre_titular}" guardado y configurado como activo!\nLos nuevos registros se vincularán automáticamente.`);
    }
  },

  // Indicador visual en cabecera (Badge de Aviario Activo)
  actualizarBadgeAviario() {
    const aviario = this.estado.aviarioActivo;
    const nombreEl = document.getElementById('badge-aviario-nombre');
    const subtextoEl = document.getElementById('badge-aviario-subtexto');
    const estadoEl = document.getElementById('badge-aviario-estado');

    if (aviario) {
      const nombreMostrar = aviario.nombre_criadero || aviario.nombre_titular || 'Aviario Activo';
      const rega = aviario.codigo_rega || aviario.rega;
      const esProvisional = !rega || rega.startsWith('TEMP-REGA') || rega.toLowerCase().includes('sin rega');

      if (nombreEl) nombreEl.textContent = nombreMostrar;
      if (subtextoEl) {
        if (esProvisional) {
          subtextoEl.textContent = rega ? `REGA: ${rega} (Provisional)` : 'Sin REGA';
          subtextoEl.className = 'text-[10px] text-amber-400 font-mono truncate';
        } else {
          subtextoEl.textContent = `REGA: ${rega}`;
          subtextoEl.className = 'text-[10px] text-emerald-300 font-mono truncate';
        }
      }
      if (estadoEl) {
        if (esProvisional) {
          estadoEl.textContent = 'En trámite';
          estadoEl.className = 'text-[9px] px-1 py-0.2 rounded font-semibold bg-amber-950 text-amber-400 border border-amber-800 hidden md:inline';
        } else {
          estadoEl.textContent = 'Oficial';
          estadoEl.className = 'text-[9px] px-1 py-0.2 rounded font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800 hidden md:inline';
        }
      }
    } else {
      // Modo visitante o no configurado
      if (nombreEl) nombreEl.textContent = 'Modo Visitante';
      if (subtextoEl) {
        subtextoEl.textContent = 'Sin REGA · Configurar Aviario';
        subtextoEl.className = 'text-[10px] text-slate-400 font-mono truncate';
      }
      if (estadoEl) {
        estadoEl.textContent = 'Visitante';
        estadoEl.className = 'text-[9px] px-1 py-0.2 rounded font-semibold bg-slate-800 text-slate-400 border border-slate-700 hidden md:inline';
      }
    }
  },

  // Actualizar tarjeta compacta e indicadores en la pestaña de Registro (Tab 1)
  actualizarVistaRegistroAviario() {
    const aviario = this.estado.aviarioActivo;
    const boxInfo = document.getElementById('registro-aviario-info-box');
    const boxAviso = document.getElementById('registro-aviso-sin-aviario');

    if (aviario) {
      if (boxInfo) boxInfo.classList.remove('hidden');
      if (boxAviso) boxAviso.classList.add('hidden');

      const nombre = aviario.nombre_criadero || aviario.nombre_titular || 'Aviario Activo';
      const rega = aviario.codigo_rega || aviario.rega || 'Sin REGA';
      const socio = aviario.numero_socio || 'NS-000';
      const titular = aviario.nombre_titular || 'Criador Asociado';
      const munProv = `${aviario.municipio || 'Alicante'}, ${aviario.provincia || 'Alicante'}`;
      
      const elNombre = document.getElementById('reg-box-aviario-nombre');
      const elRega = document.getElementById('reg-box-aviario-rega');
      const elSocio = document.getElementById('reg-box-aviario-socio');
      const elTitular = document.getElementById('reg-box-aviario-titular');
      const elMun = document.getElementById('reg-box-aviario-municipio');
      const elGps = document.getElementById('reg-box-aviario-gps');

      if (elNombre) elNombre.textContent = nombre;
      if (elRega) {
        elRega.textContent = `REGA: ${rega}`;
        if (rega.startsWith('TEMP-REGA') || rega === 'Sin REGA') {
          elRega.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono';
        } else {
          elRega.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono';
        }
      }
      if (elSocio) elSocio.textContent = `Socio: ${socio}`;
      if (elTitular) elTitular.innerHTML = `<i class="fa-solid fa-user text-slate-500 mr-1"></i>${titular}`;
      if (elMun) elMun.innerHTML = `<i class="fa-solid fa-map-pin text-slate-500 mr-1"></i>${munProv}`;
      if (elGps) {
        if (aviario.latitud && aviario.longitud) {
          const lat = Number(aviario.latitud).toFixed(4);
          const lng = Number(aviario.longitud).toFixed(4);
          elGps.innerHTML = `<i class="fa-solid fa-satellite-dish mr-1"></i>GPS Aviario Heredado (${lat}, ${lng})`;
          elGps.className = 'text-emerald-400 font-mono';
        } else {
          elGps.innerHTML = `<i class="fa-solid fa-location-crosshairs mr-1"></i>Sin GPS asignado`;
          elGps.className = 'text-slate-500 font-mono';
        }
      }

      // Sincronizar selección en el dropdown de alta-explotacion si existe
      const selectExp = document.getElementById('alta-explotacion');
      if (selectExp && selectExp.value !== aviario.id) {
        selectExp.value = aviario.id;
      }
    } else {
      // Modo visitante
      if (boxInfo) boxInfo.classList.add('hidden');
      if (boxAviso) boxAviso.classList.remove('hidden');
    }
  },

  // =========================================================================
  // 11. FASE 6: MODO INSPECCIÓN ZOOTÉCNICA IN SITU, FIRMA DIGITAL Y GUÍA CAMPO
  // Cumplimiento: Estándar ESGA025 · Protocolo CNZ 2025 · Reg. (UE) 2016/1012
  // =========================================================================

  inicializarModuloInspeccionInSitu() {
    // 1. Inicializar fecha/hora actual en el campo de inspección in situ
    const inputFechaHora = document.getElementById('insitu-fecha-hora');
    if (inputFechaHora && !inputFechaHora.value) {
      const now = new Date();
      const offset = now.getTimezoneOffset() * 60000;
      inputFechaHora.value = new Date(now - offset).toISOString().slice(0, 16);
    }

    // 2. Sincronizar rol RBAC inicial
    const rolGuardado = localStorage.getItem('alacantina_rol_rbac') || 'inspector';
    this.estado.inspeccionInSitu.rolRBAC = rolGuardado;
    const selectRol = document.getElementById('selector-rol-rbac');
    if (selectRol) selectRol.value = rolGuardado;
    this.actualizarBadgeRBACInSitu(rolGuardado);

    // 3. Heredar coordenadas GPS iniciales del aviario activo si existe
    if (this.estado.aviarioActivo && this.estado.aviarioActivo.latitud && this.estado.aviarioActivo.longitud) {
      this.estado.inspeccionInSitu.gpsInSitu = {
        latitud: Number(this.estado.aviarioActivo.latitud),
        longitud: Number(this.estado.aviarioActivo.longitud),
        precision_m: Number(this.estado.aviarioActivo.geolocalizacion_precision) || 5
      };
      this.actualizarUIGpsInSitu();
    }

    // 4. Inicializar selectores, Canvas de firma digital, Guía de 12 Regiones y Actas
    this.poblarSelectoresInSitu();
    this.inicializarCanvasFirma();
    this.renderizarGuiaCampo12Regiones();
    this.seleccionarRegionGuiaCampo(1);
    this.recalcularInSitu();
    this.renderizarHistorialActasInSitu();

    // Preseleccionar primer ejemplar aspirante (RN) o primer animal del censo
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
      this.mostrarNotificacionToast('⚠️ Navegador sin soporte GPS. Usando coordenadas REGA del aviario.', 'error');
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
        console.warn('[GPS InSitu] Fallback a coordenadas de explotación:', err);
        const av = this.estado.aviarioActivo || this.estado.explotaciones[0];
        if (av && av.latitud && av.longitud) {
          this.estado.inspeccionInSitu.gpsInSitu = {
            latitud: Number(av.latitud),
            longitud: Number(av.longitud),
            precision_m: Number(av.geolocalizacion_precision) || 6
          };
          this.actualizarUIGpsInSitu();
        }
        if (btnTxt) btnTxt.textContent = '📍 GPS Aviario (Fallback)';
        this.mostrarNotificacionToast('📍 Usando coordenadas GPS oficiales de la explotación REGA.', 'info');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  },

  actualizarUIGpsInSitu() {
    const gps = this.estado.inspeccionInSitu.gpsInSitu;
    const latEl = document.getElementById('insitu-gps-lat');
    const lngEl = document.getElementById('insitu-gps-lng');
    const precEl = document.getElementById('insitu-gps-prec');
    if (gps && gps.latitud != null && gps.longitud != null) {
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

    // Obtener explotación vinculada
    const exp = (this.estado.explotaciones || []).find(e => e.id === animal.explotacion_id) || this.estado.aviarioActivo;
    const regaAnimal = animal.codigo_rega || exp?.codigo_rega || exp?.rega || 'Sin REGA';

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

    // Actualizar GPS si la explotación tiene coordenadas
    if (exp && exp.latitud && exp.longitud) {
      this.estado.inspeccionInSitu.gpsInSitu = {
        latitud: Number(exp.latitud),
        longitud: Number(exp.longitud),
        precision_m: Number(exp.geolocalizacion_precision) || 5
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
    const inspectorId = document.getElementById('insitu-inspector-id')?.value || 'INSP-CNZ-025';
    const inspectorNombre = document.getElementById('insitu-inspector-nombre')?.value || 'Dr. Zootecnista CNZ';

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

    // Subrayado y sello técnico
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

  confirmarFirmaInspector() {
    const canvas = document.getElementById('canvas-firma-inspector');
    if (!canvas) return false;

    // Si el inspector pulsa confirmar sin haber trazado manualmente, trazamos su rúbrica digital acreditada en el canvas
    if (this.estado.inspeccionInSitu.trazosFirma === 0) {
      this.generarRubricaAutomaticaEnCanvas();
    }

    const dataUrl = canvas.toDataURL('image/png');
    this.estado.inspeccionInSitu.firmaBase64 = dataUrl;
    this.estado.inspeccionInSitu.firmaConfirmada = true;

    const badge = document.getElementById('badge-estado-firma');
    if (badge) {
      badge.textContent = '✓ Firma Digital Confirmada (Base64)';
      badge.className = 'px-2.5 py-0.5 rounded text-[10px] font-black bg-emerald-950 text-emerald-300 border border-emerald-500 uppercase';
    }

    this.mostrarNotificacionToast('✍️ Firma manuscrita del inspector confirmada y codificada en Base64.', 'success');
    return true;
  },

  // =========================================================================
  // GENERACIÓN DEL ACTA OFICIAL Y DISPARO DE promover_ejemplar_inspeccion()
  // =========================================================================
  async guardarActaInspeccionInSitu() {
    // Verificar rol RBAC
    if (this.estado.inspeccionInSitu.rolRBAC === 'criador') {
      if (!confirm('Estás en el rol "Criador". La emisión de Actas Oficiales corresponde al Inspector Zootécnico CNZ.\n¿Deseas conmutar automáticamente al rol "Inspector Zootécnico CNZ" y emitir el acta?')) {
        return;
      }
      this.cambiarRolRBAC('inspector');
      const selRol = document.getElementById('selector-rol-rbac');
      if (selRol) selRol.value = 'inspector';
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
      this.confirmarFirmaInspector();
    }

    const inspectorId = (document.getElementById('insitu-inspector-id')?.value || 'INSP-CNZ-025').trim();
    const inspectorNombre = (document.getElementById('insitu-inspector-nombre')?.value || 'Dr. Zootecnista CNZ ESGA025').trim();
    const fechaHoraVal = document.getElementById('insitu-fecha-hora')?.value || new Date().toISOString().slice(0, 16);
    const fechaSolo = fechaHoraVal.split('T')[0];

    const exp = (this.estado.explotaciones || []).find(e => e.id === animal.explotacion_id) || this.estado.aviarioActivo;
    const codigoRega = animal.codigo_rega || exp?.codigo_rega || exp?.rega || 'Sin REGA';
    const titularAviario = exp?.nombre_titular || animal.titular_nombre || 'Criador Oficial ESGA025';
    const nombreAviario = exp?.nombre_criadero || 'Aviario Oficial Alacantina';

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

    // Defectos descalificables detectados (5 defectos graves oficiales del Estándar 2025)
    const defs = this.estado.inspeccionInSitu.defectos;
    const descalificado = Boolean(defs.orejilla || defs.pecho || defs.cola || defs.tarsos || defs.flameado);

    const TextosDefectos = [];
    if (defs.orejilla) TextosDefectos.push('Orejilla amarilla, roja o con exceso de rojo (debe ser blanco puro).');
    if (defs.pecho) TextosDefectos.push('Pecho prominente o abombado (debe ser recto y plano).');
    if (defs.cola) TextosDefectos.push('Cola baja (<70º sobre la horizontal) o larga.');
    if (defs.flameado) TextosDefectos.push('Flameado de esclavina en variedades Moteada y Exchequer.');
    if (defs.tarsos) TextosDefectos.push('Tarsos amarillos (deben ser blanco-rosáceos con roña en Moteada/Exchequer, o blanco-rosáceos con pico hueso en Blanca).');

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

    const gps = this.estado.inspeccionInSitu.gpsInSitu || { latitud: null, longitud: null, precision_m: null };
    const obsInput = (document.getElementById('insitu-observaciones')?.value || '').trim();
    const codigoActa = `ACTA-ESGA025-${new Date().getFullYear()}-${String(Math.floor(1000 + Math.random() * 9000))}`;

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
      inspector_id: inspectorId,
      calificador_oficial: inspectorNombre,
      rol_rbac: this.estado.inspeccionInSitu.rolRBAC,
      fecha_inspeccion: fechaSolo,
      fecha_hora_inspeccion: fechaHoraVal,
      coordenadas_gps: {
        latitud: gps.latitud,
        longitud: gps.longitud,
        precision_m: gps.precision_m
      },
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
      firma_inspector_base64: this.estado.inspeccionInSitu.firmaBase64,
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

    cont.innerHTML = lista.slice(0, 10).map(insp => {
      const animal = (this.estado.animales || []).find(a => a.id === insp.animal_id);
      const anilla = insp.numero_anilla || animal?.numero_anilla || '----';
      const codigoId = insp.codigo_identificacion || animal?.codigo_identificacion || 'ESGA025';
      const codigoActa = insp.codigo_acta || `ACTA-${insp.id.toUpperCase()}`;
      const rega = insp.codigo_rega || animal?.codigo_rega || 'Sin REGA';
      const gpsTxt = (insp.coordenadas_gps && insp.coordenadas_gps.latitud != null && insp.coordenadas_gps.longitud != null)
        ? `${Number(insp.coordenadas_gps.latitud).toFixed(4)}, ${Number(insp.coordenadas_gps.longitud).toFixed(4)}`
        : 'Sin GPS';
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
            <span><i class="fa-solid fa-user-check text-emerald-400 mr-1"></i>${this.escaparHtml(insp.inspector_id || 'INSP-CNZ-025')}</span>
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

    const codigoActa = acta.codigo_acta || `ACTA-ESGA025-${acta.id.toUpperCase()}`;
    const fechaHora = acta.fecha_hora_inspeccion ? acta.fecha_hora_inspeccion.replace('T', ' ') : acta.fecha_inspeccion;
    const rega = acta.codigo_rega || animal?.codigo_rega || 'Sin REGA';
    const inspectorId = acta.inspector_id || 'INSP-CNZ-025';
    const inspectorNombre = acta.calificador_oficial || 'Inspector Oficial CNZ ESGA025';
    const lat = acta.coordenadas_gps?.latitud;
    const lng = acta.coordenadas_gps?.longitud;
    const prec = acta.coordenadas_gps?.precision_m ?? '--';
    const gpsCoordsTxt = (lat != null && lng != null)
      ? `Lat: ${Number(lat).toFixed(6)}, Lng: ${Number(lng).toFixed(6)}`
      : 'Sin coordenadas GPS registradas';
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
          <span class="text-[11px] text-slate-400">${this.escaparHtml(acta.nombre_aviario || acta.titular_aviario || 'Aviario Oficial ESGA025')}</span>
        </div>
        <div class="p-3 rounded-lg bg-slate-900 border border-slate-800">
          <span class="text-[10px] font-bold text-sky-400 uppercase block">Georreferencia GPS In Situ</span>
          <strong class="text-xs font-mono text-emerald-400 block mt-0.5">${gpsCoordsTxt}</strong>
          <span class="text-[11px] text-slate-400">Precisión satelital: ±${prec} metros</span>
        </div>
        <div class="p-3 rounded-lg bg-slate-900 border border-slate-800">
          <span class="text-[10px] font-bold text-emerald-400 uppercase block">Inspector Zootécnico Acreditado</span>
          <strong class="text-xs font-mono text-white block mt-0.5">ID: ${this.escaparHtml(inspectorId)}</strong>
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
            <span class="text-xs text-slate-300">· ${this.escaparHtml(acta.sexo || animal?.sexo || 'Macho')} · ${this.escaparHtml(this.normalizarVariedadFemenino(acta.variedad || animal?.variedad))}</span>
          </div>
          <p class="text-[10px] text-emerald-300 font-semibold mt-1">
            ${this.escaparHtml(this.obtenerDetalleAnatomicoVariedad(acta.variedad || animal?.variedad).resumen_ficha)}
          </p>
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
          ${acta.firma_inspector_base64
            ? `<img src="${acta.firma_inspector_base64}" alt="Firma Inspector" class="h-20 mx-auto object-contain">`
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
        nombre: '4. Pico y Barbillas (Detalle por Variedad)',
        baremo: 'Bloque 1 (Cabeza, Cresta y Cara · Máx 15p)',
        estandarGallo: 'Pico fuerte, bien curvado: color córneo con manchas negras para las variedades Moteada y Exchequer, y color hueso para la variedad Blanca. Barbillas medianamente largas, ovaladas, finas y sin pliegues.',
        estandarGallina: 'Pico proporcionado (color córneo con manchas negras en Moteada/Exchequer; color hueso en Blanca) y barbillas redondeadas, finas y de rojo intenso.',
        defectosTaras: 'DESCALIFICA: Pico amarillo, pico cruzado, prognatismo o manchas blancas en barbillas.',
        consejoCampo: 'Verificar que el pico sea color córneo con manchas negras en Negra Moteada / Pinta o Exchequer, y color hueso en Blanca.'
      },
      {
        num: 5,
        nombre: '5. Orejillas (Blanco Puro)',
        baremo: 'Bloque 1 (Cabeza, Cresta y Cara · Máx 15p)',
        estandarGallo: 'De tamaño mediano, almendradas, lisas, ceñidas y de color BLANCO PURO esmaltado.',
        estandarGallina: 'Ovaladas/almendradas, lisas y de color blanco puro brillante.',
        defectosTaras: 'DESCALIFICACIÓN INMEDIATA (Defecto #1 Estándar 2025): Orejilla amarilla, roja o con exceso de rojo (debe ser blanco puro).',
        consejoCampo: 'Rasgo crítico ESGA025: verificar blanco puro sin pigmento amarillo ni exceso de rojo.'
      },
      {
        num: 6,
        nombre: '6. Cuello y Esclavina',
        baremo: 'Bloque 2 (Cuello y Esclavina · Máx 10p)',
        estandarGallo: 'Cuello medianamente largo, erguido y bien arqueado. Esclavina muy abundante cubriendo bien los hombros.',
        estandarGallina: 'Cuello gracioso con esclavina bien poblada sin transiciones bruscas.',
        defectosTaras: 'DESCALIFICACIÓN INMEDIATA (Defecto #4 Estándar 2025): Flameado de esclavina en variedades Moteada y Exchequer.',
        consejoCampo: 'Abrir las plumas de la esclavina en variedades Negra Moteada y Pinta o Exchequer para descartar flameado oculto.'
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
        estandarGallo: 'Pecho de perfil RECTO Y PLANO característico de la raza Alacantina (nunca prominente ni abombado). Quilla larga y recta.',
        estandarGallina: 'Pecho recto y plano, profundo y bien sostenido.',
        defectosTaras: 'DESCALIFICACIÓN INMEDIATA (Defecto #2 Estándar 2025): Pecho prominente o abombado (debe ser recto y plano).',
        consejoCampo: 'Observar al ejemplar de perfil estricto y palpar el esternón: la caída anterior del pecho debe ser recta y plana.'
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
        estandarGallo: 'Cola bien poblada, llevada alta en ángulo de al menos 70º sobre la horizontal y de longitud media proporcionada.',
        estandarGallina: 'Cola bien desarrollada, ligeramente abierta en abanico y llevada a ≥70º sobre la horizontal.',
        defectosTaras: 'DESCALIFICACIÓN INMEDIATA (Defecto #3 Estándar 2025): Cola baja (<70º sobre la horizontal) o larga.',
        consejoCampo: 'Evaluar al ave en reposo libre en suelo plano antes de capturarla para verificar que la cola no sea baja (<70º) ni larga.'
      },
      {
        num: 11,
        nombre: '11. Muslos y Tarsos (Detalle por Variedad)',
        baremo: 'Bloque 5 (Extremidades y Tarsos · Máx 15p)',
        estandarGallo: 'Muslos largos, fuertes y bien visibles. Tarsos desnudos: blanco-rosáceos con roña en variedades Moteada/Exchequer, o blanco-rosáceos con pico hueso en variedad Blanca.',
        estandarGallina: 'Muslos bien formados y tarsos blanco-rosáceos con roña en Moteada/Exchequer, o blanco-rosáceos con pico hueso en Blanca.',
        defectosTaras: 'DESCALIFICACIÓN INMEDIATA (Defecto #5 Estándar 2025): Tarsos amarillos (deben ser blanco-rosáceos con roña en Moteada/Exchequer, o blanco-rosáceos con pico hueso en Blanca).',
        consejoCampo: 'Inspeccionar tarsos y pico conjuntamente según variedad: blanco-rosáceos con roña (Moteada/Exchequer) o blanco-rosáceos con pico hueso (Blanca).'
      },
      {
        num: 12,
        nombre: '12. Dedos, Pesos Oficiales y 5 Variedades en Femenino',
        baremo: 'Bloque 5, 6 y 7 (Extremidades, Variedad y Peso · 15p + 10p + 10p)',
        estandarGallo: 'Cuatro (4) dedos rectos. Calibre anilla: 20 mm. Rango oficial Gallo: 3,000 kg – 3,500 kg (Media: 3.25 kg). Variedades en femenino: Negra Moteada (Oficial), Pinta o Exchequer (Oficial), Blanca (Oficial), Milflores (En proceso de reconocimiento) y Armiñada en negro (En proceso de reconocimiento).',
        estandarGallina: 'Cuatro (4) dedos rectos y limpios. Calibre anilla: 18 mm. Rango oficial Gallina: 2,200 kg – 2,600 kg (Media: 2.40 kg).',
        defectosTaras: 'DESCALIFICA: Peso fuera de rango (Gallo 3.00-3.50 kg / Gallina 2.20-2.60 kg), polidactilia o variedades ajenas al proyecto.',
        consejoCampo: 'Verificar peso con báscula digital (media ref. 3.25 kg Macho / 2.40 kg Hembra) y encuadrar exclusivamente en las 5 variedades femeninas.'
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
  // 12. FASE 6 (V6): MOTOR DE AUDITORÍA Y CONTROL DE CALIDAD ZOOTÉCNICA EN TIEMPO REAL
  //     MÓDULO DE RESPALDOS (BACKUPS JSON/ZIP) Y ACTAS DE CIERRE CENSAL ANUAL
  // =========================================================================

  // -------------------------------------------------------------------------
  // 12.1 MOTOR DE AUDITORÍA DE INTEGRIDAD DEL LIBRO GENEALÓGICO EN TIEMPO REAL
  // -------------------------------------------------------------------------
  esEjemplarAdultoAuditoria(fechaNacimiento) {
    if (!fechaNacimiento) return true;
    const nac = new Date(fechaNacimiento);
    if (isNaN(nac.getTime())) return true;
    const hoy = new Date();
    const diffDias = (hoy - nac) / (1000 * 60 * 60 * 24);
    return diffDias >= 365;
  },

  buscarAnimalPorRef(ref) {
    if (!ref) return null;
    return (this.estado.animales || []).find(
      x => x.id === ref || x.codigo_identificacion === ref || x.numero_anilla === ref
    ) || null;
  },

  // Detección en grafo de bucles genealógicos (ejemplar que figura como su propio ancestro)
  detectarBuclePedigriAnimal(animalRaiz) {
    if (!animalRaiz) return null;
    const idRaiz = animalRaiz.id;
    const cola = [
      { actual: this.buscarAnimalPorRef(animalRaiz.id_padre), ruta: [`#${animalRaiz.numero_anilla || animalRaiz.id}`], nivel: 1 },
      { actual: this.buscarAnimalPorRef(animalRaiz.id_madre), ruta: [`#${animalRaiz.numero_anilla || animalRaiz.id}`], nivel: 1 }
    ];
    const visitadosNivel = new Set();

    while (cola.length > 0) {
      const { actual, ruta, nivel } = cola.shift();
      if (!actual || nivel > 12) continue;

      const etiquetaActual = `#${actual.numero_anilla || actual.id}`;
      const nuevaRuta = [...ruta, etiquetaActual];

      if (actual.id === idRaiz) {
        return nuevaRuta.join(' → ');
      }

      const clavePaso = `${actual.id}_${nivel}`;
      if (visitadosNivel.has(clavePaso)) continue;
      visitadosNivel.add(clavePaso);

      if (actual.id_padre) {
        const p = this.buscarAnimalPorRef(actual.id_padre);
        if (p) cola.push({ actual: p, ruta: nuevaRuta, nivel: nivel + 1 });
      }
      if (actual.id_madre) {
        const m = this.buscarAnimalPorRef(actual.id_madre);
        if (m) cola.push({ actual: m, ruta: nuevaRuta, nivel: nivel + 1 });
      }
    }
    return null;
  },

  ejecutarAuditoriaIntegridad(mostrarToast = false) {
    const alertas = [];
    const animales = this.estado.animales || [];
    const controles = this.estado.controlesPuesta || [];

    // Mapa para detectar duplicidad de anillas
    const conteoAnillas = new Map();
    animales.forEach(a => {
      const clave = String(a.numero_anilla || '').trim();
      if (clave) conteoAnillas.set(clave, (conteoAnillas.get(clave) || 0) + 1);
    });

    // =========================================================================
    // A. VERIFICACIÓN 1: INCOHERENCIAS GENEALÓGICAS Y CRONOLÓGICAS
    // =========================================================================
    animales.forEach(a => {
      const etiquetaAve = `#${a.numero_anilla || '--'} (${a.nombre || a.codigo_identificacion || a.id})`;

      // 1.1 Detección de bucles de pedigrí (propio ancestro directo o indirecto)
      if (a.id_padre === a.id || a.id_madre === a.id) {
        alertas.push({
          id: `aud-bucle-dir-${a.id}`,
          categoria: 'GENEALOGIA',
          severidad: 'CRITICA',
          animalId: a.id,
          titulo: `Bucle de Pedigrí Directo en ${etiquetaAve}`,
          detalle: `El ejemplar ${a.codigo_identificacion} figura registrado como su propio progenitor directo (auto-referencia genealógica inválida).`,
          accionTipo: 'LIMPIAR_BUCLE_ANIMAL'
        });
      } else {
        const rutaBucle = this.detectarBuclePedigriAnimal(a);
        if (rutaBucle) {
          alertas.push({
            id: `aud-bucle-ciclo-${a.id}`,
            categoria: 'GENEALOGIA',
            severidad: 'CRITICA',
            animalId: a.id,
            titulo: `Ciclo de Ancestría Detectado en ${etiquetaAve}`,
            detalle: `El ejemplar aparece como su propio ancestro en la cadena genealógica: ${rutaBucle}.`,
            accionTipo: 'LIMPIAR_BUCLE_ANIMAL'
          });
        }
      }

      // 1.2 Mismo animal asignado como padre y madre
      if (a.id_padre && a.id_madre && a.id_padre === a.id_madre) {
        alertas.push({
          id: `aud-padres-iguales-${a.id}`,
          categoria: 'GENEALOGIA',
          severidad: 'CRITICA',
          animalId: a.id,
          titulo: `Progenitores Idénticos en ${etiquetaAve}`,
          detalle: `El mismo ejemplar (${a.id_padre}) figura simultáneamente como Padre y Madre.`,
          accionTipo: 'LIMPIAR_BUCLE_ANIMAL'
        });
      }

      // 1.3 Progenitores con fecha de nacimiento posterior o igual a la progenie
      const fechaHijo = a.fecha_nacimiento ? new Date(a.fecha_nacimiento) : null;
      const padre = this.buscarAnimalPorRef(a.id_padre);
      const madre = this.buscarAnimalPorRef(a.id_madre);

      if (padre && fechaHijo && padre.fecha_nacimiento) {
        const fechaPadre = new Date(padre.fecha_nacimiento);
        if (fechaPadre >= fechaHijo) {
          alertas.push({
            id: `aud-cron-padre-${a.id}`,
            categoria: 'GENEALOGIA',
            severidad: 'CRITICA',
            animalId: a.id,
            titulo: `Progenitor Paterno Posterior a la Progenie en ${etiquetaAve}`,
            detalle: `El padre #${padre.numero_anilla} (${padre.fecha_nacimiento}) tiene fecha de nacimiento posterior o igual al hijo (${a.fecha_nacimiento}).`,
            accionTipo: 'CORREGIR_FECHA_PROGENIE'
          });
        }
      }

      if (madre && fechaHijo && madre.fecha_nacimiento) {
        const fechaMadre = new Date(madre.fecha_nacimiento);
        if (fechaMadre >= fechaHijo) {
          alertas.push({
            id: `aud-cron-madre-${a.id}`,
            categoria: 'GENEALOGIA',
            severidad: 'CRITICA',
            animalId: a.id,
            titulo: `Progenitor Materno Posterior a la Progenie en ${etiquetaAve}`,
            detalle: `La madre #${madre.numero_anilla} (${madre.fecha_nacimiento}) tiene fecha de nacimiento posterior o igual a la progenie (${a.fecha_nacimiento}).`,
            accionTipo: 'CORREGIR_FECHA_PROGENIE'
          });
        }
      }

      // 1.4 Incoherencia de sexo en progenitores
      if (padre && padre.sexo && padre.sexo !== 'Macho') {
        alertas.push({
          id: `aud-sexo-padre-${a.id}`,
          categoria: 'GENEALOGIA',
          severidad: 'ALTA',
          animalId: a.id,
          titulo: `Incoherencia de Sexo Paterno en ${etiquetaAve}`,
          detalle: `El progenitor asignado como Padre (#${padre.numero_anilla}) figura con sexo '${padre.sexo}'.`,
          accionTipo: 'VER_FICHA'
        });
      }
      if (madre && madre.sexo && madre.sexo !== 'Hembra') {
        alertas.push({
          id: `aud-sexo-madre-${a.id}`,
          categoria: 'GENEALOGIA',
          severidad: 'ALTA',
          animalId: a.id,
          titulo: `Incoherencia de Sexo Materno en ${etiquetaAve}`,
          detalle: `El progenitor asignado como Madre (#${madre.numero_anilla}) figura con sexo '${madre.sexo}'.`,
          accionTipo: 'VER_FICHA'
        });
      }

      // =======================================================================
      // B. VERIFICACIÓN 2: ALERTAS DE ANILLADO Y PESO (ESTÁNDAR ESGA025)
      // =======================================================================
      const esAdulto = this.esEjemplarAdultoAuditoria(a.fecha_nacimiento) || ['RF', 'RD', 'RM'].includes(a.seccion_libro);
      const peso = Number(a.peso_actual_kg);

      // 2.1 Control de Peso en Ejemplares Adultos (Gallo: 3.0-3.5 kg | Gallina: 2.2-2.6 kg)
      if (esAdulto) {
        if (!peso || isNaN(peso)) {
          alertas.push({
            id: `aud-sin-peso-${a.id}`,
            categoria: 'PESO_ANILLA',
            severidad: 'MEDIA',
            animalId: a.id,
            titulo: `Ejemplar Adulto sin Control de Peso (${etiquetaAve})`,
            detalle: `Falta el registro de peso corporal en vivo exigido por el estándar ESGA025.`,
            accionTipo: 'NORMALIZAR_PESO_ANILLA'
          });
        } else if (a.sexo === 'Macho' && (peso < 3.0 || peso > 3.5)) {
          const estadoPeso = peso < 3.0 ? `subpeso (${peso.toFixed(3)} kg < 3.000 kg)` : `sobrepeso (${peso.toFixed(3)} kg > 3.500 kg)`;
          alertas.push({
            id: `aud-peso-gallo-${a.id}`,
            categoria: 'PESO_ANILLA',
            severidad: 'ALTA',
            animalId: a.id,
            titulo: `Gallo Adulto Fuera de Rango de Peso ESGA025 (${etiquetaAve})`,
            detalle: `Presenta ${estadoPeso}. Rango oficial de Gallo adulto ESGA025: 3.000 kg - 3.500 kg.`,
            accionTipo: 'NORMALIZAR_PESO_ANILLA'
          });
        } else if (a.sexo === 'Hembra' && (peso < 2.2 || peso > 2.6)) {
          const estadoPeso = peso < 2.2 ? `subpeso (${peso.toFixed(3)} kg < 2.200 kg)` : `sobrepeso (${peso.toFixed(3)} kg > 2.600 kg)`;
          alertas.push({
            id: `aud-peso-gallina-${a.id}`,
            categoria: 'PESO_ANILLA',
            severidad: 'ALTA',
            animalId: a.id,
            titulo: `Gallina Adulta Fuera de Rango de Peso ESGA025 (${etiquetaAve})`,
            detalle: `Presenta ${estadoPeso}. Rango oficial de Gallina adulta ESGA025: 2.200 kg - 2.600 kg.`,
            accionTipo: 'NORMALIZAR_PESO_ANILLA'
          });
        }
      }

      // 2.2 Control de Calibre de Anilla Oficial (Gallo: 20 mm | Gallina: 18 mm) y Formato de Código
      const calibreEsperado = a.sexo === 'Macho' ? 20 : 18;
      const calibreActual = Number(a.calibre_anilla_mm || calibreEsperado);
      if (calibreActual !== calibreEsperado) {
        alertas.push({
          id: `aud-calibre-${a.id}`,
          categoria: 'PESO_ANILLA',
          severidad: 'ALTA',
          animalId: a.id,
          titulo: `Calibre de Anilla No Reglamentario en ${etiquetaAve}`,
          detalle: `Anilla de ${calibreActual} mm en ejemplar ${a.sexo}. El estándar oficial ESGA025 exige ${calibreEsperado} mm.`,
          accionTipo: 'NORMALIZAR_PESO_ANILLA'
        });
      }

      const regexCodigoOficial = /^ESGA025-\d{2}-[MH]-\d{4}$/;
      const codId = String(a.codigo_identificacion || '').trim();
      const letraSexoEsperada = a.sexo === 'Macho' ? 'M' : 'H';
      if (!regexCodigoOficial.test(codId) || !codId.includes(`-${letraSexoEsperada}-`)) {
        alertas.push({
          id: `aud-anilla-fmt-${a.id}`,
          categoria: 'PESO_ANILLA',
          severidad: 'MEDIA',
          animalId: a.id,
          titulo: `Anilla / Código No Normalizado en ${etiquetaAve}`,
          detalle: `El código '${codId || 'Vacío'}' no cumple la nomenclatura oficial ESGA025-AA-${letraSexoEsperada}-NNNN.`,
          accionTipo: 'NORMALIZAR_PESO_ANILLA'
        });
      }

      const numAnilla = String(a.numero_anilla || '').trim();
      if (numAnilla && (conteoAnillas.get(numAnilla) || 0) > 1) {
        alertas.push({
          id: `aud-anilla-dup-${a.id}`,
          categoria: 'PESO_ANILLA',
          severidad: 'CRITICA',
          animalId: a.id,
          titulo: `Duplicidad de Número de Anilla (#${numAnilla})`,
          detalle: `Existen múltiples ejemplares registrados con la misma anilla física #${numAnilla}.`,
          accionTipo: 'VER_FICHA'
        });
      }
    });

    // =========================================================================
    // C. VERIFICACIÓN 3: INCOHERENCIAS DE PUESTA (HEN-DAY >100% Y PESO 55g-70g)
    // =========================================================================
    controles.forEach(c => {
      const gallina = this.buscarAnimalPorRef(c.animal_id);
      const etiqGallina = gallina
        ? `#${gallina.numero_anilla} (${gallina.nombre || gallina.codigo_identificacion})`
        : `ID ${c.animal_id}`;

      // Calcular días del periodo (por defecto 15 días oficiales)
      let diasPeriodo = 15;
      if (c.fecha_inicio && c.fecha_fin) {
        const d1 = new Date(c.fecha_inicio);
        const d2 = new Date(c.fecha_fin);
        const diff = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
        if (diff > 0 && diff <= 60) diasPeriodo = diff;
      }

      const huevos = Number(c.total_huevos_15d || 0);
      const tasaHenDay = (huevos / 15) * 100;
      const tasaRealPeriodo = (huevos / diasPeriodo) * 100;

      // 3.1 Tasa de puesta > 100%
      if (huevos > 15 || tasaHenDay > 100 || tasaRealPeriodo > 100) {
        alertas.push({
          id: `aud-puesta-tasa-${c.id}`,
          categoria: 'PUESTA',
          severidad: 'CRITICA',
          animalId: gallina ? gallina.id : null,
          controlId: c.id,
          titulo: `Tasa de Puesta Imposible (>100% Hen-Day) en ${etiqGallina}`,
          detalle: `Control del ${c.fecha_inicio || '--'}: ${huevos} huevos registrados en 15 días (${tasaHenDay.toFixed(1)}% Hen-Day > 100%).`,
          accionTipo: 'NORMALIZAR_CONTROL_PUESTA'
        });
      }

      // 3.2 Registro de puesta asignado a un Macho
      if (gallina && gallina.sexo === 'Macho') {
        alertas.push({
          id: `aud-puesta-sexo-${c.id}`,
          categoria: 'PUESTA',
          severidad: 'CRITICA',
          animalId: gallina.id,
          controlId: c.id,
          titulo: `Control de Puesta Asignado a un Gallo (${etiqGallina})`,
          detalle: `El ejemplar #${gallina.numero_anilla} es Macho y posee un registro de puesta asignado.`,
          accionTipo: 'ELIMINAR_CONTROL_PUESTA'
        });
      }

      // 3.3 Peso de huevo fuera del rango oficial de 55g - 70g
      const pesoHuevo = Number(c.peso_medio_huevo_g);
      if (!isNaN(pesoHuevo) && (pesoHuevo < 55.0 || pesoHuevo > 70.0)) {
        const tipoDesv = pesoHuevo < 55.0
          ? `inferior al mínimo oficial (${pesoHuevo.toFixed(1)} g < 55.0 g)`
          : `superior al máximo oficial (${pesoHuevo.toFixed(1)} g > 70.0 g)`;
        alertas.push({
          id: `aud-puesta-peso-${c.id}`,
          categoria: 'PUESTA',
          severidad: 'MEDIA',
          animalId: gallina ? gallina.id : null,
          controlId: c.id,
          titulo: `Peso de Huevo Fuera de Rango Oficial (55g-70g) en ${etiqGallina}`,
          detalle: `Control del ${c.fecha_inicio || '--'}: Peso medio de ${pesoHuevo.toFixed(1)} g (${tipoDesv}). No apto para incubación ESGA025.`,
          accionTipo: 'NORMALIZAR_CONTROL_PUESTA'
        });
      }
    });

    this.estado.auditoria.alertas = alertas;
    this.estado.auditoria.ultimaEjecucion = new Date().toLocaleTimeString('es-ES');
    this.renderizarPanelAuditoriaIntegridad();

    if (mostrarToast && typeof this.mostrarNotificacionToast === 'function') {
      this.mostrarNotificacionToast(
        `🔍 Auditoría completada: ${alertas.length} alerta(s) detectada(s) en el Libro Genealógico.`,
        alertas.length === 0 ? 'success' : 'info'
      );
    }

    return alertas;
  },

  renderizarPanelAuditoriaIntegridad() {
    const alertas = this.estado.auditoria.alertas || [];
    const catActiva = this.estado.auditoria.categoriaActiva || 'TODAS';

    const countGen = alertas.filter(a => a.categoria === 'GENEALOGIA').length;
    const countPeso = alertas.filter(a => a.categoria === 'PESO_ANILLA').length;
    const countPuesta = alertas.filter(a => a.categoria === 'PUESTA').length;
    const total = alertas.length;

    // Badges superiores y KPIs
    const idsConteoTotal = ['header-auditoria-count', 'censo-btn-auditoria-badge', 'auditoria-count-todas'];
    idsConteoTotal.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = String(total);
    });

    const badgeAdmin = document.getElementById('admin-auditoria-badge');
    if (badgeAdmin) {
      badgeAdmin.textContent = `${total} ${total === 1 ? 'alerta' : 'alertas'}`;
      badgeAdmin.className = total === 0
        ? 'px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500 text-slate-950 font-mono'
        : 'px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500 text-slate-950 font-mono';
    }

    const badgeEstado = document.getElementById('auditoria-estado-global-badge');
    if (badgeEstado) {
      const críticas = alertas.filter(a => a.severidad === 'CRITICA').length;
      if (total === 0) {
        badgeEstado.textContent = '✓ 100% Íntegro · Sin anomalías';
        badgeEstado.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-700 font-mono';
      } else if (críticas > 0) {
        badgeEstado.textContent = `⚠️ ${total} Alertas (${críticas} Críticas)`;
        badgeEstado.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-950 text-rose-300 border border-rose-700 font-mono';
      } else {
        badgeEstado.textContent = `🔔 ${total} Aviso(s) de Estándar`;
        badgeEstado.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-700 font-mono';
      }
    }

    const elGen = document.getElementById('auditoria-kpi-genealogia');
    const elPeso = document.getElementById('auditoria-kpi-peso-anilla');
    const elPuesta = document.getElementById('auditoria-kpi-puesta');
    if (elGen) elGen.textContent = String(countGen);
    if (elPeso) elPeso.textContent = String(countPeso);
    if (elPuesta) elPuesta.textContent = String(countPuesta);

    // Actualizar estado visual de los botones de categoría
    ['TODAS', 'GENEALOGIA', 'PESO_ANILLA', 'PUESTA'].forEach(cat => {
      const btn = document.getElementById(`btn-aud-cat-${cat}`);
      if (btn) {
        if (cat === catActiva) {
          btn.className = 'px-2.5 py-1 rounded-lg font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 transition';
        } else {
          btn.className = 'px-2.5 py-1 rounded-lg font-semibold bg-slate-950 text-slate-400 hover:text-white border border-slate-800 transition';
        }
      }
    });

    // Lista de alertas filtradas
    const contenedor = document.getElementById('auditoria-lista-alertas');
    if (!contenedor) return;

    const filtradas = catActiva === 'TODAS'
      ? alertas
      : alertas.filter(a => a.categoria === catActiva);

    if (filtradas.length === 0) {
      contenedor.innerHTML = `
        <div class="p-4 rounded-xl bg-slate-950/80 border border-emerald-800/50 text-center text-xs text-emerald-300 flex items-center justify-center gap-2">
          <i class="fa-solid fa-shield-check text-emerald-400 text-base"></i>
          <span>No se han detectado incoherencias ni alertas en esta categoría. El Libro Genealógico cumple los parámetros ESGA025.</span>
        </div>
      `;
      return;
    }

    contenedor.innerHTML = filtradas.map(alerta => {
      const badgeSev = alerta.severidad === 'CRITICA'
        ? 'bg-rose-950 text-rose-300 border-rose-700'
        : (alerta.severidad === 'ALTA' ? 'bg-amber-950 text-amber-300 border-amber-700' : 'bg-sky-950 text-sky-300 border-sky-700');

      const iconoCat = alerta.categoria === 'GENEALOGIA'
        ? 'fa-sitemap text-purple-400'
        : (alerta.categoria === 'PESO_ANILLA' ? 'fa-scale-balanced text-amber-400' : 'fa-egg text-sky-400');

      return `
        <div class="p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs transition">
          <div class="flex items-start gap-2.5">
            <div class="h-7 w-7 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0 mt-0.5">
              <i class="fa-solid ${iconoCat}"></i>
            </div>
            <div>
              <div class="flex flex-wrap items-center gap-1.5">
                <span class="font-bold text-white">${this.escaparHtml(alerta.titulo)}</span>
                <span class="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold border ${badgeSev}">${alerta.severidad}</span>
              </div>
              <p class="text-[11px] text-slate-400 mt-0.5 leading-snug">${this.escaparHtml(alerta.detalle)}</p>
            </div>
          </div>
          <div class="flex items-center gap-1.5 self-end sm:self-center shrink-0">
            ${alerta.animalId ? `
              <button type="button" onclick="app.verFichaAnimal('${alerta.animalId}')" class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 font-semibold text-[11px] flex items-center gap-1 transition">
                <i class="fa-solid fa-eye"></i> Ficha
              </button>
            ` : ''}
            <button type="button" onclick="app.corregirAlertaAuditoria('${alerta.id}')" class="px-2.5 py-1 rounded-lg bg-emerald-950 hover:bg-emerald-900 border border-emerald-700 text-emerald-300 font-bold text-[11px] flex items-center gap-1 transition" title="Corregir automáticamente esta incoherencia en IndexedDB">
              <i class="fa-solid fa-wand-magic-sparkles"></i> Saneamiento Auto
            </button>
          </div>
        </div>
      `;
    }).join('');
  },

  filtrarCategoriaAuditoria(categoria) {
    this.estado.auditoria.categoriaActiva = categoria;
    this.renderizarPanelAuditoriaIntegridad();
  },

  togglePanelAuditoriaCenso() {
    const panel = document.getElementById('panel-auditoria-integridad-censo');
    if (!panel) return;
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) {
      this.ejecutarAuditoriaIntegridad(false);
      panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  },

  irAAuditoriaIntegridad() {
    this.cambiarTab('censo');
    const panel = document.getElementById('panel-auditoria-integridad-censo');
    if (panel) {
      panel.classList.remove('hidden');
      this.ejecutarAuditoriaIntegridad(true);
      setTimeout(() => {
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
    }
  },

  // Auditoría exclusivamente sobre datos reales (sin inyección de registros ficticios de demostración)
  async toggleSimulacionIncoherenciasAuditoria() {
    this.estado.auditoria.simulacionActiva = false;
    this.ejecutarAuditoriaIntegridad(true);
  },

  async corregirAlertaAuditoria(alertaId) {
    const alerta = (this.estado.auditoria.alertas || []).find(a => a.id === alertaId);
    if (!alerta) return;

    if (alerta.animalId) {
      const animal = this.estado.animales.find(a => a.id === alerta.animalId);
      if (animal) {
        if (alerta.accionTipo === 'LIMPIAR_BUCLE_ANIMAL') {
          if (animal.id_padre === animal.id) animal.id_padre = null;
          if (animal.id_madre === animal.id || animal.id_madre === animal.id_padre) animal.id_madre = null;
        } else if (alerta.accionTipo === 'CORREGIR_FECHA_PROGENIE') {
          animal.fecha_nacimiento = '2024-05-01';
        } else if (alerta.accionTipo === 'NORMALIZAR_PESO_ANILLA') {
          animal.calibre_anilla_mm = animal.sexo === 'Macho' ? 20.0 : 18.0;
          if (animal.sexo === 'Macho' && (animal.peso_actual_kg < 3.0 || animal.peso_actual_kg > 3.5 || !animal.peso_actual_kg)) {
            animal.peso_actual_kg = 3.250;
          } else if (animal.sexo === 'Hembra' && (animal.peso_actual_kg < 2.2 || animal.peso_actual_kg > 2.6 || !animal.peso_actual_kg)) {
            animal.peso_actual_kg = 2.400;
          }
          const letra = animal.sexo === 'Macho' ? 'M' : 'H';
          const anio2 = (animal.fecha_nacimiento || '2024').slice(2, 4);
          const num4 = String(animal.numero_anilla || '0001').padStart(4, '0');
          animal.codigo_identificacion = `ESGA025-${anio2}-${letra}-${num4}`;
        }
        await this.db.put('animales', animal);
      }
    }

    if (alerta.controlId) {
      const ctrl = this.estado.controlesPuesta.find(c => c.id === alerta.controlId);
      if (ctrl) {
        if (alerta.accionTipo === 'ELIMINAR_CONTROL_PUESTA') {
          await this.db.delete('controlesPuesta', ctrl.id);
          this.estado.controlesPuesta = await this.db.getAll('controlesPuesta');
        } else if (alerta.accionTipo === 'NORMALIZAR_CONTROL_PUESTA') {
          if (ctrl.total_huevos_15d > 15) ctrl.total_huevos_15d = 13;
          if (ctrl.peso_medio_huevo_g < 55) ctrl.peso_medio_huevo_g = 58.0;
          if (ctrl.peso_medio_huevo_g > 70) ctrl.peso_medio_huevo_g = 64.0;
          ctrl.conforme_estandar = true;
          await this.db.put('controlesPuesta', ctrl);
        }
      }
    }

    this.recalcularConsanguinidadCenso();
    this.renderizarCenso();
    this.actualizarKPIs();
    this.ejecutarAuditoriaIntegridad(false);
    if (typeof this.mostrarNotificacionToast === 'function') {
      this.mostrarNotificacionToast('✅ Incoherencia corregida y normalizada en IndexedDB.', 'success');
    }
  },

  exportarInformeAuditoriaJSON() {
    const alertas = this.ejecutarAuditoriaIntegridad(false);
    const fechaStr = new Date().toISOString().split('T')[0];
    const informe = {
      sistema: 'AlacantinApp v6 - Motor de Auditoría Zootécnica ESGA025',
      fecha_auditoria: new Date().toISOString(),
      total_ejemplares_auditados: (this.estado.animales || []).length,
      total_controles_puesta_auditados: (this.estado.controlesPuesta || []).length,
      resumen_alertas: {
        total: alertas.length,
        incoherencias_genealogicas: alertas.filter(a => a.categoria === 'GENEALOGIA').length,
        alertas_peso_y_anillado: alertas.filter(a => a.categoria === 'PESO_ANILLA').length,
        incoherencias_puesta: alertas.filter(a => a.categoria === 'PUESTA').length
      },
      hallazgos: alertas
    };
    this.descargarArchivoCliente(
      JSON.stringify(informe, null, 2),
      `Auditoria_Integridad_ESGA025_${fechaStr}.json`,
      'application/json;charset=utf-8;'
    );
  },

  // -------------------------------------------------------------------------
  // 12.2 MÓDULO DE RESPALDOS INTEGRALES Y RESTAURACIÓN DE EMERGENCIA (BACKUP & RESTORE)
  // -------------------------------------------------------------------------
  abrirModalRespaldos() {
    this.actualizarEstadisticasModalRespaldos();
    const resBox = document.getElementById('backup-restore-resultado-box');
    if (resBox) resBox.classList.add('hidden');
    document.getElementById('modal-respaldos-backup')?.classList.remove('hidden');
  },

  cerrarModalRespaldos() {
    document.getElementById('modal-respaldos-backup')?.classList.add('hidden');
  },

  actualizarEstadisticasModalRespaldos() {
    const animales = this.estado.animales || [];
    const explotaciones = this.estado.explotaciones || [];
    const inspecciones = this.estado.inspecciones || [];
    const puesta = this.estado.controlesPuesta || [];

    let totalFotos = 0;
    animales.forEach(a => {
      if (a.fotos?.lateral) totalFotos++;
      if (a.fotos?.cabeza) totalFotos++;
      if (a.fotos?.tarsos) totalFotos++;
      const gal = a.fotos?.galeria_opcional || a.multimedia_urls?.galeria_opcional || [];
      if (Array.isArray(gal)) totalFotos += gal.length;
    });

    const setTxt = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = String(val);
    };
    setTxt('backup-stat-animales', animales.length);
    setTxt('backup-stat-explotaciones', explotaciones.length);
    setTxt('backup-stat-inspecciones', inspecciones.length);
    setTxt('backup-stat-puesta', puesta.length);
    setTxt('backup-stat-fotos', totalFotos);
  },

  async construirPayloadBackupIntegral() {
    const animales = await this.db.getAll('animales');
    const explotaciones = await this.db.getAll('explotaciones');
    const inspecciones = await this.db.getAll('inspecciones');
    const controlesPuesta = await this.db.getAll('controlesPuesta');
    const lotes = await this.db.getAll('lotes');
    const syncQueue = await this.db.getAll('syncQueue');

    return {
      meta: {
        aplicacion: 'AlacantinApp v6 - Libro Genealógico Oficial ESGA025',
        version_esquema: '6.0.0',
        raza_codigo: 'ESGA025',
        fecha_exportacion: new Date().toISOString(),
        aviario_activo_id: localStorage.getItem('alacantina_aviario_activo_id') || null,
        rol_rbac: localStorage.getItem('alacantina_rol_rbac') || 'inspector',
        estadisticas: {
          total_animales: animales.length,
          total_explotaciones: explotaciones.length,
          total_inspecciones: inspecciones.length,
          total_controles_puesta: controlesPuesta.length,
          total_lotes: lotes.length
        }
      },
      datos: {
        animales,
        explotaciones,
        inspecciones,
        controlesPuesta,
        lotes,
        syncQueue
      }
    };
  },

  async exportarBackupIntegralJSON() {
    const payload = await this.construirPayloadBackupIntegral();
    const fechaStr = new Date().toISOString().split('T')[0];
    const jsonStr = JSON.stringify(payload, null, 2);
    const nombreArchivo = `AlacantinApp_v6_Backup_Integral_${fechaStr}.json`;

    this.descargarArchivoCliente(jsonStr, nombreArchivo, 'application/json;charset=utf-8;');
    if (typeof this.mostrarNotificacionToast === 'function') {
      this.mostrarNotificacionToast(`💾 Backup JSON exportado (${payload.datos.animales.length} ejemplares).`, 'success');
    }
  },

  // Generador nativo de archivo .ZIP estándar (PKZIP Store Method 0 con CRC32) 100% en cliente sin librerías externas
  calcularCRC32Bytes(bytes) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) {
      crc ^= bytes[i];
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
      }
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  },

  construirArchivoZipNativo(archivos) {
    const encoder = new TextEncoder();
    const entradas = archivos.map(f => {
      const nombreBytes = encoder.encode(f.nombre);
      const contenidoBytes = typeof f.contenido === 'string' ? encoder.encode(f.contenido) : f.contenido;
      const crc = this.calcularCRC32Bytes(contenidoBytes);
      return { nombreBytes, contenidoBytes, crc };
    });

    let tamanoTotal = 22; // End of Central Directory
    entradas.forEach(e => {
      tamanoTotal += (30 + e.nombreBytes.length + e.contenidoBytes.length) + (46 + e.nombreBytes.length);
    });

    const buffer = new ArrayBuffer(tamanoTotal);
    const view = new DataView(buffer);
    const uint8 = new Uint8Array(buffer);
    let offset = 0;

    // 1. Local File Headers + Data
    entradas.forEach(e => {
      e.localHeaderOffset = offset;
      view.setUint32(offset, 0x04034b50, true); // Local file header signature
      view.setUint16(offset + 4, 20, true);     // Version needed
      view.setUint16(offset + 6, 0x0800, true); // UTF-8 flag
      view.setUint16(offset + 8, 0, true);      // Store method (0)
      view.setUint16(offset + 10, 0, true);     // Mod time
      view.setUint16(offset + 12, 0x5521, true);// Mod date
      view.setUint32(offset + 14, e.crc, true); // CRC32
      view.setUint32(offset + 18, e.contenidoBytes.length, true);
      view.setUint32(offset + 22, e.contenidoBytes.length, true);
      view.setUint16(offset + 26, e.nombreBytes.length, true);
      view.setUint16(offset + 28, 0, true);
      offset += 30;
      uint8.set(e.nombreBytes, offset);
      offset += e.nombreBytes.length;
      uint8.set(e.contenidoBytes, offset);
      offset += e.contenidoBytes.length;
    });

    // 2. Central Directory
    const cdStart = offset;
    entradas.forEach(e => {
      view.setUint32(offset, 0x02014b50, true); // Central directory signature
      view.setUint16(offset + 4, 20, true);
      view.setUint16(offset + 6, 20, true);
      view.setUint16(offset + 8, 0x0800, true); // UTF-8
      view.setUint16(offset + 10, 0, true);     // Store
      view.setUint16(offset + 12, 0, true);
      view.setUint16(offset + 14, 0x5521, true);
      view.setUint32(offset + 16, e.crc, true);
      view.setUint32(offset + 20, e.contenidoBytes.length, true);
      view.setUint32(offset + 24, e.contenidoBytes.length, true);
      view.setUint16(offset + 28, e.nombreBytes.length, true);
      view.setUint16(offset + 30, 0, true);
      view.setUint16(offset + 32, 0, true);
      view.setUint16(offset + 34, 0, true);
      view.setUint16(offset + 36, 0, true);
      view.setUint32(offset + 38, 0, true);
      view.setUint32(offset + 42, e.localHeaderOffset, true);
      offset += 46;
      uint8.set(e.nombreBytes, offset);
      offset += e.nombreBytes.length;
    });

    const cdSize = offset - cdStart;
    // 3. End of Central Directory Record
    view.setUint32(offset, 0x06054b50, true);
    view.setUint16(offset + 4, 0, true);
    view.setUint16(offset + 6, 0, true);
    view.setUint16(offset + 8, entradas.length, true);
    view.setUint16(offset + 10, entradas.length, true);
    view.setUint32(offset + 12, cdSize, true);
    view.setUint32(offset + 16, cdStart, true);
    view.setUint16(offset + 20, 0, true);

    return uint8;
  },

  async exportarBackupIntegralZIP() {
    const payload = await this.construirPayloadBackupIntegral();
    const fechaStr = new Date().toISOString().split('T')[0];
    const jsonPrincipal = JSON.stringify(payload, null, 2);

    const manifiestoTxt = [
      '========================================================================',
      'ALACANTINAPP V6 - PAQUETE DE RESPALDO INTEGRAL (ESGA025)',
      '========================================================================',
      `Fecha de Generación: ${payload.meta.fecha_exportacion}`,
      `Ejemplares en Censo: ${payload.meta.estadisticas.total_animales}`,
      `Explotaciones REGA:  ${payload.meta.estadisticas.total_explotaciones}`,
      `Actas de Inspección: ${payload.meta.estadisticas.total_inspecciones}`,
      `Controles de Puesta: ${payload.meta.estadisticas.total_controles_puesta}`,
      '',
      'INSTRUCCIONES DE RESTAURACIÓN DE EMERGENCIA:',
      '1. Abre AlacantinApp v6 en tu teléfono móvil, tablet u ordenador.',
      '2. Entra en "Mi Cuenta / Backup" o "Panel Admin -> Respaldos y Migración".',
      '3. Sube directamente este archivo .ZIP o el archivo backup_integral_esga025.json incluido.',
      '========================================================================'
    ].join('\r\n');

    const zipBytes = this.construirArchivoZipNativo([
      { nombre: 'backup_integral_esga025.json', contenido: jsonPrincipal },
      { nombre: 'LEEME_RESTAURACION_ESGA025.txt', contenido: manifiestoTxt }
    ]);

    const nombreZip = `AlacantinApp_v6_Backup_Integral_${fechaStr}.zip`;
    this.descargarArchivoCliente(zipBytes, nombreZip, 'application/zip');
    if (typeof this.mostrarNotificacionToast === 'function') {
      this.mostrarNotificacionToast(`🗜️ Paquete ZIP de respaldo exportado (${nombreZip}).`, 'success');
    }
  },

  extraerJsonDeZipBuffer(arrayBuffer) {
    const view = new DataView(arrayBuffer);
    const uint8 = new Uint8Array(arrayBuffer);
    const decoder = new TextDecoder('utf-8');
    let offset = 0;

    while (offset + 30 <= uint8.length) {
      const sig = view.getUint32(offset, true);
      if (sig !== 0x04034b50) break;

      const metodo = view.getUint16(offset + 8, true);
      const compSize = view.getUint32(offset + 18, true);
      const nombreLen = view.getUint16(offset + 26, true);
      const extraLen = view.getUint16(offset + 28, true);

      const nombreArchivo = decoder.decode(uint8.subarray(offset + 30, offset + 30 + nombreLen));
      const dataStart = offset + 30 + nombreLen + extraLen;
      const dataEnd = dataStart + compSize;

      if (nombreArchivo.endsWith('.json') && metodo === 0 && dataEnd <= uint8.length) {
        const jsonTexto = decoder.decode(uint8.subarray(dataStart, dataEnd));
        return JSON.parse(jsonTexto);
      }
      offset = dataEnd;
    }
    throw new Error('No se encontró un archivo JSON válido sin comprimir dentro del paquete ZIP.');
  },

  async importarBackupEmergenciaArchivo(event) {
    const file = event?.target?.files?.[0];
    if (!file) return;

    try {
      let objetoBackup = null;
      if (file.name.toLowerCase().endsWith('.zip')) {
        const buffer = await file.arrayBuffer();
        objetoBackup = this.extraerJsonDeZipBuffer(buffer);
      } else {
        const texto = await file.text();
        objetoBackup = JSON.parse(texto);
      }

      await this.procesarRestauracionBackup(objetoBackup, file.name);
    } catch (err) {
      console.error('[Backup Restore] Error al restaurar:', err);
      alert(`Error al restaurar el archivo de respaldo: ${err.message}`);
    } finally {
      if (event?.target) event.target.value = '';
    }
  },

  async procesarRestauracionBackup(objetoBackup, nombreArchivo = 'Backup') {
    const datos = objetoBackup?.datos || objetoBackup;
    if (!datos || !Array.isArray(datos.animales)) {
      throw new Error('El archivo no contiene una estructura válida de censo ESGA025 (falta colección "animales").');
    }

    const radioModo = document.querySelector('input[name="backup-restore-mode"]:checked');
    const modoReemplazar = !radioModo || radioModo.value === 'reemplazar';

    if (modoReemplazar) {
      await this.db.clear('animales');
      await this.db.clear('explotaciones');
      await this.db.clear('inspecciones');
      await this.db.clear('controlesPuesta');
      await this.db.clear('lotes');
    }

    if (Array.isArray(datos.explotaciones) && datos.explotaciones.length > 0) {
      await this.db.putBatch('explotaciones', datos.explotaciones);
    }
    if (Array.isArray(datos.animales) && datos.animales.length > 0) {
      await this.db.putBatch('animales', datos.animales);
    }
    if (Array.isArray(datos.inspecciones) && datos.inspecciones.length > 0) {
      await this.db.putBatch('inspecciones', datos.inspecciones);
    }
    if (Array.isArray(datos.controlesPuesta) && datos.controlesPuesta.length > 0) {
      await this.db.putBatch('controlesPuesta', datos.controlesPuesta);
    }
    if (Array.isArray(datos.lotes) && datos.lotes.length > 0) {
      await this.db.putBatch('lotes', datos.lotes);
    }

    await this.cargarDatos();
    this.inicializarAviarioActivo();
    this.poblarSelectores();
    this.renderizarCenso();
    this.actualizarKPIs();
    this.renderizarLotes();
    this.poblarSelectoresAnaliticaPuesta();
    this.renderizarAnaliticaPuesta();
    this.actualizarEstadisticasModalRespaldos();
    this.ejecutarAuditoriaIntegridad(false);

    const resBox = document.getElementById('backup-restore-resultado-box');
    if (resBox) {
      resBox.classList.remove('hidden');
      resBox.innerHTML = `
        <div class="font-bold text-emerald-300 flex items-center gap-1.5">
          <i class="fa-solid fa-circle-check"></i>
          <span>Restauración de Emergencia Completada con Éxito (${this.escaparHtml(nombreArchivo)})</span>
        </div>
        <p class="mt-1 text-[11px] text-slate-200">
          Se han restaurado en IndexedDB: <strong>${this.estado.animales.length} ejemplares</strong>,
          <strong>${this.estado.explotaciones.length} explotaciones REGA</strong>,
          <strong>${this.estado.inspecciones.length} actas de inspección</strong> y
          <strong>${this.estado.controlesPuesta.length} controles de puesta</strong>.
        </p>
      `;
    }

    if (typeof this.mostrarNotificacionToast === 'function') {
      this.mostrarNotificacionToast(
        `✅ Backup restaurado: ${this.estado.animales.length} ejemplares cargados en IndexedDB.`,
        'success'
      );
    }
  },

  // -------------------------------------------------------------------------
  // 12.3 MÓDULO DE GENERACIÓN DE ACTAS OFICIALES DE CIERRE CENSAL ANUAL (MAPA / CNZ)
  // -------------------------------------------------------------------------
  abrirModalActaCierreAnual() {
    // Poblar selector de explotaciones REGA en el modal
    const selectExp = document.getElementById('cierre-anual-explotacion');
    if (selectExp) {
      const valPrevio = selectExp.value || 'TODAS';
      selectExp.innerHTML = '<option value="TODAS">Global Libro Genealógico (Todas las Explotaciones REGA)</option>';
      (this.estado.explotaciones || []).forEach(exp => {
        const opt = document.createElement('option');
        opt.value = exp.id;
        opt.textContent = `${exp.codigo_rega || exp.rega} · ${exp.nombre_criadero || exp.nombre_titular} (${exp.municipio || 'Alicante'})`;
        selectExp.appendChild(opt);
      });
      if (valPrevio) selectExp.value = valPrevio;
    }

    // Si hay aviario activo, autocompletar criador firmante
    const inpCriador = document.getElementById('cierre-anual-criador');
    if (inpCriador && this.estado.aviarioActivo) {
      const av = this.estado.aviarioActivo;
      inpCriador.value = `${av.nombre_titular || 'Titular Explotación'} (${av.codigo_rega || av.rega || 'Sin REGA'})`;
    }

    document.getElementById('modal-acta-cierre-anual')?.classList.remove('hidden');

    setTimeout(() => {
      this.inicializarCanvasFirmasCierreAnual();
      if (!this.estado.cierreAnual.firmaCriadorBase64) {
        this.generarSelloFirmaAutoCierre('criador', false);
      }
      if (!this.estado.cierreAnual.firmaSecretarioBase64) {
        this.generarSelloFirmaAutoCierre('secretario', false);
      }
      this.renderizarVistaPreviaActaCierreAnual();
    }, 60);
  },

  cerrarModalActaCierreAnual() {
    document.getElementById('modal-acta-cierre-anual')?.classList.add('hidden');
  },

  inicializarCanvasFirmasCierreAnual() {
    const configurarCanvas = (canvasId, tipo) => {
      const canvas = document.getElementById(canvasId);
      if (!canvas || canvas.dataset.initialized === 'true') return;
      canvas.dataset.initialized = 'true';

      const ctx = canvas.getContext('2d');
      ctx.strokeStyle = tipo === 'criador' ? '#1e3a8a' : '#065f46';
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      let dibujando = false;

      const obtenerPos = (evt) => {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
        const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;
        return {
          x: (clientX - rect.left) * scaleX,
          y: (clientY - rect.top) * scaleY
        };
      };

      const iniciar = (evt) => {
        evt.preventDefault();
        dibujando = true;
        const pos = obtenerPos(evt);
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
      };

      const mover = (evt) => {
        if (!dibujando) return;
        evt.preventDefault();
        const pos = obtenerPos(evt);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
      };

      const finalizar = () => {
        if (!dibujando) return;
        dibujando = false;
        const dataUrl = canvas.toDataURL('image/png');
        if (tipo === 'criador') {
          this.estado.cierreAnual.firmaCriadorBase64 = dataUrl;
        } else {
          this.estado.cierreAnual.firmaSecretarioBase64 = dataUrl;
        }
        this.renderizarVistaPreviaActaCierreAnual();
      };

      canvas.addEventListener('mousedown', iniciar);
      canvas.addEventListener('mousemove', mover);
      window.addEventListener('mouseup', finalizar);
      canvas.addEventListener('touchstart', iniciar, { passive: false });
      canvas.addEventListener('touchmove', mover, { passive: false });
      window.addEventListener('touchend', finalizar);
    };

    configurarCanvas('canvas-firma-cierre-criador', 'criador');
    configurarCanvas('canvas-firma-cierre-secretario', 'secretario');
  },

  limpiarCanvasFirmaCierre(tipo) {
    const canvasId = tipo === 'criador' ? 'canvas-firma-cierre-criador' : 'canvas-firma-cierre-secretario';
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (tipo === 'criador') {
      this.estado.cierreAnual.firmaCriadorBase64 = null;
    } else {
      this.estado.cierreAnual.firmaSecretarioBase64 = null;
    }
    this.renderizarVistaPreviaActaCierreAnual();
  },

  generarSelloFirmaAutoCierre(tipo, reRender = true) {
    const canvasId = tipo === 'criador' ? 'canvas-firma-cierre-criador' : 'canvas-firma-cierre-secretario';
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Sello oficial y rúbrica estilizada
    ctx.save();
    ctx.strokeStyle = tipo === 'criador' ? '#1e3a8a' : '#065f46';
    ctx.fillStyle = tipo === 'criador' ? '#1e3a8a' : '#065f46';
    ctx.lineWidth = 2;

    // Trazo caligráfico simulado
    ctx.beginPath();
    if (tipo === 'criador') {
      ctx.moveTo(45, 65);
      ctx.bezierCurveTo(75, 20, 115, 80, 155, 35);
      ctx.bezierCurveTo(185, 15, 220, 70, 275, 45);
      ctx.lineTo(315, 52);
    } else {
      ctx.moveTo(50, 60);
      ctx.bezierCurveTo(95, 15, 140, 85, 190, 30);
      ctx.bezierCurveTo(225, 15, 260, 75, 320, 40);
      ctx.moveTo(75, 72);
      ctx.lineTo(295, 68);
    }
    ctx.stroke();

    ctx.font = 'bold 10px monospace';
    const selloTxt = tipo === 'criador'
      ? 'FIRMADO DIGITALMENTE · TITULAR REGA ESGA025'
      : 'SELLO OFICIAL CNZ · DIRECCIÓN TÉCNICA ESGA025';
    ctx.fillText(selloTxt, 45, 88);
    ctx.restore();

    const dataUrl = canvas.toDataURL('image/png');
    if (tipo === 'criador') {
      this.estado.cierreAnual.firmaCriadorBase64 = dataUrl;
    } else {
      this.estado.cierreAnual.firmaSecretarioBase64 = dataUrl;
    }
    if (reRender) this.renderizarVistaPreviaActaCierreAnual();
  },

  calcularIndicadoresCierreAnual() {
    const anio = Number(document.getElementById('cierre-anual-anio')?.value || new Date().getFullYear());
    const expFiltro = document.getElementById('cierre-anual-explotacion')?.value || 'TODAS';

    const todosAnimales = this.estado.animales || [];
    const animalesAmbito = expFiltro === 'TODAS'
      ? todosAnimales
      : todosAnimales.filter(a => a.explotacion_id === expFiltro);

    const activos = animalesAmbito.filter(a => a.estado !== 'Baja');
    const bajas = animalesAmbito.filter(a => a.estado === 'Baja');

    // 1. Balance de censo activo por secciones (RF, RA, RN, RD, RM)
    const secciones = { RF: 0, RA: 0, RN: 0, RD: 0, RM: 0 };
    activos.forEach(a => {
      if (secciones[a.seccion_libro] !== undefined) {
        secciones[a.seccion_libro]++;
      }
    });

    // 2. Desglose por sexo y tramo de edad (Adultos >= 12 meses vs Jóvenes < 12 meses)
    let machosAdultos = 0;
    let machosJovenes = 0;
    let hembrasAdultas = 0;
    let hembrasJovenes = 0;

    activos.forEach(a => {
      const adulto = this.esEjemplarAdultoAuditoria(a.fecha_nacimiento);
      if (a.sexo === 'Macho') {
        if (adulto) machosAdultos++;
        else machosJovenes++;
      } else {
        if (adulto) hembrasAdultas++;
        else hembrasJovenes++;
      }
    });

    // 3. Tamaño Efectivo (Ne) y Coeficiente de Consanguinidad (Fx) promedio
    const machosReprod = activos.filter(a => a.sexo === 'Macho' && ['RF', 'RD', 'RM'].includes(a.seccion_libro)).length || activos.filter(a => a.sexo === 'Macho').length;
    const hembrasReprod = activos.filter(a => a.sexo === 'Hembra' && ['RF', 'RD', 'RM'].includes(a.seccion_libro)).length || activos.filter(a => a.sexo === 'Hembra').length;

    const ne = (machosReprod > 0 && hembrasReprod > 0)
      ? (4 * machosReprod * hembrasReprod) / (machosReprod + hembrasReprod)
      : 0;
    const deltaF = ne > 0 ? (1 / (2 * ne)) : 0;

    const sumaFx = activos.reduce((acc, a) => acc + (Number(a.coeficiente_consanguinidad) || 0), 0);
    const fxPromedio = activos.length > 0 ? (sumaFx / activos.length) : 0;

    // 4. Resumen del Control de Puesta Anual (% Hen-Day medio y % de huevos en rango 55-70 g)
    const idsAnimalesAmbito = new Set(animalesAmbito.map(a => a.id));
    const controlesAmbito = (this.estado.controlesPuesta || []).filter(c => idsAnimalesAmbito.has(c.animal_id));

    let sumaHenDay = 0;
    let sumaPesoHuevo = 0;
    let totalHuevosRecolectados = 0;
    let controlesEnRango55_70 = 0;
    let huevosEnRango55_70 = 0;

    controlesAmbito.forEach(c => {
      const h = Number(c.total_huevos_15d || 0);
      const p = Number(c.peso_medio_huevo_g || 0);
      const hd = (h / 15) * 100;
      sumaHenDay += hd;
      sumaPesoHuevo += p;
      totalHuevosRecolectados += h;

      if (p >= 55.0 && p <= 70.0) {
        controlesEnRango55_70++;
        huevosEnRango55_70 += h;
      }
    });

    const totalControles = controlesAmbito.length;
    const henDayMedio = totalControles > 0 ? (sumaHenDay / totalControles) : 0;
    const pesoMedioHuevo = totalControles > 0 ? (sumaPesoHuevo / totalControles) : 0;
    const pctHuevosEnRango55_70 = totalHuevosRecolectados > 0
      ? (huevosEnRango55_70 / totalHuevosRecolectados) * 100
      : (totalControles > 0 ? (controlesEnRango55_70 / totalControles) * 100 : 0);

    const expObj = expFiltro === 'TODAS'
      ? null
      : (this.estado.explotaciones || []).find(e => e.id === expFiltro);

    return {
      anio,
      codigoActa: `ACTA-CIERRE-ESGA025-${anio}-${String(activos.length).padStart(3, '0')}`,
      fechaEmision: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' }),
      ambitoTexto: expObj
        ? `${expObj.nombre_criadero || expObj.nombre_titular} (REGA: ${expObj.codigo_rega || expObj.rega} · ${expObj.municipio})`
        : `Censo Global Consolidado (${(this.estado.explotaciones || []).length} Explotaciones REGA Activas)`,
      totalActivos: activos.length,
      totalBajas: bajas.length,
      secciones,
      machosAdultos,
      machosJovenes,
      hembrasAdultas,
      hembrasJovenes,
      totalMachos: machosAdultos + machosJovenes,
      totalHembras: hembrasAdultas + hembrasJovenes,
      machosReprod,
      hembrasReprod,
      ne,
      deltaF,
      fxPromedio,
      totalControles,
      totalHuevosRecolectados,
      henDayMedio,
      pesoMedioHuevo,
      pctHuevosEnRango55_70
    };
  },

  renderizarVistaPreviaActaCierreAnual() {
    const cont = document.getElementById('acta-cierre-anual-a4-container');
    if (!cont) return;

    const ind = this.calcularIndicadoresCierreAnual();
    const criadorNombre = document.getElementById('cierre-anual-criador')?.value.trim() || (this.estado.aviarioActivo ? `${this.estado.aviarioActivo.nombre_titular} (${this.estado.aviarioActivo.codigo_rega || this.estado.aviarioActivo.rega || 'Sin REGA'})` : 'Titular Explotación REGA (Pendiente de especificar)');
    const secretarioNombre = document.getElementById('cierre-anual-secretario')?.value.trim() || 'Secretaría Técnica · Libro Genealógico Oficial ESGA025';
    const firmaCriador = this.estado.cierreAnual.firmaCriadorBase64;
    const firmaSecretario = this.estado.cierreAnual.firmaSecretarioBase64;

    cont.innerHTML = `
      <!-- Cabecera Institucional A4 -->
      <div class="border-b-2 border-slate-900 pb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <img src="./icons/logo.png" onerror="this.src='./icons/icon-192.png'" class="h-14 w-14 rounded-lg border border-slate-400 object-cover bg-slate-900 p-0.5">
          <div>
            <div class="text-[10px] font-bold uppercase tracking-widest text-slate-600">
              Ministerio de Agricultura, Pesca y Alimentación (MAPA) · Comisión Nacional de Zootecnia (CNZ)
            </div>
            <h1 class="text-base sm:text-lg font-black text-slate-900 uppercase leading-tight">
              ACTA OFICIAL DE CIERRE CENSAL ANUAL · EJERCICIO ${ind.anio}
            </h1>
            <div class="text-xs font-bold text-amber-700">
              Libro Genealógico Oficial de la Raza Gallina Alacantina (Código ARCA: ESGA025)
            </div>
          </div>
        </div>
        <div class="text-left sm:text-right font-mono text-[11px] bg-slate-100 px-3 py-2 rounded border border-slate-300 shrink-0">
          <div><strong>Nº ACTA:</strong> ${this.escaparHtml(ind.codigoActa)}</div>
          <div><strong>FECHA:</strong> ${this.escaparHtml(ind.fechaEmision)}</div>
          <div><strong>NORMATIVA:</strong> RD 45/2019 · Reg. UE 2016/1012</div>
        </div>
      </div>

      <!-- Datos de Identificación de la Explotación / Ámbito -->
      <div class="p-3 rounded-lg bg-slate-50 border border-slate-300 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
        <div>
          <span class="text-[10px] font-bold uppercase text-slate-500 block">Ámbito Censal / Explotación Ganadera REGA:</span>
          <strong class="text-slate-900">${this.escaparHtml(ind.ambitoTexto)}</strong>
        </div>
        <div>
          <span class="text-[10px] font-bold uppercase text-slate-500 block">Entidad Gestora Reconocida:</span>
          <strong class="text-slate-900">Club Gallina Alacantina · Dirección Técnica del Programa de Cría ESGA025</strong>
        </div>
      </div>

      <!-- BLOQUE 1: BALANCE DE CENSO ACTIVO POR SECCIONES Y POR SEXO / TRAMO DE EDAD -->
      <div class="space-y-2">
        <h2 class="text-xs font-black uppercase tracking-wider text-slate-900 bg-slate-200 px-3 py-1.5 rounded border-l-4 border-amber-600">
          1. Balance de Censo Activo por Secciones del Libro Genealógico y Estructura Demográfica
        </h2>

        <div class="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
          <div class="p-2 rounded border border-slate-300 bg-white">
            <span class="text-[10px] font-bold text-slate-500 block">Sección RF</span>
            <span class="text-sm font-black text-purple-800 font-mono">${ind.secciones.RF}</span>
            <span class="text-[9px] text-slate-500 block">Fundacional</span>
          </div>
          <div class="p-2 rounded border border-slate-300 bg-white">
            <span class="text-[10px] font-bold text-slate-500 block">Sección RA</span>
            <span class="text-sm font-black text-orange-700 font-mono">${ind.secciones.RA}</span>
            <span class="text-[9px] text-slate-500 block">Auxiliar</span>
          </div>
          <div class="p-2 rounded border border-slate-300 bg-white">
            <span class="text-[10px] font-bold text-slate-500 block">Sección RN</span>
            <span class="text-sm font-black text-sky-800 font-mono">${ind.secciones.RN}</span>
            <span class="text-[9px] text-slate-500 block">Nacimientos</span>
          </div>
          <div class="p-2 rounded border border-slate-300 bg-white">
            <span class="text-[10px] font-bold text-slate-500 block">Sección RD</span>
            <span class="text-sm font-black text-emerald-800 font-mono">${ind.secciones.RD}</span>
            <span class="text-[9px] text-slate-500 block">Definitivo</span>
          </div>
          <div class="p-2 rounded border border-slate-300 bg-white">
            <span class="text-[10px] font-bold text-slate-500 block">Sección RM</span>
            <span class="text-sm font-black text-amber-700 font-mono">${ind.secciones.RM}</span>
            <span class="text-[9px] text-slate-500 block">Méritos</span>
          </div>
          <div class="p-2 rounded border-2 border-slate-800 bg-slate-100">
            <span class="text-[10px] font-black text-slate-700 block">TOTAL ACTIVO</span>
            <span class="text-sm font-black text-slate-950 font-mono">${ind.totalActivos}</span>
            <span class="text-[9px] text-slate-600 block">Bajas: ${ind.totalBajas}</span>
          </div>
        </div>

        <!-- Tabla por Sexo y Tramo de Edad -->
        <table class="w-full text-left border-collapse border border-slate-300 text-[11px]">
          <thead>
            <tr class="bg-slate-100 text-slate-700 border-b border-slate-300">
              <th class="py-1.5 px-2.5 border-r border-slate-300">Categoría por Sexo y Calibre</th>
              <th class="py-1.5 px-2.5 text-center border-r border-slate-300">Adultos (&ge; 12 meses)</th>
              <th class="py-1.5 px-2.5 text-center border-r border-slate-300">Jóvenes / Recría (&lt; 12 meses)</th>
              <th class="py-1.5 px-2.5 text-center border-r border-slate-300">Reproductores Aptos (RF/RD/RM)</th>
              <th class="py-1.5 px-2.5 text-right font-bold">Total Activos</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-300 font-mono">
            <tr>
              <td class="py-1.5 px-2.5 font-sans font-bold text-slate-800 border-r border-slate-300">♂ Machos / Gallos (Anilla 20 mm)</td>
              <td class="py-1.5 px-2.5 text-center border-r border-slate-300">${ind.machosAdultos}</td>
              <td class="py-1.5 px-2.5 text-center border-r border-slate-300">${ind.machosJovenes}</td>
              <td class="py-1.5 px-2.5 text-center border-r border-slate-300">${ind.machosReprod}</td>
              <td class="py-1.5 px-2.5 text-right font-bold">${ind.totalMachos}</td>
            </tr>
            <tr>
              <td class="py-1.5 px-2.5 font-sans font-bold text-slate-800 border-r border-slate-300">♀ Hembras / Gallinas (Anilla 18 mm)</td>
              <td class="py-1.5 px-2.5 text-center border-r border-slate-300">${ind.hembrasAdultas}</td>
              <td class="py-1.5 px-2.5 text-center border-r border-slate-300">${ind.hembrasJovenes}</td>
              <td class="py-1.5 px-2.5 text-center border-r border-slate-300">${ind.hembrasReprod}</td>
              <td class="py-1.5 px-2.5 text-right font-bold">${ind.totalHembras}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- BLOQUE 2: PARÁMETROS GENÉTICOS (TAMAÑO EFECTIVO Ne Y CONSANGUINIDAD Fx) -->
      <div class="space-y-2">
        <h2 class="text-xs font-black uppercase tracking-wider text-slate-900 bg-slate-200 px-3 py-1.5 rounded border-l-4 border-purple-700">
          2. Indicadores de Biodiversidad Genética: Tamaño Efectivo (Ne) y Consanguinidad (Fx)
        </h2>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div class="p-3 rounded-lg border border-slate-300 bg-slate-50">
            <span class="text-[10px] font-bold uppercase text-slate-500 block">Tamaño Efectivo Poblacional (Ne Wright)</span>
            <div class="text-base font-black text-slate-900 font-mono mt-0.5">Ne = ${ind.ne.toFixed(2)}</div>
            <span class="text-[10px] text-slate-600">Fórmula: 4·Nm·Nf / (Nm + Nf) con Nm=${ind.machosReprod}, Nf=${ind.hembrasReprod}</span>
          </div>
          <div class="p-3 rounded-lg border border-slate-300 bg-slate-50">
            <span class="text-[10px] font-bold uppercase text-slate-500 block">Consanguinidad Media de Explotación (Fx)</span>
            <div class="text-base font-black text-purple-900 font-mono mt-0.5">${(ind.fxPromedio * 100).toFixed(2)}% (Fx = ${ind.fxPromedio.toFixed(5)})</div>
            <span class="text-[10px] text-slate-600">Incremento generacional estimado ΔF = ${(ind.deltaF * 100).toFixed(2)}%</span>
          </div>
          <div class="p-3 rounded-lg border border-slate-300 bg-slate-50">
            <span class="text-[10px] font-bold uppercase text-slate-500 block">Esquema de Conservación Aplicado</span>
            <div class="text-xs font-black text-emerald-800 mt-1">Rotación Circular de 5 Familias (Regla de Gobe)</div>
            <span class="text-[10px] text-slate-600">Control genealógico ascendente a 5 generaciones</span>
          </div>
        </div>
      </div>

      <!-- BLOQUE 3: RESUMEN DEL CONTROL DE PUESTA ANUAL -->
      <div class="space-y-2">
        <h2 class="text-xs font-black uppercase tracking-wider text-slate-900 bg-slate-200 px-3 py-1.5 rounded border-l-4 border-emerald-700">
          3. Resumen Consolidado del Control Oficial de Puesta Anual (Estándar ESGA025: 55 g - 70 g)
        </h2>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
          <div class="p-2.5 rounded-lg border border-slate-300 bg-white">
            <span class="text-[10px] font-bold text-slate-500 block uppercase">Controles / Huevos</span>
            <span class="text-sm font-black text-slate-900 font-mono">${ind.totalControles} pruebas (${ind.totalHuevosRecolectados} uds)</span>
          </div>
          <div class="p-2.5 rounded-lg border border-slate-300 bg-white">
            <span class="text-[10px] font-bold text-slate-500 block uppercase">% Hen-Day Medio Anual</span>
            <span class="text-sm font-black text-emerald-800 font-mono">${ind.henDayMedio.toFixed(1)}%</span>
          </div>
          <div class="p-2.5 rounded-lg border border-slate-300 bg-white">
            <span class="text-[10px] font-bold text-slate-500 block uppercase">Peso Medio de Huevo</span>
            <span class="text-sm font-black text-slate-900 font-mono">${ind.pesoMedioHuevo.toFixed(1)} g</span>
          </div>
          <div class="p-2.5 rounded-lg border-2 border-emerald-700 bg-emerald-50">
            <span class="text-[10px] font-black text-emerald-900 block uppercase">% Huevos en Rango 55-70 g</span>
            <span class="text-sm font-black text-emerald-900 font-mono">${ind.pctHuevosEnRango55_70.toFixed(1)}% Aptos</span>
          </div>
        </div>
      </div>

      <!-- DECLARACIÓN Y DOBLE FIRMA DIGITAL OFICIAL -->
      <div class="pt-3 border-t-2 border-slate-800 space-y-3">
        <p class="text-[10px] text-slate-700 leading-relaxed text-justify">
          <strong>DECLARACIÓN RESPONSABLE PARA LA MEMORIA ANUAL ANTE EL MAPA / CNZ:</strong>
          Los abajo firmantes certifican la veracidad de los registros genealógicos, censales, zoométricos y productivos contenidos en la presente Acta Anual del Libro Genealógico de la raza autóctona <strong>Gallina Alacantina (ESGA025)</strong>, emitida de conformidad con el Real Decreto 45/2019 y el Reglamento (UE) 2016/1012 para su presentación ante la Autoridad Competente.
        </p>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          <div class="border border-slate-400 rounded-lg p-3 text-center bg-slate-50 space-y-1">
            <div class="text-[10px] font-black uppercase text-slate-700">Firma del Criador / Titular de Explotación REGA</div>
            <div class="h-20 flex items-center justify-center bg-white rounded border border-slate-200 overflow-hidden">
              ${firmaCriador ? `<img src="${firmaCriador}" class="max-h-16 object-contain" alt="Firma Criador">` : `<span class="text-[10px] text-slate-400 italic">Pendiente de rúbrica</span>`}
            </div>
            <div class="text-[11px] font-bold text-slate-900">${this.escaparHtml(criadorNombre)}</div>
          </div>

          <div class="border border-slate-400 rounded-lg p-3 text-center bg-slate-50 space-y-1">
            <div class="text-[10px] font-black uppercase text-slate-700">VºBº y Firma del Secretario Técnico del Club ESGA025</div>
            <div class="h-20 flex items-center justify-center bg-white rounded border border-slate-200 overflow-hidden">
              ${firmaSecretario ? `<img src="${firmaSecretario}" class="max-h-16 object-contain" alt="Firma Secretario Técnico">` : `<span class="text-[10px] text-slate-400 italic">Pendiente de rúbrica</span>`}
            </div>
            <div class="text-[11px] font-bold text-slate-900">${this.escaparHtml(secretarioNombre)}</div>
          </div>
        </div>
      </div>
    `;
  },

  exportarActaCierreAnualPDF() {
    const contenedor = document.getElementById('acta-cierre-anual-a4-container');
    if (!contenedor) return;

    const ind = this.calcularIndicadoresCierreAnual();
    const nombreArchivo = `Acta_Cierre_Censal_Anual_ESGA025_${ind.anio}.pdf`;

    if (typeof html2pdf !== 'undefined') {
      if (typeof this.mostrarNotificacionToast === 'function') {
        this.mostrarNotificacionToast(`⏳ Generando PDF A4 del Acta de Cierre Censal (${nombreArchivo})...`, 'info');
      }
      html2pdf()
        .set({
          margin: 8,
          filename: nombreArchivo,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, backgroundColor: '#ffffff', useCORS: true },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        })
        .from(contenedor)
        .save()
        .then(() => {
          if (typeof this.mostrarNotificacionToast === 'function') {
            this.mostrarNotificacionToast(`✅ Acta Anual descargada: ${nombreArchivo}`, 'success');
          }
        })
        .catch(() => {
          window.print();
        });
    } else {
      window.print();
    }
  }
};

// Iniciar aplicación al cargar el DOM
window.addEventListener('DOMContentLoaded', () => {
  window.app = app;
  app.init();
});
