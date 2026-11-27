package app.nutrify.web;

import app.nutrify.data.BodyRepository;
import app.nutrify.data.BodyRepository.DayStepsInput;
import app.nutrify.data.BodyRepository.Steps;
import app.nutrify.data.BodyRepository.TreadmillInput;
import app.nutrify.data.BodyRepository.Water;
import app.nutrify.data.BodyRepository.WaterInput;
import app.nutrify.data.BodyRepository.Weight;
import app.nutrify.data.BodyRepository.WeightInput;
import app.nutrify.data.EntriesRepository;
import app.nutrify.data.EntriesRepository.Activity;
import app.nutrify.data.EntriesRepository.Day;
import app.nutrify.data.EntriesRepository.EntriesInput;
import app.nutrify.data.EntriesRepository.Entry;
import app.nutrify.data.FoodsRepository;
import app.nutrify.data.FoodsRepository.Food;
import app.nutrify.data.FoodsRepository.FoodInput;
import app.nutrify.data.FoodsRepository.SavedMeal;
import app.nutrify.data.FoodsRepository.SavedMealInput;
import app.nutrify.data.SettingsRepository;
import app.nutrify.data.SettingsRepository.Settings;
import app.nutrify.data.SettingsRepository.SettingsInput;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Datos del usuario: perfil, alimentos, comidas guardadas, lo que comió, agua, pasos y peso.
 * Reemplaza los supabase.from(...) que hacía el navegador. Todo corre con RLS (ver UserDb).
 */
@RestController
@RequestMapping("/api")
public class DataController {
  private final SettingsRepository settings;
  private final FoodsRepository foods;
  private final EntriesRepository entries;
  private final BodyRepository body;

  public DataController(SettingsRepository settings, FoodsRepository foods, EntriesRepository entries, BodyRepository body) {
    this.settings = settings;
    this.foods = foods;
    this.entries = entries;
    this.body = body;
  }

  /* ---------- Yo ---------- */

  public record Me(String id, String email) {}

  @GetMapping("/me")
  public Me me(@AuthenticationPrincipal Jwt jwt) {
    return new Me(jwt.getSubject(), jwt.getClaimAsString("email"));
  }

  /* ---------- Perfil ---------- */

  @GetMapping("/settings")
  public Settings getSettings(@AuthenticationPrincipal Jwt jwt) {
    return settings.get(jwt);
  }

  @PutMapping("/settings")
  public Settings putSettings(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody SettingsInput in) {
    return settings.put(jwt, in);
  }

  /* ---------- Alimentos ---------- */

  @GetMapping("/foods")
  public List<Food> foods(@AuthenticationPrincipal Jwt jwt) {
    return foods.foods(jwt);
  }

  @PostMapping("/foods")
  @ResponseStatus(HttpStatus.CREATED)
  public Food createFood(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody FoodInput in) {
    return foods.createFood(jwt, in);
  }

  @PutMapping("/foods/{id}")
  public Food updateFood(@AuthenticationPrincipal Jwt jwt, @PathVariable String id, @Valid @RequestBody FoodInput in) {
    return foods.updateFood(jwt, Params.id(id), in);
  }

  @DeleteMapping("/foods/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void deleteFood(@AuthenticationPrincipal Jwt jwt, @PathVariable String id) {
    foods.deleteFood(jwt, Params.id(id));
  }

  /* ---------- Comidas guardadas ---------- */

  @GetMapping("/saved-meals")
  public List<SavedMeal> meals(@AuthenticationPrincipal Jwt jwt) {
    return foods.meals(jwt);
  }

  @PostMapping("/saved-meals")
  @ResponseStatus(HttpStatus.CREATED)
  public SavedMeal createMeal(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody SavedMealInput in) {
    return foods.createMeal(jwt, in);
  }

  @PutMapping("/saved-meals/{id}")
  public SavedMeal updateMeal(@AuthenticationPrincipal Jwt jwt, @PathVariable String id, @Valid @RequestBody SavedMealInput in) {
    return foods.updateMeal(jwt, Params.id(id), in);
  }

  @DeleteMapping("/saved-meals/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void deleteMeal(@AuthenticationPrincipal Jwt jwt, @PathVariable String id) {
    foods.deleteMeal(jwt, Params.id(id));
  }

  /* ---------- Lo que comiste ---------- */

  @GetMapping("/entries")
  public List<Entry> entries(@AuthenticationPrincipal Jwt jwt, @RequestParam String date) {
    return entries.byDate(jwt, Params.date(date));
  }

