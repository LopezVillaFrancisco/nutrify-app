import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Destino de los links que manda Supabase por mail (confirmar cuenta, recuperar contraseña).
 * Canjea el código por una sesión y redirige adentro de la app.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const nextParam = url.searchParams.get("next") ?? "/";
  // Solo rutas internas: evita redirecciones abiertas
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";

  const supabase = await createClient();
  let ok = false;
  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  }

  const dest = url.clone();
  dest.search = "";
  if (ok) {
    dest.pathname = next;
  } else {
    dest.pathname = "/login";
    dest.searchParams.set("error", "link");
  }
  return NextResponse.redirect(dest);
}
