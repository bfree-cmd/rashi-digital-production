/* Rashi Digital — site interactions
   track(event, detail) sends every interaction event to three places:
     1. window.dataLayer (object push, for a future GTM container)
     2. GA4 via gtag('event', ...) — gtag.js is loaded in each page <head> (G-HK1NQW55D6).
        gtag.js does not turn plain dataLayer object pushes into GA4 events, so this call is required.
     3. The Apps Script event log (sheetEvent).
   GA4 page_view is sent automatically by gtag('config'); page_view is logged only to the sheet here.
   Events: whatsapp_click, audit_cta_click, service_interest, service_view, goal_select,
   check_complete, check_whatsapp, contact_form_submit, language_switch,
   language_prompt_view, language_prompt_choice.
   Country (V8.5.32): a 2-letter country code from a privacy-light lookup (GeoJS plain-text endpoint,
   no IP in the response, nothing stored but the code), converted locally to an English country name
   (Intl.DisplayNames; the code itself is the fallback). It is additive and can never block delivery.
*/
window.dataLayer = window.dataLayer || [];

/* V8.5.15 — stable direct Google Sheets event logging */
var RASHI_EVENT_LOG_URL = 'https://script.google.com/macros/s/AKfycbyOmclt_vkbJL-44V_PbPsq1vNy7U37NtpmhTeG5_ngW_AYTvc6pvhOZ40_s16enexSzA/exec';
var RASHI_ATTR_KEY = 'rashi_first_touch_v1';
function rashiDevice(){
  var w = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
  return w <= 767 ? 'mobile' : (w <= 1024 ? 'tablet' : 'desktop');
}
/* V8.5.32 — Country for the EXISTING Event Log. Additive only: the Apps Script URL, payload fields
   and fetch/sendBeacon transport below are unchanged; only the value of `country` is filled in.
   Fail-safe: any lookup error, timeout, bad response or blocked request leaves country as ''.
   page_view waits at most RASHI_COUNTRY_WAIT_MS (and is flushed at once if the page is hidden/left);
   every other event is sent immediately with whatever value is already known. */
