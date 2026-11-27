/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Permite builds en otra carpeta (ej. para correr dos servidores a la vez sin pisarse)
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
