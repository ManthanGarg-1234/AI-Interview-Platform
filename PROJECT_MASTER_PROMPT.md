# AI INTERVIEW PLATFORM
# MASTER PROJECT REQUIREMENTS AND DEVELOPMENT BLUEPRINT

Version: 1.0
Project Type: Full-Stack AI-Powered Placement and Recruitment Platform

==================================================
1. PROJECT OBJECTIVE
==================================================

Develop a complete, professional, fully functional AI-powered Interview, Placement Preparation, Assessment and Recruitment Platform.

The platform has three interconnected portals:

1. Student Portal
2. Recruiter / HR Portal
3. Admin Portal

The platform must support the complete student journey from learning and placement preparation to assessments, interviews and recruitment.

Recruiters must be able to publish jobs, discover candidates, evaluate applications, conduct interviews and manage hiring.

Administrators must manage users, companies, recruitment activities, platform security, misconduct and overall platform operations.

This must be a real full-stack application, not a static frontend demonstration.

Every implemented feature must have:
- Functional frontend.
- Working backend APIs.
- Database integration.
- Proper validation.
- Authentication and authorization.
- Error handling.
- Loading states.
- Success and failure feedback.
- Appropriate automated tests.

Do not create non-functional buttons or fake integrations.

==================================================
2. EXISTING PROJECT AND MIGRATION REQUIREMENT
==================================================

The existing project was developed using:

- HTML
- CSS
- Vanilla JavaScript

We are migrating this existing project to a modern full-stack architecture.

Target stack:

Frontend:
- React.js
- Vite
- JavaScript ES6+
- Tailwind CSS
- React Router
- Axios
- TanStack Query
- React Hook Form
- Zod
- Framer Motion / Motion
- Recharts
- Lucide React
- Monaco Editor

Backend:
- Node.js
- Express.js
- REST APIs
- Socket.IO

Database:
- PostgreSQL
- Prisma ORM

Infrastructure:
- Redis
- BullMQ
- Docker
- WebRTC
- Cloud object storage

Migration rules:

1. Inspect the complete existing repository before changing it.
2. Identify all existing HTML pages, CSS files, JavaScript files and assets.
3. Identify reusable components and existing functionality.
4. Preserve useful branding, logos, images and working business logic.
5. Convert HTML pages into reusable React components.
6. Replace direct DOM manipulation with React state and event handling.
7. Migrate existing styles into a consistent Tailwind-based design system.
8. Replace old page navigation with React Router.
9. Move backend business logic into Express services.
10. Create the PostgreSQL database and Prisma schema.
11. Preserve existing data where applicable.
12. Do not delete existing files or data without approval.
13. Create a Git backup or migration branch before major modifications.

Create:
- EXISTING_PROJECT_AUDIT.md
- MIGRATION_PLAN.md
- MIGRATION_STATUS.md

Do not create an unrelated replacement website.

==================================================
3. TECHNOLOGY STACK
==================================================

Use this stack consistently.

Frontend:
React + Vite + JavaScript + Tailwind CSS.

Backend:
Node.js + Express.js.

Database:
PostgreSQL + Prisma.

Authentication:
JWT-based authentication, secure HTTP-only cookies where appropriate, bcrypt password hashing and refresh-token rotation.

API:
REST APIs with versioning.

Real-time:
Socket.IO.

Background jobs:
Redis + BullMQ.

AI:
LLM API through a centralized provider abstraction.

Coding:
Monaco Editor + Judge0 or a securely isolated custom code execution service.

Video:
WebRTC with signaling and TURN infrastructure.

Charts:
Recharts.

Animations:
Framer Motion / Motion.

Testing:
Vitest, React Testing Library, Supertest and Playwright.

Deployment:
Docker and appropriate cloud infrastructure.

Use JavaScript initially. Do not introduce TypeScript unless explicitly approved.

Do not install unnecessary dependencies.

==================================================
4. COMPLETE UI/UX AND DESIGN SYSTEM
==================================================

Build a premium, modern SaaS interface.

Visual direction:
- Professional.
- Minimal.
- Modern.
- Consistent.
- Responsive.
- Clean typography.
- Clear information hierarchy.
- Premium dashboard layouts.
- Subtle gradients.
- Elegant cards.
- Professional tables.
- Beautiful charts.
- Consistent spacing.
- Carefully selected colors.

