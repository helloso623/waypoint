"""Curated Blueprint quests and deterministic graph graders.

Quest grading is intentionally local: accepted node types are allow-listed, then the
same typed data-flow shape used by Blueprint Preview is evaluated against fixtures.
"""

from __future__ import annotations

from copy import deepcopy


_CALCULATOR_STARTER = {
    "nodes": [
        {"id": "start", "type": "start", "x": 40, "y": 80, "params": {}},
        {"id": "gate", "type": "exec_gate", "x": 300, "y": 80, "params": {"open": "true"}},
        {
            "id": "input_a",
            "type": "literal_number",
            "x": 250,
            "y": 300,
            "params": {"value": "0"},
            "meta": {"questInput": "a", "questLabel": "Input A"},
        },
        {
            "id": "input_b",
            "type": "literal_number",
            "x": 250,
            "y": 440,
            "params": {"value": "0"},
            "meta": {"questInput": "b", "questLabel": "Input B"},
        },
        {"id": "operator", "type": "add", "x": 590, "y": 340, "params": {}},
        {
            "id": "answer",
            "type": "print_value",
            "x": 900,
            "y": 120,
            "params": {},
            "meta": {"questOutput": True, "questLabel": "Calculator output"},
        },
    ],
    "edges": [],
    "variables": [],
    "functions": [],
    "comments": [],
    "notes": [],
    "ui": {"widgets": [], "device": "phone"},
    "meta": {"zoom": 0.85, "panX": 20, "panY": 20, "questId": "calculator"},
}

_CIRCUIT_STARTER = {
    "nodes": [
        {
            "id": "switch_a",
            "type": "circuit_input",
            "x": 80,
            "y": 180,
            "params": {"value": "false"},
            "meta": {"questInput": "a", "partId": "logic_input", "questLabel": "Input A"},
        },
        {
            "id": "switch_b",
            "type": "circuit_input",
            "x": 80,
            "y": 400,
            "params": {"value": "false"},
            "meta": {"questInput": "b", "partId": "logic_input", "questLabel": "Input B"},
        },
        {
            "id": "and_gate",
            "type": "circuit_and",
            "x": 430,
            "y": 270,
            "params": {},
            "meta": {"partId": "74hc08"},
        },
        {
            "id": "resistor",
            "type": "circuit_resistor",
            "x": 740,
            "y": 270,
            "params": {"resistance_ohms": "330"},
            "meta": {"partId": "resistor_330"},
        },
        {
            "id": "led",
            "type": "circuit_led",
            "x": 1040,
            "y": 270,
            "params": {"color": "red"},
            "meta": {"partId": "red_led", "questOutput": True},
        },
    ],
    "edges": [],
    "variables": [],
    "functions": [],
    "comments": [],
    "notes": [],
    "ui": {"widgets": [], "device": "phone"},
    "meta": {"zoom": 0.85, "panX": 20, "panY": 30, "questId": "and_led_circuit"},
}

_CIRCUIT_PARTS = {
    "logic_input": {
        "name": "Logic input switch",
        "summary": "A simulated 0 V / 5 V digital source.",
        "specs": ["LOW = 0 V", "HIGH = 5 V", "Output is Boolean in the quest simulator"],
        "source": "Curated Blueprint lab source",
    },
    "74hc08": {
        "name": "74HC08 quad 2-input AND gate",
        "summary": "One AND gate from a common CMOS logic IC.",
        "specs": [
            "Recommended VCC: 2 V to 6 V",
            "At 4.5 V: HIGH input threshold is about 3.15 V minimum",
            "Output is HIGH only when both inputs are HIGH",
        ],
        "source": "Curated summary of common 74HC08 datasheets",
    },
    "resistor_330": {
        "name": "330 Ω resistor",
        "summary": "Series current-limiting resistor for the LED.",
        "specs": ["Resistance: 330 Ω", "Tolerance: ±5%", "Power rating: 0.25 W"],
        "source": "Curated generic through-hole resistor specification",
    },
    "red_led": {
        "name": "5 mm red LED",
        "summary": "Visible indicator; place the resistor in series before it.",
        "specs": [
            "Typical forward voltage: 2.0 V at 10 mA",
            "Typical continuous-current ceiling: 20 mA",
            "Blueprint signal input models the anode drive",
        ],
        "source": "Curated generic red LED specification",
    },
}

