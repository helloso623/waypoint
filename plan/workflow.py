"""Turns a visual node graph into a runnable Python script -- the "blueprint" automation
tab. Exec-pin wiring orders nodes; data pins supply expressions (wired or inline literals).
Branch/loop nodes branch generated code. Typed variables, comments, and canvas meta are
stored in the graph JSON; comments/meta do not affect codegen.
"""
import ast
import datetime
import json
import keyword
import os
import re

_WAYPOINT_API = "http://127.0.0.1:5099"
_PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))

VARIABLE_TYPES = ("int", "float", "string", "bool", "list")

_IDENTIFIERS = frozenset({"variable", "name", "list_var", "dict_var", "as"})
_REPR_PARAMS = frozenset({
    "message", "command", "url", "path", "method", "endpoint", "old", "new",
    "separator", "key", "substring", "format", "headers", "body", "title",
    "notes", "date", "pattern", "lambda_body", "template", "project_id",
})


def _pure(**extra):
    """Mark a node definition as pure (data-only, no exec pins)."""
    return {"pure": True, "outputs": [], **extra}


def P(name, typ="string", wire=None):
    """Param definition: name, type, and whether it is a wireable data input pin."""
    if wire is None:
        wire = name not in _IDENTIFIERS
    return {"name": name, "type": typ, "wire": wire}


def _norm_params(params_def):
    out = []
    for p in params_def or []:
        if isinstance(p, str):
            out.append(P(p))
        elif isinstance(p, dict):
            out.append(P(p["name"], p.get("type", "string"), p.get("wire")))
    return out


NODE_TYPES = {
    "start":        {"label": "Start",         "params": [], "outputs": ["next"], "category": "event"},
    "keyboard_event": {"label": "Keyboard Event", "params": [P("key", "string", False)],
                      "outputs": ["next"], "category": "event"},
    "on_tick":      {"label": "On Tick",       "params": [P("interval_ms", "int", False)],
                      "outputs": ["next"], "category": "event",
                      "searchKeys": ["timer", "tick", "update", "game loop", "interval"]},
    "print":        {"label": "Print",         "params": [P("message", "string")], "outputs": ["next"], "category": "utility"},
    "set_variable": {"label": "Set Variable",  "params": [P("name", "string", False), P("value", "string")], "outputs": ["next"], "category": "utility"},
    "run_command":  {"label": "Run Command",   "params": [P("command", "string")], "outputs": ["next"], "category": "utility"},
    "run_shell":    {"label": "Run Shell",     "params": [P("command", "string")], "outputs": ["next"], "category": "utility"},
    "sleep":        {"label": "Sleep",         "params": [P("seconds", "float")], "outputs": ["next"], "category": "utility"},
    "http_request": {"label": "HTTP Request",  "params": [
        P("method", "string"), P("url", "string"), P("headers", "string"), P("body", "string"),
    ], "outputs": ["next"], "category": "network",
       "dataOutputs": [
           {"port": "response_text", "type": "string"},
           {"port": "response_json", "type": "any"},
           {"port": "status_code", "type": "int"},
       ]},
    "read_file":    {"label": "Read File",     "params": [P("path", "string"), P("variable", "string", False)], "outputs": ["next"], "category": "utility"},
    "write_file":   {"label": "Write File",    "params": [P("path", "string"), P("content", "string")], "outputs": ["next"], "category": "utility"},
    "read_text_file": {"label": "Read Text File", "params": [P("path", "string")], "outputs": ["next"], "category": "io",
                      "dataOutputs": [{"port": "result", "type": "string"}]},
    "write_text_file": {"label": "Write Text File", "params": [P("path", "string"), P("content", "string")],
                        "outputs": ["next"], "category": "io"},
    "call_planner_api": {"label": "Call Planner API", "params": [P("method", "string"), P("endpoint", "string"), P("body", "string")], "outputs": ["next"], "category": "utility"},
    "send_discord": {"label": "Send Discord",  "params": [P("message", "string")], "outputs": ["next"], "category": "utility"},
    "get_tasks":    {"label": "Get Tasks",     "params": [], "outputs": ["next"], "category": "waypoint",
                     "dataOutputs": [{"port": "result", "type": "list"}]},
    "add_task":     {"label": "Add Task",      "params": [P("title", "string"), P("notes", "string")], "outputs": ["next"], "category": "waypoint"},
    "get_days":     {"label": "Get Days",      "params": [P("limit", "int")], "outputs": ["next"], "category": "waypoint",
                     "dataOutputs": [{"port": "result", "type": "list"}]},
    "add_note":     {"label": "Add Note",      "params": [P("project_id", "int", False), P("title", "string"), P("body", "string")],
                     "outputs": ["next"], "category": "waypoint"},
    "get_links":    {"label": "Get Links",     "params": [], "outputs": ["next"], "category": "waypoint",
                     "dataOutputs": [{"port": "result", "type": "list"}]},
    "add_calendar_event": {"label": "Add Calendar Event", "params": [
        P("title", "string"), P("date", "string"), P("notes", "string"),
    ], "outputs": ["next"], "category": "waypoint"},
    "if":           {"label": "Branch (If)",   "params": [P("condition", "bool")], "outputs": ["true", "false"], "category": "flow",
                     "searchKeys": ["if", "else", "elif", "branch", "condition", "endif", "true", "false"]},
    "exec_gate":    {"label": "Execution Gate", "params": [P("open", "bool")], "outputs": ["pass"], "category": "flow",
                     "searchKeys": ["gate", "execution gate", "exec", "block", "pass", "open", "close", "unreal"]},
    "endif":        {"label": "End If",        "params": [], "outputs": ["next"], "category": "flow"},
    "for":          {"label": "For Loop",      "params": [P("variable", "string", False), P("iterable", "list")], "outputs": ["loop", "done"], "category": "flow",
                     "searchKeys": ["for", "loop", "iterate", "foreach", "range"]},
    "while_loop":   {"label": "While",         "params": [P("condition", "string", False)], "outputs": ["loop", "done"], "category": "flow",
                     "searchKeys": ["while", "loop", "repeat", "until"]},
    # TODO(custom I/O): support user-declared input/output pin descriptors and bind
    # them around custom code once the graph schema preserves dynamic pin names.
    "custom":       {"label": "Custom Python", "params": [P("code", "string", False)], "outputs": ["next"], "category": "utility"},
    "print_value":  {"label": "Print Value",   "params": [P("expression", "string")], "outputs": ["next"], "category": "utility"},
    "add":          {"label": "Add (+)", **_pure(params=[P("a", "float"), P("b", "float")],
                     dataOutputs=[{"port": "result", "type": "float"}], category="math")},
    "subtract":     {"label": "Subtract (-)", **_pure(params=[P("a", "float"), P("b", "float")],
                     dataOutputs=[{"port": "result", "type": "float"}], category="math")},
    "multiply":     {"label": "Multiply (x)", **_pure(params=[P("a", "float"), P("b", "float")],
                     dataOutputs=[{"port": "result", "type": "float"}], category="math")},
    "divide":       {"label": "Divide (/)", **_pure(params=[P("a", "float"), P("b", "float")],
                     dataOutputs=[{"port": "result", "type": "float"}], category="math")},
    "modulo":       {"label": "Modulo (%)", **_pure(params=[P("a", "float"), P("b", "float")],
                     dataOutputs=[{"port": "result", "type": "float"}], category="math")},
    "math_min":     {"label": "Min", **_pure(params=[P("a", "float"), P("b", "float")],
                     dataOutputs=[{"port": "result", "type": "float"}], category="math")},
    "math_max":     {"label": "Max", **_pure(params=[P("a", "float"), P("b", "float")],
                     dataOutputs=[{"port": "result", "type": "float"}], category="math")},
    "math_abs":     {"label": "Abs", **_pure(params=[P("value", "float")],
                     dataOutputs=[{"port": "result", "type": "float"}], category="math")},
    "math_round":   {"label": "Round", **_pure(params=[P("value", "float")],
                     dataOutputs=[{"port": "result", "type": "float"}], category="math")},
    "increment":    {"label": "Increment",     "params": [P("variable", "string", False), P("amount", "float")], "outputs": ["next"], "category": "math"},
    "compare":      {"label": "Compare", **_pure(params=[P("a", "string"), P("operator", "string", False), P("b", "string")],
                     dataOutputs=[{"port": "result", "type": "bool"}], category="math",
                     searchKeys=["compare", "equals", "equal", "==", "!=", "gt", "lt", "condition", "bool"])},
    "concat_text":  {"label": "Concat Text", **_pure(params=[P("a", "string"), P("b", "string")],
                     dataOutputs=[{"port": "result", "type": "string"}], category="string")},
    "format_string": {"label": "Format String", **_pure(params=[P("template", "string")],
                      dataOutputs=[{"port": "result", "type": "string"}], category="string")},
    "regex_match":  {"label": "Regex Match", **_pure(params=[P("value", "string"), P("pattern", "string")],
                     dataOutputs=[{"port": "result", "type": "bool"}], category="string")},
    "random_number": {"label": "Random Number", **_pure(params=[P("min", "int"), P("max", "int")],
                      dataOutputs=[{"port": "result", "type": "int"}], category="math")},
    "length":        {"label": "Length", **_pure(params=[P("value", "list")],
                      dataOutputs=[{"port": "result", "type": "int"}], category="collection")},
    "str_upper":     {"label": "Text Upper", **_pure(params=[P("value", "string")],
                      dataOutputs=[{"port": "result", "type": "string"}], category="string")},
    "str_lower":     {"label": "Text Lower", **_pure(params=[P("value", "string")],
                      dataOutputs=[{"port": "result", "type": "string"}], category="string")},
    "str_strip":     {"label": "Text Strip", **_pure(params=[P("value", "string")],
                      dataOutputs=[{"port": "result", "type": "string"}], category="string")},
    "str_split":     {"label": "Text Split", **_pure(params=[P("value", "string"), P("separator", "string")],
                      dataOutputs=[{"port": "result", "type": "list"}], category="string")},
    "str_replace":   {"label": "Text Replace", **_pure(params=[P("value", "string"), P("old", "string"), P("new", "string")],
                      dataOutputs=[{"port": "result", "type": "string"}], category="string")},
    "str_contains":  {"label": "Text Contains", **_pure(params=[P("value", "string"), P("substring", "string")],
                      dataOutputs=[{"port": "result", "type": "bool"}], category="string")},
    "list_append":   {"label": "List Append",      "params": [P("list_var", "string", False), P("value", "any")], "outputs": ["next"], "category": "collection"},
    "list_get":      {"label": "List Get Item", **_pure(params=[P("list_var", "string", False), P("index", "int")],
                      dataOutputs=[{"port": "result", "type": "any"}], category="collection")},
    "list_map":      {"label": "List Map", **_pure(params=[P("list_var", "string", False), P("lambda_body", "string")],
                      dataOutputs=[{"port": "result", "type": "list"}], category="collection")},
    "list_filter":   {"label": "List Filter", **_pure(params=[P("list_var", "string", False), P("lambda_body", "string")],
                      dataOutputs=[{"port": "result", "type": "list"}], category="collection")},
    "list_sort":     {"label": "List Sort",        "params": [P("list_var", "string", False)], "outputs": ["next"], "category": "collection"},
    "list_join":     {"label": "List Join to Text", **_pure(params=[P("list_var", "string", False), P("separator", "string")],
                      dataOutputs=[{"port": "result", "type": "string"}], category="collection")},
    "dict_get":      {"label": "Dict Get", **_pure(params=[P("dict_var", "string", False), P("key", "string")],
                      dataOutputs=[{"port": "result", "type": "any"}], category="collection")},
    "dict_set":      {"label": "Dict Set",         "params": [P("dict_var", "string", False), P("key", "string"), P("value", "any")], "outputs": ["next"], "category": "collection"},
    "json_parse":    {"label": "JSON Parse", **_pure(params=[P("value", "string")],
                      dataOutputs=[{"port": "result", "type": "any"}], category="data")},
    "json_get_key":  {"label": "JSON Get Key", **_pure(params=[P("value", "any"), P("key", "string")],
                      dataOutputs=[{"port": "result", "type": "any"}], category="data")},
    "json_stringify": {"label": "JSON Stringify", **_pure(params=[P("value", "any")],
                      dataOutputs=[{"port": "result", "type": "string"}], category="data")},
    "cast_string":  {"label": "Cast to String", **_pure(params=[P("value", "any")],
                      dataOutputs=[{"port": "result", "type": "string"}], category="data")},
    "cast_int":     {"label": "Cast to Integer", **_pure(params=[P("value", "any")],
                      dataOutputs=[{"port": "result", "type": "int"}], category="data")},
    "cast_float":   {"label": "Cast to Float", **_pure(params=[P("value", "any")],
                      dataOutputs=[{"port": "result", "type": "float"}], category="data")},
    "cast_bool":    {"label": "Cast to Boolean", **_pure(params=[P("value", "any")],
                      dataOutputs=[{"port": "result", "type": "bool"}], category="data")},
    "cast_list":    {"label": "Cast to List", **_pure(params=[P("value", "any")],
                      dataOutputs=[{"port": "result", "type": "list"}], category="data")},
    "cast_json":    {"label": "Cast to JSON", **_pure(params=[P("value", "any")],
                      dataOutputs=[{"port": "result", "type": "json"}], category="data")},
    "now_timestamp": {"label": "Current Time", **_pure(params=[],
                      dataOutputs=[{"port": "result", "type": "string"}], category="datetime")},
    "format_now":    {"label": "Format Current Time", **_pure(params=[P("format", "string")],
                      dataOutputs=[{"port": "result", "type": "string"}], category="datetime")},
    "get_var":       {"label": "Get Variable", **_pure(params=[P("as", "string", False)],
                      dataOutputs=[{"port": "value", "type": "any"}], category="variable")},
    "set_var":       {"label": "Set Variable",     "params": [P("value", "string")], "outputs": ["next"], "category": "variable"},
    "func_entry":    {"label": "Function Entry",   "params": [], "outputs": ["next"], "category": "function"},
    "func_return":   {"label": "Return",           "params": [], "outputs": [], "category": "function"},
    "call_func":     {"label": "Call Function",    "params": [], "outputs": ["next"], "category": "function"},
    "reroute":       {"label": "Reroute", **_pure(dataInputs=[{"port": "in", "type": "any"}],
                      dataOutputs=[{"port": "out", "type": "any"}], category="utility")},
    "ui_event":      {"label": "UI Event",         "params": [P("event", "string", False), P("widget_id", "string", False)],
                      "outputs": ["next"], "category": "event",
                      "dataOutputs": [
                          {"port": "widget_id", "type": "string"},
                          {"port": "value", "type": "string"},
                          {"port": "text", "type": "string"},
                          {"port": "checked", "type": "bool"},
                      ]},
    "set_widget":    {"label": "Set Widget",       "params": [
                          P("widget_id", "string", False),
                          P("property", "string", False),
                          P("value", "any"),
                      ], "outputs": ["next"], "category": "utility",
                      "searchKeys": ["ui", "move", "position", "x", "y", "text", "visible"]},
    "stop_preview":  {"label": "Stop Preview",     "params": [P("message", "string")],
                      "outputs": [], "category": "event",
                      "searchKeys": ["stop", "game over", "timer", "preview"]},
    "call_macro":    {"label": "Call Macro",       "params": [], "outputs": ["next"], "category": "macro"},
    "macro_in":      {"label": "Macro Input", **_pure(params=[P("name", "string", False)],
                      dataOutputs=[{"port": "value", "type": "any"}], category="macro")},
    "literal_number": {"label": "Number", **_pure(params=[P("value", "float", False)],
                       dataOutputs=[{"port": "result", "type": "float"}], category="data")},
    "literal_string": {"label": "String", **_pure(params=[P("value", "string", False)],
                       dataOutputs=[{"port": "result", "type": "string"}], category="data")},
    "literal_bool":   {"label": "Bool", **_pure(params=[P("value", "bool", False)],
                      dataOutputs=[{"port": "result", "type": "bool"}], category="data")},
    "circuit_input":  {"label": "Logic Input", **_pure(params=[P("value", "bool", False)],
                      dataOutputs=[{"port": "signal", "type": "bool"}], category="circuit",
                      searchKeys=["switch", "logic", "high", "low", "datasheet"])},
    "circuit_and":    {"label": "74HC08 AND", **_pure(params=[P("a", "bool"), P("b", "bool")],
                      dataOutputs=[{"port": "signal", "type": "bool"}], category="circuit",
                      searchKeys=["and", "gate", "chip", "74hc08", "datasheet"])},
    "circuit_resistor": {"label": "330 Ω Resistor", **_pure(
                      params=[P("signal", "bool"), P("resistance_ohms", "int", False)],
                      dataOutputs=[{"port": "signal", "type": "bool"}], category="circuit",
                      searchKeys=["resistor", "ohm", "current limit", "datasheet"])},
    "circuit_led":    {"label": "Red LED", **_pure(
                      params=[P("signal", "bool"), P("color", "string", False)],
                      dataOutputs=[{"port": "lit", "type": "bool"}], category="circuit",
                      searchKeys=["led", "light", "diode", "indicator", "datasheet"])},
}

