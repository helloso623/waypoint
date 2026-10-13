"""Cognitive drill generators for the Practice tab. Pure Python, no AI calls -- these are
short, deterministic games (memory/math/logic/time-estimation), not open-ended content, so
there's no reason to spend API tokens generating them. Each `generate_*` returns everything
needed to render + self-grade a round; the frontend computes its own score and POSTs it to
/api/practice/<game_key>/submit (see app.py) since this is a single-user local app with no
adversarial concern -- there's nothing to protect the answers from.
"""
import hashlib
import itertools
import random

# Useful vocabulary pools with short glosses — shown after the round for "learn while playing".
WORD_BANK = [
    ("ephemeral", "lasting a very short time"),
    ("pragmatic", "dealing with things sensibly and realistically"),
    ("ubiquitous", "present or found everywhere"),
    ("tenacious", "holding firmly to a purpose despite obstacles"),
    ("lucid", "clear and easy to understand"),
    ("meticulous", "showing great attention to detail"),
    ("resilient", "able to recover quickly from difficulty"),
    ("cogent", "clear, logical, and convincing"),
    ("salient", "most noticeable or important"),
    ("ambivalent", "having mixed feelings"),
    ("diligent", "showing care and effort in work"),
    ("succinct", "briefly and clearly expressed"),
    ("prudent", "acting with care for the future"),
    ("arduous", "involving great effort"),
    ("feasible", "possible and practical to do"),
    ("volatile", "liable to change rapidly and unpredictably"),
    ("tacit", "understood without being stated"),
    ("empirical", "based on observation or experiment"),
    ("nuanced", "characterized by subtle distinctions"),
    ("scrutinize", "examine closely and critically"),
    ("bolster", "support or strengthen"),
    ("mitigate", "make less severe or serious"),
    ("calibrate", "adjust precisely for a standard"),
    ("iterate", "repeat a process to refine it"),
    ("synthesize", "combine parts into a coherent whole"),
    ("extrapolate", "extend known data to estimate unknowns"),
    ("corroborate", "confirm with supporting evidence"),
    ("hypothesis", "a proposed explanation to be tested"),
    ("prototype", "an early model built to test an idea"),
    ("throughput", "rate of successful processing over time"),
    ("latency", "delay before a transfer of data begins"),
    ("redundant", "extra capacity kept for reliability"),
    ("scalable", "able to grow without losing performance"),
    ("modular", "composed of interchangeable units"),
    ("robust", "able to withstand stress or error"),
    ("granular", "broken into fine, detailed pieces"),
    ("asymmetric", "unequal on opposite sides"),
    ("heuristic", "a practical rule for quick decisions"),
    ("invariant", "a property that stays constant"),
    ("orthogonal", "independent; at right angles"),
]


def _fact_hash(text):
    return hashlib.sha256(str(text).strip().lower().encode()).hexdigest()[:16]


def _with_fact_dedup(pick_fn, seen_hashes=None, max_tries=3):
    """Pick a fact via pick_fn(); retry on seen_hashes collision (up to max_tries)."""
    seen = set(seen_hashes or [])
    last = None
    for _ in range(max_tries):
        item = pick_fn()
        text = item if isinstance(item, str) else (item.get("fact") or item.get("text") or "")
        h = _fact_hash(text)
        last = (item, h)
        if h not in seen:
            if isinstance(item, dict):
                return {**item, "fact_hash": h}
            return {"fact": item, "fact_hash": h}
    item, h = last
    if isinstance(item, dict):
        return {**item, "fact_hash": h}
    return {"fact": item, "fact_hash": h}


def _word_entries(count, seen_hashes=None):
    pool = list(WORD_BANK)
    random.shuffle(pool)
    picked = []
    seen = set(seen_hashes or [])
    for word, gloss in pool:
        if len(picked) >= count:
            break
        h = _fact_hash(f"{word}:{gloss}")
        if h in seen:
            continue
        picked.append((word, gloss, h))
    if len(picked) < count:
        for word, gloss in pool:
            if len(picked) >= count:
                break
            if any(w == word for w, _, _ in picked):
                continue
            picked.append((word, gloss, _fact_hash(f"{word}:{gloss}")))
    words = [w for w, _, _ in picked]
    glosses = {w: g for w, g, _ in picked}
    fact_hashes = {w: h for w, _, h in picked}
    return words, glosses, fact_hashes


