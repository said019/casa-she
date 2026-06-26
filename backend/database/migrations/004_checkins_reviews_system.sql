-- ============================================
-- CATARSIS - Sistema de Check-ins y Reseñas
-- Migración 004: Check-in logs, Reviews, Seguridad
-- ============================================

-- ============================================
-- NUEVOS ENUMS
-- ============================================

-- Método de check-in
CREATE TYPE checkin_method AS ENUM (
    'qr_scan',           -- Escaneo de QR en recepción
    'manual_reception',  -- Manual por recepcionista
    'self_checkin',      -- Auto check-in desde app
    'nfc_tap',           -- NFC tap (futuro)
    'wallet_scan'        -- Escaneo desde wallet pass
);

-- Estado de la reseña
CREATE TYPE review_status AS ENUM (
    'pending',     -- Pendiente de completar
    'published',   -- Publicada
    'hidden',      -- Oculta por el usuario
    'flagged',     -- Marcada para revisión
    'removed'      -- Removida por admin
);

-- Tipo de actividad sospechosa
CREATE TYPE suspicious_activity_type AS ENUM (
    'multiple_devices',        -- QR usado desde múltiples dispositivos
    'rapid_checkins',          -- Check-ins muy rápidos (<5min)
    'location_mismatch',       -- Ubicación no coincide con estudio
    'duplicate_qr_attempt',    -- Intento de usar QR ya escaneado
    'invalid_qr',              -- QR inválido o expirado
    'device_clone_suspected'   -- Posible clonación de dispositivo
);

-- Tipo de respuesta del estudio
CREATE TYPE response_type AS ENUM (
    'thank_you',       -- Agradecimiento
    'apology',         -- Disculpa
    'explanation',     -- Explicación
    'offer',           -- Oferta de compensación
    'follow_up'        -- Seguimiento
);

-- ============================================
-- TABLA: CHECKIN_LOGS
-- Log completo de check-ins con tracking
-- ============================================
CREATE TABLE checkin_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    membership_id UUID REFERENCES memberships(id) ON DELETE SET NULL,

    -- Información del check-in
    checkin_method checkin_method NOT NULL DEFAULT 'qr_scan',
    checked_in_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    checked_in_by UUID REFERENCES users(id), -- NULL si es auto check-in

    -- Tracking de dispositivo (para seguridad)
    device_id VARCHAR(255),                   -- Fingerprint del dispositivo
    device_type VARCHAR(100),                 -- iOS, Android, Web
    device_model VARCHAR(100),                -- iPhone 14, Samsung S23, etc
    app_version VARCHAR(20),                  -- Versión de la app
    ip_address INET,                          -- IP del check-in
    user_agent TEXT,                          -- User agent del navegador/app

    -- Geolocalización
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    location_accuracy DECIMAL(6, 2),          -- Precisión en metros
    distance_from_studio DECIMAL(8, 2),       -- Distancia del estudio en metros

    -- QR Info
    qr_code_used VARCHAR(255),                -- Código QR escaneado
    qr_generated_at TIMESTAMP WITH TIME ZONE, -- Cuándo se generó el QR

    -- Metadata
    is_late BOOLEAN DEFAULT false,            -- Llegó tarde (>10min después de inicio)
    minutes_early_late INTEGER,               -- Minutos antes/después (negativo = tarde)
    is_first_class BOOLEAN DEFAULT false,     -- Primera clase del usuario
    notes TEXT,                               -- Notas del staff

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes para checkin_logs
CREATE INDEX idx_checkin_logs_booking ON checkin_logs(booking_id);
CREATE INDEX idx_checkin_logs_user ON checkin_logs(user_id);
CREATE INDEX idx_checkin_logs_class ON checkin_logs(class_id);
CREATE INDEX idx_checkin_logs_date ON checkin_logs(checked_in_at);
CREATE INDEX idx_checkin_logs_device ON checkin_logs(device_id);
CREATE INDEX idx_checkin_logs_ip ON checkin_logs(ip_address);
CREATE INDEX idx_checkin_logs_method ON checkin_logs(checkin_method);