# Python names and familiar method/operator spellings make the same supported nodes
# discoverable without duplicating frontend-only catalog definitions.
_PYTHON_SEARCH_KEYS = {
    "print": ["python", "builtin", "stdout", "console", "log"],
    "print_value": ["python", "builtin", "stdout", "expression"],
    "custom": ["python", "code", "script", "statement"],
    "if": ["python", "if", "elif", "else", "condition", "branch"],
    "exec_gate": ["gate", "execution", "branch", "guard", "open", "blocked", "pass"],
    "for": ["python", "for", "range", "iterate", "foreach", "loop"],
    "while_loop": ["python", "while", "repeat", "until", "loop"],
    "add": ["python", "operator", "sum", "plus", "+"],
    "subtract": ["python", "operator", "minus", "-"],
    "multiply": ["python", "operator", "times", "*"],
    "divide": ["python", "operator", "quotient", "/"],
    "modulo": ["python", "operator", "remainder", "%"],
    "math_min": ["python", "builtin", "min", "minimum"],
    "math_max": ["python", "builtin", "max", "maximum"],
    "math_abs": ["python", "builtin", "abs", "absolute"],
    "math_round": ["python", "builtin", "round"],
    "random_number": ["python", "random", "randint"],
    "compare": ["python", "operator", "equals", "boolean", "condition"],
    "concat_text": ["python", "string", "str", "concatenate", "join", "+"],
    "format_string": ["python", "string", "str", "format", "f-string"],
    "regex_match": ["python", "string", "regex", "re", "match"],
    "length": ["python", "builtin", "len", "size", "count"],
    "str_upper": ["python", "string", "str", "upper", "uppercase"],
    "str_lower": ["python", "string", "str", "lower", "lowercase"],
    "str_strip": ["python", "string", "str", "strip", "trim"],
    "str_split": ["python", "string", "str", "split"],
    "str_replace": ["python", "string", "str", "replace"],
    "str_contains": ["python", "string", "str", "contains", "in"],
    "list_append": ["python", "list", "append", "push", "add item"],
    "list_get": ["python", "list", "index", "getitem", "item"],
    "list_map": ["python", "list", "map", "comprehension"],
    "list_filter": ["python", "list", "filter", "comprehension"],
    "list_sort": ["python", "list", "sort", "sorted"],
    "list_join": ["python", "list", "join", "string"],
    "dict_get": ["python", "dict", "dictionary", "get", "key"],
    "dict_set": ["python", "dict", "dictionary", "set", "key"],
    "json_parse": ["python", "json", "loads", "parse", "decode"],
    "json_stringify": ["python", "json", "dumps", "stringify", "encode"],
    "json_get_key": ["python", "json", "dict", "key", "get"],
    "cast_string": ["python", "cast", "convert", "coerce", "str", "string", "text", "to string"],
    "cast_int": ["python", "cast", "convert", "coerce", "int", "integer", "number", "to int"],
    "cast_float": ["python", "cast", "convert", "coerce", "float", "decimal", "number", "to float"],
    "cast_bool": ["python", "cast", "convert", "coerce", "bool", "boolean", "truthy", "to bool"],
    "cast_list": ["python", "cast", "convert", "coerce", "list", "array", "to list"],
    "cast_json": ["python", "cast", "convert", "coerce", "json", "parse", "loads", "to json"],
    "literal_number": ["python", "literal", "number", "int", "float"],
    "literal_string": ["python", "literal", "string", "str", "text"],
    "literal_bool": ["python", "literal", "bool", "boolean", "true", "false"],
    "get_var": ["python", "variable", "get", "read"],
    "set_var": ["python", "variable", "set", "assign"],
    "increment": ["python", "variable", "increment", "+=", "counter"],
    "ui_event": ["ui", "widget", "event", "click", "change"],
    "set_widget": ["ui", "widget", "property", "text", "position", "visible"],
    "stop_preview": ["ui", "preview", "stop", "game over"],
    "read_file": ["python", "open", "file", "read", "io", "pathlib"],
    "write_file": ["python", "open", "file", "write", "io", "pathlib"],
    "read_text_file": ["python", "open", "file", "read", "text", "io"],
    "write_text_file": ["python", "open", "file", "write", "text", "io"],
    "http_request": ["python", "requests", "urllib", "http", "fetch", "api"],
    "run_command": ["python", "subprocess", "shell", "os.system", "command"],
}

for _node_type, _search_keys in _PYTHON_SEARCH_KEYS.items():
    _meta = NODE_TYPES[_node_type]
    _meta["searchKeys"] = list(dict.fromkeys([*(_meta.get("searchKeys") or []), *_search_keys]))

_CATEGORY_VISUAL = {
    "event":    {"icon": "⚡", "color": "#f5a623", "band": "event",    "compact": False},
    "flow":     {"icon": "⇶", "color": "#7b68ee", "band": "flow",     "compact": False},
    "math":     {"icon": "∑", "color": "#4caf50", "band": "math",     "compact": True},
    "string":   {"icon": "ab", "color": "#26a69a", "band": "string",  "compact": True},
    "collection": {"icon": "☰", "color": "#8d6e63", "band": "collection", "compact": True},
    "datetime": {"icon": "⏱", "color": "#5c6bc0", "band": "datetime", "compact": True},
    "data":     {"icon": "{}", "color": "#78909c", "band": "data",     "compact": True},
    "utility":  {"icon": "⚙", "color": "#9e9e9e", "band": "utility",  "compact": False},
    "variable": {"icon": "x", "color": "#ab47bc", "band": "variable", "compact": True},
    "function": {"icon": "ƒ", "color": "#ef5350", "band": "function", "compact": False},
    "waypoint": {"icon": "◈", "color": "#42a5f5", "band": "waypoint", "compact": False},
    "io":       {"icon": "⇄", "color": "#66bb6a", "band": "io",       "compact": False},
    "macro":    {"icon": "▦", "color": "#ff7043", "band": "macro",    "compact": False},
    "circuit":  {"icon": "⌁", "color": "#00a6a6", "band": "circuit",  "compact": True},
    "network":  {"icon": "⚙", "color": "#9e9e9e", "band": "utility",  "compact": False},
}

_TYPE_VISUAL_OVERRIDE = {
    "ui_event": {"icon": "▣", "color": "#f5a623", "band": "ui_event", "compact": False},
    "call_macro": {"icon": "▦", "color": "#ff7043", "band": "macro", "compact": False},
    "exec_gate": {"icon": "◇", "color": "#f0ad4e", "band": "flow", "compact": False},
}

for _nt, _meta in NODE_TYPES.items():
    _cat = _meta.get("category", "utility")
    _vis = dict(_CATEGORY_VISUAL.get(_cat, _CATEGORY_VISUAL["utility"]))
    if _nt in _TYPE_VISUAL_OVERRIDE:
        _vis.update(_TYPE_VISUAL_OVERRIDE[_nt])
    _meta["visual"] = _vis


def _is_pure(node_type):
    return bool(NODE_TYPES.get(node_type, {}).get("pure"))


def _types_compatible(src, dst):
    if not src or not dst or src == "any" or dst == "any":
        return True
    if src == dst:
        return True
    return {src, dst} <= {"int", "float"}


def _section_banner(title):
    return f"# ── {title} ──"


def _header_docstring(graph):
    name = graph.get("name") or "Untitled workflow"
    desc = (graph.get("description") or "").strip()
    date = datetime.date.today().isoformat()
    lines = ['"""', f"Workflow: {name}", f"Generated: {date}"]
    if desc:
        lines.append(desc)
    lines.append('"""')
    return "\n".join(lines)


def _organize_sectioned_code(graph, sections):
    """Merge section buckets into literate Python with banners."""
    parts = [_header_docstring(graph), ""]
    for title, key in (
        ("Imports", "imports"), ("State", "state"), ("UI", "ui"),
        ("Functions", "functions"), ("Events", "events"), ("Main", "main"),
    ):
        lines = [ln for ln in (sections.get(key) or []) if ln is not None]
        if lines:
            parts.append(_section_banner(title))
            parts.extend(lines)
            parts.append("")
    return "\n".join(parts).rstrip() + "\n"


def _extract_imports(lines):
    """Pull inline import statements into a deduped imports block."""
    imports = []
    body = []
    seen = set()
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("import ") or stripped.startswith("from "):
            if stripped not in seen:
                seen.add(stripped)
                imports.append(stripped)
        else:
            body.append(line)
    return imports, body


def _guard_path_expr(path_expr):
    root = repr(_PROJECT_ROOT)
    return (
        f"(_p := os.path.abspath({path_expr}), "
        f"_p.startswith({root}) or (_ for _ in ()).throw(ValueError('path outside project')), "
        f"_p)[-1]"
    )


def _emit_node_lines(node, level, graph, nodes, cache, fn_name=None):
    """Emit statements for a node, prefixed with a node-origin comment."""
    t = node.get("type")
    if _is_pure(t):
        return []
    lines = _emit(node, level, graph, nodes, cache, fn_name)
    if not lines:
        return []
    nid = node.get("id")
    if nid:
        return [f"{_indent(level)}# node:{nid}"] + lines
    return lines


def _dedent_custom_code(code):
    lines = (code or "pass").splitlines()
    if not lines:
        return "pass"
    if len(lines) == 1:
        return lines[0]
    if not lines[0].strip().startswith("try:"):
        return code
    indents = [len(line) - len(line.lstrip()) for line in lines[1:] if line.strip()]
    if not indents:
        return code
    min_indent = min(indents)
    if min_indent == 0:
        return code
    out = [lines[0]]
    for line in lines[1:]:
        if line.strip():
            out.append(line[min_indent:] if len(line) >= min_indent else line.lstrip())
        else:
            out.append("")
    return "\n".join(out)


def _indent(level):
    return "    " * level


def _default_literal(var_type, raw):
    raw = (raw or "").strip()
    if var_type == "int":
        try:
            return str(int(raw)) if raw else "0"
        except ValueError:
            return "0"
    if var_type == "float":
        try:
            return str(float(raw)) if raw else "0.0"
        except ValueError:
            return "0.0"
    if var_type == "bool":
        return "True" if raw.lower() in ("true", "1", "yes", "on") else "False"
    if var_type == "list":
        if raw:
            try:
                parsed = ast.literal_eval(raw)
                if isinstance(parsed, list):
                    return repr(parsed)
            except (ValueError, SyntaxError):
                pass
        return "[]"
    return repr(raw)


_PARAM_DEFAULTS = {
    "a": "0", "b": "0", "seconds": "1", "condition": "True", "expression": "None",
    "iterable": "[]", "min": "0", "max": "100", "amount": "1", "index": "0",
    "value": "None", "body": "None", "content": "", "name": "x", "variable": "result",
    "list_var": "items", "dict_var": "data", "operator": "==", "method": "GET",
    "endpoint": "/", "format": '"%Y-%m-%d"', "separator": '" "', "as": "",
    "headers": "{}", "url": '""', "title": '""', "notes": '""', "date": '""',
    "pattern": '""', "lambda_body": "x", "template": '""', "project_id": "1",
    "limit": "30", "key": '""', "interval_ms": "50",
}


def _safe_ident(name, fallback="x"):
    raw = str(name or "").strip()
    if raw.isidentifier() and not keyword.iskeyword(raw):
        return raw
    cleaned = re.sub(r"[^0-9A-Za-z_]", "_", raw)
    if cleaned and cleaned[0].isdigit():
        cleaned = f"_{cleaned}"
    if cleaned.isidentifier() and not keyword.iskeyword(cleaned):
        return cleaned
    return fallback


def _code_expr(value, default="None"):
    """Emit a Python expression. Keep literals/wired names; quote raw typed text."""
    if value is None:
        return default
    if isinstance(value, (int, float, bool)):
        return repr(value)
    s = str(value)
    if not str(s).strip() and default is not None:
        return default
    try:
        ast.literal_eval(s)
        return s
    except (ValueError, SyntaxError):
        pass
    if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*(?:\[[^\]]+\])?", s.strip()):
        return s.strip()
    return repr(s)


def _literal_param(node, name, typ="string", identifier=False):
    raw = (node.get("params") or {}).get(name, "")
    if identifier:
        return raw if raw else _PARAM_DEFAULTS.get(name, "")
    if name in _REPR_PARAMS:
        return repr(raw)
    if typ == "int":
        try:
            return str(int(raw)) if str(raw).strip() else _PARAM_DEFAULTS.get(name, "0")
        except ValueError:
            return _PARAM_DEFAULTS.get(name, "0")
    if typ == "float":
        try:
            return str(float(raw)) if str(raw).strip() else _PARAM_DEFAULTS.get(name, "0.0")
        except ValueError:
            return _PARAM_DEFAULTS.get(name, "0.0")
    if typ == "bool":
        if not str(raw).strip():
            return _PARAM_DEFAULTS.get(name, "True")
        return "True" if str(raw).lower() in ("true", "1", "yes", "on") else "False"
    if typ == "list":
        if str(raw).strip():
            try:
                parsed = ast.literal_eval(raw)
                if isinstance(parsed, list):
                    return repr(parsed)
            except (ValueError, SyntaxError):
                pass
        return _PARAM_DEFAULTS.get(name, "[]")
    return raw if str(raw).strip() else _PARAM_DEFAULTS.get(name, '""')


def _var_type_by_name(graph, name):
    for v in graph.get("variables") or []:
        if isinstance(v, dict) and v.get("name") == name:
            return v.get("type", "string")
    return "string"


def _resolved_params(graph, nodes, node, cache):
    t = node["type"]
    if t == "set_var":
        var_name = node.get("varName")
        vtype = _var_type_by_name(graph, var_name) if var_name else "string"
        wired = _data_in_value(graph, nodes, node["id"], "value", cache)
        if wired is not None:
            return {"value": wired}
        return {"value": _literal_param(node, "value", vtype)}
    if t == "call_macro":
        out = {}
        for pd in _call_macro_param_defs(node, graph):
            name = pd["name"]
            typ = pd.get("type", "string")
            wired = _data_in_value(graph, nodes, node["id"], name, cache)
            out[name] = wired if wired is not None else _literal_param(node, name, typ)
        return out
    defs = NODE_TYPES.get(t, {})
    params_def = _norm_params(defs.get("params", []))
    out = {}
    for pd in params_def:
        name = pd["name"]
        typ = pd.get("type", "string")
        if pd.get("wire"):
            wired = _data_in_value(graph, nodes, node["id"], name, cache)
            out[name] = wired if wired is not None else _literal_param(node, name, typ)
        else:
            out[name] = _literal_param(node, name, typ, identifier=True)
    return out


