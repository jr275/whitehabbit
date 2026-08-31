/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // Was `ignoreBuildErrors: true`, which let type errors ship. The
    // repository typechecks clean, so the suppression is no longer
    // load-bearing and the build now fails on a type error.
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
