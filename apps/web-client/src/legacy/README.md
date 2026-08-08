# Disabled legacy migrations

These two scripts were written to work around a bug that no longer exists, and
applying them now would actively weaken the database. They are renamed to
`.sql.disabled` so no migration runner picks them up.

**`00003_mock_user_id_for_testing.sql.disabled`**
Overrides `public.user_id()` to return a hardcoded `'test-user-123'`. Note it
patched `public.user_id()` while every RLS policy in `00002` calls
`auth.user_id()`, so it never even fixed the thing it was aimed at.

**`00004_disable_rls_for_analyzer.sql.disabled`**
Runs `ALTER TABLE users DISABLE ROW LEVEL SECURITY` and the same for
`analyzer_sessions`. Its own header describes this as bypassing JWT issues.

## The bug they were working around

`db/secure-client.ts` passed Clerk's raw compact JWT (`header.payload.signature`)
into `set_config('request.jwt.claims', ...)`. But `auth.user_id()` reads it as
`current_setting(...)::json->>'sub'`, and a compact JWT is not JSON, so that cast
raised `22P02 invalid input syntax for type json`.

Because `set_config` does not validate, the error surfaced on the *next* query in
the transaction rather than at the point of the mistake, which made it look like
an RLS problem instead of an encoding problem.

`secure-client.ts` now base64url-decodes the payload segment before passing it,
so `auth.user_id()` resolves correctly and RLS works as designed.

**Do not re-enable these.** Delete the directory once you are confident RLS is
behaving on a real database.
