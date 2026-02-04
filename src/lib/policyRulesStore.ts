import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type PolicyRule = {
  id: string;
  created_at: string;
  updated_at: string;
  rule_name: string;
  tool_name: string;
  description: string | null;
  risk_threshold: number;
  risk_weight: number;
  pattern_regex: string | null;
  pattern_field: string | null;
  policy_refs: string[];
  conditions: Record<string, any>;
  priority: number;
  enabled: boolean;
};

/**
 * Load all enabled policy rules from the database
 */
export async function getAllPolicyRules(): Promise<PolicyRule[]> {
  const { data, error } = await supabaseAdmin
    .from("policy_rules")
    .select("*")
    .eq("enabled", true)
    .order("priority", { ascending: true });

  if (error) {
    console.error("Error loading policy rules:", error);
    return [];
  }

  return (data || []) as PolicyRule[];
}

/**
 * Load policy rules applicable to a specific tool
 * Supports wildcard matching (e.g., "benefit_%" matches "benefit_approve", "benefit_deny")
 */
export async function getPolicyRulesForTool(toolName: string): Promise<PolicyRule[]> {
  const { data, error } = await supabaseAdmin
    .from("policy_rules")
    .select("*")
    .eq("enabled", true)
    .order("priority", { ascending: true });

  if (error) {
    console.error(`Error loading policy rules for tool ${toolName}:`, error);
    return [];
  }

  // Filter rules that match the tool name (support wildcards)
  const rules = (data || []) as PolicyRule[];
  return rules.filter((rule) => {
    if (rule.tool_name === toolName) return true;
    
    // Support SQL-like wildcard pattern matching
    if (rule.tool_name.includes("%")) {
      const pattern = rule.tool_name.replace(/%/g, ".*");
      const regex = new RegExp(`^${pattern}$`);
      return regex.test(toolName);
    }
    
    return false;
  });
}

/**
 * Get a specific policy rule by name
 */
export async function getPolicyRuleByName(ruleName: string): Promise<PolicyRule | null> {
  const { data, error } = await supabaseAdmin
    .from("policy_rules")
    .select("*")
    .eq("rule_name", ruleName)
    .single();

  if (error || !data) {
    return null;
  }

  return data as PolicyRule;
}

/**
 * Match policy rules against input conditions
 * Returns rules that match the given conditions
 */
export function matchRulesAgainstInput(
  rules: PolicyRule[],
  input: Record<string, any>
): PolicyRule[] {
  return rules.filter((rule) => {
    // If no conditions specified, rule applies to all
    if (!rule.conditions || Object.keys(rule.conditions).length === 0) {
      return true;
    }

    // Check if input matches rule conditions
    return matchConditions(rule.conditions, input);
  });
}

/**
 * Helper function to match conditions recursively
 */
function matchConditions(conditions: any, input: any): boolean {
  for (const [key, value] of Object.entries(conditions)) {
    if (typeof value === "object" && value !== null) {
      // Handle special operators
      if ("match_any" in value && Array.isArray((value as any).match_any)) {
        const inputValue = getNestedValue(input, key);
        const matched = (value as any).match_any.some((v: any) => {
          if (typeof inputValue === "string") {
            return inputValue.includes(v) || inputValue === v;
          }
          return inputValue === v;
        });
        if (!matched) return false;
      } else if ("not" in value) {
        const inputValue = getNestedValue(input, key);
        if (inputValue === (value as any).not) return false;
      } else if ("lte" in value) {
        const inputValue = getNestedValue(input, key);
        const lteValue = (value as any).lte;
        if (typeof inputValue !== "number" || typeof lteValue !== "number" || inputValue > lteValue) return false;
      } else if ("gte" in value) {
        const inputValue = getNestedValue(input, key);
        const gteValue = (value as any).gte;
        if (typeof inputValue !== "number" || typeof gteValue !== "number" || inputValue < gteValue) return false;
      } else {
        // Nested object - recurse
        const inputNested = getNestedValue(input, key);
        if (!inputNested || !matchConditions(value, inputNested)) {
          return false;
        }
      }
    } else {
      // Direct equality check
      const inputValue = getNestedValue(input, key);
      if (inputValue !== value) return false;
    }
  }
  return true;
}

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj: any, path: string): any {
  if (!obj) return undefined;
  
  const keys = path.split(".");
  let current = obj;
  
  for (const key of keys) {
    if (current === null || current === undefined) return undefined;
    current = current[key];
  }
  
  return current;
}

/**
 * Apply regex pattern matching to input field
 * Returns true if pattern matches
 */
export function matchPattern(
  rule: PolicyRule,
  input: Record<string, any>
): boolean {
  if (!rule.pattern_regex || !rule.pattern_field) {
    return false;
  }

  try {
    const fieldValue = getNestedValue(input, rule.pattern_field);
    if (!fieldValue) return false;

    // Convert to string for regex matching
    const valueStr = typeof fieldValue === "string" 
      ? fieldValue 
      : JSON.stringify(fieldValue);

    const regex = new RegExp(rule.pattern_regex, "i");
    return regex.test(valueStr);
  } catch (error) {
    console.error(`Error matching pattern for rule ${rule.rule_name}:`, error);
    return false;
  }
}

/**
 * Compute aggregate risk score from matched rules
 * Uses weighted average of matching rules
 */
export function computeAggregateRiskScore(
  matchedRules: PolicyRule[],
  input: Record<string, any>
): { score: number; rationale: string; policy_refs: string[] } {
  if (matchedRules.length === 0) {
    return {
      score: 20,
      rationale: "No specific rules matched. Default low-risk score.",
      policy_refs: ["POLICY-LOW-RISK-001"],
    };
  }

  // Calculate weighted risk score
  let totalWeightedScore = 0;
  let totalWeight = 0;
  const allPolicyRefs = new Set<string>();
  const matchedRuleNames: string[] = [];

  for (const rule of matchedRules) {
    const weight = rule.risk_weight || 1.0;
    const threshold = rule.risk_threshold;

    // Apply pattern matching bonus if applicable
    let patternBonus = 0;
    if (matchPattern(rule, input)) {
      patternBonus = 5; // Add 5 points for pattern match
      matchedRuleNames.push(`${rule.rule_name}(+pattern)`);
    } else {
      matchedRuleNames.push(rule.rule_name);
    }

    totalWeightedScore += (threshold + patternBonus) * weight;
    totalWeight += weight;

    // Collect policy refs
    if (Array.isArray(rule.policy_refs)) {
      rule.policy_refs.forEach((ref) => allPolicyRefs.add(ref));
    }
  }

  const score = Math.round(Math.min(98, totalWeightedScore / totalWeight));
  const rationale = `Risk computed from ${matchedRules.length} rule(s): ${matchedRuleNames.join(", ")}. Weighted score: ${score}.`;
  const policy_refs = Array.from(allPolicyRefs);

  return { score, rationale, policy_refs };
}
