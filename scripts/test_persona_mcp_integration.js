
const { createClient } = require('@supabase/supabase-js');

// Configuration
const SUPABASE_URL = 'https://mmhrjdehimyqyhiowqnh.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GATEWAY_URL = 'https://atlas-mcp-gateway-vercel.vercel.app';
const GATEWAY_KEY = 'ATLAS-GWAY-8f7a9d2c-secure';

if (!SUPABASE_KEY) {
    console.error("Missing SUPABASE_SERVICE_ROLE_KEY env var");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const PERSONAS = [
    { name: "Ella Gible", id: "BEN-ATLAS-001" },
    { name: "Alex Haitel", id: "BEN-ATLAS-002" },
    { name: "Noah Chance", id: "BEN-ATLAS-003" },
    { name: "Reid Peet Van der Loop", id: "BEN-ATLAS-004" }
];

function tryParse(text) {
    if (!text) return null;
    try {
        const match = text.match(/\{.*\}/s);
        if (match) return JSON.parse(match[0]);
        return JSON.parse(text);
    } catch (e) {
        return null;
    }
}

async function runTest() {
    console.log("====================================================");
    console.log(" PURE GROUNDING PERSONA INTEGRATION TEST ");
    console.log(" (No Simulated Dialogue - Only Database Data) ");
    console.log("====================================================\n");

    for (const persona of PERSONAS) {
        console.log(`\n>>> TESTING: ${persona.name} (${persona.id})`);

        // 1. Fetch grounded data ONLY
        const { data: storedPayload } = await supabase.rpc('get_claimant_intake_payload', {
            p_beneficiary_id: persona.id
        });

        if (!storedPayload) {
            console.error(`  - Failed to fetch grounded payload for ${persona.id}`);
            continue;
        }

        // 2. Build Payload - STRICTLY using stored data
        // We only add timing/ID bookkeeping, no content overrides
        const payload = {
            ...storedPayload,
            case_id: `PURE-VERIFY-${persona.id}-${Date.now()}`,
            timestamp_utc: new Date().toISOString()
        };

        console.log("--- MCP PAYLOAD (PURE GROUNDING) ---");
        console.log(JSON.stringify(payload, null, 2));
        console.log("------------------------------------");

        // 3. Call Live MCP Gateway
        try {
            const response = await fetch(`${GATEWAY_URL}/api/intake`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${GATEWAY_KEY}`
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                console.error(`  - Gateway Error: ${response.status}`);
            } else {
                const result = await response.json();
                const nested = tryParse(result.rationale);
                const finalScore = nested ? nested.risk_score : (result.risk_score || 0);

                console.log(`\n  - [RESULT] Decision: ${result.gateway_decision}`);
                console.log(`  - [RESULT] SLM Risk Score: ${finalScore}`);
                console.log(`  - [RESULT] SLM Rationale: ${nested ? nested.rationale : result.rationale}`);
            }
        } catch (err) {
            console.error(`  - Network Error: ${err.message}`);
        }
        console.log("\n====================================================");
    }
}

runTest().catch(console.error);
