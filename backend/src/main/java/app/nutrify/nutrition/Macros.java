package app.nutrify.nutrition;

/** kcal, proteína, carbohidratos y grasas (por 100 g o totales). */
public record Macros(double kcal, double protein, double carbs, double fat) {
  public static final Macros ZERO = new Macros(0, 0, 0, 0);
}
