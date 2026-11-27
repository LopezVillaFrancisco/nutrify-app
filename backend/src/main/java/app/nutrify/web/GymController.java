package app.nutrify.web;

import app.nutrify.data.GymRepository;
import app.nutrify.data.GymRepository.Exercise;
import app.nutrify.data.GymRepository.ExerciseInput;
import app.nutrify.data.GymRepository.RenameInput;
import app.nutrify.data.GymRepository.Renamed;
import app.nutrify.data.GymRepository.Routine;
import app.nutrify.data.GymRepository.RoutineInput;
import app.nutrify.data.GymRepository.TodayInput;
import app.nutrify.data.GymRepository.Workout;
import app.nutrify.data.GymRepository.WorkoutExercise;
import app.nutrify.data.GymRepository.WorkoutInput;
import app.nutrify.nutrition.Json;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Valid;
import jakarta.validation.Validator;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Set;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.JsonNode;

/** Gym: ejercicios, rutinas y entrenos. */
@RestController
@RequestMapping("/api")
public class GymController {
  private final GymRepository gym;
  private final Validator validator;

  public GymController(GymRepository gym, Validator validator) {
    this.gym = gym;
    this.validator = validator;
  }

  /* ---------- Ejercicios ---------- */

  @GetMapping("/exercises")
  public List<Exercise> exercises(@AuthenticationPrincipal Jwt jwt) {
    return gym.exercises(jwt);
  }

  @PostMapping("/exercises")
  @ResponseStatus(HttpStatus.CREATED)
  public Exercise createExercise(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody ExerciseInput in) {
    try {
      return gym.createExercise(jwt, in);
    } catch (DuplicateKeyException e) {
      throw new ApiError(409, "Ya existe “" + in.name().strip() + "”.");
    }
  }

  @PutMapping("/exercises/{id}")
  public Exercise updateExercise(@AuthenticationPrincipal Jwt jwt, @PathVariable String id, @Valid @RequestBody ExerciseInput in) {
    try {
      return gym.updateExercise(jwt, Params.id(id), in);
    } catch (DuplicateKeyException e) {
      throw new ApiError(409, "Ya existe “" + in.name().strip() + "”.");
    }
  }

  @DeleteMapping("/exercises/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void deleteExercise(@AuthenticationPrincipal Jwt jwt, @PathVariable String id) {
    gym.deleteExercise(jwt, Params.id(id));
  }

  /** Renombra un ejercicio en todos tus entrenos y rutinas (una transacción). */
  @PostMapping("/exercises/rename")
  public Renamed rename(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody RenameInput in) {
    return gym.rename(jwt, in);
  }

  /* ---------- Rutinas ---------- */

  @GetMapping("/routines")
  public List<Routine> routines(@AuthenticationPrincipal Jwt jwt) {
    return gym.routines(jwt);
  }

  @PostMapping("/routines")
  @ResponseStatus(HttpStatus.CREATED)
  public Routine createRoutine(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody RoutineInput in) {
    return gym.createRoutine(jwt, in);
  }

  @PutMapping("/routines/{id}")
  public Routine updateRoutine(@AuthenticationPrincipal Jwt jwt, @PathVariable String id, @Valid @RequestBody RoutineInput in) {
    return gym.updateRoutine(jwt, Params.id(id), in);
  }

  @DeleteMapping("/routines/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void deleteRoutine(@AuthenticationPrincipal Jwt jwt, @PathVariable String id) {
    gym.deleteRoutine(jwt, Params.id(id));
  }

  /* ---------- Entrenos ---------- */

  @GetMapping("/workouts")
  public List<Workout> workouts(@AuthenticationPrincipal Jwt jwt, @RequestParam(defaultValue = "60") int limit) {
    return gym.workouts(jwt, Math.max(1, Math.min(limit, 200)));
  }

  @GetMapping("/workouts/{id}")
  public Workout workout(@AuthenticationPrincipal Jwt jwt, @PathVariable String id) {
    return gym.workout(jwt, Params.id(id));
  }

  @PostMapping("/workouts")
  @ResponseStatus(HttpStatus.CREATED)
  public Workout createWorkout(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody WorkoutInput in) {
    return gym.createWorkout(jwt, in);
  }

  /** El entreno del día (o uno nuevo vacío). */
  @PostMapping("/workouts/today")
  public Workout today(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody TodayInput in) {
    return gym.today(jwt, in.date());
  }

  private static final TypeReference<List<WorkoutExercise>> EXERCISES = new TypeReference<>() {};

  /**
   * Cambios parciales: { "name"?, "exercises"?, "finished_at"? }. Lo que no viene no se toca;
   * "finished_at": null deja el entreno sin terminar (por eso se lee el JSON a mano: null no es lo mismo que "no vino").
   */
  @PatchMapping("/workouts/{id}")
  public Workout patchWorkout(@AuthenticationPrincipal Jwt jwt, @PathVariable String id, @RequestBody JsonNode body) {
    if (body == null || !body.isObject()) throw ApiError.badRequest("Datos inválidos.");
    String name = null;
    if (body.has("name")) {
      name = Json.str(body.get("name"));
      if (name == null || name.isBlank()) throw ApiError.badRequest("Poné un nombre.");
      if (name.length() > 60) throw ApiError.badRequest("El nombre es muy largo.");
      name = name.strip();
    }
    List<WorkoutExercise> exercises = null;
    if (body.has("exercises")) {
      try {
        exercises = Json.MAPPER.readValue(Json.write(body.get("exercises")), EXERCISES);
      } catch (Exception e) {
        throw ApiError.badRequest("Datos inválidos.");
      }
      if (exercises == null) throw ApiError.badRequest("Datos inválidos.");
      if (exercises.size() > 40) throw ApiError.badRequest("Son demasiados ejercicios.");
      for (WorkoutExercise ex : exercises) {
        Set<ConstraintViolation<WorkoutExercise>> v = validator.validate(ex);
        if (!v.isEmpty()) throw ApiError.badRequest(v.iterator().next().getMessage());
      }
    }
    boolean setFinished = body.has("finished_at");
    OffsetDateTime finishedAt = null;
    if (setFinished && !body.get("finished_at").isNull()) {
      try {
        finishedAt = OffsetDateTime.parse(body.get("finished_at").asString());
      } catch (DateTimeParseException e) {
        throw ApiError.badRequest("Fecha de fin inválida.");
      }
    }
    return gym.patchWorkout(jwt, Params.id(id), new GymRepository.WorkoutPatch(name, exercises, setFinished, finishedAt));
  }

  @DeleteMapping("/workouts/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void deleteWorkout(@AuthenticationPrincipal Jwt jwt, @PathVariable String id) {
    gym.deleteWorkout(jwt, Params.id(id));
  }
}
