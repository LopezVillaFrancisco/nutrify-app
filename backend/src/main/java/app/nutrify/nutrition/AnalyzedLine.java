package app.nutrify.nutrition;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

/** Línea resuelta que devuelve /api/analyze (mismo formato que AnalyzedLine en frontend/lib/types.ts). */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record AnalyzedLine(
    String raw,
    @JsonProperty("food_name") String foodName,
    double grams,
    long kcal,
    double protein,
    double carbs,
    double fat,
    String source,
    Macros per100g,
    String match,
    String note,
    boolean found,
    Origin origin) {

  /**
   * De dónde sale cada cosa.
   *
   * @param values "propio" | "usda" | "off" | "ia" | "ninguno"
   * @param qty    "escrita" | "porcion" | "supuesta" | "ia"
   */
  @JsonInclude(JsonInclude.Include.NON_NULL)
  public record Origin(String values, String valuesDetail, String qty, String qtyDetail, boolean parsedByAi) {}
}
