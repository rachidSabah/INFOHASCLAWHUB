import os from "os";

export function getLocalIPAddress(): string | null {
  const interfaces = os.networkInterfaces();
  for (const iface of Object.values(interfaces)) {
    if (!iface) continue;
    for (const addr of iface) {
      if (addr.family === "IPv4" && !addr.internal) {
        return addr.address;
      }
    }
  }
  return null;
}

export function getNetworkInfo(): {
  hostname: string;
  localIP: string | null;
  port: number;
  lanURL: string | null;
  interfaces: Array<{ name: string; ip: string; mac: string }>;
} {
  const hostname = os.hostname();
  const localIP = getLocalIPAddress();
  const port = parseInt(process.env.PORT || "3000", 10);
  const lanURL = localIP ? `http://${localIP}:${port}` : null;

  const interfaces: Array<{ name: string; ip: string; mac: string }> = [];
  const all = os.networkInterfaces();
  for (const [name, addrs] of Object.entries(all)) {
    if (!addrs || name.toLowerCase().includes("loopback")) continue;
    for (const addr of addrs) {
      if (addr.family === "IPv4" && !addr.internal) {
        interfaces.push({ name, ip: addr.address, mac: addr.mac });
      }
    }
  }

  return { hostname, localIP, port, lanURL, interfaces };
}
