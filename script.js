"use strict";

const APP_CONFIG = window.WEATHER_APP_CONFIG || {};
const charts = {
  climate: null,
  wind: null
};

function byId(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const element = byId(id);
  if (element) {
    element.textContent = value;
  }
}

function asNumber(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function fixed(value, digits) {
  return value === null ? "--" : value.toFixed(digits);
}

function validChannelId(value) {
  return /^\d+$/.test(String(value || ""));
}

function setStationStatus(message, state) {
  const element = byId("station-status") || byId("station-updated");
  const mainStatus = document.querySelector(".connection");
  if (mainStatus) {
    mainStatus.textContent = message;
    mainStatus.classList.remove("ok", "error");
    if (state) {
      mainStatus.classList.add(state);
    }
  }
  if (element && element.id === "station-status") {
    element.textContent = message;
  }
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = window.setTimeout(function () {
    controller.abort();
  }, 12000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: "no-store"
    });
    if (!response.ok) {
      throw new Error("HTTP " + response.status);
    }
    return await response.json();
  } finally {
    window.clearTimeout(timeout);
  }
}

function thingSpeakUrl(channelId, results) {
  return (
    "https://api.thingspeak.com/channels/" +
    encodeURIComponent(channelId) +
    "/feeds.json?results=" +
    encodeURIComponent(results)
  );
}

function latestFeed(payload) {
  if (!payload || !Array.isArray(payload.feeds) ||
      payload.feeds.length === 0) {
    return null;
  }
  return payload.feeds[payload.feeds.length - 1];
}

function directionText(degrees) {
  if (degrees === null || degrees < 0 || degrees > 360) {
    return "--";
  }
  const names = ["Β", "ΒΑ", "Α", "ΝΑ", "Ν", "ΝΔ", "Δ", "ΒΔ"];
  const index = Math.round(degrees / 45) % 8;
  return degrees.toFixed(0) + "° " + names[index];
}

function formatFeedTime(isoTime) {
  const date = new Date(isoTime);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }
  return date.toLocaleString("el-GR", {
    dateStyle: "short",
    timeStyle: "short"
  });
}

function renderStation(weatherPayload, airPayload) {
  const weather = latestFeed(weatherPayload);
  const air = latestFeed(airPayload);
  if (!weather) {
    throw new Error("Το κανάλι Weather δεν περιέχει μετρήσεις.");
  }

  const temperature = asNumber(weather.field1);
  const humidity = asNumber(weather.field2);
  const pressure = asNumber(weather.field3);
  const uvIndex = asNumber(weather.field4);
  const windAverage = asNumber(weather.field5);
  const windGust = asNumber(weather.field6);
  const direction = asNumber(weather.field7);
  const rainInterval = asNumber(weather.field8);

  setText("station-temp", fixed(temperature, 1));
  setText("humidity", fixed(humidity, 1));
  setText("pressure", fixed(pressure, 1));
  setText("uv-index", fixed(uvIndex, 1));
  setText("wind-average", fixed(windAverage, 1));
  setText("wind-gust", fixed(windGust, 1));
  setText("wind-direction", directionText(direction));
  setText("rain-interval", fixed(rainInterval, 2));

  if (air) {
    setText("eco2", fixed(asNumber(air.field1), 0));
    setText("tvoc", fixed(asNumber(air.field2), 0));
    setText("rain-total", fixed(asNumber(air.field5), 2));
  } else {
    setText("eco2", "--");
    setText("tvoc", "--");
    setText("rain-total", "--");
  }

  const measuredAt = new Date(weather.created_at);
  setText(
    "station-updated",
    "Τελευταία μέτρηση: " + formatFeedTime(weather.created_at)
  );

  const ageMs = Date.now() - measuredAt.getTime();
  if (Number.isFinite(ageMs) && ageMs > 10 * 60 * 1000) {
    setStationStatus(
      "Ο σταθμός απαντά, αλλά η τελευταία μέτρηση είναι παλαιότερη από 10 λεπτά.",
      "error"
    );
  } else {
    setStationStatus("Ο σταθμός ενημερώθηκε επιτυχώς.", "ok");
  }

  const fireWarning = byId("fire-warning");
  const fireRisk =
    temperature !== null &&
    humidity !== null &&
    windAverage !== null &&
    uvIndex !== null &&
    temperature > 30 &&
    humidity < 30 &&
    windAverage > 30 &&
    uvIndex > 7;
  if (fireWarning) {
    fireWarning.hidden = !fireRisk;
  }
}

