import { Mail } from "lucide-react";

export const metadata = { title: "Check Your Email" };

export default function CheckEmailPage() {
  return (
    <div className="w-full max-w-sm text-center">
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-8">
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-blue-500/10 mx-auto mb-4">
          <Mail className="w-6 h-6 text-blue-400" />
        </div>
        <h1 className="text-lg font-semibold text-white mb-2">Check your email</h1>
        <p className="text-sm text-neutral-400">
          A sign-in link has been sent to your email address.
          Click the link to access the admin dashboard.
        </p>
        <p className="text-xs text-neutral-600 mt-4">
          The link expires in 24 hours.
        </p>
      </div>
    </div>
  );
}
