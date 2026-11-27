package app.nutrify.db;

import app.nutrify.nutrition.AiCache;
import app.nutrify.nutrition.FoodRow;
import app.nutrify.nutrition.Json;
import java.math.BigDecimal;
import java.sql.Array;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.JsonNode;

@Repository
public class JdbcUserData implements UserData {
  private static final Logger log = LoggerFactory.getLogger(JdbcUserData.class);

  private final UserDb db;

  public JdbcUserData(UserDb db) {
    this.db = db;
  }

  @Override
  public List<FoodRow> foods(Jwt jwt) {
    try {
      return db.run(jwt, jdbc -> jdbc.query(
          "select id::text, name, aliases, kcal_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, default_portion_g, unit_label"
              + " from public.foods",
          (rs, i) -> new FoodRow(rs.getString(1), rs.getString(2), texts(rs.getArray(3)), num(rs, 4), num(rs, 5), num(rs, 6), num(rs, 7),
              rs.getBigDecimal(8) == null ? null : rs.getBigDecimal(8).doubleValue(), rs.getString(9))));
    } catch (Exception e) {
      log.warn("No se pudieron leer los alimentos: {}", e.getMessage());
      return List.of();
    }
  }

  @Override
  public String aiMode(Jwt jwt) {
    try {
      // to_jsonb: tolera bases viejas sin la columna ai_mode
      List<String> modes = db.run(jwt, jdbc -> jdbc.queryForList("select to_jsonb(s) ->> 'ai_mode' from public.settings s limit 1", String.class));
      return modes.isEmpty() ? null : modes.get(0);
    } catch (Exception e) {
      log.warn("No se pudo leer settings: {}", e.getMessage());
      return null;
    }
  }

  @Override
  public AiCache cache(Jwt jwt) {
    return new AiCache() {
      @Override
      public Map<String, JsonNode> load(List<String> keys) {
        Map<String, JsonNode> out = new LinkedHashMap<>();
        List<String> unique = List.copyOf(new LinkedHashSet<>(keys));
        if (unique.isEmpty()) return out;
        try {
          db.run(jwt, jdbc -> jdbc.query(con -> {
            var ps = con.prepareStatement("select key, value::text from public.ai_cache where key = any(?)");
            ps.setArray(1, con.createArrayOf("text", unique.toArray()));
            return ps;
          }, rs -> {
            while (rs.next()) out.put(rs.getString(1), Json.parse(rs.getString(2)));
            return null;
          }));
        } catch (Exception e) {
          log.warn("No se pudo leer ai_cache: {}", e.getMessage());
        }
        return out;
      }

      @Override
      public void save(List<Map.Entry<String, JsonNode>> entries) {
        if (entries.isEmpty()) return;
        // Si una clave se repite, gana la última (como el upsert de PostgREST con todas juntas)
        Map<String, JsonNode> last = new LinkedHashMap<>();
        for (Map.Entry<String, JsonNode> e : entries) last.put(e.getKey(), e.getValue());
        List<Object[]> rows = new ArrayList<>();
        last.forEach((k, v) -> rows.add(new Object[] {k, Json.write(v)}));
        try {
          db.run(jwt, jdbc -> jdbc.batchUpdate(
              "insert into public.ai_cache (key, value) values (?, ?::jsonb) on conflict (user_id, key) do update set value = excluded.value",
              rows));
        } catch (Exception e) {
          log.warn("No se pudo guardar ai_cache: {}", e.getMessage());
        }
      }
    };
  }

  private static double num(ResultSet rs, int col) throws SQLException {
    BigDecimal v = rs.getBigDecimal(col);
    return v == null ? 0 : v.doubleValue();
  }

  private static List<String> texts(Array a) throws SQLException {
    if (a == null) return List.of();
    Object[] arr = (Object[]) a.getArray();
    List<String> out = new ArrayList<>(arr.length);
    for (Object o : arr) if (o != null) out.add(o.toString());
    return out;
  }
}
