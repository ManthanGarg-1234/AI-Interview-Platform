(function () {
  "use strict";
  var KEYS = {
    session: "ios_session",
    users: "ios_users",
    companies: "ios_companies",
    interviews: "ios_interviews",
    scheduled: "ios_scheduled_interviews",
    draft: "ios_draft",
    bookmarks: "ios_bookmarks",
    goals: "ios_goals",
    theme: "ios_theme",
    jobs: "ios_jobs",
    applications: "ios_applications",
    assessments: "ios_assessments",
    practice: "ios_practice_activities",
    projects: "ios_projects",
    audits: "ios_audits",
    reports: "ios_reports",
    notifications: "ios_notifications",
    leetcodeProfiles: "ios_leetcode_profiles",
    leetcodeRecords: "ios_leetcode_records",
    leetcodeEvidence: "ios_leetcode_evidence",
  };
  var roleMap = {
    candidate: "candidate.html",
    recruiter: "recruiter.html",
    admin: "admin.html",
  };
  var roles = [
    "Java Developer",
    "Frontend Developer",
    "Data Structures and Algorithms",
  ];
  var skillTemplates = {
    "Java Developer": [
      "Java",
      "OOP",
      "Collections",
      "Exception handling",
      "SQL",
    ],
    "Frontend Developer": [
      "HTML",
      "CSS",
      "JavaScript",
      "Accessibility",
      "Web performance",
    ],
    "Data Structures and Algorithms": [
      "Arrays",
      "Graphs",
      "Recursion",
      "Sorting",
      "Complexity",
    ],
  };
  var seededJobs = [
    {
      id: "job-java-starter",
      company: "Northstar Labs",
      title: "Junior Java Developer",
      role: "Java Developer",
      description:
        "Build reliable services with a supportive engineering team.",
      requiredSkills: ["Java", "OOP", "Collections", "SQL"],
      location: "Remote",
      type: "Full-time",
      status: "Published",
      stages: [
        "Application review",
        "Technical assessment",
        "Technical interview",
        "Final decision",
      ],
      createdAt: "2026-01-05T09:00:00.000Z",
    },
    {
      id: "job-web-studio",
      company: "Pixel Studio",
      title: "Frontend Developer Intern",
      role: "Frontend Developer",
      description: "Create accessible, responsive product experiences.",
      requiredSkills: ["HTML", "CSS", "JavaScript", "Accessibility"],
      location: "Bengaluru / Hybrid",
      type: "Internship",
      status: "Published",
      stages: [
        "Application review",
        "Coding round",
        "Portfolio review",
        "Final decision",
      ],
      createdAt: "2026-01-08T09:00:00.000Z",
    },
  ];
  var quizBank = {
    DSA: [
      [
        "Which structure follows LIFO order?",
        ["Queue", "Stack", "Heap", "Tree"],
        1,
        "Stacks and queues",
        "A stack removes the most recently added item first.",
      ],
      [
        "What is the average lookup complexity of a hash table?",
        ["O(n)", "O(log n)", "O(1)", "O(n log n)"],
        2,
        "Hashing",
        "Hash tables provide average constant-time lookup.",
      ],
      [
        "Binary search requires the input to be what?",
        ["Random", "Sorted", "Duplicated", "Encrypted"],
        1,
        "Searching",
        "Binary search relies on sorted data.",
      ],
    ],
    "Web Development": [
      [
        "Which element represents the main content of a page?",
        ["<div>", "<main>", "<span>", "<footer>"],
        1,
        "Accessibility",
        "Semantic HTML improves structure and accessibility.",
      ],
      [
        "Which CSS property controls the flex layout direction?",
        ["display", "position", "flex-direction", "float"],
        2,
        "CSS",
        "flex-direction sets the main axis.",
      ],
      [
        "What does event delegation rely on?",
        ["Polling", "Event bubbling", "Compilation", "Cookies"],
        1,
        "JavaScript",
        "Bubbling lets a parent handle descendant events.",
      ],
    ],
    "Core CS": [
      [
        "Which ACID property guarantees committed data survives failure?",
        ["Atomicity", "Consistency", "Isolation", "Durability"],
        3,
        "DBMS",
        "Durability preserves committed transactions.",
      ],
      [
        "Which OS concept allows processes to share CPU time?",
        ["Paging", "Scheduling", "Indexing", "Routing"],
        1,
        "Operating systems",
        "CPU scheduling allocates processor time.",
      ],
      [
        "Which protocol is connection-oriented?",
        ["UDP", "DNS", "TCP", "HTTP"],
        2,
        "Networks",
        "TCP establishes a reliable connection.",
      ],
    ],
  };
  var bank = {
    "Java Developer": [
      [
        "JAVA-001",
        "Which keyword prevents a Java class from being inherited?",
        ["static", "final", "private", "sealed"],
        1,
        "objective",
        "Java fundamentals",
        ["inheritance", "oop"],
        "final prevents extension of a class.",
      ],
      [
        "JAVA-002",
        "What is the purpose of the JVM?",
        [],
        null,
        "descriptive",
        "Java runtime",
        ["bytecode", "execute", "runtime", "java virtual machine"],
        "The JVM executes compiled bytecode and manages the runtime.",
      ],
      [
        "JAVA-003",
        "Which collection does not allow duplicate elements?",
        ["ArrayList", "HashMap", "HashSet", "Vector"],
        2,
        "objective",
        "Collections",
        ["collections", "sets"],
        "HashSet stores unique values.",
      ],
      [
        "JAVA-004",
        "Explain the difference between checked and unchecked exceptions.",
        [],
        null,
        "descriptive",
        "Exception handling",
        ["compile", "runtime", "exception", "checked"],
        "Checked exceptions are verified at compile time; unchecked exceptions occur at runtime.",
      ],
      [
        "JAVA-005",
        "What does encapsulation achieve?",
        [
          "Faster execution",
          "Data hiding and controlled access",
          "Multiple inheritance",
          "Automatic testing",
        ],
        1,
        "objective",
        "Object-oriented design",
        ["oop", "encapsulation"],
        "Encapsulation protects state behind controlled methods.",
      ],
      [
        "JAVA-006",
        "Which interface is commonly used to define a natural ordering?",
        ["Runnable", "Comparable", "Serializable", "Cloneable"],
        1,
        "objective",
        "Collections",
        ["sorting", "interfaces"],
        "Comparable defines natural ordering with compareTo.",
      ],
      [
        "JAVA-007",
        "Describe why dependency injection improves testability.",
        [],
        null,
        "descriptive",
        "Design principles",
        ["dependency", "mock", "test", "constructor"],
        "Injected dependencies can be replaced with mocks or fakes in tests.",
      ],
    ],
    "Frontend Developer": [
      [
        "WEB-001",
        "Which semantic element represents the main content of a page?",
        ["<div>", "<main>", "<span>", "<section>"],
        1,
        "objective",
        "HTML semantics",
        ["html", "accessibility"],
        "The main element identifies the dominant content.",
      ],
      [
        "WEB-002",
        "Explain how responsive design supports different screen sizes.",
        [],
        null,
        "descriptive",
        "Responsive CSS",
        ["media query", "flex", "grid", "viewport", "responsive"],
        "Responsive layouts use flexible sizing, media queries, and modern layout systems.",
      ],
      [
        "WEB-003",
        "What does event delegation use?",
        ["Bubbling", "Polling", "Compilation", "Shadow DOM"],
        0,
        "objective",
        "JavaScript events",
        ["javascript", "events"],
        "Event bubbling lets a parent handle events from descendants.",
      ],
      [
        "WEB-004",
        "Describe the difference between localStorage and sessionStorage.",
        [],
        null,
        "descriptive",
        "Web storage",
        ["localstorage", "sessionstorage", "browser", "persist"],
        "localStorage persists across sessions; sessionStorage is scoped to a tab session.",
      ],
      [
        "WEB-005",
        "Which CSS property controls the layout direction of flex items?",
        ["display", "position", "flex-direction", "align-items"],
        2,
        "objective",
        "Layout",
        ["css", "flexbox"],
        "flex-direction sets the main axis direction.",
      ],
      [
        "WEB-006",
        "Which practice improves frontend performance for large images?",
        [
          "Inlining every image",
          "Lazy loading",
          "Using larger PNGs",
          "Disabling caching",
        ],
        1,
        "objective",
        "Web performance",
        ["performance", "images"],
        "Lazy loading defers offscreen image work.",
      ],
      [
        "WEB-007",
        "Explain why accessible labels matter for form controls.",
        [],
        null,
        "descriptive",
        "Accessibility",
        ["label", "screen reader", "accessible", "input"],
        "Labels provide an accessible name and improve usability.",
      ],
    ],
    "Data Structures and Algorithms": [
      [
        "DSA-001",
        "What is the average lookup complexity of a hash table?",
        ["O(n)", "O(log n)", "O(1)", "O(n log n)"],
        2,
        "objective",
        "Hashing",
        ["hash", "complexity"],
        "Hash tables provide average constant-time lookup with a good hash function.",
      ],
      [
        "DSA-002",
        "Explain when a breadth-first search is useful.",
        [],
        null,
        "descriptive",
        "Graph traversal",
        ["queue", "level", "graph", "shortest"],
        "BFS explores by level and can find shortest unweighted paths.",
      ],
      [
        "DSA-003",
        "Which structure follows LIFO order?",
        ["Queue", "Stack", "Heap", "Tree"],
        1,
        "objective",
        "Stacks and queues",
        ["stack", "lifo"],
        "A stack removes the most recently added item first.",
      ],
      [
        "DSA-004",
        "Describe the time complexity of binary search and its prerequisite.",
        [],
        null,
        "descriptive",
        "Searching",
        ["log", "sorted", "array", "o(log n)"],
        "Binary search is O(log n) and requires sorted data.",
      ],
      [
        "DSA-005",
        "What is a stable sorting algorithm?",
        [
          "One preserving equal-item order",
          "One using no memory",
          "One always O(1)",
          "One using recursion",
        ],
        0,
        "objective",
        "Sorting",
        ["sorting", "stability"],
        "Stability preserves the relative order of equal keys.",
      ],
      [
        "DSA-006",
        "Which traversal visits a binary tree root before its children?",
        ["In-order", "Post-order", "Pre-order", "Level-order"],
        2,
        "objective",
        "Trees",
        ["trees", "traversal"],
        "Pre-order visits root, left subtree, then right subtree.",
      ],
      [
        "DSA-007",
        "Explain the trade-off between time and space complexity.",
        [],
        null,
        "descriptive",
        "Complexity",
        ["time", "space", "memory", "trade"],
        "Algorithms often use extra memory to reduce execution time.",
      ],
    ],
  };
  function safeRead(key, fallback) {
    try {
      var value = JSON.parse(localStorage.getItem(key));
      return value == null ? fallback : value;
    } catch (e) {
      return fallback;
    }
  }
  function save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      throw new Error("Browser storage is unavailable.");
    }
  }
  function uid() {
    return (
      "int-" +
      Date.now().toString(36) +
      "-" +
      Math.random().toString(36).slice(2, 8)
    );
  }
  function init() {
    if (!Array.isArray(safeRead(KEYS.interviews, null)))
      save(KEYS.interviews, []);
    if (!safeRead(KEYS.goals, null))
      save(KEYS.goals, { targetScore: 80, weeklyGoal: 3, completedTasks: [] });
    if (!Array.isArray(safeRead(KEYS.bookmarks, null)))
      save(KEYS.bookmarks, []);
    if (!Array.isArray(safeRead(KEYS.jobs, null))) save(KEYS.jobs, seededJobs);
    if (!Array.isArray(safeRead(KEYS.applications, null)))
      save(KEYS.applications, []);
    if (!Array.isArray(safeRead(KEYS.assessments, null)))
      save(KEYS.assessments, []);
    if (!Array.isArray(safeRead(KEYS.practice, null))) save(KEYS.practice, []);
    if (!Array.isArray(safeRead(KEYS.scheduled, null)))
      save(KEYS.scheduled, []);
    if (!Array.isArray(safeRead(KEYS.projects, null))) save(KEYS.projects, []);
    if (!Array.isArray(safeRead(KEYS.audits, null))) save(KEYS.audits, []);
    if (!Array.isArray(safeRead(KEYS.reports, null))) save(KEYS.reports, []);
    if (!Array.isArray(safeRead(KEYS.notifications, null)))
      save(KEYS.notifications, []);
    if (!Array.isArray(safeRead(KEYS.leetcodeProfiles, null)))
      save(KEYS.leetcodeProfiles, []);
    if (!Array.isArray(safeRead(KEYS.leetcodeRecords, null)))
      save(KEYS.leetcodeRecords, []);
    if (!Array.isArray(safeRead(KEYS.leetcodeEvidence, null)))
      save(KEYS.leetcodeEvidence, []);
    initUsers();
  }
  function getSession() {
    return safeRead(KEYS.session, null);
  }
  function setSession(s) {
    save(KEYS.session, s);
  }
  function clearSession() {
    localStorage.removeItem(KEYS.session);
  }
  function initUsers() {
    var users = safeRead(KEYS.users, null);
    if (Array.isArray(users)) return;
    var now = new Date().toISOString();
    save(KEYS.companies, [
      {
        id: "company-northstar",
        name: "Northstar Labs",
        website: "",
        industry: "Technology",
        size: "51-200",
        location: "Remote",
        description: "A demo technology company.",
        careersUrl: "",
        linkedinUrl: "",
      },
    ]);
    save(KEYS.users, [
      {
        id: "demo-candidate",
        role: "candidate",
        fullName: "Demo Candidate",
        email: "student@intervue.demo",
        avatar: null,
        phone: "",
        location: "",
        headline: "Aspiring software engineer",
        bio: "",
        createdAt: now,
        updatedAt: now,
        preferences: {
          theme: "light",
          notifications: { product: true, applications: true },
        },
        profile: {
          education: [],
          skills: [],
          experience: [],
          resume: null,
          projects: [],
          career: {
            targetRole: "Java Developer",
            locations: [],
            workMode: "Any",
            employmentType: "Full-time",
            goals: "",
          },
        },
      },
      {
        id: "demo-recruiter",
        role: "recruiter",
        fullName: "Demo Recruiter",
        email: "hr@intervue.demo",
        avatar: null,
        phone: "",
        location: "",
        headline: "Talent acquisition partner",
        bio: "",
        createdAt: now,
        updatedAt: now,
        preferences: {
          theme: "light",
          notifications: { product: true, applications: true },
        },
        profile: {
          jobTitle: "Talent Acquisition Partner",
          department: "People",
          companyId: "company-northstar",
          preferences: { roles: [], skills: [], workMode: "Any" },
        },
      },
      {
        id: "demo-admin",
        role: "admin",
        fullName: "Demo Administrator",
        email: "admin@intervue.demo",
        avatar: null,
        phone: "",
        location: "",
        headline: "Platform administrator",
        bio: "",
        createdAt: now,
        updatedAt: now,
        preferences: {
          theme: "light",
          notifications: { product: true, applications: false },
        },
        profile: { title: "Platform Administrator", department: "Operations" },
      },
    ]);
  }
  function getUsers() {
    return list(KEYS.users);
  }
  function getUser(id) {
    return getUsers().find(function (u) {
      return u.id === id;
    });
  }
  function currentUser() {
    var s = getSession();
    return s ? getUser(s.id) : null;
  }
  function emailExists(email) {
    return getUsers().some(function (u) {
      return u.email.toLowerCase() === email.toLowerCase();
    });
  }
  function createUser(input) {
    if (emailExists(input.email))
      throw new Error("An account with that email already exists.");
    if (input.role === "admin")
      throw new Error("Admin accounts are provisioned for demo access only.");
    var now = new Date().toISOString(),
      user = {
        id: "usr-" + uid(),
        role: input.role,
        fullName: input.fullName,
        email: input.email,
        avatar: null,
        phone: "",
        location: "",
        headline: "",
        bio: "",
        createdAt: now,
        updatedAt: now,
        preferences: {
          theme: "light",
          notifications: { product: true, applications: true },
        },
        profile: input.profile || {},
      };
    var users = getUsers();
    users.push(user);
    save(KEYS.users, users);
    audit("Account created", "user", user.id, user.role);
    return user;
  }
  function updateUser(id, patch) {
    var users = getUsers(),
      index = users.findIndex(function (u) {
        return u.id === id;
      });
    if (index < 0) return null;
    users[index] = Object.assign({}, users[index], patch, {
      updatedAt: new Date().toISOString(),
    });
    save(KEYS.users, users);
    audit("Profile updated", "user", id, "Profile settings changed");
    return users[index];
  }
  function updateProfile(id, patch) {
    var user = getUser(id);
    if (!user) return null;
    var next = Object.assign({}, user, patch);
    if (patch.profile)
      next.profile = Object.assign({}, user.profile, patch.profile);
    if (patch.preferences)
      next.preferences = Object.assign({}, user.preferences, patch.preferences);
    return updateUser(id, next);
  }
  function profileCompletion(user) {
    if (!user) return 0;
    var checks = [
      !!user.fullName,
      !!user.email,
      !!user.location,
      !!user.headline,
      user.role === "candidate"
        ? !!(user.profile.education && user.profile.education.length)
        : true,
      user.role === "candidate"
        ? !!(user.profile.skills && user.profile.skills.length)
        : true,
      user.role === "candidate" ? !!user.profile.resume : true,
      user.role === "candidate"
        ? !!(user.profile.projects && user.profile.projects.length)
        : !!user.profile.companyId,
      user.role === "recruiter" ? !!user.profile.jobTitle : true,
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }
  function getInterviews() {
    var records = safeRead(KEYS.interviews, []);
    return Array.isArray(records) ? records : [];
  }
  function setInterviews(r) {
    save(KEYS.interviews, r);
  }
  function list(key) {
    var records = safeRead(key, []);
    return Array.isArray(records) ? records : [];
  }
  function write(key, records) {
    save(key, records);
  }
  function audit(action, entity, entityId, details) {
    var events = list(KEYS.audits);
    events.push({
      id: uid(),
      action: action,
      entity: entity,
      entityId: entityId,
      details: details || "",
      actor: getSession() ? getSession().name : "Demo system",
      createdAt: new Date().toISOString(),
    });
    write(KEYS.audits, events);
  }
  function addApplication(job, session) {
    var applications = list(KEYS.applications);
    if (
      applications.some(function (a) {
        return a.jobId === job.id && a.candidateId === session.id;
      })
    )
      return null;
    var app = {
      id: uid(),
      jobId: job.id,
      candidateId: session.id,
      candidateName: session.name,
      jobTitle: job.title,
      company: job.company,
      role: job.role,
      status: "Applied",
      currentStage: job.stages[0],
      stageHistory: [{ stage: job.stages[0], at: new Date().toISOString() }],
      createdAt: new Date().toISOString(),
      recruiterNotes: "",
      assessmentId: null,
      interviewId: null,
    };
    applications.push(app);
    write(KEYS.applications, applications);
    audit("Application submitted", "application", app.id, job.title);
    return app;
  }
  function updateApplication(id, patch) {
    var applications = list(KEYS.applications),
      i = applications.findIndex(function (a) {
        return a.id === id;
      });
    if (i < 0) return null;
    var previous = applications[i].currentStage;
    applications[i] = Object.assign({}, applications[i], patch);
    if (patch.currentStage && patch.currentStage !== previous) {
      applications[i].stageHistory = (
        applications[i].stageHistory || []
      ).concat([{ stage: patch.currentStage, at: new Date().toISOString() }]);
    }
    write(KEYS.applications, applications);
    audit(
      "Application updated",
      "application",
      id,
      patch.status || patch.currentStage || "record changed",
    );
    return applications[i];
  }
  function getScheduled() {
    return list(KEYS.scheduled);
  }
  function scheduleInterview(input) {
    if (
      !input.candidateId ||
      !input.scheduledAt ||
      !input.duration ||
      !input.title
    )
      throw new Error(
        "Candidate, title, date, time, and duration are required.",
      );
    var item = Object.assign(
      {
        id: "sched-" + uid(),
        status: "Scheduled",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        notes: "",
        evaluation: null,
      },
      input,
    );
    var records = getScheduled();
    records.push(item);
    write(KEYS.scheduled, records);
    addNotification(
      item.candidateId,
      "Interview scheduled",
      item.title +
        " is scheduled for " +
        new Date(item.scheduledAt).toLocaleString(),
      item.id,
    );
    audit("Interview scheduled", "scheduled-interview", item.id, item.title);
    return item;
  }
  function updateScheduled(id, patch) {
    var records = getScheduled(),
      i = records.findIndex(function (r) {
        return r.id === id;
      });
    if (i < 0) return null;
    records[i] = Object.assign({}, records[i], patch, {
      updatedAt: new Date().toISOString(),
    });
    write(KEYS.scheduled, records);
    addNotification(
      records[i].candidateId,
      "Interview updated",
      records[i].title + " is now " + records[i].status,
      id,
    );
    audit(
      "Interview updated",
      "scheduled-interview",
      id,
      patch.status || "schedule changed",
    );
    return records[i];
  }
  function addNotification(userId, title, message, entityId) {
    var notifications = list(KEYS.notifications);
    notifications.push({
      id: uid(),
      userId: userId,
      title: title,
      message: message,
      entityId: entityId,
      read: false,
      createdAt: new Date().toISOString(),
    });
    write(KEYS.notifications, notifications);
  }
  function savePractice(activity) {
    var records = list(KEYS.practice);
    var item = Object.assign(
      {
        id: "practice-" + uid(),
        createdAt: new Date().toISOString(),
        status: "completed",
        evaluationMethod: "deterministic demo rubric",
      },
      activity,
    );
    records.push(item);
    write(KEYS.practice, records);
    audit("Practice activity completed", "practice", item.id, item.topic);
    return item;
  }
  function getLeetCodeProfile(userId) {
    return (
      list(KEYS.leetcodeProfiles).find(function (profile) {
        return profile.userId === userId;
      }) || null
    );
  }
  function saveLeetCodeProfile(userId, username) {
    var profiles = list(KEYS.leetcodeProfiles),
      index = profiles.findIndex(function (profile) {
        return profile.userId === userId;
      });
    var item = {
      userId: userId,
      username: username,
      profileUrl: "https://leetcode.com/u/" + username + "/",
      linkedAt: new Date().toISOString(),
      connectionType: "profile link only",
      liveSync: false,
    };
    if (index >= 0) profiles[index] = item;
    else profiles.push(item);
    write(KEYS.leetcodeProfiles, profiles);
    audit("LeetCode profile linked", "leetcode-profile", userId, username);
    return item;
  }
  function removeLeetCodeProfile(userId) {
    write(
      KEYS.leetcodeProfiles,
      list(KEYS.leetcodeProfiles).filter(function (profile) {
        return profile.userId !== userId;
      }),
    );
    audit(
      "LeetCode profile disconnected",
      "leetcode-profile",
      userId,
      "Profile link removed",
    );
  }
  function getLeetCodeRecords(userId) {
    return list(KEYS.leetcodeRecords).filter(function (record) {
      return record.userId === userId;
    });
  }
  function getLeetCodeRecord(userId, problemId) {
    return (
      getLeetCodeRecords(userId).find(function (record) {
        return record.problemId === problemId;
      }) || null
    );
  }
  function saveLeetCodeRecord(userId, problemId, patch) {
    var records = list(KEYS.leetcodeRecords),
      index = records.findIndex(function (record) {
        return record.userId === userId && record.problemId === problemId;
      }),
      previous = index >= 0 ? records[index] : null;
    var item = Object.assign(
      {
        id: uid(),
        userId: userId,
        problemId: problemId,
        status: "Not Started",
        bookmarked: false,
        lastPracticed: "",
        notes: "",
        approach: "",
        timeComplexity: "",
        spaceComplexity: "",
        updatedAt: new Date().toISOString(),
      },
      previous || {},
      patch,
      {
        userId: userId,
        problemId: problemId,
        updatedAt: new Date().toISOString(),
      },
    );
    if (index >= 0) records[index] = item;
    else records.push(item);
    write(KEYS.leetcodeRecords, records);
    var changed = Object.keys(patch).filter(function (key) {
      return !previous || previous[key] !== patch[key];
    });
    changed.forEach(function (field) {
      if (
        [
          "status",
          "bookmarked",
          "notes",
          "approach",
          "timeComplexity",
          "spaceComplexity",
          "lastPracticed",
        ].indexOf(field) >= 0
      )
        saveLeetCodeEvidence(userId, problemId, field, item[field]);
    });
    return item;
  }
  function saveLeetCodeEvidence(userId, problemId, event, value) {
    var evidence = list(KEYS.leetcodeEvidence);
    var item = {
      id: uid(),
      userId: userId,
      problemId: problemId,
      event: event,
      value: value,
      source: "manual",
      verified: false,
      createdAt: new Date().toISOString(),
    };
    evidence.push(item);
    write(KEYS.leetcodeEvidence, evidence);
    audit(
      "LeetCode manual evidence recorded",
      "leetcode-evidence",
      problemId,
      event,
    );
    return item;
  }
  function getLeetCodeEvidence(userId) {
    return list(KEYS.leetcodeEvidence).filter(function (item) {
      return item.userId === userId;
    });
  }
  function getLeetCodeGoals(userId) {
    var user = getUser(userId);
    return user && user.profile && user.profile.leetcodeGoals
      ? user.profile.leetcodeGoals
      : { weeklyTarget: 5, targetDifficulty: "Medium" };
  }
  function saveLeetCodeGoals(userId, goals) {
    updateProfile(userId, {
      profile: {
        leetcodeGoals: {
          weeklyTarget: Math.max(1, Number(goals.weeklyTarget) || 5),
          targetDifficulty: goals.targetDifficulty || "Medium",
        },
      },
    });
    return getLeetCodeGoals(userId);
  }
  function getQuestions(role, category) {
    var list = bank[role] || [];
    return list.filter(function (q) {
      return (
        !category ||
        category === "Mixed" ||
        (category === "Technical"
          ? q[4] === "objective"
          : category === "DSA"
            ? role === "Data Structures and Algorithms"
            : category === "Behavioral"
              ? q[4] === "descriptive"
              : category === q[5])
      );
    });
  }
  function createQuestions(role, difficulty, category, count) {
    var list = getQuestions(role, category);
    list = list
      .slice()
      .sort(function () {
        return Math.random() - 0.5;
      })
      .slice(0, Math.min(count || 5, list.length));
    return list.map(function (q) {
      return {
        id: q[0],
        prompt: q[1],
        options: q[2],
        correctIndex: q[3],
        type: q[4],
        topic: q[5],
        keywords: q[6],
        explanation: q[7],
        difficulty: difficulty,
        bookmarked: false,
      };
    });
  }
  function createInterview(role, difficulty, session, options) {
    options = options || {};
    var questions = createQuestions(
      role,
      difficulty,
      options.category || "Mixed",
      options.count || 5,
    );
    if (!questions.length)
      throw new Error("No questions are available for this configuration.");
    var record = {
      id: uid(),
      candidateId: session.id,
      candidateName: session.name,
      role: role,
      category: options.category || "Mixed",
      mode: options.mode || "Assessment",
      duration: Number(options.duration) || 10,
      questions: questions,
      answers: new Array(questions.length).fill(""),
      marked: [],
      score: 0,
      percentage: 0,
      objectiveCorrect: 0,
      status: "In progress",
      recruiterDecision: "Pending",
      startedAt: new Date().toISOString(),
      submittedAt: null,
    };
    var records = getInterviews();
    records.push(record);
    setInterviews(records);
    return record;
  }
  function getInterview(id) {
    return getInterviews().find(function (r) {
      return r.id === id;
    });
  }
  function updateInterview(id, patch) {
    var records = getInterviews(),
      index = records.findIndex(function (r) {
        return r.id === id;
      });
    if (index < 0) return null;
    records[index] = Object.assign({}, records[index], patch);
    setInterviews(records);
    return records[index];
  }
  function resetDemo() {
    localStorage.removeItem(KEYS.users);
    localStorage.removeItem(KEYS.companies);
    localStorage.removeItem(KEYS.interviews);
    localStorage.removeItem(KEYS.scheduled);
    localStorage.removeItem(KEYS.draft);
    localStorage.removeItem(KEYS.bookmarks);
    localStorage.removeItem(KEYS.applications);
    localStorage.removeItem(KEYS.projects);
    localStorage.removeItem(KEYS.audits);
    localStorage.removeItem(KEYS.assessments);
    localStorage.removeItem(KEYS.practice);
    localStorage.removeItem(KEYS.notifications);
    localStorage.removeItem(KEYS.leetcodeProfiles);
    localStorage.removeItem(KEYS.leetcodeRecords);
    localStorage.removeItem(KEYS.leetcodeEvidence);
    save(KEYS.goals, { targetScore: 80, weeklyGoal: 3, completedTasks: [] });
    init();
  }
  window.InterviewData = {
    KEYS: KEYS,
    roleMap: roleMap,
    roles: roles,
    skillTemplates: skillTemplates,
    questionBank: bank,
    quizBank: quizBank,
    init: init,
    getSession: getSession,
    setSession: setSession,
    clearSession: clearSession,
    getUsers: getUsers,
    getUser: getUser,
    currentUser: currentUser,
    createUser: createUser,
    updateUser: updateUser,
    updateProfile: updateProfile,
    emailExists: emailExists,
    profileCompletion: profileCompletion,
    getCompany: function (id) {
      return list(KEYS.companies).find(function (c) {
        return c.id === id;
      });
    },
    getCompanies: function () {
      return list(KEYS.companies);
    },
    saveCompany: function (company) {
      var companies = list(KEYS.companies),
        index = companies.findIndex(function (c) {
          return c.id === company.id;
        });
      if (index >= 0) companies[index] = company;
      else companies.push(company);
      write(KEYS.companies, companies);
      audit("Company profile updated", "company", company.id, company.name);
      return company;
    },
    getInterviews: getInterviews,
    createInterview: createInterview,
    getInterview: getInterview,
    updateInterview: updateInterview,
    getQuestions: getQuestions,
    getScheduled: getScheduled,
    scheduleInterview: scheduleInterview,
    updateScheduled: updateScheduled,
    getNotifications: function (userId) {
      return list(KEYS.notifications).filter(function (n) {
        return n.userId === userId;
      });
    },
    markNotificationRead: function (id) {
      var items = list(KEYS.notifications);
      var i = items.findIndex(function (n) {
        return n.id === id;
      });
      if (i >= 0) {
        items[i].read = true;
        write(KEYS.notifications, items);
      }
    },
    markAllNotificationsRead: function (userId) {
      var items = list(KEYS.notifications).map(function (n) {
        return n.userId === userId ? Object.assign({}, n, { read: true }) : n;
      });
      write(KEYS.notifications, items);
    },
    savePractice: savePractice,
    getPractice: function (userId) {
      return list(KEYS.practice).filter(function (p) {
        return !userId || p.candidateId === userId;
      });
    },
    getJobs: function () {
      return list(KEYS.jobs);
    },
    saveJob: function (job) {
      var jobs = list(KEYS.jobs);
      jobs.push(job);
      write(KEYS.jobs, jobs);
      audit("Job published", "job", job.id, job.title);
      return job;
    },
    getApplications: function () {
      return list(KEYS.applications);
    },
    addApplication: addApplication,
    updateApplication: updateApplication,
    getAssessments: function () {
      return list(KEYS.assessments);
    },
    saveAssessment: function (a) {
      var items = list(KEYS.assessments);
      items.push(a);
      write(KEYS.assessments, items);
      audit("Assessment created", "assessment", a.id, a.title);
      return a;
    },
    getProjects: function () {
      return list(KEYS.projects);
    },
    saveProject: function (p) {
      var items = list(KEYS.projects);
      items.push(p);
      write(KEYS.projects, items);
      audit("Project submitted", "project", p.id, p.title);
      return p;
    },
    getAudits: function () {
      return list(KEYS.audits);
    },
    audit: audit,
    getLeetCodeProfile: getLeetCodeProfile,
    saveLeetCodeProfile: saveLeetCodeProfile,
    removeLeetCodeProfile: removeLeetCodeProfile,
    getLeetCodeRecords: getLeetCodeRecords,
    getLeetCodeRecord: getLeetCodeRecord,
    saveLeetCodeRecord: saveLeetCodeRecord,
    getLeetCodeEvidence: getLeetCodeEvidence,
    getLeetCodeGoals: getLeetCodeGoals,
    saveLeetCodeGoals: saveLeetCodeGoals,
    getSkillsForRole: function (role) {
      return (skillTemplates[role] || []).map(function (name) {
        return { name: name, target: 80, estimated: 0, evidence: [] };
      });
    },
    getDraft: function () {
      return safeRead(KEYS.draft, null);
    },
    setDraft: function (d) {
      save(KEYS.draft, d);
    },
    clearDraft: function () {
      localStorage.removeItem(KEYS.draft);
    },
    getBookmarks: function () {
      return safeRead(KEYS.bookmarks, []);
    },
    setBookmarks: function (b) {
      save(KEYS.bookmarks, b);
    },
    getGoals: function () {
      return safeRead(KEYS.goals, {
        targetScore: 80,
        weeklyGoal: 3,
        completedTasks: [],
      });
    },
    setGoals: function (g) {
      save(KEYS.goals, g);
    },
    getTheme: function () {
      return localStorage.getItem(KEYS.theme) || "light";
    },
    setTheme: function (t) {
      localStorage.setItem(KEYS.theme, t);
    },
    resetDemo: resetDemo,
  };
  init();
})();
