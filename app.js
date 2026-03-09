const state = {
  allMosques: [],
  filteredMosques: [],
  markersById: new Map(),
  map: null,
  mapLayerGroup: null,
  userCoords: null,
  userMarker: null,
  geocodeCache: {},
  geocodeQueueStarted: false,
};

const DEFAULT_CENTER = [24.4539, 54.3773]; // Abu Dhabi
const DEFAULT_ZOOM = 8;

const els = {
  searchInput: document.getElementById('searchInput'),
  emirateFilter: document.getElementById('emirateFilter'),
  areaFilter: document.getElementById('areaFilter'),
  minTimeFilter: document.getElementById('minTimeFilter'),
  maxTimeFilter: document.getElementById('maxTimeFilter'),
  ladiesOnlyFilter: document.getElementById('ladiesOnlyFilter'),
  sortFilter: document.getElementById('sortFilter'),
  useLocationBtn: document.getElementById('useLocationBtn'),
  resetFiltersBtn: document.getElementById('resetFiltersBtn'),
  fitAllBtn: document.getElementById('fitAllBtn'),
  statusText: document.getElementById('statusText'),
  geoStatus: document.getElementById('geoStatus'),
  resultCount: document.getElementById('resultCount'),
  resultsList: document.getElementById('resultsList'),
  resultItemTemplate: document.getElementById('resultItemTemplate'),
};

