import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { resolvePlanFeatureFlags } from "../lib/planFeatures";
import { useAuthSession } from "./AuthSessionContext";
import {
  readKhaavioAlertPreferences,
  subscribeKhaavioAlertPreferences,
  writeKhaavioAlertPreference,
} from "../lib/khaavioAlertPreferences";
import {
  queueKhaavioVoice,
  playKhaavioAlertSound,
  unlockKhaavioAlertAudio,
  isKhaavioVoiceSupported,
} from "../lib/khaavioVoiceAlerts";

const KhaavioOperationalAlertsContext = createContext(null);

const REQUEST_VOICE_META = {
  waiter: { en: "a waiter", hi: "वेटर" },
  water: { en: "water", hi: "पानी" },
  bill: { en: "the bill", hi: "बिल" },
  cutlery: { en: "plates or cutlery", hi: "प्लेट या कटलरी" },
  other: { en: "assistance", hi: "मदद" },
};

export function useKhaavioOperationalAlerts() {
  const value = useContext(KhaavioOperationalAlertsContext);
  if (!value) {
    throw new Error("useKhaavioOperationalAlerts must be used inside KhaavioOperationalAlertsProvider.");
  }
  return value;
}

export function KhaavioOperationalAlertsProvider({ children }) {
  const { status, userId } = useAuthSession();
  const [preferences, setPreferences] = useState(() => readKhaavioAlertPreferences(userId));
  const preferencesRef = useRef(preferences);

  useEffect(() => {
    setPreferences(readKhaavioAlertPreferences(userId));
    return subscribeKhaavioAlertPreferences(userId, setPreferences);
  }, [userId]);

  useEffect(() => {
    preferencesRef.current = preferences;
  }, [preferences]);

  const setPreference = useCallback((name, value) => {
    setPreferences(writeKhaavioAlertPreference(userId, name, value));
  }, [userId]);

  // Browser autoplay restrictions require an initial user gesture. Unlock the
  // shared context once, without playing a surprise tone. It remains alive
  // across route changes because this provider lives above the route tree.
  useEffect(() => {
    if (status !== "authenticated" || !userId) return undefined;
    let active = true;
    const unlock = () => {
      if (!active || !preferencesRef.current.soundEnabled) return;
      void unlockKhaavioAlertAudio();
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      active = false;
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [status, userId]);

  // A single subscription stays mounted while the restaurant owner navigates
  // between Orders, Bookings, Kitchen and other dashboard routes.
  useEffect(() => {
    if (status !== "authenticated" || !userId) return undefined;

    let active = true;
    let channel = null;
    let pollIntervalId = null;

    async function startMonitoring() {
      try {
        const { data: restaurant, error: restaurantError } = await supabase
          .from("restaurants")
          .select("id, name")
          .eq("owner_id", userId)
          .maybeSingle();

        if (!active || restaurantError || !restaurant?.id) return;

        let bookingVoiceAllowed = false;
        let privateFeedbackAllowed = false;
        try {
          const { data: subscription, error: subscriptionError } = await supabase
            .from("restaurant_subscriptions")
            .select("plan_key, status, ends_at, subscription_plans(limits)")
            .eq("restaurant_id", restaurant.id)
            .maybeSingle();
          if (!subscriptionError && subscription) {
            const notExpired = !subscription.ends_at ||
              new Date(subscription.ends_at).getTime() > Date.now();
            const activeStatus = ["active", "trialing"].includes(subscription.status);
            const flags = resolvePlanFeatureFlags(subscription);
            bookingVoiceAllowed = notExpired && activeStatus && flags.voice_alerts_advanced === true;
            privateFeedbackAllowed = notExpired && activeStatus && flags.private_feedback === true;
          }
        } catch {
          bookingVoiceAllowed = false;
          privateFeedbackAllowed = false;
        }

        if (!active) return;

        const speakOrder = (order) => {
          const settings = preferencesRef.current;
          if (settings.soundEnabled) playKhaavioAlertSound();
          if (!settings.voiceEnabled || !isKhaavioVoiceSupported()) return;
          const total = Math.round(Number(order?.total_amount) || 0);
          void (async () => {
            let tableNumber = "";
            let itemSummary = "";
            try {
              const [tableResult, itemsResult] = await Promise.all([
                order?.table_id
                  ? supabase
                      .from("restaurant_tables")
                      .select("table_number")
                      .eq("restaurant_id", restaurant.id)
                      .eq("id", order.table_id)
                      .maybeSingle()
                  : Promise.resolve({ data: null, error: null }),
                order?.id
                  ? supabase
                      .from("order_items")
                      .select("item_name, quantity")
                      .eq("order_id", order.id)
                      .limit(8)
                  : Promise.resolve({ data: [], error: null }),
              ]);
              if (!tableResult.error) tableNumber = tableResult.data?.table_number || "";
              if (!itemsResult.error) {
                itemSummary = (itemsResult.data || [])
                  .map((item) => `${Number(item.quantity) || 1} ${item.item_name}`)
                  .join(", ");
              }
            } catch {
              // The basic order announcement is still useful without details.
            }
            if (!active || !preferencesRef.current.voiceEnabled) return;
            const tablePhrase = tableNumber ? `Table ${tableNumber}` : "Restaurant";
            queueKhaavioVoice((isHindi) => isHindi
              ? `नया ऑर्डर आया है। ${restaurant.name}। ${tableNumber ? `टेबल ${tableNumber}` : "रेस्टोरेंट"}। ${itemSummary || "नए आइटम"}। कुल बिल ${total} रुपये।`
              : `New order at ${restaurant.name}. ${tablePhrase}. ${itemSummary ? `Items: ${itemSummary}.` : "Please review the order items."} Total ${total} rupees.`);
          })();
        };

        const speakBooking = (booking) => {
          const settings = preferencesRef.current;
          if (bookingVoiceAllowed && settings.soundEnabled) playKhaavioAlertSound();
          if (!bookingVoiceAllowed || !settings.voiceEnabled || !isKhaavioVoiceSupported()) return;
          const guests = Math.max(1, Number(booking?.party_size) || 1);
          const date = booking?.booking_time ? new Date(booking.booking_time) : null;
          const time = date && !Number.isNaN(date.getTime())
            ? new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" }).format(date)
            : "the scheduled time";
          queueKhaavioVoice((isHindi) => isHindi
            ? `${time} पर ${guests} लोगों की नई टेबल बुकिंग रिक्वेस्ट आई है।`
            : `New table booking request for ${guests} guests at ${time}.`);
        };

        const speakServiceRequest = (request) => {
          const settings = preferencesRef.current;
          if (settings.soundEnabled) playKhaavioAlertSound();
          if (!settings.voiceEnabled || !isKhaavioVoiceSupported()) return;
          const meta = REQUEST_VOICE_META[request?.request_type] || REQUEST_VOICE_META.other;
          void (async () => {
            let tableNumber = "";
            try {
              if (request?.table_id) {
                const { data, error } = await supabase
                  .from("restaurant_tables")
                  .select("table_number")
                  .eq("restaurant_id", restaurant.id)
                  .eq("id", request.table_id)
                  .maybeSingle();
                if (!error) tableNumber = data?.table_number || "";
              }
            } catch {
              // The request can still be announced without a table number.
            }
            if (!active || !preferencesRef.current.voiceEnabled) return;
            queueKhaavioVoice((isHindi) => isHindi
              ? `टेबल ${tableNumber || "अनजान"} पर ${meta.hi} का अनुरोध आया है।`
              : `Table ${tableNumber || "unknown"} is requesting ${meta.en}.`);
          })();
        };

        const speakFeedback = (feedback) => {
          if (!privateFeedbackAllowed || feedback?.status !== "new") return;
          const settings = preferencesRef.current;
          if (settings.soundEnabled) playKhaavioAlertSound();
          if (!settings.voiceEnabled || !isKhaavioVoiceSupported()) return;
          const rating = Math.max(0, Math.min(5, Number(feedback?.rating) || 0));
          queueKhaavioVoice((isHindi) => isHindi
            ? `नई ग्राहक प्रतिक्रिया मिली है। पाँच में से ${rating} स्टार की रेटिंग है।`
            : `New customer feedback received. The rating is ${rating} out of five stars.`);
        };

        const startedAt = new Date().toISOString();
        const [initialOrders, initialBookings, initialServiceRequests, initialFeedback] = await Promise.all([
          supabase.from("orders")
            .select("id")
            .eq("restaurant_id", restaurant.id)
            .order("created_at", { ascending: false })
            .limit(100),
          supabase.from("bookings")
            .select("id")
            .eq("restaurant_id", restaurant.id)
            .order("created_at", { ascending: false })
            .limit(100),
          supabase.from("table_service_requests")
            .select("id")
            .eq("restaurant_id", restaurant.id)
            .order("created_at", { ascending: false })
            .limit(150),
          privateFeedbackAllowed
            ? supabase.from("restaurant_feedback")
                .select("id")
                .eq("restaurant_id", restaurant.id)
                .order("created_at", { ascending: false })
                .limit(250)
            : Promise.resolve({ data: [], error: null }),
        ]);
        if (!active) return;
        const seenOrderIds = new Set((initialOrders.data || []).map((row) => row.id));
        const seenBookingIds = new Set((initialBookings.data || []).map((row) => row.id));
        const seenServiceRequestIds = new Set((initialServiceRequests.data || []).map((row) => row.id));
        const seenFeedbackIds = new Set((initialFeedback.data || []).map((row) => row.id));

        const remember = (seen, id) => {
          if (!id || seen.has(id)) return false;
          seen.add(id);
          if (seen.size > 1000) seen.delete(seen.values().next().value);
          return true;
        };
        const processOrder = (order) => {
          if (!active || !remember(seenOrderIds, order?.id)) return;
          speakOrder(order);
        };
        const processBooking = (booking) => {
          if (!active || !remember(seenBookingIds, booking?.id)) return;
          if (booking.status === "pending") speakBooking(booking);
        };
        const processServiceRequest = (request) => {
          if (!active || request?.status !== "pending" || !remember(seenServiceRequestIds, request?.id)) return;
          speakServiceRequest(request);
        };
        const processFeedback = (feedback) => {
          if (!active || !privateFeedbackAllowed || feedback?.status !== "new" || !remember(seenFeedbackIds, feedback?.id)) return;
          speakFeedback(feedback);
        };

        channel = supabase
          .channel(`khaavio-operational-alerts-${restaurant.id}`)
          .on("postgres_changes", {
            event: "INSERT",
            schema: "public",
            table: "orders",
            filter: `restaurant_id=eq.${restaurant.id}`,
          }, (payload) => processOrder(payload.new || {}))
          .on("postgres_changes", {
            event: "INSERT",
            schema: "public",
            table: "bookings",
            filter: `restaurant_id=eq.${restaurant.id}`,
          }, (payload) => processBooking(payload.new || {}))
          .on("postgres_changes", {
            event: "INSERT",
            schema: "public",
            table: "table_service_requests",
            filter: `restaurant_id=eq.${restaurant.id}`,
          }, (payload) => processServiceRequest(payload.new || {}));
        if (privateFeedbackAllowed) {
          channel = channel.on("postgres_changes", {
            event: "INSERT",
            schema: "public",
            table: "restaurant_feedback",
            filter: `restaurant_id=eq.${restaurant.id}`,
          }, (payload) => processFeedback(payload.new || {}));
        }
        channel = channel.subscribe();

        // Polling is a fallback for projects where either table is absent from
        // the Realtime publication. ID tracking prevents repeated announcements.
        pollIntervalId = window.setInterval(async () => {
          if (!active) return;
          try {
            const [ordersResult, bookingsResult, serviceResult, feedbackResult] = await Promise.all([
              supabase.from("orders")
                .select("id, restaurant_id, table_id, total_amount, created_at")
                .eq("restaurant_id", restaurant.id)
                .gte("created_at", startedAt)
                .order("created_at", { ascending: false })
                .limit(100),
              supabase.from("bookings")
                .select("id, restaurant_id, status, party_size, booking_time, created_at")
                .eq("restaurant_id", restaurant.id)
                .gte("created_at", startedAt)
                .order("created_at", { ascending: false })
                .limit(100),
              supabase.from("table_service_requests")
                .select("id, restaurant_id, table_id, request_type, status, created_at")
                .eq("restaurant_id", restaurant.id)
                .gte("created_at", startedAt)
                .order("created_at", { ascending: false })
                .limit(150),
              privateFeedbackAllowed
                ? supabase.from("restaurant_feedback")
                    .select("id, restaurant_id, rating, status, created_at")
                    .eq("restaurant_id", restaurant.id)
                    .gte("created_at", startedAt)
                    .order("created_at", { ascending: false })
                    .limit(250)
                : Promise.resolve({ data: [], error: null }),
            ]);
            if (!active) return;
            if (!ordersResult.error) (ordersResult.data || []).forEach(processOrder);
            if (!bookingsResult.error) (bookingsResult.data || []).forEach(processBooking);
            if (!serviceResult.error) (serviceResult.data || []).forEach(processServiceRequest);
            if (!feedbackResult.error) (feedbackResult.data || []).forEach(processFeedback);
          } catch {
            // Transient polling errors don't stop the Realtime channel.
          }
        }, 15000);
      } catch (error) {
        console.warn("Khaavio operational alerts could not subscribe:", error);
      }
    }

    void startMonitoring();
    return () => {
      active = false;
      if (pollIntervalId) window.clearInterval(pollIntervalId);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [status, userId]);

  const value = { preferences, setPreference };
  return (
    <KhaavioOperationalAlertsContext.Provider value={value}>
      {children}
    </KhaavioOperationalAlertsContext.Provider>
  );
}

export function KhaavioOperationalAlertManager() {
  // Mount this once inside AuthSessionProvider, above <Routes>.
  return null;
}