def _emit(node, level, graph=None, nodes=None, cache=None, fn_name=None):
    cache = cache if cache is not None else {}
    t = node["type"]
    if _is_pure(t):
        return []
    if graph is not None and nodes is not None:
        p = _resolved_params(graph, nodes, node, cache)
    else:
        p = node.get("params", {})
    if t == "print":
        return [f'{_indent(level)}print({_code_expr(p.get("message", ""), default="\"\"")})']
    if t == "set_variable":
        return [f'{_indent(level)}{_safe_ident(p.get("name", "x"))} = {_code_expr(p.get("value", "None"))}']
    if t == "run_command":
        return [
            f'{_indent(level)}import subprocess',
            f'{_indent(level)}subprocess.run({_code_expr(p.get("command", ""), default="\"\"")}, shell=True)',
        ]
    if t == "run_shell":
        return [
            f'{_indent(level)}# SAFETY: review shell command before running',
            f'{_indent(level)}import subprocess',
            f'{_indent(level)}subprocess.run({_code_expr(p.get("command", ""), default="\"\"")}, shell=True, check=False)',
        ]
    if t == "sleep":
        return [f'{_indent(level)}import time; time.sleep({p.get("seconds", "1")})']
    if t == "http_request":
        hdrs = p.get("headers") or "{}"
        body = p.get("body") or "None"
        tmp = f"_http_{node['id'].replace('-', '_')}"
        return [
            f'{_indent(level)}import requests',
            f'{_indent(level)}{tmp} = requests.request({p.get("method", "GET")}, {p.get("url", "")}, '
            f'headers={hdrs}, json={body})',
        ]
    if t == "read_file":
        var = p.get("variable", "content")
        return [f'{_indent(level)}{var} = open({p.get("path", "")}, encoding="utf-8").read()']
    if t == "write_file":
        return [
            f'{_indent(level)}with open({p.get("path", "")}, encoding="utf-8") as f:',
            f'{_indent(level)}    f.write({p.get("content", "")})',
        ]
    if t == "read_text_file":
        return []
    if t == "write_text_file":
        path = _guard_path_expr(p.get("path", '""'))
        return [
            f'{_indent(level)}import os',
            f'{_indent(level)}# path restricted to project directory',
            f'{_indent(level)}with open({path}, encoding="utf-8") as f:',
            f'{_indent(level)}    f.write({p.get("content", "")})',
        ]
    if t == "call_planner_api":
        return [
            f'{_indent(level)}import requests',
            f'{_indent(level)}requests.request({p.get("method", "GET")}, "{_WAYPOINT_API}{p.get("endpoint", "/")}", '
            f'json={p.get("body") or "None"})',
        ]
    if t == "send_discord":
        return [
            f'{_indent(level)}import requests',
            f'{_indent(level)}requests.post("{_WAYPOINT_API}/api/notify/discord", json={{"message": {p.get("message", "")}}})',
        ]
    if t == "get_tasks":
        return []
    if t == "add_task":
        return [
            f'{_indent(level)}import requests',
            f'{_indent(level)}requests.post("{_WAYPOINT_API}/api/tasks", json={{"title": {p.get("title", "")}, "notes": {p.get("notes", "")}}})',
        ]
    if t == "get_days":
        return []
    if t == "add_note":
        pid = p.get("project_id", "1")
        return [
            f'{_indent(level)}import requests',
            f'{_indent(level)}requests.post("{_WAYPOINT_API}/api/projects/{pid}/notes", '
            f'json={{"title": {p.get("title", "")}, "body": {p.get("body", "")}}})',
        ]
    if t == "get_links":
        return []
    if t == "add_calendar_event":
        return [
            f'{_indent(level)}import requests',
            f'{_indent(level)}requests.post("{_WAYPOINT_API}/api/calendar", json={{"title": {p.get("title", "")}, '
            f'"date": {p.get("date", "")}, "notes": {p.get("notes", "")}}})',
        ]
    if t == "custom":
        code = _dedent_custom_code(p.get("code", "pass"))
        return [f'{_indent(level)}{line}' for line in code.splitlines()] or [f'{_indent(level)}pass']
    if t == "print_value":
        return [f'{_indent(level)}print({p.get("expression", "None")})']
    if t == "increment":
        var = p.get("variable", "x")
        amount = p.get("amount", "1")
        return [f'{_indent(level)}{var} = ({var}) + ({amount})']
    if t == "list_append":
        return [f'{_indent(level)}{p.get("list_var", "items")}.append({p.get("value", "None")})']
    if t == "list_sort":
        return [f'{_indent(level)}{p.get("list_var", "items")}.sort()']
    if t == "dict_set":
        return [f'{_indent(level)}({p.get("dict_var", "{}")})[{p.get("key", "''")}] = {p.get("value", "None")}']
    if t == "set_var":
        var = node.get("varName") or "value"
        value = p.get("value") or "None"
        return [f'{_indent(level)}{var} = {value}']
    if t == "set_widget":
        raw = node.get("params") or {}
        wid = str(raw.get("widget_id") or "")
        prop = str(raw.get("property") or "")
        value = p.get("value") or "None"
        target = f"app._widgets.get({wid!r})"
        if prop in ("x", "y", "width", "height"):
            return [
                f"{_indent(level)}if {target} is not None:",
                f"{_indent(level + 1)}{target}.place_configure({prop}={value})",
            ]
        if prop == "text":
            return [
                f"{_indent(level)}if {target} is not None:",
                f"{_indent(level + 1)}{target}.config(text=str({value}))",
            ]
        if prop == "visible":
            return [
                f"{_indent(level)}if {target} is not None:",
                f"{_indent(level + 1)}{target}.place() if bool({value}) else {target}.place_forget()",
            ]
        return [f"{_indent(level)}# Set Widget ignored: unsupported property {prop!r}"]
    if t == "stop_preview":
        message = p.get("message") or "''"
        return [
            f"{_indent(level)}app._blueprint_running = False",
            f"{_indent(level)}print({message})",
        ]
    if t == "call_func":
        return [f'{_indent(level)}# call {node.get("funcName", "?")} (see generate_code)']
    if t == "call_macro":
        return [f'{_indent(level)}# call macro {node.get("macroId", "?")} (see generate_code)']
    if t == "ui_event":
        wid = p.get("widget_id", "")
        ev = p.get("event", "")
        return [f'{_indent(level)}# UI event On_{wid}_{ev}']
    if t == "keyboard_event":
        return [f'{_indent(level)}# Keyboard event: {p.get("key", "")}']
    if t == "on_tick":
        return [f'{_indent(level)}# Tick every {p.get("interval_ms", "50")} ms']
    if t in ("func_entry", "func_return", "reroute", "get_var", "endif", "while_loop", "exec_gate",
             "literal_number", "literal_string", "literal_bool",
             "add", "subtract", "multiply", "divide", "modulo", "compare",
             "concat_text", "random_number", "length", "str_upper", "str_lower",
             "str_strip", "str_split", "str_replace", "str_contains",
             "list_get", "list_join", "list_map", "list_filter", "dict_get",
             "json_parse", "json_stringify", "json_get_key",
             "now_timestamp", "format_now", "format_string", "regex_match",
             "math_min", "math_max", "math_abs", "math_round"):
        return []
    return [f'{_indent(level)}# unknown node type: {t}']


class _StepLimit(Exception):
    pass


def _exec_out(edges_out, node_id, port="next"):
    return edges_out.get(node_id, {}).get(port)


def _node_meta(node):
    meta = node.get("meta")
    return meta if isinstance(meta, dict) else {}


def _is_disabled(node):
    return bool(_node_meta(node).get("disabled"))


def _single_exec_out_port(node):
    t = node["type"]
    if t in ("func_return", "reroute"):
        return None
    outs = NODE_TYPES.get(t, {}).get("outputs")
    if t == "start":
        outs = ["next"]
    if outs and len(outs) == 1:
        return outs[0]
    return None


def _bypass_disabled(node, edges_out):
    port = _single_exec_out_port(node)
    if port:
        return _exec_out(edges_out, node["id"], port)
    return None


def _exec_in_label(graph, node_id):
    for e in graph.get("edges", []):
        if e.get("kind") == "data":
            continue
        if e.get("to") == node_id:
            lbl = (e.get("label") or "").strip()
            if lbl:
                return lbl
    return None


def _func_local_names(fn):
    out = set()
    for loc in (fn or {}).get("locals") or []:
        if isinstance(loc, dict) and isinstance(loc.get("name"), str):
            name = loc["name"]
            if name.isidentifier() and not keyword.iskeyword(name):
                out.add(name)
    return out


def _node_func_name(graph, nodes, node_id):
    node = nodes.get(node_id)
    if not node:
        return None
    if node.get("funcName"):
        return node["funcName"]
    for fn in graph.get("functions") or []:
        if not isinstance(fn, dict):
            continue
        entry_id = fn.get("entryId")
        if entry_id and node_id == entry_id:
            return fn.get("name")
        frame_id = fn.get("frameId")
        if frame_id:
            for c in graph.get("comments") or []:
                if c.get("id") == frame_id:
                    x, y, w, h = c.get("x", 0), c.get("y", 0), c.get("w", 0), c.get("h", 0)
                    nx, ny = node.get("x", 0), node.get("y", 0)
                    if x <= nx <= x + w and y <= ny <= y + h:
                        return fn.get("name")
    return None


def _var_is_local(graph, nodes, node, fn_name=None):
    var = node.get("varName")
    if not var:
        return False
    if not fn_name:
        fn_name = _node_func_name(graph, nodes, node["id"])
    if not fn_name:
        return False
    fn = _func_by_name(graph).get(fn_name) or {}
    return var in _func_local_names(fn)


def _data_in_value(graph, nodes, node_id, to_port, cache):
    for e in graph.get("edges", []):
        if e.get("kind") != "data":
            continue
        if e.get("to") == node_id and e.get("toPort") == to_port:
            return _data_out_expr(graph, nodes, e["from"], e.get("fromPort", "value"), cache)
    return None


def _math_result_expr(t, p):
    op = {"add": "+", "subtract": "-", "multiply": "*", "divide": "/", "modulo": "%"}[t]
    return f"{p.get('a', '0')} {op} {p.get('b', '0')}"


def _cast_result_expr(t, value):
    if t == "cast_string":
        return (
            f"(lambda _v: __import__('json').dumps(_v) "
            f"if isinstance(_v, (dict, list)) else str(_v))({value})"
        )
    if t == "cast_int":
        return f"int({value})"
    if t == "cast_float":
        return f"float({value})"
    if t == "cast_bool":
        return (
            f"(lambda _v: str(_v).strip().lower() in ('1', 'true', 'yes', 'on') "
            f"if isinstance(_v, str) else bool(_v))({value})"
        )
    if t == "cast_list":
        return f"list({value})"
    if t == "cast_json":
        return (
            f"(lambda _v: __import__('json').loads(_v) "
            f"if isinstance(_v, str) else _v)({value})"
        )
    raise ValueError(f"unknown cast node: {t}")


def _data_out_expr(graph, nodes, node_id, from_port, cache):
    if node_id in cache and from_port in ("value", "result", "out"):
        return cache[node_id]
    node = nodes.get(node_id)
    if node is None:
        return "None"
    t = node["type"]
    cache_key = f"{node_id}:{from_port}"
    if cache_key in cache:
        return cache[cache_key]
    if t == "get_var":
        return node.get("varName") or "value"
    if t == "literal_number":
        expr = _literal_param(node, "value", "float")
        cache[cache_key] = expr
        return expr
    if t == "literal_string":
        expr = repr((node.get("params") or {}).get("value", ""))
        cache[cache_key] = expr
        return expr
    if t == "literal_bool":
        expr = _literal_param(node, "value", "bool")
        cache[cache_key] = expr
        return expr
    if t == "circuit_input":
        expr = _literal_param(node, "value", "bool")
        cache[cache_key] = expr
        return expr
    if t == "reroute":
        port = "in" if from_port == "out" else from_port
        expr = _data_in_value(graph, nodes, node_id, port, cache) or "None"
        cache[cache_key] = expr
        return expr
    if t == "func_entry":
        return from_port
    if t == "call_func":
        fn = _func_by_name(graph).get(node.get("funcName"))
        if fn and fn.get("returns") and from_port == "result":
            tmp = f"_call_{node['id'].replace('-', '_')}"
            cache[node_id] = tmp
            cache[cache_key] = tmp
            return tmp
    if t == "call_macro":
        port_key = f"{node_id}:{from_port}"
        if port_key in cache:
            return cache[port_key]
        outs = _call_macro_output_defs(node, graph)
        out_ports = {d["port"] for d in outs}
        if from_port in out_ports:
            tmp = f"_macro_{node['id'].replace('-', '_')}_{from_port}"
            cache[port_key] = tmp
            cache[node_id] = tmp
            return tmp
    defs = NODE_TYPES.get(t, {})
    data_outs = {d["port"]: d.get("type", "any") for d in (defs.get("dataOutputs") or [])}
    pure_data_types = (
        "literal_number", "literal_string", "literal_bool",
        "add", "subtract", "multiply", "divide", "modulo", "compare", "concat_text",
        "random_number", "length", "str_upper", "str_lower", "str_strip", "str_split",
        "str_replace", "str_contains", "list_get", "list_join", "list_map", "list_filter",
        "dict_get", "json_parse", "json_stringify", "json_get_key",
        "cast_string", "cast_int", "cast_float", "cast_bool", "cast_list", "cast_json",
        "now_timestamp", "format_now", "format_string", "regex_match",
        "math_min", "math_max", "math_abs", "math_round",
    )
    if from_port in data_outs or from_port == "result" or t in pure_data_types or data_outs:
        port = from_port if from_port in data_outs else "result"
        if port not in data_outs and t not in pure_data_types and t not in (
            "http_request", "read_text_file", "get_tasks", "get_days", "get_links",
        ):
            return "None"
        p = _resolved_params(graph, nodes, node, cache)
        if t in ("add", "subtract", "multiply", "divide", "modulo"):
            expr = _math_result_expr(t, p)
        elif t == "compare":
            expr = f"{p.get('a', '0')} {p.get('operator', '==')} {p.get('b', '0')}"
        elif t == "circuit_and":
            expr = f"bool({p.get('a', 'False')}) and bool({p.get('b', 'False')})"
        elif t in ("circuit_resistor", "circuit_led"):
            expr = f"bool({p.get('signal', 'False')})"
        elif t == "concat_text":
            expr = f"str({p.get('a', '""')}) + str({p.get('b', '""')})"
        elif t == "format_string":
            expr = f"str({p.get('template', '""')})"
        elif t == "regex_match":
            expr = f"bool(re.search({p.get('pattern', '""')}, str({p.get('value', '""')})))"
        elif t == "random_number":
            expr = f"random.randint({p.get('min', '0')}, {p.get('max', '100')})"
        elif t == "math_min":
            expr = f"min({p.get('a', '0')}, {p.get('b', '0')})"
        elif t == "math_max":
            expr = f"max({p.get('a', '0')}, {p.get('b', '0')})"
        elif t == "math_abs":
            expr = f"abs({p.get('value', '0')})"
        elif t == "math_round":
            expr = f"round({p.get('value', '0')})"
        elif t == "length":
            expr = f"len({p.get('value', '[]')})"
        elif t == "str_upper":
            expr = f"str({p.get('value', '""')}).upper()"
        elif t == "str_lower":
            expr = f"str({p.get('value', '""')}).lower()"
        elif t == "str_strip":
            expr = f"str({p.get('value', '""')}).strip()"
        elif t == "str_split":
            expr = f"str({p.get('value', '""')}).split({p.get('separator', '" "')})"
        elif t == "str_replace":
            expr = f"str({p.get('value', '""')}).replace({p.get('old', '""')}, {p.get('new', '""')})"
        elif t == "str_contains":
            expr = f"({p.get('substring', '""')}) in str({p.get('value', '""')})"
        elif t == "list_get":
            expr = f"({p.get('list_var', '[]')})[{p.get('index', '0')}]"
        elif t == "list_join":
            expr = f"{p.get('separator', '", "')}.join({p.get('list_var', '[]')})"
        elif t == "list_map":
            body = p.get("lambda_body", "x")
            expr = f"[({body}) for x in ({p.get('list_var', '[]')})]"
        elif t == "list_filter":
            body = p.get("lambda_body", "x")
            expr = f"[x for x in ({p.get('list_var', '[]')}) if ({body})]"
        elif t == "dict_get":
            expr = f"({p.get('dict_var', '{}')}).get({p.get('key', '""')})"
        elif t == "json_parse":
            expr = f"json.loads({p.get('value', '""')})"
        elif t == "json_get_key":
            expr = f"({p.get('value', '{}')}).get({p.get('key', '""')})"
        elif t == "json_stringify":
            expr = f"json.dumps({p.get('value', 'None')})"
        elif t.startswith("cast_"):
            expr = _cast_result_expr(t, p.get("value", "None"))
        elif t == "now_timestamp":
            expr = "datetime.datetime.now().isoformat()"
        elif t == "format_now":
            expr = f"datetime.datetime.now().strftime({p.get('format', '"%Y-%m-%d"')})"
        elif t == "read_text_file":
            path = _guard_path_expr(p.get("path", '""'))
            expr = f"open({path}, encoding='utf-8').read()"
        elif t == "http_request":
            hdrs = p.get("headers") or "{}"
            body = p.get("body") or "None"
            req = (
                f"requests.request({p.get('method', 'GET')}, {p.get('url', '')}, "
                f"headers={hdrs}, json={body})"
            )
            if port == "response_text":
                expr = f"({req}).text"
            elif port == "response_json":
                expr = f"({req}).json()"
            elif port == "status_code":
                expr = f"({req}).status_code"
            else:
                expr = req
        elif t == "get_tasks":
            expr = f"requests.get('{_WAYPOINT_API}/api/tasks').json()"
        elif t == "get_days":
            expr = f"requests.get('{_WAYPOINT_API}/api/days', params={{'limit': {p.get('limit', '30')}}}).json()"
        elif t == "get_links":
            expr = f"requests.get('{_WAYPOINT_API}/api/links').json()"
        else:
            expr = "None"
        cache[cache_key] = expr
        return expr
    return "None"


