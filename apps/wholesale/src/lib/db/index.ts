import { createDb } from "@cambridge-tcg/db";
import * as schema from "./schema";

const { db, client, close } = createDb({ schema });

export { db, client, close };
