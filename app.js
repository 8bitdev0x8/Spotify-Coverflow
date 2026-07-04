const scope = 'playlist-read-private playlist-read-collaborative user-library-read streaming user-read-email user-read-private';
const stateKey = 'spotify_auth_state';
const codeVerifierKey = 'spotify_code_verifier';
const tokenKey = 'spotify_access_token';
const refreshTokenKey = 'spotify_refresh_token';
const expiresKey = 'spotify_expires_at';
const playlistLinkKey = 'spotify_playlist_link';
const clientIdOverrideKey = 'spotify_client_id_override';

// Derived from the current URL so it works on any host (localhost, GitHub Pages, custom domain)
const redirectUri = window.location.href.split('?')[0];

const loginButton = document.getElementById('login-button');
const demoButton = document.getElementById('demo-button');
const coverflowTrack = document.getElementById('coverflow-track');
const status = document.getElementById('status');
const selectedInfo = document.getElementById('selected-info');
const playlistLinkInput = document.getElementById('playlist-link');
const loadPlaylistButton = document.getElementById('load-playlist');
const playlistList = document.getElementById('playlist-list');
const landing = document.getElementById('landing');
const player = document.getElementById('player');
const menuBtn = document.getElementById('menu-btn');
const menuPanel = document.getElementById('menu-panel');
const disconnectBtn = document.getElementById('disconnect-btn');
const clientIdSetup = document.getElementById('clientid-setup');
const clientIdInput = document.getElementById('clientid-input');
const clientIdSaveBtn = document.getElementById('clientid-save');
const miniplayer = document.getElementById('miniplayer');
const miniplayerPrev = document.getElementById('miniplayer-prev');
const miniplayerPlayPause = document.getElementById('miniplayer-playpause');
const miniplayerNext = document.getElementById('miniplayer-next');
const miniplayerSeek = document.getElementById('miniplayer-seek');
const miniplayerTimeCurrent = document.getElementById('miniplayer-time-current');
const miniplayerTimeDuration = document.getElementById('miniplayer-time-duration');
const miniplayerMute = document.getElementById('miniplayer-mute');
const miniplayerVolumeSlider = document.getElementById('miniplayer-volume-slider');
const miniplayerLyricsBtn = document.getElementById('miniplayer-lyrics');
const lyricsView = document.getElementById('lyrics-view');
const lyricsClose = document.getElementById('lyrics-close');
const lyricsTrackTitle = document.getElementById('lyrics-track-title');
const lyricsTrackArtist = document.getElementById('lyrics-track-artist');
const lyricsBody = document.getElementById('lyrics-body');

// config.js (gitignored) defines a `clientId` const when present. On hosts where it wasn't
// deployed, `clientId` is simply never declared — `typeof` is the safe way to probe for that.
function getClientId() {
  if (typeof clientId !== 'undefined' && clientId && clientId !== 'your_spotify_client_id_here') return clientId;
  return localStorage.getItem(clientIdOverrideKey) || '';
}

const appState = {
  accessToken: localStorage.getItem(tokenKey) || '',
  refreshToken: localStorage.getItem(refreshTokenKey) || '',
  expiresAt: Number(localStorage.getItem(expiresKey) || 0),
  items: [],
  activeIndex: 0,
};

let loadGeneration = 0;
const RENDER_WINDOW = 8;

const PLACEHOLDER_ART = 'https://placehold.co/400x400/png?text=No+Art';
const ART_SIZE_CARD = 300;   // side cards, vinyl label, reflection, color sampling
const ART_SIZE_ACTIVE = 640; // front-facing card upgrades to this once settled

// Spotify lists album images largest → smallest; return the smallest rendition
// that still covers targetSize (entries without a width are assumed to fit).
function pickArtUrl(track, targetSize) {
  const images = track?.album?.images || [];
  if (!images.length) return PLACEHOLDER_ART;
  let pick = images[0];
  for (const image of images) {
    if (!image?.url) continue;
    if (!image.width || image.width >= targetSize) pick = image;
  }
  return pick.url || PLACEHOLDER_ART;
}
// How many upcoming tracks to hand the player at once so playback continues
// past the current song. Kept well under Spotify's request-size limits.
const QUEUE_WINDOW = 50;

