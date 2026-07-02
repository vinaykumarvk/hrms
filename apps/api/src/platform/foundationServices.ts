import { JobService } from "../jobs/jobService";
import { MigrationStagingService } from "../migration/staging/migrationStagingService";
import { EmployeeMasterService } from "../modules/g01/employeeMasterService";
import { InMemoryEmployeeProfileRepository } from "../modules/g01/employeeProfileRepository";
import { PersonalDetailsService } from "../modules/g02/personalDetailsService";
import { InMemoryPersonalDetailsRepository, defaultG02WorkflowConfig } from "../modules/g02/personalDetailsRepository";
import { LeaveService } from "../modules/g03/leaveService";
import { InMemoryLeaveRepository } from "../modules/g03/leaveRepository";
import { AttendanceOpsService } from "../modules/g03/attendanceOpsService";
import { InMemoryAttendanceOpsRepository } from "../modules/g03/attendanceOpsRepository";
import { LeaveSrRelayService } from "../modules/g04/leaveSrRelayService";
import { InMemoryLeaveSrRelayRepository } from "../modules/g04/leaveSrRelayRepository";
import { TransferService } from "../modules/g05/transferService";
import { InMemoryTransferRepository } from "../modules/g05/transferRepository";
import { PromotionService } from "../modules/g06/promotionService";
import { InMemoryEstablishmentQslRepository } from "../modules/g06/establishmentQslRepository";
import { InMemoryPromotionDepthRepository } from "../modules/g06/promotionDepthRepository";
import { TrainingService } from "../modules/g07/trainingService";
import { InMemoryTrainingDepthRepository } from "../modules/g07/trainingDepthRepository";
import { AparService } from "../modules/g08/aparService";
import { InMemoryAparDepthRepository } from "../modules/g08/aparDepthRepository";
import { DisciplinaryService } from "../modules/g09/disciplinaryService";
import { G09DueProcessRepository, InMemoryG09DueProcessRepository, defaultG09CompetenceMatrix } from "../modules/g09/dueProcessRepository";
import { PayrollService } from "../modules/g10/payrollService";
import { PayrollEngineService } from "../modules/g10/payrollEngineService";
import { InMemoryPayrollEngineRepository } from "../modules/g10/payrollEngineRepository";
import { PayRuleService } from "../modules/g10/payRuleService";
import { InMemoryPayRuleRepository } from "../modules/g10/payRuleRepository";
import { CompensationIntegrationService } from "../modules/g10/compensationIntegrationService";
import { InMemoryCompensationIntegrationRepository } from "../modules/g10/compensationIntegrationRepository";
import { TaxEngineService } from "../modules/g10/taxEngineService";
import { InMemoryTaxEngineRepository } from "../modules/g10/taxEngineRepository";
import { PensionService } from "../modules/g11/pensionService";
import { PensionDisbursementService } from "../modules/g11/pensionDisbursementService";
import { InMemoryPensionDisbursementRepository } from "../modules/g11/pensionDisbursementRepository";
import { PensionRuleService } from "../modules/g11/pensionRuleService";
import { InMemoryPensionRuleRepository } from "../modules/g11/pensionRuleRepository";
import { PensionBenefitService } from "../modules/g11/pensionBenefitService";
import { InMemoryPensionBenefitRepository } from "../modules/g11/pensionBenefitRepository";
import { PensionerLifecycleService } from "../modules/g11/pensionerLifecycleService";
import { InMemoryPensionerLifecycleRepository } from "../modules/g11/pensionerLifecycleRepository";
import { PensionRevisionService } from "../modules/g11/pensionRevisionService";
import { InMemoryPensionRevisionRepository } from "../modules/g11/pensionRevisionRepository";
import { ServiceRegisterService } from "../modules/g12/serviceRegisterService";
import { SrIntegrityService, TimestampAuthority } from "../modules/g12/srIntegrityService";
import { InMemorySrIntegrityRepository } from "../modules/g12/srIntegrityRepository";
import { DocumentVaultService, ScanProvider, StubScanProvider } from "../modules/g13/documentVaultService";
import { InMemoryDocumentSecurityRepository } from "../modules/g13/documentSecurityRepository";
import { AnalyticsService } from "../modules/g14/analyticsService";
import { AnalyticsEngineService } from "../modules/g14/analyticsEngineService";
import { InMemoryAnalyticsEngineRepository } from "../modules/g14/analyticsEngineRepository";
import { NotificationService } from "../notifications/notificationService";
import { ph03AuthorityFacts, ph03Documents, ph03Employees, ph03Ids, ph03LeaveTypes } from "../seed/ph03Seed";
import { AuditService } from "./audit/auditService";
import { AuthorityResolutionService } from "./authority-resolution/authorityResolutionService";
import { AuthorizationService } from "./authorization/authorizationService";
import { HrmsWorkflowService } from "./workflow/hrmsWorkflowService";