  @PostMapping("/entries")
  @ResponseStatus(HttpStatus.CREATED)
  public List<Entry> createEntries(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody EntriesInput in) {
    return entries.create(jwt, in.entries());
  }

  /** Corregir una línea: se reemplaza por las nuevas en una sola transacción. */
  @PostMapping("/entries/{id}/replace")
  public List<Entry> replaceEntry(@AuthenticationPrincipal Jwt jwt, @PathVariable String id, @Valid @RequestBody EntriesInput in) {
    return entries.replace(jwt, Params.id(id), in.entries());
  }

  @DeleteMapping("/entries/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void deleteEntry(@AuthenticationPrincipal Jwt jwt, @PathVariable String id) {
    entries.delete(jwt, Params.id(id));
  }

  /** Deshacer: DELETE /api/entries?ids=a,b,c */
  @DeleteMapping("/entries")
  public Map<String, Integer> deleteEntries(@AuthenticationPrincipal Jwt jwt, @RequestParam List<String> ids) {
    if (ids.size() > 100) throw ApiError.badRequest("Son demasiadas de una vez.");
    List<UUID> valid = new ArrayList<>();
    for (String s : ids) {
      try {
        valid.add(UUID.fromString(s.strip()));
      } catch (IllegalArgumentException ignored) {
        // un id inválido no puede existir
      }
    }
    return Map.of("deleted", entries.deleteMany(jwt, valid));
  }

  /** Totales por día: { "2026-11-26": { date, kcal, protein, carbs, fat, count } } (lib/days.ts → DayMap). */
  @GetMapping("/days")
  public Map<LocalDate, Day> days(@AuthenticationPrincipal Jwt jwt, @RequestParam String from, @RequestParam String to) {
    Params.Range r = Params.range(from, to, 400);
    return entries.days(jwt, r.from(), r.to());
  }

  @GetMapping("/days/logged")
  public List<LocalDate> loggedDays(@AuthenticationPrincipal Jwt jwt, @RequestParam String from, @RequestParam String to) {
    Params.Range r = Params.range(from, to, 400);
    return entries.loggedDates(jwt, r.from(), r.to());
  }

  /** Agua, pasos y entrenos por día (Progreso). */
  @GetMapping("/activity")
  public Map<LocalDate, Activity> activity(@AuthenticationPrincipal Jwt jwt, @RequestParam String from, @RequestParam String to) {
    Params.Range r = Params.range(from, to, 400);
    return entries.activity(jwt, r.from(), r.to());
  }

  /* ---------- Agua ---------- */

  @GetMapping("/water")
  public List<Water> water(@AuthenticationPrincipal Jwt jwt, @RequestParam String date) {
    return body.water(jwt, Params.date(date));
  }

  @PostMapping("/water")
  @ResponseStatus(HttpStatus.CREATED)
  public Water addWater(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody WaterInput in) {
    return body.addWater(jwt, in);
  }

  @DeleteMapping("/water/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void deleteWater(@AuthenticationPrincipal Jwt jwt, @PathVariable String id) {
    body.deleteWater(jwt, Params.id(id));
  }

  /* ---------- Pasos ---------- */

  @GetMapping("/steps")
  public List<Steps> steps(@AuthenticationPrincipal Jwt jwt, @RequestParam String date) {
    return body.steps(jwt, Params.date(date));
  }

  /** Pasos del celular o reloj: uno por día, se reemplaza. */
  @PutMapping("/steps/day")
  public Steps setDaySteps(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody DayStepsInput in) {
    return body.setDaySteps(jwt, in);
  }

  @PostMapping("/steps/treadmill")
  @ResponseStatus(HttpStatus.CREATED)
  public Steps addTreadmill(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody TreadmillInput in) {
    return body.addTreadmill(jwt, in);
  }

  @DeleteMapping("/steps/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void deleteSteps(@AuthenticationPrincipal Jwt jwt, @PathVariable String id) {
    body.deleteSteps(jwt, Params.id(id));
  }

  /* ---------- Peso ---------- */

  @GetMapping("/weights")
  public List<Weight> weights(@AuthenticationPrincipal Jwt jwt) {
    return body.weights(jwt);
  }

  /** Un pesaje por día (se reemplaza si ya había); si es el más reciente, actualiza el peso del Perfil. */
  @PutMapping("/weights")
  public Weight saveWeight(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody WeightInput in) {
    return body.saveWeight(jwt, in);
  }

  @DeleteMapping("/weights/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void deleteWeight(@AuthenticationPrincipal Jwt jwt, @PathVariable String id) {
    body.deleteWeight(jwt, Params.id(id));
  }
}
