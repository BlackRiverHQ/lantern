/** Static export: the site is served by Convex static hosting, which matches exact file paths.
 *  trailingSlash true makes every route emit <route>/index.html, which is the shape the host needs. */
const nextConfig = {
  output: "export",
  trailingSlash: true,
  reactStrictMode: true,
  images: { unoptimized: true },
};
export default nextConfig;
