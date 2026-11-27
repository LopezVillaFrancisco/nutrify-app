package app.nutrify.nutrition;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.function.Predicate;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Parseo por reglas: "300ml leche", "1 scoop whey", "200 g pollo", "pollo 200g", "dos huevos", "banana".
 * Unidades: g | ml | kg | l | scoop | cucharada | cucharadita | taza | vaso | unidad | plato | porcion.
 */
public final class Parser {
  private Parser() {}

  static final Map<String, String> UNIT_MAP = Map.ofEntries(
      Map.entry("g", "g"), Map.entry("gr", "g"), Map.entry("grs", "g"), Map.entry("gramo", "g"), Map.entry("gramos", "g"),
      Map.entry("ml", "ml"), Map.entry("cc", "ml"), Map.entry("mililitro", "ml"), Map.entry("mililitros", "ml"),
      Map.entry("kg", "kg"), Map.entry("kilo", "kg"), Map.entry("kilos", "kg"),
      Map.entry("l", "l"), Map.entry("lt", "l"), Map.entry("lts", "l"), Map.entry("litro", "l"), Map.entry("litros", "l"),
      Map.entry("scoop", "scoop"), Map.entry("scoops", "scoop"), Map.entry("medida", "scoop"), Map.entry("medidas", "scoop"),
      Map.entry("medidor", "scoop"), Map.entry("medidores", "scoop"),
      Map.entry("cucharada", "cucharada"), Map.entry("cucharadas", "cucharada"), Map.entry("cda", "cucharada"), Map.entry("cdas", "cucharada"),
      Map.entry("cucharadita", "cucharadita"), Map.entry("cucharaditas", "cucharadita"), Map.entry("cdta", "cucharadita"),
      Map.entry("cdita", "cucharadita"), Map.entry("cditas", "cucharadita"),
      Map.entry("taza", "taza"), Map.entry("tazas", "taza"),
      Map.entry("vaso", "vaso"), Map.entry("vasos", "vaso"),
      Map.entry("unidad", "unidad"), Map.entry("unidades", "unidad"), Map.entry("u", "unidad"), Map.entry("feta", "unidad"),
      Map.entry("fetas", "unidad"), Map.entry("rebanada", "unidad"), Map.entry("rebanadas", "unidad"),
      Map.entry("porcion", "porcion"), Map.entry("porción", "porcion"), Map.entry("porciones", "porcion"),
      Map.entry("rodaja", "unidad"), Map.entry("rodajas", "unidad"),
      Map.entry("plato", "plato"), Map.entry("platos", "plato"));

  static final Map<String, Double> WORD_QTY = Map.ofEntries(
      Map.entry("un", 1.0), Map.entry("una", 1.0), Map.entry("uno", 1.0), Map.entry("medio", 0.5), Map.entry("media", 0.5),
      Map.entry("dos", 2.0), Map.entry("tres", 3.0), Map.entry("cuatro", 4.0), Map.entry("cinco", 5.0), Map.entry("seis", 6.0),
      Map.entry("siete", 7.0), Map.entry("ocho", 8.0), Map.entry("nueve", 9.0), Map.entry("diez", 10.0), Map.entry("doce", 12.0),
      Map.entry("un par de", 2.0));

  // Palabras que indican una porción vaga: mejor que la interprete la IA
  private static final Pattern VAGUE = Text.rei("^(puñado|puñados|bowl|bol|tupper|pedazo|pedazos|trozo|trozos|poco|poquito|bocha|bochas)\\b");
  private static final Pattern DIGIT = Pattern.compile("\\d");

  private static final Pattern SPLIT = Text.rei("\\n|\\+|;|,(?!\\d)|(?<!\\d),|\\s+con\\s+(?=\\d)");
  private static final Pattern SPLIT_Y = Text.rei("\\s+y\\s+");
  private static final Pattern BULLET = Text.re("^[-•*·]\\s*");
  private static final Pattern SPACES = Text.re("\\s+");

  private static final String NUM = "(\\d+\\/\\d+|\\d+(?:[.,]\\d+)?)";
  private static final Pattern LEAD = Text.re("^" + NUM + "\\s*(.*)$");
  private static final Pattern WORD = Text.re("^(un par de|una|uno|un|media|medio|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|doce)\\s+(.*)$");
  private static final Pattern TAIL = Text.rei("^(.+?)\\s*(?:x\\s*)?" + NUM + "\\s*([a-zA-Z]+\\.?)?$");
  private static final Pattern LONE = Text.rei("^(platos?|porci[oó]n(?:es)?)\\s+(.+)$");
  private static final Pattern DE_PREFIX = Text.rei("^(de|del)\\s+");
  private static final Pattern TRAILING_DOT = Pattern.compile("\\.$");

