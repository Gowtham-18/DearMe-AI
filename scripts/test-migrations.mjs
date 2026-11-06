// Runs the Supabase migrations (docs/db, phases 1..8) on PGlite with a Supabase-like auth stub and
// checks the auth rollout: legacy anon data -> anonymous sign-in -> claim -> Row Level Security.
// Usage: npm install --prefix /tmp/pg @electric-sql/pglite@0.2.17 && node scripts/test-migrations.mjs . /tmp/pg
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(join(process.argv[3], "package.json"));
const { PGlite } = await import(pathToFileURL(require.resolve("@electric-sql/pglite")).href);
const { vector } = await import(pathToFileURL(require.resolve("@electric-sql/pglite/vector")).href);

const dbDir = join(process.argv[2], "docs", "db");
const db = new PGlite({ extensions: { vector } });
let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) failures++;
};
// PGlite has no pgcrypto; gen_random_uuid() is core since Postgres 13, so drop that line here only.
const sql = (name) =>
  readFileSync(join(dbDir, name), "utf8")
    .replace(/^﻿/, "")
    .replace(/create extension if not exists "pgcrypto";/gi, "");

// Supabase-like environment
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated;
  grant select on auth.users to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
  alter default privileges in schema public grant execute on functions to anon, authenticated;
