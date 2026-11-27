package app.nutrify.nutrition;

import java.util.List;

/** Un alimento guardado por el usuario (tabla foods). Los valores son por 100 g. */
public record FoodRow(
    String id,
    String name,
    List<String> aliases,
    double kcalPer100g,
    double proteinPer100g,
    double carbsPer100g,
    double fatPer100g,
    Double defaultPortionG,
    String unitLabel) {

  public FoodRow {
    aliases = aliases == null ? List.of() : List.copyOf(aliases);
  }
}