var RASHI_COUNTRY_URL = 'https://get.geojs.io/v1/ip/country';
var RASHI_COUNTRY_KEY = 'rashi_country_v1';
var RASHI_COUNTRY_WAIT_MS = 1500;
var rashiCountry = '', rashiCountryDone = false, rashiCountryWaiters = [];
/* Local conversion only (no network): IL → Israel, US → United States, GB → United Kingdom. */
function rashiCountryName(code){
  try {
    if (window.Intl && Intl.DisplayNames) {
      var name = new Intl.DisplayNames(['en'], {type: 'region'}).of(code);
      if (name && name !== code && !/^unknown region$/i.test(name)) return name;
    }
  } catch(e) {}
  return code;
}
function rashiCountryFlush(){
  var w = rashiCountryWaiters; rashiCountryWaiters = [];
  w.forEach(function(f){ try { f(); } catch(e) {} });
}
function rashiCountryFinish(code){
  if (rashiCountryDone) return;
  rashiCountryDone = true; rashiCountry = code ? rashiCountryName(code) : '';
  rashiCountryFlush();
}
function rashiWhenCountry(fn, maxWait){
  var fired = false;
  function go(){ if (fired) return; fired = true; fn(); }
  if (rashiCountryDone) { go(); return; }
  rashiCountryWaiters.push(go);
  setTimeout(go, maxWait);
}
(function(){
  try {
    var cached = sessionStorage.getItem(RASHI_COUNTRY_KEY);
    if (cached && /^[A-Z]{2}$/.test(cached)) { rashiCountryFinish(cached); return; }
  } catch(e) {}
  try {
    if (!window.fetch) { rashiCountryFinish(''); return; }
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function(){ try { if (ctrl) ctrl.abort(); } catch(e) {} rashiCountryFinish(''); }, 4000);
    fetch(RASHI_COUNTRY_URL, {cache: 'no-store', credentials: 'omit', signal: ctrl ? ctrl.signal : undefined})
      .then(function(r){ return r.ok ? r.text() : ''; })
      .then(function(t){
        clearTimeout(timer);
        var code = String(t || '').trim().toUpperCase();
        if (!/^[A-Z]{2}$/.test(code)) code = '';
        if (code) { try { sessionStorage.setItem(RASHI_COUNTRY_KEY, code); } catch(e) {} }
        rashiCountryFinish(code);
      })
      .catch(function(){ clearTimeout(timer); rashiCountryFinish(''); });
  } catch(e) { rashiCountryFinish(''); }
  /* Leaving or hiding the page never loses a waiting page_view. */
  try {
    window.addEventListener('pagehide', rashiCountryFlush);
    document.addEventListener('visibilitychange', function(){ if (document.visibilityState === 'hidden') rashiCountryFlush(); });
  } catch(e) {}
})();
function rashiAttribution(){
  var qs = new URLSearchParams(location.search), saved = {};
  try { saved = JSON.parse(localStorage.getItem(RASHI_ATTR_KEY) || '{}') || {}; } catch(e) {}
  var incoming = {
    utm_source: qs.get('utm_source') || '', utm_medium: qs.get('utm_medium') || '',
    utm_campaign: qs.get('utm_campaign') || '', utm_content: qs.get('utm_content') || '',
    utm_term: qs.get('utm_term') || ''
  };
  var hasIncoming = Object.keys(incoming).some(function(k){ return !!incoming[k]; });
  if (!saved.first_landing_page) {
    saved.first_landing_page = location.pathname + location.search;
    saved.first_referrer = document.referrer || '';
    saved.first_seen = new Date().toISOString();
  }
  if (hasIncoming && !saved.utm_source && !saved.utm_medium && !saved.utm_campaign) {
    Object.keys(incoming).forEach(function(k){ saved[k] = incoming[k]; });
  }
  try { localStorage.setItem(RASHI_ATTR_KEY, JSON.stringify(saved)); } catch(e) {}
  return saved;
}
function sheetEvent(event, detail){
  try {
    detail = detail || {};
    var qs = new URLSearchParams(location.search), attr = rashiAttribution();
    var current = {
      utm_source: qs.get('utm_source') || attr.utm_source || '',
      utm_medium: qs.get('utm_medium') || attr.utm_medium || '',
      utm_campaign: qs.get('utm_campaign') || attr.utm_campaign || '',
      utm_content: qs.get('utm_content') || attr.utm_content || '',
      utm_term: qs.get('utm_term') || attr.utm_term || ''
    };
    var noteParts = Object.keys(detail).map(function(k){ return k + '=' + String(detail[k]); });
    noteParts.push('device=' + rashiDevice());
    if (attr.first_landing_page) noteParts.push('first_landing_page=' + attr.first_landing_page);
    if (attr.first_referrer) noteParts.push('first_referrer=' + attr.first_referrer);
    var payload = {
      email: detail.email || '', event_type: event,
      product_offer: detail.service || detail.service_interest || detail.goal || detail.areas || '',
      source_page: location.pathname,
      source_cta: detail.link_location || detail.source || detail.form || detail.label || '',
      referrer_url: document.referrer || attr.first_referrer || '',
      utm_source: current.utm_source, utm_medium: current.utm_medium,
      utm_campaign: current.utm_campaign, utm_content: current.utm_content,
      utm_term: current.utm_term,
      country: rashiCountry, device: rashiDevice(),
      first_landing_page: attr.first_landing_page || '',
      first_source_medium: ((attr.utm_source || '') + (attr.utm_medium ? ' / ' + attr.utm_medium : '')).trim(),
      first_campaign: attr.utm_campaign || '',
      notes: noteParts.join(' | ')
    };
    /* V8.5.29 — resilient direct Sheets delivery. GA4 remains independent. */
    var body = JSON.stringify(payload);
    var sendToSheet = function(){
      return fetch(RASHI_EVENT_LOG_URL, {
        method: 'POST',
        mode: 'no-cors',
        keepalive: true,
        cache: 'no-store',
        headers: {'Content-Type': 'text/plain;charset=UTF-8'},
        body: body
      });
    };
    sendToSheet().catch(function(){
      /* Network/navigation fallback. sendBeacon is especially reliable while a page is unloading. */
      try {
        if (navigator.sendBeacon) {
          navigator.sendBeacon(RASHI_EVENT_LOG_URL, new Blob([body], {type:'text/plain;charset=UTF-8'}));
        }
      } catch(beaconError) {}
    });
  } catch(e) {}
}
function track(event, detail){
  window.dataLayer.push(Object.assign({event: event}, detail || {}));
  try { if (typeof window.gtag === 'function') window.gtag('event', event, Object.assign({}, detail || {})); } catch(e) {}
  sheetEvent(event, detail);
}

