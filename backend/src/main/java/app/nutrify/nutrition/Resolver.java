package app.nutrify.nutrition;

import app.nutrify.http.HttpJson;
import java.time.Duration;
import java.util.AbstractMap;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import tools.jackson.databind.JsonNode;

/** De dónde salen los valores por 100 g: (a) tus alimentos → (b) base común / USDA / Open Food Facts. */
public class Resolver {

  /**
   * Resultado de buscar un alimento.
   *
   * @param origin       "propio" | "usda" | "off" | "ia" | "ninguno"
   * @param originDetail qué registro se usó (ej. "Bananas, raw")
   * @param source       "guardado" | "base" | "revisar"
   * @param label        nombre que se muestra y se guarda
   * @param match        de dónde salieron los números (ej. "USDA: Bananas, raw")
   * @param found        false = no se encontró nada (valores en 0)
   */
  public record Resolved(Macros per100g, String origin, String originDetail, String source, String label, String match,
                         Portions portions, String note, boolean found) {}

  private static final Pattern NOT_WORD = Pattern.compile("[^a-z0-9ñ ]");
  private static final Pattern SPACES = Text.re("\\s+");
  private static final Pattern SINGULAR = Pattern.compile("\\b(\\w+?)(es|s)\\b");
  private static final Pattern PLATE_LABEL = Text.rei("^plato");

  private final HttpJson http;
  private final NutritionEnv env;

  public Resolver(HttpJson http, NutritionEnv env) {
    this.http = http;
    this.env = env;
  }

  public static String normalize(String s) {
    String t = NOT_WORD.matcher(Text.lower(Text.stripAccents(s))).replaceAll(" ");
    return Text.trim(SPACES.matcher(t).replaceAll(" "));
  }

  static String singular(String s) {
    return SINGULAR.matcher(s).replaceAll("$1");
  }

  /** (a) Mis alimentos guardados, incluyendo alias, plurales, errores de tipeo y (si partial) coincidencias por palabra. */
  public static FoodRow findOwnFood(String name, List<FoodRow> foods, boolean partial) {
    String n = normalize(name);
    String ns = singular(n);
    java.util.function.Predicate<String> same = a -> {
      String x = normalize(a);
      return x.equals(n) || singular(x).equals(ns);
    };
    for (FoodRow f : foods) if (same.test(f.name())) return f;
    for (FoodRow f : foods) if (f.aliases().stream().anyMatch(same)) return f;
    // Errores de tipeo en tus alimentos o sus alias
    List<Map.Entry<String, FoodRow>> candidates = new ArrayList<>();
    for (FoodRow f : foods) {
      candidates.add(new AbstractMap.SimpleEntry<>(normalize(f.name()), f));
      for (String a : f.aliases()) candidates.add(new AbstractMap.SimpleEntry<>(normalize(a), f));
    }
    FoodRow typo = Fuzzy.closest(n, candidates);
    if (typo != null) return typo;
    if (!partial || n.length() < 4) return null;
    // Parcial por palabras: "pollo" encuentra "Pechuga de pollo"
    Pattern re = Pattern.compile("\\b" + Pattern.quote(ns));
    for (FoodRow f : foods) {
      if (re.matcher(singular(normalize(f.name()))).find()) return f;
      for (String a : f.aliases()) if (re.matcher(singular(normalize(a))).find()) return f;
    }
    return null;
  }

  /** Coincidencia exacta (sin errores de tipeo ni parciales): para no cortar "tarta de jamón y queso" en dos. */
  public static boolean isKnownExact(String name, List<FoodRow> foods) {
    String n = normalize(name);
    if (!n.contains(" ")) return false;
    String ns = singular(n);
    java.util.function.Predicate<String> same = a -> {
      String x = normalize(a);
      return x.equals(n) || singular(x).equals(ns);
    };
    for (FoodRow f : foods) if (same.test(f.name()) || f.aliases().stream().anyMatch(same)) return true;
    BaseFoods.BaseFood base = BaseFoods.find(name);
    return base != null && BaseFoods.isExactBaseName(name, base);
  }