let sdkReady = false;
let spotifyPlayer = null;
let deviceId = null;
let isSeeking = false;
let progressTimer = null;
let playbackState = { paused: true, position: 0, duration: 0 };
let nowPlayingIndex = -1;
let lastPlayingUri = null;

const volumeKey = 'spotify_player_volume';
let currentVolume = Number(localStorage.getItem(volumeKey) ?? 70);
let volumeBeforeMute = currentVolume || 70;

let lyricsRequestGen = 0;

const volumeIconOn = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M4 9v6h4l5 5V4L8 9H4z"/><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v8.06c1.48-.74 2.5-2.26 2.5-4.03z"/><path d="M14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>';
const volumeIconMuted = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M19 12c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71z"/><path d="M4.27 3 3 4.27 7.73 9H4v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73 4.27 3z"/></svg>';

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
    client_id: getClientId(),
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
  if (!getClientId()) {
    revealClientIdSetup();
    setStatus('Enter your Spotify Client ID below to connect.');
    return;
  }
  await getAuthUrl();
}

function revealClientIdSetup() {
  if (!clientIdSetup) return;
  clientIdSetup.hidden = false;
  if (clientIdInput) clientIdInput.focus();
}

function saveClientId() {
  if (!clientIdInput) return;
  const value = clientIdInput.value.trim();
  if (!value) return;
  localStorage.setItem(clientIdOverrideKey, value);
  if (clientIdSetup) clientIdSetup.hidden = true;
  setStatus('Client ID saved. Click Connect with Spotify to continue.');
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
        client_id: getClientId(),
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
        client_id: getClientId(),
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

  const LIMIT = 50;
  const authHeaders = { headers: { Authorization: `Bearer ${appState.accessToken}` } };

  const first = await fetchSpotifyJson(
    `https://api.spotify.com/v1/me/tracks?limit=${LIMIT}&offset=0`,
    authHeaders,
    'Unable to load liked tracks.'
  );

  if (loadGeneration !== gen) return;
  if (first.error || !first.response || !first.response.ok) {
    loadFallbackPlaylist('Could not load liked tracks.');
    return;
  }

  appState.items = first.payload.items.map((e) => e.track).filter(Boolean);
  renderCoverflow();

  const total = first.payload.total || appState.items.length;
  if (appState.items.length >= total) {
    setStatus(`${appState.items.length} tracks loaded.`);
    return;
  }
  setStatus(`${appState.items.length} / ${total} tracks…`);

  // Fetch the remaining pages concurrently instead of walking `next` serially —
  // a large library loads several times faster. Pages land out of order, so
  // buffer them and append only contiguous runs to keep the coverflow ordered.
  const offsets = [];
  for (let offset = LIMIT; offset < total; offset += LIMIT) offsets.push(offset);

  const pages = new Array(offsets.length);
  let appendedPages = 0;
  let cursor = 0;
  const CONCURRENCY = 4;

  const appendReadyPages = () => {
    while (appendedPages < pages.length && pages[appendedPages] !== undefined) {
      appState.items.push(...pages[appendedPages]);
      appendedPages++;
    }
    const done = appendedPages === pages.length;
    setStatus(done
      ? `${appState.items.length} tracks loaded.`
      : `${appState.items.length} / ${total} tracks…`);
  };

  const worker = async () => {
    while (cursor < offsets.length) {
      const pageIndex = cursor++;
      if (loadGeneration !== gen) return;

      const { response, payload, error } = await fetchSpotifyJson(
        `https://api.spotify.com/v1/me/tracks?limit=${LIMIT}&offset=${offsets[pageIndex]}`,
        authHeaders,
        'Unable to load liked tracks.'
      );

      if (loadGeneration !== gen) return;
      pages[pageIndex] = (error || !response || !response.ok)
        ? []
        : payload.items.map((e) => e.track).filter(Boolean);
      appendReadyPages();
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, offsets.length) }, worker));
}

async function loadDefaultContent() {
  maybeInitPlayer();
  if (playlistLink) await loadPlaylistTracks();
  else await loadLikedTracks();
}

