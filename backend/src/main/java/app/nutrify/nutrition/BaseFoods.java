package app.nutrify.nutrition;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import tools.jackson.databind.JsonNode;

/**
 * Base de alimentos comunes (Argentina) con valores por 100 g tomados de USDA FoodData Central
 * (SR Legacy / Foundation; el fdcId queda como referencia). Los datos están en resources/nutrition/base-foods.json.
 */
public final class BaseFoods {
  private BaseFoods() {}

  /**
   * @param names primero el nombre que se muestra; el resto son sinónimos
   * @param unitG gramos de 1 unidad · spoonG: 1 cucharada · cupG: 1 taza · plateG: 1 plato promedio de adulto, cocido
   */
  public record BaseFood(List<String> names, String usda, long fdcId, Macros per100g,
                         Double unitG, Double spoonG, Double scoopG, Double cupG, Double plateG) {}

  public static final List<BaseFood> ALL = load();

  private static List<BaseFood> load() {
    List<BaseFood> out = new ArrayList<>();
    for (JsonNode f : Json.resource("/nutrition/base-foods.json")) {
      List<String> names = new ArrayList<>();
      for (JsonNode n : f.get("names")) names.add(n.stringValue());
      JsonNode p = f.get("per100g");
      out.add(new BaseFood(List.copyOf(names), f.get("usda").stringValue(), f.get("fdcId").longValue(),
          new Macros(p.get("kcal").doubleValue(), p.get("protein").doubleValue(), p.get("carbs").doubleValue(), p.get("fat").doubleValue()),
          Json.number(f.get("unitG")), Json.number(f.get("spoonG")), Json.number(f.get("scoopG")),
          Json.number(f.get("cupG")), Json.number(f.get("plateG"))));
    }
    return List.copyOf(out);
  }

  private static final Pattern NOT_WORD = Pattern.compile("[^a-z0-9ñ ]");
  private static final Pattern SPACES = Text.re("\\s+");
  private static final Pattern PLURAL_ES = Pattern.compile("\\b(\\w+?)es\\b");
  private static final Pattern PLURAL_S = Pattern.compile("\\b(\\w+?)s\\b");
  // Palabras que no cambian los valores por 100 g ("banana grande" sigue siendo banana).
  // "Grillado" o "al horno" sí cambian (se pierde agua), por eso no están: esos van a USDA.
  private static final Pattern FILLER = Pattern.compile("\\b(natural|fresc[oa]s?|chic[oa]s?|grandes?|median[oa]s?|madur[oa]s?)\\b");

  // Se arma después de los patrones (los usa variants)
  private static final Map<String, BaseFood> INDEX = new LinkedHashMap<>();

  static {
    for (BaseFood food : ALL) for (String name : food.names()) for (String v : variants(name)) INDEX.putIfAbsent(v, food);
  }

  static String strip(String s) {
    String t = NOT_WORD.matcher(Text.lower(Text.stripAccents(s))).replaceAll(" ");
    return Text.trim(SPACES.matcher(t).replaceAll(" "));
  }

  /** Variantes de un nombre para comparar: tal cual, sin plural. */
  private static Set<String> variants(String name) {
    String n = strip(name);
    Set<String> out = new LinkedHashSet<>();
    out.add(n);
    out.add(PLURAL_ES.matcher(n).replaceAll("$1"));
    out.add(PLURAL_S.matcher(n).replaceAll("$1"));
    return out;
  }

  private static String withoutFiller(String name) {
    return Text.trim(SPACES.matcher(FILLER.matcher(strip(name)).replaceAll(" ")).replaceAll(" "));
  }

  /** true si el nombre coincide con la base sin corregir tipeos (exacto, plural o con palabras de relleno). */
  public static boolean isExactBaseName(String name, BaseFood food) {
    Set<String> vs = new LinkedHashSet<>(variants(name));
    vs.addAll(variants(withoutFiller(name)));
    for (String n : food.names()) for (String v : variants(n)) if (vs.contains(v)) return true;
    return false;
  }

  /** Busca en la base común: coincidencia exacta, sin plural, sin palabras de relleno o con error de tipeo. */
  public static BaseFood find(String name) {
    for (String v : variants(name)) {
      BaseFood hit = INDEX.get(v);
      if (hit != null) return hit;
    }
    String cleaned = withoutFiller(name);
    if (!cleaned.isEmpty() && !cleaned.equals(strip(name))) {
      for (String v : variants(cleaned)) {
        BaseFood hit = INDEX.get(v);
        if (hit != null) return hit;
      }
    }
    // Errores de tipeo: "pechga de polo", "yogurth", "banan"
    return Fuzzy.closest(!cleaned.isEmpty() ? cleaned : strip(name), INDEX.entrySet());
  }
}
