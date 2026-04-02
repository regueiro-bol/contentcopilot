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
  experimental: {
    // sharp necesita ser tratado como paquete externo en Vercel
    // para que use los binarios nativos del runtime en lugar de bundlearse
    serverComponentsExternalPackages: ['sharp'],
    // Permite subidas de hasta 50 MB en Server Actions y Route Handlers
    serverActions: {
      bodySizeLimit: '52mb',
    },
  },
};

export default nextConfig;