-- ============================================
-- TABLA: REVIEW_TAGS
-- Tags predefinidos para reseñas
-- ============================================
CREATE TABLE review_tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) NOT NULL,
    name_en VARCHAR(50),                      -- Nombre en inglés
    category VARCHAR(50) NOT NULL,            -- 'positive', 'negative', 'neutral'
    icon VARCHAR(50),                         -- Emoji o icono
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index para review_tags
CREATE INDEX idx_review_tags_category ON review_tags(category);
CREATE INDEX idx_review_tags_active ON review_tags(is_active);

-- ============================================
-- TABLA: REVIEWS
-- Reseñas de clases
-- ============================================
CREATE TABLE reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    instructor_id UUID NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,

    -- Ratings (1-5 estrellas)
    overall_rating SMALLINT NOT NULL CHECK (overall_rating >= 1 AND overall_rating <= 5),
    instructor_rating SMALLINT CHECK (instructor_rating >= 1 AND instructor_rating <= 5),
    difficulty_rating SMALLINT CHECK (difficulty_rating >= 1 AND difficulty_rating <= 5),
    ambiance_rating SMALLINT CHECK (ambiance_rating >= 1 AND ambiance_rating <= 5),

    -- Contenido
    comment TEXT,
    comment_length INTEGER GENERATED ALWAYS AS (COALESCE(LENGTH(comment), 0)) STORED,

    -- Estado
    status review_status NOT NULL DEFAULT 'published',
    is_anonymous BOOLEAN DEFAULT false,
    is_featured BOOLEAN DEFAULT false,        -- Destacada por el estudio

    -- Incentivos
    points_earned INTEGER DEFAULT 0,          -- Puntos de lealtad ganados
    points_awarded_at TIMESTAMP WITH TIME ZONE,

    -- Moderación
    flagged_at TIMESTAMP WITH TIME ZONE,
    flagged_reason TEXT,
    moderated_by UUID REFERENCES users(id),
    moderated_at TIMESTAMP WITH TIME ZONE,

    -- Tracking
    submitted_from VARCHAR(50),               -- 'app', 'web', 'email'
    notification_sent_at TIMESTAMP WITH TIME ZONE,  -- Cuándo se envió solicitud

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Una reseña por booking
    CONSTRAINT unique_review_per_booking UNIQUE (booking_id)
);

-- Indexes para reviews
CREATE INDEX idx_reviews_user ON reviews(user_id);
CREATE INDEX idx_reviews_class ON reviews(class_id);
CREATE INDEX idx_reviews_instructor ON reviews(instructor_id);
CREATE INDEX idx_reviews_status ON reviews(status);
CREATE INDEX idx_reviews_overall_rating ON reviews(overall_rating);
CREATE INDEX idx_reviews_created ON reviews(created_at);
CREATE INDEX idx_reviews_featured ON reviews(is_featured) WHERE is_featured = true;

-- ============================================
-- TABLA: REVIEW_TAG_SELECTIONS
-- Tags seleccionados por reseña
-- ============================================
CREATE TABLE review_tag_selections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    review_id UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES review_tags(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Un tag por reseña
    CONSTRAINT unique_tag_per_review UNIQUE (review_id, tag_id)
);

-- Indexes para review_tag_selections
CREATE INDEX idx_review_tags_review ON review_tag_selections(review_id);
CREATE INDEX idx_review_tags_tag ON review_tag_selections(tag_id);

