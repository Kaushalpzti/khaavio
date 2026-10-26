import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const bookings = read("../src/pages/BookingsDashboard.jsx");
const serviceRequests = read("../src/pages/ServiceRequestsDashboard.jsx");
const feedback = read("../src/pages/ReviewFeedbackDashboard.jsx");
const voice = read("../src/lib/khaavioVoiceAlerts.js");
const orders = read("../src/pages/OrdersDashboard.jsx");
const kitchen = read("../src/pages/KitchenDisplay.jsx");
const tableSessions = read("../src/pages/TableSessions.jsx");

test("shared voice helper gracefully checks browser speech support and supports cancellation", () => {
  assert.match(voice, /typeof window !== "undefined"/);
  assert.match(voice, /SpeechSynthesisUtterance/);
  assert.match(voice, /synthesis\.speak\(utterance\)/);
  assert.match(voice, /speechSynthesis\.cancel\(\)/);
  assert.match(voice, /startsWith\("hi"\)/);
});

test("Bookings announces new pending requests only after the first load, with opt-in voice", () => {
  assert.match(bookings, /knownBookingIdsRef = useRef\(null\)/);
  assert.match(bookings, /newPendingBookings = newlyAddedBookings\.filter/);
  assert.match(bookings, /voiceEnabledRef\.current && newPendingBookings\.length/);
  assert.match(bookings, /className=\{`bookings-voice-button/);
  assert.match(bookings, /window\.setInterval\([\s\S]*?30_000/);
  assert.doesNotMatch(bookings, /New table booking request from \$\{guestName\}/);
});

test("Service Requests announces newly seen pending requests and has a polling fallback", () => {
  assert.match(serviceRequests, /knownRequestIdsRef/);
  assert.match(serviceRequests, /newlyAddedRequests = previousRequestIds/);
  assert.match(serviceRequests, /Table \$\{tableNumber\} is requesting \$\{voiceMeta\.en\}/);
  assert.match(serviceRequests, /className=\{`service-requests-voice/);
  assert.match(serviceRequests, /30_000/);
});

test("Feedback alerts are opt-in and only announce new ratings, never the private message text", () => {
  assert.match(feedback, /newlyAddedFeedback = previousFeedbackIds/);
  assert.match(feedback, /item\.status === "new"/);
  assert.match(feedback, /voiceEnabledRef\.current && newlyAddedFeedback\.length/);
  assert.match(feedback, /className=\{`review-feedback-voice/);
  assert.doesNotMatch(feedback, /queueKhaavioVoice\([\s\S]{0,240}item\.message/);
});

test("existing Orders and Kitchen voice alerts remain in place; billing page is not given a duplicate alert", () => {
  assert.match(orders, /queueOrdersVoice/);
  assert.match(orders, /toggleVoiceAnnouncements/);
  assert.match(kitchen, /toggleVoiceAnnouncements/);
  assert.match(kitchen, /voiceEnabledRef/);
  assert.doesNotMatch(tableSessions, /khaavioVoiceAlerts|speechSynthesis|Voice announcements/);
});
