"use strict";

// Τα IDs είναι δημόσια αναγνωριστικά καναλιών, όχι Write API keys.
// Αντικατάστησε τα placeholders αφού δημιουργηθούν τα δύο κανάλια.
window.WEATHER_APP_CONFIG = Object.freeze({
  weatherChannelId: "2992254",
  airChannelId: "",
  forecastEndpoint: "/api/forecast",
  stationRefreshMs: 180000,
  forecastRefreshMs: 900000,
  historyResults: 60
});

