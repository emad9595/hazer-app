import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const {
      fullName,
      email,
      password,
      hourlyWage,
      position,
      department,
      nationalCode,
      employeeCode,
      startDate,
      salaryType,
      monthlySalary,
    } = await request.json();

    if (!fullName || !email || !password) {
      return NextResponse.json(
        { error: "همه فیلدهای ضروری را پر کنید" },
        { status: 400 }
      );
    }

    // Identify the calling employer using their own session (RLS-scoped client)
    const supabase = createServerClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      return NextResponse.json({ error: "ابتدا وارد شوید" }, { status: 401 });
    }

    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("role, organization_id")
      .eq("id", userData.user.id)
      .single();

    if (
      !callerProfile ||
      callerProfile.role !== "employer" ||
      !callerProfile.organization_id
    ) {
      return NextResponse.json({ error: "دسترسی مجاز نیست" }, { status: 403 });
    }

    // From here on, use the privileged admin client to create the
    // new employee's login and profile.
    const admin = createAdminClient();

    const { data: newUser, error: createError } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (createError || !newUser.user) {
      return NextResponse.json(
        { error: createError?.message ?? "خطا در ایجاد حساب کارمند" },
        { status: 400 }
      );
    }

    const { error: profileError } = await admin.from("profiles").insert({
      id: newUser.user.id,
      organization_id: callerProfile.organization_id,
      role: "employee",
      full_name: fullName,
      hourly_wage: hourlyWage || null,
      position: position || null,
      department: department || null,
      national_code: nationalCode || null,
      employee_code: employeeCode || null,
      start_date: startDate || null,
      salary_type: salaryType || "hourly",
      monthly_salary: monthlySalary || null,
    });

    if (profileError) {
      // Roll back the auth user if the profile insert failed, to avoid
      // orphaned accounts.
      await admin.auth.admin.deleteUser(newUser.user.id);
      return NextResponse.json({ error: profileError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "خطای داخلی سرور";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { employeeId, hourlyWage, isActive } = await request.json();
    if (!employeeId) {
      return NextResponse.json({ error: "شناسه کارمند ارسال نشده" }, { status: 400 });
    }

    const supabase = createServerClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      return NextResponse.json({ error: "ابتدا وارد شوید" }, { status: 401 });
    }

    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("role, organization_id")
      .eq("id", userData.user.id)
      .single();

    if (!callerProfile || callerProfile.role !== "employer") {
      return NextResponse.json({ error: "دسترسی مجاز نیست" }, { status: 403 });
    }

    const admin = createAdminClient();

    // Confirm the target employee actually belongs to this employer's org
    // before allowing any change to their profile.
    const { data: target } = await admin
      .from("profiles")
      .select("organization_id")
      .eq("id", employeeId)
      .single();

    if (!target || target.organization_id !== callerProfile.organization_id) {
      return NextResponse.json({ error: "دسترسی مجاز نیست" }, { status: 403 });
    }

    const updates: Record<string, unknown> = {};
    if (hourlyWage !== undefined) updates.hourly_wage = hourlyWage;
    if (isActive !== undefined) updates.is_active = isActive;

    const { error } = await admin
      .from("profiles")
      .update(updates)
      .eq("id", employeeId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "خطای داخلی سرور";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
