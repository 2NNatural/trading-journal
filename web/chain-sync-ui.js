function savedWalletFieldId(wallet) {
  if (wallet.chain === 'robinhood') return 'syncRobinhoodField';
  if (wallet.chain === 'arc') return 'syncArcField';
  if (wallet.chain === 'bsc') return 'syncBscField';
  if (wallet.chain === 'sol' && /#2/i.test(wallet.label || '')) return 'syncSolana2Field';
  if (wallet.chain === 'sol') return 'syncSolana1Field';
  return null;
}

async function loadChainSyncStatus() {
  const panel = document.querySelector('#syncSetupPanel');
  const { data: wallets, error: walletError } = await state.supabase
    .from('wallets')
    .select('id,address,chain,label,sync_enabled')
    .eq('sync_enabled', true)
    .order('created_at', { ascending: true });
  if (walletError) throw walletError;

  for (const wallet of wallets || []) {
    const id = savedWalletFieldId(wallet);
    const field = id && document.querySelector(`#${id}`);
    if (field) field.value = wallet.address;
  }

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
    .eq('source', 'chain-rpc')
    .order('updated_at', { ascending: false });
  if (syncError) throw syncError;

  const errors = (syncRows || []).filter((row) => row.status === 'ERROR');
  if (errors.length) {
    panel.hidden = false;
    document.querySelector('#lastSyncMetric').textContent = `${errors.length} error${errors.length === 1 ? '' : 's'}`;
    document.querySelector('#lastSyncNote').textContent = errors[0].error_code || 'Chain sync failed';
    document.querySelector('#freshnessLabel').innerHTML = '<span class="freshness-dot"></span> Sync needs attention';
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
  document.querySelector('#lastSyncNote').textContent = `${wallets.length} wallets · every minute`;
  document.querySelector('#freshnessLabel').innerHTML = '<span class="freshness-dot"></span> Incremental chain sync';
}

loadSyncStatus = loadChainSyncStatus;

const oldSyncForm = document.querySelector('#syncSetupForm');
if (oldSyncForm) {
  const newSyncForm = oldSyncForm.cloneNode(true);
  oldSyncForm.replaceWith(newSyncForm);
  newSyncForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const wallets = [
      { chain: 'robinhood', address: document.querySelector('#syncRobinhoodField').value.trim(), label: 'Robinhood wallet' },
      { chain: 'sol', address: document.querySelector('#syncSolana1Field').value.trim(), label: 'Solana wallet #1' },
      { chain: 'sol', address: document.querySelector('#syncSolana2Field').value.trim(), label: 'Solana wallet #2' },
      { chain: 'arc', address: document.querySelector('#syncArcField').value.trim(), label: 'ARC wallet' },
      { chain: 'bsc', address: document.querySelector('#syncBscField').value.trim(), label: 'Binance / BSC wallet' }
    ];
    const message = document.querySelector('#syncSetupMessage');
    message.textContent = 'Saving wallets…';
    const { data, error } = await state.supabase.functions.invoke('journal-config', { body: { wallets } });
    if (error || data?.error) {
      message.textContent = data?.error || error?.message || 'Unable to configure chain sync.';
      return;
    }
    message.textContent = data?.sync_triggered ? 'Saved. Incremental sync started.' : 'Saved. Next sync is within one minute.';
    window.setTimeout(() => loadJournal().catch(console.error), 2500);
  });
}
