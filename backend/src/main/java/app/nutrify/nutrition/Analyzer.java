package app.nutrify.nutrition;

import java.util.AbstractMap;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executor;
import java.util.function.Predicate;
import java.util.regex.Pattern;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;
import tools.jackson.databind.node.StringNode;

/**
 * Texto libre → líneas con valores. Usa la IA como mucho 2 veces (y nada si ya conoce todo):
 *  1. reglas → lo que no entiende + traducciones para USDA, en UN pedido (assistParse)
 *  2. tus alimentos / base común / USDA / Open Food Facts
 *  3. lo no encontrado + pesos por unidad desconocidos, en UN pedido (assistFill)
 */
public class Analyzer {
  static final int MAX_SEGMENTS = 30;
  private static final Pattern MIX = Text.rei("\\s(con|y)\\s");

  private final Resolver resolver;
  private final Translator translator;
  private final Gemini gemini;
  private final Executor executor;

  public Analyzer(Resolver resolver, Translator translator, Gemini gemini, Executor executor) {
    this.resolver = resolver;
    this.translator = translator;
    this.gemini = gemini;
    this.executor = executor;
  }

  private record Item(ParsedItem item, boolean llm) {}

  private record Named(String k, String label) {}

  private static Map.Entry<String, JsonNode> entry(String key, JsonNode value) {
    return new AbstractMap.SimpleEntry<>(key, value);
  }

