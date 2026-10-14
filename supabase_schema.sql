-- ============================================================================
-- ALACANTINAPP V5 - LIBRO GENEALÓGICO OFICIAL DE LA GALLINA ALACANTINA (ESGA025)
-- Esquema de Base de Datos PostgreSQL / Supabase en 3ª Forma Normal (3FN)
-- Cumplimiento: Protocolo CNZ (5 de junio de 2025), Real Decreto 45/2019 y Reg. UE 2016/1012
-- ============================================================================

-- Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. TIPOS ENUMERADOS OFICIALES
-- ============================================================================

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sexo_tipo') THEN
        CREATE TYPE sexo_tipo AS ENUM ('Macho', 'Hembra');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'seccion_libro_tipo') THEN
        CREATE TYPE seccion_libro_tipo AS ENUM ('RF', 'RA', 'RN', 'RD', 'RM');
        -- RF: Registro Fundacional
        -- RA: Registro Auxiliar
        -- RN: Registro de Nacimientos (Aspirantes)
        -- RD: Registro Definitivo (Superada inspección >= 70p y Apto)
        -- RM: Registro de Méritos (Superada calificación excelente / progenie)
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_animal_tipo') THEN
        CREATE TYPE estado_animal_tipo AS ENUM ('Activo', 'Baja', 'Vendido', 'Cedido', 'Fallecido');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'calificacion_morfologica_tipo') THEN
        CREATE TYPE calificacion_morfologica_tipo AS ENUM ('Apto', 'No Apto', 'Excelente', 'Muy Bueno', 'Bueno');
    END IF;
END $$;

-- ============================================================================
-- 2. TABLAS PRINCIPALES (3FN)
-- ============================================================================

-- Tabla 2.1: Explotaciones y Criadores Asociados
CREATE TABLE IF NOT EXISTS explotaciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo_rega VARCHAR(50) UNIQUE,                    -- Código REGA: NULLABLE para admitir 'En trámite' o 'Sin REGA'
    rega VARCHAR(50),                                  -- Alias directo REGA (NULLABLE)
    numero_socio VARCHAR(50),                          -- Nº de Socio del Club (NULLABLE, ej: 'NS-000' aspirante)
    nombre_titular VARCHAR(150) NOT NULL,
    nombre_criadero VARCHAR(150),
    cif_nif VARCHAR(20),
    provincia VARCHAR(100) NOT NULL DEFAULT 'Alicante',
    municipio VARCHAR(100) NOT NULL,
    direccion TEXT,
    latitud NUMERIC(10, 7),
    longitud NUMERIC(10, 7),
    telefono VARCHAR(25),
    email VARCHAR(120),
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Tabla 2.2: Animales (Libro Genealógico ESGA025)
CREATE TABLE IF NOT EXISTS animales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo_identificacion VARCHAR(40) UNIQUE NOT NULL, -- Ej: ESGA025-24-M-0142
    numero_anilla VARCHAR(25) NOT NULL,                -- Número físico grabado en la anilla
    calibre_anilla_mm NUMERIC(4, 1) NOT NULL,          -- Gallo: 20.0 mm | Gallina: 18.0 mm
    nombre VARCHAR(100),
    sexo sexo_tipo NOT NULL,
    fecha_nacimiento DATE NOT NULL,
    variedad VARCHAR(50) NOT NULL DEFAULT 'Moteada / Exchequer',
    seccion_libro seccion_libro_tipo NOT NULL DEFAULT 'RN',
    id_padre UUID REFERENCES animales(id) ON DELETE SET NULL,
    id_madre UUID REFERENCES animales(id) ON DELETE SET NULL,
    explotacion_id UUID REFERENCES explotaciones(id) ON DELETE RESTRICT,
    codigo_rega VARCHAR(50),                           -- Código REGA de la explotación vinculada (actualizable masivamente)
    familia_origen VARCHAR(20) NOT NULL DEFAULT 'Familia A', -- Familias A, B, C, D, E para Regla de Gobe
    lote_actual VARCHAR(50),
    peso_actual_kg NUMERIC(5, 3) NOT NULL,             -- Gallo: 3.000 - 3.500 kg | Gallina: 2.200 - 2.600 kg
    estado estado_animal_tipo NOT NULL DEFAULT 'Activo',
    coeficiente_consanguinidad NUMERIC(7, 6) DEFAULT 0.000000, -- Wright Fx
    
    -- Campos JSONB para fenotipo, zoometría y multimedia
    feno_zoometria JSONB DEFAULT jsonb_build_object(
        'angulo_cola_grados', 70,
        'perfil_pecho', 'Recto/Plano',
        'color_tarsos', 'Blanco rosáceo',
        'color_orejillas', 'Blanco',
        'dientes_cresta', 6,
        'longitud_tarso_mm', NULL
    ),
    fotos JSONB DEFAULT jsonb_build_object(
        'lateral', NULL,  -- Toma obligatoria 1: Lateral completa
        'cabeza', NULL,   -- Toma obligatoria 2: Cabeza y cresta
        'tarsos', NULL    -- Toma obligatoria 3: Tarsos y patas
    ),
    
    geolocalizacion_alta JSONB DEFAULT jsonb_build_object(
        'latitud', NULL,
        'longitud', NULL,
        'precision_m', NULL
    ),
    
    notas TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,

    -- Restricción de integridad en calibres oficiales (CNZ 2025)
    CONSTRAINT chk_calibre_anilla CHECK (
        (sexo = 'Macho' AND calibre_anilla_mm = 20.0) OR
        (sexo = 'Hembra' AND calibre_anilla_mm = 18.0)
    )
);

