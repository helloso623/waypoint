# Arcade: adaptive PLAY arena

- Goal: one giant PLAY button starts a random adaptive match; intention: deliberate learning feels rewardingly addictive and skill-honest.
- Replace game grid as primary action; move manual game selection behind secondary `Training Lab`.
- PLAY button: centered rounded-hex/circle, min 280x280 desktop, 180x180 mobile, label `PLAY`, sublabel `Adaptive match`.
- PLAY idle: 2.4s breathing scale 1.0->1.035, rotating neon rim, tiny particle orbit; readable text always.
- PLAY press: depress 8px, rim collapses inward, screen snaps black 90ms, match intro slams in.
- Rival card anatomy: face, name, league badge, title, Elo, mood, strengths, weaknesses, last adaptation, taunt.
- Rival example: `Mika Volt`, `Founder League`, `Elo 1240`, strength `reaction`, weakness `logic`, taunt `I trained your slow starts.`
- BACKEND persist rival: stable id/name/face, Elo, league, strengths/weaknesses, adaptation history, per-game performance model.
- Rival adaptation: after each match adjust rival speed/accuracy/distractor profile based on user history; show exact adaptation post-match.
- Leagues: Campus, Founder, Mythic; each changes palette, rival confidence, difficulty range, trophy stakes.
- Campus palette: blue/teal/white; Founder palette: amber/violet/black; Mythic palette: crimson/gold/deep navy.
- Trophy road: horizontal reward path, 10-node chunks, current node centered, locked nodes faded but visible.
- First 10 nodes: 1 `+50 coins`; 2 `Campus rival unlock`; 3 `Signal Storm badge`; 4 `+75 coins`; 5 `bronze chest`; 6 `Memory Constellation skin`; 7 `+1 trophy`; 8 `rival dialogue pack`; 9 `+100 coins`; 10 `Founder League qualifier`.
- Canvas game Signal Storm: target symbol appears top-left; click matching moving symbols only; score = hits * combo - false hits; juice = target explosions, combo lightning.
- Canvas game Memory Constellation: watch star path, redraw by dragging through nodes; score = path accuracy + speed; juice = stars ignite and constellation stamp.
- Canvas game Factory Routing: flip gates to route colored packets to matching exits; score = delivered packets - jams; juice = conveyor speedup, sparks on perfect routing.
- Canvas game Pitch Dodge: objections fly toward founder avatar; choose/type concise answer; score = clarity + speed + survival; juice = objection shatters into applause.
- Canvas game Circuit Sprint: drag logic components to complete circuit; score = correctness + remaining voltage; juice = board lights up, voltage wave travels.
- Canvas game Time Forge: hold/release to match hidden durations under distractions; score = timing accuracy streak; juice = anvil strike, molten perfect ring.
- Juicy feedback everywhere: screen shake on near miss, combo meter, slow-motion perfects, coin bursts, rival reactions, readable high-contrast text.
- Readable-text rule: no tiny muted labels over neon; all gameplay text minimum 16px, contrast checked against background, shadow/backplate when over canvas.
- Difficulty: adaptive but honest; do not lower quality of tests for rewards; show league/difficulty before and after.
- Match intro: VS screen with user card vs rival card, league emblem, selected game, stakes, rival taunt; 1200ms max unless skipped.
- Post-match screen: winner banner, user score, rival score, trophy delta, coin delta, skill breakdown, rival adaptation note, replay, next PLAY.
- Post-match exact feedback: e.g. `Accuracy rose 8%, reaction fell 3%, rival will train distractors next.`
- Rewards: coins/trophies only for completed legitimate matches; failed/quit matches can show practice note but no fake reward.
- Optional sound: PLAY whoosh, perfect sparkle, mistake thunk, trophy arpeggio, coin cascade; default off.

Impress the owner: at least one moment in this zone must make him say 'insane'.