_CALCULATOR_FIXTURES = [
    {"inputs": {"a": 2, "b": 3}, "expected": 5},
    {"inputs": {"a": -4, "b": 10}, "expected": 6},
    {"inputs": {"a": 1.5, "b": 2.25}, "expected": 3.75},
]

_CIRCUIT_FIXTURES = [
    {"inputs": {"a": False, "b": False}, "expected": False},
    {"inputs": {"a": False, "b": True}, "expected": False},
    {"inputs": {"a": True, "b": False}, "expected": False},
    {"inputs": {"a": True, "b": True}, "expected": True},
]

QUESTS = {
    "calculator": {
        "id": "calculator",
        "kind": "blueprint",
        "title": "Wire a two-input calculator",
        "description": (
            "Wire Input A and Input B into Add, send Add's result to Calculator output, "
            "and connect Start → Execution Gate → Calculator output."
        ),
        "allowedNodeTypes": [
            "start",
            "exec_gate",
            "literal_number",
            "add",
            "subtract",
            "multiply",
            "divide",
            "print_value",
        ],
        "acceptanceTests": deepcopy(_CALCULATOR_FIXTURES),
        "starterGraph": _CALCULATOR_STARTER,
        "hints": [
            "White diamond pins carry execution; colored round pins carry values.",
            "Use the gate's Pass output.",
            "The grader replaces the two labeled inputs with each test fixture.",
        ],
        "parts": {},
    },
    "and_led_circuit": {
        "id": "and_led_circuit",
        "kind": "circuit",
        "title": "AND gate indicator circuit",
        "description": (
            "Make the LED light only when both inputs are HIGH. Use the known 74HC08 "
            "gate and put the 330 Ω resistor in series before the LED."
        ),
        "allowedNodeTypes": [
            "circuit_input",
            "circuit_and",
            "circuit_resistor",
            "circuit_led",
        ],
        "acceptanceTests": deepcopy(_CIRCUIT_FIXTURES),
        "starterGraph": _CIRCUIT_STARTER,
        "hints": [
            "Wire both switches to the two 74HC08 inputs.",
            "The safe signal path is AND → 330 Ω resistor → LED.",
            "Click any part on the graph or in Known parts to inspect its local datasheet.",
        ],
        "parts": _CIRCUIT_PARTS,
    },
}


class QuestGraphError(ValueError):
    """A graph cannot be simulated for a fixture."""


def list_quests():
    """Return a mutation-safe, JSON-ready quest registry."""
    return deepcopy(list(QUESTS.values()))


def get_quest(quest_id):
    quest = QUESTS.get(quest_id)
    return deepcopy(quest) if quest else None


def _nodes_by_id(graph):
    nodes = {}
    for node in graph.get("nodes") or []:
        if isinstance(node, dict) and node.get("id"):
            nodes[node["id"]] = node
    return nodes


def _data_source(graph, node_id, port):
    matches = [
        edge
        for edge in graph.get("edges") or []
        if edge.get("kind") == "data"
        and edge.get("to") == node_id
        and edge.get("toPort") == port
    ]
    if not matches:
        raise QuestGraphError(f"{node_id}.{port} is not wired")
    if len(matches) > 1:
        raise QuestGraphError(f"{node_id}.{port} has multiple incoming wires")
    return matches[0].get("from")


def _as_number(raw):
    try:
        return float(raw)
    except (TypeError, ValueError) as exc:
        raise QuestGraphError(f"{raw!r} is not a number") from exc


def _as_bool(raw):
    if isinstance(raw, bool):
        return raw
    if isinstance(raw, (int, float)):
        return bool(raw)
    return str(raw).strip().lower() in {"1", "true", "yes", "on", "high"}


def _resistance_is_safe(node):
    try:
        value = _as_number((node.get("params") or {}).get("resistance_ohms", 0))
    except QuestGraphError:
        return False
    return 220 <= value <= 1000


