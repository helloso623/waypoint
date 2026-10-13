"""One-off import: MASTER_planning_v3.xlsx "Daily Data" -> the `days` table.

Only backfills daily metrics (happiness/volatility/motivation/focus/work time/
effective work time/sports/notes) -- the old sheet stores per-day *counts* per
category, not which hour got which category, so the `hours` grid is left empty
for imported days (see Project Plan.md). Run once: `python import_history.py`.
Safe to re-run -- db.save_day upserts by date.
"""
import openpyxl

import db

SOURCE = "MASTER_planning_v3.xlsx"


def main():
    wb = openpyxl.load_workbook(SOURCE, data_only=True)
    ws = wb["Daily Data"]

    db.init_db()
    imported = 0
    for row in ws.iter_rows(min_row=2, values_only=True):
        date = row[0]
        if not date:
            continue

        notes = " / ".join(str(x) for x in (row[34], row[35]) if x)
        metrics = {
            "volatility": row[7],
            "happiness": row[8],
            "focus": row[9],
            "work_time": row[10],
            "effective_work_time": row[11],
            "sports": row[12],
            "motivation": row[13],
            "eating": None,
            "notes": notes,
        }
        if all(v is None for k, v in metrics.items() if k != "notes") and not notes:
            continue

        db.save_day(date, metrics, {})
        imported += 1

    print(f"Imported {imported} days into planner.db")


if __name__ == "__main__":
    main()
