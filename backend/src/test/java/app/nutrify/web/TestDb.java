package app.nutrify.web;

import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Un Postgres 17 real para los tests, armado como un proyecto de Supabase:
 *  1. lo mínimo de Supabase: esquema auth (auth.users, auth.uid()), roles anon y authenticated,
 *     y los permisos que Supabase da por defecto a los dos sobre las tablas de public;
 *  2. supabase/schema.sql tal cual está en el repo;
 *  3. backend/sql/cerrar-acceso-directo.sql.
 * Así todos los tests de datos corren sobre la base ya cerrada: si ese SQL rompiera el backend, fallarían.
 */
final class TestDb {
  private TestDb() {}

  private static EmbeddedPostgres pg;

  static final Path LOCKDOWN = Path.of("sql", "cerrar-acceso-directo.sql");

  static synchronized EmbeddedPostgres get() {
    if (pg != null) return pg;
    try {
      pg = EmbeddedPostgres.builder().start();
      JdbcTemplate admin = admin();
      admin.execute("""
          create role anon nologin noinherit;
          create role authenticated nologin noinherit;
          create schema auth;
          create table auth.users (id uuid primary key);
          create function auth.uid() returns uuid language sql stable as $$
            select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                            (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid
          $$;
          grant usage on schema auth to anon, authenticated;
          grant execute on function auth.uid() to anon, authenticated;
          grant usage on schema public to anon, authenticated;
          -- Como Supabase: lo que se crea en public queda abierto para anon y authenticated (lo filtra RLS)
          alter default privileges in schema public grant all on tables to anon, authenticated;
          """);
      admin.execute(Files.readString(Path.of("..", "supabase", "schema.sql")));
      admin.execute(Files.readString(LOCKDOWN));
      return pg;
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  static JdbcTemplate admin() {
    return new JdbcTemplate(get().getPostgresDatabase());
  }

  /** La consulta de verificación del final de cerrar-acceso-directo.sql. */
  static String verificationQuery() {
    try {
      String sql = Files.readString(LOCKDOWN);
      return sql.substring(sql.lastIndexOf("select check_name")).replaceAll(";\\s*$", "");
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }
}
