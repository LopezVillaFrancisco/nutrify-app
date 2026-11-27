# Backend de Nutrify

Spring Boot 4 · Java 21. Hace el cálculo de comida y todo el acceso a los datos del usuario. El frontend solo usa Supabase para iniciar sesión.

## Endpoints

Todos menos `/health` piden `Authorization: Bearer <access_token de Supabase>`.

### Cálculo

| Endpoint | Qué hace |
|---|---|
| `POST /api/analyze` | Texto libre → líneas con kcal y macros (`{ text, allowAi? }`) |
| `GET /api/ai-status` | Estado de la IA antes de usarla (no gasta cuota) |
| `GET /health` | Sin sesión. `db: "ok"` si la base responde |

### Datos

| Endpoints | Tabla | Notas |
|---|---|---|
| `GET /api/me` | — | id y email del token |
| `GET · PUT /api/settings` | settings | Mismas reglas y mensajes que la pantalla de Perfil |
| `GET · POST /api/foods` · `PUT · DELETE /api/foods/{id}` | foods | |
| `GET · POST /api/saved-meals` · `PUT · DELETE /api/saved-meals/{id}` | saved_meals | |
| `GET /api/entries?date=` · `POST /api/entries` · `DELETE /api/entries/{id}` · `DELETE /api/entries?ids=a,b` | entries | El POST guarda todas las líneas o ninguna |
| `POST /api/entries/{id}/replace` | entries | Corregir una línea: borra y guarda las nuevas en una transacción |
| `GET /api/days?from=&to=` · `GET /api/days/logged?from=&to=` | entries | Totales por día calculados en SQL |
| `GET /api/activity?from=&to=` | water, steps, workouts | Agua, pasos y entrenos por día, en una consulta |
| `GET /api/water?date=` · `POST /api/water` · `DELETE /api/water/{id}` | water | |
| `GET /api/steps?date=` · `PUT /api/steps/day` · `POST /api/steps/treadmill` · `DELETE /api/steps/{id}` | steps | Pasos del día: uno solo por día, se reemplaza |
| `GET · PUT /api/weights` · `DELETE /api/weights/{id}` | weights | Uno por día; el más reciente actualiza el peso del Perfil |
| `GET · POST /api/exercises` · `PUT · DELETE /api/exercises/{id}` | exercises | Nombre único sin importar mayúsculas → 409 |
| `POST /api/exercises/rename` | workouts, routines | Renombra en todos los entrenos y rutinas, en una transacción |
| `GET · POST /api/routines` · `PUT · DELETE /api/routines/{id}` | routines | |
| `GET /api/workouts` · `GET /api/workouts/{id}` · `POST /api/workouts` · `PATCH · DELETE /api/workouts/{id}` | workouts | PATCH parcial: `finished_at: null` lo deja sin terminar |
| `POST /api/workouts/today` | workouts | El entreno del día, o uno nuevo vacío |

- Los JSON usan los mismos nombres de campos que los tipos del frontend ([`lib/types.ts`](../frontend/lib/types.ts)): `food_name`, `kcal_per_100g`, `routine_id`…
- Los errores salen siempre como `{"error": "mensaje para el usuario"}`.
- Una fila de otro usuario responde 404, igual que una que no existe.

## Cómo funciona

