const scope = 'playlist-read-private playlist-read-collaborative user-library-read';
const stateKey = 'spotify_auth_state';
const codeVerifierKey = 'spotify_code_verifier';
const tokenKey = 'spotify_access_token';
const refreshTokenKey = 'spotify_refresh_token';
const expiresKey = 'spotify_expires_at';
const playlistLinkKey = 'spotify_playlist_link';

// Derived from the current URL so it works on any host (localhost, GitHub Pages, custom domain)
const redirectUri = window.location.href.split('?')[0];

const loginButton = document.getElementById('login-button');
const demoButton = document.getElementById('demo-button');
const coverflowTrack = document.getElementById('coverflow-track');
const status = document.getElementById('status');
const selectedInfo = document.getElementById('selected-info');
const playlistLinkInput = document.getElementById('playlist-link');
const loadPlaylistButton = document.getElementById('load-playlist');
const landing = document.getElementById('landing');
const player = document.getElementById('player');
const menuBtn = document.getElementById('menu-btn');
const menuPanel = document.getElementById('menu-panel');
const disconnectBtn = document.getElementById('disconnect-btn');

const appState = {
  accessToken: localStorage.getItem(tokenKey) || '',
  refreshToken: localStorage.getItem(refreshTokenKey) || '',
  expiresAt: Number(localStorage.getItem(expiresKey) || 0),
  items: [],
  activeIndex: 0,
};

let loadGeneration = 0;
const RENDER_WINDOW = 8;

// Wipe any playlist stored from old versions — liked tracks is now the default.
localStorage.removeItem(playlistLinkKey);
let playlistLink = null;

function createArtworkDataUrl(title, artist, fromColor, toColor) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${fromColor}" />
          <stop offset="100%" stop-color="${toColor}" />
        </linearGradient>
      </defs>
      <rect width="600" height="600" fill="url(#g)" />
      <circle cx="470" cy="140" r="120" fill="rgba(255,255,255,0.16)" />
      <circle cx="150" cy="470" r="160" fill="rgba(0,0,0,0.18)" />
      <text x="50%" y="46%" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="34" font-weight="700" fill="white">${title}</text>
      <text x="50%" y="57%" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="22" fill="rgba(255,255,255,0.86)">${artist}</text>
    </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

const fallbackPlaylistItems = [
  { name: 'Midnight Drive',  artists: [{ name: 'Nova Lane' }],   album: { name: 'Neon Echoes',    images: [{ url: createArtworkDataUrl('Midnight Drive',  'Nova Lane',   '#ff4d67', '#6d2bd9') }] } },
  { name: 'Golden Hour',     artists: [{ name: 'Mira Sol' }],    album: { name: 'Sunlit Static',  images: [{ url: createArtworkDataUrl('Golden Hour',     'Mira Sol',    '#ff9f43', '#ff5f6d') }] } },
  { name: 'Velvet Skyline',  artists: [{ name: 'Theo Vale' }],   album: { name: 'Afterglow',      images: [{ url: createArtworkDataUrl('Velvet Skyline',  'Theo Vale',   '#4facfe', '#00f2fe') }] } },
  { name: 'Crystal Tide',    artists: [{ name: 'Lina Brooks' }], album: { name: 'Blue Static',    images: [{ url: createArtworkDataUrl('Crystal Tide',    'Lina Brooks', '#11998e', '#38ef7d') }] } },
  { name: 'Paper Moon',      artists: [{ name: 'Eli Rowan' }],   album: { name: 'Soft Noise',     images: [{ url: createArtworkDataUrl('Paper Moon',      'Eli Rowan',   '#8e44ad', '#3498db') }] } },
  { name: 'Neon Orchard',    artists: [{ name: 'June Hart' }],   album: { name: 'Bloom',          images: [{ url: createArtworkDataUrl('Neon Orchard',    'June Hart',   '#f7971e', '#ffd200') }] } },
  { name: 'Solar Drift',     artists: [{ name: 'Asha Reed' }],   album: { name: 'Prism',          images: [{ url: createArtworkDataUrl('Solar Drift',     'Asha Reed',   '#f953c6', '#b91d73') }] } },
  { name: 'Frozen Lake',     artists: [{ name: 'Cael North' }],  album: { name: 'White Noise',    images: [{ url: createArtworkDataUrl('Frozen Lake',     'Cael North',  '#56ccf2', '#2f80ed') }] } },
  { name: 'Ember Coast',     artists: [{ name: 'Ryn Avery' }],   album: { name: 'Dusk Signal',    images: [{ url: createArtworkDataUrl('Ember Coast',     'Ryn Avery',   '#f12711', '#f5af19') }] } },
  { name: 'Deep Current',    artists: [{ name: 'Sable Fox' }],   album: { name: 'Undertow',       images: [{ url: createArtworkDataUrl('Deep Current',    'Sable Fox',   '#0f3443', '#34e89e') }] } },
  { name: 'Ultraviolet',     artists: [{ name: 'Lyra Voss' }],   album: { name: 'Phase Shift',    images: [{ url: createArtworkDataUrl('Ultraviolet',     'Lyra Voss',   '#4776e6', '#8e54e9') }] } },
  { name: 'Terra Nova',      artists: [{ name: 'Finn Marsh' }],  album: { name: 'Ground Floor',   images: [{ url: createArtworkDataUrl('Terra Nova',      'Finn Marsh',  '#56ab2f', '#a8e063') }] } },
  { name: 'Rose Static',     artists: [{ name: 'Vera Cole' }],   album: { name: 'Crimson Air',    images: [{ url: createArtworkDataUrl('Rose Static',     'Vera Cole',   '#ed213a', '#93291e') }] } },
  { name: 'Coral Bloom',     artists: [{ name: 'Isla Vane' }],   album: { name: 'Tropics',        images: [{ url: createArtworkDataUrl('Coral Bloom',     'Isla Vane',   '#ff6a88', '#ff99ac') }] } },
  { name: 'Storm Glass',     artists: [{ name: 'Kaspar Nile' }], album: { name: 'Weather System', images: [{ url: createArtworkDataUrl('Storm Glass',     'Kaspar Nile', '#373b44', '#4286f4') }] } },
];

