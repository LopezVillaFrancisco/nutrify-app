package app.nutrify.data;

import app.nutrify.db.UserDb;
import app.nutrify.nutrition.Json;
import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.ArrayList;
import java.util.List;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.JsonNode;

/** Metas y datos del cuerpo (tabla settings, una fila por usuario). Mismo formato que Settings en lib/types.ts. */
@Repository
public class SettingsRepository {

  public record Cup(String name, double ml) {}

  public record Settings(double kcal, double protein, double rangeLow, double rangeHigh, Double weightKg, Double heightCm,
                         double stepsGoal, Double waterGoalMl, String aiMode, List<Cup> cups) {}

  public record CupInput(String name, Double ml) {}

  /** Las mismas reglas (y mensajes) que valida la pantalla de Perfil. */
  public record SettingsInput(
      @NotNull(message = "Faltan las calorías.")
      @DecimalMin(value = "500", message = "Las calorías tienen que estar entre 500 y 10.000.")
      @DecimalMax(value = "10000", message = "Las calorías tienen que estar entre 500 y 10.000.") Double kcal,
      @NotNull(message = "Falta la proteína.")
      @DecimalMin(value = "0", inclusive = false, message = "La proteína tiene que estar entre 1 y 600 g.")
      @DecimalMax(value = "600", message = "La proteína tiene que estar entre 1 y 600 g.") Double protein,
      @NotNull(message = "Falta el rango.") Double rangeLow,
      @NotNull(message = "Falta el rango.") Double rangeHigh,
      @DecimalMin(value = "25", message = "Revisá el peso (en kg).") @DecimalMax(value = "350", message = "Revisá el peso (en kg).") Double weightKg,
      @DecimalMin(value = "100", message = "Revisá la altura (en cm, ej. 175).")
      @DecimalMax(value = "250", message = "Revisá la altura (en cm, ej. 175).") Double heightCm,
      @NotNull(message = "Falta la meta de pasos.")
      @DecimalMin(value = "500", message = "La meta de pasos tiene que estar entre 500 y 100.000.")
      @DecimalMax(value = "100000", message = "La meta de pasos tiene que estar entre 500 y 100.000.") Double stepsGoal,
      @DecimalMin(value = "500", message = "La meta de agua tiene que estar entre 500 y 8.000 ml.")
      @DecimalMax(value = "8000", message = "La meta de agua tiene que estar entre 500 y 8.000 ml.") Double waterGoalMl,
      @Pattern(regexp = "auto|ask|off", message = "Modo de IA inválido.") String aiMode,
      @Size(max = 10, message = "Demasiados vasos.") List<@Valid CupInput> cups) {

    @AssertTrue(message = "El rango tiene que ir de menor a mayor (ej. 80% a 110%).")
    public boolean isRangeOk() {
      return rangeLow == null || rangeHigh == null || (rangeLow > 0 && rangeHigh > rangeLow && rangeHigh <= 300);
    }
  }

  /** Copa sin pie (~400 ml) y vaso térmico de 40 oz (1.180 ml). */
  static final List<Cup> DEFAULT_CUPS = List.of(new Cup("Copa", 400), new Cup("Vaso térmico", 1180));
  static final Settings DEFAULTS = new Settings(2350, 160, 80, 110, null, null, 10000, null, "ask", DEFAULT_CUPS);

  private final UserDb db;

  public SettingsRepository(UserDb db) {
    this.db = db;
  }

  /** Como loadSettings: to_jsonb tolera bases a las que les falten columnas nuevas; lo que falta toma el valor por defecto. */
  public Settings get(Jwt jwt) {
    List<String> rows = db.run(jwt, jdbc -> jdbc.queryForList("select to_jsonb(s)::text from public.settings s limit 1", String.class));
    if (rows.isEmpty()) return DEFAULTS;
    JsonNode d = Json.parse(rows.get(0));
    return new Settings(
        or(pos(d.get("kcal_goal")), DEFAULTS.kcal()),
        or(pos(d.get("protein_goal")), DEFAULTS.protein()),
        or(pos(d.get("range_low_pct")), DEFAULTS.rangeLow()),
        or(pos(d.get("range_high_pct")), DEFAULTS.rangeHigh()),
        pos(d.get("weight_kg")),
        pos(d.get("height_cm")),
        or(pos(d.get("steps_goal")), DEFAULTS.stepsGoal()),
        pos(d.get("water_goal_ml")),
        readMode(Json.str(d.get("ai_mode"))),
        cupsOrDefault(parseCups(d.get("water_cups"))));
  }

  public Settings put(Jwt jwt, SettingsInput in) {
    List<Cup> cups = cupsOrDefault(parseCups(Json.tree(in.cups() == null ? List.of() : in.cups())));
    db.run(jwt, jdbc -> jdbc.update("""
        insert into public.settings (kcal_goal, protein_goal, range_low_pct, range_high_pct, weight_kg, height_cm, steps_goal, water_goal_ml, ai_mode, water_cups)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb)
        on conflict (user_id) do update set
          kcal_goal = excluded.kcal_goal, protein_goal = excluded.protein_goal,
          range_low_pct = excluded.range_low_pct, range_high_pct = excluded.range_high_pct,
          weight_kg = excluded.weight_kg, height_cm = excluded.height_cm, steps_goal = excluded.steps_goal,
          water_goal_ml = excluded.water_goal_ml, ai_mode = excluded.ai_mode, water_cups = excluded.water_cups
        """,
        Math.round(in.kcal()), Math.round(in.protein()), Math.round(in.rangeLow()), Math.round(in.rangeHigh()),
        in.weightKg(), in.heightCm() == null ? null : Math.round(in.heightCm()), Math.round(in.stepsGoal()),
        in.waterGoalMl() == null ? null : Math.round(in.waterGoalMl()), readMode(in.aiMode()), Rows.jsonb(cups)));
    return get(jwt);
  }

  static String readMode(String v) {
    return "auto".equals(v) || "off".equals(v) ? v : "ask";
  }

  private static Double pos(JsonNode v) {
    double n = Json.jsNumber(v);
    return Double.isFinite(n) && n > 0 ? n : null;
  }

  private static double or(Double v, double fallback) {
    return v != null ? v : fallback;
  }

  /** Como parseCups: nombre (hasta 24 letras) y ml entre 1 y 5.000, hasta 4 vasos. */
  static List<Cup> parseCups(JsonNode v) {
    if (v == null || !v.isArray()) return null;
    List<Cup> out = new ArrayList<>();
    for (JsonNode c : v) {
      String name = c.isObject() && c.get("name") != null && !c.get("name").isNull() ? c.get("name").asString().strip() : "";
      if (name.length() > 24) name = name.substring(0, 24);
      double ml = Math.round(Json.jsNumber(c.isObject() ? c.get("ml") : null));
      if (!name.isEmpty() && ml > 0 && ml <= 5000) out.add(new Cup(name, ml));
      if (out.size() == 4) break;
    }
    return out.isEmpty() ? null : out;
  }

  private static List<Cup> cupsOrDefault(List<Cup> cups) {
    return cups != null ? cups : DEFAULT_CUPS;
  }
}
