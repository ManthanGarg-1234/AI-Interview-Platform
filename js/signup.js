(function () {
  var form = document.getElementById("signup-form"),
    step = 1;
  function showStep(next) {
    step = next;
    document.querySelectorAll("[data-step]").forEach(function (section) {
      section.classList.toggle(
        "hidden",
        Number(section.getAttribute("data-step")) !== step,
      );
    });
    document.querySelectorAll("[data-step-dot]").forEach(function (dot) {
      dot.classList.toggle(
        "active",
        Number(dot.getAttribute("data-step-dot")) <= step,
      );
    });
    var recruiter =
      document.querySelector("input[name=signup-role]:checked").value ===
      "recruiter";
    document
      .getElementById("student-fields")
      .classList.toggle("hidden", recruiter);
    document.getElementById("hr-fields").classList.toggle("hidden", !recruiter);
  }
  document.querySelectorAll(".password-toggle").forEach(function (button) {
    button.addEventListener("click", function () {
      var input = button.parentElement.querySelector("input");
      input.type = input.type === "password" ? "text" : "password";
      button.textContent = input.type === "password" ? "Show" : "Hide";
    });
  });
  document.querySelectorAll(".next-step").forEach(function (button) {
    button.addEventListener("click", function () {
      if (
        step === 1 &&
        (!document.getElementById("signup-name").value.trim() ||
          !document.getElementById("signup-email").checkValidity() ||
          document.getElementById("signup-password").value.length < 8 ||
          document.getElementById("signup-password").value !==
            document.getElementById("signup-confirm").value ||
          !document.getElementById("terms").checked)
      ) {
        document.getElementById("signup-message").textContent =
          "Complete valid account details, matching passwords, and the demo acknowledgement.";
        document.getElementById("signup-message").className =
          "form-message error";
        return;
      }
      showStep(step + 1);
    });
  });
  document.querySelectorAll(".prev-step").forEach(function (button) {
    button.addEventListener("click", function () {
      showStep(step - 1);
    });
  });
  document
    .querySelectorAll("input[name=signup-role]")
    .forEach(function (radio) {
      radio.addEventListener("change", function () {
        showStep(step);
      });
    });
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var recruiter =
        document.querySelector("input[name=signup-role]:checked").value ===
        "recruiter",
      profile = recruiter
        ? {
            jobTitle: document.getElementById("signup-job-title").value.trim(),
            department: document
              .getElementById("signup-department")
              .value.trim(),
            companyId: "",
          }
        : {
            education: [
              {
                institution: document
                  .getElementById("signup-college")
                  .value.trim(),
                degree: document.getElementById("signup-degree").value.trim(),
                graduationYear: document.getElementById("signup-grad").value,
              },
            ],
            skills: [],
            experience: [],
            resume: null,
            projects: [],
            career: { targetRole: "Java Developer" },
          };
    if (recruiter && !document.getElementById("signup-company").value.trim()) {
      document.getElementById("signup-message").textContent =
        "Company name is required for HR accounts.";
      document.getElementById("signup-message").className =
        "form-message error";
      return;
    }
    try {
      var user = InterviewData.createUser({
        role: recruiter ? "recruiter" : "candidate",
        fullName: document.getElementById("signup-name").value.trim(),
        email: document
          .getElementById("signup-email")
          .value.trim()
          .toLowerCase(),
        profile: profile,
      });
      if (recruiter) {
        var company = InterviewData.saveCompany({
          id: "company-" + Date.now().toString(36),
          name: document.getElementById("signup-company").value.trim(),
          website: "",
          industry: "",
          size: "",
          location: "",
          description: "",
          careersUrl: "",
          linkedinUrl: "",
        });
        InterviewData.updateProfile(user.id, {
          profile: Object.assign({}, profile, { companyId: company.id }),
        });
      }
      var saved = InterviewData.getUser(user.id);
      InterviewData.setSession({
        id: saved.id,
        role: saved.role,
        name: saved.fullName,
        loggedInAt: new Date().toISOString(),
      });
      window.location.href = InterviewData.roleMap[saved.role];
    } catch (error) {
      document.getElementById("signup-message").textContent = error.message;
      document.getElementById("signup-message").className =
        "form-message error";
    }
  });
})();