  /**
   * Separa el texto libre en segmentos: saltos de línea, +, ;, comas (no decimales) y " y ".
   * known: si "A y B" es un alimento conocido ("tarta de jamón y queso"), no se corta en el "y".
   */
  public static List<String> splitSegments(String text, Predicate<String> known) {
    List<String> out = new ArrayList<>();
    for (String piece : SPLIT.split(text, -1)) {
      String[] parts = SPLIT_Y.split(piece, -1);
      int i = 0;
      while (i < parts.length) {
        int take = 1;
        if (known != null) {
          for (int k = parts.length; k > i + 1; k--) {
            if (known.test(parseSegment(Text.trim(String.join(" y ", Arrays.copyOfRange(parts, i, k)))).name())) {
              take = k - i;
              break;
            }
          }
        }
        out.add(String.join(" y ", Arrays.copyOfRange(parts, i, i + take)));
        i += take;
      }
    }
    List<String> clean = new ArrayList<>();
    for (String s : out) {
      String c = BULLET.matcher(Text.trim(s)).replaceFirst("");
      if (!c.isEmpty()) clean.add(c);
    }
    return clean;
  }

  public static List<String> splitSegments(String text) {
    return splitSegments(text, null);
  }

  private static double parseNum(String s) {
    if (s.contains("/")) {
      String[] ab = s.split("/", -1);
      double a = Double.parseDouble(ab[0]);
      double b = Double.parseDouble(ab[1]);
      return b != 0 ? a / b : a;
    }
    return Double.parseDouble(s.replaceFirst(",", "."));
  }

  private static String cleanName(String s) {
    String t = DE_PREFIX.matcher(Text.trim(s)).replaceFirst("");
    return Text.trim(SPACES.matcher(t).replaceAll(" "));
  }

  private static boolean unsureText(String s) {
    return VAGUE.matcher(s).find() || DIGIT.matcher(s).find();
  }

  /** Parseo por reglas de un segmento. */
  public static ParsedItem parseSegment(String segment) {
    String raw = Text.trim(segment);
    String rest = raw;
    Double qty = null;

    // 1) Cantidad al inicio: número, "1/2" o palabra ("dos", "media")
    Matcher lead = LEAD.matcher(rest);
    if (lead.find()) {
      qty = parseNum(lead.group(1));
      rest = lead.group(2);
    } else {
      Matcher word = WORD.matcher(Text.lower(rest));
      if (word.find()) {
        qty = WORD_QTY.get(word.group(1));
        rest = Text.trim(rest.substring(word.group(1).length()));
      }
    }

    if (qty != null) {
      String[] words = SPACES.split(rest, -1);
      String first = words.length > 0 ? TRAILING_DOT.matcher(Text.lower(words[0])).replaceFirst("") : "";
      String unit = UNIT_MAP.get(first);
      String name = cleanName(unit != null ? String.join(" ", Arrays.copyOfRange(words, 1, words.length)) : rest);
      if (name.isEmpty()) return new ParsedItem(raw, qty, unit, raw, true);
      return new ParsedItem(raw, qty, unit, name, unsureText(name));
    }

    // 2) Cantidad al final: "pollo 200g", "leche 300 ml", "huevos x2"
    Matcher tail = TAIL.matcher(rest);
    if (tail.find()) {
      String unitWord = tail.group(3) == null ? null : TRAILING_DOT.matcher(Text.lower(tail.group(3))).replaceFirst("");
      String unit = unitWord != null ? UNIT_MAP.get(unitWord) : null;
      if (unitWord == null || unit != null) {
        return new ParsedItem(raw, parseNum(tail.group(2)), unit, cleanName(tail.group(1)), null);
      }
    }

    // 3) Sin cantidad: "banana", "un poco de arroz" → 1 unidad (o vago)
    Matcher lone = LONE.matcher(rest);
    if (lone.find()) return new ParsedItem(raw, 1, UNIT_MAP.get(Text.lower(lone.group(1))), cleanName(lone.group(2)), null);
    return new ParsedItem(raw, 1, null, cleanName(rest), unsureText(rest));
  }