Use:
- Deep indigo/blue as primary.
- Violet as secondary.
- Teal as accent.
- Neutral backgrounds.
- Consistent success, warning and error colors.

Support:
- Light theme.
- Dark theme.
- Theme persistence.

Use Inter or a comparable professional font.

Use Motion for:
- Page transitions.
- Sidebar transitions.
- Modal animations.
- Card entrances.
- Hover effects.
- Progress bars.
- Dropdowns.
- Notifications.
- Loading transitions.

Animation rules:
- Use subtle, professional animations.
- Avoid unnecessary motion.
- Respect reduced-motion preferences.
- Do not sacrifice performance for visual effects.

Create reusable UI components:
- Buttons.
- Inputs.
- Selects.
- Textareas.
- Modals.
- Drawers.
- Tooltips.
- Tabs.
- Badges.
- Cards.
- Data tables.
- Search bars.
- Filters.
- Pagination.
- Charts.
- Progress indicators.
- Toast notifications.
- Loading skeletons.
- Empty states.
- Error states.
- Confirmation dialogs.
- Avatars.
- Breadcrumbs.

Ensure responsive layouts for desktop, laptop, tablet and mobile.

==================================================
5. PUBLIC WEBSITE
==================================================

Create:

- Home.
- Features.
- Student Features.
- Recruiter Features.
- AI Interviews.
- Coding Platform.
- Resume Analyzer.
- About.
- Contact.
- FAQ.
- Login.
- Registration.
- Forgot Password.
- Privacy Policy.
- Terms and Conditions.

Landing page must include:

- Professional hero section.
- Product introduction.
- Feature overview.
- Student benefits.
- Recruiter benefits.
- AI capabilities.
- Coding platform preview.
- Interview workflow.
- Recruitment workflow.
- Product screenshots or genuine interactive previews.
- FAQs.
- Footer.

Do not invent customer testimonials or success statistics.

==================================================
6. AUTHENTICATION AND AUTHORIZATION
==================================================

Roles:

- STUDENT
- RECRUITER
- ADMIN

Implement:

- Registration.
- Login.
- Logout.
- Email verification.
- Forgot password.
- Reset password.
- Secure password hashing.
- Session management.
- Refresh token rotation.
- Account status management.
- Protected routes.
- Role-based access control.
- Resource-level authorization.

Student and recruiter signup must be separate or role-aware.

Public admin registration must not be allowed.

Admin accounts must be provisioned securely.

Prevent:
- Unauthorized route access.
- Cross-student data access.
- Recruiter access to unauthorized candidates.
- Role escalation.
- Suspended accounts from accessing protected features.

Never rely on frontend permissions alone.

==================================================
7. STUDENT PORTAL
==================================================

7.1 STUDENT DASHBOARD

Show:

- Welcome section.
- Profile completion.
- Placement readiness.
- Technical score.
- Coding score.
- Communication score.
- Aptitude score.
- Problems solved.
- Assessments completed.
- Interviews completed.
- Upcoming interviews.
- Pending assignments.
- Study streak.
- Weekly learning activity.
- Subject-wise performance.
- Topic-wise performance.
- Recent progress.
- AI recommendations.

All dashboard data must come from actual database records.

7.2 STUDENT PROFILE

Sections:

- Personal information.
- Contact details.
- Education.
- Academic information.
- Technical skills.
- Programming languages.
- Projects.
- Internships.
- Work experience.
- Certifications.
- Achievements.
- GitHub.
- LinkedIn.
- Portfolio.
- Resume.

Implement complete editing, saving, validation and profile visibility settings.

7.3 RESUME BUILDER

- Create resume.
- Upload resume.
- Edit resume.
- Professional templates.
- Resume preview.
- Export PDF.
- Save multiple versions.
- Duplicate versions.

7.4 AI RESUME ANALYZER

Analyze:

- Resume structure.
- Formatting.
- Grammar.
- Readability.
- Keywords.
- Technical skills.
- Projects.
- Experience.
- Achievements.
- ATS compatibility.
- Job description matching.

Generate:
- Overall analysis.
- Section-wise feedback.
- Missing keywords.
- Skill gaps.
- Improvement suggestions.
- Suggested bullet points.

AI suggestions must be editable and require student approval.

Never fabricate experience or qualifications.

7.5 AI PROFILE ENHANCER

Improve:
- Professional summary.
- Skills presentation.
- Project descriptions.
- Experience descriptions.
- GitHub presentation.
- Portfolio content.
- LinkedIn content.
- Achievements.