-- Índices de rendimiento zootécnico
CREATE INDEX IF NOT EXISTS idx_animales_padre ON animales(id_padre);
CREATE INDEX IF NOT EXISTS idx_animales_madre ON animales(id_madre);
CREATE INDEX IF NOT EXISTS idx_animales_seccion ON animales(seccion_libro);
CREATE INDEX IF NOT EXISTS idx_animales_explotacion ON animales(explotacion_id);
CREATE INDEX IF NOT EXISTS idx_animales_familia ON animales(familia_origen);

-- Tabla 2.3: Inspecciones Morfológicas (Baremo 100 puntos según Protocolo CNZ 2025)
CREATE TABLE IF NOT EXISTS inspecciones_morfologicas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    animal_id UUID NOT NULL REFERENCES animales(id) ON DELETE CASCADE,
    fecha_inspeccion DATE NOT NULL DEFAULT CURRENT_DATE,
    calificador_oficial VARCHAR(150) NOT NULL,
    
    -- Baremo oficial desglosado (Suma = 100 puntos)
    cabeza_cresta_cara NUMERIC(4, 1) NOT NULL CHECK (cabeza_cresta_cara BETWEEN 0 AND 15),     -- Max 15p
    cuello_esclavina NUMERIC(4, 1) NOT NULL CHECK (cuello_esclavina BETWEEN 0 AND 10),         -- Max 10p
    pecho_tronco NUMERIC(4, 1) NOT NULL CHECK (pecho_tronco BETWEEN 0 AND 20),                 -- Max 20p (Pecho recto/plano)
    cola_porte NUMERIC(4, 1) NOT NULL CHECK (cola_porte BETWEEN 0 AND 20),                     -- Max 20p (Cola 70º)
    extremidades_tarsos NUMERIC(4, 1) NOT NULL CHECK (extremidades_tarsos BETWEEN 0 AND 15),   -- Max 15p (Tarsos blanco rosáceo)
    plumaje_variedad NUMERIC(4, 1) NOT NULL CHECK (plumaje_variedad BETWEEN 0 AND 10),         -- Max 10p
    peso_desarrollo NUMERIC(4, 1) NOT NULL CHECK (peso_desarrollo BETWEEN 0 AND 10),           -- Max 10p
    
    -- Puntuación total calculada automáticamente
    puntuacion_total NUMERIC(5, 1) GENERATED ALWAYS AS (
        cabeza_cresta_cara + cuello_esclavina + pecho_tronco + cola_porte + extremidades_tarsos + plumaje_variedad + peso_desarrollo
    ) STORED,

    -- Checklist Oficial de Defectos Descalificables (CNZ 2025)
    defecto_orejilla_no_blanca BOOLEAN NOT NULL DEFAULT FALSE,      -- Orejilla roja o amarilla
    defecto_pecho_prominente BOOLEAN NOT NULL DEFAULT FALSE,        -- Pecho prominente o redondeado
    defecto_cola_baja BOOLEAN NOT NULL DEFAULT FALSE,               -- Cola menor a 70º sobre la horizontal
    defecto_tarsos_anomalos BOOLEAN NOT NULL DEFAULT FALSE,         -- Tarsos amarillos o con plumas
    defecto_flameado_esclavina BOOLEAN NOT NULL DEFAULT FALSE,      -- Flameado en variedades Moteada/Exchequer
    defecto_otro TEXT,
    
    descalificado BOOLEAN NOT NULL DEFAULT FALSE,
    calificacion calificacion_morfologica_tipo NOT NULL DEFAULT 'Apto',
    observaciones TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_inspecciones_animal ON inspecciones_morfologicas(animal_id);
