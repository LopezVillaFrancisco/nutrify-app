package app.nutrify.data;

import app.nutrify.db.UserDb;
import app.nutrify.web.ApiError;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.UUID;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Repository;

/** Tus alimentos (tabla foods, valores por 100 g) y tus comidas guardadas (tabla saved_meals). */
@Repository
public class FoodsRepository {

  /** Mismo formato que FoodRow en lib/types.ts. */
  public record Food(
      String id, String name, List<String> aliases,
      @JsonProperty("kcal_per_100g") double kcalPer100g,
      @JsonProperty("protein_per_100g") double proteinPer100g,
      @JsonProperty("carbs_per_100g") double carbsPer100g,
      @JsonProperty("fat_per_100g") double fatPer100g,
      @JsonProperty("default_portion_g") Double defaultPortionG,
      @JsonProperty("unit_label") String unitLabel,
      String category) {}

  public record FoodInput(
      @NotBlank(message = "Poné un nombre.") @Size(max = 80, message = "El nombre es muy largo.") String name,
      @Size(max = 20, message = "Demasiados nombres alternativos.") List<@NotBlank @Size(max = 80) String> aliases,
      @JsonProperty("kcal_per_100g") @NotNull(message = "Poné las kcal (un número).")
      @DecimalMin(value = "0", message = "Poné las kcal (un número).") @DecimalMax(value = "950", message = "Revisá las kcal: más de 950 cada 100 g no existe.") Double kcalPer100g,
      @JsonProperty("protein_per_100g") @NotNull(message = "Revisá proteína, carbos y grasas: tienen que ser números.")
      @DecimalMin(value = "0", message = "Revisá proteína, carbos y grasas: tienen que ser números.") @DecimalMax("100") Double proteinPer100g,
      @JsonProperty("carbs_per_100g") @NotNull(message = "Revisá proteína, carbos y grasas: tienen que ser números.")
      @DecimalMin(value = "0", message = "Revisá proteína, carbos y grasas: tienen que ser números.") @DecimalMax("100") Double carbsPer100g,
      @JsonProperty("fat_per_100g") @NotNull(message = "Revisá proteína, carbos y grasas: tienen que ser números.")
      @DecimalMin(value = "0", message = "Revisá proteína, carbos y grasas: tienen que ser números.") @DecimalMax("100") Double fatPer100g,
      @JsonProperty("default_portion_g")
      @DecimalMin(value = "0", inclusive = false, message = "Los gramos por unidad tienen que ser un número mayor a 0.")
      @DecimalMax(value = "5000", message = "Los gramos por unidad son demasiados.") Double defaultPortionG,
      @JsonProperty("unit_label") @Size(max = 40) String unitLabel,
      @Size(max = 40) String category) {}

  /** Mismo formato que SavedMealRow en lib/types.ts. */
  public record SavedMeal(String id, String name, List<String> items, String meal) {}

  public record SavedMealInput(
      @NotBlank(message = "Poné un nombre.") @Size(max = 80, message = "El nombre es muy largo.") String name,
      @NotNull(message = "Agregá al menos un alimento.") @Size(min = 1, max = 30, message = "Una comida guardada lleva entre 1 y 30 alimentos.")
      List<@NotBlank(message = "Hay un alimento vacío.") @Size(max = 200) String> items,
      @Pattern(regexp = "desayuno|almuerzo|merienda|colacion|cena", message = "Comida inválida.") String meal) {}

  private static final String FOOD_COLS =
      "id, name, aliases, kcal_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, default_portion_g, unit_label, category";

  private final UserDb db;

  public FoodsRepository(UserDb db) {
    this.db = db;
  }

  private static Food food(ResultSet rs, int i) throws SQLException {
    return new Food(Rows.id(rs, "id"), rs.getString("name"), Rows.texts(rs, "aliases"), Rows.num(rs, "kcal_per_100g"),
        Rows.num(rs, "protein_per_100g"), Rows.num(rs, "carbs_per_100g"), Rows.num(rs, "fat_per_100g"),
        Rows.numOrNull(rs, "default_portion_g"), rs.getString("unit_label"), rs.getString("category"));
  }

