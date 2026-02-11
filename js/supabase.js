const SB_URL = "https://lsrcjgwaaztpqubrusfa.supabase.co";
const SB_KEY = "XGQ1Xg7sO52uOfmo";
const _supabase = supabase.createClient(SB_URL, SB_KEY);

// Exportamos una función para obtener el cliente
function getClient() {
    return _supabase;
}