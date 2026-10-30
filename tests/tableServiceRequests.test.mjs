import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");
const migration = read("supabase/migrations/20261025030000_table_service_requests.sql");
const publicMenu = read("src/pages/PublicMenu.jsx");
const concierge = read("src/components/AskKhaavio.jsx");
const dashboard = read("src/pages/ServiceRequestsDashboard.jsx");
const app = read("src/App.jsx");
const layout = read("src/components/RestaurantDashboardLayout.jsx");

test("public guests can submit only through a server-validated table QR RPC", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.create_public_table_service_request/i);
  assert.match(migration, /SECURITY DEFINER[\s\S]*SET search_path TO ''/i);
  assert.match(migration, /r\.is_published IS TRUE[\s\S]*rt\.qr_token = p_table_token[\s\S]*rt\.is_active IS TRUE/i);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.create_public_table_service_request\(text, uuid, text, text\) TO anon, authenticated/i);
  assert.match(migration, /REVOKE ALL ON TABLE public\.table_service_requests FROM PUBLIC, anon, authenticated/i);
  assert.doesNotMatch(migration, /GRANT\s+INSERT\s+ON\s+TABLE\s+public\.table_service_requests\s+TO\s+anon/i);
});

test("active duplicate requests are returned rather than inserted again", () => {
  assert.match(migration, /table_service_requests_one_active_type_uidx/i);
  assert.match(migration, /sr\.status IN \('pending', 'accepted'\)/i);
  assert.match(migration, /RETURN QUERY SELECT v_existing_id, v_existing_status, TRUE/i);
});

test("only restaurant owners can read and transition requests", () => {
  assert.match(migration, /table_service_requests_owner_select[\s\S]*r\.owner_id = auth\.uid\(\)/i);
  assert.match(migration, /table_service_requests_owner_update[\s\S]*r\.owner_id = auth\.uid\(\)/i);
  assert.match(migration, /khaavio_guard_table_service_request_update/i);
  assert.match(migration, /An accepted request can only be completed or cancelled/i);
  assert.match(migration, /A resolved service request cannot be changed/i);
});

test("Public Menu routes validated table service actions through the unified concierge chat", () => {
  assert.match(publicMenu, /import PublicHelpLauncher from "\.\.\/components\/PublicHelpLauncher"/);
  assert.match(publicMenu, /<PublicHelpLauncher[\s\S]*?showService=\{Boolean\(slug && tableToken && tableContext\?\.restaurant_id\)\}/);
  assert.match(publicMenu, /<AskKhaavio[\s\S]*?showService=\{Boolean\(slug && tableToken && tableContext\?\.restaurant_id\)\}[\s\S]*?slug=\{slug\}[\s\S]*?tableToken=\{tableToken\}[\s\S]*?tableContext=\{tableContext\}/);
  assert.match(concierge, /create_public_table_service_request/);
  assert.match(concierge, /if \(!showService \|\| serviceSubmitting \|\| !slug \|\| !tableToken \|\| !tableContext\?\.restaurant_id\) return/);
  assert.match(concierge, /"waiter"[\s\S]*"water"[\s\S]*"bill"[\s\S]*"cutlery"/);
});

test("service request dashboard uses restaurant-scoped realtime and protected navigation", () => {
  assert.match(dashboard, /table_service_requests/);
  assert.match(dashboard, /postgres_changes/);
  assert.match(dashboard, /filter: `restaurant_id=eq\.\$\{selectedRestaurantId\}`/);
  assert.match(dashboard, /\.eq\("owner_id", authData\.user\.id\)/);
  assert.match(app, /path="\/dashboard\/service-requests"/);
  assert.match(app, /<ServiceRequestsDashboard \/>/);
  assert.match(layout, /label: "Service requests", to: "\/dashboard\/service-requests", icon: BellRing/);
});
