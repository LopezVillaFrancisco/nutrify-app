package app.nutrify.data;

import app.nutrify.db.UserDb;
import app.nutrify.web.ApiError;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Repository;

/** Agua (tabla water), pasos (tabla steps) y pesajes (tabla weights). */
@Repository
public class BodyRepository {

  /* ---------- Agua ---------- */

  public record Water(String id, LocalDate date, int ml, @JsonProperty("drank_at") OffsetDateTime drankAt) {}

  public record WaterInput(
      @NotNull(message = "Falta la fecha.") LocalDate date,
      @NotNull(message = "Falta la cantidad.") @Min(value = 1, message = "La cantidad tiene que estar entre 1 y 5.000 ml.")
      @Max(value = 5000, message = "La cantidad tiene que estar entre 1 y 5.000 ml.") Integer ml) {}

  /* ---------- Pasos ---------- */

  /** Mismo formato que StepsRow en lib/types.ts. kind: "dia" (celular/reloj) o "caminadora". */
  public record Steps(String id, LocalDate date, String kind, int steps, Double minutes, @JsonProperty("speed_kmh") Double speedKmh,
                      @JsonProperty("distance_km") Double distanceKm, @JsonProperty("created_at") OffsetDateTime createdAt) {}

  public record DayStepsInput(
      @NotNull(message = "Falta la fecha.") LocalDate date,
      @NotNull(message = "Faltan los pasos.") @Min(value = 0, message = "Los pasos tienen que estar entre 0 y 200.000.")
      @Max(value = 200000, message = "Los pasos tienen que estar entre 0 y 200.000.") Integer steps) {}

  public record TreadmillInput(
      @NotNull(message = "Falta la fecha.") LocalDate date,
      @NotNull(message = "Faltan los pasos.") @Min(value = 0, message = "Los pasos tienen que estar entre 0 y 200.000.")
      @Max(value = 200000, message = "Los pasos tienen que estar entre 0 y 200.000.") Integer steps,
      @NotNull(message = "Faltan los minutos.") @DecimalMin(value = "0", inclusive = false, message = "Los minutos tienen que ser más de 0.")
      @DecimalMax(value = "600", message = "Son demasiados minutos.") Double minutes,
      @JsonProperty("speed_kmh") @NotNull(message = "Falta la velocidad.") @DecimalMin(value = "0", inclusive = false, message = "La velocidad tiene que ser más de 0.")
      @DecimalMax(value = "30", message = "Revisá la velocidad (km/h).") Double speedKmh,
      @JsonProperty("distance_km") @NotNull(message = "Falta la distancia.") @DecimalMin("0") @DecimalMax(value = "200", message = "Revisá la distancia.") Double distanceKm) {}

  /* ---------- Peso ---------- */

  public record Weight(String id, LocalDate date, double kg) {}

  public record WeightInput(
      @NotNull(message = "Falta la fecha.") LocalDate date,
      @NotNull(message = "Falta el peso.") @DecimalMin(value = "25", message = "Revisá el peso (en kg).")
      @DecimalMax(value = "350", message = "Revisá el peso (en kg).") Double kg) {}

  private static final String STEPS_COLS = "id, date, kind, steps, minutes, speed_kmh, distance_km, created_at";

  private final UserDb db;

  public BodyRepository(UserDb db) {
    this.db = db;
  }

  private static Water water(ResultSet rs, int i) throws SQLException {
    return new Water(Rows.id(rs, "id"), Rows.date(rs, "date"), rs.getInt("ml"), Rows.ts(rs, "drank_at"));
  }

  private static Steps steps(ResultSet rs, int i) throws SQLException {
    return new Steps(Rows.id(rs, "id"), Rows.date(rs, "date"), rs.getString("kind"), rs.getInt("steps"), Rows.numOrNull(rs, "minutes"),
        Rows.numOrNull(rs, "speed_kmh"), Rows.numOrNull(rs, "distance_km"), Rows.ts(rs, "created_at"));
  }

