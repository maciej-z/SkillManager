export type UserRole = "employee" | "competence_leader" | "admin";

export interface Profile {
  id: string;
  role: UserRole;
  manager_id: string;
  full_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompetencyModel {
  id: string;
  version: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Competency {
  id: string;
  competency_model_id: string;
  name: string;
  description: string | null;
  expected_proficiency_level: number;
  created_at: string;
}

export type AssessmentStatus = "draft" | "submitted" | "approved";

export interface Assessment {
  id: string;
  employee_id: string;
  competency_model_id: string;
  status: AssessmentStatus;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
  leader_comment: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

export interface AssessmentScore {
  id: string;
  assessment_id: string;
  competency_id: string;
  score: number;
  comment: string | null;
  created_at: string;
  updated_at: string;
  leader_comment: string | null;
}
