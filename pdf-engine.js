// ============================================================================
// ALACANTINAPP V5 - MOTOR DE DOCUMENTOS OFICIALES Y CERTIFICADOS (PDF ENGINE)
// Club Gallina Alacantina (Código Oficial ESGA025)
// Cumplimiento: Reglamento (UE) 2016/1012, Real Decreto 45/2019 y Protocolo CNZ (5 junio 2025)
// ============================================================================

const PDFEngine = {
  /**
   * Logotipo heráldico vectorial oficial en SVG Base64 (Garantiza funcionamiento 100% offline sin fallos de CORS)
   */
  LOGO_OFFLINE_SVG: 'data:image/svg+xml;utf8,' + encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" width="160" height="160">
      <defs>
        <linearGradient id="gradNavy" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#1e3a8a"/>
          <stop offset="100%" stop-color="#0f172a"/>
        </linearGradient>
        <linearGradient id="gradGold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#fbbf24"/>
          <stop offset="100%" stop-color="#b45309"/>
        </linearGradient>
      </defs>
      <circle cx="80" cy="80" r="76" fill="url(#gradNavy)" stroke="url(#gradGold)" stroke-width="4"/>
      <circle cx="80" cy="80" r="70" fill="none" stroke="#fbbf24" stroke-width="1.5" stroke-dasharray="4,2"/>
      <!-- Silueta estilizada de Gallo Alacantino con porte a 70 grados -->
      <path d="M78 40 C75 36 68 34 65 38 C63 42 66 45 68 47 C62 48 57 53 58 60 C59 65 64 68 67 70 C60 74 54 82 56 92 C58 100 66 104 74 105 L72 120 L76 120 L78 106 L82 106 L84 120 L88 120 L86 105 C96 103 104 95 106 82 C108 68 98 52 86 44 C84 42 82 40 78 40 Z" fill="#ffffff"/>
      <!-- Cresta simple y barbillas rojas -->
      <path d="M68 36 C66 32 68 28 72 29 C74 31 74 34 76 35 C78 32 82 30 84 33 C85 36 84 39 82 41 Z" fill="#dc2626"/>
      <circle cx="70" cy="42" r="2" fill="#dc2626"/>
      <!-- Cola erguida a 70 grados -->
      <path d="M88 65 C102 52 118 42 122 55 C124 62 118 72 110 78 C120 70 126 82 118 90 C110 98 98 94 92 88 Z" fill="#fbbf24"/>
      <text x="80" y="136" text-anchor="middle" fill="#fbbf24" font-family="Arial, sans-serif" font-size="10" font-weight="bold" letter-spacing="1">ESGA025</text>
      <text x="80" y="148" text-anchor="middle" fill="#cbd5e1" font-family="Arial, sans-serif" font-size="7" font-weight="bold" letter-spacing="0.5">LIBRO OFICIAL</text>
    </svg>
  `),

  /**
   * Mapeo de Secciones del Libro Genealógico Oficial ESGA025
   */
  getNombreSeccion(cod) {
    const nombres = {
      RF: 'Registro Fundacional',
      RA: 'Registro Auxiliar',
      RN: 'Registro de Nacimientos (Aspirante)',
      RD: 'Registro Definitivo',
      RM: 'Registro de Méritos'
    };
    return nombres[cod] || cod || 'Registro de Nacimientos (RN)';
  },

  /**
   * Determina la denominación oficial del estado zootécnico del ejemplar
   */
  getNombreEstadoZootecnico(animal) {
    const seccion = animal.seccion_libro;
    if (animal.estado && animal.estado !== 'Activo') {
      return `${animal.estado.toUpperCase()} (Baja Zootécnica)`;
    }
    switch (seccion) {
      case 'RD': return 'APTO REPRODUCTOR OFICIAL (Superada Inspección 100p CNZ)';
      case 'RM': return 'REPRODUCTOR DE MÉRITO / ÉLITE RACIAL (Progenie y Calificación)';
      case 'RF': return 'REPRODUCTOR FUNDACIONAL INSCRITO (Tronco Base de Raza)';
      case 'RA': return 'REPRODUCTOR AUXILIAR INSCRITO';
      case 'RN': default: return 'PROVISIONAL / EN EVALUACIÓN (Aspirante RN)';
    }
  },

  /**
   * Interpretación técnica del Coeficiente de Consanguinidad de Wright (Fx)
   */
  getInterpretacionConsanguinidad(fx) {
    const v = Number(fx || 0);
    if (v === 0) return { texto: 'Consanguinidad Nula (Fx = 0.00%)', color: '#15803d' };
    if (v < 0.03125) return { texto: 'Consanguinidad Baja / Óptima (< 3.125%)', color: '#15803d' };
    if (v <= 0.0625) return { texto: 'Consanguinidad Moderada (≤ 6.25%)', color: '#b45309' };
    return { texto: 'Consanguinidad Elevada (> 6.25% - Precaución en apareamiento)', color: '#b91c1c' };
  },

  /**
   * Convierte cualquier imagen URL a Base64 para garantizar soporte 100% offline y evitar canvas tainted
   */
  async asegurarImagenBase64(src, fallback = null) {
    if (!src) return fallback || this.LOGO_OFFLINE_SVG;
    if (src.startsWith('data:image/')) return src;

    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      const timer = setTimeout(() => {
        resolve(fallback || src);
      }, 3500);

      img.onload = () => {
        clearTimeout(timer);
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || img.width || 300;
          canvas.height = img.naturalHeight || img.height || 300;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
          resolve(dataUrl);
        } catch (e) {
          console.warn('[PDFEngine] Error canvas toDataURL:', e);
          resolve(fallback || src);
        }
      };

      img.onerror = () => {
        clearTimeout(timer);
        resolve(fallback || this.LOGO_OFFLINE_SVG);
      };

      img.src = src;
    });
  },

  /**
   * Genera el Código QR de validación en Base64 compatible online y offline
   */
  async generarQrDataUrl(texto, tamaño = 140) {
    if (window.QRCode) {
      try {
        const div = document.createElement('div');
        div.style.display = 'none';
        document.body.appendChild(div);
        new window.QRCode(div, {
          text: texto,
          width: tamaño,
          height: tamaño,
          correctLevel: window.QRCode.CorrectLevel.M
        });
        await new Promise((r) => setTimeout(r, 80));
        const canvas = div.querySelector('canvas');
        if (canvas) {
          const res = canvas.toDataURL('image/png');
          div.remove();
          return res;
        }
        const img = div.querySelector('img');
        if (img && img.src) {
          const res = img.src;
          div.remove();
          return res;
        }
        div.remove();
      } catch (err) {
        console.warn('[PDFEngine] Fallback QR lib:', err);
      }
    }

    // Fallback URL de servicio QR o representación SVG si offline
    if (navigator.onLine) {
      return `https://api.qrserver.com/v1/create-qr-code/?size=${tamaño}x${tamaño}&data=${encodeURIComponent(texto)}`;
    }

    // SVG QR estático decorativo de contingencia offline
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 140" width="140" height="140">
        <rect width="140" height="140" fill="#ffffff" stroke="#cbd5e1" stroke-width="1"/>
        <rect x="10" y="10" width="36" height="36" fill="#1e3a8a"/>
        <rect x="16" y="16" width="24" height="24" fill="#ffffff"/>
        <rect x="22" y="22" width="12" height="12" fill="#1e3a8a"/>
        <rect x="94" y="10" width="36" height="36" fill="#1e3a8a"/>
        <rect x="100" y="16" width="24" height="24" fill="#ffffff"/>
        <rect x="106" y="22" width="12" height="12" fill="#1e3a8a"/>
        <rect x="10" y="94" width="36" height="36" fill="#1e3a8a"/>
        <rect x="16" y="100" width="24" height="24" fill="#ffffff"/>
        <rect x="22" y="106" width="12" height="12" fill="#1e3a8a"/>
        <rect x="58" y="18" width="8" height="20" fill="#1e3a8a"/>
        <rect x="72" y="30" width="14" height="8" fill="#1e3a8a"/>
        <rect x="58" y="58" width="24" height="24" fill="#b45309"/>
        <rect x="90" y="62" width="18" height="8" fill="#1e3a8a"/>
        <rect x="24" y="58" width="16" height="12" fill="#1e3a8a"/>
        <rect x="62" y="94" width="12" height="26" fill="#1e3a8a"/>
        <rect x="84" y="102" width="26" height="8" fill="#1e3a8a"/>
        <text x="70" y="74" text-anchor="middle" fill="#ffffff" font-family="Arial" font-size="8" font-weight="bold">ESGA</text>
      </svg>
    `);
  },

  /**
   * Construye el documento HTML completo maquetado en 2 páginas A4 estandarizadas
   */
  async construirHtmlCertificado(animal, datos = {}) {
    const ancestros = datos.ancestros || {};
    const exp = datos.explotacion || {};
    const insp = datos.inspeccion || null;
    const puesta = datos.controlPuesta || null;
    const fotos = datos.fotos || {};
    const inspectorPerfil = datos.inspector || null;

    // Datos dinámicos del Calificador / Inspector Zootécnico (desde el acta o desde el perfil autenticado)
    const inspectorNombreDinamico = (
      insp?.calificador_oficial ||
      inspectorPerfil?.nombre ||
      ''
    ).trim();
    const inspectorIdDinamico = (
      insp?.inspector_id ||
      insp?.inspector_dni ||
      inspectorPerfil?.dni ||
      inspectorPerfil?.numero_socio ||
      inspectorPerfil?.id ||
      ''
    ).trim();
    const firmaInspectorBase64 = (
      insp?.firma_inspector_base64 ||
      insp?.firma_storage_url ||
      inspectorPerfil?.firma_base64 ||
      null
    );

    const anillaLimpia = (animal.numero_anilla || '0000').toString().trim();
    const fechaEmision = new Date().toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });

    const codigoDoc = datos.codigoDocumento || `CERT-ESGA025-${new Date().getFullYear()}-${anillaLimpia.replace(/\D/g, '').padStart(4, '0') || '0001'}-${Math.floor(1000 + Math.random() * 9000)}`;

    const urlVerificacion = datos.urlValidacion || (
      `https://alacantinapp.clubgallinaalacantina.es/verificar?id=${encodeURIComponent(animal.id)}&anilla=${encodeURIComponent(anillaLimpia)}&cod=${encodeURIComponent(animal.codigo_identificacion)}`
    );

    const qrDataUrl = await this.generarQrDataUrl(
      `ESGA025|CERT:${codigoDoc}|ANILLA:${anillaLimpia}|ID:${animal.codigo_identificacion}|SECC:${animal.seccion_libro}|VERIF:${urlVerificacion}`,
      130
    );

    // Preparar fotos a Base64
    const logoBase64 = await this.asegurarImagenBase64('./icons/logo.png', this.LOGO_OFFLINE_SVG);
    const fotoLateral = await this.asegurarImagenBase64(fotos.lateral || animal.fotos?.lateral, logoBase64);
    const fotoCabeza = await this.asegurarImagenBase64(fotos.cabeza || animal.fotos?.cabeza, logoBase64);
    const fotoTarsos = await this.asegurarImagenBase64(fotos.tarsos || animal.fotos?.tarsos, logoBase64);

    // Galería adicional opcional (hasta 3 fotos para no sobrecargar el dossier)
    const galeriaRaw = fotos.galeria_opcional || animal.fotos?.galeria_opcional || [];
    const galeriaProcesada = [];
    if (Array.isArray(galeriaRaw)) {
      for (let i = 0; i < Math.min(galeriaRaw.length, 3); i++) {
        const item = galeriaRaw[i];
        const urlRaw = typeof item === 'string' ? item : item.url;
        const titulo = typeof item === 'object' && item.titulo ? item.titulo : `Toma complementaria #${i + 1}`;
        const b64 = await this.asegurarImagenBase64(urlRaw, null);
        if (b64) {
          galeriaProcesada.push({ b64, titulo });
        }
      }
    }

    // Datos de explotación
    const titular = exp.nombre_titular || animal.titular_nombre || 'Criador Asociado ESGA025';
    const criadero = exp.nombre_criadero || exp.nombre_titular || 'Aviario Oficial Alacantina';
    const rega = animal.codigo_rega || exp.codigo_rega || exp.rega || 'Sin REGA / En trámite';
    const socio = exp.numero_socio || 'Aspirante / Sin asignar';
    const municipio = exp.municipio || 'Alicante';
    const provincia = exp.provincia || 'Alicante';
    const lat = exp.latitud || animal.geolocalizacion_alta?.latitud;
    const lng = exp.longitud || animal.geolocalizacion_alta?.longitud;
    const gpsTxt = (lat && lng)
      ? `${Number(lat).toFixed(5)}º N, ${Number(lng).toFixed(5)}º W ${exp.geolocalizacion_precision ? `(±${exp.geolocalizacion_precision}m)` : ''}`
      : 'Ubicación registrada en término municipal';

    const fxVal = Number(animal.coeficiente_consanguinidad || 0);
    const fxInfo = this.getInterpretacionConsanguinidad(fxVal);
    const estadoZootecnico = this.getNombreEstadoZootecnico(animal);

    // Helper render celda pedigrí
    const celdaAncestral = (anc, grado, rolDefault, claseSexo) => {
      if (!anc) {
        return `
          <div class="ped-box ${claseSexo} ped-vacio">
            <span class="ped-rol">${grado}:</span>
            <span class="ped-anilla">${rolDefault}</span>
            <span class="ped-sub">Línea Fundacional (RF/RA)</span>
          </div>
        `;
      }
      return `
        <div class="ped-box ${claseSexo}">
          <span class="ped-rol">${grado}:</span>
          <span class="ped-anilla">#${anc.numero_anilla} (${anc.codigo_identificacion})</span>
          <span class="ped-nom">${anc.nombre || 'Sin alias'}</span>
          <span class="ped-sub">Sec: <strong>${anc.seccion_libro}</strong> · ${anc.variedad || 'Moteada'}</span>
        </div>
      `;
    };

    return `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <title>Certificado_ESGA025_${anillaLimpia}</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 0;
          }
          * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            color: #0f172a;
            margin: 0;
            padding: 0;
            background: #e2e8f0;
          }
          .no-print-bar {
            background: #1e3a8a;
            color: #ffffff;
            padding: 10px 16px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
            position: sticky;
            top: 0;
            z-index: 100;
          }
          .no-print-bar button {
            border: none;
            padding: 7px 16px;
            font-weight: 700;
            font-size: 12px;
            cursor: pointer;
            border-radius: 6px;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            transition: all 0.2s;
          }
          .btn-print { background: #fbbf24; color: #0f172a; }
          .btn-print:hover { background: #f59e0b; }
          .btn-close { background: #334155; color: #ffffff; }
          .btn-close:hover { background: #475569; }

          .cert-page {
            width: 210mm;
            min-height: 297mm;
            max-height: 297mm;
            padding: 8mm 10mm;
            margin: 12px auto;
            background: #ffffff;
            box-sizing: border-box;
            box-shadow: 0 10px 25px -5px rgba(0,0,0,0.15);
            page-break-after: always;
            break-after: page;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            position: relative;
          }
          .cert-page:last-child {
            page-break-after: avoid;
            break-after: avoid;
            margin-bottom: 24px;
          }
          .border-frame {
            border: 2.5px double #1e3a8a;
            padding: 8px 10px;
            height: 100%;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            box-sizing: border-box;
          }

          /* Encabezado Oficial */
          .header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 2px solid #1e3a8a;
            padding-bottom: 6px;
            gap: 10px;
          }
          .logo-box img {
            width: 58px;
            height: 58px;
            object-fit: contain;
          }
          .header-center {
            text-align: center;
            flex-grow: 1;
          }
          .header-center h1 {
            margin: 0;
            font-size: 13.5pt;
            text-transform: uppercase;
            color: #1e3a8a;
            letter-spacing: 0.8px;
            font-weight: 800;
          }
          .header-center h2 {
            margin: 2px 0 1px 0;
            font-size: 9.5pt;
            color: #b45309;
            font-weight: 700;
            letter-spacing: 0.5px;
          }
          .header-center p {
            margin: 0;
            font-size: 6.8pt;
            color: #475569;
            line-height: 1.2;
          }
          .header-right {
            text-align: right;
            font-size: 7.2pt;
            color: #1e293b;
            min-width: 140px;
            border-left: 1px solid #cbd5e1;
            padding-left: 8px;
          }
          .badge-codigo {
            display: inline-block;
            background: #0f172a;
            color: #f8fafc;
            font-family: monospace;
            font-weight: bold;
            font-size: 7.5pt;
            padding: 2px 6px;
            border-radius: 3px;
            margin-top: 2px;
          }

          /* Títulos de sección */
          .sec-header {
            background: #f1f5f9;
            border-left: 4px solid #1e3a8a;
            padding: 3px 6px;
            font-size: 8pt;
            font-weight: 700;
            color: #1e3a8a;
            text-transform: uppercase;
            margin: 5px 0 4px 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .sec-header span.tag {
            font-size: 6.5pt;
            background: #e2e8f0;
            padding: 1px 5px;
            border-radius: 3px;
            color: #475569;
          }

          /* Grillas y tarjetas */
          .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; }
          .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
          .grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px; }

          .data-box {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 3px;
            padding: 3px 5px;
            font-size: 7.5pt;
          }
          .data-box .lbl {
            display: block;
            font-size: 6.2pt;
            text-transform: uppercase;
            color: #64748b;
            font-weight: 600;
            margin-bottom: 1px;
          }
          .data-box .val {
            font-weight: 700;
            color: #0f172a;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          /* Árbol Genealógico 3 Generaciones */
          .pedigree-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 2px;
            font-size: 6.8pt;
          }
          .pedigree-table th {
            background: #e2e8f0;
            color: #1e3a8a;
            padding: 2px 4px;
            font-size: 6.8pt;
            text-align: left;
            border: 1px solid #cbd5e1;
          }
          .pedigree-table td {
            border: 1px solid #cbd5e1;
            padding: 2px 3px;
            vertical-align: middle;
          }
          .ped-box {
            padding: 2px 4px;
            border-radius: 3px;
            line-height: 1.15;
          }
          .ped-macho {
            background-color: #f0f9ff;
            border-left: 3px solid #0284c7;
          }
          .ped-hembra {
            background-color: #fdf2f8;
            border-left: 3px solid #db2777;
          }
          .ped-vacio {
            background-color: #f8fafc;
            border-left: 3px dashed #94a3b8;
            color: #64748b;
          }
          .ped-rol { font-weight: bold; color: #475569; font-size: 6pt; text-transform: uppercase; display: block; }
          .ped-anilla { font-weight: 700; font-family: monospace; font-size: 7pt; color: #0f172a; }
          .ped-nom { font-style: italic; color: #334155; font-size: 6.4pt; }
          .ped-sub { font-size: 6pt; color: #64748b; display: block; }

          /* Baremo e Inspección */
          .table-baremo {
            width: 100%;
            border-collapse: collapse;
            font-size: 6.8pt;
            margin-top: 2px;
          }
          .table-baremo th, .table-baremo td {
            border: 1px solid #cbd5e1;
            padding: 2px 5px;
          }
          .table-baremo th {
            background: #f1f5f9;
            color: #1e293b;
            font-weight: bold;
            text-align: left;
          }
          .table-baremo .pts {
            text-align: right;
            font-weight: 700;
            font-family: monospace;
          }
          .table-baremo .row-total {
            background: #e2e8f0;
            font-weight: 800;
            font-size: 7.2pt;
          }

          .veredicto-ribbon {
            margin-top: 4px;
            padding: 4px 8px;
            border-radius: 3px;
            text-align: center;
            font-size: 7.5pt;
            font-weight: 800;
            letter-spacing: 0.5px;
            text-transform: uppercase;
          }
          .veredicto-apto {
            background: #dcfce7;
            color: #166534;
            border: 1.5px solid #22c55e;
          }
          .veredicto-noapto {
            background: #fee2e2;
            color: #991b1b;
            border: 1.5px solid #ef4444;
          }

          /* Control de Puesta */
          .puesta-card {
            background: #fffbeb;
            border: 1px solid #fde68a;
            border-radius: 3px;
            padding: 4px 6px;
            font-size: 6.8pt;
            margin-top: 3px;
          }

          /* Página 2: Cuadrícula Fotográfica */
          .grid-fotos {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 8px;
            margin-top: 6px;
          }
          .foto-card {
            border: 1.5px solid #cbd5e1;
            border-radius: 4px;
            overflow: hidden;
            background: #0f172a;
            display: flex;
            flex-direction: column;
          }
          .foto-card img {
            width: 100%;
            height: 145px;
            object-fit: cover;
            display: block;
            background: #1e293b;
          }
          .foto-footer {
            padding: 3px 5px;
            background: #ffffff;
            border-top: 1px solid #e2e8f0;
            font-size: 6.6pt;
          }
          .foto-footer strong {
            display: block;
            color: #1e3a8a;
            text-transform: uppercase;
            font-size: 6.8pt;
          }

          /* Galería opcional */
          .grid-galeria {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 6px;
            margin-top: 4px;
          }
          .gal-card img {
            width: 100%;
            height: 95px;
            object-fit: cover;
            display: block;
            background: #1e293b;
          }

          /* Diligencia y Firmas */
          .legal-clause {
            font-size: 6.4pt;
            color: #475569;
            text-align: justify;
            line-height: 1.25;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            padding: 5px 8px;
            border-radius: 3px;
            margin-top: 6px;
          }
          .signatures-grid {
            display: grid;
            grid-template-columns: 1fr 125px 1fr;
            gap: 12px;
            align-items: center;
            margin-top: 10px;
            text-align: center;
            font-size: 7pt;
          }
          .sign-box {
            border-top: 1px dashed #64748b;
            padding-top: 4px;
            min-height: 48px;
            display: flex;
            flex-direction: column;
            justify-content: flex-end;
          }
          .sign-box strong { color: #0f172a; font-size: 7.2pt; }
          .qr-container {
            text-align: center;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
          }
          .qr-container img {
            width: 96px;
            height: 96px;
            border: 1px solid #cbd5e1;
            padding: 2px;
            background: #ffffff;
            border-radius: 3px;
          }
          .qr-caption {
            font-size: 5.8pt;
            color: #64748b;
            margin-top: 2px;
            font-weight: bold;
          }

          .cert-footer {
            font-size: 6pt;
            color: #94a3b8;
            display: flex;
            justify-content: space-between;
            border-top: 1px solid #f1f5f9;
            padding-top: 3px;
            margin-top: 4px;
          }

          @media print {
            body { background: #ffffff !important; }
            .no-print-bar { display: none !important; }
            .cert-page {
              margin: 0 !important;
              box-shadow: none !important;
              page-break-after: always !important;
              break-after: page !important;
            }
          }
        </style>
      </head>
      <body>
        <div class="no-print-bar">
          <div>
            <strong>📜 CERTIFICADO ZOOTÉCNICO OFICIAL GENERADO (ESGA025)</strong> · 
            <span style="color:#fde047;">Ejemplar #${anillaLimpia} (${animal.codigo_identificacion})</span>
          </div>
          <div style="display:flex; gap:8px;">
            <button class="btn-print" onclick="window.print()">
              🖨️ Imprimir / Guardar en PDF (A4)
            </button>
            <button class="btn-close" onclick="window.close()">
              ✕ Cerrar Ventana
            </button>
          </div>
        </div>

        <!-- ================================================================= -->
        <!-- PÁGINA 1: IDENTIFICACIÓN, CRIADOR, PEDIGRÍ 3GEN, BAREMO Y PUESTA   -->
        <!-- ================================================================= -->
        <div class="cert-page" id="cert-page-1">
          <div class="border-frame">
            <div>
              <!-- Cabecera Oficial -->
              <div class="header">
                <div class="logo-box">
                  <img src="${logoBase64}" alt="Escudo Oficial Club Gallina Alacantina">
                </div>
                <div class="header-center">
                  <h1>Club Gallina Alacantina</h1>
                  <h2>Libro Genealógico Oficial (Código ESGA025)</h2>
                  <p>
                    Reconocimiento oficial conforme al Reglamento (UE) 2016/1012 del Parlamento Europeo y del Consejo<br>
                    Real Decreto 45/2019 de 8 de febrero y Protocolo CNZ (5 de junio de 2025)
                  </p>
                  <p style="font-weight: bold; color: #1e3a8a; margin-top: 2px; font-size: 7.8pt;">
                    CERTIFICADO ZOOTÉCNICO OFICIAL DE INSCRIPCIÓN Y CARTA GENEALÓGICA
                  </p>
                </div>
                <div class="header-right">
                  <strong>Ref. Doc.:</strong><br>
                  <span class="badge-codigo">${codigoDoc}</span><br>
                  <strong>Emisión:</strong> ${fechaEmision}<br>
                  <span style="color:#15803d; font-weight:bold;">● Auténtico ESGA025</span>
                </div>
              </div>

              <!-- Bloque 1: Identificación del Ejemplar -->
              <div class="sec-header">
                <span>1. Identificación Oficial del Ejemplar (Protocolo CNZ 2025)</span>
                <span class="tag">Sección: ${animal.seccion_libro} - ${this.getNombreSeccion(animal.seccion_libro)}</span>
              </div>
              <div class="grid-4">
                <div class="data-box">
                  <span class="lbl">Nº Anilla Oficial (EE)</span>
                  <span class="val" style="color:#1e3a8a;">#${anillaLimpia} (${animal.calibre_anilla_mm || (animal.sexo === 'Macho' ? 20 : 18)} mm)</span>
                </div>
                <div class="data-box">
                  <span class="lbl">Código Identificación</span>
                  <span class="val font-mono">${animal.codigo_identificacion}</span>
                </div>
                <div class="data-box">
                  <span class="lbl">Nombre / Alias</span>
                  <span class="val">${animal.nombre || 'Sin nombre asignado'}</span>
                </div>
                <div class="data-box">
                  <span class="lbl">Sexo & Especie</span>
                  <span class="val" style="color:${animal.sexo === 'Macho' ? '#0284c7' : '#db2777'};">
                    ${animal.sexo === 'Macho' ? '♂ Macho (Gallo)' : '♀ Hembra (Gallina)'} · Gallus gallus
                  </span>
                </div>
                <div class="data-box">
                  <span class="lbl">Variedad Morfológica</span>
                  <span class="val">${animal.variedad || 'Moteada / Exchequer'}</span>
                </div>
                <div class="data-box">
                  <span class="lbl">Fecha Nacimiento</span>
                  <span class="val">${animal.fecha_nacimiento || 'No registrada'}</span>
                </div>
                <div class="data-box">
                  <span class="lbl">Peso Vivo Actual</span>
                  <span class="val">${animal.peso_actual_kg ? Number(animal.peso_actual_kg).toFixed(3) + ' kg' : 'N/D'}</span>
                </div>
                <div class="data-box">
                  <span class="lbl">Familia / Lote (Gobe)</span>
                  <span class="val">${animal.familia_origen || 'Familia A'}</span>
                </div>
              </div>
              <div class="grid-2" style="margin-top: 3px;">
                <div class="data-box">
                  <span class="lbl">Estado Zootécnico Oficial</span>
                  <span class="val" style="color:#1e3a8a;">${estadoZootecnico}</span>
                </div>
                <div class="data-box">
                  <span class="lbl">Coeficiente de Consanguinidad de Wright (Fx)</span>
                  <span class="val" style="color:${fxInfo.color};">
                    ${(fxVal * 100).toFixed(3)}% (Fx = ${fxVal.toFixed(5)}) · ${fxInfo.texto}
                  </span>
                </div>
              </div>

              <!-- Bloque 2: Explotación Ganadera y Criador -->
              <div class="sec-header" style="margin-top:5px;">
                <span>2. Explotación Ganadera de Origen y Criador Asociado</span>
                <span class="tag">REGA: ${rega}</span>
              </div>
              <div class="grid-3">
                <div class="data-box">
                  <span class="lbl">Titular / Criador</span>
                  <span class="val">${titular}</span>
                </div>
                <div class="data-box">
                  <span class="lbl">Nº Socio Club / Criadero</span>
                  <span class="val">${socio} · ${criadero}</span>
                </div>
                <div class="data-box">
                  <span class="lbl">Código REGA Oficial</span>
                  <span class="val font-mono">${rega}</span>
                </div>
                <div class="data-box">
                  <span class="lbl">Municipio & Provincia</span>
                  <span class="val">${municipio} (${provincia})</span>
                </div>
                <div class="data-box" style="grid-column: span 2;">
                  <span class="lbl">Geolocalización GPS Oficial</span>
                  <span class="val font-mono" style="color:#15803d;">🛰️ ${gpsTxt}</span>
                </div>
              </div>

              <!-- Bloque 3: Árbol Genealógico 3 Generaciones -->
              <div class="sec-header" style="margin-top:5px;">
                <span>3. Árbol Genealógico Oficial de Ancestros (3 Generaciones de Ascendientes)</span>
                <span class="tag">Pedigrí Oficial ESGA025</span>
              </div>
              <table class="pedigree-table">
                <thead>
                  <tr>
                    <th style="width: 28%;">Padres (1ª Generación)</th>
                    <th style="width: 34%;">Abuelos (2ª Generación)</th>
                    <th style="width: 38%;">Bisabuelos (3ª Generación)</th>
                  </tr>
                </thead>
                <tbody>
                  <!-- Rama Paterna -->
                  <tr>
                    <td rowspan="4" class="ped-macho" style="vertical-align: middle;">
                      ${celdaAncestral(ancestros.padre, 'PADRE', 'Ascendente Base', 'ped-macho')}
                    </td>
                    <td rowspan="2" class="ped-macho" style="vertical-align: middle;">
                      ${celdaAncestral(ancestros.abuelo_pp, 'ABUELO PAT. (PP)', 'Ascendente Base', 'ped-macho')}
                    </td>
                    <td>${celdaAncestral(ancestros.bis_ppp, 'BISABUELO (PPP)', 'Línea Fundacional', 'ped-macho')}</td>
                  </tr>
                  <tr>
                    <td>${celdaAncestral(ancestros.bis_ppm, 'BISABUELA (PPM)', 'Línea Fundacional', 'ped-hembra')}</td>
                  </tr>
                  <tr>
                    <td rowspan="2" class="ped-hembra" style="vertical-align: middle;">
                      ${celdaAncestral(ancestros.abuela_pm, 'ABUELA PAT. (PM)', 'Ascendente Base', 'ped-hembra')}
                    </td>
                    <td>${celdaAncestral(ancestros.bis_pmp, 'BISABUELO (PMP)', 'Línea Fundacional', 'ped-macho')}</td>
                  </tr>
                  <tr>
                    <td>${celdaAncestral(ancestros.bis_pmm, 'BISABUELA (PMM)', 'Línea Fundacional', 'ped-hembra')}</td>
                  </tr>

                  <!-- Rama Materna -->
                  <tr>
                    <td rowspan="4" class="ped-hembra" style="vertical-align: middle;">
                      ${celdaAncestral(ancestros.madre, 'MADRE', 'Ascendente Base', 'ped-hembra')}
                    </td>
                    <td rowspan="2" class="ped-macho" style="vertical-align: middle;">
                      ${celdaAncestral(ancestros.abuelo_mp, 'ABUELO MAT. (MP)', 'Ascendente Base', 'ped-macho')}
                    </td>
                    <td>${celdaAncestral(ancestros.bis_mpp, 'BISABUELO (MPP)', 'Línea Fundacional', 'ped-macho')}</td>
                  </tr>
                  <tr>
                    <td>${celdaAncestral(ancestros.bis_mpm, 'BISABUELA (MPM)', 'Línea Fundacional', 'ped-hembra')}</td>
                  </tr>
                  <tr>
                    <td rowspan="2" class="ped-hembra" style="vertical-align: middle;">
                      ${celdaAncestral(ancestros.abuela_mm, 'ABUELA MAT. (MM)', 'Ascendente Base', 'ped-hembra')}
                    </td>
                    <td>${celdaAncestral(ancestros.bis_mmp, 'BISABUELO (MMP)', 'Línea Fundacional', 'ped-macho')}</td>
                  </tr>
                  <tr>
                    <td>${celdaAncestral(ancestros.bis_mmm, 'BISABUELA (MMM)', 'Línea Fundacional', 'ped-hembra')}</td>
                  </tr>
                </tbody>
              </table>

              <!-- Bloque 4: Evaluación Morfológica (100 Puntos) y Control de Puesta -->
              <div class="sec-header" style="margin-top:5px;">
                <span>4. Evaluación Morfológica (Baremo Oficial 100 Puntos) & Rendimiento</span>
                <span class="tag">Protocolo CNZ 5 de junio de 2025</span>
              </div>
              <div class="grid-2">
                <div>
                  <table class="table-baremo">
                    <thead>
                      <tr>
                        <th>Región Anatómica Evaluada</th>
                        <th style="width: 45px; text-align:right;">Máx</th>
                        <th style="width: 45px; text-align:right;">Puntos</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>1. Cabeza, cresta y cara (5-6 dientes, orejilla blanca)</td>
                        <td class="pts" style="color:#64748b;">15 p</td>
                        <td class="pts">${insp ? (insp.cabeza_cresta_cara || 0) : '--'}</td>
                      </tr>
                      <tr>
                        <td>2. Cuello y esclavina (Abundante, sin flameado)</td>
                        <td class="pts" style="color:#64748b;">10 p</td>
                        <td class="pts">${insp ? (insp.cuello_esclavina || 0) : '--'}</td>
                      </tr>
                      <tr>
                        <td>3. Pecho y tronco (Pecho plano/recto NO prominente)</td>
                        <td class="pts" style="color:#64748b;">20 p</td>
                        <td class="pts">${insp ? (insp.pecho_tronco || 0) : '--'}</td>
                      </tr>
                      <tr>
                        <td>4. Cola y porte (Cola erguida a 70º sobre horizontal)</td>
                        <td class="pts" style="color:#64748b;">20 p</td>
                        <td class="pts">${insp ? (insp.cola_porte || 0) : '--'}</td>
                      </tr>
                      <tr>
                        <td>5. Extremidades y tarsos (Blanco rosáceo, 4 dedos)</td>
                        <td class="pts" style="color:#64748b;">15 p</td>
                        <td class="pts">${insp ? (insp.extremidades_tarsos || 0) : '--'}</td>
                      </tr>
                      <tr>
                        <td>6. Plumaje y variedad (Moteado homogéneo y brillo)</td>
                        <td class="pts" style="color:#64748b;">10 p</td>
                        <td class="pts">${insp ? (insp.plumaje_variedad || 0) : '--'}</td>
                      </tr>
                      <tr>
                        <td>7. Peso y desarrollo (Conforme estándar oficial)</td>
                        <td class="pts" style="color:#64748b;">10 p</td>
                        <td class="pts">${insp ? (insp.peso_desarrollo || 0) : '--'}</td>
                      </tr>
                      <tr class="row-total">
                        <td>TOTAL BAREMO BAREMADO (100 PUNTOS)</td>
                        <td class="pts">100</td>
                        <td class="pts" style="color:#1e3a8a;">${insp ? (insp.puntuacion_total || 0) : '--'} p</td>
                      </tr>
                    </tbody>
                  </table>
                  
                  ${insp ? `
                    <div class="veredicto-ribbon ${insp.descalificado || (insp.puntuacion_total < 70) ? 'veredicto-noapto' : 'veredicto-apto'}">
                      CALIFICACIÓN: ${insp.calificacion.toUpperCase()} (${insp.puntuacion_total} / 100 pts)
                      ${insp.puntuacion_total >= 70 && !insp.descalificado ? '— ACCEDE AL REGISTRO DEFINITIVO (RD)' : '— NO APTO'}
                    </div>
                  ` : `
                    <div class="veredicto-ribbon" style="background:#f1f5f9; color:#475569; border:1px solid #cbd5e1;">
                      EJEMPLAR PENDIENTE DE CALIFICACIÓN MORFOLÓGICA OFICIAL IN SITU
                    </div>
                  `}
                </div>

                <div>
                  <!-- Control Oficial de Puesta -->
                  <div class="puesta-card">
                    <strong style="color:#b45309; text-transform:uppercase; display:block; margin-bottom:2px;">
                      🥚 Control Oficial de Rendimiento y Puesta (Prueba 15 Días CNZ):
                    </strong>
                    ${animal.sexo === 'Macho' ? `
                      <p style="margin:2px 0; color:#64748b; font-style:italic;">
                        No aplicable por dimorfismo sexual (Ejemplar Macho Reproductor). Apto por genealogía y valoración morfológica.
                      </p>
                    ` : puesta ? `
                      <div style="display:grid; grid-template-columns:1fr 1fr; gap:3px; margin-top:2px;">
                        <div><strong>Periodo:</strong> ${puesta.fecha_inicio} a ${puesta.fecha_fin}</div>
                        <div><strong>Total Huevos (15d):</strong> ${puesta.total_huevos_15d} u</div>
                        <div><strong>Peso Medio:</strong> ${puesta.peso_medio_huevo_g} g (55-70g)</div>
                        <div><strong>Color Cáscara:</strong> ${puesta.color_cascara || 'Blanco crema'}</div>
                      </div>
                      <div style="margin-top:3px; font-weight:bold; color:${puesta.conforme_estandar ? '#15803d' : '#dc2626'};">
                        ● ${puesta.conforme_estandar ? 'CONFORME CON EL ESTÁNDAR RACIAL OFICIAL' : 'NO SUPERA EL CONTROL DE PUESTA'}
                      </div>
                    ` : `
                      <p style="margin:2px 0; color:#64748b; font-style:italic;">
                        Pendiente de ejecución de la prueba individual estandarizada de puesta (15 días consecutivos).
                      </p>
                    `}
                  </div>

                  <!-- Datos de Inspección -->
                  <div class="data-box" style="margin-top:4px;">
                    <span class="lbl">Auditoría de Calificación Oficial</span>
                    <span class="val">
                      ${insp
                        ? `Calificador: ${inspectorNombreDinamico || 'Inspector Acreditado'}${inspectorIdDinamico ? ` (${inspectorIdDinamico})` : ''} · Fecha: ${insp.fecha_inspeccion}`
                        : (inspectorNombreDinamico
                            ? `Inspector Asignado: ${inspectorNombreDinamico}${inspectorIdDinamico ? ` (${inspectorIdDinamico})` : ''}`
                            : 'Pendiente de asignación de Calificador Zootécnico')
                      }
                    </span>
                    <p style="margin:2px 0 0 0; font-size:6.2pt; color:#64748b; font-style:italic;">
                      ${insp?.observaciones ? `"${insp.observaciones}"` : 'Sin defectos descalificables observados en la morfología reglamentaria.'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div class="cert-footer">
              <span>Club Gallina Alacantina (ESGA025) · Libro Genealógico Oficial</span>
              <span>Página 1 de 2 · Certificado Zootécnico Oficial</span>
              <span>Continúa en Anexo Fotográfico & Auditoría Visual ➔</span>
            </div>
          </div>
        </div>

        <!-- ================================================================= -->
        <!-- PÁGINA 2: ANEXO FOTOGRÁFICO, GALERÍA, DILIGENCIA Y FIRMAS          -->
        <!-- ================================================================= -->
        <div class="cert-page" id="cert-page-2">
          <div class="border-frame">
            <div>
              <!-- Cabecera reducida página 2 -->
              <div class="header">
                <div class="logo-box">
                  <img src="${logoBase64}" alt="Escudo Oficial Club Gallina Alacantina">
                </div>
                <div class="header-center">
                  <h1 style="font-size:12pt;">Club Gallina Alacantina (ESGA025)</h1>
                  <h2 style="font-size:9pt; color:#1e3a8a;">ANEXO FOTOGRÁFICO Y AUDITORÍA ZOOTÉCNICA IN SITU</h2>
                  <p>Documento complementario e indivisible del Certificado Zootécnico Oficial · Ref: ${codigoDoc}</p>
                </div>
                <div class="header-right">
                  <strong>Ejemplar:</strong> #${anillaLimpia}<br>
                  <strong>Identif:</strong> ${animal.codigo_identificacion}<br>
                  <span style="color:#15803d; font-weight:bold;">Secc. ${animal.seccion_libro}</span>
                </div>
              </div>

              <!-- Bloque 5: Las 3 Tomas Obligatorias del Protocolo CNZ -->
              <div class="sec-header" style="margin-top:6px;">
                <span>5. Fotografías Zootécnicas Obligatorias in situ (Protocolo CNZ 5 de junio de 2025)</span>
                <span class="tag">Auditoría Visual Morfológica</span>
              </div>
              <div class="grid-fotos">
                <!-- Toma 1: Lateral -->
                <div class="foto-card">
                  <img src="${fotoLateral}" alt="Toma Lateral Oficial">
                  <div class="foto-footer">
                    <strong>1. Vista Lateral Completa</strong>
                    Silueta corporal, pecho recto/plano y cola a 70º sobre la horizontal.
                  </div>
                </div>
                <!-- Toma 2: Cabeza -->
                <div class="foto-card">
                  <img src="${fotoCabeza}" alt="Toma Cabeza Oficial">
                  <div class="foto-footer">
                    <strong>2. Cabeza, Cresta y Orejilla</strong>
                    Cresta simple 5-6 dientes, orejillas blanco puro y pico córneo.
                  </div>
                </div>
                <!-- Toma 3: Tarsos -->
                <div class="foto-card">
                  <img src="${fotoTarsos}" alt="Toma Tarsos Oficial">
                  <div class="foto-footer">
                    <strong>3. Extremidades y Tarsos</strong>
                    Color blanco rosáceo impecable, 4 dedos limpios sin plumas.
                  </div>
                </div>
              </div>

              <!-- Galería Opcional / Tomas Complementarias -->
              ${galeriaProcesada.length > 0 ? `
                <div class="sec-header" style="margin-top:8px;">
                  <span>Tomas Complementarias Destacadas (Galería de Auditoría)</span>
                  <span class="tag">${galeriaProcesada.length} fotografía(s) de detalle</span>
                </div>
                <div class="grid-galeria">
                  ${galeriaProcesada.map(g => `
                    <div class="foto-card gal-card">
                      <img src="${g.b64}" alt="${g.titulo}">
                      <div class="foto-footer" style="padding:2px 4px;">
                        <strong style="font-size:6.2pt; text-transform:none;">${g.titulo}</strong>
                      </div>
                    </div>
                  `).join('')}
                </div>
              ` : ''}

              <!-- Bloque 6: Diligencia de Expedición y Validez Jurídica -->
              <div class="sec-header" style="margin-top:8px;">
                <span>6. Diligencia Oficial de Inscripción, Verificación Electrónica y Validez Jurídica</span>
                <span class="tag">ESGA025 / MAPA</span>
              </div>
              <div class="legal-clause">
                <strong>DILIGENCIA FORMAL DE CERTIFICACIÓN ZOOTÉCNICA:</strong> 
                La Dirección del Libro Genealógico Oficial de la Gallina Alacantina (Código Oficial ESGA025) certifica que el ejemplar reseñado en este documento cumple estrictamente con las determinaciones genealógicas, morfológicas y sanitarias contempladas en el Programa de Cría oficialmente aprobado, en el Protocolo de la Comisión Nacional de Zootecnia de 5 de junio de 2025, en el Real Decreto 45/2019 de 8 de febrero y en el Reglamento (UE) 2016/1012 del Parlamento Europeo y del Consejo relativo a las condiciones zootécnicas y genealógicas para la cría. Queda terminantemente prohibida cualquier alteración física, omisión de datos o manipulación digital de este certificado.
              </div>

              <!-- Espacio para Firmas Oficiales y Código QR -->
              <div class="signatures-grid">
                <!-- Firma Criador -->
                <div class="sign-box">
                  <strong>D./Dña. ${titular}</strong>
                  <span style="font-size:6.2pt; color:#64748b;">Firma y Sello del Titular / Criador Asociado<br>Explotación REGA: ${rega}</span>
                </div>

                <!-- Código QR Interactivo de Validación -->
                <div class="qr-container">
                  <a href="${urlVerificacion}" target="_blank" title="Validar Certificado Electrónicamente">
                    <img src="${qrDataUrl}" alt="Código QR de Validación Electrónica Oficial">
                  </a>
                  <span class="qr-caption">VALIDACIÓN QR OFICIAL</span>
                  <span style="font-size:5.5pt; color:#94a3b8; font-family:monospace;">ESGA025-SEC-VERIF</span>
                </div>

                <!-- Firma Inspector / Calificador Zootécnico Dinámica -->
                <div class="sign-box">
                  ${firmaInspectorBase64
                    ? `<img src="${firmaInspectorBase64}" alt="Firma Digital Inspector" style="max-height:36px; max-width:140px; margin:0 auto 2px auto; object-fit:contain; display:block;">`
                    : ''
                  }
                  <strong>${inspectorNombreDinamico || 'Inspector Zootécnico Pendiente'}</strong>
                  <span style="font-size:6.2pt; color:#64748b;">
                    ${inspectorIdDinamico ? `ID / DNI Acreditación: ${inspectorIdDinamico}<br>` : ''}Inspector / Calificador Zootécnico Oficial (ESGA025)
                  </span>
                </div>
              </div>
            </div>

            <div class="cert-footer">
              <span>Club Gallina Alacantina (ESGA025) · Registro Genealógico Nacional</span>
              <span>Página 2 de 2 · Fin del Certificado Zootécnico Oficial</span>
              <span>Validez permanente con anilla reglamentaria Entente Europea</span>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  },

  /**
   * Genera y descarga directamente el archivo PDF con nombre estandarizado:
   * Certificado_ESGA025_[ANILLA].pdf
   * Si la librería html2pdf está disponible la utiliza; en su defecto abre la ventana de impresión A4 estilizada.
   */
  async descargarCertificadoZootecnicoPDF(animal, datosExtra = {}) {
    const anillaLimpia = (animal.numero_anilla || 'SIN_ANILLA').toString().trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    const nombreArchivo = `Certificado_ESGA025_${anillaLimpia}.pdf`;

    // 1. Maquetar HTML completo con imágenes en Base64
    const htmlContent = await this.construirHtmlCertificado(animal, datosExtra);

    // 2. Si html2pdf está cargado, intentar exportación directa en cliente
    if (window.html2pdf) {
      try {
        console.log(`[PDFEngine] Iniciando generación cliente de ${nombreArchivo}...`);
        const tempContainer = document.createElement('div');
        tempContainer.id = 'temp-pdf-export-container';
        tempContainer.style.position = 'fixed';
        tempContainer.style.left = '-9999px';
        tempContainer.style.top = '0';
        tempContainer.style.width = '210mm';
        tempContainer.style.background = '#ffffff';
        tempContainer.style.zIndex = '-9999';

        // Extraer el contenido interior del body
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlContent, 'text/html');
        const paginas = doc.querySelectorAll('.cert-page');

        paginas.forEach(p => tempContainer.appendChild(p));
        document.body.appendChild(tempContainer);

        const opt = {
          margin: 0,
          filename: nombreArchivo,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            logging: false,
            letterRendering: true,
            scrollY: 0,
            scrollX: 0
          },
          jsPDF: {
            unit: 'mm',
            format: 'a4',
            orientation: 'portrait'
          },
          pagebreak: { mode: ['css', 'legacy'] }
        };

        await window.html2pdf().set(opt).from(tempContainer).save();
        tempContainer.remove();
        console.log(`[PDFEngine] Archivo descargado exitosamente: ${nombreArchivo}`);
        return { exito: true, metodo: 'html2pdf', nombreArchivo };
      } catch (err) {
        console.warn('[PDFEngine] Error en exportación directa html2pdf, recurriendo a ventana de impresión A4:', err);
        const el = document.getElementById('temp-pdf-export-container');
        if (el) el.remove();
      }
    }

    // 3. Ventana de impresión A4 estilizada con auto-print y fallback
    this.abrirVentanaImpresionDirecta(htmlContent, nombreArchivo);
    return { exito: true, metodo: 'printWindow', nombreArchivo };
  },

  /**
   * Abre la ventana emergente optimizada para impresión en A4 y guardado PDF
   */
  abrirVentanaImpresionDirecta(htmlContent, nombreArchivo = 'Certificado_ESGA025.pdf') {
    const ventana = window.open('', '_blank');
    if (!ventana) {
      alert('Por favor, permite las ventanas emergentes en tu navegador para ver y descargar el Certificado Zootécnico Oficial.');
      return;
    }
    ventana.document.open();
    ventana.document.write(htmlContent);
    ventana.document.close();
  },

  /**
   * Método de compatibilidad retroactiva para Certificado Genealógico
   */
  async generarCertificadoGenealogico(animal, ancestros = {}) {
    return this.descargarCertificadoZootecnicoPDF(animal, { ancestros });
  },

  /**
   * Genera el Acta Oficial de Inspección y Calificación Morfológica (Baremo 100 puntos)
   */
  generarActaInspeccion(animal, inspeccion, inspectorPerfil = null) {
    const ventanaImpresion = window.open('', '_blank');
    if (!ventanaImpresion) {
      alert('Por favor, permite las ventanas emergentes para generar el Acta Oficial.');
      return;
    }

    const fechaHoy = new Date(inspeccion.fecha_inspeccion || Date.now()).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });

    const nombreInspector = inspeccion.calificador_oficial || inspectorPerfil?.nombre || 'Inspector Zootécnico';
    const idInspector = inspeccion.inspector_id || inspeccion.inspector_dni || inspectorPerfil?.dni || inspectorPerfil?.numero_socio || inspectorPerfil?.id || '';
    const firmaInspector = inspeccion.firma_inspector_base64 || inspectorPerfil?.firma_base64 || null;
    const titularNombre = inspeccion.titular_aviario || animal.titular_nombre || 'Titular de la Explotación';

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <title>Acta de Inspección Zootécnica - ${animal.codigo_identificacion}</title>
        <style>
          @page { size: A4 portrait; margin: 12mm; }
          body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #0f172a; margin: 0; padding: 10px; }
          .border-frame { border: 2px solid #0f172a; padding: 16px; min-height: 98vh; box-sizing: border-box; }
          .header { text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 12px; }
          .header h1 { margin: 0; font-size: 16pt; text-transform: uppercase; }
          .header h2 { margin: 4px 0; font-size: 11pt; color: #2563eb; }
          .table-baremo { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 9pt; }
          .table-baremo th, .table-baremo td { border: 1px solid #cbd5e1; padding: 6px 8px; }
          .table-baremo th { background-color: #f1f5f9; text-align: left; }
          .pts { text-align: right; font-weight: bold; }
          .total-row { background-color: #e2e8f0; font-size: 10pt; font-weight: bold; }
          .veredicto { margin-top: 16px; padding: 12px; border-radius: 6px; text-align: center; font-size: 13pt; font-weight: bold; }
          .veredicto-apto { background-color: #dcfce7; color: #166534; border: 2px solid #22c55e; }
          .veredicto-noapto { background-color: #fee2e2; color: #991b1b; border: 2px solid #ef4444; }
          .defectos-box { background: #fff1f2; border: 1px solid #fecdd3; padding: 8px 12px; margin-top: 10px; font-size: 8.5pt; }
        </style>
      </head>
      <body>
        <div style="background:#1e3a8a; color:#fff; padding:8px; text-align:center; margin-bottom:10px;">
          <button onclick="window.print()" style="background:#fbbf24; border:none; padding:5px 12px; font-weight:bold; cursor:pointer;">
            🖨️ Imprimir Acta Oficial
          </button>
        </div>
        <div class="border-frame">
          <div class="header">
            <h1>Libro Genealógico Gallina Alacantina (ESGA025)</h1>
            <h2>Acta Oficial de Calificación Morfológica y Calificación de Reproductores</h2>
            <p style="font-size:8pt; color:#64748b; margin:0;">Conforme al Baremo de 100 Puntos del Protocolo CNZ (5 de junio de 2025)</p>
          </div>

          <p><strong>Ejemplar Evaluado:</strong> ${animal.codigo_identificacion} | <strong>Anilla:</strong> ${animal.numero_anilla} | <strong>Sexo:</strong> ${animal.sexo} | <strong>Variedad:</strong> ${animal.variedad}</p>
          <p><strong>Fecha Inspección:</strong> ${fechaHoy} | <strong>Calificador / Inspector Oficial:</strong> ${nombreInspector}${idInspector ? ` (ID/DNI: ${idInspector})` : ''}</p>

          <table class="table-baremo">
            <thead>
              <tr>
                <th>Región Anatómica Evaluada</th>
                <th style="width:120px;">Máximo Baremado</th>
                <th style="width:120px;" class="pts">Puntuación Otorgada</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Cabeza, Cresta y Cara</strong> (Cresta simple 5-6 dientes, orejillas blancas, ojos rojos)</td>
                <td>15 puntos</td>
                <td class="pts">${inspeccion.cabeza_cresta_cara || 0} p</td>
              </tr>
              <tr>
                <td><strong>Cuello y Esclavina</strong> (Abundante, sin flameado en moteada)</td>
                <td>10 puntos</td>
                <td class="pts">${inspeccion.cuello_esclavina || 0} p</td>
              </tr>
              <tr>
                <td><strong>Pecho y Tronco</strong> (Pecho plano/recto NO prominente, dorso ancho)</td>
                <td>20 puntos</td>
                <td class="pts">${inspeccion.pecho_tronco || 0} p</td>
              </tr>
              <tr>
                <td><strong>Cola y Porte</strong> (Cola muy alta a 70º sobre la horizontal)</td>
                <td>20 puntos</td>
                <td class="pts">${inspeccion.cola_porte || 0} p</td>
              </tr>
              <tr>
                <td><strong>Extremidades y Tarsos</strong> (Tarsos blanco rosáceo, sin plumas)</td>
                <td>15 puntos</td>
                <td class="pts">${inspeccion.extremidades_tarsos || 0} p</td>
              </tr>
              <tr>
                <td><strong>Plumaje y Variedad</strong> (Diseño característico, brillo, homogeneidad)</td>
                <td>10 puntos</td>
                <td class="pts">${inspeccion.plumaje_variedad || 0} p</td>
              </tr>
              <tr>
                <td><strong>Peso y Desarrollo</strong> (Gallo 3.0-3.5kg / Gallina 2.2-2.6kg)</td>
                <td>10 puntos</td>
                <td class="pts">${inspeccion.peso_desarrollo || 0} p</td>
              </tr>
              <tr class="total-row">
                <td>PUNTUACIÓN TOTAL BAREMADA</td>
                <td>100 puntos</td>
                <td class="pts">${inspeccion.puntuacion_total || 0} / 100 p</td>
              </tr>
            </tbody>
          </table>

          ${inspeccion.descalificado ? `
            <div class="defectos-box">
              <strong>⚠️ MOTIVO DE DESCALIFICACIÓN ZOOTÉCNICA:</strong>
              Se ha detectado uno o más defectos graves descalificables según la normativa oficial de la raza ESGA025.
            </div>
          ` : ''}

          <div class="veredicto ${inspeccion.descalificado || (inspeccion.puntuacion_total < 70) ? 'veredicto-noapto' : 'veredicto-apto'}">
            CALIFICACIÓN OFICIAL: ${inspeccion.calificacion.toUpperCase()} 
            ${inspeccion.puntuacion_total >= 70 && !inspeccion.descalificado ? '— ACCEDE AL REGISTRO DEFINITIVO (RD)' : '— NO SUPERA LA PRUEBA DE APTITUD'}
          </div>

          <div style="margin-top:25px; display:grid; grid-template-columns:1fr 1fr; gap:30px; font-size:8.5pt; text-align:center;">
            <div style="border-top:1px solid #94a3b8; padding-top:6px; margin-top:35px;">
              ${firmaInspector ? `<img src="${firmaInspector}" alt="Firma Digital Inspector" style="max-height:48px; display:block; margin:0 auto 4px auto;">` : ''}
              Firma del Calificador / Inspector Zootécnico Oficial<br>
              <strong>${nombreInspector}${idInspector ? ` (${idInspector})` : ''}</strong>
            </div>
            <div style="border-top:1px solid #94a3b8; padding-top:6px; margin-top:35px;">
              Firma y Enterado del Titular de la Explotación<br>
              <strong>D./Dña. ${titularNombre}</strong>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    ventanaImpresion.document.open();
    ventanaImpresion.document.write(htmlContent);
    ventanaImpresion.document.close();
  }
};

window.PDFEngine = PDFEngine;
