#!/usr/bin/env python3
"""Hand-authored-looking rooms for the highest-rarity skins."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "static" / "css" / "rooms"

ROOMS = {}


def room(name, css):
    ROOMS[name] = css.strip() + "\n"


room("prism", """
/* Prism Sovereign — dispersion optics.
   One triangular prism on the HUD splits a single beam into
   wavelength bands. Today hours are the spectrum path (Snell),
   not a rainbow curtain on type. Cyan ink on magenta glass. */

html[data-player-skin="prism"] {
  --at-r-plate: 0 28px 0 8px;
  --at-r-card: 0 28px 0 8px;
  --at-r-ctl: 0 10px 0 4px;
  --at-r-chip: 0 8px 0 4px;
  --at-r-cell: 4px 8px 4px 2px;
  --at-font-display: "Iowan Old Style", "Palatino Linotype", Palatino, serif;
  --at-font-ui: "Inter", system-ui, sans-serif;
  --bg-shell: #04161c;
  --bg-card: #0a2a32;
  --ink-primary: #f5e8ff;
  --ink-secondary: #d8b4fe;
  --accent: #e879f9;
  --accent-ink: #041e24;
  --prism-cyan: #22d3ee;
}

html[data-player-skin="prism"] body {
  background:
    radial-gradient(ellipse 48% 36% at 78% 12%, rgba(232, 121, 249, 0.22), transparent 62%),
    linear-gradient(180deg, #062028, #041016) !important;
  color: var(--ink-primary);
}
html[data-player-skin="prism"] body::after {
  z-index: 0;
  pointer-events: none;
  opacity: 0.35;
  background:
    repeating-linear-gradient(118deg,
      transparent 0 18px,
      rgba(34, 211, 238, 0.05) 18px 19px,
      transparent 19px 37px,
      rgba(232, 121, 249, 0.05) 37px 38px);
  animation: room-prism-disperse 18s linear infinite;
}

html[data-player-skin="prism"] .top-hud {
  isolation: isolate;
  background: linear-gradient(90deg, #04161c, #0a2e38 55%, #04161c);
  border-bottom: 1px solid rgba(34, 211, 238, 0.35);
}
html[data-player-skin="prism"] .top-hud::before {
  content: "";
  position: absolute;
  left: 46%;
  bottom: -7px;
  width: 22px;
  height: 18px;
  pointer-events: none;
  background: linear-gradient(135deg, transparent 42%, rgba(245, 232, 255, 0.92) 42% 58%, transparent 58%);
  clip-path: polygon(50% 0, 100% 100%, 0 100%);
  filter: drop-shadow(10px 4px 0 rgba(232, 121, 249, 0.45)) drop-shadow(-8px 6px 0 rgba(34, 211, 238, 0.4));
  animation: room-prism-wobble 7s ease-in-out infinite;
}
html[data-player-skin="prism"] .hud-app-name {
  font-family: var(--at-font-display);
  letter-spacing: 0.08em;
}

html[data-player-skin="prism"] .launcher-card {
  border-radius: 0 28px 0 8px;
  padding: 26px 16px 14px;
  background:
    linear-gradient(118deg, rgba(232, 121, 249, 0.16), transparent 42%, rgba(34, 211, 238, 0.12)),
    #0a2a32;
  border: 1px solid rgba(232, 121, 249, 0.28);
}
html[data-player-skin="prism"] button.primary,
html[data-player-skin="prism"] .tab-chip.active {
  background: #e879f9;
  color: #041e24;
  border: 1px solid #0e7490;
}

html[data-player-skin="prism"][data-app-tab="Today"] #main .tdy-hour-cell {
  border-radius: 4px 8px 4px 2px;
  border-left: 3px solid color-mix(in srgb, #e879f9 55%, #22d3ee);
}
html[data-player-skin="prism"][data-app-tab="Today"] .tdy-hour-row:nth-child(3n) .tdy-hour-cell { border-left-color: #e879f9; }
html[data-player-skin="prism"][data-app-tab="Today"] .tdy-hour-row:nth-child(3n+1) .tdy-hour-cell { border-left-color: #22d3ee; }
html[data-player-skin="prism"][data-app-tab="Today"] .tdy-hour-row:nth-child(3n+2) .tdy-hour-cell { border-left-color: #a78bfa; }

html[data-player-skin="prism"][data-app-tab="Tasks"] .tsk-row {
  border-radius: 0 16px 0 6px;
  border-left: 4px solid #22d3ee;
}
html[data-player-skin="prism"][data-app-tab="Agent"] .agent-msg.assistant .agent-bubble {
  border-left: 3px solid #e879f9;
  background: #0a2a32;
}

@keyframes room-prism-disperse {
  to { background-position: 80px 40px; }
}
@keyframes room-prism-wobble {
  50% { transform: rotate(8deg) translateY(-1px); }
}
@media (prefers-reduced-motion: reduce) {
  html[data-player-skin="prism"] body::after,
  html[data-player-skin="prism"] .top-hud::before { animation: none; }
}
""")

room("moon", """
/* Moon Archive — selenographic chart.
   Crater map, phase-clock HUD, tidal sine on Today. Quiet serif
   on navy vellum. The companion of midnight, not its twin. */

html[data-player-skin="moon"] {
  --at-r-plate: 32px 4px 32px 4px;
  --at-r-card: 32px 4px 32px 4px;
  --at-r-ctl: 12px 3px 12px 3px;
  --at-r-chip: 10px 3px;
  --at-r-cell: 10px 3px 10px 3px;
  --at-font-display: "Iowan Old Style", Palatino, serif;
  --at-font-ui: "Iowan Old Style", Palatino, serif;
  --bg-shell: #0a0c18;
  --bg-card: #16132c;
  --ink-primary: #ede9fe;
  --accent: #c4b5fd;
  --accent-ink: #120e2e;
}

html[data-player-skin="moon"] body {
  background:
    radial-gradient(circle at 82% 14%, #f5f3ff 0 7px, rgba(196, 181, 253, 0.4) 9px 18px, transparent 40px),
    radial-gradient(circle at 18% 72%, rgba(196, 181, 253, 0.12) 0 2px, transparent 3px),
    #0a0c18 !important;
}
html[data-player-skin="moon"] body::after {
  z-index: 0;
  pointer-events: none;
  opacity: 0.4;
  background-image:
    radial-gradient(circle at 22% 28%, rgba(237, 233, 254, 0.35) 0 1px, transparent 2px),
    radial-gradient(circle at 70% 61%, rgba(196, 181, 253, 0.28) 0 1px, transparent 2px);
  background-size: 90px 110px, 140px 80px;
  animation: room-moon-drift 40s linear infinite;
}

html[data-player-skin="moon"] .top-hud {
  background: linear-gradient(180deg, #1a1730, #100e22);
  border-bottom: 1px solid rgba(196, 181, 253, 0.28);
}
html[data-player-skin="moon"] .top-hud::after {
  content: "";
  position: absolute;
  right: 28px;
  top: 10px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  pointer-events: none;
  background:
    radial-gradient(circle at 30% 30%, #f5f3ff, #c4b5fd 55%, #312e81);
  box-shadow: inset -6px 0 0 #0a0c18, 0 0 16px rgba(196, 181, 253, 0.45);
  animation: room-moon-phase 16s ease-in-out infinite;
}
html[data-player-skin="moon"] .hud-app-name,
html[data-player-skin="moon"] .launcher-card-name {
  font-family: var(--at-font-display);
  font-style: italic;
}

html[data-player-skin="moon"] .launcher-card {
  border-radius: 32px 4px;
  padding: 28px 22px 18px;
  background: #16132c;
  color: #ede9fe;
  box-shadow: inset 0 0 0 1px rgba(196, 181, 253, 0.2);
}
html[data-player-skin="moon"] button.primary,
html[data-player-skin="moon"] .tab-chip.active {
  background: #c4b5fd;
  color: #120e2e;
  border: 1px solid #a78bfa;
}

html[data-player-skin="moon"][data-app-tab="Today"] #main .tdy-hour-cell {
  border-radius: 10px 3px;
  background:
    radial-gradient(circle at 12% 40%, rgba(196, 181, 253, 0.16) 0 3px, transparent 4px),
    #121026;
}
html[data-player-skin="moon"][data-app-tab="Tasks"] .tsk-row {
  border-radius: 20px 4px;
  background: #16132c;
}
html[data-player-skin="moon"][data-app-tab="Agent"] .agent-bubble {
  border-radius: 18px 4px 18px 4px;
}

@keyframes room-moon-drift { to { background-position: 40px -30px, -20px 20px; } }
@keyframes room-moon-phase { 50% { box-shadow: inset 6px 0 0 #0a0c18, 0 0 18px rgba(196, 181, 253, 0.55); } }
@media (prefers-reduced-motion: reduce) {
  html[data-player-skin="moon"] body::after,
  html[data-player-skin="moon"] .top-hud::after { animation: none; }
}
""")

room("midnight", """
/* Midnight Crown — blue-hour city grid.
   Sodium-vapor street lattice, IBM Plex Mono, 2px crown.
   Quiet hour: every path is a dashed street. */

html[data-player-skin="midnight"] {
  --at-r-plate: 2px;
  --at-r-card: 2px;
  --at-r-ctl: 2px;
  --at-r-chip: 2px;
  --at-r-cell: 2px;
  --at-font-display: "IBM Plex Mono", ui-monospace, monospace;
  --at-font-ui: "IBM Plex Mono", ui-monospace, monospace;
  --bg-shell: #070b16;
  --bg-card: #111827;
  --ink-primary: #e0e7ff;
  --accent: #818cf8;
  --accent-ink: #070b16;
  --midnight-sodium: #fbbf24;
}

html[data-player-skin="midnight"] body {
  background:
    repeating-linear-gradient(90deg, transparent 0 47px, rgba(129, 140, 248, 0.08) 47px 48px),
    repeating-linear-gradient(0deg, transparent 0 31px, rgba(251, 191, 36, 0.06) 31px 32px),
    #070b16 !important;
}
html[data-player-skin="midnight"] body::after {
  z-index: 0;
  pointer-events: none;
  opacity: 0.22;
  background: radial-gradient(circle at 20% 10%, rgba(251, 191, 36, 0.35), transparent 18%);
  animation: room-midnight-sodium 3.6s steps(2, end) infinite;
}

html[data-player-skin="midnight"] .top-hud {
  background: #0b1020;
  border-bottom: 2px solid #818cf8;
  font-family: var(--at-font-display);
}
html[data-player-skin="midnight"] .hud-app-name {
  letter-spacing: 0.16em;
  text-transform: uppercase;
  font-size: 11px;
}

html[data-player-skin="midnight"] .launcher-card {
  border-radius: 2px;
  padding: 14px 12px;
  background: #111827;
  border: 1px dashed rgba(129, 140, 248, 0.4);
}
html[data-player-skin="midnight"] button.primary,
html[data-player-skin="midnight"] .tab-chip.active {
  background: #818cf8;
  color: #070b16;
  border: 1px solid #6366f1;
  font-family: var(--at-font-display);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-size: 11px;
}

html[data-player-skin="midnight"][data-app-tab="Today"] #main .tdy-hour-cell {
  border-radius: 2px;
  border-style: dashed;
}
html[data-player-skin="midnight"][data-app-tab="Tasks"] .tsk-row {
  border-radius: 2px;
  border-left: 3px solid #fbbf24;
}
html[data-player-skin="midnight"][data-app-tab="Agent"] .agent-bubble {
  border-radius: 2px;
  font-family: var(--at-font-display);
}

@keyframes room-midnight-sodium {
  50% { opacity: 0.08; }
}
@media (prefers-reduced-motion: reduce) {
  html[data-player-skin="midnight"] body::after { animation: none; }
}
""")

room("royal", """
/* Royal Meridian — geodesic / theodolite.
   A gold survey line down the page. Radius 0. Brass on imperial
   purple. Today is a chain of measured ticks. */

html[data-player-skin="royal"] {
  --at-r-plate: 0;
  --at-r-card: 0;
  --at-r-ctl: 0;
  --at-r-chip: 0;
  --at-r-cell: 0;
  --at-font-display: "Iowan Old Style", Palatino, serif;
  --accent: #facc15;
  --accent-ink: #2a0548;
  --bg-shell: #1a0830;
  --bg-card: #2a1050;
  --ink-primary: #fef9c3;
}

html[data-player-skin="royal"] body {
  background:
    linear-gradient(90deg, transparent 49.6%, rgba(250, 204, 21, 0.55) 49.6% 50.4%, transparent 50.4%),
    linear-gradient(180deg, #220a3c, #140624) !important;
}
html[data-player-skin="royal"] body::after {
  z-index: 0;
  pointer-events: none;
  opacity: 0.28;
  background:
    repeating-linear-gradient(90deg, transparent 0 39px, rgba(250, 204, 21, 0.12) 39px 40px);
}

html[data-player-skin="royal"] .top-hud {
  background: #2a1050;
  border-bottom: 3px solid #facc15;
}
html[data-player-skin="royal"] .top-hud::before {
  content: "";
  position: absolute;
  left: 50%;
  bottom: -7px;
  width: 11px;
  height: 11px;
  transform: translateX(-50%) rotate(45deg);
  background: #facc15;
  animation: room-royal-tick 2.4s ease-in-out infinite;
}
html[data-player-skin="royal"] .hud-app-name,
html[data-player-skin="royal"] .launcher-card-name,
html[data-player-skin="royal"] .page-title {
  font-family: var(--at-font-display);
  letter-spacing: 0.06em;
}

html[data-player-skin="royal"] .launcher-card {
  border-radius: 0;
  padding: 22px 24px 18px;
  background: #2a1050;
  border: 1px solid rgba(250, 204, 21, 0.35);
}
html[data-player-skin="royal"] button.primary,
html[data-player-skin="royal"] .tab-chip.active {
  background: #facc15;
  color: #2a0548;
  border: 1px solid #6b21a8;
}

html[data-player-skin="royal"][data-app-tab="Today"] #main .tdy-hour-cell {
  border-radius: 0;
  box-shadow: inset 0 -1px 0 rgba(250, 204, 21, 0.18);
}
html[data-player-skin="royal"][data-app-tab="Tasks"] .tsk-row { border-radius: 0; border-top: 2px solid #facc15; }
html[data-player-skin="royal"][data-app-tab="Agent"] .agent-bubble { border-radius: 0; }

@keyframes room-royal-tick {
  50% { transform: translateX(-50%) rotate(45deg) scale(1.25); }
}
@media (prefers-reduced-motion: reduce) {
  html[data-player-skin="royal"] .top-hud::before { animation: none; }
}
""")

room("phantom", """
/* Phantom Compass — penumbra geometry.
   Routes appear only in a narrow dusk band. Dashed ghost cards.
   Double-exposure Agent. Inter, indigo dusk. */

html[data-player-skin="phantom"] {
  --at-r-plate: 20px 0 20px 0;
  --at-r-card: 20px 0 20px 0;
  --at-r-ctl: 9px 0;
  --at-r-chip: 9px 0;
  --at-r-cell: 8px 0;
  --at-font-display: "Inter", system-ui, sans-serif;
  --bg-shell: #0c0a18;
  --bg-card: #16132e;
  --ink-primary: #e0e7ff;
  --accent: #a5b4fc;
  --accent-ink: #16132e;
}

html[data-player-skin="phantom"] body {
  background:
    linear-gradient(180deg, rgba(165, 180, 252, 0.08), transparent 28%, rgba(12, 10, 24, 0.4) 72%),
    #0c0a18 !important;
}
html[data-player-skin="phantom"] body::after {
  z-index: 0;
  pointer-events: none;
  opacity: 0.3;
  background: repeating-linear-gradient(135deg, transparent 0 11px, rgba(165, 180, 252, 0.06) 11px 12px);
  animation: room-phantom-veil 12s ease-in-out infinite;
}

html[data-player-skin="phantom"] .top-hud {
  background: #120f22;
  border-bottom: 1px dashed rgba(165, 180, 252, 0.45);
}
html[data-player-skin="phantom"] .hud-app-name {
  opacity: 0.82;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  font-size: 11px;
}

html[data-player-skin="phantom"] .launcher-card {
  border-radius: 20px 0;
  padding: 24px 14px 12px;
  background: rgba(22, 19, 46, 0.82);
  border: 1px dashed rgba(165, 180, 252, 0.4);
}
html[data-player-skin="phantom"] button.primary,
html[data-player-skin="phantom"] .tab-chip.active {
  background: #a5b4fc;
  color: #16132e;
  border: 1px dashed #6366f1;
}

html[data-player-skin="phantom"][data-app-tab="Today"] #main .tdy-hour-cell {
  border-radius: 8px 0;
  border-style: dashed;
  opacity: 0.88;
}
html[data-player-skin="phantom"][data-app-tab="Today"] .tdy-hour-row:nth-child(-n+8) .tdy-hour-cell { opacity: 0.55; }
html[data-player-skin="phantom"][data-app-tab="Tasks"] .tsk-row { border-radius: 14px 0; border-style: dashed; }
html[data-player-skin="phantom"][data-app-tab="Agent"] .agent-bubble {
  border-radius: 16px 0;
  box-shadow: 4px 4px 0 rgba(165, 180, 252, 0.18);
}

@keyframes room-phantom-veil { 50% { opacity: 0.12; } }
@media (prefers-reduced-motion: reduce) {
  html[data-player-skin="phantom"] body::after { animation: none; }
}
""")

room("eclipse", """
/* Eclipse Meridian — annular corona.
   Total dark, one gold rim. Cards are disks with a flat base.
   HUD wears the diamond ring. */

html[data-player-skin="eclipse"] {
  --at-r-plate: 40px 40px 4px 4px;
  --at-r-card: 40px 40px 4px 4px;
  --at-r-ctl: 16px 16px 3px 3px;
  --at-r-chip: 12px 12px 3px 3px;
  --at-r-cell: 8px 8px 3px 3px;
  --at-font-display: "IBM Plex Mono", ui-monospace, monospace;
  --bg-shell: #020617;
  --bg-card: #0b1020;
  --ink-primary: #fef3c7;
  --accent: #facc15;
  --accent-ink: #020617;
}

html[data-player-skin="eclipse"] body {
  background:
    radial-gradient(circle at 50% -8%, #facc15 0 2px, rgba(250, 204, 21, 0.35) 14px, transparent 46%),
    #020617 !important;
}
html[data-player-skin="eclipse"] body::after {
  z-index: 0;
  pointer-events: none;
  opacity: 0.55;
  background: radial-gradient(circle at 50% -10%, transparent 12%, rgba(2, 6, 23, 0.55) 28%, #020617 52%);
}

html[data-player-skin="eclipse"] .top-hud {
  background: #0b1020;
  border-bottom: 1px solid #facc15;
  box-shadow: 0 0 24px rgba(250, 204, 21, 0.18);
}
html[data-player-skin="eclipse"] .top-hud::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 8px;
  width: 22px;
  height: 22px;
  margin-left: -11px;
  border-radius: 50%;
  pointer-events: none;
  background: #020617;
  box-shadow: 0 0 0 3px #facc15, 0 0 18px #facc15;
  animation: room-eclipse-corona 5.5s ease-in-out infinite;
}
html[data-player-skin="eclipse"] .hud-app-name {
  font-family: var(--at-font-display);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  font-size: 11px;
}

html[data-player-skin="eclipse"] .launcher-card {
  border-radius: 40px 40px 4px 4px;
  padding: 20px 20px 14px;
  background: #0b1020;
  border: 1px solid rgba(250, 204, 21, 0.35);
}
html[data-player-skin="eclipse"] button.primary,
html[data-player-skin="eclipse"] .tab-chip.active {
  background: #facc15;
  color: #020617;
  border: 1px solid #a16207;
}

html[data-player-skin="eclipse"][data-app-tab="Today"] #main .tdy-hour-cell {
  border-radius: 8px 8px 3px 3px;
}
html[data-player-skin="eclipse"][data-app-tab="Today"] .tdy-hour-row:nth-child(12) .tdy-hour-cell,
html[data-player-skin="eclipse"][data-app-tab="Today"] .tdy-hour-row:nth-child(13) .tdy-hour-cell {
  box-shadow: inset 0 0 0 2px #facc15;
}
html[data-player-skin="eclipse"][data-app-tab="Tasks"] .tsk-row { border-radius: 18px 18px 4px 4px; }
html[data-player-skin="eclipse"][data-app-tab="Agent"] .agent-bubble { border-radius: 22px 22px 4px 4px; }

@keyframes room-eclipse-corona {
  50% { box-shadow: 0 0 0 5px #facc15, 0 0 28px #fde047; }
}
@media (prefers-reduced-motion: reduce) {
  html[data-player-skin="eclipse"] .top-hud::after { animation: none; }
}
""")

room("nova", """
/* Nova Key — supernova light curve.
   Magnitude rises then decays. Radial burst on Home.
   Yellow key on magenta dusk. */

html[data-player-skin="nova"] {
  --at-r-plate: 4px 22px 4px 22px;
  --at-r-card: 4px 22px 4px 22px;
  --at-r-ctl: 3px 12px;
  --at-r-chip: 3px 10px;
  --at-r-cell: 3px 10px;
  --at-font-display: "Inter", system-ui, sans-serif;
  --bg-shell: #2a0536;
  --bg-card: #3b0764;
  --ink-primary: #fdf4ff;
  --accent: #fde68a;
  --accent-ink: #4a044e;
}

html[data-player-skin="nova"] body {
  background:
    radial-gradient(circle at 50% 18%, rgba(253, 230, 138, 0.28), transparent 36%),
    #2a0536 !important;
}
html[data-player-skin="nova"] body::after {
  z-index: 0;
  pointer-events: none;
  opacity: 0.4;
  background:
    repeating-conic-gradient(from 0deg at 50% 16%, transparent 0 8deg, rgba(253, 230, 138, 0.08) 8deg 9deg);
  animation: room-nova-spin 22s linear infinite;
}

html[data-player-skin="nova"] .top-hud {
  background: #3b0764;
  border-bottom: 1px solid #fde68a;
}
html[data-player-skin="nova"] .hud-app-name {
  letter-spacing: 0.1em;
  text-transform: uppercase;
  font-size: 12px;
}

html[data-player-skin="nova"] .launcher-card {
  border-radius: 4px 22px;
  padding: 16px 20px 22px;
  background:
    radial-gradient(circle at 80% 12%, rgba(253, 230, 138, 0.22), transparent 40%),
    #3b0764;
  border: 1px solid rgba(253, 230, 138, 0.3);
}
html[data-player-skin="nova"] button.primary,
html[data-player-skin="nova"] .tab-chip.active {
  background: #fde68a;
  color: #4a044e;
  border: 1px solid #db2777;
}

html[data-player-skin="nova"][data-app-tab="Today"] #main .tdy-hour-cell { border-radius: 3px 10px; }
html[data-player-skin="nova"][data-app-tab="Today"] .tdy-hour-row:nth-child(n+10):nth-child(-n+14) .tdy-hour-cell {
  box-shadow: inset 0 0 0 1px rgba(253, 230, 138, 0.45);
}
html[data-player-skin="nova"][data-app-tab="Tasks"] .tsk-row { border-radius: 4px 16px; }
html[data-player-skin="nova"][data-app-tab="Agent"] .agent-bubble { border-radius: 4px 18px; }

@keyframes room-nova-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  html[data-player-skin="nova"] body::after { animation: none; }
}
""")

room("relic", """
/* Relic Compass — astrolabe rete.
   Concentric degree rings. Old gold on bole. Iowan display. */

html[data-player-skin="relic"] {
  --at-r-plate: 14px 2px 14px 2px;
  --at-r-card: 14px 2px 14px 2px;
  --at-r-ctl: 8px 2px;
  --at-r-chip: 8px 2px;
  --at-r-cell: 6px 2px;
  --at-font-display: "Iowan Old Style", Palatino, serif;
  --bg-shell: #1c1008;
  --bg-card: #2a180c;
  --ink-primary: #fde68a;
  --accent: #fde047;
  --accent-ink: #3a1a04;
}

html[data-player-skin="relic"] body {
  background:
    radial-gradient(circle at 50% 0%, transparent 28%, rgba(253, 224, 71, 0.08) 29% 30%, transparent 31%),
    #1c1008 !important;
}
html[data-player-skin="relic"] body::after {
  z-index: 0;
  pointer-events: none;
  opacity: 0.25;
  background:
    repeating-radial-gradient(circle at 50% 0%, transparent 0 18px, rgba(253, 224, 71, 0.12) 18px 19px);
}

html[data-player-skin="relic"] .top-hud {
  background: #2a180c;
  border-bottom: 2px solid #fde047;
}
html[data-player-skin="relic"] .top-hud::before {
  content: "";
  position: absolute;
  left: 50%;
  top: 6px;
  width: 26px;
  height: 26px;
  margin-left: -13px;
  border: 1px solid rgba(253, 224, 71, 0.7);
  border-radius: 50%;
  pointer-events: none;
  box-shadow: inset 0 0 0 4px rgba(253, 224, 71, 0.15), 0 0 0 6px rgba(253, 224, 71, 0.08);
  animation: room-relic-rete 20s linear infinite;
}
html[data-player-skin="relic"] .hud-app-name,
html[data-player-skin="relic"] .launcher-card-name {
  font-family: var(--at-font-display);
}

html[data-player-skin="relic"] .launcher-card {
  border-radius: 14px 2px;
  padding: 21px 16px;
  background: #2a180c;
  border: 1px solid rgba(253, 224, 71, 0.32);
}
html[data-player-skin="relic"] button.primary,
html[data-player-skin="relic"] .tab-chip.active {
  background: #fde047;
  color: #3a1a04;
  border: 1px solid #78350f;
}

html[data-player-skin="relic"][data-app-tab="Today"] #main .tdy-hour-cell { border-radius: 6px 2px; }
html[data-player-skin="relic"][data-app-tab="Tasks"] .tsk-row { border-radius: 10px 2px; }
html[data-player-skin="relic"][data-app-tab="Agent"] .agent-bubble { border-radius: 12px 2px; }

@keyframes room-relic-rete { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  html[data-player-skin="relic"] .top-hud::before { animation: none; }
}
""")

room("zen", """
/* Zen Wayfinder — karesansui / enso.
   Raked gravel, ma (empty space), one sitting enso.
   Stillness is the geometry. */

html[data-player-skin="zen"] {
  --at-r-plate: 0 0 28px 28px;
  --at-r-card: 0 0 28px 28px;
  --at-r-ctl: 0 0 12px 12px;
  --at-r-chip: 0 0 10px 10px;
  --at-r-cell: 0 0 8px 8px;
  --at-font-display: "Iowan Old Style", Georgia, serif;
  --bg-shell: #11140f;
  --bg-card: #1a1f18;
  --ink-primary: #f5d0fe;
  --accent: #f0abfc;
  --accent-ink: #134e4a;
}

html[data-player-skin="zen"] body {
  background:
    repeating-linear-gradient(12deg, transparent 0 10px, rgba(240, 171, 252, 0.04) 10px 11px),
    #11140f !important;
}
html[data-player-skin="zen"] body::after {
  z-index: 0;
  pointer-events: none;
  opacity: 0.3;
  background: repeating-linear-gradient(8deg, transparent 0 13px, rgba(19, 78, 74, 0.18) 13px 14px);
  animation: room-zen-rake 36s linear infinite;
}

html[data-player-skin="zen"] .top-hud {
  background: #1a1f18;
  border-bottom: 1px solid rgba(240, 171, 252, 0.28);
}
html[data-player-skin="zen"] .top-hud::after {
  content: "";
  position: absolute;
  right: 22px;
  top: 11px;
  width: 16px;
  height: 16px;
  border: 2px solid #f0abfc;
  border-radius: 50%;
  border-left-color: transparent;
  pointer-events: none;
}
html[data-player-skin="zen"] .hud-app-name,
html[data-player-skin="zen"] .launcher-card-name {
  font-family: var(--at-font-display);
  font-style: italic;
}

html[data-player-skin="zen"] .launcher-card {
  border-radius: 0 0 28px 28px;
  padding: 32px 20px 14px;
  background: #1a1f18;
  border: 1px solid rgba(240, 171, 252, 0.2);
}
html[data-player-skin="zen"] .launcher-card::before { content: none; }
html[data-player-skin="zen"] button.primary,
html[data-player-skin="zen"] .tab-chip.active {
  background: #f0abfc;
  color: #134e4a;
  border: 1px solid #0f766e;
}

html[data-player-skin="zen"][data-app-tab="Today"] #main .tdy-hour-cell { border-radius: 0 0 8px 8px; }
html[data-player-skin="zen"][data-app-tab="Tasks"] .tsk-row { border-radius: 0 0 16px 16px; padding-top: 14px; }
html[data-player-skin="zen"][data-app-tab="Agent"] .agent-bubble { border-radius: 0 0 18px 18px; }

@keyframes room-zen-rake { to { background-position: 80px 0; } }
@media (prefers-reduced-motion: reduce) {
  html[data-player-skin="zen"] body::after { animation: none; }
}
""")

room("arcade", """
/* Arcade Specter — vector CRT persistence.
   Phosphor ghost, scanlines, cabinet bezel before Cabinet Night.
   Cyan on purple, not a full world remake. */

html[data-player-skin="arcade"] {
  --at-r-plate: 0 0 16px 16px;
  --at-r-card: 0 0 16px 16px;
  --at-r-ctl: 0;
  --at-r-chip: 0;
  --at-r-cell: 0;
  --at-font-display: "IBM Plex Mono", ui-monospace, monospace;
  --bg-shell: #1a0533;
  --bg-card: #2e1065;
  --ink-primary: #ecfeff;
  --accent: #22d3ee;
  --accent-ink: #2e1065;
}

html[data-player-skin="arcade"] body {
  background: #1a0533 !important;
}
html[data-player-skin="arcade"] body::after {
  z-index: 0;
  pointer-events: none;
  opacity: 0.18;
  background: repeating-linear-gradient(180deg, transparent 0 3px, rgba(0, 0, 0, 0.45) 3px 4px);
  animation: room-arcade-roll 8s linear infinite;
}

html[data-player-skin="arcade"] .top-hud {
  background: #2e1065;
  border-bottom: 3px solid #22d3ee;
  box-shadow: 0 0 16px rgba(34, 211, 238, 0.25);
}
html[data-player-skin="arcade"] .hud-app-name {
  font-family: var(--at-font-display);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  font-size: 11px;
  text-shadow: 0 0 8px #22d3ee;
  animation: room-arcade-glow 2.2s ease-in-out infinite;
}

html[data-player-skin="arcade"] .launcher-card {
  border-radius: 0 0 16px 16px;
  padding: 12px 12px 18px;
  background: #2e1065;
  border: 2px solid #9333ea;
  box-shadow: 0 0 12px rgba(34, 211, 238, 0.18);
}
html[data-player-skin="arcade"] button.primary,
html[data-player-skin="arcade"] .tab-chip.active {
  background: #22d3ee;
  color: #2e1065;
  border: 2px solid #9333ea;
  font-family: var(--at-font-display);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 11px;
}

html[data-player-skin="arcade"][data-app-tab="Today"] #main .tdy-hour-cell { border-radius: 0; border-style: solid; }
html[data-player-skin="arcade"][data-app-tab="Tasks"] .tsk-row { border-radius: 0; border-left: 3px solid #22d3ee; }
html[data-player-skin="arcade"][data-app-tab="Agent"] .agent-bubble { border-radius: 0; font-family: var(--at-font-display); }

@keyframes room-arcade-roll { to { background-position: 0 12px; } }
@keyframes room-arcade-glow { 50% { text-shadow: 0 0 14px #a5f3fc; } }
@media (prefers-reduced-motion: reduce) {
  html[data-player-skin="arcade"] body::after,
  html[data-player-skin="arcade"] .hud-app-name { animation: none; }
}
""")

room("kintsugi", """
/* Kintsugi Vault — gold lives only in the cracks.
   Black ceramic ground. Voronoi repair lines. No gold wash. */

html[data-player-skin="kintsugi"] {
  --at-r-plate: 3px 18px 3px 18px;
  --at-r-card: 3px 18px 3px 18px;
  --at-r-ctl: 2px 10px;
  --at-r-chip: 2px 10px;
  --at-r-cell: 2px 8px;
  --at-font-display: "Iowan Old Style", Palatino, serif;
  --bg-shell: #14110e;
  --bg-card: #1c1814;
  --ink-primary: #f5f0e6;
  --accent: #c9a227;
  --accent-ink: #14110e;
}

html[data-player-skin="kintsugi"] body {
  background: #14110e !important;
}
html[data-player-skin="kintsugi"] body::after {
  z-index: 0;
  pointer-events: none;
  opacity: 0.55;
  background:
    linear-gradient(118deg, transparent 40%, rgba(201, 162, 39, 0.35) 40.4% 40.8%, transparent 41%),
    linear-gradient(64deg, transparent 62%, rgba(201, 162, 39, 0.28) 62.3% 62.7%, transparent 63%),
    linear-gradient(12deg, transparent 28%, rgba(201, 162, 39, 0.2) 28.2% 28.5%, transparent 29%);
  animation: room-kintsugi-gleam 9s ease-in-out infinite;
}

html[data-player-skin="kintsugi"] .top-hud {
  background: #1c1814;
  border-bottom: 1px solid #c9a227;
}
html[data-player-skin="kintsugi"] .hud-app-name {
  font-family: var(--at-font-display);
}

html[data-player-skin="kintsugi"] .launcher-card {
  border-radius: 3px 18px;
  padding: 18px 18px 22px;
  background: #1c1814;
  border: 1px solid #3f3a34;
  box-shadow: 3px 0 0 #c9a227, 0 3px 0 #c9a227;
}
html[data-player-skin="kintsugi"] button.primary,
html[data-player-skin="kintsugi"] .tab-chip.active {
  background: #c9a227;
  color: #14110e;
  border: 1px solid #a16207;
}

html[data-player-skin="kintsugi"][data-app-tab="Today"] #main .tdy-hour-cell {
  border-radius: 2px 8px;
  box-shadow: 2px 0 0 rgba(201, 162, 39, 0.45);
}
html[data-player-skin="kintsugi"][data-app-tab="Tasks"] .tsk-row { border-radius: 3px 14px; border-left: 3px solid #c9a227; }
html[data-player-skin="kintsugi"][data-app-tab="Agent"] .agent-bubble { border-radius: 3px 16px; }

@keyframes room-kintsugi-gleam { 50% { opacity: 0.22; } }
@media (prefers-reduced-motion: reduce) {
  html[data-player-skin="kintsugi"] body::after { animation: none; }
}
""")

room("stained", """
/* Stained Glass — gothic rose-window tracery.
   Gold leading. Jewels stay in the glass, never on type.
   Night chapel. Golden-ratio petal count (8). */

html[data-player-skin="stained"] {
  --at-r-plate: 0 26px 16px 0;
  --at-r-card: 0 26px 16px 0;
  --at-r-ctl: 0 12px 8px 0;
  --at-r-chip: 0 10px 6px 0;
  --at-r-cell: 0 8px 6px 0;
  --at-font-display: "Iowan Old Style", Palatino, serif;
  --bg-shell: #1a1030;
  --bg-card: #241544;
  --ink-primary: #fef3c7;
  --accent: #c9a227;
  --accent-ink: #1a1030;
}

html[data-player-skin="stained"] body {
  background:
    radial-gradient(circle at 50% 0%, rgba(201, 162, 39, 0.2), transparent 42%),
    #1a1030 !important;
}
html[data-player-skin="stained"] body::after {
  z-index: 0;
  pointer-events: none;
  opacity: 0.35;
  background:
    repeating-conic-gradient(from 0deg at 50% 0%, transparent 0 40deg, rgba(201, 162, 39, 0.12) 40deg 45deg);
}

html[data-player-skin="stained"] .top-hud {
  background: #241544;
  border-bottom: 3px double #c9a227;
}
html[data-player-skin="stained"] .top-hud::before {
  content: "";
  position: absolute;
  left: 50%;
  bottom: -10px;
  width: 18px;
  height: 18px;
  margin-left: -9px;
  border: 2px solid #c9a227;
  border-radius: 50%;
  pointer-events: none;
  background:
    conic-gradient(#7c3aed, #c9a227, #1d4ed8, #c9a227, #7c3aed);
  animation: room-stained-jewel 10s linear infinite;
}
html[data-player-skin="stained"] .hud-app-name,
html[data-player-skin="stained"] .launcher-card-name {
  font-family: var(--at-font-display);
}

html[data-player-skin="stained"] .launcher-card {
  border-radius: 0 26px 16px 0;
  padding: 20px 14px 24px;
  background: #241544;
  border: 2px solid #c9a227;
}
html[data-player-skin="stained"] button.primary,
html[data-player-skin="stained"] .tab-chip.active {
  background: #c9a227;
  color: #1a1030;
  border: 1px solid #6b21a8;
}

html[data-player-skin="stained"][data-app-tab="Today"] #main .tdy-hour-cell { border-radius: 0 8px 6px 0; }
html[data-player-skin="stained"][data-app-tab="Tasks"] .tsk-row { border-radius: 0 18px 12px 0; }
html[data-player-skin="stained"][data-app-tab="Agent"] .agent-bubble { border-radius: 0 20px 14px 0; }

@keyframes room-stained-jewel { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  html[data-player-skin="stained"] .top-hud::before { animation: none; }
}
""")

room("void", """
/* Void Cartographer — astrolabe negative space.
   One violet bearing on lightless chart. Mono ticks. */

html[data-player-skin="void"] {
  --at-r-plate: 18px 0 0 18px;
  --at-r-card: 18px 0 0 18px;
  --at-r-ctl: 8px 0 0 8px;
  --at-r-chip: 8px 0;
  --at-r-cell: 6px 0;
  --at-font-display: "IBM Plex Mono", ui-monospace, monospace;
  --at-font-ui: "IBM Plex Mono", ui-monospace, monospace;
  --bg-shell: #0b0618;
  --bg-card: #16132c;
  --ink-primary: #ede9fe;
  --accent: #8b5cf6;
  --accent-ink: #0b0618;
}

html[data-player-skin="void"] body {
  background:
    radial-gradient(circle at 12% 18%, rgba(237, 233, 254, 0.35) 0 1px, transparent 2px),
    #0b0618 !important;
}
html[data-player-skin="void"] body::after {
  z-index: 0;
  pointer-events: none;
  opacity: 0.4;
  background:
    linear-gradient(32deg, transparent 48%, rgba(139, 92, 246, 0.35) 48.4% 49%, transparent 49.4%);
  animation: room-void-bearing 14s ease-in-out infinite;
}

html[data-player-skin="void"] .top-hud { background: #100e22; border-bottom: 1px solid #8b5cf6; }
html[data-player-skin="void"] .hud-app-name {
  font-family: var(--at-font-display);
  letter-spacing: 0.16em;
  text-transform: uppercase;
  font-size: 11px;
}

html[data-player-skin="void"] .launcher-card {
  border-radius: 18px 0 0 18px;
  padding: 18px 16px 24px;
  background: #16132c;
  border: 1px solid rgba(139, 92, 246, 0.3);
  color: #ede9fe;
}
html[data-player-skin="void"] button.primary,
html[data-player-skin="void"] .tab-chip.active {
  background: #8b5cf6;
  color: #0b0618;
  border: 1px solid #a78bfa;
  font-weight: 700;
}

html[data-player-skin="void"][data-app-tab="Today"] #main .tdy-hour-cell { border-radius: 6px 0; }
html[data-player-skin="void"][data-app-tab="Tasks"] .tsk-row { border-radius: 14px 0 0 14px; }
html[data-player-skin="void"][data-app-tab="Agent"] .agent-bubble { border-radius: 16px 0 0 16px; }

@keyframes room-void-bearing { 50% { opacity: 0.15; } }
@media (prefers-reduced-motion: reduce) {
  html[data-player-skin="void"] body::after { animation: none; }
}
""")

room("gold", """
/* Gold Standard — gilding leaf on bole.
   Cross-hatch leaf, not yellow fill. Iowan, 8px leaf tiles. */

html[data-player-skin="gold"] {
  --at-r-plate: 8px;
  --at-r-card: 8px;
  --at-r-ctl: 6px;
  --at-r-chip: 6px;
  --at-r-cell: 6px;
  --at-font-display: "Iowan Old Style", Palatino, serif;
  --bg-shell: #1c1206;
  --bg-card: #2a1a08;
  --ink-primary: #fff7ed;
  --accent: #fde047;
  --accent-ink: #3a1d04;
}

html[data-player-skin="gold"] body {
  background:
    repeating-linear-gradient(45deg, rgba(253, 224, 71, 0.05) 0 6px, transparent 6px 12px),
    #1c1206 !important;
}
html[data-player-skin="gold"] body::after {
  z-index: 0;
  pointer-events: none;
  opacity: 0.22;
  background: repeating-linear-gradient(-45deg, rgba(253, 224, 71, 0.12) 0 2px, transparent 2px 10px);
  animation: room-gold-leaf 14s linear infinite;
}

html[data-player-skin="gold"] .top-hud { background: #2a1a08; border-bottom: 2px solid #fde047; }
html[data-player-skin="gold"] .hud-app-name { font-family: var(--at-font-display); }

html[data-player-skin="gold"] .launcher-card {
  border-radius: 8px;
  padding: 19px 17px 15px;
  background: #2a1a08;
  border: 1px solid #a16207;
  box-shadow: inset 0 1px 0 rgba(253, 224, 71, 0.35);
}
html[data-player-skin="gold"] button.primary,
html[data-player-skin="gold"] .tab-chip.active {
  background: #fde047;
  color: #3a1d04;
  border: 1px solid #a16207;
  font-weight: 750;
}

html[data-player-skin="gold"][data-app-tab="Today"] #main .tdy-hour-cell { border-radius: 6px; }
html[data-player-skin="gold"][data-app-tab="Tasks"] .tsk-row { border-radius: 8px; }
html[data-player-skin="gold"][data-app-tab="Agent"] .agent-bubble { border-radius: 8px; }

@keyframes room-gold-leaf { to { background-position: 24px 0; } }
@media (prefers-reduced-motion: reduce) {
  html[data-player-skin="gold"] body::after { animation: none; }
}
""")

room("noir", """
/* Noir Cut — silver halide chiaroscuro.
   Venetian blinds, hard key light, a city that never dries. */

html[data-player-skin="noir"] {
  --at-r-plate: 0 12px 0 12px;
  --at-r-card: 0 12px 0 12px;
  --at-r-ctl: 0 8px;
  --at-r-chip: 0 8px;
  --at-r-cell: 0 6px;
  --at-font-display: "IBM Plex Mono", ui-monospace, monospace;
  --bg-shell: #111827;
  --bg-card: #1f2937;
  --ink-primary: #e5e7eb;
  --accent: #e5e7eb;
  --accent-ink: #111827;
}

html[data-player-skin="noir"] body {
  background: #111827 !important;
}
html[data-player-skin="noir"] body::after {
  z-index: 0;
  pointer-events: none;
  opacity: 0.28;
  background: repeating-linear-gradient(180deg, transparent 0 10px, rgba(0, 0, 0, 0.55) 10px 14px);
  animation: room-noir-blinds 10s linear infinite;
}

html[data-player-skin="noir"] .top-hud {
  background: #0b0f16;
  border-bottom: 1px solid #e5e7eb;
}
html[data-player-skin="noir"] .hud-app-name {
  font-family: var(--at-font-display);
  letter-spacing: 0.18em;
  text-transform: uppercase;
  font-size: 11px;
}

html[data-player-skin="noir"] .launcher-card {
  border-radius: 0 12px;
  padding: 16px 18px;
  background: #1f2937;
  border: 1px solid #4b5563;
  box-shadow: 8px 0 0 rgba(229, 231, 235, 0.08);
}
html[data-player-skin="noir"] button.primary,
html[data-player-skin="noir"] .tab-chip.active {
  background: #e5e7eb;
  color: #111827;
  border: 1px solid #9ca3af;
}

html[data-player-skin="noir"][data-app-tab="Today"] #main .tdy-hour-cell { border-radius: 0 6px; }
html[data-player-skin="noir"][data-app-tab="Tasks"] .tsk-row { border-radius: 0 10px; }
html[data-player-skin="noir"][data-app-tab="Agent"] .agent-bubble {
  border-radius: 0 14px;
  box-shadow: -10px 0 20px rgba(0, 0, 0, 0.45);
}

@keyframes room-noir-blinds { to { background-position: 0 14px; } }
@media (prefers-reduced-motion: reduce) {
  html[data-player-skin="noir"] body::after { animation: none; }
}
""")


def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    for name, css in ROOMS.items():
        path = ROOT / f"{name}.css"
        path.write_text(css, encoding="utf-8")
        print(f"wrote {path.relative_to(path.parents[3])} ({len(css.splitlines())} lines)")


if __name__ == "__main__":
    main()