function chartLabels(feeds) {
  return feeds.map(function (feed) {
    const date = new Date(feed.created_at);
    return Number.isNaN(date.getTime())
      ? "--"
      : date.toLocaleTimeString("el-GR", {
          hour: "2-digit",
          minute: "2-digit"
        });
  });
}

function chartValues(feeds, fieldName) {
  return feeds.map(function (feed) {
    return asNumber(feed[fieldName]);
  });
}

function commonChartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: "index",
      intersect: false
    },
    plugins: {
      legend: {
        labels: {
          color: "#dcecff"
        }
      }
    },
    scales: {
      x: {
        ticks: {
          color: "#8fa9c2",
          maxTicksLimit: 8
        },
        grid: {
          color: "rgba(255,255,255,0.06)"
        }
      },
      y: {
        position: "left",
        ticks: {
          color: "#8fa9c2"
        },
        grid: {
          color: "rgba(255,255,255,0.06)"
        }
      },
      y1: {
        position: "right",
        ticks: {
          color: "#8fa9c2"
        },
        grid: {
          drawOnChartArea: false
        }
      }
    }
  };
}

function renderCharts(weatherPayload) {
  if (typeof Chart === "undefined") {
    console.warn("Chart.js is not available.");
    return;
  }
  const feeds =
    weatherPayload && Array.isArray(weatherPayload.feeds)
      ? weatherPayload.feeds
      : [];
  if (feeds.length === 0) {
    return;
  }

  const labels = chartLabels(feeds);
  if (charts.climate) {
    charts.climate.destroy();
  }
  if (charts.wind) {
    charts.wind.destroy();
  }

  charts.climate = new Chart(byId("climate-chart"), {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Θερμοκρασία °C",
          data: chartValues(feeds, "field1"),
          borderColor: "#56b4ff",
          backgroundColor: "rgba(86,180,255,0.15)",
          yAxisID: "y",
          tension: 0.25,
          spanGaps: true
        },
        {
          label: "Υγρασία %",
          data: chartValues(feeds, "field2"),
          borderColor: "#62e6d2",
          backgroundColor: "rgba(98,230,210,0.12)",
          yAxisID: "y1",
          tension: 0.25,
          spanGaps: true
        }
      ]
    },
    options: commonChartOptions()
  });

  charts.wind = new Chart(byId("wind-chart"), {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Άνεμος km/h",
          data: chartValues(feeds, "field5"),
          borderColor: "#ffd166",
          backgroundColor: "rgba(255,209,102,0.12)",
          yAxisID: "y",
          tension: 0.25,
          spanGaps: true
        },
        {
          label: "UV index",
          data: chartValues(feeds, "field4"),
          borderColor: "#ff8078",
          backgroundColor: "rgba(255,128,120,0.12)",
          yAxisID: "y1",
          tension: 0.25,
          spanGaps: true
        }
      ]
    },
    options: commonChartOptions()
  });
}

async function loadStationData() {
  if (!validChannelId(APP_CONFIG.weatherChannelId)) {
    setStationStatus(
      "Συμπλήρωσε το weatherChannelId στο config.js.",
      "error"
    );
    return;
  }

  const historyResults = Number.isInteger(APP_CONFIG.historyResults)
    ? APP_CONFIG.historyResults
    : 60;

  try {
    const weatherPromise = fetchJson(
      thingSpeakUrl(APP_CONFIG.weatherChannelId, historyResults)
    );
    const airPromise = validChannelId(APP_CONFIG.airChannelId)
      ? fetchJson(thingSpeakUrl(APP_CONFIG.airChannelId, 1))
      : Promise.resolve({ feeds: [] });

    const payloads = await Promise.all([weatherPromise, airPromise]);
    renderStation(payloads[0], payloads[1]);
    renderCharts(payloads[0]);
  } catch (error) {
    console.error("ThingSpeak request failed", error);
    setStationStatus(
      "Αποτυχία ανάκτησης ThingSpeak: " + error.message,
      "error"
    );
  } finally {
    setText(
      "page-updated",
      "Τελευταίος έλεγχος σελίδας: " +
        new Date().toLocaleTimeString("el-GR", {
          hour: "2-digit",
          minute: "2-digit"
        })
    );
  }
}

