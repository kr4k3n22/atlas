import { checkAndExpireStaleCases, getCasesApproachingSLA } from "@/lib/slaChecker";

export async function POST() {
  try {
    const result = await checkAndExpireStaleCases();
    const approaching = await getCasesApproachingSLA();

    return Response.json({
      success: true,
      expired_count: result.expired,
      expired_cases: result.cases,
      approaching_count: approaching.length,
      approaching_cases: approaching,
    });
  } catch (error) {
    console.error("Error checking SLA:", error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const approaching = await getCasesApproachingSLA();

    return Response.json({
      success: true,
      approaching_count: approaching.length,
      approaching_cases: approaching,
    });
  } catch (error) {
    console.error("Error checking approaching SLA:", error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
