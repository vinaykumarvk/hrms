import { useCallback, useEffect, useState } from "react";
import { HrmsClient } from "../api/hrmsClient";
import { OperationalState } from "../app/OperationalStates";
import { Inbox } from "./Inbox";
import { InboxViewState, loadInboxTasks } from "./inboxState";
import { TaskDetail } from "./TaskDetail";

export interface WorkflowWorkspaceProps {
  client: HrmsClient;
  /** Pre-resolved view state for tests/server rendering; the live fetch replaces it on mount. */
  initialState?: InboxViewState;
}

export function WorkflowWorkspace({ client, initialState }: WorkflowWorkspaceProps) {
  const [state, setState] = useState<InboxViewState>(initialState ?? { kind: "loading" });
  const [selectedTaskId, setSelectedTaskId] = useState<string | undefined>(undefined);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let mounted = true;
    setState({ kind: "loading" });
    void loadInboxTasks(client).then((next) => {
      if (mounted) {
        setState(next);
      }
    });
    return () => {
      mounted = false;
    };
  }, [client, refreshToken]);

  const refresh = useCallback(() => setRefreshToken((token) => token + 1), []);

  if (state.kind === "loading") {
    return <OperationalState kind="loading" title="Loading inbox" detail="Fetching the workflow task queue." />;
  }

  if (state.kind === "error") {
    return (
      <section className="workflow-panel" aria-label="Inbox load failure">
        <OperationalState
          kind="error"
          title="Could not load the inbox"
          detail={`The workflow task request failed with error code ${state.errorCode}.`}
        />
        <button onClick={refresh} type="button">
          Retry
        </button>
      </section>
    );
  }

  const selectedTask = state.tasks.find((task) => task.id === selectedTaskId) ?? state.tasks[0];

  return (
    <>
      <Inbox onSelectTask={setSelectedTaskId} selectedTaskId={selectedTask?.id} tasks={state.tasks} />
      {selectedTask ? <TaskDetail client={client} onActionComplete={refresh} task={selectedTask} /> : null}
    </>
  );
}
