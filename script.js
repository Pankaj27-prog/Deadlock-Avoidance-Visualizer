document.addEventListener('DOMContentLoaded', () => {

  let nodes = [], links = [], graphAdj = {};
  let processCount = 0, resourceCount = 0;
  let resourceHolder = {}, pendingRequests = {}, resourceCapacity = {};

  const logBox = document.getElementById('log');

  // Logging
  function log(msg, type = 'info') {
    const p = document.createElement('p');
    p.className = type === 'warn' ? 'warn' : 'info';
    const time = new Date().toLocaleTimeString();
    p.innerHTML = `<strong>[${time}]</strong> ${msg}`;
    logBox.prepend(p);
  }

  function clearLog() { logBox.innerHTML = ''; }
  function ensureNodeAdj(id) { if (!graphAdj[id]) graphAdj[id] = []; }

  function rebuildAdjFromLinks() {
    graphAdj = {};
    nodes.forEach(n => ensureNodeAdj(n.id));
    links.forEach(l => {
      const s = typeof l.source === 'string' ? l.source : l.source.id;
      const t = typeof l.target === 'string' ? l.target : l.target.id;
      if (s && t) { ensureNodeAdj(s); graphAdj[s].push(t); }
    });
  }

  function detectsCycleInAdj(adjMap) {
    const visited = new Set(), stack = new Set();
    function dfs(u) {
      if (stack.has(u)) return true;
      if (visited.has(u)) return false;
      visited.add(u); stack.add(u);
      for (let v of (adjMap[u] || [])) if (dfs(v)) return true;
      stack.delete(u); return false;
    }
    for (let nodeId in adjMap) if (!visited.has(nodeId) && dfs(nodeId)) return true;
    return false;
  }

  function hasCycleAfterAdding(tempFrom, tempTo) {
    const adj = {};
    for (let k in graphAdj) adj[k] = graphAdj[k].slice();
    if (!adj[tempFrom]) adj[tempFrom] = [];
    adj[tempFrom].push(tempTo);
    return detectsCycleInAdj(adj);
  }

  function nodeExists(id) { return nodes.some(n => n.id === id); }
  function getGraphSize() {
    const el = document.getElementById('graph');
    return { w: Math.max(200, el.clientWidth), h: Math.max(200, el.clientHeight) };
  }

  // Add Process
  function addProcess() {
    const id = 'P' + (++processCount);
    const { w, h } = getGraphSize();
    nodes.push({ id, type: 'P', x: Math.random() * (w - 120) + 60, y: Math.random() * (h - 120) + 60 });
    ensureNodeAdj(id); log(`Process ${id} added`);
    updateStats(); updateGraph();
  }

  // Add Resource
  function addResource() {
    const id = 'R' + (++resourceCount);
    const { w, h } = getGraphSize();
    nodes.push({ id, type: 'R', x: Math.random() * (w - 120) + 60, y: Math.random() * (h - 120) + 60 });
    ensureNodeAdj(id);

    const units = parseInt(prompt(`Enter number of instances for ${id}:`, "1"));
    resourceCapacity[id] = units > 0 ? units : 1;
    resourceHolder[id] = [];       // array of allocated processes
    pendingRequests[id] = [];      // queue of waiting processes

    log(`Resource ${id} added with ${resourceCapacity[id]} instance(s)`);
    updateStats(); updateGraph();
  }

  // Request Resource
  function requestResourceUI() {
    const process = prompt("Enter Process ID (e.g., P1):");
    const resource = prompt("Enter Resource ID (e.g., R1):");
    if (!process || !resource) return;
    if (!nodeExists(process) || !nodeExists(resource)) { alert("Invalid IDs"); return; }

    rebuildAdjFromLinks();
    if (hasCycleAfterAdding(process, resource)) {
      log(`${process}→${resource} denied (cycle)`, 'warn');
      return;
    }

    if (resourceHolder[resource].length < resourceCapacity[resource]) {
      links.push({ source: resource, target: process, type: 'alloc' });
      resourceHolder[resource].push(process);
      rebuildAdjFromLinks();
      log(`${process}→${resource} granted`);
    } else {
      links.push({ source: process, target: resource, type: 'request' });
      pendingRequests[resource].push(process);
      rebuildAdjFromLinks();
      log(`${process}→${resource} queued (busy)`);
    }

    updateStats(); updateGraph();
  }

  // Release Resource
  function releaseResourceUI() {
    const resource = prompt("Enter Resource ID to release (e.g., R1):");
    if (!resource || !nodeExists(resource) || nodes.find(n => n.id === resource).type !== 'R') {
      alert("Invalid Resource ID");
      return;
    }

    if (resourceHolder[resource].length === 0) {
      log(`${resource} has no allocated processes`, 'warn');
      return;
    }

    // Release first process holding the resource
    const holderProcess = resourceHolder[resource].shift();
    links = links.filter(l => !(l.type === 'alloc' && l.source === resource && l.target === holderProcess));
    rebuildAdjFromLinks();
    log(`${resource} released by ${holderProcess}`);

    // Grant queued requests automatically in order
    const queue = pendingRequests[resource];
    let freeSlots = resourceCapacity[resource] - resourceHolder[resource].length;

    // Grant queued requests automatically in order
while (queue.length > 0 && freeSlots > 0) {
    const proc = queue.shift(); // first in waiting queue

    // Check for cycle before allocation
    const adj = {};
    for (let k in graphAdj) adj[k] = graphAdj[k].slice();
    if (!adj[resource]) adj[resource] = [];
    adj[resource].push(proc);

    if (detectsCycleInAdj(adj)) {
        queue.push(proc); // put it back at front if cycle detected
        break; // stop further allocation to prevent deadlock
    }

    // Remove the old request edge
    links = links.filter(l => !(l.type === 'request' && l.source === proc && l.target === resource));

    // Grant resource
    links.push({ source: resource, target: proc, type: 'alloc' });
    resourceHolder[resource].push(proc);
    freeSlots--;
    log(`${proc} granted ${resource} from queue`);
    rebuildAdjFromLinks();
}


    updateStats();
    updateGraph();
  }

  // Update Stats
  function updateStats() {
    const holdersDiv = document.getElementById('holders');
    const pendingDiv = document.getElementById('pending');
    holdersDiv.innerHTML = '<h4>System State</h4>'; pendingDiv.innerHTML = '<h4>Pending Queues</h4>';

    for (let r = 1; r <= resourceCount; r++) {
      const id = 'R' + r; if (!nodeExists(id)) continue;
      const heldCount = resourceHolder[id].length, total = resourceCapacity[id];

      // Holder card
      const card = document.createElement('div'); card.className = 'status-card';
      card.style.background = heldCount > 0 ? '#234C6A' : '#D2C1B6';
      card.style.color = heldCount > 0 ? '#fff' : '#222';
      card.innerHTML = `<strong>${id}</strong>: ${heldCount}/${total} allocated (${resourceHolder[id].join(', ') || 'Free'})`;
      holdersDiv.appendChild(card);

      // Queue visualization
      const queue = pendingRequests[id] || [];
      const container = document.createElement('div'); container.className = 'queue-container';
      const label = document.createElement('strong'); label.innerText = id + ': '; container.appendChild(label);
      queue.forEach(p => {
        const item = document.createElement('span');
        item.className = 'queue-item'; item.style.background = '#456882'; item.style.color = '#fff'; item.innerText = p;
        container.appendChild(item);
      });
      if (queue.length === 0) {
        const empty = document.createElement('span'); empty.className = 'queue-item empty';
        empty.innerText = 'Empty'; empty.style.background = '#D2C1B6'; empty.style.color = '#222';
        container.appendChild(empty);
      }
      pendingDiv.appendChild(container);
    }
  }

  // D3 Graph
  function updateGraph() {
    rebuildAdjFromLinks();
    d3.select("#graph").selectAll("*").remove();
    const container = document.getElementById('graph');
    const w = container.clientWidth || 800, h = container.clientHeight || 600;

    const svg = d3.select("#graph").append("svg").attr("width", w).attr("height", h);

    const defs = svg.append("defs");
    defs.append("marker").attr("id", "arrow").attr("viewBox", "0 -5 10 10").attr("refX", 24).attr("refY", 0).attr("markerWidth", 8).attr("markerHeight", 8).attr("orient", "auto")
      .append("path").attr("d", "M0,-5L10,0L0,5").attr("fill", "#333");

    const procGrad = defs.append("radialGradient").attr("id", "procGradient");
    procGrad.append("stop").attr("offset", "0%").attr("stop-color", "#6c63ff");
    procGrad.append("stop").attr("offset", "100%").attr("stop-color", "#8e7dff");

    const resGrad = defs.append("radialGradient").attr("id", "resGradient");
    resGrad.append("stop").attr("offset", "0%").attr("stop-color", "#234C6A");
    resGrad.append("stop").attr("offset", "100%").attr("stop-color", "#1B3C53");

    const nodesCopy = nodes.map(d => Object.assign({}, d));
    const linksCopy = links.map(d => ({ source: d.source, target: d.target, type: d.type }));

    const simulation = d3.forceSimulation(nodesCopy)
      .force("link", d3.forceLink(linksCopy).id(d => d.id).distance(140).strength(1))
      .force("charge", d3.forceManyBody().strength(-600))
      .force("center", d3.forceCenter(w / 2, h / 2));

    const link = svg.append("g").selectAll("path")
      .data(linksCopy).join("path")
      .attr("class", d => d.type === 'request' ? "link-request" : "link-alloc")
      .attr("stroke", d => d.type === 'request' ? '#ff9800' : '#28a745')
      .attr("fill", "none")
      .attr("marker-end", "url(#arrow)");

    const gNode = svg.append("g").selectAll("g")
      .data(nodesCopy).join("g")
      .call(d3.drag()
        .on("start", (evt, d) => { if (!evt.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on("drag", (evt, d) => { d.fx = evt.x; d.fy = evt.y; })
        .on("end", (evt, d) => { if (!evt.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; }));

    gNode.append("circle")
      .attr("r", d => d.type === 'P' ? 28 : 22)
      .attr("fill", d => d.type === 'P' ? "url(#procGradient)" : "url(#resGradient)")
      .attr("stroke", "#222").attr("stroke-width", 2)
      .on("mouseover", (evt, d) => d3.select(evt.currentTarget).transition().duration(200).attr("r", d.type === 'P' ? 32 : 26))
      .on("mouseout", (evt, d) => d3.select(evt.currentTarget).transition().duration(200).attr("r", d.type === 'P' ? 28 : 22));

    gNode.append("text").attr("class", "node-label").attr("text-anchor", "middle").attr("dy", 5).text(d => d.id);

    function clampNodePositions(nodesArr) {
      nodesArr.forEach(d => {
        const r = d.type === 'P' ? 28 : 22;
        d.x = Math.max(r + 8, Math.min(w - r - 8, d.x));
        d.y = Math.max(r + 8, Math.min(h - r - 8, d.y));
      });
    }

    simulation.on("tick", () => {
      clampNodePositions(nodesCopy);
      link.attr("d", d => {
        const sx = d.source.x, sy = d.source.y, tx = d.target.x, ty = d.target.y;
        const dx = tx - sx, dy = ty - sy, dr = Math.sqrt(dx * dx + dy * dy) * 1.2;
        return `M${sx},${sy}A${dr},${dr} 0 0,1 ${tx},${ty}`;
      });
      gNode.attr("transform", d => `translate(${d.x},${d.y})`);
    });

    setTimeout(() => simulation.alpha(0.001).stop(), 1500);
  }

  // Event bindings
  document.getElementById('addProcess').onclick = addProcess;
  document.getElementById('addResource').onclick = addResource;
  document.getElementById('requestEdge').onclick = requestResourceUI;
  document.getElementById('releaseResource').onclick = releaseResourceUI;
  document.getElementById('reset').onclick = () => {
    nodes = []; links = []; graphAdj = {};
    resourceHolder = {}; pendingRequests = {}; resourceCapacity = {};
    processCount = 0; resourceCount = 0;
    clearLog(); log("System reset");
    updateStats(); updateGraph();
  };

  updateGraph(); updateStats(); log("Simulator ready");
});
