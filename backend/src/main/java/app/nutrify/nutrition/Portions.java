package app.nutrify.nutrition;

/**
 * Gramos de cada porción de un alimento.
 *
 * @param plateG gramos de 1 plato promedio de adulto (fideos, arroz, puré…)
 * @param from   de quién son las porciones: "propio" (tu alimento guardado) o "base" (la base común)
 */
public record Portions(Double unitG, Double spoonG, Double scoopG, Double cupG, Double plateG, String unitLabel, String from) {
  public static final Portions NONE = new Portions(null, null, null, null, null, null, null);

  public Portions withUnitG(Double g) {
    return new Portions(g, spoonG, scoopG, cupG, plateG, unitLabel, from);
  }
}
