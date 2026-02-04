-- Create policy_rules table for Phase 3 implementation
-- This table stores policy rules by tool name with risk thresholds and policy references

CREATE TABLE IF NOT EXISTS policy_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Rule identification
  rule_name TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  description TEXT,
  
  -- Risk scoring
  risk_threshold INTEGER NOT NULL CHECK (risk_threshold >= 0 AND risk_threshold <= 100),
  risk_weight DECIMAL(5,2) DEFAULT 1.0,
  
  -- Pattern matching for heuristic scoring
  pattern_regex TEXT,
  pattern_field TEXT, -- which field to apply regex on (e.g., 'decision_type', 'idv_status')
  
  -- Policy references
  policy_refs JSONB DEFAULT '[]'::jsonb,
  
  -- Rule conditions (JSONB for flexible matching)
  conditions JSONB DEFAULT '{}'::jsonb,
  
  -- Rule metadata
  priority INTEGER DEFAULT 100,
  enabled BOOLEAN DEFAULT true,
  
  CONSTRAINT unique_rule_name UNIQUE (rule_name)
);

-- Indexes for efficient querying
CREATE INDEX idx_policy_rules_tool_name ON policy_rules(tool_name) WHERE enabled = true;
CREATE INDEX idx_policy_rules_priority ON policy_rules(priority) WHERE enabled = true;
CREATE INDEX idx_policy_rules_enabled ON policy_rules(enabled);
CREATE INDEX idx_policy_rules_conditions ON policy_rules USING GIN (conditions);

-- Add comment for documentation
COMMENT ON TABLE policy_rules IS 'Stores policy rules for risk scoring and decision-making';
COMMENT ON COLUMN policy_rules.tool_name IS 'Tool name this rule applies to (e.g., benefit_approve, benefit_deny)';
COMMENT ON COLUMN policy_rules.risk_threshold IS 'Risk score threshold (0-100) that triggers this rule';
COMMENT ON COLUMN policy_rules.pattern_regex IS 'Optional regex pattern for heuristic matching';
COMMENT ON COLUMN policy_rules.policy_refs IS 'Array of policy reference codes (e.g., ["POLICY-001", "POLICY-002"])';
COMMENT ON COLUMN policy_rules.conditions IS 'JSON object with rule conditions for matching';
