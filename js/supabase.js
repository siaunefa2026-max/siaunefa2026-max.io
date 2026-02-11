const SB_URL = "https://lsrcjgwaaztpqubrusfa.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxzcmNqZ3dhYXp0cHF1YnJ1c2ZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3NjY2MzgsImV4cCI6MjA4NjM0MjYzOH0.1wQzD7Ki2qy5Rt9muLL7fev_o0VyI67QDdEhguNbEIk";
const _supabase = supabase.createClient(SB_URL, SB_KEY);

// Exportamos una función para obtener el cliente
function getClient() {
    return _supabase;

}