- **Login:** Supabase Auth. El backend valida el token con las claves públicas del proyecto (`/auth/v1/.well-known/jwks.json`, ES256; o el secreto HS256 de los proyectos viejos): firma, vencimiento, emisor y que `aud` sea `authenticated`. No hay sesión ni cookies en el backend.
- **Base:** Postgres por JDBC. Cada trabajo corre en una transacción que primero hace `set_config('request.jwt.claims', <claims del token>, true)` y `set_config('role', 'authenticated', true)`, igual que PostgREST. Así `auth.uid()` devuelve el usuario y las políticas RLS de [`schema.sql`](../supabase/schema.sql) filtran solas: aunque una consulta se olvide de filtrar por usuario, la base no devuelve filas de otro ([`db/UserDb.java`](src/main/java/app/nutrify/db/UserDb.java)).
- **Cálculo** ([`nutrition/`](src/main/java/app/nutrify/nutrition)):
  1. Parser por reglas: unidades, cantidades en palabras, fracciones, "con" y "y".
  2. Búsqueda en tus alimentos y en una base de alimentos comunes, con tolerancia a errores de tipeo (Damerau-Levenshtein acotada).
  3. Traductor a inglés: diccionario propio y, si no alcanza, MyMemory.
  4. Ranking de resultados de USDA FoodData Central y Open Food Facts.
  5. Gemini como máximo 2 veces por cálculo, con freno por minuto, tope diario y memoria de respuestas (detalle en el [README principal](../README.md#cómo-se-gasta-lo-menos-posible-de-ia)).

  Las búsquedas externas van en paralelo con hilos virtuales. Las tablas de alimentos y el diccionario están en [`resources/nutrition`](src/main/resources/nutrition).

## Variables

Ver [`.env.example`](.env.example). Spring las lee del entorno o de `backend/.env`.

| Variable | Para qué |
|---|---|
| `SUPABASE_URL` | Emisor del token y claves públicas |
| `SUPABASE_JWT_SECRET` | Solo proyectos viejos con tokens HS256 |
| `DB_URL` · `DB_USER` · `DB_PASSWORD` | Postgres (Supabase → Connect → Session pooler) |
| `CORS_ORIGINS` | Orígenes del frontend |
| `FDC_API_KEY` · `GEMINI_API_KEY` · `GEMINI_MODEL` | USDA y Gemini (opcionales) |
| `AI_DISABLED` · `TRANSLATE_DISABLED` | `1` apaga la IA o el traductor |

```bash
./mvnw spring-boot:run
```

## Tests

```bash
./mvnw test
```

No necesitan Supabase, Docker ni internet.

- **`GoldenTest`:** casos de referencia. [`golden.json`](src/test/resources/golden/golden.json) tiene entradas y la salida esperada de cada una, con USDA, Open Food Facts, el traductor y Gemini simulados. Cubre:
  - 76 textos completos;
  - 6 casos con IA: los prompts a Gemini, lo que se guarda en la memoria y los cortes de cuota;
  - cada pieza suelta: parser, gramos, base, traductor y distancia de edición.
- **`ApiTest`:** tokens (válido, vencido, de otro proyecto, anónimo), errores de texto, CORS y `/api/ai-status`.
- **`DataApiTest`:** los endpoints de datos contra un **Postgres 17 real** (embebido). Carga `supabase/schema.sql` sin cambios, más lo mínimo de Supabase: `auth.users`, `auth.uid()` y los roles `anon` y `authenticated`. Cada test crea dos usuarios y comprueba que uno nunca ve ni toca lo del otro: listas, cambios, borrados, la rutina de otro en un entreno y un `update` sin `where` directo en la base. Si se saca el cambio de rol de `UserDb`, fallan 6 de los 7.
- **`LockdownTest`:** el cierre del acceso directo (abajo).

## Cerrar el acceso directo a las tablas

Con el backend en el medio, el navegador no necesita tocar las tablas. Cerrar el acceso directo deja esta API, con su validación, como única puerta a los datos.

1. **SQL Editor:** corré [`sql/cerrar-acceso-directo.sql`](sql/cerrar-acceso-directo.sql).
   - Le saca al rol `anon` (sin sesión) todo permiso sobre las tablas, también sobre las que se creen después.
   - Confirma que RLS y las políticas siguen en cada tabla.
   - Termina con una fila por chequeo: tienen que dar todas ✅. Se puede correr más de una vez.
2. **Panel:** Project Settings → **Data API** → apagá **Enable Data API**.
   - Hace falta porque el navegador entra con el mismo rol que el backend (`authenticated`), así que los permisos de la base no alcanzan para separarlos: se le corta la puerta (PostgREST).
   - El login (Auth) sigue andando, y el backend entra por la conexión directa a Postgres.

`LockdownTest` prueba el paso 1: anon recibe "permiso denegado" en cada tabla, el backend sigue leyendo y escribiendo, y una tabla nueva tampoco queda abierta. `DataApiTest` corre toda la API sobre la base ya cerrada.

Sin este SQL, un proyecto de Supabase deja las tablas con permisos para anon. Ojo: RLS igual le devuelve 0 filas y le rechaza los cambios. Este cierre es una capa más, no el arreglo de un agujero.
