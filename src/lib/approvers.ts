/**
 * ATLAS HITL Approver Registry
 * Each approver has a unique slug, full name, email, and role.
 * The slug is what gets stored in dropdowns.
 * The fullName is what gets logged in audit_log.actor and history[].actor.
 */

export type Approver = {
  slug: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  role: string;
};

export const APPROVERS: Approver[] = [
  { slug: "naveed",  firstName: "Naveed",  lastName: "Islam",    fullName: "Naveed Islam",    email: "nislam@ischool.berkeley.edu",         role: "Case Officer" },
  { slug: "sri",     firstName: "Sri",     lastName: "Kavya",    fullName: "Sri Kavya",       email: "srikavyanama@ischool.berkeley.edu",   role: "Case Officer" },
  { slug: "anna",    firstName: "Anna",    lastName: "Ko",       fullName: "Anna Ko",         email: "anna_ko@ischool.berkeley.edu",        role: "Case Officer" },
  { slug: "ben",     firstName: "Ben",     lastName: "Justice",  fullName: "Ben Justice",     email: "benjustice@ischool.berkeley.edu",     role: "Case Officer" },
  { slug: "albert",  firstName: "Albert",  lastName: "Diaz",     fullName: "Albert Diaz",     email: "albert.diaz@ischool.berkeley.edu",    role: "Case Officer" },
  { slug: "aidan",   firstName: "Aidan",   lastName: "Thomas",   fullName: "Aidan Thomas",    email: "aidan_thomas@ischool.berkeley.edu",   role: "Case Officer" },
  { slug: "sarah",   firstName: "Sarah",   lastName: "Smith",    fullName: "Sarah Smith",     email: "sarah_smith@atlas.org",               role: "Case Officer" },
];

export const APPROVER_SLUGS = APPROVERS.map((a) => a.slug);

export function getApprover(slug: string): Approver | undefined {
  return APPROVERS.find((a) => a.slug === slug);
}

export function getApproverFullName(slug: string): string {
  return getApprover(slug)?.fullName ?? slug;
}
