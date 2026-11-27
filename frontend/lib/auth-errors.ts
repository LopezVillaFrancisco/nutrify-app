import type { AuthError } from "@supabase/supabase-js";

const BY_CODE: Record<string, string> = {
  invalid_credentials: "El email o la contraseña no coinciden.",
  email_not_confirmed: "Todavía no confirmaste tu email. Abrí el link que te mandamos.",
  user_already_exists: "Ya hay una cuenta con ese email. Probá entrar.",
  email_exists: "Ya hay una cuenta con ese email. Probá entrar.",
  weak_password: "La contraseña es muy corta. Usá al menos 6 caracteres.",
  same_password: "Esa ya es tu contraseña actual. Elegí otra.",
  over_email_send_rate_limit: "Mandamos varios mails seguidos. Esperá un minuto y probá de nuevo.",
  over_request_rate_limit: "Demasiados intentos. Esperá un minuto y probá de nuevo.",
  email_address_invalid: "Ese email no parece válido. Revisalo.",
  signup_disabled: "El registro está desactivado en este proyecto.",
  validation_failed: "Revisá el email y la contraseña.",
};

const BY_MESSAGE: Record<string, string> = {
  "Invalid login credentials": BY_CODE.invalid_credentials,
  "Email not confirmed": BY_CODE.email_not_confirmed,
  "User already registered": BY_CODE.user_already_exists,
  "Password should be at least 6 characters.": BY_CODE.weak_password,
  "Password should be at least 6 characters": BY_CODE.weak_password,
  "Email rate limit exceeded": BY_CODE.over_email_send_rate_limit,
  "email rate limit exceeded": BY_CODE.over_email_send_rate_limit,
};

/** Traduce los errores de Supabase Auth a mensajes claros en español. */
export function authMessage(err: AuthError | Error): string {
  const code = (err as AuthError).code;
  if (code && BY_CODE[code]) return BY_CODE[code];
  if (BY_MESSAGE[err.message]) return BY_MESSAGE[err.message];
  if (/fetch|network|Load failed/i.test(err.message)) return "Sin conexión. Revisá internet y probá de nuevo.";
  if (/invalid.*email|email.*invalid/i.test(err.message)) return BY_CODE.email_address_invalid;
  return "Algo salió mal. Probá de nuevo en un momento.";
}

export const isEmailNotConfirmed = (err: AuthError | Error) =>
  (err as AuthError).code === "email_not_confirmed" || err.message === "Email not confirmed";
