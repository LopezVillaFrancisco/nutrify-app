package app.nutrify.data;

import app.nutrify.db.UserDb;
import app.nutrify.nutrition.Text;
import app.nutrify.nutrition.Json;
import app.nutrify.web.ApiError;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Repository;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/** Gym: tus ejercicios (tabla exercises), rutinas (routines) y entrenos (workouts). */
@Repository
public class GymRepository {

  /* ---------- Ejercicios ---------- */

  /** Mismo formato que ExerciseRow en lib/types.ts. base = ejercicio de la app que reemplaza (si lo renombraste). */
  public record Exercise(String id, String name, String muscle, double step, String base, boolean hidden) {}

  public record ExerciseInput(
      @NotBlank(message = "Poné un nombre.") @Size(max = 60, message = "El nombre es muy largo.") String name,
      @NotBlank(message = "Elegí el músculo.") @Size(max = 30) String muscle,
      @NotNull(message = "Falta el salto de kilos.") @DecimalMin(value = "0", inclusive = false, message = "El salto de kilos tiene que ser más de 0.")
      @DecimalMax(value = "50", message = "El salto de kilos es demasiado grande.") Double step,
      @Size(max = 60) String base,
      Boolean hidden) {}

  public record RenameInput(@NotBlank(message = "Falta el nombre anterior.") String from, @NotBlank(message = "Falta el nombre nuevo.") @Size(max = 60) String to) {}

  public record Renamed(int workouts, int routines) {}

  /* ---------- Rutinas ---------- */

  /** kg = peso objetivo (opcional), restSec = descanso entre series. */
  @JsonInclude(JsonInclude.Include.NON_NULL)
  public record RoutineExercise(
      @NotBlank(message = "Hay un ejercicio sin nombre.") @Size(max = 60) String name,
      @NotNull(message = "Faltan las series.") @Min(value = 1, message = "Las series van de 1 a 20.") @Max(value = 20, message = "Las series van de 1 a 20.") Integer sets,
      @NotNull(message = "Faltan las repeticiones.") @Min(value = 1, message = "Las repeticiones van de 1 a 100.") @Max(value = 100, message = "Las repeticiones van de 1 a 100.") Integer reps,
      @DecimalMin("0") @DecimalMax("1000") Double kg,
      @Min(0) @Max(3600) Integer restSec,
      @Size(max = 30) String muscle) {}

  public record Routine(String id, String name, List<RoutineExercise> exercises) {}

  public record RoutineInput(
      @NotBlank(message = "Poné un nombre.") @Size(max = 60, message = "El nombre es muy largo.") String name,
      @NotNull @Size(max = 40, message = "Son demasiados ejercicios para una rutina.") List<@Valid RoutineExercise> exercises) {}

  /* ---------- Entrenos ---------- */

  /** warmup = serie de calentamiento (no cuenta para volumen ni récords). */
  @JsonInclude(JsonInclude.Include.NON_NULL)
  public record WorkoutSet(@Min(0) @Max(1000) Integer reps, @DecimalMin("0") @DecimalMax("2000") Double kg, boolean done, Boolean warmup) {}

  @JsonInclude(JsonInclude.Include.NON_NULL)
  public record WorkoutExercise(
      @NotBlank(message = "Hay un ejercicio sin nombre.") @Size(max = 60) String name,
      @NotNull @Size(max = 50, message = "Son demasiadas series.") List<@Valid WorkoutSet> sets,
      @Size(max = 30) String muscle,
      @Min(0) @Max(3600) Integer restSec) {}

  /** Mismo formato que WorkoutRow en lib/types.ts. */
  public record Workout(String id, LocalDate date, @JsonProperty("routine_id") String routineId, String name, List<WorkoutExercise> exercises,
                        @JsonProperty("started_at") OffsetDateTime startedAt, @JsonProperty("finished_at") OffsetDateTime finishedAt) {}

  public record WorkoutInput(
      @NotNull(message = "Falta la fecha.") LocalDate date,
      @JsonProperty("routine_id") UUID routineId,
      @NotBlank(message = "Poné un nombre.") @Size(max = 60) String name,
      @Size(max = 40, message = "Son demasiados ejercicios.") List<@Valid WorkoutExercise> exercises) {}

  public record TodayInput(@NotNull(message = "Falta la fecha.") LocalDate date) {}

  private static final String WORKOUT_COLS = "id, date, routine_id, name, exercises, started_at, finished_at";
  private static final TypeReference<List<RoutineExercise>> ROUTINE_EX = new TypeReference<>() {};
  private static final TypeReference<List<WorkoutExercise>> WORKOUT_EX = new TypeReference<>() {};
  private static final Pattern SPACES = Pattern.compile("\\s+");

