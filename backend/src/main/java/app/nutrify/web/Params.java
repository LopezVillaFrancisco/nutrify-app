package app.nutrify.web;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

/** Lectura de parámetros de la URL con mensajes claros. */
public final class Params {
  private Params() {}

  public static LocalDate date(String s) {
    try {
      return LocalDate.parse(s);
    } catch (DateTimeParseException | NullPointerException e) {
      throw ApiError.badRequest("Fecha inválida (tiene que ser AAAA-MM-DD).");
    }
  }

  /** Rango de fechas inclusivo, de hasta maxDays días. */
  public record Range(LocalDate from, LocalDate to) {}

  public static Range range(String from, String to, int maxDays) {
    LocalDate f = date(from);
    LocalDate t = date(to);
    if (t.isBefore(f)) throw ApiError.badRequest("El rango de fechas está al revés.");
    if (ChronoUnit.DAYS.between(f, t) > maxDays) throw ApiError.badRequest("El rango de fechas es demasiado largo (máximo " + maxDays + " días).");
    return new Range(f, t);
  }

  /** Un id que no es un UUID no puede existir: 404, igual que uno de otro usuario. */
  public static UUID id(String s) {
    try {
      return UUID.fromString(s);
    } catch (IllegalArgumentException | NullPointerException e) {
      throw ApiError.notFound();
    }
  }
}