def _eval_signal(graph, node_id, fixture, stack=None):
    nodes = _nodes_by_id(graph)
    node = nodes.get(node_id)
    if not node:
        raise QuestGraphError(f"wire refers to missing node {node_id!r}")
    stack = set(stack or ())
    if node_id in stack:
        raise QuestGraphError("data wires contain a cycle")
    stack.add(node_id)
    node_type = node.get("type")
    params = node.get("params") or {}
    role = (node.get("meta") or {}).get("questInput")

    if role:
        if role not in fixture:
            raise QuestGraphError(f"fixture has no value for input {role!r}")
        return fixture[role]
    if node_type == "literal_number":
        return _as_number(params.get("value", 0))
    if node_type == "literal_bool":
        return _as_bool(params.get("value", False))
    if node_type == "circuit_input":
        return _as_bool(params.get("value", False))

    binary_ops = {
        "add": lambda a, b: a + b,
        "subtract": lambda a, b: a - b,
        "multiply": lambda a, b: a * b,
        "divide": lambda a, b: a / b,
        "circuit_and": lambda a, b: bool(a) and bool(b),
    }
    if node_type in binary_ops:
        a = _eval_signal(graph, _data_source(graph, node_id, "a"), fixture, stack)
        b = _eval_signal(graph, _data_source(graph, node_id, "b"), fixture, stack)
        try:
            return binary_ops[node_type](a, b)
        except ZeroDivisionError as exc:
            raise QuestGraphError("division by zero") from exc
    if node_type == "circuit_resistor":
        return _as_bool(
            _eval_signal(graph, _data_source(graph, node_id, "signal"), fixture, stack)
        )
    if node_type == "circuit_led":
        return _as_bool(
            _eval_signal(graph, _data_source(graph, node_id, "signal"), fixture, stack)
        )
    raise QuestGraphError(f"{node_type!r} cannot produce a quest value")


def _check(name, passed, detail):
    return {"name": name, "passed": bool(passed), "detail": detail}


def _grade_fixtures(graph, output_node, output_port, fixtures):
    results = []
    for fixture in fixtures:
        try:
            source = _data_source(graph, output_node["id"], output_port)
            actual = _eval_signal(graph, source, fixture["inputs"])
            expected = fixture["expected"]
            if isinstance(expected, bool):
                passed = actual is expected
            else:
                passed = abs(float(actual) - float(expected)) < 1e-9
            detail = f"got {actual!r}; expected {expected!r}"
        except (QuestGraphError, TypeError, ValueError) as exc:
            actual = None
            passed = False
            detail = str(exc)
        results.append(
            {
                "inputs": deepcopy(fixture["inputs"]),
                "expected": fixture["expected"],
                "actual": actual,
                "passed": passed,
                "detail": detail,
            }
        )
    return results


def _allowed_check(quest, graph):
    allowed = set(quest["allowedNodeTypes"])
    used = {node.get("type") for node in graph.get("nodes") or []}
    unknown = sorted(str(node_type) for node_type in used - allowed)
    return _check(
        "Known parts only",
        not unknown,
        "All nodes are allowed for this quest."
        if not unknown
        else f"Remove disallowed node types: {', '.join(unknown)}",
    )


def _exec_edge_exists(graph, source, target, source_port):
    return any(
        edge.get("kind") != "data"
        and edge.get("from") == source
        and edge.get("to") == target
        and edge.get("fromPort", "next") == source_port
        for edge in graph.get("edges") or []
    )


def _grade_calculator(quest, graph):
    nodes = list(_nodes_by_id(graph).values())
    starts = [node for node in nodes if node.get("type") == "start"]
    gates = [node for node in nodes if node.get("type") == "exec_gate"]
    outputs = [node for node in nodes if node.get("type") == "print_value"]
    tagged_inputs = {
        (node.get("meta") or {}).get("questInput")
        for node in nodes
        if (node.get("meta") or {}).get("questInput")
    }
    output = next(
        (node for node in outputs if (node.get("meta") or {}).get("questOutput")),
        outputs[0] if outputs else None,
    )
    checks = [_allowed_check(quest, graph)]
    checks.append(
        _check(
            "Fixture inputs",
            {"a", "b"} <= tagged_inputs,
            "Both labeled input nodes are present."
            if {"a", "b"} <= tagged_inputs
            else "Keep the starter Input A and Input B nodes.",
        )
    )
    checks.append(
        _check(
            "Output node",
            output is not None,
            "Calculator output is present." if output else "Add or keep a Print Value output.",
        )
    )
    exec_ok = bool(
        starts
        and gates
        and output
        and any(
            _exec_edge_exists(graph, start["id"], gate["id"], "next")
            and _exec_edge_exists(graph, gate["id"], output["id"], "pass")
            for start in starts
            for gate in gates
        )
    )
    checks.append(
        _check(
            "Execution path",
            exec_ok,
            "Start → Execution Gate (Pass) → output is connected."
            if exec_ok
            else "Wire Start → Execution Gate, then Gate Pass → Calculator output.",
        )
    )
    fixtures = (
        _grade_fixtures(graph, output, "expression", quest["acceptanceTests"])
        if output
        else []
    )
    checks.append(
        _check(
            "Calculator fixtures",
            bool(fixtures) and all(item["passed"] for item in fixtures),
            f"{sum(item['passed'] for item in fixtures)}/{len(quest['acceptanceTests'])} fixtures passed.",
        )
    )
    return checks, fixtures