function initMap() {
  state.map = L.map('map', { zoomControl: true }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(state.map);

  state.mapLayerGroup = L.layerGroup().addTo(state.map);
}

function loadCache() {
  try {
    state.geocodeCache = JSON.parse(localStorage.getItem('qiyaam-geocode-cache') || '{}');
  } catch (error) {
    state.geocodeCache = {};
  }
}

function saveCache() {
  localStorage.setItem('qiyaam-geocode-cache', JSON.stringify(state.geocodeCache));
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function timeStringToMinutes(value) {
  if (!value) return null;
  const [hh, mm] = value.split(':').map(Number);
  return (hh * 60) + mm;
}

function minutesToDistanceLabel(meters) {
  if (meters < 1000) return `${Math.round(meters)} m away`;
  return `${(meters / 1000).toFixed(1)} km away`;
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRad = deg => (deg * Math.PI) / 180;
  const earth = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * earth * Math.asin(Math.sqrt(a));
}

function buildPopupHtml(mosque) {
  const detail = mosque.details ? `<p class="popup-detail">${escapeHtml(mosque.details)}</p>` : '';
  const distance = typeof mosque.distanceMeters === 'number'
    ? `<p class="distance-text">${minutesToDistanceLabel(mosque.distanceMeters)}</p>`
    : '';

  return `
    <div>
      <h3 class="popup-title">${escapeHtml(mosque.name)}</h3>
      <p class="popup-meta">${escapeHtml(mosque.area)}, ${escapeHtml(mosque.emirate)} • ${escapeHtml(mosque.qiyaamTime)}</p>
      ${detail}
      ${distance}
      <a class="popup-link" href="${mosque.mapsLink}" target="_blank" rel="noopener noreferrer">Open in Maps</a>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function addOrUpdateMarker(mosque) {
  if (typeof mosque.lat !== 'number' || typeof mosque.lng !== 'number') return;

  let marker = state.markersById.get(mosque.id);
  if (!marker) {
    marker = L.marker([mosque.lat, mosque.lng]);
    marker.addTo(state.mapLayerGroup);
    state.markersById.set(mosque.id, marker);
  } else {
    marker.setLatLng([mosque.lat, mosque.lng]);
  }

  marker.bindPopup(buildPopupHtml(mosque));
  marker.setOpacity(1);
}

function hideAllMarkers() {
  state.markersById.forEach(marker => marker.setOpacity(0));
}

function updateVisibleMarkers() {
  hideAllMarkers();
  const bounds = [];

  state.filteredMosques.forEach(mosque => {
    const marker = state.markersById.get(mosque.id);
    if (marker && typeof mosque.lat === 'number' && typeof mosque.lng === 'number') {
      marker.setOpacity(1);
      bounds.push([mosque.lat, mosque.lng]);
    }
  });

  if (state.userMarker && state.userCoords) {
    bounds.push([state.userCoords.lat, state.userCoords.lng]);
  }

  if (bounds.length > 0) {
    state.map.fitBounds(bounds, { padding: [40, 40] });
  }
}

function populateFilters(mosques) {
  const emirates = [...new Set(mosques.map(item => item.emirate))].sort();
  const areas = [...new Set(mosques.map(item => item.area))].sort();

  for (const emirate of emirates) {
    const option = document.createElement('option');
    option.value = emirate;
    option.textContent = emirate;
    els.emirateFilter.appendChild(option);
  }

  for (const area of areas) {
    const option = document.createElement('option');
    option.value = area;
    option.textContent = area;
    els.areaFilter.appendChild(option);
  }
}

function renderResults() {
  els.resultsList.innerHTML = '';
  els.resultCount.textContent = String(state.filteredMosques.length);

  if (state.filteredMosques.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'status';
    empty.textContent = 'No mosques match the current filters.';
    els.resultsList.appendChild(empty);
    return;
  }

  for (const mosque of state.filteredMosques) {
    const node = els.resultItemTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector('.result-title').textContent = mosque.name;
    node.querySelector('.time-chip').textContent = mosque.qiyaamTime;

    const metaBits = [`${mosque.area}, ${mosque.emirate}`];
    if (typeof mosque.distanceMeters === 'number') metaBits.push(minutesToDistanceLabel(mosque.distanceMeters));
    node.querySelector('.result-meta').textContent = metaBits.join(' • ');

    const detailsText = mosque.details || (mosque.ladiesSection ? 'Ladies section available' : 'No extra details added');
    node.querySelector('.result-details').textContent = detailsText;

    const focusBtn = node.querySelector('.map-focus-btn');
    focusBtn.addEventListener('click', () => {
      if (typeof mosque.lat === 'number' && typeof mosque.lng === 'number') {
        state.map.setView([mosque.lat, mosque.lng], 14);
        const marker = state.markersById.get(mosque.id);
        if (marker) marker.openPopup();
      }
    });

    const mapLink = node.querySelector('.map-link');
    mapLink.href = mosque.mapsLink;

    els.resultsList.appendChild(node);
  }
}

function applyFilters() {
  const search = normalizeText(els.searchInput.value);
  const emirate = els.emirateFilter.value;
  const area = els.areaFilter.value;
  const minTime = timeStringToMinutes(els.minTimeFilter.value);
  const maxTime = timeStringToMinutes(els.maxTimeFilter.value);
  const ladiesOnly = els.ladiesOnlyFilter.checked;
  const sortBy = els.sortFilter.value;

  state.filteredMosques = state.allMosques.filter(mosque => {
    const matchesSearch = !search || [
      mosque.name,
      mosque.area,
      mosque.emirate,
      mosque.details,
      mosque.qiyaamTime,
    ].some(value => normalizeText(value).includes(search));

    const matchesEmirate = !emirate || mosque.emirate === emirate;
    const matchesArea = !area || mosque.area === area;
    const matchesLadies = !ladiesOnly || mosque.ladiesSection;
    const matchesMin = minTime === null || mosque.qiyaamMinutes >= minTime;
    const matchesMax = maxTime === null || mosque.qiyaamMinutes <= maxTime;

    return matchesSearch && matchesEmirate && matchesArea && matchesLadies && matchesMin && matchesMax;
  }).map(item => ({ ...item }));

  if (state.userCoords) {
    state.filteredMosques.forEach(mosque => {
      if (typeof mosque.lat === 'number' && typeof mosque.lng === 'number') {
        mosque.distanceMeters = haversineMeters(
          state.userCoords.lat,
          state.userCoords.lng,
          mosque.lat,
          mosque.lng
        );
      }
    });
  }

  state.filteredMosques.sort((a, b) => {
    switch (sortBy) {
      case 'time-desc':
        return (b.qiyaamMinutes ?? 9999) - (a.qiyaamMinutes ?? 9999);
      case 'distance': {
        const aDistance = typeof a.distanceMeters === 'number' ? a.distanceMeters : Number.POSITIVE_INFINITY;
        const bDistance = typeof b.distanceMeters === 'number' ? b.distanceMeters : Number.POSITIVE_INFINITY;
        if (aDistance !== bDistance) return aDistance - bDistance;
        return (a.qiyaamMinutes ?? 9999) - (b.qiyaamMinutes ?? 9999);
      }
      case 'name-asc':
        return a.name.localeCompare(b.name);
      case 'time-asc':
      default:
        return (a.qiyaamMinutes ?? 9999) - (b.qiyaamMinutes ?? 9999);
    }
  });

  renderResults();
  updateVisibleMarkers();
  updateStatus();
}

function updateStatus() {
  const geocodedCount = state.allMosques.filter(item => typeof item.lat === 'number' && typeof item.lng === 'number').length;
  els.statusText.textContent = `${state.filteredMosques.length} shown • ${geocodedCount}/${state.allMosques.length} mapped`;
}

function attachFilterEvents() {
  [
    els.searchInput,
    els.emirateFilter,
    els.areaFilter,
    els.minTimeFilter,
    els.maxTimeFilter,
    els.ladiesOnlyFilter,
    els.sortFilter,
  ].forEach(el => el.addEventListener('input', applyFilters));

  els.resetFiltersBtn.addEventListener('click', () => {
    els.searchInput.value = '';
    els.emirateFilter.value = '';
    els.areaFilter.value = '';
    els.minTimeFilter.value = '';
    els.maxTimeFilter.value = '';
    els.ladiesOnlyFilter.checked = false;
    els.sortFilter.value = 'time-asc';
    applyFilters();
  });

  els.fitAllBtn.addEventListener('click', updateVisibleMarkers);

  els.useLocationBtn.addEventListener('click', () => {
    if (!navigator.geolocation) {
      els.geoStatus.textContent = 'Geolocation is not supported on this device.';
      return;
    }

    els.geoStatus.textContent = 'Finding your location…';
    navigator.geolocation.getCurrentPosition(
      position => {
        state.userCoords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        if (!state.userMarker) {
          state.userMarker = L.circleMarker([state.userCoords.lat, state.userCoords.lng], {
            radius: 10,
            weight: 3,
            opacity: 1,
            fillOpacity: 0.2,
          }).addTo(state.map);
        } else {
          state.userMarker.setLatLng([state.userCoords.lat, state.userCoords.lng]);
        }

        els.geoStatus.textContent = 'Your location is enabled.';
        applyFilters();
      },
      error => {
        els.geoStatus.textContent = `Location unavailable: ${error.message}`;
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  });
}

function buildGeocodeQuery(mosque) {
  return `${mosque.name}, ${mosque.area}, ${mosque.emirate}, United Arab Emirates`;
}

async function geocodeMosque(mosque) {
  const cacheKey = buildGeocodeQuery(mosque).toLowerCase();
  if (state.geocodeCache[cacheKey]) {
    return state.geocodeCache[cacheKey];
  }

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', buildGeocodeQuery(mosque));
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'ae');

  const response = await fetch(url.toString(), {
    headers: {
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Geocoding failed for ${mosque.name}`);
  }

  const results = await response.json();
  if (!Array.isArray(results) || results.length === 0) return null;

  const hit = {
    lat: Number(results[0].lat),
    lng: Number(results[0].lon),
    displayName: results[0].display_name,
  };

  state.geocodeCache[cacheKey] = hit;
  saveCache();
  return hit;
}