export interface FoundationServices {
  audit: AuditService;
  authorization: AuthorizationService;
  authorityResolution: AuthorityResolutionService;
  employeeMaster: EmployeeMasterService;
  personalDetails: PersonalDetailsService;
  leave: LeaveService;
  attendanceOps: AttendanceOpsService;
  leaveSrRelay: LeaveSrRelayService;
  transfer: TransferService;
  promotion: PromotionService;
  training: TrainingService;
  apar: AparService;
  disciplinary: DisciplinaryService;
  payroll: PayrollService;
  payrollEngine: PayrollEngineService;
  payRules: PayRuleService;
  compensationIntegration: CompensationIntegrationService;
  taxEngine: TaxEngineService;
  pension: PensionService;
  pensionDisbursement: PensionDisbursementService;
  pensionRules: PensionRuleService;
  pensionBenefits: PensionBenefitService;
  pensionerLifecycle: PensionerLifecycleService;
  pensionRevisions: PensionRevisionService;
  serviceRegister: ServiceRegisterService;
  srIntegrity: SrIntegrityService;
  documentVault: DocumentVaultService;
  analytics: AnalyticsService;
  analyticsEngine: AnalyticsEngineService;
  workflow: HrmsWorkflowService;
  jobs: JobService;
  notifications: NotificationService;
  migrationStaging: MigrationStagingService;
}

export interface FoundationServicesOptions {
  /** G04 relay HMAC key override (config injection for tests); production must set G04_RELAY_HMAC_KEY. */
  g04RelayHmacKey?: string;
  /** PH-08E: G09 due-process repository override (e.g. the file-backed impl for DI-21 tamper checks). */
  g09DueProcessRepository?: G09DueProcessRepository;
  /** PH-10B: RFC 3161 TSA override for G12 anchoring/attestation (a fake in tests; a licensed-CA client in production). */
  g12TimestampAuthority?: TimestampAuthority;
  /** PH-10C: DI-11 malware-scan seam override for the G13 vault (a deterministic fake in tests; a real engine in production). */
  g13ScanProvider?: ScanProvider;
}

/**
 * Resolve the G04 relay HMAC key: explicit override, then the G04_RELAY_HMAC_KEY
 * environment variable. Outside production a deterministic test-only value is injected
 * so suites can run without environment setup; production refuses to start without the env key.
 */
function resolveG04RelayHmacKey(options: FoundationServicesOptions): string {
  const configured = options.g04RelayHmacKey ?? process.env.G04_RELAY_HMAC_KEY;
  if (configured) {
    return configured;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("G04_RELAY_HMAC_KEY must be set in production");
  }
  return "g04-relay-local-test-key";
}

