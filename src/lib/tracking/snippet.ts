/**
 * JS-сниппет для вставки на лендинг клиента. Собирает первый touch:
 * UTM/click IDs, referrer, landingUrl, userAgent — отправляет в /api/track.
 *
 * Сниппет отдаётся через GET /api/track/script?k=<trackingKey>.
 * Он:
 * - ставит cookie `_otvid` = UUID visitor id на 2 года
 * - читает URL-параметры utm_*, fbclid, gclid, ttclid
 * - POSTit в /api/track один раз за загрузку (idempotency через memory-flag)
 * - экспортирует `window.OrgTrack` с `visitorId` и `trackingKey` для форм
 */

export type TrackingSnippetOpts = {
  baseUrl: string;     // https://analytics.example.com
  trackingKey: string; // публичный ключ организации
};

export function buildTrackingSnippet({ baseUrl, trackingKey }: TrackingSnippetOpts): string {
  const endpoint = `${baseUrl.replace(/\/$/, "")}/api/track`;
  // Ключ экранируется как JSON-строка, чтобы не сломать разметку при кавычках.
  const keyJson = JSON.stringify(trackingKey);
  const urlJson = JSON.stringify(endpoint);
  return `/* OrgTrack v1 */
(function () {
  if (window.__orgTrackSent) return;
  var KEY = ${keyJson};
  var URL_ = ${urlJson};
  var COOKIE = "_otvid";

  function uuid() {
    // RFC4122 v4
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function getCookie(name) {
    var m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : null;
  }

  function setCookie(name, val, days) {
    var d = new Date();
    d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
    document.cookie =
      name + "=" + encodeURIComponent(val) +
      "; expires=" + d.toUTCString() + "; path=/; SameSite=Lax";
  }

  var visitorId = getCookie(COOKIE);
  if (!visitorId) {
    visitorId = uuid();
    setCookie(COOKIE, visitorId, 730);
  }

  var params = new URLSearchParams(window.location.search);
  function qp(k) { return params.get(k) || undefined; }

  var payload = {
    trackingKey: KEY,
    visitorId: visitorId,
    landingUrl: window.location.href,
    referrer: document.referrer || undefined,
    utmSource:   qp("utm_source"),
    utmMedium:   qp("utm_medium"),
    utmCampaign: qp("utm_campaign"),
    utmTerm:     qp("utm_term"),
    utmContent:  qp("utm_content"),
    fbclid:      qp("fbclid"),
    ttclid:      qp("ttclid"),
    gclid:       qp("gclid"),
    userAgent:   navigator.userAgent
  };

  try {
    // sendBeacon не требует CORS preflight, устойчив к unload.
    var blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
    var ok = navigator.sendBeacon && navigator.sendBeacon(URL_, blob);
    if (!ok) {
      fetch(URL_, {
        method: "POST",
        mode: "cors",
        credentials: "omit",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true
      }).catch(function () {});
    }
  } catch (_e) {}

  window.__orgTrackSent = true;
  window.OrgTrack = {
    visitorId: visitorId,
    trackingKey: KEY
  };
})();`;
}
