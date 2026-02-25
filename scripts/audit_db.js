const { createClient } = require('@supabase/supabase-js');

async function run() {
    const url = 'https://mmhrjdehimyqyhiowqnh.supabase.co';
    const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1taHJqZGVoaW15cXloaW93cW5oIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDA2NDA1MSwiZXhwIjoyMDg1NjQwMDUxfQ.r3RHBNSkUqXnB4_VIw-IngDcEZOawYVb7f46YjW8BmE';
    const supabase = createClient(url, key);

    const appSupabase = supabase.schema ? supabase.schema('app') : createClient(url, key, { db: { schema: 'app' } });

    console.log('--- app.claimant_case ---');
    const { data: cases, error: caseError } = await appSupabase.from('claimant_case').select('beneficiary_id, claimant_name');
    if (caseError) console.error(caseError);
    else console.log(JSON.stringify(cases, null, 2));

    console.log('\n--- auth.users ---');
    const { data: { users }, error: userError } = await supabase.auth.admin.listUsers();
    if (userError) console.error(userError);
    else console.log(users.map(u => u.email));
}

run();
