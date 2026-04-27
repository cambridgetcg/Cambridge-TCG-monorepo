import { readFileSync } from "fs";

const envContent = readFileSync(".env.local", "utf-8");
for (const line of envContent.split("\n")) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) {
    let val = match[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[match[1].trim()] = val;
  }
}

import postgres from "postgres";
import { compareSync } from "bcryptjs";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { ssl: "require", max: 1 });
  const rows = await sql`SELECT id, email, role, password_hash FROM clients WHERE email = 'admin@cambridgetcg.com'`;

  if (rows.length > 0) {
    const ok = compareSync("admin2026!", rows[0].password_hash);
    console.log(`Password "admin2026!" matches: ${ok}`);
  }

  await sql.end();
}

main().catch(console.error);
