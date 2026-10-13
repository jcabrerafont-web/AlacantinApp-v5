// ============================================================================
// ALACANTINAPP V5 - MOTOR DE DOCUMENTOS OFICIALES Y CERTIFICADOS (PDF ENGINE)
// Club Gallina Alacantina (ESGA025)
// ============================================================================

const PDFEngine = {
  /**
   * Genera el Certificado Genealógico Oficial de un ejemplar
   * Cumple con los requisitos del Reglamento UE 2016/1012 y RD 45/2019
   */
  generarCertificadoGenealogico(animal, ancestros = {}) {
    const ventanaImpresion = window.open('', '_blank');
    if (!ventanaImpresion) {
      alert('Por favor, permite las ventanas emergentes para generar el Certificado Genealógico Oficial.');
      return;
    }

    const fechaHoy = new Date().toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });

    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=130x130&data=${encodeURIComponent(
      `ESGA025|ANILLA:${animal.numero_anilla}|ID:${animal.codigo_identificacion}|SECC:${animal.seccion_libro}|SEXO:${animal.sexo}|FX:${(animal.coeficiente_consanguinidad || 0).toFixed(4)}`
    )}`;

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <title>Certificado Genealógico Oficial - ${animal.codigo_identificacion}</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 12mm;
          }
          body {
            font-family: 'Helvetica Neue', Arial, sans-serif;
            color: #0f172a;
            margin: 0;
            padding: 10px;
            background: #fff;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .border-frame {
            border: 3px double #1e3a8a;
            padding: 16px;
            min-height: 98vh;
            box-sizing: border-box;
            position: relative;
          }
          .header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 2px solid #1e3a8a;
            padding-bottom: 12px;
          }
          .logo-box img {
            height: 70px;
            width: auto;
          }
          .header-text {
            text-align: center;
            flex-grow: 1;
          }
          .header-text h1 {
            margin: 0;
            font-size: 17pt;
            text-transform: uppercase;
            color: #1e3a8a;
            letter-spacing: 1px;
          }
          .header-text h2 {
            margin: 3px 0;
            font-size: 11pt;
            color: #b45309;
            font-weight: 600;
          }
          .header-text p {
            margin: 0;
            font-size: 8pt;
            color: #64748b;
          }
          .official-badge {
            text-align: right;
            font-size: 8.5pt;
            color: #334155;
          }
          .section-title {
            background-color: #f1f5f9;
            border-left: 4px solid #1e3a8a;
            padding: 4px 8px;
            font-size: 9.5pt;
            font-weight: bold;
            margin: 12px 0 8px 0;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .grid-2 {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
            font-size: 9pt;
          }
          .grid-3 {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 8px;
            font-size: 8.5pt;
          }
          .data-item {
            background: #fafafa;
            border: 1px solid #e2e8f0;
            border-radius: 4px;
            padding: 5px 8px;
          }
          .data-item .label {
            font-size: 7.5pt;
            color: #64748b;
            text-transform: uppercase;
            display: block;
            margin-bottom: 2px;
          }
          .data-item .value {
            font-weight: 600;
            color: #0f172a;
          }
          /* Árbol en tabla */
          .pedigree-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 7.5pt;
            margin-top: 6px;
          }
          .pedigree-table th, .pedigree-table td {
            border: 1px solid #cbd5e1;
            padding: 4px 6px;
            text-align: left;
            vertical-align: middle;
          }
          .pedigree-table th {
            background-color: #e2e8f0;
            font-weight: bold;
            color: #1e293b;
          }
          .p-macho { background-color: #f0f9ff; border-left: 3px solid #0284c7 !important; }
          .p-hembra { background-color: #fdf2f8; border-left: 3px solid #db2777 !important; }
          
          .footer-sign {
            margin-top: 20px;
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 15px;
            text-align: center;
            font-size: 8pt;
          }
          .signature-box {
            border-top: 1px dashed #94a3b8;
            padding-top: 6px;
            margin-top: 40px;
          }
          .qr-box {
            text-align: center;
          }
          .qr-box img {
            width: 90px;
            height: 90px;
          }
          .legal-notice {
            margin-top: 15px;
            font-size: 7pt;
            color: #64748b;
            text-align: justify;
            border-top: 1px solid #e2e8f0;
            padding-top: 6px;
          }
          @media print {
            .no-print-bar { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="no-print-bar" style="background:#1e3a8a; color:#fff; padding:10px; text-align:center; margin-bottom:10px; font-size:12pt;">
          <strong>Certificado Genealógico Oficial Listo</strong> | 
          <button onclick="window.print()" style="background:#fbbf24; border:none; padding:6px 14px; font-weight:bold; cursor:pointer; border-radius:4px; margin-left:10px;">
            🖨️ Imprimir / Guardar en PDF
          </button>
        </div>

        <div class="border-frame">
          <div class="header">
            <div class="logo-box">
              <img src="./icons/logo.png" onerror="this.src='./icons/icon-192.png'" alt="Club Gallina Alacantina">
            </div>
            <div class="header-text">
              <h1>Club Gallina Alacantina</h1>
              <h2>Libro Genealógico Oficial (Código ESGA025)</h2>
              <p>Reconocido conforme al Real Decreto 45/2019 y Reglamento (UE) 2016/1012</p>
              <p style="font-weight: bold; margin-top: 2px;">CERTIFICADO ZOOTÉCNICO Y CARTA GENEALÓGICA</p>
            </div>
            <div class="official-badge">
              <strong>Ref. Reg.:</strong> ${animal.codigo_identificacion}<br>
              <strong>Emisión:</strong> ${fechaHoy}
            </div>
          </div>

          <div class="section-title">1. Identificación Oficial del Ejemplar (Protocolo CNZ 2025)</div>
          <div class="grid-3">
            <div class="data-item">
              <span class="label">Código Identificación</span>
              <span class="value">${animal.codigo_identificacion}</span>
            </div>
            <div class="data-item">
              <span class="label">Nº Anilla Oficial / Calibre</span>
              <span class="value">${animal.numero_anilla} (${animal.calibre_anilla_mm || (animal.sexo === 'Macho' ? '20 mm' : '18 mm')})</span>
            </div>
            <div class="data-item">
              <span class="label">Nombre / Alias</span>
              <span class="value">${animal.nombre || 'Sin nombre asignado'}</span>
            </div>
            <div class="data-item">
              <span class="label">Sexo / Especie</span>
              <span class="value">${animal.sexo} (Gallus gallus)</span>
            </div>
            <div class="data-item">
              <span class="label">Fecha Nacimiento</span>
              <span class="value">${animal.fecha_nacimiento || 'No registrada'}</span>
            </div>
            <div class="data-item">
              <span class="label">Variedad de Plumaje</span>
              <span class="value">${animal.variedad || 'Moteada / Exchequer'}</span>
            </div>
            <div class="data-item">
              <span class="label">Sección del Libro</span>
              <span class="value" style="color:#1e3a8a;">${animal.seccion_libro} - ${PDFEngine.getNombreSeccion(animal.seccion_libro)}</span>
            </div>
            <div class="data-item">
              <span class="label">Peso Vivo Actual</span>
              <span class="value">${animal.peso_actual_kg ? animal.peso_actual_kg + ' kg' : 'N/D'}</span>
            </div>
            <div class="data-item">
              <span class="label">Consanguinidad de Wright (Fx)</span>
              <span class="value" style="color:${(animal.coeficiente_consanguinidad || 0) > 0.0625 ? '#dc2626' : '#16a34a'};">
                ${((animal.coeficiente_consanguinidad || 0) * 100).toFixed(3)}% (Fx = ${(animal.coeficiente_consanguinidad || 0).toFixed(5)})
              </span>
            </div>
          </div>

          <div class="section-title">2. Explotación Ganadera y Origen</div>
          <div class="grid-3">
            <div class="data-item">
              <span class="label">Código REGA</span>
              <span class="value">${animal.codigo_rega || 'ES030140000001'}</span>
            </div>
            <div class="data-item">
              <span class="label">Titular / Criador</span>
              <span class="value">${animal.titular_nombre || 'Criador Asociado ESGA025'}</span>
            </div>
            <div class="data-item">
              <span class="label">Familia / Lote (Regla de Gobe)</span>
              <span class="value">${animal.familia_origen || 'Familia A'}</span>
            </div>
          </div>

          <div class="section-title">3. Genealogía y Ascendencia (3 Generaciones de Ascendientes)</div>
          <table class="pedigree-table">
            <thead>
              <tr>
                <th style="width: 25%;">Padres (1ª Gen)</th>
                <th style="width: 35%;">Abuelos (2ª Gen)</th>
                <th style="width: 40%;">Bisabuelos (3ª Gen)</th>
              </tr>
            </thead>
            <tbody>
              <!-- Rama Paterna -->
              <tr>
                <td rowspan="4" class="p-macho">
                  <strong>PADRE:</strong><br>
                  ${ancestros.padre ? `${ancestros.padre.numero_anilla} (${ancestros.padre.codigo_identificacion})<br><em>${ancestros.padre.nombre || ''}</em><br>Secc: ${ancestros.padre.seccion_libro}` : 'Ascendencia Base (RF/RA)'}
                </td>
                <td rowspan="2" class="p-macho">
                  <strong>ABUELO PAT.:</strong><br>
                  ${ancestros.abuelo_pp ? `${ancestros.abuelo_pp.numero_anilla} (${ancestros.abuelo_pp.codigo_identificacion})` : 'Ascendente Registrado'}
                </td>
                <td class="p-macho"><strong>BISABUELO:</strong> ${ancestros.bis_ppp?.numero_anilla || 'Línea Fundacional'}</td>
              </tr>
              <tr>
                <td class="p-hembra"><strong>BISABUELA:</strong> ${ancestros.bis_ppm?.numero_anilla || 'Línea Fundacional'}</td>
              </tr>
              <tr>
                <td rowspan="2" class="p-hembra">
                  <strong>ABUELA PAT.:</strong><br>
                  ${ancestros.abuela_pm ? `${ancestros.abuela_pm.numero_anilla} (${ancestros.abuela_pm.codigo_identificacion})` : 'Ascendente Registrado'}
                </td>
                <td class="p-macho"><strong>BISABUELO:</strong> ${ancestros.bis_pmp?.numero_anilla || 'Línea Fundacional'}</td>
              </tr>
              <tr>
                <td class="p-hembra"><strong>BISABUELA:</strong> ${ancestros.bis_pmm?.numero_anilla || 'Línea Fundacional'}</td>
              </tr>

              <!-- Rama Materna -->
              <tr>
                <td rowspan="4" class="p-hembra">
                  <strong>MADRE:</strong><br>
                  ${ancestros.madre ? `${ancestros.madre.numero_anilla} (${ancestros.madre.codigo_identificacion})<br><em>${ancestros.madre.nombre || ''}</em><br>Secc: ${ancestros.madre.seccion_libro}` : 'Ascendencia Base (RF/RA)'}
                </td>
                <td rowspan="2" class="p-macho">
                  <strong>ABUELO MAT.:</strong><br>
                  ${ancestros.abuelo_mp ? `${ancestros.abuelo_mp.numero_anilla} (${ancestros.abuelo_mp.codigo_identificacion})` : 'Ascendente Registrado'}
                </td>
                <td class="p-macho"><strong>BISABUELO:</strong> ${ancestros.bis_mpp?.numero_anilla || 'Línea Fundacional'}</td>
              </tr>
              <tr>
                <td class="p-hembra"><strong>BISABUELA:</strong> ${ancestros.bis_mpm?.numero_anilla || 'Línea Fundacional'}</td>
              </tr>
              <tr>
                <td rowspan="2" class="p-hembra">
                  <strong>ABUELA MAT.:</strong><br>
                  ${ancestros.abuela_mm ? `${ancestros.abuela_mm.numero_anilla} (${ancestros.abuela_mm.codigo_identificacion})` : 'Ascendente Registrado'}
                </td>
                <td class="p-macho"><strong>BISABUELO:</strong> ${ancestros.bis_mmp?.numero_anilla || 'Línea Fundacional'}</td>
              </tr>
              <tr>
                <td class="p-hembra"><strong>BISABUELA:</strong> ${ancestros.bis_mmm?.numero_anilla || 'Línea Fundacional'}</td>
              </tr>
            </tbody>
          </table>

          <div class="section-title">4. Validación Zootécnica y Certificación Oficial</div>
          <div class="footer-sign">
            <div class="signature-box">
              Firma y Sello del Criador Titular<br>
              <strong>${animal.titular_nombre || 'Titular de Explotación'}</strong>
            </div>
            <div class="qr-box">
              <img src="${qrUrl}" alt="Código QR Verificación">
              <div style="font-size:7pt; color:#64748b; margin-top:2px;">Verificación Electrónica ESGA025</div>
            </div>
            <div class="signature-box">
              Por la Dirección del Libro Genealógico<br>
              <strong>Secretaría Técnica / Calificador Oficial</strong>
            </div>
          </div>

          <div class="legal-notice">
            El presente documento certifica la inscripción formal en el Libro Genealógico de la Gallina Alacantina (ESGA025), de acuerdo con los criterios del Programa de Cría aprobado oficialmente, el Protocolo de la Comisión Nacional de Zootecnia de 5 de junio de 2025, el Real Decreto 45/2019 y el Reglamento (UE) 2016/1012 del Parlamento Europeo. Queda prohibida cualquier alteración física o digital de este certificado.
          </div>
        </div>
      </body>
      </html>
    `;

    ventanaImpresion.document.open();
    ventanaImpresion.document.write(htmlContent);
    ventanaImpresion.document.close();
  },

  /**
   * Genera el Acta Oficial de Inspección y Calificación Morfológica (Baremo 100 puntos)
   */
  generarActaInspeccion(animal, inspeccion) {
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
          <p><strong>Fecha Inspección:</strong> ${fechaHoy} | <strong>Calificador Oficial:</strong> ${inspeccion.calificador_oficial}</p>

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
              Firma del Calificador Zootécnico Oficial<br>
              <strong>${inspeccion.calificador_oficial}</strong>
            </div>
            <div style="border-top:1px solid #94a3b8; padding-top:6px; margin-top:35px;">
              Firma y Enterado del Titular de la Explotación<br>
              <strong>D./Dña. Titular Asociado</strong>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    ventanaImpresion.document.open();
    ventanaImpresion.document.write(htmlContent);
    ventanaImpresion.document.close();
  },

  getNombreSeccion(cod) {
    const nombres = {
      RF: 'Registro Fundacional',
      RA: 'Registro Auxiliar',
      RN: 'Registro de Nacimientos (Aspirante)',
      RD: 'Registro Definitivo',
      RM: 'Registro de Méritos'
    };
    return nombres[cod] || cod;
  }
};

window.PDFEngine = PDFEngine;
