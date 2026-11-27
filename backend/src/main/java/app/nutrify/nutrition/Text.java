package app.nutrify.nutrition;

import java.math.BigDecimal;
import java.text.Normalizer;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Utilidades de texto y números del cálculo: espacios Unicode, trim, redondeo
 * y cómo se escriben los números en las etiquetas ("2,5 g").
 */
public final class Text {
  private Text() {}

  /** Espacio en blanco: además de los ASCII incluye los de Unicode (espacio duro, etc.), comunes al pegar texto del celular. */
  static final String WS = "[\\t\\n\\x0B\\f\\r \\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF]";

  private static final Pattern ACCENTS = Pattern.compile("[\\u0300-\\u036f]");

  /** Compila una expresión donde "\s" también acepta los espacios Unicode. */
  static Pattern re(String regex) {
    return Pattern.compile(regex.replace("\\s", WS));
  }

  /** Igual que re(), sin distinguir mayúsculas (también en letras con tilde). */
  static Pattern rei(String regex) {
    return Pattern.compile(regex.replace("\\s", WS), Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);
  }

  static boolean isSpace(char c) {
    return switch (c) {
      case '\t', '\n', '\u000B', '\f', '\r', ' ', ' ', ' ', ' ', ' ', ' ', ' ', '　', '﻿' -> true;
      default -> c >= ' ' && c <= ' ';
    };
  }

  /** trim que también saca los espacios Unicode (String.strip no saca el espacio duro). */
  public static String trim(String s) {
    int a = 0;
    int b = s.length();
    while (a < b && isSpace(s.charAt(a))) a++;
    while (b > a && isSpace(s.charAt(b - 1))) b--;
    return s.substring(a, b);
  }

  public static String lower(String s) {
    return s.toLowerCase(Locale.ROOT);
  }

  /** Saca las tildes: "jamón" → "jamon". */
  public static String stripAccents(String s) {
    return ACCENTS.matcher(Normalizer.normalize(s, Normalizer.Form.NFD)).replaceAll("");
  }

  /** Primera letra en mayúscula. */
  public static String capitalize(String s) {
    if (s.isEmpty()) return s;
    return s.substring(0, 1).toUpperCase(Locale.ROOT) + s.substring(1);
  }

  /** Redondeo al entero (las mitades van hacia arriba). */
  public static long round(double n) {
    return Math.round(n);
  }

  /** Redondeo a un decimal. */
  public static double round1(double n) {
    return Math.round(n * 10) / 10.0;
  }

  /** Número sin ceros de más: 30 → "30", 2.5 → "2.5". */
  public static String num(double n) {
    if (Double.isNaN(n)) return "NaN";
    if (Double.isInfinite(n)) return n > 0 ? "Infinity" : "-Infinity";
    if (n == 0) return "0";
    if (n == Math.rint(n) && Math.abs(n) < 1e21) return Long.toString((long) n);
    return new BigDecimal(Double.toString(n)).stripTrailingZeros().toPlainString();
  }

  /** Número con un decimal y coma: 2.54 → "2,5". */
  public static String dec(double n) {
    return num(round1(n)).replaceFirst("\\.", ",");
  }

  /** Texto entre comillas, escapado como JSON (para armar los prompts). */
  public static String jsonString(String s) {
    StringBuilder sb = new StringBuilder(s.length() + 2).append('"');
    for (int i = 0; i < s.length(); i++) {
      char c = s.charAt(i);
      switch (c) {
        case '"' -> sb.append("\\\"");
        case '\\' -> sb.append("\\\\");
        case '\b' -> sb.append("\\b");
        case '\f' -> sb.append("\\f");
        case '\n' -> sb.append("\\n");
        case '\r' -> sb.append("\\r");
        case '\t' -> sb.append("\\t");
        default -> {
          boolean loneSurrogate = Character.isSurrogate(c)
              && !(Character.isHighSurrogate(c) && i + 1 < s.length() && Character.isLowSurrogate(s.charAt(i + 1)))
              && !(Character.isLowSurrogate(c) && i > 0 && Character.isHighSurrogate(s.charAt(i - 1)));
          if (c < 0x20 || loneSurrogate) sb.append(String.format("\\u%04x", (int) c));
          else sb.append(c);
        }
      }
    }
    return sb.append('"').toString();
  }

  /** Los primeros n caracteres. */
  public static String slice(String s, int n) {
    return s.length() <= n ? s : s.substring(0, n);
  }

  /** Número opcional con valor: null, 0 y NaN cuentan como "no hay". */
  static boolean truthy(Double d) {
    return d != null && d != 0 && !d.isNaN();
  }

  /** Texto con contenido. */
  static boolean truthy(String s) {
    return s != null && !s.isEmpty();
  }
}