async function geocodeSequentially() {
  if (state.geocodeQueueStarted) return;
  state.geocodeQueueStarted = true;

  for (const mosque of state.allMosques) {
    if (typeof mosque.lat === 'number' && typeof mosque.lng === 'number') continue;

    try {
      const hit = await geocodeMosque(mosque);
      if (hit) {
        mosque.lat = hit.lat;
        mosque.lng = hit.lng;
        mosque.geocodeLabel = hit.displayName;
        addOrUpdateMarker(mosque);
        applyFilters();
      }
    } catch (error) {
      console.warn(error);
    }

    await new Promise(resolve => setTimeout(resolve, 1100));
  }
}

async function bootstrap() {
  initMap();
  loadCache();
  attachFilterEvents();

  const response = await fetch('./data/mosques.json');
  state.allMosques = await response.json();

  for (const mosque of state.allMosques) {
    const cacheHit = state.geocodeCache[buildGeocodeQuery(mosque).toLowerCase()];
    if (cacheHit) {
      mosque.lat = cacheHit.lat;
      mosque.lng = cacheHit.lng;
      mosque.geocodeLabel = cacheHit.displayName;
      addOrUpdateMarker(mosque);
    }
  }

  populateFilters(state.allMosques);
  applyFilters();
  geocodeSequentially();
}

bootstrap().catch(error => {
  console.error(error);
  els.statusText.textContent = 'App failed to load. Please run it through a local web server.';
});
