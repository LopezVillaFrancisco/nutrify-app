package app.nutrify.nutrition;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Último problema con Google: "minuto"/"dia" = límite de la clave, "clave" = clave inválida, "error" = Google falló.
 * at y until son milisegundos desde 1970 (epoch).
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record AiProblem(String kind, long at, Long until) {}
