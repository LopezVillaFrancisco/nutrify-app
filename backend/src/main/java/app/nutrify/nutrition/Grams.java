package app.nutrify.nutrition;

/**
 * Cantidad en gramos y de dónde sale.
 *
 * @param qty "escrita" | "porcion" | "supuesta" | "ia"
 */
public record Grams(double grams, String note, String qty, String qtyDetail) {}
