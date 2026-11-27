package app.nutrify.data;

import app.nutrify.db.UserDb;
import app.nutrify.web.ApiError;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Repository;

/** Lo que comiste (tabla entries) y los totales por día. */
@Repository
public class EntriesRepository {

  /** Mismo formato que EntryRow en lib/types.ts. */
  public record Entry(String id, LocalDate date, String meal, @JsonProperty("eaten_at") OffsetDateTime eatenAt,
                      @JsonProperty("raw_text") String rawText, @JsonProperty("food_name") String foodName, Double grams,
                      double kcal, double protein, double carbs, double fat, String source) {}

  public record EntryInput(
      @NotNull(message = "Falta la fecha.") LocalDate date,
      @NotNull(message = "Falta la comida.") @Pattern(regexp = "desayuno|almuerzo|merienda|colacion|cena", message = "Comida inválida.") String meal,
      @JsonProperty("eaten_at") OffsetDateTime eatenAt,
      @JsonProperty("raw_text") @Size(max = 500) String rawText,
      @JsonProperty("food_name") @NotBlank(message = "Falta el nombre del alimento.") @Size(max = 200) String foodName,
      @DecimalMin("0") @DecimalMax("100000") Double grams,
      @NotNull @DecimalMin(value = "0", message = "Las kcal no pueden ser negativas.") @DecimalMax("50000") Double kcal,
      @NotNull @DecimalMin("0") @DecimalMax("5000") Double protein,
      @NotNull @DecimalMin("0") @DecimalMax("5000") Double carbs,
      @NotNull @DecimalMin("0") @DecimalMax("5000") Double fat,
      @NotNull @Pattern(regexp = "guardado|base|revisar", message = "Origen inválido.") String source) {}

  /** Varias líneas de una vez (lo que devuelve /api/analyze, ya con la comida elegida). */
  public record EntriesInput(
      @NotEmpty(message = "No hay nada para guardar.") @Size(max = 60, message = "Son demasiadas líneas de una vez.") List<@Valid EntryInput> entries) {}

  /** Suma de un día (lib/days.ts → DayRow). */
  public record Day(LocalDate date, double kcal, double protein, double carbs, double fat, int count) {}

  /** Agua, pasos y entrenos de un día (Progreso). */
  public record Activity(double water, double steps, int gym) {}

  private static final String COLS = "id, date, meal, eaten_at, raw_text, food_name, grams, kcal, protein, carbs, fat, source";

  private final UserDb db;

  public EntriesRepository(UserDb db) {
    this.db = db;
  }

  private static Entry entry(ResultSet rs, int i) throws SQLException {
    return new Entry(Rows.id(rs, "id"), Rows.date(rs, "date"), rs.getString("meal"), Rows.ts(rs, "eaten_at"), rs.getString("raw_text"),
        rs.getString("food_name"), Rows.numOrNull(rs, "grams"), Rows.num(rs, "kcal"), Rows.num(rs, "protein"), Rows.num(rs, "carbs"),
        Rows.num(rs, "fat"), rs.getString("source"));
  }

  public List<Entry> byDate(Jwt jwt, LocalDate date) {
    return db.run(jwt, jdbc -> jdbc.query("select " + COLS + " from public.entries where date = ? order by eaten_at, created_at", EntriesRepository::entry, date));
  }

  private static List<Entry> insert(JdbcTemplate jdbc, List<EntryInput> rows) {
    OffsetDateTime now = OffsetDateTime.now();
    List<Entry> out = new ArrayList<>();
    for (EntryInput r : rows) {
      out.add(jdbc.queryForObject("""
          insert into public.entries (date, meal, eaten_at, raw_text, food_name, grams, kcal, protein, carbs, fat, source)
          values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) returning""" + " " + COLS, EntriesRepository::entry,
          r.date(), r.meal(), r.eatenAt() != null ? r.eatenAt() : now, r.rawText(), r.foodName().strip(), r.grams(),
          r.kcal(), r.protein(), r.carbs(), r.fat(), r.source()));
    }
    return out;
  }

  /** Todas juntas en una transacción: o se guardan todas o ninguna. */
  public List<Entry> create(Jwt jwt, List<EntryInput> rows) {
    return db.run(jwt, jdbc -> insert(jdbc, rows));
  }

  /** Corregir una línea: se borra y se guardan las nuevas, en la misma transacción (antes eran dos pedidos sueltos). */
  public List<Entry> replace(Jwt jwt, UUID id, List<EntryInput> rows) {
    return db.run(jwt, jdbc -> {
      if (jdbc.update("delete from public.entries where id = ?", id) == 0) throw ApiError.notFound();
      return insert(jdbc, rows);
    });
  }

  public void delete(Jwt jwt, UUID id) {
    if (db.run(jwt, jdbc -> jdbc.update("delete from public.entries where id = ?", id)) == 0) throw ApiError.notFound();
  }

  /** Deshacer: borra varias. Devuelve cuántas borró (las de otro usuario no cuentan: RLS no las ve). */
  public int deleteMany(Jwt jwt, List<UUID> ids) {
    if (ids.isEmpty()) return 0;
    return db.run(jwt, jdbc -> jdbc.update(con -> {
      var ps = con.prepareStatement("delete from public.entries where id = any(?)");
      ps.setArray(1, con.createArrayOf("uuid", ids.toArray()));
      return ps;
    }));
  }

  /** Totales por día (antes se traían todas las filas y se sumaban en el teléfono). */
  public Map<LocalDate, Day> days(Jwt jwt, LocalDate from, LocalDate to) {
    Map<LocalDate, Day> out = new LinkedHashMap<>();
    db.run(jwt, jdbc -> {
      jdbc.query("""
        select date, sum(kcal) as kcal, sum(protein) as protein, sum(carbs) as carbs, sum(fat) as fat, count(*) as n
        from public.entries where date between ? and ? group by date order by date
        """, rs -> {
      LocalDate d = Rows.date(rs, "date");
      out.put(d, new Day(d, Rows.num(rs, "kcal"), Rows.num(rs, "protein"), Rows.num(rs, "carbs"), Rows.num(rs, "fat"), rs.getInt("n")));
    }, from, to);
      return null;
    });
    return out;
  }

  /** Días con al menos una comida. */
  public List<LocalDate> loggedDates(Jwt jwt, LocalDate from, LocalDate to) {
    return db.run(jwt, jdbc -> jdbc.query("select distinct date from public.entries where date between ? and ? order by date",
        (rs, i) -> Rows.date(rs, "date"), from, to));
  }

  /** Agua, pasos y entrenos por día, en una sola consulta. */
  public Map<LocalDate, Activity> activity(Jwt jwt, LocalDate from, LocalDate to) {
    Map<LocalDate, Activity> out = new LinkedHashMap<>();
    db.run(jwt, jdbc -> {
      jdbc.query("""
        select date, sum(water) as water, sum(steps) as steps, sum(gym)::int as gym from (
          select date, ml as water, 0 as steps, 0 as gym from public.water where date between ? and ?
          union all select date, 0, steps, 0 from public.steps where date between ? and ?
          union all select date, 0, 0, 1 from public.workouts where date between ? and ?
        ) t group by date order by date
        """, rs -> {
      out.put(Rows.date(rs, "date"), new Activity(Rows.num(rs, "water"), Rows.num(rs, "steps"), rs.getInt("gym")));
    }, from, to, from, to, from, to);
      return null;
    });
    return out;
  }
}
