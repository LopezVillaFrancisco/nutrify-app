package app.nutrify.nutrition;

import java.util.List;

/**
 * Uso de IA en un cálculo (va junto a las líneas en /api/analyze).
 *
 * @param mode         "auto" | "ask" | "off"
 * @param used         pedidos hechos en este cálculo
 * @param pending      datos que la IA podría completar y quedaron pendientes
 * @param blocked      "tope" | "apagada" | null
 * @param pendingNames qué quedó pendiente (para mostrar antes de pedir permiso)
 * @param callsNeeded  cuántos pedidos haría completar lo pendiente (1 o 2)
 * @param failed       si en este cálculo Google rechazó el pedido: "minuto" | "dia" | "clave" | "error" | null
 */
public record AiStatus(String mode, int used, int usedToday, int cap, int pending, String blocked, List<String> pendingNames,
                       int callsNeeded, String failed) {

  /** Tope de pedidos a la IA por usuario y por día (el plan gratis de Gemini da 500 por día en total). */
  public static final int AI_DAILY_CAP = 40;

  /** Modo de IA guardado en Perfil: "auto" la usa sola, "ask" solo cuando tocás "Completar con IA", "off" nunca. */
  public static String readMode(String v) {
    return "auto".equals(v) || "off".equals(v) ? v : "ask";
  }
}