// ── Playlist picker ───────────────────────────────────

let playlistsPromise = null;

function resetPlaylistList() {
  playlistsPromise = null;
  if (playlistList) playlistList.innerHTML = '<p class="placeholder">Connect with Spotify to see your playlists.</p>';
}

function updatePlaylistListSelection() {
  if (!playlistList) return;
  const activeId = extractPlaylistId(playlistLink) || '';
  playlistList.querySelectorAll('.playlist-item').forEach((item) => {
    item.classList.toggle('is-active', item.dataset.playlistId === activeId);
  });
}

function createPlaylistItem({ id, name, imageUrl, meta }) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'playlist-item';
  btn.dataset.playlistId = id;

  const thumb = document.createElement('span');
  thumb.className = 'playlist-thumb';
  if (imageUrl) {
    const img = document.createElement('img');
    img.crossOrigin = 'anonymous';
    img.src = imageUrl;
    img.alt = '';
    img.loading = 'lazy';
    thumb.append(img);
  } else {
    thumb.classList.add('playlist-thumb-liked');
    thumb.textContent = '♥';
  }

  const text = document.createElement('span');
  text.className = 'playlist-item-text';
  const title = document.createElement('span');
  title.className = 'playlist-item-name';
  title.textContent = name;
  text.append(title);
  if (meta) {
    const sub = document.createElement('span');
    sub.className = 'playlist-item-meta';
    sub.textContent = meta;
    text.append(sub);
  }

  btn.append(thumb, text);
  return btn;
}

function renderPlaylistList(playlists) {
  if (!playlistList) return;
  playlistList.innerHTML = '';

  const liked = createPlaylistItem({ id: '', name: 'Liked Songs', meta: 'Your library' });
  liked.addEventListener('click', () => {
    clearPlaylistLink();
    if (menuPanel) menuPanel.hidden = true;
    updatePlaylistListSelection();
    loadLikedTracks();
  });
  playlistList.append(liked);

  playlists.forEach((playlist) => {
    const images = playlist.images || [];
    const item = createPlaylistItem({
      id: playlist.id,
      name: playlist.name || 'Untitled playlist',
      imageUrl: images[images.length - 1]?.url || '',
      meta: Number.isFinite(playlist.tracks?.total) ? `${playlist.tracks.total} tracks` : '',
    });
    item.addEventListener('click', () => {
      updatePlaylistLink(playlist.id);
      if (menuPanel) menuPanel.hidden = true;
      updatePlaylistListSelection();
      loadPlaylistTracks();
    });
    playlistList.append(item);
  });

  updatePlaylistListSelection();
}

async function loadUserPlaylists() {
  if (!playlistList) return;
  if (!await ensureToken()) return;

  playlistList.innerHTML = '<p class="placeholder">Loading playlists…</p>';

  const playlists = [];
  let url = 'https://api.spotify.com/v1/me/playlists?limit=50';

  while (url) {
    const { response, payload, error } = await fetchSpotifyJson(
      url,
      { headers: { Authorization: `Bearer ${appState.accessToken}` } },
      'Unable to load your playlists.'
    );

    if (error || !response || !response.ok) {
      if (!playlists.length) {
        playlistList.innerHTML = '<p class="placeholder">Couldn’t load playlists.</p>';
        throw new Error('playlist fetch failed');
      }
      break;
    }

    playlists.push(...payload.items.filter(Boolean));
    url = payload.next;
  }

  renderPlaylistList(playlists);
}

function ensurePlaylistsLoaded() {
  if (!appState.accessToken) return;
  if (!playlistsPromise) {
    playlistsPromise = loadUserPlaylists().catch((err) => {
      console.error(err);
      playlistsPromise = null; // allow a retry next time the menu opens
    });
  }
}

