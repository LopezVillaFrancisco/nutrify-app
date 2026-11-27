package app.nutrify.nutrition;

/**
 * Configuración del cálculo, leída de las variables de entorno.
 *
 * @param fdcApiKey         USDA FoodData Central; vacío = DEMO_KEY
 * @param geminiApiKey      Google AI Studio; vacío = sin IA
 * @param geminiModel       vacío = gemini-flash-lite-latest
 * @param aiDisabled        AI_DISABLED=1: apaga la IA para todos
 * @param translateDisabled TRANSLATE_DISABLED=1: no usa el traductor gratuito
 */
public record NutritionEnv(String fdcApiKey, String geminiApiKey, String geminiModel, boolean aiDisabled, boolean translateDisabled) {
  public NutritionEnv {
    fdcApiKey = blankToNull(fdcApiKey);
    geminiApiKey = blankToNull(geminiApiKey);
    geminiModel = blankToNull(geminiModel);
  }

  private static String blankToNull(String s) {
    return s == null || s.isBlank() ? null : s.trim();
  }
}
