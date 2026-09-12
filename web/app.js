const STORAGE_KEY = 'robinhood-journal-local-v2';

const entry = (type, date, text, context) => ({ type, date, text, context });

const makePosition = ({
  id,
  symbol,
  short = symbol.slice(0, 2).toUpperCase(),
  iconClass = '',
  status = 'open',
  opened,
  size = '—',
  pnl = '—',
  pnlPercent = '—',
  value = 'Not synced',
  thesis = [],
  holdThesisRequired = false
}) => ({ id, symbol, short, iconClass, status, opened, size, pnl, pnlPercent, value, thesis, holdThesisRequired });

// These are the user's initial journal entries. Market caps are kept in the
// event context; fill amounts and P&L remain unknown until the wallet import.
const seedPositions = [
  makePosition({
    id: 'tgcoins', symbol: 'TGCOINS', short: 'TG', status: 'closed', opened: 'Sep 10', size: '$150k mcap',
    thesis: [
      entry('BUY', 'Sep 10', "Good technology by an account that makes memecoins, could send if a big KOl claims their tokens Let's you launch a telegram token for any telegram user and airdrop them tokens. Actively monitoring the trade on FOMO to see if big KOLs are going to buy, I believe they would buy before claiming their fees on Telegram, which would create a pump.", 'Entry · $150k mcap'),
      entry('SELL', 'Sep 10', "there's no way to verify if a creator claimed their cryptobot fees, so the main catalyst on this trade is invisible unless a creator tweets about it or buys, which is a much bigger ask than simply claiming their fees.", 'Exit · $130k mcap'),
      entry('GENERAL_THOUGHT', 'Sep 10', 'Made by a developer that pumps out a bunch of tokens, which usually die, not sure that this project will get long term support. (https://x.com/buildersdao__)', 'General buy/sell thoughts')
    ]
  }),
  makePosition({
    id: 'yo-yo', symbol: 'Yo-Yo', short: 'YO', status: 'open', opened: 'Sep 10', size: '$125.7k mcap',
    thesis: [entry('BUY', 'Sep 10', 'Has a suite of really great tools for managing coins, much more like a stock with voting, dividend distribution, and useful community tools. I like that fees have been going back to buy the token, showing how the technology can be used. Also, it was a slow cooker went to this market cap over the last two hours showing no huge dev buys or risk of bundles.', 'Entry · $125.7k mcap')]
  }),
  makePosition({
    id: 'prst', symbol: 'PRST', short: 'PR', status: 'closed', opened: 'Sep 10', size: '$51k mcap',
    thesis: [
      entry('BUY', 'Sep 10', "Perps on stocks are really valuable to unlock onchain and also potentially pair in meme coin pairs. had been seeing this website around but it wasn't the legit contract. Saw the official Twitter account twe,et the contract address and it matched what it said on the website as well.", 'Entry · $51k mcap'),
      entry('SELL', 'Sep 10', "We're in an meta of slop code apps. People are reaching out and paying legitimately good devs to make nice websites just to rug them. I looked at the website and it seemed pretty clod coded without great warning of why this was valuable, which I could articulate pretty easily and it's not a very hard concept, decided to sell into the hype and not risk losing my whole position on a rug. No reputable followers or doxxed dev", 'Exit · $58k mcap')
    ]
  }),
  makePosition({
    id: 'mirror', symbol: 'Mirror', short: 'MI', status: 'closed', opened: 'Sep 10', size: '$115.9k mcap',
    thesis: [
      entry('BUY', 'Sep 10', "Website and the website wasn't as slop coded, like definitely AI usage, but it was used thoughtfully with good design. and I like the copy trading concept and I clicked into some portfolios and they seemed like everything was functioning on the website.", 'Entry · $115.9k mcap'),
      entry('SELL', 'Sep 10', "Price action did not continue upwards. I also looked at the privacy policy in terms of service and those had straight AI isms showing that care was not taken on the whole site but only the parts that people would see, which to me indicates not a long lasting project, especially when the privacy policy in terms were really short. there was also no docs dev and again it's a slop code meta", 'Exit · $86.9k mcap')
    ]
  }),
  makePosition({
    id: 'infinite', symbol: 'INFINITE', short: 'IN', iconClass: 'green', status: 'closed', opened: 'Sep 10', size: '$244k mcap',
    thesis: [
      entry('BUY', 'Sep 10', 'Basically instead of letting you pair with whatever you want, each launch on the launch pad is paired with the token that launched before it. So you basically get a nesting doll structure of fees where every single coin that launches on the launch pad pushes up and creates buying pressure on each coin that\'s launched before it.', 'Entry · $244k mcap'),
      entry('SELL', 'Sep 10', "The problem with infinite mechanism is it's a good mechanism, but this dude is a retard and charged one percent fee on every pool to launch down the chain. So there's no reason to launch token number ten because your buyers are literally getting charged ten percent and it gets worse if it were to continue. So the Ponzi dies really fast because right now we're at like token ten and there's literally no reason to launch a new token on the launch pad. It's a really good idea, but executed very poorly", 'Exit · $146.8k mcap')
    ]
  }),
  makePosition({
    id: 'styx', symbol: 'STYX', short: 'ST', status: 'closed', opened: 'Sep 10', size: '$190.2k mcap',
    thesis: [
      entry('BUY', 'Sep 10', 'Privacy algorithmic stablecoin. Really did not like this site initially, but I liked the concept. Found out that the dev is building out in the open and I knew who it was so now can trust the mechanism. Haven’t researched too much but it’s worth a bid at this price. Being undervalued bc website is so shit.', 'Entry · $190.2k mcap'),
      entry('SELL', 'Sep 10', 'Website no longer hosted lol', 'Exit · $80k mcap')
    ]
  }),
  makePosition({
    id: 'fatcoin', symbol: 'Fatcoin', short: 'FA', status: 'closed', opened: 'Sep 10', size: '$3.12M mcap',
    thesis: [
      entry('BUY', 'Sep 10', 'Huge runner, drawn down massively from peak. Think the stock pair narrative still has legs, and getting what was one of the top three assets at a massive, massive discount here. Also called by Cooker', 'Entry · $3.12M mcap'),
      entry('SELL', 'Sep 10', 'Need liquidity to mint Hashcats', 'Exit · $2.8ishM mcap')
    ]
  }),
  makePosition({
    id: 'rialto', symbol: 'Rialto', short: 'RI', status: 'open', opened: 'Sep 10', size: '$907.45k mcap',
    thesis: [entry('BUY', 'Sep 10', 'x402, that enables agents to purchase inference using the token, a good tokenomics and agentic model, and may partner with Venice as a catalyst later, called by Melon', 'Entry · $907.45k mcap')]
  }),
  makePosition({
    id: 'indicis', symbol: 'Indicis', short: 'IN', status: 'open', opened: 'Sep 11', size: '$62.14k mcap', holdThesisRequired: true,
    thesis: [
      entry('BUY', 'Sep 11', 'Undervalued for the price, good concept to have indexes paired with tokens', 'Entry · $62.14k mcap'),
      entry('SELL', 'Sep 11', 'Sold half to take initials with profit; hit an ATH candle. Holding rest.', 'Partial exit · $212.99k mcap'),
      entry('SELL', 'Sep 11', 'Looks dead, realizing tax losses', 'Tax-loss exit · $33k mcap')
    ]
  }),
  makePosition({
    id: 'sheared', symbol: 'Sheared', short: 'SH', status: 'open', opened: 'Sep 11', size: '$30k mcap',
    thesis: [entry('BUY', 'Sep 11', 'Meteora on Robinhood chain allows people to create LPs with custom assets. Sketchy because no contract address on site, but official account tweeted. Degen at small size for asymmetric upside', 'Entry · $30k mcap')]
  }),
  makePosition({
    id: 'laura', symbol: 'LAURA', short: 'LA', status: 'closed', opened: 'Sep 11', size: '$300k mcap',
    thesis: [
      entry('BUY', 'Sep 11', 'First ai agent on stonkbrokers launchpad', 'Entry · $300k mcap'),
      entry('SELL', 'Sep 11', "Realized I don’t have personal conviction here", 'Exit · $270k mcap')
    ]
  }),
  makePosition({
    id: 'ffstr', symbol: 'FFSTR', short: 'FF', status: 'closed', opened: 'Sep 11', size: '$300k mcap',
    thesis: [
      entry('BUY', 'Sep 11', 'Looks interesting, buying fruit fly stickers on CS, has done well before (Multi Ms)', 'Entry · $300k mcap'),
      entry('SELL', 'Sep 11', 'Extremely heavily bundled (70%)', 'Exit · $300k mcap')
    ]
  }),
  makePosition({
    id: 'hent', symbol: 'HENT', short: 'HE', status: 'open', opened: 'Sep 11', size: '$600k mcap',
    thesis: [
      entry('BUY', 'Sep 11', "I really like the branding, and there's a ton of ways they can market this. It's also the first AI pair, and it seems like it'll be the leading AI pair in long XYZ. Feels like the type of branding and community play that can do really well and develop a cult following", 'Entry · $600k mcap'),
      entry('BUY', 'Sep 11', 'Bought more on same thesis at 480k', 'Additional buy · $480k mcap')
    ]
  }),
  makePosition({
    id: 'looong', symbol: 'LOOONG', short: 'LO', status: 'closed', opened: 'Sep 11', size: '$29k mcap',
    thesis: [
      entry('BUY', 'Sep 11', 'Early, 3x long NVDA pair', 'Entry · $29k mcap'),
      entry('SELL', 'Sep 11', 'No motion/activity', 'Exit · $25k mcap')
    ]
  }),
  makePosition({ id: 'moo', symbol: 'MOO', short: 'MO', opened: 'Before Sep 10', size: 'Imported holding', holdThesisRequired: true }),
  makePosition({
    id: 'cme', symbol: 'CME', short: 'CM', opened: 'Before Sep 10', size: 'Imported holding', holdThesisRequired: true,
    thesis: [entry('SELL', 'Sep 11', 'GAGE is at 2M and I wanna buy the dip; like upside there and have more personal conviction', 'Sell note · $8M mcap')]
  }),
  makePosition({ id: 'meme', symbol: 'MEME', short: 'ME', opened: 'Before Sep 10', size: 'Imported holding', holdThesisRequired: true }),
  makePosition({ id: 'gage', symbol: 'GAGE', short: 'GA', opened: 'Before Sep 10', size: 'Imported holding', holdThesisRequired: true }),
  makePosition({ id: 'pons', symbol: 'PONS', short: 'PO', opened: 'Before Sep 10', size: 'Imported holding', holdThesisRequired: true })
];

