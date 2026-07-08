import { Navigate, useParams } from "react-router-dom";

/**
 * Bookmark-safety shim for the retired standalone deal page. `/app/deals/:id`
 * now redirects to the deals list with the detail dialog opened via `?deal=`,
 * so old deep links keep working without a dead route.
 */
export function DealDetailRedirect() {
  const { dealId } = useParams<{ dealId: string }>();
  return <Navigate to={dealId ? `/app/deals?deal=${dealId}` : "/app/deals"} replace />;
}