  private final UserDb db;

  public GymRepository(UserDb db) {
    this.db = db;
  }

  /** Igual que exerciseKey de lib/exercises.ts: sin tildes, minúsculas y espacios simples. */
  static String exerciseKey(String s) {
    return Text.trim(SPACES.matcher(Text.lower(Text.stripAccents(s))).replaceAll(" "));
  }

  private static String cleanName(String s) {
    return Text.trim(SPACES.matcher(s).replaceAll(" "));
  }

  private static Exercise exercise(ResultSet rs, int i) throws SQLException {
    return new Exercise(Rows.id(rs, "id"), rs.getString("name"), rs.getString("muscle"), Rows.num(rs, "step"), rs.getString("base"), rs.getBoolean("hidden"));
  }

  private static Routine routine(ResultSet rs, int i) throws SQLException {
    return new Routine(Rows.id(rs, "id"), rs.getString("name"), Rows.json(rs, "exercises", ROUTINE_EX, List.of()));
  }

  private static Workout workout(ResultSet rs, int i) throws SQLException {
    return new Workout(Rows.id(rs, "id"), Rows.date(rs, "date"), Rows.id(rs, "routine_id"), rs.getString("name"),
        Rows.json(rs, "exercises", WORKOUT_EX, List.of()), Rows.ts(rs, "started_at"), Rows.ts(rs, "finished_at"));
  }

  /* ---------- Ejercicios ---------- */

  public List<Exercise> exercises(Jwt jwt) {
    return db.run(jwt, jdbc -> jdbc.query("select id, name, muscle, step, base, hidden from public.exercises order by name", GymRepository::exercise));
  }

  /** El nombre es único por usuario sin importar mayúsculas (índice exercises_user_name_idx): si choca, 409. */
  public Exercise createExercise(Jwt jwt, ExerciseInput in) {
    return db.run(jwt, jdbc -> jdbc.queryForObject(
        "insert into public.exercises (name, muscle, step, base, hidden) values (?, ?, ?, ?, ?) returning id, name, muscle, step, base, hidden",
        GymRepository::exercise, cleanName(in.name()), in.muscle().strip(), in.step(), FoodsRepository.blankToNull(in.base()), Boolean.TRUE.equals(in.hidden())));
  }

  public Exercise updateExercise(Jwt jwt, UUID id, ExerciseInput in) {
    List<Exercise> out = db.run(jwt, jdbc -> jdbc.query(
        "update public.exercises set name = ?, muscle = ?, step = ?, base = ?, hidden = ? where id = ? returning id, name, muscle, step, base, hidden",
        GymRepository::exercise, cleanName(in.name()), in.muscle().strip(), in.step(), FoodsRepository.blankToNull(in.base()), Boolean.TRUE.equals(in.hidden()), id));
    if (out.isEmpty()) throw ApiError.notFound();
    return out.get(0);
  }

  public void deleteExercise(Jwt jwt, UUID id) {
    if (db.run(jwt, jdbc -> jdbc.update("delete from public.exercises where id = ?", id)) == 0) throw ApiError.notFound();
  }

  /**
   * Renombra un ejercicio en todos tus entrenos y rutinas, así el historial, el progreso y los récords siguen juntos.
   * Todo en una transacción: si algo falla, no queda nada a medias (antes eran muchos pedidos sueltos desde el teléfono).
   */
  public Renamed rename(Jwt jwt, RenameInput in) {
    String from = in.from();
    String to = cleanName(in.to());
    String fromKey = exerciseKey(from);
    return db.run(jwt, jdbc -> new Renamed(renameIn(jdbc, "workouts", fromKey, to), renameIn(jdbc, "routines", fromKey, to)));
  }

  private static int renameIn(JdbcTemplate jdbc, String table, String fromKey, String to) {
    // Filas que tienen algún ejercicio con ese nombre (comparado como exerciseKey: sin tildes ni mayúsculas)
    List<Object[]> rows = jdbc.query("select id, exercises::text from public." + table + " where jsonb_typeof(exercises) = 'array'",
        (rs, i) -> new Object[] {rs.getObject(1), rs.getString(2)});
    int changed = 0;
    for (Object[] r : rows) {
      JsonNode list = Json.parse((String) r[1]);
      boolean touched = false;
      for (JsonNode e : list) {
        String name = Json.str(e.get("name"));
        if (e.isObject() && name != null && exerciseKey(name).equals(fromKey)) {
          ((ObjectNode) e).put("name", to);
          touched = true;
        }
      }
      if (touched) {
        jdbc.update("update public." + table + " set exercises = ?::jsonb where id = ?", Json.write((ArrayNode) list), r[0]);
        changed++;
      }
    }
    return changed;
  }

