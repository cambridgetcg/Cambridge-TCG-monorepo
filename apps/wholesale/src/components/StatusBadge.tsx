const colors: Record<string, string> = {
  submitted: "bg-blue-600",
  quoted: "bg-yellow-600",
  confirmed: "bg-orange-600",
  paid: "bg-green-600",
  ordered: "bg-purple-600",
  shipped: "bg-indigo-600",
  delivered: "bg-emerald-600",
  cancelled: "bg-red-600",
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium text-white ${colors[status] || "bg-gray-600"}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}
