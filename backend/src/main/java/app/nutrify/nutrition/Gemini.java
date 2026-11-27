package app.nutrify.nutrition;

import app.nutrify.http.HttpJson;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * LLM barato (Gemini Flash-Lite, nivel gratuito) con salida JSON estricta. Solo en el servidor.
 *
 * Para no gastar la cuota (15 pedidos por minuto en el plan gratis), cada "Calcular" hace COMO MÁXIMO 2 pedidos,
 * sin importar cuántos alimentos tenga el texto:
 *  1. assistParse: interpreta lo que las reglas no entendieron y traduce nombres a búsquedas para USDA.
 *  2. assistFill: estima valores de lo que no se encontró y el peso de 1 unidad cuando hace falta.
 * Además las respuestas se guardan (ver AiCache), así que un mismo alimento no se vuelve a preguntar.
 *
 * El estado (freno por minuto, último problema con Google) vive en esta instancia: es una por servidor.
 */
public class Gemini {
  // Alias estable y barato: sigue al último Flash-Lite, no se rompe cuando Google retira una versión
  public static final String DEFAULT_MODEL = "gemini-flash-lite-latest";
  private static final String API = "https://generativelanguage.googleapis.com/v1beta/models/";
  static final List<String> UNITS = List.of("g", "ml", "unidad", "scoop", "cucharada", "cucharadita", "taza", "vaso");

  private final HttpJson http;
  private final NutritionEnv env;
  private final Clock clock;

  public Gemini(HttpJson http, NutritionEnv env, Clock clock) {
    this.http = http;
    this.env = env;
    this.clock = clock;
  }

  private long now() {
    return clock.millis();
  }

  public boolean enabled() {
    return env.geminiApiKey() != null;
  }

  /** Se apaga la IA para todos poniendo AI_DISABLED=1 en las variables de entorno. */
  public boolean killSwitch() {
    return env.aiDisabled();
  }

  public String model() {
    return env.geminiModel() != null ? env.geminiModel() : DEFAULT_MODEL;
  }

  /* ---------- Freno: nunca pasar el límite por minuto ---------- */
  public static final int MAX_PER_MINUTE = 10; // margen debajo de los 15 del plan gratis
  private final ArrayDeque<Long> recent = new ArrayDeque<>();

  private synchronized boolean takeSlot() {
    long t = now();
    while (!recent.isEmpty() && t - recent.peekFirst() > 60_000) recent.pollFirst();
    if (recent.size() >= MAX_PER_MINUTE) return false;
    recent.addLast(t);
    return true;
  }

  public record MinuteSlots(int free, int max, long waitSec) {}

  /** Lugares libres en el freno por minuto y cuánto falta para que se libere uno. */
  public synchronized MinuteSlots minuteSlots() {
    long t = now();
    while (!recent.isEmpty() && t - recent.peekFirst() > 60_000) recent.pollFirst();
    int free = MAX_PER_MINUTE - recent.size();
    long waitSec = free > 0 ? 0 : (long) Math.ceil((60_000 - (t - recent.peekFirst())) / 1000.0);
    return new MinuteSlots(free, MAX_PER_MINUTE, waitSec);
  }

  /* ---------- Último problema con Google (para avisar ANTES de gastar un pedido) ---------- */
  private volatile AiProblem problem;

  /** Problema vigente: si Google cortó (por minuto o por día), no se manda nada hasta que se libere. */
  public synchronized AiProblem problem() {
    if (problem != null && problem.until() != null && now() >= problem.until()) problem = null;
    return problem;
  }

  /** Restaura el problema guardado (con varias instancias del servidor, cada pedido puede caer en otra). */
  public synchronized void restoreProblem(JsonNode p) {
    if (Json.nullish(p) || !p.isObject()) return;
    Double at = Json.number(p.get("at"));
    String kind = Json.str(p.get("kind"));
    if (at == null || kind == null) return;
    Double until = Json.number(p.get("until"));
    if (until != null && until != 0 && now() >= until) return;
    if (problem == null || at > problem.at()) problem = new AiProblem(kind, at.longValue(), until != null ? until.longValue() : null);
  }

  /** Medianoche del Pacífico: ahí Google renueva la cuota diaria del plan gratis. */
  static long nextPacificMidnight(long now) {
    ZonedDateTime la = Instant.ofEpochMilli(now).atZone(ZoneId.of("America/Los_Angeles"));
    long elapsed = (la.getHour() * 3600L + la.getMinute() * 60L + la.getSecond()) * 1000L;
    return now + 86_400_000L - elapsed;
  }

