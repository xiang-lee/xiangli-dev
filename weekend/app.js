(function () {
  var WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  var REGION_LABELS = {
    "dublin-city": "都柏林市",
    "south-dublin": "南都柏林",
    dlr: "邓莱里-拉思当",
    fingal: "芬戈尔",
  };

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

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    var toggle = document.getElementById("theme-toggle");
    if (toggle) {
      syncThemeLabel();
      toggle.addEventListener("click", onThemeToggle);
    }

    readStateFromUrl();
    bindFilters();
    reflectControls();
    loadEvents();
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
  }

  function setPressed(selector, attr, value) {
    var buttons = document.querySelectorAll(selector + " button[" + attr + "]");
    buttons.forEach(function (button) {
      button.setAttribute("aria-pressed", button.getAttribute(attr) === value ? "true" : "false");
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
    writeStateToUrl();
    renderWhenCaption();
    if (!data) return;
    renderNotice();
    var range = selectedRange();
    var rangeError = document.getElementById("range-error");
    rangeError.hidden = !(state.when === "custom" && range && range.invalid);

    var events = filterEvents(range);
    sortEvents(events);
    renderEvents(events, range);
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

  function renderNotice() {
    var box = document.getElementById("notice");
    var range = selectedRange();
    if (!data.notices || !range || range.invalid || range.incomplete) {
      box.hidden = true;
      box.textContent = "";
      return;
    }
    var matches = data.notices.filter(function (notice) {
      return rangesOverlap(isoToKey(notice.start), isoToKey(notice.end), range.startKey, range.endKey);
    });
    if (!matches.length) {
      box.hidden = true;
      box.textContent = "";
      return;
    }
    box.hidden = false;
    box.textContent = matches.map(function (notice) { return notice.text_zh; }).join(" ");
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
    events.forEach(function (event) {
      list.appendChild(renderCard(event, now));
    });
  }

  function renderCard(event, now) {
    var card = document.createElement("article");
    card.className = "event-card";
    var status = eventStatus(event, now);
    if (status === "ended") card.classList.add("is-ended");

    var top = document.createElement("div");
    top.className = "card-top";
    top.appendChild(pricePill(event.price));
    var side = document.createElement("div");
    side.className = "tag-row";
    var region = document.createElement("span");
    region.className = "pill-region";
    region.textContent = REGION_LABELS[event.region] || event.region;
    side.appendChild(region);
    if (status === "live") side.appendChild(statusPill("进行中"));
    if (status === "ended") side.appendChild(statusPill("已结束"));
    top.appendChild(side);

    var title = document.createElement("h2");
    title.textContent = event.title_zh;

    var when = document.createElement("p");
    when.className = "when";
    when.textContent = formatWhen(event);

    var venue = document.createElement("p");
    venue.className = "venue";
    venue.textContent = event.venue;

    card.append(top, title, when, venue);

    if (event.address) {
      var address = document.createElement("p");
      address.className = "address";
      address.textContent = event.address;
      card.appendChild(address);
    }

    var blurb = document.createElement("p");
    blurb.className = "blurb";
    blurb.textContent = event.description_zh;
    card.appendChild(blurb);

    var tags = document.createElement("div");
    tags.className = "tag-row";
    if (event.age_hint) tags.appendChild(makeTag(event.age_hint));
    if (event.booking_zh) tags.appendChild(makeTag(event.booking_zh));
    (event.tags || []).forEach(function (tag) {
      tags.appendChild(makeTag(tag));
    });
    card.appendChild(tags);

    var actions = document.createElement("div");
    actions.className = "card-actions";
    var source = safeHttpUrl(event.source_url);
    if (source) {
      var link = document.createElement("a");
      link.href = source;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = event.source_name ? "查看来源 · " + event.source_name : "查看来源";
      actions.appendChild(link);
    }
    if (event.address) {
      var map = document.createElement("a");
      map.href = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(event.venue + " " + event.address);
      map.target = "_blank";
      map.rel = "noopener noreferrer";
      map.textContent = "地图";
      actions.appendChild(map);
    }
    card.appendChild(actions);
    return card;
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
})();