document.addEventListener('DOMContentLoaded', function(){
  var HE = document.documentElement.lang === 'he';
  var isRTL = document.documentElement.dir === 'rtl';
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var PHONE = '972532850081';
  rashiWhenCountry(function(){ sheetEvent('page_view', {lang: HE ? 'he' : 'en'}); }, RASHI_COUNTRY_WAIT_MS);
  // Forms ship with a disabled type="button" so nothing can be submitted without this script.
  // The real submit button is switched on only after its WhatsApp handler is attached.
  function enableSubmit(f, keepDisabled){ f.querySelectorAll('[data-js-submit]').forEach(function(b){ b.type = 'submit'; b.disabled = !!keepDisabled; }); }
  function waLink(lines){ return 'https://wa.me/' + PHONE + '?text=' + encodeURIComponent(lines.join('\n')); }

  /* ---------- mobile nav ---------- */
  var burger = document.querySelector('.nav-burger');
  var mobileNav = document.querySelector('.mobile-nav');
  function closeNav(){ if (!mobileNav) return; mobileNav.classList.remove('open'); burger.setAttribute('aria-expanded','false'); }
  if (burger && mobileNav){
    burger.addEventListener('click', function(){
      var open = mobileNav.classList.toggle('open');
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    mobileNav.querySelectorAll('a').forEach(function(a){ a.addEventListener('click', closeNav); });
  }

  /* ---------- floating WhatsApp (desktop) ---------- */
  var waToggle = document.querySelector('[data-wa-toggle]');
  var waPop = document.getElementById('waPop');
  function setPop(open){
    if (!waPop) return;
    waPop.classList.toggle('open', open);
    waToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  if (waToggle && waPop){
    waToggle.addEventListener('click', function(){ setPop(!waPop.classList.contains('open')); });
    var closeBtn = waPop.querySelector('[data-wa-close]');
    if (closeBtn) closeBtn.addEventListener('click', function(){ setPop(false); waToggle.focus(); });
  }
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape'){ setPop(false); closeNav(); } });

  /* ---------- tracking ---------- */
  document.addEventListener('click', function(e){
    var a = e.target.closest('a');
    if (a && a.href.indexOf('wa.me') !== -1) track('whatsapp_click', {link_location: a.dataset.loc || 'unspecified'});
    var cta = e.target.closest('[data-audit-cta]');
    if (cta) track('audit_cta_click', {label: cta.textContent.trim(), link_location: cta.dataset.loc || 'unspecified'});
    var svc = e.target.closest('[data-service]');
    if (svc) track('service_interest', {service: svc.dataset.service, source: 'link'});
  });
  var serviceSelect = document.querySelector('[data-service-select]');
  if (serviceSelect) serviceSelect.addEventListener('change', function(){ track('service_interest', {service: serviceSelect.value, source: 'form'}); });
  document.querySelectorAll('.lang-switch a').forEach(function(a){
    a.addEventListener('click', function(){ track('language_switch', {to: a.getAttribute('hreflang'), from_path: location.pathname}); });
  });

  /* ---------- generic tabs (goal selector + capability tabs) ---------- */
  function initTabs(root, tabSel, onSelect){
    var tabs = Array.prototype.slice.call(root.querySelectorAll(tabSel));
    function select(tab, focus){
      tabs.forEach(function(t){
        var on = t === tab;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        if (on) t.removeAttribute('tabindex'); else t.setAttribute('tabindex','-1');
        var p = document.getElementById(t.getAttribute('aria-controls'));
        if (p){ if (p.hasAttribute('aria-hidden')) p.setAttribute('aria-hidden', on ? 'false' : 'true'); else p.hidden = !on; }
      });
      if (focus) tab.focus();
      if (onSelect) onSelect(tab);
    }
    tabs.forEach(function(tab, i){
      tab.addEventListener('click', function(){ select(tab, false); });
      tab.addEventListener('keydown', function(e){
        var next = isRTL ? 'ArrowLeft' : 'ArrowRight', prev = isRTL ? 'ArrowRight' : 'ArrowLeft';
        if (e.key === next || e.key === 'ArrowDown'){ e.preventDefault(); select(tabs[(i + 1) % tabs.length], true); }
        if (e.key === prev || e.key === 'ArrowUp'){ e.preventDefault(); select(tabs[(i - 1 + tabs.length) % tabs.length], true); }
        if (e.key === 'Home'){ e.preventDefault(); select(tabs[0], true); }
        if (e.key === 'End'){ e.preventDefault(); select(tabs[tabs.length - 1], true); }
      });
    });
  }
  document.querySelectorAll('[data-hub]').forEach(function(h){ initTabs(h, '.hub-tab'); });
  document.querySelectorAll('[data-goal]').forEach(function(g){
    initTabs(g, '.goal-tab', function(tab){ track('goal_select', {goal: tab.dataset.goalId}); });
  });

  /* ---------- how-we-work steps: one reveal ---------- */
  var steps = document.querySelector('[data-steps]');
  if (steps){
    var items = steps.querySelectorAll('.step');
    if (reduceMotion || !('IntersectionObserver' in window)){ items.forEach(function(s){ s.classList.add('on'); }); }
    else {
      var sIO = new IntersectionObserver(function(entries){
        entries.forEach(function(e){
          if (!e.isIntersecting) return;
          sIO.disconnect();
          items.forEach(function(s, i){ setTimeout(function(){ s.classList.add('on'); }, i * 160); });
        });
      }, {threshold: .4});
      sIO.observe(steps);
    }
  }

  /* ---------- FAQ ---------- */
  document.querySelectorAll('.faq-item').forEach(function(item){
    var btn = item.querySelector('.faq-q');
    item.setAttribute('data-open','false');
    btn.setAttribute('aria-expanded','false');
    btn.addEventListener('click', function(){
      var open = item.getAttribute('data-open') === 'true';
      item.closest('.faq').querySelectorAll('.faq-item').forEach(function(i){
        i.setAttribute('data-open','false'); i.querySelector('.faq-q').setAttribute('aria-expanded','false');
      });
      item.setAttribute('data-open', open ? 'false' : 'true');
      btn.setAttribute('aria-expanded', open ? 'false' : 'true');
    });
  });

  /* ---------- quick marketing check ---------- */
  var T = HE ? {
    website: ['האתר שווה בדיקה.', 'נבדוק אם הוא מציג את העסק נכון, עובד טוב בנייד ומקל על לקוחות ליצור קשר.'],
    nosite: ['כדאי לדבר על אתר.', 'לא כל עסק צריך אתר גדול, אבל רוב העסקים צריכים מקום אחד ברור שאפשר לשלוח אליו לקוחות.'],
    google: ['הנוכחות בגוגל שווה בדיקה.', 'נבדוק איך העסק מופיע בחיפוש ובמפות, ואם פרופיל העסק שלם ומעודכן.'],
    paid: ['הפרסום הקיים שווה בדיקה לפני שמוציאים עוד.', 'נסתכל על הקמפיינים, הקריאייטיב, הקהלים, ההצעה ולאן המודעות שולחות אנשים.'],
    conversion: ['שווה לבדוק מה קורה אחרי הקליק.', 'לפעמים המודעה בסדר, והבעיה היא בדף, בטופס או במענה בוואטסאפ.'],
    tracking: ['צריך לבדוק את המדידה.', 'כשלא ברור מאיפה מגיעים הלידים, קשה להחליט איפה להשקיע.'],
    organic: ['הנוכחות האורגנית שווה בדיקה.', 'לקוחות בודקים את הפרופילים שלכם לפני שהם פונים. נראה מה הם רואים היום.'],
    newpaid: ['אפשר לבדוק אם פרסום ממומן מתאים עכשיו.', 'רק אחרי שהבסיס במקום: אתר או דף ברור, נוכחות בגוגל ומדידה.'],
    fine: ['לפי התשובות, הבסיס נראה במקום.', 'בבדיקה נתמקד במה אפשר לשפר, ובמה שהמתחרים שלכם עושים היום.'],
    also: 'שווה להסתכל גם על: ',
    head: 'שלום רשי דיגיטל, אשמח לבדיקה שיווקית חינם. אלה התשובות שלי מהבדיקה המהירה:',
    focus: 'לפי הבדיקה, כדאי להתחיל ב:', need: 'נשארו שאלות בלי תשובה. סמנו תשובה בכל שאלה.'
  } : {
    website: ['Your website is worth reviewing.', "We'd check whether it presents the business properly, works well on mobile and makes it easy to get in touch."],
    nosite: ["It's worth talking about a website.", "Not every business needs a big site, but most need one clear place to send customers."],
    google: ['Your Google presence is worth checking.', 'We would look at how you appear in Search and Maps, and whether your Business Profile is complete and current.'],
    paid: ['Your current advertising is worth reviewing before spending more.', 'We would look at the campaigns, creative, audiences, offer and where the ads send people.'],
    conversion: ["It's worth checking what happens after the click.", 'Sometimes the ad is fine and the problem is the page, the form or the reply on WhatsApp.'],
    tracking: ['Tracking needs to be checked.', "If it's not clear where enquiries come from, it's hard to decide where to spend."],
    organic: ['Your organic presence is worth a look.', 'Customers check your profiles before they get in touch. We would look at what they see today.'],
    newpaid: ['We can look at whether paid advertising makes sense now.', 'Only once the basics are in place: a clear site or page, a Google presence and tracking.'],
    fine: ['From your answers, the basics look covered.', 'The review would focus on what can be improved, and what your competitors are doing now.'],
    also: 'Also worth a look: ',
    head: "Hi Rashi Digital, I'd like a free marketing review. Here are my answers from the quick check:",
    focus: 'The check suggested starting with:', need: 'A few questions are unanswered. Please pick an answer for each one.'
  };

  var form = document.querySelector('[data-check]');
  if (form){
    var result = form.parentNode.querySelector('[data-check-result]');
    var msg = form.querySelector('[data-check-msg]');
    function val(n){ var el = form.querySelector('input[name="' + n + '"]:checked'); return el ? el.value : null; }
    function label(n){ var el = form.querySelector('input[name="' + n + '"]:checked'); return el ? el.nextElementSibling.textContent.trim() : ''; }
    form.addEventListener('change', function(e){
      var q = e.target.closest('.q'); if (q) q.classList.remove('missing');
      if (msg) msg.textContent = '';
    });
    form.addEventListener('submit', function(e){
      e.preventDefault();
      var names = ['website','google','paid','results','organic','measure'], missing = [];
      names.forEach(function(n){ if (!val(n)) missing.push(n); });
      form.querySelectorAll('.q').forEach(function(q){ q.classList.toggle('missing', missing.indexOf(q.dataset.q) !== -1); });
      if (missing.length){
        msg.textContent = T.need;
        var first = form.querySelector('.q[data-q="' + missing[0] + '"] input'); if (first) first.focus();
        return;
      }
      var w = val('website'), g = val('google'), p = val('paid'), r = val('results'), o = val('organic'), m = val('measure');
      var areas = [];   // ordered by what we'd normally look at first
      var running = (p === 'yes' || p === 'tried');
      if (w === 'none') areas.push('nosite');
      else if (w === 'improve' || w === 'outdated' || w === 'unsure') areas.push('website');
      if (g !== 'yes') areas.push('google');
      if (running && r !== 'yes') areas.push('paid');
      if (running && r === 'no') areas.push('conversion');
      if (m !== 'yes') areas.push('tracking');
      if (o !== 'regularly') areas.push('organic');
      if (!running && w !== 'none' && g === 'yes') areas.push('newpaid');
      var top = areas.slice(0, 3), rest = [];   // show only the most relevant priorities
      var list = result.querySelector('[data-res-list]');
      list.innerHTML = '';
      (top.length ? top : ['fine']).forEach(function(k, i){
        var li = document.createElement('li');
        li.innerHTML = '<i>0' + (i + 1) + '</i><div><b></b><span></span></div>';
        li.querySelector('b').textContent = T[k][0];
        li.querySelector('span').textContent = T[k][1];
        list.appendChild(li);
      });
      var also = result.querySelector('[data-res-also]');
      also.textContent = rest.length ? T.also + rest.map(function(k){ return T[k][0].replace(/\.$/, ''); }).join(' · ') : '';
      also.hidden = !rest.length;
      var lines = [T.head];
      form.querySelectorAll('.q').forEach(function(q){
        lines.push('• ' + q.querySelector('legend .qt').textContent.trim() + ' ' + label(q.dataset.q));
      });
      lines.push('', T.focus);
      (top.length ? top : ['fine']).forEach(function(k){ lines.push('• ' + T[k][0]); });
      var btn = result.querySelector('[data-res-wa]');
      btn.href = waLink(lines);
      result.hidden = false;
      track('check_complete', {areas: areas.join(',') || 'none'});
      result.querySelector('h3').focus();
      btn.onclick = function(){ track('check_whatsapp', {areas: areas.join(',') || 'none'}); };
    });
    // V8.4.3 one-question-at-a-time wizard
    var countEl = form.parentNode.querySelector('[data-check-count]');
    var dotsWrap = form.parentNode.querySelector('.qc-dots');
    var submitBtn = form.querySelector('[data-js-submit]');
    var qs = Array.prototype.slice.call(form.querySelectorAll('.q'));
    var step = 0;
    var actions = form.querySelector('.check-actions');
    var backBtn = document.createElement('button'); backBtn.type='button'; backBtn.className='qc-back'; backBtn.textContent=HE?'→ חזרה':'← Back';
    var nextBtn = document.createElement('button'); nextBtn.type='button'; nextBtn.className='btn btn-wa btn-lg qc-next'; nextBtn.textContent=HE?'לשאלה הבאה ←':'Next question →';
    actions.insertBefore(backBtn, actions.firstChild); actions.insertBefore(nextBtn, submitBtn);
    submitBtn.textContent=HE?'ראו איפה כדאי להתחיל':'See where we’d start';
    function focusStep(){
      var q = qs[step]; if (!q) return;
      var el = q.querySelector('input:checked') || q.querySelector('input');
      if (el) { try { el.focus({preventScroll:true}); } catch(e){ el.focus(); } }
    }
    function showStep(n, moveFocus){
      step=Math.max(0,Math.min(5,n)); qs.forEach(function(q,i){q.classList.toggle('qc-active',i===step);});
      backBtn.hidden=step===0; nextBtn.hidden=step===5; submitBtn.hidden=step!==5;
      var pct=Math.round((step+1)/6*100); if(dotsWrap)dotsWrap.style.setProperty('--qc-progress',pct+'%');
      if(countEl) countEl.textContent=HE?('שאלה '+(step+1)+' מתוך 6 · '+pct+'%'):('Question '+(step+1)+' of 6 · '+pct+'%');
      if (moveFocus) focusStep();
    }
    function currentAnswered(){return !!qs[step].querySelector('input:checked');}
    function goNext(moveFocus){
      if(!currentAnswered()){qs[step].classList.add('missing'); if(msg) msg.textContent = HE ? 'בחרו תשובה כדי להמשיך.' : 'Choose an answer to continue.'; return;}
      if(msg) msg.textContent='';
      showStep(step+1, moveFocus);
    }
    nextBtn.addEventListener('click',function(){ goNext(true); });
    backBtn.addEventListener('click',function(){ showStep(step-1, true); });
    // Pointer/touch selections auto-advance; keyboard selections (arrows/Space) never do.
    var pointerPick = 0;
    form.addEventListener('pointerdown',function(e){ if (e.target.closest('.opts label')) pointerPick = Date.now(); });
    form.addEventListener('change',function(){
      qs[step].classList.remove('missing'); if(msg) msg.textContent='';
      var byPointer = (Date.now() - pointerPick) < 1500; pointerPick = 0;
      if(byPointer && step<5){ var at=step; setTimeout(function(){ if(step===at) showStep(step+1, true); },180); }
    });
    // Enter on an answer: next question, or the result on question 6.
    form.addEventListener('keydown',function(e){
      if (e.key !== 'Enter' || !e.target.matches('input[type=radio]')) return;
      e.preventDefault();
      if (step<5) goNext(true); else if (currentAnswered()) submitBtn.click();
    });
    enableSubmit(form, true); submitBtn.disabled=false; showStep(0, false);
    var restart = form.parentNode.querySelector('[data-check-restart]');
    if(restart) restart.addEventListener('click',function(){form.reset();result.hidden=true;qs.forEach(function(q){q.classList.remove('missing');});if(msg)msg.textContent='';showStep(0, false);form.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(focusStep,350);});
  }



  /* ---------- language suggestion (V8.4.5: small, only when the browser language clearly differs) ---------- */
  (function(){
    var KEY = 'rd_language_preference_v1';
    function remember(lang){ try { localStorage.setItem(KEY, lang); } catch(e) {} }
    // A manual choice in the header switch also counts as a remembered preference.
    document.querySelectorAll('.lang-switch a[hreflang]').forEach(function(a){
      a.addEventListener('click', function(){ remember(a.getAttribute('hreflang')); });
    });
    try { if (localStorage.getItem(KEY)) return; } catch(e) { return; }
    if (/[?&](utm_[a-z_]+|gclid|fbclid|gbraid|wbraid|msclkid|ttclid)=/i.test(location.search)) return;
    var pageHe = document.documentElement.lang === 'he';
    var langs = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || '']).map(function(l){ return String(l).toLowerCase(); });
    var prefersHe = /^(he|iw)\b/.test(langs[0] || '');
    var knowsHe = langs.some(function(l){ return /^(he|iw)\b/.test(l); });
    var suggest = null;
    if (!pageHe && prefersHe) suggest = 'he';          // Hebrew-first browser on an English page
    else if (pageHe && !knowsHe) suggest = 'en';       // no Hebrew at all in the browser, on a Hebrew page
    if (!suggest) return;
    var target = document.querySelector('.lang-switch a[hreflang="' + suggest + '"]');
    if (!target) return;
    var he = suggest === 'he';
    var bar = document.createElement('div');
    bar.className = 'lang-hint' + (pageHe ? ' on-rtl-page' : '');
    bar.setAttribute('role', 'region');
    bar.setAttribute('lang', suggest); bar.setAttribute('dir', he ? 'rtl' : 'ltr');
    bar.setAttribute('aria-label', he ? 'הצעת שפה' : 'Language suggestion');
    bar.innerHTML = '<p>' + (he ? 'האתר זמין גם בעברית.' : 'This site is also available in English.') + '</p>' +
      '<button type="button" class="lang-hint-go">' + (he ? 'לעברית' : 'English') + '</button>' +
      '<button type="button" class="lang-hint-x" aria-label="' + (he ? 'סגירה' : 'Close') + '">×</button>';
    function close(choice){ remember(choice); bar.classList.remove('is-open'); setTimeout(function(){ bar.remove(); }, 200); }
    bar.querySelector('.lang-hint-go').addEventListener('click', function(){
      track('language_prompt_choice', {choice: suggest, page_path: location.pathname});
      remember(suggest);
      location.href = target.href.split('#')[0] + location.hash;
    });
    bar.querySelector('.lang-hint-x').addEventListener('click', function(){ track('language_prompt_choice', {choice: pageHe ? 'he' : 'en', page_path: location.pathname}); close(pageHe ? 'he' : 'en'); });
    bar.addEventListener('keydown', function(e){ if (e.key === 'Escape') close(pageHe ? 'he' : 'en'); });
    setTimeout(function(){
      document.body.appendChild(bar);
      track('language_prompt_view', {suggested: suggest, page_path: location.pathname});
      requestAnimationFrame(function(){ bar.classList.add('is-open'); });
    }, 1200);
  })();

  /* ---------- service section visibility ---------- */
  (function(){
    if (!('IntersectionObserver' in window)) return;
    var seen = {};
    var observer = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if (!entry.isIntersecting || entry.intersectionRatio < 0.45) return;
        var id = entry.target.id;
        if (!id || seen[id]) return;
        seen[id] = true;
        track('service_view', {service:id, page_path:location.pathname});
        observer.unobserve(entry.target);
      });
    }, {threshold:[0.45]});
    document.querySelectorAll('article.sd[id]').forEach(function(el){ observer.observe(el); });
  })();

  /* ---------- contact form -> WhatsApp (services) ---------- */
  var cform = document.querySelector('[data-audit-form]');
  if (cform){
    cform.addEventListener('submit', function(e){
      e.preventDefault();
      var d = new FormData(cform);
      var sel = cform.querySelector('[name="interest"]');
      var interest = sel ? sel.options[sel.selectedIndex].text : '';
      var lines = HE ? [
        'היי רשי דיגיטל, אשמח לבדיקה שיווקית חינם.',
        'שם: ' + (d.get('name') || ''), 'עסק / תחום: ' + (d.get('business') || ''),
        'אתר / פרופיל: ' + (d.get('site') || ''), 'מה מעניין אותי: ' + interest,
        'שוק ושפה: ' + (d.get('market') || ''), 'מה ניסינו ומה רוצים לשנות: ' + (d.get('goal') || '')
      ] : [
        "Hi Rashi Digital, I'd like a free marketing review.",
        'Name: ' + (d.get('name') || ''), 'Business / industry: ' + (d.get('business') || ''),
        'Website / profile: ' + (d.get('site') || ''), 'Interested in: ' + interest,
        'Market and language: ' + (d.get('market') || ''), 'Tried so far / want to change: ' + (d.get('goal') || '')
      ];
      track('contact_form_submit', {form: 'review', service_interest: sel ? sel.value : '', lang: HE ? 'he' : 'en'});
      window.open(waLink(lines), '_blank', 'noopener');
    });
    enableSubmit(cform);
  }
});

