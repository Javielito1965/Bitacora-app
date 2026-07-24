# Cuaderno de Bitácora — puesta en marcha

Aplicación web completa: login con roles (admin / capitán / tripulación), base de
datos real en Supabase, y 5 secciones: Nuevo viaje, Historial, Clientes, Informes
y Configuración.

No usa ninguna librería externa: habla directamente con la API de Supabase
mediante `fetch`, así que no hace falta compilar nada. Son 5 archivos estáticos.

## 1. Crear el proyecto en Supabase (gratis)

1. Ve a https://supabase.com → **New project**.
2. Elige nombre, contraseña de base de datos y región. Espera ~2 minutos a que se cree.
3. En el menú lateral: **SQL Editor → New query**.
4. Abre el archivo `supabase-schema.sql` de esta carpeta, copia todo su contenido,
   pégalo en el editor y pulsa **Run**. Esto crea las tablas, los roles y la seguridad.
5. Ve a **Authentication → Providers** y confirma que **Email** está activado.
   - Para pruebas rápidas puedes desactivar "Confirm email" en
     **Authentication → Settings**, así no hace falta verificar el correo cada vez.
6. Ve a **Project Settings → API**. Copia:
   - `Project URL`
   - `anon public` key

## 2. Configurar la app

Abre `config.js` y sustituye:

```js
const SUPABASE_URL = 'https://TU-PROYECTO.supabase.co';
const SUPABASE_ANON_KEY = 'TU-CLAVE-ANON-PUBLICA';
```

por los valores que copiaste en el paso anterior. **La clave `anon` es pública y
segura de exponer en el navegador** — la seguridad real la da la Row Level
Security (RLS) que ya quedó configurada por el script SQL.

## 3. Probarlo en local

Solo necesitas un servidor estático (no puedes abrir `index.html` con doble clic
porque el navegador bloquea algunas peticiones desde `file://`). Por ejemplo:

```bash
cd bitacora-app
python3 -m http.server 8080
```

Y abre `http://localhost:8080`.

La primera cuenta que crees en "Crear cuenta" entra como **Tripulación**. Para
convertirte en capitán/admin tienes dos opciones:
- Entra a Supabase → **Table Editor → profiles**, busca tu fila y cambia `rol` a `capitan` o `admin` a mano.
- O pide a otro admin que te lo cambie desde Configuración → Tripulación registrada.

## 4. Publicar la web de verdad

Cualquier hosting de archivos estáticos vale. Las más sencillas:

**Netlify** (arrastrar y soltar):
1. https://app.netlify.com/drop
2. Arrastra la carpeta `bitacora-app` completa (con `config.js` ya relleno).
3. Netlify te da una URL `https://algo.netlify.app` — ya está en internet.

**Vercel**:
```bash
npm i -g vercel
cd bitacora-app
vercel --prod
```

**GitHub Pages**: sube la carpeta a un repositorio y activa Pages en
Settings → Pages → branch `main` → carpeta raíz.

En cualquiera de los tres puedes luego añadir tu propio dominio desde el panel
del proveedor.

## Qué incluye cada sección

- **Nuevo viaje**: formulario con fecha, cliente, motivo, horas de motor y
  generador, litros de combustible al inicio/fin y precio del día. Calcula en
  vivo horas de motor/generador usadas, consumo en litros y coste total.
- **Historial**: todas las entradas, con filtro por cliente y por mes. Cualquiera
  puede editar; solo capitán/admin pueden borrar.
- **Clientes**: alta y baja de clientes, alimenta el desplegable de "Nuevo viaje".
- **Informes**: coste del mes actual, coste histórico total, litros consumidos,
  consumo medio (L/hora de motor), horas totales de motor y generador, y un
  desglose de coste por cliente.
- **Configuración**: nombre de la embarcación y aviso de horas para revisión de
  motor (solo capitán/admin), tu propio nombre, y — si eres capitán/admin —
  gestión de roles de toda la tripulación registrada.

## Seguridad — qué revisar antes de usarlo en producción

El script SQL deja unas políticas razonables de partida (cualquier usuario
autenticado ve y crea datos; solo capitán/admin borra viajes o cambia roles),
pero antes de un uso serio conviene que:
- Actives "Confirm email" en Supabase para evitar altas con correos falsos.
- Revises tú mismo las políticas en **Authentication → Policies** y las ajustes
  a cómo de abierta o cerrada quieres que sea la tripulación.
- Hagas copias de seguridad periódicas de la base de datos (Supabase las ofrece
  automáticamente en el plan de pago; en el gratuito, exporta desde
  **Database → Backups** o programa tú un `pg_dump`).

## Ideas para ampliar más adelante

- Alertas visuales cuando las horas de motor se acerquen al aviso de revisión configurado.
- Exportar el historial a PDF o Excel.
- Adjuntar fotos o documentos a cada viaje (Supabase Storage encaja bien aquí).
- Varias embarcaciones si en el futuro gestionas más de un barco.
