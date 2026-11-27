package app.nutrify.db;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.function.Function;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.ResultSetExtractor;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Consultas a Postgres como el usuario del token, con RLS activo (igual que cuando la app hablaba con Supabase directo).
 *
 * Cada trabajo corre en una transacción que primero hace lo mismo que PostgREST:
 *   set_config('request.jwt.claims', <claims del token>, true) y set_config('role', 'authenticated', true).
 * Así auth.uid() devuelve el usuario y las políticas "own rows" de schema.sql filtran solas.
 * Aunque una consulta se olvide de filtrar por user_id, la base no devuelve filas de otro usuario.
 */
@Component
public class UserDb {
  private static final ResultSetExtractor<Void> IGNORE = rs -> null;

  private final JdbcTemplate jdbc;
  private final TransactionTemplate tx;

  public UserDb(JdbcTemplate jdbc, TransactionTemplate tx) {
    this.jdbc = jdbc;
    this.tx = tx;
  }

  public <T> T run(Jwt jwt, Function<JdbcTemplate, T> work) {
    String claims = claimsJson(jwt);
    return tx.execute(status -> {
      jdbc.query("select set_config('request.jwt.claims', ?, true), set_config('role', 'authenticated', true)", IGNORE, claims);
      return work.apply(jdbc);
    });
  }

  /** El JSON original del token (lo que Supabase espera en request.jwt.claims). */
  static String claimsJson(Jwt jwt) {
    String[] parts = jwt.getTokenValue().split("\\.");
    return new String(Base64.getUrlDecoder().decode(parts[1]), StandardCharsets.UTF_8);
  }

  /** Para /health: la base responde (sin usuario). */
  public boolean ping() {
    try {
      Integer one = jdbc.queryForObject("select 1", Integer.class);
      return one != null && one == 1;
    } catch (Exception e) {
      return false;
    }
  }
}
