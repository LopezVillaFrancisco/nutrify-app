package app.nutrify.web;

import app.nutrify.nutrition.AiCache;
import app.nutrify.nutrition.AiProblem;
import app.nutrify.nutrition.Gemini;
import app.nutrify.nutrition.Json;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.AbstractMap;
import java.util.List;
import java.util.Objects;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;

/** Contador diario de pedidos y último problema con Google, guardados en ai_cache (sobreviven a reinicios y a varias instancias). */
@Component
public class AiState {
  /** Clave (en ai_cache) donde queda el último problema con Google. */
  public static final String PROBLEM_KEY = "gemini:estado";
  private static final ZoneId AR = ZoneId.of("America/Argentina/Buenos_Aires");

  private final Gemini gemini;
  private final Clock clock;

  public AiState(Gemini gemini, Clock clock) {
    this.gemini = gemini;
    this.clock = clock;
  }

  /** "usage:2026-11-26" (día de Argentina). */
  public String usageKey() {
    return "usage:" + LocalDate.now(clock.withZone(AR));
  }

  /** El número guardado, o 0. */
  public static int used(JsonNode v) {
    double n = Json.jsNumber(v);
    return Double.isFinite(n) ? (int) n : 0;
  }

  /** Si el problema cambió (apareció uno nuevo o se resolvió), lo guarda. */
  public void persistProblem(AiCache cache, JsonNode stored) {
    AiProblem now = gemini.problem();
    AiProblem before = read(stored);
    boolean expired = before != null && before.until() != null && clock.millis() >= before.until();
    if (!Objects.equals(now, expired ? null : before)) {
      cache.save(List.of(new AbstractMap.SimpleEntry<>(PROBLEM_KEY, now == null ? Json.MAPPER.nullNode() : Json.tree(now))));
    }
  }

  private static AiProblem read(JsonNode v) {
    if (Json.nullish(v) || !v.isObject()) return null;
    Double at = Json.number(v.get("at"));
    String kind = Json.str(v.get("kind"));
    if (at == null || kind == null) return null;
    Double until = Json.number(v.get("until"));
    return new AiProblem(kind, at.longValue(), until == null ? null : until.longValue());
  }
}
