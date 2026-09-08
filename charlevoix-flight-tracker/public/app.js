/* Charlevoix Flight Tracker -- browser side.
   Plain JavaScript, no build step: open the folder, run the server, done. */

(() => {
  'use strict';

  const REFRESH_MS = 10000;

  const state = {
    config: null,
    live: [],
    status: null,
    selectedHex: null,
    tab: 'now',
    markers: new Map(),
    map: null,
    homeMarker: null,
  };

  const $ = (id) => document.getElementById(id);
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  /* ---------------- formatting ---------------- */

  const num = (v) => (v === null || v === undefined ? null : Number(v).toLocaleString());

  const feet = (v) => (v === null || v === undefined ? 'unknown' : `${num(Math.round(v))} ft`);

  const miles = (nm) =>
    nm === null || nm === undefined ? 'unknown' : `${(nm / 0.868976).toFixed(nm < 5 ? 1 : 0)} mi`;

  const timeOf = (ts) =>
    new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  const dayOf = (ts) =>
    new Date(ts).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

  function ago(ts) {
    const secs = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (secs < 45) return 'just now';
    if (secs < 90) return 'a minute ago';
    if (secs < 3600) return `${Math.round(secs / 60)} min ago`;
    if (secs < 7200) return 'an hour ago';
    if (secs < 86400) return `${Math.round(secs / 3600)} hours ago`;
    return dayOf(ts);
  }

  /** Owner line, falling back through everything we might know. */
  function ownerLine(a) {
    if (a.owner) {
      // Case the city, but leave the two-letter state alone.
      const place = a.ownerCity
        ? [titleCase(a.ownerCity), a.ownerState].filter(Boolean).join(', ')
        : a.ownerLocation;
      return { text: titleCase(a.owner), where: place ? ` · ${place}` : '' };
    }
    if (a.operator) return { text: titleCase(a.operator), where: ' · from the flight feed' };
    return null;
  }

  // Abbreviations that look wrong in anything but capitals.
  const KEEP_CAPS = new Set([
    'LLC', 'LLP', 'PLLC', 'LP', 'PC', 'PA', 'USA', 'US', 'USAF', 'DBA',
    'II', 'III', 'IV', 'NA', 'AG', 'SA', 'BV', 'NV', 'AB', 'AS', 'GMBH', 'PLC',
  ]);
  // ...and ones the FAA writes in capitals that read better as words.
  const SOFTEN = { INC: 'Inc', CORP: 'Corp', CO: 'Co', LTD: 'Ltd', TRUST: 'Trust', JR: 'Jr', SR: 'Sr' };

  /**
   * The FAA stores owner names in capitals. Soften them for reading without
   * wrecking abbreviations. Only ever applied to names, never to aircraft
   * models -- "PC-12" and "172N" must survive untouched.
   */
  function titleCase(s) {
    if (!s) return s;
    let out = s.replace(/\b[\p{L}'&.-]+\b/gu, (word) => {
      const upper = word.toUpperCase();
      if (KEEP_CAPS.has(upper)) return upper;
      if (SOFTEN[upper]) return SOFTEN[upper];
      return word[0].toUpperCase() + word.slice(1).toLowerCase();
    });
    // The register writes leading articles at the end: "BOEING COMPANY THE".
    out = out.replace(/^(.*?),?\s+The$/i, 'The $1');
    return out;
  }

  /** Manufacturer gets softened; the model designation is left exactly as filed. */
  function aircraftName(a) {
    if (a.manufacturer || a.model) {
      return [a.manufacturer ? titleCase(a.manufacturer) : null, a.model].filter(Boolean).join(' ');
    }
    return a.aircraft ?? a.typeCode ?? null;
  }

  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  const altColor = (a) => {
    if (a.onGround) return 'var(--ground)';
    if (a.altitudeFt === null || a.altitudeFt === undefined) return 'var(--ground)';
    if (a.altitudeFt < 5000) return 'var(--low)';
    if (a.altitudeFt < 20000) return 'var(--mid)';
    return 'var(--high)';
  };

  /* ---------------- map ---------------- */

  function initMap(config) {
    const map = L.map('map', { zoomControl: true, attributionControl: true })
      .setView([config.airport.lat, config.airport.lon], 11);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    L.circleMarker([config.airport.lat, config.airport.lon], {
      radius: 7, color: '#0b63c5', fillColor: '#0b63c5', fillOpacity: 0.9, weight: 2,
    })
      .addTo(map)
      .bindTooltip(`${config.airport.icao} — ${config.airport.name}`, { permanent: false });

    // Rings at 5 and 10 miles from the house, so distances mean something.
    for (const mi of [5, 10]) {
      L.circle([config.home.lat, config.home.lon], {
        radius: mi * 1609.34, color: 'var(--ink-faint)', weight: 1, opacity: 0.35,
        fill: false, dashArray: '4 6',
      }).addTo(map);
    }

    const home = L.marker([config.home.lat, config.home.lon], {
      draggable: true,
      icon: L.divIcon({ className: '', html: '<div class="pin-label">🏠 Home</div>', iconSize: [70, 22], iconAnchor: [35, 11] }),
    }).addTo(map);

    home.bindTooltip('Drag me to your exact address', { direction: 'top' });
    home.on('dragend', async () => {
      const { lat, lng } = home.getLatLng();
      try {
        const res = await fetch('/api/config/home', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ lat, lon: lng }),
        });
        if (!res.ok) throw new Error(await res.text());
        const body = await res.json();
        state.config.home = body.home;
        home.setTooltipContent('Saved. Distances are measured from here.');
        refreshLive();
      } catch {
        home.setTooltipContent('Could not save that position.');
      }
    });

    state.map = map;
    state.homeMarker = home;
  }

  function planeIcon(a, selected) {
    const rotation = a.trackDeg ?? 0;
    const color = altColor(a);
    const size = a.onGround ? 16 : 22;
    const ring = selected ? '<circle cx="12" cy="12" r="11" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".9"/>' : '';
    const svg = `
      <svg width="${size}" height="${size}" viewBox="0 0 24 24" style="color:${color};transform:rotate(${rotation}deg)">
        ${ring}
        <path d="M12 2.2 13.4 9.6 22 13.2v1.9l-8.6-2.4-.5 5.2 2.9 2.1v1.4L12 20.2l-3.8 1.2v-1.4l2.9-2.1-.5-5.2L2 15.1v-1.9l8.6-3.6z"
              fill="currentColor" stroke="rgba(255,255,255,.75)" stroke-width=".6"/>
      </svg>
      <span class="plane-label">${a.registration ?? a.hex.toUpperCase()}</span>`;
    return L.divIcon({ className: 'plane-icon', html: svg, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
  }

  function syncMarkers() {
    if (!state.map) return;
    const seen = new Set();

    for (const a of state.live) {
      seen.add(a.hex);
      const selected = a.hex === state.selectedHex;
      let marker = state.markers.get(a.hex);
      if (marker) {
        marker.setLatLng([a.lat, a.lon]);
        marker.setIcon(planeIcon(a, selected));
      } else {
        marker = L.marker([a.lat, a.lon], { icon: planeIcon(a, selected), riseOnHover: true })
          .addTo(state.map)
          .on('click', () => showDetail(a.hex));
        state.markers.set(a.hex, marker);
      }
      marker.bindTooltip(tooltipHtml(a), { direction: 'top', offset: [0, -12] });
    }

    for (const [hex, marker] of state.markers) {
      if (!seen.has(hex)) {
        marker.remove();
        state.markers.delete(hex);
      }
    }
  }

  function tooltipHtml(a) {
    const owner = ownerLine(a);
    return [
      `<b>${a.registration ?? a.hex.toUpperCase()}</b>`,
      aircraftName(a) ?? '',
      owner ? owner.text : '',
      a.onGround ? 'On the ground' : `${feet(a.altitudeFt)} · ${miles(a.distanceFromHomeNm)} away`,
    ].filter(Boolean).join('<br>');
  }

  /* ---------------- cards ---------------- */

  function liveCard(a) {
    const card = el('button', `card${a.hex === state.selectedHex ? ' is-selected' : ''}`);
    card.type = 'button';

    const top = el('div', 'card-top');
    const tail = el('div', 'tail');
    if (a.registration) tail.textContent = a.registration;
    else {
      tail.appendChild(el('span', 'unknown', `Unknown (${a.hex.toUpperCase()})`));
    }
    top.appendChild(tail);
    top.appendChild(el('div', 'when', a.onGround ? 'On the ground' : miles(a.distanceFromHomeNm)));
    card.appendChild(top);

    const name = aircraftName(a);
    if (name) card.appendChild(el('div', 'card-type', name));

    const owner = ownerLine(a);
    if (owner) {
      const line = el('div', 'card-owner');
      line.appendChild(el('strong', null, owner.text));
      if (owner.where) line.appendChild(el('span', 'where', owner.where));
      card.appendChild(line);
    }

    if (a.viewingHint && !a.onGround) {
      card.appendChild(el('div', 'look', a.viewingHint));
    }

    const facts = el('div', 'facts');
    if (!a.onGround) {
      facts.appendChild(fact('Altitude', feet(a.altitudeFt)));
      if (a.groundSpeedKt !== null) facts.appendChild(fact('Speed', `${Math.round(a.groundSpeedKt)} kt`));
    }
    if (a.atAirport) facts.appendChild(fact('At', state.config.airport.icao));
    if (a.military) {
      const pill = el('span', 'pill military', 'Military');
      facts.appendChild(pill);
    }
    if (facts.childNodes.length) card.appendChild(facts);

    card.addEventListener('click', () => showDetail(a.hex));
    return card;
  }

  function fact(label, value) {
    const span = el('span');
    span.appendChild(document.createTextNode(`${label} `));
    span.appendChild(el('b', null, value));
    return span;
  }

  function eventCard(e) {
    const card = el('button', 'card');
    card.type = 'button';

    const top = el('div', 'card-top');
    const tail = el('div', 'tail', e.registration ?? `Unknown (${e.hex.toUpperCase()})`);
    top.appendChild(tail);
    top.appendChild(el('div', 'when', `${dayOf(e.ts)} · ${timeOf(e.ts)}`));
    card.appendChild(top);

    const pills = el('div', 'facts');
    const kindLabel = { departure: 'Took off', arrival: 'Landed', overflight: 'Passed overhead' }[e.kind];
    pills.appendChild(el('span', `pill ${e.kind}`, kindLabel));
    if (e.confidence === 'likely') {
      const p = el('span', 'pill likely', 'Probable');
      p.title = 'The aircraft was not tracked all the way to the ground, so this is inferred from its flight path.';
      pills.appendChild(p);
    }
    if (e.military) pills.appendChild(el('span', 'pill military', 'Military'));
    card.appendChild(pills);

    const name = aircraftName(e);
    if (name) card.appendChild(el('div', 'card-type', name));

    const owner = ownerLine(e);
    if (owner) {
      const line = el('div', 'card-owner');
      line.appendChild(el('strong', null, owner.text));
      if (owner.where) line.appendChild(el('span', 'where', owner.where));
      card.appendChild(line);
    }

    if (e.kind === 'overflight' && e.closestHomeNm !== null) {
      card.appendChild(el('div', 'facts', `Closest approach: ${miles(e.closestHomeNm)} from the house`));
    }

    card.addEventListener('click', () => showDetail(e.hex, e.registration));
    return card;
  }

  function emptyState(title, body) {
    const wrap = el('div', 'empty');
    wrap.appendChild(el('strong', null, title));
    wrap.appendChild(document.createTextNode(body));
    return wrap;
  }

  function fill(node, children) {
    node.replaceChildren(...(children.length ? children : []));
  }

  /* ---------------- panels ---------------- */

  function renderLive() {
    const list = $('nowList');
    if (!state.live.length) {
      fill(list, [emptyState(
        'Nothing in the sky right now',
        'Quiet skies, or every aircraft in range is out of receiver coverage. This page checks again every few seconds.',
      )]);
      return;
    }
    fill(list, state.live.map(liveCard));
  }

  function renderStatus() {
    const s = state.status;
    const dot = $('statusDot');
    const text = $('statusText');
    if (!s) return;

    if (s.lastError) {
      dot.className = 'dot bad';
      text.textContent = `Live data unavailable — ${s.lastError.split(';')[0]}`;
    } else if (s.lastSuccessAt) {
      dot.className = 'dot ok';
      const n = state.live.length;
      text.textContent = `${n} aircraft in range · ${s.sourceLabel ?? 'live'} · updated ${ago(s.lastSuccessAt)}`;
    } else {
      dot.className = 'dot warn';
      text.textContent = 'Waiting for the first update…';
    }
  }

  async function loadActivity() {
    const days = Number($('activityDays').value);
    const kind = $('activityKind').value;
    const data = await getJson(`/api/activity?days=${days}&kind=${encodeURIComponent(kind)}`);

    const summary = $('activitySummary');
    summary.replaceChildren(
      stat(data.counts.departure ?? 0, 'Takeoffs'),
      stat(data.counts.arrival ?? 0, 'Landings'),
      stat(data.counts.overflight ?? 0, 'Passed over'),
    );

    const list = $('activityList');
    if (!data.events.length) {
      fill(list, [emptyState(
        'No movements recorded yet',
        'The log fills up as the tracker runs. Leave it running and check back later.',
      )]);
      return;
    }
    fill(list, data.events.map(eventCard));
  }

  function stat(n, label) {
    const box = el('div');
    box.appendChild(el('div', 'n', String(n)));
    box.appendChild(el('div', 'l', label));
    return box;
  }

  async function loadHistory() {
    const data = await getJson('/api/stats');

    const chart = $('historyChart');
    const days = data.daily ?? [];
    const peak = Math.max(1, ...days.map((d) => d.departures + d.arrivals));
    fill(chart, days.map((d) => {
      const bar = el('div', 'bar');
      const fillEl = el('div', 'fill');
      fillEl.style.height = `${Math.round(((d.departures + d.arrivals) / peak) * 80)}px`;
      fillEl.title = `${d.day}: ${d.departures} takeoffs, ${d.arrivals} landings`;
      bar.appendChild(fillEl);
      bar.appendChild(el('div', 'lab', d.day.slice(8)));
      return bar;
    }));

    const regulars = $('regularsList');
    if (!data.regulars?.length) {
      fill(regulars, [emptyState('No regulars yet', 'Aircraft show up here once they have used the airport more than once.')]);
    } else {
      fill(regulars, data.regulars.map((r) => {
        const card = el('button', 'card');
        card.type = 'button';
        const top = el('div', 'card-top');
        top.appendChild(el('div', 'tail', r.registration ?? r.hex.toUpperCase()));
        top.appendChild(el('div', 'when', plural(r.movements, 'movement', 'movements')));
        card.appendChild(top);
        const name = aircraftName(r);
        if (name) card.appendChild(el('div', 'card-type', name));
        const owner = ownerLine({ owner: r.owner, ownerLocation: r.ownerLocation });
        if (owner) {
          const line = el('div', 'card-owner');
          line.appendChild(el('strong', null, owner.text));
          if (owner.where) line.appendChild(el('span', 'where', owner.where));
          card.appendChild(line);
        }
        card.appendChild(el('div', 'facts', `Last seen ${ago(r.lastSeen)}`));
        card.addEventListener('click', () => showDetail(r.hex, r.registration));
        return card;
      }));
    }

    const stats = $('statsBlock');
    stats.replaceChildren(
      statBox(data.today.departure + data.today.arrival, 'Movements today'),
      statBox(data.week.departure + data.week.arrival, 'This week'),
      statBox(data.aircraftKnown, 'Aircraft seen'),
      statBox(data.registryLoaded ?? data.registryRows, 'Owners on file'),
    );
  }

  function statBox(value, label) {
    const box = el('div');
    box.appendChild(el('b', null, (value ?? 0).toLocaleString()));
    box.appendChild(document.createTextNode(label));
    return box;
  }

  let searchTimer = null;
  function onSearchInput() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, 250);
  }

  async function runSearch() {
    const q = $('searchInput').value.trim();
    const results = $('searchResults');
    if (q.length < 2) {
      fill(results, [emptyState('Search the register', 'Type a tail number like N400CV, or an owner’s name.')]);
      return;
    }
    const data = await getJson(`/api/search?q=${encodeURIComponent(q)}`);
    const cards = [];

    for (const r of data.registry ?? []) {
      const card = el('button', 'card');
      card.type = 'button';
      const top = el('div', 'card-top');
      top.appendChild(el('div', 'tail', r.registration));
      if (r.yearManufactured) top.appendChild(el('div', 'when', String(r.yearManufactured)));
      card.appendChild(top);
      const model = aircraftName(r);
      if (model) card.appendChild(el('div', 'card-type', model));
      if (r.owner) {
        const line = el('div', 'card-owner');
        line.appendChild(el('strong', null, titleCase(r.owner)));
        const place = r.ownerCity ? [titleCase(r.ownerCity), r.ownerState].filter(Boolean).join(', ') : r.ownerLocation;
        if (place) line.appendChild(el('span', 'where', ` · ${place}`));
        card.appendChild(line);
      }
      card.addEventListener('click', () => showDetail(r.modeSHex ?? '', r.registration));
      cards.push(card);
    }

    if (!cards.length) {
      const hasRegistry = state.config?.registryLoaded > 0;
      cards.push(emptyState(
        'Nothing found',
        hasRegistry
          ? 'No aircraft or owner matched that. Tail numbers look like N400CV.'
          : 'The FAA owner database has not been downloaded yet. See the README: npm run import-registry.',
      ));
    }
    fill(results, cards);
  }

  /* ---------------- detail sheet ---------------- */

  async function showDetail(hex, reg) {
    state.selectedHex = hex || null;
    syncMarkers();
    renderLive();

    const key = hex || reg;
    if (!key) return;

    $('detail').classList.remove('is-hidden');
    const body = $('detailBody');
    body.replaceChildren(el('p', 'hint', 'Loading…'));

    let data;
    try {
      data = await getJson(`/api/aircraft/${encodeURIComponent(key)}`);
    } catch {
      body.replaceChildren(emptyState('Could not load that aircraft', 'Try again in a moment.'));
      return;
    }

    const r = data.registry ?? {};
    const live = data.live;
    const title = data.registration ?? data.hex.toUpperCase();

    const frag = document.createDocumentFragment();
    const h = el('h2', null, title);
    h.id = 'detailTitle';
    frag.appendChild(h);
    frag.appendChild(el('p', 'subtitle',
      aircraftName(r)
      || data.feed?.description
      || data.feed?.typeCode
      || 'Aircraft type unknown'));

    const rows = el('dl', 'rows');
    const add = (label, value, strong) => {
      if (value === null || value === undefined || value === '') return;
      rows.appendChild(el('dt', null, label));
      rows.appendChild(el('dd', strong ? 'strong' : null, String(value)));
    };

    add('Registered owner', r.owner ? titleCase(r.owner) : null, true);
    add('Owner type', r.ownerType);
    add('Owner location', r.ownerCity ? [titleCase(r.ownerCity), r.ownerState].filter(Boolean).join(', ') : r.ownerLocation);
    add('Year built', r.yearManufactured);
    add('Aircraft type', r.aircraftType);
    add('Engine', [r.engines, r.engineType].filter(Boolean).join(' × '));
    add('Seats', r.seats);
    add('Serial number', r.serialNumber);
    add('Registration status', r.status);
    add('Registration expires', r.registrationExpires);
    add('ICAO address', data.hex.toUpperCase());
    if (data.feed?.operator) add('Operator (feed)', titleCase(data.feed.operator));

    if (live) {
      add('Right now', live.onGround
        ? `On the ground at ${state.config.airport.icao}`
        : `${feet(live.altitudeFt)}, ${Math.round(live.groundSpeedKt ?? 0)} kt`, true);
      add('Distance from home', miles(live.distanceFromHomeNm));
      add('Where to look', live.viewingHint);
      if (live.squawk) add('Squawk', live.squawk);
    }

    if (!r.owner) {
      add('Owner', data.isUsRegistered
        ? 'Not found in the FAA register'
        : 'Not a US-registered aircraft — no FAA owner record');
    }

    frag.appendChild(rows);

    if (data.seenBefore) {
      const section = el('div', 'detail-section');
      section.appendChild(el('h3', null, 'Seen from here'));
      const dl = el('dl', 'rows');
      dl.appendChild(el('dt', null, 'First seen'));
      dl.appendChild(el('dd', null, dayOf(data.seenBefore.firstSeen)));
      dl.appendChild(el('dt', null, 'Last seen'));
      dl.appendChild(el('dd', null, ago(data.seenBefore.lastSeen)));
      dl.appendChild(el('dt', null, 'Separate visits'));
      dl.appendChild(el('dd', null, String(data.seenBefore.visits)));
      section.appendChild(dl);
      frag.appendChild(section);
    }

    if (data.history?.length) {
      const section = el('div', 'detail-section');
      section.appendChild(el('h3', null, `Movement log \u2014 ${plural(data.history.length, 'entry', 'entries')}`));
      const log = el('div', 'mini-log');
      for (const e of data.history.slice(0, 25)) {
        const row = el('div');
        const kindLabel = { departure: 'Took off', arrival: 'Landed', overflight: 'Passed overhead' }[e.kind];
        row.appendChild(el('span', null, `${kindLabel}${e.confidence === 'likely' ? ' (probable)' : ''}`));
        row.appendChild(el('span', 'when', `${dayOf(e.ts)} ${timeOf(e.ts)}`));
        log.appendChild(row);
      }
      section.appendChild(log);
      frag.appendChild(section);
    }

    if (!r.owner && data.isUsRegistered && !state.config?.registryLoaded) {
      frag.appendChild(el('div', 'notice',
        'Owner names come from the FAA aircraft register, which has not been downloaded yet. Run "npm run import-registry" once to fill this in.'));
    }

    body.replaceChildren(frag);
  }

  function hideDetail() {
    $('detail').classList.add('is-hidden');
  }

  /* ---------------- plumbing ---------------- */

  async function getJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json();
  }

  async function refreshLive() {
    try {
      const data = await getJson('/api/live');
      state.live = data.aircraft;
      state.status = data.status;
    } catch {
      state.status = { ...(state.status ?? {}), lastError: 'the tracker is not responding' };
    }
    renderStatus();
    if (state.tab === 'now') renderLive();
    syncMarkers();
  }

  function selectTab(name) {
    state.tab = name;
    for (const tab of document.querySelectorAll('.tab')) {
      const active = tab.dataset.tab === name;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
    }
    for (const panel of document.querySelectorAll('.panel')) {
      panel.classList.toggle('is-hidden', panel.id !== `panel-${name}`);
    }
    if (name === 'now') renderLive();
    if (name === 'activity') loadActivity().catch(() => {});
    if (name === 'history') loadHistory().catch(() => {});
    if (name === 'lookup') runSearch().catch(() => {});
  }

  async function start() {
    state.config = await getJson('/api/config');
    $('brandSub').textContent =
      `${state.config.airport.name} (${state.config.airport.icao}) · ${state.config.homeToAirport.nm.toFixed(1)} nm from home`;

    if (state.config.home.approximate) {
      $('nowHint').textContent =
        'Planes are listed closest to your house first. The house pin on the map is a guess — drag it to your address to get accurate distances.';
    }

    initMap(state.config);
    await refreshLive();
    setInterval(refreshLive, REFRESH_MS);
    setInterval(() => { if (state.tab === 'activity') loadActivity().catch(() => {}); }, 60000);

    for (const tab of document.querySelectorAll('.tab')) {
      tab.addEventListener('click', () => selectTab(tab.dataset.tab));
    }
    $('activityDays').addEventListener('change', () => loadActivity().catch(() => {}));
    $('activityKind').addEventListener('change', () => loadActivity().catch(() => {}));
    $('searchInput').addEventListener('input', onSearchInput);
    $('detailClose').addEventListener('click', hideDetail);
    $('detail').addEventListener('click', (e) => { if (e.target.id === 'detail') hideDetail(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideDetail(); });
  }

  start().catch((err) => {
    document.body.innerHTML =
      `<div class="empty" style="padding:60px"><strong>The tracker is not running</strong>Start it with <code>npm start</code>, then reload this page.<br><small>${err.message}</small></div>`;
  });
})();
