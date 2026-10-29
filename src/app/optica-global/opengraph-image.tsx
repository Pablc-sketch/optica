import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { MARCA_GLOBAL } from "@/lib/marca-optica";
export const alt = "Óptica Global. Visión sin fronteras.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default async function ImagenMarca() {
 const logo = await readFile(join(process.cwd(), "public/marca/optica-global-logo.png"));
 return new ImageResponse(<div style={{ width: "100%", height: "100%", background: "#faf8f4", display: "flex", alignItems: "center", padding: "50px", borderBottom: "18px solid #db7958" }}>
 <img src={`data:image/png;base64,${logo.toString("base64")}`} width={440} height={440} alt=""/>
 <div style={{ display: "flex", flexDirection: "column", paddingLeft: "34px", borderLeft: "2px solid #e5d9ce", width: "610px" }}>
 <div style={{ fontSize: 64, fontWeight: 700, color: "#27271c", lineHeight: 1.1 }}>{MARCA_GLOBAL.nombre}</div>
 <div style={{ height: "5px", width: "90px", background: "#db7958", marginTop: "28px", marginBottom: "28px" }}/>
 <div style={{ fontSize: 42, color: "#474536", lineHeight: 1.25 }}>{MARCA_GLOBAL.eslogan}</div>
 </div></div>, size);
}
