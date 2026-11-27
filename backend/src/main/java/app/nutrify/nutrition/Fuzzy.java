package app.nutrify.nutrition;

import java.util.Map;

/**
 * Tolerancia a errores de tipeo ("pechga", "yogurth", "banan"): distancia de edición acotada.
 * Solo para palabras de 5+ letras, así "pan" no se confunde con "pana".
 */
public final class Fuzzy {
  private Fuzzy() {}

  public static int editDistance(String a, String b, int max) {
    if (Math.abs(a.length() - b.length()) > max) return max + 1;
    // Damerau (OSA): la transposición mira dos filas atrás, por eso se guardan las dos últimas
    int[] prevPrev = null;
    int[] prev = new int[b.length() + 1];
    for (int j = 0; j <= b.length(); j++) prev[j] = j;
    for (int i = 1; i <= a.length(); i++) {
      int[] cur = new int[b.length() + 1];
      cur[0] = i;
      int rowMin = i;
      for (int j = 1; j <= b.length(); j++) {
        int cost = a.charAt(i - 1) == b.charAt(j - 1) ? 0 : 1;
        cur[j] = Math.min(Math.min(prev[j] + 1, cur[j - 1] + 1), prev[j - 1] + cost);
        // transposición ("yougr" → "yogur")
        if (i > 1 && j > 1 && a.charAt(i - 1) == b.charAt(j - 2) && a.charAt(i - 2) == b.charAt(j - 1)) {
          cur[j] = Math.min(cur[j], prevPrev[j - 2] + 1);
        }
        rowMin = Math.min(rowMin, cur[j]);
      }
      if (rowMin > max) return max + 1;
      prevPrev = prev;
      prev = cur;
    }
    return prev[b.length()];
  }

  /** Errores permitidos según el largo: 5-8 letras → 1, 9+ → 2. */
  public static int allowedTypos(String s) {
    return s.length() >= 9 ? 2 : s.length() >= 5 ? 1 : 0;
  }

  /** El candidato más parecido dentro del margen de errores, o null. */
  public static <T> T closest(String name, Iterable<? extends Map.Entry<String, T>> candidates) {
    int max = allowedTypos(name);
    if (max == 0) return null;
    T best = null;
    int bestD = max + 1;
    for (Map.Entry<String, T> e : candidates) {
      if (allowedTypos(e.getKey()) == 0) continue;
      int d = editDistance(name, e.getKey(), max);
      if (d < bestD) {
        bestD = d;
        best = e.getValue();
        if (d == 0) break;
      }
    }
    return bestD <= max ? best : null;
  }
}
