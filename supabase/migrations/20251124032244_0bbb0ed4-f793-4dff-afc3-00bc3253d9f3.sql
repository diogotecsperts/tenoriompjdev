-- Promover usuário diogotecinove@gmail.com para administrador
INSERT INTO user_roles (user_id, role)
VALUES ('8bf90dc6-ce42-4cb1-b89d-4bd5f16688e4', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;