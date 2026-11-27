package app.nutrify.data;

import app.nutrify.nutrition.Json;
import java.math.BigDecimal;
import java.sql.Array;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import tools.jackson.core.type.TypeReference;

/** Lectura de columnas de Postgres a tipos de Java. */
final class Rows {
  private Rows() {}

  static String id(ResultSet rs, String col) throws SQLException {
    Object v = rs.getObject(col);
    return v == null ? null : v.toString();
  }

  static LocalDate date(ResultSet rs, String col) throws SQLException {
    return rs.getObject(col, LocalDate.class);
  }

  static OffsetDateTime ts(ResultSet rs, String col) throws SQLException {
    return rs.getObject(col, OffsetDateTime.class);
  }

  static double num(ResultSet rs, String col) throws SQLException {
    BigDecimal v = rs.getBigDecimal(col);
    return v == null ? 0 : v.doubleValue();
  }

  static Double numOrNull(ResultSet rs, String col) throws SQLException {
    BigDecimal v = rs.getBigDecimal(col);
    return v == null ? null : v.doubleValue();
  }

  static List<String> texts(ResultSet rs, String col) throws SQLException {
    Array a = rs.getArray(col);
    if (a == null) return List.of();
    List<String> out = new ArrayList<>();
    for (Object o : (Object[]) a.getArray()) if (o != null) out.add(o.toString());
    return out;
  }

  /** Columna jsonb → objeto (null o JSON roto → valor por defecto). */
  static <T> T json(ResultSet rs, String col, TypeReference<T> type, T fallback) throws SQLException {
    String s = rs.getString(col);
    if (s == null) return fallback;
    try {
      T v = Json.MAPPER.readValue(s, type);
      return v == null ? fallback : v;
    } catch (Exception e) {
      return fallback;
    }
  }

  static String jsonb(Object value) {
    return Json.write(value);
  }
}
