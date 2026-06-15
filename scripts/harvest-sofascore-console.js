// ============================================================================
// Sofascore harvester — BROWSER CONSOLE version (the reliable one).
//
// Sofascore's Cloudflare blocks non-browser TLS fingerprints, so Node's fetch
// gets 403'd even from a residential IP. Running here instead works because the
// request is same-origin and rides your real browser session that already
// cleared Cloudflare — the exact same call the site makes itself.
//
// HOW TO RUN
//   1. Open https://www.sofascore.com in your browser (any page on the site).
//   2. Open DevTools → Console (Cmd-Opt-J on Chrome, Cmd-Opt-C on Safari after
//      enabling the Develop menu). If it warns about pasting, type "allow
//      pasting" and press Enter, then paste.
//   3. Paste this whole file and press Enter. It downloads sofascore.json
//      (also copies it to your clipboard).
//   4. Move that file to data/sofascore.json in the repo, commit, push.
//
// Re-run after each knockout round's draw resolves to pick up new fixtures.
// ============================================================================
(async () => {
  const WC_UNIQUE_TOURNAMENT_ID = 16, SEASON_YEAR = "2026";
  const START = "2026-06-11", END = "2026-07-19";

  const KNOWN = new Set(
    "ARG ESP ENG FRA BRA GER POR MEX COL BEL NED NOR SUI CAN TUR ECU URU USA CRO JPN MAR SEN PAR AUT EGY SCO CZE KOR BIH IRN CIV SWE ALG PAN AUS COD RSA UZB NZL TUN KSA CPV GHA JOR HAI IRQ QAT CUW".split(" ")
  );
  const NAME_TO_CODE = {
    "Argentina":"ARG","Spain":"ESP","England":"ENG","France":"FRA","Brazil":"BRA",
    "Germany":"GER","Portugal":"POR","Mexico":"MEX","Colombia":"COL","Belgium":"BEL",
    "Netherlands":"NED","Norway":"NOR","Switzerland":"SUI","Canada":"CAN",
    "Turkey":"TUR","Türkiye":"TUR","Turkiye":"TUR",
    "Ecuador":"ECU","Uruguay":"URU","USA":"USA","United States":"USA",
    "Croatia":"CRO","Japan":"JPN","Morocco":"MAR","Senegal":"SEN","Paraguay":"PAR",
    "Austria":"AUT","Egypt":"EGY","Scotland":"SCO","Czechia":"CZE","Czech Republic":"CZE",
    "South Korea":"KOR","Korea Republic":"KOR","Korea, South":"KOR",
    "Bosnia & Herzegovina":"BIH","Bosnia and Herzegovina":"BIH","Bosnia-Herzegovina":"BIH",
    "Iran":"IRN","IR Iran":"IRN",
    "Ivory Coast":"CIV","Côte d'Ivoire":"CIV","Cote d'Ivoire":"CIV",
    "Sweden":"SWE","Algeria":"ALG","Panama":"PAN","Australia":"AUS",
    "DR Congo":"COD","Congo DR":"COD","Democratic Republic of Congo":"COD",
    "South Africa":"RSA","Uzbekistan":"UZB","New Zealand":"NZL","Tunisia":"TUN",
    "Saudi Arabia":"KSA","Cape Verde":"CPV","Cabo Verde":"CPV",
    "Ghana":"GHA","Jordan":"JOR","Haiti":"HAI","Iraq":"IRQ","Qatar":"QAT",
    "Curaçao":"CUW","Curacao":"CUW",
  };
  const CODE_ALIAS = {}; // fill if it warns about an unresolved nameCode, e.g. "DRC":"COD"

  const code = t => {
    if(!t) return null;
    const nc = t.nameCode;
    if(nc && CODE_ALIAS[nc]) return CODE_ALIAS[nc];
    if(nc && KNOWN.has(nc)) return nc;
    return (t.name && NAME_TO_CODE[t.name]) || null;
  };
  // Knockout slots are seeded before teams are known ("2A", "1C", "3A/3B…", "G1");
  // skip them quietly instead of flagging them as unresolved real countries.
  const isPlaceholder = n => !n || /[0-9/]/.test(n);

  const dates = [];
  for(let d = new Date(START+"T00:00:00Z"), last = new Date(END+"T00:00:00Z"); d <= last; d.setUTCDate(d.getUTCDate()+1))
    dates.push(d.toISOString().slice(0,10));

  const byId = new Map(), unresolved = new Set();
  let scanned = 0, blocked = 0;
  for(const date of dates){
    try{
      const r = await fetch(`/api/v1/sport/football/scheduled-events/${date}`, { headers: { accept: "application/json" } });
      if(r.status === 404) continue;
      if(!r.ok){ blocked++; console.warn(date, "HTTP", r.status); continue; }
      const events = (await r.json()).events || [];
      scanned += events.length;
      for(const e of events){
        if(e.tournament?.uniqueTournament?.id !== WC_UNIQUE_TOURNAMENT_ID) continue;
        if(e.season?.year && e.season.year !== SEASON_YEAR) continue;
        const c1 = code(e.homeTeam), c2 = code(e.awayTeam);
        if(!c1 && !isPlaceholder(e.homeTeam?.name)) unresolved.add(`${e.homeTeam?.name} [${e.homeTeam?.nameCode}]`);
        if(!c2 && !isPlaceholder(e.awayTeam?.name)) unresolved.add(`${e.awayTeam?.name} [${e.awayTeam?.nameCode}]`);
        if(!c1 || !c2 || !e.customId || !e.slug) continue;
        byId.set(e.customId, {
          c: [c1, c2],
          ts: e.startTimestamp * 1000,
          url: `https://www.sofascore.com/football/match/${e.slug}/${e.customId}`,
        });
      }
    }catch(err){ console.warn(date, err.message); }
    await new Promise(r => setTimeout(r, 150)); // be polite
  }

  const events = [...byId.values()].sort((a, b) => a.ts - b.ts);
  const json = JSON.stringify({ generated: new Date().toISOString(), count: events.length, events }, null, 2) + "\n";
  console.log(`%c✓ ${events.length} World Cup matches`, "color:#56d364;font-weight:bold", `(scanned ${scanned} events, ${blocked} blocked dates)`);
  if(unresolved.size) console.warn("⚠ unresolved teams (add to NAME_TO_CODE / CODE_ALIAS, then re-run):", [...unresolved]);
  if(blocked && !events.length) console.warn("All dates blocked — make sure you're running this ON www.sofascore.com, not another site.");

  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  a.download = "sofascore.json";
  document.body.appendChild(a); a.click(); a.remove();
  try{ copy(json); console.log("(also copied to clipboard — paste into data/sofascore.json)"); }catch{}
})();
