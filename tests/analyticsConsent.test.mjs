import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("GA4 is optional and only enabled through the explicit build-time measurement ID", () => {
  const consent = read("src/components/AnalyticsConsent.jsx");
  const env = read(".env.example");
  assert.match(consent, /VITE_GA4_MEASUREMENT_ID/);
  assert.match(consent, /\/\^G-\[A-Z0-9\]\+\$\/i/);
  assert.match(env, /VITE_GA4_MEASUREMENT_ID/);
});

test("optional analytics is denied by default and loaded only after acceptance", () => {
  const consent = read("src/components/AnalyticsConsent.jsx");
  assert.match(consent, /analytics_storage:\s*["']denied["']/);
  assert.match(consent, /window\.gtag\(["']consent["'], ["']default["']/);
  assert.match(consent, /if \(next === ["']accepted["']\)/);
  assert.match(consent, /if \(next === ["']rejected["']\)/);
  assert.match(consent, /function openPrivacyChoices\(\)[\s\S]*?updateConsent\(["']rejected["']\)/);
  assert.match(consent, /page_path:\s*location\.pathname/);
  assert.doesNotMatch(consent, /page_path:\s*location\.pathname\s*\+\s*location\.search/);
});

test("analytics events do not fire before consent and identify only composer hand-off intent", () => {
  const home = read("src/pages/Home.jsx");
  const contact = read("src/pages/Contact.jsx");
  const helper = read("src/lib/analytics.js");
  assert.match(home, /trackAnalyticsEvent\(["']demo_whatsapp_opened["']\)/);
  assert.match(contact, /trackAnalyticsEvent\(["']contact_email_composer_opened["']\)/);
  assert.match(helper, /typeof window\.gtag !== ["']function["']/);
  assert.doesNotMatch(helper, /email|phone|message|restaurantName/i);
});
