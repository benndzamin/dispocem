// Kratak opis uređaja iz user-agent stringa, npr. "iPhone · Safari".
export function parseUserAgent(ua) {
  if (!ua) return "Nepoznat uređaj";

  let os = "Nepoznat sistem";
  if (/iPhone/i.test(ua)) os = "iPhone";
  else if (/iPad/i.test(ua)) os = "iPad";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/Windows/i.test(ua)) os = "Windows";
  else if (/Macintosh|Mac OS X/i.test(ua)) os = "Mac";
  else if (/Linux/i.test(ua)) os = "Linux";

  let browser = "preglednik";
  if (/SamsungBrowser/i.test(ua)) browser = "Samsung Internet";
  else if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera/i.test(ua)) browser = "Opera";
  else if (/Firefox|FxiOS/i.test(ua)) browser = "Firefox";
  else if (/CriOS|Chrome/i.test(ua)) browser = "Chrome";
  else if (/Safari/i.test(ua)) browser = "Safari";

  return `${os} · ${browser}`;
}

// Platforma push pretplate po hostu endpointa.
export function describePushHost(host) {
  if (!host) return "Nepoznato";
  if (host.includes("fcm.googleapis.com")) return "Android / Chrome";
  if (host.includes("push.apple.com")) return "iPhone / Mac (Apple)";
  if (host.includes("mozilla.com")) return "Firefox";
  if (host.includes("notify.windows.com")) return "Windows (Edge)";
  return host;
}

// session_id iz Supabase access tokena (JWT), za povezivanje online
// prisustva sa sesijom (IP, lokacija) u tabu "Aktivnost".
export function sessionIdFromAccessToken(accessToken) {
  try {
    const payload = accessToken.split(".")[1];
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json).session_id ?? null;
  } catch {
    return null;
  }
}
