import { FormEvent, useState } from "react";
import { DpcPanelMemberInput, HrmsApiError, HrmsClient, PromotionCaseView } from "../../api/hrmsClient";

/**
 * One DPC member row as captured in the UI. Each member's stance is recorded
 * individually: PARTICIPATE joins the quorum, RECUSE is sent to the API in
 * recusedEmployeeIds (DPC_RECUSAL). The API persists the recusal list plus a
 * panel-level verdict — an individual vote record is not a PH-08A..E route.
 */
export interface DpcMemberRow {
  employeeId: string;
  externalName: string;
  role: string;
  memberVerdict: "PARTICIPATE" | "RECUSE";
}

export type DpcSubmitPhase =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; promotionCase: PromotionCaseView }
  | { kind: "error"; errorCode: string; message: string };

/** BRD G06 §9.4 domain codes surfaced as readable messages, never raw stack traces. */
const G06_ERROR_MESSAGES: Record<string, string> = {
  QUORUM_NOT_MET: "The DPC quorum is not met: too few participating members after recusals (DPC_QUORUM).",
  PANEL_CONFLICT_OF_INTEREST: "A panel member is a candidate on this case and must be recused (DPC_RECUSAL / P02 SoD).",
  APAR_NOT_USABLE: "A supersession cites an APAR year that fails the usability gate.",
  SENIORITY_LIST_NOT_FINAL: "The seniority list backing this case is not finalised.",
  NOT_FOUND: "The promotion case could not be found.",
  FORBIDDEN: "Your session does not carry the g06.dpc.hold permission.",
};

function describeG06Error(errorCode: string): string {
  return G06_ERROR_MESSAGES[errorCode] ?? "The DPC could not be convened.";
}

const EMPTY_MEMBER: DpcMemberRow = { employeeId: "", externalName: "", role: "MEMBER", memberVerdict: "PARTICIPATE" };

export interface DpcConvenePanelProps {
  client: HrmsClient;
  /** Pre-filled case for the demo persona; the field stays editable. */
  defaultPromotionCaseId?: string;
  /** Pre-resolved phase for tests/server rendering (mirrors the workspace initialState pattern). */
  initialPhase?: DpcSubmitPhase;
}

/**
 * PH-08F G06 DPC screen: convene a panel against a promotion case and capture
 * each member's verdict individually (participate vs recuse), with the quorum
 * position visible before and after submission. Submits
 * POST /api/v1/promotions/cases/{id}:hold-dpc through the injected client.
 */
