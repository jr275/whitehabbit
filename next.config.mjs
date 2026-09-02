/** @type {import('next').NextConfig} */
const nextConfig = {
  // NOTE: `typescript.ignoreBuildErrors` was removed deliberately.
  //
  // It was set to true, which makes `next build` print "Skipping
  // validation of types" and ship whatever compiles. Measured before
  // removing it: with a clean .next, `tsc --noEmit` reports zero errors
  // across all 240 project files both before and after a build — the
  // flag was hiding nothing and had become an escape hatch nobody
  // needed. Without it, a type error fails the build, which is the
  // point.
  //
  // If this ever needs to come back, the honest move is to fix the
  // errors or to name the exact ones being deferred — not to turn the
  // check off wholesale.
  images: {
    unoptimized: true,
  },
}

export default nextConfig