function createCard(track, index) {
  const article = document.createElement('article');
  article.className = 'cover-card';
  article.dataset.index = String(index);

  const artFrame = document.createElement('div');
  artFrame.className = 'art-frame';

  const img = document.createElement('img');
  // If this cover was already upgraded to full size once, start there directly —
  // recreating the card at low res and re-upgrading causes a visible pop.
  const hiUrl = pickArtUrl(track, ART_SIZE_ACTIVE);
  const imageUrl = hiResLoaded.has(hiUrl) ? hiUrl : pickArtUrl(track, ART_SIZE_CARD);
  // CORS mode keeps the response readable so the service worker can cache it
  // and the ambient color sampler can reuse it without tainting its canvas.
  img.crossOrigin = 'anonymous';
  img.src = imageUrl;
  img.alt = `${track.name} album art`;
  // Virtualization caps live cards to ~17; eager loading avoids the blank
  // pop-in lazy images show while scrolling through the flow.
  img.decoding = 'async';
  img.fetchPriority = Math.abs(index - appState.activeIndex) < 3 ? 'high' : 'auto';

  artFrame.append(img);

  const vinyl = document.createElement('div');
  vinyl.className = 'card-vinyl';
  vinyl.setAttribute('aria-hidden', 'true');
  const vinylDisc = document.createElement('div');
  vinylDisc.className = 'card-vinyl-disc';
  const vinylLabel = document.createElement('span');
  vinylLabel.className = 'card-vinyl-label';
  const vinylArt = document.createElement('img');
  vinylArt.className = 'card-vinyl-art';
  vinylArt.crossOrigin = 'anonymous';
  vinylArt.src = imageUrl;
  vinylArt.alt = '';
  vinylArt.loading = 'lazy';
  vinylLabel.append(vinylArt);
  const vinylHole = document.createElement('span');
  vinylHole.className = 'card-vinyl-hole';
  vinylDisc.append(vinylLabel, vinylHole);
  vinyl.append(vinylDisc);

  const reflection = document.createElement('div');
  reflection.className = 'cover-reflection';
  reflection.style.backgroundImage = `url("${imageUrl}")`;

  article.append(artFrame, vinyl, reflection);
  article.addEventListener('click', () => {
    if (index === appState.activeIndex) playTrackAtIndex(index);
    else selectItem(index);
  });
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

  updateNowPlayingCard();
}

function updateNowPlayingCard() {
  coverflowTrack.querySelectorAll('.cover-card').forEach((card) => {
    card.classList.toggle('is-now-playing', +card.dataset.index === nowPlayingIndex);
  });
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
    refreshMiniplayerButtons();
    scheduleSettledTasks();
    return;
  }

  const artistNames = (selectedTrack.artists || []).map((a) => a.name).join(', ');
  const albumName   = selectedTrack.album?.name || 'Unknown album';

  // textContent (not innerHTML interpolation) so track names containing < or &
  // render correctly.
  selectedInfo.innerHTML = '';
  const titleEl = document.createElement('p');
  titleEl.className = 'track-title';
  titleEl.textContent = selectedTrack.name;
  const artistEl = document.createElement('p');
  artistEl.className = 'track-artist';
  artistEl.textContent = artistNames;
  const albumEl = document.createElement('p');
  albumEl.className = 'track-album';
  albumEl.textContent = albumName;
  selectedInfo.append(titleEl, artistEl, albumEl);

  refreshMiniplayerButtons();
  scheduleSettledTasks();
}

// Debounce the per-selection side work (hi-res art, ambient color, lyrics) so
// flipping quickly through covers doesn't fire network requests for every
// cover passed along the way — only for the one the user settles on.
let settleTimer;
function scheduleSettledTasks() {
  clearTimeout(settleTimer);
  settleTimer = setTimeout(() => {
    upgradeActiveCardArt();
    updateAmbientBackground();
    if (lyricsView && !lyricsView.hidden) fetchLyricsForCurrent();
  }, 160);
}

// Full-size renditions that have finished loading at least once — cards can be
// created straight at this size with no low→high swap.
const hiResLoaded = new Set();

