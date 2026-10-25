import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = existsSync(join(here, 'src/pages/PublicMenu.jsx')) ? here : resolve(here, '..');
const read = (path) => {
  const primary = join(root, path);
  const fallback = join(here, path);
  if (existsSync(primary)) return readFileSync(primary, 'utf8');
  if (existsSync(fallback)) return readFileSync(fallback, 'utf8');
  throw new Error(`Required patch/project file not found: ${path}`);
};
const migration = read('supabase/migrations/20261025211000_khaavio_loyalty_stamps.sql');
const menu = read('src/pages/PublicMenu.jsx');
const app = read('src/App.jsx');
const layout = read('src/components/RestaurantDashboardLayout.jsx');
const publicClub = read('src/components/PublicLoyaltyClub.jsx');
const dashboard = read('src/pages/LoyaltyDashboard.jsx');
const tokenHelper = read('src/lib/loyaltyToken.js');

const checks = [
  ['stamps require completed order and paid table-session invoice', /v_status <> 'completed'[\s\S]*?payment_status = 'paid'/i.test(migration)],
  ['one stamp per order is protected by a unique ledger index', /restaurant_loyalty_ledger_one_stamp_per_order_uidx/.test(migration) && /entry_type = 'stamp_earned' AND l\.order_id = p_order_id/.test(migration)],
  ['guest uses a random browser token rather than phone-number identity', /member_token uuid NOT NULL/.test(migration) && !(migration.match(/CREATE TABLE IF NOT EXISTS public\.restaurant_loyalty_members \(([\s\S]*?)\n\);/i)?.[1] || '').includes('customer_phone') && /randomUUID/.test(tokenHelper)],
  ['loyalty member and ledger tables deny direct anonymous writes', /REVOKE ALL ON TABLE public\.restaurant_loyalty_members FROM PUBLIC, anon, authenticated/.test(migration) && /REVOKE ALL ON TABLE public\.restaurant_loyalty_ledger FROM PUBLIC, anon, authenticated/.test(migration)],
  ['order wrapper delegates to existing validated public order RPC', /public\.place_public_order\(p_slug, p_table_token, p_customer_name, p_customer_phone, p_notes, p_items\)/.test(migration) && /place_public_order_with_loyalty/.test(menu)],
  ['reward is revealed immediately at unlock; no scratch RPC in Phase 1', /reward_name, redemption_code, revealed_at/.test(migration) && /v_reward_name, v_code, pg_catalog\.now\(\)/.test(migration) && !/CREATE OR REPLACE FUNCTION public\.reveal_public_loyalty_reward/.test(migration) && !/Scratch to reveal/i.test(publicClub)],
  ['only authenticated restaurant owner can redeem unlocked reward', /owner_redeem_loyalty_reward/.test(migration) && /r\.owner_id = \(SELECT auth\.uid\(\)\)/.test(migration) && /GRANT EXECUTE ON FUNCTION public\.owner_redeem_loyalty_reward\(uuid\) TO authenticated/.test(migration)],
  ['public menu includes the stamp card without replacing table-service widget', /PublicLoyaltyClub/.test(menu) && /PublicTableService/.test(menu) && /getOrCreateKhaavioLoyaltyToken/.test(menu)],
  ['owner dashboard is route-protected and linked in navigation', /path="\/dashboard\/loyalty"[\s\S]*?<ProtectedRestaurantPage>[\s\S]*?<LoyaltyDashboard\s*\/>/.test(app) && /Loyalty & rewards/.test(layout)],
  ['dashboard config is backed by owner-scoped RLS and reward redemption RPC', /restaurant_loyalty_programs/.test(dashboard) && /owner_redeem_loyalty_reward/.test(dashboard)],
];

let failures = 0;
for (const [name, passed] of checks) {
  if (passed) process.stdout.write(`✔ ${name}\n`);
  else { failures++; process.stderr.write(`✖ ${name}\n`); }
}
process.stdout.write(`\n${checks.length - failures}/${checks.length} Phase 1 checks passed.\n`);
if (failures) process.exitCode = 1;
