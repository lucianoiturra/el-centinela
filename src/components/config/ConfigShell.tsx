"use client";
import { useState } from "react";
import Link from "next/link";
import MiRutina from "./MiRutina";
import VistaMensual from "./VistaMensual";
import CicloConfig from "./CicloConfig";
import Diario from "./Diario";

type Tab = "rutina" | "ciclo" | "mensual" | "diario";

export default function ConfigShell() {
  const [tab, setTab] = useState<Tab>("rutina");
  return (
    <div className="wrap">
      <div className="topbar">
        <Link href="/" className="back">‹ volver</Link>
        <div className="brand">Configuración</div>
      </div>
      <div className="config-tabs">
        <button className={tab === "rutina" ? "on" : ""} onClick={() => setTab("rutina")}>Mi rutina</button>
        <button className={tab === "ciclo" ? "on" : ""} onClick={() => setTab("ciclo")}>Ciclo</button>
        <button className={tab === "mensual" ? "on" : ""} onClick={() => setTab("mensual")}>Vista mensual</button>
        <button className={tab === "diario" ? "on" : ""} onClick={() => setTab("diario")}>Diario</button>
      </div>
      <div className="config-body">
        {tab === "rutina" && <MiRutina />}
        {tab === "mensual" && <VistaMensual />}
        {tab === "ciclo" && <CicloConfig />}
        {tab === "diario" && <Diario />}
      </div>
    </div>
  );
}
