export function homePathForRole(role) {
  return {
    STUDENT: "/student",
    RECRUITER: "/recruiter",
    ADMIN: "/admin",
  }[role] || "/login";
}
