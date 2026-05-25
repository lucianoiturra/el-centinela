import postgres from "postgres";

// Compatible con Neon (DATABASE_URL) y Vercel Postgres legacy (POSTGRES_URL)
const connectionString =
  process.env.DATABASE_URL ??
  process.env.POSTGRES_URL ??
  process.env.POSTGRES_PRISMA_URL ??
  "postgres://localhost/centinela"; // fallback dev sin DB

const ssl = connectionString.includes("neon.tech") ||
            connectionString.includes("vercel-storage.com")
              ? "require"
              : false;

/**
 * Cliente postgres. Usá como tagged template:
 *   const rows = await sql`SELECT * FROM day_state WHERE user_id = ${id}`
 * Retorna directamente el array de filas.
 */
const sql = postgres(connectionString, {
  ssl,
  max: 1, // serverless: una conexión por invocación de función
});

export default sql;
export { sql };
