import type { LoaderFunctionArgs } from "@vercel/remix";
import { json } from "@vercel/remix";
import db from "../db.server";
import crypto from "crypto";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const action = url.searchParams.get("action");
  
  try {
    if (action === "create") {
      // Try to create a test session
      const testSession = await db.session.create({
        data: {
          id: `test_session_${Date.now()}`,
          shop: "test-shop.myshopify.com",
          state: "test_state",
          isOnline: false,
          accessToken: `test_token_${crypto.randomBytes(16).toString("hex")}`,
          scope: "read_products",
          expires: new Date(Date.now() + 86400000), // 24 hours
        },
      });
      
      return json({
        success: true,
        message: "Session created successfully",
        session: testSession,
      });
    } else if (action === "list") {
      // List all sessions
      const sessions = await db.session.findMany({
        select: {
          id: true,
          shop: true,
          isOnline: true,
          expires: true,
          createdAt: false, // Session model doesn't have createdAt
        },
      });
      
      return json({
        success: true,
        count: sessions.length,
        sessions,
      });
    } else if (action === "clean") {
      // Delete test sessions
      const deleted = await db.session.deleteMany({
        where: {
          id: {
            startsWith: "test_",
          },
        },
      });
      
      return json({
        success: true,
        message: `Deleted ${deleted.count} test sessions`,
      });
    } else {
      // Check database connection
      const result = await db.$queryRaw`SELECT 1+1 as result`;
      
      return json({
        success: true,
        message: "Database connection successful",
        dbTest: result,
        availableActions: ["create", "list", "clean"],
      });
    }
  } catch (error: any) {
    console.error("Session test error:", error);
    
    return json({
      success: false,
      error: error.message,
      code: error.code,
      meta: error.meta,
      hint: getErrorHint(error.code),
    }, { status: 500 });
  }
};

function getErrorHint(code: string) {
  switch (code) {
    case "P2002":
      return "Session ID already exists (unique constraint violation)";
    case "P2003":
      return "Foreign key constraint failed";
    case "P2025":
      return "Record not found";
    case "P1001":
      return "Can't reach database server - check DATABASE_URL";
    case "P1002":
      return "Database server reached but timed out";
    case "P1003":
      return "Database does not exist";
    default:
      return "Unknown database error";
  }
}