  public AnalyzeResult analyze(String text, List<FoodRow> foods, AiCache cache, boolean aiAllowed) {
    // "tarta de jamón y queso" queda junta si es un alimento conocido (no se corta en el "y")
    List<String> allSegments = Parser.splitSegments(text, name -> Resolver.isKnownExact(name, foods));
    List<String> segments = allSegments.subList(0, Math.min(MAX_SEGMENTS, allSegments.size()));
    boolean ai = aiAllowed && gemini.enabled();
    int aiCalls = 0;

    // 1) Reglas
    List<ParsedItem> ruled = segments.stream().map(Parser::parseSegment).toList();
    Predicate<String> isKnown = name -> Resolver.resolveLocal(name, foods) != null;
    // Mezclas ("arroz con pollo y verduras") o "un plato de X" sin porción conocida: conviene que la IA las separe/estime.
    Predicate<String> plateKnown = name -> {
      Resolver.Resolved r = Resolver.resolveLocal(name, foods);
      if (r == null) return false;
      Portions pr = r.portions();
      return Text.truthy(pr.plateG()) || ("propio".equals(pr.from()) && Text.truthy(pr.unitG()));
    };
    Predicate<ParsedItem> needsHelp = it -> it.isUnsure()
        || ("plato".equals(it.unit()) && !plateKnown.test(it.name()))
        || (!isKnown.test(it.name()) && MIX.matcher(" " + it.name() + " ").find() && it.name().split(" ", -1).length > 2);

    List<Integer> helpIdx = new ArrayList<>();
    for (int i = 0; i < ruled.size(); i++) if (needsHelp.test(ruled.get(i))) helpIdx.add(i);
    // Nombres que no están en tus alimentos ni en la base común: van a USDA y necesitan la búsqueda en inglés
    LinkedHashSet<String> unknownSet = new LinkedHashSet<>();
    for (ParsedItem it : ruled) if (!it.name().isEmpty() && !isKnown.test(it.name())) unknownSet.add(it.name());
    List<String> unknownNames = List.copyOf(unknownSet);

    List<String> preKeys = new ArrayList<>();
    for (int i : helpIdx) preKeys.add(AiCache.key("p", segments.get(i)));
    for (String n : unknownNames) preKeys.add(AiCache.key("q", n));
    Map<String, JsonNode> pre = cache.load(preKeys);
    List<Map.Entry<String, JsonNode>> toSave = new ArrayList<>();

    Map<Integer, List<ParsedItem>> parsedBySeg = new LinkedHashMap<>();
    Map<String, String> queries = new LinkedHashMap<>(); // nombre normalizado → búsqueda en inglés
    for (int i : helpIdx) {
      JsonNode hit = pre.get(AiCache.key("p", segments.get(i)));
      if (hit != null && hit.isArray() && !hit.isEmpty()) {
        List<ParsedItem> items = new ArrayList<>();
        for (JsonNode x : hit) items.add(fromCache(x, segments.get(i)));
        parsedBySeg.put(i, items);
      }
    }
    for (String n : unknownNames) {
      String hit = Json.str(pre.get(AiCache.key("q", n)));
      if (hit != null) queries.put(Resolver.normalize(n), hit);
    }

    // Pedido 1 (solo lo que falta)
    // Antes que la IA: traductor sin IA (diccionario propio y, si no alcanza, uno gratuito). Se guarda igual que lo de la IA.
    List<String> toTranslate = unknownNames.stream().filter(n -> !queries.containsKey(Resolver.normalize(n))).toList();
    List<CompletableFuture<String>> translating = toTranslate.stream()
        .map(n -> CompletableFuture.supplyAsync(() -> translator.translateFood(n), executor)).toList();
    for (int j = 0; j < toTranslate.size(); j++) {
      String q = translating.get(j).join();
      if (!Text.truthy(q)) continue;
      queries.put(Resolver.normalize(toTranslate.get(j)), q);
      toSave.add(entry(AiCache.key("q", toTranslate.get(j)), StringNode.valueOf(q)));
    }

    List<Integer> segAsk = helpIdx.stream().filter(i -> !parsedBySeg.containsKey(i)).toList();
    List<String> nameAsk = unknownNames.stream().filter(n -> !queries.containsKey(Resolver.normalize(n))).toList();
    if (ai && (!segAsk.isEmpty() || !nameAsk.isEmpty())) {
      Gemini.ParseOut r = gemini.assistParse(segAsk.stream().map(segments::get).toList(), nameAsk);
      if (r.called()) aiCalls++;
      r.parsed().forEach((j, items) -> {
        int i = segAsk.get(j);
        parsedBySeg.put(i, items);
        ArrayNode stored = Json.array();
        for (ParsedItem it : items) stored.add(toCache(it));
        toSave.add(entry(AiCache.key("p", segments.get(i)), stored));
      });
      r.queries().forEach((j, q) -> {
        queries.put(Resolver.normalize(nameAsk.get(j)), q);
        toSave.add(entry(AiCache.key("q", nameAsk.get(j)), StringNode.valueOf(q)));
      });
    }

    List<Item> items = new ArrayList<>();
    for (int i = 0; i < segments.size(); i++) {
      if (parsedBySeg.containsKey(i)) for (ParsedItem it : parsedBySeg.get(i)) items.add(new Item(it, true));
      else items.add(new Item(ruled.get(i), false));
    }
    items.removeIf(x -> !Text.truthy(x.item().name()));

    // 2) Resolución (sin IA): una vez por alimento, en paralelo
    Map<String, CompletableFuture<Resolver.Resolved>> resolving = new LinkedHashMap<>();
    for (Item x : items) {
      String key = Resolver.normalize(x.item().name());
      if (!resolving.containsKey(key)) {
        String query = x.item().query() != null ? x.item().query() : queries.get(key);
        String name = x.item().name();
        resolving.put(key, CompletableFuture.supplyAsync(() -> resolver.resolveFood(name, foods, query), executor));
      }
    }
    Map<String, Resolver.Resolved> res = new LinkedHashMap<>();
    resolving.forEach((k, f) -> res.put(k, f.join()));

    // 3) Lo no encontrado y los pesos por unidad que faltan
    List<Named> missing = new ArrayList<>();
    res.forEach((k, r) -> {
      if (!r.found()) missing.add(new Named(k, r.label()));
    });
    Map<String, String> needWeightMap = new LinkedHashMap<>();
    for (Item x : items) {
      String k = Resolver.normalize(x.item().name());
      Resolver.Resolved r = res.get(k);
      Portions pr = r.portions();
      if ((x.item().unit() == null || "unidad".equals(x.item().unit())) && !Text.truthy(pr.unitG()) && !Text.truthy(pr.plateG())) {
        needWeightMap.put(k, r.label());
      }
    }
    List<Named> needWeight = new ArrayList<>();
    needWeightMap.forEach((k, label) -> needWeight.add(new Named(k, label)));

    List<String> pre2Keys = new ArrayList<>();
    for (Named m : missing) pre2Keys.add(AiCache.key("e", m.label()));
    for (Named w : needWeight) pre2Keys.add(AiCache.key("w", w.label()));
    Map<String, JsonNode> pre2 = cache.load(pre2Keys);
    Map<String, Macros> estimates = new LinkedHashMap<>();
    Map<String, Double> weights = new LinkedHashMap<>();
    for (Named m : missing) {
      JsonNode hit = pre2.get(AiCache.key("e", m.label()));
      Double kcal = hit != null && hit.isObject() ? Json.number(hit.get("kcal")) : null;
      if (kcal != null && Double.isFinite(kcal)) {
        estimates.put(m.k(), new Macros(kcal, Json.jsNumber(hit.get("protein")), Json.jsNumber(hit.get("carbs")), Json.jsNumber(hit.get("fat"))));
      }
    }
    for (Named w : needWeight) {
      Double g = Json.number(pre2.get(AiCache.key("w", w.label())));
      if (g != null && g > 0) weights.put(w.k(), g);
    }

    // Pedido 2 (solo lo que falta)
    List<Named> estAsk = missing.stream().filter(m -> !estimates.containsKey(m.k())).toList();
    List<Named> wAsk = needWeight.stream().filter(w -> !weights.containsKey(w.k())).toList();
    if (ai && (!estAsk.isEmpty() || !wAsk.isEmpty())) {
      Gemini.FillOut r = gemini.assistFill(estAsk.stream().map(Named::label).toList(), wAsk.stream().map(Named::label).toList());
      if (r.called()) aiCalls++;
      r.estimates().forEach((j, v) -> {
        estimates.put(estAsk.get(j).k(), v);
        toSave.add(entry(AiCache.key("e", estAsk.get(j).label()), Json.tree(v)));
      });
      r.unitG().forEach((j, g) -> {
        weights.put(wAsk.get(j).k(), g);
        toSave.add(entry(AiCache.key("w", wAsk.get(j).label()), Json.tree(g)));
      });
    }

    // Estimaciones de la IA → los alimentos no encontrados pasan a "ia" (siempre "revisar")
    estimates.forEach((k, v) -> {
      Resolver.Resolved r = res.get(k);
      res.put(k, new Resolver.Resolved(v, "ia", null, r.source(), r.label(), "Estimado", r.portions(),
          "Valores estimados. Revisalos y guardalo en Alimentos para la próxima.", true));
    });

    cache.save(toSave);

    // Lo que la IA todavía podría mejorar: textos sin interpretar, alimentos sin datos y pesos por unidad supuestos.
    // Se cuenta por alimento (no por tarea): un mismo alimento puede necesitar interpretación, valores y peso
    List<Integer> segLeft = segAsk.stream().filter(i -> !parsedBySeg.containsKey(i)).toList();
    List<Named> estLeft = estAsk.stream().filter(m -> !estimates.containsKey(m.k())).toList();
    List<Named> wLeft = wAsk.stream().filter(w -> !weights.containsKey(w.k())).toList();
    Map<String, String> pendingFoods = new LinkedHashMap<>();
    for (int i : segLeft) {
      String n = ruled.get(i).name();
      pendingFoods.put(Resolver.normalize(Text.truthy(n) ? n : segments.get(i)), segments.get(i));
    }
    for (Named m : estLeft) pendingFoods.put(m.k(), m.label());
    for (Named w : wLeft) pendingFoods.put(w.k(), w.label());
    int aiNeeded = pendingFoods.size();
    // Pedido 1 si hay textos sin interpretar o nombres sin traducir; pedido 2 si faltan valores o pesos
    boolean namesLeft = nameAsk.stream().anyMatch(n -> !queries.containsKey(Resolver.normalize(n)));
    int aiCallsNeeded = aiNeeded > 0
        ? (!segLeft.isEmpty() || namesLeft ? 1 : 0) + (!estLeft.isEmpty() || !wLeft.isEmpty() ? 1 : 0)
        : 0;

    // 4) Armar las líneas
    List<AnalyzedLine> lines = new ArrayList<>();
    for (Item x : items) {
      ParsedItem item = x.item();
      boolean llm = x.llm();
      String k = Resolver.normalize(item.name());
      Resolver.Resolved r = res.get(k);
      Double w = weights.get(k);
      Portions portions = w != null ? r.portions().withUnitG(w) : r.portions();
      boolean guessedUnit = w != null;
      Grams g = Parser.toGrams(item, portions);
      double grams = g.grams();
      double f = grams / 100;
      Macros p = r.per100g();
      // Cantidad adivinada por la IA ("un plato", peso de 1 unidad) → siempre "revisar"
      boolean guessedQty = (llm && item.isUnsure()) || guessedUnit;
      String qtyDetail = guessedUnit
          ? "1 unidad ≈ " + Text.dec(w) + " g (estimado por IA)"
          : llm && item.isUnsure()
              ? Text.dec(grams) + " g estimados por IA a partir de lo que escribiste"
              : g.qtyDetail();
      lines.add(new AnalyzedLine(
          item.raw(),
          r.label(),
          Text.round1(grams),
          Text.round(p.kcal() * f),
          Text.round1(p.protein() * f),
          Text.round1(p.carbs() * f),
          Text.round1(p.fat() * f),
          "ia".equals(r.origin()) || guessedQty ? "revisar" : r.source(),
          new Macros(Text.round1(p.kcal()), Text.round1(p.protein()), Text.round1(p.carbs()), Text.round1(p.fat())),
          r.match(),
          r.note() != null ? r.note() : g.note(),
          r.found(),
          new AnalyzedLine.Origin(r.origin(), r.originDetail(), guessedQty ? "ia" : g.qty(), qtyDetail, llm)));
    }
    return new AnalyzeResult(lines, aiCalls, aiNeeded, List.copyOf(pendingFoods.values()), aiCallsNeeded);
  }

  /** Lo que se guarda de una interpretación de la IA (sin el texto original). */
  private static ObjectNode toCache(ParsedItem it) {
    ObjectNode o = Json.object();
    o.put("qty", it.qty());
    if (it.unit() != null) o.put("unit", it.unit());
    o.put("name", it.name());
    if (it.unsure() != null) o.put("unsure", it.unsure());
    if (it.query() != null) o.put("query", it.query());
    return o;
  }

  private static ParsedItem fromCache(JsonNode x, String raw) {
    JsonNode u = x.get("unsure");
    return new ParsedItem(raw, Json.jsNumber(x.get("qty")), Json.str(x.get("unit")), Json.str(x.get("name")) != null ? Json.str(x.get("name")) : "",
        u != null && u.isBoolean() ? u.booleanValue() : null, Json.str(x.get("query")));
  }
}
