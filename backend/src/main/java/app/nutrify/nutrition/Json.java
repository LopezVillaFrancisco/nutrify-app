package app.nutrify.nutrition;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/** JSON (Jackson) y lectura tolerante de valores sueltos (números que llegan como texto, campos que faltan). */
public final class Json {
  private Json() {}

  /** Tolera campos de más (datos guardados por versiones anteriores de la app). */
  public static final JsonMapper MAPPER = JsonMapper.builder().disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES).build();

  public static JsonNode parse(String s) {
    return MAPPER.readTree(s);
  }

  public static JsonNode resource(String path) {
    try (InputStream in = Json.class.getResourceAsStream(path)) {
      if (in == null) throw new IllegalStateException("Falta el recurso " + path);
      return MAPPER.readTree(in);
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  public static String write(Object value) {
    return MAPPER.writeValueAsString(value);
  }

  public static JsonNode tree(Object value) {
    return MAPPER.valueToTree(value);
  }

  public static ObjectNode object() {
    return MAPPER.createObjectNode();
  }

  public static ArrayNode array() {
    return MAPPER.createArrayNode();
  }

  /** No está o es null. */
  public static boolean nullish(JsonNode n) {
    return n == null || n.isNull() || n.isMissingNode();
  }

  /** Texto del nodo, o null si no es texto. */
  public static String str(JsonNode n) {
    return n != null && n.isString() ? n.stringValue() : null;
  }

  /** Número del nodo, o null si no es un número. */
  public static Double number(JsonNode n) {
    return n != null && n.isNumber() ? n.doubleValue() : null;
  }

  /** Número tolerante: convierte textos ("12") y null (0); lo que no se puede convertir da NaN. */
  public static double jsNumber(JsonNode n) {
    if (nullish(n)) return n != null && n.isNull() ? 0 : Double.NaN;
    if (n.isNumber()) return n.doubleValue();
    if (n.isBoolean()) return n.booleanValue() ? 1 : 0;
    if (n.isString()) {
      String t = Text.trim(n.stringValue());
      if (t.isEmpty()) return 0;
      try {
        return Double.parseDouble(t);
      } catch (NumberFormatException e) {
        return Double.NaN;
      }
    }
    return Double.NaN;
  }

  /** Índice entero válido (las respuestas de la IA traen "i"), o -1. */
  public static int index(JsonNode n, int size) {
    Double d = number(n);
    if (d == null || d != Math.floor(d) || d < 0 || d >= size) return -1;
    return d.intValue();
  }
}