  /** Lo rápido y sin red: tus alimentos o la base común. */
  public static Resolved resolveLocal(String name, List<FoodRow> foods) {
    // Orden: tu alimento exacto → base común exacta → tu alimento parcial → base con error de tipeo.
    // Así "fideos" es fideos (base), no "Fideos con manteca" (tuyo, coincide solo una palabra).
    BaseFoods.BaseFood baseHit = BaseFoods.find(name);
    boolean baseExact = baseHit != null && BaseFoods.isExactBaseName(name, baseHit);
    FoodRow own = findOwnFood(name, foods, !baseExact);
    if (own != null) {
      Double portion = own.defaultPortionG() != null && own.defaultPortionG() != 0 ? own.defaultPortionG() : null;
      Double plate = own.unitLabel() != null && PLATE_LABEL.matcher(own.unitLabel()).find() && portion != null ? portion : null;
      return new Resolved(
          new Macros(own.kcalPer100g(), own.proteinPer100g(), own.carbsPer100g(), own.fatPer100g()),
          "propio", own.name(), "guardado", own.name(), null,
          new Portions(portion, null, null, null, plate, own.unitLabel(), "propio"), null, true);
    }

    String label = Text.capitalize(Text.trim(name));
    if (baseHit != null) {
      // Si coincidió por error de tipeo ("pechga de polo"), se muestra el nombre bien escrito
      return new Resolved(baseHit.per100g(), "usda", baseHit.usda(), "base",
          baseExact ? label : Text.capitalize(baseHit.names().get(0)), "USDA: " + baseHit.usda(),
          new Portions(baseHit.unitG(), baseHit.spoonG(), baseHit.scoopG(), baseHit.cupG(), baseHit.plateG(), null, "base"), null, true);
    }
    return null;
  }

  /**
   * Orden: (a) mis alimentos → (b) base pública (común/USDA, luego Open Food Facts).
   * Si no aparece, devuelve "ninguno": la estimación con IA (c) se pide después, junta para todos los alimentos.
   * query es la búsqueda en inglés (del traductor sin IA o de la IA; si no hay, se usa el nombre).
   */
  public Resolved resolveFood(String name, List<FoodRow> foods, String query) {
    Resolved local = resolveLocal(name, foods);
    if (local != null) return local;
    String label = Text.capitalize(Text.trim(name));

    Found usda = lookupUsda(Text.truthy(query) ? query : name);
    if (usda != null) {
      // Se muestra cómo se buscó ("buscado como chicken breast grilled") para que se entienda de dónde sale
      String detail = Text.truthy(query) && !normalize(query).equals(normalize(name))
          ? usda.description() + " (buscado como “" + query + "”)"
          : usda.description();
      return new Resolved(usda.per100g(), "usda", detail, "base", label, "USDA: " + usda.description(), Portions.NONE, null, true);
    }

    Found off = lookupOff(name);
    if (off != null) {
      return new Resolved(off.per100g(), "off", off.description(), "base", label, "Open Food Facts: " + off.description(), Portions.NONE, null, true);
    }

    return new Resolved(Macros.ZERO, "ninguno", null, "revisar", label, null, Portions.NONE,
        "No lo encontré. Cargalo en Alimentos con sus valores.", false);
  }

  record Found(Macros per100g, String description) {}

  /* ---------- USDA FoodData Central ---------- */

  // Palabras que delatan un resultado que no es lo que la persona quiso decir
  private static final Pattern PENALTY = Pattern.compile(
      "\\b(dehydrated|powder|dried|restaurant|babyfood|baby|candies|candied|pie|cake|mix|imitation|lunchmeat|breaded|fried|frozen|canned|sweetened|flavored|substitute|leaves|oil|sauce|soup|dessert|pudding|juice|grain|dry|flour|nuggets|sticks|patty|patties|noodles|cakes|crackers|puffed|dressing)\\b");
  private static final Pattern NOT_TOKEN = Pattern.compile("[^a-z0-9%]+");
  private static final Pattern RAW = Pattern.compile("\\braw\\b");
  private static final Pattern COOKED = Pattern.compile("cook|boil|roast|grill|bake");
  private static final Set<String> STOP = Set.of("a", "an", "the", "of", "with", "and", "or", "in", "la", "el", "de", "con", "y", "del");

