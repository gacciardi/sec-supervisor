.-- =====================================================
-- SEC - Datos iniciales
-- =====================================================

-- CANALES
INSERT INTO canales (nombre, permanencia_minima)
VALUES
('KIOSCO', 3),
('ALMACEN', 5),
('AUTOSERVICIO', 8),
('MINIMERCADO', 10),
('MAYORISTA', 15)
ON CONFLICT (nombre) DO NOTHING;

-- FRECUENCIAS
INSERT INTO frecuencias 
(nombre, lunes, martes, miercoles, jueves, viernes, sabado)
VALUES
('LUNES-JUEVES', true, false, false, true, false, false),
('MARTES-VIERNES', false, true, false, false, true, false),
('MIERCOLES-SABADO', false, false, true, false, false, true)
ON CONFLICT (nombre) DO NOTHING;

-- USUARIO ADMIN
INSERT INTO usuarios
(nombre, apellido, email, rol, activo)
VALUES
('Administrador', 'SEC', 'admin@sec.com', 'ADMIN', true)
ON CONFLICT (email) DO NOTHING;

-- SUPERVISORES INICIALES
INSERT INTO usuarios
(nombre, apellido, email, rol, activo)
VALUES
('Supervisor', 'Uno', 'supervisor1@sec.com', 'SUPERVISOR', true),
('Supervisor', 'Dos', 'supervisor2@sec.com', 'SUPERVISOR', true)
ON CONFLICT (email) DO NOTHING;

-- VENDEDORES DE PRUEBA
INSERT INTO usuarios
(nombre, apellido, email, rol, activo)
VALUES
('Vendedor', 'Prueba 1', 'vendedor1@sec.com', 'VENDEDOR', true),
('Vendedor', 'Prueba 2', 'vendedor2@sec.com', 'VENDEDOR', true)
ON CONFLICT (email) DO NOTHING;