import type { Database as BetterSqliteDatabase } from "better-sqlite3";

/**
 * Adds a column when the table does not already contain it.
 *
 * @param database SQLite database connection.
 * @param tableName Table name.
 * @param columnName Column name.
 * @param definition SQLite column definition.
 *
 * @returns Nothing.
 */
export function addColumnIfMissing(
  database: BetterSqliteDatabase,
  tableName: string,
  columnName: string,
  definition: string
): void {
  const columns = database
    .prepare(`PRAGMA table_info(${tableName})`)
    .all() as Array<{ name: string }>;
  const exists = columns.some((column) => column.name === columnName);

  if (exists) {
    return;
  }

  database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}
