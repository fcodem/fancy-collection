import { redirect } from "next/navigation";
import LoginForm from "@/components/LoginForm";

export const dynamic = "force-dynamic";

function errorMessage(code?: string) {
  if (code === "invalid") return "Invalid username or password.";
  if (code === "missing") return "Username and password are required.";
  if (code === "blocked") return "Too many failed login attempts. Please try again in about 1 hour.";
  return undefined;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ username?: string; password?: string; error?: string }>;
}) {
  const params = await searchParams;

  if (params.username || params.password) {
    const q = params.error ? `?error=${encodeURIComponent(params.error)}` : "";
    redirect(`/login${q}`);
  }

  return <LoginForm initialError={errorMessage(params.error)} />;
}
