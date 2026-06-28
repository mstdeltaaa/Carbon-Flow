import { Inbox, Loader2 } from "lucide-react";

type TableStateRowProps = {
  colSpan: number;
  description?: string;
  isLoading?: boolean;
  title: string;
};

export function TableStateRow({
  colSpan,
  description,
  isLoading = false,
  title
}: TableStateRowProps) {
  const Icon = isLoading ? Loader2 : Inbox;

  return (
    <tr>
      <td className="py-10 text-center" colSpan={colSpan}>
        <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface-soft)] text-[var(--primary)]">
          <Icon
            className={["h-4 w-4", isLoading ? "animate-spin" : ""].join(" ")}
            aria-hidden="true"
          />
        </span>
        <p className="mt-3 text-sm font-medium text-[var(--foreground)]">
          {title}
        </p>
        {description ? (
          <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-[var(--muted-foreground)]">
            {description}
          </p>
        ) : null}
      </td>
    </tr>
  );
}