function formatUnixTime(timestamp, offsetSeconds) {
  const seconds = Number(timestamp);
  const offset = Number(offsetSeconds) || 0;
  if (!Number.isFinite(seconds)) {
    return "--:--";
  }
  return new Date((seconds + offset) * 1000).toLocaleTimeString(
    "el-GR",
    {
      timeZone: "UTC",
      hour: "2-digit",
      minute: "2-digit"
    }
  );
}

function validWeatherIcon(icon) {
  return /^\d{2}[dn]$/.test(String(icon || ""));
}

function renderForecast(payload) {
  if (!payload || !payload.current) {
    throw new Error("Μη έγκυρη απάντηση πρόγνωσης.");
  }

  const current = payload.current;
  setText(
    "forecast-temp",
    fixed(asNumber(current.temperatureC), 0)
  );
  setText(
    "forecast-feels",
    fixed(asNumber(current.feelsLikeC), 0)
  );
  setText(
    "forecast-description",
    current.description || "Χωρίς περιγραφή"
  );
  setText(
    "sunrise",
    formatUnixTime(
      current.sunrise,
      current.timezoneOffsetSeconds
    )
  );
  setText(
    "sunset",
    formatUnixTime(
      current.sunset,
      current.timezoneOffsetSeconds
    )
  );

  const icon = byId("forecast-icon");
  if (icon && validWeatherIcon(current.icon)) {
    icon.src =
      "https://openweathermap.org/img/wn/" +
      current.icon +
      "@2x.png";
    icon.alt = current.description || "Εικονίδιο καιρού";
    icon.hidden = false;
  }

  const list = byId("forecast-list");
  list.replaceChildren();
  const items = Array.isArray(payload.forecast)
    ? payload.forecast
    : [];

  items.forEach(function (item) {
    const card = document.createElement("article");
    card.className = "forecast-item";

    const time = document.createElement("span");
    time.textContent = formatUnixTime(
      item.timestamp,
      current.timezoneOffsetSeconds
    );
    card.appendChild(time);

    if (validWeatherIcon(item.icon)) {
      const image = document.createElement("img");
      image.src =
        "https://openweathermap.org/img/wn/" +
        item.icon +
        "@2x.png";
      image.alt = item.description || "Εικονίδιο καιρού";
      card.appendChild(image);
    }

    const temperature = document.createElement("strong");
    temperature.textContent =
      fixed(asNumber(item.temperatureC), 0) + " °C";
    card.appendChild(temperature);

    const description = document.createElement("p");
    description.textContent = item.description || "";
    card.appendChild(description);

    list.appendChild(card);
  });
}

async function loadForecast() {
  if (!APP_CONFIG.forecastEndpoint) {
    setText(
      "forecast-status",
      "Συμπλήρωσε το forecastEndpoint στο config.js."
    );
    return;
  }

  try {
    const payload = await fetchJson(APP_CONFIG.forecastEndpoint);
    renderForecast(payload);
    setText(
      "forecast-status",
      "Η πρόγνωση ενημερώθηκε στις " +
        new Date().toLocaleTimeString("el-GR", {
          hour: "2-digit",
          minute: "2-digit"
        }) +
        "."
    );
  } catch (error) {
    console.error("Forecast request failed", error);
    setText(
      "forecast-status",
      "Η πρόγνωση δεν είναι διαθέσιμη: " + error.message
    );
  }
}

function startDashboard() {
  loadStationData();
  loadForecast();

  const stationInterval =
    Number(APP_CONFIG.stationRefreshMs) || 180000;
  const forecastInterval =
    Number(APP_CONFIG.forecastRefreshMs) || 900000;

  window.setInterval(loadStationData, stationInterval);
  window.setInterval(loadForecast, forecastInterval);
}

document.addEventListener("DOMContentLoaded", startDashboard);