export function createFoundationServices(options: FoundationServicesOptions = {}): FoundationServices {
  const audit = new AuditService();
  const authorization = new AuthorizationService();
  const serviceRegister = new ServiceRegisterService(audit);
  const employeeMaster = new EmployeeMasterService(ph03Employees(), authorization, audit, serviceRegister, new InMemoryEmployeeProfileRepository());
  // PH-10C: G13 hardening entities (E15 scan_results, E21 security_clearances, E12 document_audit,
  // E8 retention classes, E18 disposition_records) behind the repository pattern; the DI-11 scan
  // seam is injectable (fake in tests; the stub is recorded integration debt, not a scanner).
  const documentVault = new DocumentVaultService(
    ph03Documents(),
    audit,
    new InMemoryDocumentSecurityRepository(),
    options.g13ScanProvider ?? new StubScanProvider()
  );
  const authorityResolution = new AuthorityResolutionService(ph03AuthorityFacts());
  const notifications = new NotificationService();
  const workflow = new HrmsWorkflowService(authorityResolution, audit, notifications);
  const jobs = new JobService();
  // PH-07C: field sensitivity + approval routing come from the seeded config entities, never hardcoded.
  const personalDetailsRepository = new InMemoryPersonalDetailsRepository();
  const g02Config = defaultG02WorkflowConfig(ph03Ids.tenant);
  for (const entry of g02Config.catalog) {
    personalDetailsRepository.saveSensitivityCatalogEntry(entry);
  }
  personalDetailsRepository.saveApprovalMatrix(g02Config.matrix);
  const personalDetails = new PersonalDetailsService(employeeMaster, authorization, audit, workflow, documentVault, notifications, personalDetailsRepository);
  const leaveSrRelay = new LeaveSrRelayService(authorization, audit, serviceRegister, notifications, new InMemoryLeaveSrRelayRepository(), {
    hmacKey: resolveG04RelayHmacKey(options),
  });
  const leaveRepository = new InMemoryLeaveRepository();
  for (const leaveType of ph03LeaveTypes()) {
    leaveRepository.saveLeaveType(leaveType);
  }
  const leave = new LeaveService(employeeMaster, authorization, audit, workflow, leaveSrRelay, jobs, notifications, leaveRepository);
  // PH-15C: G03 operational attendance core — E1 shifts / E2 rosters (VAL-G03-SHIFT-TIMES,
  // VAL-G03-ROSTER-OVERLAP with supersede-on-publish), the E6 attendance_punches append-only
  // ledger (dedup on (device_id, source_ref), DEVICE_NOT_AUTHORIZED fail-closed device auth,
  // INVALID_PUNCH_TIME, attendance_date via the shift's date_anchor_rule), and the E11
  // comp_off_ledger (FIFO redemption, COMP_OFF_INSUFFICIENT/COMP_OFF_EXPIRED,
  // JOB-G03-COMPOFF-EXPIRE sweep) behind the repository pattern (migration 0024). Daily
  // attendance derivation stays with the PH-07D LeaveService (deriveAttendanceFromPunches wires in).
  const attendanceOps = new AttendanceOpsService(employeeMaster, authorization, audit, jobs, leave, new InMemoryAttendanceOpsRepository());
  const transfer = new TransferService(employeeMaster, authorization, audit, workflow, serviceRegister, documentVault, notifications, new InMemoryTransferRepository());
  // PH-08A: FR-015 establishment register + FR-016 qualifying-service ledger kernels behind the repository seam.
  // PH-08C: roster/refusal/probation/legal-case depth entities behind the same repository pattern.
  // PH-10D: shared with the G14 engine as the MART_ESTABLISHMENT contracted read source.
  const establishmentQslRepository = new InMemoryEstablishmentQslRepository();
  const promotion = new PromotionService(
    employeeMaster,
    authorization,
    audit,
    workflow,
    serviceRegister,
    documentVault,
    notifications,
    establishmentQslRepository,
    new InMemoryPromotionDepthRepository()
  );
  // PH-08D: G07 taxonomy/gap-contract/campaign + G08 cycle/goal/disclosure/part-period depth
  // entities behind the same repository pattern.
  const training = new TrainingService(
    employeeMaster,
    authorization,
    audit,
    workflow,
    serviceRegister,
    documentVault,
    notifications,
    new InMemoryTrainingDepthRepository()
  );
  const apar = new AparService(
    employeeMaster,
    authorization,
    audit,
    workflow,
    serviceRegister,
    documentVault,
    notifications,
    new InMemoryAparDepthRepository()
  );
  // PH-08E: G09 natural-justice chain entities (E3/E4/E14/E15/E23/E24 + DI-21 timeline chain)
  // behind the same repository pattern; the E23 competence matrix is seeded reference data.
  const g09DueProcessRepository = options.g09DueProcessRepository ?? new InMemoryG09DueProcessRepository();
  for (const rule of defaultG09CompetenceMatrix(ph03Ids.tenant)) {
    g09DueProcessRepository.saveCompetenceRule(rule);
  }
  const disciplinary = new DisciplinaryService(employeeMaster, authorization, audit, workflow, serviceRegister, documentVault, notifications, g09DueProcessRepository);
  const payroll = new PayrollService(employeeMaster, authorization, audit);
  // PH-09A: persisted, effective-dated rule substrate — G10 pay_components/pay_rules/rate_tables
  // and G11 pen_* rule tables E30-E36 behind the same repository pattern.
  const payRuleRepository = new InMemoryPayRuleRepository();
  const payRules = new PayRuleService(authorization, audit, payRuleRepository);
  // PH-09B: deterministic G10 payroll engine at BRD depth — payroll_runs/payslips/payslip_lines/
  // arrears/deduction_carryforwards over the PH-09A rule substrate, with the G03 payroll feed
  // consumed at snapshot time (FR-05) and post-lock supersede-versioning (FR-16).
  const payrollEngineRepository = new InMemoryPayrollEngineRepository();
  const payrollEngine = new PayrollEngineService(employeeMaster, authorization, audit, leave, payRuleRepository, payrollEngineRepository);
  // PH-09D: G10 compensation integration — E21 bank_disbursements + E31 disbursement_holds
  // with the FR-15 tie-out equation (ERR-G10-RECON-TIEOUT) and sign-off SoD
  // (ERR-G10-RECON-UNSIGNED), FR-09 G09 penalty-order recoveries bounded by floor + CPC s.60
  // cap (ERR-G10-RECOVERY-BARRED), E30 fnf_settlements pulling loans_advances +
  // deduction_carryforwards, and FR-23 SR postings via the G12 ingest contract (fact_key).
  const compensationIntegration = new CompensationIntegrationService(
    authorization,
    audit,
    payrollEngine,
    payrollEngineRepository,
    disciplinary,
    serviceRegister,
    new InMemoryCompensationIntegrationRepository()
  );
  // PH-15A: G10 income-tax/TDS engine — E15 tax_declarations with the full persisted FR-07
  // pipeline (regime switch recomputes every stage + per-month TDS from the payslip_lines
  // ledger, cutoff lock -> ERR-G10-SNAPSHOT-FROZEN) and E29 statutory_remittances
  // (ACCRUED -> DEPOSITED -> MATCHED) gating Form-16 Part A; Form-24Q reconciles quarterly
  // totals to the monthly TDS ledger (migration 0022). Slab/surcharge/cess/87A/std-deduction
  // values are effective-dated TAX_SLAB rate rows on the PH-09A substrate, never constants.
  const taxEngine = new TaxEngineService(employeeMaster, authorization, audit, payRuleRepository, payrollEngineRepository, new InMemoryTaxEngineRepository());
  const pensionRules = new PensionRuleService(authorization, audit, new InMemoryPensionRuleRepository());
  // PH-09C: G11 benefit records E07-E10/E41 behind the repository pattern (migration 0016);
  // the scheme-branched pension engine consumes the PH-09A rule substrate above and the
  // Rule 9 gate consumes the G09 proceedings state.
  const pensionBenefitRepository = new InMemoryPensionBenefitRepository();
  const pension = new PensionService(employeeMaster, payroll, authorization, audit, serviceRegister, documentVault, pensionRules, pensionBenefitRepository);
  const pensionBenefits = new PensionBenefitService(authorization, audit, pension, pensionRules, payroll, disciplinary, pensionBenefitRepository);
  // PH-15B: G11 FR-12 pensioner master & lifecycle (E14/E15/E26) + FR-13 revision engine
  // (E16) behind the repository pattern (migration 0023). The pen_pensioners row is created
  // ON PPO AUTHORISATION via the PensionService hook; a lapsed LC suspends the lifecycle to
  // SUSPENDED_NO_LC and holds disbursement (ERR-G11-LC-SUSPENDED); death of a SELF pensioner
  // converts to family pension through the E26 hierarchy (CONVERTED_TO_FAMILY); DA /
  // pay-commission batches compute deterministic old/new/arrear deltas and are immutable
  // once applied (ERR-G11-REVISION-IMMUTABLE).
  const pensionerLifecycleRepository = new InMemoryPensionerLifecycleRepository();
  const pensionerLifecycle = new PensionerLifecycleService(authorization, audit, pension, pensionBenefits, pensionerLifecycleRepository);
  pension.onPpoIssued((hookActor, issuedCase) => {
    pensionerLifecycle.enrolFromPpo(hookActor, issuedCase);
  });
  const pensionRevisions = new PensionRevisionService(
    authorization,
    audit,
    pensionRules,
    pensionerLifecycleRepository,
    new InMemoryPensionRevisionRepository((row) => pensionerLifecycleRepository.savePensioner(row))
  );
  // PH-09D: G11 FR-14 pre-credit account verification gate (E42) — disbursement fails
  // closed without an ACTIVE PASSED verification (ERR-G11-ACCOUNT-VERIFY, IR16); PH-15B
  // adds the FR-12 life-certificate suspension gate ahead of it.
  const pensionDisbursement = new PensionDisbursementService(authorization, audit, pension, new InMemoryPensionDisbursementRepository(), pensionerLifecycle);
  // PH-10B: G12 integrity pillars — verify + JOB-G12-INTEGRITY, Merkle anchors behind the
  // injectable RFC 3161 TSA seam (JOB-G12-ANCHOR), gap register (JOB-G12-GAPSCAN),
  // attestations, and P02-redacted certified extracts — behind the repository pattern.
  const srIntegrity = new SrIntegrityService(authorization, audit, serviceRegister, jobs, new InMemorySrIntegrityRepository(), options.g12TimestampAuthority);
  const analytics = new AnalyticsService(employeeMaster, workflow, serviceRegister, documentVault, disciplinary, payroll, pension, authorization, audit);
  // PH-10D: the real G14 analytics engine (migration 0021) — governed/versioned kpi_definitions,
  // append-only bitemporal kpi_snapshots (FR-23), JOB-G14-MART-* refresh over the seeded
  // analytics_datamarts with datamart_refresh_logs (FR-03), k-anonymity suppression_policies
  // (FR-17, default k=5), and maker-checker analytics_scope_policies (FR-04) — behind the
  // repository pattern. The seeded substrate comes from the BRD, not invented per-domain.
  const analyticsEngine = new AnalyticsEngineService(authorization, audit, jobs, leave, apar, establishmentQslRepository, new InMemoryAnalyticsEngineRepository());
  analyticsEngine.seedTenantDefaults({ tenantId: ph03Ids.tenant, entityId: ph03Ids.entity });
  const migrationStaging = new MigrationStagingService(employeeMaster);
  return {
    audit,
    authorization,
    authorityResolution,
    employeeMaster,
    personalDetails,
    leave,
    attendanceOps,
    leaveSrRelay,
    transfer,
    promotion,
    training,
    apar,
    disciplinary,
    payroll,
    payrollEngine,
    payRules,
    compensationIntegration,
    taxEngine,
    pension,
    pensionDisbursement,
    pensionRules,
    pensionBenefits,
    pensionerLifecycle,
    pensionRevisions,
    serviceRegister,
    srIntegrity,
    documentVault,
    analytics,
    analyticsEngine,
    workflow,
    jobs,
    notifications,
    migrationStaging,
  };
}
