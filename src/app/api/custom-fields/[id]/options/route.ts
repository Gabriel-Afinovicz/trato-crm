import { NextResponse, type NextRequest } from "next/server";
import { getAuthSession } from "@/lib/supabase/cached-data";
import { createClient } from "@/lib/supabase/server";

// Adiciona uma nova opcao ao select de um custom field existente.
// Admin-only (operador comum so ve hint na UI). Idempotente: se a opcao
// ja existe (case-insensitive), retorna 200 sem duplicar.

interface PostPayload {
  option?: string;
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { user, profile, role } = await getAuthSession();
  if (!user || !profile) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  if (role !== "admin" && role !== "super_admin") {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { id } = await ctx.params;
  let body: PostPayload;
  try {
    body = (await req.json()) as PostPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const option = body.option?.trim();
  if (!option) {
    return NextResponse.json({ error: "option required" }, { status: 400 });
  }
  if (option.length > 80) {
    return NextResponse.json(
      { error: "option max length is 80" },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { data: fieldRow, error: readErr } = await supabase
    .from("custom_fields")
    .select("id, company_id, field_type, options")
    .eq("id", id)
    .maybeSingle();
  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }
  if (!fieldRow) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const field = fieldRow as {
    id: string;
    company_id: string;
    field_type: string;
    options: unknown;
  };
  if (role !== "super_admin" && profile.company_id !== field.company_id) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  if (field.field_type !== "select" && field.field_type !== "multi_select") {
    return NextResponse.json(
      { error: "field is not a select" },
      { status: 400 }
    );
  }

  const current: string[] = Array.isArray(field.options)
    ? (field.options as string[]).filter((s) => typeof s === "string")
    : [];
  // Idempotencia case-insensitive.
  const exists = current.some(
    (o) => o.toLowerCase() === option.toLowerCase()
  );
  if (exists) {
    return NextResponse.json({ options: current, added: false });
  }
  const next = [...current, option];

  const { error: updateErr } = await supabase
    .from("custom_fields")
    .update({ options: next })
    .eq("id", id);
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }
  return NextResponse.json({ options: next, added: true });
}
