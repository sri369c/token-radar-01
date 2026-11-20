/* Token Radar: renders window.RADAR (written by main.ts) as a sortable, filterable board.
   No network, no framework: one script, the data beside it. */
(() => {
  const R = window.RADAR;
  if (!R || !Array.isArray(R.rows)) {
    document.getElementById('board').innerHTML = '<p class="empty">No radar data: run main.ts to write data.js.</p>';
    return;
  }

  const el = (id) => document.getElementById(id);
  const state = { tab: 'board', q: '', cat: 'all', chain: 'all', sort: 'rank', watch: false, sel: null };

  const usd = (n) => {
    if (n === null || n === undefined || Number.isNaN(n)) return '—';
    const a = Math.abs(n);
    if (a >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
    return '$' + n.toFixed(0);
  };
  const pct = (v) => (v === null || v === undefined ? '<span class="flat">no record</span>' : `<span class="${v > 0 ? 'up' : v < 0 ? 'down' : 'flat'}">${v > 0 ? '+' : ''}${v.toFixed(1)}%</span>`);
  const age = (d) => (d === null ? '<span class="flat">unknown</span>' : d >= 730 ? (d / 365).toFixed(1) + ' y' : d + ' d');
  const esc = (s) => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const categories = [...new Set(R.rows.map((r) => r.cat).filter(Boolean))].sort();
  const chains = [...new Set(R.rows.flatMap((r) => r.chains))].sort();
  const maxIv = Math.max(...R.rows.map((r) => r.iv), 1);

  /* ---------------------------------------------------------------- chrome */
  el('snap').textContent = `snapshot as of ${R.as_of} · ${R.counts.protocols} protocols recorded · ${R.counts.watchlist} on the watchlist · model ${R.model.version}`;
  el('foot').textContent = `Data: ${R.source}. A protocol here records no token: that is the snapshot's record, not proof it has none. Implied values are this radar's claim, never a promise of a launch.`;

  const tabs = [
    ['board', 'Board'],
    ['live', 'Live tokens'],
    ['method', 'Method'],
  ];
  el('tabs').innerHTML = tabs
    .map(([id, label]) => `<button type="button" data-tab="${id}" aria-selected="${id === state.tab}">${label}</button>`)
    .join('');

  el('cat').innerHTML = `<option value="all">All categories</option>${categories.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}`;
  el('chain').innerHTML = `<option value="all">All chains</option>${chains.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}`;

  /* ---------------------------------------------------------------- data */
  const matches = (r) => {
    if (state.watch && !r.watch) return false;
    if (state.cat !== 'all' && r.cat !== state.cat) return false;
    if (state.chain !== 'all' && !r.chains.includes(state.chain)) return false;
    if (state.q) {
      const q = state.q.toLowerCase();
      const hay = [r.name, r.slug, r.cat || '', ...r.chains].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  };

  const SORTS = {
    rank: (a, b) => a.rank - b.rank,
    tvl: (a, b) => b.tvl - a.tvl,
    growth: (a, b) => (b.ch7 ?? -999) - (a.ch7 ?? -999),
    age: (a, b) => (b.age ?? -1) - (a.age ?? -1),
  };

  const visible = () => R.rows.filter(matches).sort(SORTS[state.sort] || SORTS.rank);

  /* ---------------------------------------------------------------- board */
  function boardTable(rows) {
    if (!rows.length) return '<p class="empty">No protocol matches this filter. Clear the search or pick another category.</p>';
    const body = rows
      .map(
        (r) => `<tr class="row" data-slug="${esc(r.slug)}" tabindex="0" aria-selected="${state.sel === r.slug}">
        <td class="rank">${r.rank}</td>
        <td><div class="who"><span class="n">${esc(r.name)}</span><span class="s">${esc(r.slug)}</span></div></td>
        <td>${r.cat ? `<span class="pill${r.watch ? ' watch' : ''}">${esc(r.cat)}</span>` : '<span class="flat">no category</span>'}</td>
        <td class="chains">${esc(r.chains.slice(0, 3).join(' · '))}${r.chains.length > 3 ? ` +${r.chains.length - 3}` : ''}</td>
        <td class="num">${usd(r.tvl)}</td>
        <td class="num">${pct(r.ch7)}</td>
        <td class="num">${age(r.age)}</td>
        <td class="num value">${usd(r.iv)}</td>
        <td><div class="bar" title="implied value, scaled to the board's largest"><i style="width:${Math.max(2, Math.round((r.iv / maxIv) * 100))}%"></i></div></td>
      </tr>`,
      )
      .join('');
    return `<div class="tablewrap"><table>
      <thead><tr>
        <th scope="col">#</th><th scope="col">Protocol</th><th scope="col">Category</th><th scope="col">Chains</th>
        <th scope="col" style="text-align:right">TVL</th><th scope="col" style="text-align:right">7d</th>
        <th scope="col" style="text-align:right">No token for</th><th scope="col" style="text-align:right">Implied value</th><th scope="col"></th>
      </tr></thead><tbody>${body}</tbody></table></div>`;
  }

  function liveTable() {
    const rows = R.live.slice().sort(state.sort === 'tvl' ? (a, b) => b.tvl - a.tvl : (a, b) => b.mcap - a.mcap);
    const body = rows
      .map(
        (l) => `<tr>
        <td><div class="who"><span class="n">${esc(l.name)}</span><span class="s">${esc(l.slug)}</span></div></td>
        <td>${l.cat ? `<span class="pill">${esc(l.cat)}</span>` : '<span class="flat">no category</span>'}</td>
        <td class="chains">${esc(l.chains.slice(0, 3).join(' · '))}</td>
        <td class="num">${usd(l.tvl)}</td>
        <td class="num">${pct(l.ch7)}</td>
        <td class="num"></td>
        <td class="num">${l.sym ? esc(l.sym) : '—'}</td>
        <td class="num value">${usd(l.mcap)}</td>
        <td class="num">${l.mcapOverTvl ? l.mcapOverTvl.toFixed(2) + 'x' : '—'}</td>
      </tr>`,
      )
      .join('');
    return `<div class="tablewrap"><table>
      <thead><tr><th scope="col">Protocol</th><th scope="col">Category</th><th scope="col">Chains</th>
      <th scope="col" style="text-align:right">TVL</th><th scope="col" style="text-align:right">7d</th><th></th>
      <th scope="col" style="text-align:right">Ticker</th><th scope="col" style="text-align:right">Market cap</th>
      <th scope="col" style="text-align:right">Cap / TVL</th></tr></thead><tbody>${body}</tbody></table></div>`;
  }

  function methodPanel() {
    const c = R.model.constants;
    const sectors = Object.entries(R.model.sectors)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `<li>${esc(k)} ${v}</li>`)
      .join('');
    return `<div class="panel">
      <h2>How the implied value is built</h2>
      <p>One function scores every protocol. It reads only the snapshot's own figures: the protocol's TVL, its seven-day change, and how long it has run while recording no token. No name is special-cased and no outside price is used.</p>
      <code class="formula">sector      = the table below, by category (default ${c.default_multiple})
base        = tvl_usd x sector
growth      = clamp(change_7d, ${c.growth_floor}, ${c.growth_cap}) per cent
growthMult  = 1 + (growth / 100) x ${c.growth_weight}
maturity    = ${c.maturity_floor} + min(age_days, ${c.maturity_days}) / ${c.maturity_days} x ${c.maturity_range}
reach       = 1 + (min(chains, ${c.reach_cap}) - 1) x ${c.reach_step}
implied_usd = max(1, round(base x growthMult x maturity x reach))</code>
      <p>Age is the days from the day DefiLlama began tracking the protocol to the snapshot's date; a protocol with no such date is scored at ${c.unknown_age_days} days. A faster-growing protocol earns a premium, a shrinking one a discount, and a long record without a token earns a little more than a new one: the model prices a claim on a protocol that has survived, not a countdown to a launch.</p>
    </div>
    <div class="panel"><h2>What a sector's token is worth per dollar of TVL</h2><p>The multiple is the model's whole opinion: fee-earning venues keep more of their TVL as token value than bridges do, and a chain keeps most.</p><ul class="sectors">${sectors}</ul></div>
    <div class="cols">
      <div class="panel"><h2>The watchlist is a floor</h2><p>The snapshot's watchlist holds the ${R.counts.watchlist} protocols that record no token, sit at or above ${usd(R.floor_usd)} of TVL, and are not a wrapped, staked or bridged product of a token that already trades. Every one of them is on the board, and ${R.counts.early} more rows are pre-token protocols the rule left out: the early ones the radar exists to find.</p></div>
      <div class="panel"><h2>What the board is not</h2><p>A protocol here records no token; the record is DefiLlama's, not proof. Nothing on this page predicts whether or when a token is issued, and no implied value is advice: it is the model's claim about what a token would be worth if the record stayed as it is.</p></div>
    </div>
    <div class="panel"><h2>Farm plans</h2><p>Every row carries a plan: the position to open on that protocol, what it costs in gas, how long it takes, and the two steps that matter after it, the sustain-and-track habits and the exit signal. They are written per category and per protocol's own chains, not copied from a template list of names.</p></div>`;
  }

  /* ---------------------------------------------------------------- detail */
  function openDetail(slug) {
    const r = R.rows.find((x) => x.slug === slug);
    const box = el('detail');
    if (!r) {
      box.hidden = true;
      return;
    }
    const steps = r.steps
      .map(([action, cost, time]) => `<li>${esc(action)}<span class="meta">Cost: ${esc(cost)} · Time: ${esc(time)}</span></li>`)
      .join('');
    box.innerHTML = `<button type="button" class="close" aria-label="Close detail">×</button>
      <p class="kicker">Rank ${r.rank} of ${R.counts.rows} · ${r.watch ? 'on the watchlist' : 'off the watchlist, still pre-token'}</p>
      <h2>${esc(r.name)}</h2>
      <p class="sub">${esc(r.slug)}${r.cat ? ' · ' + esc(r.cat) : ''}${r.chains.length ? ' · ' + esc(r.chains.join(', ')) : ''}</p>
      <dl>
        <dt>TVL</dt><dd>${usd(r.tvl)}</dd>
        <dt>Seven-day change</dt><dd>${r.ch7 === null ? 'no record' : (r.ch7 > 0 ? '+' : '') + r.ch7.toFixed(1) + '%'}</dd>
        <dt>Recording no token for</dt><dd>${r.age === null ? 'unknown' : r.age + ' days'}</dd>
        <dt>Implied value</dt><dd>${usd(r.iv)}</dd>
      </dl>
      <h3>How the number was built</h3>
      <dl>
        <dt>Sector multiple, ${esc(r.cat || 'no category')}</dt><dd>${r.parts.sector}</dd>
        <dt>Base = TVL × sector</dt><dd>${usd(r.parts.base)}</dd>
        <dt>Growth multiplier, seven-day (${r.parts.growth > 0 ? '+' : ''}${r.parts.growth.toFixed(1)}%)</dt><dd>${r.parts.growth_mult.toFixed(3)}x</dd>
        <dt>Maturity multiplier</dt><dd>${r.parts.maturity_mult.toFixed(3)}x</dd>
        <dt>Reach multiplier, ${r.chains.length} chain${r.chains.length === 1 ? '' : 's'}</dt><dd>${r.parts.reach_mult.toFixed(3)}x</dd>
      </dl>
      <h3>How to farm it before a token</h3>
      <ol>${steps}</ol>
      <p class="note">This protocol records no token in the snapshot. That is a record, not a promise: nothing here says one is coming, and no step above is worth a position you would miss.</p>`;
    box.hidden = false;
    box.querySelector('.close').addEventListener('click', closeDetail);
  }

  function closeDetail() {
    state.sel = null;
    el('detail').hidden = true;
    document.querySelectorAll('tr.row[aria-selected="true"]').forEach((tr) => tr.setAttribute('aria-selected', 'false'));
  }

  /* ---------------------------------------------------------------- render */
  function render() {
    document.querySelectorAll('#tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === state.tab)));

    const controls = el('controls');
    controls.style.display = state.tab === 'method' ? 'none' : '';

    if (state.tab === 'board') {
      const rows = visible();
      el('count').innerHTML = `<b>${rows.length}</b> of ${R.counts.rows} ranked rows shown · ${R.counts.early} early rows below the watchlist floor · ${R.counts.live} live-token protocols kept apart`;
      el('board').innerHTML = boardTable(rows);
      el('board').hidden = false;
      el('method').hidden = true;
    } else if (state.tab === 'live') {
      el('count').innerHTML = `<b>${R.live.length}</b> protocols whose token already trades, at the market's own values and never ranked with the pre-token board`;
      el('board').innerHTML = liveTable();
      el('board').hidden = false;
      el('method').hidden = true;
    } else {
      el('count').innerHTML = 'The model, its constants and what this board does not claim';
      el('board').hidden = true;
      el('method').hidden = false;
      el('method').innerHTML = methodPanel();
    }

    el('board').querySelectorAll('tr.row').forEach((tr) => {
      tr.addEventListener('click', () => {
        state.sel = tr.dataset.slug;
        document.querySelectorAll('tr.row').forEach((x) => x.setAttribute('aria-selected', String(x === tr)));
        openDetail(state.sel);
      });
      tr.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          tr.click();
        }
      });
    });
  }

  /* ---------------------------------------------------------------- events */
  el('tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]');
    if (!b) return;
    state.tab = b.dataset.tab;
    if (state.tab !== 'board') closeDetail();
    render();
  });
  el('q').addEventListener('input', (e) => {
    state.q = e.target.value.trim();
    render();
  });
  el('cat').addEventListener('change', (e) => {
    state.cat = e.target.value;
    render();
  });
  el('chain').addEventListener('change', (e) => {
    state.chain = e.target.value;
    render();
  });
  el('sort').addEventListener('change', (e) => {
    state.sort = e.target.value;
    render();
  });
  el('watch').addEventListener('change', (e) => {
    state.watch = e.target.checked;
    render();
  });

  /* deep links: index.html?cat=RWA&sort=tvl&q=solana&slug=usdd reopens the same view */
  const params = new URLSearchParams(location.search);
  for (const [key, control] of [['q', 'q'], ['cat', 'cat'], ['chain', 'chain'], ['sort', 'sort']]) {
    const v = params.get(key);
    if (!v) continue;
    state[key] = key === 'q' ? v.trim() : v;
    el(control).value = state[key];
  }
  if (params.get('watch') === '1') {
    state.watch = true;
    el('watch').checked = true;
  }
  if (params.get('tab') === 'method' || params.get('tab') === 'live') state.tab = params.get('tab');
  const sel = params.get('slug');
  if (sel) state.sel = sel;

  render();
  if (state.sel) openDetail(state.sel);
})();