const state = {
  positions: loadPositions(),
  selectedId: 'tgcoins',
  filter: 'all',
  eventType: 'HOLD'
};

function loadPositions() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : structuredClone(seedPositions);
  } catch (_error) {
    return structuredClone(seedPositions);
  }
}

function persist() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.positions));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[character]));
}

function selectedPosition() {
  return state.positions.find((position) => position.id === state.selectedId) || state.positions[0];
}

function hasEvent(position, type) {
  return position.thesis.some((event) => event.type === type);
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
  const coverage = state.positions.length ? Math.round((state.positions.filter((position) => hasEvent(position, 'BUY')).length / state.positions.length) * 100) : 0;
  document.querySelector('#openPositionsMetric').textContent = String(open);
  document.querySelector('#realizedPnlMetric').textContent = `$${realized.toFixed(2)}`;
  document.querySelector('#realizedPnlMetric').classList.toggle('positive', realized >= 0);
  document.querySelector('#realizedPnlMetric').classList.toggle('negative', realized < 0);
  document.querySelector('#coverageMetric').textContent = `${coverage}%`;
  document.querySelector('#coverageProgress').style.width = `${coverage}%`;
  document.querySelector('#gapCount').textContent = String(state.positions.filter(isThesisGap).length);
}

function renderPositionList() {
  const list = document.querySelector('#positionList');
  const positions = filteredPositions();
  if (!positions.length) {
    list.innerHTML = '<div class="timeline-empty"><div class="empty-icon">○</div><h3>No matching positions</h3><p>Try another view to see the rest of the journal.</p></div>';
    return;
  }
  list.innerHTML = positions.map((position) => `
    <button class="position-row ${position.id === state.selectedId ? 'is-selected' : ''}" data-position-id="${escapeHtml(position.id)}" type="button">
      <span class="position-primary">
        <span class="token-icon ${escapeHtml(position.iconClass)}">${escapeHtml(position.short)}</span>
        <span><span class="position-name">${escapeHtml(position.symbol)}</span><span class="position-meta">${escapeHtml(position.opened)} · ${escapeHtml(position.size)}</span></span>
      </span>
      <span class="position-right"><span class="position-pnl ${String(position.pnl).startsWith('-') ? 'negative' : 'positive'}">${escapeHtml(position.pnl)}</span><span class="position-status ${position.status}">${escapeHtml(position.holdThesisRequired && !hasEvent(position, 'HOLD') ? 'hold thesis needed' : position.status)}</span></span>
    </button>`).join('');
}

