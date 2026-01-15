const STORAGE_KEY = 'deck-layout-tiling';
let tileTypes = [];
let tiles = [];
let viewportW = 0, viewportH = 0;
let messageTimeout = null;
let editMode = false;
let nextTileId = 0;

function $(s){return document.querySelector(s)}
function $all(s){return document.querySelectorAll(s)}

async function init(){
  updateViewportSize();
  window.addEventListener('resize', ()=>{ updateViewportSize(); retile(); });
  await loadTileTypes();
  loadLayout();
  render();
  attachUI();
  showNotification('Welcome to Decklike Display!');
}

function updateViewportSize(){
  const desktop = $('#desktop');
  viewportW = Math.max(desktop.clientWidth - 56, 400);
  viewportH = Math.max(desktop.clientHeight - 56, 300);
}

async function loadTileTypes(){
  try{
    const res = await fetch('presets.json');
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    tileTypes = data.tiles || [];
    console.log('Tile types loaded:', tileTypes.length);
  }catch(e){
    console.error('Failed to load presets.json:', e);
    tileTypes = [];
  }
}

function loadLayout(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if(raw){
    tiles = JSON.parse(raw);
  }else{
    tiles = [];
    // spawn one default tile
    spawnTile('tasks');
  }
}

function saveLayout(){ 
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tiles));
}

function spawnTile(typeStr, customTitle){
  const tileType = tileTypes.find(t => t.type === typeStr);
  if(!tileType) return;
  
  const tile = {
    id: 'tile-' + (nextTileId++),
    type: typeStr,
    title: customTitle || tileType.defaultTitle,
    color: ['neon-green', 'neon-pink', 'neon-blue'][tiles.length % 3],
    ...(tileType.config || {})
  };
  
  tiles.push(tile);
  retile();
  render();
  saveLayout();
  showNotification(`Spawned: ${tileType.label}`);
}

function closeTile(tileId){
  tiles = tiles.filter(t => t.id !== tileId);
  retile();
  render();
  saveLayout();
  showNotification('Window closed');
}

function retile(){
  if(tiles.length === 0) return;
  
  const PADDING = 28;
  const GAP = 12;
  
  if(tiles.length === 1){
    // full screen
    tiles[0].x = PADDING;
    tiles[0].y = PADDING;
    tiles[0].w = viewportW - GAP;
    tiles[0].h = viewportH - GAP;
  }else if(tiles.length === 2){
    // 50/50 vertical split
    const w = (viewportW - GAP * 2) / 2;
    tiles[0].x = PADDING;
    tiles[0].y = PADDING;
    tiles[0].w = w;
    tiles[0].h = viewportH - GAP;
    
    tiles[1].x = PADDING + w + GAP;
    tiles[1].y = PADDING;
    tiles[1].w = w;
    tiles[1].h = viewportH - GAP;
  }else{
    
    const masterW = Math.floor((viewportW - GAP * 2) * 0.6);
    const slaveW = viewportW - masterW - GAP * 3;
    const slaveH = (viewportH - GAP * (tiles.length - 1)) / (tiles.length - 1);
    

    tiles[0].x = PADDING;
    tiles[0].y = PADDING;
    tiles[0].w = masterW;
    tiles[0].h = viewportH - GAP;
    
    
    for(let i = 1; i < tiles.length; i++){
      tiles[i].x = PADDING + masterW + GAP;
      tiles[i].y = PADDING + (i - 1) * (slaveH + GAP);
      tiles[i].w = slaveW;
      tiles[i].h = slaveH;
    }
  }
}

