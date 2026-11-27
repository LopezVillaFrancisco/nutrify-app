package app.nutrify.nutrition;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.fail;

import app.nutrify.http.HttpJson;
import java.io.IOException;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.util.AbstractMap;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * Casos de referencia (golden tests): golden.json tiene textos de entrada y la salida esperada de cada uno,
 * con USDA, Open Food Facts, el traductor y Gemini simulados. Si un cambio altera cualquier resultado
 * (una línea, un prompt, lo que se guarda en la memoria de la IA o los pedidos de red), el test lo marca.
 */
class GoldenTest {
  static JsonNode G;
  static List<FoodRow> FOODS;
  static ExecutorService executor;

  @BeforeAll
  static void load() {
    G = Json.resource("/golden/golden.json");
    FOODS = new ArrayList<>();
    for (JsonNode f : G.get("foods")) {
      List<String> aliases = new ArrayList<>();
      for (JsonNode a : f.get("aliases")) aliases.add(a.stringValue());
      FOODS.add(new FoodRow(f.get("id").stringValue(), f.get("name").stringValue(), aliases,
          f.get("kcal_per_100g").doubleValue(), f.get("protein_per_100g").doubleValue(), f.get("carbs_per_100g").doubleValue(),
          f.get("fat_per_100g").doubleValue(), Json.number(f.get("default_portion_g")), Json.str(f.get("unit_label"))));
    }
    executor = Executors.newVirtualThreadPerTaskExecutor();
  }

  @AfterAll
  static void close() {
    executor.close();
  }

  /* ---------- Piezas sueltas ---------- */

  @Test
  void editDistance() {
    for (JsonNode c : G.get("editDistance")) {
      assertEquals(c.get("out").intValue(), Fuzzy.editDistance(c.get("a").stringValue(), c.get("b").stringValue(), c.get("max").intValue()), c.toString());
    }
  }

  @Test
  void splitSegments() {
    for (JsonNode c : G.get("split")) {
      String text = c.get("text").stringValue();
      same(c.get("plain"), Json.tree(Parser.splitSegments(text)), "split " + text);
      same(c.get("known"), Json.tree(Parser.splitSegments(text, n -> Resolver.isKnownExact(n, FOODS))), "split known " + text);
    }
  }

  @Test
  void parseSegment() {
    for (JsonNode c : G.get("parse")) {
      String s = c.get("segment").stringValue();
      same(c.get("out"), Json.tree(Parser.parseSegment(s)), "parse " + s);
    }
  }

  @Test
  void toGrams() {
    for (JsonNode c : G.get("toGrams")) {
      JsonNode i = c.get("item");
      JsonNode p = c.get("portions");
      ParsedItem item = new ParsedItem(i.get("raw").stringValue(), i.get("qty").doubleValue(), Json.str(i.get("unit")), i.get("name").stringValue(), null);
      Portions portions = new Portions(Json.number(p.get("unitG")), Json.number(p.get("spoonG")), Json.number(p.get("scoopG")),
          Json.number(p.get("cupG")), Json.number(p.get("plateG")), Json.str(p.get("unitLabel")), Json.str(p.get("from")));
      same(c.get("out"), Json.tree(Parser.toGrams(item, portions)), "toGrams " + c.get("item") + " " + p);
    }
  }

  @Test
  void baseFoods() {
    for (JsonNode c : G.get("base")) {
      String name = c.get("name").stringValue();
      BaseFoods.BaseFood hit = BaseFoods.find(name);
      assertEquals(Json.str(c.get("out")), hit == null ? null : hit.names().get(0), "base " + name);
      if (hit != null) assertEquals(c.get("exact").booleanValue(), BaseFoods.isExactBaseName(name, hit), "exact " + name);
    }
  }

  @Test
  void dictTranslate() {
    for (JsonNode c : G.get("translate")) {
      String name = c.get("name").stringValue();
      assertEquals(Json.str(c.get("out")), Translator.dictTranslate(name), "translate " + name);
    }
  }

  @Test
  void normalizeAndCacheKey() {
    for (JsonNode c : G.get("normalize")) assertEquals(c.get("out").stringValue(), Resolver.normalize(c.get("s").stringValue()));
    for (JsonNode c : G.get("cacheKey")) assertEquals(c.get("out").stringValue(), AiCache.key("p", c.get("s").stringValue()));
  }