function renderTimeline() {
  const position = selectedPosition();
  if (!position) return;
  document.querySelector('#timelineTitle').textContent = `${position.symbol} thesis timeline`;
  document.querySelector('#selectedPositionSummary').innerHTML = `
    <div class="summary-token"><span class="token-icon ${escapeHtml(position.iconClass)}">${escapeHtml(position.short)}</span><span><strong>${escapeHtml(position.symbol)}</strong><span>${escapeHtml(position.status)} position · ${escapeHtml(position.value)} current value</span>${position.holdThesisRequired && !hasEvent(position, 'HOLD') ? '<span class="summary-hold-note">Hold thesis needed</span>' : ''}</span></div>
    <div class="summary-value"><strong>${escapeHtml(position.pnl)}</strong><span>${escapeHtml(position.pnlPercent)} since entry</span></div>`;
  const timeline = document.querySelector('#timeline');
  const empty = document.querySelector('#timelineEmpty');
  if (!position.thesis.length) {
    timeline.innerHTML = '';
    document.querySelector('#timelineEmpty h3').textContent = position.holdThesisRequired ? 'Add your hold thesis' : 'Start the thesis timeline';
    document.querySelector('#timelineEmpty p').textContent = position.holdThesisRequired
      ? 'Write down why you are still holding this position.'
      : 'Write down what you believe before the next decision changes the trade.';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  timeline.innerHTML = position.thesis.map((event) => {
    const kind = event.type === 'GENERAL_THOUGHT' ? 'general' : event.type.toLowerCase();
    return `<article class="timeline-event"><span class="timeline-marker ${kind}"></span><div class="timeline-topline"><span class="timeline-type">${escapeHtml(event.type.replace('_', ' '))}</span><span class="timeline-date">${escapeHtml(event.date)}</span></div><p class="timeline-copy">${escapeHtml(event.text)}</p><div class="timeline-tags"><span class="timeline-tag">${escapeHtml(event.context || 'Personal note')}</span>${event.confidence ? `<span class="timeline-tag">${escapeHtml(event.confidence)} confidence</span>` : ''}</div></article>`;
  }).join('');
}

function render() {
  renderMetrics();
  renderPositionList();
  renderTimeline();
  document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('is-active', item.dataset.filter === state.filter));
  document.querySelector('#lastSyncMetric').textContent = 'Local';
  document.querySelector('#lastSyncNote').textContent = `${state.positions.length} imported positions`;
}

