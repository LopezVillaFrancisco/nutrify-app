package app.nutrify.config;

import app.nutrify.http.HttpJson;
import app.nutrify.http.JdkHttpJson;
import app.nutrify.nutrition.Analyzer;
import app.nutrify.nutrition.Gemini;
import app.nutrify.nutrition.NutritionEnv;
import app.nutrify.nutrition.Resolver;
import app.nutrify.nutrition.Translator;
import java.time.Clock;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Arma el cálculo de comida con las variables de entorno. */
@Configuration
public class NutritionConfig {

  @Bean
  Clock clock() {
    return Clock.systemUTC();
  }

  @Bean
  HttpJson httpJson() {
    return new JdkHttpJson();
  }

  @Bean
  NutritionEnv nutritionEnv(
      @Value("${FDC_API_KEY:}") String fdcApiKey,
      @Value("${GEMINI_API_KEY:}") String geminiApiKey,
      @Value("${GEMINI_MODEL:}") String geminiModel,
      @Value("${AI_DISABLED:}") String aiDisabled,
      @Value("${TRANSLATE_DISABLED:}") String translateDisabled) {
    return new NutritionEnv(fdcApiKey, geminiApiKey, geminiModel, "1".equals(aiDisabled.trim()), "1".equals(translateDisabled.trim()));
  }

  /** Hilos virtuales: las búsquedas en USDA, Open Food Facts y el traductor van en paralelo (como el Promise.all de antes). */
  @Bean(destroyMethod = "close")
  ExecutorService nutritionExecutor() {
    return Executors.newVirtualThreadPerTaskExecutor();
  }

  /** Una sola instancia: guarda el freno por minuto y el último problema con Google. */
  @Bean
  Gemini gemini(HttpJson http, NutritionEnv env, Clock clock) {
    return new Gemini(http, env, clock);
  }

  @Bean
  Analyzer analyzer(HttpJson http, NutritionEnv env, Gemini gemini, ExecutorService nutritionExecutor) {
    return new Analyzer(new Resolver(http, env), new Translator(http, env), gemini, nutritionExecutor);
  }
}
