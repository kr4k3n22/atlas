const { createClient } = require('@supabase/supabase-js');

async function run() {
    const url = 'https://mmhrjdehimyqyhiowqnh.supabase.co';
    const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1taHJqZGVoaW15cXloaW93cW5oIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDA2NDA1MSwiZXhwIjoyMDg1NjQwMDUxfQ.r3RHBNSkUqXnB4_VIw-IngDcEZOawYVb7f46YjW8BmE';
    const supabase = createClient(url, key);

    const personas = [
        { id: 'BEN-ATLAS-001', name: 'Ella Gible' },
        { id: 'BEN-ATLAS-002', name: 'Alex Haitel' },
        { id: 'BEN-ATLAS-003', name: 'Noah Chance' },
        { id: 'BEN-ATLAS-004', name: 'Reid Peet Van der Loop' }
    ];

    console.log('--- Persona Grounding Verification ---');
    for (const p of personas) {
        // rpc for returns table gives an array
        const { data, error } = await supabase.rpc('get_claimant_profile_summary', { p_beneficiary_id: p.id });
        if (error) {
            console.log(`[FAILED]  ${p.id}: ${error.message}`);
        } else if (data && data.length > 0) {
            const row = data[0];
            const match = row.claimant_name.toLowerCase() === p.name.toLowerCase() ? 'MATCH' : 'MISMATCH';
            console.log(`[SUCCESS] ${p.id}: Found "${row.claimant_name}" (${match})`);
        } else {
            console.log(`[MISSING] ${p.id}: No data returned`);
        }
    }

    console.log('\n--- User Metadata Check ---');
    const { data: { users }, error: authError } = await supabase.auth.admin.listUsers();
    if (authError) {
        console.log('Auth Error:', authError.message);
    } else {
        personas.forEach(p => {
            const user = users.find(u => u.user_metadata?.beneficiary_id === p.id);
            if (user) {
                console.log(`[MAPPED]  ${p.id} -> ${user.email}`);
            } else {
                console.log(`[UNMAPPED] ${p.id}: No user found with this beneficiary_id`);
            }
        });
    }
}

run();