function openComposer() {
  document.querySelector('#composerPanel').classList.add('is-open');
  document.querySelector('#thesisText').focus();
  document.querySelector('#composerPanel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function closeComposer() {
  document.querySelector('#composerPanel').classList.remove('is-open');
}

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

document.querySelector('#thesisForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const position = selectedPosition();
  const text = document.querySelector('#thesisText').value.trim();
  if (!position || !text) return;
  const confidence = document.querySelector('#confidenceField').value;
  position.thesis.push({ type: state.eventType, date: 'Just now', text, confidence, context: 'Personal note' });
  if (state.eventType === 'HOLD') position.holdThesisRequired = false;
  persist();
  document.querySelector('#thesisText').value = '';
  document.querySelector('#confidenceField').value = '';
  closeComposer();
  render();
});

document.querySelector('#newThesisButton').addEventListener('click', openComposer);
document.querySelector('#timelineAddButton').addEventListener('click', openComposer);
document.querySelector('#emptyAddButton').addEventListener('click', openComposer);
document.querySelector('#closeComposerButton').addEventListener('click', closeComposer);
document.querySelector('#refreshButton').addEventListener('click', () => {
  const button = document.querySelector('#refreshButton');
  button.textContent = '✓';
  document.querySelector('#freshnessLabel').innerHTML = '<span class="freshness-dot"></span> Notes refreshed';
  window.setTimeout(() => { button.textContent = '↻'; }, 900);
});
document.querySelector('#viewAllButton').addEventListener('click', () => {
  state.filter = 'all';
  render();
});

render();