`);

for (const file of ["schema.sql", "schema-phase2.sql", "schema-phase3.sql", "schema-phase4.sql", "schema-phase5.sql"]) {
  await db.exec(sql(file));
}
ok(true, "phases 1-5 applied");

const as = async (role, uid) => {
  await db.exec(`reset role`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? ""]);
  await db.exec(`set role ${role}`);
};
const vec = (axis) => `[${Array.from({ length: 384 }, (_, i) => (i === axis ? 1 : 0)).join(",")}]`;

// Old app (anon key, no auth) writes data under a localStorage id
const LEGACY = "6f1c2a44-1111-4c3b-9d7e-aaaaaaaaaaaa";
const VICTIM_LEGACY = "6f1c2a44-2222-4c3b-9d7e-bbbbbbbbbbbb";
await as("anon");
await db.query(`insert into profiles (user_id, name, age) values ($1, 'Asha', 30), ($2, 'Ben', 40)`, [LEGACY, VICTIM_LEGACY]);
const { rows: [s1] } = await db.query(
  `insert into journal_sessions (user_id, entry_date, selected_prompt_id, selected_prompt_text) values ($1, current_date, 'p1', 'x') returning id`, [LEGACY]);
const { rows: [e1] } = await db.query(
  `insert into entries (user_id, entry_date, time_budget, content) values ($1, current_date, 5, 'Deadline at work again') returning id`, [LEGACY]);
await db.query(`insert into journal_turns (session_id, user_id, role, content) values ($1, $2, 'user', 'hello')`, [s1.id, LEGACY]);
await db.query(`insert into journal_embeddings (user_id, entry_id, embedding) values ($1, $2, $3)`, [LEGACY, e1.id, vec(0)]);
await db.query(`insert into entries (user_id, entry_date, time_budget, content) values ($1, current_date, 5, 'Ben private entry')`, [VICTIM_LEGACY]);

// Phase 6a while the old app is still live
await db.exec(`reset role`);
await db.exec(sql("schema-phase6a-auth-prep.sql"));
ok(true, "phase 6a applied on top of live data");
await as("anon");
const { rows: anonStill } = await db.query(`select count(*)::int as n from entries`);
ok(anonStill[0].n === 2, "old app (anon) still works after 6a");
let anonRpcBlocked = false;
try { await db.query(`select claim_legacy_data($1)`, [LEGACY]); } catch { anonRpcBlocked = true; }
ok(anonRpcBlocked, "anon cannot call claim_legacy_data");

// New app: anonymous sign-in -> auth user A, claims its legacy id
const A = "a0000000-0000-4000-8000-000000000001";
const B = "b0000000-0000-4000-8000-000000000002";
await db.exec(`reset role`);
await db.query(`insert into auth.users (id) values ($1), ($2)`, [A, B]);
await as("authenticated", A);
const { rows: [claim] } = await db.query(`select claim_legacy_data($1) as moved`, [LEGACY]);
ok(claim.moved >= 2, `claim moved ${claim.moved} entry/session rows to the signed-in user`);
const { rows: [again] } = await db.query(`select claim_legacy_data($1) as moved`, [LEGACY]);
ok(again.moved === 0, "a legacy id can only be claimed once");
const { rows: [selfClaim] } = await db.query(`select claim_legacy_data($1) as moved`, [B]);
ok(selfClaim.moved === 0, "cannot claim a real auth user's id");
const { rows: [prof] } = await db.query(`select name from profiles where user_id = $1`, [A]);
ok(prof?.name === "Asha", "profile moved to the new account");

// New columns + per-session entry uniqueness
const { rows: [s2] } = await db.query(
  `insert into journal_sessions (user_id, entry_date, selected_prompt_id, selected_prompt_text, mood, time_budget) values ($1, current_date, 'p2', 'y', 'Calm', 7) returning id, mood, time_budget`, [A]);
ok(s2.mood === "Calm" && s2.time_budget === 7, "sessions store mood and time budget");
await db.query(`insert into entries (user_id, entry_date, time_budget, content, session_id) values ($1, current_date, 7, 'second entry today', $2)`, [A, s2.id]);
let dupBlocked = false;
try { await db.query(`insert into entries (user_id, entry_date, time_budget, content, session_id) values ($1, current_date, 7, 'dup', $2)`, [A, s2.id]); } catch { dupBlocked = true; }
ok(dupBlocked, "one entry per session (second entry of the day no longer overwrites the first)");

// Phase 6b: RLS
await db.exec(`reset role`);
await db.exec(sql("schema-phase6b-rls.sql"));
ok(true, "phase 6b applied");

await as("anon");
let anonBlocked = false;
try { const r = await db.query(`select count(*)::int as n from entries`); anonBlocked = r.rows[0].n === 0; } catch { anonBlocked = true; }
ok(anonBlocked, "anon (signed out) can no longer read journals");

await as("authenticated", B);
const { rows: bSees } = await db.query(`select count(*)::int as n from entries`);
ok(bSees[0].n === 0, "user B sees none of A's entries");
let spoofBlocked = false;
try { await db.query(`insert into entries (user_id, entry_date, time_budget, content) values ($1, current_date, 5, 'spoof')`, [A]); } catch { spoofBlocked = true; }
ok(spoofBlocked, "user B cannot write rows as user A");
const { rowCount: bDel } = await db.query(`delete from entries where user_id = $1`, [A]);
ok((bDel ?? 0) === 0, "user B cannot delete A's entries");
const { rows: bMatch } = await db.query(`select * from match_journal_entries($1, $2, 5)`, [A, vec(0)]);
ok(bMatch.length === 0, "vector search with A's id returns nothing for B");
const { rows: bRate } = await db.query(`select check_rate_limit('chat', 2, 60) as a, check_rate_limit('chat', 2, 60) as b, check_rate_limit('chat', 2, 60) as c`);
ok(bRate[0].a && bRate[0].b && !bRate[0].c, "rate limit allows 2 then blocks the 3rd");

await as("authenticated", A);
const { rows: aSees } = await db.query(`select count(*)::int as n from entries`);
ok(aSees[0].n === 2, "user A sees exactly their 2 entries");
const { rows: aMatch } = await db.query(`select * from match_journal_entries($1, $2, 5)`, [A, vec(0)]);
ok(aMatch.length === 1 && aMatch[0].similarity > 0.99, "vector search works for the owner");

const themes = JSON.stringify([
  { id: "c0000000-0000-4000-8000-0000000000c1", label: "Work", keywords: ["work"], strength: 1, members: [{ entry_id: e1.id, score: 0.9 }] },
]);
const { rows: [rt] } = await db.query(`select replace_user_themes($1::jsonb) as n`, [themes]);
const { rows: tm } = await db.query(`select count(*)::int as n from theme_membership`);
ok(rt.n === 1 && tm[0].n === 1, "replace_user_themes writes themes + membership atomically");
let badTheme = false;
try { await db.query(`select replace_user_themes($1::jsonb)`, [`[{"id":"not-a-uuid","label":"x"}]`]); } catch { badTheme = true; }
const { rows: tAfter } = await db.query(`select count(*)::int as n from themes`);
ok(badTheme && tAfter[0].n === 1, "a failed theme rebuild rolls back and keeps the old themes");

await db.query(`select delete_my_data(true)`);
const counts = await db.query(`select (select count(*) from entries)::int e, (select count(*) from journal_sessions)::int s, (select count(*) from profiles)::int p, (select count(*) from themes)::int t`);
ok(Object.values(counts.rows[0]).every((n) => n === 0), "delete_my_data removes everything for the user");

// Phase 6c: internal tables locked to the definer functions
await db.exec(`reset role`);
await db.exec(sql("schema-phase6c-hardening.sql"));
ok(true, "phase 6c applied");
await as("authenticated", B);
let internalBlocked = 0;
for (const t of ["app_settings", "legacy_claims", "rate_limits"]) {
  try { await db.query(`select * from ${t} limit 1`); } catch { internalBlocked += 1; }
}
ok(internalBlocked === 3, "signed-in users cannot read the internal tables directly");
const { rows: bRate2 } = await db.query(`select check_rate_limit('weekly', 1, 60) as a, check_rate_limit('weekly', 1, 60) as b`);
ok(bRate2[0].a && !bRate2[0].b, "rate limiting still works through its function after 6c");
await as("anon");
let anonInternal = 0;
for (const t of ["app_settings", "legacy_claims", "rate_limits"]) {
  try { await db.query(`select * from ${t} limit 1`); } catch { anonInternal += 1; }
}
ok(anonInternal === 3, "signed-out role cannot see the internal tables");

// Phase 7: remembered facts
await db.exec(`reset role`);
await db.exec(sql("schema-phase7-memory.sql"));
await db.exec(sql("schema-phase7-memory.sql"));
ok(true, "phase 7 applied (and is safe to re-run)");
await as("authenticated", A);
const { rows: [me1] } = await db.query(
  `insert into entries (user_id, entry_date, time_budget, content) values ($1, current_date, 5, 'My sister Priya called. Interview on Friday.') returning id`, [A]);
const { rows: [me2] } = await db.query(
  `insert into entries (user_id, entry_date, time_budget, content) values ($1, current_date, 5, 'Talked to Priya again.') returning id`, [A]);
const facts = JSON.stringify([
  { kind: "person", key: "person:priya", label: "Priya", detail: "sister", seen_on: "2026-11-05" },
  { kind: "event", key: "event:interview:2026-11-07", label: "interview", event_date: "2026-11-07", seen_on: "2026-11-05" },
  { kind: "nonsense", key: "x", label: "x" },
]);
const { rows: [rf] } = await db.query(`select remember_facts($1, $2::jsonb) as n`, [me1.id, facts]);
ok(rf.n === 2, "remember_facts stores people and events, ignores unknown kinds");
await db.query(`select remember_facts($1, $2::jsonb)`, [me1.id, facts]);
const { rows: [same] } = await db.query(`select mention_count from memory_facts where fact_key = 'person:priya'`);
ok(same.mention_count === 1, "re-analysing the same entry doesn't inflate mentions");
await db.query(`select remember_facts($1, $2::jsonb)`, [me2.id, JSON.stringify([{ kind: "person", key: "person:priya", label: "Priya", seen_on: "2026-11-06" }])]);
const { rows: [priya] } = await db.query(`select mention_count, detail, last_seen::text from memory_facts where fact_key = 'person:priya'`);
ok(priya.mention_count === 2 && priya.detail === "sister" && priya.last_seen === "2026-11-06", "a new entry counts a mention and keeps the known relation");
await as("authenticated", B);
const { rows: bFacts } = await db.query(`select count(*)::int as n from memory_facts`);
ok(bFacts[0].n === 0, "user B cannot see A's remembered facts");
let bFactSpoof = false;
try { await db.query(`insert into memory_facts (user_id, kind, fact_key, label) values ($1, 'person', 'person:x', 'X')`, [A]); } catch { bFactSpoof = true; }
ok(bFactSpoof, "user B cannot write facts as user A");
const { rows: [bOnA] } = await db.query(`select remember_facts($1, $2::jsonb) as n`, [me1.id, facts]);
ok(bOnA.n === 0, "B cannot attach facts to A's entry");
await as("authenticated", A);
const { rows: aFacts } = await db.query(`select count(*)::int as n from memory_facts where user_id = $1`, [A]);
ok(aFacts[0].n === 2, "B calling remember_facts only writes B's own rows");
await db.query(`delete from entries where id = $1`, [me2.id]);
const { rows: gone } = await db.query(`select count(*)::int as n from memory_facts where fact_key = 'person:priya'`);
ok(gone[0].n === 0, "deleting the source entry forgets the fact");
await as("anon");
let anonFacts = false;
try { const r = await db.query(`select count(*)::int as n from memory_facts`); anonFacts = r.rows[0].n === 0; } catch { anonFacts = true; }
ok(anonFacts, "signed-out role cannot read remembered facts");
await as("authenticated", A);
await db.query(`select delete_my_data(true)`);
const { rows: aLeft } = await db.query(`select count(*)::int as n from memory_facts`);
ok(aLeft[0].n === 0, "delete_my_data also forgets remembered facts");

await db.exec(`reset role`);
const { rows: ben } = await db.query(`select count(*)::int as n from entries where user_id = $1`, [VICTIM_LEGACY]);
ok(ben[0].n === 1, "other users' (unclaimed) data untouched");

// Phase 8: accounts (usernames, availability check, delete my account)
await db.exec(`reset role`);
await db.exec(sql("schema-phase8-accounts.sql"));
await db.exec(sql("schema-phase8-accounts.sql"));
ok(true, "phase 8 applied (and is safe to re-run)");
await as("authenticated", A);
await db.query(`insert into profiles (user_id, name, age) values ($1, 'Asha', 30) on conflict (user_id) do nothing`, [A]);
await db.query(`update profiles set username = 'asha_k' where user_id = $1`, [A]);
let badName = false;
try { await db.query(`update profiles set username = 'Asha K!' where user_id = $1`, [A]); } catch { badName = true; }
ok(badName, "usernames must be lower-case letters, digits or underscores");
await as("authenticated", B);
await db.query(`insert into profiles (user_id, name, age) values ($1, 'Ben', 40) on conflict (user_id) do nothing`, [B]);
let dupName = false;
try { await db.query(`update profiles set username = 'asha_k' where user_id = $1`, [B]); } catch { dupName = true; }
ok(dupName, "usernames are unique");
await as("anon");
const { rows: [avail] } = await db.query(
  `select username_available('asha_k') taken, username_available('new_name') free, username_available('admin') reserved, username_available('x') short`);
ok(!avail.taken && avail.free && !avail.reserved && !avail.short, "signed-out sign-up form can check availability (true/false only)");
let anonProfiles = 0;
try { anonProfiles = (await db.query(`select * from profiles`)).rows.length; } catch { anonProfiles = 0; }
ok(anonProfiles === 0, "availability check doesn't expose profiles to signed-out visitors");
let anonDelete = false;
try { await db.query(`select delete_my_account()`); } catch { anonDelete = true; }
ok(anonDelete, "signed-out role cannot call delete_my_account");
await as("authenticated", B);
await db.query(`insert into entries (user_id, entry_date, time_budget, content) values ($1, current_date, 5, 'Ben entry')`, [B]);
await db.query(`select delete_my_account()`);
await db.exec(`reset role`);
const { rows: [afterDelete] } = await db.query(
  `select (select count(*) from auth.users where id = $1)::int b_login, (select count(*) from profiles where user_id = $2)::int b_profile,
          (select count(*) from entries where user_id = $2)::int b_entries, (select count(*) from auth.users where id = $3)::int a_login,
          (select count(*) from profiles where user_id = $4)::int a_profile`, [B, B, A, A]);
ok(afterDelete.b_login === 0 && afterDelete.b_profile === 0 && afterDelete.b_entries === 0, "delete_my_account removes the caller's data and login");
ok(afterDelete.a_login === 1 && afterDelete.a_profile === 1, "delete_my_account leaves other accounts alone");

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures ? 1 : 0);
