'use client';

export default function Brand() {
  return (
    <a href="/dashboard" className="flex items-center gap-2 pr-4">
      <img
        src="/Images/follies-logo.jpg"
        alt="Follies"
        width={24}
        height={24}
        className="h-6 w-6 rounded-sm"
      />
      <span className="font-semibold text-white hover:text-red-400">
        Follies Portal
      </span>
    </a>
  );
}
