(function () {
  "use strict";

  const CARD_ID = "waypoint-template-card";
  const STYLE_ID = "waypoint-template-styles";

  const FOUNDER = {
    id: "founder_cockpit",
    name: "Founder Ops Cockpit",
    emoji: "🚀",
    description: "Three daily levers — Build, Sell, and Learn. Each button adds a real task to Waypoint Tasks.",
  };

  const CALCULATOR = {
    id: "calculator",
    name: "Simple Calculator",
    emoji: "🧮",
    description: "Phone calculator UI wired with ui_event → set_var / math nodes. Digits, +, =, and C work out of the box.",
  };

  const FLAPPY = {
    id: "flappy_bird",
    name: "Blueprint Flappy",
    emoji: "🐦",
    description: "Blueprint Flappy — plays in Preview on the website.",
  };

  let graphSeq = 0;
  function gid(prefix) {
    graphSeq += 1;
    return `${prefix}_${graphSeq}`;
  }

  function resetGraphSeq() {
    graphSeq = 0;
  }

  function execEdge(from, to, fromPort) {
    return { from, fromPort: fromPort || "next", to, kind: "exec" };
  }

  function dataEdge(from, fromPort, to, toPort) {
    return { from, fromPort, to, toPort, kind: "data" };
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, ch => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[ch]));
  }

  function baseProps(overrides) {
    return Object.assign({
      text: "",
      bg: "",
      fg: "",
      fontSize: 12,
      visible: true,
      enabled: true,
      behavior: { draggable: false, dropZone: false, detectHover: false },
      states: {},
    }, overrides || {});
  }

  function widget(id, type, x, y, width, height, props, events) {
    return {
      id,
      type,
      parent: null,
      x,
      y,
      width,
      height,
      props: baseProps(props),
      events: events || {},
    };
  }

  function calcButton(id, label, col, row, accent) {
    const pad = 24;
    const gap = 8;
    const bw = 82;
    const bh = 72;
    const x = pad + col * (bw + gap);
    const y = 200 + row * (bh + gap);
    return widget(`${id}_btn`, "button", x, y, bw, bh, {
      name: `${label} button`,
      text: label,
      bg: accent || "#334155",
      fg: "#f8fafc",
      fontSize: 22,
      states: {
        hover: { bg: "#475569" },
        pressed: { bg: "#1e293b" },
      },
    }, {
      clicked: { binding: "graph", nodeId: `${id}_evt` },
    });
  }

  function makeDigitHandler(digit, keyId, widgetId, graphY) {
    const p = keyId;
    const evtId = `${p}_evt`;
    const getFreshId = `${p}_gf`;
    const ifId = `${p}_if`;
    const endifId = `${p}_endif`;
    const litDigId = `${p}_lit`;
    const setDispId = `${p}_sd`;
    const setFreshId = `${p}_sf`;
    const litFalseId = `${p}_lf`;
    const getDispId = `${p}_gd`;
    const concatId = `${p}_cat`;
    const setDisp2Id = `${p}_sd2`;

    const nodes = [
      {
        id: evtId,
        type: "ui_event",
        x: 40,
        y: graphY,
        params: { event: "clicked", widget_id: widgetId },
        label: `On_${widgetId}_clicked`,
      },
      { id: getFreshId, type: "get_var", x: 220, y: graphY - 30, varName: "fresh" },
      { id: ifId, type: "if", x: 420, y: graphY, params: {}, pairId: endifId },
      { id: endifId, type: "endif", x: 1180, y: graphY, params: {}, pairId: ifId },
      { id: litDigId, type: "literal_string", x: 620, y: graphY - 50, params: { value: digit } },
      { id: setDispId, type: "set_var", x: 820, y: graphY - 50, varName: "display", params: {} },
      { id: litFalseId, type: "literal_bool", x: 1020, y: graphY - 50, params: { value: "false" } },
      { id: setFreshId, type: "set_var", x: 1020, y: graphY - 10, varName: "fresh", params: {} },
      { id: getDispId, type: "get_var", x: 620, y: graphY + 50, varName: "display" },
      { id: `${litDigId}_b`, type: "literal_string", x: 620, y: graphY + 90, params: { value: digit } },
      { id: concatId, type: "concat_text", x: 820, y: graphY + 70, params: {} },
      { id: setDisp2Id, type: "set_var", x: 1020, y: graphY + 70, varName: "display", params: {} },
    ];

    const edges = [
      execEdge(evtId, ifId),
      dataEdge(getFreshId, "value", ifId, "condition"),
      execEdge(ifId, setDispId, "true"),
      dataEdge(litDigId, "result", setDispId, "value"),
      execEdge(setDispId, setFreshId),
      dataEdge(litFalseId, "result", setFreshId, "value"),
      execEdge(setFreshId, endifId),
      execEdge(ifId, setDisp2Id, "false"),
      dataEdge(getDispId, "value", concatId, "a"),
      dataEdge(`${litDigId}_b`, "result", concatId, "b"),
      dataEdge(concatId, "result", setDisp2Id, "value"),
      execEdge(setDisp2Id, endifId),
    ];

    return { nodes, edges };
  }

  function makeOperatorHandler(opSymbol, keyId, widgetId, graphY) {
    const safe = keyId;
    const evtId = `${safe}_evt`;
    const parseId = `${safe}_parse`;
    const litOpId = `${safe}_lit`;
    const setOpId = `${safe}_so`;
    const litFreshId = `${safe}_lf`;
    const setFreshId = `${safe}_sf`;

    const nodes = [
      {
        id: evtId,
        type: "ui_event",
        x: 40,
        y: graphY,
        params: { event: "clicked", widget_id: widgetId },
        label: `On_${widgetId}_clicked`,
      },
      {
        id: parseId,
        type: "custom",
        x: 260,
        y: graphY,
        params: { code: "accumulator = float(display)" },
      },
      { id: litOpId, type: "literal_string", x: 460, y: graphY - 20, params: { value: opSymbol } },
      { id: setOpId, type: "set_var", x: 660, y: graphY, varName: "operator", params: {} },
      { id: litFreshId, type: "literal_bool", x: 860, y: graphY, params: { value: "true" } },
      { id: setFreshId, type: "set_var", x: 1060, y: graphY, varName: "fresh", params: {} },
    ];

    const edges = [
      execEdge(evtId, parseId),
      execEdge(parseId, setOpId),
      dataEdge(litOpId, "result", setOpId, "value"),
      execEdge(setOpId, setFreshId),
      dataEdge(litFreshId, "result", setFreshId, "value"),
    ];

    return { nodes, edges };
  }

  function makeClearHandler(keyId, widgetId, graphY) {
    const evtId = `${keyId}_evt`;
    const steps = [
      { id: `${keyId}_sd`, varName: "display", lit: "0", litType: "literal_string" },
      { id: `${keyId}_sa`, varName: "accumulator", lit: "0", litType: "literal_number" },
      { id: `${keyId}_so`, varName: "operator", lit: "", litType: "literal_string" },
      { id: `${keyId}_sfv`, varName: "fresh", lit: "true", litType: "literal_bool" },
    ];
    const nodes = [{
      id: evtId,
      type: "ui_event",
      x: 40,
      y: graphY,
      params: { event: "clicked", widget_id: widgetId },
      label: `On_${widgetId}_clicked`,
    }];
    const edges = [];
    let prev = evtId;
    steps.forEach((step, idx) => {
      const litId = `${step.id}_lit`;
      nodes.push(
        { id: litId, type: step.litType, x: 260 + idx * 40, y: graphY - 30, params: { value: step.lit } },
        { id: step.id, type: "set_var", x: 460 + idx * 180, y: graphY, varName: step.varName, params: {} },
      );
      edges.push(execEdge(prev, step.id));
      edges.push(dataEdge(litId, "result", step.id, "value"));
      prev = step.id;
    });
    return { nodes, edges };
  }

  function makeEqualsHandler(keyId, widgetId, graphY) {
    const ops = [
      { sym: "+", math: "add" },
      { sym: "-", math: "subtract" },
      { sym: "*", math: "multiply" },
      { sym: "/", math: "divide" },
    ];
    const nodes = [];
    const edges = [];
    const evtId = `${keyId}_evt`;
    const parseId = `${keyId}_parse`;
    const litFreshId = `${keyId}_lf`;
    const setFreshId = `${keyId}_sf`;

    nodes.push(
      {
        id: evtId,
        type: "ui_event",
        x: 40,
        y: graphY,
        params: { event: "clicked", widget_id: widgetId },
        label: `On_${widgetId}_clicked`,
      },
      {
        id: parseId,
        type: "custom",
        x: 220,
        y: graphY,
        params: { code: "operand = float(display)" },
      },
      { id: litFreshId, type: "literal_bool", x: 1220, y: graphY + ops.length * 130, params: { value: "true" } },
      { id: setFreshId, type: "set_var", x: 1420, y: graphY + ops.length * 130, varName: "fresh", params: {} },
    );
    edges.push(execEdge(evtId, parseId));

    let prevExec = parseId;
    ops.forEach((op, idx) => {
      const cmpId = `${keyId}_cmp_${idx}`;
      const ifId = `${keyId}_if_${idx}`;
      const endifId = `${keyId}_endif_${idx}`;
      const mathId = `${keyId}_math_${idx}`;
      const setDispId = `${keyId}_sd_${idx}`;
      const litOpSym = `${keyId}_lsym_${idx}`;
      const getAccId = `${keyId}_ga_${idx}`;
      const getOperandId = `${keyId}_go_${idx}`;

      nodes.push(
        { id: `${keyId}_gop_${idx}`, type: "get_var", x: 420, y: graphY + idx * 130, varName: "operator" },
        { id: litOpSym, type: "literal_string", x: 620, y: graphY + idx * 130, params: { value: op.sym } },
        { id: cmpId, type: "compare", x: 820, y: graphY + idx * 130, params: { operator: "==" } },
        { id: ifId, type: "if", x: 1020, y: graphY + idx * 130, params: {}, pairId: endifId },
        { id: endifId, type: "endif", x: 1680, y: graphY + idx * 130, params: {}, pairId: ifId },
        { id: getAccId, type: "get_var", x: 1220, y: graphY + idx * 130 - 30, varName: "accumulator" },
        { id: getOperandId, type: "get_var", x: 1220, y: graphY + idx * 130 + 10, varName: "operand" },
        { id: mathId, type: op.math, x: 1420, y: graphY + idx * 130, params: {} },
        { id: setDispId, type: "set_var", x: 1580, y: graphY + idx * 130, varName: "display", params: {} },
      );

      edges.push(
        execEdge(prevExec, ifId),
        dataEdge(`${keyId}_gop_${idx}`, "value", cmpId, "a"),
        dataEdge(litOpSym, "result", cmpId, "b"),
        dataEdge(cmpId, "result", ifId, "condition"),
        execEdge(ifId, setDispId, "true"),
        dataEdge(getAccId, "value", mathId, "a"),
        dataEdge(getOperandId, "value", mathId, "b"),
        dataEdge(mathId, "result", setDispId, "value"),
        execEdge(setDispId, setFreshId),
      );
      prevExec = ifId;
      if (idx < ops.length - 1) {
        edges.push(execEdge(ifId, `${keyId}_if_${idx + 1}`, "false"));
      } else {
        edges.push(execEdge(ifId, setFreshId, "false"));
      }
    });
    edges.push(
      dataEdge(litFreshId, "result", setFreshId, "value"),
    );

    return { nodes, edges };
  }

  function buildCalculatorPayload() {
    resetGraphSeq();
    const keys = [
      { id: "k7", label: "7", col: 0, row: 0 },
      { id: "k8", label: "8", col: 1, row: 0 },
      { id: "k9", label: "9", col: 2, row: 0 },
      { id: "kplus", label: "+", col: 3, row: 0, accent: "#0ea5e9" },
      { id: "k4", label: "4", col: 0, row: 1 },
      { id: "k5", label: "5", col: 1, row: 1 },
      { id: "k6", label: "6", col: 2, row: 1 },
      { id: "kminus", label: "−", col: 3, row: 1, accent: "#0ea5e9" },
      { id: "k1", label: "1", col: 0, row: 2 },
      { id: "k2", label: "2", col: 1, row: 2 },
      { id: "k3", label: "3", col: 2, row: 2 },
      { id: "ktimes", label: "×", col: 3, row: 2, accent: "#0ea5e9" },
      { id: "k0", label: "0", col: 0, row: 3 },
      { id: "kclr", label: "C", col: 1, row: 3, accent: "#ef4444" },
      { id: "keq", label: "=", col: 2, row: 3, accent: "#22c55e" },
      { id: "kdiv", label: "÷", col: 3, row: 3, accent: "#0ea5e9" },
    ];

    const opMap = { "−": "-", "×": "*", "÷": "/" };
    const graphParts = [];
    let graphY = 60;

    keys.forEach(k => {
      if (/^\d$/.test(k.label)) {
        graphParts.push({ zone: "digits", ...makeDigitHandler(k.label, k.id, `${k.id}_btn`, graphY) });
        graphY += 100;
      } else if (k.label === "C") {
        graphParts.push({ zone: "clear", ...makeClearHandler(k.id, `${k.id}_btn`, graphY) });
        graphY += 100;
      } else if (k.label === "=") {
        graphParts.push({ zone: "equals", ...makeEqualsHandler(k.id, `${k.id}_btn`, graphY) });
        graphY += 520;
      } else {
        graphParts.push({ zone: "ops", ...makeOperatorHandler(opMap[k.label] || k.label, k.id, `${k.id}_btn`, graphY) });
        graphY += 100;
      }
    });

    const nodes = graphParts.flatMap(p => p.nodes);
    const edges = graphParts.flatMap(p => p.edges);

    function zoneBounds(zone) {
      const zs = graphParts.filter(p => p.zone === zone).flatMap(p => p.nodes);
      if (!zs.length) return null;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      zs.forEach(n => {
        minX = Math.min(minX, n.x);
        minY = Math.min(minY, n.y - 40);
        maxX = Math.max(maxX, n.x + 240);
        maxY = Math.max(maxY, n.y + 120);
      });
      return {
        x: minX - 28,
        y: minY - 36,
        w: Math.max(280, maxX - minX + 56),
        h: Math.max(120, maxY - minY + 48),
      };
    }

    const zoneMeta = [
      { zone: "digits", id: "c_calc_digits", title: "Digits", color: "#3987e5",
        body: "0–9 keys append to display (or replace when fresh=true)." },
      { zone: "ops", id: "c_calc_ops", title: "Operators", color: "#0ea5e9",
        body: "+ − × ÷ store the operator and mark the next digit as a fresh operand." },
      { zone: "clear", id: "c_calc_clear", title: "Clear", color: "#ef4444",
        body: "Reset display, accumulator, operator, and fresh flag." },
      { zone: "equals", id: "c_calc_equals", title: "Equals", color: "#22c55e",
        body: "Apply the pending operator to accumulator × operand and show the result." },
    ];
    const comments = zoneMeta.map(z => {
      const b = zoneBounds(z.zone);
      if (!b) return null;
      return {
        id: z.id,
        title: z.title,
        body: z.body,
        color: z.color,
        collapsed: false,
        x: b.x,
        y: b.y,
        w: b.w,
        h: b.h,
      };
    }).filter(Boolean);

    const ui = {
      device: { preset: "phone", w: 390, h: 844 },
      widgets: [
        widget("calc_backdrop", "frame", 0, 0, 390, 844, {
          name: "Calculator backdrop",
          bg: "#0f172a",
          fg: "#e2e8f0",
        }),
        widget("calc_title", "label", 24, 28, 342, 28, {
          name: "Title",
          text: "Simple Calculator",
          bg: "#0f172a",
          fg: "#94a3b8",
          fontSize: 13,
        }),
        widget("calc_display", "label", 24, 100, 342, 72, {
          name: "Display",
          text: "0",
          bg: "#1e293b",
          fg: "#f8fafc",
          fontSize: 32,
          textVariable: "display",
        }),
        ...keys.map(k => calcButton(k.id, k.label, k.col, k.row, k.accent)),
      ],
      folders: [],
      keybinds: [],
      view: { zoom: 0.85, panX: 40, panY: 24 },
    };

    return {
      name: CALCULATOR.name,
      graph: {
        nodes,
        edges,
        variables: [
          { name: "display", type: "string", default: "0" },
          { name: "accumulator", type: "float", default: "0" },
          { name: "operator", type: "string", default: "" },
          { name: "fresh", type: "bool", default: "true" },
          { name: "operand", type: "float", default: "0" },
        ],
        functions: [],
        comments,
        notes: [{
          id: "note_calc_stretch",
          x: 40,
          y: 12,
          text: "Expand zone comments (▸) for each band. MVP: digits + ops + = + C. See workflow_templates/calculator.py for a full Python reference.",
        }],
        ui,
        meta: {
          template_id: CALCULATOR.id,
          description: CALCULATOR.description,
        },
      },
    };
  }

  function buildFlappyBirdPayload() {
    resetGraphSeq();
    const nodes = [
      { id: "flappy_start", type: "start", x: 60, y: 60, params: {} },
      { id: "flappy_tick", type: "on_tick", x: 60, y: 300, params: { interval_ms: "50" } },
      {
        id: "flappy_flap_evt", type: "ui_event", x: 60, y: 740,
        params: { event: "clicked", widget_id: "flappy_flap_btn" },
        label: "On_flappy_flap_btn_clicked",
      },
      { id: "flappy_space_evt", type: "keyboard_event", x: 60, y: 860, params: { key: "Space" } },
      { id: "flappy_canvas_evt", type: "keyboard_event", x: 60, y: 980, params: { key: "click" } },

      { id: "flappy_status_flying", type: "literal_string", x: 260, y: 20, params: { value: "Flying! Click or press Space to flap." } },
      { id: "flappy_start_status", type: "set_var", x: 480, y: 60, varName: "status", params: {} },

      { id: "flappy_get_alive", type: "get_var", x: 260, y: 250, varName: "alive", params: {} },
      { id: "flappy_alive_if", type: "if", x: 480, y: 300, params: {} },
      { id: "flappy_get_vy", type: "get_var", x: 700, y: 220, varName: "bird_vy", params: {} },
      { id: "flappy_gravity", type: "literal_number", x: 700, y: 280, params: { value: "1.3" } },
      { id: "flappy_add_gravity", type: "add", x: 900, y: 250, params: {} },
      { id: "flappy_set_vy", type: "set_var", x: 1100, y: 300, varName: "bird_vy", params: {} },
      { id: "flappy_get_y", type: "get_var", x: 1280, y: 220, varName: "bird_y", params: {} },
      { id: "flappy_get_vy_new", type: "get_var", x: 1280, y: 280, varName: "bird_vy", params: {} },
      { id: "flappy_add_y", type: "add", x: 1480, y: 250, params: {} },
      { id: "flappy_set_y", type: "set_var", x: 1680, y: 300, varName: "bird_y", params: {} },
      { id: "flappy_get_y_widget", type: "get_var", x: 1860, y: 240, varName: "bird_y", params: {} },
      {
        id: "flappy_move_bird", type: "set_widget", x: 2060, y: 300,
        params: { widget_id: "flappy_bird", property: "y" },
      },

      { id: "flappy_get_pipe_x", type: "get_var", x: 2240, y: 220, varName: "pipe_x", params: {} },
      { id: "flappy_pipe_speed", type: "literal_number", x: 2240, y: 280, params: { value: "5" } },
      { id: "flappy_sub_pipe", type: "subtract", x: 2440, y: 250, params: {} },
      { id: "flappy_set_pipe_x", type: "set_var", x: 2640, y: 300, varName: "pipe_x", params: {} },
      { id: "flappy_get_pipe_cmp", type: "get_var", x: 2820, y: 220, varName: "pipe_x", params: {} },
      { id: "flappy_pipe_edge", type: "literal_number", x: 2820, y: 280, params: { value: "-80" } },
      { id: "flappy_pipe_cmp", type: "compare", x: 3020, y: 250, params: { operator: "<" } },
      { id: "flappy_pipe_if", type: "if", x: 3220, y: 300, params: {} },
      { id: "flappy_pipe_reset", type: "literal_number", x: 3400, y: 220, params: { value: "390" } },
      { id: "flappy_set_pipe_reset", type: "set_var", x: 3600, y: 250, varName: "pipe_x", params: {} },
      { id: "flappy_get_pipe_top", type: "get_var", x: 3800, y: 220, varName: "pipe_x", params: {} },
      {
        id: "flappy_move_pipe_top", type: "set_widget", x: 4000, y: 250,
        params: { widget_id: "flappy_pipe_top", property: "x" },
      },
      { id: "flappy_get_pipe_bottom", type: "get_var", x: 4200, y: 220, varName: "pipe_x", params: {} },
      {
        id: "flappy_move_pipe_bottom", type: "set_widget", x: 4400, y: 250,
        params: { widget_id: "flappy_pipe_bottom", property: "x" },
      },
      { id: "flappy_score_tick", type: "increment", x: 4620, y: 250, params: { variable: "score", amount: "1" } },

      { id: "flappy_get_ground_y", type: "get_var", x: 4820, y: 180, varName: "bird_y", params: {} },
      { id: "flappy_ground_y", type: "literal_number", x: 4820, y: 240, params: { value: "550" } },
      { id: "flappy_ground_cmp", type: "compare", x: 5020, y: 210, params: { operator: ">=" } },
      { id: "flappy_ground_if", type: "if", x: 5220, y: 250, params: {} },
      { id: "flappy_false", type: "literal_bool", x: 5400, y: 150, params: { value: "false" } },
      { id: "flappy_set_dead", type: "set_var", x: 5600, y: 200, varName: "alive", params: {} },
      { id: "flappy_game_over_text", type: "literal_string", x: 5800, y: 140, params: { value: "Game over — press Run to restart." } },
      { id: "flappy_set_game_over", type: "set_var", x: 6000, y: 200, varName: "status", params: {} },
      {
        id: "flappy_stop", type: "stop_preview", x: 6220, y: 200,
        params: { message: "Game over — press Run to restart." },
      },

      { id: "flappy_jump", type: "literal_number", x: 280, y: 800, params: { value: "-14" } },
      { id: "flappy_set_flap", type: "set_var", x: 500, y: 820, varName: "bird_vy", params: {} },
    ];
    nodes.forEach(node => {
      if (node.x >= 4800) {
        node.x -= 4760;
        node.y += 960;
      } else if (node.x >= 2200) {
        node.x -= 2160;
        node.y += 500;
      }
    });
    const inputPositions = {
      flappy_flap_evt: 1520,
      flappy_space_evt: 1640,
      flappy_canvas_evt: 1760,
      flappy_jump: 1560,
      flappy_set_flap: 1600,
    };
    nodes.forEach(node => {
      if (inputPositions[node.id] !== undefined) node.y = inputPositions[node.id];
    });

    const edges = [
      execEdge("flappy_start", "flappy_start_status"),
      dataEdge("flappy_status_flying", "result", "flappy_start_status", "value"),

      execEdge("flappy_tick", "flappy_alive_if"),
      dataEdge("flappy_get_alive", "value", "flappy_alive_if", "condition"),
      execEdge("flappy_alive_if", "flappy_set_vy", "true"),
      dataEdge("flappy_get_vy", "value", "flappy_add_gravity", "a"),
      dataEdge("flappy_gravity", "result", "flappy_add_gravity", "b"),
      dataEdge("flappy_add_gravity", "result", "flappy_set_vy", "value"),
      execEdge("flappy_set_vy", "flappy_set_y"),
      dataEdge("flappy_get_y", "value", "flappy_add_y", "a"),
      dataEdge("flappy_get_vy_new", "value", "flappy_add_y", "b"),
      dataEdge("flappy_add_y", "result", "flappy_set_y", "value"),
      execEdge("flappy_set_y", "flappy_move_bird"),
      dataEdge("flappy_get_y_widget", "value", "flappy_move_bird", "value"),

      execEdge("flappy_move_bird", "flappy_set_pipe_x"),
      dataEdge("flappy_get_pipe_x", "value", "flappy_sub_pipe", "a"),
      dataEdge("flappy_pipe_speed", "result", "flappy_sub_pipe", "b"),
      dataEdge("flappy_sub_pipe", "result", "flappy_set_pipe_x", "value"),
      execEdge("flappy_set_pipe_x", "flappy_pipe_if"),
      dataEdge("flappy_get_pipe_cmp", "value", "flappy_pipe_cmp", "a"),
      dataEdge("flappy_pipe_edge", "result", "flappy_pipe_cmp", "b"),
      dataEdge("flappy_pipe_cmp", "result", "flappy_pipe_if", "condition"),
      execEdge("flappy_pipe_if", "flappy_set_pipe_reset", "true"),
      dataEdge("flappy_pipe_reset", "result", "flappy_set_pipe_reset", "value"),
      execEdge("flappy_set_pipe_reset", "flappy_move_pipe_top"),
      execEdge("flappy_pipe_if", "flappy_move_pipe_top", "false"),
      dataEdge("flappy_get_pipe_top", "value", "flappy_move_pipe_top", "value"),
      execEdge("flappy_move_pipe_top", "flappy_move_pipe_bottom"),
      dataEdge("flappy_get_pipe_bottom", "value", "flappy_move_pipe_bottom", "value"),
      execEdge("flappy_move_pipe_bottom", "flappy_score_tick"),
      execEdge("flappy_score_tick", "flappy_ground_if"),
      dataEdge("flappy_get_ground_y", "value", "flappy_ground_cmp", "a"),
      dataEdge("flappy_ground_y", "result", "flappy_ground_cmp", "b"),
      dataEdge("flappy_ground_cmp", "result", "flappy_ground_if", "condition"),
      execEdge("flappy_ground_if", "flappy_set_dead", "true"),
      dataEdge("flappy_false", "result", "flappy_set_dead", "value"),
      execEdge("flappy_set_dead", "flappy_set_game_over"),
      dataEdge("flappy_game_over_text", "result", "flappy_set_game_over", "value"),
      execEdge("flappy_set_game_over", "flappy_stop"),

      execEdge("flappy_flap_evt", "flappy_set_flap"),
      execEdge("flappy_space_evt", "flappy_set_flap"),
      execEdge("flappy_canvas_evt", "flappy_set_flap"),
      dataEdge("flappy_jump", "result", "flappy_set_flap", "value"),
    ];

    return {
      name: FLAPPY.name,
      graph: {
        nodes,
        edges,
        variables: [
          { name: "score", type: "int", default: "0" },
          { name: "bird_y", type: "float", default: "300" },
          { name: "bird_vy", type: "float", default: "0" },
          { name: "pipe_x", type: "float", default: "360" },
          { name: "alive", type: "bool", default: "true" },
          { name: "status", type: "string", default: "Press Run, then click or press Space." },
        ],
        functions: [],
        comments: [
          {
            id: "c_flappy_physics",
            title: "Tick physics",
            body: "On Tick applies gravity and updates the bird widget's y position.",
            color: "#0ea5e9", collapsed: false, x: 32, y: 180, w: 2180, h: 360,
          },
          {
            id: "c_flappy_pipes",
            title: "Scrolling pipes + score",
            body: "Move both pipe widgets left, wrap them at the edge, and increment score while alive.",
            color: "#22c55e", collapsed: false, x: 32, y: 650, w: 2500, h: 400,
          },
          {
            id: "c_flappy_collision",
            title: "Ground collision",
            body: "When bird_y reaches the ground, set game-over state, toast the result, and stop the tick loop.",
            color: "#ef4444", collapsed: false, x: 32, y: 1080, w: 1540, h: 360,
          },
          {
            id: "c_flappy_input",
            title: "Flap input",
            body: "The UI button, Space, and a canvas click all set bird_vy to the jump impulse.",
            color: "#f7d308", collapsed: false, x: 32, y: 1480, w: 760, h: 430,
          },
        ],
        notes: [{
          id: "note_flappy_play",
          x: 80,
          y: 1940,
          text: "Run opens Preview in-browser. Click FLAP / the sky, or press Space. Run again after game over.",
        }],
        ui: {
          device: { preset: "phone", w: 390, h: 844 },
          widgets: [
            widget("flappy_backdrop", "frame", 0, 0, 390, 844, {
              name: "Flappy backdrop",
              bg: "#4ec0ca",
              fg: "#0f172a",
            }),
            widget("flappy_title", "label", 24, 48, 342, 40, {
              name: "Title",
              text: "🐦 Blueprint Flappy",
              bg: "#4ec0ca",
              fg: "#0f172a",
              fontSize: 26,
            }),
            widget("flappy_status", "label", 24, 94, 342, 40, {
              name: "Status",
              text: "Press Run, then click or press Space.",
              textVariable: "status",
              bg: "#4ec0ca",
              fg: "#134e4a",
              fontSize: 12,
            }),
            widget("flappy_score", "label", 280, 142, 86, 36, {
              name: "Score",
              text: "0",
              textVariable: "score",
              bg: "#f8fafc",
              fg: "#0f172a",
              fontSize: 22,
            }),
            widget("flappy_pipe_top", "frame", 360, 150, 72, 120, {
              name: "Top pipe",
              bg: "#22c55e",
              fg: "#14532d",
            }),
            widget("flappy_pipe_bottom", "frame", 360, 420, 72, 170, {
              name: "Bottom pipe",
              bg: "#22c55e",
              fg: "#14532d",
            }),
            widget("flappy_bird", "label", 72, 300, 52, 40, {
              name: "Bird",
              text: "🐤",
              bg: "#facc15",
              fg: "#0f172a",
              fontSize: 25,
            }),
            widget("flappy_ground", "frame", 0, 590, 390, 77, {
              name: "Ground",
              bg: "#84cc16",
              fg: "#365314",
            }),
            widget("flappy_flap_btn", "button", 110, 608, 170, 48, {
              name: "Flap",
              text: "FLAP",
              bg: "#f7d308",
              fg: "#0f172a",
              fontSize: 18,
              states: {
                hover: { bg: "#fde047" },
                pressed: { bg: "#eab308" },
              },
            }, { clicked: { binding: "graph", nodeId: "flappy_flap_evt" } }),
          ],
          folders: [],
          keybinds: [],
          view: { zoom: 0.9, panX: 20, panY: 20 },
        },
        meta: {
          template_id: FLAPPY.id,
          description: FLAPPY.description,
        },
      },
    };
  }

  function makeAction(column) {
    return [
      {
        id: `evt_${column.id}_clicked`,
        type: "ui_event",
        x: 80,
        y: column.nodeY,
        params: { event: "clicked", widget_id: `${column.id}_action_btn` },
        label: `On_${column.id}_action_btn_clicked`,
      },
      {
        id: `add_${column.id}_task`,
        type: "add_task",
        x: 360,
        y: column.nodeY,
        params: { title: column.taskTitle, notes: column.taskNotes },
      },
    ];
  }

  function makeColumn(column, index) {
    const x = 32 + index * 328;
    const y = 120;
    const accent = column.accent;
    const labelFg = column.fg || "#f1f5f9";
    const listBg = "#0f172a";
    return [
      widget(`${column.id}_panel`, "frame", x, y, 304, 632, {
        name: `${column.title} panel`,
        bg: column.panelBg,
        fg: labelFg,
      }),
      widget(`${column.id}_header`, "label", x + 20, y + 22, 264, 40, {
        name: `${column.title} header`,
        text: `${column.emoji} ${column.title}`,
        bg: column.panelBg,
        fg: labelFg,
        fontSize: 26,
      }),
      widget(`${column.id}_subtitle`, "label", x + 22, y + 64, 260, 36, {
        name: `${column.title} subtitle`,
        text: column.subtitle,
        bg: column.panelBg,
        fg: column.mutedFg,
        fontSize: 13,
      }),
      widget(`${column.id}_action_btn`, "button", x + 22, y + 112, 260, 60, {
        name: `${column.title} action`,
        text: column.buttonText,
        bg: accent,
        fg: "#0b1120",
        fontSize: 16,
        states: {
          hover: { bg: column.hover },
          pressed: { bg: column.pressed },
        },
      }, { clicked: { binding: "graph", nodeId: `evt_${column.id}_clicked` } }),
      widget(`${column.id}_metric_label`, "label", x + 22, y + 186, 260, 18, {
        name: `${column.title} metric label`,
        text: "Status",
        bg: column.panelBg,
        fg: "#64748b",
        fontSize: 11,
      }),
      widget(`${column.id}_metric`, "label", x + 22, y + 206, 260, 44, {
        name: `${column.title} metric`,
        text: column.metric,
        bg: listBg,
        fg: "#cbd5e1",
        fontSize: 13,
      }),
      widget(`${column.id}_list_panel`, "frame", x + 22, y + 266, 260, 300, {
        name: `${column.title} list panel`,
        bg: listBg,
        fg: labelFg,
      }),
      widget(`${column.id}_list_title`, "label", x + 38, y + 282, 228, 24, {
        name: `${column.title} list title`,
        text: column.listTitle,
        bg: listBg,
        fg: labelFg,
        fontSize: 14,
      }),
      widget(`${column.id}_list_item_1`, "label", x + 38, y + 318, 228, 34, {
        name: `${column.title} list item 1`,
        text: `1. ${column.items[0]}`,
        bg: listBg,
        fg: "#94a3b8",
        fontSize: 12,
      }),
      widget(`${column.id}_list_item_2`, "label", x + 38, y + 360, 228, 34, {
        name: `${column.title} list item 2`,
        text: `2. ${column.items[1]}`,
        bg: listBg,
        fg: "#94a3b8",
        fontSize: 12,
      }),
      widget(`${column.id}_list_item_3`, "label", x + 38, y + 402, 228, 34, {
        name: `${column.title} list item 3`,
        text: `3. ${column.items[2]}`,
        bg: listBg,
        fg: "#94a3b8",
        fontSize: 12,
      }),
      widget(`${column.id}_footer`, "label", x + 38, y + 458, 228, 88, {
        name: `${column.title} footer`,
        text: column.footer,
        bg: listBg,
        fg: accent,
        fontSize: 12,
      }),
    ];
  }

  function buildFounderCockpitPayload() {
    const columns = [
      {
        id: "build",
        title: "BUILD",
        emoji: "🛠",
        subtitle: "Ship one concrete artifact today",
        buttonText: "Add Build task",
        metric: "No build task yet — tap the button above",
        listTitle: "Suggested moves",
        items: ["Define the next deliverable", "Remove one blocker", "Publish the smallest proof"],
        footer: "→ Waypoint Tasks\nEach tap creates a task.\nBias: shipped beats perfect.",
        taskTitle: "Ship: <today's build task>",
        taskNotes: "Added from Founder Ops Cockpit BUILD action.",
        accent: "#38bdf8",
        hover: "#7dd3fc",
        pressed: "#0ea5e9",
        panelBg: "#0b1220",
        mutedFg: "#94a3b8",
        nodeY: 80,
      },
      {
        id: "sell",
        title: "SELL",
        emoji: "🤝",
        subtitle: "Create demand by talking to people",
        buttonText: "Add Sell task",
        metric: "No sell task yet — tap the button above",
        listTitle: "Suggested moves",
        items: ["Name one reachable customer", "Ask about an expensive pain", "Send the follow-up"],
        footer: "→ Waypoint Tasks\nEach tap creates a task.\nBias: conversations over guesses.",
        taskTitle: "Reach out to one customer",
        taskNotes: "Added from Founder Ops Cockpit SELL action.",
        accent: "#fbbf24",
        hover: "#fde68a",
        pressed: "#f59e0b",
        panelBg: "#1c1608",
        mutedFg: "#cbd5e1",
        nodeY: 220,
      },
      {
        id: "learn",
        title: "LEARN",
        emoji: "📚",
        subtitle: "Turn feedback into leverage",
        buttonText: "Add Learn task",
        metric: "No learn task yet — tap the button above",
        listTitle: "Suggested moves",
        items: ["Pick the bottleneck skill", "Study with a timer", "Write the new rule"],
        footer: "→ Waypoint Tasks\nEach tap creates a task.\nBias: evidence over vibes.",
        taskTitle: "30 minutes of deliberate study",
        taskNotes: "Added from Founder Ops Cockpit LEARN action.",
        accent: "#34d399",
        hover: "#86efac",
        pressed: "#10b981",
        panelBg: "#071812",
        mutedFg: "#a7f3d0",
        nodeY: 360,
      },
    ];
    const nodes = columns.flatMap(makeAction);
    const edges = columns.map(column => ({
      from: `evt_${column.id}_clicked`,
      fromPort: "next",
      to: `add_${column.id}_task`,
      kind: "exec",
    }));
    const ui = {
      device: { preset: "desktop", w: 1024, h: 768 },
      widgets: [
        widget("cockpit_backdrop", "frame", 0, 0, 1024, 768, {
          name: "Cockpit backdrop",
          bg: "#020617",
          fg: "#e2e8f0",
        }),
        widget("cockpit_hero_title", "label", 32, 18, 960, 34, {
          name: "Cockpit hero title",
          text: "Founder Ops Cockpit",
          bg: "#020617",
          fg: "#f8fafc",
          fontSize: 28,
        }),
        widget("cockpit_hero_subtitle", "label", 32, 52, 960, 28, {
          name: "Cockpit hero subtitle",
          text: "Daily founder OS — one action per column becomes a task.",
          bg: "#020617",
          fg: "#94a3b8",
          fontSize: 14,
        }),
        widget("cockpit_how_label", "label", 32, 84, 120, 20, {
          name: "How it works label",
          text: "How it works",
          bg: "#020617",
          fg: "#64748b",
          fontSize: 11,
        }),
        widget("cockpit_how_body", "label", 32, 100, 960, 22, {
          name: "How it works body",
          text: "Pick Build, Sell, or Learn → tap the button → a task lands in Waypoint Tasks.",
          bg: "#020617",
          fg: "#cbd5e1",
          fontSize: 12,
        }),
        ...columns.flatMap(makeColumn),
      ],
      folders: [],
      keybinds: [],
      view: { zoom: 0.72, panX: 92, panY: 36 },
    };
    const comments = columns.map(column => ({
      id: `c_founder_${column.id}`,
      title: `${column.title} flow`,
      body: `${column.subtitle}\n\nUI button → add_task creates “${column.taskTitle}” in Waypoint Tasks.`,
      color: column.accent,
      collapsed: false,
      x: 48,
      y: column.nodeY - 36,
      w: 520,
      h: 140,
    }));

    return {
      name: FOUNDER.name,
      graph: {
        nodes,
        edges,
        variables: [],
        functions: [],
        comments,
        notes: [{
          id: "note_founder_zones",
          x: 48,
          y: 12,
          text: "Zone comments mark Build / Sell / Learn. Collapse with ▸ — unused nodes stay dimmed until wired.",
        }],
        ui,
        meta: {
          template_id: FOUNDER.id,
          description: FOUNDER.description,
        },
      },
    };
  }

  const TEMPLATE_DEFS = [
    { ...FOUNDER, build: buildFounderCockpitPayload },
    { ...CALCULATOR, build: buildCalculatorPayload },
    { ...FLAPPY, build: buildFlappyBirdPayload },
  ];

  function templateCommands() {
    return window.WAYPOINT_TEMPLATES.map(template => ({
      id: `template-${template.id}`,
      title: `Install ${template.name}`,
      detail: template.description,
      keywords: `templates template install ${template.name} ${template.emoji}`,
      section: "Templates",
      run: () => window.installTemplate(template.id),
    }));
  }

  function tryRegisterCommandHook() {
    try {
      const commands = templateCommands();
      if (typeof window.registerCommandPaletteCommands === "function") {
        window.registerCommandPaletteCommands("Templates", commands);
      } else if (Array.isArray(window.WAYPOINT_COMMAND_PALETTE_COMMANDS)) {
        window.WAYPOINT_COMMAND_PALETTE_COMMANDS.push(...commands);
      }
    } catch (err) {
      console.debug("Waypoint template command hook unavailable", err);
    }
  }

  async function postJson(url, payload) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    let data = null;
    try {
      data = await res.json();
    } catch (_) {
      data = {};
    }
    if (!res.ok) {
      throw new Error(data && data.error ? data.error : `${url} failed with ${res.status}`);
    }
    return data;
  }

  function toast(message, kind) {
    if (typeof window.showToast === "function") {
      window.showToast(message, kind);
    } else {
      console.log(message);
    }
  }

  async function installTemplate(templateId) {
    const template = window.WAYPOINT_TEMPLATES.find(t => t.id === templateId);
    if (!template) throw new Error(`Unknown template: ${templateId}`);
    try {
      const payload = template.build();
      const workflow = await postJson("/api/workflows", payload);
      const app = await postJson("/api/apps", {
        name: template.name,
        emoji: template.emoji,
        workflow_id: workflow.id,
      });
      if (typeof window.refreshCustomApps === "function") {
        await window.refreshCustomApps();
      }
      const openHint = typeof window.openCustomApp === "function"
        ? "Use Open below, or find it on Home → My apps."
        : "Find it on Home → My apps.";
      toast(`Installed ${template.emoji} ${template.name}. ${openHint}`, "good");
      injectLauncherCard(workflow.id, templateId);
      return { workflow, app };
    } catch (err) {
      toast(`Template install failed: ${err.message}`, "warn");
      throw err;
    }
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .waypoint-template-card {
        margin-top: 18px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
        max-width: 520px;
        margin-left: auto;
        margin-right: auto;
        pointer-events: auto;
      }
      .waypoint-template-copy {
        text-align: center;
        color: var(--ink-secondary, #94a3b8);
        font: 400 12px/1.45 var(--font-body, system-ui, sans-serif);
      }
      .waypoint-template-copy strong {
        display: block;
        margin-bottom: 4px;
        color: var(--ink-primary, #e2e8f0);
        font-size: 13px;
        font-weight: 600;
      }
      .waypoint-template-pills {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        justify-content: center;
      }
      .waypoint-template-pill {
        border: 1px solid color-mix(in srgb, var(--accent, #e84a2f) 45%, var(--border));
        border-radius: 999px;
        padding: 9px 15px;
        background: color-mix(in srgb, var(--bg-card) 88%, var(--accent, #e84a2f));
        color: var(--ink-primary);
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.22);
        cursor: pointer;
        font: 600 13px var(--font-body, system-ui, sans-serif);
        letter-spacing: 0.01em;
      }
      .waypoint-template-pill:hover {
        transform: translateY(-1px);
        border-color: var(--accent, #e84a2f);
      }
      .waypoint-template-pill:disabled {
        cursor: wait;
        opacity: 0.68;
        transform: none;
      }
    `;
    document.head.appendChild(style);
  }

  function launcherInsertionPoint() {
    const myApps = document.querySelector(".launcher-my-apps");
    if (myApps && myApps.parentNode) {
      return { parent: myApps.parentNode, before: myApps.nextSibling };
    }
    const grid = document.getElementById("launcher-stage") || document.querySelector(".launcher-stage");
    if (grid && grid.parentNode) {
      return { parent: grid.parentNode, before: grid.nextSibling };
    }
    return null;
  }

  function setInstalledButtonState(button, workflowId, template) {
    button.disabled = false;
    button.dataset.installed = "1";
    button.dataset.workflowId = String(workflowId);
    button.textContent = `Open ${template.emoji} →`;
    button.title = `Opens your installed ${template.name}`;
  }

  function wireInstallButton(button, template) {
    button.addEventListener("click", async () => {
      if (button.dataset.installed === "1" && button.dataset.workflowId) {
        if (typeof window.openCustomApp === "function") {
          window.openCustomApp(button.dataset.workflowId);
        } else {
          toast(`Open Home → My apps to launch ${template.name}.`, "good");
        }
        return;
      }
      button.disabled = true;
      button.textContent = `Installing ${template.name}…`;
      try {
        const result = await window.installTemplate(template.id);
        setInstalledButtonState(button, result.workflow.id, template);
      } catch (_) {
        button.disabled = false;
        button.textContent = `${template.emoji} Install ${template.name}`;
        button.title = "";
      }
    });
  }

  function injectLauncherCard(installedWorkflowId, installedTemplateId) {
    const point = launcherInsertionPoint();
    if (!point) return;
    ensureStyles();
    let card = document.getElementById(CARD_ID);
    if (!card) {
      card = document.createElement("div");
      card.id = CARD_ID;
      card.className = "waypoint-template-card";
      const copy = document.createElement("div");
      copy.className = "waypoint-template-copy";
      copy.innerHTML = "<strong>Waypoint baselines</strong>Install editable starter apps — play them, then open in Automation Studio to change the graph or UI.";
      const pills = document.createElement("div");
      pills.className = "waypoint-template-pills";
      TEMPLATE_DEFS.forEach(template => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "waypoint-template-pill";
        button.id = `install-template-${template.id}`;
        button.dataset.templateId = template.id;
        button.textContent = `${template.emoji} Install ${template.name}`;
        wireInstallButton(button, template);
        pills.appendChild(button);
      });
      card.appendChild(copy);
      card.appendChild(pills);
      point.parent.insertBefore(card, point.before);
    }
    if (installedWorkflowId && installedTemplateId) {
      const button = card.querySelector(`#install-template-${installedTemplateId}`);
      const template = TEMPLATE_DEFS.find(t => t.id === installedTemplateId);
      if (button && template) setInstalledButtonState(button, installedWorkflowId, template);
    }
  }

  function initTemplateInjection() {
    injectLauncherCard();
    initFounderOpsStreak();
    if (!document.body || window.__waypointTemplateObserver) return;
    window.__waypointTemplateObserver = new MutationObserver(() => injectLauncherCard());
    window.__waypointTemplateObserver.observe(document.body, { childList: true, subtree: true });
  }

  const FOUNDER_OPS_STREAK_KEY = "founderOpsStreak";
  const FOUNDER_OPS_COLUMNS = {
    build_action_btn: {
      title: "Ship: today's build deliverable",
      notes: "Added from Founder Ops Cockpit BUILD action.",
    },
    sell_action_btn: {
      title: "Reach out to one customer",
      notes: "Added from Founder Ops Cockpit SELL action.",
    },
    learn_action_btn: {
      title: "30 minutes of deliberate study",
      notes: "Added from Founder Ops Cockpit LEARN action.",
    },
  };

  function founderOpsAddDays(iso, delta) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
  }

  function founderOpsReadStreak() {
    try { return JSON.parse(localStorage.getItem(FOUNDER_OPS_STREAK_KEY) || "null"); } catch (_) { return null; }
  }

  function founderOpsSaveStreak(data) {
    try { localStorage.setItem(FOUNDER_OPS_STREAK_KEY, JSON.stringify(data)); } catch (_) {}
  }

  function founderOpsAwardChest() {
    if (typeof showToast === "function") showToast("Founder Ops chest — 3-day streak!", "good");
    if (window.WaypointGame && typeof window.WaypointGame.awardXp === "function") {
      window.WaypointGame.awardXp(60, "Founder Ops chest");
    }
    try {
      const gems = Math.max(0, parseInt(localStorage.getItem("gameGems") || "0", 10) || 0);
      localStorage.setItem("gameGems", String(gems + 1));
    } catch (_) {}
  }

  function founderOpsRecordDayUse() {
    const today = typeof localYmd === "function" ? localYmd() : new Date().toISOString().slice(0, 10);
    let data = founderOpsReadStreak() || { lastDate: null, streak: 0, chest3At: null };
    if (data.lastDate === today) return data.streak;
    const yesterday = founderOpsAddDays(today, -1);
    data.streak = data.lastDate === yesterday ? (data.streak || 0) + 1 : 1;
    data.lastDate = today;
    if (data.streak === 3 && data.chest3At !== today) {
      data.chest3At = today;
      founderOpsAwardChest();
    }
    founderOpsSaveStreak(data);
    return data.streak;
  }

  async function founderOpsExecuteButton(widgetId) {
    const col = FOUNDER_OPS_COLUMNS[widgetId];
    if (!col || typeof api !== "function") return;
    await api("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: col.title, notes: col.notes }),
    });
    if (typeof showToast === "function") showToast("Task added", "good");
  }

  function initFounderOpsStreak() {
    if (window.__founderOpsStreakInit) return;
    window.__founderOpsStreakInit = true;

    if (typeof api === "function" && !window.__founderOpsApiHook) {
      window.__founderOpsApiHook = true;
      const origApi = api;
      window.api = async function (path, opts) {
        const result = await origApi.apply(this, arguments);
        if (path === "/api/tasks" && opts?.method === "POST") {
          try {
            const body = typeof opts.body === "string" ? JSON.parse(opts.body) : opts.body;
            if (body?.notes && String(body.notes).includes("Founder Ops Cockpit")) founderOpsRecordDayUse();
          } catch (_) {}
        }
        return result;
      };
    }

    document.addEventListener("click", e => {
      if (!window.CUSTOM_APP_VIEW) return;
      const wf = typeof CURRENT_WF !== "undefined" ? CURRENT_WF : null;
      if (wf?.meta?.template_id !== "founder_cockpit") return;
      const btn = e.target.closest(".uie-w-btn");
      if (!btn) return;
      const wid = btn.closest("[data-uie-widget]")?.dataset?.uieWidget;
      if (!wid || !FOUNDER_OPS_COLUMNS[wid]) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      founderOpsExecuteButton(wid).catch(() => {});
    }, true);
  }

  window.WAYPOINT_TEMPLATES = TEMPLATE_DEFS;
  window.WAYPOINT_TEMPLATE_COMMANDS = templateCommands;
  window.installTemplate = installTemplate;

  tryRegisterCommandHook();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initTemplateInjection, { once: true });
  } else {
    initTemplateInjection();
  }
})();