  private static final Pattern LEADING_FLOAT = Pattern.compile("^[\\t\\n\\x0B\\f\\r ]*([+-]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+-]?\\d+)?)");
  private static final Pattern PER_DAY = Pattern.compile("PerDay", Pattern.CASE_INSENSITIVE);
  private static final Pattern API_KEY = Pattern.compile("api key", Pattern.CASE_INSENSITIVE);

  private synchronized void recordFailure(HttpJson.Response res) {
    long t = now();
    JsonNode body;
    try {
      body = Json.parse(res.body());
    } catch (Exception e) {
      body = null;
    }
    JsonNode details = body == null ? null : body.path("error").path("details");
    if (res.status() == 429) {
      List<String> ids = new ArrayList<>();
      Double retry = null;
      if (details != null && details.isArray()) {
        for (JsonNode d : details) {
          String q = Json.str(d.get("quotaId"));
          if (Text.truthy(q)) ids.add(q);
          for (JsonNode v : d.path("violations")) {
            String vq = Json.str(v.get("quotaId"));
            if (Text.truthy(vq)) ids.add(vq);
          }
        }
        for (JsonNode d : details) {
          String rd = Json.str(d.get("retryDelay"));
          if (Text.truthy(rd)) {
            Matcher m = LEADING_FLOAT.matcher(rd);
            retry = m.find() ? Double.parseDouble(m.group(1)) : Double.NaN;
            break;
          }
        }
      }
      if (PER_DAY.matcher(String.join(" ", ids)).find()) problem = new AiProblem("dia", t, nextPacificMidnight(t));
      else {
        double secs = retry != null && Double.isFinite(retry) ? Math.ceil(retry) : 60;
        problem = new AiProblem("minuto", t, t + (long) (secs * 1000));
      }
      return;
    }
    if (res.status() == 400 || res.status() == 401 || res.status() == 403) {
      String msg = body == null ? null : Json.str(body.path("error").get("message"));
      if (res.status() != 400 || API_KEY.matcher(msg == null ? "" : msg).find()) {
        problem = new AiProblem("clave", t, t + 10 * 60_000L);
        return;
      }
    }
    // Error de Google (500/503…): se avisa, pero no se bloquea
    problem = new AiProblem("error", t, t + 2 * 60_000L);
  }

  private synchronized void setProblem(AiProblem p) {
    problem = p;
  }

  /* ---------- Chequeo de conexión: consulta los datos del modelo (no genera nada, no gasta cuota) ---------- */

  /** "ok" | "clave" | "modelo" | "sin_conexion" */
  private record Check(long at, String result) {}

  private volatile Check lastCheck;

  public String checkConnection(boolean force) {
    String apiKey = env.geminiApiKey();
    if (apiKey == null) return "clave";
    Check last = lastCheck;
    if (!force && last != null && now() - last.at() < 5 * 60_000) return last.result();
    String result;
    try {
      HttpJson.Response res = getModel(apiKey, model());
      if (res.status() == 404 && !model().equals(DEFAULT_MODEL)) res = getModel(apiKey, DEFAULT_MODEL);
      int s = res.status();
      result = res.ok() ? "ok" : s == 404 ? "modelo" : s == 400 || s == 401 || s == 403 ? "clave" : "sin_conexion";
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      result = "sin_conexion";
    } catch (Exception e) {
      result = "sin_conexion";
    }
    lastCheck = new Check(now(), result);
    synchronized (this) {
      if (result.equals("ok") && problem != null && problem.kind().equals("clave")) problem = null;
    }
    return result;
  }

  private HttpJson.Response getModel(String apiKey, String model) throws Exception {
    return http.get(API + model, Map.of("x-goog-api-key", apiKey), Duration.ofSeconds(6), null);
  }

  /** La respuesta y si el pedido se llegó a hacer (si lo frenó el límite, called = false). */
  record Result(JsonNode data, boolean called) {}

  private static final Object NOT_FOUND = new Object();

  Result geminiJson(String prompt, JsonNode schema) {
    String apiKey = env.geminiApiKey();
    AiProblem blocked = problem();
    // Si Google ya dijo que no (límite o clave), no se manda: sería un pedido gastado de más
    if (apiKey == null || killSwitch() || (blocked != null && !blocked.kind().equals("error")) || !takeSlot()) return new Result(null, false);
    String configured = model();
    Object first = callGemini(apiKey, configured, prompt, schema);
    // Modelo retirado o inexistente: se reintenta con el alias por defecto
    if (first == NOT_FOUND && !configured.equals(DEFAULT_MODEL)) {
      Object second = callGemini(apiKey, DEFAULT_MODEL, prompt, schema);
      return new Result(second == NOT_FOUND ? null : (JsonNode) second, true);
    }
    return new Result(first == NOT_FOUND ? null : (JsonNode) first, true);
  }

