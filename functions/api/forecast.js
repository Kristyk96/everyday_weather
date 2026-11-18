const LATITUDE = 37.789146;
const LONGITUDE = 20.899583;

function jsonResponse(body, status, extraHeaders) {
  return new Response(JSON.stringify(body), {
    status: status,
    headers: Object.assign(
      {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, max-age=600"
      },
      extraHeaders || {}
    )
  });
}

async function readOpenWeather(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("OpenWeather HTTP " + response.status);
  }
  return response.json();
}

export async function onRequestGet(context) {
  const apiKey = context.env.OPENWEATHER_API_KEY;
  if (!apiKey) {
    return jsonResponse(
      { error: "Το OPENWEATHER_API_KEY δεν έχει ρυθμιστεί." },
      500
    );
  }

  const common =
    "lat=" + LATITUDE +
    "&lon=" + LONGITUDE +
    "&units=metric&lang=el&appid=" +
    encodeURIComponent(apiKey);

  const currentUrl =
    "https://api.openweathermap.org/data/2.5/weather?" + common;
  const forecastUrl =
    "https://api.openweathermap.org/data/2.5/forecast?" + common;

  try {
    const results = await Promise.all([
      readOpenWeather(currentUrl),
      readOpenWeather(forecastUrl)
    ]);
    const current = results[0];
    const forecast = results[1];
    const currentWeather =
      Array.isArray(current.weather) ? current.weather[0] : {};

    const forecastItems = Array.isArray(forecast.list)
      ? forecast.list.slice(0, 8).map(function (item) {
          const weather =
            Array.isArray(item.weather) ? item.weather[0] : {};
          return {
            timestamp: item.dt,
            temperatureC: item.main && item.main.temp,
            feelsLikeC: item.main && item.main.feels_like,
            description: weather.description || "",
            icon: weather.icon || ""
          };
        })
      : [];

    return jsonResponse(
      {
        current: {
          timestamp: current.dt,
          temperatureC: current.main && current.main.temp,
          feelsLikeC: current.main && current.main.feels_like,
          description: currentWeather.description || "",
          icon: currentWeather.icon || "",
          sunrise: current.sys && current.sys.sunrise,
          sunset: current.sys && current.sys.sunset,
          timezoneOffsetSeconds: current.timezone || 0
        },
        forecast: forecastItems
      },
      200
    );
  } catch (error) {
    console.error("OpenWeather request failed", error);
    return jsonResponse(
      { error: "Η πρόγνωση δεν είναι προσωρινά διαθέσιμη." },
      502,
      { "cache-control": "no-store" }
    );
  }
}

