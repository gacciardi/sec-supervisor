.CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS usuarios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre VARCHAR(100) NOT NULL,
    apellido VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    rol VARCHAR(20) NOT NULL CHECK (rol IN ('ADMIN','SUPERVISOR','VENDEDOR')),
    firebase_uid VARCHAR(255),
    activo BOOLEAN DEFAULT TRUE,
    deleted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS canales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre VARCHAR(100) NOT NULL UNIQUE,
    permanencia_minima INTEGER NOT NULL,
    activo BOOLEAN DEFAULT TRUE,
    deleted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS frecuencias (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre VARCHAR(100) NOT NULL UNIQUE,
    lunes BOOLEAN DEFAULT FALSE,
    martes BOOLEAN DEFAULT FALSE,
    miercoles BOOLEAN DEFAULT FALSE,
    jueves BOOLEAN DEFAULT FALSE,
    viernes BOOLEAN DEFAULT FALSE,
    sabado BOOLEAN DEFAULT FALSE,
    activo BOOLEAN DEFAULT TRUE,
    deleted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS clientes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    codigo_cliente VARCHAR(100),
    nombre VARCHAR(200) NOT NULL,
    direccion TEXT,
    latitud NUMERIC(10,7) NOT NULL,
    longitud NUMERIC(10,7) NOT NULL,
    radio_geocerca INTEGER DEFAULT 30,
    canal_id UUID REFERENCES canales(id),
    vendedor_id UUID REFERENCES usuarios(id),
    categoria VARCHAR(1) CHECK (categoria IN ('A','B','C')),
    activo BOOLEAN DEFAULT TRUE,
    deleted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clientes_vendedor 
ON clientes(vendedor_id);

CREATE INDEX IF NOT EXISTS idx_clientes_codigo 
ON clientes(codigo_cliente);
CREATE TABLE IF NOT EXISTS supervisores_vendedores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supervisor_id UUID NOT NULL REFERENCES usuarios(id),
    vendedor_id UUID NOT NULL REFERENCES usuarios(id),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(supervisor_id, vendedor_id)
);

CREATE TABLE IF NOT EXISTS visitas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    cliente_id UUID NOT NULL REFERENCES clientes(id),
    vendedor_id UUID NOT NULL REFERENCES usuarios(id),

    fecha DATE NOT NULL,
    hora_llegada TIMESTAMP,
    hora_salida TIMESTAMP,

    permanencia_segundos INTEGER,

    dentro_geocerca BOOLEAN DEFAULT FALSE,

    latitud_llegada NUMERIC(10,7),
    longitud_llegada NUMERIC(10,7),

    latitud_salida NUMERIC(10,7),
    longitud_salida NUMERIC(10,7),

    observaciones TEXT,

    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_visitas_cliente
ON visitas(cliente_id);

CREATE INDEX IF NOT EXISTS idx_visitas_vendedor
ON visitas(vendedor_id);

CREATE INDEX IF NOT EXISTS idx_visitas_fecha
ON visitas(fecha);
CREATE TABLE IF NOT EXISTS gps_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vendedor_id UUID NOT NULL REFERENCES usuarios(id),
    latitud NUMERIC(10,7) NOT NULL,
    longitud NUMERIC(10,7) NOT NULL,
    precision_metros NUMERIC(10,2),
    velocidad NUMERIC(10,2),
    fecha_hora TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gps_logs_vendedor_fecha
ON gps_logs(vendedor_id, fecha_hora);

CREATE TABLE IF NOT EXISTS alertas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vendedor_id UUID REFERENCES usuarios(id),
    cliente_id UUID REFERENCES clientes(id),
    visita_id UUID REFERENCES visitas(id),
    tipo VARCHAR(100) NOT NULL,
    prioridad VARCHAR(20) CHECK (prioridad IN ('BAJA','MEDIA','ALTA','CRITICA')),
    descripcion TEXT,
    estado VARCHAR(20) DEFAULT 'ABIERTA' CHECK (estado IN ('ABIERTA','REVISADA','CERRADA')),
    fecha_hora TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alertas_vendedor
ON alertas(vendedor_id);

CREATE INDEX IF NOT EXISTS idx_alertas_estado
ON alertas(estado);