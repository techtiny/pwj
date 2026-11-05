import { Check, X, Trash2 } from "lucide-react";

// The one look for approve / reject / delete across the app (same as Send for Payment):
//   Approve = dark-green circle + white tick,  Reject = dark-red circle + white cross,  Delete = bin.
// The words live in the tooltip / aria-label only. size: "sm" (dense rows) | "md" (default) | "lg" (dialog footers).
const SIZES = { sm: 15, md: 16, lg: 20 };

function ActionBtn({ kind, Icon, title, size = "md", className = "", ...rest }) {
  return (
    <button type="button" className={`appr-btn appr-btn--${kind} act-btn act-btn--${size} ${className}`.trim()}
      title={title} aria-label={title} {...rest}>
      <Icon size={SIZES[size] || 16} strokeWidth={kind === "delete" ? 2.1 : 2.75} />
    </button>
  );
}

export const ApproveBtn = ({ title = "Approve", ...p }) => <ActionBtn kind="ok" Icon={Check} title={title} {...p} />;
export const RejectBtn  = ({ title = "Reject",  ...p }) => <ActionBtn kind="no" Icon={X} title={title} {...p} />;
export const DeleteBtn  = ({ title = "Delete",  ...p }) => <ActionBtn kind="delete" Icon={Trash2} title={title} {...p} />;
