/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // ESLint se ejecuta en CI/pre-commit; no bloquear el build de producción
    ignoreDuringBuilds: true,
  },
  typescript: {
    // TypeScript se chequea localmente; no bloquear el build de producción
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
