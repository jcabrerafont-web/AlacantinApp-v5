# AlacantinApp v5 - Libro Genealógico Oficial (ESGA025)

Aplicación Web Progresiva (**PWA Offline-First**) desarrollada para el **Club Gallina Alacantina (Código Oficial ESGA025)**, garantizando el estricto cumplimiento del **Protocolo de la Comisión Nacional de Zootecnia (CNZ de 5 de junio de 2025)**, el **Real Decreto 45/2019** y el **Reglamento (UE) 2016/1012** del Parlamento Europeo.

---

## 🏛️ Marco Zootécnico y Parámetros Raciales (ESGA025)

- **Especie / Raza:** Gallina Alacantina (*Gallus gallus*, Código Oficial ESGA025).
- **Anillas Oficiales:**
  - **Gallo:** 20 mm.
  - **Gallina:** 18 mm.
- **Rangos de Peso de Reproductores Aprobados:**
  - **Gallo:** 3,000 kg – 3,500 kg.
  - **Gallina:** 2,200 kg – 2,600 kg.
- **Caracteres Morfológicos Clave del Estándar:**
  - Pecho recto/plano (**NO prominente**).
  - Cola muy alta portada a **70º sobre la horizontal**.
  - Tarsos de color **blanco rosáceo** limpios y sin plumas.
  - Orejillas **blancas** de tamaño medio.
- **Control de Puesta Individual:** Prueba oficial de 15 días, peso de huevo entre **55 g y 70 g**, cáscara color **blanco crema**.
- **Defectos Descalificables Oficiales (Eliminación Inmediata):** Orejilla roja/amarilla, pecho prominente, cola baja (<70º), tarsos amarillos o emplumados, y flameado de esclavina en variedades Moteada/Exchequer.
- **Registros Oficiales del Libro Genealógico (5 secciones):**
  1. `RF`: Registro Fundacional.
  2. `RA`: Registro Auxiliar.
  3. `RN`: Registro de Nacimientos (Aspirantes).
  4. `RD`: Registro Definitivo (Superada inspección $\ge$ 70p y calificación Apto).
  5. `RM`: Registro de Méritos (Superada calificación excelente $\ge$ 90p / progenie).

---

## 🚀 Arquitectura Técnica y Características

- **Frontend SPA:** HTML5 semántico, Tailwind CSS v3, FontAwesome y JavaScript ES6+ modular.
- **Backend Supabase / PostgreSQL en 3FN:** Esquema relacional estricto, campos JSONB para feno-zoometría y multimedia, triggers automáticos para actualización de sección (`RN` $\rightarrow$ `RD`), vistas CTE recursivas de pedigrí a 5 generaciones y políticas de seguridad RLS.
- **Storage:** Bucket de Supabase `fotos-alacantina` con soporte para las 3 tomas in situ obligatorias (Lateral completa, Cabeza/cresta, Tarsos/patas).
- **PWA & Offline-First:** Service Worker (`sw.js`), Web App Manifest (`manifest.json`) y cola `SyncQueue` en **IndexedDB** (`AlacantinDB_v5`) para capturas en Base64 cuando no hay cobertura de red en corrales (`navigator.onLine === false`).
- **Algoritmos Zootécnicos:**
  - Cálculo en cliente del coeficiente de consanguinidad de Wright ($F_x$).
  - Simulador de apareamiento preventivo para evitar depresión endogámica.
  - Exportador CSV de matriz de pedigrí para análisis de tamaño efectivo de población ($N_e$) en **ENDOG / CFC / R**.
  - Asistente de apareamientos por familias según la **Regla de rotación circular de Gobe** ($A \rightarrow B \rightarrow C \rightarrow D \rightarrow E \rightarrow A$).
- **Motor de Documentos Oficiales (`pdf-engine.js`):** Generación e impresión de Certificados Genealógicos Oficiales con código QR de verificación electrónica y Actas de Inspección Zootécnica.

---

## 📂 Estructura de Archivos

```
AlacantinApp-v5/
├── index.html              # Interfaz de usuario SPA con las 5 pestañas
├── app.js                  # Lógica de negocio, IndexedDB, Supabase, Wright Fx y Gobe
├── styles.css              # Estilos complementarios, árbol genealógico y @media print
├── pdf-engine.js           # Generador de Certificados Oficiales y Actas de Inspección
├── sw.js                   # Service Worker para funcionamiento offline
├── manifest.json           # Manifiesto PWA para instalación en móviles y escritorio
├── supabase_schema.sql     # Esquema SQL 3FN, Triggers, RLS y Vistas recursivas 5Gen
├── icons/                  # Logotipo, iconos PWA y estándar oficial en PDF
│   ├── logo.png
│   ├── icon-192.png
│   ├── icon-512.png
│   └── Estandar-Alacantina2025.pdf
└── README.md               # Documentación del proyecto
```

---

## 🛠️ Instalación y Uso

1. **Clonar el repositorio:**
   ```bash
   git clone https://github.com/jcabrerafont-web/AlacantinApp-v5.git
   cd AlacantinApp-v5
   ```

2. **Ejecutar servidor local:**
   ```bash
   python -m http.server 8080
   ```
   Abre [http://localhost:8080](http://localhost:8080) en tu navegador.

3. **Configurar Supabase (Opcional):**
   - Ejecuta el script `supabase_schema.sql` en tu proyecto de Supabase.
   - En la app, pulsa el botón **Config** e introduce tu URL y Anon Key.
   - Si no configuras Supabase, la app funciona completamente en modo local con IndexedDB y datos precargados.

---

## 📜 Normativa y Cumplimiento Legal

- **Protocolo de la Comisión Nacional de Zootecnia (CNZ de 5 de junio de 2025)**.
- **Real Decreto 45/2019**, de 8 de febrero, por el que se establecen las normas zootécnicas aplicables a los animales reproductores de raza pura.
- **Reglamento (UE) 2016/1012** del Parlamento Europeo y del Consejo sobre cría animal y libros genealógicos.
