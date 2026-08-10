import type { Database as BetterSqliteDatabase } from "better-sqlite3";

import { applySchemaMigrationV1 } from "./v01.js";
import { applySchemaMigrationV2 } from "./v02.js";
import { applySchemaMigrationV3 } from "./v03.js";
import { applySchemaMigrationV4 } from "./v04.js";
import { applySchemaMigrationV5 } from "./v05.js";
import { applySchemaMigrationV6 } from "./v06.js";
import { applySchemaMigrationV7 } from "./v07.js";
import { applySchemaMigrationV8 } from "./v08.js";
import { applySchemaMigrationV9 } from "./v09.js";
import { applySchemaMigrationV10 } from "./v10.js";
import { applySchemaMigrationV11 } from "./v11.js";
import { applySchemaMigrationV12 } from "./v12.js";
import { applySchemaMigrationV13 } from "./v13.js";
import { applySchemaMigrationV14 } from "./v14.js";
import { applySchemaMigrationV15 } from "./v15.js";
import { applySchemaMigrationV16 } from "./v16.js";
import { applySchemaMigrationV17 } from "./v17.js";
import { applySchemaMigrationV18 } from "./v18.js";
import { applySchemaMigrationV19 } from "./v19.js";
import { applySchemaMigrationV20 } from "./v20.js";
import { applySchemaMigrationV21 } from "./v21.js";
import { applySchemaMigrationV22 } from "./v22.js";
import { applySchemaMigrationV23 } from "./v23.js";
import { applySchemaMigrationV24 } from "./v24.js";
import { applySchemaMigrationV25 } from "./v25.js";
import { applySchemaMigrationV26 } from "./v26.js";
import { applySchemaMigrationV27 } from "./v27.js";

/**
 * Applies all database schema migrations required by the SQLite cache.
 *
 * @param database Open SQLite database connection.
 * @returns Nothing.
 */
export function runMigrations(database: BetterSqliteDatabase): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  applySchemaMigrationV1(database);
  applySchemaMigrationV2(database);
  applySchemaMigrationV3(database);
  applySchemaMigrationV4(database);
  applySchemaMigrationV5(database);
  applySchemaMigrationV6(database);
  applySchemaMigrationV7(database);
  applySchemaMigrationV8(database);
  applySchemaMigrationV9(database);
  applySchemaMigrationV10(database);
  applySchemaMigrationV11(database);
  applySchemaMigrationV12(database);
  applySchemaMigrationV13(database);
  applySchemaMigrationV14(database);
  applySchemaMigrationV15(database);
  applySchemaMigrationV16(database);
  applySchemaMigrationV17(database);
  applySchemaMigrationV18(database);
  applySchemaMigrationV19(database);
  applySchemaMigrationV20(database);
  applySchemaMigrationV21(database);
  applySchemaMigrationV22(database);
  applySchemaMigrationV23(database);
  applySchemaMigrationV24(database);
  applySchemaMigrationV25(database);
  applySchemaMigrationV26(database);
  applySchemaMigrationV27(database);
}
