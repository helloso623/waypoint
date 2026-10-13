# Parallel RPG transformation

- Goal: replace chatbot feel with tabletop-RPG screen; intention: live a parallel life that is brutally fair, with earned consequence.
- FRONTEND layout: top HUD 7%, main scene 63%, bottom command bar 14%, left rail 18% width, right rail 24% width, center scene remaining 58%.
- FRONTEND rails collapse to icon stacks but never disappear; scene remains cinematic with fog/particles/typewritten GM text.
- FRONTEND Panel 1 Scene: generated/placeholder art, location, date, weather/mood, latest GM narration; empty `The world has not formed yet - begin with one action.`
- FRONTEND Panel 2 Character: portrait, name, class/archetype, traits, wounds, relationships, current objective; empty silhouette + `Character unknown.`
- FRONTEND Panel 3 Inventory: 5x4 parchment slots, item icon, rarity edge, quantity, effect tooltip, origin line; empty `Your pack is empty. Earn or discover items.`
- FRONTEND Panel 4 Map: illustrated world image, canvas fog overlay, markers, current-location pulse, route lines; empty parchment grid + `No map drawn yet.`
- FRONTEND Panel 5 Quests: tabs Active, Rumors, Consequences, Completed; entries show title, stakes, next move, risk; empty `No active quest is pulling on you.`
- FRONTEND Panel 6 Chronicle: paged book of past scenes, dates, choices, outcomes, thumbnails; empty `The chronicle begins after the first turn.`
- FRONTEND command bar: bottom input as action declaration, not chat box; examples `Scout the road`, `Negotiate`, `Bend Reality`.
- FRONTEND GM response: typewriter reveal, dice-roll suspense, consequence banner, loot/coin delta, journal page update.
- FRONTEND coins top-right always visible; earn animation spawns 8-16 sprites from result, arcs to counter over 700ms, ticks final 200ms.
- FRONTEND coin spend: counter flashes red-gold, coins fall/fade, reason label e.g. `-35 Bend Reality`.
- FRONTEND Bend Reality button: explicit plot-edit affordance; opens modal with requested change, affected scenes, coin price, fairness warning, before/after summary, confirm `Pay and bend`.
- BACKEND Bend Reality pricing: cosmetic retcon `10 + 2 * scene_age`; minor convenience `30 + 5 * scene_age`; relationship/quest change `80 + 10 * scene_age`; major survival/outcome rewrite `180 + 25 * scene_age`; impossible contradiction blocked.
- BACKEND pricing multipliers: x1.5 affects another character; x2.0 removes a consequence; x0.5 only clarifies ambiguity; enforce server-side, not just UI.
- BACKEND persist state fields: player coins, inventory items, characters, portraits, map asset, revealed fog polygons, quests, chronicle scenes, current location, consequences.
- BACKEND endpoints needed: state summary, action submit/status, inventory, characters, quests, chronicle, map, bend-reality quote/apply, asset generation/retry.
- BACKEND never allow fake progress: actions can fail, cost coins, create wounds, or worsen quests; log why.
- BACKEND portrait prompt: `painted fantasy character portrait, expressive face, 3/4 view, dramatic rim light, parchment UI compatible, no text, no watermark`.
- BACKEND cache portraits by stable character id + prompt hash; regenerate only on explicit `Regenerate portrait`.
- BACKEND map prompt: `top-down fantasy parchment map, readable regions, roads, coastlines, landmarks, blank label spaces, no text, no watermark`.
- FRONTEND fog mechanic: unknown regions are canvas fog blobs; discovering location erases fog in radial mask and persists revealed polygons.
- BACKEND fog mechanic: store revealed polygons/locations; map image stable unless user explicitly regenerates.
- FRONTEND chronicle design: two-page spread; left page narration; right page choice/outcome/loot; page numbers; bookmark ribbon for major events.
- FRONTEND inventory icon fallback: deterministic SVG/icon by item type and rarity if AI art unavailable.
- FRONTEND portrait fallback: deterministic stylized SVG silhouette by character id if generation unavailable.
- FRONTEND map fallback: parchment grid with generated landmark pins; still supports fog and markers.
- FRONTEND optional sound: dice roll wooden dice, quest complete low chord, coin cascade; default off.

Impress the owner: at least one moment in this zone must make him say 'insane'.
