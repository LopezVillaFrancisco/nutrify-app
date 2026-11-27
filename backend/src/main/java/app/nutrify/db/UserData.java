package app.nutrify.db;

import app.nutrify.nutrition.AiCache;
import app.nutrify.nutrition.FoodRow;
import java.util.List;
import org.springframework.security.oauth2.jwt.Jwt;

/** Lo que el cálculo necesita de la base, siempre del usuario del token. */
public interface UserData {
  /** Tus alimentos guardados (tabla foods). Si falla, lista vacía (como antes). */
  List<FoodRow> foods(Jwt jwt);

  /** settings.ai_mode tal cual está guardado (null si no hay fila o columna). */
  String aiMode(Jwt jwt);

  /** Memoria de la IA (tabla ai_cache). Si la tabla no existe, no se guarda nada y todo sigue andando. */
  AiCache cache(Jwt jwt);
}