// Swap the front-facing card up to the full-size rendition, preloading AND
// decoding it first so the swap never paints a blank frame.
function upgradeActiveCardArt() {
  const card = coverflowTrack.querySelector('.cover-card.is-active');
  if (!card) return;
  const track = appState.items[+card.dataset.index];
  const img = card.querySelector('.art-frame img');
  if (!track || !img) return;

  const hiUrl = pickArtUrl(track, ART_SIZE_ACTIVE);
  if (!hiUrl || img.src === hiUrl) return;

  img.dataset.hiSrc = hiUrl;
  const pre = new Image();
  pre.crossOrigin = 'anonymous';
  const swap = () => {
    hiResLoaded.add(hiUrl);
    if (img.isConnected && img.dataset.hiSrc === hiUrl) img.src = hiUrl;
  };
  pre.onload = () => {
    if (pre.decode) pre.decode().then(swap).catch(swap);
    else swap();
  };
  pre.src = hiUrl;
}

function selectItem(index) {
  appState.activeIndex = index;
  syncVirtualCards();
  updateSelection();
}

// ── Ambient background ────────────────────────────────

const ambientColorCache = new Map();
let ambientGen = 0;

// Rebalance the sampled color for use as a dark backdrop: exaggerate the hue a
// little, then scale brightness so white text stays readable on top.
function tuneAmbientColor(r, g, b, brightness) {
  const avg = (r + g + b) / 3;
  const SATURATION = 1.6;
  r = avg + (r - avg) * SATURATION;
  g = avg + (g - avg) * SATURATION;
  b = avg + (b - avg) * SATURATION;
  const scale = brightness / Math.max(r, g, b, 1);
  return [r, g, b].map((c) => Math.round(Math.min(255, Math.max(0, c * scale))));
}

function extractAverageColor(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const size = 12;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        let r = 0, g = 0, b = 0;
        const pixels = data.length / 4;
        for (let i = 0; i < data.length; i += 4) {
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
        }
        resolve([r / pixels, g / pixels, b / pixels]);
      } catch (err) {
        reject(err); // tainted canvas (no CORS) — skip the effect for this image
      }
    };
    img.onerror = reject;
    img.src = url;
  });
}

async function updateAmbientBackground() {
  if (!player) return;
  // Always follow the cover the user is looking at; the coverflow itself
  // follows the playing track on track changes, so the backdrop tracks the
  // music without fighting the user's browsing.
  const track = appState.items[appState.activeIndex];
  if (!track) return;
  // Reuse the card-size rendition — it's already in the image cache.
  const url = pickArtUrl(track, ART_SIZE_CARD);
  if (!url) return;

  const gen = ++ambientGen;
  let base = ambientColorCache.get(url);
  if (!base) {
    base = await extractAverageColor(url).catch(() => null);
    if (!base) return;
    ambientColorCache.set(url, base);
  }
  if (gen !== ambientGen) return; // user already moved to another cover

  // Glow brighter while music plays, dimmer while paused or idle.
  const [r, g, b] = tuneAmbientColor(base[0], base[1], base[2], playbackState.paused ? 96 : 132);
  player.style.setProperty('--ambient', `rgb(${r}, ${g}, ${b})`);
}

function resetAmbientBackground() {
  ambientGen++;
  if (player) player.style.removeProperty('--ambient');
}

// ── Miniplayer / Web Playback SDK ─────────────────────