export function DpcConvenePanel({ client, defaultPromotionCaseId = "", initialPhase }: DpcConvenePanelProps) {
  const [promotionCaseId, setPromotionCaseId] = useState(defaultPromotionCaseId);
  const [quorumRequired, setQuorumRequired] = useState("2");
  const [members, setMembers] = useState<DpcMemberRow[]>([
    { ...EMPTY_MEMBER, role: "CHAIRPERSON" },
    { ...EMPTY_MEMBER },
  ]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [phase, setPhase] = useState<DpcSubmitPhase>(initialPhase ?? { kind: "idle" });

  function updateMember(index: number, patch: Partial<DpcMemberRow>): void {
    setMembers((current) => current.map((member, memberIndex) => (memberIndex === index ? { ...member, ...patch } : member)));
  }

  function addMemberRow(): void {
    setMembers((current) => [...current, { ...EMPTY_MEMBER }]);
  }

  const participatingCount = members.filter(
    (member) => member.memberVerdict === "PARTICIPATE" && (member.employeeId.trim() || member.externalName.trim())
  ).length;
  const quorum = Number.parseInt(quorumRequired, 10) || 0;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!promotionCaseId.trim()) {
      setValidationError("The promotion case id is required.");
      return;
    }
    const filledMembers = members.filter((member) => member.employeeId.trim() || member.externalName.trim());
    if (filledMembers.length === 0) {
      setValidationError("At least one panel member is required.");
      return;
    }
    if (filledMembers.some((member) => !member.role.trim())) {
      setValidationError("Every panel member needs a role.");
      return;
    }
    setValidationError(null);
    setPhase({ kind: "submitting" });
    const panelMembers: DpcPanelMemberInput[] = filledMembers.map((member) => ({
      employeeId: member.employeeId.trim() || undefined,
      externalName: member.externalName.trim() || undefined,
      role: member.role.trim(),
    }));
    const recusedEmployeeIds = filledMembers
      .filter((member) => member.memberVerdict === "RECUSE" && member.employeeId.trim())
      .map((member) => member.employeeId.trim());
    void client
      .holdDpc(
        promotionCaseId.trim(),
        { panelMembers, recusedEmployeeIds, quorumRequired: quorum > 0 ? quorum : undefined },
        crypto.randomUUID()
      )
      .then((result) => setPhase({ kind: "success", promotionCase: result.promotionCase }))
      .catch((error: unknown) => {
        const errorCode = error instanceof HrmsApiError ? error.displayCode : "UNKNOWN_ERROR";
        setPhase({ kind: "error", errorCode, message: describeG06Error(errorCode) });
      });
  }

  const submitting = phase.kind === "submitting";

  return (
    <section className="record-panel dpc-convene-panel" aria-label="G06 DPC convening and per-member verdict capture">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">G06 Promotion</p>
          <h2>Convene DPC</h2>
        </div>
      </div>
      <form aria-label="DPC convening form" onSubmit={handleSubmit}>
        <label htmlFor="dpc-case-id">Promotion case id</label>
        <input
          autoComplete="off"
          id="dpc-case-id"
          name="promotionCaseId"
          onChange={(event) => setPromotionCaseId(event.target.value)}
          type="text"
          value={promotionCaseId}
        />
        <label htmlFor="dpc-quorum">Quorum required</label>
        <input
          id="dpc-quorum"
          min={1}
          name="quorumRequired"
          onChange={(event) => setQuorumRequired(event.target.value)}
          type="number"
          value={quorumRequired}
        />
        <fieldset aria-label="DPC panel members with per-member verdicts">
          <legend>Panel members (each member&apos;s verdict is captured individually)</legend>
          {members.map((member, index) => (
            <div className="dpc-member-row" key={index}>
              <label htmlFor={`dpc-member-${index}-employee`}>Member {index + 1} employee id</label>
              <input
                autoComplete="off"
                id={`dpc-member-${index}-employee`}
                onChange={(event) => updateMember(index, { employeeId: event.target.value })}
                type="text"
                value={member.employeeId}
              />
              <label htmlFor={`dpc-member-${index}-external`}>Member {index + 1} external name</label>
              <input
                autoComplete="off"
                id={`dpc-member-${index}-external`}
                onChange={(event) => updateMember(index, { externalName: event.target.value })}
                type="text"
                value={member.externalName}
              />
              <label htmlFor={`dpc-member-${index}-role`}>Member {index + 1} role</label>
              <input
                autoComplete="off"
                id={`dpc-member-${index}-role`}
                onChange={(event) => updateMember(index, { role: event.target.value })}
                type="text"
                value={member.role}
              />
              <label htmlFor={`dpc-member-${index}-verdict`}>Member {index + 1} verdict</label>
              <select
                id={`dpc-member-${index}-verdict`}
                onChange={(event) => updateMember(index, { memberVerdict: event.target.value as DpcMemberRow["memberVerdict"] })}
                value={member.memberVerdict}
              >
                <option value="PARTICIPATE">Participate</option>
                <option value="RECUSE">Recuse (DPC_RECUSAL)</option>
              </select>
            </div>
          ))}
          <button onClick={addMemberRow} type="button">
            Add panel member
          </button>
        </fieldset>
        <p role="status">
          Quorum position: {participatingCount} participating member{participatingCount === 1 ? "" : "s"} of {quorum || "?"} required
          {quorum > 0 && participatingCount < quorum ? " — quorum NOT met yet" : quorum > 0 ? " — quorum met" : ""}.
        </p>
        <button disabled={submitting} type="submit">
          {submitting ? "Convening DPC…" : "Hold DPC"}
        </button>
      </form>
      {validationError ? <p role="alert">{validationError}</p> : null}
      {phase.kind === "error" ? (
        <p role="alert">
          DPC convening failed with error code {phase.errorCode}: {phase.message}
        </p>
      ) : null}
      {phase.kind === "success" ? (
        <section aria-label="Recorded DPC verdict">
          <p role="status">
            DPC held on case {phase.promotionCase.caseNo}: panel verdict {phase.promotionCase.dpc?.verdict ?? "FIT_PANEL"} with{" "}
            {phase.promotionCase.dpc?.participatingMembers ?? participatingCount} participating members (quorum{" "}
            {phase.promotionCase.dpc?.quorumRequired ?? quorum}); recused members: {phase.promotionCase.dpc?.recusedEmployeeIds.join(", ") || "none"}.
          </p>
          <table>
            <thead>
              <tr>
                <th scope="col">Candidate</th>
                <th scope="col">Rank</th>
                <th scope="col">Fitness</th>
                <th scope="col">Selected</th>
              </tr>
            </thead>
            <tbody>
              {phase.promotionCase.candidates.map((candidate) => (
                <tr key={candidate.employeeId}>
                  <td>{candidate.employeeId}</td>
                  <td>{candidate.rank}</td>
                  <td>{candidate.fitness}</td>
                  <td>{candidate.isSelected ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </section>
  );
}
