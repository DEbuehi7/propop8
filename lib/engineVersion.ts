/**
 * lib/engineVersion.ts
 * ----------------------------------------------------------------------------
 * The version of the audit engine's rules. It is stored with every saved
 * review (audit_reviews.engine_version) and printed in the PDF footer, so a
 * delivered report can always be traced to the rules that produced it.
 *
 * Kept in its own file so the PDF renderer can import it without pulling in
 * the engine, and deliberately NOT part of EngineResult, so the audit golden
 * output does not change.
 *
 * BUMP THIS whenever a change to lib/auditEngine.ts or lib/calcMath.ts would
 * change what a report says. The golden test (tests/auditGolden.test.ts) fails
 * when that happens; bumping the version is part of updating the golden.
 */
export const ENGINE_VERSION = "1.0.0";
