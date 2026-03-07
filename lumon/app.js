(() => {
  const $ = (s) => document.querySelector(s);

  const boot = $("#boot");
  const game = $("#game");
  const bootBtn = $("#bootBtn");
  const bootlog = $("#bootlog");

  const gridEl = $("#grid");
  const overlayLine = $("#overlayLine");

  const progressFill = $("#progressFill");
  const resetBtn = $("#resetBtn");
  const scoreLine = $("#scoreLine");

  const binEls = {
    A: $("#binA"),
    B: $("#binB"),
    C: $("#binC"),
    D: $("#binD"),
  };

  const state = {
    sessionId: null,
    rows: 10,
    cols: 10,
    grid: [],
    selected: new Set(),
    refinedTotal: 0,
    refinedByBin: { A: 0, B: 0, C: 0, D: 0 },
    targetTotal: 120, // win-ish threshold
    lock: false
  };

  const BOOT_LINES = [
    "LUMINAL TERMINAL v0.9",
    "CALIBRATING DISPLAY....... OK",
    "LOADING REFINEMENT FIELD.. OK",
    "ESTABLISHING SESSION...... OK",
    "AWAITING OPERATOR INPUT..."
  ];

  function randInt(min, max){
    return Math.floor(Math.random()*(max-min+1))+min;
  }

  function makeSessionId(){
    const a = randInt(1000, 9999);
    const b = randInt(1000, 9999);
    return `${a}-${b}`;
  }

  function bootSequence(){
    bootlog.textContent = "";
    let i = 0;
    const tick = () => {
      if (i < BOOT_LINES.length){
        bootlog.textContent += (i ? "
" : "") + BOOT_LINES[i];
        i++;
        setTimeout(tick, 240);
      } else {
        startGame();
      }
    };
    tick();
  }

  function startGame(){
    state.sessionId = makeSessionId();
    $("#sessionLine").textContent = `SESSION: ${state.sessionId}`;
    boot.classList.add("hidden");
    game.classList.remove("hidden");

    newField();
    render();
    overlayLine.textContent = "SELECT A CLUSTER";
  }

  function newField(){
    state.grid = [];
    state.selected.clear();
    state.lock = false;

    for (let r=0; r<state.rows; r++){
      const row = [];
      for (let c=0; c<state.cols; c++){
        row.push({
          v: randInt(0, 999),
          // "vibe" is hidden: a few hot zones where numbers tend to be "stronger"
          heat: 0
        });
      }
      state.grid.push(row);
    }

    seedVibes();
  }

  function seedVibes(){
    // Create a few "clusters" by adding heat around random centers.
    const centers = randInt(3, 5);
    for (let k=0; k<centers; k++){
      const cr = randInt(1, state.rows-2);
      const cc = randInt(1, state.cols-2);
      const strength = randInt(2, 5);
      for (let r=cr-2; r<=cr+2; r++){
        for (let c=cc-2; c<=cc+2; c++){
          if (r<0||c<0||r>=state.rows||c>=state.cols) continue;
          const d = Math.abs(r-cr)+Math.abs(c-cc);
          const add = Math.max(0, strength - d);
          state.grid[r][c].heat += add;
        }
      }
    }
  }

  function render(){
    gridEl.innerHTML = "";
    for (let r=0; r<state.rows; r++){
      for (let c=0; c<state.cols; c++){
        const idx = r*state.cols + c;
        const cell = state.grid[r][c];
        const el = document.createElement("div");
        el.className = "cell";
        el.setAttribute("role","gridcell");
        el.dataset.r = r;
        el.dataset.c = c;

        const text = String(cell.v).padStart(3, "0");
        el.textContent = text;

        if (cell.heat >= 4) el.classList.add("pulse");
        if (state.selected.has(idx)) el.classList.add("selected");

        gridEl.appendChild(el);
      }
    }

    updateMeters();
  }

  function updateMeters(){
    const total = state.refinedTotal;
    const pct = Math.min(100, Math.round((total / state.targetTotal) * 100));
    progressFill.style.width = `${pct}%`;
    scoreLine.textContent = `REFINED: ${total}`;

    const sumBins = Math.max(1, state.refinedByBin.A + state.refinedByBin.B + state.refinedByBin.C + state.refinedByBin.D);
    for (const k of ["A","B","C","D"]){
      const p = Math.round((state.refinedByBin[k] / sumBins) * 100);
      binEls[k].textContent = `${p}%`;
    }
  }

  function idxOf(r,c){ return r*state.cols + c; }

  function neighbors(r,c){
    const out = [];
    const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
    for (const [dr,dc] of dirs){
      const rr = r+dr, cc = c+dc;
      if (rr>=0 && cc>=0 && rr<state.rows && cc<state.cols) out.push([rr,cc]);
    }
    return out;
  }

  function pickClusterFrom(r0,c0){
    // Flood-fill around "heat" similarity: feels like "vibe" rather than a rule.
    const base = state.grid[r0][c0].heat;
    const threshold = Math.max(1, base - 1);

    const q = [[r0,c0]];
    const seen = new Set([idxOf(r0,c0)]);
    const cluster = new Set();

    while (q.length){
      const [r,c] = q.shift();
      const id = idxOf(r,c);
      cluster.add(id);

      for (const [rr,cc] of neighbors(r,c)){
        const nid = idxOf(rr,cc);
        if (seen.has(nid)) continue;
        seen.add(nid);

        const h = state.grid[rr][cc].heat;
        const ok = h >= threshold && Math.abs(h - base) <= 2;
        if (ok) q.push([rr,cc]);
      }
      if (cluster.size > 18) break; // keep it snappy on mobile
    }

    // Small clusters feel bad; expand slightly to nearest heated cells.
    if (cluster.size < 5){
      for (let step=0; step<8; step++){
        const r = randInt(0,state.rows-1);
        const c = randInt(0,state.cols-1);
        const id = idxOf(r,c);
        if (state.grid[r][c].heat >= threshold+1) cluster.add(id);
        if (cluster.size >= 6) break;
      }
    }

    return cluster;
  }

  function clearSelection(){
    state.selected.clear();
    overlayLine.textContent = "SELECT A CLUSTER";
    render();
  }

  function refineTo(bin){
    if (state.selected.size === 0) return;

    // lock briefly for “terminal processing”
    state.lock = true;
    overlayLine.textContent = `REFINING → BIN ${bin}...`;

    const count = state.selected.size;

    setTimeout(() => {
      state.refinedTotal += count;
      state.refinedByBin[bin] += count;

      // Remove refined numbers: replace those cells with new numbers and jitter heat
      for (const id of state.selected){
        const r = Math.floor(id / state.cols);
        const c = id % state.cols;
        state.grid[r][c].v = randInt(0,999);
        state.grid[r][c].heat = Math.max(0, state.grid[r][c].heat + randInt(-1,1));
      }

      // Slowly “shift” the field so it feels alive
      if (Math.random() < 0.55) seedVibes();

      state.selected.clear();
      state.lock = false;

      overlayLine.textContent = "SELECT A CLUSTER";
      render();

      // Soft “win” state
      if (state.refinedTotal >= state.targetTotal){
        overlayLine.textContent = "QUOTA MET. CONTINUE REFINEMENT.";
      }
    }, 420);
  }

  function handleGridTap(e){
    const cell = e.target.closest(".cell");
    if (!cell || state.lock) return;

    const r = Number(cell.dataset.r);
    const c = Number(cell.dataset.c);

    const cluster = pickClusterFrom(r,c);
    state.selected = cluster;

    overlayLine.textContent = `${cluster.size} MARKED. SELECT BIN.`;
    render();

    // tiny haptic if available
    if (navigator.vibrate) navigator.vibrate(10);
  }

  function hardReset(){
    state.sessionId = makeSessionId();
    $("#sessionLine").textContent = `SESSION: ${state.sessionId}`;
    state.refinedTotal = 0;
    state.refinedByBin = { A: 0, B: 0, C: 0, D: 0 };
    newField();
    overlayLine.textContent = "SELECT A CLUSTER";
    render();
  }

  bootBtn.addEventListener("click", () => {
    bootBtn.disabled = true;
    bootBtn.textContent = "BOOTING...";
    bootSequence();
  });

  gridEl.addEventListener("click", handleGridTap);

  document.querySelectorAll(".bin").forEach(btn => {
    btn.addEventListener("click", () => refineTo(btn.dataset.bin));
  });

  resetBtn.addEventListener("click", hardReset);

  // initial boot screen content
  bootlog.textContent = "READY.
OPERATOR AUTH: GRANTED.
";
})();