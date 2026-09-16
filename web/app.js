const state = {
  supabase: null,
  user: null,
  positions: [],
  selectedId: null,
  filter: 'all',
  eventType: 'HOLD'
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[character]));
}

function shortAddress(value) {
  if (!value) return '';
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

async function initSupabase() {
  const response = await fetch('/api/config');
  const config = await response.json();
  if (!response.ok) throw new Error(config.error || 'Unable to load Supabase configuration.');
  state.supabase = window.supabase.createClient(config.url, config.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
}

function showAuth(message = '') {
  document.querySelector('#authScreen').hidden = false;
  document.querySelector('#appShell').hidden = true;
  document.querySelector('#authError').textContent = message;
}

function showApp() {
  document.querySelector('#authScreen').hidden = true;
  document.querySelector('#appShell').hidden = false;
  document.querySelector('#signedInEmail').textContent = state.user?.email || 'Authenticated';
}

async function loadSyncStatus() {
  const panel = document.querySelector('#syncSetupPanel');
  const { data: wallets, error: walletError } = await state.supabase
    .from('wallets')
    .select('id,address,sync_enabled')
    .eq('sync_enabled', true)
    .limit(1);
  if (walletError) throw walletError;

  if (!wallets?.length) {
    panel.hidden = false;
    document.querySelector('#lastSyncMetric').textContent = 'Not set';
    document.querySelector('#lastSyncNote').textContent = 'Connect GMGN autosync';
    return;
  }

  panel.hidden = true;
  const wallet = wallets[0];
  const { data: syncRows, error: syncError } = await state.supabase
    .from('sync_state')
    .select('last_success_at,last_attempt_at,status,error_code')
    .eq('wallet_id', wallet.id)
    .eq('source', 'gmgn')
    .order('updated_at', { ascending: false })
    .limit(1);
  if (syncError) throw syncError;

  const sync = syncRows?.[0];
  if (!sync) {
    document.querySelector('#lastSyncMetric').textContent = 'Pending';
    document.querySelector('#lastSyncNote').textContent = `${shortAddress(wallet.address)} · every 15 min`;
    return;
  }

  if (sync.status === 'ERROR') {
    document.querySelector('#lastSyncMetric').textContent = 'Error';
    document.querySelector('#lastSyncNote').textContent = sync.error_code || 'GMGN sync failed';
    document.querySelector('#freshnessLabel').innerHTML = '<span class="freshness-dot"></span> Sync needs attention';
    return;
  }

  const syncedAt = sync.last_success_at ? new Date(sync.last_success_at) : null;
  document.querySelector('#lastSyncMetric').textContent = syncedAt
    ? syncedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : 'Pending';
  document.querySelector('#lastSyncNote').textContent = `${shortAddress(wallet.address)} · every 15 min`;
  document.querySelector('#freshnessLabel').innerHTML = '<span class="freshness-dot"></span> GMGN autosync';
}

async function loadJournal() {
  const { data: positions, error: positionsError } = await state.supabase
    .from('journal_positions')
    .select('*')
    .order('created_at', { ascending: true });
  if (positionsError) throw positionsError;

  const { data: entries, error: entriesError } = await state.supabase
    .from('journal_entries')
    .select('*')
    .order('written_at', { ascending: true });
  if (entriesError) throw entriesError;

  const byPosition = new Map();
  for (const entry of entries || []) {
    if (!byPosition.has(entry.journal_position_id)) byPosition.set(entry.journal_position_id, []);
    byPosition.get(entry.journal_position_id).push({
      id: entry.id,
      type: entry.kind,
      date: entry.display_date || new Date(entry.written_at).toLocaleDateString(),
      text: entry.original_text,
      confidence: entry.confidence,
      context: entry.context_label || 'Personal note'
    });
  }

  state.positions = (positions || []).map((position) => ({
    id: position.id,
    slug: position.slug,
    symbol: position.symbol,
    short: position.short_label || position.symbol.slice(0, 2).toUpperCase(),
    iconClass: position.icon_class || '',
    status: String(position.status || 'UNKNOWN').toLowerCase(),
    opened: position.opened_label || '—',
    size: position.size_label || '—',
    pnl: position.pnl_label || '—',
    pnlPercent: position.pnl_percent_label || '—',
    value: position.value_label || 'Not synced',
    tokenAddress: position.token_address || null,
    holdThesisRequired: Boolean(position.hold_thesis_required),
    thesis: byPosition.get(position.id) || []
  }));

  if (!state.positions.some((position) => position.id === state.selectedId)) {
    state.selectedId = state.positions[0]?.id || null;
  }
  render();
  await loadSyncStatus();
}

function selectedPosition() {
  return state.positions.find((position) => position.id === state.selectedId) || state.positions[0];
}

function hasEvent(position, type) {
  return position?.thesis?.some((event) => event.type === type);
}

function isThesisGap(position) {
  if (!hasEvent(position, 'BUY')) return true;
  if (position.status === 'closed' && !hasEvent(position, 'SELL')) return true;
  return Boolean(position.holdThesisRequired && !hasEvent(position, 'HOLD'));
}

function filteredPositions() {
  return state.positions.filter((position) => {
    if (state.filter === 'open' || state.filter === 'closed') return position.status === state.filter;
    if (state.filter === 'gaps') return isThesisGap(position);
    return true;
  });
}

function renderMetrics() {
  const open = state.positions.filter((position) => position.status === 'open').length;
  const realized = state.positions.filter((position) => position.status === 'closed').reduce((total, position) => {
    const amount = Number(String(position.pnl).replace(/[$,]/g, ''));
    return Number.isFinite(amount) ? total + amount : total;
  }, 0);
  const coverage = state.positions.length
    ? Math.round((state.positions.filter((position) => hasEvent(position, 'BUY')).length / state.positions.length) * 100)
    : 0;
  document.querySelector('#openPositionsMetric').textContent = String(open);
  document.querySelector('#realizedPnlMetric').textContent = `$${realized.toFixed(2)}`;
  document.querySelector('#coverageMetric').textContent = `${coverage}%`;
  document.querySelector('#coverageProgress').style.width = `${coverage}%`;
  document.querySelector('#gapCount').textContent = String(state.positions.filter(isThesisGap).length);
}

function renderPositionList() {
  const list = document.querySelector('#positionList');
  const positions = filteredPositions();
  if (!positions.length) {
    list.innerHTML = '<div class="timeline-empty"><div class="empty-icon">○</div><h3>No matching positions</h3><p>Your Supabase journal is empty for this view.</p></div>';
    return;
  }
  list.innerHTML = positions.map((position) => {
    const contract = position.tokenAddress ? ` · ${shortAddress(position.tokenAddress)}` : '';
    return `
    <button class="position-row ${position.id === state.selectedId ? 'is-selected' : ''}" data-position-id="${escapeHtml(position.id)}" type="button">
      <span class="position-primary">
        <span class="token-icon ${escapeHtml(position.iconClass)}">${escapeHtml(position.short)}</span>
        <span><span class="position-name">${escapeHtml(position.symbol)}</span><span class="position-meta">${escapeHtml(position.opened)} · ${escapeHtml(position.size)}${escapeHtml(contract)}</span></span>
      </span>
      <span class="position-right"><span class="position-pnl ${String(position.pnl).startsWith('-') ? 'negative' : 'positive'}">${escapeHtml(position.pnl)}</span><span class="position-status ${escapeHtml(position.status)}">${escapeHtml(position.holdThesisRequired && !hasEvent(position, 'HOLD') ? 'hold thesis needed' : position.status)}</span></span>
    </button>`;
  }).join('');
}

function renderTimeline() {
  const position = selectedPosition();
  const summary = document.querySelector('#selectedPositionSummary');
  const timeline = document.querySelector('#timeline');
  const empty = document.querySelector('#timelineEmpty');
  if (!position) {
    summary.innerHTML = '<span>No positions yet. Seed or import your private journal data first.</span>';
    timeline.innerHTML = '';
    empty.hidden = false;
    return;
  }
  const contract = position.tokenAddress ? ` · ${shortAddress(position.tokenAddress)}` : '';
  summary.innerHTML = `<div class="summary-token"><span class="token-icon ${escapeHtml(position.iconClass)}">${escapeHtml(position.short)}</span><div><strong>${escapeHtml(position.symbol)}</strong><span>${escapeHtml(position.opened)} · ${escapeHtml(position.size)}${escapeHtml(contract)}</span></div></div><div class="summary-value"><strong>${escapeHtml(position.value)}</strong><span class="${position.holdThesisRequired && !hasEvent(position, 'HOLD') ? 'summary-hold-note' : ''}">${position.holdThesisRequired && !hasEvent(position, 'HOLD') ? 'Hold thesis needed' : escapeHtml(position.status)}</span></div>`;
  if (!position.thesis.length) {
    timeline.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  timeline.innerHTML = position.thesis.map((event) => {
    const kind = event.type === 'GENERAL_THOUGHT' ? 'general' : event.type.toLowerCase();
    return `<article class="timeline-event"><span class="timeline-marker ${kind}"></span><div class="timeline-topline"><span class="timeline-type">${escapeHtml(event.type.replaceAll('_', ' '))}</span><span class="timeline-date">${escapeHtml(event.date)}</span></div><p class="timeline-copy">${escapeHtml(event.text)}</p><div class="timeline-tags"><span class="timeline-tag">${escapeHtml(event.context || 'Personal note')}</span>${event.confidence ? `<span class="timeline-tag">${escapeHtml(event.confidence)} confidence</span>` : ''}</div></article>`;
  }).join('');
}

function render() {
  renderMetrics();
  renderPositionList();
  renderTimeline();
  document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('is-active', item.dataset.filter === state.filter));
}

function openComposer() {
  if (!selectedPosition()) return;
  document.querySelector('#composerPanel').classList.add('is-open');
  document.querySelector('#thesisText').focus();
}

function closeComposer() {
  document.querySelector('#composerPanel').classList.remove('is-open');
}

async function saveThesis(event) {
  event.preventDefault();
  const position = selectedPosition();
  const text = document.querySelector('#thesisText').value.trim();
  if (!position || !text) return;
  const confidence = document.querySelector('#confidenceField').value || null;
  const { error } = await state.supabase.from('journal_entries').insert({
    user_id: state.user.id,
    journal_position_id: position.id,
    kind: state.eventType,
    original_text: text,
    confidence,
    display_date: 'Just now',
    context_label: 'Personal note'
  });
  if (error) {
    window.alert(`Unable to save: ${error.message}`);
    return;
  }
  if (state.eventType === 'HOLD' && position.holdThesisRequired) {
    await state.supabase.from('journal_positions').update({ hold_thesis_required: false }).eq('id', position.id);
  }
  document.querySelector('#thesisText').value = '';
  document.querySelector('#confidenceField').value = '';
  closeComposer();
  await loadJournal();
}

async function saveSyncSetup(event) {
  event.preventDefault();
  const wallet = document.querySelector('#syncWalletField').value.trim();
  const apiKey = document.querySelector('#syncApiKeyField').value.trim();
  const message = document.querySelector('#syncSetupMessage');
  message.textContent = 'Connecting…';
  const { data, error } = await state.supabase.functions.invoke('journal-config', {
    body: { wallet_address: wallet, gmgn_api_key: apiKey }
  });
  if (error || data?.error) {
    message.textContent = data?.error || error?.message || 'Unable to configure autosync.';
    return;
  }
  document.querySelector('#syncApiKeyField').value = '';
  message.textContent = data?.sync_triggered ? 'Connected. First sync started.' : 'Connected. Next sync is within 15 minutes.';
  window.setTimeout(() => loadJournal().catch(console.error), 2500);
}

async function signIn(event) {
  event.preventDefault();
  document.querySelector('#authError').textContent = '';
  const email = document.querySelector('#emailField').value.trim();
  const password = document.querySelector('#passwordField').value;
  const { data, error } = await state.supabase.auth.signInWithPassword({ email, password });
  if (error) return showAuth(error.message);
  state.user = data.user;
  showApp();
  await loadJournal();
}

async function boot() {
  try {
    await initSupabase();
    const { data } = await state.supabase.auth.getSession();
    state.user = data.session?.user || null;
    state.supabase.auth.onAuthStateChange((_event, session) => {
      state.user = session?.user || null;
      if (!state.user) showAuth();
    });
    if (!state.user) return showAuth();
    showApp();
    await loadJournal();
  } catch (error) {
    showAuth(error.message || 'Unable to initialize the journal.');
  }
}

document.querySelector('#loginForm').addEventListener('submit', signIn);
document.querySelector('#logoutButton').addEventListener('click', async () => {
  await state.supabase.auth.signOut();
  state.positions = [];
  state.user = null;
  showAuth();
});
document.querySelector('#positionList').addEventListener('click', (event) => {
  const row = event.target.closest('[data-position-id]');
  if (!row) return;
  state.selectedId = row.dataset.positionId;
  render();
});
document.querySelectorAll('.nav-item').forEach((item) => item.addEventListener('click', () => {
  state.filter = item.dataset.filter;
  const visible = filteredPositions();
  if (visible.length && !visible.some((position) => position.id === state.selectedId)) state.selectedId = visible[0].id;
  render();
}));
document.querySelectorAll('.event-type').forEach((button) => button.addEventListener('click', () => {
  state.eventType = button.dataset.eventType;
  document.querySelector('#eventTypeField').value = state.eventType;
  document.querySelectorAll('.event-type').forEach((item) => item.classList.toggle('is-selected', item === button));
}));
document.querySelector('#thesisForm').addEventListener('submit', saveThesis);
document.querySelector('#syncSetupForm').addEventListener('submit', saveSyncSetup);
document.querySelector('#newThesisButton').addEventListener('click', openComposer);
document.querySelector('#timelineAddButton').addEventListener('click', openComposer);
document.querySelector('#emptyAddButton').addEventListener('click', openComposer);
document.querySelector('#closeComposerButton').addEventListener('click', closeComposer);
document.querySelector('#refreshButton').addEventListener('click', loadJournal);
document.querySelector('#viewAllButton').addEventListener('click', () => { state.filter = 'all'; render(); });

boot();
