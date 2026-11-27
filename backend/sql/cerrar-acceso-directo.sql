-- Cerrar el acceso directo: el navegador no habla con las tablas, solo el backend.
--
-- Para un proyecto de Supabase donde todos los datos pasan por el backend (el frontend usa Supabase solo para el login).
-- Si algún cliente lee o escribe las tablas directo con la clave anon, deja de andar.
--
-- Qué hace:
--  1. Le saca al rol anon (visitante sin sesión) todo permiso sobre las tablas de la app.
--     El backend nunca lo usa: entra como postgres y cambia al rol authenticated con RLS (ver UserDb.java).
--  2. Que nadie nuevo los reciba por defecto: las tablas que se creen después tampoco quedan abiertas para anon.
--  3. Confirma que RLS sigue activo en todas, con su política "own rows".
--
-- El rol authenticated conserva sus permisos porque el backend lo usa. Al navegador (que también entra
-- como authenticated, por la Data API) se le corta el acceso apagando la Data API en el panel: ver backend/README.md.
--
-- Se puede correr más de una vez.

do $$
declare t text;
begin
  foreach t in array array['foods', 'saved_meals', 'entries', 'settings', 'water', 'steps', 'routines', 'workouts', 'ai_cache', 'exercises', 'weights'] loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke all on table public.%I from anon', t);
      execute format('alter table public.%I enable row level security', t);
    end if;
  end loop;
end $$;

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

-- Verificación: cada fila tiene que dar ✅
select check_name, case when ok then '✅' else '❌' end as estado
from (
  select 'anon sin permisos en ' || t as check_name,
         not has_table_privilege('anon', 'public.' || t, 'select, insert, update, delete, truncate, references, trigger') as ok, 1 as orden, t
  from unnest(array['foods', 'saved_meals', 'entries', 'settings', 'water', 'steps', 'routines', 'workouts', 'ai_cache', 'exercises', 'weights']) as t
  union all
  select 'backend (authenticated) puede usar ' || t,
         has_table_privilege('authenticated', 'public.' || t, 'select, insert, update, delete'), 2, t
  from unnest(array['foods', 'saved_meals', 'entries', 'settings', 'water', 'steps', 'routines', 'workouts', 'ai_cache', 'exercises', 'weights']) as t
  union all
  select 'RLS activo en ' || t,
         coalesce((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
                   where n.nspname = 'public' and c.relname = t), false), 3, t
  from unnest(array['foods', 'saved_meals', 'entries', 'settings', 'water', 'steps', 'routines', 'workouts', 'ai_cache', 'exercises', 'weights']) as t
  union all
  select 'política "own rows" en ' || t,
         exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t and p.policyname = 'own rows'), 4, t
  from unnest(array['foods', 'saved_meals', 'entries', 'settings', 'water', 'steps', 'routines', 'workouts', 'ai_cache', 'exercises', 'weights']) as t
) checks
order by orden, t;
