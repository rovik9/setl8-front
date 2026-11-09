import { useAuth } from "../auth/context";
import { useResource } from "../hooks/resource";
import { api } from "../api/client";
import {
  Badge,
  Empty,
  ErrorState,
  JsonDetails,
  Skeleton,
} from "../components/ui";
export default function Admin() {
  const auth = useAuth();
  const data = useResource(
    "admin-status:" + auth.epoch,
    (signal) => api.get("/v1/status", signal),
    !!auth.session?.admin_read,
    30000,
  );
  const runs = useResource(
    "admin-runs:" + auth.epoch,
    (signal) => api.get("/v1/admin/recorder-runs", signal),
    !!auth.session?.admin_read,
    30000,
  );
  return (
    <main id="main-content" className="dashboard">
      <div className="page-title">
        <div>
          <Badge tone="blue">Server-authorized admin read</Badge>
          <h1>
            Operations<span>.</span>
          </h1>
          <p>Read-only service evidence. No lifecycle or trading authority.</p>
        </div>
      </div>
      {!auth.session?.admin_read ? (
        <Empty title="Admin read access required">
          This wallet has no server-granted admin read role.
        </Empty>
      ) : (
        <>
          {data.loading ? (
            <Skeleton />
          ) : data.error ? (
            <ErrorState message={data.error} retry={data.refresh} />
          ) : (
            <JsonDetails
              title="Compatibility and service status"
              value={data.data}
            />
          )}
          {runs.error ? (
            <ErrorState message={runs.error} retry={runs.refresh} />
          ) : (
            <JsonDetails
              title="Recorder runs — bounded first page"
              value={runs.data}
            />
          )}
        </>
      )}
    </main>
  );
}
