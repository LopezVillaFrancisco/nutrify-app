package app.nutrify.nutrition;

import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import tools.jackson.databind.JsonNode;

/**
 * Memoria de respuestas de la IA, guardada en la base (tabla ai_cache, solo tuya por RLS).
 * Claves: "p:<texto>" interpretación, "q:<alimento>" búsqueda en inglés, "w:<alimento>" peso de 1 unidad,
 * "e:<alimento>" valores estimados por 100 g. Así un mismo alimento no se le vuelve a preguntar a la IA.
 */
public interface AiCache {
  /** Valores guardados para esas claves (las que no están, no aparecen). */
  Map<String, JsonNode> load(List<String> keys);

  void save(List<Map.Entry<String, JsonNode>> entries);

  Pattern SPACES = Text.re("\\s+");

  /** kind: "p" | "q" | "w" | "e" */
  static String key(String kind, String s) {
    String t = Text.trim(SPACES.matcher(Text.lower(Text.stripAccents(s))).replaceAll(" "));
    return Text.slice(kind + ":" + t, 300);
  }
}
