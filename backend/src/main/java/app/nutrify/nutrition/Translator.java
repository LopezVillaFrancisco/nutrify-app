package app.nutrify.nutrition;

import app.nutrify.http.HttpJson;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import tools.jackson.databind.JsonNode;

/**
 * Español → inglés para buscar en USDA, SIN IA:
 *  1. diccionario propio de comida (instantáneo, sin límites): "pechuga de pollo grillada" → "chicken breast grilled"
 *  2. si alguna palabra no está, traductor gratuito MyMemory (sin clave). Solo se le manda el nombre del alimento.
 * El resultado se guarda (clave "q:" de ai_cache), así cada nombre se traduce una sola vez.
 */
public class Translator {
  private static final Map<String, String> PHRASES = new HashMap<>();
  private static final Map<String, String> WORDS = new HashMap<>();
  private static final Set<String> SKIP = new HashSet<>();

  static {
    JsonNode d = Json.resource("/nutrition/translate.json");
    d.get("phrases").properties().forEach(e -> PHRASES.put(e.getKey(), e.getValue().stringValue()));
    d.get("words").properties().forEach(e -> WORDS.put(e.getKey(), e.getValue().stringValue()));
    for (JsonNode s : d.get("skip")) SKIP.add(s.stringValue());
  }

  private static final Pattern NOT_LETTER = Pattern.compile("[^a-zñ ]");
  private static final Pattern NOT_ALNUM = Pattern.compile("[^a-z0-9 ]");
  private static final Pattern SPACES = Text.re("\\s+");
  private static final Pattern A_DE_B = Pattern.compile("^(.+?) (?:de|del) (.+)$");
  private static final Pattern REMOTE_JUNK = Pattern.compile("MYMEMORY|QUERY LENGTH|INVALID", Pattern.CASE_INSENSITIVE);

  private final HttpJson http;
  private final NutritionEnv env;

  public Translator(HttpJson http, NutritionEnv env) {
    this.http = http;
    this.env = env;
  }

  static String norm(String s) {
    String t = NOT_LETTER.matcher(Text.lower(Text.stripAccents(s))).replaceAll(" ");
    return Text.trim(SPACES.matcher(t).replaceAll(" "));
  }

  /** null = palabra desconocida, "" = palabra que no cambia la búsqueda. */
  private static String word(String t) {
    String[] tries = {t, t.replaceFirst("es$", ""), t.replaceFirst("s$", ""), t.replaceFirst("a$", "o"), t.replaceFirst("as$", "o"), t.replaceFirst("os$", "o")};
    for (String x : tries) {
      if (SKIP.contains(x)) return "";
      if (WORDS.containsKey(x)) return WORDS.get(x);
    }
    return null;
  }

  private static List<String> translatePart(String text) {
    List<String> toks = new ArrayList<>();
    for (String t : text.split(" ", -1)) if (!t.isEmpty()) toks.add(t);
    List<String> out = new ArrayList<>();
    int i = 0;
    while (i < toks.size()) {
      boolean done = false;
      for (int k = Math.min(toks.size(), i + 4); k > i + 1; k--) {
        String p = String.join(" ", toks.subList(i, k));
        if (PHRASES.containsKey(p)) {
          out.add(PHRASES.get(p));
          i = k;
          done = true;
          break;
        }
      }
      if (done) continue;
      String w = word(toks.get(i));
      if (w == null) return null; // palabra desconocida: que lo traduzca el traductor
      if (!w.isEmpty()) out.add(w);
      i++;
    }
    return out;
  }

  /** Solo con el diccionario. null si alguna palabra no está. */
  public static String dictTranslate(String name) {
    String n = norm(name);
    if (n.isEmpty()) return null;
    // Frase completa conocida
    if (PHRASES.containsKey(n)) return PHRASES.get(n);
    // "A de B" en español = "B A" en inglés: "pechuga de pollo" → "chicken breast" (USDA pone primero el alimento)
    Matcher m = A_DE_B.matcher(n);
    if (m.find()) {
      List<String> a = translatePart(m.group(1));
      List<String> b = translatePart(m.group(2));
      if (a != null && b != null && (!a.isEmpty() || !b.isEmpty())) {
        List<String> all = new ArrayList<>(b);
        all.addAll(a);
        return String.join(" ", all);
      }
    }
    List<String> all = translatePart(n);
    return all != null && !all.isEmpty() ? String.join(" ", all) : null;
  }

  /** Traductor gratuito (sin clave, sin IA). Solo recibe el nombre del alimento. */
  String remoteTranslate(String name) {
    if (env.translateDisabled()) return null;
    try {
      String url = new Query("https://api.mymemory.translated.net/get").set("langpair", "es|en").set("q", Text.slice(name, 120)).toString();
      HttpJson.Response res = http.get(url, Map.of(), Duration.ofSeconds(5), Duration.ofDays(30));
      if (!res.ok()) return null;
      JsonNode data = Json.parse(res.body());
      String t = Json.str(data.path("responseData").path("translatedText"));
      t = t == null ? null : Text.trim(t);
      JsonNode quota = data.get("quotaFinished");
      boolean quotaFinished = quota != null && quota.asBoolean(false);
      if (t == null || t.isEmpty() || quotaFinished || REMOTE_JUNK.matcher(t).find()) return null;
      String clean = Text.trim(SPACES.matcher(NOT_ALNUM.matcher(Text.lower(t)).replaceAll(" ")).replaceAll(" "));
      // Si devolvió lo mismo (no lo supo traducir), no sirve
      if (clean.isEmpty() || clean.equals(norm(name))) return null;
      return clean;
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      return null;
    } catch (Exception e) {
      return null;
    }
  }

  /** Diccionario y, si no alcanza, traductor gratuito. null = no se pudo (ahí recién puede ayudar la IA). */
  public String translateFood(String name) {
    String d = dictTranslate(name);
    return d != null ? d : remoteTranslate(name);
  }
}