  private static Weight weight(ResultSet rs, int i) throws SQLException {
    return new Weight(Rows.id(rs, "id"), Rows.date(rs, "date"), Rows.num(rs, "kg"));
  }

  public List<Water> water(Jwt jwt, LocalDate date) {
    return db.run(jwt, jdbc -> jdbc.query("select id, date, ml, drank_at from public.water where date = ? order by drank_at", BodyRepository::water, date));
  }

  public Water addWater(Jwt jwt, WaterInput in) {
    return db.run(jwt, jdbc -> jdbc.queryForObject("insert into public.water (date, ml) values (?, ?) returning id, date, ml, drank_at",
        BodyRepository::water, in.date(), in.ml()));
  }

  public void deleteWater(Jwt jwt, UUID id) {
    if (db.run(jwt, jdbc -> jdbc.update("delete from public.water where id = ?", id)) == 0) throw ApiError.notFound();
  }

  public List<Steps> steps(Jwt jwt, LocalDate date) {
    return db.run(jwt, jdbc -> jdbc.query("select " + STEPS_COLS + " from public.steps where date = ? order by created_at", BodyRepository::steps, date));
  }

  /** Pasos del día (celular/reloj): un solo valor por día, se reemplaza. */
  public Steps setDaySteps(Jwt jwt, DayStepsInput in) {
    return db.run(jwt, jdbc -> {
      List<Steps> updated = jdbc.query(
          "update public.steps set steps = ? where id = (select id from public.steps where date = ? and kind = 'dia' order by created_at limit 1) returning " + STEPS_COLS,
          BodyRepository::steps, in.steps(), in.date());
      if (!updated.isEmpty()) return updated.get(0);
      return jdbc.queryForObject("insert into public.steps (date, kind, steps) values (?, 'dia', ?) returning " + STEPS_COLS,
          BodyRepository::steps, in.date(), in.steps());
    });
  }

  public Steps addTreadmill(Jwt jwt, TreadmillInput in) {
    return db.run(jwt, jdbc -> jdbc.queryForObject(
        "insert into public.steps (date, kind, steps, minutes, speed_kmh, distance_km) values (?, 'caminadora', ?, ?, ?, ?) returning " + STEPS_COLS,
        BodyRepository::steps, in.date(), in.steps(), in.minutes(), in.speedKmh(), in.distanceKm()));
  }

  public void deleteSteps(Jwt jwt, UUID id) {
    if (db.run(jwt, jdbc -> jdbc.update("delete from public.steps where id = ?", id)) == 0) throw ApiError.notFound();
  }

  public List<Weight> weights(Jwt jwt) {
    return db.run(jwt, jdbc -> jdbc.query("select id, date, kg from public.weights order by date", BodyRepository::weight));
  }

  /**
   * Un pesaje por día (si te pesás de nuevo ese día, se reemplaza).
   * Si es el más reciente, también pasa a ser tu peso en Perfil. Todo en la misma transacción.
   */
  public Weight saveWeight(Jwt jwt, WeightInput in) {
    return db.run(jwt, jdbc -> {
      Weight w = jdbc.queryForObject(
          "insert into public.weights (date, kg) values (?, ?) on conflict (user_id, date) do update set kg = excluded.kg returning id, date, kg",
          BodyRepository::weight, in.date(), in.kg());
      LocalDate latest = jdbc.queryForObject("select max(date) from public.weights", LocalDate.class);
      if (in.date().equals(latest)) jdbc.update("update public.settings set weight_kg = ? where user_id = auth.uid()", in.kg());
      return w;
    });
  }

  public void deleteWeight(Jwt jwt, UUID id) {
    if (db.run(jwt, jdbc -> jdbc.update("delete from public.weights where id = ?", id)) == 0) throw ApiError.notFound();
  }
}