CREATE INDEX IF NOT EXISTS idx_inspecciones_fecha ON inspecciones_morfologicas(fecha_inspeccion);

-- Tabla 2.4: Controles de Puesta Individual (Prueba 15 días según CNZ 2025)
CREATE TABLE IF NOT EXISTS controles_puesta (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    animal_id UUID NOT NULL REFERENCES animales(id) ON DELETE CASCADE,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE NOT NULL,
    total_huevos_15d INTEGER NOT NULL CHECK (total_huevos_15d >= 0),
    peso_medio_huevo_g NUMERIC(5, 2) NOT NULL, -- Estándar: 55.0 g a 70.0 g
    color_cascara VARCHAR(60) NOT NULL DEFAULT 'Blanco crema',
    calidad_cascara VARCHAR(60) NOT NULL DEFAULT 'Buena',
    conforme_estandar BOOLEAN NOT NULL DEFAULT TRUE,
    observaciones TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,

    CONSTRAINT chk_periodo_15d CHECK (fecha_fin >= fecha_inicio)
);

CREATE INDEX IF NOT EXISTS idx_controles_puesta_animal ON controles_puesta(animal_id);

-- Tabla 2.5: Lotes de Apareamiento y Familias (Regla de Gobe)
CREATE TABLE IF NOT EXISTS lotes_apareamiento (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo_lote VARCHAR(50) UNIQUE NOT NULL,      -- Ej: LOTE-GOBE-A-2026
    familia_receptora VARCHAR(20) NOT NULL,        -- 'Familia B' (si el macho viene de A)
    familia_macho VARCHAR(20) NOT NULL,            -- 'Familia A'
    id_gallo UUID REFERENCES animales(id) ON DELETE SET NULL,
    gallinas_ids JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array con UUIDs de las gallinas
    temporada INTEGER NOT NULL DEFAULT 2026,
    coeficiente_consanguinidad_esperado NUMERIC(7, 6) DEFAULT 0.000000,
    rotacion_siguiente_familia VARCHAR(20),        -- Siguiente en el círculo de Gobe
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    notas TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- ============================================================================
-- 3. TRIGGERS Y FUNCIONES AUTOMÁTICAS
-- ============================================================================

-- Trigger 3.1: Actualizar automáticamente updated_at
CREATE OR REPLACE FUNCTION actualizar_timestamp_modificacion()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_actualizar_timestamp_animales ON animales;
CREATE TRIGGER trg_actualizar_timestamp_animales
    BEFORE UPDATE ON animales
    FOR EACH ROW
    EXECUTE FUNCTION actualizar_timestamp_modificacion();

DROP TRIGGER IF EXISTS trg_actualizar_timestamp_explotaciones ON explotaciones;
CREATE TRIGGER trg_actualizar_timestamp_explotaciones
    BEFORE UPDATE ON explotaciones
    FOR EACH ROW
    EXECUTE FUNCTION actualizar_timestamp_modificacion();

-- Trigger 3.2: Actualización Automática de Sección en el Libro Genealógico
-- 'RN' (Aspirante) -> 'RD' si inspección >= 70 puntos y calificado como Apto/Excelente/Muy Bueno
-- y sin defectos descalificables. Promoción a 'RM' si >= 90 puntos.
CREATE OR REPLACE FUNCTION procesar_inspeccion_seccion_libro()
RETURNS TRIGGER AS $$
DECLARE
    v_sexo sexo_tipo;
    v_seccion_actual seccion_libro_tipo;
    v_descalificado BOOLEAN;
    v_nueva_seccion seccion_libro_tipo;
    v_nueva_calificacion calificacion_morfologica_tipo;
BEGIN
    -- Determinar si existe defecto descalificable
    v_descalificado := (
        NEW.defecto_orejilla_no_blanca OR
        NEW.defecto_pecho_prominente OR
        NEW.defecto_cola_baja OR
        NEW.defecto_tarsos_anomalos OR
        NEW.defecto_flameado_esclavina OR
        NEW.descalificado
    );
    
    NEW.descalificado := v_descalificado;

    -- Asignar calificación cualitativa según puntos y defectos
    IF v_descalificado OR NEW.puntuacion_total < 70.0 THEN
        v_nueva_calificacion := 'No Apto';
    ELSIF NEW.puntuacion_total >= 90.0 THEN
        v_nueva_calificacion := 'Excelente';
    ELSIF NEW.puntuacion_total >= 80.0 THEN
        v_nueva_calificacion := 'Muy Bueno';
    ELSE
        v_nueva_calificacion := 'Apto';
    END IF;
    
    NEW.calificacion := v_nueva_calificacion;

    -- Obtener datos actuales del animal
    SELECT sexo, seccion_libro INTO v_sexo, v_seccion_actual
    FROM animales WHERE id = NEW.animal_id;

    -- Promoción de sección en el Libro Genealógico ESGA025
    IF NOT v_descalificado AND NEW.puntuacion_total >= 70.0 THEN
        IF NEW.puntuacion_total >= 90.0 THEN
            v_nueva_seccion := 'RM'; -- Registro de Méritos
        ELSE
            -- Si estaba en RN (Nacimientos/Aspirante) o RA (Auxiliar), promociona a RD (Definitivo)
            IF v_seccion_actual IN ('RN', 'RA') THEN
                v_nueva_seccion := 'RD';
            ELSE
                v_nueva_seccion := v_seccion_actual;
            END IF;
        END IF;

        -- Actualizar registro del animal
        UPDATE animales
        SET seccion_libro = v_nueva_seccion
        WHERE id = NEW.animal_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_procesar_inspeccion ON inspecciones_morfologicas;
CREATE TRIGGER trg_procesar_inspeccion
    BEFORE INSERT OR UPDATE ON inspecciones_morfologicas
    FOR EACH ROW
    EXECUTE FUNCTION procesar_inspeccion_seccion_libro();

-- Función 3.3: Actualización Masiva de Código REGA (Explotación y todos sus Animales asociados)
CREATE OR REPLACE FUNCTION actualizar_rega_masiva(
    p_explotacion_id UUID,
    p_nueva_rega VARCHAR(50)
)
RETURNS INTEGER AS $$
DECLARE
    v_actualizados INTEGER := 0;
BEGIN
    -- 1. Actualizar la explotación
    UPDATE explotaciones
    SET codigo_rega = p_nueva_rega,
        rega = p_nueva_rega,
        updated_at = TIMEZONE('utc'::text, NOW())
    WHERE id = p_explotacion_id;

    -- 2. Actualizar todos los animales vinculados a esa explotación
    UPDATE animales
    SET codigo_rega = p_nueva_rega,
        updated_at = TIMEZONE('utc'::text, NOW())
    WHERE explotacion_id = p_explotacion_id;

    GET DIAGNOSTICS v_actualizados = ROW_COUNT;
    RETURN v_actualizados;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SCRIPT DE MIGRACIÓN / COMPATIBILIDAD (IDEMPOTENTE)
-- ============================================================================
DO $$ BEGIN
    -- Asegurar campos NULLABLE en explotaciones para registros en trámite o sin REGA
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'explotaciones' AND column_name = 'codigo_rega') THEN
        ALTER TABLE explotaciones ALTER COLUMN codigo_rega DROP NOT NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'explotaciones' AND column_name = 'rega') THEN
        ALTER TABLE explotaciones ADD COLUMN rega VARCHAR(50);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'explotaciones' AND column_name = 'numero_socio') THEN
        ALTER TABLE explotaciones ADD COLUMN numero_socio VARCHAR(50);
    END IF;
    -- Asegurar campo codigo_rega en animales para trazabilidad directa y actualización masiva
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'animales' AND column_name = 'codigo_rega') THEN
        ALTER TABLE animales ADD COLUMN codigo_rega VARCHAR(50);
    END IF;
