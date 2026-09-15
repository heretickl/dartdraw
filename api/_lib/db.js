const { neon } = require('@neondatabase/serverless');

let sqlClient;

// Tagged-template query function, e.g. sql`SELECT * FROM x WHERE id = ${id}`.
// Lazily created so a missing DATABASE_URL only fails requests that need it.
function sql(...args) {
  if (!sqlClient) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
    sqlClient = neon(process.env.DATABASE_URL);
  }
  return sqlClient(...args);
}

module.exports = { sql };
