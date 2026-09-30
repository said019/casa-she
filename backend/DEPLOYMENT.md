# Runtime de producción

Usar el Dockerfile de backend (rootDirectory backend) para conservar Node directo al clonar en otro equipo/proveedor. Variables, secretos y datos persistentes quedan fuera del repositorio. El mismo entrypoint mantiene las tareas y el esquema existentes.

El CMD inicia node dist/index.js, sin npm padre; las migraciones existentes pertenecen al entrypoint y no se duplican aquí.
