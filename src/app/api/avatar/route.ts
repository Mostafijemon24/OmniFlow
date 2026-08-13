import { NextRequest } from "next/server";

const PALETTES = [
  ["#4f46e5", "#a855f7"],
  ["#0ea5e9", "#6366f1"],
  ["#10b981", "#0ea5e9"],
  ["#f59e0b", "#ec4899"],
  ["#ec4899", "#8b5cf6"],
];

export function GET(req: NextRequest) {
  const name = (req.nextUrl.searchParams.get("name") || "OmniFlow").trim().slice(0, 80);
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toLocaleUpperCase()
    .replace(/[<>&"']/g, "");

  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const [from, to] = PALETTES[hash % PALETTES.length];

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="${from}"/><stop offset="100%" stop-color="${to}"/>
  </linearGradient></defs>
  <rect width="256" height="256" rx="128" fill="url(#g)"/>
  <text x="50%" y="50%" dy="0.35em" text-anchor="middle"
    font-family="Plus Jakarta Sans, Inter, sans-serif" font-size="104" font-weight="800" fill="#ffffff">
    ${initials || "OF"}
  </text>
</svg>`;

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