function render(){
  const desktop = $('#desktop');
  [...desktop.querySelectorAll('.tile')].forEach(n=>n.remove());

  tiles.forEach(t=>{
    const el = document.createElement('div');
    el.className = 'tile ' + (t.color || 'neon-green');
    el.dataset.id = t.id;
    el.style.left = t.x + 'px';
    el.style.top = t.y + 'px';
    el.style.width = t.w + 'px';
    el.style.height = t.h + 'px';

    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = t.title;
    title.style.cursor = 'grab';
    title.style.flex = '1';
    
    const closeBtn = document.createElement('button');
    closeBtn.className = 'close-tile';
    closeBtn.textContent = '×';
    closeBtn.style.cursor = 'pointer';
    closeBtn.addEventListener('click', (e)=>{
      e.stopPropagation();
      closeTile(t.id);
    });
    
    const titleBar = document.createElement('div');
    titleBar.style.display = 'flex';
    titleBar.style.justifyContent = 'space-between';
    titleBar.style.alignItems = 'center';
    titleBar.style.gap = '8px';
    titleBar.style.cursor = 'grab';
    titleBar.appendChild(title);
    titleBar.appendChild(closeBtn);

    const body = document.createElement('div');
    body.className = 'content';

    if(t.type === 'tasks'){
      el.classList.add('tasks');
      const ul = document.createElement('ul');
      (t.tasks || []).forEach((it, idx)=>{ 
        const li = document.createElement('li');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = !!it.done;
        cb.onchange = ()=>{ t.tasks[idx].done = cb.checked; saveLayout(); };
        const span = document.createElement('span');
        span.textContent = it.text;
        li.appendChild(cb);
        li.appendChild(span);
        ul.appendChild(li);
      });
      body.appendChild(ul);
    }else if(t.type === 'weather'){
      const icon = document.createElement('div');
      icon.innerHTML = '&#9729;';
      icon.style.textAlign = 'center';
      icon.style.margin = '6px';
      const rows = document.createElement('div');
      rows.innerHTML = `<div style="text-align:center;opacity:0.9">${t.desc || 'Loading...'}</div><div style="text-align:center;font-size:1.1rem;margin:6px;">${t.tempC || '--'}°C / ${t.tempF || '--'}°F</div><div style="opacity:0.8">Humidity: ${t.humidity || '--'}%</div><div style="opacity:0.8">Wind: ${t.wind || '--'}</div>`;
      body.appendChild(icon);
      body.appendChild(rows);
      fetchWeather(t, rows);
    }else if(t.type === 'pcstats'){
      const list = document.createElement('div');
      list.style.display = 'flex';
      list.style.flexDirection = 'column';
      list.style.gap = '10px';
      (t.items || []).forEach(it => {
        const row = document.createElement('div');
        row.innerHTML = `<strong style="opacity:0.9">${it.k}:</strong> <span style="margin-left:8px;opacity:0.95">${it.v}</span>`;
        list.appendChild(row);
      });
      body.appendChild(list);
    }else if(t.type === 'crypto'){
      const list = document.createElement('div');
      list.style.display = 'flex';
      list.style.flexDirection = 'column';
      list.style.gap = '12px';
      list.id = 'crypto-' + t.id;
      body.appendChild(list);
      fetchCrypto(t, list);
    }else if(t.type === 'quote'){
      const text = document.createElement('div');
      text.style.fontStyle = 'italic';
      text.style.marginBottom = '8px';
      text.textContent = t.text || 'Loading...';
      const author = document.createElement('div');
      author.style.opacity = '0.7';
      author.textContent = '— ' + (t.author || 'Anonymous');
      body.appendChild(text);
      body.appendChild(author);
      fetchQuote(t, text, author);
    }

    el.appendChild(titleBar);
    el.appendChild(body);
    
    // Add resize handle for edit mode
    const handle = document.createElement('div');
    handle.className = 'handle';
    el.appendChild(handle);
    
    $('#desktop').appendChild(el);
    
    // Attach interactions
    makeDraggable(el, t, titleBar);
    makeResizable(el, t);
  });
}

function attachUI(){
  $('#toggleEdit').addEventListener('click', ()=>{ 
    editMode = !editMode;
    document.querySelectorAll('.tile').forEach(t=>t.classList.toggle('editing', editMode));
    showNotification(editMode ? 'Edit mode ON' : 'Edit mode OFF');
  });
  
  $('#openPresets').addEventListener('click', ()=>{ 
    renderSpawner();
    $('#presetOverlay').hidden = false;
  });
  
  $('#closeOverlay').addEventListener('click', ()=>$('#presetOverlay').hidden = true);
  $('#presetOverlay').addEventListener('click', (e)=>{ 
    if(e.target.id === 'presetOverlay') $('#presetOverlay').hidden = true;
  });
  
  $('#closeMessage').addEventListener('click', ()=>{ 
    clearTimeout(messageTimeout);
    $('#messageBox').hidden = true;
  });
  
  document.addEventListener('keydown', (e)=>{ 
    if(e.key === 'Escape') $('#presetOverlay').hidden = true;
  });
}

function renderSpawner(){
  const list = $('#presetList');
  list.innerHTML = '';
  tileTypes.forEach(type => {
    const item = document.createElement('div');
    item.className = 'preset-item';
    item.innerHTML = `<span style="font-size:1.2rem">${type.icon}</span> <span>${type.label}</span>`;
    item.style.display = 'flex';
    item.style.gap = '8px';
    item.style.alignItems = 'center';
    item.style.cursor = 'pointer';
    item.onclick = ()=>{ 
      spawnTile(type.type);
      $('#presetOverlay').hidden = true;
    };
    list.appendChild(item);
  });
}