7.6 AI CHATBOT

Build a complete chatbot with:

- Persistent conversation history.
- New conversations.
- Delete conversation.
- Conversation search.
- Subject selection.
- Topic selection.
- DSA assistance.
- Java and programming assistance.
- Code debugging.
- SQL assistance.
- DBMS.
- Operating Systems.
- Computer Networks.
- OOP.
- System Design.
- Interview preparation.
- Resume guidance.
- Study assistance.

Support:
- Markdown.
- Code syntax highlighting.
- Copy code.
- Streaming responses where supported.
- Regenerate response.
- Context-aware conversation.

Use authorized student learning context only.

==================================================
8. CODING PLATFORM AND BUILT-IN IDE
==================================================

Create a LeetCode-like coding platform.

Topics:

- Arrays.
- Strings.
- Binary Search.
- Linked Lists.
- Stack.
- Queue.
- Sliding Window.
- Two Pointers.
- Trees.
- BST.
- Graphs.
- Greedy.
- Dynamic Programming.
- Backtracking.
- Tries.
- Bit Manipulation.
- Hashing.
- Advanced Algorithms.

Problem information:

- Title.
- Statement.
- Input format.
- Output format.
- Constraints.
- Examples.
- Difficulty.
- Topic tags.
- Starter code.
- Test cases.
- Editorial where permitted.

IDE:

- Monaco Editor.
- Java.
- C++.
- Python.
- JavaScript.
- Syntax highlighting.
- Auto indentation.
- Code completion.
- Line numbers.
- Custom input.
- Run.
- Submit.
- Output panel.
- Test case panel.
- Execution time.
- Memory usage.
- Submission history.
- Code persistence.
- Theme selection.
- Full-screen mode.

Three modes:

PRACTICE MODE:
- AI helper allowed.
- Hints.
- Debugging.
- Explanations.
- Editorial access.

CONTEST MODE:
- AI assistance restricted.
- Timed submissions.
- Hidden test cases.
- Leaderboard.
- Integrity checks.

RECRUITER ASSESSMENT MODE:
- AI assistance restricted.
- Recruiter-configured duration.
- Hidden tests.
- Candidate-specific attempts.
- Secure submission records.

Enforce mode restrictions on the server.

Code execution workflow:

1. Receive submission.
2. Verify permissions.
3. Validate language and source.
4. Save submission.
5. Queue execution.
6. Run in isolated environment.
7. Apply CPU, memory and time limits.
8. Execute public and hidden tests.
9. Evaluate verdict.
10. Save results.
11. Update analytics.

Verdicts:
- Accepted.
- Wrong Answer.
- Compilation Error.
- Runtime Error.
- Time Limit Exceeded.
- Memory Limit Exceeded.
- Internal Error.

Never execute untrusted student code directly in the Express server.

==================================================
9. ASSESSMENTS AND ASSIGNMENTS
==================================================

Support:

- Technical MCQs.
- Aptitude.
- Coding assessments.
- SQL tests.
- Subject-wise assessments.
- Topic-wise assessments.
- Practice assignments.
- Recruiter assessments.
- Timed tests.
- Contests.

Features:

- Question bank.
- Assessment creation.
- Question randomization.
- Difficulty levels.
- Time limits.
- Negative marking configuration.
- Multiple attempt configuration.
- Auto-save.
- Submission.
- Automatic scoring.
- Manual evaluation.
- Attempt history.
- Result reports.

Analyze:

- Score.
- Accuracy.
- Time.
- Correct answers.
- Incorrect answers.
- Unattempted questions.
- Topic performance.
- Subject performance.
- Difficulty-wise performance.

==================================================
10. AI INTERVIEWER
==================================================

Create a dedicated AI interview room.

Configuration:

- Technical interview.
- HR interview.
- Behavioral interview.
- Mixed interview.
- Easy, Medium and Hard.
- 5, 10 or 15 questions.
- Target job role.
- Subject.
- Topics.
- Duration.
- Language.

Interview workflow:

1. Configure interview.
2. AI generates questions.
3. AI introduces interview.
4. Ask one question at a time.
5. Receive candidate answer.
6. Understand the answer.
7. Ask relevant follow-up questions.
8. Maintain interview context.
9. Continue interview.
10. End interview.
11. Generate evaluation.

Support text interviews first.

Add voice support using speech-to-text and text-to-speech when configured.

Evaluation:

- Technical correctness.
- Problem-solving.
- Conceptual understanding.
- Communication.
- Clarity.
- Answer structure.
- Reasoning.
- Time management.

Generate:

- Overall score.
- Category scores.
- Questions.
- Answers.
- Answer feedback.
- Strengths.
- Weaknesses.
- Improvement recommendations.
- Suggested topics.

Save all completed sessions.

Recording and transcript storage must require appropriate consent.

==================================================
11. REAL RECRUITER INTERVIEWS
==================================================

Features:

- Interview scheduling.
- Invitations.
- Candidate confirmation.
- Video room.
- Audio controls.
- Camera controls.
- Screen sharing.
- Interview questions.
- Interviewer notes.
- Evaluation rubric.
- Feedback.
- Technical rating.
- Communication rating.
- Hiring recommendation.

Use WebRTC and appropriate signaling infrastructure.

Provide explicit camera, microphone and screen-sharing consent.

==================================================
12. LEARNING MANAGEMENT AND AI STUDY PLANNER
==================================================

Learning hierarchy:

Subject -> Topic -> Subtopic -> Resource -> Practice Activity.

Subjects:

- DSA.
- Programming Languages.
- OOP.
- DBMS.
- SQL.
- Operating Systems.
- Computer Networks.
- System Design.
- Aptitude.
- Communication.
- HR Preparation.

Planner features:

- Target role.
- Target companies.
- Placement deadline.
- Available daily study time.
- Daily schedule.
- Weekly schedule.
- Monthly roadmap.
- Tasks.
- Priorities.
- Deadlines.
- Revision.
- Practice questions.
- Mock interviews.
- Reminders.
- Progress tracking.

Adaptive AI planner must analyze actual student performance.

Recommend improvements based on weak topics and unfinished tasks.

Major schedule changes must require student approval.

==================================================
13. PERFORMANCE ANALYTICS ENGINE
==================================================

Collect data from:

- Coding.
- Assignments.
- Assessments.
- AI interviews.
- Mock interviews.
- Real interviews.
- Learning activities.
- Subject progress.
- Topic progress.
- Resume analysis.
- Applications.

Track separate indicators:

- Coding proficiency.
- Technical knowledge.
- Aptitude.
- Communication.
- Interview performance.
- Subject mastery.
- Topic mastery.
- Learning consistency.
- Assessment performance.
- Placement readiness.

Provide:
- Trend charts.
- Subject-wise analytics.
- Topic-wise analytics.
- Skill-wise analytics.
- Date filters.
- AI-generated improvement reports.

Scores must have transparent definitions and calculation methods.

Do not generate misleading readiness scores from insufficient data.

==================================================
14. SKILL AND EVIDENCE SYSTEM
==================================================

Maintain a skill taxonomy.

Examples:

- Java.
- Python.
- JavaScript.
- DSA.
- SQL.
- DBMS.
- React.
- Node.js.
- System Design.
- Communication.

Evidence:

- Coding results.
- Assessment results.
- Interview evaluations.
- Projects.
- Certifications.
- Recruiter assignments.
- Verified experience.

Distinguish:

- Self-declared skills.
- AI-inferred skills.
- Assessment-supported skills.
- Recruiter-verified skills.

Do not treat self-declared skills as verified.

==================================================
15. RECRUITER PORTAL
==================================================

Recruiter dashboard:

- Total jobs.
- Active jobs.
- Applications.
- Shortlisted candidates.
- Assessments.
- Interviews.
- Selections.
- Rejections.
- Hiring conversion.
- Upcoming interviews.

Company management:

- Registration.
- Company profile.
- Verification.
- Company members.

Job management:

- Create.
- Edit.
- Publish.
- Save drafts.
- Pause.
- Close.
- Delete eligible jobs.

Job fields:

- Title.
- Description.
- Required skills.
- Preferred skills.
- Experience.
- Education.
- Location.
- Salary range.
- Employment type.
- Deadline.
- Hiring rounds.

Candidate discovery:

- Skills.
- Education.
- Experience.
- Projects.
- Certifications.
- Relevant assessment performance.
- Verified skill evidence.

Candidate profile:

- Education.
- Skills.
- Resume.
- Projects.
- GitHub.
- Internships.
- Experience.
- Certifications.
- Authorized assessment summaries.
- Authorized interview summaries.

Hiring workflow:

Applied -> Screening -> Shortlisted -> Assessment -> Technical Interview -> HR Interview -> Selected / Rejected.

