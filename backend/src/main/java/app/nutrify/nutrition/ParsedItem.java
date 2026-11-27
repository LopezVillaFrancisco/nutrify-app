package app.nutrify.nutrition;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Un alimento con su cantidad, tal como salió del texto.
 *
 * @param unit   null = no dijo unidad ("2 huevos", "banana")
 * @param unsure true si las reglas no alcanzaron y conviene pedirle ayuda a la IA (null = no se evaluó)
 * @param query  búsqueda en inglés para USDA (la da la IA)
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ParsedItem(String raw, double qty, String unit, String name, Boolean unsure, String query) {

  public ParsedItem(String raw, double qty, String unit, String name, Boolean unsure) {
    this(raw, qty, unit, name, unsure, null);
  }

  public ParsedItem withRaw(String newRaw) {
    return new ParsedItem(newRaw, qty, unit, name, unsure, query);
  }

  boolean isUnsure() {
    return Boolean.TRUE.equals(unsure);
  }
}
