const state = {
  supabase: null,
  user: null,
  positions: [],
  selectedId: null,
  filter: 'open',
  eventType: 'HOLD',
  hasSavedSyncKey: false
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

function chainLabel(chain) {
  return ({ robinhood: 'Robinhood', sol: 'Solana', arc: 'ARC', bsc: 'BSC' })[chain] || String(chain || 'Unknown');
}

function viewMeta() {
  if (state.filter === 'closed') return { eyebrow: 'Completed trades', title: 'Closed trades', copy: 'Most recently closed and updated trades first.' };
  if (state.filter === 'gaps') return { eyebrow: 'Needs attention', title: 'Thesis gaps', copy: 'Positions missing a buy, hold, or sell thesis.' };
  return { eyebrow: 'Active trades', title: 'Open positions', copy: 'Newest positions first. Select one to add or review its thesis.' };
}

function positionSortTime(position) {
  const candidates = [position.lastActivityAt, position.updatedAt, position.createdAt].filter(Boolean);
  for (const value of candidates) {
    const time = new Date(value).getTime();
    if (Number.isFinite(time)) return time;
  }
  return 0;
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

function populateSavedWalletFields(wallets) {
  const robinhood = wallets.find((wallet) => wallet.chain === 'robinhood');
  const arc = wallets.find((wallet) => wallet.chain === 'arc');
  const bsc = wallets.find((wallet) => wallet.chain === 'bsc');
  const solana = wallets.filter((wallet) => wallet.chain === 'sol');
  const sol1 = solana.find((wallet) => /#1/i.test(wallet.label || '')) || solana[0];
  const sol2 = solana.find((wallet) => /#2/i.test(wallet.label || '')) || solana.find((wallet) => wallet.id !== sol1?.id);

  const set = (id, value) => { const node = document.querySelector(id); if (node && value) node.value = value; };
  set('#syncRobinhoodField', robinhood?.address);
  set('#syncSolana1Field', sol1?.address);
  set('#syncSolana2Field', sol2?.address);
  set('#syncArcField', arc?.address);
  set('#syncBscField', bsc?.address);
}

async function loadSyncStatus() {
  const panel = document.querySelector('#syncSetupPanel');
  const { data: wallets, error: walletError } = await state.supabase
    .from('wallets')
    .select('id,address,chain,label,sync_enabled')
    .eq('sync_enabled', true)
    .order('created_at', { ascending: true });
  if (walletError) throw walletError;

  populateSavedWalletFields(wallets || []);
  state.hasSavedSyncKey = Boolean(wallets?.length);
  const apiKeyField = document.querySelector('#syncApiKeyField');
  if (state.hasSavedSyncKey) apiKeyField.placeholder = 'Saved server-side · leave blank to keep it';

  if (!wallets?.length || wallets.length < 5) {
    panel.hidden = false;
    document.querySelector('#lastSyncMetric').textContent = wallets?.length ? `${wallets.length}/5` : 'Not set';
    document.querySelector('#lastSyncNote').textContent = 'Configure all multi-chain wallets';
    return;
  }

  const walletIds = wallets.map((wallet) => wallet.id);
  const { data: syncRows, error: syncError } = await state.supabase
    .from('sync_state')
    .select('wallet_id,last_success_at,last_attempt_at,status,error_code,source')
    .in('wallet_id', walletIds)
    .order('updated_at', { ascending: false });
  if (syncError) throw syncError;

  const errors = (syncRows || []).filter((row) => row.status === 'ERROR');
  const rateLimited = errors.length && errors.every((row) => String(row.error_code || '').includes('429'));
  if (errors.length) {
    document.querySelector('#lastSyncMetric').textContent = rateLimited ? 'Retrying' : `${errors.length} error${errors.length === 1 ? '' : 's'}`;
    document.querySelector('#lastSyncNote').textContent = rateLimited ? 'GMGN rate limited · autosync remains saved' : (errors[0].error_code || 'GMGN sync failed');
    document.querySelector('#freshnessLabel').innerHTML = `<span class="freshness-dot"></span> ${rateLimited ? 'Rate limited · retrying' : 'Sync needs attention'}`;
    panel.hidden = false;
    document.querySelector('#syncSetupMessage').textContent = rateLimited ? 'Wallets and API key are saved. GMGN is rate limiting requests; autosync will retry automatically.' : 'Autosync settings are saved. Update them only if needed.';
    return;
  }

  panel.hidden = true;
  const latest = (syncRows || [])
    .map((row) => row.last_success_at)
    .filter(Boolean)
    .map((value) => new Date(value))
    .sort((a, b) => b - a)[0];

  document.querySelector('#lastSyncMetric').textContent = latest
    ? latest.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : 'Pending';
  document.querySelector('#lastSyncNote').textContent = `${wallets.length} wallets · every 15 min`;
  document.querySelector('#freshnessLabel').innerHTML = '<span class="freshness-dot"></span> Multi-chain GMGN autosync';
}

async function loadJournal() {
  const { data: positions, error: positionsError } = await state.supabase
    .from('journal_positions')
    .select('*')
    .order('updated_at', { ascending: false });
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
    chain: position.chain || 'robinhood',
    walletId: position.wallet_id || null,
    holdThesisRequired: Boolean(position.hold_thesis_required),
    thesis: byPosition.get(position.id) || [],
    createdAt: position.created_at,
    updatedAt: position.updated_at,
    lastActivityAt: position.last_activity_at
  })).sort((a, b) => positionSortTime(b) - positionSortTime(a));

  const visible = filteredPositions();
  if (!visible.some((position) => position.id === state.selectedId)) {
    state.selectedId = visible[0]?.id || state.positions[0]?.id || null;
  }
  render();
  await loadSyncStatus();
}

function selectedPosition() {
  return state.positions.find((position) => position.id === state.selectedId) || filteredPositions()[0] || state.positions[0];
}

function hasEvent(position, type) { return position?.thesis?.some((event) => event.type === type); }

function isThesisGap(position) {
  if (!hasEvent(position, 'BUY')) return true;
  if (position.status === 'closed' && !hasEvent(position, 'SELL')) return true;
  return Boolean(position.holdThesisRequired && !hasEvent(position, 'HOLD'));
}

function filteredPositions() {
  const filtered = state.positions.filter((position) => {
    if (state.filter === 'open') return position.status === 'open';
    if (state.filter === 'closed') return position.status === 'closed';
    if (state.filter === 'gaps') return isThesisGap(position);
    return false;
  });
  return filtered.sort((a, b) => positionSortTime(b) - positionSortTime(a));
}

function renderMetrics() {
  const open = state.positions.filter((position) => position.status === 'open').length;
  const closed = state.positions.filter((position) => position.status === 'closed').length;
  const coverage = state.positions.length
    ? Math.round((state.positions.filter((position) => hasEvent(position, 'BUY')).length / state.positions.length) * 100)
    : 0;
  document.querySelector('#openPositionsMetric').textContent = String(open);
  document.querySelector('#closedPositionsMetric').textContent = String(closed);
  document.querySelector('#coverageMetric').textContent = `${coverage}%`;
  document.querySelector('#coverageProgress').style.width = `${coverage}%`;
  document.querySelector('#openCount').textContent = String(open);
  document.querySelector('#closedCount').textContent = String(closed);
  document.querySelector('#gapCount').textContent = String(state.positions.filter(isThesisGap).length);
}

function renderViewChrome() {
  const meta = viewMeta();
  document.querySelector('#currentViewLabel').textContent = meta.title;
  document.querySelector('#viewEyebrow').textContent = meta.eyebrow;
  document.querySelector('#viewTitle').textContent = meta.title;
  document.querySelector('#viewCopy').textContent = meta.copy;
  document.querySelector('#positionListTitle').textContent = meta.title;
  document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('is-active', item.dataset.filter === state.filter));
}