/* V8.5.1 mobile supporting-skills carousel: one active-card state from the real scroll position */
(function(){
  var RTL = document.documentElement.dir === 'rtl';
  var REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.querySelectorAll('[data-hub]').forEach(function(hub){
    var track=hub.querySelector('.hub-track'), panels=track?Array.prototype.slice.call(track.querySelectorAll('.hub-panel')):[];
    var dots=hub.querySelector('.hub-dots'), count=hub.querySelector('.hub-count'), prev=hub.querySelector('.hub-prev'), next=hub.querySelector('.hub-next');
    if(!track||!panels.length||!dots||!prev||!next) return;
    var current=0, mobile=window.matchMedia('(max-width:900px)');
    dots.innerHTML='';
    panels.forEach(function(_,i){var d=document.createElement('span');d.className='hub-dot'+(i===0?' is-active':'');dots.appendChild(d);});
    var dotEls=Array.prototype.slice.call(dots.children);
    if(count){ count.setAttribute('aria-live','polite'); count.setAttribute('dir','ltr'); }
    function sync(i){
      current=Math.max(0,Math.min(panels.length-1,i));
      if(count) count.textContent=(current+1)+' / '+panels.length;
      dotEls.forEach(function(d,j){d.classList.toggle('is-active',j===current);});
      prev.disabled=current===0; next.disabled=current===panels.length-1;
    }
    // Active card = the panel whose leading edge is closest to the track's leading edge (works for LTR and RTL)
    function activeFromScroll(){
      var w=track.clientWidth||1;
      return Math.round(Math.abs(track.scrollLeft)/w);
    }
    function go(i){
      i=Math.max(0,Math.min(panels.length-1,i));
      track.scrollTo({left:(RTL?-1:1)*i*track.clientWidth,behavior:REDUCE?'auto':'smooth'});
      sync(i);
    }
    prev.addEventListener('click',function(){go(current-1);});
    next.addEventListener('click',function(){go(current+1);});
    var raf=0, settle=0;
    function onScroll(){
      if(!mobile.matches) return;
      cancelAnimationFrame(raf); raf=requestAnimationFrame(function(){ sync(activeFromScroll()); });
      clearTimeout(settle); settle=setTimeout(function(){ sync(activeFromScroll()); },120);
    }
    track.addEventListener('scroll',onScroll,{passive:true});
    if('onscrollend' in window) track.addEventListener('scrollend',function(){ if(mobile.matches) sync(activeFromScroll()); });
    window.addEventListener('resize',function(){ if(mobile.matches){ track.scrollLeft=(RTL?-1:1)*current*track.clientWidth; } });
    function mode(){
      if(mobile.matches){panels.forEach(function(p){p.setAttribute('aria-hidden','false');});sync(activeFromScroll());}
      else{hub.querySelectorAll('.hub-tab').forEach(function(t){var p=document.getElementById(t.getAttribute('aria-controls'));if(p)p.setAttribute('aria-hidden',t.getAttribute('aria-selected')==='true'?'false':'true');});}
    }
    mobile.addEventListener?mobile.addEventListener('change',mode):mobile.addListener(mode); mode();
  });
})();


