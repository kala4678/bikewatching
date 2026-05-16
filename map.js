import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

mapboxgl.accessToken = 'pk.eyJ1Ijoia2FsYTk5IiwiYSI6ImNtcDdxYXJzOTAwYTIycnB6cTA0ZTIxengifQ.HCYHqrLv4YdoyAAgfPsTgQ';

const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/streets-v12',
  center: [-71.09415, 42.36027],
  zoom: 12,
  minZoom: 5,
  maxZoom: 18,
});

const svg = d3.select('#map').select('svg');
let stationFlow = d3
  .scaleQuantize()
  .domain([0, 1])
  .range([0, 0.5, 1]);

function getCoords(station) {
  const point = new mapboxgl.LngLat(+station.lon, +station.lat);

  const { x, y } = map.project(point);

  return {
    cx: x,
    cy: y,
  };
}

function formatTime(minutes) {
  const date = new Date(0, 0, 0, 0, minutes);

  return date.toLocaleString('en-US', {
    timeStyle: 'short',
  });
}

function minutesSinceMidnight(date) {
  return date.getHours() * 60 + date.getMinutes();
}

function filterTripsByTime(trips, timeFilter) {
  if (timeFilter === -1) return trips;

  return trips.filter((trip) => {
    const startedMinutes = minutesSinceMidnight(trip.started_at);

    const endedMinutes = minutesSinceMidnight(trip.ended_at);

    return (
      Math.abs(startedMinutes - timeFilter) <= 60 ||
      Math.abs(endedMinutes - timeFilter) <= 60
    );
  });
}

function computeStationTraffic(stations, trips) {
  const departures = d3.rollup(
    trips,
    (v) => v.length,
    (d) => d.start_station_id
  );

  const arrivals = d3.rollup(
    trips,
    (v) => v.length,
    (d) => d.end_station_id
  );

  return stations.map((station) => {
    const id = station.short_name;

    station.departures = departures.get(id) ?? 0;

    station.arrivals = arrivals.get(id) ?? 0;

    station.totalTraffic =
      station.departures + station.arrivals;

    return station;
  });
}

map.on('load', async () => {

  map.addSource('boston-bike-lanes', {
    type: 'geojson',
    data:
      'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson',
  });

  map.addLayer({
    id: 'bike-lanes',
    type: 'line',
    source: 'boston-bike-lanes',

    paint: {
      'line-color': '#32D400',
      'line-width': 3,
      'line-opacity': 0.4,
    },
  });

  const jsonData = await d3.json(
    'https://dsc106.com/labs/lab07/data/bluebikes-stations.json'
  );

  const trips = await d3.csv(
    'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv',

    (trip) => {
      trip.started_at = new Date(trip.started_at);

      trip.ended_at = new Date(trip.ended_at);

      return trip;
    }
  );

  let stations = computeStationTraffic(
    jsonData.data.stations,
    trips
  );

  const radiusScale = d3
    .scaleSqrt()
    .domain([
      0,
      d3.max(stations, (d) => d.totalTraffic),
    ])
    .range([0, 25]);

  const circles = svg
    .selectAll('circle')
    .data(stations, (d) => d.short_name)
    .enter()
    .append('circle')

    .attr('r', (d) =>
      radiusScale(d.totalTraffic)
    )
      .style('--departure-ratio', (d) =>
    stationFlow(d.departures / d.totalTraffic)
    )

    .each(function (d) {
      d3.select(this)
        .append('title')
        .text(
          `${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`
        );
    });

  function updatePositions() {
    circles
      .attr('cx', (d) => getCoords(d).cx)
      .attr('cy', (d) => getCoords(d).cy);
  }

  function updateScatterPlot(timeFilter) {

    const filteredTrips =
      filterTripsByTime(trips, timeFilter);

    const filteredStations =
      computeStationTraffic(
        stations,
        filteredTrips
      );

    timeFilter === -1
      ? radiusScale.range([0, 25])
      : radiusScale.range([3, 50]);

    circles
  .data(filteredStations, (d) => d.short_name)
  .attr('r', (d) => radiusScale(d.totalTraffic))
  .style('--departure-ratio', (d) =>
    stationFlow(d.departures / d.totalTraffic)
  );
  }

  const timeSlider =
    document.getElementById('time-slider');

  const selectedTime =
    document.getElementById('selected-time');

  const anyTimeLabel =
    document.getElementById('any-time');

  function updateTimeDisplay() {

    const timeFilter =
      Number(timeSlider.value);

    if (timeFilter === -1) {

      selectedTime.textContent = '';

      anyTimeLabel.style.display =
        'block';

    } else {

      selectedTime.textContent =
        formatTime(timeFilter);

      anyTimeLabel.style.display =
        'none';
    }

    updateScatterPlot(timeFilter);
  }

  updatePositions();

  map.on('move', updatePositions);

  map.on('zoom', updatePositions);

  map.on('resize', updatePositions);

  map.on('moveend', updatePositions);

  timeSlider.addEventListener(
    'input',
    updateTimeDisplay
  );

  updateTimeDisplay();
});