function makeDraggable(el, tile, titleBar){
  let startX, startY, origX, origY, dragging=false;
  
  titleBar.addEventListener('mousedown', e=>{
    if(!editMode) return;
    dragging=true;
    startX = e.clientX;
    startY = e.clientY;
    origX = tile.x;
    origY = tile.y;
    titleBar.style.cursor='grabbing';
    document.body.style.userSelect='none';
    el.style.opacity = '0.8';
  });
  
  window.addEventListener('mousemove', e=>{
    if(!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    let nx = Math.max(28, Math.round(origX + dx));
    let ny = Math.max(28, Math.round(origY + dy));
    
    // constrain to viewport bounds
    nx = Math.max(28, Math.min(nx, viewportW - tile.w - 28));
    ny = Math.max(28, Math.min(ny, viewportH - tile.h - 28));
    
    tile.x = nx;
    tile.y = ny;
    
    // Check if dragged window overlaps with another window's center
    const dragCenterX = tile.x + tile.w / 2;
    const dragCenterY = tile.y + tile.h / 2;
    
    tiles.forEach(ot => {
      if(ot.id === tile.id) return;
      const otCenterX = ot.x + ot.w / 2;
      const otCenterY = ot.y + ot.h / 2;
      
      // If dragged window center is inside other window, swap them in the tiles array
      if(dragCenterX >= ot.x && dragCenterX <= ot.x + ot.w &&
         dragCenterY >= ot.y && dragCenterY <= ot.y + ot.h){
        const tileIdx = tiles.findIndex(t => t.id === tile.id);
        const otIdx = tiles.findIndex(t => t.id === ot.id);
        [tiles[tileIdx], tiles[otIdx]] = [tiles[otIdx], tiles[tileIdx]];
        retile();
        render();
      }
    });
  });
  
  window.addEventListener('mouseup', ()=>{
    if(dragging){
      dragging=false;
      titleBar.style.cursor='grab';
      document.body.style.userSelect='auto';
      el.style.opacity = '1';
      retile();
      render();
      saveLayout();
    }
  });
}

function makeResizable(el, tile){
  const handle = el.querySelector('.handle');
  if(!handle) return;
  let resizing=false, startX, startY, origW, origH;
  handle.addEventListener('mousedown', e=>{
    if(!editMode) return;
    e.stopPropagation();
    resizing=true;
    startX=e.clientX;
    startY=e.clientY;
    origW=tile.w;
    origH=tile.h;
    document.body.style.userSelect='none';
  });
  window.addEventListener('mousemove', e=>{
    if(!resizing) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    let nw = Math.max(220, Math.round(origW + dx));
    let nh = Math.max(120, Math.round(origH + dy));
    nw = Math.min(nw, viewportW - tile.x - 28);
    nh = Math.min(nh, viewportH - tile.y - 28);
    tile.w = nw;
    tile.h = nh;
    el.style.width = tile.w + 'px';
    el.style.height = tile.h + 'px';
  });
  window.addEventListener('mouseup', ()=>{
    if(resizing){ resizing=false; document.body.style.userSelect='auto'; saveLayout(); }
  });
}

// init
init();

/* Free API integrations */

async function fetchWeather(tile, container){
  try{
    const cities = { 'London': [51.5074, -0.1278], 'San Francisco': [37.7749, -122.4194], 'New York': [40.7128, -74.0060] };
    const [lat, lon] = cities[tile.city] || cities['London'];
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,humidity,wind_speed_10m&temperature_unit=celsius`);
    const data = await res.json();
    const c = data.current;
    const f = Math.round(c.temperature_2m * 9/5 + 32);
    const desc = c.weather_code === 0 ? 'Clear' : c.weather_code <= 3 ? 'Cloudy' : c.weather_code <= 49 ? 'Fog' : c.weather_code <= 79 ? 'Rain' : 'Snow';
    container.innerHTML = `<div style="text-align:center;opacity:0.9">${desc}</div><div style="text-align:center;font-size:1.1rem;margin:6px;">${Math.round(c.temperature_2m)}°C / ${f}°F</div><div style="opacity:0.8">Humidity: ${c.humidity}%</div><div style="opacity:0.8">Wind: ${Math.round(c.wind_speed_10m)} km/h</div>`;
    tile.tempC = Math.round(c.temperature_2m); tile.tempF = f; tile.humidity = c.humidity; tile.wind = Math.round(c.wind_speed_10m) + ' km/h'; tile.desc = desc;
  }catch(e){
    console.error('Weather fetch failed:', e);
    container.innerHTML = `<div style="opacity:0.6">Weather unavailable</div>`;
  }
}

async function fetchCrypto(tile, container){
  try{
    const coins = (tile.coins || 'bitcoin,ethereum').split(',').map(c=>c.trim());
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coins.join(',')}&vs_currencies=usd`);
    const data = await res.json();
    container.innerHTML = '';
    coins.forEach(coin => {
      if(data[coin]){
        const row = document.createElement('div');
        row.innerHTML = `<strong style="text-transform:capitalize;opacity:0.9">${coin}:</strong> <span style="margin-left:8px;opacity:0.95;color:#00ff00">$${data[coin].usd.toLocaleString()}</span>`;
        container.appendChild(row);
      }
    });
  }catch(e){
    console.error('Crypto fetch failed:', e);
    container.innerHTML = `<div style="opacity:0.6">Prices unavailable</div>`;
  }
}

async function fetchQuote(tile, textEl, authorEl){
  try{
    const res = await fetch('https://api.quotable.io/random');
    const data = await res.json();
    textEl.textContent = '"' + data.content + '"';
    authorEl.textContent = '— ' + data.author;
    tile.text = data.content;
    tile.author = data.author;
  }catch(e){
    console.error('Quote fetch failed:', e);
    textEl.textContent = 'Could not load quote';
  }
}