  /** JsonNode, null (falló) o NOT_FOUND (el modelo no existe). */
  private Object callGemini(String apiKey, String model, String prompt, JsonNode schema) {
    ObjectNode body = Json.object();
    body.putArray("contents").addObject().putArray("parts").addObject().put("text", prompt);
    ObjectNode config = body.putObject("generationConfig");
    config.put("responseMimeType", "application/json");
    config.set("responseSchema", schema);
    config.put("temperature", 0);
    try {
      HttpJson.Response res = http.post(API + model + ":generateContent",
          Map.of("x-goog-api-key", apiKey, "content-type", "application/json"), Json.write(body), Duration.ofSeconds(12));
      if (res.status() == 404) return NOT_FOUND;
      // 429 (límite) u otro error: no se reintenta, para no gastar más cuota. Se anota para avisar la próxima.
      if (!res.ok()) {
        recordFailure(res);
        return null;
      }
      setProblem(null);
      JsonNode data = Json.parse(res.body());
      String text = Json.str(data.path("candidates").path(0).path("content").path("parts").path(0).get("text"));
      JsonNode parsed = text == null ? null : Json.parse(text);
      // Sin texto en la respuesta: se toma como error de Google
      if (parsed == null || parsed.isMissingNode()) throw new IllegalStateException("Gemini respondió sin JSON");
      return parsed;
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      long t = now();
      setProblem(new AiProblem("error", t, t + 2 * 60_000L));
      return null;
    } catch (Exception e) {
      long t = now();
      setProblem(new AiProblem("error", t, t + 2 * 60_000L));
      return null;
    }
  }

  /* ---------- Pedido 1: interpretar y traducir ---------- */

  public record ParseOut(Map<Integer, List<ParsedItem>> parsed, Map<Integer, String> queries, boolean called) {}

  private static final JsonNode PARSE_SCHEMA = Json.parse("""
      {
        "type": "OBJECT",
        "properties": {
          "segmentos": {
            "type": "ARRAY",
            "items": {
              "type": "OBJECT",
              "properties": {
                "i": { "type": "INTEGER" },
                "items": {
                  "type": "ARRAY",
                  "items": {
                    "type": "OBJECT",
                    "properties": {
                      "alimento": { "type": "STRING" },
                      "cantidad": { "type": "NUMBER" },
                      "unidad": { "type": "STRING", "enum": ["g", "ml", "unidad", "scoop", "cucharada", "cucharadita", "taza", "vaso"] },
                      "estimado": { "type": "BOOLEAN" },
                      "busqueda_en": { "type": "STRING" }
                    },
                    "required": ["alimento", "cantidad", "unidad", "estimado", "busqueda_en"]
                  }
                }
              },
              "required": ["i", "items"]
            }
          },
          "traducciones": {
            "type": "ARRAY",
            "items": {
              "type": "OBJECT",
              "properties": { "i": { "type": "INTEGER" }, "busqueda_en": { "type": "STRING" } },
              "required": ["i", "busqueda_en"]
            }
          }
        }
      }
      """);

  private static String numbered(List<String> list) {
    List<String> lines = new ArrayList<>();
    for (int i = 0; i < list.size(); i++) lines.add("  [" + i + "] " + Text.jsonString(list.get(i)));
    return String.join("\n", lines);
  }

