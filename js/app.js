(function () {
  var session = InterviewData.getSession(); var required = document.body.getAttribute("data-role");
  if (!session || (required && session.role !== required)) { window.location.href = "index.html"; return; }
  var navByRole = {
    candidate: [
      ["candidate.html", "⌂", "Overview"],
      ["history.html", "▣", "My interviews"],
      ["prep.html", "▦", "Preparation center"],
      ["coding.html", "⌘", "Coding Practice"],
      ["leetcode.html", "◈", "LeetCode Practice"],
      ["feedback.html", "↗", "Feedback center"],
      ["notifications.html", "●", "Notifications"],
      ["candidate.html#goals", "◎", "Study plan"]
    ],
    recruiter: [
      ["recruiter.html", "⌂", "Overview"],
      ["recruiter.html#jobs", "▤", "Jobs & pipeline"],
      ["recruiter.html#schedule", "◷", "Interview schedule"]
    ],
    admin: [
      ["admin.html", "⌂", "Overview"],
      ["admin.html#audit", "◌", "Audit trail"]
    ]
  };
  var sidebarNav = document.querySelector(".sidebar nav");
  if (sidebarNav && navByRole[required]) {
    var currentPage = window.location.pathname.split("/").pop() || "index.html";
    sidebarNav.innerHTML = navByRole[required].map(function (item) {
      var targetPage = item[0].split("#")[0];
      var active = targetPage === currentPage && (targetPage !== "candidate.html" || !item[0].includes("#"));
      return "<a" + (active ? " class=\"active\"" : "") + " href=\"" + item[0] + "\">" + item[1] + " <span>" + item[2] + "</span></a>";
    }).join("");
  }
  var currentTheme = InterviewData.getTheme();
  document.documentElement.setAttribute("data-theme", currentTheme);
  var themeButton = document.querySelector(".theme-toggle");
  if (themeButton) {
    themeButton.textContent = currentTheme === "dark" ? "☀" : "◐";
    themeButton.addEventListener("click", function () { var next = InterviewData.getTheme() === "dark" ? "light" : "dark"; InterviewData.setTheme(next); document.documentElement.setAttribute("data-theme", next); themeButton.textContent = next === "dark" ? "☀" : "◐"; });
  }
  var resetButton = document.querySelector(".reset-demo");
  if (resetButton) resetButton.addEventListener("click", function () { if (window.confirm("Reset all demo interviews, bookmarks, and goals?")) { InterviewData.resetDemo(); window.location.reload(); } });
  document.querySelectorAll(".logout").forEach(function (button) { button.addEventListener("click", function () { InterviewData.clearSession(); InterviewData.clearDraft(); window.location.href = "index.html"; }); });
  window.escapeHtml = function (value) { return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c]; }); };
  window.formatDate = function (value) { return value ? new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—"; };
  window.statusClass = function (status) { return String(status || "").toLowerCase().replace(/\s+/g, "-"); };
  window.showNotice = function (id, text, kind) { var el = document.getElementById(id); if (el) { el.textContent = text; el.className = "notice " + (kind || "success"); } };
}());
