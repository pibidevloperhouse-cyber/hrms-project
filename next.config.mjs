import os from "os";

function getLocalDevOrigins() {
  const origins = [
    "localhost:3000",
    "localhost",
    "127.0.0.1",
    "127.0.0.1:3000",
  ];
  try {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const net of interfaces[name] || []) {
        if (net.family === "IPv4" && !net.internal) {
          origins.push(net.address);
          origins.push(`${net.address}:3000`);
          origins.push(`http://${net.address}:3000`);
          origins.push(`http://${net.address}`);
        }
      }
    }
  } catch (e) {
    console.warn("Failed to discover local network IPs for next.config.mjs:", e);
  }
  return Array.from(new Set(origins));
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  allowedDevOrigins: getLocalDevOrigins(),
};

export default nextConfig;
