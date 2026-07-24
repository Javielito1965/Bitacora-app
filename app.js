// =========================================================
// CUADERNO DE BITÁCORA — lógica de la aplicación
// Habla directamente con la API REST de Supabase (sin librerías externas)
// =========================================================
(function(){
  const $ = id => document.getElementById(id);
  const SESSION_KEY = 'bitacora_session';

  let session = null;   // {access_token, refresh_token, user}
  let profile = null;   // {id, nombre, rol}
  let clientes = [];
  let viajes = [];
  let embarcacion = {nombre:'Mi Barco', horas_revision_motor:100};

  // ---------- helpers ----------
  const fmt = n => (isFinite(n) ? Number(n).toLocaleString('es-ES',{minimumFractionDigits:1,maximumFractionDigits:2}) : '—');
  const fmtMoney = n => (isFinite(n) ? Number(n).toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2})+' €' : '—');
  const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function formatDate(iso){
    if(!iso) return 'Sin fecha';
    const [y,m,d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }
  function showToast(msg){
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(()=>t.classList.remove('show'), 2400);
  }

  // ---------- API (REST directa a Supabase) ----------
  async function api(path, {method='GET', body=null, extraHeaders={}} = {}){
    const headers = {
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
      ...extraHeaders
    };
    if(session?.access_token) headers.Authorization = 'Bearer ' + session.access_token;
    const res = await fetch(SUPABASE_URL + path, {method, headers, body: body ? JSON.stringify(body) : undefined});
    if(!res.ok){
      let msg = 'Error de conexión';
      try{ const j = await res.json(); msg = j.error_description || j.msg || j.message || msg; }catch(e){}
      throw new Error(msg);
    }
    if(res.status === 204) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  const restHeaders = {Prefer:'return=representation'};

  // ---------- AUTENTICACIÓN ----------
  function saveSession(){ localStorage.setItem(SESSION_KEY, JSON.stringify(session)); }
  function loadSession(){
    try{ session = JSON.parse(localStorage.getItem(SESSION_KEY)); }catch(e){ session = null; }
  }
  function clearSession(){ session = null; localStorage.removeItem(SESSION_KEY); }

  async function signUp(email, password, nombre){
    const data = await api('/auth/v1/signup', {method:'POST', body:{email, password, data:{nombre}}});
    return data;
  }
  async function signIn(email, password){
    const data = await api('/auth/v1/token?grant_type=password', {method:'POST', body:{email, password}});
    session = {access_token:data.access_token, refresh_token:data.refresh_token, user:data.user};
    saveSession();
  }
  async function refreshSession(){
    if(!session?.refresh_token) throw new Error('sin sesión');
    const data = await api('/auth/v1/token?grant_type=refresh_token', {method:'POST', body:{refresh_token:session.refresh_token}});
    session = {access_token:data.access_token, refresh_token:data.refresh_token, user:data.user};
    saveSession();
  }
  function signOut(){
    clearSession();
    profile = null;
    location.reload();
  }

  // ---------- CARGA DE DATOS ----------
  async function loadProfile(){
    const rows = await api(`/rest/v1/profiles?id=eq.${session.user.id}&select=*`);
    profile = rows && rows[0] ? rows[0] : {id:session.user.id, nombre:session.user.email, rol:'tripulacion'};
  }
  async function loadClientes(){
    clientes = await api('/rest/v1/clientes?select=*&order=nombre.asc') || [];
  }
  async function loadViajes(){
    viajes = await api('/rest/v1/viajes?select=*&order=fecha.desc') || [];
  }
  async function loadEmbarcacion(){
    const rows = await api('/rest/v1/embarcacion?select=*&id=eq.1');
    if(rows && rows[0]) embarcacion = rows[0];
  }
  async function loadAllProfiles(){
    return await api('/rest/v1/profiles?select=*&order=nombre.asc') || [];
  }

  async function withAuthRetry(fn){
    try{ return await fn(); }
    catch(e){
      if(String(e.message).toLowerCase().includes('jwt') || String(e.message).toLowerCase().includes('token')){
        await refreshSession();
        return await fn();
      }
      throw e;
    }
  }

  // ---------- AUTH UI ----------
  document.querySelectorAll('.auth-tabs button').forEach(b=>{
    b.addEventListener('click', ()=>{
      document.querySelectorAll('.auth-tabs button').forEach(x=>x.classList.remove('active'));
      document.querySelectorAll('.auth-form').forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
      $('form-'+b.dataset.auth).classList.add('active');
      hideAuthMsgs();
    });
  });
  function hideAuthMsgs(){ $('authError').classList.remove('show'); $('authMsg').classList.remove('show'); }
  function authError(msg){ $('authError').textContent = msg; $('authError').classList.add('show'); $('authMsg').classList.remove('show'); }
  function authMsg(msg){ $('authMsg').textContent = msg; $('authMsg').classList.add('show'); $('authError').classList.remove('show'); }

  $('loginForm').addEventListener('submit', async e=>{
    e.preventDefault();
    hideAuthMsgs();
    const btn = $('loginBtn');
    btn.disabled = true;
    try{
      await signIn($('loginEmail').value.trim(), $('loginPassword').value);
      await bootApp();
    }catch(err){
      authError(err.message || 'No se pudo iniciar sesión');
    }finally{ btn.disabled = false; }
  });

  $('signupForm').addEventListener('submit', async e=>{
    e.preventDefault();
    hideAuthMsgs();
    const btn = $('signupBtn');
    btn.disabled = true;
    try{
      await signUp($('signupEmail').value.trim(), $('signupPassword').value, $('signupNombre').value.trim());
      authMsg('Cuenta creada. Si tu proyecto requiere confirmación por email, revisa tu correo antes de iniciar sesión.');
      $('signupForm').reset();
    }catch(err){
      authError(err.message || 'No se pudo crear la cuenta');
    }finally{ btn.disabled = false; }
  });

  // ---------- NAVEGACIÓN ----------
  document.querySelectorAll('.sidebar-nav button').forEach(b=>{
    b.addEventListener('click', ()=>{
      document.querySelectorAll('.sidebar-nav button').forEach(x=>x.classList.remove('active'));
      document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
      $('view-'+b.dataset.view).classList.add('active');
      if(b.dataset.view === 'informes') renderInformes();
      if(b.dataset.view === 'configuracion') renderConfiguracion();
    });
  });
  $('logoutBtn').addEventListener('click', signOut);

  // ---------- NUEVO VIAJE / EDICIÓN ----------
  const tripFields = ['tFecha','tCliente','tMotivo','tMotorIni','tMotorFin','tGenIni','tGenFin','tCombIni','tCombFin','tPrecio'];
  let editingId = null;

  function populateClienteSelect(){
    const sel = $('tCliente');
    const current = sel.value;
    if(clientes.length === 0){
      sel.innerHTML = '<option value="">— Añade clientes primero —</option>';
      return;
    }
    sel.innerHTML = '<option value="">Selecciona un cliente…</option>' +
      clientes.map(c=>`<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join('');
    if(current) sel.value = current;
  }

  function clientName(id){
    const c = clientes.find(x=>x.id === id);
    return c ? c.nombre : '(cliente eliminado)';
  }

  function computeStats(v){
    const motor = (v.motorIni!=='' && v.motorFin!=='' && v.motorIni!=null && v.motorFin!=null) ? Number(v.motorFin)-Number(v.motorIni) : NaN;
    const gen = (v.genIni!=='' && v.genFin!=='' && v.genIni!=null && v.genFin!=null) ? Number(v.genFin)-Number(v.genIni) : NaN;
    const consumo = (v.combIni!=='' && v.combFin!=='' && v.combIni!=null && v.combFin!=null) ? Number(v.combIni)-Number(v.combFin) : NaN;
    const coste = (isFinite(consumo) && v.precioLitro!=='' && v.precioLitro!=null) ? consumo*Number(v.precioLitro) : NaN;
    return {motor, gen, consumo, coste};
  }

  function readTripForm(){
    return {
      fecha: $('tFecha').value,
      clienteId: $('tCliente').value,
      motivo: $('tMotivo').value.trim(),
      motorIni: $('tMotorIni').value,
      motorFin: $('tMotorFin').value,
      genIni: $('tGenIni').value,
      genFin: $('tGenFin').value,
      combIni: $('tCombIni').value,
      combFin: $('tCombFin').value,
      precioLitro: $('tPrecio').value
    };
  }
  function updateLiveCalc(){
    const v = readTripForm();
    const {motor, gen, consumo, coste} = computeStats(v);
    $('calcMotor').textContent = isFinite(motor) ? fmt(motor)+' h' : '—';
    $('calcGen').textContent = isFinite(gen) ? fmt(gen)+' h' : '—';
    $('calcConsumo').textContent = isFinite(consumo) ? fmt(consumo)+' L' : '—';
    $('calcCoste').textContent = isFinite(coste) ? fmtMoney(coste) : '—';
  }
  tripFields.forEach(f=>$(f).addEventListener('input', updateLiveCalc));

  function resetTripForm(){
    editingId = null;
    tripFields.forEach(f=>$(f).value = '');
    $('tFecha').value = new Date().toISOString().slice(0,10);
    $('tPrecio').value = embarcacion.ultimo_precio || '';
    $('tripFormTitle').textContent = 'Nuevo viaje';
    $('tripSubmitBtn').textContent = 'Guardar viaje';
    $('tripCancelEdit').style.display = 'none';
    updateLiveCalc();
  }
  $('tripCancelEdit').addEventListener('click', resetTripForm);

  $('tripForm').addEventListener('submit', async e=>{
    e.preventDefault();
    if(clientes.length === 0){ showToast('Añade al menos un cliente primero'); return; }
    const v = readTripForm();
    if(!v.fecha){ showToast('Indica la fecha de salida'); return; }
    if(!v.clienteId){ showToast('Selecciona un cliente'); return; }
    const payload = {
      fecha: v.fecha,
      cliente_id: v.clienteId,
      motivo: v.motivo || null,
      motor_ini: v.motorIni === '' ? null : Number(v.motorIni),
      motor_fin: v.motorFin === '' ? null : Number(v.motorFin),
      gen_ini: v.genIni === '' ? null : Number(v.genIni),
      gen_fin: v.genFin === '' ? null : Number(v.genFin),
      comb_ini: v.combIni === '' ? null : Number(v.combIni),
      comb_fin: v.combFin === '' ? null : Number(v.combFin),
      precio_litro: v.precioLitro === '' ? null : Number(v.precioLitro)
    };
    const btn = $('tripSubmitBtn');
    btn.disabled = true;
    try{
      await withAuthRetry(async ()=>{
        if(editingId){
          await api(`/rest/v1/viajes?id=eq.${editingId}`, {method:'PATCH', body:payload, extraHeaders:restHeaders});
        } else {
          payload.created_by = session.user.id;
          await api('/rest/v1/viajes', {method:'POST', body:payload, extraHeaders:restHeaders});
        }
      });
      await loadViajes();
      renderHistorial();
      showToast(editingId ? 'Viaje actualizado' : 'Viaje guardado');
      resetTripForm();
    }catch(err){
      showToast('Error al guardar: ' + err.message);
    }finally{ btn.disabled = false; }
  });

  function editTrip(id){
    const v = viajes.find(x=>x.id === id);
    if(!v) return;
    editingId = id;
    $('tFecha').value = v.fecha || '';
    populateClienteSelect();
    $('tCliente').value = v.cliente_id || '';
    $('tMotivo').value = v.motivo || '';
    $('tMotorIni').value = v.motor_ini ?? '';
    $('tMotorFin').value = v.motor_fin ?? '';
    $('tGenIni').value = v.gen_ini ?? '';
    $('tGenFin').value = v.gen_fin ?? '';
    $('tCombIni').value = v.comb_ini ?? '';
    $('tCombFin').value = v.comb_fin ?? '';
    $('tPrecio').value = v.precio_litro ?? '';
    $('tripFormTitle').textContent = 'Editar viaje';
    $('tripSubmitBtn').textContent = 'Actualizar viaje';
    $('tripCancelEdit').style.display = 'inline-block';
    updateLiveCalc();
    document.querySelector('[data-view="nuevo-viaje"]').click();
    window.scrollTo({top:0, behavior:'smooth'});
  }

  async function deleteTrip(id){
    if(!confirm('¿Eliminar esta entrada de la bitácora? Esta acción no se puede deshacer.')) return;
    try{
      await withAuthRetry(()=>api(`/rest/v1/viajes?id=eq.${id}`, {method:'DELETE'}));
      await loadViajes();
      renderHistorial();
      showToast('Viaje eliminado');
    }catch(err){
      showToast('Error al eliminar: ' + err.message);
    }
  }

  // ---------- HISTORIAL ----------
  function renderHistorial(){
    populateFilterCliente();
    applyHistorialFilters();
  }
  function populateFilterCliente(){
    const sel = $('filterCliente');
    const current = sel.value;
    sel.innerHTML = '<option value="">Todos los clientes</option>' +
      clientes.map(c=>`<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join('');
    if(current) sel.value = current;
  }
  $('filterCliente').addEventListener('change', applyHistorialFilters);
  $('filterMes').addEventListener('change', applyHistorialFilters);

  function applyHistorialFilters(){
    const cli = $('filterCliente').value;
    const mes = $('filterMes').value; // YYYY-MM
    let list = viajes;
    if(cli) list = list.filter(v=>v.cliente_id === cli);
    if(mes) list = list.filter(v=>(v.fecha||'').startsWith(mes));
    renderEntries(list);
  }

  const canDelete = () => profile && (profile.rol === 'capitan' || profile.rol === 'admin');

  function renderEntries(list){
    const cont = $('entriesContainer');
    cont.innerHTML = '';
    if(list.length === 0){
      cont.innerHTML = `<div class="empty">⚓<br>No hay entradas que coincidan con el filtro.</div>`;
      return;
    }
    list.forEach(v=>{
      const stats = computeStats({
        motorIni:v.motor_ini, motorFin:v.motor_fin, genIni:v.gen_ini, genFin:v.gen_fin,
        combIni:v.comb_ini, combFin:v.comb_fin, precioLitro:v.precio_litro
      });
      const card = document.createElement('div');
      card.className = 'entry';
      card.innerHTML = `
        <div class="entry-top">
          <div>
            <span class="entry-date">${formatDate(v.fecha)}</span> ·
            <span class="entry-client">${escapeHtml(clientName(v.cliente_id))}</span>
            ${v.motivo ? `<div class="entry-motivo">${escapeHtml(v.motivo)}</div>` : ''}
          </div>
          <div class="entry-actions">
            <button class="icon-btn" data-edit="${v.id}">✎ Editar</button>
            ${canDelete() ? `<button class="icon-btn danger" data-del="${v.id}">🗑 Eliminar</button>` : ''}
          </div>
        </div>
        <div class="entry-grid">
          <div class="stat"><div class="stat-label">Horas motor</div><div class="stat-value">${fmt(stats.motor)} h</div></div>
          <div class="stat"><div class="stat-label">Horas generador</div><div class="stat-value">${fmt(stats.gen)} h</div></div>
          <div class="stat"><div class="stat-label">Consumo</div><div class="stat-value ${stats.consumo<0?'warn':''}">${fmt(stats.consumo)} L</div></div>
          <div class="stat"><div class="stat-label">Coste combustible</div><div class="stat-value coste">${fmtMoney(stats.coste)}</div></div>
        </div>`;
      cont.appendChild(card);
    });
    cont.querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click', ()=>editTrip(b.dataset.edit)));
    cont.querySelectorAll('[data-del]').forEach(b=>b.addEventListener('click', ()=>deleteTrip(b.dataset.del)));
  }

  // ---------- CLIENTES ----------
  function renderClientes(){
    const list = $('clientList');
    list.innerHTML = '';
    if(clientes.length === 0){
      list.innerHTML = '<div class="empty">Todavía no hay clientes. Añade el primero arriba.</div>';
    } else {
      clientes.forEach(c=>{
        const row = document.createElement('div');
        row.className = 'client-row';
        row.innerHTML = `<span>${escapeHtml(c.nombre)}</span>`;
        const del = document.createElement('button');
        del.className = 'icon-btn danger';
        del.textContent = 'Eliminar';
        del.addEventListener('click', async ()=>{
          if(confirm(`¿Eliminar a "${c.nombre}"? Los viajes ya guardados no se borran.`)){
            try{
              await withAuthRetry(()=>api(`/rest/v1/clientes?id=eq.${c.id}`, {method:'DELETE'}));
              await loadClientes();
              renderClientes();
              populateClienteSelect();
              populateFilterCliente();
            }catch(err){ showToast('Error: '+err.message); }
          }
        });
        row.appendChild(del);
        list.appendChild(row);
      });
    }
    populateClienteSelect();
  }
  $('addClientForm').addEventListener('submit', async e=>{
    e.preventDefault();
    const input = $('newClientName');
    const nombre = input.value.trim();
    if(!nombre) return;
    try{
      await withAuthRetry(()=>api('/rest/v1/clientes', {method:'POST', body:{nombre, created_by:session.user.id}, extraHeaders:restHeaders}));
      input.value = '';
      await loadClientes();
      renderClientes();
      populateFilterCliente();
      showToast('Cliente añadido');
    }catch(err){ showToast('Error: '+err.message); }
  });

  // ---------- INFORMES ----------
  function renderInformes(){
    const now = new Date();
    const mesActual = now.toISOString().slice(0,7);
    const delMes = viajes.filter(v=>(v.fecha||'').startsWith(mesActual));

    let totalCoste=0, totalConsumo=0, totalHorasMotor=0, totalHorasGen=0;
    const costePorCliente = {};

    viajes.forEach(v=>{
      const s = computeStats({
        motorIni:v.motor_ini, motorFin:v.motor_fin, genIni:v.gen_ini, genFin:v.gen_fin,
        combIni:v.comb_ini, combFin:v.comb_fin, precioLitro:v.precio_litro
      });
      if(isFinite(s.coste)) totalCoste += s.coste;
      if(isFinite(s.consumo)) totalConsumo += s.consumo;
      if(isFinite(s.motor)) totalHorasMotor += s.motor;
      if(isFinite(s.gen)) totalHorasGen += s.gen;
      if(isFinite(s.coste)){
        const key = clientName(v.cliente_id);
        costePorCliente[key] = (costePorCliente[key]||0) + s.coste;
      }
    });

    let costeMes = 0;
    delMes.forEach(v=>{
      const s = computeStats({
        motorIni:v.motor_ini, motorFin:v.motor_fin, genIni:v.gen_ini, genFin:v.gen_fin,
        combIni:v.comb_ini, combFin:v.comb_fin, precioLitro:v.precio_litro
      });
      if(isFinite(s.coste)) costeMes += s.coste;
    });

    const consumoMedioPorHora = totalHorasMotor > 0 ? totalConsumo/totalHorasMotor : NaN;

    $('statsGrid').innerHTML = `
      <div class="stat-card"><div class="k">Coste este mes</div><div class="v">${fmtMoney(costeMes)}</div></div>
      <div class="stat-card"><div class="k">Coste total histórico</div><div class="v">${fmtMoney(totalCoste)}</div></div>
      <div class="stat-card"><div class="k">Litros consumidos (total)</div><div class="v">${fmt(totalConsumo)} L</div></div>
      <div class="stat-card"><div class="k">Consumo medio</div><div class="v">${isFinite(consumoMedioPorHora)?fmt(consumoMedioPorHora)+' L/h':'—'}</div></div>
      <div class="stat-card"><div class="k">Horas de motor (total)</div><div class="v">${fmt(totalHorasMotor)} h</div></div>
      <div class="stat-card"><div class="k">Horas de generador (total)</div><div class="v">${fmt(totalHorasGen)} h</div></div>
    `;

    const maxCoste = Math.max(1, ...Object.values(costePorCliente));
    const bars = Object.entries(costePorCliente).sort((a,b)=>b[1]-a[1]);
    $('barsPorCliente').innerHTML = bars.length ? bars.map(([nombre,coste])=>`
      <div class="bar-row">
        <div class="bar-label" title="${escapeHtml(nombre)}">${escapeHtml(nombre)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${(coste/maxCoste*100).toFixed(1)}%"></div></div>
        <div class="bar-value">${fmtMoney(coste)}</div>
      </div>`).join('') : '<div class="empty">Todavía no hay datos suficientes.</div>';
  }

  // ---------- CONFIGURACIÓN ----------
  async function renderConfiguracion(){
    $('cfgBoatName').value = embarcacion.nombre || '';
    $('cfgHorasRevision').value = embarcacion.horas_revision_motor ?? '';
    const isAdmin = profile && (profile.rol === 'admin' || profile.rol === 'capitan');
    $('cfgBoatSaveBtn').style.display = isAdmin ? 'inline-block' : 'none';
    $('cfgBoatName').disabled = !isAdmin;
    $('cfgHorasRevision').disabled = !isAdmin;

    $('cfgMiNombre').value = profile?.nombre || '';
    $('cfgMiRol').textContent = profile?.rol || '';

    $('usersSection').style.display = isAdmin ? 'block' : 'none';
    if(isAdmin){
      const perfiles = await withAuthRetry(loadAllProfiles);
      $('usersList').innerHTML = perfiles.map(p=>`
        <div class="user-row">
          <span>${escapeHtml(p.nombre || '(sin nombre)')} ${p.id===profile.id?'<em>(tú)</em>':''}</span>
          <select data-user="${p.id}" ${p.id===profile.id?'disabled':''}>
            <option value="tripulacion" ${p.rol==='tripulacion'?'selected':''}>Tripulación</option>
            <option value="capitan" ${p.rol==='capitan'?'selected':''}>Capitán</option>
            <option value="admin" ${p.rol==='admin'?'selected':''}>Admin</option>
          </select>
        </div>`).join('');
      $('usersList').querySelectorAll('select').forEach(sel=>{
        sel.addEventListener('change', async ()=>{
          try{
            await withAuthRetry(()=>api(`/rest/v1/profiles?id=eq.${sel.dataset.user}`, {method:'PATCH', body:{rol:sel.value}}));
            showToast('Rol actualizado');
          }catch(err){ showToast('Error: '+err.message); }
        });
      });
    }
  }

  $('cfgMiNombreForm').addEventListener('submit', async e=>{
    e.preventDefault();
    try{
      await withAuthRetry(()=>api(`/rest/v1/profiles?id=eq.${profile.id}`, {method:'PATCH', body:{nombre:$('cfgMiNombre').value.trim()}}));
      profile.nombre = $('cfgMiNombre').value.trim();
      renderSidebarUser();
      showToast('Nombre actualizado');
    }catch(err){ showToast('Error: '+err.message); }
  });

  $('cfgBoatForm').addEventListener('submit', async e=>{
    e.preventDefault();
    try{
      await withAuthRetry(()=>api('/rest/v1/embarcacion?id=eq.1', {method:'PATCH', body:{
        nombre: $('cfgBoatName').value.trim(),
        horas_revision_motor: $('cfgHorasRevision').value ? Number($('cfgHorasRevision').value) : null
      }}));
      embarcacion.nombre = $('cfgBoatName').value.trim();
      embarcacion.horas_revision_motor = $('cfgHorasRevision').value ? Number($('cfgHorasRevision').value) : null;
      $('sidebarBoatName').textContent = embarcacion.nombre;
      showToast('Datos de la embarcación actualizados');
    }catch(err){ showToast('Error: '+err.message); }
  });

  // ---------- SIDEBAR / CABECERA ----------
  function renderSidebarUser(){
    $('sidebarWho').textContent = profile?.nombre || session?.user?.email || '';
    const rolLabel = {admin:'Admin', capitan:'Capitán', tripulacion:'Tripulación'}[profile?.rol] || profile?.rol || '';
    $('sidebarRole').textContent = rolLabel;
  }

  // ---------- ARRANQUE ----------
  async function bootApp(){
    try{
      await loadProfile();
      await Promise.all([loadClientes(), loadViajes(), loadEmbarcacion()]);
      $('authScreen').style.display = 'none';
      $('appScreen').classList.add('active');
      $('sidebarBoatName').textContent = embarcacion.nombre || 'Mi Barco';
      renderSidebarUser();
      resetTripForm();
      renderClientes();
      renderHistorial();
    }catch(err){
      authError('No se pudo cargar la sesión: ' + err.message);
      clearSession();
    }
  }

  (function init(){
    loadSession();
    if(session?.access_token){
      bootApp();
    }
  })();
})();
