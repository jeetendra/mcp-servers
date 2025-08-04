async function getLanLong(city) {
  const api = `https://geocoding-api.open-meteo.com/v1/search?name=${city}&count=1`;
  const result = await fetch(api);
  const data = await result.json();
  console.log(data);
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

getLanLong("Gurgaon")
  .then((location) => getWeather(location.latitude, location.longitude))
  .then((data) => console.log(data))
  .catch((err) => console.log(err));
