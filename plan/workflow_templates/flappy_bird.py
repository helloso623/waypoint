"""Minimal Flappy Bird clone — tkinter only (no pygame).

Reference implementation for the flappy_bird Waypoint baseline.
Re-import or paste into Custom Python nodes in Automation Studio.
"""
import random
import tkinter as tk

# --- tunables ---
WIDTH, HEIGHT = 360, 520
BIRD_SIZE = 18
PIPE_W = 52
PIPE_GAP = 118
GRAVITY = 0.55
FLAP_VEL = -8.5
PIPE_SPEED = 3.2
PIPE_SPACING = 190


def run_game(master=None):
    if master is not None:
        root = tk.Toplevel(master)
    else:
        try:
            default = tk._default_root  # noqa: SLF001 — reuse active Tk when launched from GeneratedApp
            root = tk.Toplevel(default) if default and default.winfo_exists() else tk.Tk()
        except tk.TclError:
            root = tk.Tk()
    root.title("Flappy Bird")
    root.resizable(False, False)

    canvas = tk.Canvas(root, width=WIDTH, height=HEIGHT, bg="#4ec0ca", highlightthickness=0)
    canvas.pack()

    score_var = tk.StringVar(value="0")
    score_lbl = tk.Label(root, textvariable=score_var, font=("Segoe UI", 14, "bold"), bg="#4ec0ca")
    score_lbl.place(x=12, y=8)

    state = {
        "bird_y": HEIGHT / 2,
        "vel": 0.0,
        "pipes": [],
        "score": 0,
        "running": True,
        "passed": set(),
    }

    bird = canvas.create_oval(0, 0, 0, 0, fill="#f7d308", outline="#c9a000", width=2)
    ground = canvas.create_rectangle(0, HEIGHT - 36, WIDTH, HEIGHT, fill="#ded895", outline="")

    def reset():
        state["bird_y"] = HEIGHT / 2
        state["vel"] = 0.0
        state["score"] = 0
        state["passed"] = set()
        state["running"] = True
        score_var.set("0")
        canvas.delete("pipe")
        state["pipes"] = []
        for i in range(3):
            spawn_pipe(WIDTH + i * PIPE_SPACING)

    def spawn_pipe(x):
        gap_y = random.randint(90, HEIGHT - 90 - PIPE_GAP)
        top = canvas.create_rectangle(x, 0, x + PIPE_W, gap_y, fill="#73bf2e", tags="pipe")
        bot = canvas.create_rectangle(
            x, gap_y + PIPE_GAP, x + PIPE_W, HEIGHT - 36, fill="#73bf2e", tags="pipe"
        )
        state["pipes"].append({"x": x, "gap_y": gap_y, "top": top, "bot": bot})

    def flap(_event=None):
        if state["running"]:
            state["vel"] = FLAP_VEL

    def collide(bx, by):
        if by < 0 or by + BIRD_SIZE > HEIGHT - 36:
            return True
        for p in state["pipes"]:
            if bx + BIRD_SIZE > p["x"] and bx < p["x"] + PIPE_W:
                if by < p["gap_y"] or by + BIRD_SIZE > p["gap_y"] + PIPE_GAP:
                    return True
        return False

    def tick():
        if not state["running"]:
            return
        state["vel"] += GRAVITY
        state["bird_y"] += state["vel"]
        bx = 70
        by = state["bird_y"]
        canvas.coords(bird, bx, by, bx + BIRD_SIZE, by + BIRD_SIZE)

        for p in state["pipes"]:
            p["x"] -= PIPE_SPEED
            canvas.coords(p["top"], p["x"], 0, p["x"] + PIPE_W, p["gap_y"])
            canvas.coords(p["bot"], p["x"], p["gap_y"] + PIPE_GAP, p["x"] + PIPE_W, HEIGHT - 36)
            pid = p["top"]
            if pid not in state["passed"] and p["x"] + PIPE_W < bx:
                state["passed"].add(pid)
                state["score"] += 1
                score_var.set(str(state["score"]))

        state["pipes"] = [p for p in state["pipes"] if p["x"] + PIPE_W > 0]
        while len(state["pipes"]) < 3:
            last_x = max(p["x"] for p in state["pipes"]) if state["pipes"] else WIDTH
            spawn_pipe(last_x + PIPE_SPACING)

        if collide(bx, by):
            state["running"] = False
            canvas.create_text(
                WIDTH / 2, HEIGHT / 2, text="Game Over\nSpace or click to restart",
                fill="white", font=("Segoe UI", 16, "bold"), justify="center",
            )
            return
        root.after(16, tick)

    def on_input(event=None):
        if not state["running"]:
            canvas.delete("all")
            canvas.create_rectangle(0, HEIGHT - 36, WIDTH, HEIGHT, fill="#ded895", outline="", tags="ground")
            reset()
            tick()
        else:
            flap(event)

    root.bind("<space>", on_input)
    root.bind("<Button-1>", on_input)
    reset()
    tick()
    root.mainloop()


if __name__ == "__main__":
    run_game()