-- ============================================
-- TABLA: REVIEW_RESPONSES
-- Respuestas del estudio a reseñas
-- ============================================
CREATE TABLE review_responses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    review_id UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
    responded_by UUID NOT NULL REFERENCES users(id),

    response_type response_type NOT NULL DEFAULT 'thank_you',
    response_text TEXT NOT NULL,

    -- Seguimiento
    is_public BOOLEAN DEFAULT true,           -- Visible para el cliente
    is_resolved BOOLEAN DEFAULT false,        -- Marcado como resuelto

    -- Compensación ofrecida
    compensation_offered TEXT,                -- Descripción de compensación
    compensation_value DECIMAL(10, 2),        -- Valor en MXN
    compensation_redeemed BOOLEAN DEFAULT false,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index para review_responses
CREATE INDEX idx_review_responses_review ON review_responses(review_id);
CREATE INDEX idx_review_responses_user ON review_responses(responded_by);

-- ============================================
-- TABLA: SUSPICIOUS_ACTIVITY
-- Detección de actividad fraudulenta
-- ============================================
CREATE TABLE suspicious_activity (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
    checkin_log_id UUID REFERENCES checkin_logs(id) ON DELETE SET NULL,

    activity_type suspicious_activity_type NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'low', -- 'low', 'medium', 'high', 'critical'

    -- Detalles
    description TEXT NOT NULL,
    evidence JSONB DEFAULT '{}'::jsonb,       -- Datos adicionales del incidente

    -- Dispositivos involucrados
    device_ids TEXT[],                        -- Lista de device IDs
    ip_addresses INET[],                      -- Lista de IPs

    -- Resolución
    is_reviewed BOOLEAN DEFAULT false,
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    resolution_notes TEXT,
    is_false_positive BOOLEAN DEFAULT false,

    -- Acciones tomadas
    action_taken VARCHAR(100),                -- 'none', 'warning', 'suspended', 'banned'

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes para suspicious_activity
CREATE INDEX idx_suspicious_user ON suspicious_activity(user_id);
CREATE INDEX idx_suspicious_type ON suspicious_activity(activity_type);
CREATE INDEX idx_suspicious_severity ON suspicious_activity(severity);
CREATE INDEX idx_suspicious_reviewed ON suspicious_activity(is_reviewed);
CREATE INDEX idx_suspicious_created ON suspicious_activity(created_at);

-- ============================================
-- TABLA: WALLET_PASS_UPDATES
-- Historial de actualizaciones de pases
-- ============================================
CREATE TABLE wallet_pass_updates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_pass_id UUID NOT NULL REFERENCES wallet_passes(id) ON DELETE CASCADE,
    membership_id UUID NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,

    -- Cambios
    classes_before INTEGER,
    classes_after INTEGER,
    status_before membership_status,
    status_after membership_status,

    -- Causa del update
    trigger_type VARCHAR(50) NOT NULL,        -- 'checkin', 'purchase', 'manual', 'expiry'
    trigger_booking_id UUID REFERENCES bookings(id),

    -- Estado del push
    push_sent BOOLEAN DEFAULT false,
    push_sent_at TIMESTAMP WITH TIME ZONE,
    push_status VARCHAR(50),                  -- 'success', 'failed', 'pending'
    push_error TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes para wallet_pass_updates
CREATE INDEX idx_wallet_updates_pass ON wallet_pass_updates(wallet_pass_id);
CREATE INDEX idx_wallet_updates_membership ON wallet_pass_updates(membership_id);
CREATE INDEX idx_wallet_updates_created ON wallet_pass_updates(created_at);

-- ============================================
-- TABLA: REVIEW_REQUESTS
-- Solicitudes de reseña pendientes
-- ============================================
CREATE TABLE review_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,

    -- Timing
    class_ended_at TIMESTAMP WITH TIME ZONE NOT NULL,
    send_at TIMESTAMP WITH TIME ZONE NOT NULL,  -- Cuándo enviar la solicitud
    sent_at TIMESTAMP WITH TIME ZONE,           -- Cuándo se envió realmente

    -- Estado
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'sent', 'completed', 'expired', 'skipped'

    -- Comunicación
    channel VARCHAR(20) NOT NULL DEFAULT 'push', -- 'push', 'email', 'sms'
    reminder_count INTEGER DEFAULT 0,             -- Número de recordatorios enviados
    last_reminder_at TIMESTAMP WITH TIME ZONE,

    -- Resultado
    review_id UUID REFERENCES reviews(id),        -- Si se completó la reseña

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT unique_review_request UNIQUE (booking_id)
);

