package app.nutrify.web;

/** Error con el mensaje que ve el usuario (la app lo muestra tal cual). */
public class ApiError extends RuntimeException {
  private final int status;

  public ApiError(int status, String message) {
    super(message);
    this.status = status;
  }

  public int status() {
    return status;
  }

  public static ApiError badRequest(String message) {
    return new ApiError(400, message);
  }

  /** Una fila que no existe o es de otro usuario (RLS no la deja ver): para afuera es lo mismo. */
  public static ApiError notFound() {
    return new ApiError(404, "No existe (o ya se borró).");
  }
}
