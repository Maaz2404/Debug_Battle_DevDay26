interface LogoutButtonProps {
  onClick: () => void;
  loading?: boolean;
  className?: string;
}

export function LogoutButton({ onClick, loading = false, className }: LogoutButtonProps) {
  const label = loading ? "Logging out..." : "Logout";

  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      disabled={loading}
    >
      {label}
    </button>
  );
}