  @Test
  void ownFoods() {
    for (JsonNode c : G.get("ownFood")) {
      String name = c.get("name").stringValue();
      FoodRow partial = Resolver.findOwnFood(name, FOODS, true);
      FoodRow strict = Resolver.findOwnFood(name, FOODS, false);
      assertEquals(Json.str(c.get("partial")), partial == null ? null : partial.id(), "own partial " + name);
      assertEquals(Json.str(c.get("strict")), strict == null ? null : strict.id(), "own strict " + name);
      assertEquals(c.get("known").booleanValue(), Resolver.isKnownExact(name, FOODS), "known " + name);
    }
  }

  /* ---------- Cálculo completo ---------- */

  @Test
  void analyzeWithoutAi() {
    FakeHttp http = new FakeHttp();
    Analyzer analyzer = analyzer(http, new Gemini(http, env(), Clock.systemUTC()));
    for (JsonNode c : G.get("analyze")) runCase(analyzer, http, c, false);
  }

  @Test
  void analyzeWithAi() {
    FakeHttp http = new FakeHttp();
    // Una sola instancia de Gemini para todos los casos: el estado de Google pasa de uno al siguiente, como en el servidor
    Analyzer analyzer = analyzer(http, new Gemini(http, env(), Clock.systemUTC()));
    Gemini gemini = analyzerGemini;
    for (JsonNode c : G.get("ai")) {
      http.gemini.clear();
      for (JsonNode r : c.get("responses")) http.geminiQueue.add(r);
      runCase(analyzer, http, c, true);
      assertEquals(0, http.geminiQueue.size(), "sobraron respuestas de Gemini: " + c.get("text"));
      AiProblem p = gemini.problem();
      assertEquals(Json.str(c.get("problem")), p == null ? null : p.kind(), "problema con Google: " + c.get("text"));
    }
  }

  private Gemini analyzerGemini;

  private Analyzer analyzer(FakeHttp http, Gemini gemini) {
    analyzerGemini = gemini;
    NutritionEnv env = env();
    return new Analyzer(new Resolver(http, env), new Translator(http, env), gemini, executor);
  }

  private static NutritionEnv env() {
    return new NutritionEnv(null, "test-key", null, false, false);
  }

  private void runCase(Analyzer analyzer, FakeHttp http, JsonNode c, boolean aiCase) {
    String text = c.get("text").stringValue();
    MemoryCache cache = new MemoryCache();
    JsonNode seed = c.get("seed");
    if (seed != null) for (JsonNode kv : seed) cache.store.put(kv.get(0).stringValue(), kv.get(1));
    http.urls.clear();
    boolean ai = aiCase && c.get("ai").booleanValue();
    AnalyzeResult result = analyzer.analyze(text, FOODS, cache, ai);

    same(c.get("result"), Json.tree(result), "resultado de: " + text);
    ArrayNode saved = Json.array();
    for (Map.Entry<String, JsonNode> e : cache.saved) saved.addArray().add(e.getKey()).add(e.getValue());
    same(c.get("saved"), saved, "memoria guardada de: " + text);
    same(c.get("urls"), Json.tree(new ArrayList<>(new TreeSet<>(http.urls))), "pedidos de red de: " + text);
    if (aiCase) same(c.get("gemini"), Json.tree(http.gemini), "pedidos a Gemini de: " + text);
  }

  /* ---------- Simulación de red y de memoria ---------- */

  static final class MemoryCache implements AiCache {
    final Map<String, JsonNode> store = new LinkedHashMap<>();
    final List<Map.Entry<String, JsonNode>> saved = new ArrayList<>();

    @Override
    public synchronized Map<String, JsonNode> load(List<String> keys) {
      Map<String, JsonNode> out = new LinkedHashMap<>();
      for (String k : keys) if (store.containsKey(k)) out.put(k, store.get(k));
      return out;
    }

    @Override
    public synchronized void save(List<Map.Entry<String, JsonNode>> entries) {
      for (Map.Entry<String, JsonNode> e : entries) {
        store.put(e.getKey(), e.getValue());
        saved.add(new AbstractMap.SimpleEntry<>(e.getKey(), e.getValue()));
      }
    }
  }

  static final class FakeHttp implements HttpJson {
    final List<String> urls = java.util.Collections.synchronizedList(new ArrayList<>());
    final List<ObjectNode> gemini = java.util.Collections.synchronizedList(new ArrayList<>());
    final Deque<JsonNode> geminiQueue = new ArrayDeque<>();

