package app.nutrify.nutrition;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;

/**
 * Estado de la IA ANTES de usarla (no gasta cuota).
 *
 * @param connection "ok" | "clave" | "modelo" | "sin_conexion" | "sin_clave" | "apagada"
 * @param reason     por qué no se puede (si canUse es false)
 */
public record AiHealth(String mode, int usedToday, int cap, String connection, String model, Gemini.MinuteSlots minute,
                       AiProblem problem, boolean canUse, String reason, long checkedAt) {

  private static final DateTimeFormatter HHMM = DateTimeFormatter.ofPattern("H:mm").withZone(ZoneId.of("America/Argentina/Buenos_Aires"));

  /** Arma el estado completo. checkConnection: consulta a Google los datos del modelo (no genera nada, no gasta cuota). */
  public static AiHealth compute(Gemini gemini, Clock clock, String mode, int usedToday, boolean checkConnection, boolean force) {
    String connection = !gemini.enabled() ? "sin_clave"
        : gemini.killSwitch() ? "apagada"
        : checkConnection ? gemini.checkConnection(force)
        : "ok";
    Gemini.MinuteSlots minute = gemini.minuteSlots();
    AiProblem problem = gemini.problem();
    long now = clock.millis();

    String reason = null;
    if (connection.equals("sin_clave")) reason = "Falta la clave de Gemini en el servidor (GEMINI_API_KEY).";
    else if (connection.equals("apagada")) reason = "La IA está apagada en el servidor (AI_DISABLED=1).";
    else if (mode.equals("off")) reason = "Elegiste no usar la IA. Podés cambiarlo en Perfil.";
    else if (usedToday >= AiStatus.AI_DAILY_CAP) reason = "Ya usaste los " + AiStatus.AI_DAILY_CAP + " pedidos de hoy. Mañana se renueva.";
    else if (problem != null && problem.kind().equals("dia"))
      reason = "Google cortó la cuota diaria de la clave. Vuelve a las " + HHMM.format(Instant.ofEpochMilli(problem.until() != null ? problem.until() : now)) + ".";
    else if (problem != null && problem.kind().equals("minuto")) reason = "Google pidió esperar un poco. Probá en " + secsLeft(problem.until(), now) + " s.";
    else if (connection.equals("clave") || (problem != null && problem.kind().equals("clave"))) reason = "Google no acepta la clave de Gemini. Revisala en el servidor.";
    else if (connection.equals("modelo")) reason = "El modelo " + gemini.model() + " no está disponible para esta clave.";
    else if (connection.equals("sin_conexion")) reason = "No se pudo conectar con Google. Revisá internet y probá de nuevo.";
    else if (minute.free() <= 0) reason = "Se hicieron muchos pedidos seguidos. Probá en " + minute.waitSec() + " s.";

    return new AiHealth(mode, usedToday, AiStatus.AI_DAILY_CAP, connection, gemini.model(), minute, problem, reason == null, reason, now);
  }

  private static long secsLeft(Long until, long now) {
    return Math.max(1, (long) Math.ceil(((until != null ? until : now) - now) / 1000.0));
  }
}
