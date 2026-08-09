import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __termsPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __termsSchemaReady: Promise<void> | undefined;
}

export function getTermsPool(): Pool {
  if (!global.__termsPool) {
    const connectionString = process.env.TERMS_DATABASE_URL;
    if (!connectionString) {
      throw new Error("TERMS_DATABASE_URL is not set");
    }
    global.__termsPool = new Pool({ connectionString });
  }
  return global.__termsPool;
}

// Mirrors the legacy service's `Base.metadata.create_all(bind=engine)` startup
// hook (services/terms_and_conditions_service/main.py) — there's no
// long-lived process lifespan in Next.js, so schema creation runs lazily on
// first access and is memoized for the life of the server process.
//
// Status is stored uppercase ('DRAFT'/'PUBLISHED'/'ARCHIVED') because
// SQLAlchemy's `Enum(TermsStatus)` persists Python enum *names*, not values,
// by default. The API still returns lowercase to match the Pydantic response
// model (str-mixin enums serialize by value) — see toDto() in repository.ts.
// If this app is pointed at the live legacy database during cutover, confirm
// the on-disk representation matches before relying on this assumption.
export function ensureTermsSchema(): Promise<void> {
  if (!global.__termsSchemaReady) {
    global.__termsSchemaReady = getTermsPool().query(`
      CREATE TABLE IF NOT EXISTS terms_and_conditions (
        id SERIAL PRIMARY KEY,
        version VARCHAR(20) NOT NULL,
        title VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
          CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
        doc_type VARCHAR(20) NOT NULL DEFAULT 'terms'
          CHECK (doc_type IN ('terms', 'privacy')),
        created_by_admin_id INTEGER,
        published_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      ALTER TABLE terms_and_conditions ADD COLUMN IF NOT EXISTS doc_type VARCHAR(20) NOT NULL DEFAULT 'terms';
    `).then(() => undefined);
  }
  return global.__termsSchemaReady;
}