Recruiters can:

- Shortlist.
- Reject.
- Move stages.
- Assign assessments.
- Schedule interviews.
- Add notes.
- Evaluate candidates.
- Record hiring decisions.

All hiring decisions must be auditable.

Respect student consent and data-sharing permissions.

==================================================
16. ADMIN PORTAL
==================================================

Admin dashboard:

- Total students.
- Active students.
- Total recruiters.
- Verified companies.
- Jobs.
- Active jobs.
- Scheduled interviews.
- Completed interviews.
- Assessment attempts.
- Successful hiring outcomes.
- AI usage.
- Platform health.

Modules:

1. User Management.
2. Student Management.
3. Recruiter Management.
4. Company Verification.
5. Job Moderation.
6. Assessment Management.
7. Interview Management.
8. Security Monitoring.
9. Misconduct Management.
10. Moderation.
11. Audit Logs.
12. AI Management.
13. Platform Analytics.
14. System Settings.

Security monitoring:

- Failed logins.
- Brute-force attempts.
- Suspicious API traffic.
- Unauthorized access.
- SQL injection indicators.
- XSS indicators.
- Malicious uploads.
- Rate-limit violations.
- Suspicious data exports.
- Abnormal code execution.

Misconduct:

Students:
- Plagiarism.
- Cheating.
- Multiple-account abuse.
- Harassment.
- Assessment manipulation.

Recruiters:
- Fake job postings.
- Harassment.
- Unauthorized data access.
- Fraudulent recruitment.
- Misuse of platform functionality.

Moderation workflow:

FLAGGED -> INVESTIGATION -> EVIDENCE REVIEW -> DECISION -> APPEAL.

Support:
- Warnings.
- Restrictions.
- Temporary suspension.
- Permanent suspension where justified.
- Appeals.
- Admin review.

AI flags are not proof of misconduct.

Audit logs must capture sensitive administrative actions.

==================================================
17. DATABASE DESIGN
==================================================

Use PostgreSQL with Prisma.

Create normalized models for:

Identity:
User, Role, Permission, UserSession, RefreshToken.

Student:
StudentProfile, Education, Skill, StudentSkill, Project, Experience, Certification.

Recruiter:
RecruiterProfile, Company, CompanyMember, CompanyVerification.

Jobs:
Job, JobSkill, Application, HiringStage, ApplicationStageHistory, RecruiterNote.

Resume:
Resume, ResumeVersion, ResumeAnalysis, ProfileSuggestion.

Coding:
CodingProblem, ProblemTopic, TestCase, CodeSubmission, ExecutionResult, Bookmark.

Assessments:
Assessment, AssessmentQuestion, QuestionOption, AssessmentAssignment, AssessmentAttempt, AssessmentAnswer, AssessmentResult.

Interviews:
InterviewSession, InterviewParticipant, InterviewQuestion, InterviewAnswer, InterviewEvaluation, InterviewFeedback.

Learning:
Subject, Topic, Subtopic, LearningResource, LearningProgress, StudentActivity.

Planner:
StudyPlan, StudyGoal, StudyTask, StudyTaskCompletion, StudyRecommendation.

AI:
AIConversation, AIMessage, AIUsageRecord, AIModelConfiguration, AIEvaluation.

Security:
SecurityEvent, ModerationCase, ModerationEvidence, ModerationAction, Appeal.

Privacy:
ConsentRecord, DataAccessLog, AuditLog.

Notifications:
Notification, NotificationPreference.

Use UUIDs, timestamps, foreign keys, indexes and appropriate transactions.

Use JSON only for genuinely flexible metadata.

Create an ER diagram.

==================================================
18. BACKEND AND API ARCHITECTURE
==================================================

Use a modular monolithic backend.

Modules:

- auth
- users
- students
- recruiters
- companies
- jobs
- applications
- interviews
- assessments
- coding
- learning
- study-planner
- resumes
- ai
- analytics
- skills
- integrity
- moderation
- notifications
- audit
- admin

Use versioned APIs:

/api/v1/auth
/api/v1/students
/api/v1/recruiters
/api/v1/companies
/api/v1/jobs
/api/v1/applications
/api/v1/interviews
/api/v1/assessments
/api/v1/coding
/api/v1/learning
/api/v1/study-planner
/api/v1/resumes
/api/v1/ai
/api/v1/analytics
/api/v1/notifications
/api/v1/admin
/api/v1/security

