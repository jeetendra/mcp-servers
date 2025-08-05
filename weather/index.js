import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "weather-mcp",
  description: "A server to provide weather information for cities",
  version: "1.0.0",
});

server.tool(
  "weather",
  "Get current weather for a city",
  {
    city: z.string().describe("The name of the city to get the weather for"),
  },
  async (input) => {
    const location = await getLanLong(input.city);

    if (!location) {
      return {
        content: [
          {
            type: "text",
            text: `Could not find location for city: ${input.city}`,
          },
        ],
      };
    }

    const weather = await getWeather(location.latitude, location.longitude);

    if (!weather || !weather.current_weather) {
      return {
        content: [
          {
            type: "text",
            text: `No results found for city: ${input.city}`,
          },
        ],
      };
    }

    const weatherDescription = getWeatherDescription(
      weather.current_weather.weathercode
    );

    return {
      content: [
        {
          type: "text",
          text: `Current weather in ${location.name}:\nTemperature: ${weather.current_weather.temperature}°C\nDescription: ${weatherDescription}`,
        },
      ],
    };
  }
);

function getWeatherDescription(code) {
  const descriptions = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    56: "Light freezing drizzle",
    57: "Dense freezing drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    66: "Light freezing rain",
    67: "Heavy freezing rain",
    71: "Slight snow fall",
    73: "Moderate snow fall",
    75: "Heavy snow fall",
    77: "Snow grains",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    85: "Slight snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with slight hail",
    99: "Thunderstorm with heavy hail",
  };
  return descriptions[code] || "Unknown weather condition";
}

async function getLanLong(city) {
  const api = `https://geocoding-api.open-meteo.com/v1/search?name=${city}&count=1`;
  const result = await fetch(api);
  const data = await result.json();
  console.log(data);

  if (!data.results || data.results.length === 0) {
    return null;
  }

  return {
    latitude: data.results[0].latitude,
    longitude: data.results[0].longitude,
    name: data.results[0].name,
  };
}

async function getWeather(lat, long) {
  const api = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${long}&current_weather=true`;
  const result = await fetch(api);
  const data = await result.json();
  console.log(data);
  return data;
}

const transport = new StdioServerTransport();
server.connect(transport).catch((err) => {
  console.error("Failed to connect server:", err);
  process.exit(1);
});
console.log("Server is running and connected");