def _func_by_name(graph):
    out = {}
    for f in graph.get("functions") or []:
        if isinstance(f, dict) and isinstance(f.get("name"), str):
            out[f["name"]] = f
    return out


def _macro_by_id(graph):
    out = {}
    for m in graph.get("macros") or []:
        if isinstance(m, dict) and m.get("id"):
            out[m["id"]] = m
    return out


def _call_macro_param_defs(node, graph):
    macro = _macro_by_id(graph).get(node.get("macroId"))
    if not macro:
        return []
    return [
        {"name": i["name"], "type": i.get("type", "string"), "wire": True}
        for i in (macro.get("inputs") or [])
        if isinstance(i, dict) and isinstance(i.get("name"), str)
    ]


def _call_macro_output_defs(node, graph):
    macro = _macro_by_id(graph).get(node.get("macroId"))
    if not macro:
        return []
    return [
        {"port": o["name"], "type": o.get("type", "any")}
        for o in (macro.get("outputs") or [])
        if isinstance(o, dict) and isinstance(o.get("name"), str)
    ]


def _node_wireable_params(node, graph):
    """Return wireable data input pin definitions for a node."""
    t = node.get("type")
    if t == "set_var":
        vtype = _var_type_by_name(graph, node.get("varName")) if node.get("varName") else "string"
        return [{"name": "value", "type": vtype, "wire": True}]
    if t == "call_func" and node.get("funcName"):
        fn = _func_by_name(graph).get(node["funcName"], {})
        return [
            {"name": p["name"], "type": p.get("type", "string"), "wire": True}
            for p in (fn.get("params") or [])
            if isinstance(p, dict) and isinstance(p.get("name"), str)
        ]
    if t == "call_macro" and node.get("macroId"):
        return _call_macro_param_defs(node, graph)
    defs = NODE_TYPES.get(t, {})
    return [p for p in _norm_params(defs.get("params", [])) if p.get("wire")]


def _macro_has_recursive_call(macro, target_id, graph, visiting=None):
    """True if macro (transitively) contains call_macro to target_id."""
    if not macro or not isinstance(macro, dict):
        return False
    mid = macro.get("id")
    visiting = visiting or set()
    if mid in visiting:
        return False
    visiting = visiting | {mid}
    for n in macro.get("nodes") or []:
        if not isinstance(n, dict) or n.get("type") != "call_macro":
            continue
        called_id = n.get("macroId")
        if called_id == target_id:
            return True
        called = _macro_by_id(graph).get(called_id)
        if called and _macro_has_recursive_call(called, target_id, graph, visiting):
            return True
    return False


def _prefix_macro_graph(macro, prefix):
    """Return (nodes dict, edges_out dict) with id-prefixing for inline expansion."""
    nodes = {}
    for n in macro.get("nodes") or []:
        if not isinstance(n, dict) or not n.get("id"):
            continue
        nid = f"{prefix}{n['id']}"
        nodes[nid] = {**n, "id": nid}
    for inp in macro.get("inputs") or []:
        if not isinstance(inp, dict) or not inp.get("name"):
            continue
        vid = f"{prefix}__in_{inp['name']}"
        nodes[vid] = {"id": vid, "type": "macro_in", "params": {"name": inp["name"]}}
    edges_out = {}
    for e in macro.get("edges") or []:
        if e.get("kind") == "data":
            continue
        fid = e.get("from")
        tid = e.get("to")
        if not fid or not tid:
            continue
        pf = fid if fid.startswith("__") else f"{prefix}{fid}"
        pt = tid if tid.startswith("__") else f"{prefix}{tid}"
        edges_out.setdefault(pf, {})[e.get("fromPort", "next")] = pt
    return nodes, edges_out


def _macro_prefixed_data_edges(macro, prefix):
    """Data edges with prefixed node ids (boundary pseudo-nodes keep __ prefix)."""
    out = []
    for e in macro.get("edges") or []:
        if e.get("kind") != "data":
            continue
        fid, tid = e.get("from"), e.get("to")
        if not fid or not tid:
            continue
        pf = fid if str(fid).startswith("__") else f"{prefix}{fid}"
        pt = tid if str(tid).startswith("__") else f"{prefix}{tid}"
        out.append({**e, "from": pf, "to": pt})
    return out


def _macro_input_bindings(call_node, macro, prefix, graph, outer_nodes, cache):
    bindings = {}
    for inp in macro.get("inputs") or []:
        if not isinstance(inp, dict) or not inp.get("name"):
            continue
        iname = inp["name"]
        vid = f"{prefix}__in_{iname}"
        wired = _data_in_value(graph, outer_nodes, call_node["id"], iname, cache)
        if wired is not None:
            bindings[vid] = wired
        else:
            bindings[vid] = _literal_param(call_node, iname, inp.get("type", "string"))
    return bindings


def _macro_output_expr(macro, prefix, graph, macro_nodes, data_edges, cache, input_bindings, oname):
    out_sink = f"{prefix}__out_{oname}"
    for e in data_edges:
        if e.get("to") == out_sink:
            return _data_out_expr_macro(
                graph, macro_nodes, e["from"], e.get("fromPort", "result"),
                cache, input_bindings, data_edges,
            )
    return "None"


def _data_in_value_macro(graph, nodes, node_id, to_port, cache, input_bindings, data_edges):
    for e in data_edges:
        if e.get("to") == node_id and e.get("toPort") == to_port:
            return _data_out_expr_macro(
                graph, nodes, e["from"], e.get("fromPort", "value"), cache, input_bindings, data_edges,
            )
    return None


def _data_out_expr_macro(graph, nodes, node_id, from_port, cache, input_bindings, data_edges):
    if node_id in input_bindings:
        return input_bindings[node_id]
    node = nodes.get(node_id)
    if node is None:
        return "None"
    t = node.get("type")
    if t == "macro_in":
        vid = node_id
        if vid in input_bindings:
            return input_bindings[vid]
        return "None"
    cache_key = f"{node_id}:{from_port}"
    if cache_key in cache:
        return cache[cache_key]
    if t == "reroute":
        port = "in" if from_port == "out" else from_port
        expr = _data_in_value_macro(graph, nodes, node_id, port, cache, input_bindings, data_edges) or "None"
        cache[cache_key] = expr
        return expr
    if _is_pure(t):
        p = {}
        defs = NODE_TYPES.get(t, {})
        for pd in _norm_params(defs.get("params", [])):
            name = pd["name"]
            if pd.get("wire"):
                wired = _data_in_value_macro(graph, nodes, node_id, name, cache, input_bindings, data_edges)
                p[name] = wired if wired is not None else _literal_param(node, name, pd.get("type", "string"))
            else:
                p[name] = _literal_param(node, name, pd.get("type", "string"), identifier=True)
        if t in ("add", "subtract", "multiply", "divide", "modulo"):
            expr = _math_result_expr(t, p)
        elif t == "compare":
            expr = f"{p.get('a', '0')} {p.get('operator', '==')} {p.get('b', '0')}"
        elif t == "concat_text":
            expr = f"str({p.get('a', '""')}) + str({p.get('b', '""')})"
        elif t == "length":
            expr = f"len({p.get('value', '[]')})"
        else:
            mini_graph = {"nodes": list(nodes.values()), "edges": data_edges}
            expr = _data_out_expr(mini_graph, nodes, node_id, from_port, cache)
        cache[cache_key] = expr
        return expr
    return "None"


def _walk_macro_body(
    start_id, macro_nodes, macro_edges_out, data_edges, graph, outer_nodes,
    level, cache, input_bindings, macro_stack, stop_on_endif=False,
):
    """Walk exec chain inside an inlined macro body."""
    lines = []
    steps = {"n": 0}
    node_id = start_id

    def resolved_params(node):
        t = node["type"]
        if t == "set_var":
            var_name = node.get("varName")
            vtype = _var_type_by_name(graph, var_name) if var_name else "string"
            wired = _data_in_value_macro(graph, macro_nodes, node["id"], "value", cache, input_bindings, data_edges)
            if wired is not None:
                return {"value": wired}
            return {"value": _literal_param(node, "value", vtype)}
        defs = NODE_TYPES.get(t, {})
        params_def = _norm_params(defs.get("params", []))
        out = {}
        for pd in params_def:
            name = pd["name"]
            typ = pd.get("type", "string")
            if pd.get("wire"):
                wired = _data_in_value_macro(graph, macro_nodes, node["id"], name, cache, input_bindings, data_edges)
                out[name] = wired if wired is not None else _literal_param(node, name, typ)
            else:
                out[name] = _literal_param(node, name, typ, identifier=True)
        return out

    def emit_node_lines(node, lvl):
        t = node.get("type")
        if _is_pure(t):
            return []
        p = resolved_params(node)
        mini = {**node, "params": {**(node.get("params") or {}), **{
            k: v for k, v in p.items() if k not in (node.get("params") or {})
        }}}
        em = _emit(mini, lvl, graph, macro_nodes, cache)
        nid = node.get("id")
        if not em:
            return []
        if nid:
            return [f"{_indent(lvl)}# node:{nid}"] + em
        return em

    while node_id:
        steps["n"] += 1
        if steps["n"] > 5000:
            lines.append(f"{_indent(level)}# stopped: macro body loops")
            return lines
        node = macro_nodes.get(node_id)
        if node is None:
            return lines
        if _is_disabled(node):
            node_id = _bypass_disabled(node, macro_edges_out)
            continue
        t = node["type"]
        if t in ("start", "macro_in", "reroute"):
            node_id = macro_edges_out.get(node_id, {}).get("next")
            continue
        if _is_pure(t):
            node_id = macro_edges_out.get(node_id, {}).get("next")
            continue
        if t == "endif":
            if stop_on_endif:
                return lines
            node_id = macro_edges_out.get(node_id, {}).get("next")
            continue
        if t == "exec_gate":
            cond = resolved_params(node).get("open", "True")
            lines.append(f"{_indent(level)}# node:{node_id}")
            lines.append(f"{_indent(level)}if {cond}:")
            pass_target = macro_edges_out.get(node_id, {}).get("pass")
            if pass_target:
                lines.extend(_walk_macro_body(
                    pass_target, macro_nodes, macro_edges_out, data_edges, graph, outer_nodes,
                    level + 1, cache, input_bindings, macro_stack,
                    stop_on_endif=stop_on_endif,
                ))
            else:
                lines.append(f"{_indent(level + 1)}pass")
            return lines
        if t == "if":
            cond = resolved_params(node).get("condition", "True")
            lines.append(f"{_indent(level)}# node:{node_id}")
            lines.append(f"{_indent(level)}if {cond}:")
            true_target = macro_edges_out.get(node_id, {}).get("true")
            if true_target:
                lines.extend(_walk_macro_body(true_target, macro_nodes, macro_edges_out, data_edges, graph, outer_nodes, level + 1, cache, input_bindings, macro_stack, stop_on_endif=True))
            else:
                lines.append(f"{_indent(level + 1)}pass")
            false_target = macro_edges_out.get(node_id, {}).get("false")
            if false_target:
                lines.append(f"{_indent(level)}else:")
                lines.extend(_walk_macro_body(false_target, macro_nodes, macro_edges_out, data_edges, graph, outer_nodes, level + 1, cache, input_bindings, macro_stack, stop_on_endif=True))
            endif_id = node.get("pairId")
            node_id = macro_edges_out.get(endif_id, {}).get("next") if endif_id else None
            continue
        if t == "for":
            rp = resolved_params(node)
            var = rp.get("variable", "i")
            iterable = rp.get("iterable", "[]")
            lines.append(f"{_indent(level)}# node:{node_id}")
            lines.append(f"{_indent(level)}for {var} in {iterable}:")
            loop_target = macro_edges_out.get(node_id, {}).get("loop")
            if loop_target:
                lines.extend(_walk_macro_body(loop_target, macro_nodes, macro_edges_out, data_edges, graph, outer_nodes, level + 1, cache, input_bindings, macro_stack, stop_on_endif=True))
            else:
                lines.append(f"{_indent(level + 1)}pass")
            node_id = macro_edges_out.get(node_id, {}).get("done")
            continue
        if t == "while_loop":
            cond = resolved_params(node).get("condition", "True")
            lines.append(f"{_indent(level)}# node:{node_id}")
            lines.append(f"{_indent(level)}while {cond}:")
            loop_target = macro_edges_out.get(node_id, {}).get("loop")
            if loop_target:
                lines.extend(_walk_macro_body(loop_target, macro_nodes, macro_edges_out, data_edges, graph, outer_nodes, level + 1, cache, input_bindings, macro_stack, stop_on_endif=True))
            else:
                lines.append(f"{_indent(level + 1)}pass")
            node_id = macro_edges_out.get(node_id, {}).get("done")
            continue
        if t == "call_macro":
            lines.extend(_emit_call_macro(node, graph, outer_nodes, level, cache, macro_stack))
        else:
            lines.extend(emit_node_lines(node, level))
        node_id = macro_edges_out.get(node_id, {}).get("next")
    return lines