Every endpoint must have:

- HTTP method.
- Request format.
- Response format.
- Authentication.
- Authorization.
- Validation.
- Error handling.
- Appropriate rate limits.

Use pagination for large collections.

==================================================
19. LOGIN, SIGNUP, ROUTING AND NAVIGATION
==================================================

Create complete login and signup interfaces.

Login:
- Email.
- Password.
- Show/hide password.
- Remember-me where appropriate.
- Forgot password.
- Validation.
- Loading states.
- Error handling.

Signup:
- Student registration.
- Recruiter registration.
- Role-specific fields.
- Password confirmation.
- Terms acceptance.
- Email verification.

Create protected routes.

Student routes:

/student/dashboard
/student/profile
/student/resume
/student/resume/analyzer
/student/profile-enhancer
/student/ai-assistant
/student/ai-interviewer
/student/interviews
/student/coding
/student/assessments
/student/assignments
/student/contests
/student/learning
/student/study-planner
/student/analytics
/student/jobs
/student/applications
/student/notifications
/student/settings

Recruiter routes:

/recruiter/dashboard
/recruiter/company
/recruiter/jobs
/recruiter/candidates
/recruiter/assessments
/recruiter/interviews
/recruiter/pipeline
/recruiter/analytics
/recruiter/notifications
/recruiter/settings

Admin routes:

/admin/dashboard
/admin/users
/admin/students
/admin/recruiters
/admin/companies
/admin/jobs
/admin/assessments
/admin/interviews
/admin/security
/admin/incidents
/admin/moderation
/admin/audit-logs
/admin/ai-management
/admin/analytics
/admin/settings

Create additional routes for required detail pages.

Student sidebar:
- Dashboard.
- Profile.
- Resume.
- Profile Enhancer.
- AI Assistant.
- AI Interviewer.
- Interviews.
- Coding Platform.
- Submissions.
- Assessments.
- Assignments.
- Contests.
- Learning.
- Study Planner.
- Analytics.
- Jobs.
- Applications.
- Notifications.
- Settings.

Recruiter sidebar:
- Dashboard.
- Company Profile.
- Jobs.
- Create Job.
- Applications.
- Candidates.
- Assessments.
- Interviews.
- Hiring Pipeline.
- Analytics.
- Notifications.
- Settings.

Admin sidebar:
- Overview.
- Users.
- Students.
- Recruiters.
- Companies.
- Jobs.
- Assessments.
- Interviews.
- Security.
- Incidents.
- Moderation.
- Audit Logs.
- AI Management.
- Analytics.
- Settings.

All navigation must be functional.

Implement:
- Active navigation state.
- Expand/collapse.
- Nested menus.
- Mobile drawer.
- Tooltips.
- Breadcrumbs.
- Notification dropdown.
- User dropdown.
- Theme switcher.
- Profile shortcut.
- Logout.

Implement custom 404 and access-denied pages.

==================================================
20. DEPENDENCY INSTALLATION AND PROJECT SETUP
==================================================

Inspect all dependencies before installing.

Install missing required packages automatically wherever permitted.

Check compatibility and avoid unnecessary duplicate packages.

If installation fails:
- Explain the error.
- Try a compatible solution.
- Give exact manual commands if needed.

Create:

- package.json files.
- .env.example.
- .gitignore.
- Dockerfiles.
- docker-compose.yml.
- Database migrations.
- Seed scripts.
- Startup scripts.
- README.md.
- DEPENDENCIES.md.

Check availability of:
- Node.js.
- npm.
- PostgreSQL.
- Redis.
- Docker.

Do not assume external services are running.

Whenever manual action is required, tell me:

1. What is required.
2. Why it is required.
3. Exact command.
4. Directory to run it from.
5. Required environment variables.
6. Verification procedure.

Never invent credentials.

Do not expose secrets in frontend code or Git.

==================================================
21. SECURITY AND PRIVACY
==================================================

Implement:

- RBAC.
- Resource ownership checks.
- Secure password hashing.
- Secure tokens.
- Input validation.
- Output encoding.
- SQL injection protection.
- XSS protection.
- CSRF protection where applicable.
- Rate limiting.
- CORS.
- Secure headers.
- File validation.
- File size limits.
- Secure storage.
- Audit logging.
- Consent management.
- Data retention.
- Account deletion workflows.
- Database backups.

Do not provide unrestricted database access to AI services.

