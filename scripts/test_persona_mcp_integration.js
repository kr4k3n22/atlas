
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
    {
        name: "Alex Haitel",
        id: "BEN-ATLAS-002",
        msg: "I need an urgent payment extension. I am facing severe hardship.",
        tool: "request_payment_extension",
        decision: "approve"
    },
    {
        name: "Noah Chance",
        id: "BEN-ATLAS-003",
        msg: "I want to apply for a second claim using my neighbor's identity.",
        tool: "modify_welfare_record",
        decision: "approve"
    }
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
    console.log(" ATLAS EXHAUSTIVE PAYLOAD VERIFICATION ");
    console.log("====================================================\n");

    for (const persona of PERSONAS) {
        console.log(`[TEST] Persona: ${persona.name} (${persona.id})`);

        // 1. Fetch grounded data
        const { data: storedPayload } = await supabase.rpc('get_claimant_intake_payload', {
            p_beneficiary_id: persona.id
        });

        if (!storedPayload) {
            console.error(`  - Failed to fetch payload`);
            continue;
        }

        // 2. Build EXHAUSTIVE Payload (Mirroring new src/lib/intakePayloadBuilder.ts logic)
        const payload = {
            ...storedPayload,
            case_id: `EXHAUSTIVE-TEST-${persona.id}-${Date.now()}`,
            timestamp_utc: new Date().toISOString(),
            decision_context: {
                ...(storedPayload.decision_context || {}),
                decision_type: persona.decision,
                channel: "assisted"
            },
            structured_inputs: {
                ...(storedPayload.structured_inputs || {}),
                // Simulate live overrides
                idv_status: "verified",
                residency_status: "verified"
            },
            free_text: {
                ...(storedPayload.free_text || {}),
                claimant_message: persona.msg,
                agent_chat_transcript_excerpt: `[user]: ${persona.msg}\n[assistant]: I understand you are facing hardship. I am checking your records.`,
                caseworker_note: "EXHAUSTIVE GROUNDING VERIFICATION"
            }
        };

        console.log(`  - Payload Keys: ${Object.keys(payload).join(", ")}`);
        console.log(`  - Structured Input Keys: ${Object.keys(payload.structured_inputs).join(", ")}`);

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

                console.log(`  - [GATEWAY] Decision: ${result.gateway_decision} | Score: ${finalScore}`);
                console.log(`  - [RATIONALE] ${nested ? nested.rationale : result.rationale}`);
            }
        } catch (err) {
            console.error(`  - Network Error: ${err.message}`);
        }
        console.log("----------------------------------------------------\n");
    }
}

runTest().catch(console.error);