def _emit_call_macro(node, graph, outer_nodes, level, cache, macro_stack=None):
    macro_stack = list(macro_stack or [])
    macro_id = node.get("macroId")
    macro = _macro_by_id(graph).get(macro_id)
    if not macro:
        return [f'{_indent(level)}# unknown macro: {macro_id}']
    macro_name = macro.get("name") or macro_id
    if macro_id in macro_stack:
        chain = " -> ".join(macro_stack + [macro_id])
        return [f'{_indent(level)}# macro cycle detected: {chain} (skipped)']
    if _macro_has_recursive_call(macro, macro_id, graph):
        return [f'{_indent(level)}# macro {macro_name} contains recursive call_macro (skipped)']

    prefix = f"{node['id']}_"
    macro_nodes, macro_edges_out = _prefix_macro_graph(macro, prefix)
    data_edges = _macro_prefixed_data_edges(macro, prefix)
    input_bindings = _macro_input_bindings(node, macro, prefix, graph, outer_nodes, cache)

    lines = [f'{_indent(level)}# begin macro {macro_name}']
    start = next((n for n in macro_nodes.values() if n.get("type") == "start"), None)
    if start:
        lines.extend(_walk_macro_body(
            start["id"], macro_nodes, macro_edges_out, data_edges, graph, outer_nodes,
            level, cache, input_bindings, macro_stack + [macro_id],
        ))
    for out in macro.get("outputs") or []:
        if not isinstance(out, dict) or not out.get("name"):
            continue
        oname = out["name"]
        expr = _macro_output_expr(macro, prefix, graph, macro_nodes, data_edges, cache, input_bindings, oname)
        tmp = f"_macro_{node['id'].replace('-', '_')}_{oname}"
        lines.append(f"{_indent(level)}{tmp} = {expr}")
        cache[f"{node['id']}:{oname}"] = tmp
        if oname == "result" or len(macro.get("outputs") or []) == 1:
            cache[node["id"]] = tmp
    lines.append(f'{_indent(level)}# end macro {macro_name}')
    return lines


def _emit_call_func(node, graph, nodes, level, cache):
    fn_name = node.get("funcName") or "unknown"
    fn = _func_by_name(graph).get(fn_name, {})
    args = []
    for p in fn.get("params") or []:
        pname = p.get("name", "arg")
        wired = _data_in_value(graph, nodes, node["id"], pname, cache)
        if wired is not None:
            args.append(wired)
        else:
            args.append(repr((node.get("params") or {}).get(pname, "")))
    call = f"{fn_name}({', '.join(args)})"
    if fn.get("returns"):
        tmp = f"_call_{node['id'].replace('-', '_')}"
        cache[node["id"]] = tmp
        return [f"{_indent(level)}{tmp} = {call}"]
    return [f"{_indent(level)}{call}"]


def _emit_function_defs(graph, nodes, edges_out):
    funcs = [
        f for f in (graph.get("functions") or [])
        if isinstance(f, dict) and isinstance(f.get("name"), str)
        and f["name"].isidentifier() and not keyword.iskeyword(f["name"])
    ]
    if not funcs:
        return []

    lines = ["# User-defined functions", ""]
    steps = {"n": 0}

    def walk_fn(node_id, level, stop_id, body, fn_name=None):
        while node_id and node_id != stop_id:
            steps["n"] += 1
            if steps["n"] > 5000:
                body.append(f"{_indent(level)}# stopped: function body loops")
                return
            node = nodes.get(node_id)
            if node is None:
                return
            if _is_disabled(node):
                node_id = _bypass_disabled(node, edges_out)
                continue
            lbl = _exec_in_label(graph, node_id)
            if lbl:
                body.append(f"{_indent(level)}# {lbl}")
            t = node["type"]
            if t == "func_return":
                fn = _func_by_name(graph).get(node.get("funcName") or "")
                if fn and fn.get("returns"):
                    val = _data_in_value(graph, nodes, node_id, "return", {}) or "None"
                    body.append(f"{_indent(level)}return {val}")
                else:
                    body.append(f"{_indent(level)}return")
                return
            if t in ("func_entry", "reroute"):
                node_id = _exec_out(edges_out, node_id, "next")
                continue
            if _is_pure(t):
                node_id = _exec_out(edges_out, node_id, "next")
                continue
            if t == "exec_gate":
                cond = _resolved_params(graph, nodes, node, {}).get("open", "True")
                body.append(f"{_indent(level)}# node:{node_id}")
                body.append(f"{_indent(level)}if {cond}:")
                pass_target = _exec_out(edges_out, node_id, "pass")
                if pass_target:
                    walk_fn(pass_target, level + 1, stop_id, body, fn_name=fn_name)
                else:
                    body.append(f"{_indent(level + 1)}pass")
                return
            if t == "if":
                cond = _resolved_params(graph, nodes, node, {}).get("condition", "True")
                body.append(f"{_indent(level)}if {cond}:")
                true_target = _exec_out(edges_out, node_id, "true")
                if true_target:
                    walk_fn(true_target, level + 1, stop_id, body)
                else:
                    body.append(f"{_indent(level + 1)}pass")
                false_target = _exec_out(edges_out, node_id, "false")
                if false_target:
                    body.append(f"{_indent(level)}else:")
                    walk_fn(false_target, level + 1, stop_id, body)
                endif_id = node.get("pairId")
                node_id = _exec_out(edges_out, endif_id, "next") if endif_id else None
                continue
            if t == "for":
                rp = _resolved_params(graph, nodes, node, {})
                var = rp.get("variable", "i")
                iterable = rp.get("iterable", "[]")
                body.append(f"{_indent(level)}for {var} in {iterable}:")
                loop_target = _exec_out(edges_out, node_id, "loop")
                if loop_target:
                    walk_fn(loop_target, level + 1, stop_id, body)
                else:
                    body.append(f"{_indent(level + 1)}pass")
                node_id = _exec_out(edges_out, node_id, "done")
                continue
            if t == "while_loop":
                cond = _resolved_params(graph, nodes, node, {}).get("condition", "True")
                body.append(f"{_indent(level)}while {cond}:")
                loop_target = _exec_out(edges_out, node_id, "loop")
                if loop_target:
                    walk_fn(loop_target, level + 1, stop_id, body)
                else:
                    body.append(f"{_indent(level + 1)}pass")
                node_id = _exec_out(edges_out, node_id, "done")
                continue
            if t == "call_func":
                body.extend(_emit_call_func(node, graph, nodes, level, {}))
            elif t == "call_macro":
                body.extend(_emit_call_macro(node, graph, nodes, level, {}, macro_stack=[]))
            else:
                body.extend(_emit_node_lines(node, level, graph, nodes, {}, fn_name))
            node_id = _exec_out(edges_out, node_id, "next")

    for fn in funcs:
        name = fn["name"]
        params = [p["name"] for p in (fn.get("params") or [])
                  if isinstance(p, dict) and isinstance(p.get("name"), str)
                  and p["name"].isidentifier() and not keyword.iskeyword(p["name"])]
        sig = ", ".join(params)
        entry = next(
            (n for n in graph.get("nodes", [])
             if n.get("type") == "func_entry" and n.get("funcName") == name),
            None,
        )
        lines.append(f"def {name}({sig}):")
        body = []
        for loc in fn.get("locals") or []:
            if not isinstance(loc, dict):
                continue
            lname = loc.get("name")
            if not isinstance(lname, str) or not lname.isidentifier() or keyword.iskeyword(lname):
                continue
            body.append(f"    {lname} = {_default_literal(loc.get('type', 'string'), loc.get('default', ''))}")
        if entry:
            ret_id = entry.get("pairId")
            first = _exec_out(edges_out, entry["id"], "next")
            if first:
                walk_fn(first, 1, ret_id, body, fn_name=name)
        if not body:
            lines.append("    pass")
        else:
            lines.extend(body)
        lines.append("")

    return lines


_UI_WIDGET_TK = {
    "button": "tk.Button",
    "label": "tk.Label",
    "entry": "tk.Entry",
    "scale": "tk.Scale",
    "checkbutton": "tk.Checkbutton",
    "combobox": "ttk.Combobox",
    "progressbar": "ttk.Progressbar",
    "frame": "tk.Frame",
    "canvas": "tk.Canvas",
    "image": "tk.Label",
}


def _ui_bg_asset_upload_url(bg_asset):
    if not bg_asset:
        return ""
    if isinstance(bg_asset, dict):
        return str(bg_asset.get("assetUrl") or "")
    if isinstance(bg_asset, str) and bg_asset.startswith("/api/attachments/"):
        return bg_asset
    return ""


def _ui_bg_asset_builtin_key(bg_asset):
    if isinstance(bg_asset, str) and bg_asset and not bg_asset.startswith("/api/attachments/"):
        return bg_asset
    if isinstance(bg_asset, dict) and bg_asset.get("builtin"):
        return str(bg_asset["builtin"])
    return ""


def _ui_attachment_id_from_url(url):
    if not url or not isinstance(url, str):
        return None
    prefix = "/api/attachments/"
    if not url.startswith(prefix):
        return None
    rest = url[len(prefix):].split("/")[0]
    try:
        return int(rest)
    except ValueError:
        return None


def _ui_image_attachment_warnings(w):
    """Return warnings/comments for image widgets using uploaded attachments."""
    wid = w.get("id", "")
    props = w.get("props") or {}
    warnings = []
    src = props.get("imageSrc") or ""
    if src.startswith("/api/attachments/"):
        att_id = _ui_attachment_id_from_url(src)
        if att_id is not None:
            warnings.append(f"# image widget {wid}: downloads attachment {att_id} at startup (PNG/GIF only for PhotoImage)")
    bg_url = _ui_bg_asset_upload_url(props.get("bgAsset"))
    if bg_url:
        warnings.append(f"# texture/bg image on widget {wid}: not supported in tkinter export (fit/tint/blur omitted)")
    tex = props.get("bgTexture") or {}
    if tex and (props.get("bgAsset") or bg_url):
        for key in ("fit", "position", "opacity", "tint", "tintStrength", "blur"):
            if tex.get(key) not in (None, "", 0, 1, "cover", "center"):
                warnings.append(f"# bg texture {key} on widget {wid}: not supported in tkinter")
                break
    if props.get("imageFit") and props.get("imageFit") != "cover":
        warnings.append(f"# image fit mode {props.get('imageFit')} on widget {wid}: not supported in tkinter")
    return warnings


def _ui_screen_bg_warnings(graph):
    warnings = []
    ui = graph.get("ui") or {}
    for scr in ui.get("screens") or []:
        if not isinstance(scr, dict):
            continue
        bg = scr.get("background") or {}
        if bg.get("assetUrl") or bg.get("builtin"):
            warnings.append(f"# screen background on {scr.get('id', '?')}: not supported in tkinter export")
    return warnings


def _ui_widgets(graph):
    ui = graph.get("ui") or {}
    widgets = ui.get("widgets") or []
    return [w for w in widgets if isinstance(w, dict) and w.get("id")]


def _ui_effect_export_warnings(w):
    """Return per-widget comments for designer effects not representable in tkinter."""
    wid = w.get("id", "")
    warnings = []
    for fx in w.get("effects") or []:
        if not isinstance(fx, dict) or fx.get("enabled") is False:
            continue
        ftype = fx.get("type", "")
        if ftype in ("glow", "blur", "dropShadow", "backdropBlur", "colorFilter", "innerShadow"):
            warnings.append(f"# unsupported effect {ftype} on widget {wid}")
        elif ftype == "gradientFill":
            warnings.append(f"# gradient fill approximated as solid bg only for widget {wid}")
        elif ftype == "cornerRadius":
            warnings.append(f"# corner radius not supported in tkinter for widget {wid}")
    return warnings


def _ui_animation_export_warnings(w):
    """Return per-widget comments for designer animations omitted from codegen."""
    wid = w.get("id", "")
    warnings = []
    for anim in w.get("animations") or []:
        if not isinstance(anim, dict) or anim.get("enabled") is False:
            continue
        trigger = anim.get("trigger", "on_show")
        prop = anim.get("property", "opacity")
        warnings.append(f"# animation omitted: {trigger} {prop} on widget {wid}")
    return warnings


def _ui_collect_export_warnings(graph):
    """Aggregate designer export warnings for generated code header."""
    warnings = []
    warnings.extend(_ui_screen_bg_warnings(graph))
    for w in _ui_widgets(graph):
        warnings.extend(_ui_effect_export_warnings(w))
        warnings.extend(_ui_animation_export_warnings(w))
        warnings.extend(_ui_image_attachment_warnings(w))
    return warnings


def _ui_event_callback_name(widget_id, event):
    safe_w = "".join(c if c.isalnum() or c == "_" else "_" for c in str(widget_id))
    safe_e = "".join(c if c.isalnum() or c == "_" else "_" for c in str(event))
    return f"_on_{safe_w}_{safe_e}"


def _ui_label_updater_calls(graph):
    """Return _upd_<widget>() calls for labels bound to workflow variables."""
    calls = []
    for w in _ui_widgets(graph):
        props = w.get("props") or {}
        tv = props.get("textVariable") or props.get("text_variable")
        if w.get("type") != "label" or not tv:
            continue
        if not isinstance(tv, str) or not tv.isidentifier() or keyword.iskeyword(tv):
            continue
        calls.append(f"_upd_{w['id'].replace('-', '_')}()")
    return calls


def _emit_ui_callback_body(graph, nodes, edges_out, start_id, indent=2):
    """Emit exec-chain lines for a UI event handler (indented inside a method)."""
    lines = []
    steps = {"n": 0}
    data_cache = {}

    def walk(node_id, level):
        while node_id:
            steps["n"] += 1
            if steps["n"] > 5000:
                lines.append(f'{_indent(level)}# stopped: handler wiring loops')
                return
            node = nodes.get(node_id)
            if node is None:
                return
            if _is_disabled(node):
                node_id = _bypass_disabled(node, edges_out)
                continue
            lbl = _exec_in_label(graph, node_id)
            if lbl:
                lines.append(f'{_indent(level)}# {lbl}')
            t = node["type"]
            if t in ("start", "ui_event", "keyboard_event", "on_tick",
                     "func_entry", "func_return", "reroute"):
                node_id = edges_out.get(node_id, {}).get("next")
                continue
            if _is_pure(t):
                node_id = edges_out.get(node_id, {}).get("next")
                continue
            if t == "endif":
                node_id = edges_out.get(node_id, {}).get("next")
                continue
            if t == "exec_gate":
                cond = _resolved_params(graph, nodes, node, data_cache).get("open", "True")
                lines.append(f'{_indent(level)}# node:{node_id}')
                lines.append(f'{_indent(level)}if {cond}:')
                pass_target = edges_out.get(node_id, {}).get("pass")
                if pass_target:
                    walk(pass_target, level + 1)
                else:
                    lines.append(f'{_indent(level + 1)}pass')
                return
            if t == "if":
                cond = _resolved_params(graph, nodes, node, data_cache).get("condition", "True")
                lines.append(f'{_indent(level)}if {cond}:')
                true_target = edges_out.get(node_id, {}).get("true")
                if true_target:
                    walk(true_target, level + 1)
                else:
                    lines.append(f'{_indent(level + 1)}pass')
                false_target = edges_out.get(node_id, {}).get("false")
                if false_target:
                    lines.append(f'{_indent(level)}else:')
                    walk(false_target, level + 1)
                endif_id = node.get("pairId")
                node_id = edges_out.get(endif_id, {}).get("next") if endif_id else None
                continue
            if t == "for":
                rp = _resolved_params(graph, nodes, node, data_cache)
                var = rp.get("variable", "i")
                iterable = rp.get("iterable", "[]")
                lines.append(f'{_indent(level)}for {var} in {iterable}:')
                loop_target = edges_out.get(node_id, {}).get("loop")
                if loop_target:
                    walk(loop_target, level + 1)
                else:
                    lines.append(f'{_indent(level + 1)}pass')
                node_id = edges_out.get(node_id, {}).get("done")
                continue
            if t == "while_loop":
                cond = _resolved_params(graph, nodes, node, data_cache).get("condition", "True")
                lines.append(f'{_indent(level)}while {cond}:')
                loop_target = edges_out.get(node_id, {}).get("loop")
                if loop_target:
                    walk(loop_target, level + 1)
                else:
                    lines.append(f'{_indent(level + 1)}pass')
                node_id = edges_out.get(node_id, {}).get("done")
                continue
            if t == "call_func":
                lines.extend(_emit_call_func(node, graph, nodes, level, data_cache))
            elif t == "call_macro":
                lines.extend(_emit_call_macro(node, graph, nodes, level, data_cache, macro_stack=[]))
            else:
                lines.extend(_emit_node_lines(node, level, graph, nodes, data_cache))
            node_id = edges_out.get(node_id, {}).get("next")

    walk(start_id, indent)
    if not lines:
        lines.append(f'{_indent(indent)}pass')
    return lines


