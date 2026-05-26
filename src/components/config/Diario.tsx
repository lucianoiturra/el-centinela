"use client";
import { useEffect, useState } from "react";
import { getDiario } from "@/app/actions/day";

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function fmt(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export default function Diario() {
  const [entries, setEntries] = useState<{ date: string; linea: string }[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDiario()
      .then((e) => { if (!cancelled) setEntries(e); })
      .catch(() => { if (!cancelled) setEntries([]); });
    return () => { cancelled = true; };
  }, []);

  if (entries === null) return <div className="config-soon">Cargando…</div>;
  if (entries.length === 0) return <div className="config-soon">Aún no has escrito líneas espirituales.</div>;

  return (
    <div className="diario">
      {entries.map((e) => (
        <div className="diario-entry" key={e.date}>
          <div className="diario-date">{fmt(e.date)}</div>
          <div className="diario-linea">{e.linea}</div>
        </div>
      ))}
    </div>
  );
}
