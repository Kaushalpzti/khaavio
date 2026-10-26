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
        try {
          const { data: subscription, error: subscriptionError } = await supabase
            .from("restaurant_subscriptions")
            .select("plan_key, status, ends_at, subscription_plans(limits)")
            .eq("restaurant_id", restaurant.id)
            .maybeSingle();
          if (!subscriptionError && subscription) {
            const notExpired = !subscription.ends_at ||
              new Date(subscription.ends_at).getTime() > Date.now();
            bookingVoiceAllowed = notExpired &&
              ["active", "trialing"].includes(subscription.status) &&
              resolvePlanFeatureFlags(subscription).voice_alerts_advanced === true;
          }
        } catch {
          bookingVoiceAllowed = false;
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

        const startedAt = new Date().toISOString();
        const [initialOrders, initialBookings] = await Promise.all([
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
        ]);
        const seenOrderIds = new Set((initialOrders.data || []).map((row) => row.id));
        const seenBookingIds = new Set((initialBookings.data || []).map((row) => row.id));

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
          .subscribe();

        // Polling is a fallback for projects where either table is absent from
        // the Realtime publication. ID tracking prevents repeated announcements.
        pollIntervalId = window.setInterval(async () => {
          if (!active) return;
          try {
            const [ordersResult, bookingsResult] = await Promise.all([
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
            ]);
            if (!active) return;
            if (!ordersResult.error) (ordersResult.data || []).forEach(processOrder);
            if (!bookingsResult.error) (bookingsResult.data || []).forEach(processBooking);
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
