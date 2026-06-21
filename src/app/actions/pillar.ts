"use server";

import { revalidatePath } from "next/cache";

import { sql } from "@/lib/db/client";
import { getUserId } from "@/lib/server-user";
import {
  getDefaultPillars,
  isReservedPillarId,
  normalizePillarId,
} from "@/lib/pillars";
import type { PillarConfig } from "@/lib/types";

type PillarRow = {
  id: string;
  label: string;
  color: string;
  sort_order: number;
};

function rowToPillar(row: PillarRow): PillarConfig {
  return {
    id: row.id,
    label: row.label,
    color: row.color,
    sortOrder: row.sort_order,
  };
}

async function seedPillars(userId: string) {
  for (const pillar of getDefaultPillars()) {
    await sql`
      INSERT INTO user_pillar (user_id, id, label, color, sort_order, updated_at)
      VALUES (${userId}, ${pillar.id}, ${pillar.label}, ${pillar.color}, ${pillar.sortOrder}, NOW())
      ON CONFLICT (user_id, id) DO NOTHING
    `;
  }
}

export async function getPillars(): Promise<PillarConfig[]> {
  const userId = await getUserId();
  let rows = (await sql`
    SELECT id, label, color, sort_order
    FROM user_pillar
    WHERE user_id = ${userId}
    ORDER BY sort_order, label
  `) as unknown as PillarRow[];

  if (rows.length === 0) {
    await seedPillars(userId);
    rows = (await sql`
      SELECT id, label, color, sort_order
      FROM user_pillar
      WHERE user_id = ${userId}
      ORDER BY sort_order, label
    `) as unknown as PillarRow[];
  }

  return rows.map(rowToPillar);
}

export async function upsertPillar(input: Partial<PillarConfig> & Pick<PillarConfig, "label" | "color" | "sortOrder">) {
  const userId = await getUserId();
  const pillars = await getPillars();

  let id = input.id?.trim() || normalizePillarId(input.label);
  if (!id) {
    throw new Error("El pilar necesita un nombre valido.");
  }

  if (!input.id) {
    let suffix = 2;
    const base = id;
    const existingIds = new Set(pillars.map((pillar) => pillar.id));
    while (existingIds.has(id)) {
      id = `${base}-${suffix++}`;
    }
  }

  await sql`
    INSERT INTO user_pillar (user_id, id, label, color, sort_order, updated_at)
    VALUES (${userId}, ${id}, ${input.label.trim()}, ${input.color}, ${input.sortOrder}, NOW())
    ON CONFLICT (user_id, id)
    DO UPDATE SET label = EXCLUDED.label, color = EXCLUDED.color, sort_order = EXCLUDED.sort_order, updated_at = NOW()
  `;

  revalidatePath("/");
  revalidatePath("/configuracion");
}

export async function deletePillar(id: string) {
  const userId = await getUserId();

  if (isReservedPillarId(id)) {
    throw new Error("Ese pilar lo usa la app y no se puede borrar.");
  }

  const usage = await sql`
    SELECT COUNT(*)::int AS count
    FROM routine_ritual
    WHERE user_id = ${userId} AND pillar = ${id}
  `;

  if ((usage[0]?.count as number | undefined) && (usage[0]?.count as number) > 0) {
    throw new Error("No puedes borrar un pilar que todavia esta en uso en tu rutina.");
  }

  await sql`
    DELETE FROM user_pillar
    WHERE user_id = ${userId} AND id = ${id}
  `;

  revalidatePath("/");
  revalidatePath("/configuracion");
}

export async function getPillarMap() {
  const pillars = await getPillars();
  const map = new Map(
    pillars.map((pillar) => [
      pillar.id,
      {
        label: pillar.label,
        color: pillar.color,
      },
    ])
  );

  return map;
}