  /**
   * Interpreta segmentos que las reglas no entendieron y traduce nombres a búsquedas para USDA.
   * Devuelve por índice (no por nombre) para no confundir resultados.
   */
  public ParseOut assistParse(List<String> segments, List<String> names) {
    Map<Integer, List<ParsedItem>> parsed = new LinkedHashMap<>();
    Map<Integer, String> queries = new LinkedHashMap<>();
    if (segments.isEmpty() && names.isEmpty()) return new ParseOut(parsed, queries, false);
    String prompt = "Sos el asistente de una app de nutrición en Argentina. No calcules calorías.\n"
        + (!segments.isEmpty()
            ? "TAREA 1. Para cada texto, separá los alimentos. Por cada uno: \"alimento\" (nombre corto en español, sin cantidad), "
              + "\"cantidad\" (número), \"unidad\" (una de: " + String.join(", ", UNITS) + "), \"estimado\" (true si la cantidad era vaga, ej. \"un plato\", "
              + "y la convertiste a gramos razonables) y \"busqueda_en\" (búsqueda en inglés estilo USDA: alimento principal primero, "
              + "ej. \"chicken breast grilled\").\n"
              + numbered(segments) + "\n"
            : "")
        + (!names.isEmpty()
            ? "TAREA 2. Traducí cada alimento a una búsqueda corta en inglés estilo USDA (alimento principal primero, sin marcas).\n" + numbered(names)
            : "");
    Result r = geminiJson(prompt, PARSE_SCHEMA);
    JsonNode out = r.data();

    if (out != null) {
      for (JsonNode s : out.path("segmentos")) {
        int i = Json.index(s.get("i"), segments.size());
        if (i < 0) continue;
        List<ParsedItem> items = new ArrayList<>();
        for (JsonNode x : s.path("items")) {
          String alimento = Json.str(x.get("alimento"));
          Double cantidad = Json.number(x.get("cantidad"));
          String unidad = Json.str(x.get("unidad"));
          if (alimento == null || Text.trim(alimento).isEmpty() || cantidad == null || !Double.isFinite(cantidad) || cantidad <= 0
              || unidad == null || !UNITS.contains(unidad)) continue;
          JsonNode est = x.get("estimado");
          Boolean unsure = est != null && est.isBoolean() ? est.booleanValue() : null;
          String q = Json.str(x.get("busqueda_en"));
          q = q == null ? null : Text.slice(Text.trim(q), 80);
          items.add(new ParsedItem(segments.get(i), cantidad, unidad, Text.trim(alimento), unsure, Text.truthy(q) ? q : null));
        }
        if (!items.isEmpty()) parsed.put(i, items);
      }
      for (JsonNode t : out.path("traducciones")) {
        int i = Json.index(t.get("i"), names.size());
        String q = Json.str(t.get("busqueda_en"));
        q = q == null ? null : Text.trim(q);
        if (i >= 0 && Text.truthy(q) && q.length() < 80) queries.put(i, q);
      }
    }
    return new ParseOut(parsed, queries, r.called());
  }

  /* ---------- Pedido 2: estimar valores y pesos ---------- */

  public record FillOut(Map<Integer, Macros> estimates, Map<Integer, Double> unitG, boolean called) {}

  private static final JsonNode FILL_SCHEMA = Json.parse("""
      {
        "type": "OBJECT",
        "properties": {
          "estimaciones": {
            "type": "ARRAY",
            "items": {
              "type": "OBJECT",
              "properties": {
                "i": { "type": "INTEGER" },
                "kcal": { "type": "NUMBER" },
                "protein": { "type": "NUMBER" },
                "carbs": { "type": "NUMBER" },
                "fat": { "type": "NUMBER" }
              },
              "required": ["i", "kcal", "protein", "carbs", "fat"]
            }
          },
          "pesos": {
            "type": "ARRAY",
            "items": { "type": "OBJECT", "properties": { "i": { "type": "INTEGER" }, "gramos": { "type": "NUMBER" } }, "required": ["i", "gramos"] }
          }
        }
      }
      """);

  /** Estima valores por 100 g (lo no encontrado) y el peso de 1 unidad (cuando no se sabe). */
  public FillOut assistFill(List<String> estimate, List<String> weights) {
    Map<Integer, Macros> estimates = new LinkedHashMap<>();
    Map<Integer, Double> unitG = new LinkedHashMap<>();
    if (estimate.isEmpty() && weights.isEmpty()) return new FillOut(estimates, unitG, false);
    String prompt = "Sos el asistente de una app de nutrición en Argentina.\n"
        + (!estimate.isEmpty()
            ? "TAREA 1. Estimá la composición por 100 g de cada alimento tal como se come en Argentina (kcal, protein, carbs, fat en gramos).\n"
              + numbered(estimate) + "\n"
            : "")
        + (!weights.isEmpty() ? "TAREA 2. ¿Cuántos gramos pesa 1 unidad típica de cada alimento?\n" + numbered(weights) : "");
    Result r = geminiJson(prompt, FILL_SCHEMA);
    JsonNode out = r.data();
    if (out != null) {
      for (JsonNode e : out.path("estimaciones")) {
        int i = Json.index(e.get("i"), estimate.size());
        Double kcal = Json.number(e.get("kcal"));
        Double protein = Json.number(e.get("protein"));
        Double carbs = Json.number(e.get("carbs"));
        Double fat = Json.number(e.get("fat"));
        boolean valid = true;
        for (Double v : new Double[] {kcal, protein, carbs, fat}) if (v == null || !Double.isFinite(v) || v < 0) valid = false;
        if (i >= 0 && valid && kcal <= 950) estimates.put(i, new Macros(kcal, protein, carbs, fat));
      }
      for (JsonNode w : out.path("pesos")) {
        int i = Json.index(w.get("i"), weights.size());
        Double g = Json.number(w.get("gramos"));
        if (i >= 0 && g != null && Double.isFinite(g) && g > 0 && g <= 2000) unitG.put(i, g);
      }
    }
    return new FillOut(estimates, unitG, r.called());
  }
}
