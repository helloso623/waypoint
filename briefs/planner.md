# Planner fusion: Today + Calendar + Tasks

- Fuse Today, Calendar, and Tasks into one Planner app; intention: clarity and agency by making the day editable, honest, and obvious.
- Layout: month/week/day strip left or top, hour canvas center, task stack right; all panes resizable/collapsible, never modal-only.
- Clicking any day loads that day instantly; past/future days are editable exactly like today with clear `Editing historical day` state.
- Replace hour table with drag-paint timeline; blocks have category color, note preview, scheduled task badges, resize edges.
- Drag-paint state machine: `idle` -> `armed` on mousedown over hour cell -> `painting` after pointer moves 4px or enters another hour -> `committed` on mouseup.
- On mousedown: capture start day/hour, show translucent paint ghost, lock page scrolling, show category hotkey hint.
- On pointer enter: extend ghost across contiguous hours; in week view, paint rectangular range across days/hours.
- On mouseup: open compact category radial/menu at cursor unless a category hotkey is held; apply category to all ghost cells.
- Category hotkeys: `1-9` preview/apply category while dragging; visible number badges on category menu.
- Click block: edit note/category/tasks; drag block body moves; drag top/bottom edge resizes; double-click opens full detail.
- Fill handle: 9x9 square at selected block bottom-right, white border, category-colored center, cursor `crosshair`.
- Drag fill handle repeats selected pattern; show dashed ghost copies, label `repeat x3`, commit on mouseup.
- Sheets-style select mode toggle: toolbar appears with `Done`, `Clear`, `Paint category`, `Assign task`, `Set project`, `Set energy`, `Copy`, `Paste`, `Repeat`, `Delete`, `Save`.
- Select visuals: blue outlines, highlighted day/hour headers, corner handles, count label `12 cells selected`.
- Multi-select: drag across hours/days, shift-click extend, cmd/ctrl-click toggle cells, right-click applies action menu.
- Task filters per day: All, Due Today, Scheduled Today, Overdue, Project, Context, Energy, Estimated Time, Completed.
- Urgency formula: `urgency = 100 * (0.55 * importance^2 + 0.35 * deadline_proximity^2 + 0.10 * overdue_pressure)`, normalized 0-100.
- Deadline proximity: 1.0 for today/overdue, taper quadratically to 0 over 14 days; overdue pressure grows but caps.
- Task card UI: `Urgency 84` segmented bar; click expands explanation `importance^2 49 + deadline^2 31 + overdue 4 = 84`.
- Deadline explanation examples: `Due tomorrow: +31`, `Due in 9d: +6`, `Overdue 3d: capped +10`.
- Critical tasks must be impossible to miss: high urgency cards glow/edge pulse, but no fake panic or guilt copy.
- Task capture: natural-language quick add in right rail; new task gets importance, due date, estimate, project/context when available.
- Task -> hour drag: valid hour blocks glow; center timeline shows insertion line; right rail says `Drop to schedule 2h`.
- On drop: create scheduled task badge inside block; if estimate exceeds block, show `needs 90m, block 60m`.
- Hour -> task link: dragging scheduled badge back to rail unschedules; task remains intact and logs unscheduled state.
- Day save state: HUD title gets amber dot; save button says `Save 18 changes`; successful save creates small coin/status burst only for real completion.
- Empty day state: `No hours painted - drag across the timeline to make the day honest.`
- Empty task state: `No pressure captured - add one task or pull from backlog.`
- Empty calendar state: `No commitments imported for this day. Manual planning still works.`
- Empty filter state: `No tasks match this filter; clear filters or capture one.`
- Unsynced/import error state: visible banner with retry; never silently hide calendar sync failure.
- Reduced motion: drag ghost and outlines remain instant; remove pulses/particles.

Impress the owner: at least one moment in this zone must make him say 'insane'.