  private static final Map<String, String> UNIT_NAME = Map.ofEntries(
      Map.entry("g", "g"), Map.entry("ml", "ml"), Map.entry("kg", "kg"), Map.entry("l", "l"), Map.entry("scoop", "scoop"),
      Map.entry("cucharada", "cucharada"), Map.entry("cucharadita", "cucharadita"), Map.entry("taza", "taza"),
      Map.entry("vaso", "vaso"), Map.entry("unidad", "unidad"), Map.entry("plato", "plato"), Map.entry("porcion", "porción"));

  private static String g0(double n) {
    return Text.dec(n);
  }

  /** Convierte la cantidad a gramos usando las porciones del alimento cuando hace falta. */
  public static Grams toGrams(ParsedItem item, Portions p) {
    double qty = item.qty();
    String unit = item.unit();
    boolean propio = "propio".equals(p.from());
    String whose = propio ? "de tu alimento" : "típico";

    record Helper(double qty, boolean propio) {
      Grams portion(double g, String u) {
        return new Grams(qty * g, null, "porcion",
            "1 " + u + " = " + g0(g) + " g (" + (propio ? "porción de tu alimento" : "porción típica") + ")");
      }

      Grams assumed(double g, String u, String unitTxt) {
        return new Grams(qty * g, "Tomé 1 " + u + " = " + g0(g) + " " + unitTxt + ". Corregilo si no es así.", "supuesta",
            "Supuesto de la app: 1 " + u + " = " + g0(g) + " " + unitTxt);
      }

      Grams withDetail(Grams g, String detail) {
        return new Grams(g.grams(), g.note(), g.qty(), detail);
      }
    }
    Helper h = new Helper(qty, propio);

    switch (unit == null ? "" : unit) {
      case "g", "ml" -> {
        return new Grams(qty, null, "escrita", "Lo que escribiste");
      }
      case "kg", "l" -> {
        return new Grams(qty * 1000, null, "escrita",
            "Lo que escribiste (" + g0(qty) + " " + UNIT_NAME.get(unit) + " = " + g0(qty * 1000) + " " + (unit.equals("kg") ? "g" : "ml") + ")");
      }
      case "scoop" -> {
        Double g = p.scoopG() != null ? p.scoopG() : p.unitG();
        return Text.truthy(g) ? h.portion(g, "scoop") : h.assumed(30, "scoop", "g");
      }
      case "cucharada" -> {
        return Text.truthy(p.spoonG()) ? h.portion(p.spoonG(), "cucharada") : h.assumed(15, "cucharada", "g");
      }
      case "cucharadita" -> {
        return Text.truthy(p.spoonG()) ? h.portion(p.spoonG() / 3, "cucharadita") : h.assumed(5, "cucharadita", "g");
      }
      case "taza" -> {
        return Text.truthy(p.cupG()) ? h.portion(p.cupG(), "taza") : h.assumed(240, "taza", "ml");
      }
      case "vaso" -> {
        return h.assumed(250, "vaso", "ml");
      }
      case "plato", "porcion" -> {
        String word = unit.equals("plato") ? "plato" : "porción";
        // Tu alimento: su porción guardada ("1 plato de fideos con manteca" = 260 g)
        if (propio && Text.truthy(p.unitG())) return h.portion(p.unitG(), word);
        if (Text.truthy(p.plateG())) {
          return h.withDetail(h.portion(p.plateG(), word), "1 " + word + " ≈ " + g0(p.plateG()) + " g (plato promedio de adulto)");
        }
        if (unit.equals("porcion") && Text.truthy(p.unitG())) return h.portion(p.unitG(), word);
        return h.assumed(unit.equals("plato") ? 300 : 150, word, "g");
      }
      default -> {
        if (Text.truthy(p.unitG())) {
          String u = propio && Text.truthy(p.unitLabel()) ? p.unitLabel() : "unidad";
          return h.withDetail(h.portion(p.unitG(), u), "1 " + u + " ≈ " + g0(p.unitG()) + " g (peso " + whose + ")");
        }
        // "fideos" sin cantidad = 1 plato
        if (Text.truthy(p.plateG())) {
          return h.withDetail(h.portion(p.plateG(), "plato"), "1 plato ≈ " + g0(p.plateG()) + " g (plato promedio de adulto)");
        }
        return new Grams(qty * 100, "No sé cuánto pesa 1 unidad: usé 100 g. Corregilo si hace falta.", "supuesta",
            "Supuesto de la app: 1 unidad = 100 g");
      }
    }
  }
}