function renderPositionList() {
  const list = document.querySelector('#positionList');
  const positions = filteredPositions();
  if (!positions.length) {
    const message = state.filter === 'open' ? 'No open positions yet.' : state.filter === 'closed' ? 'No closed trades yet.' : 'No thesis gaps in this view.';
    list.innerHTML = `<div class="timeline-empty compact-empty"><div class="empty-icon">○</div><h3>${escapeHtml(message)}</h3><p>${state.filter === 'open' ? 'Add a position manually or wait for autosync.' : 'Switch views to keep journaling.'}</p></div>`;
    return;
  }
  list.innerHTML = positions.map((position) => {
    const contract = position.tokenAddress ? ` · ${shortAddress(position.tokenAddress)}` : '';
    return `
    <button class="position-row ${position.id === state.selectedId ? 'is-selected' : ''}" data-position-id="${escapeHtml(position.id)}" type="button">
      <span class="position-primary">
        <span class="token-icon ${escapeHtml(position.iconClass)}">${escapeHtml(position.short)}</span>
        <span><span class="position-name">${escapeHtml(position.symbol)} <span class="chain-tag">${escapeHtml(chainLabel(position.chain))}</span></span><span class="position-meta">${escapeHtml(position.opened)} · ${escapeHtml(position.size)}${escapeHtml(contract)}</span></span>
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
    summary.innerHTML = '<span>No position selected.</span>';
    timeline.innerHTML = '';
    empty.hidden = false;
    return;
  }
  const contract = position.tokenAddress ? ` · ${shortAddress(position.tokenAddress)}` : '';
  summary.innerHTML = `<div class="summary-token"><span class="token-icon ${escapeHtml(position.iconClass)}">${escapeHtml(position.short)}</span><div><strong>${escapeHtml(position.symbol)} <span class="chain-tag">${escapeHtml(chainLabel(position.chain))}</span></strong><span>${escapeHtml(position.opened)} · ${escapeHtml(position.size)}${escapeHtml(contract)}</span></div></div><div class="summary-value"><strong>${escapeHtml(position.value)}</strong><span class="${position.holdThesisRequired && !hasEvent(position, 'HOLD') ? 'summary-hold-note' : ''}">${position.holdThesisRequired && !hasEvent(position, 'HOLD') ? 'Hold thesis needed' : escapeHtml(position.status)}</span></div>`;
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
  renderViewChrome();
  renderPositionList();
  renderTimeline();
}

function openComposer() {
  if (!selectedPosition()) return;
  document.querySelector('#composerPanel').classList.add('is-open');
  document.querySelector('#thesisText').focus();
  document.querySelector('#composerPanel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function closeComposer() { document.querySelector('#composerPanel').classList.remove('is-open'); }

function openNewPosition() {
  document.querySelector('#newPositionPanel').hidden = false;
  document.querySelector('#newPositionSymbol').focus();
  document.querySelector('#newPositionPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeNewPosition() { document.querySelector('#newPositionPanel').hidden = true; }

async function saveNewPosition(event) {
  event.preventDefault();
  const symbol = document.querySelector('#newPositionSymbol').value.trim();
  const chain = document.querySelector('#newPositionChain').value;
  let tokenAddress = document.querySelector('#newPositionContract').value.trim() || null;
  const size = document.querySelector('#newPositionSize').value.trim();
  const thesis = document.querySelector('#newPositionThesis').value.trim();
  if (!symbol || !thesis) return;
  if (tokenAddress && chain !== 'sol') tokenAddress = tokenAddress.toLowerCase();

  const now = new Date();
  const openedLabel = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const slugBase = symbol.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'position';
  const slug = `${slugBase}-${chain}-${Date.now().toString(36)}`;

  const { data: position, error: positionError } = await state.supabase.from('journal_positions').insert({
    user_id: state.user.id,
    slug,
    symbol,
    short_label: symbol.slice(0, 2).toUpperCase(),
    status: 'OPEN',
    opened_label: openedLabel,
    size_label: size || 'Manual entry',
    value_label: 'Manual position',
    hold_thesis_required: false,
    token_address: tokenAddress,
    chain,
    source: 'manual',
    sync_source: 'manual'
  }).select('id').single();
  if (positionError) return window.alert(`Unable to create position: ${positionError.message}`);

  const { error: thesisError } = await state.supabase.from('journal_entries').insert({
    user_id: state.user.id,
    journal_position_id: position.id,
    kind: 'BUY',
    original_text: thesis,
    display_date: openedLabel,
    context_label: size ? `Entry · ${size}` : 'Manual entry'
  });
  if (thesisError) {
    await state.supabase.from('journal_positions').delete().eq('id', position.id);
    return window.alert(`Unable to save buy thesis: ${thesisError.message}`);
  }

  document.querySelector('#newPositionForm').reset();
  closeNewPosition();
  state.filter = 'open';
  state.selectedId = position.id;
  await loadJournal();
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
  if (error) return window.alert(`Unable to save: ${error.message}`);
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
  const apiKey = document.querySelector('#syncApiKeyField').value.trim();
  const wallets = [
    { chain: 'robinhood', address: document.querySelector('#syncRobinhoodField').value.trim(), label: 'Robinhood wallet' },
    { chain: 'sol', address: document.querySelector('#syncSolana1Field').value.trim(), label: 'Solana wallet #1' },
    { chain: 'sol', address: document.querySelector('#syncSolana2Field').value.trim(), label: 'Solana wallet #2' },
    { chain: 'arc', address: document.querySelector('#syncArcField').value.trim(), label: 'ARC wallet' },
    { chain: 'bsc', address: document.querySelector('#syncBscField').value.trim(), label: 'Binance / BSC wallet' }
  ];
  const message = document.querySelector('#syncSetupMessage');
  if (!apiKey && state.hasSavedSyncKey) {
    message.textContent = 'Wallet addresses are already saved. Enter a new GMGN key only if you want to replace the saved one.';
    return;
  }
  message.textContent = 'Saving 5 wallets…';
  const { data, error } = await state.supabase.functions.invoke('journal-config', {
    body: { wallets, gmgn_api_key: apiKey }
  });
  if (error || data?.error) {
    message.textContent = data?.error || error?.message || 'Unable to configure autosync.';
    return;
  }
  document.querySelector('#syncApiKeyField').value = '';
  state.hasSavedSyncKey = true;
  message.textContent = data?.sync_triggered ? 'Saved. First multi-chain sync started.' : 'Saved. Next sync is within 15 minutes.';
  window.setTimeout(() => loadJournal().catch(console.error), 3500);
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
  state.selectedId = visible[0]?.id || null;
  closeComposer();
  closeNewPosition();
  render();
}));
document.querySelectorAll('.event-type').forEach((button) => button.addEventListener('click', () => {
  state.eventType = button.dataset.eventType;
  document.querySelector('#eventTypeField').value = state.eventType;
  document.querySelectorAll('.event-type').forEach((item) => item.classList.toggle('is-selected', item === button));
}));
document.querySelector('#thesisForm').addEventListener('submit', saveThesis);
document.querySelector('#newPositionForm').addEventListener('submit', saveNewPosition);
document.querySelector('#syncSetupForm').addEventListener('submit', saveSyncSetup);
document.querySelector('#newPositionButton').addEventListener('click', openNewPosition);
document.querySelector('#sidebarNewPositionButton').addEventListener('click', openNewPosition);
document.querySelector('#closeNewPositionButton').addEventListener('click', closeNewPosition);
document.querySelector('#newThesisButton').addEventListener('click', openComposer);
document.querySelector('#timelineAddButton').addEventListener('click', openComposer);
document.querySelector('#emptyAddButton').addEventListener('click', openComposer);
document.querySelector('#closeComposerButton').addEventListener('click', closeComposer);
document.querySelector('#refreshButton').addEventListener('click', loadJournal);

boot();