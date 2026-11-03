(function () {
  var user = InterviewData.currentUser();
  if (!user) {
    window.location.href = "index.html";
    return;
  }
  var role = user.role,
    profile = user.profile || {};
  document.getElementById("profile-role").textContent =
    role === "candidate"
      ? "Student"
      : role === "recruiter"
        ? "HR / Recruiter"
        : "Administrator";
  document.getElementById("profile-name").textContent = user.fullName;
  document.getElementById("profile-headline").textContent =
    user.headline || "Add a professional headline";
  document.getElementById("completion-number").textContent =
    InterviewData.profileCompletion(user) + "%";
  document.getElementById("completion-fill").style.width =
    InterviewData.profileCompletion(user) + "%";
  function showAvatar() {
    var node = document.getElementById("avatar-preview");
    node.textContent = user.avatar
      ? ""
      : (user.fullName || "?").slice(0, 1).toUpperCase();
    if (user.avatar) node.style.backgroundImage = "url(" + user.avatar + ")";
  }
  function fill() {
    document.getElementById("profile-full-name").value = user.fullName || "";
    document.getElementById("profile-email").value = user.email || "";
    document.getElementById("profile-phone").value = user.phone || "";
    document.getElementById("profile-location").value = user.location || "";
    document.getElementById("profile-headline-input").value =
      user.headline || "";
    document.getElementById("profile-bio").value = user.bio || "";
    document
      .getElementById("student-profile-section")
      .classList.toggle("hidden", role !== "candidate");
    document
      .getElementById("recruiter-profile-section")
      .classList.toggle("hidden", role !== "recruiter");
    if (role === "candidate") {
      var education = (profile.education && profile.education[0]) || {};
      document.getElementById("education-college").value =
        education.institution || "";
      document.getElementById("education-degree").value =
        education.degree || "";
      document.getElementById("education-year").value =
        education.graduationYear || "";
      document.getElementById("target-role").value =
        (profile.career && profile.career.targetRole) || "Java Developer";
      document.getElementById("profile-skills").value = (profile.skills || [])
        .map(function (s) {
          return typeof s === "string" ? s : s.name;
        })
        .join(", ");
      document.getElementById("career-goals").value =
        (profile.career && profile.career.goals) || "";
    }
    if (role === "recruiter") {
      document.getElementById("hr-job-title").value = profile.jobTitle || "";
      document.getElementById("hr-department").value = profile.department || "";
      var company =
        profile.companyId && InterviewData.getCompany(profile.companyId);
      document.getElementById("hr-company-name").value = company
        ? company.name
        : "";
      document.getElementById("hr-company-website").value = company
        ? company.website
        : "";
    }
  }
  document
    .getElementById("profile-form")
    .addEventListener("submit", function (event) {
      event.preventDefault();
      try {
        var patch = {
          fullName: document.getElementById("profile-full-name").value.trim(),
          email: document
            .getElementById("profile-email")
            .value.trim()
            .toLowerCase(),
          phone: document.getElementById("profile-phone").value.trim(),
          location: document.getElementById("profile-location").value.trim(),
          headline: document
            .getElementById("profile-headline-input")
            .value.trim(),
          bio: document.getElementById("profile-bio").value.trim(),
        };
        if (
          !patch.fullName ||
          !document.getElementById("profile-email").checkValidity()
        )
          throw new Error("Enter a valid name and email.");
        if (
          patch.email !== user.email &&
          InterviewData.emailExists(patch.email)
        )
          throw new Error("That email is already registered.");
        user = InterviewData.updateUser(user.id, patch);
        InterviewData.setSession({
          id: user.id,
          role: user.role,
          name: user.fullName,
          loggedInAt: new Date().toISOString(),
        });
        document.getElementById("profile-message").textContent =
          "Profile saved.";
        document.getElementById("profile-message").className = "notice";
        document.getElementById("profile-name").textContent = user.fullName;
      } catch (error) {
        document.getElementById("profile-message").textContent = error.message;
        document.getElementById("profile-message").className = "notice error";
      }
    });
  var studentForm = document.getElementById("student-form");
  if (studentForm)
    studentForm.addEventListener("submit", function (event) {
      event.preventDefault();
      var skills = document
        .getElementById("profile-skills")
        .value.split(",")
        .map(function (s) {
          return s.trim();
        })
        .filter(Boolean)
        .map(function (name) {
          return { name: name, source: "self-reported", verified: false };
        });
      user = InterviewData.updateProfile(user.id, {
        profile: {
          education: [
            {
              institution: document
                .getElementById("education-college")
                .value.trim(),
              degree: document.getElementById("education-degree").value.trim(),
              graduationYear: document.getElementById("education-year").value,
            },
          ],
          skills: skills,
          career: {
            targetRole: document.getElementById("target-role").value,
            goals: document.getElementById("career-goals").value.trim(),
          },
        },
      });
      document.getElementById("profile-message").textContent =
        "Career details saved.";
      document.getElementById("profile-message").className = "notice";
      fill();
    });
  var recruiterForm = document.getElementById("recruiter-form");
  if (recruiterForm)
    recruiterForm.addEventListener("submit", function (event) {
      event.preventDefault();
      user = InterviewData.updateProfile(user.id, {
        profile: {
          jobTitle: document.getElementById("hr-job-title").value.trim(),
          department: document.getElementById("hr-department").value.trim(),
        },
      });
      if (user.profile.companyId) {
        var company = InterviewData.getCompany(user.profile.companyId);
        InterviewData.saveCompany(
          Object.assign({}, company, {
            name: document.getElementById("hr-company-name").value.trim(),
            website: document.getElementById("hr-company-website").value.trim(),
          }),
        );
      }
      document.getElementById("profile-message").textContent =
        "Recruiter details saved.";
      document.getElementById("profile-message").className = "notice";
      fill();
    });
  document
    .getElementById("avatar-input")
    .addEventListener("change", function () {
      var file = this.files[0];
      if (!file) return;
      if (
        !/^image\/(png|jpeg|webp)$/.test(file.type) ||
        file.size > 1024 * 1024
      ) {
        document.getElementById("profile-message").textContent =
          "Choose a PNG, JPEG, or WebP image under 1 MB.";
        document.getElementById("profile-message").className = "notice error";
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        try {
          user = InterviewData.updateUser(user.id, { avatar: reader.result });
          showAvatar();
          document.getElementById("profile-message").textContent =
            "Profile picture saved locally.";
          document.getElementById("profile-message").className = "notice";
        } catch (error) {
          document.getElementById("profile-message").textContent =
            "The image could not be saved in browser storage.";
          document.getElementById("profile-message").className = "notice error";
        }
      };
      reader.readAsDataURL(file);
    });
  document.getElementById("profile-home").href = InterviewData.roleMap[role];
  fill();
  showAvatar();
})();