-- Indexes
CREATE INDEX idx_review_requests_status ON review_requests(status);
CREATE INDEX idx_review_requests_send_at ON review_requests(send_at) WHERE status = 'pending';
CREATE INDEX idx_review_requests_user ON review_requests(user_id);

-- ============================================
-- FUNCIONES Y TRIGGERS
-- ============================================

-- Trigger para updated_at en reviews
CREATE TRIGGER update_reviews_updated_at
    BEFORE UPDATE ON reviews
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger para updated_at en review_responses
CREATE TRIGGER update_review_responses_updated_at
    BEFORE UPDATE ON review_responses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger para updated_at en review_requests
CREATE TRIGGER update_review_requests_updated_at
    BEFORE UPDATE ON review_requests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ----------------------------------------
-- Función: Detectar actividad sospechosa
-- ----------------------------------------
CREATE OR REPLACE FUNCTION detect_suspicious_checkin()
RETURNS TRIGGER AS $$
DECLARE
    recent_checkins_count INTEGER;
    different_devices_count INTEGER;
    studio_lat DECIMAL := 19.4326;  -- Configurar con lat real
    studio_lon DECIMAL := -99.1332; -- Configurar con lon real
    max_distance DECIMAL := 500;     -- 500 metros
BEGIN
    -- Verificar check-ins rápidos (< 5 minutos) del mismo usuario
    SELECT COUNT(*) INTO recent_checkins_count
    FROM checkin_logs
    WHERE user_id = NEW.user_id
    AND checked_in_at > (NEW.checked_in_at - INTERVAL '5 minutes')
    AND id != NEW.id;

    IF recent_checkins_count > 0 THEN
        INSERT INTO suspicious_activity (
            user_id, booking_id, checkin_log_id,
            activity_type, severity, description, evidence
        ) VALUES (
            NEW.user_id, NEW.booking_id, NEW.id,
            'rapid_checkins', 'medium',
            'Múltiples check-ins en menos de 5 minutos',
            jsonb_build_object(
                'recent_count', recent_checkins_count + 1,
                'device_id', NEW.device_id,
                'ip', NEW.ip_address::text
            )
        );
    END IF;

    -- Verificar múltiples dispositivos en las últimas 24 horas
    IF NEW.device_id IS NOT NULL THEN
        SELECT COUNT(DISTINCT device_id) INTO different_devices_count
        FROM checkin_logs
        WHERE user_id = NEW.user_id
        AND device_id IS NOT NULL
        AND checked_in_at > (NEW.checked_in_at - INTERVAL '24 hours');

        IF different_devices_count > 2 THEN
            INSERT INTO suspicious_activity (
                user_id, booking_id, checkin_log_id,
                activity_type, severity, description, evidence
            ) VALUES (
                NEW.user_id, NEW.booking_id, NEW.id,
                'multiple_devices', 'high',
                'Check-in desde múltiples dispositivos en 24 horas',
                jsonb_build_object(
                    'device_count', different_devices_count,
                    'current_device', NEW.device_id,
                    'device_type', NEW.device_type
                )
            );
        END IF;
    END IF;

    -- Verificar distancia del estudio (si tenemos geolocalización)
    IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
        IF NEW.distance_from_studio > max_distance THEN
            INSERT INTO suspicious_activity (
                user_id, booking_id, checkin_log_id,
                activity_type, severity, description, evidence
            ) VALUES (
                NEW.user_id, NEW.booking_id, NEW.id,
                'location_mismatch', 'high',
                'Check-in desde ubicación lejana al estudio',
                jsonb_build_object(
                    'distance_meters', NEW.distance_from_studio,
                    'latitude', NEW.latitude,
                    'longitude', NEW.longitude,
                    'accuracy', NEW.location_accuracy
                )
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_detect_suspicious_checkin
    AFTER INSERT ON checkin_logs
    FOR EACH ROW EXECUTE FUNCTION detect_suspicious_checkin();

-- ----------------------------------------
-- Función: Otorgar puntos por reseña
-- ----------------------------------------
CREATE OR REPLACE FUNCTION award_review_points()
RETURNS TRIGGER AS $$
DECLARE
    points_for_review INTEGER := 50;
    bonus_for_comment INTEGER := 25;
    total_points INTEGER;
BEGIN
    -- Solo cuando se publica una reseña nueva
    IF NEW.status = 'published' AND (OLD IS NULL OR OLD.status != 'published') THEN
        total_points := points_for_review;

        -- Bonus por comentario de más de 50 caracteres
        IF NEW.comment_length > 50 THEN
            total_points := total_points + bonus_for_comment;
        END IF;

        -- Insertar puntos de lealtad
        INSERT INTO loyalty_points (user_id, points, type, description, related_booking_id)
        VALUES (
            NEW.user_id,
            total_points,
            'bonus',
            CASE
                WHEN NEW.comment_length > 50 THEN 'Reseña con comentario detallado'
                ELSE 'Reseña de clase'
            END,
            NEW.booking_id
        );

        -- Actualizar la reseña con los puntos
        NEW.points_earned := total_points;
        NEW.points_awarded_at := CURRENT_TIMESTAMP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_award_review_points
    BEFORE INSERT OR UPDATE ON reviews
    FOR EACH ROW EXECUTE FUNCTION award_review_points();

-- ----------------------------------------
-- Función: Crear solicitud de reseña automática
-- ----------------------------------------
CREATE OR REPLACE FUNCTION create_review_request()
RETURNS TRIGGER AS $$
DECLARE
    class_end TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Solo cuando el status cambia a checked_in
    IF NEW.status = 'checked_in' AND (OLD IS NULL OR OLD.status != 'checked_in') THEN
        -- Obtener hora de fin de la clase
        SELECT (c.date + c.end_time)::timestamp with time zone
        INTO class_end
        FROM classes c
        WHERE c.id = NEW.class_id;

        -- Crear solicitud de reseña para 2 horas después de que termine la clase
        INSERT INTO review_requests (
            booking_id, user_id, class_id,
            class_ended_at, send_at, status
        ) VALUES (
            NEW.id, NEW.user_id, NEW.class_id,
            class_end,
            class_end + INTERVAL '2 hours',
            'pending'
        )
        ON CONFLICT (booking_id) DO NOTHING;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_create_review_request
    AFTER INSERT OR UPDATE ON bookings
    FOR EACH ROW EXECUTE FUNCTION create_review_request();

-- ============================================
-- VISTAS ÚTILES
-- ============================================

-- Vista: Reseñas con detalles completos
CREATE VIEW reviews_with_details AS
SELECT
    r.id as review_id,
    r.overall_rating,
    r.instructor_rating,
    r.difficulty_rating,
    r.ambiance_rating,
    r.comment,
    r.status,
    r.is_anonymous,
    r.is_featured,
    r.points_earned,
    r.created_at,

    -- Usuario (oculto si anónimo)
    CASE WHEN r.is_anonymous THEN NULL ELSE u.id END as user_id,
    CASE WHEN r.is_anonymous THEN 'Anónimo' ELSE u.display_name END as user_name,
    CASE WHEN r.is_anonymous THEN NULL ELSE u.photo_url END as user_photo,

    -- Clase
    c.id as class_id,
    c.date as class_date,
    c.start_time,
    ct.name as class_type,
    ct.color as class_color,

    -- Instructor
    i.id as instructor_id,
    i.display_name as instructor_name,
    i.photo_url as instructor_photo,

    -- Tags
    (
        SELECT COALESCE(json_agg(json_build_object(
            'id', rt.id,
            'name', rt.name,
            'icon', rt.icon,
            'category', rt.category
        )), '[]'::json)
        FROM review_tag_selections rts
        JOIN review_tags rt ON rts.tag_id = rt.id
        WHERE rts.review_id = r.id
    ) as tags,

    -- Respuesta del estudio
    (
        SELECT json_build_object(
            'id', rr.id,
            'text', rr.response_text,
            'type', rr.response_type,
            'created_at', rr.created_at
        )
        FROM review_responses rr
        WHERE rr.review_id = r.id
        AND rr.is_public = true
        ORDER BY rr.created_at DESC
        LIMIT 1
    ) as studio_response

FROM reviews r
JOIN users u ON r.user_id = u.id
JOIN classes c ON r.class_id = c.id
JOIN class_types ct ON c.class_type_id = ct.id
JOIN instructors i ON r.instructor_id = i.id
WHERE r.status = 'published';

-- Vista: Estadísticas de check-in por día
CREATE VIEW checkin_stats AS
SELECT
    DATE(checked_in_at) as date,
    COUNT(*) as total_checkins,
    COUNT(DISTINCT user_id) as unique_users,
    COUNT(DISTINCT class_id) as classes_with_checkins,

    -- Por método
    COUNT(*) FILTER (WHERE checkin_method = 'qr_scan') as qr_checkins,
    COUNT(*) FILTER (WHERE checkin_method = 'manual_reception') as manual_checkins,
    COUNT(*) FILTER (WHERE checkin_method = 'self_checkin') as self_checkins,

    -- Puntualidad
    COUNT(*) FILTER (WHERE is_late = true) as late_checkins,
    COUNT(*) FILTER (WHERE is_late = false) as on_time_checkins,
    ROUND(AVG(minutes_early_late)::numeric, 1) as avg_minutes_early_late,

    -- Primeras clases
    COUNT(*) FILTER (WHERE is_first_class = true) as first_time_users

FROM checkin_logs
GROUP BY DATE(checked_in_at)
ORDER BY date DESC;

-- Vista: Ratings promedio por instructor
CREATE VIEW instructor_ratings AS
SELECT
    i.id as instructor_id,
    i.display_name as instructor_name,
    i.photo_url,

    COUNT(r.id) as total_reviews,
    ROUND(AVG(r.overall_rating)::numeric, 2) as avg_overall_rating,
    ROUND(AVG(r.instructor_rating)::numeric, 2) as avg_instructor_rating,
    ROUND(AVG(r.difficulty_rating)::numeric, 2) as avg_difficulty_rating,

    -- Distribución de ratings
    COUNT(*) FILTER (WHERE r.overall_rating = 5) as five_star_count,
    COUNT(*) FILTER (WHERE r.overall_rating = 4) as four_star_count,
    COUNT(*) FILTER (WHERE r.overall_rating = 3) as three_star_count,
    COUNT(*) FILTER (WHERE r.overall_rating <= 2) as low_rating_count,

    -- Porcentaje de satisfacción (4-5 estrellas)
    ROUND(
        (COUNT(*) FILTER (WHERE r.overall_rating >= 4)::numeric /
        NULLIF(COUNT(r.id), 0) * 100), 1
    ) as satisfaction_percentage,

    -- Última reseña
    MAX(r.created_at) as last_review_at

FROM instructors i
LEFT JOIN reviews r ON i.id = r.instructor_id AND r.status = 'published'
WHERE i.is_active = true
GROUP BY i.id, i.display_name, i.photo_url
ORDER BY avg_overall_rating DESC NULLS LAST;

-- Vista: Clases pendientes de reseña
CREATE VIEW pending_review_classes AS
SELECT
    b.id as booking_id,
    b.user_id,
    u.display_name as user_name,
    u.email,
    c.id as class_id,
    c.date as class_date,
    c.start_time,
    ct.name as class_type,
    i.display_name as instructor_name,
    rr.status as request_status,
    rr.send_at,
    rr.reminder_count
FROM bookings b
JOIN users u ON b.user_id = u.id
JOIN classes c ON b.class_id = c.id
JOIN class_types ct ON c.class_type_id = ct.id
JOIN instructors i ON c.instructor_id = i.id
LEFT JOIN reviews r ON b.id = r.booking_id
LEFT JOIN review_requests rr ON b.id = rr.booking_id
WHERE b.status = 'checked_in'
AND r.id IS NULL
AND (c.date + c.end_time)::timestamp < CURRENT_TIMESTAMP
ORDER BY c.date DESC, c.start_time DESC;

-- ============================================
-- FUNCIONES DE UTILIDAD
-- ============================================

-- Función: Calcular tasa de conversión de reseñas
CREATE OR REPLACE FUNCTION get_review_conversion_rate(
    p_start_date DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
    p_end_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    total_completed_classes BIGINT,
    total_reviews BIGINT,
    conversion_rate NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(DISTINCT b.id) as total_completed_classes,
        COUNT(DISTINCT r.id) as total_reviews,
        ROUND(
            (COUNT(DISTINCT r.id)::numeric /
            NULLIF(COUNT(DISTINCT b.id), 0) * 100), 2
        ) as conversion_rate
    FROM bookings b
    JOIN classes c ON b.class_id = c.id
    LEFT JOIN reviews r ON b.id = r.booking_id
    WHERE b.status = 'checked_in'
    AND c.date BETWEEN p_start_date AND p_end_date;
END;
$$ LANGUAGE plpgsql;

-- Función: Obtener top tags usados
CREATE OR REPLACE FUNCTION get_top_review_tags(
    p_limit INTEGER DEFAULT 10,
    p_instructor_id UUID DEFAULT NULL
)
RETURNS TABLE (
    tag_id UUID,
    tag_name VARCHAR,
    tag_icon VARCHAR,
    category VARCHAR,
    usage_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        rt.id,
        rt.name,
        rt.icon,
        rt.category,
        COUNT(rts.id) as usage_count
    FROM review_tags rt
    LEFT JOIN review_tag_selections rts ON rt.id = rts.tag_id
    LEFT JOIN reviews r ON rts.review_id = r.id
    WHERE rt.is_active = true
    AND (p_instructor_id IS NULL OR r.instructor_id = p_instructor_id)
    GROUP BY rt.id, rt.name, rt.icon, rt.category
    ORDER BY usage_count DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Función: Calcular distancia desde el estudio
CREATE OR REPLACE FUNCTION calculate_distance_from_studio(
    p_lat DECIMAL,
    p_lon DECIMAL
)
RETURNS DECIMAL AS $$
DECLARE
    studio_lat DECIMAL := 19.4326;  -- TODO: Obtener de settings
    studio_lon DECIMAL := -99.1332;
    R DECIMAL := 6371000; -- Radio de la tierra en metros
    dlat DECIMAL;
    dlon DECIMAL;
    a DECIMAL;
    c DECIMAL;
BEGIN
    dlat := radians(p_lat - studio_lat);
    dlon := radians(p_lon - studio_lon);

    a := sin(dlat/2) * sin(dlat/2) +
         cos(radians(studio_lat)) * cos(radians(p_lat)) *
         sin(dlon/2) * sin(dlon/2);
    c := 2 * atan2(sqrt(a), sqrt(1-a));

    RETURN R * c;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- DATOS INICIALES
-- ============================================

-- Tags predefinidos para reseñas
INSERT INTO review_tags (name, name_en, category, icon, sort_order) VALUES
-- Positivos
('Excelente instructora', 'Excellent instructor', 'positive', '⭐', 1),
('Música increíble', 'Amazing music', 'positive', '🎵', 2),
('Buen ambiente', 'Great atmosphere', 'positive', '✨', 3),
('Ejercicios desafiantes', 'Challenging exercises', 'positive', '💪', 4),
('Buenas correcciones', 'Good corrections', 'positive', '👍', 5),
('Motivadora', 'Motivating', 'positive', '🔥', 6),
('Clase bien estructurada', 'Well structured class', 'positive', '📋', 7),
('Atención personalizada', 'Personal attention', 'positive', '🎯', 8),

-- Neutrales
('Clase intensa', 'Intense class', 'neutral', '💨', 10),
('Para todos los niveles', 'For all levels', 'neutral', '👥', 11),
('Clase relajante', 'Relaxing class', 'neutral', '🧘', 12),

-- Áreas de mejora
('Muy lleno', 'Too crowded', 'negative', '👥', 20),
('Música muy alta', 'Music too loud', 'negative', '🔊', 21),
('Faltó atención', 'Needed more attention', 'negative', '👀', 22),
('Clase corta', 'Class too short', 'negative', '⏱️', 23),
('Demasiado fácil', 'Too easy', 'negative', '😴', 24),
('Demasiado difícil', 'Too difficult', 'negative', '😰', 25);

-- Configuración de reseñas en system_settings
INSERT INTO system_settings (key, value, description)
VALUES (
    'review_settings',
    '{
        "points_for_review": 50,
        "points_for_detailed_comment": 25,
        "min_comment_length_for_bonus": 50,
        "request_delay_hours": 2,
        "reminder_intervals_hours": [24, 72],
        "max_reminders": 2,
        "review_expiry_days": 7
    }'::jsonb,
    'Configuración del sistema de reseñas'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Configuración de check-in en system_settings
INSERT INTO system_settings (key, value, description)
VALUES (
    'checkin_settings',
    '{
        "methods_enabled": ["qr_scan", "manual_reception", "self_checkin"],
        "self_checkin_enabled": true,
        "self_checkin_radius_meters": 200,
        "late_threshold_minutes": 10,
        "early_checkin_minutes": 30,
        "require_geolocation": false,
        "track_device_fingerprint": true
    }'::jsonb,
    'Configuración del sistema de check-in'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- ============================================
-- COMENTARIOS Y DOCUMENTACIÓN
-- ============================================

COMMENT ON TABLE checkin_logs IS 'Log detallado de todos los check-ins con tracking de dispositivo y ubicación';
COMMENT ON TABLE reviews IS 'Reseñas de clases con ratings múltiples y sistema de puntos';
COMMENT ON TABLE review_tags IS 'Tags predefinidos que los usuarios pueden seleccionar en sus reseñas';
COMMENT ON TABLE review_tag_selections IS 'Relación many-to-many entre reseñas y tags';
COMMENT ON TABLE review_responses IS 'Respuestas del estudio a las reseñas de los clientes';
COMMENT ON TABLE suspicious_activity IS 'Registro de actividad sospechosa detectada automáticamente';
COMMENT ON TABLE wallet_pass_updates IS 'Historial de actualizaciones enviadas a los pases de wallet';
COMMENT ON TABLE review_requests IS 'Cola de solicitudes de reseña pendientes de enviar';

COMMENT ON FUNCTION detect_suspicious_checkin() IS 'Trigger que detecta automáticamente actividad sospechosa en check-ins';
COMMENT ON FUNCTION award_review_points() IS 'Trigger que otorga puntos de lealtad cuando se publica una reseña';
COMMENT ON FUNCTION create_review_request() IS 'Trigger que crea solicitud de reseña después del check-in';
COMMENT ON FUNCTION get_review_conversion_rate(DATE, DATE) IS 'Calcula tasa de conversión de reseñas en un período';
COMMENT ON FUNCTION get_top_review_tags(INTEGER, UUID) IS 'Obtiene los tags más usados, opcionalmente filtrado por instructor';
COMMENT ON FUNCTION calculate_distance_from_studio(DECIMAL, DECIMAL) IS 'Calcula distancia en metros desde coordenadas hasta el estudio';