  private static List<String> splitTokens(String s) {
    List<String> out = new ArrayList<>();
    for (String t : NOT_TOKEN.split(s, -1)) if (!t.isEmpty()) out.add(t);
    return out;
  }

  private static String stem(String t) {
    return t.replaceFirst("(es|s)$", "");
  }

  /** Puntaje de un resultado de USDA para la búsqueda. -Infinity = descartado. */
  static double usdaScore(String desc, List<String> queryTokens) {
    String d = Text.lower(desc);
    List<String> words = splitTokens(d);
    java.util.function.BiPredicate<String, String> eq = (w, t) -> w.equals(t) || stem(w).equals(stem(t));
    // Palabra completa (con o sin plural): "meat" no debe coincidir con "meatless"
    long matched = queryTokens.stream().filter(t -> words.stream().anyMatch(w -> eq.test(w, t))).count();
    // El alimento principal de USDA (1ª o 2ª palabra) tiene que estar en la búsqueda,
    // y al menos 2 de cada 3 palabras de la búsqueda tienen que aparecer
    List<String> head = words.subList(0, Math.min(2, words.size()));
    boolean headOk = queryTokens.stream().anyMatch(t -> head.stream().anyMatch(w -> eq.test(w, t)));
    if (queryTokens.isEmpty() || !headOk || (double) matched / queryTokens.size() < 0.66) return Double.NEGATIVE_INFINITY;
    double score = matched * 4;
    // El sustantivo principal suele ir primero en USDA ("Bananas, raw")
    if (!words.isEmpty() && stem(words.get(0)).equals(stem(queryTokens.get(0)))) score += 3;
    Matcher pm = PENALTY.matcher(d);
    while (pm.find()) if (!queryTokens.contains(pm.group())) score -= 5;
    if (RAW.matcher(d).find() && queryTokens.stream().noneMatch(t -> COOKED.matcher(t).find())) score += 1;
    score -= words.size() * 0.25;
    return score;
  }

  static Macros usdaPer100g(JsonNode food) {
    JsonNode ns = food.path("foodNutrients");
    java.util.function.Function<int[], Double> byId = ids -> {
      for (int id : ids) {
        for (JsonNode x : ns) {
          Double nid = Json.number(x.get("nutrientId"));
          Double value = Json.number(x.get("value"));
          String unit = Json.str(x.get("unitName"));
          if (nid != null && nid == id && value != null && !(unit != null && Text.lower(unit).equals("kj"))) return value;
        }
      }
      return null;
    };
    // Energía en kcal: 1008 (Energy), 2047/2048 (Atwater). Nunca la de kJ (1062).
    Double kcal = byId.apply(new int[] {1008, 2047, 2048});
    if (kcal == null) return null;
    Double p = byId.apply(new int[] {1003});
    Double c = byId.apply(new int[] {1005, 1050});
    Double f = byId.apply(new int[] {1004, 1085});
    return new Macros(kcal, p != null ? p : 0, c != null ? c : 0, f != null ? f : 0);
  }