function formatTime(ms) {
  const totalSec = Math.max(0, Math.floor((ms || 0) / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

function refreshMiniplayerButtons() {
  const track = appState.items[appState.activeIndex];
  miniplayerPlayPause.disabled = !track || !track.uri;
  miniplayerPrev.disabled = appState.activeIndex <= 0;
  miniplayerNext.disabled = appState.activeIndex >= appState.items.length - 1;
  miniplayerSeek.disabled = !track || !track.uri;
}

function updateMiniplayerProgress() {
  const { position, duration, paused } = playbackState;
  miniplayerSeek.max = String(duration || 0);
  if (!isSeeking) miniplayerSeek.value = String(position);
  miniplayerTimeCurrent.textContent = formatTime(position);
  miniplayerTimeDuration.textContent = formatTime(duration);
  miniplayerPlayPause.innerHTML = paused ? '&#9654;' : '&#10074;&#10074;';
  miniplayerPlayPause.setAttribute('aria-label', paused ? 'Play' : 'Pause');
  coverflowTrack.classList.toggle('is-playing', !paused);
}

function startProgressTimer() {
  clearInterval(progressTimer);
  progressTimer = setInterval(() => {
    if (playbackState.paused || isSeeking) return;
    playbackState.position = Math.min(playbackState.duration, playbackState.position + 500);
    updateMiniplayerProgress();
  }, 500);
}

// Only tick the progress interval while music is actually playing.
function syncProgressTimer() {
  if (playbackState.paused) {
    clearInterval(progressTimer);
    progressTimer = null;
  } else if (!progressTimer) {
    startProgressTimer();
  }
}

function handlePlayerStateChanged(state) {
  if (!state) {
    playbackState = { paused: true, position: 0, duration: 0 };
    nowPlayingIndex = -1;
    lastPlayingUri = null;
    updateMiniplayerProgress();
    updateNowPlayingCard();
    syncProgressTimer();
    updateAmbientBackground();
    return;
  }

  playbackState = { paused: state.paused, position: state.position, duration: state.duration };

  const currentTrack = state.track_window?.current_track;
  const uri = currentTrack?.uri || null;
  // Spotify may substitute a relinked (region-specific) copy of the requested
  // track, reporting a different URI than the one in the user's library.
  // linked_from carries the originally requested URI — match on either, else
  // the playing card never gets its vinyl/now-playing treatment.
  const linkedUri = currentTrack?.linked_from?.uri || null;
  nowPlayingIndex = (uri || linkedUri)
    ? appState.items.findIndex((t) => t.uri === uri || (linkedUri && t.uri === linkedUri))
    : -1;

  // Re-center the coverflow only when the playing track actually changes
  // (start of playback, auto-advance). The SDK also fires state events for
  // pause/resume/seek and periodically mid-song — those must not yank the
  // user back while they're browsing other covers.
  if (uri !== lastPlayingUri) {
    lastPlayingUri = uri;
    if (nowPlayingIndex >= 0 && nowPlayingIndex !== appState.activeIndex) selectItem(nowPlayingIndex);
  }

  updateMiniplayerProgress();
  updateNowPlayingCard();
  syncProgressTimer();
  updateAmbientBackground();
}

function maybeInitPlayer() {
  if (!sdkReady || spotifyPlayer || !appState.accessToken) return;

  spotifyPlayer = new Spotify.Player({
    name: 'CoverFlow Web Player',
    getOAuthToken: async (callback) => {
      if (!await ensureToken()) return;
      callback(appState.accessToken);
    },
    volume: currentVolume / 100,
  });

  spotifyPlayer.addListener('ready', ({ device_id }) => {
    deviceId = device_id;
  });

  spotifyPlayer.addListener('not_ready', ({ device_id }) => {
    if (deviceId === device_id) deviceId = null;
  });

  spotifyPlayer.addListener('initialization_error', ({ message }) => setStatus(`Playback init failed: ${message}`));
  spotifyPlayer.addListener('authentication_error', ({ message }) => setStatus(`Playback auth failed: ${message}`));
  spotifyPlayer.addListener('account_error', () => setStatus('Spotify Premium is required to play music here.'));
  spotifyPlayer.addListener('playback_error', ({ message }) => setStatus(`Playback error: ${message}`));
  spotifyPlayer.addListener('player_state_changed', handlePlayerStateChanged);

  spotifyPlayer.connect();
}

function teardownPlayer() {
  if (spotifyPlayer) spotifyPlayer.disconnect();
  spotifyPlayer = null;
  deviceId = null;
  clearInterval(progressTimer);
  progressTimer = null;
  playbackState = { paused: true, position: 0, duration: 0 };
  nowPlayingIndex = -1;
  lastPlayingUri = null;
  updateMiniplayerProgress();
  updateNowPlayingCard();
}

async function playTrackAtIndex(index) {
  const track = appState.items[index];
  if (!track || !track.uri) {
    setStatus('This track can’t be streamed (demo track).');
    return;
  }
  if (!deviceId) {
    setStatus('Player still connecting — try again in a moment.');
    return;
  }
  if (!await ensureToken()) {
    setStatus('Session expired — please reconnect.');
    return;
  }

  // Queue the clicked track plus the tracks after it so playback auto-advances
  // instead of stopping at the end of a single song.
  const uris = [];
  for (let i = index; i < appState.items.length && uris.length < QUEUE_WINDOW; i++) {
    if (appState.items[i]?.uri) uris.push(appState.items[i].uri);
  }

  const { response, payload, error } = await fetchSpotifyJson(
    `https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${appState.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ uris }),
    },
    'Unable to start playback.'
  );

  if (error) return;
  if (!response.ok && response.status !== 204) {
    setStatus(response.status === 404
      ? 'No active device — try reloading the page.'
      : describeSpotifyError(payload, 'Could not play track.'));
  }
}

async function togglePlayback() {
  if (!spotifyPlayer) return;
  const state = await spotifyPlayer.getCurrentState();
  if (!state) {
    await playTrackAtIndex(appState.activeIndex);
    return;
  }
  await spotifyPlayer.togglePlay();
}

// ── Volume ─────────────────────────────────────────────

function updateVolumeUi() {
  miniplayerVolumeSlider.value = String(currentVolume);
  miniplayerMute.innerHTML = currentVolume === 0 ? volumeIconMuted : volumeIconOn;
  miniplayerMute.setAttribute('aria-label', currentVolume === 0 ? 'Unmute' : 'Mute');
}

function setVolume(value) {
  currentVolume = Math.min(100, Math.max(0, value));
  localStorage.setItem(volumeKey, String(currentVolume));
  updateVolumeUi();
  if (spotifyPlayer) spotifyPlayer.setVolume(currentVolume / 100);
}

function toggleMute() {
  if (currentVolume > 0) {
    volumeBeforeMute = currentVolume;
    setVolume(0);
  } else {
    setVolume(volumeBeforeMute || 70);
  }
}

// ── Lyrics ─────────────────────────────────────────────

function closeLyrics() {
  lyricsView.hidden = true;
  miniplayerLyricsBtn.classList.remove('is-active');
  if (miniplayer) miniplayer.hidden = false;
}

async function fetchLyricsForCurrent() {
  const track = appState.items[appState.activeIndex];
  if (!track) {
    lyricsTrackTitle.textContent = '—';
    lyricsTrackArtist.textContent = '—';
    lyricsBody.innerHTML = '<p class="placeholder">Select a track to see lyrics.</p>';
    return;
  }

  const artist = (track.artists || [])[0]?.name || '';
  const title = track.name || '';
  lyricsTrackTitle.textContent = title || 'Unknown track';
  lyricsTrackArtist.textContent = artist || 'Unknown artist';
  lyricsBody.innerHTML = '<p class="placeholder">Loading lyrics…</p>';

  const gen = ++lyricsRequestGen;
  try {
    const res = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`);
    const data = await res.json();
    if (gen !== lyricsRequestGen) return;

    if (data?.lyrics) {
      const pre = document.createElement('pre');
      pre.className = 'lyrics-text';
      pre.textContent = data.lyrics.trim();
      lyricsBody.innerHTML = '';
      lyricsBody.appendChild(pre);
    } else {
      lyricsBody.innerHTML = '<p class="placeholder">No lyrics found for this track.</p>';
    }
  } catch (err) {
    if (gen !== lyricsRequestGen) return;
    console.error(err);
    lyricsBody.innerHTML = '<p class="placeholder">Couldn’t load lyrics right now.</p>';
  }
}

function openLyrics() {
  lyricsView.hidden = false;
  miniplayerLyricsBtn.classList.add('is-active');
  if (miniplayer) miniplayer.hidden = true;
  fetchLyricsForCurrent();
}

function toggleLyrics() {
  if (lyricsView.hidden) openLyrics();
  else closeLyrics();
}

// Accumulate wheel deltas instead of stepping per event — trackpads fire dozens
// of small events per flick, which used to skip many covers at once.
let wheelAcc = 0;
let wheelResetTimer;
const WHEEL_STEP = 90;

function handleWheel(event) {
  if (!appState.items.length) return;
  event.preventDefault();

  const delta = event.deltaMode === 1 ? event.deltaY * 33 : event.deltaY;
  if (Math.sign(delta) !== Math.sign(wheelAcc)) wheelAcc = 0; // direction change
  wheelAcc += delta;

  clearTimeout(wheelResetTimer);
  wheelResetTimer = setTimeout(() => { wheelAcc = 0; }, 150);

  const steps = Math.trunc(wheelAcc / WHEEL_STEP);
  if (!steps) return;
  wheelAcc -= steps * WHEEL_STEP;

  const next = Math.min(appState.items.length - 1, Math.max(0, appState.activeIndex + steps));
  if (next !== appState.activeIndex) selectItem(next);
}

// ── Event listeners ───────────────────────────────────

if (loginButton) loginButton.addEventListener('click', startLogin);

if (demoButton) {
  demoButton.addEventListener('click', () => {
    loadFallbackPlaylist('Demo mode — connect Spotify for your own playlists.');
  });
}

if (clientIdSaveBtn && clientIdInput) {
  clientIdSaveBtn.addEventListener('click', saveClientId);
  clientIdInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); saveClientId(); }
  });
}

