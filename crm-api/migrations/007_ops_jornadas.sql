-- ops.jornadas — registro de jornada laboral (Control Horario de OPS)
--
-- Es la única tabla que el server.js de crm-api usa y que no existe en la base.
-- Sin ella, las cuatro rutas de fichaje devuelven 500.
--
-- Las columnas salen del contraste con el código (07/08/2026):
--   POST /api/ops/jornadas/entrada  -> user_id, org_id, fecha, entrada,
--                                      lat_entrada, lng_entrada, direccion_entrada
--   PUT  /api/ops/jornadas/:id/salida -> salida, total_minutos,
--                                      lat_salida, lng_salida, direccion_salida
--   PUT  /api/ops/jornadas/:id      -> tipo, notas, direccion_entrada, direccion_salida
--   GET  /api/ops/jornadas          -> JOIN core.users ON u.id = j.user_id
--
-- Nota legal (Estonia, empleador Novitum OÜ): el registro de tiempo de trabajo
-- debe reflejar horas diarias y semanales incluyendo horas extra, y conservarse.
-- Por eso `tipo` clasifica la jornada (normal / extra / guardia) y no se borran
-- filas: las correcciones dejan rastro en updated_at. Ver la nota de la sesión.

CREATE TABLE IF NOT EXISTS ops.jornadas (
  id                 SERIAL PRIMARY KEY,
  user_id            INTEGER     NOT NULL REFERENCES core.users(id),
  org_id             INTEGER     NOT NULL DEFAULT 1,

  fecha              DATE        NOT NULL DEFAULT CURRENT_DATE,
  entrada            TIMESTAMPTZ,
  salida             TIMESTAMPTZ,
  total_minutos      INTEGER,

  -- clasificación de la jornada: exigido para poder separar horas extra
  tipo               TEXT        NOT NULL DEFAULT 'normal',

  -- geolocalización del fichaje (opcional: el móvil puede no darla)
  lat_entrada        NUMERIC(10,7),
  lng_entrada        NUMERIC(10,7),
  direccion_entrada  TEXT,
  lat_salida         NUMERIC(10,7),
  lng_salida         NUMERIC(10,7),
  direccion_salida   TEXT,

  notas              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT jornadas_tipo_valido
    CHECK (tipo IN ('normal','extra','guardia','ausencia')),
  CONSTRAINT jornadas_salida_posterior
    CHECK (salida IS NULL OR entrada IS NULL OR salida >= entrada)
);

-- El código busca la jornada abierta del día: WHERE user_id = $1 AND fecha = $2 AND salida IS NULL
CREATE INDEX IF NOT EXISTS jornadas_user_fecha_idx
  ON ops.jornadas (user_id, fecha DESC);

-- Impide dos fichajes de entrada abiertos a la vez para el mismo trabajador.
-- El código ya lo comprueba antes de insertar, pero una carrera entre dos
-- peticiones se lo saltaría; esto lo cierra en la base.
CREATE UNIQUE INDEX IF NOT EXISTS jornadas_una_abierta_por_usuario
  ON ops.jornadas (user_id)
  WHERE salida IS NULL;

CREATE INDEX IF NOT EXISTS jornadas_org_fecha_idx
  ON ops.jornadas (org_id, fecha DESC);

-- updated_at automático: las correcciones de jornada dejan rastro
CREATE OR REPLACE FUNCTION ops.jornadas_touch() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS jornadas_touch_trg ON ops.jornadas;
CREATE TRIGGER jornadas_touch_trg
  BEFORE UPDATE ON ops.jornadas
  FOR EACH ROW EXECUTE FUNCTION ops.jornadas_touch();

COMMENT ON TABLE  ops.jornadas IS
  'Registro de jornada laboral. Conservar al menos 5 años (Tööinspektsioon).';
COMMENT ON COLUMN ops.jornadas.tipo IS
  'normal | extra | guardia | ausencia — permite separar horas extra en los informes';
