(function () {
  var theme = null;
  try {
    theme = localStorage.getItem("weekend-theme");
  } catch (error) {
    theme = null;
  }
  if (theme !== "light" && theme !== "dark") {
    theme = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  document.documentElement.setAttribute("data-theme", theme);

  var lang = "en";
  try {
    var requested = new URLSearchParams(window.location.search).get("lang");
    if (requested === "zh" || requested === "en") {
      lang = requested;
    } else {
      var saved = localStorage.getItem("weekend-lang");
      if (saved === "zh" || saved === "en") lang = saved;
    }
  } catch (error) {
    lang = "en";
  }
  document.documentElement.setAttribute("data-lang", lang);
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
})();
