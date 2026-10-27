import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const app = read("../src/App.jsx");
const auth = read("../src/context/AuthSessionContext.jsx");
const alerts = read("../src/context/KhaavioOperationalAlertsContext.jsx");
const preferences = read("../src/lib/khaavioAlertPreferences.js");
const voice = read("../src/lib/khaavioVoiceAlerts.js");
const bookings = read("../src/pages/BookingsDashboard.jsx");
const serviceRequests = read("../src/pages/ServiceRequestsDashboard.jsx");
const feedback = read("../src/pages/ReviewFeedbackDashboard.jsx");
const orders = read("../src/pages/OrdersDashboard.jsx");
const kitchen = read("../src/pages/KitchenDisplay.jsx");
const tableSessions = read("../src/pages/TableSessions.jsx");

test("shared voice helper checks speech support and has a persistent louder sound helper", () => {
  assert.match(voice, /typeof window !== "undefined"/);
  assert.match(voice, /SpeechSynthesisUtterance/);
  assert.match(voice, /synthesis\.speak\(utterance\)/);
  assert.match(voice, /speechSynthesis\.cancel\(\)/);
  assert.match(voice, /startsWith\("hi"\)/);
  assert.match(voice, /unlockKhaavioAlertAudio/);
  assert.match(voice, /playKhaavioAlertSound/);
  assert.match(voice, /frequency\.setValueAtTime/);
});

test("spoken operational alerts default on after login while the separate chime stays opt-in", () => {
  assert.match(preferences, /voiceEnabled: true/);
  assert.match(preferences, /soundEnabled: false/);
  assert.match(preferences, /sessionStorage/);
  assert.match(preferences, /resetKhaavioAlertPreferences/);
  assert.match(auth, /event === "SIGNED_IN"/);
  assert.match(auth, /resetKhaavioAlertPreferences\(session\.user\.id\)/);
});

test("one app-level alert provider stays mounted above routes", () => {
  assert.match(app, /KhaavioOperationalAlertsProvider/);
  assert.match(alerts, /useAuthSession\(\)/);
  assert.match(alerts, /channel = supabase/);
  assert.match(alerts, /table: "orders"/);
  assert.match(alerts, /table: "bookings"/);
  assert.match(alerts, /table: "table_service_requests"/);
  assert.match(alerts, /table: "restaurant_feedback"/);
  assert.match(alerts, /window\.setInterval\(async/);
  assert.match(alerts, /seenOrderIds/);
  assert.match(alerts, /seenBookingIds/);
});

test("operational voice and sound preference is shared by route controls", () => {
  for (const page of [bookings, serviceRequests, feedback, orders, kitchen]) {
    assert.match(page, /useKhaavioOperationalAlerts/);
    assert.match(page, /preferences\.voiceEnabled/);
    assert.match(page, /setPreference\("voiceEnabled"/);
  }
  assert.match(kitchen, /setPreference\("soundEnabled"/);
  assert.match(kitchen, /activateKhaavioAlertSound/);
  assert.match(bookings, /bookings-voice-button/);
  assert.match(serviceRequests, /service-requests-voice/);
  assert.match(feedback, /review-feedback-voice/);
  assert.match(orders, /orders-voice-button/);
});

test("booking voice is plan-gated and customer feedback speech never exposes private text", () => {
  assert.match(bookings, /hasFeature\("voice_alerts_advanced"\)/);
  assert.match(alerts, /bookingVoiceAllowed/);
  assert.match(alerts, /privateFeedbackAllowed/);
  assert.match(alerts, /New customer feedback received/);
  assert.doesNotMatch(alerts, /queueKhaavioVoice\([\s\S]{0,400}feedback\.message/);
});

test("table sessions does not start a second voice or sound listener", () => {
  assert.doesNotMatch(tableSessions, /khaavioVoiceAlerts|speechSynthesis|Voice announcements/);
});
