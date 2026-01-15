import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Não autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create client with user's token to verify identity
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify caller's identity
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseUser.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: "Token inválido" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const callerId = claimsData.claims.sub;

    // Create admin client for privileged operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Check if caller is a developer
    const { data: isDeveloper, error: roleError } = await supabaseAdmin.rpc("is_developer");
    
    // Also verify directly from user_roles table
    const { data: callerRoles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);

    const hasDeveloperRole = callerRoles?.some((r) => r.role === "developer");

    if (roleError || (!isDeveloper && !hasDeveloperRole)) {
      return new Response(
        JSON.stringify({ error: "Acesso negado. Apenas desenvolvedores podem excluir usuários." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get the user to delete from request body
    const { userId } = await req.json();

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "ID do usuário é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Prevent self-deletion
    if (userId === callerId) {
      return new Response(
        JSON.stringify({ error: "Você não pode excluir sua própria conta" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify target user exists
    const { data: targetUser, error: targetError } = await supabaseAdmin
      .from("profiles")
      .select("id, nome, email")
      .eq("id", userId)
      .single();

    if (targetError || !targetUser) {
      return new Response(
        JSON.stringify({ error: "Usuário não encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Developer ${callerId} is deleting user ${userId} (${targetUser.email})`);

    // Delete data in cascade order (respecting foreign keys)
    const deletionResults: Record<string, number> = {};

    // 1. Delete AI usage logs
    const { data: aiLogs } = await supabaseAdmin
      .from("ai_usage_logs")
      .delete()
      .eq("user_id", userId)
      .select();
    deletionResults.ai_usage_logs = aiLogs?.length || 0;

    // 2. Delete import jobs
    const { data: importJobs } = await supabaseAdmin
      .from("import_jobs")
      .delete()
      .eq("user_id", userId)
      .select();
    deletionResults.import_jobs = importJobs?.length || 0;

    // 3. Delete financeiro (depends on laudos, delete first)
    const { data: financeiro } = await supabaseAdmin
      .from("financeiro")
      .delete()
      .eq("user_id", userId)
      .select();
    deletionResults.financeiro = financeiro?.length || 0;

    // 4. Delete impugnacoes (depends on laudos, delete first)
    const { data: impugnacoes } = await supabaseAdmin
      .from("impugnacoes")
      .delete()
      .eq("user_id", userId)
      .select();
    deletionResults.impugnacoes = impugnacoes?.length || 0;

    // 5. Delete laudos
    const { data: laudos } = await supabaseAdmin
      .from("laudos")
      .delete()
      .eq("user_id", userId)
      .select();
    deletionResults.laudos = laudos?.length || 0;

    // 6. Delete user_settings
    const { data: settings } = await supabaseAdmin
      .from("user_settings")
      .delete()
      .eq("user_id", userId)
      .select();
    deletionResults.user_settings = settings?.length || 0;

    // 8. Delete user_roles
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", userId)
      .select();
    deletionResults.user_roles = roles?.length || 0;

    // 9. Delete profile
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .delete()
      .eq("id", userId);

    if (profileError) {
      console.error("Error deleting profile:", profileError);
      throw new Error(`Falha ao excluir perfil: ${profileError.message}`);
    }
    deletionResults.profiles = 1;

    // 10. Delete storage files (best effort, don't fail on error)
    try {
      // List and delete avatar files
      const { data: avatarFiles } = await supabaseAdmin.storage
        .from("avatars")
        .list(userId);
      if (avatarFiles && avatarFiles.length > 0) {
        await supabaseAdmin.storage
          .from("avatars")
          .remove(avatarFiles.map((f) => `${userId}/${f.name}`));
        deletionResults.avatar_files = avatarFiles.length;
      }

      // List and delete logo files
      const { data: logoFiles } = await supabaseAdmin.storage
        .from("perito-logos")
        .list(userId);
      if (logoFiles && logoFiles.length > 0) {
        await supabaseAdmin.storage
          .from("perito-logos")
          .remove(logoFiles.map((f) => `${userId}/${f.name}`));
        deletionResults.logo_files = logoFiles.length;
      }

      // List and delete PDF files
      const { data: pdfFiles } = await supabaseAdmin.storage
        .from("processos-pdf")
        .list(userId);
      if (pdfFiles && pdfFiles.length > 0) {
        await supabaseAdmin.storage
          .from("processos-pdf")
          .remove(pdfFiles.map((f) => `${userId}/${f.name}`));
        deletionResults.pdf_files = pdfFiles.length;
      }
    } catch (storageError) {
      console.error("Error deleting storage files (non-fatal):", storageError);
    }

    // 11. Delete from auth.users (requires admin API)
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    
    if (authError) {
      console.error("Error deleting auth user:", authError);
      // Don't fail - data is already deleted, auth record may already be gone
    } else {
      deletionResults.auth_user = 1;
    }

    console.log(`User ${userId} deleted successfully. Results:`, deletionResults);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Usuário ${targetUser.nome} excluído com sucesso`,
        deletedUser: {
          id: userId,
          nome: targetUser.nome,
          email: targetUser.email,
        },
        deletionDetails: deletionResults,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in delete-user function:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Erro interno ao excluir usuário" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