def _generate_ui_app(graph):
    """Emit tkinter app when graph.ui has widgets."""
    nodes = {n["id"]: n for n in graph.get("nodes", [])}
    edges_out = {}
    for e in graph.get("edges", []):
        if e.get("kind") == "data":
            continue
        edges_out.setdefault(e["from"], {})[e.get("fromPort", "next")] = e["to"]

    variables = [
        v for v in graph.get("variables", [])
        if isinstance(v, dict) and isinstance(v.get("name"), str)
        and v["name"].isidentifier() and not keyword.iskeyword(v["name"])
    ]

    lines = [
        "# Generated by Planner's Automation tab -- review before running.",
    ]
    export_warnings = _ui_collect_export_warnings(graph)
    if export_warnings:
        lines.append("# Export warnings (designer effects/animations not fully supported in tkinter):")
        for w in export_warnings:
            lines.append(w)
        lines.append("")
    lines.extend([
        "import tkinter as tk",
        "from tkinter import ttk",
        "",
    ])
    widgets = _ui_widgets(graph)
    image_downloads = []
    for w in widgets:
        props = w.get("props") or {}
        src = props.get("imageSrc") or ""
        if w.get("type") == "image" and src.startswith("/api/attachments/"):
            att_id = _ui_attachment_id_from_url(src)
            if att_id is not None:
                image_downloads.append((f"_img_{att_id}", src, att_id, w.get("id", "")))
    if image_downloads:
        lines.extend([
            "import os",
            "import tempfile",
            "import urllib.request",
            "",
            "def _download_ui_attachment(url, attachment_id):",
            "    suffix = os.path.splitext(url.split('?')[0])[1] or '.bin'",
            "    path = os.path.join(tempfile.gettempdir(), f'waypoint_ui_{attachment_id}{suffix}')",
            "    if not os.path.exists(path):",
            f"        urllib.request.urlretrieve('{_WAYPOINT_API}' + url, path)",
            "    return path",
            "",
        ])
    if variables:
        lines.append("# Workflow state variables")
        for v in variables:
            lines.append(f"{v['name']} = {_default_literal(v.get('type', 'string'), v.get('default', ''))}")
        lines.append("")

    fn_lines = _emit_function_defs(graph, nodes, edges_out)
    if fn_lines:
        lines.extend(fn_lines)

    lines.extend([
        "",
        "class GeneratedApp(tk.Tk):",
        "    def __init__(self):",
        "        super().__init__()",
        "        self._widgets = {}",
        "        self._blueprint_running = True",
        "        self.build_ui()",
        "        self.bind_events()",
        "",
        "    def build_ui(self):",
    ])

    for w in widgets:
        wid = w["id"]
        wtype = w.get("type", "label")
        props = w.get("props") or {}
        x, y = w.get("x", 0), w.get("y", 0)
        ww, wh = w.get("width", 80), w.get("height", 24)
        tk_cls = _UI_WIDGET_TK.get(wtype, "tk.Label")
        var_name = f"self._w_{wid.replace('-', '_')}"
        kwargs = []
        text = props.get("text", "")
        image_src = props.get("imageSrc") or ""
        if wtype == "image" and image_src.startswith("/api/attachments/"):
            att_id = _ui_attachment_id_from_url(image_src)
            img_var = f"self._img_{att_id}" if att_id is not None else None
            if img_var:
                lines.append(f"        # image widget {wid}: download attachment {att_id} for PhotoImage")
                lines.append(f"        _path_{att_id} = _download_ui_attachment({image_src!r}, {att_id})")
                lines.append(f"        _ext_{att_id} = os.path.splitext(_path_{att_id})[1].lower()")
                lines.append(f"        {img_var} = None")
                lines.append(f"        if _ext_{att_id} in ('.png', '.gif'):")
                lines.append(f"            try:")
                lines.append(f"                {img_var} = tk.PhotoImage(file=_path_{att_id})")
                lines.append(f"            except tk.TclError:")
                lines.append(f"                pass  # fallback to text placeholder below")
                lines.append(f"        else:")
                lines.append(f"            pass  # format not supported by tk.PhotoImage; convert to PNG")
                lines.append(f"        if {img_var}:")
                lines.append(f"            {var_name} = {tk_cls}(self, image={img_var}){f'  # designer id: {wid}'}")
                lines.append(f"            {var_name}.image = {img_var}  # keep reference")
                lines.append(f"        else:")
                alt = props.get("imageAlt") or text or "Image"
                lines.append(f"            {var_name} = {tk_cls}(self, text={alt!r})  # image placeholder; designer id: {wid}")
            else:
                if wtype in ("button", "label", "checkbutton", "image"):
                    kwargs.append(f"text={text!r}")
        elif wtype in ("button", "label", "checkbutton", "image"):
            kwargs.append(f"text={text!r}")
        if wtype == "entry":
            kwargs.append(f"textvariable=tk.StringVar(value={text!r})")
        if wtype == "scale":
            kwargs.append(f"from_={props.get('min', 0)}")
            kwargs.append(f"to={props.get('max', 100)}")
        if wtype == "combobox":
            values = props.get("values") or []
            kwargs.append(f"values={values!r}")
            if text:
                kwargs.append(f"text={text!r}")
        if wtype == "progressbar":
            kwargs.append("mode='determinate'")
            kwargs.append(f"maximum={props.get('max', 100)}")
            kwargs.append(f"value={props.get('value', 0)}")
        if props.get("bg"):
            kwargs.append(f"bg={props['bg']!r}")
        elif _ui_bg_asset_builtin_key(props.get("bgAsset")):
            lines.append(f"        # texture/bg asset on widget {wid}: approximated — tkinter cannot render designer textures")
        elif _ui_bg_asset_upload_url(props.get("bgAsset")):
            lines.append(f"        # uploaded texture on widget {wid}: not supported in tkinter export")
        if props.get("fg"):
            kwargs.append(f"fg={props['fg']!r}")
        kw = ", ".join(kwargs)
        comment = f"  # designer id: {wid}"
        effect_comments = _ui_effect_export_warnings(w)
        anim_comments = _ui_animation_export_warnings(w)
        img_comments = _ui_image_attachment_warnings(w)
        for c in effect_comments + anim_comments + img_comments:
            if c.startswith("# unsupported") or c.startswith("# animation") or c.startswith("# image fit") or c.startswith("# bg texture") or c.startswith("# texture/bg"):
                lines.append(f"        {c}")
        if wtype == "image" and image_src.startswith("/api/attachments/") and _ui_attachment_id_from_url(image_src) is not None:
            pass  # widget already emitted above
        elif kw:
            lines.append(f"        {var_name} = {tk_cls}(self, {kw}){comment}")
        else:
            lines.append(f"        {var_name} = {tk_cls}(self){comment}")
        lines.append(f"        {var_name}.place(x={x}, y={y}, width={ww}, height={wh})")
        lines.append(f"        self._widgets[{wid!r}] = {var_name}")
        tv = props.get("textVariable") or props.get("text_variable")
        if wtype == "label" and tv and isinstance(tv, str) and tv.isidentifier() and not keyword.iskeyword(tv):
            lines.append(f"        def _upd_{wid.replace('-', '_')}(*_a):")
            lines.append(f"            {var_name}.config(text=str({tv}))")
            lines.append(f"        _upd_{wid.replace('-', '_')}()")
        lines.append("")

    lines.append("    def bind_events(self):")
    bound = False
    handler_defs = []
    label_updaters = _ui_label_updater_calls(graph)
    callback_global = (
        "    global " + ", ".join(v["name"] for v in variables)
        if variables else None
    )
    for w in widgets:
        wid = w["id"]
        events = w.get("events") or {}
        for ev_name, binding in events.items():
            if not isinstance(binding, dict):
                continue
            node_id = binding.get("nodeId")
            if binding.get("binding") not in ("graph", "existing") or not node_id:
                continue
            node = nodes.get(node_id)
            if not node or node.get("type") != "ui_event":
                continue
            cb = _ui_event_callback_name(wid, ev_name)
            tk_ev = {"clicked": "<Button-1>", "toggled": "<Button-1>", "changed": "<<Changed>>",
                     "selected": "<<ComboboxSelected>>", "return_pressed": "<Return>"}.get(ev_name, f"<{ev_name}>")
            var_name = f"self._w_{wid.replace('-', '_')}"
            lines.append(f"        {var_name}.bind({tk_ev!r}, lambda e: {cb}())")
            bound = True
            body = _emit_ui_callback_body(graph, nodes, edges_out, node_id, indent=1)
            if callback_global:
                body.insert(0, callback_global)
            if label_updaters:
                body.extend([f"    {call}" for call in label_updaters])
            handler_defs.append((cb, body))

    start_node = next((n for n in nodes.values() if n.get("type") == "start"), None)
    if start_node and edges_out.get(start_node["id"], {}).get("next"):
        cb = "_on_blueprint_start"
        lines.append(f"        self.after(0, {cb})")
        bound = True
        body = _emit_ui_callback_body(graph, nodes, edges_out, start_node["id"], indent=1)
        if callback_global:
            body.insert(0, callback_global)
        if label_updaters:
            body.extend([f"    {call}" for call in label_updaters])
        handler_defs.append((cb, body))

    for node in nodes.values():
        if node.get("type") != "keyboard_event":
            continue
        key = str((node.get("params") or {}).get("key") or "").strip()
        if not key or key.lower() in ("click", "pointer"):
            continue
        safe = re.sub(r"\W+", "_", node["id"])
        cb = f"_on_key_{safe}"
        tk_key = "<space>" if key.lower() in ("space", "spacebar") else f"<{key}>"
        lines.append(f"        self.bind_all({tk_key!r}, lambda _e, _cb={cb}: _cb())")
        bound = True
        body = _emit_ui_callback_body(graph, nodes, edges_out, node["id"], indent=1)
        if callback_global:
            body.insert(0, callback_global)
        if label_updaters:
            body.extend([f"    {call}" for call in label_updaters])
        handler_defs.append((cb, body))

    for node in nodes.values():
        if node.get("type") != "on_tick":
            continue
        raw_interval = (node.get("params") or {}).get("interval_ms", 50)
        try:
            interval = max(16, int(raw_interval or 50))
        except (TypeError, ValueError):
            interval = 50
        safe = re.sub(r"\W+", "_", node["id"])
        cb = f"_on_tick_{safe}"
        lines.append(f"        self.after({interval}, {cb})")
        bound = True
        body = _emit_ui_callback_body(graph, nodes, edges_out, node["id"], indent=1)
        if callback_global:
            body.insert(0, callback_global)
        if label_updaters:
            body.extend([f"    {call}" for call in label_updaters])
        body.extend([
            "    if getattr(app, '_blueprint_running', False):",
            f"        app.after({interval}, {cb})",
        ])
        handler_defs.append((cb, body))
    if not bound:
        lines.append("        pass")
    lines.append("")

    for cb, body in handler_defs:
        lines.append(f"def {cb}():")
        if body:
            lines.extend(body)
        else:
            lines.append("    pass")
        lines.append("")

    lines.extend([
        "",
        "if __name__ == '__main__':",
        "    app = GeneratedApp()",
        "    app.mainloop()",
        "",
    ])
    return "\n".join(lines)


def generate_code(graph):
    """graph may include comments/notes/meta/ui; comments/notes/meta are ignored for codegen."""
    graph = graph or {}
    if _ui_widgets(graph):
        code = _generate_ui_app(graph)
        imports, body = _extract_imports(code.splitlines())
        sections = {"imports": imports, "main": body}
        return _organize_sectioned_code(graph, sections)
    _ = graph.get("comments")
    _ = graph.get("notes")
    _ = graph.get("meta")
    nodes = {n["id"]: n for n in graph.get("nodes", [])}
    edges_out = {}
    for e in graph.get("edges", []):
        if e.get("kind") == "data":
            continue
        edges_out.setdefault(e["from"], {})[e.get("fromPort", "next")] = e["to"]

    start = next((n for n in graph.get("nodes", []) if n["type"] in ("start", "keyboard_event")), None)
    sections = {"imports": [], "state": [], "functions": [], "main": []}

    variables = [
        v for v in graph.get("variables", [])
        if isinstance(v, dict) and isinstance(v.get("name"), str)
        and v["name"].isidentifier() and not keyword.iskeyword(v["name"])
    ]
    if variables:
        for v in variables:
            sections["state"].append(f"{v['name']} = {_default_literal(v.get('type', 'string'), v.get('default', ''))}")

    fn_lines = _emit_function_defs(graph, nodes, edges_out)
    if fn_lines:
        _, fn_body = _extract_imports(fn_lines)
        sections["functions"].extend(fn_body)

    if not start:
        if sections["functions"] or sections["state"]:
            return _organize_sectioned_code(graph, sections)
        return _organize_sectioned_code(graph, {"main": ["# Add a Start node and wire it to the rest of your graph to begin.", "pass"]})

    main_lines = []
    steps = {"n": 0}
    data_cache = {}

    def walk(node_id, level):
        while node_id:
            steps["n"] += 1
            if steps["n"] > 5000:
                main_lines.append(f"{_indent(level)}# stopped: the wiring loops back on itself")
                return
            node = nodes.get(node_id)
            if node is None:
                return
            if _is_disabled(node):
                node_id = _bypass_disabled(node, edges_out)
                continue
            lbl = _exec_in_label(graph, node_id)
            if lbl:
                main_lines.append(f"{_indent(level)}# {lbl}")
            t = node["type"]

            if t in ("start", "keyboard_event"):
                node_id = edges_out.get(node_id, {}).get("next")
                continue

            if t in ("func_entry", "func_return", "reroute", "ui_event"):
                node_id = edges_out.get(node_id, {}).get("next")
                continue

            if _is_pure(t):
                node_id = edges_out.get(node_id, {}).get("next")
                continue

            if t == "endif":
                node_id = edges_out.get(node_id, {}).get("next")
                continue

            if t == "exec_gate":
                cond = _resolved_params(graph, nodes, node, data_cache).get("open", "True")
                main_lines.append(f"{_indent(level)}# node:{node_id}")
                main_lines.append(f"{_indent(level)}if {cond}:")
                pass_target = edges_out.get(node_id, {}).get("pass")
                if pass_target:
                    walk(pass_target, level + 1)
                else:
                    main_lines.append(f"{_indent(level + 1)}pass")
                return

            if t == "if":
                cond = _resolved_params(graph, nodes, node, data_cache).get("condition", "True")
                main_lines.append(f"{_indent(level)}# node:{node_id}")
                main_lines.append(f"{_indent(level)}if {cond}:")
                true_target = edges_out.get(node_id, {}).get("true")
                if true_target:
                    walk(true_target, level + 1)
                else:
                    main_lines.append(f"{_indent(level + 1)}pass")
                false_target = edges_out.get(node_id, {}).get("false")
                if false_target:
                    main_lines.append(f"{_indent(level)}else:")
                    walk(false_target, level + 1)
                endif_id = node.get("pairId")
                node_id = edges_out.get(endif_id, {}).get("next") if endif_id else None
                continue

            if t == "for":
                rp = _resolved_params(graph, nodes, node, data_cache)
                var = rp.get("variable", "i")
                iterable = rp.get("iterable", "[]")
                main_lines.append(f"{_indent(level)}# node:{node_id}")
                main_lines.append(f"{_indent(level)}for {var} in {iterable}:")
                loop_target = edges_out.get(node_id, {}).get("loop")
                if loop_target:
                    walk(loop_target, level + 1)
                else:
                    main_lines.append(f"{_indent(level + 1)}pass")
                node_id = edges_out.get(node_id, {}).get("done")
                continue

            if t == "while_loop":
                cond = _resolved_params(graph, nodes, node, data_cache).get("condition", "True")
                main_lines.append(f"{_indent(level)}# node:{node_id}")
                main_lines.append(f"{_indent(level)}while {cond}:")
                loop_target = edges_out.get(node_id, {}).get("loop")
                if loop_target:
                    walk(loop_target, level + 1)
                else:
                    main_lines.append(f"{_indent(level + 1)}pass")
                node_id = edges_out.get(node_id, {}).get("done")
                continue

            if t == "call_func":
                main_lines.extend(_emit_call_func(node, graph, nodes, level, data_cache))
            elif t == "call_macro":
                main_lines.extend(_emit_call_macro(node, graph, nodes, level, data_cache, macro_stack=[]))
            else:
                main_lines.extend(_emit_node_lines(node, level, graph, nodes, data_cache))
            node_id = edges_out.get(node_id, {}).get("next")

    walk(start["id"], 0)
    if not any(l.strip() and not l.strip().startswith("#") for l in main_lines):
        main_lines.append("pass")
    sections["main"] = main_lines
    imports, state = _extract_imports(sections["state"])
    sections["imports"].extend(imports)
    sections["state"] = state
    imports, functions = _extract_imports(sections["functions"])
    sections["imports"].extend(imports)
    sections["functions"] = functions
    imports, main = _extract_imports(sections["main"])
    sections["imports"].extend(imports)
    sections["main"] = main
    sections["imports"] = sorted(set(sections["imports"]))
    return _organize_sectioned_code(graph, sections)


