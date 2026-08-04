import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export default function usePushSubscription(userId) {
  const [supported] = useState(
    () => "serviceWorker" in navigator && "PushManager" in window,
  );
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supported || !userId) return;
    navigator.serviceWorker.ready.then(async (registration) => {
      const existing = await registration.pushManager.getSubscription();
      if (!existing) {
        setSubscribed(false);
        return;
      }

      const json = existing.toJSON();
      const { error: dbError } = await supabase.rpc("claim_push_subscription", {
        p_endpoint: json.endpoint,
        p_p256dh: json.keys.p256dh,
        p_auth: json.keys.auth,
      });
      setSubscribed(!dbError);
    });
  }, [supported, userId]);

  const subscribe = async () => {
    setError("");

    if (!supported) {
      setError("Ovaj browser ne podržava push notifikacije.");
      return;
    }
    if (!userId) {
      setError("Korisnik nije prepoznat (probaj se ponovo ulogovati).");
      return;
    }
    if (!VAPID_PUBLIC_KEY) {
      setError("VAPID ključ nije podešen (VITE_VAPID_PUBLIC_KEY nedostaje).");
      return;
    }

    setLoading(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setError(
          permission === "denied"
            ? "Dozvola za notifikacije je odbijena. Uključi je ručno u podešavanjima sajta (site settings) pa pokušaj ponovo."
            : "Dozvola za notifikacije nije data.",
        );
        setLoading(false);
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      const json = subscription.toJSON();
      const { error: dbError } = await supabase.rpc("claim_push_subscription", {
        p_endpoint: json.endpoint,
        p_p256dh: json.keys.p256dh,
        p_auth: json.keys.auth,
      });
      if (dbError) throw dbError;

      setSubscribed(true);
    } catch (err) {
      console.error("Push pretplata nije uspjela:", err);
      setError(err?.message || "Pretplata nije uspjela iz nepoznatog razloga.");
    } finally {
      setLoading(false);
    }
  };

  const unsubscribe = async () => {
    setError("");
    setLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const { endpoint } = subscription;
        await subscription.unsubscribe();
        await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
      }
      setSubscribed(false);
    } catch (err) {
      console.error("Gašenje push pretplate nije uspjelo:", err);
      setError(err?.message || "Isključivanje nije uspjelo.");
    } finally {
      setLoading(false);
    }
  };

  return { supported, subscribed, loading, error, subscribe, unsubscribe };
}