function updatePlaylistLink(nextLink) {
  if (!nextLink) return;
  const normalized = nextLink.trim();
  if (!normalized) return;
  playlistLink = normalized;
  localStorage.setItem(playlistLinkKey, normalized);
}

function clearPlaylistLink() {
  playlistLink = null;
  localStorage.removeItem(playlistLinkKey);
}

function extractPlaylistId(link) {
  if (!link) return null;
  const uri = link.trim();

  if (uri.startsWith('spotify:playlist:')) return uri.split(':')[2] || null;

  if (uri.startsWith('spotify:')) {
    const parts = uri.split(':').filter(Boolean);
    const idx = parts.indexOf('playlist');
    if (idx >= 0 && parts.length > idx + 1) return parts[idx + 1];
  }

  try {
    const url = new URL(uri);
    if (url.hostname.includes('spotify.com')) {
      const parts = url.pathname.split('/').filter(Boolean);
      const idx = parts.indexOf('playlist');
      if (idx >= 0 && parts.length > idx + 1) return parts[idx + 1];
    }
  } catch {
    // not a URL
  }

  if (/^[A-Za-z0-9]{22}$/.test(uri)) return uri;
  return null;
}

function showLanding() {
  if (landing) landing.hidden = false;
  if (player) player.hidden = true;
}

function showPlayer() {
  if (landing) landing.hidden = true;
  if (player) player.hidden = false;
}

let statusTimer;
function setStatus(message) {
  if (!status) return;
  status.textContent = message;
  clearTimeout(statusTimer);
  if (message) statusTimer = setTimeout(() => { status.textContent = ''; }, 5000);
}

function loadFallbackPlaylist(reason) {
  showPlayer();
  appState.items = fallbackPlaylistItems.map((track) => ({ ...track }));
  renderCoverflow();
  setStatus(reason || 'Loaded the built-in playlist.');
}

async function readJsonOrText(response) {
  if (!response) return { error: { message: 'No response received.' } };
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return response.json();
  const text = await response.text();
  try { return JSON.parse(text); } catch { return { error: { message: text || 'No response body.' } }; }
}

async function fetchSpotifyJson(url, options, fallbackMessage) {
  try {
    const response = await fetch(url, options);
    const payload = await readJsonOrText(response);
    return { response, payload };
  } catch (error) {
    console.error(error);
    setStatus(`${fallbackMessage}: ${error.message || 'Network request failed.'}`);
    return { error };
  }
}

function describeSpotifyError(payload, fallback) {
  if (payload?.error?.message) return `${fallback}: ${payload.error.message}`;
  if (typeof payload === 'string') return `${fallback}: ${payload}`;
  return fallback;
}

