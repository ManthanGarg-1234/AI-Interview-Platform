(function () {
  var user = InterviewData.currentUser();
  var modules = [
    { name: "DSA", topics: "Arrays, graphs, recursion", topic: "DSA" },
    {
      name: "Web development",
      topics: "HTML, CSS, JavaScript, accessibility",
      topic: "Web Development",
    },
    { name: "Core CS", topics: "OS, CN, OOP, DBMS and SQL", topic: "Core CS" },
    {
      name: "AI interview practice",
      topics: "Role-specific interview questions",
      topic: "AI interview",
    },
  ];
  function draw() {
    var items = InterviewData.getPractice(user.id);
    document.getElementById("prep-modules").innerHTML = modules
      .map(function (module) {
        var related = items.filter(function (item) {
          return item.topic === module.topic;
        });
        var score = related.length
          ? Math.round(
              related.reduce(function (sum, item) {
                return sum + item.score;
              }, 0) / related.length,
            )
          : 0;
        return (
          "<article class='job-card'><span class='metric-icon purple'>▦</span><h3>" +
          module.name +
          "</h3><p>" +
          module.topics +
          "</p><div class='progress-bar'><span style='width:" +
          score +
          "%'></span></div><a class='button primary full' href='assessment.html?topic=" +
          encodeURIComponent(module.topic) +
          "'>Take topic assessment</a></article>"
        );
      })
      .join("");
    document.getElementById("practice-history").innerHTML = items.length
      ? "<div class='table-wrap'><table><thead><tr><th>Activity</th><th>Topic</th><th>Score</th><th>Method</th><th>Date</th></tr></thead><tbody>" +
        items
          .slice()
          .reverse()
          .map(function (item) {
            return (
              "<tr><td>" +
              escapeHtml(item.activityType) +
              "</td><td>" +
              escapeHtml(item.topic) +
              "</td><td><strong>" +
              item.score +
              "%</strong></td><td>" +
              escapeHtml(item.evaluationMethod) +
              "</td><td>" +
              formatDate(item.createdAt) +
              "</td></tr>"
            );
          })
          .join("") +
        "</tbody></table></div>"
      : "<div class='empty-state'><strong>No practice evidence yet</strong><p>Complete a topic assessment to start your evidence history.</p></div>";
  }
  draw();
})();