/* V8.5.20 — footer accordions exist on mobile only; desktop keeps plain headings */
(function(){
  var footer=document.querySelector('.footer');
  if(!footer) return;
  var mq=window.matchMedia('(max-width:700px)');
  var cols=Array.prototype.slice.call(footer.querySelectorAll('.footer-grid > .footer-col:not(.footer-social)'));

  cols.forEach(function(col,i){
    var heading=col.querySelector(':scope > .h5');
    if(!heading) return;
    heading.dataset.footerLabel=heading.textContent.trim();
    col.dataset.footerIndex=String(i);
  });

  function closeAll(){
    cols.forEach(function(col){
      col.classList.remove('is-open');
      var b=col.querySelector('.footer-accordion-toggle');
      if(b) b.setAttribute('aria-expanded','false');
    });
  }

  function buildMobile(){
    cols.forEach(function(col){
      var heading=col.querySelector(':scope > .h5');
      if(!heading || heading.querySelector('.footer-accordion-toggle')) return;
      var label=heading.dataset.footerLabel || heading.textContent.trim();
      var idx=col.dataset.footerIndex || '0';
      var contentId='footer-accordion-'+idx+'-'+(document.documentElement.lang||'en')+'-content';
      col.classList.add('footer-accordion');
      var ids=[];
      Array.prototype.slice.call(col.children).forEach(function(el,j){ if(el===heading) return; el.id=contentId+'-'+j; ids.push(el.id); });
      var btn=document.createElement('button');
      btn.type='button'; btn.className='footer-accordion-toggle';
      btn.setAttribute('aria-expanded','false'); if(ids.length) btn.setAttribute('aria-controls',ids.join(' '));
      btn.textContent=label;
      btn.addEventListener('click',function(){
        var open=!col.classList.contains('is-open');
        closeAll();
        if(open){col.classList.add('is-open');btn.setAttribute('aria-expanded','true');}
      });
      heading.textContent=''; heading.appendChild(btn);
    });
    closeAll();
  }

  function buildDesktop(){
    cols.forEach(function(col){
      var heading=col.querySelector(':scope > .h5');
      if(!heading) return;
      var label=heading.dataset.footerLabel || heading.textContent.trim();
      heading.textContent=label; /* removes the mobile button and therefore its + pseudo-element */
      col.classList.remove('footer-accordion','is-open');
      Array.prototype.slice.call(col.children).forEach(function(el){ if(el!==heading && /^footer-accordion-/.test(el.id||'')) el.removeAttribute('id'); });
    });
  }

  function applyFooterMode(){ if(mq.matches) buildMobile(); else buildDesktop(); }
  if(mq.addEventListener) mq.addEventListener('change',applyFooterMode); else mq.addListener(applyFooterMode);
  applyFooterMode();
})();
