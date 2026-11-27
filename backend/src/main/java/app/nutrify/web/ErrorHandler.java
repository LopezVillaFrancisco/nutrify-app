package app.nutrify.web;

import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

/** Todos los errores salen como {"error": "mensaje"} (el formato que ya usa la app). */
@RestControllerAdvice
public class ErrorHandler {
  private static final Logger log = LoggerFactory.getLogger(ErrorHandler.class);

  private static ResponseEntity<Map<String, String>> body(int status, String message) {
    return ResponseEntity.status(status).body(Map.of("error", message));
  }

  @ExceptionHandler(ApiError.class)
  ResponseEntity<Map<String, String>> api(ApiError e) {
    return body(e.status(), e.getMessage());
  }

  /** Falla de @Valid: se devuelve el primer mensaje (están escritos para el usuario). */
  @ExceptionHandler(MethodArgumentNotValidException.class)
  ResponseEntity<Map<String, String>> invalid(MethodArgumentNotValidException e) {
    FieldError f = e.getBindingResult().getFieldError();
    String msg = f != null && f.getDefaultMessage() != null ? f.getDefaultMessage()
        : e.getBindingResult().getAllErrors().isEmpty() ? "Datos inválidos." : e.getBindingResult().getAllErrors().get(0).getDefaultMessage();
    return body(400, msg);
  }

  @ExceptionHandler(HandlerMethodValidationException.class)
  ResponseEntity<Map<String, String>> invalidParams(HandlerMethodValidationException e) {
    String msg = e.getAllErrors().isEmpty() ? "Datos inválidos." : e.getAllErrors().get(0).getDefaultMessage();
    return body(400, msg);
  }

  @ExceptionHandler({HttpMessageNotReadableException.class, MissingServletRequestParameterException.class, MethodArgumentTypeMismatchException.class})
  ResponseEntity<Map<String, String>> unreadable(Exception e) {
    return body(400, "Datos inválidos.");
  }

  @ExceptionHandler(DuplicateKeyException.class)
  ResponseEntity<Map<String, String>> duplicate(DuplicateKeyException e) {
    return body(409, "Ya existe.");
  }

  /** Lo frena la base (checks del schema): no debería pasar si la validación de acá está bien. */
  @ExceptionHandler(DataIntegrityViolationException.class)
  ResponseEntity<Map<String, String>> integrity(DataIntegrityViolationException e) {
    log.warn("La base rechazó un dato: {}", e.getMostSpecificCause().getMessage());
    return body(400, "Datos inválidos.");
  }

  @ExceptionHandler(NoResourceFoundException.class)
  ResponseEntity<Map<String, String>> noRoute(NoResourceFoundException e) {
    return body(404, "No existe.");
  }

  @ExceptionHandler(Exception.class)
  ResponseEntity<Map<String, String>> other(Exception e) {
    log.error("Error inesperado", e);
    return body(500, "Algo falló. Probá de nuevo.");
  }
}