    @Override
    public Response get(String url, Map<String, String> headers, Duration timeout, Duration cacheTtl) throws IOException {
      URI u = URI.create(url);
      switch (u.getHost()) {
        case "api.nal.usda.gov" -> {
          urls.add(url);
          return new Response(200, Json.write(G.get("usdaResponse")));
        }
        case "search.openfoodfacts.org" -> {
          urls.add(url);
          return new Response(200, Json.write(G.get("offResponse")));
        }
        case "api.mymemory.translated.net" -> {
          urls.add(url);
          String q = queryParam(u, "q");
          String norm = Text.trim(Text.lower(Text.stripAccents(q)));
          JsonNode hit = G.get("mymemory").get(norm);
          ObjectNode body = Json.object();
          body.putObject("responseData").put("translatedText", hit != null ? hit.stringValue() : q);
          return new Response(200, Json.write(body));
        }
        case "generativelanguage.googleapis.com" -> {
          return gemini("GET", u, null);
        }
        default -> throw new IOException("URL no prevista: " + url);
      }
    }

    @Override
    public Response post(String url, Map<String, String> headers, String body, Duration timeout) throws IOException {
      URI u = URI.create(url);
      if (!"generativelanguage.googleapis.com".equals(u.getHost())) throw new IOException("URL no prevista: " + url);
      return gemini("POST", u, body);
    }

    private synchronized Response gemini(String method, URI u, String body) throws IOException {
      ObjectNode rec = Json.object();
      rec.put("method", method);
      rec.put("path", u.getRawPath());
      rec.set("body", body == null ? Json.MAPPER.nullNode() : Json.parse(body));
      gemini.add(rec);
      JsonNode next = geminiQueue.poll();
      if (next == null) throw new IOException("Gemini: respuesta no prevista");
      if (next.get("status").intValue() != 200) return new Response(next.get("status").intValue(), Json.write(next.get("body")));
      JsonNode t = next.get("text");
      String text = t.isString() ? t.stringValue() : Json.write(t);
      ObjectNode out = Json.object();
      out.putArray("candidates").addObject().putObject("content").putArray("parts").addObject().put("text", text);
      return new Response(200, Json.write(out));
    }

    private static String queryParam(URI u, String name) {
      for (String kv : u.getRawQuery().split("&")) {
        int i = kv.indexOf('=');
        if (URLDecoder.decode(kv.substring(0, i), StandardCharsets.UTF_8).equals(name)) {
          return URLDecoder.decode(kv.substring(i + 1), StandardCharsets.UTF_8);
        }
      }
      return "";
    }
  }

  /* ---------- Comparación de JSON (null = no está; números por valor) ---------- */

  static void same(JsonNode expected, JsonNode actual, String what) {
    List<String> diffs = new ArrayList<>();
    diff(expected, actual, "$", diffs);
    if (!diffs.isEmpty()) fail(what + "\n  " + String.join("\n  ", diffs.subList(0, Math.min(10, diffs.size())))
        + "\n  esperado: " + expected + "\n  obtenido: " + actual);
  }

  private static void diff(JsonNode e, JsonNode a, String path, List<String> out) {
    boolean eNull = Json.nullish(e);
    boolean aNull = Json.nullish(a);
    if (eNull || aNull) {
      if (eNull != aNull) out.add(path + ": esperado " + e + ", obtenido " + a);
      return;
    }
    if (e.isNumber() && a.isNumber()) {
      if (Math.abs(e.doubleValue() - a.doubleValue()) > 1e-9) out.add(path + ": esperado " + e + ", obtenido " + a);
      return;
    }
    if (e.isObject() && a.isObject()) {
      TreeSet<String> keys = new TreeSet<>();
      e.propertyNames().forEach(keys::add);
      a.propertyNames().forEach(keys::add);
      for (String k : keys) diff(e.get(k), a.get(k), path + "." + k, out);
      return;
    }
    if (e.isArray() && a.isArray()) {
      if (e.size() != a.size()) out.add(path + ": largo esperado " + e.size() + ", obtenido " + a.size());
      Iterator<JsonNode> ei = e.iterator();
      Iterator<JsonNode> ai = a.iterator();
      int i = 0;
      while (ei.hasNext() && ai.hasNext()) diff(ei.next(), ai.next(), path + "[" + i++ + "]", out);
      return;
    }
    if (!e.equals(a)) out.add(path + ": esperado " + e + ", obtenido " + a);
  }
}