def generate_cpp(graph):
    """Emit a fail-soft C++ *scaffold* from the Blueprint graph (experimental).

    Strategy: generate the Python first (source of truth), then produce a C++ scaffold
    that mirrors control flow / prints / simple assigns. Complex nodes become TODOs.
    Studio nodes store fields on ``params`` (and ``varName``); never read dead ``props``.
    """
    try:
        py = generate_code(graph) or ""
    except Exception as exc:
        py = f"# Python codegen unavailable for this graph: {exc}"
    nodes = (graph or {}).get("nodes") or []
    edges = (graph or {}).get("edges") or []
    variables = [
        v for v in (graph or {}).get("variables") or []
        if isinstance(v, dict) and isinstance(v.get("name"), str) and v["name"].isidentifier()
    ]

    type_map = {
        "int": "long long",
        "integer": "long long",
        "float": "double",
        "number": "double",
        "bool": "bool",
        "boolean": "bool",
        "string": "std::string",
        "str": "std::string",
    }

    lines = [
        "// Auto-generated from Waypoint Blueprint — experimental C++ scaffold",
        "// NOT a full compiler. Source of truth is the Python export. Review TODOs.",
        "#include <iostream>",
        "#include <string>",
        "#include <vector>",
        "#include <cmath>",
        "#include <stdexcept>",
        "",
        "namespace waypoint {",
        "",
    ]

    for v in variables:
        ctype = type_map.get(str(v.get("type", "string")).lower(), "std::string")
        default = v.get("default", "")
        if ctype == "std::string":
            lit = json.dumps("" if default is None else str(default))
            lines.append(f"{ctype} {v['name']} = {lit};")
        elif ctype == "bool":
            truthy = str(default).strip().lower() in ("1", "true", "yes", "on")
            lines.append(f"{ctype} {v['name']} = {'true' if truthy else 'false'};")
        else:
            try:
                num = float(default) if default not in (None, "") else 0
                if ctype == "long long":
                    lines.append(f"{ctype} {v['name']} = {int(num)};")
                else:
                    lines.append(f"{ctype} {v['name']} = {num};")
            except (TypeError, ValueError):
                lines.append(f"{ctype} {v['name']} = 0;")

    if variables:
        lines.append("")

    lines.extend([
        "int run() {",
        "  try {",
    ])

    # Lightweight structural walk for common executable nodes.
    node_by_id = {n.get("id"): n for n in nodes if isinstance(n, dict) and n.get("id")}
    exec_out = {}
    for e in edges:
        if not isinstance(e, dict) or e.get("kind") == "data":
            continue
        exec_out.setdefault(e.get("from"), {})[e.get("fromPort", "next")] = e.get("to")

    start = next((n for n in nodes if n.get("type") in ("start", "keyboard_event")), None)
    visited = 0
    node_id = start.get("id") if start else None
    while node_id and visited < 400:
        visited += 1
        node = node_by_id.get(node_id)
        if not node:
            break
        t = node.get("type")
        # Studio graphs use params (+ varName); accept props only as a legacy fallback.
        params = node.get("params") if isinstance(node.get("params"), dict) else {}
        props = node.get("props") if isinstance(node.get("props"), dict) else {}
        fields = {**props, **params}
        if t in ("start", "keyboard_event", "on_tick", "func_entry", "func_return", "reroute", "ui_event", "endif"):
            node_id = exec_out.get(node_id, {}).get("next")
            continue
        if t == "print":
            msg = fields.get("message") or fields.get("text") or fields.get("value") or ""
            lines.append(f'    std::cout << {json.dumps(str(msg))} << std::endl;')
            node_id = exec_out.get(node_id, {}).get("next")
            continue
        if t in ("branch", "if", "if_branch"):
            cond = fields.get("condition") or fields.get("expr") or ""
            if cond:
                lines.append(f"    // TODO: branch on condition from graph: {cond}")
            else:
                lines.append("    // TODO: branch node has no condition wired")
            lines.append("    // if (…) { /* true */ } else { /* false */ }")
            node_id = exec_out.get(node_id, {}).get("true") or exec_out.get(node_id, {}).get("next")
            continue
        if t in ("assign", "set_var", "set_variable"):
            name = node.get("varName") or fields.get("name") or fields.get("variable") or "value"
            value = fields.get("value") or fields.get("expr") or '""'
            if str(name).isidentifier():
                lines.append(f"    // TODO: assign {name} = {value}")
            else:
                lines.append(f"    // TODO: assign (invalid name) = {value}")
            node_id = exec_out.get(node_id, {}).get("next")
            continue
        lines.append(f"    // TODO: translate node type '{t}' (id={node.get('id')})")
        node_id = exec_out.get(node_id, {}).get("next")

    lines.extend([
        "    return 0;",
        "  } catch (const std::exception& ex) {",
        '    std::cerr << "blueprint cpp runtime: " << ex.what() << std::endl;',
        "    return 1;",
        "  }",
        "}",
        "",
        "}  // namespace waypoint",
        "",
        "int main() {",
        "  return waypoint::run();",
        "}",
        "",
        "/* ---- Python source of truth (do not compile) ----",
        py,
        "---- end Python source ---- */",
        "",
    ])
    return "\n".join(lines)


def check_code(code):
    """Syntax-check generated Python without executing it."""
    try:
        compile(code or "", "<workflow>", "exec")
        return {"ok": True, "error": None, "error_line": None}
    except SyntaxError as exc:
        return {"ok": False, "error": exc.msg or str(exc), "error_line": exc.lineno}


def generate_and_check(graph):
    """Generate code and run a syntax self-check."""
    code = generate_code(graph)
    result = check_code(code)
    result["export_warnings"] = _ui_collect_export_warnings(graph)
    return {"code": code, **result}


def _build_line_node_map(code):
    """Map 1-based code line numbers to the most recent # node:<id> comment."""
    line_map = {}
    current_node = None
    for i, line in enumerate((code or "").splitlines(), 1):
        m = re.match(r"\s*# node:(\S+)", line)
        if m:
            current_node = m.group(1)
        line_map[i] = current_node
    return line_map


def _diagnostic(severity, message, *, node_id=None, edge_id=None, code_line=None, fix_hint=None):
    return {
        "severity": severity,
        "node_id": node_id,
        "edge_id": edge_id,
        "code_line": code_line,
        "message": message,
        "fix_hint": fix_hint,
    }


def _is_data_pin_wired(graph, node_id, port):
    for e in graph.get("edges") or []:
        if e.get("kind") == "data" and e.get("to") == node_id and e.get("toPort") == port:
            return True
    return False


def _has_literal_param(node, port):
    val = (node.get("params") or {}).get(port)
    return val is not None and str(val).strip() != ""


def _exec_entry_node_ids(graph):
    entries = []
    for n in graph.get("nodes") or []:
        if not isinstance(n, dict):
            continue
        if n.get("type") in ("start", "keyboard_event", "on_tick", "func_entry", "ui_event"):
            entries.append(n.get("id"))
    return [e for e in entries if e]


def _reachable_exec_node_ids(graph):
    nodes = {n["id"]: n for n in (graph.get("nodes") or []) if isinstance(n, dict) and n.get("id")}
    edges_out = {}
    for e in graph.get("edges") or []:
        if e.get("kind") == "data":
            continue
        edges_out.setdefault(e.get("from"), []).append(e.get("to"))
    reachable = set()
    queue = list(_exec_entry_node_ids(graph))
    while queue:
        nid = queue.pop(0)
        if not nid or nid in reachable:
            continue
        reachable.add(nid)
        for nxt in edges_out.get(nid, []):
            if nxt and nxt not in reachable:
                queue.append(nxt)
        node = nodes.get(nid)
        if node and node.get("type") == "if" and node.get("pairId"):
            endif_next = None
            for e in graph.get("edges") or []:
                if e.get("kind") == "data":
                    continue
                if e.get("from") == node["pairId"]:
                    endif_next = e.get("to")
                    break
            if endif_next and endif_next not in reachable:
                queue.append(endif_next)
    return reachable


def _function_is_empty(graph, fn):
    entry_id = fn.get("entryId")
    if not entry_id:
        return True
    ret_id = None
    for n in graph.get("nodes") or []:
        if n.get("type") == "func_entry" and n.get("id") == entry_id:
            ret_id = n.get("pairId")
            break
    if not ret_id:
        return True
    edges_out = {}
    for e in graph.get("edges") or []:
        if e.get("kind") == "data":
            continue
        edges_out.setdefault(e.get("from"), []).append(e.get("to"))
    visited = set()
    queue = []
    for e in graph.get("edges") or []:
        if e.get("kind") != "data" and e.get("from") == entry_id:
            queue.append(e.get("to"))
    body_nodes = set()
    while queue:
        nid = queue.pop(0)
        if not nid or nid == ret_id or nid in visited:
            continue
        visited.add(nid)
        node = next((n for n in graph.get("nodes") or [] if n.get("id") == nid), None)
        if not node:
            continue
        if node.get("type") not in ("func_entry", "func_return", "reroute"):
            body_nodes.add(nid)
        for nxt in edges_out.get(nid, []):
            if nxt and nxt not in visited:
                queue.append(nxt)
    return len(body_nodes) == 0


def diagnose_graph(graph):
    """Return structured diagnostics for a workflow graph."""
    graph = graph or {}
    diagnostics = []
    nodes = [n for n in (graph.get("nodes") or []) if isinstance(n, dict)]

    for n in nodes:
        t = n.get("type")
        if t not in NODE_TYPES:
            diagnostics.append(_diagnostic(
                "error", f"Unknown node type: {t}", node_id=n.get("id"),
            ))

    for n in nodes:
        if _node_meta(n).get("disabled"):
            diagnostics.append(_diagnostic(
                "info", "Node is disabled", node_id=n.get("id"),
            ))

    nodes_by_id = {n["id"]: n for n in nodes if n.get("id")}
    reachable = _reachable_exec_node_ids(graph)
    for n in nodes:
        t = n.get("type")
        if t not in NODE_TYPES or _is_pure(t):
            continue
        if t in ("func_return", "reroute"):
            continue
        if n.get("id") and n["id"] not in reachable and t not in ("start", "keyboard_event", "on_tick", "func_entry", "ui_event"):
            diagnostics.append(_diagnostic(
                "warning", "Exec node is unreachable from any entry point", node_id=n.get("id"),
            ))

    for n in nodes:
        for pd in _node_wireable_params(n, graph):
            port = pd["name"]
            if _is_data_pin_wired(graph, n["id"], port):
                continue
            if _has_literal_param(n, port):
                continue
            diagnostics.append(_diagnostic(
                "warning",
                f"Required data pin '{port}' is unwired and has no literal",
                node_id=n.get("id"),
                fix_hint="wire or set a literal",
            ))

    for fn in graph.get("functions") or []:
        if not isinstance(fn, dict):
            continue
        if _function_is_empty(graph, fn):
            diagnostics.append(_diagnostic(
                "info",
                f"Function '{fn.get('name', '?')}' has an empty body",
                node_id=fn.get("entryId"),
            ))

    macros = _macro_by_id(graph)
    for mid, macro in macros.items():
        if _macro_has_recursive_call(macro, mid, graph):
            diagnostics.append(_diagnostic(
                "error",
                f"Macro '{macro.get('name', mid)}' contains a recursive call_macro",
                node_id=None,
            ))

    for n in nodes:
        if n.get("type") != "call_macro":
            continue
        macro_id = n.get("macroId")
        if macro_id and macro_id not in macros:
            diagnostics.append(_diagnostic(
                "error", f"call_macro references unknown macro '{macro_id}'", node_id=n.get("id"),
            ))

    try:
        code = generate_code(graph)
        check = check_code(code)
        if not check["ok"]:
            line_map = _build_line_node_map(code)
            err_line = check.get("error_line")
            diagnostics.append(_diagnostic(
                "error",
                f"Generated code syntax error: {check.get('error')}",
                node_id=line_map.get(err_line) if err_line else None,
                code_line=err_line,
            ))
    except Exception as exc:
        diagnostics.append(_diagnostic("error", f"Code generation failed: {exc}"))

    ok = not any(d["severity"] == "error" for d in diagnostics)
    return {"ok": ok, "diagnostics": diagnostics}


def graph_health(graph):
    """Summarize graph structure and readiness."""
    graph = graph or {}
    nodes = [n for n in (graph.get("nodes") or []) if isinstance(n, dict)]
    edges = [e for e in (graph.get("edges") or []) if isinstance(e, dict)]
    diag = diagnose_graph(graph)

    unwired = []
    for d in diag["diagnostics"]:
        if d.get("severity") == "warning" and d.get("fix_hint") == "wire or set a literal" and d.get("node_id"):
            pin = None
            m = re.search(r"'([^']+)'", d.get("message") or "")
            if m:
                pin = m.group(1)
            unwired.append({"node_id": d["node_id"], "pin": pin})

    reachable = _reachable_exec_node_ids(graph)
    unreachable = [
        n["id"] for n in nodes
        if n.get("id") and n["id"] not in reachable
        and n.get("type") not in ("start", "keyboard_event", "on_tick", "func_entry", "ui_event")
        and not _is_pure(n.get("type"))
        and n.get("type") not in ("func_return", "reroute")
    ]

    disabled_count = sum(1 for n in nodes if _is_disabled(n))

    exec_edges = [e for e in edges if e.get("kind") != "data"]
    fanouts = []
    for n in nodes:
        nid = n.get("id")
        if nid:
            fanouts.append(sum(1 for e in exec_edges if e.get("from") == nid))
    avg_fanout = round(sum(fanouts) / len(fanouts), 2) if fanouts else 0.0

    screens = None
    ui = graph.get("ui")
    if isinstance(ui, dict):
        widgets = ui.get("widgets")
        if isinstance(widgets, list):
            screens = len(widgets)

    has_errors = any(d["severity"] == "error" for d in diag["diagnostics"])
    has_warnings = any(d["severity"] == "warning" for d in diag["diagnostics"])
    if has_errors:
        readiness = "blocked"
    elif has_warnings:
        readiness = "warnings"
    else:
        readiness = "ready"

    return {
        "counts": {
            "nodes": len(nodes),
            "edges": len(edges),
            "functions": len([f for f in (graph.get("functions") or []) if isinstance(f, dict)]),
            "macros": len([m for m in (graph.get("macros") or []) if isinstance(m, dict)]),
            "variables": len([v for v in (graph.get("variables") or []) if isinstance(v, dict)]),
            **({"screens": screens} if screens is not None else {}),
        },
        "unwired": unwired,
        "unreachable_node_ids": unreachable,
        "disabled_count": disabled_count,
        "avg_fanout": avg_fanout,
        "readiness": readiness,
    }


