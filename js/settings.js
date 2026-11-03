(function () {
  var user = InterviewData.currentUser();
  if (!user) {
    window.location.href = "index.html";
    return;
  }
  document.getElementById("settings-email").textContent = user.email;
  document.getElementById("settings-theme").value =
    user.preferences.theme || "light";
  document.getElementById("notify-product").checked =
    user.preferences.notifications.product !== false;
  document.getElementById("notify-applications").checked =
    user.preferences.notifications.applications !== false;
  document
    .getElementById("settings-form")
    .addEventListener("submit", function (event) {
      event.preventDefault();
      var theme = document.getElementById("settings-theme").value;
      InterviewData.updateProfile(user.id, {
        preferences: {
          theme: theme,
          notifications: {
            product: document.getElementById("notify-product").checked,
            applications: document.getElementById("notify-applications")
              .checked,
          },
        },
      });
      InterviewData.setTheme(theme);
      document.documentElement.setAttribute("data-theme", theme);
      document.getElementById("settings-message").textContent =
        "Preferences saved.";
      document.getElementById("settings-message").className = "notice";
    });
  document.getElementById("settings-home").href =
    InterviewData.roleMap[user.role];
})();
