package app.nutrify.web;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * backend/sql/cerrar-acceso-directo.sql sobre el Postgres de los tests:
 * el rol anon ya no toca las tablas, el backend (authenticated + RLS) sigue andando, y el SQL se puede correr de nuevo.
 * Que la API entera sigue funcionando con la base cerrada lo prueba DataApiTest, que usa esta misma base.
 */
class LockdownTest {
  static final List<String> TABLES = List.of("foods", "saved_meals", "entries", "settings", "water", "steps", "routines", "workouts",
      "ai_cache", "exercises", "weights");

  /** Corre una consulta como un rol, en una transacción que se descarta. */
  static void as(String role, String sql) throws SQLException {
    try (Connection con = TestDb.get().getPostgresDatabase().getConnection()) {
      con.setAutoCommit(false);
      try (Statement st = con.createStatement()) {
        st.execute("set local role " + role);
        st.execute("select set_config('request.jwt.claims', '{\"sub\":\"00000000-0000-0000-0000-000000000001\",\"role\":\"" + role + "\"}', true)");
        st.execute(sql);
      } finally {
        con.rollback();
      }
    }
  }

  @Test
  void laVerificacionDaTodoOk() {
    List<Map<String, Object>> rows = TestDb.admin().queryForList(TestDb.verificationQuery());
    assertEquals(TABLES.size() * 4, rows.size());
    for (Map<String, Object> r : rows) assertEquals("✅", r.get("estado"), () -> "falló: " + r.get("check_name"));
  }

  @Test
  void anonYaNoTocaLasTablas() {
    for (String t : TABLES) {
      SQLException e = assertThrows(SQLException.class, () -> as("anon", "select count(*) from public." + t), t);
      assertEquals("42501", e.getSQLState(), "permiso denegado en " + t);
    }
    assertThrows(SQLException.class, () -> as("anon", "insert into public.foods (user_id, name) values ('00000000-0000-0000-0000-000000000001', 'x')"));
  }

  @Test
  void elBackendSigueAndando() throws SQLException {
    // Lo mismo que hace UserDb: rol authenticated con los claims del token (RLS filtra)
    for (String t : TABLES) as("authenticated", "select count(*) from public." + t);
  }

  @Test
  void seCorreDeNuevoSinProblemasYCubreTablasNuevas() throws Exception {
    JdbcTemplate admin = TestDb.admin();
    admin.execute(Files.readString(TestDb.LOCKDOWN));
    for (Map<String, Object> r : admin.queryForList(TestDb.verificationQuery())) assertEquals("✅", r.get("estado"));

    // Una tabla que se cree después tampoco queda abierta para anon (privilegios por defecto)
    admin.execute("create table public.tabla_nueva_test (x int)");
    try {
      assertFalse(admin.queryForObject("select has_table_privilege('anon', 'public.tabla_nueva_test', 'select')", Boolean.class));
      assertTrue(admin.queryForObject("select has_table_privilege('authenticated', 'public.tabla_nueva_test', 'select')", Boolean.class));
    } finally {
      admin.execute("drop table public.tabla_nueva_test");
    }
  }
}
