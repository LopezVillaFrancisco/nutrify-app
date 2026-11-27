-- Ejecutar en Supabase: SQL Editor > New query > Run
-- Cada tabla tiene user_id = auth.uid() por defecto y RLS que restringe a cada usuario a lo suyo.

create table if not exists public.foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  aliases text[] not null default '{}',
  kcal_per_100g numeric not null default 0,
  protein_per_100g numeric not null default 0,
  carbs_per_100g numeric not null default 0,
  fat_per_100g numeric not null default 0,
  default_portion_g numeric,
  unit_label text,               -- ej. 'scoop', 'unidad', 'cucharada'
  created_at timestamptz not null default now()
);

create table if not exists public.saved_meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  items jsonb not null default '[]'::jsonb,   -- array de textos, ej. ["1 scoop whey", "300 ml leche"]
  created_at timestamptz not null default now()
);

create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  meal text not null check (meal in ('desayuno', 'almuerzo', 'merienda', 'cena')),
  eaten_at timestamptz not null default now(),
  raw_text text,
  food_name text not null,
  grams numeric,
  kcal numeric not null default 0,
  protein numeric not null default 0,
  carbs numeric not null default 0,
  fat numeric not null default 0,
  source text not null check (source in ('guardado', 'base', 'revisar')),
  created_at timestamptz not null default now()
);
create index if not exists entries_user_date_idx on public.entries (user_id, date);

create table if not exists public.settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  kcal_goal numeric not null default 2350,
  protein_goal numeric not null default 160
);
-- Rango "en tu rango" (% de la meta de kcal). Seguro de correr de nuevo sobre una base existente.
alter table public.settings add column if not exists range_low_pct numeric not null default 80;
alter table public.settings add column if not exists range_high_pct numeric not null default 110;
-- Datos del cuerpo y metas de pasos y agua
alter table public.settings add column if not exists weight_kg numeric;
alter table public.settings add column if not exists height_cm numeric;
alter table public.settings add column if not exists steps_goal integer not null default 10000;
alter table public.settings add column if not exists water_goal_ml integer;   -- null = automático (35 ml por kg)
-- Uso de IA: auto | ask (preguntar antes) | off
alter table public.settings add column if not exists ai_mode text not null default 'ask';
alter table public.settings add column if not exists water_cups jsonb;
alter table public.foods add column if not exists category text;          -- tipo (carnes, harinas…); null = se adivina por el nombre
alter table public.saved_meals add column if not exists meal text;        -- desayuno, almuerzo…; null = cualquier momento   -- tus vasos: [{"name":"Copa","ml":400}]

-- Colación como comida más (se reemplaza el check original)
alter table public.entries drop constraint if exists entries_meal_check;
alter table public.entries add constraint entries_meal_check
  check (meal in ('desayuno', 'almuerzo', 'merienda', 'colacion', 'cena'));

-- Agua: cada vaso o botella que tomás
create table if not exists public.water (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  ml integer not null check (ml > 0 and ml <= 5000),
  drank_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists water_user_date_idx on public.water (user_id, date);

-- Pasos: cargados a mano (del día) o calculados de la caminadora (minutos × velocidad)
create table if not exists public.steps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  kind text not null check (kind in ('dia', 'caminadora')),
  steps integer not null check (steps >= 0 and steps <= 200000),
  minutes numeric,          -- solo caminadora
  speed_kmh numeric,        -- solo caminadora
  distance_km numeric,      -- solo caminadora
  created_at timestamptz not null default now()
);
create index if not exists steps_user_date_idx on public.steps (user_id, date);

-- Gym: rutinas (plantillas) y entrenamientos hechos
create table if not exists public.routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  exercises jsonb not null default '[]'::jsonb,   -- [{ "name": "Press banca", "sets": 4, "reps": 8 }]
  created_at timestamptz not null default now()
);

create table if not exists public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  routine_id uuid references public.routines(id) on delete set null,
  name text not null,
  exercises jsonb not null default '[]'::jsonb,   -- [{ "name": "...", "sets": [{ "reps": 8, "kg": 60, "done": true }] }]
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists workouts_user_date_idx on public.workouts (user_id, date desc);

-- Tus ejercicios: los que creaste y los cambios a la lista de la app (músculo, salto de kilos, ocultar, renombrar)
create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  muscle text not null default 'Otro',
  step numeric not null default 2.5,          -- cuánto suben/bajan los botones de kilos
  base text,                                  -- nombre del ejercicio de la app que reemplaza (si lo editaste o renombraste)
  hidden boolean not null default false,      -- true = no aparece en la lista
  created_at timestamptz not null default now()
);
create unique index if not exists exercises_user_name_idx on public.exercises (user_id, lower(name));

-- Pesajes (uno por día; si te pesás de nuevo ese día, se reemplaza)
create table if not exists public.weights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  kg numeric not null check (kg > 0 and kg < 500),
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

-- Memoria de respuestas de la IA (para no volver a preguntar lo mismo y cuidar la cuota gratis)
create table if not exists public.ai_cache (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key text not null,
  value jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- Row Level Security: cada usuario solo ve y modifica lo suyo
alter table public.ai_cache enable row level security;
alter table public.foods enable row level security;
alter table public.saved_meals enable row level security;
alter table public.entries enable row level security;
alter table public.settings enable row level security;
alter table public.water enable row level security;
alter table public.steps enable row level security;
alter table public.routines enable row level security;
alter table public.workouts enable row level security;
alter table public.exercises enable row level security;
alter table public.weights enable row level security;

do $$
declare t text;
begin
  foreach t in array array['foods', 'saved_meals', 'entries', 'settings', 'water', 'steps', 'routines', 'workouts', 'ai_cache', 'exercises', 'weights'] loop
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated
         using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;