_WF_MD_FORMAT = 1
_WF_MD_NODE_RESERVED = frozenset({
    "id", "pos", "varName", "funcName", "macroId", "label", "pairId", "meta",
})
_WF_MD_SECTION_RE = re.compile(r"^# ([^\n]+)\n", re.MULTILINE)
_WF_MD_NODE_HEADING_RE = re.compile(r"^(?:## )?(.+?) \(`([^`]+)`\)\s*$")


def _wf_md_escape_cell(value):
    return str(value if value is not None else "").replace("|", "\\|").replace("\n", " ")


def _wf_md_quote_scalar(value):
    text = "" if value is None else str(value)
    if not text:
        return '""'
    if "\n" in text or text.startswith(("{", "[", '"')) or ":" in text:
        return json.dumps(text, ensure_ascii=False)
    if re.search(r"[\\#>|]", text):
        return json.dumps(text, ensure_ascii=False)
    return text


def _wf_md_parse_frontmatter(text):
    meta = {}
    body = text or ""
    if body.startswith("---"):
        end = body.find("\n---", 3)
        if end >= 0:
            block = body[3:end].strip()
            body = body[end + 4:].lstrip("\n")
            for line in block.splitlines():
                if ":" not in line:
                    continue
                key, val = line.split(":", 1)
                key = key.strip()
                val = val.strip()
                if key == "waypoint-blueprint":
                    continue
                if val.startswith('"') and val.endswith('"'):
                    val = json.loads(val)
                meta[key] = val
    return meta, body


def _wf_md_split_sections(body):
    matches = list(_WF_MD_SECTION_RE.finditer(body or ""))
    sections = {}
    for i, match in enumerate(matches):
        title = match.group(1).strip().lower()
        start = match.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(body)
        sections[title] = body[start:end].strip()
    return sections


def _wf_md_extract_json_block(section_text):
    if not section_text:
        return None
    match = re.search(r"```(?:json)?\s*\n(.*?)```", section_text, re.DOTALL)
    if not match:
        return None
    raw = match.group(1).strip()
    if not raw:
        return None
    return json.loads(raw)


def _wf_md_parse_table(section_text):
    rows = []
    for line in (section_text or "").splitlines():
        line = line.strip()
        if not line.startswith("|"):
            continue
        cells = [c.strip().replace("\\|", "|") for c in line.strip("|").split("|")]
        if not cells:
            continue
        if cells[0].lower() == "name":
            continue
        if all(re.fullmatch(r"-+", (c or "").strip()) for c in cells):
            continue
        rows.append(cells)
    return rows


def _wf_md_parse_bullets(block):
    """Parse `- key: value` bullets; multiline values use a following fenced block."""
    props = {}
    lines = (block or "").splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        if not line.startswith("- "):
            i += 1
            continue
        content = line[2:].strip()
        if ":" not in content:
            i += 1
            continue
        key, val = content.split(":", 1)
        key = key.strip()
        val = val.strip()
        if not val and i + 1 < len(lines) and lines[i + 1].strip().startswith("```"):
            i += 1
            fence = lines[i].strip()
            lang = fence[3:].strip()
            i += 1
            buf = []
            while i < len(lines) and not lines[i].strip().startswith("```"):
                buf.append(lines[i])
                i += 1
            val = "\n".join(buf)
            if lang == "json":
                try:
                    val = json.loads(val)
                except json.JSONDecodeError:
                    pass
            props[key] = val
        else:
            if val.startswith('"') and val.endswith('"'):
                try:
                    val = json.loads(val)
                except json.JSONDecodeError:
                    pass
            elif val in ("true", "false"):
                val = val == "true"
            props[key] = val
        i += 1
    return props


def _wf_md_node_label(node_type):
    return NODE_TYPES.get(node_type, {}).get("label") or node_type


def _wf_md_export_node(node):
    lines = [f"## {_wf_md_node_label(node.get('type'))} (`{node.get('type')}`)"]
    lines.append(f"- id: {node.get('id')}")
    lines.append(f"- pos: {int(node.get('x', 0))}, {int(node.get('y', 0))}")
    for key in ("varName", "funcName", "macroId", "label", "pairId"):
        if node.get(key):
            lines.append(f"- {key}: {_wf_md_quote_scalar(node[key])}")
    meta = node.get("meta")
    if isinstance(meta, dict):
        for mk, mv in sorted(meta.items()):
            if mv is not None and mv != "":
                lines.append(f"- meta.{mk}: {_wf_md_quote_scalar(mv)}")
    params = node.get("params") or {}
    for pk, pv in sorted(params.items()):
        text = "" if pv is None else str(pv)
        if "\n" in text:
            lines.append(f"- {pk}:")
            lines.append("```text")
            lines.extend(text.splitlines())
            lines.append("```")
        else:
            lines.append(f"- {pk}: {_wf_md_quote_scalar(pv)}")
    return "\n".join(lines)


def _wf_md_import_node(node_type, props):
    node = {
        "id": props.get("id"),
        "type": node_type,
        "x": 0,
        "y": 0,
        "params": {},
    }
    pos = props.get("pos")
    if isinstance(pos, str) and "," in pos:
        px, py = pos.split(",", 1)
        node["x"] = int(float(px.strip()))
        node["y"] = int(float(py.strip()))
    for key, val in props.items():
        if key in ("id", "pos"):
            continue
        if key in _WF_MD_NODE_RESERVED:
            if key == "meta" and isinstance(val, dict):
                node["meta"] = val
            else:
                node[key] = val
        elif key.startswith("meta."):
            node.setdefault("meta", {})
            node["meta"][key[5:]] = val
        else:
            node["params"][key] = val
    return node


def _wf_md_export_edge(edge):
    kind = edge.get("kind") or "exec"
    src = edge.get("from")
    dst = edge.get("to")
    from_port = edge.get("fromPort") or ("next" if kind == "exec" else "result")
    to_port = edge.get("toPort")
    src_part = f"`{src}`" if from_port in (None, "", "next") and kind == "exec" else f"`{src}`:`{from_port}`"
    if to_port:
        dst_part = f"`{dst}`:`{to_port}`"
    else:
        dst_part = f"`{dst}`"
    extra = []
    if edge.get("pinType"):
        extra.append(f"pinType={edge['pinType']}")
    if edge.get("label"):
        extra.append(f"label={json.dumps(edge['label'], ensure_ascii=False)}")
    suffix = f" _({', '.join(extra)})_" if extra else ""
    return f"- {src_part} -> {dst_part}{suffix}"


def _wf_md_parse_edge_line(line):
    line = line.strip()
    if not line.startswith("- "):
        return None
    core = line[2:].strip()
    extra = {}
    if " _(" in core:
        core, tail = core.rsplit(" _(", 1)
        tail = tail.rstrip(")_")
        for part in tail.split(","):
            part = part.strip()
            if "=" in part:
                ek, ev = part.split("=", 1)
                extra[ek.strip()] = ev.strip().strip('"')
    core = core.replace("`", "")
    match = re.match(r"^([^:\s]+)(?::([^\s]+))?\s*->\s*([^:\s]+)(?::([^\s]+))?\s*$", core)
    if not match:
        return None
    edge = {
        "from": match.group(1),
        "fromPort": match.group(2) or "next",
        "to": match.group(3),
    }
    if match.group(4):
        edge["toPort"] = match.group(4)
    if extra.get("pinType"):
        edge["pinType"] = extra["pinType"]
    if extra.get("label"):
        edge["label"] = extra["label"]
    return edge


def graph_to_markdown(graph, name=None):
    """Serialize a workflow graph to a human-readable Markdown document."""
    graph = graph or {}
    wf_name = (name or graph.get("name") or "Untitled workflow").strip()
    desc = graph.get("description")
    meta = graph.get("meta") if isinstance(graph.get("meta"), dict) else {}
    if not desc and isinstance(meta, dict):
        desc = meta.get("description")

    lines = [
        "---",
        f"waypoint-blueprint: {_WF_MD_FORMAT}",
        f'name: {json.dumps(wf_name, ensure_ascii=False)}',
    ]
    if desc:
        lines.append(f"description: {json.dumps(str(desc).strip(), ensure_ascii=False)}")
    lines.extend(["---", ""])

    variables = [v for v in (graph.get("variables") or []) if isinstance(v, dict)]
    lines.append("# Variables")
    lines.append("")
    if variables:
        lines.append("| name | type | default |")
        lines.append("| --- | --- | --- |")
        for var in variables:
            lines.append(
                f"| {_wf_md_escape_cell(var.get('name', ''))} "
                f"| {_wf_md_escape_cell(var.get('type', 'string'))} "
                f"| {_wf_md_escape_cell(var.get('default', ''))} |"
            )
    else:
        lines.append("_None._")
    lines.append("")

    functions = [f for f in (graph.get("functions") or []) if isinstance(f, dict)]
    lines.append("# Functions")
    lines.append("")
    if functions:
        for fn in functions:
            lines.append(f"## {fn.get('name', 'function')}")
            if fn.get("entryId"):
                lines.append(f"- entryId: {fn['entryId']}")
            if fn.get("returnId"):
                lines.append(f"- returnId: {fn['returnId']}")
            if fn.get("frameId"):
                lines.append(f"- frameId: {fn['frameId']}")
            if fn.get("returns") not in (None, False, ""):
                lines.append(f"- returns: {_wf_md_quote_scalar(fn['returns'])}")
            params = fn.get("params") or []
            if params:
                param_bits = [
                    f"{p.get('name')}:{p.get('type', 'any')}"
                    for p in params if isinstance(p, dict) and p.get("name")
                ]
                lines.append(f"- params: {', '.join(param_bits)}")
            locals_ = fn.get("locals") or []
            if locals_:
                local_bits = [
                    f"{l.get('name')}:{l.get('type', 'any')}"
                    for l in locals_ if isinstance(l, dict) and l.get("name")
                ]
                lines.append(f"- locals: {', '.join(local_bits)}")
            lines.append("")
    else:
        lines.append("_None._")
        lines.append("")

    nodes = [n for n in (graph.get("nodes") or []) if isinstance(n, dict)]
    lines.append("# Nodes")
    lines.append("")
    if nodes:
        for node in nodes:
            lines.append(_wf_md_export_node(node))
            lines.append("")
    else:
        lines.append("_None._")
        lines.append("")

    edges = [e for e in (graph.get("edges") or []) if isinstance(e, dict)]
    exec_edges = [e for e in edges if e.get("kind") != "data"]
    data_edges = [e for e in edges if e.get("kind") == "data"]
    lines.append("# Edges")
    lines.append("")
    lines.append("## Exec")
    lines.append("")
    if exec_edges:
        for edge in exec_edges:
            lines.append(_wf_md_export_edge(edge))
    else:
        lines.append("_None._")
    lines.append("")
    lines.append("## Data")
    lines.append("")
    if data_edges:
        for edge in data_edges:
            lines.append(_wf_md_export_edge({**edge, "kind": "data"}))
    else:
        lines.append("_None._")
    lines.append("")

    ui = graph.get("ui")
    lines.append("# UI")
    lines.append("")
    if ui:
        lines.append("```json")
        lines.append(json.dumps(ui, indent=2, ensure_ascii=False))
        lines.append("```")
    else:
        lines.append("_None._")
    lines.append("")

    for title, key, default in (
        ("Comments", "comments", []),
        ("Notes", "notes", []),
        ("Macros", "macros", []),
        ("Meta", "meta", {}),
    ):
        value = graph.get(key, default)
        lines.append(f"# {title}")
        lines.append("")
        if value:
            lines.append("```json")
            lines.append(json.dumps(value, indent=2, ensure_ascii=False))
            lines.append("```")
        else:
            lines.append("_None._")
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def markdown_to_graph(text):
    """Parse a Waypoint blueprint Markdown document back into a workflow graph."""
    front, body = _wf_md_parse_frontmatter(text or "")
    sections = _wf_md_split_sections(body)
    graph = {
        "nodes": [],
        "edges": [],
        "variables": [],
        "functions": [],
        "comments": [],
        "notes": [],
        "ui": {"widgets": [], "device": "phone"},
        "meta": {},
    }
    if front.get("name"):
        graph["name"] = front["name"]
    if front.get("description"):
        graph["description"] = front["description"]

    var_section = sections.get("variables", "")
    if var_section and "_none._" not in var_section.lower():
        for row in _wf_md_parse_table(var_section):
            if len(row) < 2:
                continue
            graph["variables"].append({
                "name": row[0],
                "type": row[1] if len(row) > 1 else "string",
                "default": row[2] if len(row) > 2 else "",
            })

    fn_section = sections.get("functions", "")
    if fn_section and "_none._" not in fn_section.lower():
        chunks = re.split(r"(?m)^## ", fn_section)
        for chunk in chunks:
            chunk = chunk.strip()
            if not chunk:
                continue
            name_line, _, rest = chunk.partition("\n")
            fn = {"name": name_line.strip(), "params": [], "locals": [], "returns": False}
            props = _wf_md_parse_bullets(rest)
            for key in ("entryId", "returnId", "frameId"):
                if props.get(key):
                    fn[key] = props[key]
            if props.get("returns") not in (None, ""):
                fn["returns"] = props["returns"]
            if props.get("params"):
                for bit in str(props["params"]).split(","):
                    bit = bit.strip()
                    if not bit:
                        continue
                    if ":" in bit:
                        pname, ptype = bit.split(":", 1)
                        fn["params"].append({"name": pname.strip(), "type": ptype.strip() or "any"})
                    else:
                        fn["params"].append({"name": bit, "type": "any"})
            if props.get("locals"):
                for bit in str(props["locals"]).split(","):
                    bit = bit.strip()
                    if not bit:
                        continue
                    if ":" in bit:
                        lname, ltype = bit.split(":", 1)
                        fn["locals"].append({"name": lname.strip(), "type": ltype.strip() or "any"})
                    else:
                        fn["locals"].append({"name": bit, "type": "any"})
            graph["functions"].append(fn)

    node_section = sections.get("nodes", "")
    if node_section and "_none._" not in node_section.lower():
        chunks = re.split(r"(?m)^## ", node_section)
        for chunk in chunks:
            chunk = chunk.strip()
            if not chunk:
                continue
            heading, _, rest = chunk.partition("\n")
            match = _WF_MD_NODE_HEADING_RE.match(heading.strip())
            if not match:
                continue
            node_type = match.group(2)
            props = _wf_md_parse_bullets(rest)
            node = _wf_md_import_node(node_type, props)
            if node.get("id") and node.get("type"):
                graph["nodes"].append(node)

    edge_section = sections.get("edges", "")
    if edge_section:
        subsections = {"exec": "", "data": ""}
        current = "exec"
        for line in edge_section.splitlines():
            stripped = line.strip().lower()
            if stripped == "## exec":
                current = "exec"
                continue
            if stripped == "## data":
                current = "data"
                continue
            subsections[current] += line + "\n"
        for kind, block in subsections.items():
            if not block.strip() or "_none._" in block.lower():
                continue
            for line in block.splitlines():
                edge = _wf_md_parse_edge_line(line)
                if not edge:
                    continue
                edge["kind"] = kind
                if kind == "data" and edge.get("fromPort") == "next":
                    edge["fromPort"] = edge.get("fromPort") or "result"
                graph["edges"].append(edge)

    ui_json = _wf_md_extract_json_block(sections.get("ui", ""))
    if ui_json is not None:
        graph["ui"] = ui_json

    comments_json = _wf_md_extract_json_block(sections.get("comments", ""))
    if comments_json is not None:
        graph["comments"] = comments_json

    notes_json = _wf_md_extract_json_block(sections.get("notes", ""))
    if notes_json is not None:
        graph["notes"] = notes_json

    macros_json = _wf_md_extract_json_block(sections.get("macros", ""))
    if macros_json is not None:
        graph["macros"] = macros_json

    meta_json = _wf_md_extract_json_block(sections.get("meta", ""))
    if meta_json is not None:
        graph["meta"] = meta_json
    elif front.get("description") and isinstance(graph.get("meta"), dict):
        graph["meta"].setdefault("description", front["description"])

    return graph