if (loadPlaylistButton && playlistLinkInput) {
  loadPlaylistButton.addEventListener('click', () => {
    const url = playlistLinkInput.value.trim();
    if (!url) return;
    updatePlaylistLink(url);
    playlistLinkInput.value = '';
    if (menuPanel) menuPanel.hidden = true;
    updatePlaylistListSelection();
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
    if (!menuPanel.hidden) ensurePlaylistsLoaded();
  });

  document.addEventListener('click', (e) => {
    if (menuPanel && !menuPanel.hidden && !menuPanel.contains(e.target) && e.target !== menuBtn) {
      menuPanel.hidden = true;
    }
  });
}

if (disconnectBtn) {
  disconnectBtn.addEventListener('click', () => {
    teardownPlayer();
    clearToken();
    clearPlaylistLink();
    resetPlaylistList();
    resetAmbientBackground();
    if (menuPanel) menuPanel.hidden = true;
    showLanding();
    appState.items = [];
    appState.activeIndex = 0;
  });
}

if (miniplayerPlayPause) miniplayerPlayPause.addEventListener('click', togglePlayback);

if (miniplayerNext) {
  miniplayerNext.addEventListener('click', () => {
    const nextIndex = Math.min(appState.items.length - 1, appState.activeIndex + 1);
    selectItem(nextIndex);
    playTrackAtIndex(nextIndex);
  });
}