  /** (b1) USDA FoodData Central (genéricos). Busca en inglés y elige el mejor resultado, no el primero. */
  Found lookupUsda(String query) {
    String key = env.fdcApiKey() != null ? env.fdcApiKey() : "DEMO_KEY";
    String url = new Query("https://api.nal.usda.gov/fdc/v1/foods/search")
        .set("api_key", key).set("query", query).set("pageSize", "12").set("dataType", "Foundation,SR Legacy").toString();
    try {
      HttpJson.Response res = http.get(url, Map.of(), Duration.ofSeconds(8), Duration.ofDays(7));
      if (!res.ok()) return null;
      JsonNode data = Json.parse(res.body());
      List<String> tokens = splitTokens(Text.lower(query)).stream().filter(t -> t.length() > 1 && !STOP.contains(t)).toList();
      record Ranked(JsonNode f, Macros per, double score) {}
      List<Ranked> ranked = new ArrayList<>();
      for (JsonNode f : data.path("foods")) {
        String desc = Json.str(f.get("description"));
        if (desc == null) continue;
        Macros per = usdaPer100g(f);
        double score = usdaScore(desc, tokens);
        if (per != null && Double.isFinite(score)) ranked.add(new Ranked(f, per, score));
      }
      ranked.sort(Comparator.comparingDouble(Ranked::score).reversed());
      if (ranked.isEmpty()) return null;
      Ranked best = ranked.get(0);
      return new Found(best.per(), best.f().get("description").stringValue());
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      return null;
    } catch (Exception e) {
      return null;
    }
  }

  /* ---------- Open Food Facts (envasados, ej. "yogur la serenisima") ---------- */

  private static final Pattern LANG_PREFIX = Pattern.compile("^[a-z]{2}:");

  Found lookupOff(String query) {
    // API de búsqueda actual (la vieja /cgi/search.pl responde 503 seguido)
    String url = new Query("https://search.openfoodfacts.org/search")
        .set("q", query).set("page_size", "8").set("fields", "product_name,brands,nutriments").toString();
    try {
      HttpJson.Response res = http.get(url, Map.of("User-Agent", "Nutrify/0.2 (app personal de nutricion)"), Duration.ofSeconds(8), Duration.ofDays(7));
      if (!res.ok()) return null;
      JsonNode data = Json.parse(res.body());
      List<String> tokens = Arrays.stream(normalize(query).split(" ", -1)).filter(t -> t.length() > 2).toList();
      for (JsonNode p : data.path("hits")) {
        JsonNode n = p.get("nutriments");
        // Las marcas pueden venir como etiquetas ("xx:great-value"): se dejan legibles
        List<String> rawBrands = new ArrayList<>();
        JsonNode b = p.get("brands");
        if (b != null && b.isArray()) for (JsonNode x : b) rawBrands.add(x.asString());
        else rawBrands.addAll(Arrays.asList((Json.nullish(b) ? "" : b.asString()).split(",", -1)));
        List<String> cleanBrands = new ArrayList<>();
        for (String x : rawBrands) {
          String c = LANG_PREFIX.matcher(Text.trim(x)).replaceFirst("").replace("-", " ");
          if (!c.isEmpty()) cleanBrands.add(c);
        }
        String brands = String.join(", ", cleanBrands);
        String productName = Json.str(p.get("product_name"));
        String name = normalize((productName != null ? productName : "") + " " + brands);
        long matched = tokens.stream().filter(name::contains).count();
        if (n == null || !n.isObject() || tokens.isEmpty() || matched < Math.ceil(tokens.size() / 2.0)) continue;

        double kcal;
        JsonNode k = n.get("energy-kcal_100g");
        if (!Json.nullish(k)) kcal = k.isNumber() ? k.doubleValue() : Double.NaN; // un texto no cuenta (Number.isFinite)
        else if (n.has("energy_100g")) kcal = Json.jsNumber(n.get("energy_100g")) / 4.184;
        else continue;
        if (!Double.isFinite(kcal)) continue;

        List<String> desc = new ArrayList<>();
        if (Text.truthy(productName)) desc.add(productName);
        if (!brands.isEmpty()) desc.add(brands);
        return new Found(new Macros(kcal, orZero(n.get("proteins_100g")), orZero(n.get("carbohydrates_100g")), orZero(n.get("fat_100g"))),
            String.join(" · ", desc));
      }
      return null;
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      return null;
    } catch (Exception e) {
      return null;
    }
  }

  /** n["x"] como número (0 si no está). */
  private static double orZero(JsonNode v) {
    return Json.nullish(v) ? 0 : Json.jsNumber(v);
  }
}