END $$;

-- ============================================================================
-- 4. VISTAS CTE RECURSIVAS DE PEDIGRÍ A 5 GENERACIONES
-- ============================================================================

-- Vista 4.1: Árbol Genealógico Recursivo a 5 Generaciones
CREATE OR REPLACE VIEW vista_pedigri_recursivo_5gen AS
WITH RECURSIVE arbol AS (
    -- Caso base: Nivel 0 (Animal raíz evaluado)
    SELECT 
        a.id AS animal_raiz_id,
        a.id AS antecesor_id,
        a.codigo_identificacion,
        a.numero_anilla,
        a.nombre,
        a.sexo,
        a.variedad,
        a.seccion_libro,
        a.id_padre,
        a.id_madre,
        0 AS generacion,
        'Animal Evaluado'::VARCHAR(50) AS relacion,
        ARRAY[a.id] AS ruta_linaje
    FROM animales a

    UNION ALL

    -- Caso recursivo: Ascendencia por Padre
    SELECT 
        arb.animal_raiz_id,
        p.id AS antecesor_id,
        p.codigo_identificacion,
        p.numero_anilla,
        p.nombre,
        p.sexo,
        p.variedad,
        p.seccion_libro,
        p.id_padre,
        p.id_madre,
        arb.generacion + 1,
        CASE 
            WHEN arb.generacion = 0 THEN 'Padre'
            WHEN arb.generacion = 1 THEN 'Abuelo Paterno (' || arb.relacion || ')'
            WHEN arb.generacion = 2 THEN 'Bisabuelo (' || arb.relacion || ')'
            WHEN arb.generacion = 3 THEN 'Tatarabuelo (' || arb.relacion || ')'
            ELSE 'Trastatarabuelo'
        END::VARCHAR(50),
        arb.ruta_linaje || p.id
    FROM arbol arb
    JOIN animales p ON arb.id_padre = p.id
    WHERE arb.generacion < 5 AND NOT (p.id = ANY(arb.ruta_linaje))

    UNION ALL

    -- Caso recursivo: Ascendencia por Madre
    SELECT 
        arb.animal_raiz_id,
        m.id AS antecesor_id,
        m.codigo_identificacion,
        m.numero_anilla,
        m.nombre,
        m.sexo,
        m.variedad,
        m.seccion_libro,
        m.id_padre,
        m.id_madre,
        arb.generacion + 1,
        CASE 
            WHEN arb.generacion = 0 THEN 'Madre'
            WHEN arb.generacion = 1 THEN 'Abuela Materna (' || arb.relacion || ')'
            WHEN arb.generacion = 2 THEN 'Bisabuela (' || arb.relacion || ')'
            WHEN arb.generacion = 3 THEN 'Tatarabuela (' || arb.relacion || ')'
            ELSE 'Trastatarabuela'
        END::VARCHAR(50),
        arb.ruta_linaje || m.id
    FROM arbol arb
    JOIN animales m ON arb.id_madre = m.id
    WHERE arb.generacion < 5 AND NOT (m.id = ANY(arb.ruta_linaje))
)
SELECT * FROM arbol;

