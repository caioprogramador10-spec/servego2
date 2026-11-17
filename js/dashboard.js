/* ==========================================================================
   ServeGo — Componentes de dashboard (SVG puro, sem bibliotecas)
   KPI com tendência e minigráfico, gráfico de área com dica ao passar o
   mouse, rosca de distribuição e lista de barras.
   ========================================================================== */
(function (SG) {
  var ui = SG.ui;
  var D = {};
  var seq = 0;

  /** Variação percentual entre dois períodos (null quando não há base). */
  D.delta = function (cur, prev) {
    if (!prev) return cur ? null : 0;
    return ((cur - prev) / prev) * 100;
  };

  function deltaBadge(pct, invert) {
    if (pct === null || pct === undefined || isNaN(pct)) return "";
    var flat = Math.abs(pct) < 0.5;
    var good = invert ? pct < 0 : pct > 0;
    var cls = flat ? "flat" : good ? "up" : "down";
    var arrow = flat ? "" : pct > 0
      ? '<svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M6 2.5v7M2.8 5.7 6 2.5l3.2 3.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      : '<svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M6 9.5v-7M2.8 6.3 6 9.5l3.2-3.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    var txt = (pct > 0 ? "+" : "") + pct.toLocaleString(SG.config.app.locale, { maximumFractionDigits: 1 }) + "%";
    return '<span class="dash-delta dash-delta--' + cls + '">' + arrow + txt + "</span>";
  }
  D.deltaBadge = deltaBadge;

  /** Teto "redondo" para a escala do gráfico. */
  function niceMax(v) {
    if (v <= 0) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(v)));
    var n = v / p;
    var step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
    return step * p;
  }

  /** Curva suave (Catmull-Rom → Bézier) que não ultrapassa o chão. */
  function smoothPath(pts, floor) {
    if (!pts.length) return "";
    var d = "M" + pts[0][0] + "," + pts[0][1];
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      var t = 0.18;
      var c1x = p1[0] + (p2[0] - p0[0]) * t, c1y = Math.min(floor, p1[1] + (p2[1] - p0[1]) * t);
      var c2x = p2[0] - (p3[0] - p1[0]) * t, c2y = Math.min(floor, p2[1] - (p3[1] - p1[1]) * t);
      d += " C" + c1x.toFixed(1) + "," + c1y.toFixed(1) + " " + c2x.toFixed(1) + "," + c2y.toFixed(1) + " " + p2[0] + "," + p2[1];
    }
    return d;
  }

  /** Minigráfico de tendência para os cartões. */
  D.sparkline = function (values, tone) {
    var W = 120, H = 40;
    var max = Math.max.apply(null, values.concat([1]));
    var step = values.length > 1 ? W / (values.length - 1) : W;
    var pts = values.map(function (v, i) {
      return [+(i * step).toFixed(1), +(H - 3 - (v / max) * (H - 8)).toFixed(1)];
    });
    var id = "sgSpark" + (++seq);
    var line = smoothPath(pts, H - 1);
    return '<svg class="dash-spark" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" aria-hidden="true">' +
      '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="currentColor" stop-opacity="0.28"/><stop offset="100%" stop-color="currentColor" stop-opacity="0"/>' +
      "</linearGradient></defs>" +
      '<path d="' + line + " L" + W + "," + H + " L0," + H + ' Z" fill="url(#' + id + ')"/>' +
      '<path d="' + line + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" vector-effect="non-scaling-stroke"/>' +
      "</svg>";
  };

  /**
   * Cartão de KPI.
   * o = { label, value, icon, tone: gold|green|blue|violet|red, delta, invert, hint, spark: [n], href }
   */
  D.kpi = function (o) {
    var tone = o.tone || "gold";
    var tag = o.href ? "a" : "div";
    return "<" + tag + ' class="dash-kpi dash-tone--' + tone + '"' + (o.href ? ' href="' + o.href + '"' : "") + ">" +
      '<div class="dash-kpi__top">' +
        '<span class="dash-ic">' + SG.icon(o.icon || "activity", 18) + "</span>" +
        '<span class="dash-kpi__label">' + ui.esc(o.label) + "</span>" +
        (o.href ? '<span class="dash-kpi__go">' + SG.icon("arrowRight", 15) + "</span>" : "") +
      "</div>" +
      '<div class="dash-kpi__value">' + o.value + "</div>" +
      '<div class="dash-kpi__foot">' + deltaBadge(o.delta, o.invert) +
        (o.hint ? '<span class="dash-kpi__hint">' + ui.esc(o.hint) + "</span>" : "") + "</div>" +
      (o.spark ? '<div class="dash-kpi__spark">' + D.sparkline(o.spark) + "</div>" : "") +
      "</" + tag + ">";
  };

  /** Indicador compacto (linha de operação). */
  D.stat = function (o) {
    var tag = o.href ? "a" : "div";
    return "<" + tag + ' class="dash-stat dash-tone--' + (o.tone || "gold") + '"' + (o.href ? ' href="' + o.href + '"' : "") + ">" +
      '<span class="dash-ic">' + SG.icon(o.icon || "activity", 18) + "</span>" +
      '<div style="min-width:0"><div class="dash-stat__label">' + ui.esc(o.label) + "</div>" +
      '<div class="dash-stat__value">' + o.value + "</div>" +
      (o.hint ? '<div class="dash-stat__hint">' + o.hint + "</div>" : "") + "</div>" +
      (o.alert ? '<span class="dash-stat__alert">' + ui.esc(o.alert) + "</span>" : "") +
      "</" + tag + ">";
  };

  /**
   * Gráfico de área. serie = [{ rotulo, valor }]
   * opts = { format(v), axis(v), label, compare: [{valor}] }
   */
  D.areaChart = function (serie, opts) {
    opts = opts || {};
    var fmt = opts.format || function (v) { return ui.num(v); };
    var axis = opts.axis || fmt;
    // largura do desenho: gráficos em largura total usam um formato mais panorâmico
    var W = opts.width || 760, H = opts.height || 260, L = 54, R = 14, T = 18, B = 30;
    var w = W - L - R, h = H - T - B;
    var all = serie.map(function (d) { return d.valor; });
    if (opts.compare) all = all.concat(opts.compare.map(function (d) { return d.valor; }));
    var max = niceMax(Math.max.apply(null, all.concat([0])) * 1.08);
    var n = serie.length;
    var step = n > 1 ? w / (n - 1) : w;
    function xy(v, i) { return [+(L + i * step).toFixed(1), +(T + h - (v / max) * h).toFixed(1)]; }
    var pts = serie.map(function (d, i) { return xy(d.valor, i); });
    var floor = T + h;
    var id = "sgArea" + (++seq);

    var grid = "";
    for (var g = 0; g <= 4; g++) {
      var gy = T + (h / 4) * g;
      grid += '<line class="dash-area__grid" x1="' + L + '" y1="' + gy + '" x2="' + (W - R) + '" y2="' + gy + '"/>' +
        '<text class="dash-area__y" x="' + (L - 10) + '" y="' + (gy + 4) + '" text-anchor="end">' + ui.esc(axis(max - (max / 4) * g)) + "</text>";
    }
    var every = Math.max(1, Math.ceil(n / 8));
    var xl = serie.map(function (d, i) {
      if (i % every !== 0 && i !== n - 1) return "";
      if (i === n - 1 && i % every !== 0 && (n - 1) % every < every / 2) return "";
      return '<text class="dash-area__x" x="' + pts[i][0] + '" y="' + (H - 8) + '" text-anchor="middle">' + ui.esc(d.rotulo) + "</text>";
    }).join("");

    var line = smoothPath(pts, floor);
    var cmp = "";
    if (opts.compare && opts.compare.length === n) {
      cmp = '<path class="dash-area__cmp" d="' + smoothPath(opts.compare.map(function (d, i) { return xy(d.valor, i); }), floor) + '"/>';
    }
    // colunas invisíveis para a dica
    var hits = serie.map(function (d, i) {
      var x0 = i === 0 ? L : pts[i][0] - step / 2;
      var cw = i === 0 || i === n - 1 ? step / 2 : step;
      return '<rect class="dash-area__hit" data-i="' + i + '" x="' + x0.toFixed(1) + '" y="' + T + '" width="' + Math.max(cw, 1).toFixed(1) + '" height="' + h + '"/>';
    }).join("");

    var payload = serie.map(function (d, i) {
      return { r: d.dica || d.rotulo, v: fmt(d.valor), c: opts.compare ? fmt(opts.compare[i].valor) : null, x: pts[i][0], y: pts[i][1] };
    });

    return '<div class="dash-area" data-chart=\'' + ui.esc(JSON.stringify(payload)) + '\' data-w="' + W + '" data-h="' + H + '">' +
      '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + ui.esc(opts.label || "Gráfico") + '">' +
        '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0%" class="dash-area__stop1"/><stop offset="100%" class="dash-area__stop2"/>' +
        "</linearGradient></defs>" +
        grid + xl + cmp +
        '<path class="dash-area__fill" d="' + line + " L" + pts[n - 1][0] + "," + floor + " L" + pts[0][0] + "," + floor + ' Z" fill="url(#' + id + ')"/>' +
        '<path class="dash-area__line" d="' + line + '"/>' +
        '<line class="dash-area__cursor" x1="0" y1="' + T + '" x2="0" y2="' + floor + '"/>' +
        '<circle class="dash-area__dot" r="5" cx="0" cy="0"/>' +
        hits +
      "</svg>" +
      '<div class="dash-tip"><span class="dash-tip__r"></span><b class="dash-tip__v"></b><span class="dash-tip__c"></span></div>' +
    "</div>";
  };

  // dica do gráfico de área (um único ouvinte para a página toda)
  document.addEventListener("mouseover", function (e) {
    var hit = e.target.closest && e.target.closest(".dash-area__hit");
    if (!hit) return;
    var box = hit.closest(".dash-area");
    var data = JSON.parse(box.getAttribute("data-chart"));
    var p = data[+hit.getAttribute("data-i")];
    var W = +box.getAttribute("data-w"), H = +box.getAttribute("data-h");
    var svg = box.querySelector("svg");
    var cur = svg.querySelector(".dash-area__cursor"), dot = svg.querySelector(".dash-area__dot");
    cur.setAttribute("x1", p.x); cur.setAttribute("x2", p.x);
    dot.setAttribute("cx", p.x); dot.setAttribute("cy", p.y);
    box.classList.add("is-hover");
    var tip = box.querySelector(".dash-tip");
    tip.querySelector(".dash-tip__r").textContent = p.r;
    tip.querySelector(".dash-tip__v").textContent = p.v;
    tip.querySelector(".dash-tip__c").textContent = p.c ? "período anterior: " + p.c : "";
    var rect = svg.getBoundingClientRect();
    var left = (p.x / W) * rect.width, top = (p.y / H) * rect.height;
    tip.style.left = Math.min(Math.max(left, 70), rect.width - 70) + "px";
    tip.style.top = top + "px";
  });
  document.addEventListener("mouseout", function (e) {
    var box = e.target.closest && e.target.closest(".dash-area");
    if (box && !(e.relatedTarget && box.contains(e.relatedTarget) && e.relatedTarget.closest(".dash-area__hit"))) {
      box.classList.remove("is-hover");
    }
  });

  /** Rosca de distribuição com legenda. segs = [{ label, value, color }] */
  D.donut = function (segs, opts) {
    opts = opts || {};
    var total = segs.reduce(function (s, x) { return s + x.value; }, 0);
    var R = 62, C = 2 * Math.PI * R, gap = total && segs.filter(function (s) { return s.value; }).length > 1 ? 3 : 0;
    var off = 0;
    var arcs = segs.map(function (s) {
      if (!s.value) return "";
      var len = (s.value / total) * C;
      var dash = Math.max(len - gap, 0.01);
      var el = '<circle class="dash-donut__seg" cx="80" cy="80" r="' + R + '" style="stroke:' + s.color + '" ' +
        'stroke-dasharray="' + dash.toFixed(2) + " " + (C - dash).toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '">' +
        "<title>" + ui.esc(s.label + ": " + ui.num(s.value)) + "</title></circle>";
      off += len;
      return el;
    }).join("");
    return '<div class="dash-donut">' +
      '<div class="dash-donut__chart"><svg viewBox="0 0 160 160" aria-hidden="true">' +
        '<circle class="dash-donut__track" cx="80" cy="80" r="' + R + '"/>' +
        '<g transform="rotate(-90 80 80)">' + arcs + "</g></svg>" +
        '<div class="dash-donut__center"><b>' + ui.num(total) + "</b><span>" + ui.esc(opts.center || "total") + "</span></div>" +
      "</div>" +
      '<ul class="dash-legend">' + segs.map(function (s) {
        var pct = total ? Math.round((s.value / total) * 100) : 0;
        return '<li><span class="dash-legend__dot" style="background:' + s.color + '"></span>' +
          '<span class="dash-legend__label">' + ui.esc(s.label) + "</span>" +
          '<span class="dash-legend__val">' + ui.num(s.value) + '<small>' + pct + "%</small></span></li>";
      }).join("") + "</ul>" +
    "</div>";
  };

  /** Lista com barras horizontais. items = [{ label, value, icon, display }]; opts.rank = false tira a numeração. */
  D.barList = function (items, opts) {
    opts = opts || {};
    var max = Math.max.apply(null, items.map(function (i) { return i.value; }).concat([1]));
    return '<ul class="dash-bars">' + items.map(function (it, idx) {
      return "<li>" +
        (opts.rank === false ? "" : '<span class="dash-bars__rank">' + (idx + 1) + "</span>") +
        (it.icon ? '<span class="dash-bars__ic">' + it.icon + "</span>" : "") +
        '<div class="dash-bars__body"><div class="dash-bars__row"><span class="dash-bars__label">' + ui.esc(it.label) + "</span>" +
          '<span class="dash-bars__val">' + (it.display || ui.num(it.value)) + "</span></div>" +
          '<div class="dash-bars__track"><span style="width:' + (it.value ? Math.max(3, (it.value / max) * 100) : 0).toFixed(1) + '%"></span></div>' +
        "</div></li>";
    }).join("") + "</ul>";
  };

  /** Barra de progresso com rótulo. */
  D.progress = function (label, pct, hint) {
    pct = Math.max(0, Math.min(100, pct || 0));
    return '<div class="dash-progress"><div class="dash-progress__row"><span>' + ui.esc(label) + "</span><b>" +
      pct.toLocaleString(SG.config.app.locale, { maximumFractionDigits: 1 }) + "%</b></div>" +
      '<div class="dash-progress__track"><span style="width:' + pct + '%"></span></div>' +
      (hint ? '<div class="dash-progress__hint">' + ui.esc(hint) + "</div>" : "") + "</div>";
  };

  /** Valor em reais compacto para eixos (R$ 1,2 mil). */
  D.moneyAxis = function (v) {
    if (v >= 1000) return "R$ " + (v / 1000).toLocaleString(SG.config.app.locale, { maximumFractionDigits: 1 }) + " mil";
    return "R$ " + Math.round(v);
  };

  SG.dash = D;
})(window.SG);
