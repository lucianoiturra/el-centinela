import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Fija la raíz del workspace (hay un package-lock.json suelto en el home que confunde a Next)
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
