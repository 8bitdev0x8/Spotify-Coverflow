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

let sdkReady = false;
let spotifyPlayer = null;
let deviceId = null;
let isSeeking = false;
let progressTimer = null;
let playbackState = { paused: true, position: 0, duration: 0 };

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
  maybeInitPlayer();
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
    if (lyricsView && !lyricsView.hidden) fetchLyricsForCurrent();
    return;
  }

  const artistNames = (selectedTrack.artists || []).map((a) => a.name).join(', ');
  const albumName   = selectedTrack.album?.name || 'Unknown album';

  selectedInfo.innerHTML = `
    <p class="track-title">${selectedTrack.name}</p>
    <p class="track-artist">${artistNames}</p>
    <p class="track-album">${albumName}</p>
  `;

  refreshMiniplayerButtons();
  if (lyricsView && !lyricsView.hidden) fetchLyricsForCurrent();
}

function selectItem(index) {
  appState.activeIndex = index;
  syncVirtualCards();
  updateSelection();
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
}

function startProgressTimer() {
  clearInterval(progressTimer);
  progressTimer = setInterval(() => {
    if (playbackState.paused || isSeeking) return;
    playbackState.position = Math.min(playbackState.duration, playbackState.position + 500);
    updateMiniplayerProgress();
  }, 500);
}

function handlePlayerStateChanged(state) {
  if (!state) {
    playbackState = { paused: true, position: 0, duration: 0 };
    updateMiniplayerProgress();
    return;
  }

  playbackState = { paused: state.paused, position: state.position, duration: state.duration };

  const currentTrack = state.track_window?.current_track;
  if (currentTrack?.uri) {
    const idx = appState.items.findIndex((t) => t.uri === currentTrack.uri);
    if (idx >= 0 && idx !== appState.activeIndex) selectItem(idx);
  }

  updateMiniplayerProgress();
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
  startProgressTimer();
}

function teardownPlayer() {
  if (spotifyPlayer) spotifyPlayer.disconnect();
  spotifyPlayer = null;
  deviceId = null;
  clearInterval(progressTimer);
  playbackState = { paused: true, position: 0, duration: 0 };
  updateMiniplayerProgress();
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

  const { response, payload, error } = await fetchSpotifyJson(
    `https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${appState.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ uris: [track.uri] }),
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
    teardownPlayer();
    clearToken();
    clearPlaylistLink();
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