def _grade_circuit(quest, graph):
    nodes = list(_nodes_by_id(graph).values())
    led = next(
        (
            node
            for node in nodes
            if node.get("type") == "circuit_led"
            and (node.get("meta") or {}).get("questOutput")
        ),
        next((node for node in nodes if node.get("type") == "circuit_led"), None),
    )
    and_gates = [node for node in nodes if node.get("type") == "circuit_and"]
    resistors = [node for node in nodes if node.get("type") == "circuit_resistor"]
    tagged_inputs = {
        (node.get("meta") or {}).get("questInput")
        for node in nodes
        if (node.get("meta") or {}).get("questInput")
    }
    checks = [_allowed_check(quest, graph)]
    checks.append(
        _check(
            "Known inputs and output",
            {"a", "b"} <= tagged_inputs and led is not None,
            "Input A, Input B, and LED are present."
            if {"a", "b"} <= tagged_inputs and led
            else "Keep both starter inputs and the LED.",
        )
    )
    topology_ok = False
    for gate in and_gates:
        for resistor in resistors:
            try:
                gate_inputs = {
                    _data_source(graph, gate["id"], "a"),
                    _data_source(graph, gate["id"], "b"),
                }
                input_roles = {
                    (next(node for node in nodes if node["id"] == source).get("meta") or {}).get(
                        "questInput"
                    )
                    for source in gate_inputs
                }
                topology_ok = bool(
                    led
                    and input_roles == {"a", "b"}
                    and _data_source(graph, resistor["id"], "signal") == gate["id"]
                    and _data_source(graph, led["id"], "signal") == resistor["id"]
                )
            except (QuestGraphError, StopIteration):
                topology_ok = False
            if topology_ok:
                break
        if topology_ok:
            break
    checks.append(
        _check(
            "Safe series path",
            topology_ok,
            "Inputs → 74HC08 AND → 330 Ω resistor → LED is connected."
            if topology_ok
            else "Wire both inputs to AND, then AND → resistor → LED.",
        )
    )
    resistance_ok = bool(
        resistors
        and any(_resistance_is_safe(node) for node in resistors)
    )
    checks.append(
        _check(
            "LED current limiting",
            resistance_ok,
            "Series resistance is in the quest's 220–1000 Ω safe range."
            if resistance_ok
            else "Use a resistor between 220 Ω and 1000 Ω.",
        )
    )
    fixtures = (
        _grade_fixtures(graph, led, "signal", quest["acceptanceTests"]) if led else []
    )
    checks.append(
        _check(
            "AND truth table",
            bool(fixtures) and all(item["passed"] for item in fixtures),
            f"{sum(item['passed'] for item in fixtures)}/{len(quest['acceptanceTests'])} input combinations passed.",
        )
    )
    return checks, fixtures


def grade_quest(quest_id, graph):
    """Grade a Blueprint graph and return actionable checks plus fixture evidence."""
    quest = QUESTS.get(quest_id)
    if not quest:
        raise KeyError(quest_id)
    if not isinstance(graph, dict):
        raise ValueError("graph must be an object")
    if quest["kind"] == "circuit":
        checks, fixtures = _grade_circuit(quest, graph)
    else:
        checks, fixtures = _grade_calculator(quest, graph)
    passed = all(check["passed"] for check in checks)
    return {
        "questId": quest_id,
        "passed": passed,
        "summary": "Quest complete." if passed else "Not yet — inspect the failed checks.",
        "checks": checks,
        "fixtures": fixtures,
    }