def generate_memory_round(difficulty, seen_hashes=None):
    word_count = min(len(WORD_BANK) // 2, 3 + difficulty)
    words, glosses, fact_hashes = _word_entries(word_count, seen_hashes)
    remaining = [w for w, _ in WORD_BANK if w not in words]
    distractors = random.sample(remaining, min(len(remaining), max(3, word_count)))
    return {
        "words": words,
        "distractors": distractors,
        "reveal_seconds": max(3, word_count - 1),
        "glosses": glosses,
        "fact_hashes": fact_hashes,
    }


def grade_memory_round(words, recalled):
    recalled_norm = {w.strip().lower() for w in recalled if w.strip()}
    words_norm = {w.lower() for w in words}
    correct = recalled_norm & words_norm
    return {
        "score": len(correct),
        "max_score": len(words),
        "details": {"correct": sorted(correct), "missed": sorted(words_norm - recalled_norm)},
    }


def _math_add_sub_single_digit():
    if random.choice([True, False]):
        answer = random.randint(2, 18)
        a = random.randint(1, min(9, answer - 1))
        return f"{a} + {answer - a}", answer
    answer = random.randint(1, 17)
    a = random.randint(answer + 1, 18)
    return f"{a} - {a - answer}", answer


def _math_small_mult():
    answer = random.choice([n * m for n in range(2, 10) for m in range(2, 10)])
    pairs = [(n, m) for n in range(2, 10) for m in range(2, 10) if n * m == answer]
    a, b = random.choice(pairs)
    if random.choice([True, False]):
        a, b = b, a
    return f"{a} × {b}", answer


def _math_two_digit_mult():
    a = random.randint(11, 19)
    b = random.randint(2, 9)
    answer = a * b
    if random.choice([True, False]):
        a, b = b, a
    return f"{a} × {b}", answer


def _math_round_pct():
    pct = random.choice([10, 20, 25, 50])
    base = random.choice([20, 40, 50, 60, 80, 100, 120, 200, 250, 500])
    answer = base * pct // 100
    return f"{pct}% of {base}", answer


def _math_two_step_paren():
    c = random.randint(2, 9)
    inner_sum = random.randint(3, 15)
    a = random.randint(1, inner_sum - 1)
    b = inner_sum - a
    answer = inner_sum * c
    return f"({a} + {b}) × {c}", answer


def _math_three_step():
    kind = random.choice(["add_mult", "paren_sub", "mult_add"])
    if kind == "add_mult":
        b = random.randint(2, 9)
        c = random.randint(2, 9)
        answer = random.randint(20, 120)
        a = answer - b * c
        if a < 1:
            a = random.randint(2, 12)
            answer = a + b * c
        return f"{a} + {b} × {c}", answer
    if kind == "paren_sub":
        c = random.randint(2, 9)
        inner = random.randint(4, 18)
        a = random.randint(1, inner - 1)
        b = inner - a
        answer = inner * c - random.randint(1, min(15, inner * c - 1))
        d = inner * c - answer
        return f"({a} + {b}) × {c} - {d}", answer
    a = random.randint(2, 9)
    b = random.randint(2, 9)
    c = random.randint(2, 20)
    answer = a * b + c
    return f"{a} × {b} + {c}", answer


def _eng_math_problem(difficulty):
    """Engineering-flavored mental math — answer-first, clean integers only."""
    roll = random.random()
    if roll < 0.22:
        conv = random.choice([
            ("cm to mm", lambda x: x * 10),
            ("mm to cm", lambda x: x // 10),
            ("m to cm", lambda x: x * 100),
            ("GB to MB (×1024)", lambda x: x * 1024),
            ("MB to KB (×1024)", lambda x: x * 1024),
        ])
        label, fn = conv
        if "mm to cm" in label:
            val = random.randint(2, 40) * 10
        elif "GB" in label or "MB" in label:
            val = random.choice([1, 2, 4, 8, 16])
        else:
            val = random.randint(2, 25) if "m to cm" in label else random.randint(3, 99)
        return {"question": f"{val} {label}", "answer": fn(val)}
    if roll < 0.42:
        exp = random.randint(3, 10 + difficulty // 2)
        base = 2 ** exp
        op = random.choice(["value", "next", "sum"])
        if op == "value":
            return {"question": f"2^{exp}", "answer": base}
        if op == "next":
            return {"question": f"2^{exp} + 2^{exp}", "answer": base * 2}
        e2 = exp + random.randint(1, 3)
        return {"question": f"2^{exp} + 2^{e2}", "answer": base + 2 ** e2}
    if roll < 0.62:
        pct = random.choice([5, 10, 12, 15, 20, 25, 33, 40, 50, 60, 75, 80, 90])
        supply = random.choice([330, 470, 510, 680, 1000, 1200, 1500, 3300, 5000])
        ans = supply * pct // 100
        return {"question": f"{pct}% of {supply} (divider drop)", "answer": ans}
    if roll < 0.78:
        r1 = random.choice([100, 220, 330, 470, 1000])
        r2 = random.choice([100, 220, 330, 470, 1000])
        parallel = (r1 * r2) // (r1 + r2)
        return {"question": f"R1={r1}Ω ∥ R2={r2}Ω → R_eq (integer)", "answer": parallel}
    a = random.randint(8, 99)
    b = random.randint(2, 12)
    return {"question": f"{a} × {b} (mental)", "answer": a * b}


def _math_builders_for_difficulty(d):
    """Return weighted (builder_fn, weight) pairs for smooth 1–10 curriculum."""
    d = max(1, min(10, d))
    builders = []
    if d <= 2:
        builders.append((_math_add_sub_single_digit, 10 - d))
    if d <= 3:
        builders.append((_math_small_mult, max(0, d - 1)))
    if 2 <= d <= 6:
        builders.append((_math_add_sub_single_digit, max(0, 6 - d)))
    if d >= 4:
        builders.append((_math_small_mult, min(d - 2, 4)))
    if d >= 5:
        builders.append((_math_two_digit_mult, min(d - 3, 5)))
        builders.append((_math_round_pct, min(d - 4, 4)))
    if d >= 7:
        builders.append((_math_two_step_paren, 4 + (d - 7)))
    if d >= 8:
        builders.append((_math_three_step, 3 + (d - 8)))
    if d >= 10:
        builders = [(_eng_math_problem, 1)]
    elif d >= 9:
        builders.append((_math_three_step, 5))
    weights = [w for _, w in builders if w > 0]
    fns = [fn for fn, w in builders if w > 0]
    if not fns:
        return [_math_add_sub_single_digit]
    return random.choices(fns, weights=weights, k=1)


def _math_problem_for_difficulty(difficulty):
    d = max(1, min(10, difficulty))
    if d >= 10:
        return _eng_math_problem(d)
    builder = _math_builders_for_difficulty(d)[0]
    if builder is _eng_math_problem:
        return builder(d)
    question, answer = builder()
    return {"question": question, "answer": answer}


def generate_math_round(difficulty):
    d = max(1, min(10, difficulty))
    count = 5 if d <= 5 else 6
    problems = [_math_problem_for_difficulty(d) for _ in range(count)]
    time_limit = max(15, 40 - d * 2)
    return {
        "problems": [{"question": p["question"]} for p in problems],
        "answers": [p["answer"] for p in problems],
        "time_limit_seconds": time_limit,
    }


def grade_math_round(answers, submitted):
    correct = sum(1 for a, s in zip(answers, submitted) if _safe_int(s) == a)
    return {"score": correct, "max_score": len(answers), "details": {}}


def _safe_int(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


NAME_BANK = ["Amara", "Boris", "Chen", "Dara", "Elan", "Farid", "Gita", "Hana", "Ivo", "Jael"]

LOGIC_ATTR_SETS = [
    ("role", ["Firmware", "Hardware", "Ops", "Research"]),
    ("city", ["Austin", "Boston", "Denver", "Seattle"]),
    ("tool", ["Oscilloscope", "Soldering iron", "Logic analyzer", "Multimeter"]),
    ("stage", ["Prototype", "Pilot", "Production", "R&D"]),
    ("focus", ["Power", "RF", "Sensors", "Controls"]),
]


def _logic_assignment_key(assignment):
  """Hashable key for an assignment dict name -> {attr: value}."""
  return tuple(sorted((n, tuple(sorted(av.items()))) for n, av in assignment.items()))


def _logic_enumerate_solutions(names, attrs):
    """Brute-force all bijective assignments: each attr column is a permutation."""
    attr_names = [a for a, _ in attrs]
    value_lists = [vals[: len(names)] for _, vals in attrs]
    solutions = []
    perms = [list(itertools.permutations(vl)) for vl in value_lists]
    for combo in itertools.product(*perms):
        assignment = {name: {} for name in names}
        for attr_i, attr in enumerate(attr_names):
            for name_i, name in enumerate(names):
                assignment[name][attr] = combo[attr_i][name_i]
        solutions.append(assignment)
    return solutions


def _logic_clue_positive(name, attr, value):
    return f"{name}'s {attr} is {value}."


def _logic_clue_negative(name, attr, value):
    return f"{name}'s {attr} is NOT {value}."


def _logic_clue_either(name_a, attr, val_a, name_b, val_b):
    return f"Either {name_a}'s {attr} is {val_a} or {name_b}'s {attr} is {val_b}."


def _logic_clue_exactly_one(names, attr, value):
    pair = " and ".join(names)
    return f"Exactly one of {pair} has {attr} {value}."


def _logic_clue_satisfies(assignment, clue):
    kind = clue["kind"]
    if kind == "positive":
        return assignment[clue["name"]][clue["attr"]] == clue["value"]
    if kind == "negative":
        return assignment[clue["name"]][clue["attr"]] != clue["value"]
    if kind == "either":
        a = assignment[clue["name_a"]][clue["attr"]] == clue["val_a"]
        b = assignment[clue["name_b"]][clue["attr"]] == clue["val_b"]
        return a or b
    if kind == "exactly_one":
        hits = sum(1 for n in clue["names"] if assignment[n][clue["attr"]] == clue["value"])
        return hits == 1
    return True


def _logic_render_clue(clue):
    kind = clue["kind"]
    if kind == "positive":
        return _logic_clue_positive(clue["name"], clue["attr"], clue["value"])
    if kind == "negative":
        return _logic_clue_negative(clue["name"], clue["attr"], clue["value"])
    if kind == "either":
        return _logic_clue_either(clue["name_a"], clue["attr"], clue["val_a"], clue["name_b"], clue["val_b"])
    if kind == "exactly_one":
        return _logic_clue_exactly_one(clue["names"], clue["attr"], clue["value"])
    return ""


def _logic_derive_clues(solution, names, attrs, difficulty):
    attr_names = [a for a, _ in attrs]
    clues = []
    hard_floor = difficulty >= 3
    # Seed with one direct fact per person at low diff, fewer at high (harder inference)
    direct_count = max(1, len(names) - (1 if difficulty >= 7 else 0) - (1 if difficulty >= 9 else 0))
    for name in random.sample(names, direct_count):
        attr = random.choice(attr_names)
        clues.append({
            "kind": "positive",
            "name": name,
            "attr": attr,
            "value": solution[name][attr],
        })

    # Negations — false values for random slots (floor: at least one at diff >= 3)
    neg_count = 2 if hard_floor else (1 if difficulty < 5 else 2 if difficulty < 8 else 3)
    for _ in range(neg_count):
        name = random.choice(names)
        attr = random.choice(attr_names)
        vals = [v for _, vl in attrs for v in vl if v != solution[name][attr]]
        false_val = random.choice(vals)
        clues.append({"kind": "negative", "name": name, "attr": attr, "value": false_val})

    # Disjunctions (floor: at least one at diff >= 3)
    dis_min = 1 if hard_floor or difficulty >= 4 else 0
    dis_count = dis_min + (1 if difficulty >= 7 else 0)
    for _ in range(dis_count):
        na, nb = random.sample(names, 2)
        attr = random.choice(attr_names)
        va = solution[na][attr]
        all_vals = next(vl for a, vl in attrs if a == attr)[: len(names)]
        false_pool = [v for v in all_vals if v != solution[nb][attr]]
        vb = random.choice(false_pool) if false_pool else solution[nb][attr]
        clues.append({
            "kind": "either",
            "name_a": na, "name_b": nb,
            "attr": attr, "val_a": va, "val_b": vb,
        })

    # Exactly-one clues
    if difficulty >= 6:
        attr = random.choice(attr_names)
        value = random.choice(next(vl for a, vl in attrs if a == attr)[: len(names)])
        holders = [n for n in names if solution[n][attr] == value]
        if len(holders) == 1:
            others = [n for n in names if n not in holders]
            if len(others) >= 2:
                clues.append({"kind": "exactly_one", "names": holders + random.sample(others, 1), "attr": attr, "value": value})

    # Extra positives to reach clue floor without weakening uniqueness checks later
    if hard_floor:
        while len(clues) < 6:
            name = random.choice(names)
            attr = random.choice(attr_names)
            clues.append({
                "kind": "positive",
                "name": name,
                "attr": attr,
                "value": solution[name][attr],
            })

    random.shuffle(clues)
    target = max(6, 3 + difficulty // 3) if hard_floor else min(6, max(4, 3 + difficulty // 3))
    selected = clues[:target]
    if hard_floor:
        for kind in ("negative", "either"):
            if not any(c["kind"] == kind for c in selected):
                extra = next((c for c in clues if c["kind"] == kind), None)
                if extra and extra not in selected:
                    if len(selected) >= target:
                        selected[-1] = extra
                    else:
                        selected.append(extra)
    return selected


def _logic_unique_clue_set(solution, names, attrs, clues, all_solutions):
    matching = [s for s in all_solutions if all(_logic_clue_satisfies(s, c) for c in clues)]
    return len(matching) == 1 and _logic_assignment_key(matching[0]) == _logic_assignment_key(solution)


def _logic_entity_count(difficulty):
    if difficulty >= 3:
        return 4
    return 3


def _logic_attr_count(difficulty):
    if difficulty >= 3:
        return 3
    return 2


def _logic_generate_grid(difficulty):
    n = _logic_entity_count(difficulty)
    names = random.sample(NAME_BANK, n)
    attr_n = _logic_attr_count(difficulty)
    attr_pick = random.sample(LOGIC_ATTR_SETS, attr_n)
    attrs = [(a, vals) for a, vals in attr_pick]

    all_solutions = _logic_enumerate_solutions(names, attrs)
    if not all_solutions:
        raise ValueError("no solutions")

    for _ in range(40):
        solution = random.choice(all_solutions)
        clues = _logic_derive_clues(solution, names, attrs, difficulty)
        if _logic_unique_clue_set(solution, names, attrs, clues, all_solutions):
            break
    else:
        # Fallback: add positives until unique
        solution = random.choice(all_solutions)
        clues = _logic_derive_clues(solution, names, attrs, difficulty)
        for name in names:
            for attr, _ in attrs:
                clues.append({"kind": "positive", "name": name, "attr": attr, "value": solution[name][attr]})
                if _logic_unique_clue_set(solution, names, attrs, clues, all_solutions):
                    break
            if _logic_unique_clue_set(solution, names, attrs, clues, all_solutions):
                break

    clue_text = [_logic_render_clue(c) for c in clues]
    random.shuffle(clue_text)

    q_name = random.choice(names)
    q_attr = random.choice([a for a, _ in attrs])
    answer = solution[q_name][q_attr]
    options = next(vals[:n] for a, vals in attrs if a == q_attr)
    options = list(options)
    random.shuffle(options)

    question = f"What is {q_name}'s {q_attr}?"
    return {
        "format": "constraint_grid",
        "clues": clue_text,
        "question": question,
        "options": options,
        "answer": answer,
    }


ORDER_RELATIONS = [
    ("finished before", "first", "last"),
    ("is taller than", "tallest", "shortest"),
    ("earned more points than", "highest score", "lowest score"),
    ("arrived earlier than", "earliest", "latest"),
]


def _ordering_permutations(names):
    return [dict(zip(names, perm)) for perm in itertools.permutations(names)]


def _ordering_rank(order, names, relation):
    """Return names sorted by relation (index 0 = top)."""
    ranks = {n: i for i, n in enumerate(order)}
    return sorted(names, key=lambda n: ranks[n])


def _ordering_clue_satisfies(order_dict, clue):
    kind = clue["kind"]
    names = clue["names"]
    if kind == "before":
        return order_dict[clue["a"]] < order_dict[clue["b"]]
    if kind == "not_last":
        return order_dict[clue["name"]] != len(names) - 1
    if kind == "is_top":
        return order_dict[clue["name"]] == 0
    if kind == "is_bottom":
        return order_dict[clue["name"]] == len(names) - 1
    return True


def _ordering_unique(solution_order, names, clues, all_orders):
    name_to_idx = {n: i for i, n in enumerate(solution_order)}
    matching = []
    for perm in all_orders:
        od = {n: perm[n] for n in names}
        if all(_ordering_clue_satisfies(od, c) for c in clues):
            matching.append(perm)
    if len(matching) != 1:
        return False
    return matching[0] == name_to_idx


def _logic_generate_ordering(difficulty):
    d = max(1, min(10, difficulty))
    n = 4 if d < 7 else 5
    names = random.sample(NAME_BANK, n)
    relation, top_label, bottom_label = random.choice(ORDER_RELATIONS)
    solution_order = random.sample(names, n)
    name_to_idx = {name: i for i, name in enumerate(solution_order)}
    all_orders = [{nm: i for i, nm in enumerate(perm)} for perm in itertools.permutations(names)]

    clues = []
    for i in range(n - 1):
        clues.append({"kind": "before", "names": names, "a": solution_order[i], "b": solution_order[i + 1]})
    if d >= 5 and n >= 4:
        clues.append({"kind": "not_last", "names": names, "name": random.choice(solution_order[:-1])})
    if d >= 6:
        clues.append({"kind": "is_top", "names": names, "name": solution_order[0]})
    if d >= 8 and n >= 5:
        clues.append({"kind": "is_bottom", "names": names, "name": solution_order[-1]})

    for _ in range(30):
        random.shuffle(clues)
        subset = clues[: max(3, min(len(clues), 3 + d // 3))]
        if _ordering_unique(solution_order, names, subset, all_orders):
            clues = subset
            break

    clue_text = []
    for c in clues:
        if c["kind"] == "before":
            clue_text.append(f"{c['a']} {relation} {c['b']}.")
        elif c["kind"] == "not_last":
            clue_text.append(f"{c['name']} is NOT {bottom_label}.")
        elif c["kind"] == "is_top":
            clue_text.append(f"{c['name']} is {top_label}.")
        elif c["kind"] == "is_bottom":
            clue_text.append(f"{c['name']} is {bottom_label}.")
    random.shuffle(clue_text)

    pos = random.randint(0, n - 1)
    if pos == 0:
        question = f"Who is {top_label}?"
        answer = solution_order[0]
    elif pos == n - 1:
        question = f"Who is {bottom_label}?"
        answer = solution_order[-1]
    else:
        ordinals = ["2nd", "3rd", "4th", "5th"]
        question = f"Who is {ordinals[pos - 1]} in order ({top_label} → {bottom_label})?"
        answer = solution_order[pos]

    return {
        "format": "ordering",
        "clues": clue_text,
        "question": question,
        "options": list(names),
        "answer": answer,
    }


def _truth_assignments(names, statements):
    """Enumerate truth-teller assignments; each stmt is (speaker, claimed_speaker_is_truthful)."""
    solutions = []
    for mask in range(2 ** len(names)):
        roles = {names[i]: bool(mask & (1 << i)) for i in range(len(names))}
        ok = True
        for speaker, claims_about, expected_truth in statements:
            actual = roles.get(claims_about, False)
            if roles[speaker]:
                if actual != expected_truth:
                    ok = False
                    break
            else:
                if actual == expected_truth:
                    ok = False
                    break
        if ok:
            solutions.append(roles)
    return solutions


def _logic_generate_truth_tellers(difficulty):
    d = max(1, min(10, difficulty))
    n = 3 if d < 8 else 4
    pool = random.sample(NAME_BANK, n)
    target = pool[0]

    for _ in range(60):
        roles = {name: random.choice([True, False]) for name in pool}
        witness = random.choice([name for name in pool if name != target])
        statements = [(witness, target, roles[target])]
        if n >= 4:
            other = [name for name in pool if name not in (witness, target)][0]
            statements.append((other, witness, roles[witness]))
        solutions = _truth_assignments(pool, statements)
        if len(solutions) != 1:
            continue
        if solutions[0] != roles:
            continue
        clues = []
        for speaker, about, claims_truth in statements:
            label = "truth-teller" if claims_truth else "liar"
            clues.append(f"{speaker} says: \"{about} is a {label}.\"")
        answer = "truth-teller" if roles[target] else "liar"
        return {
            "format": "truth_tellers",
            "clues": clues,
            "question": f"Is {target} a truth-teller or a liar?",
            "options": ["truth-teller", "liar"],
            "answer": answer,
        }

    roles = {pool[0]: True, pool[1]: False, pool[2]: True}
    if n == 4:
        roles[pool[3]] = False
    witness = pool[1]
    statements = [(witness, target, roles[target])]
    clues = [f"{witness} says: \"{target} is a {'truth-teller' if roles[target] else 'liar'}.\""]
    return {
        "format": "truth_tellers",
        "clues": clues,
        "question": f"Is {target} a truth-teller or a liar?",
        "options": ["truth-teller", "liar"],
        "answer": "truth-teller" if roles[target] else "liar",
    }


SYLLOGISM_PUZZLES = [
    {
        "clues": [
            "All widgets are gadgets.",
            "All gadgets are devices.",
            "Therefore: All widgets are devices.",
        ],
        "question": "Is the conclusion logically valid?",
        "answer": "Valid",
    },
    {
        "clues": [
            "All sensors are calibrated.",
            "Some calibrated items are faulty.",
            "Therefore: Some sensors are faulty.",
        ],
        "question": "Is the conclusion logically valid?",
        "answer": "Invalid",
    },
    {
        "clues": [
            "No beta builds are released.",
            "All released builds are stable.",
            "Therefore: No beta builds are stable.",
        ],
        "question": "Is the conclusion logically valid?",
        "answer": "Invalid",
    },
    {
        "clues": [
            "All prime numbers greater than 2 are odd.",
            "7 is a prime number greater than 2.",
            "Therefore: 7 is odd.",
        ],
        "question": "Is the conclusion logically valid?",
        "answer": "Valid",
    },
    {
        "clues": [
            "Some engineers know Rust.",
            "Some Rust users know C.",
            "Therefore: Some engineers know C.",
        ],
        "question": "Is the conclusion logically valid?",
        "answer": "Invalid",
    },
]


def _logic_generate_syllogism(difficulty):
    puzzle = random.choice(SYLLOGISM_PUZZLES)
    return {
        "format": "syllogism",
        "clues": puzzle["clues"],
        "question": puzzle["question"],
        "options": ["Valid", "Invalid"],
        "answer": puzzle["answer"],
    }


ODD_ONE_OUT_SETS = [
    {
        "items": ["2", "4", "8", "16", "9"],
        "rule": "powers of two",
        "answer": "9",
    },
    {
        "items": ["3", "6", "9", "12", "14"],
        "rule": "multiples of three",
        "answer": "14",
    },
    {
        "items": ["5", "10", "15", "20", "22"],
        "rule": "multiples of five",
        "answer": "22",
    },
    {
        "items": ["triangle", "square", "pentagon", "hexagon", "circle"],
        "rule": "polygon with straight sides (specific counts)",
        "answer": "circle",
    },
    {
        "items": ["ACE", "BDF", "CEG", "DFH", "EGJ"],
        "rule": "every other letter starting at A",
        "answer": "EGJ",
    },
    {
        "items": ["11", "13", "17", "19", "21"],
        "rule": "prime numbers",
        "answer": "21",
    },
]


def _logic_generate_odd_one_out(difficulty):
    d = max(1, min(10, difficulty))
    candidates = [s for s in ODD_ONE_OUT_SETS if len(s["items"]) >= 4]
    for _ in range(40):
        spec = random.choice(candidates)
        items = list(spec["items"])
        answer = spec["answer"]
        if answer not in items:
            continue
        rule = spec["rule"]
        clues = [
            f"Five values share a pattern — exactly one breaks the rule.",
            f"Rule (do not say aloud): {rule}.",
        ]
        options = items[:]
        random.shuffle(options)
        # Verify unique odd one: only one item matches answer
        if sum(1 for x in options if x == answer) != 1:
            continue
        return {
            "format": "odd_one_out",
            "clues": clues,
            "question": f"Which value does NOT fit the rule ({rule})?",
            "options": options,
            "answer": answer,
        }
    spec = ODD_ONE_OUT_SETS[0]
    options = list(spec["items"])
    random.shuffle(options)
    return {
        "format": "odd_one_out",
        "clues": [f"Rule: {spec['rule']}."],
        "question": f"Which value does NOT fit the rule ({spec['rule']})?",
        "options": options,
        "answer": spec["answer"],
    }


LOGIC_FORMAT_GENERATORS = {
    "constraint_grid": _logic_generate_grid,
    "ordering": _logic_generate_ordering,
    "truth_tellers": _logic_generate_truth_tellers,
    "syllogism": _logic_generate_syllogism,
    "odd_one_out": _logic_generate_odd_one_out,
}


def generate_logic_round(difficulty):
    d = max(1, min(10, difficulty))
    formats = list(LOGIC_FORMAT_GENERATORS.keys())
    fmt = formats[(d + random.randint(0, len(formats) - 1)) % len(formats)]
    return LOGIC_FORMAT_GENERATORS[fmt](d)


def grade_logic_round(answer, submitted):
    correct = (submitted or "").strip().lower() == (answer or "").strip().lower()
    return {"score": 1 if correct else 0, "max_score": 1, "details": {"correct_answer": answer}}


def generate_time_estimation_round(difficulty):
    target = random.randint(4 + difficulty, 8 + difficulty * 2)
    return {"target_seconds": target}


def grade_time_estimation_round(target_seconds, actual_elapsed_seconds):
    diff = abs(target_seconds - actual_elapsed_seconds)
    tolerance = max(1.0, target_seconds * 0.15)
    score = max(0, round(10 * (1 - min(1, diff / (tolerance * 3)))))
    return {"score": score, "max_score": 10, "details": {"target_seconds": target_seconds, "diff": round(diff, 1)}}


# --- Spelling (tiered ~120-word bank) -------------------------------------------------------------

SPELLING_BANK = [
    # tier 1 — short common
    ("cat", 1), ("dog", 1), ("ship", 1), ("tree", 1), ("blue", 1), ("fast", 1), ("hand", 1), ("jump", 1),
    ("milk", 1), ("rain", 1), ("fish", 1), ("book", 1),
    # tier 2
    ("friend", 2), ("school", 2), ("garden", 2), ("button", 2), ("little", 2), ("people", 2), ("answer", 2),
    ("minute", 2), ("castle", 2), ("orange", 2), ("travel", 2), ("winter", 2), ("planet", 2), ("market", 2),
    ("guitar", 2), ("silver", 2),
    # tier 3
    ("because", 3), ("through", 3), ("thought", 3), ("enough", 3), ("beautiful", 3), ("important", 3),
    ("different", 3), ("together", 3), ("remember", 3), ("question", 3), ("mountain", 3), ("surprise", 3),
    ("February", 3), ("business", 3), ("tomorrow", 3),
    # tier 4
    ("receive", 4), ("believe", 4), ("weird", 4), ("piece", 4), ("ceiling", 4), ("foreign", 4), ("height", 4),
    ("neighbor", 4), ("leisure", 4), ("ancient", 4), ("grammar", 4), ("column", 4),
    ("knowledge", 4), ("language", 4), ("exercise", 4),
    # tier 5
    ("accommodate", 5), ("embarrass", 5), ("occurrence", 5), ("millennium", 5), ("maintenance", 5),
    ("pronunciation", 5), ("recommend", 5), ("separate", 5), ("definitely", 5), ("necessary", 5),
    ("restaurant", 5), ("rhythm", 5), ("calendar", 5), ("tomorrow", 5), ("library", 5),
    # tier 6
    ("conscientious", 6), ("mischievous", 6), ("supersede", 6), ("liaison", 6), ("manoeuvre", 6),
    ("bureaucracy", 6), ("questionnaire", 6), ("parliament", 6), ("entrepreneur", 6), ("fluorescent", 6),
    ("pharaoh", 6), ("yacht", 6), ("acquiesce", 6), ("bizarre", 6),
    # tier 7
    ("onomatopoeia", 7), ("idiosyncrasy", 7), ("anesthesiology", 7), ("chiaroscuro", 7), ("doppelganger", 7),
    ("fuchsia", 7), ("mnemonic", 7), ("quintessential", 7), ("serendipity", 7), ("vicissitude", 7),
    ("worcestershire", 7), ("zeitgeist", 7),
    # tier 8
    ("antidisestablishmentarianism", 8), ("pneumonoultramicroscopicsilicovolcanoconiosis", 8),
    ("floccinaucinihilipilification", 8), ("hippopotomonstrosesquippedaliophobia", 8),
    ("pseudopseudohypoparathyroidism", 8), ("incomprehensibilities", 8),
    # tier 9–10 — rare / long technical
    ("electroencephalographically", 9), ("immunoelectrophoretically", 9), ("microspectrophotometric", 9),
    ("psychoneuroendocrinological", 9), ("thyroparathyroidectomized", 9), ("dichlorodifluoromethane", 9),
    ("uncharacteristically", 9), ("counterrevolutionaries", 9), ("deinstitutionalization", 9),
    ("interdisciplinary", 9), ("misinterpretation", 9), ("representationalism", 9),
    ("hexakosioihexekontahexaphobia", 10), ("otorhinolaryngological", 10), ("spectrophotofluorometry", 10),
    ("trinitrophenylmethylnitramine", 10), ("pseudopseudohypoparathyroidism", 10), ("overintellectualization", 10),
]

_HOMOPHONE_SWAPS = {
    "receive": "recieve", "believe": "beleive", "piece": "peice", "ceiling": "seiling",
    "their": "thier", "weird": "wierd", "separate": "seperate", "definitely": "definately",
    "necessary": "neccessary", "accommodate": "accomodate", "occurrence": "occurence",
    "recommend": "reccomend", "rhythm": "rythem", "friend": "freind", "beautiful": "beatiful",
}


def _spelling_misspellings(word, count=3):
    results = []
    if word in _HOMOPHONE_SWAPS:
        results.append(_HOMOPHONE_SWAPS[word])
    chars = list(word)
    strategies = []
    if len(chars) >= 3:
        i = random.randint(0, len(chars) - 2)
        swapped = chars[:]
        swapped[i], swapped[i + 1] = swapped[i + 1], swapped[i]
        strategies.append("".join(swapped))
    if len(chars) >= 2:
        i = random.randint(0, len(chars) - 1)
        doubled = chars[:]
        doubled.insert(i, chars[i])
        strategies.append("".join(doubled))
    if len(chars) >= 2:
        i = random.randint(0, len(chars) - 1)
        dropped = chars[:i] + chars[i + 1:]
        if dropped:
            strategies.append("".join(dropped))
    for variant in ["ae", "ie", "ou", "ei"]:
        if variant in word:
            alt = word.replace(variant, variant[::-1], 1)
            strategies.append(alt)
    random.shuffle(strategies)
    for s in strategies:
        if s != word and s not in results and s.isalpha():
            results.append(s)
        if len(results) >= count:
            break
    while len(results) < count:
        i = random.randint(0, max(0, len(word) - 1))
        noise = list(word)
        noise[i] = random.choice("aeiou")
        candidate = "".join(noise)
        if candidate != word and candidate not in results:
            results.append(candidate)
    return results[:count]


def generate_spelling_round(difficulty):
    d = max(1, min(10, difficulty))
    max_tier = min(10, d + 1)
    pool = [w for w, tier in SPELLING_BANK if tier <= max_tier]
    word_count = 5 + d // 2
    picked = random.sample(pool, min(word_count, len(pool)))
    words = []
    for correct in picked:
        words.append({
            "correct": correct,
            "misspellings": _spelling_misspellings(correct, 3),
        })
    return {
        "words": words,
        "time_limit_seconds": max(30, 75 - d * 3),
    }


def grade_spelling_round(words, submitted):
    correct = 0
    for entry, choice in zip(words, submitted):
        if (choice or "").strip().lower() == entry["correct"].lower():
            correct += 1
    return {"score": correct, "max_score": len(words), "details": {}}


# --- Science / vocab fact generators (dedup-aware) ----------------------------------------------

TECH_FACT_BANK = [
    "TCP guarantees ordered delivery; UDP does not.",
    "A cache hit avoids a slower memory or disk fetch.",
    "Big-O describes growth rate, not exact runtime.",
    "Git commits are snapshots, not just diffs.",
    "A mutex prevents two threads from entering a critical section at once.",
    "Moore's law observed transistor density doubling roughly every two years.",
    "HTTP is stateless — cookies carry session state.",
    "A hash function maps input to a fixed-size digest.",
    "CAP theorem: pick two of consistency, availability, partition tolerance.",
    "Floating-point math is approximate, not exact decimal.",
    "An LRU cache evicts the least recently used entry first.",
    "DNS translates human-readable hostnames to IP addresses.",
    "A stack grows LIFO; a queue is FIFO.",
    "Compilation translates source to machine code ahead of time.",
    "An interrupt lets hardware signal the CPU asynchronously.",
    "Shannon entropy measures information content in bits.",
    "A deadlock needs mutual exclusion, hold-and-wait, no preemption, and circular wait.",
    "RAID stripes or mirrors disks for speed or redundancy.",
    "TLS encrypts data in transit between client and server.",
    "A bloom filter can false-positive but never false-negative (if configured correctly).",
]


def generate_tech_fact(seen_hashes=None):
    return _with_fact_dedup(lambda: random.choice(TECH_FACT_BANK), seen_hashes)


def generate_vocab_fact(seen_hashes=None):
    def pick():
        word, gloss = random.choice(WORD_BANK)
        return {"fact": f"{word}: {gloss}", "word": word, "gloss": gloss}
    return _with_fact_dedup(pick, seen_hashes)


def generate_working_memory_round(difficulty):
    """Reversed digit span: memorize a digit sequence, recall it BACKWARDS -- recalling in
    reverse is the classic way to force actual working-memory manipulation instead of rote echo.
    """
    length = 3 + difficulty
    digits = [random.randint(0, 9) for _ in range(length)]
    return {"digits": digits, "reveal_seconds": max(2, round(length * 0.8))}


SIGNAL_SYMBOLS = [
    {"id": "tri", "shape": "triangle", "hue": 0},
    {"id": "sq", "shape": "square", "hue": 120},
    {"id": "hex", "shape": "hexagon", "hue": 210},
    {"id": "cir", "shape": "circle", "hue": 280},
    {"id": "dia", "shape": "diamond", "hue": 45},
    {"id": "star", "shape": "star", "hue": 330},
]


def generate_signal_storm_round(difficulty):
    """Canvas minigame metadata — rendered client-side; stats stored in localStorage only."""
    d = max(1, min(10, difficulty))
    pool = random.sample(SIGNAL_SYMBOLS, min(4 + d // 3, len(SIGNAL_SYMBOLS)))
    target = random.choice(pool)
    mimic_level = max(0, d - 4)
    return {
        "duration_seconds": 30,
        "target": target,
        "symbol_pool": pool,
        "spawn_rate": 0.35 + d * 0.04,
        "distractor_mimic": mimic_level,
        "speed": 0.6 + d * 0.08,
    }


def generate_memory_constellation_round(difficulty):
    """Canvas star-map metadata — path length and reveal speed scale with difficulty."""
    d = max(1, min(10, difficulty))
    node_count = min(12, 4 + d)
    reveal_ms = max(180, 520 - d * 32)
    return {
        "node_count": node_count,
        "reveal_ms": reveal_ms,
        "grid_cols": 5 + d // 3,
        "grid_rows": 4 + d // 4,
        "palette": "constellation" if d >= 6 else "default",
    }


CIRCUIT_COMPONENTS = ["wire", "and", "or", "not"]

CIRCUIT_COMPONENT_LEGEND = [
    {"type": "wire", "symbol": "—", "meaning": "Conducts signal between slots"},
    {"type": "and", "symbol": "∧", "meaning": "Output high only when both inputs are high"},
    {"type": "or", "symbol": "∨", "meaning": "Output high when either input is high"},
    {"type": "not", "symbol": "¬", "meaning": "Inverts the input signal"},
]

CIRCUIT_GOALS = [
    "Wire power from left to right — match the blueprint before voltage fades.",
    "Complete the logic path so the lamp stays lit.",
    "Place components in order to restore full voltage to the output.",
]


def generate_circuit_sprint_round(difficulty):
    """Canvas circuit-board metadata — solution generated first (always solvable)."""
    d = max(1, min(10, difficulty))
    slot_count = min(7, 2 + d // 2)
    pool = ["wire", "and", "not"] if d < 5 else CIRCUIT_COMPONENTS
    solution = [random.choice(pool) for _ in range(slot_count)]
    extras = random.sample(CIRCUIT_COMPONENTS, min(3, len(CIRCUIT_COMPONENTS)))
    tray = solution + [c for c in extras if c not in solution]
    random.shuffle(tray)
    hint_slot = random.randint(0, slot_count - 1)
    legend_types = set(solution) | set(extras)
    components_legend = [entry for entry in CIRCUIT_COMPONENT_LEGEND if entry["type"] in legend_types]
    return {
        "slot_count": slot_count,
        "solution": solution,
        "tray": tray,
        "voltage_decay": round(0.12 + d * 0.035, 3),
        "time_limit": max(18, 48 - d * 2),
        "goal_description": random.choice(CIRCUIT_GOALS),
        "componentsLegend": components_legend,
        "hint": {"slot": hint_slot, "component": solution[hint_slot]},
    }


def generate_time_forge_round(difficulty):
    """Canvas timing-forge metadata — hold/release hidden durations; local-only."""
    d = max(1, min(10, difficulty))
    round_count = min(6, 3 + d // 2)
    targets = [round(0.7 + random.random() * (1.2 + d * 0.22), 1) for _ in range(round_count)]
    return {
        "round_count": round_count,
        "targets": targets,
        "tolerance_pct": max(0.07, 0.17 - d * 0.01),
        "distraction_level": d,
    }


# --- Hardware skill track (MIT OCW-inspired curriculum, levels 1–20) -----------------------------

HARDWARE_MODES = [
    {
        "key": "ohm_sprint",
        "label": "V=IR Sprint",
        "kind": "drill",
        "stage_key": "ohms_law",
        "difficulty_bias": 0,
        "desc": "Voltage, current, and resistance at bench speed.",
        "info": "Use V = I·R. Convert mA to A before dividing. Fractions like 5/8 work for ratios.",
    },
    {
        "key": "resistor_web",
        "label": "Resistor Web",
        "kind": "drill",
        "stage_key": "ohms_law",
        "difficulty_bias": 1,
        "desc": "Series, parallel, and mixed resistor networks.",
        "info": "Series adds; parallel inverts: 1/R_eq = 1/R1 + 1/R2. Combine inside-out.",
    },
    {
        "key": "gate_lab",
        "label": "Gate Lab",
        "kind": "minigame",
        "stage_key": "digital",
        "difficulty_bias": 0,
        "desc": "Truth tables and boolean gate spotting.",
        "info": "Read the table row by row — one missing output is usually enough to name the gate.",
    },
    {
        "key": "rc_pulse",
        "label": "RC Pulse",
        "kind": "drill",
        "stage_key": "rc",
        "difficulty_bias": 0,
        "desc": "τ = RC and charge/discharge intuition.",
        "info": "τ in ms when R is kΩ and C is µF. ~63% per τ; ~86% by 2τ.",
    },
    {
        "key": "opamp_math",
        "label": "Op-amp Math",
        "kind": "drill",
        "stage_key": "opamp",
        "difficulty_bias": 1,
        "desc": "Gain from resistor ratios — fractions welcome.",
        "info": "Inverting: −Rf/Rin. Non-inverting: 1 + Rf/Rg. Enter ratios as decimals or fractions.",
    },
    {
        "key": "sensor_scout",
        "label": "Sensor Scout",
        "kind": "practical",
        "stage_key": "sensors",
        "difficulty_bias": 0,
        "desc": "Match sensors and actuators to real signals.",
        "info": "Thermistors change R; encoders pulse; PWM controls average motor voltage.",
    },
    {
        "key": "pin_modes",
        "label": "Pin Modes",
        "kind": "practical",
        "stage_key": "mcu_io",
        "difficulty_bias": 0,
        "desc": "GPIO modes, debounce, and interrupt patterns.",
        "info": "Floating buttons need pull-ups. Fast pulses beat polling — use edge interrupts.",
    },
    {
        "key": "robot_route",
        "label": "Robot Route",
        "kind": "minigame",
        "stage_key": "robot_chain",
        "difficulty_bias": 1,
        "desc": "Order the sense → plan → actuate chain.",
        "info": "Physical sensor → ADC → control → PWM driver → motor. Safety cuts power first.",
    },
    {
        "key": "divider_drop",
        "label": "Divider Drop",
        "kind": "practical",
        "stage_key": "ohms_law",
        "difficulty_bias": 1,
        "desc": "Voltage-divider mental math with fraction answers.",
        "info": "V_out = V_in × R_bottom / (R_top + R_bottom). Answer as a fraction or decimal.",
    },
    {
        "key": "bench_brief",
        "label": "Bench Brief",
        "kind": "talk",
        "stage_key": "mcu_io",
        "difficulty_bias": -1,
        "desc": "Short practical coach cards — read, reflect, continue.",
        "info": "No trick questions — absorb the tip, then tap Continue. Use fullscreen if you like.",
    },
]

HARDWARE_MODE_BY_KEY = {m["key"]: m for m in HARDWARE_MODES}

HARDWARE_STAGES = [
    {
        "stage": 1,
        "key": "ohms_law",
        "stage_label": "Ohm's law & resistive networks",
        "teaching_point": "Relate voltage, current, and resistance — and combine resistors in series or parallel.",
    },
    {
        "stage": 2,
        "key": "digital",
        "stage_label": "Digital abstraction",
        "teaching_point": "Read truth tables and spot equivalent boolean expressions for basic gates.",
    },
    {
        "stage": 3,
        "key": "rc",
        "stage_label": "RC time constants",
        "teaching_point": "Estimate τ = RC and predict how quickly a capacitor charges or discharges.",
    },
    {
        "stage": 4,
        "key": "opamp",
        "stage_label": "Op-amp essentials",
        "teaching_point": "Recognize ideal inverting and non-inverting amplifier gain from resistor ratios.",
    },
    {
        "stage": 5,
        "key": "sensors",
        "stage_label": "Sensors & actuators",
        "teaching_point": "Match sensors to signal types and pick motor-drive concepts like PWM and H-bridge.",
    },
    {
        "stage": 6,
        "key": "mcu_io",
        "stage_label": "Microcontroller I/O",
        "teaching_point": "Choose pin modes, pull-ups, and when interrupts beat polling for embedded I/O.",
    },
    {
        "stage": 7,
        "key": "robot_chain",
        "stage_label": "Robot signal chain",
        "teaching_point": "Order the path from physical sensing through ADC, control, PWM, to the motor.",
    },
]

_E12_RESISTORS = [100, 150, 220, 330, 470, 680, 1000, 1500, 2200, 3300, 4700, 10000]


def _hw_parse_numeric(value):
    """Parse int/float or simple fractions like 5/8."""
    if value is None:
        return None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    s = str(value).strip().replace(",", "")
    if not s:
        return None
    parts = s.split("/")
    if len(parts) == 2:
        try:
            num, den = float(parts[0].strip()), float(parts[1].strip())
            if den == 0:
                return None
            return num / den
        except (TypeError, ValueError):
            return None
    try:
        return float(s)
    except (TypeError, ValueError):
        return None


def _hardware_effective_difficulty(difficulty, stage_index=None, mode=None):
    """Blend stored difficulty with track stage and per-mode bias (1–10 play scale)."""
    base = max(1, min(10, int(difficulty or 3)))
    stage = max(1, min(7, int(stage_index or 1)))
    bias = HARDWARE_MODE_BY_KEY.get(mode or "", {}).get("difficulty_bias", 0)
    blended = base * 0.55 + (stage - 1) * 0.65 + bias
    return max(1, min(10, round(blended)))


def _hardware_clamp_difficulty(difficulty):
    return max(1, min(20, int(difficulty or 1)))


def _hardware_stage_index(difficulty, stage=None):
    if stage is not None:
        return max(1, min(7, int(stage)))
    d = _hardware_clamp_difficulty(difficulty)
    # Spread stages 1–7 across practice difficulty 1–10 (DB cap) and up to 20.
    if d <= 10:
        return min(7, 1 + (d - 1) * 6 // 9)
    return min(7, (d - 1) // 3 + 1)


def _hardware_stage_meta(stage_index):
    return HARDWARE_STAGES[stage_index - 1]


def _hardware_envelope(stage_index, payload):
    meta = _hardware_stage_meta(stage_index)
    return {
        "track": "hardware",
        "stage": meta["stage"],
        "stage_label": meta["stage_label"],
        "teaching_point": meta["teaching_point"],
        **payload,
    }


def _hw_parallel_eq(r1, r2):
    return (r1 * r2) // (r1 + r2)


def _hw_series_eq(*resistors):
    return sum(resistors)


def _hw_numeric_options(answer, spread_pct=0.25, count=4):
    """Build plausible numeric distractors around the correct answer."""
    opts = {answer}
    deltas = [1, 2, 5, 10, 15, 20, 25, 50, 100]
    random.shuffle(deltas)
    for delta in deltas:
        for candidate in (answer + delta, answer - delta, answer * 2, max(1, answer // 2)):
            if candidate > 0 and candidate != answer:
                opts.add(candidate)
            if len(opts) >= count:
                break
        if len(opts) >= count:
            break
    while len(opts) < count:
        opts.add(max(1, answer + random.randint(-max(3, answer // 5), max(3, answer // 5))))
    options = sorted(opts)[:count]
    if answer not in options:
        options[-1] = answer
        options.sort()
    random.shuffle(options)
    return options


def _hw_generate_ohms_law(difficulty):
    d = _hardware_clamp_difficulty(difficulty)
    tier = (d - 1) % 3
    if tier == 0:
        r = random.choice(_E12_RESISTORS[:8])
        i_ma = random.choice([2, 5, 10, 15, 20, 25, 50])
        v = round(r * i_ma / 1000)
        if v < 1:
            v = random.randint(3, 12)
            i_ma = max(1, round(v * 1000 / r))
            v = round(r * i_ma / 1000)
        else:
            i_ma = max(1, round(v * 1000 / r))
            v = round(r * i_ma / 1000)
        unknown = random.choice(["V", "I", "R"])
        if unknown == "V":
            question = f"A {r} Ω resistor carries {i_ma} mA. What is the voltage (V)?"
            answer = v
        elif unknown == "I":
            question = f"{v} V is applied across {r} Ω. What is the current in milliamps?"
            answer = i_ma
        else:
            question = f"{v} V drives {i_ma} mA through an unknown resistor. Resistance (Ω)?"
            answer = round(v * 1000 / i_ma)
        return _hardware_envelope(1, {
            "format": "numeric",
            "question": question,
            "answer": answer,
            "unit": "V" if unknown == "V" else ("mA" if unknown == "I" else "Ω"),
            "options": _hw_numeric_options(answer),
        })
    if tier == 1:
        r1, r2 = random.sample(_E12_RESISTORS[:10], 2)
        topology = random.choice(["series", "parallel"])
        if topology == "series":
            answer = _hw_series_eq(r1, r2)
            question = f"Two resistors in series: {r1} Ω and {r2} Ω. Equivalent resistance (Ω)?"
        else:
            answer = _hw_parallel_eq(r1, r2)
            question = f"Two resistors in parallel: {r1} Ω and {r2} Ω. Equivalent resistance (Ω)?"
        return _hardware_envelope(1, {
            "format": "numeric",
            "question": question,
            "answer": answer,
            "unit": "Ω",
            "options": _hw_numeric_options(answer),
        })
    r1, r2, r3 = random.sample(_E12_RESISTORS[:10], 3)
    layout = random.choice(["series_all", "parallel_pair_series", "series_pair_parallel"])
    if layout == "series_all":
        answer = _hw_series_eq(r1, r2, r3)
        question = f"Three resistors in series: {r1} Ω, {r2} Ω, {r3} Ω. R_eq (Ω)?"
    elif layout == "parallel_pair_series":
        rp = _hw_parallel_eq(r1, r2)
        answer = _hw_series_eq(rp, r3)
        question = f"({r1} Ω ∥ {r2} Ω) in series with {r3} Ω. R_eq (Ω)?"
    else:
        rs = _hw_series_eq(r1, r2)
        answer = _hw_parallel_eq(rs, r3)
        question = f"({r1} Ω + {r2} Ω) in parallel with {r3} Ω. R_eq (Ω)?"
    return _hardware_envelope(1, {
        "format": "numeric",
        "question": question,
        "answer": answer,
        "unit": "Ω",
        "options": _hw_numeric_options(answer),
    })


def _hw_gate_table(gate, a, b=None):
    if gate == "NOT":
        return int(not a)
    if gate == "AND":
        return int(a and b)
    if gate == "OR":
        return int(a or b)
    if gate == "NAND":
        return int(not (a and b))
    raise ValueError(f"unknown gate: {gate}")


def _hw_generate_digital(difficulty):
    d = _hardware_clamp_difficulty(difficulty)
    gate = random.choice(["AND", "OR", "NOT", "NAND"])
    if gate == "NOT":
        a = random.randint(0, 1)
        out = _hw_gate_table(gate, a)
        question = f"NOT gate: input = {a}. Output?"
        options = ["0", "1"]
        answer = str(out)
    else:
        rows = [(0, 0), (0, 1), (1, 0), (1, 1)]
        table_lines = [f"A={a}, B={b} → {_hw_gate_table(gate, a, b)}" for a, b in rows]
        missing_idx = random.randint(0, 3)
        ma, mb = rows[missing_idx]
        answer = str(_hw_gate_table(gate, ma, mb))
        shown = list(table_lines)
        shown[missing_idx] = f"A={ma}, B={mb} → ?"
        question = f"Complete the {gate} gate truth table. Missing output?"
        clues = shown
        options = ["0", "1"]
        return _hardware_envelope(2, {
            "format": "multiple_choice",
            "clues": clues,
            "question": question,
            "options": options,
            "answer": answer,
        })
    if d >= 6 and random.random() < 0.45:
        expr_sets = [
            ("A AND B", "A · B", "A ∧ B"),
            ("A OR B", "A + B", "A ∨ B"),
            ("NOT (A AND B)", "NAND(A,B)", "¬(A ∧ B)"),
            ("NOT (A OR B)", "NOR(A,B)", "¬(A ∨ B)"),
        ]
        canonical, correct, decoy_a = random.choice(expr_sets)
        distractors = [x for x in expr_sets if x[1] != correct]
        wrong = random.choice(distractors)[1]
        options = [correct, wrong, decoy_a, random.choice([d[1] for d in distractors if d[1] != correct and d[1] != wrong])]
        random.shuffle(options)
        return _hardware_envelope(2, {
            "format": "multiple_choice",
            "question": f"Which expression matches {canonical}?",
            "options": options,
            "answer": correct,
        })
    return _hardware_envelope(2, {
        "format": "multiple_choice",
        "question": question,
        "options": options,
        "answer": answer,
    })


def _hw_generate_rc(difficulty):
    d = _hardware_clamp_difficulty(difficulty)
    r_k = random.choice([1, 2, 2.2, 4.7, 10, 22, 47, 100])
    c_uf = random.choice([1, 2.2, 4.7, 10, 22, 47, 100, 220, 470])
    tau_ms = round(r_k * 1000 * c_uf / 1000, 1)
    if d >= 8 and random.random() < 0.4:
        faster = random.choice([
            ("halve R", "τ halves"),
            ("double C", "τ doubles"),
            ("halve C", "τ halves"),
            ("double R", "τ doubles"),
        ])
        action, effect = faster
        question = f"τ = {tau_ms} ms for R={r_k} kΩ, C={c_uf} µF. After you {action}, what happens to τ?"
        options = ["τ halves", "τ doubles", "τ unchanged", "τ quadruples"]
        answer = effect
        return _hardware_envelope(3, {
            "format": "multiple_choice",
            "question": question,
            "options": options,
            "answer": answer,
        })
    if random.random() < 0.55:
        question = f"R = {r_k} kΩ, C = {c_uf} µF. Time constant τ in milliseconds?"
        answer = tau_ms
        opts = sorted({tau_ms, round(tau_ms / 2, 1), round(tau_ms * 2, 1), round(tau_ms * 4, 1)})
        random.shuffle(opts)
        return _hardware_envelope(3, {
            "format": "numeric",
            "question": question,
            "answer": answer,
            "unit": "ms",
            "options": [str(o) for o in opts],
            "tolerance": 0.02,
        })
    pct = random.choice([37, 50, 63, 86])
    question = f"RC circuit with τ = {tau_ms} ms. About how many τ to reach ~{pct}% of final voltage?"
    lookup = {37: "1τ", 50: "1τ", 63: "1τ", 86: "2τ"}
    answer = lookup[pct]
    options = ["½τ", "1τ", "2τ", "5τ"]
    return _hardware_envelope(3, {
        "format": "multiple_choice",
        "question": question,
        "options": options,
        "answer": answer,
    })


def _hw_generate_opamp(difficulty):
    d = _hardware_clamp_difficulty(difficulty)
    rf = random.choice([10, 22, 33, 47, 100, 220, 470])
    rin = random.choice([1, 2.2, 4.7, 10, 22, 47])
    topology = random.choice(["inverting", "non_inverting"])
    if topology == "inverting":
        gain_mag = rf / rin
        gain = -round(gain_mag, 2)
        question = f"Ideal inverting op-amp: Rf = {rf} kΩ, Rin = {rin} kΩ. Voltage gain?"
        answer = f"{gain:.1f}"
        options = [f"-{gain_mag:.1f}", f"{gain_mag:.1f}", f"-{rin/rf:.2f}", f"{rin/rf:.2f}"]
    else:
        gain = round(1 + rf / rin, 2)
        question = f"Ideal non-inverting op-amp: Rf = {rf} kΩ to ground, Rg = {rin} kΩ from − to ground. Gain?"
        answer = f"{gain:.1f}"
        options = [answer, f"{rf/rin:.1f}", "1", f"-{gain:.1f}"]
    random.shuffle(options)
    if d >= 11 and random.random() < 0.35:
        vin = random.choice([0.1, 0.25, 0.5, 1.0, 2.0])
        vout = round(abs(float(answer)) * vin, 2)
        question = f"Non-inverting gain = {answer}, Vin = {vin} V. |Vout| (V)?"
        return _hardware_envelope(4, {
            "format": "numeric",
            "question": question,
            "answer": vout,
            "unit": "V",
            "tolerance": 0.05,
        })
    return _hardware_envelope(4, {
        "format": "multiple_choice",
        "question": question,
        "options": options,
        "answer": answer,
    })


def _hw_generate_sensors(difficulty):
    d = _hardware_clamp_difficulty(difficulty)
    sensor_bank = [
        ("Thermistor", "Resistance varies with temperature"),
        ("Hall-effect sensor", "Voltage proportional to magnetic field"),
        ("Photodiode", "Current proportional to light intensity"),
        ("Accelerometer (MEMS)", "Capacitance change from deflection"),
        ("Ultrasonic ranger", "Pulse echo time-of-flight"),
        ("Encoder", "Quadrature digital pulses per revolution"),
    ]
    if d < 14 or random.random() < 0.55:
        sensor, signal = random.choice(sensor_bank)
        distractors = [s for s, _ in sensor_bank if s != sensor]
        wrong_signals = [sig for _, sig in sensor_bank if sig != signal]
        options = [signal] + random.sample(wrong_signals, min(3, len(wrong_signals)))
        random.shuffle(options)
        return _hardware_envelope(5, {
            "format": "multiple_choice",
            "question": f"What signal does a {sensor} primarily produce?",
            "options": options,
            "answer": signal,
        })
    motor_qs = [
        {
            "question": "You need bidirectional speed control of a DC gearmotor from a microcontroller. Best approach?",
            "answer": "H-bridge driven by PWM",
            "options": [
                "H-bridge driven by PWM",
                "Single GPIO high/low only",
                "Directly wire motor to 5 V rail",
                "Use a pull-up resistor on the motor lead",
            ],
        },
        {
            "question": "PWM on a motor driver mainly controls what?",
            "answer": "Average voltage (effective speed)",
            "options": [
                "Average voltage (effective speed)",
                "Motor winding inductance",
                "Encoder resolution",
                "Supply polarity reversal",
            ],
        },
        {
            "question": "A stepper motor without an encoder needs what to track position?",
            "answer": "Count commanded steps (open-loop)",
            "options": [
                "Count commanded steps (open-loop)",
                "Measure back-EMF only",
                "Read a thermistor on the shaft",
                "Disable interrupts on all pins",
            ],
        },
    ]
    pick = random.choice(motor_qs)
    return _hardware_envelope(5, {
        "format": "multiple_choice",
        "question": pick["question"],
        "options": pick["options"],
        "answer": pick["answer"],
    })


def _hw_generate_mcu_io(difficulty):
    d = _hardware_clamp_difficulty(difficulty)
    scenarios = [
        {
            "question": "A mechanical button on GPIO with no external resistor — safest pin mode?",
            "answer": "INPUT_PULLUP",
            "options": ["INPUT_PULLUP", "OUTPUT", "INPUT (floating)", "ANALOG"],
        },
        {
            "question": "Reading a switch that bounces for milliseconds — robust pattern?",
            "answer": "Debounce in software or hardware",
            "options": [
                "Debounce in software or hardware",
                "Sample once at boot only",
                "Set pin to OUTPUT low",
                "Disable the ADC",
            ],
        },
        {
            "question": "A wheel encoder pulses faster than your loop can poll reliably. Prefer?",
            "answer": "GPIO interrupt on edge",
            "options": [
                "GPIO interrupt on edge",
                "Busy-wait in main loop",
                "Analog read every second",
                "SPI transfer of a constant",
            ],
        },
        {
            "question": "Driving an LED directly from a 3.3 V GPIO — you typically need?",
            "answer": "Current-limiting resistor in series",
            "options": [
                "Current-limiting resistor in series",
                "Pull-down on the LED cathode only",
                "Leave pin floating when off",
                "Connect LED across VCC and GND",
            ],
        },
    ]
    if d >= 17:
        scenarios.append({
            "question": "UART RX line idle-high with no external parts — enable?",
            "answer": "Internal pull-up on RX (or explicit external pull-up)",
            "options": [
                "Internal pull-up on RX (or explicit external pull-up)",
                "Pin mode OUTPUT HIGH on RX",
                "Analog reference on RX",
                "Disable serial clock",
            ],
        })
    pick = random.choice(scenarios)
    return _hardware_envelope(6, {
        "format": "multiple_choice",
        "question": pick["question"],
        "options": pick["options"],
        "answer": pick["answer"],
    })


def _hw_generate_robot_chain(difficulty):
    d = _hardware_clamp_difficulty(difficulty)
    canonical = ["Sensor", "ADC", "Control algorithm", "PWM driver", "Motor"]
    shuffled = canonical[:]
    random.shuffle(shuffled)
    if d >= 7:
        question = "Order the robot drive signal chain from physical world to motion."
        return _hardware_envelope(7, {
            "format": "ordering",
            "question": question,
            "items": shuffled,
            "answer": canonical,
        })
    # Multiple choice: pick correct sequence among permutations
    wrong_orders = []
    for _ in range(20):
        alt = canonical[:]
        random.shuffle(alt)
        if alt != canonical and alt not in wrong_orders:
            wrong_orders.append(alt)
        if len(wrong_orders) >= 3:
            break
    def _fmt(order):
        return " → ".join(order)
    options = [_fmt(canonical)] + [_fmt(o) for o in wrong_orders[:3]]
    random.shuffle(options)
    return _hardware_envelope(7, {
        "format": "multiple_choice",
        "question": "Which pipeline orders sensing through actuation correctly?",
        "options": options,
        "answer": _fmt(canonical),
    })


def _hw_generate_divider_drop(difficulty):
    """Voltage divider — answers may be entered as fractions (e.g. 5/8)."""
    d = _hardware_clamp_difficulty(difficulty)
    r_top = random.choice([1, 2, 2.2, 3, 3.3, 4.7, 5, 6.8, 10])
    r_bot = random.choice([1, 2, 2.2, 3, 3.3, 4.7, 5, 6.8, 10])
    while r_bot == r_top:
        r_bot = random.choice([1, 2, 2.2, 3, 3.3, 4.7, 5, 6.8, 10])
    v_in = random.choice([3.3, 5, 9, 12, 24])
    ratio = r_bot / (r_top + r_bot)
    v_out = round(v_in * ratio, 2)
    question = (
        f"Divider: {r_top} kΩ on top, {r_bot} kΩ to ground, {v_in} V in. "
        f"V_out (V) or junction fraction of V_in?"
    )
    if d >= 8 and random.random() < 0.45:
        from fractions import Fraction
        frac = Fraction(r_bot).limit_denominator(16) / Fraction(r_top + r_bot).limit_denominator(16)
        question = (
            f"Divider {r_top} kΩ / {r_bot} kΩ. What fraction of V_in appears at the junction?"
        )
        answer = f"{frac.numerator}/{frac.denominator}"
        return _hardware_envelope(1, {
            "format": "numeric",
            "question": question,
            "answer": float(frac),
            "answer_display": answer,
            "unit": "of V_in",
            "accept_fraction": True,
            "options": _hw_numeric_options(round(float(frac) * 100, 1)),
        })
    return _hardware_envelope(1, {
        "format": "numeric",
        "question": question,
        "answer": v_out,
        "unit": "V",
        "accept_fraction": True,
        "tolerance": 0.04,
    })


def _hw_generate_bench_brief(difficulty):
    """Curated practical coach cards — no API, reflection-friendly."""
    cards = [
        {
            "question": "Before probing a powered board, what is the safest first check?",
            "options": [
                "Confirm ground reference and probe rating",
                "Maximize scope time/div for aesthetics",
                "Disable all decoupling caps",
                "Probe with both leads floating",
            ],
            "answer": "Confirm ground reference and probe rating",
            "tip": "Clip ground first, keep fingers clear, and know your probe's voltage rating.",
        },
        {
            "question": "A GPIO reads random values on a floating button input. Fix?",
            "options": ["Enable internal pull-up or pull-down", "Switch pin to OUTPUT HIGH", "Remove the button", "Increase clock speed"],
            "answer": "Enable internal pull-up or pull-down",
            "tip": "Floating inputs pick up noise — always bias them.",
        },
        {
            "question": "Motor draws huge inrush current at boot. Practical mitigation?",
            "options": ["Soft-start PWM ramp", "Hard-wire motor to 12 V", "Disable flyback diode", "Use only open-loop forever"],
            "answer": "Soft-start PWM ramp",
            "tip": "Ramp duty cycle; verify driver current limit and bulk capacitance.",
        },
        {
            "question": "UART garbage on first bytes after reset — likely cause?",
            "options": ["Baud mismatch or floating RX", "Too many pull-ups on TX", "ADC reference too high", "I²C clock stretching"],
            "answer": "Baud mismatch or floating RX",
            "tip": "Match baud, idle-high RX, and wait for clock/PLL stability before talking.",
        },
    ]
    pick = random.choice(cards)
    return _hardware_envelope(6, {
        "format": "multiple_choice",
        "mode": "bench_brief",
        "kind": "talk",
        "question": pick["question"],
        "options": pick["options"],
        "answer": pick["answer"],
        "teaching_point": pick["tip"],
    })


_HARDWARE_GENERATORS = {
    "ohms_law": _hw_generate_ohms_law,
    "digital": _hw_generate_digital,
    "rc": _hw_generate_rc,
    "opamp": _hw_generate_opamp,
    "sensors": _hw_generate_sensors,
    "mcu_io": _hw_generate_mcu_io,
    "robot_chain": _hw_generate_robot_chain,
    "divider_drop": _hw_generate_divider_drop,
    "bench_brief": _hw_generate_bench_brief,
}

_HARDWARE_MODE_GENERATORS = {
    "ohm_sprint": "ohms_law",
    "resistor_web": "ohms_law",
    "gate_lab": "digital",
    "rc_pulse": "rc",
    "opamp_math": "opamp",
    "sensor_scout": "sensors",
    "pin_modes": "mcu_io",
    "robot_route": "robot_chain",
    "divider_drop": "divider_drop",
    "bench_brief": "bench_brief",
}


def generate_hardware_round(difficulty, stage=None, mode=None):
    """Progressive hardware curriculum — difficulty 1–20 across seven stages."""
    mode_meta = HARDWARE_MODE_BY_KEY.get(mode or "")
    if mode_meta:
        stage_key = mode_meta["stage_key"]
        stage_index = next((i + 1 for i, s in enumerate(HARDWARE_STAGES) if s["key"] == stage_key), 1)
        gen_key = _HARDWARE_MODE_GENERATORS.get(mode, stage_key)
        d = _hardware_effective_difficulty(difficulty, stage_index, mode)
        d_full = _hardware_clamp_difficulty(max(d, stage_index * 2))
        payload = _HARDWARE_GENERATORS[gen_key](d_full)
        payload["mode"] = mode
        payload["mode_label"] = mode_meta["label"]
        payload["mode_kind"] = mode_meta["kind"]
        payload["mode_info"] = mode_meta["info"]
        payload["questions_per_round"] = 3
        return payload
    d = _hardware_clamp_difficulty(difficulty)
    stage_index = _hardware_stage_index(d, stage)
    meta = _hardware_stage_meta(stage_index)
    generator = _HARDWARE_GENERATORS[meta["key"]]
    return generator(d)


def grade_hardware_round(round_data, submitted):
    """Grade a single hardware problem submission (numeric, MC, or ordering)."""
    answer = round_data.get("answer")
    fmt = round_data.get("format", "multiple_choice")
    tolerance = round_data.get("tolerance", 0)

    if fmt == "ordering":
        submitted_list = submitted if isinstance(submitted, list) else (submitted or [])
        correct = list(submitted_list) == list(answer)
        return {"score": 1 if correct else 0, "max_score": 1, "details": {"correct_answer": answer}}

    if fmt == "numeric":
        expected = answer
        got = _hw_parse_numeric(submitted)
        exp = _hw_parse_numeric(expected)
        if got is None or exp is None:
            return {"score": 0, "max_score": 1, "details": {"correct_answer": expected}}
        if tolerance:
            denom = max(abs(exp), 1e-9)
            correct = abs(got - exp) / denom <= tolerance
        else:
            correct = abs(got - exp) <= max(0.5, abs(exp) * 0.02)
        return {"score": 1 if correct else 0, "max_score": 1, "details": {"correct_answer": expected}}

    submitted_norm = (str(submitted) if submitted is not None else "").strip()
    answer_norm = (str(answer) if answer is not None else "").strip()
    correct = submitted_norm.lower() == answer_norm.lower()
    return {"score": 1 if correct else 0, "max_score": 1, "details": {"correct_answer": answer}}


# --- AI Trainer model catalog (neural_net_fix) ---------------------------------
# Ordered list of ~14 model families; prior = softmax base weight (higher = more likely
# when the user has no history). Per-model adaptive difficulty uses composite keys
# "neural_net_fix::<model_key>" in practice_difficulty.

AI_MODEL_CATALOG = [
    {
        "key": "mlp",
        "name": "MLP / Feedforward",
        "desc": "The plain feedforward network — layers of neurons, the foundation everything else builds on.",
        "prior": 1.2,
    },
    {
        "key": "cnn",
        "name": "CNN",
        "desc": "Convolutional networks for spatial data — kernels, feature maps, and local receptive fields.",
        "prior": 1.2,
    },
    {
        "key": "rnn",
        "name": "RNN",
        "desc": "Recurrent networks that carry hidden state across time steps for sequential data.",
        "prior": 0.9,
    },
    {
        "key": "lstm_gru",
        "name": "LSTM / GRU",
        "desc": "Gated recurrent units that learn what to remember and forget over long sequences.",
        "prior": 0.95,
    },
    {
        "key": "transformer",
        "name": "Transformer",
        "desc": "Attention-based sequence models powering modern LLMs — self-attention over token sequences.",
        "prior": 1.4,
    },
    {
        "key": "attention",
        "name": "Attention Mechanism",
        "desc": "The mechanism itself: query-key-value projections, multi-head attention, and masking.",
        "prior": 0.85,
    },
    {
        "key": "gan",
        "name": "GAN",
        "desc": "Generative adversarial training — generator vs discriminator in a minimax game.",
        "prior": 0.8,
    },
    {
        "key": "vae",
        "name": "VAE",
        "desc": "Variational autoencoders — latent-variable generative models with a KL regularizer.",
        "prior": 0.75,
    },
    {
        "key": "diffusion",
        "name": "Diffusion Model",
        "desc": "Denoising diffusion — learn to reverse a noise schedule step by step.",
        "prior": 0.85,
    },
    {
        "key": "autoencoder",
        "name": "Autoencoder",
        "desc": "Encoder-decoder bottleneck networks for compression, denoising, and representation learning.",
        "prior": 0.7,
    },
    {
        "key": "gnn",
        "name": "GNN",
        "desc": "Graph neural networks — message passing over nodes and edges in irregular structures.",
        "prior": 0.75,
    },
    {
        "key": "rl_value",
        "name": "RL Value Learning",
        "desc": "DQN-style value learning — Q-functions, bootstrapping, and temporal-difference targets.",
        "prior": 0.8,
    },
    {
        "key": "rl_policy",
        "name": "RL Policy Gradients",
        "desc": "Policy-gradient methods — REINFORCE, PPO, and direct optimization of action probabilities.",
        "prior": 0.8,
    },
    {
        "key": "embeddings_contrastive",
        "name": "Contrastive Embeddings",
        "desc": "CLIP/SimCLR-style representation learning — pull positives together, push negatives apart.",
        "prior": 0.75,
    },
]

AI_MODEL_BY_KEY = {m["key"]: m for m in AI_MODEL_CATALOG}

_SOFTMAX_TEMPERATURE = 0.7
_WEAKNESS_BOOST = 1.5
_UNSEEN_AVG_RATIO = 0.55


def _softmax(weights, temperature=_SOFTMAX_TEMPERATURE):
    """p_i = exp(w_i / T) / sum_j exp(w_j / T)"""
    import math

    scaled = [w / temperature for w in weights]
    max_w = max(scaled)
    exp_vals = [math.exp(w - max_w) for w in scaled]
    total = sum(exp_vals)
    return [e / total for e in exp_vals]


def composite_difficulty_key(model_key):
    return f"neural_net_fix::{model_key}"


def model_selection_weights():
    """Compute per-model weights and softmax probabilities for the catalog."""
    import db

    stats = db.practice_review_model_stats("neural_net_fix")
    keys = [m["key"] for m in AI_MODEL_CATALOG]
    weights = []
    for m in AI_MODEL_CATALOG:
        prior = m["prior"]
        avg_ratio = stats.get(m["key"], {}).get("avg_ratio", _UNSEEN_AVG_RATIO)
        weights.append(prior + _WEAKNESS_BOOST * (1.0 - avg_ratio))
    probs = _softmax(weights)
    return {
        "keys": keys,
        "weights": weights,
        "probabilities": probs,
        "formula": (
            f"w_i = prior_i + {_WEAKNESS_BOOST}*(1 - avg_score_ratio_i); "
            f"p_i = exp(w_i / {_SOFTMAX_TEMPERATURE}) / sum_j exp(w_j / {_SOFTMAX_TEMPERATURE})"
        ),
    }


def pick_ai_model(model_key=None):
    """Select a model for neural_net_fix. Requested key wins; otherwise softmax sample."""
    import db

    if model_key:
        entry = AI_MODEL_BY_KEY.get(model_key)
        if not entry:
            raise ValueError(f"unknown model_key: {model_key}")
        sel = model_selection_weights()
        idx = sel["keys"].index(model_key)
        return {
            "model_key": entry["key"],
            "model_name": entry["name"],
            "model_desc": entry["desc"],
            "chosen_by": "requested",
            "probabilities": {k: round(p, 4) for k, p in zip(sel["keys"], sel["probabilities"])},
            "selection_formula": sel["formula"],
            "difficulty": db.get_practice_difficulty(composite_difficulty_key(model_key)),
        }

    sel = model_selection_weights()
    chosen = random.choices(sel["keys"], weights=sel["probabilities"], k=1)[0]
    entry = AI_MODEL_BY_KEY[chosen]
    return {
        "model_key": entry["key"],
        "model_name": entry["name"],
        "model_desc": entry["desc"],
        "chosen_by": "softmax",
        "probabilities": {k: round(p, 4) for k, p in zip(sel["keys"], sel["probabilities"])},
        "selection_formula": sel["formula"],
        "difficulty": db.get_practice_difficulty(composite_difficulty_key(chosen)),
    }


def weakness_context(model_key):
    """Short bullet string of previously-missed concepts for adaptive challenge generation."""
    import db
    import embeddings

    reviews = db.list_practice_reviews(
        game_key="neural_net_fix", model_key=model_key, limit=20,
    )
    low = [
        r for r in reviews
        if r.get("max_score") and (r["score"] / r["max_score"]) < 0.6
    ]
    if len(low) < 2:
        overall = db.list_practice_reviews(game_key="neural_net_fix", limit=30)
        low = [
            r for r in overall
            if r.get("max_score") and (r["score"] / r["max_score"]) < 0.6
            and (not model_key or r.get("model_key") == model_key)
        ]
    if not low:
        return ""

    model_desc = AI_MODEL_BY_KEY.get(model_key, {}).get("desc", "")
    feedbacks = [(r.get("feedback") or "").strip() for r in low[:8] if (r.get("feedback") or "").strip()]
    if not feedbacks:
        return ""

    picked = feedbacks[:4]
    if model_desc and len(feedbacks) > 1:
        try:
            sims = embeddings.similarity(model_desc, feedbacks)
            ranked = sorted(zip(sims, feedbacks), reverse=True)
            picked = [fb for _, fb in ranked[:4]]
        except Exception:
            picked = feedbacks[:4]

    bullets = []
    for fb in picked:
        line = fb.split("\n")[0].strip()
        if len(line) > 160:
            line = line[:157] + "..."
        if line:
            bullets.append(f"• {line}")
    if not bullets:
        return ""
    return "Previously missed:\n" + "\n".join(bullets)


def ai_models_catalog_response():
    """Full catalog with per-model difficulty, stats, and current softmax probabilities."""
    import db

    stats = db.practice_review_model_stats("neural_net_fix")
    sel = model_selection_weights()
    prob_map = dict(zip(sel["keys"], sel["probabilities"]))
    out = []
    for m in AI_MODEL_CATALOG:
        ms = stats.get(m["key"], {})
        out.append({
            "key": m["key"],
            "name": m["name"],
            "desc": m["desc"],
            "difficulty": db.get_practice_difficulty(composite_difficulty_key(m["key"])),
            "attempts": ms.get("attempts", 0),
            "avg_score": ms.get("avg_score"),
            "probability": round(prob_map.get(m["key"], 0.0), 4),
        })
    return out


GAMES = {
    # mode "local": generated + graded in plain Python, zero API cost.
    # mode "ai": challenge generated and graded by a model (OpenAI-first for cost -- see
    # ai.PRACTICE_AI_GAMES), free-text answer, scored 0-10.
    # icon/desc: consumed by api_list_practice_games once app.py serializes them.
    "memory": {
        "label": "Memory: word recall",
        "category": "Cognitive drills",
        "mode": "local",
        "icon": "🧠",
        "desc": "Memorize vocabulary words, then recall them from a mixed list.",
    },
    "working_memory": {
        "label": "Working memory: reversed digits",
        "category": "Cognitive drills",
        "mode": "local",
        "icon": "🔢",
        "desc": "Hold a digit string in mind and type it backwards.",
    },
    "math": {
        "label": "Quick mental math",
        "category": "Cognitive drills",
        "mode": "local",
        "icon": "➗",
        "desc": "Speed arithmetic from single-digit sums to engineering mental math.",
    },
    "logic": {
        "label": "Logic puzzles",
        "category": "Cognitive drills",
        "mode": "local",
        "icon": "🧩",
        "desc": "Grids, ordering, truth-tellers, syllogisms, and odd-one-out deductions.",
    },
    "spelling": {
        "label": "Spelling challenge",
        "category": "Comprehension & language",
        "mode": "local",
        "icon": "✏️",
        "desc": "Pick the correctly spelled word from clever misspellings.",
    },
    "time_estimation": {
        "label": "Time estimation",
        "category": "Cognitive drills",
        "mode": "local",
        "icon": "⏱️",
        "desc": "Count seconds in your head without watching a clock.",
    },
    "comprehension": {
        "label": "Reading comprehension",
        "category": "Comprehension & language",
        "mode": "ai",
        "icon": "📖",
        "desc": "Read a passage and answer questions about it.",
    },
    "summarizing": {
        "label": "Summarize it cleanly",
        "category": "Comprehension & language",
        "mode": "ai",
        "icon": "📝",
        "desc": "Distill a block of text into a tight summary.",
    },
    "precise_word": {
        "label": "The most precise word",
        "category": "Comprehension & language",
        "mode": "ai",
        "icon": "🎯",
        "desc": "Choose the word that best fits a nuanced context.",
    },
    "code_exercise": {
        "label": "Code exercise (Python/C++/asm)",
        "category": "Technical & creative",
        "mode": "ai",
        "icon": "💻",
        "desc": "Solve a short coding problem in your language of choice.",
    },
    "pitch": {
        "label": "Pitch practice",
        "category": "Technical & creative",
        "mode": "ai",
        "icon": "🎤",
        "desc": "Pitch an idea clearly under time pressure.",
    },
    "video_understanding": {
        "label": "Learn a topic, get quizzed",
        "category": "Comprehension & language",
        "mode": "ai",
        "icon": "🎬",
        "desc": "Study a topic summary, then answer quiz questions.",
    },
    "neural_net_fix": {
        "label": "Fix the broken neural net",
        "category": "Simulation & strategy",
        "mode": "ai",
        "icon": "🧬",
        "desc": "Debug and repair a broken neural-network diagram.",
    },
    "startup_sim": {
        "label": "Entrepreneurship fast-sim",
        "category": "Simulation & strategy",
        "mode": "ai",
        "icon": "🚀",
        "desc": "Make startup decisions and see outcomes unfold.",
    },
    "longterm": {
        "label": "Long-term memory: recall tomorrow",
        "category": "Cognitive drills",
        "mode": "longterm",
        "icon": "📅",
        "desc": "Learn a fact today, recall it tomorrow.",
    },
    "hardware": {
        "label": "Hardware skill track",
        "category": "Technical & creative",
        "mode": "local",
        "icon": "🔧",
        "desc": "Pick a mode — Ohm's law to robot chains. Three focused questions per run.",
        "track": "hardware",
        "stages": HARDWARE_STAGES,
        "modes": HARDWARE_MODES,
    },
}
