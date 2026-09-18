const state = {
  supabase: null,
  user: null,
  positions: [],
  entries: [],
  filter: 'all',
  realtime: null,
  reloadTimer: null
};

const $ = (selector) => document.querySelector(selector);

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[c]));
}

function slugify(value) {
  return String(value || 'token').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'token';
}

function chainLabel(chain) {
  return ({ robinhood: 'Robinhood', sol: 'Solana', arc: 'ARC', bsc: 'BSC' })[chain] || chain || 'Unknown';
}

function shortAddress(value) {
  if (!value) return '';
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function dayKey(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(date, today)) return 'Today';
  if (sameDay(date, yesterday)) return 'Yesterday';
  return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

function durationLabel(start, end) {
  if (!start || !end) return '';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const min = Math.round(ms / 60000);
  if (min < 1) return '<1 min';
  if (min < 60) return `${min} min`;
  const hours = Math.floor(min / 60);
  const rem = min % 60;
  return rem ? `${hours}h ${rem}m` : `${hours}h`;
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
  $('#authScreen').hidden = false;
  $('#appShell').hidden = true;
  $('#authError').textContent = message;
}

function showApp() {
  $('#authScreen').hidden = true;
  $('#appShell').hidden = false;
}

async function signIn(event) {
  event.preventDefault();
  $('#authError').textContent = '';
  const { data, error } = await state.supabase.auth.signInWithPassword({
    email: $('#emailField').value.trim(),
    password: $('#passwordField').value
  });
  if (error) return showAuth(error.message);
  state.user = data.user;
  showApp();
  await loadAll();
  subscribeRealtime();
}

async function loadAll() {
  const [{ data: positions, error: pError }, { data: entries, error: eError }] = await Promise.all([
    state.supabase.from('journal_positions').select('*').order('created_at', { ascending: false }),
    state.supabase.from('journal_entries').select('*').order('written_at', { ascending: true })
  ]);
  if (pError) throw pError;
  if (eError) throw eError;
  state.positions = positions || [];
  state.entries = entries || [];
  renderFeed();
  await loadSyncStatus();
}

async function loadSyncStatus() {
  const { data: wallets, error: wError } = await state.supabase
    .from('wallets')
    .select('id,chain,label,sync_enabled')
    .eq('sync_enabled', true);
  if (wError) return;

  if (!wallets?.length) {
    $('#syncStatus').innerHTML = '<span class="dot error"></span> Wallet sync not configured';
    return;
  }

  const ids = wallets.map((w) => w.id);
  const { data: rows, error } = await state.supabase
    .from('sync_state')
    .select('wallet_id,status,error_code,last_success_at')
    .in('wallet_id', ids)
    .eq('source', 'chain-rpc');
  if (error) return;

  const latestByWallet = new Map();
  for (const row of rows || []) {
    const prev = latestByWallet.get(row.wallet_id);
    if (!prev || new Date(row.last_success_at || 0) > new Date(prev.last_success_at || 0)) latestByWallet.set(row.wallet_id, row);
  }
  const current = [...latestByWallet.values()];
  const errors = current.filter((r) => r.status === 'ERROR');
  if (errors.length) {
    $('#syncStatus').innerHTML = `<span class="dot error"></span> ${errors.length} wallet${errors.length === 1 ? '' : 's'} need sync attention`;
    return;
  }
  const latest = current.map((r) => r.last_success_at).filter(Boolean).sort().at(-1);
  $('#syncStatus').innerHTML = `<span class="dot"></span> Live chain sync · ${latest ? 'last ' + formatTime(latest) : 'starting'}`;
}

function entriesFor(positionId) {
  return state.entries.filter((e) => e.journal_position_id === positionId);
}

function filteredPositions() {
  return state.positions.filter((p) => {
    const status = String(p.status || '').toLowerCase();
    if (state.filter === 'open') return status === 'open';
    if (state.filter === 'closed') return status === 'closed';
    return true;
  });
}

function objectiveChips(position) {
  const chips = [];
  const size = String(position.size_label || '').trim();
  const value = String(position.value_label || '').trim();
  const autoPlaceholder = /auto-detected|activity|not synced|manual entry/i;

  chips.push(`<span>${escapeHtml(chainLabel(position.chain))}</span>`);
  if (size && !autoPlaceholder.test(size)) chips.push(`<span>${escapeHtml(size)}</span>`);
  if (value && !autoPlaceholder.test(value)) chips.push(`<span>${escapeHtml(value)}</span>`);
  if (position.token_address) chips.push(`<span>${escapeHtml(shortAddress(position.token_address))}</span>`);

  if ((!size || autoPlaceholder.test(size)) && (!value || autoPlaceholder.test(value))) {
    chips.push('<span class="pending">On-chain size / price context syncing</span>');
  }

  const status = String(position.status || '').toLowerCase();
  if (status === 'closed') {
    const held = durationLabel(position.created_at, position.last_activity_at || position.updated_at);
    if (held) chips.push(`<span class="duration">Held ${escapeHtml(held)}</span>`);
  }
  return chips.join('');
}

function noteHtml(entry) {
  const kind = entry.kind === 'GENERAL_THOUGHT' ? 'Note' : entry.kind;
  return `<div class="note">
    <span class="note-kind">${escapeHtml(kind)}</span>
    <div><span class="note-text">${escapeHtml(entry.original_text)}</span>
    <span class="note-time">${escapeHtml(entry.display_date || formatTime(entry.written_at))}</span></div>
  </div>`;
}

function cardHtml(position) {
  const status = String(position.status || 'UNKNOWN').toLowerCase();
  const entries = entriesFor(position.id);
  const hasBuy = entries.some((e) => e.kind === 'BUY');
  const notes = entries.map(noteHtml).join('');
  const opened = position.created_at || position.first_synced_at || position.updated_at;
  const symbol = position.symbol || 'Unknown';
  const buyEditor = status === 'open' && !hasBuy ? `
    <form class="inline-note" data-buy-note="${escapeHtml(position.id)}">
      <input type="text" placeholder="Why did I buy this?" required />
      <button class="primary" type="submit">Save note</button>
    </form>` : '';

  const exitRow = status === 'open' ? `
    <form class="exit-row" data-close-position="${escapeHtml(position.id)}">
      <input type="text" placeholder="Exit note (optional)" />
      <button class="mini-button" type="submit">Mark sold</button>
    </form>` : '';

  return `<article class="trade-card" data-position-id="${escapeHtml(position.id)}">
    <div class="trade-top">
      <div class="trade-title">
        <div class="token-badge">${escapeHtml((symbol || '??').slice(0,2).toUpperCase())}</div>
        <div>
          <div class="trade-name">${escapeHtml(symbol)}${position.token_name ? ` — ${escapeHtml(position.token_name)}` : ''}</div>
          <div class="trade-meta">${escapeHtml(formatTime(opened))} · ${escapeHtml(chainLabel(position.chain))}</div>
        </div>
      </div>
      <span class="trade-state ${status === 'closed' ? 'closed' : ''}">${status === 'closed' ? 'Sold' : 'Open'}</span>
    </div>
    <div class="objective">${objectiveChips(position)}</div>
    ${notes ? `<div class="notes">${notes}</div>` : ''}
    ${buyEditor}
    ${exitRow}
  </article>`;
}

function renderFeed() {
  const positions = filteredPositions();
  $('#feedEmpty').hidden = Boolean(positions.length);
  if (!positions.length) {
    $('#tradeFeed').innerHTML = '';
    return;
  }

  const groups = new Map();
  for (const p of positions) {
    const key = dayKey(p.created_at || p.first_synced_at || p.updated_at);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }

  $('#tradeFeed').innerHTML = [...groups.entries()].map(([day, rows]) =>
    `<section class="day-group"><div class="day-heading">${escapeHtml(day)}</div>${rows.map(cardHtml).join('')}</section>`
  ).join('');
}

async function saveQuickTrade(event) {
  event.preventDefault();
  const symbol = $('#quickSymbol').value.trim().toUpperCase();
  const thesis = $('#quickThesis').value.trim();
  if (!symbol || !thesis) return;

  const chain = $('#quickChain').value;
  const contract = $('#quickContract').value.trim() || null;
  const context = $('#quickContext').value.trim() || null;
  $('#quickMessage').textContent = 'Saving…';

  const payload = {
    user_id: state.user.id,
    slug: `${slugify(symbol)}-manual-${Date.now()}-${crypto.randomUUID().slice(0,8)}`,
    symbol,
    short_label: symbol.slice(0,2),
    status: 'OPEN',
    opened_label: new Date().toLocaleDateString([], { month: 'short', day: 'numeric' }),
    size_label: context || 'Manual entry',
    value_label: 'Awaiting chain context',
    hold_thesis_required: false,
    token_address: contract,
    chain,
    source: 'manual',
    sync_source: 'manual'
  };

  const { data: position, error } = await state.supabase
    .from('journal_positions')
    .insert(payload)
    .select('id')
    .single();

  if (error) {
    $('#quickMessage').textContent = error.message;
    return;
  }

  const { error: noteError } = await state.supabase.from('journal_entries').insert({
    user_id: state.user.id,
    journal_position_id: position.id,
    kind: 'BUY',
    original_text: thesis,
    display_date: 'Just now',
    context_label: 'Buy thesis'
  });

  if (noteError) {
    $('#quickMessage').textContent = noteError.message;
    return;
  }

  $('#quickTradeForm').reset();
  $('#quickChain').value = chain;
  $('#quickMessage').textContent = 'Saved.';
  await loadAll();
  $('#quickSymbol').focus();
}

async function saveInlineBuy(event) {
  const form = event.target.closest('[data-buy-note]');
  if (!form) return false;
  event.preventDefault();
  const text = form.querySelector('input').value.trim();
  if (!text) return true;
  const { error } = await state.supabase.from('journal_entries').insert({
    user_id: state.user.id,
    journal_position_id: form.dataset.buyNote,
    kind: 'BUY',
    original_text: text,
    display_date: 'Just now',
    context_label: 'Buy thesis'
  });
  if (error) window.alert(error.message);
  else await loadAll();
  return true;
}

async function closePosition(event) {
  const form = event.target.closest('[data-close-position]');
  if (!form) return false;
  event.preventDefault();
  const id = form.dataset.closePosition;
  const exitNote = form.querySelector('input').value.trim();

  const { error } = await state.supabase.from('journal_positions').update({
    status: 'CLOSED',
    hold_thesis_required: false,
    last_activity_at: new Date().toISOString()
  }).eq('id', id);
  if (error) {
    window.alert(error.message);
    return true;
  }

  if (exitNote) {
    const { error: noteError } = await state.supabase.from('journal_entries').insert({
      user_id: state.user.id,
      journal_position_id: id,
      kind: 'SELL',
      original_text: exitNote,
      display_date: 'Just now',
      context_label: 'Exit note'
    });
    if (noteError) window.alert(noteError.message);
  }

  await loadAll();
  return true;
}

function debounceReload() {
  window.clearTimeout(state.reloadTimer);
  state.reloadTimer = window.setTimeout(() => loadAll().catch(console.error), 250);
}

function subscribeRealtime() {
  if (state.realtime) state.supabase.removeChannel(state.realtime);
  state.realtime = state.supabase
    .channel(`journal-live-${state.user.id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'journal_positions' }, debounceReload)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'journal_entries' }, debounceReload)
    .subscribe();
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
    await loadAll();
    subscribeRealtime();
    window.setInterval(() => loadSyncStatus().catch(() => {}), 15000);
  } catch (error) {
    showAuth(error.message || 'Unable to initialize journal.');
  }
}

$('#loginForm').addEventListener('submit', signIn);
$('#logoutButton').addEventListener('click', async () => {
  if (state.realtime) state.supabase.removeChannel(state.realtime);
  await state.supabase.auth.signOut();
  state.user = null;
  showAuth();
});
$('#refreshButton').addEventListener('click', () => loadAll().catch(console.error));
$('#quickTradeForm').addEventListener('submit', saveQuickTrade);
$('#tradeFeed').addEventListener('submit', async (event) => {
  if (await saveInlineBuy(event)) return;
  await closePosition(event);
});
document.querySelectorAll('.filter').forEach((button) => button.addEventListener('click', () => {
  state.filter = button.dataset.filter;
  document.querySelectorAll('.filter').forEach((item) => item.classList.toggle('active', item === button));
  renderFeed();
}));
$('#quickThesis').addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault();
    $('#quickTradeForm').requestSubmit();
  }
});

boot();
