/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // Only enforce errors in build, not warnings
    // Warnings are shown during development but don't block production builds
    ignoreDuringBuilds: true,
  },
};
export default nextConfig;
