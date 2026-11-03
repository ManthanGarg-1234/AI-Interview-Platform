(function () {
  var form = document.getElementById("login-form");
  function go(user) {
    InterviewData.setSession({
      id: user.id,
      role: user.role,
      name: user.fullName,
      loggedInAt: new Date().toISOString(),
    });
    window.location.href = InterviewData.roleMap[user.role];
  }
  if (form)
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var email = document.getElementById("email").value.trim().toLowerCase(),
        password = document.getElementById("password").value,
        message = document.getElementById("login-message");
      if (password.length < 1) {
        message.textContent = "Enter any demo password to continue.";
        message.className = "form-message error";
        return;
      }
      var user = InterviewData.getUsers().find(function (item) {
        return item.email.toLowerCase() === email;
      });
      if (!user) {
        message.textContent =
          "We could not verify this demo account. Check the email or use a demo identity.";
        message.className = "form-message error";
        return;
      }
      go(user);
    });
  document.querySelectorAll("[data-demo-email]").forEach(function (button) {
    button.addEventListener("click", function () {
      document.getElementById("email").value =
        button.getAttribute("data-demo-email");
      document.getElementById("password").value = "demo-access";
    });
  });
  var reset = document.querySelector(".reset-demo");
  if (reset)
    reset.addEventListener("click", function () {
      if (window.confirm("Restore demo accounts, jobs, and records?")) {
        InterviewData.resetDemo();
        document.getElementById("login-message").textContent =
          "Demo data restored.";
        document.getElementById("login-message").className = "form-message";
      }
    });
})();