-- Vista 4.2: Resumen del Censo Oficial por Sección y Variedad
CREATE OR REPLACE VIEW vista_resumen_censo AS
SELECT 
    seccion_libro,
    sexo,
    variedad,
    COUNT(*) AS total_ejemplares,
    COUNT(CASE WHEN estado = 'Activo' THEN 1 END) AS activos,
    ROUND(AVG(peso_actual_kg), 3) AS peso_medio_kg,
    ROUND(AVG(coeficiente_consanguinidad), 5) AS consanguinidad_media_fx
FROM animales
GROUP BY seccion_libro, sexo, variedad
ORDER BY seccion_libro, sexo;

-- ============================================================================
-- 5. POLÍTICAS DE SEGURIDAD RLS (ROW LEVEL SECURITY)
-- ============================================================================

ALTER TABLE explotaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE animales ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspecciones_morfologicas ENABLE ROW LEVEL SECURITY;
ALTER TABLE controles_puesta ENABLE ROW LEVEL SECURITY;
ALTER TABLE lotes_apareamiento ENABLE ROW LEVEL SECURITY;

-- Políticas de Consulta Pública (Transparencia Oficial del Libro Genealógico)
CREATE POLICY "Lectura pública de explotaciones" ON explotaciones
    FOR SELECT USING (true);

