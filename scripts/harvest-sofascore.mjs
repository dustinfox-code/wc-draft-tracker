#!/usr/bin/env node
// ============================================================================
// Harvest Sofascore match-page URLs for the 2026 World Cup → data/sofascore.json
//
// index.html reads that file and deep-links each live/finished score to its
// Sofascore match page (full live + post-match stats: xG, shots, momentum…).
//
// WHY a script instead of fetching from the page: Sofascore's API sits behind
// Cloudflare with no CORS, so a browser on GitHub Pages can't read it. Run this
// from your own machine — a residential IP Cloudflare trusts — and commit the
// JSON. A match's customId is stable once assigned, so you only re-run as new
// fixtures get scheduled: once now for the group stage, then after each
// knockout round's draw resolves (~6 more times across the tournament).
//
// NOTE: Sofascore blocks on TLS fingerprint, so plain Node fetch gets 403'd
// even from a residential IP. This CLI version only works behind a browser-
// impersonating client (e.g. curl-impersonate). For a no-install path that
// always works, use scripts/harvest-sofascore-console.js in your browser's
// devtools instead — see README "Updating the Sofascore links".
//
// Usage:  node scripts/harvest-sofascore.mjs
// Requires Node 18+ (built-in fetch). No dependencies.
// ============================================================================

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const WC_UNIQUE_TOURNAMENT_ID = 16;        // FIFA World Cup (men)
const SEASON_YEAR = "2026";
const START = "2026-06-11";                // tournament window (inclusive)
const END   = "2026-07-19";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "sofascore.json");

// Sofascore's team `nameCode` already equals our FIFA code in almost every
// case (MEX, RSA, KOR, CZE …). KNOWN lets us trust nameCode when it's one of
// ours; NAME_TO_CODE is the name-based fallback; CODE_ALIAS handles any code
// that Sofascore spells differently. Mirrors NAME_TO_CODE in index.html.
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
// Fill these in if the script warns about an unresolved nameCode, e.g. "DRC":"COD".
const CODE_ALIAS = {};

function resolveCode(team){
  if(!team) return null;
  const nc = team.nameCode;
  if(nc && CODE_ALIAS[nc]) return CODE_ALIAS[nc];
  if(nc && KNOWN.has(nc)) return nc;
  if(team.name && NAME_TO_CODE[team.name]) return NAME_TO_CODE[team.name];
  return null;
}
// Knockout slots are seeded before teams are known ("2A", "1C", "3A/3B…", "G1");
// skip them quietly instead of flagging them as unresolved real countries.
const isPlaceholder = n => !n || /[0-9/]/.test(n);

function dateRange(start, end){
  const out = [], d = new Date(start+"T00:00:00Z"), last = new Date(end+"T00:00:00Z");
  while(d <= last){ out.push(d.toISOString().slice(0,10)); d.setUTCDate(d.getUTCDate()+1); }
  return out;
}

const HEADERS = {
  "User-Agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Accept":"application/json",
  "Referer":"https://www.sofascore.com/",
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchDate(date){
  const url = `https://www.sofascore.com/api/v1/sport/football/scheduled-events/${date}`;
  const r = await fetch(url, { headers: HEADERS });
  if(r.status === 404) return [];                 // no events bucketed on this date
  if(!r.ok) throw new Error(`${date}: HTTP ${r.status}`);
  return (await r.json()).events || [];
}

async function main(){
  const byId = new Map();          // customId → entry (dedupe across date buckets)
  const unresolved = new Set();
  let scanned = 0;
  for(const date of dateRange(START, END)){
    let events;
    try{ events = await fetchDate(date); }
    catch(e){ console.error(`! ${e.message} — skipping`); await sleep(1500); continue; }
    scanned += events.length;
    for(const e of events){
      if(e.tournament?.uniqueTournament?.id !== WC_UNIQUE_TOURNAMENT_ID) continue;
      if(e.season?.year && e.season.year !== SEASON_YEAR) continue;
      const c1 = resolveCode(e.homeTeam), c2 = resolveCode(e.awayTeam);
      if(!c1 && !isPlaceholder(e.homeTeam?.name)) unresolved.add(`${e.homeTeam?.name} [${e.homeTeam?.nameCode}]`);
      if(!c2 && !isPlaceholder(e.awayTeam?.name)) unresolved.add(`${e.awayTeam?.name} [${e.awayTeam?.nameCode}]`);
      if(!c1 || !c2 || !e.customId || !e.slug) continue;
      byId.set(e.customId, {
        c: [c1, c2],
        ts: e.startTimestamp * 1000,
        url: `https://www.sofascore.com/football/match/${e.slug}/${e.customId}`,
      });
    }
    await sleep(400);              // be polite
  }
  const events = [...byId.values()].sort((a, b) => a.ts - b.ts);
  await writeFile(OUT, JSON.stringify({ generated: new Date().toISOString(), count: events.length, events }, null, 2) + "\n");
  console.log(`✓ wrote ${events.length} matches → data/sofascore.json  (scanned ${scanned} events)`);
  if(unresolved.size)
    console.warn(`⚠ unresolved teams (add to NAME_TO_CODE / CODE_ALIAS, then re-run):\n  ${[...unresolved].join("\n  ")}`);
  if(!events.length)
    console.warn("⚠ no World Cup matches found. If this is a 403/Cloudflare issue, retry (residential IP, VPN off).");
}

main().catch(e => { console.error(e); process.exit(1); });
