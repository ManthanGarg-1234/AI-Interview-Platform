(function () {
  document
    .getElementById("recovery-form")
    .addEventListener("submit", function (event) {
      event.preventDefault();
      var message = document.getElementById("recovery-message");
      message.textContent =
        "Demo recovery state created. No email was sent; use the sign-in page with a registered demo identity.";
      message.className = "notice";
    });
})();
