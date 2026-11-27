package app.nutrify.config;

import com.nimbusds.jwt.JWTParser;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimValidator;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * Seguridad: cada pedido a /api/** trae el token de Supabase (Authorization: Bearer ...).
 * Se valida acá mismo: firma (claves públicas del proyecto, ES256/RS256; o el secreto HS256 de los proyectos viejos),
 * vencimiento, emisor y audiencia. No hay sesión ni cookies en el backend.
 */
@Configuration
public class SecurityConfig {
  static final String SESSION_EXPIRED = "{\"error\":\"Tu sesión venció. Volvé a entrar.\"}";

  @Bean
  SecurityFilterChain security(HttpSecurity http) throws Exception {
    AuthenticationEntryPoint unauthorized = (req, res, ex) -> {
      res.setStatus(401);
      res.setContentType(MediaType.APPLICATION_JSON_VALUE);
      res.setCharacterEncoding("UTF-8");
      res.getWriter().write(SESSION_EXPIRED);
    };
    http
        .csrf(AbstractHttpConfigurer::disable)
        .cors(c -> {})
        .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
        .authorizeHttpRequests(a -> a
            .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
            .requestMatchers("/health", "/error").permitAll()
            .anyRequest().authenticated())
        .exceptionHandling(e -> e.authenticationEntryPoint(unauthorized))
        .oauth2ResourceServer(o -> o.jwt(j -> {}).authenticationEntryPoint(unauthorized));
    return http.build();
  }

  @Bean
  JwtDecoder jwtDecoder(@Value("${SUPABASE_URL}") String supabaseUrl, @Value("${SUPABASE_JWT_SECRET:}") String secret) {
    String issuer = supabaseUrl.trim().replaceAll("/+$", "") + "/auth/v1";
    OAuth2TokenValidator<Jwt> validator = new DelegatingOAuth2TokenValidator<>(
        JwtValidators.createDefaultWithIssuer(issuer),
        new JwtClaimValidator<List<String>>("aud", aud -> aud != null && aud.contains("authenticated")),
        new JwtClaimValidator<String>("sub", sub -> sub != null && !sub.isBlank()));

    NimbusJwtDecoder jwks = NimbusJwtDecoder.withJwkSetUri(issuer + "/.well-known/jwks.json")
        .jwsAlgorithms(algs -> {
          algs.add(SignatureAlgorithm.ES256);
          algs.add(SignatureAlgorithm.RS256);
        })
        .build();
    jwks.setJwtValidator(validator);

    NimbusJwtDecoder hs;
    if (secret.isBlank()) {
      hs = null;
    } else {
      hs = NimbusJwtDecoder.withSecretKey(new SecretKeySpec(secret.trim().getBytes(StandardCharsets.UTF_8), "HmacSHA256"))
          .macAlgorithm(MacAlgorithm.HS256).build();
      hs.setJwtValidator(validator);
    }

    return token -> {
      String alg;
      try {
        alg = JWTParser.parse(token).getHeader().getAlgorithm().getName();
      } catch (Exception e) {
        throw new BadJwtException("Token inválido", e);
      }
      if (alg.startsWith("HS")) {
        if (hs == null) throw new BadJwtException("Token HS256 y falta SUPABASE_JWT_SECRET");
        return hs.decode(token);
      }
      return jwks.decode(token);
    };
  }

  @Bean
  CorsConfigurationSource corsConfigurationSource(@Value("${CORS_ORIGINS:http://localhost:3000,http://localhost:3001,http://localhost:3100}") String origins) {
    CorsConfiguration c = new CorsConfiguration();
    c.setAllowedOrigins(Arrays.stream(origins.split(",")).map(String::trim).filter(s -> !s.isEmpty()).toList());
    c.setAllowedMethods(List.of("GET", "POST", "OPTIONS"));
    c.setAllowedHeaders(List.of("authorization", "content-type"));
    c.setMaxAge(3600L);
    UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
    source.registerCorsConfiguration("/**", c);
    return source;
  }
}
