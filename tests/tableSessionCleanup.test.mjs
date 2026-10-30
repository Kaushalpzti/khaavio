import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const migration = read("supabase/migrations/20261031021500_empty_session_cleanup.sql");
const sessions = read("src/pages/TableSessions.jsx");

test("empty guest tabs can be closed only by their restaurant owner", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.close_empty_guest_tab/);
  assert.match(migration, /Authentication is required to close an empty guest tab/);
  assert.match(migration, /r\.owner_id = \(SELECT auth\.uid\(\)\)/);
  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /o\.guest_tab_id = p_guest_tab_id\s+AND o\.status <> 'cancelled'/);
  assert.match(migration, /i\.guest_tab_id = p_guest_tab_id\s+AND i\.payment_status <> 'void'/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.close_empty_guest_tab\(uuid\)\s+TO authenticated/);
  assert.doesNotMatch(migration, /GRANT EXECUTE ON FUNCTION public\.close_empty_guest_tab\(uuid\)\s+TO anon/i);
});

test("closing one empty guest tab keeps other guests active and closes the session only when all tabs are done", () => {
  assert.match(migration, /WHERE t\.session_id = v_session_id\s+AND t\.status = 'open'/);
  assert.match(migration, /WHERE t\.session_id = v_session_id\s+AND t\.status = 'billing'/);
  assert.match(migration, /SET status = 'closed',[\s\S]*closed_at = COALESCE\(ts\.closed_at/);
  assert.match(sessions, /close_empty_guest_tab/);
  assert.match(sessions, /Close empty tab/);
  assert.match(sessions, /billableTabOrders\.length === 0/);
});

test("combined sessions close only when every order is cancelled and no active invoice remains", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.close_empty_table_session/);
  assert.match(migration, /v_billing_mode <> 'combined'/);
  assert.match(migration, /o\.session_id = p_session_id\s+AND o\.status <> 'cancelled'/);
  assert.match(migration, /i\.session_id = p_session_id\s+AND i\.payment_status <> 'void'/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.close_empty_table_session\(uuid\)\s+TO authenticated/);
  assert.match(sessions, /close_empty_table_session/);
  assert.match(sessions, /Close empty session/);
});
