module.exports = [
"[externals]/next/dist/compiled/next-server/app-route-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-route-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/@opentelemetry/api [external] (next/dist/compiled/@opentelemetry/api, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/@opentelemetry/api", () => require("next/dist/compiled/@opentelemetry/api"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-page-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-unit-async-storage.external.js [external] (next/dist/server/app-render/work-unit-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-unit-async-storage.external.js", () => require("next/dist/server/app-render/work-unit-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-async-storage.external.js [external] (next/dist/server/app-render/work-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-async-storage.external.js", () => require("next/dist/server/app-render/work-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/shared/lib/no-fallback-error.external.js [external] (next/dist/shared/lib/no-fallback-error.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/shared/lib/no-fallback-error.external.js", () => require("next/dist/shared/lib/no-fallback-error.external.js"));

module.exports = mod;
}),
"[project]/src/data/mock_cases.json (json)", ((__turbopack_context__) => {

__turbopack_context__.v([{"id":"CASE-1001","created_at":"2026-01-31T10:15:00Z","status":"PENDING_REVIEW","user_display":"Alex","user_message":"Why is my payment stopped?","tool_name":"Access_Alex_Welfare_Records","tool_args_redacted":{"record_id":"***","fields":["payment_status","last_action"]},"risk_label":"ESCALATE","risk_score":78,"risk_rationale":"Material impact and sensitive records access. Requires human approval.","policy_refs":["NIST-RMF-MEASURE-PII","POLICY-WELFARE-001"],"history":[{"ts":"2026-01-31T10:15:00Z","actor":"proxy","event":"created","detail":"Tool call intercepted."},{"ts":"2026-01-31T10:15:02Z","actor":"risk_slm","event":"scored","detail":"ESCALATE (78)."}]},{"id":"CASE-1002","created_at":"2026-01-31T09:40:00Z","status":"APPROVED","user_display":"Jordan","user_message":"Can you update my address on file?","tool_name":"Update_Address","tool_args_redacted":{"user_id":"***","new_address":"***"},"risk_label":"ESCALATE","risk_score":66,"risk_rationale":"Identity and record mutation. Human approval required.","policy_refs":["POLICY-IDENTITY-002"],"history":[{"ts":"2026-01-31T09:40:00Z","actor":"proxy","event":"created","detail":"Tool call intercepted."},{"ts":"2026-01-31T09:40:02Z","actor":"risk_slm","event":"scored","detail":"ESCALATE (66)."},{"ts":"2026-01-31T09:44:10Z","actor":"sarah","event":"decided","detail":"APPROVED. Verified caller via existing KBA."}]},{"id":"CASE-1003","created_at":"2026-01-31T08:05:00Z","status":"REJECTED","user_display":"Morgan","user_message":"Cancel my benefits for my spouse immediately.","tool_name":"Terminate_Dependent_Benefits","tool_args_redacted":{"dependent_id":"***"},"risk_label":"BLOCK","risk_score":92,"risk_rationale":"High-impact termination request with insufficient verification. Block by default.","policy_refs":["POLICY-HIGH-IMPACT-003"],"history":[{"ts":"2026-01-31T08:05:00Z","actor":"proxy","event":"created","detail":"Tool call intercepted."},{"ts":"2026-01-31T08:05:02Z","actor":"risk_slm","event":"scored","detail":"BLOCK (92)."},{"ts":"2026-01-31T08:10:00Z","actor":"sarah","event":"decided","detail":"REJECTED. Require verified identity + signed form."}]}]);}),
"[project]/src/lib/caseStore.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "decideCase",
    ()=>decideCase,
    "getCaseById",
    ()=>getCaseById,
    "listCases",
    ()=>listCases
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$data$2f$mock_cases$2e$json__$28$json$29$__ = __turbopack_context__.i("[project]/src/data/mock_cases.json (json)");
;
const store = new Map();
function initOnce() {
    if (store.size > 0) return;
    const seed = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$data$2f$mock_cases$2e$json__$28$json$29$__["default"];
    for (const c of seed)store.set(c.id, c);
}
function nowIso() {
    return new Date().toISOString();
}
function listCases() {
    initOnce();
    return Array.from(store.values());
}
function getCaseById(id) {
    initOnce();
    return store.get(id) ?? null;
}
function decideCase(id, decision, note) {
    initOnce();
    const c = store.get(id);
    if (!c) return null;
    let nextStatus = c.status;
    if (decision === "APPROVE") nextStatus = "APPROVED";
    if (decision === "REJECT") nextStatus = "REJECTED";
    if (decision === "REQUEST_INFO") nextStatus = "NEEDS_INFO";
    const audit = {
        ts: nowIso(),
        actor: "hitl_ui",
        action: decision.toLowerCase(),
        detail: note?.trim() ? note.trim() : undefined
    };
    const updated = {
        ...c,
        status: nextStatus,
        audit_trail: [
            ...c.audit_trail ?? [],
            audit
        ]
    };
    store.set(id, updated);
    return updated;
}
}),
"[project]/src/app/api/cases/[id]/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "GET",
    ()=>GET
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$caseStore$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/caseStore.ts [app-route] (ecmascript)");
;
async function GET(_request, context) {
    const { id } = await context.params;
    const c = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$caseStore$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getCaseById"])(id);
    if (!c) return new Response("Not found", {
        status: 404
    });
    return Response.json(c);
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__75516310._.js.map