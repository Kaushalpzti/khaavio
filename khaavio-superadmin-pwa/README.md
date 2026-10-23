# Khaavio Control — standalone private Super Admin PWA

A separate installable React PWA for Khaavio platform operations. It is intended to live as a **separate Vercel project and origin**, so it gets its own app icon, manifest, service worker, browser storage and installation. It does not replace or modify the public Khaavio restaurant app.

## Included

- Existing Supabase email/password sign-in only (no public sign-up screen).
- Server-side access check through the existing `platform_admin_list_subscriptions` RPC before showing the admin workspace.
- Responsive Overview, Restaurant Directory, Renewal Queue, Audit Trail and Security screens.
- Uses existing RPCs: `platform_admin_list_subscriptions`, `platform_admin_assign_plan`, `platform_admin_list_renewal_requests`, `platform_admin_resolve_renewal_request`.
- Adds a separate, allowlist-protected `platform_admin_list_audit_logs` RPC in `supabase/khaavio-superadmin-pwa-migration.sql`.
- Custom PWA manifest and icon. Service worker caches only the static app shell/assets and explicitly never caches Supabase Auth, REST, Storage, Realtime or RPC responses.
- Manual billing warnings remain in the workflows: payment must be independently verified outside Khaavio before activation.

## 1. Configure locally

Requirements: Node.js 22.12+.

1. Copy `.env.example` to `.env.local`.
2. Use the same `VITE_SUPABASE_URL` and public anon/publishable key as your current Khaavio app. In the existing project, copy only those two `VITE_` values from its local `.env` file.
3. **Never copy a Supabase `service_role`, secret, database password, or private API key into this browser app.**
4. Run:

   ```bash
   npm install
   npm run dev
   ```

5. Open the printed local URL, sign in with the existing primary admin account, and test every section. PWA installation/service-worker registration is enabled in production builds, not local dev.

## 2. Supabase setup

The app relies on the current platform-admin and renewal migrations already used by Khaavio. Keep these RPCs and their checks:

- `platform_admin_list_subscriptions`
- `platform_admin_assign_plan`
- `platform_admin_list_renewal_requests`
- `platform_admin_resolve_renewal_request`

To enable the Audit Trail tab, review and run `supabase/khaavio-superadmin-pwa-migration.sql` in the **same Supabase project**. It only adds a protected read RPC; it does not change business records.

### Restrict the allowlist to the primary account only

The visible Auth screenshot showed the `Hacker KD` account UID as `bfb997b2-e56e-4a80-aa3c-b2870ae18c6b`. Confirm this is still your own UID in Supabase → Authentication → Users.

If you truly want only that account to access *all existing platform-admin RPCs*, review `supabase/optional-lock-admin-to-primary-user.sql` and execute it only after confirming the UID. **It deletes other rows from `platform_admins`**, revoking their admin rights. This is optional but is the intended one-person allowlist configuration. The PWA UI itself is not a security boundary; every protected RPC continues to check the database allowlist.

## 3. Deploy as its own PWA (not to the current Khaavio project)

1. Add the `khaavio-superadmin-pwa` folder to the existing private GitHub repository as a new folder. Do not replace the main Khaavio app files.
2. In Vercel, create a **new project** from the same repository.
3. Set **Root Directory** to `khaavio-superadmin-pwa`.
4. Build command: `npm run build`; output directory: `dist`; install command: `npm install`.
5. Set these Environment Variables on the new Vercel project (Production and Preview only as needed):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
6. Deploy to a distinct origin, for example a new `khaavio-control-*.vercel.app` project domain. The suggested hostname must be available; no URL is reserved by this package.
7. Open the deployment and test login, denied login from a non-admin account, all admin tabs, assignment, renewal action, sign-out and audit feed. Install it from the browser's install icon or menu.

Keeping a distinct origin is what makes the PWA identity/service worker independent. Hosting it only at `/platform-admin` on the main app would not create a separate install identity.

## Security and offline behaviour

- Do not link this app from the public Khaavio homepage or restaurant dashboard.
- No registration endpoint or sign-up UI exists in this project.
- Database RPC allowlisting is authoritative. Hiding a URL is not enough.
- Only static HTML/CSS/JS/icons are cached. Admin data is not cached for offline access; data/actions require a live network.
- If the device is shared, sign out after use and keep the OS account locked.
- The admin actions do not process payment automatically. Activation records manual verification details from the operator.

## Test checklist

- [ ] Missing env displays configuration guidance without crashing.
- [ ] Existing approved admin can sign in.
- [ ] A normal restaurant account receives an access-denied screen and no admin data.
- [ ] Restaurant list/search/status filter and plan assignment work.
- [ ] Renewal queue loads. Test rejection only on a safe test request; test activation only after independently verifying a real payment/test scenario.
- [ ] Audit trail loads after its SQL migration.
- [ ] Refresh and sign out work.
- [ ] Install prompt appears when the browser supports it; app opens in standalone mode.
- [ ] Network tab confirms Supabase API/RPC responses are not served from the service-worker cache.
- [ ] `npm run build` passes before deploying.