Use minimal authorized context for AI requests.

Protect resumes, interviews, recordings and assessment data.

Do not secretly record or monitor users.

Use human review for serious misconduct decisions.

==================================================
22. PERFORMANCE TARGETS
==================================================

Initial capacity assumptions:

- 5,000 students.
- 200 recruiters.
- 100 companies.
- 10 admins.
- 500 concurrent users.
- 50 concurrent AI interviews.
- 100 coding submissions per minute.
- 200 assessment submissions per minute.

Design with:

- Database connection pooling.
- Redis caching.
- Background queues.
- Asynchronous AI processing.
- Independent code execution workers.
- Database indexes.
- Pagination.
- Efficient queries.
- Object storage.

These targets must be verified through load testing.

==================================================
23. TESTING
==================================================

Frontend:
- Component tests.
- Form tests.
- Route tests.
- Loading and error tests.

Backend:
- Unit tests.
- Integration tests.
- Authentication tests.
- Authorization tests.
- Database tests.

End-to-end:
- Registration.
- Login.
- Resume analysis.
- Coding execution.
- Assessment completion.
- AI interview.
- Study planner.
- Job publishing.
- Job application.
- Shortlisting.
- Recruiter interview.
- Admin moderation.

Security:
- Unauthorized access.
- Role escalation.
- Cross-user data access.
- Invalid tokens.
- Malicious input.
- Upload attacks.
- Rate limiting.
- Code sandbox isolation.

Use Playwright for browser-level workflows.

==================================================
24. IMPLEMENTATION PHASES
==================================================

Phase 1: Existing Project Audit and Migration Planning.

Phase 2: React + Vite Frontend Setup and Design System.

Phase 3: Express Backend and PostgreSQL Setup.

Phase 4: Authentication, Login, Signup and RBAC.

Phase 5: Student Profile and Dashboard.

Phase 6: Coding Platform and Code Judge.

Phase 7: Assessments and Assignments.

Phase 8: AI Chatbot and AI Interviewer.

Phase 9: Resume Analyzer and Profile Enhancer.

Phase 10: Learning Management and Study Planner.

Phase 11: Performance Analytics and Skill Evidence.

Phase 12: Recruiter Portal and Hiring Workflow.

Phase 13: Admin Portal and Security Management.

Phase 14: Cross-Portal Integration.

Phase 15: Testing, Optimization and Deployment.

Complete and test each phase before moving to the next.

==================================================
25. STRICT DEVELOPMENT RULES
==================================================

1. Inspect the existing project before making changes.
2. Never delete working code without approval.
3. Create a backup or Git branch before migration.
4. Read project documentation before coding.
5. Implement incrementally.
6. Use reusable React components.
7. Use modular Express services.
8. Design database models before dependent APIs.
9. Use proper validation.
10. Implement backend authorization.
11. Use real database persistence.
12. Never hardcode credentials.
13. Never expose AI keys in frontend code.
14. Do not use fake data for completed functionality.
15. Do not create non-functional buttons.
16. Implement loading, empty and error states.
17. Test every important workflow.
18. Fix errors before moving forward.
19. Update documentation.
20. Maintain IMPLEMENTATION_STATUS.md.
21. Identify external configuration requirements.
22. Do not claim completion without passing tests.

For every module report:

- Implemented functionality.
- Database changes.
- APIs created.
- Dependencies installed.
- Tests performed.
- Tests passed.
- Known issues.
- Manual configuration required.
- Remaining work.

==================================================
26. FIRST TASK
==================================================

Do not start by generating the entire website.

First inspect the existing HTML, CSS and JavaScript repository.

Prepare:

1. EXISTING_PROJECT_AUDIT.md
2. MIGRATION_PLAN.md
3. SRS.md
4. HLD.md
5. LLD.md
6. DATABASE_ERD.md
7. API_SPECIFICATION.md
8. SECURITY.md
9. TESTING.md
10. IMPLEMENTATION_STATUS.md
11. DEPENDENCIES.md

Identify missing features, technical conflicts and migration risks.

Propose the full architecture and implementation sequence.

Wait for my approval before making substantial changes.

After approval, implement the migration and development phases incrementally.

FINAL GOAL:

Deliver a complete, secure, professional, responsive and fully functional AI Interview and Placement Platform.

The website must work from login and registration to student learning, coding, AI interviews, assessments, recruiter hiring and admin governance.

Build a real integrated product, not merely a visually attractive prototype.