  /* ---------- Rutinas ---------- */

  public List<Routine> routines(Jwt jwt) {
    return db.run(jwt, jdbc -> jdbc.query("select id, name, exercises from public.routines order by created_at", GymRepository::routine));
  }

  public Routine createRoutine(Jwt jwt, RoutineInput in) {
    return db.run(jwt, jdbc -> jdbc.queryForObject("insert into public.routines (name, exercises) values (?, ?::jsonb) returning id, name, exercises",
        GymRepository::routine, in.name().strip(), Rows.jsonb(in.exercises())));
  }

  public Routine updateRoutine(Jwt jwt, UUID id, RoutineInput in) {
    List<Routine> out = db.run(jwt, jdbc -> jdbc.query("update public.routines set name = ?, exercises = ?::jsonb where id = ? returning id, name, exercises",
        GymRepository::routine, in.name().strip(), Rows.jsonb(in.exercises()), id));
    if (out.isEmpty()) throw ApiError.notFound();
    return out.get(0);
  }

  public void deleteRoutine(Jwt jwt, UUID id) {
    if (db.run(jwt, jdbc -> jdbc.update("delete from public.routines where id = ?", id)) == 0) throw ApiError.notFound();
  }

  /* ---------- Entrenos ---------- */

  public List<Workout> workouts(Jwt jwt, int limit) {
    return db.run(jwt, jdbc -> jdbc.query("select " + WORKOUT_COLS + " from public.workouts order by started_at desc limit ?", GymRepository::workout, limit));
  }

  public Workout workout(Jwt jwt, UUID id) {
    List<Workout> out = db.run(jwt, jdbc -> jdbc.query("select " + WORKOUT_COLS + " from public.workouts where id = ?", GymRepository::workout, id));
    if (out.isEmpty()) throw ApiError.notFound();
    return out.get(0);
  }

  /**
   * Nuevo entreno. Si viene de una rutina, la rutina tiene que ser tuya: la clave foránea no mira RLS,
   * así que sin este chequeo se podría enganchar un entreno a la rutina de otro usuario.
   */
  public Workout createWorkout(Jwt jwt, WorkoutInput in) {
    return db.run(jwt, jdbc -> {
      if (in.routineId() != null) {
        Integer mine = jdbc.queryForObject("select count(*) from public.routines where id = ?", Integer.class, in.routineId());
        if (mine == null || mine == 0) throw ApiError.badRequest("Esa rutina no existe.");
      }
      return jdbc.queryForObject("insert into public.workouts (date, routine_id, name, exercises) values (?, ?, ?, ?::jsonb) returning " + WORKOUT_COLS,
          GymRepository::workout, in.date(), in.routineId(), in.name().strip(), Rows.jsonb(in.exercises() == null ? List.of() : in.exercises()));
    });
  }

  /** El entreno del día si ya hay uno, o uno nuevo vacío (carga rápida y Gym sin señal). */
  public Workout today(Jwt jwt, LocalDate date) {
    return db.run(jwt, jdbc -> {
      List<Workout> existing = jdbc.query("select " + WORKOUT_COLS + " from public.workouts where date = ? order by started_at desc limit 1",
          GymRepository::workout, date);
      if (!existing.isEmpty()) return existing.get(0);
      return jdbc.queryForObject("insert into public.workouts (date, routine_id, name, exercises) values (?, null, 'Entreno', '[]'::jsonb) returning " + WORKOUT_COLS,
          GymRepository::workout, date);
    });
  }

  /** Cambios parciales: solo lo que viene (name, exercises, finished_at; finished_at puede venir null para "sin terminar"). */
  public record WorkoutPatch(String name, List<WorkoutExercise> exercises, boolean setFinished, OffsetDateTime finishedAt) {}

  public Workout patchWorkout(Jwt jwt, UUID id, WorkoutPatch p) {
    List<Workout> out = db.run(jwt, jdbc -> jdbc.query("""
        update public.workouts set
          name = coalesce(?::text, name),
          exercises = coalesce(?::jsonb, exercises),
          finished_at = case when ?::boolean then ?::timestamptz else finished_at end
        where id = ? returning""" + " " + WORKOUT_COLS,
        GymRepository::workout, p.name(), p.exercises() == null ? null : Rows.jsonb(p.exercises()), p.setFinished(), p.finishedAt(), id));
    if (out.isEmpty()) throw ApiError.notFound();
    return out.get(0);
  }

  public void deleteWorkout(Jwt jwt, UUID id) {
    if (db.run(jwt, jdbc -> jdbc.update("delete from public.workouts where id = ?", id)) == 0) throw ApiError.notFound();
  }
}
