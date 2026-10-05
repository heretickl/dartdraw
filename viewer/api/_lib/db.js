const { neon } = require('@neondatabase/serverless');

let sqlClient;

// Tagged-template query function, e.g. sql`SELECT * FROM x WHERE id = ${id}`.
// DATABASE_URL for this project should be the READ-ONLY role from
// sql/readonly.sql, not the organiser app's connection string.
function sql(...args) {
  if (!sqlClient) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
    sqlClient = neon(process.env.DATABASE_URL);
  }
  return sqlClient(...args);
}

module.exports = { sql };