function storeToken(tokenPayload) {
  appState.accessToken = tokenPayload.access_token;
  appState.refreshToken = tokenPayload.refresh_token || appState.refreshToken;
  appState.expiresAt = Date.now() + tokenPayload.expires_in * 1000;
  localStorage.setItem(tokenKey, appState.accessToken);
  if (appState.refreshToken) localStorage.setItem(refreshTokenKey, appState.refreshToken);
  localStorage.setItem(expiresKey, String(appState.expiresAt));
}

function clearToken() {
  appState.accessToken = '';
  appState.refreshToken = '';
  appState.expiresAt = 0;
  localStorage.removeItem(tokenKey);
  localStorage.removeItem(refreshTokenKey);
  localStorage.removeItem(expiresKey);
}

function generateRandomString(length) {
  const values = new Uint8Array(length);
  crypto.getRandomValues(values);
  return Array.from(values, (byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, length);
}

async function createCodeChallenge(codeVerifier) {
  const data = new TextEncoder().encode(codeVerifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function getAuthUrl() {
  const state = generateRandomString(16);
  const codeVerifier = generateRandomString(64);
  const challenge = await createCodeChallenge(codeVerifier);

  sessionStorage.setItem(stateKey, state);
  sessionStorage.setItem(codeVerifierKey, codeVerifier);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope,
    redirect_uri: redirectUri,
    state,
    code_challenge_method: 'S256',
    code_challenge: challenge,
  });

  window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

async function startLogin() {
  if (appState.accessToken && Date.now() < appState.expiresAt) {
    showPlayer();
    await loadDefaultContent();
    return;
  }
  await getAuthUrl();
}

async function exchangeCode(code, state) {
  const expectedState = sessionStorage.getItem(stateKey);
  if (!expectedState || expectedState !== state) {
    setStatus('Authentication failed: state mismatch.');
    return;
  }

  const codeVerifier = sessionStorage.getItem(codeVerifierKey);
  const { response, payload: tokenPayload, error } = await fetchSpotifyJson(
    'https://accounts.spotify.com/api/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        code_verifier: codeVerifier || '',
      }),
    },
    'Unable to complete Spotify sign-in.'
  );

  if (error || !response) return;

  if (!response.ok) {
    console.error(tokenPayload);
    setStatus(describeSpotifyError(tokenPayload, 'Authorization failed.'));
    return;
  }

  storeToken(tokenPayload);
  sessionStorage.removeItem(stateKey);
  sessionStorage.removeItem(codeVerifierKey);
  history.replaceState({}, '', redirectUri);
  await loadDefaultContent();
}

async function refreshAccessToken() {
  if (!appState.refreshToken) return;

  const { response, payload: tokenPayload, error } = await fetchSpotifyJson(
    'https://accounts.spotify.com/api/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: appState.refreshToken,
        client_id: clientId,
      }),
    },
    'Unable to refresh your Spotify session.'
  );

  if (error || !response) return;

  if (!response.ok) {
    console.error(tokenPayload);
    clearToken();
    setStatus(describeSpotifyError(tokenPayload, 'Your session expired. Please sign in again.'));
    return;
  }

  storeToken(tokenPayload);
}

async function ensureToken() {
  if (Date.now() >= appState.expiresAt) await refreshAccessToken();
  return !!appState.accessToken;
}

