/* ---------- Offline scoring (docs/superpowers/specs/2026-10-29-offline-scoring-design.md) ----------
   DDOffline keeps what the organiser app needs to open and keep scoring with no signal, on the phone itself:
     p:<org>        the signed-in organiser (what /api/auth/me returned)
     l:<org>        the event list (the /api/tournaments rows)
     e:<org>:<id>   the last server copy of an event ({data, updated_at})
     q:<org>:<id>   an event's queue: the copy waiting to be sent, and its match changes
     last           the id of the organiser who last signed in on this phone
   Everything is keyed by organiser, so one organiser's queue is never read or sent by another.
   IndexedDB in the browser (one database "dartdraw-offline", one store "kv"); a Map where there is no IndexedDB (tests).
   Every call resolves, never rejects: storage that fails (private mode, full, cleared) gives null/false, and the app
   carries on as it did before this file existed.
   A queue entry is { data, expectedUpdatedAt, rev, changes:[MatchChange], sent:[fingerprint], parked:null|{reason, changes, at} }. */
var DDOffline = (function(){
  var backend = null, mem = new Map(), dbp = null, chain = Promise.resolve(), warned = false;
  var memOpts = {};   // tests: { writeDelay: ms } (a write finishes later, as IndexedDB's do), { failWrites: true }
  function warn(e){ if(!warned){ warned = true; try{ console.warn('DartDraw offline storage unavailable: ' + (e && e.message ? e.message : e)); }catch(x){} } }
  function useBackend(b, opts){ backend = b; dbp = null; memOpts = opts || {}; }
  function kind(){ if(!backend) backend = (typeof indexedDB !== 'undefined' && indexedDB) ? 'idb' : 'memory'; return backend; }
  function db(){
    if(dbp) return dbp;
    dbp = new Promise(function(resolve, reject){
      var req = indexedDB.open('dartdraw-offline', 1);
      req.onupgradeneeded = function(){ req.result.createObjectStore('kv'); };
      req.onsuccess = function(){
        var d = req.result;
        d.onclose = function(){ dbp = null; };              // iOS can drop the connection while the tab is in the background
        d.onversionchange = function(){ try{ d.close(); }catch(e){} dbp = null; };
        resolve(d);
      };
      req.onerror = function(){ reject(req.error); };
    });
    dbp.catch(function(){ dbp = null; });
    return dbp;
  }
  function idbDo(mode, fn, retried){
    return db().then(function(d){
      return new Promise(function(resolve, reject){
        var tx = d.transaction('kv', mode), st = tx.objectStore('kv'), out;
        var r = fn(st);
        if(r) r.onsuccess = function(){ out = r.result; };
        tx.oncomplete = function(){ resolve(out); };
        tx.onerror = tx.onabort = function(){ reject(tx.error); };
      });
    }).catch(function(e){
      dbp = null;   // open again next time; one retry now (a closed connection throws as the transaction starts)
      if(retried) throw e;
      return idbDo(mode, fn, true);
    });
  }
  function memWrite(fn){
    if(memOpts.failWrites) return Promise.reject(new Error('QuotaExceededError'));
    if(!memOpts.writeDelay){ fn(); return; }
    return new Promise(function(r){ setTimeout(function(){ fn(); r(); }, memOpts.writeDelay); });
  }
  function clone(v){ return v == null ? v : JSON.parse(JSON.stringify(v)); }
  function get(k){
    return afterWrites(function(){
      if(kind() === 'memory') return clone(mem.has(k) ? mem.get(k) : null);
      return idbDo('readonly', function(st){ return st.get(k); }).then(function(v){ return v === undefined ? null : v; }, function(e){ warn(e); return null; });
    });
  }
  /* A read sees every write made before it (a queue deleted after a save is not read back). */
  function afterWrites(fn){ return chain.then(fn, fn); }
  /* Writes run one after another, so a later write never lands before an earlier one. */
  function serial(fn){
    var p = chain.then(fn, fn);
    chain = p.then(function(){}, function(){});
    return p.then(function(){ return true; }, function(e){ warn(e); return false; });
  }
  function put(k, v){
    return serial(function(){
      if(kind() === 'memory') return memWrite(function(){ mem.set(k, clone(v)); });
      return idbDo('readwrite', function(st){ st.put(clone(v), k); });
    });
  }
  function del(k){
    return serial(function(){
      if(kind() === 'memory') return memWrite(function(){ mem.delete(k); });
      return idbDo('readwrite', function(st){ st.delete(k); });
    });
  }
  function keys(prefix){
    return afterWrites(function(){
      if(kind() === 'memory') return Array.from(mem.keys()).filter(function(k){ return k.indexOf(prefix) === 0; });
      return idbDo('readonly', function(st){ return st.getAllKeys(); }).then(function(ks){ return (ks || []).filter(function(k){ return String(k).indexOf(prefix) === 0; }); }, function(e){ warn(e); return []; });
    });
  }
  var api = {
    useBackend: useBackend,
    putProfile: function(org, me){ return put('p:' + org, me).then(function(ok){ return ok ? put('last', org) : false; }); },
    getProfile: function(org){ return get('p:' + org); },
    getLastOrganizerId: function(){ return get('last'); },
    /* The device no longer opens offline as org; its queue and copies stay, to be sent after the next real sign-in. */
    forgetProfile: function(org){ return del('p:' + org).then(function(){ return get('last'); }).then(function(last){ return last === org ? del('last') : true; }); },
    putList: function(org, rows){ return put('l:' + org, rows); },
    getList: function(org){ return get('l:' + org); },
    putEvent: function(org, id, row){ return put('e:' + org + ':' + id, row); },
    getEvent: function(org, id){ return get('e:' + org + ':' + id); },
    putQueue: function(org, id, entry){ return put('q:' + org + ':' + id, entry); },
    getQueue: function(org, id){ return get('q:' + org + ':' + id); },
    deleteQueue: function(org, id){ return del('q:' + org + ':' + id); },
    listQueue: function(org){
      var pre = 'q:' + org + ':';
      return keys(pre).then(function(ks){
        return Promise.all(ks.map(function(k){ return get(k).then(function(entry){ return { id: String(k).slice(pre.length), entry: entry }; }); }));
      }).then(function(list){ return list.filter(function(x){ return x.entry; }); });
    },
    clearOrganizer: function(org){
      return Promise.all(['p:', 'l:', 'e:', 'q:'].map(function(p){ return keys(p + org); })).then(function(groups){
        var all = [].concat.apply([], groups).filter(function(k){ return k === 'p:' + org || k === 'l:' + org || k.indexOf(':' + org + ':') === 1; });
        return Promise.all(all.map(del));
      }).then(function(){ return get('last'); }).then(function(last){ return last === org ? del('last') : true; });
    },
    requestPersist: function(){
      try{ if(typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.persist === 'function') return Promise.resolve(navigator.storage.persist()).catch(function(){ return false; }); }catch(e){}
      return Promise.resolve(false);
    },
    matchChanges: matchChanges,
    applyMatchChange: applyMatchChange,
    knockoutCascade: knockoutCascade
  };

  /* ---------- Match changes ----------
     A MatchChange is { key, kind:'rr'|'ko', label, before, after }:
       rr  key 'rr:<groupId>:<scoreKey>'          after = the g.scores object, or null when cleared
       ko  key 'ko:<bracketKey>:<aEntryId>|<bEntryId>'   after = the match's result fields
     Knockout brackets: knockout, knockoutLosers (the Group Boards Finals lives in knockout) and every pod:<id>. A match
     is keyed by who plays in it, so a bracket that changed shape on the server never takes a result meant for others. */
  var KO_FIELDS = ['aLegs', 'bLegs', 'winnerId', 'void', 'wo', 'called', 'calledAt', 'calledPair', 'board'];
  function koResult(m){ var o = {}; KO_FIELDS.forEach(function(f){ o[f] = (m[f] === undefined || m[f] === false) ? null : m[f]; }); return o; }
  function same(a, b){ return JSON.stringify(a == null ? null : a) === JSON.stringify(b == null ? null : b); }
  function nameIn(t, id){ var e = (t.entriesList || []).find(function(x){ return x.id === id; }); return e ? (e.name || '') : ''; }
  function brackets(t){
    var out = [];
    ['knockout', 'knockoutLosers'].forEach(function(k){ if(t[k] && Array.isArray(t[k].rounds)) out.push({ key: k, bracket: t[k], name: '' }); });
    (Array.isArray(t.pods) ? t.pods : []).forEach(function(p){ if(p && p.bracket && Array.isArray(p.bracket.rounds)) out.push({ key: 'pod:' + p.id, bracket: p.bracket, name: p.label }); });
    return out;
  }
  function koMatches(t){
    var map = {};
    brackets(t).forEach(function(b){
      b.bracket.rounds.forEach(function(round, ri){
        (round || []).forEach(function(m, mi){
          if(!m || !m.aEntryId || !m.bEntryId) return;
          map['ko:' + b.key + ':' + m.aEntryId + '|' + m.bEntryId] = { m: m, ri: ri, mi: mi, b: b };
        });
      });
    });
    return map;
  }
  function rrMatches(t){
    var map = {};
    (Array.isArray(t.groups) ? t.groups : []).forEach(function(g){
      if(!g || !g.id) return;
      Object.keys(g.scores || {}).forEach(function(k){ map['rr:' + g.id + ':' + k] = { g: g, k: k, s: g.scores[k] }; });
    });
    return map;
  }
  function legsText(a, b){ return (a == null && b == null) ? '' : '  ' + (a == null ? '-' : a) + '–' + (b == null ? '-' : b); }
  function rrLabel(t, g, k, s){
    var ids = k.split('|');
    var L = (typeof T === 'function') ? T : function(x){ return x; };
    return L('off.groupLabel', { g: g.label || '' }) + ' — ' + nameIn(t, ids[0]) + ' v ' + nameIn(t, ids[1]) + (s ? legsText(s.legs1, s.legs2) : '');
  }
  function koLabel(t, x, r){
    var round = '';
    try{ round = typeof koRoundName === 'function' ? koRoundName(x.b.bracket, x.ri) : ''; }catch(e){ round = ''; }
    var L = (typeof T === 'function') ? T : function(y){ return y; };
    var where = x.b.name ? L('off.groupLabel', { g: x.b.name }) + ' ' + round : round;
    var res = r.void ? '  ' + L('off.void') : legsText(r.aLegs, r.bLegs);
    return where + ' — ' + nameIn(t, x.m.aEntryId) + ' v ' + nameIn(t, x.m.bEntryId) + res;
  }
  /* What changed, match by match, from base (the last server copy; may be null) to cur. */
  function matchChanges(base, cur){
    var out = [];
    if(!cur) return out;
    var b = base || {};
    var rb = rrMatches(b), rc = rrMatches(cur);
    Object.keys(rc).forEach(function(k){
      var before = rb[k] ? rb[k].s : null;
      if(!same(before, rc[k].s)) out.push({ key: k, kind: 'rr', label: rrLabel(cur, rc[k].g, rc[k].k, rc[k].s), before: clone(before), after: clone(rc[k].s) });
    });
    Object.keys(rb).forEach(function(k){
      if(rc[k]) return;
      var g = (cur.groups || []).find(function(x){ return x.id === rb[k].g.id; });
      if(g) out.push({ key: k, kind: 'rr', label: rrLabel(cur, g, rb[k].k, null), before: clone(rb[k].s), after: null });
    });
    var kb = koMatches(b), kc = koMatches(cur);
    Object.keys(kc).forEach(function(k){
      var after = koResult(kc[k].m), before = kb[k] ? koResult(kb[k].m) : koResult({});
      if(!same(before, after)) out.push({ key: k, kind: 'ko', label: koLabel(cur, kc[k], after), before: before, after: after });
    });
    return out;
  }
  /* Puts one change onto t (a fresh server copy). 'same': t already has it. 'applied': written. 'differs': t has a
     different result for that match (written only with opts.force). 'missing': no such match in t. */
  function applyMatchChange(t, c, opts){
    opts = opts || {};
    if(!t || !c) return 'missing';
    if(c.kind === 'rr'){
      var parts = c.key.split(':'), gid = parts[1], sk = parts.slice(2).join(':');
      var g = (t.groups || []).find(function(x){ return x.id === gid; });
      if(!g) return 'missing';
      var ids = sk.split('|');
      if(ids.some(function(id){ return (g.entryIds || []).indexOf(id) < 0; })) return 'missing';
      var now = g.scores ? g.scores[sk] : null;
      if(same(now, c.after)) return 'same';
      if(now && !same(now, c.before) && !opts.force) return 'differs';
      if(!g.scores) g.scores = {};
      if(c.after == null) delete g.scores[sk]; else g.scores[sk] = clone(c.after);
      return 'applied';
    }
    var x = koMatches(t)[c.key];
    if(!x) return 'missing';
    var cur = koResult(x.m);
    if(same(cur, c.after)) return 'same';
    var hasResult = cur.winnerId != null || cur.aLegs != null || cur.bLegs != null || !!cur.void;
    if(hasResult && !same(cur, c.before) && !opts.force) return 'differs';
    /* A different winner here would clear results already played further on (as a correction on screen asks first). */
    if(!opts.force && knockoutCascade(t, c)) return 'differs';
    var apply = function(){ KO_FIELDS.forEach(function(f){ var v = c.after[f]; if(v == null || v === false) delete x.m[f]; else x.m[f] = v; }); };
    var pod = (typeof podByKey === 'function') ? podByKey(t, x.b.key) : null;
    if(pod && typeof podsApplyResult === 'function'){
      var res = podsApplyResult(t, pod, apply);
      if(res && res.ok === false) return 'missing';
    } else {
      apply();
      if(typeof propagateByes === 'function') propagateByes(x.b.bracket.rounds);
      if(c.after.void && typeof settleVoids === 'function') settleVoids(x.b.bracket.rounds, true);
    }
    return 'applied';
  }
  /* True when putting c onto t changes who goes through from that match while a later match it feeds has a result
     (in its bracket; for a Group Boards group, also the Finals match the group's winner plays). */
  function knockoutCascade(t, c){
    if(!t || !c || c.kind !== 'ko') return false;
    var x = koMatches(t)[c.key];
    if(!x) return false;
    var cur = koResult(x.m);
    if((cur.winnerId || null) === (c.after.winnerId || null) && !!cur.void === !!c.after.void) return false;
    var rounds = x.b.bracket.rounds, played = function(m){ return !!m && !m.bye && (m.winnerId != null || m.aLegs != null || m.bLegs != null); };
    for(var r = x.ri + 1, idx = Math.floor(x.mi / 2); r < rounds.length; r++, idx = Math.floor(idx / 2)) if(played(rounds[r][idx])) return true;
    if(x.b.key.indexOf('pod:') === 0 && x.ri === rounds.length - 1 && t.knockout && t.knockout.podFinals){
      var pid = x.b.key.slice(4), fin = t.knockout.rounds;
      for(var ri = 0; ri < fin.length; ri++) for(var mi = 0; mi < fin[ri].length; mi++){
        var m = fin[ri][mi];
        if((m.aFromPod === pid || m.bFromPod === pid) && played(m)) return true;
      }
    }
    return false;
  }
  return api;
})();