if (miniplayerPrev) {
  miniplayerPrev.addEventListener('click', () => {
    const prevIndex = Math.max(0, appState.activeIndex - 1);
    selectItem(prevIndex);
    playTrackAtIndex(prevIndex);
  });
}

if (miniplayerSeek) {
  miniplayerSeek.addEventListener('input', () => {
    isSeeking = true;
    miniplayerTimeCurrent.textContent = formatTime(Number(miniplayerSeek.value));
  });

  miniplayerSeek.addEventListener('change', async () => {
    const ms = Number(miniplayerSeek.value);
    playbackState.position = ms;
    isSeeking = false;
    if (spotifyPlayer) await spotifyPlayer.seek(ms);
    updateMiniplayerProgress();
  });
}

if (miniplayerMute) miniplayerMute.addEventListener('click', toggleMute);

if (miniplayerVolumeSlider) {
  miniplayerVolumeSlider.addEventListener('input', () => setVolume(Number(miniplayerVolumeSlider.value)));
}

if (miniplayerLyricsBtn) miniplayerLyricsBtn.addEventListener('click', toggleLyrics);
if (lyricsClose) lyricsClose.addEventListener('click', closeLyrics);

if (lyricsView) {
  lyricsView.addEventListener('click', (e) => {
    if (e.target === lyricsView) closeLyrics();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !lyricsView.hidden) closeLyrics();
  });
}

window.onSpotifyWebPlaybackSDKReady = () => {
  sdkReady = true;
  maybeInitPlayer();
};

refreshMiniplayerButtons();
updateMiniplayerProgress();
updateVolumeUi();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => console.error('Service worker registration failed:', err));
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