async function loadPlaylistTracks() {
  if (!appState.accessToken) {
    setStatus('Connect with Spotify to load playlists.');
    return;
  }
  if (!await ensureToken()) {
    setStatus('Session expired — please reconnect.');
    return;
  }

  const playlistId = extractPlaylistId(playlistLink);
  if (!playlistId) {
    setStatus('Invalid playlist URL.');
    return;
  }

  const gen = ++loadGeneration;
  setStatus('Loading playlist…');

  let url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`;
  let firstBatch = true;

  while (url) {
    if (loadGeneration !== gen) return;

    const { response, payload, error } = await fetchSpotifyJson(
      url,
      { headers: { Authorization: `Bearer ${appState.accessToken}` } },
      'Unable to load playlist.'
    );

    if (loadGeneration !== gen) return;

    if (error || !response || !response.ok) {
      const spotifyMsg = payload?.error?.message || '';
      const isNotFound = response?.status === 404 || spotifyMsg.toLowerCase().includes('not found');
      setStatus(isNotFound
        ? 'Playlist not accessible — Spotify editorial playlists (e.g. Top Hits) are blocked by the API. Try a user-created playlist.'
        : spotifyMsg || 'Could not load playlist.');
      return;
    }

    const tracks = payload.items.map((e) => e.track).filter(Boolean);

    if (firstBatch) {
      firstBatch = false;
      appState.items = tracks;
      appState.activeIndex = 0;
      renderCoverflow();
    } else {
      appState.items.push(...tracks);
    }

    setStatus(`${appState.items.length} tracks${payload.next ? '…' : ' loaded.'}`);
    url = payload.next;
  }
}

async function loadLikedTracks() {
  if (!appState.accessToken) {
    loadFallbackPlaylist('');
    return;
  }
  if (!await ensureToken()) {
    loadFallbackPlaylist('Session expired — please reconnect.');
    return;
  }

  const gen = ++loadGeneration;
  appState.items = [];
  appState.activeIndex = 0;
  setStatus('Loading liked tracks…');

  let url = 'https://api.spotify.com/v1/me/tracks?limit=50';
  let firstBatch = true;

  while (url) {
    if (loadGeneration !== gen) return;

    const { response, payload, error } = await fetchSpotifyJson(
      url,
      { headers: { Authorization: `Bearer ${appState.accessToken}` } },
      'Unable to load liked tracks.'
    );

    if (loadGeneration !== gen) return;
    if (error || !response || !response.ok) {
      if (firstBatch) loadFallbackPlaylist('Could not load liked tracks.');
      return;
    }

    appState.items.push(...payload.items.map((e) => e.track).filter(Boolean));
    if (firstBatch) { firstBatch = false; renderCoverflow(); }
    setStatus(`${appState.items.length} tracks${payload.next ? '…' : ' loaded.'}`);
    url = payload.next;
  }
}

async function loadDefaultContent() {
  if (playlistLink) await loadPlaylistTracks();
  else await loadLikedTracks();
}

function createCard(track, index) {
  const article = document.createElement('article');
  article.className = 'cover-card';
  article.dataset.index = String(index);

  const artFrame = document.createElement('div');
  artFrame.className = 'art-frame';

  const img = document.createElement('img');
  const imageUrl = track.album?.images?.[0]?.url || 'https://placehold.co/400x400/png?text=No+Art';
  img.src = imageUrl;
  img.alt = `${track.name} album art`;
  img.loading = index < 6 ? 'eager' : 'lazy';
  img.decoding = 'async';
  img.fetchPriority = index < 3 ? 'high' : 'auto';

  artFrame.append(img);

  const reflection = document.createElement('div');
  reflection.className = 'cover-reflection';
  reflection.style.backgroundImage = `url("${imageUrl}")`;

  article.append(artFrame, reflection);
  article.addEventListener('click', () => selectItem(index));
  return article;
}

function syncVirtualCards() {
  const { activeIndex, items } = appState;
  const total = items.length;
  if (!total) return;

  const start = Math.max(0, activeIndex - RENDER_WINDOW);
  const end   = Math.min(total - 1, activeIndex + RENDER_WINDOW);

  coverflowTrack.querySelectorAll('.cover-card').forEach((card) => {
    const idx = +card.dataset.index;
    if (idx < start || idx > end) card.remove();
  });

  const rendered = new Set();
  coverflowTrack.querySelectorAll('.cover-card').forEach((c) => rendered.add(+c.dataset.index));

  for (let i = start; i <= end; i++) {
    if (!rendered.has(i)) coverflowTrack.appendChild(createCard(items[i], i));
  }
}

function renderCoverflow() {
  coverflowTrack.innerHTML = '';
  if (!appState.items.length) {
    selectedInfo.innerHTML = '<p class="placeholder">No tracks found.</p>';
    return;
  }
  syncVirtualCards();
  updateSelection();
}

function updateSelection() {
  const cards = coverflowTrack.querySelectorAll('.cover-card');
  cards.forEach((card) => {
    const index     = +card.dataset.index;
    const offset    = index - appState.activeIndex;
    const absOffset = Math.abs(offset);
    const sign      = Math.sign(offset);

    let translateX, rotate, scale, z, opacity;

    if (offset === 0) {
      translateX = 0; rotate = 0; scale = 1.0; z = 0; opacity = 1;
    } else {
      rotate     = -sign * 65;
      translateX = sign * (180 + Math.min((absOffset - 1) * 60, 180));
      z          = -(absOffset * 60);
      scale      = Math.max(0.72, 0.92 - (absOffset - 1) * 0.05);
      opacity    = absOffset > 5 ? 0 : 1;
    }

    card.style.setProperty('--translate-x', `${translateX}px`);
    card.style.setProperty('--rotate', `${rotate}deg`);
    card.style.setProperty('--scale', scale.toString());
    card.style.setProperty('--z', `${z}px`);
    card.style.setProperty('--opacity', opacity.toString());
    card.style.zIndex = String(1000 - absOffset * 10);
    card.classList.toggle('is-active', offset === 0);
  });

  const selectedTrack = appState.items[appState.activeIndex];
  if (!selectedTrack) {
    selectedInfo.innerHTML = '<p class="placeholder">Nothing selected yet.</p>';
    return;
  }

  const artistNames = (selectedTrack.artists || []).map((a) => a.name).join(', ');
  const albumName   = selectedTrack.album?.name || 'Unknown album';

  selectedInfo.innerHTML = `
    <p class="track-title">${selectedTrack.name}</p>
    <p class="track-artist">${artistNames}</p>
    <p class="track-album">${albumName}</p>
  `;
}

function selectItem(index) {
  appState.activeIndex = index;
  syncVirtualCards();
  updateSelection();
}

function handleWheel(event) {
  if (!appState.items.length) return;
  event.preventDefault();
  const direction = event.deltaY > 0 ? 1 : -1;
  selectItem((appState.activeIndex + direction + appState.items.length) % appState.items.length);
}

// ── Event listeners ───────────────────────────────────

if (loginButton) loginButton.addEventListener('click', startLogin);

if (demoButton) {
  demoButton.addEventListener('click', () => {
    loadFallbackPlaylist('Demo mode — connect Spotify for your own playlists.');
  });
}

if (loadPlaylistButton && playlistLinkInput) {
  loadPlaylistButton.addEventListener('click', () => {
    const url = playlistLinkInput.value.trim();
    if (!url) return;
    updatePlaylistLink(url);
    playlistLinkInput.value = '';
    if (menuPanel) menuPanel.hidden = true;
    loadPlaylistTracks();
  });

  playlistLinkInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); loadPlaylistButton.click(); }
  });
}

if (coverflowTrack) {
  coverflowTrack.addEventListener('wheel', handleWheel, { passive: false });

  coverflowTrack.addEventListener('keydown', (e) => {
    if (!appState.items.length) return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      selectItem(Math.max(0, appState.activeIndex - 1));
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      selectItem(Math.min(appState.items.length - 1, appState.activeIndex + 1));
    }
  });

  let touchStartX = 0;
  coverflowTrack.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
  }, { passive: true });

  coverflowTrack.addEventListener('touchend', (e) => {
    if (!appState.items.length) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 35) {
      selectItem(dx < 0
        ? Math.min(appState.items.length - 1, appState.activeIndex + 1)
        : Math.max(0, appState.activeIndex - 1));
    }
  }, { passive: true });
}

if (menuBtn && menuPanel) {
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    menuPanel.hidden = !menuPanel.hidden;
  });

  document.addEventListener('click', (e) => {
    if (menuPanel && !menuPanel.hidden && !menuPanel.contains(e.target) && e.target !== menuBtn) {
      menuPanel.hidden = true;
    }
  });
}

if (disconnectBtn) {
  disconnectBtn.addEventListener('click', () => {
    clearToken();
    clearPlaylistLink();
    if (menuPanel) menuPanel.hidden = true;
    showLanding();
    appState.items = [];
    appState.activeIndex = 0;
  });
}

// ── Init ─────────────────────────────────────────────

(async function init() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');
  const error = params.get('error');

  if (error) {
    showLanding();
    setStatus(`Authentication failed: ${error}`);
    return;
  }

  if (code) {
    showPlayer();
    setStatus('Completing sign-in…');
    await exchangeCode(code, state);
    return;
  }

  if (appState.accessToken && Date.now() < appState.expiresAt) {
    showPlayer();
    setStatus(playlistLink ? 'Loading playlist…' : 'Loading liked tracks…');
    await loadDefaultContent();
  } else if (appState.refreshToken) {
    showPlayer();
    setStatus('Refreshing session…');
    await refreshAccessToken();
    await loadDefaultContent();
  } else {
    showLanding();
  }
})();
