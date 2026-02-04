export type PolicyDecision = {
  decision: "ALLOW" | "NEEDS_HUMAN" | "BLOCK";
  risk_label: "ROUTINE" | "ESCALATE" | "BLOCK";
  risk_score: number;
  risk_rationale: string;
  policy_refs: string[];
};

export function evaluatePolicy(input: {
  tool_name: string;
  tool_args: Record<string, unknown>;
  user_message?: string;
}) : PolicyDecision {
  const tool = input.tool_name.toLowerCase();

  if (tool.includes("terminate") || tool.includes("cancel")) {
    return {
      decision: "BLOCK",
      risk_label: "BLOCK",
      risk_score: 92,
      risk_rationale: "High-impact termination request requires verified identity and signed consent.",
      policy_refs: ["POLICY-HIGH-IMPACT-003"],
    };
  }

  if (tool.includes("update") || tool.includes("access") || tool.includes("payment")) {
    return {
      decision: "NEEDS_HUMAN",
      risk_label: "ESCALATE",
      risk_score: 72,
      risk_rationale: "Sensitive data access or mutation. Human approval required.",
      policy_refs: ["POLICY-IDENTITY-002"],
    };
  }

  return {
    decision: "ALLOW",
    risk_label: "ROUTINE",
    risk_score: 20,
    risk_rationale: "Low-risk action. Auto-approved by policy.",
    policy_refs: ["POLICY-LOW-RISK-001"],
  };
}