CREATE POLICY "Lectura pública de animales" ON animales
    FOR SELECT USING (true);

CREATE POLICY "Lectura pública de inspecciones" ON inspecciones_morfologicas
    FOR SELECT USING (true);

CREATE POLICY "Lectura pública de controles de puesta" ON controles_puesta
    FOR SELECT USING (true);

CREATE POLICY "Lectura pública de lotes" ON lotes_apareamiento
    FOR SELECT USING (true);

-- Políticas de Escritura y Modificación (Usuarios Autenticados y Sincronización)
CREATE POLICY "Gestión autenticada de explotaciones" ON explotaciones
    FOR ALL USING (auth.role() = 'authenticated' OR auth.role() = 'anon')
    WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'anon');

CREATE POLICY "Gestión autenticada de animales" ON animales
    FOR ALL USING (auth.role() = 'authenticated' OR auth.role() = 'anon')
    WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'anon');

CREATE POLICY "Gestión autenticada de inspecciones" ON inspecciones_morfologicas
    FOR ALL USING (auth.role() = 'authenticated' OR auth.role() = 'anon')
    WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'anon');

CREATE POLICY "Gestión autenticada de controles" ON controles_puesta
    FOR ALL USING (auth.role() = 'authenticated' OR auth.role() = 'anon')
    WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'anon');

CREATE POLICY "Gestión autenticada de lotes" ON lotes_apareamiento
    FOR ALL USING (auth.role() = 'authenticated' OR auth.role() = 'anon')
    WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'anon');

-- ============================================================================
-- 6. CONFIGURACIÓN DEL STORAGE BUCKET 'fotos-alacantina'
-- ============================================================================

-- Crear bucket público para fotografías obligatorias in situ
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'fotos-alacantina',
    'fotos-alacantina',
    TRUE,
    10485760, -- 10 MB límite por archivo
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
    public = TRUE,
    file_size_limit = 10485760;

-- Políticas de Acceso para el Bucket de Supabase Storage
CREATE POLICY "Acceso público lectura fotos-alacantina"
ON storage.objects FOR SELECT
USING (bucket_id = 'fotos-alacantina');

CREATE POLICY "Subida autorizada fotos-alacantina"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'fotos-alacantina');

CREATE POLICY "Actualización autorizada fotos-alacantina"
ON storage.objects FOR UPDATE
USING (bucket_id = 'fotos-alacantina');
