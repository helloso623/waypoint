"""Default seed data only. On first run, db.init_db() copies CATEGORIES into the
`categories` table and the DB becomes the live source of truth from then on --
edit categories via the API (or the in-app "vibecode a category" box) instead of
this file. This file just defines what a brand-new database starts with.
"""

CATEGORIES = [
    {"key": "thinking", "label": "Thinking", "color": "#1b5e20"},        # dark green
    {"key": "other", "label": "Other", "color": "#43a047"},              # green
    {"key": "free_time", "label": "Free time", "color": "#fb8c00"},      # orange
    {"key": "social", "label": "Social", "color": "#e53935"},            # red
    {"key": "work_with_people", "label": "Work with people", "color": "#0d47a1"},  # dark blue
    {"key": "work", "label": "Work", "color": "#64b5f6"},                # light blue
    {"key": "planned", "label": "Planned", "color": "#ef9a9a"},          # light red
    {"key": "sleep", "label": "Sleep", "color": "#8e24aa"},              # purple
    {"key": "travel", "label": "Travel", "color": "#111111"},            # black
]

CATEGORY_BY_KEY = {c["key"]: c for c in CATEGORIES}

METRICS = [
    {"key": "happiness", "label": "Happiness", "type": "scale"},
    {"key": "volatility", "label": "Volatility", "type": "scale"},
    {"key": "motivation", "label": "Motivation", "type": "scale"},
    {"key": "focus", "label": "Focus", "type": "scale"},
    {"key": "work_time", "label": "Work time (h)", "type": "number"},
    {"key": "effective_work_time", "label": "Effective work time (h)", "type": "number"},
    {"key": "sports", "label": "Sports (min)", "type": "number"},
    {"key": "eating", "label": "Eating", "type": "scale"},
]
