(function () {
  var WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  var REGION_LABELS = {
    "dublin-city": "都柏林市",
    "south-dublin": "南都柏林",
    dlr: "邓莱里-拉思当",
    fingal: "芬戈尔",
  };
  /* CARTO raster tiles now watermark without an API key. OSM standard tiles stay keyless. */
  var TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
  var TILE_ATTR =
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

  var state = {
    region: "all",
    when: "this",
    price: "all",
    sort: "time",
    q: "",
    from: "",
    to: "",
  };

  var data = null;
  var viewMode = "map";
  var selectedId = null;
  var pendingUrlEvent = null;
  var visibleEvents = [];
  var map = null;
  var tileLayer = null;
  var markerById = {};
  var lastFitKey = "";
  var urlPanDone = false;

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    var toggle = document.getElementById("theme-toggle");
    if (toggle) {
      syncThemeLabel();
      toggle.addEventListener("click", onThemeToggle);
    }

    readStateFromUrl();
    bindFilters();
    applyViewClass();
    reflectControls();
    loadEvents();
    window.addEventListener("resize", function () {
      if (map && mapIsVisible()) map.invalidateSize();
    });
  }

  function onThemeToggle() {
    var current = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
    var next = current === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("weekend-theme", next);
    } catch (error) {
      /* storage may be blocked; the toggle still applies for this view */
    }
    syncThemeLabel();
  }

  function syncThemeLabel() {
    var toggle = document.getElementById("theme-toggle");
    if (!toggle) return;
    var light = document.documentElement.getAttribute("data-theme") === "light";
    toggle.setAttribute("aria-label", light ? "切换到深色" : "切换到浅色");
  }

  function readStateFromUrl() {
    var params = new URLSearchParams(window.location.search);
    var region = params.get("region");
    var when = params.get("when");
    var price = params.get("price");
    var sort = params.get("sort");
    if (region && (region === "all" || REGION_LABELS[region])) state.region = region;
    if (when === "all" || when === "this" || when === "next" || when === "custom") state.when = when;
    if (price === "all" || price === "free" || price === "paid") state.price = price;
    if (sort === "free" || sort === "time") state.sort = sort;
    state.q = params.get("q") || "";
    state.from = isIsoDate(params.get("from")) ? params.get("from") : "";
    state.to = isIsoDate(params.get("to")) ? params.get("to") : "";
    viewMode = params.get("view") === "list" ? "list" : "map";
    pendingUrlEvent = params.get("event");
  }

  function writeStateToUrl() {
    var params = new URLSearchParams();
    if (state.region !== "all") params.set("region", state.region);
    if (state.when !== "this") params.set("when", state.when);
    if (state.price !== "all") params.set("price", state.price);
    if (state.sort !== "time") params.set("sort", state.sort);
    if (state.q) params.set("q", state.q);
    if (state.when === "custom") {
      if (state.from) params.set("from", state.from);
      if (state.to) params.set("to", state.to);
    }
    /* View is session-only. readStateFromUrl still honors a pasted ?view=list once;
       writing it back made list stick on the next reload of /weekend/. */
    if (selectedId) params.set("event", selectedId);
    var query = params.toString();
    var next = query ? "?" + query : window.location.pathname;
    window.history.replaceState(null, "", next);
  }

  function bindFilters() {
    onGroup("#region-filters", "data-region", function (value) {
      state.region = value;
      publish();
    });
    onGroup("#when-filters", "data-when", function (value) {
      state.when = value;
      if (value === "custom" && (!state.from || !state.to)) {
        var weekend = thisWeekend();
        state.from = ymdToIso(weekend.start);
        state.to = ymdToIso(weekend.end);
      }
      publish();
    });
    onGroup("#price-filters", "data-price", function (value) {
      state.price = value;
      publish();
    });

    var search = document.getElementById("search");
    search.addEventListener("input", function () {
      state.q = search.value.trim();
      publish();
    });

    var sort = document.getElementById("sort");
    sort.addEventListener("change", function () {
      state.sort = sort.value === "free" ? "free" : "time";
      publish();
    });

    document.getElementById("date-from").addEventListener("change", function (event) {
      state.from = event.target.value;
      publish();
    });
    document.getElementById("date-to").addEventListener("change", function (event) {
      state.to = event.target.value;
      publish();
    });

    document.getElementById("reset-filters").addEventListener("click", function () {
      state.region = "all";
      state.when = "all";
      state.price = "all";
      state.sort = "time";
      state.q = "";
      publish();
    });

    document.getElementById("view-list").addEventListener("click", function () {
      setViewMode("list");
    });
    document.getElementById("view-map").addEventListener("click", function () {
      setViewMode("map");
    });

    var form = document.getElementById("filters");
    form.addEventListener("submit", function (event) {
      event.preventDefault();
    });
  }

  function onGroup(selector, attr, handler) {
    var group = document.querySelector(selector);
    group.addEventListener("click", function (event) {
      var button = event.target.closest("button[" + attr + "]");
      if (!button || !group.contains(button)) return;
      handler(button.getAttribute(attr));
    });
  }

  function reflectControls() {
    setPressed("#region-filters", "data-region", state.region);
    setPressed("#when-filters", "data-when", state.when);
    setPressed("#price-filters", "data-price", state.price);
    document.getElementById("search").value = state.q;
    document.getElementById("sort").value = state.sort;
    document.getElementById("date-from").value = state.from;
    document.getElementById("date-to").value = state.to;
    document.getElementById("custom-range").hidden = state.when !== "custom";
    applyViewClass();
  }

  function setPressed(selector, attr, value) {
    var buttons = document.querySelectorAll(selector + " button[" + attr + "]");
    buttons.forEach(function (button) {
      button.setAttribute("aria-pressed", button.getAttribute(attr) === value ? "true" : "false");
    });
  }

  function applyViewClass() {
    var explorer = document.getElementById("explorer");
    if (explorer) explorer.classList.toggle("is-map", viewMode === "map");
    var listBtn = document.getElementById("view-list");
    var mapBtn = document.getElementById("view-map");
    if (listBtn) listBtn.setAttribute("aria-pressed", viewMode === "list" ? "true" : "false");
    if (mapBtn) mapBtn.setAttribute("aria-pressed", viewMode === "map" ? "true" : "false");
  }

  function setViewMode(mode) {
    viewMode = mode === "map" ? "map" : "list";
    applyViewClass();
    writeStateToUrl();
    if (!data || !mapIsVisible()) return;
    window.requestAnimationFrame(function () {
      syncMap(visibleEvents, { fit: !selectedId });
      if (selectedId) panToEvent(selectedId);
    });
  }

  function loadEvents() {
    var url = new URL("events.json", document.baseURI);
    fetch(url.href)
      .then(function (response) {
        if (!response.ok) throw new Error("bad status");
        return response.json();
      })
      .then(function (payload) {
        data = payload;
        if (payload.regions) {
          payload.regions.forEach(function (region) {
            REGION_LABELS[region.id] = region.label;
          });
        }
        publish();
      })
      .catch(function () {
        var count = document.getElementById("result-count");
        count.textContent = "活动清单没有加载成功。请用网站目录打开本页，例如 /weekend/ 。";
      });
  }

  function publish() {
    reflectControls();
    if (!data) {
      writeStateToUrl();
      return;
    }
    renderWhenCaption();
    var range = selectedRange();
    var rangeError = document.getElementById("range-error");
    rangeError.hidden = !(state.when === "custom" && range && range.invalid);
    renderNotice(range);

    var events = filterEvents(range);
    sortEvents(events);
    resolveSelection(events);
    visibleEvents = events;
    renderEvents(events, range);
    syncMap(events);
    updatePeek();
    writeStateToUrl();
    if (!urlPanDone) {
      urlPanDone = true;
      if (selectedId) {
        if (map) panToEvent(selectedId);
        if (viewMode !== "map") scrollCard(selectedId, "nearest");
      }
    }
  }

  function resolveSelection(events) {
    if (pendingUrlEvent) {
      if (events.some(function (event) { return event.id === pendingUrlEvent; })) {
        selectedId = pendingUrlEvent;
      }
      pendingUrlEvent = null;
    }
    if (selectedId && !events.some(function (event) { return event.id === selectedId; })) {
      selectedId = null;
    }
  }

  function renderWhenCaption() {
    var caption = document.getElementById("when-caption");
    if (state.when === "all") {
      caption.textContent = "清单大约覆盖 2026 年 10 月 24 日到 11 月 8 日，跨周展览会一直显示到结束。";
      return;
    }
    if (state.when === "custom") {
      if (state.from && state.to) caption.textContent = "自定义：" + isoToLabel(state.from) + " – " + isoToLabel(state.to);
      else caption.textContent = "选择开始和结束日期，含这两天。";
      return;
    }
    var weekend = state.when === "next" ? nextWeekend() : thisWeekend();
    var prefix = state.when === "next" ? "下周末" : "本周末";
    caption.textContent = prefix + "：" + ymdLabel(weekend.start) + " – " + ymdLabel(weekend.end) + "（周六至周日）";
  }

  function renderNotice(range) {
    var box = document.getElementById("notice");
    box.replaceChildren();
    if (!data.notices || !range || range.invalid || range.incomplete) {
      box.hidden = true;
      return;
    }
    var matches = data.notices.filter(function (notice) {
      return rangesOverlap(isoToKey(notice.start), isoToKey(notice.end), range.startKey, range.endKey);
    });
    if (!matches.length) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    matches.forEach(function (notice) {
      var paragraph = document.createElement("p");
      paragraph.textContent = notice.text_zh;
      box.appendChild(paragraph);
    });
  }

  function filterEvents(range) {
    var query = state.q.toLowerCase();
    return (data.events || []).filter(function (event) {
      if (state.region !== "all" && event.region !== state.region) return false;
      var kind = event.price && event.price.kind === "free" ? "free" : "paid";
      if (state.price !== "all" && state.price !== kind) return false;
      if (range) {
        if (range.invalid || range.incomplete) return false;
        var span = eventSpan(event);
        if (!rangesOverlap(span.startKey, span.endKey, range.startKey, range.endKey)) return false;
      }
      if (query && !searchBlob(event).includes(query)) return false;
      return true;
    });
  }

  function searchBlob(event) {
    var region = REGION_LABELS[event.region] || "";
    var tags = (event.tags || []).join(" ");
    return [
      event.title_zh,
      event.description_zh,
      event.venue,
      event.address,
      event.age_hint,
      event.booking_zh,
      region,
      tags,
    ]
      .join(" ")
      .toLowerCase();
  }

  function sortEvents(events) {
    events.sort(function (a, b) {
      if (state.sort === "free") {
        var aFree = a.price && a.price.kind === "free" ? 0 : 1;
        var bFree = b.price && b.price.kind === "free" ? 0 : 1;
        if (aFree !== bFree) return aFree - bFree;
      }
      var aMs = sortMs(a);
      var bMs = sortMs(b);
      if (aMs !== bMs) return aMs - bMs;
      return a.id < b.id ? -1 : 1;
    });
  }

  function renderEvents(events, range) {
    var list = document.getElementById("event-list");
    var empty = document.getElementById("empty-state");
    var count = document.getElementById("result-count");
    list.replaceChildren();

    if (range && range.invalid) {
      count.textContent = "";
      empty.hidden = true;
      return;
    }
    if (!range || range.incomplete) {
      count.textContent = "选好起止日期后显示活动。";
      empty.hidden = true;
      return;
    }

    count.textContent = events.length ? "共 " + events.length + " 场" : "共 0 场";
    empty.hidden = events.length !== 0;
    if (!events.length) {
      document.getElementById("empty-text").textContent = "这个条件下没有活动。可以换一个地区，或查看全部日期。";
      return;
    }

    var now = new Date();
    events.forEach(function (event, index) {
      list.appendChild(renderCard(event, now, index + 1));
    });
  }

  function renderCard(event, now, number) {
    var card = document.createElement("article");
    card.className = "event-card";
    card.id = "event-" + event.id;
    card.setAttribute("data-id", event.id);
    var status = eventStatus(event, now);
    if (status === "ended") card.classList.add("is-ended");
    var expanded = selectedId === event.id;
    if (expanded) card.classList.add("is-active");

    var button = document.createElement("button");
    button.type = "button";
    button.className = "card-open";
    button.setAttribute("aria-expanded", expanded ? "true" : "false");
    button.setAttribute("aria-controls", "details-" + event.id);
    button.setAttribute("aria-label", number + " " + event.title_zh + "，" + formatWhen(event));

    var top = document.createElement("div");
    top.className = "card-top";
    var lead = document.createElement("div");
    lead.className = "tag-row";
    var num = document.createElement("span");
    num.className = "pin-num";
    num.textContent = String(number);
    lead.append(num, pricePill(event.price));
    var side = document.createElement("div");
    side.className = "tag-row";
    var region = document.createElement("span");
    region.className = "pill-region";
    region.textContent = REGION_LABELS[event.region] || event.region;
    side.appendChild(region);
    if (status === "live") side.appendChild(statusPill("进行中"));
    if (status === "ended") side.appendChild(statusPill("已结束"));
    var cue = document.createElement("span");
    cue.className = "expand-cue";
    cue.textContent = expanded ? "收起" : "详情";
    side.appendChild(cue);
    top.append(lead, side);

    var title = document.createElement("h2");
    title.textContent = event.title_zh;

    var when = document.createElement("p");
    when.className = "when";
    when.textContent = formatWhen(event);

    var venue = document.createElement("p");
    venue.className = "venue";
    venue.textContent = event.venue;

    button.append(top, title, when, venue);

    if (event.address) {
      var address = document.createElement("p");
      address.className = "address";
      address.textContent = event.address;
      button.appendChild(address);
    }

    if (event.price && event.price.note_zh) {
      var fare = document.createElement("p");
      fare.className = "fare";
      fare.textContent = event.price.note_zh;
      button.appendChild(fare);
    }

    var details = document.createElement("div");
    details.className = "card-details";
    details.id = "details-" + event.id;
    details.hidden = !expanded;

    var blurb = document.createElement("p");
    blurb.className = "blurb";
    blurb.textContent = event.description_zh;
    details.appendChild(blurb);

    var tags = document.createElement("div");
    tags.className = "tag-row";
    if (event.age_hint) tags.appendChild(makeTag(event.age_hint));
    if (event.booking_zh) tags.appendChild(makeTag(event.booking_zh));
    (event.tags || []).forEach(function (tag) {
      tags.appendChild(makeTag(tag));
    });
    details.appendChild(tags);

    var actions = document.createElement("div");
    actions.className = "card-actions";
    var link = makeSourceLink(event);
    if (link) actions.appendChild(link);
    if (event.address) {
      var mapLink = document.createElement("a");
      mapLink.href = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(event.venue + " " + event.address);
      mapLink.target = "_blank";
      mapLink.rel = "noopener noreferrer";
      mapLink.textContent = "外部地图";
      actions.appendChild(mapLink);
    }
    details.appendChild(actions);

    button.addEventListener("click", function () {
      var open = selectedId === event.id && !details.hidden;
      if (open) {
        details.hidden = true;
        button.setAttribute("aria-expanded", "false");
        cue.textContent = "详情";
        return;
      }
      selectEvent(event.id, { pan: true, scroll: false, expand: true });
    });

    card.append(button, details);
    return card;
  }

  function selectEvent(id, opts) {
    opts = opts || {};
    selectedId = id;
    document.querySelectorAll(".event-card").forEach(function (card) {
      var cardId = card.getAttribute("data-id");
      var on = cardId === id;
      card.classList.toggle("is-active", on);
      var details = card.querySelector(".card-details");
      var button = card.querySelector(".card-open");
      var cue = card.querySelector(".expand-cue");
      if (!details || !button) return;
      if (!on) details.hidden = true;
      else if (opts.expand) details.hidden = false;
      button.setAttribute("aria-expanded", details.hidden ? "false" : "true");
      if (cue) cue.textContent = details.hidden ? "详情" : "收起";
    });
    styleMarkers();
    if (opts.pan) panToEvent(id);
    else if (markerById[id]) markerById[id].openPopup();
    if (opts.scroll) scrollCard(id, "nearest");
    updatePeek();
    writeStateToUrl();
  }

  function scrollCard(id, block) {
    var card = document.getElementById("event-" + id);
    if (!card) return;
    card.scrollIntoView({ block: block || "nearest", behavior: reduceMotion() ? "auto" : "smooth" });
  }

  function updatePeek() {
    var peek = document.getElementById("map-peek");
    if (!peek) return;
    peek.replaceChildren();
    var event = findEvent(selectedId);
    if (!event) {
      peek.hidden = true;
      return;
    }
    peek.hidden = false;
    var title = document.createElement("p");
    title.className = "peek-title";
    title.textContent = event.title_zh;
    var meta = document.createElement("p");
    meta.className = "peek-meta";
    meta.textContent = (REGION_LABELS[event.region] || "") + " · " + formatWhen(event);
    var open = document.createElement("button");
    open.type = "button";
    open.className = "chip";
    open.textContent = "在列表中打开";
    open.addEventListener("click", function () {
      setViewMode("list");
      window.requestAnimationFrame(function () {
        scrollCard(event.id, "center");
      });
    });
    var source = makeSourceLink(event, "peek-source");
    if (source) peek.append(title, meta, source, open);
    else peek.append(title, meta, open);
  }

  function findEvent(id) {
    if (!id || !data) return null;
    var found = null;
    (data.events || []).some(function (event) {
      if (event.id === id) {
        found = event;
        return true;
      }
      return false;
    });
    return found;
  }

  function mapIsVisible() {
    return window.matchMedia("(min-width: 960px)").matches || viewMode === "map";
  }

  function ensureMap() {
    if (map || typeof L === "undefined") return map;
    var el = document.getElementById("map");
    if (!el) return null;
    map = L.map(el, { scrollWheelZoom: true, zoomControl: true });
    map.setView([53.35, -6.26], 11);
    applyTiles();
    return map;
  }

  function applyTiles() {
    if (!map || tileLayer || typeof L === "undefined") return;
    tileLayer = L.tileLayer(TILE_URL, {
      maxZoom: 19,
      attribution: TILE_ATTR,
    });
    tileLayer.addTo(map);
  }

  function syncMap(events, opts) {
    opts = opts || {};
    visibleEvents = events;
    if (!mapIsVisible()) return;
    if (!ensureMap()) return;
    map.invalidateSize();
    applyTiles();
    Object.keys(markerById).forEach(function (id) {
      map.removeLayer(markerById[id]);
    });
    markerById = {};
    var positions = pinPositions(events);
    events.forEach(function (event, index) {
      var at = positions[event.id];
      if (!at) return;
      var free = event.price && event.price.kind === "free";
      var marker = L.marker(at, {
        icon: pinIcon(event.id === selectedId, free),
        title: event.title_zh,
        keyboard: true,
        zIndexOffset: event.id === selectedId ? 800 : index,
      });
      marker._pin = { order: index, free: free };
      marker.bindPopup(markerPopup(event), { maxWidth: 260 });
      marker.on("click", function () {
        selectEvent(event.id, {
          pan: false,
          scroll: window.matchMedia("(min-width: 960px)").matches,
          expand: true,
        });
      });
      marker.addTo(map);
      markerById[event.id] = marker;
    });
    var key = events.map(function (event) { return event.id; }).join("|");
    if (opts.fit !== false && key !== lastFitKey) fitEvents(events);
    lastFitKey = key;
    if (selectedId && markerById[selectedId]) markerById[selectedId].openPopup();
  }

  function styleMarkers() {
    Object.keys(markerById).forEach(function (id) {
      var marker = markerById[id];
      var pin = marker._pin;
      marker.setIcon(pinIcon(id === selectedId, pin.free));
      marker.setZIndexOffset(id === selectedId ? 800 : pin.order);
    });
  }

  function pinIcon(active, free) {
    var cls = "pin" + (free ? " is-free" : " is-paid") + (active ? " is-active" : "");
    return L.divIcon({
      className: "pin-wrap",
      html: '<span class="' + cls + '"></span>',
      iconSize: [30, 30],
      iconAnchor: [15, 15],
      popupAnchor: [0, -16],
    });
  }

  function markerPopup(event) {
    var wrap = document.createElement("div");
    var title = document.createElement("strong");
    title.textContent = event.title_zh;
    wrap.appendChild(title);
    wrap.appendChild(document.createElement("br"));
    wrap.appendChild(document.createTextNode(formatWhen(event)));
    var source = makeSourceLink(event, "popup-source");
    if (source) {
      wrap.appendChild(document.createElement("br"));
      wrap.appendChild(source);
    }
    return wrap;
  }

  function sourceLinkText(event) {
    return event.source_name ? "查看来源 · " + event.source_name : "查看来源";
  }

  function makeSourceLink(event, className) {
    var source = safeHttpUrl(event.source_url);
    if (!source) return null;
    var link = document.createElement("a");
    if (className) link.className = className;
    link.href = source;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = sourceLinkText(event);
    return link;
  }

  function pinPositions(events) {
    var groups = {};
    events.forEach(function (event) {
      if (typeof event.lat !== "number" || typeof event.lng !== "number") return;
      var key = event.lat.toFixed(5) + "," + event.lng.toFixed(5);
      if (!groups[key]) groups[key] = [];
      groups[key].push(event);
    });
    var pos = {};
    Object.keys(groups).forEach(function (key) {
      var group = groups[key];
      group.forEach(function (event, index) {
        if (group.length === 1) {
          pos[event.id] = [event.lat, event.lng];
          return;
        }
        var angle = (2 * Math.PI * index) / group.length - Math.PI / 2;
        pos[event.id] = [
          event.lat + Math.sin(angle) * 0.00035,
          event.lng + Math.cos(angle) * 0.00055,
        ];
      });
    });
    return pos;
  }

  function fitEvents(events) {
    var points = events.filter(function (event) {
      return typeof event.lat === "number" && typeof event.lng === "number";
    });
    if (!points.length) {
      map.setView([53.35, -6.26], 11, { animate: false });
      return;
    }
    var bounds = L.latLngBounds(points.map(function (event) {
      return [event.lat, event.lng];
    }));
    map.fitBounds(bounds.pad(0.18), {
      padding: [28, 28],
      maxZoom: 14,
      animate: !reduceMotion(),
    });
  }

  function panToEvent(id) {
    var marker = markerById[id];
    if (!marker || !map) return;
    var zoom = Math.max(map.getZoom(), 14);
    map.setView(marker.getLatLng(), zoom, { animate: !reduceMotion() });
    marker.openPopup();
  }

  function pricePill(price) {
    var pill = document.createElement("span");
    pill.className = "pill";
    if (price && price.kind === "free") {
      pill.classList.add("pill-free");
      pill.textContent = "免费";
      return pill;
    }
    pill.classList.add("pill-paid");
    if (price && typeof price.amount_eur === "number") {
      pill.textContent = "€" + formatEuro(price.amount_eur);
    } else {
      pill.textContent = "收费";
    }
    return pill;
  }

  function statusPill(text) {
    var pill = document.createElement("span");
    pill.className = "pill-status";
    pill.textContent = text;
    return pill;
  }

  function makeTag(text) {
    var tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = text;
    return tag;
  }

  function formatEuro(amount) {
    if (Math.round(amount) === amount) return String(amount);
    return amount.toFixed(2);
  }

  function formatWhen(event) {
    if (event.time_tbc || isDateOnly(event.start)) {
      var day = formatDate(pointDate(event.start));
      if (event.schedule_note_zh) return day + " · " + event.schedule_note_zh;
      return day + " · 具体时段请看来源";
    }
    var start = new Date(event.start);
    var end = event.end ? new Date(event.end) : null;
    if (!end) return formatDate(start) + " " + formatTime(start) + " 开始";
    if (sameDublinDay(start, end)) {
      var line = formatDate(start) + " " + formatTime(start) + "–" + formatTime(end);
      if (event.schedule_note_zh) return line + "（" + event.schedule_note_zh + "）";
      return line;
    }
    var span = formatDate(start) + " – " + formatDate(end);
    if (event.schedule_note_zh) return span + " · " + event.schedule_note_zh;
    return span + " " + formatTime(start) + "–" + formatTime(end);
  }

  function eventStatus(event, now) {
    var span = eventSpan(event);
    var today = ymdKey(dublinYmd(now));
    if (event.time_tbc || isDateOnly(event.start)) {
      return today > span.endKey ? "ended" : "upcoming";
    }
    if (!event.end || !sameDublinDay(new Date(event.start), new Date(event.end))) return null;
    var startMs = Date.parse(event.start);
    var endMs = Date.parse(event.end);
    var t = now.getTime();
    if (t > endMs) return "ended";
    if (t >= startMs) return "live";
    return "upcoming";
  }

  function selectedRange() {
    if (state.when === "all") {
      return { startKey: 0, endKey: 99999999, invalid: false, incomplete: false };
    }
    if (state.when === "custom") {
      if (!state.from || !state.to) return { invalid: false, incomplete: true };
      var startKey = isoToKey(state.from);
      var endKey = isoToKey(state.to);
      if (startKey > endKey) return { invalid: true, incomplete: false };
      return { startKey: startKey, endKey: endKey, invalid: false, incomplete: false };
    }
    var weekend = state.when === "next" ? nextWeekend() : thisWeekend();
    return {
      startKey: ymdKey(weekend.start),
      endKey: ymdKey(weekend.end),
      invalid: false,
      incomplete: false,
    };
  }

  function eventSpan(event) {
    var start = pointDate(event.start);
    var end = event.end ? pointDate(event.end) : start;
    return { startKey: ymdKey(dublinYmd(start)), endKey: ymdKey(dublinYmd(end)) };
  }

  function sortMs(event) {
    if (isDateOnly(event.start)) return Date.parse(event.start + "T12:00:00Z");
    return Date.parse(event.start);
  }

  function rangesOverlap(aStart, aEnd, bStart, bEnd) {
    return aStart <= bEnd && aEnd >= bStart;
  }

  function thisWeekend(now) {
    var today = dublinYmd(now || new Date());
    var weekday = dublinWeekday(now || new Date());
    var offset = weekday === 6 ? 0 : weekday === 0 ? -1 : 6 - weekday;
    var start = addDays(today, offset);
    return { start: start, end: addDays(start, 1) };
  }

  function nextWeekend() {
    var current = thisWeekend();
    var start = addDays(current.start, 7);
    return { start: start, end: addDays(start, 1) };
  }

  function dublinYmd(date) {
    var parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Dublin",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    return {
      y: Number(part(parts, "year")),
      m: Number(part(parts, "month")),
      d: Number(part(parts, "day")),
    };
  }

  function dublinWeekday(date) {
    var name = new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Dublin",
      weekday: "short",
    }).format(date);
    return WEEKDAYS[name];
  }

  function addDays(ymd, days) {
    var date = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d + days));
    return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() };
  }

  function ymdKey(ymd) {
    return ymd.y * 10000 + ymd.m * 100 + ymd.d;
  }

  function ymdToIso(ymd) {
    return ymd.y + "-" + pad(ymd.m) + "-" + pad(ymd.d);
  }

  function isoToKey(iso) {
    var bits = iso.split("-");
    return Number(bits[0]) * 10000 + Number(bits[1]) * 100 + Number(bits[2]);
  }

  function isoToLabel(iso) {
    return formatDate(pointDate(iso));
  }

  function ymdLabel(ymd) {
    return formatDate(pointDate(ymdToIso(ymd)));
  }

  function pointDate(value) {
    if (isDateOnly(value)) return new Date(value + "T12:00:00Z");
    return new Date(value);
  }

  function isDateOnly(value) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  }

  function isIsoDate(value) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  }

  function sameDublinDay(a, b) {
    return ymdKey(dublinYmd(a)) === ymdKey(dublinYmd(b));
  }

  function formatDate(date) {
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Europe/Dublin",
      month: "long",
      day: "numeric",
      weekday: "short",
    }).format(date);
  }

  function formatTime(date) {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Dublin",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(date);
  }

  function part(parts, type) {
    var found = parts.find(function (item) { return item.type === type; });
    return found ? found.value : "";
  }

  function pad(number) {
    return number < 10 ? "0" + number : String(number);
  }

  function safeHttpUrl(value) {
    try {
      var url = new URL(value);
      if (url.protocol === "https:" || url.protocol === "http:") return url.href;
    } catch (error) {
      return null;
    }
    return null;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function reduceMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
})();
