/** @type {import('next').NextConfig} */
const nextConfig = {
  typedRoutes: false,
  // Pin the workspace root to this project. A stray lockfile in the user's home
  // directory otherwise makes Next infer the wrong root and emit a warning.
  turbopack: {
    root: import.meta.dirname
  }
};

export default nextConfig;
