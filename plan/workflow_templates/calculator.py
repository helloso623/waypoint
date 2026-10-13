"""Simple calculator — tkinter reference for the calculator Waypoint baseline.

Mirrors the graph variables: display, accumulator, operator, fresh.
Re-import or compare with the calculator template in custom_templates.js.
"""
import tkinter as tk

DISPLAY = "0"
ACCUMULATOR = 0.0
OPERATOR = ""
FRESH = True


def _refresh(lbl):
    lbl.config(text=DISPLAY)


def _append_digit(d):
    global DISPLAY, FRESH
    if FRESH:
        DISPLAY = d
        FRESH = False
    else:
        DISPLAY = DISPLAY + d if DISPLAY != "0" or d == "." else d


def _set_op(op):
    global ACCUMULATOR, OPERATOR, FRESH, DISPLAY
    try:
        ACCUMULATOR = float(DISPLAY)
    except ValueError:
        ACCUMULATOR = 0.0
    OPERATOR = op
    FRESH = True


def _equals():
    global DISPLAY, FRESH, ACCUMULATOR, OPERATOR
    try:
        b = float(DISPLAY)
    except ValueError:
        b = 0.0
    if OPERATOR == "+":
        result = ACCUMULATOR + b
    elif OPERATOR == "-":
        result = ACCUMULATOR - b
    elif OPERATOR == "*":
        result = ACCUMULATOR * b
    elif OPERATOR == "/":
        result = ACCUMULATOR / b if b else 0.0
    else:
        result = b
    DISPLAY = str(int(result)) if result == int(result) else str(round(result, 8)).rstrip("0").rstrip(".")
    FRESH = True
    OPERATOR = ""


def _clear():
    global DISPLAY, ACCUMULATOR, OPERATOR, FRESH
    DISPLAY = "0"
    ACCUMULATOR = 0.0
    OPERATOR = ""
    FRESH = True


def run_calculator():
    root = tk.Tk()
    root.title("Simple Calculator")
    root.resizable(False, False)

    display = tk.Label(root, text=DISPLAY, anchor="e", font=("Segoe UI", 28), bg="#1e293b", fg="#f8fafc", padx=12, pady=16)
    display.grid(row=0, column=0, columnspan=4, sticky="ew", padx=8, pady=8)

    keys = [
        ("7", "8", "9", "+"),
        ("4", "5", "6", "-"),
        ("1", "2", "3", "×"),
        ("0", "C", "=", "÷"),
    ]
    op_map = {"×": "*", "÷": "/"}

    def on_key(label):
        def handler():
            if label in "0123456789":
                _append_digit(label)
            elif label in "+-×÷":
                _set_op(op_map.get(label, label))
            elif label == "=":
                _equals()
            elif label == "C":
                _clear()
            _refresh(display)
        return handler

    for r, row in enumerate(keys, start=1):
        for c, label in enumerate(row):
            tk.Button(root, text=label, width=5, height=2, font=("Segoe UI", 14), command=on_key(label)).grid(
                row=r, column=c, padx=4, pady=4
            )

    root.mainloop()


if __name__ == "__main__":
    run_calculator()
