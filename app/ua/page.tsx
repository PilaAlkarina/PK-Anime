import type { Metadata } from "next";
import { headers } from "next/headers";
import { detectUiMode } from "@/lib/ui-mode";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Navegador", robots: { index: false, follow: false } };

/**
 * Which browser engine this device has, rendered on the server with inline styles and no
 * JavaScript, so it reads even on a TV where the app itself doesn't run. Used to diagnose Smart
 * TV browsers (Samsung Tizen, LG webOS…).
 */
export default function BrowserInfoPage() {
  const ua = headers().get("user-agent") || "";
  const chromium = ua.match(/(?:Chrome|Chromium)\/(\d+)/)?.[1] ?? ua.match(/\b(\d{2,3})\.\d+\.\d+\.\d+\/\d/)?.[1] ?? null;
  const tizen = ua.match(/Tizen\s*([\d.]+)/i)?.[1] ?? null;
  const webos = /Web0S|webOS/i.test(ua);
  const mode = detectUiMode(ua);
  const version = chromium ? Number(chromium) : null;

  const rows: [string, string][] = [
    ["Interfaz detectada", mode === "tv" ? "TV (mando a distancia)" : "Web"],
    ["Sistema de la TV", tizen ? `Samsung Tizen ${tizen}` : webos ? "LG webOS" : "—"],
    ["Motor (Chromium)", version ? String(version) : "No identificado"],
    [
      "Compatibilidad",
      version === null
        ? "Desconocida"
        : version >= 87
          ? "Completa"
          : version >= 65
            ? "Buena, con alternativas para lo más moderno"
            : "Básica: motor anterior a 2018",
    ],
  ];

  return (
    <main style={{ minHeight: "100vh", margin: 0, padding: "48px", background: "#0C0B10", color: "#F4F1EA", fontFamily: "sans-serif" }}>
      <h1 style={{ margin: "0 0 24px", fontSize: "40px" }}>Navegador de este dispositivo</h1>
      <table style={{ borderCollapse: "collapse", fontSize: "26px" }}>
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <td style={{ padding: "10px 32px 10px 0", color: "#A8A2B4" }}>{label}</td>
              <td style={{ padding: "10px 0", fontWeight: "bold" }}>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ marginTop: "32px", fontSize: "20px", color: "#A8A2B4" }}>User-Agent</p>
      <p style={{ fontSize: "20px", wordBreak: "break-all", fontFamily: "monospace" }}>{ua}</p>
    </main>
  );
}
