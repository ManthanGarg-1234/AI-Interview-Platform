(function () {
  var user = InterviewData.currentUser(),
    list = document.getElementById("notifications-list");
  function draw() {
    var items = InterviewData.getNotifications(user.id);
    list.innerHTML = items.length
      ? "<div class='application-cards'>" +
        items
          .slice()
          .reverse()
          .map(function (n) {
            return (
              "<article class='application-card " +
              (n.read ? "" : "unread") +
              "'><div><strong>" +
              escapeHtml(n.title) +
              "</strong><span class='muted'>" +
              escapeHtml(n.message) +
              "</span><small>" +
              formatDate(n.createdAt) +
              "</small></div><button class='button secondary mark-one' data-id='" +
              n.id +
              "'>" +
              (n.read ? "Read" : "Mark read") +
              "</button></article>"
            );
          })
          .join("") +
        "</div>"
      : "<div class='card empty-state'><strong>No notifications</strong><p>Interview invitations and application updates will appear here.</p></div>";
    document.querySelectorAll(".mark-one").forEach(function (button) {
      button.addEventListener("click", function () {
        InterviewData.markNotificationRead(button.getAttribute("data-id"));
        draw();
      });
    });
  }
  document.getElementById("mark-all").addEventListener("click", function () {
    InterviewData.markAllNotificationsRead(user.id);
    draw();
  });
  draw();
})();