  public List<Food> foods(Jwt jwt) {
    return db.run(jwt, jdbc -> jdbc.query("select " + FOOD_COLS + " from public.foods order by name", FoodsRepository::food));
  }

  private static Object[] foodArgs(FoodInput in) {
    List<String> aliases = in.aliases() == null ? List.of() : in.aliases().stream().map(String::strip).distinct().toList();
    return new Object[] {in.name().strip(), aliases.toArray(new String[0]), in.kcalPer100g(), in.proteinPer100g(), in.carbsPer100g(),
        in.fatPer100g(), in.defaultPortionG(), blankToNull(in.unitLabel()), blankToNull(in.category())};
  }

  public Food createFood(Jwt jwt, FoodInput in) {
    return db.run(jwt, jdbc -> jdbc.queryForObject("""
        insert into public.foods (name, aliases, kcal_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, default_portion_g, unit_label, category)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?) returning""" + " " + FOOD_COLS, FoodsRepository::food, foodArgs(in)));
  }

  public Food updateFood(Jwt jwt, UUID id, FoodInput in) {
    Object[] a = foodArgs(in);
    List<Food> out = db.run(jwt, jdbc -> jdbc.query("""
        update public.foods set name = ?, aliases = ?, kcal_per_100g = ?, protein_per_100g = ?, carbs_per_100g = ?, fat_per_100g = ?,
          default_portion_g = ?, unit_label = ?, category = ?
        where id = ? returning""" + " " + FOOD_COLS, FoodsRepository::food, a[0], a[1], a[2], a[3], a[4], a[5], a[6], a[7], a[8], id));
    if (out.isEmpty()) throw ApiError.notFound();
    return out.get(0);
  }

  public void deleteFood(Jwt jwt, UUID id) {
    if (db.run(jwt, jdbc -> jdbc.update("delete from public.foods where id = ?", id)) == 0) throw ApiError.notFound();
  }

  /* ---------- Comidas guardadas ---------- */

  private static SavedMeal meal(ResultSet rs, int i) throws SQLException {
    return new SavedMeal(Rows.id(rs, "id"), rs.getString("name"),
        Rows.json(rs, "items", new tools.jackson.core.type.TypeReference<List<String>>() {}, List.of()), rs.getString("meal"));
  }

  public List<SavedMeal> meals(Jwt jwt) {
    return db.run(jwt, jdbc -> jdbc.query("select id, name, items, meal from public.saved_meals order by created_at", FoodsRepository::meal));
  }

  public SavedMeal createMeal(Jwt jwt, SavedMealInput in) {
    return db.run(jwt, jdbc -> jdbc.queryForObject(
        "insert into public.saved_meals (name, items, meal) values (?, ?::jsonb, ?) returning id, name, items, meal",
        FoodsRepository::meal, in.name().strip(), Rows.jsonb(in.items().stream().map(String::strip).toList()), in.meal()));
  }

  public SavedMeal updateMeal(Jwt jwt, UUID id, SavedMealInput in) {
    List<SavedMeal> out = db.run(jwt, jdbc -> jdbc.query(
        "update public.saved_meals set name = ?, items = ?::jsonb, meal = ? where id = ? returning id, name, items, meal",
        FoodsRepository::meal, in.name().strip(), Rows.jsonb(in.items().stream().map(String::strip).toList()), in.meal(), id));
    if (out.isEmpty()) throw ApiError.notFound();
    return out.get(0);
  }

  public void deleteMeal(Jwt jwt, UUID id) {
    if (db.run(jwt, jdbc -> jdbc.update("delete from public.saved_meals where id = ?", id)) == 0) throw ApiError.notFound();
  }

  static String blankToNull(String s) {
    return s == null || s.isBlank() ? null : s.strip();
  }
}
