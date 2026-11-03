(function () {
  var id = new URLSearchParams(window.location.search).get("id"),
    record = InterviewData.getScheduled().find(function (r) {
      return r.id === id;
    }),
    stream = null;
  if (!record) {
    window.location.href = "interviews.html";
    return;
  }
  document.getElementById("lobby-title").textContent = record.title;
  document.getElementById("lobby-details").innerHTML =
    "<p><strong>" +
    escapeHtml(record.jobTitle) +
    "</strong></p><p>" +
    escapeHtml(record.type) +
    " · " +
    record.duration +
    " minutes</p><p>" +
    new Date(record.scheduledAt).toLocaleString() +
    "</p><p>Interviewer: " +
    escapeHtml(record.recruiterName) +
    "</p><p>" +
    escapeHtml(record.instructions || "") +
    "</p>";
  function device(kind) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      document.getElementById("device-message").textContent =
        "This browser does not support media device checks.";
      return;
    }
    navigator.mediaDevices
      .getUserMedia(
        kind === "video"
          ? { video: true, audio: false }
          : { video: false, audio: true },
      )
      .then(function (newStream) {
        stream = stream || newStream;
        if (kind === "video")
          document.getElementById("camera-preview").srcObject = newStream;
        document.getElementById(kind + "-button").textContent =
          kind === "video" ? "Camera enabled" : "Microphone enabled";
        document.getElementById("device-message").textContent =
          "Permission granted for " + kind + ". No recording is active.";
      })
      .catch(function () {
        document.getElementById("device-message").textContent =
          "Permission was denied or the device is unavailable. Check browser permissions and try again.";
        document.getElementById("device-message").className = "notice error";
      });
  }
  document
    .getElementById("camera-button")
    .addEventListener("click", function () {
      device("video");
    });
  document.getElementById("mic-button").addEventListener("click", function () {
    device("audio");
  });
  document
    .getElementById("ready-button")
    .addEventListener("click", function () {
      if (stream)
        stream.getTracks().forEach(function (track) {
          track.stop();
        });
      window.alert(
        "Ready state recorded locally. A real live room requires WebRTC signaling.",
      );
    });
  window.addEventListener("beforeunload", function () {
    if (stream)
      stream.getTracks().forEach(function (track) {
        track.stop();
      });
  });
})();
