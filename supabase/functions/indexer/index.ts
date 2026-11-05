import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Read server secret key from SUPABASE_SECRET_KEYS (JSON, key "default") or SUPABASE_SECRET_KEY
let secretKey = Deno.env.get("SUPABASE_SECRET_KEY") || "";
try {
  const secretKeysJson = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretKeysJson) {
    const parsed = JSON.parse(secretKeysJson);
    if (parsed.default) {
      secretKey = parsed.default;
    }
  }
} catch (_) {
  // Use raw SUPABASE_SECRET_KEY if JSON parsing fails
}

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";

serve(async (req: Request) => {
  // CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const supabase = createClient(supabaseUrl, secretKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: {
          apikey: secretKey,
        },
      },
    });

    // Check indexer cursor
    const { data: cursor, error: cursorError } = await supabase
      .from("indexer_cursors")
      .select("*")
      .eq("cursor_name", "sepolia_paidx")
      .maybeSingle();

    return new Response(
      JSON.stringify({
        status: "ok",
        cursor,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Edge function error";
    return new Response(JSON.stringify({ error: msg }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});

